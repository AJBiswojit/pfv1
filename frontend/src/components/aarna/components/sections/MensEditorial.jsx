import { SectionImage, SectionLink, SectionCTA } from '../../../storefront/home/HomepageSection';
import { Link } from '../../router/index.jsx';
import { motion } from 'framer-motion';
import { images } from '../../data/index.js';
import { getByDepartment, getProductBySlug } from '../../services/catalog.js';
import { formatPrice } from '../../utils/format.js';
import ProductCard from '../product/ProductCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import ArrowLink from '../ui/ArrowLink.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

export default function MensEditorial({ content }) {
  const list = content ? content.products('products') : getByDepartment('men').slice(0, 4);
  const hero = content ? content.products('featured')[0] : getProductBySlug('cocoa-bandhgala-ensemble');
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
          <SectionLabel index="07">{content ? content.intro.eyebrow : "Menswear"}</SectionLabel>
          <h2 id="men-title" className="display men__title">{content ? content.intro.title : <>Tailored for ceremony, <em>and Tuesdays.</em></>}</h2>
          <p className="men__lead">{content ? content.intro.subtitle : "Kurtas, bandhgalas and sherwanis cut with a modern shoulder."}</p>
          {content && <SectionCTA copy={content.intro} />}
          <ul className="men__types">
            {(content ? content.texts().map((t) => [t.title, t.key, t.ctaHref]) : [['Kurtas', 'kurtas'], ['Bandhgalas', 'bandhgalas'], ['Sherwanis', 'sherwanis'], ['Accessories', 'accessories']]).map(([l, k, to]) => (
              <li key={k}><SectionLink authored={Boolean(content)} to={content ? to : `/shop/${k}`}>{l}</SectionLink></li>
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
          <SectionImage src={content ? content.media("campaign").url : images.catMen} alt={content ? content.media("campaign").altText : "Man in a cocoa bandhgala over an ivory kurta"} loading="lazy" />
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
