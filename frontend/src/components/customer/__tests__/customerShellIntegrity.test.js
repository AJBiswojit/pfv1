/**
 * PRATIKSHYA FASHION — PHASE 2D.1 · the shell the customer actually receives.
 *
 * Phase 2D.1 asks one question — is the navbar and the footer the design's own,
 * on the real customer root, exactly once, and in the right place? — and the
 * companion suites only answer it in halves. `customerPortParity` proves the port
 * tool reproduces the design's files; `customerIntegration` proves the routes and
 * the switch are wired. Neither renders the surface the browser gets. These
 * tests do: the application's own provider stack, wrapped around
 * `CustomerLayout`, with the Phase 2D switch on — the DOM behind
 * `/` — composed exactly as `src/App.jsx` composes it.
 *
 *   1. the ported shell IS the design's file, line for line, minus the pinned
 *      adapter lines below (the router import, `Layout`'s slot, the footer's
 *      three guards and its copyright row). Any other drift fails;
 *   2. the shell asks the host for nothing: no `.pf-` token, no application
 *      import;
 *   3. one announcement bar, one header, one nav, one main, one footer — in the
 *      design's order, with the application's own header, footer and drawer
 *      suppressed;
 *   4. the navbar carries the design's five destinations and its five controls,
 *      and every one of them is a route this application registers;
 *   5. the footer closes the page after the last section, renders every group
 *      the design declares, and states only what the house can stand behind —
 *      every available contact fact, no unverified address, no social row, and
 *      a newsletter that is explicitly unavailable rather than silently broken;
 *   6. each of the design's four mega panels renders its columns, its feature
 *      plate and only registered destinations.
 *
 * WHAT THIS CANNOT PROVE: there is no browser or DOM implementation in this
 * tree (no jsdom, no Playwright/Puppeteer, no headless engine), so computed
 * layout — pixels, breakpoints, sticky offsets, z-order — is out of scope here
 * and is asserted nowhere. This suite pins composition, inventory and
 * contracts; visual parity still needs a human at a viewport.
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

import { isRegisteredPath } from "../router/routes.js";

function projectRoot() {
  let directory = new URL(".", import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL("package.json", directory))) return fileURLToPath(directory);
    directory = new URL("../", directory);
  }
  throw new Error("frontend root not found");
}

const ROOT = projectRoot();
const REPO = join(ROOT, "..");
const PORT = "src/components/customer";
const DESIGN = "home-page/src";

const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

/* ── 1. The shell files, and the only lines the port is allowed to change ── */

/** The design's six shell files and the port's exact, pinned adaptations. */
const SHELL_FILES = [
  [
    "components/layout/AnnouncementBar.jsx",
    [
      [
        "const [hidden, setHidden] = useState(() => load('aarna:announce', null, 'session') === 'off');",
        "const [hidden, setHidden] = useState(() => load('storefront:announce', null, 'session') === 'off');",
      ],
      [
        "onClick={() => { save('aarna:announce', 'off', 'session'); setHidden(true); }}",
        "onClick={() => { save('storefront:announce', 'off', 'session'); setHidden(true); }}",
      ],
    ],
  ],
  [
    "components/layout/Layout.jsx",
    [
      [
        "export default function Layout() {",
        "export default function Layout({ children }) {",
      ],
      ["        <Outlet />", "        {children ?? <Outlet />}"],
    ],
  ],
  [
    "components/layout/Header.jsx",
    [
      [
        "import { Link, NavLink, useLocation } from 'react-router-dom';",
        "import { useLocation } from 'react-router-dom';\nimport { Link, NavLink } from '../../router/index.jsx';",
      ],
    ],
  ],
  [
    "components/layout/Footer.jsx",
    [
      [
        "import { Link } from 'react-router-dom';",
        "import { Link } from '../../router/index.jsx';",
      ],
      [
        "              <li><a href={`mailto:${site.contact.email}`}>{site.contact.email.split('@')[0]}@<wbr />{site.contact.email.split('@')[1]}</a></li>\n" +
          "              <li>{site.contact.hours}</li>\n" +
          "              <li>{site.contact.city}</li>",
        "              {site.contact.email && <li><a href={`mailto:${site.contact.email}`}>{site.contact.email}</a></li>}\n" +
          "              {site.contact.hours && <li>{site.contact.hours}</li>}\n" +
          "              {site.contact.city && <li>{site.contact.city}</li>}",
      ],
      [
        "{site.brand}. Prototype storefront — sample catalogue, prices and offers.",
        "{site.brand}. All rights reserved.",
      ],
    ],
  ],
  [
    "components/navigation/MegaMenu.jsx",
    [
      [
        "import { Link } from 'react-router-dom';",
        "import { Link } from '../../router/index.jsx';",
      ],
    ],
  ],
  [
    "components/navigation/MobileMenu.jsx",
    [
      [
        "import { Link } from 'react-router-dom';",
        "import { Link } from '../../router/index.jsx';",
      ],
    ],
  ],
];

