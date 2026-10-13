/**
 * PRATIKSHYA FASHION — PHASE 2D · the exact-design-port tool.
 *
 * Two jobs, both mechanical and both re-checkable:
 *
 *   1. THE PORT IS COPIES. `node scripts/aarna-port.js --copy` copies the
 *      approved design's homepage dependency closure (`home-page/src/…`) into
 *      `src/components/aarna/…`, preserving the design's own directory layout so
 *      that every relative import inside the copied files keeps resolving. The
 *      only differences the tool introduces are the pinned rewrites below —
 *      each one a named, counted, single-purpose edit (a routing shim, a React
 *      DOM property, an asset path + its staged twin, offer copy that cannot be
 *      session-specific, and a capability gate). `--check` re-verifies the pins.
 *
 *   2. THE STYLESHEET IS A TRANSFORM. `node scripts/aarna-port.js --css` reads
 *      the design's seven stylesheets and writes `src/components/aarna/aarna.css`
 *      with every selector scoped under `.aan-root`. Declarations are copied
 *      byte-for-byte; only selectors change, plus the two global keyframe names
 *      (`spin`, `pulse` → `aan-spin`, `aan-pulse`). `--check` re-runs the
 *      transform and compares, so the committed stylesheet can never drift from
 *      the design it was taken from (`aarnaSourceParity.test.js` also does this
 *      from inside the test suite).
 *
 * Nothing here writes to `home-page/`: the design is read-only reference.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = join(HERE, "..");
export const REPO_ROOT = join(FRONTEND_ROOT, "..");
export const DESIGN_SRC = join(REPO_ROOT, "home-page", "src");
export const DESIGN_STYLES = join(DESIGN_SRC, "styles");
export const PORT_RELATIVE = "src/components/aarna";
export const PORT_DIR = join(FRONTEND_ROOT, PORT_RELATIVE);
export const PORT_CSS = join(PORT_DIR, "aarna.css");
export const SCOPE = ".aan-root";

/* ────────────────────────────── the closure ─────────────────────────────── */

/**
 * Every file of the homepage's dependency closure, with the number of the
 * design's lines the port does not carry. `0` = copied byte-for-byte.
 *
 * The non-zero entries are produced by the `REWRITES` below; the count is the
 * size of the adaptation, so an edit that grows is an edit the suite refuses.
 */
export const CLOSURE = {
  "components/layout/AnnouncementBar.jsx": 0,
  "components/layout/Footer.jsx": 5,  // 1 routing + 4 truthfulness lines
  "components/layout/Header.jsx": 1,
  "components/layout/Layout.jsx": 2,
  "components/navigation/MegaMenu.jsx": 1,
  "components/navigation/MobileMenu.jsx": 1,
  "components/product/OptionSelector.jsx": 0,
  "components/product/Price.jsx": 0,
  "components/product/ProductCard.jsx": 1,
  "components/product/WishlistButton.jsx": 0,
  "components/product/useAddToBag.js": 0,
  "components/sections/Bestsellers.jsx": 0,
  "components/sections/BridalCampaign.jsx": 1,
  "components/sections/CategoryCollage.jsx": 1,
  "components/sections/Hero.jsx": 1,
  "components/sections/JewelleryTheatre.jsx": 1,
  "components/sections/KidsPlayground.jsx": 1,
  "components/sections/KurtiLookbook.jsx": 2,  // 2 live curation
  "components/sections/MensEditorial.jsx": 1,
  "components/sections/Newsletter.jsx": 1,
  "components/sections/PromoBanner.jsx": 0,
  "components/sections/SareeLookbook.jsx": 2,  // 1 routing + 1 live curation
  "components/sections/TrustStrip.jsx": 1,
  "components/shopping/CartDrawer.jsx": 6,  // 1 routing + 5 offer-copy lines
  "components/shopping/QuickViewModal.jsx": 1,
  "components/shopping/SearchOverlay.jsx": 1,
  "components/ui/ArrowLink.jsx": 1,
  "components/ui/Button.jsx": 1,
  "components/ui/InView.jsx": 0,
  "components/ui/Logo.jsx": 2,
  "components/ui/NewsletterForm.jsx": 5,  // 1 import + 4 capability-gate lines
  "components/ui/Reveal.jsx": 0,
  "components/ui/ScrollToTop.jsx": 0,
  "components/ui/SectionLabel.jsx": 0,
  "components/ui/Toasts.jsx": 0,
  "data/index.js": 2,
  "hooks/useEscape.js": 0,
  "hooks/useFocusTrap.js": 0,
  "hooks/useLockBody.js": 0,
  "hooks/useScrolled.js": 0,
  "mock/assets/images.js": 1,
  "mock/data/content.js": 23,  // prototype site block + sample announcements + the care-hours line
  "mock/data/navigation.js": 0,
  "mock/data/pages.js": 0,
  "pages/Home.jsx": 0,
  "services/catalog.js": 0,
  "services/storage.js": 0,
  "state/UIContext.jsx": 0,
  "utils/format.js": 0,
  "utils/motion.js": 0,
};

