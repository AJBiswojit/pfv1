/**
 * PRATIKSHYA FASHON — Products API
 *
 * Maps to API_CONTRACT.md § PRODUCTS
 *
 * Public:
 *   GET /products                     — storefront catalogue
 *   GET /products/{idOrSlug}          — product detail
 *   GET /products/{id}/recommendations
 *   GET /products/recently-viewed     (auth)
 *   POST /products/recently-viewed    (auth)
 *
 * Admin:
 *   GET  /admin/products
 *   POST /admin/products
 *   POST /admin/products/draft
 *   GET  /admin/products/next-id
 *   GET  /admin/products/availability
 *   GET  /admin/products/metrics
 *   GET  /admin/products/{id}
 *   PATCH /admin/products/{id}
 *   POST /admin/products/{id}/assign
 *   POST /admin/products/{id}/approve
 *   POST /admin/products/{id}/reject
 *   POST /admin/products/{id}/publish | /unpublish | /archive | /restore
 *   POST /admin/products/{id}/submit-review
 *   GET  /admin/products/{id}/publish-issues
 *   POST /admin/products/{id}/change-id
 *   POST /admin/products/{id}/duplicate
 *   POST /admin/products/bulk
 *   POST /admin/products/{id}/review-flags/clear
 *
 * Employee:
 *   GET   /employee/products/{id}
 *   PATCH /employee/products/{id}
 */

import { apiClient, ApiError, handleError } from "./apiClient";

/**
 * Map a repository product record onto the ADMIN write contract
 * (ProductCreateRequest / ProductDraftRequest / ProductUpdateRequest).
 *
 * Single normalization layer: whatever the editor holds, the payload sent to
 * the backend contains ONLY fields the backend persists (identity, taxonomy,
 * attributes, pricing, stock snapshot, SEO, authored media plates,
 * merchandising flags). Registered product media is managed by the media API,
 * not by this product payload.
 * Lifecycle keys (status/published/review/history) are never included — they
 * belong to the dedicated lifecycle endpoints, which are the authority.
 * Fields with no backend column (variants, department, inventory) are
 * dropped HERE explicitly, never silently by the server.
 */
