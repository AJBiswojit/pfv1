/**
 * PRATIKSHYA FASHON — Taxonomy repository (backend-driven).
 *
 * Categories, subcategories and collections are backend-owned
 * (GET /categories, GET /collections and the /admin/* mutation endpoints).
 * This module is a facade over the catalog store — no seeds, no
 * localStorage register, no local authority. Mutations call the backend
 * and refresh the store; failures surface through return values.
 */

import {
  getCategories,
  getCollections,
  getCategoryById,
  getCollectionById,
  getSubcategories,
  getAllProducts,
  refreshCatalog,
} from "./catalog/catalogStore";
import {
  apiAdminCreateCategory,
  apiAdminUpdateCategory,
  apiAdminArchiveCategory,
  apiAdminRestoreCategory,
  apiAdminCreateSubcategory,
  apiAdminUpdateSubcategory,
  apiAdminArchiveSubcategory,
  apiAdminRestoreSubcategory,
} from "./api/categoriesApi";
import {
  apiAdminCreateCollection,
  apiAdminUpdateCollection,
  apiAdminActivateCollection,
  apiAdminPauseCollection,
  apiAdminArchiveCollection,
  apiAdminRestoreCollection,
  apiAdminAssignCollectionProducts,
} from "./api/collectionsApi";
import { slugify } from "./catalogRepository";

export const TAXONOMY_STORAGE_KEY = "pratikshya_taxonomy_v2"; // legacy, unused
export const TAXONOMY_CHANGED_EVENT = "pratikshya-taxonomy-changed";

export const TAXONOMY_STATUS = { DRAFT: "DRAFT", ACTIVE: "ACTIVE", ARCHIVED: "ARCHIVED" };
export const COLLECTION_STATUS = {
  DRAFT: "DRAFT", SCHEDULED: "SCHEDULED", ACTIVE: "ACTIVE",
  PAUSED: "PAUSED", EXPIRED: "EXPIRED", ARCHIVED: "ARCHIVED",
};
export const COLLECTION_TYPES = { MANUAL: "MANUAL", RULE_BASED: "RULE_BASED" };

