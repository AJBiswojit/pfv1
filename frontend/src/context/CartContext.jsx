/**
 * PRATIKSHYA FASHON — The bag (Phase B wired)
 *
 * Strategy:
 *   - Guest (no token)  → pure localStorage cart (existing behaviour)
 *   - Authenticated     → sync every mutation to backend; localStorage is a
 *                         local echo so the UI never waits for a network round-trip
 *
 * Backend endpoints (all require customer JWT):
 *   GET    /cart
 *   POST   /cart/items
 *   PATCH  /cart/items/{lineId}
 *   DELETE /cart/items/{lineId}
 *   DELETE /cart
 *   POST   /cart/coupon
 *   DELETE /cart/coupon
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getProductById } from "../data/products";
import { getCoupon, validateCoupon } from "../data/shopping/coupons";
import { useAuth } from "./AuthContext";
import { getAccessToken } from "../services/api/apiClient";
import {
  apiGetCart,
  apiAddCartItem,
  apiUpdateCartItem,
  apiRemoveCartItem,
  apiClearCart,
  apiApplyCoupon,
  apiRemoveCoupon,
} from "../services/api/cartApi";
import inventoryRepository, { INVENTORY_CHANGED_EVENT } from "../services/inventory/inventoryRepository";
import { PRODUCTS_CHANGED_EVENT } from "../services/catalogRepository";
import { OFFERS_CHANGED_EVENT } from "../services/offers/offerRepository";
import {
  calculateCartTotals,
  cartLineId,
  CART_STORAGE_KEY,
  getMaxQuantity,
  readStorage,
  writeStorage,
} from "../utils/shopping";

const CartContext = createContext(null);

const maximumFor = (product, selection = {}) => {
  const availability = inventoryRepository.getCustomerAvailability(product, selection);
  if (availability.tracked) return availability.available;
  return availability.status === "UNAVAILABLE" ? 0 : getMaxQuantity(product);
};

const clampFor = (product, selection, quantity) => {
  const maximum = maximumFor(product, selection);
  if (maximum <= 0) return 0;
  return Math.min(maximum, Math.max(1, Math.floor(Number(quantity) || 1)));
};

// ---------------------------------------------------------------------------
// Restore cart from localStorage (guest or fallback)
// ---------------------------------------------------------------------------
const restoreCart = () => {
  const stored = readStorage(CART_STORAGE_KEY, null);
  const rawLines = Array.isArray(stored?.lines) ? stored.lines : [];
  const byId = new Map();
  rawLines.forEach((line) => {
    if (!line || typeof line !== "object") return;
    const product = getProductById(line.productId);
    if (!product) return;
    const color = typeof line.color === "string" ? line.color : null;
    const size  = typeof line.size  === "string" ? line.size  : null;
    const id = cartLineId(product.id, { color, size });
    const quantity = clampFor(product, { color, size }, (byId.get(id)?.quantity ?? 0) + (Number(line.quantity) || 0));
    if (quantity < 1) return;
    byId.set(id, { id, productId: product.id, color, size, quantity, addedAt: Number(line.addedAt) || Date.now() });
  });
  const couponCode = typeof stored?.coupon === "string" ? stored.coupon : null;
  return {
    lines:      [...byId.values()],
    couponCode: couponCode && getCoupon(couponCode) ? couponCode : null,
  };
};

// ---------------------------------------------------------------------------
// Convert server cart response to frontend lines format
// ---------------------------------------------------------------------------
function serverCartToState(serverCart) {
  if (!serverCart) return null;
  const lines = (serverCart.lines ?? serverCart.items ?? []).map((item) => ({
    id:        item.id,
    productId: item.product_id ?? item.productId,
    color:     item.color ?? null,
    size:      item.size  ?? null,
    quantity:  item.quantity,
    addedAt:   item.added_at ?? item.addedAt ?? Date.now(),
  })).filter((l) => l.productId);

  return {
    lines,
    couponCode: serverCart.couponCode ?? serverCart.coupon?.code ?? null,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function CartProvider({ children }) {
  const { user } = useAuth();
  const [{ lines, couponCode }, setState] = useState(restoreCart);
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Invalidate on external changes
  useEffect(() => {
    const refresh = () => setInventoryRevision((v) => v + 1);
    window.addEventListener(INVENTORY_CHANGED_EVENT, refresh);
    window.addEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    window.addEventListener(OFFERS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(INVENTORY_CHANGED_EVENT, refresh);
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, refresh);
      window.removeEventListener(OFFERS_CHANGED_EVENT, refresh);
    };
  }, []);

  // Persist to localStorage
  useEffect(() => {
    writeStorage(CART_STORAGE_KEY, { lines, coupon: couponCode });
  }, [lines, couponCode]);

  // When user authenticates, pull the server cart
  useEffect(() => {
    if (!user?.id || !getAccessToken()) return;
    setIsSyncing(true);
    apiGetCart().then((result) => {
      setIsSyncing(false);
      if (result.ok && result.cart) {
        const serverState = serverCartToState(result.cart);
        if (serverState) setState(serverState);
      }
    });
  }, [user?.id]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------
  const items = useMemo(
    () =>
      lines.map((line) => {
        const product = getProductById(line.productId);
        if (!product) return null;
        return { ...line, product, maximum: maximumFor(product, line), lineTotal: product.price * line.quantity };
      }).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, inventoryRevision]
  );

  const coupon = useMemo(() => (couponCode ? getCoupon(couponCode) : null), [couponCode]);

  const couponState = useMemo(() => {
    if (!coupon) return { active: false, lapsed: false };
    const result = validateCoupon(coupon.code, items, { customerId: user?.id, customerEmail: user?.email });
    return { active: result.ok, lapsed: !result.ok };
  }, [coupon, items, user?.id, user?.email]);

  const totals = useMemo(
    () => calculateCartTotals(items, couponState.active ? coupon : null),
    [items, coupon, couponState]
  );

  const count = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items]
  );

  // ---------------------------------------------------------------------------
  // Actions — optimistic local update + background sync
  // ---------------------------------------------------------------------------

  const addToCart = useCallback(
    async (product, selection = {}) => {
      if (!product?.id || !getProductById(product.id)) {
        return { ok: false, message: "This piece is currently unavailable." };
      }
      const maximum = maximumFor(product, selection);
      if (maximum === 0) return { ok: false, message: "This piece is currently unavailable." };

      const requested = Math.max(1, Math.floor(Number(selection.quantity) || 1));
      const id        = cartLineId(product.id, selection);
      const existing  = lines.find((line) => line.id === id);
      const held      = existing?.quantity ?? 0;

      if (held >= maximum) {
        return { ok: false, message: "Your bag already holds the maximum quantity currently available." };
      }

      const quantity = Math.min(maximum, held + requested);
      const capped   = quantity < held + requested;

      // Optimistic local update
      setState((current) => {
        const line = current.lines.find((e) => e.id === id);
        if (line) {
          return { ...current, lines: current.lines.map((e) => e.id === id ? { ...e, quantity } : e) };
        }
        return {
          ...current,
          lines: [...current.lines, { id, productId: product.id, color: selection.color ?? null, size: selection.size ?? null, quantity, addedAt: Date.now() }],
        };
      });

      // Backend sync (non-blocking)
      if (user?.id && getAccessToken()) {
        apiAddCartItem({ productId: product.id, color: selection.color, size: selection.size, quantity }).then((result) => {
          if (result.ok && result.cart) {
            const serverState = serverCartToState(result.cart);
            if (serverState) setState(serverState);
          }
        });
      }

      return capped
        ? { ok: true, message: "The requested quantity exceeds current availability — your bag was adjusted." }
        : { ok: true, message: "Added to your collection." };
    },
    [lines, user?.id]
  );

  const removeFromCart = useCallback((lineId) => {
    setState((current) => ({ ...current, lines: current.lines.filter((line) => line.id !== lineId) }));
    if (user?.id && getAccessToken()) {
      apiRemoveCartItem(lineId).then((result) => {
        if (result.ok && result.cart) {
          const serverState = serverCartToState(result.cart);
          if (serverState) setState(serverState);
        }
      });
    }
  }, [user?.id]);

  const updateCartQuantity = useCallback((lineId, quantity) => {
    setState((current) => {
      if (Number(quantity) < 1) {
        return { ...current, lines: current.lines.filter((line) => line.id !== lineId) };
      }
      return {
        ...current,
        lines: current.lines.map((line) => {
          if (line.id !== lineId) return line;
          const product = getProductById(line.productId);
          const next    = product ? clampFor(product, line, quantity) : 0;
          return next > 0 ? { ...line, quantity: next } : line;
        }),
      };
    });

    if (user?.id && getAccessToken()) {
      apiUpdateCartItem(lineId, Number(quantity)).then((result) => {
        if (result.ok && result.cart) {
          const serverState = serverCartToState(result.cart);
          if (serverState) setState(serverState);
        }
      });
    }
  }, [user?.id]);

  const clearCart = useCallback(() => {
    setState({ lines: [], couponCode: null });
    if (user?.id && getAccessToken()) {
      apiClearCart();
    }
  }, [user?.id]);

  const getCartItemQuantity = useCallback((product, selection = null) => {
    const productId = typeof product === "string" ? product : product?.id;
    if (!productId) return 0;
    if (selection) {
      const id = cartLineId(productId, selection);
      return items.find((item) => item.id === id)?.quantity ?? 0;
    }
    return items.filter((item) => item.productId === productId).reduce((total, item) => total + item.quantity, 0);
  }, [items]);

  const applyCoupon = useCallback(
    async (code) => {
      // Always validate locally first (instant feedback)
      const result = validateCoupon(code, items, {
        appliedCode: couponCode, customerId: user?.id, customerEmail: user?.email,
      });
      if (!result.ok) return result;

      setState((current) => ({ ...current, couponCode: result.coupon.code }));

      // Sync to backend
      if (user?.id && getAccessToken()) {
        const apiResult = await apiApplyCoupon(code);
        if (!apiResult.ok) {
          setState((current) => ({ ...current, couponCode: null }));
          return { ok: false, error: apiResult.error };
        }
        return { ok: true, coupon: result.coupon, message: apiResult.message ?? `${result.coupon.code} is now part of your order.` };
      }

      return { ok: true, coupon: result.coupon, message: `${result.coupon.code} is now part of your order.` };
    },
    [items, couponCode, user?.id, user?.email]
  );

  const removeCoupon = useCallback(() => {
    setState((current) => ({ ...current, couponCode: null }));
    if (user?.id && getAccessToken()) apiRemoveCoupon();
  }, [user?.id]);

  const openDrawer  = useCallback(() => setDrawerOpen(true),  []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // ---------------------------------------------------------------------------
  const value = useMemo(() => ({
    items, count, totals, coupon,
    couponLapsed: couponState.lapsed,
    isSyncing,
    addToCart, removeFromCart, updateCartQuantity, clearCart,
    getCartItemQuantity, applyCoupon, removeCoupon,
    isDrawerOpen, openDrawer, closeDrawer,
  }), [items, count, totals, coupon, couponState, isSyncing, addToCart, removeFromCart, updateCartQuantity, clearCart, getCartItemQuantity, applyCoupon, removeCoupon, isDrawerOpen, openDrawer, closeDrawer]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext) ?? {
    items: [], count: 0, totals: calculateCartTotals([]), coupon: null,
    couponLapsed: false, isSyncing: false,
    addToCart:           () => ({ ok: false, message: "" }),
    removeFromCart:      () => {},
    updateCartQuantity:  () => {},
    clearCart:           () => {},
    getCartItemQuantity: () => 0,
    applyCoupon:         () => ({ ok: false, message: "" }),
    removeCoupon:        () => {},
    isDrawerOpen: false, openDrawer: () => {}, closeDrawer: () => {},
  };
}

export default CartContext;
