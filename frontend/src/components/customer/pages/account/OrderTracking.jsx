/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — order tracking, as a page of the
 * design.
 *
 * The production screen is `pages/account/OrderTracking.jsx`, and what it shows
 * is what this page shows: REAL, STORED progress only.
 *
 *   · the order and its tracking are read together (`fetchOrder` and
 *     `getTracking`); a failed ORDER read is the whole page's failure, while a
 *     failed tracking read alone is reported in place — the order itself loaded
 *     fine;
 *   · the four facts are the ones the backend recorded: the current status, the
 *     delivery date for a delivered order (or the estimate an admin recorded, or
 *     an honest "not yet scheduled"), the tracking number, and the carrier. Until
 *     dispatch recorded them, the page says "Not dispatched yet" and "Not assigned
 *     yet" rather than displaying an invented consignment;
 *   · the journey is the persisted status history projected onto the customer
 *     journey by the tracking service. No leg is dated by projection: a step
 *     carries a time only when the atelier recorded that transition;
 *   · a cancelled order is stated as cancelled — it never entered the delivery
 *     journey, and its steps remain for reference only;
 *   · live courier scans are NOT available anywhere in this system, and the page
 *     says exactly that when a carrier and waybill exist.
 *
 * The design has no counterpart for any of it, so the register is the port's own:
 * the frame, the checkout sheet's `.pf-meta` band and panels, the port's chip for
 * a status and the design's hairline list for the pieces in the shipment.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from '../../router/index.jsx';
import Button from '../../components/ui/Button.jsx';
import OrderFrame, {
  OrderChip,
  OrderLoading,
  OrderMeta,
  OrderProblem,
  OrderSteps,
  ReturnCard,
} from './OrderFrame.jsx';
import { useOrder } from '../../../../context/OrderContext.jsx';
import { ORDER_STATUS } from '../../../../config/orderConfig.js';
import { formatOrderDate, latestReturn, orderItemCount } from '../../../../utils/orders.js';

