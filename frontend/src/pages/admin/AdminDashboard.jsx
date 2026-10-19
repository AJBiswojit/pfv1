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
import AdminMetricCard from "../../components/admin/AdminMetricCard";
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
  { label: "Delivered", color: "#65081F", statuses: ["DELIVERED", "COMPLETED"] },
  {
    label: "In fulfillment",
    color: "#B98948",
    statuses: [
      "CONFIRMED", "PAYMENT_CONFIRMED", "ORDER_CONFIRMED", "PROCESSING",
      "ALLOCATED", "PICKING", "PACKED", "READY_TO_DISPATCH", "SHIPPED",
      "OUT_FOR_DELIVERY",
    ],
  },
  { label: "Pending", color: "#C98A5E", statuses: ["PENDING", "PENDING_PAYMENT"] },
  { label: "Cancelled", color: "#C4898A", statuses: ["CANCELLED"] },
  {
    label: "Returns",
    color: "#8A6E8F",
    statuses: ["RETURN_REQUESTED", "RETURNED", "PARTIALLY_RETURNED", "REFUND_PENDING", "REFUNDED"],
  },
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
    <svg
      viewBox="0 0 100 32"
      className="h-9 w-full"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      {data.map((v, i) => {
        const h = Math.max(2, (v / max) * 30);
        return (
          <rect
            key={i}
            x={i * barW + barW * 0.16}
            y={32 - h}
            width={barW * 0.68}
            height={h}
            rx={1}
            fill={color}
            opacity={0.4 + (i / data.length) * 0.6}
          />
        );
      })}
    </svg>
  );
}

