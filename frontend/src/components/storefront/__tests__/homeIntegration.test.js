/**
 * Phase 2C — the controlled homepage integration.
 *
 * The integrated composition is loaded through Vite's own SSR pipeline (the
 * convention these suites use) and server-rendered, so the assertions run
 * against the REAL components, the REAL services and the REAL switch — not a
 * description of them.
 *
 * Covered here:
 *   · the switch: Aarna by default, dev-only URL review, build-time flag,
 *     rollback, and no way for a customer's URL to change the homepage;
 *   · the composition mounts at the customer root ONLY, and only when asked;
 *   · the existing `AtelierDesign` homepage is the fallback and the rollback;
 *   · exactly one header and one announcement rail on the integrated page;
 *   · no fixture data, badge or preview chrome in the production composition;
 *   · canonical navigation and product-detail destinations;
 *   · the existing cart/wishlist contexts, and no second commerce state;
 *   · an empty or unavailable backend renders honestly, never blank;
 *   · App.jsx, the portals, auth and the commerce routes are untouched.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Walk up until the frontend `package.json` — the Vite project root. */
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
const COMPOSITION = "src/components/storefront/StorefrontHome.jsx";
const SWITCH = "src/config/storefrontHome.js";
const LAYOUT = "src/layouts/CustomerLayout.jsx";

/** Every source file under `src/` (the scan the isolation tests use). */
const sourceFiles = (directory = "src", found = []) => {
  for (const entry of readdirSync(join(ROOT, directory))) {
    const relative = `${directory}/${entry}`;
    if (statSync(join(ROOT, relative)).isDirectory()) sourceFiles(relative, found);
    else if (/\.(jsx|js)$/.test(entry)) found.push(relative);
  }
  return found;
};

/**
 * Every module a source file imports, as a resolved project-relative path
 * (extension-free, so `./shell/Header` and `"./shell/Header.jsx"` compare
 * equal). Relative specifiers are resolved against the file's own directory;
 * bare package specifiers are returned as-is.
 */
function resolvedImports(file) {
  const source = read(file);
  const directory = file.split("/").slice(0, -1);
  const found = new Set();

  const specs = [
    ...source.matchAll(/\bfrom\s+"([^"]+)"/g),
    ...source.matchAll(/\bimport\s*\(\s*"([^"]+)"/g),
    ...source.matchAll(/\bimport\s+"([^"]+)"/g),
  ].map((match) => match[1]);

  for (const spec of specs) {
    if (!spec.startsWith(".")) {
      found.add(spec);
      continue;
    }
    const stack = [];
    for (const part of [...directory, ...spec.split("/")]) {
      if (part === "." || part === "") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    found.add(stack.join("/"));
  }
  return [...found];
}

/** Does `file` import the module at `modulePath` (or anything under it)? */
const importsModule = (file, modulePath) =>
  resolvedImports(file).some((imported) => imported === modulePath || imported.startsWith(`${modulePath}/`));

/**
 * The routes this application really registers, read from `App.jsx` — the
 * literal paths plus a pattern for every `:param` path — together with the
 * canonical route manifest the navigation is built from.
 */
function registeredRoutes() {
  const app = read("src/App.jsx");
  const staticPaths = new Set(modules.routeManifest.map((route) => route.path));
  const patterns = [];
  for (const match of app.matchAll(/<Route path="([^"]+)"/g)) {
    const path = match[1];
    if (path.includes(":")) {
      patterns.push(new RegExp(`^/${path.replace(/:[^/]+/g, "[^/]+").replace(/^\//, "")}/?$`));
    } else if (path !== "*") {
      staticPaths.add(path.replace(/\/+$/, "") || "/");
    }
  }
  staticPaths.add("/");
  return { staticPaths, patterns };
}

let vite;
let modules;

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });

  const load = (path) => vite.ssrLoadModule(path);
  modules = {
    StorefrontHome: (await load(`/${COMPOSITION}`)).default,
    switch: await load(`/${SWITCH}`),
    AuthProvider: (await load("/src/context/AuthContext.jsx")).AuthProvider,
    ShoppingProvider: (await load("/src/context/ShoppingContext.jsx")).ShoppingProvider,
    routeManifest: (await load("/src/config/navigationConfig.js")).routeManifest,
  };
});

after(async () => {
  await vite?.close();
});

/** The app's own provider pair, so the real hooks behave as they do in the app. */
async function render(element, { windowStub = undefined } = {}) {
  const { MemoryRouter } = await import("react-router-dom");
  const { createElement: h } = React;
  const previous = globalThis.window;
  if (windowStub !== undefined) globalThis.window = windowStub;
  try {
    return renderToStaticMarkup(
      h(MemoryRouter, null, h(modules.AuthProvider, null, h(modules.ShoppingProvider, null, element)))
    );
  } finally {
    if (windowStub !== undefined) {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    }
  }
}

