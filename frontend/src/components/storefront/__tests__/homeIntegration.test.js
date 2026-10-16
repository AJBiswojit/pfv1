/**
 * Phase 2C — the controlled homepage integration.
 *
 * The integrated composition is loaded through Vite's own SSR pipeline (the
 * convention these suites use) and server-rendered, so the assertions run
 * against the REAL components, the REAL services and the REAL switch — not a
 * description of them.
 *
 * Covered here:
 *   · the switch: off by default, dev-only URL review, build-time flag,
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

test("the homepage switch is OFF by default, in every combination that is not an explicit request", () => {
  const { resolveStorefrontHome, STOREFRONT_HOME } = modules.switch;
  const atelier = STOREFRONT_HOME.atelier;

  /* Nothing asked for it. */
  assert.equal(resolveStorefrontHome(), atelier);
  assert.equal(resolveStorefrontHome({ dev: true }), atelier);
  assert.equal(resolveStorefrontHome({ dev: true, envValue: "" }), atelier);
  assert.equal(resolveStorefrontHome({ dev: true, envValue: "yes" }), atelier);

  /* Something asked for it, but not in a recognised way. */
  for (const search of ["?home=", "?home=next", "?home=editorial ", "?home=EDITORIAL", "?other=editorial", "?home"]) {
    assert.equal(resolveStorefrontHome({ dev: true, search }), atelier, `${search} must not enable the new homepage`);
  }
});

test("the switch asks for the integrated homepage only in the two documented ways", () => {
  const { resolveStorefrontHome, STOREFRONT_HOME } = modules.switch;
  const { atelier, editorial } = STOREFRONT_HOME;

  /* A local review URL (development builds only). */
  assert.equal(resolveStorefrontHome({ dev: true, search: "?home=editorial" }), editorial);

  /* The build-time variable (dev and deployed builds alike). */
  assert.equal(resolveStorefrontHome({ dev: true, envValue: editorial }), editorial);
  assert.equal(resolveStorefrontHome({ dev: false, envValue: editorial }), editorial);

  /* The escape hatch wins over the environment, so a review can always go back. */
  assert.equal(resolveStorefrontHome({ dev: true, envValue: editorial, search: "?home=atelier" }), atelier);

  /* A customer editing the URL of a deployed build cannot move the homepage. */
  assert.equal(resolveStorefrontHome({ dev: false, search: "?home=editorial" }), atelier);
  assert.equal(resolveStorefrontHome({ dev: false, envValue: "", search: "?home=editorial" }), atelier);
});

test("the live switch reads the browser URL through the development gate only", () => {
  const { storefrontHomeChoice, STOREFRONT_HOME, STOREFRONT_HOME_PARAM } = modules.switch;

  /* Vite's SSR pipeline runs this module as a development build, with no
     window: the homepage is the default one. */
  assert.equal(storefrontHomeChoice(), STOREFRONT_HOME.atelier);

  /* The reviewer's URL param, in that development build. */
  const withSearch = (search) => {
    const previous = globalThis.window;
    globalThis.window = { location: { search } };
    try {
      return storefrontHomeChoice();
    } finally {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    }
  };
  assert.equal(withSearch(`?${STOREFRONT_HOME_PARAM}=editorial`), STOREFRONT_HOME.editorial);
  assert.equal(withSearch(`?${STOREFRONT_HOME_PARAM}=atelier`), STOREFRONT_HOME.atelier);
  assert.equal(withSearch("?view=home&data=fixture"), STOREFRONT_HOME.atelier);

  /* The gate itself must be in the module, not only in the callers. */
  const source = read(SWITCH);
  assert.match(source, /import\.meta\.env\.DEV/);
  assert.match(source, /VITE_STOREFRONT_HOME|STOREFRONT_HOME_VAR/);
});

/* ── where it mounts, and what it replaces ───────────────────────────── */

