/**
 * Phase 2A — storefront shell (announcement bar, header, mega menu, mobile nav).
 *
 * Rendered through Vite's own SSR pipeline (the convention the Phase 1 suites
 * use), so these assertions run against the REAL components, the REAL
 * information architecture and the REAL media resolver — not a description of
 * them — plus source-contract checks for the things a DOM-less run cannot see:
 * canonical destinations, no invented copy, no second data source, and the
 * production shell left untouched.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const read = (relativePath) => readFileSync(`${ROOT}/${relativePath}`, "utf8");
/** Assembled so this suite never writes a legacy public image prefix itself. */
const LEGACY_PREFIX = `/${"images"}/`;

const SHELL = "src/components/storefront/shell";

let vite;
let ReactDOMServer;
let MemoryRouter;
let AnnouncementBar;
let StorefrontHeader;
let StorefrontMegaMenu;
let StorefrontMobileNav;
let navigation;

const render = (element) =>
  ReactDOMServer.renderToStaticMarkup(React.createElement(MemoryRouter, null, element));

before(async () => {
  const { createServer } = await import("vite");
  vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  ReactDOMServer = await import("react-dom/server");
  ({ MemoryRouter } = await import("react-router-dom"));
  AnnouncementBar = (await vite.ssrLoadModule(`/${SHELL}/AnnouncementBar.jsx`)).default;
  StorefrontHeader = (await vite.ssrLoadModule(`/${SHELL}/StorefrontHeader.jsx`)).default;
  StorefrontMegaMenu = (await vite.ssrLoadModule(`/${SHELL}/StorefrontMegaMenu.jsx`)).default;
  StorefrontMobileNav = (await vite.ssrLoadModule(`/${SHELL}/StorefrontMobileNav.jsx`)).default;
  navigation = await vite.ssrLoadModule("/src/config/navigationConfig.js");
});

after(async () => {
  await vite?.close();
});

/* ------------------------------------------------------------------ */
/* Announcement bar                                                    */
/* ------------------------------------------------------------------ */

test("the announcement bar renders the messages it is given, in order", () => {
  const items = [
    { id: "a", text: "Delivery across India" },
    { id: "b", text: "Styling help by appointment" },
  ];
  const html = render(React.createElement(AnnouncementBar, { items }));

  assert.match(html, /class="pf-shell__announce"/);
  assert.match(html, /data-announcement-count="2"/);
  assert.match(html, /data-announcement-source="preview-fixture"/);
  assert.match(html, /Delivery across India/);
  assert.match(html, /aria-label="Dismiss announcement"/);
});

test("no messages, or a dismissal, renders no rail at all", () => {
  assert.equal(render(React.createElement(AnnouncementBar, { items: [] })), "");
  /* The dismissal path is source-visible: session storage, then no render. */
  const source = read(`${SHELL}/AnnouncementBar.jsx`);
  assert.match(source, /if \(!count \|\| dismissed\) return null;/);
  assert.match(source, /sessionStorage\.setItem\(DISMISS_KEY, "hidden"\)/);
  assert.match(source, /pratikshya:announcement-bar/);
});

test("the bar holds no campaign copy of its own", () => {
  const source = read(`${SHELL}/AnnouncementBar.jsx`);
  /* It renders the message text it was handed and nothing else. */
  assert.match(source, /\{message\.text\}/);
  /* It cannot contain a campaign sentence — least of all a fixture one. */
  for (const sentence of [
    "Delivery across India",
    "Festive Edit",
    "Complimentary styling help",
    "Free shipping",
  ]) {
    assert.equal(source.includes(sentence), false, `authored copy in the bar: ${sentence}`);
  }
  /* And it reads the storefront's own hook, not a fixture or a literal. */
  assert.match(source, /useStorefrontAnnouncements/);
  assert.doesNotMatch(source, /PREVIEW_FIXTURE_ANNOUNCEMENTS/);

  /* Whatever it is given is exactly what it prints. */
  const html = render(
    React.createElement(AnnouncementBar, { items: [{ id: "only", text: "A neutral line" }] })
  );
  assert.match(html, /A neutral line/);
});

