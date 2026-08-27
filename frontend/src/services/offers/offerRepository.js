/**
 * PRATIKSHYA FASHON — Offer repository (backend-driven).
 *
 * Offers/coupons are backend-owned (GET /offers, POST /offers/validate and
 * the /admin/offers/* endpoints). This module is a facade over the
 * backend-fed catalog store: reads resolve from GET /offers hydration,
 * mutations call the API then refresh the store. There is no seed register
 * and no localStorage authority — a failed API call surfaces as an error.
 *
 * The config constants, validators and formatters below are UI
 * configuration / presentation helpers, not records.
 */

import {
  getOffers,
  refreshCatalog,
  subscribeCatalog,
} from "../catalog/catalogStore";
import {
  apiListOffers,
  apiValidateOfferCode,
  apiAdminListOffers,
  apiAdminGetOffer,
  apiAdminCreateOffer,
  apiAdminUpdateOffer,
  apiAdminActivateOffer,
  apiAdminPauseOffer,
  apiAdminArchiveOffer,
} from "../api/offersApi";

export const OFFER_STORAGE_KEY = "pratikshya_offers"; // legacy — unused
export const OFFERS_CHANGED_EVENT = "pratikshya-offers-changed";

export const OFFER_TYPES = { PERCENTAGE: "PERCENTAGE", FIXED_AMOUNT: "FIXED_AMOUNT" };

export const OFFER_STATUS = {
  DRAFT: "DRAFT", SCHEDULED: "SCHEDULED", ACTIVE: "ACTIVE",
  PAUSED: "PAUSED", EXPIRED: "EXPIRED", ARCHIVED: "ARCHIVED",
};

export const CUSTOMER_ELIGIBILITY = { ALL_CUSTOMERS: "ALL_CUSTOMERS", NEW_CUSTOMERS: "NEW_CUSTOMERS", SPECIFIC_CUSTOMERS: "SPECIFIC_CUSTOMERS" };
export const PRODUCT_ELIGIBILITY = { ALL_PRODUCTS: "ALL_PRODUCTS", SPECIFIC_PRODUCTS: "SPECIFIC_PRODUCTS", CATEGORY: "CATEGORY", COLLECTION: "COLLECTION" };

export const OFFER_TYPE_OPTIONS = [
  { id: OFFER_TYPES.PERCENTAGE, label: "Percentage off" },
  { id: OFFER_TYPES.FIXED_AMOUNT, label: "Fixed amount off" },
];

export const OFFER_STATUS_OPTIONS = [
  { id: OFFER_STATUS.DRAFT, label: "Draft" },
  { id: OFFER_STATUS.ACTIVE, label: "Active" },
  { id: OFFER_STATUS.PAUSED, label: "Paused" },
  { id: OFFER_STATUS.ARCHIVED, label: "Archived" },
];

export const CUSTOMER_ELIGIBILITY_OPTIONS = [
  { id: CUSTOMER_ELIGIBILITY.ALL_CUSTOMERS, label: "All customers" },
  { id: CUSTOMER_ELIGIBILITY.NEW_CUSTOMERS, label: "New customers only" },
  { id: CUSTOMER_ELIGIBILITY.SPECIFIC_CUSTOMERS, label: "Specific customers" },
];

export const PRODUCT_ELIGIBILITY_OPTIONS = [
  { id: PRODUCT_ELIGIBILITY.ALL_PRODUCTS, label: "All products" },
  { id: PRODUCT_ELIGIBILITY.SPECIFIC_PRODUCTS, label: "Specific products" },
  { id: PRODUCT_ELIGIBILITY.CATEGORY, label: "Category" },
  { id: PRODUCT_ELIGIBILITY.COLLECTION, label: "Collection" },
];

export const OFFER_MESSAGES = {
  UNAVAILABLE: "This offer isn't available for this collection.",
  EXPIRED: "This offer has expired.",
  INVALID: "This offer is not valid for this order.",
  ALREADY_APPLIED: "This offer is already applied.",
};

