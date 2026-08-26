/**
 * PRATIKSHYA FASHON — Payments API
 * Maps to API_CONTRACT.md § PAYMENTS + Razorpay integration
 *
 * POST /payments/session        — create Razorpay order against a pending order
 * GET  /payments/session/{id}   — get session status
 * POST /payments/session/{id}/cancel — cancel active session
 * POST /payments/verify         — verify Razorpay HMAC signature (client callback)
 * POST /offers/validate         — validate coupon code (single checkout gate)
 *
 * Response normalisation (Phase 2):
 *   The backend is the single source of truth and speaks snake_case. All
 *   session/payment field translation happens HERE, in the API layer —
 *   UI components never scatter field mapping.
 *
 * Ownership (Phase 2):
 *   Guest checkouts pass `guestEmail` on session create/verify/cancel.
 *   The server matches it against the order's own guest email; a mismatch
 *   is rejected. Signed-in callers are matched by their session identity.
 */
import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

/**
 * Normalise a backend payment session (snake_case) to the camelCase
 * shape the frontend consumes.
 */
export function normalisePaymentSession(raw = {}) {
  return {
    sessionId: raw.session_id ?? raw.sessionId ?? null,
    orderId: raw.order_id ?? raw.orderId ?? null,
    razorpayOrderId: raw.razorpay_order_id ?? raw.razorpayOrderId ?? null,
    razorpayPaymentId: raw.razorpay_payment_id ?? raw.razorpayPaymentId ?? null,
    razorpayKeyId: raw.razorpay_key_id ?? raw.razorpayKeyId ?? null,
    amountPaise: raw.amount_paise ?? raw.amountPaise ?? 0,
    currency: raw.currency ?? "INR",
    paymentMethod: raw.payment_method ?? raw.paymentMethod ?? null,
    status: raw.status ?? null,
    paidAt: raw.paid_at ?? raw.paidAt ?? null,
    cancelledAt: raw.cancelled_at ?? raw.cancelledAt ?? null,
    expiresAt: raw.expires_at ?? raw.expiresAt ?? null,
    failureReason: raw.failure_reason ?? raw.failureReason ?? null,
    failureCode: raw.failure_code ?? raw.failureCode ?? null,
    createdAt: raw.created_at ?? raw.createdAt ?? null,
    updatedAt: raw.updated_at ?? raw.updatedAt ?? null,
  };
}

/**
 * POST /payments/session
 *
 * Canonical Phase 2 flow: the order already exists (created by POST /orders
 * at checkout). The backend charges the order's authoritative total.
 *
 * Returns (camelCase):
 *   { ok, sessionId, razorpayOrderId, razorpayKeyId, amountPaise, currency, prefill, status }
 */
export async function apiCreatePaymentSession({
  orderId,
  paymentMethod,
  idempotencyKey,
  guestEmail,
}) {
  try {
    const data = await apiClient.post(
      "/payments/session",
      {
        order_id: orderId,
        payment_method: paymentMethod,
        idempotency_key: idempotencyKey ?? null,
        guest_email: guestEmail ?? null,
      },
      { scope: "customer" }
    );
    return {
      ok: true,
      ...normalisePaymentSession(data),
      prefill: data.prefill ?? null,
      message: data.message ?? null,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /payments/session/{sessionId}
 * Returns the current session status (camelCase).
 */
export async function apiGetPaymentSession(sessionId, guestEmail = null) {
  try {
    const query = guestEmail ? `?guestEmail=${encodeURIComponent(guestEmail)}` : "";
    const data = await apiClient.get(`/payments/session/${sessionId}${query}`, {
      scope: "customer",
    });
    const session = data.session ?? data;
    return { ok: true, session: normalisePaymentSession(session) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /payments/session/{sessionId}/cancel
 */
export async function apiCancelPaymentSession(sessionId, reason = "", guestEmail = null) {
  try {
    const data = await apiClient.post(
      `/payments/session/${sessionId}/cancel`,
      { reason, guest_email: guestEmail ?? null },
      { scope: "customer" }
    );
    return { ok: true, ...normalisePaymentSession(data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /payments/verify
 * Called after the Razorpay checkout modal succeeds. The backend recomputes
 * the HMAC-SHA256 signature — the client never asserts payment success.
 *
 * Returns (camelCase):
 *   { ok, message, paymentStatus, orderId, orderStatus }
 */
export async function apiVerifyPayment({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  guestEmail,
}) {
  try {
    const data = await apiClient.post(
      "/payments/verify",
      {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
        guest_email: guestEmail ?? null,
      },
      { scope: "customer" }
    );
    return {
      ok: data.ok ?? true,
      message: data.message ?? "Payment verified.",
      paymentStatus: data.paymentStatus ?? data.payment_status ?? null,
      orderId: data.orderId ?? data.order_id ?? null,
      orderStatus: data.orderStatus ?? data.order_status ?? null,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /offers/validate
 * The SINGLE checkout gate. Called by the frontend before applying a coupon.
 * The order boundary revalidates and recomputes the discount authoritatively.
 */
export async function apiValidateCoupon({ code, cartItems = [], customerId, customerEmail }) {
  try {
    const data = await apiClient.post(
      "/offers/validate",
      {
        code,
        cart_items: cartItems,
        customer_id: customerId ?? null,
        customer_email: customerEmail ?? null,
      },
      { scope: "none" }
    );
    return {
      ok: data.ok ?? false,
      coupon: data.coupon ?? null,
      discount: data.discount ?? 0,
      error: data.error ?? null,
    };
  } catch (err) {
    return handleError(err);
  }
}
