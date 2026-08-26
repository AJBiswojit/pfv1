/**
 * Phase 3 regression suite — order read model, list, detail, tracking,
 * cancellation, invoice, returns, guest claim and status normalisation.
 *
 * The through-line of every check below is the Phase 3 honesty rule: the
 * UI may show what the backend actually stored and nothing else. Several
 * tests are explicit regressions against fabrication that used to happen
 * (invented tracking numbers, carriers, invoice numbers, estimated
 * delivery dates, and a payment status inferred from the payment method).
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  apiListOrders,
  apiGetOrder,
  apiGetTracking,
  apiCancelOrder,
  apiCreateReturn,
  apiClaimGuestOrders,
  apiAdminGetInvoice,
} from "../src/services/api/ordersApi.js";
import {
  buildOrderReadModel,
  buildTrackingReadModel,
  buildInvoiceReadModel,
  buildOrderStateFlags,
  isOrderCancellable,
  isOrderReturnable,
} from "../src/utils/orderReadModel.js";
import {
  canCancelOrder,
  canRequestReturnNow,
  canReturnOrder,
  matchesOrderSearch,
  normaliseOrder,
  returnBlockedReason,
  returnWindow,
} from "../src/utils/orders.js";
import { buildTrackingView } from "../src/services/orders/trackingService.js";
import orderConfig from "../src/config/orderConfig.js";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
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
  globalThis.window = globalThis;
  window.localStorage = storage;
  // apiClient broadcasts `pf:session-expired` on an unrecoverable 401.
  globalThis.dispatchEvent = () => true;
  window.dispatchEvent = globalThis.dispatchEvent;
});

afterEach(() => {
  delete globalThis.fetch;
});

/* ------------------------------------------------------------------ */
/* Fixtures — shaped exactly like the backend OrderResponse            */
/* ------------------------------------------------------------------ */

const BACKEND_ORDER = {
  id: "order-1",
  order_number: "PF-ORD-1A2B3C",
  customer_id: "cust-1",
  guest_email: null,
  guest_phone: null,
  customer: {
    firstName: "Asha",
    lastName: "Patel",
    fullName: "Asha Patel",
    email: "asha@example.com",
    phone: "9876543210",
  },
  status: "DELIVERED",
  payment_status: "PAID",
  payment_method: "upi",
  delivery_method: "express",
  subtotal: 2000,
  product_discount: 100,
  coupon_discount: 100,
  shipping_fee: 0,
  cod_fee: 0,
  total: 1800,
  coupon_code: "FLAT100",
  shipping_address: {
    fullName: "Asha Patel",
    phone: "9876543210",
    addressLine: "12 Market Street",
    city: "Kolkata",
    state: "WB",
    pincode: "700001",
    type: "home",
  },
  items: [
    {
      id: "line-1",
      product_id: "P-1",
      product_name: "Saree",
      product_image: "/images/saree.webp",
      sku: "SKU-1",
      color: "Ivory",
      size: null,
      unit_price: 1000,
      original_price: 1100,
      quantity: 2,
      line_total: 2000,
      returned_quantity: 0,
    },
  ],
  status_history: [
    { id: "h1", to_status: "ORDER_CONFIRMED", from_status: null, created_at: "2026-08-20T09:00:00Z" },
    { id: "h2", to_status: "SHIPPED", from_status: "ORDER_CONFIRMED", created_at: "2026-08-21T09:00:00Z" },
    { id: "h3", to_status: "DELIVERED", from_status: "SHIPPED", created_at: "2026-08-22T09:00:00Z" },
  ],
  returns: [],
  timeline: [],
  carrier: null,
  tracking_number: null,
  estimated_delivery: null,
  dispatched_at: "2026-08-21T09:00:00Z",
  delivered_at: "2026-08-22T09:00:00Z",
  cancelled_at: null,
  cancellation_reason: null,
  invoice_number: null,
  invoice_issued_at: null,
  created_at: "2026-08-20T09:00:00Z",
  updated_at: "2026-08-22T09:00:00Z",
};

const deliveredRecently = (overrides = {}) => ({
  ...BACKEND_ORDER,
  delivered_at: new Date(Date.now() - 86400000).toISOString(),
  ...overrides,
});

/* ================================================================== */
/* 1. Canonical read model                                            */
/* ================================================================== */

test("read model never invents a tracking number, carrier or delivery date", () => {
  const order = buildOrderReadModel(BACKEND_ORDER);

  assert.equal(order.tracking.trackingNumber, null);
  assert.equal(order.tracking.carrier, null);
  assert.equal(order.tracking.estimatedDelivery, null);
  assert.equal(order.tracking.carrierEventsAvailable, false);
  assert.equal(order.flags.hasTrackingIdentity, false);
  assert.equal(order.flags.hasEstimatedDelivery, false);
});

