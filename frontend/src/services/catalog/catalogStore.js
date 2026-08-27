/**
 * PRATIKSHYA FASHON — Backend-fed catalog store.
 *
 * The single runtime source for storefront product, category and collection
 * data. It is hydrated once from the FastAPI backend:
 *
 *   GET /products                → published storefront products
 *   GET /categories              → active categories + subcategories
 *   GET /collections             → active collections
 *   GET /products/{id}           → on-demand product detail (cache miss)
 *
 * There is NO static seed and NO localStorage fallback. If the backend is
 * unreachable the store carries an error; UI renders loading / error / empty
 * states from `status`, never demo data.
 *
 * The sync getters below keep the existing component interfaces working
 * (catalogRepository.all(), taxonomyRepository.activeCategories(), etc.) —
 * they read the in-memory snapshot, which is replaced after each hydrate.
 */

import { apiListProducts, apiGetProduct } from "../api/productsApi";
import { apiListCategories, apiListSubcategories } from "../api/categoriesApi";
import { apiListCollections } from "../api/collectionsApi";
import { apiGetHome } from "../api/searchApi";
import { apiListOffers } from "../api/offersApi";
import { PRODUCT_MEDIA_ROLES } from "../../config/mediaTypes";

export const CATALOG_CHANGED_EVENT = "pf:catalog-changed";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const state = {
  status: "idle",          // idle | loading | ready | error
  error: null,
  products: [],            // normalised storefront products
  byId: new Map(),
  bySlug: new Map(),
  categories: [],          // active categories (raw API shape)
  subcategories: {},       // categoryId -> [subcategory, ...]
  collections: [],         // active collections
  offers: [],
  offersError: null,
  home: null,              // GET /home payload (hero, sections, sale banner)
};

const listeners = new Set();
let hydratePromise = null;
let started = false;
let version = 0;
let snapshot = { ...state, version };
let taxonomySnapshot = { categories: state.categories, collections: state.collections, subcategories: state.subcategories, version };

function rebuildSnapshots() {
  snapshot = { ...state, version };
  taxonomySnapshot = {
    categories: state.categories,
    collections: state.collections,
    subcategories: state.subcategories,
    version,
  };
}

function emit() {
  version += 1;
  rebuildSnapshots();
  listeners.forEach((fn) => {
    try { fn(); } catch { /* listener errors are isolated */ }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CATALOG_CHANGED_EVENT));
  }
}

export function subscribeCatalog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCatalogState() {
  return snapshot;
}

export function getCatalogTaxonomySnapshot() {
  return taxonomySnapshot;
}

// ---------------------------------------------------------------------------
// Product normalisation (mirrors the old toStorefrontProduct contract)
// ---------------------------------------------------------------------------

const availabilityLabels = {
  "in-stock": "In Stock",
  "low-stock": "Only a Few Left",
  "made-to-order": "Available for Order",
  unavailable: "Currently Unavailable",
};

const percentOff = (price, originalPrice) =>
  typeof originalPrice === "number" && originalPrice > price
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : null;

const categoryLabelFor = (categoryId) => {
  const found = state.categories.find((c) => c.id === categoryId || c.slug === categoryId);
  return found?.name ?? found?.label ?? categoryId;
};

const collectionLabelFor = (collectionId) => {
  const found = state.collections.find((c) => c.id === collectionId || c.slug === collectionId || c.name === collectionId);
  return found?.name ?? collectionId;
};

