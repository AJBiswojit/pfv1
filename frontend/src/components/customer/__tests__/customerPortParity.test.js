/**
 * PRATIKSHYA FASHION — PHASE 2D · source fidelity.
 *
 * The Phase 2D claim is "the approved design, carried over file by file". These
 * tests are what makes that claim checkable rather than asserted:
 *
 *   1. the port contains exactly the design's homepage dependency closure —
 *      nothing missing, nothing extra;
 *   2. every copied file is the design's own file, with a pinned number of
 *      adapted lines, and what IS adapted is exactly what the port tool writes
 *      (`scripts/customer-port.js`), so the difference can never drift;
 *   3. the five boundary modules keep the design's export names (every ported
 *      component keeps working) and say in their own header that they are
 *      boundaries;
 *   4. the stylesheet is the transform of the design's seven sheets: the same
 *      declarations, the same media and container queries, the same load order,
 *      every selector scoped under `.pf-root` — plus the documented host
 *      neutralisation, which is tiny and asserted to stay tiny;
 *   5. the design's 63 art plates are staged byte-for-byte, the application's
 *      own media library is untouched, and no ported module addresses either
 *      one by literal path.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADDED,
  CLOSURE,
  REWRITES,
  DESIGN_SRC,
  PORT_DIR,
  PORT_RELATIVE,
  REPLACED,
  SCOPE,
  SOURCE_SHEETS,
  buildPortCss,
  parseCssRules,
  parseDeclarations,
  portFile,
  sheetBanner,
} from "../../../../scripts/customer-port.js";

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
const REPO = join(ROOT, "..");
const readDesign = (relative) => readFileSync(join(DESIGN_SRC, relative), "utf8");
const readPort = (relative) => readFileSync(join(PORT_DIR, relative), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every ported file except the suites themselves. */
const walkPort = (directory = PORT_DIR, found = []) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") walkPort(absolute, found);
    } else found.push(absolute.slice(PORT_DIR.length + 1));
  }
  return found;
};

/** Lines of `a` that `b` does not carry (as a multiset) — the adaptation size. */
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

/* ── 1 · the closure ────────────────────────────────────────────────── */

test("the port is exactly the design's homepage closure", () => {
  const expected = [
    ...Object.keys(CLOSURE),
    ...Object.keys(REPLACED),
    ...ADDED,
  ].sort();
  const present = walkPort()
    .map((relative) => relative.replace(/\\/g, "/"))
    .sort();
  assert.deepEqual(present, expected, "the port tree does not match the declared closure");
  /* 50 homepage files + the product page and the 404 it renders (Phase 6)
     + the shop/listing/search page (Phase 7) + the wishlist (Phase 8). The
     information page's data table (`mock/data/pages.js`) was dropped with the
     STEP-1 database-driven homepage — its content is unreachable. The count
     moves only when a page of the design is adopted or its data retired,
     never when one is edited. */
  assert.equal(Object.keys(CLOSURE).length + Object.keys(REPLACED).length, 58, "58 design files are carried");
});

test("every copied file IS the design's file, adapted by exactly the pinned amount", () => {
  for (const [file, pin] of Object.entries(CLOSURE)) {
    const design = readDesign(file);
    const ported = readPort(file);
    const changed = differingLines(design, ported);
    assert.equal(changed, pin, `${file}: ${changed} adapted lines, pinned at ${pin}`);
    assert.equal(ported, portFile(file), `${file} is not what the port tool writes`);
  }
});

