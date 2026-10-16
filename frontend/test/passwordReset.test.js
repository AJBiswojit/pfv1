/**
 * PRATIKSHYA FASHION — Phase 12 · customer password reset (Priority 1).
 *
 * The contract under test is the backend's, not an invented one:
 *   POST /auth/customer/reset-password  { userId, token, newPassword, confirmPassword }
 *   newPassword: min 8, max 128 (`ResetPasswordRequest`, backend/app/schemas/auth/login.py)
 *   401 — token unknown, used or expired (`UnauthorizedException`)
 *
 * What this suite proves, with HTTP stubbed (no backend runs in the sandbox):
 *   1. the reset rule matches the backend (8–128, confirmation must match);
 *   2. the API call carries the userId and token from the link, unauthenticated;
 *   3. the reset page reads `userId` and `token` from the URL and refuses to submit
 *      when either is missing;
 *   4. success is shown ONLY when the backend accepted the reset;
 *   5. a rejected/expired link, a validation failure, and a network or server
 *      failure each show their own truthful state, and the form stays usable;
 *   6. the forgot-password confirmation never claims an email was sent.
 */
import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { create } from "react-test-renderer";
import { createServer } from "vite";

const root = new URL("../", import.meta.url).pathname;
const original = {
  fetch: globalThis.fetch,
  localStorage: globalThis.localStorage,
  IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  document: globalThis.document,
};

let vite;
let authApi;
let validation;
let AuthContext;
let ResetPassword;
let ForgotPassword;
let MemoryRouter;
let trees = [];
let requests = [];
let fetchPlan;

const flush = () => act(async () => { await new Promise(setImmediate); });

/** Concatenated visible text of a react-test-renderer JSON tree. */
const textOf = (node) => {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf(node.children);
};

const inputById = (tree, id) => tree.root.findAll((n) => n.type === "input" && n.props.id === id)[0] ?? null;

const setField = (tree, id, value) =>
  act(async () => {
    const input = inputById(tree, id);
    assert.ok(input, `input #${id} is rendered`);
    input.props.onChange({ target: { value } });
  });

const submitForm = (tree) =>
  act(async () => {
    tree.root.findByType("form").props.onSubmit({ preventDefault() {} });
    await new Promise(setImmediate);
  });

const render = async (Page, { path, resetPassword, forgotPassword }) => {
  let tree;
  await act(async () => {
    tree = create(
      React.createElement(
        MemoryRouter,
        { initialEntries: [path] },
        React.createElement(
          AuthContext.Provider,
          { value: { resetPassword, forgotPassword, isLoading: false, user: null, isAuthenticated: false } },
          React.createElement(Page),
        ),
      ),
    );
  });
  trees.push(tree);
  await flush();
  return tree;
};

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  /* The pages set document.title in an effect; react-test-renderer has no DOM. */
  globalThis.document = { title: "" };
  vite = await createServer({
    root,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  authApi = await vite.ssrLoadModule("/src/services/api/authApi.js");
  validation = await vite.ssrLoadModule("/src/utils/validation.js");
  ({ AuthContext } = await vite.ssrLoadModule("/src/context/AuthContext.jsx"));
  ResetPassword = (await vite.ssrLoadModule("/src/pages/auth/ResetPassword.jsx")).default;
  ForgotPassword = (await vite.ssrLoadModule("/src/pages/auth/ForgotPassword.jsx")).default;
  ({ MemoryRouter } = await import("react-router-dom"));
});

after(async () => {
  await vite?.close();
  globalThis.fetch = original.fetch;
  globalThis.localStorage = original.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = original.IS_REACT_ACT_ENVIRONMENT;
  globalThis.document = original.document;
});

beforeEach(() => {
  trees = [];
  requests = [];
  fetchPlan = () => json(200, { message: "ok" });
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), "https://test.invalid");
    requests.push({
      path: url.pathname,
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : null,
      headers: options.headers || {},
    });
    return fetchPlan(url, options);
  };
});

afterEach(() => {
  for (const tree of trees) act(() => tree.unmount());
});

/* ── 1 · the rule ─────────────────────────────────────────────────────────── */

test("the reset rule is the backend's: 8 to 128 characters, confirmation must match", () => {
  const { validateResetPassword, RESET_PASSWORD_MIN, RESET_PASSWORD_MAX } = validation;
  assert.equal(RESET_PASSWORD_MIN, 8);
  assert.equal(RESET_PASSWORD_MAX, 128);
  assert.equal(validateResetPassword("", "").ok, false, "empty password accepted");
  assert.equal(validateResetPassword("1234567", "1234567").ok, false, "7 characters accepted");
  assert.match(validateResetPassword("1234567", "1234567").message, /at least 8/);
  assert.equal(validateResetPassword("12345678", "12345678").ok, true, "8 characters refused");
  assert.equal(validateResetPassword("a".repeat(128), "a".repeat(128)).ok, true);
  assert.equal(validateResetPassword("a".repeat(129), "a".repeat(129)).ok, false, "129 characters accepted");
  assert.equal(validateResetPassword("12345678", "12345679").ok, false, "mismatch accepted");
});