// ---------------------------------------------------------------------------
// Pure helpers / config
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();
const asNumber = (value, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const asArray = (value) => (Array.isArray(value) ? value.filter(Boolean).map(String) : []);

export const normalizeCode = (code) => String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");

export const isValidCodeFormat = (code) => /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(normalizeCode(code));

export const deriveStatus = (offer, now = new Date()) => {
  if (!offer) return OFFER_STATUS.DRAFT;
  if (offer.status === OFFER_STATUS.ARCHIVED) return OFFER_STATUS.ARCHIVED;
  if (offer.status === OFFER_STATUS.DRAFT) return OFFER_STATUS.DRAFT;
  if (offer.status === OFFER_STATUS.PAUSED) return OFFER_STATUS.PAUSED;
  if (offer.endDate && new Date(offer.endDate).getTime() < now.getTime()) return OFFER_STATUS.EXPIRED;
  if (offer.startDate && new Date(offer.startDate).getTime() > now.getTime()) return OFFER_STATUS.SCHEDULED;
  return OFFER_STATUS.ACTIVE;
};

export const isRedeemableStatus = (status) => status === OFFER_STATUS.ACTIVE;

export const isProductInCollection = (product, collectionId) => {
  const ids = asArray(product?.collectionIds);
  return ids.includes(collectionId) || asArray(product?.collections).includes(collectionId);
};

export const isProductExcluded = (offer, product) =>
  asArray(offer.excludedProducts).includes(product.id) ||
  asArray(offer.excludedCategories).includes(product.category) ||
  asArray(offer.excludedCollections).some((id) => isProductInCollection(product, id));

export const isProductEligible = (offer, product) => {
  if (!offer || !product) return false;
  if (isProductExcluded(offer, product)) return false;
  if (offer.productEligibility === PRODUCT_ELIGIBILITY.ALL_PRODUCTS) return true;
  if (offer.productEligibility === PRODUCT_ELIGIBILITY.SPECIFIC_PRODUCTS) {
    return asArray(offer.includedProducts).includes(product.id);
  }
  if (offer.productEligibility === PRODUCT_ELIGIBILITY.CATEGORY) {
    return asArray(offer.includedCategories).includes(product.category);
  }
  if (offer.productEligibility === PRODUCT_ELIGIBILITY.COLLECTION) {
    return asArray(offer.includedCollections).some((id) => isProductInCollection(product, id));
  }
  return false;
};

export const isNewCustomer = (customerId, email) => !customerId && !email;

export const isCustomerEligible = (offer, { customerId = null, customerEmail = null } = {}) => {
  if (!offer) return false;
  if (offer.customerEligibility === CUSTOMER_ELIGIBILITY.ALL_CUSTOMERS) return true;
  if (offer.customerEligibility === CUSTOMER_ELIGIBILITY.NEW_CUSTOMERS) {
    return isNewCustomer(customerId, customerEmail);
  }
  if (offer.customerEligibility === CUSTOMER_ELIGIBILITY.SPECIFIC_CUSTOMERS) {
    return asArray(offer.specificCustomerIds).includes(customerId);
  }
  return false;
};

export const previewOfferDiscount = (offer, sampleAmount = 10000) => {
  if (!offer) return 0;
  const base = Math.max(0, asNumber(sampleAmount));
  if (offer.type === OFFER_TYPES.FIXED_AMOUNT) {
    return Math.min(asNumber(offer.discountValue), base);
  }
  const raw = base * (asNumber(offer.discountValue) / 100);
  return offer.maximumDiscount > 0 ? Math.min(raw, offer.maximumDiscount) : raw;
};

export const formatOfferDiscount = (offer) => {
  if (!offer) return "";
  return offer.type === OFFER_TYPES.FIXED_AMOUNT
    ? `₹${Math.round(asNumber(offer.discountValue)).toLocaleString("en-IN")} OFF`
    : `${asNumber(offer.discountValue)}% OFF`;
};

export const describeEligibility = (offer) => {
  if (!offer) return "";
  if (offer.productEligibility === PRODUCT_ELIGIBILITY.ALL_PRODUCTS) return "All products";
  if (offer.productEligibility === PRODUCT_ELIGIBILITY.SPECIFIC_PRODUCTS) return `${asArray(offer.includedProducts).length} products`;
  if (offer.productEligibility === PRODUCT_ELIGIBILITY.CATEGORY) return `${asArray(offer.includedCategories).length} categories`;
  if (offer.productEligibility === PRODUCT_ELIGIBILITY.COLLECTION) return `${asArray(offer.includedCollections).length} collections`;
  return "";
};

export const describeCustomerEligibility = (offer) => {
  if (!offer) return "";
  if (offer.customerEligibility === CUSTOMER_ELIGIBILITY.ALL_CUSTOMERS) return "All customers";
  if (offer.customerEligibility === CUSTOMER_ELIGIBILITY.NEW_CUSTOMERS) return "New customers";
  if (offer.customerEligibility === CUSTOMER_ELIGIBILITY.SPECIFIC_CUSTOMERS) return "Specific customers";
  return "";
};

const STATUS_META = {
  [OFFER_STATUS.DRAFT]: { label: "Draft", tone: "quiet" },
  [OFFER_STATUS.SCHEDULED]: { label: "Scheduled", tone: "info" },
  [OFFER_STATUS.ACTIVE]: { label: "Active", tone: "success" },
  [OFFER_STATUS.PAUSED]: { label: "Paused", tone: "alert" },
  [OFFER_STATUS.EXPIRED]: { label: "Expired", tone: "muted" },
  [OFFER_STATUS.ARCHIVED]: { label: "Archived", tone: "muted" },
};

export const getStatusMeta = (status) => STATUS_META[status] ?? STATUS_META[OFFER_STATUS.DRAFT];

/**
 * Map the UI eligibility selections onto the fields the coupon table
 * actually has (id lists on the API payload). The table stores NO
 * maximumDiscount cap, NO priority and NO separate auto-apply flag — those
 * editor notions are deliberately DROPPED here (documented BACKEND_GAP)
 * instead of being silently half-persisted under other columns.
 */
export const toApiScopeFields = (draft = {}) => {
  const mode = draft.productEligibility ?? PRODUCT_ELIGIBILITY.ALL_PRODUCTS;
  const customerMode = draft.customerEligibility ?? CUSTOMER_ELIGIBILITY.ALL_CUSTOMERS;
  const scope = {
    eligibleProductIds: mode === PRODUCT_ELIGIBILITY.SPECIFIC_PRODUCTS ? asArray(draft.includedProducts) : [],
    eligibleCategoryIds: mode === PRODUCT_ELIGIBILITY.CATEGORY ? asArray(draft.includedCategories) : [],
    eligibleCollectionIds: mode === PRODUCT_ELIGIBILITY.COLLECTION ? asArray(draft.includedCollections) : [],
    excludedProductIds: asArray(draft.excludedProducts),
    excludedCategoryIds: asArray(draft.excludedCategories),
    eligibleCustomerIds:
      customerMode === CUSTOMER_ELIGIBILITY.SPECIFIC_CUSTOMERS ? asArray(draft.specificCustomerIds) : [],
    isStackable: Boolean(draft.stackable),
  };
  // "New customers only" has no column on the coupon table — it cannot be
  // persisted; the editor flags this and the field is not sent.
  return scope;
};

export const toCheckoutCoupon = (offer) => {
  if (!offer) return null;
  return {
    ...offer,
    summary: formatOfferDiscount(offer),
    validFrom: offer.startDate || null,
    validTo: offer.endDate || null,
  };
};

/** Normalise a backend offer record into the frontend offer shape. */
export const normaliseOffer = (raw = {}) => {
  const type = raw.type === OFFER_TYPES.FIXED_AMOUNT ? OFFER_TYPES.FIXED_AMOUNT : OFFER_TYPES.PERCENTAGE;
  const offer = {
    id: raw.id,
    code: normalizeCode(raw.code),
    name: String(raw.name ?? raw.title ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    type,
    discountValue: Math.max(0, asNumber(raw.discountValue ?? raw.discount_value, 0)),
    minimumOrderValue: Math.max(0, asNumber(raw.minimumOrderValue ?? raw.min_order_value, 0)),
    maximumDiscount: Math.max(0, asNumber(raw.maximumDiscount ?? raw.max_discount, 0)),
    startDate: raw.startDate ?? raw.start_date ?? "",
    endDate: raw.endDate ?? raw.end_date ?? "",
    status: raw.status ?? OFFER_STATUS.DRAFT,
    usageLimit: Math.max(0, Math.floor(asNumber(raw.usageLimit ?? raw.usage_limit, 0))),
    usageCount: Math.max(0, Math.floor(asNumber(raw.usageCount ?? raw.usage_count, 0))),
    perCustomerLimit: Math.max(0, Math.floor(asNumber(raw.perCustomerLimit ?? raw.per_customer_limit, 0))),
    customerEligibility: Object.values(CUSTOMER_ELIGIBILITY).includes(raw.customerEligibility ?? raw.customer_eligibility)
      ? raw.customerEligibility ?? raw.customer_eligibility
      : CUSTOMER_ELIGIBILITY.ALL_CUSTOMERS,
    specificCustomerIds: asArray(raw.specificCustomerIds ?? raw.specific_customer_ids),
    productEligibility: Object.values(PRODUCT_ELIGIBILITY).includes(raw.productEligibility ?? raw.product_eligibility)
      ? raw.productEligibility ?? raw.product_eligibility
      : PRODUCT_ELIGIBILITY.ALL_PRODUCTS,
    includedProducts: asArray(raw.includedProducts ?? raw.product_ids),
    includedCategories: asArray(raw.includedCategories ?? raw.category_ids),
    includedCollections: asArray(raw.includedCollections ?? raw.collection_ids),
    excludedProducts: asArray(raw.excludedProducts ?? raw.excluded_product_ids),
    excludedCategories: asArray(raw.excludedCategories ?? raw.excluded_category_ids),
    excludedCollections: asArray(raw.excludedCollections ?? raw.excluded_collection_ids),
    stackable: Boolean(raw.stackable),
    priority: Math.max(0, Math.floor(asNumber(raw.priority, 0))),
    createdBy: raw.createdBy ?? raw.created_by ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? nowIso(),
    updatedBy: raw.updatedBy ?? raw.updated_by ?? null,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? nowIso(),
  };
  return { ...offer, displayStatus: deriveStatus(offer) };
};

const readOffers = () => (getOffers() ?? []).map(normaliseOffer);

const emitChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFERS_CHANGED_EVENT));
};

