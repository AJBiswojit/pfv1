/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.3 — the addresses screen, on this
 * application's own account.
 *
 * The storefront-native addresses screen renders inside the shared account frame and
 * remains behind the customer guard. App.jsx delegates all customer routes to
 * the customer storefront; its staff routes remain independent.
 *
 * What these tests render is the real composition: the ported page inside this
 * application's provider stack (and the port's own UI/shop providers, exactly as
 * `CustomerStorefront` mounts them), through Vite's SSR pipeline — no component is
 * rendered in isolation and no context is faked. The session is the application's
 * own: it is opened and closed through the api client (`setTokens`/`clearTokens`),
 * never by writing a token key by hand.
 *
 *   1. THE ROUTE. `/account\/addresses` is the port's page, inside the guard,
 *      declared in the port's registry — and production's own page is still
 *      `App.jsx`'s, still lazy. With the switch off the URL is production's; a
 *      session the application has not restored yet is shown the guard.
 *   2. WHAT THE PAGE DRAWS. The frame's trail, the page's own heading, the
 *      delivery book's empty state in production's own words, the two real add
 *      actions — and, while the account read still owes an answer, the loading
 *      block instead of an empty book.
 *   3. THE ACCOUNT'S OWN OPERATIONS. Add, edit, delete and set-default all go
 *      through the context the production screen calls; the modal is the
 *      production `AddressModal` (the same component this port's checkout already
 *      reuses); a deletion is asked about first through the application's existing
 *      `ConfirmDialog`; the feedback line is the context's own message, so a
 *      request that failed can never read as one that succeeded; the default
 *      marker is the record's own `isDefault`; and the page keeps no list of its
 *      own. These run in handlers and effects, which a server render does not
 *      execute, so each one is pinned at the source level.
 *   4. THE COPY THAT IS BANNED STAYS BANNED. No device store, no API call of the
 *      page's own, no dialog of its own, no invented address, no HTTP status
 *      shown to a customer, no retry the shared context does not expose.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM in this tree, so clicks, focus order
 * and layout are out of scope — no dialog opens and no address is mutated here.
 * Effects do not run under `renderToStaticMarkup`, so the loaded list, a failed
 * read and the 401/403 branch are source-pinned; what a render alone settles — a
 * session that holds a customer token and has not been read yet (announced as
 * loading, never as an empty delivery book) and a session that owes no read — is
 * rendered here. Nothing here is an end-to-end verification of the address API.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { assertNoPrivateAccountContent } from "./accountAssertions.js";
import { parseCssRules } from "../../../../scripts/customer-port.js";
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

const PAGE = "src/components/customer/pages/account/Addresses.jsx";
const FRAME = "src/components/customer/pages/account/AccountFrame.jsx";
const NAV = "src/components/customer/pages/account/AccountNav.jsx";
const OVERVIEW = "src/components/customer/pages/account/Overview.jsx";
const PERSONAL = "src/components/customer/pages/account/Personal.jsx";
const SIDEBAR = "src/components/customer/pages/account/AccountSidebar.jsx";
const TABS = "src/components/customer/pages/account/AccountTabs.jsx";
const ORDER_FRAME = "src/components/customer/pages/account/OrderFrame.jsx";
const MOUNT = "src/components/customer/CustomerStorefront.jsx";
const PRODUCTION_APP = "src/App.jsx";
const PRODUCTION_PAGE = "src/components/customer/pages/account/Addresses.jsx";
const MODAL = "src/components/account/AddressModal.jsx";
const DIALOG = "src/components/orders/ConfirmDialog.jsx";
const SHEET = "src/components/customer/customer.account.css";
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
    { default: Addresses },
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
    load("/src/components/customer/pages/account/Addresses.jsx"),
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
    Addresses,
    render: (path = "/account\/addresses") => at(path, React.createElement(Providers, null, React.createElement(Addresses))),
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

const buttons = (markup) => [...markup.matchAll(/<button ([^>]*)>/g)].map(([, attributes]) => attributes);

