/**
 * PRATIKSHYA FASHION — PHASE 2D · the offer boundary.
 *
 * ADAPTED AT THE BOUNDARY.
 *
 * The design's `mock/data/promotions.js` holds one hand-written sample offer
 * (a sample code the design's band then labels "Sample offer" on screen, from
 * the sample flag its data source sets). This module keeps the module's job — a
 * synchronous active promotion in the design's promotion shape — and answers it
 * from THIS application's offer register, the same register the storefront's
 * Phase 2B offer band reads:
 *
 *     offerRepository.listCustomerVisible() → toDesignPromotion()
 *
 * What is carried over, and what is not:
 *
 *   · PERCENTAGE OFFERS. The design's band is built around a percentage — the
 *     ledger's "N% off", the oversized numeral, the headline. A fixed-amount
 *     offer has no honest slot in that composition, so it does not drive the
 *     band (it still applies in the bag, where the application's own coupon
 *     rules own it). Recorded as a design/deviation note.
 *   · every figure is the record's own: the percentage, the code, the end date,
 *     and the terms are the register's own text (`formatOfferDiscount`,
 *     `describeEligibility`, `minimumOrderValue`).
 *   · the CTA's destination is resolved from the offer's own eligibility —
 *     its first collection or category, through the application's canonical
 *     routing — falling back to the shop listing. Never a design-era path.
 *   · the band's photography is the design's own campaign plate: an offer
 *     record carries no artwork, and the approved art direction for this
 *     section is what is being ported. The picture makes no claim of its own.
 *   · EMPTY IS A VALID ANSWER: with no ACTIVE percentage offer the band renders
 *     nothing at all — exactly what the design does when its own lookup misses.
 *
 * PREVIEW SEAM. `setPreviewPromotionSource()` lets the development reference
 * surface substitute the design's own sample offer (still labelled "Sample
 * offer" by the design's own markup) so the band can be compared like for like.
 */

import offerRepository, {
  OFFER_TYPES,
  describeEligibility,
  formatOfferDiscount,
} from '../../../../services/offers/offerRepository.js';
import { resolveCategoryRoute, resolveCollectionRoute } from '../../../../services/taxonomyRouting.js';
import taxonomyRepository from '../../../../services/taxonomyRepository.js';
import { images } from '../assets/images.js';

/* ── the seam ───────────────────────────────────────────────────────── */

let previewPromotion = null;

/** Preview-only substitution (see the module header). Pass `null` to clear. */
export const setPreviewPromotionSource = (promotion) => {
  previewPromotion = promotion ?? null;
};

/** True while the reference surface is showing the design's sample offer. */
export const usingPreviewPromotion = () => previewPromotion !== null;

/* ── mapping ────────────────────────────────────────────────────────── */

const asList = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);

/** The collection this offer is scoped to, when it is scoped to one. */
const scopeFor = (offer) => {
  const collectionId = asList(offer.includedCollections)[0];
  if (collectionId) {
    const collection = taxonomyRepository.findCollection(collectionId);
    const route = resolveCollectionRoute(collectionId);
    return {
      key: String(collectionId),
      label: collection?.name ?? String(collectionId),
      to: route?.href ?? null,
    };
  }
  const categoryId = asList(offer.includedCategories)[0];
  if (categoryId) {
    const category = taxonomyRepository.findCategory(categoryId);
    const route = resolveCategoryRoute(categoryId);
    return {
      key: String(categoryId),
      label: category?.name ?? String(categoryId),
      to: route?.href ?? null,
    };
  }
  return { key: null, label: null, to: null };
};

/**
 * Map one register offer into the design's promotion shape, or `null` when it
 * cannot honestly fill that shape.
 */
export const toDesignPromotion = (offer) => {
  if (!offer?.code) return null;
  if (offer.type !== OFFER_TYPES.PERCENTAGE) return null;
  const percent = Number(offer.discountValue);
  if (!Number.isFinite(percent) || percent <= 0) return null;

  const scope = scopeFor(offer);
  const name = String(offer.name ?? '').trim() || `${percent}% off`;
  const minimum = Number(offer.minimumOrderValue);
  const terms = [
    `Applies to ${describeEligibility(offer).toLowerCase() || 'the offer register'}.`,
    Number.isFinite(minimum) && minimum > 0 ? `Minimum order ₹${minimum.toLocaleString('en-IN')}.` : null,
    'One code per order.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    id: offer.id ?? offer.code,
    code: offer.code,
    isSample: Boolean(offer.isSample),
    label: name,
    headline: [name],
    copy: String(offer.description ?? '').trim(),
    discountPercent: percent,
    discountLabel: formatOfferDiscount(offer),
    scopeLabel: scope.label,
    eligibleCollection: scope.key,
    endsAt: offer.endDate || null,
    terms,
    cta: { label: name, to: scope.to ?? '/shop' },
    image: images.promoFestive,
    imageAlt: '',
    focal: '50% 30%',
  };
};

/**
 * The active promotion, or null. Keeps the design's own call signature
 * (`getActivePromotion()`) so the ported section needs no change at all.
 */
export const getActivePromotion = () => {
  if (previewPromotion) return previewPromotion;
  for (const offer of offerRepository.listCustomerVisible?.() ?? []) {
    const promotion = toDesignPromotion(offer);
    if (promotion) return promotion;
  }
  return null;
};

/** The promotion behind a code, or null — the bag's lookup. */
export const findPromotionByCode = (code) => {
  if (previewPromotion) {
    return String(previewPromotion.code).toUpperCase() === String(code ?? '').trim().toUpperCase()
      ? previewPromotion
      : null;
  }
  const needle = String(code ?? '').trim().toUpperCase();
  const offer = (offerRepository.listCustomerVisible?.() ?? []).find(
    (candidate) => String(candidate.code).toUpperCase() === needle,
  );
  return toDesignPromotion(offer);
};

/**
 * Kept for the design's own API shape. There is no sample register to export:
 * offers live in the application's offer repository, behind the accessors
 * above.
 */
export const promotions = [];
