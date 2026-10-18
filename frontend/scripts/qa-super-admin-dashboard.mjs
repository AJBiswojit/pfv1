/**
 * PRATIKSHYA FASHION — live Super Admin workspace verification.
 *
 * Drives the REAL application modules (Vite SSR loader → the same source the
 * browser bundle is built from) against the REAL FastAPI backend and records
 * the full authentication sequence:
 *
 *   1. Super Admin signs in through the real /login page
 *   2. the session is restored / validated against the server
 *   3. the route guard admits (or refuses) the session
 *   4. the dashboard renders — and STAYS rendered
 *   5. a direct reload of /super-admin restores the session and renders again
 *   6. invalid credentials and an invalid session behave safely
 *   7. the other staff levels still reach their own workspace
 *
 * Nothing about the authentication is mocked: every credential, token, role
 * and permission comes from the backend. The only local shims are the browser
 * globals (localStorage / window / document) that a real browser provides.
 *
 * Usage:
 *   node scripts/qa-super-admin-dashboard.mjs
 *
 * Environment:
 *   PF_API_BASE                 backend origin           (default http://127.0.0.1:8000)
 *   PF_SUPER_ADMIN_IDENTIFIER   super admin login id     (default superadmin@pratikshyafashion.in)
 *   PF_SUPER_ADMIN_PASSWORD     super admin password     (default Super@1234)
 *   PF_ADMIN_IDENTIFIER/PASSWORD, PF_EMPLOYEE_*, PF_SUPER_EMPLOYEE_*  (optional)
 *
 * Exit codes: 0 = every executed check passed, 1 = a check failed,
 *             2 = the backend / credentials were unavailable (checks skipped).
 */

import process from "node:process";
import React, { act } from "react";
import { create } from "react-test-renderer";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createServer } from "vite";

const API_BASE = (process.env.PF_API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "");
const API_PREFIX = "/api/v1";
const FRONTEND_ROOT = new URL("../", import.meta.url).pathname;

const SUPER_ADMIN = {
  identifier: process.env.PF_SUPER_ADMIN_IDENTIFIER || "superadmin@pratikshyafashion.in",
  password: process.env.PF_SUPER_ADMIN_PASSWORD || "Super@1234",
};
const ADMIN = {
  identifier: process.env.PF_ADMIN_IDENTIFIER || "",
  password: process.env.PF_ADMIN_PASSWORD || "",
};
const EMPLOYEE = {
  identifier: process.env.PF_EMPLOYEE_IDENTIFIER || "",
  password: process.env.PF_EMPLOYEE_PASSWORD || "",
};
const SUPER_EMPLOYEE = {
  identifier: process.env.PF_SUPER_EMPLOYEE_IDENTIFIER || "",
  password: process.env.PF_SUPER_EMPLOYEE_PASSWORD || "",
};

/* ── tiny result collector ─────────────────────────────────────────────── */
const results = [];
const record = (name, status, detail = "") => {
  results.push({ name, status, detail });
  const mark = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "SKIP";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
};

/* ── browser-ish globals ───────────────────────────────────────────────── */
const storage = new Map();
const listeners = new Map();
const consoleErrors = [];

const makeEventTarget = () => ({
  addEventListener: (type, handler) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
  },
  removeEventListener: (type, handler) => listeners.get(type)?.delete(handler),
  dispatchEvent: (event) => {
    for (const handler of listeners.get(event?.type) ?? []) handler(event);
    return true;
  },
});

const installBrowserGlobals = () => {
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };
  const documentTarget = makeEventTarget();
  globalThis.document = {
    title: "",
    body: { style: {} },
    activeElement: null,
    addEventListener: documentTarget.addEventListener,
    removeEventListener: documentTarget.removeEventListener,
    dispatchEvent: documentTarget.dispatchEvent,
    querySelector: () => null,
    getElementById: () => null,
  };
  const windowTarget = makeEventTarget();
  globalThis.window = {
    localStorage: globalThis.localStorage,
    document: globalThis.document,
    location: { pathname: "/", search: "", hash: "", origin: API_BASE },
    history: { length: 1, state: null, pushState() {}, replaceState() {} },
    addEventListener: windowTarget.addEventListener,
    removeEventListener: windowTarget.removeEventListener,
    dispatchEvent: windowTarget.dispatchEvent,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    scrollTo() {},
    confirm: () => true,
    CustomEvent: globalThis.CustomEvent,
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const realError = console.error;
  console.error = (...args) => {
    consoleErrors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
    realError(...args);
  };
};

