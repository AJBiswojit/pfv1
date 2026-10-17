/**
 * PRATIKSHYA FASHION — PHASE 7 · the design's shop page, on the real listing routes.
 *
 * Phase 7 adopts `home-page/src/pages/Shop.jsx` the way Phase 6 adopted the
 * product page: the design's file carried over by `scripts/customer-port.js`,
 * adapted only by named rewrites, reachable only through the existing
 * `` switch, and wired to the application's own listing engine.
 *
 * These tests render the surfaces a browser reaches:
 *
 *   1. THE SWITCH STILL MEANS THE SWITCH, AND IT STOPS WHERE IT SHOULD. Off,
 *      `/shop` is the application's own shop page. On, the design's listing
 *      shell owns `/shop`, `/explore`, `/search`, `/category/:slug`,
 *      `/collections/:slug` and every navigation-scope path the router sends to
 *      a listing — and nothing else: `/about`, `/cart`, `/account/wishlist` and
 *      the product page keep their production pages.
 *   2. THE SHELL IS THE DESIGN'S AND THE DATA IS THIS APPLICATION'S. The
 *      eyebrow, title, breadcrumb trail, sort select and tab row come from the
 *      live registers (`resolveListingScope`, `sortOptions`, `deriveTabs`), the
 *      count comes from the backend's own filtered total, and a listing whose
 *      scope the application does not serve is the design's 404 — the same
 *      answer the production listing gives.
 *   3. NOTHING IS FABRICATED WHILE THE CATALOGUE IS UNKNOWN. The first render
 *      shows the design's skeleton, the count says it is loading, and no
 *      product, price or rating is invented anywhere in the markup.
 *   4. THE DESIGN'S LOCAL CATALOGUE IS GONE. The ported page imports no
 *      `getProductsFor` / `searchProducts` / `sortProducts` / `SORTS` from the
 *      design's own table; the engine it reads is `hooks/useCatalogueQuery`, the
 *      one every production listing uses.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM implementation in this tree (no jsdom,
 * no headless engine), so clicks, layout, breakpoints and pixels are out of
 * scope here — the Phase 7 browser probe covers those on a real Chromium. Effects
 * do not run under `renderToStaticMarkup` either, so the fetched states
 * (products, facets, Load more, the error branch) are exercised in the browser
 * probe rather than here; what is pinned here is composition, scope resolution,
 * the switch, and the absence of anything invented.
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

/* ── the catalogue a real storefront publishes ───────────────────────────────
 *
 * The shape `services/catalog/catalogStore.js::toStorefrontProduct` normalises:
 * the fields the API returns. One category, one collection and two products are
 * enough for the scope resolver to answer `/category/:slug` and
 * `/collections/:slug` with real records instead of a 404.
 */
const CATEGORY = { id: "sarees", name: "Sarees", slug: "sarees", status: "ACTIVE", eyebrow: "Women · Sarees" };
const COLLECTION = {
  id: "silk-classics",
  name: "Silk Classics",
  slug: "silk-classics",
  status: "ACTIVE",
  displayStatus: "ACTIVE",
  eyebrow: "Collection",
};
const RECORDS = [
  {
    id: "phase7-silk-saree",
    name: "Phase 7 Silk Saree",
    slug: "phase7-silk-saree",
    sku: "P7-SILK-01",
    price: 4200,
    originalPrice: 5200,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase7/saree-cover.jpg",
    additionalImages: [],
    sizes: ["Free Size"],
    colors: ["Ink"],
    occasion: ["Wedding"],
    fabric: "Mulberry Silk",
    material: "Handloom",
    description: "A handloom silk saree, woven for the wedding season.",
    availability: "in-stock",
    stock: 6,
  },
  {
    id: "phase7-silk-saree-two",
    name: "Phase 7 Second Saree",
    slug: "phase7-silk-saree-two",
    sku: "P7-SILK-02",
    price: 5200,
    originalPrice: null,
    category: "sarees",
    department: "women",
    image: "/fixtures/phase7/saree-two-cover.jpg",
    additionalImages: [],
    sizes: ["Free Size"],
    colors: ["Ink"],
    occasion: ["Festive"],
    fabric: "Katan Silk",
    material: "Handloom",
    description: "A second handloom saree.",
    availability: "in-stock",
    stock: 3,
  },
];

