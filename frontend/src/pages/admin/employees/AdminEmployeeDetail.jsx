import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { KeyRound, Mail, Phone, ShieldCheck } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import ActivityFeed from "../../../components/employee/ActivityFeed";
import CredentialSheet from "../../../components/employee/CredentialSheet";
import PermissionMatrix from "../../../components/employee/PermissionMatrix";
import StatusBadge from "../../../components/employee/StatusBadge";
import ConfirmDialog from "../../../components/orders/ConfirmDialog";
import { AtelierButton } from "../../../design-system";
import { useEmployeeManagement } from "../../../context/EmployeeManagementContext";
import { getDepartmentLabel } from "../../../config/employeeDepartments";
import { isAccessBlocked } from "../../../config/employeeStatus";
import { getRoleLabel } from "../../../config/employeeRoles";
import { ACCOUNT_LEVELS, ACCOUNT_LEVEL_META, CAPABILITY_GROUPS } from "../../../config/rbacModel";
import { employeeFullName, formatEmployeeDateTime, staffHrefId } from "../../../utils/employee";
import { useEmployeesBase } from "./employeesBase";

const actionCopy = {
  activate: {
    title: "Activate this employee?",
    description: "Employee Portal access will be restored with the current credentials, and this person can appear in active work assignment selectors.",
    pending: "Activating…",
  },
  deactivate: {
    title: "Deactivate this employee?",
    description: "Employee Portal access and new work assignment will stop. Existing product review, activity and historical records remain intact.",
    pending: "Deactivating…",
  },
  suspend: {
    title: "Suspend this employee?",
    description: "Sign-in is blocked immediately. The account stays on the register and can be activated again without recreating it.",
    pending: "Suspending…",
  },
  reset: {
    title: "Reset employee credentials?",
    description: "A one-time temporary password will be issued. The employee must change it after signing in. No password is stored on the profile.",
    pending: "Resetting…",
  },
};

