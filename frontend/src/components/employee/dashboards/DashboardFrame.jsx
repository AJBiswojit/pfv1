import { getDepartmentLabel } from "../../../config/employeeDepartments";
import { getRole } from "../../../config/employeeRoles";
import { useEmployeeAuth } from "../../../context/EmployeeAuthContext";
import {
  employeeFullName,
  formatTodayLong,
  greetingForNow,
} from "../../../utils/employee";
import { defaultDashboardMetrics } from "../../../services/employees/operationsService";
import MetricCard from "../MetricCard";
import AttendancePanel from "../AttendancePanel";
import PerformancePanel from "../PerformancePanel";

export default function DashboardFrame({
  eyebrow,
  title,
  description,
  extras = null,
  metrics: metricsOverride = null,
  children,
}) {
  const { employee } = useEmployeeAuth();
  const role = getRole(employee?.role);
  const metrics = metricsOverride || defaultDashboardMetrics(employee?.role);

  return (
    <div className="pb-16">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2.5 font-ui text-[11px] font-semibold uppercase tracking-[.28em] text-pf-gold-text">
            <span aria-hidden="true" className="h-px w-6 bg-pf-gold-deep/70" />
            {eyebrow || role.portal}
          </p>
          <h1 className="mt-2 font-display text-[32px] font-medium leading-[1.05] tracking-tight text-pf-text md:text-[44px]">
            {title || (
              <>
                {greetingForNow()}, <span className="italic text-pf-burgundy">{employee?.firstName}</span>
              </>
            )}
          </h1>
          <p className="mt-3 max-w-2xl font-ui text-sm leading-relaxed text-pf-muted">
            {description ||
              `${employeeFullName(employee)} · ${role.label} · ${getDepartmentLabel(employee?.department)} · ${employee?.employeeId}`}
          </p>
        </div>
        <p className="font-ui text-[11px] uppercase tracking-[.14em] text-pf-gold-text md:text-right">
          {formatTodayLong()}
          {employee?.shift ? ` · ${employee.shift}` : ""}
        </p>
      </header>

      {metrics.primary?.length ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.primary.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      ) : null}

      {children}

      <div className="mt-1 flex flex-wrap items-stretch gap-5">
        <div className="min-w-0 flex-1 basis-[320px] empty:hidden">
          <AttendancePanel />
        </div>
        <div className="min-w-0 flex-1 basis-[320px] empty:hidden">
          <PerformancePanel employeeId={employee?.employeeId} compact />
        </div>
      </div>

      {extras}
    </div>
  );
}
