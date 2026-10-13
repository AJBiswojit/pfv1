import { Link } from '../../router/index.jsx';
import { motion } from 'framer-motion';
import { images } from '../../data/index.js';
import { getProductsFor } from '../../services/catalog.js';
import { formatPrice } from '../../utils/format.js';
import SectionLabel from '../ui/SectionLabel.jsx';
import Button from '../ui/Button.jsx';
import ArrowLink from '../ui/ArrowLink.jsx';
import { MaskReveal, LineReveal, FadeUp } from '../ui/Reveal.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

const fromPrice = (key) => {
  const list = getProductsFor(key);
  return list.length ? formatPrice(Math.min(...list.map((p) => p.price))) : null;
};

export default function BridalCampaign() {
  const brideFrom = fromPrice('the-bride');
  const groomFrom = fromPrice('the-groom');
  return (
    <section className="bridal" aria-label="The Bridal Edit — Bride and Groom">
      <div className="container bridal__head">
        <SectionLabel index="04" light>The Bridal Edit · Bride &amp; Groom</SectionLabel>
        <LineReveal as="h2" className="display bridal__title" lines={['Composed', 'as a pair.']} italic={[1]} />
        <FadeUp delay={0.25} className="bridal__intro">
          <p>Zardozi worked by hand over weeks, tone-on-tone brocades and heirloom jewellery — styled together, sold separately.</p>
        </FadeUp>
      </div>

      <div className="container bridal__grid">
        {/* Bride: dominant, dark, image-led */}
        <article className="bridal__bride">
          <MaskReveal from="left" duration={1.3} className="bridal__bride-img">
            <img src={images.bride} alt="Bride in a crimson zardozi lehenga with kundan jewellery" loading="lazy" style={{ objectPosition: '50% 22%' }} />
          </MaskReveal>
          <div className="bridal__bride-txt">
            <InView.p className="bridal__kicker" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ delay: 0.6, duration: 0.6 }}>
              I · The Bride
            </InView.p>
            <LineReveal as="h3" className="bridal__name" lines={['Crimson,', 'by hand.']} italic={[1]} delay={0.7} />
            <FadeUp delay={0.95}>
              <p className="bridal__copy">Raw silk lehengas in zardozi and dabka, with polki-style jewellery to match.{brideFrom && <> From <strong>{brideFrom}</strong>.</>}</p>
              <Button to="/shop/the-bride" variant="light">Shop the Bride</Button>
            </FadeUp>
          </div>
        </article>

        {/* The pair: an arch-shaped inset bridging both panels */}
        <InView.figure
          className="bridal__pair"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={inView}
          transition={{ duration: 1, delay: 0.5, ease: ease.out }}
        >
          <Link to="/shop/bridal" aria-label="Shop the full Bridal Edit">
            <img src={images.couple} alt="Bride and groom styled together" loading="lazy" />
          </Link>
          <figcaption>The wedding pair</figcaption>
        </InView.figure>

        {/* Groom: lighter, offset, reveals from the opposite direction */}
        <article className="bridal__groom">
          <div className="bridal__groom-txt">
            <InView.p className="bridal__kicker bridal__kicker--dark" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ delay: 0.5, duration: 0.6 }}>
              II · The Groom
            </InView.p>
            <LineReveal as="h3" className="bridal__name bridal__name--dark" lines={['Ivory,', 'tone on tone.']} italic={[1]} delay={0.6} />
            <FadeUp delay={0.85}>
              <p className="bridal__copy bridal__copy--dark">Champagne sherwanis, soft safas and pearl malas — ceremony without the shout.{groomFrom && <> From <strong>{groomFrom}</strong>.</>}</p>
              <ArrowLink to="/shop/the-groom">Shop the Groom</ArrowLink>
            </FadeUp>
          </div>
          <MaskReveal from="right" duration={1.3} delay={0.2} className="bridal__groom-img">
            <img src={images.groom} alt="Groom in an ivory embroidered sherwani with a blush safa" loading="lazy" style={{ objectPosition: '50% 18%' }} />
          </MaskReveal>
        </article>
      </div>
    </section>
  );
}
