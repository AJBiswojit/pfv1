/**
 * PRATIKSHYA FASHION — Atelier design system · body scroll lock.
 *
 * Locks page scrolling while `locked` is true and restores the previous
 * values on unlock **and** on unmount, so a panel that is closed mid-
 * transition can never leave the page frozen.
 *
 *   useLockBody(menuOpen);
 *
 * The scrollbar width is compensated with padding so locking does not shift
 * the page horizontally. Only `document.body` is touched, and only for the
 * values this hook changed itself — existing inline styles are preserved.
 */

import { useEffect } from "react";

export function useLockBody(locked) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return undefined;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [locked]);
}

export default useLockBody;
