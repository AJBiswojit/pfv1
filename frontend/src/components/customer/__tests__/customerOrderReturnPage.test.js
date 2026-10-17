/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — the return request, on this
 * application's own return API.
 *
 * `/account/orders/:orderId/return` is the port's own page since this stage and,
 * like its production twin, it stays UNGUARDED: a guest who placed an order can
 * request a return for it. `pages/account/OrderReturn.jsx` creates the return the
 * production screen creates:
 *
 *   1. THE READ. The order is the ownership-checked context read; loading wins
 *      over every other state, a failure keeps its own status, and an id that is
 *      missing or not the customer's is one not-found state.
 *   2. THE GATE. Eligibility is the backend's own rule, mirrored — never a policy
 *      this UI invents. Inside it, the form asks exactly what the backend
 *      accepts; outside it, the page explains why with the application's own
 *      reason, or shows the return that already exists.
 *   3. THE WRITE. The request is the real `createReturn` call with production's
 *      own payload, the server's rejection is surfaced verbatim, and only a
 *      recorded return reaches the confirmation — which renders the SERVER's
 *      record, not one built here.
 *   4. THE FIGURES. The indicative refund is `unitPrice × quantity` for the
 *      selected lines, labelled indicative, with the atelier's inspected figure
 *      named as the authoritative one.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM here, so no click, keystroke or focus
 * order is exercised, and `renderToStaticMarkup` runs no effect — so the read,
 * the form submission and the confirmation state are pinned at the source level,
 * while the states a render reaches (the read in flight and the guest surface)
 * are rendered. No backend is claimed anywhere in this file.
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

const PAGE = "src/components/customer/pages/account/OrderReturn.jsx";
const PRODUCTION_PAGE = "src/components/customer/pages/account/OrderReturn.jsx";
const CONFIG = "src/config/orderConfig.js";
const MOUNT = "src/components/customer/CustomerStorefront.jsx";

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
    { default: OrderReturn },
    orderConfig,
    routes,
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    { UIProvider },
    { ShopProvider },
  ] = await Promise.all([
    load("/src/components/customer/pages/account/OrderReturn.jsx"),
    load("/src/config/orderConfig.js"),
    load("/src/components/customer/router/routes.js"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/components/customer/state/UIContext.jsx"),
    load("/src/components/customer/state/ShopContext.jsx"),
  ]);

  const Providers = ({ children }) => {
    let tree = children;
    for (const Provider of [ShopProvider, UIProvider]) tree = React.createElement(Provider, null, tree);
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

  return {
    vite,
    orderConfig,
    routes,
    render: (path) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, React.createElement(Providers, null, React.createElement(OrderReturn))),
        ),
      ),
  };
}

let app = null;

before(async () => {
  app = await mount();
});

after(async () => {
  await app?.vite.close();
  delete globalThis.window;
});

/* ── helpers ───────────────────────────────────────────────────────────────── */

const anchors = (markup) =>
  [...markup.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({
    href: (attributes.match(/href="([^"]*)"/) ?? [])[1] ?? null,
    inner,
  }));
const hrefs = (markup) => anchors(markup).map((anchor) => anchor.href);

const source = () => read(PAGE);
const code = () => source().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1 · the route and the read ────────────────────────────────────────────── */

test("The customer storefront's return screen remains available for guest orders", () => {
  const mountFile = read(MOUNT);

  assert.match(mountFile, /import AccountOrderReturnPage from "\.\/pages\/account\/OrderReturn\.jsx";/, "the port's return screen is not imported by the mount");
  assert.match(mountFile, /<Route path="account\/orders\/:orderId\/return" element=\{<AccountOrderReturnPage \/>\} \/>/, "the return route no longer renders the port's page");
  /* Production still owns the screen, and App.jsx still declares the path
     OUTSIDE the guard — a guest order has to be returnable. */
  const appFile = read("src/App.jsx");
  const storefront = read("src/components/customer/CustomerStorefront.jsx");
  assert.match(appFile, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/, "App no longer delegates customer paths to the customer storefront");
  assert.match(storefront, /<Route path="account\/orders\/:orderId\/return" element=\{<AccountOrderReturnPage \/>\} \/>/, "The customer storefront no longer declares the return route");
  const guardOpen = storefront.indexOf("<Route element={<ProtectedRoute />}>");
  const guardClose = storefront.indexOf("</Route>", guardOpen);
  const returnAt = storefront.indexOf('<Route path="account/orders/:orderId/return"');
  assert.ok(returnAt > guardClose || returnAt < guardOpen, "the return screen was placed behind the account guard");
  assert.match(read(PRODUCTION_PAGE), /useOrder\(\)/, "the production screen no longer reads the order context");
});