export function toStorefrontProduct(product) {
  const id = product.id;
  const colors = Array.isArray(product.colors) ? product.colors : [];
  const sizes = Array.isArray(product.sizes) ? product.sizes : [];
  const image = product.image ?? product.additionalImages?.[0] ?? null;
  const gallery = (product.additionalImages ?? []).filter(Boolean);

  return {
    ...product,
    id,
    categoryLabel: categoryLabelFor(product.category),
    collection: collectionLabelFor(product.collection ?? product.collections?.[0]),
    collectionIds: Array.isArray(product.collectionIds) ? product.collectionIds : [],
    collections: Array.isArray(product.collections) ? product.collections : [],
    originalPrice: product.originalPrice ?? null,
    discount: percentOff(product.price, product.originalPrice),
    currency: "INR",
    image,
    additionalImages: gallery,
    images: {
      primary: image ? { id: `${id}-primary`, src: image, alt: `${product.name} — primary view`, role: PRODUCT_MEDIA_ROLES.COVER, view: "front" } : null,
      gallery: gallery.map((src, index) => ({
        id: `${id}-plate-${String(index + 1).padStart(2, "0")}`,
        src,
        alt: `${product.name} — view ${index + 1}`,
        role: PRODUCT_MEDIA_ROLES.GALLERY,
      })),
    },
    colors,
    unavailableColors: Array.isArray(product.unavailableColors) ? product.unavailableColors : [],
    sizes,
    unavailableSizes: Array.isArray(product.unavailableSizes) ? product.unavailableSizes : [],
    availability: product.availability ?? "in-stock",
    availabilityLabel: availabilityLabels[product.availability ?? "in-stock"],
    inStock: (product.availability ?? "in-stock") !== "unavailable",
    stock: product.stock ?? 0,
    details: product.details ?? "",
    careInstructions: product.careInstructions ?? "",
    specifications: product.specifications ?? {},
    deliveryInfo: product.deliveryInfo ?? "",
    returnInfo: product.returnInfo ?? "",
    label: Array.isArray(product.badges) ? product.badges[0] ?? null : null,
    isFeatured: Boolean(product.isFeatured ?? product.is_featured),
    isNew: Boolean(product.isNew ?? product.is_new),
    isBestseller: Boolean(product.isBestseller ?? product.is_bestseller),
    score:
      (product.rating ?? 0) * 20 +
      Math.min(product.reviewCount ?? 0, 300) / 10 +
      (product.isFeatured || product.is_featured ? 25 : 0) +
      (product.isBestseller || product.is_bestseller ? 15 : 0) +
      (product.isNew || product.is_new ? 8 : 0),
    tags: [id, product.name, product.sku, product.category, product.subcategory,
           product.gender, product.fabric, product.material,
           ...(product.occasion ?? []), ...colors, ...(product.badges ?? []), ...(product.tags ?? [])].filter(Boolean),
  };
}

