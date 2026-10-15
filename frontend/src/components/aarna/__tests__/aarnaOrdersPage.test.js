/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — the order history, on this
 * application's own orders.
 *
 * `/account/orders` is the port's own page since this stage: `pages/account/Orders.jsx`
 * inside the shared `OrderFrame`, still behind the same `ProtectedRoute` the
 * production tree draws. The production screen (`pages/account/AccountOrders.jsx`)
 * is untouched and still serves the path in the Atelier storefront.
 *
 * What these tests render is the real composition: the page inside this
 * application's provider stack, reading the session's order mirror through the
 * real `OrderContext` — and every expected figure is computed with the
 * application's own functions (`ORDER_FILTERS`, `orderItemCount`, `formatOrderDate`,
 * `formatINR`, `getOrderStatus`, `getPaymentStatus`, `canTrackOrder`), so a page
 * that invented its own arithmetic or its own vocabulary fails here instead of
 * matching a second copy of it.
 *
 *   1. THE ROUTE. The history is the port's page, inside the guard, with the
 *      production screen still App.jsx's own.
 *   2. WHAT THE PAGE STATES. The cards, the status chips, the filter counts, the
 *      search field, the guest-order notice and the empty history — each read
 *      from the records rather than re-stated.
 *   3. THE STATES THAT NEED A REQUEST. Loading, a failed read and a partial
 *      failure are pinned at the source level; what a render alone settles — an
 *      empty history, a history with orders, an order whose lines did not come
 *      back — is rendered here.
 *   4. NOTHING IS INVENTED. The page keeps no state of its own beyond its filter
 *      and its search, calls no API of its own, and links nowhere this
 *      application does not register.
 *
 * A NOTE ON THE DATA SHAPE: orders are restored from the session mirror, which
 * `utils/orders.js` normalises — and that normaliser carries no state flags
 * (`flags` is attached by the API's own read model, `utils/orderReadModel.js`), so
 * a history restored from the mirror is not labelled "Delivered" even when the
 * server recorded that status. The port reproduces production's own expression
 * exactly (`order.flags?.isDelivered ?? false`), and the delivered branch is
 * rendered here from the record a server read produces. This is production's
 * existing data shape, not something this stage changed.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM here, so no click, keystroke or focus
 * order is exercised, and `renderToStaticMarkup` runs no effect — so the records
 * are restored from the session mirror (which the context reads synchronously)
 * and the filter/search behaviour is pinned at the source level, as is the claim
 * the guest notice makes of the server. `AuthContext` publishes `isAuthenticated`
 * only after its restore effect, so every render below is the unsigned branch of
 * the shared frame — which is the branch a guest order screen really uses. No
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

const PAGE = "src/components/aarna/pages/account/Orders.jsx";
const FRAME = "src/components/aarna/pages/account/OrderFrame.jsx";
const MOUNT = "src/components/aarna/AarnaStorefront.jsx";
const PRODUCTION_SCREEN = "src/pages/account/AccountOrders.jsx";

/* ── the browser a server-rendered page still has to believe in ─────────────── */

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

/* ── the session's orders, in the shape the mirror round-trips ──────────────── */

const orderRecord = (id, createdAt, status, overrides = {}) => ({
  id,
  orderNumber: id,
  createdAt,
  status,
  paymentStatus: "PAID",
  paymentMethod: { id: "upi", label: "UPI" },
  deliveryMethod: { id: "standard", label: "Standard Delivery" },
  currency: "INR",
  items: [
    {
      lineId: `line-${id}-1`,
      productId: "phase11-banarasi",
      productSlug: "phase11-banarasi",
      name: "Phase 11 Banarasi",
      color: "Ink",
      size: "Free Size",
      quantity: 2,
      returnedQuantity: 0,
      price: 4200,
      unitPrice: 4200,
      lineTotal: 8400,
      image: "/fixtures/phase11/banarasi-cover.jpg",
    },
  ],
  pricing: { subtotal: 8400, productDiscount: 0, couponDiscount: 0, shipping: 0, total: 8400, saved: 0 },
  returns: [],
  customerId: null,
  ...overrides,
});

const SHIPPED = orderRecord("PF-24-1001", "2026-10-02T10:00:00.000Z", "SHIPPED");
const DELIVERED = orderRecord("PF-24-1002", "2026-09-18T10:00:00.000Z", "DELIVERED", {
  /* The mirror keeps a recorded estimate where the order carries one. */
  tracking: { estimatedDelivery: "2026-09-28T10:00:00.000Z" },
});
/* A server-shaped delivered order: the API's own normaliser attaches the state
   flags and the recorded delivery date a server read carries. */
const DELIVERED_SERVER_SHAPE = {
  ...DELIVERED,
  tracking: undefined,
  deliveredAt: "2026-09-24T10:00:00.000Z",
};
const CANCELLED = orderRecord("PF-24-1003", "2026-08-04T10:00:00.000Z", "CANCELLED");

/* ── the mount ─────────────────────────────────────────────────────────────── */

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
    { default: Orders, GuestOrderNotice, OrderCard },
    { OrderProblem, OrderLoading },
    orders,
    orderConfig,
    orderReadModel,
    shopping,
    orderService,
    routes,
    apiClient,
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    { UIProvider },
    { ShopProvider },
  ] = await Promise.all([
    load("/src/components/aarna/pages/account/Orders.jsx"),
    load("/src/components/aarna/pages/account/OrderFrame.jsx"),
    load("/src/utils/orders.js"),
    load("/src/config/orderConfig.js"),
    load("/src/utils/orderReadModel.js"),
    load("/src/utils/shopping.js"),
    load("/src/services/orders/orderService.js"),
    load("/src/components/aarna/router/routes.js"),
    load("/src/services/api/apiClient.js"),
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
    Orders,
    GuestOrderNotice,
    OrderCard,
    OrderProblem,
    OrderLoading,
    orders,
    orderConfig,
    shopping,
    orderService,
    orderReadModel,
    routes,
    api: apiClient,
    render: (path = "/account/orders") =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, React.createElement(Providers, null, React.createElement(Orders))),
        ),
      ),
    renderElement: (element, path = "/account/orders") =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, React.createElement(Providers, null, element)),
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
    className: (attributes.match(/class="([^"]*)"/) ?? [])[1] ?? "",
    inner,
  }));