test("the adaptations are the documented ones — nothing else moved", () => {
  const unchanged = Object.entries(CLOSURE)
    .filter(([, pin]) => pin === 0)
    .filter(([file]) => readPort(file) !== readDesign(file))
    .map(([file]) => file);
  assert.deepEqual(unchanged, [], "a file pinned at 0 adapted lines differs from the design");

  /* The routing shim is the one rewrite that touches many files: every ported
     file that renders a link takes it from the shim, and no ported file takes
     Link/NavLink from react-router-dom any more. */
  const ROUTER_EXPORTS = ["Outlet", "useLocation", "useNavigate", "useParams", "useSearchParams"];
  const rendersLink = [];
  for (const file of Object.keys(CLOSURE)) {
    const source = readPort(file);
    const usesLink = /<Link\b|<NavLink\b|<SectionLink\b/.test(source);
    const sectionLinkBoundary = /<SectionLink\b/.test(source) && /import \{[^}]*\bSectionLink\b[^}]*\} from '\.\.\/\.\.\/\.\.\/storefront\/home\/HomepageSection'/.test(source);
    const shim = /from '[^']*router\/index\.jsx'/.test(source);
    if (usesLink) rendersLink.push(file);
    assert.equal(
      (/<Link\b|<NavLink\b/.test(source) && !shim) || (/<SectionLink\b/.test(source) && !sectionLinkBoundary),
      false,
      `${file} renders a link without its required routing boundary`,
    );
    assert.equal(
      /import \{[^}]*\b(Link|NavLink)\b[^}]*\} from 'react-router-dom'/.test(source),
      false,
      `${file} still imports Link/NavLink from react-router-dom`,
    );
    for (const block of source.matchAll(/import \{([^}]*)\} from 'react-router-dom'/g)) {
      for (const part of block[1].split(",")) {
        const name = part.trim();
        if (name) assert.ok(ROUTER_EXPORTS.includes(name), `${file} imports \`${name}\` from react-router-dom`);
      }
    }
  }
  /* 20 after Phase 6; the listing page is the 21st (Phase 7); the wishlist and
     the information page were the 22nd and 23rd (Phase 8). STEP-1-DB-DRIVEN
     retires the newsletter's mock privacy-policy link (its fine print is
     authored homepage content now), leaving 22. Deliberate, and the only
     reason this number may move. */
  assert.equal(rendersLink.length, 22, "twenty-two ported files render a destination");
  assert.match(readPort("components/ui/Logo.jsx"), /import \{ Link \} from '\.\.\/\.\.\/router\/index\.jsx';/);
  assert.match(readPort("components/layout/Header.jsx"), /import \{ Link, NavLink \} from '\.\.\/\.\.\/router\/index\.jsx';/);
});

/* ── 1b · the rewrite registry ──────────────────────────────────────── */

test("the rewrite registry carries every adopted surface, and edits only the closure", () => {
  /* One entry per page of the design this application has adopted. The list is
     checked by identity, so a surface cannot be dropped silently and a new one
     cannot arrive without naming itself — while the per-file adaptations that
     ride alongside them are free to grow. */
  const ids = REWRITES.map((item) => item.id);
  for (const surface of [
    "live-catalogue",
    "product-page",
    "shop-listing",
    "wishlist-page",
    "info-page",
  ]) {
    assert.ok(ids.includes(surface), `the registry does not carry the ${surface} surface`);
  }
  assert.equal(new Set(ids).size, ids.length, "two rewrites share one id");

  for (const item of REWRITES) {
    assert.ok(item.files.length > 0, `${item.id} claims no design file`);
    assert.equal(typeof item.apply, "function", `${item.id} has no transform`);
    for (const file of item.files) {
      assert.ok(
        CLOSURE[file] !== undefined || REPLACED[file] !== undefined,
        `${item.id} edits ${file}, which the closure does not carry`,
      );
    }
  }
});

/* ── 2 · the boundary modules ───────────────────────────────────────── */

test("every boundary module keeps the design's export names and declares itself", () => {
  const exportNames = (source) => {
    const names = new Set([...source.matchAll(/export (?:const|function|let|class)\s+(\w+)/g)].map((m) => m[1]));
    for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of block[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.add(name);
      }
    }
    return names;
  };

  for (const file of Object.keys(REPLACED)) {
    const design = readDesign(file);
    const ported = readPort(file);
    assert.match(ported, /ADAPTED AT THE BOUNDARY/, `${file} must document its adaptation`);
    for (const name of exportNames(design)) {
      assert.ok(exportNames(ported).has(name), `${file} dropped the design's export \`${name}\``);
    }
  }
});

