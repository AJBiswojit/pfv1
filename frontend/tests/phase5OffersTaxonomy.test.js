/**
 * PRATIKSHYA FASHON — Phase 5 regression: offers + taxonomy admin contract.
 *
 * These suites pin the rules the Phase 5 offer/taxonomy work introduced:
 *
 *   · `buildOfferPayload` is the ONE admin write normalizer — it emits only
 *     columns the coupon table has, uppercases the code, and for PATCH
 *     sends ONLY the keys the form actually carries (partial-safe: an edit
 *     of the description can never zero usage limits or clobber the code),
 *     with the code itself held back until codeForUpdate says so.
 *   · `normaliseOffer` exposes the legacy UI aliases AND derives the
 *     eligibility modes from the backend id lists — display only; the
 *     server-side validation gate stays the checkout authority.
 *   · The admin list envelope carries the server's aggregate counts so the
 *     desk tiles never count a page and call it a register.
 *   · `formatAdminError` maps each HTTP status to distinct copy; a failure
 *     is never rendered as "empty".
 *   · Taxonomy mutations are awaited server calls; their stores refresh from
 *     the response, and collection membership writes re-read the server
 *     copy before replacing the explicit list (no stale-snapshot overwrite).
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  buildOfferPayload,
  normaliseOffer,
  apiAdminListOffers,
  apiValidateOfferCode,
} from "../src/services/api/offersApi.js";
import { formatAdminError } from "../src/services/admin/adminError.js";
import { toApiScopeFields } from "../src/services/offers/offerRepository.js";

// ---------------------------------------------------------------------------
// Harness (same pattern as the Phase 3/4 suites)
// ---------------------------------------------------------------------------

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const mockFetch = (responder) => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const next = typeof responder === "function" ? responder(url, options) : responder;
    if (next instanceof Response) return next;
    return jsonResponse(next ?? {});
  };
  return calls;
};

beforeEach(() => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const eventTarget = new EventTarget();
  globalThis.window = eventTarget;
  window.localStorage = storage;
  window.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);
  if (typeof globalThis.CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(type, options = {}) {
        super(type, options);
        this.detail = options.detail;
      }
    };
  }
  storage.setItem("pf_admin_access_token", "admin-token-for-tests");
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.window;
  delete globalThis.localStorage;
});

// ---------------------------------------------------------------------------
// buildOfferPayload — the single admin write normalizer
// ---------------------------------------------------------------------------

test("buildOfferPayload (create) emits only backend columns and defaults absent keys away", () => {
  const payload = buildOfferPayload({
    code: "fest25",
    name: "Festive 25",
    type: "PERCENTAGE",
    discountValue: 25,
    minimumOrderValue: 500,
  });
  assert.equal(payload.code, "FEST25", "codes are normalised to uppercase for the server");
  assert.equal(payload.discount_type, "percentage");
  assert.equal(payload.discount_value, 25);
  assert.equal(payload.minimum_order_value, 500);
  // Keys the form never carried must NOT appear — creation falls back to
  // backend defaults, not invented zeros/nulls from the UI layer.
  assert.ok(!("expires_at" in payload) || payload.expires_at === null);
  assert.ok(!("usage_limit" in payload));
  assert.ok(!("updated_by" in payload), "the coupon table has no updated_by — never written");
  assert.ok(!("maximum_discount" in payload) && !("priority" in payload), "no columns, no fields");
});

test("buildOfferPayload (PATCH) is partial-safe: absent keys stay absent", () => {
  const payload = buildOfferPayload(
    { description: "House festival offer", code: "OLD", startDate: "" },
    { forUpdate: true }
  );
  assert.equal(payload.description, "House festival offer");
  assert.ok(!("usage_limit" in payload), "an edit that never touched usage must not rewrite it");
  assert.ok(!("per_customer_limit" in payload));
  assert.ok(!("discount_value" in payload));
  assert.ok(!("is_active" in payload), "activation is a dedicated endpoint, not a form side effect");
  assert.ok(!("code" in payload), "the code is only re-sent when codeForUpdate marks it");
  assert.ok(!("starts_at" in payload) || payload.starts_at === null, "empty date clears or stays away");
});

test("buildOfferPayload (PATCH) re-sends the code only when codeForUpdate is set", () => {
  const payload = buildOfferPayload({ code: "newcode", codeForUpdate: true }, { forUpdate: true });
  assert.equal(payload.code, "NEWCODE");
});

test("buildOfferPayload maps eligibility lists to the exact column names", () => {
  const payload = buildOfferPayload({
    name: "Saree fest",
    discountValue: 10,
    type: "PERCENTAGE",
    eligibleProductIds: ["P-1", "P-2"],
    excludedCategoryIds: [7],
    eligibleCustomerIds: ["cust-9"],
    stackable: true,
  });
  assert.deepEqual(payload.eligible_product_ids, ["P-1", "P-2"]);
  assert.deepEqual(payload.excluded_category_ids, ["7"]);
  assert.deepEqual(payload.eligible_customer_ids, ["cust-9"]);
  assert.equal(payload.is_stackable, true);
});

// ---------------------------------------------------------------------------
// normaliseOffer — aliases and derived modes (display layer only)
// ---------------------------------------------------------------------------

test("normaliseOffer keeps backend fields AND legacy aliases", () => {
  const model = normaliseOffer({
    id: "offer-1",
    code: "FEST25",
    name: "Festive 25",
    discount_type: "percentage",
    discount_value: 25,
    minimum_order_value: 500,
    starts_at: "2026-09-01T00:00:00",
    expires_at: "2026-09-30T23:59:59",
    usage_limit: 100,
    usage_count: 12,
    display_status: "ACTIVE",
    is_active: true,
    eligible_category_ids: ["cat-saree"],
    eligible_product_ids: [],
    eligible_collection_ids: [],
    eligible_customer_ids: [],
  });
  assert.equal(model.status, "ACTIVE");
  assert.equal(model.code, "FEST25");
  assert.equal(model.type, "PERCENTAGE", "legacy UI alias for the discount type");
  assert.equal(model.discountValue, 25);
  assert.equal(model.minimumOrderValue, 500);
  assert.equal(model.startDate, "2026-09-01T00:00:00", "legacy date alias feeds existing formatters");
  assert.equal(model.usageCount, 12);
  assert.equal(model.productEligibility, "CATEGORY", "derived from which id lists are populated");
  assert.deepEqual(model.includedCategories, ["cat-saree"]);
  assert.equal(model.customerEligibility, "ALL_CUSTOMERS");
});

test("normaliseOffer derives SPECIFIC_PRODUCTS and SPECIFIC_CUSTOMERS only from real lists", () => {
  const model = normaliseOffer({
    id: "offer-2",
    code: "VIP",
    eligible_product_ids: ["P-1"],
    eligible_customer_ids: ["cust-1"],
    is_active: false,
  });
  assert.equal(model.productEligibility, "SPECIFIC_PRODUCTS");
  assert.equal(model.customerEligibility, "SPECIFIC_CUSTOMERS");
  assert.equal(model.status, "ARCHIVED", "inactive without a window is shown as archived/inactive");
});

test("toApiScopeFields drops what the table cannot store", () => {
  const scope = toApiScopeFields({
    productEligibility: "SPECIFIC_PRODUCTS",
    includedProducts: ["P-1", "P-2"],
    includedCategories: ["IGNORED-BY-MODE"],
    customerEligibility: "SPECIFIC_CUSTOMERS",
    specificCustomerIds: ["cust-1"],
    stackable: true,
  });
  assert.deepEqual(scope.eligibleProductIds, ["P-1", "P-2"]);
  assert.deepEqual(scope.eligibleCategoryIds, [], "only the ACTIVE mode's list is sent");
  assert.deepEqual(scope.eligibleCustomerIds, ["cust-1"]);
  assert.equal(scope.isStackable, true);
});

// ---------------------------------------------------------------------------
// Admin list envelope + guest validation pass-through
// ---------------------------------------------------------------------------

test("apiAdminListOffers forwards server filters and carries aggregate counts", async () => {
  const calls = mockFetch({
    ok: true,
    offers: [{ id: "o1", code: "A", discount_type: "percentage", discount_value: 5, is_active: true, display_status: "ACTIVE" }],
    total: 41,
    page: 2,
    pageSize: 20,
    counts: { total: 41, ACTIVE: 3, SCHEDULED: 1, EXPIRED: 30, ARCHIVED: 7 },
    lifetimeRedemptions: 128,
  });
  const result = await apiAdminListOffers({ q: "win", status: "EXPIRED", page: 2, pageSize: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.total, 41, "the register size comes from the server, not the page length");
  assert.equal(result.counts.EXPIRED, 30, "tiles are server-derived aggregates");
  assert.equal(result.lifetimeRedemptions, 128);
  assert.equal(result.offers[0].code, "A");
  const url = calls[0].url;
  assert.match(url, /\/admin\/offers\?/);
  assert.match(url, /q=win/);
  assert.match(url, /status=EXPIRED/);
  assert.match(url, /page=2/);
});

test("apiAdminListOffers failure stays a failure — never an empty list", async () => {
  mockFetch(jsonResponse({ success: false, error: { code: "FORBIDDEN", message: "Admin scope required." } }, 403));
  const result = await apiAdminListOffers({});
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(formatAdminError(result, { entity: "offer register", action: "loaded" }), /not allowed|permission|Admin scope/i);
});

test("apiValidateOfferCode passes real cart context through to the server gate", async () => {
  const calls = mockFetch({ ok: true, coupon: { id: "o", code: "FEST25" }, discount: 2500 });
  const result = await apiValidateOfferCode({ code: "fest25", cartItems: [{ lineTotal: 10000 }] });
  assert.equal(result.ok, true);
  assert.equal(result.discount, 2500);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.code, "FEST25");
  assert.deepEqual(body.cart_items, [{ lineTotal: 10000 }], "guest validation must carry the cart");
});

test("apiValidateOfferCode propagates an ok:false rejection verbatim", async () => {
  mockFetch({ ok: false, error: "Minimum order value of ₹1,000 is not met." });
  const result = await apiValidateOfferCode({ code: "FEST25", cartItems: [] });
  assert.equal(result.ok, false);
  assert.match(result.error, /Minimum order value/);
});

// ---------------------------------------------------------------------------
// formatAdminError — distinct copy per status (never one generic failure)
// ---------------------------------------------------------------------------

test("formatAdminError distinguishes 401 / 403 / 404 / 409 / 422", () => {
  const copy = (status, data) =>
    formatAdminError({ ok: false, status, data, error: "raw" }, { entity: "offer X", action: "saved" });
  assert.match(copy(401), /sign in|session/i);
  assert.match(copy(403), /permission|allowed/i);
  assert.match(copy(404), /not found|no .*exist|does not exist/i);
  assert.match(formatAdminError({ ok: false, status: 409, error: "Coupon code already exists.", data: null }, { entity: "offer", action: "created" }), /already exists/i);
  assert.match(copy(422, { error: { details: { errors: [{ field: "discount_value", message: "must be ≤ 100" }] } } }), /must be ≤ 100/);
  const network = copy(0);
  assert.match(network, /could not reach the server|unreachable|network/i);
  assert.notEqual(copy(401), copy(403), "statuses must not collapse into the same sentence");
});

// ---------------------------------------------------------------------------
// Taxonomy: catalogStore offers hydration failure stays visible
// ---------------------------------------------------------------------------

test("catalogStore surfaces an offers-fetch error instead of an empty success", async () => {
  const { getCatalogState, hydrateCatalog } = await import("../src/services/catalog/catalogStore.js");
  // Only the coupon endpoint fails — products/taxonomy stay healthy, so the
  // catalog itself becomes "ready" while the OFFERS slice reports honestly.
  globalThis.fetch = async (url) => {
    if (String(url).includes("/offers")) {
      return jsonResponse({ success: false, error: { code: "UPSTREAM", message: "Offers service is down." } }, 503);
    }
    return jsonResponse({ items: [], categories: [], collections: [] });
  };
  await hydrateCatalog({ force: true });
  const state = getCatalogState();
  assert.equal(state.offers.length, 0, "failed fetch must not fabricate offers");
  assert.ok(state.offersError, "and it must be reported as an error state, not silence");
  assert.match(state.offersError, /down|load/i);
});
