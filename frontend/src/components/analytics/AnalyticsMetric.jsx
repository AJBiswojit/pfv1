import { cn } from "../../utils/cn";

/**
 * Analytics metric tile — Phase 3 refinement.
 *
 * Keeps the original honesty contract: a comparison is shown only when a
 * comparable previous period exists; otherwise that is stated plainly.
 * Shares the KPI surface language with AdminMetricCard (12px label, 38px
 * lining serif value, hairline footer) without importing the Admin page.
 */
export default function AnalyticsMetric({
  label,
  value,
  hint,
  change,
  direction = "flat",
  comparable = false,
  tone = "default",
}) {
  const alert = tone === "alert";
  return (
    <article
      className={cn(
        "flex h-full min-h-[152px] flex-col rounded-[var(--radius-pf-panel)] border p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.65),0_10px_30px_rgb(74_7_24/0.05)] sm:p-6",
        alert ? "border-pf-error/30 bg-pf-error/[0.035]" : "border-pf-border bg-pf-card"
      )}
    >
      <p className="font-ui text-[12px] font-semibold uppercase leading-snug tracking-[.16em] text-pf-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-3.5 font-display text-[34px] leading-none tracking-[-0.015em] tabular-nums md:text-[38px]",
          alert ? "text-pf-error" : "text-pf-text"
        )}
      >
        {value}
      </p>
      <div className="mt-auto pt-4">
        {comparable && change ? (
          <p
            className={cn(
              "font-ui text-[12.5px] font-semibold leading-snug tabular-nums",
              direction === "up"
                ? "text-pf-success"
                : direction === "down"
                  ? "text-pf-error"
                  : "text-pf-muted"
            )}
          >
            <span aria-hidden="true">{direction === "up" ? "↑ " : direction === "down" ? "↓ " : ""}</span>
            <span>{change}</span>
          </p>
        ) : hint ? (
          <p className="font-ui text-[12px] leading-relaxed text-pf-muted">{hint}</p>
        ) : (
          /* Static counts (stock levels, catalogue totals) have no previous
             period to compare — say nothing rather than print a line that
             reads like a missing figure. */
          <span aria-hidden="true" className="block h-px w-8 bg-pf-gold/70" />
        )}
      </div>
    </article>
  );
}
