/**
 * PRATIKSHYA FASHON — Orders API
 * Maps to API_CONTRACT.md § ORDERS
 *
 * Customer, Admin (fulfillment pipeline), Returns desk
 */
import { apiClient, ApiError } from "./apiClient";
import {
  buildInvoiceReadModel,
  buildOrderReadModel,
  buildTrackingReadModel,
  normaliseReturnRecord,
} from "../../utils/orderReadModel";

/**
 * Failures are surfaced with the HTTP status attached so screens can react
 * distinctly to 401 / 403 / 404 / 409 / 422 / 500 instead of collapsing
 * every failure into an empty "no data" success state.
 *
 * `status: 0` means the request never reached the server (network/offline).
 */
function handleError(err) {
  if (err instanceof ApiError) {
    return { ok: false, error: err.message, status: err.status, data: err.data ?? null };
  }
  return { ok: false, error: "An unexpected error occurred.", status: null, data: null };
}

/**
 * Normalise a backend order (snake_case OrderResponse) into the canonical
 * camelCase read model the UI consumes. The mapping itself lives in
 * `utils/orderReadModel.js` so customer pages, admin pages and tests all
 * share one definition of an order.
 *
 * Phase 3 honesty rules enforced by that module:
 *   - No field is invented. `tracking`, `invoice`, `cancellation`,
 *     `returns` and `statusHistory` reflect exactly what the backend
 *     stored; where nothing was stored the value is `null` / `[]` and the
 *     matching `*available` flag is `false`, so the UI can show an honest
 *     "not available" state instead of a blank that looks like data.
 *   - `status` (order lifecycle) and `paymentStatus` (payment lifecycle)
 *     stay separate and are never derived from each other or from the
 *     payment method.
 *   - Raw backend fields are preserved via spread so existing admin pages
 *     keep working unchanged.
 */
const normOrder = buildOrderReadModel;

/**
 * Return records are normalised by the same canonical read model used for
 * the `returns[]` embedded on an order, so a return looks identical
 * whether it arrived from the returns endpoint or from the order payload.
 */
const normReturn = normaliseReturnRecord;

// ===========================================================================
// CUSTOMER
// ===========================================================================

/**
 * POST /orders — place a canonical checkout order.
 *
 * `body` is the canonical request built by checkout (see
 * `buildPlaceOrderRequest`): items (productId/color/size/quantity only),
 * customer {firstName, lastName, email, phone}, address, deliveryMethod,
 * paymentMethod, couponCode and idempotencyKey. No prices, totals or
 * discounts are sent — the backend computes them authoritatively.
 *
 * Guests are supported: without a session token the backend creates a
 * guest order claimable later via the verified-email claim flow.
 */
