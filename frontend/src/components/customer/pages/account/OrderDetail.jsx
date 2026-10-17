/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — one order, as a page of the design.
 *
 * The production screen is `pages/account/OrderDetail.jsx`. Its decisions are
 * kept exactly where it keeps them:
 *
 *   · the order is read through the ownership-checked context accessor
 *     (`fetchOrder(orderId)`), so the backend is the only answer to "is this order
 *     mine?" and an order belonging to another customer resolves to the same safe
 *     not-found state as an invalid id;
 *   · loading wins over every empty state; a failed read is named as failed with
 *     its own HTTP status (`orderErrorCopy`); a missing/inaccessible order is the
 *     one not-found state, with identical copy for "no such order" and "not
 *     yours";
 *   · real stored progress only: `getTracking(order.id)` is a separate, non-
 *     blocking read — a tracking failure never hides the order, and the journey
 *     draws only transitions the atelier actually recorded (no estimated date, no
 *     location, no carrier invented here);
 *   · every action is offered only where the backend would accept it:
 *     `Track Order` when `canTrackOrder`, `View Invoice` only once an invoice
 *     number exists, `Return Items` only when `canRequestReturnNow`, `Cancel
 *     Order` only when `canCancelOrder`, and `Buy Again` through the one cart
 *     implementation (`buyAgainAvailability` → `cart.addToCart`, a retired variant
 *     sent to its product page, a catalogue-lost piece reported honestly);
 *   · cancellation is confirmed first — production's own `ConfirmDialog`, with its
 *     paid/unpaid copy — and the server's own record replaces the local one on
 *     success; nothing is marked cancelled optimistically.
 *
 * The design drew nothing of this screen, so the register is the port's own: the
 * frame, the checkout sheet's panel/meta/lines/totals blocks (the same ones the
 * port's checkout and order-confirmation already draw an order with), the design's
 * `.totals` breakdown and the port's chip for a status.
 *
 * WHAT IS NOT COPIED FROM PRODUCTION: its `AtelierButton`/`EditorialHeading`
 * furniture, and the invoice preview document, which is reused VERBATIM
 * (`components/orders/InvoicePreview.jsx`) rather than redrawn — a print document
 * with a focus-trapped dialog behind it is a functional unit, exactly as the
 * address form `Addresses.jsx` renders is.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from '../../router/index.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../../../components/orders/ConfirmDialog.jsx';
import InvoicePreview from '../../../../components/orders/InvoicePreview.jsx';
import OrderFrame, {
  OrderChip,
  OrderLines,
  OrderLoading,
  OrderMeta,
  OrderMissing,
  OrderProblem,
  OrderSteps,
  OrderTotals,
  ReturnCard,
} from './OrderFrame.jsx';
import { useCart } from '../../../../context/CartContext.jsx';
import { useOrder } from '../../../../context/OrderContext.jsx';
import { ORDER_PAYMENT_STATUS, getOrderStatus } from '../../../../config/orderConfig.js';
import {
  buyAgainAvailability,
  canCancelOrder,
  canRequestReturnNow,
  canTrackOrder,
  formatOrderDate,
  latestReturn,
  orderItemCount,
  refundMethodLabel,
  returnBlockedReason,
  returnWindow,
} from '../../../../utils/orders.js';
import { formatINR } from '../../../../utils/shopping.js';
import { formatPhone } from '../../../../utils/validation.js';

const CRUMBS = [
  { label: 'Account', to: '/account' },
  { label: 'Orders', to: '/account/orders' },
];
const LOADING_CRUMBS = [...CRUMBS, { label: 'Loading' }];
const PROBLEM_CRUMBS = [...CRUMBS, { label: 'Unavailable' }];
const MISSING_CRUMBS = [...CRUMBS, { label: 'Not Found' }];

