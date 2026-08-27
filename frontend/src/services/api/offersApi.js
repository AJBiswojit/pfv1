/**
 * PRATIKSHYA FASHON — Offers & Coupons API (Phase 5)
 *
 * THE single normalized layer between admin offer screens and the backend
 * coupon router (app/api/v1/coupons.py):
 *   GET  /offers                    — storefront offers (public)
 *   POST /offers/validate           — the single checkout gate (public)
 *   GET  /admin/offers              — admin list (q/status/page/pageSize)
 *   GET  /admin/offers/{id}         — single offer, any status
 *   POST   /admin/offers            — create
 *   PATCH  /admin/offers/{id}       — update (partial)
 *   POST   /admin/offers/{id}/activate | /pause | /archive
 *
 * The backend `catalog_coupon` contract is authoritative: discount_type ∈
 * percentage|fixed|free_shipping; the window is starts_at/expires_at; the
 * scope lists (eligible / excluded product, category, collection id lists; persistence has no
 * separate paused/archived flag (is_active + derived display status).
 * UI-only notions that have no column (priority, auto-apply, customer
 * eligibility segments, excluded collections…) are NOT sent, so nothing can
 * half-persist.
 */

import { apiClient, ApiError, handleError } from "./apiClient";

/** Backend coupon dict → normalized UI offer model (single mapping layer). */
export function normaliseOffer(data) {
  if (!data) return null;
  const asList = (v) => (Array.isArray(v) ? v : []);
  const hasList = (v) => Array.isArray(v) && v.length > 0;
  const offer = {
    id: data.id,
    code: data.code ?? "",
    name: data.name ?? "",
    title: data.name ?? "",
    description: data.description ?? "",
    discountType: data.discount_type ?? "percentage",
    discountValue: data.discount_value ?? 0,
    minimumOrderValue: data.minimum_order_value ?? 0,
    startsAt: data.starts_at ?? null,
    expiresAt: data.expires_at ?? null,
    usageLimit: data.usage_limit ?? null,
    usageCount: data.usage_count ?? 0,
    perCustomerLimit: data.per_customer_limit ?? null,
    isStackable: Boolean(data.is_stackable),
    isActive: Boolean(data.is_active),
    status: data.display_status ?? (data.is_active ? "ACTIVE" : "ARCHIVED"),
    eligibleCustomerIds: asList(data.eligible_customer_ids),
    eligibleProductIds: asList(data.eligible_product_ids),
    eligibleCategoryIds: asList(data.eligible_category_ids),
    eligibleCollectionIds: asList(data.eligible_collection_ids),
    excludedProductIds: asList(data.excluded_product_ids),
    excludedCategoryIds: asList(data.excluded_category_ids),
    createdAt: data.created_at ?? null,
    updatedAt: data.updated_at ?? null,
    /*
     * Legacy UI-model aliases so every existing offer consumer (checkout
     * coupon mapping, storefront rails, offerRepository) reads the SAME
     * server record through the names it always used.
     */
    type: data.discount_type === "fixed" ? "FIXED_AMOUNT" : "PERCENTAGE",
    startDate: data.starts_at ?? null,
    endDate: data.expires_at ?? null,
    stackable: Boolean(data.is_stackable),
  };
  /*
   * Eligibility MODE is DERIVED from which scope lists are populated — the
   * coupon table stores id lists, not an enum. Nothing here widens or
   * narrows what checkout will honour; the server's own gate remains the
   * authority for whether a code actually applies.
   */
  if (hasList(data.eligible_product_ids)) offer.productEligibility = "SPECIFIC_PRODUCTS";
  else if (hasList(data.eligible_category_ids)) offer.productEligibility = "CATEGORY";
  else if (hasList(data.eligible_collection_ids)) offer.productEligibility = "COLLECTION";
  else offer.productEligibility = "ALL_PRODUCTS";
  offer.includedProducts = offer.eligibleProductIds;
  offer.includedCategories = offer.eligibleCategoryIds;
  offer.includedCollections = offer.eligibleCollectionIds;
  if (hasList(data.eligible_customer_ids)) {
    offer.customerEligibility = "SPECIFIC_CUSTOMERS";
    offer.specificCustomerIds = offer.eligibleCustomerIds;
  } else {
    offer.customerEligibility = "ALL_CUSTOMERS";
    offer.specificCustomerIds = [];
  }
  return offer;
}

