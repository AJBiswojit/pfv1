import { cn } from "../../utils/cn";

/**
 * The standard Employee page frame — now the same staff design system as
 * AdminPage (Phase 2 convergence): ivory canvas, burgundy-brown text,
 * 44px Cormorant titles at weight 500, accessible gold-brown eyebrows.
 */
export default function EmployeePage({
  eyebrow,
  title,
  description,
  actions = null,
  children,
  className = "",
}) {
  return (
    <div className={cn("pb-16", className)}>
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          {eyebrow ? (
            <p className="font-ui text-[11px] font-semibold uppercase tracking-[.28em] text-pf-gold-text">{eyebrow}</p>
          ) : null}
          <h1 className="mt-2 font-display text-[32px] font-medium leading-[1.05] tracking-tight text-pf-text md:text-[44px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 font-ui text-sm leading-relaxed text-pf-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
