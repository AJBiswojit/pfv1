/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · registration.
 *
 * `/signup` opens the SAME authentication experience in its registration mode:
 * the campaign photograph, the editorial column and the glass panel, with the
 * panel's contents swapped in place. This suite pins the registration contract
 * the production screen had, because none of it changed:
 *
 *   · the seven fields, their ids, names, autofill hints and placeholders;
 *   · the application's validators, imported — never re-implemented — with every
 *     message byte for byte;
 *   · `AuthContext.signUp` → `POST /auth/customer/sign-up`, the guest-order claim
 *     through `OrderContext.claimGuestOrders`, the success note and the 500 ms
 *     handover to the sanitised `returnTo`;
 *   · the shared Google button and the application's own policy routes;
 *   · and, new for this design, that "Already have an account? Sign in" is an
 *     in-panel control: no second page, no URL change, no reload.
 *
 * Rendered against the real provider stack through Vite's SSR pipeline. Clicks
 * and a real account exchange are not reachable here (no DOM, no backend) and
 * were verified in a browser against a stubbed API instead.
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
const PANEL = "src/components/customer/auth/AuthPanelSignUp.jsx";
const PAGE = "src/components/customer/pages/SignUp.jsx";
const EXPERIENCE = "src/components/customer/auth/AuthExperience.jsx";

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
before(async () => { on = await mount(); });
after(async () => { await on?.vite.close(); delete globalThis.window; });

const source = () => read(PANEL);

/* ── 1 · the route and the mode ─────────────────────────────────────────── */

test("/signup renders the glass experience in its registration mode", () => {
  const markup = on.render("/signup?returnTo=%2Faccount");
  assert.match(markup, /class="pf-auth-experience"/);
  assert.match(markup, /class="pf-auth-editorial"/);
  assert.match(markup, /class="pf-auth-panel"/);
  assert.match(markup, /JOIN THE ATELIER/);
  assert.match(markup, /Begin your <em>journey\.<\/em>/);
  assert.match(read(PAGE), /initialMode="register"/);
  assert.match(read(PAGE), /document\.title = 'Create Account — PRATIKSHYA FASHION';/);
});

test("the sign-up screen is an auth path, and no other surface claims it", () => {
  const { boundary } = on;
  assert.equal(boundary.isCustomerAuthPath("/signup"), true);
  assert.ok(boundary.CUSTOMER_AUTH_PATHS.has("/signup"));
  assert.equal(boundary.isCustomerJourneyPath("/signup"), false);
  assert.equal(boundary.isCustomerListingPath("/signup"), false);
  assert.equal(boundary.isCustomerCatchAllPath("/signup"), false);
});

/* ── 2 · the fields are the production fields ───────────────────────────── */

test("every field keeps its id, name, autofill hint and placeholder", () => {
  const text = source();
  const fields = [
    ["signup-firstName", "firstName", "given-name"],
    ["signup-lastName", "lastName", "family-name"],
    ["signup-email", "email", "email"],
    ["signup-phone", "phone", "tel"],
    ["signup-password", "password", "new-password"],
    ["signup-confirmPassword", "confirmPassword", "new-password"],
  ];
  for (const [id, name, autoComplete] of fields) {
    assert.ok(text.includes(`id="${id}"`), `the form lost ${id}`);
    assert.ok(text.includes(`name="${name}"`), `the form lost the name ${name}`);
    assert.ok(text.includes(`autoComplete="${autoComplete}"`), `the form lost the autofill hint for ${name}`);
  }
  assert.match(text, /id="signup-dateOfBirth"/);
  assert.match(text, /type="date"/);
  assert.match(text, /placeholder="e\.g\. \+91 98765 43210"/);
  assert.ok(text.includes('placeholder="Minimum 6 characters"'), "the password placeholder is missing");
});

test("the validators are the application's, imported — never re-implemented", () => {
  const text = source();
  assert.match(text, /import \{\s*isValidEmail,\s*isValidPhone,\s*validatePassword,\s*validatePasswordMatch,\s*\} from '\.\.\/\.\.\/\.\.\/utils\/validation\.js';/);
  assert.equal(/export (const|function) (isValid|validate)/.test(text), false, "the panel defined a validator of its own");
  const REIMPLEMENTED = /const (isValidEmail|isValidPhone|isValidIdentifier|validatePassword|validatePasswordMatch|sanitizeReturnUrl) =/;
  assert.equal(REIMPLEMENTED.test(text), false, "the panel re-implemented a validator");
});

test("every message is the production string", () => {
  const text = source();
  const messages = [
    "First name is required.",
    "Email address is required.",
    "Please enter a valid email format.",
    "Please enter a valid 10-digit mobile number.",
    "Unable to create account. Please try again.",
    "Account created successfully. Welcome to PRATIKSHYA FASHION.",
  ];
  for (const message of messages) {
    assert.ok(text.includes(message), `the panel lost the production message: ${message}`);
  }
  assert.match(text, /nextErrors\.password = passwordCheck\.message;/);
  assert.match(text, /nextErrors\.confirmPassword = matchCheck\.message;/);
});

