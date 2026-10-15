/**
 * PRATIKSHYA FASHION — Editorial hero (storefront homepage).
 *
 * A control-free editorial carousel, ported from Project B's hero so the
 * storefront keeps its campaign identity (five layouts, clip-path reveal,
 * offset editorial panels, italic closing headline line) while drawing every
 * word and every photograph from the live backend contract.
 *
 * ── Behaviour ───────────────────────────────────────────────────────────
 * · Autoplay every 7 s (see `campaign.autoplayMs`); the time already elapsed
 *   on the current slide is preserved, so resuming continues the countdown.
 * · Pauses on hover, on keyboard focus, when scrolled out of view and while
 *   the tab is hidden. Disabled entirely under `prefers-reduced-motion`.
 * · ArrowLeft / ArrowRight when the hero has focus; 48 px horizontal swipe
 *   (with a vertical-rejection ratio) on touch.
 * · Crossfade with a short directional clip-path reveal; the first paint
 *   opens the stage once. Reduced motion collapses both to a plain fade.
 * · No visible counter, progress bar, pause button or prev/next control.
 *
 * ── Data ────────────────────────────────────────────────────────────────
 * Props are the existing homepage contract — `slides` (from `GET /home` →
 * `heroSlides`, normalised by `src/data/catalog/hero.js`) and `heroMedia`
 * (the HOME_HERO marketing register). All copying, layout and media
 * decisions live in `heroModel.js`; photography resolves through the single
 * media seam (`mediaResolver`), never from an authored path.
 *
 * When the backend returns no usable slide the hero renders NOTHING. There is
 * no mock copy and no fallback plate: an uncurated hero is simply absent,
 * exactly like every other backend-driven homepage seam.
 *
 * ── Integration ─────────────────────────────────────────────────────────
 * Phase 1 does not mount this component. It is not referenced by
 * `App.jsx` or `AtelierDesign.jsx`; the live homepage is untouched.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";

import { AtelierButton, useMediaQuery } from "../../../design-system";
import { campaign as campaignMotion } from "../../../design-system/motion";
import { cn } from "../../../utils/cn";
import {
  autoplayPaused,
  heroSlideKey,
  normalizeHeroSlides,
  swipeDirection,
  wrapIndex,
} from "./heroModel";
import "./hero-editorial.css";

/** One curve for every layer so image, panel and copy move as one gesture. */
const SILK = campaignMotion.ease.silk;
const SWAP = campaignMotion.swap;

/** Layouts that carry a solid editorial panel, mapped to the side it wipes in from. */
const PANELS = { panel: "inset(0 100% 0 0%)", split: "inset(0 0% 0 100%)" };

/**
 * Incoming frame: crossfade plus a short directional reveal (a 14% inset that
 * opens toward the direction of travel). The outgoing frame stays fully
 * opaque underneath until the incoming one has covered it, so there is never
 * a brightness dip or a flash of the background between slides.
 */
const frameVariants = {
  enter: (direction) => ({
    opacity: 0,
    clipPath:
      direction > 0
        ? "inset(0 0 0 14%)"
        : direction < 0
          ? "inset(0 14% 0 0)"
          : "inset(0 0% 0 0%)",
    zIndex: 2,
  }),
  center: {
    opacity: 1,
    clipPath: "inset(0 0% 0 0%)",
    zIndex: 2,
    transition: { duration: SWAP, ease: SILK },
  },
  exit: {
    zIndex: 1,
    opacity: 0.999,
    transition: { zIndex: { duration: 0 }, opacity: { duration: 0.01, delay: SWAP } },
  },
};

/** Copy choreography: generous on first load, brisk on a slide change. */
const BEAT_FIRST = campaignMotion.beat.first;
const BEAT_NEXT = campaignMotion.beat.next;

