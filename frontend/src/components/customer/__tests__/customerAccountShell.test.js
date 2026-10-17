/**
 * Customer account route and shell contracts. Aarna owns the account pages;
 * App.jsx delegates the customer catch-all to CustomerLayout while retaining
 * separate staff portal routes. These tests pin the customer guard and the
 * intentionally guest-accessible order detail, tracking, and return paths.
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

const BOUNDARY = "src/config/customerRoutes.js";
const MOUNT = "src/components/customer/CustomerStorefront.jsx";
const PRODUCTION_APP = "src/App.jsx";
const PRODUCTION_NAV = "src/components/account/AccountNav.jsx";
const FRAME = "src/components/customer/pages/account/AccountFrame.jsx";
const NAV = "src/components/customer/pages/account/AccountNav.jsx";
/* The screens this phase has redrawn, one stage at a time — Stage 2.2 took
   `/account`, Stage 2.3 the profile and the addresses, Stage 2.4 the four order
   screens, Stage 2.5 the two AI screens. Each entry names the port's OWN page (a
   name deliberately not in the mount's `lazy` list, so a migrated route can never
   be mistaken for one still served by production), the file it is imported from,
   and the current Aarna route that serves the path. */
const MIGRATED_SCREENS = [
  { path: "account", component: "AccountOverview", page: "Overview.jsx", production: "CustomerOverview" },
  { path: "account/profile", component: "AccountProfilePage", page: "Profile.jsx", production: "CustomerProfile" },
  { path: "account/addresses", component: "AccountAddressesPage", page: "Addresses.jsx", production: "CustomerAddresses" },
  { path: "account/orders", component: "AccountOrdersPage", page: "Orders.jsx", production: "CustomerOrders" },
  { path: "account/orders/:orderId", component: "AccountOrderDetailPage", page: "OrderDetail.jsx", production: "CustomerOrderDetail" },
  { path: "account/orders/:orderId/track", component: "AccountOrderTrackingPage", page: "OrderTracking.jsx", production: "CustomerOrderTracking" },
  { path: "account/orders/:orderId/return", component: "AccountOrderReturnPage", page: "OrderReturn.jsx", production: "CustomerOrderReturn" },
  { path: "account/ai-mirror", component: "AccountAiMirrorPage", page: "AiMirror.jsx", production: "CustomerAiMirror" },
  { path: "account/ai-shopping", component: "AccountAiShoppingPage", page: "AiShopping.jsx", production: "CustomerAiShopping" },
  { path: "account/settings", component: "AccountSettings", page: "Settings.jsx", production: "CustomerSettings" },
  { path: "account/security", component: "AccountSecurity", page: "Security.jsx", production: "CustomerSecurity" },
  { path: "account/preferences", component: "AccountPreferences", page: "Preferences.jsx", production: "CustomerPreferences" },
  { path: "account/instagram-rewards", component: "InstagramRewards", page: "InstagramRewards.jsx", production: "CustomerInstagramRewards" },
];
const REDRAWN_PAGES = MIGRATED_SCREENS.map((screen) => `src/components/customer/pages/account/${screen.page}`);
/* The order screens' shared frame — the port's equivalent of production's
   `OrderPageShell`. It draws account chrome of its own (the guest strip, the two
   status/problem states every order screen reuses), so it belongs to the set of
   files whose classes this sheet may style. */
const ORDER_FRAME = "src/components/customer/pages/account/OrderFrame.jsx";
const SHEET = "src/components/customer/customer.account.css";
const DESIGN_SHEET = "src/components/customer/customer.css";
const REGISTRY = "scripts/customer-port.js";

/* ── the thirteen URLs, and the two halves production splits them into ───── */

const GUARDED_SCREENS = [
  "/account",
  "/account/profile",
  "/account/addresses",
  "/account/orders",
  "/account/settings",
  "/account/security",
  "/account/preferences",
  "/account/ai-mirror",
  "/account/ai-shopping",
  "/account/instagram-rewards",
];

const GUEST_ORDER_URLS = [
  "/account/orders/pf-9f2c",
  "/account/orders/pf-9f2c/track",
  "/account/orders/pf-9f2c/return",
];

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

