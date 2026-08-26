/**
 * PRATIKSHYA FASHON — Canonical order read model (Phase 3).
 *
 * One place that turns a backend order response into the shape the UI
 * consumes, and one place that derives every order-state question the UI
 * asks ("can this be cancelled?", "is there an invoice?", "is tracking
 * available?").
 *
 * Rules this module exists to enforce:
 *
 *   1. Backend truth only. Every field is either a real backend value or
 *      an explicit `null` / `false`. Nothing is invented — no fake
 *      tracking numbers, carriers, delivery dates, invoice URLs or return
 *      statuses. Where the backend cannot answer, the read model says so
 *      (`*Available: false`) and the UI shows an honest unavailable state.
 *   2. Order status and payment status are separate values and are never
 *      merged, inferred from one another, or derived from the payment
 *      method.
 *   3. Components never re-map snake_case. The API layer calls
 *      `buildOrderReadModel` once; components read camelCase fields.
 *
 * Backend contract consumed here (see PHASE_3_IMPLEMENTATION_REPORT.md §2):
 *   OrderResponse / AdminOrderResponse — snake_case, top-level totals,
 *   `items[]`, `status_history[]`, `timeline[]`, `returns[]`, dispatch
 *   fields (`carrier`, `tracking_number`, `estimated_delivery`,
 *   `dispatched_at`, `delivered_at`), cancellation fields and invoice
 *   metadata (`invoice_number`, `invoice_issued_at`).
 */

import {
  ACTIVE_RETURN_STATUSES,
  CANCELLABLE_STATUSES,
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
  RETURNABLE_STATUSES,
  getOrderStatus,
  getPaymentStatus,
  getReturnStatus,
} from "../config/orderConfig";
import { getDeliveryMethod, PAYMENT_METHODS } from "../config/checkoutConfig";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Backend timestamps are ISO strings; anything unusable becomes null. */
const isoOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(value).toISOString();
};

const strOrNull = (value) => {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/* ------------------------------------------------------------------ */
/* Sub-projections                                                     */
/* ------------------------------------------------------------------ */

/** Shipping address snapshot recorded at order time (Phase 2 shape). */
export function normaliseOrderAddress(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    fullName: strOrNull(raw.fullName ?? raw.full_name),
    phone: strOrNull(raw.phone),
    addressLine: strOrNull(raw.addressLine ?? raw.address_line),
    landmark: strOrNull(raw.landmark),
    city: strOrNull(raw.city),
    state: strOrNull(raw.state),
    pincode: strOrNull(raw.pincode),
    type: strOrNull(raw.type),
  };
}

function normaliseCustomer(order, address) {
  const raw = order.customer;
  if (raw && typeof raw === "object") {
    const first = raw.firstName ?? raw.first_name ?? "";
    const last = raw.lastName ?? raw.last_name ?? "";
    return {
      firstName: first,
      lastName: last,
      fullName: raw.fullName ?? raw.full_name ?? [first, last].filter(Boolean).join(" ").trim(),
      email: raw.email ?? order.guest_email ?? order.guestEmail ?? "",
      phone: raw.phone ?? address?.phone ?? null,
    };
  }
  // Guest fallback: the order's own stored guest fields + address snapshot.
  const fullName = address?.fullName ?? "";
  const parts = fullName.split(" ").filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
    fullName,
    email: order.guest_email ?? order.guestEmail ?? "",
    phone: order.guest_phone ?? order.guestPhone ?? address?.phone ?? null,
  };
}

function normaliseItem(line) {
  const quantity = Math.max(0, Math.floor(num(line.quantity, 1)));
  const returnedQuantity = Math.max(0, Math.floor(num(line.returned_quantity ?? line.returnedQuantity, 0)));
  const unitPrice = num(line.unit_price ?? line.unitPrice, 0);
  const originalPrice = num(line.original_price ?? line.originalPrice, 0);
  return {
    ...line,
    lineId: line.id ?? line.lineId ?? null,
    productId: line.product_id ?? line.productId ?? null,
    name: line.product_name ?? line.name ?? "",
    image: line.product_image ?? line.image ?? null,
    sku: line.sku ?? null,
    color: line.color ?? null,
    size: line.size ?? null,
    quantity,
    unitPrice,
    // Legacy alias: several presentation components read `price`.
    price: unitPrice,
    originalPrice,
    lineTotal: num(line.line_total ?? line.lineTotal, unitPrice * quantity),
    returnedQuantity,
    returnableQuantity: Math.max(0, quantity - returnedQuantity),
  };
}

