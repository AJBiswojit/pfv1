import { SectionImage, SectionLink, SectionCTA } from '../../../storefront/home/HomepageSection';
import { useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { getFeaturedBy } from '../../services/catalog.js';
import { useCatalogueRevision } from '../../mock/data/products.js';
import ProductCard from '../product/ProductCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import ArrowLink from '../ui/ArrowLink.jsx';
import { cx } from '../../utils/format.js';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'women', label: 'Women' },
  { key: 'sarees', label: 'Sarees' },
  { key: 'men', label: 'Men' },
  { key: 'kids', label: 'Kids' },
  { key: 'jewellery', label: 'Jewellery' },
];

export default function Bestsellers({ content }) {
  const [filter, setFilter] = useState('all');
  /* The live catalogue arrives from the backend after mount, so this memo
     depends on the revision its boundary module publishes. */
  const catalogueRevision = useCatalogueRevision();
  const list = useMemo(() => content ? content.products('products').filter((p) => filter === 'all' || p.department === filter || p.type === filter) : getFeaturedBy(filter, 8), [filter, catalogueRevision, content]);
  return (
    <section className="best" aria-labelledby="best-title">
      <div className="container">
        <div className="best__head">
          <div>
            <SectionLabel index="09">{content ? content.intro.eyebrow : "Most Loved"}</SectionLabel>
            <InView.h2 id="best-title" className="best__title" initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ duration: 0.7, ease: ease.out }}>{content ? content.intro.title : "Bestsellers"}</InView.h2>
          </div>
          <div className="best__filters" role="tablist" aria-label="Filter bestsellers">
            <LayoutGroup id="best">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={cx('bfilter', filter === f.key && 'is-active')} onClick={() => setFilter(f.key)}>
                  {f.label}
                  {filter === f.key && <motion.span layoutId="best-underline" className="bfilter__line" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                </button>
              ))}
            </LayoutGroup>
          </div>
          {content ? <SectionCTA copy={content.intro} className="best__all" /> : <ArrowLink to="/shop/all" className="best__all">View All</ArrowLink>}
        </div>
        <p className="best__note">{content ? content.intro.subtitle : "A selection from the house catalogue — the backend does not yet expose a verified sales ranking."}</p>

        {/* Quick, shopping-friendly entrance on the wrapper only, so filter/layout animations stay independent */}
        <InView.div initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ duration: 0.6, delay: 0.1, ease: ease.out }}>
        <motion.div className="grid-4" layout>
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
              >
                <ProductCard product={p} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
        </InView.div>
        {list.length === 0 && <p className="empty-inline">No pieces in this filter yet.</p>}
      </div>
    </section>
  );
}
