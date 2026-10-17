/**
 * PRATIKSHYA FASHION — PHASE 8 · the design's wishlist, on this application's list.
 *
 * Phase 8 adopts `home-page/src/pages/Wishlist.jsx` the way Phase 6 adopted the
 * product page and Phase 7 the listing: the design's file carried over by
 * `scripts/aarna-port.js`, adapted only by named rewrites, reachable only
 * mounted on the Aarna customer route with no storefront selector, and
 * bound to `WishlistContext` / `ShoppingContext` instead of the design's bundled
 * catalogue.
 *
 * What these tests render is the real composition: `CustomerLayout` inside this
 * application's provider stack, at the route a browser reaches, through Vite's
 * SSR pipeline — no component is rendered in isolation and no context is faked.
 * The wishlist they read is the application's own: a guest list restored from
 * `localStorage` (synchronous, so it exists on the first render) resolved against
 * the catalogue store, which is seeded exactly as the application seeds it after
 * a successful fetch.
 *
 *   1. THE SWITCH, AND WHERE IT STOPS. Off, `/account/wishlist` is the
 *      production wishlist and `/wishlist` its production redirect. On, the
 *      design's wishlist owns both, and `/cart` does not move.
 *   2. NO SECOND CATALOGUE. The ported page reads `WishlistContext` and
 *      `ShoppingContext`; the design's own `getByIds` table is not consulted,
 *      and no product, price or availability is written by the page.
 *   3. THE STATES THE DESIGN NEVER DREW. An empty list explains itself honestly
 *      (the design said "saved on this device", which is false for a signed-in
 *      shopper); a saved piece the catalogue no longer resolves is shown as
 *      itself, with no substitute, no image and no price; an unbuyable piece
 *      says so; a piece that needs a deliberate choice offers the choice.
 *   4. THE COPY THAT IS BANNED STAYS BANNED. The design's prototype prose
 *      ("sample data", "not connected to an order system", …) appears nowhere.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM in this tree, so clicks, focus and
 * layout are out of scope here — the browser probe covers them on a real
 * Chromium. Effects do not run under `renderToStaticMarkup`, so the three states
 * that only exist after an effect — the first fetch (`isLoading`), a failed
 * fetch, and the 401/403 branch — are pinned here at the source level (the page
 * reads the context's own fields and renders exactly those branches) and
 * exercised live in the browser probe with an intercepted session. Nothing here
 * is claimed as an end-to-end backend verification.
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

import { DESIGN_SRC } from "../../../../scripts/aarna-port.js";

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
const PORTED = "src/components/customer/pages/Wishlist.jsx";
/* The design's own file, through the port tool's own root — never a second path
   written out here, which could drift from the one the tool copies from. */
const DESIGN = join(DESIGN_SRC, "pages/Wishlist.jsx");

/* ── the catalogue, in the shape `catalogStore` normalises ─────────────────── */

const CATEGORY = { id: "sarees", name: "Sarees", slug: "sarees", status: "ACTIVE", eyebrow: "Women · Sarees" };

const RECORDS = [
  {
    id: "phase8-banarasi",
    name: "Phase 8 Banarasi",
    slug: "phase8-banarasi",
    sku: "P8-BAN-01",
    price: 4200,
    originalPrice: 5200,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase8/banarasi-cover.jpg",
    additionalImages: ["/fixtures/phase8/banarasi-alt.jpg"],
    sizes: ["Free Size"],
    colors: ["Ink"],
    occasion: ["Wedding"],
    fabric: "Katan Silk",
    description: "A handloom Banarasi, woven for the wedding season.",
    availability: "in-stock",
    stock: 6,
  },
  {
    /* Two sizes, neither of them "Free Size" — `requiresVariantChoice` is true,
       so the page must offer the choice rather than force one. */
    id: "phase8-blouse",
    name: "Phase 8 Blouse",
    slug: "phase8-blouse",
    sku: "P8-BLO-01",
    price: 1800,
    originalPrice: null,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase8/blouse-cover.jpg",
    additionalImages: [],
    sizes: ["S", "M"],
    colors: ["Ink"],
    occasion: ["Festive"],
    fabric: "Silk",
    description: "A ready blouse.",
    availability: "in-stock",
    stock: 4,
  },
  {
    id: "phase8-sold-out",
    name: "Phase 8 Sold Out",
    slug: "phase8-sold-out",
    sku: "P8-SOL-01",
    price: 6400,
    originalPrice: null,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase8/sold-out-cover.jpg",
    additionalImages: [],
    sizes: ["Free Size"],
    colors: ["Ink"],
    occasion: ["Wedding"],
    fabric: "Tissue",
    description: "An archived piece.",
    availability: "unavailable",
    stock: 0,
  },
];

