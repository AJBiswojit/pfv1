import { Link } from "react-router-dom";
import { AtelierButton } from "../../design-system";

/**
 * A panel-scale empty state.
 *
 * The full-page EmptyState is editorial and deliberately tall; inside a
 * dashboard panel that height reads as a blank area rather than a message.
 * This variant keeps the same voice (plain statement, no "no results
 * found" cliché) at a height that fits the grid.
 */
export default function AnalyticsEmpty({
  title = "No data for this period.",
  description,
  actionTo,
  actionLabel,
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-pf-border bg-pf-card-soft/50 px-6 py-9 text-center">
      <span aria-hidden="true" className="h-px w-8 bg-pf-gold/80" />
      <p className="mt-3 max-w-xs font-display text-[20px] leading-snug text-pf-text">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-xs font-ui text-[12px] leading-relaxed text-pf-muted">{description}</p>
      ) : null}
      {actionTo ? (
        <AtelierButton as={Link} to={actionTo} size="chip" variant="outline" className="mt-4">
          {actionLabel}
        </AtelierButton>
      ) : null}
    </div>
  );
}
