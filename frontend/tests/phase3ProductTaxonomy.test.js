/**
 * Phase 3 Block 2 — the product ↔ taxonomy contract, client side.
 *
 * Block 1 made the editor emit real server taxonomy IDs. Block 2 makes the
 * backend the authority over them, which puts two new obligations on the
 * client and both are pinned here:
 *
 *   1. IDs travel to the server verbatim. Nothing in the write path may fall
 *      back to a category/subcategory NAME, a static `data/catalog/*` slug or
 *      a locally "resolved" label — the server would reject it as unknown.
 *
 *   2. The server's 422 `VALIDATION_ERROR` for a taxonomy rejection must reach
 *      the operator as a field-level message, and must never be mistaken for
 *      a success or collapsed into a generic failure.
 *
 * The real modules run against a mocked `fetch`, the same harness the other
 * suites use — no browser, no React DOM.
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { buildAdminProductPayload } from "../src/services/api/productsApi.js";
import { persistAdminProduct } from "../src/services/admin/productAdminService.js";
import { formatAdminError } from "../src/services/admin/adminError.js";
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

const CATEGORY_ID = "cat-sarees";
const SUBCATEGORY_ID = "cat-sarees-banarasi";

/** Exactly what the backend emits for a rejected taxonomy reference. */
const taxonomyRejection = (field, message, type) =>
  jsonResponse(
    {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message,
        details: [
          {
            loc: ["body", field],
            field,
            msg: message,
            type,
            input: "ghost",
          },
        ],
      },
    },
    422
  );

beforeEach(() => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  globalThis.window = globalThis;
  window.localStorage = storage;
  globalThis.dispatchEvent = () => true;
  window.dispatchEvent = globalThis.dispatchEvent;
});

afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.localStorage;
  delete globalThis.window;
});

/* ------------------------------------------------------------------ */
/* IDs on the wire — no name fallback anywhere in the write path       */
/* ------------------------------------------------------------------ */

test("the payload carries taxonomy IDs verbatim and never substitutes a name", () => {
  const payload = buildAdminProductPayload({
    name: "Banarasi Silk Saree",
    category: CATEGORY_ID,
    subcategory: SUBCATEGORY_ID,
    // Labels the editor holds for display must not leak into the write path.
    categoryName: "Sarees",
    subcategoryName: "Banarasi",
    department: "women",
  });

  assert.equal(payload.category, CATEGORY_ID);
  assert.equal(payload.subcategory, SUBCATEGORY_ID);
  assert.ok(!("categoryName" in payload), "display labels are not part of the contract");
  assert.ok(!("subcategoryName" in payload), "display labels are not part of the contract");
  assert.ok(!("department" in payload), "department has no backend column");
});

test("an unselected taxonomy is sent as an empty string, never as a fabricated slug", () => {
  const payload = buildAdminProductPayload({ name: "Untitled" });
  assert.equal(payload.category, "");
  assert.equal(payload.subcategory, "");
});

test("subcategory options are keyed by the server id so the wire value is an id", async () => {
  mockFetch({
    items: [
      { id: SUBCATEGORY_ID, categoryId: CATEGORY_ID, name: "Banarasi", slug: "banarasi", status: "ACTIVE" },
      { id: "cat-sarees-vintage", categoryId: CATEGORY_ID, name: "Vintage", slug: "vintage", status: "ARCHIVED" },
    ],
  });

  const result = await taxonomyRepository.loadSubcategories(CATEGORY_ID);
  assert.ok(result.ok, result.error);
  assert.deepEqual(
    result.items.map((entry) => entry.id),
    [SUBCATEGORY_ID, "cat-sarees-vintage"]
  );
  for (const entry of result.items) {
    assert.equal(entry.categoryId, CATEGORY_ID, "each option knows its parent category");
  }
});

/* ------------------------------------------------------------------ */
/* The server's 422 reaches the operator as a field-level message      */
/* ------------------------------------------------------------------ */

test("a rejected category surfaces as a 422 with the server's field detail", async () => {
  mockFetch(() =>
    taxonomyRejection("category", "Unknown category 'ghost'.", "value_error.taxonomy.unknown_category")
  );

  const result = await persistAdminProduct(
    { id: "PF-SAR-0001", name: "Saree", category: "ghost", subcategory: "" },
    { isNew: true }
  );

  assert.equal(result.ok, false, "a rejection must never read as saved");
  assert.equal(result.status, 422);
  assert.equal(result.data.error.code, "VALIDATION_ERROR");
  assert.match(result.error, /category: Unknown category 'ghost'\./);

  const rendered = formatAdminError(result, { entity: "product", action: "saved" });
  assert.match(rendered, /rejected this change/);
  assert.match(rendered, /Unknown category 'ghost'\./);
});

test("a mismatched category/subcategory pair points at the subcategory field", async () => {
  mockFetch(() =>
    taxonomyRejection(
      "subcategory",
      "Subcategory 'cat-lehengas-bridal' does not belong to category 'Sarees'.",
      "value_error.taxonomy.subcategory_category_mismatch"
    )
  );

  const result = await persistAdminProduct(
    { id: "PF-SAR-0002", name: "Saree", category: CATEGORY_ID, subcategory: "cat-lehengas-bridal" },
    { isNew: true }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.match(result.error, /^subcategory: /);
  assert.equal(result.data.error.details[0].loc[1], "subcategory");
});

test("an inactive taxonomy rejection is rendered, not swallowed, on update", async () => {
  mockFetch(() =>
    taxonomyRejection(
      "category",
      "Category 'Legacy' is ARCHIVED and cannot be assigned to a product.",
      "value_error.taxonomy.category_status"
    )
  );

  const result = await persistAdminProduct(
    { id: "PF-SAR-0003", name: "Saree", category: "cat-legacy", subcategory: "", exists: true },
    { isNew: false }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  const rendered = formatAdminError(result, { entity: "product", action: "saved" });
  assert.match(rendered, /ARCHIVED/);
});

test("a taxonomy rejection is distinguishable from a 409 identity conflict", async () => {
  mockFetch(() =>
    jsonResponse(
      {
        success: false,
        error: { code: "CONFLICT", message: "Product ID 'PF-SAR-0001' is already taken.", details: {} },
      },
      409
    )
  );

  const conflict = await persistAdminProduct(
    { id: "PF-SAR-0001", name: "Saree", category: CATEGORY_ID, subcategory: SUBCATEGORY_ID },
    { isNew: true }
  );

  assert.equal(conflict.status, 409);
  const rendered = formatAdminError(conflict, { entity: "product", action: "saved" });
  assert.match(rendered, /Conflict:/);
  assert.ok(!/rejected this change/.test(rendered), "409 must not read as a validation failure");
});