/**
 * Files the port REPLACES with a boundary adapter: the design's module is a
 * prototype data source (a sample catalogue, a sample offer, a simulated
 * subscription, a local-storage cart). The port keeps the same module path and
 * the same export names — so every copied component keeps working unchanged —
 * but answers from this application: the live catalogue, the offer register,
 * the centralised cart + wishlist, and an honest "no capability yet" for the
 * subscription. Each one opens with an `ADAPTED AT THE BOUNDARY` note.
 */
export const REPLACED = {
  "mock/data/products.js": "the live catalogue, mapped to the design's product shape",
  "mock/data/promotions.js": "the offer register, mapped to the design's promotion shape",
  "services/newsletter.js": "no subscription capability exists in this application yet",
  "state/ShopContext.jsx": "this application's CartContext + WishlistContext",
};

/** Modules the port adds: the design has no counterpart. */
export const ADDED = [
  "AarnaStorefront.jsx",
  "aarna.css",
  "aarna.host.css",
  "designFonts.js",
  "mock/data/site.js",
  "router/index.jsx",
  "router/routes.js",
];

/* ─────────────────────────── the pinned rewrites ────────────────────────── */

const relativeTo = (fromFile, toFile) => {
  const specifier = relative(dirname(join(PORT_DIR, fromFile)), join(PORT_DIR, toFile));
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
};

/**
 * Rewrite 1 — ROUTING. The design owns its own router and its own URL space
 * (`/shop/sarees`, `/pages/our-story`, `/track-order`). This application owns a
 * different one. Rather than rewrite dozens of destinations, the port keeps the
 * design's own `to` values everywhere and re-points the two link components at
 * the shim, which translates at render time (`router/routes.js`).
 */
const routingRewrite = (file, source) => {
  const pattern = /^import \{([^}]*)\} from 'react-router-dom';$/m;
  const match = source.match(pattern);
  if (!match) return source;
  /* Only files that render a link are re-pointed; `Outlet`, `useLocation`,
     `useNavigate` and `useParams` stay with react-router-dom. */
  const named = match[1].split(",").map((name) => name.trim());
  if (!named.includes("Link") && !named.includes("NavLink")) return source;
  const kept = match[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name && name !== "Link" && name !== "NavLink");
  const shim = `import { ${["Link", "NavLink"]
    .filter((name) => match[1].includes(name))
    .join(", ")} } from '${relativeTo(file, "router/index.jsx")}';`;
  const replacement = kept.length ? `import { ${kept.join(", ")} } from 'react-router-dom';\n${shim}` : shim;
  return source.replace(pattern, replacement);
};

