import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from '../../router/index.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useUI } from '../../state/UIContext.jsx';
import { searchCategories, searchProducts } from '../../services/catalog.js';
import { popularSearches } from '../../data/index.js';
import useLockBody from '../../hooks/useLockBody.js';
import useEscape from '../../hooks/useEscape.js';
import useFocusTrap from '../../hooks/useFocusTrap.js';
import { formatPrice } from '../../utils/format.js';
import { ease } from '../../utils/motion.js';

export default function SearchOverlay() {
  const { searchOpen, closeSearch } = useUI();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const ref = useRef(null);
  const navigate = useNavigate();
  useLockBody(searchOpen);
  useEscape(searchOpen, closeSearch);
  useFocusTrap(ref, searchOpen);

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 120); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (!searchOpen) { setQ(''); setDebounced(''); } }, [searchOpen]);

  const results = useMemo(() => searchProducts(debounced, 6), [debounced]);
  const cats = useMemo(() => searchCategories(debounced), [debounced]);

  const go = (term) => {
    if (!term.trim()) return;
    closeSearch();
    navigate(`/search?q=${encodeURIComponent(term.trim())}`);
  };

  return (
    <AnimatePresence>
      {searchOpen && (
        <>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeSearch} />
          <motion.div
            ref={ref}
            className="search"
            role="dialog"
            aria-modal="true"
            aria-label="Search the store"
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            transition={{ duration: 0.45, ease: ease.out }}
          >
            <div className="container search__inner">
              <form className="search__form" onSubmit={(e) => { e.preventDefault(); go(q); }} role="search">
                <Search size={22} strokeWidth={1.2} />
                <label htmlFor="search-input" className="sr-only">Search</label>
                <input id="search-input" data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sarees, sherwanis, jhumkas…" autoComplete="off" />
                <button type="button" className="icon-btn" onClick={closeSearch} aria-label="Close search"><X size={20} strokeWidth={1.4} /></button>
              </form>

              <div className="search__body">
                {!debounced && (
                  <div className="search__popular">
                    <p className="label">Popular searches</p>
                    <div className="search__chips">
                      {popularSearches.map((s) => <button key={s} type="button" className="chip" onClick={() => go(s)}>{s}</button>)}
                    </div>
                  </div>
                )}
                {debounced && (
                  <div className="search__results">
                    {cats.length > 0 && (
                      <div className="search__cats">
                        <p className="label">Categories</p>
                        {cats.map((c) => (
                          <Link key={c.key} to={`/shop/${c.key}`} onClick={closeSearch}>{c.title} <span>{c.count}</span></Link>
                        ))}
                      </div>
                    )}
                    <div className="search__products">
                      <p className="label">{results.length ? 'Products' : 'No products match'}</p>
                      {results.length === 0 && <p className="search__none">Try “silk”, “bridal”, “kurta” or browse a popular search.</p>}
                      <ul>
                        {results.map((p) => (
                          <li key={p.id}>
                            <Link to={`/product/${p.slug}`} onClick={closeSearch} className="search__hit">
                              <img src={p.images[0]} alt="" />
                              <span><strong>{p.name}</strong><small>{formatPrice(p.price)}</small></span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {results.length > 0 && <button type="button" className="arrow-link" onClick={() => go(q)}><span>See all results for “{q}”</span></button>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
