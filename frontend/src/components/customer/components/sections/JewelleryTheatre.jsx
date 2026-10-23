import { SectionImage, SectionLink, SectionCTA } from '../../../storefront/home/HomepageSection';
import { useMemo, useState } from 'react';
import { hideBrokenMedia } from '../../utils/mediaFallback.js';
import { Link } from '../../router/index.jsx';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { jewelleryTypes } from '../../data/index.js';
import { useCatalogueRevision } from '../../mock/data/products.js';
import ProductCard from '../product/ProductCard.jsx';
import Price from '../product/Price.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import { Arrow } from '../ui/ArrowLink.jsx';
import { LineReveal, FadeUp, MaskReveal } from '../ui/Reveal.jsx';
import { cx } from '../../utils/format.js';
import { ease } from '../../utils/motion.js';

/* F-27: the catalogue files a piece under the path it actually publishes
   (`…/jewellery`, `women/sarees/banarasi`), so the design's fixed list of five
   jewellery words produced tabs that could never match — the pieces this
   section was curated with were reachable only through "All". The tab
   vocabulary is derived from the curated products instead; the design's own
   words stay as labels wherever the catalogue happens to use the same key, and
   nothing is filtered by a type the section does not hold. */
const labelFor = (key) => jewelleryTypes.find((t) => t.key === key)?.label
  ?? String(key).replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export function filterTabs(products = []) {
  const keys = [];
  for (const product of products) {
    const key = String(product?.type ?? '').trim();
    /* `all` is the adapter's "no type published" fallback, not a real type. */
    if (!key || key === 'all' || keys.includes(key)) continue;
    keys.push(key);
  }
  /* Design order first, then anything else the catalogue publishes. */
  const designed = jewelleryTypes.map((t) => t.key).filter((key) => keys.includes(key));
  const rest = keys.filter((key) => !designed.includes(key));
  return [{ key: 'all', label: 'All' }, ...[...designed, ...rest].map((key) => ({ key, label: labelFor(key) }))];
}

/* The tab's row set, in one place so the tab count and the grid can never
   disagree about what a tab means. */
export const productsForTab = (products = [], key = 'all') => key === 'all' ? products : products.filter((p) => p.type === key);

export default function JewelleryTheatre({ content }) {
  /* The live catalogue arrives from the backend after mount, so this memo
     depends on the revision its boundary module publishes. */
  const catalogueRevision = useCatalogueRevision();
  const all = useMemo(() => content ? content.products('products') : [], [catalogueRevision, content]);
  const [type, setType] = useState('all');
  const [spot, setSpot] = useState(null);
  const tabs = filterTabs(all);
  /* A catalogue refresh can remove the selected type; fall back to "All"
     rather than leaving the section on a filter with nothing behind it. */
  const activeType = tabs.some((t) => t.key === type) ? type : 'all';
  const list = productsForTab(all, activeType);
  /* Database-driven only: without authored content this section renders nothing. */
  if (!content) return null;

  return (
    <section className="jewel" aria-label="Jewellery essentials">
      <div className="container jewel__grid">
        {/* The stage: shows the editorial by default, then whatever piece is in focus */}
        <div className="jewel__stage" onMouseLeave={() => setSpot(null)}>
          <MaskReveal from="up" duration={1.2} className="jewel__stage-frame">
            <AnimatePresence mode="sync" initial={false}>
              <motion.div
                key={spot ? spot.id : 'editorial'}
                className="jewel__stage-zoom"
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, ease: ease.out }}
              >
                {spot ? (
                  <SectionImage src={spot.images[0]} alt={spot.name} style={{ transform: 'none' }} onError={hideBrokenMedia} />
                ) : (
                  <SectionImage src={content.media("campaign").url} alt={content.media("campaign").altText} />
                )}
              </motion.div>
            </AnimatePresence>
          </MaskReveal>
          <div className="jewel__stage-cap" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              {spot ? (
                <motion.div key={spot.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
                  <span className="jewel__stage-kicker">{spot.craft}</span>
                  <Link to={`/product/${spot.slug}`} className="jewel__stage-name">{spot.name}</Link>
                  <Price price={spot.price} compareAt={spot.compareAt} />
                </motion.div>
              ) : (
                <motion.div key="ed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
                  <span className="jewel__stage-kicker">{content.media("campaign").eyebrow}</span>
                  <span className="jewel__stage-name">{content.media("campaign").subtitle}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="jewel__side">
          <div className="jewel__head">
            <SectionLabel index="05">{content.intro.eyebrow}</SectionLabel>
            <LineReveal as="h2" className="display jewel__title" lines={content.intro.title.split('\n')} italic={[1]} />
            <FadeUp delay={0.2}><p className="jewel__lead">{content.intro.subtitle}</p></FadeUp>
          </div>

          <div className="jewel__tabs" role="tablist" aria-label="Filter jewellery by type">
            <LayoutGroup id="jewel-tabs">
              {tabs.map((t) => {
                const n = productsForTab(all, t.key).length;
                return (
                  <button key={t.key} type="button" role="tab" aria-selected={activeType === t.key} className={cx('jtab', activeType === t.key && 'is-active')} onClick={() => setType(t.key)}>
                    {activeType === t.key && <motion.span layoutId="jtab-pill" className="jtab__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    <span className="jtab__label">{t.label}</span><sup>{n}</sup>
                  </button>
                );
              })}
            </LayoutGroup>
          </div>

          <motion.div className="jewel__tiles" layout>
            <AnimatePresence mode="popLayout" initial={false}>
              {list.map((p) => (
                <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.35, ease: ease.out }}>
                  <ProductCard product={p} variant="square" onHover={setSpot} />
                </motion.div>
              ))}
              <motion.div key="all-jewellery" layout className="jewel__more">
                <SectionLink authored to={content.intro.ctaHref}>
                  <span className="jewel__more-n">{all.length}</span>
                  <span className="jewel__more-t">{content.intro.ctaLabel}</span>
                  <Arrow />
                </SectionLink>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
