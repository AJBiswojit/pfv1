/**
 * PRATIKSHYA FASHON — Checkout coupon adapter (backend-driven).
 *
 * Coupon offers are backend-owned (GET /offers, POST /offers/validate).
 * These helpers read from the backend-fed offer store — no hardcoded
 * coupon list, no demo codes.
 */

import offerRepository, {
  OFFER_MESSAGES,
  toCheckoutCoupon,
  validateOffer,
} from "../../services/offers/offerRepository";

export const coupons = [];

export const COUPON_UNAVAILABLE_MESSAGE = OFFER_MESSAGES.UNAVAILABLE;

export const getCoupons = (customer = {}) =>
  offerRepository.listCustomerVisible(customer).map(toCheckoutCoupon);

export const getCoupon = (code) => offerRepository.getCheckoutCoupon(code);

/**
 * Validates a code against the backend. Returns { ok } — the caller shows
 * the real API error, never a fake acceptance.
 */
export function validateCoupon(code, items, options = {}) {
  return validateOffer(code, {
    items,
    appliedCode: options.appliedCode,
    customerId: options.customerId,
    customerEmail: options.customerEmail,
  });
}

export default {
  coupons,
  getCoupons,
  getCoupon,
  validateCoupon,
  COUPON_UNAVAILABLE_MESSAGE,
};
