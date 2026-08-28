/**
 * Phase 3 Block 3 — SKU / slug conflicts on the client (frontend contract).
 *
 * The backend now answers a duplicate SKU or slug with HTTP 409 `CONFLICT`
 * and `details: { field, value, suggestedSlug? }` instead of silently
 * accepting the duplicate (SKU) or silently renaming it (slug). This suite
 * pins the client half of that contract:
 *
 *   * a 409 must survive `ApiError` normalisation with its status, its
 *     `CONFLICT` code and its `details` INTACT — it must never be flattened
 *     into a generic network/server failure;
 *   * `suggestedSlug` must reach the operator, so the retry is deterministic;
 *   * a 409 must stay distinguishable from a Block 2 taxonomy 422;
 *   * the create payload sends a slug ONLY when the operator typed one
 *     (a locally fabricated slug would now cause spurious 409s);
 *   * Block 1 Save & Continue and the Block 2 taxonomy ids are unchanged.
 *
 * Same harness as the other suites: real service/API modules, mocked fetch.
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  apiAdminCreateDraft,
  apiAdminCreateProduct,
  apiAdminUpdateProduct,
  buildAdminProductPayload,
} from "../src/services/api/productsApi.js";
import { persistAdminProduct } from "../src/services/admin/productAdminService.js";
import { formatAdminError } from "../src/services/admin/adminError.js";

const CATEGORY_ID = "6f1c2b3a-0000-4000-8000-0000000000c1";
const SUBCATEGORY_ID = "7a9d0001-0000-4000-8000-0000000000c2";

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

/** Exactly what the backend emits for a duplicate SKU (canonical envelope). */
const skuConflict = () =>
  jsonResponse(
    {
      success: false,
      error: {
        code: "CONFLICT",
        message: "SKU 'PF-SAR-0001' is already in use.",
        details: { field: "sku", value: "PF-SAR-0001" },
      },
    },
    409
  );

/** …and for a duplicate slug, which additionally carries the suggestion. */
const slugConflict = () =>
  jsonResponse(
    {
      success: false,
      error: {
        code: "CONFLICT",
        message: "Slug 'banarasi-silk' is already in use.",
        details: {
          field: "slug",
          value: "banarasi-silk",
          suggestedSlug: "banarasi-silk-2",
        },
      },
    },
    409
  );

