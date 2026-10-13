import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { UserCheck, UserMinus, UsersRound } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import DataTable from "../../../components/employee/DataTable";
import EmployeeField, { employeeInputClass } from "../../../components/employee/EmployeeField";
import { AtelierButton } from "../../../design-system";
import { useEmployeeManagement } from "../../../context/EmployeeManagementContext";
import { useEmployeesBase } from "./employeesBase";
import { ROLE_OPTIONS, getRoleLabel, isKnownRole } from "../../../config/employeeRoles";
import {
  ACCOUNT_LEVELS,
  ACCOUNT_LEVEL_META,
  CAPABILITY_GROUPS,
  workspaceForLevel,
} from "../../../config/rbacModel";
import { DEPARTMENT_OPTIONS, DEPARTMENT_DEFINITIONS } from "../../../config/employeeDepartments";
import {
  STATUS_FILTER_OPTIONS,
  EMPLOYEE_STATUS,
  canEmployeeLogin,
  isAccessBlocked,
  getEmployeeStatus,
} from "../../../config/employeeStatus";
import { getPermissionLabel } from "../../../config/employeePermissions";
import { employeeFullName, formatEmployeeDateTime, staffHrefId } from "../../../utils/employee";
import { cn } from "../../../utils/cn";

const Metric = ({ icon: Icon, label, value, detail }) => (
  <div className="border border-mist/80 bg-surface/40 px-5 py-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <dt className="font-ui text-[10px] uppercase tracking-[.18em] text-taupe">{label}</dt>
        <dd className="mt-1 font-display text-3xl font-light text-ink">{value}</dd>
        <p className="mt-1 font-ui text-[11px] text-taupe">{detail}</p>
      </div>
      <span className="inline-flex h-9 w-9 items-center justify-center border border-mist bg-canvas text-accent">
        <Icon size={16} aria-hidden="true" />
      </span>
    </div>
  </div>
);

const CAPABILITY_LABELS = Object.fromEntries(
  CAPABILITY_GROUPS.flatMap((group) =>
    group.actions.map((action) => [action.code, `${group.label} · ${action.label}`])
  )
);

const STATUS_MEANING = {
  [EMPLOYEE_STATUS.ACTIVE]: "Can sign in",
  [EMPLOYEE_STATUS.PENDING]: "Awaiting first sign-in",
  [EMPLOYEE_STATUS.ON_LEAVE]: "Away · can still sign in",
  [EMPLOYEE_STATUS.SUSPENDED]: "Sign-in blocked",
  [EMPLOYEE_STATUS.INACTIVE]: "Access disabled",
};

const STATUS_TONE = {
  ink: "bg-ink text-ivory",
  accent: "border border-accent/25 bg-accent/10 text-accent",
  quiet: "border border-mist bg-surface text-cocoa",
  danger: "border border-accent/25 bg-accent/10 text-accent",
  muted: "border border-mist bg-canvas-deep text-graphite",
};

const directoryRole = (person) => {
  const levelMeta = ACCOUNT_LEVEL_META[person.accountLevel];
  const roleId = isKnownRole(person.businessRole) ? person.businessRole : person.role;
  if (isKnownRole(roleId)) {
    const primary = getRoleLabel(roleId);
    return { primary, detail: levelMeta && levelMeta.label !== primary ? levelMeta.label : null };
  }
  if (levelMeta?.workspace === "admin") {
    return { primary: levelMeta.label, detail: "Admin Portal" };
  }
  return { primary: "No store role assigned", detail: levelMeta?.label ?? null };
};

const directoryDepartment = (person) => {
  if (workspaceForLevel(person.accountLevel) === "admin") return "Administration";
  return DEPARTMENT_DEFINITIONS[person.department]?.label ?? "Not assigned";
};

const permissionLabel = (key) => {
  if (key === "*") return "Full system access";
  if (CAPABILITY_LABELS[key]) return CAPABILITY_LABELS[key];
  const label = getPermissionLabel(key);
  return label === "Restricted action" ? null : label;
};

const permissionSummary = (person) => {
  const permissions = Array.isArray(person.permissions) ? person.permissions : [];
  if (person.accountLevel === ACCOUNT_LEVELS.SUPER_ADMIN || permissions.includes("*")) {
    return "Full system access";
  }
  if (!permissions.length) {
    return workspaceForLevel(person.accountLevel) === "admin"
      ? "No capabilities assigned"
      : "No operational permissions";
  }
  const labels = [...new Set(permissions.map(permissionLabel).filter(Boolean))];
  if (!labels.length) {
    return `${permissions.length} ${permissions.length === 1 ? "capability" : "capabilities"} assigned`;
  }
  const shown = labels.slice(0, 2);
  const remaining = labels.length - shown.length;
  return `${shown.join(", ")}${remaining > 0 ? ` +${remaining}` : ""}`;
};

const DirectoryStatus = ({ status }) => {
  const definition = getEmployeeStatus(status);
  return (
    <div>
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 font-ui text-xs",
          STATUS_TONE[definition.tone] ?? STATUS_TONE.quiet
        )}
      >
        {definition.label}
      </span>
      <p className="mt-1 font-ui text-[11px] text-taupe">
        {STATUS_MEANING[definition.id] ?? (definition.canLogin ? "Can sign in" : "Cannot sign in")}
      </p>
    </div>
  );
};

const DirectoryRole = ({ person }) => {
  const { primary, detail } = directoryRole(person);
  return (
    <div>
      <p>{primary}</p>
      {detail ? <p className="mt-1 font-ui text-[11px] text-taupe">{detail}</p> : null}
    </div>
  );
};

