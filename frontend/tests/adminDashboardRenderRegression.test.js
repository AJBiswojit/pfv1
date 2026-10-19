/**
 * Regression pin for the Super Admin dashboard blank-page defect (2026-10).
 *
 * ROOT CAUSE
 * ----------
 * `pages/admin/AdminDashboard.jsx` called a `useMemo` AFTER its loading
 * early-return. The first render (`status === "loading"`) therefore ran one
 * hook fewer than the second render (`status === "ready"`), so the moment the
 * dashboard summary resolved React threw
 *
 *     "Rendered more hooks than during the previous render."
 *
 * The error is thrown while rendering, it is not caught by any error
 * boundary, so React unmounted the whole tree: the Super Admin dashboard
 * flashed and the page went blank (and stayed blank on every reload).
 *
 * THESE TESTS
 * -----------
 * 1. Render the REAL component with the REAL data contract and assert that
 *    the dashboard survives the loading → ready transition.
 * 2. Pin the structural rule that keeps the hook order stable: every hook of
 *    the component must sit ABOVE the loading early-return.
 * 3. Assert the same for the two sibling surfaces that had the identical
 *    defect (permission gate before the hooks).
 */
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { create } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const root = new URL("../", import.meta.url).pathname;
const source = (rel) => readFileSync(`${root}src/${rel}`, "utf8");

const original = {
  fetch: globalThis.fetch,
  storage: globalThis.localStorage,
  window: globalThis.window,
  act: globalThis.IS_REACT_ACT_ENVIRONMENT,
};

let vite;
let AdminDashboard;
let AdminContext;
let renderers = [];
let requests = [];

const SUMMARY = {
  ok: true,
  metrics: {
    totalRevenue: 128400, revenue: 128400, orderCount: 42, totalOrders: 42,
    customerCount: 17, customerCountTotal: 17, customers: 17,
    productCount: 96, lowStockCount: 4, pendingOrders: 3,
  },
  salesSeries: [
    { date: "2026-10-12", revenue: 1200, orders: 3 },
    { date: "2026-10-13", revenue: 2400, orders: 6 },
  ],
  categories: [{ name: "Sarees", revenue: 5400 }],
  recentOrders: [
    { id: "PF-ORD-0001", customer: { fullName: "Asha Patel" }, total: 2499, status: "delivered", items: [{ quantity: 2 }] },
  ],
  inventorySummary: { items: [{ status: "in" }, { status: "low" }] },
  employees: { total: 9, active: 7 },
};

const superAdmin = {
  id: "admin-1",
  name: "Aparna Sharma",
  firstName: "Aparna",
  lastName: "Sharma",
  email: "superadmin@pratikshyafashion.in",
  adminId: "admin-1",
  role: "SUPER_ADMIN",
  accountLevel: "SUPER_ADMIN",
  roles: ["SUPER_ADMIN"],
  permissions: ["*"],
  workspace: "admin",
  status: "ACTIVE",
};

const text = (node) => {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  return text(node.children);
};

/**
 * The body of one component inside a source file: from its declaration up to
 * the next top-level declaration. Keeps the structural checks scoped to the
 * component under test (the file may hold other components).
 */
const componentBody = (file, declaration) => {
  const start = file.indexOf(declaration);
  assert.ok(start > 0, `component declaration found: ${declaration}`);
  const rest = file.slice(start + declaration.length);
  const next = rest.search(/\n(export\s+)?(default\s+)?(function|const|class)\s/);
  return next === -1 ? rest : rest.slice(0, next);
};

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({
    root,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  AdminDashboard = (await vite.ssrLoadModule("/src/pages/admin/AdminDashboard.jsx")).default;
  AdminContext = (await vite.ssrLoadModule("/src/context/AdminAuthContext.jsx")).default;
});

beforeEach(() => {
  requests = [];
  renderers = [];
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.window = {
    localStorage: globalThis.localStorage,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
  };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), "https://frontend.invalid");
    requests.push({ method: options.method ?? "GET", path: `${url.pathname}${url.search}` });
    return new Response(JSON.stringify(SUMMARY), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
});

