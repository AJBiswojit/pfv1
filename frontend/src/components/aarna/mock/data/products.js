/**
 * PRATIKSHYA FASHION — PHASE 2D · the catalogue boundary.
 *
 * ADAPTED AT THE BOUNDARY.
 *
 * The design's `mock/data/products.js` is a hand-written sample catalogue:
 * twenty-odd rows with prototype prices, stock, fabrics and "featured" flags,
 * and a comment above them saying exactly that. This module keeps the module's
 * job — a synchronous list in the design's product shape — and answers it from
 * THIS application's catalogue instead:
 *
 *     live catalogue (backend) → toDesignProduct() → the design's product shape
 *
 * The design's shape, and where each field comes from:
 *
 *   id, name, slug ................ the record's own
 *   price, compareAt .............. `price`, `originalPrice` (compareAt only when
 *                                   it is genuinely higher than the price, which
 *                                   is what the design's `Price` compares)
 *   images[0..1] .................. the record's cover and first gallery plate,
 *                                   resolved through the application's media
 *                                   resolver (never a hard-coded path)
 *   badge ......................... the record's own badge label (`label`), or
 *                                   nothing — this port does not invent badges
 *   department .................... one of the design's five wardrobes, derived
 *                                   from the record's canonical taxonomy path
 *                                   (bridal reads as Women, finishing-touches
 *                                   as Jewellery, essentials as Essentials)
 *   type .......................... the canonical subcategory, mapped through
 *                                   the design's own vocabulary aliases
 *   collections ................... every segment of the canonical path, plus the
 *                                   record's managed collection ids, plus the
 *                                   design-vocabulary aliases — so the design's
 *                                   `getProductsFor(key)` filters (which match on
 *                                   department, type, collection or occasion)
 *                                   keep working against live taxonomy
 *   occasions ..................... the record's own occasion tags
 *   options ....................... one option group, from the record's sizes
 *                                   (falling back to its colours), each value
 *                                   carrying its own availability
 *   featured ...................... `isFeatured || isBestseller` — the two flags
 *                                   the business sets, which is what the
 *                                   design's rails mean by "featured"
 *   fabric, craft, description .... the record's own, verbatim
 *
 * EMPTY IS A VALID ANSWER. With no backend the list is empty, every derived
 * section renders empty rails, and no sample row is substituted.
 *
 * PREVIEW SEAM. `setPreviewCatalogueSource()` lets the development reference surface
 * substitute the design's own labelled sample catalogue so the ported sections
 * can be compared with the design section by section. It is called from that
 * surface alone (see `src/components/storefront/preview/AarnaPreview.jsx`);
 * nothing in the port's own module graph imports it.
 *
 * THE CATALOGUE ARRIVES LATE, AND THAT IS THE POINT of `useCatalogueRevision()`.
 * The design's catalogue is a synchronous array it ships with, so a ported
 * section could read it once inside a `useMemo` and stay right forever. This one
 * is fetched after mount, so a memo keyed only on UI state freezes the first,
 * empty snapshot — measured in the browser, the Bestsellers rail still read "No
 * pieces in this filter yet." ten seconds after the catalogue had landed. The
 * revision below is the store's own version counter, published through the same
 * subscription this application's catalog store already offers; a ported
 * component that memoises a read takes it as a dependency and is invalidated
 * exactly when the catalogue changes.
 */

import { useMemo, useSyncExternalStore } from 'react';
import { getLiveStorefrontProducts } from '../../../../data/products/index.js';
import { getCatalogState, refreshCatalog, subscribeCatalog } from '../../../../services/catalog/catalogStore.js';
import { resolveMediaUrl } from '../../../../services/media/mediaPaths.js';
import { getMaxQuantity } from '../../../../utils/shopping.js';
import { departments as canonicalDepartments } from '../../../../data/catalog/taxonomy.js';

/* ── canonical taxonomy, flattened once ─────────────────────────────── */

const canonicalRecords = [];
for (const department of canonicalDepartments ?? []) {
  canonicalRecords.push({ record: department, parent: null });
  for (const category of department.categories ?? []) {
    canonicalRecords.push({ record: category, parent: department });
    for (const subcategory of category.subcategories ?? []) {
      canonicalRecords.push({ record: subcategory, parent: category, grandparent: department });
    }
  }
}