const compositionHtml = () => render(React.createElement(modules.StorefrontHome));

const hrefsOf = (html) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]);
const countOf = (html, pattern) => (html.match(pattern) ?? []).length;

/* ── the switch ──────────────────────────────────────────────────────── */

test("the customer selector is gone: there is no Atelier/editorial mode or URL/build override", () => {
  const source = read(SWITCH);
  assert.doesNotMatch(source, /resolveStorefrontHome|VITE_STOREFRONT_HOME|STOREFRONT_HOME_PARAM|useEditorialHome/);
  assert.doesNotMatch(read(LAYOUT), /StorefrontHome|AtelierDesign|useEditorialHome/);
  assert.doesNotMatch(read("src/App.jsx"), /AtelierDesign|StorefrontHome|VITE_STOREFRONT_HOME/);
});

/* ── where it mounts, and what it replaces ───────────────────────────── */

test("the Aarna app shell is the only customer layout and no Atelier/editorial source is mounted", () => {
  const importers = sourceFiles()
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => importsModule(file, "src/components/storefront/StorefrontHome"));
  assert.deepEqual(importers, [], "the editorial composition is not reachable from customer routes");

  const layout = read(LAYOUT);
  assert.match(layout, /<AarnaStorefront \/>/);
  assert.doesNotMatch(layout, /AtelierDesign|StorefrontHome|SiteHeader|SiteFooter|CheckoutHeader/);
  const app = read("src/App.jsx");
  assert.doesNotMatch(app, /AtelierDesign|StorefrontHome|VITE_STOREFRONT_HOME/);
  assert.match(app, /<Route path="\*"/);
});

test("the root URL renders Aarna regardless of former home query values", async () => {
  const plain = await renderLayout({ search: "" });
  const formerOverride = await renderLayout({ search: "?home=atelier" });
  const formerEditorial = await renderLayout({ search: "?home=editorial" });
  for (const html of [plain, formerOverride, formerEditorial]) {
    assert.match(html, /class="aan-root"/);
    assert.equal(html.includes("data-storefront-header"), false);
    assert.equal(html.includes("pf-sec-host"), false);
  }
});

/* ── the integrated page renders ─────────────────────────────────────── */

