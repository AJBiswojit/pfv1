/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — the return request, as a page of
 * the design.
 *
 * The production screen is `pages/account/OrderReturn.jsx`. It really creates a
 * return, and this page creates it the same way:
 *
 *   · the order is read through the ownership-checked context accessor; loading
 *     wins over every other state, and a failed read is named as failed;
 *   · eligibility is the backend's own rule, mirrored so the form is never
 *     offered for an action that would be rejected: `canRequestReturnNow`
 *     (delivered, un-returned lines remaining, inside the recorded return
 *     window). When it is false the page explains why with
 *     `returnBlockedReason(order)` — or shows the return that already exists, with
 *     its own record and timeline;
 *   · the form asks exactly what the backend accepts: a set of lines with real
 *     per-line quantities (never more than `returnableQuantity`, which is
 *     `quantity - returnedQuantity`), one `RETURN_REASONS` reason, one
 *     `RETURN_PICKUP_METHODS` collection method (the only two the backend stores),
 *     and an optional note. There is no exchange option, because the backend has
 *     no exchange capability;
 *   · production's own validation messages, verbatim: "Choose at least one piece
 *     to return." and "Let us know why you are returning these pieces.";
 *   · submission is `createReturn({ orderId, items, pickupMethod, note })` — a real
 *     server write. Its answer decides everything: a rejection is surfaced
 *     verbatim into the form's alert (a 422 carries the real business reason), and
 *     only a recorded return reaches the confirmation state, which renders the
 *     server's own record — never a locally built one;
 *   · the indicative refund is `unitPrice × quantity` for the selected lines, and
 *     the page says what production says: the atelier's inspected figure is the
 *     authoritative one.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from '../../router/index.jsx';
import Button from '../../components/ui/Button.jsx';
import OrderFrame, { OrderLoading, OrderProblem, ReturnCard } from './OrderFrame.jsx';
import { useOrder } from '../../../../context/OrderContext.jsx';
import {
  RETURN_PICKUP_METHODS,
  RETURN_POLICY_SUMMARY,
  RETURN_REASONS,
  RETURN_RESOLUTION,
} from '../../../../config/orderConfig.js';
import {
  RETURN_WINDOW_DAYS,
  canRequestReturnNow,
  formatOrderDate,
  latestReturn,
  refundMethodLabel,
  returnBlockedReason,
  returnWindow,
} from '../../../../utils/orders.js';
import { formatINR } from '../../../../utils/shopping.js';

const CRUMBS = [
  { label: 'Account', to: '/account' },
  { label: 'Orders', to: '/account/orders' },
];
const LOADING_CRUMBS = [...CRUMBS, { label: 'Loading' }];
const PROBLEM_CRUMBS = [...CRUMBS, { label: 'Unavailable' }];

