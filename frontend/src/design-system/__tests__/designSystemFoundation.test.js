/**
 * Phase 1 — design-system foundation.
 *
 * Pins the additive tokens (CSS `@theme` mirror + JS exports), the campaign
 * typography and motion scales, the ported behaviour hooks and the four
 * campaign primitives.
 *
 * The component primitives are loaded through Vite's SSR pipeline (the same
 * convention the existing render suites use) so JSX resolves exactly as it
 * does in the application.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import tokens, { campaign, campaignClasses, colors } from "../tokens.js";
import { fontFamilies, typography } from "../typography.js";
import motionTokens, { campaign as campaignMotion } from "../motion.js";
import useMediaQuery, { matchesMediaQuery } from "../hooks/useMediaQuery.js";
import useScrolled from "../hooks/useScrolled.js";
import useLockBody from "../hooks/useLockBody.js";
import useFocusTrap from "../hooks/useFocusTrap.js";
import useEscape from "../hooks/useEscape.js";

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
const read = (relativePath) => readFileSync(`${ROOT}/${relativePath}`, "utf8");

let vite;
let primitives;

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  const reveal = await vite.ssrLoadModule("/src/design-system/components/Reveal.jsx");
  const inView = await vite.ssrLoadModule("/src/design-system/components/InView.jsx");
  const arrowLink = await vite.ssrLoadModule("/src/design-system/components/ArrowLink.jsx");
  const sectionLabel = await vite.ssrLoadModule("/src/design-system/components/SectionLabel.jsx");
  primitives = {
    barrel: await vite.ssrLoadModule("/src/design-system/index.js"),
    MaskReveal: reveal.MaskReveal,
    LineReveal: reveal.LineReveal,
    FadeUp: reveal.FadeUp,
    InView: inView.InView,
    useReplayInView: inView.useReplayInView,
    ArrowLink: arrowLink.default,
    SectionLabel: sectionLabel.default,
  };
});

after(async () => {
  await vite?.close();
});

const render = (element) => renderToStaticMarkup(element);

/* ------------------------------------------------------------------ */
/* Campaign palette                                                    */
/* ------------------------------------------------------------------ */

test("the campaign palette is exactly the approved four tones plus their variations", () => {
  assert.equal(campaign.burgundy, "#65081f");
  assert.equal(campaign.blushCanvas, "#f7eeed");
  assert.equal(campaign.cocoaMuted, "#a0705c");
  assert.equal(campaign.neutralSoft, "#caafa5");
  assert.equal(campaign.burgundyDeep, "#420619");
  assert.equal(campaign.blushWarm, "#e9d0c1");
  assert.equal(campaign.espresso, "#3a1806");
  assert.equal(tokens.campaign, campaign);
});

test("the palette is additive — every pre-Phase-1 token is unchanged", () => {
  assert.equal(colors.canvas, "#ffffff");
  assert.equal(colors.ink, "#2a2015");
  assert.equal(colors.accent, "#8a3e22");
  assert.equal(colors.blush, "#e8d5c4");
  assert.equal(colors.cocoa, "#6a4e38");
  assert.equal(colors.pearl, "#dddddd");
  assert.equal(tokens.colors, colors);
});

test("campaign class names resolve to the new utilities only", () => {
  assert.equal(campaignClasses.canvas, "bg-blush-canvas");
  assert.equal(campaignClasses.accent, "bg-burgundy");
  assert.equal(campaignClasses.hairline, "border-burgundy-line");
});

/* ------------------------------------------------------------------ */
/* CSS mirror                                                          */
/* ------------------------------------------------------------------ */

