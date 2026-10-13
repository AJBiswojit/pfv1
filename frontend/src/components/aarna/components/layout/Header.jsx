import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Link, NavLink } from '../../router/index.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, Menu, Search, ShoppingBag, User } from 'lucide-react';
import { megaMenus } from '../../data/index.js';
import { useShop } from '../../state/ShopContext.jsx';
import { useUI } from '../../state/UIContext.jsx';
import useScrolled from '../../hooks/useScrolled.js';
import Logo from '../ui/Logo.jsx';
import MegaMenu from '../navigation/MegaMenu.jsx';
import { cx } from '../../utils/format.js';

export default function Header() {
  const scrolled = useScrolled(24);
  const { totals, wishlist } = useShop();
  const { openCart, openSearch, openMenu } = useUI();
  const [active, setActive] = useState(null);
  const closeTimer = useRef(null);
  const location = useLocation();
  const navRef = useRef(null);

  useEffect(() => setActive(null), [location.pathname, location.search]);

  const openMenuKey = (key) => { clearTimeout(closeTimer.current); setActive(key); };
  const scheduleClose = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setActive(null), 160); };
  const close = useCallback(() => setActive(null), []);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const activeMenu = megaMenus.find((m) => m.key === active);
  const count = totals.count;

  return (
    <header className={cx('header', scrolled && 'is-scrolled', active && 'has-mega')} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setActive(null); }}>
      <div className="header__inner container">
        <div className="header__left">
          <button type="button" className="icon-btn header__burger" onClick={openMenu} aria-label="Open menu"><Menu size={20} strokeWidth={1.4} /></button>
          <nav className="nav" aria-label="Primary" ref={navRef}>
            {megaMenus.map((m) => (
              <div key={m.key} className="nav__item" onMouseEnter={() => openMenuKey(m.key)} onMouseLeave={scheduleClose}>
                <button
                  type="button"
                  className={cx('nav__link', active === m.key && 'is-active')}
                  aria-expanded={active === m.key}
                  aria-controls={`mega-${m.key}`}
                  onClick={() => (active === m.key ? setActive(null) : openMenuKey(m.key))}
                >
                  {m.label}
                </button>
              </div>
            ))}
            <NavLink to="/shop/bridal" className="nav__link nav__link--accent">Bridal</NavLink>
          </nav>
        </div>

        <Logo />

        <div className="header__right">
          <button type="button" className="icon-btn" onClick={openSearch} aria-label="Search"><Search size={18} strokeWidth={1.4} /></button>
          <Link to="/account" className="icon-btn hide-sm" aria-label="Account"><User size={18} strokeWidth={1.4} /></Link>
          <Link to="/wishlist" className="icon-btn hide-sm" aria-label={`Wishlist, ${wishlist.length} items`}>
            <Heart size={18} strokeWidth={1.4} />
            {wishlist.length > 0 && <span className="dot-count">{wishlist.length}</span>}
          </Link>
          <button type="button" className="icon-btn bag-btn" onClick={openCart} aria-label={`Shopping bag, ${count} items`}>
            <ShoppingBag size={18} strokeWidth={1.4} />
            <span className="bag-btn__label">Bag</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={count} className="bag-btn__count" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.25 }}>
                {count}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {activeMenu && (
          <MegaMenu key={activeMenu.key} menu={activeMenu} onNavigate={close} onMouseEnter={() => openMenuKey(activeMenu.key)} onMouseLeave={scheduleClose} />
        )}
      </AnimatePresence>
    </header>
  );
}