export default function HeroEditorial({ slides = [], heroMedia = null, className = "" }) {
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const sectionRef = useRef(null);
  const onScreen = useInView(sectionRef, { amount: 0.25 });

  /* The slide list may be the live `heroSlides` proxy, whose identity never
     changes as the backend response arrives. Materialise it and memoise on a
     signature of its contents — the same approach the existing hero carousel
     uses — so a late response renders instead of a stale empty model. */
  const slideItems = Array.from(slides ?? []);
  const slideKey = heroSlideKey(slideItems);
  const model = useMemo(
    () => normalizeHeroSlides(slideItems, heroMedia),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slideKey, heroMedia]
  );
  const total = model.length;

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [cycle, setCycle] = useState(0);
  const [hoverPause, setHoverPause] = useState(false);
  const [focusPause, setFocusPause] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [first, setFirst] = useState(true);
  const touch = useRef(null);

  const activeIndex = wrapIndex(index, total);
  const slide = total ? model[activeIndex] : null;
  const paused = autoplayPaused({
    reduceMotion,
    hoverPause,
    focusPause,
    tabHidden,
    onScreen,
  });

  /* The first paint gets the long, unhurried choreography. */
  useEffect(() => {
    const timer = setTimeout(() => setFirst(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  /* A hidden tab must not advance behind the visitor's back. */
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const goTo = useCallback(
    (target, movement) => {
      if (!total) return;
      setDirection(movement ?? (target > activeIndex ? 1 : -1));
      setIndex(wrapIndex(target, total));
      setCycle((count) => count + 1);
      setFirst(false);
    },
    [activeIndex, total]
  );
  const next = useCallback(() => goTo(activeIndex + 1, 1), [activeIndex, goTo]);
  const previous = useCallback(() => goTo(activeIndex - 1, -1), [activeIndex, goTo]);

  /* Autoplay timer. Pausing keeps the time already elapsed on the current
     slide, so resuming continues rather than restarting the countdown. */
  const remaining = useRef(campaignMotion.autoplayMs);
  useEffect(() => {
    remaining.current = campaignMotion.autoplayMs;
  }, [cycle]);
  useEffect(() => {
    if (paused || !total) return undefined;
    const started = performance.now();
    const timer = setTimeout(next, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        campaignMotion.minResumeMs,
        remaining.current - (performance.now() - started)
      );
    };
  }, [paused, cycle, next, total]);

  const onKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      next();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      previous();
    }
  };
  const onTouchStart = (event) => {
    const point = event.touches[0];
    if (!point) return;
    touch.current = { x: point.clientX, y: point.clientY };
  };
  const onTouchEnd = (event) => {
    if (!touch.current) return;
    const point = event.changedTouches[0];
    const movement = point
      ? swipeDirection(point.clientX - touch.current.x, point.clientY - touch.current.y)
      : 0;
    if (movement === -1) next();
    if (movement === 1) previous();
    touch.current = null;
  };

  /* An uncurated hero renders nothing. No invented copy, no fallback plate. */
  if (!total || !slide) return null;

  const beat = first ? BEAT_FIRST : BEAT_NEXT;
  /* The single backend CTA is rendered once, in B's solid burgundy treatment
     (blush on the burgundy panel). `cn` lets the design-system button's
     colours be specialised without adding a second button component. */
  const ctaClasses = slide.light
    ? "bg-blush-canvas text-burgundy hover:bg-blush-warm"
    : "bg-burgundy text-blush-canvas hover:bg-burgundy-deep";

  return (
    <section
      ref={sectionRef}
      className={cn("pf-hero", `pf-hero--${slide.layout}`, className)}
      data-active-slide={slide.id}
      data-slide-layout={slide.layout}
      aria-roledescription="carousel"
      aria-label="Featured campaigns — use the left and right arrow keys to change campaign"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      tabIndex={0}
      onMouseEnter={() => setHoverPause(true)}
      onMouseLeave={() => setHoverPause(false)}
      /* Pause for keyboard focus only — a mouse click or tap on the hero must
         not stop autoplay for good. */
      onFocusCapture={(event) => {
        if (event.target.matches?.(":focus-visible")) setFocusPause(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusPause(false);
      }}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Campaign imagery — the first paint uses one mask reveal, every later
          slide crossfades with a short directional reveal. */}
      <motion.div
        className="pf-hero__stage"
        initial={reduceMotion ? false : { clipPath: "inset(0 0 0 38%)" }}
        animate={{ clipPath: "inset(0 0 0 0%)" }}
        transition={{ duration: 1.5, ease: campaignMotion.ease.inOut }}
      >
        <AnimatePresence initial={false} custom={reduceMotion ? 0 : direction}>
          <motion.div
            key={slide.id}
            className={cn("pf-hero__img", `pf-hero__img--${slide.layout}`)}
            custom={reduceMotion ? 0 : direction}
            variants={frameVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {/* The inner settle (scale) lives on the photograph so it never
                competes with the frame's fade and reveal. */}
            <motion.img
              className={slide.portrait ? "pf-hero__pic--wide" : undefined}
              src={slide.image.src}
              alt={slide.image.alt}
              style={{ objectPosition: slide.image.position }}
              initial={reduceMotion ? false : { scale: first ? 1.14 : 1.05 }}
              animate={{ scale: 1 }}
              transition={{
                duration: reduceMotion ? 0 : first ? 2.2 : SWAP + 0.6,
                ease: campaignMotion.ease.out,
              }}
              fetchPriority={activeIndex === 0 ? "high" : undefined}
            />
            {/* Optional portrait art direction, chosen by a container query on
                the visible frame's aspect ratio. Only present when the
                backend supplied a second plate. */}
            {slide.portrait ? (
              <img
                className="pf-hero__pic--tall"
                src={slide.portrait.src}
                alt=""
                loading="lazy"
                style={{ objectPosition: slide.portrait.position }}
              />
            ) : null}
            {/* The scrim travels with its own photograph, so layouts never
                swap gradients abruptly. */}
            <div className={cn("pf-hero__scrim", `pf-hero__scrim--${slide.layout}`)} />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Offset editorial panels — burgundy from the left, blush from the right. */}
      <AnimatePresence initial={false}>
        {PANELS[slide.layout] ? (
          <motion.div
            key={`panel-${slide.id}`}
            className={cn("pf-hero__panelbg", `pf-hero__panelbg--${slide.layout}`)}
            initial={reduceMotion ? { opacity: 0 } : { clipPath: PANELS[slide.layout] }}
            animate={{ opacity: 1, clipPath: "inset(0 0% 0 0%)" }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0.5, ease: SILK } }
                : { clipPath: PANELS[slide.layout], transition: { duration: 0.7, ease: SILK } }
            }
            transition={{ duration: 1, ease: SILK }}
          />
        ) : null}
      </AnimatePresence>

      <div className="pf-hero__content">
        {/* Invisible sizers (stacked mobile layout only): reserve the tallest
            slide's text height so changing slides never shifts the page below
            the hero. */}
        {model.map((candidate) => (
          <div
            key={`sizer-${candidate.id}`}
            className={cn(
              "pf-hero__text",
              `pf-hero__text--${candidate.layout}`,
              "pf-hero__sizer"
            )}
            aria-hidden="true"
          >
            {candidate.kicker ? (
              <p className="pf-hero__kicker">
                <span className="pf-hero__kicker-line" />
                {candidate.kicker}
              </p>
            ) : null}
            <div className="pf-hero__title">
              {candidate.lines.map((line) => (
                <span key={line} className="pf-hero__line-mask">
                  <span className="pf-hero__line-inner">{line}</span>
                </span>
              ))}
            </div>
            <div className="pf-hero__body">
              <p className="pf-hero__copy">{candidate.copy}</p>
              <div className="pf-hero__ctas">
                {candidate.cta ? (
                  <span className="pf-hero__cta-ghost">{candidate.cta.label}</span>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        <AnimatePresence mode="wait" initial>
          <motion.div
            key={slide.id}
            className={cn(
              "pf-hero__text",
              `pf-hero__text--${slide.layout}`,
              slide.light && "pf-hero__text--light"
            )}
            role="group"
            aria-roledescription="slide"
            aria-label={`${activeIndex + 1} of ${total}: ${slide.label}`}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.3, ease: SILK } }}
          >
            {slide.kicker ? (
              <motion.p
                className="pf-hero__kicker"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: beat.kicker, duration: 0.6, ease: SILK }}
              >
                <span className="pf-hero__kicker-line" />
                {slide.kicker}
              </motion.p>
            ) : null}

            {/* The headline is the slide's accessible name; each line rises out
                of its own mask, and the closing line carries the campaign italic. */}
            {slide.lines.length ? (
              <h1 className="pf-hero__title">
                <motion.span
                  style={{ display: "block" }}
                  initial={reduceMotion ? false : "hide"}
                  animate="show"
                  transition={{ staggerChildren: 0.09, delayChildren: beat.head }}
                >
                  {slide.lines.map((line, lineIndex) => (
                    <span key={line} className="pf-hero__line-mask">
                      <motion.span
                        className={cn(
                          "pf-hero__line-inner",
                          lineIndex === slide.italicLine && "pf-hero__line-inner--italic"
                        )}
                        variants={{ hide: { y: "104%" }, show: { y: "0%" } }}
                        transition={{ duration: beat.line, ease: campaignMotion.ease.out }}
                      >
                        {line}
                      </motion.span>
                    </span>
                  ))}
                </motion.span>
              </h1>
            ) : null}

            <div className="pf-hero__body">
              {slide.copy ? (
                <motion.p
                  className="pf-hero__copy"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: beat.copy, duration: 0.7, ease: campaignMotion.ease.out }}
                >
                  {slide.copy}
                </motion.p>
              ) : null}

              {slide.cta ? (
                <motion.div
                  className="pf-hero__ctas"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: beat.cta, duration: 0.6, ease: campaignMotion.ease.out }}
                >
                  <AtelierButton
                    href={slide.cta.href}
                    variant="primary"
                    size="md"
                    className={ctaClasses}
                    data-hero-cta={slide.id}
                  >
                    {slide.cta.label}
                  </AtelierButton>
                </motion.div>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Screen-reader status: announced only while autoplay is paused (e.g.
          keyboard focus), never every seven seconds. */}
      <p className="pf-hero__status sr-only" aria-live={paused ? "polite" : "off"} aria-atomic="true">
        Campaign {activeIndex + 1} of {total}: {slide.label}
      </p>
    </section>
  );
}
