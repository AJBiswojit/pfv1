import { SectionImage, SectionLink, SectionCTA } from '../../../storefront/home/HomepageSection';
import { motion } from 'framer-motion';
import { formatPrice } from '../../utils/format.js';
import SectionLabel from '../ui/SectionLabel.jsx';
import ArrowLink from '../ui/ArrowLink.jsx';
import { MaskReveal, LineReveal, FadeUp } from '../ui/Reveal.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

export default function BridalCampaign({ content }) {
  /* Database-driven only: without authored content this section renders nothing. */
  if (!content) return null;
  const curatedFrom = (key) => { const list = content.products(key); return list.length ? formatPrice(Math.min(...list.map((p) => p.price))) : null; };
  const brideFrom = curatedFrom('bride-products');
  const groomFrom = curatedFrom('groom-products');
  return (
    <section className="bridal" aria-label="The Bridal Edit — Bride and Groom">
      <div className="container bridal__head">
        <SectionLabel index="04" light>{content.intro.eyebrow}</SectionLabel>
        <LineReveal as="h2" className="display bridal__title" lines={content.intro.title.split('\n')} italic={[1]} />
        <FadeUp delay={0.25} className="bridal__intro">
          <p>{content.intro.subtitle}</p>
        </FadeUp>
        <SectionCTA copy={content.intro} />
      </div>

      <div className="container bridal__grid">
        {/* Bride: dominant, dark, image-led */}
        <article className="bridal__bride">
          <MaskReveal from="left" duration={1.3} className="bridal__bride-img">
            <SectionImage src={content.media("bride").url} alt={content.media("bride").altText} loading="lazy" style={{ objectPosition: '50% 22%' }} />
          </MaskReveal>
          <div className="bridal__bride-txt">
            <InView.p className="bridal__kicker" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ delay: 0.6, duration: 0.6 }}>
              {content.media("bride").eyebrow}
            </InView.p>
            <LineReveal as="h3" className="bridal__name" lines={content.media('bride').title.split('\n')} italic={[1]} delay={0.7} />
            <FadeUp delay={0.95}>
              <p className="bridal__copy">{content.media("bride").subtitle}{brideFrom && <> From <strong>{brideFrom}</strong>.</>}</p>
              <SectionCTA copy={content.media("bride")} />
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
          <SectionLink authored to={content.media("couple").ctaHref} aria-label="Shop the full Bridal Edit">
            <SectionImage src={content.media("couple").url} alt={content.media("couple").altText} loading="lazy" />
          </SectionLink>
          <figcaption>{content.media("couple").title}</figcaption>
        </InView.figure>

        {/* Groom: lighter, offset, reveals from the opposite direction */}
        <article className="bridal__groom">
          <div className="bridal__groom-txt">
            <InView.p className="bridal__kicker bridal__kicker--dark" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ delay: 0.5, duration: 0.6 }}>
              {content.media("groom").eyebrow}
            </InView.p>
            <LineReveal as="h3" className="bridal__name bridal__name--dark" lines={content.media('groom').title.split('\n')} italic={[1]} delay={0.6} />
            <FadeUp delay={0.85}>
              <p className="bridal__copy bridal__copy--dark">{content.media("groom").subtitle}{groomFrom && <> From <strong>{groomFrom}</strong>.</>}</p>
              <SectionCTA copy={content.media("groom")} />
            </FadeUp>
          </div>
          <MaskReveal from="right" duration={1.3} delay={0.2} className="bridal__groom-img">
            <SectionImage src={content.media("groom").url} alt={content.media("groom").altText} loading="lazy" style={{ objectPosition: '50% 18%' }} />
          </MaskReveal>
        </article>
      </div>
    </section>
  );
}
