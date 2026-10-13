/**
 * PRATIKSHYA FASHION — Admin Leave Queue
 *
 * Main leave management dashboard. Lists all employee leave requests with
 * status filters and employee search. Clicking a row opens the decision
 * modal so admins with `people.manage` can approve or reject in place.
 *
 * Requires `people.view` capability to access this page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarOff,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import AdminLeaveDecisionModal from "./AdminLeaveDecisionModal";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { apiAdminLeave } from "../../../services/workforce/workforceApi";
import { cn } from "../../../utils/cn";

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const STATUS_TABS = [
  { value: "",          label: "All" },
  { value: "PENDING",   label: "Pending" },
  { value: "APPROVED",  label: "Approved" },
  { value: "REJECTED",  label: "Rejected" },
];

const LEAVE_TYPE_LABELS = {
  ANNUAL:    "Annual",
  SICK:      "Sick",
  CASUAL:    "Casual",
  MATERNITY: "Maternity",
  PATERNITY: "Paternity",
  UNPAID:    "Unpaid",
  OTHER:     "Other",
};

// Status badge tone map
const STATUS_BADGE = {
  PENDING:   "border border-amber-400/40 bg-amber-50 text-amber-700",
  APPROVED:  "border border-emerald-400/30 bg-emerald-50 text-emerald-700",
  REJECTED:  "border border-accent/25 bg-accent/10 text-accent",
  CANCELLED: "border border-mist bg-surface text-cocoa",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-NP", { year: "numeric", month: "short", day: "numeric" });
}

function formatDatetime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-NP", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function dateRange(leave) {
  if (!leave.startDate) return "—";
  if (!leave.endDate || leave.startDate === leave.endDate) return formatDate(leave.startDate);
  return `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 font-ui text-[11px]",
        STATUS_BADGE[status] ?? STATUS_BADGE.CANCELLED
      )}
    >
      {status ?? "—"}
    </span>
  );
}

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
          <p className="mt-2 font-display text-2xl font-light text-ink">{value ?? "—"}</p>
        </div>
        <Icon size={16} className={highlight ? "text-accent" : "text-brass"} />
      </div>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AdminLeaveQueue() {
  const { hasPermission } = useAdminAuth();
  const canView   = hasPermission("people.view");
  const canDecide = hasPermission("people.manage");

  // ── Filter state ──
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [page, setPage] = useState(1);

  // ── Data state ──
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ── Modal state ──
  const [selectedLeave, setSelectedLeave] = useState(null);

  // ── Fetch ──
  const load = useCallback(async ({ status, employeeId, pg } = {}) => {
    setLoading(true);
    setError(null);
    const result = await apiAdminLeave({
      status:     status     !== undefined ? status     : statusFilter,
      employeeId: employeeId !== undefined ? employeeId : (employeeSearch.trim() || undefined),
      page:       pg         !== undefined ? pg         : page,
      pageSize:   PAGE_SIZE,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to load leave requests.");
      setItems([]);
      setTotal(0);
    } else {
      setItems(result.items ?? []);
      setTotal(result.total ?? (result.items ?? []).length);
    }
  }, [statusFilter, employeeSearch, page]);

  useEffect(() => { load(); }, [load]);

  // ── Summary counts from current page (best effort without a summary endpoint) ──
  const summary = useMemo(() => {
    const pending  = items.filter((r) => r.status === "PENDING").length;
    const approved = items.filter((r) => r.status === "APPROVED").length;
    const rejected = items.filter((r) => r.status === "REJECTED").length;
    return { pending, approved, rejected, total: items.length };
  }, [items]);

  // ── Filter tab change ──
  const handleTabChange = (value) => {
    setStatusFilter(value);
    setPage(1);
    load({ status: value, pg: 1 });
  };

  // ── Employee search submit ──
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    load({ pg: 1 });
  };

  const handleSearchClear = () => {
    setEmployeeSearch("");
    setPage(1);
    load({ employeeId: undefined, pg: 1 });
  };

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handlePrevPage = () => {
    if (page <= 1) return;
    const next = page - 1;
    setPage(next);
    load({ pg: next });
  };

  const handleNextPage = () => {
    if (page >= totalPages) return;
    const next = page + 1;
    setPage(next);
    load({ pg: next });
  };

  // ── Modal callbacks ──
  const handleRowClick = (leave) => setSelectedLeave(leave);

  const handleDecided = (updatedRecord) => {
    // Optimistically replace the record in the list
    setItems((prev) =>
      prev.map((r) => (r.id === updatedRecord.id ? { ...r, ...updatedRecord } : r))
    );
    setSelectedLeave(null);
    // Refresh to reflect server truth (status counts may shift)
    load();
  };

  // ── Access guard ──
  if (!canView) {
    return (
      <AdminPage
        eyebrow="Workforce / Leave"
        title={<>Leave <span className="italic text-accent">management.</span></>}
      >
        <div className="border border-mist/80 bg-surface/40 px-6 py-8 text-center">
          <p className="font-ui text-sm text-taupe">
            You do not have permission to view leave requests.
          </p>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      eyebrow="Workforce / Leave"
      title={
        <>
          Leave <span className="italic text-accent">management.</span>
        </>
      }
      description="Review and action employee leave requests across the organisation."
    >
      {/* ── Summary metrics ── */}
      <section
        aria-label="Leave summary"
        className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard label="Pending"  value={summary.pending}  icon={Clock}         highlight />
        <MetricCard label="Approved" value={summary.approved} icon={CheckCircle2}             />
        <MetricCard label="Rejected" value={summary.rejected} icon={XCircle}                  />
        <MetricCard label="Showing"  value={summary.total}    icon={CalendarOff}              />
      </section>

      {/* ── Main panel ── */}
      <AdminPanel
        eyebrow={`${total} record${total === 1 ? "" : "s"}`}
        title="Leave requests"
        bodyClassName="px-0 py-0 sm:px-0"
      >
        {/* Filter bar */}
        <div className="space-y-3 border-b border-mist/60 bg-canvas/40 p-4">
          {/* Status tabs */}
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={statusFilter === tab.value}
                type="button"
                onClick={() => handleTabChange(tab.value)}
                className={cn(
                  "px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] transition-colors",
                  statusFilter === tab.value
                    ? "border border-ink bg-ink text-ivory"
                    : "border border-mist bg-canvas text-taupe hover:border-ink/40 hover:text-ink"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Employee search */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center gap-2"
            role="search"
            aria-label="Search by employee"
          >
            <label className="flex flex-1 items-center gap-2 border border-mist bg-canvas px-3 py-2 focus-within:border-accent">
              <Search size={13} className="shrink-0 text-taupe" aria-hidden="true" />
              <input
                type="search"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search by employee name or ID…"
                className="w-full bg-transparent font-ui text-xs text-ink placeholder:text-taupe/60 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="border border-ink bg-ink px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ivory hover:bg-ink/80"
            >
              Search
            </button>
            {employeeSearch ? (
              <button
                type="button"
                onClick={handleSearchClear}
                className="px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:text-ink"
              >
                Clear
              </button>
            ) : null}
          </form>
        </div>

        {/* Loading */}
        {loading && items.length === 0 ? (
          <p
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="border-b border-mist/60 px-4 py-3 font-ui text-[11px] text-taupe"
          >
            Loading leave requests…
          </p>
        ) : null}

        {/* Error */}
        {error ? (
          <div
            role="alert"
            className="border-b border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent"
          >
            {error}
            <button
              type="button"
              onClick={() => load()}
              className="ml-2 uppercase tracking-[.14em] underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* ── Desktop table ── */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left">
            <thead className="border-b border-mist/80 bg-canvas/80">
              <tr>
                {["Employee", "Type", "Date range", "Days", "Reason", "Status", "Requested at"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 font-ui text-[10px] uppercase tracking-[.16em] text-taupe"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => handleRowClick(row)}
                  className="cursor-pointer border-b border-mist/50 last:border-0 hover:bg-surface/30"
                  title="Click to review"
                >
                  {/* Employee */}
                  <td className="px-4 py-3">
                    <p className="font-ui text-sm text-ink">
                      {row.employeeName ?? row.employee_name ?? "—"}
                    </p>
                    {row.employeeId ?? row.employee_id ? (
                      <p className="font-ui text-[11px] text-taupe">
                        {row.employeeId ?? row.employee_id}
                      </p>
                    ) : null}
                  </td>

                  {/* Leave type */}
                  <td className="px-4 py-3 font-ui text-sm text-ink">
                    {LEAVE_TYPE_LABELS[row.leaveType ?? row.leave_type] ??
                      row.leaveType ?? row.leave_type ?? "—"}
                  </td>

                  {/* Date range */}
                  <td className="px-4 py-3 font-ui text-sm text-ink">
                    {dateRange({
                      startDate: row.startDate ?? row.start_date,
                      endDate:   row.endDate   ?? row.end_date,
                    })}
                  </td>

                  {/* Days */}
                  <td className="px-4 py-3 font-ui text-sm text-ink">
                    {row.days ?? "—"}
                  </td>

                  {/* Reason */}
                  <td className="max-w-[200px] px-4 py-3">
                    <p className="truncate font-ui text-sm text-ink" title={row.reason}>
                      {row.reason ?? <span className="text-taupe">—</span>}
                    </p>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>

                  {/* Requested at */}
                  <td className="whitespace-nowrap px-4 py-3 font-ui text-sm text-taupe">
                    {formatDatetime(row.requestedAt ?? row.requested_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {items.length === 0 && !loading && !error ? (
            <p className="p-8 text-center font-ui text-sm text-taupe">
              {statusFilter
                ? `No ${statusFilter.toLowerCase()} leave requests.`
                : "No leave requests found."}
            </p>
          ) : null}
        </div>

        {/* ── Mobile cards ── */}
        <div className="grid gap-3 p-3 md:hidden">
          {items.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => handleRowClick(row)}
              className="w-full border border-mist/70 bg-canvas p-4 text-left hover:border-ink/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-ui text-sm text-ink">
                    {row.employeeName ?? row.employee_name ?? "—"}
                  </p>
                  <p className="mt-0.5 font-ui text-[11px] text-taupe">
                    {LEAVE_TYPE_LABELS[row.leaveType ?? row.leave_type] ??
                      row.leaveType ?? row.leave_type ?? "—"}
                    {" · "}
                    {dateRange({
                      startDate: row.startDate ?? row.start_date,
                      endDate:   row.endDate   ?? row.end_date,
                    })}
                    {row.days != null ? ` · ${row.days}d` : ""}
                  </p>
                  {row.reason ? (
                    <p className="mt-1 truncate font-ui text-[11px] text-taupe" title={row.reason}>
                      {row.reason}
                    </p>
                  ) : null}
                </div>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-2 font-ui text-[11px] text-taupe">
                {formatDatetime(row.requestedAt ?? row.requested_at)}
              </p>
            </button>
          ))}

          {items.length === 0 && !loading && !error ? (
            <p className="py-6 text-center font-ui text-sm text-taupe">
              {statusFilter
                ? `No ${statusFilter.toLowerCase()} leave requests.`
                : "No leave requests found."}
            </p>
          ) : null}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-mist/60 px-4 py-3">
            <p className="font-ui text-[11px] text-taupe">
              Page {page} of {totalPages} · {total} total
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={page <= 1 || loading}
                aria-label="Previous page"
                className="flex h-8 w-8 items-center justify-center border border-mist bg-canvas text-taupe hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={page >= totalPages || loading}
                aria-label="Next page"
                className="flex h-8 w-8 items-center justify-center border border-mist bg-canvas text-taupe hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanel>

      {/* ── Decision modal ── */}
      {selectedLeave ? (
        <AdminLeaveDecisionModal
          leave={{
            ...selectedLeave,
            // normalise snake_case fields the modal expects in camelCase
            employeeName: selectedLeave.employeeName ?? selectedLeave.employee_name,
            employeeId:   selectedLeave.employeeId   ?? selectedLeave.employee_id,
            leaveType:    selectedLeave.leaveType    ?? selectedLeave.leave_type,
            startDate:    selectedLeave.startDate    ?? selectedLeave.start_date,
            endDate:      selectedLeave.endDate      ?? selectedLeave.end_date,
            requestedAt:  selectedLeave.requestedAt  ?? selectedLeave.requested_at,
          }}
          canDecide={canDecide}
          onDecided={handleDecided}
          onClose={() => setSelectedLeave(null)}
        />
      ) : null}
    </AdminPage>
  );
}
