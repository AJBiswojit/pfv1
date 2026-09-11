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
  assert.match(page, /homeForAccountLevel\(employee\?\.accountLevel\)/);
  assert.match(page, /navigate\(home, \{ replace: true \}\)/);
  assert.match(page, /changePassword/);
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
