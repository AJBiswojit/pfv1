/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — one order, on this application's
 * own order context.
 *
 * `/account/orders/:orderId` is the port's own page since this stage (the SAME
 * URL the guest-order surface uses, still unguarded), and `pages/account/OrderDetail.jsx`
 * keeps every decision the production screen makes from the same sources:
 *
 *   1. THE READ. The order comes from the ownership-checked accessor
 *      (`fetchOrder(id)` — the backend decides who may see it), loading wins over
 *      every empty state, a failure keeps its own HTTP status, and a missing or
 *      inaccessible order is ONE not-found state that says nothing about which
 *      of the two it was.
 *   2. THE ACTIONS. Track / Invoice / Return / Cancel appear only where the
 *      record and the application's own rules allow them, and Buy Again goes
 *      through the one cart implementation. Cancellation is confirmed through
 *      production's own dialog, is never optimistic, and the server's record
 *      replaces the local one when it answers.
 *   3. THE JOURNEY. Only transitions the atelier recorded — no estimated date,
 *      no invented carrier, no leg the record does not hold.
 *   4. THE RAILS. The order's own pricing, its recorded payment, the address
 *      snapshot it was placed with, the invoice's real availability, and a refund
 *      only from a return record that carries one.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM here, so no click, keystroke or focus
 * order is exercised — every handler and every state transition is pinned at the
 * source level, and the renders below are the states a server render can reach
 * (the read in flight, which is where the page starts, and the guest surface the
 * frame draws). `renderToStaticMarkup` runs no effect, so the read itself, the
 * tracking read, the cancellation and Buy Again are never executed here; no
 * backend is claimed anywhere in this file.
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

