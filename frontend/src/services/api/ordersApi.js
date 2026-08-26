/**
 * PRATIKSHYA FASHON — Orders API
 * Maps to API_CONTRACT.md § ORDERS
 *
 * Customer, Admin (fulfillment pipeline), Returns desk
 */
import { apiClient, ApiError } from "./apiClient";
import { getDeliveryMethod, PAYMENT_METHODS } from "../../config/checkoutConfig";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

/**
 * Normalise a backend order (snake_case OrderResponse) into the camelCase
 * read model the UI consumes. Done here in the API layer — UI components
 * never scatter field mapping.
 *
 * Synthesised sub-objects (Phase 2 — required by the order confirmation
 * and account order views):
 *   - customer: { firstName, lastName, fullName, email, phone }
 *       from the server-assembled `customer` field (guest fallback:
 *       shipping address + guest email)
 *   - address:  from `shipping_address`
 *   - pricing:  from the authoritative top-level totals
 *   - items:    camelCase line items (lineId, name, image, lineTotal, …)
 *   - paymentMethod / deliveryMethod: { id, label } objects
 *
 * All raw backend fields are preserved via spread so admin pages keep
 * working unchanged.
 */
function normOrder(o) {
  if (!o) return o;

  const address = o.shipping_address ?? o.shippingAddress ?? {};

  const customer = o.customer
    ? {
        firstName: o.customer.firstName ?? "",
        lastName: o.customer.lastName ?? "",
        fullName: o.customer.fullName ?? [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ").trim(),
        email: o.customer.email ?? o.guest_email ?? "",
        phone: o.customer.phone ?? address.phone ?? null,
      }
    : {
        firstName: (address.fullName || "").split(" ")[0] ?? "",
        lastName: (address.fullName || "").split(" ").slice(1).join(" ") ?? "",
        fullName: address.fullName ?? "",
        email: o.guest_email ?? "",
        phone: o.guest_phone ?? address.phone ?? null,
      };

  // Tolerate both backend strings and legacy local snapshots (objects).
  const paymentId =
    typeof o.payment_method === "string"
      ? o.payment_method
      : typeof o.paymentMethod === "string"
        ? o.paymentMethod
        : o.paymentMethod?.id ?? null;
  const paymentLabel =
    o.paymentMethod?.label ??
    PAYMENT_METHODS.find((method) => method.id === paymentId)?.label ??
    paymentId ?? "";

  const deliveryId =
    typeof o.delivery_method === "string"
      ? o.delivery_method
      : typeof o.deliveryMethod === "string"
        ? o.deliveryMethod
        : o.deliveryMethod?.id ?? "standard";
  const delivery = getDeliveryMethod(deliveryId);

  return {
    ...o,
    id: o.id,
    orderNumber: o.order_number ?? o.orderNumber ?? null,
    status: o.status,
    paymentStatus: o.payment_status ?? o.paymentStatus ?? "PENDING",
    channel: o.channel ?? "ONLINE",
    source: o.source ?? "storefront",
    customerId: o.customer_id ?? o.customerId ?? null,
    customer,
    address,
    items: (o.items ?? []).map((line) => ({
      ...line,
      lineId: line.id ?? line.lineId ?? null,
      productId: line.product_id ?? line.productId ?? null,
      name: line.product_name ?? line.name ?? "",
      image: line.product_image ?? line.image ?? null,
      sku: line.sku ?? null,
      color: line.color ?? null,
      size: line.size ?? null,
      quantity: line.quantity ?? 1,
      unitPrice: line.unit_price ?? line.unitPrice ?? 0,
      originalPrice: line.original_price ?? line.originalPrice ?? 0,
      lineTotal: line.line_total ?? line.lineTotal ?? 0,
      returnedQuantity: line.returned_quantity ?? line.returnedQuantity ?? 0,
    })),
    pricing: o.pricing ?? {
      subtotal: o.subtotal ?? 0,
      productDiscount: o.product_discount ?? o.productDiscount ?? 0,
      couponDiscount: o.coupon_discount ?? o.couponDiscount ?? 0,
      couponCode: o.coupon_code ?? o.couponCode ?? null,
      shipping: o.shipping_fee ?? o.shippingFee ?? 0,
      codFee: o.cod_fee ?? o.codFee ?? 0,
      total: o.total ?? 0,
    },
    paymentMethod: { id: paymentId, label: paymentLabel },
    paymentMethodId: paymentId,
    deliveryMethod: {
      id: delivery.id,
      label: delivery.label,
      estimate: delivery.caption ?? "",
    },
    deliveryMethodId: deliveryId,
    tracking: o.tracking ?? {},
    invoice: o.invoice ?? {},
    fulfillment: o.fulfillment ?? {},
    timeline: o.timeline ?? [],
    statusHistory: o.status_history ?? o.statusHistory ?? [],
    returns: o.returns ?? [],
    refund: o.refund ?? null,
    cancellation: o.cancellation ?? null,
    shipment: o.shipment ?? null,
    notes: o.notes ?? { customer: "", internal: [] },
    createdAt: o.created_at ?? o.createdAt ?? new Date().toISOString(),
    updatedAt: o.updated_at ?? o.updatedAt ?? new Date().toISOString(),
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

/** GET /orders?page=&pageSize= */
export async function apiListOrders({ page = 1, pageSize = 20 } = {}) {
  try {
    const data = await apiClient.get(`/orders?page=${page}&pageSize=${pageSize}`, { scope: "customer" });
    const orders = (data.orders ?? data.items ?? data ?? []).map(normOrder);
    return { ok: true, orders, total: data.total ?? orders.length };
  } catch (err) { return handleError(err); }
}

/** GET /orders/{orderId} */
export async function apiGetOrder(orderId) {
  try {
    const data = await apiClient.get(`/orders/${orderId}`, { scope: "customer" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** GET /orders/{orderId}/tracking */
export async function apiGetTracking(orderId) {
  try {
    const data = await apiClient.get(`/orders/${orderId}/tracking`, { scope: "customer" });
    return { ok: true, tracking: data };
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
    return { ok: true, orders, total: data.total ?? orders.length };
  } catch (err) { return handleError(err); }
}

/** GET /admin/orders/{id} */
export async function apiAdminGetOrder(id) {
  try {
    const data = await apiClient.get(`/admin/orders/${id}`, { scope: "admin" });
    return { ok: true, order: normOrder(data.order ?? data) };
  } catch (err) { return handleError(err); }
}

/** GET /admin/orders/{id}/invoice */
export async function apiAdminGetInvoice(id) {
  try {
    const data = await apiClient.get(`/admin/orders/${id}/invoice`, { scope: "admin" });
    return { ok: true, invoice: data };
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