/** Refreshes the offer snapshot from GET /offers (called at startup by hydrate). */
export const syncOffers = async () => {
  const result = await apiListOffers({ status: "" });
  if (!result.ok) return { ok: false, error: result.error };
  // The catalog store holds explore offers; admin desks call apiAdminListOffers directly.
  emitChange();
  return { ok: true, offers: result.offers };
};

export const getOfferRedemptions = () => []; // redemptions are backend-owned (orders)

export const effectiveUsageCount = (offer) => asNumber(offer?.usageCount ?? offer?.usage_count, 0);

export const validateOfferDraft = (draft = {}, { ignoreId = null } = {}) => {
  const errors = {};
  const code = normalizeCode(draft.code);
  if (!code) errors.code = "Code is required.";
  else if (!isValidCodeFormat(code)) errors.code = "Use 3–40 letters, numbers, _ or -.";
  if (!String(draft.name ?? "").trim()) errors.name = "Name is required.";
  if (asNumber(draft.discountValue) <= 0) errors.discountValue = "Discount value must be greater than zero.";
  if (draft.type === OFFER_TYPES.PERCENTAGE && asNumber(draft.discountValue) > 100) {
    errors.discountValue = "Percentage discounts cannot exceed 100%.";
  }
  if (draft.endDate && draft.startDate && String(draft.startDate) > String(draft.endDate)) {
    errors.endDate = "End date must be after the start date.";
  }
  return { ok: Object.keys(errors).length === 0, errors };
};