test("sign-up keeps its own 6-character rule; the reset rule does not leak into it", () => {
  assert.equal(validation.validatePassword("123456").ok, true);
  assert.equal(validation.validatePassword("12345").ok, false);
});

/* ── 2 · the API call ─────────────────────────────────────────────────────── */

test("valid submission posts userId, token and passwords to the existing endpoint, unauthenticated", async () => {
  const result = await authApi.apiResetPasswordCustomer({
    userId: "user-1",
    token: "tok-abc",
    newPassword: "Secret123",
    confirmPassword: "Secret123",
  });
  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].path, "/api/v1/auth/customer/reset-password");
  assert.deepEqual(requests[0].body, {
    userId: "user-1",
    token: "tok-abc",
    newPassword: "Secret123",
    confirmPassword: "Secret123",
  });
  assert.equal(requests[0].headers.Authorization, undefined, "reset must not carry a session token");
});

test("a rejected token surfaces as its status and the backend's message, never as ok", async () => {
  fetchPlan = () => json(401, { detail: "Password reset token is invalid or has expired." });
  const result = await authApi.apiResetPasswordCustomer({
    userId: "user-1", token: "stale", newPassword: "Secret123", confirmPassword: "Secret123",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.error, /invalid or has expired/);
});

test("backend validation (422) is surfaced as a failure with the field message", async () => {
  fetchPlan = () => json(422, { detail: [{ loc: ["body", "newPassword"], msg: "String should have at least 8 characters" }] });
  const result = await authApi.apiResetPasswordCustomer({
    userId: "user-1", token: "t", newPassword: "Secret123", confirmPassword: "Secret123",
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.match(result.error, /newPassword/);
});

test("a network failure is a failure, not a success", async () => {
  fetchPlan = () => { throw new TypeError("Failed to fetch"); };
  const result = await authApi.apiResetPasswordCustomer({
    userId: "user-1", token: "t", newPassword: "Secret123", confirmPassword: "Secret123",
  });
  assert.equal(result.ok, false);
  assert.equal(result.isNetworkError, true);
});

test("a mismatched confirmation is refused before any request is made", async () => {
  const result = await authApi.apiResetPasswordCustomer({
    userId: "user-1", token: "t", newPassword: "Secret123", confirmPassword: "Secret124",
  });
  assert.equal(result.ok, false);
  assert.equal(requests.length, 0, "a request was sent for a mismatched password");
});

/* ── 3 · the page reads the link ──────────────────────────────────────────── */

test("a link without a token shows the incomplete state and no password form", async () => {
  const resetPassword = async () => ({ ok: true });
  const tree = await render(ResetPassword, { path: "/reset-password?userId=user-1", resetPassword });
  const shown = textOf(tree.toJSON());
  assert.match(shown, /This link is incomplete/);
  assert.equal(inputById(tree, "reset-newPassword"), null, "a password form was offered without a token");
  assert.equal(tree.root.findAll((n) => n.type === "form").length, 0);
});

test("a link without a userId shows the incomplete state", async () => {
  const tree = await render(ResetPassword, { path: "/reset-password?token=abc", resetPassword: async () => ({ ok: true }) });
  assert.match(textOf(tree.toJSON()), /This link is incomplete/);
  assert.equal(inputById(tree, "reset-newPassword"), null);
});

test("a bare /reset-password visit never calls the API", async () => {
  let called = false;
  const tree = await render(ResetPassword, { path: "/reset-password", resetPassword: async () => { called = true; return { ok: true }; } });
  assert.match(textOf(tree.toJSON()), /incomplete/);
  assert.equal(called, false);
  assert.equal(requests.length, 0);
});

/* ── 4 · submission ───────────────────────────────────────────────────────── */

test("a valid submission sends userId and token from the link and shows success only once accepted", async () => {
  const calls = [];
  let release;
  const resetPassword = (pw, cpw, ids) => {
    calls.push({ pw, cpw, ids });
    return new Promise((resolve) => { release = resolve; });
  };
  const tree = await render(ResetPassword, { path: "/reset-password?userId=user-1&token=tok-abc", resetPassword });
  await setField(tree, "reset-newPassword", "Secret123");
  await setField(tree, "reset-confirmPassword", "Secret123");
  await submitForm(tree);

  assert.deepEqual(calls, [{ pw: "Secret123", cpw: "Secret123", ids: { userId: "user-1", token: "tok-abc" } }]);
  // While the request is in flight there is no success state.
  assert.equal(/updated\./.test(textOf(tree.toJSON())), false, "success shown before the backend answered");

  await act(async () => { release({ ok: true }); });
  await flush();
  assert.match(textOf(tree.toJSON()), /updated\./);
  assert.match(textOf(tree.toJSON()), /Sign In to Your Account/);
});

test("a password under 8 characters is refused on the client and the API is not called", async () => {
  let called = false;
  const tree = await render(ResetPassword, {
    path: "/reset-password?userId=user-1&token=tok",
    resetPassword: async () => { called = true; return { ok: true }; },
  });
  await setField(tree, "reset-newPassword", "1234567");
  await setField(tree, "reset-confirmPassword", "1234567");
  await submitForm(tree);
  assert.equal(called, false);
  assert.match(textOf(tree.toJSON()), /at least 8 characters/);
});

test("a mismatched confirmation is refused on the client and the API is not called", async () => {
  let called = false;
  const tree = await render(ResetPassword, {
    path: "/reset-password?userId=user-1&token=tok",
    resetPassword: async () => { called = true; return { ok: true }; },
  });
  await setField(tree, "reset-newPassword", "Secret123");
  await setField(tree, "reset-confirmPassword", "Secret124");
  await submitForm(tree);
  assert.equal(called, false);
  assert.match(textOf(tree.toJSON()), /Passwords do not match/);
});

test("a rejected or expired link is reported as such, with a route to a new link, and never as success", async () => {
  const tree = await render(ResetPassword, {
    path: "/reset-password?userId=user-1&token=stale",
    resetPassword: async () => ({ ok: false, status: 401, error: "Password reset token is invalid or has expired." }),
  });
  await setField(tree, "reset-newPassword", "Secret123");
  await setField(tree, "reset-confirmPassword", "Secret123");
  await submitForm(tree);
  await flush();
  const shown = textOf(tree.toJSON());
  assert.match(shown, /invalid or has expired/);
  assert.match(shown, /Request a new link/);
  assert.equal(/updated\./.test(shown), false, "a rejected link was reported as a changed password");
  assert.ok(inputById(tree, "reset-newPassword"), "the form was removed after a rejection");
});

test("an API or server failure shows an error, keeps the form, and allows a retry", async () => {
  let attempts = 0;
  const resetPassword = async () => {
    attempts += 1;
    return attempts === 1
      ? { ok: false, status: 500, error: "Something went wrong on our side." }
      : { ok: true };
  };
  const tree = await render(ResetPassword, { path: "/reset-password?userId=user-1&token=tok", resetPassword });
  await setField(tree, "reset-newPassword", "Secret123");
  await setField(tree, "reset-confirmPassword", "Secret123");
  await submitForm(tree);
  await flush();
  assert.match(textOf(tree.toJSON()), /Something went wrong on our side\./);
  assert.equal(/updated\./.test(textOf(tree.toJSON())), false, "a failed reset reported success");

  await submitForm(tree);
  await flush();
  assert.equal(attempts, 2, "retry did not reach the API");
  assert.match(textOf(tree.toJSON()), /updated\./);
});

test("a network failure is shown as a failure, not as a changed password", async () => {
  const tree = await render(ResetPassword, {
    path: "/reset-password?userId=user-1&token=tok",
    resetPassword: async () => ({ ok: false, status: 0, error: "Network error. Check your connection.", isNetworkError: true }),
  });
  await setField(tree, "reset-newPassword", "Secret123");
  await setField(tree, "reset-confirmPassword", "Secret123");
  await submitForm(tree);
  await flush();
  const shown = textOf(tree.toJSON());
  assert.match(shown, /Network error/);
  assert.equal(/updated\./.test(shown), false);
});

/* ── 5 · the forgot-password confirmation ─────────────────────────────────── */

test("the forgot-password confirmation says no email was sent and offers no reset screen", async () => {
  const forgotPassword = async () => ({ ok: true, message: "Password reset instructions have been sent to x." });
  const tree = await render(ForgotPassword, { path: "/forgot-password", forgotPassword });
  assert.equal(/Request Received/.test(textOf(tree.toJSON())), false, "confirmation shown before submitting");

  await act(async () => {
    inputById(tree, "forgot-identifier").props.onChange({ target: { value: "ananya@example.com" } });
  });
  await submitForm(tree);
  await flush();

  const shown = textOf(tree.toJSON());
  assert.match(shown, /Request Received/);
  assert.match(shown, /no reset email has been sent/);
  assert.equal(/Check your inbox|Instructions Dispatched|prepared password reset instructions/i.test(shown), false, "false email claim");
  assert.equal(/Proceed to Reset Password/.test(shown), false, "the confirmation sends the customer to an unlinked reset screen");
});

test("a refused forgot-password request shows the error and no confirmation", async () => {
  const forgotPassword = async () => ({ ok: false, error: "Too many requests." });
  const tree = await render(ForgotPassword, { path: "/forgot-password", forgotPassword });
  await act(async () => {
    inputById(tree, "forgot-identifier").props.onChange({ target: { value: "ananya@example.com" } });
  });
  await submitForm(tree);
  await flush();
  const shown = textOf(tree.toJSON());
  assert.match(shown, /Too many requests\./);
  assert.equal(/Request Received/.test(shown), false);
});
