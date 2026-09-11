/**
 * PRATIKSHYA FASHON — Admin Orders Management (Phase 15)
 *
 * Premium operational dashboard for order lifecycle:
 * metrics, search, filters, table (desktop) / cards (mobile).
 * Reads from the single orderRepository via OrderContext.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Package, Clock, CheckCircle2, Truck, RotateCcw, Boxes, Filter, X, Eye } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import OrderStatusBadge from "../../../components/orders/OrderStatusBadge";
import { useOrder } from "../../../context/OrderContext";
import { ORDER_STATUS, ORDER_PAYMENT_STATUS, FULFILLMENT_STATUS } from "../../../config/orderConfig";
import { formatINR } from "../../../utils/shopping";
import { formatOrderDate } from "../../../utils/orders";
import { cn } from "../../../utils/cn";

const METRIC_DEFS = [
  { id: "total", label: "Total Orders", icon: Boxes, key: "total" },
  { id: "pending", label: "Pending Payment", icon: Clock, statuses: [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PLACED] },
  { id: "confirmed", label: "Confirmed", icon: CheckCircle2, statuses: [ORDER_STATUS.ORDER_CONFIRMED, ORDER_STATUS.CONFIRMED, ORDER_STATUS.PAYMENT_CONFIRMED] },
  { id: "processing", label: "Processing", icon: Package, statuses: [ORDER_STATUS.PROCESSING] },
  { id: "allocated", label: "Allocated", icon: Boxes, statuses: [ORDER_STATUS.ALLOCATED] },
  { id: "picking", label: "Picking", icon: Boxes, statuses: [ORDER_STATUS.PICKING] },
  { id: "packed", label: "Packed", icon: Package, statuses: [ORDER_STATUS.PACKED] },
  { id: "ready", label: "Ready to Dispatch", icon: Truck, statuses: [ORDER_STATUS.READY_TO_DISPATCH] },
  { id: "shipped", label: "Shipped", icon: Truck, statuses: [ORDER_STATUS.SHIPPED] },
  { id: "out", label: "Out for Delivery", icon: Truck, statuses: [ORDER_STATUS.OUT_FOR_DELIVERY] },
  { id: "delivered", label: "Delivered", icon: CheckCircle2, statuses: [ORDER_STATUS.DELIVERED] },
  { id: "cancelled", label: "Cancelled", icon: X, statuses: [ORDER_STATUS.CANCELLED] },
  { id: "returns", label: "Return Requests", icon: RotateCcw, statuses: [ORDER_STATUS.RETURN_REQUESTED, ORDER_STATUS.RETURNED, ORDER_STATUS.REFUND_PENDING, ORDER_STATUS.REFUNDED] },
];

function MetricCard({ label, value, icon: Icon, highlight }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "border bg-surface/40 p-4",
        highlight ? "border-accent/40 bg-accent/5" : "border-mist/80"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">{label}</p>
          <p className="mt-2 font-display text-2xl font-light text-ink">{value}</p>
        </div>
        <Icon size={16} className={highlight ? "text-accent" : "text-brass"} />
      </div>
    </motion.div>
  );
}

/** Map an order status onto its fulfillment-desk stage (matches the server's
 * FULFILLMENT_STATUS_GROUPS so display and filtering agree). */
const FULFILLMENT_STAGE_BY_STATUS = {
  [ORDER_STATUS.PENDING_PAYMENT]: "PENDING",
  [ORDER_STATUS.PLACED]: "PENDING",
  [ORDER_STATUS.ORDER_CONFIRMED]: "PENDING",
  [ORDER_STATUS.CONFIRMED]: "PENDING",
  [ORDER_STATUS.PAYMENT_CONFIRMED]: "PENDING",
  [ORDER_STATUS.PROCESSING]: "PENDING",
  [ORDER_STATUS.ALLOCATED]: "ALLOCATED",
  [ORDER_STATUS.PICKING]: "PICKING",
  [ORDER_STATUS.PACKED]: "PACKED",
  [ORDER_STATUS.READY_TO_DISPATCH]: "READY_TO_DISPATCH",
  [ORDER_STATUS.SHIPPED]: "SHIPPED",
  [ORDER_STATUS.OUT_FOR_DELIVERY]: "OUT_FOR_DELIVERY",
  [ORDER_STATUS.DELIVERED]: "DELIVERED",
  [ORDER_STATUS.CANCELLED]: "CANCELLED",
};

