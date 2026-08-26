/**
 * PRATIKSHYA FASHON — Offers & Coupons API
 *
 * Maps to backend app/api/v1/coupons.py:
 *   GET  /offers                    — storefront offers
 *   POST /offers/validate           — validate a coupon code
 *   GET  /offers/{id}               — offer detail (admin/merchant)
 *   GET  /admin/offers              — admin offer list
 *   POST /admin/offers              — create offer
 *   PATCH  /admin/offers/{id}       — update offer
 *   POST /admin/offers/{id}/activate | /pause | /archive
 */

import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

function normaliseOffer(data) {
  if (!data) return null;
  return {
    id:          data.id,
    code:        data.code ?? "",
    title:       data.title ?? data.name ?? "",
    description: data.description ?? "",
    type:        data.type ?? "",
    discountType:  data.discount_type  ?? data.discountType  ?? "PERCENTAGE",
    discountValue: data.discount_value ?? data.discountValue ?? 0,
    minOrderValue: data.min_order_value ?? data.minOrderValue ?? 0,
    maxDiscount:   data.max_discount   ?? data.maxDiscount   ?? null,
    startDate:   data.start_date   ?? data.startDate   ?? null,
    endDate:     data.end_date     ?? data.endDate     ?? null,
    status:      data.status      ?? "DRAFT",
    usageLimit:    data.usage_limit    ?? data.usageLimit    ?? null,
    usageCount:    data.usage_count    ?? data.usageCount    ?? 0,
    appliesTo:   data.applies_to   ?? data.appliesTo   ?? null,
    productIds:  data.product_ids  ?? data.productIds  ?? [],
    categoryIds: data.category_ids ?? data.categoryIds ?? [],
    createdAt:   data.created_at   ?? data.createdAt   ?? null,
  };
}

// ---------------------------------------------------------------------------
// Storefront
// ---------------------------------------------------------------------------

/** GET /offers */
export async function apiListOffers({ status = "ACTIVE" } = {}) {
  try {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    const data = await apiClient.get(`/offers?${qs}`, { scope: "none" });
    const list = (data.offers ?? data.items ?? data ?? []);
    return { ok: true, offers: list.map(normaliseOffer) };
  } catch (err) { return handleError(err); }
}

/** POST /offers/validate  body: { code, cartItems?, customerId?, customerEmail? } */
export async function apiValidateOfferCode({ code, cartItems = [], customerId, customerEmail }) {
  try {
    const data = await apiClient.post("/offers/validate", {
      code,
      cartItems,
      customerId,
      customerEmail,
    }, { scope: "none" });
    return { ok: true, offer: normaliseOffer(data.offer ?? data), message: data.message ?? "" };
  } catch (err) { return handleError(err); }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** GET /admin/offers */
export async function apiAdminListOffers({ status, q, page = 1, pageSize = 20 } = {}) {
  try {
    const qs = new URLSearchParams({ page, pageSize });
    if (status) qs.set("status", status);
    if (q) qs.set("q", q);
    const data = await apiClient.get(`/admin/offers?${qs}`, { scope: "admin" });
    const list = (data.offers ?? data.items ?? data ?? []);
    return { ok: true, offers: list.map(normaliseOffer), total: data.total ?? list.length };
  } catch (err) { return handleError(err); }
}

/** GET /admin/offers/{id} */
export async function apiAdminGetOffer(id) {
  try {
    const data = await apiClient.get(`/admin/offers/${id}`, { scope: "admin" });
    return { ok: true, offer: normaliseOffer(data.offer ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/offers */
export async function apiAdminCreateOffer(body) {
  try {
    const data = await apiClient.post("/admin/offers", body, { scope: "admin" });
    return { ok: true, offer: normaliseOffer(data.offer ?? data) };
  } catch (err) { return handleError(err); }
}

/** PATCH /admin/offers/{id} */
export async function apiAdminUpdateOffer(id, body) {
  try {
    const data = await apiClient.patch(`/admin/offers/${id}`, body, { scope: "admin" });
    return { ok: true, offer: normaliseOffer(data.offer ?? data) };
  } catch (err) { return handleError(err); }
}

const offerPost = (path) => async (id, body = {}) => {
  try {
    const data = await apiClient.post(`/admin/offers/${id}/${path}`, body, { scope: "admin" });
    return { ok: true, offer: normaliseOffer(data.offer ?? data) };
  } catch (err) { return handleError(err); }
};

export const apiAdminActivateOffer = offerPost("activate");
export const apiAdminPauseOffer    = offerPost("pause");
export const apiAdminArchiveOffer  = offerPost("archive");