/** Rewrite 2 — the React 19 DOM property for the hero's first image. */
const fetchPriorityRewrite = (file, source) => source.replace(/\bfetchpriority=/g, "fetchPriority=");

/** Rewrite 3 — the brand mark, staged with the rest of the design's art. */
const logoPlateRewrite = (file, source) =>
  source.replace("const MARK_SRC = '/images/pratikshya-logo.webp';", "const MARK_SRC = '/aarna-design/pratikshya-logo.webp';");

/**
 * Rewrite 4 — OFFER COPY. The design's basket names its own sample campaign
 * ("Festive Edit") in four places. A live offer may be scoped to any
 * collection, or to none, so the copy takes the offer's own label and its own
 * percentage — and says only what the offer register says.
 */
const offerCopyRewrite = (file, source) =>
  source
    .replace("{ ok: true, text: `${res.promo.code} applied — ${res.promo.discountPercent}% off Festive Edit items.` }",
             "{ ok: true, text: `${res.promo.code} applied — ${res.promo.discountLabel}.` }")
    .replace("{totals.promo && l.product.collections.includes(totals.promo.eligibleCollection) && <p className=\"cline__promo\"><Tag size={11} /> Festive Edit</p>}",
             "{totals.promo && l.product.collections.includes(totals.promo.eligibleCollection) && <p className=\"cline__promo\"><Tag size={11} /> {totals.promo.scopeLabel}</p>}")
    .replace("<span><Tag size={13} /> {totals.promo.code} · {totals.promo.discountPercent}% off Festive Edit</span>",
             "<span><Tag size={13} /> {totals.promo.code} · {totals.promo.discountLabel}</span>")
    .replace("<div className=\"totals__disc\"><dt>Festive Edit discount</dt>",
             "<div className=\"totals__disc\"><dt>{totals.promo.scopeLabel ?? 'Offer'} discount</dt>")
    .replace("<div className=\"totals__note\"><dt>No Festive Edit items in bag yet</dt>",
             "<div className=\"totals__note\"><dt>No eligible items in the bag yet</dt>");

/**
 * Rewrite 5 — THE PAGE SLOT. The design's layout renders the router's
 * `<Outlet/>`; here the page is a child, because this application owns routing
 * and mounts the design at one route.
 */
const layoutSlotRewrite = (file, source) =>
  source
    .replace("export default function Layout() {", "export default function Layout({ children }) {")
    .replace("<Outlet />", "{children ?? <Outlet />}");

/**
 * Rewrite 6 — THE SUBSCRIPTION CAPABILITY. This application has no newsletter
 * service: no endpoint, no list, no consent record. The design's field and
 * button therefore render disabled with the design's own status line carrying
 * the reason — a control that cannot work is not offered as if it could. The
 * development reference surface substitutes the design's simulated service so
 * the section can still be compared like for like (see `services/newsletter.js`).
 */
const newsletterCapabilityRewrite = (file, source) =>
  source
    .replace(
      "import { subscribe } from '../../services/newsletter.js';",
      "import { newsletterAvailable, subscribe } from '../../services/newsletter.js';",
    )
    .replace(
      "  const [status, setStatus] = useState('idle');",
      "  const [status, setStatus] = useState('idle');\n  const live = newsletterAvailable();",
    )
    .replace("<form className={cx('nform'", "<form className={cx('nform', !live && 'is-unavailable'")
    .replace("          disabled={status === 'loading'}\n          required", "          disabled={!live || status === 'loading'}\n          required")
    .replace(
      "<button type=\"submit\" className=\"nform__btn\" disabled={status === 'loading'}>",
      "<button type=\"submit\" className=\"nform__btn\" disabled={!live || status === 'loading'}>",
    )
    .replace(
      "          {message && (",
      "          {!live && (\n            <p className=\"is-note\">{UNAVAILABLE_NOTE}</p>\n          )}\n          {live && message && (",
    )
    .replace("import { cx } from '../../utils/format.js';", "import { cx } from '../../utils/format.js';\n\n/** Shown instead of a form that cannot submit (see `services/newsletter.js`). */\nconst UNAVAILABLE_NOTE = 'Newsletter sign-up opens once the subscription service is connected.';");

