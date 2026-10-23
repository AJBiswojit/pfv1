import { cn } from "../../utils/cn";

/**
 * A business metric tile — the shared KPI surface for every staff desk.
 *
 * Phase 3 hierarchy:
 *   12px label (the quietest layer, but still ≥ 4.5:1)
 *   40–44px serif value in lining figures (the loudest layer)
 *   an optional gold-brown supporting figure
 *   a hairline footer reserved for a sparkline / composition bar
 *
 * Cards are equal-height within a grid row by construction (`h-full`, flex
 * column), while their height stays content-driven. The label and icon share
 * one header row so neither can encroach on the value or supporting copy.
 * No arbitrary decorative geometry: the only ornament is the fine champagne
 * icon plate and the 1px rule.
 */
export default function AdminMetricCard({
  label,
  value,
  hint,
  sub,
  icon: Icon,
  tone = "default",
  className = "",
  children,
}) {
  const alert = tone === "alert";

  return (
    <article
      className={cn(
        "flex h-full min-w-0 flex-col rounded-[var(--radius-pf-panel)] border p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.65),0_10px_30px_rgb(74_7_24/0.055)] transition-colors",
        alert
          ? "border-pf-error/30 bg-pf-error/[0.035]"
          : "border-pf-border bg-pf-card hover:border-pf-gold-line",
        className
      )}
    >
      <div className="flex min-h-9 items-center justify-between gap-3">
        <p className="min-w-0 flex-1 break-words font-ui text-[12px] font-semibold uppercase leading-[1.45] tracking-[.12em] text-pf-muted">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-pf-control)] border",
              alert
                ? "border-pf-error/25 bg-pf-error/10 text-pf-error"
                : "border-pf-gold/25 bg-pf-gold/[0.12] text-pf-gold-text"
            )}
            aria-hidden="true"
          >
            <Icon size={17} strokeWidth={1.5} />
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-4 font-display text-[38px] leading-none tracking-[-0.015em] tabular-nums md:text-[42px]",
          alert ? "text-pf-error" : "text-pf-text"
        )}
      >
        {value}
      </p>

      {sub ? (
        <p className="mt-2.5 font-ui text-[12.5px] font-medium leading-snug tabular-nums text-pf-gold-text">
          {sub}
        </p>
      ) : null}

      {children || hint ? (
        <div className="mt-auto pt-4">
          {children}
          {hint ? (
            <p
              className={cn(
                "font-ui text-[12px] leading-relaxed text-pf-muted",
                children ? "mt-2" : ""
              )}
            >
              {hint}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
