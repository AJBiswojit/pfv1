import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { load, save } from '../services/storage.js';
import { getProductById } from '../services/catalog.js';
import { findPromotionByCode } from '../data/index.js';

const ShopContext = createContext(null);
const KEY = 'aarna:shop:v1';

const initial = { cart: [], wishlist: [], promoCode: null };

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const key = `${action.id}::${action.option || ''}`;
      const existing = state.cart.find((l) => l.key === key);
      const cart = existing
        ? state.cart.map((l) => (l.key === key ? { ...l, qty: Math.min(l.qty + action.qty, 10) } : l))
        : [...state.cart, { key, id: action.id, option: action.option || null, qty: action.qty }];
      return { ...state, cart };
    }
    case 'qty':
      return { ...state, cart: state.cart.map((l) => (l.key === action.key ? { ...l, qty: Math.max(1, Math.min(10, action.qty)) } : l)) };
    case 'remove':
      return { ...state, cart: state.cart.filter((l) => l.key !== action.key) };
    case 'wish':
      return {
        ...state,
        wishlist: state.wishlist.includes(action.id) ? state.wishlist.filter((x) => x !== action.id) : [...state.wishlist, action.id],
      };
    case 'promo':
      return { ...state, promoCode: action.code };
    case 'clear':
      return { ...state, cart: [] };
    default:
      return state;
  }
}

export function ShopProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial, () => {
    const stored = load(KEY, initial);
    // Drop any lines whose products no longer exist in the catalogue.
    return { ...initial, ...stored, cart: (stored.cart || []).filter((l) => getProductById(l.id)) };
  });

  useEffect(() => save(KEY, state), [state]);

  const addToCart = useCallback((id, option = null, qty = 1) => dispatch({ type: 'add', id, option, qty }), []);
  const setQty = useCallback((key, qty) => dispatch({ type: 'qty', key, qty }), []);
  const removeLine = useCallback((key) => dispatch({ type: 'remove', key }), []);
  const toggleWish = useCallback((id) => dispatch({ type: 'wish', id }), []);
  const applyPromo = useCallback((code) => {
    const promo = findPromotionByCode(code);
    if (!promo) return { ok: false, message: 'This code is not valid or has expired.' };
    dispatch({ type: 'promo', code: promo.code });
    return { ok: true, promo };
  }, []);
  const removePromo = useCallback(() => dispatch({ type: 'promo', code: null }), []);
  const clearCart = useCallback(() => dispatch({ type: 'clear' }), []);

  const lines = useMemo(
    () => state.cart.map((l) => ({ ...l, product: getProductById(l.id) })).filter((l) => l.product),
    [state.cart],
  );

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.product.price * l.qty, 0);
    const promo = state.promoCode ? findPromotionByCode(state.promoCode) : null;
    let discount = 0;
    if (promo) {
      const eligible = lines.filter((l) => l.product.collections.includes(promo.eligibleCollection));
      discount = Math.round(eligible.reduce((s, l) => s + l.product.price * l.qty, 0) * (promo.discountPercent / 100));
    }
    return { subtotal, discount, total: subtotal - discount, promo, count: lines.reduce((s, l) => s + l.qty, 0) };
  }, [lines, state.promoCode]);

  const value = useMemo(
    () => ({
      lines, totals, wishlist: state.wishlist, promoCode: state.promoCode,
      addToCart, setQty, removeLine, toggleWish, applyPromo, removePromo, clearCart,
      isWished: (id) => state.wishlist.includes(id),
    }),
    [lines, totals, state.wishlist, state.promoCode, addToCart, setQty, removeLine, toggleWish, applyPromo, removePromo, clearCart],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export const useShop = () => {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside ShopProvider');
  return ctx;
};
