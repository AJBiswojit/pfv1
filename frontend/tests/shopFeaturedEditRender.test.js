/**
 * PRATIKSHYA FASHON — Shop featured-edit render contract.
 *
 * Regression for the Shop runtime crash:
 *
 *   Uncaught TypeError: Cannot read properties of undefined (reading 'title')
 *   at Shop (src/pages/Shop.jsx)
 *
 * `collectionRoutes.featured` is an OPTIONAL backend lookup: it is empty
 * before `hydrateCatalog()` resolves, and it stays empty whenever
 * GET /collections carries no ACTIVE "featured" collection. Shop dereferenced
 * that lookup unconditionally (`featured.title`), so the page threw on first
 * paint and rendered blank.
 *
 * The rules pinned here:
 *   · Shop renders with an empty catalogue snapshot (pre-hydration / no
 *     featured collection) instead of throwing.
 *   · When the backend DOES carry the collection, the edit renders from the
 *     server record — its own name, eyebrow, description and slug route.
 *   · Nothing is fabricated when the record is absent: no placeholder title,
 *     no invented product, no hardcoded "/collections/featured" link.
 *
 * The page is server-rendered through Vite's SSR pipeline so this exercises
 * the real component, the real catalog store and the real taxonomy proxies.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let vite;
let Shop;
let catalogStore;
const realFetch = globalThis.fetch;

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  Shop = (await vite.ssrLoadModule("/src/pages/Shop.jsx")).default;
  catalogStore = await vite.ssrLoadModule("/src/services/catalog/catalogStore.js");
});

after(async () => {
  globalThis.fetch = realFetch;
  await vite?.close();
});

const renderShop = () =>
  renderToStaticMarkup(
    React.createElement(StaticRouter, { location: "/shop" }, React.createElement(Shop))
  );

/** Serves catalogue payloads in the shape the backend read-model returns. */
const serveCatalogue = ({ products = [], categories = [], collections = [] }) => {
  const json = (body) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("/products?")) return json({ items: products, total: products.length, facets: {} });
    if (value.includes("/categories")) return json({ items: categories });
    if (value.includes("/collections")) return json({ items: collections });
    return json({ items: [] });
  };
};

test("Shop renders with an empty catalogue snapshot instead of reading .title of undefined", () => {
  const html = renderShop();
  assert.match(html, /The full/, "the catalogue section still renders");
  assert.doesNotMatch(html, /collections\/featured/, "no featured link is invented while the record is absent");
});

test("Shop renders the featured edit from the backend collection record", async () => {
  serveCatalogue({
    products: [
      { id: "p1", name: "Sambalpuri Silk Saree", price: 12000, category: "sarees", isFeatured: true },
    ],
    categories: [{ id: "sarees", name: "Sarees", slug: "sarees", status: "ACTIVE" }],
    collections: [
      {
        id: "featured",
        name: "The House Edit",
        slug: "featured",
        eyebrow: "Featured",
        description: "Chosen by the atelier this season.",
        status: "ACTIVE",
        displayStatus: "ACTIVE",
      },
    ],
  });
  await catalogStore.refreshCatalog();

  const html = renderShop();

  assert.match(html, /The House Edit/, "the title comes from the collection record");
  assert.match(html, /Chosen by the atelier this season\./);
  assert.match(html, /href="\/collections\/featured"/, "the route comes from the record's slug");
  assert.match(html, /View all 1 pieces/, "the count comes from the server product snapshot");
});

test("Shop omits the featured edit when the backend carries no featured collection", async () => {
  serveCatalogue({
    products: [{ id: "p2", name: "Banarasi Silk Saree", price: 18000, category: "sarees" }],
    categories: [{ id: "sarees", name: "Sarees", slug: "sarees", status: "ACTIVE" }],
    collections: [
      { id: "new-arrivals", name: "New Arrivals", slug: "new-arrivals", status: "ACTIVE", displayStatus: "ACTIVE" },
    ],
  });
  await catalogStore.refreshCatalog();

  const html = renderShop();

  assert.match(html, /The full/, "the rest of the page is unaffected");
  assert.doesNotMatch(html, /The House Edit|Demo|Placeholder/, "no substitute edit is fabricated");
  assert.doesNotMatch(html, /collections\/featured/, "no link to a collection the backend does not have");
});

test("Shop never falls back to a fabricated featured title, product or route", () => {
  const source = readFileSync(join(ROOT, "src/pages/Shop.jsx"), "utf8");
  assert.doesNotMatch(source, /"\/collections\/featured"/, "the hardcoded featured route fallback is gone");
  assert.doesNotMatch(source, /featured(Route)?\??\.\w+\s*(\|\||\?\?)\s*"/, "no invented title/eyebrow/description");
  assert.match(source, /featured && featuredHref/, "the edit is rendered only for a real backend record");
});
