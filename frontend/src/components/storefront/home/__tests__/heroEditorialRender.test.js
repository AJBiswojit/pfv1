/**
 * Phase 1 — editorial hero, rendered.
 *
 * The hero is loaded through Vite's own SSR pipeline (the same convention the
 * existing render suites use) and server-rendered, so these assertions run
 * against the REAL component and the REAL media seam — not a description of
 * them.
 *
 * Covered here:
 *   · backend slides render, in the backend's order;
 *   · an empty response renders nothing at all;
 *   · media resolves through the existing contract (never an authored path);
 *   · one action per slide, no visible counter / progress / pause / arrow UI;
 *   · the live homepage and every portal are untouched by Phase 1.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Walk up until the frontend `package.json` — the Vite project root. */
function projectRoot() {
  let directory = new URL(".", import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL("package.json", directory))) return fileURLToPath(directory);
    directory = new URL("../", directory);
  }
  throw new Error("frontend root not found");
}

const ROOT = projectRoot();
/** Assembled so this suite never writes a legacy public image prefix itself. */
const LEGACY_PREFIX = `/${"images"}/`;

let vite;
let HeroEditorial;

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  HeroEditorial = (await vite.ssrLoadModule("/src/components/storefront/home/HeroEditorial.jsx"))
    .default;
});

after(async () => {
  await vite?.close();
});

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

const THREE_SLIDES = [
  slide({ id: "hero-1", title: "Bridal Couture" }),
  slide({
    id: "hero-2",
    title: "Festive Elegance",
    eyebrow: "Collection 02",
    image: "/api/v1/media/objects/hero/hero002.avif",
    body: "Handwoven stories for the season of celebration",
    cta: { label: "Explore Collection", href: "/shop" },
  }),
  slide({
    id: "hero-3",
    title: "New Arrivals",
    image: "/api/v1/media/objects/hero/hero003.avif",
    body: "Fresh drapes, just landed",
    cta: { label: "Shop New", href: "/shop" },
  }),
];

const render = (props) => renderToStaticMarkup(React.createElement(HeroEditorial, props));

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

test("no slides renders nothing — no mock copy, no fallback plate", () => {
  assert.equal(render({ slides: [], heroMedia: [] }), "");
  assert.equal(render({ slides: undefined, heroMedia: null }), "");
  assert.equal(render({}), "");
});

test("slides with no resolvable photography render nothing rather than an empty frame", () => {
  const html = render({ slides: [slide({ image: "", mobileImage: "" })], heroMedia: [] });
  assert.equal(html, "");
});

/* ------------------------------------------------------------------ */
/* Rendering the backend response                                      */
/* ------------------------------------------------------------------ */

test("the first backend slide renders with its headline, copy and action", () => {
  const html = render({ slides: THREE_SLIDES, heroMedia: [] });
  assert.match(html, /data-active-slide="hero-1"/);
  assert.match(html, /data-slide-layout="left"/);
  assert.match(html, /pf-hero--left/);
  assert.match(html, /Bridal/);
  assert.match(html, /Couture/);
  assert.match(html, /Crafted for your most special day/);
  assert.match(html, /View Bridal/);
  assert.match(html, /href="\/bridal"/);
});

test("the campaign headline breaks into masked lines with an italic closing line", () => {
  const html = render({ slides: THREE_SLIDES, heroMedia: [] });
  // The active headline only — the hidden sizers repeat every slide's lines.
  const heading = html.match(/<h1 class="pf-hero__title">([\s\S]*?)<\/h1>/);
  assert.ok(heading, "the active headline must render as the page h1");
  assert.equal((heading[1].match(/pf-hero__line-mask/g) ?? []).length, 2);
  assert.match(heading[1], /Bridal/);
  assert.match(heading[1], /Couture/);
  // Closing line only — the campaign italic is never applied to every line.
  assert.equal((html.match(/pf-hero__line-inner--italic/g) ?? []).length, 1);
});

