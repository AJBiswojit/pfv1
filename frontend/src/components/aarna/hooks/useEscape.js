import { useEffect } from 'react';
export default function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return undefined;
    const on = (e) => { if (e.key === 'Escape') onEscape(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [active, onEscape]);
}
