/**
 * PRATIKSHYA FASHION — media registry view model + API client contract.
 *
 * Consolidated coverage for the pure layer that Batches 3–5 built:
 *
 *   · `apiGetMediaAssetSummary` / `apiListMediaAssets` request shape, auth and
 *     error propagation through the shared client;
 *   · summary normalisation: real zeros survive, missing/invalid counts stay
 *     unknown, malformed payloads never become zero summaries;
 *   · card hardening: negative / fractional / string / boolean counts render
 *     `—`, valid integers (zero included) survive;
 *   · list normalisation: identity, pagination metadata, unknown totals,
 *     failure vs empty;
 *   · the summary request coordinator de-duplicates in flight and clears on
 *     settle.
 *
 * NOTE ON LOCATION: the repo's `frontend/tests/` directory is gitignored
 * (`frontend/.gitignore:23`), so files created there do not persist in this
 * workspace. These suites live in `frontend/test/`, which is tracked, not
 * ignored, and already part of `npm test`.
 */

import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  apiGetMediaAssetSummary,
  apiListMediaAssets,
} from "../src/services/api/mediaApi.js";
import {
  loadMediaSummary,
  resetMediaSummaryRequest,
} from "../src/services/admin/mediaSummaryService.js";
import {
  LARGE_FILE_BYTES,
  MEDIA_REGISTRY_TABS,
  MEDIA_SUMMARY_STATUS,
  buildMediaCardModels,
  buildMediaListParams,
  formatShowingRange,
  getMediaRegistryTab,
  mediaSummaryLoadingState,
  mediaSummaryOutcome,
  normaliseMediaAsset,
  normaliseMediaAssetPage,
  normaliseMediaSummary,
  readCount,
} from "../src/services/admin/mediaRegistryView.js";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const mockFetch = (responder) => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const next = typeof responder === "function" ? responder(url, options) : responder;
    if (next instanceof Response) return next;
    return jsonResponse(next ?? {});
  };
  return calls;
};

const ADMIN_TOKEN = "admin-media-token";

beforeEach(() => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  globalThis.window = globalThis;
  window.localStorage = storage;
  globalThis.dispatchEvent = () => true;
  window.dispatchEvent = globalThis.dispatchEvent;
  globalThis.localStorage.setItem("pf_admin_access_token", ADMIN_TOKEN);
  resetMediaSummaryRequest();
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.localStorage;
  delete globalThis.window;
  delete globalThis.dispatchEvent;
  resetMediaSummaryRequest();
});

const SUMMARY_PAYLOAD = {
  ok: true,
  countingScope: "all registered media assets (media_media_asset)",
  largeFileThresholdBytes: 1572864,
  total: 10,
  images: 10,
  videos: 0,
  otherMimeTypes: 0,
  productMapped: 4,
  marketing: 5,
  unassigned: 1,
  largeFiles: 0,
  unknownFileSize: 0,
  sameByteCopies: { assets: 0, groups: 0, unknownChecksums: 0 },
  namespaceClassification: { matches: 10, mismatches: 0, undetermined: 0 },
  generatedAt: "2026-10-22T10:51:18Z",
};

const CARD_IDS = ["total", "images", "videos", "productMapped", "marketing", "unassigned", "largeFiles", "sameByteCopies"];

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