const matchesReference = (record, value) => Boolean(value) && (record.id === value || record.slug === value);

/**
 * The canonical path of a record, from its own category/subcategory references.
 *
 * Both fields are matched by id or slug. The canonical vocabulary repeats names
 * across categories — `lehengas` is a women's category AND a bridal one, `sarees`
 * likewise, and `casual-sets` belongs to both girls and boys — so when the record
 * names both fields, only a CONSISTENT pair may answer: the subcategory has to sit
 * under the category the record names. First-match-wins filed a `the-bride`
 * lehenga under the women's wardrobe (`women/lehengas` is walked first) and a
 * girls' set under the boys'; this resolves the pair instead.
 *
 * Order, and nothing else is guessed:
 *
 *   1. a subcategory whose own category/department chain carries the record's
 *      category — the pair the record itself states;
 *   2. otherwise the subcategory's first match (what the port did before);
 *   3. otherwise the category's own match — a record that names a subcategory
 *      this taxonomy does not hold is still filed under the category it names;
 *   4. otherwise no path, and the record's wardrobe falls back to Women.
 */
const canonicalPathFor = (product) => {
  const subcategory = product.subcategory ? String(product.subcategory) : '';
  const category = product.category ? String(product.category) : '';

  const subcategoryMatches = subcategory
    ? canonicalRecords.filter((entry) => matchesReference(entry.record, subcategory))
    : [];
  const consistent =
    (category &&
      subcategoryMatches.find((entry) =>
        [entry.parent, entry.grandparent].filter(Boolean).some((ancestor) => matchesReference(ancestor, category)),
      )) ||
    null;

  const chosen =
    consistent ??
    subcategoryMatches.find((entry) => entry.record.path) ??
    (category ? canonicalRecords.find((entry) => matchesReference(entry.record, category)) : null);

  return chosen?.record?.path ?? null;
};

/**
 * The design's five wardrobes, from the canonical path. Documented because it
 * is a judgement: this house files bridal couture under its own department,
 * where the design's homepage reads it as part of the women's wardrobe, and
 * files jewellery under bridal finishing touches, where the design reads it as
 * its own wardrobe.
 */
const departmentFor = (path) => {
  const segments = String(path ?? '').split('/').filter(Boolean);
  if (segments[0] === 'men') return 'men';
  if (segments[0] === 'kids') return 'kids';
  if (segments.includes('jewellery') || segments.includes('finishing-touches')) return 'jewellery';
  if (segments.includes('essentials')) return 'essentials';
  return 'women';
};

/**
 * The design's own vocabulary, mapped onto this catalogue's. Only where the
 * two names mean the same merchandise; a key that is absent stays absent, and
 * the design's section shows what the catalogue actually holds.
 */
const DESIGN_ALIASES = {
  'kurtis-suits': ['kurtis'],
  'dupattas-stoles': ['dupattas'],
  't-shirt-shorts': ['boys'],
  'casual-sets': ['girls'],
  banarasi: ['silk-classics'],
  cotton: ['everyday-elegance'],
  'ethnic-wear': ['kurta-sets', 'sherwanis', 'bandhgalas', 'kurtas'],
  groom: ['the-groom'],
  'the-bride': ['bridal'],
  jewellery: ['necklaces', 'maang-tikka', 'jhumkas', 'rings'],
  bangles: ['bangles'],
  essentials: ['bags', 'footwear', 'accessories'],
};

const aliasesFor = (segments) => {
  const aliases = new Set();
  for (const segment of segments) for (const alias of DESIGN_ALIASES[segment] ?? []) aliases.add(alias);
  return [...aliases];
};

const asList = (value) => (Array.isArray(value) ? value.filter(Boolean) : value === null || value === undefined ? [] : [value]);

/* ── mapping ────────────────────────────────────────────────────────── */