/** Backend validation of a code against the current context. */
export const validateOffer = async (code, context = {}) => {
  const result = await apiValidateOfferCode({
    code,
    cartItems: context.cartItems ?? [],
    customerId: context.customerId ?? null,
    customerEmail: context.customerEmail ?? null,
  });
  if (!result.ok) {
    return { ok: false, message: result.error, offer: null };
  }
  return { ok: true, coupon: toCheckoutCoupon(result.offer), offer: result.offer, message: result.message };
};

// ---------------------------------------------------------------------------
// Repository facade — backend-backed reads + async mutations
// ---------------------------------------------------------------------------

export const offerRepository = {
  /** Session-cached offers (hydrated from GET /offers at startup). */
  all: () => readOffers(),

  list: (filters = {}) => {
    const term = String(filters.query ?? "").trim().toLowerCase();
    return readOffers().filter((offer) => {
      if (filters.status && filters.status !== "ALL" && offer.displayStatus !== filters.status) return false;
      if (filters.type && filters.type !== "ALL" && offer.type !== filters.type) return false;
      if (filters.usage === "LIMITED" && !(offer.usageLimit > 0)) return false;
      if (filters.usage === "UNLIMITED" && offer.usageLimit > 0) return false;
      if (!term) return true;
      return [offer.code, offer.name, offer.description].join(" ").toLowerCase().includes(term);
    });
  },

  find: (id) => readOffers().find((offer) => String(offer.id) === String(id)) ?? null,

  findByCode: (code) => {
    const needle = normalizeCode(code);
    return readOffers().find((offer) => offer.code === needle) ?? null;
  },

  getCheckoutCoupon: (code) => {
    const offer = offerRepository.findByCode(code);
    return offer ? toCheckoutCoupon(offer) : null;
  },

  isCodeTaken: (code, ignoreId = null) => {
    const existing = offerRepository.findByCode(code);
    return Boolean(existing && String(existing.id) !== String(ignoreId));
  },

  create: async (draft, _actor = null) => {
    const validation = validateOfferDraft(draft);
    if (!validation.ok) return { ok: false, errors: validation.errors };
    const result = await apiAdminCreateOffer({ ...draft, code: normalizeCode(draft.code) });
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    emitChange();
    return { ok: true, offer: result.offer };
  },

  update: async (id, patch, _actor = null) => {
    const result = await apiAdminUpdateOffer(id, patch);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    emitChange();
    return { ok: true, offer: result.offer };
  },

  activate: async (id, _actor = null) => {
    const result = await apiAdminActivateOffer(id);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    emitChange();
    return { ok: true, offer: result.offer };
  },

  pause: async (id, _actor = null) => {
    const result = await apiAdminPauseOffer(id);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    emitChange();
    return { ok: true, offer: result.offer };
  },

  archive: async (id, _actor = null) => {
    const result = await apiAdminArchiveOffer(id);
    if (!result.ok) return { ok: false, error: result.error };
    await refreshCatalog();
    emitChange();
    return { ok: true, offer: result.offer };
  },

  listCustomerVisible: ({ customerId = null, customerEmail = null } = {}) =>
    readOffers()
      .filter((offer) => deriveStatus(offer) === OFFER_STATUS.ACTIVE)
      .filter((offer) => isCustomerEligible(offer, { customerId, customerEmail }))
      .sort((a, b) => asNumber(b.priority ?? 0) - asNumber(a.priority ?? 0)),

  getProductOfferBadge: (product) => {
    if (!product) return null;
    const candidates = offerRepository.listCustomerVisible()
      .filter((offer) => offer.customerEligibility === CUSTOMER_ELIGIBILITY.ALL_CUSTOMERS)
      .filter((offer) => isProductEligible(offer, product));
    if (!candidates.length) return null;
    const scoped = candidates.filter((offer) => offer.productEligibility !== PRODUCT_ELIGIBILITY.ALL_PRODUCTS);
    const pool = scoped.length ? scoped : candidates;
    const best = [...pool].sort((a, b) => asNumber(b.priority ?? 0) - asNumber(a.priority ?? 0))[0];
    if (!best) return null;
    return { code: best.code, label: formatOfferDiscount(best) };
  },

  categories: () => ["ALL", ...new Set(readOffers().map((o) => (o.includedCategories ?? [])).flat())].filter(Boolean),
  collections: () => ["ALL", ...new Set(readOffers().map((o) => (o.includedCollections ?? [])).flat())].filter(Boolean),
  metrics: () => {
    const all = readOffers();
    return {
      total: all.length,
      active: all.filter((o) => o.displayStatus === OFFER_STATUS.ACTIVE).length,
      paused: all.filter((o) => o.displayStatus === OFFER_STATUS.PAUSED).length,
      draft: all.filter((o) => o.displayStatus === OFFER_STATUS.DRAFT).length,
      expired: all.filter((o) => o.displayStatus === OFFER_STATUS.EXPIRED).length,
    };
  },
};

export { subscribeCatalog };
export default offerRepository;
