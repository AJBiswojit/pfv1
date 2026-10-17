import { SectionImage, SectionCTA } from '../../../storefront/home/HomepageSection';
import { LineReveal } from '../ui/Reveal.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

/**
 * 06 · Promotion — editorial campaign spread.
 * An espresso band carries the typography; a tall portrait breaks out above and
 * below it. Database-driven only: renders only when a promotion section is
 * configured and ready — every figure shown comes from the authored homepage
 * content, and without it this section renders nothing.
 */
export default function PromoBanner({ content }) {
  /* Database-driven only: without authored content this section renders nothing. */
  if (!content) return null;
  const promo = {
    label: content.intro.eyebrow,
    headline: content.intro.title.split('\n'),
    copy: content.intro.subtitle,
    image: content.media('campaign').url,
    imageAlt: content.media('campaign').altText,
    cta: { to: content.intro.ctaHref, label: content.intro.ctaLabel },
  };

  return (
    <section className="promo" aria-label={`${promo.label} campaign`}>
      {/* Espresso band: wipes in from the left edge of the viewport */}
      <InView.div
        className="promo__band"
        aria-hidden="true"
        initial={{ clipPath: 'inset(0 100% 0 0)' }}
        whileInView={{ clipPath: 'inset(0 0% 0 0)' }}
        viewport={inView}
        transition={{ duration: 1.1, ease: ease.inOut }}
      />

      <div className="container promo__wrap">
        <div className="promo__content">
          <InView.p
            className="promo__label"
            initial={{ opacity: 0, x: -14 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={inView}
            transition={{ duration: 0.6, delay: 0.45, ease: ease.out }}
          >
            <span>06</span>{promo.label}
          </InView.p>

          <LineReveal
            as="h2"
            className="promo__title"
            lines={promo.headline}
            italic={[1]}
            delay={0.55}
            stagger={0.12}
          />

          <InView.div
            className="promo__body"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={inView}
            transition={{ duration: 0.7, delay: 0.85, ease: ease.out }}
          >
            <p className="promo__copy">{promo.copy}</p>

            <div className="promo__ctas">
              <SectionCTA copy={content.intro} className="btn btn--light" />
            </div>
          </InView.div>
        </div>

        {/* Portrait breaks out above and below the band */}
        <figure className="promo__media">
          <InView.div
            className="promo__frame"
            initial={{ clipPath: 'inset(100% 0 0 0)' }}
            whileInView={{ clipPath: 'inset(0% 0 0 0)' }}
            viewport={inView}
            transition={{ duration: 1.25, delay: 0.15, ease: ease.inOut }}
          >
            <SectionImage as={InView.img}
              src={promo.image}
              alt={promo.imageAlt || ''}
              loading="lazy"
              initial={{ scale: 1.14 }}
              whileInView={{ scale: 1 }}
              viewport={inView}
              transition={{ duration: 1.9, delay: 0.15, ease: ease.out }}
            />
          </InView.div>
          <figcaption className="promo__cap">{content.media("campaign").title}</figcaption>
        </figure>
      </div>
    </section>
  );
}
