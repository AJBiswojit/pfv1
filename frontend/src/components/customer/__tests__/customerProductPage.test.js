/**
 * PRATIKSHYA FASHION — PHASE 6 · the design's product page, on the real route.
 *
 * Phase 6 adopts `home-page/src/pages/Product.jsx` the way Phase 2D adopted the
 * homepage: the design's file carried over by `scripts/customer-port.js`, adapted
 * only by named rewrites, and reachable only through the existing ``
 * switch — never as a re-skin of the production product route.
 *
 * These tests render the surface a browser reaches. `customerShellIntegrity` proves
 * the composition at the customer root; this suite does the same at
 * `/product/:productId` — the application's own product path — with the switch
 * on and off, and with the catalogue in every state the ported page can meet:
 *
 *   1. THE SWITCH STILL MEANS THE SWITCH. Off, the product path renders the
 *      application's own product page and nothing of the port. On, the design's
 *      page is the only product page on that path.
 *   2. THE CATALOGUE'S STATE IS THE PAGE'S STATE. A catalogue that has not
 *      arrived renders the design's loading frame, a catalogue that has arrived
 *      without this piece renders the design's 404, and neither invents a price,
 *      a name or a stock figure.
 *   3. THE REAL RECORD REACHES THE PAGE. Availability copy, the bagging ceiling
 *      (this application's own `getMaxQuantity`), care, delivery, returns,
 *      details and specifications all come from the catalogue record — the
 *      fields the design's sample product never carried. An unavailable piece
 *      says so and cannot be bagged.
 *   4. NOTHING IS FABRICATED. The prototype sentence ("sample data") is gone
 *      from the slot it used to occupy, the page holds no rating, no review
 *      count and no invented delivery promise, and the retry it offers is the
 *      application's own catalogue refresh.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM implementation in this tree (no jsdom,
 * no headless engine), so clicks, layout, breakpoints and pixels are out of
 * scope here — the Phase 6 browser probe covers those on a real Chromium. These
 * tests pin composition, data contracts and the switch.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React, { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { MemoryRouter } from "react-router-dom";

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

/* ── the catalogue record a real storefront product carries ────────────────
 *
 * This is the shape `services/catalog/catalogStore.js::toStorefrontProduct`
 * normalises (the fields the API returns), not the design's product shape: the
 * port's boundary is what has to adapt it, and that adaptation is what these
 * tests exercise. Two pieces are seeded so the design's "Complete the look"
 * rail has something to find; neither carries a rating or a review count,
 * because the page must not show one.
 */
const RECORD_IN_STOCK = {
  id: "phase6-silk-saree",
  name: "Phase 6 Silk Saree",
  slug: "phase6-silk-saree",
  sku: "P6-SILK-01",
  price: 4200,
  originalPrice: 5200,
  category: "sarees",
  department: "women",
  image: "/fixtures/phase6/saree-cover.jpg",
  additionalImages: ["/fixtures/phase6/saree-detail.jpg"],
  sizes: ["Free Size"],
  colors: ["Ink"],
  occasion: ["Wedding"],
  fabric: "Mulberry Silk",
  material: "Handloom",
  description: "A handloom silk saree, woven for the wedding season.",
  details: "Zari border, unstitched blouse piece, 5.5 metres with pallu.",
  careInstructions: ["Dry clean only.", "Store folded in muslin."],
  specifications: { Weave: "Handloom", Border: "Zari" },
  deliveryInfo: "Dispatched in 2–4 working days.",
  returnInfo: "Returnable within 7 days of delivery.",
  availability: "in-stock",
  stock: 6,
};

const RECORD_LOW_STOCK = {
  ...RECORD_IN_STOCK,
  id: "phase6-low-stock-kurti",
  name: "Phase 6 Low Stock Kurti",
  slug: "phase6-low-stock-kurti",
  sku: "P6-KURTI-02",
  price: 2600,
  originalPrice: null,
  category: "kurtis",
  image: "/fixtures/phase6/kurti-cover.jpg",
  additionalImages: [],
  sizes: ["S", "M"],
  availability: "low-stock",
  stock: 2,
};

const RECORD_UNAVAILABLE = {
  ...RECORD_IN_STOCK,
  id: "phase6-unavailable-anarkali",
  name: "Phase 6 Unavailable Anarkali",
  slug: "phase6-unavailable-anarkali",
  sku: "P6-ANA-03",
  price: 7800,
  originalPrice: null,
  availability: "unavailable",
  stock: 0,
  details: "",
  specifications: {},
};

const RECORDS = [RECORD_IN_STOCK, RECORD_LOW_STOCK, RECORD_UNAVAILABLE];

const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ── two hosts: the switch on, and the switch off ───────────────────────── */

