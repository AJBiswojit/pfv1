/**
 * Phase 3 Block 4 — product identity availability / pre-flight (frontend).
 *
 * Closes the client half of PF3-N16. Until now `GET /admin/products/availability`
 * had zero call sites and `ProductEditor` decided SKU/slug uniqueness from
 * `catalogRepository` — a session cache that only holds records this session
 * fetched. This suite pins the replacement:
 *
 *   * the editor's identity verdict comes from the server;
 *   * an EXISTING product sends `excludeId` so its own SKU/slug reads free;
 *   * a NEW product sends no `excludeId` at all;
 *   * a failed probe yields no verdict — it must never block a save, because
 *     Block 3's 409 on the write is the real gate;
 *   * Block 1 (server id), Block 2 (taxonomy ids) and Block 3 (409 handling)
 *     are untouched.
 *
 * Same harness as the other suites: real service/API modules, mocked `fetch`,
 * no browser and no React DOM.
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { apiAdminCheckAvailability } from "../src/services/api/productsApi.js";
import { checkAvailability, persistAdminProduct } from "../src/services/admin/productAdminService.js";
import {
  buildAvailabilityQuery,
  identityErrors,
  toVerdict,
  verdictMatchesQuery,
} from "../src/services/admin/productIdentityPreflight.js";

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

const availabilityBody = (over = {}) => ({
  ok: true,
  skuTaken: false,
  slugTaken: false,
  suggestedSlug: null,
  ...over,
});

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
/* The request: endpoint, scope, excludeId                             */
/* ------------------------------------------------------------------ */

test("checkAvailability calls the admin availability endpoint with an explicit scope", async () => {
  const calls = mockFetch(() => availabilityBody());

  const result = await checkAvailability({ sku: "SKU-1", slug: "slug-1" });

  assert.ok(result.ok);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("/admin/products/availability"), calls[0].url);
  assert.ok(calls[0].url.includes("sku=SKU-1"), calls[0].url);
  assert.ok(calls[0].url.includes("slug=slug-1"), calls[0].url);
  assert.equal(calls[0].options.method, "GET");
});

test("an existing product sends its own id as excludeId", async () => {
  const calls = mockFetch(() => availabilityBody());

  await checkAvailability({ sku: "OWN-SKU", slug: "own-slug", excludeId: "PF-SAR-0001" });

  const url = new URL(calls[0].url, "http://localhost");
  assert.equal(url.searchParams.get("excludeId"), "PF-SAR-0001");
});

test("a new product never sends a fabricated excludeId", async () => {
  const calls = mockFetch(() => availabilityBody());

  await checkAvailability({ sku: "NEW-SKU", slug: "new-slug" });

  const url = new URL(calls[0].url, "http://localhost");
  assert.equal(url.searchParams.get("excludeId"), null, "the parameter must be absent");
  assert.ok(!calls[0].url.includes("excludeId"), calls[0].url);
});

test("an empty excludeId is dropped rather than sent blank", async () => {
  const calls = mockFetch(() => availabilityBody());

  await apiAdminCheckAvailability({ sku: "S", excludeId: "" });

  assert.ok(!calls[0].url.includes("excludeId"), calls[0].url);
});

/* ------------------------------------------------------------------ */
/* buildAvailabilityQuery — what the editor asks                        */
/* ------------------------------------------------------------------ */

test("buildAvailabilityQuery omits excludeId for a product that does not exist yet", () => {
  const query = buildAvailabilityQuery({ id: "PF-SAR-0001", exists: false, sku: "S", slug: "s" });
  assert.deepEqual(query, { sku: "S", slug: "s" });
  assert.ok(!("excludeId" in query));
});

test("buildAvailabilityQuery sends excludeId for a saved product", () => {
  const query = buildAvailabilityQuery({ id: "PF-SAR-0001", exists: true, sku: "S", slug: "s" });
  assert.deepEqual(query, { sku: "S", slug: "s", excludeId: "PF-SAR-0001" });
});

test("buildAvailabilityQuery trims values and skips empty ones", () => {
  assert.deepEqual(buildAvailabilityQuery({ sku: "  S  ", slug: "" }), { sku: "S" });
  assert.deepEqual(buildAvailabilityQuery({ sku: "", slug: " s " }), { slug: "s" });
});

test("buildAvailabilityQuery returns null when there is nothing to ask", () => {
  assert.equal(buildAvailabilityQuery({ sku: "", slug: "" }), null);
  assert.equal(buildAvailabilityQuery({}), null);
  assert.equal(buildAvailabilityQuery({ sku: "   ", slug: "  " }), null);
});

/* ------------------------------------------------------------------ */
/* Verdict → field errors                                              */
/* ------------------------------------------------------------------ */

test("a product's own SKU is not marked taken", async () => {
  // The server, given excludeId, reports the product's own SKU as free.
  mockFetch(() => availabilityBody({ skuTaken: false }));
  const query = buildAvailabilityQuery({ id: "PF-SAR-0001", exists: true, sku: "OWN-SKU" });
  const verdict = toVerdict(await checkAvailability(query), query);

  assert.deepEqual(identityErrors(verdict, query), {}, "no error on your own SKU");
});

test("a product's own slug is not marked taken", async () => {
  mockFetch(() => availabilityBody({ slugTaken: false }));
  const query = buildAvailabilityQuery({ id: "PF-SAR-0001", exists: true, slug: "own-slug" });
  const verdict = toVerdict(await checkAvailability(query), query);

  assert.deepEqual(identityErrors(verdict, query), {});
});

