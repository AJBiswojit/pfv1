import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  IndianRupee,
  Package,
  PackageCheck,
  ShoppingBag,
  Users,
  TrendingUp,
  TrendingDown,
  Eye,
} from "lucide-react";
import { AtelierButton, EmptyState } from "../../design-system";
import AdminPage from "../../components/admin/AdminPage";
import AdminPanel from "../../components/admin/AdminPanel";
import AdminMetricCard from "../../components/admin/AdminMetricCard";
import CategorySalesBars from "../../components/admin/CategorySalesBars";
import DataTable from "../../components/employee/DataTable";
import OrderStatusBadge from "../../components/orders/OrderStatusBadge";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { loadDashboardSummary } from "../../services/admin/adminDashboardService";
import { adminFirstName, formatAdminNumber, formatCompactINR, greetingForAdmin } from "../../utils/admin";
import { formatINR } from "../../utils/shopping";
import { PRODUCTS_CHANGED_EVENT } from "../../services/catalogRepository";

const EMPTY_METRICS = {
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
};

/* ───────────────────────────────────────────────────────────────────────
 * Inline SVG chart primitives — no chart library dependency.
 * ──────────────────────────────────────────────────────────────────────── */

/** Tiny bar sparkline for KPI cards. */
function BarSparkline({ data = [], color = "#D6AE70" }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const barW = 100 / data.length;
  return (
    <svg viewBox="0 0 100 28" className="h-7 w-full" aria-hidden="true" preserveAspectRatio="none">
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * 26);
        return (
          <rect
            key={i}
            x={i * barW + barW * 0.1}
            y={28 - h}
            width={barW * 0.8}
            height={h}
            rx={1}
            fill={color}
            opacity={0.7 + (i / data.length) * 0.3}
          />
        );
      })}
    </svg>
  );
}

