import { motion } from 'framer-motion';
import { ease, inView } from '../../utils/motion.js';
import { InView } from './InView.jsx';

const clipFrom = {
  left: 'inset(0 100% 0 0)',
  right: 'inset(0 0 0 100%)',
  up: 'inset(100% 0 0 0)',
  down: 'inset(0 0 100% 0)',
};

/** Clip-path mask reveal for imagery. Reduced motion is handled by MotionConfig. */
export function MaskReveal({ from = 'left', delay = 0, duration = 1.15, className, children, scale = 1.12, ...rest }) {
  return (
    <InView.div
      className={className}
      initial={{ clipPath: clipFrom[from] }}
      whileInView={{ clipPath: 'inset(0 0 0 0)' }}
      viewport={inView}
      transition={{ duration, delay, ease: ease.inOut }}
      {...rest}
    >
      <InView.div
        style={{ height: '100%', width: '100%' }}
        initial={{ scale }}
        whileInView={{ scale: 1 }}
        viewport={inView}
        transition={{ duration: duration + 0.4, delay, ease: ease.out }}
      >
        {children}
      </InView.div>
    </InView.div>
  );
}

/** Line-by-line headline reveal. `lines` is an array of strings or nodes. */
export function LineReveal({ lines, as: Tag = 'h2', className, delay = 0, stagger = 0.09, italic = [], animateNow = false }) {
  const Wrap = animateNow ? motion.span : InView.span;
  const trigger = animateNow ? { animate: 'show' } : { whileInView: 'show', viewport: inView };
  return (
    <Tag className={className}>
      <Wrap style={{ display: 'block' }} initial="hide" {...trigger} transition={{ staggerChildren: stagger, delayChildren: delay }}>
        {lines.map((line, i) => (
          <span key={i} className="line-mask">
            <motion.span
              className={italic.includes(i) ? 'line-inner is-italic' : 'line-inner'}
              variants={{ hide: { y: '108%' }, show: { y: '0%' } }}
              transition={{ duration: 0.9, ease: ease.out }}
            >
              {line}
            </motion.span>
          </span>
        ))}
      </Wrap>
    </Tag>
  );
}

/** Simple fade/slide used sparingly for supporting copy. */
export function FadeUp({ delay = 0, y = 18, className, children, as = 'div', ...rest }) {
  const M = InView[as];
  return (
    <M
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={inView}
      transition={{ duration: 0.7, delay, ease: ease.out }}
      {...rest}
    >
      {children}
    </M>
  );
}
