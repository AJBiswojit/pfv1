/**
 * Phase 2B — homepage content sections, rendered.
 *
 * The sections are loaded through Vite's own SSR pipeline (the convention the
 * existing render suites use) and server-rendered, so every assertion runs
 * against the REAL components, the REAL services and the REAL stylesheet —
 * not a description of them.
 *
 * Covered here:
 *   · the approved order, and only sections that exist in the source design;
 *   · the empty-backend contract: no catalogue, no invented content;
 *   · every destination resolves to a route this application actually has;
 *   · product cards link to the canonical product route;
 *   · plates carry alt text, and an unresolvable plate drops its tile;
 *   · CSS is namespaced `.pf-sec*` and cannot reach the portals or `:root`;
 *   · fixture data stays inside the development-only preview harness;
 *   · the newsletter section is absent (no backend capability);
 *   · the hero and 2A shell previews still resolve their own views.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
const SECTIONS_DIR = "src/components/storefront/home-sections";

const read = (relative) => readFileSync(join(ROOT, relative), "utf8");
const sectionSources = () =>
  readdirSync(join(ROOT, SECTIONS_DIR)).filter((name) => /\.(jsx|js|css)$/.test(name));

let vite;
let modules;

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });

  const load = (path) => vite.ssrLoadModule(path);
  modules = {
    HomeSections: (await load(`/${SECTIONS_DIR}/HomeSections.jsx`)).default,
    sectionData: await load(`/${SECTIONS_DIR}/sectionData.js`),
    sectionPlate: await load(`/${SECTIONS_DIR}/sectionPlate.jsx`),
    fixtures: await load("/src/components/storefront/preview/previewSectionFixtures.js"),
    HomePreview: await load("/src/components/storefront/preview/HomePreview.jsx"),
    AuthProvider: (await load("/src/context/AuthContext.jsx")).AuthProvider,
    ShoppingProvider: (await load("/src/context/ShoppingContext.jsx")).ShoppingProvider,
  };
});

after(async () => {
  await vite?.close();
});

/** The customer layout's provider pair, so hooks behave as they do in the app. */
async function render(element) {
  const { MemoryRouter } = await import("react-router-dom");
  const { createElement: h } = React;
  return renderToStaticMarkup(
    h(
      MemoryRouter,
      null,
      h(modules.AuthProvider, null, h(modules.ShoppingProvider, null, element))
    )
  );
}

const fixtureHtml = async () =>
  render(React.createElement(modules.HomeSections, { source: modules.fixtures.PREVIEW_FIXTURE_SECTIONS }));

const liveHtml = async () => render(React.createElement(modules.HomeSections, null));

/** The lookbook section, loaded on demand (it is not one of the composed parts). */
const importLookbook = async () => ({
  SectionLookbook: (await vite.ssrLoadModule(`/${SECTIONS_DIR}/SectionLookbook.jsx`)).default,
});

const hrefsOf = (html) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]);

/* ── the approved composition ────────────────────────────────────────── */

test("the composed body renders the approved sections in order", async () => {
  const html = await fixtureHtml();
  const order = [
    "pf-sec-collage",
    "pf-sec-saree",
    "pf-sec-bridal",
    "pf-sec-jewel",
    "pf-sec-offer",
    "pf-sec-men",
    "pf-sec-kids",
    "pf-sec-best",
    "pf-sec-look",
    "pf-sec-trust",
  ];

  let cursor = -1;
  for (const marker of order) {
    const at = html.indexOf(`class="pf-sec pf-sec-${marker.replace("pf-sec-", "")}`);
    const loose = at === -1 ? html.indexOf(marker) : at;
    assert.ok(loose > -1, `${marker} is missing from the composition`);
    assert.ok(loose > cursor, `${marker} is out of the approved order`);
    cursor = loose;
  }
});

test("the composer wraps the sections in one namespaced host", async () => {
  const html = await fixtureHtml();
  assert.match(html, /class="pf-sec-host"/);
  assert.equal((html.match(/pf-sec-host/g) || []).length, 1);
});

