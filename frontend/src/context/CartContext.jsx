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
 * and the UI renders the SERVER RESPONSE as the canonical cart. API
 * failures surface as error states with their HTTP status — a failure is
 * never converted into an empty bag, a local cart, or a fake success.
 *
 * Line identity: server lines keep the backend's own line id (`item.id`,
 * a hash of the productId/colour/size triple). Locally we never generate an
 * id that is sent to the server; selections are matched against lines by
 * the (productId, colour, size) triple via `findCartLine`, which resolves
 * both server lines and guest lines.
 *
 * Product data: authenticated lines are hydrated from TWO backend sources —
 * money/stock/availability come from the product projection inside the cart
 * response (the freshest server read), and the complete display shape
 * (labels, original price, imagery) from the backend-fed catalogue
 * snapshot, with the cart projection alone covering products the snapshot
 * has not loaded. Complete product records are never re-created inside
 * cart state.
 *
 * Guests (the backend has no guest cart contract): a small client-only cart
 * lives in localStorage. It is explicitly temporary client state, validated
 * server-side at checkout. Sign-in policy: the SERVER cart replaces the
 * guest view (the backend has no merge endpoint). The guest cart is never
 * sent to /cart, is preserved in storage, and is restored on sign-out —
 * nothing is lost, but guest lines are not merged into the server cart.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  findCartLine,
  getMaxQuantity,
} from "../utils/shopping";
import {
  persistGuestCart,
  restoreGuestCart,
  resolveAddIntent,
  serverCartToState,
} from "../utils/cartState";

const CartContext = createContext(null);

