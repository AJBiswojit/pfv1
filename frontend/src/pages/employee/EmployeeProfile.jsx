import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { AtelierButton } from "../../design-system";
import EmployeeField, { employeeInputClass } from "../../components/employee/EmployeeField";
import EmployeePage from "../../components/employee/EmployeePage";
import StatusBadge from "../../components/employee/StatusBadge";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { getDepartmentLabel, getSectionLabel, getStoreLabel } from "../../config/employeeDepartments";
import { getRoleLabel } from "../../config/employeeRoles";
import { employeeFullName, formatEmployeeDate } from "../../utils/employee";
import { isValidPhone } from "../../utils/validation";
import { PERMISSIONS } from "../../config/employeePermissions";
import { cn } from "../../utils/cn";

export default function EmployeeProfile() {
  const { employee, hasPermission, updateOwnProfile } = useEmployeeAuth();
  const canEdit = hasPermission(PERMISSIONS.PROFILE_EDIT);
  const [draft, setDraft] = useState({ name: "", phone: "" });
  const [feedback, setFeedback] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!employee) return;
    setDraft({
      name: employeeFullName(employee) === "Team member" ? "" : employeeFullName(employee),
      phone: employee.phone || "",
    });
  }, [employee?.id, employee?.firstName, employee?.lastName, employee?.name, employee?.phone]);

  if (!employee) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!draft.name.trim()) {
      setFeedback({ ok: false, message: "Name is required." });
      return;
    }
    if (draft.phone && !isValidPhone(draft.phone)) {
      setFeedback({ ok: false, message: "Please enter a valid 10-digit mobile number." });
      return;
    }
    setSaving(true);
    const result = await updateOwnProfile({
      name: draft.name.trim(),
      phone: draft.phone,
    });
    setSaving(false);
    if (result.ok) {
      setFeedback({ ok: true, message: "Your profile has been saved." });
    } else {
      setFeedback({
        ok: false,
        message: result.errors?.phone || result.error || "The profile could not be updated.",
      });
    }
  };

  const displayName = employeeFullName(employee);
  const rows = [
    ["Name", displayName],
    ["Employee ID", employee.employeeId],
    ["Role", getRoleLabel(employee.role)],
    ["Department", getDepartmentLabel(employee.department)],
    ["Section", getSectionLabel(employee.department, employee.section)],
    ["Store / floor", getStoreLabel(employee.store)],
    ["Joining date", formatEmployeeDate(employee.joiningDate)],
    ["Email", employee.email],
    ["Shift", employee.shift],
    ["Title", employee.designation],
  ];

  return (
    <EmployeePage
      eyebrow="Identity"
      title={
        <>
          Your house <span className="italic text-accent">profile.</span>
        </>
      }
      description="Role, department and employee ID are issued by administration. You may keep your name and reachable number current."
    >
      <div className="mb-6">
        <StatusBadge status={employee.status} />
      </div>

      {feedback ? (
        <div
          role="status"
          className={cn(
            "mb-6 flex items-center gap-3 border p-4 font-ui text-xs",
            feedback.ok ? "border-cocoa/40 bg-cocoa/10 text-cocoa" : "border-accent/40 bg-accent/5 text-accent"
          )}
        >
          {feedback.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {feedback.message}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <dl className="divide-y divide-mist/70 border border-mist/80 bg-surface/30">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <dt className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">{label}</dt>
              <dd className="font-ui text-sm text-ink">{value || "—"}</dd>
            </div>
          ))}
        </dl>

        <form onSubmit={handleSubmit} className="border border-mist/80 bg-surface/40 p-6">
          <div className="grid gap-5">
            <EmployeeField label="Name" required hint="Shown on your desk and in the directory.">
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                disabled={!canEdit}
                className={employeeInputClass()}
              />
            </EmployeeField>
            <EmployeeField label="Phone" hint="The number the floor uses to reach you.">
              <input
                value={draft.phone}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                disabled={!canEdit}
                className={employeeInputClass()}
              />
            </EmployeeField>
          </div>
          <p className="mt-4 font-ui text-[11px] text-taupe">
            Role, department, section and status can only be changed by an administrator.
          </p>
          {canEdit ? (
            <div className="mt-6">
              <AtelierButton type="submit" size="chip" disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </AtelierButton>
            </div>
          ) : null}
        </form>
      </div>
    </EmployeePage>
  );
}
