/** Orchestration over existing APIs only; no cache, local storage or new CMS. */
import {
  apiListMarketingMedia, apiCreateMarketingMedia, apiUpdateMarketingMedia,
  apiDeleteMarketingMedia, apiReorderMarketingMedia,
} from '../api/marketingMediaApi';
import { apiListMediaAssets } from '../api/mediaApi';
import { apiListProducts } from '../api/productsApi';
import { homepageAccess, isRegisteredImage, eligibleHomepageProduct, entryDraft, safeCtaHref } from './homepageContentModel';
import { employeeHeroAccess, employeeHeroRequest, homepageRequest, staffHomepageAccess } from '../api/homepageApi';
import { MARKETING_PLACEMENTS } from '../../config/mediaTypes';

const denied = () => ({ ok: false, error: 'You are not authorized for this action.', status: 403 });
const validPlacement = (placement) => Object.values(MARKETING_PLACEMENTS).includes(placement);

export function loadHomepagePlacement(admin, placement) {
  if (admin?.employee) return placement === "HOME_HERO" ? employeeHeroRequest(admin, "read") : Promise.resolve(denied());
  if (!homepageAccess({ admin }).view) return Promise.resolve(denied());
  if (!validPlacement(placement)) return Promise.resolve({ ok: false, error: 'No backend placement contract for this section.' });
  return apiListMarketingMedia({ placement });
}

export async function loadRegisteredImages(admin, page = 1) {
  if (admin?.employee) {
    const result = await homepageRequest(admin, `/media-assets?page=${page}&pageSize=24`, "get", undefined, ["media.view"]);
    return result.ok ? { ...result, items: result.items.filter(isRegisteredImage) } : result;
  }
  if (!homepageAccess({ admin }).view) return denied();
  const result = await apiListMediaAssets({ page, pageSize: 24 });
  return result.ok ? { ...result, items: result.items.filter(isRegisteredImage) } : result;
}

export async function loadPublishedHomepageProducts(actor, page = 1) {
  if (!homepageAccess(actor).overview && !staffHomepageAccess(actor).view) return denied();
  const result = await apiListProducts({ page, pageSize: 24 });
  return result.ok ? { ...result, items: (result.items ?? []).filter(eligibleHomepageProduct) } : result;
}

export function saveHomepageEntry(admin, { placement, id, draft, asset, sortOrder = 0 }) {
  if (admin?.employee) return employeeHeroRequest(admin, id ? "patch" : "create", { id, draft: id ? entryDraft(draft) : { ...entryDraft(draft), isActive: false }, asset });
  const access = homepageAccess({ admin });
  if (!(id ? access.edit : access.create)) return Promise.resolve(denied());
  if (!validPlacement(placement)) return Promise.resolve({ ok: false, error: 'Unsupported placement.' });
  if (!safeCtaHref(draft?.ctaHref)) return Promise.resolve({ ok: false, error: 'Use a site-relative or HTTP(S) CTA URL.' });
  if ((!id || asset) && !isRegisteredImage(asset)) {
    return Promise.resolve({ ok: false, error: 'Choose a safe image from the registered media library.' });
  }
  // Only schema-supported copy fields; never accept product/pricing/lifecycle keys.
  const payload = entryDraft(draft);
  if (asset) Object.assign(payload, { objectKey: asset.objectKey, mediaAssetId: asset.id });
  if (id) return apiUpdateMarketingMedia(id, payload);
  return apiCreateMarketingMedia({ ...payload, placement, sortOrder, isActive: false });
}

export function setHomepageEntryActive(admin, id, active) {
  if (admin?.employee) return employeeHeroRequest(admin, "patch", { id, draft: { isActive: Boolean(active) } });
  if (!homepageAccess({ admin }).edit) return Promise.resolve(denied());
  return apiUpdateMarketingMedia(id, { isActive: Boolean(active) });
}

export function removeHomepageEntry(admin, id) {
  if (admin?.employee) return employeeHeroRequest(admin, "delete", { id });
  if (!homepageAccess({ admin }).delete) return Promise.resolve(denied());
  // Deletes only the placement row, never a product or storage object.
  return apiDeleteMarketingMedia(id);
}

export function reorderHomepageEntries(admin, placement, ids) {
  if (admin?.employee) return placement === "HOME_HERO" ? employeeHeroRequest(admin, "reorder", { ids }) : Promise.resolve(denied());
  if (!homepageAccess({ admin }).edit) return Promise.resolve(denied());
  if (!validPlacement(placement) || !Array.isArray(ids) || new Set(ids).size !== ids.length) {
    return Promise.resolve({ ok: false, error: 'Invalid placement order.' });
  }
  return apiReorderMarketingMedia({ placement, items: ids.map((id, sortOrder) => ({ id, sortOrder })) });
}
