/**
 * PRATIKSHYA FASHION — PHASE 9 · the checkout journey, over this application's order flow.
 *
 * Phase 9 adopts `/checkout` the way it adopts the bag: the page is written in
 * the design's vocabulary (`.container`, `.crumbs`, `.display`, `.form`, the
 * `.btn` register, the design's own `.checkout__lines` list) and bound to the
 * SAME contexts the production checkout reads — `CartContext`,
 * `CheckoutContext`, `AccountContext`, `AuthContext` — with the same
 * validators, the same delivery matrix, the same payment methods, the same
 * Razorpay hand-off, the same idempotency key and the same rule that the bag is
 * cleared only after the server confirms an order. Nothing about money, stock,
 * addresses or order state is decided by this page.
 *
 * TWO LEVELS ARE PINNED, and the difference matters:
 *
 *   · THE ROUTE, exactly as a browser reaches it — `CustomerLayout` under the
 *     switch, at `/checkout?home=aarna`. This is where the guard shows: the
 *     page does not render for a signed-out visitor, because the route is
 *     wrapped in the application's own `ProtectedRoute`, unchanged.
 *   · THE PAGE, rendered directly with this application's real provider stack
 *     and a real guest bag. That is how the first step's markup — the four-step
 *     rail, the ledger, the fields and the small-screen bar — is asserted
 *     without a session, and it is clearly labelled as such below: the route
 *     level pins the guard, this level pins what the page draws once it is
 *     allowed to draw.
 *
 * WHAT THIS CANNOT PROVE, and does not claim: there is no DOM here (no clicks,
 * no focus, no layout), effects do not run under `renderToStaticMarkup` (so the
 * steps reached by pressing a button — delivery, review, payment — are pinned
 * at the source level here and exercised live in the browser probe), and no
 * payment is performed: the Razorpay window needs the live gateway, which this
 * sandbox does not have. Nothing here is an end-to-end money-path verification.
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

const PORTED = "src/components/aarna/pages/Checkout.jsx";
const BAG = "src/components/aarna/pages/Cart.jsx";
const FRAME = "src/components/aarna/components/layout/JourneyFrame.jsx";
const STOREFRONT = "src/components/aarna/AarnaStorefront.jsx";
const DIALOGUE = "src/components/aarna/aarna.checkout.css";

/* ── the catalogue and the bag, in the application's own shapes ───────────── */

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
];

const LINES = [
  { id: "line-1", productId: "phase9-banarasi", color: "Ink", size: "Free Size", quantity: 2, addedAt: 1 },
];
const CART_KEY = "pratikshya_cart";
const STORED = { lines: LINES, coupon: null };

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

const saveGuestCart = (stored) => storage.set(CART_KEY, JSON.stringify(stored));

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
    { default: Checkout },
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
    load("/src/components/aarna/pages/Checkout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/services/catalog/catalogStore.js"),
    load("/src/utils/shopping.js"),
    load("/src/config/storefrontHome.js"),
  ]);

  const providers = [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider];
  const withProviders = (element) => {
    let tree = element;
    for (const Provider of providers) tree = React.createElement(Provider, null, tree);
    return tree;
  };
  /* One render, one tree: a markup string handed back into a render would be
     escaped text, so the tree is composed and rendered exactly once. */
  const render = (tree) =>
    renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/checkout"] },
        React.createElement(Suspense, { fallback: null }, tree),
      ),
    );

  return {
    vite,
    store,
    shopping,
    boundary,
    /** The route, as a browser reaches it: the switch, the layout, the guard. */
    renderRoute: (path) =>
      renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: [path] },
          React.createElement(Suspense, { fallback: null }, withProviders(React.createElement(CustomerLayout))),
        ),
      ),
    /** The page itself, with the real contexts, at the same provider stack. */
    renderPage: () => render(withProviders(React.createElement(Checkout))),
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
  saveGuestCart(STORED);
});

after(async () => {
  await Promise.all([on?.vite.close(), off?.vite.close()]);
  delete globalThis.window;
});

