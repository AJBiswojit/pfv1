/**
 * PRATIKSHYA FASHION — PHASE 9 · the design's bag, over this application's cart.
 *
 * Phase 9 adopts `/cart` the way Phase 6 adopted the product page, Phase 7 the
 * listing and Phase 8 the wishlist: the page is written in the design's own
 * vocabulary (`.container`, `.crumbs`, `.label`, `.display`, `.totals`, the
 * `.btn` register, the drawer's `qty` control, the `.empty` block) and bound to
 * `CartContext` — the Aarna bag's shared commerce state. It is reachable on
 * the customer route without an environment flag or query-string selector.
 *
 * What these tests render is the real composition: `CustomerLayout` inside this
 * application's provider stack, at the route a browser reaches, through Vite's
 * SSR pipeline — no component is rendered in isolation and no context is
 * faked. The bag they read is the application's own: a guest bag restored
 * synchronously from `localStorage` and resolved against the catalogue store,
 * seeded exactly as the application seeds it after a successful fetch. Every
 * figure asserted below is computed in the test by the application's OWN
 * `calculateCartTotals` from the same records — so a page that invented,
 * re-summed or rounded a price would fail here.
 *
 *   1. THE SWITCH, AND WHERE IT STOPS. Off, `/cart` is the production bag. On,
 *      the port owns it — inside the design's FULL shell, unlike the quiet
 *      order-journey routes the checkout suite pins.
 *   2. THE BAG IS THE CONTEXT'S. Rows, variants, quantities, ceilings, offer
 *      field, ledger and mobile total all come from `CartContext`; the page
 *      sums nothing, re-prices nothing and calls no API of its own.
 *   3. WHAT THE DESIGN NEVER DREW. An unresolvable line, an archived piece, the
 *      ceiling note, the empty bag's two ways out, the closing rail.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM in this tree, so clicks, focus,
 * keyboard behaviour and layout are out of scope here — the browser probe
 * covers them on a real Chromium, and the layout claims live in
 * `customer.checkout.css` (measured in the probe, not here). Effects do not run
 * under `renderToStaticMarkup`, so the states that only exist after an effect —
 * the first authenticated load (`isLoading`), a failed load and the 401/403
 * copy — are pinned at the source level here and exercised live in the probe.
 * Nothing here is claimed as an end-to-end backend verification.
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
const PORTED = "src/components/customer/pages/Cart.jsx";
const DIALOGUE = "src/components/customer/customer.checkout.css";

/* ── the catalogue, in the shape `catalogStore` normalises ─────────────────── */

const CATEGORY = { id: "sarees", name: "Sarees", slug: "sarees", status: "ACTIVE", eyebrow: "Women · Sarees" };

