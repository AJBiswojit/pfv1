/**
 * PRATIKSHYA FASHON — Categories & Subcategories API
 * Maps to API_CONTRACT.md § CATEGORIES + SUBCATEGORIES
 */
import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
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

// Public
export async function apiListCategories({ status = "ACTIVE", featured } = {}) {
  try {
    const qs = new URLSearchParams({ status });
    if (featured !== undefined) qs.set("featured", featured);
    const data = await apiClient.get(`/categories?${qs}`, { skipAuth: true });
    const items = (data.items ?? data.categories ?? data ?? []).map(normCategory);
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

export async function apiGetCategory(idOrSlug) {
  try {
    const data = await apiClient.get(`/categories/${idOrSlug}`, { skipAuth: true });
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiListSubcategories(categoryId, { status = "ACTIVE" } = {}) {
  try {
    const data = await apiClient.get(`/categories/${categoryId}/subcategories?status=${status}`, { skipAuth: true });
    const items = (data.items ?? data.subcategories ?? data ?? []).map(normSubcategory);
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

// Admin
export async function apiAdminCreateCategory(body) {
  try {
    const data = await apiClient.post("/admin/categories", body);
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateCategory(id, body) {
  try {
    const data = await apiClient.patch(`/admin/categories/${id}`, body);
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminArchiveCategory(id) {
  try {
    const data = await apiClient.post(`/admin/categories/${id}/archive`, {});
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminRestoreCategory(id) {
  try {
    const data = await apiClient.post(`/admin/categories/${id}/restore`, {});
    return { ok: true, category: normCategory(data.category ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminCreateSubcategory(categoryId, body) {
  try {
    const data = await apiClient.post(`/admin/categories/${categoryId}/subcategories`, body);
    return { ok: true, subcategory: normSubcategory(data.subcategory ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateSubcategory(id, body) {
  try {
    const data = await apiClient.patch(`/admin/subcategories/${id}`, body);
    return { ok: true, subcategory: normSubcategory(data.subcategory ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminArchiveSubcategory(id) {
  try {
    const data = await apiClient.post(`/admin/subcategories/${id}/archive`, {});
    return { ok: true, subcategory: normSubcategory(data.subcategory ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminRestoreSubcategory(id) {
  try {
    const data = await apiClient.post(`/admin/subcategories/${id}/restore`, {});
    return { ok: true, subcategory: normSubcategory(data.subcategory ?? data) };
  } catch (err) { return handleError(err); }
}
