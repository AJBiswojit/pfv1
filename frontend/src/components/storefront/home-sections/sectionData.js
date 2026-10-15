/**
 * PRATIKSHYA FASHION — homepage content-section models (Phase 2B).
 *
 * One place that turns the application's OWN services into the shapes the
 * ported sections need. Nothing here authors a product, a price, a category
 * or a picture: every value is read from the canonical taxonomy, the live
 * catalogue, the offers register and the central media resolver.
 *
 * Two rules the whole module follows:
 *
 *   1. EMPTY IS A VALID ANSWER. With no backend (or no rows) a builder
 *      returns `null`/`[]` and its section renders nothing at all. No
 *      fallback copy, no placeholder product, no invented campaign.
 *   2. PREVIEW OVERRIDES ARE PASSED IN, NEVER IMPORTED. Each builder takes an
 *      optional `override`; the development-only preview harness supplies the
 *      labelled fixtures, so fixture data can never reach production by
 *      import. (See `src/components/storefront/preview/previewFixtures.js`.)
 *
 * `SECTION_COPY` holds the APPROVED DESIGN's own editorial headings, ported
 * verbatim from `home-page/`. They are brand language, not data — the design
 * has no CMS for them yet, so they live here as named constants until a
 * managed content source exists (recorded as a capability gap in
 * `docs/PHASE-2B-HOMEPAGE-CONTENT-SECTIONS.md`).
 */

import { departments as canonicalDepartments } from "../../../data/catalog/taxonomy";
import { getLiveStorefrontProducts } from "../../../data/products";
import {
  resolveCategoryCover,
  resolveCollectionCover,
  resolveFestiveCampaignImage,
} from "../../../services/media/mediaResolver";
import { resolveCategoryRoute, categoryHref } from "../../../services/taxonomyRouting";
import taxonomyRepository from "../../../services/taxonomyRepository";
import offerRepository, { formatOfferDiscount, describeEligibility } from "../../../services/offers/offerRepository";
import { formatINR } from "../../../utils/shopping";

/** The approved design's section headings (brand language, not data). */
export const SECTION_COPY = Object.freeze({
  sections: [
    "categories",
    "saree",
    "bridal",
    "finishing",
    "offer",
    "men",
    "kids",
    "rail",
    "lookbook",
  ],
  categories: {
    index: "02",
    label: "Shop by Category",
    title: "Dressed for",
    titleAccent: "every",
    titleTail: "chapter.",
    intro: "Four wardrobes, one sensibility — read from the live catalogue.",
  },
  saree: {
    index: "03",
    label: "The Saree Edits",
    title: "Six yards,",
    titleAccent: "unhurried.",
    lead: "Silks, cotton handlooms and modern pre-draped silhouettes, each listed with the weave and the region the house sourced it from.",
    railTitle: "Complete the drape",
    railNote: "The silks of the edit, and the pieces we would wear with them.",
  },
  bridal: {
    index: "04",
    label: "The Bridal Edit · Bride & Groom",
    title: "Composed",
    titleAccent: "as a pair.",
    intro: "Worked by hand over weeks, tone on tone — styled together, sold separately.",
    bride: { kicker: "I · The Bride", title: "For the ceremony", accent: "itself." },
    groom: { kicker: "II · The Groom", title: "Ivory,", accent: "tone on tone." },
  },
  finishing: {
    index: "05",
    label: "Finishing Touches",
    title: "Heirlooms,",
    titleAccent: "worn daily.",
    lead: "Bangles and bridal jewellery, handset and finished in the house workshop.",
  },
  offer: {
    index: "06",
    railTitle: "Everyday Essentials",
  },
  men: {
    index: "07",
    label: "Menswear",
    title: "Tailored for ceremony,",
    titleAccent: "and Tuesdays.",
    lead: "Kurtas, kurta pajamas and groom edits, cut with a modern shoulder.",
  },
  kids: {
    index: "08",
    label: "Kidswear",
    title: "Little",
    titleAccent: "celebrations.",
    lead: "Soft linings, easy buttons and enough swish for the dance floor.",
    sticker: "made\nfor\ntwirling",
  },
  rail: {
    index: "09",
    label: "Most Loved",
    title: "Bestsellers",
    /* The honest note Project B itself prints on this section. */
    note: "Ordered by the catalogue's own featured and newest signals — the backend does not yet expose a verified sales ranking.",
  },
  lookbook: {
    index: "10",
    label: "Fabric Stories",
    title: "The house",
    titleAccent: "weaves.",
  },
});

/* ------------------------------------------------------------------ */
/* Shared readers                                                      */
/* ------------------------------------------------------------------ */

