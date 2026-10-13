import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { getProductsFor, getTitleFor, searchProducts, sortProducts } from '../services/catalog.js';
import ProductCard from '../components/product/ProductCard.jsx';
import Button from '../components/ui/Button.jsx';
import { cx } from '../utils/format.js';

const SORTS = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'name', label: 'Name A–Z' },
];

export default function Shop({ mode = 'category' }) {
  const { category = 'all' } = useParams();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'featured';
  const type = params.get('type') || 'all';

  const base = useMemo(() => (mode === 'search' ? searchProducts(q, 60) : getProductsFor(category)), [mode, q, category]);
  const types = useMemo(() => [...new Set(base.map((p) => p.type))], [base]);
  const list = useMemo(() => sortProducts(type === 'all' ? base : base.filter((p) => p.type === type), sort), [base, type, sort]);

  const set = (k, v) => { const n = new URLSearchParams(params); if (v === 'all' || v === 'featured') n.delete(k); else n.set(k, v); setParams(n, { replace: true }); };
  const title = mode === 'search' ? `“${q}”` : getTitleFor(category);

  return (
    <div className="shop container">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span aria-current="page">{mode === 'search' ? 'Search' : title}</span></nav>
      <header className="shop__head">
        <p className="label">{mode === 'search' ? 'Search results' : 'Shop'}</p>
        <h1 className="display shop__title">{title}</h1>
        <p className="shop__count">{list.length} {list.length === 1 ? 'piece' : 'pieces'}</p>
      </header>

      {base.length > 0 && (
        <div className="shop__bar">
          <div className="shop__types" role="group" aria-label="Filter by type">
            <button type="button" className={cx('chip', type === 'all' && 'is-active')} onClick={() => set('type', 'all')}>All</button>
            {types.length > 1 && types.map((t) => (
              <button key={t} type="button" className={cx('chip', type === t && 'is-active')} onClick={() => set('type', t)}>{getTitleFor(t)}</button>
            ))}
          </div>
          <label className="shop__sort">
            <span>Sort</span>
            <select value={sort} onChange={(e) => set('sort', e.target.value)}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {list.length === 0 ? (
        <div className="empty">
          <p className="empty__title">{mode === 'search' ? 'Nothing matched that search.' : 'This edit is being photographed.'}</p>
          <p>{mode === 'search' ? 'Try “silk”, “bridal”, “kurta” or “jhumka”.' : 'Pieces for this collection arrive soon. Meanwhile, explore the full catalogue.'}</p>
          <Button to="/shop/all">Browse all pieces</Button>
        </div>
      ) : (
        <motion.div className="grid-4" layout>
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((p) => (
              <motion.div key={p.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <ProductCard product={p} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