test("read model never invents an invoice number and never offers a download", () => {
  const order = buildOrderReadModel(BACKEND_ORDER);

  assert.equal(order.invoice.number, null);
  assert.equal(order.invoice.issuedAt, null);
  assert.equal(order.invoice.available, false);
  assert.equal(order.invoice.documentAvailable, false);
  assert.equal(order.invoice.downloadUrl, null);
  assert.equal(order.flags.hasInvoice, false);
});

test("read model keeps order status and payment status strictly separate", () => {
  const order = buildOrderReadModel({
    ...BACKEND_ORDER,
    status: "CANCELLED",
    payment_status: "PAID",
  });

  assert.equal(order.status, "CANCELLED");
  assert.equal(order.paymentStatus, "PAID");
  assert.equal(order.flags.isCancelled, true);
  // Cancelling an order does not change what was paid.
  assert.equal(order.flags.isPaid, true);
});

test("read model never derives payment status from the payment method", () => {
  const online = buildOrderReadModel({ ...BACKEND_ORDER, payment_method: "upi", payment_status: "PENDING" });
  const cod = buildOrderReadModel({ ...BACKEND_ORDER, payment_method: "cod", payment_status: "PAID" });

  assert.equal(online.paymentStatus, "PENDING", "a card/UPI order is not assumed paid");
  assert.equal(cod.paymentStatus, "PAID", "a COD order is not assumed pending");
});

test("read model exposes server-authoritative totals verbatim and omits tax", () => {
  const order = buildOrderReadModel(BACKEND_ORDER);

  assert.deepEqual(order.pricing, {
    subtotal: 2000,
    productDiscount: 100,
    couponDiscount: 100,
    couponCode: "FLAT100",
    shipping: 0,
    codFee: 0,
    total: 1800,
  });
  // The order schema has no tax column — no tax line is ever presented.
  assert.equal(order.taxAvailable, false);
  assert.equal("tax" in order.pricing, false);
});

test("read model derives returnable quantity per line from the backend record", () => {
  const order = buildOrderReadModel({
    ...BACKEND_ORDER,
    items: [{ ...BACKEND_ORDER.items[0], quantity: 3, returned_quantity: 2 }],
  });
  assert.equal(order.items[0].returnableQuantity, 1);
});

test("read model keeps orders that have no readable lines instead of dropping them", () => {
  const order = buildOrderReadModel({ ...BACKEND_ORDER, items: [] });
  assert.equal(order.id, "order-1");
  assert.deepEqual(order.items, []);
  assert.equal(order.itemCount, 0);
});

/* ================================================================== */
/* 2. Order list                                                      */
/* ================================================================== */

test("apiListOrders requests a server page with an allow-listed sort", async () => {
  const calls = mockFetch(() =>
    jsonResponse({ ok: true, orders: [BACKEND_ORDER], total: 12, page: 2, page_size: 5 })
  );

  const result = await apiListOrders({ page: 2, pageSize: 5, sort: "oldest" });

  assert.equal(result.ok, true);
  assert.equal(result.total, 12);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 5);
  assert.match(calls[0].url, /page=2/);
  assert.match(calls[0].url, /pageSize=5/);
  assert.match(calls[0].url, /sort=oldest/);
});

test("a failed order list is reported as a failure with its status — never as an empty list", async () => {
  mockFetch(() => jsonResponse({ error: { message: "Server exploded" } }, 500));

  const result = await apiListOrders();

  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(result.orders, undefined, "no empty success payload is fabricated");
});

test("order-list failures carry distinct statuses for 401 / 403 / 404", async () => {
  for (const status of [401, 403, 404]) {
    mockFetch(() => jsonResponse({ detail: "nope" }, status));
    const result = await apiListOrders();
    assert.equal(result.ok, false);
    assert.equal(result.status, status, `status ${status} must be preserved`);
    assert.ok(result.error, "each failure carries a message the screen can show");
  }
});

test("order search matches the human-facing order number, not just the id", () => {
  const order = buildOrderReadModel(BACKEND_ORDER);
  assert.equal(matchesOrderSearch(order, "PF-ORD-1A2B3C"), true);
  assert.equal(matchesOrderSearch(order, "order-1"), true);
  assert.equal(matchesOrderSearch(order, "not-a-match"), false);
});

/* ================================================================== */
/* 3. Order detail                                                    */
/* ================================================================== */

