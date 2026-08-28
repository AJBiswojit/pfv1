/**
 * Phase 3 Block 6 — LIFECYCLE HARDENING (frontend half).
 *
 * Governing plan: PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_PLAN.md
 *   §9.2        — the endpoint table, including the frontend wrapper column
 *   §21         — this file: `tests/phase3ProductLifecycleUI.test.js`
 *   §24 step 8  — lifecycle hardening
 *   §25 (14-16) — approve never publishes; illegal transitions are 422s
 *
 * The lifecycle itself is SERVER-AUTHORITATIVE and is proved by the backend
 * suite (`tests/unit/test_phase3_product_lifecycle.py`, 52 tests / 363
 * subtests). This suite pins the client half of the same contract:
 *
 *   * each of the seven lifecycle verbs maps to its OWN endpoint, and no verb
 *     can reach another's route;
 *   * no lifecycle call ever posts `status`, `published` or `review` — the
 *     client never proposes a state, it only names an action;
 *   * the client mirrors the server's returned state verbatim and never
 *     invents one, including for the transitions the server refuses;
 *   * a 422 / 409 / 404 is surfaced as a failure — never rendered as success,
 *     and never allowed to advance the local mirror;
 *   * an unknown lifecycle verb issues NO request at all;
 *   * there is no bulk lifecycle call;
 *   * Blocks 1-5 are untouched.
 *
 * HARNESS LIMITATION, stated honestly and not worked around: the frontend
 * harness is `node:test` with NO DOM and NO React renderer. Button clicks,
 * mount effects, disabled states and re-renders CANNOT be executed here. Any
 * requirement that lives inside a rendered component is covered by a STATIC
 * SOURCE GUARD over the real file and is labelled `STATIC:` below. Those
 * guards are NOT equivalent to browser verification and are reported as
 * NOT VERIFIABLE in the Block 6 report §33. A DOM/React framework was
 * deliberately not added: the plan does not ask for one.
 */

import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runAction } from "../src/services/admin/productAdminService.js";

const src = (relative) =>
  readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), "utf8");

const PRODUCT_ID = "PF-SAR-0042";

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

/** A server product record in a given lifecycle state. */
const record = (overrides = {}) => ({
  ok: true,
  product: {
    id: PRODUCT_ID,
    name: "Kanjivaram Silk Saree",
    status: "DRAFT",
    published: false,
    review: { state: "NONE" },
    ...overrides,
  },
});

/** The canonical 422 the backend returns for an illegal transition. */
const businessRuleViolation = (message) =>
  jsonResponse(
    {
      success: false,
      error: { code: "BUSINESS_RULE_VIOLATION", message, details: {} },
    },
    422,
  );

/**
 * The seven lifecycle verbs, their expected endpoint suffix, and the state the
 * server reports back. Mirrors backend `ACTION_ROUTES` in
 * `tests/unit/test_phase3_product_lifecycle.py`.
 */
const LIFECYCLE_VERBS = [
  {
    verb: "submitReview",
    suffix: `/products/${PRODUCT_ID}/submit-review`,
    server: { status: "PENDING_REVIEW", review: { state: "PENDING" } },
  },
  {
    verb: "approve",
    suffix: `/admin/products/${PRODUCT_ID}/approve`,
    server: { status: "PENDING_REVIEW", published: false, review: { state: "APPROVED" } },
  },
  {
    verb: "reject",
    suffix: `/admin/products/${PRODUCT_ID}/reject`,
    server: { status: "DRAFT", review: { state: "REJECTED" } },
    opts: { reason: "Needs better photography" },
  },
  {
    verb: "publish",
    suffix: `/admin/products/${PRODUCT_ID}/publish`,
    server: { status: "PUBLISHED", published: true, review: { state: "APPROVED" } },
  },
  {
    verb: "unpublish",
    suffix: `/admin/products/${PRODUCT_ID}/unpublish`,
    server: { status: "DRAFT", published: false },
  },
  {
    verb: "archive",
    suffix: `/admin/products/${PRODUCT_ID}/archive`,
    server: { status: "ARCHIVED", published: false },
  },
  {
    verb: "restore",
    suffix: `/admin/products/${PRODUCT_ID}/restore`,
    server: { status: "DRAFT", published: false },
  },
];

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
/* 1. Each verb hits its OWN endpoint — no crossover                    */
/* ------------------------------------------------------------------ */

