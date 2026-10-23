import { hasAdminPermission } from '../../config/adminAccess';
import { hasPermission } from '../employees/authorization';
import { isBackendCatalogRecord } from '../catalog/catalogRecordSafety';
import { MEDIA_URL_PREFIX, resolveMediaUrl } from '../media/mediaPaths';

// The twelve reference sections, in visual order. Placement names are existing
// backend vocabulary, not a claim that the storefront consumes these non-hero rows.
//
// F-21 (Batch 3): `live: true` used to sit on the hero alone, which read as
// "only the hero is live". Liveness is derived from the HTTP read
// (`sectionStatusLabel`), so the static flag became a lie. `pipeline` states the
// only thing that is still structurally true: the hero is the legacy marketing
// row, the other eleven are the additive /home content contract.
export const HOMEPAGE_SECTIONS = Object.freeze([
  { id: 'hero', title: 'Home hero', placement: 'HOME_HERO', pipeline: 'marketing' },
  { id: 'categories', title: 'Category collage', product: true, pipeline: 'sections' },
  { id: 'sarees', title: 'Saree lookbook', placement: 'SAREE_SECTION', product: true, pipeline: 'sections' },
  { id: 'bridal', title: 'Bridal campaign', placement: 'BRIDAL_SECTION', product: true, pipeline: 'sections' },
  { id: 'jewellery', title: 'Jewellery theatre', placement: 'JEWELLERY_SECTION', product: true, pipeline: 'sections' },
  { id: 'promotion', title: 'Promotion banner', placement: 'PROMOTION', pipeline: 'sections' },
  { id: 'men', title: "Men’s editorial", placement: 'GROOM_SECTION', product: true, pipeline: 'sections' },
  { id: 'kids', title: 'Kids playground', placement: 'KIDS_SECTION', product: true, pipeline: 'sections' },
  { id: 'bestsellers', title: 'Bestsellers', product: true, pipeline: 'sections' },
  { id: 'kurtis', title: 'Kurti lookbook', product: true, pipeline: 'sections' },
  { id: 'newsletter', title: 'Newsletter', pipeline: 'sections' },
  { id: 'trust', title: 'Trust strip', pipeline: 'sections' },
]);

/* Staff-visible status for one non-hero section, derived ONLY from the persisted
   backend read (GET /{scope}/homepage/sections). Missing/unavailable reads are
   reported as such — never inferred as configured, and never as unconfigured. */
export function sectionStatusLabel(section) {
  if (!section || section.state === 'unavailable') return 'Status unavailable';
  if (!section.configured || section.state === 'missing') return 'Hidden until configured';
  if (section.state === 'inactive' || section.isActive === false) return 'Configured · inactive';
  if (section.state === 'empty') return 'Active · no eligible content';
  if (section.state === 'ready') return 'Active';
  return 'Status unavailable';
}

/* F-05: the section LIST request can fail for very different reasons. A 403
   (the backend refused the actor) and a 5xx/offline failure must not read the
   same. Only the HTTP status from `homepageRequest` is consulted — no
   permission is inferred from the failure. */
export function sectionListStatusLabel(status) {
  if (status === 403) return 'Requires marketing.view';
  if (status === 401) return 'Session expired — sign in';
  if (status === 0 || status === null || status === undefined) return 'Status unavailable — retry';
  if (status >= 500) return 'Server error — retry';
  return `Status unavailable · HTTP ${status}`;
}

/* F-05: the per-section read failure shown inside the editor. The server
   message is preserved as detail; this line only classifies it. */
export function sectionReadFailureMessage(status, message) {
  if (status === 403) return 'Your session is not permitted to read this section (HTTP 403). Ask an administrator for marketing.view.';
  if (status === 401) return 'Your session expired (HTTP 401). Sign in again before editing.';
  if (status === 0 || status === null || status === undefined) return 'The homepage service could not be reached (network error). Nothing was changed.';
  if (status >= 500) return `The homepage service failed (HTTP ${status}). Nothing was changed. Retry when it is available.`;
  return message || `The section could not be read (HTTP ${status}).`;
}

