import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  apiCreatePaymentSession,
  apiVerifyPayment,
  apiCancelPaymentSession,
  normalisePaymentSession,
} from "../src/services/api/paymentsApi.js";
import {
  apiPlaceOrder,
  apiGetOrder,
  apiClaimGuestOrders,
} from "../src/services/api/ordersApi.js";
import {
  buildPlaceOrderRequest,
  validateCustomer,
  newAttemptId,
} from "../src/utils/checkout.js";

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

/** Captures fetch calls and returns queued responses in order. */
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
});

afterEach(() => {
  delete globalThis.fetch;
});

/* ------------------------------------------------------------------ */
/* Canonical order request (trust boundary)                            */
/* ------------------------------------------------------------------ */

test("buildPlaceOrderRequest sends identity only — no prices, totals or discounts", () => {
  const body = buildPlaceOrderRequest({
    items: [
      { id: "line-1", productId: "P-1", color: "Ivory", size: "M", quantity: 2, product: { price: 1500 } },
      { id: "line-2", productId: "P-2", quantity: 1 },
    ],
    customer: { firstName: "  Asha ", lastName: " Patel", email: " Asha@Example.com ", phone: "9876543210" },
    address: {
      fullName: "Asha Patel",
      phone: "9876543210",
      addressLine: "12 Market Street",
      landmark: "Tower",
      city: "Kolkata",
      state: "WB",
      pincode: "700001",
      type: "home",
    },
    deliveryMethodId: "express",
    paymentMethodId: "upi",
    couponCode: "FLAT100",
    idempotencyKey: "attempt-1",
  });

  assert.deepEqual(body.items, [
    { productId: "P-1", color: "Ivory", size: "M", quantity: 2 },
    { productId: "P-2", color: null, size: null, quantity: 1 },
  ]);
  assert.deepEqual(body.customer, {
    firstName: "Asha",
    lastName: "Patel",
    email: "Asha@Example.com",
    phone: "9876543210",
  });
  assert.equal(body.deliveryMethod, "express");
  assert.equal(body.paymentMethod, "upi");
  assert.equal(body.couponCode, "FLAT100");
  assert.equal(body.idempotencyKey, "attempt-1");

  // No amount/pricing fields may ever be sent.
  const json = JSON.stringify(body);
  assert.ok(!/"total"/.test(json));
  assert.ok(!/"amount"/.test(json));
  assert.ok(!/"price"/.test(json));
  assert.ok(!/"discount"/.test(json));
});

test("validateCustomer requires separate first and last names", () => {
  assert.equal(validateCustomer({ firstName: "Asha", lastName: "Patel", email: "a@b.co", phone: "9876543210" }).ok, true);
  assert.equal(validateCustomer({ firstName: "", lastName: "Patel", email: "a@b.co", phone: "9876543210" }).ok, false);
  assert.equal(validateCustomer({ firstName: "Asha", lastName: "   ", email: "a@b.co", phone: "9876543210" }).ok, false);
  assert.equal(validateCustomer({ fullName: "Asha Patel", email: "a@b.co", phone: "9876543210" }).ok, false);
});

test("newAttemptId returns a unique, string attempt id", () => {
  const a = newAttemptId();
  const b = newAttemptId();
  assert.equal(typeof a, "string");
  assert.ok(a.length >= 8);
  assert.notEqual(a, b);
});

/* ------------------------------------------------------------------ */
/* Payments API — normalisation + canonical session flow               */
/* ------------------------------------------------------------------ */

test("normalisePaymentSession maps snake_case to camelCase", () => {
  const session = normalisePaymentSession({
    session_id: "sess-1",
    order_id: "order-1",
    razorpay_order_id: "order_RZP1",
    razorpay_key_id: "rzp_test_key",
    amount_paise: 123400,
    currency: "INR",
    payment_method: "upi",
    status: "CREATED",
  });
  assert.equal(session.sessionId, "sess-1");
  assert.equal(session.orderId, "order-1");
  assert.equal(session.razorpayOrderId, "order_RZP1");
  assert.equal(session.razorpayKeyId, "rzp_test_key");
  assert.equal(session.amountPaise, 123400);
  assert.equal(session.paymentMethod, "upi");
  assert.equal(session.status, "CREATED");
});