export async function apiPlaceOrder(body) {
  try {
    const data = await apiClient.post("/orders", body, { scope: "customer" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/**
 * GET /orders?page=&pageSize=&sort=
 *
 * Server-side paging and ordering — the customer's own orders only
 * (ownership is enforced by the backend from the session, never by a
 * client-supplied customer id). `sort` is allow-listed: newest | oldest.
 */
export async function apiListOrders({ page = 1, pageSize = 20, sort = "newest" } = {}) {
  try {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort });
    const data = await apiClient.get(`/orders?${qs}`, { scope: "customer" });
    const orders = (data.orders ?? data.items ?? data ?? []).map(normOrder);
    return {
      ok: true,
      orders,
      total: data.total ?? orders.length,
      page: data.page ?? page,
      pageSize: data.page_size ?? data.pageSize ?? pageSize,
    };
  } catch (err) { return handleError(err); }
}

/** GET /orders/{orderId} */
export async function apiGetOrder(orderId) {
  try {
    const data = await apiClient.get(`/orders/${orderId}`, { scope: "customer" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/**
 * GET /orders/{orderId}/tracking
 *
 * Returns real, stored progress only: persisted status-history events plus
 * whatever carrier / tracking number / estimated delivery an admin
 * recorded at dispatch. No courier integration exists, so
 * `carrierEventsAvailable` is always false and no shipment scans, transit
 * locations or projected dates are ever produced.
 */
export async function apiGetTracking(orderId) {
  try {
    const data = await apiClient.get(`/orders/${orderId}/tracking`, { scope: "customer" });
    return { ok: true, tracking: buildTrackingReadModel(data.tracking ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /orders/{orderId}/cancel */
export async function apiCancelOrder(orderId, { reason, note } = {}) {
  try {
    const data = await apiClient.post(`/orders/${orderId}/cancel`, { reason, note }, { scope: "customer" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /orders/{orderId}/returns  body: { items, pickupMethod } */
export async function apiCreateReturn(orderId, body) {
  try {
    const data = await apiClient.post(`/orders/${orderId}/returns`, body, { scope: "customer" });
    return { ok: true, return_order: normReturn(data.return_order ?? data.returnOrder ?? data) };
  } catch (err) { return handleError(err); }
}

/** GET /orders/{orderId}/returns/{returnId} */
export async function apiGetReturn(orderId, returnId) {
  try {
    const data = await apiClient.get(`/orders/${orderId}/returns/${returnId}`, { scope: "customer" });
    return { ok: true, return_order: normReturn(data.return_order ?? data.returnOrder ?? data) };
  } catch (err) { return handleError(err); }
}

/**
 * POST /orders/claim-guest
 *
 * The backend derives the claim identity from the authenticated account's
 * own email — the `email` argument is optional and, if supplied, must
 * match it (otherwise the server rejects with 403). Prefer calling with no
 * argument.
 */
export async function apiClaimGuestOrders(email = null) {
  try {
    const data = await apiClient.post("/orders/claim-guest", { email }, { scope: "customer" });
    return { ok: true, claimed: data.claimed ?? 0, message: data.message ?? null };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// ADMIN — List & detail
// ===========================================================================

/** GET /admin/orders?status=&customerId=&q=&page=&pageSize= */
export async function apiAdminListOrders({ status, customerId, q, page = 1, pageSize = 20 } = {}) {
  try {
    const qs = new URLSearchParams({ page, pageSize });
    if (status)     qs.set("status", status);
    if (customerId) qs.set("customerId", customerId);
    if (q)          qs.set("q", q);
    const data = await apiClient.get(`/admin/orders?${qs}`, { scope: "admin" });
    const orders = (data.orders ?? data.items ?? data ?? []).map(normOrder);
    return {
      ok: true,
      orders,
      total: data.total ?? orders.length,
      page: data.page ?? page,
      pageSize: data.page_size ?? data.pageSize ?? pageSize,
    };
  } catch (err) { return handleError(err); }
}

/** GET /admin/orders/{id} */
export async function apiAdminGetOrder(id) {
  try {
    const data = await apiClient.get(`/admin/orders/${id}`, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/**
 * GET /admin/orders/{id}/invoice
 *
 * Invoice METADATA only. The backend stores `invoice_number` /
 * `invoice_issued_at` but no service ever generates an invoice document,
 * so `documentAvailable` is false and `downloadUrl` is always null. The UI
 * must not offer a download it cannot honour.
 */
export async function apiAdminGetInvoice(id) {
  try {
    const data = await apiClient.get(`/admin/orders/${id}/invoice`, { scope: "admin" });
    return { ok: true, invoice: buildInvoiceReadModel(data.invoice ?? data) };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// ADMIN — Fulfillment pipeline
// ===========================================================================

const adminOrderPost = (path, body = {}) => async (id) => {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/${path}`, body, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
};

export const apiAdminAllocateOrder     = adminOrderPost("allocate");
export const apiAdminStartPicking      = adminOrderPost("pick/start");
export const apiAdminMarkPacked        = adminOrderPost("pack");
export const apiAdminMarkReady         = adminOrderPost("ready");
export const apiAdminMarkOutForDelivery = adminOrderPost("out-for-delivery");
export const apiAdminMarkDelivered     = adminOrderPost("deliver");

/** POST /admin/orders/{id}/fulfillment  body: { locationId, handlerId } */
export async function apiAdminAssignFulfillment(id, body) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/fulfillment`, body, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/pick/item  body: { orderItemId } */
export async function apiAdminPickItem(id, orderItemId) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/pick/item`, { orderItemId }, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/dispatch  body: { carrier?, trackingNumber?, estimatedDelivery? } */
export async function apiAdminDispatchOrder(id, body) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/dispatch`, body, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/cancel  body: { reason?, note? } */
export async function apiAdminCancelOrder(id, body = {}) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/cancel`, body, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/notes  body: { note } */
export async function apiAdminAddNote(id, note) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/notes`, { note }, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/status  body: { status, note? } */
export async function apiAdminApplyStatus(id, status, note) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/status`, { status, note }, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/force-status  body: { status, reason } */
export async function apiAdminForceStatus(id, status, reason) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/force-status`, { status, reason }, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// ADMIN — Returns desk
// ===========================================================================

/** GET /admin/returns */
export async function apiAdminListReturns({ status, orderId, customerId, page = 1, pageSize = 20 } = {}) {
  try {
    const qs = new URLSearchParams({ page, pageSize });
    if (status)     qs.set("status", status);
    if (orderId)    qs.set("orderId", orderId);
    if (customerId) qs.set("customerId", customerId);
    const data = await apiClient.get(`/admin/returns?${qs}`, { scope: "admin" });
    const returns = (data.returns ?? data.items ?? data ?? []).map(normReturn);
    return { ok: true, returns, total: data.total ?? returns.length };
  } catch (err) { return handleError(err); }
}

/** GET /admin/returns/{id} */
export async function apiAdminGetReturn(id) {
  try {
    const data = await apiClient.get(`/admin/returns/${id}`, { scope: "admin" });
    return { ok: true, return_order: normReturn(data.return_order ?? data.returnOrder ?? data) };
  } catch (err) { return handleError(err); }
}

const returnPost = (path, bodyFn = () => ({})) => async (id, options = {}) => {
  try {
    const data = await apiClient.post(`/admin/returns/${id}/${path}`, bodyFn(options), { scope: "admin" });
    return { ok: true, return_order: normReturn(data.return_order ?? data.returnOrder ?? data) };
  } catch (err) { return handleError(err); }
};

export const apiAdminApproveReturn      = returnPost("approve");
export const apiAdminRejectReturn       = returnPost("reject",          (o) => ({ reason: o.reason, customerMessage: o.customerMessage }));
export const apiAdminSchedulePickup     = returnPost("schedule-pickup", (o) => ({ scheduledAt: o.scheduledAt, pickupAddress: o.pickupAddress }));
export const apiAdminReceiveReturn      = returnPost("receive",         (o) => ({ packageCondition: o.packageCondition, notes: o.notes }));
export const apiAdminInspectReturn      = returnPost("inspect",         (o) => ({ inspectionCondition: o.inspectionCondition, notes: o.notes }));
export const apiAdminInitiateRefund     = returnPost("refund/initiate");
export const apiAdminCompleteRefund     = returnPost("refund/complete");
