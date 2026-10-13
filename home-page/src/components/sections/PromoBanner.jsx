import { motion } from 'framer-motion';
import { Tag } from 'lucide-react';
import { getActivePromotion } from '../../data/index.js';
import { useShop } from '../../state/ShopContext.jsx';
import { useUI } from '../../state/UIContext.jsx';
import { formatDate } from '../../utils/format.js';
import Button from '../ui/Button.jsx';
import { LineReveal } from '../ui/Reveal.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

/**
 * 06 · Festive offer — editorial campaign spread.
 * An espresso band carries the typography; a tall portrait breaks out above and
 * below it. Renders only when a promotion is configured and active — every
 * figure shown (percentage, code, end date, terms) comes from the promo config.
 */
export default function PromoBanner() {
  const promo = getActivePromotion();
  const { applyPromo, promoCode } = useShop();
  const { toast, openCart } = useUI();
  if (!promo) return null;
  const applied = promoCode === promo.code;

  const onCode = () => {
    if (applied) { openCart(); return; }
    const res = applyPromo(promo.code);
    toast(res.ok ? `${promo.code} applied to your bag` : res.message, res.ok ? { label: 'View bag', onClick: openCart } : null);
  };

  const ledger = [
    { k: 'Offer', v: `${promo.discountPercent}% off` },
    { k: 'Code', v: promo.code },
    { k: 'Valid until', v: formatDate(promo.endsAt) },
  ];

  return (
    <section className="promo" aria-label={`${promo.label} offer`}>
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
            <span>06</span>{promo.label}{promo.isSample && <em>Sample offer</em>}
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

            <dl className="promo__ledger">
              {ledger.map((row) => (
                <div key={row.k}>
                  <dt>{row.k}</dt>
                  <dd>{row.v}</dd>
                </div>
              ))}
            </dl>

            <div className="promo__ctas">
              <Button to={promo.cta.to} variant="light">{promo.cta.label}</Button>
              <button type="button" className="promo__code" onClick={onCode} aria-pressed={applied}>
                <Tag size={14} strokeWidth={1.4} />
                {applied ? <>Code <strong>{promo.code}</strong> applied · View bag</> : <>Apply <strong>{promo.code}</strong></>}
              </button>
            </div>
            <p className="promo__terms">{promo.terms}</p>
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
            <InView.img
              src={promo.image}
              alt={promo.imageAlt || ''}
              loading="lazy"
              style={{ objectPosition: promo.focal }}
              initial={{ scale: 1.14 }}
              whileInView={{ scale: 1 }}
              viewport={inView}
              transition={{ duration: 1.9, delay: 0.15, ease: ease.out }}
            />
          </InView.div>
          <InView.span
            className="promo__num"
            aria-hidden="true"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={inView}
            transition={{ duration: 0.9, delay: 0.9, ease: ease.out }}
          >
            {promo.discountPercent}<small>%</small>
          </InView.span>
          <figcaption className="promo__cap">{promo.label} · The Festive Edit</figcaption>
        </figure>
      </div>
    </section>
  );
}