export function buildAdminProductPayload(record = {}) {
  const pick = (v) => (v === undefined ? null : v);
  const pricing = record.pricing && typeof record.pricing === "object" ? record.pricing : null;
  const imageValue = (m) =>
    m == null ? "" : typeof m === "string" ? m : String(m.id || m.src || m.url || m.path || "");
  const payload = {
    name: pick(record.name ?? ""),
    slug: record.slug ? String(record.slug) : undefined,
    sku: record.sku ? String(record.sku) : undefined,
    brand: record.brand || undefined,
    productType: record.productType || undefined,
    productCode: record.productCode ? String(record.productCode) : "",
    barcode: record.barcode ? String(record.barcode) : "",
    internalReference: record.internalReference ? String(record.internalReference) : "",
    category: pick(record.category ?? ""),
    subcategory: pick(record.subcategory ?? ""),
    gender: record.gender || undefined,
    shortDescription: pick(record.shortDescription ?? ""),
    description: pick(record.description ?? ""),
    highlights: Array.isArray(record.highlights) ? record.highlights : undefined,
    specifications:
      record.specifications && typeof record.specifications === "object" ? record.specifications : undefined,
    careInstructions: Array.isArray(record.careInstructions) ? record.careInstructions : undefined,
    deliveryInfo: record.deliveryInfo ? String(record.deliveryInfo) : "",
    returnInfo: record.returnInfo ? String(record.returnInfo) : "",
    returnPolicy:
      record.returnPolicy && typeof record.returnPolicy === "object" ? record.returnPolicy : undefined,
    fabric: record.fabric ? String(record.fabric) : "",
    material: record.material ? String(record.material) : "",
    primaryColor: record.primaryColor ? String(record.primaryColor) : "",
    secondaryColor: record.secondaryColor ? String(record.secondaryColor) : "",
    colors: Array.isArray(record.colors) ? record.colors : undefined,
    patterns: Array.isArray(record.patterns) ? record.patterns : undefined,
    work: Array.isArray(record.work) ? record.work : undefined,
    occasion: Array.isArray(record.occasion) ? record.occasion : undefined,
    sizes: Array.isArray(record.sizes) ? record.sizes : undefined,
    unavailableColors: Array.isArray(record.unavailableColors) ? record.unavailableColors : undefined,
    unavailableSizes: Array.isArray(record.unavailableSizes) ? record.unavailableSizes : undefined,
    season: record.season ? String(record.season) : "",
    fit: record.fit ? String(record.fit) : "",
    length: record.length ? String(record.length) : "",
    // Collection membership is collection-owned and is intentionally absent
    // from product write payloads. Read projections still expose it.
    tags: Array.isArray(record.tags) ? record.tags : undefined,
    badges: Array.isArray(record.badges) ? record.badges : undefined,
    isFeatured: Boolean(record.isFeatured),
    isBestseller: Boolean(record.isBestseller),
    isNew: Boolean(record.isNew),
    isLimitedEdition: Boolean(record.isLimitedEdition),
    isTrending: Boolean(record.isTrending),
    price: Number.isFinite(Number(record.price)) ? Math.round(Number(record.price)) : undefined,
    compareAtPrice:
      record.compareAtPrice != null && Number.isFinite(Number(record.compareAtPrice))
        ? Math.round(Number(record.compareAtPrice))
        : undefined,
    currency: record.currency || undefined,
    pricing: pricing
      ? {
          mrp: Number(pricing.mrp ?? pricing.sellingPrice ?? 0) || 0,
          sellingPrice: Number(pricing.sellingPrice ?? pricing.price ?? 0) || 0,
          discountType: pricing.discountType || "none",
          discountValue: Number(pricing.discountValue ?? 0) || 0,
        }
      : undefined,
    stock: Number.isFinite(Number(record.stock)) ? Math.round(Number(record.stock)) : undefined,
    availability: record.availability || undefined,
    inventoryTracked:
      record.inventoryTracked === undefined ? undefined : Boolean(record.inventoryTracked),
    lowStockThreshold:
      record.lowStockThreshold == null || !Number.isFinite(Number(record.lowStockThreshold))
        ? undefined
        : Math.round(Number(record.lowStockThreshold)),
    seo:
      record.seo && typeof record.seo === "object"
        ? {
            title: String(record.seo.title ?? ""),
            description: String(record.seo.description ?? ""),
          }
        : undefined,
    // Registered media identifiers are read-only projections. Registered media
    // is written only through /media/register; these authored plates remain
    // valid product content.
    image: imageValue(record.image),
    hoverImage: imageValue(record.hoverImage),
    additionalImages: Array.isArray(record.additionalImages)
      ? record.additionalImages.map(imageValue)
      : undefined,
  };
  // Drop `undefined` keys so PATCH stays a true partial patch (only fields we
  // intentionally write); empty strings are meaningful clears and are kept.
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Normalise a storefront product (backend snake_case → frontend camelCase)
// ---------------------------------------------------------------------------
function normaliseProduct(p) {
  if (!p) return p;
  return {
    ...p,
    // Keep all backend fields but also ensure camelCase aliases exist
    id:               p.id,
    name:             p.name,
    slug:             p.slug,
    sku:              p.sku ?? "",
    price:            p.price ?? p.selling_price ?? 0,
    originalPrice:    p.originalPrice ?? p.original_price ?? p.mrp ?? p.compare_at_price ?? null,
    compareAtPrice:   p.compareAtPrice ?? p.compare_at_price ?? null,
    currency:         p.currency ?? "INR",
    description:      p.description ?? "",
    shortDescription: p.short_description ?? p.shortDescription ?? "",
    category:         p.category ?? "",
    subcategory:      p.subcategory ?? "",
    department:       p.department ?? "",
    gender:           p.gender ?? "",
    fabric:           p.fabric ?? "",
    material:         p.material ?? "",
    colors:           p.colors ?? [],
    sizes:            p.sizes ?? [],
    occasion:         p.occasion ?? [],
    collections:      p.collections ?? [],
    tags:             p.tags ?? [],
    isFeatured:       p.is_featured  ?? p.isFeatured  ?? false,
    isBestseller:     p.is_bestseller ?? p.isBestseller ?? false,
    isNew:            p.is_new ?? p.isNew ?? false,
    status:           p.status ?? "DRAFT",
    published:        p.published ?? (p.status === "PUBLISHED"),
    stock:            p.stock ?? 0,
    availability:     p.availability ?? "in-stock",
    image:            p.image ?? p.primary_image ?? null,
    additionalImages: p.additional_images ?? p.additionalImages ?? [],
    rating:           p.rating ?? 0,
    reviewCount:      p.review_count ?? p.reviewCount ?? 0,
  };
}

function normaliseList(data) {
  const items = (data.items ?? data.products ?? data ?? []).map(normaliseProduct);
  return {
    items,
    total:          data.total ?? items.length,
    facets:         data.facets ?? {},
    appliedFilters: data.applied_filters ?? data.appliedFilters ?? {},
    page:           data.page ?? 1,
    pageSize:       data.page_size ?? data.pageSize ?? 20,
  };
}

// ---------------------------------------------------------------------------
// Build query string from params object (skip undefined/null)
// ---------------------------------------------------------------------------
function buildParams(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      value.filter((v) => v !== undefined && v !== null && v !== "").forEach((v) => qs.append(key, v));
    } else {
      qs.set(key, value);
    }
  }
  return qs.toString();
}

