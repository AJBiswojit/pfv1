/**
 * PRATIKSHYA FASHION — Atelier design system · editorial reveals.
 *
 * Three reveal primitives, ported from Project B so the storefront keeps its
 * editorial entrance language without importing B's global stylesheet:
 *
 *   MaskReveal  clip-path mask that opens across an image plate.
 *   LineReveal  headline revealed line by line, each line rising out of its
 *               own mask (the campaign's signature headline entrance).
 *   FadeUp      the quiet fade/slide used for supporting copy.
 *
 * Everything is expressed with Framer Motion props and inline styles — there
 * are no global class names, so nothing here can reach an Admin or Employee
 * surface. `prefers-reduced-motion` is handled by `InView` (content is shown
 * without replay) and by `useEnter`-style static presets.
 */

import { motion, useReducedMotion } from "framer-motion";

import { campaign } from "../motion";
import { typography } from "../typography";
import { InView } from "./InView";
import { useMediaQuery } from "../hooks/useMediaQuery";

/** Clip-path origin per reveal direction. */
const clipFrom = {
  left: "inset(0 100% 0 0)",
  right: "inset(0 0 0 100%)",
  up: "inset(100% 0 0 0)",
  down: "inset(0 0 100% 0)",
};

/** Inline style of a headline line mask — replaces B's global `.line-mask`. */
const maskStyle = {
  display: "block",
  overflow: "hidden",
  paddingBottom: "0.08em",
  marginBottom: "-0.08em",
};

/** Inline style of the moving inner span — replaces B's global `.line-inner`. */
const innerStyle = { display: "block", willChange: "transform" };

/**
 * Clip-path mask reveal for imagery.
 *
 * @param {("left"|"right"|"up"|"down")} [from="left"] Direction the mask opens from.
 * @param {number} [scale=1.12] Inner settle scale — the image relaxes into place.
 */
export function MaskReveal({
  from = "left",
  delay = 0,
  duration = 1.15,
  scale = 1.12,
  className = "",
  children,
  ...rest
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <InView.div
      className={className}
      initial={{ clipPath: clipFrom[from] ?? clipFrom.left }}
      whileInView={{ clipPath: "inset(0 0 0 0)" }}
      viewport={campaign.viewport}
      transition={{ duration, delay, ease: campaign.ease.inOut }}
      {...rest}
    >
      <InView.div
        style={{ height: "100%", width: "100%" }}
        initial={{ scale }}
        whileInView={{ scale: 1 }}
        viewport={campaign.viewport}
        transition={{ duration: duration + 0.4, delay, ease: campaign.ease.out }}
      >
        {children}
      </InView.div>
    </InView.div>
  );
}

/**
 * Line-by-line headline reveal.
 *
 * @param {Array} lines      Lines (strings or nodes).
 * @param {Array<number>} italic Indices set in italic.
 * @param {boolean} animateNow Play immediately instead of on scroll.
 */
export function LineReveal({
  lines = [],
  as: Tag = "h2",
  className = "",
  delay = 0,
  stagger = 0.09,
  italic = [],
  animateNow = false,
}) {
  const reduceMotion = useReducedMotion();
  const Wrapper = animateNow || reduceMotion ? motion.span : InView.span;
  const trigger = animateNow || reduceMotion ? { animate: "show" } : { whileInView: "show" };

  return (
    <Tag className={className}>
      <Wrapper
        style={{ display: "block" }}
        initial={reduceMotion ? false : "hide"}
        {...trigger}
        transition={{ staggerChildren: stagger, delayChildren: delay }}
      >
        {lines.map((line, index) => (
          <span key={`${index}-${String(line)}`} style={maskStyle}>
            <motion.span
              style={innerStyle}
              className={italic.includes(index) ? typography.campaign.displayItalic : undefined}
              variants={{ hide: { y: "108%" }, show: { y: "0%" } }}
              transition={{ duration: 0.9, ease: campaign.ease.out }}
            >
              {line}
            </motion.span>
          </span>
        ))}
      </Wrapper>
    </Tag>
  );
}

/**
 * Fade/slide for supporting copy.
 *
 * `as` picks the motion element to render (`p`, `div`, `span`, ...).
 */
export function FadeUp({ delay = 0, y = 18, className = "", children, as = "div", ...rest }) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const MotionTag = motion[as];

  if (reduceMotion) {
    return (
      <MotionTag className={className} initial={false} {...rest}>
        {children}
      </MotionTag>
    );
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={campaign.viewport}
      transition={{ duration: 0.7, delay, ease: campaign.ease.out }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

export default MaskReveal;
