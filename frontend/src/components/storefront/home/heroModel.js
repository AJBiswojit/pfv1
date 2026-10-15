/**
 * PRATIKSHYA FASHION — Editorial hero model.
 *
 * The hero's *decisions* live here as pure functions; `HeroEditorial.jsx`
 * only renders them. Keeping the model separate is what makes the hero
 * testable without a browser, and it keeps every data decision in one place.
 *
 * ── Data contract (existing backend response, nothing invented) ──────────
 * Slides arrive from the live contract only — `GET /home` → `heroSlides`,
 * normalised by `src/data/catalog/hero.js` and resolved through the single
 * media seam (`src/services/media/mediaResolver.js`):
 *
 *   { id, image, eyebrow, title, body, cta: { label, href }, mediaId,
 *     objectPosition, tone, mobileImage? }
 *
 * ── Contract gaps (documented, NOT worked around) ───────────────────────
 * Project B authors five fields the backend does not send:
 *
 *   · `layout`      — B stores `left | panel | right | split | top` per slide.
 *                     The backend has no such field, so the hero applies B's
 *                     five-layout order deterministically by slide index.
 *                     Slide ORDER still comes from the backend response.
 *   · `lines`       — B stores a headline already broken into lines.
 *                     `editorialLines()` derives the same shape from `title`
 *                     (explicit "\n" wins; otherwise a balanced two-line
 *                     break).
 *   · `italicLine`  — B italicises one line. Derived rule: the closing line
 *                     of a two-line headline.
 *   · `kicker`      — mapped to the existing `eyebrow` field (empty by
 *                     default → the kicker row is omitted, never faked).
 *   · `imageTall` / `focalTall` — B's portrait art direction. Mapped to the
 *                     existing optional `mobileImage` field: when the backend
 *                     sends one it is used as the container-query portrait
 *                     plate, otherwise the wide plate serves every frame.
 *
 * These are frontend derivations over existing fields. No backend change is
 * proposed here and no field is assumed to exist.
 */

import {
  HOMEPAGE_HERO_THEMES,
  resolveHeroSlideImage,
  resolveHomepageHeroMedia,
} from "../../../services/media/mediaResolver";
import { campaign as campaignMotion } from "../../../design-system/motion";

/**
 * B's five editorial layouts, in the order its five slides use them:
 * `left` (copy left of the plate), `panel` (burgundy panel from the left),
 * `right` (copy low-right), `split` (blush panel from the right, jewellery
 * portrait art direction), `top` (copy band across the top).
 *
 * The backend sends no `layout`, so the order is applied by index. A hero
 * with more than five slides cycles the sequence.
 */
export const HERO_LAYOUT_SEQUENCE = ["left", "panel", "right", "split", "top"];

/** The layout for a slide at `index` in the backend response. */
export function layoutForIndex(index) {
  const total = HERO_LAYOUT_SEQUENCE.length;
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
  return HERO_LAYOUT_SEQUENCE[((safe % total) + total) % total];
}

/**
 * Break a campaign title into the two lines the editorial headline is set in.
 *
 * An explicit "\n" in the title always wins — an Admin who types one gets
 * exactly those lines. Otherwise a title of more than ten characters is
 * balanced across two lines at the word boundary that makes the two closest
 * in length, which is how B's hand-broken headlines read.
 */
export function editorialLines(title) {
  const text = String(title ?? "").trim();
  if (!text) return [];
  if (text.includes("\n")) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const words = text.split(/\s+/);
  if (words.length < 2 || text.length <= 10) return [text];

  let breakAt = 1;
  let smallestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ").length;
    const right = words.slice(index).join(" ").length;
    const difference = Math.abs(left - right);
    if (difference < smallestDifference) {
      smallestDifference = difference;
      breakAt = index;
    }
  }
  return [words.slice(0, breakAt).join(" "), words.slice(breakAt).join(" ")];
}

/** Read a media reference written as a string or as a `{ src }` record. */
function readSource(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.src || value.fallback || value.url || "";
}

/** Read the accessible description of a plate, when the register supplies one. */
function readAlt(value, registered) {
  const fromSlide = typeof value === "object" && value ? value.alt : "";
  return String(fromSlide || registered?.alt || "").trim();
}

/**
 * Read the backend CTA. A call to action is only rendered when the response
 * supplied BOTH a label and a destination — the hero never invents a
 * promotion, a product id or a link target.
 */
export function readCta(cta, href) {
  if (cta && typeof cta === "object") {
    const label = String(cta.label ?? cta.text ?? "").trim();
    const target = String(cta.href ?? cta.to ?? href ?? "").trim();
    return label && target ? { label, href: target } : null;
  }
  const label = String(cta ?? "").trim();
  const target = String(href ?? "").trim();
  return label && target ? { label, href: target } : null;
}

