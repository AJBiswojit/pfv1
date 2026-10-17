/**
 * PRATIKSHYA FASHION — PHASE 10 · the design's password-recovery request page,
 * over this application's recovery endpoint.
 *
 * The production screen (`pages/auth/ForgotPassword.jsx`) asks
 * `POST /auth/customer/forgot-password` for reset instructions through
 * `AuthContext.forgotPassword`, validates the identifier with the application's
 * own `isValidIdentifier`, and shows its confirmation ONLY when the backend
 * accepted the request. This suite pins that shape on the ported page — the
 * import, the messages, the single `setSubmitted` inside the accepted branch,
 * and the confirmation's two actions.
 *
 * The reset screen is a separate Aarna route, while this page remains honest
 * about the existing forgot-password endpoint's response. It never claims that
 * an email was sent when the backend only confirms receipt of the request.
 *
 * Nothing here is an end-to-end verification: there is no backend in this
 * sandbox, so the request itself is not exercised — the pins are that the page
 * calls the application's path and invents nothing.
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
const PORTED = "src/components/customer/pages/ForgotPassword.jsx";
const PRODUCTION = "src/components/customer/pages/ForgotPassword.jsx";

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

async function mount(define) {
  const vite = await createServer({
    root: ROOT,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    define,
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
  for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
    tree = React.createElement(Provider, null, tree);
  }

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
let off = null;

before(async () => {
  on = await mount({});
  off = await mount({});
});

after(async () => {
  await Promise.all([on?.vite.close(), off?.vite.close()]);
  delete globalThis.window;
});

const source = () => read(PORTED);

const RUNTIME_PACKAGES = new Set(["react", "react-dom", "react-router-dom", "lucide-react"]);
const importSpecifiers = (text) =>
  [...text.matchAll(/^\s*import\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/gm)].map((match) => match[1]);

/* ── 1 · the switch ─────────────────────────────────────────────────────── */

test("/forgot-password always renders Aarna's auth screen regardless of the former override", () => {
  const markup = off.render("/forgot-password");
  assert.ok(markup.length > 0, "/forgot-password rendered nothing at all");
  assert.match(markup, /class="aan-root"/);
  assert.match(markup, /class="info container pf-auth"/);
});

test("with the switch on, /forgot-password is the port — inside the design's full shell", () => {
  const markup = on.render("/forgot-password");
  assert.match(markup, /class="aan-root"/);
  assert.match(markup, /class="info container pf-auth"/);
  assert.match(markup, /class="footer"/, "the design's footer is missing from the recovery page");
  assert.match(markup, /class="skip-link"/, "the design's skip link is missing from the recovery page");
  assert.equal(/pf-journey/.test(markup), false, "the recovery page rendered the quiet journey chrome instead");
});

test("the reset screen is adopted by Aarna and remains in its customer auth surface", () => {
  const { boundary } = on;
  assert.equal(boundary.isCustomerAuthPath("/forgot-password"), true);
  assert.equal(boundary.CUSTOMER_AUTH_PATHS.has("/reset-password"), true);
  assert.equal(boundary.isCustomerAuthPath("/reset-password"), true);
  const markup = on.render("/reset-password?userId=user-1&token=token-1");
  assert.match(markup, /class="aan-root"/);
  assert.match(markup, /Create new/);
  assert.match(markup, /customer-reset-password/);
});

/* ── 2 · the flow is the application's ──────────────────────────────────── */

test("the identifier is production's field, validated by the application's own rule", () => {
  const text = source();
  const production = read(PRODUCTION);
  assert.match(text, /import \{ isValidIdentifier \} from '\.\.\/\.\.\/\.\.\/utils\/validation\.js';/);
  assert.match(text, /id="forgot-identifier"/);
  assert.match(text, /autoComplete="username"/);
  assert.match(text, /placeholder="e\.g\. ananya\.sharma@example\.com"/);
  assert.ok(production.includes('id="forgot-identifier"'), "production no longer carries the field id");
  assert.equal(/const isValidIdentifier =/.test(text), false, "the page re-implemented the identifier rule");
});

