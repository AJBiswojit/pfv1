/** Regression: storefront hydrate must walk GET /products until `total`. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_HYDRATE_PAGE_SIZE,
  fetchAllPublishedProducts,
} from "../src/services/catalog/catalogStore.js";

test("hydrate walks pages until items cover the reported total", async () => {
  const calls = [];
  const listFn = async ({ page, pageSize }) => {
    calls.push({ page, pageSize });
    assert.equal(pageSize, CATALOG_HYDRATE_PAGE_SIZE);
    if (page === 1) {
      return {
        ok: true,
        items: Array.from({ length: pageSize }, (_, i) => ({ id: `P-${i + 1}` })),
        total: pageSize + 12,
      };
    }
    if (page === 2) {
      return {
        ok: true,
        items: Array.from({ length: 12 }, (_, i) => ({ id: `P-${pageSize + i + 1}` })),
        total: pageSize + 12,
      };
    }
    assert.fail(`unexpected page ${page}`);
  };

  const result = await fetchAllPublishedProducts(listFn);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, CATALOG_HYDRATE_PAGE_SIZE + 12);
  assert.equal(result.total, CATALOG_HYDRATE_PAGE_SIZE + 12);
  assert.deepEqual(calls.map((c) => c.page), [1, 2]);
});

test("hydrate stops on a short page when total is omitted (honest last page)", async () => {
  const listFn = async ({ page }) => {
    if (page === 1) return { ok: true, items: [{ id: "A" }, { id: "B" }] };
    assert.fail("must not request another page when the first page is short");
  };
  const result = await fetchAllPublishedProducts(listFn);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
});

test("hydrate does not invent products when the first page fails", async () => {
  const result = await fetchAllPublishedProducts(async () => ({ ok: false, error: "backend down" }));
  assert.equal(result.ok, false);
  assert.equal(result.error, "backend down");
});

test("omitted total on a full page is an incomplete hydrate, not a silent catalogue", async () => {
  const listFn = async ({ page, pageSize }) => {
    if (page === 1) {
      return {
        ok: true,
        items: Array.from({ length: pageSize }, (_, i) => ({ id: `P-${i + 1}` })),
      };
    }
    return { ok: true, items: [] };
  };
  const result = await fetchAllPublishedProducts(listFn);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, CATALOG_HYDRATE_PAGE_SIZE);
  assert.equal(result.total, CATALOG_HYDRATE_PAGE_SIZE);
});

test("omitted total with only full pages cannot invent completeness", async () => {
  const listFn = async ({ page, pageSize }) => ({
    ok: true,
    items: Array.from({ length: pageSize }, (_, i) => ({ id: `P-${page}-${i}` })),
  });
  const result = await fetchAllPublishedProducts(listFn);
  assert.equal(result.ok, false);
  assert.equal(result.partial, true);
  assert.equal(result.total, undefined);
});

test("a later-page failure is an error, not a silently truncated catalogue", async () => {
  const listFn = async ({ page, pageSize }) => {
    if (page === 1) {
      return {
        ok: true,
        items: Array.from({ length: pageSize }, (_, i) => ({ id: `P-${i + 1}` })),
        total: pageSize + 5,
      };
    }
    return { ok: false, error: "page 2 failed" };
  };
  const result = await fetchAllPublishedProducts(listFn);
  assert.equal(result.ok, false);
  assert.equal(result.error, "page 2 failed");
  assert.equal(result.partial, true);
});