/** UI-only quantity ceiling for the guest cart (config, not authoritative stock). */
const guestMaximumFor = (product) => getMaxQuantity(product);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({ children }) {
  const { user } = useAuth();
  const authenticated = Boolean(user?.id) && Boolean(getAccessToken("customer"));

  const [lines, setLines] = useState(() => restoreGuestCart().lines);
  const [couponCode, setCouponCode] = useState(() => restoreGuestCart().couponCode);
  const [serverCoupon, setServerCoupon] = useState(null);
  const [couponLapsed, setCouponLapsed] = useState(false);
  const [serverTotals, setServerTotals] = useState(null);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);

  /** Guards against duplicate/concurrent mutations racing the server. */
  const mutationInFlight = useRef(false);

  // Guest persistence (never while authenticated — the server cart is canonical)
  useEffect(() => {
    if (!authenticated) persistGuestCart({ lines, couponCode });
  }, [authenticated, lines, couponCode]);

  /** Applies a successful server cart response as the canonical state. */
  const applyServerCart = useCallback((serverCart) => {
    const serverState = serverCartToState(serverCart);
    if (!serverState) return false;
    setLines(serverState.lines);
    setCouponCode(serverState.couponCode);
    setServerCoupon(serverState.coupon);
    setCouponLapsed(serverState.couponLapsed);
    setServerTotals(serverState.totals);
    setError(null);
    setErrorStatus(null);
    return true;
  }, []);

  /**
   * Authenticated: load the canonical cart from the backend.
   * Guest: restore the client-only guest cart.
   *
   * A failed load leaves `error` set — it is NEVER treated as an empty bag,
   * and the guest cart is never shown as the authenticated cart.
   */
  const loadCart = useCallback(async () => {
    if (!authenticated) {
      const guest = restoreGuestCart();
      setLines(guest.lines);
      setCouponCode(guest.couponCode);
      setServerCoupon(null);
      setCouponLapsed(false);
      setServerTotals(null);
      setError(null);
      setErrorStatus(null);
      return { ok: true };
    }
    setIsLoading(true);
    const result = await apiGetCart();
    setIsLoading(false);
    if (result.ok && result.cart) {
      applyServerCart(result.cart);
      return { ok: true };
    }
    setError(result.error ?? "Could not load your bag.");
    setErrorStatus(result.status ?? 0);
    return { ok: false, error: result.error, status: result.status };
  }, [authenticated, applyServerCart]);

  // When the user authenticates, the server cart is authoritative (no merge —
  // the backend has no merge endpoint; the guest cart stays in storage and is
  // restored on sign-out).
  useEffect(() => {
    let cancelled = false;
    if (!authenticated) {
      const guest = restoreGuestCart();
      setLines(guest.lines);
      setCouponCode(guest.couponCode);
      setServerCoupon(null);
      setCouponLapsed(false);
      setServerTotals(null);
      setError(null);
      setErrorStatus(null);
      return () => { cancelled = true; };
    }
    cancelled = false;
    setIsLoading(true);
    apiGetCart().then((result) => {
      if (cancelled) return;
      setIsLoading(false);
      if (result.ok && result.cart) {
        applyServerCart(result.cart);
      } else {
        // Backend failure stays a failure — no guest fallback, no empty success.
        setLines([]);
        setCouponCode(null);
        setServerCoupon(null);
        setServerTotals(null);
        setError(result.error ?? "Could not load your bag.");
        setErrorStatus(result.status ?? 0);
      }
    });
    return () => { cancelled = true; };
  }, [authenticated, user?.id, applyServerCart]);

  // Re-resolve lines when the catalog snapshot arrives (guest decoration and
  // authenticated fallback)
  const [catalogTick, setCatalogTick] = useState(0);
  useEffect(() => subscribeCatalog(() => setCatalogTick((t) => t + 1)), []);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const items = useMemo(() => {
    const resolved = lines.map((line) => {
      const catalogProduct = getProductById(line.productId);
      let product;
      if (line.product && catalogProduct) {
        // Both sources are backend-fed. The cart response is the freshest
        // read for money/stock; the catalogue snapshot carries the complete
        // display shape (labels, subcategory, original price). Merge with
        // the server cart values winning for anything money/stock-related.
        product = {
          ...catalogProduct,
          price: line.product.price,
          stock: line.product.stock ?? catalogProduct.stock,
          availability: line.product.availability ?? catalogProduct.availability,
          colors: line.product.colors?.length ? line.product.colors : catalogProduct.colors,
          sizes: line.product.sizes?.length ? line.product.sizes : catalogProduct.sizes,
        };
      } else {
        // Server projection alone (deep link the snapshot does not cover) or
        // catalogue snapshot alone (guest cart).
        product = line.product ?? catalogProduct;
      }
      return product ? { ...line, product } : null;
    }).filter(Boolean);
    // Fetch missing product details (guest deep links) in the background
    lines.forEach((line) => {
      if (!line.product && !getProductById(line.productId)) ensureProduct(line.productId);
    });
    return resolved;
  }, [lines, catalogTick]);

  /**
   * Authenticated totals come from the server only. Guest totals are the
   * client-side presentation calculation (re-validated at order placement).
   */
  const totals = useMemo(() => {
    if (authenticated) {
      return serverTotals ?? { subtotal: 0, productDiscount: 0, couponDiscount: 0, shipping: 0, codFee: 0, total: 0, saved: 0 };
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

    // Line matching is on the (productId, colour, size) triple. When
    // authenticated the payload carries ONLY the requested increment — the
    // backend merges the triple and clamps to stock itself.
    const intent = resolveAddIntent({
      lines,
      productId,
      selection,
      requested: selection.quantity ?? 1,
      authenticated,
    });
    if (!intent.ok) return { ok: false, message: "This piece is currently unavailable." };

    if (authenticated) {
      if (mutationInFlight.current) return { ok: false, message: "Your bag is still updating — just a moment." };
      mutationInFlight.current = true;
      setIsSyncing(true);
      const result = await apiAddCartItem(intent.payload);
      mutationInFlight.current = false;
      setIsSyncing(false);
      if (!result.ok) {
        setError(result.error);
        setErrorStatus(result.status ?? 0);
        return { ok: false, message: result.error };
      }
      applyServerCart(result.cart);
      return { ok: true, message: "Added to your collection." };
    }

    // Guest — client-only cart (stock validated server-side at checkout)
    const id = intent.guestLineId;
    const target = getProductById(productId) ?? product;
    const maximum = target ? guestMaximumFor(target) : 99;
    setLines((current) => {
      const existing = findCartLine(current, productId, selection) ??
        current.find((line) => line.id === id);
      const quantity = (existing?.quantity ?? 0) + Math.max(1, Math.floor(Number(selection.quantity) || 1));
      const capped = quantity > maximum;
      const nextQuantity = capped ? maximum : quantity;
      if (nextQuantity < 1) return current;
      const lineId = existing?.id ?? id;
      if (existing) return current.map((e) => e.id === lineId ? { ...e, quantity: nextQuantity } : e);
      return [...current, { id: lineId, productId, color: selection.color ?? null, size: selection.size ?? null, quantity: nextQuantity, addedAt: Date.now() }];
    });
    return { ok: true, message: "Added to your collection." };
  }, [authenticated, lines, applyServerCart]);

  const removeFromCart = useCallback(async (lineId) => {
    if (authenticated) {
      if (mutationInFlight.current) return { ok: false, message: "Your bag is still updating — just a moment." };
      mutationInFlight.current = true;
      setIsSyncing(true);
      // lineId is the server line id from the cart response.
      const result = await apiRemoveCartItem(lineId);
      mutationInFlight.current = false;
      setIsSyncing(false);
      if (!result.ok) {
        setError(result.error);
        setErrorStatus(result.status ?? 0);
        return { ok: false, message: result.error };
      }
      applyServerCart(result.cart);
      return { ok: true };
    }
    setLines((current) => current.filter((line) => line.id !== lineId));
    return { ok: true };
  }, [authenticated, applyServerCart]);

  const updateCartQuantity = useCallback(async (lineId, quantity) => {
    if (authenticated) {
      if (mutationInFlight.current) return { ok: false, message: "Your bag is still updating — just a moment." };
      mutationInFlight.current = true;
      setIsSyncing(true);
      const result = await apiUpdateCartItem(lineId, Number(quantity));
      mutationInFlight.current = false;
      setIsSyncing(false);
      if (!result.ok) {
        setError(result.error);
        setErrorStatus(result.status ?? 0);
        return { ok: false, message: result.error };
      }
      applyServerCart(result.cart);
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
  }, [authenticated, applyServerCart]);

  const clearCart = useCallback(async () => {
    if (authenticated) {
      if (mutationInFlight.current) return { ok: false, message: "Your bag is still updating — just a moment." };
      mutationInFlight.current = true;
      setIsSyncing(true);
      const result = await apiClearCart();
      mutationInFlight.current = false;
      setIsSyncing(false);
      if (!result.ok) {
        setError(result.error);
        setErrorStatus(result.status ?? 0);
        return { ok: false, message: result.error };
      }
      setLines([]);
      setCouponCode(null);
      setServerCoupon(null);
      setCouponLapsed(false);
      setServerTotals(null);
      setError(null);
      setErrorStatus(null);
      return { ok: true };
    }
    setLines([]);
    setCouponCode(null);
    return { ok: true };
  }, [authenticated]);

  /**
   * Held quantity for a product selection. Matching is on the
   * (productId, colour, size) triple — the backend's own line identity — so
   * it resolves server lines (hashed ids) and guest lines alike.
   */
  const getCartItemQuantity = useCallback((product, selection = null) => {
    const productId = typeof product === "string" ? product : product?.id;
    if (!productId) return 0;
    if (selection) {
      return findCartLine(lines, productId, selection)?.quantity ?? 0;
    }
    return lines.filter((item) => item.productId === productId).reduce((total, item) => total + item.quantity, 0);
  }, [lines]);

  const applyCoupon = useCallback(async (code) => {
    if (!code || typeof code !== "string") {
      return { ok: false, message: "Enter a coupon code." };
    }
    if (authenticated) {
      if (mutationInFlight.current) return { ok: false, message: "Your bag is still updating — just a moment." };
      mutationInFlight.current = true;
      setIsSyncing(true);
      const result = await apiApplyCoupon(code);
      setIsSyncing(false);
      if (!result.ok) {
        mutationInFlight.current = false;
        setError(result.error);
        setErrorStatus(result.status ?? 0);
        return { ok: false, message: result.error };
      }
      // Refresh the canonical cart — the server owns coupon state and totals.
      const cart = await apiGetCart();
      mutationInFlight.current = false;
      if (cart.ok && cart.cart) {
        applyServerCart(cart.cart);
        return { ok: true, coupon: result.coupon, message: result.message ?? `${code} is now part of your order.` };
      }
      setError(cart.error ?? "Could not load your bag.");
      setErrorStatus(cart.status ?? 0);
      return { ok: false, message: cart.error ?? "The offer was applied, but your bag could not be refreshed." };
    }

    // Guest — validate against the backend, keep only a valid code client-side
    const result = await apiValidateOfferCode({ code });
    if (!result.ok) return { ok: false, message: result.error };
    setCouponCode(code);
    return { ok: true, coupon: result.offer, message: result.message || `${code} is now part of your order.` };
  }, [authenticated, applyServerCart]);

  const removeCoupon = useCallback(async () => {
    if (authenticated) {
      if (mutationInFlight.current) return { ok: false, message: "Your bag is still updating — just a moment." };
      mutationInFlight.current = true;
      const result = await apiRemoveCoupon();
      if (!result.ok) {
        mutationInFlight.current = false;
        setError(result.error);
        setErrorStatus(result.status ?? 0);
        return { ok: false, message: result.error };
      }
      // Canonical refresh after the mutation.
      const cart = await apiGetCart();
      mutationInFlight.current = false;
      if (cart.ok && cart.cart) {
        applyServerCart(cart.cart);
        return { ok: true };
      }
      setError(cart.error ?? "Could not load your bag.");
      setErrorStatus(cart.status ?? 0);
      return { ok: false, message: cart.error ?? "The offer was removed, but your bag could not be refreshed." };
    }
    setCouponCode(null);
    return { ok: true };
  }, [authenticated, applyServerCart]);

  const openDrawer  = useCallback(() => setDrawerOpen(true),  []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // ---------------------------------------------------------------------------
  const value = useMemo(() => ({
    items, count, totals,
    coupon: couponCode
      ? (serverCoupon ?? { code: couponCode })
      : null,
    couponCode,
    couponLapsed,
    /** True while the authenticated cart has not been confirmed by the server. */
    isLoading,
    /** True while a cart mutation is in flight (disables duplicate mutations). */
    isSyncing,
    error, errorStatus,
    addToCart, removeFromCart, updateCartQuantity, clearCart,
    getCartItemQuantity, applyCoupon, removeCoupon,
    refreshCart: loadCart,
    isDrawerOpen, openDrawer, closeDrawer,
  }), [items, count, totals, couponCode, serverCoupon, couponLapsed, isLoading,
      isSyncing, error, errorStatus, addToCart, removeFromCart,
      updateCartQuantity, clearCart, getCartItemQuantity, applyCoupon, removeCoupon,
      loadCart, isDrawerOpen, openDrawer, closeDrawer]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext) ?? {
    items: [], count: 0, totals: calculateCartTotals([]), coupon: null,
    couponCode: null, couponLapsed: false, isLoading: false, isSyncing: false,
    error: null, errorStatus: null,
    addToCart:           () => ({ ok: false, message: "" }),
    removeFromCart:      () => ({ ok: false, message: "" }),
    updateCartQuantity:  () => ({ ok: false, message: "" }),
    clearCart:           () => ({ ok: false, message: "" }),
    getCartItemQuantity: () => 0,
    applyCoupon:         () => ({ ok: false, message: "" }),
    removeCoupon:        () => ({ ok: false, message: "" }),
    refreshCart:         () => ({ ok: false }),
    isDrawerOpen: false, openDrawer: () => {}, closeDrawer: () => {},
  };
}

export default CartContext;
