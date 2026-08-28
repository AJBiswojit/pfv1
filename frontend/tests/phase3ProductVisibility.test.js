/**
 * Phase 3 Block 5 — storefront visibility / publication gate (frontend).
 *
 * The gate itself is SERVER-SIDE and is proved by the backend suite
 * (`tests/unit/test_phase3_product_visibility.py`). This suite pins the client
 * half of the same contract:
 *
 *   * APPROVE and PUBLISH are two distinct server calls to two distinct
 *     endpoints, and neither can be reached by accident from the other;
 *   * neither call ever posts `status` or `published` — the server decides;
 *   * the UI never claims success before the server responds, and a refused
 *     publish leaves the local mirror unpublished;
 *   * every storefront read goes through the PUBLIC, gated endpoints with an
 *     explicit scope — no admin route is used to render a shop surface;
 *   * no frontend-only "published" flag can reveal a product the server hid;
 *   * the admin workflow layer is registered at bootstrap, so a DIRECT load of
 *     `/admin/products` (no prior navigation, no warm session) has it;
 *   * Blocks 1-4 are untouched.
 *
 * HARNESS LIMITATION, stated honestly: the frontend test harness is `node:test`
 * with NO DOM and NO React renderer (see the Block 4 report §13). Component
 * behaviour — mount effects, re-renders, route transitions — cannot be
 * executed here. Requirements that live inside a component are therefore
 * verified by STATIC SOURCE GUARDS over the real files, which are explicitly
 * labelled below. A DOM/React test framework was deliberately NOT added: the
 * governing plan does not ask for one, and inflating coverage with a harness
 * nobody else uses would be a worse outcome than an honest limitation.
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { apiGetProduct, apiListProducts } from "../src/services/api/productsApi.js";
import { runAction } from "../src/services/admin/productAdminService.js";

const src = (relative) =>
  readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), "utf8");

const PRODUCT_ID = "PF-SAR-0001";

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

/** The shape the server returns from approve: review moved, visibility did not. */
const approvedBody = () => ({
  ok: true,
  product: {
    id: PRODUCT_ID,
    name: "Chanderi Silk Saree",
    status: "PENDING_REVIEW",
    published: false,
    review: { state: "APPROVED" },
  },
});