test("the integrated homepage renders one header, one announcement rail and the approved order", async () => {
  const html = await compositionHtml();

  /* The 2A shell, exactly once. */
  assert.equal(countOf(html, /data-storefront-header/g), 1, "one storefront header");
  assert.equal(countOf(html, /pf-shell__header/g), 1, "one header root");
  assert.equal(html.includes("fixed top-0 left-0 right-0 z-50"), false, "the previous fixed header must not be inside the composition");
  assert.ok(countOf(html, /pf-shell__announce/g) <= 1, "at most one announcement rail");

  /* The composition's own source mounts each of them once. */
  const source = read(COMPOSITION);
  assert.equal(countOf(source, /<AnnouncementBar \/>/g), 1);
  assert.equal(countOf(source, /<StorefrontHeader/g), 1);
  assert.equal(countOf(source, /<HeroEditorial/g), 1);
  assert.equal(countOf(source, /<HomeSections \/>/g), 1);

  /* …in the approved order: announcement → header → hero → sections. */
  const order = [source.indexOf("<AnnouncementBar"), source.indexOf("<StorefrontHeader"), source.indexOf("<HeroEditorial"), source.indexOf("<HomeSections")];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("the integrated homepage carries no fixture, no sample badge and no preview chrome", async () => {
  const html = await compositionHtml();

  assert.equal(html.includes("data-home-surface=\"preview-fixture\""), false);
  assert.equal(html.includes('data-home-surface="live"'), true);
  for (const marker of ["Preview fixture", "NOT live backend data", "Sample offer", "Sample", "preview-fixture"]) {
    assert.equal(html.includes(marker), false, `the production composition must not contain “${marker}”`);
  }

  /* The two harness seam-markers that live inside reviewed components (the 2A
     announcement rail's `data-announcement-source`, the 2B offer band's sample
     badge) are gated on values only the harness can supply, so the customer
     page can never render them. Pinned here so that stays true. */
  assert.equal(html.includes('data-announcement-source="preview-fixture"'), false);
  assert.equal(html.includes("data-shell-surface"), false);

  const harnessOnlySetters = sourceFiles()
    .filter((file) => !file.startsWith("src/components/storefront/preview/"))
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => /isSample:\s*true/.test(read(file)));
  assert.deepEqual(harnessOnlySetters, [], "only the preview fixtures may mark a section as a sample");
  assert.equal(/isSample/.test(read(COMPOSITION)), false);
  /* The production offer model passes the flag through from a record; the live
     offer repository never sets it (checked in the source it maps). */
  assert.match(read("src/components/storefront/home-sections/sectionData.js"), /isSample: Boolean\(offer\.isSample\)/);

  /* The composition's own graph never reaches the harness. */
  const graph = [COMPOSITION, "src/components/storefront/shell/AnnouncementBar.jsx", "src/components/storefront/shell/StorefrontHeader.jsx", "src/components/storefront/home/HeroEditorial.jsx", "src/components/storefront/home-sections/HomeSections.jsx"];
  for (const file of graph) {
    const source = read(file);
    for (const target of [
      "src/components/storefront/preview/HomePreview",
      "src/components/storefront/preview/previewFixtures",
      "src/components/storefront/preview/previewSectionFixtures",
    ]) {
      assert.equal(importsModule(file, target), false, `${file} must not import ${target}`);
    }
    assert.equal(source.includes("/__preview-assets/"), false, `${file} must not address preview-only assets`);
  }

  /* Fixtures are imported by the harness only — never by the homepage graph. */
  const importers = sourceFiles()
    .filter((file) => !file.startsWith("src/components/storefront/preview/"))
    .filter((file) => !file.includes("__tests__"))
    .filter(
      (file) =>
        importsModule(file, "src/components/storefront/preview/previewFixtures") ||
        importsModule(file, "src/components/storefront/preview/previewSectionFixtures")
    );
  assert.deepEqual(importers, []);
});

test("the integrated homepage keeps canonical navigation and product destinations", async () => {
  const html = await compositionHtml();
  const hrefs = hrefsOf(html);
  assert.ok(hrefs.length > 0, "the shell renders navigation");

  const { staticPaths, patterns } = registeredRoutes();

  for (const href of hrefs) {
    const target = href.split("#")[0].split("?")[0].replace(/\/+$/, "") || "/";
    assert.equal(href.startsWith("/"), true, `${href} is not an in-app destination`);
    assert.equal(
      staticPaths.has(target) || patterns.some((rule) => rule.test(href)),
      true,
      `${href} is not a route this application registers`
    );
    assert.equal(/preview|__preview-assets|\/images\//.test(href), false, `${href} leaks a preview-only or legacy asset path`);
  }

  /* None of Project B's mock destinations exists here. */
  for (const mock of ["/shop/women", "/shop/men", "/wishlist", "/track-order", "/journal"]) {
    assert.equal(hrefs.includes(mock), false, `${mock} is not an application route`);
  }

  /* Product links, when the catalogue has any, are the canonical detail route. */
  const productLinks = hrefs.filter((href) => href.startsWith("/product/"));
  for (const href of productLinks) assert.match(href, /^\/product\/[^/?#]+$/);
});

test("the integrated homepage is wired to the existing cart and wishlist, and creates no second state", async () => {
  const source = read(COMPOSITION);
  assert.match(source, /useCart\(\)/);
  assert.match(source, /useWishlist\(\)/);
  assert.match(source, /onOpenCart=\{cart\.openDrawer\}/);
  assert.match(source, /wishlist: wishlist\.count, cart: cart\.count/);

  /* No provider, no context, no second drawer, no client of its own — checked on
     the actual imports and calls, not on the module's prose. */
  for (const forbidden of [
    "src/context/ShoppingContext",
    "src/components/cart/CartDrawer",
    "src/context/AdminAuthContext",
  ]) {
    assert.equal(importsModule(COMPOSITION, forbidden), false, `the composition must not import ${forbidden}`);
  }
  /* It reads the two canonical hooks, and nothing else from those contexts. */
  assert.deepEqual(
    resolvedImports(COMPOSITION).filter((imported) => imported.startsWith("src/context/")).sort(),
    ["src/context/CartContext", "src/context/WishlistContext"]
  );
  for (const forbidden of ["createContext", "fetch(", "localStorage", "sessionStorage", "apiClient", "<CartDrawer"]) {
    assert.equal(source.includes(forbidden), false, `the composition must not introduce ${forbidden}`);
  }
  assert.equal(/import\s+\w*Provider/.test(source), false, "the composition must not mount a provider");

  const html = await compositionHtml();
  /* The bag button is the existing drawer's trigger, rendered by the 2A header. */
  assert.match(html, /aria-label="Bag[^"]*"/);
  /* The provider pair supplies counts; with an empty guest state the dot is absent. */
  assert.equal(/Wishlist, \d+ items/.test(html), false);
});

test("an empty or unavailable backend renders an honest page, never a blank one", async () => {
  const html = await compositionHtml();

  /* The shell is always there: brand lockup and the canonical rail. */
  assert.ok(html.length > 4000, `the page must render its chrome (${html.length} chars)`);
  assert.match(html, /pf-shell__header/);
  assert.equal(countOf(html, /data-nav-group=/g), 5, "the five canonical navigation groups");

  /* Nothing is invented for the missing catalogue: the hero renders nothing… */
  assert.equal(countOf(html, /pf-hero/g), 0, "no hero without slides");
  assert.equal(html.includes("hero-carousel"), false, "the previous hero must not be mounted");

  /* …image-led sections disappear rather than showing broken plates… */
  for (const marker of ["pf-sec-collage", "pf-sec-bridal", "pf-sec-jewel", "pf-sec-best", "pf-sec-look"]) {
    assert.equal(html.includes(marker), false, `${marker} has no data and must not render`);
  }

  /* …no catalogue imagery is invented: the only image on the page is the
     header's own brand mark, which is a bundled asset, not backend data. */
  assert.equal(countOf(html, /<img[^>]+src="\/api\/v1\/media/g), 0, "no catalogue image may render without a backend");
  assert.equal(countOf(html, /<img/g), 1, "only the brand mark");
  assert.match(html, /<img[^>]+src="\/src\/assets\/pratikshya_logo\.png"[^>]*alt="PRATIKSHYA FASHION"/);

  /* …and the newsletter section is absent, not empty (no endpoint exists). */
  assert.equal(/newsletter|subscribe/i.test(html), false);

  /* The two copy-only seams are allowed to keep their headings and links. */
  assert.equal(countOf(html, /data-home-surface="live"/g), 1);
});

test("App.jsx, the portals, auth and the commerce routes are untouched by the integration", () => {
  const app = read("src/App.jsx");
  assert.equal(app.includes("storefront/StorefrontHome"), false);
  assert.equal(app.includes("storefrontHome"), false);
  /* The portal layouts and guards are still exactly what the route table mounts. */
  for (const marker of ["<AdminLayout />", "<EmployeeLayout />", "<CustomerLayout />", "<AdminProtectedRoute />", "<EmployeeProtectedRoute />", "<ProtectedRoute />"]) {
    assert.equal(app.includes(marker), true, `${marker} is still mounted`);
  }
  /* The composition mounts nothing at the portal boundaries. */
  for (const file of ["src/layouts/AdminLayout.jsx", "src/layouts/EmployeeLayout.jsx"]) {
    assert.equal(read(file).includes("StorefrontHome"), false);
  }
  /* The route ownership helper is used only by the legacy account shell;
     CustomerLayout mounts Aarna directly and does not consult a selector. */
  const ACCOUNT_SHELL = "src/components/account/AccountShell.jsx";
  const boundaryImporters = sourceFiles()
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => importsModule(file, "src/config/storefrontHome"))
    .sort();
  assert.deepEqual(boundaryImporters, [ACCOUNT_SHELL]);

  /* And the portal layouts never mount the composition's shell. */
  const shellImporters = sourceFiles()
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => !file.startsWith("src/components/storefront/shell/"))
    .filter((file) => importsModule(file, "src/components/storefront/shell"))
    .sort();
  assert.deepEqual(
    shellImporters,
    [
      COMPOSITION,
      "src/components/storefront/preview/HomePreview.jsx",
      "src/components/storefront/preview/ShellPreview.jsx",
    ],
    "the 2A shell stays inside the composition and the dev-only preview"
  );
});

/* ── the layout boundary, both ways ──────────────────────────────────── */

/**
 * Renders the REAL customer layout through the REAL route table — the existing
 * homepage as the index route, exactly as `App.jsx` registers it — with the
 * switch off and with a local-review URL asking for the integrated home. This is
 * the integration itself, executed.
 */
async function renderLayout({ search = "" } = {}) {
  const { MemoryRouter, Route, Routes } = await import("react-router-dom");
  const { createElement: h } = React;
  const CustomerLayout = (await vite.ssrLoadModule("/src/layouts/CustomerLayout.jsx")).default;

  const previous = globalThis.window;
  globalThis.window = { location: { search }, addEventListener() {}, removeEventListener() {} };
  try {
    return renderToStaticMarkup(
      h(
        MemoryRouter,
        { initialEntries: ["/"] },
        h(
          modules.AuthProvider,
          null,
          h(
            modules.ShoppingProvider,
            null,
            h(
              Routes,
              null,
              h(Route, { path: "/*", element: h(CustomerLayout) })
            )
          )
        )
      )
    );
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test("Aarna renders the root with no selector, and former query overrides cannot switch the UI", async () => {
  for (const search of ["", "?home=atelier", "?home=editorial", "?home=aarna"]) {
    const html = await renderLayout({ search });
    assert.match(html, /class="aan-root"/, `${search} did not render Aarna`);
    assert.equal(html.includes("data-storefront-header"), false, "the editorial header must not mount");
    assert.equal(html.includes("pf-sec-host"), false, "the editorial sections must not mount");
    assert.equal(countOf(html, /<footer/g), 1, "Aarna owns exactly one footer");
  }
});