const asArray = (value) => {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
};

// Department is not a backend column.  Only top-level department pages are
// mapped to existing backend-supported category/gender filters.  Deeper routes
// already supply category/subcategory filters and are left untouched.
const DEPARTMENT_BACKEND_FILTERS = {
  women:  { gender: "Women" },
  men:    { category: "menswear" },
  bridal: { category: "bridal-couture" },
  kids:   { category: "kidswear" },
};

function normaliseStorefrontQuery(query = {}) {
  const normalized = { ...query };
  const department = String(normalized.department ?? "").toLowerCase();
  delete normalized.department;

  if (department && DEPARTMENT_BACKEND_FILTERS[department] && !normalized.category && !normalized.subcategory) {
    Object.assign(normalized, DEPARTMENT_BACKEND_FILTERS[department]);
  }

  return normalized;
}

// ===========================================================================
// PUBLIC / STOREFRONT
// ===========================================================================

/**
 * GET /products
 * Returns { items, total, facets, appliedFilters }
 */
export async function apiListProducts(query = {}) {
  if (query.collectionId) {
    return apiListCollectionProducts(query.collectionId, query);
  }

  try {
    const q = normaliseStorefrontQuery(query);
    const qs = buildParams({
      q:            q.q,
      category:     q.category,
      subcategory:  q.subcategory,
      gender:       q.gender,
      price:        q.price,
      size:         q.size,
      color:        q.color,
      fabric:       q.fabric,
      material:     q.material,
      occasion:     q.occasion,
      collection:   q.collection,
      rating:       q.rating,
      availability: q.availability,
      sort:         q.sort ?? "recommended",
      page:         q.page ?? 1,
      pageSize:     q.pageSize ?? 20,
    });
    const data = await apiClient.get(`/products${qs ? `?${qs}` : ""}`, { scope: "none" });
    return { ok: true, ...normaliseList(data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /collections/{collectionId}/products
 * Uses the backend collection membership resolver instead of sending a dropped
 * collectionId to /products.
 */
export async function apiListCollectionProducts(collectionId, query = {}) {
  try {
    const q = normaliseStorefrontQuery({ ...query, collectionId: undefined });
    const qs = buildParams({
      q:            q.q,
      category:     q.category,
      subcategory:  q.subcategory,
      gender:       q.gender,
      price:        q.price,
      size:         q.size,
      color:        q.color,
      fabric:       q.fabric,
      material:     q.material,
      occasion:     q.occasion,
      rating:       q.rating,
      availability: q.availability,
      sort:         q.sort ?? "recommended",
      page:         q.page ?? 1,
      pageSize:     q.pageSize ?? 20,
    });
    const data = await apiClient.get(`/collections/${collectionId}/products${qs ? `?${qs}` : ""}`, { scope: "none" });
    return { ok: true, ...normaliseList(data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /products/{idOrSlug}
 */
export async function apiGetProduct(idOrSlug) {
  try {
    const data = await apiClient.get(`/products/${idOrSlug}`, { scope: "none" });
    const product = normaliseProduct(data.product ?? data);
    return { ok: true, product };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /products/{id}/recommendations?type=related
 */
export async function apiGetRecommendations(id, type = "related") {
  try {
    const data = await apiClient.get(`/products/${id}/recommendations?type=${type}`, { scope: "none" });
    const items = (data.items ?? data.recommendations ?? data ?? []).map(normaliseProduct);
    return { ok: true, items };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /products/recently-viewed  (requires auth)
 */
export async function apiGetRecentlyViewed() {
  try {
    const data = await apiClient.get("/products/recently-viewed", { scope: "customer" });
    const items = (data.items ?? data ?? []).map(normaliseProduct);
    return { ok: true, items };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /products/recently-viewed?productId={id}  (requires auth)
 */
export async function apiAddRecentlyViewed(productId) {
  try {
    await apiClient.post(`/products/recently-viewed?productId=${productId}`, {}, { scope: "customer" });
    return { ok: true };
  } catch (err) {
    return handleError(err);
  }
}

// ===========================================================================
// ADMIN — Products
// ===========================================================================

/**
 * GET /admin/products?status=&category=&subcategory=&q=&sort=&page=&pageSize=&assignedEmployeeId=
 *
 * Server-driven desk list: every filter is a real backend query, `total` is
 * the FULL filtered count and `page`/`pageSize` come from the server — the
 * desk never pretends a fetched subset is the whole catalogue.
 */
export async function apiAdminListProducts(query = {}) {
  try {
    const qs = buildParams({
      status:             query.status,
      category:           query.category,
      subcategory:        query.subcategory,
      assignedEmployeeId: query.assignedEmployeeId,
      q:                  query.q,
      sort:               query.sort ?? "newest",
      page:               query.page,
      pageSize:           query.pageSize,
    });
    const data = await apiClient.get(`/admin/products${qs ? `?${qs}` : ""}`, { scope: "admin" });
    const list = normaliseList(data);
    return {
      ok: true,
      items: list.items,
      total: data.total ?? list.total,
      page: data.page ?? list.page,
      pageSize: data.page_size ?? data.pageSize ?? query.pageSize ?? 25,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /admin/products
 */
export async function apiAdminCreateProduct(body) {
  try {
    const data = await apiClient.post("/admin/products", body, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /admin/products/draft
 */
export async function apiAdminCreateDraft(body) {
  try {
    const data = await apiClient.post("/admin/products/draft", body, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /admin/products/next-id?category={categoryId}
 */
export async function apiAdminGetNextId(categoryId, preferredNumber) {
  try {
    const qs = buildParams({ category: categoryId, preferredNumber });
    const data = await apiClient.get(`/admin/products/next-id?${qs}`, { scope: "admin" });
    return { ok: true, nextId: data.nextId ?? data.next_id };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /admin/products/availability
 *
 * Pre-flight SKU/slug probe. `excludeId` is the product being edited — the
 * server excludes that row, so a product's own SKU/slug reports as FREE,
 * matching what PATCH accepts. Omit it when creating.
 *
 * This is a convenience check only: the authoritative verdict is the 409
 * `CONFLICT` the create/update endpoints raise.
 */
export async function apiAdminCheckAvailability({ sku, slug, excludeId } = {}) {
  try {
    const qs = buildParams({ sku, slug, excludeId });
    const data = await apiClient.get(`/admin/products/availability?${qs}`, { scope: "admin" });
    return { ok: true, ...data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /admin/products/metrics
 */
export async function apiAdminProductMetrics() {
  try {
    const data = await apiClient.get("/admin/products/metrics", { scope: "admin" });
    return { ok: true, metrics: data };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /admin/products/{id}
 */
export async function apiAdminGetProduct(id) {
  try {
    const data = await apiClient.get(`/admin/products/${id}`, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /admin/products/{id}
 */
export async function apiAdminUpdateProduct(id, body) {
  try {
    const data = await apiClient.patch(`/admin/products/${id}`, body, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /admin/products/{id}/assign
 * body: { employeeId: string | null }
 */
export async function apiAdminAssignEmployee(id, employeeId) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/assign`, { employeeId }, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/approve */
export async function apiAdminApproveProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/approve`, {}, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/reject  body: { reason } */
export async function apiAdminRejectProduct(id, reason) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/reject`, { reason }, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/publish */
export async function apiAdminPublishProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/publish`, {}, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/unpublish */
export async function apiAdminUnpublishProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/unpublish`, {}, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/archive */
export async function apiAdminArchiveProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/archive`, {}, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/restore */
export async function apiAdminRestoreProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/restore`, {}, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** GET /admin/products/{id}/publish-issues */
export async function apiAdminGetPublishIssues(id) {
  try {
    const data = await apiClient.get(`/admin/products/${id}/publish-issues`, { scope: "admin" });
    return { ok: true, issues: data.issues ?? [] };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /products/{id}/submit-review — employee/admin workflow only. */
export async function apiSubmitForReview(id, { scope = "employee" } = {}) {
  try {
    const data = await apiClient.post(`/products/${id}/submit-review`, {}, { scope });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/change-id  body: { newId } */
export async function apiAdminChangeProductId(id, newId) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/change-id`, { newId }, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/duplicate */
export async function apiAdminDuplicateProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/duplicate`, {}, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/bulk  body: { productIds, updates } */
export async function apiAdminBulkUpdate(productIds, updates) {
  try {
    const data = await apiClient.post("/admin/products/bulk", { productIds, updates }, { scope: "admin" });
    return { ok: true, message: data.message ?? "Updated." };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/review-flags/clear  body: { flags } */
export async function apiAdminClearReviewFlags(id, flags) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/review-flags/clear`, { flags }, { scope: "admin" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

// ===========================================================================
// EMPLOYEE — Products
// ===========================================================================

/** GET /employee/products/{id} */
export async function apiEmployeeGetProduct(id) {
  try {
    const data = await apiClient.get(`/employee/products/${id}`, { scope: "employee" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /employee/products/{id} (whitelisted fields only) */
export async function apiEmployeeUpdateProduct(id, body) {
  try {
    const data = await apiClient.patch(`/employee/products/${id}`, body, { scope: "employee" });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}
