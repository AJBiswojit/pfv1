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
    status:         c.status        ?? "ACTIVE",
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
    status:       s.status      ?? "ACTIVE",
    sortOrder:    s.sort_order  ?? s.sortOrder ?? 0,
    productCount: s.product_count ?? s.productCount ?? 0,
  };
}

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
    const data = await apiClient.post("/admin/categories", body, { scope: "admin" });
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateCategory(id, body) {
  try {
    const data = await apiClient.patch(`/admin/categories/${id}`, body, { scope: "admin" });
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
    const data = await apiClient.post(`/admin/categories/${categoryId}/subcategories`, body, { scope: "admin" });
    return { ok: true, subcategory: normSubcategory(data.subcategory ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateSubcategory(id, body) {
  try {
    const data = await apiClient.patch(`/admin/subcategories/${id}`, body, { scope: "admin" });
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
