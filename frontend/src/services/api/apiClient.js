/**
 * PRATIKSHYA FASHON — Base API client (Phase 1 Foundation).
 *
 * Single HTTP seam between the frontend and FastAPI backend.
 * Handles:
 *   - Base URL from VITE_API_BASE (defaults to /api/v1 via Vite proxy)
 *   - Explicit Authorization token scoping (customer / admin / employee / none)
 *   - Strict scope resolution (no URL-prefix guessing; unscoped calls fail loudly)
 *   - JSON requests plus multipart uploads (apiClient.upload)
 *   - Atomic, per-surface token refresh on 401 (one retry per request)
 *   - Scope-isolated token storage and refresh isolation
 *   - Canonical error normalisation preserving 422 validation details & HTTP status
 *   - Clear distinction between network failures and HTTP responses
 *
 * Usage:
 *   import { apiClient, handleError } from './apiClient'
 *   const data = await apiClient.get('/analytics/overview', { scope: 'admin' })
 *   const publicData = await apiClient.get('/products', { scope: 'none' })
 *
 * Token contract:
 *   - Customer → "pf_access_token" / "pf_refresh_token"
 *   - Admin    → "pf_admin_access_token" / "pf_admin_refresh_token"
 *   - Employee → "pf_employee_access_token" / "pf_employee_refresh_token"
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
// Error normalisation & ApiError class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    message,
    status = 0,
    data = null,
    code = null,
    details = null,
    isNetworkError = false
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.code =
      code ||
      (status === 0
        ? isNetworkError
          ? "NETWORK_ERROR"
          : "CLIENT_ERROR"
        : `HTTP_${status}`);
    this.details = details;
    this.isNetworkError = isNetworkError;
  }
}

export function normaliseError(status, data) {
  let message = "";
  let code = data?.error?.code ?? (status === 0 ? "NETWORK_ERROR" : `HTTP_${status}`);
  let details = data?.error?.details ?? data?.detail ?? null;

  // 1. FastAPI / Pydantic validation errors (HTTP 422)
  if (status === 422) {
    code = data?.error?.code ?? "VALIDATION_ERROR";
    const rawDetails = data?.error?.details ?? data?.detail;
    if (Array.isArray(rawDetails) && rawDetails.length > 0) {
      details = rawDetails;
      const first = rawDetails[0];
      const field = first?.loc ? first.loc.slice(1).join(".") : "field";
      message = `${field}: ${first?.msg ?? "Invalid value"}`;
    } else if (typeof data?.error?.message === "string") {
      message = data.error.message;
    } else if (typeof data?.error === "string") {
      message = data.error;
    } else if (typeof data?.detail === "string") {
      message = data.detail;
    } else if (typeof data?.message === "string") {
      message = data.message;
    } else {
      message = "Validation error. Please check your input.";
    }
    return { message, code, details };
  }

  // 2. Canonical backend envelope: { success: false, error: { code, message, details } }
  if (typeof data?.error?.message === "string") {
    message = data.error.message;
  } else if (typeof data?.error === "string") {
    message = data.error;
  } else if (typeof data?.detail === "string") {
    message = data.detail;
  } else if (typeof data?.message === "string") {
    message = data.message;
  } else {
    // 3. HTTP status fallback defaults
    const defaults = {
      400: "Bad request.",
      401: "Session expired. Please sign in again.",
      403: "You do not have permission to do that.",
      404: "Requested resource was not found.",
      409: "A resource conflict occurred.",
      422: "Validation error. Please check your input.",
      429: "Too many requests. Please wait a moment.",
      500: "Internal server error. Please try again shortly.",
      502: "Bad gateway. The service is temporarily unavailable.",
      503: "Service temporarily unavailable. Please try again later.",
      504: "Gateway timeout. The server took too long to respond.",
    };
    message = defaults[status] ?? `Request failed with status ${status}.`;
  }

  return { message, code, details };
}

/**
 * Shared canonical error handler for all API service modules.
 * Standardizes the failure shape across the entire application while preserving
 * backwards-compatible `ok: false` and `error: string` fields.
 */
export function handleError(err, fallbackMessage) {
  if (err instanceof ApiError) {
    return {
      ok: false,
      error: err.message || fallbackMessage || "An unexpected error occurred.",
      status: err.status,
      code: err.code,
      details: err.details,
      data: err.data,
      isNetworkError: Boolean(err.isNetworkError),
    };
  }
  return {
    ok: false,
    error: err?.message || fallbackMessage || "An unexpected error occurred.",
    status: 0,
    code: "UNKNOWN_ERROR",
    details: null,
    data: null,
    isNetworkError: false,
  };
}

// ---------------------------------------------------------------------------
// Strict scope resolution (no URL-prefix guessing)
// ---------------------------------------------------------------------------

export function normaliseScope(scope) {
  if (scope === undefined || scope === null || scope === "") return null;
  const normalized = String(scope).trim().toLowerCase();
  if (normalized === "public") return "none";
  if (normalized === "none" || AUTHENTICATED_SCOPES.has(normalized)) return normalized;
  return "INVALID";
}