test("every ported shell file is the design's own file, minus the pinned adapter lines", () => {
  for (const [file, adaptations] of SHELL_FILES) {
    const design = readFileSync(join(REPO, DESIGN, file), "utf8");
    let expected = design;
    for (const [before, after] of adaptations) {
      assert.ok(
        expected.includes(before),
        `${file}: the pinned design line is gone — the design moved, not the port:\n${before}`,
      );
      expected = expected.replace(before, after);
    }
    assert.equal(
      read(`${PORT}/${file}`),
      expected,
      `${file} differs from the design by more than the pinned adapter lines`,
    );
  }
});

test("the shell asks the host for nothing: no host classes, no application imports", () => {
  const allowed = /^(react|react-dom|react-router-dom|framer-motion|lucide-react)$/;
  for (const [file] of SHELL_FILES) {
    const source = read(`${PORT}/${file}`);
    for (const [, specifier] of source.matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(
        specifier.startsWith(".") || allowed.test(specifier),
        `${file} imports ${specifier} — the shell may only depend on the port's own modules and the four libraries the design itself uses`,
      );
    }
    assert.ok(!/pf-/.test(source), `${file} mentions a host class`);
  }
});

/* ── 2. The integrated render: the provider stack `App.jsx` builds ────────── */

let markup = "";
let data = null;
let vite = null;
let restoreFetch = null;

/* The catalogue is hydrated before the page is rendered. Without it the
   homepage sections are in their honest loading state (\u201cLoading homepage
   content\u2026\u201d) and the page this suite pins never appears. The store is hydrated
   through its own `hydrateCatalog()` with the backend's read endpoints answered
   by an empty, valid envelope: no products, and a home read that carries a
   ready, authored `homepageContent` — configured sections carrying the
   rows an operator registers for each slot (product slots empty: this feed
   ships no products), with the promotion inactive as an offer-less feed
   leaves it. Nothing about the shell under test is faked. */
const SHELL_SECTION_KEYS = ["categories", "sarees", "bridal", "jewellery", "promotion", "men", "kids", "bestsellers", "kurtis", "newsletter", "trust"];
/* The authored rows a marketing operator configures for each slot of the
   registered homepage (see `backend/app/schemas/media/homepage.py`). Product
   slots stay empty: the catalogue this envelope ships with has no products. */