/* ── the mount: the application's provider stack, at one path ────────────── */

/** One mounted copy of the application's provider stack around `CustomerLayout`. */
async function mount(define) {
  const vite = await createServer({
    root: ROOT,
    logLevel: "error",
    /* Several hosts in one file: no HMR socket, or they fight over its port. */
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
    boundary,
    listingScope,
    customerRoutes,
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
    load("/src/components/customer/components/shop/listingScope.js"),
    load("/src/config/customerRoutes.js"),
  ]);

  let tree = React.createElement(CustomerLayout);
  for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
    tree = React.createElement(Provider, null, tree);
  }

  return {
    vite,
    store,
    boundary,
    listingScope,
    customerRoutes,
    /* The composition `src/App.jsx` uses, at one path, exactly as a browser
       would reach it. */
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
  /* The catalogue the application would have fetched by the time a shopper
     opens a listing: products, the category they sit in, and the collection. */
  on.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections: [COLLECTION] });
  off.store.applyCatalogSnapshot({ products: RECORDS, categories: [CATEGORY], collections: [COLLECTION] });
});

after(async () => {
  await Promise.all([on?.vite.close(), off?.vite.close()]);
});

/* ── 1 · the switch, and where it stops ─────────────────────────────────── */

test("listing routes always render Aarna's listing UI regardless of the former override", () => {
  for (const path of ["/shop", "/explore", "/search?q=silk", "/women/sarees", "/category/sarees", "/collections/silk-classics"]) {
    const markup = off.render(path);
    assert.match(markup, /class="pf-root"/, `${path} did not render Aarna`);
    assert.match(markup, /class="shop container"/, `${path} did not render Aarna's listing`);
  }
});

test("with the switch on, the design's listing owns every listing route the application serves", () => {
  for (const path of ["/shop", "/explore", "/search?q=silk", "/women", "/women/sarees", "/category/sarees", "/collections/silk-classics"]) {
    const markup = on.render(path);
    assert.match(markup, /class="pf-root"/, `${path} did not mount the port`);
    assert.match(markup, /class="shop container"/, `${path} did not render the design's listing shell`);
  }
});

test("the switch stops at the routes it does not own", () => {
  /* `listing-controls` is the listing's own bar — the sort select, the refine
     control and the count. Nothing else in the port draws it, so it is the one
     marker that says "this path was handed to the listing page". */
  for (const path of ["/cart", "/checkout", "/account/orders", "/signin", "/about", "/contact", "/privacy", "/terms", "/account/wishlist"]) {
    const markup = on.render(path);
    assert.equal(/listing-controls/.test(markup), false, `${path} was handed to the port's listing`);
  }
  /* Reset-password now belongs to the Aarna auth route, never the listing. */
  const reset = on.render("/reset-password?userId=user-1&token=token-1");
  assert.match(reset, /pf-root/, "reset-password did not render in the Aarna shell");
  assert.equal(/listing-controls/.test(reset), false, "reset-password rendered listing controls");
});

test("Phase 8's own surfaces mount the port, and never the listing", () => {
  /* The complement: the routes Phase 8 added are answered by the port, each by
     the page it belongs to. The design's wishlist borrows the listing page's
     `shop container` frame and the information page its own `info container`,
     so the marker that separates them is the listing's control bar. */
  const wishlist = on.render("/account/wishlist");
  assert.match(wishlist, /class="pf-root"/, "the wishlist did not mount the port");
  assert.match(wishlist, /class="label">Saved pieces</, "the wishlist did not render its own page");
  assert.equal(/listing-controls/.test(wishlist), false, "the wishlist was handed to the listing");

  for (const path of ["/about", "/contact", "/privacy", "/terms"]) {
    const markup = on.render(path);
    assert.match(markup, /class="pf-root"/, `${path} did not mount the port`);
    assert.match(markup, /class="info container"/, `${path} did not render the information page`);
    assert.equal(/listing-controls/.test(markup), false, `${path} was handed to the listing`);
  }
});

