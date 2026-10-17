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

export default function JewelleryTheatre({ content }) {
  /* The live catalogue arrives from the backend after mount, so this memo
     depends on the revision its boundary module publishes. */
  const catalogueRevision = useCatalogueRevision();
  const all = useMemo(() => content ? content.products('products') : [], [catalogueRevision, content]);
  const [type, setType] = useState('all');
  const [spot, setSpot] = useState(null);
  const list = type === 'all' ? all : all.filter((p) => p.type === type);
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
              {jewelleryTypes.map((t) => {
                const n = t.key === 'all' ? all.length : all.filter((p) => p.type === t.key).length;
                return (
                  <button key={t.key} type="button" role="tab" aria-selected={type === t.key} className={cx('jtab', type === t.key && 'is-active')} onClick={() => setType(t.key)}>
                    {type === t.key && <motion.span layoutId="jtab-pill" className="jtab__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
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
