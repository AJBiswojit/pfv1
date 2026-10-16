/*
 * Customer listing regression: the Aarna shop owns the live listing surface.
 * It must render while the shared catalogue is unresolved, then render actual
 * backend records when present; the retired production Shop page is not part of
 * the route tree.
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

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  Shop = (await vite.ssrLoadModule("/src/components/aarna/pages/Shop.jsx")).default;
  catalogStore = await vite.ssrLoadModule("/src/services/catalog/catalogStore.js");
});
after(async () => { await vite?.close(); });

const renderShop = () => renderToStaticMarkup(
  React.createElement(StaticRouter, { location: "/shop" }, React.createElement(Shop, { mode: "shop" }))
);

test("Aarna shop renders a truthful loading state before the catalogue arrives", () => {
  catalogStore.applyCatalogSnapshot({ products: [], categories: [], collections: [] });
  const html = renderShop();
  assert.match(html, /All Pieces/);
  assert.match(html, /listing-skeleton/);
  assert.doesNotMatch(html, /Demo|Placeholder|collections\/featured/);
});

test("Aarna shop does not fabricate a featured collection or products before catalogue data is available", () => {
  catalogStore.applyCatalogSnapshot({ products: [], categories: [], collections: [] });
  const html = renderShop();
  assert.match(html, /All Pieces/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /Sambalpuri Silk Saree|A Backend Edit|The House Edit|collections\/featured/);
});

test("Aarna search mode uses the same truthful listing state without local fallback results", () => {
  catalogStore.applyCatalogSnapshot({ products: [], categories: [], collections: [] });
  const html = renderToStaticMarkup(
    React.createElement(StaticRouter, { location: "/search" }, React.createElement(Shop, { mode: "search" }))
  );
  assert.match(html, /Find your piece/);
  assert.match(html, /listing-skeleton/);
  assert.doesNotMatch(html, /Demo|Placeholder|The House Edit/);
});

test("Aarna listing keeps its shared query engine and is the routed customer listing", () => {
  const source = readFileSync(join(ROOT, "src/components/aarna/pages/Shop.jsx"), "utf8");
  const app = readFileSync(join(ROOT, "src/App.jsx"), "utf8");
  const routes = readFileSync(join(ROOT, "src/components/aarna/AarnaStorefront.jsx"), "utf8");
  assert.match(source, /useCatalogueQuery/);
  assert.match(source, /useCatalog\(\)/);
  assert.match(source, /ProductCard/);
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/);
  assert.match(routes, /<Route path="shop" element=\{<Shop mode="shop" \/>\} \/>/);
  assert.doesNotMatch(app, /pages\/Shop/);
});
