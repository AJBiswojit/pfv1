import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  IndianRupee,
  PackageX,
  RotateCcw,
  ShoppingBag,
  Timer,
  Users,
} from "lucide-react";
import { AtelierButton, EmptyState } from "../../design-system";
import AdminPage from "../../components/admin/AdminPage";
import AdminPanel from "../../components/admin/AdminPanel";
import AdminMetricCard from "../../components/admin/AdminMetricCard";
import SalesOverviewChart from "../../components/admin/SalesOverviewChart";
import CategorySalesBars from "../../components/admin/CategorySalesBars";
import DataTable from "../../components/employee/DataTable";
import OrderStatusBadge from "../../components/orders/OrderStatusBadge";
import { useAdminAuth } from "../../context/AdminAuthContext";
import {
  loadBusinessMetrics,
  loadRecentOrders,
  loadSalesByCategory,
  loadSalesSeries,
} from "../../services/admin/adminDashboardService";
import { apiAnalyticsInventorySummary } from "../../services/api/adminApi";
import { adminFirstName, formatAdminNumber, formatCompactINR, greetingForAdmin } from "../../utils/admin";
import { formatINR } from "../../utils/shopping";
import { PRODUCTS_CHANGED_EVENT } from "../../services/catalogRepository";

const EMPTY_METRICS = {
  todaysSales: 0, totalOrders: 0, customers: 0, pendingOrders: 0, returns: 0,
  employeesPresent: 0, totalEmployees: 0, lowStockCount: 0, productCount: 0,
  avgOrderValue: 0, revenue: 0,
};

/**
 * BUSINESS OVERVIEW — the Admin Portal's front page.
 *
 * Every figure is read from the backend (analytics, orders, inventory
 * summary). No static demo figures: failed loads show an explicit
 * error/empty state.
 */
