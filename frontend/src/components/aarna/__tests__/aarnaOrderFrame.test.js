/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — the order screens' shared frame.
 *
 * `/account/orders` and its three single-order URLs are the port's own pages
 * since this stage: the history, one order, its tracking and its return request,
 * rendered inside `pages/account/OrderFrame.jsx` — the port's equivalent of
 * production's `components/orders/OrderPageShell.jsx`, whose one decision is the
 * one that keeps the guest-order surface open. This suite renders that frame and
 * every block the four screens share (the status chip, the fact band, the
 * recorded journey, the pieces, the totals, a return record, and the three
 * states a read can be in) out of REAL order records normalised by the
 * application's own read model, and pins the wiring that routes them.
 *
 *   1. THE WIRING. The four routes render the port's own pages; the history stays
 *      inside the guard the family shares and the three single-order URLs stay
 *      outside it, exactly as `App.jsx` declares them; every page is imported by
 *      the mount under the port's own name and declared in the port's registry.
 *   2. THE FRAME. A guest gets the order, the two ways to keep it, and no
 *      account chrome — and gets it without a fabricated customer.
 *   3. THE REGISTER. Every block the four screens share draws only what the
 *      record it was handed holds: no estimated date, no invented carrier, no
 *      refund before one exists.
 *   4. THE SHEET. `aarna.orders.css` is scoped to the port, token-only, free of
 *      dead selectors, and every class it styles is drawn by one of the five
 *      files this stage wrote.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM here, so no click, keypress, focus
 * order or layout is exercised. `renderToStaticMarkup` runs no effect, and
 * `AuthContext` only publishes `isAuthenticated` once its restore effect has
 * answered, so EVERY render below is the unsigned branch — the account-chrome
 * branch of the frame is pinned at the source level (it renders the shared
 * `AccountFrame` the Stage 2.2/2.3 suites already cover). No backend is claimed:
 * the records are fixtures in the shape the API and the session mirror carry,
 * normalised by `utils/orders.js`.
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

const DIR = "src/components/aarna/pages/account";
const FRAME = `${DIR}/OrderFrame.jsx`;
const LIST = `${DIR}/Orders.jsx`;
const DETAIL = `${DIR}/OrderDetail.jsx`;
const TRACKING = `${DIR}/OrderTracking.jsx`;
const RETURN = `${DIR}/OrderReturn.jsx`;
const ORDER_FILES = [FRAME, LIST, DETAIL, TRACKING, RETURN];
const MOUNT = "src/components/aarna/AarnaStorefront.jsx";
const PRODUCTION_APP = "src/App.jsx";
const SHEET = "src/components/aarna/aarna.orders.css";
const REGISTRY = "scripts/aarna-port.js";

/* The three single-order URLs, and the history they hang off. */
const SINGLE_ORDER_URLS = [
  "account/orders/:orderId",
  "account/orders/:orderId/track",
  "account/orders/:orderId/return",
];

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

/* ── the records, in the shape the API and the session mirror carry ─────────── */