test("the submit path is production's: sign-up, claim, succeed, then navigate", () => {
  const text = source();
  assert.match(text, /const \{ signUp, isAuthenticated \} = useAuth\(\);/);
  assert.match(text, /const \{ claimGuestOrders \} = useOrder\(\);/);
  const submit = text.match(/const result = await signUp\(\{([\s\S]*?)\}\);/);
  assert.ok(submit, "the panel does not call signUp");
  for (const field of ["firstName", "lastName", "email", "phone", "password", "dateOfBirth"]) {
    assert.match(submit[1], new RegExp(`${field}: formData\\.${field}`), `signUp is not handed ${field}`);
  }
  assert.equal((text.match(/claimGuestOrders\(/g) ?? []).length, 2, "claimGuestOrders should appear exactly twice: password path and Google path");
  assert.equal((text.match(/setSuccess\(true\)/g) ?? []).length, 2, "a success state may only be set on the two accepted paths");
  assert.match(text, /if \(result\.ok\) \{\s*claimGuestOrders\(result\.user\?\.id\);\s*setSuccess\(true\);/);
  assert.match(text, /setGeneralError\(result\.error \|\| 'Unable to create account\. Please try again\.'\);/);
  assert.match(text, /navigate\(returnTo, \{ replace: true \}\);\s*\}, 500\);/);
});

test("the returnTo is the sanitised one handed down by the experience", () => {
  assert.match(read(EXPERIENCE), /const returnTo = sanitizeReturnUrl\(rawReturnTo\);/);
  assert.match(source(), /\{ onSwitchMode, returnTo, titleRef \}/);
  assert.match(read(PAGE), /AuthExperience initialMode="register"/);
  assert.match(source(), /navigate\(returnTo, \{ replace: true \}\)/);
  assert.match(source(), /if \(isAuthenticated && !isSubmitting && !success\) \{\s*navigate\(returnTo, \{ replace: true \}\);/);
});

test("editing a field clears its error, exactly as production did", () => {
  const text = source();
  assert.match(text, /if \(errors\[name\]\) \{\s*setErrors\(\(previous\) => \(\{ \.\.\.previous, \[name\]: '' \}\)\);/);
  assert.match(text, /if \(generalError\) \{\s*setGeneralError\(''\);/);
});

test("the Google button is the shared one, and it claims the guest orders too", () => {
  const text = source();
  assert.match(text, /import GoogleSignInButton from '\.\.\/\.\.\/auth\/GoogleSignInButton\.jsx';/);
  assert.match(text, /label="Sign up with Google"/);
  assert.match(text, /onSuccess=\{\(user\) => \{\s*claimGuestOrders\(user\?\.id\);/);
  assert.match(text, /onError=\{\(message\) => setGeneralError\(message\)\}/);
  assert.equal(/accounts\.google\.com|google\.accounts/.test(text), false, "the panel loaded the GIS client itself");
});

test("the terms notice links the application's own policy routes", () => {
  const text = source();
  assert.match(text, /to="\/terms"/);
  assert.match(text, /to="\/privacy"/);
  assert.match(text, /By creating an account, you agree to PRATIKSHYA FASHION/);
});

/* ── 3 · one page ───────────────────────────────────────────────────────── */

test("the switch back to sign-in is an in-panel control, not a navigation", () => {
  const text = source();
  assert.match(text, /Already have an account\?/);
  assert.match(text, /onSwitchMode\('login'\)/);
  assert.equal(/to=\{`\/signin/.test(text), false, "the panel still links to a second sign-in page");
  /* The router IS used — for the real post-registration handover to `returnTo`.
     It is never used to move between authentication modes. */
  assert.match(text, /navigate\(returnTo, \{ replace: true \}\)/);
  assert.equal(/navigate\('\/(signin|login|signup|forgot-password|reset-password)'/.test(text), false,
    "the panel navigates between authentication modes");
});

/* ── 4 · rendered ───────────────────────────────────────────────────────── */

test("the rendered registration page carries every production field and no invented state", () => {
  const markup = on.render("/signup");
  for (const id of ["signup-firstName", "signup-lastName", "signup-email", "signup-phone", "signup-password", "signup-confirmPassword", "signup-dateOfBirth"]) {
    assert.match(markup, new RegExp(`id="${id}"`), `${id} is missing from the rendered form`);
  }
  assert.match(markup, /Create Account/);
  assert.match(markup, /Or continue with/);
  assert.match(markup, /Already have an account\?/);
  assert.match(markup, /class="pf-auth-form"/);
  assert.equal(/pf-auth-status/.test(markup), false, "a pristine page showed a success state");
  assert.equal(/pf-auth-alert/.test(markup), false, "a pristine page showed an error");
  /* The campaign photograph and the editorial stay on the page in this mode. */
  assert.match(markup, /pratikshya-auth-campaign\.webp/);
  assert.match(markup, /TIMELESS IN EVERY DETAIL/);
});
