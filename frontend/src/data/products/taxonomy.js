/**
 * PRATIKSHYA FASHON — Catalogue taxonomy facade (backend-driven).
 *
 * Category, subcategory and collection truth comes from the backend-fed
 * catalog store (GET /categories, GET /collections). This module keeps the
 * existing storefront imports working while exposing only *record* data from
 * the API. Facet definitions, sort options, price bands and navigation
 * scopes below are presentation configuration, not records.
 */

import {
  getCategories,
  getCollections,
  getCategoryById,
  getCollectionById,
} from "../../services/catalog/catalogStore";
import { catalogueNavigationScopes, departmentNames } from "../catalog/taxonomy";

const option = (id, label) => ({ id, label });
const activeCategories = () => getCategories();
const activeCollections = () => getCollections();

/** Live category list (active, from backend). */
export const categories = new Proxy([], {
  get: (_, prop) => {
    const list = activeCategories().map((category) => ({ ...category, label: category.name }));
    if (prop === "length") return list.length;
    if (typeof prop === "symbol") return list[prop];
    if (prop in list) return list[prop];
    const value = Reflect.get(list, prop);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

export const categoryLabels = new Proxy({}, {
  get: (_, key) => getCategoryById(String(key))?.name ?? String(key),
  ownKeys: () => activeCategories().map((entry) => entry.id),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

export const getCategory = (id) => getCategoryById(id);

/** Live collection list (active, from backend). */
export const collections = new Proxy([], {
  get: (_, prop) => {
    const list = activeCollections().map((collection) => ({ ...collection, label: collection.name }));
    if (prop === "length") return list.length;
    if (typeof prop === "symbol") return list[prop];
    if (prop in list) return list[prop];
    const value = Reflect.get(list, prop);
    return typeof value === "function" ? value.bind(list) : value;
  },
});

export const collectionLabels = new Proxy({}, {
  get: (_, key) => getCollectionById(String(key))?.name ?? String(key),
  ownKeys: () => activeCollections().map((entry) => entry.id),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/* ------------------------------------------------------------------ */
/* Facet vocabularies (populated from the live product snapshot via    */
/* src/data/products/index.js exports)                                 */
/* ------------------------------------------------------------------ */

export const genders = [];
export const fabrics = [];
export const materials = [];
export const occasions = [];
export const colorSwatches = {};
export const colors = [];
export const sizes = [];

export const availabilityOptions = [
  { id: "in-stock", label: "In Stock" },
  { id: "low-stock", label: "Only a Few Left" },
  { id: "made-to-order", label: "Made to Order" },
];

export const ratingOptions = [
  { id: "4.5", label: "4.5 & above" },
  { id: "4", label: "4.0 & above" },
  { id: "3.5", label: "3.5 & above" },
];

export const priceBands = [
  { id: "under-2000", label: "Under ₹2,000", min: 0, max: 2000 },
  { id: "2000-5000", label: "₹2,000 – ₹5,000", min: 2000, max: 5000 },
  { id: "5000-10000", label: "₹5,000 – ₹10,000", min: 5000, max: 10000 },
  { id: "10000-25000", label: "₹10,000 – ₹25,000", min: 10000, max: 25000 },
  { id: "25000-plus", label: "₹25,000 & above", min: 25000, max: null },
];

export const getPriceBand = (id) => priceBands.find((band) => band.id === id) ?? null;

export const sortOptions = [
  { id: "recommended", label: "Recommended" },
  { id: "newest", label: "Newest" },
  { id: "price-asc", label: "Price: Low to High" },
  { id: "price-desc", label: "Price: High to Low" },
  { id: "discount", label: "Discount" },
  { id: "name-asc", label: "Name: A–Z" },
  { id: "popularity", label: "Popularity" },
  { id: "rating", label: "Rating" },
];

export const defaultSort = "recommended";

export const filterFacets = [
  { id: "department", label: "Department", field: "department", kind: "list", options: () => Object.entries(departmentNames).map(([id, label]) => option(id, label)) },
  { id: "category", label: "Category", field: "category", kind: "list", options: () => activeCategories().map((c) => option(c.id, c.name)) },
  { id: "subcategory", label: "Style", field: "subcategory", kind: "list", options: null },
  { id: "gender", label: "Worn By", field: "gender", kind: "list", options: () => genders.map((g) => option(g, g)) },
  { id: "price", label: "Price", field: "price", kind: "band", options: () => priceBands.map((b) => option(b.id, b.label)) },
  { id: "size", label: "Size", field: "sizes", multiple: true, kind: "chip", options: null },
  { id: "color", label: "Colour", field: "colors", multiple: true, kind: "swatch", options: null },
  { id: "fabric", label: "Fabric", field: "fabric", kind: "list", options: null },
  { id: "material", label: "Craft", field: "material", kind: "list", options: null },
  { id: "occasion", label: "Occasion", field: "occasion", multiple: true, kind: "list", options: null },
  { id: "collection", label: "Collection", field: "collection", kind: "list", options: () => activeCollections().map((c) => option(c.name, c.name)) },
  { id: "rating", label: "Rating", field: "rating", kind: "band", options: () => ratingOptions },
  { id: "availability", label: "Availability", field: "availability", kind: "list", options: () => availabilityOptions },
];

export const filterKeys = filterFacets.map((facet) => facet.id);
export const getFacet = (id) => filterFacets.find((facet) => facet.id === id) ?? null;

const scope = (id, { title, eyebrow, description, image, filters = {}, breadcrumb = [] }) => ({
  id, title, eyebrow, description, image, filters, breadcrumb,
});

const categoryScope = (category) => scope(category.id, {
  title: category.name,
  eyebrow: category.eyebrow || "Category",
  description: category.description,
  image: category.image,
  heroMediaId: category.bannerMediaId ?? category.banner_media_id,
  filters: { category: category.id },
});

const collectionScope = (collection) =>
  scope(collection.id, {
    title: collection.name,
    eyebrow: collection.eyebrow || "Collection",
    description: collection.description,
    image: collection.image,
    heroMediaId: collection.heroMediaId ?? collection.hero_media_id,
    thumbnailMediaId: collection.thumbnailMediaId ?? collection.thumbnail_media_id,
    filters: { collectionId: collection.id },
  });

/** Live route map (reads the current backend snapshot). */
export const categoryRoutes = new Proxy({}, {
  get: (_, key) => {
    const category = getCategoryById(String(key));
    return category ? categoryScope(category) : undefined;
  },
  has: (_, key) => Boolean(getCategoryById(String(key))),
  ownKeys: () => activeCategories().flatMap((c) => [c.slug, c.id]).filter(Boolean),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

export const collectionRoutes = new Proxy({}, {
  get: (_, key) => {
    const collection = getCollectionById(String(key));
    return collection ? collectionScope(collection) : undefined;
  },
  has: (_, key) => Boolean(getCollectionById(String(key))),
  ownKeys: () => activeCollections().flatMap((c) => [c.slug, c.id]).filter(Boolean),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/**
 * Navigation scopes: the managed collection paths come from the backend;
 * legacy department/jewellery paths remain static presentation config.
 */
const managedCollectionScopes = Object.fromEntries(
  activeCollections().flatMap((collection) => {
    const scope = { filters: { collectionId: collection.id } };
    const paths = new Set([`/collections/${collection.id}`]);
    if (collection.slug) paths.add(`/collections/${collection.slug}`);
    return [...paths].map((path) => [path, scope]);
  })
);

export const navigationScopes = {
  ...catalogueNavigationScopes,
  "/collections": { filters: { curated: true } },
  "/collections/cotton": { filters: { fabric: "Cotton" } },
  "/collections/linen": { filters: { fabric: "Linen" } },
  "/collections/chiffon": { filters: { fabric: "Chiffon" } },
  ...managedCollectionScopes,
  "/jewellery": { filters: { department: "bridal", category: "finishing-touches" } },
  "/jewellery/bridal-bangles": { filters: { department: "bridal", category: "finishing-touches", subcategory: "bangles" } },
  "/jewellery/gold-finish-bangles": { filters: { department: "bridal", category: "finishing-touches", subcategory: "bangles", style: "gold-finish-bangles" } },
  "/jewellery/kada-and-cuffs": { filters: { department: "bridal", category: "finishing-touches", subcategory: "bangles", style: "kada-bangles" } },
  "/jewellery/earrings": { filters: { department: "bridal", category: "finishing-touches", subcategory: "jewellery", style: "earrings" } },
  "/jewellery/necklaces": { filters: { department: "bridal", category: "finishing-touches", subcategory: "jewellery", style: "necklace" } },
  "/jewellery/maang-tikka": { filters: { department: "bridal", category: "finishing-touches", subcategory: "jewellery", style: "maang-tikka" } },
  "/jewellery/rings": { filters: { department: "bridal", category: "finishing-touches", subcategory: "jewellery", style: "ring" } },
  "/jewellery/bridal-jewellery": { filters: { department: "bridal", category: "finishing-touches", subcategory: "jewellery", style: "bridal-jewellery" } },
  "/jewellery/sets-and-pairings": { filters: { department: "bridal", category: "finishing-touches", subcategory: "jewellery", style: "jewellery-set" } },
  "/women/cotton-sarees": { filters: { department: "women", category: "sarees", subcategory: "cotton" } },
  "/women/silk-sarees": { filters: { department: "women", category: "sarees", subcategory: "silk" } },
  "/women/banarasi-sarees": { filters: { department: "women", category: "sarees", subcategory: "banarasi" } },
  "/women/bridal-lehengas": { filters: { department: "women", category: "lehengas", subcategory: "bridal" } },
  "/women/party-lehengas": { filters: { department: "women", category: "lehengas", subcategory: "party" } },
  "/women/designer-lehengas": { filters: { department: "women", category: "lehengas", subcategory: "designer" } },
  "/women/kurtis-and-suits": { filters: { department: "women", category: "essentials", subcategory: "kurtis-suits" } },
  "/women/innerwear": { filters: { department: "women", category: "essentials", subcategory: "innerwear" } },
  "/women/dupattas-and-stoles": { filters: { department: "women", category: "essentials", subcategory: "dupattas-stoles" } },
  "/bridal/bridal-sarees": { filters: { department: "bridal", category: "the-bride", subcategory: "sarees" } },
  "/bridal/bridal-lehengas": { filters: { department: "bridal", category: "the-bride", subcategory: "lehengas" } },
  "/bridal/reception-wear": { filters: { department: "bridal", category: "the-bride", subcategory: "reception-wear" } },
  "/bridal/mehendi-and-haldi": { filters: { department: "bridal", category: "celebrations", subcategory: "mehendi-haldi" } },
  "/bridal/sangeet-edit": { filters: { department: "bridal", category: "celebrations", subcategory: "sangeet" } },
  "/bridal/trousseau-edit": { filters: { department: "bridal", category: "celebrations", subcategory: "trousseau" } },
  "/men/kurta-pajama": { filters: { department: "men", category: "ethnic-wear", subcategory: "kurta-pajama" } },
  "/men/nehru-jackets": { filters: { department: "men", category: "ethnic-wear", subcategory: "nehru-jackets" } },
  "/men/groom": { filters: { department: "men", category: "groom" } },
};

export const hasNavigationScope = (pathname) =>
  Object.prototype.hasOwnProperty.call(navigationScopes, pathname);

export const resolveNavigationScope = (pathname) => {
  if (!hasNavigationScope(pathname)) return null;
  const entry = navigationScopes[pathname] ?? {};
  const filters =
    entry.filters && typeof entry.filters === "object" ? entry.filters : entry;
  return { ...entry, filters: filters ?? {} };
};

export default {
  categories, genders, fabrics, materials, occasions, collections, colors,
  colorSwatches, sizes, availabilityOptions, ratingOptions, priceBands,
  sortOptions, filterFacets, categoryRoutes, collectionRoutes, navigationScopes,
};