/** Map one live catalogue record into the design's product shape. */
export const toDesignProduct = (product) => {
  if (!product) return null;
  const path = canonicalPathFor(product) ?? '';
  const segments = String(path).split('/').filter(Boolean);
  const collections = [
    ...new Set([...segments, ...aliasesFor(segments), ...asList(product.collections), product.collection].filter(Boolean)),
  ].map(String);
  const prices = Number(product.price);
  const compareAt = Number(product.originalPrice);

  const optionValues = (values, unavailable) =>
    asList(values).map((value) => ({ value: String(value), available: !asList(unavailable).map(String).includes(String(value)) }));
  const sizes = optionValues(product.sizes, product.unavailableSizes);
  const colors = optionValues(product.colors, product.unavailableColors);

  /* ── availability, in this application's terms ──────────────────────────
     The design's product has no availability at all (its sample catalogue is
     always buyable), so every ported surface that has to answer "can this be
     bought?" would otherwise have to invent one. Two things come from the
     record, and nothing is derived twice:

       · the ceiling is this application's own rule —
         `utils/shopping.js::getMaxQuantity`, the same function the production
         product page validates against — never a second copy of it;
       · the copy is `ProductPurchasePanel.jsx::availabilityCopy`'s untracked
         branch word for word (unavailable / made-to-order / low-stock /
         in-stock). The tracked branch of that function reads the live inventory
         dashboard (`InventoryContext`), a second source the catalogue record
         does not carry, so the ported page states what the catalogue publishes —
         the same thing the production page shows for a piece whose inventory is
         not tracked — and the stock ceiling above already caps what can be
         bagged. */
  const availability = String(product.availability ?? 'in-stock');
  const inStock = product.inStock !== false && availability !== 'unavailable';
  const maxQuantity = getMaxQuantity(product);
  const availabilityCopy =
    !inStock ? 'Currently unavailable'
      : availability === 'made-to-order' ? 'Available for order · Made for you'
        : availability === 'low-stock' ? 'Only a few left'
          : 'In stock · Ready to dispatch';

  return {
    id: String(product.id),
    slug: String(product.slug ?? product.id),
    name: String(product.name ?? ''),
    price: Number.isFinite(prices) ? prices : 0,
    compareAt: Number.isFinite(compareAt) && compareAt > prices ? compareAt : null,
    images: [resolveMediaUrl(product.image), ...asList(product.additionalImages).map(resolveMediaUrl)].filter(Boolean),
    badge: product.label ?? null,
    department: departmentFor(path),
    type: segments[segments.length - 1] ?? product.category ?? 'all',
    collections,
    occasions: asList(product.occasion).map(String),
    fabric: String(product.fabric ?? ''),
    craft: String(product.material ?? ''),
    description: String(product.description ?? ''),
    featured: Boolean(product.isFeatured || product.isBestseller),
    options: [
      ...(sizes.length ? [{ name: 'Size', values: sizes }] : []),
      ...(!sizes.length && colors.length ? [{ name: 'Colour', values: colors }] : []),
    ],
    /* Availability + the real purchasing ceiling, and the long-form detail the
       production product page shows (care, delivery, returns, specifications).
       Empty strings stay empty — the page renders nothing rather than prose the
       catalogue did not publish. */
    availability,
    availabilityCopy,
    inStock,
    maxQuantity,
    details: String(product.details ?? ''),
    care: asList(product.careInstructions).map(String).filter(Boolean),
    deliveryInfo: String(product.deliveryInfo ?? ''),
    returnInfo: String(product.returnInfo ?? ''),
    specifications: product.specifications && typeof product.specifications === 'object'
      ? Object.fromEntries(
        Object.entries(product.specifications)
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .map(([key, value]) => [key, String(value)]),
      )
      : {},
  };
};

/* ── the seam ───────────────────────────────────────────────────────── */

let previewCatalogue = null;

/** Preview-only substitution (see the module header). Pass `null` to clear. */
export const setPreviewCatalogueSource = (list) => {
  previewCatalogue = Array.isArray(list) ? list : null;
};

/** True while the reference surface is showing the design's sample catalogue. */
export const usingPreviewCatalogue = () => previewCatalogue !== null;

const readDesignProducts = () =>
  previewCatalogue ?? (getLiveStorefrontProducts() ?? []).map(toDesignProduct).filter(Boolean);

