/**
 * PRATIKSHYA FASHION — PHASE 10 · the design's sign-in page, over this
 * application's authentication.
 *
 * Phase 10 adopts `/signin` the way Phase 9 adopted the money path: the page is
 * written in the design's own vocabulary (`.container`, `.info`, `.crumbs`,
 * `.label`, `.display`, `.info__lead`, `.form`, `.form__err`, `.form__note`,
 * the `.btn` register) and bound to `AuthContext` — the same context the
 * current Aarna customer route reads. The route no longer depends on an
 * environment flag or query-string selector.
 *
 * What these tests render is the real composition: `CustomerLayout` inside this
 * application's provider stack, at the route a browser reaches, through Vite's
 * SSR pipeline — no component is rendered in isolation and no context is
 * faked. There is no backend here (and none is claimed): the page renders
 * signed out, which is the state a real browser is in before anyone signs in.
 *
 *   1. THE SWITCH, AND WHERE IT STOPS. Off, the three auth routes are the
 *      production pages. On, `/signin` is the port — inside the design's FULL
 *      shell (production gives the auth screens the shopping chrome too).
 *   2. THE FLOW IS THE APPLICATION'S. The identifiers and autofill hints
 *      production uses, the production validation sentences, the sanitised
 *      `returnTo`, the 500 ms success transition, the already-signed-in
 *      redirect, the guest link's `/account → /shop` rule, and the SHARED
 *      Google button — all pinned at the source, because none of them can be
 *      exercised without a backend and a browser.
 *   3. WHAT THE BOUNDARY LEAVES ALONE. Staff portals keep their production
 *      pages; reset-password joins Aarna auth and remains disjoint from the
 *      journey, listing and catch-all surfaces.
 *
 * WHAT THIS CANNOT PROVE: clicks, focus order and layout (no DOM here); a real
 * credential exchange, a real Google login and the reset flow (no backend, no
 * Google client in this sandbox) — those stay labelled unverified in the phase
 * document. Effects do not run under `renderToStaticMarkup`, so behaviour that
 * lives in an effect is pinned at the source level here.
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
const PORTED = "src/components/customer/pages/SignIn.jsx";
const MOUNT = "src/components/customer/CustomerStorefront.jsx";
const DIALOGUE = "src/components/customer/customer.auth.css";

/* ── the browser a server-rendered page still has to believe in ─────────── */

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

/* ── the mount: the application's provider stack, at one path ───────────── */

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
    validation,
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/config/customerRoutes.js"),
    load("/src/utils/validation.js"),
  ]);

  let tree = React.createElement(CustomerLayout);
  for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
    tree = React.createElement(Provider, null, tree);
  }

  return {
    vite,
    boundary,
    validation,
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

const rx = (text) => new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const source = () => read(PORTED);

/* A module specifier that is not relative and not one of the four runtime
   packages this tree already uses would be a new dependency. */
const RUNTIME_PACKAGES = new Set(["react", "react-dom", "react-router-dom", "lucide-react"]);
const importSpecifiers = (text) =>
  [...text.matchAll(/^\s*import\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/gm)].map((match) => match[1]);

/* ── 1 · the switch, and where it stops ─────────────────────────────────── */

test("all customer auth paths render Aarna irrespective of former selector values", () => {
  for (const path of ["/signin", "/signup", "/forgot-password", "/reset-password"]) {
    const markup = off.render(path);
    assert.ok(markup.length > 0, `${path} rendered nothing at all`);
    assert.match(markup, /class="pf-root"/, `${path} did not render Aarna`);
    assert.match(markup, /class="info container pf-auth"|Create new/ , `${path} did not render an Aarna auth UI`);
  }
  assert.match(read("src/components/customer/CustomerStorefront.jsx"), /<Route path="reset-password" element=\{<ResetPassword \/>\} \/>/);
});

test("with the switch on, /signin is the port — inside the design's full shell", () => {
  const markup = on.render("/signin");
  assert.match(markup, /class="pf-root"/, "the canonical route did not mount the port");
  assert.match(markup, /class="info container pf-auth"/, "/signin did not render the ported page");
  /* Production gives the auth screens the SHOPPING chrome (`isOrderJourney` is
     only `/checkout` and `/order-success`), so the design's full shell travels
     with them: the footer, the skip link — and not the quiet journey frame. */
  assert.match(markup, /class="footer"/, "the design's footer is missing from the sign-in page");
  assert.match(markup, /class="skip-link"/, "the design's skip link is missing from the sign-in page");
  assert.equal(/pf-journey/.test(markup), false, "the sign-in page rendered the quiet journey chrome instead");
});

test("the auth surface is the three customer screens, and nothing else joins it", () => {
  const { boundary } = on;
  assert.deepEqual(
    [...boundary.CUSTOMER_AUTH_PATHS].sort(),
    ["/forgot-password", "/reset-password", "/signin", "/signup"],
    "the auth set does not include all supported customer auth routes",
  );
  for (const path of ["/signin", "/signup", "/forgot-password", "/reset-password", "/signin/"]) {
    assert.equal(boundary.isCustomerAuthPath(path), true, `${path} is not treated as an auth path`);
  }
  for (const path of ["/login", "/admin/login", "/employee/profile", "/account", "/signin/extra", "/cart"]) {
    assert.equal(boundary.isCustomerAuthPath(path), false, `${path} was claimed by the auth paths`);
  }
});

test("the auth screens are disjoint from the journey, listing and catch-all surfaces", () => {
  const { boundary } = on;
  for (const path of ["/signin", "/signup", "/forgot-password"]) {
    assert.equal(boundary.isCustomerJourneyPath(path), false, `${path} leaked into the journey surface`);
    assert.equal(boundary.isCustomerListingPath(path), false, `${path} leaked into the listing surface`);
    assert.equal(boundary.isCustomerCatchAllPath(path), false, `${path} leaked into the catch-all`);
  }
});

test("Aarna declares all four authentication screens and App delegates customer routing", () => {
  const mount = read(MOUNT);
  assert.match(mount, /<Route path="signin" element=\{<SignIn \/>\} \/>/);
  assert.match(mount, /<Route path="signup" element=\{<SignUp \/>\} \/>/);
  assert.match(mount, /<Route path="forgot-password" element=\{<ForgotPassword \/>\} \/>/);
  assert.match(mount, /<Route path="reset-password" element=\{<ResetPassword \/>\} \/>/);
  assert.match(mount, /import "\.\/customer\.auth\.css";/, "the auth stylesheet is not carried by the mount");
  /* Phase 10 needed no routing change: the production route table is the one it
     was, and the auth routes still belong to the customer layout group. */
  const app = read("src/App.jsx");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/);
  assert.doesNotMatch(app, /<Route path="\/(signin|signup|forgot-password|reset-password)"/);
  assert.match(mount, /<Route path="signin" element=\{<SignIn \/>\} \/>/);
  assert.match(mount, /<Route path="signup" element=\{<SignUp \/>\} \/>/);
  assert.match(mount, /<Route path="forgot-password" element=\{<ForgotPassword \/>\} \/>/);
  assert.match(mount, /<Route path="reset-password" element=\{<ResetPassword \/>\} \/>/);
});

