/**
 * PRATIKSHYA FASHION — Batch 1 preview composition.
 *
 * Pure functions only: no React, no HTTP, no writes, no storage. The real
 * storefront components still render the result; nothing here invents a
 * second renderer.
 *
 * ── Why this exists ─────────────────────────────────────────────────────
 * `adaptHomepageSection` (components/storefront/home/homepageSectionModel.js)
 * selects the FIRST row per typed slot — `typed('TEXT', slot)[0]`. The old
 * preview pushed the operator's draft AFTER the saved rows, so the adapter
 * kept returning the saved value (F-01). The fix is to compose the item array
 * *before* adapting: replace the edited row by id, or append the draft when it
 * is a new entry. The shared adapter is never modified (storefront contract).
 *
 * A MEDIA slot with no art previously received a copy of another slot's
 * image, so a 1-of-4 collage previewed as a complete collage (F-12). Missing
 * slots now get a labelled placeholder SVG, and the caller shows the
 * configured-versus-required count.
 *
 * Hero rows are mapped to the exact `/home` slide shape that
 * `customerHomeHeroSlides` already consumes (F-04), including the defaults the
 * backend applies in `services/catalog/explore_service._build_hero_slides_from_db`
 * (title "PRATIKSHYA FASHION", CTA "Explore Collection" → "/shop"). The
 * placement read returns `mobileMediaAssetId`, not the mobile asset URL, so
 * portrait art direction is deliberately NOT previewed rather than guessed.
 */

import { registeredImageUrl } from '../../../services/homepage/homepageContentModel';

export const PREVIEW_DRAFT_ID = 'preview-draft';
export const COPY_KEYS = Object.freeze(['eyebrow', 'title', 'subtitle', 'ctaLabel', 'ctaHref', 'altText']);

const asCopy = (draft = {}) => Object.fromEntries(COPY_KEYS.map((key) => [key, String(draft?.[key] ?? '')]));
const hasCopy = (copy) => COPY_KEYS.some((key) => copy[key].trim());

/* Business names for the structural media slots. A slot key that is not
   listed still gets an honest, readable label from its own key — never
   another slot's photograph. */
const SLOT_LABELS = Object.freeze({
  categories: { women: 'Women tile', men: 'Men tile', kids: 'Kids tile', essentials: 'Essentials tile' },
  sarees: { 'lookbook-1': 'Lookbook frame 1', 'lookbook-2': 'Lookbook frame 2', 'lookbook-3': 'Lookbook frame 3' },
  bridal: { bride: 'Bride plate', groom: 'Groom plate', couple: 'Couple plate' },
  jewellery: { campaign: 'Campaign image' },
  promotion: { campaign: 'Campaign image' },
  men: { campaign: 'Campaign image' },
  kids: { main: 'Main image', girls: 'Girls image', boys: 'Boys image' },
  kurtis: {
    'everyday-kurtis': 'Everyday kurtis image',
    anarkalis: 'Anarkalis image',
    'festive-kurtis': 'Festive kurtis image',
    'kurta-sets': 'Kurta sets image',
  },
  newsletter: { campaign: 'Campaign image' },
});

