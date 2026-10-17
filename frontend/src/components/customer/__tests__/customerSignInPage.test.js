/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · the sign-in surface.
 *
 * The authentication page is now ONE experience: a full-bleed campaign
 * photograph, the editorial column and a transparent glass panel whose contents
 * change between sign-in, registration, password recovery and password reset.
 * These tests pin the parts that must never drift:
 *
 *   1. THE ROUTES. `/signin`, `/signup`, `/forgot-password` and
 *      `/reset-password` all render the experience inside the design's shell,
 *      and `App.jsx` still delegates every customer path to `CustomerLayout`.
 *   2. THE FLOW IS THE APPLICATION'S. `AuthContext.signIn` (the real
 *      `POST /auth/customer/sign-in`), the production identifiers and autofill
 *      hints, the production validation sentences, the sanitised `returnTo`, the
 *      500 ms success transition, the guest rule and the SHARED Google button.
 *   3. ONE PAGE. Mode switches are in-panel controls — no `Link`, no
 *      `navigate()` for a mode change, no second authentication route, no
 *      reload — so the URL, the photograph and the editorial column persist.
 *   4. THE VISUAL CONTRACT. The panel is genuinely translucent, the inputs are
 *      translucent rather than white, the navbar stylesheet is untouched, and
 *      the campaign asset exists at the documented path.
 *
 * What this suite cannot prove: clicks, focus and backdrop-filter rendering (no
 * DOM in this sandbox) and a real credential exchange (no backend). Those were
 * verified in a browser against a stubbed API; they stay labelled as such.
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

const PAGES = {
  signin: "src/components/customer/pages/SignIn.jsx",
  signup: "src/components/customer/pages/SignUp.jsx",
  forgot: "src/components/customer/pages/ForgotPassword.jsx",
  reset: "src/components/customer/pages/ResetPassword.jsx",
};
const EXPERIENCE = "src/components/customer/auth/AuthExperience.jsx";
const SIGNIN_PANEL = "src/components/customer/auth/AuthPanelSignIn.jsx";
const DIALOGUE = "src/components/customer/customer.auth.css";
const MOUNT = "src/components/customer/CustomerStorefront.jsx";

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

before(async () => {
  on = await mount();
});

after(async () => {
  await on?.vite.close();
  delete globalThis.window;
});

const source = (key = "signin") => read(PAGES[key]);
const experience = () => read(EXPERIENCE);
const still = (text) => text.replace(/\s+/g, " ");

/* ── 1 · the routes ─────────────────────────────────────────────────────── */

test("every customer auth route renders the one glass experience inside the design's shell", () => {
  for (const path of ["/signin", "/signup", "/forgot-password", "/reset-password?userId=u-1&token=t-1"]) {
    const markup = on.render(path);
    assert.match(markup, /class="pf-root"/, `${path} did not render the storefront`);
    assert.match(markup, /class="pf-auth-experience"/, `${path} did not render the glass experience`);
    assert.match(markup, /class="skip-link"/, `${path} lost the design's skip link`);
  }
});

test("the auth surface is the four customer screens and routing still belongs to the storefront", () => {
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

  const mount = read(MOUNT);
  for (const path of ["signin", "signup", "forgot-password", "reset-password"]) {
    assert.match(mount, new RegExp(`<Route path="${path}" element=\\{<`), `${path} route disappeared`);
  }
  assert.match(mount, /import "\.\/customer\.auth\.css";/, "the auth stylesheet is not carried by the mount");
  const app = read("src/App.jsx");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/);
  assert.doesNotMatch(app, /<Route path="\/(signin|signup|forgot-password|reset-password)"/);
});