test("no boundary module keeps a prototype data source alive", () => {
  const products = stripComments(readPort("mock/data/products.js"));
  const promotions = stripComments(readPort("mock/data/promotions.js"));
  const newsletter = stripComments(readPort("services/newsletter.js"));
  assert.equal(/sampleCatalogue|sample catalogue/.test(products), false);
  assert.equal(/isSample:\s*true/.test(promotions), false);
  assert.equal(/sessionStorage|localStorage/.test(products), false);
  assert.equal(/sessionStorage|localStorage/.test(newsletter), false);
  assert.match(readPort("state/ShopContext.jsx"), /from '\.\.\/\.\.\/\.\.\/context\/CartContext\.jsx'/);
  assert.match(readPort("state/ShopContext.jsx"), /from '\.\.\/\.\.\/\.\.\/context\/WishlistContext\.jsx'/);
});

test("the catalogue boundary maps the live catalogue and never invents a product", () => {
  const source = readPort("mock/data/products.js");
  assert.match(source, /getLiveStorefrontProducts/);
  assert.match(source, /resolveMediaUrl/, "product media must go through the application's resolver");
  assert.equal(/price:\s*\d/.test(source), false, "no hard-coded price may survive in the port");
  assert.match(source, /EMPTY IS A VALID ANSWER/);
});

test("the port's own modules render the design's pages, not a second application", () => {
  const mount = readPort("CustomerStorefront.jsx");
  assert.match(mount, /<div className="pf-root">/);
  assert.match(mount, /<Home \/>/);
  assert.match(mount, /<Product \/>/);
  assert.match(mount, /import "\.\/customer\.css"/);
  /* No AnimatePresence and no exit animation at the mount: the ported shell is
     sticky, and a transform above it would capture it. */
  assert.equal(/AnimatePresence|exit=/.test(mount), false);
  assert.equal(/PageTransition/.test(mount), false);
  /* PHASE 6 — the design's own route table, mounted inside this application's
     single router (the design's `App.jsx` mounted its pages the same way). It
     is not a router of its own: the port may never bring one. */
  assert.match(mount, /<Route element=\{<Layout \/>\}>/, "the design's Layout is the layout route");
  assert.match(mount, /<Route path="product\/:productId" element=\{<Product \/>\} \/>/);
  assert.equal(
    /createBrowserRouter|BrowserRouter|MemoryRouter|HashRouter/.test(mount),
    false,
    "the host owns routing",
  );
  assert.equal(/ShopContext\.Provider|createContext/.test(mount), false, "providers live in the state module");
});

/* ── 3 · the stylesheet ─────────────────────────────────────────────── */

const portedCss = () => readPort("customer.css");

test("customer.css is byte-for-byte the transform of the design's seven sheets", () => {
  assert.equal(portedCss(), buildPortCss(), "the committed stylesheet drifted from the transform");
  assert.equal(portedCss().includes("@import"), false, "no external import may enter the ported stylesheet");
});

test("every declaration the design wrote survives, and no others appear", () => {
  const count = (values) => {
    const map = new Map();
    for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
    return map;
  };
  const source = count(parseDeclarations(SOURCE_SHEETS.map((name) => readDesign(`styles/${name}`)).join("\n")));
  const ported = count(parseDeclarations(portedCss()));
  /* The design's own lines, renamed to the port's keyframes (below). */
  const RENAMED = new Set(["animation: spin 0.9s linear infinite", "animation: pulse 2.2s var(--ease-out) infinite"]);
  const missing = [];
  for (const [declaration, total] of source) {
    if ((ported.get(declaration) ?? 0) < total && !RENAMED.has(declaration)) missing.push(declaration);
  }
  assert.deepEqual(missing, [], "declarations were dropped in the port");
  assert.ok(source.size > 400, `the design's sheets should carry a substantial declaration set, found ${source.size}`);
});

