/**
 * PRATIKSHYA FASHION — PHASE 8 · the guarded customer 404 handover.
 *
 * A URL this application serves no route for has always been the production
 * `NotFound`. With the switch on, Phase 8 answers those with the design's own
 * 404 instead — and the whole risk of that change is what it must NOT swallow.
 *
 *   · THE STAFF PORTALS. `/login`, `/admin/**`, `/super-admin/**` and
 *     `/employee/**` are not customer routes. Their own route trees own their
 *     genuine-not-found cases (`AdminNotFound` behind `/admin/*`, the employee
 *     portal behind its own prefix), they are guarded by their own auth, and the
 *     port's route table knows nothing about any of them. The boundary excludes
 *     them **by name, before anything is handed over** — and the exclusion is
 *     checked here against every staff path `App.jsx` actually declares, not
 *     against a list written out in the test.
 *   · EVERY ROUTE THE APPLICATION DOES SERVE. A handover that takes over one of
 *     them would be a silent regression on a working page. The test for this is
 *     the port's own `isRegisteredPath` — the same table its link translator
 *     consults — so the guard and the port can never disagree about what this
 *     application serves. `/cart`, `/checkout`, `/order-success`, `/account/**`
 *     and the auth screens are checked here explicitly, because they are the
 *     pages a customer is most likely to be on.
 *   · THE SWITCH. Off, the production 404 stands, unchanged.
 *
 * The path list is read out of `App.jsx` at test time, so a route added to the
 * application later cannot arrive unnoticed behind the guard.
 *
 * WHAT THIS CANNOT PROVE: that the rendered 404 looks right (the browser probe
 * covers that), and anything about a portal's own authorisation — this suite
 * proves only that Phase 8 never claims a portal URL.
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

/* ── every static path the application declares, straight out of `App.jsx` ── */

const DECLARED = [...new Set(
  [...read("src/App.jsx").matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.includes(":")),
)].sort();

const STAFF = DECLARED.filter((path) =>
  ["/login", "/admin", "/super-admin", "/employee"].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  ),
);

/* The routes a customer is most likely to be on, and the ones the audit named
   as out of scope for this phase: each must keep the page it has today. */
const KEPT_ON_PRODUCTION = [
  "/cart",
  "/checkout",
  "/order-success",
  "/account",
  "/account/profile",
  "/account/orders",
  "/account/security",
  "/account/ai-mirror",
  "/account/instagram-rewards",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

/* Paths no route serves: not a customer page, not a portal page. */
/* `/wishlist/anything` is here too: `/wishlist` is an exact route, so a deeper
   path is served by no route at all — whatever the wishlist page does with it,
   the boundary's answer must be the same as for any other unknown URL. */
const UNKNOWN = [
  "/no-such-page",
  "/collections-does-not-exist",
  "/pages/our-story",
  "/track-order",
  "/wishlist/anything",
];

const CATEGORY = { id: "sarees", name: "Sarees", slug: "sarees", status: "ACTIVE", eyebrow: "Women · Sarees" };
const RECORDS = [
  {
    id: "phase8-404-piece",
    name: "Phase 8 404 Piece",
    slug: "phase8-404-piece",
    price: 2600,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase8/404-cover.jpg",
    additionalImages: [],
    sizes: ["Free Size"],
    colors: ["Ink"],
    availability: "in-stock",
    stock: 2,
  },
];

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
    store,
    { isRegisteredPath },
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/config/storefrontHome.js"),
    load("/src/services/catalog/catalogStore.js"),
    load("/src/components/aarna/router/routes.js"),
  ]);

  let tree = React.createElement(CustomerLayout);
  for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
    tree = React.createElement(Provider, null, tree);
  }

  return {
    vite,
    boundary,
    store,
    isRegisteredPath,
    render: (path) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, tree),
        ),
      ),
  };
}

const SWITCH_ON = { "import.meta.env.VITE_STOREFRONT_HOME": '"aarna"' };
const SWITCH_OFF = { "import.meta.env.VITE_STOREFRONT_HOME": '"atelier"' };

let on = null;
let off = null;

before(async () => {
  on = await mount(SWITCH_ON);
  off = await mount(SWITCH_OFF);
  on.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections: [] });
  off.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections: [] });
});

after(async () => {
  await Promise.all([on?.vite.close(), off?.vite.close()]);
});

/* ── 1 · the guard itself, against the application's real route list ─────── */

test("the application declares staff routes and customer routes — the guard is tested against both", () => {
  assert.ok(STAFF.length > 100, `only ${STAFF.length} staff paths found in App.jsx — the list was not read`);
  assert.ok(STAFF.includes("/login"), "/login is not among the staff paths");
  assert.ok(STAFF.includes("/admin/*"), "/admin/* is not among the staff paths");
  assert.ok(STAFF.some((path) => path.startsWith("/super-admin")), "/super-admin paths are missing");
  assert.ok(STAFF.some((path) => path.startsWith("/employee")), "/employee paths are missing");
});

test("no staff portal path is ever handed to the port — by the boundary's own answer", () => {
  const claimed = STAFF.filter((path) => on.boundary.isAarnaCatchAllPath(path));
  assert.deepEqual(claimed, [], "the handover claims a staff portal path");
  for (const path of STAFF) {
    assert.equal(on.boundary.isStaffPortalPath(path), true, `${path} is not recognised as a portal path`);
  }
});

