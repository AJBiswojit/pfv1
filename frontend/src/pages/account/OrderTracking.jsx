import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin, Truck } from "lucide-react";
import OrderPageShell from "../../components/orders/OrderPageShell";
import OrderErrorState from "../../components/orders/OrderErrorState";
import OrderLoadingState from "../../components/orders/OrderLoadingState";
import OrderStatusBadge from "../../components/orders/OrderStatusBadge";
import OrderTimeline from "../../components/orders/OrderTimeline";
import ReturnSummaryCard from "../../components/orders/ReturnSummaryCard";
import { useOrder } from "../../context/OrderContext";
import {
  AtelierButton,
  EditorialHeading,
  Rule,
  transition,
} from "../../design-system";
import { ORDER_STATUS } from "../../config/orderConfig";
import { formatOrderDate, latestReturn, orderItemCount } from "../../utils/orders";
import { cn } from "../../utils/cn";

/**
 * Order tracking — /account/orders/:orderId/track.
 *
 * PHASE 3: this page shows REAL, STORED progress only.
 *
 * It previously displayed a fabricated shipment: a generated tracking id,
 * a courier picked from a mock list, a "dispatched from Bhubaneswar"
 * origin and estimated timestamps for every leg of the journey. None of
 * that came from the backend, and no courier service is integrated.
 *
 * Now every event is a persisted status-history entry returned by
 * `GET /orders/{id}/tracking`, and the carrier / tracking number /
 * estimated delivery are only shown when an admin actually recorded them
 * at dispatch. When they were not, the page says so.
 *
 * Ownership is enforced by the backend; 403 and 404 render identical copy
 * so order ids cannot be probed.
 */
