import { useEffect } from 'react';
export default function useLockBody(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const prev = document.body.style.overflow;
    const sw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = sw ? `${sw}px` : '';
    return () => { document.body.style.overflow = prev; document.body.style.paddingRight = ''; };
  }, [locked]);
}