test("the listing boundary answers for exactly the paths the router sends to a listing", () => {
  const { isCustomerListingPath } = on.customerRoutes;
  const owned = ["/shop", "/explore", "/search", "/women", "/women/sarees/silk", "/bridal", "/men/groom", "/kids/girls/dresses", "/category/sarees", "/collections/silk-classics", "/collection/silk-classics"];
  const kept = ["/", "/about", "/contact", "/privacy", "/terms", "/account", "/account/wishlist", "/cart", "/checkout", "/product/phase7-silk-saree", "/login", "/admin", "/employee/profile"];
  for (const path of owned) assert.equal(isCustomerListingPath(path), true, `${path} should be a listing`);
  for (const path of kept) assert.equal(isCustomerListingPath(path), false, `${path} should NOT be a listing`);
});

/* ── 2 · the scope resolver reads this application's registers ────────────── */

test("every listing path resolves to a scope from the live registers — or to nothing", async () => {
  const { resolveListingScope } = on.listingScope;

  /* Unscoped surfaces carry no filters and are named by the design's own table. */
  const shop = resolveListingScope({ mode: "shop", pathname: "/shop" });
  const explore = resolveListingScope({ mode: "explore", pathname: "/explore" });
  const search = resolveListingScope({ mode: "search", pathname: "/search" });
  assert.deepEqual(shop.filters, {});
  assert.deepEqual(explore.filters, {});
  assert.deepEqual(search.filters, {});
  assert.equal(shop.title, "All Pieces");

  /* A managed category and a managed collection resolve from the snapshot. */
  const category = resolveListingScope({ mode: "category", slug: "sarees", pathname: "/category/sarees" });
  assert.equal(category?.id, "sarees");
  assert.deepEqual(category.filters, { category: "sarees" });
  assert.ok(category.breadcrumb.some((crumb) => crumb.to === "/shop"), "the trail does not start at the shop");

  const collection = resolveListingScope({ mode: "collection", slug: "silk-classics", pathname: "/collections/silk-classics" });
  assert.equal(collection?.id, "silk-classics");
  assert.deepEqual(collection.filters, { collectionId: "silk-classics" });
  assert.deepEqual(collection.breadcrumb[0], { label: "Collections", to: "/collections" });

  /* A navigation path carries the register's locked filters and the manifest's
     own copy, never a guess. */
  const nav = resolveListingScope({ mode: "navigation", pathname: "/women/sarees/silk" });
  assert.deepEqual(nav.filters, { department: "women", category: "sarees", subcategory: "silk" });
  assert.equal(nav.title, "Silk Sarees");
  /* The trail is the manifest's own — the port neither shortens it nor invents
     a step the application does not publish. */
  const { getRouteMeta } = await on.vite.ssrLoadModule("/src/config/navigationConfig.js");
  assert.deepEqual(nav.breadcrumb, getRouteMeta("/women/sarees/silk").breadcrumb);

  /* Paths this application does not serve are not listings — the same answer
     the production listing gives, so the port cannot invent a page. */
  assert.equal(resolveListingScope({ mode: "category", slug: "not-a-category", pathname: "/category/not-a-category" }), null);
  assert.equal(resolveListingScope({ mode: "collection", slug: "not-a-collection", pathname: "/collections/not-a-collection" }), null);
  assert.equal(resolveListingScope({ mode: "navigation", pathname: "/not/a/listing" }), null);
});

test("an unknown slug is the design's 404 — not an empty edit, and not a fabricated scope", () => {
  const markup = on.render("/category/not-a-category");
  assert.match(markup, /class="pf-root"/, "the port did not mount");
  assert.equal(/class="shop container"/.test(markup), false, "an unknown category rendered a listing");
  assert.equal(/All Pieces/.test(markup), false, "an unknown category was titled as the shop");
});

/* ── 3 · the shell is the design's; the words and the counts are not ──────── */

test("the navigation listing prints the register's own eyebrow, title and trail", () => {
  const markup = on.render("/women/sarees/silk");
  assert.match(markup, /class="label">Women · Sarees</, "the register's eyebrow is missing");
  assert.match(markup, /class="display shop__title">Silk Sarees</, "the manifest's label is missing");
  assert.match(markup, /href="\/women\/sarees"/, "the trail's parent link is missing");
  assert.match(markup, /aria-current="page">Silk Sarees</, "the trail's current step is missing");
});