/**
 * The house's own record. `mock/data/content.js` carries a prototype `site`
 * block — a `care@…example` address, care hours, and three links to the social
 * platforms' own home pages — plus a rail of three sample announcements, one of
 * which advertises the sample offer. None of that is this house's record:
 * identity and the rail belong to the boundary module `mock/data/site.js` (the
 * port's barrel already exports both from there). The content sheet therefore
 * points at it, and the prototype values do not ship.
 */
const contentFactsRewrite = (file, source) =>
  source
    .replace(
      /\/\* Brand \+ site configuration[\s\S]*?\n\};\n/,
      "import { site } from './site.js';\n\n/* The house's identity and the announcement rail are a boundary concern:\n   see `mock/data/site.js`, this port's own record of both. */\nexport { site };\n",
    )
    .replace(/\nexport const announcements = \[[\s\S]*?\];\n/, "\n")
    /* The trust strip's help line was the design's care hours, which this
       application does not hold. It now names the surface that does exist. */
    .replace(
      "text: site.contact.hours, to: '/pages/contact'",
      "text: 'Reach our team through the contact page', to: '/pages/contact'",
    );

/** Rewrite 7 — THE ART. The design's registry is carried over key-for-key; only
 *  its base path moves, to the plate directory staged for this port (the
 *  application's own media library is never written to). */
const artBaseRewrite = (file, source) => source.replace("const base = '/images/';", "const base = '/aarna-design/';");

/**
 * Rewrite 8 — THE FOOTER'S FACTS. The design's footer prints a prototype
 * contact block (a `care@…example` address, care hours) and a prototype
 * disclaimer ("Prototype storefront — sample catalogue, prices and offers").
 * Neither is a business fact here: the address is a placeholder, and this
 * application does sell. The contact lines render only when the application
 * actually holds the detail, and the signature states nothing it cannot back.
 */
const footerFactsRewrite = (file, source) =>
  source
    .replace(
      "              <li><a href={`mailto:${site.contact.email}`}>{site.contact.email.split('@')[0]}@<wbr />{site.contact.email.split('@')[1]}</a></li>",
      "              {site.contact.email && <li><a href={`mailto:${site.contact.email}`}>{site.contact.email}</a></li>}",
    )
    .replace("              <li>{site.contact.hours}</li>", "              {site.contact.hours && <li>{site.contact.hours}</li>}")
    .replace("              <li>{site.contact.city}</li>", "              {site.contact.city && <li>{site.contact.city}</li>}")
    .replace(
      "<p>© {new Date().getFullYear()} {site.brand}. Prototype storefront — sample catalogue, prices and offers.</p>",
      "<p>© {new Date().getFullYear()} {site.brand}. All rights reserved.</p>",
    );

/**
 * Rewrite 9 — LIVE CURATION. The design's lookbooks name four sample pieces by
 * id. Those ids do not exist in this catalogue, and inventing replacements for
 * them would be inventing merchandise: the sections ask the live catalogue for
 * the same thing the design asked its sample data for — the first four pieces
 * of the edit — and render however many come back (zero included).
 */
const sareeCurationRewrite = (file, source) =>
  source.replace(
    "  const row = getByIds(['p02', 'p01', 'p14', 'p17']);",
    "  const row = getProductsFor('sarees').slice(0, 4);",
  );

const kurtiCurationRewrite = (file, source) =>
  source
    .replace("const PAIRINGS = ['p19', 'p18', 'p14', 'p17'];", "const PAIRING_KEYS = ['kurtis'];")
    .replace("const fill = getByIds(PAIRINGS)", "const fill = PAIRING_KEYS.flatMap(getProductsFor)");

