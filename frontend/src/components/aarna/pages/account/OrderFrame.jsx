/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — the order screens' shared chrome.
 *
 * `components/orders/OrderPageShell.jsx` is the production frame every single-order
 * page sits in, and its one decision is the one this file carries: a signed-in
 * customer gets the account shell, a GUEST who has just checked out in this
 * browser gets the same page inside plain page chrome with the two ways to keep
 * the order. Access control does not live in either of them — the order itself is
 * read through the ownership-checked context accessor. This file is that shell in
 * the design's register:
 *
 *   · signed in  → the port's own `AccountFrame` (breadcrumbs, the customer's
 *                  name, the account navigation) — the same frame Stage 2.2 and
 *                  2.3's screens render inside;
 *   · a guest    → the design's page frame (`.info container`, `.crumbs`) and
 *                  ONE strip that states what is true (a guest order from this
 *                  browser) and offers the same two destinations production
 *                  offers (`/signup?returnTo=%2Faccount%2Forders`,
 *                  `/signin?returnTo=%2Faccount%2Forders`). No account
 *                  navigation is drawn for a guest: they have no account.
 *
 * The rest of this file is the register the four order screens share, so one
 * order never reads two ways:
 *
 *   · `OrderChip`    — a status, resolved by the SAME centralised definitions
 *                      production resolves it with (`getOrderStatus`,
 *                      `getPaymentStatus`, `getReturnStatus`), drawn in the
 *                      port's `pf-chip` register with the definition's own tone
 *                      (the checkout sheet's four `data-tone`s are exactly the
 *                      four tones the config publishes) and announced with its
 *                      kind ("Order status: Shipped"), never as a bare word;
 *   · `OrderMeta`    — a labelled band of facts, in the checkout sheet's own
 *                      `.pf-meta` grid;
 *   · `OrderSteps`   — the recorded journey, from whatever the tracking service
 *                      returned. A step carries a date only when the atelier
 *                      recorded that transition; nothing is estimated, and no
 *                      step is ever invented here;
 *   · `OrderLines`   — the pieces of an order in the design's own
 *                      `.checkout__lines` register, with `orderItemHref`'s real
 *                      destination or production's honest "no longer in the
 *                      collection" line;
 *   · `OrderTotals`  — the order's own recorded pricing, in the design's
 *                      `.totals` register, in the recorded order products →
 *                      discount → coupon → delivery → COD → total;
 *   · `ReturnCard`   — a real return record, with its own timeline and the
 *                      atelier's own refund figure (or none);
 *   · the three problem surfaces — loading, a failed read, and the safe
 *                      not-found/no access state — carrying production's own
 *                      words for each HTTP status through `orderErrorCopy`, so
 *                      "signed out", "not your order", "no such order", "this
 *                      moved on" and "our side broke" stay distinguishable.
 *
 * WHAT IS NOT HERE: any fabricated carrier, waybill, delivery estimate, event
 * timestamp, refund or status transition. Every value on every order screen is a
 * value the application already holds.
 */

import { Link } from '../../router/index.jsx';
import Button from '../../components/ui/Button.jsx';
import AccountFrame from './AccountFrame.jsx';
import { useAuth } from '../../../../context/AuthContext.jsx';
import {
  getOrderStatus,
  getPaymentStatus,
  getReturnStatus,
  getReturnPickupMethod,
  getReturnReason,
  RETURN_RESOLUTION,
} from '../../../../config/orderConfig.js';
import { getReturnTimeline } from '../../../../services/orders/returnService.js';
import { orderItemHref, formatEventTime, formatOrderDate } from '../../../../utils/orders.js';
import { formatINR } from '../../../../utils/shopping.js';
import { orderErrorCopy } from '../../../../components/orders/OrderErrorState.jsx';

/* The three kinds a status can be, and the resolvers production resolves them
   with. The label is spoken with its kind, as production's badge does. */
