import { Link } from '../../router/index.jsx';
import { motion } from 'framer-motion';
import { categories } from '../../data/index.js';
import { getProductsFor } from '../../services/catalog.js';
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
  const e = entrances[cat.key];
  const count = getProductsFor(cat.key).length;
  return (
    <InView.div
      className={`collage__tile collage__tile--${cat.key}`}
      initial={e.initial}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={inView}
      transition={{ duration: 0.9, delay: e.delay, ease: ease.out }}
    >
      <Link to={cat.to} className="collage__link">
        <div className="collage__img">
          <img src={cat.image} alt={`${cat.label} collection`} loading="lazy" style={{ objectPosition: cat.focal }} />
        </div>
        <div className="collage__cap">
          <span className="collage__num">0{index + 1}</span>
          <span className="collage__name">{cat.label}</span>
          <span className="collage__note">{cat.note}</span>
          <span className="collage__cta">
            <span>{count} pieces</span>
            <span className="collage__arrow"><Arrow /></span>
          </span>
        </div>
      </Link>
    </InView.div>
  );
}

export default function CategoryCollage() {
  return (
    <section className="collage" aria-labelledby="collage-title">
      <div className="container collage__grid">
        <div className="collage__head">
          <SectionLabel index="02">Shop by Category</SectionLabel>
          <h2 id="collage-title" className="display collage__title">
            Dressed for <em>every</em> chapter.
          </h2>
          <p className="collage__intro">From first festivals to family weddings — four wardrobes, one sensibility.</p>
        </div>
        {categories.map((c, i) => <Tile key={c.key} cat={c} index={i} />)}
      </div>
    </section>
  );
}
