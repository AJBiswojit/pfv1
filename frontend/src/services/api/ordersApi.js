/**
 * PRATIKSHYA FASHON — Orders API
 * Maps to API_CONTRACT.md § ORDERS
 *
 * Customer, Admin (fulfillment pipeline), Returns desk
 */
import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

function normOrder(o) {
  if (!o) return o;
  return {
    ...o,
    id:             o.id,
    status:         o.status,
    paymentStatus:  o.payment_status   ?? o.paymentStatus   ?? "PENDING",
    channel:        o.channel          ?? "ONLINE",
    source:         o.source           ?? "storefront",
    customerId:     o.customer_id      ?? o.customerId      ?? null,
    customer:       o.customer         ?? {},
    items:          o.items            ?? [],
    pricing:        o.pricing          ?? {},
    tracking:       o.tracking         ?? {},
    invoice:        o.invoice          ?? {},
    fulfillment:    o.fulfillment       ?? {},
    timeline:       o.timeline         ?? [],
    statusHistory:  o.status_history   ?? o.statusHistory   ?? [],
    returns:        o.returns          ?? [],
    refund:         o.refund           ?? null,
    cancellation:   o.cancellation     ?? null,
    shipment:       o.shipment         ?? null,
    notes:          o.notes            ?? { customer: "", internal: [] },
    createdAt:      o.created_at       ?? o.createdAt       ?? new Date().toISOString(),
    updatedAt:      o.updated_at       ?? o.updatedAt       ?? new Date().toISOString(),
  };
}

function normReturn(r) {
  if (!r) return r;
  return {
    ...r,
    id:         r.id,
    orderId:    r.order_id  ?? r.orderId  ?? "",
    status:     r.status,
    items:      r.items     ?? [],
    createdAt:  r.created_at ?? r.createdAt ?? new Date().toISOString(),
  };
}

// ===========================================================================
// CUSTOMER
// ===========================================================================

/** POST /orders  — place an order */
export async function apiPlaceOrder(body) {
  try {
    const data = await apiClient.post("/orders", body);
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** GET /orders?page=&pageSize= */
export async function apiListOrders({ page = 1, pageSize = 20 } = {}) {
  try {
    const data = await apiClient.get(`/orders?page=${page}&pageSize=${pageSize}`);
    const orders = (data.orders ?? data.items ?? data ?? []).map(normOrder);
    return { ok: true, orders, total: data.total ?? orders.length };
  } catch (err) { return handleError(err); }
}

/** GET /orders/{orderId} */
export async function apiGetOrder(orderId) {
  try {
    const data = await apiClient.get(`/orders/${orderId}`);
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** GET /orders/{orderId}/tracking */
export async function apiGetTracking(orderId) {
  try {
    const data = await apiClient.get(`/orders/${orderId}/tracking`);
    return { ok: true, tracking: data };
  } catch (err) { return handleError(err); }
}

/** POST /orders/{orderId}/cancel */
export async function apiCancelOrder(orderId, { reason, note } = {}) {
  try {
    const data = await apiClient.post(`/orders/${orderId}/cancel`, { reason, note });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /orders/{orderId}/returns  body: { items, pickupMethod } */
export async function apiCreateReturn(orderId, body) {
  try {
    const data = await apiClient.post(`/orders/${orderId}/returns`, body);
    return { ok: true, return_order: normReturn(data.return_order ?? data.returnOrder ?? data) };
  } catch (err) { return handleError(err); }
}

/** GET /orders/{orderId}/returns/{returnId} */
export async function apiGetReturn(orderId, returnId) {
  try {
    const data = await apiClient.get(`/orders/${orderId}/returns/${returnId}`);
    return { ok: true, return_order: normReturn(data.return_order ?? data.returnOrder ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /orders/claim-guest  body: { email } */
export async function apiClaimGuestOrders(email) {
  try {
    const data = await apiClient.post("/orders/claim-guest", { email });
    return { ok: true, claimed: data.claimed ?? 0 };
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
    const data = await apiClient.get(`/admin/orders?${qs}`);
    const orders = (data.orders ?? data.items ?? data ?? []).map(normOrder);
    return { ok: true, orders, total: data.total ?? orders.length };
  } catch (err) { return handleError(err); }
}

/** GET /admin/orders/{id} */
export async function apiAdminGetOrder(id) {
  try {
    const data = await apiClient.get(`/admin/orders/${id}`);
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** GET /admin/orders/{id}/invoice */
export async function apiAdminGetInvoice(id) {
  try {
    const data = await apiClient.get(`/admin/orders/${id}/invoice`);
    return { ok: true, invoice: data };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// ADMIN — Fulfillment pipeline
// ===========================================================================

const adminOrderPost = (path, body = {}) => async (id) => {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/${path}`, body);
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
    const data = await apiClient.post(`/admin/orders/${id}/fulfillment`, body);
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/pick/item  body: { orderItemId } */
export async function apiAdminPickItem(id, orderItemId) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/pick/item`, { orderItemId });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/dispatch  body: { carrier?, trackingNumber?, estimatedDelivery? } */
export async function apiAdminDispatchOrder(id, body) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/dispatch`, body);
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/cancel  body: { reason?, note? } */
export async function apiAdminCancelOrder(id, body = {}) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/cancel`, body);
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/notes  body: { note } */
export async function apiAdminAddNote(id, note) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/notes`, { note });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/status  body: { status, note? } */
export async function apiAdminApplyStatus(id, status, note) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/status`, { status, note });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/orders/{id}/force-status  body: { status, reason } */
export async function apiAdminForceStatus(id, status, reason) {
  try {
    const data = await apiClient.post(`/admin/orders/${id}/force-status`, { status, reason });
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
    const data = await apiClient.get(`/admin/returns?${qs}`);
    const returns = (data.returns ?? data.items ?? data ?? []).map(normReturn);
    return { ok: true, returns, total: data.total ?? returns.length };
  } catch (err) { return handleError(err); }
}

/** GET /admin/returns/{id} */
export async function apiAdminGetReturn(id) {
  try {
    const data = await apiClient.get(`/admin/returns/${id}`);
    return { ok: true, return_order: normReturn(data.return_order ?? data.returnOrder ?? data) };
  } catch (err) { return handleError(err); }
}

const returnPost = (path, bodyFn = () => ({})) => async (id, options = {}) => {
  try {
    const data = await apiClient.post(`/admin/returns/${id}/${path}`, bodyFn(options));
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
