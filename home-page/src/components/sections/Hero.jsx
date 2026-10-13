import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { heroConfig, heroSlides } from '../../data/index.js';
import Button from '../ui/Button.jsx';
import ArrowLink from '../ui/ArrowLink.jsx';
import { cx } from '../../utils/format.js';
import { ease } from '../../utils/motion.js';

/*
 * Hero carousel — control-free editorial presentation.
 * Navigation: autoplay (timer below), swipe, and ←/→ when the hero (or anything in it) has focus.
 * Autoplay pauses on hover, on keyboard focus, when the hero is scrolled out of view or the tab is
 * hidden, and is disabled entirely for prefers-reduced-motion.
 */

// Slide-change timing. One curve for every layer so image, panel and copy move as one gesture.
const SWAP = 1.25; // seconds for the incoming image to fully settle
const silk = [0.45, 0, 0.15, 1]; // slow-in / long, soft-out

// Layouts that carry a solid editorial panel, mapped to the side it wipes in from.
const PANELS = { panel: 'inset(0 100% 0 0%)', split: 'inset(0 0% 0 100%)' };

// Incoming frame: crossfade + a short directional reveal (a 14% inset that opens toward the
// direction of travel). The outgoing frame stays fully opaque underneath until the incoming one
// has covered it, so there is never a brightness dip or a flash of the background between slides.
const frameVariants = {
  // dir 0 = reduced motion: plain crossfade, no spatial reveal.
  enter: (dir) => ({ opacity: 0, clipPath: dir > 0 ? 'inset(0 0 0 14%)' : dir < 0 ? 'inset(0 14% 0 0)' : 'inset(0 0% 0 0%)', zIndex: 2 }),
  center: { opacity: 1, clipPath: 'inset(0 0% 0 0%)', zIndex: 2, transition: { duration: SWAP, ease: silk } },
  // Drop beneath the incoming frame immediately; stay mounted (opaque) until it has fully covered us.
  exit: { zIndex: 1, opacity: 0.999, transition: { zIndex: { duration: 0 }, opacity: { duration: 0.01, delay: SWAP } } },
};

