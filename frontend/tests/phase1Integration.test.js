import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { apiClient } from "../src/services/api/apiClient.js";
import { apiAnalyticsOverview, apiListAuditLogs, apiListRoles } from "../src/services/api/adminApi.js";
import {
  apiRestoreAdminSession,
  apiRestoreCustomerSession,
  apiRestoreEmployeeSession,
} from "../src/services/api/authApi.js";
import { apiListProducts, apiSubmitForReview } from "../src/services/api/productsApi.js";
import {
  getCatalogState,
  getSubcategories,
  refreshCatalog,
  subscribeCatalog,
} from "../src/services/catalog/catalogStore.js";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  clear() { this.map.clear(); }
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const installBrowserGlobals = () => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const eventTarget = new EventTarget();
  globalThis.window = eventTarget;
  window.localStorage = storage;
  if (typeof globalThis.CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(type, options = {}) {
        super(type, options);
        this.detail = options.detail;
      }
    };
  }
};

beforeEach(() => {
  installBrowserGlobals();
});

afterEach(() => {
  delete globalThis.fetch;
  localStorage.clear();
});

test("Phase 1: analytics, RBAC and audit APIs use the admin token explicitly", async () => {
  localStorage.setItem("pf_access_token", "customer-token");
  localStorage.setItem("pf_admin_access_token", "admin-token");

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const value = String(url);
    if (value.includes("/roles")) return jsonResponse({ items: [] });
    if (value.includes("/audit/logs")) return jsonResponse({ items: [], total: 0 });
    return jsonResponse({ totalRevenue: 1000 });
  };

  const analytics = await apiAnalyticsOverview();
  const roles = await apiListRoles();
  const audit = await apiListAuditLogs();

  assert.equal(analytics.ok, true);
  assert.equal(roles.ok, true);
  assert.equal(audit.ok, true);
  assert.deepEqual(
    calls.map((call) => call.options.headers.Authorization),
    ["Bearer admin-token", "Bearer admin-token", "Bearer admin-token"]
  );
});

test("Phase 1: submit-review uses employee scope by default, never the customer token", async () => {
  localStorage.setItem("pf_access_token", "customer-token");
  localStorage.setItem("pf_employee_access_token", "employee-token");

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ product: { id: "PF-TEST-001", name: "Review piece", originalPrice: 2000 } });
  };

  const result = await apiSubmitForReview("PF-TEST-001");

  assert.equal(result.ok, true);
  assert.equal(calls[0].url.endsWith("/api/v1/products/PF-TEST-001/submit-review"), true);
  assert.equal(calls[0].options.headers.Authorization, "Bearer employee-token");
});

test("Phase 1: session restoration validates each role with the correct scoped backend endpoint", async () => {
  localStorage.setItem("pf_access_token", "customer-token");
  localStorage.setItem("pf_admin_access_token", "admin-token");
  localStorage.setItem("pf_employee_access_token", "employee-token");

  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const value = String(url);
    calls.push({ url: value, options });
    if (value.endsWith("/api/v1/customers/me")) {
      return jsonResponse({ profile: { id: "customer-1", first_name: "Asha", last_name: "Patel", email: "asha@example.test" } });
    }
    if (value.endsWith("/api/v1/auth/me")) {
      return jsonResponse({ id: "admin-1", full_name: "Admin User", user_type: "admin", status: "ACTIVE", roles: ["SUPER_ADMIN"], permissions: ["*"], is_verified: true, force_password_change: false });
    }
    if (value.endsWith("/api/v1/employee/me")) {
      return jsonResponse({ data: { id: "employee-user-1", full_name: "Employee User", status: "ACTIVE", profile: { employee_code: "PF-EMP-00001", designation: "Stylist", department: "Product" }, roles: ["STYLIST"], permissions: ["products.manage"] } });
    }
    return jsonResponse({ ok: false }, 404);
  };

  const customer = await apiRestoreCustomerSession();
  const admin = await apiRestoreAdminSession();
  const employee = await apiRestoreEmployeeSession();

  assert.equal(customer.ok, true);
  assert.equal(admin.ok, true);
  assert.equal(employee.ok, true);
  assert.deepEqual(
    calls.map((call) => [new URL(call.url, "https://example.test").pathname, call.options.headers.Authorization]),
    [
      ["/api/v1/customers/me", "Bearer customer-token"],
      ["/api/v1/auth/me", "Bearer admin-token"],
      ["/api/v1/employee/me", "Bearer employee-token"],
    ]
  );
});