const liveProducts = () => {
  try {
    return getLiveStorefrontProducts() ?? [];
  } catch {
    return [];
  }
};

const safeCover = (resolver, record, fallback = null) => {
  try {
    const source = resolver(record);
    return source?.src ? source : fallback;
  } catch {
    return fallback;
  }
};

/** Products in one taxonomy bucket (department / category / subcategory). */
const inBucket = (products, key, value) =>
  products.filter((product) => String(product?.[key] ?? "") === String(value));

const byOrder = (a, b) =>
  Number(a?.sortOrder ?? 0) - Number(b?.sortOrder ?? 0) || String(a?.name ?? "").localeCompare(String(b?.name ?? ""));

const piecesLabel = (count) => (count > 0 ? `${count} ${count === 1 ? "piece" : "pieces"}` : "Arriving soon");

/* ------------------------------------------------------------------ */
/* 02 · Category tiles                                                 */
/* ------------------------------------------------------------------ */

/**
 * The four canonical departments as collage tiles. Labels, notes and routes
 * come from the taxonomy; each plate is the department's own leading category
 * cover through the central media resolver, and each count is the number of
 * live products filed under that department.
 */
export const buildCategoryTiles = (override = null) => {
  if (override) return override;
  const products = liveProducts();

  const tiles = canonicalDepartments.map((department) => {
    const lead = [...department.categories].sort(byOrder)[0] ?? null;
    const record = lead ? taxonomyRepository.findCategory(lead.id) ?? lead : null;
    const count = inBucket(products, "department", department.id).length;
    return {
      key: department.id,
      label: department.name,
      note: department.description ?? "",
      to: department.path,
      image: record ? safeCover(resolveCategoryCover, record) : null,
      alt: `${department.name} collection at PRATIKSHYA FASHION`,
      count,
      countLabel: piecesLabel(count),
    };
  });

  return tiles.length ? tiles : null;
};

/* ------------------------------------------------------------------ */
/* 03 · Saree edits                                                    */
/* ------------------------------------------------------------------ */

export const buildSareeSection = (override = null) => {
  if (override) return override;
  const category = taxonomyRepository.findCategory("sarees");
  const authored = canonicalDepartments
    .flatMap((department) => department.categories)
    .find((entry) => entry.id === "sarees");
  if (!category && !authored) return null;

  const products = liveProducts();
  const record = category ?? authored;
  const subcategories = (category ? taxonomyRepository.activeSubcategories(category.id) : authored.subcategories) ?? [];

  const edits = subcategories.slice(0, 4).map((subcategory) => {
    const count = inBucket(products, "subcategory", subcategory.id).length;
    const subRecord = taxonomyRepository.findSubcategory(subcategory.id, category?.id ?? authored?.id) ?? subcategory;
    return {
      key: subcategory.id,
      label: subcategory.name,
      note: subcategory.description ?? "",
      to: subcategory.path ?? (category ? categoryHref({ slug: subcategory.slug }) : ""),
      count,
      countLabel: piecesLabel(count),
      image: subRecord ? safeCover(resolveCategoryCover, subRecord) : null,
    };
  }).filter((edit) => Boolean(edit.to));

  const sarees = inBucket(products, "category", "sarees");

  return {
    label: SECTION_COPY.saree.label,
    index: SECTION_COPY.saree.index,
    title: SECTION_COPY.saree.title,
    titleAccent: SECTION_COPY.saree.titleAccent,
    lead: SECTION_COPY.saree.lead,
    to: record?.path ?? "/women/sarees",
    word: "Saree",
    visual: safeCover(resolveCategoryCover, record),
    strip: edits.slice(0, 3).map((edit) => ({ key: edit.key, caption: edit.label, image: edit.image })),
    edits,
    products: sarees.slice(0, 4),
    railTitle: SECTION_COPY.saree.railTitle,
    railNote: SECTION_COPY.saree.railNote,
  };
};

/* ------------------------------------------------------------------ */
/* 04 · Bridal pair                                                    */
/* ------------------------------------------------------------------ */

const fromPrice = (products, categoryId) => {
  const list = inBucket(products, "category", categoryId).map((product) => Number(product?.price));
  const prices = list.filter((value) => Number.isFinite(value) && value > 0);
  return prices.length ? formatINR(Math.min(...prices)) : null;
};