const titleCase = (value) =>
  String(value || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const byOrder = (a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);

const active = (entry) => entry.status === TAXONOMY_STATUS.ACTIVE;

const asCategory = (record) => ({
  id: record.id,
  name: record.name,
  label: record.name,
  slug: record.slug ?? record.id,
  departmentId: record.departmentId ?? null,
  eyebrow: record.eyebrow ?? "",
  description: record.description ?? "",
  image: record.image ?? null,
  bannerMediaId: record.bannerMediaId ?? record.banner_media_id ?? null,
  status: record.status ?? TAXONOMY_STATUS.ACTIVE,
  sortOrder: Number(record.sortOrder ?? 0),
  featured: Boolean(record.featured ?? record.is_featured),
  seoTitle: record.seoTitle ?? record.name,
  seoDescription: record.seoDescription ?? record.description ?? "",
  subcategories: Array.isArray(record.subcategories) ? record.subcategories.map(asSubcategory) : [],
});

const asSubcategory = (record) => ({
  id: record.id,
  categoryId: record.categoryId ?? record.category_id ?? null,
  name: record.name,
  label: record.name,
  slug: record.slug ?? record.id,
  description: record.description ?? "",
  image: record.image ?? null,
  status: record.status ?? TAXONOMY_STATUS.ACTIVE,
  sortOrder: Number(record.sortOrder ?? 0),
});

const asCollection = (record) => ({
  id: record.id,
  name: record.name,
  label: record.name,
  slug: record.slug ?? record.id,
  eyebrow: record.eyebrow ?? "",
  description: record.description ?? "",
  image: record.image ?? null,
  heroMediaId: record.heroMediaId ?? record.hero_media_id ?? null,
  thumbnailMediaId: record.thumbnailMediaId ?? record.thumbnail_media_id ?? null,
  type: record.type ?? COLLECTION_TYPES.MANUAL,
  status: record.status ?? COLLECTION_STATUS.DRAFT,
  displayStatus: record.status ?? COLLECTION_STATUS.DRAFT,
  featured: Boolean(record.featured ?? record.is_featured),
  sortOrder: Number(record.sortOrder ?? 0),
  startDate: record.startDate ?? record.start_date ?? null,
  endDate: record.endDate ?? record.end_date ?? null,
  explicitProductIds: record.explicitProductIds ?? record.explicit_product_ids ?? [],
  rule: record.rule ?? {},
});

export const normalizeTaxonomyRecord = (record, type = null) => {
  if (type === "collection" || record?.type) return asCollection(record);
  return asCategory(record);
};

export const deriveCollectionStatus = (collection) =>
  collection?.status ?? COLLECTION_STATUS.DRAFT;

const read = () => ({
  categories: getCategories().map(asCategory),
  subcategories: getCategories().flatMap((category) =>
    getSubcategories(category.id).map((sub) => asSubcategory({ ...sub, categoryId: category.id }))
  ),
  collections: getCollections().map(asCollection),
});

const productsList = () => getAllProducts();

export const taxonomyRepository = {
  all: () => read(),

  normalizeTaxonomyRecord,

  categories: () => read().categories.slice().sort(byOrder),
  activeCategories: () => taxonomyRepository.categories().filter(active),
  categoryOptions: () => taxonomyRepository.activeCategories().map((category) => ({ id: category.id, label: category.name, value: category.id })),
  findCategory: (idOrSlug) => getCategoryById(idOrSlug) ? asCategory(getCategoryById(idOrSlug)) : null,
  getCategoryLabel: (idOrSlug) => getCategoryById(idOrSlug)?.name || titleCase(idOrSlug),

  subcategories: (categoryId = null, { includeArchived = true } = {}) => {
    const list = categoryId ? getSubcategories(categoryId) : read().subcategories;
    return list.map((entry) => asSubcategory({ ...entry, categoryId: categoryId ?? entry.categoryId }))
      .filter((entry) => includeArchived || entry.status === TAXONOMY_STATUS.ACTIVE);
  },
  activeSubcategories: (categoryId = null) => taxonomyRepository.subcategories(categoryId, { includeArchived: false }),
  subcategoryOptionsFor: (categoryId) => taxonomyRepository.activeSubcategories(categoryId).map((entry) => entry.name),
  findSubcategory: (idOrSlugOrName, categoryId = null) =>
    taxonomyRepository.subcategories(categoryId).find(
      (entry) => entry.id === idOrSlugOrName || entry.slug === idOrSlugOrName || entry.name === idOrSlugOrName
    ) ?? null,

  collections: () => read().collections.map(asCollection).sort(byOrder),
  activeCollections: () => taxonomyRepository.collections().filter((entry) => entry.displayStatus === COLLECTION_STATUS.ACTIVE),
  collectionOptions: () => taxonomyRepository.activeCollections().map((collection) => ({ id: collection.id, label: collection.name, value: collection.name })),
  findCollection: (idOrSlugOrName) => {
    const found = getCollectionById(idOrSlugOrName) ??
      getCollections().find((c) => c.name === idOrSlugOrName);
    return found ? asCollection(found) : null;
  },
  getCollectionLabel: (idOrSlugOrName) => taxonomyRepository.findCollection(idOrSlugOrName)?.name || String(idOrSlugOrName || ""),

  // ── Mutations: backend-owned, fire the API and refresh the store ──────────
  createCategory: async (draft, _actor = null) => {
    const result = await apiAdminCreateCategory({ ...draft, slug: draft.slug || slugify(draft.name) });
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true, category: result.category };
  },
  updateCategory: async (id, patch, _actor = null) => {
    const result = await apiAdminUpdateCategory(id, patch);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true, category: result.category };
  },
  archiveCategory: async (id, _actor = null) => {
    const result = await apiAdminArchiveCategory(id);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true };
  },
  restoreCategory: async (id, _actor = null) => {
    const result = await apiAdminRestoreCategory(id);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true };
  },

  createSubcategory: async (categoryId, draft, _actor = null) => {
    const result = await apiAdminCreateSubcategory(categoryId, draft);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true, subcategory: result.subcategory };
  },
  updateSubcategory: async (id, patch, _actor = null) => {
    const result = await apiAdminUpdateSubcategory(id, patch);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true, subcategory: result.subcategory };
  },
  archiveSubcategory: async (id, _actor = null) => {
    const result = await apiAdminArchiveSubcategory(id);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true };
  },
  restoreSubcategory: async (id, _actor = null) => taxonomyRepository.updateSubcategory(id, { status: TAXONOMY_STATUS.ACTIVE }),

  createCollection: async (draft, _actor = null) => {
    const result = await apiAdminCreateCollection({ ...draft, slug: draft.slug || slugify(draft.name) });
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true, collection: result.collection };
  },
  updateCollection: async (id, patch, _actor = null) => {
    const result = await apiAdminUpdateCollection(id, patch);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true, collection: result.collection };
  },
  activateCollection: async (id, _actor = null) => {
    const result = await apiAdminActivateCollection(id);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true };
  },
  pauseCollection: async (id, _actor = null) => {
    const result = await apiAdminPauseCollection(id);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true };
  },
  archiveCollection: async (id, _actor = null) => {
    const result = await apiAdminArchiveCollection(id);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true };
  },
  restoreCollection: async (id, _actor = null) => taxonomyRepository.updateCollection(id, { status: COLLECTION_STATUS.DRAFT }),

  assignProductsToCollection: async (collectionId, productIds, _actor = null) => {
    const result = await apiAdminAssignCollectionProducts(collectionId, productIds);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    return { ok: true };
  },
  addProductsToCollection: async (collectionId, productIds, _actor = null) => {
    const current = taxonomyRepository.findCollection(collectionId)?.explicitProductIds ?? [];
    return taxonomyRepository.assignProductsToCollection(collectionId, [...new Set([...current, ...productIds])]);
  },
  removeProductsFromCollection: async (collectionId, productIds, _actor = null) => {
    const remove = new Set(productIds);
    const current = taxonomyRepository.findCollection(collectionId)?.explicitProductIds ?? [];
    return taxonomyRepository.assignProductsToCollection(collectionId, current.filter((id) => !remove.has(id)));
  },

  productCounts: () => {
    const counts = {};
    productsList().forEach((product) => {
      counts[product.category] = (counts[product.category] ?? 0) + 1;
    });
    return counts;
  },

  collectionsForProduct: (product) => taxonomyRepository.collections().filter((collection) =>
    taxonomyRepository.isProductInCollection(product, collection.id)
  ),
  isProductInCollection: (product, collectionIdOrSlugOrName) => {
    const collection = taxonomyRepository.findCollection(collectionIdOrSlugOrName);
    if (!collection || !product) return false;
    if ((collection.explicitProductIds ?? []).includes(product.id)) return true;
    const ids = Array.isArray(product.collectionIds) ? product.collectionIds : [];
    return ids.includes(collection.id);
  },

  metrics: () => {
    const categories = taxonomyRepository.categories();
    const collections = taxonomyRepository.collections();
    return {
      categories: categories.length,
      activeCategories: taxonomyRepository.activeCategories().length,
      collections: collections.length,
      activeCollections: taxonomyRepository.activeCollections().length,
      subcategories: read().subcategories.length,
    };
  },
};

export default taxonomyRepository;