/** A Block 2 taxonomy rejection — must remain a different thing entirely. */
const taxonomyRejection = () =>
  jsonResponse(
    {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed.",
        details: [
          { loc: ["body", "category"], msg: "Unknown category 'ghost'.", type: "value_error" },
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
/* 409 survives normalisation on every write path                      */
/* ------------------------------------------------------------------ */

test("a duplicate SKU 409 keeps status, CONFLICT code and details on the draft create path", async () => {
  mockFetch(() => skuConflict());

  const result = await apiAdminCreateDraft({
    id: "PF-SAR-0002",
    name: "Saree",
    sku: "PF-SAR-0001",
    category: CATEGORY_ID,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409, "the status must not be collapsed to 0 or 500");
  assert.equal(result.code, "CONFLICT");
  assert.equal(result.isNetworkError, false, "a 409 is a server verdict, not a network failure");
  assert.equal(result.details.field, "sku");
  assert.equal(result.details.value, "PF-SAR-0001");
  assert.match(result.error, /already in use/i, "the server's own sentence reaches the caller");
});

test("a duplicate SKU 409 is preserved identically on the runtime create path", async () => {
  mockFetch(() => skuConflict());

  const result = await apiAdminCreateProduct({ name: "Saree", sku: "PF-SAR-0001" });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.code, "CONFLICT");
  assert.equal(result.details.field, "sku");
});

test("a duplicate SKU 409 is preserved on PATCH", async () => {
  mockFetch(() => skuConflict());

  const result = await apiAdminUpdateProduct("PF-SAR-0002", { sku: "PF-SAR-0001" });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.code, "CONFLICT");
  assert.equal(result.details.field, "sku");
});

test("suggestedSlug survives ApiError normalisation intact", async () => {
  mockFetch(() => slugConflict());

  const result = await apiAdminUpdateProduct("PF-SAR-0002", { slug: "banarasi-silk" });

  assert.equal(result.status, 409);
  assert.equal(result.details.field, "slug");
  assert.equal(result.details.value, "banarasi-silk");
  assert.equal(
    result.details.suggestedSlug,
    "banarasi-silk-2",
    "the retry value must not be dropped by the error layer"
  );
  // The raw envelope is kept too, so nothing downstream has to re-parse text.
  assert.equal(result.data.error.details.suggestedSlug, "banarasi-silk-2");
});

test("persistAdminProduct returns the 409 instead of throwing or claiming success", async () => {
  const calls = mockFetch(() => skuConflict());

  const result = await persistAdminProduct(
    { id: "PF-SAR-0002", name: "Saree", sku: "PF-SAR-0001", category: CATEGORY_ID },
    { isNew: true }
  );

  assert.equal(result.ok, false, "a rejected save must never report ok");
  assert.equal(result.status, 409);
  assert.equal(result.code, "CONFLICT");
  assert.equal(calls.length, 1, "no retry storm on a deterministic rejection");
});

/* ------------------------------------------------------------------ */
/* 409 vs 422 stay distinguishable (Block 3 vs Block 2)                */
/* ------------------------------------------------------------------ */

test("a duplicate 409 and a taxonomy 422 normalise to different codes and shapes", async () => {
  mockFetch(() => skuConflict());
  const conflict = await apiAdminCreateDraft({ id: "A", sku: "PF-SAR-0001" });

  mockFetch(() => taxonomyRejection());
  const validation = await apiAdminCreateDraft({ id: "B", category: "ghost" });

  assert.equal(conflict.status, 409);
  assert.equal(conflict.code, "CONFLICT");
  assert.ok(!Array.isArray(conflict.details), "a conflict detail is an object, not a field list");

  assert.equal(validation.status, 422);
  assert.equal(validation.code, "VALIDATION_ERROR");
  assert.ok(Array.isArray(validation.details), "taxonomy errors stay list-shaped (Block 2)");
  assert.match(validation.error, /category/, "the taxonomy message is unchanged");
});

/* ------------------------------------------------------------------ */
/* Operator-facing copy                                                */
/* ------------------------------------------------------------------ */

test("formatAdminError surfaces a duplicate SKU as a conflict, not a generic failure", async () => {
  mockFetch(() => skuConflict());
  const result = await apiAdminCreateDraft({ id: "A", sku: "PF-SAR-0001" });

  const message = formatAdminError(result, { entity: "product", action: "saved" });
  assert.match(message, /Conflict/i);
  assert.match(message, /PF-SAR-0001/, "the offending value is named");
  assert.match(message, /Nothing was overwritten/i);
  assert.doesNotMatch(message, /Could not reach the server/i);
  assert.doesNotMatch(message, /Server error/i);
});

test("formatAdminError offers the server's suggested slug for a slug conflict", async () => {
  mockFetch(() => slugConflict());
  const result = await apiAdminUpdateProduct("PF-SAR-0002", { slug: "banarasi-silk" });

  const message = formatAdminError(result, { entity: "product", action: "saved" });
  assert.match(message, /Conflict/i);
  assert.match(message, /banarasi-silk-2/, "the retry-ready slug is shown to the operator");
});

test("formatAdminError still renders a taxonomy 422 with its field reasons", async () => {
  mockFetch(() => taxonomyRejection());
  const result = await apiAdminCreateDraft({ id: "B", category: "ghost" });

  const message = formatAdminError(result, { entity: "product", action: "saved" });
  assert.match(message, /rejected this change/i);
  assert.match(message, /Unknown category/);
  assert.doesNotMatch(message, /Conflict:/i, "422 must not be reported as a conflict");
});

/* ------------------------------------------------------------------ */
/* Payload: no fabricated slug, taxonomy ids unchanged                 */
/* ------------------------------------------------------------------ */

test("buildAdminProductPayload omits the slug entirely when none was typed", () => {
  const payload = buildAdminProductPayload({
    name: "Saree",
    category: CATEGORY_ID,
    subcategory: SUBCATEGORY_ID,
  });

  assert.equal(payload.slug, undefined, "an absent slug is left to the server to allocate");
  assert.equal(JSON.parse(JSON.stringify(payload)).slug, undefined, "and never reaches the wire");
});

test("buildAdminProductPayload sends a typed slug verbatim", () => {
  const payload = buildAdminProductPayload({
    name: "Saree",
    slug: "My-Chosen-Slug",
    sku: "SKU-1",
    category: CATEGORY_ID,
  });

  assert.equal(payload.slug, "My-Chosen-Slug", "no client-side rewriting of the operator's slug");
  assert.equal(payload.sku, "SKU-1");
});

test("the create path still sends the Block 2 taxonomy ids and the Block 1 server id", async () => {
  let seen = null;
  mockFetch((url, options) => {
    if (url.includes("/admin/products/draft")) {
      seen = JSON.parse(options.body);
      return {
        ok: true,
        product: {
          id: "PF-SAR-0001",
          name: "Saree",
          slug: "saree",
          sku: "PF-11111",
          category: CATEGORY_ID,
          subcategory: SUBCATEGORY_ID,
          status: "DRAFT",
          published: false,
        },
      };
    }
    return {};
  });

  const result = await persistAdminProduct(
    { id: "PF-SAR-0001", name: "Saree", category: CATEGORY_ID, subcategory: SUBCATEGORY_ID },
    { isNew: true }
  );

  assert.ok(result.ok, result.error);
  assert.equal(seen.id, "PF-SAR-0001");
  assert.equal(seen.category, CATEGORY_ID, "taxonomy ids unchanged by Block 3");
  assert.equal(seen.subcategory, SUBCATEGORY_ID);
  assert.ok(!("slug" in seen), "Save & Continue no longer fabricates a slug client-side");
});
