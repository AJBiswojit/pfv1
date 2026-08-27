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

import { apiClient, ApiError, handleError } from "./apiClient";

// ---------------------------------------------------------------------------
// Roles / permissions (RBAC)
// ---------------------------------------------------------------------------

export async function apiListRoles() {
  try {
    const data = await apiClient.get("/roles", { scope: "admin" });
    return { ok: true, roles: (data.items ?? data ?? []).map((r) => ({
      id: r.id, name: r.name, description: r.description, isSystem: Boolean(r.isSystem),
    })) };
  } catch (err) { return handleError(err); }
}

export async function apiGetRole(roleId) {
  try {
    const data = await apiClient.get(`/roles/${roleId}`, { scope: "admin" });
    return { ok: true, role: data, permissionCodes: data.permissionCodes ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiListPermissions() {
  try {
    const data = await apiClient.get("/permissions", { scope: "admin" });
    return { ok: true, permissions: data.items ?? data ?? [], categories: data.categories ?? [] };
  } catch (err) { return handleError(err); }
}

// ---------------------------------------------------------------------------
// Users directory
// ---------------------------------------------------------------------------

export async function apiAdminListUsers({ q, userType, status, page = 1, pageSize = 20 } = {}) {
  try {
    const qs = new URLSearchParams({ page, page_size: pageSize });
    if (q) qs.set("q", q);
    if (userType) qs.set("user_type", userType);
    if (status) qs.set("status", status);
    const data = await apiClient.get(`/users?${qs}`, { scope: "admin" });
    return {
      ok: true,
      items: data.items ?? data ?? [],
      total: data.total ?? (data.items ?? data ?? []).length,
    };
  } catch (err) { return handleError(err); }
}

export async function apiAdminGetUser(userId) {
  try {
    const data = await apiClient.get(`/users/${userId}`, { scope: "admin" });
    return { ok: true, user: data };
  } catch (err) { return handleError(err); }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export async function apiListAuditLogs({ action, actor, targetProductId, targetEmployeeId, targetOrderId, q, page = 1, pageSize = 50 } = {}) {
  try {
    const qs = new URLSearchParams({ page, page_size: pageSize });
    if (action) qs.set("action", action);
    if (actor) qs.set("actor", actor);
    if (targetProductId) qs.set("target_product_id", targetProductId);
    if (targetEmployeeId) qs.set("target_employee_id", targetEmployeeId);
    if (targetOrderId) qs.set("target_order_id", targetOrderId);
    if (q) qs.set("q", q);
    const data = await apiClient.get(`/audit/logs?${qs}`, { scope: "admin" });
    return { ok: true, items: data.items ?? data ?? [], total: data.total ?? 0 };
  } catch (err) { return handleError(err); }
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function apiAnalyticsOverview() {
  try {
    const data = await apiClient.get("/analytics/overview", { scope: "admin" });
    return { ok: true, metrics: data };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsSales({ days = 30 } = {}) {
  try {
    const data = await apiClient.get(`/analytics/sales?days=${days}`, { scope: "admin" });
    return { ok: true, series: data.series ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsTopProducts({ limit = 10 } = {}) {
  try {
    const data = await apiClient.get(`/analytics/products?limit=${limit}`, { scope: "admin" });
    return { ok: true, items: data.items ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsTopCustomers({ limit = 10 } = {}) {
  try {
    const data = await apiClient.get(`/analytics/customers?limit=${limit}`, { scope: "admin" });
    return { ok: true, items: data.items ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsOrders() {
  try {
    const data = await apiClient.get("/analytics/orders", { scope: "admin" });
    return { ok: true, items: data.items ?? [] };
  } catch (err) { return handleError(err); }
}

export async function apiAnalyticsInventorySummary() {
  try {
    const data = await apiClient.get("/analytics/inventory-summary", { scope: "admin" });
    return { ok: true, ...data };
  } catch (err) { return handleError(err); }
}