const shellSectionItems = (key) => {
  const text = (slotKey, title, subtitle, extra = {}) => ({ id: `t-${slotKey}`, contentType: "TEXT", slotKey, text: { title, subtitle, eyebrow: "Pratikshya", ctaLabel: "Explore", ctaHref: "/shop/all", ...extra } });
  const media = (slotKey, title, subtitle) => ({ id: `m-${slotKey}`, contentType: "MEDIA", slotKey, media: { title, subtitle, altText: `${title} plate`, url: `/api/v1/media/objects/hero/${slotKey}.avif` } });
  switch (key) {
    case "categories":
      return [text("intro", "Dressed for every chapter.", "Four wardrobes, one sensibility."), ...["women", "men", "kids", "essentials"].map((k) => media(k, k[0].toUpperCase() + k.slice(1), `The ${k} edit`))];
    case "sarees":
      return [text("intro", "Six yards, unhurried.", "Handwoven silks and light handloom cottons."), text("silk-classics", "Silk Classics", "Banarasi & Kanjeevaram"), media("lookbook-1", "The pallu, held", "Katan in motion"), media("lookbook-2", "Banarasi buti", "Woven in zari")];
    case "bridal":
      return [text("intro", "Composed as a pair.", "Zardozi worked by hand over weeks."), media("bride", "Crimson, by hand.", "Raw silk lehengas"), media("groom", "Ivory, tone on tone.", "Champagne sherwanis"), media("couple", "The wedding pair", "Styled together")];
    case "jewellery":
      return [text("intro", "Heirlooms, worn daily.", "Kundan, polki and temple jewellery."), media("campaign", "Kundan · Polki · Temple", "Hover a piece to bring it to the light.")];
    case "promotion":
      return [text("intro", "The festive edit", "Every figure comes from the offer register.")];
    case "men":
      return [text("intro", "Tailored for ceremony, and Tuesdays.", "Kurtas, bandhgalas and sherwanis."), ...[["Kurtas", "kurtas"], ["Bandhgalas", "bandhgalas"], ["Sherwanis", "sherwanis"], ["Accessories", "accessories"]].map(([label, k]) => text(k, label, `Shop ${label}`)), media("campaign", "Cocoa bandhgala", "Over an ivory kurta")];
    case "kids":
      return [text("intro", "Little celebrations.", "Soft linings, easy buttons."), text("girls", "Girls", "Twirl-ready"), text("boys", "Boys", "Festive & everyday"), media("main", "Festive wear", "Running hand in hand"), media("girls", "Girls", "Ruffled sets"), media("boys", "Boys", "Kurta sets")];
    case "bestsellers":
      return [text("intro", "Most Loved", "A selection from the house catalogue — the backend does not yet expose a verified sales ranking.")];
    case "kurtis":
      return [text("intro", "The kurti, in four moods.", "Anarkalis, festive, sets and everyday."), ...["anarkalis", "festive-kurtis", "kurta-sets", "everyday-kurtis"].map((k) => media(k, k.replace(/-/g, " "), "The mood, photographed"))];
    case "newsletter":
      return [text("intro", "Letters from the loom.", "Once or twice a month, never more."), text("fine-print", "By subscribing you agree to our privacy policy.", ""), media("campaign", "The Pratikshya Circle", "Letters from the loom")];
    case "trust":
      return [
        text("delivery", "Delivery across India", "Timelines confirmed at checkout"),
        text("authentic", "Craft, documented", "Fabric & technique on every product"),
        text("secure", "Secure checkout", "Encrypted payments"),
        text("returns", "Returns & exchanges", "Read the policy before you buy"),
        text("help", "Styling & order help", "Reach our team through the contact page"),
      ].map((row) => ({ ...row, text: { ...row.text, eyebrow: undefined, ctaLabel: undefined, ctaHref: "/pages/contact" } }));
    default:
      return [];
  }
};
const emptyCatalogueFetch = () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const href = String(input?.url ?? input);
    const body = href.includes("/products")
      ? { items: [], total: 0, page: 1, pageSize: 100 }
      : href.includes("/offers")
        ? { offers: [], total: 0 }
        : href.includes("/categories") || href.includes("/collections")
          ? { items: [], total: 0 }
          : href.includes("/home")
            ? {
                heroSlides: [],
                homepageContent: {
                  version: 1,
                  status: "ready",
                  sections: SHELL_SECTION_KEYS.map((key) => ({
                    key,
                    configured: true,
                    /* An inactive promotion mirrors an offer-less feed; every other
                       section is configured and ready with its authored rows. */
                    state: key === "promotion" ? "inactive" : "ready",
                    items: shellSectionItems(key),
                  })),
                },
              }
            : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return () => { globalThis.fetch = original; };
};

before(async () => {
  vite = await createServer({
    root: ROOT,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
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
    router,
    { default: MegaMenu },
    site,
  ] = await Promise.all([
    load("/src/layouts/CustomerLayout.jsx"),
    load("/src/context/AuthContext.jsx"),
    load("/src/context/AccountContext.jsx"),
    load("/src/context/InventoryContext.jsx"),
    load("/src/context/ShoppingContext.jsx"),
    load("/src/context/OrderContext.jsx"),
    load("/src/context/CheckoutContext.jsx"),
    load("/src/components/customer/router/routes.js"),
    load("/src/components/customer/components/navigation/MegaMenu.jsx"),
    load("/src/components/customer/data/index.js"),
    load("/src/services/catalog/catalogStore.js"),
  ]);
  const catalogStore = (await load("/src/services/catalog/catalogStore.js"));
  restoreFetch = emptyCatalogueFetch();
  try {
    await catalogStore.hydrateCatalog({ force: true });
  } finally {
    restoreFetch();
    restoreFetch = null;
  }
  if (catalogStore.getCatalogState().status !== "ready") {
    throw new Error(`the catalogue did not hydrate: ${catalogStore.getCatalogState().status}`);
  }

  data = { ...site, resolveStorefrontPath: router.resolveStorefrontPath, MegaMenu, load };

  /* The same nesting `src/App.jsx` uses, innermost last. */
  let tree = React.createElement(CustomerLayout);
  for (const Provider of [CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
    tree = React.createElement(Provider, null, tree);
  }
  markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/"] },
      React.createElement(Suspense, { fallback: null }, tree),
    ),
  );
});