const CHIP_RESOLVERS = {
  order: getOrderStatus,
  payment: getPaymentStatus,
  return: getReturnStatus,
};
const CHIP_KINDS = {
  order: 'Order status',
  payment: 'Payment status',
  return: 'Return status',
};

/** Where a guest goes to keep the order they placed in this browser. */
const GUEST_RETURN_TO = '%2Faccount%2Forders';

/* ── the frame ────────────────────────────────────────────────────────────── */

export default function OrderFrame({ breadcrumbItems = [], label, title, children }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return (
      <AccountFrame breadcrumbItems={breadcrumbItems} label={label} title={title}>
        {children}
      </AccountFrame>
    );
  }

  return (
    <div className="info container">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {breadcrumbItems.map((item) => (
          <span className="crumbs__step" key={`${item.label}-${item.to ?? ''}`}>
            <span>/</span>
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </span>
        ))}
      </nav>

      <header className="pf-account__intro">
        <div className="pf-account__who">
          {label ? <p className="label">{label}</p> : null}
          {title ? <h1 className="display pf-account__name">{title}</h1> : null}
        </div>
      </header>

      <section className="pf-account__section" aria-label="Guest order">
        <div className="pf-account__strip">
          <div>
            <p className="label">Guest order</p>
            <p className="pf-account__strip-line">
              You&rsquo;re viewing a guest order from this browser. Create an account to keep your
              orders organized.
            </p>
          </div>
          <div className="pf-account__acts">
            <Button to={`/signup?returnTo=${GUEST_RETURN_TO}`}>Create Account</Button>
            <Button to={`/signin?returnTo=${GUEST_RETURN_TO}`} variant="ghost">
              Sign In
            </Button>
          </div>
        </div>
      </section>

      <div className="pf-account__body">{children}</div>
    </div>
  );
}

/* ── a status, in the port's chip register ─────────────────────────────────── */

export function OrderChip({ status, kind = 'order', className = '' }) {
  const resolve = CHIP_RESOLVERS[kind] ?? getOrderStatus;
  const definition = resolve(status);
  return (
    <span className={`pf-chip${className ? ` ${className}` : ''}`} data-tone={definition.tone}>
      <span className="sr-only">{CHIP_KINDS[kind] ?? CHIP_KINDS.order}: </span>
      {definition.label}
    </span>
  );
}

/* ── a band of facts ───────────────────────────────────────────────────────── */

