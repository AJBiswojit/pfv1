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
 */

import { getLiveStorefrontProducts } from '../../../../data/products/index.js';
import { resolveMediaUrl } from '../../../../services/media/mediaPaths.js';
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

/** The canonical path of a record, from its own category/subcategory ids. */
const canonicalPathFor = (product) => {
  const wanted = [product.subcategory, product.category].filter(Boolean).map(String);
  for (const wanted_ of wanted) {
    const found = canonicalRecords.find(
      (entry) => entry.record.id === wanted_ || entry.record.slug === wanted_,
    );
    if (found?.record?.path) return found.record.path;
  }
  return null;
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