/** Rewrite 10 — THE BARREL. `site` (brand + contact details) and the
 *  announcement lines come from the application's own configuration; every
 *  other export is the design's own editorial content, unchanged. */
const barrelRewrite = (file, source) => {
  const pattern = /^export \{[\s\S]*?\} from '\.\.\/mock\/data\/content\.js';$/m;
  const match = source.match(pattern);
  if (!match) return source;
  const names = match[0]
    .replace(/^export \{/, "")
    .replace(/\} from '\.\.\/mock\/data\/content\.js';$/, "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const editorial = names.filter((name) => name !== "site" && name !== "announcements");
  return source.replace(
    match[0],
    `export { site, announcements } from '../mock/data/site.js';\nexport {\n  ${editorial.join(", ")},\n} from '../mock/data/content.js';`,
  );
};

/** The rewrites, in the order they are applied, each keyed by the file it owns. */
export const REWRITES = [
  { id: "routing", files: Object.keys(CLOSURE).filter((file) => /\.jsx?$/.test(file)), apply: routingRewrite },
  { id: "fetch-priority", files: ["components/sections/Hero.jsx"], apply: fetchPriorityRewrite },
  { id: "logo-plate", files: ["components/ui/Logo.jsx"], apply: logoPlateRewrite },
  { id: "offer-copy", files: ["components/shopping/CartDrawer.jsx"], apply: offerCopyRewrite },
  { id: "layout-slot", files: ["components/layout/Layout.jsx"], apply: layoutSlotRewrite },
  { id: "newsletter-capability", files: ["components/ui/NewsletterForm.jsx"], apply: newsletterCapabilityRewrite },
  { id: "art-base", files: ["mock/assets/images.js"], apply: artBaseRewrite },
  { id: "footer-facts", files: ["components/layout/Footer.jsx"], apply: footerFactsRewrite },
  { id: "saree-curation", files: ["components/sections/SareeLookbook.jsx"], apply: sareeCurationRewrite },
  { id: "kurti-curation", files: ["components/sections/KurtiLookbook.jsx"], apply: kurtiCurationRewrite },
  { id: "barrel", files: ["data/index.js"], apply: barrelRewrite },
  { id: "content-facts", files: ["mock/data/content.js"], apply: contentFactsRewrite },
];

/** Read a design file and apply every rewrite that owns it, in order. */
export function portFile(file) {
  let source = readFileSync(join(DESIGN_SRC, file), "utf8");
  for (const rewrite of REWRITES) if (rewrite.files.includes(file)) source = rewrite.apply(file, source);
  return source;
}

/** True when the port of this file differs from the design's own file. */
const isRewritten = (file) => portFile(file) !== readFileSync(join(DESIGN_SRC, file), "utf8");

/* ────────────────────────────── the stylesheet ──────────────────────────── */

/** The design's sheets, in the order `main.jsx` loads them. */
export const SOURCE_SHEETS = [
  "tokens.css",
  "base.css",
  "layout.css",
  "sections.css",
  "product.css",
  "shopping.css",
  "pages.css",
];

/** The banner written above each sheet in the port, so provenance is visible. */
export const sheetBanner = (name) => `/* ══ ${name} — home-page/src/styles/${name} (verbatim declarations, scoped) ══ */`;

/**
 * The two keyframes the design defines with generic global names. They are
 * renamed, and their references rewritten, so the port cannot collide with the
 * host application's own `spin`/`pulse`.
 */
export const KEYFRAME_RENAMES = { spin: "aan-spin", pulse: "aan-pulse" };

const matchBrace = (css, open) => {
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return css.length;
};

/** Comments blanked out, same length: braces inside prose are not structure. */
const masked = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));