export function OrderMeta({ items = [] }) {
  if (!items.length) return null;
  return (
    <dl className="pf-meta">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {item.note ? <span className="pf-meta__quiet">{item.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ── the recorded journey ──────────────────────────────────────────────────── */

const STEP_STATES = { done: 'Completed', current: 'Current step', upcoming: 'Upcoming' };

export function OrderSteps({ steps = [], ariaLabel = 'Order journey' }) {
  if (!steps.length) return null;
  return (
    <ol className="pf-account__steps" aria-label={ariaLabel}>
      {steps.map((step) => {
        const state = step.state ?? 'upcoming';
        const time = step.timestamp ?? step.at ?? null;
        return (
          <li
            key={step.id ?? step.status}
            className={`pf-account__step is-${state}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="pf-account__step-marker" aria-hidden="true" />
            <p className="pf-account__step-title">
              {step.title}
              <span className="sr-only"> — {STEP_STATES[state] ?? STEP_STATES.upcoming}</span>
              {/* A date is shown only when the atelier actually recorded that
                  transition — the tracking service never estimates one. */}
              {time ? <span className="pf-account__step-time">{formatEventTime(time)}</span> : null}
            </p>
            {step.description ? <p className="pf-account__step-note">{step.description}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ── the pieces of an order ────────────────────────────────────────────────── */

export function OrderLines({ items = [] }) {
  if (!items.length) return null;
  return (
    <ul className="checkout__lines">
      {items.map((item) => {
        const href = orderItemHref(item);
        const saved =
          item.originalPrice && item.originalPrice > item.price
            ? (item.originalPrice - item.price) * item.quantity
            : 0;
        return (
          <li key={item.lineId}>
            {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span aria-hidden="true" />}
            <span>
              {item.name}
              <small>
                {[item.color, item.size].filter(Boolean).join(' · ') || 'Free Size'} · Qty{' '}
                {item.quantity}
              </small>
              {saved > 0 ? <small>{formatINR(saved)} saved on this piece</small> : null}
            </span>
            {href ? (
              <Link to={href} className="pf-account__act">
                View Product
                <span className="sr-only"> — {item.name}</span>
              </Link>
            ) : (
              <span className="pf-account__act">No longer in the collection</span>
            )}
            <strong>{formatINR(item.lineTotal)}</strong>
          </li>
        );
      })}
    </ul>
  );
}

/* ── the order's own recorded pricing ──────────────────────────────────────── */

export function OrderTotals({ pricing }) {
  if (!pricing) return null;
  return (
    <div className="pf-panel">
      <p className="pf-panel__eyebrow">Order Summary</p>
      <dl className="totals pf-confirm__totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatINR(pricing.subtotal)}</dd>
        </div>
        {pricing.productDiscount > 0 ? (
          <div className="totals__disc">
            <dt>Product discount</dt>
            <dd>− {formatINR(pricing.productDiscount)}</dd>
          </div>
        ) : null}
        {pricing.couponDiscount > 0 ? (
          <div className="totals__disc">
            <dt>Offer · {pricing.couponCode ?? 'Applied'}</dt>
            <dd>− {formatINR(pricing.couponDiscount)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Delivery</dt>
          <dd>{pricing.shipping === 0 ? 'Complimentary' : formatINR(pricing.shipping)}</dd>
        </div>
        {pricing.codFee > 0 ? (
          <div>
            <dt>Cash on delivery fee</dt>
            <dd>{formatINR(pricing.codFee)}</dd>
          </div>
        ) : null}
        <div className="totals__grand">
          <dt>Total Paid</dt>
          <dd>{formatINR(pricing.total)}</dd>
        </div>
      </dl>
      {pricing.saved > 0 ? (
        <p className="pf-panel__quiet">You saved {formatINR(pricing.saved)} on this order.</p>
      ) : null}
    </div>
  );
}

/* ── a real return record ──────────────────────────────────────────────────── */

export function ReturnCard({ record, order, showTimeline = true, className = '' }) {
  if (!record) return null;

  const timeline = getReturnTimeline(record);
  const reason = record.items?.[0]?.reason ?? record.reason ?? null;
  const reasonLabel = record.reasonLabel ?? getReturnReason(reason)?.label ?? reason ?? '—';
  const pickup = getReturnPickupMethod(record.pickupMethod);
  const refundAmount = record.refundAmount ?? 0;
  const refundStatus = record.refundStatus ?? null;
  const reference = record.returnNumber ?? record.id;

  return (
    <section
      aria-labelledby={`pf-return-${record.id}-heading`}
      className={`pf-panel${className ? ` ${className}` : ''}`}
    >
      <div className="pf-account__order-head">
        <div>
          <p className="pf-panel__eyebrow">Return Request</p>
          <h3 id={`pf-return-${record.id}-heading`} className="pf-panel__name">
            {reference}
          </h3>
          <p className="pf-panel__quiet">Requested {formatOrderDate(record.createdAt)}</p>
        </div>
        <OrderChip status={record.status} kind="return" />
      </div>

      <OrderMeta
        items={[
          { label: 'Reason', value: reasonLabel },
          { label: 'Collection', value: pickup?.label ?? record.pickupMethod ?? '—' },
          ...(record.note ? [{ label: 'Your Note', value: record.note }] : []),
        ]}
      />

      {(record.items ?? []).length ? (
        <ul className="checkout__lines">
          {record.items.map((item) => (
            <li key={item.id ?? `${record.id}-${item.orderItemId}`}>
              {item.image ? <img src={item.image} alt="" loading="lazy" /> : <span aria-hidden="true" />}
              <span>
                {item.name}
                <small>
                  {[item.color, item.size].filter(Boolean).join(' · ') || 'Free Size'} · Qty{' '}
                  {item.quantity}
                </small>
              </span>
              <span aria-hidden="true" />
              <strong>{formatINR(item.refundAmount ?? 0)}</strong>
            </li>
          ))}
        </ul>
      ) : null}

      {/* The atelier's own recorded figure and state, or an honest statement of
          what a return resolves as — never a refund claimed before one exists. */}
      {refundAmount > 0 ? (
        <div className="pf-note">
          <p className="pf-panel__eyebrow">{RETURN_RESOLUTION.label}</p>
          <p className="pf-meta__strong">{formatINR(refundAmount)}</p>
          {record.refundMethod ? <p className="pf-panel__line">{record.refundMethod}</p> : null}
          <p className="pf-panel__quiet">
            {(refundStatus ?? 'NOT_REQUESTED').replace(/_/g, ' ').toLowerCase()}
          </p>
        </div>
      ) : (
        <p className="pf-panel__line">{RETURN_RESOLUTION.description}</p>
      )}

      {showTimeline ? (
        <div className="pf-account__section">
          <p className="label">Return Progress</p>
          <OrderSteps steps={timeline} ariaLabel={`Progress of return ${record.id}`} />
        </div>
      ) : order ? (
        <p className="pf-panel__actions">
          <Link to={`/account/orders/${order.id}`} className="pf-account__act is-accent">
            View Order
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/* ── the three states every order read can be in ───────────────────────────── */

const ORDERS_CRUMBS = [
  { label: 'Account', to: '/account' },
  { label: 'Orders', to: '/account/orders' },
];

export function OrderLoading({ label, breadcrumbItems, title }) {
  return (
    <OrderFrame breadcrumbItems={breadcrumbItems ?? ORDERS_CRUMBS} label="Your account" title={title}>
      <div className="empty" aria-busy="true" aria-label={label}>
        <p className="empty__title">{label}&hellip;</p>
      </div>
    </OrderFrame>
  );
}

export function OrderProblem({
  status,
  message,
  onRetry,
  breadcrumbItems,
  title,
  /* Production's recovery action for a single order is the way back to the
     list; on the list screen itself it is the way onward to the shop. */
  secondary = { to: '/account/orders', label: 'View My Orders' },
}) {
  const copy = orderErrorCopy(status, message);
  const lapsed = status === 401;
  const retryable = status === 0 || status === 409 || status === 422 || status >= 500;

  return (
    <OrderFrame breadcrumbItems={breadcrumbItems ?? ORDERS_CRUMBS} label="Your account" title={title}>
      <div className="empty" role="alert">
        <p className="empty__title">{copy.title}</p>
        <p>{copy.description}</p>
        <div className="pf-account__acts">
          {lapsed ? <Button to={`/signin?returnTo=${GUEST_RETURN_TO}`}>Sign in</Button> : null}
          {retryable && onRetry ? <Button onClick={() => onRetry()}>Try again</Button> : null}
          <Button to={secondary.to} variant="ghost">
            {secondary.label}
          </Button>
        </div>
      </div>
    </OrderFrame>
  );
}

/**
 * One state covers both "no such order" and "not your order", deliberately: a
 * customer probing another customer's order id must learn nothing from the
 * difference. Production's own words, and its own two destinations.
 */
export function OrderMissing({ breadcrumbItems, title }) {
  return (
    <OrderFrame breadcrumbItems={breadcrumbItems ?? ORDERS_CRUMBS} label="Your account" title={title}>
      <div className="empty" role="status">
        <p className="empty__title">Order not found</p>
        <p>That order could not be found in your account.</p>
        <div className="pf-account__acts">
          <Button to="/account/orders">View My Orders</Button>
          <Button to="/shop" variant="ghost">
            Continue Shopping
          </Button>
        </div>
      </div>
    </OrderFrame>
  );
}
