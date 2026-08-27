/**
 * PRATIKSHYA FASHON — canonical media-path helpers (Phase 6).
 *
 * One rule: the BACKEND decides what a product image reference resolves to.
 * This module never derives a storage path from a slug, an id or a folder
 * convention — no product surface templates an image filename together.
 * What it does do is:
 *
 *   · recognise a canonical media URL issued by the backend
 *     (`/api/v1/media/objects/…`) and resolve it against the configured
 *     media origin, so the frontend works whether the API is same-origin,
 *     on another origin, or behind a CDN;
 *   · pass an absolute / data / blob URL through untouched;
 *   · pass a legacy `/images/…` reference through untouched, which is what
 *     keeps the storefront rendering during the object-store migration;
 *   · return "" for anything absent, so callers show their empty plate
 *     rather than a fabricated placeholder.
 *
 * Path normalisation never infers ownership — see `productMediaSet.js`.
 */

/** Canonical media root, kept for the ownership checks below. */
export const CANONICAL_MEDIA_ROOT = "/images/products";
export const CANONICAL_PRODUCT_MEDIA_ROOT = CANONICAL_MEDIA_ROOT;

/**
 * Application-level media URL prefix.
 *
 * Mirrors the backend's `settings.MEDIA_URL_PREFIX` mounted at
 * `settings.API_V1_PREFIX`. Overridable so a deployment that serves media
 * from a different mount does not need a code change.
 */
export const MEDIA_URL_PREFIX =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_MEDIA_URL_PREFIX) ||
  "/api/v1/media/objects";

/** Legacy Vite `public/` prefix still used by the authored asset library. */
export const LEGACY_PUBLIC_IMAGE_PREFIX = "/images/";

/**
 * Origin media URLs are resolved against.
 *
 * Empty by default: the API is same-origin (Vite proxies `/api` to the
 * backend in development), so a relative media URL just works. Set
 * `VITE_MEDIA_ORIGIN=https://cdn.example.com` to point every media request
 * at a CDN or a separate API origin — no product component changes.
 *
 * Never hardcode `localhost` here or in product data.
 */
export const mediaOrigin = () => {
  const raw =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_MEDIA_ORIGIN) || "";
  return String(raw).trim().replace(/\/+$/, "");
};

export const normalizeMediaPath = (value) =>
  String(value || "")
    .trim()
    .split("?")[0]
    .split("#")[0]
    .replace(/^\/+/, "/");

/** True for anything already browser-reachable without our help. */
export const isRemoteOrInlineUrl = (value) => {
  const text = String(value || "").trim().toLowerCase();
  return (
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("data:") ||
    text.startsWith("blob:") ||
    text.startsWith("//")
  );
};

/** True for a URL the backend media layer issued. */
export const isBackendMediaUrl = (value) => {
  const text = String(value || "").trim();
  if (!MEDIA_URL_PREFIX) return false;
  return text === MEDIA_URL_PREFIX || text.startsWith(`${MEDIA_URL_PREFIX}/`);
};

/** True for a legacy `public/images` reference. */
export const isLegacyPublicImageUrl = (value) =>
  String(value || "").trim().startsWith(LEGACY_PUBLIC_IMAGE_PREFIX);

/**
 * Which branch a reference will take. Exposed so the migration's dual-read
 * behaviour can be observed (and tested) instead of being invisible.
 *
 *   "media"          → canonical backend media URL
 *   "remote"         → absolute / data / blob URL, used verbatim
 *   "legacy-public"  → still served from public/images (compatibility path)
 *   "other"          → unresolved reference (e.g. a media-register id)
 *   "empty"          → nothing to render
 */
export const mediaReferenceKind = (value) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "empty";
  if (isRemoteOrInlineUrl(text)) return "remote";
  if (isBackendMediaUrl(text)) return "media";
  if (isLegacyPublicImageUrl(text)) return "legacy-public";
  return "other";
};

/**
 * Resolve any reference shape the house produces into a renderable URL.
 *
 * Accepts a plain string or the `{ src }` / `{ url }` / `{ path }` /
 * `{ thumbnail }` object forms used by the media register and the upload
 * descriptor. Anything absent resolves to "" — never to a placeholder.
 */
export const normalizeMediaReference = (value) => {
  if (typeof value === "string") return resolveMediaUrl(value);
  if (value && typeof value === "object") {
    const candidate = value.src || value.url || value.path || value.thumbnail || "";
    return resolveMediaUrl(typeof candidate === "string" ? candidate : "");
  }
  return "";
};

/**
 * Resolve a reference to the URL an `<img>` should use.
 *
 * Preserve authored, uploaded, remote, blob and data URLs verbatim. The only
 * transformation is prefixing a canonical backend media URL with the
 * configured media origin — which is a no-op when no origin is configured.
 */
export const resolveMediaUrl = (value) => {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  if (isRemoteOrInlineUrl(text)) return text;
  if (isBackendMediaUrl(text)) return `${mediaOrigin()}${text}`;
  // Legacy public asset, media-register id, or anything else: unchanged.
  // Nothing is invented, and no product ever borrows another product's art.
  return text;
};

/**
 * Build a canonical media URL from an object key the backend returned
 * (e.g. `products/PF-W-SAR-SIL-0001/primary.avif`).
 *
 * The key must already have been validated and issued by the backend — this
 * helper only formats it, it never guesses a location.
 */
export const mediaObjectUrl = (objectKey) => {
  const key = String(objectKey || "").trim().replace(/^\/+/, "");
  if (!key) return "";
  return `${mediaOrigin()}${MEDIA_URL_PREFIX}/${key}`;
};

export const isCanonicalMediaUrl = (value) => {
  const path = normalizeMediaPath(value).toLowerCase();
  return path === CANONICAL_MEDIA_ROOT || path.startsWith(`${CANONICAL_MEDIA_ROOT}/`);
};

export default {
  CANONICAL_MEDIA_ROOT,
  CANONICAL_PRODUCT_MEDIA_ROOT,
  MEDIA_URL_PREFIX,
  LEGACY_PUBLIC_IMAGE_PREFIX,
  mediaOrigin,
  normalizeMediaPath,
  isRemoteOrInlineUrl,
  isBackendMediaUrl,
  isLegacyPublicImageUrl,
  isCanonicalMediaUrl,
  mediaReferenceKind,
  normalizeMediaReference,
  resolveMediaUrl,
  mediaObjectUrl,
};
