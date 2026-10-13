/**
 * PRATIKSHYA FASHION — Atelier design system · section label.
 *
 * The campaign's micro label: an optional numeral, a short hairline rule and
 * the label itself, in tracked uppercase sans.
 *
 *   <SectionLabel index="02">The Bridal Edit</SectionLabel>
 *
 * Ported from Project B with its global `.label` stylesheet replaced by
 * Tailwind utilities and `render`-safe elements (the rule B drew with a
 * `::after` pseudo-element is an explicit, aria-hidden span here). No global
 * class name is introduced, so the label cannot affect a portal surface.
 */

import { cn } from "../../utils/cn";
import { typography } from "../typography";

export default function SectionLabel({ index, children, light = false, className = "" }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-3",
        typography.campaign.label,
        light ? "text-neutral-soft" : "text-cocoa-muted",
        className
      )}
    >
      {index ? (
        <>
          <span className={cn("tabular-nums", light ? "text-blush-warm" : "text-burgundy")}>
            {index}
          </span>
          <span aria-hidden="true" className="inline-block h-px w-7 bg-current opacity-50" />
        </>
      ) : null}
      <span>{children}</span>
    </p>
  );
}
