/**
 * PRATIKSHYA FASHION — PHASE 4 · storefront migration inventory (regression pins).
 *
 * Phase 4 asks which old-frontend customer routes the new storefront (the Aarna
 * port, `VITE_STOREFRONT_HOME=aarna`) answers, which it does not, and whether the
 * homepage's twelve sections agree with the backend's closed content contract.
 * These tests derive the answer from the source tree rather than from a
 * hand-written list, so the inventory cannot silently drift:
 *
 *   1. every customer path `App.jsx` declares (and every manifest path) is either
 *      served by the port's boundary, or is on the EXPLICIT production-remaining
 *      list below — and that list is exactly `/reset-password` (Phase 10 D1–D3);
 *   2. the staff portals are never claimed by the port;
 *   3. the four account screens that have not been redrawn yet (Phase 11 steps
 *      5–6) are still the production components, not silently ported or dropped;
 *   4. the homepage's eleven keyed sections match the backend's closed registry
 *      (`backend/app/schemas/media/homepage.py`), so no section can be rendered
 *      that the backend cannot store, and no stored section is never rendered;
 *   5. the section gate is a total, honest state machine: loading, unavailable
 *      (with retry), hidden for inactive/empty, legacy only for an unconfigured
 *      older backend, and ready only for a configured ready section.
 *
 * It does not prove pixels or a browser journey; see the Phase 4 report.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { routeManifest } from "../../../config/navigationConfig.js";
import {
  AARNA_INFO_PATHS,
  AARNA_PRODUCT_PATH,
  isAarnaAccountPath,
  isAarnaAuthPath,
  isAarnaCatchAllPath,
  isAarnaJourneyPath,
  isAarnaListingPath,
  isAarnaWishlistPath,
  isStaffPortalPath,
} from "../../../config/storefrontHome.js";
import { homepageSectionMode } from "../../storefront/home/homepageSectionModel.js";

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

/* The one customer route the port deliberately does not answer. Its production
   screen cannot complete a reset (Phase 10 §7, D1–D3). Removing it from this list
   is a decision that requires the reset flow to be fixed first. */
const PRODUCTION_REMAINING = ["/reset-password"];

/* The four account screens (Phase 12: now the port's own pages; production still
   serves the same paths from App.jsx).
   (`AarnaStorefront.jsx`), by route. Each is guarded by ProtectedRoute and renders
   the production component inside the port's shell. */
const PRODUCTION_ACCOUNT_SCREENS = {
  "account/settings": "AccountSettings",
  "account/security": "AccountSecurity",
  "account/preferences": "AccountPreferences",
  "account/instagram-rewards": "InstagramRewards",
};

/** Does the port's boundary (the same predicates `useAarnaStorefront` ORs) answer this path? */
function servedByPort(pathname) {
  const bare = pathname.replace(/\/+$/, "") || "/";
  if (bare === "/") return true;
  return Boolean(
    AARNA_PRODUCT_PATH.test(pathname) ||
      isAarnaListingPath(pathname) ||
      isAarnaWishlistPath(pathname) ||
      isAarnaJourneyPath(pathname) ||
      isAarnaAuthPath(pathname) ||
      isAarnaAccountPath(pathname) ||
      isAarnaCatchAllPath(pathname),
  );
}

/** Concrete sample values for `App.jsx` dynamic segments. */
function concrete(path) {
  return path.replace(/:([A-Za-z]+)/g, (_, name) => (name === "slug" ? "sample-slug" : "sample-id"));
}

/** Every customer path App.jsx declares, plus the manifest, as concrete URLs. */
function customerPaths() {
  const app = read("src/App.jsx");
  const declared = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p.startsWith("/") && p !== "*");
  const manifest = routeManifest.map((route) => route.path);
  const all = new Set(["/", ...declared, ...manifest].map((p) => p.replace(/\/+$/, "") || "/"));
  return [...all].filter((p) => !isStaffPortalPath(p)).map(concrete).sort();
}

test("every customer route is answered by the port, or is on the explicit production-remaining list", () => {
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

test("the production-remaining reset route is registered, so the catch-all cannot swallow it", () => {
  assert.equal(isAarnaCatchAllPath("/reset-password"), false);
  assert.equal(servedByPort("/reset-password"), false);
});

test("the staff portals are never claimed by the port's boundary", () => {
  for (const path of ["/login", "/admin", "/admin/products", "/super-admin/orders", "/employee", "/employee/orders"]) {
    assert.equal(isStaffPortalPath(path), true, `${path} is a staff portal`);
    assert.equal(isAarnaCatchAllPath(path), false, `${path} must not reach the port's catch-all`);
    assert.equal(servedByPort(path), false, `${path} must stay with its own portal`);
  }
});

test("the port's information pages are exactly the manifest's four", () => {
  assert.deepEqual([...AARNA_INFO_PATHS].sort(), ["/about", "/contact", "/privacy", "/terms"]);
});

test("the four Phase 12 account screens are the port's own pages, and production still serves the same paths", () => {
  const source = read("src/components/aarna/AarnaStorefront.jsx");
  const app = read("src/App.jsx");
  for (const [route, component] of Object.entries(PRODUCTION_ACCOUNT_SCREENS)) {
    /* The port mounts its own native page, statically imported — not production's lazy page. */
    assert.doesNotMatch(
      source,
      new RegExp(`const ${component} = lazy\\(`),
      `${component} must not be a production lazy import in the port`,
    );
    assert.match(source, new RegExp(`<Route path="${route}" element=\\{<${component} />\\} />`), `${route} must mount ${component}`);
    /* The application's own route is untouched: App.jsx still lazy-loads production's page. */
    assert.match(app, new RegExp(`const ${component} = lazy\\(\\(\\) => import\\("\\./pages/account/${component}"\\)\\)`), `App.jsx must still lazy-load ${component}`);
  }
});

test("the redrawn account screens render the port's own pages, not production", () => {
  const source = read("src/components/aarna/AarnaStorefront.jsx");
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
  const home = read("src/components/aarna/pages/Home.jsx");
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

test("the section gate: an unconfigured section on a current backend keeps the legacy render", () => {
  const snapshot = ready({ sections: [{ key: "sarees", state: "missing", configured: false, items: [] }] });
  assert.deepEqual(homepageSectionMode(snapshot, "sarees"), { mode: "legacy" });
});

test("the section gate: a backend that predates homepageContent keeps the legacy render, not an error", () => {
  assert.deepEqual(homepageSectionMode({ homeStatus: "ready", home: {} }, "sarees"), { mode: "legacy" });
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
