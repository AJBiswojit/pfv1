/**
 * PRATIKSHYA FASHON — Admin dashboard reads (backend-driven).
 *
 * The dashboard is fed by ONE consolidated request:
 *
 *   GET /admin/dashboard/summary
 *     → metrics + sales series + revenue by category + recent orders
 *       + stock summary + employee head-counts
 *
 * All figures are bounded backend aggregates. There are no static demo
 * figures: if the fetch fails the dashboard shows an explicit error state.
 *
 * DB-load note (admin consolidation): this replaces the previous per-load
 * fan-out (GET /analytics/overview + /analytics/sales + /analytics/products
 * + /admin/employees?pageSize=100 TWICE + /admin/orders + inventory
 * summary). The employee list is no longer read to count people — the
 * summary returns two COUNTs instead.
 */

import { apiAdminDashboardSummary } from "../api/adminApi";

const zeroMetrics = () => ({
  todaysSales: 0,
  totalOrders: 0,
  customers: 0,
  pendingOrders: 0,
  returns: 0,
  employeesPresent: 0,
  totalEmployees: 0,
  lowStockCount: 0,
  productCount: 0,
  avgOrderValue: 0,
  revenue: 0,
});

/** The whole dashboard in one request. */
export async function loadDashboardSummary({ days = 7, recentLimit = 5 } = {}) {
  const result = await apiAdminDashboardSummary({ days, recentLimit });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "Could not load the dashboard.",
      metrics: zeroMetrics(),
      series: [],
      categories: [],
      orders: [],
      inventorySummary: null,
      employees: { total: 0, active: 0 },
    };
  }
  const metrics = {
    ...zeroMetrics(),
    ...(result.metrics ?? {}),
    totalEmployees: result.employees?.total ?? 0,
    employeesPresent: result.employees?.active ?? 0,
  };
  const series = (result.salesSeries ?? []).map((point) => ({
    date: point.date,
    sales: point.revenue,
    orders: point.orders,
  }));
  const categories = (result.categories ?? []).map((entry) => ({
    name: entry.name,
    revenue: entry.revenue,
  }));
  const orders = (result.recentOrders ?? []).map((order) => ({
    id: order.id,
    customer: order.customer?.fullName || order.shippingAddress?.fullName || "Guest",
    items: (order.items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
    amount: Number(order.total ?? order.pricing?.total ?? 0),
    status: order.status,
    placedAt: order.createdAt ?? order.created_at,
    isDemo: false,
  }));
  return {
    ok: true,
    metrics,
    series,
    categories,
    orders,
    inventorySummary: result.inventorySummary ?? null,
    employees: result.employees ?? { total: 0, active: 0 },
  };
}

/* ------------------------------------------------------------------ */
/* Legacy sync-read exports (kept for compatibility; return empty).     */
/* The dashboard page uses the async `loadDashboardSummary` above.      */
/* ------------------------------------------------------------------ */

export const getBusinessMetrics = () => zeroMetrics();
export const getMetricTrends = () => ({ todaysSales: "", totalOrders: "", customers: "", pendingOrders: "", returns: "", employeesPresent: "" });
export const getSalesSeries = () => [];
export const getSalesByCategory = () => [];
export const getSalesSummary = () => ({ total: 0, orders: 0, average: 0, averageTicket: 0, peak: null });
export const getDepartmentPerformance = () => [];
export const getTopDepartments = () => [];
export const getRecentOrders = () => [];

export default {
  loadDashboardSummary,
  getBusinessMetrics,
  getMetricTrends,
  getSalesSeries,
  getSalesByCategory,
  getSalesSummary,
  getDepartmentPerformance,
  getTopDepartments,
  getRecentOrders,
};
