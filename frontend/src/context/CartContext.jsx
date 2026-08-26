/**
 * PRATIKSHYA FASHON — The bag (backend-authoritative).
 *
 * Authenticated customers: the backend owns cart state, quantities, pricing,
 * coupon application and stock validation. Every mutation goes through
 *    GET    /cart
 *    POST   /cart/items
 *    PATCH  /cart/items/{lineId}
 *    DELETE /cart/items/{lineId}
 *    DELETE /cart
 *    POST   /cart/coupon
 *    DELETE /cart/coupon
 * and the UI renders the server response. API failures surface as errors —
 * never demo products, never local stock decisions.
 *
 * Guests (the backend has no guest cart contract): a small client-only cart
 * lives in localStorage. It is explicitly temporary client state, validated
 * server-side at checkout.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { getAccessToken } from "../services/api/apiClient";
import { apiValidateOfferCode } from "../services/api/offersApi";
import {
  apiGetCart,
  apiAddCartItem,
  apiUpdateCartItem,
  apiRemoveCartItem,
  apiClearCart,
  apiApplyCoupon,
  apiRemoveCoupon,
} from "../services/api/cartApi";
import {
  getProductById,
  ensureProduct,
} from "../services/catalog/catalogStore";
import { subscribeCatalog } from "../services/catalog/catalogStore";
import {
  calculateCartTotals,
  cartLineId,
  CART_STORAGE_KEY,
  getMaxQuantity,
  readStorage,
  writeStorage,
} from "../utils/shopping";

const CartContext = createContext(null);

/** UI-only quantity ceiling for the guest cart (config, not authoritative stock). */
const guestMaximumFor = (product) => getMaxQuantity(product);

// ---------------------------------------------------------------------------
// Guest cart (client-only)
// ---------------------------------------------------------------------------

const restoreGuestCart = () => {
  const stored = readStorage(CART_STORAGE_KEY, null);
  const rawLines = Array.isArray(stored?.lines) ? stored.lines : [];
  const byId = new Map();
  rawLines.forEach((line) => {
    if (!line || typeof line !== "object" || !line.productId) return;
    const id = cartLineId(line.productId, {
      color: typeof line.color === "string" ? line.color : null,
      size:  typeof line.size  === "string" ? line.size  : null,
    });
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    byId.set(id, {
      id, productId: line.productId,
      color: typeof line.color === "string" ? line.color : null,
      size: typeof line.size === "string" ? line.size : null,
      quantity,
      addedAt: Number(line.addedAt) || Date.now(),
    });
  });
  return {
    lines: [...byId.values()],
    couponCode: typeof stored?.coupon === "string" ? stored.coupon : null,
    totals: null, // guest totals are display-only, recomputed client-side
  };
};

const persistGuestCart = (state) => {
  writeStorage(CART_STORAGE_KEY, { lines: state.lines, coupon: state.couponCode });
};

// ---------------------------------------------------------------------------
// Server cart → frontend state
// ---------------------------------------------------------------------------

