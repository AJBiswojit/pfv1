/**
 * Phase 3 Step 11A — normalizer precedence and media error preservation.
 *
 * These tests intentionally exercise the public API seams rather than a
 * private normalizer so they prove the response reaches the frontend caller.
 */

import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { apiGetProduct } from "../src/services/api/productsApi.js";
import {
  apiDeleteMediaObject,
  apiGetMediaObjectMeta,
  apiGetMediaStorageStatus,
  apiGetProductMediaSet,
  apiListMediaAssets,
  apiRegisterMediaObject,
  apiResolveMediaReferences,
  apiUploadMediaObject,
  apiUploadProductMediaObject,
} from "../src/services/api/mediaApi.js";
import { getRegisteredProductMedia } from "../src/services/media/productMediaService.js";

const originalFetch = globalThis.fetch;

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const structuredDetails = [
  { field: "mediaId", value: "missing-id" },
];

const structuredError = {
  success: false,
  error: {
    code: "MEDIA_NOT_FOUND",
    message: "Media object not found",
    details: structuredDetails,
  },
};

const mockJson = (body, status = 200) => {
  globalThis.fetch = async () => jsonResponse(body, status);
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ===========================================================================
// API-051 — canonical compareAtPrice precedence
// ===========================================================================

test("API-051 normalises compareAtPrice through the public product API", async () => {
  const cases = [
    {
      name: "only compareAtPrice",
      input: { compareAtPrice: 1800 },
      expected: 1800,
    },
    {
      name: "only compare_at_price",
      input: { compare_at_price: 1700 },
      expected: 1700,
    },
    {
      name: "neither field",
      input: {},
      expected: null,
    },
    {
      name: "both fields equal",
      input: { compareAtPrice: 1600, compare_at_price: 1600 },
      expected: 1600,
    },
    {
      name: "both fields conflicting",
      input: { compareAtPrice: 1500, compare_at_price: 900 },
      expected: 1500,
    },
  ];

  for (const scenario of cases) {
    mockJson({ product: { id: "PF-STEP11A-0001", ...scenario.input } });
    const result = await apiGetProduct("PF-STEP11A-0001");
    assert.equal(result.ok, true, scenario.name);
    assert.equal(result.product.compareAtPrice, scenario.expected, scenario.name);
  }
});

// ===========================================================================
// STEP11-ERR-002 — structured errors survive every affected media adapter
// ===========================================================================

const mediaAdapters = [
  ["storage status", () => apiGetMediaStorageStatus()],
  ["reference resolution", () => apiResolveMediaReferences(["missing-id"])],
  ["object metadata", () => apiGetMediaObjectMeta("products/missing.png")],
  ["product media set", () => apiGetProductMediaSet("PF-STEP11A-0001")],
  ["generic upload", () => apiUploadMediaObject(new File(["bytes"], "missing.png", { type: "image/png" }))],
  ["product upload", () => apiUploadProductMediaObject("PF-STEP11A-0001", new File(["bytes"], "missing.png", { type: "image/png" }))],
  ["media registration", () => apiRegisterMediaObject("products/missing.png")],
  ["asset listing", () => apiListMediaAssets()],
  ["object deletion", () => apiDeleteMediaObject("products/missing.png")],
];

test("media adapters preserve canonical structured 422 errors", async () => {
  for (const [name, call] of mediaAdapters) {
    mockJson(structuredError, 422);
    const result = await call();

    assert.equal(result.ok, false, name);
    assert.equal(result.code, "MEDIA_NOT_FOUND", name);
    // HTTP 422 derives the backwards-compatible error string from its details;
    // the canonical server message remains available in result.data.
    assert.equal(typeof result.error, "string", name);
    assert.equal(result.data.error.message, "Media object not found", name);
    assert.deepEqual(result.details, structuredDetails, name);
    assert.deepEqual(result.data, structuredError, name);
    assert.equal(result.status, 422, name);
    assert.equal(result.isNetworkError, false, name);
  }
});

test("media error status and network classifications survive handleError", async () => {
  for (const status of [401, 403, 404, 409]) {
    mockJson(
      {
        success: false,
        error: {
          code: `MEDIA_${status}`,
          message: `Media failure ${status}`,
          details: { status },
        },
      },
      status
    );
    const result = await apiGetMediaStorageStatus();
    assert.equal(result.ok, false);
    assert.equal(result.code, `MEDIA_${status}`);
    assert.equal(result.error, `Media failure ${status}`);
    assert.deepEqual(result.details, { status });
    assert.equal(result.status, status);
    assert.equal(result.isNetworkError, false);
  }

  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  const network = await apiGetMediaStorageStatus();
  assert.equal(network.ok, false);
  assert.equal(network.code, "NETWORK_ERROR");
  assert.equal(network.status, 0);
  assert.equal(network.isNetworkError, true);
  assert.equal(network.data, null);
});

test("the product-media orchestration preserves structured read failures", async () => {
  mockJson(structuredError, 422);
  const result = await getRegisteredProductMedia("PF-STEP11A-0001");

  assert.equal(result.ok, false);
  assert.equal(result.code, "MEDIA_NOT_FOUND");
  assert.deepEqual(result.details, structuredDetails);
  assert.deepEqual(result.data, structuredError);
  assert.equal(result.status, 422);
  assert.equal(result.isNetworkError, false);
});
