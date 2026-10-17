import { SectionImage, SectionLink, SectionCTA } from '../../../storefront/home/HomepageSection';
import { Link } from '../../router/index.jsx';
import { motion } from 'framer-motion';
import ProductCard from '../product/ProductCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import Button from '../ui/Button.jsx';
import { inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

const spring = { type: 'spring', stiffness: 160, damping: 16 };
const chips = [
  { label: 'Girls', note: '2–11Y', to: '/shop/girls' },
  { label: 'Boys', note: '2–11Y', to: '/shop/boys' },
  { label: 'Festive', note: 'Twirl-ready', to: '/shop/kids-festive' },
];

export default function KidsPlayground({ content }) {
  /* Database-driven only: without authored content this section renders nothing. */
  if (!content) return null;
  const list = content.products('products');
  const choices = content.texts().map((t) => ({ label: t.title, note: t.subtitle, to: t.ctaHref }));
  return (
    <section className="kids" aria-labelledby="kids-title">
      <div className="container kids__grid">
        <div className="kids__collage">
          <InView.div className="kids__main" initial={{ opacity: 0, y: 50, rotate: -4 }} whileInView={{ opacity: 1, y: 0, rotate: -1.5 }} viewport={inView} transition={spring} whileHover={{ rotate: 0, scale: 1.01 }}>
            <SectionImage src={content.media("main").url} alt={content.media("main").altText} loading="lazy" />
          </InView.div>
          <InView.div className="kids__mini kids__mini--a" initial={{ opacity: 0, scale: 0.7, rotate: 8 }} whileInView={{ opacity: 1, scale: 1, rotate: 4 }} viewport={inView} transition={{ ...spring, delay: 0.15 }} whileHover={{ rotate: 0, y: -6 }}>
            <SectionLink authored to={content.media("girls").ctaHref} aria-label="Shop girls"><SectionImage src={content.media("girls").url} alt={content.media("girls").altText} loading="lazy" /><span>{content.media("girls").title}</span></SectionLink>
          </InView.div>
          <InView.div className="kids__mini kids__mini--b" initial={{ opacity: 0, scale: 0.7, rotate: -10 }} whileInView={{ opacity: 1, scale: 1, rotate: -5 }} viewport={inView} transition={{ ...spring, delay: 0.25 }} whileHover={{ rotate: 0, y: -6 }}>
            <SectionLink authored to={content.media("boys").ctaHref} aria-label="Shop boys"><SectionImage src={content.media("boys").url} alt={content.media("boys").altText} loading="lazy" /><span>{content.media("boys").title}</span></SectionLink>
          </InView.div>
          <InView.span className="kids__sticker" aria-hidden="true" initial={{ scale: 0, rotate: -30 }} whileInView={{ scale: 1, rotate: -12 }} viewport={inView} transition={{ ...spring, delay: 0.4 }}>
            made<br />for<br />twirling
          </InView.span>
        </div>

        <div className="kids__body">
          <SectionLabel index="08">{content.intro.eyebrow}</SectionLabel>
          <InView.h2 id="kids-title" className="display kids__title" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={spring}>
            {content.intro.title}
          </InView.h2>
          <p className="kids__lead">{content.intro.subtitle}</p>
          <div className="kids__chips">
            {choices.map((c, i) => (
              <InView.div key={c.label} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ ...spring, delay: 0.1 + i * 0.06 }}>
                <SectionLink authored to={c.to} className="kchip"><strong>{c.label}</strong><span>{c.note}</span></SectionLink>
              </InView.div>
            ))}
          </div>
          <div className="kids__products">
            {list.map((p, i) => (
              <InView.div key={p.id} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ ...spring, delay: 0.2 + i * 0.08 }}>
                <ProductCard product={p} variant="tall" />
              </InView.div>
            ))}
          </div>
          <SectionCTA copy={content.intro} />
        </div>
      </div>
    </section>
  );
}
