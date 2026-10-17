/**
 * PRATIKSHYA FASHION — PHASE 11 · the account overview, on this application's own
 * account.
 *
 * The Aarna-native account overview renders inside the shared account frame and
 * remains behind the customer guard. App.jsx delegates all customer routes to
 * Aarna; its staff routes remain independent.
 *
 * What these tests render is the real composition: the ported page inside this
 * application's provider stack (and the port's own UI/shop providers, exactly as
 * `CustomerStorefront` mounts them), through Vite's SSR pipeline — no component is
 * rendered in isolation and no context is faked. The data is the application's
 * own: a guest bag, a guest wishlist and a guest browsing history restored from
 * `localStorage`, and the session's order mirror, each resolved against the
 * catalogue store seeded exactly as the application seeds it after a successful
 * fetch. Every expected figure is computed with the application's own functions
 * (`calculateCartTotals`, `formatINR`, `formatOrderDate`, `orderItemCount`,
 * `getOrderStatus`), so a page that invented its own arithmetic or its own
 * vocabulary fails here instead of matching a second copy of it.
 *
 *   1. THE ROUTE. `/account` is the port's page, inside the guard, declared in
 *      the port's registry — and production's own dashboard is still App.jsx's.
 *   2. WHAT THE PAGE STATES. Every tile, the bag line, the order register and
 *      the two rails are read from the contexts that own them; an account with
 *      nothing says zero and invents nothing; every destination the page
 *      renders resolves to a route this application registers; and every class
 *      it draws is styled by the port's own sheets.
 *   3. THE STATES THE DESIGN'S PROTOTYPE NEVER HAD. Loading, a failed read, an
 *      empty history and a saved count the catalogue has not resolved yet are
 *      each pinned — the dash rule (a figure is published only once its list
 *      has been read) at the source level, the rest in rendered markup.
 *   4. THE COPY THAT IS BANNED STAYS BANNED. The prototype's device-local
 *      profile, its `aarna:profile` key and its "no account is created" prose
 *      appear in no statement of the page — they survive only in the comment
 *      that records why they were not copied. The page keeps no state of its
 *      own, calls no API, and renders no dead control.
 *   5. THE ACCOUNT SESSION IT WAITS ON. The customer's own details are stated
 *      only as far as the shared account context has read them: a session that
 *      owes a read is loading from its first render rather than an account with
 *      nothing on file, a read that failed is named as failed, and an account
 *      held for a previous identity is dropped in the render that first sees
 *      the change — never drawn under another customer's session.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM in this tree, so clicks, focus order
 * and layout are out of scope. Effects do not run under `renderToStaticMarkup`,
 * so the tab title, the noindex marker and the states that only appear after an
 * effect (the read in flight, a failed fetch, the 401/403 branch, the session
 * ending and one identity replacing another) are pinned here at the source
 * level, while what a render alone settles — a session that holds a customer
 * token and has not been read yet — is rendered here. No backend is
 * claimed: the order mirror is written through `orderService`'s own API, and the
 * rails read catalogue records seeded by this suite. Nothing here is an
 * end-to-end verification of any API.
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

const PAGE = "src/components/customer/pages/account/Overview.jsx";
const FRAME = "src/components/customer/pages/account/AccountFrame.jsx";
const NAV = "src/components/customer/pages/account/AccountNav.jsx";
const MOUNT = "src/components/customer/CustomerStorefront.jsx";
const PRODUCTION_APP = "src/App.jsx";
const PRODUCTION_DASHBOARD = "src/components/customer/pages/account/Overview.jsx";
const SHEET = "src/components/customer/aarna.account.css";
/* The sheets a ported page may lean on: the design's own, and the two the port
   declares for what the design never drew. `pcard-cell` — the wishlist's card
   wrapper, which this page reuses for its rails — lives in the second. */
const SHEETS = ["src/components/customer/aarna.css", "src/components/customer/aarna.wishlist.css", SHEET];
const REGISTRY = "scripts/aarna-port.js";

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

/* The application's own client-side keys, as its own modules declare them, and
   the shapes those modules round-trip. */
const CART_KEY = "pratikshya_cart";
const WISHLIST_KEY = "pratikshya_wishlist";
const RECENTLY_VIEWED_KEY = "pratikshya_recently_viewed";

const seedGuestCart = (lines) => storage.set(CART_KEY, JSON.stringify({ lines, coupon: null }));
const seedGuestWishlist = (ids) => storage.set(WISHLIST_KEY, JSON.stringify(ids));
const seedGuestBrowsing = (ids) =>
  storage.set(
    RECENTLY_VIEWED_KEY,
    JSON.stringify({
      version: 1,
      scopes: { guest: ids.map((productId, index) => ({ productId, viewedAt: 1_700_000_000_000 + index })) },
    }),
  );

/* ── the catalogue, in the shape `catalogStore` normalises ─────────────────── */

const CATEGORY = { id: "sarees", name: "Sarees", slug: "sarees", status: "ACTIVE", eyebrow: "Women · Sarees" };

const RECORDS = [
  {
    id: "phase11-banarasi",
    name: "Phase 11 Banarasi",
    slug: "phase11-banarasi",
    sku: "P11-BAN-01",
    price: 4200,
    originalPrice: 5200,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase11/banarasi-cover.jpg",
    additionalImages: [],
    sizes: ["Free Size"],
    colors: ["Ink"],
    occasion: ["Wedding"],
    fabric: "Katan Silk",
    description: "A handloom Banarasi, woven for the wedding season.",
    availability: "in-stock",
    stock: 6,
  },
  {
    id: "phase11-blouse",
    name: "Phase 11 Blouse",
    slug: "phase11-blouse",
    sku: "P11-BLO-01",
    price: 1800,
    originalPrice: null,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase11/blouse-cover.jpg",
    additionalImages: [],
    sizes: ["S", "M"],
    colors: ["Ivory"],
    occasion: ["Festive"],
    fabric: "Silk",
    description: "A ready blouse.",
    availability: "in-stock",
    stock: 3,
  },
];

const recordFor = (id) => RECORDS.find((record) => record.id === id);

/* ── the session's orders, in the shape the session mirror round-trips ───────
 *
 * None of these carries a `customerId`: they are the guest orders the mirror
 * holds, which is exactly what `ordersForCustomer(orders, null)` keeps for a
 * session with no signed-in customer. The mirror is written through the
 * service's own `saveOrders`, never by hand. */

const ORDER_A = "PF-11-0002";
const ORDER_B = "PF-11-0001";
const ORDER_C = "PF-11-0003";
const ORDER_D = "PF-11-0004";

const orderRecord = (id, createdAt, status, productId, name, quantity, price, returns = []) => ({
  id,
  createdAt,
  status,
  currency: "INR",
  items: [{ lineId: `line-${id}`, productId, name, quantity, price, lineTotal: quantity * price }],
  pricing: { subtotal: quantity * price, productDiscount: 0, couponDiscount: 0, shipping: 0, total: quantity * price },
  returns,
});

const ORDER_RECORDS = [
  orderRecord(ORDER_A, "2026-10-02T10:00:00.000Z", "SHIPPED", "phase11-banarasi", "Phase 11 Banarasi", 2, 4200),
  orderRecord(ORDER_B, "2026-09-18T10:00:00.000Z", "DELIVERED", "phase11-blouse", "Phase 11 Blouse", 1, 1800),
  orderRecord(ORDER_C, "2026-08-04T10:00:00.000Z", "CANCELLED", "phase11-banarasi", "Phase 11 Banarasi", 1, 4200),
  orderRecord(ORDER_D, "2026-07-11T10:00:00.000Z", "RETURNED", "phase11-blouse", "Phase 11 Blouse", 1, 1800),
];

const BAG_LINES = [
  { id: "line-1", productId: "phase11-banarasi", color: "Ink", size: "Free Size", quantity: 2, addedAt: 1 },
  { id: "line-2", productId: "phase11-blouse", color: "Ivory", size: "S", quantity: 1, addedAt: 2 },
];

/* ── the mount: the port's page, inside both provider stacks ───────────────── */

async function mount() {
  const vite = await createServer({
    root: ROOT,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
    appType: "custom",

  });
  const load = (path) => vite.ssrLoadModule(path);
  const [
    { default: Overview },
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    { UIProvider },
    { ShopProvider },
    store,
    orderService,
    orders,
    shopping,
    routes,
    config,
    apiClient,
    media,
    mediaResolver,
    mediaPaths,
    taxonomy,
    offers,
    stylePreferences,
    personalization,
  ] = await Promise.all([
    load("/src/components/customer/pages/account/Overview.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/components/customer/state/UIContext.jsx"),
    load("/src/components/customer/state/ShopContext.jsx"),
    load("/src/services/catalog/catalogStore.js"),
    load("/src/services/orders/orderService.js"),
    load("/src/utils/orders.js"),
    load("/src/utils/shopping.js"),
    load("/src/components/customer/router/routes.js"),
    load("/src/config/orderConfig.js"),
    load("/src/services/api/apiClient.js"),
    /* The two commerce panels read through the repositories that own them, and a
       collection's cover is resolved by the port's media layer, so those modules
       are loaded here as well: the coverage test below states a cover resolves,
       and the offers panel is exercised against a real coupon record. */
    load("/src/services/media/mediaRepository.js"),
    load("/src/services/media/mediaResolver.js"),
    load("/src/services/media/mediaPaths.js"),
    load("/src/services/taxonomyRepository.js"),
    load("/src/services/offers/offerRepository.js"),
    /* The style panel and the personal edit read production's own two customer
       services; the suite states their contract as well. */
    load("/src/services/customer/stylePreferences.js"),
    load("/src/services/customer/personalization.js"),
  ]);

  /* The tree the application really builds around this page, outermost first:
     `App.jsx` nests the customer providers `AuthProvider` → `AccountProvider` →
     `InventoryProvider` → `ShoppingProvider` → `OrderProvider` →
     `CheckoutProvider`, and `CustomerStorefront` mounts its OWN
     `MotionConfig` → `UIProvider` → `ShopProvider` INSIDE that band — which is
     what makes the ported card's `useShop()`/`useUI()` resolve to the real
     providers, and what makes `CartContext`/`WishlistContext`/`AccountContext`/
     `OrderContext` read the real session through `useAuth()`.

     `React.createElement` wraps from the inside out, so each array below is
     written innermost first. */
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

  return {
    vite,
    routes,
    /* The application's own api client: the module that owns the customer
       token, so a test can open a session exactly as the application does. */
    api: apiClient,
    orders,
    shopping,
    config,
    orderService,
    store,
    media,
    mediaResolver,
    mediaPaths,
    taxonomy,
    offers,
    stylePreferences,
    personalization,
    Overview,
    /* The page at the URL a browser reaches, through the application's own
       router — the same composition the route table mounts. */
    render: (path = "/account") =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, React.createElement(Providers, null, React.createElement(Overview))),
        ),
      ),
  };
}

let app = null;

before(async () => {
  app = await mount();
  app.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections: [] });
});

after(async () => {
  await app?.vite.close();
  delete globalThis.window;
});

/* ── helpers ───────────────────────────────────────────────────────────────── */

const count = (markup, needle) => markup.split(needle).length - 1;

/* Attribute order is the renderer's business, not this suite's: an anchor is
   read by what it carries, never by how React happened to order it. */
const anchors = (markup) =>
  [...markup.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({
    attributes,
    href: (attributes.match(/href="([^"]*)"/) ?? [])[1] ?? null,
    inner,
  }));
const hrefs = (markup) => anchors(markup).map((anchor) => anchor.href);
const linksTo = (markup, href) => anchors(markup).filter((anchor) => anchor.href === href);
const tiles = (markup) =>
  anchors(markup)
    .filter((anchor) => /class="account__tile"/.test(anchor.attributes))
    .map((anchor) => ({
      href: anchor.href,
      figure: (anchor.inner.match(/<strong>([^<]*)<\/strong>/) ?? [])[1] ?? null,
      label: (anchor.inner.match(/<span>([^<]*)<\/span>/) ?? [])[1] ?? null,
    }));

const source = () => read(PAGE);
/* The page's statements, with its comments removed: what the code DOES, as
   opposed to what its header records about the design's prototype. */
const code = () => source().replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** An empty session: no bag, no wishlist, no browsing history, no orders. */
const emptySession = () => {
  storage.clear();
  app.orderService.saveOrders([]);
};

/* ── 1 · the route, and what it did not move ───────────────────────────────── */

