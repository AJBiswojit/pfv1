/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.3 — the profile screen, on this
 * application's own account.
 *
 * The Aarna-native profile screen renders inside the shared account frame and
 * remains behind the customer guard. App.jsx delegates all customer routes to
 * Aarna; its staff routes remain independent.
 *
 * What these tests render is the real composition: the ported page inside this
 * application's provider stack (and the port's own UI/shop providers, exactly as
 * `CustomerStorefront` mounts them), through Vite's SSR pipeline — no component is
 * rendered in isolation and no context is faked. The session is the application's
 * own: it is opened and closed through the api client (`setTokens`/`clearTokens`),
 * never by writing a token key by hand.
 *
 *   1. THE ROUTE. `/account\/profile` is the port's page, inside the guard,
 *      declared in the port's registry — and production's own page is still
 *      `App.jsx`'s, still lazy. With the switch off the URL is production's; a
 *      session the application has not restored yet is shown the guard.
 *   2. WHAT THE PAGE DRAWS. The frame's trail, the page's own heading, the
 *      production form's six fields with their own labels, types and required
 *      markers, the portrait block that states the upload honestly, the
 *      read-only member-since, the two actions production offers — and every
 *      destination the page renders resolving to a route this application
 *      registers.
 *   3. THE STATES A SERVER RENDER CANNOT REACH. A save that failed, a read that
 *      failed, a lapsed session, the payload rule that clears a portrait, the
 *      validation rules and their messages, the feedback lifetime and the tab
 *      title all run in effects, which a server render does not execute — so each
 *      one is pinned where it lives, in the page's own source, and every string it
 *      is pinned against is the production screen's own.
 *   4. THE COPY THAT IS BANNED STAYS BANNED. No device store, no prototype
 *      profile key, no API call of the page's own, no dead control, no invented
 *      address, no HTTP status shown to a customer, no retry the shared context
 *      does not expose.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM in this tree, so clicks, focus order
 * and layout are out of scope, and a form cannot be filled in or submitted here —
 * the handlers, the validation and the outcome rules are pinned at the source
 * level instead. Effects do not run under `renderToStaticMarkup`, so the loaded
 * profile, a failed read and the 401/403 branch are source-pinned; what a render
 * alone settles — a session that holds a customer token and has not been read yet
 * (announced as loading, never as an empty profile) and a session that owes no
 * read — is rendered here. Nothing here is an end-to-end verification of the
 * profile API.
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
import { MotionConfig } from "framer-motion";

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

const PAGE = "src/components/customer/pages/account/Profile.jsx";
const FRAME = "src/components/customer/pages/account/AccountFrame.jsx";
const MOUNT = "src/components/customer/CustomerStorefront.jsx";
const PRODUCTION_APP = "src/App.jsx";
const PRODUCTION_PAGE = "src/components/customer/pages/account/Profile.jsx";
const SHEET = "src/components/customer/customer.account.css";
/* The sheets a ported account page may lean on: the design's own, the port's
   shared form register (`pf-form`, `pf-lab`, `pf-req`, `pf-hint`, `pf-alert` —
   declared for the checkout family and reused here), and the account's own. */
const SHEETS = ["src/components/customer/customer.css", "src/components/customer/customer.checkout.css", SHEET];
const REGISTRY = "scripts/customer-port.js";

/* ── the browser a server-rendered page still has to believe in ────────────── */

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

