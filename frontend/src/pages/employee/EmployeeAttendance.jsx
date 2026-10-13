import { useState } from "react";
import { Link } from "react-router-dom";
import { AtelierButton } from "../../design-system";
import EmployeePage from "../../components/employee/EmployeePage";
import CheckInCard from "../../components/workforce/CheckInCard";
import AttendanceSummary from "../../components/workforce/AttendanceSummary";
import AttendanceHistory from "../../components/workforce/AttendanceHistory";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { useWorkforce } from "../../context/WorkforceContext";
import { PERMISSIONS } from "../../config/employeePermissions";
import { monthKey } from "../../services/workforce/dateUtils";

export default function EmployeeAttendance() {
  const { employee, hasPermission } = useEmployeeAuth();
  const { syncError, refresh } = useWorkforce();
  const [month, setMonth] = useState(monthKey());

  if (!employee) return null;

  return (
    <EmployeePage
      eyebrow="Presence"
      title={
        <>
          Attendance on the <span className="italic text-accent">floor.</span>
        </>
      }
      description="Check in and out, read the month, and request leave. You see only your own attendance."
      actions={
        hasPermission(PERMISSIONS.LEAVE_VIEW) ? (
          <AtelierButton as={Link} to="/employee/attendance/leave" variant="outline" size="chip">
            Leave
          </AtelierButton>
        ) : null
      }
    >
      {syncError ? (
        <p
          role="status"
          className="mb-4 border border-cocoa/30 bg-surface px-3 py-2 font-ui text-[11px] text-cocoa"
        >
          Server sync failed ({syncError}). Showing the last loaded state —{" "}
          <button
            type="button"
            className="underline"
            onClick={() => refresh()}
          >
            retry
          </button>
          .
        </p>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <CheckInCard />
        <AttendanceSummary employeeId={employee.employeeId} month={month} compact />
      </div>

      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl font-light text-ink">History</h2>
        <AttendanceHistory employeeId={employee.employeeId} month={month} onMonthChange={setMonth} />
      </section>
    </EmployeePage>
  );
}