/** Mini line sparkline for KPI cards. */
function LineSparkline({ data = [], color = "#D6AE70" }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = 100 / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${28 - ((v - min) / range) * 24 - 2}`).join(" ");
  const area = `0,28 ${pts} 100,28`;
  return (
    <svg viewBox="0 0 100 28" className="h-7 w-full" aria-hidden="true" preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Donut chart for status distributions. */
function DonutChart({ segments = [], size = 160, strokeWidth = 24, centerLabel, centerSub }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Donut chart">
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = pct * circumference;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      {centerLabel ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-light text-pf-text">{centerLabel}</span>
          {centerSub && <span className="font-ui text-[9px] uppercase tracking-wider text-pf-muted">{centerSub}</span>}
        </div>
      ) : null}
    </div>
  );
}

/** Revenue area/line chart. */
function RevenueChart({ series = [] }) {
  if (!series.length) return null;
  const values = series.map((s) => s.sales);
  const max = Math.max(...values, 1);
  const w = 600;
  const h = 200;
  const pad = 30;
  const step = (w - pad * 2) / (series.length - 1 || 1);

  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return { x, y, v };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${h - pad} L${pts[0].x},${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-label="Revenue overview chart">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = h - pad - pct * (h - pad * 2);
        const label = formatCompactINR(max * pct);
        return (
          <g key={pct}>
            <line x1={pad} y1={y} x2={w - pad} y2={y} stroke="#EDE4D8" strokeWidth={0.5} />
            <text x={pad - 4} y={y + 3} textAnchor="end" fontSize={9} fill="#88786E" fontFamily="Instrument Sans, sans-serif">
              {label}
            </text>
          </g>
        );
      })}
      {/* X axis labels */}
      {pts.map((p, i) => (
        <text key={i} x={p.x} y={h - 8} textAnchor="middle" fontSize={9} fill="#88786E" fontFamily="Instrument Sans, sans-serif">
          {series[i].day || series[i].date?.slice(5)}
        </text>
      ))}
      {/* Area */}
      <path d={areaPath} fill="url(#revenueGrad)" />
      {/* Line */}
      <path d={linePath} fill="none" stroke="#4A0718" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#4A0718" stroke="#FFF9F2" strokeWidth={1.5} />
      ))}
      <defs>
        <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A0718" stopOpacity={0.15} />
          <stop offset="100%" stopColor="#4A0718" stopOpacity={0.01} />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * KPI card with sparkline and change indicator.
 * ──────────────────────────────────────────────────────────────────────── */

function KpiCard({ label, value, change, changeLabel, icon: Icon, sparkData, sparkType = "bar", hint }) {
  const isPositive = change >= 0;
  return (
    <article className="border border-pf-border bg-pf-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-ui text-[10px] uppercase tracking-[.18em] text-pf-muted">{label}</p>
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pf-gold/10 text-pf-gold-deep" aria-hidden="true">
            <Icon size={14} strokeWidth={1.5} />
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <p className="font-display text-3xl font-light tracking-tight text-pf-text">{value}</p>
        {change !== undefined && change !== null ? (
          <span className={`flex items-center gap-1 font-ui text-xs font-medium ${isPositive ? "text-pf-success" : "text-pf-error"}`}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        ) : null}
      </div>
      {changeLabel ? (
        <p className="font-ui text-[10px] text-pf-muted">{changeLabel}</p>
      ) : null}
      {sparkData?.length ? (
        <div className="mt-3">
          {sparkType === "bar" ? <BarSparkline data={sparkData} /> : <LineSparkline data={sparkData} />}
        </div>
      ) : null}
      {hint ? <p className="mt-2 font-ui text-[11px] text-pf-muted">{hint}</p> : null}
    </article>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Quick action button.
 * ──────────────────────────────────────────────────────────────────────── */

function QuickAction({ icon: Icon, label, to }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 border border-pf-border bg-pf-card px-4 py-4 transition-colors hover:border-pf-gold/40 hover:bg-pf-gold/5"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pf-gold/10 text-pf-gold-deep">
        <Icon size={18} strokeWidth={1.5} />
      </span>
      <span className="font-ui text-[10px] uppercase tracking-[.12em] text-pf-text">{label}</span>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Main Dashboard
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * BUSINESS OVERVIEW — the Admin Portal's front page.
 *
 * Matches the approved reference: editorial greeting, four KPI cards with
 * sparklines, revenue chart, order-status donut, recent orders table, stock
 * status donut, top categories, quick actions.
 *
 * Every figure is read from the backend. No static demo figures.
 */
export default function AdminDashboard() {
  const { admin, isSuperAdmin } = useAdminAuth();
  const workspacePrefix = isSuperAdmin ? "/super-admin" : "/admin";

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
    loadDashboardSummary({ days: 7, recentLimit: 5, workspace: isSuperAdmin ? "super-admin" : "admin" }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error ?? "Could not load the dashboard.");
      }
      setMetrics(result.metrics);
      setSeries(result.series);
      setCategories(result.categories);
      setOrders(result.orders);
      setInventorySummary(result.inventorySummary);
      setStatus("ready");
    });
    return () => { cancelled = true; };
  }, [attempt, isSuperAdmin]);

  useEffect(() => {
    const refresh = () => setAttempt((a) => a + 1);
    window.addEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PRODUCTS_CHANGED_EVENT, refresh);
  }, []);

  /* Compute period change from series data when available. */
  const periodChange = useMemo(() => {
    if (series.length < 2) return null;
    const firstHalf = series.slice(0, Math.floor(series.length / 2));
    const secondHalf = series.slice(Math.floor(series.length / 2));
    const first = firstHalf.reduce((s, p) => s + p.sales, 0);
    const second = secondHalf.reduce((s, p) => s + p.sales, 0);
    if (!first) return null;
    return ((second - first) / first) * 100;
  }, [series]);

  const revenueChange = periodChange;
  const orderChange = useMemo(() => {
    if (series.length < 2) return null;
    const firstHalf = series.slice(0, Math.floor(series.length / 2));
    const secondHalf = series.slice(Math.floor(series.length / 2));
    const first = firstHalf.reduce((s, p) => s + p.orders, 0);
    const second = secondHalf.reduce((s, p) => s + p.orders, 0);
    if (!first) return null;
    return ((second - first) / first) * 100;
  }, [series]);

  /* Order status distribution.
   * HOOK ORDER MATTERS: this memo must stay ABOVE the loading early-return
   * below. It used to sit after it, so the first render (status="loading")
   * ran one hook fewer than the second render (status="ready") — React threw
   * "Rendered more hooks than during the previous render", unmounted the
   * whole React tree and left the Super Admin / Admin dashboard blank the
   * moment the summary request resolved. */
  const orderStatusCounts = useMemo(() => {
    const counts = {};
    orders.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
    return counts;
  }, [orders]);

  if (status === "loading") {
    return (
      <AdminPage
        eyebrow="Business overview"
        title={<>Loading your <span className="italic text-pf-gold">atelier.</span></>}
        description="Fetching live figures from the backend."
      >
        <EmptyState eyebrow="One moment" title="Loading the dashboard" description="We are pulling the latest numbers from the server." />
      </AdminPage>
    );
  }

  const stockItems = inventorySummary?.items ?? [];
  const inStock = stockItems.filter((i) => i.status !== "low" && i.status !== "out").length;
  const lowStock = metrics.lowStockCount ?? 0;
  const outOfStock = metrics.outOfStockCount ?? 0;
  const totalStock = inStock + lowStock + outOfStock;

  const statusSegments = [
    { label: "Delivered", value: orderStatusCounts["delivered"] || 0, color: "#4A7C59" },
    { label: "Processing", value: orderStatusCounts["processing"] || 0, color: "#D6AE70" },
    { label: "Pending", value: orderStatusCounts["pending"] || 0, color: "#C4922A" },
    { label: "Cancelled", value: orderStatusCounts["cancelled"] || 0, color: "#A84448" },
  ].filter((s) => s.value > 0);

  const totalOrders = orders.reduce((s, o) => s + (o.items || 1), 0);

  const stockSegments = [
    { label: "In Stock", value: inStock, color: "#4A7C59" },
    { label: "Low Stock", value: lowStock, color: "#D6AE70" },
    { label: "Out of Stock", value: outOfStock, color: "#A84448" },
  ].filter((s) => s.value > 0);

  /* Category revenue bars */
  const categoryData = categories.map((c) => ({
    id: c.name,
    label: c.name,
    sales: c.revenue,
  }));

  return (
    <div className="min-w-0 w-full max-w-full pb-16">
      {/* ── Editorial greeting ── */}
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="font-ui text-[10px] uppercase tracking-[.3em] text-pf-gold">Dashboard</p>
          <h1 className="mt-2 font-display text-3xl font-light tracking-tight text-pf-text md:text-4xl">
            {greetingForAdmin()}, <span className="italic text-pf-burgundy">{adminFirstName(admin)}.</span>
          </h1>
          <p className="mt-3 font-ui text-sm leading-relaxed text-pf-muted">
            Here's what's happening with your PRATIKSHYA FASHION operations today.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <p className="font-display text-base italic text-pf-burgundy/70">
            Threads of tradition.
            <br />
            Driven by a dedicated team.
          </p>
          <div className="flex items-center gap-2">
            <span className="font-ui text-xs text-pf-muted">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          {error ? (
            <AtelierButton onClick={() => setAttempt((a) => a + 1)} size="chip" variant="outline">
              Retry
            </AtelierButton>
          ) : null}
        </div>
      </header>

      {error ? (
        <EmptyState
          eyebrow="Live data unavailable"
          title="Some dashboard figures could not be loaded"
          description={error}
          className="mb-8"
          actions={<AtelierButton onClick={() => setAttempt((a) => a + 1)} variant="primary" size="md">Try again</AtelierButton>}
        />
      ) : null}

      {/* ── KPI Cards ── */}
      <section aria-label="Business metrics" className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value={formatCompactINR(metrics.revenue)}
          change={revenueChange}
          changeLabel="vs previous 7 days"
          icon={IndianRupee}
          sparkData={series.map((s) => s.sales)}
          sparkType="line"
          hint="Lifetime, backend-verified"
        />
        <KpiCard
          label="Total Orders"
          value={formatAdminNumber(metrics.orderCount ?? metrics.totalOrders)}
          change={orderChange}
          changeLabel="vs previous 7 days"
          icon={ShoppingBag}
          sparkData={series.map((s) => s.orders)}
          sparkType="bar"
          hint="Backend order ledger"
        />
        <KpiCard
          label="Total Customers"
          value={formatAdminNumber(metrics.customerCount ?? metrics.customers)}
          change={null}
          icon={Users}
          sparkData={[]}
          hint="Registered accounts"
        />
        <KpiCard
          label="Total Products"
          value={formatAdminNumber(metrics.productCount)}
          change={null}
          icon={Package}
          sparkData={[]}
          hint="Catalogue records"
        />
      </section>

      {/* ── Revenue Overview + Order Status ─ */}
      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <AdminPanel
          eyebrow="Revenue Overview"
          title="Revenue trend"
          action={
            <span className="flex items-center gap-2">
              <span className="font-display text-2xl font-light text-pf-text">{formatCompactINR(series.reduce((s, p) => s + p.sales, 0))}</span>
              {revenueChange !== null ? (
                <span className={`font-ui text-xs font-medium ${revenueChange >= 0 ? "text-pf-success" : "text-pf-error"}`}>
                  {revenueChange >= 0 ? "↑" : "↓"} {Math.abs(revenueChange).toFixed(1)}%
                </span>
              ) : null}
            </span>
          }
        >
          {series.length ? (
            <RevenueChart series={series} />
          ) : (
            <p className="font-ui text-sm text-pf-muted">No revenue data for this period.</p>
          )}
        </AdminPanel>

        <AdminPanel eyebrow="Order Status" title="Order distribution">
          {statusSegments.length ? (
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
              <DonutChart
                segments={statusSegments}
                centerLabel={orders.length}
                centerSub="Total Orders"
              />
              <ul className="space-y-2">
                {statusSegments.map((seg) => (
                  <li key={seg.label} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="font-ui text-xs text-pf-text">{seg.label}</span>
                    <span className="font-ui text-xs text-pf-muted">
                      {seg.value} ({totalOrders ? Math.round((seg.value / orders.length) * 100) : 0}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="font-ui text-sm text-pf-muted">No orders yet.</p>
          )}
        </AdminPanel>
      </div>

      {/* ── Recent Orders ── */}
      <div className="mb-6">
        <AdminPanel
          eyebrow="Recent Orders"
          title="Latest transactions"
          action={
            <Link to={`${workspacePrefix}/orders`} className="flex items-center gap-1 font-ui text-xs text-pf-gold-deep hover:text-pf-burgundy">
              View all <ArrowRight size={12} />
            </Link>
          }
        >
          {orders.length ? (
            <DataTable
              className="border-0"
              rows={orders}
              rowKey="id"
              columns={[
                { id: "id", label: "Order" },
                { id: "customer", label: "Customer" },
                {
                  id: "amount",
                  label: "Amount",
                  render: (row) => formatINR(row.amount),
                },
                { id: "status", label: "Status", render: (row) => <OrderStatusBadge status={row.status} /> },
                {
                  id: "actions",
                  label: "",
                  render: (row) => (
                    <Link to={`${workspacePrefix}/orders/${row.id}`} className="text-pf-gold-deep hover:text-pf-burgundy">
                      <Eye size={14} />
                    </Link>
                  ),
                },
              ]}
              empty="No orders have been placed yet."
            />
          ) : (
            <p className="font-ui text-sm text-pf-muted">No recent orders.</p>
          )}
        </AdminPanel>
      </div>

      {/* ── Stock Status + Top Categories ── */}
      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <AdminPanel
          eyebrow="Stock Status"
          title="Inventory health"
          action={
            <Link to={`${workspacePrefix}/inventory`} className="flex items-center gap-1 font-ui text-xs text-pf-gold-deep hover:text-pf-burgundy">
              View Stock <ArrowRight size={12} />
            </Link>
          }
        >
          {stockSegments.length ? (
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
              <DonutChart
                segments={stockSegments}
                centerLabel={metrics.productCount}
                centerSub="Total Products"
              />
              <ul className="space-y-2">
                {stockSegments.map((seg) => (
                  <li key={seg.label} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span className="font-ui text-xs text-pf-text">{seg.label}</span>
                    <span className="font-ui text-xs text-pf-muted">
                      {seg.value} ({totalStock ? Math.round((seg.value / totalStock) * 100) : 0}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="font-ui text-sm text-pf-muted">
              {inventorySummary?.note ?? "Inventory aggregates are computed from product stock fields."}
            </p>
          )}
        </AdminPanel>

        <AdminPanel eyebrow="Top Categories" title="Category performance" action={
          <Link to={`${workspacePrefix}/analytics`} className="flex items-center gap-1 font-ui text-xs text-pf-gold-deep hover:text-pf-burgundy">
            View all <ArrowRight size={12} />
          </Link>
        }>
          {categoryData.length ? (
            <CategorySalesBars categories={categoryData} />
          ) : (
            <p className="font-ui text-sm text-pf-muted">No category data available.</p>
          )}
        </AdminPanel>
      </div>

      {/* ── Quick Actions ── */}
      <section className="mb-8">
        <AdminPanel eyebrow="Quick Actions" title="Common operations">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            <QuickAction icon={Package} label="Add Product" to={`${workspacePrefix}/products/new`} />
            <QuickAction icon={ShoppingBag} label="Manage Orders" to={`${workspacePrefix}/orders`} />
            <QuickAction icon={Users} label="View Customers" to={`${workspacePrefix}/customers`} />
            <QuickAction icon={Boxes} label="Stock" to={`${workspacePrefix}/inventory`} />
            <QuickAction icon={TrendingUp} label="Analytics" to={`${workspacePrefix}/analytics`} />
            <QuickAction icon={PackageCheck} label="Reviews" to={`${workspacePrefix}/products/review`} />
          </div>
        </AdminPanel>
      </section>

      {/* ── Bottom banner ── */}
      <section className="border border-pf-burgundy/20 bg-pf-burgundy p-6 text-pf-ivory">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h3 className="font-display text-xl font-light">Build collections. Serve customers. Create impact.</h3>
            <p className="mt-1 font-ui text-sm text-pf-ivory/60">
              A trusted workspace for every member of the PRATIKSHYA FASHION team.
            </p>
          </div>
          <Link
            to={`${workspacePrefix}/analytics`}
            className="inline-flex items-center gap-2 border border-pf-gold/40 px-5 py-2.5 font-ui text-xs uppercase tracking-[.14em] text-pf-gold transition-colors hover:bg-pf-gold/10"
          >
            View Analytics <ArrowRight size={13} />
          </Link>
        </div>
      </section>
    </div>
  );
}
