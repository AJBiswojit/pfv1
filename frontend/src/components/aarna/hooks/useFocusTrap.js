import { useEffect } from 'react';
const SEL = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
/** Traps Tab focus inside `ref` while active and restores focus on close. */
export default function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active || !ref.current) return undefined;
    const prev = document.activeElement;
    const node = ref.current;
    const first = node.querySelector('[data-autofocus]') || node.querySelector(SEL);
    setTimeout(() => first?.focus(), 30);
    const on = (e) => {
      if (e.key !== 'Tab') return;
      const els = [...node.querySelectorAll(SEL)].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const a = els[0]; const z = els[els.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    node.addEventListener('keydown', on);
    return () => { node.removeEventListener('keydown', on); prev?.focus?.(); };
  }, [ref, active]);
}