test("no route the application serves is handed over, either — the guard and the port share one table", () => {
  for (const path of DECLARED) {
    const served = on.isRegisteredPath(path);
    if (served) {
      assert.equal(on.boundary.isAarnaCatchAllPath(path), false, `${path} is served by the application but was claimed`);
    }
  }
  /* The check is only meaningful if the table actually answers. */
  assert.equal(on.isRegisteredPath("/cart"), true, "the port's route table no longer knows /cart");
  assert.equal(on.isRegisteredPath("/account/wishlist"), true, "the port's route table no longer knows /account/wishlist");
});

test("the guard answers false for the money path, the account, the auth screens and the wishlist", () => {
  for (const path of KEPT_ON_PRODUCTION) {
    assert.equal(on.boundary.isAarnaCatchAllPath(path), false, `${path} was claimed by the catch-all`);
  }
});

test("the guard answers true for a path no route serves, and only such a path", () => {
  for (const path of UNKNOWN) {
    assert.equal(on.boundary.isAarnaCatchAllPath(path), true, `${path} was not handed over`);
  }
  for (const trailing of ["/no-such-page/", "/no-such-page///"]) {
    assert.equal(on.boundary.isAarnaCatchAllPath(trailing), true, `${trailing} was not handed over`);
  }
});

/* ── 2 · what the browser actually renders ──────────────────────────────── */

test("with the switch on, an unknown customer URL is the design's 404 inside the design's shell", () => {
  for (const path of UNKNOWN) {
    const markup = on.render(path);
    assert.match(markup, /class="aan-root"/, `${path} did not mount the port`);
    assert.match(markup, /class="notfound|404/i, `${path} did not render the design's 404`);
    assert.equal(/class="shop container"/.test(markup), false, `${path} was given a listing it does not have`);
  }
});

test("with the switch off, an unknown customer URL is the application's own 404 — untouched", () => {
  const markup = off.render("/no-such-page");
  assert.equal(/aan-root/.test(markup), false, "/no-such-page mounted the port with the switch off");
  assert.equal(/class="notfound/.test(markup), false, "/no-such-page rendered the design's 404 with the switch off");
  /* The application's own shell is around it — the frame the production 404 has
     always been drawn inside. Its body is withheld from a server render
     (`PageTransition` mounts it in the browser), so what is pinned here is the
     switch: the port is not involved, and the production page is what is
     mounted. The words on that page are the browser probe's to check. */
  assert.match(markup, /class="min-h-screen flex flex-col bg-canvas text-ink font-display/, "the production shell is gone");
  assert.match(markup, /<footer/, "the production shell lost its footer");
});

test("the application's customer catch-all is still the production 404 — Phase 8 did not edit it", () => {
  const app = read("src/App.jsx");
  assert.match(app, /import NotFound from "\.\/pages\/NotFound";/);
  assert.match(app, /<Route path="\*" element=\{<NotFound \/>\} \/>/, "the customer catch-all no longer renders the production 404");
  assert.match(read("src/pages/NotFound.jsx"), /eyebrow="Error 404"/, "the production 404's own copy changed");
});

test("the account and the reset screen never move, with the switch on or off", () => {
  /* PHASE 9 adopted `/cart`, `/checkout` and `/order-success`, and PHASE 10 the
     three customer auth screens `/signin`, `/signup` and `/forgot-password` —
     those six DO mount the port now (pinned by their own suites). What must
     never move is the rest of the production surface, and this is it — with
     `/reset-password` standing where `/signin` stood: the one auth screen Phase
     10 deliberately kept production-side, because its flow cannot complete a
     reset (see `docs/PHASE-10-AUTHENTICATION-UI.md` §7). */
  for (const path of ["/reset-password", "/account/orders", "/account/addresses"]) {
    for (const [name, view] of [["on", on], ["off", off]]) {
      const markup = view.render(path);
      assert.equal(/class="aan-root"/.test(markup), false, `${path} mounted the port with the switch ${name}`);
    }
  }
});

test("a customer URL that IS served keeps its own page while the switch is on", () => {
  /* The listing, the product page, the wishlist and (PHASE 9) the money path
     are the port's own — and the account is not: the boundary tells them
     apart. */
  assert.match(on.render("/shop"), /class="aan-root"/, "/shop is served by the port yet was not handed over");
  assert.match(on.render("/cart"), /class="aan-root"/, "/cart is served by the port yet was not handed over");
  const account = on.render("/account/orders");
  assert.equal(/class="aan-root"/.test(account), false, "/account/orders was handed over");
  const wishlist = on.render("/account/wishlist");
  assert.match(wishlist, /class="aan-root"/, "/account/wishlist is served by the port yet was not handed over");
});

/* ── 3 · the guard's own source, so its reasoning cannot be lost ────────── */

test("the boundary names the staff prefixes explicitly and tests them before anything else", () => {
  const source = read("src/config/storefrontHome.js");
  assert.match(source, /export const STAFF_PORTAL_PREFIXES = \["\/login", "\/admin", "\/super-admin", "\/employee"\];/);
  assert.match(source, /if \(isStaffPortalPath\(pathname\)\) return false;/,
    "the catch-all does not exclude the portals first");
  assert.match(source, /return !isRegisteredPath\(pathname\);/,
    "the catch-all does not consult the port's own route table");
  assert.match(source, /import \{ isRegisteredPath \} from "\.\.\/components\/aarna\/router\/routes\.js";/,
    "the boundary keeps its own copy of what the application serves");
});
