/**
 * PRATIKSHYA FASHON — Categories & Subcategories API
 * Maps to API_CONTRACT.md § CATEGORIES + SUBCATEGORIES
 */
import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  // Status + payload travel with the failure so admin desks can map
  // 401/403/404/409/422 to distinct copy (formatAdminError) instead of one
  // generic "could not save" line.
  if (err instanceof ApiError) {
    return { ok: false, error: err.message, status: err.status ?? 0, data: err.data ?? null };
  }
  return { ok: false, error: "An unexpected error occurred.", status: 0, data: null };
}

function normCategory(c) {
  if (!c) return c;
  return {
    id:             c.id,
    name:           c.name          ?? "",
    slug:           c.slug          ?? "",
    eyebrow:        c.eyebrow       ?? "",
    description:    c.description   ?? "",
    image:          c.image         ?? null,
    bannerMediaId:  c.banner_media_id ?? c.bannerMediaId ?? null,
    // Never invent a lifecycle state: an absent status stays absent so a
    // partially loaded / failed record can never masquerade as ACTIVE.
    status:         c.status        ?? null,
    sortOrder:      c.sort_order    ?? c.sortOrder ?? 0,
    featured:       c.featured      ?? false,
    seoTitle:       c.seo_title     ?? c.seoTitle ?? "",
    seoDescription: c.seo_description ?? c.seoDescription ?? "",
    productCount:   c.product_count ?? c.productCount ?? 0,
    productCountTotal: c.productCountTotal ?? c.product_count_total ?? null,
  };
}

function normSubcategory(s) {
  if (!s) return s;
  return {
    id:           s.id,
    categoryId:   s.category_id ?? s.categoryId ?? "",
    name:         s.name        ?? "",
    slug:         s.slug        ?? "",
    description:  s.description ?? "",
    image:        s.image       ?? null,
    status:       s.status      ?? null,
    sortOrder:    s.sort_order  ?? s.sortOrder ?? 0,
    productCount: s.product_count ?? s.productCount ?? 0,
  };
}

/**
 * Admin write normalisers.
 *
 * The backend request schemas (CategoryCreateRequest / CategoryUpdateRequest,
 * Subcategory*Request) are snake_case and Pydantic ignores unknown keys, so
 * posting the camelCase admin draft verbatim silently DROPPED sortOrder,
 * bannerMediaId, seoTitle and seoDescription. These builders map the desk
 * draft onto the columns the API actually accepts and send only the keys the
 * caller carried, so a partial edit can never blank an untouched field.
 *
 * `status` is deliberately excluded: category lifecycle is owned by the
 * dedicated activate / archive / restore endpoints, never by a field write.
 */
const CATEGORY_FIELDS = {
  name: "name",
  slug: "slug",
  eyebrow: "eyebrow",
  description: "description",
  image: "image",
  bannerMediaId: "banner_media_id",
  banner_media_id: "banner_media_id",
  sortOrder: "sort_order",
  sort_order: "sort_order",
  featured: "featured",
  seoTitle: "seo_title",
  seo_title: "seo_title",
  seoDescription: "seo_description",
  seo_description: "seo_description",
};

const SUBCATEGORY_FIELDS = {
  name: "name",
  slug: "slug",
  description: "description",
  image: "image",
  sortOrder: "sort_order",
  sort_order: "sort_order",
};

function buildPayload(draft, fields) {
  const payload = {};
  Object.entries(draft ?? {}).forEach(([key, value]) => {
    const column = fields[key];
    if (!column || value === undefined) return;
    payload[column] = column === "sort_order" ? Number(value) || 0 : value;
  });
  return payload;
}

export const buildCategoryPayload = (draft) => buildPayload(draft, CATEGORY_FIELDS);
export const buildSubcategoryPayload = (draft) => buildPayload(draft, SUBCATEGORY_FIELDS);

/** Admin desk list — includes DRAFT/ARCHIVED rows and server-computed
 * per-category product counts (`productCount` live, `productCountTotal`
 * all statuses) so taxonomy tiles never count a client-side snapshot. */
