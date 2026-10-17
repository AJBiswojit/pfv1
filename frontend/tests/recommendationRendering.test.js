import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

let vite, Content, Sections, MirrorSource;
before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  const module = await vite.ssrLoadModule("/src/components/product/RecommendationSections.jsx");
  Content = module.RecommendationSectionContent;
  Sections = module.default;
  MirrorSource = readFileSync(new URL("../src/components/customer/pages/account/AiMirror.jsx", import.meta.url), "utf8");
});
after(async () => { await vite?.close(); });
const render = (Component, props = {}) => renderToStaticMarkup(
  React.createElement(StaticRouter, { location: "/account/ai-mirror" }, React.createElement(Component, props)));

test("recommendation loading is accessible and renders no invented cards", () => {
  const html = render(Content, { placement: "mirror", status: "loading", sections: {} });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Loading suggestions/);
  assert.doesNotMatch(html, /<img|Recommended for You/);
});

test("zero results and failure silently omit rails", () => {
  for (const status of ["ready", "error"]) {
    const html = render(Content, { placement: "mirror", status, sections: { personalized: [], related: [] } });
    assert.doesNotMatch(html, /<img|Recommended for You|Similar Styles|<h2/);
  }
});

test("real recommendation component renders API-shaped product through canonical card and link", () => {
  const html = render(Content, { placement: "mirror", status: "ready", sections: {
    personalized: [{ id: "render-product", slug: "render-product", name: "Test-only API product", category: "sarees",
      status: "PUBLISHED", published: true, price: 1000, stock: 3,
      image: "/api/v1/media/objects/products/render-product/front.webp" }],
  } });
  assert.match(html, /Recommended for You/);
  assert.match(html, /Test-only API product/);
  assert.match(html, /href="\/product\/render-product"/);
  assert.match(html, /\/api\/v1\/media\/objects\/products\/render-product\/front.webp/);
  assert.equal((html.match(/href="\/product\/render-product"/g) ?? []).length, 1);
});

test("the Aarna AI Mirror includes the separate recommendation concern without a static fake rail", () => {
  assert.match(MirrorSource, /<RecommendationSections placement="mirror"/);
  assert.match(MirrorSource, /useRecommendations|RecommendationSections/);
  assert.doesNotMatch(MirrorSource, /\[.*Recommended for You.*\]/);
});

test("anonymous homepage recommendation wrapper has no personal label before fetch", () => {
  const html = render(Sections, { placement: "home" });
  assert.doesNotMatch(html, /Recommended for You|<img/);
});