/* The guest wishlist the application itself keeps client-side — the same key
   `utils/shopping.js` declares. Seeding it is how the suite gets a real,
   non-zero count without a backend and without inventing a context: the
   provider restores it synchronously. */
const WISHLIST_KEY = "pratikshya_wishlist";
const seedGuestWishlist = (ids) => storage.set(WISHLIST_KEY, JSON.stringify(ids));

/* ── the route tables, read out of both trees ───────────────────────────── */

/**
 * The spans of source where `<Route element={<ProtectedRoute />}>` is open —
 * found by walking the nesting, so indentation and formatting cannot affect the
 * answer. Used on both trees: the port declares its block the way `App.jsx`
 * declares its own.
 */
function guardedSpans(source) {
  const opener = "<Route element={<ProtectedRoute />}>";
  /* A JSX tag whose attributes may hold a brace group — `element={<Page />}` —
     and a flag for the self-closing form, which opens nothing. */
  const tag = /<Route\b(?:[^<>{}]|\{[^{}]*\})*?(\/?)>/g;
  const spans = [];
  let from = 0;
  for (;;) {
    const open = source.indexOf(opener, from);
    if (open === -1) return spans;
    let index = open + opener.length;
    let depth = 1;
    while (depth > 0) {
      tag.lastIndex = index;
      const next = tag.exec(source);
      const nextOpen = next ? next.index : -1;
      const nextClose = source.indexOf("</Route>", index);
      assert.ok(nextClose !== -1, "an unclosed <Route> block — the source moved");
      if (nextOpen !== -1 && nextOpen < nextClose) {
        if (next[1] !== "/") depth += 1;
        index = tag.lastIndex;
      } else {
        depth -= 1;
        index = nextClose + "</Route>".length;
      }
    }
    spans.push([open, index]);
    from = index;
  }
}

