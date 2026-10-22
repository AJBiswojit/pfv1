/**
 * PRATIKSHYA FASHION — Batch 5: server-backed media registry.
 *
 * What is pinned here:
 *
 *   · the registry reads `GET /media/assets` — the exact query string for every
 *     supported tab and for the search term, with the 24/page paging;
 *   · `apiListMediaAssets` keeps its legacy numeric fields for existing
 *     consumers (RegisteredMediaPicker, product-media desk) AND now exposes the
 *     raw body, which is what the registry normalises;
 *   · a missing total stays `null` end to end (never `items.length`), a real
 *     `total: 0` stays a successful empty page, and filtered totals survive
 *     paging;
 *   · loading / ready / empty / no-match / error / unauthorized are distinct,
 *     a failed read carries no rows, and 401/403 are not "no media";
 *   · the page renders ONE inventory from the backend, with no local register,
 *     no demo data and no legacy panel strings;
 *   · the summary cards and the homepage placement panel are untouched.
 *
 * No DOM/renderer exists in this harness, so page/panel wiring is covered by
 * `STATIC:` source guards over the real files, as in the other admin suites.
 */

import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { apiListMediaAssets } from "../src/services/api/mediaApi.js";
import { fetchMediaAssetPage } from "../src/services/admin/mediaAssetPageService.js";
import {
  MEDIA_PAGE_STATUS,
  MEDIA_REGISTRY_TABS,
  buildMediaCardModels,
  buildMediaListParams,
  formatShowingRange,
  mediaAssetPageOutcome,
  mediaPageCount,
  mediaPageHasFilters,
  mediaPageLoadingState,
} from "../src/services/admin/mediaRegistryView.js";
import { resolveMediaAccess } from "../src/services/media/mediaAccess.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

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

const ADMIN_TOKEN = "admin-registry-token";

