/**
 * PRATIKSHYA FASHION — Admin Payments Dashboard
 *
 * Paginated payments desk: status metrics, filters (status, method, search),
 * server-paginated table (desktop) / cards (mobile), row click → detail.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Search,
  Filter,
  Eye,
  RefreshCw,
} from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { apiAdminListPayments } from "../../../services/api/paymentsApi";
import { cn } from "../../../utils/cn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatINR(paise) {
  const rupees = (paise ?? 0) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(rupees);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CAPTURED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-stone-100 text-stone-500 border-stone-200",
  EXPIRED: "bg-stone-100 text-stone-500 border-stone-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CREATED: "bg-amber-50 text-amber-700 border-amber-200",
  REFUNDED: "bg-blue-50 text-blue-700 border-blue-200",
  PARTIALLY_REFUNDED: "bg-blue-50 text-blue-600 border-blue-200",
  REFUND_PENDING: "bg-blue-50 text-blue-600 border-blue-200",
};

function PaymentStatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? "bg-stone-100 text-stone-500 border-stone-200";
  return (
    <span
      className={cn(
        "inline-block border px-2 py-0.5 font-ui text-[9px] uppercase tracking-[.14em]",
        style
      )}
    >
      {status?.replace(/_/g, " ") ?? "—"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

const METRIC_DEFS = [
  { id: "total",    label: "Total Sessions",  icon: CreditCard,   statuses: null },
  { id: "paid",     label: "Paid",            icon: CheckCircle2, statuses: ["PAID", "CAPTURED"] },
  { id: "pending",  label: "Pending",         icon: Clock,        statuses: ["CREATED", "PENDING"] },
  { id: "failed",   label: "Failed",          icon: XCircle,      statuses: ["FAILED", "EXPIRED"] },
  { id: "refunded", label: "Refunded",        icon: RotateCcw,    statuses: ["REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"] },
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

// ---------------------------------------------------------------------------
// Method label
// ---------------------------------------------------------------------------

function methodLabel(m) {
  if (!m) return "—";
  const map = { upi: "UPI", card: "Card", netbanking: "Net Banking", cod: "COD" };
  return map[m.toLowerCase()] ?? m.toUpperCase();
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  "PAID", "FAILED", "PENDING", "CREATED", "CANCELLED",
  "EXPIRED", "REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING",
];

export default function AdminPayments() {
  const { isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";
  const navigate = useNavigate();

  const [page, setPage]           = useState(1);
  const [serverPage, setServerPage] = useState({ sessions: [], total: 0, statusCounts: null });
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [attempt, setAttempt]     = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter]   = useState("all");
  const [methodFilter, setMethodFilter]   = useState("all");
  const [drawerOpen, setDrawerOpen]       = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queryParams = useMemo(() => ({
    page,
    pageSize: PAGE_SIZE,
    status:        statusFilter !== "all" ? statusFilter : undefined,
    paymentMethod: methodFilter !== "all" ? methodFilter : undefined,
  }), [page, statusFilter, methodFilter]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiAdminListPayments({ ...queryParams, isSuperAdmin }).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result.ok) {
        setServerPage({
          sessions:     result.sessions ?? [],
          total:        result.total ?? 0,
          statusCounts: result.statusCounts ?? null,
        });
      } else {
        setError({ status: result.status, message: result.error });
      }
    });
    return () => { alive = false; };
  }, [queryParams, attempt]);

  const retry = () => setAttempt((a) => a + 1);

  const resetPage = (setter) => (val) => { setter(val); setPage(1); };

  // Metric values from status counts
  const metrics = useMemo(() => {
    const counts = serverPage.statusCounts ?? {};
    const sum = (...statuses) => statuses.reduce((acc, s) => acc + (Number(counts[s]) || 0), 0);
    const total = Object.values(counts).reduce((acc, n) => acc + (Number(n) || 0), 0);
    return {
      total,
      paid:     sum("PAID", "CAPTURED"),
      pending:  sum("CREATED", "PENDING"),
      failed:   sum("FAILED", "EXPIRED"),
      refunded: sum("REFUNDED", "PARTIALLY_REFUNDED", "REFUND_PENDING"),
    };
  }, [serverPage.statusCounts]);

  // Client-side search filter (on the current page's sessions)
  const visibleSessions = useMemo(() => {
    if (!search) return serverPage.sessions;
    const q = search.toLowerCase();
    return serverPage.sessions.filter(
      (s) =>
        (s.id ?? "").toLowerCase().includes(q) ||
        (s.orderNumber ?? "").toLowerCase().includes(q) ||
        (s.razorpayOrderId ?? "").toLowerCase().includes(q) ||
        (s.razorpayPaymentId ?? "").toLowerCase().includes(q) ||
        (s.customerName ?? "").toLowerCase().includes(q) ||
        (s.customerEmail ?? "").toLowerCase().includes(q)
    );
  }, [serverPage.sessions, search]);

  const totalPages = Math.max(1, Math.ceil(serverPage.total / PAGE_SIZE));

  return (
    <AdminPage
      eyebrow="Finance / Payments"
      title={<>Payment <span className="italic text-accent">sessions.</span></>}
      description="All Razorpay payment sessions — track, refund, and reconcile transactions across every order."
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1.5 border border-mist bg-canvas px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink"
          >
            <RefreshCw size={11} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 border border-mist bg-canvas px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink md:hidden"
          >
            <Filter size={12} /> Filters
          </button>
        </div>
      }
    >
      {/* Loading */}
      {loading && serverPage.sessions.length === 0 ? (
        <p role="status" aria-live="polite" aria-busy="true" className="mb-6 border border-mist/80 bg-surface/40 px-4 py-3 font-ui text-[11px] text-taupe">
          Loading payments…
        </p>
      ) : null}

      {/* Error */}
      {error ? (
        <div role="alert" className="mb-6 border border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent">
          {error.status === 401
            ? "Your admin session has expired. Sign in again."
            : error.status === 403
              ? "Your role does not include permission to view payments."
              : error.message ?? "Something went wrong."}
          {error.status !== 401 && error.status !== 403 ? (
            <button type="button" onClick={retry} className="ml-2 uppercase tracking-[.14em] underline-offset-2 hover:underline">
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Metrics */}
      <section aria-label="Payment metrics" className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {METRIC_DEFS.map((def) => (
          <MetricCard
            key={def.id}
            label={def.label}
            value={metrics[def.id] ?? 0}
            icon={def.icon}
            highlight={def.id === "total"}
          />
        ))}
      </section>

      <AdminPanel eyebrow="Gateway" title="Session ledger" bodyClassName="px-0 py-0 sm:px-0">
        {/* Filters — desktop */}
        <div className="hidden border-b border-mist/60 bg-canvas/40 p-4 md:block">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <span className="mb-1 block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Search</span>
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Session ID, order, Razorpay ID, customer"
                  className="h-9 w-full border border-mist bg-canvas pl-9 pr-3 font-ui text-xs text-ink outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Status */}
            <div className="w-48 shrink-0">
              <span className="mb-1 block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => resetPage(setStatusFilter)(e.target.value)}
                className="h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs outline-none focus:border-accent"
              >
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>

            {/* Method */}
            <div className="w-40 shrink-0">
              <span className="mb-1 block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Method</span>
              <select
                value={methodFilter}
                onChange={(e) => resetPage(setMethodFilter)(e.target.value)}
                className="h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs outline-none focus:border-accent"
              >
                <option value="all">All methods</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="netbanking">Net Banking</option>
                <option value="cod">COD</option>
              </select>
            </div>

            {/* Clear + count */}
            <div className="flex shrink-0 items-center gap-3 self-end pb-0.5">
              <button
                type="button"
                onClick={() => {
                  setSearchInput(""); setSearch("");
                  setStatusFilter("all"); setMethodFilter("all");
                  setPage(1);
                }}
                className="font-ui text-[10px] uppercase tracking-[.13em] text-accent hover:underline"
              >
                Clear
              </button>
              <span className="font-ui text-[11px] text-taupe">
                {serverPage.total} sessions
              </span>
            </div>
          </div>
        </div>

        {/* Mobile filter chips */}
        <div className="flex gap-2 overflow-x-auto border-b border-mist/60 bg-canvas/40 p-3 md:hidden">
          <div className="relative min-w-[180px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-taupe" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search"
              className="h-8 w-full border border-mist bg-canvas pl-7 pr-2 font-ui text-xs outline-none"
            />
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-mist/60 bg-canvas/60">
                {["Order", "Customer", "Amount", "Method", "Status", "Razorpay ID", "Paid At", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-ui text-[9px] uppercase tracking-[.18em] text-taupe">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSessions.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center font-ui text-sm text-taupe">
                    No payment sessions found.
                  </td>
                </tr>
              ) : null}
              {visibleSessions.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`${prefix}/payments/${s.id}`)}
                  className="cursor-pointer border-b border-mist/40 transition-colors hover:bg-surface/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`${prefix}/orders/${s.orderId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-ui text-xs text-brass hover:text-accent hover:underline"
                    >
                      {s.orderNumber ?? s.orderId?.slice(0, 8) ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-ui text-xs text-ink">{s.customerName ?? "—"}</p>
                    {s.customerEmail ? (
                      <p className="font-ui text-[10px] text-taupe">{s.customerEmail}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-ui text-xs text-ink">
                    {formatINR(s.amountPaise)}
                    {(s.refundedAmountPaise ?? 0) > 0 ? (
                      <p className="font-ui text-[10px] text-blue-600">
                        Refunded {formatINR(s.refundedAmountPaise)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-ui text-xs text-taupe">
                    {methodLabel(s.paymentMethod)}
                  </td>
                  <td className="px-4 py-3">
                    <PaymentStatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-taupe">
                    {s.razorpayPaymentId ?? s.razorpayOrderId ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-ui text-[10px] text-taupe">
                    {formatDate(s.paidAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`${prefix}/payments/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 font-ui text-[10px] text-taupe hover:text-accent"
                    >
                      <Eye size={12} /> View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="grid gap-3 p-3 md:hidden">
          {visibleSessions.length === 0 && !loading ? (
            <p className="py-8 text-center font-ui text-sm text-taupe">No payment sessions found.</p>
          ) : null}
          {visibleSessions.map((s) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => navigate(`${prefix}/payments/${s.id}`)}
              className="cursor-pointer border border-mist/80 bg-surface/40 p-4 transition-colors hover:border-ink/20"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                    {s.orderNumber ?? s.orderId?.slice(0, 8) ?? "—"}
                  </p>
                  <p className="mt-0.5 font-display text-base font-light text-ink">
                    {formatINR(s.amountPaise)}
                  </p>
                </div>
                <PaymentStatusBadge status={s.status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <p className="font-ui text-[10px] text-taupe">{s.customerName ?? "Guest"}</p>
                <p className="font-ui text-[10px] text-taupe text-right">{methodLabel(s.paymentMethod)}</p>
                <p className="col-span-2 font-mono text-[9px] text-stone-400 truncate">
                  {s.razorpayPaymentId ?? s.razorpayOrderId ?? "—"}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-mist/60 px-4 py-3">
            <p className="font-ui text-[10px] text-taupe">
              Page {page} of {totalPages} · {serverPage.total} sessions
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="border border-mist px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe disabled:opacity-40 hover:enabled:border-ink hover:enabled:text-ink"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="border border-mist px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe disabled:opacity-40 hover:enabled:border-ink hover:enabled:text-ink"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanel>

      {/* Mobile filter drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative ml-auto flex h-full w-72 flex-col bg-canvas p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-ui text-[10px] uppercase tracking-[.2em] text-accent">Filters</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:text-ink"
              >
                Close
              </button>
            </div>
            <label className="mb-4 block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
              Status
              <select
                value={statusFilter}
                onChange={(e) => { resetPage(setStatusFilter)(e.target.value); setDrawerOpen(false); }}
                className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs"
              >
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
            <label className="mb-4 block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
              Method
              <select
                value={methodFilter}
                onChange={(e) => { resetPage(setMethodFilter)(e.target.value); setDrawerOpen(false); }}
                className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs"
              >
                <option value="all">All methods</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="netbanking">Net Banking</option>
                <option value="cod">COD</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all"); setMethodFilter("all"); setPage(1); setDrawerOpen(false);
              }}
              className="mt-auto font-ui text-[10px] uppercase tracking-[.14em] text-accent hover:underline"
            >
              Clear all
            </button>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}
