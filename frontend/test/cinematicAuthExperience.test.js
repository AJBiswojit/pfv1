/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · the single authentication page.
 *
 * A source-level contract for the experience that `/signin`, `/signup`,
 * `/forgot-password` and `/reset-password` all render. It pins the things a
 * future edit could silently undo:
 *
 *   1. ONE PAGE — all four routes mount `AuthExperience`, whose sign-in /
 *      registration / recovery / reset states are local state, not routes. None
 *      of the in-panel actions is an anchor to another auth page and none of
 *      them calls the router.
 *   2. THE PHOTOGRAPH — the generated campaign asset exists at the documented
 *      path (with its mobile crop), is mounted outside the animated slot, and is
 *      a real `<picture>` with intrinsic dimensions.
 *   3. THE GLASS — the panel's tint is translucent (≤ 0.5 alpha), the inputs are
 *      translucent rather than white, and no rule in the auth stylesheet reaches
 *      the shared navbar.
 *   4. THE EDITORIAL — the exact copy the directive specifies and one-shot
 *      animations that honour `prefers-reduced-motion`.
 *   5. THE WIRING — every panel still goes through `AuthContext` and the shared
 *      Google button; no panel talks to the network itself.
 *
 * The browser-level behaviour (clicks, focus, backdrop-filter, the stubbed-API
 * flows) was verified separately against a running dev server; this suite is
 * the part that runs without one.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

const EXPERIENCE = "src/components/customer/auth/AuthExperience.jsx";
const PANELS = [
  "src/components/customer/auth/AuthPanelSignIn.jsx",
  "src/components/customer/auth/AuthPanelSignUp.jsx",
  "src/components/customer/auth/AuthPanelForgotPassword.jsx",
  "src/components/customer/auth/AuthPanelResetPassword.jsx",
];
const CSS = "src/components/customer/customer.auth.css";

test("the four auth URLs all render the one experience, each in its own initial mode", () => {
  const pages = {
    "src/components/customer/pages/SignIn.jsx": 'initialMode="login"',
    "src/components/customer/pages/SignUp.jsx": 'initialMode="register"',
    "src/components/customer/pages/ForgotPassword.jsx": 'initialMode="forgotPassword"',
    "src/components/customer/pages/ResetPassword.jsx": 'initialMode="resetPassword"',
  };
  for (const [file, mode] of Object.entries(pages)) {
    const text = read(file);
    assert.ok(text.includes("import AuthExperience from '../auth/AuthExperience.jsx';"), `${file} does not import the experience`);
    assert.ok(text.includes(mode), `${file} does not open ${mode}`);
    assert.equal(/<form/.test(text), false, `${file} still draws a form of its own`);
  }
  const mount = read("src/components/customer/CustomerStorefront.jsx");
  for (const path of ["signin", "signup", "forgot-password", "reset-password"]) {
    assert.match(mount, new RegExp(`<Route path="${path}" element=\\{<`), `${path} is not routed`);
  }
});

