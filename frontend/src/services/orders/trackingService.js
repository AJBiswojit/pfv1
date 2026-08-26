/**
 * PRATIKSHYA FASHON — Tracking presentation service (Phase 3)
 *
 * WHAT THIS IS: a pure projection of the backend tracking response
 * (`GET /orders/{id}/tracking`, already normalised by
 * `utils/orderReadModel.buildTrackingReadModel`) onto the order journey so
 * `OrderTimeline` can render reached / current / upcoming steps.
 *
 * WHAT THIS IS NOT (removed in Phase 3): the previous implementation
 * fabricated shipment data — it invented event timestamps from a
 * hard-coded `LEG_HOURS` table, stamped every leg with a made-up transit
 * location (`FULFILMENT_ORIGIN` / the customer's city) and fell back to
 * the delivery-method caption as an "estimated delivery". None of that
 * came from the backend. It is all gone.
 *
 * Guarantees:
 *   - A step only carries a timestamp if a real, persisted status-history
 *     event exists for it. Otherwise `at` is null and `projected` is
 *     false — steps are never shown with an estimated date.
 *   - No transit locations are produced: the backend stores none.
 *   - Carrier / tracking number / estimated delivery are passed through
 *     verbatim, or reported unavailable.
 */

import {
  CUSTOMER_JOURNEY,
  ORDER_JOURNEY,
  ORDER_STATUS,
  ORDER_STATUSES,
  getOrderStatus,
} from "../../config/orderConfig";

const RETURN_FLOW_STATUSES = [
  ORDER_STATUS.RETURN_REQUESTED,
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.REFUND_PENDING,
  ORDER_STATUS.REFUNDED,
];

/**
 * Project a normalised tracking read model onto the journey steps.
 *
 * @param {object} tracking  Result of `buildTrackingReadModel` (backend truth).
 * @param {object} options.customerView  Use the shorter customer journey.
 * @returns {object|null} view model for `OrderTimeline`, or null.
 */
export const buildTrackingView = (tracking, { customerView = true } = {}) => {
  if (!tracking) return null;

  const journey = customerView ? CUSTOMER_JOURNEY : ORDER_JOURNEY;
  const status = tracking.orderStatus ?? null;

  // Real recorded transitions only, keyed by the status they moved to.
  const recorded = new Map();
  (tracking.events ?? []).forEach((event) => {
    if (!recorded.has(event.status)) recorded.set(event.status, event);
  });

  const isCancelled = status === ORDER_STATUS.CANCELLED;
  const isReturnFlow = RETURN_FLOW_STATUSES.includes(status);
  const currentStage = status ? getOrderStatus(status).stage : null;
  const reachedStage = isReturnFlow
    ? ORDER_STATUSES[ORDER_STATUS.DELIVERED].stage
    : currentStage;

  const steps = journey
    .map((stepStatus) => {
      const definition = ORDER_STATUSES[stepStatus];
      if (!definition) return null;

      // A legacy status (e.g. PLACED) may have been recorded instead.
      const event =
        recorded.get(stepStatus) ??
        (definition.mapsTo ? recorded.get(definition.mapsTo) : null) ??
        null;

      const done =
        reachedStage !== null && definition.stage !== null && definition.stage < reachedStage;
      const current = reachedStage !== null && definition.stage === reachedStage;

      return {
        status: stepStatus,
        title: definition.label,
        description: event?.description ?? definition.narrative,
        // Real persisted timestamp or nothing at all — never estimated.
        at: event?.at ?? null,
        timestamp: event?.at ?? null,
        recorded: Boolean(event),
        projected: false,
        actorName: event?.actorName ?? null,
        state: isCancelled ? "upcoming" : done ? "done" : current ? "current" : "upcoming",
      };
    })
    .filter(Boolean);

  return {
    orderId: tracking.orderId,
    status: status ? getOrderStatus(status) : null,
    orderStatus: status,
    paymentStatus: tracking.paymentStatus ?? null,

    // Shipment identity — only what an admin actually recorded.
    carrier: tracking.carrier ?? null,
    trackingNumber: tracking.trackingNumber ?? null,
    estimatedDelivery: tracking.estimatedDelivery ?? null,
    dispatchedAt: tracking.dispatchedAt ?? null,
    deliveredAt: tracking.deliveredAt ?? null,
    cancelledAt: tracking.cancelledAt ?? null,

    // Honest availability flags for the UI's unavailable states.
    carrierTrackingAvailable: Boolean(tracking.carrierTrackingAvailable),
    carrierEventsAvailable: Boolean(tracking.carrierEventsAvailable),
    estimatedDeliveryAvailable: Boolean(tracking.estimatedDelivery),
    eventsAvailable: (tracking.events ?? []).length > 0,

    cancelled: isCancelled,
    delivered: status === ORDER_STATUS.DELIVERED,

    // Raw recorded transitions (chronological), plus the journey projection.
    events: tracking.events ?? [],
    steps,
  };
};

export default { buildTrackingView };
