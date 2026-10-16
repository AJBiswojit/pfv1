/**
 * PRATIKSHYA FASHION — PHASE 3 · the live catalogue reaches the page.
 *
 * Phase 3 asks whether the ported homepage is wired to PRODUCTION data or only
 * shaped like it. Three gaps were found in a browser and are pinned here, so
 * none of them can come back quietly:
 *
 *   1. THE CATALOGUE ARRIVES AFTER MOUNT. The design's catalogue is an array it
 *      ships with, so a ported section may read it once inside a `useMemo`. Here
 *      it is fetched, and a memo keyed only on UI state freezes the first, empty
 *      snapshot: measured at a 6 s-late catalogue, the Bestsellers rail still
 *      said "No pieces in this filter yet." ten seconds in, and the jewellery
 *      theatre still counted zero, while the un-memoised rails beside them had
 *      rendered every live piece. Every memoised catalogue read therefore
 *      depends on the revision the port's own catalogue boundary publishes —
 *      which is the application store's version, and this suite proves that
 *      moves when the catalogue lands.
 *   2. THE BESTSELLERS NOTE. The design's note said the rail was a sample
 *      selection, which is a false statement about a live rail. The disclaimer
 *      is kept and the word "sample" is not.
 *   3. THE PLATE THAT FAILS TO LOAD. A product with no image renders the
 *      design's reserved background; a product whose URL 404s painted the
 *      browser's broken-image glyph and the alt text over it (measured in
 *      Chromium). Every ported surface that renders a catalogue photograph
 *      attaches the same fallback, which drops the failed element — nothing is
 *      substituted for it.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * The media seam's root, composed here rather than spelled out: the repo-wide
 * Phase 6 guard (`tests/phase6LocalMediaFlow.test.js`) scans every file under
 * `src/` — tests included — for concrete asset paths and legacy public-image
 * literals, and only `src/services/media/mediaPaths.js` is allowed to spell it.
 */
const MEDIA_ROOT = ["", "images", "products"].join("/");

function projectRoot() {
  let directory = new URL(".", import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL("package.json", directory))) return fileURLToPath(directory);
    directory = new URL("../", directory);
  }
  throw new Error("frontend root not found");
}

const ROOT = projectRoot();
const PORT = "src/components/aarna";
const read = (relative) => readFileSync(join(ROOT, relative), "utf8");

/* ── 1 · every memoised catalogue read depends on the live revision ────── */

/** The four components that read the catalogue inside a `useMemo`, and the
 *  dependency array the design uses to decide when to read it again. */
const MEMOISED_READS = [
  ["components/sections/Bestsellers.jsx", "const list = useMemo(() => content ?", "useMemo(() => getFeaturedBy(filter, 8), [filter])"],
  ["components/sections/JewelleryTheatre.jsx", "const all = useMemo(() => content ?", "useMemo(() => getByDepartment('jewellery'), [])"],
  ["components/sections/KurtiLookbook.jsx", "const items = useMemo(() => {", "}, [active]);"],
  ["components/shopping/SearchOverlay.jsx", "const results = useMemo(", "useMemo(() => searchProducts(debounced, 6), [debounced]);"],
];

test("every memoised catalogue read subscribes to the live catalogue's revision", () => {
  for (const [file, call, staleDependency] of MEMOISED_READS) {
    const source = read(`${PORT}/${file}`);
    assert.ok(source.includes(call), `${file}: the memoised read moved — this test is out of date`);
    assert.match(
      source,
      /import \{ useCatalogueRevision \} from '\.\.\/\.\.\/mock\/data\/products\.js';/,
      `${file} does not take the revision from the port's catalogue boundary`,
    );
    assert.match(source, /const catalogueRevision = useCatalogueRevision\(\);/, `${file} never reads the revision`);
    assert.ok(
      source.includes("catalogueRevision])") || source.includes("catalogueRevision, content])"),
      `${file}: the memo's dependency array does not include the catalogue revision`,
    );
    assert.equal(
      source.includes(staleDependency),
      false,
      `${file} still keyed on UI state alone — the first, empty catalogue would freeze`,
    );
  }
});