const orderRecord = (overrides = {}) => ({
  id: "PF-24-0001",
  orderNumber: "PF-24-0001",
  createdAt: "2026-09-30T09:00:00.000Z",
  status: "SHIPPED",
  paymentStatus: "PAID",
  currency: "INR",
  items: [
    {
      lineId: "line-1",
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
  pricing: {
    subtotal: 8400,
    productDiscount: 900,
    couponDiscount: 400,
    couponCode: "CIRCLE10",
    shipping: 0,
    codFee: 0,
    saved: 1300,
    total: 7100,
  },
  returns: [],
  customerId: null,
  ...overrides,
});

/* ── the mount: the modules under test, inside this application's providers ─── */

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
    frame,
    list,
    detail,
    tracking,
    returned,
    orders,
    orderConfig,
    orderReadModel,
    shopping,
    orderErrorState,
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    { UIProvider },
    { ShopProvider },
    routes,
  ] = await Promise.all([
    load("/src/components/aarna/pages/account/OrderFrame.jsx"),
    load("/src/components/aarna/pages/account/Orders.jsx"),
    load("/src/components/aarna/pages/account/OrderDetail.jsx"),
    load("/src/components/aarna/pages/account/OrderTracking.jsx"),
    load("/src/components/aarna/pages/account/OrderReturn.jsx"),
    load("/src/utils/orders.js"),
    load("/src/config/orderConfig.js"),
    load("/src/utils/orderReadModel.js"),
    load("/src/utils/shopping.js"),
    load("/src/components/orders/OrderErrorState.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/components/aarna/state/UIContext.jsx"),
    load("/src/components/aarna/state/ShopContext.jsx"),
    load("/src/components/aarna/router/routes.js"),
  ]);

  /* The tree `AarnaStorefront` mounts: its own UI/shop providers inside the
     customer band, so `useAuth()` resolves to the real provider and every
     context the order screens read is the real one. */
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
    routes,
    orders,
    orderConfig,
    orderReadModel,
    shopping,
    errorCopy: orderErrorState.orderErrorCopy,
    frame,
    list,
    detail,
    tracking,
    returned,
    /* One component, at one URL, inside the application's routers and contexts. */
    render: (element, path = "/account/orders") =>
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

/* React escapes the ASCII punctuation it emits, so copy is compared as text. */
const text = (markup) =>
  markup
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const source = (file) => read(file);
const code = (file) => source(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const order = (overrides) => app.orders.normaliseOrder(orderRecord(overrides));

/* Every class a file draws, comments removed. */
const drawnIn = (file) =>
  new Set(
    [...code(file).matchAll(/className=(?:"([^"]*)"|\{"([^"]*)"\}|\{`([^`]*)`\})/g)].flatMap((match) =>
      (match[1] ?? match[2] ?? match[3] ?? "").split(/\s+/).filter((name) => /^[a-z][a-z0-9_-]*$/.test(name)),
    ),
  );

/* ── 1 · the wiring ────────────────────────────────────────────────────────── */

test("the four order screens are the port's own pages, imported where the port mounts them", () => {
  const mount = source(MOUNT);
  const pairs = [
    ["AccountOrdersPage", "Orders.jsx", "account/orders"],
    ["AccountOrderDetailPage", "OrderDetail.jsx", "account/orders/:orderId"],
    ["AccountOrderTrackingPage", "OrderTracking.jsx", "account/orders/:orderId/track"],
    ["AccountOrderReturnPage", "OrderReturn.jsx", "account/orders/:orderId/return"],
  ];

  for (const [component, file, path] of pairs) {
    assert.match(
      mount,
      new RegExp(`import ${component} from "\\./pages/account/${file.replace(".", "\\.")}";`),
      `${path} is not imported by the mount under the port's own name`,
    );
    assert.match(
      mount,
      new RegExp(`<Route path="${path}" element=\\{<${component} />\\} />`),
      `${path} no longer renders the port's own page`,
    );
    /* A migrated route must never be a `lazy` import: a lazy page suspends into
       an empty fallback, which is what made this family look production-served
       before the stage. */
    assert.equal(
      new RegExp(`const ${component}\\s*=\\s*lazy\\(`).test(mount),
      false,
      `${path} is still declared as a lazy page`,
    );
  }
});

