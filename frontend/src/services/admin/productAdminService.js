/**
 * PRATIKSHYA FASHON — Admin product service (Phase 5).
 *
 * THE awaited backend layer behind every admin product screen. Every call:
 *   1. goes through the single normalized API layer (services/api/productsApi
 *      → buildAdminProductPayload), so no screen hand-builds backend bodies;
 *   2. awaits the server response before claiming success — there is no
 *      optimistic "saved" state anywhere in this module;
 *   3. on success reconciles the returned authoritative record into the
 *      shared cache (upsertServerProducts) so editors re-baseline from the
 *      server and cannot re-send a stale snapshot over newer data;
 *   4. on failure returns { ok:false, error, status, data } which screens
 *      render through formatAdminError (401/403/404/409/422/5xx distinct).
 *
 * It owns no catalogue rules of its own: lifecycle legality, publish gates
 * and uniqueness are decided by the backend endpoints; the local
 * publish-issues checklist is only a convenience pre-check before submit.
 */

import catalogRepository, { upsertServerProducts } from "../catalogRepository";
import {
  apiAdminApproveProduct,
  apiAdminAssignEmployee,
  apiAdminArchiveProduct,
  apiAdminBulkUpdate,
  apiAdminChangeProductId,
  apiAdminCheckAvailability,
  apiAdminClearReviewFlags,
  apiAdminCreateDraft,
  apiAdminDuplicateProduct,
  apiAdminGetProduct,
  apiAdminGetPublishIssues,
  apiAdminListProducts,
  apiAdminProductMetrics,
  apiAdminPublishProduct,
  apiAdminRejectProduct,
  apiAdminRestoreProduct,
  apiAdminUnpublishProduct,
  apiAdminUpdateProduct,
  apiSubmitForReview,
  buildAdminProductPayload,
} from "../api/productsApi";
import { getAccessToken } from "../api/apiClient";

const withUpsert = (result) => {
  if (result?.ok && result.product) {
    upsertServerProducts([result.product]);
  }
  return result;
};

/** Admin-scoped token present? (drives "sign in" vs fetch states in UI). */
export const hasAdminSession = () => Boolean(getAccessToken("admin"));

/**
 * GET /admin/products — server-driven desk list with real filters, sort and
 * pagination. Resolves to { ok, items, total, page, pageSize } where items
 * are the fetched page ALREADY reconciled into the shared cache.
 */
export async function fetchAdminProducts(query = {}) {
  const result = await apiAdminListProducts(query);
  if (result.ok) upsertServerProducts(result.items ?? []);
  return result;
}

/** GET /admin/products/{id} — authoritative single record. */
export async function fetchAdminProduct(id) {
  const result = await apiAdminGetProduct(id);
  if (result.ok && result.product) upsertServerProducts([result.product]);
  return result;
}

/** Live server publish gate (the authority; the local list is a pre-check). */
export async function fetchPublishIssues(id) {
  return apiAdminGetPublishIssues(id);
}

/** GET /admin/products/metrics — the seven honest tiles. */
export async function fetchAdminMetrics() {
  return apiAdminProductMetrics();
}

/** GET /admin/products/availability — server-side SKU/slug uniqueness. */
export async function checkAvailability({ sku, slug } = {}) {
  return apiAdminCheckAvailability({ sku, slug });
}

/**
 * Create: POST /admin/products/draft with the canonical permanent ID the
 * editor allocated over the register. A taken ID is a 409 — never a silent
 * ID swap. On success the returned record becomes the cache row.
 */
export async function createAdminProduct(record) {
  const id = String(record?.id ?? "").trim();
  if (!id) return { ok: false, error: "A canonical Product ID must be allocated before creation.", status: 0 };
  const { id: _ignored, ...payload } = buildAdminProductPayload(record);
  const result = await apiAdminCreateDraft({ id, ...payload });
  return withUpsert(result);
}

/**
 * Save content: PATCH /admin/products/{id}. The response record is upserted
 * so the editor re-baselines on server truth. If the server no longer knows
 * this ID (e.g. created offline), fall back to canonical draft creation.
 */
export async function saveAdminProduct(record) {
  const payload = buildAdminProductPayload(record);
  const result = await apiAdminUpdateProduct(record.id, payload);
  if (!result.ok && Number(result.status) === 404) {
    return createAdminProduct(record);
  }
  return withUpsert(result);
}

/** Lifecycle/action verbs mapped to their canonical endpoints. */
const ACTIONS = {
  approve: (id) => apiAdminApproveProduct(id),
  reject: (id, opts) => apiAdminRejectProduct(id, opts?.reason ?? ""),
  publish: (id) => apiAdminPublishProduct(id),
  unpublish: (id) => apiAdminUnpublishProduct(id),
  archive: (id) => apiAdminArchiveProduct(id),
  restore: (id) => apiAdminRestoreProduct(id),
  submitReview: (id) => apiSubmitForReview(id, { scope: "admin" }),
  duplicate: (id) => apiAdminDuplicateProduct(id),
  changeId: (id, opts) => apiAdminChangeProductId(id, opts?.newId ?? ""),
  clearFlags: (id, opts) => apiAdminClearReviewFlags(id, opts?.flags ?? []),
  assign: (id, opts) => apiAdminAssignEmployee(id, opts?.employeeId ?? null),
};

/**
 * Run one server action on one product and reconcile the returned record.
 * Publish/unpublish/archive/restore/assign/approve/reject are ALL backend
 * transitions — the local register is only ever a mirror updated from the
 * response, never the source of the state change.
 */
export async function runAction(id, action, opts = {}) {
  const fn = ACTIONS[action];
  if (!fn) return { ok: false, error: `Unknown product action: ${action}`, status: 0 };
  const result = await fn(id, opts);
  return withUpsert(result);
}

/**
 * Bulk merchandising (flags/attributes only — status is refused by the
 * backend bulk route by design). On success the touched IDs are refetched
 * lazily: the desk reloads its page instead of assuming per-row payloads.
 */
export async function runBulkFlags(ids, updates, { reload } = {}) {
  const result = await apiAdminBulkUpdate(ids, updates);
  if (result.ok && typeof reload === "function") await reload();
  return result;
}

/**
 * High-level editor save used by ProductEditor's save button:
 *  · new product (not yet on the server) → canonical draft creation
 *  · existing product → content PATCH
 * Returns { ok, product?, error } with server-normalized fields.
 */
export async function persistAdminProduct(record, { isNew = false } = {}) {
  const result = isNew ? await createAdminProduct(record) : await saveAdminProduct(record);
  if (result.ok && result.product) {
    return { ok: true, product: catalogRepository.find(result.product.id) ?? result.product };
  }
  return result;
}

export default {
  fetchAdminProducts,
  fetchAdminProduct,
  fetchPublishIssues,
  fetchAdminMetrics,
  checkAvailability,
  createAdminProduct,
  saveAdminProduct,
  persistAdminProduct,
  runAction,
  runBulkFlags,
  hasAdminSession,
};
