import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Boxes,
  Image as ImageIcon,
  IndianRupee,
  Package,
  ShoppingBag,
  Tag,
  UserPlus,
  Users,
} from "lucide-react";
import { AtelierButton, EmptyState } from "../../design-system";
import AdminPage from "../../components/admin/AdminPage";
import AdminPanel from "../../components/admin/AdminPanel";
import CategorySalesBars from "../../components/admin/CategorySalesBars";
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
  outOfStockCount: 0,
  productCount: 0,
  avgOrderValue: 0,
  revenue: 0,
};

const PERIOD_OPTIONS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

/* Order-status presentation buckets. Backend statuses are stored as
 * uppercase enum values (PENDING, PROCESSING, SHIPPED, …); the finer
 * frontend lifecycle codes are bucketed identically. Matching is
 * case-insensitive so a casing difference can never silently empty the
 * distribution again. Anything unrecognised lands in "Other" rather
 * than disappearing — segment totals always reconcile with the whole
 * order book returned by the backend aggregate. */
const ORDER_BUCKETS = [
  { label: "Delivered", color: "#6E0F2A", statuses: ["DELIVERED"] },
  {
    label: "Processing",
    color: "#B98948",
    statuses: [
      "CONFIRMED", "PAYMENT_CONFIRMED", "ORDER_CONFIRMED", "PROCESSING",
      "ALLOCATED", "PICKING", "PACKED", "READY_TO_DISPATCH", "SHIPPED",
      "OUT_FOR_DELIVERY",
    ],
  },
  { label: "Pending", color: "#C98A5E", statuses: ["PENDING", "PENDING_PAYMENT"] },
  { label: "Cancelled", color: "#C4898A", statuses: ["CANCELLED"] },
  { label: "Returns", color: "#8A6E8F", statuses: ["RETURN_REQUESTED", "RETURNED"] },
];

function bucketOrderStatuses(counts) {
  if (!counts || typeof counts !== "object") return null;
  const normalized = {};
  for (const [status, count] of Object.entries(counts)) {
    const key = String(status).trim().toUpperCase().replaceAll(" ", "_");
    normalized[key] = (normalized[key] || 0) + (Number(count) || 0);
  }
  const claimed = new Set(ORDER_BUCKETS.flatMap((bucket) => bucket.statuses));
  const segments = ORDER_BUCKETS.map((bucket) => ({
    label: bucket.label,
    color: bucket.color,
    value: bucket.statuses.reduce((sum, status) => sum + (normalized[status] || 0), 0),
  }));
  const other = Object.entries(normalized)
    .filter(([status]) => !claimed.has(status))
    .reduce((sum, [, count]) => sum + count, 0);
  if (other > 0) segments.push({ label: "Other", color: "#A68A68", value: other });
  return segments.filter((segment) => segment.value > 0);
}

/* The backend sales series only contains days that had orders. Pad it
 * to the full window (zero-filled) so charts and sparklines describe
 * the actual period instead of collapsing to a single block/dot for a
 * young store. Zero days are real: no revenue was recorded that day. */
function padSeries(series, days) {
  const byDate = new Map();
  for (const point of series) {
    if (point.date) byDate.set(String(point.date).slice(0, 10), point);
  }
  const out = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const existing = byDate.get(key);
    out.push({
      date: key,
      sales: existing?.sales ?? 0,
      orders: existing?.orders ?? 0,
      label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    });
  }
  return out;
}

const moneyValue = (value) =>
  Math.abs(Number(value) || 0) >= 10000000 ? formatCompactINR(value) : formatINR(value);

/* ───────────────────────────────────────────────────────────────────────
 * Inline SVG chart primitives — no chart library dependency.
 * ──────────────────────────────────────────────────────────────────────── */

function BarSparkline({ data = [], color = "#B98948" }) {
  if (data.length < 2 || data.every((v) => !v)) return null;
  const max = Math.max(...data, 1);
  const barW = 100 / data.length;
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-full" aria-hidden="true" preserveAspectRatio="none">
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * 30);
        return (
          <rect
            key={i}
            x={i * barW + barW * 0.14}
            y={32 - h}
            width={barW * 0.72}
            height={h}
            rx={1.2}
            fill={color}
            opacity={0.45 + (i / data.length) * 0.55}
          />
        );
      })}
    </svg>
  );
}