export default function OrderTracking() {
  const { orderId } = useParams();
  const { fetchOrder, getTracking } = useOrder();

  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchOrder(orderId), getTracking(orderId)]).then(
      ([orderResult, trackingResult]) => {
        if (cancelled) return;
        setLoading(false);
        if (!orderResult.ok) {
          setOrder(null);
          setTracking(null);
          setError({ status: orderResult.status, message: orderResult.error });
          return;
        }
        setOrder(orderResult.order);
        // A tracking failure alone is reported in place, not as a
        // whole-page error — the order itself loaded fine.
        setTracking(trackingResult.ok ? trackingResult.tracking : null);
      }
    );

    return () => { cancelled = true; };
  }, [orderId, fetchOrder, getTracking, reloadToken]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = order
      ? `Tracking ${order.orderNumber ?? order.id} — PRATIKSHYA FASHON`
      : "Order Tracking — PRATIKSHYA FASHON";
    return () => {
      document.title = previousTitle;
    };
  }, [order]);

  if (loading) {
    return (
      <OrderLoadingState
        label="Loading tracking…"
        breadcrumbItems={[
          { label: "Account", to: "/account" },
          { label: "Orders", to: "/account/orders" },
          { label: "Tracking" },
        ]}
      />
    );
  }

  if (error || !order) {
    return (
      <OrderErrorState
        status={error?.status ?? 404}
        message={error?.message}
        onRetry={reload}
        breadcrumbItems={[
          { label: "Account", to: "/account" },
          { label: "Orders", to: "/account/orders" },
          { label: "Tracking" },
        ]}
      />
    );
  }

  const orderRef = order.orderNumber ?? order.id;
  const count = orderItemCount(order);
  const cancelled = order.status === ORDER_STATUS.CANCELLED;
  const activeReturn = latestReturn(order);
  const statusLabel = tracking?.status?.label ?? order.statusLabel ?? order.status;
  const statusSummary = tracking?.status?.summary ?? order.statusSummary ?? "";

  return (
    <OrderPageShell
      breadcrumbItems={[
        { label: "Account", to: "/account" },
        { label: "Orders", to: "/account/orders" },
        { label: orderRef, to: `/account/orders/${order.id}` },
        { label: "Tracking" },
      ]}
    >
      <EditorialHeading
        as="h2"
        size="subsection"
        eyebrow={`Order ${orderRef}`}
        spacing={{ eyebrow: "mb-3", title: "mb-0" }}
      >
        {cancelled ? (
          <>
            This journey was <span className="italic text-accent">stopped.</span>
          </>
        ) : (
          <>
            Follow your <span className="italic text-accent">order.</span>
          </>
        )}
      </EditorialHeading>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <OrderStatusBadge status={order.status} kind="order" />
        <span className="font-ui text-[11px] text-taupe">
          {count} {count === 1 ? "piece" : "pieces"} · {order.deliveryMethod.label}
        </span>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        Current order status: {statusLabel}. {statusSummary}
      </p>

      <Rule width="w-14" tone="accent" className="my-7" />

      {/* --------------------------- Consignment ---------------------------
          Carrier and waybill exist only once the atelier records them at
          dispatch. Until then this states plainly that there is nothing to
          show, rather than displaying an invented consignment. */}
      <dl className="grid gap-6 border border-mist/80 bg-surface/40 p-6 sm:grid-cols-2 md:grid-cols-4 md:p-7">
        <div>
          <dt className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
            Current Status
          </dt>
          <dd className="mt-1.5 font-ui text-sm text-ink">{statusLabel}</dd>
        </div>
        <div>
          <dt className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
            {cancelled ? "Delivery" : order.flags?.isDelivered ? "Delivered" : "Estimated Delivery"}
          </dt>
          <dd className="mt-1.5 font-ui text-sm text-ink">
            {cancelled
              ? "Not applicable"
              : order.flags?.isDelivered && tracking?.deliveredAt
                ? formatOrderDate(tracking.deliveredAt)
                : tracking?.estimatedDelivery
                  ? formatOrderDate(tracking.estimatedDelivery)
                  : "Not yet scheduled"}
          </dd>
        </div>
        <div>
          <dt className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
            Tracking Number
          </dt>
          <dd className="mt-1.5 font-ui text-sm tracking-wide text-ink">
            {tracking?.trackingNumber ?? "Not dispatched yet"}
          </dd>
        </div>
        <div>
          <dt className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
            Carrier
          </dt>
          <dd className="mt-1.5 flex items-center gap-2 font-ui text-sm text-ink">
            <Truck size={14} className="text-brass" aria-hidden="true" />
            {tracking?.carrier ?? "Not assigned yet"}
          </dd>
        </div>
      </dl>

      {tracking?.carrierTrackingAvailable && !tracking?.carrierEventsAvailable ? (
        <p className="mt-4 font-ui text-[10px] leading-relaxed text-taupe">
          Live courier scans are not available here. Please use the carrier's own
          site with the tracking number above for in-transit updates.
        </p>
      ) : null}

      {cancelled ? (
        <p className="mt-7 border border-mist/80 bg-canvas p-6 font-ui text-xs leading-relaxed text-graphite">
          This order was cancelled, so it never entered the delivery journey. The
          steps below remain for reference only.
        </p>
      ) : null}

      {/* ----------------------------- Timeline ----------------------------- */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-14">
        <section aria-label="Shipment progress">
          <h3 className="mb-7 font-display text-xl font-light tracking-tight text-ink">
            Journey
          </h3>
          {tracking?.steps?.length ? (
            <>
              <OrderTimeline
                events={tracking.steps}
                showLocation={false}
                ariaLabel={`Shipment progress for order ${orderRef}`}
              />
              <p className="mt-6 font-ui text-[10px] leading-relaxed text-taupe">
                A date appears against a step once the atelier records it.
                Upcoming steps are shown without a date — we never estimate one.
              </p>
            </>
          ) : (
            <p className="font-ui text-xs leading-relaxed text-graphite">
              Tracking information is not available for this order right now.
              This page will update as the atelier records progress.
            </p>
          )}
        </section>

        <div className="space-y-7">
          {/* Destination */}
          {order.address ? (
            <section
              aria-label="Delivery destination"
              className="border border-mist/80 bg-surface/30 p-6 md:p-7"
            >
              <h3 className="flex items-center gap-2 font-ui text-[10px] uppercase tracking-[.2em] text-accent">
                <MapPin size={12} aria-hidden="true" />
                Destination
              </h3>
              <p className="mt-3 font-display text-base font-light text-ink">
                {order.address.fullName}
              </p>
              <p className="mt-1 font-ui text-xs leading-relaxed text-graphite">
                {order.address.addressLine}
                {order.address.landmark ? `, ${order.address.landmark}` : ""}
              </p>
              <p className="font-ui text-xs text-graphite">
                {order.address.city}, {order.address.state} —{" "}
                {order.address.pincode}
              </p>
            </section>
          ) : null}

          {/* Pieces in transit */}
          <section
            aria-label="Pieces in this shipment"
            className="border border-mist/80 bg-surface/30 p-6 md:p-7"
          >
            <h3 className="font-ui text-[10px] uppercase tracking-[.2em] text-accent">
              In This Shipment
            </h3>
            {order.items.length === 0 ? (
              <p className="mt-4 font-ui text-xs text-graphite">
                No pieces are recorded against this order.
              </p>
            ) : (
              <ul className="mt-4 space-y-3.5">
                {order.items.map((item) => (
                  <li key={item.lineId} className="flex items-center gap-3.5">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt=""
                        className="h-14 w-11 shrink-0 bg-surface object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-14 w-11 shrink-0 bg-surface"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-light text-ink">
                        {item.name}
                      </p>
                      <p className="mt-0.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                        Qty {item.quantity}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <AtelierButton
              as={Link}
              to={`/account/orders/${order.id}`}
              variant="primary"
              size="chip"
            >
              View Order
            </AtelierButton>
            <Link
              to="/account/orders"
              className={cn(
                "font-ui text-[10px] uppercase tracking-[.16em] text-brass hover:text-accent",
                transition.colors
              )}
            >
              All Orders
            </Link>
          </div>
        </div>
      </div>

      {activeReturn ? (
        <ReturnSummaryCard record={activeReturn} order={order} className="mt-12" />
      ) : null}
    </OrderPageShell>
  );
}