/** Every account route the file declares: its path, its element, its guard. */
function accountRoutes(source) {
  const spans = guardedSpans(source);
  const found = [];
  const pattern = /<Route\s+path="([^"]*account[^"]*)"\s+element=\{<([A-Za-z0-9_]+)\s*\/>\}\s*\/>/g;
  for (const match of source.matchAll(pattern)) {
    found.push({
      path: match[1].replace(/^\//, ""),
      component: match[2],
      guarded: spans.some(([start, end]) => match.index > start && match.index < end),
    });
  }
  return found;
}

/** `const X = lazy(() => import("…"));` — the page behind each element. */
function lazyDeclarations(source) {
  const found = new Map();
  for (const match of source.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*lazy\(\(\)\s*=>\s*import\("([^"]+)"\)\);/g)) {
    found.set(match[1], match[2]);
  }
  return found;
}

/** `./pages/account/X` and `../../pages/account/X.jsx` are the same page. */
const normalizeTarget = (target) =>
  target.replace(/^(?:\.\.\/)+/, "").replace(/^\.\//, "").replace(/\.jsx$/, "");

const count = (markup, needle) => markup.split(needle).length - 1;

/** Every anchor in a markup string, with the attributes that matter to it. */
const anchors = (markup) =>
  [...markup.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({
    href: (attributes.match(/href="([^"]*)"/) ?? [])[1] ?? null,
    className: (attributes.match(/class="([^"]*)"/) ?? [])[1] ?? "",
    ariaCurrent: (attributes.match(/aria-current="([^"]*)"/) ?? [])[1] ?? null,
    inner,
  }));

const hrefs = (markup) => anchors(markup).map((anchor) => anchor.href);

/* ── the mount: the application's provider stack, at one path ───────────── */

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
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    boundary,
    routes,
    { default: AccountFrame },
    { default: ProductionAccountNav },
    { default: PortedAccountNav },
    { ACCOUNT_NAV_ITEMS },
    { default: PortLayout },
    { UIProvider },
    { ShopProvider },
    { default: AccountShell },
    { default: AccountSettings },
    { default: AccountSecurity },
    { default: AccountPreferences },
    { default: InstagramRewards },
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/config/customerRoutes.js"),
    load("/src/components/customer/router/routes.js"),
    load("/src/components/customer/pages/account/AccountFrame.jsx"),
    load("/src/components/account/AccountNav.jsx"),
    load("/src/components/customer/pages/account/AccountNav.jsx"),
    load("/src/components/account/AccountNav.jsx"),
    load("/src/components/customer/components/layout/Layout.jsx"),
    load("/src/components/customer/state/UIContext.jsx"),
    load("/src/components/customer/state/ShopContext.jsx"),
    load("/src/components/account/AccountShell.jsx"),
    load("/src/components/customer/pages/account/Settings.jsx"),
    load("/src/components/customer/pages/account/Security.jsx"),
    load("/src/components/customer/pages/account/Preferences.jsx"),
    load("/src/components/customer/pages/account/InstagramRewards.jsx"),
  ]);

  /* The stack the real application builds — ShoppingContext mounts the wishlist
     provider inside itself, so the count a tab shows is the context's own. */
  const Providers = ({ children }) => {
    let tree = children;
    for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
      tree = React.createElement(Provider, null, tree);
    }
    return tree;
  };

  const atPath = (element, path) =>
    renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: [path] },
        React.createElement(Suspense, { fallback: null }, React.createElement(Providers, null, element)),
      ),
    );

  return {
    vite,
    boundary,
    routes,
    AccountFrame,
    ProductionAccountNav,
    PortedAccountNav,
    ACCOUNT_NAV_ITEMS,
    AccountShell,
    AccountSettings,
    AccountSecurity,
    AccountPreferences,
    InstagramRewards,
    /* The whole application chrome, exactly as a browser reaches it. */
    render: (path) => atPath(React.createElement(CustomerLayout), path),
    /* One component, inside the application's own providers. */
    element: (element, path) => atPath(element, path),
    /* One screen mounted inside the Aarna layout shell (`<main id="main">`). */
    customerPage: (element, path) =>
      atPath(
        React.createElement(
          "div",
          { className: "aan-root" },
          React.createElement(
            UIProvider,
            null,
            React.createElement(ShopProvider, null, React.createElement(PortLayout, null, element)),
          ),
        ),
        path,
      ),
    /* The frame, for shell-level assertions. */
    frame: (path, props = {}) =>
      atPath(React.createElement(AccountFrame, props, React.createElement("p", null, "body")), path),
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

/* ── 1 · the family, and the surfaces around it ─────────────────────────── */

test("the account family is the ten screens production guards — and nothing else", () => {
  const { CUSTOMER_ACCOUNT_PATHS, isCustomerAccountPath } = on.boundary;

  assert.deepEqual([...CUSTOMER_ACCOUNT_PATHS].sort(), [...GUARDED_SCREENS].sort(),
    "the account family is not the ten screens production guards");

  for (const path of GUARDED_SCREENS) {
    assert.equal(isCustomerAccountPath(path), true, `${path} is not treated as an account path`);
    assert.equal(isCustomerAccountPath(`${path}/`), true, `${path}/ — a trailing slash is the same page`);
  }

  /* The wishlist is the wishlist surface's, and it is not inside the family. */
  assert.equal(on.boundary.CUSTOMER_WISHLIST_PATHS.has("/account/wishlist"), true, "the wishlist lost its canonical route");
  assert.equal(isCustomerAccountPath("/account/wishlist"), false, "the account claimed the wishlist");
  assert.equal(CUSTOMER_ACCOUNT_PATHS.has("/account/wishlist"), false, "the account family carries the wishlist");
});

test("the three order pages are account URLs that stay open to a guest", () => {
  const { isCustomerAccountPath } = on.boundary;

  for (const path of GUEST_ORDER_URLS) {
    assert.equal(isCustomerAccountPath(path), true, `${path} is not treated as an account path`);
    assert.equal(isCustomerAccountPath(`${path}/`), true, `${path}/ — a trailing slash is the same page`);
  }

  /* The patterns are the order pages' own shape, not a prefix: nothing else
     under `/account/orders/` is claimed. (`/account/orders` itself IS claimed —
     it is the guarded order LIST, asserted with the screens above.) */
  for (const path of [
    "/account/orders/pf-9f2c/track/extra",
    "/account/orders//track",
    "/account/orderz",
    "/account/addresses/extra",
    "/accounts",
    "/account/profile/edit",
    "/reset-password",
    "/login",
    "/admin/orders",
    "/super-admin",
    "/employee/profile",
    "/wishlist",
  ]) {
    assert.equal(isCustomerAccountPath(path), false, `${path} was claimed by the account surface`);
  }
});

test("the account is not the auth, journey, listing, wishlist or catch-all surface", () => {
  const { boundary, routes } = on;

  for (const path of [...GUARDED_SCREENS, ...GUEST_ORDER_URLS]) {
    assert.equal(boundary.isCustomerAuthPath(path), false, `${path} was claimed by the auth surface`);
    assert.equal(boundary.isCustomerJourneyPath(path), false, `${path} was claimed by the money path`);
    assert.equal(boundary.isCustomerListingPath(path), false, `${path} was claimed by the listing`);
    assert.equal(boundary.isCustomerWishlistPath(path), false, `${path} was claimed by the wishlist`);
    assert.equal(boundary.isCustomerCatchAllPath(path), false, `${path} fell through to the catch-all`);
    assert.equal(routes.isRegisteredPath(path), true, `${path} is not a route the application serves`);
  }

  /* `/track-order` is a shim, not a screen: it resolves onto the order list and
     stays outside the family, exactly as Phase 8 left it. */
  assert.equal(boundary.isCustomerAccountPath("/track-order"), false, "the shim was claimed as a screen");
  assert.equal(on.routes.resolveStorefrontPath("/track-order"), "/account/orders");
});

test("the hook and the union read the account surface, gated by the same switch", () => {
  const source = read(BOUNDARY);

  assert.match(source, /export const CUSTOMER_ACCOUNT_PATHS = new Set\(\[/);
  assert.match(source, /export const CUSTOMER_ACCOUNT_GUEST_PATTERNS = \[/);
  assert.match(source, /export function isCustomerAccountPath\(pathname\) \{/);
  assert.match(source, /return CUSTOMER_ACCOUNT_PATHS\.has\(bare\) \|\| CUSTOMER_ACCOUNT_GUEST_PATTERNS\.some\(\(pattern\) => pattern\.test\(bare\)\);/,
    "the classifier is no longer the family plus the two order shapes");
  assert.match(source, /export function useCustomerAccount\(\) \{\n  const \{ pathname \} = useLocation\(\);\n  return isCustomerAccountPath\(pathname\);/,
    "the account route classifier is no longer the active customer ownership rule");
  assert.match(source, /const account = useCustomerAccount\(\);/);
  assert.match(source, /return home \|\| product \|\| listing \|\| wishlist \|\| journey \|\| auth \|\| account \|\| catchAll;/,
    "the union the layout reads no longer includes the account");
});

/* ── 2 · the port's routes, against production's own ────────────────────── */

test("Aarna owns all customer account routes, and App delegates customer paths to its layout", () => {
  const port = accountRoutes(read(MOUNT)).filter((route) => route.path !== "account/wishlist");
  const expected = [...GUARDED_SCREENS, ...GUEST_ORDER_URLS.map((path) => path.replace("pf-9f2c", ":orderId"))]
    .map((path) => path.replace(/^\//, ""))
    .sort();
  const app = read(PRODUCTION_APP);
  assert.equal(port.length, 13, `Aarna declares ${port.length} account routes, expected thirteen`);
  assert.deepEqual(port.map((route) => route.path).sort(), expected, "Aarna's account route family is incomplete");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/, "App no longer delegates customer paths to Aarna");
  assert.doesNotMatch(app, /<Route path="\/account/, "App still declares legacy customer account routes");
  assert.match(read(MOUNT), /<Route path="account\/wishlist" element=\{<Wishlist \/>\} \/>/, "Aarna lost its wishlist route");
});

test("Aarna applies the shared guard to customer screens and leaves single-order routes open to guests", () => {
  const routes = accountRoutes(read(MOUNT));
  const guarded = (key) => routes.find((route) => route.path === key)?.guarded;
  for (const path of GUARDED_SCREENS) {
    const key = path.replace(/^\//, "");
    assert.equal(guarded(key), true, `${path} is not behind Aarna's customer guard`);
  }
  for (const key of ["account/orders/:orderId", "account/orders/:orderId/track", "account/orders/:orderId/return"]) {
    assert.equal(guarded(key), false, `${key} must remain accessible for guest orders`);
  }
  assert.equal(guardedSpans(read(MOUNT)).length, 1, "Aarna declares more than one account guard block");
});

test("the account and wishlist paths always enter the Aarna shell", () => {
  for (const path of [...GUARDED_SCREENS, ...GUEST_ORDER_URLS, "/account/wishlist"]) {
    const markup = off.render(path);
    assert.match(markup, /class="aan-root"/, `${path} did not render Aarna`);
    assert.equal(/class="fixed top-0 left-0 right-0 z-50"/.test(markup), false, `${path} rendered the retired host header`);
  }
});

test("with the switch on, the guest order pages mount the port once — and never a second shell", () => {
  for (const path of GUEST_ORDER_URLS) {
    const markup = on.render(path);

    /* The port owns the URL: its chrome answers, and the production shell is
       not underneath it. The marker is the production customer header's own
       root (`components/shell/SiteHeader.jsx:137`) — a real class, absent from
       every rendered component of the port. */
    assert.match(markup, /class="aan-root"/, `${path} is served by production although the port claims it`);
    assert.equal(/class="fixed top-0 left-0 right-0 z-50"/.test(markup), false, `${path} rendered the production customer header under the port's`);
    /* The page is the port's own since Stage 2.4, and its frame branches on the
       session: a guest gets the order surface and the two ways to keep it, never
       the account navigation — they have no account. (Before Stage 2.4 this
       assertion passed because the page was production's, lazily imported, and a
       lazy page suspends into this harness's empty fallback; it is kept because
       it is the tripwire for "no account chrome for a guest", and it is now the
       port's own frame that has to honour it.) */
    assert.equal(/pf-account__nav/.test(markup), false, `${path} drew account navigation for a guest`);
  }
});

test("with the switch on, a guest asking for a guarded screen paints no account chrome — and the port's sign-in paints at its own URL", () => {
  /* What a static render proves here, and only this: no Aarna account chrome is
     painted synchronously for a guest. The redirect itself is effect-driven
     (`<Navigate>`), and a lazily imported page suspends into the empty slot, so
     a guarded and an unguarded URL render the SAME markup on the server
     (measured against the pinned react-router 7.18.2 in the Phase 11
     verification pass) — this assertion is a paint tripwire, not a guard test:
     it fails the moment account chrome is rendered synchronously for a guest.
     The guard is pinned where it CAN be observed: the port's guard nesting and
     its parity with `App.jsx` (this file, below), the guard's own `returnTo`
     encoding (`customerCheckoutPage.test.js`), and the sign-in page rendered
     directly here. */
  for (const path of GUARDED_SCREENS) {
    const markup = on.render(path);

    assert.match(markup, /class="aan-root"/, `${path} was not handed to the port`);
    assert.equal(/pf-account/.test(markup), false, `${path} painted account chrome on the server render — a guest must be shown none`);
    assert.equal(/pf-account__nav/.test(markup), false, `${path} showed account chrome to a guest`);
    assert.equal(/class="fixed top-0 left-0 right-0 z-50"/.test(markup), false, `${path} rendered the production customer header as well`);
  }

  /* The guard's destination, at the one URL a static render can see it at. */
  const signIn = on.render("/signin?returnTo=%2Faccount%2Forders");
  assert.match(signIn, /class="info container pf-auth"/, "the port's sign-in does not paint at its own URL");
  assert.equal(/pf-account/.test(signIn), false, "the sign-in page drew account chrome");
});

test("reset-password belongs to the auth surface, not the account surface", () => {
  assert.equal(on.boundary.isCustomerAuthPath("/reset-password"), true);
  assert.equal(on.boundary.isCustomerAccountPath("/reset-password"), false);
  assert.match(on.render("/reset-password?userId=user-1&token=token-1"), /aan-root/);
});

/* ── 4 · the frame and its navigation ───────────────────────────────────── */

test("the frame draws the design's page frame, a real navigation and no invented customer", () => {
  const markup = on.frame("/account");

  /* The design's own frame — the classes its `/account` prototype used. */
  assert.match(markup, /class="info container account pf-account"/, "the frame is not the design's account frame");
  assert.match(markup, /<nav class="crumbs" aria-label="Breadcrumb">/, "the frame lost the design's breadcrumb");
  assert.match(markup, /class="label">Your account</, "the frame lost the design's eyebrow");
  assert.equal(/pf-account__name/.test(markup), false, "a guest was given a name that does not exist");

  /* The two actions are the real ones: a link, and a sign-out control. */
  const shop = anchors(markup).find((anchor) => anchor.href === "/shop");
  assert.ok(shop, "the frame lost its way back to the shop");
  assert.match(shop.className, /\bbtn btn--ghost\b/, "the shop action is not the design's button");
  assert.match(shop.inner, /Continue Shopping/, "the shop action lost its label");
  assert.match(markup, /<button[^>]*type="button"[^>]*class="btn btn--ghost"[^>]*><span>Sign Out<\/span><\/button>/,
    "the sign-out action is not a real, labelled control");

  /* The navigation landmark: eleven destinations, one current, no count. */
  assert.match(markup, /<nav class="pf-account__nav" aria-label="Account navigation">/, "the frame lost its navigation landmark");
  const tabs = anchors(markup).filter((anchor) => anchor.className.includes("pf-account__nav-link"));
  assert.equal(tabs.length, 11, `the navigation carries ${tabs.length} tabs`);
  const current = tabs.filter((anchor) => anchor.ariaCurrent === "page");
  assert.deepEqual(current.map((anchor) => anchor.href), ["/account"], "the current tab is not marked exactly once, on the overview");
  assert.equal(/pf-account__nav-count/.test(markup), false, "an empty wishlist was given a count");

  /* The ruled body the pages fill. */
  assert.match(markup, /<div class="pf-account__body"><p>body<\/p><\/div>/, "the page body is not handed to the screen");
});

test("a screen may title itself, and the frame marks the tab and the crumb for the page it sits on", () => {
  const markup = on.frame("/account/orders", {
    breadcrumbItems: [{ label: "Account", to: "/account" }, { label: "Orders" }],
    label: "Order history",
    title: "Your orders",
  });

  assert.match(markup, /<h1 class="display pf-account__name">Your orders<\/h1>/, "the page's own title is not drawn");
  const tabs = anchors(markup).filter((anchor) => anchor.className.includes("pf-account__nav-link"));
  assert.deepEqual(tabs.filter((anchor) => anchor.ariaCurrent === "page").map((anchor) => anchor.href), ["/account/orders"],
    "the orders tab is not the current tab");
  assert.deepEqual(hrefs(markup).slice(0, 2), ["/", "/account"], "the breadcrumb trail is not home → account");
  assert.match(markup, /<span aria-current="page">Orders<\/span>/, "the breadcrumb's last step is not the current page");
});

test("the navigation's destinations are production's own list, drawn once", () => {
  const { ProductionAccountNav, ACCOUNT_NAV_ITEMS } = on;

  const portedHrefs = hrefs(on.frame("/account/orders")).filter((href) => href.startsWith("/account"));
  const productionHrefs = hrefs(on.element(React.createElement(ProductionAccountNav, null), "/account/orders"));

  assert.equal(ACCOUNT_NAV_ITEMS.length, 11, "production's account navigation changed size");
  assert.deepEqual(portedHrefs, productionHrefs, "the port's tabs do not point where production's point");
  assert.deepEqual(productionHrefs, ACCOUNT_NAV_ITEMS.map((item) => item.to), "production's list is not the rendered list");

  /* Every destination is a route this application registers, and ten of the
     eleven are the family this phase adopted — the wishlist is Phase 8's. */
  for (const item of ACCOUNT_NAV_ITEMS) {
    assert.equal(on.routes.resolveStorefrontPath(item.to), item.to, `${item.to} no longer resolves to itself`);
    assert.equal(on.routes.isRegisteredPath(item.to), true, `${item.to} is not a registered route`);
    assert.equal(on.boundary.isCustomerAccountPath(item.to), item.to !== "/account/wishlist", `${item.to} is in the wrong surface`);
  }

  /* The list is not re-declared in the port: the nav file carries no
     destination of its own, only the production module's. */
  assert.equal(/["'`]\/account/.test(read(NAV)), false, "the port's navigation declares its own destinations");
  assert.match(read(NAV), /import \{ ACCOUNT_NAV_ITEMS \} from '\.\.\/\.\.\/\.\.\/\.\.\/components\/account\/AccountNav\.jsx';/,
    "the port's navigation stopped reading production's list");
});

test("the wishlist tab shows the context's count — the same number production shows", () => {
  const { PortedAccountNav, ProductionAccountNav } = on;

  seedGuestWishlist(["phase8-banarasi", "phase8-blouse"]);
  const ported = on.element(React.createElement(PortedAccountNav, null), "/account");
  const production = on.element(React.createElement(ProductionAccountNav, null), "/account");
  seedGuestWishlist([]);

  assert.match(ported, /<span class="pf-account__nav-count">2<\/span>/, "the tab does not carry the context's count");
  assert.equal(count(ported, "pf-account__nav-count"), 1, "the count is drawn on more than the wishlist tab");
  assert.match(production, />2<\/span>/, "production no longer draws this count — the two have diverged");

  /* The rule, at the source: one count, from the context, on the badge item. */
  const source = read(NAV);
  assert.match(source, /const wishlist = useWishlist\(\);/);
  assert.match(source, /const count = item\.badge === 'wishlist' \? wishlist\.count : 0;/);
  assert.match(source, /\{count > 0 && <span className="pf-account__nav-count">\{count\}<\/span>\}/);
});

test("the shell fabricates nothing: no sample data, no inert action, no prototype mechanism", () => {
  for (const file of [FRAME, NAV]) {
    const source = read(file);
    assert.equal(/localStorage|sessionStorage/.test(source), false, `${file} keeps the design prototype's storage`);
    assert.equal(/coming soon|Coming Soon|placeholder|Placeholder|\bTODO\b|\bFIXME\b/.test(source), false, `${file} ships a stand-in`);
    assert.equal(/href="#"|to="#"|onClick=\{\(\) => \{\}\}|\bLorem\b/.test(source), false, `${file} ships an action that does nothing`);
    assert.equal(/@[a-z0-9.-]+\.(com|example|in)\b/.test(source), false, `${file} carries an invented address`);
    assert.equal(/\bfetch\(|axios|apiGet|apiPost/.test(source), false, `${file} calls the network directly`);
    assert.equal(/useState\(/.test(source), false, `${file} keeps state of its own`);
  }

  /* The frame's only data is the signed-in account's own, and its only actions
     are the production hero's. */
  const frame = read(FRAME);
  assert.match(frame, /const \{ profile \} = useAccount\(\);/);
  assert.match(frame, /const heading = title \?\? profile\?\.firstName \?\? '';/);
  assert.match(frame, /const \{ signOut \} = useAuth\(\);/);
  assert.match(frame, /signOut\(\);\n    navigate\('\/', \{ replace: true \}\);/);
});

test("the stylesheet is scoped to the port, token-only, and every rule it writes is a class the shell draws", () => {
  const sheet = read(SHEET);
  assert.match(read(MOUNT), /import "\.\/customer\.account\.css";/, "the frame's stylesheet is not imported by the port");

  const stripped = sheet.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(/!important/.test(stripped), false, "the stylesheet forces declarations");
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(stripped), false, "the stylesheet hard-codes a colour instead of a token");

  /* Every selector — including the ones inside the small-screen block — is
     scoped to the port, so no rule here can reach the host application. */
  const selectors = [];
  let cursor = 0;
  for (const brace of stripped.matchAll(/\{/g)) {
    const before = stripped.slice(cursor, brace.index);
    const selector = before.slice(before.lastIndexOf("}") + 1).split("{").pop().trim();
    cursor = brace.index;
    if (selector && !selector.startsWith("@media")) selectors.push(selector);
  }
  assert.ok(selectors.length >= 10, `expected the frame's rules, found ${selectors.length}`);
  for (const selector of selectors) {
    assert.match(selector, /^\.aan-root /, `${selector} is not scoped to the port`);
  }

  /* Every token it reads is the design's own. */
  const tokens = new Set([...read(DESIGN_SHEET).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  for (const [, token] of sheet.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
    assert.ok(tokens.has(token), `${token} is not a token the design defines`);
  }

  /* No dead selector: everything it styles is drawn by the port's account
     components — the frame, the order frame, the navigation and the screens this
     phase has redrawn. */
  const drawn = new Set([...`${read(FRAME)}\n${read(ORDER_FRAME)}\n${read(NAV)}\n${REDRAWN_PAGES.map(read).join("\n")}`.matchAll(/pf-account(?:__[a-z-]+)?/g)].map((match) => match[0]));
  const styled = new Set([...sheet.matchAll(/\.(pf-account(?:__[a-z-]+)?)\b/g)].map((match) => match[1]));
  for (const className of styled) {
    assert.ok(drawn.has(className), `${className} is styled but never drawn`);
  }
});

test("the port's registry declares its own account files, once each", () => {
  const registry = read(REGISTRY);
  const added = registry.slice(registry.indexOf("const ADDED = ["), registry.indexOf("];", registry.indexOf("const ADDED = [")));

  /* The shell's three, plus every screen this phase has redrawn — declared as
     it is written, so the closure check knows it and never writes it. */
  for (const entry of [
    "customer.account.css",
    "pages/account/AccountFrame.jsx",
    "pages/account/OrderFrame.jsx",
    "pages/account/AccountNav.jsx",
    ...MIGRATED_SCREENS.map((screen) => `pages/account/${screen.page}`),
  ]) {
    assert.equal(count(added, `"${entry}"`), 1, `${entry} is not declared exactly once in the registry`);
    assert.ok(existsSync(join(ROOT, "src/components/customer", entry)), `${entry} is declared but does not exist`);
  }
});

test("Aarna account screens keep one primary landmark in the active customer layout", () => {
  const screens = [
    { path: "/account/settings", Component: on.AccountSettings, crumb: "Settings &amp; Preferences" },
    { path: "/account/security", Component: on.AccountSecurity, crumb: "Security" },
    { path: "/account/preferences", Component: on.AccountPreferences, crumb: "Style Preferences" },
    { path: "/account/instagram-rewards", Component: on.InstagramRewards, crumb: "Share &amp; Earn" },
  ];

  for (const { path, Component, crumb } of screens) {
    /* Aarna mode: the outer `Layout` owns `<main id="main">`; `AccountShell`
       must not wrap its section in a second `<main>`. */
    const customerMarkup = on.customerPage(React.createElement(Component, null), path);
    assert.equal(count(customerMarkup, "<main"), 1, `${path} in Aarna mode did not render exactly one <main> opening tag`);
    assert.equal(count(customerMarkup, "</main>"), 1, `${path} in Aarna mode did not render exactly one </main> closing tag`);
    assert.match(customerMarkup, /<main id="main">/, `${path} in Aarna mode lost the outer <main id="main"> landmark`);
    assert.equal(/<main\b[^>]*>[\s\S]*<main\b/.test(customerMarkup), false, `${path} in Aarna mode nested a <main> inside <main id="main">`);
    assert.match(customerMarkup, /class="skip-link"/, `${path} in Aarna mode lost the Aarna layout shell`);
    assert.match(customerMarkup, /aria-label="Account navigation"/, `${path} in Aarna mode lost the AccountShell navigation`);
    assert.match(customerMarkup, new RegExp(crumb), `${path} in Aarna mode lost its breadcrumb/content`);


  }
});