test("the sort control carries the application's own eight sorts, and no others", async () => {
  const { sortOptions } = await on.vite.ssrLoadModule("/src/data/products/taxonomy.js");
  const markup = on.render("/shop");
  const values = [...markup.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(values, sortOptions.map((option) => option.id), "the sort select is not the application's sort register");
  assert.equal(values.length, 8);
  assert.equal(/featured/.test(values.join(",")), false, "the design's local `featured` key survived");
});

test("the count is the backend's total, and the catalogue is never claimed before it arrives", () => {
  const markup = on.render("/shop");
  assert.match(markup, /class="shop__count">Loading…</, "the listing claimed a count before the catalogue arrived");
  assert.equal(/\d+ pieces?</.test(markup), false, "a count was printed before the backend answered");
  /* Nothing invented: no sample product, price or stock line from the design's
     own catalogue may appear while the live one is unknown. */
  assert.equal(/All Pieces/.test(markup), true, "the unscoped listing lost the design's own title");
  assert.equal(/phase7-silk-saree/.test(markup), false, "a product rendered before the query answered");
});

test("the search surface is the design's, and the term lives in the URL", () => {
  const withTerm = on.render("/search?q=silk");
  assert.match(withTerm, /class="listing-search"/, "the search surface is missing");
  assert.match(withTerm, /class="search__form"/, "the design's search form class is missing");
  assert.match(withTerm, /value="silk"/, "the term from the URL is not in the field");
  assert.match(withTerm, /class="display shop__title">“silk”</, "the page is not titled by its term");
  assert.equal(/Bridal Bangles/.test(withTerm), false, "suggestions were offered while a term was set");

  const empty = on.render("/search");
  assert.match(empty, /class="display shop__title">Find your piece</, "an empty search lost the design's own empty title");
  assert.match(empty, /Bridal Bangles/, "the application's own suggestions are missing from an empty search");
});

/* ── 4 · the design's local catalogue table is gone ──────────────────────── */

test("the ported listing reads this application's engine, not the design's local table", () => {
  const page = read("src/components/customer/pages/Shop.jsx");
  assert.match(page, /import useCatalogueQuery from '\.\.\/\.\.\/\.\.\/hooks\/useCatalogueQuery\.js'/, "the page does not use the application's listing engine");
  assert.match(page, /import \{ buildFacets \} from '\.\.\/\.\.\/\.\.\/data\/products\/facets\.js'/, "the page does not count facets with the application's builder");
  /* The labels the chips print come from the same register, read by the module
     that draws them (`ListingControls`); the page never re-derives one. */
  assert.match(read("src/components/customer/components/shop/ListingControls.jsx"), /import \{ chipLabel \} from ["']\.\.\/\.\.\/\.\.\/\.\.\/data\/products\/facets\.js["']/, "the chip labels do not come from the application's register");
  assert.match(page, /import \{ useProductCovers \} from '\.\.\/\.\.\/\.\.\/hooks\/useMedia\.js'/, "plates are not resolved from the canonical media set");
  assert.match(page, /from '\.\.\/\.\.\/\.\.\/components\/storefront\/CategoryTabs\.jsx'/, "sibling tabs are not derived from the canonical taxonomy");
  for (const gone of ["getProductsFor", "searchProducts", "sortProducts", "const SORTS"]) {
    assert.equal(page.includes(gone), false, `the design's local catalogue table survived: ${gone}`);
  }
  /* The boundaries are the application's, and neither is a second copy. */
  const scopeModule = read("src/components/customer/components/shop/listingScope.js");
  assert.match(scopeModule, /resolveNavigationScope/, "the scope register is not read");
  assert.match(scopeModule, /getRouteMeta/, "the manifest's own copy is not read");
});

test("the listing hands the design's card URL strings — the plates never reach it as records", async () => {
  const page = read("src/components/customer/pages/Shop.jsx");
  /* `useProductCovers` publishes the canonical media records (`{ id, src, … }`)
     and the design's card prints `images[0]` verbatim, so a page that passed the
     records straight through drew `src="[object Object]"` for every plate — the
     defect a browser run caught on this page. The conversion is this
     application's own single resolver, the one every production image takes. */
  assert.match(page, /import \{ normalizeMediaReference \} from '\.\.\/\.\.\/\.\.\/services\/media\/mediaPaths\.js'/,
    "the listing does not use the application's single media resolver");
  assert.match(page, /\.map\(\(plate\) => normalizeMediaReference\(plate\)\)/,
    "the plates are not passed through that resolver");
  assert.equal(page.includes("const plates = [row.image, row.hoverImage].filter(Boolean);"), false,
    "the pre-fix pass-through of media records came back");

  /* The pin is only worth having because of what the card does with the wrong
     shape, so the card itself is rendered here: records in, `[object Object]`
     out; the resolver's strings in, the published cover out. */
  const [
    { default: ProductCard },
    { normalizeMediaReference },
    { CartProvider },
    { WishlistProvider },
    { UIProvider },
    { ShopProvider },
  ] = await Promise.all([
    on.vite.ssrLoadModule("/src/components/customer/components/product/ProductCard.jsx"),
    on.vite.ssrLoadModule("/src/services/media/mediaPaths.js"),
    on.vite.ssrLoadModule("/src/context/CartContext.jsx"),
    on.vite.ssrLoadModule("/src/context/WishlistContext.jsx"),
    on.vite.ssrLoadModule("/src/components/customer/state/UIContext.jsx"),
    on.vite.ssrLoadModule("/src/components/customer/state/ShopContext.jsx"),
  ]);

  const records = [
    { id: "media-cover", src: "/fixtures/phase7/saree-cover.jpg", alt: "cover", role: "primary" },
    { id: "media-alt", src: "/fixtures/phase7/saree-alt.jpg", alt: "", role: "gallery" },
  ];
  const card = (images) => {
    let tree = React.createElement(ProductCard, {
      product: { id: "phase7-silk-saree", slug: "phase7-silk-saree", name: "Phase 7 Silk Saree", type: "saree", price: 4200, images, inStock: true, options: [] },
    });
    for (const Provider of [ShopProvider, UIProvider, WishlistProvider, CartProvider]) {
      tree = React.createElement(Provider, null, tree);
    }
    return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ["/"] }, tree));
  };
  const srcs = (markup) => [...markup.matchAll(/<img\b[^>]*?\ssrc="([^"]*)"/g)].map((match) => match[1]);

  assert.deepEqual(srcs(card(records)), ["[object Object]", "[object Object]"],
    "the card no longer prints a value it cannot read — this guard's premise has changed");
  assert.deepEqual(srcs(card(records.map((record) => normalizeMediaReference(record)).filter(Boolean))),
    ["/fixtures/phase7/saree-cover.jpg", "/fixtures/phase7/saree-alt.jpg"],
    "the resolver's strings did not reach the card");
  assert.equal(/\[object Object\]/.test(on.render("/shop")), false, "a record was stringified into the listing");
});