export default function AdminEmployeeDetail({ basePath } = {}) {
  const { employeeId } = useParams();
  const location = useLocation();
  const base = useEmployeesBase(basePath);
  const {
    getEmployee,
    loadEmployee,
    getActivity,
    canManageEmployees,
    activateEmployee,
    deactivateEmployee,
    suspendEmployee,
    resetEmployeePassword,
  } = useEmployeeManagement();
  const person = getEmployee(employeeId);
  const [lookup, setLookup] = useState(person ? "ready" : "pending");
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice || "");
  const [issued, setIssued] = useState(null);

  useEffect(() => {
    if (person) {
      setLookup("ready");
      return;
    }
    let cancelled = false;
    setLookup("pending");
    loadEmployee(employeeId).then((found) => {
      if (cancelled) return;
      setLookup(found ? "ready" : "missing");
    });
    return () => { cancelled = true; };
  }, [employeeId, person, loadEmployee]);

  if (lookup === "pending" && !person) {
    return (
      <AdminPage eyebrow="People / Organization" title="Opening account" description="Loading this staff account." />
    );
  }

  if (!person) {
    return (
      <AdminPage eyebrow="People / Organization" title="Employee not found" description="That employee ID is not in the account register.">
        <AtelierButton as={Link} to={base} variant="outline" size="chip">All employees</AtelierButton>
      </AdminPage>
    );
  }

  const run = async () => {
    if (!confirm || busy) return;
    const action = confirm;
    setBusy(action);
    setNotice("");
    let result;
    if (action === "activate") result = await activateEmployee(staffHrefId(person));
    if (action === "deactivate") result = await deactivateEmployee(staffHrefId(person));
    if (action === "suspend") result = await suspendEmployee(staffHrefId(person));
    if (action === "reset") result = await resetEmployeePassword(staffHrefId(person));
    setBusy(null);
    setConfirm(null);
    if (!result?.ok) {
      setNotice(result?.message || "The account could not be updated.");
      return;
    }
    if (action === "reset") {
      setIssued({ ...result, employee: result.employee || person });
      setNotice(result.temporaryPassword ? "Temporary credentials were reset successfully." : "Password was reset but no temporary secret was returned.");
    } else if (action === "suspend") {
      setNotice("Employee account suspended.");
    } else {
      setNotice(`Employee account ${action === "activate" ? "activated" : "deactivated"}.`);
    }
  };

  const accountLevel = person.accountLevel || ACCOUNT_LEVELS.EMPLOYEE;
  const levelMeta = ACCOUNT_LEVEL_META[accountLevel];
  // Detail view uses the single grouped catalogue for every level now.
  const capabilityDriven = true;
  const employeeDomain = !levelMeta || levelMeta.workspace === "employee";
  const profileRows = [
    ["Employee ID", person.employeeId],
    ["Account level", levelMeta?.label ?? accountLevel],
    ["Workspace", levelMeta?.workspace === "admin" ? "Admin Portal" : "Employee Portal"],
    ["Business role", getRoleLabel(person.role)],
    // Store assignment belongs to the employee domain; Admin-workspace
    // accounts carry none.
    ...(employeeDomain
      ? [
          ["Department", getDepartmentLabel(person.department)],
        ]
      : []),
  ];
  const accountRows = [
    ["Account status", <StatusBadge key="status" status={person.status} />],
    ["Last login", person.lastLogin ? formatEmployeeDateTime(person.lastLogin) : "Never"],
    ["Created", formatEmployeeDateTime(person.createdAt)],
    ["Updated", formatEmployeeDateTime(person.updatedAt)],
    ["Credential setup", person.mustChangePassword ? "Temporary password · change required" : "Password set"],
    ["Permission source", "Delegated capability set"],
  ];

  const rows = (items) => (
    <dl className="divide-y divide-mist/70">
      {items.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-3 sm:grid-cols-[150px_minmax(0,1fr)]">
          <dt className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">{label}</dt>
          <dd className="font-ui text-sm text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <AdminPage
      eyebrow="People / Organization / Account"
      title={employeeFullName(person)}
      description={`${levelMeta?.label ?? "Employee"} · ${getRoleLabel(person.role)}${employeeDomain ? ` · ${getDepartmentLabel(person.department)}` : ""} · Administration profile`}
      actions={
        <>
          {canManageEmployees ? (
            <AtelierButton as={Link} to={`${base}/${staffHrefId(person)}/edit`} size="chip">Edit employee</AtelierButton>
          ) : null}
          <AtelierButton as={Link} to={base} variant="outline" size="chip">All employees</AtelierButton>
        </>
      }
    >
      {notice ? (
        <p role="status" aria-live="polite" className="mb-6 border border-cocoa/30 bg-cocoa/5 px-4 py-3 font-ui text-sm text-cocoa">{notice}</p>
      ) : null}

      <div className="mb-7 flex flex-wrap items-center gap-2">
        <StatusBadge status={person.status} />
        {canManageEmployees && isAccessBlocked(person.status) ? (
          <AtelierButton size="chip" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirm("activate")}>
            {busy === "activate" ? "Activating…" : "Activate"}
          </AtelierButton>
        ) : null}
        {canManageEmployees && !isAccessBlocked(person.status) ? (
          <>
            <AtelierButton size="chip" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirm("suspend")}>
              {busy === "suspend" ? "Suspending…" : "Suspend"}
            </AtelierButton>
            <AtelierButton size="chip" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirm("deactivate")}>
              {busy === "deactivate" ? "Deactivating…" : "Deactivate"}
            </AtelierButton>
          </>
        ) : null}
        {canManageEmployees ? (
          <AtelierButton size="chip" variant="outline" disabled={Boolean(busy)} onClick={() => setConfirm("reset")}>
            {busy === "reset" ? "Resetting…" : "Reset credentials"}
          </AtelierButton>
        ) : null}
      </div>

      {issued?.temporaryPassword ? (
        <div className="mb-7">
          <CredentialSheet employee={issued.employee} temporaryPassword={issued.temporaryPassword} onDone={() => setIssued(null)} />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel eyebrow="Profile" title="Assignment">{rows(profileRows)}</AdminPanel>
        <AdminPanel eyebrow="Account" title="Access status">{rows(accountRows)}</AdminPanel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)]">
        <AdminPanel eyebrow="Contact" title="Reach this employee">
          <div className="space-y-4 font-ui text-sm">
            <p className="flex items-center gap-3"><Mail size={14} className="text-accent" aria-hidden="true" /><a className="break-all text-brass hover:text-accent" href={`mailto:${person.email}`}>{person.email}</a></p>
            <p className="flex items-center gap-3"><Phone size={14} className="text-accent" aria-hidden="true" /><span>{person.phone || "No phone recorded"}</span></p>
            <p className="flex items-center gap-3"><KeyRound size={14} className="text-accent" aria-hidden="true" /><span>Credentials remain isolated from this profile.</span></p>
            <p className="flex items-center gap-3"><ShieldCheck size={14} className="text-accent" aria-hidden="true" /><span>No Admin Portal identity or authority.</span></p>
          </div>
        </AdminPanel>
        <AdminPanel eyebrow={`${person.permissions.length} grants`} title={capabilityDriven ? "Effective capabilities" : "Operational permissions"}>
          <PermissionMatrix
            permissions={person.permissions}
            catalogue={capabilityDriven ? CAPABILITY_GROUPS : undefined}
          />
        </AdminPanel>
      </div>

      <div className="mt-6">
        <AdminPanel eyebrow="Account administration" title="Relevant activity">
          <ActivityFeed entries={getActivity(person.employeeId)} empty="No account activity has been recorded for this employee." />
        </AdminPanel>
      </div>

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        title={confirm ? actionCopy[confirm].title : "Confirm account action"}
        description={confirm ? actionCopy[confirm].description : ""}
        confirmLabel={busy && confirm ? actionCopy[confirm].pending : "Confirm"}
        cancelLabel="Cancel"
        onConfirm={run}
        onCancel={() => { if (!busy) setConfirm(null); }}
      />
    </AdminPage>
  );
}
