import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  apiClient,
  setTokens,
  clearTokens,
} from "../src/services/api/apiClient.js";

import {
  apiListCategories,
  apiGetCategory,
  apiListSubcategories,
  apiAdminListCategories,
  apiAdminGetCategory,
  apiAdminListSubcategories,
  apiAdminCreateCategory,
  apiAdminUpdateCategory,
  apiAdminActivateCategory,
  apiAdminArchiveCategory,
  apiAdminRestoreCategory,
  apiAdminCreateSubcategory,
  apiAdminUpdateSubcategory,
  apiAdminActivateSubcategory,
  apiAdminArchiveSubcategory,
  apiAdminRestoreSubcategory,
} from "../src/services/api/categoriesApi.js";

import {
  apiListCollections,
  apiGetCollection,
  apiAdminListCollections,
  apiAdminGetCollection,
  apiAdminCreateCollection,
  apiAdminUpdateCollection,
  apiAdminActivateCollection,
  apiAdminPauseCollection,
  apiAdminArchiveCollection,
  apiAdminRestoreCollection,
  apiAdminAssignCollectionProducts,
  apiAdminGetTaxonomyMetrics,
  apiAdminGetTaxonomyProductCounts,
} from "../src/services/api/collectionsApi.js";

import taxonomyRepository from "../src/services/taxonomyRepository.js";

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
  removeItem(key) {
    this.map.delete(String(key));
  }
  clear() {
    this.map.clear();
  }
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let originalFetch;
let originalStorage;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalStorage = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage();
  setTokens({ accessToken: "test_admin_jwt", refreshToken: "test_admin_refresh" }, "admin");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.localStorage = originalStorage;
});