test("the index route is the port's own page, still inside the guard the family shares", () => {
  const mount = read(MOUNT);
  assert.match(mount, /import AccountOverview from "\.\/pages\/account\/Overview\.jsx";/,
    "the port's overview is not imported by the mount");
  assert.match(mount, /<Route path="account" element=\{<AccountOverview \/>\} \/>/,
    "the index route no longer renders the port's page");

  /* The route is inside the ONE ProtectedRoute block the family stands behind,
     and that block still closes exactly once. */
  const open = mount.indexOf("<Route element={<ProtectedRoute />}>");
  const guardCloses = mount.indexOf("</Route>", mount.indexOf('<Route path="account/instagram-rewards"'));
  const index = mount.indexOf('<Route path="account" element={<AccountOverview />} />');
  assert.ok(open !== -1 && guardCloses > open, "the port no longer declares the family's guard block");
  assert.ok(index > open && index < guardCloses, "the index route left the family's guard");

  /* The three unguarded order pages are still unguarded — a guest keeps them,
     which is to say they are declared AFTER the guard block closes. */
  for (const path of ["account/orders/:orderId", "account/orders/:orderId/track", "account/orders/:orderId/return"]) {
    const at = mount.indexOf(`<Route path="${path}" element=`);
    assert.ok(at !== -1, `${path} is no longer declared`);
    assert.ok(at > guardCloses, `${path} was put behind the guard`);
  }

  /* The twelve production account screens are still the ones the port mounts
     lazily under the same guard — this phase moved the index route only. */
  assert.equal(count(mount, "<Route element={<ProtectedRoute />}>"), 1,
    "the port declares more than one guard block");
  assert.match(mount, /AccountProfile|AccountAddresses/,
    "the production account screens left the port's route table");
});

