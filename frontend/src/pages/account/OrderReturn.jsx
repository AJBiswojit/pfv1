import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Info } from "lucide-react";
import OrderPageShell from "../../components/orders/OrderPageShell";
import OrderErrorState from "../../components/orders/OrderErrorState";
import OrderLoadingState from "../../components/orders/OrderLoadingState";
import ReturnSummaryCard from "../../components/orders/ReturnSummaryCard";
import { useOrder } from "../../context/OrderContext";
import {
  AtelierButton,
  EditorialHeading,
  EmptyState,
  Rule,
  transition,
} from "../../design-system";
import {
  RETURN_PICKUP_METHODS,
  RETURN_POLICY_SUMMARY,
  RETURN_REASONS,
  RETURN_RESOLUTION,
} from "../../config/orderConfig";
import {
  RETURN_WINDOW_DAYS,
  canRequestReturnNow,
  formatOrderDate,
  latestReturn,
  refundMethodLabel,
  returnBlockedReason,
  returnWindow,
} from "../../utils/orders";
import { formatINR } from "../../utils/shopping";
import { cn } from "../../utils/cn";

/**
 * Return request — /account/orders/:orderId/return.
 *
 * PHASE 3: this form now actually creates a return.
 *
 * It previously validated and built the return record entirely in the
 * browser and showed a success confirmation without ever calling the
 * server, so the "return" existed only in local state and vanished on
 * reload. It also offered an "Exchange" resolution the backend has no
 * capability for, and it ignored the backend's return window.
 *
 * Now it POSTs to `/orders/{id}/returns`, sends real per-line quantities
 * and a real pickup method, and renders the server's own return record on
 * success. Ownership and every eligibility rule are enforced by the
 * backend; the page mirrors them only so it does not offer an action that
 * would be rejected.
 */