test("no section is invented beyond the source design", async () => {
  const html = await fixtureHtml();
  /* B's 12 sections: 01 hero (Phase 1) + 02–10 and 12 here. 11 (newsletter)
     has no backend capability and is deliberately absent — the CSS/JSX may SAY
     so in a comment, but no code may carry it. */
  const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const absent of ["newsletter", "subscribe", "pf-sec-letter"]) {
    assert.equal(html.toLowerCase().includes(absent), false, `invented section: ${absent}`);
    for (const file of sectionSources()) {
      const code = withoutComments(read(join(SECTIONS_DIR, file))).toLowerCase();
      assert.equal(code.includes(absent), false, `${file} carries ${absent} in code`);
    }
  }
});

/* ── the empty-backend contract ──────────────────────────────────────── */

test("with no catalogue at all, no image-led section is rendered", async () => {
  const html = await liveHtml();
  for (const marker of ["pf-sec-collage", "pf-sec-bridal", "pf-sec-jewel", "pf-sec-offer", "pf-sec-best", "pf-sec-look"]) {
    assert.equal(html.includes(marker), false, `${marker} rendered without data`);
  }
  assert.equal((html.match(/<img /g) || []).length, 0, "an image rendered without data");
});

test("with no catalogue, the copy-led sections keep only real destinations", async () => {
  const html = await liveHtml();
  const links = hrefsOf(html);
  assert.ok(links.length > 0, "the taxonomy-driven sections should still offer routes");
  for (const href of links) {
    assert.match(href, /^\/(women|men|kids|bridal|collections|category|product|shop)(\/|$)/, `unexpected destination ${href}`);
  }
});

test("every preview-fixture destination is a route this application has", async () => {
  const links = hrefsOf(await fixtureHtml());
  assert.ok(links.length > 20);
  const runtimeRoutes = new Set([
    "/women",
    "/men",
    "/kids",
    "/bridal",
    "/shop",
    "/collections",
  ]);
  for (const href of links) {
    const [head, second] = href.split("/").filter(Boolean);
    if (runtimeRoutes.has(`/${head}`)) continue;
    /* `/category/:slug`, `/collections/:slug` and `/product/:id` are the
       dynamic routes `App.jsx` registers. */
    if (head === "category" || head === "collections" || head === "product") {
      assert.ok(second, `${href} has no slug`);
      continue;
    }
    assert.ok(
      ["women", "men", "kids", "bridal"].includes(head),
      `${href} is not reachable in this application`
    );
  }
  for (const unrouted of ["/about", "/contact", "/privacy", "/terms"]) {
    assert.equal(links.includes(unrouted), false, `${unrouted} is not a route in App.jsx`);
  }
});

test("a product card links to the canonical product route", async () => {
  const html = await fixtureHtml();
  const productLinks = hrefsOf(html).filter((href) => href.startsWith("/product/"));
  assert.ok(productLinks.length >= 10, `expected product cards, found ${productLinks.length}`);
  for (const href of productLinks) {
    assert.match(href, /^\/product\/[A-Za-z0-9._-]+$/, `malformed product route ${href}`);
  }
});

/* ── imagery ─────────────────────────────────────────────────────────── */

test("every rendered image carries its own alt attribute", async () => {
  const html = await fixtureHtml();
  const images = html.match(/<img [^>]*>/g) || [];
  assert.ok(images.length >= 40, `expected plates, found ${images.length}`);
  for (const image of images) {
    assert.match(image, /alt="[^"]*"/, `no alt attribute: ${image.slice(0, 90)}`);
  }
});

test("a department tile without a resolvable plate drops its tile", async () => {
  /* The taxonomy is real, the covers are not: the collage must disappear
     rather than show four empty frames. (Asserted by the empty-backend test
     above, and here directly through the builder.) */
  const tiles = modules.sectionData.buildCategoryTiles();
  for (const tile of tiles) {
    assert.equal(
      modules.sectionPlate.hasPlate(tile.image),
      false,
      "with no media register a department cover cannot resolve"
    );
  }
  const html = await liveHtml();
  assert.equal(html.includes("pf-sec-collage"), false);
});

test("plates are lazy by default and eager only where they open a section", async () => {
  const html = await fixtureHtml();
  const images = html.match(/<img [^>]*>/g) || [];
  const lazy = images.filter((image) => image.includes('loading="lazy"'));
  assert.ok(lazy.length >= images.length - 6, `${images.length - lazy.length} plates load eagerly`);
  assert.ok(images.every((image) => image.includes('decoding="async"')));
  /* One plate opens its section (the finishing-touches stage); the rest wait. */
  const eager = images.filter((image) => image.includes('loading="eager"'));
  assert.equal(eager.length, 1, "exactly the section-opening plate should be eager");
});

