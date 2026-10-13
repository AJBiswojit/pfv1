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
  ink: "bg-ink text-ivory",
  brass: "border border-brass/30 bg-brass/10 text-brass",
  danger: "border border-accent/25 bg-accent/10 text-accent",
  quiet: "border border-mist bg-surface text-cocoa",
  accent: "border border-accent/25 bg-accent/10 text-accent",
  muted: "border border-mist bg-canvas-deep text-graphite",
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
          Daily <span className="italic text-accent">attendance.</span>
        </>
      }
      description="Full workforce attendance snapshot for a selected date — punches, status and working time."
    >
      {/* ── Date navigator ── */}
      <div className="mb-7 flex items-center gap-3">
        <button
          type="button"
          onClick={handlePrevDay}
          className="flex h-9 w-9 items-center justify-center border border-mist bg-canvas text-taupe hover:border-ink hover:text-ink"
          aria-label="Previous day"
        >
          <ChevronLeft size={14} />
        </button>

        <label className="flex items-center gap-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
          Date
          <input
            type="date"
            value={date}
            max={todayKey()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-9 border border-mist bg-canvas px-3 font-ui text-xs text-ink outline-none focus:border-accent"
          />
        </label>

        <button
          type="button"
          onClick={handleNextDay}
          disabled={isToday}
          className="flex h-9 w-9 items-center justify-center border border-mist bg-canvas text-taupe hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next day"
        >
          <ChevronRight size={14} />
        </button>

        <span className="font-ui text-xs text-taupe">{formatDateLong(date)}</span>

        {!isToday && (
          <button
            type="button"
            onClick={() => setDate(todayKey())}
            className="ml-auto font-ui text-[10px] uppercase tracking-[.14em] text-brass hover:text-accent hover:underline"
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
          className="mb-6 border border-mist/80 bg-surface/40 px-4 py-3 font-ui text-[11px] text-taupe"
        >
          Loading attendance…
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-6 border border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent"
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
        <div className="border-b border-mist/60 bg-canvas/40 p-4">
          <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
            Filter by status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs text-ink outline-none focus:border-accent sm:w-56"
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
            <thead className="border-b border-mist/80 bg-canvas/80">
              <tr>
                {["Employee", "Check-in", "Check-out", "Status", "Work time"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 font-ui text-[10px] uppercase tracking-[.16em] text-taupe"
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
                  className="border-b border-mist/50 last:border-0 hover:bg-surface/30"
                >
                  <td className="px-4 py-3">
                    <p className="font-ui text-sm text-ink">{row.employeeName ?? row.name ?? "—"}</p>
                    {row.employeeId ? (
                      <p className="font-ui text-[11px] text-taupe">{row.employeeId}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-ui text-sm text-ink">
                    {row.checkIn ? formatTime(row.checkIn) : <span className="text-taupe">—</span>}
                  </td>
                  <td className="px-4 py-3 font-ui text-sm text-ink">
                    {row.checkOut ? formatTime(row.checkOut) : <span className="text-taupe">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 font-ui text-sm text-ink">
                    {row.workMinutes != null ? formatMinutes(row.workMinutes) : <span className="text-taupe">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && !loading && !error ? (
            <p className="p-8 text-center font-ui text-sm text-taupe">
              {statusFilter ? "No records match this status filter." : "No attendance records for this date."}
            </p>
          ) : null}

          {filtered.length === 0 && loading ? (
            <p
              role="status"
              aria-live="polite"
              aria-busy="true"
              className="p-8 text-center font-ui text-sm text-taupe"
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
              className="border border-mist/70 bg-canvas p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-ui text-sm text-ink">{row.employeeName ?? row.name ?? "—"}</p>
                  {row.employeeId ? (
                    <p className="font-ui text-[11px] text-taupe">{row.employeeId}</p>
                  ) : null}
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 font-ui text-[11px]">
                <div>
                  <p className="text-taupe">Check-in</p>
                  <p className="text-ink">{row.checkIn ? formatTime(row.checkIn) : "—"}</p>
                </div>
                <div>
                  <p className="text-taupe">Check-out</p>
                  <p className="text-ink">{row.checkOut ? formatTime(row.checkOut) : "—"}</p>
                </div>
                <div>
                  <p className="text-taupe">Work time</p>
                  <p className="text-ink">{row.workMinutes != null ? formatMinutes(row.workMinutes) : "—"}</p>
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && !loading && !error ? (
            <p className="py-6 text-center font-ui text-sm text-taupe">
              {statusFilter ? "No records match this status filter." : "No attendance records for this date."}
            </p>
          ) : null}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