export function resolveRequestScope(path, options = {}) {
  const rawScope = options.scope ?? (options.skipAuth ? "none" : null);
  if (rawScope === undefined || rawScope === null || rawScope === "") {
    throw new ApiError(
      `Explicit auth scope is required for API call to '${path}'. Must be 'customer', 'admin', 'employee', or 'none'.`,
      0,
      null,
      "INVALID_SCOPE",
      null,
      false
    );
  }

  const normalized = normaliseScope(rawScope);
  if (normalized === "INVALID" || !normalized) {
    throw new ApiError(
      `Unsupported API auth scope: '${rawScope}' for '${path}'. Expected 'customer', 'admin', 'employee', or 'none'.`,
      0,
      null,
      "INVALID_SCOPE",
      null,
      false
    );
  }

  return normalized;
}

const tokenKeysFor = (scope) => TOKEN_KEYS[scope] ?? null;

// ---------------------------------------------------------------------------
// Token storage helpers (scope-aware)
// ---------------------------------------------------------------------------

export const getAccessToken = (scope) => {
  const activeScope = normaliseScope(scope);
  if (!activeScope || PUBLIC_SCOPES.has(activeScope)) return null;
  const keys = tokenKeysFor(activeScope);
  if (!keys) return null;
  try {
    return localStorage.getItem(keys.ACCESS);
  } catch {
    return null;
  }
};

export const getRefreshToken = (scope) => {
  const activeScope = normaliseScope(scope);
  if (!activeScope || PUBLIC_SCOPES.has(activeScope)) return null;
  const keys = tokenKeysFor(activeScope);
  if (!keys) return null;
  try {
    return localStorage.getItem(keys.REFRESH);
  } catch {
    return null;
  }
};

export const setTokens = ({ accessToken, refreshToken }, scope) => {
  const activeScope = normaliseScope(scope);
  if (!activeScope || !AUTHENTICATED_SCOPES.has(activeScope)) return;
  const keys = tokenKeysFor(activeScope);
  if (!keys) return;
  try {
    if (accessToken) localStorage.setItem(keys.ACCESS, accessToken);
    if (refreshToken) localStorage.setItem(keys.REFRESH, refreshToken);
  } catch {
    /* storage full — non-fatal */
  }
};

export const clearTokens = (scope) => {
  const normalized = normaliseScope(scope);
  const scopes = normalized && AUTHENTICATED_SCOPES.has(normalized)
    ? [normalized]
    : Object.keys(TOKEN_KEYS);
  try {
    scopes.forEach((s) => {
      const keys = tokenKeysFor(s);
      if (keys) {
        localStorage.removeItem(keys.ACCESS);
        localStorage.removeItem(keys.REFRESH);
      }
    });
  } catch {
    /* ignore */
  }
};

// Back-compat aliases used by legacy call sites
export const ADMIN_ACCESS_TOKEN_KEY = TOKEN_KEYS.admin.ACCESS;
export const ADMIN_REFRESH_TOKEN_KEY = TOKEN_KEYS.admin.REFRESH;
export const EMPLOYEE_ACCESS_TOKEN_KEY = TOKEN_KEYS.employee.ACCESS;
export const EMPLOYEE_REFRESH_TOKEN_KEY = TOKEN_KEYS.employee.REFRESH;

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
    throw new ApiError(
      "Cannot refresh an unauthenticated request scope.",
      401,
      null,
      "UNAUTHORIZED",
      null,
      false
    );
  }

  const refreshToken = getRefreshToken(scope);
  if (!refreshToken) {
    throw new ApiError(
      "No refresh token available.",
      401,
      null,
      "UNAUTHORIZED",
      null,
      false
    );
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    throw new ApiError(
      "Network error during token refresh.",
      0,
      null,
      "NETWORK_ERROR",
      null,
      true
    );
  }

  if (!res.ok) {
    clearTokens(scope);
    throw new ApiError(
      "Session refresh failed.",
      401,
      null,
      "UNAUTHORIZED",
      null,
      false
    );
  }

  const data = await res.json();
  setTokens(
    {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
    },
    scope
  );
  return data.access_token;
}

async function refreshOnce(scope) {
  if (!AUTHENTICATED_SCOPES.has(scope)) {
    throw new ApiError(
      "Cannot refresh an unauthenticated request scope.",
      401,
      null,
      "UNAUTHORIZED",
      null,
      false
    );
  }
  if (!refreshPromises[scope]) {
    refreshPromises[scope] = doRefresh(scope).finally(() => {
      refreshPromises[scope] = null;
    });
  }
  return refreshPromises[scope];
}

function emitSessionExpired(scope) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("pf:session-expired", { detail: { scope } })
    );
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
    throw new ApiError(
      "Network error. Check your connection.",
      0,
      null,
      "NETWORK_ERROR",
      null,
      true
    );
  }

  // Auto-refresh on 401 (one retry only), isolated strictly to the active scope.
  if (res.status === 401 && !isRetry && !isPublic) {
    try {
      await refreshOnce(activeScope);
      return request(method, path, body, {
        ...options,
        isRetry: true,
        scope: activeScope,
      });
    } catch (refreshErr) {
      if (refreshErr?.isNetworkError) {
        throw refreshErr;
      }
      clearTokens(activeScope);
      emitSessionExpired(activeScope);
      throw new ApiError(
        "Session expired. Please sign in again.",
        401,
        null,
        "UNAUTHORIZED",
        null,
        false
      );
    }
  }

  // Parse response
  let data;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const { message, code, details } = normaliseError(res.status, data);
    throw new ApiError(message, res.status, data, code, details, false);
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
  upload: (path, formData, opts) =>
    request("POST", path, undefined, { ...opts, rawBody: formData }),
};

export default apiClient;
