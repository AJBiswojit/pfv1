/**
 * PRATIKSHYA FASHION — Atelier design system · scroll position hook.
 *
 * `true` once the document has scrolled past `threshold` pixels. The scroll
 * listener is passive and read-only: this hook never writes to the document,
 * so it cannot affect a portal it is not part of.
 *
 *   const scrolled = useScrolled(8);
 *
 * Phase 2 uses this for the campaign header; it is ported here so the
 * storefront header does not grow its own copy.
 */

import { useEffect, useState } from "react";

export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return scrolled;
}

export default useScrolled;