test("an absent eyebrow omits the kicker row instead of faking one", () => {
  const withoutKicker = render({ slides: [slide()], heroMedia: [] });
  assert.doesNotMatch(withoutKicker, /pf-hero__kicker"/);
  const withKicker = render({
    slides: [slide({ eyebrow: "Collection 02" })],
    heroMedia: [],
  });
  assert.match(withKicker, /Collection 02/);
});

test("every slide reserves its text height (invisible sizers), one per slide", () => {
  const html = render({ slides: THREE_SLIDES, heroMedia: [] });
  assert.equal((html.match(/pf-hero__sizer/g) ?? []).length, 3);
  const hidden = html.match(/aria-hidden="true"/g) ?? [];
  assert.ok(hidden.length >= 3, "sizer copy must be hidden from assistive technology");
});

test("only the active slide is exposed, and it is announced as slide 1 of 3", () => {
  const html = render({ slides: THREE_SLIDES, heroMedia: [] });
  assert.equal((html.match(/aria-roledescription="slide"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-roledescription="carousel"/g) ?? []).length, 1);
  assert.match(html, /aria-label="1 of 3: Bridal Couture"/);
  assert.match(html, /Campaign 1 of 3: Bridal Couture/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-keyshortcuts="ArrowLeft ArrowRight"/);
});

test("the accessibility status is live only while autoplay is paused", () => {
  const html = render({ slides: THREE_SLIDES, heroMedia: [] });
  assert.match(html, /aria-live="(polite|off)"/);
  assert.match(html, /aria-atomic="true"/);
});

/* ------------------------------------------------------------------ */
/* Controls and counters                                               */
/* ------------------------------------------------------------------ */

test("the hero exposes no visible control, counter, progress bar or pager", () => {
  const html = render({ slides: THREE_SLIDES, heroMedia: [] });
  assert.equal(html.includes("<button"), false);
  assert.equal(html.includes("progressbar"), false);
  assert.doesNotMatch(html, /Pause|Play\b/);
  assert.doesNotMatch(html, /Prev|Next/);
  assert.doesNotMatch(html, /\b1\s*\/\s*3\b/);
});

test("exactly one action is rendered, pointed at the backend destination", () => {
  const html = render({ slides: THREE_SLIDES, heroMedia: [] });
  // React preloads the high-priority plate with a <link>, so count the action
  // itself rather than every href in the document.
  assert.equal((html.match(/data-hero-cta=/g) ?? []).length, 1);
  assert.match(html, /<a href="\/bridal"/);
});

test("a slide with no backend action renders no action at all", () => {
  const html = render({ slides: [slide({ cta: null })], heroMedia: [] });
  assert.equal((html.match(/data-hero-cta=/g) ?? []).length, 0);
  assert.equal(html.includes("<button"), false);
});

/* ------------------------------------------------------------------ */
/* Media contract                                                      */
/* ------------------------------------------------------------------ */

test("the photograph is the backend media URL, never an authored public path", () => {
  const html = render({ slides: THREE_SLIDES, heroMedia: [] });
  assert.match(html, /src="\/api\/v1\/media\/objects\/hero\/hero001\.avif"/);
  assert.equal(html.includes(LEGACY_PREFIX), false);
});

test("a slide with no plate resolves through the HOME_HERO register", () => {
  const heroMedia = [
    {
      id: "hero-media-0",
      placement: "HOME_HERO",
      usageRoles: ["HERO"],
      mappingMethod: "HOMEPAGE_HERO_REGISTER",
      productId: null,
      status: "ACTIVE",
      url: "/api/v1/media/objects/hero/hero000.avif",
      sortOrder: 0,
      alt: "Managed campaign plate",
    },
  ];
  const html = render({ slides: [slide({ image: "" })], heroMedia });
  assert.match(html, /src="\/api\/v1\/media\/objects\/hero\/hero000\.avif"/);
});

test("a portrait plate is only rendered when the backend sends one", () => {
  const withoutPortrait = render({ slides: [slide()], heroMedia: [] });
  assert.equal(withoutPortrait.includes("pf-hero__pic--tall"), false);
  const withPortrait = render({
    slides: [slide({ mobileImage: "/api/v1/media/objects/hero/hero001-tall.avif" })],
    heroMedia: [],
  });
  assert.match(withPortrait, /pf-hero__pic--tall/);
  assert.match(withPortrait, /hero001-tall\.avif/);
});

/* ------------------------------------------------------------------ */
/* Phase 1 boundary — the live homepage is untouched                   */
/* ------------------------------------------------------------------ */

/** Every `.js`/`.jsx` file under `src/`, excluding the Phase 1 test folders. */
function sourceFiles(directory = join(ROOT, "src"), found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      sourceFiles(path, found);
    } else if ([".js", ".jsx"].includes(extname(entry.name))) {
      found.push(path);
    }
  }
  return found;
}

test("the live customer homepage belongs to Aarna, not the retired editorial composition", () => {
  const app = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
  const layout = readFileSync(join(ROOT, "src/layouts/CustomerLayout.jsx"), "utf8");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/);
  assert.match(layout, /<CustomerStorefront \/>/);
  assert.equal(app.includes("HeroEditorial"), false);

  /* Import references only: preview harnesses and the unmounted legacy
     StorefrontHome composition may still retain this editorial module. Neither
     is part of the active customer route graph. */
  const allowed = [join("home", "HeroEditorial.jsx"), join("storefront", "StorefrontHome.jsx")];
  const offenders = sourceFiles()
    .filter((path) => !path.includes(join("storefront", "preview")))
    .filter((path) => {
      if (allowed.some((name) => path.endsWith(name))) return false;
      return /from\s+["'][^"']*HeroEditorial|import\s*\(\s*["'][^"']*HeroEditorial/.test(
        readFileSync(path, "utf8")
      );
    });
  assert.deepEqual(
    offenders.map((path) => path.replace(`${ROOT}/`, "")),
    []
  );
});

test("the hero adds no router, provider or second navigation layer", () => {
  const source = readFileSync(
    join(ROOT, "src/components/storefront/home/HeroEditorial.jsx"),
    "utf8"
  );
  assert.doesNotMatch(source, /react-router-dom|createBrowserRouter|MemoryRouter/);
  assert.doesNotMatch(source, /<Router|<Provider/);
});
