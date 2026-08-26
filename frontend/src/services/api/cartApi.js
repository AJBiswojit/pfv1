/**
 * PRATIKSHYA FASHON — Cart API
 * Maps to API_CONTRACT.md § CART
 *
 * All endpoints require Customer JWT.
 * Guest carts remain localStorage-only — this module is only called when authenticated.
 */
import { apiClient, ApiError } from "./apiClient";

/**
 * Failures keep their HTTP status so callers can distinguish 401/403/404/409/
 * 422/500/network (status 0). A failure is never converted into an empty
 * successful cart.
 */
function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message, status: err.status };
  return { ok: false, error: "An unexpected error occurred.", status: 0 };
}

/**
 * Normalise server cart → frontend shape
 * Frontend CartContext expects: { lines, couponCode, totals, count }
 * Backend returns: { items, count, totals, coupon, coupon_lapsed }
 */
function normaliseCart(data) {
  const items = data.items ?? [];
  // Remap server items to frontend "lines" shape
  const lines = items.map((item) => ({
    id:        item.id,
    productId: item.product_id ?? item.productId,
    color:     item.color ?? null,
    size:      item.size  ?? null,
    quantity:  item.quantity,
    addedAt:   item.added_at ?? item.addedAt ?? Date.now(),
    // Also include resolved product data when present
    product:   item.product ?? null,
    lineTotal: item.line_total ?? item.lineTotal ?? 0,
  }));

  const coupon = data.coupon ?? null;
  const totals = data.totals ?? {};

  return {
    lines,
    items,  // raw server items for components that use them directly
    count:       data.count ?? lines.reduce((sum, l) => sum + l.quantity, 0),
    couponCode:  coupon?.code ?? null,
    coupon:      coupon,
    couponLapsed: Boolean(data.coupon_lapsed ?? data.couponLapsed),
    totals: {
      subtotal:       totals.subtotal       ?? 0,
      productDiscount: totals.product_discount ?? totals.productDiscount ?? 0,
      couponDiscount: totals.coupon_discount  ?? totals.couponDiscount  ?? 0,
      couponCode:     totals.coupon_code      ?? totals.couponCode      ?? null,
      offerId:        totals.offer_id         ?? totals.offerId         ?? null,
      shipping:       totals.shipping        ?? 0,
      codFee:         totals.cod_fee         ?? totals.codFee         ?? 0,
      total:          totals.total           ?? 0,
      saved:          totals.saved           ?? 0,
    },
  };
}

/** GET /cart */
export async function apiGetCart() {
  try {
    const data = await apiClient.get("/cart", { scope: "customer" });
    return { ok: true, cart: normaliseCart(data) };
  } catch (err) { return handleError(err); }
}

/** POST /cart/items  body: { productId, color?, size?, quantity } */
export async function apiAddCartItem({ productId, color, size, quantity }) {
  try {
    const data = await apiClient.post("/cart/items", {
      productId, color, size, quantity,
    }, { scope: "customer" });
    return { ok: true, cart: normaliseCart(data.cart ?? data) };
  } catch (err) { return handleError(err); }
}

/** PATCH /cart/items/{lineId}  body: { quantity } */
export async function apiUpdateCartItem(lineId, quantity) {
  try {
    const data = await apiClient.patch(`/cart/items/${lineId}`, { quantity }, { scope: "customer" });
    return { ok: true, cart: normaliseCart(data.cart ?? data) };
  } catch (err) { return handleError(err); }
}

/** DELETE /cart/items/{lineId} */
export async function apiRemoveCartItem(lineId) {
  try {
    const data = await apiClient.delete(`/cart/items/${lineId}`, { scope: "customer" });
    return { ok: true, cart: normaliseCart(data.cart ?? data) };
  } catch (err) { return handleError(err); }
}

/** DELETE /cart */
export async function apiClearCart() {
  try {
    await apiClient.delete("/cart", { scope: "customer" });
    return { ok: true };
  } catch (err) { return handleError(err); }
}

/** POST /cart/coupon  body: { code } */
export async function apiApplyCoupon(code) {
  try {
    const data = await apiClient.post("/cart/coupon", { code }, { scope: "customer" });
    return {
      ok:      true,
      coupon:  data.coupon,
      message: data.message ?? `${code} is now part of your order.`,
    };
  } catch (err) { return handleError(err); }
}

/** DELETE /cart/coupon */
export async function apiRemoveCoupon() {
  try {
    await apiClient.delete("/cart/coupon", { scope: "customer" });
    return { ok: true };
  } catch (err) { return handleError(err); }
}

/** GET /cart/totals?deliveryMethod=standard&paymentMethod=online */
export async function apiGetCartTotals({ deliveryMethod = "standard", paymentMethod = "online" } = {}) {
  try {
    const data = await apiClient.get(`/cart/totals?deliveryMethod=${deliveryMethod}&paymentMethod=${paymentMethod}`, { scope: "customer" });
    return {
      ok: true,
      totals: {
        subtotal:        data.subtotal        ?? 0,
        productDiscount: data.product_discount ?? data.productDiscount ?? 0,
        couponDiscount:  data.coupon_discount  ?? data.couponDiscount  ?? 0,
        couponCode:      data.coupon_code      ?? data.couponCode      ?? null,
        offerId:         data.offer_id         ?? data.offerId         ?? null,
        shipping:        data.shipping         ?? 0,
        codFee:          data.cod_fee          ?? data.codFee          ?? 0,
        total:           data.total            ?? 0,
        saved:           data.saved            ?? 0,
      },
    };
  } catch (err) { return handleError(err); }
}
