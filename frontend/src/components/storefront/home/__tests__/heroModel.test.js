/**
 * Phase 1 — editorial hero model.
 *
 * The hero's decisions (layout sequence, headline line breaking, media
 * resolution, navigation maths, autoplay pause model) are pure functions in
 * `heroModel.js`. They are pinned here so the rendered component cannot drift
 * from the contract without a test failing.
 *
 * Every fixture below uses the REAL homepage contract shape
 * (`{ id, image, eyebrow, title, body, cta: { label, href }, mediaId }`) —
 * no mock catalogue, no invented commerce data, no literal asset path.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HERO_LAYOUT_SEQUENCE,
  autoplayPaused,
  editorialLines,
  heroSlideKey,
  layoutForIndex,
  normalizeHeroSlides,
  readCta,
  swipeDirection,
  wrapIndex,
} from "../heroModel.js";

/** The exact slide the homepage mapper (`src/data/catalog/hero.js`) builds. */
const slide = (overrides = {}) => ({
  id: "hero-1",
  image: "/api/v1/media/objects/hero/hero001.avif",
  eyebrow: "",
  title: "Bridal Couture",
  body: "Crafted for your most special day",
  cta: { label: "View Bridal", href: "/bridal" },
  objectPosition: "50% center",
  tone: "light",
  mediaId: "hero/hero001.avif",
  ...overrides,
});

/** A HOME_HERO register record exactly as `mediaResolver` admits it. */
const heroMediaRecord = (index) => ({
  id: `hero-media-${index}`,
  placement: "HOME_HERO",
  usageRoles: ["HERO"],
  mappingMethod: "HOMEPAGE_HERO_REGISTER",
  productId: null,
  status: "ACTIVE",
  url: `/api/v1/media/objects/hero/hero00${index}.avif`,
  sortOrder: index,
  alt: `Campaign plate ${index}`,
  categoryId: "hero",
});

/* ------------------------------------------------------------------ */
/* Layout sequence (documented contract gap)                           */
/* ------------------------------------------------------------------ */

test("the five editorial layouts are applied in Project B's order", () => {
  assert.deepEqual(HERO_LAYOUT_SEQUENCE, ["left", "panel", "right", "split", "top"]);
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(layoutForIndex),
    ["left", "panel", "right", "split", "top"]
  );
});

test("a hero longer than five slides cycles the layouts without inventing one", () => {
  assert.equal(layoutForIndex(5), "left");
  assert.equal(layoutForIndex(6), "panel");
  assert.equal(layoutForIndex(-1), "top");
  assert.equal(layoutForIndex(Number.NaN), "left");
});

/* ------------------------------------------------------------------ */
/* Headline line breaking (contract gap: B authors `lines`)            */
/* ------------------------------------------------------------------ */

test("an explicit newline in the backend title always wins", () => {
  assert.deepEqual(editorialLines("Two Hearts,\nOne Heirloom."), ["Two Hearts,", "One Heirloom."]);
});

test("a multi-word title is balanced across two lines", () => {
  assert.deepEqual(editorialLines("Bridal Couture"), ["Bridal", "Couture"]);
  assert.deepEqual(editorialLines("Festive Elegance"), ["Festive", "Elegance"]);
  assert.deepEqual(editorialLines("New Arrivals"), ["New", "Arrivals"]);
  assert.deepEqual(editorialLines("The Celebration Edit"), ["The Celebration", "Edit"]);
});

test("a short or single-word title stays on one line", () => {
  assert.deepEqual(editorialLines("Silk"), ["Silk"]);
  assert.deepEqual(editorialLines("Silk Edit"), ["Silk Edit"]);
  assert.deepEqual(editorialLines(""), []);
  assert.deepEqual(editorialLines(undefined), []);
});

/* ------------------------------------------------------------------ */
/* Calls to action — never invented                                    */
/* ------------------------------------------------------------------ */

test("a CTA is only accepted with both a label and a destination", () => {
  assert.deepEqual(readCta({ label: "Explore", href: "/shop" }), {
    label: "Explore",
    href: "/shop",
  });
  assert.deepEqual(readCta("Shop the Edit", "/shop"), { label: "Shop the Edit", href: "/shop" });
  assert.equal(readCta({ label: "Explore" }), null);
  assert.equal(readCta({ href: "/shop" }), null);
  assert.equal(readCta("", ""), null);
  assert.equal(readCta(null, null), null);
});

/* ------------------------------------------------------------------ */
/* Slide normalisation                                                 */
/* ------------------------------------------------------------------ */

