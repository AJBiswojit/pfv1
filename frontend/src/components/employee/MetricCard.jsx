import { cn } from "../../utils/cn";

/**
 * Employee-portal metric tile — converged with AdminMetricCard onto the
 * Phase 2 staff scale (42px lining-figure serif value, ivory card,
 * champagne icon plate) so both portals read as one system.
 */
export default function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  className = "",
}) {
  return (
    <article className={cn("rounded-xl border border-pf-border bg-pf-card p-5 shadow-[0_10px_40px_rgb(74_7_24/0.07)] sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-ui text-[11px] font-semibold uppercase tracking-[.18em] text-pf-muted">{label}</p>
        {Icon ? (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pf-gold/15 text-pf-gold-text" aria-hidden="true">
            <Icon size={18} strokeWidth={1.5} />
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-display text-[36px] font-medium leading-none tracking-tight text-pf-text tabular-nums md:text-[42px]">{value}</p>
      <span aria-hidden="true" className="my-3 block h-[2px] w-10 rounded-full bg-pf-gold" />
      {hint ? <p className="font-ui text-[12px] leading-relaxed text-pf-muted">{hint}</p> : null}
    </article>
  );
}
