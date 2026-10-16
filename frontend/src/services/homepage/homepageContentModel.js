import { hasAdminPermission } from '../../config/adminAccess';
import { hasPermission } from '../employees/authorization';
import { isBackendCatalogRecord } from '../catalog/catalogRecordSafety';
import { MEDIA_URL_PREFIX, resolveMediaUrl } from '../media/mediaPaths';

// The twelve reference sections, in visual order. Placement names are existing
// backend vocabulary, not a claim that Aarna consumes these non-hero rows.
export const HOMEPAGE_SECTIONS = Object.freeze([
  { id: 'hero', title: 'Home hero', placement: 'HOME_HERO', live: true },
  { id: 'categories', title: 'Category collage', product: true },
  { id: 'sarees', title: 'Saree lookbook', placement: 'SAREE_SECTION', product: true },
  { id: 'bridal', title: 'Bridal campaign', placement: 'BRIDAL_SECTION', product: true },
  { id: 'jewellery', title: 'Jewellery theatre', placement: 'JEWELLERY_SECTION', product: true },
  { id: 'promotion', title: 'Promotion banner', placement: 'PROMOTION' },
  { id: 'men', title: "Men’s editorial", placement: 'GROOM_SECTION', product: true },
  { id: 'kids', title: 'Kids playground', placement: 'KIDS_SECTION', product: true },
  { id: 'bestsellers', title: 'Bestsellers', product: true },
  { id: 'kurtis', title: 'Kurti lookbook', product: true },
  { id: 'newsletter', title: 'Newsletter' },
  { id: 'trust', title: 'Trust strip' },
]);

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
    /^image\/(jpeg|png|webp|avif|gif)$/i.test(asset.mimeType ?? '') &&
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
  return /^\/(?!\/)/.test(href) || /^https?:\/\//i.test(href) && isSafeMediaUrl(href);
}

export const entryDraft = (item = {}) => ({
  title: item.title ?? '', subtitle: item.subtitle ?? '',
  ctaLabel: item.ctaLabel ?? '', ctaHref: item.ctaHref ?? '', altText: item.altText ?? '',
});

export const registeredImageUrl = (asset) => isRegisteredImage(asset) ? resolveMediaUrl(asset.url) : '';