after(async () => {
  for (const tree of renderers) await act(async () => { tree.unmount(); });
  await vite?.close();
  for (const [key, value] of [["fetch", original.fetch], ["localStorage", original.storage], ["window", original.window], ["IS_REACT_ACT_ENVIRONMENT", original.act]]) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

test("Super Admin dashboard survives the loading → ready transition (no hook-order crash)", async () => {
  const consoleErrors = [];
  const realError = console.error;
  console.error = (...args) => { consoleErrors.push(args.map(String).join(" ")); };

  let tree;
  let thrown = null;
  try {
    await act(async () => {
      tree = create(
        React.createElement(
          MemoryRouter,
          { initialEntries: ["/super-admin"] },
          React.createElement(
            AdminContext.Provider,
            { value: { admin: superAdmin, isSuperAdmin: true, isAuthenticated: true, isLoading: false } },
            React.createElement(AdminDashboard, {}),
          ),
        ),
      );
    });
    renderers.push(tree);

    // The summary resolves → the component re-renders with the real figures.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  } catch (err) {
    thrown = err;
  } finally {
    console.error = realError;
  }

  assert.equal(thrown, null, `the dashboard must not throw while rendering: ${thrown?.message}`);
  assert.ok(tree, "the dashboard must stay mounted");
  assert.notEqual(tree.toJSON(), null, "the dashboard must still be on screen after the data arrives");

  const rendered = text(tree.toJSON());
  /* Phase 3 set the KPI labels in sentence case (the tiles carry the
     emphasis, not the capitalisation). */
  assert.match(rendered, /Total revenue/i, "the KPI cards render");
  assert.match(rendered, /Total orders/i, "the KPI cards render");
  assert.match(rendered, /Revenue trend/, "the revenue chart renders");
  assert.match(rendered, /Common operations|Quick actions/i, "the quick actions render");

  const hookErrors = consoleErrors.filter((message) => /hook/i.test(message));
  assert.deepEqual(hookErrors, [], `no Rules-of-Hooks violation may be logged: ${hookErrors.join(" | ")}`);
  assert.ok(
    requests.some((r) => r.path.includes("/super-admin/dashboard/summary")),
    `the dashboard reads the server summary: ${JSON.stringify(requests)}`,
  );
});

test("AdminDashboard keeps every hook above the loading early-return", () => {
  const file = source("pages/admin/AdminDashboard.jsx");
  const body = componentBody(file, "export default function AdminDashboard(");
  const earlyReturn = body.indexOf('if (status === "loading")');
  assert.ok(earlyReturn > 0, "the dashboard still has its loading early-return");

  // Every hook call of the component must appear before that early-return.
  const hookCalls = [...body.matchAll(/\buse(Memo|State|Effect|Callback|Ref)\(/g)].map((match) => match.index);
  assert.ok(hookCalls.length >= 3, `the dashboard uses hooks: ${hookCalls.length}`);
  for (const index of hookCalls) {
    assert.ok(index < earlyReturn, "no hook may be declared after the loading early-return");
  }
});

test("The permission-gated staff surfaces keep their hooks above the gate", () => {
  const instagram = componentBody(source("pages/admin/offers/AdminInstagramRewards.jsx"), "export default function AdminInstagramRewards(");
  const instagramGate = instagram.indexOf("const isRewardsDenied");
  const instagramReturn = instagram.indexOf("\n  if (isRewardsDenied) {", instagramGate + 1);
  assert.ok(instagramGate > 0 && instagramReturn > instagramGate, "the rewards gate is captured before the hooks run");
  const instagramHooks = [...instagram.matchAll(/\buse(Effect|Memo|State)\(/g)].map((m) => m.index);
  assert.ok(instagramHooks.length >= 3, `the rewards desk uses hooks: ${instagramHooks.length}`);
  for (const index of instagramHooks) {
    assert.ok(index < instagramReturn, "no hook may run after the rewards permission gate");
  }

  const review = componentBody(source("pages/employee/EmployeeProductReview.jsx"), "export default function EmployeeProductReview(");
  const reviewGate = review.indexOf("const isReviewDenied");
  const reviewReturn = review.indexOf("\n  if (isReviewDenied) {", reviewGate + 1);
  assert.ok(reviewGate > 0 && reviewReturn > reviewGate, "the product-review gate is captured before the hooks run");
  const reviewHooks = [...review.matchAll(/\buse(Effect|Memo|State)\(/g)].map((m) => m.index);
  assert.ok(reviewHooks.length >= 3, `the product review uses hooks: ${reviewHooks.length}`);
  for (const index of reviewHooks) {
    assert.ok(index < reviewReturn, "no hook may run after the product-review permission gate");
  }
});