test("another product's SKU is detected and named", async () => {
  mockFetch(() => availabilityBody({ skuTaken: true }));
  const query = buildAvailabilityQuery({ id: "PF-SAR-0002", exists: true, sku: "THEIRS" });
  const verdict = toVerdict(await checkAvailability(query), query);

  const errors = identityErrors(verdict, query);
  assert.match(errors.sku, /already used by another product/i);
  assert.match(errors.sku, /THEIRS/);
  assert.equal(errors.slug, undefined);
});

test("another product's slug is detected and the server's suggestion is offered", async () => {
  mockFetch(() => availabilityBody({ slugTaken: true, suggestedSlug: "theirs-1" }));
  const query = buildAvailabilityQuery({ id: "PF-SAR-0002", exists: true, slug: "theirs" });
  const verdict = toVerdict(await checkAvailability(query), query);

  const errors = identityErrors(verdict, query);
  assert.match(errors.slug, /already in use/i);
  assert.match(errors.slug, /theirs-1/, "the retry value reaches the operator");
  assert.equal(errors.sku, undefined);
});

test("a slug conflict with no suggestion still reports the collision", () => {
  const query = { slug: "x" };
  const verdict = toVerdict(availabilityBody({ ok: true, slugTaken: true }), query);
  assert.match(identityErrors(verdict, query).slug, /already in use/i);
});

/* ------------------------------------------------------------------ */
/* Honest failure modes                                                */
/* ------------------------------------------------------------------ */

test("a failed probe produces no verdict and therefore blocks nothing", async () => {
  mockFetch(() => jsonResponse({ success: false, error: { code: "FORBIDDEN", message: "nope" } }, 403));

  const query = buildAvailabilityQuery({ sku: "SKU-X" });
  const result = await checkAvailability(query);

  assert.equal(result.ok, false);
  assert.equal(toVerdict(result, query), null, "unknown is neither free nor taken");
  assert.deepEqual(identityErrors(null, query), {}, "a save must not be blocked by a dead probe");
});

test("a failed probe preserves the ApiError contract", async () => {
  mockFetch(() =>
    jsonResponse({ success: false, error: { code: "FORBIDDEN", message: "Permission denied." } }, 403)
  );

  const result = await checkAvailability({ sku: "SKU-X" });

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.code, "FORBIDDEN");
  assert.equal(result.isNetworkError, false);
  assert.equal(result.error, "Permission denied.");
  assert.ok("details" in result && "data" in result, "the canonical handleError shape");
});

test("a stale answer cannot condemn a value the operator already changed", () => {
  const oldQuery = { sku: "TYPO" };
  const verdict = toVerdict(availabilityBody({ skuTaken: true }), oldQuery);
  const newQuery = { sku: "CORRECTED" };

  assert.ok(verdictMatchesQuery(verdict, oldQuery));
  assert.ok(!verdictMatchesQuery(verdict, newQuery));
  assert.deepEqual(identityErrors(verdict, newQuery), {}, "verdicts are pinned to their query");
});

test("a verdict for a different excludeId is not reused", () => {
  const query = { sku: "S", excludeId: "PF-A" };
  const verdict = toVerdict(availabilityBody({ skuTaken: true }), query);
  assert.deepEqual(identityErrors(verdict, { sku: "S", excludeId: "PF-B" }), {});
  assert.deepEqual(identityErrors(verdict, { sku: "S" }), {});
});

/* ------------------------------------------------------------------ */
/* The editor no longer asks the session cache (static guard)          */
/* ------------------------------------------------------------------ */

test("ProductEditor derives product SKU/slug errors from the server, not catalogRepository", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/components/products/ProductEditor.jsx", import.meta.url)),
    "utf8"
  );

  assert.ok(
    source.includes("checkAvailability"),
    "the editor must call the server availability probe"
  );
  assert.ok(!source.includes("catalogRepository.slugTaken"), "no local slug authority remains");
  assert.ok(
    !source.includes("catalogRepository.skuTaken(draft.sku"),
    "the product's own SKU is no longer decided by the session cache"
  );
  // Variant SKUs are deliberately still local: the backend has no variant
  // identity contract, so this is the only check that exists.
  assert.ok(
    source.includes("catalogRepository.skuTaken(variant.sku"),
    "the variant-SKU check must be retained"
  );
});

/* ------------------------------------------------------------------ */
/* Blocks 1-3 unchanged                                                */
/* ------------------------------------------------------------------ */

test("Block 3: a duplicate SKU 409 on save is still preserved end to end", async () => {
  mockFetch(() =>
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
    )
  );

  const result = await persistAdminProduct(
    { id: "PF-SAR-0002", name: "Saree", sku: "PF-SAR-0001", category: CATEGORY_ID },
    { isNew: true }
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.code, "CONFLICT");
  assert.equal(result.details.field, "sku");
});

test("Block 1 + Block 2: the create payload still carries the server id and taxonomy ids", async () => {
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
  assert.equal(seen.category, CATEGORY_ID);
  assert.equal(seen.subcategory, SUBCATEGORY_ID);
  assert.ok(!("slug" in seen), "Block 3: no client-fabricated slug");
});

test("the availability probe is a read and never mutates the catalogue cache", async () => {
  const calls = mockFetch(() => availabilityBody({ skuTaken: true }));

  await checkAvailability({ sku: "ANY", slug: "any", excludeId: "PF-X" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.body, undefined, "a probe carries no body");
});