test("the Aarna account route is mounted without an outer legacy page", () => {
  const production = read(PRODUCTION_DASHBOARD);
  assert.match(production, /useAccount\(|useProfile\(/,
    "the production dashboard no longer reads the account");
  for (const sourceName of ["useOrder", "useWishlist", "useCart", "useRecentlyViewed"]) {
    assert.ok(production.includes(sourceName), `the production dashboard no longer reads ${sourceName}`);
  }

  const app = read(PRODUCTION_APP);
  const storefront = read("src/components/customer/CustomerStorefront.jsx");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/,
    "App.jsx no longer delegates customer paths to Aarna");
  assert.doesNotMatch(app, /pages\/account\/AccountDashboard/,
    "the outer route tree still imports an obsolete customer page");
  assert.match(storefront, /<Route path="account"/,
    "Aarna no longer owns the account route");

  /* And the port's registry declares the ported page, so the closure check
     knows it and the port tool never writes over it. */
  const registry = read(REGISTRY);
  const added = registry.slice(registry.indexOf("const ADDED = ["), registry.indexOf("];", registry.indexOf("const ADDED = [")));
  assert.equal(count(added, '"pages/account/Overview.jsx"'), 1,
    "the ported page is not declared exactly once in the port's registry");
});

/* ── 2 · what the page states, and where each figure comes from ────────────── */

test("an empty account says zero, in the design's tiles, and invents nothing", () => {
  emptySession();
  const markup = app.render();

  assert.match(markup, /class="info container account pf-account"/, "the page is not inside the account frame");
  assert.match(markup, /class="pf-account__nav"/, "the account navigation is missing");
  assert.match(markup, /class="crumbs"/, "the frame's breadcrumb is missing");

  /* The design's three-tile grid, in the design's own order — saved pieces, the
     order link, the bag (`home-page/src/pages/Account.jsx:29-32`) — with each
     figure the context that owns it and the design's own labels kept where it
     wrote them. */
  assert.deepEqual(tiles(markup), [
    { href: "/account/wishlist", figure: "0", label: "Saved pieces" },
    { href: "/account/orders", figure: "0", label: "Orders" },
    { href: "/cart", figure: "0", label: "Items in bag" },
  ]);

  /* The states a customer with nothing is actually in — this application's own
     words, never a blank panel. */
  assert.match(markup, /Your bag is waiting for a piece\./);
  assert.match(markup, /class="shop__count">0 orders</);
  assert.match(markup, /Your next favourite piece is waiting\./);
  assert.match(markup, /When you place an order, it will live here\./);
  assert.match(markup, /Nothing saved yet\./);
  assert.match(markup, /Save pieces you love and find them here later\./);
  assert.match(markup, /No default address set\./);

  /* No fabricated content anywhere: no price, no order, no product card. */
  assert.equal(/₹/.test(markup), false, "an empty account states a price");
  assert.equal(/PF-\d/.test(markup), false, "an empty account states an order");
  assert.equal(/pcard/.test(markup), false, "an empty account draws a product card");

  /* Nothing was withheld either: every source was read, so no figure is a
     dash, and the empty rails are omitted rather than promised. */
  assert.equal(/<strong>—<\/strong>|class="shop__count">—</.test(markup), false,
    "a read source was reported as unknown");
  assert.equal(/aria-label="Recently viewed"/.test(markup), false,
    "an empty browsing history still promised a rail");
});

test("a seeded bag, wishlist and browsing history move the tiles, the strip and the rails", () => {
  storage.clear();
  seedGuestCart(BAG_LINES);
  seedGuestWishlist(["phase11-banarasi", "phase11-blouse"]);
  seedGuestBrowsing(["phase11-banarasi", "phase11-blouse"]);
  app.orderService.saveOrders([ORDER_RECORDS[0], ORDER_RECORDS[1]]);

  const markup = app.render();

  assert.deepEqual(tiles(markup), [
    { href: "/account/wishlist", figure: "2", label: "Saved pieces" },
    { href: "/account/orders", figure: "2", label: "Orders" },
    { href: "/cart", figure: "3", label: "Items in bag" },
  ]);

  /* The bag line is production's, and its subtotal is the one the application's
     own arithmetic produces for these lines — not a second calculator. */
  const expectedSubtotal = app.shopping.calculateCartTotals(
    BAG_LINES.map((line) => ({ ...line, product: recordFor(line.productId) })),
  ).subtotal;
  assert.ok(markup.includes(`3 pieces · ${app.shopping.formatINR(expectedSubtotal)}`),
    "the bag strip does not state the cart's own count and subtotal");
  assert.match(markup, /href="\/cart"[^>]*><span>View Bag<\/span>/);

  /* The order head states the whole history, not just the rows below it. */
  assert.match(markup, /class="shop__count">2 orders</);

  /* The browsing rail is drawn, from the store the guest's own views live in. */
  assert.match(markup, /aria-label="Recently viewed"/, "the browsing rail is missing");
  assert.match(markup, /You were looking at <em>these<\/em>/);
  assert.match(markup, /alt="Phase 11 Banarasi"/, "the rail does not draw the viewed piece");
});

test("the order register states the four facts production states, from this session's orders", () => {
  storage.clear();
  app.orderService.saveOrders(ORDER_RECORDS);
  const markup = app.render();

  /* The same normalisation the contexts apply, so the expectations below are
     the application's own values and not a second reading of the fixture. */
  const order = app.orders.normaliseOrder(ORDER_RECORDS[0]);
  assert.ok(order, "the fixture is not a valid order record");

  const orderLink = anchors(markup).find((anchor) => anchor.href === `/account/orders/${order.id}`);
  assert.ok(orderLink, "the order's identifier does not link to its own page");
  assert.match(orderLink.attributes, /class="pf-account__order-id"/);
  assert.equal(orderLink.inner, order.id, "the order row does not name its own order");

  assert.ok(markup.includes(app.orders.formatOrderDate(order.createdAt)), "the order's date is not production's");
  assert.ok(markup.includes(`${app.orders.orderItemCount(order)} pieces`), "the order's size is not production's");
  assert.ok(markup.includes(app.shopping.formatINR(order.pricing.total)), "the order's total is not the record's");
  assert.ok(markup.includes(app.config.getOrderStatus(order.status).label), "the order's status is not production's");

  /* Three rows at most, with the way to the history behind them. */
  assert.equal(count(markup, 'class="pf-account__order"'), 3, "the register is not three orders");
  assert.match(markup, /class="shop__count">4 orders</, "the head does not state the whole history");
  const viewAll = anchors(markup).find((anchor) => anchor.inner.includes("View all orders"));
  assert.ok(viewAll, "the history behind the three rows is not reachable");
  assert.equal(viewAll.href, "/account/orders", "the history link does not lead to the order list");
});

test("a history of one states its own count in the singular and offers no more-orders link", () => {
  storage.clear();
  app.orderService.saveOrders([ORDER_RECORDS[1]]);
  const markup = app.render();

  assert.match(markup, /class="shop__count">1 order</, "a single order is not stated in the singular");
  assert.equal(count(markup, 'class="pf-account__order"'), 1, "the register is not one order");
  assert.ok(markup.includes(`${app.orders.orderItemCount(app.orders.normaliseOrder(ORDER_RECORDS[1]))} piece<`),
    "the single piece is not stated in the singular");
  assert.equal(anchors(markup).some((anchor) => anchor.inner.includes("View all orders")), false,
    "the page offered more orders than the history holds");
});

test("an order with no date states the dash — never the epoch the formatter would invent", () => {
  storage.clear();
  app.orderService.saveOrders([
    { ...ORDER_RECORDS[1], id: "PF-11-NODATE", createdAt: null, status: "DELIVERED" },
  ]);
  const markup = app.render();

  /* The record itself, through the same normalisation the context applies: the
     date is genuinely absent, so the page must say so. */
  const order = app.orders.normaliseOrder({ ...ORDER_RECORDS[1], id: "PF-11-NODATE", createdAt: null, status: "DELIVERED" });
  assert.equal(order.createdAt, null, "the fixture no longer normalises to an absent date");
  assert.equal(/1970/.test(markup), false, "an absent date was formatted as a real one");
  assert.match(markup, /class="pf-account__order-meta">— · /, "the row does not state the dash for an absent date");
  /* The rest of the row is still the record's own. */
  assert.ok(markup.includes(`${app.orders.orderItemCount(order)} piece<`), "the row lost its piece count");
  assert.ok(markup.includes(app.shopping.formatINR(order.pricing.total)), "the row lost its total");
  assert.ok(markup.includes(app.config.getOrderStatus(order.status).label), "the row lost its status");
});

test("an order whose status is missing or unrecognised reads unavailable — never a status it never had", () => {
  storage.clear();
  app.orderService.saveOrders([
    { ...ORDER_RECORDS[0], id: "PF-11-NOSTATUS", status: undefined },
    { ...ORDER_RECORDS[1], id: "PF-11-ODD", status: "NOT_A_REGISTERED_STATUS" },
    { ...ORDER_RECORDS[2], id: "PF-11-SHIPPED", status: "SHIPPED" },
  ]);
  const markup = app.render();

  /* The normaliser keeps an unrecognised status null ON PURPOSE, so the page
     must not turn it into the resolver's fallback definition. */
  for (const id of ["PF-11-NOSTATUS", "PF-11-ODD"]) {
    const order = app.orders.normaliseOrder({ ...ORDER_RECORDS[0], id, status: id === "PF-11-ODD" ? "NOT_A_REGISTERED_STATUS" : undefined });
    assert.equal(order.status, null, `${id} no longer normalises to an absent status`);
  }
  assert.equal(count(markup, 'class="pf-account__order-status">Status unavailable</'), 2,
    "the two unlabelled orders are not both named unavailable");
  assert.equal(/Order Confirmed/.test(markup), false, "an unknown status was given a label it never had");
  /* A status the registry DOES carry still comes from the resolver. */
  assert.match(markup, new RegExp(`class="pf-account__order-status">${app.config.getOrderStatus("SHIPPED").label}<`),
    "a valid status no longer reads through the resolver");
});

test("the wishlist block draws the design's card, and never reports an unresolved count as nothing saved", () => {
  storage.clear();
  app.orderService.saveOrders([]);

  /* A saved piece the catalogue carries: the design's own card cell, the piece
     the customer saved, the canonical media this application resolves, and the
     way to the list. */
  seedGuestWishlist(["phase11-banarasi"]);
  const saved = app.render();
  assert.match(saved, /aria-labelledby="pf-account-saved"/, "the saved block lost its own heading");
  assert.match(saved, /class="shop__count">1 piece saved</, "the block does not state what is saved");
  assert.match(saved, /class="pcard-cell"><article class="pcard /, "the block did not draw the design's card");
  assert.match(saved, /alt="Phase 11 Banarasi"/, "the block does not name the piece the customer saved");
  assert.match(saved, /href="\/product\/phase11-banarasi"/, "the saved piece does not reach its own page");
  assert.equal(/src="[^"]*\[object [^"]*"/.test(saved), false, "a media record was stringified into a src");
  assert.ok(linksTo(saved, "/account/wishlist").some((anchor) => anchor.inner.includes("View Wishlist")),
    "the way to the saved list is missing");

  /* A saved count the catalogue has not resolved yet is reported as itself —
     never as "nothing saved", and never with a stand-in card. */
  seedGuestWishlist(["phase11-gone", "phase11-also-gone"]);
  const unresolved = app.render();
  assert.match(unresolved, /class="pf-account__note">2 pieces saved — open your wishlist to see them\.</,
    "an unresolved saved count was not reported as itself");
  assert.equal(/Nothing saved yet\./.test(unresolved), false, "a saved count was reported as an empty wishlist");
  assert.equal(/pcard/.test(unresolved), false, "a stand-in card was invented for an unresolved piece");
  assert.ok(linksTo(unresolved, "/account/wishlist").some((anchor) => anchor.inner.includes("View Wishlist")),
    "the way to the list is missing");
});

test("every destination the page renders resolves to a route this application registers", () => {
  storage.clear();
  seedGuestCart(BAG_LINES);
  seedGuestWishlist(["phase11-banarasi"]);
  seedGuestBrowsing(["phase11-blouse"]);
  app.orderService.saveOrders(ORDER_RECORDS);

  const markup = app.render();
  const all = hrefs(markup);
  assert.ok(all.length > 12, `expected the page's links, found ${all.length}`);

  const unresolved = all.filter((href) => {
    const path = String(href).split(/[?#]/)[0];
    return !app.routes.isRegisteredPath(app.routes.resolveStorefrontPath(path));
  });
  assert.deepEqual(unresolved, [], `the page renders destinations this application does not serve:\n${unresolved.join("\n")}`);

  /* The three order rows and the two rails are among the links that resolved —
     the check above is not passing on an empty page. */
  for (const href of [`/account/orders/${ORDER_A}`, "/product/phase11-banarasi", "/product/phase11-blouse"]) {
    assert.ok(all.includes(href), `${href} was not rendered`);
  }
});

  /* ── 3b · the two intelligence entry points (S1 of the feature-retention plan) ─
  
     Production's dashboard opens with two bands — the dark AI Mirror panel and
     the assistant panel (`AccountDashboard.jsx:237-287`) — each pointing at a
     screen this port now serves (`/account/ai-mirror`, `/account/ai-shopping`,
     both inside the account guard). The Overview restores the entry points and
     NOTHING ELSE: no camera, no composer, no product list. Every claim a band
     makes is a claim the screen behind it already makes about itself. */
  
  const MIRROR_SCREEN = "src/components/customer/pages/account/AiMirror.jsx";
  const SHOPPING_SCREEN = "src/components/customer/pages/account/AiShopping.jsx";
  
  test("both intelligence panels keep production's own words and destinations, and copy no page", () => {
    const text = source();
  
    /* Production's two eyebrows and its two headings, verbatim, and the two
       destinations its own buttons point at. */
    assert.match(text, /PRATIKSHYA AI MIRROR/, "the mirror eyebrow left the page");
    assert.match(text, /Your digital <em>fitting room\.<\/em>/, "the mirror heading left the page");
    assert.match(text, /PRATIKSHYA AI · SHOPPING/, "the assistant eyebrow left the page");
    assert.match(text, /Your personal fashion <em>companion\.<\/em>/, "the assistant heading left the page");
    assert.match(text, /to="\/account\/ai-mirror"/, "the mirror entry points nowhere");
    assert.match(text, /to="\/account\/ai-shopping"/, "the assistant entry points nowhere");
  
    /* A door, not a copy of the room: none of either screen's own machinery is
       re-implemented on this page. */
    assert.equal(/getUserMedia|generateTryOnPreview|INITIAL_PRODUCT_COUNT|pf-ai__composer|pf-ai__stage/.test(text), false,
      "an entry point re-implements the screen behind it");
  });
  
  test("the entry points render inside the frame, as headed panels, in production's order", () => {
    emptySession();
    const markup = app.render();
  
    assert.match(markup, /aria-label="PRATIKSHYA AI"/, "the intelligence band is missing");
    assert.match(markup, /<h2[^>]*id="pf-account-ai-mirror"/, "the mirror panel carries no heading of its own");
    assert.match(markup, /<h2[^>]*id="pf-account-ai-shopping"/, "the assistant panel carries no heading of its own");

    /* Read from the band itself — the account navigation also links both screens,
       and this test is about the panels, not about the nav. */
    const band = markup.slice(
      markup.indexOf('aria-label="PRATIKSHYA AI"'),
      markup.indexOf('aria-label="Your bag"'),
    );
    const entries = anchors(band).filter((anchor) => anchor.href === "/account/ai-mirror" || anchor.href === "/account/ai-shopping");
    assert.deepEqual(entries.map((anchor) => anchor.href), ["/account/ai-mirror", "/account/ai-shopping"],
      "the two entry points are not both drawn, in production's order");
    assert.match(entries[0].inner, /Open AI Mirror/, "the mirror entry lost production's own action");
    assert.match(entries[1].inner, /Ask the Assistant/, "the assistant entry lost production's own action");
  
    /* Production draws these two bands between the shortcuts and the bag. */
    assert.ok(markup.indexOf('aria-label="PRATIKSHYA AI"') < markup.indexOf('aria-label="Your bag"'),
      "the intelligence band drifted below the bag strip");
  });
  
  test("the mirror entry states the mirror's own disclosure — never a preview this port cannot compose", () => {
    const text = source();
  
    /* The sentence the entry states about the provider is the sentence the mirror
       screen itself states about it: the demo provider composes no new image
       (`AiMirror.jsx`, its corrected closing band). */
    assert.match(text, /the demo provider composes no new image/, "the entry no longer discloses what the demo provider does");
    assert.ok(read(MIRROR_SCREEN).includes("composes no new image"),
      "the mirror screen no longer states what its provider does");
  
    /* The claim that screen refuses to make — a preview ready in moments — is not
       made here either, and no try-on is promised. */
    assert.equal(/ready in moments/i.test(text), false, "the Overview promises a preview the demo provider cannot prepare");
    assert.equal(/try it on|see it on you|see yourself/i.test(text), false, "the Overview promises a try-on the demo provider cannot compose");
  });
  
  test("the assistant entry keeps the assistant's own caption and its honest source", () => {
    const text = source();
    const shopping = read(SHOPPING_SCREEN);
  
    assert.match(text, /Demo assistant · deterministic/, "the assistant entry lost its demo disclosure");
    assert.ok(shopping.includes("Demo assistant · deterministic"),
      "the assistant screen no longer discloses what it is");
    assert.ok(shopping.includes("grounded in the live catalogue"),
      "the assistant screen no longer states where its suggestions come from");
  });
  
  test("the entry points fabricate nothing: no figure, no price, no card, no work of their own", () => {
    emptySession();
    const markup = app.render();
  
    const opening = markup.indexOf('aria-label="PRATIKSHYA AI"');
    const closing = markup.indexOf('aria-label="Your bag"');
    assert.ok(opening >= 0 && closing > opening, "the intelligence band was not found in the markup");
    const band = markup.slice(opening, closing);
  
    assert.equal(/₹/.test(band), false, "an entry point states a price");
    assert.equal(/pcard/.test(band), false, "an entry point draws a product card");
    assert.equal(/<strong>/.test(band), false, "an entry point draws a figure it has no source for");
  
    /* And no source of its own: nothing scheduled, nothing stored, no state. */
    const text = source();
    assert.equal(/setTimeout|setInterval|addEventListener|dispatchEvent/.test(text), false,
      "an entry point schedules work of its own");
    assert.equal(/useState\(|useReducer\(|useRef\(/.test(text), false, "the page keeps state of its own");
  });
  
  test("every class the page draws is styled by the port's own sheets", () => {
  const sheets = SHEETS.map(read).join("\n");
  const defined = new Set([...sheets.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((match) => match[1]));

  const drawn = new Set();
  for (const [, value] of source().matchAll(/className="([^"]+)"/g)) {
    value.split(/\s+/).filter(Boolean).forEach((token) => drawn.add(token));
  }
  assert.ok(drawn.size >= 20, `expected the page's classes, found ${drawn.size}`);

  const unstyled = [...drawn].filter((token) => !defined.has(token)).sort();
  assert.deepEqual(unstyled, [], `the page draws classes no ported sheet styles:\n${unstyled.join("\n")}`);
});

/* ── 3 · the states, and the dash rule ─────────────────────────────────────── */

test("the dash rule: a figure is published only once its list has been read", () => {
  const text = source();
  /* One helper decides a tile's figure, and it is the only place a tile's number
     is formatted — so a loading or failed source cannot show a count. */
  assert.match(text, /const tileFigure = \(\{ value, loading, failed \}\) => \(loading \|\| failed \? '—' : String\(value\)\);/);
  for (const figure of ["wishlist.count", "orders.length", "cart.count"]) {
    assert.ok(text.includes(`value: ${figure},`), `the tile figures no longer read ${figure}`);
  }
  /* The rule is the source's own state, never a page-local guess, and a source
     that already holds rows keeps showing them. */
  assert.ok(text.includes("wishlist.isLoading && wishlist.count === 0"), "the wishlist tile no longer waits for its own read");
  assert.ok(text.includes("isLoadingOrders && orders.length === 0"), "the order tile no longer waits for its own read");
  assert.ok(text.includes("cart.isLoading && cart.count === 0"), "the bag tile no longer waits for its own read");
  assert.match(text, /const ordersFailed = Boolean\(ordersError\) && orders\.length === 0;/);
  assert.match(text, /const wishlistLoading = wishlist\.isLoading && wishlist\.count === 0;/);
  assert.match(text, /ordersLoading \|\| ordersFailed \? '—' : orderCountLabel/,
    "the order head no longer withholds a count it has not read");

  /* The loading branch is announced, and a finished empty read is not. */
  const loading = source().slice(source().indexOf("ordersLoading ? ("), source().indexOf("ordersLoading ? (") + 200);
  assert.match(loading, /aria-busy="true" aria-label="Loading your orders"/,
    "the loading branch is not announced to a reader");

  emptySession();
  assert.equal(/aria-busy/.test(app.render()), false, "a finished read still announced itself as loading");
});

test("the failure branch is the application's own, never an empty history", () => {
  const text = source();
  /* 401/403 is a lapsed session with the way back; anything else keeps the
     context's own message and retries through the context's own method. */
  assert.match(text, /const lapsed = status === 401 \|\| status === 403;/);
  assert.match(text, /'Please sign in again to see your orders\.'/);
  assert.match(text, /'We could not load your orders right now\.'/);
  assert.match(text, /<Button to="\/signin\?returnTo=%2Faccount">Sign in<\/Button>/);
  assert.match(text, /<Button onClick=\{\(\) => onRetry\(\)\}>Try again<\/Button>/);
  assert.ok(text.includes("{!lapsed && message ? <p>{message}</p> : null}"),
    "the application's own error message is no longer shown");
  assert.match(text, /<OrdersFailed status=\{ordersErrorStatus\} message=\{ordersError\} onRetry=\{refreshOrders\} \/>/,
    "the failure branch is no longer the order context's own state and retry");
  /* A failed order read is a failed read — the empty invitation is a different
     branch entirely. */
  assert.match(text, /\) : recentOrders\.length \? \(/, "the failed read and the empty history share a branch");
});

test("an unresolved or failed account read is never drawn as an empty profile", () => {
  /* The resolved case, rendered: an account whose read returned nothing is
     genuinely empty, and its cards say so. */
  emptySession();
  const resolved = app.render();
  assert.equal(count(resolved, 'class="pf-account__card"'), 3, "the resolved-empty account lost its cards");
  assert.match(resolved, /No default address set\./, "the resolved-empty account no longer states its empty address book");

  /* The other two states cannot be reached in a server render — the account is
     loaded by the context's own effect, and effects do not run here — so they
     are pinned where they live, at the source, exactly as the order block's
     loading and failure branches are. */
  const text = source();
  assert.match(text, /const accountLoading = isLoadingAccount && !profile;/,
    "the page no longer waits for the account read before calling it empty");
  assert.match(text, /const accountFailed = Boolean\(loadError\) && !profile;/,
    "the page no longer distinguishes a failed account read from an empty account");
  assert.match(text, /const \{[\s\S]*?isLoading: isLoadingAccount, loadError, loadErrorStatus,[\s\S]*?\} = useAccount\(\);/,
    "the page no longer reads the account's own state");

  /* The loading branch is announced, and its copy is the page's own voice. */
  assert.match(text, /<div className="empty" aria-busy="true" aria-label="Loading your account">/);
  assert.match(text, /Gathering your account&hellip;/);

  /* The failure branch states the read's own message, names a lapsed session
     as one, and offers the sign-in route that already exists. */
  assert.match(text, /<AccountUnavailable status=\{loadErrorStatus\} message=\{loadError\} \/>/,
    "the failure branch is no longer the account context's own state");
  assert.match(text, /const lapsed = status === 401 \|\| status === 403;/);
  assert.match(text, /'Please sign in again to see your account\.'/);
  assert.match(text, /<Button to="\/signin\?returnTo=%2Faccount">Sign in<\/Button>/);
  assert.ok(text.includes("{!lapsed && message ? <p>{message}</p> : null}"),
    "the account context's own error message is no longer shown");

  /* And the page invents no handler of its own: the ONE action it owns is the
     order context's own retry (there is no account retry — the context exposes
     no reload — so none is offered). */
  const handlers = [...text.matchAll(/onClick=\{([^}]*)\}/g)].map((match) => match[1].trim());
  assert.deepEqual(handlers, ["() => onRetry()"], `the page owns unexpected handlers: ${handlers.join(", ")}`);
});

/* ── 4 · the prototype's behaviour is not carried over ─────────────────────── */

test("the page keeps no state, touches no storage, calls no API and names no fixture", () => {
  const text = code();
  assert.equal(/\buseState\(|\buseReducer\(|\buseRef\(/.test(text), false, "the page keeps state of its own");
  assert.equal(/localStorage|sessionStorage/.test(text), false, "the page reached for a device store");
  assert.equal(/aarna:profile/.test(text), false, "the design prototype's profile key is read by the page");
  assert.equal(/no server account|prototype storefront/i.test(text), false, "the prototype's prose is rendered by the page");
  assert.equal(/\bfetch\(|apiGet|apiPost|axios\b/.test(text), false, "the page calls the network directly");
  assert.equal(/to="[^"]*#"|href="#"/.test(text), false, "the page renders a dead link");
  assert.equal(/onClick=\{\(\) => \{\}\}/.test(text), false, "the page renders an inert action");
  /* The only action the page owns is the context's own retry, and it is the
     context's function that is called — never a local one. */
  const handlers = [...text.matchAll(/onClick=\{([^}]*)\}/g)].map((match) => match[1].trim());
  assert.deepEqual(handlers, ["() => onRetry()"], `the page owns unexpected handlers: ${handlers.join(", ")}`);
  /* No fixture, no preview seam: the production graph of the port stays clean. */
  assert.equal(/preview\//.test(text), false, "the page reaches the preview harness");
  assert.equal(/previewCustomerFixtures|CUSTOMER_PREVIEW/.test(text), false, "the page names the fixtures");
});

test("every import the page declares is a module of this repository", () => {
  const text = code();
  const specifiers = [...text.matchAll(/^import\s+(?:[^'"]*?from\s+)?["']([^"']+)["'];/gm)].map((match) => match[1]);
  assert.ok(specifiers.length >= 15, `expected the page's imports, found ${specifiers.length}`);

  for (const specifier of specifiers) {
    if (specifier === "react") continue;
    assert.match(specifier, /^\./, `the page imports an external package: ${specifier}`);
    assert.equal(existsSync(join(ROOT, "src/components/customer/pages/account", specifier)), true,
      `${specifier} does not resolve from the page`);
  }
  /* React is the only platform import, and no new dependency is named. */
  assert.equal(specifiers.filter((specifier) => !specifier.startsWith(".")).join(","), "react");
});

test("the tab title and the noindex marker are the production dashboard's own", () => {
  const text = source();
  const production = read(PRODUCTION_DASHBOARD);
  assert.match(text, /document\.title = 'My PRATIKSHYA — PRATIKSHYA FASHION';/);
  assert.ok(production.includes("My PRATIKSHYA — PRATIKSHYA FASHION"), "the title is no longer production's");
  assert.match(text, /document\.querySelector\('meta\[name="robots"\]'\)/);
  assert.match(text, /node\.setAttribute\('content', 'noindex, nofollow'\);/);
  assert.ok(production.includes("noindex, nofollow"), "the noindex marker is no longer production's");
  /* Both are restored when the screen is left, and both are effects — a server
     render never runs them, which is why they are pinned here and not in markup. */
  assert.match(text, /document\.title = previous;/, "the title is no longer restored on unmount");
  /* The name has two real sources and no stand-in: the account, then the session. */
  assert.match(text, /const firstName = profile\?\.firstName \|\| user\?\.firstName \|\| '';/);
  assert.equal(/\|\| 'there'|'Guest'|'Customer'/.test(text), false, "a stand-in greeting name entered the page");
});

test("the page's own stylesheet stays scoped to the port, token-only and free of dead rules", () => {
  const sheet = read(SHEET);
  const stripped = sheet.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/!important/.test(stripped), false, "the stylesheet forces declarations");
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(stripped), false, "the stylesheet hard-codes a colour");

  const selectors = [...stripped.matchAll(/^[ \t]*([^@\s][^{}\n]*)\{/gm)].map((match) => match[1].trim()).filter(Boolean);
  assert.ok(selectors.length > 20, `expected the sheet's selectors, found ${selectors.length}`);
  for (const selector of selectors) {
    assert.match(selector, /^\.aan-root /, `${selector} is not scoped to the port`);
  }

  const tokens = new Set([...read("src/components/customer/aarna.css").matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  for (const [, token] of sheet.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
    assert.ok(tokens.has(token), `${token} is not a token the design defines`);
  }
});

/* ── 5 · the account session the page waits on ─────────────────────────────── */

/* The customer's own details are stated only as far as the shared account
   context has read them, so the states below are read from that context. A
   session holding a customer token owes exactly one read, opened in the render
   that first sees the identity; until it lands the session is LOADING — never an
   account with nothing on file. The read's own lifecycle (in flight, failed,
   superseded, ended, replaced by another identity) runs in effects, which a
   server render does not execute, so everything past that first render is pinned
   where it lives, in `AccountContext.jsx`. */
const CONTEXT = "src/context/AccountContext.jsx";

test("a session that owes a read is announced as loading, and the empty account is not drawn for it", () => {
  /* Without a customer token nothing is owed, and the account really is settled
     and empty: the cards' own words are the true ones. */
  emptySession();
  const settled = app.render();
  assert.match(settled, /No phone added/, "a settled empty account lost its own words");
  assert.match(settled, /0 addresses saved/);
  assert.match(settled, /No default address set\./);
  assert.equal(settled.includes("Loading your account"), false, "a settled account was announced as loading");

  /* With one, and no read of the account yet, the same screen must wait. The api
     client reads the GLOBAL `localStorage` (the application's guest-state
     helpers read `window.localStorage`), so this harness's one store is exposed
     as both for the length of the test. */
  const { setTokens, clearTokens } = app.api;
  globalThis.localStorage = localStorageStub;
  try {
    setTokens({ accessToken: "pf-phase11-access", refreshToken: "pf-phase11-refresh" }, "customer");
    const waiting = app.render();

    assert.match(waiting, /aria-busy="true"/, "a session that owes a read is not announced as busy");
    assert.match(waiting, /aria-label="Loading your account"/, "the account read is not announced");
    /* The entity is decoded before it reaches the markup: the rendered text is
       the real character, so the pattern is the real character. */
    assert.match(waiting, /Gathering your account…/);
    for (const line of ["No phone added", "addresses saved", "No default address set."]) {
      assert.equal(waiting.includes(line), false, `a session that owes a read stated "${line}"`);
    }
    /* The page's own furniture — its tiles — stays; only the account's lines wait. */
    assert.equal(tiles(waiting).length, 3, "the tiles left with the account read");
  } finally {
    clearTokens("customer");
    delete globalThis.localStorage;
  }
});

test("the account read is owed by a signed-in session holding a customer token, from its first render", () => {
  const context = read(CONTEXT);
  assert.match(context, /const identity = user\?\.id \?\? null;/, "the context no longer names the identity it reads for");
  assert.match(context, /const hasSession = Boolean\(identity\) && Boolean\(getAccessToken\("customer"\)\);/,
    "the context no longer says which sessions owe an account read");
  assert.match(context, /const \[isLoading, setIsLoading\] = useState\(\(\) => Boolean\(getAccessToken\("customer"\)\)\);/,
    "a session that owes a read starts settled — the empty account is drawn first");
  assert.equal(context.includes("const [isLoading, setIsLoading] = useState(false);"), false,
    "the loading state starts settled again");
  /* And the page waits on exactly that flag before it states anything about the account. */
  const page = source();
  assert.match(page, /isLoading: isLoadingAccount, loadError, loadErrorStatus,/);
  assert.match(page, /const accountLoading = isLoadingAccount && !profile;/);
});

test("a successful read publishes the server's own account, once per identity", () => {
  const context = read(CONTEXT);
  const fetch = context.slice(context.indexOf("apiGetMe().then("));
  for (const line of [
    "profile:     result.profile,",
    "addresses:   result.addresses,",
    "preferences: result.preferences,",
    "security:    result.security,",
  ]) assert.ok(fetch.includes(line), `the account no longer takes ${line.trim()}`);
  const success = fetch.slice(fetch.indexOf("if (result.ok) {"), fetch.indexOf("} else {"));
  assert.ok(success.includes("setLoadError(null);") && success.includes("setLoadErrorStatus(null);"),
    "a successful read leaves the previous read's error behind");

  /* One read per identity: the identity is its only trigger, nothing else in the
     context fetches an account, and the held one is dropped only by the identity
     change and the two session-less paths — so a re-render, a profile update or
     an ordinary refresh of the same customer keeps what it holds. */
  assert.equal(context.split("apiGetMe()").length - 1, 1, "the account is fetched from more than one place");
  /* Phase 12: the read has ONE other trigger — the explicit retry (`refreshAccount`)
     bumps `reloadToken`. Nothing else may bump it. */
  assert.match(context, /\}, \[user\?\.id, reloadToken\]\);/, "the read follows something other than the identity and the explicit retry");
  assert.equal(context.split("setReloadToken(").length - 1, 1, "the retry counter is bumped from somewhere other than refreshAccount");
  assert.equal(context.split("setAccountData(EMPTY_ACCOUNT)").length - 1, 3,
    "the held account is dropped somewhere other than the identity change and the two session-less paths");
});

test("a failed read ends the loading, states the read's own error and fabricates no account", () => {
  const context = read(CONTEXT);
  const fetch = context.slice(context.indexOf("apiGetMe().then("));
  assert.ok(fetch.indexOf("setIsLoading(false);") < fetch.indexOf("if (result.ok) {"),
    "a failed read can leave the screen loading for ever");
  const failure = fetch.slice(fetch.indexOf("} else {"), fetch.indexOf("} else {") + 300);
  assert.ok(failure.includes('setLoadError(result.error ?? "Could not load your account.");'),
    "the read's own message is no longer shown");
  assert.ok(failure.includes("setLoadErrorStatus(result.status ?? 0);"),
    "the read's own status is no longer kept for the 401/403 branch");
  assert.equal(failure.includes("setAccountData"), false, "a failed read now writes an account");
  /* And that is the state the page names as failed rather than as an empty account. */
  assert.match(source(), /const accountFailed = Boolean\(loadError\) && !profile;/);
});

test("a changed identity is dropped in that same render, and an ended session leaves nothing loading", () => {
  const context = read(CONTEXT);
  assert.match(context, /if \(sessionIdentity !== identity\) \{/, "the identity change is no longer detected");
  const branch = context.slice(context.indexOf("if (sessionIdentity !== identity) {"));
  const body = branch.slice(0, branch.indexOf("setIsLoading(hasSession);") + "setIsLoading(hasSession);".length);
  for (const line of [
    "setSessionIdentity(identity);",
    "setAccountData(EMPTY_ACCOUNT);",
    "setLoadError(null);",
    "setLoadErrorStatus(null);",
    "setIsLoading(hasSession);",
  ]) assert.ok(body.includes(line), `the identity change no longer runs ${line}`);

  /* The drop belongs to the render, not to an effect: it is written before the
     read effect, so the commit that first sees a new identity cannot carry the
     previous customer's account — or that customer's error. */
  assert.ok(context.indexOf("if (sessionIdentity !== identity) {") < context.indexOf("useEffect(() => {"),
    "the previous identity's account is dropped after the effects");
  assert.ok(context.indexOf("if (sessionIdentity !== identity) {") < context.indexOf("apiGetMe()"),
    "the previous identity's account is dropped after the read starts");

  /* Every path that no longer owes a read ends the loading state as well — the
     session ending, and a session whose customer token has gone. */
  for (const guard of ['if (!user?.id) {', 'if (!getAccessToken("customer")) {']) {
    const at = context.indexOf(guard);
    assert.ok(at !== -1, `${guard} left the context`);
    const block = context.slice(at, context.indexOf("return undefined;", at));
    assert.ok(block.includes("setAccountData(EMPTY_ACCOUNT);"), `${guard} no longer drops the account`);
    assert.ok(block.includes("setIsLoading(false);"), `${guard} no longer ends the loading state`);
  }

  /* The fetch's own cleanup leaves the flag to the run that replaces it, so a
     cancelled request can never clear the flag of the request that superseded it. */
  assert.match(context, /return \(\) => \{ cancelled = true; \};/);
  assert.equal(/cancelled = true; \};[^\n]*setIsLoading/.test(context), false,
    "the cleanup now clears the loading flag of the run that replaces it");
});

/* ── 6 · the two commerce panels (S2 of the feature-retention plan) ──────────

   Production's dashboard carries two commerce bands below its entry points: the
   offers THIS customer can redeem and the collections the house features
   (`AccountDashboard.jsx:484-551`). The Overview restores both through the
   repositories that own them — `offerRepository.listCustomerVisible` with the
   customer's own id and address, `taxonomyRepository.activeCollections()` with
   production's featured-or-listed filter — and keeps the design's restraint on
   the count: three offers and four collections (production shows five), with a
   panel whose source holds nothing eligible omitted rather than drawn as an
   empty grid.

   Two of the states below need a source no other test seeds. The offers cache is
   filled by the store's own hydrate, from `GET /offers`, so the panel is
   exercised against real coupon records served through a stubbed transport,
   exactly as `customerLiveCatalogue.test.js` does; and a collection's cover is
   resolved through the port's media layer, so a record is written through
   `mediaRepository.create` and removed again through `mediaRepository.resetMedia`.
   Both are the application's OWN APIs — nothing here is a fixture standing in for
   one — and both runs restore the catalogue snapshot the suite mounted with. */

/* A collection in the shape the taxonomy normalises, carrying the two switches
   the panel's filter reads: `featured`, and `status`/`displayStatus` for
   `activeCollections`. */
const collectionRecord = (id, over = {}) => ({
  id,
  name: id,
  slug: id,
  eyebrow: "",
  description: "",
  status: "ACTIVE",
  displayStatus: "ACTIVE",
  featured: false,
  sortOrder: 0,
  ...over,
});

const COVER_URL = "/fixtures/phase11/banarasi-cover.jpg";

/* One panel, read from its own `<section>` to its own close. The page grows a
   section at a time, and a slice bounded by the NEXT panel's heading would
   quietly swallow whatever is added between the two. */
const panelFor = (markup, id) => {
  const at = markup.indexOf(`aria-labelledby="${id}"`);
  if (at < 0) return "";
  const from = markup.lastIndexOf("<section", at);
  const to = markup.indexOf("</section>", at);
  return to > from ? markup.slice(from, to + "</section>".length) : "";
};

const seedCatalogue = (collections = []) =>
  app.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections });
/* The snapshot the suite mounted with, restated: a panel test may seed its own
   taxonomy, and every one of them hands the store back exactly as it found it. */
const restoreCatalogue = () => seedCatalogue([]);

/* A coupon in the shape the offers api maps — the backend's own column names.
   Four of these records are redeemable by this session; the paused one and the
   one issued to another customer are dropped by the repository itself. */
const coupon = (over = {}) => ({
  id: "coupon-1",
  code: "FESTIVE10",
  name: "Festive 10",
  description: "10% off the festive edit",
  discount_type: "percentage",
  discount_value: 10,
  minimum_order_value: 0,
  starts_at: "2026-09-01T00:00:00.000Z",
  expires_at: null,
  is_active: true,
  display_status: "ACTIVE",
  ...over,
});

const COUPONS = [
  coupon({ id: "coupon-1", code: "FESTIVE10", discount_value: 10, minimum_order_value: 5000, expires_at: "2026-12-31T23:59:59.000Z" }),
  coupon({ id: "coupon-2", code: "ATELIER500", discount_type: "fixed", discount_value: 500, minimum_order_value: 10000 }),
  coupon({ id: "coupon-3", code: "SILK15", discount_value: 15 }),
  coupon({ id: "coupon-4", code: "FOURTH20", discount_value: 20 }),
  coupon({ id: "coupon-5", code: "PAUSED25", discount_value: 25, is_active: false, display_status: "PAUSED" }),
  coupon({ id: "coupon-6", code: "PRIVATE30", discount_value: 30, eligible_customer_ids: ["customer-elsewhere"] }),
];

test("the two commerce panels are production's own reads, held to the design's restraint", () => {
  const text = source();
  const production = read(PRODUCTION_DASHBOARD);

  /* The offers panel asks the repository production asks, with production's own
     argument — the customer's id and the address the account states — and no
     filter of its own. */
  assert.match(text, /offerRepository\s+\.listCustomerVisible\(\{ customerId: user\?\.id, customerEmail: user\?\.email \|\| profile\?\.email \}\)/,
    "the offers panel no longer reads the repository as production does");
  /* Production states the same two arguments, one per line; whitespace is not the
     comparison here, the argument object is. */
  assert.match(production, /\.listCustomerVisible\(\{ customerId: user\?\.id, customerEmail: user\?\.email \|\| profile\?\.email \}\)/,
    "Aarna no longer scopes offers to the signed-in customer");
  assert.match(text, /\.slice\(0, OFFER_LIMIT\),\s+\[user\?\.id, user\?\.email, profile\?\.email\],/,
    "the offers panel is no longer keyed on the customer's identity alone");

  /* Production's own refresh rule, kept: the identity is the read's only trigger,
     so the offers register's change event is deliberately not subscribed — a list
     the server changed arrives with the store's next hydrate. */
  assert.equal(/OFFERS_CHANGED_EVENT|addEventListener|dispatchEvent/.test(text), false,
    "the offers panel subscribes to a change event production does not use");

  /* Production's featured-or-listed filter, with production's own five ids: the
     list is read from production here, so a copy that drifted fails. */
  const literal = (production.match(/const FEATURED_COLLECTION_IDS = (\[[^\]]*\]);/) ?? [])[1];
  assert.ok(literal, "Aarna no longer declares its curated collection IDs");
  const featuredIds = [...literal.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(featuredIds, ["new-arrivals", "bridal-trousseau", "festive-edit", "silk", "wedding"],
    "production's own fallback list moved — the page's copy of it is now wrong");
  assert.match(text, new RegExp(`FEATURED_COLLECTION_IDS = \\[${featuredIds.map((id) => `'${id}'`).join(", ")}\\]`),
    "the page's featured list is not production's own");
  assert.match(text, /taxonomyRepository\s+\.activeCollections\(\)\s+\.filter\(\(entry\) => entry\.featured \|\| FEATURED_COLLECTION_IDS\.includes\(entry\.id\)\)/,
    "the collections panel no longer filters production's way");

  /* The design's restraint is deliberate and stricter than production's: three
     offers and four collections, where production shows three and five. */
  assert.match(text, /const OFFER_LIMIT = 3;/, "the offers restraint left the page");
  assert.match(text, /const COLLECTION_LIMIT = 4;/, "the collections restraint left the page");
  assert.match(text, /\.slice\(0, OFFER_LIMIT\),/, "the offers panel draws more than its restraint");
  assert.match(text, /\.slice\(0, COLLECTION_LIMIT\),\s+\[\],/, "the collections panel draws more than its restraint, or no longer reads once");
  assert.match(production, /const OFFER_LIMIT = 3;/, "Aarna's offer cap moved");
  assert.match(production, /const COLLECTION_LIMIT = 4;/, "Aarna's collection cap moved");
  assert.match(production, /\.slice\(0, OFFER_LIMIT\)/);
  assert.match(production, /\.slice\(0, COLLECTION_LIMIT\)/);

  /* Nothing new is remembered, stored or fetched for either panel: both reads are
     the repositories' own synchronous answers about this customer. */
  assert.equal(/useState\(|useReducer\(|useRef\(/.test(text), false, "a commerce panel keeps state of its own");
  assert.equal(/localStorage|sessionStorage/.test(text), false, "a commerce panel reached for a device store");
  assert.equal(/fetch\(|apiGet|apiPost|axios\b/.test(text), false, "a commerce panel calls the network itself");
  const handlers = [...text.matchAll(/onClick=\{([^}]*)\}/g)].map((match) => match[1].trim());
  assert.deepEqual(handlers, ["() => onRetry()"], `a commerce panel owns a handler of its own: ${handlers.join(", ")}`);
});

test("a catalogue with nothing eligible draws no panel at all — never an empty grid, never a stand-in", () => {
  try {
    seedCatalogue([]);
    emptySession();
    const markup = app.render();

    /* Neither repository holds anything: there is no panel to draw, and neither
       one is drawn as an empty grid under a heading it cannot fill. */
    assert.deepEqual(app.offers.offerRepository.listCustomerVisible({}), [], "the harness seeded an offer");
    assert.deepEqual(app.taxonomy.taxonomyRepository.activeCollections(), [], "the harness seeded a collection");
    for (const panel of ["pf-account-offers", "pf-account-collections"]) {
      assert.equal(markup.includes(panel), false, `${panel} is drawn with no eligible source`);
    }
    assert.equal(/pf-account__offer\b/.test(markup), false, "an offer card is drawn with no offer");
    assert.equal(/pf-account__collection\b/.test(markup), false, "a collection tile is drawn with no collection");
    assert.equal(/<img/.test(markup), false, "a plate was invented for a source that holds nothing");

    /* The page's own furniture is untouched by the omission — the tiles, the
       entry points, the wishlist and the account cards are all still drawn. */
    assert.equal(tiles(markup).length, 3, "the omission took the tiles with it");
    assert.match(markup, /aria-label="PRATIKSHYA AI"/, "the omission took the entry points with it");
    assert.match(markup, /aria-labelledby="pf-account-saved"/, "the omission took the wishlist with it");
    assert.match(markup, /aria-label="Account details"/, "the omission took the account cards with it");
  } finally {
    restoreCatalogue();
  }
});

test("the collections panel is the repository's own eligible entries, capped at four, each into its collection", () => {
  /* Seven records, each pinning one branch of the filter. The two that must NOT
     be drawn are ordered FIRST, so an unfiltered page would draw them instead of
     the eligible pair behind them — the filter is visible in what is rendered,
     not only in the source. */
  const entries = [
    collectionRecord("spring-drop", { name: "Spring Drop", sortOrder: 0 }),
    collectionRecord("draft-edit", { name: "Draft Edit", sortOrder: 1, featured: true, status: "DRAFT", displayStatus: "DRAFT" }),
    collectionRecord("new-arrivals", { name: "New Arrivals", sortOrder: 2, eyebrow: "", description: "" }),
    collectionRecord("silk", { name: "Silk", sortOrder: 3, featured: true, description: "The silk edit." }),
    collectionRecord("bridal-trousseau", { name: "Bridal Trousseau", sortOrder: 4, eyebrow: "The wedding" }),
    collectionRecord("festive-edit", { name: "Festive Edit", sortOrder: 5 }),
    collectionRecord("wedding", { name: "Wedding", sortOrder: 6 }),
  ];
  try {
    seedCatalogue(entries);
    emptySession();
    const markup = app.render();

    const panel = panelFor(markup, "pf-account-collections");
    assert.ok(panel, "the collections panel was not found in the markup");
    assert.match(panel, /<p class="label">The house<\/p>/, "the collections panel lost production's eyebrow");
    assert.match(panel, /<h2 id="pf-account-collections" class="display shop__title">Featured <em>collections<\/em>/, "the collections heading left the page");
    assert.equal(/shop__count/.test(panel), false, "the collections panel states a count production does not state");

    const drawn = anchors(panel).filter((anchor) => /class="pf-account__collection"/.test(anchor.attributes));
    assert.deepEqual(drawn.map((anchor) => anchor.href), [
      "/collections/new-arrivals",
      "/collections/silk",
      "/collections/bridal-trousseau",
      "/collections/festive-edit",
    ], "the page drew a different four collections than the repository's own filter allows");
    for (const absent of ["wedding", "spring-drop", "draft-edit"]) {
      assert.equal(drawn.some((anchor) => anchor.href === `/collections/${absent}`), false,
        `${absent} was drawn although it is not an eligible active collection`);
    }

    /* Each tile is the record's own statements: the fallback eyebrow and the
       description are drawn only when the record carries them. */
    const [newArrivals, silk, bridal, festive] = drawn;
    assert.match(newArrivals.inner, /class="label pf-account__collection-eyebrow"[^>]*>Collection</,
      "a collection with no eyebrow no longer falls back to production's own word");
    assert.match(bridal.inner, /class="label pf-account__collection-eyebrow"[^>]*>The wedding</, "a collection's own eyebrow is not drawn");
    assert.match(silk.inner, /class="pf-account__collection-line"[^>]*>The silk edit\.</, "a collection's own line is not drawn");
    assert.equal(/pf-account__collection-line/.test(newArrivals.inner), false, "a collection with no line invented one");
    for (const [name, anchor] of [["New Arrivals", newArrivals], ["Silk", silk], ["Bridal Trousseau", bridal], ["Festive Edit", festive]]) {
      assert.match(anchor.inner, new RegExp(`class="display pf-account__collection-name"[^>]*>${name}<`), `${name}'s own name is not drawn`);
      assert.match(anchor.inner, /class="arrow-link pf-account__collection-link"[^>]*><span>Explore Collection</, `${name} lost its own invitation`);
    }

    /* Every tile's destination is a route this application registers, and the
       covers are the resolver's business — with nothing in the register, no
       plate is drawn at all. */
    for (const anchor of drawn) {
      const path = String(anchor.href).split(/[?#]/)[0];
      assert.equal(app.routes.isRegisteredPath(app.routes.resolveStorefrontPath(path)), true, `${path} is not a route this application serves`);
    }
    assert.equal(/<img/.test(panel), false, "a plate was drawn for a collection the media register does not hold");
  } finally {
    restoreCatalogue();
  }
});

test("a collection's cover is the media register's own, and a cover it cannot resolve is not replaced", () => {
  /* A collection whose membership reaches one of the suite's own products, so the
     resolver's member-product path answers. */
  const entry = collectionRecord("new-arrivals", { name: "New Arrivals", sortOrder: 1, explicitProductIds: ["phase11-banarasi"] });
  try {
    seedCatalogue([entry]);
    emptySession();
    app.media.resetMedia();
    const record = app.media.create({
      scope: "product",
      productId: "phase11-banarasi",
      type: "image",
      url: COVER_URL,
      status: "ACTIVE",
      width: 1200,
      height: 1500,
      alt: "",
    });
    assert.ok(record && record.status === "ACTIVE", "the media record was not written to the register");
    assert.equal(record.role, "COVER", "the product's first image is no longer its cover");

    /* The plate is the resolver's own url, reached through the port's single media
       path — never a second way of spelling an image. */
    const url = app.mediaPaths.normalizeMediaReference(app.mediaResolver.resolveCollectionCover(app.taxonomy.taxonomyRepository.activeCollections()[0]));
    assert.equal(url, COVER_URL, "the resolver no longer answers with the record's own url");
    const markup = app.render();
    const plate = (markup.match(/<img[^>]*pf-account__collection-img[^>]*>/) ?? [])[0];
    assert.ok(plate, "the tile drew no plate for a cover the register holds");
    assert.ok(plate.includes(`src="${url}"`), "the plate is not the resolver's own url");
    assert.ok(plate.includes('alt=""') && plate.includes('loading="lazy"'), "the plate lost its empty alt or its lazy load");
    assert.equal(/<img[^>]*src=""/.test(markup), false, "a plate was drawn with an empty source");

    /* The register emptied — the plate goes with it. Nothing is substituted. */
    app.media.resetMedia();
    const emptied = app.render();
    assert.equal(/pf-account__collection-img/.test(emptied), false, "a plate outlived the record it came from");

    /* And a plate the browser cannot load is hidden rather than replaced, through
       the port's own helper. */
    const text = source();
    assert.match(text, /import \{ hideBrokenMedia \} from '\.\.\/\.\.\/utils\/mediaFallback\.js';/,
      "the tile no longer uses the port's own broken-media handler");
    assert.match(text, /onError=\{hideBrokenMedia\}/, "a plate that fails to load is no longer hidden");
    for (const substitute of ["placeholder", "placehold", "no-image", "picsum"]) {
      assert.equal(text.includes(substitute), false, `the page names a stand-in image: ${substitute}`);
    }
  } finally {
    app.media.resetMedia();
    restoreCatalogue();
  }
});

test("the offers panel states what this customer can redeem, capped at three, each with its own way to shop", async () => {
  const originalFetch = globalThis.fetch;
  try {
    emptySession();
    app.media.resetMedia();

    /* `GET /offers` is the store's own source for the offers cache, so the records
       are served through its own hydrate — the path a browser takes, minus the
       network. */
    const envelope = (url) => {
      if (url.includes("/products")) return { items: [], total: 0, page: 1, pageSize: 100 };
      if (url.includes("/categories") || url.includes("/subcategories") || url.includes("/stock")) return { items: [], total: 0 };
      if (url.includes("/collections")) return { items: [], total: 0 };
      if (url.includes("/offers")) return { offers: COUPONS, total: COUPONS.length };
      return {};
    };
    globalThis.fetch = async (input) =>
      new Response(JSON.stringify(envelope(String(input?.url ?? input))), { status: 200, headers: { "content-type": "application/json" } });
    await app.store.hydrateCatalog({ force: true });

    const held = app.offers.offerRepository.listCustomerVisible({ customerId: null, customerEmail: null });
    assert.deepEqual(held.map((offer) => offer.code), ["FESTIVE10", "ATELIER500", "SILK15", "FOURTH20"],
      "the repository no longer resolves this fixture to the four redeemable coupons");
    const expected = held.slice(0, 3);

    const markup = app.render();
    const panel = panelFor(markup, "pf-account-offers");
    assert.ok(panel, "the offers panel is missing while three redeemable offers are held");

    assert.match(panel, /<p class="label">Atelier offers<\/p>/, "the offers panel lost production's eyebrow");
    assert.match(panel, /<h2 id="pf-account-offers" class="display shop__title">For <em>you<\/em>/, "the offers heading left the page");
    assert.match(panel, /<p class="shop__count">3 offers<\/p>/, "the offers panel states a count of its own");

    /* Every card is the repository's own record, with the repository's own
       formatters — never a second copy of the arithmetic. */
    const cards = [...panel.matchAll(/<article class="pf-account__offer">([\s\S]*?)<\/article>/g)].map(([, inner]) => inner);
    assert.deepEqual(
      cards.map((card) => (card.match(/<p class="pf-account__offer-code">([^<]*)<\/p>/) ?? [])[1]),
      expected.map((offer) => offer.code),
      "the cards are not the repository's own offers, in its own order",
    );
    expected.forEach((offer, index) => {
      const card = cards[index];
      assert.ok(card.includes(app.offers.formatOfferDiscount(offer)), `${offer.code} lost the repository's own discount`);
      assert.ok(card.includes(app.offers.describeEligibility(offer)), `${offer.code} lost the eligibility the repository describes`);
      if (offer.minimumOrderValue > 0) {
        assert.ok(card.includes(`Min ${app.shopping.formatINR(offer.minimumOrderValue)}`), `${offer.code} lost its minimum`);
      } else {
        assert.equal(/Min /.test(card), false, `${offer.code} states a minimum it does not have`);
      }
      if (offer.endDate) {
        assert.ok(card.includes(`Until ${offer.endDate}`), `${offer.code} lost its end date`);
      } else {
        assert.equal(/Until /.test(card), false, `${offer.code} states an end date it does not have`);
      }
      const link = anchors(card).filter((anchor) => /class="arrow-link pf-account__offer-link"/.test(anchor.attributes));
      assert.deepEqual(link.map((anchor) => anchor.href), ["/shop"], `${offer.code} has no way into the catalogue`);
    });

    /* One section-level action, in the design's own register, and every
       destination on the panel resolves to a route this application serves. */
    const actions = anchors(panel).filter((anchor) => /class="btn btn--ghost"/.test(anchor.attributes));
    assert.deepEqual(actions.map((anchor) => anchor.href), ["/shop"], "the offers panel declares a different section action");
    assert.match(actions[0].inner, /Continue Shopping/, "the section action lost its own words");
    for (const href of hrefs(panel)) {
      const path = String(href).split(/[?#]/)[0];
      assert.equal(app.routes.isRegisteredPath(app.routes.resolveStorefrontPath(path)), true, `${path} is not a route this application serves`);
    }

    /* And the two coupons this customer cannot redeem, and the fourth that the
       restraint drops, are nowhere on the page — the store holds them all. */
    assert.equal(app.store.getOffers().length, COUPONS.length, "the store did not take the whole coupon list");
    for (const code of ["FOURTH20", "PAUSED25", "PRIVATE30"]) {
      assert.equal(markup.includes(code), false, `${code} is drawn although this customer cannot redeem it`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreCatalogue();
  }
});

/* ── 7 · the style panel and the personal edit (S3 of the retention plan) ────

   Production's dashboard ends with two personal blocks: the style panel that
   states what it has noticed about the customer's taste, and the "Just for you"
   rail (`AccountDashboard.jsx:466-590`). The Overview restores both on ONE
   read of the application's own deterministic personalisation
   (`services/customer/personalization.js`) so the panel and the rail can never
   disagree, and it keeps the approved restraint: a rail is drawn only when that
   read found a genuine signal AND a piece is left to show, never from the
   catalogue slice the ranking falls back to when it has nothing to rank by.

   ONE BRANCH CANNOT BE RENDERED HERE. The style panel states saved preferences
   through `getStylePreferences(user?.id)`, and `user` is published by an effect
   in the auth context — a server render never runs it, so the saved-preferences
   branch is pinned at the source level below, and the service contract it rides
   on is executed against the service's own store instead. */

const VEIL = {
  id: "phase11-veil",
  name: "Phase 11 Veil",
  slug: "phase11-veil",
  sku: "P11-VEI-01",
  price: 2600,
  originalPrice: null,
  category: "sarees",
  department: "women",
  image: "/fixtures/phase11/veil-cover.jpg",
  additionalImages: [],
  sizes: ["Free Size"],
  colors: ["Ivory"],
  occasion: ["Festive"],
  fabric: "Silk",
  description: "A veil.",
  availability: "in-stock",
  stock: 4,
};

/* The catalogue this suite mounted with, or one record more: the personal edit
   needs a piece the customer has NOT already saved, viewed or ordered. */
const seedRecords = (records = RECORDS) =>
  app.store.applyCatalogSnapshot({ products: records, categories: [CATEGORY], collections: [] });

const railFor = (markup, label) => {
  const at = markup.indexOf(`aria-label="${label}"`);
  if (at < 0) return "";
  const from = markup.lastIndexOf("<section", at);
  const to = markup.indexOf("</section>", at);
  return to > from ? markup.slice(from, to + "</section>".length) : "";
};

test("the rail and the style panel read production's own personalisation — once — and share one signal test", () => {
  const text = source();
  const production = read(PRODUCTION_DASHBOARD);

  /* Production's own two reads, with production's own arguments. */
  assert.match(text, /const preferences = useMemo\(\(\) => getStylePreferences\(user\?\.id\), \[user\?\.id\]\)/,
    "the page no longer reads the customer's own preferences as production does");
  const personalizedCall = /getPersonalizedProducts\(\{[\s\S]*?wishlistProducts: wishlist\.products,[\s\S]*?recentlyViewed: recently\.products,[\s\S]*?orders,[\s\S]*?preferences,[\s\S]*?limit: RAIL_SIZE,[\s\S]*?\}\)/;
  assert.match(text, personalizedCall, "the page no longer asks the personalisation service production's way");
  assert.match(text, /\[wishlist\.products, recently\.products, orders, preferences\],/,
    "the personalisation read no longer follows production's own dependencies");
  assert.match(production, personalizedCall,
    "Aarna no longer derives recommendations from its real customer signals");
  assert.ok(production.includes("[wishlist.products, recently.products, orders, preferences]"),
    "production's own dependency list moved");

  /* ONE derivation for the whole page: one read each, and one signal test that
     both panels use — so the two can never state different tastes. */
  assert.equal(count(text, "getPersonalizedProducts("), 1, "the page derives the customer's taste more than once");
  assert.equal(count(text, "getStylePreferences("), 1, "the page reads the saved preferences more than once");
  assert.match(text, /const style = personal\.signals;/);
  assert.match(text, /\{hasTasteSignals \? \(/, "the style panel is no longer gated on the shared signal test");
  assert.equal(/style\.sufficient/.test(text), false,
    "the page re-derives production's own sufficiency flag instead of the one shared test");
  /* The personal pieces may be drawn in exactly one place, inside that gate. */
  assert.match(text, /\{hasTasteSignals && personal\.products\.length \? \(\s*<Rail[\s\S]{0,400}?products=\{personal\.products\}[\s\S]{0,200}?\) : null\}/,
    "the personal pieces are no longer drawn inside the shared signal gate alone");
  assert.match(text, /limit: RAIL_SIZE,/, "the personalisation read no longer keeps the page's own rail size");
  assert.match(text, /const RAIL_SIZE = 4;/, "the page's rail size left production's four-piece limit");

  /* ONE plates read for the whole page — the personal edit joins the list the
     page's single `useProductCovers` call is given, rather than adding a second. */
  assert.equal(count(text, "useProductCovers("), 1, "the page resolves its plates more than once");
  assert.match(text, /const railProducts = \[\.\.\.recently\.products, \.\.\.savedPieces, \.\.\.personal\.products\];/,
    "the personal edit left the one list the page's plates are resolved from");

  /* Neither block fetches, remembers or listens: the derivation is synchronous,
     and the offers register's change event is still deliberately not subscribed. */
  assert.equal(/useState\(|useReducer\(|useRef\(/.test(text), false, "a personal block keeps state of its own");
  assert.equal(/localStorage|sessionStorage/.test(text), false, "a personal block reached for a device store");
  assert.equal(/OFFERS_CHANGED_EVENT|addEventListener|dispatchEvent/.test(text), false, "a personal block added a listener of its own");
  assert.equal(/fetch\(|apiGet|apiPost|axios\b/.test(text), false, "a personal block calls the network itself");
});

test("an account with nothing to go on gets the design's quiet words, never a catalogue slice under a personal heading", () => {
  try {
    seedRecords(RECORDS);
    emptySession();

    /* The service the rail reads WOULD hand back the catalogue — every record in
       it, ranked by nothing but the catalogue's own score. The page must not
       draw that as a personal edit. */
    const fallback = app.personalization.getPersonalizedProducts({});
    assert.equal(fallback.products.length, RECORDS.length, "the harness catalogue no longer answers the ranking");
    assert.equal(fallback.signals.sufficient, false, "the harness session is no longer signalless");
    for (const key of ["favouriteCategories", "favouriteCollections", "favouriteFabrics", "favouriteOccasions"]) {
      assert.deepEqual(fallback.signals[key], [], `${key} was derived from nothing`);
    }

    const markup = app.render();
    assert.equal(markup.includes('aria-label="Just for you"'), false,
      "the rail was drawn from a catalogue slice no signal chose");
    assert.equal(/pf-account__style-tag/.test(markup), false, "a taste chip was drawn for an account with no taste signals");

    /* Production's own words for this state, and the one destination that
       changes it. */
    const panel = panelFor(markup, "pf-account-style");
    assert.ok(panel, "the style panel is missing");
    assert.match(panel, /<h2 id="pf-account-style" class="display shop__title">Taste, as it <em>unfolds<\/em>/, "the style heading left the page");
    assert.match(panel, /<p class="empty__title">Your style is still unfolding\.<\/p>/);
    assert.match(panel, /Explore a few pieces and your space will begin to reflect your taste\./);
    const production = read(PRODUCTION_DASHBOARD);
    for (const line of ["Taste, as it", "Your style is still unfolding.", "Explore a few pieces and your space will begin to reflect your taste."]) {
      assert.ok(production.includes(line), `the style panel's copy is no longer production's: ${line}`);
    }
    const actions = anchors(panel).filter((anchor) => /class="btn btn--ghost"/.test(anchor.attributes));
    assert.deepEqual(actions.map((anchor) => anchor.href), ["/account/preferences"], "the style panel lost its one destination");
    assert.match(actions[0].inner, /Style Preferences/, "the style action lost production's own words");
    assert.equal(app.routes.isRegisteredPath(app.routes.resolveStorefrontPath("/account/preferences")), true,
      "the preferences destination is not a route this application serves");
  } finally {
    restoreCatalogue();
  }
});

test("with genuine signals the rail shows only what the customer's own reading left, and the panel states the same reading", () => {
  try {
    seedRecords([...RECORDS, VEIL]);
    emptySession();
    seedGuestWishlist(["phase11-banarasi"]);
    seedGuestBrowsing(["phase11-blouse"]);
    app.orderService.saveOrders([]);

    /* The expectation, computed with the application's own service over the same
       three inputs the page reads: the saved pieces, the browsing history and the
       orders. */
    const expected = app.personalization.getPersonalizedProducts({
      wishlistProducts: app.store.getAllProducts().filter((record) => record.id === "phase11-banarasi"),
      recentlyViewed: app.store.getAllProducts().filter((record) => record.id === "phase11-blouse"),
      orders: [],
      limit: 4,
    });
    assert.deepEqual(expected.products.map((record) => record.id), ["phase11-veil"],
      "the harness session no longer ranks to the one piece it has not already met");

    const markup = app.render();
    const rail = railFor(markup, "Just for you");
    assert.ok(rail, "the rail was not drawn although the customer's own reading gives it something to show");

    /* Production's own heading, and the derivation's own reason line. */
    assert.match(rail, /<p class="label">Just for you<\/p>/, "the rail lost production's eyebrow");
    assert.match(rail, /<h2 class="display shop__title">Pieces selected around what you <em>explore<\/em>/,
      "the rail lost production's heading");
    assert.ok(rail.includes(`class="pf-account__note">${expected.signals.reason}<`),
      "the rail no longer states the derivation's own reason");
    const production = read(PRODUCTION_DASHBOARD);
    for (const line of ["Just for you", "Pieces selected around what you"]) {
      assert.ok(production.includes(line), `the rail's copy is no longer production's: ${line}`);
    }

    /* Only what the reading left — and every card a real product destination with
       the design's own wishlist control. */
    const cards = anchors(rail).filter((anchor) => /class="pcard__imglink"/.test(anchor.attributes));
    assert.deepEqual(cards.map((anchor) => anchor.href), expected.products.map((record) => `/product/${record.slug}`),
      "the rail drew something other than the pieces the customer's own reading left");
    for (const href of hrefs(rail)) {
      const path = String(href).split(/[?#]/)[0];
      assert.equal(app.routes.isRegisteredPath(app.routes.resolveStorefrontPath(path)), true, `${path} is not a route this application serves`);
    }
    assert.match(rail, /class="wish pcard__wish"/, "a rail card lost the design's own wishlist control");
    /* Its cover is the piece's own, resolved through the page's plates read —
       never an empty frame and never a stand-in. */
    const cover = expected.products[0].image;
    assert.ok(rail.includes(`src="${cover}"`), "the rail's card did not resolve the piece's own cover");
    assert.equal(/<img[^>]*src=""/.test(rail), false, "a rail card drew an empty frame");
    for (const alreadyMet of ["phase11-banarasi", "phase11-blouse"]) {
      assert.equal(hrefs(rail).includes(`/product/${alreadyMet}`), false,
        `${alreadyMet} is drawn in the personal edit although the customer has already met it`);
    }

    /* The panel states the same reading — the derived labels, as labels. */
    const panel = panelFor(markup, "pf-account-style");
    for (const entry of [...expected.signals.favouriteCategories, ...expected.signals.favouriteFabrics, ...expected.signals.favouriteOccasions]) {
      assert.ok(panel.includes(`class="pf-account__style-tag">${entry.label}<`), `${entry.label} is not stated by the style panel`);
    }
    const chips = panel.slice(panel.indexOf("pf-account__style"), panel.indexOf("pf-account__actions"));
    assert.ok(chips.length > 0, "the style panel's groups were not found");
    assert.equal(anchors(chips).length, 0, "a taste chip is a control — it is a label");
  } finally {
    restoreCatalogue();
  }
});

test("signals with nothing left to show: the panel still states the taste, the rail is still not drawn", () => {
  try {
    seedRecords(RECORDS);
    emptySession();
    seedGuestWishlist(["phase11-banarasi"]);
    seedGuestBrowsing(["phase11-blouse"]);
    app.orderService.saveOrders([]);

    const markup = app.render();
    /* The customer has taste signals — the panel states them … */
    assert.match(panelFor(markup, "pf-account-style"), /class="pf-account__style-tag"/,
      "the panel stopped stating a taste the customer demonstrably has");
    /* … but every piece of the catalogue is one they have already saved or
       viewed, so there is no personal edit to draw. */
    assert.equal(markup.includes('aria-label="Just for you"'), false,
      "a personal edit was drawn with no piece left to show");
    /* And the page is not empty — the rails that show the customer their OWN
       pieces are still there. */
    for (const href of ["/product/phase11-banarasi", "/product/phase11-blouse"]) {
      assert.ok(hrefs(markup).includes(href), `${href} left the page`);
    }
  } finally {
    restoreCatalogue();
  }
});

test("the saved preferences the panel states are the preferences screen's own, and the branch the render cannot reach is the service's own contract", () => {
  const text = source();

  /* The branch: the saved list is read for THIS customer, the gate is the
     service's own `hasStylePreferences`, and the one saved statement the signal
     derivation does not read (colours) is stated under the preferences screen's
     own word for it. */
  assert.match(text, /const preferences = useMemo\(\(\) => getStylePreferences\(user\?\.id\), \[user\?\.id\]\)/);
  assert.match(text, /const hasTasteSignals = tasteSignalCount > 0 \|\| hasStylePreferences\(preferences\);/,
    "the saved preferences no longer count as a taste signal");
  assert.match(text, /const savedColours = \(preferences\.colours \?\? \[\]\)\.map\(\(colour\) => \(\{ id: colour, label: colour \}\)\);/);
  assert.match(text, /\{ key: 'colours', label: 'Preferred colours', items: savedColours \},/,
    "the one saved statement the derivation does not read is no longer stated");
  assert.ok(read("src/components/customer/pages/account/Preferences.jsx").includes('label="Preferred colours"'),
    "the preferences screen no longer calls that list \"Preferred colours\"");

  /* Production's own four group words, verbatim on both sides. */
  const production = read(PRODUCTION_DASHBOARD);
  for (const label of ["Favourite categories", "Favourite collections", "Frequently viewed fabrics", "Occasions you explore"]) {
    assert.ok(text.includes(`label: '${label}'`), `the style panel lost production's group: ${label}`);
    assert.match(production, new RegExp(`label: ['\"]${label}['\"]`), `Aarna no longer names this style group: ${label}`);
  }

  /* What a server render cannot reach — `user` is published by an effect — is
     executed against the service's own store instead. */
  const key = app.stylePreferences.STYLE_PREFERENCES_STORAGE_KEY;
  const customer = "pf-phase11-customer";
  try {
    assert.equal(app.stylePreferences.hasStylePreferences(app.stylePreferences.getStylePreferences(customer)), false,
      "the harness store was not empty before this test wrote to it");
    const saved = app.stylePreferences.saveStylePreferences(customer, {
      categories: ["sarees"],
      fabrics: ["Katan Silk"],
      occasions: ["Wedding"],
      colours: ["Ivory"],
    });
    assert.deepEqual(saved, { categories: ["sarees"], fabrics: ["Katan Silk"], occasions: ["Wedding"], colours: ["Ivory"] });
    assert.deepEqual(app.stylePreferences.getStylePreferences(customer), saved, "the saved preferences do not round-trip");
    assert.equal(app.stylePreferences.hasStylePreferences(saved), true, "a saved preference no longer counts as one");
    assert.equal(app.stylePreferences.hasStylePreferences(app.stylePreferences.getStylePreferences(null)), false,
      "a session with no identity reads a taste that is not its own");
  } finally {
    storage.delete(key);
  }
});

/* ── 8 · the customer's own live returns (S4 of the retention plan) ───────────

   Production's dashboard ends its order block with a panel of the returns the
   customer is still following (`AccountDashboard.jsx:414-441`). The Overview
   restores it over the ONE thing it may read — the order mirror the rest of the
   page already holds — with production's own closed set, production's own
   two-entry cap, production's own destinations and production's own vocabulary,
   and with the two states the design's prototype never drew: a read that has not
   finished, and one that failed.

   THE READ'S OWN GUARANTEES (`utils/orders.js`, `normaliseReturn`): the mirror
   drops a record with no id or no item lines, files a status the register does not
   know under `RETURN_REQUESTED`, and always leaves at least one item with a name.
   Every fixture below is written in the shape the mirror accepts, and the
   expectations are computed from what the mirror hands back rather than from the
   fixture as written. */

const returnRecord = (id, status, name = "Phase 11 Banarasi") => ({
  id,
  status,
  items: [{ lineId: `line-${id}`, productId: "phase11-banarasi", name, quantity: 1, price: 4200 }],
});

/* One order with its own returns, in the shape the session mirror round-trips. */
const returnedOrder = (id, createdAt, returns) =>
  orderRecord(id, createdAt, "DELIVERED", "phase11-banarasi", "Phase 11 Banarasi", 1, 4200, returns);

/* Four orders, newest first: the mirror's own order, with the two CLOSED records
   deliberately FIRST inside the two newest orders — an unfiltered panel would
   draw those two under production's own cap. */
const RETURNS_MIRROR = [
  returnedOrder("PF-11-0101", "2026-10-04T10:00:00.000Z", [returnRecord("RET-11-A", "REFUNDED"), returnRecord("RET-11-B", "RETURN_REQUESTED")]),
  returnedOrder("PF-11-0102", "2026-10-03T10:00:00.000Z", [returnRecord("RET-11-C", "REJECTED"), returnRecord("RET-11-D", "UNDER_REVIEW")]),
  returnedOrder("PF-11-0103", "2026-10-02T10:00:00.000Z", [returnRecord("RET-11-E", "INSPECTED")]),
  returnedOrder("PF-11-0104", "2026-10-01T10:00:00.000Z", [returnRecord("RET-11-F", "APPROVED")]),
];

/* The panel states its own label when it carries no heading (the all-clear, the
   read in flight, the failed read), so those three states are read by label. */
const sectionByLabel = (markup, label) => {
  const at = markup.indexOf(`aria-label="${label}"`);
  if (at < 0) return "";
  const from = markup.lastIndexOf("<section", at);
  const to = markup.indexOf("</section>", at);
  return to > from ? markup.slice(from, to + "</section>".length) : "";
};

const returnCards = (markup) =>
  [...markup.matchAll(/<article class="pf-account__return">([\s\S]*?)<\/article>/g)].map(([, inner]) => inner);

test("the returns panel is production's own rule over the orders this page already holds — nothing read, nothing remembered", () => {
  const text = source();
  const production = read(PRODUCTION_DASHBOARD);
  const flat = production.replace(/\s+/g, " ");

  /* Production's own closed set, and the two-entry cap of the same block. */
  assert.ok(flat.includes("const CLOSED_RETURNS = new Set([RETURN_STATUS.REFUNDED, RETURN_STATUS.REJECTED]);"),
    "production no longer closes a return on these two statuses — the page's copy of the rule is now wrong");
  assert.match(text, /const CLOSED_RETURNS = new Set\(\[RETURN_STATUS\.REFUNDED, RETURN_STATUS\.REJECTED\]\);/,
    "the panel no longer closes a return on production's own two statuses");
  assert.ok(flat.includes("activeReturns.slice(0, RETURN_LIMIT)"), "Aarna's active-return panel lost its explicit cap");
  assert.match(text, /const RETURN_LIMIT = 2;/, "the panel's own restraint left the page");
  assert.match(text, /activeReturns\.slice\(0, RETURN_LIMIT\)\.map/, "the panel draws more than production's own two");

  /* ONE derivation, over `orders[].returns` and nothing else: the same rows the
     register above draws, in the mirror's order, with no request, no store and no
     state of its own — and no subscription to a register the page does not
     refresh from. */
  const memo = text.slice(text.indexOf("const activeReturns = useMemo("), text.indexOf("const returnsCountLabel"));
  assert.ok(memo, "the live-return list is no longer derived in one place");
  assert.match(memo, /orders\.forEach\(\(order\) => \{\s*\(order\.returns \?\? \[\]\)\.forEach\(\(record\) => \{\s*if \(!CLOSED_RETURNS\.has\(record\.status\)\) list\.push\(\{ order, record \}\);/,
    "the panel no longer walks the orders' own return records production's way");
  assert.match(memo, /\}, \[orders\]\);/, "the live-return list no longer follows the orders it reads");
  assert.equal(/fetch\(|apiGet|apiPost|axios\b|localStorage|sessionStorage|useState\(|useEffect\(|addEventListener/.test(memo), false,
    "the returns panel reached for a source of its own");

  /* The count is production's own wording, and it counts everything following,
     not only the two the panel draws. */
  assert.ok(flat.includes("`${activeReturns.length} active`"), "production's own count wording moved");
  assert.match(text, /const returnsCountLabel = `\$\{activeReturns\.length\} active`;/,
    "the panel no longer states production's own count");

  /* Aarna's copy and destinations stay on the active route, not in the retired page. */
  assert.match(production, /Return in progress/);
  assert.ok(production.includes("`/account/orders/${order.id}/return`"), "the return action no longer targets the active Aarna order route");
  assert.ok(production.includes("You&rsquo;re all clear."), "the Aarna all-clear state is missing");
  assert.ok(production.includes("When a return is in progress, you will find it here."), "the Aarna empty state is missing");
  assert.ok(production.includes('to="/account/orders"'), "the Aarna order-list action is missing");

  assert.match(text, /<p className="label">Return in progress<\/p>/, "the card lost production's own line");
  assert.match(text, /<h2 id="pf-account-returns" className="display shop__title">Return in <em>progress<\/em><\/h2>/,
    "the panel lost production's own heading");
  assert.match(text, /<p className="empty__title">You&rsquo;re all clear\.<\/p>/);
  assert.match(text, /<p>When a return is in progress, you will find it here\.<\/p>/);
  assert.match(text, /<Button to="\/account\/orders">View Orders<\/Button>/, "the all-clear lost production's own invitation");
  assert.match(text, /<Button to=\{`\/account\/orders\/\$\{order\.id\}\/return`\} variant="ghost">View Return<\/Button>/,
    "the card lost production's own way into the return");
  /* The status line asks the register for its own word; the panel maps none. */
  assert.match(text, /const piece = record\.items\?\.\[0\]\?\.name;/);
  assert.match(text, /<p className="pf-account__return-status">\{getReturnStatus\(record\.status\)\.label\}<\/p>/);
  assert.equal(text.includes("Atelier piece"), false, "the panel names a returned piece the record does not carry");

  /* Aarna keeps returns ahead of its saved-pieces section in the account flow. */
  assert.ok(production.indexOf('aria-labelledby="pf-account-returns"') < production.indexOf('aria-labelledby="pf-account-saved"'),
    "Aarna's returns section moved behind saved pieces");
  const ordersAt = text.indexOf('aria-labelledby="pf-account-orders"');
  const returnsAt = text.indexOf("{activeReturns.length ? (");
  const railAt = text.indexOf("label=\"Recently viewed\"");
  assert.ok(ordersAt > 0 && returnsAt > ordersAt && railAt > returnsAt,
    "the returns panel left its place between the order register and the rails");
});

test("the closed statuses are dropped, the live ones drawn in the mirror's own order, and no more than two", () => {
  try {
    emptySession();
    app.orderService.saveOrders(RETURNS_MIRROR);
    /* The mirror's own order is the page's order — read back, never assumed. */
    const mirror = app.orderService.loadOrders();
    assert.deepEqual(mirror.map((order) => order.id), ["PF-11-0101", "PF-11-0102", "PF-11-0103", "PF-11-0104"],
      "the harness no longer keeps the four orders in the order this test pins");

    const markup = app.render();
    const panel = panelFor(markup, "pf-account-returns");
    assert.ok(panel, "the returns panel is missing while four returns are following");
    assert.match(panel, /<p class="label">Returns<\/p>/, "the panel lost production's eyebrow");
    assert.match(panel, /<h2 id="pf-account-returns" class="display shop__title">Return in <em>progress<\/em><\/h2>/);
    /* The count is every return still following — four — not the two drawn. */
    assert.match(panel, /<p class="shop__count">4 active<\/p>/, "the panel no longer counts the returns that are still following");

    /* Production's rule, applied to what the mirror hands back: REFUNDED and
       REJECTED are closed; everything else is still following, in order. */
    const closed = [app.config.RETURN_STATUS.REFUNDED, app.config.RETURN_STATUS.REJECTED];
    const eligible = mirror.flatMap((order) =>
      (order.returns ?? []).filter((record) => !closed.includes(record.status)).map((record) => ({ order, record })));
    assert.deepEqual(eligible.map(({ record }) => record.id), ["RET-11-B", "RET-11-D", "RET-11-E", "RET-11-F"],
      "the fixture no longer separates the four live returns from the two closed ones");
    const drawn = eligible.slice(0, 2);

    const cards = returnCards(panel);
    assert.equal(cards.length, 2, "the panel drew more than production's own two entries");
    drawn.forEach(({ order, record }, index) => {
      const card = cards[index];
      assert.ok(card.includes(`class="pf-account__return-id">${record.id}<`),
        `the panel did not state the return the customer is following at position ${index + 1}`);
      assert.ok(card.includes(`class="pf-account__return-piece">${record.items[0].name}<`),
        `${record.id} lost the piece the record itself carries`);
      assert.ok(card.includes(app.config.getReturnStatus(record.status).label),
        `${record.id} did not state the register's own word for its status`);
      assert.ok(card.includes(`href="/account/orders/${order.id}/return"`),
        `${record.id} does not lead to its OWN order's return`);
    });

    /* Nothing closed, and nothing behind the cap, is drawn or reachable — and the
       only return destinations on the page are the two the cards own. */
    for (const absent of ["RET-11-A", "RET-11-C", "RET-11-E", "RET-11-F"]) {
      assert.equal(markup.includes(absent), false, `${absent} was drawn although it is not one of the two live returns`);
    }
    assert.equal(markup.includes("/account/orders/PF-11-0103/return"), false, "a return behind the cap kept a way in");
    assert.equal(markup.includes("/account/orders/PF-11-0104/return"), false, "a return behind the cap kept a way in");
    const returnLinks = hrefs(markup).filter((href) => /^\/account\/orders\/[^/]+\/return$/.test(String(href)));
    assert.deepEqual(returnLinks, drawn.map(({ order }) => `/account/orders/${order.id}/return`),
      "the page leads to a return the panel does not state");
    for (const link of returnLinks) {
      assert.equal(app.routes.isRegisteredPath(app.routes.resolveStorefrontPath(String(link))), true,
        `${link} is not a route this application serves`);
    }

    /* The page's own furniture is untouched by the panel's presence. */
    assert.equal(tiles(markup).length, 3, "the panel took the tiles with it");
    for (const block of ["pf-account-orders", "pf-account-saved", "pf-account-style"]) {
      assert.ok(markup.includes(`aria-labelledby="${block}"`), `the panel took ${block} with it`);
    }
    assert.match(markup, /aria-label="Account details"/, "the panel took the account cards with it");
  } finally {
    emptySession();
  }
});

test("a returned line the record does not name is stated with the mirror's own word, never a blank or a dash", () => {
  try {
    emptySession();
    /* A return whose line carries no name of its own: the mirror names it, and the
       panel must state what the record it was handed actually says. */
    app.orderService.saveOrders([
      returnedOrder("PF-11-0301", "2026-10-04T10:00:00.000Z", [
        { id: "RET-11-G", status: "APPROVED", items: [{ lineId: "line-g", quantity: 1 }] },
      ]),
    ]);
    const mirror = app.orderService.loadOrders();
    const record = mirror[0].returns[0];
    assert.equal(record.items[0].name, "Atelier piece", "the mirror no longer names a returned line it cannot name itself");

    const markup = app.render();
    const cards = returnCards(panelFor(markup, "pf-account-returns"));
    assert.equal(cards.length, 1, "the unnamed return was not drawn at all");
    assert.ok(cards[0].includes(`class="pf-account__return-piece">${record.items[0].name}<`),
      "the panel did not state the name the record itself carries");
    assert.equal(/pf-account__return-piece">\s*</.test(cards[0]), false, "the panel drew a blank where a name belongs");
    assert.equal(/—|–/.test(cards[0]), false, "the panel stood a dash in for a name");
  } finally {
    emptySession();
  }
});

test("nothing in flight is production's own all-clear, and a closed return never reaches the panel", () => {
  try {
    /* An account with no orders at all. */
    emptySession();
    const none = app.render();
    const clear = sectionByLabel(none, "Returns");
    assert.ok(clear, "an account with nothing in flight lost the returns panel entirely");
    assert.match(clear, /<p class="empty__title">You\u2019re all clear\.<\/p>/, "the all-clear lost production's own words");
    assert.match(clear, /<p>When a return is in progress, you will find it here\.<\/p>/);
    const invitation = anchors(clear).filter((anchor) => /class="btn btn--solid"/.test(anchor.attributes));
    assert.deepEqual(invitation.map((anchor) => anchor.href), ["/account/orders"], "the all-clear lost production's own destination");
    assert.match(invitation[0].inner, /View Orders/, "the all-clear lost production's own invitation");
    assert.equal(returnCards(none).length, 0, "a return card was drawn for an account with no returns");
    /* A finished, empty read is not a read in flight. */
    assert.equal(/aria-busy/.test(clear), false, "a finished empty read announced itself as loading");

    /* Orders whose returns are all closed: the same statement, and nothing drawn. */
    app.orderService.saveOrders([
      returnedOrder("PF-11-0201", "2026-10-04T10:00:00.000Z", [returnRecord("RET-11-X", "REFUNDED")]),
      returnedOrder("PF-11-0202", "2026-10-03T10:00:00.000Z", [returnRecord("RET-11-Y", "REJECTED")]),
    ]);
    const closed = app.render();
    assert.match(sectionByLabel(closed, "Returns"), /You\u2019re all clear\./, "a closed return was not recognised as closed");
    assert.equal(/RET-11-X|RET-11-Y/.test(closed), false, "a closed return was drawn");
    assert.equal(/\/return"/.test(closed), false, "a closed return kept a way in");
    assert.equal(returnCards(closed).length, 0, "a closed return was drawn as a card");
  } finally {
    emptySession();
  }
});

test("a read in flight and a failed read are stated, and neither can reach the all-clear", () => {
  const text = source();

  /* The two states arrive from the order context's effect-driven read, which a
     server render never runs — so, exactly as this suite pins the order block's
     own two states, they are pinned where they live. */
  assert.match(text, /<div className="empty" aria-busy="true" aria-label="Loading your returns">/,
    "the returns loading branch is not announced to a reader");
  assert.match(text, /<p className="empty__title">Gathering your returns&hellip;<\/p>/);
  const loadingAt = text.indexOf('aria-label="Loading your returns"');
  const failedAt = text.indexOf('subject="returns"');
  const clearAt = text.indexOf("You&rsquo;re all clear.");
  const returnsAt = text.indexOf("{activeReturns.length ? (");
  assert.ok(returnsAt > 0 && loadingAt > returnsAt && failedAt > loadingAt && clearAt > failedAt,
    "the all-clear is no longer the last branch, so a read in flight or a failed read can reach it");

  /* The failed read is the order context's own state and its own retry, with the
     error named as a returns error — and it is withheld from the live-region role
     because the order block above has already announced this same read. */
  assert.match(text, /\) : ordersError \? \(/, "the failed read is no longer its own branch");
  assert.match(text, /<OrdersFailed status=\{ordersErrorStatus\} message=\{ordersError\} onRetry=\{refreshOrders\} subject="returns" alert=\{false\} \/>/,
    "the returns failure is no longer the order context's own state and retry");
  assert.match(text, /function OrdersFailed\(\{ status, message, onRetry, subject = 'orders', alert = true \}\)/,
    "the failure block lost the subject it now states");
  assert.match(text, /'Please sign in again to see your returns\.'/);
  assert.match(text, /'We could not load your returns right now\.'/);
  /* …while the order block's own two sentences are unchanged to the character. */
  assert.match(text, /'Please sign in again to see your orders\.'/);
  assert.match(text, /'We could not load your orders right now\.'/);
  assert.match(text, /role=\{alert \? 'alert' : undefined\}/, "the failure block lost the role it now takes as an argument");

  /* Every error on that read keeps the all-clear off the page — including a failed
     refresh over rows already held, which `ordersFailed` alone would not catch. */
  assert.match(text, /\) : ordersError \? \(\n/, "a failed refresh could still be dressed as all clear");
});