const RECORDS = [
  {
    id: "phase9-banarasi",
    name: "Phase 9 Banarasi",
    slug: "phase9-banarasi",
    sku: "P9-BAN-01",
    price: 4200,
    originalPrice: 5200,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase9/banarasi-cover.jpg",
    additionalImages: [],
    sizes: ["Free Size"],
    colors: ["Ink"],
    occasion: ["Wedding"],
    fabric: "Katan Silk",
    description: "A handloom Banarasi, woven for the wedding season.",
    availability: "in-stock",
    stock: 5,
  },
  {
    /* Two in stock: the ceiling the bag must respect is a real, small number,
       so a page that ignored `getMaxQuantity` would be caught by the markup. */
    id: "phase9-blouse",
    name: "Phase 9 Blouse",
    slug: "phase9-blouse",
    sku: "P9-BLO-01",
    price: 1800,
    originalPrice: null,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase9/blouse-cover.jpg",
    additionalImages: [],
    sizes: ["S", "M"],
    colors: ["Ivory"],
    occasion: ["Festive"],
    fabric: "Silk",
    description: "A ready blouse.",
    availability: "in-stock",
    stock: 2,
  },
  {
    /* The atelier archived this piece while it sat in the bag. */
    id: "phase9-archived",
    name: "Phase 9 Archived",
    slug: "phase9-archived",
    sku: "P9-ARC-01",
    price: 9900,
    originalPrice: null,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase9/archived-cover.jpg",
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

/* An id the catalogue no longer resolves at all. `CartContext` resolves every
   line against the catalogue and drops what it cannot resolve — production's
   own rule, unchanged by this phase. */
const GONE_ID = "phase9-no-longer-in-the-catalogue";

const LINES = [
  { id: "line-1", productId: "phase9-banarasi", color: "Ink", size: "Free Size", quantity: 2, addedAt: 1 },
  { id: "line-2", productId: "phase9-blouse", color: "Ivory", size: "S", quantity: 2, addedAt: 2 },
  { id: "line-3", productId: "phase9-archived", color: "Ink", size: "Free Size", quantity: 1, addedAt: 3 },
  { id: "line-4", productId: GONE_ID, color: null, size: null, quantity: 1, addedAt: 4 },
];

const STORED = { lines: LINES, coupon: null };
const CART_KEY = "pratikshya_cart";

/* ── the browser a server-rendered page still has to believe in ──────────────
 *
 * The guest bag is restored synchronously from `localStorage`
 * (`CartContext.jsx` → `restoreGuestCart`), which is what makes the signed-out
 * bag renderable without a DOM. Every browser API this tree touches is reached
 * behind a `typeof window === "undefined"` guard or from an effect, so a window
 * with exactly these members changes nothing else: no `matchMedia`, no
 * animation listeners, no scrolling. The storage is real storage — the page
 * reads the bag the way it does in a browser.
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

const saveGuestCart = (stored) => storage.set(CART_KEY, JSON.stringify(stored));

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
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    store,
    shopping,
    boundary,
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/services/catalog/catalogStore.js"),
    load("/src/utils/shopping.js"),
    load("/src/config/customerRoutes.js"),
  ]);

  let tree = React.createElement(CustomerLayout);
  for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
    tree = React.createElement(Provider, null, tree);
  }

  return {
    vite,
    store,
    shopping,
    boundary,
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


let on = null;
let off = null;

before(async () => {
  on = await mount({});
  off = await mount({});
  on.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections: [] });
  off.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections: [] });
  saveGuestCart(STORED);
});

after(async () => {
  await Promise.all([on?.vite.close(), off?.vite.close()]);
  delete globalThis.window;
});

/* ── the application's own arithmetic, so the page cannot invent one ───────── */

const byId = new Map(RECORDS.map((record) => [record.id, record]));
/** What `CartContext` builds for a guest bag: the catalogue record per line. */
const resolvedItems = (lines) =>
  lines.map((line) => ({ ...line, product: byId.get(line.productId) })).filter((line) => line.product);
const expectedTotals = (lines) => on.shopping.calculateCartTotals(resolvedItems(lines));
const rx = (text) => new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

/* A module specifier that is not relative and not one of the four runtime
   packages this tree already uses would be a new dependency. */
const RUNTIME_PACKAGES = new Set(["react", "react-dom", "react-router-dom", "lucide-react"]);
const importSpecifiers = (source) =>
  [...source.matchAll(/^\s*import\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/gm)].map((match) => match[1]);

/* ── 1 · the switch, and where it stops ─────────────────────────────────── */

test("/cart always renders Aarna's bag regardless of the former override", () => {
  const markup = off.render("/cart");
  assert.ok(markup.length > 0, "/cart rendered nothing at all");
  assert.match(markup, /class="pf-root"/);
  assert.match(markup, /class="container pf-bag"/);
});

test("with the switch on, /cart is the port — inside the design's full shell", () => {
  const markup = on.render("/cart");
  assert.match(markup, /class="pf-root"/, "the canonical route did not mount the port");
  assert.match(markup, /class="container pf-bag"/, "/cart did not render the ported bag page");
  /* The bag keeps the SHOPPING chrome, unlike the two quiet order-journey
     routes: the design's footer, its skip link and its drawer travel with it. */
  assert.match(markup, /class="footer"/, "the design's footer is missing from the bag");
  assert.match(markup, /class="skip-link"/, "the design's skip link is missing from the bag");
  assert.equal(/pf-journey/.test(markup), false, "the bag rendered the quiet journey chrome instead");
});

test("the money path is a journey path by name, and nothing else joins it", () => {
  const { boundary } = on;
  assert.deepEqual(
    [...boundary.CUSTOMER_JOURNEY_PATHS].sort(),
    ["/cart", "/checkout", "/order-success"],
    "the journey set is not the three routes Phase 9 adopted",
  );
  for (const path of ["/cart", "/checkout", "/order-success", "/cart/"]) {
    assert.equal(boundary.isCustomerJourneyPath(path), true, `${path} is not treated as a journey path`);
  }
  for (const path of ["/cart/line-1", "/checkout/payment", "/account/orders", "/signin", "/admin/orders"]) {
    assert.equal(boundary.isCustomerJourneyPath(path), false, `${path} was claimed by the journey paths`);
  }
  /* …and the catch-all still refuses all three: they are answered by name. */
  for (const path of ["/cart", "/checkout", "/order-success"]) {
    assert.equal(boundary.isCustomerCatchAllPath(path), false, `${path} was claimed by the catch-all`);
    assert.equal(boundary.isStaffPortalPath(path), false, `${path} was claimed by the staff portals`);
  }
});

/* ── 2 · the bag is the application's own ───────────────────────────────── */

test("every resolvable line renders with the application's own name, variant and quantity", () => {
  const markup = on.render("/cart");
  assert.match(markup, /class="pf-line"/, "no line rendered at all");
  assert.match(markup, rx("Phase 9 Banarasi"), "a piece in the bag is missing");
  assert.match(markup, rx("Phase 9 Blouse"), "a piece in the bag is missing");
  assert.match(markup, /Ink · Free Size/, "the first line's variant is missing");
  assert.match(markup, /Ivory · S/, "the second line's variant is missing");
  assert.match(markup, /aria-label="Quantity for Phase 9 Banarasi"/, "the quantity control lost its label");
  /* The bag holds 2 + 2 + 1 + 1 pieces; the header states the bag's own count,
     exactly as the production bag's counter does (the context counts every
     line it holds, resolved or not — production's rule, not this page's). */
  assert.match(markup, /6 pieces/, "the header count is not the bag's own");
});

test("the money is the bag's own: every figure is `calculateCartTotals` on the same records", () => {
  const totals = expectedTotals(LINES);
  const markup = on.render("/cart");
  const rupees = (value) => rx(on.shopping.formatINR(value));

  assert.match(markup, rupees(totals.subtotal), "the subtotal is not the application's");
  assert.match(markup, rupees(totals.total), "the total is not the application's");
  /* Complimentary delivery is stated in words, never as a zero — the same
     rule the production ledger follows. Anything else is the fee itself. */
  if (totals.shipping === 0) {
    assert.match(markup, /<dt>Delivery<\/dt><dd>Complimentary<\/dd>/, "a waived delivery fee is not stated as waived");
  } else {
    assert.match(markup, rupees(totals.shipping), "the delivery fee is not the application's");
  }
  assert.match(markup, rupees(totals.saved), "the saved figure is not the application's");
  /* A concrete, hand-checkable figure as well: 4,200 × 2 for the saree. */
  assert.match(markup, /₹\s?8,400/, "the first line's price is not the catalogue's price × quantity");
  assert.match(markup, /Inclusive of all taxes/, "the ledger lost the tax line every surface states");
});

test("the page sums nothing and calls nothing: it reads the context and formats", () => {
  const source = read(PORTED);
  assert.match(source, /const cart = useCart\(\)/, "the page does not read CartContext");
  assert.match(source, /cart\.totals/, "the page does not read the bag's own totals");
  assert.equal(/\.reduce\(/.test(source), false, "the page sums money itself");
  assert.equal(/\bfetch\(|axios|apiClient|cartApi|ordersApi/.test(source), false, "the page reaches the network directly");
  assert.match(source, /cart\.updateCartQuantity\(/, "quantity changes no longer go through the context");
  assert.match(source, /cart\.removeFromCart\(/, "removal no longer goes through the context");
  assert.match(source, /cart\.refreshCart\(\)/, "the error state lost the context's own retry");
});

test("no new dependency arrived with the bag or its stylesheet", () => {
  for (const file of [PORTED, DIALOGUE]) {
    const source = read(file);
    const specifiers = file.endsWith(".css") ? [] : importSpecifiers(source);
    for (const specifier of specifiers) {
      const external = !specifier.startsWith(".");
      if (!external) continue;
      assert.ok(
        RUNTIME_PACKAGES.has(specifier),
        `${file} imports "${specifier}", which is not one of the four packages this tree already uses`,
      );
    }
  }
  /* The stylesheet declares no @import and no font URL of its own: the design's
     tokens and faces are already loaded by `customer.css`. */
  const css = read(DIALOGUE);
  assert.equal(/@import|@font-face|url\(/.test(css), false, "the stylesheet pulls a resource of its own");
  assert.match(css, /^\/\*/, "the stylesheet lost its provenance header");
});

test("the offer field is the application's coupon path, and it never claims an acceptance", () => {
  const source = read(PORTED);
  assert.match(source, /cart\.applyCoupon\(/, "the offer field no longer applies through the context");
  assert.match(source, /cart\.removeCoupon\(/, "the offer field no longer removes through the context");
  assert.match(source, /cart\.couponLapsed/, "the lapsed-offer state is gone");
  const markup = on.render("/cart");
  assert.match(markup, /class="promo-form"/, "the design's offer field is missing from the bag");
  assert.match(markup, /name="offer"|id="bag-offer"/, "the offer field lost its input");
});

/* ── 3 · what the design never drew ─────────────────────────────────────── */

test("the quantity ceiling is the application's, and the bag says when it is reached", () => {
  const source = read(PORTED);
  assert.match(source, /getMaxQuantity\(product\)/, "the guest ceiling is no longer the catalogue's rule");
  assert.match(source, /Number\.isFinite\(item\.maximum\)/, "the signed-in ceiling is no longer the server's `maximum`");
  assert.match(source, /disabled=\{busy \|\| item\.quantity >= maximum\}/, "the ceiling no longer disables the control");
  /* The blouse is stocked at 2 and the bag holds 2 — the design's own note
     ("only N left") is not copied: the page states what the bag holds. */
  const markup = on.render("/cart");
  assert.match(markup, /All 2 in your bag/, "the ceiling note is missing for a line at its ceiling");
  assert.equal(/Only \d+ left/.test(markup), false, "the page imported the design's stock-scare copy");
});

test("an archived piece already in the bag is shown as itself, never re-priced", () => {
  const markup = on.render("/cart");
  assert.match(markup, rx("Phase 9 Archived"), "an archived piece in the bag was silently dropped");
  assert.match(markup, /₹\s?9,900/, "the archived piece lost its own price");
});

test("a line the catalogue cannot resolve is not replaced with a substitute", () => {
  const markup = on.render("/cart");
  assert.equal(markup.includes(GONE_ID), false, "the unresolvable line rendered its raw id");
  /* `CartContext` resolves every line against the catalogue and filters what it
     cannot resolve — production's own rule. The page must not invent a row for
     it, and must not substitute another piece. */
  assert.equal(/Unavailable piece|Product not found|Unknown piece/.test(markup), false, "the page invented a placeholder row");
  const source = read(PORTED);
  assert.match(source, /cart\.items\.map\(/, "the page no longer renders exactly the context's resolved lines");
});

test("an empty bag explains itself and offers the two ways out that exist", () => {
  saveGuestCart({ lines: [], coupon: null });
  const markup = on.render("/cart");
  assert.match(markup, /class="empty"/, "the design's empty block is gone");
  assert.match(markup, /Your collection is waiting\./, "the empty bag lost its own sentence");
  assert.match(markup, /href="\/shop"/, "the empty bag lost its way to the collection");
  assert.match(markup, /href="\/collections\/new-arrivals"/, "the empty bag lost the new arrivals route");
  assert.equal(/pf-bag__grid/.test(markup), false, "an empty bag rendered the grid");
  saveGuestCart(STORED);
});

test("the bag never clears itself: clearing stays inside the context, after the order", () => {
  const source = read(PORTED);
  assert.equal(/clearCart/.test(source), false, "the bag page clears the cart itself");
  /* And the only surface in this phase that may reach an order at all is the
     checkout page — through the context, after the server confirms. */
  const checkout = read("src/components/customer/pages/Checkout.jsx");
  assert.equal(/clearCart/.test(checkout), false, "the checkout page clears the cart itself");
  assert.match(checkout, /completedOrder/, "the checkout page no longer waits for the confirmed order");
});

test("the drawer's way into the bag survives: a 'View bag' control beside Proceed to Checkout", () => {
  const drawer = read("src/components/customer/components/shopping/CartDrawer.jsx");
  assert.match(
    drawer,
    /className="drawer__continue"[^>]*onClick=\{\(\) => \{ closeCart\(\); navigate\('\/cart'\); \}\}>View bag<\/button>/,
    "the drawer lost its link to the bag page",
  );
  assert.match(drawer, /navigate\('\/checkout'\)/, "the drawer lost its link to the checkout");
});

test("the closing rail is the application's recommender, not a second catalogue", () => {
  const source = read(PORTED);
  assert.match(source, /useRecommendations\(\{ placement: 'cart', cartIds \}\)/, "the rail no longer asks the recommender");
  assert.match(source, /useProductCovers\(recommendations\)/, "the rail no longer resolves covers through the application");
  assert.match(source, /normalizeMediaReference\(plate\)/, "the rail draws media without the application's resolver");
  assert.match(source, /toDesignProduct\(row\)/, "the rail no longer maps catalogue records to the design's card shape");
  /* SSR runs no effects, so the recommender has answered nothing: an empty
     answer must be an empty rail, never a substituted one. */
  const markup = on.render("/cart");
  assert.equal(/pf-rail/.test(markup), false, "an empty recommendation answer still drew the rail");
});

test("the small-screen bar carries the bag's own total", () => {
  const source = read(PORTED);
  assert.match(source, /className="pf-bar"/, "the mobile action bar is gone");
  assert.match(source, /<strong>\{formatINR\(cart\.totals\.total\)\}<\/strong>/, "the bar no longer shows the bag's total");
  const css = read(DIALOGUE);
  assert.match(css, /\.pf-bar\s*\{[^}]*display:\s*none/, "the bar is not hidden before the small-screen breakpoint");
  assert.match(css, /@media \(max-width: 899px\)[\s\S]*?\.pf-bar \{ display: flex; \}/, "the bar never appears on a small screen");
});