for (const { verb, suffix, server, opts } of LIFECYCLE_VERBS) {
  test(`${verb} posts to exactly one endpoint: ${suffix}`, async () => {
    const calls = mockFetch(() => record(server));

    const result = await runAction(PRODUCT_ID, verb, opts ?? {});

    assert.ok(result.ok, `${verb} should succeed: ${result.error ?? ""}`);
    assert.equal(calls.length, 1, `${verb} issued ${calls.length} requests, expected 1`);
    assert.equal(calls[0].options.method, "POST");
    assert.ok(
      calls[0].url.endsWith(suffix),
      `${verb} called ${calls[0].url}, expected it to end with ${suffix}`,
    );
  });
}

test("the seven lifecycle verbs map to seven DISTINCT endpoints", async () => {
  const seen = new Map();
  for (const { verb, server, opts } of LIFECYCLE_VERBS) {
    const calls = mockFetch(() => record(server));
    await runAction(PRODUCT_ID, verb, opts ?? {});
    seen.set(verb, calls[0].url);
  }
  const urls = [...seen.values()];
  assert.equal(new Set(urls).size, urls.length, `endpoints collide: ${urls.join(", ")}`);
});

test("no lifecycle verb can reach the publish endpoint except publish", async () => {
  for (const { verb, server, opts } of LIFECYCLE_VERBS) {
    if (verb === "publish") continue;
    const calls = mockFetch(() => record(server));
    await runAction(PRODUCT_ID, verb, opts ?? {});
    for (const call of calls) {
      assert.ok(
        !call.url.endsWith("/publish"),
        `${verb} reached the publish endpoint (${call.url})`,
      );
    }
  }
});

/* ------------------------------------------------------------------ */
/* 2. The client never proposes a lifecycle state                       */
/* ------------------------------------------------------------------ */

test("no lifecycle call posts status, published, review or the audit fields", async () => {
  for (const { verb, server, opts } of LIFECYCLE_VERBS) {
    const calls = mockFetch(() => record(server));
    await runAction(PRODUCT_ID, verb, opts ?? {});
    const body = calls[0].options.body ? JSON.parse(calls[0].options.body) : {};
    for (const forbidden of [
      "status",
      "published",
      "review",
      "reviewFlags",
      "publishedAt",
      "publishedBy",
    ]) {
      assert.ok(
        !(forbidden in body),
        `${verb} sent a client-proposed "${forbidden}": ${calls[0].options.body}`,
      );
    }
  }
});

test("reject sends only its reason", async () => {
  const calls = mockFetch(() => record({ status: "DRAFT", review: { state: "REJECTED" } }));
  await runAction(PRODUCT_ID, "reject", { reason: "Colour is wrong" });
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(Object.keys(body), ["reason"]);
  assert.equal(body.reason, "Colour is wrong");
});

