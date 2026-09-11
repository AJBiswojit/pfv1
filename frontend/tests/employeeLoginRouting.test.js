/**
 * Employee login routing / unified login — regression pins.
 *
 * Pins the canonical authentication routing contract after the unified-login
 * consolidation:
 *
 *   • ONE login page: /login (StaffLogin) for all four staff account levels.
 *   • The post-authentication destination is derived from the BACKEND's
 *     authoritative `accountLevel` — never the typed identifier, the old
 *     `user_type` alone, a selected tab, or the page the user came from.
 *   • /employee/login and /admin/login are pure redirects to /login.
 *   • Logout from either workspace returns to /login.
 *   • Forced password change re-routes on the fresh session's account level.
 *   • A browser refresh re-derives the workspace from the restored session.
 *
 * Structural pins only (same convention as unifiedLogin.test.js): they keep
 * the routing honest without duplicating backend security, which lives in
 * app/core/rbac.py and is exercised by the backend test suite.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ACCOUNT_LEVELS,
  ACCOUNT_LEVEL_ORDER,
  homeForAccountLevel,
} from "../src/config/rbacModel.js";

const src = (rel) =>
  readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");

const app = src("App.jsx");
const staffLogin = src("pages/auth/StaffLogin.jsx");
const adminLogin = src("pages/admin/AdminLogin.jsx");
const employeeLogin = src("pages/employee/EmployeeLogin.jsx");
const changePassword = src("pages/employee/EmployeeChangePassword.jsx");
const adminHeader = src("components/admin/AdminHeader.jsx");
const employeeHeader = src("components/employee/EmployeeHeader.jsx");
const adminGuard = src("components/admin/AdminProtectedRoute.jsx");
const employeeGuard = src("components/employee/EmployeeProtectedRoute.jsx");
const authApi = src("services/api/authApi.js");

// ── A–D: account level → workspace home ──────────────────────────────────

test("SUPER_ADMIN routes to /admin", () => {
  assert.equal(homeForAccountLevel(ACCOUNT_LEVELS.SUPER_ADMIN), "/admin");
});

test("ADMIN routes to /admin", () => {
  assert.equal(homeForAccountLevel(ACCOUNT_LEVELS.ADMIN), "/admin");
});

test("SUPER_EMPLOYEE routes to /employee", () => {
  assert.equal(homeForAccountLevel(ACCOUNT_LEVELS.SUPER_EMPLOYEE), "/employee");
});

test("EMPLOYEE routes to /employee", () => {
  assert.equal(homeForAccountLevel(ACCOUNT_LEVELS.EMPLOYEE), "/employee");
});

test("unknown/customer levels have no staff workspace home", () => {
  assert.equal(homeForAccountLevel(null), null);
  assert.equal(homeForAccountLevel(undefined), null);
  assert.equal(homeForAccountLevel("CUSTOMER"), null);
  assert.equal(homeForAccountLevel("NOPE"), null);
});

test("the mapping is closed over the four-level hierarchy — nothing else", () => {
  for (const level of ACCOUNT_LEVEL_ORDER) {
    assert.ok(
      homeForAccountLevel(level) === "/admin" || homeForAccountLevel(level) === "/employee",
      `${level} must map to a workspace home`,
    );
  }
});

// ── the /login page routes by the server-resolved accountLevel ──────────

test("/login routes by accountLevel (with workspace only as a legacy fallback)", () => {
  assert.match(app, /path="\/login" element=\{<StaffLogin \/>\}/);
  assert.match(staffLogin, /homeForAccountLevel\(result\.accountLevel\)/);
  assert.match(staffLogin, /result\.workspace === "admin" \? "\/admin" : "\/employee"/);
  assert.match(staffLogin, /if \(home === "\/admin"\)/);
});

test("/login never guesses the destination from the typed identifier", () => {
  // No email-domain / identifier-prefix sniffing, no old user_type-only
  // branching, no hardcoded per-portal login destination.
  assert.doesNotMatch(staffLogin, /endsWith\(/);
  assert.doesNotMatch(staffLogin, /user_type/);
  assert.doesNotMatch(staffLogin, /includes\("@"/);
});

test("employee mustChangePassword still lands on the employee change-password page", () => {
  assert.match(
    staffLogin,
    /result\.employee\?\.mustChangePassword \? "\/employee\/change-password" : returnTo/,
  );
});

// ── E/F: legacy login routes are pure redirects to /login ───────────────

test("direct /employee/login is a thin redirect to /login", () => {
  assert.match(app, /path="\/employee\/login" element=\{<EmployeeLogin \/>\}/);
  assert.match(employeeLogin, /<Navigate to=\{target\} replace \/>/);
  assert.match(employeeLogin, /"\/login"/);
  // no credential handling survives on the legacy page
  assert.doesNotMatch(employeeLogin, /apiSignIn|password/);
});

test("direct /admin/login is a thin redirect to /login", () => {
  assert.match(app, /path="\/admin\/login" element=\{<AdminLogin \/>\}/);
  assert.match(adminLogin, /<Navigate to=\{target\} replace \/>/);
  assert.match(adminLogin, /"\/login"/);
  assert.doesNotMatch(adminLogin, /apiSignIn|password/);
});

// ── G: logout → /login from either workspace ────────────────────────────

test("Admin sign-out returns to /login", () => {
  assert.match(adminHeader, /signOut\(\);/);
  assert.match(adminHeader, /navigate\("\/login", \{ replace: true \}\)/);
});

test("Employee sign-out returns to /login", () => {
  assert.match(employeeHeader, /signOut\(\);/);
  assert.match(employeeHeader, /navigate\("\/login", \{ replace: true \}\)/);
});

// ── H/I: forced password change re-routes on the fresh account level ────

test("forced password change routes SUPER_EMPLOYEE/EMPLOYEE to /employee via accountLevel", () => {
  // The post-reset destination is the freshly-hydrated session's account
  // level (homeForAccountLevel), not the page the user came from.
  assert.match(changePassword, /homeForAccountLevel\(employee\?\.accountLevel\)/);
  assert.match(changePassword, /navigate\(home, \{ replace: true \}\)/);
  assert.equal(homeForAccountLevel(ACCOUNT_LEVELS.SUPER_EMPLOYEE), "/employee");
  assert.equal(homeForAccountLevel(ACCOUNT_LEVELS.EMPLOYEE), "/employee");
});

// ── J: ADMIN/SUPER_ADMIN never detour into the employee change-password page ──

test("ADMIN/SUPER_ADMIN post-login routing stays on the admin workspace", () => {
  // The admin branch navigates to the sanitized admin returnTo (default
  // /admin); only the employee branch consults mustChangePassword.
  assert.match(staffLogin, /sanitizeAdminReturnUrl/);
  const adminBranch = staffLogin.split("if (home === \"/admin\")")[1].split("await refreshEmployeeSession")[0];
  assert.match(adminBranch, /refreshAdminSession/);
  assert.doesNotMatch(adminBranch, /change-password/);
});

// ── K: browser refresh preserves the authenticated workspace ────────────

test("session restore re-derives the workspace from accountLevel (browser refresh)", () => {
  // Both restores hit the real backend session endpoints and map accountLevel;
  // the guards branch on the restored identity, never the URL or a tab.
  assert.match(authApi, /apiRestoreAdminSession/);
  assert.match(authApi, /apiRestoreEmployeeSession/);
  assert.match(authApi, /accountLevel:.*dto\.accountLevel/);
  assert.match(adminGuard, /hasAdminWorkspaceAccess/);
  assert.match(employeeGuard, /useEmployeeAuth/);
  assert.match(employeeGuard, /\/login\?returnTo=/);
  assert.match(adminGuard, /\/login\?returnTo=/);
  assert.doesNotMatch(adminGuard, /isSuperAdmin\b/);
});
