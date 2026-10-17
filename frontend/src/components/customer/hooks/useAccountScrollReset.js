import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Each account destination/tab starts at the top, without moving keyboard focus.
 * The outer layout also resets guest surfaces and owns the temporary history
 * policy. Leaving the account restores the browser's previous policy; mobile
 * document scrolling continues to use the storefront's ScrollToTop. */
export default function useAccountScrollReset({ enabled = true, manageRestoration = false } = {}) {
  const ref = useRef(null);
  const { pathname, search } = useLocation();
  const tab = new URLSearchParams(search).get('tab');

  useLayoutEffect(() => {
    if (!enabled || !ref.current) return;
    ref.current.scrollTop = 0;
    ref.current.scrollLeft = 0;
  }, [enabled, pathname, tab]);

  useEffect(() => {
    if (!enabled || !manageRestoration || !window.history || !('scrollRestoration' in window.history)) return undefined;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, [enabled, manageRestoration]);

  return ref;
}
