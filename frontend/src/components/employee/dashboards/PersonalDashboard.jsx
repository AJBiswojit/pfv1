import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck2, Clock3, Hourglass, Percent } from "lucide-react";
import { useEmployeeAuth } from "../../../context/EmployeeAuthContext";
import { useWorkforce } from "../../../context/WorkforceContext";
import { PERMISSIONS } from "../../../config/employeePermissions";
import { getDepartmentLabel } from "../../../config/employeeDepartments";
import { getRoleLabel } from "../../../config/employeeRoles";
import {
  employeeAttendanceSummary,
  monthRecordsForEmployee,
} from "../../../services/workforce/attendanceService";
import { myLeave } from "../../../services/workforce/leaveService";
import {
  formatDateShort,
  formatMinutes,
  formatMonthLabel,
  formatTime,
  monthKey,
} from "../../../services/workforce/dateUtils";
import { AttendanceStatusBadge, LeaveStatusBadge } from "../../workforce/WorkforceBadges";
import { getLeaveTypeLabel } from "../../../config/attendanceConfig";
import DataTable from "../DataTable";
import DashboardFrame from "./DashboardFrame";

/**
 * The desk for an authenticated employee whose session carries no business
 * role (the backend can hold `roles: []` for a seeded or newly-created
 * profile). It is deliberately NOT a made-up manager/sales view: every figure
 * below is read from the employee's own attendance, leave and profile rows in
 * the workforce mirror, which the server owns. A member with no role sees
 * their own record — nothing is inferred, and nothing is granted.
 */
const EMPTY_SUMMARY = {
  present: 0,
  late: 0,
  leave: 0,
  halfDay: 0,
  absent: 0,
  workingDays: 0,
  lateMinutes: 0,
  workMinutes: 0,
  hoursLabel: "0h",
  attendancePercent: null,
};

const safe = (read, fallback) => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