test("the composition is mounted at the customer root only, by the customer layout alone", () => {
  const importers = sourceFiles()
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => importsModule(file, "src/components/storefront/StorefrontHome"));

  assert.deepEqual(importers, [LAYOUT], "only CustomerLayout may mount the integrated homepage");

  const layout = read(LAYOUT);
  /* The gate is the switch AND the root path — every other customer route keeps
     the shell it has today. */
  assert.match(layout, /useEditorialHome/);
  assert.match(read(SWITCH), /pathname === STOREFRONT_HOME_PATH/);
  assert.match(layout, /editorialHome \? \(/);
  assert.equal(countOf(layout, /<StorefrontHome \/>/g), 1, "the composition is mounted once");
  assert.match(layout, /\{!editorialHome &&/);
});

test("the existing AtelierDesign homepage stays the fallback and the rollback", () => {
  const app = read("src/App.jsx");
  /* The root route is untouched: with the switch off (the default) the layout
     renders the outlet, which is still the reviewed homepage. */
  assert.match(app, /<Route index element=\{<AtelierDesign \/>\} \/>/);
  assert.equal(app.includes("StorefrontHome"), false);
  assert.equal(app.includes("storefrontHome"), false);

  const layout = read(LAYOUT);
  assert.match(layout, /<Outlet \/>/, "the routed page still renders when the switch is off");
  assert.match(layout, /<SiteHeader counts=\{counts\} onOpenCart=\{cart\.openDrawer\} \/>/);
});

test("the root route is resolved through the switch, not by editing the route table", () => {
  const probe = React.createElement(function Probe() {
    return React.createElement("span", null, modules.switch.useEditorialHome() ? "editorial" : "atelier");
  });

  /* No window, no flag: the layout takes the routed page. */
  return (async () => {
    const html = await render(probe);
    assert.equal(html.includes("atelier"), true);
    assert.equal(html.includes("editorial"), false);
  })();
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
  /* The switch is referenced by the customer layout, and by the production
     account shell, which reads it to drop its own chrome when a production
     account page is mounted inside the Aarna storefront (`AccountShell.jsx`,
     the Phase 11 boundary). No other file may read it. */
  const ACCOUNT_SHELL = "src/components/account/AccountShell.jsx";
  const switchImporters = sourceFiles()
    .filter((file) => !file.includes("__tests__"))
    .filter((file) => importsModule(file, "src/config/storefrontHome"))
    .sort();
  assert.deepEqual(switchImporters, [ACCOUNT_SHELL, LAYOUT].sort());

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

  const AtelierDesign = (await vite.ssrLoadModule("/src/pages/AtelierDesign.jsx")).default;
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
              h(
                Route,
                { element: h(CustomerLayout) },
                h(Route, { index: true, element: h(AtelierDesign) })
              )
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

test("with the switch off the customer root renders the existing homepage and its existing shell", async () => {
  const html = await renderLayout({ search: "" });

  /* The application's own header and its offset are what the customer sees. */
  assert.match(html, /fixed top-0 left-0 right-0 z-50/, "the existing header");
  assert.match(html, /pt-16 md:pt-20/, "its existing offset");
  assert.equal(html.includes("data-storefront-header"), false, "the 2A header must not be mounted");
  assert.equal(html.includes("pf-sec-host"), false, "the 2B sections must not be mounted");
  assert.equal(html.includes("data-home-surface"), false);

  /* The existing footer is still there, once. */
  assert.equal(countOf(html, /<footer/g), 1);
});

test("with a local-review URL the customer root renders the integrated homepage, once, over the same footer", async () => {
  const html = await renderLayout({ search: "?home=editorial" });

  /* Exactly one header, and it is the approved one. */
  assert.equal(countOf(html, /data-storefront-header/g), 1, "one 2A header");
  assert.equal(html.includes("fixed top-0 left-0 right-0 z-50"), false, "the previous header must not also render");
  assert.equal(html.includes("pt-16 md:pt-20"), false, "no offset for a header that is not there");
  assert.equal(html.includes("pf-shell__header"), true);

  /* The composition, its campaign canvas, and the existing footer exactly once. */
  assert.match(html, /data-home-surface="live"/);
  assert.match(html, /pf-shell__surface/);
  assert.match(html, /pf-sec-host/);
  assert.equal(countOf(html, /<footer/g), 1, "one existing footer");
  assert.equal(countOf(html, /id="preview-root"/g), 0, "the dev harness document is not involved");

  /* The routed page is not ALSO rendered behind the composition. */
  assert.equal(html.includes('aria-label="PRATIKSHYA FASHION featured collections"'), false);
});

test("the switch is the only difference between the two renders — same services, same footer, same providers", async () => {
  const [off, on] = await Promise.all([renderLayout({ search: "" }), renderLayout({ search: "?home=editorial" })]);

  /* Both are one customer page: one footer, one shopping context, no second app. */
  for (const html of [off, on]) {
    assert.equal(countOf(html, /<footer/g), 1, "one footer in both states");
    assert.equal(html.includes("MemoryRouter"), false);
  }

  /* The rollback is a URL, and it needs no rebuild: the same module renders both. */
  const layout = read(LAYOUT);
  assert.match(layout, /useEditorialHome\(\)/);
  assert.match(layout, /editorialHome \? "flex-1" : "flex-1 pt-16 md:pt-20"/);
});
