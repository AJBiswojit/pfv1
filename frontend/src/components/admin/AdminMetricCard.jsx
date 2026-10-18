import { Rule } from "../../design-system";
import { cn } from "../../utils/cn";

/**
 * A business metric tile.
 *
 * `tone="alert"` is reserved for figures that need an operator's attention
 * (out of stock, suspended accounts) — the muted terracotta, never a red
 * borrowed from another design system.
 *
 * Updated to use the approved warm-ivory card surface with champagne-gold
 * icon plates and fine beige borders.
 */
export default function AdminMetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className = "",
}) {
  const alert = tone === "alert";

  return (
    <article
      className={cn(
        "border p-5",
        alert ? "border-pf-error/30 bg-pf-error/[0.04]" : "border-pf-border bg-pf-card",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-ui text-[10px] uppercase tracking-[.18em] text-pf-muted">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full",
              alert
                ? "bg-pf-error/10 text-pf-error"
                : "bg-pf-gold/10 text-pf-gold-deep"
            )}
            aria-hidden="true"
          >
            <Icon size={16} strokeWidth={1.5} />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-3 font-display text-3xl font-light tracking-tight",
          alert ? "text-pf-error" : "text-pf-text"
        )}
      >
        {value}
      </p>
      <Rule width="w-8" tone="champagne" className="my-3" />
      {hint ? <p className="font-ui text-[11px] text-pf-muted">{hint}</p> : null}
    </article>
  );
}
