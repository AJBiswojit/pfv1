/**
 * PRATIKSHYA FASHON — Cart state helpers (pure).
 *
 * The single home for guest-cart persistence shape and the server-cart →
 * frontend-state projection used by CartContext. Kept free of React so the
 * line-identity and canonical-state rules are unit-testable.
 *
 * Rules encoded here (Phase 4):
 *   - Server lines keep the backend's own line id — never a locally
 *     generated one; selections are matched by the (productId, colour,
 *     size) triple.
 *   - The server product projection and line totals travel through
 *     verbatim; the client never re-prices an authenticated cart.
 *   - Authenticated adds send ONLY the requested increment — the backend
 *     merges the (productId, colour, size) triple itself, so a client-side
 *     total would double-count the existing quantity.
 *   - Guest cart is client-only storage, re-keyed on restore with the same
 *     case-insensitive triple semantics the server uses when merging.
 */

import {
  cartLineId,
  findCartLine,
  CART_STORAGE_KEY,
  readStorage,
  writeStorage,
} from "./shopping";

/** Reads the persisted guest cart (client-only state). */
export const restoreGuestCart = () => {
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
    // Case-variant duplicates of the same (product, colour, size) triple
    // merge into one line with summed quantities — the same merge semantics
    // the server applies to authenticated carts.
    const existing = byId.get(id);
    byId.set(id, existing
      ? { ...existing, quantity: existing.quantity + quantity }
      : {
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

/** Persists the guest cart (never called while authenticated). */
export const persistGuestCart = (state) => {
  writeStorage(CART_STORAGE_KEY, { lines: state.lines, coupon: state.couponCode });
};

/**
 * Server cart response → canonical frontend state. The server line id,
 * product projection, per-line total, coupon summary, couponLapsed flag and
 * totals all pass through — nothing is recomputed or regenerated.
 */
export function serverCartToState(serverCart) {
  if (!serverCart) return null;
  return {
    lines: (serverCart.lines ?? serverCart.items ?? []).map((item) => ({
      id:        item.id, // backend line identity — never regenerated locally
      productId: item.product_id ?? item.productId,
      color:     item.color ?? null,
      size:      item.size  ?? null,
      quantity:  item.quantity,
      addedAt:   item.added_at ?? item.addedAt ?? null,
      product:   item.product ?? null, // server-resolved product projection
      lineTotal: item.line_total ?? item.lineTotal ?? null,
      maximum:   Number.isFinite(Number(item.product?.stock))
        ? Math.max(1, Number(item.product?.stock))
        : null, // backend-provided stock as a presentation cap only
    })).filter((l) => l.productId),
    couponCode: serverCart.couponCode ?? serverCart.coupon?.code ?? null,
    coupon:     serverCart.coupon ?? null,
    couponLapsed: Boolean(serverCart.couponLapsed),
    totals:     serverCart.totals ?? null,
  };
}

/**
 * Resolves an add-to-bag intent against the current lines.
 *
 * Authenticated: the payload carries ONLY the requested increment — the
 * backend merges the (productId, colour, size) triple and clamps to stock
 * itself. Guest: the merged total quantity is computed locally (with the
 * caller-applied ceiling), because there is no server cart.
 *
 * `matchedLine` is found by triple (works for server hashed ids and guest
 * ids alike) — this is the lookup the PDP held-quantity check relies on.
 */
export function resolveAddIntent({ lines = [], productId, selection = {}, requested, authenticated = false }) {
  const cleanProductId = typeof productId === "string" ? productId : productId?.id;
  if (!cleanProductId) return { ok: false, matchedLine: undefined, payload: null };
  const requestedQuantity = Math.max(1, Math.floor(Number(requested ?? selection.quantity) || 1));
  const matchedLine = findCartLine(lines, cleanProductId, selection);
  const color = selection.color ?? null;
  const size = selection.size ?? null;

  if (authenticated) {
    return {
      ok: true,
      matchedLine,
      payload: { productId: cleanProductId, color, size, quantity: requestedQuantity },
    };
  }

  const existingQuantity = matchedLine?.quantity ?? 0;
  return {
    ok: true,
    matchedLine,
    payload: {
      productId: cleanProductId,
      color,
      size,
      quantity: existingQuantity + requestedQuantity,
    },
    guestLineId: matchedLine?.id ?? cartLineId(cleanProductId, selection),
  };
}
