import { normaliseProduct } from '../../../services/api/productsApi';
import { isBackendCatalogRecord } from '../../../services/catalog/catalogRecordSafety';
import { toDesignProduct } from '../../customer/mock/data/products.js';

const blank = Object.freeze({ eyebrow: '', title: '', subtitle: '', ctaLabel: '', ctaHref: '', altText: '', url: '' });
export function homepageSectionMode(snapshot, key) {
  if (snapshot.homeStatus === 'error') return { mode: 'unavailable' };
  if (!snapshot.home || ['idle', 'loading'].includes(snapshot.homeStatus)) return { mode: 'loading' };
  const content = snapshot.home.homepageContent;
  // No content contract (or a failed/foreign read) is an error, never a
  // fallback render: the homepage is database-driven end to end.
  if (!content || content.version !== 1 || content.status !== 'ready') return { mode: 'unavailable' };
  const section = content.sections?.find((s) => s.key === key);
  if (!section || section.state === 'unavailable') return { mode: 'unavailable' };
  // Missing, inactive and empty all render nothing — an unconfigured section
  // never falls back to reference content.
  if (['missing', 'inactive', 'empty'].includes(section.state)) return { mode: 'hidden' };
  if (section.state !== 'ready' || !section.configured) return { mode: 'unavailable' };
  return { mode: 'configured', section };
}

export function adaptHomepageSection(section) {
  const items = section.items ?? [];
  const typed = (kind, slot) => items.filter((r) => r.contentType === kind && (!slot || r.slotKey === slot));
  const copy = (value) => Object.fromEntries(Object.entries({ ...blank, ...value }).map(([key, entry]) => [key, Object.hasOwn(blank, key) ? String(entry ?? '') : entry]));
  const text = (slot) => copy(typed('TEXT', slot)[0]?.text);
  const media = (slot) => copy(typed('MEDIA', slot)[0]?.media);
  const products = (slot) => typed('PRODUCT', slot).map((r) => r.product).filter((p) => isBackendCatalogRecord(p) && p.status === 'PUBLISHED' && p.published !== false).map(normaliseProduct).map(toDesignProduct).filter(Boolean);
  return { intro: text('intro'), text, media, products, items,
    texts: () => typed('TEXT').filter((r) => r.slotKey !== 'intro').map((r) => ({ key: r.slotKey, ...text(r.slotKey) })),
    mediaList: () => typed('MEDIA').map((r) => ({ key: r.slotKey, ...media(r.slotKey) })),
  };
}
