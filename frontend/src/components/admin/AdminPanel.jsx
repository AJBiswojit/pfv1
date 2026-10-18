import { cn } from "../../utils/cn";

/**
 * A titled operational panel — the single container used across the
 * staff portals so every section carries the same warm-ivory card
 * surface, softened radius, warm shadow and heading scale, per the
 * approved reference composition.
 */
export default function AdminPanel({
  title,
  eyebrow,
  action = null,
  children,
  className = "",
  bodyClassName = "",
}) {
  return (
    <section
      className={cn(
        "min-w-0 max-w-full rounded-xl border border-pf-border bg-pf-card shadow-[0_10px_40px_rgb(74_7_24/0.07)]",
        className
      )}
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-pf-border px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="font-ui text-[11px] font-semibold uppercase tracking-[.24em] text-pf-gold-text">{eyebrow}</p>
          ) : null}
          {title ? (
            <h2 className="mt-1 font-display text-[24px] font-medium leading-[1.12] tracking-tight text-pf-text md:text-[28px]">{title}</h2>
          ) : null}
          <span aria-hidden="true" className="mt-2.5 block h-[2px] w-10 rounded-full bg-pf-gold" />
        </div>
        {action}
      </header>
      <div className={cn("min-w-0 px-5 py-5 sm:px-6 sm:py-6", bodyClassName)}>{children}</div>
    </section>
  );
}
