/**
 * Phase 3 — product create + Save & Continue contract (frontend).
 *
 * The Save & Continue defect had two client halves, both pinned here:
 *
 *   PF3-N02  the editor allocated a canonical Product ID locally over the
 *            static taxonomy snapshot and, when that failed (any admin-created
 *            category/subcategory), aborted WITHOUT issuing a single HTTP
 *            request. The editor now asks the server for the id and must
 *            actually POST /admin/products/draft.
 *
 *   API-223  the category/subcategory written to the backend were gated by the
 *            static `data/catalog/*` / `data/products/*` maps. The write path
 *            now reads the ADMIN taxonomy surface (any status) and emits ids.
 *
 * Everything here exercises the real service/API modules through a mocked
 * `fetch` — the same harness as the other suites, no browser, no React DOM.
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  apiAdminCreateDraft,
  apiAdminGetNextId,
  buildAdminProductPayload,
} from "../src/services/api/productsApi.js";
import { persistAdminProduct } from "../src/services/admin/productAdminService.js";
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

const SERVER_PRODUCT = {
  id: "PF-SAR-0001",
  name: "Server Created Saree",
  slug: "server-created-saree",
  sku: "SKU-PF-SAR-0001",
  category: "6f1c2b3a-0000-4000-8000-0000000000c1",
  subcategory: "7a9d0001-0000-4000-8000-0000000000c2",
  price: 7500,
  status: "DRAFT",
  published: false,
  description: "Created through the admin API.",
};

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
/* Payload: ids on the wire, lifecycle keys never sent                 */
/* ------------------------------------------------------------------ */

test("buildAdminProductPayload carries category/subcategory ids and never lifecycle keys", () => {
  const payload = buildAdminProductPayload({
    id: "PF-SAR-0001",
    name: "Saree",
    category: "6f1c2b3a-0000-4000-8000-0000000000c1",
    subcategory: "7a9d0001-0000-4000-8000-0000000000c2",
    status: "PUBLISHED",
    review: { state: "APPROVED" },
    published: true,
    history: [],
    priceHistory: [],
  });

  assert.equal(payload.category, "6f1c2b3a-0000-4000-8000-0000000000c1");
  assert.equal(payload.subcategory, "7a9d0001-0000-4000-8000-0000000000c2");
  for (const key of ["status", "review", "published", "history", "priceHistory"]) {
    assert.ok(!(key in payload), `payload must never carry lifecycle key "${key}"`);
  }
  assert.ok(!("id" in payload), "the id is attached separately by the create path");
});

/* ------------------------------------------------------------------ */
/* Server-authoritative id (PF3-N02)                                   */
/* ------------------------------------------------------------------ */

test("apiAdminGetNextId asks the server and surfaces nextId", async () => {
  const calls = mockFetch((url) => {
    assert.ok(url.includes("/admin/products/next-id"), url);
    assert.ok(url.includes("category=6f1c2b3a"), url);
    return { nextId: "PF-GEN-0001" };
  });

  const result = await apiAdminGetNextId("6f1c2b3a-0000-4000-8000-0000000000c1");
  assert.ok(result.ok);
  assert.equal(result.nextId, "PF-GEN-0001");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, undefined, "no token in this harness");
});

/* ------------------------------------------------------------------ */
/* The draft POST actually happens (PF3-N02 regression)                */
/* ------------------------------------------------------------------ */

test("persistAdminProduct for a new record POSTs /admin/products/draft with the server id", async () => {
  const calls = mockFetch((url, options) => {
    if (url.includes("/admin/products/draft")) {
      const body = JSON.parse(options.body);
      assert.equal(body.id, "PF-SAR-0001");
      assert.equal(body.category, "6f1c2b3a-0000-4000-8000-0000000000c1");
      assert.equal(body.subcategory, "7a9d0001-0000-4000-8000-0000000000c2");
      return { ok: true, product: SERVER_PRODUCT };
    }
    return {};
  });

  const result = await persistAdminProduct(
    { ...SERVER_PRODUCT },
    { isNew: true }
  );

  assert.ok(result.ok, result.error);
  assert.equal(result.product.id, "PF-SAR-0001");

  const draftCalls = calls.filter((call) => call.url.includes("/admin/products/draft"));
  assert.equal(draftCalls.length, 1, "the draft endpoint must be POSTed exactly once");
  assert.equal(draftCalls[0].options.method, "POST");
});

test("apiAdminCreateDraft returns the server id and does not fabricate one", async () => {
  const calls = mockFetch({ ok: true, product: SERVER_PRODUCT });
  const result = await apiAdminCreateDraft({
    id: "PF-SAR-0001",
    name: "Saree",
    category: "6f1c2b3a-0000-4000-8000-0000000000c1",
    subcategory: "7a9d0001-0000-4000-8000-0000000000c2",
  });
  assert.ok(result.ok);
  assert.equal(result.product.id, "PF-SAR-0001");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("/admin/products/draft"));
});

/* ------------------------------------------------------------------ */
/* Admin taxonomy surface (any status) feeds the editor                */
/* ------------------------------------------------------------------ */

test("loadCategoryOptions returns any-status categories from the admin endpoint", async () => {
  const calls = mockFetch({
    items: [
      { id: "active-cat", name: "Sarees", slug: "sarees", status: "ACTIVE" },
      { id: "draft-cat", name: "New Season", slug: "new-season", status: "DRAFT" },
      { id: "archived-cat", name: "Legacy", slug: "legacy", status: "ARCHIVED" },
    ],
  });

  const result = await taxonomyRepository.loadCategoryOptions();
  assert.ok(result.ok, result.error);
  const ids = result.items.map((entry) => entry.id);
  assert.deepEqual(ids, ["active-cat", "draft-cat", "archived-cat"]);

  // The editor must read the admin surface, never the ACTIVE-only storefront.
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("/admin/categories"), calls[0].url);
  assert.ok(!calls[0].url.includes("status=ACTIVE"), calls[0].url);
});