/**
 * A cheap signature of a slide list's CONTENTS.
 *
 * The homepage passes `heroSlides` — a live proxy over the backend response
 * whose object identity never changes as data arrives. Memoising on the array
 * identity would therefore pin the first (empty) model forever, so the hero
 * memoises on this signature instead: same slides ⇒ same key, any change to
 * an id or a plate ⇒ a new key and a re-normalised model.
 */
export function heroSlideKey(slides = []) {
  const list = Array.isArray(slides) ? slides : [];
  return list
    .map((slide) => {
      if (!slide || typeof slide !== "object") return "";
      return `${slide.id ?? ""}:${readSource(slide.image) || readSource(slide.mobileImage)}`;
    })
    .join("|");
}

/**
 * Normalise the backend slide list into the hero's render model.
 *
 * Order is preserved exactly as the backend sent it. A slide is dropped only
 * when it has no resolvable photography — the campaign is image-first, and a
 * slide with no plate would render as an empty frame. Nothing is invented to
 * fill the gap and no mock copy is substituted.
 *
 * @param {Array}  slides    Backend slides (`heroSlides`).
 * @param {Array}  heroMedia HOME_HERO register records (marketing media).
 * @returns {Array} Render-ready slides.
 */
export function normalizeHeroSlides(slides = [], heroMedia = null) {
  const list = Array.isArray(slides) ? slides : [];
  const registered = resolveHomepageHeroMedia(heroMedia);
  const usedIds = new Set();
  const model = [];

  list.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;

    const theme = HOMEPAGE_HERO_THEMES[index % HOMEPAGE_HERO_THEMES.length];
    const resolved = registered.length
      ? resolveHeroSlideImage(theme, { heroMedia, usedIds })
      : null;

    const ownPlate = readSource(raw.image);
    /* The register is consulted only when the slide brings no plate of its
       own — and only when the caller supplied a register to read. */
    const registeredPlate = !ownPlate && registered.length ? resolved : null;
    const primarySrc = ownPlate || readSource(registeredPlate);
    if (!primarySrc) return;

    const portraitSrc = readSource(raw.mobileImage ?? raw.imageTall);
    const title = String(raw.title ?? "").trim();
    const lines = editorialLines(title);
    const layout = layoutForIndex(index);
    const cta = readCta(raw.cta, raw.href);
    const position = String(raw.objectPosition ?? "").trim();

    model.push({
      id: String(raw.id ?? `hero-${index + 1}`),
      sourceIndex: index,
      layout,
      /** `panel` is the only slide whose copy sits on the burgundy panel. */
      light: layout === "panel",
      kicker: String(raw.eyebrow ?? "").trim(),
      title,
      lines,
      /** The closing line of a two-line headline is set in italic. */
      italicLine: lines.length > 1 ? lines.length - 1 : -1,
      copy: String(raw.body ?? raw.subtitle ?? "").trim(),
      cta,
      label: title || `Campaign ${index + 1}`,
      image: {
        src: primarySrc,
        alt: readAlt(raw.image, registeredPlate),
        position: position || "50% center",
      },
      portrait: portraitSrc
        ? { src: portraitSrc, alt: "", position: position || "50% 50%" }
        : null,
      /* The id of the plate actually rendered. */
      mediaId: registeredPlate?.id ?? raw.mediaId ?? null,
    });
  });

  return model;
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

/** Wrap an index into `[0, total)`. `total <= 0` yields 0. */
export function wrapIndex(index, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return ((Math.trunc(index) % total) + total) % total;
}

/**
 * Horizontal swipe decision — the same threshold the Atelier hero uses:
 * 48 px of travel that beats vertical drift by 1.3×.
 *
 * @returns {(-1|0|1)} -1 next, 1 previous, 0 no movement.
 */
export function swipeDirection(dx, dy) {
  const horizontal = Math.abs(dx) > campaignMotion.swipePx;
  const beatsVertical = Math.abs(dx) > Math.abs(dy) * campaignMotion.swipeRatio;
  if (!horizontal || !beatsVertical) return 0;
  return dx < 0 ? -1 : 1;
}

/**
 * Autoplay pause model — every condition that must stop the timer while the
 * visitor is not watching. Autoplay itself is off under reduced motion.
 */
export function autoplayPaused({
  reduceMotion = false,
  hoverPause = false,
  focusPause = false,
  tabHidden = false,
  onScreen = true,
} = {}) {
  if (reduceMotion) return true;
  return Boolean(hoverPause || focusPause || tabHidden || !onScreen);
}

export const heroModel = {
  HERO_LAYOUT_SEQUENCE,
  heroSlideKey,
  layoutForIndex,
  editorialLines,
  readCta,
  normalizeHeroSlides,
  wrapIndex,
  swipeDirection,
  autoplayPaused,
};

export default heroModel;