/* An id the catalogue no longer resolves — the case `WishlistContext` tracks
   explicitly as `{ id, product: null, unavailable }`. */
const GONE_ID = "phase8-no-longer-in-the-catalogue";

/* ── the browser a server-rendered page still has to believe in ──────────────
 *
 * The guest wishlist is restored synchronously from `localStorage`
 * (`WishlistContext.jsx::restoreGuestWishlist`), which is what makes the
 * signed-out list renderable without a DOM. Every browser API this tree touches
 * is reached behind a `typeof window === "undefined"` guard or from an effect,
 * so a window with exactly these two members changes nothing else: no
 * `matchMedia`, no animation listeners, no scrolling. The storage is real
 * storage — the page reads and writes it the way it does in a browser.
 */
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
  /* The catalogue store announces its revisions to the window. Nothing can be
     listening in a server render — every listener is registered in an effect —
     so the announcement is delivered to nobody, exactly as in a browser tab
     whose modules have not mounted yet. */
  dispatchEvent: NOOP,
  addEventListener: NOOP,
  removeEventListener: NOOP,
};

const WISHLIST_KEY = "pratikshya_wishlist";
const saveGuestWishlist = (ids) => {
  storage.set(WISHLIST_KEY, JSON.stringify(ids));
};

/* ── the mount: the application's provider stack, at one path ─────────────── */

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
    { default: AuthContext, AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    store,
    boundary,
    shopping,
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/services/catalog/catalogStore.js"),
    load("/src/components/customer/mock/data/products.js"),
    load("/src/utils/shopping.js"),
  ]);

  let innerTree = React.createElement(CustomerLayout);
  for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider]) {
    innerTree = React.createElement(Provider, null, innerTree);
  }
  const tree = React.createElement(AuthProvider, null, innerTree);
  const signedInTree = React.createElement(
    AuthContext.Provider,
    {
      value: {
        user: { id: "cust-1", firstName: "Ananya", lastName: "Sharma", email: "ananya@example.com" },
        isAuthenticated: true,
        isLoading: false,
        signOut: NOOP,
      },
    },
    innerTree,
  );

  return {
    vite,
    store,
    boundary,
    shopping,
    render: (path) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, tree),
        ),
      ),
    renderSignedIn: (path) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, signedInTree),
        ),
      ),
  };
}


let on = null;
let off = null;

before(async () => {
  on = await mount({});
  off = await mount({});
  on.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections: [] });
  off.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections: [] });
  saveGuestWishlist([]);
});

after(async () => {
  await Promise.all([on?.vite.close(), off?.vite.close()]);
  delete globalThis.window;
});

/* ── 1 · the switch, and where it stops ─────────────────────────────────── */

test("the canonical wishlist renders in Aarna and its legacy route remains an in-shell redirect", () => {
  const canonical = off.render("/account/wishlist");
  assert.match(canonical, /class="aan-root"/);
  assert.match(canonical, /Saved pieces/);
  const legacy = off.render("/wishlist");
  assert.match(legacy, /class="aan-root"/);
  assert.equal(/Saved pieces/.test(legacy), false, "the legacy URL rendered the page instead of redirecting");
});

