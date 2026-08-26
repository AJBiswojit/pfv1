/**
 * PRATIKSHYA FASHON — Admin dashboard reads (backend-driven).
 *
 * Business figures come from the backend analytics/orders endpoints:
 *   GET /analytics/overview | /sales | /products | /customers | /orders
 *   GET /admin/orders
 *   GET /admin/employees
 * There are no static demo figures: if a fetch fails the caller shows
 * loading/error/empty states.
 */

import {
  apiAnalyticsOverview,
  apiAnalyticsSales,
  apiAnalyticsTopProducts,
  apiAnalyticsOrders,
} from "../api/adminApi";
import { apiAdminListOrders } from "../api/ordersApi";
import { apiAdminListEmployees } from "../api/employeesApi";
import { EMPLOYEE_STATUS } from "../../config/employeeStatus";

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

/** Headline metrics from GET /analytics/overview (+ employee directory). */
export async function loadBusinessMetrics() {
  const [overview, employeesResult] = await Promise.all([
    apiAnalyticsOverview(),
    apiAdminListEmployees({ pageSize: 100 }),
  ]);
  if (!overview.ok) {
    return { ok: false, error: overview.error, metrics: zeroMetrics() };
  }
  const metrics = { ...zeroMetrics(), ...overview.metrics };
  if (employeesResult.ok) {
    metrics.totalEmployees = (employeesResult.items ?? []).length;
    metrics.employeesPresent = (employeesResult.items ?? []).filter(
      (person) => person.status === EMPLOYEE_STATUS.ACTIVE
    ).length;
  }
  return { ok: true, metrics };
}

/** Sales series from GET /analytics/sales. */
export async function loadSalesSeries(days = 30) {
  const result = await apiAnalyticsSales({ days });
  if (!result.ok) return { ok: false, error: result.error, series: [] };
  const series = result.series.map((point) => ({
    date: point.date,
    sales: point.revenue,
    orders: point.orders,
  }));
  return { ok: true, series };
}

/** Category breakdown, derived from top products. */
export async function loadSalesByCategory() {
  const result = await apiAnalyticsTopProducts({ limit: 100 });
  if (!result.ok) return { ok: false, error: result.error, categories: [] };
  const map = new Map();
  result.items.forEach((item) => {
    const key = item.productId?.split("-")[0] || "Other";
    map.set(key, (map.get(key) ?? 0) + item.revenue);
  });
  return {
    ok: true,
    categories: [...map.entries()].map(([name, revenue]) => ({ name, revenue })),
  };
}

/** Order-status breakdown from GET /analytics/orders. */
export async function loadOrderStatusBreakdown() {
  const result = await apiAnalyticsOrders();
  if (!result.ok) return { ok: false, error: result.error, items: [] };
  return { ok: true, items: result.items };
}

/** Recent orders from GET /admin/orders (server data only, no demo rows). */
export async function loadRecentOrders(limit = 5) {
  const result = await apiAdminListOrders({ pageSize: limit });
  if (!result.ok) return { ok: false, error: result.error, orders: [] };
  const orders = (result.orders ?? []).map((order) => ({
    id: order.id,
    customer: order.customer?.fullName || order.shippingAddress?.fullName || "Guest",
    items: (order.items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
    amount: Number(order.total ?? order.pricing?.total ?? 0),
    status: order.status,
    placedAt: order.createdAt,
    isDemo: false,
  }));
  return { ok: true, orders };
}

/* ------------------------------------------------------------------ */
/* Legacy sync-read exports (kept for compatibility; return empty).     */
/* The dashboard page now uses the async `load*` functions above.       */
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
  loadBusinessMetrics,
  loadSalesSeries,
  loadSalesByCategory,
  loadOrderStatusBreakdown,
  loadRecentOrders,
  getBusinessMetrics,
  getMetricTrends,
  getSalesSeries,
  getSalesByCategory,
  getSalesSummary,
  getDepartmentPerformance,
  getTopDepartments,
  getRecentOrders,
};
