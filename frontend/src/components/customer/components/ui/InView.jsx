import { forwardRef, useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { inView as defaultViewport, resetMargin } from '../../utils/motion.js';

/**
 * Replayable scroll reveal with hysteresis.
 *
 * Framer's `whileInView` uses one boundary for both entering and leaving, so with
 * `once: false` an element sitting near the trigger line visibly resets and
 * flickers. This hook uses two boundaries instead:
 *   • reveal when the element crosses the (inset) trigger line, and
 *   • reset only once it is well outside the real viewport (`resetMargin`),
 * so the reset is never seen and tiny scroll jitters don't re-trigger anything.
 *
 * With prefers-reduced-motion the content is simply shown, with no replay.
 */
export function useReplayInView(ref, viewport = defaultViewport) {
  const enter = useInView(ref, { margin: viewport.margin, amount: viewport.amount });
  const present = useInView(ref, { margin: resetMargin });
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (enter) setShown(true);
    else if (!present && !viewport.once) setShown(false);
  }, [enter, present, viewport.once]);
  return shown;
}

function setRefs(node, ...refs) {
  refs.forEach((r) => {
    if (typeof r === 'function') r(node);
    else if (r) r.current = node;
  });
}

const cache = new Map();

/** Wraps a motion component so `whileInView` replays on re-entry (see hook above). */
function createInView(tag) {
  const MotionTag = motion[tag];
  const Comp = forwardRef(function InViewMotion({ initial, whileInView, viewport, ...rest }, forwarded) {
    const local = useRef(null);
    const reduce = useReducedMotion();
    const shown = useReplayInView(local, { ...defaultViewport, ...viewport });
    if (reduce) {
      return <MotionTag ref={(n) => setRefs(n, local, forwarded)} initial={false} animate={whileInView} {...rest} />;
    }
    return (
      <MotionTag
        ref={(n) => setRefs(n, local, forwarded)}
        initial={initial}
        animate={shown ? whileInView : initial}
        {...rest}
      />
    );
  });
  Comp.displayName = `InView.${tag}`;
  return Comp;
}

/** Usage: <InView.div initial={…} whileInView={…} viewport={inView} transition={…} /> */
export const InView = new Proxy({}, {
  get(_, tag) {
    if (!cache.has(tag)) cache.set(tag, createInView(tag));
    return cache.get(tag);
  },
});
