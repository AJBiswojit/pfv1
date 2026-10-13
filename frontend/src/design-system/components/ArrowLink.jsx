/**
 * PRATIKSHYA FASHION — Atelier design system · editorial arrow link.
 *
 * The campaign's secondary action: uppercase tracked lettering, a hairline
 * underline that draws out from the left, and a hand-drawn arrow that slides
 * on hover. Ported from Project B with the visual behaviour kept and the
 * global `.arrow-link` stylesheet replaced by Tailwind utilities, so nothing
 * leaks outside the element.
 *
 * Uses the application's router — it never introduces a second navigation
 * layer. The destination is always passed in; this component authors no
 * destination of its own.
 */

import { Link } from "react-router-dom";

import { cn } from "../../utils/cn";
import { typography } from "../typography";

/** Hand-drawn arrow, 22 × 10, inheriting the link's colour. */
export function Arrow({ className = "" }) {
  return (
    <svg
      className={cn("transition-transform duration-[450ms] ease-editorial group-hover:translate-x-1.5 group-focus-visible:translate-x-1.5", className)}
      width="22"
      height="10"
      viewBox="0 0 22 10"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 5h20M16 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default function ArrowLink({
  to,
  href,
  children,
  className = "",
  light = false,
  onClick,
  ...rest
}) {
  const classes = cn(
    "group inline-flex items-center gap-3 py-2",
    typography.campaign.action,
    light ? "text-blush-canvas" : "text-espresso",
    "transition-colors",
    className
  );
  const underline = (
    <span className="relative">
      {children}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-1 h-px origin-left scale-x-[0.35] bg-current opacity-60 transition-transform duration-500 ease-editorial group-hover:scale-x-100 group-focus-visible:scale-x-100"
      />
    </span>
  );

  if (href && !to) {
    return (
      <a href={href} onClick={onClick} className={classes} {...rest}>
        {underline}
        <Arrow />
      </a>
    );
  }

  return (
    <Link to={to} onClick={onClick} className={classes} {...rest}>
      {underline}
      <Arrow />
    </Link>
  );
}
