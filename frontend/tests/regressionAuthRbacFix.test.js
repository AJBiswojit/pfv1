/**
 * Regression pins for the 2026-09 Auth/RBAC bug-fix pass.
 *
 * Issue 1 — ACCOUNT CREATION REQUIRES DATE/TIME
 * Issue 2 — EMPLOYEE CONTROL SECTION NOT GROUPED
 * Issue 3 — SUPER_EMPLOYEE PASSWORD SET → BLANK PAGE
 *
 * These tests do not duplicate backend security enforcement — they pin the
 * exact root causes that were fixed (required flag, payload sanitisation,
 * grouped catalogue reuse, re-auth after forced password change).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");

// ── Issue 1 ──────────────────────────────────────────────────────────────

test("Issue 1: EmployeeForm joiningDate is not required and not marked required", () => {
  const form = src("components/employee/EmployeeForm.jsx");
  // The field must exist but must NOT carry the `required` prop — the
  // attribute would make the browser block SUPER_ADMIN/SUPER_EMPLOYEE creates
  // when the block is hidden but the draft still carries "".
  assert.match(form, /label="Joining date"/);
  assert.doesNotMatch(form, /label="Joining date" required/);
});

test("Issue 1: validateEmployeeDraft does not require joiningDate", async () => {
  const { validateEmployeeDraft } = await import("../src/services/employees/employeeService.js");
  const draft = {
    firstName: "Asha",
    lastName: "Patel",
    email: "asha@example.com",
    role: "SALES_EXECUTIVE",
    department: "sales",
    store: "floor-1",
    // joiningDate intentionally omitted — must not error
  };
  const result = validateEmployeeDraft(draft, [], { isCreate: true });
  assert.equal(result.ok, true);
  assert.equal(result.errors.joiningDate, undefined);
});

test("Issue 1: employeesApi sanitises empty joiningDate before POST", () => {
  const api = src("services/api/employeesApi.js");
  assert.match(api, /sanitizeEmployeePayload/);
  assert.match(api, /joiningDate/);
  assert.match(api, /delete out\.joiningDate/);
  // backend schema keeps the column nullable; payload must not be "": the
  // Pydantic Optional[date] would 422 on "".
});

test("Issue 1: backend EmployeeCreateRequest coerces empty joiningDate to null", async () => {
  // Source pin — the Pydantic model must normalise "" → None so
  // Optional[date] does not 422 when the hidden admin-domain block sends "".
  // Executing the model requires pydantic/sqlalchemy; pin the source instead.
  const backendSrc = readFileSync(fileURLToPath(new URL("../../backend/app/schemas/employee/employee.py", import.meta.url)), "utf8");
  assert.match(backendSrc, /_coerce_empty_joining_date/);
  assert.match(backendSrc, /joiningDate.*Optional\[date\]/);
  assert.match(backendSrc, /field_validator.*joiningDate.*mode=.before./);
  // Also verify the update DTO has the same guard
  assert.match(backendSrc, /_coerce_empty_joining_date_update/);
});

// ── Issue 2 ──────────────────────────────────────────────────────────────

test("Issue 2: AdminEmployeeCreate uses grouped CAPABILITY_GROUPS for every level including EMPLOYEE", () => {
  const page = src("pages/admin/employees/AdminEmployeeCreate.jsx");
  // The fix makes EMPLOYEE share the SAME grouped control architecture.
  // No second permission system must exist.
  assert.match(page, /const capabilityDriven = true/);
  assert.match(page, /CAPABILITY_GROUPS/);
  // The legacy per-level branch `accountLevel !==ACCOUNT_LEVELS.EMPLOYEE` must be gone.
  assert.doesNotMatch(page, /accountLevel !== ACCOUNT_LEVELS\.EMPLOYEE/);
  // PermissionMatrix must be rendered with the grouped catalogue for all levels.
  assert.match(page, /catalogue=\{CAPABILITY_GROUPS\}/);
});

test("Issue 2: AdminEmployeeEdit uses grouped CAPABILITY_GROUPS for EMPLOYEE", () => {
  const page = src("pages/admin/employees/AdminEmployeeEdit.jsx");
  assert.match(page, /const capabilityDriven = true/);
  assert.match(page, /CAPABILITY_GROUPS/);
  assert.doesNotMatch(page, /accountLevel !== ACCOUNT_LEVELS\.EMPLOYEE/);
});

test("Issue 2: AdminEmployeeDetail shows Effective capabilities with CAPABILITY_GROUPS for EMPLOYEE", () => {
  const page = src("pages/admin/employees/AdminEmployeeDetail.jsx");
  assert.match(page, /const capabilityDriven = true/);
  assert.match(page, /CAPABILITY_GROUPS/);
  // Detail must not show "Role defaults" for EMPLOYEE any longer.
  assert.doesNotMatch(page, /Role defaults/);
  assert.match(page, /Delegated capability set/);
});

test("Issue 2: frontend and backend agree on the grouped catalogue shape", async () => {
  const { CAPABILITY_GROUPS } = await import("../src/config/rbacModel.js");
  // Canonical groups pinned in the contract — every level renders them.
  const ids = CAPABILITY_GROUPS.map((g) => g.id);
  for (const required of ["CATALOGUE", "PRODUCT_WORKFLOW", "MEDIA", "ORDERS", "RETURNS", "CUSTOMERS", "PEOPLE", "MARKETING", "ANALYTICS", "OFFERS", "SETTINGS", "AI_ASSISTANT"]) {
    assert.ok(ids.includes(required), `missing group ${required}`);
  }
  // PEOPLE group must contain the Security action (people.security) — the
  // ceiling that stops SUPER_EMPLOYEE from gaining admin authority.
  const people = CAPABILITY_GROUPS.find((g) => g.id === "PEOPLE");
  const codes = people.actions.map((a) => a.code);
  assert.ok(codes.includes("people.security"));
  assert.ok(codes.includes("people.manage"));
});

// ── Issue 3 ──────────────────────────────────────────────────────────────

test("Issue 3: EmployeeAuthContext re-establishes session after forced password change (no blank page)", () => {
  const ctx = src("context/EmployeeAuthContext.jsx");
  // After a successful change the backend has blacklisted the old token
  // (unless it was the forced initial flow where we keep it valid). The
  // context must re-authenticate with the new credential and refresh the
  // profile so navigation to /employee resolves account_level and loads
  // permissions — not just clear a local flag.
  assert.match(ctx, /apiSignInStaff/);
  assert.match(ctx, /apiRestoreEmployeeSession/);
  assert.match(ctx, /was_forced|re-establish|re-auth/i);
  // The old naive flag-clear must not remain as the sole behaviour.
  // The new implementation still clears the flag as a fallback but only
  // after attempting a real re-auth.
  const oldSnippet = "Clear force_password_change flag on the local snapshot";
  assert.doesNotMatch(ctx, new RegExp(oldSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Issue 3: EmployeeChangePassword routes to the account-level home after successful re-auth", () => {
  const page = src("pages/employee/EmployeeChangePassword.jsx");
  // The post-reset destination is derived from the freshly-hydrated
  // accountLevel (homeForAccountLevel), not hardcoded to the page the user
  // came from — SUPER_EMPLOYEE and EMPLOYEE both land on /employee.
  assert.match(page, /homeForAccountLevel\(result\.employee\?\.accountLevel \|\| employee\?\.accountLevel\)/);
  assert.match(page, /navigate\(home, \{ replace: true \}\)/);
  assert.match(page, /changePassword/);
});

test("Issue 4: employee home keeps portal chrome when a path is denied", () => {
  const layout = src("layouts/EmployeeLayout.jsx");
  // A missing dashboard.view must not unmount header/sidebar (white /employee).
  assert.match(layout, /denied \? <Navigate to="\/employee\/access-denied"/);
  assert.match(layout, /<EmployeeHeader/);
  assert.match(layout, /EmployeeDeskErrorBoundary/);
  assert.doesNotMatch(
    layout,
    /if \(required && employee && !hasPermission\(required\).*\) \{\s*return <Navigate/,
  );
});

test("Issue 4: workforce attendance settings do not fetch admin-scoped sections", () => {
  const settings = src("services/workforce/settings.js");
  assert.doesNotMatch(settings, /from ["']\.\.\/settingsRepository["']/);
  assert.doesNotMatch(settings, /getSection\(/);
  assert.match(settings, /ATTENDANCE_DEFAULTS/);
});

test("Issue 4: performance list drops null reviews instead of crashing the house summary", () => {
  const service = src("services/workforce/performanceService.js");
  assert.match(service, /if \(!record \|\| !employee\) return null;/);
  assert.match(service, /\.filter\(Boolean\)/);
});

test("Issue 4: SUPER_EMPLOYEE dashboard is not the Sales floor fallback", () => {
  const dash = src("components/employee/dashboards/RoleDashboard.jsx");
  assert.match(dash, /ACCOUNT_LEVELS\.SUPER_EMPLOYEE/);
  assert.match(dash, /ManagerDashboard/);
  assert.doesNotMatch(dash, /return <SalesDashboard \/>;\s*\}?\s*$/);
});

test("Issue 4: staff login refuses to open a blank portal when restore fails", () => {
  const page = src("pages/auth/StaffLogin.jsx");
  assert.match(page, /session\?\.isAuthenticated/);
  assert.match(page, /admin profile could not be opened/);
  assert.match(page, /employee profile could not be opened/);
});

test("Issue 4: toEmployeeProfile does not treat account levels as floor roles", () => {
  const api = src("services/api/authApi.js");
  assert.match(api, /function pickBusinessRole/);
  assert.match(api, /SUPER_EMPLOYEE/);
  assert.doesNotMatch(api, /dto\.roles\?\.\[0\] \?\? dto\.role \?\? "EMPLOYEE"/);
});

test("Issue 3: backend keeps access token valid for the initial forced-password flow", async () => {
  const backendSrc = readFileSync(fileURLToPath(new URL("../../backend/app/services/auth/auth_service.py", import.meta.url)), "utf8");
  // The service must capture the pre-change forced flag and skip
  // blacklisting the current access token for that one forced set-password
  // so the UI can navigate to /employee without a blank race.
  assert.match(backendSrc, /was_forced = bool\(user\.force_password_change\)/);
  assert.match(backendSrc, /if access_token and not was_forced/);
  assert.match(backendSrc, /Password changed user_id=%s was_forced/);
});

test("Issue 4: EMPLOYEE without assigned capabilities still has dashboard.view", async () => {
  const { hasPermission } = await import("../src/services/employees/authorization.js");
  const employee = {
    status: "ACTIVE",
    accountLevel: "EMPLOYEE",
    permissions: ["catalogue.view"],
  };
  assert.equal(hasPermission(employee, "dashboard.view"), true);
  assert.equal(hasPermission(employee, "profile.view"), true);
  assert.equal(hasPermission(employee, "employees.view"), false);
  assert.equal(hasPermission(employee, "people.manage"), false);
});

test("Issue 4: SUPER_EMPLOYEE with people.manage can view team-access", async () => {
  const { hasPermission } = await import("../src/services/employees/authorization.js");
  const actor = {
    status: "ACTIVE",
    accountLevel: "SUPER_EMPLOYEE",
    permissions: ["people.manage"],
  };
  assert.equal(hasPermission(actor, "dashboard.view"), true);
  assert.equal(hasPermission(actor, "employees.view"), true);
  assert.equal(hasPermission(actor, "employees.create"), true);
  assert.equal(hasPermission(actor, "employees.managePermissions"), false);
});

test("Issue 4: SUPER_ADMIN home stays on /admin and is not employee-gated", async () => {
  const { homeForAccountLevel, ACCOUNT_LEVELS } = await import("../src/config/rbacModel.js");
  assert.equal(homeForAccountLevel(ACCOUNT_LEVELS.SUPER_ADMIN), "/admin");
  const layout = src("layouts/AdminLayout.jsx");
  assert.doesNotMatch(layout, /dashboard\.view/);
  assert.doesNotMatch(layout, /requiredPermissionForPath/);
});

// ── Admin directory roster (created ADMIN missing from list / no PF code) ─

test("Admin directory: list API sends include_admins only when asked", () => {
  const api = src("services/api/employeesApi.js");
  assert.match(api, /includeAdmins = false/);
  assert.match(api, /if \(includeAdmins\) qs\.set\("include_admins", "true"\)/);
});

test("Admin directory: admin-workspace sync requests the full staff roster", () => {
  const ctx = src("context/EmployeeManagementContext.jsx");
  assert.match(ctx, /includeAdmins: scope === "admin"/);
  const service = src("services/employees/employeeService.js");
  assert.match(service, /includeAdmins: true/);
});

test("Admin directory: create form previews a PF-ADM id instead of a placeholder", () => {
  const page = src("pages/admin/employees/AdminEmployeeCreate.jsx");
  assert.doesNotMatch(page, /Assigned for Admin-workspace accounts/);
  assert.match(page, /adminDomain \? accountLevel : draft\.role/);
});

test("Admin directory: ADM prefix is used for admin-workspace levels", async () => {
  const { prefixForAssignment, generateEmployeeId } = await import("../src/services/employees/employeeId.js");
  assert.equal(prefixForAssignment("ADMIN"), "ADM");
  assert.equal(prefixForAssignment("SUPER_ADMIN"), "ADM");
  assert.match(generateEmployeeId({ role: "ADMIN", existingIds: [] }), /^PF-ADM-\d{5}$/);
});
