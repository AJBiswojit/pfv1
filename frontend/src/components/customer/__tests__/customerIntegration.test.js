/**
 * Aarna integration and isolation contracts. App.jsx mounts CustomerLayout for
 * customer paths, CustomerLayout mounts Aarna, and Aarna owns the customer route
 * table. The staff portals remain separate; preview fixtures and old customer
 * compositions are not reachable from the production route graph.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { routeManifest } from "../../../config/navigationConfig.js";
import { APP_ROUTES, resolveStorefrontPath, isRegisteredPath, routeTable } from "../router/routes.js";
import {
  CUSTOMER_INFO_PATHS,
  CUSTOMER_PRODUCT_PATH,
  CUSTOMER_WISHLIST_PATHS,
  isCustomerCatchAllPath,
  isCustomerWishlistPath,
  isStaffPortalPath,
} from "../../../config/customerRoutes.js";

function projectRoot() {
  let directory = new URL(".", import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL("package.json", directory))) return fileURLToPath(directory);
    directory = new URL("../", directory);
  }
  throw new Error("frontend root not found");
}

const ROOT = projectRoot();
const PORT = "src/components/customer";
const PREVIEW = "src/components/storefront/preview";
const LAYOUT = "src/layouts/CustomerLayout.jsx";
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

const sourceFiles = (directory = "src", found = []) => {
  for (const entry of readdirSync(join(ROOT, directory))) {
    const relative = `${directory}/${entry}`;
    if (statSync(join(ROOT, relative)).isDirectory()) sourceFiles(relative, found);
    else if (/\.(jsx|js)$/.test(entry)) found.push(relative);
  }
  return found;
};

const portFiles = (directory = PORT, found = []) => {
  for (const entry of readdirSync(join(ROOT, directory))) {
    const relative = `${directory}/${entry}`;
    if (statSync(join(ROOT, relative)).isDirectory()) portFiles(relative, found);
    else if (/\.(jsx|js)$/.test(entry)) found.push(relative);
  }
  return found;
};

/** The destinations the ported data files and components declare. */
const designDestinations = () => {
  const found = new Set();
  for (const file of portFiles()) {
    const source = file !== `${PORT}/router/routes.js` ? read(file) : "";
    for (const match of source.matchAll(/to(?:=|:)\s*[{'"]+\s*(\/[A-Za-z0-9/_-]*)/g)) found.add(match[1]);
  }
  return [...found];
};

/** Every `/shop/<key>` and `/pages/<key>` the ported data asks for. */
const designKeys = (prefix) => {
  const keys = new Set();
  for (const file of portFiles()) {
    for (const match of read(file).matchAll(new RegExp(`'${prefix}/([a-z0-9-]+)'`, "g"))) keys.add(match[1]);
  }
  return [...keys];
};

/* ── 1 · destinations ───────────────────────────────────────────────── */

test("every destination the design wrote resolves to a route this application registers", () => {
  const destinations = designDestinations();
  assert.ok(destinations.length > 40, `expected the design's destinations, found ${destinations.length}`);
  assert.ok(destinations.includes("/shop/sarees") && destinations.includes("/shop/the-groom"));

  const unmatched = [];
  for (const destination of destinations) {
    const target = resolveStorefrontPath(destination).split(/[?#]/)[0];
    if (!isRegisteredPath(target)) unmatched.push(`${destination} → ${target}`);
  }
  assert.deepEqual(unmatched, [], `design destinations that resolve nowhere:\n${unmatched.join("\n")}`);
});

test("the route table is this application's own — checked against App.jsx and the manifest", () => {
  const app = read("src/App.jsx");
  const storefront = read("src/components/customer/CustomerStorefront.jsx");
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/, "App must delegate customer paths to Aarna");
  for (const path of APP_ROUTES) {
    if (path === "/" || path === "/login") continue;
    assert.ok(isRegisteredPath(path), `Aarna's route register omits ${path}`);
  }
  assert.match(storefront, /<Route index element=\{<Home \/>\} \/>/, "Aarna no longer owns the customer root");
  /* …and every path the manifest carries is a route too. */
  assert.ok(routeManifest.length >= 40, `expected the navigation manifest, found ${routeManifest.length} routes`);
  for (const route of routeManifest) assert.ok(isRegisteredPath(route.path), `${route.path} is not resolvable`);
});

test("the design's shop vocabulary is translated to the catalogue's own paths", () => {
  const keys = designKeys("/shop");
  assert.ok(keys.length >= 35, `expected the design's shop keys, found ${keys.length}`);
  const mapped = {};
  for (const key of keys) {
    const target = resolveStorefrontPath(`/shop/${key}`);
    mapped[key] = target;
    assert.ok(isRegisteredPath(target), `/shop/${key} resolves to ${target}, which is not a registered route`);
  }
  /* Spot-check the table's intent: the design's wardrobes and edits map onto the
     catalogue's canonical paths, never onto an invented one. */
  assert.equal(mapped.women, "/women");
  assert.equal(mapped.men, "/men");
  assert.equal(mapped.kids, "/kids");
  assert.equal(mapped.essentials, "/women/essentials");
  assert.equal(mapped.jewellery, "/bridal/finishing-touches/jewellery");
  assert.equal(mapped.sarees, "/women/sarees");
  assert.equal(mapped["the-bride"], "/bridal/the-bride");
  assert.equal(mapped["the-groom"], "/men/groom");
  assert.equal(mapped.girls, "/kids/girls");
  assert.equal(mapped.boys, "/kids/boys");
  assert.equal(mapped.bangles, "/bridal/finishing-touches/bangles");
  assert.equal(mapped.festive, "/collections");
  /* An unknown edit is the shop listing: a real page, never a 404. */
  assert.equal(resolveStorefrontPath("/shop/not-an-edit"), "/shop");
  assert.equal(resolveStorefrontPath("/shop/all"), "/shop");
});

test("the design's information pages and customer paths resolve to the application's own", () => {
  for (const key of designKeys("/pages")) {
    assert.ok(isRegisteredPath(resolveStorefrontPath(`/pages/${key}`)), `/pages/${key} resolves nowhere`);
  }
  assert.equal(resolveStorefrontPath("/pages/our-story"), "/about");
  assert.equal(resolveStorefrontPath("/pages/privacy"), "/privacy");
  assert.equal(resolveStorefrontPath("/pages/terms"), "/terms");
  assert.equal(resolveStorefrontPath("/pages/shipping"), "/contact");
  assert.equal(resolveStorefrontPath("/track-order"), "/account/orders");
  assert.equal(resolveStorefrontPath("/wishlist"), "/wishlist");
  assert.equal(resolveStorefrontPath("/account/orders"), "/account/orders");
  assert.equal(resolveStorefrontPath("/cart"), "/cart");
});

test("a product link keeps the catalogue's own identity", () => {
  /* With no catalogue loaded the slug is passed through — the application's
     product route still resolves it and shows its own empty state. */
  assert.equal(resolveStorefrontPath("/product/ivory-banarasi-saree"), "/product/ivory-banarasi-saree");
  assert.equal(resolveStorefrontPath(undefined), undefined);
  assert.equal(resolveStorefrontPath(""), "/");
  assert.equal(resolveStorefrontPath("/shop/sarees/"), "/women/sarees");
  assert.equal(resolveStorefrontPath("/shop/sarees?sort=price-asc"), "/women/sarees?sort=price-asc");
  assert.equal(resolveStorefrontPath("/about#craft"), "/about#craft");
});

test("the translation table only names routes the application registers", () => {
  const { keyRoutes, pageRoutes } = routeTable();
  for (const [key, target] of [...Object.entries(keyRoutes), ...Object.entries(pageRoutes)]) {
    assert.equal(isRegisteredPath(target), true, `${key} → ${target} is not a registered route`);
  }
});

/* ── 2 · the single customer storefront ─────────────────────────────── */

test("Aarna is the only customer surface mounted by the outer catch-all", () => {
  const layout = read(LAYOUT);
  assert.match(layout, /<CustomerStorefront \/>/);
  assert.doesNotMatch(layout, /AtelierDesign|StorefrontHome|useEditorialHome|useCustomerStorefront/);

  const app = read("src/App.jsx");
  assert.doesNotMatch(app, /AtelierDesign|StorefrontHome|VITE_STOREFRONT_HOME/);
  assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/);
  assert.doesNotMatch(app, /<Route path="\*" element=\{<NotFound/);

  const importers = sourceFiles()
    .filter((file) => !file.includes("__tests__") && !file.includes("/preview/"))
    .filter((file) => /from "[^"]*customer\/CustomerStorefront/.test(read(file)));
  assert.deepEqual(importers, [LAYOUT], "Aarna is mounted by the customer layout alone");
});

test("the Aarna product predicate matches only a single product route", () => {
  assert.equal(CUSTOMER_PRODUCT_PATH.source, "^\\/product\\/[^/]+\\/?$");

  /* The route matcher is independent of any storefront selector. These cases
     pin the product URL shape, leaving deeper paths and other journeys alone. */
  for (const path of ["/product/a", "/product/silk-saree", "/product/a/"]) {
    assert.equal(CUSTOMER_PRODUCT_PATH.test(path), true, `${path} is the product route`);
  }
  for (const path of ["/", "/product", "/product/a/b", "/products/a", "/cart", "/checkout"]) {
    assert.equal(CUSTOMER_PRODUCT_PATH.test(path), false, `${path} is not the product route`);
  }
});

test("the Phase 8 surfaces are the wishlist and the four information routes — and the guard is exactly the rest", () => {
  assert.deepEqual([...CUSTOMER_WISHLIST_PATHS].sort(), ["/account/wishlist", "/wishlist"]);
  assert.deepEqual([...CUSTOMER_INFO_PATHS].sort(), ["/about", "/contact", "/privacy", "/terms"]);

  /* Every path the boundary claims is either a registered customer route or a
     path no route serves — never a staff portal, and never a route that exists.
     The four information routes and the canonical wishlist are registered, so
     the guard leaves them to the surface that owns them. */
  for (const path of [...CUSTOMER_WISHLIST_PATHS, ...CUSTOMER_INFO_PATHS]) {
    assert.equal(isCustomerWishlistPath(path), true, `${path} is not a Phase 8 surface`);
    assert.equal(isCustomerCatchAllPath(path), false, `${path} fell through to the catch-all`);
    assert.equal(isRegisteredPath(path), true, `${path} is not a registered route`);
  }

  /* The guard's own shape: it excludes the portals first, and it asks the port's
     table for the rest — so a surface added tomorrow is claimed by name here and
     by nothing else. */
  assert.equal(isStaffPortalPath("/admin"), true);
  assert.equal(isStaffPortalPath("/admin/products/new"), true);
  assert.equal(isStaffPortalPath("/employee/profile"), true);
  assert.equal(isStaffPortalPath("/super-admin/orders"), true);
  assert.equal(isStaffPortalPath("/login"), true);
  assert.equal(isStaffPortalPath("/administrators"), false, "a portal prefix matched too loosely");
  assert.equal(isStaffPortalPath("/employee"), true);
  for (const path of ["/admin", "/login", "/employee/profile"]) {
    assert.equal(isCustomerCatchAllPath(path), false, `${path} was claimed by the catch-all`);
  }
  assert.equal(isCustomerCatchAllPath("/no-such-page"), true);
});

/* ── 3 · fixture isolation ──────────────────────────────────────────── */

test("the fixtures have exactly one importer, and it is the DEV-gated surface", () => {
  const importers = sourceFiles()
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => read(file).includes("previewCustomerFixtures"));
  assert.deepEqual(importers, [`${PREVIEW}/CustomerPreview.jsx`], "fixtures must have one importer");

  const surface = read(`${PREVIEW}/CustomerPreview.jsx`);
  assert.match(surface, /import\.meta\.env\.DEV/);
  assert.match(read(`${PREVIEW}/previewCustomerFixtures.js`), /NOT A SECOND CATALOGUE|NOT PRODUCTION DATA/);
});

test("the production graph of the port cannot reach the harness or its fixtures", () => {
  const ported = portFiles().filter((file) => !file.includes("__tests__"));
  for (const file of ported) {
    const source = read(file);
    /* The check is about IMPORTS: a boundary module may name the reference
       surface in a header (saying where its preview seam is opened from). */
    assert.equal(/from\s+["'][^"']*preview\//.test(source), false, `${file} imports the preview harness`);
    assert.equal(/PREVIEW_CUSTOMER[A-Z_]*\s*[,}]/.test(source), false, `${file} names a fixture binding`);
    assert.equal(/previewCustomerFixtures/.test(source), false, `${file} names the fixture module`);
  }

  /* The seams — the only way fixtures can enter the port — are opened from the
     reference surface alone. */
  const seamCallers = sourceFiles()
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => /setPreview(CatalogueSource|PromotionSource|NewsletterService)\(/.test(read(file)));
  assert.deepEqual(seamCallers, [`${PREVIEW}/CustomerPreview.jsx`, ...seamCallers.filter((file) => file.startsWith(PORT))].sort(), "only the reference surface opens the seams");
  for (const file of seamCallers.filter((name) => name.startsWith(PORT))) {
    assert.match(read(file), /ADAPTED AT THE BOUNDARY/, `${file} opens a seam but is not a boundary module`);
  }
});

test("none of the design's sample copy ships in the port", () => {
  const productionFiles = portFiles().filter((file) => !file.includes("__tests__"));
  const sampleCopy = [/UTSAV15/, /festive-preview/, /care@[^\s"']*\.example/, /Prototype storefront/, /sample offer details/];
  for (const file of productionFiles) {
    for (const pattern of sampleCopy) {
      assert.equal(pattern.test(read(file)), false, `${file} still carries the design's sample copy (${pattern})`);
    }
  }
  /* STEP-1-DB-DRIVEN: the sample-offer label went with the mock promotion path —
     the section renders only authored database content, so it can never carry
     the sample flag at all. */
  assert.doesNotMatch(read(`${PORT}/components/sections/PromoBanner.jsx`), /Sample offer/);
  /* The design's registry of art, by contrast, IS the design's own. */
  assert.match(read(`${PORT}/mock/assets/images.js`), /hero-saree/);
});

test("the port keeps the application's own truth about the house and the offer", () => {
  const site = read(`${PORT}/mock/data/site.js`);
  assert.match(site, /email: null/, "no placeholder support address may ship");
  assert.equal(/@[a-z]+\.example/.test(site), false);
  assert.equal(site.includes("instagram.com"), false, "no profile link may point at a platform home page");
  assert.match(read(`${PORT}/state/ShopContext.jsx`), /from '\.\.\/\.\.\/\.\.\/services\/offers\/offerRepository\.js'/);
  assert.match(read(`${PORT}/services/newsletter.js`), /newsletterAvailable/);
  assert.match(read(`${PORT}/services/newsletter.js`), /throw new Error\(UNAVAILABLE_MESSAGE\)/);
});

/* ── 4 · the boundary modules are wired ─────────────────────────────── */

test("the catalogue boundary answers from the application, not from a sample", () => {
  const products = read(`${PORT}/mock/data/products.js`);
  assert.match(products, /getLiveStorefrontProducts\(\)/);
  assert.match(products, /toDesignProduct/);
  assert.match(products, /canonicalDepartments/);
  assert.equal(/price:\s*\d/.test(products), false, "no sample price may survive");
  assert.equal(/\bproducts\s*=\s*\[/.test(products), false, "no sample catalogue may survive");

  const promotions = read(`${PORT}/mock/data/promotions.js`);
  assert.match(promotions, /listCustomerVisible/);
  assert.match(promotions, /OFFER_TYPES\.PERCENTAGE/);
  assert.equal(/discountPercent:\s*15/.test(promotions), false, "no sample discount may survive");
});

test("the port never renders a destination it cannot resolve, and never fetches its own data", () => {
  const files = portFiles().filter((file) => !file.includes("__tests__"));
  for (const file of files) {
    const source = read(file);
    /* The port's own type families are the only external request it makes. */
    assert.equal(/https?:\/\/(?!fonts\.googleapis\.com|fonts\.gstatic\.com)/.test(source), false, `${file} reaches an external host`);
    assert.equal(/fetch\(|XMLHttpRequest|axios/.test(source), false, `${file} fetches on its own`);
    assert.equal(/\/images\//.test(source.replace(/^\s*\/\/.*$/gm, "")), false, `${file} addresses the application's media library`);
  }
});
