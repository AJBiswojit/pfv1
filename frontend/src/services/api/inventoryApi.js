/**
 * PRATIKSHYA FASHION — Inventory API
 *
 * Real implementations backed by:
 *   /admin/inventory/stock          (GET, POST adjust)
 *   /admin/inventory/movements      (GET)
 *   /admin/inventory/low-stock      (GET)
 *   /admin/warehouses               (GET, POST, PATCH)
 *   /admin/stock-transfers          (GET, POST, POST complete/cancel)
 *
 * All admin calls use { scope: "admin" }.
 * Employee portal calls use { scope: "employee" } where the backend
 * exposes employee-scoped routes; for now all inventory management
 * endpoints are admin-only so both portals call the admin routes
 * (employees reach them through their own RBAC grants).
 */

import { apiClient, handleError } from "./apiClient";

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

/**
 * GET /admin/inventory/stock
 * Filters: warehouseId, lowStock, sku, page, pageSize
 */
export async function apiListStock({
  warehouseId,
  lowStock,
  sku,
  page = 1,
  pageSize = 20,
} = {}) {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (warehouseId) params.set("warehouseId", warehouseId);
    if (lowStock)    params.set("lowStock", "true");
    if (sku)         params.set("sku", sku);
    const data = await apiClient.get(`/admin/inventory/stock?${params}`, { scope: "admin" });
    return {
      ok: true,
      items: data.items ?? [],
      total: data.total ?? 0,
      page: data.page ?? page,
      pageSize: data.page_size ?? pageSize,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /admin/inventory/stock/{id}
 */
export async function apiGetStockItem(stockId) {
  try {
    const data = await apiClient.get(`/admin/inventory/stock/${stockId}`, { scope: "admin" });
    return { ok: true, item: data.item ?? data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /admin/inventory/stock
 * Body: { productId, sku, variantId?, warehouseId?, onHand?, lowThreshold? }
 * Idempotent — returns existing record if one already exists for the combo.
 */
export async function apiCreateStock({
  productId,
  sku,
  variantId,
  warehouseId,
  onHand = 0,
  lowThreshold = 5,
} = {}) {
  try {
    const data = await apiClient.post(
      "/admin/inventory/stock",
      { productId, sku, variantId, warehouseId, onHand, lowThreshold },
      { scope: "admin" },
    );
    return { ok: true, item: data.item ?? data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /admin/inventory/stock/adjust
 * Body: { stockId, delta, type, reason? }
 */
export async function apiAdjustStock({ stockId, delta, type = "ADJUST", reason } = {}) {
  try {
    const data = await apiClient.post(
      "/admin/inventory/stock/adjust",
      { stockId, delta, type, reason },
      { scope: "admin" },
    );
    return { ok: true, item: data.item ?? data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /admin/inventory/movements
 * Filters: stockId, type, dateFrom, dateTo, page, pageSize
 */
export async function apiListMovements({
  stockId,
  type,
  dateFrom,
  dateTo,
  page = 1,
  pageSize = 20,
} = {}) {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (stockId)  params.set("stockId", stockId);
    if (type)     params.set("type", type);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo)   params.set("dateTo", dateTo);
    const data = await apiClient.get(`/admin/inventory/movements?${params}`, { scope: "admin" });
    return {
      ok: true,
      movements: data.movements ?? [],
      total: data.total ?? 0,
      page: data.page ?? page,
      pageSize: data.page_size ?? pageSize,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /admin/inventory/low-stock
 * Filters: warehouseId, page, pageSize
 */
export async function apiListLowStock({ warehouseId, page = 1, pageSize = 20 } = {}) {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (warehouseId) params.set("warehouseId", warehouseId);
    const data = await apiClient.get(`/admin/inventory/low-stock?${params}`, { scope: "admin" });
    return {
      ok: true,
      items: data.items ?? [],
      total: data.total ?? 0,
      page: data.page ?? page,
      pageSize: data.page_size ?? pageSize,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * Reservations — not yet exposed as a standalone admin endpoint.
 * Returns empty result so callers degrade gracefully.
 */
export async function apiListReservations({ stockId, page = 1, pageSize = 20 } = {}) {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (stockId) params.set("stockId", stockId);
    // Endpoint not yet implemented — will 404 and fall through to handleError
    const data = await apiClient.get(`/admin/inventory/reservations?${params}`, { scope: "admin" });
    return { ok: true, reservations: data.reservations ?? [], total: data.total ?? 0 };
  } catch (err) {
    // Degrade gracefully: reservations are informational, not blocking
    return { ok: true, reservations: [], total: 0, _degraded: true };
  }
}

// ---------------------------------------------------------------------------
// Warehouses
// ---------------------------------------------------------------------------

/**
 * GET /admin/warehouses
 * Filters: includeInactive, page, pageSize
 */
export async function apiListWarehouses({
  includeInactive = false,
  page = 1,
  pageSize = 50,
} = {}) {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (includeInactive) params.set("includeInactive", "true");
    const data = await apiClient.get(`/admin/warehouses?${params}`, { scope: "admin" });
    return {
      ok: true,
      warehouses: data.warehouses ?? [],
      total: data.total ?? 0,
      page: data.page ?? page,
      pageSize: data.page_size ?? pageSize,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /admin/warehouses
 * Body: { name, code, address?, type? }
 */
export async function apiCreateWarehouse({ name, code, address, type = "WAREHOUSE" } = {}) {
  try {
    const data = await apiClient.post(
      "/admin/warehouses",
      { name, code, address, type },
      { scope: "admin" },
    );
    return { ok: true, warehouse: data.warehouse ?? data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /admin/warehouses/{id}
 * Body: { name?, address?, is_active? }
 */
export async function apiUpdateWarehouse(warehouseId, updates = {}) {
  try {
    const data = await apiClient.patch(
      `/admin/warehouses/${warehouseId}`,
      updates,
      { scope: "admin" },
    );
    return { ok: true, warehouse: data.warehouse ?? data };
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Stock transfers
// ---------------------------------------------------------------------------

/**
 * GET /admin/stock-transfers
 * Filters: status, fromWarehouseId, toWarehouseId, page, pageSize
 */
export async function apiListTransfers({
  status,
  fromWarehouseId,
  toWarehouseId,
  page = 1,
  pageSize = 20,
} = {}) {
  try {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status)           params.set("status", status);
    if (fromWarehouseId)  params.set("fromWarehouseId", fromWarehouseId);
    if (toWarehouseId)    params.set("toWarehouseId", toWarehouseId);
    const data = await apiClient.get(`/admin/stock-transfers?${params}`, { scope: "admin" });
    return {
      ok: true,
      transfers: data.transfers ?? [],
      total: data.total ?? 0,
      page: data.page ?? page,
      pageSize: data.page_size ?? pageSize,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /admin/stock-transfers
 * Body: { fromWarehouseId, toWarehouseId, lines: [{ sku?, stockId?, quantity }], notes? }
 */
export async function apiCreateTransfer({
  fromWarehouseId,
  toWarehouseId,
  lines = [],
  notes,
} = {}) {
  try {
    const data = await apiClient.post(
      "/admin/stock-transfers",
      { fromWarehouseId, toWarehouseId, lines, notes },
      { scope: "admin" },
    );
    return { ok: true, transfer: data.transfer ?? data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /admin/stock-transfers/{id}/complete
 */
export async function apiCompleteTransfer(transferId) {
  try {
    const data = await apiClient.post(
      `/admin/stock-transfers/${transferId}/complete`,
      {},
      { scope: "admin" },
    );
    return { ok: true, transfer: data.transfer ?? data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /admin/stock-transfers/{id}/cancel
 */
export async function apiCancelTransfer(transferId) {
  try {
    const data = await apiClient.post(
      `/admin/stock-transfers/${transferId}/cancel`,
      {},
      { scope: "admin" },
    );
    return { ok: true, transfer: data.transfer ?? data };
  } catch (err) {
    return handleError(err);
  }
}