/* ── real HTTP against the real backend ───────────────────────────────── */
const network = [];
const realFetch = globalThis.fetch;

const installFetch = () => {
  globalThis.fetch = async (input, options = {}) => {
    const raw = String(input);
    const url = raw.startsWith("http") ? new URL(raw) : new URL(raw, API_BASE);
    const method = options.method ?? "GET";
    const entry = { method, path: `${url.pathname}${url.search}`, status: null };
    network.push(entry);
    const response = await realFetch(url, options);
    entry.status = response.status;
    return response;
  };
};

const flush = async (ms = 0) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

/* ── text helpers for the rendered tree ────────────────────────────────── */
const treeText = (node) => {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(treeText).join(" ");
  return treeText(node.children);
};

const findByType = (tree, type) => tree.root.findAllByType(type);
const findInput = (tree, id) => findByType(tree, "input").find((node) => node.props.id === id);
const findForm = (tree) => findByType(tree, "form")[0];

/**
 * React flushes passive effects when the act() scope ends, so a freshly
 * mounted route only issues its data request at the end of the scope. The
 * settle loop keeps the scope alive until the expected content shows up.
 */
const settle = async (tree, predicate, { timeout = 10000, step = 100 } = {}) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (predicate(treeText(tree.toJSON()))) return true;
    await flush(step);
  }
  return predicate(treeText(tree.toJSON()));
};

/* ── the app under test ────────────────────────────────────────────────── */
let vite;
/** Load a module namespace (named exports + default) through Vite's SSR loader. */
const load = async (path) => vite.ssrLoadModule(`/src/${path}`);

let modules = {};

const buildHarness = (initialPath) => {
  const {
    EmployeeAuthProvider, AdminAuthProvider, StaffLogin, SuperAdminProtectedRoute,
    AdminProtectedRoute, EmployeeProtectedRoute, AdminLayout, AdminDashboard,
    EmployeeDashboard, EmployeeChangePassword,
  } = modules;
  return React.createElement(
    EmployeeAuthProvider,
    null,
    React.createElement(
      AdminAuthProvider,
      null,
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialPath] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: "/login", element: React.createElement(StaffLogin, null) }),
          React.createElement(Route, { path: "/employee/change-password", element: React.createElement(EmployeeChangePassword, null) }),
          React.createElement(
            Route,
            { element: React.createElement(SuperAdminProtectedRoute, null) },
            React.createElement(
              Route,
              { element: React.createElement(AdminLayout, null) },
              React.createElement(Route, { path: "/super-admin", element: React.createElement(AdminDashboard, null) }),
              React.createElement(Route, { path: "/super-admin/orders", element: React.createElement(AdminDashboard, null) }),
            ),
          ),
          React.createElement(
            Route,
            { element: React.createElement(AdminProtectedRoute, null) },
            React.createElement(
              Route,
              { element: React.createElement(AdminLayout, null) },
              React.createElement(Route, { path: "/admin", element: React.createElement(AdminDashboard, null) }),
            ),
          ),
          React.createElement(
            Route,
            { element: React.createElement(EmployeeProtectedRoute, null) },
            React.createElement(
              Route,
              { element: React.createElement(EmployeeDashboard, null) },
              React.createElement(Route, { path: "/employee", element: React.createElement(EmployeeDashboard, null) }),
            ),
          ),
        ),
      ),
    ),
  );
};

const mount = async (initialPath) => {
  let tree;
  await act(async () => {
    tree = create(buildHarness(initialPath));
  });
  return tree;
};

