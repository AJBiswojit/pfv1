/**
 * PRATIKSHYA FASHON — Collections API
 * Maps to API_CONTRACT.md § COLLECTIONS
 */
import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

function normCollection(c) {
  if (!c) return c;
  return {
    id:                   c.id,
    name:                 c.name          ?? "",
    slug:                 c.slug          ?? "",
    eyebrow:              c.eyebrow       ?? "",
    description:          c.description   ?? "",
    image:                c.image         ?? null,
    heroMediaId:          c.hero_media_id     ?? c.heroMediaId     ?? null,
    thumbnailMediaId:     c.thumbnail_media_id ?? c.thumbnailMediaId ?? null,
    type:                 c.type          ?? "MANUAL",
    status:               c.status        ?? "DRAFT",
    displayStatus:        c.display_status ?? c.displayStatus ?? c.status ?? "DRAFT",
    featured:             c.featured      ?? false,
    sortOrder:            c.sort_order    ?? c.sortOrder ?? 0,
    startDate:            c.start_date    ?? c.startDate ?? null,
    endDate:              c.end_date      ?? c.endDate   ?? null,
    rule:                 c.rule          ?? null,
    explicitProductIds:   c.explicit_product_ids ?? c.explicitProductIds ?? [],
    resolvedProductCount: c.resolved_product_count ?? c.resolvedProductCount ?? 0,
  };
}

// Public
export async function apiListCollections({ status = "ACTIVE", featured } = {}) {
  try {
    const qs = new URLSearchParams({ status });
    if (featured !== undefined) qs.set("featured", featured);
    const data = await apiClient.get(`/collections?${qs}`, { scope: "none" });
    const items = (data.items ?? data.collections ?? data ?? []).map(normCollection);
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

export async function apiGetCollection(idOrSlug) {
  try {
    const data = await apiClient.get(`/collections/${idOrSlug}`, { scope: "none" });
    return { ok: true, collection: normCollection(data.collection ?? data) };
  } catch (err) { return handleError(err); }
}

// Admin
export async function apiAdminListCollections({ status, featured, q } = {}) {
  try {
    const qs = new URLSearchParams();
    if (status)   qs.set("status", status);
    if (featured !== undefined) qs.set("featured", featured);
    if (q)        qs.set("q", q);
    const data = await apiClient.get(`/admin/collections?${qs}`, { scope: "admin" });
    const items = (data.items ?? data.collections ?? data ?? []).map(normCollection);
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

export async function apiAdminGetCollection(id) {
  try {
    const data = await apiClient.get(`/admin/collections/${id}`, { scope: "admin" });
    return { ok: true, collection: normCollection(data.collection ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminCreateCollection(body) {
  try {
    const data = await apiClient.post("/admin/collections", body, { scope: "admin" });
    return { ok: true, collection: normCollection(data.collection ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateCollection(id, body) {
  try {
    const data = await apiClient.patch(`/admin/collections/${id}`, body, { scope: "admin" });
    return { ok: true, collection: normCollection(data.collection ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminActivateCollection(id) {
  try {
    const data = await apiClient.post(`/admin/collections/${id}/activate`, {}, { scope: "admin" });
    return { ok: true, collection: normCollection(data.collection ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminPauseCollection(id) {
  try {
    const data = await apiClient.post(`/admin/collections/${id}/pause`, {}, { scope: "admin" });
    return { ok: true, collection: normCollection(data.collection ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminArchiveCollection(id) {
  try {
    const data = await apiClient.post(`/admin/collections/${id}/archive`, {}, { scope: "admin" });
    return { ok: true, collection: normCollection(data.collection ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminRestoreCollection(id) {
  try {
    const data = await apiClient.post(`/admin/collections/${id}/restore`, {}, { scope: "admin" });
    return { ok: true, collection: normCollection(data.collection ?? data) };
  } catch (err) { return handleError(err); }
}

export async function apiAdminAssignCollectionProducts(id, productIds) {
  try {
    const data = await apiClient.put(`/admin/collections/${id}/products`, { productIds }, { scope: "admin" });
    return { ok: true, collection: normCollection(data.collection ?? data) };
  } catch (err) { return handleError(err); }
}