function LineSparkline({ data = [], color = "#65081F" }) {
  if (data.length < 2 || data.every((v) => !v)) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = 100 / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${32 - ((v - min) / range) * 26 - 3}`).join(" ");
  const area = `0,32 ${pts} 100,32`;
  return (
    <svg
      viewBox="0 0 100 32"
      className="h-9 w-full"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <polygon points={area} fill={color} opacity={0.08} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function DonutChart({ segments = [], size = 152, strokeWidth = 23, centerLabel, centerSub }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = segments.length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${centerSub ?? "Total"}: ${centerLabel}`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F3E7D8" strokeWidth={strokeWidth} />
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
              strokeLinecap="butt"
            >
              <title>{`${seg.label}: ${seg.value}`}</title>
            </circle>
          );
          offset += (seg.value / total) * circumference;
          return el;
        })}
      </svg>
      {centerLabel !== undefined ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="font-display text-[30px] leading-none text-pf-text tabular-nums">{centerLabel}</span>
          {centerSub ? (
            <span className="mt-1.5 font-ui text-[9.5px] font-semibold uppercase tracking-[0.14em] text-pf-muted">
              {centerSub}
            </span>
          ) : null}
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
        <li key={seg.label} className="flex items-baseline gap-2.5">
          <span
            className="mt-[5px] h-2 w-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: seg.color }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate font-ui text-[12.5px] leading-snug text-pf-text">
            {seg.label}
          </span>
          <span className="shrink-0 font-ui text-[12.5px] font-semibold tabular-nums text-pf-text">
            {seg.value}
          </span>
          <span className="w-[46px] shrink-0 text-right font-ui text-[11.5px] tabular-nums text-pf-muted">
            {total ? ((seg.value / total) * 100).toFixed(1) : "0.0"}%
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
  const h = 232;
  const padX = 10;
  const padTop = 12;
  const padBottom = 8;
  const step = (w - padX * 2) / Math.max(series.length - 1, 1);

  const pts = values.map((v, i) => ({
    x: padX + i * step,
    y: h - padBottom - (v / max) * (h - padTop - padBottom),
    v,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${h - padBottom} L${pts[0].x},${h - padBottom} Z`;
  const activePoint = active !== null ? pts[active] : null;
  const tickIndices = series
    .map((_, i) => i)
    .filter((i) => i % Math.max(1, Math.ceil(series.length / 7)) === 0 || i === series.length - 1);

  return (
    <div>
      <div className="relative pl-11">
        {/* Y axis — real HTML text at a true 11px */}
        <div aria-hidden="true" className="absolute inset-y-0 left-0 flex w-9 flex-col justify-between pb-1 pr-2 text-right">
          {[1, 0.66, 0.33, 0].map((pct) => (
            <span key={pct} className="font-ui text-[11px] tabular-nums leading-none text-pf-muted">
              {formatCompactINR(max * pct)}
            </span>
          ))}
        </div>
        <div className="relative">
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Revenue trend chart">
            {[0, 0.33, 0.66, 1].map((pct) => {
              const y = h - padBottom - pct * (h - padTop - padBottom);
              return (
                <line
                  key={pct}
                  x1={padX}
                  y1={y}
                  x2={w - padX}
                  y2={y}
                  stroke={pct === 0 ? "#DCCBB6" : "#EDE4D8"}
                  strokeWidth={1}
                  strokeDasharray={pct === 0 ? undefined : "3 5"}
                />
              );
            })}
            <path d={areaPath} fill="url(#revenueGrad)" />
            <path
              d={linePath}
              fill="none"
              stroke="#65081F"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {activePoint ? (
              <line
                x1={activePoint.x}
                y1={padTop}
                x2={activePoint.x}
                y2={h - padBottom}
                stroke="#B98948"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            ) : null}
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={active === i ? 5.5 : 3.6}
                fill={active === i ? "#65081F" : "#FFF9F2"}
                stroke="#65081F"
                strokeWidth={1.8}
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
                <stop offset="0%" stopColor="#65081F" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#65081F" stopOpacity={0.01} />
              </linearGradient>
            </defs>
          </svg>
          {activePoint ? (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-pf-border bg-pf-card px-3 py-2 text-center shadow-[0_12px_32px_rgb(42_6_16/0.16)]"
              style={{ left: `${Math.min(88, Math.max(12, (activePoint.x / w) * 100))}%` }}
            >
              <p className="font-ui text-[10.5px] font-semibold uppercase tracking-[.1em] text-pf-muted">
                {series[active].label}
              </p>
              <p className="mt-0.5 font-ui text-[13px] font-bold tabular-nums text-pf-text">
                {formatINR(activePoint.v)}
              </p>
              <p className="font-ui text-[11px] tabular-nums text-pf-muted">{series[active].orders} orders</p>
            </div>
          ) : null}
        </div>
      </div>
      {/* X axis — labels positioned under their real data point */}
      <div aria-hidden="true" className="relative mt-2 ml-11 h-4">
        {tickIndices.map((i) => (
          <span
            key={series[i].date}
            className="absolute top-0 -translate-x-1/2 font-ui text-[11px] tabular-nums text-pf-muted first:translate-x-0 last:-translate-x-full"
            style={{ left: `${((padX + i * step) / w) * 100}%` }}
          >
            {series[i].label}
          </span>
        ))}
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

/* A refined, honest empty state for a panel with no data to draw. */
function PanelEmpty({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-pf-border bg-pf-card-soft/60 px-6 py-10 text-center">
      {Icon ? (
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-pf-gold/30 text-pf-gold-text" aria-hidden="true">
          <Icon size={17} strokeWidth={1.4} />
        </span>
      ) : null}
      <p className="mt-3 font-display text-[19px] leading-tight text-pf-text">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-xs font-ui text-[12px] leading-relaxed text-pf-muted">{description}</p>
      ) : null}
    </div>
  );
}

function QuickAction({ icon: Icon, label, to }) {
  return (
    <Link
      to={to}
      className="group flex min-h-[92px] flex-col items-start justify-center gap-2 rounded-lg border border-pf-border bg-pf-card px-3.5 py-3.5 transition-colors hover:border-pf-gold-line hover:bg-pf-card-soft"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-pf-gold/25 bg-pf-gold/[0.12] text-pf-gold-text transition-colors group-hover:border-pf-gold/45">
        <Icon size={17} strokeWidth={1.5} />
      </span>
      <span className="font-ui text-[12px] font-semibold leading-snug text-pf-text">{label}</span>
    </Link>
  );
}

function MetricDivider() {
  return <span aria-hidden="true" className="my-2.5 block h-px w-full bg-pf-border/80" />;
}

/* ────────────────────────────────────────────────────────────────────────
 * Main Dashboard
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * BUSINESS OVERVIEW — the Admin / Super Admin front page.
 *
 * Composition (Phase 3): editorial greeting; four equal-height KPI cards;
 * revenue trend + whole-book order distribution; recent orders beside
 * inventory health; category performance beside permission-filtered quick
 * actions. Real data only — every absent figure renders an explicit
 * unavailable/empty state instead of a fabricated one.
 */
export default function AdminDashboard() {
  const { admin, isSuperAdmin, hasPermission } = useAdminAuth();
  const workspacePrefix = isSuperAdmin ? "/super-admin" : "/admin";

  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [series, setSeries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderStatusCounts, setOrderStatusCounts] = useState(null);
  const [lowStockItems, setLowStockItems] = useState([]);
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
      setLowStockItems(Array.isArray(result.inventorySummary?.items) ? result.inventorySummary.items : []);
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
      { icon: Package, label: "Add product", to: `${workspacePrefix}/products/new`, show: can("catalogue.manage", "product_workflow.manage") },
      { icon: ShoppingBag, label: "Manage orders", to: `${workspacePrefix}/orders`, show: can("orders.view") },
      { icon: Users, label: "View customers", to: `${workspacePrefix}/customers`, show: can("customers.view") },
      { icon: UserPlus, label: "Manage employees", to: `${workspacePrefix}/employees`, show: can("people.view") },
      { icon: Tag, label: "Create offer", to: `${workspacePrefix}/offers/new`, show: can("offers.manage") },
      { icon: ImageIcon, label: "Homepage content", to: `${workspacePrefix}/media/marketing`, show: can("media.view", "marketing.view") },
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
          <p className="font-display text-[24px] text-pf-text">Loading the dashboard</p>
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
    { label: "In Stock", value: inStock, color: "#65081F" },
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

  const longDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-w-0 w-full max-w-full pb-16">
      {/* ── Editorial greeting ── */}
      <header className="relative mb-7 flex flex-col gap-6 border-b border-pf-border/70 pb-7 lg:flex-row lg:items-end lg:justify-between">
        {/* Selective heritage watermark — sits behind the copy, never competes */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 right-[26%] hidden h-60 w-60 text-pf-gold/[0.13] lg:block"
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="50" cy="50" r="46" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="34" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="22" strokeWidth="0.5" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI) / 6;
            return <line key={i} x1={50 + 22 * Math.cos(a)} y1={50 + 22 * Math.sin(a)} x2={50 + 46 * Math.cos(a)} y2={50 + 46 * Math.sin(a)} strokeWidth="0.4" />;
          })}
        </svg>

        <div className="relative min-w-0 max-w-[660px]">
          <p className="flex items-center gap-2.5 font-ui text-[11px] font-semibold uppercase tracking-[.32em] text-pf-gold-text">
            <span aria-hidden="true" className="h-px w-7 bg-pf-gold/80" />
            {isSuperAdmin ? "Super Admin · Business overview" : "Business overview"}
          </p>
          <h1 className="mt-3 font-display text-[34px] leading-[1.02] tracking-[-0.02em] text-pf-text sm:text-[40px] md:text-[46px]">
            {greetingForAdmin()},{" "}
            <span className="italic text-pf-burgundy">{adminFirstName(admin)}.</span>
          </h1>
          <p className="mt-3 max-w-xl font-ui text-[14px] leading-relaxed text-pf-muted">
            Here is the house at a glance — revenue, orders, catalogue health and the people
            who keep the atelier moving today.
          </p>
        </div>

        <div className="relative flex shrink-0 flex-col items-start gap-3 lg:items-end lg:pb-1">
          <p className="flex items-center gap-2.5 rounded-md border border-pf-border bg-pf-card px-3 py-1.5 font-ui text-[12px] font-medium text-pf-text shadow-[0_1px_0_rgb(255_255_255/0.7)] sm:px-3.5 sm:py-2 sm:text-[12.5px]">
            <CalendarDays size={14} className="text-pf-gold-text" aria-hidden="true" />
            {longDate}
          </p>
          <p className="max-w-[240px] border-l border-pf-gold/70 pl-3.5 font-display text-[14px] italic leading-snug text-pf-burgundy/85 lg:text-right lg:border-l-0 lg:border-r lg:pl-0 lg:pr-3.5">
            Threads of tradition, honoured by the people behind them.
          </p>
        </div>
      </header>

      {/* ── KPI cards ── */}
      <section aria-label="Business metrics" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Total revenue"
          value={moneyValue(metrics.revenue)}
          sub={`${moneyValue(periodRevenue)} · ${periodLabel.toLowerCase()}`}
          icon={IndianRupee}
          hint="Lifetime, backend-verified"
        >
          <LineSparkline data={paddedSeries.map((s) => s.sales)} />
        </AdminMetricCard>

        <AdminMetricCard
          label="Total orders"
          value={formatAdminNumber(orderCount)}
          sub={`${formatAdminNumber(periodOrders)} · ${periodLabel.toLowerCase()}`}
          icon={ShoppingBag}
          hint="Backend order ledger · all statuses"
        >
          <BarSparkline data={paddedSeries.map((s) => s.orders)} />
        </AdminMetricCard>

        <AdminMetricCard
          label="Total customers"
          value={formatAdminNumber(customerCount)}
          sub={ordersPerCustomer ? `${ordersPerCustomer} orders per customer` : undefined}
          icon={Users}
          hint="Registered accounts"
        >
          {metrics.avgOrderValue ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-ui text-[12px] font-medium text-pf-muted">Avg. order value</span>
              <span className="font-display text-[19px] leading-none text-pf-text tabular-nums">
                {moneyValue(metrics.avgOrderValue)}
              </span>
            </div>
          ) : null}
        </AdminMetricCard>

        <AdminMetricCard
          label="Total products"
          value={formatAdminNumber(productCount)}
          sub={productCount ? `${formatAdminNumber(lowStock)} low · ${formatAdminNumber(outOfStock)} out of stock` : undefined}
          icon={Package}
          hint="Stock composition"
        >
          {productCount > 0 ? (
            <div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-pf-border-light" aria-hidden="true">
                <span style={{ width: `${(inStock / productCount) * 100}%`, backgroundColor: "#65081F" }} />
                <span style={{ width: `${(lowStock / productCount) * 100}%`, backgroundColor: "#B98948" }} />
                <span style={{ width: `${(outOfStock / productCount) * 100}%`, backgroundColor: "#C4898A" }} />
              </div>
              <div className="mt-2 flex items-center justify-between font-ui text-[11.5px] tabular-nums text-pf-muted">
                <span>In stock {formatAdminNumber(inStock)}</span>
                <span>Low {formatAdminNumber(lowStock)}</span>
                <span>Out {formatAdminNumber(outOfStock)}</span>
              </div>
            </div>
          ) : null}
        </AdminMetricCard>
      </section>

      {/* ── Analytics grid ── */}
      <div className="grid gap-5 xl:grid-cols-12">
        <AdminPanel
          className="xl:col-span-7"
          eyebrow="Revenue overview"
          title="Revenue trend"
          bodyClassName="flex flex-1 flex-col"
          action={
            <label className="flex items-center gap-2">
              <span className="sr-only">Trend window</span>
              <select
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                className="h-9 rounded-md border border-pf-border-strong/60 bg-pf-card px-2.5 font-ui text-[12.5px] font-medium text-pf-text transition-colors hover:border-pf-gold-deep/70"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.days} value={option.days}>{option.label}</option>
                ))}
              </select>
            </label>
          }
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-display text-[34px] leading-none text-pf-text tabular-nums">
                {moneyValue(periodRevenue)}
              </p>
              <p className="mt-2 font-ui text-[12.5px] text-pf-muted">
                {periodLabel} · {formatAdminNumber(periodOrders)} orders
              </p>
            </div>
            <p className="font-ui text-[12px] text-pf-muted">
              {paddedSeries.filter((p) => p.sales > 0).length} trading days
            </p>
          </div>
          <div className="mt-6 flex-1">
            {periodRevenue > 0 || periodOrders > 0 ? (
              <RevenueChart series={paddedSeries} />
            ) : (
              <PanelEmpty
                icon={IndianRupee}
                title="No revenue in this window"
                description="No orders were recorded in this period. Choose a longer window or check the order desk."
              />
            )}
          </div>
        </AdminPanel>

        <AdminPanel
          className="xl:col-span-5"
          eyebrow="Order status"
          title="Order distribution"
          bodyClassName="flex flex-1 flex-col"
        >
          {statusSegments === null ? (
            <PanelEmpty
              icon={ShoppingBag}
              title="Distribution unavailable"
              description="The server did not return a whole-order-book status breakdown, so none is inferred here."
            />
          ) : statusSegments.length ? (
            <div className="flex flex-1 flex-col justify-center gap-5 sm:flex-row sm:items-center">
              <DonutChart segments={statusSegments} centerLabel={orderBookTotal} centerSub="Total orders" />
              <DonutLegend segments={statusSegments} />
            </div>
          ) : (
            <PanelEmpty
              icon={ShoppingBag}
              title="No orders yet"
              description="The first completed checkout will populate this distribution."
            />
          )}
          <p className="mt-5 border-t border-pf-border/80 pt-3 font-ui text-[11.5px] leading-relaxed text-pf-muted">
            Counts every order in the book, grouped by stored status — not a sample of recent orders.
          </p>
        </AdminPanel>

        <AdminPanel
          className="xl:col-span-7"
          eyebrow="Recent orders"
          title="Latest orders"
          bodyClassName="p-0 sm:p-0"
          action={
            <Link
              to={`${workspacePrefix}/orders`}
              className="flex items-center gap-1 font-ui text-[12px] font-semibold text-pf-gold-text transition-colors hover:text-pf-burgundy"
            >
              View all <ArrowRight size={13} />
            </Link>
          }
        >
          {orders.length ? (
            <ul className="divide-y divide-pf-border/80">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    to={`${workspacePrefix}/orders/${order.id}`}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-pf-card-soft/70 sm:px-6"
                  >
                    {order.firstItemImage ? (
                      <img
                        src={order.firstItemImage}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-md border border-pf-border/80 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-pf-border bg-pf-card-soft font-display text-[16px] text-pf-gold-text"
                        aria-hidden="true"
                      >
                        {(order.firstItemName || order.customer || "P").slice(0, 1)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-ui text-[12px] font-bold tabular-nums tracking-[.02em] text-pf-burgundy">
                          {order.orderNumber || "—"}
                        </span>
                        <span className="truncate font-ui text-[13px] font-medium text-pf-text">
                          {order.customer}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate font-ui text-[11.5px] text-pf-muted">
                        {order.firstItemName
                          ? `${order.firstItemName}${order.additionalItems > 0 ? ` · +${order.additionalItems} more` : ""}`
                          : `${order.items} ${order.items === 1 ? "item" : "items"}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="font-ui text-[13px] font-semibold tabular-nums text-pf-text">
                        {formatINR(order.amount)}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-6 sm:px-6">
              <PanelEmpty
                icon={ShoppingBag}
                title="No recent orders"
                description="New orders will appear here as soon as they are placed."
              />
            </div>
          )}
        </AdminPanel>

        <AdminPanel
          className="xl:col-span-5"
          eyebrow="Stock status"
          title="Inventory health"
          bodyClassName="flex flex-1 flex-col"
          action={
            <Link
              to={`${workspacePrefix}/inventory`}
              className="flex items-center gap-1 font-ui text-[12px] font-semibold text-pf-gold-text transition-colors hover:text-pf-burgundy"
            >
              View stock <ArrowRight size={13} />
            </Link>
          }
        >
          {stockSegments.length ? (
            <div className="flex flex-1 flex-col justify-between gap-4">
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <DonutChart segments={stockSegments} centerLabel={productCount} centerSub="Products" size={136} strokeWidth={21} />
                <DonutLegend segments={stockSegments} />
              </div>
              {lowStockItems.length ? (
                <div className="mt-5 border-t border-pf-border/80 pt-3.5">
                  <p className="font-ui text-[11.5px] font-semibold text-pf-muted">
                    Low stock attention
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {lowStockItems.slice(0, 3).map((item) => (
                      <li key={item.id} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-ui text-[12px] text-pf-text">{item.name}</span>
                        <span className="shrink-0 font-ui text-[11.5px] tabular-nums text-pf-warning">
                          {item.stock} left
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 font-ui text-[11.5px] leading-relaxed text-pf-muted">
                  In-stock is the catalogue total minus the backend&apos;s low- and out-of-stock counts.
                </p>
              )}
            </div>
          ) : (
            <PanelEmpty
              icon={Boxes}
              title="No catalogue stock yet"
              description="Add products and receive stock to populate the inventory picture."
            />
          )}
        </AdminPanel>

        <AdminPanel
          className="xl:col-span-8"
          eyebrow="Top categories"
          title="Category performance"
          action={
            <Link
              to={`${workspacePrefix}/analytics`}
              className="flex items-center gap-1 font-ui text-[12px] font-semibold text-pf-gold-text transition-colors hover:text-pf-burgundy"
            >
              View analytics <ArrowRight size={13} />
            </Link>
          }
        >
          {categoryData.length ? (
            <CategorySalesBars categories={categoryData} />
          ) : (
            <PanelEmpty
              icon={Tag}
              title="No category revenue in this period"
              description="Category revenue appears once orders in this window include catalogue pieces."
            />
          )}
        </AdminPanel>

        <AdminPanel className="xl:col-span-4" eyebrow="Quick actions" title="Common operations" bodyClassName="flex flex-1 flex-col">
          {quickActions.length ? (
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <QuickAction key={action.label} {...action} />
              ))}
            </div>
          ) : (
            <p className="py-2 font-ui text-[12.5px] leading-relaxed text-pf-muted">
              No quick actions are available for your current permissions.
            </p>
          )}
          <div className="mt-auto pt-4">
            <MetricDivider />
            <p className="font-ui text-[11.5px] leading-relaxed text-pf-muted">
              Actions are filtered by your assigned capabilities. The backend remains the authority.
            </p>
          </div>
        </AdminPanel>
      </div>

      {/* ── Closing banner ── */}
      <section className="relative mt-6 overflow-hidden rounded-[var(--radius-pf-panel)] border border-pf-gold/25 bg-pf-burgundy px-6 py-7 text-pf-ivory shadow-[0_18px_50px_rgb(42_6_16/0.24)] sm:px-8">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 text-pf-gold/12"
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="50" cy="50" r="46" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="33" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="20" strokeWidth="0.6" />
        </svg>
        <div className="relative flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pf-gold/35 text-pf-gold sm:flex" aria-hidden="true">
              <Boxes size={19} strokeWidth={1.4} />
            </span>
            <div>
              <h2 className="max-w-xl font-display text-[24px] leading-tight md:text-[27px]">
                Build collections. Serve customers. Create impact.
              </h2>
              <p className="mt-1.5 font-ui text-[12.5px] leading-relaxed text-pf-ivory/75">
                A trusted workspace for every member of the PRATIKSHYA FASHION team.
              </p>
            </div>
          </div>
          <Link
            to={`${workspacePrefix}/analytics`}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-pf-gold/55 px-5 font-ui text-[11px] font-semibold uppercase tracking-[.16em] text-pf-gold transition-colors hover:bg-pf-gold/15 hover:text-pf-ivory"
          >
            View analytics <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </div>
  );
}