export function slotLabel(sectionKey, slotKey) {
  const named = SLOT_LABELS[sectionKey]?.[slotKey];
  if (named) return named;
  const words = String(slotKey ?? '').replace(/[-_]+/g, ' ').trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)} image` : 'Image slot';
}

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** A self-contained, obviously-not-photography placeholder. No network. */
export function placeholderMediaUrl(label) {
  const safe = escapeXml(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">`
    + `<rect width="800" height="1000" fill="#FBF4EB"/>`
    + `<rect x="26" y="26" width="748" height="948" fill="none" stroke="#B98948" stroke-width="3" stroke-dasharray="16 12"/>`
    + `<text x="400" y="470" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="42" fill="#4A0718">Image not set</text>`
    + `<text x="400" y="536" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#6F5D52">${safe}</text>`
    + `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const nextSortOrder = (items) => items.reduce((max, row) => Math.max(max, Number(row?.sortOrder) || 0), -1) + 1;

/**
 * Overlay the operator's in-progress values on the saved item array.
 *
 * @returns {{items: Array, applied: boolean, created: boolean, replacedId: string|null}}
 *   `items` is a NEW array; the input rows are never mutated.
 */
export function mergePreviewItems({
  items = [],
  contentType = null,
  slotKey = '',
  editingId = undefined,
  draft = {},
  asset = null,
  product = null,
} = {}) {
  const next = items.map((row) => ({ ...row }));
  if (!contentType) return { items: next, applied: false, created: false, replacedId: null };

  const byId = editingId ? next.findIndex((row) => row.id === editingId) : -1;
  /* Three explicit cases:
       · editingId is a string  → replace that saved row (F-01);
       · editingId === null     → the form is open on a NEW entry → append;
       · editingId === undefined→ legacy caller with no row identity → assume
                                  the form is editing the visible row in that
                                  slot and replace it (never append a
                                  duplicate beside it).
     The old preview always appended, which is exactly why the adapter's
     first-row rule kept showing the saved value. */
  const bySlot = editingId === undefined ? next.findIndex((row) => row.contentType === contentType && row.slotKey === slotKey) : -1;
  const baseIndex = byId >= 0 ? byId : bySlot;
  const base = baseIndex >= 0 ? next[baseIndex] : null;
  const copy = asCopy(draft);

  let payload = null;
  if (contentType === 'TEXT') {
    const text = { ...(base?.text ?? {}), ...copy };
    payload = hasCopy(text) || base ? { text } : null;
  } else if (contentType === 'MEDIA') {
    const url = asset ? (registeredImageUrl(asset) || String(asset.url ?? '')) : String(base?.media?.url ?? '');
    const media = { ...(base?.media ?? {}), ...copy, url };
    payload = url || hasCopy(media) || base ? { media } : null;
  } else if (contentType === 'PRODUCT') {
    payload = product ? { product } : null;
  }
  if (!payload) return { items: next, applied: false, created: false, replacedId: null };

  if (baseIndex >= 0) {
    next[baseIndex] = { ...base, ...payload };
    return { items: next, applied: true, created: false, replacedId: next[baseIndex].id ?? null };
  }
  const created = {
    id: PREVIEW_DRAFT_ID,
    slotKey,
    contentType,
    sortOrder: nextSortOrder(next),
    isActive: true,
    ...payload,
  };
  next.push(created);
  return { items: next, applied: true, created: true, replacedId: null };
}

/** How many structural MEDIA slots the registry requires, and which are set. */
export function mediaSlotCoverage(allowedSlots = [], items = [], sectionKey = '') {
  const required = (allowedSlots ?? [])
    .filter((spec) => spec?.contentType === 'MEDIA')
    .map((spec) => ({ ...spec, sectionKey }));
  const isSet = (spec) => items.some((row) => row?.contentType === 'MEDIA' && row.slotKey === spec.slotKey && String(row?.media?.url ?? '').trim());
  const missing = required.filter((spec) => !isSet(spec));
  return {
    required,
    configured: required.length - missing.length,
    total: required.length,
    missing,
    complete: missing.length === 0,
  };
}

/**
 * Put the MEDIA rows in registry order and give every unset slot a labelled
 * placeholder. Saved rows are reused, never duplicated into other slots.
 */
export function alignPreviewMedia({ items = [], allowedSlots = [], sectionKey = '' } = {}) {
  const specs = (allowedSlots ?? []).filter((spec) => spec?.contentType === 'MEDIA');
  if (!specs.length) return items;
  const others = items.filter((row) => row.contentType !== 'MEDIA');
  const media = specs.map((spec) => {
    const saved = items.find((row) => row.contentType === 'MEDIA' && row.slotKey === spec.slotKey);
    if (saved && String(saved?.media?.url ?? '').trim()) return saved;
    const label = slotLabel(sectionKey, spec.slotKey);
    return {
      id: `preview-placeholder-${spec.slotKey}`,
      slotKey: spec.slotKey,
      contentType: 'MEDIA',
      sortOrder: nextSortOrder(items),
      isActive: false,
      placeholder: true,
      media: {
        url: placeholderMediaUrl(label),
        altText: `${label} — no image chosen`,
        title: '',
        subtitle: '',
        eyebrow: '',
        ctaLabel: '',
        ctaHref: '',
      },
    };
  });
  /* A row whose slot is no longer in the registry is an authoring warning
     (`invalid_slot`); keep it visible instead of silently dropping it. */
  const orphans = items.filter((row) => row.contentType === 'MEDIA' && !specs.some((spec) => spec.slotKey === row.slotKey));
  return [...others, ...media, ...orphans];
}

/**
 * Everything SectionPreview needs, composed without touching shared code.
 */
export function buildSectionPreview({ sectionKey, section = null, contentType = null, slotKey = '', editingId = undefined, draft = {}, asset = null, product = null } = {}) {
  const saved = Array.isArray(section?.items) ? section.items : [];
  const merged = mergePreviewItems({ items: saved, contentType, slotKey, editingId, draft, asset, product });
  const coverage = mediaSlotCoverage(section?.allowedSlots ?? [], merged.items, sectionKey);
  const items = alignPreviewMedia({ items: merged.items, allowedSlots: section?.allowedSlots ?? [], sectionKey });
  return {
    section: { key: sectionKey, configured: Boolean(section?.configured), state: section?.state ?? 'missing', items },
    coverage,
    applied: merged.applied,
    created: merged.created,
    configured: Boolean(section?.configured),
  };
}

/** Honest, state-dependent header. Never claims "not saved" about saved rows. */
export function previewStateLabel({ configured, applied }) {
  if (!configured) return 'Preview — unconfigured section · showing local draft only (nothing saved)';
  if (applied) return 'Preview — includes unsaved changes (not saved)';
  return 'Preview — saved content (no unsaved changes)';
}

/** "2 of 4 image slots have art · not set: Kids tile, Essentials tile" */
export function coverageLabel(coverage) {
  if (!coverage || !coverage.total) return '';
  const missing = coverage.missing.map((spec) => slotLabel(spec.sectionKey, spec.slotKey));
  return missing.length
    ? `${coverage.configured} of ${coverage.total} image slots have art · not set: ${missing.join(', ')}`
    : `${coverage.configured} of ${coverage.total} image slots have art`;
}

/**
 * Map placement rows to the `/home` hero-slide shape, with the same per-row
 * fallbacks `explore_service._build_hero_slides_from_db` applies (title, CTA,
 * href), so the copy matches the storefront exactly.
 *
 * One deliberate difference: the storefront receives ACTIVE rows only
 * (`list_active_home_hero`), while the authoring preview renders every row the
 * operator can see — including the inactive one being edited — and says so on
 * screen. Hero layouts are assigned by index, so a preview containing inactive
 * rows can show a different layout per slide than the live carousel.
 */
export function heroPreviewSlides(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .slice()
    .sort((a, b) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0))
    .filter((row) => row && (row.url || row.objectKey))
    .map((row) => ({
      id: row.id ?? row.objectKey,
      image: row.url || '',
      mobileImage: '',
      title: row.title || 'PRATIKSHYA FASHION',
      subtitle: row.subtitle || '',
      eyebrow: '',
      cta: row.ctaLabel || 'Explore Collection',
      href: row.ctaHref || '/shop',
      altText: row.altText || '',
      mediaId: row.objectKey ?? null,
    }));
}
