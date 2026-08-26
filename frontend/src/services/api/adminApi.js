/**
 * PRATIKSHYA FASHON — Admin system APIs (roles, permissions, users, audit).
 *
 * Backend endpoints (implemented against existing RBAC / audit tables):
 *   GET /roles, GET /roles/{id}
 *   GET /permissions, GET /permissions/{code}
 *   GET /users, GET /users/{id}
 *   GET /audit/logs
 *   GET /analytics/overview | /sales | /products | /customers | /orders | /inventory-summary
 */

import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

// ---------------------------------------------------------------------------
// Roles / permissions (RBAC)
// ---------------------------------------------------------------------------

export async function apiListRoles() {
  try {
    const data = await apiClient.get("/roles");
    return { ok: true, roles: (data.items ?? data ?? []).map((r) => ({
      id: r.id, name: r.name, description: r.description, isSystem: Boolean(r.isSystem),
    })) };
  } catch (err) { return handleError(err); }
}

export async function apiGetRole(roleId) {
  try {
    const data = await apiClient.get(`/roles/${roleId}`);
    return { ok: true, role: data, permissionCodes: data.permissionCodes ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiListPermissions() {
  try {
    const data = await apiClient.get("/permissions");
    return { ok: true, permissions: data.items ?? data ?? [], categories: data.categories ?? [] };
  } catch (err) { return handleError(err); }
}

// ---------------------------------------------------------------------------
// Users directory
// ---------------------------------------------------------------------------

export async function apiAdminListUsers({ q, userType, status, page = 1, pageSize = 20 } = {}) {
  try {
    const qs = new URLSearchParams({ page, pageSize });
    if (q) qs.set("q", q);
    if (userType) qs.set("userType", userType);
    if (status) qs.set("status", status);
    const data = await apiClient.get(`/users?${qs}`);
    return {
      ok: true,
      items: data.items ?? data ?? [],
      total: data.total ?? (data.items ?? data ?? []).length,
    };
  } catch (err) { return handleError(err); }
}

export async function apiAdminGetUser(userId) {
  try {
    const data = await apiClient.get(`/users/${userId}`);
    return { ok: true, user: data };
  } catch (err) { return handleError(err); }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function apiListAuditLogs({ action, actor, targetProductId, targetEmployeeId, targetOrderId, q, page = 1, pageSize = 50 } = {}) {
  try {
    const qs = new URLSearchParams({ page, pageSize });
    if (action) qs.set("action", action);
    if (actor) qs.set("actor", actor);
    if (targetProductId) qs.set("targetProductId", targetProductId);
    if (targetEmployeeId) qs.set("targetEmployeeId", targetEmployeeId);
    if (targetOrderId) qs.set("targetOrderId", targetOrderId);
    if (q) qs.set("q", q);
    const data = await apiClient.get(`/audit/logs?${qs}`);
    return { ok: true, items: data.items ?? data ?? [], total: data.total ?? 0 };
  } catch (err) { return handleError(err); }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function apiAnalyticsOverview() {
  try {
    const data = await apiClient.get("/analytics/overview");
    return { ok: true, metrics: data };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsSales({ days = 30 } = {}) {
  try {
    const data = await apiClient.get(`/analytics/sales?days=${days}`);
    return { ok: true, series: data.series ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsTopProducts({ limit = 10 } = {}) {
  try {
    const data = await apiClient.get(`/analytics/products?limit=${limit}`);
    return { ok: true, items: data.items ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsTopCustomers({ limit = 10 } = {}) {
  try {
    const data = await apiClient.get(`/analytics/customers?limit=${limit}`);
    return { ok: true, items: data.items ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsOrders() {
  try {
    const data = await apiClient.get("/analytics/orders");
    return { ok: true, items: data.items ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsInventorySummary() {
  try {
    const data = await apiClient.get("/analytics/inventory-summary");
    return { ok: true, ...data };
  } catch (err) { return handleError(err); }
}