export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const { fetchOrder, getTracking, cancelOrder } = useOrder();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  /* The server-authoritative read. The backend enforces ownership, so this is the
     only reliable answer to "is this order mine?" — and its status distinguishes
     "loading", "not yours / not found", "signed out" and "our side failed". */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOrder(orderId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setOrder(result.order);
      } else {
        setOrder(null);
        setError({ status: result.status, message: result.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, fetchOrder, reloadToken]);

  /* Real, stored progress only. A tracking failure never blocks the order: the
     journey section reports itself unavailable instead. */
  useEffect(() => {
    if (!order?.id) {
      setTracking(null);
      return;
    }
    let cancelled = false;
    getTracking(order.id).then((result) => {
      if (cancelled) return;
      setTracking(result.ok ? result.tracking : null);
    });
    return () => {
      cancelled = true;
    };
  }, [order?.id, getTracking]);

  useEffect(() => {
    const previous = document.title;
    document.title = order
      ? `Order ${order.orderNumber ?? order.id} — PRATIKSHYA FASHION`
      : 'Order — PRATIKSHYA FASHION';
    return () => {
      document.title = previous;
    };
  }, [order]);

  /* Cancellation is decided entirely by the backend. On success the server's own
     order record replaces the local one, so the displayed status is never
     guessed. */
  const handleCancel = async () => {
    const result = await cancelOrder(order.id);
    setConfirmOpen(false);
    if (result.ok && result.order) {
      setOrder(result.order);
      setNotice('This order has been cancelled.');
      return;
    }
    setNotice(result.message || 'This order can no longer be cancelled. Please contact the atelier.');
  };

  /* Buy Again — the one cart implementation. Pieces whose variant has retired are
     sent to their product page rather than blindly added, and pieces that have
     left the catalogue are reported gracefully. */
  const handleBuyAgain = () => {
    let added = 0;
    let needsChoice = null;
    let unavailable = 0;

    order.items.forEach((item) => {
      const availability = buyAgainAvailability(item);
      if (availability.state === 'unavailable') {
        unavailable += 1;
        return;
      }
      if (availability.state === 'variant') {
        needsChoice = needsChoice ?? availability.href;
        return;
      }
      const result = cart.addToCart(availability.product, {
        color: item.color,
        size: item.size,
        quantity: item.quantity,
      });
      if (result.ok) added += 1;
    });

    if (added > 0) {
      cart.openDrawer();
      setNotice(
        unavailable > 0 || needsChoice
          ? `${added} ${added === 1 ? 'piece' : 'pieces'} added to your bag. Some pieces need a fresh selection.`
          : 'Your pieces are back in your bag.'
      );
      return;
    }

    if (needsChoice) {
      navigate(needsChoice);
      return;
    }

    setNotice(
      'These pieces are no longer available. Our new arrivals may hold something you love.'
    );
  };

  if (loading) {
    return <OrderLoading label="Loading your order" breadcrumbItems={LOADING_CRUMBS} />;
  }

  if (error) {
    return (
      <OrderProblem
        status={error.status}
        message={error.message}
        onRetry={reload}
        breadcrumbItems={PROBLEM_CRUMBS}
      />
    );
  }

  if (!order) return <OrderMissing breadcrumbItems={MISSING_CRUMBS} />;

  const status = getOrderStatus(order.status);
  const count = orderItemCount(order);
  const activeReturn = latestReturn(order);
  const orderRef = order.orderNumber ?? order.id;
  const windowState = returnWindow(order);
  const blocked = returnBlockedReason(order);
  const delivered = order.flags?.isDelivered ?? false;

  return (
    <OrderFrame
      breadcrumbItems={[...CRUMBS, { label: orderRef }]}
      label={`Order ${orderRef}`}
      title={
        <>
          {status.summary.replace(/\.$/, '')}
          <em>.</em>
        </>
      }
    >
      <div className="pf-account__order-head">
        <div className="pf-account__statusline">
          <OrderChip status={order.status} kind="order" />
          <OrderChip status={order.paymentStatus} kind="payment" />
          <span className="pf-account__order-meta">Placed {formatOrderDate(order.createdAt)}</span>
        </div>
      </div>

      {notice ? (
        <p className="pf-note" role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}

      <OrderMeta
        items={[
          { label: 'Order Date', value: formatOrderDate(order.createdAt) },
          { label: 'Pieces', value: `${count} ${count === 1 ? 'piece' : 'pieces'}` },
          { label: 'Order Total', value: formatINR(order.pricing.total) },
          {
            /* Only a real, backend-recorded date is ever shown here. When nothing
               has been recorded the field says so plainly rather than presenting
               the shipping-method caption as a promise. */
            label: delivered ? 'Delivered' : 'Estimated Delivery',
            value: delivered
              ? formatOrderDate(order.tracking?.deliveredAt)
              : order.tracking?.estimatedDelivery
                ? formatOrderDate(order.tracking.estimatedDelivery)
                : 'Not yet scheduled',
            note: `${order.deliveryMethod.label}${
              order.deliveryMethod.serviceLevel ? ` · ${order.deliveryMethod.serviceLevel}` : ''
            }`,
          },
        ]}
      />

      <div className="pf-account__acts pf-account__actions">
        {canTrackOrder(order) ? (
          <Button to={`/account/orders/${order.id}/track`}>Track Order</Button>
        ) : null}
        {/* No invoice document is generated by this system. The action only
            appears once the backend has actually issued an invoice number. */}
        {order.invoice?.available ? (
          <Button variant="ghost" onClick={() => setInvoiceOpen(true)}>
            View Invoice
          </Button>
        ) : null}
        {canRequestReturnNow(order) ? (
          <Button to={`/account/orders/${order.id}/return`} variant="ghost">
            Return Items
          </Button>
        ) : null}
        {canCancelOrder(order) ? (
          <Button variant="ghost" onClick={() => setConfirmOpen(true)}>
            Cancel Order
          </Button>
        ) : null}
        <Button variant="ghost" onClick={handleBuyAgain}>
          Buy Again
        </Button>
        <Link to="/shop" className="pf-account__act is-accent">
          Continue Shopping
        </Link>
      </div>

      {/* Every step shown here is a transition the atelier actually recorded.
          Steps with no recorded transition carry no date — no delivery leg is
          ever estimated for the customer. */}
      <section className="pf-account__section" aria-labelledby="pf-order-journey">
        <p className="label" id="pf-order-journey">
          Journey
        </p>
        {tracking?.steps?.length ? (
          <>
            <OrderSteps steps={tracking.steps} ariaLabel={`Journey for order ${orderRef}`} />
            <p className="pf-account__note">
              Dates appear against a step once the atelier records it. Steps still ahead are shown
              without a date — we do not estimate them.
            </p>
          </>
        ) : (
          <p className="pf-account__note">
            No progress has been recorded against this order yet. This page will update as the
            atelier moves it forward.
          </p>
        )}
      </section>

      <div className="pf-account__grid">
        {/* ------------------------------ Left ------------------------------ */}
        <div>
          <section className="pf-account__section" aria-labelledby="pf-order-pieces">
            <p className="label" id="pf-order-pieces">
              Your pieces
            </p>
            <OrderLines items={order.items} />
          </section>

          {activeReturn ? (
            <ReturnCard record={activeReturn} order={order} className="pf-account__section" />
          ) : null}
        </div>

        {/* ------------------------------ Right ----------------------------- */}
        <div className="pf-account__rail">
          <OrderTotals pricing={order.pricing} />

          <div className="pf-panel">
            <p className="pf-panel__eyebrow">Payment</p>
            <p className="pf-panel__name">{order.paymentMethod.label}</p>
            <p className="pf-meta__row">
              <OrderChip status={order.paymentStatus} kind="payment" />
            </p>
            {/* Refund figures come from a real return record; nothing is shown
                when no refund has been recorded. */}
            {activeReturn?.refundAmount ? (
              <div className="pf-note">
                <p className="pf-panel__eyebrow">Refund</p>
                <p className="pf-meta__strong">{formatINR(activeReturn.refundAmount)}</p>
                <p className="pf-panel__line">{refundMethodLabel(order)}</p>
                {activeReturn.refundStatus ? (
                  <p className="pf-panel__quiet">
                    {activeReturn.refundStatus.replace(/_/g, ' ').toLowerCase()}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="pf-panel__quiet">
              No card details or payment credentials are ever stored with an order.
            </p>
          </div>

          {/* The address snapshot — editing the address book never rewrites it. */}
          {order.address ? (
            <div className="pf-panel">
              <p className="pf-panel__eyebrow">Delivering To</p>
              <p className="pf-panel__name">{order.address.fullName}</p>
              <p className="pf-panel__line">
                {order.address.addressLine}
                {order.address.landmark ? `, ${order.address.landmark}` : ''}
              </p>
              <p className="pf-panel__line">
                {order.address.city}, {order.address.state} — {order.address.pincode}
              </p>
              {order.address.phone ? (
                <p className="pf-panel__quiet">{formatPhone(order.address.phone)}</p>
              ) : null}
              <p className="pf-panel__quiet">
                This is the address recorded when the order was placed. Editing your address book
                never changes a past order.
              </p>
            </div>
          ) : null}

          {/* Invoice availability — stated honestly. */}
          <div className="pf-panel">
            <p className="pf-panel__eyebrow">Invoice</p>
            {order.invoice?.available ? (
              <>
                <p className="pf-panel__line">{order.invoice.number}</p>
                {order.invoice.issuedAt ? (
                  <p className="pf-panel__quiet">Issued {formatOrderDate(order.invoice.issuedAt)}</p>
                ) : null}
                <p className="pf-panel__quiet">
                  A downloadable invoice document is not available yet. The summary above reflects
                  exactly what was charged.
                </p>
              </>
            ) : (
              <p className="pf-panel__line">
                An invoice has not been issued for this order yet. Please contact the atelier if you
                need one for your records.
              </p>
            )}
          </div>

          {/* Why a return is not being offered — never left unexplained. */}
          {!canRequestReturnNow(order) && blocked ? (
            <div className="pf-panel">
              <p className="pf-panel__eyebrow">Returns</p>
              <p className="pf-panel__line">{blocked}</p>
            </div>
          ) : windowState.known && windowState.open ? (
            <p className="pf-account__note">
              Returns for this order close in {windowState.daysLeft}{' '}
              {windowState.daysLeft === 1 ? 'day' : 'days'}.
            </p>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Cancel this order?"
        description={
          /* A paid order's cancellation does not move money or restock anything
             by itself — the UI must not claim otherwise. */
          order.paymentStatus === ORDER_PAYMENT_STATUS.PAID
            ? 'Are you sure you want to cancel this order? It has already been paid for, so the atelier will contact you about the refund — no refund is issued automatically.'
            : 'Are you sure you want to cancel this order? Nothing has been charged for it.'
        }
        confirmLabel="Cancel Order"
        cancelLabel="Keep Order"
        onConfirm={handleCancel}
        onCancel={() => setConfirmOpen(false)}
      />

      <InvoicePreview
        order={order}
        isOpen={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
      />
    </OrderFrame>
  );
}