const unmount = async (tree) => {
  if (!tree) return;
  await act(async () => {
    tree.unmount();
  });
};

/* ── the shared sign-in flow (the real /login page) ───────────────────── */
const signInThroughLoginPage = async (tree, identifier, password) => {
  const identifierInput = findInput(tree, "staff-identifier");
  const passwordInput = findInput(tree, "staff-password");
  if (!identifierInput || !passwordInput) throw new Error("staff login form not found");
  await act(async () => {
    identifierInput.props.onChange({ target: { value: identifier } });
    passwordInput.props.onChange({ target: { value: password } });
  });
  const form = findForm(tree);
  await act(async () => {
    await form.props.onSubmit({ preventDefault() {} });
  });
};

/* ── session helpers ──────────────────────────────────────────────────── */
const readSession = () => {
  const raw = storage.get("pratikshya_admin_auth");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

const readEmployeeSession = () => {
  const raw = storage.get("pratikshya_employee_auth");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

/* ── main ──────────────────────────────────────────────────────────────── */
const main = async () => {
  installBrowserGlobals();
  installFetch();

  console.log("\nPRATIKSHYA FASHION — live staff workspace verification");
  console.log(`backend: ${API_BASE}`);

  try {
    const health = await realFetch(`${API_BASE}/health`);
    if (!health.ok) throw new Error(`backend health ${health.status}`);
  } catch (err) {
    console.log(`\n  [SKIP] backend not reachable at ${API_BASE} (${err.message}).`);
    console.log("  No live check could be executed.");
    process.exit(2);
  }

  vite = await createServer({
    root: FRONTEND_ROOT,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  modules = {
    EmployeeAuthProvider: (await load("context/EmployeeAuthContext.jsx")).EmployeeAuthProvider,
    AdminAuthProvider: (await load("context/AdminAuthContext.jsx")).AdminAuthProvider,
    StaffLogin: (await load("pages/auth/StaffLogin.jsx")).default,
    SuperAdminProtectedRoute: (await load("components/admin/SuperAdminProtectedRoute.jsx")).default,
    AdminProtectedRoute: (await load("components/admin/AdminProtectedRoute.jsx")).default,
    EmployeeProtectedRoute: (await load("components/employee/EmployeeProtectedRoute.jsx")).default,
    AdminLayout: (await load("layouts/AdminLayout.jsx")).default,
    AdminDashboard: (await load("pages/admin/AdminDashboard.jsx")).default,
    EmployeeDashboard: (await load("pages/employee/EmployeeDashboard.jsx")).default,
    EmployeeChangePassword: (await load("pages/employee/EmployeeChangePassword.jsx")).default,
  };

  /* ── 1. Super Admin sign-in through the real /login page ───────────── */
  console.log("\n1. Super Admin sign-in (real /login page, real backend)");
  let tree = await mount("/login");
  const before = network.length;
  await signInThroughLoginPage(tree, SUPER_ADMIN.identifier, SUPER_ADMIN.password);
  const landed = await settle(tree, (text) => text.includes("Total Revenue"));
  await flush(200);

  const signInRequests = network.slice(before).filter((r) => r.path.includes("/auth/"));
  const session = readSession();
  console.log(`     requests: ${signInRequests.map((r) => `${r.method} ${r.path} → ${r.status}`).join(", ")}`);
  console.log(`     session: level=${session?.accountLevel ?? "none"} role=${session?.role ?? "none"} workspace=${session?.workspace ?? "none"}`);

  const signedIn = treeText(tree.toJSON());
  record("server accepts the Super Admin credentials",
    signInRequests.some((r) => r.path.endsWith("/auth/staff/sign-in") && r.status === 200) ? "pass" : "fail",
    `POST /auth/staff/sign-in → ${signInRequests.find((r) => r.path.endsWith("/auth/staff/sign-in"))?.status ?? "no request"}`);
  record("server returns the SUPER_ADMIN account level", session?.accountLevel === "SUPER_ADMIN" ? "pass" : "fail", String(session?.accountLevel));
  record("session is validated against the server (/auth/me)", signInRequests.some((r) => r.path.endsWith("/auth/me")) ? "pass" : "fail");
  record("navigation lands on /super-admin and the dashboard renders", landed ? "pass" : "fail");
  record("dashboard renders its KPI cards", signedIn.includes("Total Revenue") && signedIn.includes("Total Orders") ? "pass" : "fail");
  record("dashboard renders its charts and quick actions", signedIn.includes("Revenue trend") && signedIn.includes("Quick Actions") ? "pass" : "fail");
  record("the staff shell is intact (header + sidebar)", signedIn.includes("PRATIKSHYA FASHION") && signedIn.includes("Catalogue & Content") ? "pass" : "fail");

  /* ── 2. The dashboard must SURVIVE the point where it used to die ──── */
  console.log("\n2. The dashboard stays rendered (past the previous failure point)");
  const beforeCrash = consoleErrors.length;
  await flush(3000);
  const afterWait = treeText(tree.toJSON());
  record("dashboard is still visible 3s after the first render", afterWait.includes("Total Revenue") ? "pass" : "fail");
  record("no React error was raised after the first render", consoleErrors.length === beforeCrash ? "pass" : "fail",
    consoleErrors.slice(beforeCrash).join(" | ") || "no console errors");
  const hookErrors = consoleErrors.slice(beforeCrash).filter((m) => /hook/i.test(m));
  record("no Rules-of-Hooks violation", hookErrors.length === 0 ? "pass" : "fail", hookErrors.join(" | "));

  /* ── 3. Direct reload of /super-admin ──────────────────────────────── */
  console.log("\n3. Direct reload of /super-admin (session restored from storage)");
  await unmount(tree);
  const beforeReload = network.length;
  tree = await mount("/super-admin");
  const reloadRendered = await settle(tree, (text) => text.includes("Total Revenue"));
  await flush(1000);
  const afterReload = treeText(tree.toJSON());
  const reloadRequests = network.slice(beforeReload).filter((r) => r.path.includes("/auth/") || r.path.includes("dashboard/summary"));
  console.log(`     requests: ${reloadRequests.map((r) => `${r.method} ${r.path} → ${r.status}`).join(", ")}`);
  record("reload validates the stored session with the server", reloadRequests.some((r) => r.path.endsWith("/auth/me")) ? "pass" : "fail");
  record("reload renders the dashboard", reloadRendered && afterReload.includes("Total Revenue") ? "pass" : "fail");
  record("reload does not bounce back to /login", !afterReload.includes("Staff sign in") ? "pass" : "fail");

  /* ── 4. Another authorized section and back ────────────────────────── */
  console.log("\n4. Another authorized section and back");
  const beforeNav = network.length;
  await unmount(tree);
  tree = await mount("/super-admin/orders");
  const sectionRendered = await settle(tree, (text) => text.includes("Total Revenue"));
  record("another authorized section renders", sectionRendered ? "pass" : "fail");
  await unmount(tree);
  tree = await mount("/super-admin");
  const backRendered = await settle(tree, (text) => text.includes("Total Revenue"));
  await flush(1500);
  record("returning to the dashboard renders it again", backRendered ? "pass" : "fail");
  const meCalls = network.slice(beforeNav).filter((r) => r.path.endsWith("/auth/me")).length;
  record("no redirect loop while navigating", meCalls <= 4 ? "pass" : "fail", `${meCalls} /auth/me calls`);

  /* ── 5. Invalid credentials must stay rejected ─────────────────────── */
  console.log("\n5. Invalid credentials");
  await unmount(tree);
  storage.clear();
  tree = await mount("/login");
  await signInThroughLoginPage(tree, SUPER_ADMIN.identifier, "definitely-not-the-password");
  await settle(tree, (text) => /don't match|incorrect|invalid|wrong/i.test(text));
  const rejectedText = treeText(tree.toJSON());
  record("invalid password is rejected by the server", /don't match|incorrect|invalid|wrong/i.test(rejectedText) ? "pass" : "fail",
    rejectedText.match(/Those credentials[^.]*\./)?.[0] ?? "");
  record("invalid sign-in does not create a session", !storage.get("pf_admin_access_token") ? "pass" : "fail");

  /* ── 6. An invalid stored session must fall back to the login page ─── */
  console.log("\n6. Invalid / expired stored session");
  storage.clear();
  storage.set("pf_admin_access_token", "not-a-real-token");
  storage.set("pf_admin_refresh_token", "not-a-real-token");
  await unmount(tree);
  tree = await mount("/super-admin");
  await settle(tree, (text) => /Staff sign in|Secure team access/i.test(text));
  const expiredText = treeText(tree.toJSON());
  record("an invalid session lands on the login page (not a blank screen)", /Staff sign in|Secure team access/i.test(expiredText) ? "pass" : "fail");
  record("the invalid session is cleared from storage", !storage.get("pf_admin_access_token") ? "pass" : "fail");

  /* ── 7. The other staff levels ─────────────────────────────────────── */
  console.log("\n7. Other staff levels");
  const otherRoles = [
    { label: "Admin", creds: ADMIN, home: "/admin", marker: "Total Revenue", adminWorkspace: true, level: "ADMIN" },
    { label: "Employee", creds: EMPLOYEE, home: "/employee", marker: "today's floor", adminWorkspace: false, level: "EMPLOYEE" },
  ];
  for (const role of otherRoles) {
    if (!role.creds.identifier || !role.creds.password) {
      record(`${role.label} workspace`, "skip", "no credentials supplied (PF_* environment)");
      continue;
    }
    await unmount(tree);
    storage.clear();
    tree = await mount("/login");
    await signInThroughLoginPage(tree, role.creds.identifier, role.creds.password);
    await settle(tree, (text) => text.includes(role.marker) || text.includes("Choose a new"), { timeout: 10000 });

    // A freshly issued staff account must replace its temporary password
    // before the workspace opens — drive the real change-password screen.
    if (treeText(tree.toJSON()).includes("Choose a new")) {
      const newPassword = `${role.creds.password}-Changed1`;
      const current = findInput(tree, "current-password");
      const next = findInput(tree, "new-password");
      const confirm = findInput(tree, "confirm-password");
      await act(async () => {
        current.props.onChange({ target: { value: role.creds.password } });
        next.props.onChange({ target: { value: newPassword } });
        confirm.props.onChange({ target: { value: newPassword } });
      });
      const form = findByType(tree, "form")[0];
      await act(async () => {
        await form.props.onSubmit({ preventDefault() {} });
      });
      await settle(tree, (text) => text.includes(role.marker), { timeout: 10000 });
      record(`${role.label} completes the forced password change`, treeText(tree.toJSON()).includes(role.marker) ? "pass" : "fail");
      role.creds.password = newPassword;
    }

    const text = treeText(tree.toJSON());
    const reached = text.includes(role.marker);
    const wrongWorkspace = role.adminWorkspace
      ? text.includes("Secure team access")
      : text.includes("Catalogue & Content");
    const level = role.adminWorkspace ? readSession()?.accountLevel : readEmployeeSession()?.accountLevel;
    record(`${role.label} reaches its own workspace`, reached && !wrongWorkspace ? "pass" : "fail",
      wrongWorkspace ? "landed in the wrong workspace" : reached ? "" : text.slice(0, 140));
    record(`${role.label} session carries the server account level`, level === role.level ? "pass" : "fail", String(level));
  }

  await unmount(tree);
  await vite.close();

  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");
  console.log(`\nSummary: ${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
  if (failed.length) {
    console.log("Failed checks:");
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`));
  }
  process.exit(failed.length ? 1 : 0);
};

main().catch(async (err) => {
  console.error("\nQA harness error:", err);
  try { await vite?.close(); } catch { /* ignore */ }
  process.exit(1);
});