test("apiGetOrder returns the canonical read model for a single order", async () => {
  mockFetch(() => jsonResponse({ ok: true, order: BACKEND_ORDER }));

  const result = await apiGetOrder("order-1");

  assert.equal(result.ok, true);
  assert.equal(result.order.orderNumber, "PF-ORD-1A2B3C");
  assert.equal(result.order.customer.fullName, "Asha Patel");
  assert.equal(result.order.items[0].lineTotal, 2000);
  assert.equal(result.order.statusHistory.length, 3);
});

test("a 403 on order detail is distinguishable from a 404 by status", async () => {
  mockFetch(() => jsonResponse({ detail: "forbidden" }, 403));
  const forbidden = await apiGetOrder("someone-elses-order");
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.status, 403);

  mockFetch(() => jsonResponse({ detail: "missing" }, 404));
  const missing = await apiGetOrder("no-such-order");
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 404);
});

/* ================================================================== */
/* 4. Status normalisation                                            */
/* ================================================================== */

test("status normalisation uses one vocabulary and real backend values only", () => {
  const order = buildOrderReadModel({ ...BACKEND_ORDER, status: "OUT_FOR_DELIVERY" });
  assert.equal(order.status, "OUT_FOR_DELIVERY");
  assert.equal(order.statusLabel, orderConfig.getOrderStatus("OUT_FOR_DELIVERY").label);
  assert.equal(order.paymentStatusLabel, orderConfig.getPaymentStatus("PAID").label);
});

test("normaliseOrder no longer defaults an unknown status to ORDER_CONFIRMED", () => {
  const order = normaliseOrder({ id: "local-1", items: [{ lineId: "l1", quantity: 1, price: 10 }] });
  assert.equal(order.status, null, "an unrecorded status stays unknown");
  assert.equal(order.paymentStatus, null, "payment status is never guessed");
});

test("fabrication constants are gone from the order config surface", () => {
  assert.equal("MOCK_CARRIERS" in orderConfig, false);
  assert.equal("FULFILMENT_ORIGIN" in orderConfig, false);
  assert.equal("TRACKING_ID_LABEL" in orderConfig, false);
});

/* ================================================================== */
/* 5. Tracking                                                        */
/* ================================================================== */

const BACKEND_TRACKING = {
  order_id: "order-1",
  order_status: "SHIPPED",
  payment_status: "PAID",
  carrier: null,
  tracking_number: null,
  estimated_delivery: null,
  dispatched_at: null,
  delivered_at: null,
  cancelled_at: null,
  carrier_tracking_available: false,
  carrier_events_available: false,
  events: [
    { status: "ORDER_CONFIRMED", timestamp: "2026-08-20T09:00:00Z", source: "STATUS_HISTORY" },
    { status: "SHIPPED", timestamp: "2026-08-21T09:00:00Z", source: "STATUS_HISTORY" },
  ],
};

test("tracking events come only from persisted status history", async () => {
  mockFetch(() => jsonResponse({ ok: true, ...BACKEND_TRACKING }));

  const result = await apiGetTracking("order-1");

  assert.equal(result.ok, true);
  assert.equal(result.tracking.events.length, 2);
  assert.equal(result.tracking.events[0].status, "ORDER_CONFIRMED");
  assert.equal(result.tracking.events[0].at, "2026-08-20T09:00:00.000Z");
  assert.equal(result.tracking.carrierEventsAvailable, false);
});

test("tracking view never dates a step that was not recorded", () => {
  const view = buildTrackingView(buildTrackingReadModel(BACKEND_TRACKING), { customerView: true });

  const recorded = view.steps.filter((step) => step.recorded);
  const unrecorded = view.steps.filter((step) => !step.recorded);

  assert.ok(recorded.length >= 2);
  for (const step of recorded) assert.ok(step.at, "recorded steps carry their real timestamp");
  for (const step of unrecorded) {
    assert.equal(step.at, null, "unrecorded steps carry no date at all");
    assert.equal(step.projected, false, "no step is ever marked as an estimate");
  }
});

test("tracking view never produces a transit location", () => {
  const view = buildTrackingView(buildTrackingReadModel(BACKEND_TRACKING));
  for (const step of view.steps) {
    assert.equal("location" in step, false);
  }
  assert.equal(JSON.stringify(view).includes("Bhubaneswar"), false);
});