test("Phase 1: refresh failure clears only the expired scope", async () => {
  localStorage.setItem("pf_access_token", "expired-customer");
  localStorage.setItem("pf_refresh_token", "bad-customer-refresh");
  localStorage.setItem("pf_admin_access_token", "admin-token");
  localStorage.setItem("pf_admin_refresh_token", "admin-refresh");
  localStorage.setItem("pf_employee_access_token", "employee-token");
  localStorage.setItem("pf_employee_refresh_token", "employee-refresh");

  const expiredScopes = [];
  window.addEventListener("pf:session-expired", (event) => expiredScopes.push(event.detail.scope));

  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/v1/auth/refresh")) return jsonResponse({ detail: "revoked" }, 401);
    return jsonResponse({ detail: "expired" }, 401);
  };

  await assert.rejects(() => apiClient.get("/cart", { scope: "customer" }), /Session expired/);

  assert.equal(localStorage.getItem("pf_access_token"), null);
  assert.equal(localStorage.getItem("pf_refresh_token"), null);
  assert.equal(localStorage.getItem("pf_admin_access_token"), "admin-token");
  assert.equal(localStorage.getItem("pf_admin_refresh_token"), "admin-refresh");
  assert.equal(localStorage.getItem("pf_employee_access_token"), "employee-token");
  assert.equal(localStorage.getItem("pf_employee_refresh_token"), "employee-refresh");
  assert.deepEqual(expiredScopes, ["customer"]);
});

test("Phase 1: collectionId uses the backend collection-products endpoint and originalPrice is preserved", async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return jsonResponse({
      items: [
        { id: "p1", name: "Discounted", price: 1200, originalPrice: 1800 },
        { id: "p2", name: "No original", price: 900 },
      ],
      total: 2,
      facets: {},
    });
  };

  const result = await apiListProducts({ collectionId: "summer-edit", page: 1, pageSize: 12 });

  assert.equal(result.ok, true);
  assert.equal(calls[0].url.includes("/api/v1/collections/summer-edit/products"), true);
  assert.equal(calls[0].url.includes("pageSize=12"), true);
  assert.equal(result.items[0].originalPrice, 1800);
  assert.equal(result.items[1].originalPrice, null);
});

test("Phase 1: subcategories hydrate from the backend and catalog snapshots change identity", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    urls.push(value);
    if (value.includes("/products?")) return jsonResponse({ items: [], total: 0, facets: {} });
    if (value.includes("/categories/sarees/subcategories")) {
      return jsonResponse({ items: [{ id: "cotton", category_id: "sarees", name: "Cotton", slug: "cotton", status: "ACTIVE" }] });
    }
    if (value.includes("/categories?")) {
      return jsonResponse({ items: [{ id: "sarees", name: "Sarees", slug: "sarees", status: "ACTIVE" }] });
    }
    if (value.includes("/collections?")) return jsonResponse({ items: [] });
    if (value.includes("/home")) return jsonResponse({ ok: true });
    if (value.includes("/explore/offers")) return jsonResponse({ offers: [] });
    return jsonResponse({ ok: true });
  };

  const before = getCatalogState();
  let notifications = 0;
  const unsubscribe = subscribeCatalog(() => { notifications += 1; });
  await refreshCatalog();
  unsubscribe();
  const after = getCatalogState();

  assert.notEqual(after, before, "external-store snapshot identity changes after hydration");
  assert.equal(notifications >= 2, true, "loading and ready updates notify subscribers");
  assert.equal(urls.some((url) => url.includes("/categories/sarees/subcategories?status=ACTIVE")), true);
  assert.deepEqual(getSubcategories("sarees").map((item) => item.slug), ["cotton"]);
});
