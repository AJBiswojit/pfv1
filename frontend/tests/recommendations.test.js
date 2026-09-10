import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { apiTrackProductInteraction, apiGetPersonalRecommendations, loadRecommendationSections, uniqueRecommendationSections } from "../src/services/api/recommendationsApi.js";

const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
let calls;
beforeEach(() => {
  calls = [];
  globalThis.localStorage = { getItem: () => "customer-test-token" };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
});
afterEach(() => { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; });

test("anonymous home does not request or pretend personalization", async () => {
  const result = await loadRecommendationSections({ placement: "home" });
  assert.deepEqual(result.sections, {});
  assert.equal(calls.length, 0);
});

test("AI Mirror uses real customer and contextual endpoints, not local history", async () => {
  const result = await loadRecommendationSections({ placement: "mirror", customerId: "customer", productId: "context" });
  assert.equal(result.status, "ready");
  assert.equal(calls.length, 4);
  assert.ok(calls.some(({ url }) => url.includes("customers/me/recommendations?type=personalized")));
  assert.ok(calls.some(({ url }) => url.includes("type=because-viewed")));
  assert.ok(calls.some(({ url }) => url.includes("type=related")));
  assert.ok(calls.some(({ url }) => url.includes("type=complete-the-look")));
  for (const { url, options } of calls) {
    if (url.includes("/customers/me/")) assert.equal(options.headers.Authorization, "Bearer customer-test-token");
    else assert.ok(!options.headers.Authorization);
  }
  assert.ok(Object.values(result.sections).every((rows) => rows.length === 0));
});

test("PDP independently requests all three types, never splits one related response", async () => {
  await loadRecommendationSections({ placement: "product", productId: "context" });
  assert.equal(calls.length, 3);
  assert.ok(calls.some(({ url }) => url.endsWith("type=recommended")));
  assert.ok(calls.some(({ url }) => url.endsWith("type=complete-the-look")));
});

test("Cart bounds requests, excludes whole bag and deduplicates real responses", async () => {
  globalThis.fetch = async (url) => {
    calls.push({ url });
    return new Response(JSON.stringify({ items: [{ id: "in-bag" }, { id: "companion", image: "/api/v1/media/objects/product-cover.webp" }] }), { headers: { "content-type": "application/json" } });
  };
  const { sections } = await loadRecommendationSections({ placement: "cart", cartIds: ["in-bag", "b", "c", "d", "e", "b"] });
  assert.equal(calls.length, 4);
  assert.deepEqual(sections.completeTheLook.map((p) => p.id), ["companion"]);
  assert.equal(sections.completeTheLook[0].image, "/api/v1/media/objects/product-cover.webp");
});

test("no duplicates across recommendation sections; unrendered rows remain eligible", () => {
  const products = Array.from({ length: 8 }, (_, i) => ({ id: `test-${i}` }));
  const result = uniqueRecommendationSections({ related: products, recommended: products });
  assert.equal(result.related.length, 4);
  assert.equal(result.recommended.length, 4);
  assert.equal(new Set([...result.related, ...result.recommended].map((p) => p.id)).size, 8);
});

test("network and API failures never manufacture fallback cards or reject the page load", async () => {
  globalThis.fetch = async () => { throw new Error("offline"); };
  const result = await loadRecommendationSections({ placement: "mirror", customerId: "customer", productId: "context" });
  assert.equal(result.status, "error");
  assert.ok(Object.values(result.sections).every((rows) => rows.length === 0));
  assert.equal((await apiTrackProductInteraction("context", "CLICK")).ok, false);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "Unavailable" } }), { status: 503, headers: { "content-type": "application/json" } });
  assert.equal((await apiGetPersonalRecommendations()).ok, false);
});

test("tracking owns no customer identity/timestamps, and anonymous tracking is skipped", async () => {
  await apiTrackProductInteraction("context", "VIEW");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.eventType, "VIEW");
  assert.equal(body.productId, "context");
  assert.ok(!("customerId" in body) && !("createdAt" in body));
  globalThis.localStorage = { getItem: () => null };
  assert.equal((await apiTrackProductInteraction("context", "CLICK")).skipped, true);
  assert.equal(calls.length, 1);
});

test("placements preserve canonical card/media/navigation and have no fake repository", () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const card = read("components/product/ProductRecommendations.jsx");
  assert.match(card, /useProductCovers/);
  assert.match(card, /ProductCard/);
  assert.match(card, /productHref\(product\)/);
  assert.match(card, /apiTrackProductInteraction/);
  for (const path of ["services/api/recommendationsApi.js", "hooks/useRecommendations.js", "components/product/RecommendationSections.jsx"]) {
    assert.doesNotMatch(read(path), /localStorage|\/images\/|mock|demoProduct|seedProduct/i);
  }
  assert.ok(!existsSync(new URL("../src/data/products/recommendations.js", import.meta.url)));
  assert.match(read("pages/account/AiMirror.jsx"), /RecommendationSections placement="mirror"/);
  assert.match(read("pages/AtelierDesign.jsx"), /RecommendationSections placement="home"/);
  assert.match(read("hooks/useRecommendations.js"), /state.key === key/);
  assert.match(read("hooks/useRecommendations.js"), /cancelled = true/);
});