test("summary requests GET /api/v1/media/assets/summary with the admin token", async () => {
  const calls = mockFetch(SUMMARY_PAYLOAD);
  const result = await apiGetMediaAssetSummary();

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v1/media/assets/summary");
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${ADMIN_TOKEN}`);
  assert.deepEqual(result.data, SUMMARY_PAYLOAD);
});

test("list defaults keep the pre-filter URL", async () => {
  const calls = mockFetch({ items: [], total: 0, page: 1, pageSize: 50 });
  await apiListMediaAssets();

  assert.equal(calls[0].url, "/api/v1/media/assets?page=1&pageSize=50");
});

test("list serialises every filter with its wire name", async () => {
  const calls = mockFetch({ items: [], total: 0 });
  await apiListMediaAssets({ page: 2, pageSize: 24, mediaType: "video", assigned: true, placement: true });

  assert.equal(calls[0].url, "/api/v1/media/assets?page=2&pageSize=24&type=video&assigned=true&placement=true");
});

test("explicit false filters are omitted", async () => {
  const calls = mockFetch({ items: [], total: 0 });
  await apiListMediaAssets({ assigned: false, unassigned: false, placement: false });

  assert.equal(calls[0].url, "/api/v1/media/assets?page=1&pageSize=50");
});

test("errors keep the canonical shape and never fabricate items", async () => {
  mockFetch(jsonResponse({ success: false, error: { code: "FORBIDDEN", message: "Denied.", details: {} } }, 403));
  const result = await apiListMediaAssets();

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(result.items, undefined);
});

test("network failures are distinguishable from HTTP errors", async () => {
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  const result = await apiGetMediaAssetSummary();

  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.equal(result.code, "NETWORK_ERROR");
  assert.equal(result.isNetworkError, true);
});

// ---------------------------------------------------------------------------
// Summary normalisation
// ---------------------------------------------------------------------------

test("a complete summary preserves real zeros", () => {
  const summary = normaliseMediaSummary(SUMMARY_PAYLOAD);

  assert.equal(summary.ok, true);
  assert.equal(summary.total, 10);
  assert.equal(summary.videos, 0);
  assert.equal(summary.largeFiles, 0);
  assert.equal(summary.largeFileThresholdBytes, LARGE_FILE_BYTES);
  assert.deepEqual(summary.missingFields, []);
});

test("missing fields become null, never zero", () => {
  const summary = normaliseMediaSummary({ total: 4, images: 4 });

  assert.equal(summary.total, 4);
  assert.equal(summary.videos, null);
  assert.equal(summary.marketing, null);
  assert.ok(summary.missingFields.includes("videos"));
});

test("malformed payloads are not zero summaries", () => {
  for (const payload of [null, undefined, [], "nope", 7]) {
    const summary = normaliseMediaSummary(payload);
    assert.equal(summary.ok, false, String(payload));
    assert.equal(summary.total, null);
    assert.equal(summary.images, null);
  }
});

test("invalid count formats are rejected, zero is kept", () => {
  for (const value of [-1, 1.5, "10", true, NaN, Infinity, {}, []]) {
    assert.equal(readCount(value), null, String(value));
  }
  assert.equal(readCount(0), 0);
  assert.equal(readCount(10), 10);
});

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

test("cards render eight em dashes until the request is ready", () => {
  const ready = normaliseMediaSummary(SUMMARY_PAYLOAD);
  for (const status of ["loading", "error", "unauthorized", undefined]) {
    const cards = buildMediaCardModels({ status, summary: ready });
    assert.equal(cards.length, 8);
    assert.deepEqual(cards.map((card) => card.id), CARD_IDS);
    assert.deepEqual(cards.map((card) => card.value), Array(8).fill("—"), String(status));
  }
});

test("ready cards show the exact backend values", () => {
  const cards = buildMediaCardModels({ status: "ready", summary: normaliseMediaSummary(SUMMARY_PAYLOAD) });

  assert.deepEqual(cards.map((card) => card.value), ["10", "10", "0", "4", "5", "1", "0", "0"]);
  assert.equal(cards[5].tone, "alert");
  assert.equal(cards[7].sub, "no duplicate checksum groups");
});

test("hardening: invalid raw counts render — and cannot raise the alert tone", () => {
  const cards = buildMediaCardModels({
    status: "ready",
    summary: { total: -1, images: 1.5, videos: "10", productMapped: true, unassigned: -2, sameByteCopies: { assets: "0", groups: -1 } },
  });

  assert.deepEqual(cards.map((card) => card.value), Array(8).fill("—"));
  assert.equal(cards[5].tone, undefined);
  assert.equal(cards[7].sub, "checksum groups unknown");
});

test("hardening: valid counts, zero included, survive", () => {
  const cards = buildMediaCardModels({
    status: "ready",
    summary: { total: 0, images: 12, videos: 0, productMapped: 7, marketing: 5, unassigned: 0, largeFiles: 2, sameByteCopies: { assets: 3, groups: 1 } },
  });

  assert.deepEqual(cards.map((card) => card.value), ["0", "12", "0", "7", "5", "0", "2", "3"]);
  assert.equal(cards[7].sub, "1 checksum group");
});

// ---------------------------------------------------------------------------
// Summary state machine + request coordinator
// ---------------------------------------------------------------------------

test("summary outcome maps ready, partial, zero, error, unauthorized and malformed", () => {
  assert.equal(mediaSummaryOutcome({ ok: true, data: SUMMARY_PAYLOAD }).status, MEDIA_SUMMARY_STATUS.READY);
  assert.equal(mediaSummaryOutcome({ ok: true, data: { total: 4 } }).status, MEDIA_SUMMARY_STATUS.READY);
  assert.equal(mediaSummaryOutcome({ ok: true, data: { total: 0 } }).status, MEDIA_SUMMARY_STATUS.READY);
  assert.equal(mediaSummaryOutcome({ ok: false, status: 500 }).status, MEDIA_SUMMARY_STATUS.ERROR);
  assert.equal(mediaSummaryOutcome({ ok: false, status: 401 }).status, MEDIA_SUMMARY_STATUS.UNAUTHORIZED);
  assert.equal(mediaSummaryOutcome({ ok: false, status: 403 }).status, MEDIA_SUMMARY_STATUS.UNAUTHORIZED);
  assert.equal(mediaSummaryOutcome({ ok: true, data: null }).status, MEDIA_SUMMARY_STATUS.ERROR);
  assert.equal(mediaSummaryOutcome({ ok: false, status: 500 }).summary, null);
  assert.equal(mediaSummaryLoadingState().summary, null);
});

test("concurrent summary loads share ONE request, and a later load refreshes", async () => {
  const calls = mockFetch(SUMMARY_PAYLOAD);
  const [a, b] = await Promise.all([loadMediaSummary(), loadMediaSummary()]);

  assert.equal(calls.length, 1);
  assert.deepEqual(a, b);
  await loadMediaSummary();
  assert.equal(calls.length, 2, "the shared promise is not a cache");
});

// ---------------------------------------------------------------------------
// List normalisation
// ---------------------------------------------------------------------------

test("asset identity, vocabulary and pagination are preserved", () => {
  const page = normaliseMediaAssetPage({
    total: 3,
    page: 2,
    pageSize: 1,
    items: [{
      id: "asset-1",
      objectKey: "products/P1/primary.avif",
      url: "/api/v1/media/objects/products/P1/primary.avif",
      status: "uploaded",
      mimeType: "image/avif",
      scope: "product",
      productId: "P1",
      productName: "Saree",
      productSku: "P1",
    }],
  }, { page: 2, pageSize: 1 });

  assert.equal(page.ok, true);
  assert.equal(page.total, 3);
  assert.equal(page.page, 2);
  assert.equal(page.pageSize, 1);
  assert.equal(page.items[0].status, "uploaded", "raw status is not rewritten");
  assert.equal(page.items[0].objectKey, "products/P1/primary.avif");
  assert.equal(page.items[0].productSku, "P1");
});

test("a missing total stays unknown, an empty page is a success", () => {
  assert.equal(normaliseMediaAssetPage({ items: [{ objectKey: "a.avif" }] }).total, null);

  const empty = normaliseMediaAssetPage({ items: [], total: 0, page: 1, pageSize: 24 });
  assert.equal(empty.ok, true);
  assert.equal(empty.total, 0);
});

test("malformed list payloads are errors, not empty successes", () => {
  for (const payload of [null, undefined, {}, { items: null }, { items: "nope" }]) {
    assert.equal(normaliseMediaAssetPage(payload).ok, false, JSON.stringify(payload));
  }
});

test("rows without a key are dropped and disclosed", () => {
  const page = normaliseMediaAssetPage({ items: [{ id: "x" }, { objectKey: "ok.avif" }], total: 2 });

  assert.equal(page.items.length, 1);
  assert.equal(page.dropped, 1);
  assert.equal(normaliseMediaAsset({ id: "x" }), null);
});

test("footer ranges stay honest for known, unknown and empty totals", () => {
  assert.equal(formatShowingRange({ page: 1, pageSize: 24, total: 120, count: 24 }), "Showing 1–24 of 120");
  assert.equal(formatShowingRange({ page: 5, pageSize: 24, total: 120, count: 24 }), "Showing 97–120 of 120");
  assert.equal(formatShowingRange({ page: 1, pageSize: 24, total: null, count: 0 }), "Showing — of —");
  assert.equal(formatShowingRange({ page: 1, pageSize: 24, total: 0, count: 0 }), "Showing 0 of 0");
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

test("the six registry tabs map to the approved server filters", () => {
  assert.deepEqual(MEDIA_REGISTRY_TABS.map((tab) => tab.id), ["ALL", "IMAGES", "VIDEOS", "PRODUCT", "MARKETING", "UNASSIGNED"]);

  const paramsFor = (id) => buildMediaListParams(id, { page: 1, pageSize: 24, q: "" });
  assert.deepEqual(paramsFor("ALL"), { page: 1, pageSize: 24, q: "" });
  assert.deepEqual(paramsFor("IMAGES"), { page: 1, pageSize: 24, q: "", mediaType: "image" });
  assert.deepEqual(paramsFor("VIDEOS"), { page: 1, pageSize: 24, q: "", mediaType: "video" });
  assert.deepEqual(paramsFor("PRODUCT"), { page: 1, pageSize: 24, q: "", scopeFilter: "product", assigned: true });
  assert.deepEqual(paramsFor("MARKETING"), { page: 1, pageSize: 24, q: "", placement: true });
  assert.deepEqual(paramsFor("UNASSIGNED"), { page: 1, pageSize: 24, q: "", unassigned: true });
  assert.equal(getMediaRegistryTab("nope").id, "ALL");
});

// ===========================================================================
// Batch 5A — restored coverage (the cases the Batch 5 review listed as lost)
// ===========================================================================

test("summary 401 clears the stored admin token and reports session expiry", async () => {
  mockFetch(
    jsonResponse(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication token missing.", details: {} } },
      401
    )
  );
  const result = await apiGetMediaAssetSummary();

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.code, "UNAUTHORIZED", "the client normalises an unrecoverable 401");
  assert.equal(
    localStorage.getItem("pf_admin_access_token"),
    null,
    "an expired admin token is cleared, so the page cannot keep retrying with it"
  );
});

test("summary 403 keeps the server's canonical error envelope", async () => {
  mockFetch(
    jsonResponse(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Admin permission required.", details: { permission: "media.view" } },
      },
      403
    )
  );
  const result = await apiGetMediaAssetSummary();

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(result.error, "Admin permission required.");
  assert.deepEqual(result.details, { permission: "media.view" });
  assert.equal(result.isNetworkError, false);
  // `data` carries the server's error envelope — never a summary-shaped body,
  // so a caller cannot mistake a refusal for counts.
  assert.equal(result.data?.total, undefined);
  assert.equal(result.data?.error?.code, "FORBIDDEN");
});

test("existing q / scope / mime serialization is unchanged", async () => {
  const calls = mockFetch({ ok: true, total: 0, items: [], page: 1, pageSize: 50 });
  await apiListMediaAssets({ q: "  silk saree ", scopeFilter: "hero", mime: "image/png" });

  assert.equal(
    calls[0].url,
    "/api/v1/media/assets?page=1&pageSize=50&q=silk%20saree&scope=hero&mime=image%2Fpng",
    "the picker's own parameters serialize exactly as before"
  );
});

test("ready with a null summary still renders unknown values", () => {
  for (const summary of [null, undefined]) {
    const cards = buildMediaCardModels({ status: "ready", summary });
    assert.equal(cards.length, 8, String(summary));
    assert.deepEqual(cards.map((card) => card.value), Array(8).fill("—"));
    assert.equal(cards[7].sub, "checksum groups unknown");
  }
});

test("invalid page and page-size values normalize to safe defaults", () => {
  assert.deepEqual(buildMediaListParams("NOPE", { page: 0, pageSize: -3 }), {
    page: 1,
    pageSize: 24,
    q: "",
  });
  assert.deepEqual(buildMediaListParams("ALL", { page: 1.5, pageSize: "24" }), {
    page: 1,
    pageSize: 24,
    q: "",
  });
  assert.equal(buildMediaListParams("ALL", { q: "  bridal  " }).q, "bridal");
  assert.equal(getMediaRegistryTab(undefined).id, "ALL");

  // A malformed payload falls back to the request's page/page-size, never NaN.
  const page = normaliseMediaAssetPage({ items: [], total: 0, page: "x", pageSize: 0 }, { page: 2, pageSize: 24 });
  assert.equal(page.page, 2);
  assert.equal(page.pageSize, 24);
});

test("marketing rows never receive a fabricated product mapping", () => {
  const page = normaliseMediaAssetPage({
    total: 1,
    page: 1,
    pageSize: 24,
    items: [
      {
        id: "hero-1",
        objectKey: "hero/bridal.avif",
        status: "uploaded",
        mimeType: "image/avif",
        scope: "marketing",
        productId: null,
        productName: null,
        productSku: null,
      },
    ],
  });

  assert.equal(page.items[0].scope, "marketing");
  assert.equal(page.items[0].productId, null);
  assert.equal(page.items[0].productName, null);
  assert.equal(page.items[0].productSku, null);

  // Even when the payload omits the product fields entirely, nothing is invented.
  const bare = normaliseMediaAssetPage({ total: 1, items: [{ objectKey: "marketing/festive.avif", scope: "marketing" }] });
  assert.equal(bare.items[0].productId, null);
  assert.equal(bare.items[0].productName, null);
});

test("non-object assets and blank object keys are rejected", () => {
  for (const item of [null, undefined, "asset", 42, [], { id: "only-id" }, { objectKey: "   " }, { objectKey: 42 }]) {
    assert.equal(normaliseMediaAsset(item), null, JSON.stringify(item));
  }
  assert.equal(normaliseMediaAsset({ objectKey: "  hero/a.avif  " }).objectKey, "hero/a.avif", "keys are trimmed, not invented");
});

test("the footer never renders a range beyond the total", () => {
  assert.equal(formatShowingRange({ page: 9, pageSize: 24, total: 120, count: 0 }), "Showing 0 of 120");
  assert.equal(formatShowingRange({ page: 6, pageSize: 24, total: 120, count: 21 }), "Showing 121–120 of 120");
  assert.equal(formatShowingRange({ total: null, count: 5 }), "Showing — of —");
  assert.equal(formatShowingRange({ total: 0, count: 0 }), "Showing 0 of 0");
});

test("STATIC: the view model performs no I/O and holds no React import", () => {
  const source = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/services/admin/mediaRegistryView.js"),
    "utf8"
  );

  assert.doesNotMatch(source, /(?<!\.)\bfetch\s*\(/, "no HTTP in the view model");
  assert.doesNotMatch(source, /from ["']react/, "no React in the view model");
  assert.doesNotMatch(source, /apiClient|localStorage|sessionStorage/, "no client or storage access");
  assert.doesNotMatch(source, /demoData|mockData|fixtureData|sampleAssets/, "no demo fallback data");
});
