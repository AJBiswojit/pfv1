import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useUI } from '../../state/UIContext.jsx';
import { getProductById, getTitleFor, requiresOption } from '../../services/catalog.js';
import useLockBody from '../../hooks/useLockBody.js';
import useEscape from '../../hooks/useEscape.js';
import useFocusTrap from '../../hooks/useFocusTrap.js';
import Price from '../product/Price.jsx';
import OptionSelector from '../product/OptionSelector.jsx';
import WishlistButton from '../product/WishlistButton.jsx';
import useAddToBag from '../product/useAddToBag.js';
import { ease } from '../../utils/motion.js';

export default function QuickViewModal() {
  const { quickViewId, closeQuickView } = useUI();
  const product = quickViewId ? getProductById(quickViewId) : null;
  const [opt, setOpt] = useState(null);
  const [err, setErr] = useState(null);
  const [imgIdx, setImgIdx] = useState(0);
  const add = useAddToBag();
  const ref = useRef(null);
  const open = Boolean(product);
  useLockBody(open);
  useEscape(open, closeQuickView);
  useFocusTrap(ref, open);

  useEffect(() => { setOpt(null); setErr(null); setImgIdx(0); }, [quickViewId]);

  const onAdd = () => {
    if (requiresOption(product) && !opt) { setErr(`Please select a ${product.options[0].name.toLowerCase()}.`); return; }
    add(product, opt);
    closeQuickView();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="scrim" onClick={closeQuickView} />
          <motion.div
            ref={ref}
            className="qv"
            role="dialog"
            aria-modal="true"
            aria-label={`Quick view: ${product.name}`}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.4, ease: ease.out }}
          >
            <button type="button" className="icon-btn qv__close" onClick={closeQuickView} aria-label="Close quick view" data-autofocus><X size={20} strokeWidth={1.4} /></button>
            <div className="qv__gallery">
              <div className="qv__main">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.img key={imgIdx} src={product.images[imgIdx]} alt={product.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
                </AnimatePresence>
              </div>
              {product.images.length > 1 && (
                <div className="qv__thumbs">
                  {product.images.map((src, i) => (
                    <button key={src} type="button" className={i === imgIdx ? 'is-active' : ''} onClick={() => setImgIdx(i)} aria-label={`View image ${i + 1}`}>
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="qv__info">
              <p className="label">{getTitleFor(product.type)}</p>
              <h2 className="qv__name">{product.name}</h2>
              <Price price={product.price} compareAt={product.compareAt} large />
              <p className="qv__desc">{product.description}</p>
              <p className="qv__craft"><span>Fabric</span>{product.fabric}</p>
              <p className="qv__craft"><span>Craft</span>{product.craft}</p>
              {requiresOption(product) && (
                <OptionSelector group={product.options[0]} value={opt} onChange={(v) => { setOpt(v); setErr(null); }} error={err} />
              )}
              <div className="qv__actions">
                <button type="button" className="btn btn--solid btn--block" onClick={onAdd}><span>Add to Bag</span></button>
                <WishlistButton product={product} withLabel />
              </div>
              <Link to={`/product/${product.slug}`} className="qv__more" onClick={closeQuickView}>View full details →</Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
