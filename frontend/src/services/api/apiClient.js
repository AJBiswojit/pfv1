/**
 * PRATIKSHYA FASHON — Base API client.
 *
 * Single HTTP seam between the frontend and FastAPI backend.
 * Handles:
 *   - Base URL from VITE_API_BASE (defaults to /api/v1 via Vite proxy)
 *   - Explicit Authorization token scoping (customer / admin / employee / none)
 *   - JSON requests plus multipart uploads (apiClient.upload, Phase 6)
 *   - Automatic token refresh on 401 (one retry per request)
 *   - Per-surface token and refresh isolation
 *   - Structured error normalisation → { ok: false, error: string, status: number }
 *
 * Usage:
 *   import { apiClient } from './apiClient'
 *   const data = await apiClient.get('/analytics/overview', { scope: 'admin' })
 *   const publicData = await apiClient.get('/products', { scope: 'none' })
 *
 * Token contract:
 *   - Customer → "pf_access_token" / "pf_refresh_token"
 *   - Admin    → "pf_admin_access_token" / "pf_admin_refresh_token"
 *   - Employee → "pf_employee_access_token" / "pf_employee_refresh_token"
 *
 * IMPORTANT: callers must pass an explicit `scope` for protected APIs.  The
 * path-based `scopeForPath()` helper is retained only as a backwards-compatible
 * last resort for legacy call sites and tests; authorization correctness must
 * not depend on URL-prefix guessing.
 */

const BASE_URL = (import.meta.env && import.meta.env.VITE_API_BASE) ?? "/api/v1";

export const TOKEN_KEYS = {
  customer: { ACCESS: "pf_access_token", REFRESH: "pf_refresh_token" },
  admin:    { ACCESS: "pf_admin_access_token", REFRESH: "pf_admin_refresh_token" },
  employee: { ACCESS: "pf_employee_access_token", REFRESH: "pf_employee_refresh_token" },
};

export const AUTH_SCOPES = Object.freeze({
  CUSTOMER: "customer",
  ADMIN: "admin",
  EMPLOYEE: "employee",
  NONE: "none",
  PUBLIC: "public",
});

const AUTHENTICATED_SCOPES = new Set(["customer", "admin", "employee"]);
const PUBLIC_SCOPES = new Set(["none", "public"]);

// ---------------------------------------------------------------------------
// Path → surface scope (legacy fallback only)
// ---------------------------------------------------------------------------

export function scopeForPath(path = "") {
  if (path.startsWith("/auth/admin") || path.startsWith("/admin")) return "admin";
  if (path.startsWith("/auth/employee") || path.startsWith("/employee")) return "employee";
  return "customer";
}

function normaliseScope(scope) {
  if (scope === undefined || scope === null || scope === "") return null;
  const normalized = String(scope).toLowerCase();
  if (normalized === "public") return "none";
  if (normalized === "none" || AUTHENTICATED_SCOPES.has(normalized)) return normalized;
  throw new Error(`Unsupported API auth scope: ${scope}`);
}

function resolveRequestScope(path, options = {}) {
  const explicit = normaliseScope(options.scope);
  if (explicit) return explicit;
  if (options.skipAuth) return "none";
  return scopeForPath(path);
}

const tokenKeysFor = (scope) => TOKEN_KEYS[scope] ?? TOKEN_KEYS.customer;

// ---------------------------------------------------------------------------
// Token storage helpers (scope-aware)
// ---------------------------------------------------------------------------

export const getAccessToken = (scope = "customer") => {
  const activeScope = normaliseScope(scope) ?? "customer";
  if (PUBLIC_SCOPES.has(activeScope)) return null;
  try { return localStorage.getItem(tokenKeysFor(activeScope).ACCESS); }
  catch { return null; }
};

export const getRefreshToken = (scope = "customer") => {
  const activeScope = normaliseScope(scope) ?? "customer";
  if (PUBLIC_SCOPES.has(activeScope)) return null;
  try { return localStorage.getItem(tokenKeysFor(activeScope).REFRESH); }
  catch { return null; }
};

export const setTokens = ({ accessToken, refreshToken }, scope = "customer") => {
  const activeScope = normaliseScope(scope) ?? "customer";
  if (!AUTHENTICATED_SCOPES.has(activeScope)) return;
  const keys = tokenKeysFor(activeScope);
  try {
    if (accessToken)  localStorage.setItem(keys.ACCESS, accessToken);
    if (refreshToken) localStorage.setItem(keys.REFRESH, refreshToken);
  } catch { /* storage full — non-fatal */ }
};

export const clearTokens = (scope) => {
  const normalized = normaliseScope(scope);
  const scopes = normalized
    ? (AUTHENTICATED_SCOPES.has(normalized) ? [normalized] : [])
    : Object.keys(TOKEN_KEYS);
  try {
    scopes.forEach((s) => {
      const keys = tokenKeysFor(s);
      localStorage.removeItem(keys.ACCESS);
      localStorage.removeItem(keys.REFRESH);
    });
  } catch { /* ignore */ }
};

