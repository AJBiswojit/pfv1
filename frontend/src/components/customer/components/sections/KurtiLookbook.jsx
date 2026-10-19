import { SectionImage, SectionCTA } from '../../../storefront/home/HomepageSection';
import { useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCatalogueRevision } from '../../mock/data/products.js';
import ProductCard from '../product/ProductCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import { cx } from '../../utils/format.js';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

/**
 * 10 · The Kurti Collection — four moods, a live selector.
 * Database-driven only: the moods, imagery, copy and product lists all come
 * from the authored kurtis section content, and without it this section
 * renders nothing.
 */
export default function KurtiLookbook({ content }) {
  /* B-15: the initial mood used to be hardcoded to 'anarkalis' — when that
     slot was unconfigured the hero image rendered blank until a mood was
     clicked. Now the default is null and resolves to the first configured
     mood; if a re-save removes the selected mood, the render falls back to
     the first configured mood instead of going blank. */
  const [selected, setSelected] = useState(null);
  /* The live catalogue arrives from the backend after mount, so this memo
     depends on the revision its boundary module publishes. */
  const catalogueRevision = useCatalogueRevision();
  const moods = useMemo(() => content ? content.mediaList().map((m) => ({ key: m.key, label: (m.title || m.key).replace(/\n/g, ' ') })) : [], [content]);
  /* Recovery: a missing/stale selection (or the null default) resolves to
     the first configured mood, so a re-save that removes the active slot
     never blanks the visual. */
  const active = moods.some((m) => m.key === selected) ? selected : (moods[0]?.key ?? selected);
  const items = useMemo(() => {
    const own = content ? content.products(active) : [];
    const fill = (content ? content.products('pairings') : []).filter((p) => !own.includes(p)).slice(0, Math.max(0, 4 - own.length));
    return [...own.map((p) => ({ p, pairing: false })), ...fill.map((p) => ({ p, pairing: true }))];
  }, [active, catalogueRevision, content]);
  /* Database-driven only: without authored content this section renders nothing. */
  if (!content) return null;
  const current = content.media(active);
  const mood = { image: current.url, line: [current.title, current.subtitle].filter(Boolean).join(' · ') };
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
              <SectionImage as={motion.img}
                key={active}
                src={mood.image}
                alt={current.altText || ''}
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
            <SectionLabel index="10">{content.intro.eyebrow}</SectionLabel>
            <h2 id="kurti-title" className="display kurti__title">{content.intro.title}</h2>
          </div>

          <p className="kurti__lead">{content.intro.subtitle}</p>
          <div className="kurti__selector" role="tablist" aria-label="Kurti collections">
            <LayoutGroup id="kurti">
              {moods.map((c, i) => (
                <button key={c.key} type="button" role="tab" aria-selected={active === c.key} className={cx('kmood', active === c.key && 'is-active')} onClick={() => setSelected(c.key)}>
                  <sup>0{i + 1}</sup>
                  <span>{c.label}</span>
                  {active === c.key && <motion.span layoutId="kurti-line" className="kmood__line" transition={{ duration: 0.35, ease: ease.out }} />}
                </button>
              ))}
            </LayoutGroup>
          </div>

          <p className="kurti__status" aria-live="polite">
            {ownCount > 0 ? `${ownCount} ${ownCount === 1 ? 'piece' : 'pieces'} in this edit` : 'No eligible pieces in this edit.'}
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
          <SectionCTA copy={current} />
          <SectionCTA copy={content.intro} />
        </div>
      </div>
    </section>
  );
}
