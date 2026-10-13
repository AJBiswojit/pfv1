import { useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { images, kurtiCollections } from '../../data/index.js';
import { getByIds, getProductsFor } from '../../services/catalog.js';
import ProductCard from '../product/ProductCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import ArrowLink from '../ui/ArrowLink.jsx';
import { cx } from '../../utils/format.js';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

const MOODS = {
  'everyday-kurtis': { image: images.kurtiEditorial, focal: '50% 30%', line: 'Breathable chanderi and cottons for long, bright days.' },
  anarkalis: { image: images.catWomen, focal: '50% 35%', line: 'Floor-grazing flares with fine zari hems.' },
  'festive-kurtis': { image: images.kurtiFestive, focal: '50% 30%', line: 'Silk, organza and a little shimmer for the diya hour.' },
  'kurta-sets': { image: images.kurtaSetStudio, focal: '50% 30%', line: 'Kurta, pants and dupatta in a single, considered tone.' },
};
const PAIRINGS = ['p19', 'p18', 'p14', 'p17'];

export default function KurtiLookbook() {
  const [active, setActive] = useState('anarkalis');
  const mood = MOODS[active];
  const items = useMemo(() => {
    const own = getProductsFor(active).filter((p) => p.type === 'kurtis');
    const fill = getByIds(PAIRINGS).filter((p) => !own.includes(p)).slice(0, Math.max(0, 4 - own.length));
    return [...own.map((p) => ({ p, pairing: false })), ...fill.map((p) => ({ p, pairing: true }))];
  }, [active]);
  const ownCount = items.filter((x) => !x.pairing).length;

  return (
    <section className="kurti" aria-labelledby="kurti-title">
      <div className="container kurti__grid">
        <div className="kurti__visual">
          <div className="kurti__imgwrap">
          <span className="kurti__frame" aria-hidden="true" />
          <InView.div
            className="kurti__img"
            initial={{ clipPath: 'inset(100% 0 0 0)' }}
            whileInView={{ clipPath: 'inset(0% 0 0 0)' }}
            viewport={inView}
            transition={{ duration: 1.1, ease: ease.inOut }}
          >
            <AnimatePresence initial={false}>
              <motion.img
                key={active}
                src={mood.image}
                alt=""
                style={{ objectPosition: mood.focal }}
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: ease.out }}
              />
            </AnimatePresence>
          </InView.div>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={active} className="kurti__mood" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
              {mood.line}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="kurti__body">
          <div className="kurti__head">
            <SectionLabel index="10">The Kurti Collection</SectionLabel>
            <h2 id="kurti-title" className="display kurti__title">The kurti, <em>in four moods.</em></h2>
          </div>

          <div className="kurti__selector" role="tablist" aria-label="Kurti collections">
            <LayoutGroup id="kurti">
              {kurtiCollections.map((c, i) => (
                <button key={c.key} type="button" role="tab" aria-selected={active === c.key} className={cx('kmood', active === c.key && 'is-active')} onClick={() => setActive(c.key)}>
                  <sup>0{i + 1}</sup>
                  <span>{c.label}</span>
                  {active === c.key && <motion.span layoutId="kurti-line" className="kmood__line" transition={{ duration: 0.35, ease: ease.out }} />}
                </button>
              ))}
            </LayoutGroup>
          </div>

          <p className="kurti__status" aria-live="polite">
            {ownCount > 0 ? `${ownCount} ${ownCount === 1 ? 'piece' : 'pieces'} in this edit` : 'This edit is being photographed — pieces arrive soon.'}
            {items.some((x) => x.pairing) && ' · styled with pairings'}
          </p>

          <div className="kurti__list">
            <AnimatePresence mode="popLayout" initial={false}>
              {items.map(({ p, pairing }, i) => (
                <motion.div key={p.id} layout initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.35, delay: i * 0.04 }}>
                  <ProductCard product={p} variant="row" eyebrow={pairing ? 'Style it with' : undefined} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <ArrowLink to={`/shop/${active}`}>Shop {kurtiCollections.find((c) => c.key === active).label}</ArrowLink>
        </div>
      </div>
    </section>
  );
}
