/**
 * PRATIKSHYA FASHION — Atelier design system · media query hook.
 *
 * Subscribes a component to a CSS media query. Used by the editorial hero
 * for the `prefers-reduced-motion` decision, and available to the storefront
 * surfaces that must change *behaviour* (not just layout) at a breakpoint.
 *
 *   const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
 *
 * Layout-only differences belong in CSS; this hook is for JavaScript that
 * must not run at all on one side of the query.
 *
 * Server rendering returns `false` — no query matches without a window — so
 * a component never assumes a viewport it cannot see.
 */

import { useEffect, useState } from "react";

/** Read a media query once, safely, outside a browser. */
export function matchesMediaQuery(query) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return Boolean(window.matchMedia(query).matches);
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => matchesMediaQuery(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    // `addEventListener` is the modern API; Safari < 14 exposes only the
    // deprecated `addListener`. Support both so the hook never throws.
    if (typeof list.addEventListener === "function") {
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    }
    list.addListener(onChange);
    return () => list.removeListener(onChange);
  }, [query]);

  return matches;
}

export default useMediaQuery;
