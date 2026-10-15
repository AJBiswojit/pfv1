/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — order tracking, on this
 * application's own tracking service.
 *
 * `/account/orders/:orderId/track` is the port's own page since this stage, and
 * it is the guest-order surface as much as the customer's: it stays UNGUARDED,
 * exactly as `App.jsx` declares it, because a guest who has just checked out can
 * follow their own order there. `pages/account/OrderTracking.jsx` shows what the
 * production screen shows — REAL, STORED PROGRESS ONLY:
 *
 *   1. THE TWO READS. The order and its progress are read together; a failed
 *      ORDER read is the page's failure, while a failed tracking read alone is
 *      reported in place, because the order itself loaded.
 *   2. THE FACTS. Current status, the delivery date the atelier recorded (or an
 *      honest "not yet scheduled"), the tracking number and the carrier — with
 *      "Not dispatched yet" and "Not assigned yet" until dispatch recorded them.
 *   3. THE LIMITS. Live courier scans are not part of this system and the page
 *      says so; a cancelled order is stated as cancelled and its steps remain for
 *      reference only; no leg is ever estimated.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM here, so no click, keystroke or focus
 * order is exercised, and `renderToStaticMarkup` runs no effect — the two reads,
 * the failure branches and the cancelled/delivered states are pinned at the
 * source level, while the states a render reaches (the reads in flight, the guest
 * surface) are rendered. The facts themselves are rendered from the service's own
 * view in the family suite (`aarnaOrderFrame.test.js`), which drives
 * `OrderSteps`/`OrderMeta` with real projections. No backend is claimed here.
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

const PAGE = "src/components/aarna/pages/account/OrderTracking.jsx";
const PRODUCTION_PAGE = "src/pages/account/OrderTracking.jsx";
const SERVICE = "src/services/orders/trackingService.js";

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
    define: { "import.meta.env.VITE_STOREFRONT_HOME": '"aarna"' },
  });
  const load = (path) => vite.ssrLoadModule(path);
  const [
    { default: OrderTracking },
    orders,
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
    load("/src/components/aarna/pages/account/OrderTracking.jsx"),
    load("/src/utils/orders.js"),
    load("/src/config/orderConfig.js"),
    load("/src/components/aarna/router/routes.js"),
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
    orders,
    orderConfig,
    routes,
    render: (path) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, React.createElement(Providers, null, React.createElement(OrderTracking))),
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

/* ── 1 · the two reads ─────────────────────────────────────────────────────── */

