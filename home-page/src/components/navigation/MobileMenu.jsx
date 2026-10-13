import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Heart, Search, User, X, Package } from 'lucide-react';
import { megaMenus } from '../../data/index.js';
import { useUI } from '../../state/UIContext.jsx';
import useLockBody from '../../hooks/useLockBody.js';
import useEscape from '../../hooks/useEscape.js';
import useFocusTrap from '../../hooks/useFocusTrap.js';
import Logo from '../ui/Logo.jsx';
import { ease } from '../../utils/motion.js';

export default function MobileMenu() {
  const { menuOpen, closeMenu, openSearch } = useUI();
  const [open, setOpen] = useState('women');
  const ref = useRef(null);
  useLockBody(menuOpen);
  useEscape(menuOpen, closeMenu);
  useFocusTrap(ref, menuOpen);

  return (
    <AnimatePresence>
      {menuOpen && (
        <>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeMenu} />
          <motion.aside
            ref={ref}
            className="mmenu"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.45, ease: ease.out }}
          >
            <div className="mmenu__head">
              <Logo compact onClick={closeMenu} />
              <button type="button" className="icon-btn" onClick={closeMenu} aria-label="Close menu" data-autofocus><X size={20} strokeWidth={1.4} /></button>
            </div>
            <button type="button" className="mmenu__search" onClick={() => { closeMenu(); openSearch(); }}>
              <Search size={16} strokeWidth={1.5} /> Search sarees, jewellery, sherwanis…
            </button>
            <nav className="mmenu__nav" aria-label="Categories">
              {megaMenus.map((m) => {
                const isOpen = open === m.key;
                return (
                  <div key={m.key} className="mmenu__group">
                    <button type="button" className="mmenu__toggle" aria-expanded={isOpen} aria-controls={`mm-${m.key}`} onClick={() => setOpen(isOpen ? null : m.key)}>
                      <span>{m.label}</span>
                      <ChevronDown size={18} strokeWidth={1.3} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .3s' }} />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          id={`mm-${m.key}`}
                          className="mmenu__panel"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: ease.out }}
                        >
                          <Link to={m.feature.to} className="mmenu__feature" onClick={closeMenu}>
                            <img src={m.feature.image} alt="" style={{ objectPosition: m.feature.focal }} />
                            <span><em>{m.feature.kicker}</em>{m.feature.title}</span>
                          </Link>
                          {m.columns.map((c) => (
                            <div key={c.title} className="mmenu__col">
                              <p>{c.title}</p>
                              {c.links.map((l) => <Link key={l.label} to={l.to} onClick={closeMenu}>{l.label}</Link>)}
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
              <Link to="/shop/bridal" className="mmenu__bridal" onClick={closeMenu}>The Bridal Edit</Link>
            </nav>
            <div className="mmenu__foot">
              <Link to="/account" onClick={closeMenu}><User size={16} strokeWidth={1.4} /> Account</Link>
              <Link to="/wishlist" onClick={closeMenu}><Heart size={16} strokeWidth={1.4} /> Wishlist</Link>
              <Link to="/track-order" onClick={closeMenu}><Package size={16} strokeWidth={1.4} /> Track order</Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
