/**
 * PRATIKSHYA FASHION — Admin Attendance Day View
 *
 * Daily attendance snapshot: date picker, summary metrics, filterable
 * employee table. Requires `attendance.view` capability.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Clock,
  UserX,
  CalendarOff,
  HelpCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { apiAdminAttendanceDay } from "../../../services/workforce/workforceApi";
import {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_DEFINITIONS,
  getAttendanceStatus,
} from "../../../config/attendanceConfig";
import {
  todayKey,
  formatDateLong,
  formatTime,
  formatMinutes,
  addDays,
} from "../../../services/workforce/dateUtils";
import { cn } from "../../../utils/cn";

// ── Tone → Tailwind class map ──────────────────────────────────────────────

const BADGE_TONE = {
  ink: "bg-pf-burgundy text-pf-ivory",
  brass: "border border-pf-gold-deep/30 bg-pf-gold/10 text-pf-gold-text",
  danger: "border border-pf-gold-deep/25 bg-pf-burgundy/10 text-pf-burgundy",
  quiet: "border border-pf-border bg-pf-ivory text-pf-cocoa",
  accent: "border border-pf-gold-deep/25 bg-pf-burgundy/10 text-pf-burgundy",
  muted: "border border-pf-border bg-pf-ivory text-pf-muted",
  alert: "border border-amber-400/40 bg-amber-50 text-amber-700",
};

function StatusBadge({ status }) {
  const def = getAttendanceStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 font-ui text-[11px]",
        BADGE_TONE[def.tone] ?? BADGE_TONE.quiet
      )}
    >
      {def.label}
    </span>
  );
}

// ── Summary metric card ────────────────────────────────────────────────────

function MetricCard({ label, value, icon: Icon, highlight }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "border bg-pf-ivory/40 p-4",
        highlight ? "border-pf-gold-deep/40 bg-pf-burgundy/5" : "border-pf-border/80"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-ui text-[9px] uppercase tracking-[.18em] text-pf-muted">{label}</p>
          <p className="mt-2 font-display text-2xl font-light text-pf-text">{value ?? "—"}</p>
        </div>
        <Icon size={16} className={highlight ? "text-pf-burgundy" : "text-pf-gold-text"} />
      </div>
    </motion.div>
  );
}

// ── Status filter options ──────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  ...Object.values(ATTENDANCE_STATUS_DEFINITIONS).map((def) => ({
    value: def.id,
    label: def.label,
  })),
];

// ── Main component ─────────────────────────────────────────────────────────

export default function AdminAttendanceDay() {
  const { isSuperAdmin } = useAdminAuth();
  const _prefix = isSuperAdmin ? "/super-admin" : "/admin"; // reserved for future links

  const [date, setDate] = useState(todayKey());
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async (targetDate) => {
    setLoading(true);
    setError(null);
    const result = await apiAdminAttendanceDay(targetDate);
    setLoading(false);
    if (!result.ok) {
      setError(result.message ?? "Failed to load attendance.");
      setItems([]);
      setSummary({});
    } else {
      setItems(result.items ?? []);
      setSummary(result.summary ?? {});
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const filtered = useMemo(
    () => (statusFilter ? items.filter((r) => r.status === statusFilter) : items),
    [items, statusFilter]
  );

  const handlePrevDay = () => setDate((d) => addDays(d, -1));
  const handleNextDay = () => {
    const next = addDays(date, 1);
    if (next <= todayKey()) setDate(next);
  };
  const isToday = date === todayKey();

  return (
    <AdminPage
      eyebrow="Workforce / Attendance"
      title={
        <>
          Daily <span className="italic text-pf-burgundy">attendance.</span>
        </>
      }
      description="Full workforce attendance snapshot for a selected date — punches, status and working time."
    >
      {/* ── Date navigator ── */}
      <div className="mb-7 flex items-center gap-3">
        <button
          type="button"
          onClick={handlePrevDay}
          className="flex h-9 w-9 items-center justify-center border border-pf-border bg-pf-card text-pf-muted hover:border-pf-burgundy hover:text-pf-text"
          aria-label="Previous day"
        >
          <ChevronLeft size={14} />
        </button>

        <label className="flex items-center gap-2 font-ui text-[10px] uppercase tracking-[.14em] text-pf-muted">
          Date
          <input
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-9 border border-pf-border bg-pf-card px-3 font-ui text-xs text-pf-text outline-none focus:border-pf-gold-deep"
          />
        </label>

        <button
          type="button"
          onClick={handleNextDay}
          disabled={isToday}
          className="flex h-9 w-9 items-center justify-center border border-pf-border bg-pf-card text-pf-muted hover:border-pf-burgundy hover:text-pf-text disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next day"
        >
          <ChevronRight size={14} />
        </button>

        <span className="font-ui text-xs text-pf-muted">{formatDateLong(date)}</span>

        {!isToday && (
          <button
            type="button"
            onClick={() => setDate(todayKey())}
            className="ml-auto font-ui text-[10px] uppercase tracking-[.14em] text-pf-gold-text hover:text-pf-burgundy hover:underline"
          >
            Today
          </button>
        )}
      </div>

      {/* ── Loading / error ── */}
      {loading && items.length === 0 ? (
        <p
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="mb-6 border border-pf-border/80 bg-pf-ivory/40 px-4 py-3 font-ui text-[11px] text-pf-muted"
        >
          Loading attendance…
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-6 border border-pf-gold-deep/30 bg-pf-burgundy/5 px-4 py-3 font-ui text-[11px] text-pf-burgundy"
        >
          {error}
          <button
            type="button"
            onClick={() => load(date)}
            className="ml-2 uppercase tracking-[.14em] underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* ── Summary metrics ── */}
      <section aria-label="Attendance summary" className="mb-7 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Present" value={summary.present ?? 0} icon={Users} highlight />
        <MetricCard label="Late" value={summary.late ?? 0} icon={Clock} />
        <MetricCard label="Absent" value={summary.absent ?? 0} icon={UserX} />
        <MetricCard label="On Leave" value={summary.on_leave ?? summary.leave ?? 0} icon={CalendarOff} />
        <MetricCard label="Not Checked In" value={summary.not_checked_in ?? 0} icon={HelpCircle} />
        <MetricCard label="Pending Correction" value={summary.pending_correction ?? 0} icon={AlertCircle} />
      </section>

      {/* ── Table ── */}
      <AdminPanel
        eyebrow={`${filtered.length} of ${items.length} records`}
        title="Attendance records"
        bodyClassName="px-0 py-0 sm:px-0"
      >
        {/* Filter bar */}
        <div className="border-b border-pf-border/60 bg-pf-card/40 p-4">
          <label className="font-ui text-[10px] uppercase tracking-[.14em] text-pf-muted">
            Filter by status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1.5 h-9 w-full border border-pf-border bg-pf-card px-2 font-ui text-xs text-pf-text outline-none focus:border-pf-gold-deep sm:w-56"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left">
            <thead className="border-b border-pf-border/80 bg-pf-card/80">
              <tr>
                {["Employee", "Check-in", "Check-out", "Status", "Work time"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 font-ui text-[10px] uppercase tracking-[.16em] text-pf-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.employeeId ?? row.id}
                  className="border-b border-pf-border/50 last:border-0 hover:bg-pf-ivory/30"
                >
                  <td className="px-4 py-3">
                    <p className="font-ui text-sm text-pf-text">{row.employeeName ?? row.name ?? "—"}</p>
                    {row.employeeId ? (
                      <p className="font-ui text-[11px] text-pf-muted">{row.employeeId}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-ui text-sm text-pf-text">
                    {row.checkIn ? formatTime(row.checkIn) : <span className="text-pf-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 font-ui text-sm text-pf-text">
                    {row.checkOut ? formatTime(row.checkOut) : <span className="text-pf-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 font-ui text-sm text-pf-text">
                    {row.workMinutes != null ? formatMinutes(row.workMinutes) : <span className="text-pf-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && !loading && !error ? (
            <p className="p-8 text-center font-ui text-sm text-pf-muted">
              {statusFilter ? "No records match this status filter." : "No attendance records for this date."}
            </p>
          ) : null}

          {filtered.length === 0 && loading ? (
            <p
              role="status"
              aria-live="polite"
              aria-busy="true"
              className="p-8 text-center font-ui text-sm text-pf-muted"
            >
              Loading…
            </p>
          ) : null}
        </div>

        {/* Mobile cards */}
        <div className="grid gap-3 p-3 md:hidden">
          {filtered.map((row) => (
            <div
              key={row.employeeId ?? row.id}
              className="border border-pf-border/70 bg-pf-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-ui text-sm text-pf-text">{row.employeeName ?? row.name ?? "—"}</p>
                  {row.employeeId ? (
                    <p className="font-ui text-[11px] text-pf-muted">{row.employeeId}</p>
                  ) : null}
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 font-ui text-[11px]">
                <div>
                  <p className="text-pf-muted">Check-in</p>
                  <p className="text-pf-text">{row.checkIn ? formatTime(row.checkIn) : "—"}</p>
                </div>
                <div>
                  <p className="text-pf-muted">Check-out</p>
                  <p className="text-pf-text">{row.checkOut ? formatTime(row.checkOut) : "—"}</p>
                </div>
                <div>
                  <p className="text-pf-muted">Work time</p>
                  <p className="text-pf-text">{row.workMinutes != null ? formatMinutes(row.workMinutes) : "—"}</p>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && !loading && !error ? (
            <p className="py-6 text-center font-ui text-sm text-pf-muted">
              {statusFilter ? "No records match this status filter." : "No attendance records for this date."}
            </p>
          ) : null}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