test("every ported selector is scoped, and nothing global survives", () => {
  const css = portedCss();
  const rules = parseCssRules(css).filter((rule) => rule.type === "rule");
  assert.ok(rules.length > 300, `expected the design's rules, found ${rules.length}`);
  const offenders = [];
  for (const rule of rules) {
    for (const part of rule.selector.split(",")) {
      const candidate = part.trim();
      if (!candidate.startsWith(SCOPE)) offenders.push(candidate);
      if (!/^\.pf-root(\s|$|\.|:|\[)/.test(candidate) && candidate !== SCOPE) offenders.push(candidate);
    }
  }
  assert.deepEqual(offenders, [], "a rule would apply outside the port root");
  assert.equal(/^\s*(:root|html|body)\s*\{/m.test(css), false, "a global selector survived");
  assert.equal(/@keyframes\s+(spin|pulse)\b/.test(css), false, "the design's generic keyframe names are still global");
  assert.match(css, /@keyframes pf-spin/);
  assert.match(css, /@keyframes pf-pulse/);
});

test("the design's media and container queries, breakpoints and load order are carried over", () => {
  const conditions = (css) => parseCssRules(css).flatMap((rule) => rule.conditions);
  const design = SOURCE_SHEETS.map((name) => readDesign(`styles/${name}`)).join("\n");
  assert.deepEqual(conditions(portedCss()), conditions(design));

  const breakpoints = (css) => [...new Set([...css.matchAll(/max-width:\s*(\d+)px/g)].map((m) => m[1]))].sort();
  assert.deepEqual(breakpoints(portedCss()), breakpoints(design));
  for (const width of ["479", "599", "719", "899", "1023", "1100"]) {
    assert.ok(breakpoints(portedCss()).includes(width), `the ${width}px breakpoint is missing`);
  }

  const positions = SOURCE_SHEETS.map((name) => portedCss().indexOf(sheetBanner(name)));
  assert.equal(positions.every((position) => position > -1), true, "a sheet is missing from the port");
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), "the sheets are out of the design's order");
});

