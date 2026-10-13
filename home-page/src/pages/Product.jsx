import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { site } from '../data/index.js';
import { getProductBySlug, getRelated, getTitleFor, requiresOption } from '../services/catalog.js';
import Price from '../components/product/Price.jsx';
import OptionSelector from '../components/product/OptionSelector.jsx';
import WishlistButton from '../components/product/WishlistButton.jsx';
import ProductCard from '../components/product/ProductCard.jsx';
import useAddToBag from '../components/product/useAddToBag.js';
import NotFound from './NotFound.jsx';
import { ease } from '../utils/motion.js';

function Accordion({ title, children, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={open ? 'acc is-open' : 'acc'}>
      <button type="button" className="acc__btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span><Plus size={14} strokeWidth={1.4} />
      </button>
      {open && <div className="acc__body">{children}</div>}
    </div>
  );
}

export default function Product() {
  const { slug } = useParams();
  const product = getProductBySlug(slug);
  const [opt, setOpt] = useState(null);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState(null);
  const add = useAddToBag();
  useEffect(() => { setOpt(null); setQty(1); setErr(null); }, [slug]);
  useEffect(() => { if (product) document.title = `${product.name} — ${site.brand}`; return () => { document.title = `${site.brand} — ${site.tagline}`; }; }, [product]);
  if (!product) return <NotFound />;

  const onAdd = () => {
    if (requiresOption(product) && !opt) { setErr(`Please select a ${product.options[0].name.toLowerCase()} to continue.`); return; }
    add(product, opt, qty);
  };
  const related = getRelated(product);

  return (
    <div className="pdp container">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span>/</span>
        <Link to={`/shop/${product.department}`}>{getTitleFor(product.department)}</Link><span>/</span>
        <Link to={`/shop/${product.type}`}>{getTitleFor(product.type)}</Link>
      </nav>
      <div className="pdp__grid">
        <div className="pdp__gallery">
          {product.images.map((src, i) => (
            <motion.div key={src} className="pdp__img" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: i * 0.1, ease: ease.out }}>
              <img src={src} alt={i === 0 ? product.name : `${product.name} — detail`} />
            </motion.div>
          ))}
        </div>
        <div className="pdp__info">
          <div className="pdp__sticky">
            {product.badge && <p className="label">{product.badge}</p>}
            <h1 className="pdp__name">{product.name}</h1>
            <Price price={product.price} compareAt={product.compareAt} large />
            <p className="pdp__tax">Inclusive of applicable taxes. Delivery calculated at checkout.</p>
            <p className="pdp__desc">{product.description}</p>
            {requiresOption(product) && (
              <OptionSelector group={product.options[0]} value={opt} onChange={(v) => { setOpt(v); setErr(null); }} error={err} />
            )}
            <div className="pdp__buy">
              <div className="qty qty--lg" role="group" aria-label="Quantity">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity"><Minus size={13} /></button>
                <span aria-live="polite">{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(10, q + 1))} disabled={qty >= 10} aria-label="Increase quantity"><Plus size={13} /></button>
              </div>
              <button type="button" className="btn btn--solid pdp__add" onClick={onAdd}><span>Add to Bag</span></button>
              <WishlistButton product={product} className="pdp__wish" />
            </div>
            <div className="pdp__accs">
              <Accordion title="Fabric & craft" defaultOpen>
                <p><strong>Fabric</strong> — {product.fabric}</p>
                <p><strong>Craft</strong> — {product.craft}</p>
              </Accordion>
              <Accordion title="Care">
                <p>Dry clean recommended for silks and embellished pieces. Store folded in muslin, away from direct sunlight.</p>
              </Accordion>
              <Accordion title="Delivery & returns">
                <p>Delivery timelines are confirmed at checkout. Return eligibility varies by product — see our <Link to="/pages/returns">returns policy</Link>.</p>
              </Accordion>
            </div>
            <p className="pdp__sample">Prototype listing — price and availability are sample data.</p>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="pdp__related" aria-labelledby="related-title">
          <h2 id="related-title" className="subhead">Complete the look</h2>
          <div className="grid-4">{related.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}
    </div>
  );
}