/**
 * Offer-form state → backend request body. Accepts either the normalized
 * model or the raw form; emits the exact snake_case fields
 * CreateCouponRequest/UpdateCouponRequest declare. Keys with no backend
 * column (priority, auto-apply, maximumDiscount cap…) are dropped HERE
 * explicitly, so a save can never claim a field persisted when it didn't.
 */
export function buildOfferPayload(form = {}, { forUpdate = false } = {}) {
  const isoOrNull = (value) => {
    if (value === undefined || value === null || value === "") return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  };
  const list = (v) => (Array.isArray(v) && v.length ? v.map(String) : null);

  const present = (...names) => names.some((n) => form[n] !== undefined);
  const payload = {};
  if (present("code")) payload.code = String(form.code ?? "").trim().toUpperCase();
  if (present("name", "title")) payload.name = form.name ?? form.title ?? null;
  if (present("description")) payload.description = form.description ?? "";
  if (present("discountType", "discount_type", "type")) {
    // Accept the UI alias too and normalise to the server's enum:
    // percentage | fixed | free_shipping (PERCENTAGE/FIXED_AMOUNT included).
    const raw = String(form.discountType ?? form.discount_type ?? form.type ?? "percentage").toLowerCase();
    payload.discount_type = raw === "fixed_amount" || raw === "fixed" ? "fixed" : raw === "free_shipping" ? "free_shipping" : "percentage";
  }
  if (present("discountValue", "discount_value")) payload.discount_value = Number(form.discountValue ?? 0) || 0;
  if (present("minimumOrderValue", "minimum_order_value"))
    payload.minimum_order_value = Math.max(0, Math.round(Number(form.minimumOrderValue ?? 0) || 0));
  if (present("startsAt", "startDate")) payload.starts_at = isoOrNull(form.startsAt ?? form.startDate);
  if (present("expiresAt", "endDate")) payload.expires_at = isoOrNull(form.expiresAt ?? form.endDate);
  if (present("usageLimit", "usage_limit"))
    payload.usage_limit =
      form.usageLimit == null || form.usageLimit === "" ? null : Math.max(0, Math.round(Number(form.usageLimit)));
  if (present("perCustomerLimit", "per_customer_limit"))
    payload.per_customer_limit =
      form.perCustomerLimit == null || form.perCustomerLimit === ""
        ? null
        : Math.max(0, Math.round(Number(form.perCustomerLimit)));
  if (present("eligibleCustomerIds", "specificCustomerIds"))
    payload.eligible_customer_ids = list(form.eligibleCustomerIds ?? form.specificCustomerIds);
  if (present("eligibleProductIds", "includedProducts"))
    payload.eligible_product_ids = list(form.eligibleProductIds ?? form.includedProducts);
  if (present("eligibleCategoryIds", "includedCategories"))
    payload.eligible_category_ids = list(form.eligibleCategoryIds ?? form.includedCategories);
  if (present("eligibleCollectionIds", "includedCollections"))
    payload.eligible_collection_ids = list(form.eligibleCollectionIds ?? form.includedCollections);
  if (present("excludedProductIds", "excluded_product_ids"))
    payload.excluded_product_ids = list(form.excludedProductIds ?? form.excluded_product_ids);
  if (present("excludedCategoryIds", "excluded_category_ids"))
    payload.excluded_category_ids = list(form.excludedCategoryIds ?? form.excluded_category_ids);
  if (present("isStackable", "stackable")) payload.is_stackable = Boolean(form.isStackable ?? form.stackable);

  if (!forUpdate) {
    // CREATE requires a code; everything else falls back to backend defaults.
    if (payload.code === undefined) payload.code = String(form.code ?? "").trim().toUpperCase();
    return payload;
  }
  // Partial PATCH keeps its partiality: fields the caller did not carry are
  // NOT sent, so they can never be silently reset by omitted keys.
  if (form.codeForUpdate && form.code) payload.code = String(form.code).trim().toUpperCase();
  else delete payload.code;
  if (form.isActive === true || form.isActive === false) payload.is_active = form.isActive;
  return payload;
}

