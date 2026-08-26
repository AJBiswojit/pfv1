import { Link } from "react-router-dom";
import { Rule, transition } from "../../design-system";
import { RETURN_RESOLUTION, getReturnPickupMethod, getReturnReason } from "../../config/orderConfig";
import { getReturnTimeline } from "../../services/orders/returnService";
import { formatOrderDate } from "../../utils/orders";
import { formatINR } from "../../utils/shopping";
import { cn } from "../../utils/cn";
import OrderStatusBadge from "./OrderStatusBadge";
import OrderTimeline from "./OrderTimeline";

/**
 * A return request, with its own timeline and refund state.
 *
 * PHASE 3: every value shown here is the backend's own return record —
 * return number, status, per-line quantities, the refund amount the
 * atelier computed and the refund status it recorded. Nothing is
 * synthesised, and no refund is claimed before one exists. The old
 * "exchange will be arranged" copy is gone: the backend has no exchange
 * capability, so a return always resolves as a refund.
 */
export default function ReturnSummaryCard({
  record,
  order,
  showTimeline = true,
  className = "",
}) {
  if (!record) return null;

  const timeline = getReturnTimeline(record);
  const reason = record.items?.[0]?.reason ?? record.reason ?? null;
  const reasonLabel = record.reasonLabel ?? getReturnReason(reason)?.label ?? reason ?? "—";
  const pickup = getReturnPickupMethod(record.pickupMethod);
  const refundAmount = record.refundAmount ?? 0;
  const refundStatus = record.refundStatus ?? null;
  const refundRecorded = refundAmount > 0;
  const reference = record.returnNumber ?? record.id;

  return (
    <section
      aria-labelledby={`return-${record.id}-heading`}
      className={cn("border border-mist/80 bg-surface/30 p-6 md:p-8", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-ui text-[10px] uppercase tracking-[.2em] text-accent">
            Return Request
          </p>
          <h3
            id={`return-${record.id}-heading`}
            className="mt-2 font-display text-xl font-light tracking-tight text-ink"
          >
            {reference}
          </h3>
          <p className="mt-1 font-ui text-[11px] text-taupe">
            Requested {formatOrderDate(record.createdAt)}
          </p>
        </div>
        <OrderStatusBadge status={record.status} kind="return" />
      </div>

      <Rule width="w-10" tone="accent" className="my-6" />

      <dl className="grid gap-5 sm:grid-cols-2">
        <div>
          <dt className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
            Reason
          </dt>
          <dd className="mt-1.5 font-ui text-sm text-ink">{reasonLabel}</dd>
        </div>
        <div>
          <dt className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
            Collection
          </dt>
          <dd className="mt-1.5 font-ui text-sm text-ink">
            {pickup?.label ?? record.pickupMethod ?? "—"}
          </dd>
        </div>
        {record.note ? (
          <div className="sm:col-span-2">
            <dt className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
              Your Note
            </dt>
            <dd className="mt-1.5 font-ui text-sm leading-relaxed text-graphite">
              {record.note}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* Items */}
      <ul className="mt-6 border-t border-mist/70">
        {record.items.map((item) => (
          <li
            key={item.id ?? `${record.id}-${item.orderItemId}`}
            className="flex items-center gap-4 border-b border-mist/70 py-3.5"
          >
            {item.image ? (
              <img
                src={item.image}
                alt=""
                className="h-14 w-11 shrink-0 bg-surface object-cover"
                loading="lazy"
              />
            ) : (
              <span aria-hidden="true" className="h-14 w-11 shrink-0 bg-surface" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-light text-ink">
                {item.name}
              </p>
              <p className="mt-0.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                {[item.color, item.size].filter(Boolean).join(" · ") || "Free Size"} ·
                Qty {item.quantity}
              </p>
            </div>
            <p className="shrink-0 font-ui text-xs text-ink">
              {formatINR(item.refundAmount ?? 0)}
            </p>
          </li>
        ))}
      </ul>

      {/* Refund — the atelier's own recorded figure and state. */}
      {refundRecorded ? (
        <div className="mt-6 border border-accent/25 bg-accent/5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-ui text-[10px] uppercase tracking-[.2em] text-accent">
              {RETURN_RESOLUTION.label}
            </p>
            <p className="font-display text-xl font-light text-ink">
              {formatINR(refundAmount)}
            </p>
          </div>
          {record.refundMethod ? (
            <p className="mt-2 font-ui text-xs text-graphite">{record.refundMethod}</p>
          ) : null}
          <p className="mt-1 font-ui text-[11px] uppercase tracking-[.14em] text-taupe">
            {(refundStatus ?? "NOT_REQUESTED").replace(/_/g, " ").toLowerCase()}
          </p>
        </div>
      ) : (
        <p className="mt-6 font-ui text-xs leading-relaxed text-graphite">
          {RETURN_RESOLUTION.description}
        </p>
      )}

      {/* Timeline */}
      {showTimeline ? (
        <div className="mt-8">
          <p className="mb-5 font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
            Return Progress
          </p>
          <OrderTimeline
            events={timeline}
            showLocation={false}
            ariaLabel={`Progress of return ${record.id}`}
          />
        </div>
      ) : (
        order && (
          <Link
            to={`/account/orders/${order.id}`}
            className={cn(
              "mt-6 inline-block font-ui text-[10px] uppercase tracking-[.16em] text-brass hover:text-accent",
              transition.colors
            )}
          >
            View Order
          </Link>
        )
      )}
    </section>
  );
}