after(async () => {
  await vite?.close();
});

const count = (needle) => markup.split(needle).length - 1;
/** React escapes text nodes, so a label comparison has to be escaped too. */
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const at = (needle) => markup.indexOf(needle);
const anchors = (html) => [...html.matchAll(/<a[^>]*href="([^"]*)"/g)].map((match) => match[1]);

/* ── 3. The shell, once, in order ─────────────────────────────────────────── */

test("the customer root renders the design's shell once, in the design's order", () => {
  assert.ok(markup.length > 20000, `the surface rendered almost nothing (${markup.length} chars)`);
  const inventory = {
    'class="aan-root"': 1,
    'class="skip-link"': 1,
    'class="announce"': 1,
    '<header class="header"': 1,
    'class="nav" aria-label="Primary"': 1,
    '<main id="main"': 1,
    '<footer class="footer"': 1,
  };
  for (const [needle, expected] of Object.entries(inventory)) {
    assert.equal(count(needle), expected, `${needle} appears ${count(needle)} times, expected ${expected}`);
  }
  assert.deepEqual(
    ['class="aan-root"', 'class="skip-link"', 'class="announce"', '<header class="header"', "<main", "</main>", "<footer"].map(at)
      .every((index, i, all) => index > 0 && (i === 0 || index > all[i - 1])),
    true,
    "the shell's parts are not in the design's order",
  );
});

test("the application's own header, footer and drawer are not on this surface", () => {
  for (const host of ["pf-shell__header", "pf-shell__footer", "pf-shell__mobile", "pf-shell__announce"]) {
    assert.equal(count(host), 0, `${host} is still mounted under the ported shell`);
  }
  /* The only host class left is the canvas wrapper the layout puts around the
     port — one element, outside `.aan-root`. */
  assert.equal(count("pf-shell"), 1, "the host shell leaks into the Aarna surface");
  assert.equal(count('class="min-h-screen flex flex-col pf-shell__surface'), 1);
  assert.ok(at("pf-shell__surface") < at('class="aan-root"'), "the canvas wrapper is not the port's parent");
});

/* ── 4. The navbar ────────────────────────────────────────────────────────── */

test("the navbar carries the design's five destinations and its five controls", () => {
  assert.equal(data.megaMenus.length, 4, "the design has four mega panels");
  for (const menu of data.megaMenus) {
    assert.equal(count(`aria-controls="mega-${menu.key}"`), 1, `${menu.key} has no trigger`);
    assert.ok(markup.includes(`>${menu.label}</button>`), `the ${menu.key} trigger has lost its label`);
  }
  assert.ok(markup.includes('class="nav__link nav__link--accent" href="/bridal"'), "the Bridal link is missing");
  for (const label of ["Open menu", "Search", "Account", "Wishlist", "Shopping bag"]) {
    assert.equal(
      count(`aria-label="${label}`),
      1,
      `the navbar's "${label}" control is missing or duplicated`,
    );
  }
  assert.ok(markup.includes('<span class="logo__word">PRATIKSHYA</span>'), "the wordmark is missing");

  const logo = markup.match(/<img class="logo__mark" src="([^"]+)"/);
  assert.ok(logo, "the logo plate is missing");
  assert.ok(existsSync(join(ROOT, "public", logo[1])), `${logo[1]} is not staged in public/`);
});