test("the order and its progress are read together, and the order's failure is the page's", () => {
  const page = code();

  assert.match(page, /const \{ fetchOrder, getTracking \} = useOrder\(\);/, "the page stopped reading the order context");
  assert.match(page, /Promise\.all\(\[fetchOrder\(orderId\), getTracking\(orderId\)\]\)\.then\(\(\[orderResult, trackingResult\]\) => \{/, "the two reads are no longer made together");
  assert.match(page, /if \(!orderResult\.ok\) \{\n\s+setOrder\(null\);\n\s+setTracking\(null\);\n\s+setError\(\{ status: orderResult\.status, message: orderResult\.error \}\);/, "a failed order read no longer fails the page");
  /* A tracking failure on its own is reported in place: the order loaded fine. */
  assert.match(page, /setTracking\(trackingResult\.ok \? trackingResult\.tracking : null\);/, "a failed tracking read no longer degrades in place");
  assert.match(page, /Tracking information is not available for this order right now\./, "the unavailable-progress line moved");

  const loadingAt = page.indexOf("if (loading) {");
  const problemAt = page.indexOf("if (error || !order) {");
  assert.ok(loadingAt !== -1 && problemAt !== -1 && loadingAt < problemAt, "loading no longer wins over the failure states");
  assert.match(page, /status=\{error\?\.status \?\? 404\}/, "the page's own failure no longer carries a status");
  assert.match(page, /\}, \[orderId, fetchOrder, getTracking, reloadToken\]\);/, "the reads no longer follow the id or the retry");
});

test("the page renders the reads in flight, and its guests keep it", () => {
  const markup = app.render("/account/orders/PF-24-1001/track");

  assert.ok(markup.includes("Loading tracking"), "the reads in flight are not stated");
  assert.equal(/pf-account__nav/.test(markup), false, "account navigation was drawn for a session with no customer");
  assert.ok(hrefs(markup).includes("/signin?returnTo=%2Faccount%2Forders"), "a guest lost the way to keep the order");
  for (const href of hrefs(markup)) {
    if (!href) continue;
    assert.ok(app.routes.isRegisteredPath(href), `${href} is not a route this application registers`);
  }
});

/* ── 2 · the facts ─────────────────────────────────────────────────────────── */

test("the facts are the ones the backend recorded, named honestly when it recorded none", () => {
  const page = code();

  assert.match(page, /\{ label: 'Current Status', value: statusLabel \},/, "the current status left the fact band");
  assert.match(page, /label: cancelled \? 'Delivery' : order\.flags\?\.isDelivered \? 'Delivered' : 'Estimated Delivery',/, "the delivery label no longer follows the record");
  assert.match(page, /value: cancelled\n\s+\? 'Not applicable'/, "a cancelled order is no longer told the truth about its delivery");
  assert.match(page, /\{ label: 'Tracking Number', value: tracking\?\.trackingNumber \?\? 'Not dispatched yet' \},/, "the tracking number is no longer only what dispatch recorded");
  assert.match(page, /\{ label: 'Carrier', value: tracking\?\.carrier \?\? 'Not assigned yet' \},/, "the carrier is no longer only what the atelier assigned");
  /* The status the band states is the service's own resolution, with the
     order's own recorded label as the fallback — never a bare code. */
  assert.match(page, /const statusLabel = tracking\?\.status\?\.label \?\? order\.statusLabel \?\? order\.status;/, "the status no longer resolves through the service");
  assert.match(page, /const statusSummary = tracking\?\.status\?\.summary \?\? order\.statusSummary \?\? '';/, "the status summary no longer resolves through the service");
  /* Only a recorded date is ever formatted. */
  assert.match(page, /order\.flags\?\.isDelivered && tracking\?\.deliveredAt\n\s+\? formatOrderDate\(tracking\.deliveredAt\)/, "a delivered order no longer states the recorded date");
  assert.match(page, /: tracking\?\.estimatedDelivery\n\s+\? formatOrderDate\(tracking\.estimatedDelivery\)\n\s+: 'Not yet scheduled',/, "an order with no recorded date no longer says so");
  assert.equal(page.includes("new Date("), false, "the page computes a date of its own");
});

test("the page says what this system cannot show, and states a cancelled order as cancelled", () => {
  const page = code();

  assert.match(page, /\{tracking\?\.carrierTrackingAvailable && !tracking\?\.carrierEventsAvailable \? \(/, "the carrier-scan limitation no longer follows the service's own flags");
  assert.match(page, /Live courier scans are not available here\. Please use the carrier&rsquo;s own site with the\n\s+tracking number above for in-transit updates\./, "the carrier-scan limitation lost its own words");
  assert.match(page, /const cancelled = order\.status === ORDER_STATUS\.CANCELLED;/, "cancellation is no longer read from the recorded status");
  assert.match(page, /This order was cancelled, so it never entered the delivery journey\. The steps below remain\n\s+for reference only\./, "a cancelled order is no longer stated as cancelled");
  /* The steps of a cancelled order are reference only — the journey is not
     re-labelled as progress. */
  assert.match(page, /aria-label="Shipment progress"/, "the journey section lost its own name");
  /* No courier is ever invented, and no location is ever claimed. */
  for (const banned of ["Delhivery", "BlueDart", "DTDC", "India Post", "scan at", "scanned at", "In transit at", "currentLocation"]) {
    assert.equal(page.includes(banned), false, `the page names something the record never held: ${banned}`);
  }
});

test("the shipment, the destination and the ways on are the order's own", () => {
  const page = code();

  assert.match(page, /\{order\.items\.length === 0 \? \(\n\s+<p className="pf-panel__line">No pieces are recorded against this order\.<\/p>/, "an order with no recorded pieces no longer says so");
  assert.match(page, /<small>Qty \{item\.quantity\}<\/small>/, "the shipment lost its per-piece quantity");
  assert.match(page, /<p className="pf-panel__eyebrow">Destination<\/p>/, "the destination panel moved");
  assert.match(page, /\{order\.address\.addressLine\}/, "the destination lost the recorded address");
  assert.match(page, /<Button to=\{`\/account\/orders\/\$\{order\.id\}`\}>View Order<\/Button>/, "the way back to the order moved");
  assert.match(page, /<Link to="\/account\/orders" className="pf-account__act is-accent">\n\s+All Orders\n\s+<\/Link>/, "the way back to the history moved");
  assert.match(page, /role="status" aria-live="polite" className="sr-only">\n\s+Current order status: \{statusLabel\}\. \{statusSummary\}/, "the live status line moved");
  assert.match(page, /\{activeReturn \? <ReturnCard record=\{activeReturn\} order=\{order\} className="pf-account__section" \/> : null\}/, "a real return is no longer carried on the tracking page");
});

/* ── 3 · nothing is invented ───────────────────────────────────────────────── */

test("the page touches no storage, calls no API of its own, and keeps production's own screen", () => {
  const page = code();

  for (const banned of ["localStorage", "sessionStorage", "fetch(", "axios", "apiGet", "apiPost", "setInterval"]) {
    assert.equal(page.includes(banned), false, `the page reaches for ${banned}`);
  }
  assert.equal(/\/auth\//.test(page), false, "the page links at a path this application does not register");
  assert.match(page, /document\.title = order\n\s+\? `Tracking \$\{order\.orderNumber \?\? order\.id\} — PRATIKSHYA FASHION`\n\s+: 'Order Tracking — PRATIKSHYA FASHION';/, "the page's own tab title moved");
  /* The projection the page draws is the application's service, with its own
     rule that a step is dated only by a real persisted transition. */
  assert.match(read(SERVICE), /export const buildTrackingView/, "the tracking service moved");
  assert.match(read(SERVICE), /timestamp: event\?\.at \?\? null,/, "the service no longer withholds a date for an unrecorded step");
  assert.match(read(PRODUCTION_PAGE), /useOrder\(\)/, "the production screen no longer reads the order context");
  assert.match(read("src/App.jsx"), /<Route path="\/account\/orders\/:orderId\/track" element=\{<OrderTracking \/>\} \/>/, "App.jsx no longer renders production's screen");
});