test("a listing's facets, active chips and pagination are the production ones, re-expressed in the design's chip", () => {
  const controls = read("src/components/customer/components/shop/ListingControls.jsx");
  assert.match(controls, /chipLabel\(chip\.facet, chip\.value\)/, "active chips do not use the application's chip labels");
  assert.match(controls, /onToggle\(facet\.id, option\.id\)/, "the panel does not delegate filtering to the engine");
  assert.match(controls, /facet\.kind === "swatch" \|\| facet\.kind === "chip" \? 12 : 6/, "the production panel's truncation rule is not mirrored");
  assert.match(controls, /Remove filter \$\{chip\.facetLabel\}/, "the production chip's accessible name is not preserved");
  const page = read("src/components/customer/pages/Shop.jsx");
  assert.match(page, /Button variant="solid" onClick=\{loadMore\}>Load more/, "Load more is missing");
  assert.match(page, /Showing \$\{visible\.length\} of \$\{total\}/, "the paged count is missing");
  assert.match(page, /ListingUnavailable onRetry=\{retry\}/, "the failure state does not offer the engine's own retry");
});

test("the port's own listing stylesheet is scoped to the port and adds no design override", () => {
  const css = read("src/components/customer/customer.listing.css");
  /* Comments carry prose; the selectors are what has to be scoped. */
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...rules.matchAll(/^\s*([^@\s}][^{};]*)\{/gm)].map((match) => match[1].trim());
  assert.ok(selectors.length > 0, "the stylesheet is empty");
  for (const selector of selectors) {
    for (const part of selector.split(",")) {
      assert.match(part.trim(), /^\.pf-root\b/, `an unscoped rule would leak into the host application: ${part.trim()}`);
    }
  }
  /* Every value is a design token or a plain measure — never a new colour. */
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false, "the port introduced a colour of its own");
  assert.match(read("src/components/customer/CustomerStorefront.jsx"), /import "\.\/customer\.listing\.css"/, "the listing stylesheet is not loaded by the port");
});
