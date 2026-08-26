/**
 * PRATIKSHYA FASHON — Wishlist state helper (pure).
 *
 * Builds the wishlist surface from the backend's saved product ids: every
 * id is kept — resolved products render normally, ids whose catalogue
 * record no longer resolves are flagged `unavailable` (optionally, once a
 * lookup has actually failed) so the UI shows an honest "no longer
 * available" entry instead of silently hiding the piece.
 */

/**
 * @param {Iterable<string>} savedIds backend-provided wishlist product ids
 * @param {Iterable<string>} unavailableIds ids whose catalogue lookup failed
 * @param {(id: string) => object|null} resolveProduct catalogue resolver
 */
export function buildWishlistEntries(savedIds, unavailableIds, resolveProduct) {
  const unavailable = new Set(unavailableIds ?? []);
  return [...(savedIds ?? [])].map((id) => {
    const product = resolveProduct ? resolveProduct(id) : null;
    return {
      id,
      product,
      unavailable: !product && unavailable.has(id),
    };
  });
}
