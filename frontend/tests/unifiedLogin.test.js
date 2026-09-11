/**
 * Unified staff login + capability-driven Admin workspace — structural pins.
 *
 * These tests keep the CONSOLIDATION honest without duplicating backend
 * security: there is exactly one staff sign-in surface, the legacy paths
 * only redirect, both workspace contexts authenticate through the unified
 * endpoint, and navigation is filtered from the ONE admin nav config by
 * canonical capabilities (mirrored/enforced by the backend — see
 * rbacContract.test.js for the vocabulary pin).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Module imports for the catalogue/behavior checks (values, not source text).
import { ADMIN_NAV_GROUPS, filterAdminNav } from "../src/config/adminNavigation.js";
import { CAPABILITY_CODES } from "../src/config/rbacModel.js";
import {
  ADMIN_PERMISSIONS,
  hasAdminPermission,
  isSuperEmployeeAccount,
} from "../src/config/adminAccess.js";

const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");

const app = src("App.jsx");
const staffLogin = src("pages/auth/StaffLogin.jsx");
const adminLogin = src("pages/admin/AdminLogin.jsx");
const employeeLogin = src("pages/employee/EmployeeLogin.jsx");
const authApi = src("services/api/authApi.js");
const adminAuth = src("context/AdminAuthContext.jsx");
const employeeAuth = src("context/EmployeeAuthContext.jsx");
const adminGuard = src("components/admin/AdminProtectedRoute.jsx");
const employeeGuard = src("components/employee/EmployeeProtectedRoute.jsx");
const adminNav = src("config/adminNavigation.js");
const employeeNav = src("config/employeeNavigation.js");
const adminSidebar = src("components/admin/AdminSidebar.jsx");
const adminAccess = src("config/adminAccess.js");
const rbacModel = src("config/rbacModel.js");

test("ONE login route; legacy admin/employee logins are pure redirects", () => {
  assert.match(app, /path="\/login" element=\{<StaffLogin \/>\}/);
  for (const legacy of [adminLogin, employeeLogin]) {
    assert.match(legacy, /\/login\?returnTo=\$\{encodeURIComponent\(returnTo\)\}/);
    assert.match(legacy, /<Navigate to=\{target\} replace \/>/);
  }
  // no credential handling survives in the legacy pages
  assert.doesNotMatch(adminLogin, /apiSignIn|password/);
  assert.doesNotMatch(employeeLogin, /apiSignIn|password/);
});

test("the unified page authenticates through apiSignInStaff and routes by server workspace", () => {
  assert.match(staffLogin, /apiSignInStaff\(\{ identifier/);
  assert.match(staffLogin, /result\.workspace === "admin"/);
  assert.match(staffLogin, /refreshAdminSession/);
  assert.match(staffLogin, /refreshEmployeeSession/);
  assert.match(staffLogin, /sanitizeAdminReturnUrl/);
  assert.match(staffLogin, /sanitizeEmployeeReturnUrl/);
  assert.match(staffLogin, /mustChangePassword \? "\/employee\/change-password"/);
  // it never guesses a workspace from the typed identifier
  assert.doesNotMatch(staffLogin, /endsWith\(/);
});

test("authApi posts to the ONE endpoint and stores tokens under the resolved scope", () => {
  assert.match(authApi, /apiClient\.post\("\/auth\/staff\/sign-in"/);
  assert.match(authApi, /export async function apiSignInStaff/);
  assert.match(authApi, /const scope = workspace === "admin" \? "admin" : "employee";/);
  // the request asks for NO fixed scope — the server resolves it
  assert.match(authApi, /identifier,\n\s*password,/);
});

test("both workspace contexts sign in through the unified endpoint only", () => {
  assert.match(adminAuth, /apiSignInStaff/);
  assert.match(employeeAuth, /apiSignInStaff/);
  assert.doesNotMatch(adminAuth, /apiSignInAdmin\(/);
  assert.doesNotMatch(employeeAuth, /apiSignInEmployee\(/);
  // cross-workspace sessions are refused and cleaned
  assert.match(adminAuth, /clearTokens\("employee"\)/);
  assert.match(employeeAuth, /clearTokens\("admin"\)/);
});

test("guards redirect to /login carrying returnTo; admin gate is workspace-level", () => {
  assert.match(adminGuard, /\/login\?returnTo=/);
  assert.match(employeeGuard, /\/login\?returnTo=/);
  assert.match(adminGuard, /hasAdminWorkspaceAccess/);
  assert.doesNotMatch(adminGuard, /isSuperAdmin\b/);
});

test("branding points both portals at the unified login", () => {
  assert.match(adminNav, /login: "\/login"/);
  assert.match(employeeNav, /login: "\/login"/);
});

test("navigation is capability-filtered from the one admin config", () => {
  assert.match(adminNav, /export const filterAdminNav/);
  assert.match(adminSidebar, /filterAdminNav\(ADMIN_NAV_GROUPS, hasPermission\)/);
  // every declared nav permission is a canonical capability
  const declared = [];
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (item.permission) declared.push(item.permission);
      for (const child of item.children ?? []) if (child.permission) declared.push(child.permission);
    }
  }
  assert.ok(declared.length >= 10, "nav should declare capability requirements");
  for (const code of declared) {
    assert.ok(CAPABILITY_CODES.includes(code), `nav permission ${code} must be a canonical capability`);
  }
});

test("filterAdminNav: deny-by-default, parents drop with their children", () => {
  const groups = [
    { id: "a", items: [{ id: "always", to: "/a" }, { id: "needs", to: "/b", permission: "people.manage" }] },
    { id: "b", items: [{ id: "only-child", to: "/c", permission: "catalogue.view", children: [
      { id: "open", to: "/c/1", permission: "catalogue.view" },
      { id: "closed", to: "/c/2", permission: "settings.manage" },
    ] }] },
    { id: "c", items: [{ id: "x", to: "/x", permission: "orders.manage" }] },
  ];
  const can = (code) => code === "people.manage" || code === "catalogue.view";
  const out = filterAdminNav(groups, can);
  assert.deepEqual(out.map((g) => g.id), ["a", "b"]);
  assert.deepEqual(out[0].items.map((i) => i.id), ["always", "needs"]);
  assert.deepEqual(out[1].items[0].children.map((i) => i.id), ["open"]);
  // a null `can` denies everything that declares a permission
  const none = filterAdminNav(groups, null);
  assert.deepEqual(none[0].items.map((i) => i.id), ["always"]);
  assert.equal(none.length, 1);
});

test("adminAccess resolves capabilities, status and the SUPER_ADMIN override", () => {
  assert.equal(ADMIN_PERMISSIONS.EMPLOYEES_MANAGE, "people.manage");
  const base = { adminId: "a1", status: "ACTIVE" };
  const superAdmin = { ...base, accountLevel: "SUPER_ADMIN" };
  assert.equal(hasAdminPermission(superAdmin, "settings.manage"), true);
  const admin = { ...base, accountLevel: "ADMIN", permissions: ["catalogue.view", "people.manage"] };
  assert.equal(hasAdminPermission(admin, "catalogue.view"), true);
  assert.equal(hasAdminPermission(admin, "people.manage"), true);
  assert.equal(hasAdminPermission(admin, "settings.manage"), false);
  // a legacy granular grant satisfies the capability check (both directions)
  const legacy = { ...base, accountLevel: "ADMIN", permissions: ["employees.edit"] };
  assert.equal(hasAdminPermission(legacy, "people.manage"), true);
  // inactive accounts never pass, whatever they hold
  assert.equal(hasAdminPermission({ ...admin, status: "SUSPENDED" }, "catalogue.view"), false);
  // SUPER_EMPLOYEE is not an admin-workspace account but IS an employee-side manager
  assert.equal(hasAdminPermission({ ...admin, accountLevel: "SUPER_EMPLOYEE" }, "people.manage"), false);
  assert.equal(isSuperEmployeeAccount({ accountLevel: "SUPER_EMPLOYEE", status: "ACTIVE" }), true);
  assert.equal(isSuperEmployeeAccount({ accountLevel: "EMPLOYEE", status: "ACTIVE" }), false);
});