/** Split CSS into top-level blocks: `{ prelude, body }` in source order. */
export function blocks(css) {
  const found = [];
  const maskedCss = masked(css);
  let index = 0;
  while (index < css.length) {
    const open = maskedCss.indexOf("{", index);
    if (open === -1) break;
    const close = matchBrace(maskedCss, open);
    found.push({ prelude: css.slice(index, open), body: css.slice(open + 1, close) });
    index = close + 1;
  }
  return found;
}

/** A block's prelude, split into the comments it carries and its selector. */
const splitPrelude = (prelude) => {
  const comments = prelude.match(/\/\*[\s\S]*?\*\//g) ?? [];
  const head = prelude.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  const lead = prelude.slice(0, prelude.search(/\S/)).replace(/[^\n]*$/, "");
  return { comments, head, lead };
};

/** Rename a keyframe at-rule's own name, so it cannot collide with the host's. */
const renameKeyframed = (prelude) =>
  prelude.replace(/@keyframes\s+([\w-]+)/, (match, name) => `@keyframes ${KEYFRAME_RENAMES[name] ?? name}`);

/** Rewrite references to the renamed keyframes inside declaration values. */
const renameAnimationRefs = (declarations) =>
  declarations.replace(
    /(^|[;{]\s*)(animation|animation-name)(\s*:\s*)([^;}]+)/g,
    (match, lead, property, colon, value) =>
      `${lead}${property}${colon}${value.replace(/\b(spin|pulse)\b/g, (name) => KEYFRAME_RENAMES[name] ?? name)}`,
  );

/** Scope one comma-separated selector list under the port root. */
export function scopeSelectorList(list) {
  return list
    .split(",")
    .map((part) => {
      const selector = part.trim();
      if (!selector) return selector;
      if (selector.startsWith("*")) {
        const suffix = selector.slice(1);
        return `${SCOPE}${suffix}, ${SCOPE} *${suffix}`;
      }
      if (/^(?::root|html|body)\b/.test(selector)) return SCOPE + selector.replace(/^(?::root|html|body)/, "");
      return `${SCOPE} ${selector}`;
    })
    .join(", ");
}

/** The whole transform: scope selectors, rename the two global keyframes. */
export function scopeCss(css) {
  let out = "";
  let cursor = 0;
  let index = 0;
  const maskedCss = masked(css);
  while (index < css.length) {
    const open = maskedCss.indexOf("{", index);
    if (open === -1) break;
    const close = matchBrace(maskedCss, open);
    const { comments, head, lead } = splitPrelude(css.slice(index, open));
    let selector = head;
    let body = css.slice(open + 1, close);
    if (/^@(media|container|supports|layer)\b/.test(head)) {
      body = scopeCss(body);
    } else if (/^@keyframes\b/.test(head)) {
      selector = renameKeyframed(head);
    } else if (head.startsWith("@")) {
      /* @font-face, @property, @page … nothing to scope. */
    } else {
      selector = scopeSelectorList(head);
      body = renameAnimationRefs(body);
    }
    out += css.slice(cursor, index)
      + lead
      + (comments.length ? `${comments.join("\n")}\n` : "")
      + selector
      + "{"
      + body
      + "}";
    cursor = close + 1;
    index = cursor;
  }
  return out + css.slice(cursor);
}

/**
 * Every leaf rule of a stylesheet, with the at-rule context it sits in.
 * Used by the regression suite to prove that each selector is scoped and that
 * each declaration survived — a structure, not a regex over the whole file.
 */
export function parseCssRules(css, conditions = []) {
  const rules = [];
  for (const block of blocks(css)) {
    /* Comments are not part of a selector: a sheet banner ahead of a rule must
       not be read as one. */
    const head = splitPrelude(block.prelude).head;
    if (!head) continue;
    if (/^@(media|container|supports|layer)\b/.test(head)) {
      rules.push(...parseCssRules(block.body, [...conditions, head]));
    } else if (/^@keyframes\b/.test(head)) {
      for (const step of blocks(block.body)) {
        if (step.prelude.trim()) rules.push({ type: "keyframe-step", name: head, selector: step.prelude.trim(), declarations: step.body, conditions });
      }
    } else if (head.startsWith("@")) {
      rules.push({ type: "at-rule", selector: head, declarations: block.body, conditions });
    } else {
      rules.push({ type: "rule", selector: head, declarations: block.body, conditions });
    }
  }
  return rules;
}

/** Every declaration line of a stylesheet, as `property: value` strings. */
export function parseDeclarations(css) {
  return parseCssRules(css)
    .flatMap((rule) => rule.declarations.split(";"))
    .map((declaration) => declaration.replace(/\s+/g, " ").trim())
    .filter((declaration) => declaration && !declaration.startsWith("/*"));
}

/** The design's seven sheets, concatenated in load order. */
export function readSourceCss(stylesDir = DESIGN_STYLES) {
  return SOURCE_SHEETS.map((name) => `${sheetBanner(name)}\n${readFileSync(join(stylesDir, name), "utf8")}`).join("\n");
}

/** The transform of those seven sheets — what `aarna.css` must be. */
export function buildPortCss(stylesDir = DESIGN_STYLES) {
  return SOURCE_SHEETS.map((name) => `${sheetBanner(name)}\n${scopeCss(readFileSync(join(stylesDir, name), "utf8"))}`).join("\n");
}

/* ────────────────────────────── the CLI ────────────────────────────────── */

const write = (file, contents) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
};