/* ── 1 · the route, the switch and the guard ───────────────────────────────── */

test("`/account\/addresses` is the port's own page, inside the same guard, and the customer storefront owns the only customer route", () => {
  const mount = read(MOUNT);
  const personal = read(PERSONAL);
  assert.match(personal, /import Addresses from '\.\/Addresses\.jsx';/,
    "the Personal section does not import the port’s addresses page under its own name");
  assert.equal(/const AccountAddresses = lazy\(/.test(mount), false,
    "the production addresses page is still declared lazy in the port");
  assert.match(mount, /<Route path="account\/addresses" element=\{<Navigate to="\/account\/profile\?tab=addresses" replace \/>\} \/>/,
    "the addresses route does not redirect to its section tab");

  const guard = mount.slice(mount.indexOf("<Route element={<ProtectedRoute />}>"));
  assert.match(guard.slice(0, guard.indexOf("</Route>")),
    /<Route path="account\/addresses" element=\{<Navigate to="\/account\/profile\?tab=addresses" replace \/>\} \/>/,
    "the addresses route is outside the guard the family stands behind");

  const app = read(PRODUCTION_APP);
  const storefront = read("src/components/customer/CustomerStorefront.jsx");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/,
    "App.jsx no longer delegates customer paths to the customer storefront");
  assert.doesNotMatch(app, /pages\/account\/AccountAddresses/,
    "the outer route tree still imports an obsolete customer page");
  assert.match(storefront, /<Route path="account\/addresses"/,
    "The customer storefront no longer owns the account route");
});

test("the port's registry declares the addresses page once, and the page exists", () => {
  const registry = read(REGISTRY);
  const added = registry.slice(registry.indexOf("const ADDED = ["), registry.indexOf("];", registry.indexOf("const ADDED = [")));
  assert.equal(count(added, '"pages/account/Addresses.jsx"'), 1, "the addresses page is not declared exactly once in the registry");
  assert.ok(existsSync(join(ROOT, PAGE)), "the declared page does not exist");
});

test("with the switch off, the URL is production's — nothing of this page mounts", () => {
  const markup = off.renderLayout("/account\/addresses");
  assertNoPrivateAccountContent(markup, "the Atelier storefront mounted the port's account chrome");
  assert.equal(/Delivery book/.test(markup), false, "the Atelier storefront rendered the port's addresses screen");
  assert.equal(/Your saved/.test(markup), false, "the Atelier storefront rendered the port's addresses heading");
});

test("a session the application has not restored yet is shown the guard, not the addresses screen", () => {
  const { setTokens, clearTokens } = on.api;
  globalThis.localStorage = localStorageStub;
  try {
    setTokens({ accessToken: "pf-phase23-addresses", refreshToken: "pf-phase23-refresh" }, "customer");
    const markup = on.renderLayout("/account\/addresses");

    assert.match(markup, /Verifying atelier access/, "a guarded URL painted past the guard");
    assertNoPrivateAccountContent(markup, "the guard painted account chrome for an unrestored session");
    assert.equal(/Delivery book/.test(markup), false, "the addresses screen painted for an unrestored session");
  } finally {
    clearTokens("customer");
    delete globalThis.localStorage;
  }
});

/* ── 2 · what the page draws, and from where ───────────────────────────────── */

test("a settled account with no addresses states the delivery book in production's own words", () => {
  const markup = on.render();

  assert.match(markup, /class="info container account pf-account"/, "the page is not drawn inside the design's page frame");
  assert.match(markup, /class="info__lead pf-account__lead"/, "the screen lost its lead");
  assert.match(markup, /class="display shop__title">Your saved <em>addresses<\/em><\/h2>/, "the screen's own heading is gone");
  assert.match(markup, /Delivery book/, "the screen's own eyebrow is gone");
  assert.match(markup, /class="empty"/, "an empty delivery book is not the design's empty block");
  assert.match(markup, /No saved addresses yet\./, "production's own empty sentence is gone");
  assert.match(markup, /Add Your First Address<\/span>/, "the empty state lost its own action");
  assert.match(markup, /Add New Address<\/span>/, "the head lost its add action");
  assert.equal(/pf-account__addresses/.test(markup), false, "an empty book drew a list");
  assert.equal(/pf-account__address/.test(markup), false, "an empty book drew a card");
  assert.equal(/aria-busy/.test(markup), false, "a settled session announced itself as loading");
  assert.equal(/could not load your account/.test(markup), false, "a settled session drew the failure block");
});

