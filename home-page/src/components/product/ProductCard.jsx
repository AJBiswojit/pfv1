import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Plus, X } from 'lucide-react';
import Price from './Price.jsx';
import WishlistButton from './WishlistButton.jsx';
import useAddToBag from './useAddToBag.js';
import { useUI } from '../../state/UIContext.jsx';
import { requiresOption, getTitleFor } from '../../services/catalog.js';
import { cx } from '../../utils/format.js';
import { ease } from '../../utils/motion.js';

/**
 * Shared product card.
 * variant: 'default' (4:5) | 'square' (jewellery) | 'tall' (3:4)
 */
export default function ProductCard({ product, variant = 'default', onHover, className, eyebrow }) {
  const [picking, setPicking] = useState(false);
  const add = useAddToBag();
  const { openQuickView } = useUI();
  const needsOption = requiresOption(product);
  const group = needsOption ? product.options[0] : null;
  const url = `/product/${product.slug}`;

  const quickAdd = () => (needsOption ? setPicking(true) : add(product));

  return (
    <article
      className={cx('pcard', `pcard--${variant}`, className)}
      onMouseEnter={onHover ? () => onHover(product) : undefined}
      onFocus={onHover ? () => onHover(product) : undefined}
    >
      <div className="pcard__media">
        <Link to={url} className="pcard__imglink" aria-label={product.name} tabIndex={-1}>
          <img className="pcard__img" src={product.images[0]} alt={product.name} loading="lazy" decoding="async" />
          {product.images[1] && <img className="pcard__img pcard__img--alt" src={product.images[1]} alt="" aria-hidden="true" loading="lazy" decoding="async" />}
        </Link>
        {product.badge && <span className="pcard__badge">{product.badge}</span>}
        <WishlistButton product={product} className="pcard__wish" />

        <div className="pcard__actions">
          <button type="button" className="pcard__act" onClick={() => openQuickView(product.id)} aria-label={`Quick view ${product.name}`}>
            <Eye size={15} strokeWidth={1.5} /> <span>Quick view</span>
          </button>
          <button type="button" className="pcard__act pcard__act--add" onClick={quickAdd} aria-label={`Quick add ${product.name}`}>
            <Plus size={15} strokeWidth={1.5} /> <span>Add</span>
          </button>
        </div>

        <AnimatePresence>
          {picking && (
            <motion.div
              className="pcard__picker"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.35, ease: ease.out }}
              role="dialog"
              aria-label={`Select ${group.name.toLowerCase()} for ${product.name}`}
            >
              <div className="pcard__picker-head">
                <span>Select {group.name.toLowerCase()}</span>
                <button type="button" onClick={() => setPicking(false)} aria-label="Close size selection"><X size={14} /></button>
              </div>
              <div className="pcard__picker-list">
                {group.values.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    className={cx('chip chip--sm', !v.available && 'is-out')}
                    disabled={!v.available}
                    onClick={() => { add(product, v.value); setPicking(false); }}
                  >
                    {v.value}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pcard__info">
        <p className="pcard__eyebrow">{eyebrow || getTitleFor(product.type)}</p>
        <h3 className="pcard__name"><Link to={url}>{product.name}</Link></h3>
        <Price price={product.price} compareAt={product.compareAt} />
      </div>
    </article>
  );
}
