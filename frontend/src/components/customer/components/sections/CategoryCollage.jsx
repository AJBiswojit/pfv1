import { SectionImage, SectionLink, SectionCTA } from '../../../storefront/home/HomepageSection';
import { motion } from 'framer-motion';
import SectionLabel from '../ui/SectionLabel.jsx';
import { Arrow } from '../ui/ArrowLink.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

// Each tile enters from its own direction — a staggered, non-uniform entrance.
const entrances = {
  women: { initial: { opacity: 0, y: 40 }, delay: 0 },
  men: { initial: { opacity: 0, y: 70 }, delay: 0.18 },
  kids: { initial: { opacity: 0, x: -30 }, delay: 0.3 },
  essentials: { initial: { opacity: 0, x: 30 }, delay: 0.4 },
};

function Tile({ cat, index }) {
  const e = entrances[cat.key] ?? { initial: { opacity: 0, y: 40 }, delay: 0 };
  const count = cat.count;
  return (
    <InView.div
      className={`collage__tile collage__tile--${cat.key}`}
      initial={e.initial}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={inView}
      transition={{ duration: 0.9, delay: e.delay, ease: ease.out }}
    >
      <SectionLink authored to={cat.to} className="collage__link">
        <div className="collage__img">
          <SectionImage src={cat.image} alt={cat.altText ?? `${cat.label} collection`} loading="lazy" style={{ objectPosition: cat.focal }} />
        </div>
        <div className="collage__cap">
          <span className="collage__num">0{index + 1}</span>
          <span className="collage__name">{cat.label}</span>
          <span className="collage__note">{cat.note}</span>
          <span className="collage__cta">
            <span>{count} {cat.curated ? "pieces in this edit" : "pieces"}</span>
            <span className="collage__arrow"><Arrow /></span>
          </span>
        </div>
      </SectionLink>
    </InView.div>
  );
}

export default function CategoryCollage({ content }) {
  /* Database-driven only: without authored content this section renders nothing. */
  if (!content) return null;
  const cards = content.mediaList().map((m) => ({ key: m.key, label: m.title, note: m.subtitle, to: m.ctaHref, image: m.url, altText: m.altText, count: content.products(`${m.key}-products`).length, curated: true }));
  return (
    <section className="collage" aria-labelledby="collage-title">
      <div className="container collage__grid">
        <div className="collage__head">
          <SectionLabel index="02">{content.intro.eyebrow}</SectionLabel>
          <h2 id="collage-title" className="display collage__title">
            {content.intro.title}
          </h2>
          <p className="collage__intro">{content.intro.subtitle}</p>
          <SectionCTA copy={content.intro} />
        </div>
        {cards.map((c, i) => <Tile key={c.key} cat={c} index={i} />)}
      </div>
    </section>
  );
}