/** A real return record persisted against the order. */
export function normaliseReturnRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const status = raw.status ?? null;
  return {
    ...raw,
    id: raw.id ?? null,
    orderId: raw.order_id ?? raw.orderId ?? null,
    returnNumber: raw.return_number ?? raw.returnNumber ?? null,
    status,
    statusLabel: status ? getReturnStatus(status).label : null,
    pickupMethod: raw.pickup_method ?? raw.pickupMethod ?? null,
    refundAmount: num(raw.refund_amount ?? raw.refundAmount, 0),
    refundStatus: raw.refund_status ?? raw.refundStatus ?? null,
    refundMethod: raw.refund_method ?? raw.refundMethod ?? null,
    refundInitiatedAt: isoOrNull(raw.refund_initiated_at ?? raw.refundInitiatedAt),
    refundCompletedAt: isoOrNull(raw.refund_completed_at ?? raw.refundCompletedAt),
    pickupScheduledAt: isoOrNull(raw.pickup_scheduled_at ?? raw.pickupScheduledAt),
    rejectionReason: raw.rejection_reason_customer ?? raw.rejectionReasonCustomer ?? null,
    items: (Array.isArray(raw.items) ? raw.items : []).map((item) => ({
      ...item,
      id: item.id ?? null,
      orderItemId: item.order_item_id ?? item.orderItemId ?? null,
      productId: item.product_id ?? item.productId ?? null,
      name: item.product_name ?? item.productName ?? item.name ?? "",
      quantity: num(item.quantity, 1),
      reason: item.reason ?? null,
      refundAmount: num(item.refund_amount ?? item.refundAmount, 0),
    })),
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    createdAt: isoOrNull(raw.created_at ?? raw.createdAt),
    updatedAt: isoOrNull(raw.updated_at ?? raw.updatedAt),
  };
}

/**
 * Status history — the ONLY real order-progress record the backend keeps.
 * Each entry is a persisted transition with its stored timestamp; nothing
 * is projected or estimated.
 */
export function normaliseStatusHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const status = entry.to_status ?? entry.toStatus ?? entry.status ?? null;
      const at = isoOrNull(entry.created_at ?? entry.createdAt ?? entry.at ?? entry.timestamp);
      if (!status || !at) return null;
      return {
        id: entry.id ?? `${status}-${at}`,
        status,
        label: getOrderStatus(status).label,
        description: getOrderStatus(status).narrative,
        fromStatus: entry.from_status ?? entry.fromStatus ?? null,
        at,
        actorName: entry.actor_name ?? entry.actorName ?? null,
        note: entry.note ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/* ------------------------------------------------------------------ */
/* Derived state (single source for every order-state question)        */
/* ------------------------------------------------------------------ */

export const isOrderCancellable = (order) =>
  Boolean(order) && CANCELLABLE_STATUSES.includes(order.status);

/**
 * Returns are only possible when the backend would accept them:
 * `POST /orders/{id}/returns` requires `status === DELIVERED` and at least
 * one line with un-returned quantity remaining.
 */
export const isOrderReturnable = (order) => {
  if (!order) return false;
  if (!RETURNABLE_STATUSES.includes(order.status)) return false;
  return (order.items ?? []).some((item) => (item.returnableQuantity ?? 0) > 0);
};

/** The most recent real return record, or null when none exists. */
export const latestReturnRecord = (order) => {
  const records = order?.returns ?? [];
  if (records.length === 0) return null;
  return [...records].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  )[0];
};

export const hasActiveReturn = (order) =>
  (order?.returns ?? []).some((record) => ACTIVE_RETURN_STATUSES.includes(record.status));

/**
 * Derived, backend-honest state flags. Components ask these questions
 * instead of comparing status strings inline.
 */
export function buildOrderStateFlags(order) {
  const status = order?.status ?? null;
  const paymentStatus = order?.paymentStatus ?? null;
  const invoiceNumber = order?.invoice?.number ?? null;

  return {
    // Order lifecycle (never derived from payment state)
    isCancelled: status === ORDER_STATUS.CANCELLED,
    isDelivered: status === ORDER_STATUS.DELIVERED,
    isPendingPayment: status === ORDER_STATUS.PENDING_PAYMENT,
    // Payment lifecycle (never derived from order state or payment method)
    isPaid: paymentStatus === ORDER_PAYMENT_STATUS.PAID,
    isPaymentPending: paymentStatus === ORDER_PAYMENT_STATUS.PENDING,
    isPaymentFailed: paymentStatus === ORDER_PAYMENT_STATUS.FAILED,
    // Actions the backend would actually accept
    canCancel: isOrderCancellable(order),
    canRequestReturn: isOrderReturnable(order),
    // Availability of optional, backend-backed information
    hasTrackingIdentity: Boolean(order?.tracking?.trackingNumber && order?.tracking?.carrier),
    hasEstimatedDelivery: Boolean(order?.tracking?.estimatedDelivery),
    hasInvoice: Boolean(invoiceNumber),
    hasReturns: (order?.returns ?? []).length > 0,
    hasActiveReturn: hasActiveReturn(order),
  };
}