beforeEach(() => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  globalThis.window = globalThis;
  window.localStorage = storage;
  globalThis.dispatchEvent = () => true;
  window.dispatchEvent = globalThis.dispatchEvent;
  globalThis.localStorage.setItem("pf_admin_access_token", ADMIN_TOKEN);
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.localStorage;
  delete globalThis.window;
  delete globalThis.dispatchEvent;
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const ITEM = (overrides = {}) => ({
  id: "asset-1",
  objectKey: "products/PF-W-SAR-0001/primary.avif",
  url: "/api/v1/media/objects/products/PF-W-SAR-0001/primary.avif",
  status: "uploaded",
  mimeType: "image/avif",
  scope: "product",
  productId: "PF-W-SAR-0001",
  productName: "Banarasi Silk Saree",
  productSku: "PF-W-SAR-0001",
  ...overrides,
});

const PAGE_BODY = { ok: true, total: 57, page: 2, pageSize: 24, items: [ITEM()] };

// ===========================================================================
// 1. Request parameters for every tab
// ===========================================================================

test("the registry requests exactly the approved query string per tab", async () => {
  const cases = [
    ["ALL", "page=2&pageSize=24"],
    ["IMAGES", "page=2&pageSize=24&type=image"],
    ["VIDEOS", "page=2&pageSize=24&type=video"],
    ["PRODUCT", "page=2&pageSize=24&scope=product&assigned=true"],
    ["MARKETING", "page=2&pageSize=24&placement=true"],
    ["UNASSIGNED", "page=2&pageSize=24&unassigned=true"],
  ];

  for (const [tabId, expected] of cases) {
    const calls = mockFetch(PAGE_BODY);
    await fetchMediaAssetPage({ tabId, page: 2, pageSize: 24 });
    assert.equal(calls[0].url, `/api/v1/media/assets?${expected}`, tabId);
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${ADMIN_TOKEN}`, tabId);
  }
});

test("search is sent server-side and combined with the tab filter", async () => {
  const calls = mockFetch({ ok: true, total: 0, page: 1, pageSize: 24, items: [] });
  await fetchMediaAssetPage({ tabId: "PRODUCT", page: 1, q: "  silk saree " });

  assert.equal(
    calls[0].url,
    "/api/v1/media/assets?page=1&pageSize=24&q=silk%20saree&scope=product&assigned=true"
  );
});

test("clearing search and filters returns the unfiltered first page", async () => {
  const calls = mockFetch({ ok: true, total: 0, page: 1, pageSize: 24, items: [] });
  await fetchMediaAssetPage({ tabId: "ALL", page: 1, q: "" });

  assert.equal(calls[0].url, "/api/v1/media/assets?page=1&pageSize=24");
});

// ===========================================================================
// 2. Raw body preservation + legacy compatibility
// ===========================================================================

test("the legacy wrapper keeps its numeric fields and adds the raw body", async () => {
  mockFetch(PAGE_BODY);
  const result = await apiListMediaAssets({ page: 2, pageSize: 24 });

  assert.equal(result.ok, true);
  assert.equal(result.total, 57);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 24);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.data, PAGE_BODY, "the raw body is exposed verbatim");
});

test("legacy consumers still get a number when the server omits total", async () => {
  mockFetch({ ok: true, items: [ITEM(), ITEM({ id: "asset-2", objectKey: "products/P2/a.avif" })] });
  const result = await apiListMediaAssets();

  assert.equal(result.total, 2, "pre-existing fallback behaviour is unchanged");
  assert.equal(result.data.total, undefined, "but the raw body still shows no total");
});

test("the registry reads the raw body, so a missing total stays unknown", async () => {
  mockFetch({ ok: true, page: 1, pageSize: 24, items: [ITEM()] });
  const state = await fetchMediaAssetPage({ tabId: "ALL", page: 1, pageSize: 24 });

  assert.equal(state.status, MEDIA_PAGE_STATUS.READY);
  assert.equal(state.total, null, "items.length must never become the total");
  assert.equal(state.items.length, 1);
  assert.equal(
    formatShowingRange({ page: state.page, pageSize: state.pageSize, total: state.total, count: state.items.length }),
    "Showing — of —"
  );
});

test("a genuine total 0 is a successful empty page, not an unknown or an error", async () => {
  mockFetch({ ok: true, total: 0, page: 1, pageSize: 24, items: [] });
  const state = await fetchMediaAssetPage({ tabId: "ALL", page: 1, pageSize: 24 });

  assert.equal(state.status, MEDIA_PAGE_STATUS.READY);
  assert.equal(state.total, 0);
  assert.deepEqual(state.items, []);
  assert.equal(state.dropped, 0);
  assert.equal(formatShowingRange({ page: 1, pageSize: 24, total: state.total, count: 0 }), "Showing 0 of 0");
});

// ===========================================================================
// 3. Server pagination and filtered totals
// ===========================================================================

test("server page metadata wins over the requested values", async () => {
  mockFetch({ ok: true, total: 57, page: 3, pageSize: 24, items: [ITEM()] });
  const state = await fetchMediaAssetPage({ tabId: "IMAGES", page: 2, pageSize: 24 });

  assert.equal(state.page, 3);
  assert.equal(state.pageSize, 24);
  assert.equal(state.total, 57);
  assert.equal(
    formatShowingRange({ page: state.page, pageSize: state.pageSize, total: state.total, count: state.items.length }),
    "Showing 49–49 of 57"
  );
  assert.equal(mediaPageCount({ total: 57, pageSize: 24 }), 3);
});

test("requested values are the fallback when the server omits page metadata", async () => {
  mockFetch({ ok: true, total: 50, items: [ITEM()] });
  const state = await fetchMediaAssetPage({ tabId: "ALL", page: 2, pageSize: 24 });

  assert.equal(state.page, 2);
  assert.equal(state.pageSize, 24);
});

test("a filtered total is the filtered count, not the page length", async () => {
  mockFetch({ ok: true, total: 4, page: 1, pageSize: 24, items: [ITEM({ mimeType: "video/mp4" })] });
  const state = await fetchMediaAssetPage({ tabId: "VIDEOS", page: 1, pageSize: 24 });

  assert.equal(state.total, 4);
  assert.equal(state.items.length, 1);
  assert.equal(mediaPageCount({ total: state.total, pageSize: 24 }), 1);
});

test("an unknown total yields no page upper bound", () => {
  assert.equal(mediaPageCount({ total: null, pageSize: 24 }), null);
  assert.equal(mediaPageCount({ total: 0, pageSize: 24 }), 1);
  assert.equal(mediaPageCount({ total: 25, pageSize: 24 }), 2);
});

// ===========================================================================
// 4. States: loading, empty, no-match, error, unauthorized
// ===========================================================================

test("loading state has no rows, no total and no zero", () => {
  const state = mediaPageLoadingState({ page: 2, pageSize: 24 });

  assert.equal(state.status, MEDIA_PAGE_STATUS.LOADING);
  assert.deepEqual(state.items, []);
  assert.equal(state.total, null);
  assert.equal(state.page, 2);
});

test("server and network failures are errors that carry no rows", async () => {
  mockFetch(jsonResponse({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Boom.", details: {} } }, 500));
  const serverError = await fetchMediaAssetPage({ tabId: "ALL" });

  assert.equal(serverError.status, MEDIA_PAGE_STATUS.ERROR);
  assert.deepEqual(serverError.items, []);
  assert.equal(serverError.total, null);
  assert.equal(serverError.error.status, 500);
  assert.equal(serverError.error.message, "Boom.");

  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  const networkError = await fetchMediaAssetPage({ tabId: "ALL" });

  assert.equal(networkError.status, MEDIA_PAGE_STATUS.ERROR);
  assert.equal(networkError.error.code, "NETWORK_ERROR");
  assert.deepEqual(networkError.items, []);
  assert.notEqual(networkError.status, MEDIA_PAGE_STATUS.READY, "a failure is never an empty registry");
});

test("401 and 403 are unauthorized, not empty", async () => {
  for (const status of [401, 403]) {
    mockFetch(jsonResponse({ success: false, error: { code: "DENIED", message: "Denied.", details: {} } }, status));
    const state = await fetchMediaAssetPage({ tabId: "ALL" });

    assert.equal(state.status, MEDIA_PAGE_STATUS.UNAUTHORIZED, String(status));
    assert.deepEqual(state.items, []);
    assert.equal(state.total, null);
  }
});

test("a malformed body is an error, never an empty successful registry", async () => {
  mockFetch({ ok: true, items: "not-an-array", total: 3 });
  const state = await fetchMediaAssetPage({ tabId: "ALL" });

  assert.equal(state.status, MEDIA_PAGE_STATUS.ERROR);
  assert.equal(state.error.code, "MALFORMED_PAGE");
  assert.deepEqual(state.items, []);
});

test("a missing body on the result is an error, not an empty page", () => {
  const state = mediaAssetPageOutcome({ ok: true, items: [], total: 0 }, { page: 1, pageSize: 24 });

  assert.equal(state.status, MEDIA_PAGE_STATUS.ERROR);
  assert.equal(state.error.code, "MALFORMED_PAGE");
});

test("empty registry and no-match are distinguished by the request, not the rows", () => {
  assert.equal(mediaPageHasFilters({ tabId: "ALL", q: "" }), false);
  assert.equal(mediaPageHasFilters({ tabId: "IMAGES", q: "" }), true);
  assert.equal(mediaPageHasFilters({ tabId: "ALL", q: "silk" }), true);
});

test("a failed refresh cannot leave the previous page on screen", async () => {
  mockFetch(PAGE_BODY);
  const ready = await fetchMediaAssetPage({ tabId: "ALL", page: 1 });
  assert.equal(ready.items.length, 1);

  mockFetch(jsonResponse({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Boom.", details: {} } }, 500));
  const failed = await fetchMediaAssetPage({ tabId: "ALL", page: 2 });

  assert.equal(failed.status, MEDIA_PAGE_STATUS.ERROR);
  assert.deepEqual(failed.items, []);
  assert.equal(failed.total, null);
});

test("a filter change reads the new filter, not a cached page", async () => {
  const calls = mockFetch(PAGE_BODY);
  await fetchMediaAssetPage({ tabId: "ALL", page: 1 });
  await fetchMediaAssetPage({ tabId: "MARKETING", page: 1 });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "/api/v1/media/assets?page=1&pageSize=24");
  assert.equal(calls[1].url, "/api/v1/media/assets?page=1&pageSize=24&placement=true");
});

// ===========================================================================
// 5. Page + panel wiring (static guards)
// ===========================================================================

const PAGE = "src/pages/admin/media/AdminMediaLibrary.jsx";
const PANEL = "src/components/admin/media/RegisteredMediaPanel.jsx";
const HOOK = "src/hooks/useMediaRegistry.js";
const SERVICE = "src/services/admin/mediaAssetPageService.js";

test("STATIC: the page renders exactly one registry panel and no local register", () => {
  const source = read(PAGE);

  assert.match(source, /import RegisteredMediaPanel from "\.\.\/\.\.\/\.\.\/components\/admin\/media\/RegisteredMediaPanel"/);
  assert.equal((source.match(/<RegisteredMediaPanel\b/g) || []).length, 1);
  assert.doesNotMatch(source, /DurableAssetsPanel/, "the duplicate durable panel is gone");
  assert.doesNotMatch(source, /useMediaLibrary|useMediaActions/, "no local register hooks");
  assert.doesNotMatch(source, /apiListMediaAssets/, "the page does not fetch the list itself");
  assert.doesNotMatch(source, /taxonomyRepository|catalogRepository/, "no local catalog lookups");
  assert.doesNotMatch(source, /Durable media registry|backend media service is not active|INTEGRATION_AUDIT/);
  assert.doesNotMatch(source, /Bulk actions affect this browser session only|Local only — not saved on the server/);
  assert.doesNotMatch(source, /"Unmapped"|"Duplicates"|"Needs Review"|"Orphaned"|"Archived Product"/, "dead tabs removed");
});

test("STATIC: Batch 4 cards and the placement panel are preserved", () => {
  const source = read(PAGE);

  assert.match(source, /useMediaSummary\(\{ refreshToken: registryRefresh \}\)/);
  assert.match(source, /summaryState\.cards\.map\(/);
  assert.match(source, /<PlacementAssetPanel onRegistered=/);
  assert.equal((source.match(/<AdminMetricCard\b/g) || []).length, 1);
});

test("STATIC: the panel exposes all six tabs, the states and the footer", () => {
  const source = read(PANEL);

  assert.match(source, /MEDIA_REGISTRY_TABS\.map\(/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /Loading registered media…/);
  assert.match(source, /Registered media are unavailable for this session/);
  assert.match(source, /role="alert"/);
  assert.match(source, /onClick=\{state\.retry\}/);
  assert.match(source, /No media has been registered yet\./);
  assert.match(source, /No assets match these filters\./);
  assert.match(source, /formatShowingRange\(/);
  assert.match(source, /Open product/);
  assert.match(source, /Registered<\/span>|Registered\n/);
  assert.doesNotMatch(source, /\{asset\.status\}/, "raw `uploaded` is never rendered");
  assert.doesNotMatch(source, /demoMedia|mockMedia|mockAssets|fixtureAssets|sampleAssets|fakeAssets/i);
});

test("STATIC: the hook clears state per run and ignores stale responses", () => {
  const source = read(HOOK);

  assert.match(source, /export function useMediaAssetPage/);
  assert.match(source, /fetchMediaAssetPage\(\{ tabId, page, pageSize, q \}\)/);
  assert.match(source, /setState\(mediaPageLoadingState\(\{ page, pageSize \}\)\)/);
  assert.match(source, /if \(!alive \|\| latest\.current !== requestId\) return;/);
  assert.match(source, /\}, \[tabId, page, pageSize, q, refreshToken, attempt\]\)/);
  assert.match(source, /const retry = useCallback/);
  assert.doesNotMatch(source, /\bfetch\s*\(/, "the hook never calls fetch");
});

test("STATIC: the page service is a thin, React-free read", () => {
  const source = read(SERVICE);

  assert.match(source, /buildMediaListParams\(tabId/);
  assert.match(source, /apiListMediaAssets\(params\)/);
  assert.match(source, /mediaAssetPageOutcome\(result/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.doesNotMatch(source, /demo|mock|fixture/i);
});

test("STATIC: the legacy list wrapper keeps its fields and adds the body", () => {
  const source = read("src/services/api/mediaApi.js");

  assert.match(source, /total: data\?\.total \?\? \(data\?\.items\?\.length \?\? 0\)/);
  assert.match(source, /data: data \?\? null/);
});

test("STATIC: the picker and homepage service still call the wrapper unchanged", () => {
  const homepage = read("src/services/homepage/homepageContentService.js");

  assert.match(homepage, /apiListMediaAssets\(\{ page, pageSize: 24, q: query, scopeFilter: filter \}\)/);
  const call = homepage.match(/apiListMediaAssets\(\{[^}]*\}\)/);
  assert.ok(call, "the picker path must still call the wrapper");
  assert.doesNotMatch(call[0], /mediaType|assigned|unassigned|placement/, "no new params leak into the picker path");
});

test("STATIC: tab definitions still match the approved six views", () => {
  assert.deepEqual(
    MEDIA_REGISTRY_TABS.map((tab) => [tab.id, tab.params]),
    [
      ["ALL", {}],
      ["IMAGES", { mediaType: "image" }],
      ["VIDEOS", { mediaType: "video" }],
      ["PRODUCT", { scopeFilter: "product", assigned: true }],
      ["MARKETING", { placement: true }],
      ["UNASSIGNED", { unassigned: true }],
    ]
  );
  assert.deepEqual(
    buildMediaListParams("PRODUCT", { page: 1 }).scopeFilter,
    "product"
  );
});

// ===========================================================================
// Batch 5A — restored summary coverage + permission-aware controls
// ===========================================================================

test("STATIC: the summary cards keep unauthorized, error, retry and loading states", () => {
  const source = read(PAGE);

  assert.match(source, /summaryState\.status === "unauthorized"/);
  assert.match(source, /Media statistics are unavailable for this session/);
  assert.match(source, /summaryState\.status === "error"/);
  assert.match(source, /onClick=\{summaryState\.retry\}/, "a failed read offers a retry");
  assert.match(source, /summaryState\.status === "loading" \? "Loading…" : card\.hint/);
  assert.match(source, /aria-busy=\{summaryState\.status === "loading"\}/);
  assert.match(source, /summaryState\.cards\.map\(/);
});

test("STATIC: the summary service de-duplicates in flight and never caches", () => {
  const source = read("src/services/admin/mediaSummaryService.js");

  assert.match(source, /if \(inFlight\) return inFlight;/);
  assert.match(source, /if \(inFlight === request\) inFlight = null;/, "settled reads clear the shared promise");
  assert.match(source, /apiGetMediaAssetSummary\(\)/);
  assert.match(source, /mediaSummaryOutcome\(result\)/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test("STATIC: a refresh clears the previous summary before re-reading", () => {
  const source = read(HOOK);

  assert.match(source, /setState\(mediaSummaryLoadingState\(\)\)/, "the old snapshot is dropped on every run");
  assert.match(source, /if \(!alive \|\| latest\.current !== requestId\) return;/, "a stale response cannot restore counts");
});

test("the summary model has no path from a failure to a numeric count", () => {
  // Mirrors what the cards receive after a failed or refused read.
  for (const state of [
    { status: "error", summary: null },
    { status: "unauthorized", summary: null },
    { status: "loading", summary: null },
  ]) {
    const cards = buildMediaCardModels(state);
    assert.deepEqual(cards.map((card) => card.value), Array(8).fill("—"), state.status);
  }
});

test("STATIC: upload and placement controls are permission-gated again", () => {
  const source = read(PAGE);

  assert.match(source, /import \{ resolveMediaAccess \} from "\.\.\/\.\.\/\.\.\/services\/media\/mediaAccess"/);
  assert.match(source, /const \{ admin, isSuperAdmin \} = useAdminAuth\(\)/);
  assert.match(source, /resolveMediaAccess\(\{ admin, employee \}\)/);
  assert.doesNotMatch(source, /useMediaActions/, "the local write hook stays out of the page");

  // Both controls sit inside the `canUpload` gate, as they did before Batch 5.
  assert.equal(
    (source.match(/\{mediaAccess\.canUpload \? \(/g) || []).length,
    2,
    "one gate for Upload Product Media, one for the placement panel"
  );
  const gate = source.slice(source.indexOf("{mediaAccess.canUpload ? ("));
  assert.match(gate, /Upload Product Media/, "Batch 6 label");
  assert.match(
    source,
    /\{mediaAccess\.canUpload \? \(\s*<section[\s\S]{0,1200}<PlacementAssetPanel/,
    "the Batch 7 disclosure is inside the same gate"
  );
});

test("the restored gate follows the house access rules", () => {
  // Using the same resolver the page calls, with no new permission system.
  assert.equal(resolveMediaAccess({}).canUpload, false, "no session cannot upload");
  // An ADMIN whose resolved grants carry the media codes (the built-in role
  // default) keeps the full media surface.
  const fullAdmin = {
    adminId: "ADM-1",
    name: "A",
    status: "ACTIVE",
    accountLevel: "ADMIN",
    permissions: ["media.view", "media.upload", "media.assign", "media.delete"],
  };
  assert.equal(resolveMediaAccess({ admin: fullAdmin }).canUpload, true, "a default admin session can");
  // A role-limited ADMIN without media.upload must not be shown the control.
  assert.equal(
    resolveMediaAccess({
      admin: { ...fullAdmin, adminId: "ADM-2", permissions: ["products.view"] },
    }).canUpload,
    false,
    "a custom-permission admin without media.upload cannot"
  );
  assert.equal(
    resolveMediaAccess({ employee: { status: "ACTIVE", permissions: [] } }).canUpload,
    false,
    "an employee without media.upload cannot"
  );
  assert.equal(
    resolveMediaAccess({ employee: { status: "ACTIVE", permissions: ["media.upload"] } }).canUpload,
    true,
    "the existing grant still unlocks it"
  );
});

// ===========================================================================
// Batch 7A — the empty-state cross-reference must not point "above"
// ===========================================================================
// Batch 7 moved the homepage placement panel BELOW the registry, which left
// this sentence pointing the wrong way. It now names the panel without
// claiming a direction, so it stays true for every viewer — including a
// role-limited admin, for whom the gated panel is not rendered at all.

test("STATIC: the empty-state copy no longer tells the reader to look above", () => {
  const source = read(PANEL);

  assert.doesNotMatch(
    source,
    /placement panel above/i,
    "the placement panel now sits below the registry"
  );
  assert.doesNotMatch(
    source,
    /panel above/i,
    "no stale upward cross-reference anywhere in the panel"
  );
  assert.match(
    source,
    /hero and\s+marketing artwork from the Homepage placement art panel on this page\./,
    "the copy names the panel and its location truthfully"
  );
});
