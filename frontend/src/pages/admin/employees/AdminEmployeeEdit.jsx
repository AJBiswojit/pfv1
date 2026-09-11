import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import EmployeeForm from "../../../components/employee/EmployeeForm";
import PermissionMatrix from "../../../components/employee/PermissionMatrix";
import { AtelierButton } from "../../../design-system";
import { useEmployeeManagement } from "../../../context/EmployeeManagementContext";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { useEmployeeAuth } from "../../../context/EmployeeAuthContext";
import { getDefaultPermissions } from "../../../config/employeeRoles";
import {
  ACCOUNT_LEVELS,
  ACCOUNT_LEVEL_META,
  CAPABILITY_GROUPS,
  CREATABLE_LEVELS,
  delegableCapabilities,
  workspaceForLevel,
} from "../../../config/rbacModel";
import { EMPLOYEE_TEAM_ACCESS_BASE } from "./employeesBase";

const draftFrom = (person) => ({
  firstName: person.firstName,
  lastName: person.lastName,
  email: person.email,
  phone: person.phone,
  role: person.role,
  department: person.department,
  section: person.section,
  store: person.store,
  joiningDate: person.joiningDate,
  status: person.status,
});

export default function AdminEmployeeEdit({ basePath } = {}) {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Follow the workspace we were mounted from (Admin portal vs SUPER_EMPLOYEE
  // self-service) — see employeesBase.js.
  const base = basePath ?? (location.pathname.startsWith(EMPLOYEE_TEAM_ACCESS_BASE)
    ? EMPLOYEE_TEAM_ACCESS_BASE
    : "/admin/employees");
  const { getEmployee, updateEmployee, isWorking } = useEmployeeManagement();
  const { admin } = useAdminAuth();
  const { employee: employeeActor } = useEmployeeAuth();
  const person = getEmployee(employeeId);
  const [draft, setDraft] = useState(() => person ? draftFrom(person) : null);
  const [accountLevel, setAccountLevel] = useState(() => person?.accountLevel || ACCOUNT_LEVELS.EMPLOYEE);
  const [permissions, setPermissions] = useState(() => person?.permissions || []);
  const [customPermissions, setCustomPermissions] = useState(() => person?.permissionMode === "custom");
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");

  const creator = admin ?? employeeActor;
  const creatorLevel =
    creator?.accountLevel ?? (creator?.role === ACCOUNT_LEVELS.SUPER_ADMIN ? ACCOUNT_LEVELS.SUPER_ADMIN : null);
  const isSelf = Boolean(creator && person && creator.employeeId === person.employeeId);
  const capabilityDriven = accountLevel !== ACCOUNT_LEVELS.EMPLOYEE;
  const adminDomain = workspaceForLevel(accountLevel) === "admin";
  const ceiling = useMemo(
    () => (creator ? delegableCapabilities(creator) : new Set()),
    [creator]
  );

  // Level options: what the creator may grant, plus the target's current
  // level so it can always be kept (the server rejects raising it beyond
  // the creator's reach regardless).
  const levelOptions = useMemo(() => {
    const creatable = CREATABLE_LEVELS[creatorLevel] ?? [];
    const current = person?.accountLevel || ACCOUNT_LEVELS.EMPLOYEE;
    return [...new Set([current, ...creatable])].filter(
      (level) => creatable.includes(level) || level === current
    );
  }, [creatorLevel, person?.accountLevel]);

  useEffect(() => {
    if (!person) return;
    setDraft(draftFrom(person));
    setAccountLevel(person.accountLevel || ACCOUNT_LEVELS.EMPLOYEE);
    setPermissions(person.permissions || []);
    setCustomPermissions(person.permissionMode === "custom");
  }, [person?.employeeId]);

  if (!person || !draft) {
    return (
      <AdminPage eyebrow="People / Organization" title="Employee not found" description="That employee account is not in the register.">
        <AtelierButton as={Link} to={base} size="chip" variant="outline">All employees</AtelierButton>
      </AdminPage>
    );
  }

  const handleChange = (next) => {
    if (next.role !== draft.role && !customPermissions && !capabilityDriven) {
      setPermissions(getDefaultPermissions(next.role));
    }
    setDraft(next);
    setErrors({});
    setNotice("");
  };

  const handleLevelChange = (level) => {
    setAccountLevel(level);
    if (level !== ACCOUNT_LEVELS.EMPLOYEE) setCustomPermissions(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (isWorking) return;
    setErrors({});
    setNotice("");
    const result = await updateEmployee(person.employeeId, {
      ...draft,
      // Only send the level when it actually changes — a no-op write would
      // still re-run the hierarchy check, but skipping keeps payloads small.
      ...(accountLevel !== person.accountLevel ? { accountLevel } : {}),
      ...(capabilityDriven
        ? { permissionMode: "custom", permissions }
        : {
            permissionMode: customPermissions ? "custom" : "role",
            permissions: customPermissions ? permissions : getDefaultPermissions(draft.role),
          }),
    });
    if (!result.ok) {
      setErrors(result.errors || {});
      setNotice(result.message || result.errors?.authorization || "Please review the employee details.");
      return;
    }
    navigate(`${base}/${person.employeeId}`, {
      state: { notice: "Employee account saved." },
    });
  };

  return (
    <AdminPage
      eyebrow="People / Organization / Edit"
      title={<>Edit <span className="italic text-accent">{person.firstName}.</span></>}
      description={`${person.employeeId} is permanent. Account level and capabilities control workspace access; the server, not this form, is the authority.`}
    >
      {notice ? (
        <p role="alert" className="mb-6 border border-accent/40 bg-accent/5 px-4 py-3 font-ui text-sm text-accent">{notice}</p>
      ) : null}

      <form onSubmit={submit} className="space-y-7">
        <AdminPanel eyebrow="Hierarchy" title="Account level">
          <div role="radiogroup" aria-label="Account level" className="flex flex-wrap gap-2">
            {levelOptions.map((level) => {
              const meta = ACCOUNT_LEVEL_META[level];
              const isActive = accountLevel === level;
              const unchangeable = isSelf || !((CREATABLE_LEVELS[creatorLevel] ?? []).includes(level) && level !== person.accountLevel);
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={unchangeable && !isActive}
                  title={isSelf ? "You cannot change your own account level" : undefined}
                  onClick={() => handleLevelChange(level)}
                  className={
                    isActive
                      ? "border-ink bg-ink px-4 py-2.5 text-left font-ui text-[11px] uppercase tracking-[.14em] text-ivory transition-colors"
                      : "border-pearl bg-canvas px-4 py-2.5 text-left font-ui text-[11px] uppercase tracking-[.14em] text-taupe transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                  }
                >
                  {meta.label}
                  <span className="mt-0.5 block text-[9px] normal-case tracking-normal opacity-70">
                    {meta.workspace === "admin" ? "Admin workspace" : "Employee workspace"}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 font-ui text-[11px] leading-relaxed text-taupe">
            Changing the level moves the account between workspaces through the unified login; no password or
            session reset happens. Business role below stays independent of the level.
          </p>
        </AdminPanel>

        <AdminPanel eyebrow="Account identity" title={adminDomain ? "Account details" : "Employee details"}>
          <EmployeeForm values={draft} errors={errors} onChange={handleChange} idPrefix="admin-edit-employee" adminDomain={adminDomain} />
        </AdminPanel>

        <AdminPanel
          eyebrow="Operational access"
          title={capabilityDriven ? "Delegated capabilities" : "Permissions"}
          action={
            capabilityDriven ? null : (
              <AtelierButton
                type="button"
                size="chip"
                variant="outline"
                onClick={() => {
                  setCustomPermissions(false);
                  setPermissions(getDefaultPermissions(draft.role));
                }}
              >
                Use role defaults
              </AtelierButton>
            )
          }
        >
          {capabilityDriven ? (
            <>
              <p className="mb-5 font-ui text-[11px] leading-relaxed text-taupe">
                {isSelf
                  ? "Your own capability set — the Super Admin assigns changes to it."
                  : ceiling === null
                    ? "All capability groups are available to assign."
                    : "Rows you cannot toggle are outside your own authority; the server enforces the same ceiling."}
              </p>
              <PermissionMatrix
                catalogue={CAPABILITY_GROUPS}
                ceiling={isSelf ? [] : ceiling ?? undefined}
                permissions={permissions}
                editable={!isSelf}
                onToggle={(key, allowed) =>
                  setPermissions((current) =>
                    allowed ? [...new Set([...current, key])] : current.filter((item) => item !== key)
                  )
                }
              />
            </>
          ) : (
            <>
              <label className="mb-5 flex items-start gap-3 font-ui text-sm text-ink">
                <input
                  type="checkbox"
                  checked={customPermissions}
                  onChange={(event) => {
                    setCustomPermissions(event.target.checked);
                    if (event.target.checked) setPermissions(permissions.length ? permissions : getDefaultPermissions(draft.role));
                  }}
                  className="mt-0.5 accent-ink"
                />
                <span>
                  Custom operational permissions
                  <span className="mt-1 block text-[11px] text-taupe">Super Admin employee-management authority is never assignable to an employee.</span>
                </span>
              </label>
              <PermissionMatrix
                permissions={customPermissions ? permissions : getDefaultPermissions(draft.role)}
                editable={customPermissions}
                onToggle={(key, allowed) =>
                  setPermissions((current) =>
                    allowed ? [...new Set([...current, key])] : current.filter((item) => item !== key)
                  )
                }
              />
            </>
          )}
          {errors.permissions ? <p className="mt-3 font-ui text-xs text-accent">{errors.permissions}</p> : null}
        </AdminPanel>

        <div className="flex flex-wrap gap-3">
          <AtelierButton type="submit" disabled={isWorking}>{isWorking ? "Saving…" : "Save changes"}</AtelierButton>
          <AtelierButton type="button" variant="outline" disabled={isWorking} onClick={() => navigate(`${base}/${person.employeeId}`)}>
            Cancel
          </AtelierButton>
        </div>
      </form>
    </AdminPage>
  );
}