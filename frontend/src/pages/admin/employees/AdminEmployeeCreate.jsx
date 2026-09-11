import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import EmployeeForm, { emptyEmployeeDraft } from "../../../components/employee/EmployeeForm";
import PermissionMatrix from "../../../components/employee/PermissionMatrix";
import CredentialSheet from "../../../components/employee/CredentialSheet";
import { AtelierButton } from "../../../design-system";
import { useEmployeeManagement } from "../../../context/EmployeeManagementContext";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { useEmployeesBase } from "./employeesBase";
import { useEmployeeAuth } from "../../../context/EmployeeAuthContext";
import { getDefaultPermissions } from "../../../config/employeeRoles";
import { generateEmployeeId } from "../../../services/employees/employeeId";
import {
  ACCOUNT_LEVELS,
  ACCOUNT_LEVEL_META,
  CAPABILITY_GROUPS,
  CREATABLE_LEVELS,
  delegableCapabilities,
  workspaceForLevel,
} from "../../../config/rbacModel";

/**
 * THE one account-creation screen (Employee-workspace SUPER_EMPLOYEEs reach
 * the same component through their own route). Account level and delegated
 * capabilities follow the single hierarchy matrix in config/rbacModel.js —
 * which is mirrored and ENFORCED by app/core/rbac.py on the server.
 */