test("1. Category API methods send explicit scopes and correct endpoints", async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method ?? "GET", headers: opts.headers });
    return jsonResponse({
      id: "cat-1",
      name: "Sarees",
      slug: "sarees",
      status: "ACTIVE",
      sortOrder: 1,
      bannerMediaId: "med-1",
    });
  };

  // Public category list -> scope: "none", no auth header
  await apiListCategories();
  assert.equal(calls[calls.length - 1].method, "GET");
  assert.match(calls[calls.length - 1].url, /\/categories\?status=ACTIVE/);
  assert.equal(calls[calls.length - 1].headers.Authorization, undefined);

  // Admin category list -> scope: "admin", auth header present
  await apiAdminListCategories();
  assert.equal(calls[calls.length - 1].method, "GET");
  assert.match(calls[calls.length - 1].url, /\/admin\/categories/);
  assert.equal(calls[calls.length - 1].headers.Authorization, "Bearer test_admin_jwt");

  // Admin activate category -> POST /admin/categories/cat-1/activate
  await apiAdminActivateCategory("cat-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/categories\/cat-1\/activate/);

  // Admin archive category -> POST /admin/categories/cat-1/archive
  await apiAdminArchiveCategory("cat-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/categories\/cat-1\/archive/);

  // Admin restore category -> POST /admin/categories/cat-1/restore
  await apiAdminRestoreCategory("cat-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/categories\/cat-1\/restore/);
});

test("2. Subcategory API methods send explicit scopes and support dedicated lifecycle", async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method ?? "GET", headers: opts.headers });
    return jsonResponse({
      id: "cat-1-silk",
      categoryId: "cat-1",
      name: "Silk",
      slug: "silk",
      status: "ACTIVE",
    });
  };

  // Public list subcategories -> defaults to status=ACTIVE
  await apiListSubcategories("cat-1");
  assert.match(calls[calls.length - 1].url, /\/categories\/cat-1\/subcategories\?status=ACTIVE/);
  assert.equal(calls[calls.length - 1].headers.Authorization, undefined);

  // Admin list subcategories -> does NOT force status=ACTIVE
  await apiAdminListSubcategories("cat-1");
  assert.match(calls[calls.length - 1].url, /\/admin\/categories\/cat-1\/subcategories$/);
  assert.equal(calls[calls.length - 1].headers.Authorization, "Bearer test_admin_jwt");

  // Admin activate subcategory -> POST /admin/subcategories/sub-1/activate
  await apiAdminActivateSubcategory("sub-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/subcategories\/sub-1\/activate/);

  // Admin archive subcategory -> POST /admin/subcategories/sub-1/archive
  await apiAdminArchiveSubcategory("sub-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/subcategories\/sub-1\/archive/);

  // Admin restore subcategory -> POST /admin/subcategories/sub-1/restore
  await apiAdminRestoreSubcategory("sub-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/subcategories\/sub-1\/restore/);
});

test("3. Collection API methods support dedicated lifecycle and taxonomy metrics", async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method ?? "GET", headers: opts.headers });
    return jsonResponse({
      id: "col-1",
      name: "Festive",
      slug: "festive",
      status: "ACTIVE",
      type: "MANUAL",
    });
  };

  // Activate collection -> POST /admin/collections/col-1/activate
  await apiAdminActivateCollection("col-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/collections\/col-1\/activate/);

  // Pause collection -> POST /admin/collections/col-1/pause
  await apiAdminPauseCollection("col-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/collections\/col-1\/pause/);

  // Archive collection -> POST /admin/collections/col-1/archive
  await apiAdminArchiveCollection("col-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/collections\/col-1\/archive/);

  // Restore collection -> POST /admin/collections/col-1/restore
  await apiAdminRestoreCollection("col-1");
  assert.equal(calls[calls.length - 1].method, "POST");
  assert.match(calls[calls.length - 1].url, /\/admin\/collections\/col-1\/restore/);

  // Taxonomy metrics -> GET /admin/taxonomy/metrics
  await apiAdminGetTaxonomyMetrics();
  assert.equal(calls[calls.length - 1].method, "GET");
  assert.match(calls[calls.length - 1].url, /\/admin\/taxonomy\/metrics/);
  assert.equal(calls[calls.length - 1].headers.Authorization, "Bearer test_admin_jwt");

  // Taxonomy product counts -> GET /admin/taxonomy/product-counts
  await apiAdminGetTaxonomyProductCounts();
  assert.equal(calls[calls.length - 1].method, "GET");
  assert.match(calls[calls.length - 1].url, /\/admin\/taxonomy\/product-counts/);
  assert.equal(calls[calls.length - 1].headers.Authorization, "Bearer test_admin_jwt");
});

test("4. taxonomyRepository uses dedicated restore endpoints (API-190 fix)", async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: opts.method ?? "GET" });
    if (String(url).includes("/subcategories/sub-1/restore")) {
      return jsonResponse({ subcategory: { id: "sub-1", name: "Banarasi", status: "ACTIVE" } });
    }
    if (String(url).includes("/collections/col-1/restore")) {
      return jsonResponse({ collection: { id: "col-1", name: "Bridal", status: "DRAFT" } });
    }
    return jsonResponse({ items: [] });
  };

  // Restore subcategory
  const subRes = await taxonomyRepository.restoreSubcategory("sub-1");
  assert.equal(subRes.ok, true);
  const subCall = calls.find((c) => c.url.includes("/subcategories/sub-1/restore"));
  assert.ok(subCall, "Must issue POST /admin/subcategories/sub-1/restore");
  assert.equal(subCall.method, "POST");

  // Restore collection
  const colRes = await taxonomyRepository.restoreCollection("col-1");
  assert.equal(colRes.ok, true);
  const colCall = calls.find((c) => c.url.includes("/collections/col-1/restore"));
  assert.ok(colCall, "Must issue POST /admin/collections/col-1/restore");
  assert.equal(colCall.method, "POST");
});

test("5. taxonomyRepository.loadCollection and loadCategory do not fallback to fake data on failure", async () => {
  globalThis.fetch = async (url, opts) => {
    return jsonResponse(
      { success: false, error: { code: "NOT_FOUND", message: "Entity does not exist", details: {} } },
      404
    );
  };

  const catRes = await taxonomyRepository.loadCategory("nonexistent-cat");
  assert.equal(catRes.ok, false);
  assert.equal(catRes.status, 404);
  assert.equal(catRes.error, "Entity does not exist");

  const colRes = await taxonomyRepository.loadCollection("nonexistent-col");
  assert.equal(colRes.ok, false);
  assert.equal(colRes.status, 404);
  assert.equal(colRes.error, "Entity does not exist");
});