function serverCartToState(serverCart) {
  if (!serverCart) return null;
  return {
    lines: (serverCart.lines ?? serverCart.items ?? []).map((item) => ({
      id:        item.id,
      productId: item.product_id ?? item.productId,
      color:     item.color ?? null,
      size:      item.size  ?? null,
      quantity:  item.quantity,
      addedAt:   item.added_at ?? item.addedAt ?? Date.now(),
    })).filter((l) => l.productId),
    couponCode: serverCart.couponCode ?? serverCart.coupon?.code ?? null,
    totals:     serverCart.totals ?? null,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({ children }) {
  const { user } = useAuth();
  const authenticated = Boolean(user?.id) && Boolean(getAccessToken("customer"));

  const [lines, setLines] = useState(() => restoreGuestCart().lines);
  const [couponCode, setCouponCode] = useState(() => restoreGuestCart().couponCode);
  const [serverTotals, setServerTotals] = useState(null);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);

  // Guest persistence
  useEffect(() => {
    if (!authenticated) persistGuestCart({ lines, couponCode });
  }, [authenticated, lines, couponCode]);

  // When the user authenticates, the server cart is authoritative
  useEffect(() => {
    if (!authenticated) {
      const guest = restoreGuestCart();
      setLines(guest.lines);
      setCouponCode(guest.couponCode);
      setServerTotals(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsSyncing(true);
    apiGetCart().then((result) => {
      if (cancelled) return;
      setIsSyncing(false);
      if (result.ok && result.cart) {
        const serverState = serverCartToState(result.cart);
        if (serverState) {
          setLines(serverState.lines);
          setCouponCode(serverState.couponCode);
          setServerTotals(serverState.totals);
          setError(null);
        }
      } else {
        setError(result.error ?? "Could not load your bag.");
      }
    });
    return () => { cancelled = true; };
  }, [authenticated, user?.id]);

  // Re-resolve guest lines when the catalog snapshot arrives
  const [catalogTick, setCatalogTick] = useState(0);
  useEffect(() => subscribeCatalog(() => setCatalogTick((t) => t + 1)), []);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const items = useMemo(() => {
    const resolved = lines.map((line) => {
      const product = getProductById(line.productId);
      return product ? { ...line, product } : null;
    }).filter(Boolean);
    // Fetch missing product details (deep links) in the background
    lines.forEach((line) => {
      if (!getProductById(line.productId)) ensureProduct(line.productId);
    });
    return resolved;
  }, [lines, catalogTick]);

  const totals = useMemo(() => {
    if (authenticated) {
      return serverTotals ?? { subtotal: 0, shipping: 0, codFee: 0, total: 0, saved: 0 };
    }
    return calculateCartTotals(items, couponCode ? { code: couponCode } : null);
  }, [authenticated, serverTotals, items, couponCode]);

  const count = useMemo(() => lines.reduce((total, line) => total + line.quantity, 0), [lines]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const addToCart = useCallback(async (product, selection = {}) => {
    const productId = typeof product === "string" ? product : product?.id;
    if (!productId) return { ok: false, message: "This piece is currently unavailable." };

    const requested = Math.max(1, Math.floor(Number(selection.quantity) || 1));
    const id = cartLineId(productId, selection);
    const existing = lines.find((line) => line.id === id);
    const quantity = (existing?.quantity ?? 0) + requested;

    if (authenticated) {
      setIsSyncing(true);
      const result = await apiAddCartItem({ productId, color: selection.color, size: selection.size, quantity });
      setIsSyncing(false);
      if (!result.ok) { setError(result.error); return { ok: false, message: result.error }; }
      const serverState = serverCartToState(result.cart);
      if (serverState) {
        setLines(serverState.lines);
        setCouponCode(serverState.couponCode);
        setServerTotals(serverState.totals);
      }
      setError(null);
      return { ok: true, message: "Added to your collection." };
    }

    // Guest — client-only cart (stock validated server-side at checkout)
    const target = getProductById(productId) ?? product;
    const maximum = target ? guestMaximumFor(target) : 99;
    const capped = quantity > maximum;
    const nextQuantity = capped ? maximum : quantity;
    if (nextQuantity < 1) return { ok: false, message: "This piece is currently unavailable." };

    setLines((current) => {
      const line = current.find((e) => e.id === id);
      if (line) return current.map((e) => e.id === id ? { ...e, quantity: nextQuantity } : e);
      return [...current, { id, productId, color: selection.color ?? null, size: selection.size ?? null, quantity: nextQuantity, addedAt: Date.now() }];
    });
    return capped
      ? { ok: true, message: "The requested quantity exceeds the per-piece limit — your bag was adjusted." }
      : { ok: true, message: "Added to your collection." };
  }, [authenticated, lines]);

  const removeFromCart = useCallback(async (lineId) => {
    if (authenticated) {
      setIsSyncing(true);
      const result = await apiRemoveCartItem(lineId);
      setIsSyncing(false);
      if (!result.ok) { setError(result.error); return { ok: false, message: result.error }; }
      const serverState = serverCartToState(result.cart);
      if (serverState) {
        setLines(serverState.lines);
        setCouponCode(serverState.couponCode);
        setServerTotals(serverState.totals);
      }
      setError(null);
      return { ok: true };
    }
    setLines((current) => current.filter((line) => line.id !== lineId));
    return { ok: true };
  }, [authenticated]);

  const updateCartQuantity = useCallback(async (lineId, quantity) => {
    if (authenticated) {
      setIsSyncing(true);
      const result = await apiUpdateCartItem(lineId, Number(quantity));
      setIsSyncing(false);
      if (!result.ok) { setError(result.error); return { ok: false, message: result.error }; }
      const serverState = serverCartToState(result.cart);
      if (serverState) {
        setLines(serverState.lines);
        setCouponCode(serverState.couponCode);
        setServerTotals(serverState.totals);
      }
      setError(null);
      return { ok: true };
    }
    setLines((current) => {
      if (Number(quantity) < 1) return current.filter((line) => line.id !== lineId);
      const line = current.find((entry) => entry.id === lineId);
      if (!line) return current;
      const product = getProductById(line.productId);
      const maximum = product ? guestMaximumFor(product) : 99;
      const next = Math.min(maximum, Math.max(1, Math.floor(Number(quantity) || 1)));
      return current.map((entry) => entry.id === lineId ? { ...entry, quantity: next } : entry);
    });
    return { ok: true };
  }, [authenticated]);

  const clearCart = useCallback(async () => {
    if (authenticated) {
      setIsSyncing(true);
      const result = await apiClearCart();
      setIsSyncing(false);
      if (!result.ok) { setError(result.error); return { ok: false, message: result.error }; }
      setLines([]);
      setCouponCode(null);
      setServerTotals(null);
      setError(null);
      return { ok: true };
    }
    setLines([]);
    setCouponCode(null);
    return { ok: true };
  }, [authenticated]);

  const getCartItemQuantity = useCallback((product, selection = null) => {
    const productId = typeof product === "string" ? product : product?.id;
    if (!productId) return 0;
    if (selection) {
      const id = cartLineId(productId, selection);
      return lines.find((item) => item.id === id)?.quantity ?? 0;
    }
    return lines.filter((item) => item.productId === productId).reduce((total, item) => total + item.quantity, 0);
  }, [lines]);

  const applyCoupon = useCallback(async (code) => {
    if (!code || typeof code !== "string") {
      return { ok: false, message: "Enter a coupon code." };
    }
    if (authenticated) {
      setIsSyncing(true);
      const result = await apiApplyCoupon(code);
      setIsSyncing(false);
      if (!result.ok) { setError(result.error); return { ok: false, message: result.error }; }
      const cart = await apiGetCart();
      if (cart.ok && cart.cart) {
        const serverState = serverCartToState(cart.cart);
        if (serverState) {
          setLines(serverState.lines);
          setCouponCode(serverState.couponCode);
          setServerTotals(serverState.totals);
        }
      }
      setError(null);
      return { ok: true, coupon: result.coupon, message: result.message ?? `${code} is now part of your order.` };
    }

    // Guest — validate against the backend, keep only a valid code client-side
    const result = await apiValidateOfferCode({ code });
    if (!result.ok) return { ok: false, message: result.error };
    setCouponCode(code);
    return { ok: true, coupon: result.offer, message: result.message || `${code} is now part of your order.` };
  }, [authenticated]);

  const removeCoupon = useCallback(async () => {
    if (authenticated) {
      const result = await apiRemoveCoupon();
      if (!result.ok) { setError(result.error); return { ok: false, message: result.error }; }
      setCouponCode(null);
      const cart = await apiGetCart();
      if (cart.ok && cart.cart) {
        const serverState = serverCartToState(cart.cart);
        if (serverState) setServerTotals(serverState.totals);
      }
      return { ok: true };
    }
    setCouponCode(null);
    return { ok: true };
  }, [authenticated]);

  const openDrawer  = useCallback(() => setDrawerOpen(true),  []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // ---------------------------------------------------------------------------
  const value = useMemo(() => ({
    items, count, totals, coupon: couponCode ? { code: couponCode } : null,
    couponCode,
    couponLapsed: false,
    isSyncing, error,
    addToCart, removeFromCart, updateCartQuantity, clearCart,
    getCartItemQuantity, applyCoupon, removeCoupon,
    isDrawerOpen, openDrawer, closeDrawer,
  }), [items, count, totals, couponCode, isSyncing, error, addToCart, removeFromCart,
      updateCartQuantity, clearCart, getCartItemQuantity, applyCoupon, removeCoupon,
      isDrawerOpen, openDrawer, closeDrawer]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext) ?? {
    items: [], count: 0, totals: calculateCartTotals([]), coupon: null,
    couponCode: null, couponLapsed: false, isSyncing: false, error: null,
    addToCart:           () => ({ ok: false, message: "" }),
    removeFromCart:      () => ({ ok: false, message: "" }),
    updateCartQuantity:  () => ({ ok: false, message: "" }),
    clearCart:           () => ({ ok: false, message: "" }),
    getCartItemQuantity: () => 0,
    applyCoupon:         () => ({ ok: false, message: "" }),
    removeCoupon:        () => ({ ok: false, message: "" }),
    isDrawerOpen: false, openDrawer: () => {}, closeDrawer: () => {},
  };
}

export default CartContext;