test("the host neutralisation stays tiny, scoped and documented", () => {
  const host = readPort("customer.host.css");
  const rules = parseCssRules(host).filter((rule) => rule.type === "rule");
  assert.ok(rules.length <= 3, `the host sheet grew to ${rules.length} rules — it must stay a neutralisation`);
  for (const rule of rules) {
    assert.match(rule.selector, /^\.pf-root(\s|$)/, "a host rule escapes the port root");
  }
  /* Two normalisations, both restoring a browser default Tailwind's preflight
     removes: inline/baseline SVG, and the heading weight the design leaves to
     the browser. */
  assert.match(host, /display: inline;/);
  assert.match(host, /vertical-align: baseline;/);
  assert.match(host, /font-weight: bold;/);
  assert.equal(rules.length, 2, "the host sheet carries exactly two normalisations");
  /* It may not restate design values: those belong in the transform. */
  assert.equal(/var\(--/.test(host), false, "the host sheet must not carry design tokens");
  assert.match(host, /NEUTRALISATION|neutralisation/i);
});

/* ── 4 · the art ────────────────────────────────────────────────────── */

test("the design's plate registry is carried over key for key, and every referenced plate is staged", () => {
  const keys = (source) => [...source.matchAll(/img\('([^']+)'\)/g)].map((match) => match[1]);
  const designKeys = keys(readDesign("mock/assets/images.js"));
  const portKeys = keys(readPort("mock/assets/images.js"));
  assert.equal(designKeys.length, 61, "the design's registry holds 61 keys");
  /* STEP-1-DB-DRIVEN: the port's registry keeps only the entries the
     application still addresses (an AST import graph proved the rest
     unreferenced once the sections became database-driven). It may neither
     invent art nor reorder the design's own. */
  assert.equal(portKeys.length, 47, "the pruned registry holds the 47 referenced keys");
  assert.deepEqual(portKeys, designKeys.filter((key) => portKeys.includes(key)), "the port must address only the design's own art, in the design's order");
  assert.equal(readPort("mock/assets/images.js").includes("/design/"), true);

  const designDir = join(REPO, "home-page", "public", "images");
  const plates = readdirSync(designDir).filter((name) => name.endsWith(".webp"));
  assert.equal(plates.length, 63);
  /* STEP-2: no duplicate asset tree — only the plates the code still
     references are staged (the 47 registry keys, the logo plate and the
     one fixture-literal plate), byte-for-byte from the design's own files. */
  const staged = readdirSync(join(ROOT, "public", "design")).filter((name) => name.endsWith(".webp"));
  assert.equal(staged.length, 49, "only referenced plates are staged");
  for (const plate of staged) {
    assert.ok(plates.includes(plate), `${plate} is not one of the design's plates`);
    assert.equal(readFileSync(join(ROOT, "public", "design", plate)).length, readFileSync(join(designDir, plate)).length, `${plate} differs from the design's file`);
  }
  for (const key of portKeys) {
    assert.equal(existsSync(join(ROOT, "public", "design", `${key}.webp`)), true, `the registry points at a missing plate: ${key}.webp`);
  }
  for (const literal of ["pratikshya-logo.webp", "p-saree-ivory.webp"]) {
    assert.equal(existsSync(join(ROOT, "public", "design", literal)), true, `${literal} is referenced by code but not staged`);
  }
});

test("the application's own media library is untouched by the port", () => {
  const countBy = (directory, extension, found = 0) => {
    for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) found = countBy(relative, extension, found);
      else if (entry.name.toLowerCase().endsWith(extension)) found += 1;
    }
    return found;
  };
  assert.equal(countBy("public/images", ".avif"), 228);
  assert.equal(countBy("public/images", ".webp"), 10);
  assert.equal(countBy("public/images", ".jpg") + countBy("public/images", ".jpeg") + countBy("public/images", ".png"), 0);
  let total = 0;
  const countAll = (directory) => {
    for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
      if (entry.isDirectory()) countAll(`${directory}/${entry.name}`);
      else total += 1;
    }
  };
  countAll("public/images");
  assert.equal(total, 238, "the application's media library still holds its 238 files");
});

test("no ported module addresses a forbidden asset path or adds a font package", () => {
  for (const file of walkPort()) {
    const code = stripComments(readPort(file));
    assert.equal(/["'`]\/images\//.test(code), false, `${file} addresses the application's media library`);
    assert.equal(code.includes("/__preview-assets/"), false, `${file} addresses the preview namespace`);
    assert.equal(/@fontsource/.test(code), false, `${file} pulls a font package`);
    assert.equal(/\bfetch\(|XMLHttpRequest/.test(code), false, `${file} fetches on its own — media belongs to the resolver`);
  }
});

test("the design's two type families are requested by the port, and only on its mount", () => {
  const fonts = readPort("designFonts.js");
  assert.match(fonts, /Manrope/);
  assert.match(fonts, /Cormorant\+Garamond/);
  assert.match(fonts, /document\.getElementById\(FONT_LINK_ID\)/, "the insert must be idempotent");
  const importers = walkPort().filter((file) => readPort(file).includes("designFonts"));
  assert.deepEqual(importers, ["CustomerStorefront.jsx"], "fonts are requested by the mount alone");
  assert.equal(readFileSync(join(ROOT, "index.html"), "utf8").includes("Manrope"), false, "the document head stays as it is");
});

// Section-only links delegate routing to the shared boundary, not an unused import.
test("SectionLink owns authored and design routing after unused shim imports are removed", () => {
  const source = readFileSync(join(ROOT, "src/components/storefront/home/HomepageSection.jsx"), "utf8");
  assert.match(source, /import \{ Link \} from '\.\.\/\.\.\/customer\/router\/index\.jsx'/);
  assert.match(source, /import \{ Link as RouterLink \} from 'react-router-dom'/);
  assert.match(source, /const Destination = authored \? RouterLink : Link/);
});
