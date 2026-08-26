/**
 * PRATIKSHYA FASHON — Payments API
 * Maps to API_CONTRACT.md § PAYMENTS + Razorpay integration
 *
 * POST /payments/session        — create Razorpay order + session
 * GET  /payments/session/{id}   — get session status
 * POST /payments/session/{id}/cancel — cancel active session
 * POST /payments/verify         — verify Razorpay HMAC signature (client callback)
 * POST /offers/validate         — validate coupon code (single checkout gate)
 */
import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

/**
 * POST /payments/session
 * Creates a Razorpay order for online payment, or a local COD session.
 *
 * For online: returns { ok, sessionId, razorpayOrderId, razorpayKeyId, amountPaise }
 * For COD:    returns { ok, sessionId, paymentMethod: "cod", message }
 */
export async function apiCreatePaymentSession({ orderId, paymentMethod, orderDraft, idempotencyKey }) {
  try {
    const data = await apiClient.post("/payments/session", {
      order_id:         orderId,
      payment_method:   paymentMethod,
      order_draft:      orderDraft ?? null,
      idempotency_key:  idempotencyKey ?? null,
    });
    return { ok: true, ...data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /payments/session/{sessionId}
 * Returns current session status.
 */
export async function apiGetPaymentSession(sessionId) {
  try {
    const data = await apiClient.get(`/payments/session/${sessionId}`);
    return { ok: true, session: data.session ?? data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /payments/session/{sessionId}/cancel
 */
export async function apiCancelPaymentSession(sessionId, reason = "") {
  try {
    const data = await apiClient.post(`/payments/session/${sessionId}/cancel`, { reason });
    return { ok: true, ...data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /payments/verify
 * Called after Razorpay checkout modal succeeds.
 * body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
export async function apiVerifyPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  try {
    const data = await apiClient.post("/payments/verify", {
      razorpay_order_id:   razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature:  razorpaySignature,
    });
    return {
      ok:            data.ok ?? true,
      message:       data.message ?? "Payment verified.",
      paymentStatus: data.paymentStatus ?? data.payment_status ?? null,
      orderId:       data.orderId ?? data.order_id ?? null,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /offers/validate
 * The SINGLE checkout gate. Called by the frontend before applying a coupon.
 */
export async function apiValidateCoupon({ code, cartItems = [], customerId, customerEmail }) {
  try {
    const data = await apiClient.post("/offers/validate", {
      code,
      cart_items:     cartItems,
      customer_id:    customerId   ?? null,
      customer_email: customerEmail ?? null,
    }, { skipAuth: true });
    return {
      ok:      data.ok ?? false,
      coupon:  data.coupon  ?? null,
      discount: data.discount ?? 0,
      error:   data.error   ?? null,
    };
  } catch (err) {
    return handleError(err);
  }
}
