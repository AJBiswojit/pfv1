/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH
 *
 * The left-hand editorial composition over the campaign photograph: the eyebrow
 * ("TIMELESS IN EVERY DETAIL"), the three-line headline with its italic
 * champagne-gold closing phrase, the supporting paragraph, the three brand
 * highlights and the signature line at the foot.
 *
 * The text is real HTML — never baked into the image. The entrance is a plain
 * opacity + short rise (and a clipped, line-by-line headline reveal) staggered
 * over roughly a second; it plays once, never loops, and `prefers-reduced-motion`
 * renders every line at its resting position immediately. The copy stays in the
 * document at all times, so assistive technology reads the same page that the
 * eye does.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { Flower2, Gem, Heart } from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1];

const HIGHLIGHTS = [
  { key: 'craft', Icon: Flower2, title: 'Authentic', detail: 'Indian Craftsmanship' },
  { key: 'fabric', Icon: Gem, title: 'Premium', detail: 'Quality Fabrics' },
  { key: 'design', Icon: Heart, title: 'Designed', detail: 'for Modern Celebrations' },
];

export default function AuthEditorial() {
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduce ? 0 : 0.13,
        delayChildren: reduce ? 0 : 0.12,
      },
    },
  };

  const fade = {
    hidden: { opacity: 0, y: reduce ? 0 : 14 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduce ? 0 : 0.7, ease: EASE },
    },
  };

  const headline = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.11 },
    },
  };

  const line = {
    hidden: { y: reduce ? '0%' : '112%' },
    show: {
      y: '0%',
      transition: { duration: reduce ? 0 : 0.85, ease: EASE },
    },
  };

  return (
    <motion.section
      className="pf-auth-editorial"
      aria-label="PRATIKSHYA FASHION"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.p className="pf-auth-eyebrow" variants={fade}>
        TIMELESS IN EVERY DETAIL
      </motion.p>

      <motion.h1 className="pf-auth-headline" variants={headline}>
        <span className="pf-auth-line"><motion.span className="pf-auth-line__inner" variants={line}>More than</motion.span></span>
        <span className="pf-auth-line"><motion.span className="pf-auth-line__inner" variants={line}>an outfit,</motion.span></span>
        <span className="pf-auth-line pf-auth-line--accent"><motion.span className="pf-auth-line__inner" variants={line}>a part of you.</motion.span></span>
      </motion.h1>

      <motion.span className="pf-auth-rule" variants={fade} aria-hidden="true" />

      <motion.p className="pf-auth-lead" variants={fade}>
        Sarees, jewellery and ensembles that celebrate your story, crafted with care,
        tradition and a modern spirit.
      </motion.p>

      <motion.ul className="pf-auth-highlights" variants={fade}>
        {HIGHLIGHTS.map(({ key, Icon, title, detail }) => (
          <li className="pf-auth-highlight" key={key}>
            <span className="pf-auth-highlight__icon" aria-hidden="true">
              <Icon size={20} strokeWidth={1.15} />
            </span>
            <span className="pf-auth-highlight__text">
              <span className="pf-auth-highlight__title">{title}</span>
              <span className="pf-auth-highlight__detail">{detail}</span>
            </span>
          </li>
        ))}
      </motion.ul>

      <motion.div className="pf-auth-signature" variants={fade}>
        <span className="pf-auth-signature__rule" aria-hidden="true" />
        <span className="pf-auth-signature__label">PRATIKSHYA FASHION</span>
        <span className="pf-auth-signature__dots" aria-hidden="true">
          <span className="is-active" />
          <span />
          <span />
        </span>
      </motion.div>
    </motion.section>
  );
}
