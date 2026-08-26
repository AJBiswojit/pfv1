/**
 * PRATIKSHYA FASHON — Shopping moves (pure orchestrators).
 *
 * The cross-list moves between the bag and the wishlist, expressed as
 * dependency-injected steps so the sequencing rules are explicit and
 * unit-testable:
 *
 *   Cart → wishlist: the wishlist add is awaited FIRST; the cart line is
 *   removed only after that add succeeded. A failed add leaves the bag
 *   untouched — no piece can fall out of both lists.
 */

/**
 * @param {object} params
 * @param {{ productId: string, id: string }} params.item the cart line
 * @param {(productId: string) => Promise<{ok: boolean, message?: string}>} params.addToList
 * @param {(lineId: string) => Promise<{ok: boolean, message?: string}>} params.removeFromCart
 */
export async function moveLineToWishlist({ item, addToList, removeFromCart }) {
  if (!item?.productId) return { ok: false, message: "" };
  const added = await addToList(item.productId);
  if (!added?.ok) {
    return { ok: false, message: added?.message ?? "Could not save to your wishlist." };
  }
  const removed = await removeFromCart(item.id);
  if (!removed?.ok) {
    // The wishlist add succeeded but the bag line could not be removed —
    // honest outcome; the piece stays in both lists, nothing is lost.
    return {
      ok: false,
      message: removed?.message ?? "Saved to your wishlist, but the bag line could not be removed.",
    };
  }
  return { ok: true, message: "Moved to your wishlist." };
}