test("apiCreatePaymentSession sends order_id + guest_email and normalises the response", async () => {
  const calls = mockFetch((url) => {
    assert.ok(String(url).endsWith("/api/v1/payments/session"));
    return jsonResponse({
      ok: true,
      session_id: "sess-9",
      status: "CREATED",
      razorpay_order_id: "order_RZP9",
      razorpay_key_id: "rzp_key",
      amount_paise: 109900,
      currency: "INR",
      prefill: { email: "g@x.co" },
    });
  });

  const result = await apiCreatePaymentSession({
    orderId: "order-1",
    paymentMethod: "upi",
    idempotencyKey: "attempt-1",
    guestEmail: "g@x.co",
  });

  assert.equal(result.ok, true);
  assert.equal(result.sessionId, "sess-9");
  assert.equal(result.razorpayOrderId, "order_RZP9");
  assert.equal(result.razorpayKeyId, "rzp_key");
  assert.equal(result.amountPaise, 109900);
  assert.deepEqual(result.prefill, { email: "g@x.co" });

  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.order_id, "order-1");
  assert.equal(sent.payment_method, "upi");
  assert.equal(sent.idempotency_key, "attempt-1");
  assert.equal(sent.guest_email, "g@x.co");
  // No untrusted draft amount is sent.
  assert.equal(sent.order_draft, undefined);
});

test("apiVerifyPayment sends guest_email and returns camelCase orderStatus", async () => {
  const calls = mockFetch(() =>
    jsonResponse({
      ok: true,
      message: "Payment verified and captured successfully.",
      payment_status: "PAID",
      order_id: "order-1",
      order_status: "ORDER_CONFIRMED",
    })
  );

  const result = await apiVerifyPayment({
    razorpayOrderId: "order_RZP1",
    razorpayPaymentId: "pay_1",
    razorpaySignature: "sig",
    guestEmail: "g@x.co",
  });

  assert.equal(result.ok, true);
  assert.equal(result.paymentStatus, "PAID");
  assert.equal(result.orderId, "order-1");
  assert.equal(result.orderStatus, "ORDER_CONFIRMED");

  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.razorpay_order_id, "order_RZP1");
  assert.equal(sent.razorpay_payment_id, "pay_1");
  assert.equal(sent.razorpay_signature, "sig");
  assert.equal(sent.guest_email, "g@x.co");
});

test("apiCancelPaymentSession sends guest_email for guest-owned sessions", async () => {
  const calls = mockFetch(() => jsonResponse({ session_id: "s1", status: "CANCELLED" }));

  const result = await apiCancelPaymentSession("s1", "Customer cancelled", "g@x.co");

  assert.equal(result.ok, true);
  assert.equal(result.status, "CANCELLED");
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.reason, "Customer cancelled");
  assert.equal(sent.guest_email, "g@x.co");
});

