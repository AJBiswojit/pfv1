/**
 * PRATIKSHYA FASHION — PHASE 9 · the order confirmation, over this application's order.
 *
 * The design has no page to port here: its `TrackOrder.jsx` is a prototype
 * lookup whose own note says it is not connected to an order system, and its
 * `Checkout.jsx` places nothing. So this page is written out of the design's
 * parts (`.container`, `.crumbs`, `.label`, `.display`, `.checkout__lines`,
 * `.totals`, the `.btn` register) over the ONLY thing a confirmation may show:
 * the order the backend actually confirmed, held in `OrderContext.currentOrder`
 * by the checkout that created it.
 *
 * That is the rule these tests defend:
 *
 *   1. NO FABRICATED CONFIRMATION. With no confirmed order, the page says so and
 *      offers the way forward — it does not invent a number, a date, a payment
 *      status or a delivery promise. Rendered here for real, because that is
 *      exactly what a direct visit produces.
 *   2. THE ORDER IS THE APPLICATION'S. The status word comes from the
 *      application's own register (`config/orderConfig`), the money from the
 *      order's own pricing, and the two ways onward are the application's
 *      existing routes (`/account/orders/:id` and its `/track`).
 *   3. THE GUARD HOLDS. `/order-success` is wrapped in the same production
 *      `ProtectedRoute` as the checkout, so the page is reached by a signed-in
 *      customer, through the transaction, and not by a direct link.
 *
 * WHAT THIS CANNOT PROVE: no live backend runs in this sandbox, so no real
 * order was placed and no real confirmation was rendered — the confirmed-order
 * markup is pinned here at the source level and left for the browser probe, and
 * the payment path itself needs the gateway. No payment, order or refund is
 * claimed as verified. There is no DOM here either, so clicks and layout are
 * out of scope; they belong to the probe.
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
const PORTED = "src/components/customer/pages/OrderSuccess.jsx";
const STOREFRONT = "src/components/customer/CustomerStorefront.jsx";

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

/* ── the mount ────────────────────────────────────────────────────────────── */

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
    { default: OrderSuccess },
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/components/customer/pages/OrderSuccess.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
  ]);

  const providers = [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider];
  const withProviders = (element) => {
    let tree = element;
    for (const Provider of providers) tree = React.createElement(Provider, null, tree);
    return tree;
  };
  /* One render, one tree — a markup string fed back into a render would be
     escaped text rather than markup. */
  const render = (tree, path) =>
    renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: [path] },
        React.createElement(Suspense, { fallback: null }, withProviders(tree)),
      ),
    );

  return {
    vite,
    /** The route, as a browser reaches it. */
    renderRoute: (path) => render(React.createElement(CustomerLayout), path),
    /** The page itself, over the real contexts, with no order confirmed. */
    renderPage: () => render(React.createElement(OrderSuccess), "/order-success"),
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

const RUNTIME_PACKAGES = new Set(["react", "react-dom", "react-router-dom", "lucide-react"]);
const importSpecifiers = (source) =>
  [...source.matchAll(/^\s*import\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/gm)].map((match) => match[1]);

/* ── 1 · the guard, and no fabricated confirmation ──────────────────────── */

test("/order-success always renders the customer storefront's confirmation route without inventing an order", () => {
  const markup = off.renderRoute("/order-success");
  assert.ok(markup.length > 0, "/order-success rendered nothing at all");
  assert.match(markup, /class="pf-root"/);
  assert.equal(/Order Confirmed|Thank you,/.test(markup), false, "a direct visit fabricated a confirmation");
});

test("with the switch on, a direct visit confirms nothing — no order, no number, no claim", () => {
  const markup = on.renderRoute("/order-success");
  const page = on.renderPage();

  for (const [label, html] of [["the route", markup], ["the page", page]]) {
    /* No confirmed order is in the context, and the page says exactly that
       instead of dressing the visit up as a confirmation. */
    assert.equal(/Order Confirmed|Thank you,/.test(html), false, `${label} fabricated a confirmation`);
    /* The brand mark is everywhere (header, footer, logo); an ORDER NUMBER is
       not, because no order exists in this render. */
    assert.equal(/PF-\d|#\d{4}|Order number|<dd class="pf-meta__strong"/.test(html), false, `${label} invented an order number`);
    /* Nor a payment verdict, nor a delivery promise. */
    assert.equal(/Payment status:|Paid<|Complimentary<|Delivering to/.test(html), false, `${label} invented an order's details`);
  }
  assert.match(page, /We couldn’t find that order\./, "the page lost its honest empty state");
  assert.match(page, /A confirmation is only available right after a completed checkout\./, "the empty state lost its explanation");
  assert.match(page, /href="\/shop"/, "the empty state lost its way back to the collection");
  assert.equal(/account\/orders/.test(page), false, "the empty state offered an order that does not exist");
});

test("the guard on the confirmation is the production ProtectedRoute, unchanged", () => {
  const source = read(STOREFRONT);
  assert.match(source, /import ProtectedRoute from "\.\.\/auth\/ProtectedRoute\.jsx";/);
  assert.match(
    source,
    /path="order-success"\s*\n\s*element=\{<ProtectedRoute><OrderSuccess \/><\/ProtectedRoute>\}/,
    "the confirmation route is no longer guarded by the application's own wrapper",
  );
  /* The page itself never re-implements the guard: `App.jsx`'s production route
     for the same path is the shape this copies — a wrapper element, not a
     hand-written check inside the page. */
  const page = read(PORTED);
  assert.equal(/Navigate\s+to=|<Navigate/.test(page), false, "the page redirects on its own instead of being guarded");
});

test("the page reads the confirmed order and nothing else", () => {
  const source = read(PORTED);
  assert.match(source, /const \{ currentOrder \} = useOrder\(\);/, "the page no longer reads the confirmed order");
  assert.match(source, /if \(!currentOrder\)/, "the page no longer has a state for 'no confirmed order'");
  assert.equal(/\bfetch\(|axios|apiClient|ordersApi/.test(source), false, "the page reaches an API directly");
  assert.equal(/createOrder|placeOrder|mockPayment|Math\.random/.test(source), false, "the page fabricates or creates an order");
  for (const specifier of importSpecifiers(source)) {
    if (specifier.startsWith(".")) continue;
    assert.ok(RUNTIME_PACKAGES.has(specifier), `the page imports "${specifier}", which is not already in this tree`);
  }
});

/* ── 2 · the confirmation is the application's own ─────────────────────── */

test("the status word is the application's register, and the money is the order's", () => {
  const source = read(PORTED);
  assert.match(source, /getPaymentStatus\(/, "the payment status is no longer the application's label");
  assert.equal(/PAID\b.*'Paid'|'Paid'.*PAID/.test(source), false, "the page spelled a status label of its own");
  assert.match(source, /order\.pricing\.subtotal/, "the subtotal is not the order's own");
  assert.match(source, /order\.pricing\.shipping/, "the delivery figure is not the order's own");
  assert.match(source, /order\.pricing\.total/, "the total is not the order's own");
  assert.match(source, /order\.pricing\.codFee/, "the COD fee is not the order's own");
  assert.equal(/\.reduce\(|\bsum\(/.test(source), false, "the page sums money itself");
  assert.match(source, /formatINR/, "the page stopped formatting money with the application's formatter");
});

test("the ways onward are the application's existing routes, and the guest keeps a real way to keep the order", () => {
  const source = read(PORTED);
  assert.match(source, /to=\{`\/account\/orders\/\$\{order\.id\}`\}/, "the confirmation lost the order's own page");
  assert.match(source, /to=\{`\/account\/orders\/\$\{order\.id\}\/track`\}/, "the confirmation lost the tracking route");
  assert.match(
    source,
    /\/signup\?returnTo=\$\{encodeURIComponent\('\/account\/orders'\)\}/,
    "the guest's way to keep the order changed route or lost its returnTo",
  );
  /* No invented tracking: no carrier, no consignment number, no promise of a
     date the atelier has not scheduled. */
  assert.equal(
    /Blue ?Dart|Delhivery|Ecom ?Express|trackingNumber|\bAWB\b|expectedBy|consignment/i.test(source),
    false,
    "the page invented a delivery claim",
  );
  /* The word "scheduled"/"estimate" may appear ONLY as the reason no date is
     claimed — never as a date. */
  assert.equal(/delivered by|arrives on|scheduled for/i.test(source), false, "the page promised a delivery date");
  assert.match(source, /No delivery date is invented|has not scheduled/i, "the reason no delivery date is shown was lost from the page");
});

test("no prototype copy and no banned promise reaches the page", () => {
  const page = on.renderPage();
  for (const phrase of [
    "not connected to an order system",
    "sample data",
    "prototype",
    "demo order",
    "lorem",
  ]) {
    assert.equal(page.toLowerCase().includes(phrase), false, `the rendered page carries the design prototype's "${phrase}"`);
  }
  const source = read(PORTED);
  assert.equal(/100% ?secure|guaranteed delivery|instant refund/i.test(source), false, "the page promises more than the application does");
});

test("the confirmation's own chrome is the quiet journey, and it can be revisited without a second order", () => {
  const markup = on.renderRoute("/order-success");
  assert.match(markup, /class="pf-root"/, "the port did not mount at /order-success");
  assert.match(markup, /<main class="pf-journey">/, "the confirmation did not render inside the journey frame");
  assert.match(markup, /Secure Checkout/, "the journey frame lost its own note");
  assert.equal(/class="drawer"|class="announce"/.test(markup), false, "the full shopping chrome leaked into the confirmation");
  /* The page is a page, not a one-shot: nothing in it clears or invalidates the
     order it shows, and nothing re-places it. */
  const source = read(PORTED);
  assert.equal(/clearOrder|resetOrder|clearCart/.test(source), false, "the confirmation disposes of order state");
});

test("the page is titled the way the production confirmation is titled", () => {
  const source = read(PORTED);
  assert.match(source, /document\.title = 'Order Confirmed — PRATIKSHYA FASHION'/, "the page title changed");
  assert.match(source, /const previous = document\.title;/, "the title is no longer restored on the way out");
});
