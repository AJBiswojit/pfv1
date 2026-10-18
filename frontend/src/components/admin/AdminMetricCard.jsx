import { cn } from "../../utils/cn";

/**
 * A business metric tile (Phase 2 staff scale): 42px lining-figure
 * serif value at weight 500, 11px semibold label, champagne icon plate.
 *
 * `tone="alert"` is reserved for figures that need an operator's
 * attention (out of stock, suspended accounts).
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
        "rounded-xl border p-5 shadow-[0_10px_40px_rgb(74_7_24/0.07)] sm:p-6",
        alert ? "border-pf-error/35 bg-pf-error/[0.04]" : "border-pf-border bg-pf-card",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-ui text-[11px] font-semibold uppercase tracking-[.18em] text-pf-muted">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              alert
                ? "bg-pf-error/10 text-pf-error"
                : "bg-pf-gold/15 text-pf-gold-text"
            )}
            aria-hidden="true"
          >
            <Icon size={18} strokeWidth={1.5} />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-3 font-display text-[36px] font-medium leading-none tracking-tight tabular-nums md:text-[42px]",
          alert ? "text-pf-error" : "text-pf-text"
        )}
      >
        {value}
      </p>
      <span aria-hidden="true" className="my-3 block h-[2px] w-10 rounded-full bg-pf-gold" />
      {hint ? <p className="font-ui text-[12px] leading-relaxed text-pf-muted">{hint}</p> : null}
    </article>
  );
}
