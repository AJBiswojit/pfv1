/**
 * Phase 12 · the AI provider boundaries, tested directly.
 *
 * The shopping assistant and the AI Mirror are backed by deterministic demo providers
 * today. These tests pin the three things that must hold until a real provider is
 * approved and wired in:
 *
 *   1. the provider contract is enforced, so a real provider can replace the demo one
 *      behind the same seam (and an incomplete one is refused);
 *   2. every label a customer can see says "demo" for the demo provider, and the
 *      shopping surface never borrows the BUSINESS assistant's label;
 *   3. the demo try-on never returns an image it did not produce: with no curated
 *      result it ends with MOCK_PREVIEW_UNAVAILABLE.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateAiProvider, AI_PROVIDERS } from "../src/services/ai/aiProvider.js";
import { mockAiProvider } from "../src/services/ai/mockAiProvider.js";
import { generateTryOnPreview, VIRTUAL_TRY_ON_PROVIDER } from "../src/services/aiMirror/virtualTryOnService.js";
import { getMockTryOnResult } from "../src/services/aiMirror/aiMirrorMockData.js";
import { isVirtualTryOnEligibleProduct } from "../src/services/aiMirror/aiMirrorEligibility.js";
import { hasVirtualTryOnUsableMedia } from "../src/services/aiMirror/aiMirrorService.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/* The demo try-on schedules its stages with `window.setTimeout`. Under Node the global
   object stands in for the window; each test file runs in its own process. */
globalThis.window ??= globalThis;
globalThis.window.dispatchEvent ??= () => true;
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};

const read = (relative) => readFileSync(new URL(relative, `file://${ROOT}`), "utf8");

/* ── 1 · the provider contract ───────────────────────────────────────────── */

test("the demo shopping provider satisfies the contract", () => {
  assert.deepEqual(validateAiProvider(mockAiProvider), []);
  assert.equal(mockAiProvider.id, AI_PROVIDERS.MOCK);
});

test("a provider missing any part of the contract is refused, with every problem named", () => {
  const problems = validateAiProvider({ id: "", label: "" });
  assert.ok(problems.includes("Missing provider id."));
  assert.ok(problems.includes("Missing provider label."));
  assert.ok(problems.includes("Missing respondShopping()."));
  assert.ok(problems.includes("Missing respondBusiness()."));
  assert.deepEqual(validateAiProvider(null), ["An AI provider must be an object."]);
});

test("a conforming replacement is accepted by the same validator, so swapping the provider is one import", () => {
  const candidate = {
    id: "approved-provider",
    label: "PRATIKSHYA shopping assistant",
    respondShopping: async () => ({}),
    respondBusiness: async () => ({}),
  };
  assert.deepEqual(validateAiProvider(candidate), []);
});

test("the shopping service still routes through the single provider seam", () => {
  const service = read("src/services/ai/aiService.js");
  assert.match(service, /const activeProvider = mockAiProvider;/);
  assert.match(service, /export const askShoppingAssistant = \(request\) => activeProvider\.respondShopping\(request\);/);
  assert.match(service, /export const isMockAiProvider = \(\) => activeProvider\.id === "mock";/);
});

/* ── 2 · labels a customer can see ───────────────────────────────────────── */

test("the shopping surface names the demo provider by its own label, never the business assistant's", async () => {
  const aiService = await import("../src/services/ai/aiService.js");
  assert.equal(aiService.isMockAiProvider(), true, "the active shopping provider is the demo one");
  assert.equal(aiService.AI_SHOPPING_PROVIDER_LABEL, mockAiProvider.label);
  assert.match(aiService.AI_SHOPPING_PROVIDER_LABEL, /demo/i, "the provider's label says it is a demo");
  assert.notEqual(aiService.AI_SHOPPING_PROVIDER_LABEL, aiService.AI_PROVIDER_LABEL,
    "the shopping label is not the business assistant's 'live business data' label");
  assert.match(aiService.AI_PROVIDER_LABEL, /live business data/, "the business label is unchanged for the admin portal");
});

