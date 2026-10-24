import { cn } from "../../utils/cn";

/**
 * The standard Admin page frame: eyebrow, editorial headline, supporting
 * line and an optional action cluster. Every admin surface uses it so
 * headings, rhythm and action placement never drift page to page.
 *
 * Phase 3 refinement: a 40–44px Cormorant page title, an 11px gold-brown
 * eyebrow with restrained tracking, 14px supporting copy on a readable
 * measure, and actions aligned to the baseline of the heading block.
 */
export default function AdminPage({
  eyebrow,
  title,
  description,
  actions = null,
  children,
  className = "",
  /* Presentation-only, additive. The Homepage Content Control Center is the
     one desk with an approved editorial image in its masthead. Every other
     desk omits `headerMedia` and renders exactly as before. */
  headerMedia = null,
}) {
  return (
    <div className={cn("min-w-0 w-full max-w-full pb-16", className)}>
      <header className={cn(
        "mb-8 flex flex-col gap-5 border-b border-pf-border/70 pb-7 md:flex-row md:items-end md:justify-between md:gap-8",
        headerMedia && "relative pf-page-header--media overflow-hidden border-b-0"
      )}>
        {headerMedia ? (
          <div aria-hidden="true" className="pf-page-header__media">
            <img src={headerMedia} alt="" className="h-full w-full object-cover" />
            <span className="pf-page-header__media-veil" />
          </div>
        ) : null}
        <div className={cn("min-w-0 max-w-2xl", headerMedia && "relative")}>
          {eyebrow ? (
            <p className="pf-page-eyebrow flex items-center gap-2.5 font-ui text-[11px] font-semibold uppercase tracking-[.3em] text-pf-gold-text">
              <span aria-hidden="true" className="h-px w-6 bg-pf-gold/70" />
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2.5 font-display text-[32px] leading-[1.04] tracking-[-0.015em] text-pf-text sm:text-[38px] md:text-[44px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-xl font-ui text-[14px] leading-relaxed text-pf-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className={cn("pf-page-actions flex shrink-0 flex-wrap items-center gap-2.5 pb-0.5", headerMedia && "relative")}>{actions}</div>
        ) : null}
      </header>
      {children}
    </div>
  );
}
