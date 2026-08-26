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

import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
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
    compareAtPrice:   p.compare_at_price ?? p.compareAtPrice ?? null,
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
 * GET /admin/products?status=&category=&q=&sort=
 */
export async function apiAdminListProducts(query = {}) {
  try {
    const qs = buildParams({
      status:             query.status,
      category:           query.category,
      assignedEmployeeId: query.assignedEmployeeId,
      q:                  query.q,
      sort:               query.sort ?? "newest",
    });
    const data = await apiClient.get(`/admin/products${qs ? `?${qs}` : ""}`, { scope: "admin" });
    return { ok: true, ...normaliseList(data) };
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
 * GET /admin/products/availability?sku=&slug=
 */
export async function apiAdminCheckAvailability({ sku, slug } = {}) {
  try {
    const qs = buildParams({ sku, slug });
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
