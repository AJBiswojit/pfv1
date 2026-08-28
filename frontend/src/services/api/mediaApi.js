/**
 * PRATIKSHYA FASHON — Media API (Phases 6 + 7).
 *
 * Phase 6 activated OBJECT STORAGE; Phase 7 completed the RECORD half.
 * Everything below makes real HTTP calls against the backend contract:
 *
 *   GET    /media/storage/status                    apiGetMediaStorageStatus
 *   POST   /media/references/resolve                apiResolveMediaReferences
 *   GET    /media/objects/{key}                     apiMediaObjectUrl  (URL only)
 *   GET    /media/object-meta/{key}                 apiGetMediaObjectMeta
 *   POST   /media/objects                           apiUploadMediaObject
 *   POST   /media/products/{id}/objects             apiUploadProductMediaObject
 *   POST   /media/register                          apiRegisterMediaObject
 *   GET    /media/assets                            apiListMediaAssets
 *   GET    /media/products/{id}/media-set           apiGetProductMediaSet
 *   DELETE /media/objects/{key}                     apiDeleteMediaObject
 *
 * The product-media lifecycle is REAL and complete:
 *   upload → object key → registration (MediaAsset row) → product
 *   assignment (ProductMedia row) → product save → publish → storefront.
 *
 * MARKETING media remains a separate explicit assignment with its own
 * review path — registering product media never promotes it to marketing.
 */

import { apiClient, ApiError, handleError } from "./apiClient";
import { MEDIA_URL_PREFIX, mediaOrigin, mediaObjectUrl } from "../media/mediaPaths";

// ---------------------------------------------------------------------------
// Object storage — REAL
// ---------------------------------------------------------------------------

/** Absolute (or same-origin) URL for an object key issued by the backend. */
export const apiMediaObjectUrl = (objectKey) => mediaObjectUrl(objectKey);

/** The media URL prefix the backend serves objects under. */
export const apiMediaUrlPrefix = () => `${mediaOrigin()}${MEDIA_URL_PREFIX}`;

/**
 * Which provider is active, the media URL prefix, and whether a CDN is
 * configured. Contains no credentials and no filesystem paths.
 */
export async function apiGetMediaStorageStatus() {
  try {
    const data = await apiClient.get("/media/storage/status", { scope: "none" });
    return { ok: true, data };
  } catch (error) {
    return handleError(error, "Media storage status unavailable.");
  }
}

/**
 * Ask the backend how a batch of product image references resolves.
 *
 * Each item reports `status` — `resolved`, `legacy-fallback`, `passthrough`,
 * `empty`, `disabled` — so the migration's dual-read behaviour is observable
 * rather than silent. The frontend never derives these paths itself.
 */
export async function apiResolveMediaReferences(references = []) {
  const list = (Array.isArray(references) ? references : [references])
    .filter((item) => typeof item === "string" && item.trim());
  if (!list.length) return { ok: true, items: [], total: 0 };
  try {
    const data = await apiClient.post(
      "/media/references/resolve",
      { references: list },
      { scope: "none" }
    );
    return { ok: true, items: data?.items ?? [], total: data?.total ?? 0 };
  } catch (error) {
    return handleError(error, "Media resolution unavailable.");
  }
}

/** Size / content type / SHA-256 for one stored object. */
export async function apiGetMediaObjectMeta(objectKey) {
  const key = String(objectKey || "").trim();
  if (!key) return { ok: false, error: "No media object key supplied." };
  try {
    const data = await apiClient.get(`/media/object-meta/${encodeMediaKey(key)}`, { scope: "none" });
    return { ok: true, data };
  } catch (error) {
    return handleError(error, "Media metadata unavailable.");
  }
}

