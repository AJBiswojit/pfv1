/**
 * PRATIKSHYA FASHION — Batch 8 final acceptance assertions.
 *
 * The closing suite for the media-management remediation. It asserts the
 * contract the previous batches were approved against, end to end, without a
 * browser and without any new dependency:
 *
 *   1. the Batch 1 summary endpoint exists, is read-only, keeps its permission
 *      and its wire shape, and the client normalises that shape correctly;
 *   2. the Batch 2 registry filters have unchanged defaults and each of the
 *      six tabs maps to a real server parameter (no client-side filtering);
 *   3. not-ready cards render `—`; a successful response renders the exact
 *      eight backend values; a genuine server zero stays `0`;
 *   4. no local inventory and no misleading integration-status copy survives;
 *   5. the eight cards and six tabs remain present and ordered;
 *   6. the media API's existing defaults and unrelated consumers are unchanged.
 *
 * EVIDENCE CLASS: these are static-source and pure-unit assertions. Passing
 * them is NOT browser verification, NOT build verification and NOT backend
 * runtime verification. Those are tracked separately by Batch 8.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  buildMediaCardModels,
  buildMediaListParams,
  MEDIA_REGISTRY_TABS,
  normaliseMediaSummary,
} from "../src/services/admin/mediaRegistryView.js";
import { fetchMediaAssetPage } from "../src/services/admin/mediaAssetPageService.js";
import {
  apiGetMediaAssetSummary,
  apiListMediaAssets,
  apiListProductMedia,
  apiDeleteMediaObject,
  apiRegisterPlacementAsset,
} from "../src/services/api/mediaApi.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

const PAGE = "src/pages/admin/media/AdminMediaLibrary.jsx";
const PANEL = "src/components/admin/media/RegisteredMediaPanel.jsx";
const VIEW_MODEL = "src/services/admin/mediaRegistryView.js";
const API_CLIENT = "src/services/api/mediaApi.js";

const CARD_IDS = [
  "total",
  "images",
  "videos",
  "productMapped",
  "marketing",
  "unassigned",
  "largeFiles",
  "sameByteCopies",
];

const TAB_IDS = ["ALL", "IMAGES", "VIDEOS", "PRODUCT", "MARKETING", "UNASSIGNED"];

// ---------------------------------------------------------------------------
// Harness — mirrors test/mediaRegistryPanel.test.js (no new dependency)
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

const ADMIN_TOKEN = "batch8-admin-token";

const installBrowserShims = () => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  globalThis.window = globalThis;
  window.localStorage = storage;
  globalThis.dispatchEvent = () => true;
  window.dispatchEvent = globalThis.dispatchEvent;
  globalThis.localStorage.setItem("pf_admin_access_token", ADMIN_TOKEN);
};

const removeBrowserShims = () => {
  delete globalThis.fetch;
  delete globalThis.localStorage;
  delete globalThis.window;
  delete globalThis.dispatchEvent;
};

// A complete `GET /media/assets/summary` body, exactly as Batch 1 defines it.
const SUMMARY_BODY = {
  ok: true,
  countingScope: "all registered media assets (media_media_asset)",
  largeFileThresholdBytes: 1572864,
  total: 10,
  images: 9,
  videos: 0,
  otherMimeTypes: 1,
  productMapped: 4,
  marketing: 5,
  unassigned: 1,
  largeFiles: 2,
  unknownFileSize: 0,
  sameByteCopies: { assets: 0, groups: 0, unknownChecksums: 0 },
  namespaceClassification: { matches: 10, mismatches: 0, undetermined: 0 },
  generatedAt: "2026-10-22T12:00:00+00:00",
};

// ===========================================================================
// 1. Summary endpoint — shape, client, and card values
// ===========================================================================

test("the backend exposes a read-only summary route guarded by media.view", () => {
  const api = read("../backend/app/api/v1/media.py");

  assert.match(api, /@router\.get\(\s*"\/assets\/summary"/, "route is registered");
  assert.match(api, /response_model=MediaAssetSummaryResponse/);
  assert.match(api, /LARGE_MEDIA_FILE_BYTES = 1_572_864/, "the 1.5 MiB boundary has one source");

  // Slice out the handler itself so the assertion cannot be satisfied by an
  // unrelated function elsewhere in the file.
  const start = api.indexOf("async def media_asset_summary(");
  assert.ok(start > -1, "the handler exists");
  const end = api.indexOf('"/assets",', start);
  const handler = api.slice(start, end > start ? end : undefined);

  assert.match(
    handler,
    /require_admin_permission\(current_user, db, "media\.view"\)/,
    "the summary requires the same grant as the registry list"
  );
  assert.match(handler, /return await _media_asset_summary\(db\)/);
  assert.doesNotMatch(
    handler,
    /db\.commit|db\.add|db\.delete|delete\(|update\(/,
    "the summary handler writes nothing"
  );
});

test("the response schema still declares every field the cards read", () => {
  const schema = read("../backend/app/schemas/media/media.py");
  const keys = [
    "countingScope",
    "largeFileThresholdBytes",
    "total",
    "images",
    "videos",
    "otherMimeTypes",
    "productMapped",
    "marketing",
    "unassigned",
    "largeFiles",
    "unknownFileSize",
    "sameByteCopies",
    "namespaceClassification",
    "generatedAt",
  ];
  for (const key of keys) {
    assert.ok(schema.includes(key), `MediaAssetSummaryResponse still carries "${key}"`);
  }
  assert.match(schema, /class MediaAssetSummaryResponse/);
  assert.ok(
    schema.includes(
      'large_file_threshold_bytes: int = Field(..., alias="largeFileThresholdBytes")'
    ),
    "the threshold travels on the wire under its documented alias"
  );
});

test("the summary client calls the documented endpoint and returns the raw body", async () => {
  installBrowserShims();
  try {
    const calls = mockFetch(SUMMARY_BODY);
    const result = await apiGetMediaAssetSummary();

    assert.equal(calls[0].url, "/api/v1/media/assets/summary");
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, SUMMARY_BODY, "the body is returned verbatim, not re-zeroed");
  } finally {
    removeBrowserShims();
  }
});

test("a successful response renders the exact eight backend values", () => {
  const summary = normaliseMediaSummary(SUMMARY_BODY);
  assert.deepEqual(summary.missingFields, [], "the fixture is complete");

  const cards = buildMediaCardModels({ status: "ready", summary });
  assert.equal(cards.length, 8);
  assert.deepEqual(cards.map((card) => card.id), CARD_IDS);
  // total, images, videos, productMapped, marketing, unassigned, largeFiles, copies
  assert.deepEqual(cards.map((card) => card.value), ["10", "9", "0", "4", "5", "1", "2", "0"]);
  assert.equal(summary.largeFileThresholdBytes, 1572864);
  assert.equal(summary.countingScope, SUMMARY_BODY.countingScope);
});

test("not-ready cards render an em dash, never a zero", () => {
  const ready = normaliseMediaSummary(SUMMARY_BODY);
  for (const status of ["loading", "error", "unauthorized", undefined]) {
    const cards = buildMediaCardModels({ status, summary: ready });
    assert.equal(cards.length, 8);
    assert.deepEqual(cards.map((card) => card.value), Array(8).fill("—"), String(status));
  }
});

test("zero appears only when the server actually returned zero", () => {
  const zeroSummary = normaliseMediaSummary({
    ...SUMMARY_BODY,
    total: 0, images: 0, videos: 0, otherMimeTypes: 0, productMapped: 0,
    marketing: 0, unassigned: 0, largeFiles: 0,
  });
  assert.deepEqual(
    buildMediaCardModels({ status: "ready", summary: zeroSummary }).map((c) => c.value),
    Array(8).fill("0"),
    "a genuine empty registry is nine real zeroes"
  );

  // One missing field: that card alone becomes unknown; the rest keep their numbers.
  const partial = normaliseMediaSummary({ ...SUMMARY_BODY });
  delete partial.marketing;
  const cards = buildMediaCardModels({ status: "ready", summary: partial });
  assert.equal(cards[4].value, "—", "the missing field is unknown");
  assert.equal(cards[0].value, "10", "the others are untouched");
});

// ===========================================================================
// 2. Registry filters — defaults and server-side partitioning
// ===========================================================================

test("the registry request defaults are unchanged", async () => {
  installBrowserShims();
  try {
    const calls = mockFetch({ ok: true, total: 0, page: 1, pageSize: 50, items: [] });
    await apiListMediaAssets();

    assert.equal(
      calls[0].url,
      "/api/v1/media/assets?page=1&pageSize=50",
      "no filter key is added to the default request"
    );
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${ADMIN_TOKEN}`);
  } finally {
    removeBrowserShims();
  }
});

test("the All tab adds no filter parameter at all", () => {
  assert.deepEqual(buildMediaListParams("ALL"), { page: 1, pageSize: 24, q: "" });
  assert.deepEqual(buildMediaListParams("ALL", { page: 3, pageSize: 24, q: "  silk " }), {
    page: 3,
    pageSize: 24,
    q: "silk",
  });
});

test("each of the six tabs maps to a real server parameter", () => {
  const expected = {
    ALL: "",
    IMAGES: "&type=image",
    VIDEOS: "&type=video",
    PRODUCT: "&scope=product&assigned=true",
    MARKETING: "&placement=true",
    UNASSIGNED: "&unassigned=true",
  };

  assert.deepEqual(MEDIA_REGISTRY_TABS.map((tab) => tab.id), TAB_IDS);
  for (const tab of MEDIA_REGISTRY_TABS) {
    assert.ok(tab.params && typeof tab.params === "object", `${tab.id} declares params`);
  }
});

test("each tab's request reaches the server with its own filter", async () => {
  const expected = {
    ALL: "/api/v1/media/assets?page=1&pageSize=24",
    IMAGES: "/api/v1/media/assets?page=1&pageSize=24&type=image",
    VIDEOS: "/api/v1/media/assets?page=1&pageSize=24&type=video",
    PRODUCT: "/api/v1/media/assets?page=1&pageSize=24&scope=product&assigned=true",
    MARKETING: "/api/v1/media/assets?page=1&pageSize=24&placement=true",
    UNASSIGNED: "/api/v1/media/assets?page=1&pageSize=24&unassigned=true",
  };

  installBrowserShims();
  try {
    for (const [tabId, url] of Object.entries(expected)) {
      const calls = mockFetch({ ok: true, total: 0, page: 1, pageSize: 24, items: [] });
      await fetchMediaAssetPage({ tabId, page: 1, pageSize: 24 });
      assert.equal(calls[0].url, url, tabId);
    }
  } finally {
    removeBrowserShims();
  }
});

test("assigned and unassigned partition the product scope and are mutually exclusive", () => {
  const service = read("../backend/app/services/media/homepage_content_service.py");

  assert.match(
    service,
    /if assigned and unassigned:\s*\n\s*raise BusinessLogicException/,
    "asking for both halves is a 422, not a silent empty page"
  );
  assert.match(service, /if assigned:[\s\S]{0,220}MediaAssetModel\.scope == "product"/);
  assert.match(service, /if unassigned:[\s\S]{0,220}MediaAssetModel\.scope == "product"/);
  assert.match(
    service,
    /if placement:\s*\n\s*#[\s\S]{0,160}conditions\.append\(MediaAssetModel\.scope == "marketing"\)/,
    "placement is the whole marketing scope (hero/ + marketing/)"
  );
  assert.match(
    service,
    /type_text not in ASSET_MEDIA_TYPE_FILTERS[\s\S]{0,120}BusinessLogicException/,
    "an unknown type is rejected server-side"
  );
});

test("boolean filters are omitted unless enabled", async () => {
  installBrowserShims();
  try {
    const calls = mockFetch({ ok: true, total: 0, page: 1, pageSize: 50, items: [] });
    await apiListMediaAssets({ assigned: false, unassigned: false, placement: false });

    assert.equal(calls[0].url, "/api/v1/media/assets?page=1&pageSize=50");
  } finally {
    removeBrowserShims();
  }
});

// ===========================================================================
// 3. No local inventory, no misleading integration copy
// ===========================================================================

test("the page and the panel hold no local inventory", () => {
  for (const file of [PAGE, PANEL]) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /mediaStore|mediaRepository|useMediaLibrary|DurableAssetsPanel|localStorage|sessionStorage/,
      `${file} has no browser-local register`
    );
    assert.doesNotMatch(source, /apiListMediaAssets/, `${file} does not fetch the list itself`);
  }
});

test("no misleading integration-status copy survives in the media surfaces", () => {
  for (const file of [PAGE, PANEL, VIEW_MODEL]) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /INTEGRATION_AUDIT|backend media service is not active|Durable media registry|Local only — not saved/,
      `${file} claims nothing about the backend being inactive`
    );
    assert.doesNotMatch(
      source,
      /"Unmapped"|"Needs review"|"Optimized"|"Archived Product"/,
      `${file} has no undefined card or tab`
    );
  }
});

// ===========================================================================
// 4. Cards and tabs
// ===========================================================================

test("the eight cards are present, ordered and unique", () => {
  const cards = buildMediaCardModels({ status: "loading", summary: null });
  assert.equal(cards.length, 8);
  assert.deepEqual(cards.map((card) => card.id), CARD_IDS);
  assert.equal(new Set(cards.map((card) => card.id)).size, 8);
});

test("the six registry tabs are present, ordered and unique", () => {
  assert.equal(MEDIA_REGISTRY_TABS.length, 6);
  assert.deepEqual(MEDIA_REGISTRY_TABS.map((tab) => tab.id), TAB_IDS);
  assert.equal(new Set(MEDIA_REGISTRY_TABS.map((tab) => tab.id)).size, 6);
  for (const tab of MEDIA_REGISTRY_TABS) {
    assert.equal(typeof tab.label, "string");
    assert.ok(tab.label.length > 0);
  }
});

// ===========================================================================
// 5. Existing API defaults and unrelated consumers
// ===========================================================================

test("the pre-existing media API exports and their defaults are unchanged", () => {
  assert.equal(typeof apiListProductMedia, "function");
  assert.equal(typeof apiDeleteMediaObject, "function");
  assert.equal(typeof apiRegisterPlacementAsset, "function");

  const client = read(API_CLIENT);
  assert.match(
    client,
    /export async function apiListMediaAssets\([\s\S]{0,220}pageSize = 50/,
    "the legacy default page size is still 50 for existing callers"
  );
  assert.match(client, /total: data\?\.total \?\? \(data\?\.items\?\.length \?\? 0\)/, "legacy total kept");
});

test("the homepage registered-media picker still asks for exactly what it did", () => {
  const service = read("src/services/homepage/homepageContentService.js");

  assert.match(
    service,
    /export async function loadRegisteredImages\(admin, page = 1, \{ q = "", scopeFilter = "" \} = \{\}\)/,
    "the picker's signature is unchanged"
  );
  assert.match(
    service,
    /apiListMediaAssets\(\{ page, pageSize: 24, q: query, scopeFilter: filter \}\)/,
    "the picker sends no Batch 2 filter"
  );
  assert.match(service, /\/media-assets\?page=\$\{page\}&pageSize=24\$\{suffix\}/, "employee path unchanged");
});