test("index.css mirrors the campaign palette inside the additive @theme block", () => {
  const css = read("src/index.css");
  assert.match(css, /--color-burgundy: #65081f;/);
  assert.match(css, /--color-blush-canvas: #f7eeed;/);
  assert.match(css, /--color-cocoa-muted: #a0705c;/);
  assert.match(css, /--color-neutral-soft: #caafa5;/);
  assert.match(css, /--ease-silk: cubic-bezier\(0\.45, 0, 0\.15, 1\);/);
});

test("no existing theme token was edited or removed", () => {
  const css = read("src/index.css");
  assert.match(css, /--font-display: "Cormorant Garamond", Georgia, serif;/);
  assert.match(css, /--font-ui: "Instrument Sans", system-ui, sans-serif;/);
  assert.match(css, /--font-accent: "Playfair Display", Georgia, serif;/);
  assert.match(css, /--color-canvas: #ffffff;/);
  assert.match(css, /--color-ink: #2a2015;/);
  assert.match(css, /--color-accent: #8a3e22;/);
  assert.match(css, /--color-blush: #e8d5c4;/);
  assert.match(css, /--color-pearl: #dddddd;/);
});

test("Phase 1 added no global selector to the application stylesheet", () => {
  const css = read("src/index.css");
  assert.equal((css.match(/(^|\n)html\s*\{/g) ?? []).length, 1);
  assert.equal((css.match(/(^|\n)body\s*\{/g) ?? []).length, 1);
  assert.equal((css.match(/(^|\n)\*\s*\{/g) ?? []).length, 0);
});

/* ------------------------------------------------------------------ */
/* Campaign typography — and the documented font gap                   */
/* ------------------------------------------------------------------ */

test("the campaign scale uses the fonts this application actually loads", () => {
  assert.deepEqual(fontFamilies, {
    display: '"Cormorant Garamond", Georgia, serif',
    ui: '"Instrument Sans", system-ui, sans-serif',
    accent: '"Playfair Display", Georgia, serif',
  });
  assert.match(typography.campaign.display, /font-display/);
  assert.match(typography.campaign.kicker, /font-ui/);
  assert.match(typography.campaign.lead, /font-ui/);
  // Manrope is deliberately NOT referenced: the font is not loaded and Phase 1
  // adds no font package. The gap is recorded, not papered over.
  assert.equal(JSON.stringify(typography.campaign).includes("Manrope"), false);
  assert.equal(motionTokens.campaign.autoplayMs, 7000);
});

/* ------------------------------------------------------------------ */
/* Campaign motion                                                     */
/* ------------------------------------------------------------------ */

test("the campaign motion tokens are the hero's published cadence", () => {
  assert.equal(campaignMotion.autoplayMs, 7000);
  assert.equal(campaignMotion.swap, 1.25);
  assert.equal(campaignMotion.swipePx, 48);
  assert.equal(campaignMotion.swipeRatio, 1.3);
  assert.deepEqual(campaignMotion.ease.silk, [0.45, 0, 0.15, 1]);
  assert.equal(typeof campaignMotion.beat.first.head, "number");
  assert.equal(typeof campaignMotion.beat.next.head, "number");
  assert.ok(campaignMotion.beat.first.head > campaignMotion.beat.next.head);
});

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

test("the ported hooks are exported and safe without a browser", () => {
  for (const hook of [useMediaQuery, useScrolled, useLockBody, useFocusTrap, useEscape]) {
    assert.equal(typeof hook, "function");
  }
  assert.equal(matchesMediaQuery("(prefers-reduced-motion: reduce)"), false);
});

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

test("the barrel exposes the Phase 1 primitives and nothing was renamed", () => {
  const { barrel } = primitives;
  for (const name of [
    "campaign",
    "campaignClasses",
    "InView",
    "useReplayInView",
    "MaskReveal",
    "LineReveal",
    "FadeUp",
    "ArrowLink",
    "Arrow",
    "SectionLabel",
    "useMediaQuery",
    "matchesMediaQuery",
    "useScrolled",
    "useLockBody",
    "useFocusTrap",
    "useEscape",
  ]) {
    assert.ok(name in barrel, `missing design-system export: ${name}`);
  }
  // Pre-existing exports must survive untouched.
  for (const name of ["AtelierButton", "AtelierSection", "EditorialHeading", "ProductCard"]) {
    assert.ok(name in barrel, `lost design-system export: ${name}`);
  }
});

test("SectionLabel renders its index, rule and text without a global class", () => {
  const html = render(
    React.createElement(
      primitives.SectionLabel,
      { index: "02" },
      "The Bridal Edit"
    )
  );
  assert.match(html, /02/);
  assert.match(html, /The Bridal Edit/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /class="label/);
});

test("ArrowLink routes internal destinations and anchors external ones", () => {
  const ArrowLink = primitives.ArrowLink;

  const internal = render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(ArrowLink, { to: "/bridal" }, "Discover the Bride")
    )
  );
  assert.match(internal, /href="\/bridal"/);
  assert.match(internal, /Discover the Bride/);
  assert.match(internal, /viewBox="0 0 22 10"/);

  const external = render(
    React.createElement(ArrowLink, { href: "https://example.invalid/campaign" }, "Read more")
  );
  assert.match(external, /href="https:\/\/example\.invalid\/campaign"/);
});

test("LineReveal masks every line and italicises only the closing one", () => {
  const LineReveal = primitives.LineReveal;
  const html = render(
    React.createElement(LineReveal, {
      lines: ["Tradition,", "Reimagined."],
      italic: [1],
      animateNow: true,
    })
  );
  assert.match(html, /Tradition,/);
  assert.match(html, /Reimagined\./);
  assert.equal((html.match(/overflow:hidden/g) ?? []).length, 2);
  assert.equal((html.match(/italic/g) ?? []).length, 1);
});

test("MaskReveal and FadeUp render their children", () => {
  const { MaskReveal, FadeUp } = primitives;
  assert.match(render(React.createElement(MaskReveal, null, "plate")), /plate/);
  assert.match(render(React.createElement(FadeUp, null, "copy")), /copy/);
});

test("InView exposes lazily-created motion wrappers", () => {
  assert.equal(typeof primitives.useReplayInView, "function");
  const InView = primitives.InView;
  // React 19 wraps components in an element-like object, so assert presence
  // and cache identity rather than a plain `function` type.
  assert.ok(InView.div, "InView.div must expose a motion component");
  assert.equal(InView.div, InView.div); // cached, never recreated mid-render
});

test("the primitive modules define no global CSS and no competing reset", () => {
  for (const path of [
    "src/design-system/components/InView.jsx",
    "src/design-system/components/Reveal.jsx",
    "src/design-system/components/ArrowLink.jsx",
    "src/design-system/components/SectionLabel.jsx",
    "src/design-system/hooks/useMediaQuery.js",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /:root|(^|\n)\s*(body|html|\*)\s*\{/, path);
  }
});

test("the hero stylesheet is namespaced and cannot leak into a portal", () => {
  const css = read("src/components/storefront/home/hero-editorial.css");
  const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((prelude) => prelude && !prelude.startsWith("@"))
    .flatMap((group) => group.split(",").map((selector) => selector.trim()))
    .filter(Boolean);

  assert.ok(selectors.length > 20, "the hero port must carry its full geometry");
  for (const selector of selectors) {
    assert.match(selector, /^\.pf-hero/, `unscoped hero selector: ${selector}`);
  }
});