/** The catalogue lookup the routing shim uses to turn a slug into its id. */
export const findProductBySlug = (slug) =>
  readDesignProducts().find((product) => product.slug === slug || product.id === slug) ?? null;

/**
 * ONE PRODUCT, WITH THE CATALOGUE'S OWN STATE.
 *
 * The design's product page could assume its sample catalogue was already in
 * memory: `getProductBySlug(slug)` returning `null` meant "no such piece", and
 * the page said so. This application's catalogue is fetched after mount, so an
 * empty read means one of three different things, and the page must not confuse
 * them:
 *
 *   loading  the catalogue is still arriving — render the design's own loading
 *   error    the catalogue is unreachable — say so, and offer the retry the
 *            application already has (`refreshCatalog`)
 *   missing  the catalogue is loaded and holds no such record — a real 404
 *
 * Returns `{ product, state }`, where `product` is the design's shape or null.
 * The state is only ever `loading`, `error` or `ready`; `ready` with a null
 * product IS the missing case, so a caller has one branch to write.
 */
export const useCatalogueProduct = (slug) => {
  const catalogueRevision = useCatalogueRevision();
  /* The store's own status, subscribed exactly the way the application's
     `hooks/useCatalog.js` subscribes to it — the same function for the client
     snapshot and for the server snapshot. A fixed server snapshot would make a
     server render (or any snapshot-based audit) report "the catalogue has not
     arrived" over a catalogue that is already in memory, and the page would
     answer "loading" where the browser answers "no such piece". */
  const catalogueStatus = useSyncExternalStore(subscribeCatalog, getCatalogState, getCatalogState).status;

  const product = useMemo(() => findProductBySlug(slug), [slug, catalogueRevision]);

  if (product) return { product, state: 'ready' };

  /* A MISS IS ONLY A 404 WHEN THE CATALOGUE FULLY LOADED.
     `ready` means every feed answered, so an absent piece is genuinely absent.
     `partial` means the store kept what it could — its own note says
     "product-dependent sections are honestly empty" and that the failure
     "remain[s] observable" — and a lookup cannot be answered from a catalogue
     that may be short of rows: the piece could exist and simply not have
     loaded. The port shows the honest failure instead of asserting the piece is
     not there, which is also what the production page does (it renders a load
     error, never a false 404). The cost of that bias, stated plainly: when only
     an unrelated feed failed, a genuine 404 also renders as the error state. */
  if (catalogueStatus === 'ready') return { product: null, state: 'ready' };
  const failed = catalogueStatus === 'error' || catalogueStatus === 'partial';
  return { product: null, state: failed ? 'error' : 'loading' };
};

/**
 * The application's own catalogue retry, for the ported page's error state.
 * Nothing here re-fetches by itself: it calls the store's existing refresh.
 */
export const retryCatalogue = () => refreshCatalog();

/**
 * The live catalogue's revision, as a React subscription.
 *
 * A number, not the data: the ported components read the catalogue through
 * `services/catalog.js` exactly as the design does, and take this as the
 * dependency that invalidates a memoised read. It changes whenever the
 * application's catalog store emits (hydration, refresh, an on-demand detail
 * fetch) and is `0` on the server, where there is no store to subscribe to.
 */
export const useCatalogueRevision = () =>
  useSyncExternalStore(
    subscribeCatalog,
    () => getCatalogState().version,
    () => 0,
  );

/**
 * The live catalogue in the design's shape. Proxied rather than copied so that
 * every read — `products.find(...)`, `products.filter(...)`, `products.length` —
 * sees the catalogue as it is now, the way the application's own `products`
 * facade works.
 */
export const products = new Proxy([], {
  get: (_target, property) => {
    const list = readDesignProducts();
    const value = list[property];
    return typeof value === "function" ? value.bind(list) : value;
  },
  has: (_target, property) => property in readDesignProducts(),
  ownKeys: () => Reflect.ownKeys(readDesignProducts()),
  getOwnPropertyDescriptor: (_target, property) =>
    Reflect.getOwnPropertyDescriptor(readDesignProducts(), property) ?? {
      configurable: true,
      enumerable: true,
      value: undefined,
    },
});