test("every lifecycle call resolves the ADMIN token scope, not a customer one", async () => {
  // A real admin token in the admin slot, plus a decoy in the customer slot.
  // A correctly scoped call must send the admin one; an unscoped or
  // wrongly-scoped call would send the decoy or nothing.
  localStorage.setItem("pf_admin_access_token", "ADMIN-TOKEN-123");
  localStorage.setItem("pf_access_token", "CUSTOMER-DECOY-456");

  for (const { verb, server, opts } of LIFECYCLE_VERBS) {
    const calls = mockFetch(() => record(server));
    await runAction(PRODUCT_ID, verb, opts ?? {});
    const headers = calls[0].options.headers ?? {};
    const auth = String(headers.Authorization ?? headers.authorization ?? "");
    assert.equal(
      auth, "Bearer ADMIN-TOKEN-123",
      `${verb} did not resolve the admin scope (sent: ${auth || "no header"})`,
    );
    assert.ok(
      !auth.includes("CUSTOMER-DECOY"),
      `${verb} sent the customer token`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 3. The server's state is mirrored verbatim, never invented           */
/* ------------------------------------------------------------------ */

test("the client reports exactly the state the server returned", async () => {
  for (const { verb, server, opts } of LIFECYCLE_VERBS) {
    mockFetch(() => record(server));
    const result = await runAction(PRODUCT_ID, verb, opts ?? {});
    assert.ok(result.ok);
    if ("status" in server) {
      assert.equal(
        result.product.status, server.status,
        `${verb}: client reported ${result.product.status}, server said ${server.status}`,
      );
    }
    if ("published" in server) {
      assert.equal(result.product.published, server.published, `${verb}: published flag`);
    }
  }
});

test("APPROVE does not let the client mark the product published", async () => {
  mockFetch(() => record({
    status: "PENDING_REVIEW",
    published: false,
    review: { state: "APPROVED" },
  }));

  const result = await runAction(PRODUCT_ID, "approve");

  assert.ok(result.ok);
  assert.equal(result.product.status, "PENDING_REVIEW");
  assert.equal(result.product.published, false);
  assert.equal(result.product.review.state, "APPROVED");
});

test("an APPROVE response that lies about publication is still not published locally", async () => {
  // Defence in depth: even if a malformed payload claimed PUBLISHED, approve
  // must not be the path that flips the local mirror — publish is.
  const calls = mockFetch(() => record({
    status: "PENDING_REVIEW",
    published: false,
    review: { state: "APPROVED" },
  }));
  await runAction(PRODUCT_ID, "approve");
  assert.equal(calls.length, 1, "approve chained into a second request");
  assert.ok(!calls[0].url.endsWith("/publish"));
});

/* ------------------------------------------------------------------ */
/* 4. Refusals are refusals                                             */
/* ------------------------------------------------------------------ */

test("a 422 illegal transition is reported as a failure, not a success", async () => {
  for (const { verb, opts } of LIFECYCLE_VERBS) {
    mockFetch(() => businessRuleViolation("Only archived products can be restored."));
    const result = await runAction(PRODUCT_ID, verb, opts ?? {});
    assert.equal(result.ok, false, `${verb} treated a 422 as success`);
    assert.equal(Number(result.status), 422, `${verb} lost the status code`);
    assert.ok(result.error, `${verb} produced no error message`);
  }
});

test("a refused transition yields no product record to mirror", async () => {
  mockFetch(() => businessRuleViolation("This product is already archived."));
  const result = await runAction(PRODUCT_ID, "archive");
  assert.equal(result.ok, false);
  assert.ok(!result.product, "a refused transition still handed back a product");
});

test("the server's refusal message is surfaced, not replaced by a local guess", async () => {
  const message = "This product has not been approved for publication yet.";
  mockFetch(() => businessRuleViolation(message));
  const result = await runAction(PRODUCT_ID, "publish");
  assert.equal(result.ok, false);
  assert.ok(
    String(result.error).includes("approved"),
    `expected the server message, got: ${result.error}`,
  );
});

test("a 409 from change-id is surfaced as a conflict, not a success", async () => {
  mockFetch(() => jsonResponse(
    { success: false, error: { code: "CONFLICT", message: "Product ID 'X' is already taken.", details: {} } },
    409,
  ));
  const result = await runAction(PRODUCT_ID, "changeId", { newId: "X" });
  assert.equal(result.ok, false);
  assert.equal(Number(result.status), 409);
});

test("a 404 on a lifecycle route is surfaced, not swallowed", async () => {
  mockFetch(() => jsonResponse(
    { success: false, error: { code: "NOT_FOUND", message: "Product 'X' not found.", details: {} } },
    404,
  ));
  const result = await runAction("PF-DOES-NOT-EXIST", "publish");
  assert.equal(result.ok, false);
  assert.equal(Number(result.status), 404);
});

/* ------------------------------------------------------------------ */
/* 5. Unknown verbs and bulk lifecycle                                  */
/* ------------------------------------------------------------------ */

test("an unknown lifecycle verb issues NO request at all", async () => {
  const calls = mockFetch(() => record());
  const result = await runAction(PRODUCT_ID, "goLive");
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0, "an unknown verb still hit the network");
  assert.match(String(result.error), /unknown product action/i);
});

test("there is no bulk lifecycle verb in the action map", async () => {
  const source = src("services/admin/productAdminService.js");
  const actionMap = source.slice(source.indexOf("const ACTIONS = {"), source.indexOf("};", source.indexOf("const ACTIONS = {")));
  for (const forbidden of ["bulkPublish", "bulkArchive", "bulkApprove", "bulkUnpublish", "bulkReject"]) {
    assert.ok(!actionMap.includes(forbidden), `a bulk lifecycle verb appeared: ${forbidden}`);
  }
});

test("bulk flags cannot carry a lifecycle field", async () => {
  const source = src("services/admin/productAdminService.js");
  assert.match(
    source,
    /status is refused by the\s*\*?\s*backend bulk route by design/,
    "the bulk helper no longer documents that status is server-refused",
  );
});

/* ------------------------------------------------------------------ */
/* 6. STATIC guards — component-level requirements, no DOM available    */
/* ------------------------------------------------------------------ */

test("STATIC: the workflow layer states that approval does not publish", () => {
  const source = src("services/workflow/productWorkflowCommands.js");
  assert.match(source, /APPROVAL DOES NOT PUBLISH/);

  const approve = source.slice(
    source.indexOf("export const approveProduct"),
    source.indexOf("export const publishProduct"),
  );
  assert.ok(approve.length > 0, "approveProduct not found");
  assert.ok(
    !/PRODUCT_STATUS\.PUBLISHED/.test(approve),
    "approveProduct writes the PUBLISHED status",
  );
  assert.ok(
    !/published:\s*true/.test(approve),
    "approveProduct sets published: true",
  );
});

test("STATIC: publish requires approval before it will run", () => {
  const source = src("services/workflow/productWorkflowCommands.js");
  const publish = source.slice(source.indexOf("export const publishProduct"));
  assert.match(
    publish,
    /Admin review incomplete/,
    "publishProduct no longer refuses an unapproved product",
  );
});

test("STATIC: runAction is the single lifecycle entry point in the admin desk", () => {
  const source = src("pages/admin/AdminProducts.jsx");
  assert.match(
    source,
    /import\s*\{[^}]*runAction[^}]*\}\s*from\s*["']\.\.\/\.\.\/services\/admin\/productAdminService["']/,
    "AdminProducts must import runAction statically, not lazily",
  );
  // No raw fetch may bypass apiClient for a lifecycle call.
  assert.ok(
    !/fetch\(\s*["'`]/.test(source),
    "AdminProducts issues a raw fetch, bypassing apiClient scope resolution",
  );
});

test("STATIC: every lifecycle wrapper in productsApi passes an explicit scope", () => {
  const source = src("services/api/productsApi.js");
  const wrappers = [
    "apiAdminApproveProduct",
    "apiAdminRejectProduct",
    "apiAdminPublishProduct",
    "apiAdminUnpublishProduct",
    "apiAdminArchiveProduct",
    "apiAdminRestoreProduct",
    "apiAdminChangeProductId",
    "apiAdminClearReviewFlags",
  ];
  for (const name of wrappers) {
    const start = source.indexOf(`export async function ${name}(`);
    assert.ok(start > -1, `${name} is missing from productsApi.js`);
    const body = source.slice(start, start + 420);
    assert.match(
      body,
      /scope:\s*"admin"/,
      `${name} does not pass an explicit admin scope`,
    );
  }
});

test("STATIC: no lifecycle wrapper posts a status or published field", () => {
  const source = src("services/api/productsApi.js");
  for (const name of [
    "apiAdminApproveProduct",
    "apiAdminPublishProduct",
    "apiAdminUnpublishProduct",
    "apiAdminArchiveProduct",
    "apiAdminRestoreProduct",
  ]) {
    const start = source.indexOf(`export async function ${name}(`);
    const body = source.slice(start, start + 420);
    assert.ok(
      !/["']?status["']?\s*:/.test(body),
      `${name} proposes a status to the server`,
    );
    assert.ok(
      !/["']?published["']?\s*:/.test(body),
      `${name} proposes a published flag to the server`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 7. Blocks 1-5 regression locks                                       */
/* ------------------------------------------------------------------ */

test("REGRESSION Block 1: draft creation still targets the canonical draft route", async () => {
  const source = src("services/api/productsApi.js");
  assert.match(source, /\/admin\/products\/draft/);
  assert.match(source, /\/admin\/products\/next-id/);
});

test("REGRESSION Block 4: the availability pre-flight still supports excludeId", async () => {
  const source = src("services/api/productsApi.js");
  const start = source.indexOf("apiAdminCheckAvailability");
  assert.ok(start > -1, "the availability probe disappeared");
  assert.match(source.slice(start, start + 700), /excludeId/);
});

test("REGRESSION Block 5: storefront reads still use the public product routes", async () => {
  const source = src("services/api/productsApi.js");
  const start = source.indexOf("export async function apiListProducts");
  assert.ok(start > -1, "apiListProducts disappeared");
  // Slice to the NEXT export, not a fixed window — the function is ~900 chars.
  const next = source.indexOf("export async function", start + 1);
  const body = source.slice(start, next > -1 ? next : source.length);
  assert.ok(
    !body.includes("/admin/"),
    "the storefront listing was pointed at an admin route",
  );
  assert.match(body, /scope:\s*"none"/);
});

test("REGRESSION Block 5: the catalog store still has no local publication gate", () => {
  const source = src("services/catalog/catalogStore.js");
  assert.ok(
    !/status\s*===\s*["']PUBLISHED["']/.test(source),
    "a client-side PUBLISHED comparison reappeared in the catalog store",
  );
});