test("the page's own actions are real buttons, and both dialogs stay closed", () => {
  const markup = on.render();

  assert.equal(count(markup, "Add New Address"), 1, "the add action is drawn more than once");
  assert.equal(count(markup, "Add Your First Address"), 1, "the empty state's action is drawn more than once");
  for (const attributes of buttons(markup)) {
    assert.ok(attributes.includes('type="button"'), `a control without an explicit button type was drawn (${attributes})`);
  }
  /* Nothing is open: neither the production modal nor the confirmation dialog. */
  assert.equal(/role="dialog"|role="alertdialog"|aria-modal/.test(markup), false, "a dialog was open on a settled page");
  assert.equal(/Remove Address|Keep Address/.test(markup), false, "the removal dialog was drawn without being asked for");
});

test("the frame's trail, the page's own title and the account's navigation are the shared ones", () => {
  const markup = on.render();

  assert.match(markup, /aria-label="Breadcrumb"/, "the trail is gone");
  assert.match(markup, /aria-current="page">Saved Addresses<\/span>/, "the trail does not end on this screen");
  assert.match(markup, /class="display pf-account__name">Saved Addresses<\/h1>/, "the screen's own title is gone");
  assert.match(markup, /class="label">Your account<\/p>/, "the account's own eyebrow is gone");
  assert.match(markup, /class="pf-account__nav"/, "the shared navigation is gone");
  assert.match(markup, /href="\/account"/, "the way back to the account is gone");
});

test("a session that holds a customer token and has not been read yet is loading — never an empty delivery book", () => {
  const { setTokens, clearTokens } = on.api;
  globalThis.localStorage = localStorageStub;
  try {
    setTokens({ accessToken: "pf-phase23-unread", refreshToken: "pf-phase23-refresh" }, "customer");
    const waiting = on.render();

    assert.match(waiting, /aria-busy="true"/, "a session that owes a read is not announced as busy");
    assert.match(waiting, /aria-label="Loading your addresses"/, "the address read is not announced");
    assert.match(waiting, /Gathering your addresses/, "the address read has no waiting sentence");
    assert.equal(/No saved addresses yet\./.test(waiting), false, "a session that owes a read was told it has no addresses");
    assert.equal(/could not load your account/.test(waiting), false, "a session that owes a read was told the read failed");
    assert.equal(/pf-account__address/.test(waiting), false, "a session that owes a read was drawn addresses");
    /* The page's own furniture stays: only the book itself waits. */
    assert.match(waiting, /Delivery book/, "the waiting screen lost its own eyebrow");
    assert.match(waiting, /Add New Address<\/span>/, "the waiting screen lost its add action");
  } finally {
    clearTokens("customer");
    delete globalThis.localStorage;
  }
});

test("every destination the page renders is a route this application registers", () => {
  const markup = on.render();
  const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map(([, href]) => href);

  assert.ok(hrefs.length > 0, "the page renders no destination at all");
  for (const href of hrefs) {
    assert.equal(on.routes.isRegisteredPath(bare(href)), true, `${href} resolves to no route this application registers`);
  }

  const literals = [...read(PAGE).matchAll(/to="([^"]+)"/g)].map(([, to]) => to);
  assert.ok(literals.length > 0, "the page declares no destination of its own");
  for (const to of literals) {
    assert.equal(on.routes.isRegisteredPath(bare(to)), true, `${to} resolves to no route this application registers`);
  }
});

/* ── 3 · the account's own operations ──────────────────────────────────────── */

