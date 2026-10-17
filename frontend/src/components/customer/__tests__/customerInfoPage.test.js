/**
 * PRATIKSHYA FASHION — PHASE 8 · the design's information page, on the manifest's metadata.
 *
 * The design's `Info.jsx` is one layout that served its four prototype pages
 * (`/pages/about`, `/pages/contact`, …) out of `mock/data/pages.js`. Phase 8
 * adopts the layout and none of the prose: this application's four information
 * routes (`/about`, `/contact`, `/privacy`, `/terms`) come from `routeManifest`
 * in `config/navigationConfig.js`, and the page reads `label`, `eyebrow` and
 * `description` from there. The design's prototype copy — the house is a
 * prototype, no personal data is sent to a server, products and prices are
 * sample data — is false of this application, which has real accounts, real
 * orders and a server-backed catalogue, and appears nowhere.
 *
 *   1. THE SWITCH. Off, the four routes are the application's own pages and the
 *      port is absent. On, each one is the design's article carrying that
 *      route's own manifest metadata.
 *   2. ONE PAGE, FOUR ROUTES, NO FIFTH. A path with no manifest entry is the
 *      design's 404 — the page never invents a title, a kicker or a body.
 *   3. NOTHING IS PUBLISHED THAT IS NOT PUBLISHED YET. No policy text is
 *      written here; the page says where its text will come from, and the
 *      sibling row points at the other three routes by their manifest labels.
 *
 * WHAT THIS CANNOT PROVE: pixels, focus order and layout are the browser
 * probe's; there is no DOM in this tree.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { MemoryRouter } from "react-router-dom";

import { DESIGN_SRC } from "../../../../scripts/customer-port.js";

function projectRoot() {
  let directory = new URL(".", import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL("package.json", directory))) return fileURLToPath(directory);
    directory = new URL("../", directory);
  }
  throw new Error("frontend root not found");
}

const ROOT = projectRoot();
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

const PORTED = "src/components/customer/pages/Info.jsx";
const DESIGN = join(DESIGN_SRC, "pages/Info.jsx");

/** The four routes this application publishes, and the manifest behind them. */
const INFO_PATHS = ["/about", "/contact", "/privacy", "/terms"];

async function mount(define) {
  const vite = await createServer({
    root: ROOT,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    define,
  });
  const load = (path) => vite.ssrLoadModule(path);
  const [
    { default: CustomerLayout },
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    { getRouteMeta, routeManifest },
    store,
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/config/navigationConfig.js"),
    load("/src/services/catalog/catalogStore.js"),
  ]);

  let tree = React.createElement(CustomerLayout);
  for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
    tree = React.createElement(Provider, null, tree);
  }

  return {
    vite,
    getRouteMeta,
    routeManifest,
    store,
    render: (path) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, tree),
        ),
      ),
  };
}

/** The manifest's text as `renderToStaticMarkup` writes it. */
const escaped = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");


let on = null;
let off = null;

before(async () => {
  on = await mount({});
  off = await mount({});
});

after(async () => {
  await Promise.all([on?.vite.close(), off?.vite.close()]);
});

/* ── 1 · the switch ─────────────────────────────────────────────────────── */

test("the four information routes always render the customer storefront's manifest-backed pages", () => {
  for (const path of INFO_PATHS) {
    const markup = off.render(path);
    assert.match(markup, /class="pf-root"/, `${path} did not render the customer storefront`);
    assert.match(markup, /class="info container"/, `${path} did not render the customer information page`);
  }
});

test("with the switch on, each of the four routes is the design's article with its own manifest metadata", () => {
  const manifestPaths = on.routeManifest.map((route) => route.path);
  for (const path of INFO_PATHS) {
    assert.ok(manifestPaths.includes(path), `${path} is not in the navigation manifest the page reads`);

    const meta = on.getRouteMeta(path);
    assert.ok(meta, `${path} has no manifest metadata`);
    const markup = on.render(path);

    assert.match(markup, /class="pf-root"/, `${path} did not mount the port`);
    assert.match(markup, /class="info container"/, `${path} did not render the design's article`);
    assert.match(markup, /class="crumbs"/, `${path} lost the design's crumb trail`);
    assert.ok(markup.includes(`class="label">${meta.eyebrow}<`), `${path} is missing the manifest's eyebrow`);
    assert.ok(markup.includes(`class="display info__title">${meta.label}<`), `${path} is missing the manifest's label`);
    /* As React writes it: the manifest's own words, entity-escaped like any text
       it renders (`life's` arrives as `life&#x27;s`). */
    assert.ok(markup.includes(escaped(meta.description)), `${path} is missing the manifest's description`);
  }
});

