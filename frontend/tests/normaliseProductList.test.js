/** GET /products `total` must never be inferred from this page's length. */

import test from "node:test";
import assert from "node:assert/strict";
import { normaliseProductList } from "../src/services/api/productsApi.js";

test("reported total is kept even when the page is shorter", () => {
  const list = normaliseProductList({
    items: [{ id: "PF-W-SAR-COT-0001", name: "Cotton Saree Fixture" }],
    total: 250,
    page: 1,
    pageSize: 12,
  });
  assert.equal(list.items.length, 1);
  assert.equal(list.total, 250);
});

test("omitted total is undefined, not the page length", () => {
  const list = normaliseProductList({
    items: [
      { id: "A", name: "A" },
      { id: "B", name: "B" },
    ],
    page: 1,
    pageSize: 20,
  });
  assert.equal(list.items.length, 2);
  assert.equal(list.total, undefined);
});

test("a bare array is not treated as a complete catalogue", () => {
  const list = normaliseProductList([{ id: "A", name: "A" }]);
  assert.equal(list.items.length, 1);
  assert.equal(list.total, undefined);
});
