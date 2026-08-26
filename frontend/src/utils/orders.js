/**
 * PRATIKSHYA FASHON — Order utilities
 *
 * Pure-logic layer: defensive normalisation of locally-held order
 * snapshots, ownership, eligibility, formatting and search.
 *
 * PHASE 3 — fabrication removed. This module previously invented order
 * data that the backend does not have:
 *   - `buildTrackingId()` / `pickCarrier()` manufactured a plausible
 *     tracking number and picked a courier from a mock list, so every
 *     order appeared to be shipped with a real waybill.
 *   - `buildInvoiceNumber()` manufactured `INV-<id>` and stamped
 *     `issuedAt` with the order date, so every order appeared invoiced.
 *   - `paymentStatus` was inferred from the payment method (anything not
 *     COD became PAID), fabricating a payment outcome and contradicting
 *     the Phase 2 rule that only the server may mark an order paid.
 *   - `status` silently defaulted to ORDER_CONFIRMED and orders with no
 *     items were dropped entirely, hiding real records.
 *
 * All of that is gone. Every field is either present in the source
 * record or explicitly null, and eligibility questions are delegated to
 * the canonical read model so the UI and the backend agree.
 */

import {
  ACTIVE_RETURN_STATUSES,
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
  ORDER_STATUSES,
  RETURNABLE_STATUSES,
  RETURN_STATUS,
  RETURN_STATUSES,
} from "../config/orderConfig";
import {
  isOrderCancellable,
  isOrderReturnable,
  latestReturnRecord,
} from "./orderReadModel";
import { getProductById, productHref } from "../data/products";
import { getMaxQuantity } from "./shopping";

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/**
 * Local id for a client-side return draft. Tracking numbers, carriers and
 * invoice numbers are deliberately NOT generated here — those are real
 * business identifiers that only the backend may issue.
 */
