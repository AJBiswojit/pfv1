/**
 * PRATIKSHYA FASHION — Atelier design system · focus trap.
 *
 * While `active` is true, TAB and SHIFT+TAB cycle inside the referenced
 * element and focus returns to whatever was focused before the trap opened.
 *
 *   const panel = useRef(null);
 *   useFocusTrap(panel, menuOpen);
 *
 * An element marked `data-autofocus` receives focus first when present.
 * Only elements that are actually rendered are considered, so a hidden
 * sibling can never swallow a tab stop.
 */

import { useEffect } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;
    const node = ref?.current;
    if (!node) return undefined;

    const previouslyFocused = document.activeElement;
    // Let the opening frame paint before moving focus.
    const timer = setTimeout(() => {
      const target = node.querySelector("[data-autofocus]") ?? node.querySelector(FOCUSABLE);
      target?.focus?.();
    }, 30);

    const onKeyDown = (event) => {
      if (event.key !== "Tab") return;
      const stops = [...node.querySelectorAll(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement
      );
      if (stops.length === 0) return;
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      node.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [ref, active]);
}

export default useFocusTrap;
