/**
 * PRATIKSHYA FASHON — Checkout configuration.
 *
 * The single home for checkout-level demo rules: delivery methods and
 * pricing, the cash-on-delivery fee, payment method metadata and the demo
 * payment scenarios. Values live here so they can never scatter through
 * JSX, and every consumer (the delivery selector, the order summary, the
 * pricing utilities) reads the same source of truth.
 *
 * Shipping thresholds deliberately reference `COMMERCE_DEFAULTS` so
 * checkout, bag and Admin Settings share one authored default. Runtime
 * fees resolve through `readShippingRules` / `readPaymentRules`.
 */

import { COMMERCE_DEFAULTS } from "./commerceDefaults";

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

/**
 * The delivery methods offered at checkout. Demo rules only.
 *
 * `freeAtThreshold` keeps the Phase 6 shipping agreement: standard
 * delivery is complimentary at or above the free-shipping threshold and
 * carries the flat bag fee below it. Express is a premium lane that never
 * drops below its own fee.
 */
export const DELIVERY_METHODS = [
  {
    id: "standard",
    label: "Standard Delivery",
    caption: "3–5 business days",
    fee: COMMERCE_DEFAULTS.defaultShippingFee,
    freeAtThreshold: true,
  },
  {
    id: "express",
    label: "Express Delivery",
    caption: "1–2 business days",
    fee: COMMERCE_DEFAULTS.expressDeliveryFee,
    freeAtThreshold: false,
  },
];

/** Resolves a delivery method id, falling back to standard. */
export const getDeliveryMethod = (id) =>
  DELIVERY_METHODS.find((method) => method.id === id) ?? DELIVERY_METHODS[0];

/** The flat surcharge carried by cash-on-delivery orders, when applicable. */
export const COD_FEE = COMMERCE_DEFAULTS.codFee;

/* ------------------------------------------------------------------ */
/* Payment methods                                                     */
/* ------------------------------------------------------------------ */

/**
 * The payment methods offered at checkout. Method CHOICES are presentation;
 * the money itself is real backend flow: online methods create a payment
 * session (`POST /payments/session`) resolved via Razorpay and verified
 * server-side (`POST /payments/verify`), while COD places the order with
 * payment PENDING until delivery. See CheckoutContext.startPayment.
 */
export const PAYMENT_METHODS = [
  {
    id: "upi",
    label: "UPI",
    description: "Google Pay · PhonePe · Paytm",
  },
  {
    id: "card",
    label: "Credit / Debit Card",
    description: "Visa · Mastercard · RuPay",
  },
  {
    id: "netbanking",
    label: "Net Banking",
    description: "All major Indian banks",
  },
  {
    id: "cod",
    label: "Cash on Delivery",
    description: `Pay on arrival · ${`₹${COD_FEE.toLocaleString("en-IN")}`} fee`,
  },
];

/** UPI app choices — visual selection only. */
export const UPI_APPS = ["Google Pay", "PhonePe", "Paytm", "BHIM"];

/** Bank list for the net-banking selector. */
export const NET_BANKING_BANKS = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
];

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

/** The checkout journey in order. Confirmation is a separate page. */
export const CHECKOUT_STEPS = ["customer", "delivery", "review", "payment"];

export default {
  DELIVERY_METHODS,
  getDeliveryMethod,
  COD_FEE,
  PAYMENT_METHODS,
  UPI_APPS,
  NET_BANKING_BANKS,
  CHECKOUT_STEPS,
};