const differingLines = (a, b) => {
  const pool = new Map();
  for (const line of b.split("\n")) pool.set(line, (pool.get(line) ?? 0) + 1);
  let missing = 0;
  for (const line of a.split("\n")) {
    const count = pool.get(line) ?? 0;
    if (count === 0) missing += 1;
    else pool.set(line, count - 1);
  }
  return missing;
};

const runCopy = () => {
  const report = [];
  for (const file of Object.keys(CLOSURE)) {
    const contents = portFile(file);
    write(join(PORT_DIR, file), contents);
    const changed = differingLines(readFileSync(join(DESIGN_SRC, file), "utf8"), contents);
    report.push(`${changed === CLOSURE[file] ? "ok  " : "FAIL"} ${String(changed).padStart(3)} ${file}`);
  }
  return report;
};

const runCheck = () => {
  const problems = [];
  for (const file of Object.keys(CLOSURE)) {
    const design = readFileSync(join(DESIGN_SRC, file), "utf8");
    const ported = readFileSync(join(PORT_DIR, file), "utf8");
    const changed = differingLines(design, ported);
    if (changed !== CLOSURE[file]) problems.push(`${file}: ${changed} changed lines, expected ${CLOSURE[file]}`);
    const expected = isRewritten(file) ? portFile(file) : design;
    if (expected !== ported) problems.push(`${file}: does not match the tool's own output`);
  }
  for (const file of ADDED) {
    if (!existsSync(join(PORT_DIR, file))) problems.push(`${file}: missing from the port`);
  }
  const css = buildPortCss();
  if (readFileSync(PORT_CSS, "utf8") !== css) problems.push("aarna.css: does not match the transform of the design's stylesheets");
  return problems;
};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.includes("--copy")) {
    for (const line of runCopy()) console.log(line);
    console.log(`\ncopied ${Object.keys(CLOSURE).length} design files into ${PORT_RELATIVE}`);
  }
  if (args.includes("--css")) {
    write(PORT_CSS, buildPortCss());
    console.log(`wrote ${PORT_RELATIVE}/aarna.css (${readFileSync(PORT_CSS, "utf8").length} bytes, ${SOURCE_SHEETS.length} sheets)`);
  }
  if (args.includes("--check")) {
    const problems = runCheck();
    console.log(problems.length ? problems.join("\n") : `the port matches the design (${Object.keys(CLOSURE).length} copied files, ${buildPortCss().length} bytes of CSS)`);
    process.exitCode = problems.length ? 1 : 0;
  }
}
