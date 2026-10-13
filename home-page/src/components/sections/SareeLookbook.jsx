import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { images, sareeCollections, sareeLookbook } from '../../data/index.js';
import { getByIds, getProductsFor } from '../../services/catalog.js';
import ProductCard from '../product/ProductCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import ArrowLink, { Arrow } from '../ui/ArrowLink.jsx';
import { MaskReveal, LineReveal, FadeUp } from '../ui/Reveal.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

export default function SareeLookbook() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const stripX = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const wordX = useTransform(scrollYProgress, [0, 1], [-30, 40]);
  // Two sarees + two pairing pieces, curated for the drape.
  const row = getByIds(['p02', 'p01', 'p14', 'p17']);

  return (
    <section className="saree" ref={ref} aria-label="The Saree Edits">
      <div className="container saree__grid">
        <div className="saree__visual">
          <MaskReveal from="left" className="saree__main">
            <img src={images.sareeEditorial} alt="Model in a terracotta Kanjeevaram silk saree holding out the pallu" loading="lazy" style={{ objectPosition: '50% 30%' }} />
          </MaskReveal>
          <motion.span className="saree__word" style={{ x: wordX }} aria-hidden="true">Saree</motion.span>
          <motion.div className="saree__strip" style={{ x: stripX }}>
            {sareeLookbook.map((l, i) => (
              <InView.figure
                key={l.caption}
                className="saree__frame"
                initial={{ clipPath: 'inset(0 100% 0 0)' }}
                whileInView={{ clipPath: 'inset(0 0% 0 0)' }}
                viewport={inView}
                transition={{ duration: 0.9, delay: 0.35 + i * 0.12, ease: ease.inOut }}
              >
                <img src={l.image} alt="" loading="lazy" style={{ objectPosition: l.focal }} />
                <figcaption>{String(i + 1).padStart(2, '0')} · {l.caption}</figcaption>
              </InView.figure>
            ))}
          </motion.div>
        </div>

        <div className="saree__copy">
          <SectionLabel index="03">The Saree Edits</SectionLabel>
          <LineReveal as="h2" lines={['Six yards,', 'unhurried.']} italic={[1]} className="display saree__title" />
          <FadeUp delay={0.2}>
            <p className="saree__lead">
              Handwoven silks from Varanasi and Kanchipuram, light handloom cottons and modern pre-draped silhouettes — each
              listed with its weave and region, so you know exactly what you’re draping.
            </p>
          </FadeUp>
          <ol className="saree__list">
            {sareeCollections.map((c, i) => {
              const n = getProductsFor(c.key).length;
              return (
                <InView.li
                  key={c.key}
                  initial={{ opacity: 0, x: 24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={inView}
                  transition={{ duration: 0.6, delay: 0.25 + i * 0.07, ease: ease.out }}
                >
                  <Link to={`/shop/${c.key}`} className="saree__row">
                    <span className="saree__idx">0{i + 1}</span>
                    <span className="saree__name">{c.label}</span>
                    <span className="saree__note">{c.note}</span>
                    <span className="saree__count">{n ? `${n} ${n === 1 ? 'piece' : 'pieces'}` : 'Arriving soon'}</span>
                    <Arrow className="saree__arrow" />
                  </Link>
                </InView.li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="container saree__products">
        <div className="saree__products-head">
          <h3 className="subhead">Complete the drape</h3>
          <p>Two silks, and the pieces we’d wear with them.</p>
          <ArrowLink to="/shop/sarees">All Sarees</ArrowLink>
        </div>
        <div className="grid-4 grid-4--tight">
          {row.map((p, i) => (
            <FadeUp key={p.id} delay={i * 0.06} y={24}><ProductCard product={p} /></FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