export const buildBridalSection = (override = null) => {
  if (override) return override;
  const products = liveProducts();
  const bride = taxonomyRepository.findCategory("the-bride");
  const groom = taxonomyRepository.findCategory("groom");
  if (!bride && !groom) return null;

  return {
    label: SECTION_COPY.bridal.label,
    index: SECTION_COPY.bridal.index,
    title: SECTION_COPY.bridal.title,
    titleAccent: SECTION_COPY.bridal.titleAccent,
    intro: SECTION_COPY.bridal.intro,
    bride: {
      ...SECTION_COPY.bridal.bride,
      to: bride?.path ?? "/bridal/the-bride",
      image: bride ? safeCover(resolveCategoryCover, bride) : null,
      fromPrice: fromPrice(products, "the-bride"),
    },
    groom: {
      ...SECTION_COPY.bridal.groom,
      to: groom?.path ?? "/men/groom",
      image: groom ? safeCover(resolveCategoryCover, groom) : null,
      fromPrice: fromPrice(products, "groom"),
    },
    pair: {
      to: "/bridal",
      image: bride ? safeCover(resolveCategoryCover, bride) : null,
      caption: "The wedding pair",
    },
  };
};

/* ------------------------------------------------------------------ */
/* 05 · Finishing touches                                              */
/* ------------------------------------------------------------------ */

/**
 * Bangles and bridal jewellery, with the hover stage Project B's jewellery
 * theatre uses: the stage shows the editorial plate until a piece is in
 * focus, then that piece's own canonical photograph.
 */
export const buildFinishingSection = (override = null) => {
  if (override) return override;
  const category = taxonomyRepository.findCategory("finishing-touches");
  if (!category) return null;

  const products = liveProducts();
  const subcategories = taxonomyRepository.activeSubcategories(category.id) ?? [];
  const types = [
    { key: "all", label: "All", count: inBucket(products, "category", category.id).length },
    ...subcategories.map((subcategory) => ({
      key: subcategory.id,
      label: subcategory.name,
      count: inBucket(products, "subcategory", subcategory.id).length,
    })),
  ];

  return {
    label: SECTION_COPY.finishing.label,
    index: SECTION_COPY.finishing.index,
    title: SECTION_COPY.finishing.title,
    titleAccent: SECTION_COPY.finishing.titleAccent,
    lead: SECTION_COPY.finishing.lead,
    to: category.path,
    stage: safeCover(resolveCategoryCover, category),
    stageKicker: "Kundan · Polki · Temple",
    types,
    products: inBucket(products, "category", category.id),
  };
};

/* ------------------------------------------------------------------ */
/* 06 · Offer                                                          */
/* ------------------------------------------------------------------ */

/**
 * The storefront's live offer register (`offerRepository.listCustomerVisible`,
 * hydrated from the public GET /offers). The first currently-valid offer wins;
 * every figure shown — discount, code, expiry, scope — is a field of that
 * record. With no active offer the section renders nothing.
 */