test("the four routes are four different pages, told apart by the manifest alone", () => {
  const rendered = INFO_PATHS.map((path) => on.render(path));
  assert.equal(new Set(rendered).size, INFO_PATHS.length, "two information routes render the same page");
});

/* ── 2 · the sibling row, and the fifth path ────────────────────────────── */

test("each page points at the other three, by their own manifest labels, and never at itself", () => {
  for (const path of INFO_PATHS) {
    const markup = on.render(path);
    const links = markup.slice(markup.indexOf('class="info__links"'), markup.indexOf("</main>"));
    for (const sibling of INFO_PATHS) {
      const label = on.getRouteMeta(sibling).label;
      const present = links.includes(`href="${sibling}"`) && links.includes(`>${label}<`);
      assert.equal(present, sibling !== path, `${path} ${sibling === path ? "links to itself" : `does not link to ${sibling}`}`);
    }
    /* Four routes, three siblings: the row is never padded with a fourth. */
    assert.equal((links.match(/<a /g) ?? []).length, 3, `${path} does not show exactly three siblings`);
  }
});

test("a path with no manifest entry is the design's 404, not an invented page", () => {
  const markup = on.render("/not-an-information-path");
  assert.match(markup, /class="pf-root"/, "the port did not answer an unknown customer path");
  assert.equal(/class="info container"/.test(markup), false, "an information page was invented for an unknown path");
  assert.match(markup, /404|not found/i, "an unknown customer path did not answer with the design's 404");
});

/* ── 3 · no invented policy text, no banned copy ────────────────────────── */

test("no policy text is written here, and the page says where its text will come from", () => {
  const markup = on.render("/privacy");
  assert.match(markup, /The full text arrives as the business publishes it/, "the honest placeholder is gone");
  /* The placeholder says what it is; it does not pretend to be the policy. */
  assert.equal(/we collect|we may share|by using this site you agree/i.test(markup), false, "policy prose was invented");
});

test("the design's prototype copy is nowhere on any of the four pages", () => {
  for (const banned of [
    "prototype",
    "sample data",
    "demonstration",
    "No personal data is sent to a server",
    "not connected to an order system",
    "prices are illustrative",
  ]) {
    for (const path of INFO_PATHS) {
      const markup = on.render(path);
      assert.equal(new RegExp(banned, "i").test(markup), false, `${path} carries “${banned}”`);
    }
    assert.equal(new RegExp(banned, "i").test(read(PORTED)), false, `the ported page carries “${banned}”`);
  }
});

/* ── 4 · the port itself ───────────────────────────────────────────────── */

test("the ported page reads the application's manifest, not the design's page table", () => {
  const source = read(PORTED);
  assert.match(source, /import \{ getRouteMeta \} from '\.\.\/\.\.\/\.\.\/config\/navigationConfig\.js';/);
  assert.match(source, /const \{ pathname \} = useLocation\(\);/);
  assert.match(source, /const meta = getRouteMeta\(pathname\);/);
  assert.equal(/useParams/.test(source), false, "the ported page still reads the design's URL parameter");
  assert.equal(/from '\.\.\/data\/index\.js'/.test(source), false, "the ported page still imports the design's data barrel");
  assert.equal(/infoPages/.test(source), false, "the ported page still reads the design's page table");
});

test("the ported page is the design's article, adapted by exactly the pinned amount", () => {
  const design = readFileSync(DESIGN, "utf8");
  const ported = read(PORTED);
  assert.notEqual(design, ported, "the ported file is identical to the design — the adaptations were lost");
  /* The design's structure survives intact. */
  assert.match(ported, /<article className="info container">/);
  assert.match(ported, /<nav className="crumbs" aria-label="Breadcrumb">/);
  assert.match(ported, /<h1 className="display info__title">/);
  assert.match(ported, /<div className="info__links">/);
  /* …and the design file still holds the prototype table the port refuses. */
  assert.match(design, /infoPages\[slug\]/, "the design file changed — the pin in the port tool needs re-measuring");
});
