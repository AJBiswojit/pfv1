import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  apiClient,
  ApiError,
  handleError,
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  TOKEN_KEYS,
  resolveRequestScope,
  normaliseError,
} from "../src/services/api/apiClient.js";

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

let originalFetch;

beforeEach(() => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const eventTarget = new EventTarget();
  globalThis.window = eventTarget;
  window.localStorage = storage;
  if (typeof globalThis.CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(type, eventInitDict = {}) {
        super(type, eventInitDict);
        this.detail = eventInitDict.detail ?? null;
      }
    };
  }
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("1. Missing scope throws ApiError with code INVALID_SCOPE", async () => {
  assert.throws(
    () => resolveRequestScope("/products"),
    (err) => err instanceof ApiError && err.code === "INVALID_SCOPE"
  );

  await assert.rejects(
    async () => apiClient.get("/products"),
    (err) => err instanceof ApiError && err.code === "INVALID_SCOPE" && err.status === 0
  );
});

test("2. Invalid/unsupported scope throws ApiError with code INVALID_SCOPE", async () => {
  assert.throws(
    () => resolveRequestScope("/test", { scope: "superadmin" }),
    (err) => err instanceof ApiError && err.code === "INVALID_SCOPE"
  );

  await assert.rejects(
    async () => apiClient.get("/test", { scope: "invalid_role" }),
    (err) => err instanceof ApiError && err.code === "INVALID_SCOPE"
  );
});

test("3. Correct token is attached per authenticated scope", async () => {
  localStorage.setItem(TOKEN_KEYS.customer.ACCESS, "customer-token-123");
  localStorage.setItem(TOKEN_KEYS.admin.ACCESS, "admin-token-456");
  localStorage.setItem(TOKEN_KEYS.employee.ACCESS, "employee-token-789");

  const capturedHeaders = {};

  globalThis.fetch = async (url, options) => {
    capturedHeaders[url] = options.headers;
    return jsonResponse({ ok: true });
  };

  await apiClient.get("/cart", { scope: "customer" });
  await apiClient.get("/admin/products", { scope: "admin" });
  await apiClient.get("/employee/me", { scope: "employee" });

  assert.equal(capturedHeaders["/api/v1/cart"]["Authorization"], "Bearer customer-token-123");
  assert.equal(capturedHeaders["/api/v1/admin/products"]["Authorization"], "Bearer admin-token-456");
  assert.equal(capturedHeaders["/api/v1/employee/me"]["Authorization"], "Bearer employee-token-789");
});

test("4. scope: 'none' and 'public' never send Authorization header", async () => {
  localStorage.setItem(TOKEN_KEYS.customer.ACCESS, "customer-token-123");
  localStorage.setItem(TOKEN_KEYS.admin.ACCESS, "admin-token-456");

  let attachedAuth = null;
  globalThis.fetch = async (url, options) => {
    attachedAuth = options.headers["Authorization"];
    return jsonResponse({ items: [] });
  };

  await apiClient.get("/products", { scope: "none" });
  assert.equal(attachedAuth, undefined);

  await apiClient.get("/products", { scope: "public" });
  assert.equal(attachedAuth, undefined);
});

test("5. Network failures are classified as status=0, isNetworkError=true, code=NETWORK_ERROR", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    await apiClient.get("/products", { scope: "none" });
    assert.fail("Should have thrown ApiError");
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 0);
    assert.equal(err.isNetworkError, true);
    assert.equal(err.code, "NETWORK_ERROR");
  }
});

test("6. HTTP error responses are NOT classified as network errors", async () => {
  const statusCodes = [400, 401, 403, 404, 409, 422, 429, 500, 502, 503];

  for (const status of statusCodes) {
    globalThis.fetch = async () =>
      jsonResponse(
        { success: false, error: { code: `ERR_${status}`, message: `Error ${status}`, details: {} } },
        status
      );

    try {
      await apiClient.get("/test", { scope: "none" });
      assert.fail(`Should have thrown for HTTP ${status}`);
    } catch (err) {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, status);
      assert.equal(err.isNetworkError, false);
      assert.equal(err.code, `ERR_${status}`);
      assert.equal(err.message, `Error ${status}`);
    }
  }
});

test("7. HTTP 422 validation errors preserve the complete details array", async () => {
  const validationDetails = [
    { loc: ["body", "email"], msg: "Invalid email address", type: "value_error" },
    { loc: ["body", "password"], msg: "Must be at least 8 chars", type: "string_too_short" },
  ];

  globalThis.fetch = async () =>
    jsonResponse(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload or parameters",
          details: validationDetails,
        },
      },
      422
    );

  try {
    await apiClient.post("/auth/customer/sign-up", {}, { scope: "none" });
    assert.fail("Should have thrown on 422");
  } catch (err) {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.equal(err.code, "VALIDATION_ERROR");
    assert.deepEqual(err.details, validationDetails);
    assert.equal(err.isNetworkError, false);
  }
});

