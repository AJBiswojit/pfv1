/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · password recovery and reset.
 *
 * Both recovery surfaces now live inside the single authentication experience:
 *
 *   · `/forgot-password` opens its recovery mode, which asks the application's
 *     existing `AuthContext.forgotPassword` (`POST /auth/customer/forgot-password`)
 *     and shows the confirmation ONLY when the backend accepted the request;
 *   · `/reset-password?userId=…&token=…` opens its reset mode, which reads the
 *     pair from the URL and calls `AuthContext.resetPassword`
 *     (`POST /auth/customer/reset-password`);
 *   · "Back to sign in", "Request a new link" and "Return to sign in" are
 *     in-panel controls: the URL and the campaign photograph never move.
 *
 * The honesty rules are the important ones here and are pinned verbatim: no
 * email is claimed when the backend only stores a token, a refused request shows
 * the backend's own message, an incomplete reset link offers no form, and a
 * rejected token is never reported as a changed password.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { Suspense } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { MemoryRouter } from "react-router-dom";

function projectRoot() {
  let directory = new URL(".", import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL("package.json", directory))) return fileURLToPath(directory);
    directory = new URL("../", directory);
  }
  throw new Error("frontend root not found");
}

const ROOT = projectRoot();
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");
const FORGOT = "src/components/customer/auth/AuthPanelForgotPassword.jsx";
const RESET = "src/components/customer/auth/AuthPanelResetPassword.jsx";
const EXPERIENCE = "src/components/customer/auth/AuthExperience.jsx";
const FORGOT_PAGE = "src/components/customer/pages/ForgotPassword.jsx";
const RESET_PAGE = "src/components/customer/pages/ResetPassword.jsx";

const storage = new Map();
const localStorageStub = {
  getItem: (key) => (storage.has(String(key)) ? storage.get(String(key)) : null),
  setItem: (key, value) => storage.set(String(key), String(value)),
  removeItem: (key) => storage.delete(String(key)),
  clear: () => storage.clear(),
};
const NOOP = () => {};
globalThis.window = {
  localStorage: localStorageStub,
  location: { search: "", pathname: "/", href: "http://localhost/" },
  dispatchEvent: NOOP,
  addEventListener: NOOP,
  removeEventListener: NOOP,
};

async function mount() {
  const vite = await createServer({
    root: ROOT,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });
  const load = (path) => vite.ssrLoadModule(path);
  const [
    { default: CustomerLayout },
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    boundary,
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/config/customerRoutes.js"),
  ]);

  let tree = React.createElement(CustomerLayout);
  const providers = [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider];
  for (const Provider of providers) tree = React.createElement(Provider, null, tree);

  return {
    vite,
    boundary,
    render: (path) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, tree),
        ),
      ),
  };
}

let on = null;
before(async () => { on = await mount(); });
after(async () => { await on?.vite.close(); delete globalThis.window; });

const flat = (value) => value.replace(/\s+/g, " ");

/* ── 1 · the routes ─────────────────────────────────────────────────────── */

test("/forgot-password is the experience in recovery mode, inside the design's shell", () => {
  const markup = on.render("/forgot-password");
  assert.match(markup, /class="pf-root"/);
  assert.match(markup, /class="pf-auth-experience"/);
  assert.match(markup, /class="pf-auth-editorial"/);
  assert.match(markup, /Account Recovery/);
  assert.match(markup, /Recover your <em>account\.<\/em>/);
  assert.match(read(FORGOT_PAGE), /initialMode="forgotPassword"/);
  assert.match(read(FORGOT_PAGE), /document\.title = 'Forgot Password — PRATIKSHYA FASHION';/);
});

test("the reset route stays in the customer auth surface and renders in its own mode", () => {
  const { boundary } = on;
  assert.equal(boundary.isCustomerAuthPath("/forgot-password"), true);
  assert.equal(boundary.CUSTOMER_AUTH_PATHS.has("/reset-password"), true);
  assert.equal(boundary.isCustomerAuthPath("/reset-password"), true);

  const markup = on.render("/reset-password?userId=user-1&token=token-1");
  assert.match(markup, /class="pf-auth-experience"/);
  assert.match(markup, /Create new <em>password\.<\/em>/);
  assert.match(markup, /id="customer-reset-password"/);
  assert.match(read(RESET_PAGE), /initialMode="resetPassword"/);
});

/* ── 2 · the recovery flow is the application's ─────────────────────────── */

test("the identifier is production's field, validated by the application's own rule", () => {
  const text = read(FORGOT);
  assert.match(text, /import \{ isValidIdentifier \} from '\.\.\/\.\.\/\.\.\/utils\/validation\.js';/);
  assert.match(text, /id="forgot-identifier"/);
  assert.match(text, /autoComplete="username"/);
  assert.match(text, /placeholder="e\.g\. ananya\.sharma@example\.com"/);
  assert.equal(/const isValidIdentifier =/.test(text), false, "the panel re-implemented the identifier rule");
});

test("every recovery message is the production string, and validation stops before the API call", () => {
  const text = flat(read(FORGOT));
  const messages = [
    "Please enter your registered email address or phone number.",
    "Please enter a valid email format or 10-digit mobile number.",
    "Unable to send reset instructions.",
    "Password reset emails are not yet connected to this storefront, so no reset email has been sent.",
  ];
  for (const message of messages) {
    assert.ok(text.includes(message), `the panel lost the production message: ${message}`);
  }
  assert.ok(text.indexOf(messages[0]) < text.indexOf("setIsSubmitting(true)"));
  assert.ok(text.indexOf(messages[1]) < text.indexOf("setIsSubmitting(true)"));
});