function applySnapshot(products, categories, collections, subcategories = {}) {
  state.categories = categories ?? [];
  state.collections = collections ?? [];
  state.subcategories = {};
  state.products = (products ?? []).map(toStorefrontProduct);
  state.byId = new Map(state.products.map((p) => [String(p.id), p]));
  state.bySlug = new Map(state.products.filter((p) => p.slug).map((p) => [p.slug, p]));
  (state.categories ?? []).forEach((category) => {
    const list = Array.isArray(subcategories[category.id])
      ? subcategories[category.id]
      : Array.isArray(category.subcategories)
        ? category.subcategories
        : [];
    state.subcategories[category.id] = list;
    if (category.slug) state.subcategories[category.slug] = list;
  });
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

export async function hydrateCatalog({ force = false } = {}) {
  if (hydratePromise) return hydratePromise;
  if (started && !force) return hydratePromise ?? Promise.resolve(state);

  started = true;
  state.status = "loading";
  state.error = null;
  emit();

  hydratePromise = (async () => {
    const [productsResult, categoriesResult, collectionsResult, homeResult, offersResult] = await Promise.all([
      apiListProducts({ page: 1, pageSize: 100, sort: "recommended" }),
      apiListCategories({ status: "ACTIVE" }),
      apiListCollections({ status: "ACTIVE" }),
      apiGetHome(),
      // Phase 5: the shared offer cache is hydrated from the REAL coupon
      // table (GET /offers — active, non-expired), not from the explore
      // stream's static offer strip. A failed fetch leaves an explicit
      // error flag instead of silently showing nothing or stale rows.
      apiListOffers(),
    ]);

    if (!productsResult.ok) throw new Error(productsResult.error);
    if (!categoriesResult.ok) throw new Error(categoriesResult.error);
    if (!collectionsResult.ok) throw new Error(collectionsResult.error);

    const categories = categoriesResult.categories ?? categoriesResult.items ?? [];
    const subcategoryEntries = await Promise.all(
      categories.map(async (category) => {
        const result = await apiListSubcategories(category.id, { status: "ACTIVE" });
        return [category.id, result.ok ? (result.items ?? []) : []];
      })
    );
    const subcategories = Object.fromEntries(subcategoryEntries);

    applySnapshot(productsResult.items, categories, collectionsResult.collections ?? collectionsResult.items ?? [], subcategories);
    if (homeResult.ok) state.home = homeResult;
    if (offersResult.ok) {
      state.offers = offersResult.offers ?? [];
      state.offersError = null;
    } else {
      state.offers = [];
      state.offersError = offersResult.error ?? "Offers could not be loaded from the server.";
    }
    state.status = "ready";
    emit();
    return state;
  })().catch((error) => {
    state.status = "error";
    state.error = error instanceof Error ? error.message : String(error);
    emit();
    return state;
  }).finally(() => {
    hydratePromise = null;
  });

  return hydratePromise;
}

/** Refresh the catalog snapshot (called by admin after product mutations). */
export async function refreshCatalog() {
  started = false;
  return hydrateCatalog({ force: true });
}

// ---------------------------------------------------------------------------
// Sync getters (existing component API)
// ---------------------------------------------------------------------------

export const getAllProducts = () => state.products;
export const getProductById = (id) => state.byId.get(String(id)) ?? state.bySlug.get(String(id)) ?? null;
export const getProductByIdentifier = (value) => getProductById(value);
export const getCategories = () => state.categories;
export const getCollections = () => state.collections;
export const getCategoryById = (idOrSlug) =>
  state.categories.find((c) => c.id === idOrSlug || c.slug === idOrSlug) ?? null;
export const getCollectionById = (idOrSlug) =>
  state.collections.find((c) => c.id === idOrSlug || c.slug === idOrSlug) ?? null;
export const getSubcategories = (categoryId) => state.subcategories[categoryId] ?? [];
export const getHome = () => state.home;
export const getOffers = () => state.offers;

export const categoryCounts = () => {
  const counts = {};
  state.products.forEach((p) => { counts[p.category] = (counts[p.category] ?? 0) + 1; });
  return counts;
};

export const subcategoriesByCategory = () => {
  const map = {};
  state.products.forEach((p) => {
    if (!p.subcategory) return;
    const list = map[p.category] ?? (map[p.category] = []);
    if (!list.includes(p.subcategory)) list.push(p.subcategory);
  });
  return map;
};

export const catalogueValues = () => {
  const distinct = (field, { multiple = false } = {}) => {
    const seen = new Set();
    state.products.forEach((p) => {
      const value = p[field];
      if (multiple) (value ?? []).forEach((entry) => seen.add(entry));
      else if (value) seen.add(value);
    });
    return [...seen];
  };
  return {
    department: distinct("department").sort((a, b) => a.localeCompare(b)),
    subcategory: distinct("subcategory").sort((a, b) => a.localeCompare(b)),
    style: distinct("style").sort((a, b) => a.localeCompare(b)),
    fabric: distinct("fabric").sort((a, b) => a.localeCompare(b)),
    material: distinct("material").sort((a, b) => a.localeCompare(b)),
    occasion: distinct("occasion", { multiple: true }),
    color: distinct("colors", { multiple: true }),
    size: distinct("sizes", { multiple: true }),
    collection: distinct("collection").sort((a, b) => a.localeCompare(b)),
  };
};

/**
 * On-demand detail fetch (used by ProductDetail and cart/wishlist lines when
 * the snapshot does not contain the requested product, e.g. deep links).
 */
export async function ensureProduct(idOrSlug) {
  const cached = getProductById(idOrSlug);
  if (cached) return { ok: true, product: cached };
  const result = await apiGetProduct(idOrSlug);
  if (result.ok) {
    const product = toStorefrontProduct(result.product);
    if (!state.byId.has(String(product.id))) {
      state.products = [product, ...state.products];
      state.byId.set(String(product.id), product);
      if (product.slug) state.bySlug.set(product.slug, product);
      emit();
    }
  }
  return result;
}

export default {
  hydrateCatalog,
  refreshCatalog,
  subscribeCatalog,
  getCatalogState,
  getCatalogTaxonomySnapshot,
  getAllProducts,
  getProductById,
  getProductByIdentifier,
  getCategories,
  getCollections,
  getCategoryById,
  getCollectionById,
  getSubcategories,
  getHome,
  getOffers,
  categoryCounts,
  subcategoriesByCategory,
  catalogueValues,
  ensureProduct,
  toStorefrontProduct,
};
