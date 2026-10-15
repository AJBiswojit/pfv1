import { useEffect, useState } from 'react';
import { hideBrokenMedia } from '../utils/mediaFallback.js';
import { useParams } from 'react-router-dom';
import { Link } from '../router/index.jsx';
import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { site } from '../data/index.js';
import { getRelated, getTitleFor, requiresOption } from '../services/catalog.js';
import { retryCatalogue, useCatalogueProduct } from '../mock/data/products.js';
import Button from '../components/ui/Button.jsx';
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
  /* This application's product route is keyed by id (`:productId`); the
     design's is `:slug`. Accept either, and let the boundary resolve it
     against the live catalogue — which also reports whether the catalogue
     is still arriving or unreachable, so "no such piece" stays a real 404. */
  const params = useParams();
  const slug = params.productId ?? params.slug ?? '';
  const { product, state } = useCatalogueProduct(slug);
  const [opt, setOpt] = useState(null);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState(null);
  const add = useAddToBag();
  /* The bagging ceiling moves when the catalogue is refreshed. */
  useEffect(() => {
    if (!product) return undefined;
    setQty((q) => Math.min(q, Math.max(1, product.maxQuantity || 1)));
    return undefined;
  }, [product]);
  useEffect(() => { setOpt(null); setQty(1); setErr(null); }, [slug]);
  useEffect(() => { if (product) document.title = `${product.name} — ${site.brand}`; return () => { document.title = `${site.brand} — ${site.tagline}`; }; }, [product]);
  if (state === 'loading') return <ProductLoading />;
  if (state === 'error') return <ProductUnavailable onRetry={retryCatalogue} />;
  if (!product) return <NotFound />;

  /* Whether this can be bought, and how many — both from the catalogue
     boundary. `maxQuantity` is this application's own rule. */
  const available = Number(product.maxQuantity) > 0;
  const ceiling = Math.max(1, Number(product.maxQuantity) || 1);
  /* The design's first option group, when the catalogue published one. */
  const optionGroup = requiresOption(product) ? product.options[0] : null;

  /* ONE AVAILABLE VALUE IS A FORMALITY, NOT A QUESTION.
     The production page needs no size choice for a piece whose sizes are only
     Free Size (`ProductPurchasePanel.jsx::isFreeSizeOnly`), and a port may not
     ask more of a customer than the page it stands in for. A group with one
     available value is therefore preselected — the design's own chip renders as
     chosen — while two or more values still have to be picked, exactly as that
     page requires. */
  const soleValue = optionGroup && optionGroup.values.filter((v) => v.available).length === 1
    ? optionGroup.values.find((v) => v.available).value
    : null;
  const choice = opt ?? soleValue;

  const onAdd = () => {
    if (!available) { setErr('This piece is currently unavailable.'); return; }
    if (optionGroup && !choice) { setErr(`Please select a ${optionGroup.name.toLowerCase()} to continue.`); return; }
    add(product, choice, qty);
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
              <img src={src} alt={i === 0 ? product.name : `${product.name} — detail`} onError={hideBrokenMedia} />
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
              <OptionSelector group={optionGroup} value={choice} onChange={(v) => { setOpt(v); setErr(null); }} error={err} />
            )}
            <div className="pdp__buy">
              <div className="qty qty--lg" role="group" aria-label="Quantity">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity"><Minus size={13} /></button>
                <span aria-live="polite">{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(ceiling, q + 1))} disabled={qty >= ceiling} aria-label="Increase quantity"><Plus size={13} /></button>
              </div>
              <button type="button" className="btn btn--solid pdp__add" onClick={onAdd} disabled={!available}><span>{available ? 'Add to Bag' : 'Currently unavailable'}</span></button>
              <WishlistButton product={product} className="pdp__wish" />
            </div>
            <div className="pdp__accs">
              {(product.details || Object.keys(product.specifications).length > 0) && (
                <Accordion title="Details">
                  {product.details && <p>{product.details}</p>}
                  {Object.entries(product.specifications).map(([term, value]) => (
                    <p key={term}><strong>{term}</strong> — {value}</p>
                  ))}
                </Accordion>
              )}
              <Accordion title="Fabric & craft" defaultOpen>
                {product.fabric && <p><strong>Fabric</strong> — {product.fabric}</p>}
                {product.craft && <p><strong>Craft</strong> — {product.craft}</p>}
                {!product.fabric && !product.craft && <p>This piece&rsquo;s fabric and craft notes are not published yet.</p>}
              </Accordion>
              <Accordion title="Care">
                {product.care.length > 0
                  ? product.care.map((line) => <p key={line}>{line}</p>)
                  : <p>Care guidance for this piece is not published yet.</p>}
              </Accordion>
              <Accordion title="Delivery & returns">
                {product.deliveryInfo
                  ? <p>{product.deliveryInfo}</p>
                  : <p>Delivery timelines are confirmed at checkout.</p>}
                {product.returnInfo
                  ? <p>{product.returnInfo}</p>
                  : <p>Return eligibility varies by product — see our <Link to="/pages/returns">returns policy</Link>.</p>}
              </Accordion>
            </div>
            <p className="pdp__sample">{product.availabilityCopy}</p>
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

/**
 * The catalogue is fetched after mount, so there is a moment before a piece can
 * be known. The design had no such state; it shows the design's own label and
 * display classes, and nothing is invented while it lasts.
 */
function ProductLoading() {
  return (
    <div className="info container" aria-busy="true">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Loading</span></nav>
      <p className="label">The collection</p>
      <h1 className="display info__title">Opening this piece…</h1>
      <p className="info__lead">Fetching the catalogue.</p>
    </div>
  );
}

/**
 * The catalogue could not be reached. The production product page says the same
 * sentence and offers the same retry, which calls this application's own
 * catalogue refresh — the port does not fetch anything by itself.
 */
function ProductUnavailable({ onRetry }) {
  return (
    <div className="info container empty">
      <p className="label">Something went wrong</p>
      <h1 className="display info__title">We couldn&rsquo;t load this piece.</h1>
      <p className="info__lead">The catalogue is unreachable. Please try again.</p>
      <Button variant="solid" onClick={onRetry}>Try again</Button>
      <Button to="/shop/all" variant="ghost">Return to shop</Button>
    </div>
  );
}