const hrefs = (markup) => anchors(markup).map((anchor) => anchor.href);

/* One card's markup, from its own list item to the next one. */
const cards = (markup) => markup.split('<li class="pf-account__order-card">').slice(1).map((chunk) => chunk.split("</li>")[0]);

const source = () => read(PAGE);
const code = () => source().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The orders the session mirror holds — written through the service's own API. */
const seedOrders = (records) => app.orderService.saveOrders(records);

/* ── 1 · the route ─────────────────────────────────────────────────────────── */

test("the history is the port's own page, inside the guard the family shares", () => {
  const mountFile = read(MOUNT);

  assert.match(mountFile, /import AccountOrdersPage from "\.\/pages\/account\/Orders\.jsx";/, "the port's history is not imported by the mount");
  assert.match(mountFile, /<Route path="account\/orders" element=\{<AccountOrdersPage \/>\} \/>/, "the history route no longer renders the port's page");
  const guardOpen = mountFile.indexOf("<Route element={<ProtectedRoute />}>");
  const guardClose = mountFile.indexOf("</Route>", mountFile.indexOf('<Route path="account/instagram-rewards"'));
  const routeAt = mountFile.indexOf('<Route path="account/orders" element={<AccountOrdersPage />} />');
  assert.ok(routeAt > guardOpen && routeAt < guardClose, "the history left the guard its signed-in customers share");

  /* Production still owns the screen, and still says what a failed read means. */
  const production = read(PRODUCTION_SCREEN);
  assert.match(production, /useOrder\(\)/, "the production history no longer reads the order context");
  assert.match(read("src/App.jsx"), /<Route path="\/account\/orders" element=\{<AccountOrders \/>\} \/>/, "App.jsx no longer renders production's history");
});

/* ── 2 · what the page states ──────────────────────────────────────────────── */

test("an account with no orders says so, and offers the two real ways on", () => {
  seedOrders([]);
  const markup = app.render();

  assert.match(markup, /Your journey starts here\./, "the empty history lost production's own line");
  assert.equal(count(markup, "pf-account__order-card"), 0, "a card was drawn over an empty history");
  assert.equal(/pf-account__filters/.test(markup), false, "the filter row was drawn over an empty history");
  assert.equal(/pf-account__notice/.test(markup), false, "the guest notice was drawn with no guest orders to claim");
  assert.ok(hrefs(markup).includes("/shop"), "the empty history lost the way to the shop");
  assert.ok(hrefs(markup).includes("/collections/new-arrivals"), "the empty history lost its second destination");
  for (const href of hrefs(markup)) {
    if (!href || href.startsWith("#")) continue;
    assert.ok(app.routes.isRegisteredPath(href), `${href} is not a route this application registers`);
  }
});