test("each URL opens the experience in its own mode, and only the mode is a prop", () => {
  const modes = {
    signin: 'initialMode="login"',
    signup: 'initialMode="register"',
    forgot: 'initialMode="forgotPassword"',
    reset: 'initialMode="resetPassword"',
  };
  for (const [key, mode] of Object.entries(modes)) {
    assert.ok(source(key).includes(mode), `${PAGES[key]} does not open the ${mode} mode`);
    assert.ok(source(key).includes("AuthExperience"), `${PAGES[key]} does not render the experience`);
    /* No page renders its own form any more: the panel owns it. */
    assert.equal(/<form/.test(source(key)), false, `${PAGES[key]} still draws a form of its own`);
  }
});

/* ── 2 · the flow is the application's ──────────────────────────────────── */

test("sign-in goes through AuthContext, and the panel calls no API of its own", () => {
  const text = read(SIGNIN_PANEL);
  assert.match(text, /const \{ signIn, isAuthenticated \} = useAuth\(\);/);
  assert.match(text, /const result = await signIn\(\{ identifier, password, remember: rememberMe \}\);/);
  assert.equal(/\bapiClient\b|\bfetch\(|XMLHttpRequest/.test(text), false, "the panel reached for the network itself");
  assert.equal(/window\.localStorage|\.localStorage\.(get|set|remove)Item|sessionStorage/.test(text), false, "the panel kept a session of its own");
});

test("identifiers, autofill hints and the reveal control are production's", () => {
  const text = read(SIGNIN_PANEL);
  assert.match(text, /id="signin-identifier"/);
  assert.match(text, /autoComplete="username"/);
  assert.match(text, /id="signin-password"/);
  assert.match(text, /autoComplete="current-password"/);
  assert.match(text, /visible=\{showPassword\}/);
  /* The reveal control itself is drawn once, in the shared field parts. */
  assert.match(read("src/components/customer/auth/AuthPanelParts.jsx"), /aria-label=\{visible \? hideLabel : showLabel\}/);
  assert.match(read("src/components/customer/auth/AuthPanelParts.jsx"), /aria-pressed=\{visible\}/);
});

test("every message is the production string, and validation stops before the API call", () => {
  const text = read(SIGNIN_PANEL);
  const messages = [
    "Please enter your registered email address or phone number.",
    "Please enter your account password.",
    "That email or password doesn't match our records.",
    "Welcome back. Opening your atelier...",
  ];
  for (const message of messages) {
    assert.ok(text.includes(message), `the panel lost the production message: ${message}`);
  }
  assert.ok(text.indexOf(messages[0]) < text.indexOf("setIsSubmitting(true)"));
  assert.ok(text.indexOf(messages[1]) < text.indexOf("setIsSubmitting(true)"));
  assert.match(text, /isSubmitting \? 'Verifying Credentials\.\.\.' : success \? 'Authenticated' : 'Sign In to Account'/);
});

test("the redirect uses the application's sanitiser, and the experience reads the real returnTo", () => {
  const text = read(SIGNIN_PANEL);
  assert.match(text, /const result = await signIn\(/);
  const host = experience();
  assert.match(host, /import \{ sanitizeReturnUrl \} from '\.\.\/\.\.\/\.\.\/utils\/validation\.js';/);
  assert.match(host, /const rawReturnTo = searchParams\.get\('returnTo'\) \|\| '\/account';/);
  assert.match(host, /const returnTo = sanitizeReturnUrl\(rawReturnTo\);/);
  assert.equal(experience().includes("startsWith('//')"), false, "the experience re-implemented the sanitiser");
  /* The rule itself, from the application's own module. */
  const { sanitizeReturnUrl } = on.validation;
  assert.equal(sanitizeReturnUrl("//evil.example.com"), "/account");
  assert.equal(sanitizeReturnUrl("https://evil.example.com"), "/account");
  assert.equal(sanitizeReturnUrl("/checkout"), "/checkout");
});

test("the success transition and the already-signed-in redirect are production's", () => {
  const text = read(SIGNIN_PANEL);
  assert.match(text, /if \(isAuthenticated && !isSubmitting && !success\) \{\s*navigate\(returnTo, \{ replace: true \}\);/);
  const transition = text.match(/setSuccess\(true\);\s*setTimeout\(\(\) => \{\s*navigate\(returnTo, \{ replace: true \}\);\s*\}, 500\);/);
  assert.ok(transition, "the 500 ms success transition is not the production one");
  assert.equal((text.match(/navigate\(returnTo, \{ replace: true \}\)/g) ?? []).length, 3,
    "sign-in should navigate on exactly three paths: redirect, password, Google");
});

test("the guest link keeps production's /account → /shop rule", () => {
  const text = read(SIGNIN_PANEL);
  assert.match(text, /to=\{returnTo\.startsWith\('\/account'\) \? '\/shop' : returnTo\}/);
  assert.match(text, /Continue as Guest/);
});

test("the Google button is the SHARED component, never a second client", () => {
  const text = read(SIGNIN_PANEL);
  assert.match(text, /import GoogleSignInButton from '\.\.\/\.\.\/auth\/GoogleSignInButton\.jsx';/);
  assert.match(text, /label="Sign in with Google"/);
  assert.match(text, /onError=\{\(message\) => setError\(message\)\}/);
  assert.equal(/accounts\.google\.com|google\.accounts/.test(text), false, "the panel loaded the GIS client itself");
  /* The integration itself is untouched: the GIS script, the id_token exchange
     and the callbacks all still live in the shared component. */
  const google = read("src/components/auth/GoogleSignInButton.jsx");
  assert.match(google, /script\.src = "https:\/\/accounts\.google\.com\/gsi\/client";/);
  assert.match(google, /await signInWithGoogle\(\{ idToken: response\.credential \}\);/);
});

test("the tab titles are set and restored, and the pages add no dependency", () => {
  assert.match(source("signin"), /document\.title = 'Sign In — PRATIKSHYA FASHION';/);
  assert.match(source("signin"), /return \(\) => \{ document\.title = previous; \};/);
  assert.match(source("signup"), /document\.title = 'Create Account — PRATIKSHYA FASHION';/);
  assert.match(source("forgot"), /document\.title = 'Forgot Password — PRATIKSHYA FASHION';/);
  assert.match(source("reset"), /document\.title = 'Reset Password — PRATIKSHYA FASHION';/);
});

/* ── 3 · one page ───────────────────────────────────────────────────────── */

test("mode switches are local state, never navigation", () => {
  const text = experience();
  assert.match(text, /const \[mode, setMode\] = useState\(initialMode\);/);
  assert.match(text, /const switchMode = \(next\) => \{\s*if \(next === mode\) return;\s*setMode\(next\);\s*\};/);
  assert.equal(/window\.location\.href/.test(text), false, "the experience navigated with window.location");
  assert.equal(/useNavigate|navigate\(/.test(text), false, "the experience navigated to switch a mode");
  assert.equal(/<Route|createBrowserRouter|<Link/.test(text), false, "a mode change was given a route");
  /* The hero, editorial and photograph are OUTSIDE the panel's animated slot,
     so switching a mode cannot unmount them. */
  const panelIndex = text.indexOf('<motion.section');
  const mediaIndex = text.indexOf('pf-auth-experience__media');
  const editorialIndex = text.indexOf("<AuthEditorial />");
  const bodyIndex = text.indexOf("pf-auth-panel__body");
  assert.ok(mediaIndex > 0 && editorialIndex > 0 && panelIndex > 0 && bodyIndex > 0);
  assert.ok(mediaIndex < panelIndex && editorialIndex < panelIndex && bodyIndex > panelIndex,
    "the photograph or the editorial is inside the switching slot");
  assert.match(text, /<AnimatePresence mode="wait" initial={false}>/);
  assert.match(text, /key=\{mode\}/);
});

test("the in-panel actions are real controls: no anchors to other auth pages", () => {
  for (const file of [SIGNIN_PANEL,
    "src/components/customer/auth/AuthPanelSignUp.jsx",
    "src/components/customer/auth/AuthPanelForgotPassword.jsx",
    "src/components/customer/auth/AuthPanelResetPassword.jsx"]) {
    const text = read(file);
    assert.match(text, /onSwitchMode\('/, `${file} has no in-panel mode switch`);
    assert.equal(/to="\/(signin|signup|forgot-password|reset-password)/.test(text), false,
      `${file} links to a second authentication page`);
    assert.equal(/navigate\('\/signin|navigate\('\/signup|navigate\('\/forgot/.test(text), false,
      `${file} navigates between authentication modes`);
  }
  /* The four switches the directive names are all wired to `onSwitchMode`. */
  assert.match(read(SIGNIN_PANEL), /onSwitchMode\('forgotPassword'\)/);
  assert.match(read(SIGNIN_PANEL), /onSwitchMode\('register'\)/);
  assert.match(read("src/components/customer/auth/AuthPanelSignUp.jsx"), /onSwitchMode\('login'\)/);
  assert.match(read("src/components/customer/auth/AuthPanelForgotPassword.jsx"), /onSwitchMode\('login'\)/);
});

test("the reset URL's userId and token are read, handed on, and never stored", () => {
  const text = experience();
  assert.match(text, /const resetUserId = \(searchParams\.get\('userId'\) \|\| ''\)\.trim\(\);/);
  assert.match(text, /const resetToken = \(searchParams\.get\('token'\) \|\| ''\)\.trim\(\);/);
  assert.match(text, /userId=\{resetUserId\}/);
  assert.match(text, /token=\{resetToken\}/);
  assert.equal(/localStorage|sessionStorage|console\./.test(text), false, "the experience persisted or logged the reset token");
});

/* ── 4 · the visual contract ────────────────────────────────────────────── */

test("the panel is genuinely translucent: a wine tint under half opacity with a restrained blur", () => {
  const css = read(DIALOGUE);
  const panel = css.match(/\.pf-root \.pf-auth-panel \{([\s\S]*?)\n\}/);
  assert.ok(panel, "the panel rule is missing");
  const tint = panel[1].match(/background:\s*([\s\S]*?);/)?.[1] ?? "";
  const alphas = [...tint.matchAll(/rgba\([^)]*?,\s*(0?\.\d+|1)\)/g)].map((m) => Number(m[1]));
  assert.ok(alphas.length >= 3, "the panel background is not a translucent gradient");
  for (const alpha of alphas) {
    assert.ok(alpha <= 0.5, `a panel tint of ${alpha} is too opaque for the photograph to show through`);
  }
  assert.match(panel[1], /backdrop-filter: blur\(8px\)/);
  assert.match(panel[1], /border: 1px solid rgba\(235, 196, 132, 0\.62\)/);
  assert.equal(/background:\s*(#|rgb\()|var\(--c-paper\)|var\(--c-bg\)/.test(panel[1]), false,
    "the panel fell back to an opaque fill");
  /* Inputs are translucent as well, never white cards. */
  const control = css.match(/\.pf-root \.pf-auth-control \{([\s\S]*?)\n\}/);
  assert.ok(control, "the field control rule is missing");
  assert.match(control[1], /background: rgba\(255, 244, 232, 0\.07\)/);
  assert.equal(/background:\s*(#fff|white|var\(--c-paper\))/.test(control[1]), false, "an input was given an opaque fill");
});

test("the stylesheet stays inside the port and never touches the shared navbar", () => {
  const css = read(DIALOGUE).replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...css.matchAll(/^[ \t]*([^@\s][^{}\n]*)\{/gm)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(selectors.length > 0, "the auth stylesheet is empty");
  for (const selector of selectors) {
    assert.ok(selector.split(",").every((part) => part.trim().startsWith(".pf-root")),
      `a selector escapes the port's scope: ${selector}`);
  }
  for (const selector of selectors) {
    assert.equal(/\.header|\.nav__|\.logo/.test(selector), false, `the auth sheet restyled the shared navbar: ${selector}`);
  }
  /* The navbar component itself is not part of this work. */
  assert.match(read("src/components/customer/components/layout/Header.jsx"), /<header className=\{cx\('header'/);
});

test("the campaign asset exists, is mounted outside the switching slot, and has a mobile crop", () => {
  assert.ok(existsSync(join(ROOT, "public/design/pratikshya-auth-campaign.webp")), "the desktop campaign image is missing");
  assert.ok(existsSync(join(ROOT, "public/design/pratikshya-auth-campaign-mobile.webp")), "the mobile campaign crop is missing");
  const text = experience();
  assert.match(text, /src="\/design\/pratikshya-auth-campaign\.webp"/);
  assert.match(text, /srcSet="\/design\/pratikshya-auth-campaign-mobile\.webp"/);
  assert.match(text, /fetchPriority="high"/);
  assert.match(text, /width="1672"/);
  assert.match(text, /height="941"/);
});

test("the hero text animations are staggered, one-shot, and honour reduced motion", () => {
  const text = read("src/components/customer/auth/AuthEditorial.jsx");
  assert.match(text, /import \{ motion, useReducedMotion \} from 'framer-motion';/);
  assert.match(text, /const reduce = useReducedMotion\(\);/);
  assert.match(text, /staggerChildren: reduce \? 0 : 0\.13/);
  assert.match(text, /y: reduce \? 0 : 14/);
  assert.match(text, /y: reduce \? '0%' : '112%'/);
  assert.equal(/repeat:|Infinity|animate-pulse|rotate/.test(text), false, "a continuous animation entered the editorial");
  assert.match(text, /initial="hidden"\s*animate="show"/);
  assert.match(text, /TIMELESS IN EVERY DETAIL/);
  assert.match(text, /More than/);
  assert.match(text, /an outfit,/);
  assert.match(text, /a part of you\./);
  assert.match(text, /Sarees, jewellery and ensembles that celebrate your story/);
  for (const label of ["Authentic", "Indian Craftsmanship", "Premium", "Quality Fabrics", "Designed", "for Modern Celebrations"]) {
    assert.ok(text.includes(label), `the editorial lost "${label}"`);
  }
});

/* ── 5 · the rendered page ──────────────────────────────────────────────── */

test("the rendered sign-in page is the editorial column around the application's form", () => {
  const markup = on.render("/signin?returnTo=%2Faccount");
  assert.match(markup, /class="pf-auth-editorial"/);
  assert.match(markup, /class="pf-auth-headline"/);
  assert.match(markup, /class="pf-auth-panel"/);
  assert.match(markup, /class="pf-auth-form"/);
  assert.match(markup, /id="signin-identifier"/);
  assert.match(markup, /id="signin-password"/);
  assert.match(markup, /Forgot password\?/);
  assert.match(markup, /Remember me on this device/);
  assert.match(markup, /Or continue with/);
  assert.match(markup, /New to PRATIKSHYA FASHION\?/);
  assert.match(markup, /Continue as Guest/);
  /* Signed out, the page offers no success and no error — nothing invented. */
  assert.equal(/pf-auth-status/.test(markup), false, "a signed-out page showed a success state");
  assert.equal(/pf-auth-alert/.test(markup), false, "a pristine page showed an error");
  assert.equal(/Welcome back\. Opening your atelier/.test(markup), false, "the success note rendered before any sign-in");
  /* Production gives auth screens the shopping chrome; the footer is merely not
     painted beneath the hero (CSS), it is still part of the shell's markup. */
  assert.match(markup, /class="footer"/);
});

test("the panel is a labelled region with semantic, labelled fields", () => {
  const markup = on.render("/signin");
  assert.match(markup, /class="pf-auth-panel" aria-labelledby="pf-auth-title"/);
  assert.match(markup, /id="pf-auth-title"/);
  assert.match(markup, /<label class="pf-auth-field__label" for="signin-identifier">/);
  assert.match(markup, /<label class="pf-auth-field__label" for="signin-password">/);
  assert.match(markup, /<button type="submit" class="pf-auth-submit"/);
  assert.match(markup, /autoComplete="username"/);
});
