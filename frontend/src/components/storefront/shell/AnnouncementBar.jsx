/**
 * PRATIKSHYA FASHION — storefront announcement bar (Phase 2A).
 *
 * A faithful port of Project B's announcement bar: an espresso-plum rail,
 * one widely tracked uppercase line, a half-second vertical swap between
 * messages, and a dismiss control. Nothing else — no marquee, no arrows, no
 * progress.
 *
 * WHERE THE WORDS COME FROM
 * The bar holds no copy of its own. Its messages are the PROMOTION marketing
 * placement, read by `useStorefrontAnnouncements` through the existing public
 * service (see that module for the contract). With no rows to show — a fresh
 * install, or no backend at all — the bar renders nothing. There is no
 * fallback text and no invented campaign.
 *
 * The `items` prop exists for the development-only preview harness, which
 * passes preview fixtures when no backend is reachable. Production never
 * supplies it, and the fixtures live inside the preview module.
 *
 * Behaviour:
 *   · rotates every 4.5s while more than one message is present (B's cadence);
 *   · pauses on hover and on keyboard focus;
 *   · stops rotating entirely under `prefers-reduced-motion: reduce`
 *     (the first message stays);
 *   · dismisses for the session — `sessionStorage`, so a dismissal is not a
 *     permanent preference and survives a reload in the same tab only;
 *   · `aria-live="off"`: rotating promotional copy is not announced on every
 *     change, while the text itself stays readable to assistive technology.
 */

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useMediaQuery } from "../../../design-system";
import { useStorefrontAnnouncements } from "../../../hooks/useStorefrontAnnouncements";
import { cn } from "../../../utils/cn";
import "./storefront-shell.css";

/** Session-scoped dismissal, namespaced so it cannot collide with a portal. */
const DISMISS_KEY = "pratikshya:announcement-bar";

/** B's rotation cadence. */
const ROTATE_MS = 4500;

const readDismissed = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "hidden";
  } catch {
    /* Storage can be blocked (private mode, embedded frames) — the bar then
       simply does not remember the dismissal. */
    return false;
  }
};

const rememberDismissed = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "hidden");
  } catch {
    /* See above. */
  }
};

export default function AnnouncementBar({ items = null, className = "", ...rest }) {
  /* `items` is the preview-harness seam; production leaves it undefined and
     the bar reads the placement itself. */
  const hasItems = Array.isArray(items);
  const live = useStorefrontAnnouncements({ enabled: !hasItems });
  const messages = hasItems ? items : live.announcements;

  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [dismissed, setDismissed] = useState(readDismissed);
  const [paused, setPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const count = messages.length;

  /* A shorter or replaced feed must never leave the index past the end. */
  useEffect(() => {
    setIndex(0);
  }, [count]);

  useEffect(() => {
    if (dismissed || paused || reduceMotion || count < 2) return undefined;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), ROTATE_MS);
    return () => clearInterval(timer);
  }, [dismissed, paused, reduceMotion, count]);

  const dismiss = useCallback(() => {
    rememberDismissed();
    setDismissed(true);
  }, []);

  /* Nothing to say, or already dismissed: no rail at all. */
  if (!count || dismissed) return null;

  const message = messages[Math.min(index, count - 1)];

  return (
    <div
      className={cn("pf-shell__announce", className)}
      data-announcement-count={count}
      data-announcement-source={hasItems ? "preview-fixture" : live.status}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      {...rest}
    >
      <div className="pf-shell__announce-track" aria-live="off">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={message.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.35 }}
          >
            {message.text}
          </motion.p>
        </AnimatePresence>
      </div>

      <button
        type="button"
        className="pf-shell__announce-close"
        aria-label="Dismiss announcement"
        onClick={dismiss}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
