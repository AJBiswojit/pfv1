/**
 * PRATIKSHYA FASHON — Base API client.
 *
 * Single HTTP seam between the frontend and FastAPI backend.
 * Handles:
 *   - Base URL from VITE_API_BASE (defaults to /api/v1 via Vite proxy)
 *   - Authorization: Bearer <access_token> header injection
 *   - Automatic token refresh on 401 (one retry per request)
 *   - Token storage in localStorage (access) + memory (refresh)
 *   - Structured error normalisation → { ok: false, error: string, status: number }
 *
 * Usage:
 *   import { apiClient } from './apiClient'
 *   const data = await apiClient.post('/auth/customer/sign-in', { ... })
 *
 * Token contract:
 *   - Access token  → localStorage key "pf_access_token"
 *   - Refresh token → localStorage key "pf_refresh_token"
 *   These keys are deliberately different from the mock auth keys so both
 *   can coexist during staged rollout without interference.
 */

const BASE_URL = import.meta.env.VITE_API_BASE ?? "/api/v1";

export const TOKEN_KEYS = {
  ACCESS:  "pf_access_token",
  REFRESH: "pf_refresh_token",
};

// ---------------------------------------------------------------------------
// Token storage helpers
// ---------------------------------------------------------------------------

export const getAccessToken = () => {
  try { return localStorage.getItem(TOKEN_KEYS.ACCESS); }
  catch { return null; }
};

export const getRefreshToken = () => {
  try { return localStorage.getItem(TOKEN_KEYS.REFRESH); }
  catch { return null; }
};

export const setTokens = ({ accessToken, refreshToken }) => {
  try {
    if (accessToken)  localStorage.setItem(TOKEN_KEYS.ACCESS, accessToken);
    if (refreshToken) localStorage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
  } catch { /* storage full — non-fatal */ }
};

export const clearTokens = () => {
  try {
    localStorage.removeItem(TOKEN_KEYS.ACCESS);
    localStorage.removeItem(TOKEN_KEYS.REFRESH);
  } catch { /* ignore */ }
};

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
// Refresh lock — prevents multiple simultaneous refresh calls
// ---------------------------------------------------------------------------

let _refreshPromise = null;

async function doRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError("No refresh token.", 401, null);

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    clearTokens();
    throw new ApiError("Refresh failed.", 401, null);
  }

  const data = await res.json();
  setTokens({
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // backend rotates it
  });
  return data.access_token;
}

async function refreshOnce() {
  if (!_refreshPromise) {
    _refreshPromise = doRefresh().finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

// ---------------------------------------------------------------------------
// Core request function
// ---------------------------------------------------------------------------

async function request(method, path, body, options = {}) {
  const { skipAuth = false, isRetry = false, headers: extraHeaders = {} } = options;

  const url = `${BASE_URL}${path}`;
  const headers = { "Content-Type": "application/json", ...extraHeaders };

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const fetchOptions = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let res;
  try {
    res = await fetch(url, fetchOptions);
  } catch (networkError) {
    throw new ApiError("Network error. Check your connection.", 0, null);
  }

  // Auto-refresh on 401 (one retry only)
  if (res.status === 401 && !isRetry && !skipAuth) {
    try {
      await refreshOnce();
      return request(method, path, body, { ...options, isRetry: true });
    } catch {
      clearTokens();
      // Dispatch an event so auth contexts can react (sign out)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("pf:session-expired"));
      }
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
};

export default apiClient;