export default function AdminEmployeeCreate({ basePath } = {}) {
  const navigate = useNavigate();
  const base = useEmployeesBase(basePath);
  const { employees, createEmployee, isWorking } = useEmployeeManagement();
  const { admin } = useAdminAuth();
  const { employee: employeeActor } = useEmployeeAuth();
  const [draft, setDraft] = useState(emptyEmployeeDraft);
  const [accountLevel, setAccountLevel] = useState(ACCOUNT_LEVELS.EMPLOYEE);
  const [permissions, setPermissions] = useState([]);
  const [customPermissions, setCustomPermissions] = useState(false);
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState("");

  // The signed-in creator — either from the Admin workspace or (for
  // SUPER_EMPLOYEE) from the Employee workspace. Its effective permission set
  // caps what may be delegated below.
  const creator = admin ?? employeeActor;
  const creatorLevel =
    creator?.accountLevel ?? (creator?.role === ACCOUNT_LEVELS.SUPER_ADMIN ? ACCOUNT_LEVELS.SUPER_ADMIN : null);
  const creatableLevels = CREATABLE_LEVELS[creatorLevel] ?? [];
  // EMPLOYEE now reuses the SAME grouped capability-control architecture as
  // SUPER_EMPLOYEE / ADMIN / SUPER_ADMIN (CATALOGUE, PRODUCT_WORKFLOW, MEDIA
  // … AI_ASSISTANT via CAPABILITY_GROUPS). No second permission system —
  // the existing catalogue, storage, evaluation, delegation ceiling and
  // backend RBAC enforcement are reused for every level.
  const capabilityDriven = true;
  const adminDomain = workspaceForLevel(accountLevel) === "admin";

  // Ceiling for the delegation switches: the creator's own effective set.
  // null = unrestricted (SUPER_ADMIN); the server re-checks either way.
  const ceiling = useMemo(
    () => (creator ? delegableCapabilities(creator) : new Set()),
    [creator]
  );

  const generatedId = useMemo(
    () => !adminDomain && draft.role
      ? generateEmployeeId({
          role: draft.role,
          department: draft.department,
          existingIds: employees.map((person) => person.employeeId),
        })
      : adminDomain
        ? "Assigned for Admin-workspace accounts"
        : "Assigned after a role is selected",
    [draft.role, draft.department, employees, adminDomain]
  );

  const handleLevelChange = (level) => {
    setAccountLevel(level);
    // All four levels share the grouped capability system; clearing the
    // selection on level change prevents implying capabilities from the
    // previous level's ceiling.
    setPermissions([]);
    setCustomPermissions(false);
  };

  const handleChange = (next) => {
    // In the grouped system permissions are capability codes independent of
    // the business role (STORE_MANAGER, SALES_EXECUTIVE …). The legacy
    // operational catalogue (PERMISSION_CATALOGUE) is no longer used for any
    // level — EMPLOYEE included — so role changes do not auto-fill the
    // capability selection; the delegation ceiling (decorated on each switch)
    // remains the authority.
    setDraft(next);
    setErrors({});
    setSubmitError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (isWorking) return;
    setErrors({});
    setSubmitError("");
    const created = await createEmployee({
      ...draft,
      accountLevel,
      ...(capabilityDriven
        ? { permissionMode: "custom", permissions }
        : {
            permissionMode: customPermissions ? "custom" : "role",
            permissions: customPermissions ? permissions : getDefaultPermissions(draft.role),
          }),
    });
    if (!created.ok) {
      setErrors(created.errors || {});
      setSubmitError(created.message || created.errors?.authorization || "Please review the highlighted employee details.");
      return;
    }
    setResult(created);
  };

  if (result?.employee) {
    return (
      <AdminPage
        eyebrow="People / Organization"
        title={result.employee.accountLevel === ACCOUNT_LEVELS.EMPLOYEE ? "Employee created" : "Account created"}
        description="The account is in the existing staff identity store. Share the temporary credential once."
      >
        <CredentialSheet
          employee={result.employee}
          temporaryPassword={result.temporaryPassword}
          onDone={() => navigate(`${base}/${result.employee.employeeId}`)}
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage
      eyebrow="People / Organization / New"
      title={<>Add a <span className="italic text-accent">staff account.</span></>}
      description="Create an account on the hierarchy. Available levels and delegable capabilities never exceed the signed-in creator's own authority — the server enforces the same ceiling."
    >
      {submitError ? (
        <p role="alert" className="mb-6 border border-accent/40 bg-accent/5 px-4 py-3 font-ui text-sm text-accent">
          {submitError}
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-7">
        <AdminPanel
          eyebrow="Account level"
          title="Where this account sits"
          action={
            <div className="text-right">
              <p className="font-ui text-[9px] uppercase tracking-[.16em] text-taupe">Employee ID</p>
              <p className="mt-1 font-ui text-xs text-ink">{generatedId}</p>
            </div>
          }
        >
          <div role="radiogroup" aria-label="Account level" className="flex flex-wrap gap-2">
            {creatableLevels.map((level) => {
              const meta = ACCOUNT_LEVEL_META[level];
              const isActive = accountLevel === level;
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => handleLevelChange(level)}
                  className={
                    isActive
                      ? "border-ink bg-ink px-4 py-2.5 text-left font-ui text-[11px] uppercase tracking-[.14em] text-ivory transition-colors"
                      : "border-pearl bg-canvas px-4 py-2.5 text-left font-ui text-[11px] uppercase tracking-[.14em] text-taupe transition-colors hover:border-ink hover:text-ink"
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
          {creatableLevels.length === 0 ? (
            <p className="mt-3 font-ui text-xs text-accent">
              Your account level cannot create accounts. Ask a higher-level account to grant access.
            </p>
          ) : null}
          <p className="mt-3 font-ui text-[11px] leading-relaxed text-taupe">
            A business role (e.g. Store Manager) is chosen with the assignment below; the account level above only
            determines authority. Existing credentials and the employee portal are unaffected.
          </p>
        </AdminPanel>

        <AdminPanel
          eyebrow="Account identity"
          title={adminDomain ? "Account details" : "Employee details"}
        >
          <EmployeeForm values={draft} errors={errors} onChange={handleChange} idPrefix="admin-create-employee" adminDomain={adminDomain} />
          <p className="mt-5 border-l-2 border-accent pl-3 font-ui text-[11px] leading-relaxed text-taupe">
            A unique, deterministic employee ID and temporary password are generated when saved. The account holder must change that password on first sign-in.
          </p>
        </AdminPanel>

        <AdminPanel eyebrow="Operational access" title={capabilityDriven ? "Delegated capabilities" : "Permissions"}>
          {capabilityDriven ? (
            <>
              <p className="mb-4 font-ui text-[11px] leading-relaxed text-taupe">
                {ceiling === null
                  ? "All capability groups are available to delegate."
                  : "Rows you cannot see enabled are outside your own authority and cannot be delegated."}
              </p>
              <PermissionMatrix
                catalogue={CAPABILITY_GROUPS}
                ceiling={ceiling ?? undefined}
                permissions={permissions}
                editable
                onToggle={(key, allowed) =>
                  setPermissions((current) =>
                    allowed ? [...new Set([...current, key])] : current.filter((item) => item !== key)
                  )
                }
              />
            </>
          ) : (
            <>
              <label className="flex items-start gap-3 font-ui text-sm text-ink">
                <input
                  type="checkbox"
                  checked={customPermissions}
                  onChange={(event) => {
                    const custom = event.target.checked;
                    setCustomPermissions(custom);
                    if (custom && draft.role) setPermissions(getDefaultPermissions(draft.role));
                  }}
                  className="mt-0.5 accent-ink"
                />
                <span>
                  Customise operational permissions
                  <span className="mt-1 block text-[11px] text-taupe">
                    Off, the new account simply inherits the selected role's established set.
                  </span>
                </span>
              </label>
              {errors.permissions ? <p className="mt-3 font-ui text-xs text-accent">{errors.permissions}</p> : null}
              {customPermissions ? (
                <PermissionMatrix
                  className="mt-6"
                  permissions={permissions}
                  editable
                  onToggle={(key, allowed) =>
                    setPermissions((current) =>
                      allowed ? [...new Set([...current, key])] : current.filter((item) => item !== key)
                    )
                  }
                />
              ) : (
                <p className="mt-4 font-ui text-xs text-taupe">
                  The selected role's established operational permission set will be used.
                </p>
              )}
            </>
          )}
        </AdminPanel>

        <div className="flex flex-wrap gap-3">
          <AtelierButton type="submit" disabled={isWorking || creatableLevels.length === 0}>
            {isWorking ? "Creating…" : "Create account"}
          </AtelierButton>
          <AtelierButton type="button" variant="outline" onClick={() => navigate(base)} disabled={isWorking}>
            Cancel
          </AtelierButton>
        </div>
      </form>
    </AdminPage>
  );
}