// Back-compat aliases used by legacy call sites
export const ADMIN_ACCESS_TOKEN_KEY = TOKEN_KEYS.admin.ACCESS;
export const ADMIN_REFRESH_TOKEN_KEY = TOKEN_KEYS.admin.REFRESH;
export const EMPLOYEE_ACCESS_TOKEN_KEY = TOKEN_KEYS.employee.ACCESS;
export const EMPLOYEE_REFRESH_TOKEN_KEY = TOKEN_KEYS.employee.REFRESH;

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name  = "ApiError";
    this.status = status;
    this.data   = data;
  }
}

function normaliseError(status, data) {
  // FastAPI validation errors
  if (status === 422 && Array.isArray(data?.detail)) {
    const first = data.detail[0];
    const field = first?.loc?.slice(1).join(".") ?? "field";
    return `${field}: ${first?.msg ?? "Invalid value"}`;
  }
  // Backend envelope { ok:false, error:{ code, message, details } }
  if (typeof data?.error?.message === "string") return data.error.message;
  if (typeof data?.error === "string") return data.error;
  // Our own error envelope  { detail: "..." } or { message: "..." }
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.message === "string") return data.message;
  // HTTP fallbacks
  const defaults = {
    400: "Bad request.",
    401: "Session expired. Please sign in again.",
    403: "You don't have permission to do that.",
    404: "Not found.",
    409: "A conflict occurred.",
    429: "Too many requests. Please wait a moment.",
    500: "Server error. Please try again shortly.",
  };
  return defaults[status] ?? `Request failed (${status})`;
}

// ---------------------------------------------------------------------------
// Refresh locks — isolated by authenticated scope
// ---------------------------------------------------------------------------

const refreshPromises = {
  customer: null,
  admin: null,
  employee: null,
};

async function doRefresh(scope) {
  if (!AUTHENTICATED_SCOPES.has(scope)) {
    throw new ApiError("Cannot refresh an unauthenticated request scope.", 401, null);
  }

  const refreshToken = getRefreshToken(scope);
  if (!refreshToken) throw new ApiError("No refresh token.", 401, null);

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    clearTokens(scope);
    throw new ApiError("Refresh failed.", 401, null);
  }

  const data = await res.json();
  setTokens({
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // backend rotates it
  }, scope);
  return data.access_token;
}

async function refreshOnce(scope) {
  if (!AUTHENTICATED_SCOPES.has(scope)) {
    throw new ApiError("Cannot refresh an unauthenticated request scope.", 401, null);
  }
  if (!refreshPromises[scope]) {
    refreshPromises[scope] = doRefresh(scope).finally(() => { refreshPromises[scope] = null; });
  }
  return refreshPromises[scope];
}

function emitSessionExpired(scope) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pf:session-expired", { detail: { scope } }));
  }
}

// ---------------------------------------------------------------------------
// Core request function
// ---------------------------------------------------------------------------

async function request(method, path, body, options = {}) {
  const {
    skipAuth = false,
    isRetry = false,
    headers: extraHeaders = {},
    // A pre-built request body (FormData for multipart uploads). When present
    // it is sent verbatim and NO Content-Type is set, so the browser can add
    // the correct `multipart/form-data; boundary=…` itself.
    rawBody,
  } = options;
  const activeScope = resolveRequestScope(path, options);
  const isPublic = skipAuth || PUBLIC_SCOPES.has(activeScope);

  const url = `${BASE_URL}${path}`;
  const headers = {
    ...(rawBody === undefined ? { "Content-Type": "application/json" } : {}),
    ...extraHeaders,
  };

  if (!isPublic) {
    const token = getAccessToken(activeScope);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const fetchOptions = {
    method,
    headers,
    ...(rawBody !== undefined
      ? { body: rawBody }
      : body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
  };

  let res;
  try {
    res = await fetch(url, fetchOptions);
  } catch (networkError) {
    throw new ApiError("Network error. Check your connection.", 0, null);
  }

  // Auto-refresh on 401 (one retry only), isolated to the active scope.
  if (res.status === 401 && !isRetry && !isPublic) {
    try {
      await refreshOnce(activeScope);
      return request(method, path, body, { ...options, isRetry: true, scope: activeScope });
    } catch {
      clearTokens(activeScope);
      emitSessionExpired(activeScope);
      throw new ApiError("Session expired. Please sign in again.", 401, null);
    }
  }

  // Parse response
  let data;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    throw new ApiError(normaliseError(res.status, data), res.status, data);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const apiClient = {
  get:    (path, opts)        => request("GET",    path, undefined, opts),
  post:   (path, body, opts)  => request("POST",   path, body, opts),
  patch:  (path, body, opts)  => request("PATCH",  path, body, opts),
  put:    (path, body, opts)  => request("PUT",    path, body, opts),
  delete: (path, opts)        => request("DELETE", path, undefined, opts),
  /**
   * Multipart upload. `formData` must be a FormData instance; the JSON
   * Content-Type is deliberately omitted so the browser sets the boundary.
   * Added in Phase 6 for media object uploads.
   */
  upload: (path, formData, opts) =>
    request("POST", path, undefined, { ...opts, rawBody: formData }),
};

export default apiClient;