/** The resolved media set for a product, from the product's own columns. */
export async function apiGetProductMediaSet(productId) {
  const id = String(productId || "").trim();
  if (!id) return { ok: false, error: "No product id supplied." };
  try {
    const data = await apiClient.get(`/media/products/${encodeURIComponent(id)}/media-set`, { scope: "none" });
    return { ok: true, data };
  } catch (error) {
    return handleError(error, "Product media set unavailable.");
  }
}

/**
 * Upload one image into the object store (admin only).
 *
 * Returns the canonical media URL and object key. This stores the OBJECT; it
 * does not create a media record, because the media tables have no columns.
 * To attach the result to a product, PATCH the product's existing
 * `image` / `hoverImage` / `additionalImages` fields with the returned URL.
 */
export async function apiUploadMediaObject(file, { productId = null, namespace = "products", group = null } = {}) {
  if (!file) return { ok: false, error: "No file selected." };
  const form = new FormData();
  form.append("file", file);
  if (namespace) form.append("namespace", String(namespace));
  if (productId) form.append("productId", String(productId));
  if (group) form.append("group", String(group));
  try {
    const data = await apiClient.upload("/media/objects", form, { scope: "admin" });
    return { ok: true, data, object: data?.object ?? null };
  } catch (error) {
    return handleError(error, "Upload failed.");
  }
}

/** Upload scoped to one product — the key namespace cannot be spoofed. */
export async function apiUploadProductMediaObject(productId, file) {
  const id = String(productId || "").trim();
  if (!id) return { ok: false, error: "No product id supplied." };
  if (!file) return { ok: false, error: "No file selected." };
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await apiClient.upload(`/media/products/${encodeURIComponent(id)}/objects`, form, {
      scope: "admin",
    });
    return { ok: true, data, object: data?.object ?? null };
  } catch (error) {
    return handleError(error, "Upload failed.");
  }
}

/**
 * Delete exactly one named object (admin only).
 *
 * There is no cascade and no garbage collection: an object is only removed
 * when an administrator names it, and the original `frontend/public/images`
 * assets live outside the storage root entirely.
 */
export async function apiDeleteMediaObject(objectKey) {
  const key = String(objectKey || "").trim();
  if (!key) return { ok: false, error: "No media object key supplied." };
  try {
    const data = await apiClient.delete(`/media/objects/${encodeMediaKey(key)}`, { scope: "admin" });
    return { ok: true, data };
  } catch (error) {
    return handleError(error, "Delete failed.");
  }
}

/**
 * Encode an object key for a URL path while keeping `/` separators intact —
 * the backend route reads the whole remainder as one key.
 */