/* ------------------------------------------------------------------ */
/* Canonical read model                                                */
/* ------------------------------------------------------------------ */

/**
 * Build the canonical order read model from a backend order response.
 *
 * Raw backend fields are preserved by spread (admin pages and Phase 2
 * behaviour depend on them); the camelCase projections below are what
 * Phase 3 UI reads.
 */
export function buildOrderReadModel(raw) {
  if (!raw || typeof raw !== "object") return raw;

  const address = normaliseOrderAddress(raw.shipping_address ?? raw.shippingAddress);
  const customer = normaliseCustomer(raw, address);

  const paymentMethodId =
    typeof raw.payment_method === "string"
      ? raw.payment_method
      : typeof raw.paymentMethod === "string"
        ? raw.paymentMethod
        : raw.paymentMethod?.id ?? null;
  const paymentMethodLabel =
    raw.paymentMethod?.label ??
    PAYMENT_METHODS.find((method) => method.id === paymentMethodId)?.label ??
    paymentMethodId ??
    "";

  const deliveryMethodId =
    typeof raw.delivery_method === "string"
      ? raw.delivery_method
      : typeof raw.deliveryMethod === "string"
        ? raw.deliveryMethod
        : raw.deliveryMethod?.id ?? "standard";
  const delivery = getDeliveryMethod(deliveryMethodId);

  const items = (Array.isArray(raw.items) ? raw.items : []).map(normaliseItem);
  const statusHistory = normaliseStatusHistory(raw.status_history ?? raw.statusHistory);
  const returns = (Array.isArray(raw.returns) ? raw.returns : [])
    .map(normaliseReturnRecord)
    .filter(Boolean);

  const status = raw.status ?? null;
  const paymentStatus = raw.payment_status ?? raw.paymentStatus ?? null;

  const cancelledAt = isoOrNull(raw.cancelled_at ?? raw.cancelledAt);
  const invoiceNumber = strOrNull(raw.invoice_number ?? raw.invoiceNumber);

  const order = {
    ...raw,

    // Identity
    id: raw.id ?? null,
    orderNumber: raw.order_number ?? raw.orderNumber ?? null,
    customerId: raw.customer_id ?? raw.customerId ?? null,
    guestEmail: raw.guest_email ?? raw.guestEmail ?? null,
    customer,

    // Status — order and payment kept strictly separate
    status,
    statusLabel: status ? getOrderStatus(status).label : null,
    statusSummary: status ? getOrderStatus(status).summary : null,
    paymentStatus,
    paymentStatusLabel: paymentStatus ? getPaymentStatus(paymentStatus).label : null,

    // Address + methods
    address,
    paymentMethod: { id: paymentMethodId, label: paymentMethodLabel },
    paymentMethodId,
    deliveryMethod: {
      id: delivery.id,
      label: delivery.label,
      // Service-level description of the chosen shipping method (static
      // config copy) — NOT a delivery-date promise. The real, backend
      // recorded date, when one exists, is `tracking.estimatedDelivery`.
      serviceLevel: delivery.caption ?? "",
      // Legacy alias retained for Phase 2 consumers.
      estimate: delivery.caption ?? "",
    },
    deliveryMethodId,

    // Lines + money (server-authoritative totals)
    items,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    // The existing order schema has no tax column, so the read model never
    // presents a tax line rather than inventing one.
    taxAvailable: false,
    pricing: {
      subtotal: num(raw.subtotal, 0),
      productDiscount: num(raw.product_discount ?? raw.productDiscount, 0),
      couponDiscount: num(raw.coupon_discount ?? raw.couponDiscount, 0),
      couponCode: strOrNull(raw.coupon_code ?? raw.couponCode),
      shipping: num(raw.shipping_fee ?? raw.shippingFee, 0),
      codFee: num(raw.cod_fee ?? raw.codFee, 0),
      total: num(raw.total, 0),
    },

    // Shipment identity — recorded by an admin at dispatch, else null.
    tracking: {
      carrier: strOrNull(raw.carrier),
      trackingNumber: strOrNull(raw.tracking_number ?? raw.trackingNumber),
      estimatedDelivery: isoOrNull(raw.estimated_delivery ?? raw.estimatedDelivery),
      dispatchedAt: isoOrNull(raw.dispatched_at ?? raw.dispatchedAt),
      deliveredAt: isoOrNull(raw.delivered_at ?? raw.deliveredAt),
      // No courier integration exists in this system.
      carrierEventsAvailable: false,
    },

    // Invoice — metadata only; no document is generated anywhere.
    invoice: {
      number: invoiceNumber,
      issuedAt: isoOrNull(raw.invoice_issued_at ?? raw.invoiceIssuedAt),
      available: Boolean(invoiceNumber),
      documentAvailable: false,
      downloadUrl: null,
    },

    // Cancellation state
    cancellation: cancelledAt
      ? {
          at: cancelledAt,
          reason: strOrNull(raw.cancellation_reason ?? raw.cancellationReason),
        }
      : null,

    // Real progress record + real return records
    statusHistory,
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    returns,

    customerNote: strOrNull(raw.customer_note ?? raw.customerNote),
    internalNotes: Array.isArray(raw.internal_notes ?? raw.internalNotes)
      ? (raw.internal_notes ?? raw.internalNotes)
      : [],

    createdAt: isoOrNull(raw.created_at ?? raw.createdAt),
    updatedAt: isoOrNull(raw.updated_at ?? raw.updatedAt),
  };

  order.flags = buildOrderStateFlags(order);
  order.activeReturn = latestReturnRecord(order);
  return order;
}