export default function OrderReturn() {
  const { orderId } = useParams();
  const { fetchOrder, createReturn } = useOrder();

  /** lineId → quantity being returned (absent = not selected). */
  const [selected, setSelected] = useState(() => new Map());
  const [reason, setReason] = useState('');
  const [pickupMethod, setPickupMethod] = useState(RETURN_PICKUP_METHODS[0].id);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const confirmationRef = useRef(null);

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchOrder(orderId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setOrder(result.order);
      } else {
        setOrder(null);
        setLoadError({ status: result.status, message: result.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, fetchOrder, reloadToken]);

  useEffect(() => {
    const previous = document.title;
    document.title = order
      ? `Return ${order.orderNumber ?? order.id} — PRATIKSHYA FASHION`
      : 'Return — PRATIKSHYA FASHION';
    return () => {
      document.title = previous;
    };
  }, [order]);

  /* The confirmation is announced and receives focus, as production's does. */
  useEffect(() => {
    if (submitted) confirmationRef.current?.focus();
  }, [submitted]);

  if (loading) {
    return <OrderLoading label="Loading your order" breadcrumbItems={LOADING_CRUMBS} />;
  }

  if (loadError || !order) {
    return (
      <OrderProblem
        status={loadError?.status ?? 404}
        message={loadError?.message}
        onRetry={reload}
        breadcrumbItems={PROBLEM_CRUMBS}
      />
    );
  }

  const orderRef = order.orderNumber ?? order.id;
  const orderCrumbs = [
    ...CRUMBS,
    { label: orderRef, to: `/account/orders/${order.id}` },
    { label: 'Return' },
  ];
  const existing = latestReturn(order);

  /* ------------------------ Confirmation state ------------------------ */

  if (submitted) {
    return (
      <OrderFrame
        breadcrumbItems={orderCrumbs}
        label="Return Requested"
        title={
          <>
            We have your <em>request.</em>
          </>
        }
      >
        <div ref={confirmationRef} tabIndex={-1} role="status" aria-live="polite">
          <p className="info__lead pf-account__lead">
            Our care team will review your return and be in touch. You can follow its progress here
            and on your order at any time.
          </p>
        </div>
        <ReturnCard record={submitted} order={order} className="pf-account__section" />
        <div className="pf-account__acts pf-account__actions">
          <Button to={`/account/orders/${order.id}`}>Back to Order</Button>
          <Button to="/shop" variant="ghost">
            Continue Shopping
          </Button>
        </div>
      </OrderFrame>
    );
  }

  /* -------------------------- Blocked states -------------------------- */

  /* Mirrors exactly what the backend accepts: delivered, un-returned lines
     remaining, and inside the recorded return window. */
  if (!canRequestReturnNow(order)) {
    if (existing) {
      return (
        <OrderFrame
          breadcrumbItems={orderCrumbs}
          label="Return Status"
          title={
            <>
              Your return is <em>in motion.</em>
            </>
          }
        >
          <p className="pf-account__note">{returnBlockedReason(order)}</p>
          <ReturnCard record={existing} order={order} className="pf-account__section" />
          <div className="pf-account__acts pf-account__actions">
            <Button to={`/account/orders/${order.id}`}>Back to Order</Button>
          </div>
        </OrderFrame>
      );
    }

    return (
      <OrderFrame
        breadcrumbItems={orderCrumbs}
        label="Return Unavailable"
        title={
          <>
            This order can&rsquo;t be <em>returned.</em>
          </>
        }
      >
        <div className="empty">
          <p className="empty__title">This order can&rsquo;t be returned.</p>
          <p>{returnBlockedReason(order)}</p>
          <div className="pf-account__acts">
            <Button to={`/account/orders/${order.id}`}>Back to Order</Button>
            <Button to="/account/orders" variant="ghost">
              View My Orders
            </Button>
          </div>
        </div>
      </OrderFrame>
    );
  }

  /* ------------------------------- Form ------------------------------- */

  /* Per-line returnable quantity comes from the backend record
     (`quantity - returnedQuantity`), so a partially-returned line can only be
     returned for what actually remains. */
  const items = (order.items ?? []).map((item) => ({
    ...item,
    alreadyRequested: (item.returnableQuantity ?? 0) === 0,
  }));

  const selectedLines = items.filter((item) => selected.has(item.lineId));

  /* Indicative only: the refund a return is actually worth is computed and stored
     by the backend from the recorded unit prices. */
  const indicativeRefund = selectedLines.reduce(
    (total, item) => total + item.unitPrice * (selected.get(item.lineId) ?? 0),
    0
  );

  const windowState = returnWindow(order);

  const toggleItem = (item) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.lineId)) next.delete(item.lineId);
      else next.set(item.lineId, item.returnableQuantity);
      return next;
    });
    setErrors((current) => ({ ...current, items: '' }));
  };

  const setQuantity = (item, quantity) => {
    setSelected((current) => {
      const next = new Map(current);
      const clamped = Math.max(1, Math.min(item.returnableQuantity, Number(quantity) || 1));
      next.set(item.lineId, clamped);
      return next;
    });
  };

  /* Submit to the backend. The server re-checks ownership, order status, the
     return window and per-line quantities, and its response is what gets
     displayed — nothing is confirmed locally. */
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = {};
    if (selected.size === 0) nextErrors.items = 'Choose at least one piece to return.';
    if (!reason) nextErrors.reason = 'Let us know why you are returning these pieces.';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    const result = await createReturn({
      orderId: order.id,
      items: [...selected.entries()].map(([lineId, quantity]) => ({ lineId, quantity, reason })),
      pickupMethod,
      note,
    });
    setSubmitting(false);

    if (!result.ok) {
      /* Backend rejections are surfaced verbatim (422 carries the real business
         reason, e.g. an expired window) rather than reduced to a generic failure. */
      setErrors({ form: result.message ?? 'Your return request could not be submitted.' });
      return;
    }

    setSubmitted(result.record);
    /* Refresh so the order (and its returns) reflect the server record. */
    reload();
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <OrderFrame
      breadcrumbItems={orderCrumbs}
      label={`Order ${orderRef}`}
      title={
        <>
          Request a <em>return.</em>
        </>
      }
    >
      <p className="info__lead pf-account__lead">
        {order.tracking?.deliveredAt
          ? `Delivered ${formatOrderDate(order.tracking.deliveredAt)} · Tell us what isn't right and we'll take care of it.`
          : "Tell us what isn't right and we'll take care of it."}
      </p>

      {/* Policy */}
      <p className="pf-note">
        {RETURN_POLICY_SUMMARY}
        {windowState.known ? (
          <span className="pf-panel__quiet">
            This order&rsquo;s {RETURN_WINDOW_DAYS}-day window closes on{' '}
            {formatOrderDate(windowState.closesAt)}.
          </span>
        ) : null}
      </p>

      {errorCount > 0 ? (
        <p className="form__err pf-alert" role="alert">
          {errors.form ?? 'Please complete your return request before submitting it.'}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="pf-account__section">
        <div className="pf-account__grid">
          <div className="pf-account__rail">
            {/* ------------------------- Items ------------------------- */}
            <fieldset>
              <legend className="pf-account__legend">Which pieces are you returning?</legend>
              {errors.items ? <p className="form__err">{errors.items}</p> : null}

              <div className="pf-options">
                {items.map((item) => {
                  const disabled = item.alreadyRequested;
                  const checked = selected.has(item.lineId);
                  const inputId = `return-item-${item.lineId}`;

                  return (
                    <label
                      key={item.lineId}
                      htmlFor={inputId}
                      className={`pf-option${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
                    >
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleItem(item)}
                      />
                      <span className="pf-option__body">
                        <span className="pf-account__option-row">
                          {item.image ? (
                            <img className="pf-account__option-img" src={item.image} alt="" loading="lazy" />
                          ) : (
                            <span className="pf-account__option-img" aria-hidden="true" />
                          )}
                          <span>
                            <strong>{item.name}</strong>
                            <span className="pf-option__line">
                              {[item.color, item.size].filter(Boolean).join(' · ') || 'Free Size'} · Qty{' '}
                              {item.quantity}
                            </span>
                            {disabled ? (
                              <span className="pf-account__option-state">Already returned</span>
                            ) : item.returnableQuantity < item.quantity ? (
                              <span className="pf-option__quiet">
                                {item.returnableQuantity} of {item.quantity} still returnable
                              </span>
                            ) : null}

                            {/* Partial returns: only what the backend says remains
                                returnable can be selected. */}
                            {checked && item.returnableQuantity > 1 ? (
                              <span className="pf-account__option-qty">
                                <span className="pf-account__option-qty-label">Quantity</span>
                                <select
                                  id={`${inputId}-qty`}
                                  value={selected.get(item.lineId) ?? item.returnableQuantity}
                                  onClick={(event) => event.preventDefault()}
                                  onChange={(event) => setQuantity(item, event.target.value)}
                                >
                                  {Array.from({ length: item.returnableQuantity }).map((_, index) => (
                                    <option key={index + 1} value={index + 1}>
                                      {index + 1}
                                    </option>
                                  ))}
                                </select>
                              </span>
                            ) : null}
                          </span>
                          <span className="pf-option__price">
                            {formatINR(item.unitPrice * item.quantity)}
                          </span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* ------------------------- Reason ------------------------- */}
            <fieldset>
              <legend className="pf-account__legend">Why are you returning them?</legend>
              {errors.reason ? <p className="form__err">{errors.reason}</p> : null}

              <div className="pf-options" role="radiogroup" aria-label="Reason for the return">
                {RETURN_REASONS.map((entry) => {
                  const inputId = `return-reason-${entry.id}`;
                  const checked = reason === entry.id;
                  return (
                    <label
                      key={entry.id}
                      htmlFor={inputId}
                      className={checked ? 'pf-option is-selected' : 'pf-option'}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name="return-reason"
                        value={entry.id}
                        checked={checked}
                        onChange={() => {
                          setReason(entry.id);
                          setErrors((current) => ({ ...current, reason: '' }));
                        }}
                      />
                      <span className="pf-option__body">
                        <span className="pf-option__title">{entry.label}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* --------------------- Pickup method --------------------- */}
            {/* The backend stores exactly two pickup methods and has no exchange
                capability at all, so no exchange option is offered here — a
                return always results in a refund. */}
            <fieldset>
              <legend className="pf-account__legend">How should we collect them?</legend>

              <div className="pf-options" role="radiogroup" aria-label="Collection method">
                {RETURN_PICKUP_METHODS.map((entry) => {
                  const inputId = `return-pickup-${entry.id}`;
                  const checked = pickupMethod === entry.id;
                  return (
                    <label
                      key={entry.id}
                      htmlFor={inputId}
                      className={checked ? 'pf-option is-selected' : 'pf-option'}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name="return-pickup"
                        value={entry.id}
                        checked={checked}
                        onChange={() => setPickupMethod(entry.id)}
                      />
                      <span className="pf-option__body">
                        <span className="pf-option__title">{entry.label}</span>
                        <span className="pf-option__line">{entry.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* -------------------------- Note -------------------------- */}
            <div className="pf-form">
              <label htmlFor="return-note">
                <span className="pf-lab">Anything you&rsquo;d like to add?</span>
                <span className="pf-hint">
                  Optional — a short note helps our care team understand.
                </span>
                <textarea
                  id="return-note"
                  rows={4}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Tell us a little more"
                />
              </label>
            </div>
          </div>

          {/* --------------------------- Aside --------------------------- */}
          <aside className="pf-account__rail">
            <div className="pf-panel">
              <p className="pf-panel__eyebrow">Your request</p>

              <dl className="pf-meta">
                <div>
                  <dt>Pieces selected</dt>
                  <dd>{selectedLines.length}</dd>
                </div>
                <div>
                  <dt>Resolution</dt>
                  <dd>{RETURN_RESOLUTION.label}</dd>
                </div>
                <div>
                  <dt>Indicative refund</dt>
                  <dd className="pf-meta__strong">{formatINR(indicativeRefund)}</dd>
                </div>
              </dl>

              {/* The refund the atelier records after inspection is authoritative —
                  this figure is indicative only, and no refund status is claimed
                  before one exists. */}
              <p className="pf-panel__quiet">
                {refundMethodLabel(order)}. The final refund is confirmed by the atelier once your
                return is received and inspected.
              </p>

              <div className="pf-account__acts pf-account__actions">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Return Request'}
                </Button>
              </div>

              <p className="pf-panel__actions">
                <Link to={`/account/orders/${order.id}`} className="pf-account__act">
                  Cancel and go back
                </Link>
              </p>
            </div>
          </aside>
        </div>
      </form>
    </OrderFrame>
  );
}
