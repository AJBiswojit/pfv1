import { cn } from "../../utils/cn";

/**
 * A titled operational panel — the single container used across the
 * staff portals so every section carries the same warm-ivory card
 * surface, softened radius, warm shadow and heading scale, per the
 * approved reference composition.
 *
 * Phase 3 refinement:
 *   - one panel header system (eyebrow → 26px serif title → 28px gold rule)
 *   - the header action sits on the same optical baseline as the title
 *   - the panel is a flex column, so `bodyClassName="flex-1"` lets short
 *     panels share a row height without stretching their content oddly
 *   - `tone="inset"` is the quieter, recessed plate used inside panels
 */
export default function AdminPanel({
  title,
  eyebrow,
  action = null,
  children,
  className = "",
  bodyClassName = "",
  tone = "card",
  headerClassName = "",
}) {
  const inset = tone === "inset";

  return (
    <section
      className={cn(
        "flex min-w-0 max-w-full flex-col rounded-[var(--radius-pf-panel)] border",
        inset
          ? "border-pf-border/80 bg-pf-card-soft shadow-none"
          : "border-pf-border bg-pf-card shadow-[inset_0_1px_0_rgb(255_255_255/0.65),0_10px_30px_rgb(74_7_24/0.055)]",
        className
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 border-b border-pf-border/80 px-5 py-4 sm:px-6 sm:py-[18px]",
          headerClassName
        )}
      >
        <div className="min-w-0">
          {eyebrow ? (
            <p className="font-ui text-[10.5px] font-semibold uppercase tracking-[.24em] text-pf-gold-text">
              {eyebrow}
            </p>
          ) : null}
          {title ? (
            <h2 className="mt-1.5 font-display text-[23px] leading-[1.1] tracking-[-0.01em] text-pf-text md:text-[26px]">
              {title}
            </h2>
          ) : null}
          <span aria-hidden="true" className="mt-2.5 block h-px w-8 bg-pf-gold" />
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2 pt-0.5">{action}</div> : null}
      </header>
      <div className={cn("min-w-0 px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}