/* ── the mount ─────────────────────────────────────────────────────────────── */

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
    { default: Profile },
    { default: CustomerLayout },
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    { UIProvider },
    { ShopProvider },
    routes,
    api,
  ] = await Promise.all([
    load("/src/components/customer/pages/account/Profile.jsx"),
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/components/customer/state/UIContext.jsx"),
    load("/src/components/customer/state/ShopContext.jsx"),
    load("/src/components/customer/router/routes.js"),
    load("/src/services/api/apiClient.js"),
  ]);

  /* The tree the application really builds around this page, outermost first:
     `App.jsx` nests the customer providers `AuthProvider` → `AccountProvider` →
     `InventoryProvider` → `ShoppingProvider` → `OrderProvider` →
     `CheckoutProvider`, and `CustomerStorefront` mounts its OWN `MotionConfig` →
     `UIProvider` → `ShopProvider` INSIDE that band. `React.createElement` wraps
     from the inside out, so each array below is written innermost first. */
  const Providers = ({ children }) => {
    let tree = children;
    for (const Provider of [ShopProvider, UIProvider]) {
      tree = React.createElement(Provider, null, tree);
    }
    tree = React.createElement(MotionConfig, { reducedMotion: "user" }, tree);
    for (const Provider of [
      CheckoutProvider,
      OrderProvider,
      ShoppingProvider,
      InventoryProvider,
      AccountProvider,
      AuthProvider,
    ]) {
      tree = React.createElement(Provider, null, tree);
    }
    return tree;
  };

  /* The real route host: the storefront this application mounts at the URL, so
     the switch and the guard are exercised on the page's own path. */
  const Layout = (() => {
    let tree = React.createElement(CustomerLayout);
    for (const Provider of [
      CheckoutProvider,
      OrderProvider,
      ShoppingProvider,
      InventoryProvider,
      AccountProvider,
      AuthProvider,
    ]) {
      tree = React.createElement(Provider, null, tree);
    }
    return tree;
  })();

  const at = (path, tree) =>
    renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Suspense, { fallback: null }, tree)),
    );

  return {
    vite,
    routes,
    api,
    Profile,
    /* The port's page at the URL a browser reaches, inside the real providers. */
    render: (path = "/account\/profile") => at(path, React.createElement(Providers, null, React.createElement(Profile))),
    /* And the application's own route host, for the switch and the guard. */
    renderLayout: (path) => at(path, Layout),
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

/* ── helpers ───────────────────────────────────────────────────────────────── */

const count = (markup, needle) => markup.split(needle).length - 1;

/** The page's source with its comments removed — the code, not the prose. */
const code = () => read(PAGE).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** A path with its query and trailing slash removed, as the router reads it. */
const bare = (value) => String(value).split(/[?#]/)[0].replace(/\/+$/, "") || "/";

/** Every `<input>` in a markup string, as its attribute text. */
const inputs = (markup) => [...markup.matchAll(/<input ([^>]*?)\/?>/g)].map(([, attributes]) => attributes);
const inputFor = (markup, id) => inputs(markup).find((attributes) => attributes.includes(`id="${id}"`));

/* ── 1 · the route, the switch and the guard ───────────────────────────────── */

test("`/account\/profile` is the port's own page, inside the same guard, and Aarna owns the only customer route", () => {
  const mount = read(MOUNT);
  assert.match(mount, /import AccountProfilePage from "\.\/pages\/account\/Profile\.jsx";/,
    "the mount does not import the port's profile page under its own name");
  assert.equal(/const AccountProfile = lazy\(/.test(mount), false,
    "the production profile page is still declared lazy in the port");
  assert.match(mount, /<Route path="account\/profile" element=\{<AccountProfilePage \/>\} \/>/,
    "the profile route is not the port's own page");

  const guard = mount.slice(mount.indexOf("<Route element={<ProtectedRoute />}>"));
  assert.match(guard.slice(0, guard.indexOf("</Route>")),
    /<Route path="account\/profile" element=\{<AccountProfilePage \/>\} \/>/,
    "the profile route is outside the guard the family stands behind");

  const app = read(PRODUCTION_APP);
  const storefront = read("src/components/customer/CustomerStorefront.jsx");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/,
    "App.jsx no longer delegates customer paths to Aarna");
  assert.doesNotMatch(app, /pages\/account\/AccountProfile/,
    "the outer route tree still imports an obsolete customer page");
  assert.match(storefront, /<Route path="account\/profile"/,
    "Aarna no longer owns the account route");
});

test("the port's registry declares the profile page once, and the page exists", () => {
  const registry = read(REGISTRY);
  const added = registry.slice(registry.indexOf("const ADDED = ["), registry.indexOf("];", registry.indexOf("const ADDED = [")));
  assert.equal(count(added, '"pages/account/Profile.jsx"'), 1, "the profile page is not declared exactly once in the registry");
  assert.ok(existsSync(join(ROOT, PAGE)), "the declared page does not exist");
});

test("with the switch off, the URL is production's — nothing of this page mounts", () => {
  const markup = off.renderLayout("/account\/profile");
  assert.equal(/pf-account/.test(markup), false, "the Atelier storefront mounted the port's account chrome");
  assert.equal(/Personal details/.test(markup), false, "the Atelier storefront rendered the port's profile screen");
  assert.equal(/Your personal/.test(markup), false, "the Atelier storefront rendered the port's profile heading");
});

test("a session the application has not restored yet is shown the guard, not the profile screen", () => {
  const { setTokens, clearTokens } = on.api;
  globalThis.localStorage = localStorageStub;
  try {
    setTokens({ accessToken: "pf-phase23-profile", refreshToken: "pf-phase23-refresh" }, "customer");
    const markup = on.renderLayout("/account\/profile");

    assert.match(markup, /Verifying atelier access/, "a guarded URL painted past the guard");
    assert.equal(/pf-account/.test(markup), false, "the guard painted account chrome for an unrestored session");
    assert.equal(/Personal details/.test(markup), false, "the profile screen painted for an unrestored session");
  } finally {
    clearTokens("customer");
    delete globalThis.localStorage;
  }
});

/* ── 2 · what the page draws, and from where ───────────────────────────────── */

test("a session that owes no read states the form production supports — and nothing about the account", () => {
  const markup = on.render();

  assert.match(markup, /class="info container account pf-account"/, "the page is not drawn inside the design's page frame");
  assert.match(markup, /class="info__lead pf-account__lead"/, "the screen lost its lead");
  assert.match(markup, /Personal details/, "the screen's own eyebrow is gone");
  assert.match(markup, /class="display shop__title">Your personal <em>profile<\/em><\/h2>/,
    "the screen's own heading is gone");
  assert.match(markup, /class="form pf-form"/, "the form lost the register the port's forms use");
  assert.equal(/aria-busy/.test(markup), false, "a settled session announced itself as loading");
  assert.equal(/Loading your profile/.test(markup), false, "a settled session drew the loading block");
  assert.equal(/could not load your account/.test(markup), false, "a settled session drew the failure block");
});

test("the form is production's own six fields — labels, types, required markers and all", () => {
  const markup = on.render();

  const profileFields = [
    ["profile-firstName", "firstName", "text"],
    ["profile-lastName", "lastName", "text"],
    ["profile-email", "email", "email"],
    ["profile-phone", "phone", "tel"],
    ["profile-dateOfBirth", "dateOfBirth", "date"],
  ];
  for (const [id, name, type] of profileFields) {
    const field = inputFor(markup, id);
    assert.ok(field, `${id} is not drawn`);
    assert.ok(field.includes(`name="${name}"`), `${id} is not the form's ${name} field`);
    assert.ok(field.includes(`type="${type}"`), `${id} is not a ${type} field`);
  }

  /* Production requires the first name and the email address, and nothing else. */
  assert.equal(inputs(markup).filter((attributes) => attributes.includes("required")).length, 2,
    "the required markers are not production's two");
  for (const id of ["profile-firstName", "profile-email"]) {
    assert.ok(inputFor(markup, id).includes("required"), `${id} lost its required marker`);
  }
  for (const id of ["profile-lastName", "profile-phone", "profile-dateOfBirth"]) {
    assert.equal(inputFor(markup, id).includes("required"), false, `${id} became required — production leaves it optional`);
  }

  /* The labels are the port's form register, uppercased by the design's own rule. */
  for (const label of ["First name", "Last name", "Email address", "Mobile number", "Date of birth", "Member since"]) {
    assert.ok(markup.includes(`class="pf-lab">${label}`), `the ${label} label is gone`);
  }
  assert.equal(count(markup, '<span class="pf-req">*</span>'), 2, "the required marker is drawn on the wrong number of fields");
  assert.match(markup, /10-digit Indian mobile, with or without \+91\./, "the mobile field lost its hint");
});

test("a portrait is never claimed: the upload is honestly unavailable and the removal is production's own", () => {
  const markup = on.render();

  assert.match(markup, /class="pf-account__portrait"/, "the portrait block is gone");
  assert.match(markup, /Profile portrait/, "the portrait block lost its label");
  assert.match(markup, /Portrait uploads are not available yet/, "the honest statement about uploads is gone");

  const upload = inputFor(markup, "profile-avatar");
  assert.ok(upload, "the upload control is gone");
  assert.ok(upload.includes('type="file"'), "the upload control is not a file field");
  assert.ok(upload.includes("disabled"), "the upload control offers an upload the backend cannot accept");
  assert.equal(/Remove<\/button>/.test(markup), false, "a removal was offered with no portrait on file");
});

test("member-since is the server's own, read-only, and never part of the form the customer submits", () => {
  const markup = on.render();
  const field = inputFor(markup, "profile-memberSince");

  assert.ok(field, "the member-since field is gone");
  assert.ok(field.includes("disabled"), "member-since became editable");
  assert.ok(field.includes('placeholder="—"'), "member-since lost production's own placeholder");
  assert.equal(/name="memberSince"/.test(markup), false, "the read-only field became a submitted field");
});

test("the page's own two actions are production's, and no save is claimed before it starts", () => {
  const markup = on.render();

  assert.match(markup, /Save Profile<\/span>/, "the save action is gone");
  assert.match(markup, /Reset<\/span>/, "the reset action is gone");
  assert.equal(/Saving Changes\.\.\./.test(markup), false, "the save action claims a save that has not started");
  assert.equal(/Your profile has been saved\./.test(markup), false, "the page claims a save before the server answered");
});

test("the frame's trail, the page's own title and the account's navigation are the shared ones", () => {
  const markup = on.render();

  assert.match(markup, /aria-label="Breadcrumb"/, "the trail is gone");
  assert.match(markup, /aria-current="page">Profile<\/span>/, "the trail does not end on this screen");
  assert.match(markup, /class="display pf-account__name">Profile<\/h1>/, "the screen's own title is gone");
  assert.match(markup, /class="label">Your account<\/p>/, "the account's own eyebrow is gone");
  assert.match(markup, /class="pf-account__nav"/, "the shared navigation is gone");
});

test("every destination the page renders is a route this application registers", () => {
  const markup = on.render();
  const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);

  assert.ok(hrefs.length > 0, "the page renders no destination at all");
  for (const href of hrefs) {
    assert.equal(on.routes.isRegisteredPath(bare(href)), true, `${href} resolves to no route this application registers`);
  }

  /* And the page's own literal, in the failure branch a render cannot reach. */
  const literals = [...read(PAGE).matchAll(/to="([^"]+)"/g)].map(([, to]) => to);
  assert.ok(literals.length > 0, "the page declares no destination of its own");
  for (const to of literals) {
    assert.equal(on.routes.isRegisteredPath(bare(to)), true, `${to} resolves to no route this application registers`);
  }
});

/* ── 3 · the states a server render cannot reach ───────────────────────────── */

test("the form follows the profile the server returned, and never a copy of its own", () => {
  const page = read(PAGE);

  assert.match(page, /const fieldsFrom = \(profile\) => \(\{/, "the page no longer derives its fields from one place");
  for (const key of ["firstName", "lastName", "email", "phone", "dateOfBirth"]) {
    assert.ok(page.includes(`${key}: profile?.${key} || ''`), `the form no longer follows the server's own ${key}`);
  }
  assert.ok(page.includes("avatar: profile?.avatar || null"), "the form no longer follows the server's own portrait");
  assert.match(page, /useEffect\(\(\) => \{\n\s+if \(!profile\) return;\n\s+setFormData\(fieldsFrom\(profile\)\);\n\s+\}, \[profile\]\);/,
    "the form no longer re-reads the profile the server returned");

  /* And the same fields of that profile as the production screen reads — nothing
     added, nothing dropped: a field the server sends is never silently lost. */
  const fieldsOf = (text, object) => {
    const pattern = new RegExp("\\b" + object + "\\??\\.([A-Za-z_][A-Za-z0-9_]*)", "g");
    return [...new Set([...text.matchAll(pattern)].map((match) => match[1]))].sort();
  };
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.deepEqual(fieldsOf(strip(page), "profile"), fieldsOf(strip(read(PRODUCTION_PAGE)), "profile"),
    "the port reads a different profile than the production screen reads");
});

test("the save goes through the account context, with production's own payload", () => {
  const page = read(PAGE);

  assert.match(page, /const \{ profile, updateProfile, isLoading, loadError, loadErrorStatus \} = useAccount\(\);/,
    "the page no longer reads the account context");
  assert.equal(/fetch\(|axios|apiClient|apiUpdateProfile/.test(page), false, "the page reaches an API directly");

  const submit = page.slice(page.indexOf("const handleSubmit = async"), page.indexOf("/* Production's reset"));
  assert.match(submit, /const result = await updateProfile\(\{/, "the save no longer goes through the context");
  for (const line of [
    "firstName: formData.firstName.trim(),",
    "lastName: formData.lastName.trim(),",
    "email: formData.email.trim(),",
    "phone: formData.phone.trim(),",
    "dateOfBirth: formData.dateOfBirth,",
    "...(formData.avatar === null && profile?.avatar ? { avatar: '' } : {}),",
  ]) {
    assert.ok(submit.includes(line), `the save payload lost ${line}`);
  }
  assert.match(submit, /setIsSaving\(true\);[\s\S]*setIsSaving\(false\);/, "the save is no longer gated while it runs");
});

test("a save that failed states the failure, and only a saved one states a save", () => {
  const submit = read(PAGE).slice(read(PAGE).indexOf("const handleSubmit = async"), read(PAGE).indexOf("/* Production's reset"));

  assert.match(submit, /if \(!result\.ok\) \{/, "the save no longer branches on the server's answer");
  assert.match(submit, /result\.error \?\?\n\s+result\.message \?\?\n\s+'Your profile could not be saved\. Please try again\.'/,
    "the failure no longer states the context's own error, or lost production's fallback");
  assert.match(submit, /setFeedback\(\{ ok: true, message: 'Your profile has been saved\.' \}\);/, "the saved message moved");
  assert.match(read(PAGE), /const timer = setTimeout\(\(\) => setFeedback\(null\), FEEDBACK_MS\);/,
    "the feedback no longer clears itself");
  assert.match(read(PAGE), /const FEEDBACK_MS = 4000;/, "the feedback lifetime is no longer production's four seconds");
});

test("the validation is production's own, message for message", () => {
  const page = read(PAGE);

  for (const [rule, message] of [
    ["!formData.firstName.trim()", "First name is required."],
    ["!formData.email.trim()", "Email address is required."],
    ["!isValidEmail(formData.email)", "Please enter a valid email format."],
    ["formData.phone.trim() && !isValidPhone(formData.phone)", "Please enter a valid 10-digit mobile number."],
  ]) {
    assert.ok(page.includes(rule), `the rule behind "${message}" is gone`);
    assert.ok(page.includes(`'${message}'`), `the message "${message}" is gone`);
  }
  assert.match(page, /if \(Object\.keys\(nextErrors\)\.length > 0\) \{\n\s+setErrors\(nextErrors\);\n\s+return;\n\s+\}/,
    "an invalid form is no longer stopped before the request");
  assert.match(page, /import \{ isValidEmail, isValidPhone \} from '\.\.\/\.\.\/\.\.\/\.\.\/utils\/validation\.js';/,
    "the port validates with something of its own");
  assert.match(page, /<form className="form pf-form" onSubmit=\{handleSubmit\} noValidate>/,
    "the form lost its own submit path or its noValidate contract");
});

test("a read that has not landed is loading, and a read that failed is named as failed", () => {
  const page = read(PAGE);

  assert.match(page, /const accountLoading = isLoading && !profile;/, "an unread account would be drawn as an empty one");
  assert.match(page, /const accountFailed = Boolean\(loadError\) && !profile;/, "a failed read would be drawn as an empty one");
  assert.match(page, /ProfileUnavailable status=\{loadErrorStatus\} message=\{loadError\}/, "the failure block is not the shared one");

  const branch = page.slice(page.indexOf("function ProfileUnavailable"));
  assert.match(branch, /const lapsed = status === 401 \|\| status === 403;/, "a lapsed session is no longer told apart");
  assert.match(branch, /lapsed \? 'Please sign in again to see your account\.' : 'We could not load your account right now\.'/,
    "the failure's own two sentences moved");
  assert.match(branch, /\{!lapsed && message \? <p>\{message\}<\/p> : null\}/, "the read's own message is no longer stated");
  assert.match(branch, /<Button to="\/signin\?returnTo=%2Faccount%2Fprofile">Sign in<\/Button>/,
    "a lapsed session lost the way back to sign-in for this screen");
  assert.equal(/onClick=/.test(branch), false, "the failure block invents an action");
  assert.equal(/Try again|onRetry/.test(code()), false, "the page invents a retry the account context does not expose");
});

test("Aarna's profile tab title is restored on unmount", () => {
  const page = read(PAGE);

  assert.match(page, /document\.title = PROFILE_TITLE;/, "the page no longer states its own tab title");
  assert.match(page, /return \(\) => \{\n\s+document\.title = previous;\n\s+\};/, "the tab title is no longer restored");
  assert.match(page, /const PROFILE_TITLE = 'Profile — PRATIKSHYA FASHION';/,
    "Aarna's profile tab title is missing");
});

/* ── 4 · the page invents nothing ──────────────────────────────────────────── */

test("the prototype's device-local account is not carried over", () => {
  const source = code();

  assert.equal(/localStorage|sessionStorage/.test(source), false, "the page reads or writes a device store");
  assert.equal(/aarna:profile/.test(source), false, "the design prototype's own profile key is used");
  assert.equal(/fetch\(|XMLHttpRequest|axios/.test(source), false, "the page calls the network itself");
  assert.equal(/useReducer\(/.test(source), false, "the page grew a store of its own");
});

test("no dead control, no stand-in, no invented address and no HTTP status shown to a customer", () => {
  const source = code();
  const markup = on.render();

  assert.equal(/href="#"|to="#"|onClick=\{\(\) => \{\}\}/.test(source), false, "the page ships an action that does nothing");
  assert.equal(/\bLorem\b|coming soon|\bTODO\b|\bFIXME\b/i.test(source), false, "the page ships a stand-in");
  assert.equal(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(source), false, "the page carries an invented address");
  assert.equal(/40[13]\b/.test(markup), false, "an HTTP status reached the customer");
  /* The identity is the account's own: the page states the profile's fields and
     the initial monogram, and invents neither a name nor a portrait. */
  assert.equal(/Guest|'Customer'|"Customer"/.test(source), false, "the page invents a display name");
});

test("every account class the page draws is styled by the port's own sheets", () => {
  const sheets = SHEETS.map(read).join("\n");
  const drawn = new Set([...read(PAGE).matchAll(/pf-account(?:__[a-z-]+)?/g)].map((match) => match[0]));

  assert.ok(drawn.size >= 4, `expected the screen's own classes, found ${drawn.size}`);
  for (const name of drawn) {
    assert.ok(new RegExp(`\\.${name}\\b`).test(sheets), `${name} is drawn by the profile page but styled by no port sheet`);
  }
});

test("the sheet's own new rules are scoped to the port and token-only", () => {
  const sheet = read(SHEET).slice(read(SHEET).indexOf("/* ── the profile screen's blocks"));
  const stripped = sheet.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.equal(/!important/.test(stripped), false, "the profile's own rules force declarations");
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(stripped), false, "the profile's own rules hard-code a colour");
  /* The same reading the shell suite takes of the whole sheet: the text before
     each brace, minus the `@media` preludes, is a selector. */
  const selectors = [];
  let cursor = 0;
  for (const brace of stripped.matchAll(/\{/g)) {
    const before = stripped.slice(cursor, brace.index);
    const selector = before.slice(before.lastIndexOf("}") + 1).split("{").pop().trim();
    cursor = brace.index;
    if (selector && !selector.startsWith("@media")) selectors.push(selector);
  }
  assert.ok(selectors.length >= 6, `expected the profile's own rules, found ${selectors.length}`);
  for (const selector of selectors) {
    assert.match(selector, /^\.pf-root /, `${selector} is not scoped to the port`);
  }
});

test("the shared frame is reused, not re-drawn: the page declares no shell of its own", () => {
  const page = read(PAGE);

  assert.match(page, /import AccountFrame from '\.\/AccountFrame\.jsx';/, "the page no longer renders inside the shared frame");
  assert.match(page, /<AccountFrame\n\s+breadcrumbItems=\{\[\{ label: 'Account', to: '\/account' \}, \{ label: 'Profile' \}\]\}/,
    "the page no longer states its own place in the family");
  assert.equal(/pf-account__nav\b/.test(page), false, "the page draws the navigation itself");
  assert.equal(/pf-account__intro|pf-account__acts/.test(page), false, "the page draws the frame's intro band itself");
  assert.match(page, /AccountFrame[\s\S]*label="Your account"[\s\S]*title="Profile"/, "the frame's own props moved");
  assert.ok(read(FRAME).includes("const heading = title ?? profile?.firstName ?? '';"), "the frame's own heading rule moved");
});

test("the visually hidden portrait input outweighs `.pf-form input` and stays anchored inside `.pf-account__portrait-meta`", () => {
  const markup = on.render();
  const upload = inputFor(markup, "profile-avatar");
  assert.ok(upload && upload.includes('class="sr-only"'), "the portrait upload input lost its `.sr-only` class");

  const profileSection = read(SHEET)
    .slice(read(SHEET).indexOf("/* ── the profile screen's blocks"), read(SHEET).indexOf("/* ── the addresses screen's register"))
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const ruleBody = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = profileSection.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    return match ? match[1] : null;
  };

  /* `.pf-account__portrait-meta` must be a positioned containing block so the
     absolutely positioned `#profile-avatar` does not anchor to the viewport. */
  const metaBody = ruleBody(".pf-root .pf-account__portrait-meta");
  assert.ok(metaBody, "the portrait meta rule is missing from `customer.account.css`");
  assert.match(metaBody, /\bposition\s*:\s*relative\s*;/, "`.pf-account__portrait-meta` no longer establishes a positioned containing block");

  /* `.pf-root .pf-form .sr-only` (0,3,0) must outweigh `.pf-root .form input`
     and `.pf-root .pf-form input` (0,2,1) so `#profile-avatar` stays a 1×1px
     zero-padding, zero-border box instead of expanding to `width: 100%`. */
  const srOnlyBody = ruleBody(".pf-root .pf-form .sr-only");
  assert.ok(srOnlyBody, "`.pf-root .pf-form .sr-only` is missing from `customer.account.css`");
  assert.match(srOnlyBody, /\bwidth\s*:\s*1px\s*;/, "`.pf-form .sr-only` no longer constrains width to 1px");
  assert.match(srOnlyBody, /\bheight\s*:\s*1px\s*;/, "`.pf-form .sr-only` no longer constrains height to 1px");
  assert.match(srOnlyBody, /\bpadding\s*:\s*0\s*;/, "`.pf-form .sr-only` no longer resets `.form input` padding");
  assert.match(srOnlyBody, /\bborder\s*:\s*0\s*;/, "`.pf-form .sr-only` no longer resets `.form input` border");
  assert.equal(/overflow-x\s*:\s*hidden/.test(read(SHEET)), false, "overflow was masked with `overflow-x: hidden` instead of fixed at the source");
});
