/**
 * Customer-route inventory and homepage contract checks. The source-derived
 * inventory now reads Aarna's route table and the shared navigation manifest;
 * App.jsx contributes only its Aarna customer boundary and separate staff routes.
 * This suite also pins that Aarna never claims staff paths and that homepage
 * sections obey the backend's closed content contract. It does not prove pixels
 * or a browser journey.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { routeManifest } from "../../../config/navigationConfig.js";
import {
  CUSTOMER_INFO_PATHS,
  CUSTOMER_PRODUCT_PATH,
  isCustomerAccountPath,
  isCustomerAuthPath,
  isCustomerCatchAllPath,
  isCustomerJourneyPath,
  isCustomerListingPath,
  isCustomerWishlistPath,
  isStaffPortalPath,
} from "../../../config/customerRoutes.js";
import { homepageSectionMode } from "../../storefront/home/homepageSectionModel.js";
import { APP_ROUTES } from "../router/routes.js";

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

/* All registered customer routes are answered by Aarna; staff routes are excluded. */
const PRODUCTION_REMAINING = [];

/* These customer account screens are native Aarna pages; App.jsx only mounts
   the customer boundary, while staff routes remain separate. */
const CUSTOMER_ACCOUNT_SCREENS = {
  "account/settings": "AccountSettings",
  "account/security": "AccountSecurity",
  "account/preferences": "AccountPreferences",
  "account/instagram-rewards": "InstagramRewards",
};

/** Does the port's boundary (the same predicates `useCustomerStorefront` ORs) answer this path? */
function servedByPort(pathname) {
  const bare = pathname.replace(/\/+$/, "") || "/";
  if (bare === "/") return true;
  return Boolean(
    CUSTOMER_PRODUCT_PATH.test(pathname) ||
      isCustomerListingPath(pathname) ||
      isCustomerWishlistPath(pathname) ||
      isCustomerJourneyPath(pathname) ||
      isCustomerAuthPath(pathname) ||
      isCustomerAccountPath(pathname) ||
      isCustomerCatchAllPath(pathname),
  );
}

/** Concrete sample values for `App.jsx` dynamic segments. */
function concrete(path) {
  return path.replace(/:([A-Za-z]+)/g, (_, name) => (name === "slug" ? "sample-slug" : "sample-id"));
}