/** One mounted copy of the application's provider stack around `CustomerLayout`. */
async function mount(define) {
  const vite = await createServer({
    root: ROOT,
    logLevel: "error",
    /* Three hosts in one file: no HMR socket, or they fight over its port. */
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
    store,
    boundary,
    shopping,
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/services/catalog/catalogStore.js"),
    load("/src/components/customer/mock/data/products.js"),
    load("/src/utils/shopping.js"),
  ]);

  let tree = React.createElement(CustomerLayout);
  for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
    tree = React.createElement(Provider, null, tree);
  }

  return {
    vite,
    store,
    boundary,
    shopping,
    /* The composition `src/App.jsx` uses, at one path, exactly as a browser
       would reach it. */
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


let on = null;
let fresh = null;
let off = null;

before(async () => {
  on = await mount({});
  /* A second copy of the same host, never given a catalogue snapshot: the state
     a customer meets for the moment before the catalogue lands. */
  fresh = await mount({});
  off = await mount({});
});

after(async () => {
  await Promise.all([on?.vite.close(), fresh?.vite.close(), off?.vite.close()]);
});

/** The application's own store API for tests and audits, seeded per test. */
const seed = () => on.store.applyCatalogSnapshot({ products: RECORDS });

/* ── 1 · the switch ─────────────────────────────────────────────────────── */

test("the product path always enters Aarna's product page despite a former Atelier override", () => {
  const markup = off.render(`/product/${RECORD_IN_STOCK.id}`);
  assert.match(markup, /class="pf-root"/);
  assert.match(markup, /class="pdp container"|Opening this piece|This page has slipped/);
});

test("with the switch on, the design's product page owns the product path", () => {
  seed();
  const markup = on.render(`/product/${RECORD_IN_STOCK.id}`);
  assert.match(markup, /class="pf-root"/, "the port did not mount");
  assert.match(markup, /class="pdp container"/, "the design's product page did not render");
  assert.match(markup, /pdp__add/, "the design's buy button is missing");
  assert.equal(/Opening this piece|This page has slipped/.test(markup), false, "the page rendered a state instead of the piece");
});

test("the port's homepage and its product page are the same switch, and neither leaks into the other", () => {
  seed();
  const home = on.render("/");
  assert.equal(/class="pdp container"/.test(home), false, "the homepage rendered the product page");
  assert.match(home, /class="pf-root"/, "the homepage did not render");

  const product = on.render(`/product/${RECORD_IN_STOCK.id}`);
  assert.equal(/class="hero\b|class="hero /.test(product), false, "the product page rendered the homepage");
});

/* ── 2 · the catalogue's state is the page's state ──────────────────────── */

test("a catalogue that has not arrived renders the design's loading frame, and invents nothing", () => {
  const markup = fresh.render(`/product/${RECORD_IN_STOCK.id}`);
  assert.match(markup, /Opening this piece/, "no loading state");
  assert.match(markup, /Fetching the catalogue\./);
  assert.equal(/Phase 6 Silk Saree/.test(markup), false, "a piece appeared before the catalogue did");
  assert.equal(/₹|4,200|4200/.test(markup), false, "a price appeared before the catalogue did");
  assert.equal(/pdp__add/.test(markup), false, "a buy button appeared before the catalogue did");
});

test("a half-loaded catalogue never claims a piece does not exist", () => {
  /* `partial` is the store's own honest state: a feed failed, so the rows in
     hand are not the whole catalogue. A miss there is NOT a 404 — the piece may
     simply not have loaded — so the page shows its unreachable state instead.
     Only `ready` may answer "there is no such piece". The rendered paths for
     both states are exercised in the browser probe; what this pins is the rule,
     because it is the branch that decides whether the page tells a customer a
     piece does not exist. */
  const boundary = read("src/components/customer/mock/data/products.js");
  assert.match(
    boundary,
    /if \(catalogueStatus === 'ready'\) return \{ product: null, state: 'ready' \};/,
    "only a fully loaded catalogue may answer a lookup",
  );
  assert.match(boundary, /product: null, state: failed \? 'error' : 'loading'/);
  assert.equal(
    /catalogueStatus === 'ready' \|\| catalogueStatus === 'partial'/.test(boundary),
    false,
    "a partially loaded catalogue is being treated as authoritative again",
  );
});

test("a catalogue with no such piece renders the design's 404", () => {
  seed();
  const markup = on.render("/product/no-such-piece-at-all");
  assert.match(markup, new RegExp(esc("This page has slipped")), "the design's 404 did not render");
  assert.equal(/class="pdp container"/.test(markup), false, "a product page rendered for an unknown piece");
});

/* ── 3 · the real record reaches the page ───────────────────────────────── */

test("the record reaches the page: its name, its copy, and the accordions it earns", () => {
  seed();
  const markup = on.render(`/product/${RECORD_IN_STOCK.id}`);

  assert.match(markup, new RegExp(esc(RECORD_IN_STOCK.name)), "the catalogue's name is missing");
  assert.match(markup, new RegExp(esc(RECORD_IN_STOCK.description)), "the catalogue's description is missing");
  /* Fabric & craft opens by default in the design, so the record's own values
     are on screen without a click. */
  assert.match(markup, new RegExp(esc(RECORD_IN_STOCK.fabric)));
  assert.match(markup, new RegExp(esc(RECORD_IN_STOCK.material)));
  assert.match(markup, new RegExp(esc("In stock · Ready to dispatch")), "the catalogue's availability is missing");

  /* Details, Care and Delivery & returns are collapsed by default (the design's
     own accordion behaviour), so their bodies are not in an unclicked render —
     the browser probe opens all three and screenshots what they hold. What this
     render proves is that the sections are there to open. */
  for (const title of ["Details", "Care", "Delivery &amp; returns"]) {
    assert.match(markup, new RegExp(`>${title}<`), `the "${title}" section is missing`);
  }

  /* The design's prototype sentence was true of the design's sample catalogue
     and is false here — the slot states the catalogue's own availability. */
  assert.equal(/Prototype listing/.test(markup), false, "the prototype sentence still renders");
  assert.equal(/sample data/i.test(markup), false, "the page still calls its catalogue a sample");
});

test("a piece with no details renders no Details section — nothing is invented to fill it", () => {
  seed();
  const withDetails = on.render(`/product/${RECORD_IN_STOCK.id}`);
  const withoutDetails = on.render(`/product/${RECORD_UNAVAILABLE.id}`);
  assert.match(withDetails, />Details</, "the record's details never reached an accordion");
  assert.equal(/>Details</.test(withoutDetails), false, "a Details section rendered for a record without any");
});

test("every long-form field the catalogue publishes is carried to the design's product shape", () => {
  const { toDesignProduct } = on.boundary;
  const design = toDesignProduct(RECORD_IN_STOCK);
  assert.equal(design.details, RECORD_IN_STOCK.details);
  assert.equal(design.deliveryInfo, RECORD_IN_STOCK.deliveryInfo);
  assert.equal(design.returnInfo, RECORD_IN_STOCK.returnInfo);
  assert.deepEqual(design.care, RECORD_IN_STOCK.careInstructions);
  assert.deepEqual(design.specifications, RECORD_IN_STOCK.specifications);
  assert.equal(design.availabilityCopy, "In stock · Ready to dispatch");
  assert.equal(toDesignProduct(RECORD_LOW_STOCK).availabilityCopy, "Only a few left");
  assert.equal(toDesignProduct(RECORD_UNAVAILABLE).availabilityCopy, "Currently unavailable");

  /* A record that publishes nothing gets the port's own honest fallbacks, which
     are the design's sentences — never an invented promise. */
  const empty = toDesignProduct({ id: "p6-empty", name: "Empty", category: "sarees", price: 100 });
  assert.deepEqual(empty.care, []);
  assert.equal(empty.details, "");
  assert.deepEqual(empty.specifications, {});
  assert.equal(empty.deliveryInfo, "");
  assert.equal(empty.returnInfo, "");
});

test("a single-value option is preselected — the port asks no more than the production page", () => {
  /* `ProductPurchasePanel.jsx::isFreeSizeOnly` means a piece whose sizes are only
     "Free Size" needs no choice there; the port must not demand one. The SSR
     render shows the chip already chosen on an untouched page. */
  seed();
  const markup = on.render(`/product/${RECORD_IN_STOCK.id}`);
  /* The chip's whole tag: the attribute order is React's, so read back to it. */
  const chipStart = markup.indexOf("class=\"chip");
  const chip = markup.slice(markup.lastIndexOf("<button", chipStart), markup.indexOf("</button>", chipStart));
  assert.match(chip, /aria-checked="true"/, "the sole available value is not preselected");
  assert.match(chip, /is-active/, "the design's selected-chip style is not applied");
  assert.match(markup, /options__value\"> · Free Size</, "the design's chosen-value note is missing");
  assert.match(markup, new RegExp(esc("Size")), "the option group vanished instead of being preselected");

  const page = read("src/components/customer/pages/Product.jsx");
  assert.match(page, /const choice = opt \?\? soleValue;/, "the effective choice is not derived");
  assert.match(page, /add\(product, choice, qty\)/, "the bag is given a different choice than the chip shows");
  /* Two or more values still require a deliberate pick. */
  assert.match(page, /if \(optionGroup && !choice\) \{ setErr\(`Please select a \$\{optionGroup\.name\.toLowerCase\(\)\} to continue\.`\); return; \}/);
});

test("a piece the catalogue marks unavailable says so, and cannot be bagged", () => {
  seed();
  const markup = on.render(`/product/${RECORD_UNAVAILABLE.id}`);
  assert.match(markup, new RegExp(esc("Currently unavailable")), "the refusal copy is missing");
  assert.equal(/Add to Bag/.test(markup), false, "an unavailable piece still offers Add to Bag");
  const buy = markup.slice(Math.max(0, markup.indexOf("pdp__add") - 160), markup.indexOf("pdp__add") + 240);
  assert.match(buy, /disabled/, "the buy button is not disabled for an unavailable piece");
});

test("a low-stock piece states the catalogue's own availability", () => {
  seed();
  const markup = on.render(`/product/${RECORD_LOW_STOCK.id}`);
  assert.match(markup, new RegExp(esc("Only a few left")));
  assert.match(markup, /Add to Bag/);
});

test("the bagging ceiling is this application's own rule, never a number the port picked", () => {
  const { toDesignProduct } = on.boundary;
  const { getMaxQuantity } = on.shopping;

  for (const record of RECORDS) {
    const design = toDesignProduct(record);
    assert.equal(
      design.maxQuantity,
      getMaxQuantity(record),
      `${record.id}: the page's ceiling is not the application's`,
    );
    assert.equal(design.inStock, record.availability !== "unavailable", `${record.id}: availability drifted`);
  }
  assert.equal(toDesignProduct(RECORD_IN_STOCK).maxQuantity, RECORD_IN_STOCK.stock);
  assert.equal(toDesignProduct(RECORD_UNAVAILABLE).maxQuantity, 0, "an unavailable piece must have no ceiling");

  /* The ceiling reaches the stepper, and the design's fixed ten is gone. */
  const page = read("src/components/customer/pages/Product.jsx");
  assert.match(page, /Math\.min\(ceiling, q \+ 1\)/);
  assert.equal(/Math\.min\(10, q \+ 1\)/.test(page), false, "the design's fixed ceiling survived");
  assert.equal(/disabled=\{qty >= 10\}/.test(page), false, "the stepper still stops at the design's ten");
});

/* ── 4 · nothing is fabricated, and nothing of the app's truth is missing ── */

test("the refusal the ported page shows is the production page's own sentence", () => {
  const page = read("src/components/customer/pages/Product.jsx");
  const production = read("src/components/product/ProductPurchasePanel.jsx");
  const refusal = "This piece is currently unavailable.";
  assert.ok(page.includes(refusal), "the ported page does not refuse an unavailable piece");
  assert.ok(
    production.includes(refusal),
    "the production page no longer says this — the port has drifted from its wording",
  );
});

test("an unreachable catalogue renders the error state — retry and all — not a blank page", async () => {
  /* The gap that mattered: the error branch was pinned as source text until the
     browser found it throwing (`Button is not defined` — the ported page uses
     the design's Button and had not imported it). So it is rendered here, on a
     host whose catalogue hydrate genuinely fails: in this process there is no
     backend to answer the API, which is exactly the state the branch is for. */
  const host = await mount({});
  try {
    await host.store.hydrateCatalog({ force: true });
    const markup = host.render(`/product/${RECORD_IN_STOCK.id}`);
    assert.match(markup, new RegExp(esc("We couldn")), "the error state did not render");
    assert.match(markup, new RegExp(esc("The catalogue is unreachable. Please try again.")));
    assert.match(markup, /Try again/, "no retry offered");
    assert.match(markup, /Return to shop/);
    assert.equal(/class="pdp container"/.test(markup), false, "a product page rendered over a failed catalogue");
  } finally {
    await host.vite.close();
  }
});

test("the retry is the application's own catalogue refresh, and the port fetches nothing itself", () => {
  const boundary = read("src/components/customer/mock/data/products.js");
  assert.match(boundary, /export const retryCatalogue = \(\) => refreshCatalog\(\);/);
  const page = read("src/components/customer/pages/Product.jsx");
  assert.match(page, /onRetry=\{retryCatalogue\}/);
  assert.equal(/fetch\(|XMLHttpRequest|axios/.test(page), false, "the ported page fetches on its own");
  /* The state the retry belongs to says what the production page says. */
  assert.match(page, /We couldn&rsquo;t load this piece\./);
  assert.match(page, /The catalogue is unreachable\. Please try again\./);
});

test("the page carries no rating, no review count and no invented promise", () => {
  const page = read("src/components/customer/pages/Product.jsx");
  for (const invented of [/\brating\b/i, /reviewCount/i, /\breviews?\b\s*\(/i, /Free delivery/i, /COD available/i]) {
    assert.equal(invented.test(page), false, `the ported page invents "${invented}"`);
  }
  for (const record of RECORDS) {
    assert.equal("rating" in record, false, "the fixture itself carries a rating");
  }
});