test("every navbar destination is a route this application registers", () => {
  const header = markup.slice(at('<header class="header"'), at("<main"));
  /* Four anchors: the wordmark, Bridal, Account and the wishlist. Search and
     the bag are buttons — they open overlays, not routes — and every mega
     trigger is a button too, so nothing navigates on hover. */
  const hrefs = anchors(header);
  assert.equal(hrefs.length, 4, `the navbar rendered ${hrefs.length} link(s): ${hrefs.join(", ")}`);
  for (const menu of data.megaMenus) {
    assert.ok(
      markup.includes(`<button type="button" class="nav__link" aria-expanded="false" aria-controls="mega-${menu.key}">`),
      `the ${menu.key} trigger is no longer a disclosure button`,
    );
  }
  for (const href of hrefs) {
    assert.ok(isRegisteredPath(href), `the navbar links to ${href}, which this application does not register`);
  }
  for (const href of ["/", "/bridal", "/account", "/wishlist"]) {
    assert.ok(hrefs.includes(href), `the navbar no longer links to ${href}`);
  }
});

test("each of the design's four mega panels renders its columns, its plate and only registered destinations", async () => {
  for (const menu of data.megaMenus) {
    const panel = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ["/"] },
        React.createElement(data.MegaMenu, { menu }),
      ),
    );
    assert.equal(panel.split('class="mega__col"').length - 1, menu.columns.length, `${menu.key}: columns`);
    for (const column of menu.columns) {
      assert.ok(panel.includes(`<p class="mega__title">${esc(column.title)}</p>`), `${menu.key}: column ${column.title}`);
    }
    const hrefs = anchors(panel);
    assert.equal(
      hrefs.length,
      menu.columns.reduce((total, column) => total + column.links.length, 0) + 1,
      `${menu.key}: rendered ${hrefs.length} destination(s)`,
    );
    for (const href of hrefs) {
      assert.ok(isRegisteredPath(href), `${menu.key} offers ${href}, which this application does not register`);
    }
    assert.ok(
      panel.includes(esc(menu.feature.kicker)) && panel.includes(esc(menu.feature.title)),
      `${menu.key}: feature copy`,
    );
    assert.ok(
      existsSync(join(ROOT, "public", new URL(menu.feature.image, "https://x").pathname)),
      `${menu.key}: ${menu.feature.image} is not staged in public/`,
    );
  }
});

/* ── 5. The footer: once, last, complete, honest ──────────────────────────── */

test("the footer closes the page, after the last section, exactly once", () => {
  const sections = [...markup.matchAll(/<section[^>]*?class="([^"]+)"/g)].map((match) => match[1].split(" ")[0]);
  const design = ["hero", "collage", "saree", "bridal", "jewel", "promo", "men", "kids", "best", "kurti", "news", "trust"];
  /* The hero and the promo band are conditional: the hero renders only when the
     backend's /home feed carries active slides (an empty successful response is
     authoritative — `CustomerHomeHero` returns nothing), and the promo band only
     when an offer is active. Every other section is fixed. */
  const CONDITIONAL = ["hero", "promo"];
  assert.deepEqual(
    sections.filter((name) => !CONDITIONAL.includes(name)),
    design.filter((name) => !CONDITIONAL.includes(name)),
    "the homepage sections are not in the design's order",
  );
  if (sections.includes("hero")) {
    assert.equal(sections[0], "hero", "the hero is not the first section");
  }
  if (sections.includes("promo")) {
    assert.deepEqual(sections.slice(4, 7), ["jewel", "promo", "men"], "the promo band moved");
  }
  assert.equal(count("<footer"), 1, "the customer root renders more than one footer");
  assert.equal(count("</footer>"), 1);
  assert.ok(at('<footer class="footer"') > at('class="trust"'), "the footer does not sit after the last section");
  assert.ok(markup.slice(at("</footer>")).includes('class="toasts"'), "the footer is not the page's last block");
});