test("every image-led link carries an accessible name", async () => {
  const html = await fixtureHtml();
  const anchors = html.split("<a ").slice(1).map((chunk) => `<a ${chunk.split("</a>")[0]}</a>`);
  const imageLinks = anchors.filter((anchor) => anchor.includes("<img "));
  assert.ok(imageLinks.length >= 12, `expected image-led links, found ${imageLinks.length}`);

  for (const anchor of imageLinks) {
    if (/aria-label="[^"]+"/.test(anchor)) continue;
    const text = anchor.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    assert.ok(text.length > 0, `a plate link has no accessible name: ${anchor.slice(0, 120)}`);
  }
});

test("filters use the application's own pressed-button pattern", () => {
  const jsx = sectionSources()
    .filter((file) => /\.jsx$/.test(file))
    .map((file) => read(join(SECTIONS_DIR, file)))
    .join("\n");
  assert.equal(jsx.includes('role="tablist"'), false, "no tab semantics without tab panels");
  assert.equal(jsx.includes('role="tab"'), false);
  assert.ok((jsx.match(/aria-pressed=/g) || []).length >= 3, "the filter rows lost their pressed state");
  assert.ok((jsx.match(/role="group"/g) || []).length >= 3, "the filter rows lost their group label");
});

test("media resolution stays inside the canonical seam", async () => {
  for (const file of sectionSources()) {
    const source = read(join(SECTIONS_DIR, file));
    assert.equal(source.includes(LEGACY_PREFIX), false, `${file} hardcodes a legacy image path`);
    assert.equal(/\.(avif|webp|png|jpe?g)["'`]/.test(source), false, `${file} hardcodes an image filename`);
    assert.equal(/<img\b/.test(source.replace(/pf-sec__plate img/g, "")), false, `${file} paints an <img> directly`);
  }
});

/* ── services, not fixtures ──────────────────────────────────────────── */

test("the section models read the application's own services", async () => {
  const source = read(`${SECTIONS_DIR}/sectionData.js`);
  for (const seam of [
    "../../../data/catalog/taxonomy",
    "../../../data/products",
    "../../../services/media/mediaResolver",
    "../../../services/taxonomyRepository",
    "../../../services/offers/offerRepository",
    "../../../services/taxonomyRouting",
  ]) {
    assert.ok(source.includes(seam), `sectionData.js no longer reads ${seam}`);
  }
  /* No second shop, and no hand-written price or product id. */
  assert.equal(/fetch\(/.test(source), false, "sectionData.js must not fetch directly");
  assert.equal(/localhost|127\.0\.0\.1/.test(source), false, "no hardcoded origin");
});

test("the components fetch nothing themselves and build no second commerce state", async () => {
  for (const file of sectionSources()) {
    const source = read(join(SECTIONS_DIR, file));
    assert.equal(/fetch\(/.test(source), false, `${file} uses fetch directly`);
    assert.equal(/localStorage/.test(source), false, `${file} touches storage directly`);
    assert.equal(/addToCart|useCart\b/.test(source), false, `${file} duplicates cart state`);
  }
  /* The one commerce hook used is the existing wishlist. */
  assert.ok(read(`${SECTIONS_DIR}/SectionProducts.jsx`).includes("context/WishlistContext"));
});

test("product rails reuse the existing card, cover and route helpers", async () => {
  const source = read(`${SECTIONS_DIR}/SectionProducts.jsx`);
  assert.ok(source.includes("hooks/useMedia"));
  assert.ok(source.includes("data/products"));
  assert.ok(source.includes("ProductCard"));
  assert.ok(source.includes("useProductCovers"));
  assert.ok(source.includes("productHref"));
  /* The empty plate is dropped, never faked. */
  assert.ok(source.includes("visible"));
});

test("the rail prints its own honest ordering note", async () => {
  const { SECTION_COPY } = modules.sectionData;
  assert.match(SECTION_COPY.rail.note, /sales ranking/);
  const html = await fixtureHtml();
  assert.ok(html.includes("verified sales ranking"));
});

test("the offer section renders nothing without a customer-visible offer", async () => {
  const built = modules.sectionData.buildOfferSection();
  assert.equal(built, null);
  const html = await liveHtml();
  assert.equal(html.includes("pf-sec-offer"), false);
});

test("the service strip renders nothing without a content source", async () => {
  const source = read(`${SECTIONS_DIR}/SectionServiceStrip.jsx`);
  assert.ok(source.includes("if (!list.length) return null"));
  const html = await liveHtml();
  assert.equal(html.includes("pf-sec-trust"), false);
});

/* ── preview fixtures stay in the preview ────────────────────────────── */

test("no production module imports the preview fixtures", async () => {
  const walk = (directory) => {
    const found = [];
    for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) found.push(...walk(relative));
      else if (/\.(jsx|js)$/.test(entry.name)) found.push(relative);
    }
    return found;
  };

  for (const file of walk("src")) {
    if (file.includes("/preview/") || file.includes("__tests__")) continue;
    const source = read(file);
    assert.equal(
      source.includes("previewSectionFixtures"),
      false,
      `${file} imports preview fixtures`
    );
  }
  /* …and the sections themselves never reach the application entry points. */
  for (const entryPoint of ["src/App.jsx", "src/main.jsx"]) {
    const source = read(entryPoint);
    assert.equal(source.includes("home-sections"), false, `${entryPoint} mounts the new sections`);
    assert.equal(source.includes("HomeSections"), false, `${entryPoint} imports HomeSections`);
  }
  /* The live homepage is still the production page, and still the index route. */
  const app = read("src/App.jsx");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/);
  assert.match(read("src/layouts/CustomerLayout.jsx"), /<AarnaStorefront \/>/);
});

test("fixture products carry no live price and are visibly marked", async () => {
  const { PREVIEW_FIXTURE_PRODUCTS } = modules.fixtures;
  const rows = Object.values(PREVIEW_FIXTURE_PRODUCTS).flat();
  assert.ok(rows.length >= 14);
  for (const product of rows) {
    assert.equal(product.price, null, `${product.id} carries a price`);
    assert.equal(product.label, "Sample", `${product.id} is not marked as a sample`);
    assert.match(product.id, /^PF-[A-Z0-9-]+$/, `${product.id} is not a real catalogue id shape`);
  }
  const html = await fixtureHtml();
  assert.ok(html.includes(">Sample<"), "the sample badge never rendered");
});

test("the preview fixtures resolve every plate through the canonical seam", async () => {
  const source = read("src/components/storefront/preview/previewSectionFixtures.js");
  assert.ok(source.includes("mediaObjectUrl"));
  assert.equal(source.includes(LEGACY_PREFIX), false, "fixtures must not address public images directly");
  assert.match(source, /PREVIEW_FIXTURE_LABEL|preview-only|NOT PRODUCTION DATA/i);
});

/* ── preview surfaces still work ─────────────────────────────────────── */

test("the hero and the 2A shell previews still resolve their own views", async () => {
  const main = read("src/components/storefront/preview/main.jsx");
  assert.ok(main.includes("ShellPreview"));
  assert.ok(main.includes("HeroPreview"));
  assert.ok(main.includes("HomePreview"));
  /* The dispatch still falls through to the hero, so `/` never changes. */
  assert.match(
    main,
    /"home" \? <HomePreview \/> : view\(\) === "shell" \? <ShellPreview \/> : <HeroPreview \/>/,
    "the hero preview must remain the default view"
  );

  for (const surface of ["HeroPreview.jsx", "ShellPreview.jsx", "HomePreview.jsx"]) {
    const source = read(`src/components/storefront/preview/${surface}`);
    assert.match(source, /import\.meta\.env\.DEV/, `${surface} is not development-gated`);
  }
  /* The document itself is unchanged by this phase. */
  assert.ok(read("preview.html").includes("preview/main.jsx"));
});

test("the full composition renders the shell, the hero and the new sections together", async () => {
  const preview = modules.HomePreview;
  const html = await render(
    React.createElement(
      preview.WithProviders,
      null,
      React.createElement(preview.HomeSurface, { dataMode: "fixture" })
    )
  );

  /* Phase 2A shell */
  assert.ok(html.includes("pf-shell__announce"), "no announcement rail");
  assert.ok(html.includes("pf-shell__header"), "no 2A header");
  /* Phase 1 hero, still the approved component */
  assert.ok((html.match(/pf-hero/g) || []).length > 50, "the hero is missing");
  /* Phase 2B sections, in order */
  const order = ["pf-sec-collage", "pf-sec-saree", "pf-sec-bridal", "pf-sec-jewel", "pf-sec-offer", "pf-sec-men", "pf-sec-kids", "pf-sec-best", "pf-sec-look", "pf-sec-trust"];
  let cursor = -1;
  for (const marker of order) {
    const at = html.indexOf(marker);
    assert.ok(at > cursor, `${marker} missing or out of order in the composition`);
    cursor = at;
  }
  /* Fixture mode is visible in the DOM, and no iframe is used inside the page. */
  assert.ok(html.includes('data-home-surface="preview-fixture"'));
  assert.equal(html.includes("<iframe"), false);
  assert.equal(html.includes(LEGACY_PREFIX), false);
});

test("the preview root opens the full composition, and every surface stays reachable", () => {
  const main = read("src/components/storefront/preview/main.jsx");

  /* The preview panel opens the port root inside a frame with NO address bar,
     so a surface reachable only through `?view=…` was unreachable for the
     reviewer. The default surface is therefore the full composition — and the
     decision lives in the ONE place that reads the browser's own URL. */
  const declaredDefault = main.match(/const DEFAULT_VIEW = "([^"]+)";/);
  assert.ok(declaredDefault, "the harness no longer declares its default surface");
  assert.equal(declaredDefault[1], "home");

  /* Run the harness's REAL dispatch text against the URLs a reviewer can meet.
     (main.jsx itself touches `document` at module scope, so the function is
     extracted and executed rather than the module imported.) */
  const dispatch = main.match(/const view = \(\) => \{[\s\S]*?\n\};/)?.[0];
  assert.ok(dispatch, "the harness dispatch was not found");
  const constant = main.match(/const DEFAULT_VIEW = "[^"]+";/)[0];
  const viewFor = (search) =>
    new Function("window", `${constant}\n${dispatch}\nreturn view;`)({ location: { search } })();

  assert.equal(viewFor(""), "home", "a bare root must open the composition");
  assert.equal(viewFor("?data=fixture"), "home", "data mode must not change the surface");
  assert.equal(viewFor("?embed=1"), "home");
  assert.equal(viewFor("?view=home"), "home");
  assert.equal(viewFor("?view=home&data=fixture"), "home");
  assert.equal(viewFor("?view=shell"), "shell", "?view=shell must still select the 2A shell");
  assert.equal(viewFor("?view=hero"), "hero", "the Phase 1 hero preview must stay reachable");
  assert.equal(viewFor("?view=nonsense"), "hero");

  /* …and the dispatch still falls through to the hero, so the surface
     `?view=hero` renders is the one the 2A suite pins. */
  assert.match(
    main,
    /"home" \? <HomePreview \/> : view\(\) === "shell" \? <ShellPreview \/> : <HeroPreview \/>/
  );

  /* The server-side middleware is unchanged: paths only, never query strings. */
  const middleware = read("preview/vite-preview-server.mjs");
  assert.match(middleware, /if \(pathname === "\/"\) \{\s*req\.url = `\$\{PREVIEW_DOCUMENT\}\$\{query\}`;/);
  assert.equal(middleware.includes("URLSearchParams"), false, "the middleware must not rewrite surfaces");

  /* …and the harness switches surfaces in-page, since the frame cannot. */
  const switcher = read("src/components/storefront/preview/PreviewViewSwitcher.jsx");
  for (const href of ['"/?view=hero"', '"/?view=shell"', '"/?view=home"']) {
    assert.ok(switcher.includes(href), `the switcher lost ${href}`);
  }
  for (const [file, current] of [
    ["HeroPreview.jsx", "hero"],
    ["ShellPreview.jsx", "shell"],
    ["HomePreview.jsx", "home"],
  ]) {
    assert.ok(
      read(`src/components/storefront/preview/${file}`).includes(`<PreviewViewSwitcher current="${current}" />`),
      `${file} does not offer the surface switcher`
    );
  }
});

test("the full-composition preview keeps every review control and label", async () => {
  const source = read("src/components/storefront/preview/HomePreview.jsx");
  for (const marker of [
    "PREVIEW_FIXTURE_LABEL",
    "Responsive width",
    "Desktop 1280",
    "Tablet 834",
    "Mobile 390",
    "Auto (backend first)",
    "Preview fixture",
    "LIVE backend data",
  ]) {
    assert.ok(source.includes(marker), `HomePreview.jsx lost "${marker}"`);
  }
  assert.ok(source.includes("HomeSections"));
  assert.ok(source.includes("HeroEditorial"));
  assert.ok(source.includes("StorefrontHeader"));
  assert.ok(source.includes("AnnouncementBar"));
});

/* ── CSS discipline ──────────────────────────────────────────────────── */

test("the stylesheet is namespaced and cannot reach the portals", () => {
  const css = read(`${SECTIONS_DIR}/home-sections.css`).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(css.includes("@import"), false);

  const selectors = [...css.matchAll(/(^|\})([^{}]+)\{/g)].map((match) => match[2].trim()).flatMap((block) => block.split(","));
  assert.ok(selectors.length > 200, "the selector sweep found nothing");

  for (const selector of selectors) {
    const cleaned = selector.trim();
    if (!cleaned || cleaned.startsWith("@")) continue;
    assert.ok(/^\.pf-sec/.test(cleaned), `selector escapes the namespace: ${cleaned}`);
    assert.equal(cleaned.includes("*"), false, `selector reaches every element: ${cleaned}`);
  }
  /* Element selectors and custom-property roots are the things that leak.
     (`.pf-sec-offer__body` is a class name, not an element selector.) */
  assert.equal(/(^|[}\\s,;{])(body|html)\\s*[,{]/.test(css), false, "stylesheet sets an element selector");
  assert.equal(/:root/.test(css), false, "stylesheet declares custom properties on :root");
  assert.equal(/!important/.test(css), false, "stylesheet uses !important");
});

test("no bleed can ever push a horizontal scrollbar onto the page", () => {
  const css = read(`${SECTIONS_DIR}/home-sections.css`).replace(/\/\*[\s\S]*?\*\//g, "");
  const ruleFor = (selector) => {
    const at = css.indexOf(`${selector} {`);
    return at === -1 ? "" : css.slice(at, css.indexOf("}", at));
  };

  /* Sections whose decoration bleeds past their column clip it. */
  for (const guarded of ["saree", "bridal", "offer", "kids"]) {
    const rule = ruleFor(`.pf-sec-${guarded}`);
    assert.ok(rule.includes("overflow: hidden"), `.pf-sec-${guarded} does not clip its bleed`);
  }

  /* The two gaps that reach OUTSIDE the page gutter are capped at the gutter. */
  const stage = ruleFor(".pf-sec-jewel__stage");
  assert.ok(
    stage.includes("margin-inline: max(-20px, calc(var(--pf-gutter) * -1))"),
    "the jewel stage bleed is not capped at the page gutter"
  );

  const frame = ruleFor(".pf-sec-look__frame");
  assert.ok(
    frame.includes("left: max(-18px, calc(var(--pf-gutter) * -1))"),
    "the lookbook frame offset is not capped at the page gutter"
  );

  /* The jewel section is the one with a sticky child, so it must NOT clip. */
  assert.equal(
    ruleFor(".pf-sec-jewel").includes("overflow: hidden"),
    false,
    "clipping the jewel section would break its sticky stage"
  );
});

test("every pf-sec class the components use exists in the stylesheet", async () => {
  const css = read(`${SECTIONS_DIR}/home-sections.css`).replace(/\/\*[\s\S]*?\*\//g, "");
  const declared = new Set([...css.matchAll(/\.(pf-sec[A-Za-z0-9_-]*)/g)].map((match) => match[1]));

  const used = new Set();
  for (const file of sectionSources()) {
    if (!/\.jsx$/.test(file)) continue;
    const source = read(join(SECTIONS_DIR, file));
    for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
      const literal = match[1] ?? match[2] ?? match[3] ?? "";
      for (const token of literal.split(/[\s`${}?:"'()|]+/)) {
        /* A template literal interpolation leaves a dangling `--` prefix
           (`pf-sec-collage__tile--${variant}`); its variants are styled. */
        if (/^pf-sec[A-Za-z0-9_-]*$/.test(token) && !token.endsWith("-")) used.add(token);
      }
    }
    for (const match of source.matchAll(/"(pf-sec[A-Za-z0-9_-]*)"/g)) used.add(match[1]);
  }

  assert.ok(used.size >= 40, `the class sweep found only ${used.size} classes`);
  for (const token of used) {
    assert.ok(declared.has(token), `${token} is used but never styled`);
  }
});

test("reduced motion is respected", () => {
  const css = read(`${SECTIONS_DIR}/home-sections.css`);
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
  /* Animation comes from the design system's reveal primitives, which already
     short-circuit under reduced motion, or from framer-motion. */
  for (const file of sectionSources()) {
    if (!/\.jsx$/.test(file)) continue;
    const source = read(join(SECTIONS_DIR, file));
    if (source.includes("motion.")) {
      assert.ok(
        source.includes("useReducedMotion") ||
          source.includes("AnimatePresence") ||
          source.includes("InView") ||
          source.includes("MaskReveal") ||
          source.includes("FadeUp"),
        `${file} animates outside the design system's reduced-motion primitives`
      );
    }
  }
});

test("the sections keep B's scroll-reveal vocabulary", () => {
  const jsx = sectionSources().filter((file) => /\.jsx$/.test(file)).map((file) => read(join(SECTIONS_DIR, file))).join("\n");
  assert.ok(jsx.includes("FadeUp"));
  assert.ok(jsx.includes("MaskReveal"));
  assert.ok(jsx.includes("SectionLabel"));
  assert.equal(jsx.includes("IntersectionObserver"), false, "reveals must use the design system");
});

/* ------------------------------------------------------------------ */
/* Phase 2D.2 — the framed lookbook column, with and without covers     */
/* ------------------------------------------------------------------ */

/**
 * The defect a browser found: the frame is drawn out of flow around the plate,
 * so with no plate the wrap collapsed to zero height and the section rendered a
 * blank blush block with a two-pixel outline in it — above the service strip.
 */
test("the lookbook draws no frame, and no empty column, when no collection has a cover", async () => {
  const { SectionLookbook } = await importLookbook();
  const moods = [
    { key: "silk", label: "Silk", note: "Banarasi, Kanjeevaram and the silks the house weaves.", to: "/collections/silk", image: null, count: 3, products: [] },
    { key: "cotton", label: "Cotton", note: "Handloom cotton, woven for the everyday.", to: "/collections/cotton", image: null, count: 4, products: [] },
  ];
  const html = await render(
    React.createElement(SectionLookbook, { data: { label: "Collections", index: "10", title: "The Collections", titleAccent: "as moods", moods } })
  );

  assert.match(html, /pf-sec-look/, "the section renders its copy");
  assert.equal(html.includes("pf-sec-look__frame"), false, "an outline around nothing is the blank framed block this pins");
  assert.equal(html.includes("pf-sec-look__visual"), false, "the empty column is gone, so nothing is reserved for it");
  assert.match(html, /pf-sec-look__grid--body-only/, "the body takes the whole row instead of leaving a blank column");
  /* The copy the desk authored survives. */
  assert.match(html, />Silk</);
  assert.match(html, />Cotton</);
});

test("the lookbook opens on a collection that can fill the frame, and keeps the frame when one can", async () => {
  const { SectionLookbook } = await importLookbook();
  const plate = { src: "/aarna-design/cat-women.webp" };
  const moods = [
    { key: "silk", label: "Silk", note: "Banarasi, Kanjeevaram and the silks the house weaves.", to: "/collections/silk", image: null, count: 3, products: [] },
    { key: "cotton", label: "Cotton", note: "Handloom cotton, woven for the everyday.", to: "/collections/cotton", image: plate, count: 4, products: [] },
  ];
  const html = await render(
    React.createElement(SectionLookbook, { data: { label: "Collections", index: "10", title: "The Collections", titleAccent: "as moods", moods } })
  );

  /* The framed column exists, and it opens on the mood that has a plate rather
     than on an outline with nothing behind it. */
  assert.match(html, /pf-sec-look__frame/, "the frame is drawn when a collection can fill it");
  assert.match(html, /pf-sec-look__visual/, "the framed column is back");
  assert.equal(html.includes("pf-sec-look__grid--body-only"), false, "the body keeps its own column");
  assert.match(html, /<img[^>]+src="\/aarna-design\/cat-women\.webp"/, "the plate that exists is the one painted");
  assert.match(html, /Handloom cotton, woven for the everyday\./, "the open mood's note is the one shown");
});