function LineSparkline({ data = [], color = "#6E0F2A" }) {
  if (data.length < 2 || data.every((v) => !v)) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = 100 / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${32 - ((v - min) / range) * 26 - 3}`).join(" ");
  const area = `0,32 ${pts} 100,32`;
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-full" aria-hidden="true" preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity={0.1} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DonutChart({ segments = [], size = 168, strokeWidth = 26, centerLabel, centerSub }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = segments.length > 1 ? 2.5 : 0;
  let offset = 0;

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerSub ?? "Total"}: ${centerLabel}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F5EDE3" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => {
          const dash = Math.max(0, (seg.value / total) * circumference - gap);
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
            >
              <title>{`${seg.label}: ${seg.value}`}</title>
            </circle>
          );
          offset += (seg.value / total) * circumference;
          return el;
        })}
      </svg>
      {centerLabel !== undefined ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <span className="font-display text-[32px] font-medium leading-none text-pf-text tabular-nums">{centerLabel}</span>
          {centerSub && (
            <span className="mt-1.5 font-ui text-[11px] font-semibold uppercase tracking-[0.12em] text-pf-muted">{centerSub}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DonutLegend({ segments }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  return (
    <ul className="min-w-0 flex-1 space-y-2.5">
      {segments.map((seg) => (
        <li key={seg.label} className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-ui text-[13px] text-pf-text">{seg.label}</span>
          <span className="font-ui text-[13px] font-semibold tabular-nums text-pf-text">{seg.value}</span>
          <span className="w-14 text-right font-ui text-[12px] tabular-nums text-pf-muted">
            ({total ? ((seg.value / total) * 100).toFixed(1) : "0.0"}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Revenue area/line chart with HTML axis labels (never sub-11px SVG text). */
function RevenueChart({ series = [] }) {
  const [active, setActive] = useState(null);
  if (!series.length) return null;
  const values = series.map((s) => s.sales);
  const max = Math.max(...values, 1);
  const w = 720;
  const h = 240;
  const padX = 14;
  const padTop = 14;
  const padBottom = 10;
  const step = (w - padX * 2) / Math.max(series.length - 1, 1);

  const pts = values.map((v, i) => ({
    x: padX + i * step,
    y: h - padBottom - (v / max) * (h - padTop - padBottom),
    v,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${h - padBottom} L${pts[0].x},${h - padBottom} Z`;
  const tickEvery = Math.max(1, Math.ceil(series.length / 7));
  const activePoint = active !== null ? pts[active] : null;

  return (
    <div>
      <div className="relative pl-12">
        {/* Y axis — real HTML text at a true 11px */}
        <div aria-hidden="true" className="absolute inset-y-0 left-0 flex w-10 flex-col justify-between py-1 text-right">
          {[1, 0.66, 0.33, 0].map((pct) => (
            <span key={pct} className="font-ui text-[11px] tabular-nums text-pf-muted">
              {formatCompactINR(max * pct)}
            </span>
          ))}
        </div>
        <div className="relative">
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Revenue trend chart">
            {[0, 0.33, 0.66, 1].map((pct) => {
              const y = h - padBottom - pct * (h - padTop - padBottom);
              return <line key={pct} x1={padX} y1={y} x2={w - padX} y2={y} stroke="#EDE4D8" strokeWidth={1} />;
            })}
            <path d={areaPath} fill="url(#revenueGrad)" />
            <path d={linePath} fill="none" stroke="#6E0F2A" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={active === i ? 6 : 4}
                fill="#6E0F2A"
                stroke="#FFF9F2"
                strokeWidth={2}
                className="cursor-pointer"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                tabIndex={0}
                role="img"
                aria-label={`${series[i].label}: ${formatINR(p.v)} revenue, ${series[i].orders} orders`}
              />
            ))}
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6E0F2A" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#6E0F2A" stopOpacity={0.01} />
              </linearGradient>
            </defs>
          </svg>
          {activePoint ? (
            <div
              className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 rounded-lg border border-pf-border bg-pf-card px-3 py-2 text-center shadow-[0_12px_32px_rgb(42_6_16/0.18)]"
              style={{ left: `${Math.min(88, Math.max(12, (activePoint.x / w) * 100))}%` }}
            >
              <p className="font-ui text-[11px] font-semibold text-pf-muted">{series[active].label}</p>
              <p className="font-ui text-[13px] font-bold tabular-nums text-pf-text">{formatINR(activePoint.v)}</p>
              <p className="font-ui text-[11px] tabular-nums text-pf-muted">{series[active].orders} orders</p>
            </div>
          ) : null}
        </div>
      </div>
      {/* X axis */}
      <div aria-hidden="true" className="mt-2 flex justify-between pl-12">
        {series.map((point, i) =>
          i % tickEvery === 0 || i === series.length - 1 ? (
            <span key={point.date} className="font-ui text-[11px] tabular-nums text-pf-muted">
              {point.label}
            </span>
          ) : (
            <span key={point.date} />
          )
        )}
      </div>
      {/* Assistive + no-pointer data equivalent */}
      <table className="sr-only">
        <caption>Revenue by day</caption>
        <tbody>
          {series.map((point) => (
            <tr key={point.date}>
              <td>{point.label}</td>
              <td>{formatINR(point.sales)}</td>
              <td>{point.orders} orders</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * KPI card (Phase 2 staff scale). Honest variants: sparklines render
 * only where a real series exists; the sub-line always states a real,
 * labelled figure — no invented growth percentages.
 * ──────────────────────────────────────────────────────────────────────── */

function KpiCard({ label, value, sub, icon: Icon, children, hint }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-pf-border bg-pf-card p-5 shadow-[0_10px_40px_rgb(74_7_24/0.07)] sm:p-6">
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pf-gold/15 text-pf-gold-text" aria-hidden="true">
            <Icon size={18} strokeWidth={1.5} />
          </span>
        ) : null}
        <p className="font-ui text-[11px] font-semibold uppercase tracking-[.18em] text-pf-muted">{label}</p>
      </div>
      <p className="mt-4 font-display text-[36px] font-medium leading-none tracking-tight text-pf-text tabular-nums md:text-[42px]">
        {value}
      </p>
      {sub ? <p className="mt-2 font-ui text-[13px] font-medium tabular-nums text-pf-gold-text">{sub}</p> : null}
      <div className="mt-auto pt-4">
        {children}
        {hint ? <p className="mt-2 font-ui text-[12px] text-pf-muted">{hint}</p> : null}
      </div>
    </article>
  );
}

