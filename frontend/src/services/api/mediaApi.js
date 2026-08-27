/**
 * PRATIKSHYA FASHON — Media API (Phase 6).
 *
 * Phase 6 activated the OBJECT STORAGE half of the media domain. The backend
 * now serves and stores real objects behind the storage abstraction
 * (`backend/app/storage`), so these functions make real HTTP calls:
 *
 *   GET    /media/storage/status                    apiGetMediaStorageStatus
 *   POST   /media/references/resolve                apiResolveMediaReferences
 *   GET    /media/objects/{key}                     apiMediaObjectUrl  (URL only)
 *   GET    /media/object-meta/{key}                 apiGetMediaObjectMeta
 *   POST   /media/objects                           apiUploadMediaObject
 *   POST   /media/products/{id}/objects             apiUploadProductMediaObject
 *   DELETE /media/objects/{key}                     apiDeleteMediaObject
 *   GET    /media/products/{id}/media-set           apiGetProductMediaSet
 *
 * The MEDIA REGISTER half is still a genuine blocker, and it is not faked:
 * `media_media_asset`, `media_product_media`, `media_marketing_media` and
 * `media_media_review` declare a table name and NO business columns, so no
 * media record can be created, listed, mapped or reviewed without a schema
 * change — which this phase is forbidden from making. Those functions return
 * a precise, user-visible explanation instead of an optimistic success.
 *
 * See PHASE_6_IMPLEMENTATION_REPORT.md §13 and §19.
 */

import { apiClient } from "./apiClient";
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
    return { ok: false, error: error?.message || "Media storage status unavailable.", status: error?.status ?? 0 };
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
    return { ok: false, error: error?.message || "Media resolution unavailable.", status: error?.status ?? 0 };
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
    return { ok: false, error: error?.message || "Media metadata unavailable.", status: error?.status ?? 0 };
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
    return { ok: false, error: error?.message || "Product media set unavailable.", status: error?.status ?? 0 };
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
    return { ok: false, error: error?.message || "Upload failed.", status: error?.status ?? 0 };
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
    return { ok: false, error: error?.message || "Upload failed.", status: error?.status ?? 0 };
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
    return { ok: false, error: error?.message || "Delete failed.", status: error?.status ?? 0 };
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
// Media register — still BLOCKED, and honestly reported
// ---------------------------------------------------------------------------

const REGISTER_BLOCKER =
  "Media records are not available yet: the backend media tables " +
  "(media_media_asset, media_product_media, media_marketing_media, " +
  "media_media_review) declare no business columns in the existing schema, " +
  "and this phase may not add columns or migrations. Object storage itself " +
  "is live — see PHASE_6_IMPLEMENTATION_REPORT.md §19.";

function registerUnavailable() {
  return { ok: false, error: REGISTER_BLOCKER, code: "BACKEND_GAP" };
}

export async function apiListMedia()          { return registerUnavailable(); }
export async function apiGetMedia()           { return registerUnavailable(); }
export async function apiCreateMedia()        { return registerUnavailable(); }
export async function apiUpdateMedia()        { return registerUnavailable(); }
export async function apiListProductMedia()   { return registerUnavailable(); }
export async function apiAssignMediaToProduct() { return registerUnavailable(); }
export async function apiListMarketingMedia() { return registerUnavailable(); }
export async function apiListMediaReviews()   { return registerUnavailable(); }
export async function apiApproveMedia()       { return registerUnavailable(); }
export async function apiRejectMedia()        { return registerUnavailable(); }

/** The upload blocker, stated precisely for the admin UI. */
export const MEDIA_UPLOAD_BLOCKER =
  "Object storage is live, but an upload cannot be registered as media yet: " +
  "the media tables carry no business columns, so no media record can be " +
  "created. The file was not stored and no placeholder media was created. " +
  "To attach an image to a product, set the product's image reference to an " +
  "existing media URL.";

export default {
  apiMediaObjectUrl,
  apiMediaUrlPrefix,
  apiGetMediaStorageStatus,
  apiResolveMediaReferences,
  apiGetMediaObjectMeta,
  apiGetProductMediaSet,
  apiUploadMediaObject,
  apiUploadProductMediaObject,
  apiDeleteMediaObject,
  encodeMediaKey,
  MEDIA_UPLOAD_BLOCKER,
};