/* ── 2 · the flow is the application's ──────────────────────────────────── */

test("the screen signs in through AuthContext, and calls no API of its own", () => {
  const text = source();
  assert.match(text, /import \{ useAuth \} from '\.\.\/\.\.\/\.\.\/context\/AuthContext\.jsx';/);
  assert.match(text, /const result = await signIn\(\{ identifier, password, remember: rememberMe \}\);/);
  assert.equal(/\bapiClient\b|\bfetch\(|XMLHttpRequest/.test(text), false, "the page reached for the network itself");
  assert.equal(/window\.localStorage|\.localStorage\.(get|set|remove)Item|sessionStorage/.test(text), false, "the page kept a session of its own");
});

test("identifiers, autofill hints and the reveal toggle are production's", () => {
  const text = source();
  assert.match(text, /id="signin-identifier"/);
  assert.match(text, /autoComplete="username"/);
  assert.match(text, /id="signin-password"/);
  assert.match(text, /autoComplete="current-password"/);
  assert.match(text, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
  assert.match(text, /aria-pressed=\{showPassword\}/);
  /* The id the port assigns is the id production assigns, so password managers
     and autofill see the same form they always did. */
  const production = read("src/components/customer/pages/SignIn.jsx");
  for (const id of ["signin-identifier", "signin-password"]) {
    assert.match(production, rx(`id="${id}"`), `production no longer carries ${id}`);
  }
});

test("every message is the production string, and validation stops before the API call", () => {
  const text = source();
  const production = read("src/components/customer/pages/SignIn.jsx");
  const messages = [
    "Please enter your registered email address or phone number.",
    "Please enter your account password.",
    "That email or password doesn't match our records.",
    "Welcome back. Opening your atelier...",
  ];
  for (const message of messages) {
    assert.ok(text.includes(message), `the ported page lost the production message: ${message}`);
    assert.ok(production.includes(message), `production no longer carries: ${message}`);
  }
  /* Both guards return before the submit sets its busy flag. */
  assert.ok(text.indexOf(messages[0]) < text.indexOf("setIsSubmitting(true)"));
  assert.ok(text.indexOf(messages[1]) < text.indexOf("setIsSubmitting(true)"));
  assert.match(text, /isSubmitting \? 'Verifying Credentials\.\.\.' : success \? 'Authenticated' : 'Sign In to Account'/);
});

test("the redirect uses the application's sanitiser, never a home-made rule", () => {
  const text = source();
  assert.match(text, /import \{ sanitizeReturnUrl \} from '\.\.\/\.\.\/\.\.\/utils\/validation\.js';/);
  assert.match(text, /const rawReturnTo = searchParams\.get\('returnTo'\) \|\| '\/account';/);
  assert.match(text, /const returnTo = sanitizeReturnUrl\(rawReturnTo\);/);
  assert.equal(/startsWith\('\/\/'\)|\bstartsWith\("\/\/"\)/.test(text), false, "the page re-implemented the sanitiser");
  /* The rule itself, from the application's own module. */
  const { sanitizeReturnUrl } = on.validation;
  assert.equal(sanitizeReturnUrl("//evil.example.com"), "/account");
  assert.equal(sanitizeReturnUrl("https://evil.example.com"), "/account");
  assert.equal(sanitizeReturnUrl("/checkout"), "/checkout");
});

test("the success transition and the already-signed-in redirect are production's", () => {
  const text = source();
  assert.match(text, /if \(isAuthenticated && !isSubmitting && !success\) \{\s*navigate\(returnTo, \{ replace: true \}\);/);
  const transition = text.match(/setSuccess\(true\);\s*setTimeout\(\(\) => \{\s*navigate\(returnTo, \{ replace: true \}\);\s*\}, 500\);/);
  assert.ok(transition, "the 500 ms success transition is not the production one");
  /* The Google path repeats it verbatim. */
  assert.equal((text.match(/navigate\(returnTo, \{ replace: true \}\)/g) ?? []).length, 3, "sign-in should navigate on exactly three paths: redirect, password, Google");
});

test("the guest link keeps production's /account → /shop rule, and the sign-up link carries the raw returnTo", () => {
  const text = source();
  assert.match(text, /to=\{returnTo\.startsWith\('\/account'\) \? '\/shop' : returnTo\}/);
  assert.match(text, /to=\{`\/signup\$\{rawReturnTo \? `\?returnTo=\$\{encodeURIComponent\(rawReturnTo\)\}` : ''\}`\}/);
  assert.match(text, /to="\/forgot-password"/);
});

test("the Google button is the SHARED component, never a second client", () => {
  const text = source();
  assert.match(text, /import GoogleSignInButton from '\.\.\/\.\.\/\.\.\/components\/auth\/GoogleSignInButton\.jsx';/);
  assert.match(text, /label="Sign in with Google"/);
  assert.match(text, /onError=\{\(message\) => setError\(message\)\}/);
  assert.equal(/accounts\.google\.com|google\.accounts/.test(text), false, "the page loaded the GIS client itself");
});

test("the tab title is set and restored, and the page adds no dependency", () => {
  const text = source();
  assert.match(text, /document\.title = 'Sign In — PRATIKSHYA FASHION';/);
  assert.match(text, /return \(\) => \{ document\.title = previous; \};/);
  for (const specifier of importSpecifiers(text)) {
    const external = !specifier.startsWith(".");
    assert.equal(external && !RUNTIME_PACKAGES.has(specifier), false, `unexpected dependency: ${specifier}`);
  }
});

/* ── 3 · rendered against the real providers ────────────────────────────── */

test("the rendered page is the design's frame around the application's form", () => {
  const markup = on.render("/signin");
  assert.match(markup, /class="crumbs"/);
  assert.match(markup, /class="display info__title"/);
  assert.match(markup, /class="form pf-auth__form"/);
  assert.match(markup, /id="signin-identifier"/);
  assert.match(markup, /Forgot password\?/);
  assert.match(markup, /Remember me on this device/);
  assert.match(markup, /Or continue with/);
  assert.match(markup, /New to PRATIKSHYA FASHION\?/);
  assert.match(markup, /Continue as Guest/);
  /* Signed out, the page offers no success and no error — nothing invented.
     (The question is asked of THIS page's panels, not of the shell: the design's
     toasts carry a live region of their own.) */
  assert.equal(/pf-auth__status/.test(markup), false, "a signed-out page showed a success state");
  assert.equal(/pf-auth__alert/.test(markup), false, "a pristine page showed an error");
  assert.equal(/Welcome back\. Opening your atelier/.test(markup), false, "the success note rendered before any sign-in");
});

test("the stylesheet carries only what the design never drew, scoped to the port", () => {
  const raw = read(DIALOGUE);
  assert.match(raw, /PHASE 10/);
  /* The rules are read with the header comment removed — a selector is a
     selector, and prose about `.pf-root` is not one. */
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  /* One line at a time: a rule is a selector and a block on the same line, so
     the capture can never run across a line break into `@media`. */
  const selectors = [...css.matchAll(/^[ \t]*([^@\s][^{}\n]*)\{/gm)].map((match) => match[1].trim()).filter(Boolean);
  assert.ok(selectors.length > 0, "the auth stylesheet is empty");
  for (const selector of selectors) {
    assert.ok(
      selector.split(",").every((part) => part.trim().startsWith(".pf-root")),
      `a selector escapes the port's scope: ${selector}`,
    );
  }
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false, "a raw colour entered the auth stylesheet — use a design token");
});