/**
 * Canonical tracking read model for `GET /orders/{id}/tracking`.
 *
 * The backend returns only persisted status-history events plus whatever
 * shipment identity an admin recorded. Nothing here is synthesised.
 */
export function buildTrackingReadModel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const events = (Array.isArray(raw.events) ? raw.events : [])
    .map((event) => {
      const status = event.status ?? null;
      const at = isoOrNull(event.timestamp ?? event.at);
      if (!status || !at) return null;
      const definition = getOrderStatus(status);
      return {
        status,
        title: definition.label,
        description: event.note ?? definition.narrative,
        at,
        actorName: event.actor_name ?? event.actorName ?? null,
        source: event.source ?? "STATUS_HISTORY",
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const carrier = strOrNull(raw.carrier);
  const trackingNumber = strOrNull(raw.tracking_number ?? raw.trackingNumber);

  return {
    orderId: raw.order_id ?? raw.orderId ?? null,
    orderStatus: raw.order_status ?? raw.orderStatus ?? null,
    paymentStatus: raw.payment_status ?? raw.paymentStatus ?? null,
    carrier,
    trackingNumber,
    estimatedDelivery: isoOrNull(raw.estimated_delivery ?? raw.estimatedDelivery),
    dispatchedAt: isoOrNull(raw.dispatched_at ?? raw.dispatchedAt),
    deliveredAt: isoOrNull(raw.delivered_at ?? raw.deliveredAt),
    cancelledAt: isoOrNull(raw.cancelled_at ?? raw.cancelledAt),
    carrierTrackingAvailable: Boolean(
      raw.carrier_tracking_available ?? raw.carrierTrackingAvailable ?? (carrier && trackingNumber)
    ),
    // Always false: no courier API is integrated. Never fabricate scans.
    carrierEventsAvailable: Boolean(raw.carrier_events_available ?? raw.carrierEventsAvailable ?? false),
    events,
    eventsAvailable: events.length > 0,
  };
}

/** Canonical invoice read model for `GET /admin/orders/{id}/invoice`. */
export function buildInvoiceReadModel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const number = strOrNull(raw.invoice_number ?? raw.invoiceNumber);
  return {
    orderId: raw.order_id ?? raw.orderId ?? null,
    number,
    issuedAt: isoOrNull(raw.issued_at ?? raw.issuedAt),
    available: Boolean(raw.available ?? Boolean(number)),
    // No invoice document/PDF/URL exists anywhere in this system.
    documentAvailable: Boolean(raw.document_available ?? raw.documentAvailable ?? false),
    downloadUrl: null,
  };
}

export default {
  buildOrderReadModel,
  buildTrackingReadModel,
  buildInvoiceReadModel,
  buildOrderStateFlags,
  normaliseReturnRecord,
  normaliseStatusHistory,
  normaliseOrderAddress,
  isOrderCancellable,
  isOrderReturnable,
  latestReturnRecord,
  hasActiveReturn,
};