test("every order the session holds is drawn from its own record", () => {
  seedOrders([SHIPPED, DELIVERED, CANCELLED]);
  const markup = app.render();
  const rendered = cards(markup);
  assert.equal(rendered.length, 3, "the history did not draw every order it holds");

  const shipped = cards(markup)[0];
  assert.ok(shipped.includes(`Order ${SHIPPED.orderNumber}`), "the card lost the order's own reference");
  assert.ok(shipped.includes(app.orders.formatOrderDate(SHIPPED.createdAt)), "the card lost the date the order was placed");
  assert.ok(shipped.includes(app.orderConfig.getOrderStatus("SHIPPED").label), "the card lost the order's own status");
  assert.ok(shipped.includes(app.orderConfig.getPaymentStatus("PAID").label), "the card lost the payment's own status");
  assert.ok(shipped.includes(app.shopping.formatINR(SHIPPED.pricing.total)), "the card lost the order's own total");
  assert.ok(shipped.includes(SHIPPED.paymentMethod.label), "the card lost the recorded payment method");
  assert.ok(shipped.includes(SHIPPED.deliveryMethod.label), "the card lost the recorded delivery method");
  assert.ok(
    shipped.includes(`${app.orders.orderItemCount(app.orders.normaliseOrder(SHIPPED))} pieces`),
    "the card lost the piece count",
  );
  assert.ok(shipped.includes(`/account/orders/${SHIPPED.id}`), "the card lost its own destination");

  /* The delivery line states the record the page was handed — the application's
     own rule, computed here from the same record. */
  const mirroredDelivered = app.orders.normaliseOrder(DELIVERED);
  const delivered = cards(markup)[1];
  assert.equal(mirroredDelivered.flags?.isDelivered ?? false, false, "the mirror now carries state flags — this fixture's rule moved");
  assert.ok(delivered.includes("Estimated Delivery"), "an undelivered-in-the-mirror order lost the estimated-delivery label");
  assert.ok(
    delivered.includes(app.orders.formatOrderDate(mirroredDelivered.tracking.estimatedDelivery)),
    "an order with a recorded estimate no longer states it",
  );

  /* An order with no recorded date says exactly that — it never estimates one. */
  const cancelled = cards(markup)[2];
  assert.ok(cancelled.includes("Estimated Delivery"), "an undelivered order lost the estimated-delivery label");
  assert.ok(cancelled.includes("Not yet scheduled"), "an order with no recorded date no longer says so");
  assert.equal(/Delivered on|Arriving|Expected by/.test(markup), false, "the page states a delivery promise it was never given");

  /* The delivered branch, rendered from the record a SERVER read produces: the
     API's own normaliser attaches the flags and keeps the recorded date. */
  const fromServer = app.orderReadModel.buildOrderReadModel(DELIVERED_SERVER_SHAPE);
  assert.equal(fromServer.flags.isDelivered, true, "the API's own read model no longer flags a delivered order");
  const deliveredCard = app.renderElement(
    React.createElement(app.OrderCard, { order: fromServer }),
    `/account/orders/${fromServer.id}`,
  );
  assert.ok(deliveredCard.includes("Delivered"), "a delivered order is no longer labelled delivered");
  assert.ok(
    deliveredCard.includes(app.orders.formatOrderDate(fromServer.tracking.deliveredAt)),
    "a delivered order no longer states the recorded delivery date",
  );
});

test("the journey is offered only where the record carries one", () => {
  seedOrders([SHIPPED]);
  const trackable = app.render();
  assert.ok(
    hrefs(trackable).includes(`/account/orders/${SHIPPED.id}/track`),
    "a shipped order lost its tracking destination",
  );

  /* Delivered, cancelled and unrecorded orders: `canTrackOrder` decides, not this
     page — so the page's own answer is compared with the application's. */
  for (const record of [DELIVERED, CANCELLED]) {
    seedOrders([record]);
    const markup = app.render();
    const expected = app.orders.canTrackOrder(app.orders.normaliseOrder(record));
    assert.equal(
      hrefs(markup).includes(`/account/orders/${record.id}/track`),
      expected,
      `${record.status}: the tracking destination disagrees with canTrackOrder`,
    );
  }
});

