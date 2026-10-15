import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickViewId, setQuickViewId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((message, action = null) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-2), { id, message, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const value = useMemo(
    () => ({
      cartOpen, openCart: () => setCartOpen(true), closeCart: () => setCartOpen(false),
      searchOpen, openSearch: () => setSearchOpen(true), closeSearch: () => setSearchOpen(false),
      menuOpen, openMenu: () => setMenuOpen(true), closeMenu: () => setMenuOpen(false),
      quickViewId, openQuickView: setQuickViewId, closeQuickView: () => setQuickViewId(null),
      toasts, toast, dismissToast,
    }),
    [cartOpen, searchOpen, menuOpen, quickViewId, toasts, toast, dismissToast],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export const useUI = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
};