export const encodeMediaKey = (objectKey) =>
  String(objectKey || "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

// ---------------------------------------------------------------------------
// Media register (Phase 7) — REAL durable records
// ---------------------------------------------------------------------------

/**
 * Register an uploaded object as a durable MediaAsset, optionally assigning
 * it to a product in the same call.
 *
 * The backend verifies the object actually exists in the configured store,
 * records provider metadata (mime, size, SHA-256) on `media_media_asset`,
 * and — when `productId` is passed — writes the `media_product_media`
 * association. Idempotent by object key: re-registering updates the
 * association's role / sort order / primary flag in place and never
 * duplicates the asset row.
 *
 * A failed registration returns the canonical `handleError` shape with the
 * server's own message and structured fields (`code`, `details`, `data`,
 * `status`, and `isNetworkError`) — the caller must surface it and must NOT
 * invent a media id.
 */
export async function apiRegisterMediaObject(
  objectKey,
  { productId = null, role = "gallery", sortOrder = 0, isPrimary = false, title = null, altText = null, scope = "admin" } = {}
) {
  const key = String(objectKey || "").trim();
  if (!key) return { ok: false, error: "No media object key supplied.", status: 0 };
  const form = new FormData();
  form.append("object_key", key);
  if (productId) form.append("product_id", String(productId));
  if (role) form.append("role", String(role));
  form.append("sort_order", String(Number(sortOrder) || 0));
  if (isPrimary) form.append("is_primary", "true");
  if (title) form.append("title", String(title));
  if (altText) form.append("alt_text", String(altText));
  try {
    const data = await apiClient.upload("/media/register", form, { scope });
    return {
      ok: true,
      media: data?.media ?? null,
      assigned: Boolean(data?.assigned),
      assignment: data?.assignment ?? null,
    };
  } catch (error) {
    return handleError(error, "Media registration failed.");
  }
}

/** The durable registered asset library (admin). */
export async function apiListMediaAssets({ scope = "admin" } = {}) {
  try {
    const data = await apiClient.get("/media/assets", { scope });
    return { ok: true, items: data?.items ?? [] };
  } catch (error) {
    return handleError(error, "The media asset library could not be loaded.");
  }
}

/* ------------------------------------------------------------------------ */
/* Compatibility aliases — the old register-facing names now do real work.   */
/* ------------------------------------------------------------------------ */

/** List registered media assets (admin library). */
export const apiListMedia = () => apiListMediaAssets();

/** Register a previously uploaded object (no product assignment). */
export const apiCreateMedia = (draft = {}) => apiRegisterMediaObject(draft.objectKey || draft.key, draft);

/**
 * Assign an already-registered media asset to a product — the register
 * endpoint updates the existing association in place (role / order /
 * primary), so it doubles as the product-assignment verb.
 */
export const apiAssignMediaToProduct = (mediaOrKey, productId, options = {}) =>
  apiRegisterMediaObject(mediaOrKey?.objectKey || mediaOrKey?.key || mediaOrKey, {
    ...options,
    productId,
  });

/**
 * The product's registered media associations, server-ordered primary-first.
 * Shape: [{ mediaId, objectKey, url, role, sortOrder, isPrimary, mimeType, … }]
 */
export async function apiListProductMedia(productId, { scope = "none" } = {}) {
  const result = await apiGetProductMediaSet(productId);
  if (!result.ok) return result;
  const data = result.data ?? {};
  return {
    ok: true,
    items: data.mediaItems ?? [],
    mediaRecordsAvailable: Boolean(data.mediaRecordsAvailable),
    primary: data.primary ?? null,
    gallery: data.gallery ?? [],
  };
}

/* ------------------------------------------------------------------------ */
/* Marketing media — STILL a separate, honest backend gap.                   */
/* Registering PRODUCT media is live; converting it to marketing placements   */
/* is a distinct explicit assignment the backend does not expose yet.         */
/* ------------------------------------------------------------------------ */

const MARKETING_REGISTER_BLOCKER =
  "Product-media registration is live (Phase 7), but marketing placements " +
  "are a separate explicit assignment the backend does not expose yet — " +
  "(media_marketing_media / media_media_review have no API). A product " +
  "upload is never silently promoted to a marketing slot; choose Product " +
  "Media scope to register media against a product.";

function marketingUnavailable() {
  return { ok: false, error: MARKETING_REGISTER_BLOCKER, code: "BACKEND_GAP" };
}

export async function apiListMarketingMedia() { return marketingUnavailable(); }
export async function apiListMediaReviews()   { return marketingUnavailable(); }
export async function apiApproveMedia()       { return marketingUnavailable(); }
export async function apiRejectMedia()        { return marketingUnavailable(); }

/** The marketing assignment blocker, stated precisely for the admin UI. */
export const MARKETING_MEDIA_BLOCKER = MARKETING_REGISTER_BLOCKER;

export default {
  apiMediaObjectUrl,
  apiMediaUrlPrefix,
  apiGetMediaStorageStatus,
  apiResolveMediaReferences,
  apiGetMediaObjectMeta,
  apiGetProductMediaSet,
  apiUploadMediaObject,
  apiUploadProductMediaObject,
  apiRegisterMediaObject,
  apiListMediaAssets,
  apiListProductMedia,
  apiDeleteMediaObject,
  encodeMediaKey,
  MARKETING_MEDIA_BLOCKER,
};