test("every operation goes through the account context the production screen calls", () => {
  const page = read(PAGE);

  assert.match(page, /addresses,\n\s+addAddress,\n\s+updateAddress,\n\s+deleteAddress,\n\s+setDefaultAddress,\n\s+isLoading,\n\s+loadError,\n\s+loadErrorStatus,\n\s+\} = useAccount\(\);/,
    "the page no longer reads the account context's own operations");
  assert.equal(/fetch\(|axios|apiClient|apiAddAddress|apiDeleteAddress|apiSetDefaultAddress/.test(page), false,
    "the page reaches an API directly");
  assert.equal(/setAddresses|setDefaultAddress\(\[/.test(page.replace(/const \{[\s\S]*?\} = useAccount\(\);/, "")), false,
    "the page keeps a list of its own");
  assert.equal(/defaultAddress/.test(code()), false, "the page guesses the default from somewhere other than the record's own flag");
});

test("adding and editing are production's own: the same modal, the same payload, the same answer", () => {
  const page = read(PAGE);

  assert.match(page, /import AddressModal from '\.\.\/\.\.\/\.\.\/\.\.\/components\/account\/AddressModal\.jsx';/,
    "the address form is no longer the production modal");
  assert.equal(/INDIAN_STATES|isValidPincode|isValidPhone|role="dialog"/.test(page), false,
    "the page re-implements the production modal");
  assert.ok(read(MODAL).includes('if (!isOpen) return null;'), "the production modal no longer closes on its own flag");

  const save = page.slice(page.indexOf("const handleSave = async"), page.indexOf("const handleConfirmRemoval"));
  assert.match(save, /setIsSaving\(true\);/, "the save is no longer announced as running");
  assert.match(save, /const result = editingAddress\?\.id\n\s+\? await updateAddress\(editingAddress\.id, addressData\)\n\s+: await addAddress\(addressData\);/,
    "an edit no longer updates the record it opened, or a new address no longer goes through addAddress");
  assert.match(save, /setIsSaving\(false\);/, "the save is no longer closed out");
  assert.match(save, /setFeedback\(\{ ok: result\.ok, message: result\.message \}\);/, "the feedback is no longer the context's own answer");
  assert.match(save, /if \(result\.ok\) setModalOpen\(false\);/, "the modal closes on something other than the server's answer");

  const modal = page.slice(page.indexOf("<AddressModal"));
  for (const prop of [
    "isOpen={modalOpen}",
    "onClose={() => setModalOpen(false)}",
    "onSave={handleSave}",
    "initialAddress={editingAddress}",
    "isSaving={isSaving}",
  ]) {
    assert.ok(modal.includes(prop), `the modal lost ${prop}`);
  }
  /* Production's own wiring, verbatim: the same props in the same order. */
  assert.ok(read(PRODUCTION_PAGE).includes("initialAddress={editingAddress}"), "production's own modal wiring moved");
});

test("a deletion is asked about first, through the application's existing confirmation dialog", () => {
  const page = read(PAGE);

  assert.match(page, /import ConfirmDialog from '\.\.\/\.\.\/\.\.\/\.\.\/components\/orders\/ConfirmDialog\.jsx';/,
    "the confirmation is no longer the application's own dialog");
  assert.equal(read(DIALOG).includes('role="alertdialog"'), true, "the shared dialog is no longer an accessible dialog");
  assert.equal(read(DIALOG).includes('aria-modal="true"'), true, "the shared dialog no longer claims modality");
  assert.equal(read(DIALOG).includes("createPortal("), true, "the shared dialog is no longer the application's own portal");
  assert.equal(read(DIALOG).includes("if (!isOpen || typeof document === \"undefined\") return null;"), true,
    "the shared dialog no longer renders nothing while it is closed");
  assert.equal(/role="alertdialog"|createPortal/.test(page), false, "the page ships a dialog of its own");

  /* The card's Delete only ASKS; nothing is removed until the dialog answers. */
  assert.match(page, /onClick=\{\(\) => setPendingRemoval\(address\)\}/, "the delete action no longer asks first");
  assert.equal(/onClick=\{\(\) => handleDelete\(address\.id\)\}/.test(page), false, "the delete action removes on the single click");
  const confirm = page.slice(page.indexOf("const handleConfirmRemoval = async"), page.indexOf("const handleSetDefault"));
  assert.match(confirm, /const address = pendingRemoval;\n\s+setPendingRemoval\(null\);\n\s+if \(!address\) return;/, "the dialog's answer is not what the removal waits on");
  assert.match(confirm, /const result = await deleteAddress\(address\.id\);/, "the removal no longer goes through the context");
  assert.match(confirm, /setFeedback\(\{ ok: result\.ok, message: result\.message \}\);/, "the removal's feedback is no longer the context's own answer");

  const dialog = page.slice(page.indexOf("<ConfirmDialog"));
  for (const prop of ["title=", "description=", "confirmLabel=\"Remove Address\"", "cancelLabel=\"Keep Address\"", "onConfirm={handleConfirmRemoval}", "onCancel={() => setPendingRemoval(null)}"]) {
    assert.ok(dialog.includes(prop), `the confirmation dialog lost ${prop}`);
  }
  assert.match(dialog, /isOpen=\{Boolean\(pendingRemoval\)\}/, "the dialog is no longer opened by the address it asks about");

  /* The customer storefront deliberately requires confirmation before invoking the shared delete action. */
  assert.match(page, /handleConfirmRemoval/);
  assert.match(page, /onConfirm=\{handleConfirmRemoval\}/);
});

test("the default address changes only through the explicit action, and never optimistically", () => {
  const page = read(PAGE);

  assert.match(page, /const result = await setDefaultAddress\(id\);/, "setting the default no longer goes through the context");
  assert.match(page, /setFeedback\(\{ ok: result\.ok, message: result\.message \}\);/, "setting the default reports something of its own");
  assert.match(page, /address\.isDefault \? null : \(/, "the explicit action is no longer offered only while it is not the default");
  assert.match(page, /onClick=\{\(\) => handleSetDefault\(address\.id\)\}/, "the default action is no longer wired to the record");
  /* Nothing happens before the context answers: no local list is touched. */
  assert.match(page, /const handleSetDefault = async \(id\) => \{\n\s+const result = await setDefaultAddress\(id\);\n\s+setFeedback\(/,
    "the default is applied before the server answered");
  /* The marker is the record's own flag, as the server returned it. */
  assert.match(page, /address\.isDefault \? 'pf-account__address is-default' : 'pf-account__address'/,
    "the default card is no longer the record the server returned");
  assert.match(page, /Default Address/, "production's own default marker is gone");
});

test("the loaded book draws production's own fields, and an unresolvable one is invented no further than it has to be", () => {
  const page = read(PAGE);

  for (const field of [
    "{address.fullName}",
    "{address.addressLine}",
    "{address.city}, {address.state} — {address.pincode}",
    "<p className=\"pf-account__address-line\">Landmark: {address.landmark}</p>",
    "<p className=\"pf-account__address-line\">Phone: {address.phone}</p>",
    "<span className=\"pf-chip\">{address.type}</span>",
  ]) {
    assert.ok(page.includes(field), `the card lost ${field}`);
  }
  /* The record's own type, or nothing — never a type the record does not carry. */
  assert.match(page, /\{address\.type \? <span className="pf-chip">\{address\.type\}<\/span> : null\}/,
    "the card invents a type for a record that carries none");
  assert.match(page, /\{address\.landmark \? \(/, "the landmark line is drawn even when the record has none");
  assert.match(page, /key=\{address\.id\}/, "the list is keyed by something other than the record's own id");

  /* And the same record fields as the production card reads — nothing added,
     nothing dropped: a field the server sends is never silently lost. */
  const fieldsOf = (text, object) => {
    const pattern = new RegExp("\\b" + object + "\\??\\.([A-Za-z_][A-Za-z0-9_]*)", "g");
    return [...new Set([...text.matchAll(pattern)].map((match) => match[1]))].sort();
  };
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.deepEqual(fieldsOf(strip(page), "address"), fieldsOf(strip(read(PRODUCTION_PAGE)), "address"),
    "the port's card reads a different record than production's card reads");
  /* Production's own three actions, on the card the record belongs to. */
  const acts = page.slice(page.indexOf('<div className="pf-account__address-acts">'));
  const actions = acts.slice(0, acts.indexOf("</div>"));
  for (const action of ["Edit", "Delete", "Set as Default"]) {
    assert.match(actions, new RegExp(`>\\s*${action}\\s*<`), `the card lost its ${action} action`);
  }
});

test("a read that has not landed is loading, and a read that failed is named as failed", () => {
  const page = read(PAGE);

  assert.match(page, /const accountLoading = isLoading && !addresses\.length;/, "an unread book would be drawn as an empty one");
  assert.match(page, /const accountFailed = Boolean\(loadError\) && !addresses\.length;/, "a failed read would be drawn as an empty book");
  assert.match(page, /AddressesUnavailable status=\{loadErrorStatus\} message=\{loadError\}/, "the failure block is not the shared one");

  const branch = page.slice(page.indexOf("function AddressesUnavailable"));
  assert.match(branch, /const lapsed = status === 401 \|\| status === 403;/, "a lapsed session is no longer told apart");
  assert.match(branch, /lapsed \? 'Please sign in again to see your account\.' : 'We could not load your account right now\.'/,
    "the failure's own two sentences moved");
  assert.match(branch, /\{!lapsed && message \? <p>\{message\}<\/p> : null\}/, "the read's own message is no longer stated");
  assert.match(branch, /<Button to="\/signin\?returnTo=%2Faccount%2Faddresses">Sign in<\/Button>/,
    "a lapsed session lost the way back to sign-in for this screen");
  assert.equal(/onClick=/.test(branch), false, "the failure block invents an action");
  assert.equal(/Try again|onRetry|refreshAddresses/.test(code()), false,
    "the page invents a retry the account context does not expose");
});

test("the feedback is the context's own message, clears itself, and is stated once", () => {
  const page = read(PAGE);

  assert.match(page, /const timer = setTimeout\(\(\) => setFeedback\(null\), FEEDBACK_MS\);/,
    "the feedback no longer clears itself");
  assert.match(page, /const FEEDBACK_MS = 3500;/, "the feedback lifetime is no longer production's three and a half seconds");
  assert.match(page, /className=\{feedback\.ok \? 'form__note' : 'form__err pf-alert'\} role="status"/,
    "the feedback lost its own two registers or its announcement");
  assert.equal(count(page, "role=\"status\""), 1, "more than one thing on the page announces itself");
  /* Every feedback site takes the message from an answer — never from the page. */
  assert.equal(/setFeedback\(\{ ok: true/.test(page), false, "the page states a success of its own");
  assert.match(page, /setFeedback\(\{ ok: result\.ok, message: result\.message \}\);/, "the feedback is not the context's answer");
});

test("The customer storefront's tab title is restored on unmount", () => {
  const page = read(PAGE);

  assert.match(page, /document\.title = ADDRESSES_TITLE;/, "the page no longer states its own tab title");
  assert.match(page, /return \(\) => \{\n\s+document\.title = previous;\n\s+\};/, "the tab title is no longer restored");
  assert.match(page, /const ADDRESSES_TITLE = 'Addresses — PRATIKSHYA FASHION';/,
    "The customer storefront's accessible tab title is missing");
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
  assert.equal(/Guest|'Customer'|"Customer"/.test(source), false, "the page invents a display name");
  /* No address is fabricated anywhere in the page's own strings. */
  assert.equal(/\b\d{6}\b/.test(source), false, "the page carries a PIN code of its own");
  assert.equal(/\bBangalore|Bengaluru|Karnataka\b/.test(source), false, "the page carries an address of its own");
});

test("every account class the page draws is styled by the port's own sheets", () => {
  const sheets = SHEETS.map(read).join("\n");
  const drawn = new Set([...read(PAGE).matchAll(/pf-account(?:__[a-z-]+)?/g)].map((match) => match[0]));

  assert.ok(drawn.size >= 6, `expected the screen's own classes, found ${drawn.size}`);
  for (const name of drawn) {
    assert.ok(new RegExp(`\\.${name}\\b`).test(sheets), `${name} is drawn by the addresses page but styled by no port sheet`);
  }
});

test("the sheet's own addresses rules are scoped to the port, token-only and drawn by this page", () => {
  const sheet = read(SHEET);
  const section = sheet.slice(sheet.indexOf("/* ── the addresses screen's register"));
  const stripped = section.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.equal(/!important/.test(stripped), false, "the addresses' own rules force declarations");
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(stripped), false, "the addresses' own rules hard-code a colour");

  const selectors = [];
  let cursor = 0;
  for (const brace of stripped.matchAll(/\{/g)) {
    const before = stripped.slice(cursor, brace.index);
    const selector = before.slice(before.lastIndexOf("}") + 1).split("{").pop().trim();
    cursor = brace.index;
    if (selector && !selector.startsWith("@media")) selectors.push(selector);
  }
  assert.ok(selectors.length >= 6, `expected the book's own rules, found ${selectors.length}`);

  const page = read(PAGE);
  /* No dead selector: the book's rules are drawn by this page, and the shared
     rules they sit beside in the same slice — the sidebar frame, the tab strip,
     the guest-order branch's action band and the overview's blocks — are drawn by the
     components that own them. */
  const drawn = new Set(
    [FRAME, NAV, SIDEBAR, TABS, ORDER_FRAME, OVERVIEW, PAGE]
      .flatMap((file) => [...read(file).matchAll(/pf-account(?:__[a-z-]+)?/g)])
      .map((match) => match[0]),
  );
  for (const selector of selectors) {
    assert.match(selector, /^\.pf-root /, `${selector} is not scoped to the port`);
    for (const [, name] of selector.matchAll(/\.(pf-account(?:__[a-z-]+)?)\b/g)) {
      assert.ok(drawn.has(name), `${name} is styled by the book's register but no account component draws it`);
    }
  }
  /* The classes this stage introduced for the book are this page's own. */
  for (const name of ["pf-account__addresses", "pf-account__address", "pf-account__address-top", "pf-account__address-name", "pf-account__address-line", "pf-account__address-acts", "pf-account__badge"]) {
    assert.ok(page.includes(name), `${name} is styled by this stage but this page never draws it`);
  }
  /* Safe auto-fit replaces the old fixed breakpoint: one readable card per
     phone row, expanding only when another 280px card actually fits. */
  const book = parseCssRules(sheet).find((rule) => rule.selector === ".pf-root .pf-account__addresses" && rule.conditions.length === 0);
  const grid = book?.declarations.match(/grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, (\d+)px\), 1fr\)\);/);
  assert.ok(grid, "the address book must use a bounded auto-fit grid");
  const minimum = Number(grid[1]);
  assert.equal(minimum, 280);
  for (const width of [360, 390]) {
    assert.equal(Math.floor((width - 32 + 12) / (minimum + 12)), 1, `${width}px must show one readable address per row`);
  }
});

test("the shared frame is reused, not re-drawn: the page declares no shell of its own", () => {
  const page = read(PAGE);

  assert.match(page, /import AccountFrame from '\.\/AccountFrame\.jsx';/, "the page no longer renders inside the shared frame");
  assert.match(page, /breadcrumbItems=\{\[\{ label: 'Account', to: '\/account' \}, \{ label: 'Saved Addresses' \}\]\}/,
    "the page no longer states its own place in the family");
  assert.equal(/pf-account__nav\b/.test(page), false, "the page draws the navigation itself");
  assert.equal(/pf-account__intro|pf-account__acts/.test(page), false, "the page draws the frame's intro band itself");
  assert.match(page, /label="Your account"[\s\S]*title="Saved Addresses"/, "the frame's own props moved");
});
