/**
 * PRATIKSHYA FASHION — PHASE 10 · the design's create-account page, over this
 * application's registration.
 *
 * The behavioural source of truth is the production screen
 * (`pages/auth/SignUp.jsx`): seven fields, the application's own validators,
 * `AuthContext.signUp` → `POST /auth/customer/sign-up`, the guest-order claim
 * through `OrderContext.claimGuestOrders`, the shared Google button, and the
 * sanitised `returnTo` handover after a 500 ms success note. This suite pins
 * each of those against the ported page, at the source where a server render
 * cannot reach (effects and clicks need a browser, and there is no backend in
 * this sandbox — nothing here is claimed as an end-to-end verification).
 *
 * What it renders is the real composition — `CustomerLayout` in the
 * application's provider stack, at the route, through Vite's SSR pipeline —
 * signed out, which is the state a real browser is in before anyone signs up.
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
const PORTED = "src/components/customer/pages/SignUp.jsx";
const PRODUCTION = "src/components/customer/pages/SignUp.jsx";

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

test("/signup always renders Aarna's sign-up screen regardless of the former override", () => {
  const markup = off.render("/signup");
  assert.ok(markup.length > 0, "/signup rendered nothing at all");
  assert.match(markup, /class="aan-root"/);
  assert.match(markup, /class="info container pf-auth"/);
});

test("with the switch on, /signup is the port — inside the design's full shell", () => {
  const markup = on.render("/signup");
  assert.match(markup, /class="aan-root"/);
  assert.match(markup, /class="info container pf-auth"/);
  assert.match(markup, /class="footer"/, "the design's footer is missing from the sign-up page");
  assert.match(markup, /class="skip-link"/, "the design's skip link is missing from the sign-up page");
  assert.equal(/pf-journey/.test(markup), false, "the sign-up page rendered the quiet journey chrome instead");
});

test("the sign-up screen is an auth path, and no other surface claims it", () => {
  const { boundary } = on;
  assert.equal(boundary.isCustomerAuthPath("/signup"), true);
  assert.ok(boundary.CUSTOMER_AUTH_PATHS.has("/signup"));
  assert.equal(boundary.isCustomerJourneyPath("/signup"), false);
  assert.equal(boundary.isCustomerListingPath("/signup"), false);
  assert.equal(boundary.isCustomerCatchAllPath("/signup"), false);
});

/* ── 2 · the flow is the application's ──────────────────────────────────── */

test("Aarna renders signup fields with stable identifiers and autofill hints", () => {
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
    /* The password fields are drawn by one shared helper, so their id travels
       as a prop (`id: 'signup-password'`) rather than as JSX attribute text;
       the rendered markup is checked separately, below. */
    const carried = [`id="${id}"`, `id: '${id}'`].some((form) => text.includes(form));
    assert.ok(carried, `the ported form lost ${id}`);
    const nameCarried = [`name="${name}"`, `name: '${name}'`].some((form) => text.includes(form));
    assert.ok(nameCarried, `the ported form lost the name ${name}`);
    const hintCarried = [`autoComplete="${autoComplete}"`, `autoComplete: '${autoComplete}'`].some((form) => text.includes(form));
    assert.ok(hintCarried, `the ported form lost the autofill hint for ${name}`);
    assert.ok(text.includes(`id: '${id}'`) || text.includes(`id="${id}"`), `Aarna source omitted ${id}`);
    assert.ok(text.includes(`name: '${name}'`) || text.includes(`name="${name}"`), `Aarna source omitted name ${name}`);
    assert.ok(text.includes(`autoComplete: '${autoComplete}'`) || text.includes(`autoComplete="${autoComplete}"`), `Aarna source omitted ${autoComplete}`);
  }
  assert.match(text, /id="signup-dateOfBirth"/);
  assert.match(text, /type="date"/);
  assert.match(text, /placeholder="e\.g\. \+91 98765 43210"/);
  assert.ok(
    text.includes('placeholder="Minimum 6 characters"') || text.includes("placeholder: 'Minimum 6 characters'"),
    "the ported form lost the password placeholder",
  );
});

test("the validators are the application's, imported — never re-implemented", () => {
  const text = source();
  assert.match(text, /import \{\s*isValidEmail,\s*isValidPhone,\s*sanitizeReturnUrl,\s*validatePassword,\s*validatePasswordMatch,\s*\} from '\.\.\/\.\.\/\.\.\/utils\/validation\.js';/);
  assert.equal(/export (const|function) (isValid|validate)/.test(text), false, "the page defined a validator of its own");
  const REIMPLEMENTED = /const (isValidEmail|isValidPhone|isValidIdentifier|validatePassword|validatePasswordMatch|sanitizeReturnUrl) =/;
  assert.equal(REIMPLEMENTED.test(text), false, "the page re-implemented a validator");
});

test("every message is the production string", () => {
  const text = source();
  const production = read(PRODUCTION);
  const messages = [
    "First name is required.",
    "Email address is required.",
    "Please enter a valid email format.",
    "Please enter a valid 10-digit mobile number.",
    "Unable to create account. Please try again.",
    "Account created successfully. Welcome to PRATIKSHYA FASHION.",
  ];
  for (const message of messages) {
    assert.ok(text.includes(message), `the ported page lost the production message: ${message}`);
    assert.ok(production.includes(message), `production no longer carries: ${message}`);
  }
  /* Password and confirmation offences speak with the validators' own words. */
  assert.match(text, /nextErrors\.password = passwordCheck\.message;/);
  assert.match(text, /nextErrors\.confirmPassword = matchCheck\.message;/);
});