test("backend slide order is preserved exactly", () => {
  const slides = [
    slide({ id: "a", title: "First Campaign" }),
    slide({ id: "b", title: "Second Campaign" }),
    slide({ id: "c", title: "Third Campaign" }),
  ];
  const model = normalizeHeroSlides(slides, []);
  assert.deepEqual(
    model.map((entry) => entry.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(
    model.map((entry) => entry.layout),
    ["left", "panel", "right"]
  );
});

test("a slide is dropped when no photography resolves — nothing is faked", () => {
  const model = normalizeHeroSlides(
    [slide({ id: "with-photo" }), slide({ id: "no-photo", image: "" })],
    []
  );
  assert.deepEqual(
    model.map((entry) => entry.id),
    ["with-photo"]
  );
});

test("no slides at all normalises to an empty model", () => {
  assert.deepEqual(normalizeHeroSlides([], []), []);
  assert.deepEqual(normalizeHeroSlides(undefined, []), []);
  assert.deepEqual(normalizeHeroSlides(null, null), []);
  assert.deepEqual(normalizeHeroSlides([null, 42], []), []);
});

test("a slide without its own plate uses the HOME_HERO register", () => {
  const model = normalizeHeroSlides([slide({ image: "" })], [heroMediaRecord(0)]);
  assert.equal(model[0].image.src, "/api/v1/media/objects/hero/hero000.avif");
  assert.equal(model[0].mediaId, "hero-media-0");
});

test("the slide's own plate always wins over the register", () => {
  const model = normalizeHeroSlides(
    [slide({ image: "/api/v1/media/objects/hero/curated.avif" })],
    [heroMediaRecord(0)]
  );
  assert.equal(model[0].image.src, "/api/v1/media/objects/hero/curated.avif");
});

test("product-shaped register records are never admitted into the hero", () => {
  const model = normalizeHeroSlides(
    [slide({ image: "" })],
    [{ ...heroMediaRecord(0), productId: "PF-BR-MEH-0001" }]
  );
  assert.deepEqual(model, []);
});

test("the render model carries B's headline structure and the backend copy", () => {
  const [entry] = normalizeHeroSlides(
    [
      slide({
        eyebrow: "Collection 02",
        title: "Bridal Couture",
        body: "Crafted for your most special day",
        mobileImage: "/api/v1/media/objects/hero/hero002-tall.avif",
      }),
    ],
    []
  );
  assert.equal(entry.kicker, "Collection 02");
  assert.deepEqual(entry.lines, ["Bridal", "Couture"]);
  assert.equal(entry.italicLine, 1);
  assert.equal(entry.copy, "Crafted for your most special day");
  assert.deepEqual(entry.cta, { label: "View Bridal", href: "/bridal" });
  assert.equal(entry.light, false);
  assert.equal(entry.image.position, "50% center");
  assert.equal(entry.portrait.src, "/api/v1/media/objects/hero/hero002-tall.avif");
});

test("an absent kicker and a single-line title leave nothing to invent", () => {
  const [entry] = normalizeHeroSlides([slide({ title: "Silk", eyebrow: "" })], []);
  assert.equal(entry.kicker, "");
  assert.deepEqual(entry.lines, ["Silk"]);
  assert.equal(entry.italicLine, -1);
});

test("only the panel layout sets copy on the burgundy panel", () => {
  const model = normalizeHeroSlides(
    [slide({ id: "one" }), slide({ id: "two" }), slide({ id: "three" })],
    []
  );
  assert.deepEqual(
    model.map((entry) => entry.light),
    [false, true, false]
  );
});

test("a portrait plate is optional — its absence is not filled in", () => {
  const [entry] = normalizeHeroSlides([slide({ mobileImage: "" })], []);
  assert.equal(entry.portrait, null);
});

test("the accessible slide label falls back to a numbered campaign, never to mock copy", () => {
  const [entry] = normalizeHeroSlides([slide({ title: "" })], []);
  assert.equal(entry.label, "Campaign 1");
});

/* ------------------------------------------------------------------ */
/* Navigation maths                                                    */
/* ------------------------------------------------------------------ */

test("index wrapping stays inside the slide list", () => {
  assert.equal(wrapIndex(0, 5), 0);
  assert.equal(wrapIndex(5, 5), 0);
  assert.equal(wrapIndex(-1, 5), 4);
  assert.equal(wrapIndex(7, 5), 2);
  assert.equal(wrapIndex(3, 0), 0);
});

test("a swipe needs 48px of travel and must beat vertical drift", () => {
  assert.equal(swipeDirection(-60, 5), -1); // next
  assert.equal(swipeDirection(60, -5), 1); // previous
  assert.equal(swipeDirection(-40, 0), 0); // below the threshold
  assert.equal(swipeDirection(-60, -55), 0); // mostly vertical scroll
  assert.equal(swipeDirection(0, 0), 0);
});

/* ------------------------------------------------------------------ */
/* Autoplay pause model                                                */
/* ------------------------------------------------------------------ */

test("autoplay stops for hover, focus, a hidden tab and an offscreen hero", () => {
  assert.equal(autoplayPaused(), false);
  assert.equal(autoplayPaused({ hoverPause: true }), true);
  assert.equal(autoplayPaused({ focusPause: true }), true);
  assert.equal(autoplayPaused({ tabHidden: true }), true);
  assert.equal(autoplayPaused({ onScreen: false }), true);
});

test("reduced motion disables autoplay entirely", () => {
  assert.equal(autoplayPaused({ reduceMotion: true }), true);
});

/* ------------------------------------------------------------------ */
/* Live-response signature                                             */
/* ------------------------------------------------------------------ */

test("the slide signature is stable for equal content and changes with it", () => {
  const slides = [slide({ id: "a" }), slide({ id: "b" })];
  assert.equal(heroSlideKey(slides), heroSlideKey([...slides]));
  assert.equal(heroSlideKey([]), "");
  assert.equal(heroSlideKey(undefined), "");
  /* A late backend response must produce a different key — that is what
     re-normalises the model when the homepage passes the live proxy. */
  assert.notEqual(heroSlideKey([]), heroSlideKey(slides));
  assert.notEqual(
    heroSlideKey(slides),
    heroSlideKey([slides[0], slide({ id: "b", image: "/api/v1/media/objects/hero/other.avif" })])
  );
  assert.notEqual(heroSlideKey(slides), heroSlideKey([slides[0]]));
});

/* ------------------------------------------------------------------ */
/* Source contract — what the component must not do                    */
/* ------------------------------------------------------------------ */

const heroSource = readFileSync(new URL("../HeroEditorial.jsx", import.meta.url), "utf8");
/** Assembled so this suite never writes a legacy public image prefix itself. */
const LEGACY_PREFIX = `/${"images"}/`;

test("the hero authors no legacy public image path", () => {
  assert.equal(heroSource.includes(LEGACY_PREFIX), false);
  assert.equal(heroSource.includes(".webp"), false);
});

test("the hero opens no fetch client and holds no commerce state", () => {
  assert.doesNotMatch(heroSource, /\bfetch\s*\(/);
  assert.doesNotMatch(heroSource, /axios|XMLHttpRequest/);
  assert.doesNotMatch(heroSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(heroSource, /Math\.random/);
});

test("the hero wires autoplay pause, keyboard, swipe and cleanup", () => {
  assert.match(heroSource, /visibilitychange/);
  assert.match(heroSource, /ArrowLeft/);
  assert.match(heroSource, /ArrowRight/);
  assert.match(heroSource, /onTouchStart/);
  assert.match(heroSource, /onTouchEnd/);
  assert.match(heroSource, /clearTimeout\(timer\)/);
  assert.match(heroSource, /campaignMotion\.autoplayMs/);
  assert.match(heroSource, /campaignMotion\.minResumeMs/);
  assert.match(heroSource, /prefers-reduced-motion/);
});

test("the hero renders no visible control, counter or progress UI", () => {
  assert.equal(heroSource.includes("<button"), false);
  assert.equal(heroSource.includes("progressbar"), false);
  assert.doesNotMatch(heroSource, /Previous slide|Next slide|aria-label="Pause/);
  assert.doesNotMatch(heroSource, /\{activeIndex \+ 1\}\s*\/\s*\{total\}/);
  assert.doesNotMatch(heroSource, /<[^>]*>\s*(Prev|Next)\s*</);
});

test("the screen-reader status is announced only while paused", () => {
  assert.match(heroSource, /aria-live=\{paused \? "polite" : "off"\}/);
  assert.match(heroSource, /Campaign \{activeIndex \+ 1\} of \{total\}/);
});

test("an uncurated hero renders nothing", () => {
  assert.match(heroSource, /if \(!total \|\| !slide\) return null;/);
});

test("the model is keyed on live contents, not on the slide array identity", () => {
  /* `heroSlides` is a live proxy whose identity never changes; the model must
     therefore re-normalise from a content signature (the same approach the
     existing hero carousel uses). */
  assert.match(heroSource, /const slideItems = Array\.from\(slides \?\? \[\]\);/);
  assert.match(heroSource, /const slideKey = heroSlideKey\(slideItems\);/);
  assert.match(heroSource, /\[slideKey, heroMedia\]/);
  assert.doesNotMatch(heroSource, /\[slides, heroMedia\]/);
});

test("B-07: authored altText from /home renders as the img alt; empty keeps previous behaviour", () => {
  const withAlt = normalizeHeroSlides([slide({ altText: "Banarasi campaign plate" })], []);
  assert.equal(withAlt[0].image.alt, "Banarasi campaign plate");
  const without = normalizeHeroSlides([slide()], []);
  assert.equal(without[0].image.alt, "", "absent altText keeps the previous alt=\"\" behaviour");
  const blank = normalizeHeroSlides([slide({ altText: "   " })], []);
  assert.equal(blank[0].image.alt, "", "blank altText falls back unchanged");
});