test("the footer renders every group the design declares, on registered routes", () => {
  for (const block of ["footer__top", "footer__brand", "footer__lede", "footer__desc", "footer__news", "footer__groups", "footer__signature", "footer__bottom"]) {
    assert.equal(count(`class="${block}"`) + count(`class="container ${block}"`), 1, `the footer's ${block} is missing`);
  }
  const footer = markup.slice(at('<footer class="footer"'), at("</footer>"));
  for (const group of data.footerGroups) {
    assert.ok(
      footer.includes(`<p class="fgroup__title">${esc(group.title)}</p>`),
      `the footer's ${group.title} group is missing`,
    );
    assert.equal(
      count(`>${esc(group.title)}</span>`),
      1,
      `the ${group.title} group has no disclosure control`,
    );
    for (const link of group.links) {
      assert.ok(
        footer.includes(`>${esc(link.label)}</a>`),
        `the footer lost its ${group.title} → ${link.label} link`,
      );
    }
  }
  assert.equal(footer.split('class="fgroup"').length - 1 + (footer.includes("fgroup fgroup--contact") ? 0 : 1), data.footerGroups.length, "the footer's group count changed");
  const hrefs = anchors(footer);
  assert.equal(hrefs.length, data.footerGroups.reduce((total, group) => total + group.links.length, 0));
  for (const href of hrefs) {
    assert.ok(isRegisteredPath(href), `the footer links to ${href}, which this application does not register`);
  }
});

test("the footer states only what the house can stand behind", () => {
  const footer = markup.slice(at('<footer class="footer"'), at("</footer>"));

  /* Contact: whatever the record holds, in its order — and nothing else. The
     design published a placeholder address and invented care hours; this
     application holds neither, so the column carries the city alone. */
  const contact = footer.slice(footer.indexOf("fgroup__list fgroup__list--always"));
  const lines = [...contact.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => match[1].replace(/<[^>]*>/g, ""));
  assert.deepEqual(
    lines,
    [data.site.contact.email, data.site.contact.hours, data.site.contact.city].filter(Boolean),
    "the Contact column invents or drops a fact",
  );
  assert.equal(/\(mailto:|tel:/.test(footer), Boolean(data.site.contact.email), "the footer publishes an address the record does not hold");

  /* Social: an unset profile is not a link, so the row carries exactly as many
     links as the record carries profiles. */
  const social = footer.slice(footer.indexOf('class="footer__social"'));
  assert.equal(
    social.split("<li>").length - 1,
    data.site.social.length,
    "the footer links a social profile the house does not own",
  );

  /* Newsletter: present, because the design has it; explicitly unavailable. */
  assert.ok(footer.includes('class="nform is-unavailable nform--dark"'), "the newsletter form is no longer marked unavailable");
  assert.equal((footer.match(/ disabled=""/g) ?? []).length, 2, "the newsletter input and its button must both be disabled");
  assert.ok(footer.includes("opens once the subscription service is connected"), "the newsletter no longer explains itself");

  /* Copyright: the house's own line. */
  assert.match(footer, /© \d{4} PRATIKSHYA FASHION\. All rights reserved\./);
  assert.ok(!/prototype|sample catalogue/i.test(footer), "prototype copy is on the customer's footer");
});

test("the announcement rail states the house's own line and can be dismissed", () => {
  const bar = markup.slice(at('class="announce"'), at('<header class="header"'));
  const lines = [...bar.matchAll(/<p[^>]*>([^<]*)<\/p>/g)].map((match) => match[1]);
  assert.equal(lines.length, 1, `the rail rendered ${lines.length} lines`);
  assert.ok(data.announcements.includes(lines[0]), `the rail says something the record does not: ${lines[0]}`);
  assert.ok(bar.includes('aria-label="Dismiss announcement"'), "the rail can no longer be dismissed");
  assert.ok(!/UTSAV15|sample offer/i.test(markup), "prototype offer copy is on the customer's page");
});

test("no prototype copy reaches the customer's page", () => {
  /* A page-level check, not a per-file one: the design was a prototype, and
     Phase 3 replaced the last of its sample-catalogue sentences with a
     statement this house can stand behind. Whatever future edit reintroduces
     one lands here. */
  assert.ok(!/prototype|sample catalogue|sample data/i.test(markup), "prototype copy is on the customer's page");
  assert.ok(
    markup.includes("A selection from the house catalogue — the backend does not yet expose a verified sales ranking."),
    "the bestsellers rail no longer says what it is showing",
  );
});

test("the port the shell speaks to is the one it renders", () => {
  /* Both halves of the switch, in one place: the DEV query a reviewer uses and
     the production variable a built app needs, resolving to the same surface. */
  assert.equal(data.resolveStorefrontPath("/shop/women"), "/women");
  assert.equal(data.resolveStorefrontPath("/track-order"), "/account/orders");
  assert.ok(isRegisteredPath("/women") && isRegisteredPath("/account/orders"));
});
