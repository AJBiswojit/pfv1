/**
 * Phase 4 regression suite — customer cart, wishlist, account, addresses
 * and checkout compatibility.
 *
 * The through-line of every check below is the Phase 4 rule: the backend is
 * the source of truth for authenticated customer business data. Failures
 * stay failures (with their HTTP status), server line identities and
 * server-computed money are never regenerated or recomputed client-side,
 * guest and authenticated state stay separated, and no capability the
 * backend does not have is faked.
 *
 * Context components (.jsx) cannot be imported by this runner; their core
 * logic therefore lives in pure modules (`utils/cartState.js`,
 * `utils/wishlistState.js`, `utils/shoppingMoves.js`) which are exercised
 * here together with the API adapters.
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  apiGetCart,
  apiAddCartItem,
  apiUpdateCartItem,
  apiRemoveCartItem,
  apiClearCart,
  apiApplyCoupon,
  apiRemoveCoupon,
  apiGetCartTotals,
} from "../src/services/api/cartApi.js";
import {
  apiGetWishlist,
  apiAddToWishlist,
  apiRemoveFromWishlist,
  apiToggleWishlist,
} from "../src/services/api/wishlistApi.js";
import {
  apiGetMe,
  apiUpdateProfile,
  apiGetAddresses,
  apiAddAddress,
  apiUpdateAddress,
  apiDeleteAddress,
  apiSetDefaultAddress,
  apiRevokeOtherSessions,
} from "../src/services/api/customersApi.js";
import { apiChangePasswordCustomer } from "../src/services/api/authApi.js";
import {
  serverCartToState,
  restoreGuestCart,
  resolveAddIntent,
} from "../src/utils/cartState.js";
import { buildWishlistEntries } from "../src/utils/wishlistState.js";
import { moveLineToWishlist } from "../src/utils/shoppingMoves.js";
import { findCartLine, cartLineId, calculateCartTotals } from "../src/utils/shopping.js";
import { buildPlaceOrderRequest } from "../src/utils/checkout.js";

// ---------------------------------------------------------------------------
// Test harness (same pattern as the Phase 2/3 suites)
// ---------------------------------------------------------------------------

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

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
  storage.setItem("pf_access_token", "customer-token");
});

afterEach(() => {
  delete globalThis.fetch;
});

// ---------------------------------------------------------------------------
// Cart — backend as source of truth
// ---------------------------------------------------------------------------

test("authenticated cart loads from the backend and is normalised", async () => {
  const calls = mockFetch(() => ({
    ok: true,
    items: [{
      id: "abc123def4567890",
      product_id: "PF-PRD-1",
      product: { id: "PF-PRD-1", name: "Ivory Silk Saree", price: 12000, stock: 3 },
      color: "Ivory",
      size: "Free Size",
      quantity: 2,
      added_at: "2026-08-01T10:00:00Z",
      line_total: 24000,
    }],
    count: 2,
    totals: { subtotal: 24000, product_discount: 0, coupon_discount: 0, shipping: 0, cod_fee: 0, total: 24000, saved: 0 },
    coupon: { id: "c1", code: "FESTIVE10", name: "Festive 10", discount_type: "percentage", discount_value: 10, minimum_order_value: 5000 },
    coupon_lapsed: true,
  }));

  const result = await apiGetCart();

  assert.equal(result.ok, true);
  assert.equal(calls[0].url.endsWith("/cart"), true);
  assert.equal(calls[0].options.headers.Authorization, "Bearer customer-token");
  assert.equal(result.cart.lines[0].id, "abc123def4567890", "server line id is kept");
  assert.equal(result.cart.lines[0].product.name, "Ivory Silk Saree", "server product projection travels through");
  assert.equal(result.cart.lines[0].lineTotal, 24000);
  assert.equal(result.cart.couponCode, "FESTIVE10");
  assert.equal(result.cart.couponLapsed, true, "couponLapsed is the server value, not a constant");
  assert.equal(result.cart.totals.total, 24000);
});

test("a cart API failure is a failure — never an empty successful cart", async () => {
  mockFetch(() => jsonResponse({ detail: "Server error. Please try again shortly." }, 500));
  const result = await apiGetCart();
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(result.cart, undefined, "no cart key — cannot be rendered as an empty bag");
});

test("cart operations hit the real backend routes with the right bodies", async () => {
  const calls = mockFetch(() => ({ ok: true, items: [], count: 0, totals: {} }));

  await apiAddCartItem({ productId: "PF-PRD-1", color: "Red", size: "M", quantity: 1 });
  await apiUpdateCartItem("abc123def4567890", 3);
  await apiRemoveCartItem("abc123def4567890");
  await apiClearCart();
  await apiApplyCoupon("FESTIVE10");
  await apiRemoveCoupon();

  const byMethodPath = (i) => `${calls[i].options.method} ${calls[i].url.split("/api/v1")[1]}`;
  assert.equal(byMethodPath(0), "POST /cart/items");
  assert.deepEqual(JSON.parse(calls[0].options.body), { productId: "PF-PRD-1", color: "Red", size: "M", quantity: 1 });
  assert.equal(byMethodPath(1), "PATCH /cart/items/abc123def4567890");
  assert.deepEqual(JSON.parse(calls[1].options.body), { quantity: 3 });
  assert.equal(byMethodPath(2), "DELETE /cart/items/abc123def4567890");
  assert.equal(byMethodPath(3), "DELETE /cart");
  assert.equal(byMethodPath(4), "POST /cart/coupon");
  assert.deepEqual(JSON.parse(calls[4].options.body), { code: "FESTIVE10" });
  assert.equal(byMethodPath(5), "DELETE /cart/coupon");
  // Every call carries the customer-scoped token.
  calls.forEach((call) => assert.equal(call.options.headers.Authorization, "Bearer customer-token"));
});

test("backend rejections surface with their status and message", async () => {
  mockFetch(() => jsonResponse({ detail: ["", "Quantity must be between 1 and 99"][1] }, 422));
  const updated = await apiUpdateCartItem("abc", 0);
  assert.equal(updated.ok, false);
  assert.equal(updated.status, 422);

  mockFetch(() => jsonResponse({ detail: "'Silk Saree' is currently out of stock." }, 422));
  const added = await apiAddCartItem({ productId: "PF-PRD-1", quantity: 1 });
  assert.equal(added.ok, false);
  assert.equal(added.status, 422);
  assert.match(added.error, /out of stock/);
});

test("an expired session surfaces as 401, not a silent local cart", async () => {
  mockFetch(() => jsonResponse({ detail: "Session expired. Please sign in again." }, 401));
  const result = await apiGetCart();
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("method-dependent totals come from GET /cart/totals with the chosen methods", async () => {
  const calls = mockFetch(() => ({
    ok: true, subtotal: 6000, product_discount: 0, coupon_discount: 0,
    shipping: 199, cod_fee: 49, total: 6248, saved: 0,
  }));
  const result = await apiGetCartTotals({ deliveryMethod: "express", paymentMethod: "cod" });
  assert.equal(result.ok, true);
  assert.equal(calls[0].url.includes("/cart/totals?deliveryMethod=express&paymentMethod=cod"), true);
  assert.equal(result.totals.shipping, 199, "server shipping is used verbatim (express)");
  assert.equal(result.totals.codFee, 49);
  assert.equal(result.totals.total, 6248);
});

// ---------------------------------------------------------------------------
// Cart line identity — the backend identifier is the authority
// ---------------------------------------------------------------------------

test("server cart state keeps the backend line id and server pricing untouched", () => {
  const state = serverCartToState({
    items: [{
      id: "9f8e7d6c5b4a3210",
      product_id: "PF-PRD-9",
      product: { id: "PF-PRD-9", name: "Piece", price: 5000, stock: 4 },
      color: null, size: null, quantity: 1, line_total: 5000,
    }],
    totals: { subtotal: 5000, shipping: 99, total: 5099 },
  });
  assert.equal(state.lines[0].id, "9f8e7d6c5b4a3210");
  assert.equal(state.totals.total, 5099, "totals are the server's, not recomputed");
  assert.equal(state.lines[0].maximum, 4, "server stock becomes the presentation cap");
});

test("held-quantity lookup matches server hashed-id lines by selection triple", () => {
  // The PDP regression: a server line whose id is a backend hash must still
  // be found for (product, colour, size) — case-insensitively.
  const lines = [
    { id: "hashed01", productId: "PF-PRD-2", color: "Red", size: "M", quantity: 2 },
    { id: "hashed02", productId: "PF-PRD-2", color: "Red", size: "L", quantity: 1 },
  ];
  assert.equal(findCartLine(lines, "PF-PRD-2", { color: "red", size: "m" })?.quantity, 2);
  assert.equal(findCartLine(lines, "PF-PRD-2", { color: "Red", size: "L" })?.quantity, 1);
  assert.equal(findCartLine(lines, "PF-PRD-2", { color: "Blue", size: "M" }), undefined);
  assert.equal(findCartLine(lines, "PF-PRD-2", { color: null, size: null }), undefined);
});

test("guest line identity is case-insensitive, mirroring server merge semantics", () => {
  assert.equal(cartLineId("P1", { color: "Red", size: "M" }), cartLineId("P1", { color: "red", size: "m" }));
  assert.notEqual(cartLineId("P1", { color: "Red", size: "M" }), cartLineId("P1", { color: "Red", size: "L" }));
});

test("authenticated add sends ONLY the increment — no client-computed totals", () => {
  const lines = [{ id: "hashed01", productId: "PF-PRD-2", color: "Red", size: "M", quantity: 2 }];
  const auth = resolveAddIntent({ lines, productId: "PF-PRD-2", selection: { color: "Red", size: "M", quantity: 2 }, authenticated: true });
  assert.deepEqual(auth.payload, { productId: "PF-PRD-2", color: "Red", size: "M", quantity: 2 },
    "the backend merges the triple; sending 2+2 would double-count");
  assert.equal(auth.matchedLine.id, "hashed01");

  const guest = resolveAddIntent({ lines: [{ id: "p::red::m", productId: "PF-PRD-2", color: "red", size: "m", quantity: 2 }], productId: "PF-PRD-2", selection: { color: "Red", size: "M", quantity: 2 }, authenticated: false });
  assert.equal(guest.payload.quantity, 4, "guest merge is local because there is no server cart");
});

// ---------------------------------------------------------------------------
// Guest cart ↔ authenticated cart separation
// ---------------------------------------------------------------------------

test("guest cart is client-only storage, restored and re-keyed safely", () => {
  localStorage.setItem("pratikshya_cart", JSON.stringify({
    lines: [{ productId: "PF-PRD-3", color: "Red", size: "M", quantity: 1 }],
    coupon: "WELCOME5",
  }));
  const guest = restoreGuestCart();
  assert.equal(guest.lines.length, 1);
  assert.equal(guest.lines[0].productId, "PF-PRD-3");
  assert.equal(guest.couponCode, "WELCOME5");
  assert.equal(guest.totals, null, "guest totals are display-only");
  // Case-variant duplicates merge to one line on restore (server semantics).
  localStorage.setItem("pratikshya_cart", JSON.stringify({
    lines: [
      { productId: "PF-PRD-3", color: "Red", size: "M", quantity: 1 },
      { productId: "PF-PRD-3", color: "red", size: "m", quantity: 2 },
    ],
  }));
  const deduped = restoreGuestCart();
  assert.equal(deduped.lines.length, 1);
  assert.equal(deduped.lines[0].quantity, 3);
});

test("authenticated coupon application posts to /cart/coupon (guests never touch it)", async () => {
  const calls = mockFetch(() => ({ ok: true, coupon: { code: "FESTIVE10" }, message: "FESTIVE10 is now part of your order." }));
  await apiApplyCoupon("FESTIVE10");
  assert.equal(calls[0].url.endsWith("/cart/coupon"), true);
  assert.equal(calls[0].options.headers.Authorization, "Bearer customer-token");
});

// ---------------------------------------------------------------------------
// Pricing trust — the client is never authoritative for authenticated money
// ---------------------------------------------------------------------------

test("server totals pass through unchanged even when local prices differ", () => {
  const state = serverCartToState({
    items: [{ id: "h1", product_id: "P1", product: { id: "P1", price: 100, stock: 9 }, quantity: 5, line_total: 500 }],
    totals: { subtotal: 500, shipping: 99, cod_fee: 0, total: 599 },
  });
  // A stale/different local catalogue price must not change the server money.
  assert.equal(state.totals.subtotal, 500);
  assert.equal(state.totals.total, 599);
  assert.equal(state.lines[0].lineTotal, 500, "line totals are the server's");
});

test("guest totals remain a clearly presentation-only local calculation", () => {
  const items = [{ product: { price: 2000, originalPrice: 2500 }, quantity: 2 }];
  const totals = calculateCartTotals(items, null);
  assert.equal(totals.subtotal, 4000);
  assert.equal(totals.productDiscount, 1000);
  // Below the ₹5,000 threshold the presentation adds the flat ₹99 shipping.
  assert.equal(totals.shipping, 99);
  assert.equal(totals.total, 4099);
});

// ---------------------------------------------------------------------------
// Wishlist — backend as source of truth, honest unavailability
// ---------------------------------------------------------------------------

test("wishlist operations hit the real backend routes", async () => {
  const calls = mockFetch(() => ({ ok: true, items: ["PF-PRD-1"], count: 1 }));
  await apiGetWishlist();
  await apiAddToWishlist("PF-PRD-2");
  await apiRemoveFromWishlist("PF-PRD-1");
  await apiToggleWishlist("PF-PRD-3");

  const path = (i) => `${calls[i].options.method} ${calls[i].url.split("/api/v1")[1]}`;
  assert.equal(path(0), "GET /wishlist");
  assert.equal(path(1), "POST /wishlist/PF-PRD-2");
  assert.equal(path(2), "DELETE /wishlist/PF-PRD-1");
  assert.equal(path(3), "POST /wishlist/PF-PRD-3/toggle");
  calls.forEach((call) => assert.equal(call.options.headers.Authorization, "Bearer customer-token"));
});

test("a wishlist API failure is not converted into empty success", async () => {
  mockFetch(() => jsonResponse({ detail: "Session expired. Please sign in again." }, 401));
  const result = await apiGetWishlist();
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.items, undefined, "no items key — cannot render as an empty wishlist");
});

test("adding an unavailable product surfaces the backend rejection", async () => {
  mockFetch(() => jsonResponse({ detail: "Product 'PF-PRD-X' is not available." }, 404));
  const result = await apiAddToWishlist("PF-PRD-X");
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.match(result.error, /not available/);
});

test("a saved product that no longer resolves is flagged unavailable, never dropped", () => {
  const entries = buildWishlistEntries(
    ["PF-PRD-1", "PF-PRD-GONE", "PF-PRD-PENDING"],
    ["PF-PRD-GONE"],
    (id) => (id === "PF-PRD-1" ? { id, name: "Resolved" } : null)
  );
  assert.equal(entries.length, 3, "every saved id is kept");
  assert.equal(entries[0].product?.name, "Resolved");
  assert.equal(entries[1].unavailable, true, "confirmed-gone id is honestly unavailable");
  assert.equal(entries[1].product, null);
  assert.equal(entries[2].unavailable, false, "not yet resolved ≠ unavailable (no false claim)");
});

test("cart → wishlist removes the bag line only after the wishlist add succeeds", async () => {
  const removeFromCartCalls = [];
  // Failure path: the bag line must survive a failed wishlist add.
  const failed = await moveLineToWishlist({
    item: { id: "h1", productId: "PF-PRD-1" },
    addToList: async () => ({ ok: false, message: "Product 'PF-PRD-1' is not available." }),
    removeFromCart: async (id) => { removeFromCartCalls.push(id); return { ok: true }; },
  });
  assert.equal(failed.ok, false);
  assert.equal(removeFromCartCalls.length, 0, "cart line untouched when the add fails");

  // Success path: add first, remove second.
  const order = [];
  const ok = await moveLineToWishlist({
    item: { id: "h1", productId: "PF-PRD-1" },
    addToList: async () => { order.push("add"); return { ok: true }; },
    removeFromCart: async () => { order.push("remove"); return { ok: true }; },
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(order, ["add", "remove"]);
});

// ---------------------------------------------------------------------------
// Customer profile & identity
// ---------------------------------------------------------------------------

test("profile normalisation honours backend camelCase loyalty and membership values", async () => {
  // The backend ProfileResponse serialises with camel aliases.
  mockFetch(() => ({
    ok: true,
    profile: {
      id: "u1",
      firstName: "Aditi",
      lastName: "Rao",
      email: "aditi@example.com",
      phone: "+919876543210",
      dateOfBirth: "1995-04-02",
      loyaltyTier: "PLATINUM",
      loyaltyPoints: 12500,
      createdAt: "2023-11-05T08:00:00Z",
    },
    addresses: [],
    preferences: {},
    security: { activeSessions: [] },
  }));
  const result = await apiGetMe();
  assert.equal(result.ok, true);
  assert.equal(result.profile.loyaltyTier, "PLATINUM", "no 'STANDARD' fabrication");
  assert.equal(result.profile.loyaltyPoints, 12500, "no zero fabrication");
  assert.equal(result.profile.memberSince, "2023", "membership year from the backend record");

  // Missing createdAt → honest empty, never the current year.
  mockFetch(() => ({
    ok: true,
    profile: { id: "u2", firstName: "A" },
    addresses: [],
    preferences: {},
    security: { activeSessions: [] },
  }));
  const noDate = await apiGetMe();
  assert.equal(noDate.profile.memberSince, "");
});

test("profile update PATCHes /customers/me with only backend-supported fields", async () => {
  const calls = mockFetch(() => ({ ok: true, profile: { id: "u1", firstName: "Aditi" } }));
  await apiUpdateProfile({ firstName: "Aditi", lastName: "Rao", email: "aditi@example.com", phone: "+919876543210", dateOfBirth: "1995-04-02" });
  assert.equal(calls[0].options.method, "PATCH");
  assert.equal(calls[0].url.endsWith("/customers/me"), true);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    firstName: "Aditi", lastName: "Rao", email: "aditi@example.com", phone: "+919876543210", dateOfBirth: "1995-04-02",
  });
});

test("backend profile validation errors surface with their status", async () => {
  mockFetch(() => jsonResponse({ detail: "That email address is already in use." }, 409));
  const result = await apiUpdateProfile({ email: "taken@example.com" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /already in use/);
});

test("customer password change calls the real endpoint with the customer token", async () => {
  const calls = mockFetch(() => ({ ok: true, message: "Password updated successfully." }));
  const result = await apiChangePasswordCustomer({ currentPassword: "old123", newPassword: "newsecret", confirmPassword: "newsecret" });
  assert.equal(result.ok, true);
  assert.equal(calls[0].url.endsWith("/auth/change-password"), true);
  assert.equal(calls[0].options.headers.Authorization, "Bearer customer-token");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    currentPassword: "old123", newPassword: "newsecret", confirmPassword: "newsecret",
  });

  // Wrong current password: the backend's own message surfaces.
  mockFetch(() => jsonResponse({ detail: "Current password is not correct." }, 422));
  const bad = await apiChangePasswordCustomer({ currentPassword: "wrong", newPassword: "newsecret", confirmPassword: "newsecret" });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /not correct/);

  // Mismatched confirmation is caught before any request.
  const calls2 = mockFetch(() => ({}));
  const mismatch = await apiChangePasswordCustomer({ currentPassword: "old", newPassword: "a", confirmPassword: "b" });
  assert.equal(mismatch.ok, false);
  assert.equal(calls2.length, 0);
});

test("revoke-others reads the backend count (snake or camel)", async () => {
  mockFetch(() => ({ ok: true, revoked_count: 2 }));
  assert.equal((await apiRevokeOtherSessions()).revokedCount, 2);
  mockFetch(() => ({ ok: true, revokedCount: 3 }));
  assert.equal((await apiRevokeOtherSessions()).revokedCount, 3);
});

// ---------------------------------------------------------------------------
// Addresses — backend records only
// ---------------------------------------------------------------------------

test("address operations hit the real backend routes with camel aliases", async () => {
  const calls = mockFetch(() => ({ ok: true, address: { id: "addr-1", fullName: "Aditi Rao" } }));
  await apiGetAddresses();
  await apiAddAddress({
    fullName: "Aditi Rao", phone: "+919876543210", addressLine: "Flat 402, Lotus Residency",
    landmark: "Near Club", city: "Bengaluru", state: "Karnataka", pincode: "560038",
    type: "Home", isDefault: true,
  });
  await apiUpdateAddress("addr-1", { city: "Bhubaneswar", state: "Odisha", pincode: "751001" });
  await apiDeleteAddress("addr-1");
  await apiSetDefaultAddress("addr-1");

  const path = (i) => `${calls[i].options.method} ${calls[i].url.split("/api/v1")[1]}`;
  assert.equal(path(0), "GET /customers/me/addresses");
  assert.equal(path(1), "POST /customers/me/addresses");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    fullName: "Aditi Rao", phone: "+919876543210", addressLine: "Flat 402, Lotus Residency",
    landmark: "Near Club", city: "Bengaluru", state: "Karnataka", pincode: "560038",
    type: "Home", isDefault: true,
  });
  assert.equal(path(2), "PATCH /customers/me/addresses/addr-1");
  assert.deepEqual(JSON.parse(calls[2].options.body), { city: "Bhubaneswar", state: "Odisha", pincode: "751001" });
  assert.equal(path(3), "DELETE /customers/me/addresses/addr-1");
  assert.equal(path(4), "POST /customers/me/addresses/addr-1/default");
  calls.forEach((call) => assert.equal(call.options.headers.Authorization, "Bearer customer-token"));
});

test("backend address validation errors surface with their status", async () => {
  mockFetch(() => jsonResponse({
    detail: [{ loc: ["body", "pincode"], msg: "Pincode must be a valid 6-digit Indian pincode." }],
  }, 422));
  const result = await apiAddAddress({ fullName: "A", phone: "+919876543210", addressLine: "x", city: "y", state: "z", pincode: "12345" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.match(result.error, /pincode/i);
});

test("address failures stay failures — no fabricated local record", async () => {
  mockFetch(() => jsonResponse({ detail: "Server error. Please try again shortly." }, 500));
  const result = await apiAddAddress({ fullName: "A", phone: "+919876543210", addressLine: "x", city: "y", state: "z", pincode: "560038" });
  assert.equal(result.ok, false);
  assert.equal(result.address, undefined, "no address object — nothing was created");
});

// ---------------------------------------------------------------------------
// Checkout compatibility — the Phase 2 trust model is untouched
// ---------------------------------------------------------------------------

test("the order request still carries identity only — no prices, totals or discounts", () => {
  const payload = buildPlaceOrderRequest({
    items: [
      { productId: "PF-PRD-1", color: "Red", size: "M", quantity: 2 },
      { id: "server-hash", productId: "PF-PRD-2", color: null, size: "Free Size", quantity: 1 },
    ],
    customer: { firstName: "Aditi", lastName: "Rao", email: "a@example.com", phone: "+919876543210" },
    address: { fullName: "Aditi Rao", phone: "+919876543210", addressLine: "x", city: "y", state: "z", pincode: "560038" },
    deliveryMethodId: "express",
    paymentMethodId: "upi",
    couponCode: "FESTIVE10",
    idempotencyKey: "attempt-1234",
  });
  const serialised = JSON.stringify(payload);
  assert.equal(serialised.includes("price"), false);
  assert.equal(serialised.includes("total"), false);
  assert.equal(serialised.includes("amount"), false);
  assert.equal(serialised.includes("discount"), false);
  // Server-line ids never leak into the order items.
  assert.deepEqual(payload.items, [
    { productId: "PF-PRD-1", color: "Red", size: "M", quantity: 2 },
    { productId: "PF-PRD-2", color: null, size: "Free Size", quantity: 1 },
  ]);
  assert.equal(payload.idempotencyKey, "attempt-1234");
});

// ---------------------------------------------------------------------------
// Recently viewed — the two stores joined (audit §9.2 / §23 Phase 4 item 3)
// ---------------------------------------------------------------------------

import {
  listRecentlyViewed,
  mergeGuestRecentlyViewed,
  recordRecentlyViewed,
  RECENTLY_VIEWED_STORAGE_KEY,
} from "../src/services/customer/recentlyViewed.js";
import { refreshCatalog } from "../src/services/catalog/catalogStore.js";
import { apiAddRecentlyViewed, apiGetRecentlyViewed } from "../src/services/api/productsApi.js";

const hydrateCatalogWith = async (ids) => {
  mockFetch((url) => {
    const value = String(url);
    if (value.includes("/products?")) {
      return {
        items: ids.map((id, index) => ({ id, name: `Piece ${index}`, price: 1000 + index })),
        total: ids.length,
        facets: {},
      };
    }
    if (value.includes("/categories?")) return { items: [] };
    if (value.includes("/collections?")) return { items: [] };
    return { ok: true };
  });
  await refreshCatalog();
};

test("Phase 4: authenticated recently-viewed reads the server history with the customer scope", async () => {
  localStorage.setItem("pf_access_token", "customer-token");
  const calls = mockFetch({ items: [{ id: "p1", name: "Piece", price: 5000 }], count: 1 });

  const result = await apiGetRecentlyViewed();

  assert.equal(result.ok, true);
  assert.equal(calls[0].url.endsWith("/api/v1/products/recently-viewed"), true);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer customer-token");
  assert.deepEqual(result.items.map((item) => item.id), ["p1"]);
});

test("Phase 4: authenticated recently-viewed writes POST the productId as a query parameter", async () => {
  localStorage.setItem("pf_access_token", "customer-token");
  const calls = mockFetch({ ok: true });

  const result = await apiAddRecentlyViewed("p1");

  assert.equal(result.ok, true);
  assert.equal(calls[0].url.includes("/api/v1/products/recently-viewed?productId=p1"), true);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, "Bearer customer-token");
});

test("Phase 4: guest recently-viewed store fronts repeats and caps at the documented limit", async () => {
  await hydrateCatalogWith(["p1", "p2"]);
  recordRecentlyViewed("p1", null);
  recordRecentlyViewed("p2", null);
  recordRecentlyViewed("p1", null);
  assert.deepEqual(listRecentlyViewed(null).map((entry) => entry.productId), ["p1", "p2"]);

  await hydrateCatalogWith(Array.from({ length: 15 }, (_, index) => `p${index}`));
  for (let index = 0; index < 15; index += 1) recordRecentlyViewed(`p${index}`, null);
  const list = listRecentlyViewed(null);
  assert.equal(list.length, 12);
  assert.equal(list[0].productId, "p14");
});

test("Phase 4: mergeGuestRecentlyViewed folds guest history into the customer scope once", async () => {
  await hydrateCatalogWith(["p1", "p2"]);
  recordRecentlyViewed("p1", null);
  recordRecentlyViewed("p2", null);

  const merged = mergeGuestRecentlyViewed("cu-1");

  assert.deepEqual(merged.map((entry) => entry.productId), ["p2", "p1"]);
  assert.deepEqual(listRecentlyViewed(null), [], "guest scope is cleared after the merge");
  assert.deepEqual(listRecentlyViewed("cu-1").map((entry) => entry.productId), ["p2", "p1"]);
  // Stored ids + timestamps only — never product data.
  const stored = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY));
  assert.deepEqual(stored.scopes.guest, [], "guest scope is emptied, not deleted");
  assert.deepEqual(Object.keys(stored.scopes["cu-1"][0]), ["productId", "viewedAt"]);
});