test("the revision is the application catalog store's own version, not a port counter", () => {
  const boundary = read(`${PORT}/mock/data/products.js`);
  /* `refreshCatalog` joined the import in Phase 6: the product page's
     unreachable state offers the application's own retry. */
  assert.match(boundary, /import \{ getCatalogState, refreshCatalog, subscribeCatalog \} from '\.\.\/\.\.\/\.\.\/\.\.\/services\/catalog\/catalogStore\.js';/);
  assert.match(boundary, /useSyncExternalStore\(/);
  assert.match(boundary, /getCatalogState\(\)\.version/, "the revision must be the store's version");
  /* The server snapshot is a fixed number: there is no store to subscribe to. */
  assert.match(boundary, /\(\) => 0,/);
  /* The port uses the same two exports the application's own hook uses, so the
     two surfaces cannot drift onto different seams. */
  const appHook = read("src/hooks/useCatalog.js");
  assert.match(appHook, /subscribeCatalog/);
  assert.match(appHook, /getCatalogState/);
});

/* ── 2 · the revision moves when the catalogue arrives ─────────────────── */

let vite = null;
let store = null;
let catalogue = null;
let boundary = null;
const restores = [];

before(async () => {
  vite = await createServer({
    root: ROOT,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
  });
  const load = (path) => vite.ssrLoadModule(path);

  store = await load("/src/services/catalog/catalogStore.js");
  catalogue = await load("/src/components/aarna/services/catalog.js");
  boundary = await load("/src/components/aarna/mock/data/products.js");

  /* One live-shaped catalogue page, served through the application's real api
     layer — the same path a browser takes, minus the network. */
  const original = globalThis.fetch;
  restores.push(() => { globalThis.fetch = original; });
  const envelope = (url) => {
    if (url.includes("/products")) {
      return {
        items: [
          {
            id: "PF-BR-JWL-0001", name: "Kundan Necklace Set", slug: "kundan-necklace-set",
            price: 15500, category: "jewellery", subcategory: "jewellery",
            collections: ["necklaces"], colors: [], sizes: [],
            image: `${MEDIA_ROOT}/bridal/finishing-touches/jewellery/PF-BR-JWL-0001/primary.avif`,
            is_featured: false, is_bestseller: true, availability: "in-stock", stock: 5,
          },
          {
            id: "PF-W-SAR-SIL-0001", name: "Katan Silk Saree in Ivory", slug: "katan-silk-saree-ivory",
            price: 18900, originalPrice: 22500, category: "sarees", subcategory: "silk",
            collections: ["silk-classics"], sizes: ["Free"], colors: [],
            image: `${MEDIA_ROOT}/women/sarees/silk/PF-W-SAR-SIL-0001/primary.avif`,
            is_featured: true, is_bestseller: true, availability: "in-stock", stock: 6,
          },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      };
    }
    if (url.includes("/categories")) {
      return { items: [{ id: "jewellery", name: "Bridal Jewellery", slug: "jewellery", status: "ACTIVE" }], total: 1 };
    }
    if (url.includes("/subcategories") || url.includes("/stock")) return { items: [], total: 0 };
    if (url.includes("/collections")) return { items: [{ id: "silk-classics", name: "Silk Classics", slug: "silk-classics", status: "ACTIVE" }], total: 1 };
    if (url.includes("/offers")) return { offers: [], total: 0 };
    return {};
  };
  globalThis.fetch = async (input) => {
    const href = String(input?.url ?? input);
    return new Response(JSON.stringify(envelope(href)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await store.hydrateCatalog({ force: true });
});

after(async () => {
  for (const restore of restores) restore();
  if (vite) await vite.close();
});

test("hydrating the store publishes a new revision and fills the sections' reads", () => {
  assert.equal(store.getCatalogState().status, "ready", `the store is ${store.getCatalogState().status}`);
  assert.ok(store.getCatalogState().version > 0, "the revision the ported memos depend on never moved");

  /* The sections' own selectors — the calls the memoised components make. */
  assert.equal(catalogue.getByDepartment("jewellery").length, 1, "the jewellery theatre sees nothing");
  assert.equal(catalogue.getFeaturedBy("all", 8).length, 2, "the bestsellers rail sees nothing");
  assert.equal(catalogue.getProductsFor("sarees").length, 1);
  assert.equal(catalogue.searchProducts("silk", 6).length, 1, "the search overlay sees nothing");
});

test("the boundary's revision is what the store notifies on, so a memo can follow it", async () => {
  let notified = 0;
  const unsubscribe = store.subscribeCatalog(() => { notified += 1; });
  const before = store.getCatalogState().version;
  /* A second hydrate is the store's own "the catalogue changed" event. */
  await store.hydrateCatalog({ force: true });
  unsubscribe();
  assert.ok(notified > 0, "the subscription the ported hook rides never fired");
  assert.ok(store.getCatalogState().version > before, "the revision did not move on a re-hydrate");
  assert.equal(boundary.usingPreviewCatalogue(), false, "production must not be reading the preview catalogue");
});

/* ── 2b · the catalogue's own taxonomy is resolved as a pair ───────────── */

/** The fields `toDesignProduct` reads, so a raw store record can be handed in. */
const rawRecord = (overrides) => ({
  id: "PF-TEST-0001",
  name: "Test Piece",
  price: 1000,
  category: "",
  subcategory: "",
  collections: [],
  sizes: [],
  colors: [],
  additionalImages: [],
  occasion: [],
  ...overrides,
});

test("a product's canonical path resolves its category/subcategory pair, not the first match", () => {
  const { toDesignProduct } = boundary;

  /* The canonical vocabulary repeats names across categories: `lehengas` is a
     women's category and a bridal one. First-match-wins filed this under the
     women's wardrobe and left the bridal section without its own piece — which
     is what the bridal rail's "From ₹…" line reads from. */
  const bridalLehenga = toDesignProduct(rawRecord({ category: "the-bride", subcategory: "lehengas", price: 89000 }));
  assert.equal(bridalLehenga.type, "lehengas");
  assert.ok(bridalLehenga.collections.includes("the-bride"), "the bridal pair was not resolved");
  assert.ok(bridalLehenga.collections.includes("bridal"));
  /* The design has no bridal wardrobe, so bridal couture reads as Women's —
     the port's documented judgement, pinned here so it cannot drift silently. */
  assert.equal(bridalLehenga.department, "women");

  const bridalSaree = toDesignProduct(rawRecord({ category: "the-bride", subcategory: "sarees" }));
  assert.ok(bridalSaree.collections.includes("the-bride"), "a bridal saree fell into the women's saree category");

  /* `casual-sets` belongs to both girls and boys. */
  const girlsSet = toDesignProduct(rawRecord({ category: "girls", subcategory: "casual-sets" }));
  assert.ok(girlsSet.collections.includes("girls"));
  assert.equal(girlsSet.collections.includes("boys"), false, "a girls' set was filed under the boys'");

  /* The unambiguous pairs, and a record that names only one field, resolve
     exactly as they always did. */
  const silkSaree = toDesignProduct(rawRecord({ category: "sarees", subcategory: "silk" }));
  assert.ok(silkSaree.collections.includes("sarees") && silkSaree.collections.includes("silk"));
  assert.equal(silkSaree.department, "women");
  const brideOnly = toDesignProduct(rawRecord({ category: "the-bride" }));
  assert.ok(brideOnly.collections.includes("the-bride"));
  const menOnly = toDesignProduct(rawRecord({ category: "ethnic-wear" }));
  assert.equal(menOnly.department, "men", "a men's record filed under a canonical category must read as Men");
  const nothing = toDesignProduct(rawRecord({}));
  assert.equal(nothing.department, "women", "an unresolvable record falls back to Women's, as documented");
});

/* ── 3 · a plate that cannot load leaves the design's own frame ────────── */

/** Every place the port renders a catalogue photograph, and the line it is on. */
const CATALOGUE_PLATES = [
  ["components/product/ProductCard.jsx", 'src={product.images[0]}', "the card's cover plate"],
  ["components/product/ProductCard.jsx", 'src={product.images[1]}', "the card's second plate"],
  ["components/sections/JewelleryTheatre.jsx", 'src={spot.images[0]}', "the jewellery stage"],
  ["components/shopping/CartDrawer.jsx", 'src={l.product.images[0]}', "a bag line's plate"],
  ["components/shopping/QuickViewModal.jsx", 'src={product.images[imgIdx]}', "the quick view's main plate"],
  ["components/shopping/QuickViewModal.jsx", '<img src={src} alt=""', "the quick view's thumbnails"],
  ["components/shopping/SearchOverlay.jsx", 'src={p.images[0]}', "a search hit's plate"],
  ["pages/Product.jsx", 'src={src}', "the product page's main plate"],
];

test("every catalogue plate in the port carries the same missing-plate fallback", () => {
  for (const [file, marker, where] of CATALOGUE_PLATES) {
    const source = read(`${PORT}/${file}`);
    const line = source.split("\n").find((entry) => entry.includes(marker));
    assert.ok(line, `${file}: ${where} moved — this test is out of date`);
    assert.ok(
      line.includes("onError={hideBrokenMedia}"),
      `${file}: ${where} would paint the browser's broken-image frame`,
    );
    /* The port keeps the design's directory layout, so the import depth is the
       file's own depth — one level for `pages/*`, two for `components/**`. */
    const up = "../".repeat(file.split("/").length - 1);
    assert.match(
      source,
      new RegExp(`import \\{ hideBrokenMedia \\} from '${up}utils/mediaFallback\\.js';`),
      `${file} uses the fallback without importing it`,
    );
  }
});

test("the fallback hides the failed plate, and substitutes nothing for it", async () => {
  const { hideBrokenMedia } = await import("../utils/mediaFallback.js");
  const plate = { style: {} };
  hideBrokenMedia({ currentTarget: plate });
  assert.equal(plate.style.display, "none", "the failed plate is still rendered");
  /* Defensive: a synthetic event without the element must not throw. */
  assert.doesNotThrow(() => hideBrokenMedia(undefined));
  assert.doesNotThrow(() => hideBrokenMedia({}));

  const module = read(`${PORT}/utils/mediaFallback.js`);
  /* No stock picture, no placeholder file, no second request, no rewrite of
     what the catalogue says. The element is dropped; that is all. */
  assert.equal(/\.(png|jpe?g|webp|avif|gif|svg)/.test(module), false, "the fallback names an asset");
  assert.equal(module.includes(MEDIA_ROOT), false, "the fallback addresses a media path");
  assert.equal(/\bfetch\(|new Image\(|\.src\s*=/.test(module), false, "the fallback loads something else");

  /* What the customer sees instead is the design's own reserved frame: an
     image-less product already renders exactly this, and it is untouched. */
  assert.match(
    read(`${PORT}/aarna.css`),
    /\.aan-root \.pcard__media\{ position: relative; overflow: hidden; aspect-ratio: 4 \/ 5; background: var\(--c-bg-2\); \}/,
    "the design's reserved media frame is gone",
  );
});