export function homepageAccess({ admin = null, employee = null } = {}) {
  const view = hasAdminPermission(admin, 'media.view');
  return {
    overview: view || (!admin && hasPermission(employee, 'media.view')),
    view,
    create: view && hasAdminPermission(admin, 'media.upload'),
    edit: view && hasAdminPermission(admin, 'media.assign'),
    delete: view && hasAdminPermission(admin, 'media.delete'),
    employeeOnly: !admin && Boolean(employee),
  };
}

export function isSafeObjectKey(key) {
  if (typeof key !== 'string' || key.length > 900) return false;
  const parts = key.split('/');
  return ['products', 'collections', 'hero', 'marketing', 'uploads'].includes(parts[0]) && parts.length >= 2 &&
    parts.every((part) => part.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && part !== '..');
}

export function isSafeMediaUrl(url) {
  if (typeof url !== 'string' || /[\x00-\x20\\]/.test(url)) return false;
  if (url.startsWith(`${MEDIA_URL_PREFIX}/`)) {
    return isSafeObjectKey(url.slice(MEDIA_URL_PREFIX.length + 1).split(/[?#]/)[0]);
  }
  try {
    const parsed = new URL(url);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}

export function isRegisteredImage(asset) {
  return Boolean(typeof asset?.id === 'string' && asset.id.trim() && isSafeObjectKey(asset.objectKey) &&
    /* B-04: gif dropped — the backend allow-list is {jpeg,png,webp,avif}
       (`schemas/media/homepage.py` IMAGE_MIMES); accepting gif at browse
       time meant the save then failed server-side. The two allow-lists
       must stay equal. */
    /^image\/(jpeg|png|webp|avif)$/i.test(asset.mimeType ?? '') &&
    ['uploaded', 'active', 'ready'].includes(String(asset.status).toLowerCase()) &&
    isSafeMediaUrl(asset.url));
}

export function eligibleHomepageProduct(product) {
  return isBackendCatalogRecord(product) && String(product.status).toUpperCase() === 'PUBLISHED' &&
    product.published !== false && product.visible !== false && product.isVisible !== false &&
    !/^\s*(javascript|vbscript|file):/i.test(product.image ?? '');
}

export function safeCtaHref(href = '') {
  if (!href) return true;
  if (/[\x00-\x20\\]/.test(href)) return false;
  /* B-13: CTAs are site-relative ONLY — the backend now enforces the same
     single-slash rule on marketing-media writes (the storefront routes
     external CTAs to '/', so accepting them here was a lie). The former
     https? branch is dropped by design. */
  return /^\/(?!\/)/.test(href);
}

/** F-13/F-14: the two deterministic CTA rules, in one place so the hero editor
 *  and the section editor cannot disagree about them.
 *
 *  The server only enforces the pair for section entries: a hero row accepts an
 *  orphan `ctaLabel` and then the storefront's `readCta` silently drops it, so
 *  the operator believes a button exists. Checking here is presentation only —
 *  the API contract is untouched, no legacy row is rewritten, and a row that
 *  already holds an orphan label still loads and saves unchanged as long as the
 *  operator does not add to it. */
export function ctaErrors(draft = {}) {
  const label = String(draft.ctaLabel ?? '').trim();
  const href = String(draft.ctaHref ?? '').trim();
  if (Boolean(label) !== Boolean(href)) {
    const message = 'Button label and destination must be supplied together.';
    return { ctaLabel: message, ctaHref: message };
  }
  if (href && !safeCtaHref(href)) {
    return { ctaHref: 'CTA destination must be a single-slash site-relative link, for example /sarees.' };
  }
  return {};
}

export const entryDraft = (item = {}) => ({
  title: item.title ?? '', subtitle: item.subtitle ?? '',
  ctaLabel: item.ctaLabel ?? '', ctaHref: item.ctaHref ?? '', altText: item.altText ?? '',
});

export const registeredImageUrl = (asset) => isRegisteredImage(asset) ? resolveMediaUrl(asset.url) : '';