export const buildOfferSection = (override = null) => {
  if (override) return override;

  let offers = [];
  try {
    offers = offerRepository.listCustomerVisible() ?? [];
  } catch {
    offers = [];
  }

  const offer = offers.find((candidate) => candidate?.code) ?? null;
  if (!offer) return null;

  const categoryRoute = (offer.eligibleCategoryIds ?? [])
    .map((id) => resolveCategoryRoute(id))
    .find((resolved) => resolved?.href);
  const collectionRoute = (offer.eligibleCollectionIds ?? [])
    .map((id) => `/collections/${id}`)
    .find(Boolean);

  const terms = [
    offer.minimumOrderValue > 0 ? `Minimum order ${formatINR(offer.minimumOrderValue)}` : null,
    describeEligibility(offer),
    "Code applied at checkout.",
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    code: offer.code,
    label: offer.name || "The House Offer",
    index: SECTION_COPY.offer.index,
    headline: offer.name || offer.code,
    copy: offer.description || "",
    discount: formatOfferDiscount(offer),
    expires: offer.expiresAt ? new Date(offer.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null,
    terms,
    cta: {
      label: "Shop the edit",
      to: categoryRoute?.href ?? collectionRoute ?? "/shop",
    },
    isSample: Boolean(offer.isSample),
    image: safeCover(resolveFestiveCampaignImage, null),
    imageAlt: "",
    caption: `${offer.name || offer.code} · The Festive Edit`,
  };
};

/* ------------------------------------------------------------------ */
/* 07 · Menswear                                                       */
/* ------------------------------------------------------------------ */

export const buildMensSection = (override = null) => {
  if (override) return override;
  const department = canonicalDepartments.find((entry) => entry.id === "men");
  if (!department) return null;

  const products = inBucket(liveProducts(), "department", "men");
  const types = department.categories
    .flatMap((category) => category.subcategories ?? [])
    .filter((subcategory) => subcategory.path);
  const coverCategory = taxonomyRepository.findCategory(department.categories[0]?.id ?? "ethnic-wear");
  const hero = products[0] ?? null;

  return {
    label: SECTION_COPY.men.label,
    index: SECTION_COPY.men.index,
    title: SECTION_COPY.men.title,
    titleAccent: SECTION_COPY.men.titleAccent,
    lead: SECTION_COPY.men.lead,
    to: department.path,
    types,
    image: coverCategory ? safeCover(resolveCategoryCover, coverCategory) : null,
    hero: hero ? { id: hero.id, name: hero.name, price: hero.price, to: `/product/${hero.id}` } : null,
    products: products.slice(0, 4),
  };
};

/* ------------------------------------------------------------------ */
/* 08 · Kids                                                           */
/* ------------------------------------------------------------------ */

export const buildKidsSection = (override = null) => {
  if (override) return override;
  const department = canonicalDepartments.find((entry) => entry.id === "kids");
  if (!department) return null;

  const products = inBucket(liveProducts(), "department", "kids");
  const chips = department.categories.map((category) => {
    const count = inBucket(products, "category", category.id).length;
    return { key: category.id, label: category.name, note: piecesLabel(count), to: category.path };
  });
  const coverRecords = department.categories.slice(0, 2).map((category) => {
    const record = taxonomyRepository.findCategory(category.id);
    return record ? safeCover(resolveCategoryCover, record) : null;
  });

  return {
    label: SECTION_COPY.kids.label,
    index: SECTION_COPY.kids.index,
    title: SECTION_COPY.kids.title,
    titleAccent: SECTION_COPY.kids.titleAccent,
    lead: SECTION_COPY.kids.lead,
    sticker: SECTION_COPY.kids.sticker,
    to: department.path,
    chips,
    main: coverRecords[0] ?? null,
    minis: department.categories.slice(0, 2).map((category, index) => ({
      key: category.id,
      label: category.name,
      to: category.path,
      image: coverRecords[index] ?? null,
    })),
    products: products.slice(0, 2),
  };
};

/* ------------------------------------------------------------------ */
/* 09 · Product rail                                                   */
/* ------------------------------------------------------------------ */

/**
 * The rail's ordering is the catalogue's OWN deterministic selection
 * (`selectNewArrivalProducts`: featured first, then recency, then real
 * photography). A verified sales ranking is not available from the current
 * backend, so the rail prints B's honest note rather than implying one.
 */
export const buildRailSection = ({ override = null, selectProducts = null } = {}) => {
  if (override) return override;

  const products = liveProducts();
  if (!products.length) return null;

  const ranked = selectProducts ? selectProducts(products, 8) : products.slice(0, 8);
  if (!ranked.length) return null;

  const present = canonicalDepartments
    .map((department) => department.id)
    .filter((id) => products.some((product) => String(product?.department) === id));

  return {
    label: SECTION_COPY.rail.label,
    index: SECTION_COPY.rail.index,
    title: SECTION_COPY.rail.title,
    note: SECTION_COPY.rail.note,
    to: "/shop",
    filters: [
      { key: "all", label: "All" },
      ...present.map((id) => ({
        key: id,
        label: canonicalDepartments.find((department) => department.id === id)?.name ?? id,
      })),
    ],
    products: ranked,
  };
};

/* ------------------------------------------------------------------ */
/* 10 · Collections lookbook                                           */
/* ------------------------------------------------------------------ */

export const buildLookbookSection = (override = null) => {
  if (override) return override;
  const collections = taxonomyRepository.activeCollections() ?? [];
  const fabric = collections.filter((collection) => collection.rule?.fabricIncludes);
  const picks = (fabric.length ? fabric : collections).slice(0, 4).map((collection) => ({
    key: collection.id,
    label: collection.name,
    note: collection.description ?? "",
    to: `/collections/${collection.slug ?? collection.id}`,
    image: safeCover(resolveCollectionCover, collection),
  }));
  if (!picks.length) return null;

  const products = liveProducts();
  const byMood = picks.map((pick) => ({
    ...pick,
    count: products.filter((product) => {
      try {
        return taxonomyRepository.isProductInCollection(product, pick.key);
      } catch {
        return false;
      }
    }).length,
    products: products
      .filter((product) => {
        try {
          return taxonomyRepository.isProductInCollection(product, pick.key);
        } catch {
          return false;
        }
      })
      .slice(0, 4),
  }));

  return {
    label: SECTION_COPY.lookbook.label,
    index: SECTION_COPY.lookbook.index,
    title: SECTION_COPY.lookbook.title,
    titleAccent: SECTION_COPY.lookbook.titleAccent,
    moods: byMood,
  };
};

export default {
  SECTION_COPY,
  buildCategoryTiles,
  buildSareeSection,
  buildBridalSection,
  buildFinishingSection,
  buildOfferSection,
  buildMensSection,
  buildKidsSection,
  buildRailSection,
  buildLookbookSection,
};