export default function AdminOrders() {
  /**
   * BACKEND CONTRACT (admin consolidation, HP-4): the desk requests exactly
   * the page it displays — search, status, payment, fulfillment stage, date
   * window and value band all filter server-side against real columns, and
   * the metric tiles read ONE grouped status count over the WHOLE order
   * book. It no longer pulls a 100-order snapshot into memory and filters
   * it in the browser.
   */
  const { refreshAdminOrders, isLoadingOrders, ordersError, ordersErrorStatus } = useOrder();

  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const [serverPage, setServerPage] = useState({ orders: [], total: 0, statusCounts: null });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [valueFilter, setValueFilter] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Debounce the search box into the server query.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const createdSince = useMemo(() => {
    if (dateFilter === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    const days = dateFilter === "week" ? 7 : dateFilter === "month" ? 30 : null;
    if (!days) return undefined;
    return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  }, [dateFilter]);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: statusFilter !== "all" ? statusFilter : undefined,
      paymentStatus: paymentFilter !== "all" ? paymentFilter : undefined,
      fulfillment: fulfillmentFilter !== "all" ? fulfillmentFilter : undefined,
      createdSince,
      valueBand: valueFilter !== "all" ? valueFilter : undefined,
      q: search || undefined,
    }),
    [page, statusFilter, paymentFilter, fulfillmentFilter, createdSince, valueFilter, search]
  );

  useEffect(() => {
    let alive = true;
    refreshAdminOrders(queryParams).then((result) => {
      if (!alive || !result.ok) return;
      setServerPage({
        orders: result.orders ?? [],
        total: result.total ?? 0,
        statusCounts: result.statusCounts ?? null,
      });
    });
    return () => { alive = false; };
  }, [queryParams, attempt, refreshAdminOrders]);

  const retry = () => setAttempt((a) => a + 1);

  const resetToFirstPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const orders = serverPage.orders;

  // Tiles read the grouped status counts over the whole order book —
  // exact numbers, never "whatever happened to be on the page".
  const metrics = useMemo(() => {
    const counts = serverPage.statusCounts ?? {};
    const statusCount = (statuses) =>
      statuses.reduce((sum, status) => sum + (Number(counts[status]) || 0), 0);
    const total = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
    return {
      total,
      pending: statusCount([ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PLACED]),
      confirmed: statusCount([ORDER_STATUS.ORDER_CONFIRMED, ORDER_STATUS.CONFIRMED, ORDER_STATUS.PAYMENT_CONFIRMED]),
      processing: statusCount([ORDER_STATUS.PROCESSING]),
      allocated: statusCount([ORDER_STATUS.ALLOCATED]),
      picking: statusCount([ORDER_STATUS.PICKING]),
      packed: statusCount([ORDER_STATUS.PACKED]),
      ready: statusCount([ORDER_STATUS.READY_TO_DISPATCH]),
      shipped: statusCount([ORDER_STATUS.SHIPPED]),
      out: statusCount([ORDER_STATUS.OUT_FOR_DELIVERY]),
      delivered: statusCount([ORDER_STATUS.DELIVERED]),
      cancelled: statusCount([ORDER_STATUS.CANCELLED]),
      returns: statusCount([ORDER_STATUS.RETURN_REQUESTED, ORDER_STATUS.RETURNED, ORDER_STATUS.REFUND_PENDING, ORDER_STATUS.REFUNDED]),
    };
  }, [serverPage.statusCounts]);

  const filtered = orders;

  const totalPages = Math.max(1, Math.ceil(serverPage.total / PAGE_SIZE));
  const rangeStart = serverPage.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(serverPage.total, page * PAGE_SIZE);

  const fulfillmentStage = (order) =>
    FULFILLMENT_STAGE_BY_STATUS[order.status] || order.fulfillment?.status || "PENDING";
  return (
    <AdminPage
      eyebrow="Sales / Orders"
      title={
        <>
          Order <span className="italic text-accent">management.</span>
        </>
      }
      description="One connected retail operation — customer checkout, inventory reservation, fulfillment and delivery."
      actions={
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 border border-mist bg-canvas px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink md:hidden"
        >
          <Filter size={12} /> Filters
        </button>
      }
    >
      {/* Loading / error — never rendered as an empty order book. */}
      {isLoadingOrders && serverPage.orders.length === 0 ? (
        <p role="status" aria-live="polite" aria-busy="true" className="mb-6 border border-mist/80 bg-surface/40 px-4 py-3 font-ui text-[11px] text-taupe">
          Loading orders…
        </p>
      ) : null}
      {ordersError ? (
        <div role="alert" className="mb-6 border border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent">
          {ordersErrorStatus === 401
            ? "Your admin session has expired. Sign in again to load orders."
            : ordersErrorStatus === 403
              ? "Your role does not include permission to view orders."
              : ordersError}
          {ordersErrorStatus !== 401 && ordersErrorStatus !== 403 ? (
            <button type="button" onClick={() => refreshAdminOrders()} className="ml-2 uppercase tracking-[.14em] underline-offset-2 hover:underline">
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Metrics */}
      <section aria-label="Order metrics" className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {METRIC_DEFS.map((def) => (
          <MetricCard
            key={def.id}
            label={def.label}
            value={def.key ? metrics[def.key] : metrics[def.id] ?? 0}
            icon={def.icon}
            highlight={def.id === "total"}
          />
        ))}
      </section>

      {/* Filters — desktop */}
      <AdminPanel eyebrow="Operations" title="Order queue" bodyClassName="px-0 py-0 sm:px-0">
        <div className="hidden border-b border-mist/60 bg-canvas/40 p-4 md:block">
          <div className="grid gap-3 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                Search
                <div className="relative mt-1.5">
                  <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Order, customer, phone, product, SKU, tracking"
                    className="h-9 w-full border border-mist bg-canvas pl-9 pr-3 font-ui text-xs text-ink outline-none focus:border-accent"
                  />
                </div>
              </label>
            </div>
            <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe lg:col-span-2">
              Status
              <select value={statusFilter} onChange={(e) => resetToFirstPage(setStatusFilter)(e.target.value)} className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs outline-none focus:border-accent">
                <option value="all">All statuses</option>
                {Object.values(ORDER_STATUS).map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
            <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe lg:col-span-2">
              Payment
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs outline-none focus:border-accent">
                <option value="all">All payments</option>
                {Object.values(ORDER_PAYMENT_STATUS).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe lg:col-span-2">
              Fulfillment
              <select value={fulfillmentFilter} onChange={(e) => setFulfillmentFilter(e.target.value)} className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs outline-none focus:border-accent">
                <option value="all">All fulfillment</option>
                {Object.values(FULFILLMENT_STATUS).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe lg:col-span-2">
              Placed
              <select value={dateFilter} onChange={(e) => resetToFirstPage(setDateFilter)(e.target.value)} className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs outline-none focus:border-accent">
                <option value="all">All dates</option>
                <option value="today">Today</option>
                <option value="week">Last 7 days</option>
                <option value="month">Last 30 days</option>
              </select>
            </label>
            <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe lg:col-span-2">
              Value
              <select value={valueFilter} onChange={(e) => resetToFirstPage(setValueFilter)(e.target.value)} className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs outline-none focus:border-accent">
                <option value="all">All values</option>
                <option value="low">Under ₹5k</option>
                <option value="mid">₹5k–₹20k</option>
                <option value="high">Above ₹20k</option>
              </select>
            </label>
            <div className="flex gap-2 lg:col-span-12">
              <button
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setStatusFilter("all");
                  setPaymentFilter("all");
                  setFulfillmentFilter("all");
                  setDateFilter("all");
                  setValueFilter("all");
                  setPage(1);
                }}
                className="px-3 font-ui text-[10px] uppercase tracking-[.13em] text-accent hover:underline"
              >
                Clear
              </button>
              <span className="ml-auto font-ui text-[11px] text-taupe self-center">{filtered.length} orders</span>
            </div>
          </div>
        </div>

        {/* Mobile filter chip row */}
        <div className="flex gap-2 overflow-x-auto border-b border-mist/60 bg-canvas/40 p-3 md:hidden">
          <div className="relative min-w-[200px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-taupe" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search orders"
              className="h-8 w-full border border-mist bg-canvas pl-7 pr-2 font-ui text-xs outline-none"
            />
          </div>
          <span className="font-ui text-[11px] text-taupe self-center whitespace-nowrap">
            {serverPage.total} order{serverPage.total === 1 ? "" : "s"}
          </span>
        </div>

        {/* Table desktop */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left">
            <thead className="border-b border-mist/80 bg-canvas/80">
              <tr>
                {["Order ID", "Customer", "Items", "Amount", "Payment", "Order Status", "Fulfillment", "Location", "Created", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 font-ui text-[10px] uppercase tracking-[.16em] text-taupe">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr key={order.id} className="border-b border-mist/50 last:border-0 hover:bg-surface/30">
                  <td className="px-4 py-3 font-mono text-xs text-ink">
                    <Link to={`/admin/orders/${order.id}`} className="text-brass hover:text-accent hover:underline">{order.orderNumber ?? order.id}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-ui text-sm text-ink">{order.customer?.fullName}</p>
                    <p className="font-ui text-[11px] text-taupe">{order.customer?.email}</p>
                  </td>
                  <td className="px-4 py-3 font-ui text-sm">{order.items?.length} item{order.items?.length !== 1 ? "s" : ""} · {order.items?.reduce((s, i) => s + i.quantity, 0)} pcs</td>
                  <td className="px-4 py-3 font-ui text-sm">{formatINR(order.pricing?.total)}</td>
                  <td className="px-4 py-3"><OrderStatusBadge status={order.paymentStatus} kind="payment" /></td>
                  <td className="px-4 py-3"><OrderStatusBadge status={order.status} /></td>
                  <td className="px-4 py-3 font-ui text-[11px]">{fulfillmentStage(order)}</td>
                  <td className="px-4 py-3 font-ui text-[11px] text-taupe">{formatOrderDate(order.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/orders/${order.id}`} className="inline-flex items-center gap-1 font-ui text-[11px] text-brass hover:text-accent">
                      <Eye size={12} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && !isLoadingOrders && !ordersError && (
            <p className="p-8 text-center font-ui text-sm text-taupe">No orders match these filters.</p>
          )}
          {filtered.length === 0 && isLoadingOrders && (
            <p role="status" aria-live="polite" aria-busy="true" className="p-8 text-center font-ui text-sm text-taupe">Loading orders…</p>
          )}

          {/* Server pagination (HP-4): one bounded page per request. */}
          <div className="flex items-center justify-between border-t border-mist/60 px-4 py-3">
            <p className="font-ui text-[11px] text-taupe" aria-live="polite">
              {serverPage.total > 0 ? `Showing ${rangeStart}–${rangeEnd} of ${serverPage.total}` : "No orders"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoadingOrders}
                className="border border-mist bg-canvas px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe disabled:opacity-40"
              >
                Prev
              </button>
              <span className="font-ui text-[11px] text-ink">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoadingOrders}
                className="border border-mist bg-canvas px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Cards mobile */}
        <div className="grid gap-3 p-3 md:hidden">
          {filtered.map((order) => (
            <Link key={order.id} to={`/admin/orders/${order.id}`} className="border border-mist/70 bg-canvas p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-ink">{order.orderNumber ?? order.id}</p>
                  <p className="mt-1 font-ui text-sm text-ink">{order.customer?.fullName}</p>
                  <p className="font-ui text-[11px] text-taupe">{order.items?.length} items · {formatINR(order.pricing?.total)}</p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <OrderStatusBadge status={order.paymentStatus} kind="payment" />
                <span className="font-ui text-[10px] px-2 py-1 border border-mist bg-surface text-taupe">{fulfillmentStage(order)}</span>
              </div>
              <p className="mt-2 font-ui text-[10px] text-taupe">{formatOrderDate(order.createdAt)} · {order.customer?.email}</p>
            </Link>
          ))}
        </div>
      </AdminPanel>

      {/* Filter drawer mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm md:hidden">
          <div className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-ivory shadow-xl overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-6">
              <p className="font-ui text-[11px] uppercase tracking-[.2em] text-accent">Filters</p>
              <button onClick={() => setDrawerOpen(false)} className="p-2 text-taupe"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Search
                <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Order, customer" className="mt-1.5 h-9 w-full border border-mist bg-canvas px-3 font-ui text-xs" />
              </label>
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Status
                <select value={statusFilter} onChange={(e) => resetToFirstPage(setStatusFilter)(e.target.value)} className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs">
                  <option value="all">All</option>
                  {Object.values(ORDER_STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Payment
                <select value={paymentFilter} onChange={(e) => resetToFirstPage(setPaymentFilter)(e.target.value)} className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs">
                  <option value="all">All</option>
                  {Object.values(ORDER_PAYMENT_STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Fulfillment
                <select value={fulfillmentFilter} onChange={(e) => resetToFirstPage(setFulfillmentFilter)(e.target.value)} className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs">
                  <option value="all">All</option>
                  {Object.values(FULFILLMENT_STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <button onClick={() => setDrawerOpen(false)} className="mt-6 w-full bg-ink text-ivory py-3 font-ui text-[11px] uppercase tracking-[.16em]">Apply</button>
            </div>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