test("the filter row and the search are the application's own, with their own counts", () => {
  seedOrders([SHIPPED, DELIVERED, CANCELLED]);
  const markup = app.render();
  const records = [SHIPPED, DELIVERED, CANCELLED];

  assert.equal(count(markup, 'class="chip chip--sm'), app.orderConfig.ORDER_FILTERS.length, "the filter row lost a filter");
  assert.ok(markup.includes('role="group" aria-label="Filter orders by status"'), "the filter row lost its own group label");
  assert.ok(markup.includes('aria-pressed="true"'), "no filter is pressed on a fresh view");

  for (const filter of app.orderConfig.ORDER_FILTERS) {
    const expected = filter.statuses ? records.filter((record) => filter.statuses.includes(record.status)).length : records.length;
    assert.ok(
      markup.includes(`>${filter.label}<span class="listing-group__count">${expected}</span>`),
      `the ${filter.label} filter no longer states how many orders sit behind it`,
    );
  }

  assert.match(markup, /<input id="order-search" type="search"/, "the search field moved");
  assert.match(markup, /<label for="order-search" class="sr-only">Search orders by order ID<\/label>/, "the search field lost its label");
  assert.match(markup, /role="status" aria-live="polite" class="sr-only">3 orders shown\./, "the live count moved");
  assert.equal(/Clear order search/.test(markup), false, "the clear control was drawn with an empty search");
});

test("a guest's own orders are offered to the account that can keep them", () => {
  /* The context counts a session's guest orders only ONCE it has a customer
     (`customerId ? orders.filter((order) => !order.customerId).length : 0`), so a
     render without a signed-in customer never shows the notice — the branch is
     driven by the session, not by this page. The notice's own states are
     therefore rendered directly, with the count the context would hand it. */
  seedOrders([SHIPPED, DELIVERED]);
  const markup = app.render();
  assert.equal(/pf-account__notice/.test(markup), false, "the notice was drawn for a session the context counts zero guest orders for");

  const two = app.renderElement(React.createElement(app.GuestOrderNotice, { count: 2, onClaim: async () => ({ ok: true }) }));
  assert.match(two, /class="pf-note pf-account__notice"/, "the notice lost its own register");
  assert.ok(two.includes("2 orders were placed as a guest in this browser."), "the notice lost its own count");
  assert.match(two, /Add to My Account/, "the notice lost its own action");
  assert.equal(/form__err/.test(two), false, "a failure was drawn before the claim was even attempted");

  /* The wording follows the count. */
  const one = app.renderElement(React.createElement(app.GuestOrderNotice, { count: 1, onClaim: async () => ({ ok: true }) }));
  assert.ok(one.includes("1 order was placed as a guest"), "a single guest order is no longer described as one");
  assert.ok(one.includes("Add it to your account"), "a single guest order lost its own sentence");
});