test("mode switching is local state and never a navigation", () => {
  const text = read(EXPERIENCE);
  assert.match(text, /const \[mode, setMode\] = useState\(initialMode\);/);
  assert.equal(/useNavigate|window\.location|<Route|<Link/.test(text), false, "the experience navigates to switch modes");
  const body = text.slice(text.indexOf('className="pf-auth-panel__body"'));
  assert.ok(body.includes("<AnimatePresence mode=\"wait\" initial={false}>"), "mode transitions are not animated in place");
  assert.ok(body.includes("key={mode}"));
  /* The photograph and the editorial are outside the switching slot. */
  const panelIndex = text.indexOf("<motion.section");
  assert.ok(text.indexOf("pf-auth-experience__media") < panelIndex);
  assert.ok(text.indexOf("<AuthEditorial />") < panelIndex);
  assert.ok(text.indexOf("pf-auth-panel__body") > panelIndex);
  for (const panel of PANELS) {
    const source = read(panel);
    assert.match(source, /onSwitchMode\('/, `${panel} has no in-panel switch`);
    assert.equal(/to="\/(signin|signup|forgot-password|reset-password)/.test(source), false, `${panel} links to another auth page`);
  }
});

test("the campaign photograph is generated, delivered and mounted outside the switching slot", () => {
  assert.ok(existsSync(join(ROOT, "public/design/pratikshya-auth-campaign.webp")), "the desktop campaign asset is missing");
  assert.ok(existsSync(join(ROOT, "public/design/pratikshya-auth-campaign-mobile.webp")), "the mobile campaign asset is missing");
  const desktop = readFileSync(join(ROOT, "public/design/pratikshya-auth-campaign.webp"));
  const mobile = readFileSync(join(ROOT, "public/design/pratikshya-auth-campaign-mobile.webp"));
  /* WebP: the RIFF container with a WEBP brand. */
  assert.equal(desktop.subarray(0, 4).toString(), "RIFF");
  assert.equal(desktop.subarray(8, 12).toString(), "WEBP");
  assert.equal(mobile.subarray(8, 12).toString(), "WEBP");
  /* Large enough for a desktop hero, small enough not to stall it. */
  assert.ok(desktop.length > 40_000 && desktop.length < 400_000, "the desktop campaign asset is not a sensible size");
  const text = read(EXPERIENCE);
  assert.match(text, /src="\/design\/pratikshya-auth-campaign\.webp"/);
  assert.match(text, /srcSet="\/design\/pratikshya-auth-campaign-mobile\.webp"/);
  assert.match(text, /width="1672"/);
  assert.match(text, /height="941"/);
  assert.match(text, /fetchPriority="high"/);
  assert.match(text, /alt=""/);
});

test("the authentication panel is genuinely transparent and its inputs are translucent", () => {
  const css = read(CSS);
  const panel = css.match(/\.pf-root \.pf-auth-panel \{([\s\S]*?)\n\}/)[1];
  const tint = panel.match(/background:\s*([\s\S]*?);/)[1];
  const alphas = [...tint.matchAll(/rgba\([^)]*?,\s*(0?\.\d+|1)\)/g)].map((m) => Number(m[1]));
  assert.ok(alphas.length >= 3, "the panel background is not a translucent gradient");
  for (const alpha of alphas) {
    assert.ok(alpha <= 0.5, `panel tint ${alpha} leaves the photograph invisible`);
  }
  assert.match(panel, /backdrop-filter: blur\([3-7]px\)/);
  assert.match(panel, /border: 1px solid rgba\(231, 190, 125, 0\.62\)/);
  assert.match(panel, /border-radius: 20px/);
  assert.equal(/background:\s*(#fff|white|var\(--c-paper\)|var\(--c-bg\))/.test(panel), false, "the panel fell back to an opaque fill");

  const control = css.match(/\.pf-root \.pf-auth-control \{([\s\S]*?)\n\}/)[1];
  assert.match(control, /background: rgba\(255, 244, 232, 0\.0[7-9]\)/);
  assert.equal(/background:\s*(#fff|white|var\(--c-paper\))/.test(control), false, "an input was given an opaque fill");

  /* A soft scrim carries readability; the panel keeps the photo visible. */
  assert.match(css, /\.pf-root \.pf-auth-experience__scrim/);
  assert.match(css, /linear-gradient\(90deg,/);
  /* The storefront footer is not painted beneath the campaign. */
  assert.match(css, /\.pf-root:has\(\.pf-auth-experience\) \.footer \{ display: none; \}/);
});

test("the auth stylesheet cannot reach the shared navbar", () => {
  const css = read(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...css.matchAll(/^[ \t]*([^@\s][^{}\n]*)\{/gm)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(selectors.length > 0);
  for (const selector of selectors) {
    assert.ok(selector.split(",").every((part) => part.trim().startsWith(".pf-root")), `unscoped selector: ${selector}`);
    assert.equal(/\.header|\.nav__|\.logo|\.announce/.test(selector), false, `the auth sheet restyled the navbar: ${selector}`);
  }
});

test("the editorial copy is exactly the approved content, animated once and reduced-motion safe", () => {
  const text = read("src/components/customer/auth/AuthEditorial.jsx");
  for (const copy of [
    "TIMELESS IN EVERY DETAIL",
    "More than",
    "an outfit,",
    "a part of you.",
    "Sarees, jewellery and ensembles that celebrate your story, crafted with care,",
    "Authentic",
    "Indian Craftsmanship",
    "Premium",
    "Quality Fabrics",
    "Designed",
    "for Modern Celebrations",
    "PRATIKSHYA FASHION",
  ]) {
    assert.ok(text.includes(copy), `the editorial lost "${copy}"`);
  }
  assert.match(text, /staggerChildren: reduce \? 0 : 0\.13/);
  assert.match(text, /y: reduce \? 0 : 14/);
  assert.match(text, /y: reduce \? '0%' : '112%'/);
  assert.equal(/repeat:|Infinity|animate-pulse/.test(text), false, "a looping animation entered the editorial");
});

test("every panel goes through AuthContext and the shared Google button", () => {
  for (const panel of PANELS) {
    const text = read(panel);
    assert.equal(/\bapiClient\b|\bfetch\(|XMLHttpRequest/.test(text), false, `${panel} reached for the network itself`);
    assert.equal(/window\.localStorage|sessionStorage/.test(text), false, `${panel} kept a session of its own`);
  }
  assert.match(read(PANELS[0]), /const result = await signIn\(\{ identifier, password, remember: rememberMe \}\);/);
  assert.match(read(PANELS[1]), /const result = await signUp\(\{/);
  assert.match(read(PANELS[2]), /const result = await forgotPassword\(identifier\);/);
  assert.match(read(PANELS[3]), /await resetPassword\(password, confirmPassword, \{ userId, token \}\)/);
  for (const googlePanel of [PANELS[0], PANELS[1]]) {
    assert.match(read(googlePanel), /import GoogleSignInButton from '\.\.\/\.\.\/auth\/GoogleSignInButton\.jsx';/);
  }
  const google = read("src/components/auth/GoogleSignInButton.jsx");
  assert.match(google, /await signInWithGoogle\(\{ idToken: response\.credential \}\);/);
  assert.match(google, /accounts\.google\.com\/gsi\/client/);
});