test("the order is read as the customer's own, and loading wins over every other state", () => {
  const page = code();

  assert.match(page, /const \{ fetchOrder, createReturn \} = useOrder\(\);/, "the page stopped reading the order context");
  assert.match(page, /fetchOrder\(orderId\)\.then\(\(result\) => \{/, "the order is no longer read through the context's accessor");
  assert.match(page, /setLoadError\(\{ status: result\.status, message: result\.error \}\);/, "a failed read no longer keeps its own status");
  const loadingAt = page.indexOf("if (loading) {");
  const problemAt = page.indexOf("if (loadError || !order) {");
  const formAt = page.indexOf("const orderRef = order.orderNumber ?? order.id;");
  assert.ok(loadingAt !== -1 && problemAt !== -1 && formAt !== -1, "the state precedence moved");
  assert.ok(loadingAt < problemAt && problemAt < formAt, "the precedence no longer reads loading → failure → form");
  assert.match(page, /status=\{loadError\?\.status \?\? 404\}/, "the failure no longer states its own status");
  assert.match(page, /onRetry=\{reload\}/, "the failure lost its retry");
  assert.match(page, /\}, \[orderId, fetchOrder, reloadToken\]\);/, "the read no longer follows the id or the retry");
});

/* ── 2 · the gate ──────────────────────────────────────────────────────────── */