export default function Hero() {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const onScreen = useInView(ref, { amount: 0.25 });
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [cycle, setCycle] = useState(0);
  const [hoverPause, setHoverPause] = useState(false);
  const [focusPause, setFocusPause] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [first, setFirst] = useState(true);
  const touch = useRef(null);
  const total = heroSlides.length;
  const slide = heroSlides[index];
  const autoplay = !reduce && heroConfig.autoplayMs > 0;
  const paused = hoverPause || focusPause || tabHidden || !onScreen || !autoplay;

  useEffect(() => { const t = setTimeout(() => setFirst(false), 2200); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const goTo = useCallback((i, d) => {
    setDir(d ?? (i > index ? 1 : -1));
    setIndex((i + total) % total);
    setCycle((c) => c + 1);
    setFirst(false);
  }, [index, total]);
  const next = useCallback(() => goTo(index + 1, 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1, -1), [goTo, index]);

  // Autoplay timer (replaces the old progress-bar animation). Pausing keeps the time already
  // elapsed on the current slide, so resuming continues rather than restarting the countdown.
  const remaining = useRef(heroConfig.autoplayMs);
  useEffect(() => { remaining.current = heroConfig.autoplayMs; }, [cycle]);
  useEffect(() => {
    if (paused) return undefined;
    const started = performance.now();
    const t = setTimeout(next, remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(400, remaining.current - (performance.now() - started));
    };
  }, [paused, cycle, next]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  };
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x; const dy = t.clientY - touch.current.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) (dx < 0 ? next : prev)();
    touch.current = null;
  };

  // Copy choreography: generous on first load, brisk on slide change (CTAs usable in ~1s).
  const d = first
    ? { kicker: 0.6, head: 0.75, copy: 1.15, cta: 1.3, line: 1.05 }
    : { kicker: 0.05, head: 0.1, copy: 0.38, cta: 0.5, line: 0.85 };
  const light = slide.layout === 'panel';

  return (
    <section
      ref={ref}
      className={cx('hero', `hero--${slide.layout}`)}
      data-active-slide={slide.id}
      aria-roledescription="carousel"
      aria-label="Featured campaigns — use the left and right arrow keys to change campaign"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      tabIndex={0}
      onMouseEnter={() => setHoverPause(true)}
      onMouseLeave={() => setHoverPause(false)}
      // Pause for keyboard focus only — a mouse click or tap on the hero must not stop autoplay for good.
      onFocusCapture={(e) => { if (e.target.matches?.(':focus-visible')) setFocusPause(true); }}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocusPause(false); }}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Campaign imagery — first load uses a mask reveal, then crossfade + directional reveal */}
      <motion.div
        className="hero__stage"
        initial={reduce ? false : { clipPath: 'inset(0 0 0 38%)' }}
        animate={{ clipPath: 'inset(0 0 0 0%)' }}
        transition={{ duration: 1.5, ease: ease.inOut }}
      >
        <AnimatePresence initial={false} custom={reduce ? 0 : dir}>
          <motion.div
            key={slide.id}
            className={cx('hero__img', `hero__img--${slide.layout}`)}
            custom={reduce ? 0 : dir}
            variants={frameVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {/* Inner settle (scale) lives on the image so it never competes with the frame's fade/reveal */}
            <motion.img
              className={slide.imageTall ? 'hero__pic--wide' : undefined}
              src={slide.image}
              alt=""
              style={{ objectPosition: slide.focal }}
              initial={{ scale: first ? 1.14 : 1.05 }}
              animate={{ scale: 1 }}
              transition={{ duration: first ? 2.2 : SWAP + 0.6, ease: ease.out }}
              fetchpriority={index === 0 ? 'high' : undefined}
            />
            {/* Optional portrait art-direction, chosen by a container query on the frame's aspect ratio */}
            {slide.imageTall && (
              <img className="hero__pic--tall" src={slide.imageTall} alt="" loading="lazy" style={{ objectPosition: slide.focalTall }} />
            )}
            {/* Scrim travels with its own image, so layouts never swap gradients abruptly */}
            <div className={cx('hero__scrim', `hero__scrim--${slide.layout}`)} />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Offset editorial panels: espresso from the left (bridal), blush-beige from the right (jewellery) */}
      <AnimatePresence initial={false}>
        {PANELS[slide.layout] && (
          <motion.div
            key={`panel-${slide.layout}`}
            className={cx('hero__panelbg', `hero__panelbg--${slide.layout}`)}
            initial={reduce ? { opacity: 0 } : { clipPath: PANELS[slide.layout] }}
            animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0%)' }}
            exit={reduce
              ? { opacity: 0, transition: { duration: 0.5, ease: silk } }
              : { clipPath: PANELS[slide.layout], transition: { duration: 0.7, ease: silk } }}
            transition={{ duration: 1, ease: silk }}
          />
        )}
      </AnimatePresence>

      <div className="hero__content container">
        {/* Invisible sizers (stacked mobile layout only): reserve the tallest slide's text height so
            changing slides never shifts the page below the hero. */}
        {heroSlides.map((s) => (
          <div key={`sizer-${s.id}`} className={cx('hero__text', `hero__text--${s.layout}`, 'hero__sizer')} aria-hidden="true">
            <p className="hero__kicker"><span className="hero__kicker-line" />{s.kicker}</p>
            <div className="hero__title">{s.lines.map((l) => <span key={l} className="line-mask"><span className="line-inner">{l}</span></span>)}</div>
            <div className="hero__body">
              <p className="hero__copy">{s.copy}</p>
              <div className="hero__ctas"><span className="btn btn--solid">{s.primary.label}</span><span className="arrow-link">{s.secondary.label}<svg width="22" height="10" aria-hidden="true" /></span></div>
            </div>
          </div>
        ))}
        <AnimatePresence mode="wait" initial={true}>
          <motion.div
            key={slide.id}
            className={cx('hero__text', `hero__text--${slide.layout}`, light && 'is-light')}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${total}: ${slide.label}`}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.3, ease: silk } }}
          >
            <motion.p className="hero__kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: d.kicker, duration: 0.6, ease: silk }}>
              <span className="hero__kicker-line" />{slide.kicker}
            </motion.p>
            <h1 className="hero__title">
              <motion.span style={{ display: 'block' }} initial="hide" animate="show" transition={{ staggerChildren: 0.09, delayChildren: d.head }}>
                {slide.lines.map((line, i) => (
                  <span key={line} className="line-mask">
                    <motion.span
                      className={cx('line-inner', i === slide.italicLine && 'is-italic')}
                      variants={{ hide: { y: '104%' }, show: { y: '0%' } }}
                      transition={{ duration: d.line, ease: ease.out }}
                    >
                      {line}
                    </motion.span>
                  </span>
                ))}
              </motion.span>
            </h1>
            <div className="hero__body">
              <motion.p className="hero__copy" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: d.copy, duration: 0.7, ease: ease.out }}>
                {slide.copy}
              </motion.p>
              <motion.div className="hero__ctas" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: d.cta, duration: 0.6, ease: ease.out }}>
                <Button to={slide.primary.to} variant={light ? 'light' : 'solid'}>{slide.primary.label}</Button>
                <ArrowLink to={slide.secondary.to} light={light}>{slide.secondary.label}</ArrowLink>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Screen-reader status: announced only while autoplay is paused (e.g. keyboard focus), never every 7s */}
      <p className="sr-only" aria-live={paused ? 'polite' : 'off'} aria-atomic="true">
        Campaign {index + 1} of {total}: {slide.label}
      </p>
    </section>
  );
}
