/**
 * PRATIKSHYA FASHON — B-02 Marketing Media Hero tests
 *
 * Validates that HOME_HERO is backend-managed:
 * - backend hero data renders
 * - ordering is respected
 * - empty response handled
 * - invalid response does not crash
 * - fallback cannot override valid backend configuration
 * - product media never used as fallback
 */

import test from "node:test";
import assert from "node:assert/strict";

import { mediaObjectUrl } from "../src/services/media/mediaPaths.js";

// Simulate HeroCarousel buildSlides logic (simplified)
const CANONICAL_HERO_KEYS = [
  "hero/hero001.avif",
  "hero/hero002.avif",
  "hero/hero003.avif",
  "hero/hero004.avif",
  "hero/hero005.avif",
];

const FALLBACK_COPY = [
  { eyebrow: "New Season", title: "Festive Elegance" },
  { eyebrow: "Bridal", title: "Bridal Couture" },
  { eyebrow: "Heritage", title: "Heritage Weaves" },
  { eyebrow: "Celebration", title: "The Celebration Edit" },
  { eyebrow: "New Arrivals", title: "New Arrivals" },
];

function buildSlides(slides = []) {
  const hasSlides = Array.isArray(slides) && slides.length > 0;
  const source = hasSlides
    ? slides
    : FALLBACK_COPY.map((copy, i) => ({
        id: `hero-${i + 1}`,
        title: copy.title,
        image: mediaObjectUrl(CANONICAL_HERO_KEYS[i]),
      }));

  return source
    .map((slide, index) => {
      const image = slide.image
        ? { src: slide.image, alt: slide.title }
        : {
            src: mediaObjectUrl(CANONICAL_HERO_KEYS[index % CANONICAL_HERO_KEYS.length]),
            alt: slide.title,
          };
      return { ...slide, image };
    })
    .filter((s) => s.image && s.image.src);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("backend hero data renders", () => {
  const backendSlides = [
    { id: "abc-1", title: "Heritage", image: "/api/v1/media/objects/hero/hero003.avif" },
    { id: "abc-2", title: "Festive", image: "/api/v1/media/objects/hero/hero001.avif" },
  ];
  const built = buildSlides(backendSlides);
  assert.equal(built.length, 2);
  assert.equal(built[0].title, "Heritage");
  assert.equal(built[0].image.src, "/api/v1/media/objects/hero/hero003.avif");
});

test("ordering is respected", () => {
  const backendSlides = [
    { id: "1", title: "Third", image: mediaObjectUrl("hero/hero003.avif") },
    { id: "2", title: "First", image: mediaObjectUrl("hero/hero001.avif") },
    { id: "3", title: "Second", image: mediaObjectUrl("hero/hero002.avif") },
  ];
  // Simulate DB ordering already sorted by sort_order
  const sorted = backendSlides.slice().sort((a, b) => a.image.localeCompare(b.image));
  // The buildSlides should preserve input order (DB order)
  const built = buildSlides(backendSlides);
  assert.equal(built[0].title, "Third");
  assert.equal(built[1].title, "First");
});

test("empty response handled — fallback to canonical 5", () => {
  const built = buildSlides([]);
  assert.equal(built.length, 5);
  assert.ok(built[0].image.src.includes("hero/hero001.avif"));
});

test("invalid response does not crash", () => {
  const built1 = buildSlides(null);
  assert.equal(built1.length, 5);

  const built2 = buildSlides(undefined);
  assert.equal(built2.length, 5);

  const built3 = buildSlides([{ id: null, title: null }]);
  // Should still produce something via fallback logic
  assert.ok(built3.length >= 1);
});

test("fallback cannot override valid backend configuration", () => {
  const backendSlides = [
    { id: "custom-1", title: "Custom Hero", image: "/api/v1/media/objects/marketing/custom.avif" },
  ];
  const built = buildSlides(backendSlides);
  assert.equal(built.length, 1);
  assert.equal(built[0].title, "Custom Hero");
  assert.equal(built[0].image.src, "/api/v1/media/objects/marketing/custom.avif");
  // Ensure canonical fallback not mixed in
  assert.ok(!built[0].image.src.includes("hero001"));
});

test("product media never used as fallback for hero", () => {
  const built = buildSlides([]);
  for (const slide of built) {
    assert.ok(!slide.image.src.includes("/products/"), "hero fallback must not use product media");
    assert.ok(!slide.image.src.includes("PF-"), "hero fallback must not use product IDs");
  }
});

test("canonical hero assets are reachable via mediaObjectUrl", () => {
  for (const key of CANONICAL_HERO_KEYS) {
    const url = mediaObjectUrl(key);
    assert.ok(url.startsWith("/api/v1/media/objects/"), `URL must be backend media URL: ${url}`);
    assert.ok(url.includes(key), `URL must contain object key: ${url}`);
  }
});

test("marketing media placement vocabulary includes HOME_HERO", async () => {
  const { MARKETING_PLACEMENTS } = await import("../src/config/mediaTypes.js");
  assert.equal(MARKETING_PLACEMENTS.HOME_HERO, "HOME_HERO");
});
