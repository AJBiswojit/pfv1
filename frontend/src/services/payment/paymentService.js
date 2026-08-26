/**
 * PRATIKSHYA FASHON — Payment service abstraction (backend-owned).
 *
 * Payment sessions are created and verified by the backend
 * (POST /payments/session, GET /payments/session/{id}, POST /payments/verify).
 * This module exposes the status vocabulary the checkout UI already uses
 * plus compatibility stubs that always delegate to the backend. No demo
 * scenarios, no mock resolution, no fake success.
 */

import {
  apiCreatePaymentSession,
  apiGetPaymentSession,
  apiVerifyPayment,
  apiCancelPaymentSession,
} from "../api/paymentsApi";

export const PAYMENT_STATUS = {
  IDLE: "IDLE",
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  CANCELLED: "CANCELLED",
};

/**
 * Backend payment service. `createSession` returns the backend session;
 * `resolve` reads the session status; `verify` only reports the backend
 * verification result — it never fabricates success.
 */
export const getPaymentService = () => ({
  createSession: async (payload) => apiCreatePaymentSession(payload),
  getSession: async (sessionId) => apiGetPaymentSession(sessionId),
  verify: async (payload) => apiVerifyPayment(payload),
  cancelPayment: async (sessionId, reason = "") => {
    await apiCancelPaymentSession(sessionId, reason);
    return { ok: true };
  },
});

export default { PAYMENT_STATUS, getPaymentService };