const PAGE = "src/components/aarna/pages/account/OrderDetail.jsx";
const PRODUCTION_PAGE = "src/pages/account/OrderDetail.jsx";
const CONFIRM_DIALOG = "src/components/orders/ConfirmDialog.jsx";
const INVOICE = "src/components/orders/InvoicePreview.jsx";

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
  location: { search: "", pathname: "/", orderId: null, href: "http://localhost/" },
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
    define: { "import.meta.env.VITE_STOREFRONT_HOME": '"aarna"' },
  });
  const load = (path) => vite.ssrLoadModule(path);
  const [
    { default: OrderDetail },
    orders,
    orderConfig,
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    { UIProvider },
    { ShopProvider },
  ] = await Promise.all([
    load("/src/components/aarna/pages/account/OrderDetail.jsx"),
    load("/src/utils/orders.js"),
    load("/src/config/orderConfig.js"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/components/aarna/state/UIContext.jsx"),
    load("/src/components/aarna/state/ShopContext.jsx"),
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
    OrderDetail,
    orders,
    orderConfig,
    render: (path) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, React.createElement(Providers, null, React.createElement(OrderDetail))),
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

const count = (markup, needle) => markup.split(needle).length - 1;
const anchors = (markup) =>
  [...markup.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({
    href: (attributes.match(/href="([^"]*)"/) ?? [])[1] ?? null,
    inner,
  }));
const hrefs = (markup) => anchors(markup).map((anchor) => anchor.href);

const source = () => read(PAGE);
const code = () => source().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1 · the read ──────────────────────────────────────────────────────────── */

test("the order is the ownership-checked read, and loading wins over every empty state", () => {
  const page = code();

  assert.match(page, /const \{ fetchOrder, getTracking, cancelOrder \} = useOrder\(\);/, "the page stopped reading the order through the context");
  assert.match(page, /fetchOrder\(orderId\)\.then\(\(result\) => \{/, "the order is no longer read through the context's accessor");
  assert.match(page, /\}, \[orderId, fetchOrder, reloadToken\]\);/, "the read no longer follows the id");

  const loadingAt = page.indexOf("if (loading) {");
  const errorAt = page.indexOf("if (error) {");
  const missingAt = page.indexOf("if (!order) return <OrderMissing");
  assert.ok(loadingAt !== -1 && errorAt !== -1 && missingAt !== -1, "the state precedence moved");
  assert.ok(loadingAt < errorAt && errorAt < missingAt, "the precedence no longer reads loading → failure → not found");

  /* The result decides: an ok read replaces the order, a failure keeps its own
     status and message — never a silent empty page. */
  assert.match(page, /if \(result\.ok\) \{\n\s+setOrder\(result\.order\);/, "a successful read no longer keeps the server's order");
  assert.match(page, /setError\(\{ status: result\.status, message: result\.error \}\);/, "a failed read no longer keeps its own status");
  assert.match(page, /status=\{error\.status\}/, "the failure no longer states its own status");
  assert.match(page, /message=\{error\.message\}/, "the failure no longer states the server's own message");
  assert.match(page, /onRetry=\{reload\}/, "the failure lost its retry");
  /* One state covers "no such order" and "not your order": the customer must not
     be able to tell them apart. */
  assert.equal(count(page, "<OrderMissing"), 1, "the not-found state was split");
});

test("progress is a separate, non-blocking read", () => {
  const page = code();

  assert.match(page, /getTracking\(order\.id\)\.then\(\(result\) => \{/, "progress is no longer read separately");
  assert.match(page, /\}, \[order\?\.id, getTracking\]\);/, "the progress read no longer follows the order");
  /* A tracking failure never hides the order. */
  assert.match(page, /setTracking\(result\.ok \? result\.tracking : null\);/, "a failed tracking read no longer degrades in place");
});

test("the page renders the read in flight, and the guest surface, before any order exists", () => {
  const loading = app.render("/account/orders/PF-24-1001");

  assert.ok(loading.includes("Loading your order"), "the read in flight is not stated");
  assert.match(loading, /class="empty" aria-busy="true"/, "the loading state lost its own register");
  assert.equal(/pf-account__nav/.test(loading), false, "account navigation was drawn for a session with no customer");
  assert.ok(hrefs(loading).includes("/signin?returnTo=%2Faccount%2Forders"), "the guest surface lost the way to keep the order");
  assert.ok(hrefs(loading).includes("/signup?returnTo=%2Faccount%2Forders"), "the guest surface lost the way to create an account");
  assert.equal(/\/auth\//.test(loading), false, "the page links at a path this application does not register");
});

/* ── 2 · the actions ───────────────────────────────────────────────────────── */

test("every action is offered only where the application's own rules allow it", () => {
  const page = code();

  assert.match(page, /const \{ fetchOrder, getTracking, cancelOrder \} = useOrder\(\);/, "the cancellation no longer goes through the context");
  /* Track */
  assert.match(page, /\{canTrackOrder\(order\) \? \(\n\s+<Button to=\{`\/account\/orders\/\$\{order\.id\}\/track`\}>Track Order<\/Button>/, "tracking is offered outside the rule that grants it");
  /* Invoice — only once the backend issued one, and the document is reused verbatim */
  assert.match(page, /\{order\.invoice\?\.available \? \(/, "the invoice action no longer waits for a real invoice");
  assert.match(page, /import InvoicePreview from '\.\.\/\.\.\/\.\.\/\.\.\/components\/orders\/InvoicePreview\.jsx';/, "the invoice document is no longer reused");
  assert.match(page, /<InvoicePreview\n\s+order=\{order\}\n\s+isOpen=\{invoiceOpen\}\n\s+onClose=\{\(\) => setInvoiceOpen\(false\)\}\n\s+\/>/, "the invoice document's own props moved");
  /* Return — only inside the window the backend enforces */
  assert.match(page, /\{canRequestReturnNow\(order\) \? \(\n\s+<Button to=\{`\/account\/orders\/\$\{order\.id\}\/return`\} variant="ghost">/, "the return action no longer follows the application's own eligibility rule");
  /* Cancel — only while the backend would accept it */
  assert.match(page, /\{canCancelOrder\(order\) \? \(\n\s+<Button variant="ghost" onClick=\{\(\) => setConfirmOpen\(true\)\}>/, "the cancel action no longer follows the application's own rule");
  /* No action this stage invented. */
  for (const invented of ["Exchange", "Download Invoice", "Print", "Share", "Reschedule", "Track Shipment"]) {
    assert.equal(page.includes(`>${invented}`), false, `the page offers an action production does not: ${invented}`);
  }
});

test("cancellation is confirmed first, is never optimistic, and the server's record wins", () => {
  const page = code();

  assert.match(page, /import ConfirmDialog from '\.\.\/\.\.\/\.\.\/\.\.\/components\/orders\/ConfirmDialog\.jsx';/, "the confirmation is no longer production's own dialog");
  assert.match(page, /isOpen=\{confirmOpen\}/, "the dialog is no longer driven by the page's own state");
  assert.match(page, /title="Cancel this order\?"/, "the dialog lost its own question");
  assert.match(page, /confirmLabel="Cancel Order"/, "the dialog lost its own confirmation label");
  assert.match(page, /cancelLabel="Keep Order"/, "the dialog lost its own way out");

  /* The paid and unpaid cases say different, honest things — neither claims a
     refund that will not happen by itself. */
  assert.match(page, /order\.paymentStatus === ORDER_PAYMENT_STATUS\.PAID\n\s+\? 'Are you sure you want to cancel this order\? It has already been paid for, so the atelier will contact you about the refund — no refund is issued automatically\.'/, "the paid order's copy moved");
  assert.match(page, /: 'Are you sure you want to cancel this order\? Nothing has been charged for it\.'/, "the unpaid order's copy moved");

  /* The request goes to the server, and only the server's answer is shown. */
  assert.match(page, /const result = await cancelOrder\(order\.id\);/, "the cancellation no longer goes through the context");
  assert.match(page, /if \(result\.ok && result\.order\) \{\n\s+setOrder\(result\.order\);/, "a successful cancellation no longer keeps the server's record");
  assert.match(page, /setNotice\('This order has been cancelled\.'\);/, "a successful cancellation is no longer announced");
  assert.match(page, /setNotice\(result\.message \|\| 'This order can no longer be cancelled\. Please contact the atelier\.'\);/, "a refused cancellation no longer states the server's own reason");
  /* Nothing is marked cancelled before the server answers: the only status the
     page ever draws comes from the record. */
  assert.equal(page.includes("CANCELLED"), false, "the page marks an order cancelled by itself");
  assert.equal(/setOrder\(\{ \.\.\.order, status:/.test(page), false, "the page rewrites the order's status locally");
  assert.match(page, /role="status" aria-live="polite"/, "the outcome is no longer announced");
});

test("buying again uses the one cart implementation, and reports what it could not do", () => {
  const page = code();

  assert.match(page, /buyAgainAvailability\(item\)/, "Buy Again no longer asks the application what is available");
  assert.match(page, /if \(availability\.state === 'unavailable'\) \{\n\s+unavailable \+= 1;/, "a piece that left the catalogue is no longer counted");
  assert.match(page, /if \(availability\.state === 'variant'\) \{\n\s+needsChoice = needsChoice \?\? availability\.href;/, "a retired variant is no longer sent to its own page");
  assert.match(page, /cart\.addToCart\(availability\.product, \{\n\s+color: item\.color,\n\s+size: item\.size,\n\s+quantity: item\.quantity,\n\s+\}\);/, "the pieces no longer go through the real cart");
  assert.match(page, /cart\.openDrawer\(\);/, "a successful add no longer opens the bag");
  assert.match(page, /if \(needsChoice\) \{\n\s+navigate\(needsChoice\);/, "a retired variant no longer navigates to its product page");
  assert.match(page, /'These pieces are no longer available\. Our new arrivals may hold something you love\.'/, "the catalogue-lost case is no longer reported honestly");
  assert.match(page, /if \(added > 0\) \{/, "the notice no longer depends on what really went into the bag");
});

/* ── 3 · the journey ───────────────────────────────────────────────────────── */

test("the journey draws only the transitions the atelier recorded", () => {
  const page = code();

  assert.match(page, /\{tracking\?\.steps\?\.length \? \(/, "the journey no longer waits for the steps the service returned");
  assert.match(page, /<OrderSteps steps=\{tracking\.steps\} ariaLabel=\{`Journey for order \$\{orderRef\}`\} \/>/, "the journey left the shared register");
  assert.match(page, /No progress has been recorded against this order yet\./, "the empty journey lost its honest line");
  assert.match(page, /we do not estimate them\./, "the page no longer says that dates are recorded, not estimated");
  /* Nothing is projected, estimated or invented here. */
  for (const banned of ["new Date(", "estimatedDelivery =", "carrier =", "waybill", "Location", "ETA"]) {
    assert.equal(page.includes(banned), false, `the page computes a value the record never held: ${banned}`);
  }
});

/* ── 4 · the rails ─────────────────────────────────────────────────────────── */

test("the rails state the order's own pricing, payment, address and invoice", () => {
  const page = code();

  assert.match(page, /<OrderTotals pricing=\{order\.pricing\} \/>/, "the total is no longer the order's own recorded pricing");
  assert.match(page, /<p className="pf-panel__name">\{order\.paymentMethod\.label\}<\/p>/, "the payment method is no longer the recorded one");
  assert.match(page, /No card details or payment credentials are ever stored with an order\./, "the payment panel lost production's own assurance");
  assert.match(page, /<p className="pf-panel__name">\{order\.address\.fullName\}<\/p>/, "the address snapshot lost its recipient");
  assert.match(page, /This is the address recorded when the order was placed\. Editing your address book\n\s+never changes a past order\./, "the address snapshot no longer says what it is");
  assert.match(page, /formatPhone\(order\.address\.phone\)/, "the address lost the application's own phone formatter");
  assert.match(page, /An invoice has not been issued for this order yet\. Please contact the atelier if you\n\s+need one for your records\./, "the invoice panel no longer states what is true when none exists");
  assert.match(page, /A downloadable invoice document is not available yet\./, "the invoice panel claims a document this system does not produce");
});

test("a refund figure appears only where a return record carries one", () => {
  const page = code();

  assert.match(page, /const activeReturn = latestReturn\(order\);/, "the return record is no longer resolved by the application's own helper");
  assert.match(page, /\{activeReturn\?\.refundAmount \? \(/, "the refund block no longer waits for a recorded figure");
  assert.match(page, /<p className="pf-meta__strong">\{formatINR\(activeReturn\.refundAmount\)\}<\/p>/, "the recorded refund is no longer the one stated");
  assert.match(page, /refundMethodLabel\(order\)/, "the refund method is no longer the application's own label");
  /* The failed-return explanation is never left off, and the window countdown
     only appears when a window was really recorded. */
  assert.match(page, /\{!canRequestReturnNow\(order\) && blocked \? \(/, "the blocked reason is no longer explained");
  assert.match(page, /\{blocked\}/, "the blocked reason is no longer stated");
  assert.match(page, /\) : windowState\.known && windowState\.open \? \(/, "the window countdown no longer waits for a recorded window");
  assert.match(page, /const windowState = returnWindow\(order\);/, "the window is no longer read from the application's own rule");
});

/* ── 5 · nothing is invented ───────────────────────────────────────────────── */

test("the page touches no storage, calls no API of its own, and keeps production's own file", () => {
  const page = code();

  for (const banned of ["localStorage", "sessionStorage", "fetch(", "axios", "apiGet", "apiPost", "setInterval"]) {
    assert.equal(page.includes(banned), false, `the page reaches for ${banned}`);
  }
  assert.match(page, /document\.title = order\n\s+\? `Order \$\{order\.orderNumber \?\? order\.id\} — PRATIKSHYA FASHION`\n\s+: 'Order — PRATIKSHYA FASHION';/, "the page's own tab title moved");
  /* Production's screen is untouched and still serves the Atelier storefront. */
  assert.match(read(PRODUCTION_PAGE), /useOrder\(\)/, "the production screen no longer reads the order context");
  assert.match(read("src/App.jsx"), /<Route path="\/account\/orders\/:orderId" element=\{<OrderDetail \/>\} \/>/, "App.jsx no longer renders production's screen");
  /* The dialog and the invoice document this page leans on are production's. */
  assert.match(read(CONFIRM_DIALOG), /export default function ConfirmDialog/, "the shared dialog moved");
  assert.match(read(INVOICE), /export default function InvoicePreview/, "the invoice document moved");
});