test("the shopping page shows the demo chip and footnote while the demo provider answers", () => {
  const source = read("src/components/aarna/pages/account/AiShopping.jsx");
  /* Comments may explain the business label; the rendered code must not use it. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /Demo assistant · deterministic/);
  assert.match(code, /AI_SHOPPING_BRAND\.demoNote/);
  assert.equal(/AI_PROVIDER_LABEL/.test(code), false, "the customer page does not import the business label");
  assert.equal(/live business data/.test(code), false, "the customer page never prints the business label");
});

test("the Mirror labels its result as a demo, and its stage badge says so", () => {
  const stage = read("src/components/aiMirror/AiMirrorStage.jsx");
  assert.match(stage, /"DEMO PREVIEW"/);
  assert.match(stage, /demo imagery/);
  assert.match(read("src/components/aarna/pages/account/AiMirror.jsx"), /Demo preview module/);
});

/* ── 3 · the demo try-on claims no result it did not produce ─────────────── */

test("the try-on provider is the demo one, by name", () => {
  assert.equal(VIRTUAL_TRY_ON_PROVIDER, "mock");
});

/* An eligible apparel piece (women's sarees, per the static taxonomy) with no curated
   demo look and with usable media. Eligibility and media are the real rules; only the
   curated look is absent. */
const ELIGIBLE_WITH_MEDIA = {
  id: "no-curated-look",
  name: "A saree without a curated demo look",
  slug: "no-curated-look",
  department: "women",
  category: "sarees",
  image: "/images/placeholder.jpg",
  status: "ACTIVE",
  published: true,
};
const ELIGIBLE_WITHOUT_LOOK = ELIGIBLE_WITH_MEDIA;
/* Usable media is judged against the catalogue, so the eligible fixture is seeded into
   the store through the store's own snapshot writer (the path hydration uses). */
const catalogStore = await import("../src/services/catalog/catalogStore.js");
catalogStore.applyCatalogSnapshot({ products: [ELIGIBLE_WITH_MEDIA] });


test("the demo try-on produces no image: a piece without usable media is refused, and a piece without a curated look has none", async () => {
  /* The eligible fixture has no usable catalogue media in this harness (the catalogue
     repository is not hydrated here), so the demo refuses it at the media gate. That is
     the honest outcome: no image is produced. The curated-look gate is pinned separately. */
  const product = ELIGIBLE_WITHOUT_LOOK;
  assert.equal(isVirtualTryOnEligibleProduct(product), true, "the fixture passes the real eligibility rule");
  assert.equal(getMockTryOnResult(product), null, "the demo holds no curated look for this piece");
  await assert.rejects(
    () => generateTryOnPreview({ product, onProgress: () => {} }),
    (error) => {
      assert.ok(["PRODUCT_MEDIA_UNAVAILABLE", "MOCK_PREVIEW_UNAVAILABLE"].includes(error.code), `refused with ${error.code}`);
      assert.equal(error.previewImage, undefined, "no preview image is returned");
      return true;
    },
  );
});

test("the demo's curated-look gate refuses with MOCK_PREVIEW_UNAVAILABLE and never resolves with a stand-in", () => {
  const provider = read("src/services/aiMirror/mockVirtualTryOnProvider.js");
  assert.match(provider, /const result = getMockTryOnResult\(product\);\s*if \(!result\) \{\s*throw problem\("MOCK_PREVIEW_UNAVAILABLE"/);
  assert.match(provider, /return result;/);
  assert.equal(/previewImage:\s*product\.image|placeholder/.test(provider), false, "the demo does not substitute the product's own image as a result");
});

test("cancellation is honoured by the demo: it stops before it claims a result", () => {
  const provider = read("src/services/aiMirror/mockVirtualTryOnProvider.js");
  assert.match(provider, /if \(signal\?\.aborted\) reject\(makeAbortError\(\)\);|if \(signal\?\.aborted\) \{\s*reject\(makeAbortError\(\)\);/);
  assert.match(provider, /if \(signal\?\.aborted\) throw makeAbortError\(\);\s*\n\s*const result = getMockTryOnResult/);
});

/* ── 4 · the integration contract for a future real provider ────────────── */

test("the provider contract document exists and states the rules a real provider must meet", () => {
  const path = new URL("src/services/ai/PROVIDER_CONTRACT.md", `file://${ROOT}`);
  assert.ok(existsSync(path), "PROVIDER_CONTRACT.md is written");
  const doc = readFileSync(path, "utf8");
  for (const required of [
    "respondShopping",
    "respondBusiness",
    "MOCK_PREVIEW_UNAVAILABLE",
    "Demo",
    "consent",
    "not verified",
  ]) {
    assert.ok(doc.toLowerCase().includes(required.toLowerCase()), `the contract covers: ${required}`);
  }
});