/** Every customer path in Aarna's route table plus the navigation manifest. */
function customerPaths() {
  const storefront = read("src/components/customer/CustomerStorefront.jsx");
  const declared = [...storefront.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*");
  const all = new Set(["/", ...APP_ROUTES, ...declared.map((p) => p.startsWith("/") ? p : `/${p}`), ...routeManifest.map((route) => route.path)]
    .map((p) => p.replace(/\/+$/, "") || "/"));
  return [...all].filter((p) => !isStaffPortalPath(p)).map(concrete).sort();
}

test("every customer route is answered by Aarna, with no legacy customer routes", () => {
  const paths = customerPaths();
  assert.ok(paths.length > 60, `expected the full customer surface, got ${paths.length}`);
  const unserved = paths.filter((p) => !servedByPort(p));
  // Normalise the sample ids back to the route shape for a readable comparison.
  const shape = (p) => p.replace(/sample-slug/g, ":slug").replace(/sample-id/g, ":id");
  assert.deepEqual(
    unserved.map(shape),
    PRODUCTION_REMAINING,
    "the set of customer routes the port does not answer changed — update the inventory and the Phase 4 report",
  );
});

test("the reset route is explicitly served by Aarna's auth surface", () => {
  assert.equal(isCustomerAuthPath("/reset-password"), true);
  assert.equal(isCustomerCatchAllPath("/reset-password"), false);
  assert.equal(servedByPort("/reset-password"), true);
  const mount = read("src/components/customer/CustomerStorefront.jsx");
  assert.match(mount, /<Route path="reset-password" element=\{<ResetPassword \/>\} \/>/);
});

test("the staff portals are never claimed by the port's boundary", () => {
  for (const path of ["/login", "/admin", "/admin/products", "/super-admin/orders", "/employee", "/employee/orders"]) {
    assert.equal(isStaffPortalPath(path), true, `${path} is a staff portal`);
    assert.equal(isCustomerCatchAllPath(path), false, `${path} must not reach the port's catch-all`);
    assert.equal(servedByPort(path), false, `${path} must stay with its own portal`);
  }
});

test("the port's information pages are exactly the manifest's four", () => {
  assert.deepEqual([...CUSTOMER_INFO_PATHS].sort(), ["/about", "/contact", "/privacy", "/terms"]);
});

test("the four remaining account screens are native to Aarna, and App delegates customer routes", () => {
  const source = read("src/components/customer/CustomerStorefront.jsx");
  const app = read("src/App.jsx");
  for (const [route, component] of Object.entries(CUSTOMER_ACCOUNT_SCREENS)) {
    /* Aarna mounts its own native page, statically imported. */
    assert.doesNotMatch(
      source,
      new RegExp(`const ${component} = lazy\\(`),
      `${component} must not be a production lazy import in the port`,
    );
    assert.match(source, new RegExp(`<Route path="${route}" element=\\{<${component} />\\} />`), `${route} must mount ${component}`);
    /* App.jsx delegates every customer URL to Aarna; no duplicate route remains. */
    assert.match(app, /<Route path="\/\*" element=\{<CustomerLayout \/>\} \/>/, "App no longer delegates customer paths to Aarna");
    assert.doesNotMatch(app, new RegExp(`pages\\/account\\/${component}`), `App still imports ${component} for a customer route`);
  }
});

test("the redrawn account screens render the Aarna-owned pages, not obsolete customer routes", () => {
  const source = read("src/components/customer/CustomerStorefront.jsx");
  assert.match(source, /import AccountOverview from "\.\/pages\/account\/Overview\.jsx"/);
  assert.match(source, /import AccountProfilePage from "\.\/pages\/account\/Profile\.jsx"/);
  assert.match(source, /import AccountAddressesPage from "\.\/pages\/account\/Addresses\.jsx"/);
  assert.match(source, /import AccountOrdersPage from "\.\/pages\/account\/Orders\.jsx"/);
  assert.match(source, /import AccountAiMirrorPage from "\.\/pages\/account\/AiMirror\.jsx"/);
  assert.match(source, /import AccountAiShoppingPage from "\.\/pages\/account\/AiShopping\.jsx"/);
  assert.match(source, /import AccountSettings from "\.\/pages\/account\/Settings\.jsx"/);
  assert.match(source, /import AccountSecurity from "\.\/pages\/account\/Security\.jsx"/);
  assert.match(source, /import AccountPreferences from "\.\/pages\/account\/Preferences\.jsx"/);
  assert.match(source, /import InstagramRewards from "\.\/pages\/account\/InstagramRewards\.jsx"/);
});

/* ── the homepage's content contract ─────────────────────────────────────── */

test("the homepage renders exactly the backend's eleven keyed sections (plus the hero)", () => {
  const registry = read("../backend/app/schemas/media/homepage.py");
  const block = registry.slice(registry.indexOf("REGISTRY = {"), registry.indexOf("SECTION_KEYS ="));
  const backendKeys = [...block.matchAll(/^ {4}"([a-z]+)": slots\(/gm)].map((m) => m[1]).sort();
  const home = read("src/components/customer/pages/Home.jsx");
  const renderedKeys = [...home.matchAll(/<HomepageSection sectionKey="([a-z]+)">/g)].map((m) => m[1]).sort();
  assert.equal(backendKeys.length, 11, "backend registry has eleven keyed sections");
  assert.deepEqual(renderedKeys, backendKeys, "every backend section is rendered once, and nothing else is");
  assert.match(home, /<Hero \/>/, "the hero is the twelfth homepage element");
});

const ready = (extra = {}) => ({
  homeStatus: "ready",
  home: { homepageContent: { version: 1, status: "ready", sections: [], ...extra } },
});

test("the section gate: loading while the home request is in flight", () => {
  assert.deepEqual(homepageSectionMode({ homeStatus: "idle", home: null }, "sarees"), { mode: "loading" });
  assert.deepEqual(homepageSectionMode({ homeStatus: "loading", home: null }, "sarees"), { mode: "loading" });
});

test("the section gate: unavailable, with the retry the section renders, on a failed home request", () => {
  assert.deepEqual(homepageSectionMode({ homeStatus: "error", home: null }, "sarees"), { mode: "unavailable" });
});

test("the section gate: inactive and empty sections are hidden, never refilled from reference content", () => {
  for (const state of ["inactive", "empty"]) {
    const snapshot = ready({ sections: [{ key: "sarees", state, configured: true, items: [] }] });
    assert.deepEqual(homepageSectionMode(snapshot, "sarees"), { mode: "hidden" }, state);
  }
});

test("the section gate: an unconfigured section on a current backend is hidden, never a legacy render", () => {
  const snapshot = ready({ sections: [{ key: "sarees", state: "missing", configured: false, items: [] }] });
  assert.deepEqual(homepageSectionMode(snapshot, "sarees"), { mode: "hidden" });
});

test("the section gate: a backend that predates homepageContent reports unavailable, not a fallback render", () => {
  assert.deepEqual(homepageSectionMode({ homeStatus: "ready", home: {} }, "sarees"), { mode: "unavailable" });
});

test("the section gate: a failed or unknown content read is unavailable, not a blank or a guess", () => {
  const failed = ready({ status: "error", sections: [] });
  assert.deepEqual(homepageSectionMode(failed, "sarees"), { mode: "unavailable" });
  const wrongVersion = { homeStatus: "ready", home: { homepageContent: { version: 2, status: "ready", sections: [] } } };
  assert.deepEqual(homepageSectionMode(wrongVersion, "sarees"), { mode: "unavailable" });
  const absent = ready({ sections: [{ key: "sarees", state: "unavailable", configured: true, items: [] }] });
  assert.deepEqual(homepageSectionMode(absent, "sarees"), { mode: "unavailable" });
});

test("the section gate: a configured ready section is the only state that renders authored content", () => {
  const section = { key: "sarees", state: "ready", configured: true, items: [] };
  const result = homepageSectionMode(ready({ sections: [section] }), "sarees");
  assert.equal(result.mode, "configured");
  assert.equal(result.section, section);
});
