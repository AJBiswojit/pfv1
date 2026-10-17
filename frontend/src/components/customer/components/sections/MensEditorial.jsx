import { SectionImage, SectionLink, SectionCTA } from '../../../storefront/home/HomepageSection';
import { Link } from '../../router/index.jsx';
import { motion } from 'framer-motion';
import { formatPrice } from '../../utils/format.js';
import ProductCard from '../product/ProductCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import ArrowLink from '../ui/ArrowLink.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

export default function MensEditorial({ content }) {
  /* Database-driven only: without authored content this section renders nothing. */
  if (!content) return null;
  const list = content.products('products');
  const hero = content.products('featured')[0];
  return (
    <section className="men" aria-labelledby="men-title">
      <div className="container men__top">
        <InView.div
          className="men__head"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={inView}
          transition={{ duration: 0.6, ease: ease.out }}
        >
          <SectionLabel index="07">{content.intro.eyebrow}</SectionLabel>
          <h2 id="men-title" className="display men__title">{content.intro.title}</h2>
          <p className="men__lead">{content.intro.subtitle}</p>
          <SectionCTA copy={content.intro} />
          <ul className="men__types">
            {content.texts().map((t) => (
              <li key={t.key}><SectionLink authored to={t.ctaHref}>{t.title}</SectionLink></li>
            ))}
          </ul>
        </InView.div>
        <InView.div
          className="men__img"
          initial={{ clipPath: 'inset(0 0 100% 0)' }}
          whileInView={{ clipPath: 'inset(0 0 0% 0)' }}
          viewport={inView}
          transition={{ duration: 0.85, ease: ease.inOut }}
        >
          <SectionImage src={content.media("campaign").url} alt={content.media("campaign").altText} loading="lazy" />
          {hero && (
            <Link to={`/product/${hero.slug}`} className="men__tag">
              <span className="men__tag-dot" />
              <span>{hero.name}<small>{formatPrice(hero.price)}</small></span>
            </Link>
          )}
        </InView.div>
      </div>

      <div className="container">
        <div className="grid-4 men__grid">
          {list.map((p, i) => (
            <InView.div key={p.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ duration: 0.45, delay: 0.1 + i * 0.05, ease: ease.out }}>
              <ProductCard product={p} />
            </InView.div>
          ))}
        </div>
        <div className="men__foot"><ArrowLink to="/shop/men">Shop all Men</ArrowLink></div>
      </div>
    </section>
  );
}