export default function AdminDashboard() {
  const { admin } = useAdminAuth();

  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [series, setSeries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inventorySummary, setInventorySummary] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    Promise.all([
      loadBusinessMetrics(),
      loadSalesSeries(7),
      loadSalesByCategory(),
      loadRecentOrders(5),
      apiAnalyticsInventorySummary(),
    ]).then(([m, s, c, o, inv]) => {
      if (cancelled) return;
      if (!m.ok && !s.ok && !c.ok && !o.ok && !inv.ok) {
        setError([m.error, s.error, c.error, o.error, inv.error].find(Boolean) ?? "Could not load the dashboard.");
      }
      if (m.ok) setMetrics(m.metrics);
      if (s.ok) setSeries(s.series);
      if (c.ok) setCategories(c.categories);
      if (o.ok) setOrders(o.orders);
      if (inv.ok) setInventorySummary(inv);
      setStatus("ready");
    });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    const refresh = () => setAttempt((a) => a + 1);
    window.addEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PRODUCTS_CHANGED_EVENT, refresh);
  }, []);

  const summary = useMemo(() => {
    const total = series.reduce((sum, p) => sum + p.sales, 0);
    const count = series.reduce((sum, p) => sum + p.orders, 0);
    const peak = series.reduce((best, p) => (p.sales > (best?.sales ?? -1) ? p : best), null);
    return {
      total,
      orders: count,
      average: Math.round(total / (series.length || 1)),
      averageTicket: count ? Math.round(total / count) : 0,
      peak,
    };
  }, [series]);

  if (status === "loading") {
    return (
      <AdminPage
        eyebrow="Business overview"
        title={<>Loading your <span className="italic text-accent">atlier.</span></>}
        description="Fetching live figures from the backend."
      >
        <EmptyState eyebrow="One moment" title="Loading the dashboard" description="We are pulling the latest numbers from the server." />
      </AdminPage>
    );
  }

  const alerts = (inventorySummary?.items ?? []).slice(0, 6);

  const tiles = [
    { label: "Revenue", value: formatCompactINR(metrics.revenue), hint: "Lifetime, backend-verified", icon: IndianRupee },
    { label: "Total orders", value: formatAdminNumber(metrics.orderCount ?? metrics.totalOrders), hint: "Backend order ledger", icon: ShoppingBag },
    { label: "Customers", value: formatAdminNumber(metrics.customerCount ?? metrics.customers), hint: "Registered accounts", icon: Users },
    { label: "Products", value: formatAdminNumber(metrics.productCount), hint: "Catalogue records", icon: Boxes },
    { label: "Low stock", value: formatAdminNumber(metrics.lowStockCount), hint: "Product stock fields", icon: AlertTriangle, tone: metrics.lowStockCount ? "alert" : undefined },
    { label: "Out of stock", value: formatAdminNumber(metrics.outOfStockCount ?? 0), hint: "Product stock fields", icon: PackageX, tone: metrics.outOfStockCount ? "alert" : undefined },
    { label: "Pending review", value: formatAdminNumber(metrics.pendingReviewCount ?? 0), hint: "Products awaiting review", icon: Timer },
    { label: "Cancelled orders", value: formatAdminNumber(metrics.cancelledCount ?? 0), hint: "Cancellation ledger", icon: RotateCcw },
    { label: "Average order", value: formatINR(metrics.avgOrderValue), hint: "Revenue ÷ orders", icon: ShoppingBag },
  ];

  return (
    <AdminPage
      eyebrow="Business overview"
      title={<>{greetingForAdmin()}, <span className="italic text-accent">{adminFirstName(admin)}.</span></>}
      description="Your PRATIKSHYA FASHON operation at a glance."
      actions={
        <>
          {error ? (
            <AtelierButton onClick={() => setAttempt((a) => a + 1)} size="chip" variant="outline">
              Retry
            </AtelierButton>
          ) : null}
          <AtelierButton as={Link} to="/admin/analytics" size="chip">View analytics</AtelierButton>
          <AtelierButton as={Link} to="/admin/products" size="chip" variant="outline">Manage products</AtelierButton>
        </>
      }
    >
      {error ? (
        <EmptyState
          eyebrow="Live data unavailable"
          title="Some dashboard figures could not be loaded"
          description={error}
          className="mb-8"
          actions={<AtelierButton onClick={() => setAttempt((a) => a + 1)} variant="primary" size="md">Try again</AtelierButton>}
        />
      ) : null}

      <section aria-label="Business metrics" className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <AdminMetricCard key={tile.label} {...tile} />
        ))}
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <AdminPanel
          eyebrow="Last 7 days"
          title="Sales overview"
          action={
            <p className="font-ui text-[11px] text-taupe">
              {formatINR(summary.total)} · {formatAdminNumber(summary.orders)} orders
            </p>
          }
        >
          <SalesOverviewChart series={series} />
          <dl className="mt-6 grid gap-4 border-t border-mist/70 pt-5 sm:grid-cols-3">
            <div>
              <dt className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">Daily average</dt>
              <dd className="mt-1 font-display text-xl font-light text-ink">{formatINR(summary.average)}</dd>
            </div>
            <div>
              <dt className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">Average ticket</dt>
              <dd className="mt-1 font-display text-xl font-light text-ink">{formatINR(summary.averageTicket)}</dd>
            </div>
            <div>
              <dt className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">Best day</dt>
              <dd className="mt-1 font-display text-xl font-light text-ink">
                {summary.peak ? `${summary.peak.date} · ${formatCompactINR(summary.peak.sales)}` : "—"}
              </dd>
            </div>
          </dl>
        </AdminPanel>

        <AdminPanel eyebrow="By activity" title="Where it sold">
          <CategorySalesBars categories={categories} />
          <p className="mt-5 font-ui text-[11px] text-taupe">
            Grouped from backend order line items.
          </p>
        </AdminPanel>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <AdminPanel
          eyebrow="Sales"
          title="Recent orders"
          bodyClassName="px-0 py-0 sm:px-0"
          action={
            <AtelierButton as={Link} to="/admin/orders" variant="outline" size="chip">
              All orders
            </AtelierButton>
          }
        >
          <DataTable
            className="border-0"
            rows={orders}
            rowKey="id"
            columns={[
              { id: "id", label: "Order" },
              { id: "customer", label: "Customer" },
              {
                id: "items",
                label: "Items",
                render: (row) => `${row.items} piece${row.items === 1 ? "" : "s"}`,
              },
              { id: "amount", label: "Amount", render: (row) => formatINR(row.amount) },
              { id: "status", label: "Status", render: (row) => <OrderStatusBadge status={row.status} /> },
              {
                id: "actions",
                label: "Actions",
                render: (row) => (
                  <Link to={`/admin/orders/${row.id}`} className="font-ui text-brass hover:text-accent">
                    View order
                  </Link>
                ),
              },
            ]}
            empty="No orders have been placed yet."
          />
          <p className="px-5 py-4 font-ui text-[11px] text-taupe sm:px-6">
            Reader: backend order ledger through GET /admin/orders.
          </p>
        </AdminPanel>

        <AdminPanel
          eyebrow="Inventory"
          title="Stock alerts"
          action={
            <span className="font-ui text-[11px] text-taupe">
              {metrics.lowStockCount} low · {metrics.outOfStockCount ?? 0} out
            </span>
          }
        >
          {alerts.length === 0 ? (
            <p className="font-ui text-[11px] text-taupe">
              {inventorySummary?.note ?? "Inventory aggregates are computed from product stock fields."}
            </p>
          ) : (
            <ul className="divide-y divide-mist/70">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-ui text-sm text-ink">{alert.name}</p>
                    <p className="font-ui text-[11px] text-taupe">{alert.productId}</p>
                  </div>
                  <span className="shrink-0 px-2 py-1 font-ui text-[9px] uppercase tracking-widest border border-accent/30 bg-accent/5 text-accent">
                    Low
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      </div>
    </AdminPage>
  );
}