test("the form is offered only inside the backend's own eligibility rule", () => {
  const page = code();

  assert.match(page, /if \(!canRequestReturnNow\(order\)\) \{/, "the page no longer gates the form on the application's own rule");
  assert.match(page, /const existing = latestReturn\(order\);/, "the existing return is no longer resolved by the application's own helper");
  /* Blocked with a return already recorded: the return's own record is shown. */
  assert.match(page, /if \(existing\) \{/, "a recorded return is no longer shown once the form is closed");
  assert.match(page, /<ReturnCard record=\{existing\} order=\{order\} className="pf-account__section" \/>/, "the existing return is no longer rendered from its own record");
  /* Blocked with nothing recorded: the application's own reason, and the ways on. */
  assert.match(page, /<p>\{returnBlockedReason\(order\)\}<\/p>/, "the blocked state no longer states the application's own reason");
  assert.match(page, /This order can&rsquo;t be returned\./, "the blocked state lost its own words");
  /* No exchange anywhere: the backend stores exactly two collection methods and
     resolves a return as a refund. */
  for (const invented of ["Exchange", "Replacement", "Store Credit", "RETURN_RESOLUTIONS"]) {
    assert.equal(page.includes(invented), false, `the page offers something the backend does not have: ${invented}`);
  }
  assert.equal(app.orderConfig.RETURN_PICKUP_METHODS.length, 2, "the backend's collection methods changed");
});

test("the form asks exactly what the backend accepts, per line", () => {
  const page = code();

  /* Only what the backend says remains returnable can be selected. */
  assert.match(page, /alreadyRequested: \(item\.returnableQuantity \?\? 0\) === 0,/, "a fully returned line is no longer excluded");
  assert.match(page, /<span className="pf-account__option-state">Already returned<\/span>/, "a fully returned line no longer says so");
  assert.match(page, /const clamped = Math\.max\(1, Math\.min\(item\.returnableQuantity, Number\(quantity\) \|\| 1\)\);/, "the per-line quantity is no longer clamped to what remains");
  assert.match(page, /length: item\.returnableQuantity \}/, "the quantity options no longer follow the backend's remainder");
  assert.match(page, /\{checked && item\.returnableQuantity > 1 \? \(/, "the quantity control is offered where there is one option");
  /* The two lists are the application's own. */
  assert.match(page, /\{RETURN_REASONS\.map\(\(entry\) => \{/, "the reasons are no longer the application's own list");
  assert.match(page, /\{RETURN_PICKUP_METHODS\.map\(\(entry\) => \{/, "the collection methods are no longer the application's own list");
  assert.match(page, /role="radiogroup" aria-label="Reason for the return"/, "the reason group lost its own name");
  assert.match(page, /role="radiogroup" aria-label="Collection method"/, "the collection group lost its own name");
  /* The optional note is the one the backend's payload carries. */
  assert.match(page, /<textarea\n\s+id="return-note"\n\s+rows=\{4\}\n\s+maxLength=\{500\}/, "the note field moved");
  /* The policy line and the window are the application's own words, and the
     window is only stated when a real one was recorded. */
  assert.match(page, /\{RETURN_POLICY_SUMMARY\}/, "the policy summary is no longer the application's own");
  assert.match(page, /\{windowState\.known \? \(/, "the window is stated without one being recorded");
  assert.equal(app.orderConfig.RETURN_REASONS.every((entry) => typeof entry.id === "string" && typeof entry.label === "string"), true, "the reason list changed shape");
});

test("the return form states each validation message and stops before submission", () => {
  const page = source();

  const messages = [
    "Choose at least one piece to return.",
    "Let us know why you are returning these pieces.",
    "Your return request could not be submitted.",
  ];
  for (const message of messages) {
    assert.ok(page.includes(`'${message}'`), `The customer storefront no longer states its validation message: ${message}`);
  }

  const code_ = code();
  assert.match(code_, /if \(selected\.size === 0\) nextErrors\.items = 'Choose at least one piece to return\.';/, "the items check moved");
  assert.match(code_, /if \(!reason\) nextErrors\.reason = 'Let us know why you are returning these pieces\.';/, "the reason check moved");
  assert.match(code_, /if \(Object\.keys\(nextErrors\)\.length > 0\) \{\n\s+setErrors\(nextErrors\);\n\s+return;/, "a failed check no longer stops the submission");
  /* A failed check's alert says what is missing, not what the server said. */
  assert.match(code_, /\{errors\.form \?\? 'Please complete your return request before submitting it\.'\}/, "the form-level alert lost its own words");
  assert.match(code_, /className="form__err pf-alert" role="alert"/, "the form-level alert lost its register");
  /* Each check clears as soon as the field is set. */
  assert.match(code_, /setErrors\(\(current\) => \(\{ \.\.\.current, items: '' \}\)\);/, "the items error no longer clears");
  assert.match(code_, /setErrors\(\(current\) => \(\{ \.\.\.current, reason: '' \}\)\);/, "the reason error no longer clears");
});

/* ── 3 · the write ─────────────────────────────────────────────────────────── */

test("the request is the real one, and only the server's answer decides", () => {
  const page = code();

  assert.match(page, /const result = await createReturn\(\{\n\s+orderId: order\.id,/, "the return no longer goes through the context's own call");
  assert.match(page, /items: \[\.\.\.selected\.entries\(\)\]\.map\(\(\[lineId, quantity\]\) => \(\{ lineId, quantity, reason \}\)\),/, "the payload no longer carries the selected lines and their reason");
  assert.match(page, /pickupMethod,\n\s+note,\n\s+\}\);/, "the payload no longer carries the collection method and the note");
  /* Production sends the same shape; the context is the one that trims it to the
     fields the API accepts. */
  const production = read(PRODUCTION_PAGE);
  assert.ok(production.includes("[...selected.entries()].map(([lineId, quantity]) => ({"), "production's payload moved");
  assert.ok(production.includes("pickupMethod,"), "production's payload moved");
  assert.equal(
    /noteToApi|include the note/.test(page),
    false,
    "the port added request-shaping the application does not do",
  );

  /* A rejection is surfaced verbatim and confirms nothing. */
  assert.match(page, /if \(!result\.ok\) \{/, "a rejection no longer stops the flow");
  assert.match(page, /setErrors\(\{ form: result\.message \?\? 'Your return request could not be submitted\.' \}\);/, "a rejection no longer carries the server's own reason");
  assert.equal(
    /setSubmitted\(result\.record\);\n\s+setSubmitted/.test(page),
    false,
    "the confirmation is written twice",
  );
  /* The button is a real submit button — the shared button passes `type` through. */
  assert.match(page, /<Button type="submit" disabled=\{submitting\}>/, "the submission is no longer a real submit button");
  assert.match(page, /\{submitting \? 'Submitting…' : 'Submit Return Request'\}/, "the submit label moved");
  assert.match(read("src/components/customer/components/ui/Button.jsx"), /<button type="button" className=\{cls\} \{\.\.\.rest\}>/, "the shared button no longer lets a caller choose the button's type");
  assert.match(page, /if \(submitting\) return;/, "the form can be submitted twice while in flight");
  assert.match(page, /<form onSubmit=\{handleSubmit\} noValidate className="pf-account__section">/, "the form lost its own submit wiring");
});

test("the confirmation is the record the server returned, announced and focused", () => {
  const page = code();

  assert.match(page, /setSubmitted\(result\.record\);/, "the confirmation is no longer the server's record");
  assert.match(page, /if \(submitted\) \{/, "the confirmation state moved");
  assert.match(page, /<ReturnCard record=\{submitted\} order=\{order\} className="pf-account__section" \/>/, "the confirmation is no longer rendered from the record");
  assert.match(page, /reload\(\);\n\s+\};/, "the order is no longer refreshed after a recorded return");
  assert.match(page, /<div ref=\{confirmationRef\} tabIndex=\{-1\} role="status" aria-live="polite">/, "the confirmation is no longer announced");
  assert.match(page, /if \(submitted\) confirmationRef\.current\?\.focus\(\);/, "the confirmation no longer receives focus");
  assert.match(page, /We have your <em>request\.<\/em>/, "the confirmation lost its own heading");
  /* Ways on are real destinations. */
  assert.match(page, /<Button to=\{`\/account\/orders\/\$\{order\.id\}`\}>Back to Order<\/Button>/, "the way back to the order moved");
  for (const href of hrefs(app.render("/account/orders/PF-24-1001/return"))) {
    if (!href) continue;
    assert.ok(app.routes.isRegisteredPath(href), `${href} is not a route this application registers`);
  }
});

/* ── 4 · the figures, and nothing invented ─────────────────────────────────── */

test("the refund shown is the selected lines' own arithmetic, and it is labelled indicative", () => {
  const page = code();

  assert.match(page, /const indicativeRefund = selectedLines\.reduce\(/, "the indicative refund moved");
  assert.match(page, /\(total, item\) => total \+ item\.unitPrice \* \(selected\.get\(item\.lineId\) \?\? 0\),/, "the indicative refund no longer multiplies the recorded unit price by the chosen quantity");
  assert.match(page, /<dd className="pf-meta__strong">\{formatINR\(indicativeRefund\)\}<\/dd>/, "the indicative figure left the summary");
  assert.match(page, /Indicative refund/, "the figure is no longer labelled indicative");
  assert.match(page, /The final refund is confirmed by the atelier once your\n\s+return is received and inspected\./, "the page no longer says who decides the real figure");
  assert.match(page, /refundMethodLabel\(order\)/, "the refund method is no longer the application's own label");
  assert.match(page, /<dd>\{RETURN_RESOLUTION\.label\}<\/dd>/, "the resolution is no longer the application's own");
  /* No refund status, no policy of this page's own, no invented reason list. */
  for (const banned of ["Refund Initiated", "Refunded", "7-day", "30-day", "window closes in", "policy: "]) {
    assert.equal(page.includes(banned), false, `the page states something the backend does not: ${banned}`);
  }
  assert.match(page, /const windowState = returnWindow\(order\);/, "the window is no longer read from the application's own rule");
});

test("the page renders the read in flight for its guests, and calls nothing of its own", () => {
  const markup = app.render("/account/orders/PF-24-1001/return");

  assert.ok(markup.includes("Loading your order"), "the read in flight is not stated");
  assert.match(markup, /class="empty" aria-busy="true"/, "the loading state lost its own register");
  assert.equal(/pf-account__nav/.test(markup), false, "account navigation was drawn for a session with no customer");
  assert.ok(hrefs(markup).includes("/signin?returnTo=%2Faccount%2Forders"), "a guest lost the way to keep the order");

  const page = code();
  for (const banned of ["localStorage", "sessionStorage", "fetch(", "axios", "apiGet", "apiPost", "setInterval"]) {
    assert.equal(page.includes(banned), false, `the page reaches for ${banned}`);
  }
  assert.equal(/\/auth\//.test(page), false, "the page links at a path this application does not register");
  assert.match(page, /document\.title = order\n\s+\? `Return \$\{order\.orderNumber \?\? order\.id\} — PRATIKSHYA FASHION`\n\s+: 'Return — PRATIKSHYA FASHION';/, "the page's own tab title moved");
  assert.ok(read(CONFIG).includes("RETURN_PICKUP_METHODS"), "the configuration the page reads moved");
});