test("the guest notice disappears only once the server says it worked", () => {
  const notice = code();

  assert.match(notice, /const result = await onClaim\?\.\(\);/, "the claim no longer goes through the context's own method");
  assert.match(notice, /if \(result\?\.ok\) \{\n\s+setState\(\{ busy: false, done: true, error: '' \}\);/, "an unsuccessful claim now hides the notice");
  assert.match(notice, /error:\n\s+result\?\.error \?\? 'We could not add those orders to your account just now\. Please try again\.',/, "a failed claim no longer reports itself");
  assert.match(notice, /disabled=\{state\.busy\}/, "the claim can be fired twice while it is in flight");
});

/* ── 3 · the states that need a request ────────────────────────────────────── */

test("a read in flight and a failed read are stated before any empty history", () => {
  const page = code();

  /* Loading wins over the empty state: a slow request is not "no orders". */
  const loadingAt = page.indexOf("if (isLoadingOrders && orders.length === 0) {");
  const errorAt = page.indexOf("if (ordersError && orders.length === 0) {");
  const emptyAt = page.indexOf("if (orders.length === 0) {");
  assert.ok(loadingAt !== -1 && errorAt !== -1 && emptyAt !== -1, "the state precedence moved");
  assert.ok(loadingAt < errorAt && errorAt < emptyAt, "the state precedence no longer reads loading → error → empty");
  assert.match(page, /return <OrderLoading label="Gathering your orders" breadcrumbItems=\{CRUMBS\} title=\{heading\} \/>;/, "the loading state moved");
  assert.match(page, /status=\{ordersErrorStatus \?\? 500\}/, "a failed list read no longer carries its own status");

  /* The history is gated on BOTH, so a failed refresh never renders as an empty
     successful history. */
  assert.equal(/orders\.length === 0/.test(page.slice(errorAt, emptyAt)), true, "the error branch no longer requires an empty list");

  /* A partial failure over real cards is still reported. */
  assert.match(page, /\{ordersError \? \(\n\s+<p className="pf-note" role="alert">/, "a partial failure is silently swallowed");
  assert.match(page, /onClick=\{retry\}>/, "the partial failure lost its retry");
  assert.match(page, /const retry = useCallback\(\(\) => \{\n\s+refreshOrders\(\);\n\s+\}, \[refreshOrders\]\);/, "the retry no longer refreshes the session's orders");
});

test("the search and the filter are the application's own functions, in its own order", () => {
  const page = code();

  assert.match(page, /import \{ ORDER_FILTERS \} from '\.\.\/\.\.\/\.\.\/\.\.\/config\/orderConfig\.js';/);
  assert.match(page, /const filter = ORDER_FILTERS\.find\(\(entry\) => entry\.id === filterId\);/, "the filter no longer resolves through the application's own list");
  assert.match(page, /const statusMatch = !filter\?\.statuses \|\| filter\.statuses\.includes\(order\.status\);/, "the filter no longer reads the statuses the config declares");
  assert.match(page, /return statusMatch && matchesOrderSearch\(order, term\);/, "the search left the application's own matcher");
  assert.match(
    page,
    /counts\[filter\.id\] = filter\.statuses\n\s+\? orders\.filter\(\(order\) => filter\.statuses\.includes\(order\.status\)\)\.length\n\s+: orders\.length;/,
    "the filter counts no longer count what the filter shows",
  );

  /* Nothing to show under a filter is not an empty history. */
  assert.match(page, /visibleOrders\.length === 0 \? \(/, "the zero-match branch moved");
  assert.match(page, /Nothing under this view\./, "the zero-match state lost its own words");
  assert.match(page, /setFilterId\('all'\);\n\s+setQuery\(''\);/, "the zero-match state no longer clears both the filter and the search");
});

/* ── 4 · nothing is invented ───────────────────────────────────────────────── */

test("the page keeps only its own view state, calls no API of its own, and invents nothing", () => {
  const page = code();

  for (const banned of ["localStorage", "sessionStorage", "fetch(", "axios", "apiGet", "apiPost", "setInterval", "Math.random"]) {
    assert.equal(page.includes(banned), false, `the page reaches for ${banned}`);
  }
  assert.equal(/\/auth\//.test(page), false, "the page links at a path this application does not register");
  assert.equal(/demo|sample|placeholder order|dummy/i.test(page), false, "the page carries sample data of its own");
  assert.match(page, /import \{ useOrder \} from '\.\.\/\.\.\/\.\.\/\.\.\/context\/OrderContext\.jsx';/, "the page no longer reads the order context");
  /* The two pieces of state it does keep are the view's own. */
  assert.equal(count(page, "useState("), 3, "the page's own state grew");
  assert.match(page, /const \[filterId, setFilterId\] = useState\('all'\);/);
  assert.match(page, /const \[query, setQuery\] = useState\(''\);/);
  /* The document title is restored, as every ported page does. */
  assert.match(page, /document\.title = ORDERS_TITLE;/);
  assert.match(read(PAGE), /const ORDERS_TITLE = 'My Orders — PRATIKSHYA FASHION';/, "the page's own tab title moved");
});

test("an order whose lines did not come back is still drawn as the order it is", () => {
  const bare = { ...SHIPPED, id: "PF-24-1004", orderNumber: "PF-24-1004", items: [] };
  seedOrders([bare]);
  const markup = app.render();
  const card = cards(markup)[0];

  assert.ok(card, "an order without lines was dropped from the history");
  assert.ok(card.includes("Item details unavailable"), "an order without lines no longer says so");
  assert.ok(card.includes(`Order PF-24-1004`), "an order without lines lost its reference");
  assert.ok(card.includes(app.shopping.formatINR(SHIPPED.pricing.total)), "an order without lines lost its total");
});

test("the renderer's own attribute order is not what is being asserted", () => {
  /* A guard against the suite drifting into markup-shape assertions: the two
     facts a card must carry are found wherever React put them. */
  seedOrders([SHIPPED]);
  const markup = app.render();
  assert.ok(anchors(markup).some((anchor) => anchor.href === `/account/orders/${SHIPPED.id}` && /Order PF-24-1001/.test(anchor.inner)));
  assert.equal(/class="pf-account__order-card"><div class="pf-account__order-main">/.test(markup), true, "the card's own composition moved");
  assert.ok(read(FRAME).includes("export function OrderLines"), "the shared register the cards lean on moved");
});
