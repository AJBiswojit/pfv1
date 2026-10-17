/**
 * PRATIKSHYA FASHION — PHASE 9 · the order confirmation, in the design's language.
 *
 * The design has no counterpart to this page (its `TrackOrder.jsx` is a
 * prototype lookup that says outright it is not connected to an order system),
 * so the page is written out of the design's own parts — `.crumbs`,
 * `.container`, `.label`, `.display`, `.checkout__lines`, `.totals`, `.btn`
 * variants — over this application's real confirmation.
 *
 * It renders the order the application actually has, and nothing else:
 * `OrderContext.currentOrder` — the order the backend confirmed at checkout.
 * A direct visit with no completed order shows the honest empty state, never a
 * fabricated one. The order number, the date, the payment method and status,
 * the delivery service level, the pieces, the address and the pricing ledger
 * are all read from that order; the status LABEL comes from the application's
 * own register (`config/orderConfig`), so the same status always reads the
 * same way. No delivery date is invented: the atelier has not scheduled one at
 * the moment an order is placed.
 *
 * The two ways into the rest of the journey — the order's own page and its
 * tracking — are the application's existing routes, exactly as production
 * links them.
 */

import { useEffect } from 'react';
import { CheckCircle2, PackageCheck } from 'lucide-react';
import { Link } from '../router/index.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useOrder } from '../../../context/OrderContext.jsx';
import { getPaymentStatus } from '../../../config/orderConfig.js';
import { formatINR } from '../../../utils/shopping.js';
import { formatPhone } from '../../../utils/validation.js';

/** The status word, from the application's own register. */
function StatusChip({ status }) {
  const definition = getPaymentStatus(status);
  return (
    <span className="pf-chip" data-tone={definition.tone}>
      <span className="sr-only">Payment status: </span>
      {definition.label}
    </span>
  );
}

