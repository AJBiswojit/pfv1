/**
 * PRATIKSHYA FASHION — Atelier design system · replayable scroll reveal.
 *
 * Framer's `whileInView` uses ONE boundary for entering and leaving, so an
 * element parked on the trigger line visibly resets and flickers. This
 * module uses two:
 *
 *   · reveal when the element crosses the (inset) trigger line, and
 *   · reset only once it is well outside the real viewport,
 *
 * so the reset is never seen and scroll jitter cannot re-trigger anything.
 *
 *   <InView.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={...} />
 *
 * With `prefers-reduced-motion` the content is simply shown, once, with no
 * replay — the same rule the rest of the Atelier motion system follows.
 */

import { forwardRef, useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

import { campaign } from "../motion";
import { useMediaQuery } from "../hooks/useMediaQuery";

/**
 * `true` while the element should be in its "revealed" state.
 *
 * @param {object} ref          Ref to the watched element.
 * @param {object} [viewport]   `{ amount, margin, once }` overrides.
 */
export function useReplayInView(ref, viewport = campaign.viewport) {
  const enter = useInView(ref, { margin: viewport.margin, amount: viewport.amount });
  const present = useInView(ref, { margin: campaign.resetMargin });
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (enter) setShown(true);
    else if (!present && !viewport.once) setShown(false);
  }, [enter, present, viewport.once]);

  return shown;
}

/** Assign a node to a local ref and the caller's forwarded ref. */
function assignRefs(node, ...refs) {
  refs.forEach((ref) => {
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  });
}

const cache = new Map();

/** Wraps a motion component so `whileInView` replays on re-entry. */
function createInView(tag) {
  const MotionTag = motion[tag];

  const InViewMotion = forwardRef(function InViewMotion(
    { initial, whileInView, viewport, ...rest },
    forwarded
  ) {
    const local = useRef(null);
    const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const shown = useReplayInView(local, { ...campaign.viewport, ...viewport });

    if (reduceMotion) {
      return (
        <MotionTag
          ref={(node) => assignRefs(node, local, forwarded)}
          initial={false}
          animate={whileInView}
          {...rest}
        />
      );
    }

    return (
      <MotionTag
        ref={(node) => assignRefs(node, local, forwarded)}
        initial={initial}
        animate={shown ? whileInView : initial}
        {...rest}
      />
    );
  });

  InViewMotion.displayName = `InView.${tag}`;
  return InViewMotion;
}

/**
 * Usage: `<InView.div initial={…} whileInView={…} transition={…} />`.
 *
 * Components are created lazily and cached, so an unused tag costs nothing.
 */
export const InView = new Proxy(
  {},
  {
    get(_, tag) {
      if (typeof tag !== "string") return undefined;
      if (!cache.has(tag)) cache.set(tag, createInView(tag));
      return cache.get(tag);
    },
  }
);

export default InView;
