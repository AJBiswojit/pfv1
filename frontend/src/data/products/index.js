/**
 * PRATIKSHYA FASHON — Product access facade.
 *
 * All product records come from the backend-fed catalog store
 * (`src/services/catalog/catalogStore.js`) hydrated from GET /products,
 * GET /categories, GET /collections. There is no static seed, no
 * localStorage register and no demo fallback — a missing backend results in
 * loading/error/empty UI, never fake merchandise.
 *
 * The exported `products`, `categoryCounts`, `subcategoriesByCategory` and
 * `catalogueValues` are live proxies so the existing component interfaces
 * keep working while the store updates.
 */

import { slugify } from "../../services/catalogRepository";
import { PRODUCT_MEDIA_ROLES } from "../../config/mediaTypes";
import {
  toStorefrontProduct,
  getProductById,
  getProductByIdentifier,
  getAllProducts as readLiveProducts,
  catalogueValues as readCatalogueValues,
  categoryCounts as readCategoryCounts,
  subcategoriesByCategory as readSubcategoriesByCategory,
  ensureProduct,
} from "../../services/catalog/catalogStore";
import { getCategory as resolveCategory, categoryLabels as liveCategoryLabels } from "./taxonomy";

export { slugify, toStorefrontProduct, ensureProduct };

export const normaliseSearchText = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Live array — reads the current backend snapshot on every access. */
export const products = new Proxy([], {
  get: (_, prop) => {
    const list = readLiveProducts();
    if (prop === "length") return list.length;
    if (typeof prop === "symbol") return list[prop];
    if (prop in list) return list[prop];
    const value = Reflect.get(list, prop);
    return typeof value === "function" ? value.bind(list) : value;
  },
  has: (_, prop) => prop in readLiveProducts(),
});

/** Live counts object — reads the current snapshot on every access. */
export const categoryCounts = new Proxy({}, {
  get: (_, prop) => readCategoryCounts()[prop],
  ownKeys: () => Object.keys(readCategoryCounts()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/** Live subcategory map. */
export const subcategoriesByCategory = new Proxy({}, {
  get: (_, prop) => readSubcategoriesByCategory()[prop],
  ownKeys: () => Object.keys(readSubcategoriesByCategory()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/** Live facet vocabulary. */
export const catalogueValues = new Proxy({}, {
  get: (_, prop) => readCatalogueValues()[prop],
  ownKeys: () => Object.keys(readCatalogueValues()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

export const getLiveStorefrontProducts = () => readLiveProducts();

export const getProductBySlug = (slug) =>
  readLiveProducts().find((p) => p.slug === slug) ?? null;

export const productHref = (product) => `/product/${product.id}`;

export { getProductById, getProductByIdentifier, resolveCategory as getCategory, liveCategoryLabels as categoryLabels };

export default products;