test("every message is the production string, and validation stops before the API call", () => {
  const text = source();
  const production = read(PRODUCTION);
  const messages = [
    "Please enter your registered email address or phone number.",
    "Please enter a valid email format or 10-digit mobile number.",
    "Unable to send reset instructions.",
    "Password reset emails are not yet connected to this storefront",
  ];
  const flat = (value) => value.replace(/\s+/g, " ");
  for (const message of messages) {
    assert.ok(flat(text).includes(message), `the ported page lost the production message: ${message}`);
    assert.ok(flat(production).includes(message), `production no longer carries: ${message}`);
  }
  assert.ok(text.indexOf(messages[0]) < text.indexOf("setIsSubmitting(true)"));
  assert.ok(text.indexOf(messages[1]) < text.indexOf("setIsSubmitting(true)"));
});

test("the request goes through AuthContext, and the confirmation only through its acceptance", () => {
  const text = source();
  assert.match(text, /const \{ forgotPassword \} = useAuth\(\);/);
  assert.match(text, /const result = await forgotPassword\(identifier\);/);
  assert.equal(/\bapiClient\b|\bfetch\(|XMLHttpRequest/.test(text), false, "the page reached for the network itself");
  /* One accepted branch, one submitted state — nothing else may set it. */
  assert.match(text, /if \(result\.ok\) \{\s*setSubmitted\(true\);/);
  assert.equal((text.match(/setSubmitted\(/g) ?? []).length, 1, "the confirmation state is set outside the accepted branch");
  assert.match(text, /setError\(result\.error \|\| 'Unable to send reset instructions\.'\);/);
});

test("the page never claims an email was sent, nor a changed password", () => {
  const text = source();
  /* Phase 12: no reset email is dispatched by the backend yet, so the
     confirmation says so, names the identifier that was submitted, and claims
     neither an email nor a reset. */
  assert.match(text, /Password reset\s+emails are not yet connected to this storefront, so no reset email has been sent\./);
  assert.match(text, /<strong>\{identifier\}<\/strong>/);
  const FORBIDDEN = /password (has been|was) (reset|updated|changed)|reset successfully|password updated|instructions (have been|were) (sent|dispatched)|prepared password reset instructions|check your\s+<em>inbox|Instructions Dispatched/i;
  assert.equal(FORBIDDEN.test(text), false, "the ported page claimed an email or a reset it cannot perform");
});

test("the confirmation offers only the way back to sign-in, not an unlinked reset screen", () => {
  const text = source();
  assert.equal(/navigate\('\/reset-password'\)/.test(text), false, "the confirmation still sends the customer to a reset screen with no link");
  assert.equal(/Proceed to Reset Password/.test(text), false, "the misleading CTA is back");
  assert.match(text, /to="\/signin"/);
  assert.match(text, />\s*Return to Sign In\s*</);
  assert.match(text, /Back to Sign In/);
  /* The header comment names the reason this phase left the reset flow alone,
     so the next reader does not have to rediscover it. */
  assert.match(text, /PHASE 12/);
  assert.match(text, /no reset email is dispatched yet/);
});

test("the tab title is set and restored, and the page adds no dependency", () => {
  const text = source();
  assert.match(text, /document\.title = 'Forgot Password — PRATIKSHYA FASHION';/);
  assert.match(text, /return \(\) => \{ document\.title = previous; \};/);
  for (const specifier of importSpecifiers(text)) {
    const external = !specifier.startsWith(".");
    assert.equal(external && !RUNTIME_PACKAGES.has(specifier), false, `unexpected dependency: ${specifier}`);
  }
  assert.equal(/window\.localStorage|\.localStorage\.(get|set|remove)Item/.test(text), false, "the page kept state of its own");
});

/* ── 3 · rendered against the real providers ────────────────────────────── */

test("the rendered page is the design's frame around the application's form", () => {
  const markup = on.render("/forgot-password");
  assert.match(markup, /class="display info__title"/);
  assert.match(markup, /Account Recovery/);
  assert.match(markup, /id="forgot-identifier"/);
  assert.match(markup, /Submit Request/);
  assert.match(markup, /class="crumbs"/);
  /* Before anything is submitted there is no confirmation and no error. */
  assert.equal(/pf-auth__sent/.test(markup), false, "the confirmation rendered before any request");
  assert.equal(/pf-auth__alert/.test(markup), false, "a pristine page showed an error");
  assert.equal(/Instructions Dispatched/.test(markup), false, "the confirmation copy rendered before any request");
});