// ---------------------------------------------------------------------------
// Storefront
// ---------------------------------------------------------------------------

/** GET /offers — currently-valid public offers. `status` is a UI hint; the
 *  server derives validity from is_active + date window itself. */
export async function apiListOffers() {
  try {
    const data = await apiClient.get("/offers", { scope: "none" });
    const list = data.offers ?? data.items ?? [];
    return { ok: true, offers: list.map(normaliseOffer) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /offers/validate — the single checkout gate.
 * The backend answers 200 with an `{ ok: false, error }` envelope when the
 * code is unknown/inactive/below minimum: that failure is propagated as-is
 * (the previous layer claimed ok:true on those responses — a fake success).
 * Cart items are sent in the shape the gate reads (lineTotal or
 * price × quantity).
 */
export async function apiValidateOfferCode({ code, cartItems = [], customerId, customerEmail } = {}) {
  try {
    const data = await apiClient.post(
      "/offers/validate",
      {
        code: String(code ?? "").trim().toUpperCase(),
        cart_items: cartItems,
        customer_id: customerId ?? null,
        customer_email: customerEmail ?? null,
      },
      { scope: "none" }
    );
    if (data && data.ok === false) {
      return { ok: false, error: data.error ?? "This coupon is not valid for your cart.", data };
    }
    return {
      ok: true,
      offer: normaliseOffer(data.coupon ?? data.offer ?? null),
      discount: data.discount ?? 0,
    };
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** GET /admin/offers?q=&status=&page=&pageSize= — server-side search,
 *  derived-status filter and pagination; `total` is the full filtered count. */
export async function apiAdminListOffers({ status, q, page = 1, pageSize = 20 } = {}) {
  try {
    const qs = new URLSearchParams({ page, pageSize });
    if (status) qs.set("status", status);
    if (q) qs.set("q", q);
    const data = await apiClient.get(`/admin/offers?${qs}`, { scope: "admin" });
    const list = data.offers ?? data.items ?? [];
    return {
      ok: true,
      offers: list.map(normaliseOffer),
      total: data.total ?? list.length,
      page: data.page ?? page,
      pageSize: data.pageSize ?? pageSize,
      // Server-derived aggregate tiles (counts across the FULL q-filtered
      // set, never just this page) + lifetime redemptions from usage_count.
      counts: data.counts ?? null,
      lifetimeRedemptions: data.lifetimeRedemptions ?? null,
    };
  } catch (err) {
    return handleError(err);
  }
}

/** GET /admin/offers/{id} — single record including inactive/expired rows. */
export async function apiAdminGetOffer(id) {
  try {
    const data = await apiClient.get(`/admin/offers/${id}`, { scope: "admin" });
    return { ok: true, offer: normaliseOffer(data.offer ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/offers — duplicate code is a 409, bad window/percent a 422;
 *  both statuses pass through for the form to show the server's copy. */
export async function apiAdminCreateOffer(form) {
  try {
    const data = await apiClient.post("/admin/offers", buildOfferPayload(form), { scope: "admin" });
    return { ok: true, offer: normaliseOffer(data.offer ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /admin/offers/{id} */
export async function apiAdminUpdateOffer(id, form) {
  try {
    const data = await apiClient.patch(
      `/admin/offers/${id}`,
      buildOfferPayload(form, { forUpdate: true }),
      { scope: "admin" }
    );
    return { ok: true, offer: normaliseOffer(data.offer ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

const offerPost = (path) => async (id) => {
  try {
    const data = await apiClient.post(`/admin/offers/${id}/${path}`, {}, { scope: "admin" });
    return { ok: true, offer: normaliseOffer(data.offer ?? null) };
  } catch (err) {
    return handleError(err);
  }
};

export const apiAdminActivateOffer = offerPost("activate");
export const apiAdminPauseOffer = offerPost("pause");
export const apiAdminArchiveOffer = offerPost("archive");