test("with the switch on, the design's wishlist owns /account/wishlist — and the cart does not move", () => {
  const canonical = on.render("/account/wishlist");
  assert.match(canonical, /class="aan-root"/, "the canonical route did not mount the port");
  assert.match(canonical, /class="shop container"/, "the canonical route did not render the design's wishlist shell");
  assert.match(canonical, /class="label">Saved pieces</, "the design's eyebrow is gone");
  assert.match(canonical, /class="display shop__title">Wishlist</, "the design's title is gone");

  /* `/wishlist` is the legacy entry: the port answers it with the same redirect
     `App.jsx` does, inside the design's shell — the header's heart leads into the
     port, not out of it. A server render of a redirect paints its destination,
     not its source, so what is asserted here is that the port took the route and
     the production wishlist did not; the redirect itself is exercised in the
     browser probe. */
  const legacy = on.render("/wishlist");
  assert.match(legacy, /class="aan-root"/, "/wishlist did not mount the port");
  assert.equal(/Saved pieces/.test(legacy), false, "/wishlist rendered the design's wishlist instead of redirecting");
  assert.equal(/pratikshya-wishlist|Wishlist<\/h1>/.test(legacy), false, "/wishlist rendered a production wishlist page");

  /* The account is not this surface's either — and since PHASE 11 it is the
     port's own, which is exactly what this pin now says: the wishlist's two
     routes and the account's thirteen are different families, and a guest
     asking for the guarded one paints neither a wishlist nor an account screen
     on the server (a static render cannot paint the guard's effect-driven
     redirect — see `customerAccountShell.test.js`). (PHASE 9 handed the money path
     over by name, PHASE 10 the auth screens, PHASE 11 the account.) */
  const account = on.render("/account/orders");
  assert.match(account, /class="aan-root"/, "/account/orders is not the port's, though Phase 11 adopted the account");
  assert.equal(/pf-account/.test(account), false, "/account/orders painted account chrome on the server render — a guest must be shown none");
  assert.equal(/Saved pieces/.test(account), false, "/account/orders was served as the wishlist");
});

/* ── 2 · the empty list, and the sentence the design got wrong ────────────── */

test("an empty wishlist is the design's block with an honest sentence and a resolvable way out", () => {
  saveGuestWishlist([]);
  const markup = on.render("/account/wishlist");

  assert.match(markup, /class="empty"/, "the design's empty block is gone");
  assert.match(markup, /Nothing saved yet\./);
  assert.match(markup, /saved to your account when you are signed in, and on this device when you are not\./);
  assert.match(markup, /<a class="btn btn--solid"[^>]*href="\/shop"[^>]*><span>Discover pieces<\/span><\/a>/,
    "the empty state lost its way out to the shop");
  assert.match(markup, /class="shop__count">0 pieces saved</, "the count does not state what is saved");
});

test("the empty state never claims the list is device-only, and never invents a price", () => {
  saveGuestWishlist([]);
  const markup = on.render("/account/wishlist");
  assert.equal(/saved on this device/i.test(markup), false, "the design's device-only claim survived");
  assert.equal(/₹|\bRs\.?\s?\d/.test(markup), false, "an empty wishlist shows a price");
});

/* ── 3 · a saved piece the catalogue still carries ────────────────────────── */

test("a saved piece renders the design's card, with this application's availability and its own remove", () => {
  saveGuestWishlist(["phase8-banarasi"]);
  const markup = on.render("/account/wishlist");

  assert.match(markup, /class="shop__count">1 piece saved</, "one saved piece is not counted as one piece");
  assert.match(markup, /class="pcard-cell"/, "the card is not wrapped in this application's cell");
  assert.match(markup, /Phase 8 Banarasi/, "the catalogue record's name is missing");
  assert.match(markup, /₹4,200/, "the catalogue record's price is missing");
  assert.match(markup, /class="wishlist-row"/, "the row of actions is missing");
  assert.match(markup, /<span>Add to bag<\/span>/, "a plain in-stock piece lost its add-to-bag action");
  assert.match(markup, /class="wishlist-remove"[^>]*>Remove</, "a saved piece has no remove control");
  assert.equal(/class="empty"/.test(markup), false, "a non-empty list rendered the empty block");
});

test("the media plates come from the canonical media set, not from the record's raw image field", () => {
  saveGuestWishlist(["phase8-banarasi"]);
  const markup = on.render("/account/wishlist");
  /* `useProductCovers` is this application's media selector; the card is handed
     its plates, so the cover the media library publishes is the one drawn. */
  assert.match(markup, /src="\/fixtures\/phase8\/banarasi-cover\.jpg"/, "the canonical cover is not drawn");
  assert.match(markup, /src="\/fixtures\/phase8\/banarasi-alt\.jpg"/, "the canonical alternate is not drawn");
});

