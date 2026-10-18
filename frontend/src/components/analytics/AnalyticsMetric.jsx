import { cn } from "../../utils/cn";

/**
 * Analytics metric tile — Phase 2 staff scale. Keeps the original
 * honesty contract: a comparison is shown only when a comparable
 * previous period exists; otherwise that is stated plainly.
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
        "rounded-xl border p-5 shadow-[0_10px_40px_rgb(74_7_24/0.06)] sm:p-6",
        alert ? "border-pf-error/35 bg-pf-error/[0.04]" : "border-pf-border bg-pf-card"
      )}
    >
      <p className="font-ui text-[11px] font-semibold uppercase tracking-[.18em] text-pf-muted">{label}</p>
      <p
        className={cn(
          "mt-3 font-display text-[34px] font-medium leading-none tracking-tight tabular-nums md:text-[38px]",
          alert ? "text-pf-error" : "text-pf-text"
        )}
      >
        {value}
      </p>
      <span aria-hidden="true" className="my-3 block h-[2px] w-10 rounded-full bg-pf-gold" />
      {comparable && change ? (
        <p
          className={cn(
            "font-ui text-[12.5px] font-semibold tabular-nums",
            direction === "up" ? "text-pf-success" : direction === "down" ? "text-pf-error" : "text-pf-muted"
          )}
        >
          <span aria-hidden="true">{direction === "up" ? "↑ " : direction === "down" ? "↓ " : ""}</span>
          <span>{change}</span>
        </p>
      ) : hint ? (
        <p className="font-ui text-[12px] leading-relaxed text-pf-muted">{hint}</p>
      ) : (
        <p className="font-ui text-[12px] leading-relaxed text-pf-muted">No previous period to compare</p>
      )}
    </article>
  );
}
