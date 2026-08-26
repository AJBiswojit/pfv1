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
    originalPrice:    p.original_price ?? p.mrp ?? p.compare_at_price ?? null,
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
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    } else {
      qs.set(key, value);
    }
  }
  return qs.toString();
}

// ===========================================================================
// PUBLIC / STOREFRONT
// ===========================================================================

/**
 * GET /products
 * Returns { items, total, facets, appliedFilters }
 */
export async function apiListProducts(query = {}) {
  try {
    const qs = buildParams({
      q:            query.q,
      category:     query.category,
      subcategory:  query.subcategory,
      gender:       query.gender,
      price:        query.price,
      size:         query.size,
      color:        query.color,
      fabric:       query.fabric,
      material:     query.material,
      occasion:     query.occasion,
      collection:   query.collection,
      rating:       query.rating,
      availability: query.availability,
      sort:         query.sort ?? "recommended",
      page:         query.page ?? 1,
      pageSize:     query.pageSize ?? 20,
    });
    const data = await apiClient.get(`/products${qs ? `?${qs}` : ""}`, { skipAuth: true });
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
    const data = await apiClient.get(`/products/${idOrSlug}`, { skipAuth: true });
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
    const data = await apiClient.get(`/products/${id}/recommendations?type=${type}`, { skipAuth: true });
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
    const data = await apiClient.get("/products/recently-viewed");
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
    await apiClient.post(`/products/recently-viewed?productId=${productId}`, {});
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
    const data = await apiClient.get(`/admin/products${qs ? `?${qs}` : ""}`);
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
    const data = await apiClient.post("/admin/products", body);
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
    const data = await apiClient.post("/admin/products/draft", body);
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
    const data = await apiClient.get(`/admin/products/next-id?${qs}`);
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
    const data = await apiClient.get(`/admin/products/availability?${qs}`);
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
    const data = await apiClient.get("/admin/products/metrics");
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
    const data = await apiClient.get(`/admin/products/${id}`);
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
    const data = await apiClient.patch(`/admin/products/${id}`, body);
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
    const data = await apiClient.post(`/admin/products/${id}/assign`, { employeeId });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/approve */
export async function apiAdminApproveProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/approve`, {});
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/reject  body: { reason } */
export async function apiAdminRejectProduct(id, reason) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/reject`, { reason });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/publish */
export async function apiAdminPublishProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/publish`, {});
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/unpublish */
export async function apiAdminUnpublishProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/unpublish`, {});
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/archive */
export async function apiAdminArchiveProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/archive`, {});
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/restore */
export async function apiAdminRestoreProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/restore`, {});
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** GET /admin/products/{id}/publish-issues */
export async function apiAdminGetPublishIssues(id) {
  try {
    const data = await apiClient.get(`/admin/products/${id}/publish-issues`);
    return { ok: true, issues: data.issues ?? [] };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/submit-review */
export async function apiSubmitForReview(id) {
  try {
    const data = await apiClient.post(`/products/${id}/submit-review`, {});
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/change-id  body: { newId } */
export async function apiAdminChangeProductId(id, newId) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/change-id`, { newId });
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/duplicate */
export async function apiAdminDuplicateProduct(id) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/duplicate`, {});
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/bulk  body: { productIds, updates } */
export async function apiAdminBulkUpdate(productIds, updates) {
  try {
    const data = await apiClient.post("/admin/products/bulk", { productIds, updates });
    return { ok: true, message: data.message ?? "Updated." };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /admin/products/{id}/review-flags/clear  body: { flags } */
export async function apiAdminClearReviewFlags(id, flags) {
  try {
    const data = await apiClient.post(`/admin/products/${id}/review-flags/clear`, { flags });
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
    const data = await apiClient.get(`/employee/products/${id}`);
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /employee/products/{id} (whitelisted fields only) */
export async function apiEmployeeUpdateProduct(id, body) {
  try {
    const data = await apiClient.patch(`/employee/products/${id}`, body);
    return { ok: true, product: normaliseProduct(data.product ?? data) };
  } catch (err) {
    return handleError(err);
  }
}