const CRUMBS = [
  { label: 'Account', to: '/account' },
  { label: 'Orders', to: '/account/orders' },
];
const LOADING_CRUMBS = [...CRUMBS, { label: 'Tracking' }];
const PROBLEM_CRUMBS = [...CRUMBS, { label: 'Tracking' }];

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

    Promise.all([fetchOrder(orderId), getTracking(orderId)]).then(([orderResult, trackingResult]) => {
      if (cancelled) return;
      setLoading(false);
      if (!orderResult.ok) {
        setOrder(null);
        setTracking(null);
        setError({ status: orderResult.status, message: orderResult.error });
        return;
      }
      setOrder(orderResult.order);
      /* A tracking failure alone is reported in place, not as a whole-page
         error — the order itself loaded fine. */
      setTracking(trackingResult.ok ? trackingResult.tracking : null);
    });

    return () => {
      cancelled = true;
    };
  }, [orderId, fetchOrder, getTracking, reloadToken]);

  useEffect(() => {
    const previous = document.title;
    document.title = order
      ? `Tracking ${order.orderNumber ?? order.id} — PRATIKSHYA FASHION`
      : 'Order Tracking — PRATIKSHYA FASHION';
    return () => {
      document.title = previous;
    };
  }, [order]);

  if (loading) {
    return <OrderLoading label="Loading tracking" breadcrumbItems={LOADING_CRUMBS} />;
  }

  if (error || !order) {
    return (
      <OrderProblem
        status={error?.status ?? 404}
        message={error?.message}
        onRetry={reload}
        breadcrumbItems={PROBLEM_CRUMBS}
      />
    );
  }

  const orderRef = order.orderNumber ?? order.id;
  const count = orderItemCount(order);
  const cancelled = order.status === ORDER_STATUS.CANCELLED;
  const activeReturn = latestReturn(order);
  const statusLabel = tracking?.status?.label ?? order.statusLabel ?? order.status;
  const statusSummary = tracking?.status?.summary ?? order.statusSummary ?? '';

  return (
    <OrderFrame
      breadcrumbItems={[...CRUMBS, { label: orderRef, to: `/account/orders/${order.id}` }, { label: 'Tracking' }]}
      label={`Order ${orderRef}`}
      title={
        cancelled ? (
          <>
            This journey was <em>stopped.</em>
          </>
        ) : (
          <>
            Follow your <em>order.</em>
          </>
        )
      }
    >
      <div className="pf-account__statusline">
        <OrderChip status={order.status} kind="order" />
        <span className="pf-account__order-meta">
          {count} {count === 1 ? 'piece' : 'pieces'} · {order.deliveryMethod.label}
        </span>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        Current order status: {statusLabel}. {statusSummary}
      </p>

      {/* Carrier and waybill exist only once the atelier records them at dispatch.
          Until then this states plainly that there is nothing to show. */}
      <OrderMeta
        items={[
          { label: 'Current Status', value: statusLabel },
          {
            label: cancelled ? 'Delivery' : order.flags?.isDelivered ? 'Delivered' : 'Estimated Delivery',
            value: cancelled
              ? 'Not applicable'
              : order.flags?.isDelivered && tracking?.deliveredAt
                ? formatOrderDate(tracking.deliveredAt)
                : tracking?.estimatedDelivery
                  ? formatOrderDate(tracking.estimatedDelivery)
                  : 'Not yet scheduled',
          },
          { label: 'Tracking Number', value: tracking?.trackingNumber ?? 'Not dispatched yet' },
          { label: 'Carrier', value: tracking?.carrier ?? 'Not assigned yet' },
        ]}
      />

      {tracking?.carrierTrackingAvailable && !tracking?.carrierEventsAvailable ? (
        <p className="pf-account__note">
          Live courier scans are not available here. Please use the carrier&rsquo;s own site with the
          tracking number above for in-transit updates.
        </p>
      ) : null}

      {cancelled ? (
        <p className="pf-note">
          This order was cancelled, so it never entered the delivery journey. The steps below remain
          for reference only.
        </p>
      ) : null}

      <div className="pf-account__grid">
        <section aria-label="Shipment progress">
          <p className="label">Journey</p>
          {tracking?.steps?.length ? (
            <>
              <OrderSteps steps={tracking.steps} ariaLabel={`Shipment progress for order ${orderRef}`} />
              <p className="pf-account__note">
                A date appears against a step once the atelier records it. Upcoming steps are shown
                without a date — we never estimate one.
              </p>
            </>
          ) : (
            <p className="pf-account__note">
              Tracking information is not available for this order right now. This page will update
              as the atelier records progress.
            </p>
          )}
        </section>

        <div className="pf-account__rail">
          {/* Destination */}
          {order.address ? (
            <div className="pf-panel">
              <p className="pf-panel__eyebrow">Destination</p>
              <p className="pf-panel__name">{order.address.fullName}</p>
              <p className="pf-panel__line">
                {order.address.addressLine}
                {order.address.landmark ? `, ${order.address.landmark}` : ''}
              </p>
              <p className="pf-panel__line">
                {order.address.city}, {order.address.state} — {order.address.pincode}
              </p>
            </div>
          ) : null}

          {/* Pieces in transit */}
          <div className="pf-panel">
            <p className="pf-panel__eyebrow">In This Shipment</p>
            {order.items.length === 0 ? (
              <p className="pf-panel__line">No pieces are recorded against this order.</p>
            ) : (
              <ul className="checkout__lines">
                {order.items.map((item) => (
                  <li key={item.lineId}>
                    {item.image ? (
                      <img src={item.image} alt="" loading="lazy" />
                    ) : (
                      <span aria-hidden="true" />
                    )}
                    <span>
                      {item.name}
                      <small>Qty {item.quantity}</small>
                    </span>
                    <span aria-hidden="true" />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pf-account__acts">
            <Button to={`/account/orders/${order.id}`}>View Order</Button>
            <Link to="/account/orders" className="pf-account__act is-accent">
              All Orders
            </Link>
          </div>
        </div>
      </div>

      {activeReturn ? <ReturnCard record={activeReturn} order={order} className="pf-account__section" /> : null}
    </OrderFrame>
  );
}