export default function PersonalDashboard() {
  const { employee, hasPermission } = useEmployeeAuth();
  const { revision } = useWorkforce();
  const employeeId = employee?.employeeId;

  const month = monthKey();

  const summary = useMemo(
    () =>
      employeeId
        ? safe(() => employeeAttendanceSummary(employeeId, month), EMPTY_SUMMARY)
        : EMPTY_SUMMARY,
    [employeeId, month, revision],
  );

  const recent = useMemo(() => {
    if (!employeeId) return [];
    const records = safe(() => monthRecordsForEmployee(employeeId, month), []);
    return records.slice(-6).reverse();
  }, [employeeId, month, revision]);

  const leave = useMemo(() => {
    if (!employeeId || !hasPermission(PERMISSIONS.LEAVE_VIEW)) return [];
    return safe(() => myLeave(employeeId), [])
      .slice()
      .sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")))
      .slice(0, 4);
  }, [employeeId, hasPermission, revision]);

  const canSeeAttendance = hasPermission(PERMISSIONS.ATTENDANCE_VIEW);
  const canSeeLeave = hasPermission(PERMISSIONS.LEAVE_VIEW);
  const canSeeProfile = hasPermission(PERMISSIONS.PROFILE_VIEW);

  const metrics = {
    primary: [
      {
        label: "Days present",
        value: String(summary.present + summary.late),
        icon: CalendarCheck2,
        hint: `${summary.present} on time · ${summary.late} late`,
      },
      {
        label: "Late arrivals",
        value: String(summary.late),
        icon: Clock3,
        hint:
          summary.lateMinutes > 0
            ? `${formatMinutes(summary.lateMinutes)} after the house threshold`
            : "None after the house threshold",
      },
      {
        label: "Leave days",
        value: String(summary.leave),
        icon: Hourglass,
        hint: summary.halfDay
          ? `${summary.halfDay} half day${summary.halfDay === 1 ? "" : "s"} recorded`
          : "Approved leave this month",
      },
      {
        label: "Attendance",
        value: summary.attendancePercent == null ? "—" : `${summary.attendancePercent}%`,
        icon: Percent,
        hint: `${summary.workingDays} working day${summary.workingDays === 1 ? "" : "s"} elapsed`,
      },
    ],
  };

  /* A seat with no business role still has a designation the house
     recorded; label it that way rather than printing "Unassigned role". */
  const seatLabel = employee?.designation || (employee?.role ? getRoleLabel(employee.role) : "Team member");
  const description = employeeId
    ? `${seatLabel} · ${employeeId}. Your attendance, leave and performance for the month, from the house register.`
    : "Your attendance, leave and performance for the month, from the house register.";

  return (
    <DashboardFrame metrics={metrics} description={description}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-2xl font-light text-pf-text">
              {formatMonthLabel(month)}
            </h2>
            {canSeeAttendance ? (
              <Link
                to="/employee/attendance"
                className="inline-flex items-center gap-1.5 font-ui text-[11px] uppercase tracking-[.14em] text-pf-gold-text transition-colors hover:text-pf-burgundy"
              >
                Full register <ArrowRight size={12} strokeWidth={1.7} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          <DataTable
            rows={recent}
            rowKey="date"
            empty="No attendance has been recorded for this month yet."
            columns={[
              { id: "date", label: "Date", render: (row) => formatDateShort(row.date) },
              { id: "status", label: "Status", render: (row) => <AttendanceStatusBadge status={row.status} /> },
              { id: "checkIn", label: "In", render: (row) => formatTime(row.checkIn) },
              { id: "checkOut", label: "Out", render: (row) => formatTime(row.checkOut) },
              {
                id: "hours",
                label: "Hours",
                render: (row) => (row.workMinutes ? formatMinutes(row.workMinutes) : "—"),
              },
            ]}
          />
          <p className="mt-3 font-ui text-[12px] leading-relaxed text-pf-muted">
            {summary.absent} absent · {summary.halfDay} half day · {summary.hoursLabel} logged this month.
            Leave, week-offs and holidays are excluded from the attendance figure.
          </p>
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-2xl font-light text-pf-text">Your leave</h2>
            {canSeeLeave ? (
              <Link
                to="/employee/attendance/leave"
                className="inline-flex items-center gap-1.5 font-ui text-[11px] uppercase tracking-[.14em] text-pf-gold-text transition-colors hover:text-pf-burgundy"
              >
                Leave desk <ArrowRight size={12} strokeWidth={1.7} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          {canSeeLeave && leave.length ? (
            <ul className="divide-y divide-pf-border rounded-xl border border-pf-border bg-pf-card">
              {leave.map((request) => (
                <li key={request.leaveId} className="flex items-start justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="font-ui text-sm text-pf-text">{getLeaveTypeLabel(request.leaveType)}</p>
                    <p className="mt-0.5 font-ui text-[12px] text-pf-muted">
                      {formatDateShort(request.startDate)} – {formatDateShort(request.endDate)} ·{" "}
                      {request.days} day{request.days === 1 ? "" : "s"}
                    </p>
                  </div>
                  <LeaveStatusBadge status={request.status} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-pf-border bg-pf-card px-5 py-8 text-center">
              <p className="font-ui text-sm text-pf-muted">
                {canSeeLeave
                  ? "No leave requests on record. The leave desk opens a request against the house calendar."
                  : "Leave records are not part of this seat."}
              </p>
            </div>
          )}

          <div className="mt-6 rounded-xl border border-pf-border bg-pf-ivory/50 px-4 py-4">
            <p className="font-ui text-[10px] font-semibold uppercase tracking-[.18em] text-pf-burgundy">
              Your seat
            </p>
            <dl className="mt-3 space-y-2 font-ui text-[12.5px] leading-relaxed">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-pf-muted">Designation</dt>
                <dd className="min-w-0 truncate text-right text-pf-text">{employee?.designation || "Not recorded"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-pf-muted">Department</dt>
                <dd className="min-w-0 truncate text-right text-pf-text">{getDepartmentLabel(employee?.department)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-pf-muted">Employee code</dt>
                <dd className="tabular-nums text-pf-text">{employee?.employeeId || "—"}</dd>
              </div>
            </dl>
            {canSeeProfile ? (
              <Link
                to="/employee/profile"
                className="mt-3 inline-flex items-center gap-1.5 font-ui text-[11px] uppercase tracking-[.14em] text-pf-gold-text transition-colors hover:text-pf-burgundy"
              >
                Profile <ArrowRight size={12} strokeWidth={1.7} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </DashboardFrame>
  );
}