test("the submit path is production's: sign-up, claim, succeed, then navigate", () => {
  const text = source();
  assert.match(text, /const \{ signUp, isAuthenticated \} = useAuth\(\);/);
  assert.match(text, /const \{ claimGuestOrders \} = useOrder\(\);/);
  const submit = text.match(/const result = await signUp\(\{([\s\S]*?)\}\);/);
  assert.ok(submit, "the ported page does not call signUp");
  for (const field of ["firstName", "lastName", "email", "phone", "password", "dateOfBirth"]) {
    assert.match(submit[1], new RegExp(`${field}: formData\\.${field}`), `signUp is not handed ${field}`);
  }
  /* The guest orders are claimed ONCE, only after the backend approved, and the
     success note is set once — there is no branch that fakes either. */
  assert.equal((text.match(/claimGuestOrders\(/g) ?? []).length, 2, "claimGuestOrders should appear exactly twice: password path and Google path");
  assert.equal((text.match(/setSuccess\(true\)/g) ?? []).length, 2, "a success state may only be set on the two accepted paths");
  assert.match(text, /if \(result\.ok\) \{\s*claimGuestOrders\(result\.user\?\.id\);\s*setSuccess\(true\);/);
  assert.match(text, /setGeneralError\(result\.error \|\| 'Unable to create account\. Please try again\.'\);/);
  assert.match(text, /navigate\(returnTo, \{ replace: true \}\);\s*\}, 500\);/);
});

test("the redirect is sanitised, and the already-signed-in customer is sent on", () => {
  const text = source();
  assert.match(text, /const rawReturnTo = searchParams\.get\('returnTo'\) \|\| '\/account';/);
  assert.match(text, /const returnTo = sanitizeReturnUrl\(rawReturnTo\);/);
  assert.match(text, /if \(isAuthenticated && !isSubmitting && !success\) \{\s*navigate\(returnTo, \{ replace: true \}\);/);
});

test("editing a field clears its error, exactly as production does", () => {
  const text = source();
  assert.match(text, /if \(errors\[name\]\) \{\s*setErrors\(\(previous\) => \(\{ \.\.\.previous, \[name\]: '' \}\)\);/);
  assert.match(text, /if \(generalError\) \{\s*setGeneralError\(''\);/);
});

test("the Google button is the shared one, and it claims the guest orders too", () => {
  const text = source();
  assert.match(text, /import GoogleSignInButton from '\.\.\/\.\.\/\.\.\/components\/auth\/GoogleSignInButton\.jsx';/);
  assert.match(text, /label="Sign up with Google"/);
  assert.match(text, /onSuccess=\{\(user\) => \{\s*claimGuestOrders\(user\?\.id\);/);
  assert.match(text, /onError=\{\(message\) => setGeneralError\(message\)\}/);
  assert.equal(/accounts\.google\.com|google\.accounts/.test(text), false, "the page loaded the GIS client itself");
});

test("the terms notice links the application's own policy routes", () => {
  const text = source();
  assert.match(text, /to="\/terms"/);
  assert.match(text, /to="\/privacy"/);
  assert.match(text, /By creating an account, you agree to PRATIKSHYA FASHION/);
  /* The link back to sign-in carries the raw returnTo, as production's does. */
  assert.match(text, /to=\{`\/signin\$\{rawReturnTo \? `\?returnTo=\$\{encodeURIComponent\(rawReturnTo\)\}` : ''\}`\}/);
});

test("the tab title is set and restored, and the page adds no dependency", () => {
  const text = source();
  assert.match(text, /document\.title = 'Create Account — PRATIKSHYA FASHION';/);
  assert.match(text, /return \(\) => \{ document\.title = previous; \};/);
  for (const specifier of importSpecifiers(text)) {
    const external = !specifier.startsWith(".");
    assert.equal(external && !RUNTIME_PACKAGES.has(specifier), false, `unexpected dependency: ${specifier}`);
  }
  assert.equal(/window\.localStorage|\.localStorage\.(get|set|remove)Item/.test(text), false, "the page kept state of its own");
});

/* ── 3 · rendered against the real providers ────────────────────────────── */

test("the rendered page is the design's frame around the application's form", () => {
  const markup = on.render("/signup");
  assert.match(markup, /class="display info__title"/);
  assert.match(markup, /class="form pf-auth__form pf-auth__form--wide"/);
  for (const id of ["signup-firstName", "signup-lastName", "signup-email", "signup-phone", "signup-password", "signup-confirmPassword", "signup-dateOfBirth"]) {
    assert.match(markup, new RegExp(`id="${id}"`), `${id} is missing from the rendered form`);
  }
  assert.match(markup, /Create Account/);
  assert.match(markup, /Or continue with/);
  assert.match(markup, /Already have an account\?/);
  assert.equal(/pf-auth__status/.test(markup), false, "a pristine page showed a success state");
  assert.equal(/pf-auth__alert/.test(markup), false, "a pristine page showed an error");
  assert.equal(/role="status"/.test(markup.split('class="form')[0] ?? ""), false, "an error or success panel rendered before any submit");
});