test("apiCreatePaymentSession surfaces backend rejection as { ok:false }", async () => {
  mockFetch(() => jsonResponse({ detail: "This order has been cancelled and can no longer be paid." }, 422));

  const result = await apiCreatePaymentSession({
    orderId: "order-x",
    paymentMethod: "upi",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /cancelled/i);
});

/* ------------------------------------------------------------------ */
/* Orders API — canonical placement + read-model normalisation         */
/* ------------------------------------------------------------------ */

test("apiPlaceOrder forwards the canonical body unchanged (guest scope)", async () => {
  const calls = mockFetch(() => jsonResponse({ ok: true, order: { id: "o-1", status: "PENDING_PAYMENT" } }));

  const body = buildPlaceOrderRequest({
    items: [{ id: "l1", productId: "P-1", quantity: 1 }],
    customer: { firstName: "Asha", lastName: "Patel", email: "a@b.co", phone: "1" },
    address: { fullName: "Asha Patel", phone: "1", addressLine: "x", city: "Kolkata", state: "WB", pincode: "700001" },
    deliveryMethodId: "standard",
    paymentMethodId: "cod",
    idempotencyKey: "att-1",
  });

  const result = await apiPlaceOrder(body);

  assert.equal(result.ok, true);
  assert.equal(result.order.id, "o-1");
  const sent = JSON.parse(calls[0].options.body);
  assert.deepEqual(sent, body);
});

const BACKEND_ORDER = {
  id: "order-1",
  order_number: "PF-ORD-1A2B3C",
  customer_id: null,
  guest_email: "guest@example.com",
  guest_phone: "9876543210",
  customer: {
    firstName: "Asha",
    lastName: "Patel",
    fullName: "Asha Patel",
    email: "guest@example.com",
    phone: "9876543210",
  },
  status: "ORDER_CONFIRMED",
  payment_status: "PENDING",
  payment_method: "cod",
  delivery_method: "express",
  subtotal: 2000,
  product_discount: 100,
  coupon_discount: 100,
  shipping_fee: 0,
  cod_fee: 49,
  total: 1949,
  coupon_code: "FLAT100",
  shipping_address: {
    fullName: "Asha Patel",
    phone: "9876543210",
    addressLine: "12 Market Street",
    landmark: "Tower",
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
  timeline: [],
  created_at: "2026-08-26T10:00:00Z",
  updated_at: "2026-08-26T10:00:00Z",
};

test("apiGetOrder normalises the backend order into the UI read model", async () => {
  mockFetch(() => jsonResponse({ ok: true, order: BACKEND_ORDER }));

  const result = await apiGetOrder("order-1");

  assert.equal(result.ok, true);
  const order = result.order;

  // Identity + canonical statuses
  assert.equal(order.customerId, null);
  assert.equal(order.paymentStatus, "PENDING");
  assert.equal(order.status, "ORDER_CONFIRMED");
  assert.equal(order.orderNumber, "PF-ORD-1A2B3C");

  // Assembled customer object (required by the confirmation page)
  assert.equal(order.customer.fullName, "Asha Patel");
  assert.equal(order.customer.email, "guest@example.com");
  assert.equal(order.customer.firstName, "Asha");

  // Shipping address projection
  assert.equal(order.address.fullName, "Asha Patel");
  assert.equal(order.address.pincode, "700001");

  // Authoritative pricing projection
  assert.deepEqual(order.pricing, {
    subtotal: 2000,
    productDiscount: 100,
    couponDiscount: 100,
    couponCode: "FLAT100",
    shipping: 0,
    codFee: 49,
    total: 1949,
  });

  // Camel line items
  assert.equal(order.items[0].lineId, "line-1");
  assert.equal(order.items[0].name, "Saree");
  assert.equal(order.items[0].image, "/images/saree.webp");
  assert.equal(order.items[0].lineTotal, 2000);
  assert.equal(order.items[0].unitPrice, 1000);

  // Method label objects
  assert.equal(order.paymentMethod.id, "cod");
  assert.equal(typeof order.paymentMethod.label, "string");
  assert.ok(order.paymentMethod.label.length > 0);
  assert.equal(order.deliveryMethod.id, "express");
  assert.equal(typeof order.deliveryMethod.label, "string");
  assert.equal(typeof order.deliveryMethod.estimate, "string");

  // Raw fields preserved for admin pages
  assert.equal(order.subtotal, 2000);
  assert.equal(order.payment_method, "cod");
});

test("normOrder falls back to guest fields when the customer object is absent", async () => {
  const stripped = { ...BACKEND_ORDER, customer: undefined };
  mockFetch(() => jsonResponse({ ok: true, order: stripped }));

  const result = await apiGetOrder("order-1");
  assert.equal(result.order.customer.fullName, "Asha Patel");
  assert.equal(result.order.customer.email, "guest@example.com");
});

test("apiClaimGuestOrders sends no untrusted email by default and reports claimed count", async () => {
  const calls = mockFetch(() => jsonResponse({ ok: true, claimed: 2, message: "2 order(s) claimed successfully." }));

  const result = await apiClaimGuestOrders();

  assert.equal(result.ok, true);
  assert.equal(result.claimed, 2);
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.email, null);
});