export default function OrderSuccess() {
  const { user, isAuthenticated } = useAuth();
  const { currentOrder } = useOrder();

  useEffect(() => {
    const previous = document.title;
    document.title = 'Order Confirmed — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  /* ------------------- Protected: no order in state ------------------- */

  if (!currentOrder) {
    return (
      <div className="container pf-journey__page">
      <div className="empty">
          <p className="empty__title">We couldn&rsquo;t find that order.</p>
          <p>
            A confirmation is only available right after a completed checkout. Your collection
            remains safe in your bag.
          </p>
          <Button to="/shop">Continue Shopping</Button>
        </div>
      </div>
    );
  }

  /* ---------------------------- Confirmation ---------------------------- */

  const order = currentOrder;
  const orderDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const firstName = (order.customer?.fullName ?? '').split(' ')[0] || 'friend';

  return (
    <div className="container pf-journey__page pf-confirm">
      <p className="sr-only" role="status" aria-live="polite">
        Order confirmed. Order {order.orderNumber ?? order.id} has been placed successfully.
      </p>
      <header className="pf-head">
        <p className="label pf-confirm__eyebrow">
          <CheckCircle2 size={15} aria-hidden="true" /> Order Confirmed
        </p>
        <h1 className="display pf-head__title">Thank you, <em>{firstName}.</em></h1>
        <p className="pf-head__lead">
          Your order is confirmed and will be prepared with care at the atelier.
          A confirmation has been sent to {order.customer?.email}.
        </p>
      </header>

      {/* ---------------------------- Meta band ---------------------------- */}
      <dl className="pf-meta">
        <div>
          <dt>Order number</dt>
          <dd className="pf-meta__strong">{order.orderNumber ?? order.id}</dd>
        </div>
        <div>
          <dt>Order date</dt>
          <dd>{orderDate}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd className="pf-meta__row">
            {order.paymentMethod.label}
            <StatusChip status={order.paymentStatus} />
          </dd>
        </div>
        {/* The atelier has not scheduled a delivery date at the moment an
            order is placed, so none is claimed here. The service level below
            is the shipping option chosen at checkout — not a promised date. */}
        <div>
          <dt>Delivery</dt>
          <dd>
            {order.deliveryMethod.label}
            <span className="pf-meta__quiet">
              {order.deliveryMethod.serviceLevel || order.deliveryMethod.estimate || ''}
            </span>
          </dd>
        </div>
      </dl>

      {/* ----------------------------- Pieces ----------------------------- */}
      <ul className="checkout__lines pf-confirm__lines">
        {order.items.map((item) => (
          <li key={item.lineId}>
            {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span />}
            <span>
              {item.name}
              <small>
                {[item.color, item.size].filter(Boolean).join(' · ') || 'Free Size'} · Qty {item.quantity}
              </small>
            </span>
            <span />
            <strong>{formatINR(item.lineTotal)}</strong>
          </li>
        ))}
      </ul>

      {/* ---------------------- Address + pricing ---------------------- */}
      <div className="pf-review__cols">
        <div className="pf-panel">
          <p className="pf-panel__eyebrow">Delivering to</p>
          <p className="pf-panel__name">{order.address.fullName}</p>
          <p className="pf-panel__line">
            {order.address.addressLine}
            {order.address.landmark ? `, ${order.address.landmark}` : ''}
          </p>
          <p className="pf-panel__line">
            {order.address.city}, {order.address.state} — {order.address.pincode}
          </p>
          <p className="pf-panel__quiet">{formatPhone(order.address.phone)}</p>
        </div>

        <div className="pf-panel">
          <p className="pf-panel__eyebrow">Order total</p>
          <dl className="totals pf-confirm__totals">
            <div><dt>Subtotal</dt><dd>{formatINR(order.pricing.subtotal)}</dd></div>
            {order.pricing.productDiscount > 0 && (
              <div className="totals__disc"><dt>Product discount</dt><dd>− {formatINR(order.pricing.productDiscount)}</dd></div>
            )}
            {order.pricing.couponDiscount > 0 && (
              <div className="totals__disc"><dt>Offer · {order.pricing.couponCode}</dt><dd>− {formatINR(order.pricing.couponDiscount)}</dd></div>
            )}
            <div>
              <dt>Delivery</dt>
              <dd>{order.pricing.shipping === 0 ? 'Complimentary' : formatINR(order.pricing.shipping)}</dd>
            </div>
            {order.pricing.codFee > 0 && (
              <div><dt>Cash on delivery fee</dt><dd>{formatINR(order.pricing.codFee)}</dd></div>
            )}
            <div className="totals__grand"><dt>Total</dt><dd>{formatINR(order.pricing.total)}</dd></div>
          </dl>
        </div>
      </div>

      {/* ----------------------------- Actions ----------------------------- */}
      <div className="pf-confirm__actions">
        <Button to={`/account/orders/${order.id}`}>View Order</Button>
        <Button to={`/account/orders/${order.id}/track`} variant="ghost">Track Order</Button>
        <Button to="/shop" variant="ghost">Continue Shopping</Button>
      </div>

      {/*
        Guests have a real order on the backend, identified by the email they
        checked out with. Creating an account claims those orders via the
        verified-email claim flow — the application's own route, unchanged.
      */}
      {!isAuthenticated || !user ? (
        <div className="pf-note">
          <p className="pf-panel__eyebrow">Keep this order</p>
          <p className="pf-panel__line">
            Create an account to keep your orders organised. Your guest orders are linked to
            your account using the email you checked out with — they appear in your order
            history after sign up.
          </p>
          <Button to={`/signup?returnTo=${encodeURIComponent('/account/orders')}`}>Create an Account</Button>
        </div>
      ) : null}

      <p className="pf-confirm__closing">
        <PackageCheck size={13} aria-hidden="true" />
        {order.paymentStatus === 'PAID'
          ? 'Your payment was captured securely by Razorpay. If the charge differs from this total, contact support.'
          : 'Cash on delivery — the total above (including the COD fee) is payable to the delivery partner.'}
      </p>
    </div>
  );
}