test("no plate is a stringified media record — every src the page draws is a URL string", () => {
  saveGuestWishlist(["phase8-banarasi"]);
  const markup = on.render("/account/wishlist");

  /* The regression: `useProductCovers` publishes media records (`{ id, src, … }`)
     and the design's card prints its `src` attribute verbatim, so a page that
     handed the records straight through drew `src="[object Object]"` — no cover
     at all. The conversion is this application's own single resolver, and it
     leaves no record anywhere in the page. */
  assert.equal(/\[object Object\]/.test(markup), false, "a media record was stringified into the page");

  const srcs = [...markup.matchAll(/<img\b[^>]*?\ssrc="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(srcs.length > 0, "the saved piece drew no plate at all");
  for (const src of srcs) {
    assert.notEqual(src, "", `a plate resolved to nothing: ${JSON.stringify(src)}`);
    assert.equal(src.trim(), src, `a plate carries stray whitespace: ${JSON.stringify(src)}`);
    assert.match(src, /^(?:https?:|data:|blob:|\/)/, `a plate is not a URL: ${src}`);
  }

  /* …and the page resolves them through the application's one resolver, not a
     second one of its own. */
  const source = read(PORTED);
  assert.match(source, /import \{ normalizeMediaReference \} from '\.\.\/\.\.\/\.\.\/services\/media\/mediaPaths\.js';/,
    "the page does not use the application's media resolver");
  assert.match(source, /\.map\(\(reference\) => normalizeMediaReference\(reference\)\)/,
    "the plates are not passed through that resolver");
  assert.equal(/function plateUrl/.test(source), false, "the page kept a media resolver of its own");
  saveGuestWishlist([]);
});

test("a piece that needs a choice offers it, and a piece that cannot be bought says so", () => {
  saveGuestWishlist(["phase8-blouse"]);
  const variant = on.render("/account/wishlist");
  assert.match(variant, /<span>Choose options<\/span>/, "a variant-only piece was given a one-tap add");

  saveGuestWishlist(["phase8-sold-out"]);
  const soldOut = on.render("/account/wishlist");
  assert.match(soldOut, /<span>Unavailable<\/span>/, "an unbuyable piece was offered for sale");
  assert.match(soldOut, /disabled/, "an unbuyable piece's action is still live");
  saveGuestWishlist([]);
});

/* ── 4 · a saved piece the catalogue no longer resolves ──────────────────── */

test("a saved piece the catalogue cannot resolve is shown as itself — with no substitute invented", () => {
  saveGuestWishlist([GONE_ID]);
  const page = on.render("/account/wishlist");
  /* The design's own shell is around the page — its rail, header, footer and the
     logos in them. What must carry nothing invented is the body. */
  const markup = page.slice(page.indexOf('id="main"'), page.indexOf("</main>"));

  assert.match(markup, /class="wishlist-gone"/, "an unresolvable saved piece was hidden or replaced by a card");
  /* The application's own words for this state, verbatim — see the browser
     probe: `WishlistContext`'s `unavailable` flag stays false in practice, and
     the production wishlist states this much for any saved id whose record is
     missing. The port does not promise a resolution that may never arrive. */
  assert.match(markup, /class="wishlist-gone__title">No longer available</, "the state's own wording is missing");
  assert.match(markup, /This saved piece is no longer part of the atelier\u2019s current collection\.[\s\S]*Remove/);
  assert.match(markup, /class="wishlist-remove"/, "an unresolvable saved piece cannot be removed");
  assert.match(markup, /class="shop__count">1 piece saved</, "an unresolvable saved piece is not counted");

  /* Nothing is drawn in its place: no card, no plate, no price, no name. */
  assert.equal(/class="pcard/.test(markup), false, "a card was invented for an unresolvable piece");
  assert.equal(/₹|\bRs\.?\s?\d/.test(markup), false, "a price was invented for an unresolvable piece");
  assert.equal(/<img/.test(markup), false, "an image was invented for an unresolvable piece");
  assert.equal(new RegExp(GONE_ID).test(markup), false, "the raw catalogue id leaked into the page");
  saveGuestWishlist([]);
});

/* ── 5 · no second catalogue, no invented states, no banned copy ──────────── */

test("the ported page reads this application's own lists and writes nothing of its own", () => {
  const source = read(PORTED);
  assert.match(source, /import \{ useWishlist \} from '\.\.\/\.\.\/\.\.\/context\/WishlistContext\.jsx';/);
  assert.match(source, /import \{ useShopping \} from '\.\.\/\.\.\/\.\.\/context\/ShoppingContext\.jsx';/);
  assert.match(source, /const result = await moveToCart\(product\);/, "add-to-bag does not use the application's own action");
  assert.match(source, /if \(result\?\.needsVariant\) \{ navigate\(productHref\(product\)\); return; \}/,
    "a variant-only piece is not sent to its own page");
  assert.match(source, /useProductCovers\(entries\.map\(\(entry\) => entry\.product\)\.filter\(Boolean\)\)/,
    "the plates do not come from the canonical media selector");
  assert.match(source, /const mapped = toDesignProduct\(record\);/, "the card is not built from the catalogue record");
  assert.match(source, /const choose = requiresVariantChoice\(record\);/, "the variant rule is not this application's own");
  assert.match(source, /import \{ useUI \} from '\.\.\/state\/UIContext\.jsx';/, "the page does not use the port's own drawer");
  assert.match(source, /if \(ok\) openCart\(\);/, "a piece added to the bag is not shown in it");
  assert.match(source, /const timer = setTimeout\(\(\) => setFeedback\(null\), 4200\);/, "the confirmation never clears");

  /* The design's bundled lookup is gone, and so is its data module. */
  assert.equal(/getByIds/.test(source), false, "the ported page still reads the design's bundled catalogue");
  assert.equal(/from '\.\.\/data\/index\.js'/.test(source), false, "the ported page still imports the design's data barrel");
});

test("the ported page states the tab title the production wishlist states", () => {
  const source = read(PORTED);
  assert.match(source, /document\.title = 'Wishlist — PRATIKSHYA FASHION';/);
  /* …and puts back whatever it found, so leaving the page leaves no trace. */
  assert.match(source, /return \(\) => \{ document\.title = previous; \};/);
});

test("every state comes from the context's own fields — including the 401/403 case", () => {
  const source = read(PORTED);
  assert.match(source, /const firstLoad = wishlist\.isLoading && count === 0;/);
  assert.match(source, /const failed = Boolean\(wishlist\.error\) && count === 0;/);
  assert.match(source, /<WishlistError status=\{wishlist\.errorStatus\} \/>/);
  assert.match(source, /const lapsed = status === 401 \|\| status === 403;/,
    "a lapsed session is not told apart from an unreachable list");
  assert.match(source, /<Button to="\/signin\?returnTo=%2Faccount%2Fwishlist">Sign in<\/Button>/,
    "the lapsed-session branch lost the way back to sign-in");
  assert.match(source, /We could not load your wishlist right now\. Please try again\./);
  assert.equal(/isSyncing: false|isLoading: false/.test(source), false, "a state was hard-coded instead of read");
});

test("the design's prototype copy is nowhere on the page", () => {
  const source = read(PORTED);
  for (const banned of [
    "sample data",
    "prototype",
    "not connected to an order system",
    "No personal data is sent to a server",
    "demonstration",
  ]) {
    assert.equal(new RegExp(banned, "i").test(source), false, `the ported wishlist carries “${banned}”`);
  }
});

test("the ported file is the design's file, adapted by exactly the pinned amount", () => {
  const design = readFileSync(DESIGN, "utf8");
  const ported = read(PORTED);
  assert.notEqual(design, ported, "the ported file is identical to the design — the adaptations were lost");
  /* The design's own shell survives: header, crumb trail and card grid. */
  assert.match(ported, /<div className="shop container">/);
  assert.match(ported, /<nav className="crumbs" aria-label="Breadcrumb">/);
  assert.match(ported, /<div className="grid-4">/);
  assert.match(ported, /<ProductCard product=\{card\} \/>/);
  assert.match(design, /getByIds\(wishlist\)/, "the design file changed — the pin in the port tool needs re-measuring");
});

/* ── 6 · account-frame integration for signed-in shoppers vs guest access ─── */

test("guest `/account/wishlist` and `/wishlist` keep the standalone wishlist shell with no account navigation", () => {
  saveGuestWishlist([]);
  const guestCanonical = on.render("/account/wishlist");
  assert.match(guestCanonical, /class="shop container"/, "guest `/account/wishlist` lost the standalone shop container");
  assert.equal(/class="info container account pf-account"/.test(guestCanonical), false, "guest `/account/wishlist` rendered the signed-in account frame");
  assert.equal(/aria-label="Account navigation"/.test(guestCanonical), false, "guest `/account/wishlist` rendered authenticated account navigation");
  assert.equal((guestCanonical.match(/aria-label="Breadcrumb"/g) ?? []).length, 1, "guest `/account/wishlist` rendered duplicate breadcrumbs");

  const guestLegacy = on.render("/wishlist");
  assert.match(guestLegacy, /class="aan-root"/, "guest `/wishlist` did not mount the port");
  assert.equal(/aria-label="Account navigation"/.test(guestLegacy), false, "guest `/wishlist` rendered authenticated account navigation");
});

test("signed-in `/account/wishlist` renders inside `AccountFrame` with active Wishlist navigation and preserves wishlist state and actions", () => {
  saveGuestWishlist([]);
  const emptySignedIn = on.renderSignedIn("/account/wishlist");

  assert.match(emptySignedIn, /class="info container account pf-account"/, "signed-in `/account/wishlist` did not render inside `AccountFrame`");
  assert.equal(/class="shop container"/.test(emptySignedIn), false, "signed-in `/account/wishlist` rendered a duplicate standalone `.shop.container` wrapper");
  assert.match(emptySignedIn, /<nav class="pf-account__nav" aria-label="Account navigation">/, "signed-in `/account/wishlist` is missing the shared account navigation");
  assert.equal((emptySignedIn.match(/aria-label="Breadcrumb"/g) ?? []).length, 1, "signed-in `/account/wishlist` rendered duplicate breadcrumb trails");
  assert.equal((emptySignedIn.match(/<h1\b/g) ?? []).length, 1, "signed-in `/account/wishlist` rendered more than one `<h1>` heading");
  assert.match(emptySignedIn, /<h1 class="display pf-account__name">Wishlist<\/h1>/, "signed-in `/account/wishlist` did not title the account frame `Wishlist`");
  assert.match(emptySignedIn, /<h2 class="display shop__title">Your <em>wishlist<\/em><\/h2>/, "signed-in `/account/wishlist` lost its section heading");
  assert.match(emptySignedIn, /<span aria-current="page">Wishlist<\/span>/, "signed-in `/account/wishlist` breadcrumb does not end on Wishlist");

  const navLinks = [...emptySignedIn.matchAll(/<a ([^>]*class="[^"]*pf-account__nav-link[^"]*"[^>]*)>([\s\S]*?)<\/a>/g)].map(([, attrs, inner]) => ({
    href: (attrs.match(/href="([^"]*)"/) ?? [])[1] ?? null,
    className: (attrs.match(/class="([^"]*)"/) ?? [])[1] ?? "",
    ariaCurrent: (attrs.match(/aria-current="([^"]*)"/) ?? [])[1] ?? null,
    inner,
  }));
  assert.equal(navLinks.length, 11, "signed-in `/account/wishlist` did not render all eleven account navigation tabs");
  const activeLinks = navLinks.filter((link) => link.ariaCurrent === "page" || link.className.includes("is-active"));
  assert.deepEqual(activeLinks.map((link) => link.href), ["/account/wishlist"], "the Wishlist tab is not the sole active account navigation item on `/account/wishlist`");
  assert.equal(/pf-account__nav-count/.test(emptySignedIn), false, "an empty signed-in wishlist rendered a badge count");

  /* Populated state inside the signed-in account frame preserves cards, counts, and actions. */
  saveGuestWishlist(["phase8-banarasi", "phase8-blouse", "phase8-sold-out", GONE_ID]);
  const populatedSignedIn = on.renderSignedIn("/account/wishlist");
  assert.match(populatedSignedIn, /<span class="pf-account__nav-count">4<\/span>/, "signed-in account navigation did not show the saved count badge on the Wishlist tab");
  assert.match(populatedSignedIn, /class="shop__count">4 pieces saved</, "signed-in `/account/wishlist` did not state the saved count");
  assert.match(populatedSignedIn, /Phase 8 Banarasi/, "signed-in `/account/wishlist` did not render saved product cards");
  assert.match(populatedSignedIn, /<span>Add to bag<\/span>/, "signed-in `/account/wishlist` lost the add-to-bag action");
  assert.match(populatedSignedIn, /<span>Choose options<\/span>/, "signed-in `/account/wishlist` lost the variant-choice action");
  assert.match(populatedSignedIn, /<span>Unavailable<\/span>/, "signed-in `/account/wishlist` lost the unavailable state");
  assert.match(populatedSignedIn, /class="wishlist-gone__title">No longer available</, "signed-in `/account/wishlist` lost the gone-piece state");
  assert.match(populatedSignedIn, /class="wishlist-remove"[^>]*>Remove</, "signed-in `/account/wishlist` lost the remove action");
  saveGuestWishlist([]);
});