function QuickAction({ icon: Icon, label, to }) {
  return (
    <Link
      to={to}
      className="flex min-h-[104px] flex-col items-center justify-center gap-2.5 rounded-xl border border-pf-border bg-pf-card px-3 py-4 text-center transition-colors hover:border-pf-gold-deep/60 hover:bg-pf-ivory"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pf-gold/15 text-pf-gold-text">
        <Icon size={20} strokeWidth={1.5} />
      </span>
      <span className="font-ui text-[12px] font-semibold leading-snug text-pf-text">{label}</span>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Main Dashboard
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * BUSINESS OVERVIEW — the Admin / Super Admin front page.
 *
 * Reference composition, real data only: editorial greeting, four KPI
 * cards, revenue trend (selectable 7/30/90-day window via the summary
 * API's existing `days` parameter), whole-book order-status donut,
 * product-led recent orders, stock donut derived from the backend's
 * stock aggregates, category performance table, permission-filtered
 * quick actions. No figure is hard-coded; unavailable data renders an
 * honest unavailable state instead of an invented one.
 */
export default function AdminDashboard() {
  const { admin, isSuperAdmin, hasPermission } = useAdminAuth();
  const workspacePrefix = isSuperAdmin ? "/super-admin" : "/admin";

  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [series, setSeries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderStatusCounts, setOrderStatusCounts] = useState(null);
  const [days, setDays] = useState(7);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setLoadFailed(false);
    loadDashboardSummary({ days, recentLimit: 5, workspace: isSuperAdmin ? "super-admin" : "admin" }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error ?? "Could not load the dashboard.");
        setLoadFailed(true);
      }
      setMetrics(result.metrics);
      setSeries(result.series);
      setCategories(result.categories);
      setOrders(result.orders);
      setOrderStatusCounts(result.orderStatusCounts ?? null);
      setStatus("ready");
    });
    return () => { cancelled = true; };
  }, [attempt, isSuperAdmin, days]);

  useEffect(() => {
    const refresh = () => setAttempt((a) => a + 1);
    window.addEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PRODUCTS_CHANGED_EVENT, refresh);
  }, []);

  /* HOOK ORDER: every hook stays ABOVE the loading early-return (the
   * historical blank-dashboard crash came from a hook below it). */
  const paddedSeries = useMemo(() => padSeries(series, days), [series, days]);
  const periodRevenue = useMemo(() => paddedSeries.reduce((s, p) => s + p.sales, 0), [paddedSeries]);
  const periodOrders = useMemo(() => paddedSeries.reduce((s, p) => s + p.orders, 0), [paddedSeries]);
  const statusSegments = useMemo(() => bucketOrderStatuses(orderStatusCounts), [orderStatusCounts]);
  const quickActions = useMemo(() => {
    const can = (...permissions) =>
      typeof hasPermission === "function" && permissions.some((permission) => hasPermission(permission));
    return [
      { icon: Package, label: "Add Product", to: `${workspacePrefix}/products/new`, show: can("catalogue.manage", "product_workflow.manage") },
      { icon: ShoppingBag, label: "Manage Orders", to: `${workspacePrefix}/orders`, show: can("orders.view") },
      { icon: Users, label: "View Customers", to: `${workspacePrefix}/customers`, show: can("customers.view") },
      { icon: UserPlus, label: "Manage Employees", to: `${workspacePrefix}/employees`, show: can("people.view") },
      { icon: Tag, label: "Create Offer", to: `${workspacePrefix}/offers/new`, show: can("offers.manage") },
      { icon: ImageIcon, label: "Homepage Content", to: `${workspacePrefix}/media/marketing`, show: can("media.view", "marketing.view") },
    ].filter((action) => action.show);
  }, [hasPermission, workspacePrefix]);

  if (status === "loading") {
    return (
      <AdminPage
        eyebrow="Business overview"
        title={<>Loading your <span className="italic text-pf-burgundy">atelier.</span></>}
        description="Fetching live figures from the backend."
      >
        <div className="rounded-xl border border-pf-border bg-pf-card px-6 py-16 text-center shadow-[0_10px_40px_rgb(74_7_24/0.07)]" role="status">
          <p className="font-display text-[24px] font-medium text-pf-text">Loading the dashboard</p>
          <p className="mt-2 font-ui text-sm text-pf-muted">We are pulling the latest numbers from the server.</p>
        </div>
      </AdminPage>
    );
  }

  /* A failed load renders NO zeroed figures — zeros would read as real. */
  if (loadFailed) {
    return (
      <AdminPage
        eyebrow="Business overview"
        title={<>Your dashboard is <span className="italic text-pf-burgundy">unavailable.</span></>}
        description="Live figures could not be loaded, so nothing is shown rather than placeholder numbers."
      >
        <EmptyState
          eyebrow="Live data unavailable"
          title="Dashboard figures could not be loaded"
          description={error || "Please try again in a moment."}
          actions={<AtelierButton onClick={() => setAttempt((a) => a + 1)} variant="primary" size="md">Try again</AtelierButton>}
        />
      </AdminPage>
    );
  }

  const lowStock = metrics.lowStockCount ?? 0;
  const outOfStock = metrics.outOfStockCount ?? 0;
  const productCount = metrics.productCount ?? 0;
  const inStock = Math.max(productCount - lowStock - outOfStock, 0);
  const stockSegments = [
    { label: "In Stock", value: inStock, color: "#6E0F2A" },
    { label: "Low Stock", value: lowStock, color: "#B98948" },
    { label: "Out of Stock", value: outOfStock, color: "#C4898A" },
  ].filter((s) => s.value > 0);
  const orderBookTotal = statusSegments?.reduce((s, seg) => s + seg.value, 0) ?? 0;

  const periodLabel = PERIOD_OPTIONS.find((option) => option.days === days)?.label ?? `Last ${days} days`;
  const customerCount = metrics.customerCount ?? metrics.customers ?? 0;
  const orderCount = metrics.orderCount ?? metrics.totalOrders ?? 0;
  const ordersPerCustomer = customerCount > 0 ? (orderCount / customerCount).toFixed(1) : null;

  const categoryData = categories.slice(0, 5).map((c) => ({
    id: c.name,
    label: c.name,
    sales: c.revenue,
    units: c.units,
  }));

  return (
    <div className="min-w-0 w-full max-w-full pb-16">
      {/* ── Editorial greeting ── */}
      <header className="relative mb-8 flex flex-col gap-5 overflow-hidden md:flex-row md:items-end md:justify-between">
        {/* Selective heritage watermark — purely decorative */}
        <svg aria-hidden="true" className="pointer-events-none absolute -top-16 right-[22%] hidden h-56 w-56 text-pf-gold/15 lg:block" viewBox="0 0 100 100" fill="none" stroke="currentColor">
          <circle cx="50" cy="50" r="46" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="34" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="22" strokeWidth="0.6" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1={50 + 22 * Math.cos(a)} y1={50 + 22 * Math.sin(a)} x2={50 + 46 * Math.cos(a)} y2={50 + 46 * Math.sin(a)} strokeWidth="0.5" />;
          })}
        </svg>
        <div className="relative max-w-2xl">
          <p className="font-ui text-[11px] font-semibold uppercase tracking-[.34em] text-pf-gold-text">Dashboard</p>
          <h1 className="mt-2 font-display text-[34px] font-medium leading-[1.05] tracking-tight text-pf-text md:text-[46px]">
            {greetingForAdmin()}, <span className="italic text-pf-burgundy">{adminFirstName(admin)}.</span>
          </h1>
          <p className="mt-3 font-ui text-sm leading-relaxed text-pf-muted">
            Here&apos;s what&apos;s happening with your PRATIKSHYA FASHION operations today.
          </p>
        </div>
        <div className="relative flex flex-col items-start gap-3 md:items-end">
          <p className="border-l-2 border-pf-gold pl-4 font-display text-[19px] italic leading-snug text-pf-burgundy">
            Threads of tradition.
            <br />
            Driven by a dedicated team.
          </p>
          <p className="flex items-center gap-2 rounded-lg border border-pf-border bg-pf-card px-3.5 py-2 font-ui text-[12.5px] font-medium text-pf-text shadow-[0_6px_24px_rgb(74_7_24/0.06)]">
            <CalendarDays size={14} className="text-pf-gold-text" aria-hidden="true" />
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
      </header>

      {/* ── KPI Cards ── */}
      <section aria-label="Business metrics" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value={moneyValue(metrics.revenue)}
          sub={`${moneyValue(periodRevenue)} · ${periodLabel.toLowerCase()}`}
          icon={IndianRupee}
          hint="Lifetime, backend-verified"
        >
          <LineSparkline data={paddedSeries.map((s) => s.sales)} />
        </KpiCard>
        <KpiCard
          label="Total Orders"
          value={formatAdminNumber(orderCount)}
          sub={`${formatAdminNumber(periodOrders)} · ${periodLabel.toLowerCase()}`}
          icon={ShoppingBag}
          hint="Backend order ledger"
        >
          <BarSparkline data={paddedSeries.map((s) => s.orders)} />
        </KpiCard>
        <KpiCard
          label="Total Customers"
          value={formatAdminNumber(customerCount)}
          sub={ordersPerCustomer ? `${ordersPerCustomer} orders per customer` : undefined}
          icon={Users}
          hint="Registered accounts · all-time orders per customer"
        >
          {metrics.avgOrderValue ? (
            <p className="font-ui text-[13px] tabular-nums text-pf-muted">
              Avg. order value <span className="font-semibold text-pf-text">{moneyValue(metrics.avgOrderValue)}</span>
            </p>
          ) : null}
        </KpiCard>
        <KpiCard
          label="Total Products"
          value={formatAdminNumber(productCount)}
          sub={productCount ? `${formatAdminNumber(lowStock)} low · ${formatAdminNumber(outOfStock)} out of stock` : undefined}
          icon={Package}
          hint="Catalogue records · stock composition below"
        >
          {productCount > 0 ? (
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-pf-border-light" aria-hidden="true">
              <span style={{ width: `${(inStock / productCount) * 100}%`, backgroundColor: "#6E0F2A" }} />
              <span style={{ width: `${(lowStock / productCount) * 100}%`, backgroundColor: "#B98948" }} />
              <span style={{ width: `${(outOfStock / productCount) * 100}%`, backgroundColor: "#C4898A" }} />
            </div>
          ) : null}
        </KpiCard>
      </section>

      {/* ── Analytics grid: revenue + order status + stock + categories,
             with the recent-orders / quick-actions rail ── */}
      <div className="grid gap-6 xl:grid-cols-12">
        <AdminPanel
          className="xl:col-span-5"
          eyebrow="Revenue Overview"
          title="Revenue trend"
          action={
            <label className="flex items-center gap-2">
              <span className="sr-only">Trend window</span>
              <select
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                className="min-h-10 rounded-lg border border-pf-border-strong/60 bg-pf-card px-3 py-2 font-ui text-[12.5px] font-medium text-pf-text"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.days} value={option.days}>{option.label}</option>
                ))}
              </select>
            </label>
          }
        >
          <p className="font-display text-[30px] font-medium leading-none text-pf-text tabular-nums">
            {moneyValue(periodRevenue)}
          </p>
          <p className="mt-1.5 font-ui text-[12.5px] text-pf-muted">
            Revenue in the {periodLabel.toLowerCase()} · {formatAdminNumber(periodOrders)} orders
          </p>
          <div className="mt-5">
            {periodRevenue > 0 || periodOrders > 0 ? (
              <RevenueChart series={paddedSeries} />
            ) : (
              <p className="py-8 text-center font-ui text-sm text-pf-muted">No revenue recorded in this period yet.</p>
            )}
          </div>
        </AdminPanel>

        <AdminPanel className="xl:col-span-4" eyebrow="Order Status" title="Order distribution">
          {statusSegments === null ? (
            <p className="py-8 text-center font-ui text-sm leading-relaxed text-pf-muted">
              A complete order-status breakdown isn&apos;t available from the server yet, so no
              distribution is shown rather than an estimate from recent orders.
            </p>
          ) : statusSegments.length ? (
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <DonutChart segments={statusSegments} centerLabel={orderBookTotal} centerSub="Total Orders" />
              <DonutLegend segments={statusSegments} />
            </div>
          ) : (
            <p className="py-8 text-center font-ui text-sm text-pf-muted">No orders yet.</p>
          )}
        </AdminPanel>

        {/* Right rail — recent orders + quick actions */}
        <div className="flex flex-col gap-6 xl:col-span-3 xl:row-span-2">
          <AdminPanel
            eyebrow="Recent Orders"
            title="Latest orders"
            action={
              <Link to={`${workspacePrefix}/orders`} className="flex items-center gap-1 font-ui text-[12.5px] font-semibold text-pf-gold-text hover:text-pf-burgundy">
                View all <ArrowRight size={13} />
              </Link>
            }
          >
            {orders.length ? (
              <ul className="divide-y divide-pf-border-light">
                {orders.map((order) => (
                  <li key={order.id}>
                    <Link to={`${workspacePrefix}/orders/${order.id}`} className="flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-pf-ivory">
                      {order.firstItemImage ? (
                        <img src={order.firstItemImage} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-pf-ivory font-display text-[16px] font-medium text-pf-gold-text" aria-hidden="true">
                          {(order.firstItemName || order.customer || "P").slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-ui text-[12.5px] font-bold tabular-nums text-pf-burgundy">
                          #{String(order.orderNumber)}
                        </span>
                        <span className="block truncate font-ui text-[13px] font-medium text-pf-text">{order.customer}</span>
                        {order.firstItemName ? (
                          <span className="block truncate font-ui text-[12px] text-pf-muted">
                            {order.firstItemName}{order.additionalItems > 0 ? ` +${order.additionalItems} more` : ""}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="font-ui text-[13.5px] font-bold tabular-nums text-pf-text">{formatINR(order.amount)}</span>
                        <OrderStatusBadge status={order.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center font-ui text-sm text-pf-muted">No recent orders.</p>
            )}
          </AdminPanel>

          <AdminPanel eyebrow="Quick Actions" title="Common operations">
            {quickActions.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                {quickActions.map((action) => (
                  <QuickAction key={action.label} {...action} />
                ))}
              </div>
            ) : (
              <p className="py-4 text-center font-ui text-sm text-pf-muted">
                No quick actions are available for your current permissions.
              </p>
            )}
          </AdminPanel>
        </div>

        <AdminPanel
          className="xl:col-span-4"
          eyebrow="Stock Status"
          title="Inventory health"
          action={
            <Link to={`${workspacePrefix}/inventory`} className="flex items-center gap-1 font-ui text-[12.5px] font-semibold text-pf-gold-text hover:text-pf-burgundy">
              View Stock <ArrowRight size={13} />
            </Link>
          }
        >
          {stockSegments.length ? (
            <>
              <div className="flex flex-col items-center gap-6 sm:flex-row">
                <DonutChart segments={stockSegments} centerLabel={productCount} centerSub="Total Products" />
                <DonutLegend segments={stockSegments} />
              </div>
              <p className="mt-4 font-ui text-[12px] text-pf-muted">
                In-stock is the catalogue total minus the backend&apos;s low- and out-of-stock counts.
              </p>
            </>
          ) : (
            <p className="py-8 text-center font-ui text-sm text-pf-muted">No products in the catalogue yet.</p>
          )}
        </AdminPanel>

        <AdminPanel
          className="xl:col-span-5"
          eyebrow="Top Categories"
          title="Category performance"
          action={
            <Link to={`${workspacePrefix}/analytics`} className="flex items-center gap-1 font-ui text-[12.5px] font-semibold text-pf-gold-text hover:text-pf-burgundy">
              View all <ArrowRight size={13} />
            </Link>
          }
        >
          {categoryData.length ? (
            <CategorySalesBars categories={categoryData} />
          ) : (
            <p className="py-8 text-center font-ui text-sm text-pf-muted">No category revenue in this period yet.</p>
          )}
        </AdminPanel>
      </div>

      {/* ── Bottom banner ── */}
      <section className="relative mt-6 overflow-hidden rounded-xl border border-pf-gold/30 bg-gradient-to-r from-pf-wine via-pf-burgundy to-pf-burgundy p-6 text-pf-ivory shadow-[0_18px_50px_rgb(42_6_16/0.3)] sm:p-8">
        <svg aria-hidden="true" className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 text-pf-gold/15" viewBox="0 0 100 100" fill="none" stroke="currentColor">
          <circle cx="50" cy="50" r="46" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="33" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="20" strokeWidth="0.6" />
        </svg>
        <div className="relative flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full border border-pf-gold/40 text-pf-gold sm:flex" aria-hidden="true">
              <Boxes size={20} strokeWidth={1.5} />
            </span>
            <div>
              <h2 className="font-display text-[26px] font-medium leading-tight md:text-[30px]">
                Build collections. Serve customers. Create impact.
              </h2>
              <p className="mt-1.5 font-ui text-sm leading-relaxed text-pf-ivory/75">
                A trusted workspace for every member of the PRATIKSHYA FASHION team.
              </p>
            </div>
          </div>
          <Link
            to={`${workspacePrefix}/analytics`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-pf-gold/60 px-6 py-3 font-ui text-[12px] font-semibold uppercase tracking-[.16em] text-pf-gold transition-colors hover:bg-pf-gold/15 hover:text-pf-ivory"
          >
            View Analytics <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}
