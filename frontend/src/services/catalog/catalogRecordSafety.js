/**
 * Admission guard for backend catalogue snapshots, not a publishing policy.
 * Publication/taxonomy/stock remain server-owned. Legacy marketing photo
 * records must never re-enter either catalogue cache, even through an upsert.
 * This does not touch browser storage, guest carts or product-editor drafts.
 */
// These fields describe a plate; text such as "Data: handwoven" is not a URL.
const MEDIA_METADATA_FIELDS = new Set(['id', 'alt', 'title', 'caption', 'description', 'fileName', 'filename']);

function hasInlineMedia(value) {
  if (typeof value === 'string') return /^\s*(data|blob):/i.test(value);
  if (Array.isArray(value)) return value.some(hasInlineMedia);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, entry]) => !MEDIA_METADATA_FIELDS.has(key) && hasInlineMedia(entry));
  }
  return false;
}

export function isBackendCatalogRecord(record) {
  // Server IDs are opaque: the backend permits PF-CUST-* too. A prefix alone
  // cannot distinguish a genuine persisted product from an old local record.
  // Provenance is enforced by removing local merge paths, not by renaming IDs.
  if (!record?.id || record.isCustom === true) return false;
  return ![record.image, record.hoverImage, record.hover_image, record.additionalImages, record.additional_images, record.images, record.media, record.thumbnail]
    .some(hasInlineMedia);
}