test("the request goes through AuthContext, and the confirmation only through its acceptance", () => {
  const text = read(FORGOT);
  assert.match(text, /const \{ forgotPassword \} = useAuth\(\);/);
  assert.match(text, /const result = await forgotPassword\(identifier\);/);
  assert.equal(/\bapiClient\b|\bfetch\(|XMLHttpRequest/.test(text), false, "the panel reached for the network itself");
  assert.match(text, /if \(result\.ok\) \{\s*setSubmitted\(true\);/);
  assert.equal((text.match(/setSubmitted\(/g) ?? []).length, 1, "the confirmation state is set outside the accepted branch");
  assert.match(text, /setError\(result\.error \|\| 'Unable to send reset instructions\.'\);/);
});

test("the confirmation never claims an email or a reset it cannot perform", () => {
  const text = read(FORGOT);
  assert.match(text, /no reset email has been sent/);
  assert.match(text, /<strong>\{identifier\}<\/strong>/);
  const FORBIDDEN = /password (has been|was) (reset|updated|changed)|reset successfully|password updated|instructions (have been|were) (sent|dispatched)|prepared password reset instructions|check your\s+<em>inbox|Instructions Dispatched/i;
  assert.equal(FORBIDDEN.test(text), false, "the panel claimed an email or a reset it cannot perform");
});

test("Return to Sign In and Back to Sign In are in-panel controls", () => {
  const text = read(FORGOT);
  assert.match(text, />Return to Sign In</);
  assert.match(text, /Back to Sign In/);
  assert.match(text, /onSwitchMode\('login'\)/);
  assert.equal(/to="\/signin"/.test(text), false, "the confirmation still links to a second sign-in page");
  assert.equal(/navigate\('\/reset-password'\)/.test(text), false, "the confirmation still sends the customer to an unlinked reset screen");
  assert.equal(/Proceed to Reset Password/.test(text), false, "the misleading CTA is back");
  assert.match(read(FORGOT_PAGE), /initialMode="forgotPassword"/);
});

/* ── 3 · reset ──────────────────────────────────────────────────────────── */

test("the reset panel reads the backend's rule and calls the existing service", () => {
  const text = read(RESET);
  assert.match(text, /import \{ validateResetPassword, RESET_PASSWORD_MIN \} from '\.\.\/\.\.\/\.\.\/utils\/validation\.js';/);
  assert.match(text, /const \{ resetPassword \} = useAuth\(\);/);
  assert.match(text, /const result = await resetPassword\(password, confirmPassword, \{ userId, token \}\);/);
  assert.match(text, /const LINK_REJECTED_STATUSES = \[401, 404\];/);
  assert.match(text, /id="customer-reset-password"/);
  assert.match(text, /id="customer-reset-confirm"/);
  assert.match(text, /autoComplete="new-password"/);
  assert.equal(/\bapiClient\b|\bfetch\(|XMLHttpRequest/.test(text), false, "the panel reached for the network itself");
});

test("the reset panel tells the truth in every state", () => {
  const text = read(RESET);
  assert.match(text, /This link is <em>incomplete\.<\/em>/);
  assert.match(text, /This reset link is invalid or has expired\. Request a new link to continue\./);
  assert.match(text, /Password <em>updated\.<\/em>/);
  /* Success is only set after `result.ok` — never before the backend answered. */
  assert.match(text, /if \(result\?\.ok\) \{\s*setSuccess\(true\);\s*return;/);
  assert.match(text, /setError\(result\?\.error \|\| 'We could not update your password\. Please try again\.'\);/);
});

test("reset tokens are read from the URL and never stored or logged", () => {
  const text = read(EXPERIENCE);
  assert.match(text, /searchParams\.get\('userId'\)/);
  assert.match(text, /searchParams\.get\('token'\)/);
  assert.equal(/localStorage|sessionStorage/.test(text), false, "the experience persisted the reset token");
  assert.equal(/console\.(log|info|debug|warn|error)/.test(text), false, "the experience logged the reset token");
  assert.equal(/localStorage|sessionStorage/.test(read(RESET)), false, "the reset panel stored the token");
});

test("the reset actions all stay inside the panel", () => {
  const text = read(RESET);
  assert.match(text, /onSwitchMode\('forgotPassword'\)/);
  assert.match(text, /onSwitchMode\('login'\)/);
  assert.equal(/to="\/(signin|forgot-password|reset-password)"/.test(text), false, "the reset panel links to another authentication page");
  assert.equal(/useNavigate|navigate\(/.test(text), false, "the reset panel navigates between modes");
});

/* ── 4 · rendered ───────────────────────────────────────────────────────── */

test("a pristine recovery page shows no confirmation and no error", () => {
  const markup = on.render("/forgot-password");
  assert.match(markup, /id="forgot-identifier"/);
  assert.match(markup, /Send recovery instructions/);
  assert.equal(/pf-auth-sent/.test(markup), false, "the confirmation rendered before any request");
  assert.equal(/pf-auth-alert/.test(markup), false, "a pristine page showed an error");
  assert.equal(/Request Received/.test(markup), false, "the confirmation copy rendered before any request");
  assert.equal(/Instructions Dispatched/.test(markup), false);
});

test("an incomplete reset link renders 'incomplete' and no password field", () => {
  const markup = on.render("/reset-password?userId=user-1");
  assert.match(markup, /This link is <em>incomplete\.<\/em>/);
  assert.equal(/customer-reset-password/.test(markup), false, "a password form was offered without a token");
});
