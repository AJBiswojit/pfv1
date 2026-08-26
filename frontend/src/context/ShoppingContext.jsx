/**
 * PRATIKSHYA FASHON — The shopping state foundation.
 *
 * One provider composes the two shopping concerns — bag and wishlist — and
 * one hook exposes the movements that need both at once. There is exactly
 * one cart implementation and one wishlist implementation behind this file;
 * `useShopping` simply lets a component move a piece between them without
 * wiring the two contexts together itself.
 */

import { useCallback, useMemo } from "react";
import { CartProvider, useCart } from "./CartContext";
import { useWishlist, WishlistProvider } from "./WishlistContext";
import { defaultSelection, requiresVariantChoice } from "../utils/shopping";
import { moveLineToWishlist } from "../utils/shoppingMoves";

/** Mounts the whole shopping state once, at the top of the application. */
export function ShoppingProvider({ children }) {
  return (
    <WishlistProvider>
      <CartProvider>{children}</CartProvider>
    </WishlistProvider>
  );
}

/** The combined shopping API: everything the bag and wishlist expose, plus the moves between them. */
export function useShopping() {
  const cart = useCart();
  const wishlist = useWishlist();

  /**
   * Cart → wishlist. The wishlist add is awaited first; the cart line is
   * removed only after that add succeeded (sequencing lives in
   * `moveLineToWishlist` so it is unit-tested).
   */
  const moveToWishlist = useCallback(
    (item) => moveLineToWishlist({
      item,
      addToList: wishlist.add,
      removeFromCart: cart.removeFromCart,
    }),
    [cart, wishlist]
  );

  /**
   * Wishlist → cart. Pieces that need a deliberate size choice are sent to
   * their detail page instead of forcing the choice into a card; the piece
   * stays in the wishlist unless the customer removes it themselves (the
   * documented policy — the add must succeed first in any case, and it does:
   * the bag add is the backend mutation itself).
   */
  const moveToCart = useCallback(
    (product) => {
      if (!product?.id) return { ok: false, message: "" };
      if (requiresVariantChoice(product)) {
        return { ok: false, needsVariant: true, message: "" };
      }
      return cart.addToCart(product, { ...defaultSelection(product), quantity: 1 });
    },
    [cart]
  );

  return useMemo(
    () => ({ cart, wishlist, moveToWishlist, moveToCart }),
    [cart, wishlist, moveToWishlist, moveToCart]
  );
}

export default ShoppingProvider;