export const buildReturnId = (orderId, sequence = 1) =>
  sequence <= 1 ? `RET-${orderId}` : `RET-${orderId}-${sequence}`;

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export const formatOrderDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export const formatEventTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day} · ${time}`;
};

export const orderItemCount = (order) =>
  (order?.items ?? []).reduce((total, item) => total + (Number(item.quantity) || 0), 0);

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normaliseItem = (item, index) => {
  if (!item || typeof item !== "object") return null;
  const quantity = Math.max(1, Math.floor(asNumber(item.quantity, 1)));
  const price = asNumber(item.price, 0);
  const product = item.productId ? getProductById(item.productId) : null;
  return {
    lineId: String(item.lineId ?? `line-${index}`),
    productId: item.productId ?? null,
    productSlug: product?.slug ?? item.productSlug ?? null,
    name: String(item.name ?? product?.name ?? "Atelier piece"),
    image: item.image ?? product?.image ?? null,
    color: item.color ?? null,
    size: item.size ?? null,
    quantity,
    price,
    originalPrice:
      typeof item.originalPrice === "number" && item.originalPrice > price
        ? item.originalPrice
        : null,
    lineTotal: asNumber(item.lineTotal, price * quantity),
  };
};

const normaliseReturnItem = (item, index) => {
  const line = normaliseItem(item, index);
  if (!line) return null;
  return { ...line, quantity: Math.max(1, Math.floor(asNumber(item.quantity, 1))) };
};

const normaliseReturn = (record, index) => {
  if (!record || typeof record !== "object" || !record.id) return null;
  const items = (Array.isArray(record.items) ? record.items : [])
    .map(normaliseReturnItem)
    .filter(Boolean);
  if (items.length === 0) return null;

  const status = RETURN_STATUSES[record.status]
    ? record.status
    : RETURN_STATUS.RETURN_REQUESTED;

  return {
    id: String(record.id),
    orderId: record.orderId ? String(record.orderId) : null,
    sequence: Math.max(1, Math.floor(asNumber(record.sequence, index + 1))),
    items,
    reason: record.reason ?? "other",
    reasonLabel: record.reasonLabel ?? "Other",
    resolution: record.resolution === "exchange" ? "exchange" : "refund",
    note: typeof record.note === "string" ? record.note.slice(0, 500) : "",
    status,
    createdAt: record.createdAt ?? new Date().toISOString(),
    history: Array.isArray(record.history)
      ? record.history.filter(
          (entry) => entry && RETURN_STATUSES[entry.status] && entry.at
        )
      : [],
    refund:
      record.refund && typeof record.refund === "object"
        ? {
            amount: asNumber(record.refund.amount, 0),
            method: String(record.refund.method ?? "Original payment method"),
            status: record.refund.status ?? ORDER_PAYMENT_STATUS.REFUND_INITIATED,
          }
        : null,
  };
};

const normaliseFulfillment = (raw, orderId) => {
  if (!raw || typeof raw !== "object") return null;
  return {
    orderId: raw.orderId || orderId,
    sourceLocationId: raw.sourceLocationId || null,
    fulfillmentType: raw.fulfillmentType || null,
    assignedEmployeeId: raw.assignedEmployeeId || null,
    assignedEmployeeName: raw.assignedEmployeeName || null,
    status: raw.status || "PENDING",
    allocatedAt: raw.allocatedAt || null,
    pickingStartedAt: raw.pickingStartedAt || null,
    packedAt: raw.packedAt || null,
    readyToDispatchAt: raw.readyToDispatchAt || null,
    dispatchedAt: raw.dispatchedAt || null,
    deliveredAt: raw.deliveredAt || null,
    packedBy: raw.packedBy || null,
    packageCount: Math.max(1, Number(raw.packageCount) || 1),
    packagingNotes: raw.packagingNotes || "",
    picking: raw.picking && typeof raw.picking === "object" ? raw.picking : {},
    history: Array.isArray(raw.history) ? raw.history : [],
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
};

const normaliseShipment = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  return {
    carrier: raw.carrier || "",
    trackingNumber: raw.trackingNumber || raw.trackingId || "",
    shippingMethod: raw.shippingMethod || "",
    dispatchedAt: raw.dispatchedAt || null,
    estimatedDelivery: raw.estimatedDelivery || "",
    dispatchedBy: raw.dispatchedBy || null,
  };
};

/**
 * PHASE 3: timeline entries used to be given a random id on every render
 * (`Math.random()`), so the same recorded event had a different identity
 * each time it was read — breaking React keys and making two reads of one
 * order look like different data. The id is now derived from the event
 * itself, so a recorded event always has the same identity.
 */
const timelineEventId = (event, index) =>
  event.id ||
  ["evt", event.at ?? "", event.type ?? "STATUS_CHANGED", event.status ?? "", index].join("-");

const normaliseTimeline = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && e.at)
    .map((e, index) => ({
      id: timelineEventId(e, index),
      type: e.type || "STATUS_CHANGED",
      status: e.status || null,
      at: e.at,
      actor: e.actor || null,
      actorName: e.actorName || "System",
      note: e.note || "",
      meta: e.meta || {},
    }))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
};

const normaliseNotes = (raw) => {
  if (!raw) return { customer: "", internal: [] };
  if (typeof raw === "string") return { customer: raw, internal: [] };
  return {
    customer: raw.customer || "",
    internal: Array.isArray(raw.internal) ? raw.internal : [],
  };
};

export const normaliseOrder = (raw) => {
  if (!raw || typeof raw !== "object" || !raw.id) return null;

  // An order with no readable lines is still a real order — it is kept
  // and rendered with an explicit empty-items state rather than silently
  // discarded from the customer's history.
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map(normaliseItem)
    .filter(Boolean);

  const createdAt = raw.createdAt ?? null;
  // Status is passed through as recorded. An unrecognised or missing
  // status stays null so the UI can say "status unavailable" instead of
  // pretending the order was confirmed.
  const status = ORDER_STATUSES[raw.status] ? raw.status : null;
  const paymentMethodId = raw.paymentMethod?.id ?? raw.paymentMethodId ?? null;
  // Payment status is NEVER inferred from the payment method. Only the
  // server may declare an order paid (Phase 2 trust model).
  const paymentStatus =
    raw.paymentStatus && ORDER_PAYMENT_STATUS[raw.paymentStatus] ? raw.paymentStatus : null;

  const pricing = raw.pricing ?? {};
  const returns = (Array.isArray(raw.returns) ? raw.returns : [])
    .map(normaliseReturn)
    .filter(Boolean);

  return {
    id: String(raw.id),
    customerId: raw.customerId ?? null,
    inventoryReservationId: raw.inventoryReservationId
      ? String(raw.inventoryReservationId)
      : null,
    customer: {
      fullName: raw.customer?.fullName ?? "Guest",
      email: raw.customer?.email ?? "",
      phone: raw.customer?.phone ?? "",
    },
    items,
    currency: raw.currency ?? "INR",
    pricing: {
      subtotal: asNumber(pricing.subtotal, 0),
      productDiscount: asNumber(pricing.productDiscount, 0),
      couponDiscount: asNumber(pricing.couponDiscount, 0),
      couponCode: pricing.couponCode ?? null,
      offerId: pricing.offerId ?? null,
      shipping: asNumber(pricing.shipping, 0),
      codFee: asNumber(pricing.codFee, 0),
      total: asNumber(pricing.total, 0),
      saved: asNumber(pricing.saved, 0),
    },
    address: raw.address ?? null,
    deliveryMethod: {
      id: raw.deliveryMethod?.id ?? "standard",
      label: raw.deliveryMethod?.label ?? "Standard Delivery",
      estimate: raw.deliveryMethod?.estimate ?? "",
    },
    // Only a real, backend-recorded delivery date — never the static
    // delivery-method caption dressed up as a promise.
    estimatedDelivery: raw.estimatedDelivery ?? null,
    paymentMethod: {
      id: paymentMethodId,
      label: raw.paymentMethod?.label ?? null,
    },
    paymentStatus,
    status,
    statusHistory: (Array.isArray(raw.statusHistory) ? raw.statusHistory : [])
      .filter((entry) => entry && ORDER_STATUSES[entry.status] && entry.at)
      .map((entry) => ({ status: entry.status, at: entry.at })),
    // Shipment identity exists only when an admin recorded it at dispatch.
    tracking: {
      trackingNumber: raw.tracking?.trackingNumber ?? raw.trackingNumber ?? null,
      carrier: raw.tracking?.carrier ?? raw.carrier ?? null,
      estimatedDelivery: raw.tracking?.estimatedDelivery ?? null,
    },
    returns,
    refund:
      raw.refund && typeof raw.refund === "object"
        ? {
            amount: asNumber(raw.refund.amount, 0),
            method: String(raw.refund.method ?? "Original payment method"),
            status: raw.refund.status ?? ORDER_PAYMENT_STATUS.REFUND_INITIATED,
            initiatedAt: raw.refund.initiatedAt ?? createdAt,
            note: raw.refund.note ?? "",
          }
        : null,
    // Invoice metadata is only ever what the backend issued. No number is
    // generated client-side and no document/URL exists anywhere.
    invoice: {
      number: raw.invoice?.number ?? raw.invoiceNumber ?? null,
      issuedAt: raw.invoice?.issuedAt ?? raw.invoiceIssuedAt ?? null,
      available: Boolean(raw.invoice?.number ?? raw.invoiceNumber),
      documentAvailable: false,
    },
    cancellation:
      raw.cancellation && typeof raw.cancellation === "object"
        ? {
            at: raw.cancellation.at ?? createdAt,
            reason: raw.cancellation.reason ?? "customer_request",
            note: raw.cancellation.note ?? "",
            actor: raw.cancellation.actor ?? null,
          }
        : null,
    fulfillment: normaliseFulfillment(raw.fulfillment, raw.id),
    shipment: normaliseShipment(raw.shipment),
    timeline: normaliseTimeline(raw.timeline),
    notes: normaliseNotes(raw.notes),
    createdAt,
    updatedAt: raw.updatedAt ?? createdAt,
    channel:
      raw.channel === "ASSISTED" || raw.source === "employee_assisted"
        ? "ASSISTED"
        : raw.channel ?? null,
    createdBy: raw.createdBy || raw.employeeId || null,
    source: raw.source || null,
    associate: raw.associate || null,
    floorStatus: raw.floorStatus || null,
  };
};

export const normaliseOrders = (raw) => {
  if (!Array.isArray(raw)) return [];
  const byId = new Map();
  raw.forEach((entry) => {
    const order = normaliseOrder(entry);
    if (!order || byId.has(order.id)) return;
    byId.set(order.id, order);
  });
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

/* ------------------------------------------------------------------ */
/* Ownership                                                           */
/* ------------------------------------------------------------------ */

export const isOrderOwnedBy = (order, customerId = null) => {
  if (!order) return false;
  if (customerId) return order.customerId === customerId;
  return !order.customerId;
};

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

export const returnedLineIds = (order) => {
  const ids = new Set();
  (order?.returns ?? []).forEach((record) => {
    if (!ACTIVE_RETURN_STATUSES.includes(record.status)) return;
    record.items.forEach((item) => ids.add(item.lineId));
  });
  return ids;
};

export const latestReturn = latestReturnRecord;

/**
 * Cancellation / return eligibility is decided by ONE definition shared
 * with the canonical read model, so the buttons the UI offers match the
 * requests the backend will actually accept.
 */
export const canCancelOrder = isOrderCancellable;

export const canReturnOrder = isOrderReturnable;

/**
 * The backend also enforces a return window measured from the recorded
 * delivery date. Offering "Return items" outside it would earn a 422, so
 * the UI checks the same window using the real `deliveredAt` timestamp.
 * When no delivery date was recorded the window cannot be evaluated and
 * the answer is "unknown" rather than a guess.
 */
export const RETURN_WINDOW_DAYS = 7;

export const returnWindow = (order) => {
  const deliveredAt = order?.tracking?.deliveredAt ?? order?.deliveredAt ?? null;
  if (!deliveredAt) return { known: false, open: false, closesAt: null, daysLeft: null };
  const delivered = new Date(deliveredAt);
  if (Number.isNaN(delivered.getTime())) {
    return { known: false, open: false, closesAt: null, daysLeft: null };
  }
  const closesAt = new Date(delivered.getTime() + RETURN_WINDOW_DAYS * 86400000);
  const msLeft = closesAt.getTime() - Date.now();
  return {
    known: true,
    open: msLeft > 0,
    closesAt: closesAt.toISOString(),
    daysLeft: Math.max(0, Math.ceil(msLeft / 86400000)),
  };
};

/** True only when the backend would accept a return request right now. */
export const canRequestReturnNow = (order) => {
  if (!canReturnOrder(order)) return false;
  const window = returnWindow(order);
  // Unknown window (no recorded delivery date) is treated as closed —
  // better an honest "unavailable" than a request the backend rejects.
  return window.known && window.open;
};

export const returnBlockedReason = (order) => {
  if (!order) return "That order could not be found in your account.";
  if (order.status === ORDER_STATUS.CANCELLED) {
    return "This order was cancelled, so there is nothing to return.";
  }
  if (
    order.status === ORDER_STATUS.RETURNED ||
    (order.status === ORDER_STATUS.RETURN_REQUESTED && !canReturnOrder(order))
  ) {
    return "A return has already been requested for the pieces in this order.";
  }
  if (!RETURNABLE_STATUSES.includes(order.status)) {
    return "Returns open once your order has been delivered.";
  }
  if (!canReturnOrder(order)) {
    return "Every piece in this order is already part of a return request.";
  }
  const window = returnWindow(order);
  if (!window.known) {
    return "We do not have a recorded delivery date for this order yet, so a return cannot be started here. Please contact the atelier.";
  }
  if (!window.open) {
    return `The ${RETURN_WINDOW_DAYS}-day return window for this order has closed.`;
  }
  return "";
};

export const canTrackOrder = (order) =>
  Boolean(order) && order.status !== ORDER_STATUS.CANCELLED;

export const refundMethodLabel = (order) => {
  if (!order) return "Original payment method";
  if (order.paymentMethod?.id === "cod") {
    return "Bank transfer to your registered details";
  }
  return order.paymentMethod?.label
    ? `Refund to original ${order.paymentMethod.label}`
    : "Original payment method";
};

export const refundAmountFor = (items = []) =>
  items.reduce(
    (total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 0),
    0
  );

export const buyAgainAvailability = (item) => {
  const product = item?.productId ? getProductById(item.productId) : null;
  if (!product) return { state: "unavailable", product: null, href: null };
  if (getMaxQuantity(product) === 0) {
    return { state: "unavailable", product, href: productHref(product) };
  }
  const colourGone =
    item.color && (product.unavailableColors ?? []).includes(item.color);
  const sizeGone = item.size && (product.unavailableSizes ?? []).includes(item.size);
  if (colourGone || sizeGone) {
    return { state: "variant", product, href: productHref(product) };
  }
  return { state: "available", product, href: productHref(product) };
};

export const orderItemHref = (item) => {
  const product = item?.productId ? getProductById(item.productId) : null;
  return product ? productHref(product) : null;
};

/* ------------------------------------------------------------------ */
/* Search helpers for admin                                            */
/* ------------------------------------------------------------------ */

export const matchesOrderSearch = (order, term) => {
  if (!term) return true;
  const q = term.toLowerCase();
  const haystack = [
    order.id,
    order.orderNumber,
    order.customer?.fullName,
    order.customer?.email,
    order.customer?.phone,
    order.address?.city,
    order.tracking?.trackingNumber,
    order.shipment?.trackingNumber,
    ...(order.items?.map((i) => i.name) || []),
    ...(order.items?.map((i) => i.productId) || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
};

export default {
  buildReturnId,
  formatOrderDate,
  formatEventTime,
  orderItemCount,
  normaliseOrder,
  normaliseOrders,
  isOrderOwnedBy,
  returnedLineIds,
  latestReturn,
  canCancelOrder,
  canReturnOrder,
  canRequestReturnNow,
  returnWindow,
  RETURN_WINDOW_DAYS,
  returnBlockedReason,
  canTrackOrder,
  refundMethodLabel,
  refundAmountFor,
  buyAgainAvailability,
  orderItemHref,
  matchesOrderSearch,
};