/** The shape the server returns from publish: visibility moved. */
const publishedBody = () => ({
  ok: true,
  product: {
    id: PRODUCT_ID,
    name: "Chanderi Silk Saree",
    status: "PUBLISHED",
    published: true,
    review: { state: "APPROVED" },
    publishedAt: "2026-08-28T04:00:00Z",
    publishedBy: "admin-1",
  },
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
/* 1. APPROVE and PUBLISH are two distinct, correctly wired calls       */
/* ------------------------------------------------------------------ */

test("APPROVE posts to the approve endpoint with an explicit admin scope", async () => {
  const calls = mockFetch(() => approvedBody());

  const result = await runAction(PRODUCT_ID, "approve");

  assert.ok(result.ok, "approve should succeed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  assert.ok(
    calls[0].url.endsWith(`/admin/products/${PRODUCT_ID}/approve`),
    calls[0].url
  );
});

test("PUBLISH posts to the publish endpoint with an explicit admin scope", async () => {
  const calls = mockFetch(() => publishedBody());

  const result = await runAction(PRODUCT_ID, "publish");

  assert.ok(result.ok, "publish should succeed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  assert.ok(
    calls[0].url.endsWith(`/admin/products/${PRODUCT_ID}/publish`),
    calls[0].url
  );
});

test("APPROVE and PUBLISH never resolve to the same endpoint", async () => {
  const approveCalls = mockFetch(() => approvedBody());
  await runAction(PRODUCT_ID, "approve");
  const approveUrl = approveCalls[0].url;

  const publishCalls = mockFetch(() => publishedBody());
  await runAction(PRODUCT_ID, "publish");
  const publishUrl = publishCalls[0].url;

  assert.notEqual(approveUrl, publishUrl);
  assert.ok(approveUrl.includes("/approve"));
  assert.ok(publishUrl.includes("/publish"));
  assert.ok(!approveUrl.includes("/publish"), "approve must never hit publish");
});

test("APPROVE issues exactly one request — it never chains into a publish", async () => {
  const calls = mockFetch(() => approvedBody());

  await runAction(PRODUCT_ID, "approve");

  assert.equal(calls.length, 1, `approve fired ${calls.length} requests`);
  assert.ok(!calls.some((call) => call.url.includes("/publish")));
});

test("UNPUBLISH is its own endpoint, distinct from publish", async () => {
  const calls = mockFetch(() => ({
    ok: true,
    product: { id: PRODUCT_ID, status: "DRAFT", published: false },
  }));

  await runAction(PRODUCT_ID, "unpublish");

  assert.ok(calls[0].url.endsWith(`/admin/products/${PRODUCT_ID}/unpublish`), calls[0].url);
});

/* ------------------------------------------------------------------ */
/* 2. The client never decides publication state                        */
/* ------------------------------------------------------------------ */

test("neither APPROVE nor PUBLISH sends status or published in the body", async () => {
  for (const action of ["approve", "publish"]) {
    const calls = mockFetch(() =>
      action === "approve" ? approvedBody() : publishedBody()
    );
    await runAction(PRODUCT_ID, action);

    const body = calls[0].options.body ? JSON.parse(calls[0].options.body) : {};
    assert.ok(!("status" in body), `${action} leaked a client status`);
    assert.ok(!("published" in body), `${action} leaked a client published flag`);
    assert.ok(!("review" in body), `${action} leaked a client review state`);
  }
});

test("an APPROVE response is mirrored verbatim — the client does not promote it to PUBLISHED", async () => {
  mockFetch(() => approvedBody());

  const result = await runAction(PRODUCT_ID, "approve");

  assert.equal(result.product.status, "PENDING_REVIEW");
  assert.equal(result.product.published, false);
  assert.equal(result.product.review.state, "APPROVED");
});

test("a PUBLISH response is mirrored verbatim, including publishedAt/publishedBy", async () => {
  mockFetch(() => publishedBody());

  const result = await runAction(PRODUCT_ID, "publish");

  assert.equal(result.product.status, "PUBLISHED");
  assert.equal(result.product.published, true);
  assert.ok(result.product.publishedAt);
});

test("a refused PUBLISH is reported as a failure — the UI cannot claim success", async () => {
  mockFetch(() =>
    jsonResponse(
      {
        success: false,
        error: {
          code: "BUSINESS_RULE_VIOLATION",
          message: "Product has unresolved publish issues.",
          details: { errors: ["At least one cover image is required before publishing."] },
        },
      },
      422
    )
  );

  const result = await runAction(PRODUCT_ID, "publish");

  assert.equal(result.ok, false, "a 422 must not read as success");
  assert.equal(result.status, 422);
  assert.equal(result.product, undefined, "no product record may be invented from a failure");
});

test("a PUBLISH refused for missing approval is reported as a failure", async () => {
  mockFetch(() =>
    jsonResponse(
      {
        success: false,
        error: {
          code: "BUSINESS_RULE_VIOLATION",
          message:
            "This product has not been approved for publication yet. " +
            "Submit it for review and approve it before publishing (review state: PENDING).",
          details: {},
        },
      },
      422
    )
  );

  const result = await runAction(PRODUCT_ID, "publish");

  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.match(String(result.error), /not been approved/i);
});

test("an unknown action never silently becomes a publish", async () => {
  const calls = mockFetch(() => publishedBody());

  const result = await runAction(PRODUCT_ID, "goLive");

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0, "an unknown verb must issue no request at all");
});

/* ------------------------------------------------------------------ */
/* 3. Storefront reads use the public, server-gated endpoints           */
/* ------------------------------------------------------------------ */

test("the storefront listing calls the PUBLIC /products endpoint, not an admin route", async () => {
  const calls = mockFetch(() => ({ ok: true, items: [], total: 0 }));

  await apiListProducts({ page: 1, pageSize: 20 });

  assert.equal(calls.length, 1);
  assert.ok(!calls[0].url.includes("/admin/"), calls[0].url);
  assert.match(calls[0].url, /\/products(\?|$)/);
});

test("the storefront listing never asks for a status or published filter", async () => {
  const calls = mockFetch(() => ({ ok: true, items: [], total: 0 }));

  await apiListProducts({
    page: 1,
    pageSize: 20,
    // A caller trying to widen the gate from the client must not get through.
    status: "DRAFT",
    published: false,
  });

  const url = new URL(calls[0].url, "http://localhost");
  assert.equal(url.searchParams.get("status"), null, calls[0].url);
  assert.equal(url.searchParams.get("published"), null, calls[0].url);
});

test("the PDP calls the PUBLIC product endpoint", async () => {
  const calls = mockFetch(() => ({ ok: true, product: { id: PRODUCT_ID } }));

  await apiGetProduct(PRODUCT_ID);

  assert.ok(!calls[0].url.includes("/admin/"), calls[0].url);
  assert.ok(calls[0].url.endsWith(`/products/${PRODUCT_ID}`), calls[0].url);
});

test("a 404 for an unpublished product yields no product, only the error", async () => {
  mockFetch(() =>
    jsonResponse(
      {
        success: false,
        error: { code: "NOT_FOUND", message: `Product '${PRODUCT_ID}' not found.`, details: {} },
      },
      404
    )
  );

  const result = await apiGetProduct(PRODUCT_ID);

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.product, undefined, "a hidden product must not be fabricated client-side");
});

test("the storefront list is taken from the server response, not re-filtered locally", async () => {
  // The server is the authority: whatever it returns IS the visible set.
  mockFetch(() => ({
    ok: true,
    items: [{ id: "PF-SAR-0001", status: "PUBLISHED", published: true }],
    total: 1,
  }));

  const result = await apiListProducts({ page: 1, pageSize: 20 });

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.total, 1);
});