test("8. Admin refresh uses admin refresh token and updates admin tokens strictly", async () => {
  localStorage.setItem(TOKEN_KEYS.admin.ACCESS, "expired-admin-access");
  localStorage.setItem(TOKEN_KEYS.admin.REFRESH, "valid-admin-refresh");
  localStorage.setItem(TOKEN_KEYS.customer.ACCESS, "customer-access");
  localStorage.setItem(TOKEN_KEYS.customer.REFRESH, "customer-refresh");

  let refreshCallBody = null;
  let requests = 0;

  globalThis.fetch = async (url, options) => {
    if (url.includes("/auth/refresh")) {
      refreshCallBody = JSON.parse(options.body);
      return jsonResponse({ access_token: "new-admin-access", refresh_token: "new-admin-refresh" });
    }
    requests += 1;
    if (requests === 1) {
      return jsonResponse({ error: { message: "Token expired" } }, 401);
    }
    return jsonResponse({ ok: true, adminData: "secret" });
  };

  const data = await apiClient.get("/admin/analytics", { scope: "admin" });

  assert.equal(data.ok, true);
  assert.equal(refreshCallBody.refresh_token, "valid-admin-refresh");
  assert.equal(localStorage.getItem(TOKEN_KEYS.admin.ACCESS), "new-admin-access");
  assert.equal(localStorage.getItem(TOKEN_KEYS.admin.REFRESH), "new-admin-refresh");
  // Customer tokens MUST remain untouched
  assert.equal(localStorage.getItem(TOKEN_KEYS.customer.ACCESS), "customer-access");
  assert.equal(localStorage.getItem(TOKEN_KEYS.customer.REFRESH), "customer-refresh");
});

test("9. Employee refresh uses employee refresh token strictly", async () => {
  localStorage.setItem(TOKEN_KEYS.employee.ACCESS, "expired-employee-access");
  localStorage.setItem(TOKEN_KEYS.employee.REFRESH, "valid-employee-refresh");

  let refreshCallBody = null;
  let requests = 0;

  globalThis.fetch = async (url, options) => {
    if (url.includes("/auth/refresh")) {
      refreshCallBody = JSON.parse(options.body);
      return jsonResponse({ access_token: "new-employee-access" });
    }
    requests += 1;
    if (requests === 1) {
      return jsonResponse({ error: { message: "Token expired" } }, 401);
    }
    return jsonResponse({ ok: true, employeeData: "desk" });
  };

  const data = await apiClient.get("/employee/me", { scope: "employee" });

  assert.equal(data.ok, true);
  assert.equal(refreshCallBody.refresh_token, "valid-employee-refresh");
  assert.equal(localStorage.getItem(TOKEN_KEYS.employee.ACCESS), "new-employee-access");
});

test("10. Concurrent 401s for the same scope issue exactly ONE refresh call", async () => {
  localStorage.setItem(TOKEN_KEYS.customer.ACCESS, "expired-customer-access");
  localStorage.setItem(TOKEN_KEYS.customer.REFRESH, "customer-refresh-token");

  let refreshCount = 0;
  let initialCalls = 0;

  globalThis.fetch = async (url) => {
    if (url.includes("/auth/refresh")) {
      refreshCount += 1;
      // Introduce micro-delay to simulate async network roundtrip
      await new Promise((r) => setTimeout(r, 10));
      return jsonResponse({ access_token: "refreshed-customer-access" });
    }
    initialCalls += 1;
    if (initialCalls <= 3) {
      return jsonResponse({ error: { message: "Unauthorized" } }, 401);
    }
    return jsonResponse({ ok: true });
  };

  // Launch 3 simultaneous requests with scope customer
  const results = await Promise.all([
    apiClient.get("/cart", { scope: "customer" }),
    apiClient.get("/orders", { scope: "customer" }),
    apiClient.get("/wishlist", { scope: "customer" }),
  ]);

  assert.equal(results.length, 3);
  assert.equal(refreshCount, 1, "Exactly one refresh HTTP call must be issued for concurrent 401s");
});

test("11. handleError return shape complies with canonical contract", () => {
  const apiErr = new ApiError("Validation failed", 422, { some: "raw" }, "VALIDATION_ERROR", [{ loc: ["email"], msg: "Bad" }], false);
  const normalized = handleError(apiErr);

  assert.deepEqual(normalized, {
    ok: false,
    error: "Validation failed",
    status: 422,
    code: "VALIDATION_ERROR",
    details: [{ loc: ["email"], msg: "Bad" }],
    data: { some: "raw" },
    isNetworkError: false,
  });

  const netErr = new ApiError("Network error. Check your connection.", 0, null, "NETWORK_ERROR", null, true);
  const netNormalized = handleError(netErr);

  assert.deepEqual(netNormalized, {
    ok: false,
    error: "Network error. Check your connection.",
    status: 0,
    code: "NETWORK_ERROR",
    details: null,
    data: null,
    isNetworkError: true,
  });
});

test("12. Static analysis: 0 unscoped apiClient calls in services/api/", () => {
  const apiDir = path.resolve("src/services/api");
  const files = fs.readdirSync(apiDir).filter((f) => f.endsWith(".js") && f !== "apiClient.js");

  const callRegex = /\bapiClient\.(get|post|patch|put|delete|upload)\s*\(/g;

  let totalCalls = 0;
  let unscopedCalls = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(apiDir, file), "utf-8");
    let match;
    while ((match = callRegex.exec(content)) !== null) {
      totalCalls += 1;
      const startPos = match.index;
      let openParens = 0;
      let endPos = startPos;
      for (let i = match.index + match[0].length - 1; i < content.length; i++) {
        if (content[i] === "(") openParens += 1;
        else if (content[i] === ")") {
          openParens -= 1;
          if (openParens === 0) {
            endPos = i + 1;
            break;
          }
        }
      }
      const callText = content.slice(startPos, endPos);
      const hasScope =
        callText.includes("scope:") ||
        callText.includes("scope :") ||
        callText.includes("{ scope }") ||
        callText.includes(", scope }") ||
        callText.includes("{ scope,");
      if (!hasScope) {
        unscopedCalls += 1;
        console.error(`Unscoped call in ${file}: ${callText}`);
      }
    }
  }

  assert.ok(totalCalls > 150, `Expected >150 apiClient calls across services/api/, got ${totalCalls}`);
  assert.equal(unscopedCalls, 0, "There must be zero unscoped apiClient calls");
});