export default function OrderReturn() {
  const { orderId } = useParams();
  const { fetchOrder, createReturn } = useOrder();

  /** lineId → quantity being returned (absent = not selected). */
  const [selected, setSelected] = useState(() => new Map());
  const [reason, setReason] = useState("");
  const [pickupMethod, setPickupMethod] = useState(RETURN_PICKUP_METHODS[0].id);
  const [note, setNote] = useState("");
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
      if (result.ok) setOrder(result.order);
      else {
        setOrder(null);
        setLoadError({ status: result.status, message: result.error });
      }
    });
    return () => { cancelled = true; };
  }, [orderId, fetchOrder, reloadToken]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = order
      ? `Return ${order.orderNumber ?? order.id} — PRATIKSHYA FASHON`
      : "Return — PRATIKSHYA FASHON";
    return () => {
      document.title = previousTitle;
    };
  }, [order]);

  useEffect(() => {
    if (submitted) confirmationRef.current?.focus();
  }, [submitted]);

  if (loading) return <OrderLoadingState label="Loading your order…" />;

  if (loadError || !order) {
    return (
      <OrderErrorState
        status={loadError?.status ?? 404}
        message={loadError?.message}
        onRetry={reload}
      />
    );
  }

  const orderRef = order.orderNumber ?? order.id;

  const breadcrumbs = [
    { label: "Account", to: "/account" },
    { label: "Orders", to: "/account/orders" },
    { label: orderRef, to: `/account/orders/${order.id}` },
    { label: "Return" },
  ];

  /* ------------------------ Confirmation state ------------------------ */

  if (submitted) {
    return (
      <OrderPageShell breadcrumbItems={breadcrumbs}>
        <div
          ref={confirmationRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          className="focus:outline-none"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-accent" aria-hidden="true" />
            <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">
              Return Requested
            </p>
          </div>
          <EditorialHeading
            as="h2"
            size="subsection"
            spacing={{ title: "mb-0" }}
            className="mt-4"
          >
            We have your <span className="italic text-accent">request.</span>
          </EditorialHeading>
          <p className="mt-4 max-w-xl font-ui text-sm leading-relaxed text-taupe">
            Our care team will review your return and be in touch. You can follow
            its progress here and on your order at any time.
          </p>
        </div>

        <ReturnSummaryCard record={submitted} order={order} className="mt-9" />

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <AtelierButton
            as={Link}
            to={`/account/orders/${order.id}`}
            variant="primary"
            size="md"
          >
            Back to Order
          </AtelierButton>
          <AtelierButton as={Link} to="/shop" variant="outline" size="md">
            Continue Shopping
          </AtelierButton>
        </div>
      </OrderPageShell>
    );
  }

  /* -------------------------- Blocked states -------------------------- */

  const existing = latestReturn(order);

  // Mirrors exactly what the backend accepts: delivered, un-returned
  // lines remaining, and inside the recorded return window.
  if (!canRequestReturnNow(order)) {
    return (
      <OrderPageShell breadcrumbItems={breadcrumbs}>
        {existing ? (
          <>
            <EditorialHeading
              as="h2"
              size="subsection"
              eyebrow="Return Status"
              spacing={{ eyebrow: "mb-3", title: "mb-0" }}
            >
              Your return is <span className="italic text-accent">in motion.</span>
            </EditorialHeading>
            <p className="mt-4 max-w-xl font-ui text-sm leading-relaxed text-taupe">
              {returnBlockedReason(order)}
            </p>
            <ReturnSummaryCard record={existing} order={order} className="mt-8" />
            <div className="mt-8">
              <AtelierButton
                as={Link}
                to={`/account/orders/${order.id}`}
                variant="primary"
                size="md"
              >
                Back to Order
              </AtelierButton>
            </div>
          </>
        ) : (
          <div className="border border-mist/80 bg-surface/30 px-6">
            <EmptyState
              eyebrow="Return Unavailable"
              title="This order can't be returned"
              description={returnBlockedReason(order)}
              actions={
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <AtelierButton
                    as={Link}
                    to={`/account/orders/${order.id}`}
                    variant="primary"
                    size="md"
                  >
                    Back to Order
                  </AtelierButton>
                  <AtelierButton
                    as={Link}
                    to="/account/orders"
                    variant="outline"
                    size="md"
                  >
                    View My Orders
                  </AtelierButton>
                </div>
              }
            />
          </div>
        )}
      </OrderPageShell>
    );
  }

  /* ------------------------------- Form ------------------------------- */

  /* Per-line returnable quantity comes from the backend record
     (`quantity - returnedQuantity`), so a partially-returned line can only
     be returned for what actually remains. */
  const items = (order.items ?? []).map((item) => ({
    ...item,
    alreadyRequested: (item.returnableQuantity ?? 0) === 0,
  }));

  const selectedLines = items.filter((item) => selected.has(item.lineId));

  /* Indicative only: the refund a return is actually worth is computed and
     stored by the backend from the recorded unit prices. */
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
    setErrors((current) => ({ ...current, items: "" }));
  };

  const setQuantity = (item, quantity) => {
    setSelected((current) => {
      const next = new Map(current);
      const clamped = Math.max(1, Math.min(item.returnableQuantity, Number(quantity) || 1));
      next.set(item.lineId, clamped);
      return next;
    });
  };

  /**
   * Submit to the backend. The server re-checks ownership, order status,
   * the return window and per-line quantities, and its response is what
   * gets displayed — nothing is confirmed locally.
   */
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = {};
    if (selected.size === 0) nextErrors.items = "Choose at least one piece to return.";
    if (!reason) nextErrors.reason = "Let us know why you are returning these pieces.";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    const result = await createReturn({
      orderId: order.id,
      items: [...selected.entries()].map(([lineId, quantity]) => ({
        lineId,
        quantity,
        reason,
      })),
      pickupMethod,
      note,
    });
    setSubmitting(false);

    if (!result.ok) {
      // Backend rejections are surfaced verbatim (422 carries the real
      // business reason, e.g. an expired window) rather than being
      // reduced to a generic failure.
      setErrors({ form: result.message ?? "Your return request could not be submitted." });
      return;
    }

    setSubmitted(result.record);
    // Refresh so the order (and its returns) reflect the server record.
    reload();
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <OrderPageShell breadcrumbItems={breadcrumbs}>
      <EditorialHeading
        as="h2"
        size="subsection"
        eyebrow={`Order ${orderRef}`}
        description={
          order.tracking?.deliveredAt
            ? `Delivered ${formatOrderDate(order.tracking.deliveredAt)} · Tell us what isn't right and we'll take care of it.`
            : "Tell us what isn't right and we'll take care of it."
        }
        spacing={{ eyebrow: "mb-3", title: "mb-3", description: "mb-0" }}
      >
        Request a <span className="italic text-accent">return.</span>
      </EditorialHeading>

      <Rule width="w-14" tone="accent" className="my-7" />

      {/* Policy */}
      <p className="flex items-start gap-2.5 border border-mist/80 bg-surface/40 px-5 py-4 font-ui text-[11px] leading-relaxed text-graphite">
        <Info size={14} className="mt-px shrink-0 text-accent" aria-hidden="true" />
        <span>
          {RETURN_POLICY_SUMMARY}{" "}
          {windowState.known ? (
            <span className="text-taupe">
              This order&apos;s {RETURN_WINDOW_DAYS}-day window closes on{" "}
              {formatOrderDate(windowState.closesAt)}.
            </span>
          ) : null}
        </span>
      </p>

      {errorCount > 0 ? (
        <p
          role="alert"
          className="mt-6 border border-accent/40 bg-accent/5 px-5 py-4 font-ui text-[11px] leading-relaxed text-accent"
        >
          {errors.form ??
            "Please complete your return request before submitting it."}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-9">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
          <div className="space-y-10">
            {/* ------------------------- Items ------------------------- */}
            <fieldset>
              <legend className="font-display text-xl font-light tracking-tight text-ink">
                Which pieces are you returning?
              </legend>
              {errors.items ? (
                <p className="mt-2 font-ui text-[11px] text-accent">{errors.items}</p>
              ) : null}

              <ul className="mt-5 space-y-3">
                {items.map((item) => {
                  const disabled = item.alreadyRequested;
                  const checked = selected.has(item.lineId);
                  const inputId = `return-item-${item.lineId}`;

                  return (
                    <li key={item.lineId}>
                      <label
                        htmlFor={inputId}
                        className={cn(
                          "flex cursor-pointer items-center gap-4 border p-4 focus-within:outline focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-accent",
                          transition.all,
                          disabled
                            ? "cursor-not-allowed border-mist/70 bg-surface/20 opacity-60"
                            : checked
                              ? "border-accent bg-accent/5"
                              : "border-mist bg-canvas hover:border-accent/60"
                        )}
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleItem(item)}
                          className="h-4 w-4 shrink-0 accent-[#8a3e22]"
                        />
                        {item.image ? (
                          <img
                            src={item.image}
                            alt=""
                            className="h-20 w-[3.75rem] shrink-0 bg-surface object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span aria-hidden="true" className="h-20 w-[3.75rem] shrink-0 bg-surface" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-base font-light text-ink">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                            {[item.color, item.size].filter(Boolean).join(" · ") ||
                              "Free Size"}{" "}
                            · Qty {item.quantity}
                          </span>
                          {disabled ? (
                            <span className="mt-1 block font-ui text-[10px] uppercase tracking-[.14em] text-accent">
                              Already returned
                            </span>
                          ) : item.returnableQuantity < item.quantity ? (
                            <span className="mt-1 block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                              {item.returnableQuantity} of {item.quantity} still returnable
                            </span>
                          ) : null}

                          {/* Partial returns: only what the backend says
                              remains returnable can be selected. */}
                          {checked && item.returnableQuantity > 1 ? (
                            <span className="mt-2 flex items-center gap-2">
                              <label
                                htmlFor={`${inputId}-qty`}
                                className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe"
                              >
                                Quantity
                              </label>
                              <select
                                id={`${inputId}-qty`}
                                value={selected.get(item.lineId) ?? item.returnableQuantity}
                                onClick={(event) => event.preventDefault()}
                                onChange={(event) => setQuantity(item, event.target.value)}
                                className="border border-mist bg-canvas px-2 py-1 font-ui text-xs text-ink focus:border-accent focus:outline-none"
                              >
                                {Array.from({ length: item.returnableQuantity }).map((_, i) => (
                                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                                ))}
                              </select>
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 font-ui text-sm text-ink">
                          {formatINR(item.unitPrice * item.quantity)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            {/* ------------------------- Reason ------------------------- */}
            <fieldset>
              <legend className="font-display text-xl font-light tracking-tight text-ink">
                Why are you returning them?
              </legend>
              {errors.reason ? (
                <p className="mt-2 font-ui text-[11px] text-accent">{errors.reason}</p>
              ) : null}

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {RETURN_REASONS.map((entry) => {
                  const inputId = `return-reason-${entry.id}`;
                  const checked = reason === entry.id;
                  return (
                    <label
                      key={entry.id}
                      htmlFor={inputId}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 border px-4 py-3.5 font-ui text-xs focus-within:outline focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-accent",
                        transition.all,
                        checked
                          ? "border-accent bg-accent/5 text-ink"
                          : "border-mist bg-canvas text-graphite hover:border-accent/60"
                      )}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name="return-reason"
                        value={entry.id}
                        checked={checked}
                        onChange={() => {
                          setReason(entry.id);
                          setErrors((current) => ({ ...current, reason: "" }));
                        }}
                        className="h-3.5 w-3.5 shrink-0 accent-[#8a3e22]"
                      />
                      {entry.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* --------------------- Pickup method --------------------- */}
            {/* The backend stores exactly two pickup methods and has no
                exchange capability at all, so no exchange option is
                offered here — a return always results in a refund. */}
            <fieldset>
              <legend className="font-display text-xl font-light tracking-tight text-ink">
                How should we collect them?
              </legend>

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {RETURN_PICKUP_METHODS.map((entry) => {
                  const inputId = `return-pickup-${entry.id}`;
                  const checked = pickupMethod === entry.id;
                  return (
                    <label
                      key={entry.id}
                      htmlFor={inputId}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 border p-4 focus-within:outline focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-accent",
                        transition.all,
                        checked
                          ? "border-accent bg-accent/5"
                          : "border-mist bg-canvas hover:border-accent/60"
                      )}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name="return-pickup"
                        value={entry.id}
                        checked={checked}
                        onChange={() => setPickupMethod(entry.id)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#8a3e22]"
                      />
                      <span>
                        <span className="block font-ui text-xs font-medium uppercase tracking-[.14em] text-ink">
                          {entry.label}
                        </span>
                        <span className="mt-1 block font-ui text-[11px] leading-relaxed text-taupe">
                          {entry.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* -------------------------- Note -------------------------- */}
            <div>
              <label
                htmlFor="return-note"
                className="font-display text-xl font-light tracking-tight text-ink"
              >
                Anything you'd like to add?
              </label>
              <p className="mt-2 font-ui text-[11px] text-taupe">
                Optional — a short note helps our care team understand.
              </p>
              <textarea
                id="return-note"
                rows={4}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Tell us a little more"
                className="mt-4 w-full resize-y border border-mist bg-canvas px-4 py-3 font-ui text-xs text-ink placeholder:text-taupe focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* --------------------------- Aside --------------------------- */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="border border-mist/80 bg-surface/30 p-6 md:p-7">
              <h3 className="font-display text-xl font-light tracking-tight text-ink">
                Your request
              </h3>
              <Rule width="w-10" tone="accent" className="mt-3 mb-5" />

              <dl className="space-y-3.5">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-ui text-[11px] text-graphite">
                    Pieces selected
                  </dt>
                  <dd className="font-ui text-xs text-ink">{selectedLines.length}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-ui text-[11px] text-graphite">Resolution</dt>
                  <dd className="font-ui text-xs text-ink">{RETURN_RESOLUTION.label}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-mist/70 pt-3.5">
                  <dt className="font-ui text-[11px] text-graphite">
                    Indicative refund
                  </dt>
                  <dd className="font-display text-lg font-light text-ink">
                    {formatINR(indicativeRefund)}
                  </dd>
                </div>
              </dl>

              {/* The refund the atelier records after inspection is
                  authoritative — this figure is indicative only, and no
                  refund status is claimed before one exists. */}
              <p className="mt-4 font-ui text-[11px] leading-relaxed text-taupe">
                {refundMethodLabel(order)}. The final refund is confirmed by the
                atelier once your return is received and inspected.
              </p>

              <AtelierButton
                type="submit"
                variant="primary"
                size="md"
                disabled={submitting}
                className="mt-7 w-full justify-center"
              >
                {submitting ? "Submitting…" : "Submit Return Request"}
              </AtelierButton>

              <Link
                to={`/account/orders/${order.id}`}
                className={cn(
                  "mt-5 block text-center font-ui text-[10px] uppercase tracking-[.16em] text-brass hover:text-accent",
                  transition.colors
                )}
              >
                Cancel and go back
              </Link>
            </div>
          </aside>
        </div>
      </form>
    </OrderPageShell>
  );
}
