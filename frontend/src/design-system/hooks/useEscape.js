/**
 * PRATIKSHYA FASHION — Atelier design system · escape key hook.
 *
 * Calls `onEscape` when ESCAPE is pressed while `active` is true. The
 * listener is bound on the window and removed on unmount or when the panel
 * closes, so closed panels never react to the keyboard.
 *
 *   useEscape(menuOpen, closeMenu);
 *
 * The callback is read through a ref so a caller that passes an inline
 * function does not re-bind the listener on every render.
 */

import { useEffect, useRef } from "react";

export function useEscape(active, onEscape) {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") handler.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);
}

export default useEscape;