test("Aarna owns the single-order routes outside its account guard", () => {
  const mount = source(MOUNT);
  const storefront = source("src/components/aarna/AarnaStorefront.jsx");
  const app = source(PRODUCTION_APP);
  const guardOpen = mount.indexOf("<Route element={<ProtectedRoute />}");
  const guardClose = mount.indexOf("</Route>", mount.indexOf('<Route path="account/instagram-rewards"'));
  for (const path of SINGLE_ORDER_URLS) {
    const relative = path.replace(/^\//, "");
    const at = mount.indexOf(`<Route path="${relative}" element=`);
    assert.ok(at !== -1, `${relative} is not declared by Aarna`);
    assert.ok(at > guardClose || at < guardOpen, `${relative} was put behind the account guard`);
  }
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/);
  assert.doesNotMatch(app, /<Route path="\/account\/orders/);
  assert.match(storefront, /<Route path="account\/orders\/:orderId"/);
});

test("the stage's files are declared in the port's registry, the sheet included", () => {
  const registry = source(REGISTRY);
  const added = registry.slice(registry.indexOf("const ADDED = ["), registry.indexOf("];", registry.indexOf("const ADDED = [")));

  for (const entry of [
    "aarna.orders.css",
    ...ORDER_FILES.map((file) => `pages/account/${file.split("/").pop()}`),
  ]) {
    assert.ok(added.includes(`"${entry}"`), `${entry} is not declared in the port's registry`);
  }
  assert.match(source(MOUNT), /import "\.\/aarna\.orders\.css";/, "the order sheet is not carried by the mount");
});

/* ── 2 · the frame ─────────────────────────────────────────────────────────── */

test("a guest gets the order surface, the two ways to keep it, and no account chrome", () => {
  const markup = app.render(
    React.createElement(app.frame.default, { label: "Order PF-24-0001", title: "One order." }, React.createElement("p", null, "body")),
  );

  assert.match(markup, /class="info container"/, "the guest frame no longer draws the design's page frame");
  assert.match(markup, /<nav class="crumbs" aria-label="Breadcrumb">/, "the guest frame lost its breadcrumb");
  assert.match(markup, /home/i, "the breadcrumb no longer starts at the storefront");
  assert.equal(/pf-account__nav/.test(markup), false, "the guest frame drew account navigation for someone with no account");
  assert.equal(/pf-account__intro/.test(markup), true, "the guest frame lost its intro band");

  /* Both destinations production offers, with the return path a guest's order
     lives at — and never the `/auth/sign-in` path this application does not
     register. */
  assert.ok(hrefs(markup).includes("/signup?returnTo=%2Faccount%2Forders"), "the guest frame lost Create Account");
  assert.ok(hrefs(markup).includes("/signin?returnTo=%2Faccount%2Forders"), "the guest frame lost Sign In");
  assert.equal(hrefs(markup).some((href) => /\/auth\//.test(href ?? "")), false, "the guest frame links at an unregistered auth path");
  assert.match(markup, /Guest order/, "the guest strip no longer says what it is showing");
  assert.match(markup, /class="pf-account__body"/, "the guest frame lost the body slot the screens render into");
});

test("the signed-in branch renders the shared account frame — pinned at the source, not rendered here", () => {
  const frame = code(FRAME);

  assert.match(frame, /const \{ isAuthenticated \} = useAuth\(\);/);
  assert.match(
    frame,
    /if \(isAuthenticated\) \{\n\s+return \(\n\s+<AccountFrame breadcrumbItems=\{breadcrumbItems\} label=\{label\} title=\{title\}>/,
    "the frame no longer hands a signed-in customer the shared account frame",
  );
  assert.match(frame, /import AccountFrame from '\.\/AccountFrame\.jsx';/, "the shared frame is no longer reused");
  /* One frame, two branches — and no third state that could invent a customer. */
  const body = frame.slice(frame.indexOf("export default function OrderFrame"), frame.indexOf("export function OrderChip"));
  assert.ok(body.length > 200, "the frame function could not be read");
  assert.equal(count(body, "return ("), 2, "the frame grew a third return");
  assert.equal(/localStorage|sessionStorage|\.email|\.firstName/.test(body), false, "the frame reads a customer of its own");
});

/* ── 3 · the register ──────────────────────────────────────────────────────── */

test("a status is the application's own definition, spoken with its kind", () => {
  const { OrderChip } = app.frame;
  const cases = [
    ["order", "SHIPPED", app.orderConfig.getOrderStatus("SHIPPED")],
    ["payment", "PAID", app.orderConfig.getPaymentStatus("PAID")],
    ["return", "REQUESTED", app.orderConfig.getReturnStatus("REQUESTED")],
  ];
  const kinds = { order: "Order status", payment: "Payment status", return: "Return status" };

  for (const [kind, status, definition] of cases) {
    const markup = app.render(React.createElement(OrderChip, { kind, status }));
    assert.ok(markup.includes(definition.label), `${kind} no longer shows the config's own label`);
    assert.ok(markup.includes(`data-tone="${definition.tone}"`), `${kind} no longer carries the config's own tone`);
    assert.ok(markup.includes(kinds[kind]), `${kind} no longer announces what kind of status it is`);
  }
});

test("the fact band, the journey and the pieces draw exactly what the record holds", () => {
  const { OrderMeta, OrderSteps, OrderLines } = app.frame;
  const record = order({});

  const meta = app.render(
    React.createElement(OrderMeta, {
      items: [{ label: "Order Date", value: app.orders.formatOrderDate(record.createdAt) }, { label: "Pieces", value: "2 pieces", note: "Standard Delivery" }],
    }),
  );
  assert.match(meta, /<dl class="pf-meta">/);
  assert.ok(meta.includes("<dt>Order Date</dt>"), "the fact band lost its labels");
  assert.ok(meta.includes("<dt>Pieces</dt>"));
  assert.ok(meta.includes("2 pieces"), "the fact band lost its values");
  assert.ok(meta.includes(`class="pf-meta__quiet">Standard Delivery`), "the fact band lost a note");

  const steps = [
    { id: "one", status: "SHIPPED", title: "Shipped", description: "Left the atelier", timestamp: "2026-10-01T06:30:00.000Z", state: "done" },
    { id: "two", status: "OUT_FOR_DELIVERY", title: "Out for delivery", state: "current" },
    { id: "three", status: "DELIVERED", title: "Delivered", state: "upcoming" },
  ];
  const journey = app.render(React.createElement(OrderSteps, { steps, ariaLabel: "Order journey" }));

  assert.equal(count(journey, "pf-account__step "), 3, "the journey lost a step");
  assert.ok(journey.includes('class="pf-account__step is-done"'), "a recorded step lost its state");
  assert.ok(journey.includes('aria-current="step"'), "the current step is no longer marked");
  assert.ok(journey.includes("pf-account__step is-upcoming"), "an unrecorded step lost its state");
  assert.ok(journey.includes(app.orders.formatEventTime("2026-10-01T06:30:00.000Z")), "a recorded transition lost its time");
  /* Exactly one step carries a time: nothing is estimated for the steps that were
     never recorded. */
  assert.equal(count(journey, "pf-account__step-time"), 1, "a step without a recorded transition was given a date");
  assert.match(journey, /<ol class="pf-account__steps" aria-label="Order journey">/);

  const lines = app.render(React.createElement(OrderLines, { items: record.items }));
  assert.ok(lines.includes('<ul class="checkout__lines">'), "the pieces left the design's line register");
  assert.ok(lines.includes("Phase 11 Banarasi"), "a piece lost its name");
  assert.ok(lines.includes("Ink · Free Size"), "a piece lost its variant line");
  assert.ok(lines.includes(app.shopping.formatINR(record.items[0].lineTotal)), "a piece lost its line total");
  assert.ok(lines.includes("Qty 2"), "a piece lost its quantity");

  const imageless = app.render(
    React.createElement(OrderLines, {
      items: [{ ...record.items[0], image: "", color: "", size: "", originalPrice: 5200, price: 4200 }],
    }),
  );
  assert.equal(/<img/.test(imageless), false, "an imageless piece still renders an image");
  assert.ok(imageless.includes("Free Size"), "an imageless piece lost the honest size line");
  assert.ok(imageless.includes("saved on this piece"), "the saving on a discounted piece is no longer stated");
});

test("the totals are the order's own recorded pricing", () => {
  const { OrderTotals } = app.frame;
  const record = order({});
  const markup = app.render(React.createElement(OrderTotals, { pricing: record.pricing }));

  assert.ok(markup.includes(app.shopping.formatINR(record.pricing.subtotal)), "the subtotal is missing");
  assert.ok(markup.includes(app.shopping.formatINR(record.pricing.productDiscount)), "the product discount is missing");
  assert.ok(markup.includes(record.pricing.couponCode), "the offer code is missing");
  assert.ok(markup.includes("Complimentary"), "a free delivery line no longer says so");
  assert.ok(markup.includes(app.shopping.formatINR(record.pricing.total)), "the total is missing");
  assert.ok(markup.includes("Total Paid"), "the total lost production's own label");
  assert.ok(markup.includes(app.shopping.formatINR(record.pricing.saved)), "the saving is no longer stated");

  /* An order with no discount and no COD fee states neither: no row is invented. */
  const plain = app.render(
    React.createElement(OrderTotals, {
      pricing: { subtotal: 1000, productDiscount: 0, couponDiscount: 0, shipping: 120, codFee: 0, saved: 0, total: 1120 },
    }),
  );
  assert.equal(/Product discount/.test(plain), false, "a discount row was invented");
  assert.equal(/Cash on delivery fee/.test(plain), false, "a COD fee row was invented");
  assert.equal(/You saved/.test(plain), false, "a saving was invented");
  assert.ok(plain.includes(app.shopping.formatINR(120)), "a charged delivery is no longer stated");
});

test("a return record draws its own figures — and claims no refund before one exists", () => {
  const { ReturnCard } = app.frame;
  const record = order({ status: "DELIVERED", returns: [] });
  const returnRecord = app.orderReadModel.normaliseReturnRecord({
    id: "RET-24-0001",
    returnNumber: "RET-24-0001",
    orderId: record.id,
    status: "APPROVED",
    reason: "size",
    pickupMethod: "PICKUP",
    note: "Too small at the shoulder",
    createdAt: "2026-10-05T09:00:00.000Z",
    items: [{ id: "ret-line-1", orderItemId: "line-1", name: "Phase 11 Banarasi", quantity: 1 }],
  });

  const markup = app.render(React.createElement(ReturnCard, { record: returnRecord, order: record }));
  assert.ok(markup.includes("RET-24-0001"), "the return's own reference is missing");
  assert.ok(markup.includes(app.orderConfig.getReturnStatus("APPROVED").label), "the return's own status is missing");
  const reason = returnRecord.items?.[0]?.reason ?? returnRecord.reason ?? null;
  assert.ok(
    markup.includes(returnRecord.reasonLabel ?? app.orderConfig.getReturnReason(reason)?.label ?? reason),
    "the recorded reason is missing",
  );
  assert.ok(markup.includes("Too small at the shoulder"), "the customer's own note is missing");
  assert.ok(markup.includes("Return Progress"), "the return's own timeline is missing");
  assert.ok(markup.includes(app.orders.formatOrderDate(returnRecord.createdAt)), "the request date is missing");
  /* No refund figure was recorded, so none is stated — the resolution is. */
  assert.equal(
    markup.includes(app.shopping.formatINR(4200)),
    false,
    "a refund was stated for a return whose record holds none",
  );
  assert.ok(markup.includes(app.orderConfig.RETURN_RESOLUTION.label), "the resolution is no longer explained");

  /* A recorded refund IS stated, with the method the atelier recorded. */
  const settled = app.render(
    React.createElement(ReturnCard, {
      record: { ...returnRecord, refundAmount: 4200, refundStatus: "COMPLETED", refundMethod: "bank_transfer" },
      order: record,
    }),
  );
  assert.ok(settled.includes(app.shopping.formatINR(4200)), "a recorded refund is no longer stated");
  assert.equal(/completed/i.test(settled), true, "the recorded refund state is no longer stated");
});

test("the three states a read can be in carry production's own words for their status", () => {
  const { OrderProblem, OrderMissing, OrderLoading } = app.frame;

  for (const status of [0, 401, 403, 404, 409, 422, 429, 500]) {
    const markup = app.render(React.createElement(OrderProblem, { status, onRetry: NOOP }));
    /* The guest strip carries the same two destinations, so the problem's own
       recovery lines are read from its own block. */
    const block = markup.slice(markup.indexOf('role="alert"'));
    /* The copy the port renders is production's: the title and the description
       come from the shared table, never re-written here. */
    const copy = app.errorCopy(status);
    assert.ok(text(markup).includes(copy.title), `status ${status} no longer shows production's own title`);
    assert.ok(text(markup).includes(copy.description), `status ${status} no longer shows production's own description`);
    assert.equal(count(markup, 'role="alert"'), 1, `status ${status} is not announced as a problem`);
    /* A retry is offered exactly where production considers the read retryable. */
    const retryable = status === 0 || status === 409 || status === 422 || status >= 500;
    assert.equal(/Try again/.test(block), retryable, `status ${status} offers the wrong recovery`);
    /* The way back in belongs to an EXPIRED SESSION only. 401 is that; 403 is
       an authorization denial, which production's own table makes
       indistinguishable from "not your order" and never dresses as a lapsed
       session. */
    assert.equal(
      hrefs(block).includes("/signin?returnTo=%2Faccount%2Forders"),
      status === 401,
      `status ${status} offers the wrong way back in`,
    );
    assert.ok(hrefs(block).includes("/account/orders"), `status ${status} lost the way back to the history`);
  }

  /* The list screen sends a customer onward to the shop; the single-order screens
     keep production's own way back to the list. */
  const shop = app.render(React.createElement(OrderProblem, { status: 500, secondary: { to: "/shop", label: "Continue Shopping" } }));
  const shopBlock = shop.slice(shop.indexOf('role="alert"'));
  assert.ok(hrefs(shopBlock).includes("/shop"), "the list screen's own recovery destination is gone");
  assert.equal(hrefs(shopBlock).includes("/account/orders"), false, "the list screen kept the single-order recovery");

  const missing = app.render(React.createElement(OrderMissing, {}));
  assert.ok(hrefs(missing).includes("/account/orders"), "the not-found state lost the way back");
  assert.ok(hrefs(missing).includes("/shop"), "the not-found state lost the way to the shop");
  assert.match(missing, /role="status"/, "the not-found state is no longer announced");

  const loading = app.render(React.createElement(OrderLoading, { label: "Loading your order" }));
  assert.ok(loading.includes('aria-busy="true"'), "the loading state is not marked busy");
  assert.ok(loading.includes("Loading your order"), "the loading state lost its label");
});

/* ── 4 · the sheet ─────────────────────────────────────────────────────────── */

test("the orders sheet is scoped to the port, token-only, and free of dead selectors", () => {
  const sheet = source(SHEET);
  const stripped = sheet.replace(/\/\*[\s\S]*?\*\//g, "");

  assert.equal(/!important/.test(stripped), false, "the order sheet forces declarations");
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(stripped), false, "the order sheet hard-codes a colour");

  const selectors = [];
  let cursor = 0;
  for (const brace of stripped.matchAll(/\{/g)) {
    const before = stripped.slice(cursor, brace.index);
    const selector = before.slice(before.lastIndexOf("}") + 1).split("{").pop().trim();
    cursor = brace.index;
    if (selector && !selector.startsWith("@media")) selectors.push(selector);
  }
  assert.ok(selectors.length >= 20, `expected the order screens' own rules, found ${selectors.length}`);
  for (const selector of selectors) {
    assert.match(selector, /^\.aan-root /, `${selector} is not scoped to the port`);
  }

  /* No dead selector: everything the sheet styles is drawn by one of the five
     files this stage wrote (the design's own classes excepted — they are the
     registers it reuses). */
  const drawn = new Set(ORDER_FILES.flatMap((file) => [...drawnIn(file)]));
  const foreign = new Set(["chip", "info", "container", "crumbs", "label", "display", "empty", "sr-only", "btn", "totals", "checkout__lines", "pf-note", "pf-panel", "pf-panel__eyebrow", "pf-panel__name", "pf-panel__line", "pf-panel__quiet", "pf-panel__actions", "pf-meta", "pf-meta__strong", "pf-meta__row", "pf-meta__quiet", "pf-option", "pf-options", "pf-option__body", "pf-option__title", "pf-option__line", "pf-option__quiet", "pf-option__price", "pf-form", "pf-hint", "pf-chip", "listing-group__count", "form__err", "pf-alert"]);
  for (const [, name] of stripped.matchAll(/\.([a-z][a-z0-9_-]*)\b/g)) {
    if (name === "aan-root" || name.startsWith("is-") || foreign.has(name)) continue;
    assert.ok(drawn.has(name), `${name} is styled by the order sheet but drawn by no order component`);
  }

  /* Every class this stage introduced is drawn by a file this stage wrote. */
  for (const name of [
    "pf-account__filters",
    "pf-account__search",
    "pf-account__search-icon",
    "pf-account__search-clear",
    "pf-account__order-list",
    "pf-account__order-card",
    "pf-account__order-head",
    "pf-account__order-pieces",
    "pf-account__order-thumbs",
    "pf-account__order-thumb",
    "pf-account__order-more",
    "pf-account__order-summary",
    "pf-account__order-facts",
    "pf-account__order-actions",
    "pf-account__statusline",
    "pf-account__notice",
    "pf-account__grid",
    "pf-account__rail",
    "pf-account__steps",
    "pf-account__step",
    "pf-account__step-marker",
    "pf-account__legend",
    "pf-account__option-row",
    "pf-account__option-img",
    "pf-account__option-state",
    "pf-account__option-qty",
  ]) {
    assert.ok(drawn.has(name), `${name} is styled by this stage but no order component draws it`);
  }
});

test("the screen's own layout reaches both ends of the design's breakpoints", () => {
  const sheet = source(SHEET);

  assert.match(sheet, /@media \(max-width: 899px\) \{[\s\S]*\.aan-root \.pf-account__grid,/, "the single-order screens never collapse to one column");
  assert.match(sheet, /@media \(max-width: 899px\) \{[\s\S]*\.aan-root \.pf-panel \.pf-meta/, "an order's fact band never collapses");
  assert.match(sheet, /@media \(max-width: 599px\) \{[\s\S]*\.aan-root \.pf-account__search \{\n\s+max-width: none;/, "the search field never fills a narrow screen");
  assert.match(sheet, /@media \(min-width: 900px\) \{[\s\S]*\.aan-root \.pf-account__order-card \{\n\s+flex-direction: row;/, "an order's card never lays out as a row");

  /* The rules the four screens share with the account family are the frame's own
     sheet — this one does not restate them. */
  for (const owned of ["pf-account__nav", "pf-account__intro", "pf-account__addresses", "pf-account__tiles"]) {
    assert.equal(new RegExp(`\\.${owned}[\\s,{:]`).test(sheet), false, `${owned} was restated in the order sheet`);
  }
});
