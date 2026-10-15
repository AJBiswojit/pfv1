/**
 * PRATIKSHYA FASHION — PHASE 2D · the shopping boundary.
 *
 * ADAPTED AT THE BOUNDARY.
 *
 * The design's `state/ShopContext.jsx` is a prototype shop: a reducer over
 * `localStorage`, line keys of its own making, a discount computed from the
 * design's sample offer, and a wishlist held as an array of ids. This
 * application already owns all of that — a server-backed cart, coupons the
 * offers register validates, and a wishlist that follows the account — so the
 * port does not open a second shop. It exposes the design's `useShop()` shape
 * over the application's state, and every ported component (the drawer, the
 * cards, the offer band, the bag button) keeps working unchanged:
 *
 *   design              ←  this application
 *   lines[key,id,option,qty,product]  ←  cart.items[line.id, product, colour+size]
 *   totals{subtotal,discount,total,count,promo,priced}
 *                       ←  cart.totals{subtotal,couponDiscount,total} + coupon
 *                          (`priced` = the totals came from the server, not
 *                           from the guest presentation calculation)
 *   wishlist[]          ←  WishlistContext.saved
 *   addToCart(id, option, qty)
 *                       ←  cart.addToCart(product, {size|colour, quantity})
 *   setQty(key, qty)    ←  cart.updateCartQuantity(lineId, quantity)
 *   removeLine(key)     ←  cart.removeFromCart(lineId)
 *   applyPromo(code)    ←  cart.applyCoupon(code)
 *   removePromo()       ←  cart.removeCoupon()
 *   toggleWish(id)      ←  wishlist.toggle(id)
 *
 * Notes a reviewer will want:
 *
 *   · `totals.discount` is the COUPON discount only — the design's drawer has
 *     one discount row and calls it the offer's. Product-level savings live on
 *     each line's `compareAt`, as they do in the design.
 *   · `totals.total` is this application's payable total (shipping included
 *     when the shipping rules charge it), never a second calculation.
 *   · `totals.promo.discountLabel` is the offer register's own text
 *     ("15% OFF", "₹500 OFF") and `scopeLabel` the collection it is scoped to,
 *     so the drawer states exactly what the register states.
 *   · the design's option label ("Size: M") is parsed back into this
 *     application's selection, falling back to the catalogue's own default
 *     selection when a line carries no option (see
 *     `utils/shopping.defaultSelection`).
 *   · a failed add (out of stock, stock ceiling, a mutation already in flight)
 *     toasts the cart's own message through the port's toast layer, so the
 *     design's optimistic confirmation is followed by the truth when it differs.
 */

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useCart } from '../../../context/CartContext.jsx';
import { useWishlist } from '../../../context/WishlistContext.jsx';
import { getProductById as getAppProductById } from '../../../data/products/index.js';
import { defaultSelection } from '../../../utils/shopping.js';
import { formatOfferDiscount } from '../../../services/offers/offerRepository.js';
import { findPromotionByCode } from '../data/index.js';
import { toDesignProduct } from '../mock/data/products.js';
import { useUI } from './UIContext.jsx';

const ShopContext = createContext(null);

/** "Size: M" / "Colour: Rust" → this application's selection object. */
const selectionFrom = (product, option) => {
  const fallback = defaultSelection(product) ?? {};
  const label = String(option ?? '').trim();
  if (!label) return fallback;
  const [name, value] = label.split(':').map((part) => part.trim());
  if (!value) return fallback;
  const group = (product?.options ?? []).find((entry) => entry.name.toLowerCase() === name.toLowerCase())
    ?? product?.options?.[0];
  const key = /^colou?r$/i.test(group?.name ?? '') ? 'color' : 'size';
  return { ...fallback, [key]: value };
};

/** The offer register's view of an applied coupon code, in the design's shape. */
const promotionFor = (code) => {
  if (!code) return null;
  const promotion = findPromotionByCode(code) ?? null;
  return {
    code: String(code),
    discountPercent: promotion?.discountPercent ?? null,
    discountLabel: promotion?.discountLabel
      ?? (promotion ? `${promotion.discountPercent}% off` : 'applied'),
    scopeLabel: promotion?.scopeLabel ?? null,
    eligibleCollection: promotion?.eligibleCollection ?? null,
    label: promotion?.label ?? String(code),
  };
};

export function ShopProvider({ children }) {
  const cart = useCart();
  const wishlist = useWishlist();
  const { toast } = useUI();

  const lines = useMemo(
    () =>
      (cart.items ?? []).map((item) => {
        const product = toDesignProduct(item.product);
        return {
          key: item.id,
          id: item.productId ?? item.product?.id ?? item.id,
          option: [item.color, item.size].filter(Boolean).join(' · ') || null,
          qty: Number(item.quantity) || 1,
          product,
        };
      }).filter((line) => line.product),
    [cart.items],
  );

  const totals = useMemo(
    () => ({
      subtotal: cart.totals?.subtotal ?? 0,
      discount: cart.totals?.couponDiscount ?? 0,
      total: cart.totals?.total ?? 0,
      count: cart.count ?? 0,
      promo: promotionFor(cart.couponCode ?? cart.coupon?.code),
      /* Whether the numbers above are the server's own pricing or the guest
         presentation calculation. The drawer states an offer's amount
         differently in each case (see the port's `promo-feedback` rewrite). */
      priced: Boolean(cart.priced),
    }),
    [cart.totals, cart.count, cart.couponCode, cart.coupon, cart.priced],
  );

  const addToCart = useCallback(
    (id, option = null, qty = 1) => {
      const appProduct = getAppProductById(id);
      if (!appProduct) return { ok: false, message: 'This piece is currently unavailable.' };
      const design = toDesignProduct(appProduct);
      const selection = { ...selectionFrom(design, option), quantity: Math.max(1, Math.floor(Number(qty) || 1)) };
      const result = cart.addToCart(appProduct, selection);
      Promise.resolve(result).then((outcome) => {
        if (outcome && outcome.ok === false && outcome.message) toast(outcome.message);
      });
      return result;
    },
    [cart, toast],
  );

  const setQty = useCallback((key, qty) => cart.updateCartQuantity(key, qty), [cart]);
  const removeLine = useCallback((key) => cart.removeFromCart(key), [cart]);
  const clearCart = useCallback(() => cart.clearCart(), [cart]);
  const toggleWish = useCallback((id) => wishlist.toggle(id), [wishlist]);
  const applyPromo = useCallback(
    async (code) => {
      const result = await cart.applyCoupon(code);
      if (!result?.ok) return { ok: false, message: result?.message || 'This code could not be applied.' };
      return { ok: true, promo: promotionFor(result.coupon?.code ?? code) };
    },
    [cart],
  );
  const removePromo = useCallback(() => cart.removeCoupon(), [cart]);

  const value = useMemo(
    () => ({
      lines,
      totals,
      wishlist: [...(wishlist.saved ?? [])],
      promoCode: cart.couponCode ?? null,
      addToCart,
      setQty,
      removeLine,
      toggleWish,
      applyPromo,
      removePromo,
      clearCart,
      isWished: (id) => Boolean(wishlist.isSaved?.(id)),
    }),
    [lines, totals, wishlist, cart.couponCode, addToCart, setQty, removeLine, toggleWish, applyPromo, removePromo, clearCart],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export const useShop = () => {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used inside ShopProvider');
  return ctx;
};