export async function apiAdminListCategories({ status, featured } = {}) {
  try {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (featured !== undefined) qs.set("featured", featured);
    const suffix = qs.toString() ? `?${qs}` : "";
    const data = await apiClient.get(`/admin/categories${suffix}`, { scope: "admin" });
    const items = (data.items ?? data.categories ?? []).map(normCategory);
    return { ok: true, items, total: data.total ?? items.length };
  } catch (err) { return handleError(err); }
}

/** Admin desk detail — the ONE source of truth for loading a single
 * category into an admin screen. It hits GET /admin/categories/{id}, which
 * resolves DRAFT/ACTIVE/ARCHIVED alike, so an admin edit never depends on
 * the storefront ACTIVE-only collection. */
export async function apiAdminGetCategory(idOrSlug) {
  try {
    const data = await apiClient.get(`/admin/categories/${encodeURIComponent(idOrSlug)}`, { scope: "admin" });
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

/** Admin subcategory list for one category — includes DRAFT/ARCHIVED rows. */
export async function apiAdminListSubcategories(categoryId, { status } = {}) {
  try {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await apiClient.get(
      `/admin/categories/${encodeURIComponent(categoryId)}/subcategories${qs}`,
      { scope: "admin" },
    );
    const items = (data.items ?? data.subcategories ?? []).map(normSubcategory);
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

// Public
export async function apiListCategories({ status = "ACTIVE", featured } = {}) {
  try {
    const qs = new URLSearchParams({ status });
    if (featured !== undefined) qs.set("featured", featured);
    const data = await apiClient.get(`/categories?${qs}`, { scope: "none" });
    const items = (data.items ?? data.categories ?? data ?? []).map(normCategory);
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

export async function apiGetCategory(idOrSlug) {
  try {
    const data = await apiClient.get(`/categories/${idOrSlug}`, { scope: "none" });
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiListSubcategories(categoryId, { status = "ACTIVE" } = {}) {
  try {
    const data = await apiClient.get(`/categories/${categoryId}/subcategories?status=${status}`, { scope: "none" });
    const items = (data.items ?? data.subcategories ?? data ?? []).map(normSubcategory);
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

// Admin
export async function apiAdminCreateCategory(body) {
  try {
    const data = await apiClient.post("/admin/categories", buildCategoryPayload(body), { scope: "admin" });
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateCategory(id, body) {
  try {
    const data = await apiClient.patch(`/admin/categories/${id}`, buildCategoryPayload(body), { scope: "admin" });
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

/** Lifecycle: DRAFT → ACTIVE. The only way a category becomes ACTIVE. */
export async function apiAdminActivateCategory(id) {
  try {
    const data = await apiClient.post(`/admin/categories/${id}/activate`, {}, { scope: "admin" });
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminArchiveCategory(id) {
  try {
    const data = await apiClient.post(`/admin/categories/${id}/archive`, {}, { scope: "admin" });
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminRestoreCategory(id) {
  try {
    const data = await apiClient.post(`/admin/categories/${id}/restore`, {}, { scope: "admin" });
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminCreateSubcategory(categoryId, body) {
  try {
    const data = await apiClient.post(`/admin/categories/${categoryId}/subcategories`, buildSubcategoryPayload(body), { scope: "admin" });
    return { ok: true, subcategory: normSubcategory(data.subcategory ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateSubcategory(id, body) {
  try {
    const data = await apiClient.patch(`/admin/subcategories/${id}`, buildSubcategoryPayload(body), { scope: "admin" });
    return { ok: true, subcategory: normSubcategory(data.subcategory ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminArchiveSubcategory(id) {
  try {
    const data = await apiClient.post(`/admin/subcategories/${id}/archive`, {}, { scope: "admin" });
    return { ok: true, subcategory: normSubcategory(data.subcategory ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminRestoreSubcategory(id) {
  try {
    const data = await apiClient.post(`/admin/subcategories/${id}/restore`, {}, { scope: "admin" });
    return { ok: true, subcategory: normSubcategory(data.subcategory ?? data) };
  } catch (err) { return handleError(err); }
}