export default function AdminEmployees({ basePath } = {}) {
  const base = useEmployeesBase(basePath);
  const {
    employees,
    getEmployees,
    activateEmployee,
    deactivateEmployee,
    suspendEmployee,
    canManageEmployees,
  } = useEmployeeManagement();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const metrics = useMemo(
    () => ({
      total: employees.length,
      active: employees.filter((person) => person.status === EMPLOYEE_STATUS.ACTIVE).length,
      inactive: employees.filter((person) => !canEmployeeLogin(person.status)).length,
    }),
    [employees]
  );

  const rows = useMemo(
    () => getEmployees({ query, role, department, status }),
    [getEmployees, query, role, department, status]
  );

  const changeAccess = async (person, action) => {
    if (busyId) return;
    const recordId = staffHrefId(person);
    setBusyId(recordId);
    setNotice(null);
    const result =
      action === "activate"
        ? await activateEmployee(recordId)
        : action === "suspend"
          ? await suspendEmployee(recordId)
          : await deactivateEmployee(recordId);
    setBusyId(null);
    const label = action === "activate" ? "active" : action === "suspend" ? "suspended" : "inactive";
    setNotice(
      result.ok
        ? {
            ok: true,
            text: `${employeeFullName(person)} is now ${label}.`,
          }
        : { ok: false, text: result.message || "The account status could not be changed." }
    );
  };

  return (
    <AdminPage
      eyebrow="People / Organization"
      title={<>Employee <span className="italic text-accent">accounts.</span></>}
      description="Create and administer employee access. Attendance, performance and day-to-day operations remain in the Employee Portal."
      actions={
        canManageEmployees ? (
          <AtelierButton as={Link} to={`${base}/new`} size="chip">
            Add employee
          </AtelierButton>
        ) : null
      }
    >
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className={`mb-6 border px-4 py-3 font-ui text-sm ${notice.ok ? "border-cocoa/30 bg-cocoa/5 text-cocoa" : "border-accent/40 bg-accent/5 text-accent"}`}
        >
          {notice.text}
        </div>
      ) : null}

      <dl className="mb-7 grid gap-3 sm:grid-cols-3">
        <Metric icon={UsersRound} label="Employees" value={metrics.total} detail="Legitimate employee identities" />
        <Metric icon={UserCheck} label="Active" value={metrics.active} detail="Can access and receive work" />
        <Metric icon={UserMinus} label="Inactive" value={metrics.inactive} detail="Access disabled; history retained" />
      </dl>

      <AdminPanel eyebrow={`${rows.length} of ${employees.length} accounts`} title="Employee directory">
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <EmployeeField label="Search">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, ID, email or phone"
              className={employeeInputClass()}
            />
          </EmployeeField>
          <EmployeeField label="Role">
            <select value={role} onChange={(event) => setRole(event.target.value)} className={employeeInputClass()}>
              <option value="">All roles</option>
              {ROLE_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </EmployeeField>
          <EmployeeField label="Department / team">
            <select value={department} onChange={(event) => setDepartment(event.target.value)} className={employeeInputClass()}>
              <option value="">All departments</option>
              {DEPARTMENT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </EmployeeField>
          <EmployeeField label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={employeeInputClass()}>
              <option value="">All statuses</option>
              {STATUS_FILTER_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </EmployeeField>
        </div>

        <DataTable
          rows={rows}
          rowKey="employeeId"
          empty="No employee accounts match these filters."
          columns={[
            {
              id: "name",
              label: "Employee",
              render: (row) => (
                <div>
                  <Link to={`${base}/${staffHrefId(row)}`} className="font-medium text-ink hover:text-accent">
                    {employeeFullName(row)}
                  </Link>
                  <p className="mt-1 text-[11px] text-taupe">{row.employeeId || staffHrefId(row)} · {row.email}</p>
                </div>
              ),
            },
            {
              id: "role",
              label: "Role",
              render: (row) => <DirectoryRole person={row} />,
            },
            { id: "department", label: "Department", render: (row) => directoryDepartment(row) },
            { id: "status", label: "Status", render: (row) => <DirectoryStatus status={row.status} /> },
            { id: "permissions", label: "Permissions", render: permissionSummary },
            {
              id: "lastLogin",
              label: "Last activity",
              render: (row) => row.lastLogin ? formatEmployeeDateTime(row.lastLogin) : "Not recorded",
            },
            {
              id: "actions",
              label: "Actions",
              render: (row) => (
                <div className="flex flex-wrap gap-x-3 gap-y-2 text-[12px]">
                  <Link to={`${base}/${staffHrefId(row)}`} className="text-brass hover:text-accent">View</Link>
                  {canManageEmployees ? (
                  <Link to={`${base}/${staffHrefId(row)}/edit`} className="text-brass hover:text-accent">Edit</Link>
                  ) : null}
                  {canManageEmployees && isAccessBlocked(row.status) ? (
                    <button
                      type="button"
                      disabled={Boolean(busyId)}
                      onClick={() => changeAccess(row, "activate")}
                      className="text-brass hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === staffHrefId(row) ? "Activating…" : "Activate"}
                    </button>
                  ) : null}
                  {canManageEmployees && !isAccessBlocked(row.status) ? (
                    <>
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => changeAccess(row, "suspend")}
                        className="text-brass hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyId === staffHrefId(row) ? "Updating…" : "Suspend"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => changeAccess(row, "deactivate")}
                        className="text-brass hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyId === staffHrefId(row) ? "Updating…" : "Deactivate"}
                      </button>
                    </>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </AdminPanel>
    </AdminPage>
  );
}