test("tracking reports shipment identity as unavailable until dispatch records it", () => {
  const undispatched = buildTrackingReadModel(BACKEND_TRACKING);
  assert.equal(undispatched.carrierTrackingAvailable, false);
  assert.equal(undispatched.trackingNumber, null);
  assert.equal(undispatched.carrier, null);

  const dispatched = buildTrackingReadModel({
    ...BACKEND_TRACKING,
    carrier: "Blue Dart",
    tracking_number: "BD-9",
    carrier_tracking_available: true,
    estimated_delivery: "2026-08-28T00:00:00Z",
  });
  assert.equal(dispatched.carrierTrackingAvailable, true);
  assert.equal(dispatched.trackingNumber, "BD-9");
  assert.equal(dispatched.carrier, "Blue Dart");
  assert.equal(dispatched.estimatedDelivery, "2026-08-28T00:00:00.000Z");
  // Even with a waybill, no courier scans are ever claimed.
  assert.equal(dispatched.carrierEventsAvailable, false);
});

test("a tracking request failure is reported with its status, not as empty tracking", async () => {
  mockFetch(() => jsonResponse({ detail: "forbidden" }, 403));
  const result = await apiGetTracking("order-1");
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

/* ================================================================== */
/* 6. Cancellation                                                    */
/* ================================================================== */

test("cancellation eligibility matches the backend's cancellable status set", () => {
  for (const status of orderConfig.CANCELLABLE_STATUSES) {
    assert.equal(isOrderCancellable({ status }), true, `${status} should be cancellable`);
  }
  for (const status of ["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"]) {
    assert.equal(isOrderCancellable({ status }), false, `${status} must not be cancellable`);
  }
  // The util and the read model share one definition.
  assert.equal(canCancelOrder, isOrderCancellable);
});

test("cancelling returns the server's own order record", async () => {
  mockFetch(() =>
    jsonResponse({
      ok: true,
      order: { ...BACKEND_ORDER, status: "CANCELLED", cancelled_at: "2026-08-23T09:00:00Z" },
    })
  );

  const result = await apiCancelOrder("order-1", { reason: "customer_request" });

  assert.equal(result.ok, true);
  assert.equal(result.order.status, "CANCELLED");
  assert.equal(result.order.cancellation.at, "2026-08-23T09:00:00.000Z");
  // Phase 2 rule preserved: a paid order stays paid; no refund is claimed.
  assert.equal(result.order.paymentStatus, "PAID");
});

test("a 409 conflict on cancellation surfaces as a conflict, not a success", async () => {
  mockFetch(() => jsonResponse({ error: { message: "Order already cancelled." } }, 409));
  const result = await apiCancelOrder("order-1");
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /already cancelled/i);
});

/* ================================================================== */
/* 7. Invoice                                                         */
/* ================================================================== */

test("invoice read model reports availability honestly and never a URL", () => {
  const none = buildInvoiceReadModel({ order_id: "order-1", invoice_number: null, available: false });
  assert.equal(none.available, false);
  assert.equal(none.number, null);
  assert.equal(none.documentAvailable, false);
  assert.equal(none.downloadUrl, null);

  const issued = buildInvoiceReadModel({
    order_id: "order-1",
    invoice_number: "INV-9",
    issued_at: "2026-08-22T09:00:00Z",
    available: true,
    document_available: false,
  });
  assert.equal(issued.available, true);
  assert.equal(issued.number, "INV-9");
  assert.equal(issued.documentAvailable, false, "no invoice document exists anywhere");
  assert.equal(issued.downloadUrl, null);
});

test("apiAdminGetInvoice normalises the backend invoice metadata", async () => {
  mockFetch(() => jsonResponse({ ok: true, order_id: "order-1", invoice_number: null, available: false }));
  const result = await apiAdminGetInvoice("order-1");
  assert.equal(result.ok, true);
  assert.equal(result.invoice.available, false);
  assert.equal(result.invoice.documentAvailable, false);
});

/* ================================================================== */
/* 8. Returns                                                         */
/* ================================================================== */

test("returns are only offered for a delivered order with un-returned lines", () => {
  assert.equal(isOrderReturnable(buildOrderReadModel({ ...BACKEND_ORDER, status: "SHIPPED" })), false);
  assert.equal(isOrderReturnable(buildOrderReadModel(BACKEND_ORDER)), true);

  const fullyReturned = buildOrderReadModel({
    ...BACKEND_ORDER,
    items: [{ ...BACKEND_ORDER.items[0], quantity: 2, returned_quantity: 2 }],
  });
  assert.equal(isOrderReturnable(fullyReturned), false);
  assert.equal(canReturnOrder, isOrderReturnable);
});

test("the UI mirrors the backend's return window instead of offering a request it would reject", () => {
  const fresh = buildOrderReadModel(deliveredRecently());
  const freshWindow = returnWindow(fresh);
  assert.equal(freshWindow.known, true);
  assert.equal(freshWindow.open, true);
  assert.equal(canRequestReturnNow(fresh), true);

  const expired = buildOrderReadModel({
    ...BACKEND_ORDER,
    delivered_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  });
  assert.equal(returnWindow(expired).open, false);
  assert.equal(canRequestReturnNow(expired), false, "an expired window must not offer a return");
  assert.match(returnBlockedReason(expired), /window/i);
});

test("with no recorded delivery date the return window is unknown, not assumed open", () => {
  const noDate = buildOrderReadModel({ ...BACKEND_ORDER, delivered_at: null });
  const state = returnWindow(noDate);
  assert.equal(state.known, false);
  assert.equal(state.open, false);
  assert.equal(canRequestReturnNow(noDate), false);
});

test("creating a return posts real per-line quantities and a real pickup method", async () => {
  const calls = mockFetch(() =>
    jsonResponse({
      ok: true,
      return_order: {
        id: "ret-1",
        order_id: "order-1",
        return_number: "PF-RET-0001",
        status: "RETURN_REQUESTED",
        pickup_method: "SCHEDULED_PICKUP",
        refund_amount: 1000,
        refund_status: "NOT_REQUESTED",
        items: [
          { id: "ri-1", order_item_id: "line-1", product_id: "P-1", product_name: "Saree", quantity: 1, reason: "damaged", refund_amount: 1000 },
        ],
        created_at: "2026-08-23T09:00:00Z",
      },
    })
  );

  const result = await apiCreateReturn("order-1", {
    items: [{ lineId: "line-1", quantity: 1, reason: "damaged" }],
    pickupMethod: "SCHEDULED_PICKUP",
  });

  const sent = JSON.parse(calls[0].options.body);
  assert.deepEqual(sent.items, [{ lineId: "line-1", quantity: 1, reason: "damaged" }]);
  assert.equal(sent.pickupMethod, "SCHEDULED_PICKUP");

  assert.equal(result.ok, true);
  assert.equal(result.return_order.returnNumber, "PF-RET-0001");
  assert.equal(result.return_order.refundAmount, 1000);
  assert.equal(result.return_order.refundStatus, "NOT_REQUESTED");
});

test("a 422 rule violation on a return surfaces the backend's own reason", async () => {
  mockFetch(() =>
    jsonResponse({ error: { message: "Return window of 7 days has expired." } }, 422)
  );

  const result = await apiCreateReturn("order-1", { items: [], pickupMethod: "SCHEDULED_PICKUP" });

  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.match(result.error, /7 days/);
});

test("returns embedded on the order are normalised for the admin desks", () => {
  const order = buildOrderReadModel({
    ...BACKEND_ORDER,
    returns: [
      {
        id: "ret-1",
        order_id: "order-1",
        return_number: "PF-RET-0001",
        status: "APPROVED",
        pickup_method: "CUSTOMER_DROP_OFF",
        refund_amount: 1000,
        refund_status: "NOT_REQUESTED",
        items: [],
        created_at: "2026-08-23T09:00:00Z",
      },
    ],
  });

  assert.equal(order.returns.length, 1);
  assert.equal(order.returns[0].returnNumber, "PF-RET-0001");
  assert.equal(order.flags.hasReturns, true);
  assert.equal(order.flags.hasActiveReturn, true);
  assert.equal(order.activeReturn.id, "ret-1");
});

/* ================================================================== */
/* 9. Guest claim (Phase 2 trust model preserved)                     */
/* ================================================================== */

test("guest claim still sends no client-supplied email", async () => {
  const calls = mockFetch(() => jsonResponse({ ok: true, claimed: 2 }));

  const result = await apiClaimGuestOrders();

  assert.equal(result.ok, true);
  assert.equal(result.claimed, 2);
  assert.equal(JSON.parse(calls[0].options.body).email, null);
});

test("a failed guest claim reports its status instead of silently claiming nothing", async () => {
  mockFetch(() => jsonResponse({ detail: "forbidden" }, 403));
  const result = await apiClaimGuestOrders();
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
});

/* ================================================================== */
/* 10. Derived state flags                                            */
/* ================================================================== */

test("state flags answer every order question from real backend values", () => {
  const flags = buildOrderStateFlags(buildOrderReadModel(deliveredRecently()));
  assert.equal(flags.isDelivered, true);
  assert.equal(flags.isPaid, true);
  assert.equal(flags.canCancel, false);
  assert.equal(flags.canRequestReturn, true);
  assert.equal(flags.hasInvoice, false);
  assert.equal(flags.hasTrackingIdentity, false);
});