const rx = (text) => new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const RUNTIME_PACKAGES = new Set(["react", "react-dom", "react-router-dom", "lucide-react"]);
const importSpecifiers = (source) =>
  [...source.matchAll(/^\s*import\s+(?:[^'"]*?from\s+)?["']([^"']+)["']/gm)].map((match) => match[1]);

/* ── 1 · the switch, the guard, and the quiet chrome ────────────────────── */

test("/checkout always uses Aarna's guarded journey UI", () => {
  const markup = off.renderRoute("/checkout");
  assert.ok(markup.length > 0, "/checkout rendered nothing at all");
  assert.match(markup, /class="aan-root"/);
  assert.match(markup, /pf-journey/);
});

test("with the switch on, the design's quiet journey chrome wraps the route — and the page stays guarded", () => {
  const markup = on.renderRoute("/checkout?home=aarna");
  assert.match(markup, /class="aan-root"/, "the port did not mount at /checkout");
  assert.match(markup, /<main class="pf-journey">/, "the checkout did not render inside the journey frame");
  assert.match(markup, /Secure Checkout/, "the journey frame lost its own note");
  /* The chrome is the REDUCED one — no announcement rail, no mega menu, no
     search overlay, no drawer: the design-language equivalent of the
     production `CheckoutHeader`. The assertion is that the parts of the
     shopping shell that would distract from a payment do not leak into the
     order journey. The FOOTER stays, because production's own layout keeps
     `SiteFooter` on the money path too (`layouts/CustomerLayout.jsx`:117 → 147)
     — that parity is deliberate, not an oversight. */
  assert.equal(
    /class="announce"|class="drawer"|class="nav__link"|class="mobile-menu"|class="search-overlay"/.test(markup),
    false,
    "the full shopping chrome leaked into the checkout",
  );
  assert.match(markup, /<footer class="footer">/, "the checkout lost the shell's footer, which production keeps");
  /* Signed out, the page itself never renders: `ProtectedRoute` held, exactly
     as it does for the production route. */
  assert.equal(/pf-progress|pf-step|Your <em>details/.test(markup), false, "the checkout page rendered for a signed-out visitor");
  assert.equal(/placeholder="e\.g\. Ananya"/.test(markup), false, "the checkout form rendered for a signed-out visitor");
});

test("the guard is the application's own ProtectedRoute, not a copy", () => {
  const source = read(STOREFRONT);
  assert.match(source, /import ProtectedRoute from "\.\.\/auth\/ProtectedRoute\.jsx";/, "the port no longer imports the production guard");
  assert.match(
    source,
    /path="checkout"\s*\n\s*element=\{<ProtectedRoute><Checkout \/><\/ProtectedRoute>\}/,
    "the checkout route is no longer wrapped in the production guard",
  );
  assert.match(
    source,
    /path="order-success"\s*\n\s*element=\{<ProtectedRoute><OrderSuccess \/><\/ProtectedRoute>\}/,
    "the confirmation route is no longer wrapped in the production guard",
  );
  assert.equal(
    /function ProtectedRoute|const ProtectedRoute\s*=\s*\(/.test(source),
    false,
    "the port defined a guard of its own",
  );
  /* …and the guard is the one that carries `returnTo`, so a guest keeps the
     page they asked for. */
  assert.match(read("src/components/auth/ProtectedRoute.jsx"), /returnTo=\$\{encodeURIComponent\(intended\)\}/);
});

test("the journey frame is the reduced chrome: the mark, the way back to the bag, and nothing else", () => {
  const source = read(FRAME);
  assert.match(source, /logo"|Logo/, "the frame lost the brand mark");
  assert.match(source, /Secure Checkout/, "the frame lost its note");
  assert.match(source, /useCart\(\)/, "the frame no longer reads the bag for its count");
  assert.match(source, /to="\/cart"/, "the frame lost the way back to the bag");
  assert.match(source, /<Outlet \/>/, "the frame no longer renders the route it wraps");
  assert.match(source, /<Footer \/>/, "the frame lost the design's footer");
  for (const banned of ["AnnouncementBar", "MegaMenu", "CartDrawer", "SearchOverlay", "MobileMenu"]) {
    assert.equal(new RegExp(banned).test(source), false, `the journey frame pulled in ${banned}`);
  }
});

test("the money path is one journey: three routes, one set, nothing else adopted", () => {
  const { boundary } = on;
  assert.deepEqual(
    [...boundary.AARNA_JOURNEY_PATHS].sort(),
    ["/cart", "/checkout", "/order-success"],
    "the journey set is not the three routes this phase adopted",
  );
  assert.equal(boundary.isAarnaJourneyPath("/checkout"), true);
  assert.equal(boundary.isAarnaJourneyPath("/checkout/payment"), false, "a child path was claimed by the journey");
  assert.equal(boundary.isAarnaCatchAllPath("/checkout"), false, "the catch-all claimed the checkout");
});

/* ── 2 · the page, over the application's own flow ──────────────────────── */

test("the page's first step draws the application's four steps, and only the first is reachable", () => {
  const markup = on.renderPage();
  assert.match(markup, /class="pf-progress"/, "the step rail is gone");
  for (const label of ["Customer", "Delivery", "Review", "Payment"]) {
    assert.match(markup, rx(`>${label}</span>`), `the step "${label}" is missing`);
  }
  assert.match(markup, /aria-current="step"/, "the current step is not marked");
  /* Entry is the first step: the rest are unreachable until the steps before
     them validate. */
  assert.match(markup, /aria-current="step"[\s\S]{0,200}Customer/, "the rail does not start at the customer step");
  const progress = markup.slice(markup.indexOf('class="pf-progress"'), markup.indexOf('class="pf-journey__grid"'));
  assert.equal((progress.match(/disabled=""/g) ?? []).length, 3, "the rail lets a customer skip ahead");
  assert.match(read(PORTED), /CHECKOUT_STEPS\.map/, "the rail no longer comes from the application's step list");
});

test("the ledger beside the steps is the bag's own, through the bag page's own components", () => {
  const markup = on.renderPage();
  const r = (value) => rx(on.shopping.formatINR(value));
  const totals = on.shopping.calculateCartTotals(LINES.map((line) => ({ ...line, product: RECORDS[0] })));

  assert.match(markup, /aria-label="Order summary"/, "the journey summary is gone");
  assert.match(markup, r(totals.subtotal), "the summary's subtotal is not the bag's");
  assert.match(markup, r(totals.total), "the summary's total is not the bag's");
  assert.match(markup, r(8400), "a line's own figure is not the catalogue's price × the bag's quantity");
  assert.equal(/₹0</.test(markup), false, "a line rendered a zero figure");

  const source = read(PORTED);
  assert.match(
    source,
    /import \{ BagTotals, OfferField, lineTotalFor \} from '\.\/Cart\.jsx';/,
    "the journey no longer shares the bag's ledger, offer field and line figure",
  );
  /* One definition of a line's figure in the whole port — the same rule the
     production cart line applies (`CartLineItem.jsx`). */
  assert.match(read(BAG), /export const lineTotalFor = /, "the bag no longer exports the line figure");
  assert.equal(
    (read(BAG).match(/Number\.isFinite\(item\??\.lineTotal\)/g) ?? []).length,
    1,
    "the line figure is defined more than once",
  );
});

test("the first step validates with the application's validators, not its own rules", () => {
  const source = read(PORTED);
  for (const helper of ["validateCustomer", "validateAddress", "formatPhone"]) {
    assert.match(source, new RegExp(`import[\\s\\S]{0,240}${helper}`), `${helper} is no longer imported from the application`);
  }
  assert.match(source, /validateCustomer\(checkout\.customer\)/, "the customer step no longer validates with the application's rule");
  assert.match(source, /validateAddress\(checkout\.address\)\.ok/, "the address step no longer validates with the application's rule");
  /* No hand-rolled email or phone rule. */
  assert.equal(/@\w+\\?\.\\?\w+.*test\(|\^\\\+?91/.test(source), false, "the page re-implemented a validation rule");
  const markup = on.renderPage();
  assert.match(markup, /class="form pf-form"/, "the fields left the design's form register");
  assert.match(markup, /aria-invalid="false"/, "the fields lost their error channel");
});

test("delivery and payment come from the application's matrix, never from this page", () => {
  const source = read(PORTED);
  assert.match(source, /DELIVERY_METHODS\.map\(/, "the delivery options no longer come from the matrix");
  assert.match(source, /calculateDeliveryFee\(method\.id, payable\)/, "delivery fees are no longer the application's calculation");
  assert.match(source, /readShippingRules\(\)/, "the free-delivery threshold is no longer read from the rules");
  assert.match(source, /getDeliveryEstimate\(method\.id\)/, "the delivery estimate is no longer the application's");
  assert.match(source, /PAYMENT_METHODS\.map\(/, "the payment options no longer come from the matrix");
  assert.match(source, /checkout\.startPayment\(\)/, "paying no longer goes through the context");
  assert.match(source, /checkout\.selectAccountAddress\(/, "address selection no longer goes through the context");
  assert.match(source, /checkout\.setDeliveryMethod|checkout\.setPaymentMethod/, "method selection no longer goes through the context");
  /* The page collects no instrument: the gateway's window does that. */
  assert.equal(/cvv|cardNumber|card-number|upiId|ifsc/i.test(source), false, "the page collects an instrument itself");
  const markup = on.renderPage();
  assert.equal(/type="password"/.test(markup), false, "an instrument field rendered on the checkout");
});

test("addresses stay the account's own: the production modal, the account's API, the ownership rule", () => {
  const source = read(PORTED);
  assert.match(source, /import AddressModal from '\.\.\/\.\.\/\.\.\/components\/account\/AddressModal\.jsx';/, "the address form is no longer the production modal");
  assert.match(source, /account\.addAddress\(/, "a new address no longer goes through the account context");
  assert.match(source, /account\.addresses/, "the saved addresses no longer come from the account context");
  assert.match(source, /result\.ok/, "the modal's own answer is no longer honoured");
  assert.equal(/fetch\(|axios|apiClient|ordersApi|paymentsApi|checkoutApi/.test(source), false, "the page reaches an API directly");
});

test("the payment step keeps every state the production step has, and invents none", () => {
  const source = read(PORTED);
  for (const status of ["PENDING", "FAILURE", "CANCELLED"]) {
    assert.match(source, new RegExp(`PAYMENT_STATUS\\.${status}`), `the ${status} state is gone`);
  }
  assert.match(source, /checkout\.retryPayment/, "the failure state lost the application's retry");
  assert.match(source, /checkout\.resetPayment/, "the cancelled state lost its way to change method");
  assert.equal((source.match(/>Return to Bag<\/Button>/g) ?? []).length, 2, "the states lost the way back to the bag");
  assert.match(source, /checkout\.paymentStatus/, "the panel no longer reads the gateway's status");
  /* A method must be chosen before anything happens, and paying is the
     context's, not the page's. */
  assert.match(source, /Please choose a payment method first\./, "the method guard is gone");
  assert.match(source, /checkout\.completedOrder/, "the page no longer waits for the confirmed order");
  assert.match(
    source,
    /if \(checkout\.completedOrder\) navigate\('\/order-success', \{ replace: true \}\);/,
    "the confirmation route is no longer reached through the confirmed order",
  );
});

test("the bag is cleared only after the server confirms: never here, never before", () => {
  for (const file of [PORTED, BAG, "src/components/aarna/pages/OrderSuccess.jsx"]) {
    assert.equal(/clearCart/.test(read(file)), false, `${file} clears the bag itself`);
  }
  const context = read("src/context/CheckoutContext.jsx");
  assert.match(context, /clearCart\(\)/, "the context no longer owns clearing the bag");
  const cleared = context.slice(Math.max(0, context.indexOf("clearCart()") - 1200), context.indexOf("clearCart()"));
  assert.match(cleared, /completedOrder|status.*SUCCESS|CONFIRMED|placed/i, "clearing no longer sits behind the server's confirmation");
});

test("the bag-changed guard survives: a bag edited mid-journey returns to the review", () => {
  const source = read(PORTED);
  assert.match(source, /checkout\.bagChanged/, "the bag-changed guard is gone");
  assert.match(source, /checkout\.goToStep\(2\)/, "the guard no longer returns to the review step");
  assert.match(source, /Your bag changed/, "the notice lost its explanation");
});

test("no new dependency, and a stylesheet that only draws what the design never drew", () => {
  for (const file of [PORTED, BAG, FRAME, "src/components/aarna/pages/OrderSuccess.jsx"]) {
    for (const specifier of importSpecifiers(read(file))) {
      if (specifier.startsWith(".")) continue;
      assert.ok(RUNTIME_PACKAGES.has(specifier), `${file} imports "${specifier}", which is not already in this tree`);
    }
  }
  const css = read(DIALOGUE);
  assert.equal(/@import|@font-face|url\(/.test(css), false, "the stylesheet pulls a resource of its own");
  /* Every rule is scoped to the port's root, so the host application can never
     be reached by this file. */
  const unscoped = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((block) => block.split("{")[0].trim())
    .filter((selector) => selector && !selector.startsWith("@") && !selector.startsWith(".aan-root"));
  assert.deepEqual(unscoped, [], `the stylesheet has rules outside .aan-root: ${unscoped.join(" | ")}`);
});

test("the small screens get the same journey: a summary that folds, and a bar that carries the total", () => {
  const source = read(PORTED);
  assert.match(source, /className="pf-summary__toggle"/, "the folding summary control is gone");
  assert.match(source, /aria-expanded=/, "the folding summary lost its state channel");
  assert.match(source, /className="pf-bar"/, "the small-screen bar is gone");
  assert.match(source, /formatINR\(totals\.total\)/, "the bar no longer shows the bag's total");
  const css = read(DIALOGUE);
  assert.match(css, /\.pf-summary__toggle\s*\{[^}]*display:\s*none/, "the folding control is not hidden on wide screens");
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*?\.pf-summary__body\[data-open='true'\] \{ display: block; \}/, "the summary never unfolds");
});