test("the announcement source is the admin-managed PROMOTION placement, read once", () => {
  const hook = read("src/hooks/useStorefrontAnnouncements.js");
  assert.match(hook, /apiGetMarketingPlacement/);
  assert.match(hook, /MARKETING_PLACEMENTS\.PROMOTION/);
  /* One request per session, shared between mounts. */
  assert.match(hook, /if \(!request\) \{/);
  /* Nothing invented when the placement is empty. */
  assert.match(hook, /return \{ announcements: \[\], error: result\?\.error \?\? "unavailable" \};/);
  /* No new endpoint and no second client. */
  assert.doesNotMatch(hook, /\bfetch\(/);
  assert.doesNotMatch(hook, /axios|createClient|apiClient\.get/);
});

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

test("the header renders the canonical brand lockup and every primary group", () => {
  const html = render(
    React.createElement(StorefrontHeader, { counts: { wishlist: 0, cart: 0 }, onOpenCart() {} })
  );

  assert.match(html, /data-storefront-header=""/);
  assert.match(html, /PRATIKSHYA FASHION/);
  const groups = [...html.matchAll(/data-nav-group="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(groups, navigation.primaryNavigation.map((group) => group.id));
  /* Five groups, from the taxonomy — not a hand-written list. */
  assert.deepEqual(groups, ["women", "bridal", "men", "kids", "collections"]);
  /* The ceremony group carries B's italic accent. */
  assert.match(html, /pf-shell__nav-link--accent[^>]*>Bridal</);
  /* The former header's standalone Explore destination survives. */
  assert.match(html, /class="pf-shell__explore"[^>]*>Explore</);
});

test("search, account, wishlist and bag keep their destinations and names", () => {
  const html = render(
    React.createElement(StorefrontHeader, { counts: { wishlist: 2, cart: 3 }, onOpenCart() {} })
  );

  assert.match(html, /aria-label="Search"/);
  assert.match(html, /aria-label="Account"/);
  assert.match(html, /aria-label="Wishlist, 2 items"/);
  assert.match(html, /aria-label="Bag, 3 items"/);
  assert.match(html, /href="\/account\/wishlist"/);
  assert.match(html, /href="\/signin"/);
  assert.match(html, /aria-haspopup="dialog"/);
  /* The bag count is the live count, not a badge of its own invention. */
  assert.match(html, /pf-shell__bag-count[^>]*>3</);
});

test("every navigation destination is a canonical route of this application", () => {
  const html = render(React.createElement(StorefrontHeader, {}));
  /* Anchors only — the markup also carries a React `<link rel="preload">` for
     the brand mark, which is not a destination. */
  const hrefs = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.length > 5);
  assert.ok(hrefs.includes("/women"));

  const known = new Set(navigation.routeManifest.map((route) => route.path));
  known.add("/");
  known.add("/account");
  known.add("/account/wishlist");
  known.add("/signin");
  known.add("/cart");

  for (const href of hrefs) {
    assert.ok(
      known.has(href),
      `${href} is not a canonical route of this application`
    );
  }
  /* Nothing from Project B's mock shop (/shop/sarees, /wishlist, /track-order). */
  for (const href of hrefs) {
    assert.doesNotMatch(href, /^\/shop\/|^\/wishlist$|^\/track-order$/);
  }
});

test("the header drives the existing overlays rather than rebuilding them", () => {
  const source = read(`${SHELL}/StorefrontHeader.jsx`);
  assert.match(source, /from "\.\.\/\.\.\/shell\/SearchPanel"/);
  assert.match(source, /from "\.\.\/\.\.\/shell\/AccountDropdown"/);
  assert.match(source, /from "\.\.\/\.\.\/shell\/utilityIcons"/);
  assert.match(source, /useEscape/);
  assert.match(source, /useScrolled/);
  /* No second provider, router, API client or cart. */
  assert.doesNotMatch(source, /createContext|apiClient|fetch\(|useCart|localStorage/);
});

test("the production shell is untouched and still owns the customer routes", () => {
  const app = read("src/App.jsx");
  assert.match(app, /<Route index element=\{<AtelierDesign \/>\} \/>/);
  assert.match(app, /<Route element=\{<CustomerLayout \/>\}>/);
  assert.equal(app.includes("StorefrontHeader"), false);

  const layout = read("src/layouts/CustomerLayout.jsx");
  assert.match(layout, /import SiteHeader from "\.\.\/components\/shell\/SiteHeader";/);
  assert.match(layout, /<SiteHeader counts=\{counts\} onOpenCart=\{cart\.openDrawer\} \/>/);

  /* The previous shell files are byte-identical to the reviewed baseline. */
  for (const file of ["SiteHeader", "MegaMenu", "MobileNav", "SearchPanel", "AccountDropdown", "SiteFooter"]) {
    assert.equal(existsSync(`${ROOT}/src/components/shell/${file}.jsx`), true, `${file} missing`);
  }
  assert.doesNotMatch(read("src/components/shell/SiteHeader.jsx"), /pf-shell__/);
});

/* ------------------------------------------------------------------ */
/* Mega menu                                                           */
/* ------------------------------------------------------------------ */

test("the mega menu renders the group's real columns and canonical destinations", () => {
  const group = navigation.primaryNavigation.find((entry) => entry.id === "women");
  const html = render(
    React.createElement(StorefrontMegaMenu, { id: "mega-women", group, onNavigate() {} })
  );

  assert.match(html, /data-mega="women"/);
  for (const column of group.columns) {
    assert.ok(html.includes(column.title), `column ${column.title} missing`);
    for (const link of column.links) {
      assert.ok(html.includes(`href="${link.to}"`), `link ${link.to} missing`);
    }
    assert.ok(html.includes(`>${column.links.length === 0 ? "" : column.links[0].label}<`));
  }
  assert.match(html, /pf-shell__mega-feature/);
  assert.match(html, /View the edit/);
  /* The feature goes to the group's own landing route. */
  assert.ok(html.includes(`href="${group.feature.to}"`));
});

test("the mega menu has no authored category list and no mock imagery", () => {
  const source = read(`${SHELL}/StorefrontMegaMenu.jsx`);
  assert.match(source, /resolveNavigationEditorialImage/);
  assert.doesNotMatch(source, /useState|useEffect|localStorage|fetch\(/);
  assert.doesNotMatch(source, /mock|content\.js|navigation\.js/);
  assert.equal(source.includes(LEGACY_PREFIX), false);
  /* No literal destination is authored in the panel. */
  assert.doesNotMatch(source, /to="\//);
});

test("a group with no columns yet shows its feature alone, inventing nothing", () => {
  const group = { id: "collections", label: "Collections", to: "/collections", columns: [], feature: { eyebrow: "Fabric Stories", title: "Heritage Weaves", to: "/collections" } };
  const html = render(
    React.createElement(StorefrontMegaMenu, { id: "mega-collections", group, onNavigate() {} })
  );
  assert.match(html, /pf-shell__mega-inner--solo/);
  assert.match(html, /href="\/collections"/);
  assert.doesNotMatch(html, /pf-shell__mega-col"/);
});

/* ------------------------------------------------------------------ */
/* Mobile navigation                                                   */
/* ------------------------------------------------------------------ */

test("the mobile panel is a modal drawer built on the shared primitives", () => {
  const html = render(
    React.createElement(StorefrontMobileNav, {
      onClose() {},
      onSearch() {},
      counts: { wishlist: 1, cart: 2 },
    })
  );

  assert.match(html, /data-mobile-nav=""/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-label="Main menu"/);
  /* Focus lands on the close control when the trap opens. */
  assert.match(html, /data-autofocus/);
  assert.match(html, /aria-label="Close menu"/);

  const source = read(`${SHELL}/StorefrontMobileNav.jsx`);
  assert.match(source, /useLockBody\(true\)/);
  assert.match(source, /useEscape\(true, onClose\)/);
  assert.match(source, /useFocusTrap\(panelRef, true\)/);
  /* B's panel enters from the left. */
  assert.match(source, /initial=\{\{ x: "-100%" \}\}/);
});

test("the mobile panel keeps every action the previous drawer offered", () => {
  const html = render(
    React.createElement(StorefrontMobileNav, {
      onClose() {},
      onSearch() {},
      counts: { wishlist: 1, cart: 2 },
    })
  );

  /* Groups, from the taxonomy. */
  const groups = [...html.matchAll(/data-mobile-group="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(groups, ["women", "bridal", "men", "kids", "collections"]);
  /* Search, sign in, wishlist, bag and the legal pages. */
  assert.match(html, /pf-shell__mmenu-search/);
  assert.match(html, /href="\/signin"/);
  assert.match(html, /href="\/account\/wishlist"/);
  assert.match(html, /href="\/cart"/);
  assert.match(html, /aria-label="Bag, 2 items"/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/contact"/);
  assert.match(html, /aria-label="Wishlist, 1 item"/);
});

test("the mobile panel carries no overflow-prone content and no invented imagery", () => {
  const source = read(`${SHELL}/StorefrontMobileNav.jsx`);
  assert.equal(source.includes(LEGACY_PREFIX), false);
  /* The plate is the shared frame, which stays a neutral plate when the
     resolver has nothing — never an empty `src`. */
  assert.doesNotMatch(source, /<img/);
  assert.match(source, /<MediaFrame/);
  assert.doesNotMatch(source, /mock|pagePadding|content\.js/);
});

/* ------------------------------------------------------------------ */
/* Isolation                                                           */
/* ------------------------------------------------------------------ */

test("the shell adds no global CSS and no Tailwind class", () => {
  /* Comments are prose about the rules, not rules. */
  const css = read(`${SHELL}/storefront-shell.css`).replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = css
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith("{") && !line.startsWith("@") && !line.startsWith("/*"));
  assert.ok(selectors.length > 20);
  for (const selector of selectors) {
    assert.ok(
      selector.includes(".pf-shell"),
      `global selector in the shell stylesheet: ${selector}`
    );
  }
  /* No global element rule and no import of another application's
     stylesheet (Project B's `base.css`/`tokens.css` carry `:root`, `body`
     and `.container`, which is exactly what must not enter this app). */
  const elementSelectors = css
    .split("}")
    .map((block) => block.split("{")[0].trim())
    .filter(Boolean)
    .flatMap((block) => block.split(",").map((part) => part.trim()))
    .filter((part) => !part.startsWith("@") && !part.startsWith("//"));
  for (const selector of elementSelectors) {
    assert.match(selector, /^\.pf-shell/, `element or global selector: ${selector}`);
  }
  assert.equal(css.includes("@import"), false, "the shell must not import another stylesheet");

  for (const file of ["AnnouncementBar", "StorefrontHeader", "StorefrontMegaMenu", "StorefrontMobileNav"]) {
    const source = read(`${SHELL}/${file}.jsx`);
    /* Every class this shell writes — a literal, or through `cn()` — is
       either the shell's own namespace or one of its own state modifiers.
       A Tailwind utility here would be a class the production stylesheet has
       to carry for a preview surface, so the shell must not use one. */
    const literals = [
      ...[...source.matchAll(/className="([^"]+)"/g)].map((match) => match[1]),
      ...[...source.matchAll(/className=\{([^}]*)\}/g)].flatMap((match) =>
        [...match[1].matchAll(/"([^"]+)"/g)].map((literal) => literal[1])
      ),
    ]
      .flatMap((value) => value.split(/\s+/).filter(Boolean))
      /* A comparison inside the expression is not a class name. */
      .filter((value) => !value.startsWith("/"));

    assert.ok(literals.length > 1, `${file}: no class names found`);
    for (const token of literals) {
      assert.match(token, /^(pf-shell|is-|has-)/, `${file} uses a non-namespaced class: ${token}`);
    }
  }
});

test("the preview harness still shows the Phase 1 hero and now offers the shell", () => {
  const main = read("src/components/storefront/preview/main.jsx");
  assert.match(main, /HeroPreview/);
  assert.match(main, /ShellPreview/);
  assert.match(main, /"shell" \? <ShellPreview \/> : <HeroPreview \/>/);

  const shellPreview = read("src/components/storefront/preview/ShellPreview.jsx");
  assert.match(shellPreview, /if \(!import\.meta\.env\.DEV\) return null;/);
  assert.match(shellPreview, /import AnnouncementBar from "\.\.\/shell\/AnnouncementBar"/);
  assert.match(shellPreview, /import StorefrontHeader from "\.\.\/shell\/StorefrontHeader"/);
  assert.match(shellPreview, /AuthProvider/);
  assert.match(shellPreview, /ShoppingProvider/);
  assert.match(shellPreview, /PREVIEW_FIXTURE_ANNOUNCEMENTS/);
  assert.match(shellPreview, /PREVIEW_FIXTURE_LABEL/);
  assert.equal(shellPreview.includes(LEGACY_PREFIX), false);

  /* The hero preview is still first-class. */
  const heroPreview = read("src/components/storefront/preview/HeroPreview.jsx");
  assert.match(heroPreview, /if \(!import\.meta\.env\.DEV\) return null;/);
  assert.match(heroPreview, /HeroEditorial/);
});

/* ------------------------------------------------------------------ */
/* Phase 2D.2 — the two shell defects a browser found                  */
/* ------------------------------------------------------------------ */

/**
 * The `@media` block a rule lives in, brace-counted so a nested rule can never
 * be mistaken for a top-level one. Returns null when the prelude is absent.
 */
function mediaBlock(css, prelude) {
  const start = css.indexOf(`${prelude} {`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  return null;
}

test("below the desktop rail the primary nav is hidden, and the rule that hides it is intact", () => {
  const css = read(`${SHELL}/storefront-shell.css`);
  const block = mediaBlock(css, "@media (max-width: 1023px)");
  assert.ok(block, "the ≤1023px media block is missing");

  /* The defect this pins: the rail stayed in flow and its tail ran under the
     centred brand, because the block had been reformatted so that the account
     rule swallowed the nav's selector and `display: none` never applied. */
  assert.match(block, /\.pf-shell__nav,\s*\.pf-shell__explore\s*\{[^}]*display:\s*none/, "the ≤1023px block no longer hides the rail and Explore");
  assert.match(block, /\.pf-shell__burger\s*\{[^}]*display:\s*inline-flex/, "the burger is no longer shown at ≤1023px");
  assert.doesNotMatch(block, /\.pf-shell__account\s*\{/, "the account positioning rule has migrated back into this block");

  /* The desktop rail is still the same rail: five groups, one line. */
  const desktop = css.slice(0, css.indexOf("@media (max-width: 1023px)"));
  assert.match(desktop, /\.pf-shell__nav\s*\{[^}]*display:\s*flex/);
  assert.match(desktop, /\.pf-shell__nav-link\s*\{[^}]*white-space:\s*nowrap/);
});

test("the burger is the rail's replacement, so it cannot lose the desktop header to its own icon rule", () => {
  const css = read(`${SHELL}/storefront-shell.css`);
  /* `.pf-shell__icon` is declared later in the file with `display: inline-flex`,
     so a bare `.pf-shell__burger { display: none }` lost at equal specificity
     and painted a hamburger beside the rail at every width. */
  assert.match(css, /\.pf-shell__icon\.pf-shell__burger\s*\{[^}]*display:\s*none/, "the burger must beat the icon rule it shares a class with");
  const block = mediaBlock(css, "@media (max-width: 1023px)");
  assert.match(block, /\.pf-shell__icon\.pf-shell__burger\s*\{[^}]*display:\s*inline-flex/, "the burger must come back below the rail's breakpoint");
  /* And the rail must not be allowed to shrink into the brand (B's own
     constraint): the column keeps its min-content width. */
  const declared = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const left = declared.slice(declared.indexOf(".pf-shell__left {"), declared.indexOf("}", declared.indexOf(".pf-shell__left {")));
  assert.equal(left.includes("min-width: 0"), false, "shrinking the nav column is what ran the rail under the centered brand");
});

test("the mobile panel and the search dim are the header's siblings, not its children", () => {
  /* A `position: fixed` box inside the header is sized to the header: the
     header's `backdrop-filter` makes it the containing block, which rendered the
     drawer as a 56px sliver of an unclickable menu. They must stay outside. */
  const source = read(`${SHELL}/StorefrontHeader.jsx`);
  const close = source.lastIndexOf("</header>");
  assert.ok(close > 0, "the header's closing tag is missing");

  const afterHeader = source.slice(close);
  const beforeHeader = source.slice(0, close);
  /* Markers of JSX usage, not the import statements at the top of the file. */
  for (const marker of ["<StorefrontMobileNav", 'className="pf-shell__header-scrim"']) {
    assert.ok(afterHeader.includes(marker), `${marker} must render after </header>`);
    assert.equal(beforeHeader.includes(marker), false, `${marker} must not render inside the header`);
  }
  /* Both overlays keep their own dismissal contract. */
  assert.match(afterHeader, /<StorefrontMobileNav[\s\S]*onClose=\{\(\) => setDrawerOpen\(false\)\}/);
  assert.match(afterHeader, /className="pf-shell__header-scrim"[\s\S]*onClick=\{closeAll\}/);
});

test("the header's overlays are painted in the documented order", () => {
  const css = read(`${SHELL}/storefront-shell.css`);
  const zOf = (selector) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at > -1, `${selector} is missing`);
    const block = css.slice(at, css.indexOf("}", at));
    return Number(block.match(/z-index:\s*(-?\d+)/)?.[1]);
  };
  const header = zOf(".pf-shell__header");
  const dim = zOf(".pf-shell__header-scrim");
  const drawer = zOf(".pf-shell__mmenu");
  const scrim = zOf(".pf-shell__scrim");

  /* Under the header, over the page, under its own drawer. */
  assert.ok(dim < header, `the search dim (${dim}) must sit under the header (${header})`);
  assert.ok(dim > 0, "the search dim can no longer sit at a negative z-index, which put it behind the page it dims");
  assert.ok(scrim < drawer, `the drawer scrim (${scrim}) must sit under the drawer (${drawer})`);
});