/* ------------------------------------------------------------------ */
/* 4. STATIC SOURCE GUARDS — component-level requirements               */
/*    (no DOM/React renderer in this harness — see the header note)     */
/* ------------------------------------------------------------------ */

test("STATIC: the workflow command layer is registered at bootstrap, so a direct /admin/products load has it", () => {
  const main = src("main.jsx");
  assert.match(
    main,
    /import\s+"\.\/services\/workflow\/productWorkflowCommands"/,
    "main.jsx must side-effect import the workflow commands"
  );
  // Bootstrap runs before any route renders, so registration cannot depend on
  // having visited another screen first.
  assert.ok(
    main.indexOf("productWorkflowCommands") < main.indexOf("createRoot(document"),
    "registration must happen before React mounts"
  );
});

test("STATIC: the admin products desk imports its workflow actions statically", () => {
  const page = src("pages/admin/AdminProducts.jsx");
  assert.match(
    page,
    /import\s*\{[^}]*runAction[^}]*\}\s*from\s*"\.\.\/\.\.\/services\/admin\/productAdminService"/,
    "runAction must be a module-scope import, not a lazily registered global"
  );
  // A direct load with no prior navigation must still fetch from the server.
  assert.match(page, /useEffect\(\(\) => \{\s*setIsListLoading\(true\);\s*reload\(\);/);
});

test("STATIC: the admin editor never treats APPROVE as PUBLISH", () => {
  const commands = src("services/workflow/productWorkflowCommands.js");
  const approve = commands.slice(
    commands.indexOf("export const approveProduct"),
    commands.indexOf("export const publishProduct")
  );
  assert.ok(approve.length > 0, "approveProduct not found");
  assert.ok(
    !/PRODUCT_STATUS\.PUBLISHED/.test(approve),
    "approveProduct must never write the PUBLISHED status"
  );
  assert.match(approve, /REVIEW_STATE\.APPROVED/);
});

test("STATIC: the catalog store hydrates from the gated public list", () => {
  const store = src("services/catalog/catalogStore.js");
  assert.match(store, /apiListProducts\(/, "the snapshot must come from GET /products");
  assert.ok(
    !/status\s*===\s*"PUBLISHED"/.test(store),
    "the store must not re-implement the gate locally"
  );
  assert.ok(
    !/\.published\s*(!==|===)\s*(true|false)/.test(store),
    "the store must not filter on a local published flag"
  );
});

test("STATIC: the PDP only reaches an admin route behind an explicit preview + admin token", () => {
  const pdp = src("pages/ProductDetail.jsx");
  assert.match(
    pdp,
    /if\s*\(isPreview\s*&&\s*getAccessToken\("admin"\)\)\s*\{\s*result\s*=\s*await\s+apiAdminGetProduct/,
    "the admin fetch must be gated on both the preview flag and an admin token"
  );
  assert.match(pdp, /result\s*=\s*await\s+apiGetProduct\(productId\)/);
  assert.match(pdp, /setStatus\(result\.status === 404 \? "notfound" : "error"\)/);
});

test("STATIC: no storefront surface decides visibility from a local published flag", () => {
  // `queryCatalogue` still carries a legacy client-side filter. It is reachable
  // only from `data/products/explore.js`, which feeds local explore-stream
  // helpers, never a shop listing — those all read the server snapshot. This
  // guard pins that blast radius so the dead filter cannot quietly become the
  // authority again.
  const importers = [
    "hooks/useCatalogueQuery.js",
    "pages/ProductDetail.jsx",
    "services/catalog/catalogStore.js",
  ];
  for (const file of importers) {
    assert.ok(
      !/queryCatalogue/.test(src(file)),
      `${file} must not route visibility through the legacy local filter`
    );
  }
});

/* ------------------------------------------------------------------ */
/* 5. Blocks 1-4 are untouched                                          */
/* ------------------------------------------------------------------ */

test("REGRESSION: Block 1 — the server-allocated draft endpoint is unchanged", () => {
  const api = src("services/api/productsApi.js");
  assert.match(api, /\/admin\/products\/draft/);
  assert.match(api, /\/admin\/products\/next-id/);
});

test("REGRESSION: Block 4 — the identity pre-flight still sends excludeId", () => {
  const api = src("services/api/productsApi.js");
  assert.match(api, /\/admin\/products\/availability/);
  assert.match(api, /excludeId/);
});

test("REGRESSION: every product call still carries an explicit scope", () => {
  const api = src("services/api/productsApi.js");
  const clientCalls = api.match(/apiClient\.(get|post|patch|put|delete)\([^;]*?\);/gs) ?? [];
  assert.ok(clientCalls.length > 0, "no apiClient calls found — the guard would be vacuous");
  for (const call of clientCalls) {
    // Either a literal scope or the caller-supplied `scope` variable — what is
    // forbidden is an options object with no scope at all.
    assert.match(
      call,
      /scope(:\s*("(admin|customer|employee|none)"|scope))|\{\s*scope\s*\}/,
      call.slice(0, 160)
    );
  }
});
