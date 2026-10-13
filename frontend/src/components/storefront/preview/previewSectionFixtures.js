/**
 * PRATIKSHYA FASHION — PHASE 2B PREVIEW FIXTURES (development only).
 *
 * ⚠️  NOT PRODUCTION DATA. Nothing in this file is imported by the storefront,
 *     by `HomeSections`, or by any live route. It exists so the Phase 2B
 *     homepage content sections can be reviewed when no backend/database is
 *     reachable in the preview sandbox.
 *
 * What each fixture is, and where it comes from:
 *
 *   · SLIDES (Phase 1.5)      canonical hero content + home-page campaign copy.
 *   · ANNOUNCEMENTS (2A)      Project B's approved announcement-bar copy.
 *   · PLATES (2B)             REAL photography from this application's own
 *                             approved asset library, addressed by object key
 *                             through the canonical media seam
 *                             (`mediaObjectUrl`), or — for the two landscape
 *                             art-direction plates that only exist in the
 *                             home-page design — through the preview-only
 *                             `/__preview-assets/` namespace.
 *   · PRODUCTS (2B)           REAL product ids and REAL taxonomy labels taken
 *                             from those file paths (a photo lives at
 *                             `products/<dept>/<category>/<sub>/<ID>/…`), with
 *                             NO price and a visible `Sample` badge. A fixture
 *                             card is therefore legible, links to that product's
 *                             real route, and can never be mistaken for a live
 *                             catalogue record (there is no price to mistake).
 *   · OFFER (2B)              Project B's approved SAMPLE offer copy — labelled
 *                             "Sample offer" on the section itself.
 *   · SERVICE STRIP (2B)      Project B's approved service copy, supplied only
 *                             here because this application has no content
 *                             source for it (see `SectionServiceStrip`).
 *
 * The harness prints a "PREVIEW FIXTURE … NOT live backend data" badge whenever
 * any of these are on screen, and switching the harness to a live source
 * replaces them wholesale.
 */

import { mediaObjectUrl } from "../../../services/media/mediaPaths";
import { previewAssetUrl } from "./previewFixtures";

const plate = (key) => mediaObjectUrl(key);

/* ------------------------------------------------------------------ */
/* 02 · Category tiles                                                 */
/* ------------------------------------------------------------------ */

const FIXTURE_CATEGORY_TILES = [
  {
    key: "women",
    label: "Women",
    note: "Sarees, lehengas and everyday essentials selected for drape, detail and the occasion they will become part of.",
    to: "/women",
    image: { src: plate("products/women/sarees/banarasi/PF-W-SAR-BAN-0001/primary.avif") },
    alt: "Women's collection at PRATIKSHYA FASHION",
    count: 4,
    countLabel: "Sample tiles",
  },
  {
    key: "bridal",
    label: "Bridal",
    note: "Bridal sarees, wedding lehengas and ceremonial pieces composed for every part of the celebration.",
    to: "/bridal",
    image: { src: plate("products/bridal/celebrations/sangeet/PF-BR-SNG-0001/primary.avif") },
    alt: "Bridal collection at PRATIKSHYA FASHION",
    count: 4,
    countLabel: "Sample tiles",
  },
  {
    key: "men",
    label: "Men",
    note: "Kurta, kurta pajama, Nehru jackets and groom edits, tailored for the celebration.",
    to: "/men",
    image: { src: plate("products/men/ethnic-wear/kurta-pajama/PF-M-ETH-KPJ-0001/primary.avif") },
    alt: "Menswear at PRATIKSHYA FASHION",
    count: 4,
    countLabel: "Sample tiles",
  },
  {
    key: "kids",
    label: "Kids",
    note: "Festive and everyday pieces for the youngest guests, cut for comfort first.",
    to: "/kids",
    image: { src: plate("products/kids/boys/casual-sets/PF-K-BYS-CS-0001/primary.avif") },
    alt: "Kidswear at PRATIKSHYA FASHION",
    count: 4,
    countLabel: "Sample tiles",
  },
];

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

/** One fixture product, built from a real plate key + its canonical id. */
const sampleProduct = ({ key, name, department, category, subcategory, mediaKey }) => ({
  id: key,
  name: name ?? key,
  department,
  category,
  categoryLabel: name ?? key,
  subcategory,
  label: "Sample",
  price: null,
  image: { src: plate(mediaKey) },
});

const FIXTURE_PRODUCTS = {
  sarees: [
    sampleProduct({
      key: "PF-W-SAR-BAN-0001",
      name: "Banarasi Saree · sample",
      department: "women",
      category: "sarees",
      categoryLabel: "Sarees",
      subcategory: "banarasi",
      mediaKey: "products/women/sarees/banarasi/PF-W-SAR-BAN-0001/primary.avif",
    }),
    sampleProduct({
      key: "PF-W-SAR-COT-0001",
      name: "Cotton Saree · sample",
      department: "women",
      category: "sarees",
      categoryLabel: "Sarees",
      subcategory: "cotton",
      mediaKey: "products/women/sarees/cotton/PF-W-SAR-COT-0001/primary.avif",
    }),
    sampleProduct({
      key: "PF-W-LEH-PTY-0001",
      name: "Party Lehenga · sample",
      department: "women",
      category: "lehengas",
      categoryLabel: "Lehengas",
      subcategory: "party",
      mediaKey: "products/women/lehengas/party/PF-W-LEH-PTY-0001/01.webp",
    }),
    sampleProduct({
      key: "PF-W-ESS-KS-0002",
      name: "Kurta Set · sample",
      department: "women",
      category: "essentials",
      categoryLabel: "Essentials",
      subcategory: "kurtis-suits",
      mediaKey: "products/women/essentials/kurtis-suits/PF-W-ESS-KS-0002/01.webp",
    }),
  ],
  jewellery: [
    sampleProduct({
      key: "PF-BR-JWL-0001",
      name: "Bridal Jewellery · sample",
      department: "bridal",
      category: "finishing-touches",
      categoryLabel: "Finishing Touches",
      subcategory: "jewellery",
      mediaKey: "products/bridal/finishing-touches/jewellery/PF-BR-JWL-0001/primary.avif",
    }),
    sampleProduct({
      key: "PF-BR-JWL-EAR-0001",
      name: "Jhumkas · sample",
      department: "bridal",
      category: "finishing-touches",
      categoryLabel: "Finishing Touches",
      subcategory: "jewellery",
      mediaKey: "products/bridal/finishing-touches/jewellery/PF-BR-JWL-EAR-0001/primary.avif",
    }),
    sampleProduct({
      key: "PF-BR-BNG-0001",
      name: "Bridal Bangles · sample",
      department: "bridal",
      category: "finishing-touches",
      categoryLabel: "Finishing Touches",
      subcategory: "bangles",
      mediaKey: "products/bridal/finishing-touches/bangles/PF-BR-BNG-0001/primary.avif",
    }),
    sampleProduct({
      key: "PF-BR-BNG-KAD-0001",
      name: "Kada · sample",
      department: "bridal",
      category: "finishing-touches",
      categoryLabel: "Finishing Touches",
      subcategory: "bangles",
      mediaKey: "products/bridal/finishing-touches/bangles/PF-BR-BNG-KAD-0001/primary.avif",
    }),
  ],
  men: [
    sampleProduct({
      key: "PF-M-ETH-KPJ-0001",
      name: "Kurta Pajama · sample",
      department: "men",
      category: "ethnic-wear",
      categoryLabel: "Ethnic Wear",
      subcategory: "kurta-pajama",
      mediaKey: "products/men/ethnic-wear/kurta-pajama/PF-M-ETH-KPJ-0001/primary.avif",
    }),
    sampleProduct({
      key: "PF-M-ETH-KPJ-0003",
      name: "Kurta Pajama · sample",
      department: "men",
      category: "ethnic-wear",
      categoryLabel: "Ethnic Wear",
      subcategory: "kurta-pajama",
      mediaKey: "products/men/ethnic-wear/kurta-pajama/PF-M-ETH-KPJ-0003/primary.avif",
    }),
    sampleProduct({
      key: "PF-M-GRM-GEN-0001",
      name: "Groom Ensemble · sample",
      department: "men",
      category: "groom",
      categoryLabel: "Groom",
      subcategory: "groom-collection",
      mediaKey: "products/men/groom/groom-collection/PF-M-GRM-GEN-0001/primary.avif",
    }),
    sampleProduct({
      key: "PF-M-GRM-GEN-0003",
      name: "Groom Ensemble · sample",
      department: "men",
      category: "groom",
      categoryLabel: "Groom",
      subcategory: "groom-collection",
      mediaKey: "products/men/groom/groom-collection/PF-M-GRM-GEN-0003/primary.avif",
    }),
  ],
  kids: [
    sampleProduct({
      key: "PF-K-BYS-CS-0001",
      name: "Boys' Casual Set · sample",
      department: "kids",
      category: "boys",
      categoryLabel: "Boys",
      subcategory: "casual-sets",
      mediaKey: "products/kids/boys/casual-sets/PF-K-BYS-CS-0001/primary.avif",
    }),
    sampleProduct({
      key: "PF-K-BYS-TSH-0001",
      name: "T-Shirt & Shorts · sample",
      department: "kids",
      category: "boys",
      categoryLabel: "Boys",
      subcategory: "t-shirt-shorts",
      mediaKey: "products/kids/boys/t-shirt-shorts/PF-K-BYS-TSH-0001/primary.avif",
    }),
  ],
};

export const PREVIEW_FIXTURE_PRODUCTS = FIXTURE_PRODUCTS;

/* ------------------------------------------------------------------ */
/* The section payload the harness hands to `HomeSections`              */
/* ------------------------------------------------------------------ */

export const PREVIEW_FIXTURE_SECTIONS = {
  /* 02 — the four canonical departments, real plates, labels and routes. */
  categories: FIXTURE_CATEGORY_TILES,

  /* 03 — the saree edits: real subcategory routes, real plates. */
  saree: {
    label: "The Saree Edits",
    index: "03",
    title: "Six yards,",
    titleAccent: "unhurried.",
    lead: "Silks, cotton handlooms and modern pre-draped silhouettes, each listed with the weave and the region the house sourced it from.",
    to: "/women/sarees",
    word: "Saree",
    visual: { src: plate("products/women/sarees/banarasi/PF-W-SAR-BAN-0002/primary.avif") },
    strip: [
      {
        key: "banarasi",
        caption: "Banarasi Sarees",
        image: { src: plate("products/women/sarees/banarasi/PF-W-SAR-BAN-0003/primary.avif") },
      },
      {
        key: "cotton",
        caption: "Cotton Sarees",
        image: { src: plate("products/women/sarees/cotton/PF-W-SAR-COT-0002/primary.avif") },
      },
      {
        key: "silk",
        caption: "Silk Sarees",
        image: { src: plate("products/women/sarees/silk/PF-W-SAR-SIL-0001/primary.avif") },
      },
    ],
    edits: [
      { key: "banarasi", label: "Banarasi Sarees", note: "Sample", to: "/women/sarees/banarasi", count: 3, countLabel: "Sample · 3 pieces" },
      { key: "cotton", label: "Cotton Sarees", note: "Sample", to: "/women/sarees/cotton", count: 2, countLabel: "Sample · 2 pieces" },
      { key: "silk", label: "Silk Sarees", note: "Sample", to: "/women/sarees/silk", count: 3, countLabel: "Sample · 3 pieces" },
    ],
    products: FIXTURE_PRODUCTS.sarees,
    railTitle: "Complete the drape",
    railNote: "The silks of the edit, and the pieces we would wear with them.",
  },

  /* 04 — the bridal pair: the-bride + groom. */
  bridal: {
    label: "The Bridal Edit · Bride & Groom",
    index: "04",
    title: "Composed",
    titleAccent: "as a pair.",
    intro: "Worked by hand over weeks, tone on tone — styled together, sold separately.",
    bride: {
      kicker: "I · The Bride",
      title: "For the ceremony",
      accent: "itself.",
      to: "/bridal/the-bride",
      image: { src: plate("products/women/lehengas/bridal/PF-W-LEH-BRI-0002/primary.avif") },
      fromPrice: null,
    },
    groom: {
      kicker: "II · The Groom",
      title: "Ivory,",
      accent: "tone on tone.",
      to: "/men/groom",
      image: { src: plate("products/men/groom/groom-collection/PF-M-GRM-GEN-0002/primary.avif") },
      fromPrice: null,
    },
    pair: {
      to: "/bridal",
      image: { src: plate("products/bridal/celebrations/sangeet/PF-BR-SNG-0002/primary.avif") },
      caption: "The wedding pair",
    },
  },

  /* 05 — finishing touches: real subcategories as the filter row. */
  finishing: {
    label: "Finishing Touches",
    index: "05",
    title: "Heirlooms,",
    titleAccent: "worn daily.",
    lead: "Bangles and bridal jewellery, handset and finished in the house workshop.",
    to: "/bridal/finishing-touches",
    stage: { src: plate("products/bridal/finishing-touches/jewellery/PF-BR-JWL-0003/primary.avif") },
    stageKicker: "Kundan · Polki · Temple",
    types: [
      { key: "all", label: "All", count: 4 },
      { key: "jewellery", label: "Bridal Jewellery", count: 2 },
      { key: "bangles", label: "Bridal Bangles", count: 2 },
    ],
    products: FIXTURE_PRODUCTS.jewellery,
  },

  /* 06 — offer: Project B's approved SAMPLE copy, clearly marked on-screen. */
  offer: {
    code: "SAMPLE20",
    label: "The Festive Edit",
    index: "06",
    headline: "Twenty percent, on the festive edit.",
    copy: "Placeholder campaign copy for design review only — not a live promotion.",
    discount: "20% off",
    expires: null,
    terms: "Sample offer for design review · no code is honoured at checkout.",
    cta: { label: "Shop the edit", to: "/bridal" },
    isSample: true,
    image: { src: previewAssetUrl("hero-jewellery-tall.webp") },
    imageAlt: "",
    caption: "The Festive Edit · sample",
  },

  /* 07 — menswear. */
  men: {
    label: "Menswear",
    index: "07",
    title: "Tailored for ceremony,",
    titleAccent: "and Tuesdays.",
    lead: "Kurtas, kurta pajamas and groom edits, cut with a modern shoulder.",
    to: "/men",
    types: [
      { id: "kurta-pajama", name: "Kurta Pajama", path: "/men/ethnic-wear/kurta-pajama" },
      { id: "nehru-jackets", name: "Nehru Jackets", path: "/men/ethnic-wear/nehru-jackets" },
      { id: "groom-collection", name: "Groom", path: "/men/groom/groom-collection" },
    ],
    image: { src: plate("products/men/ethnic-wear/kurta-pajama/PF-M-ETH-KPJ-0002/primary.avif") },
    hero: { id: "PF-M-ETH-KPJ-0001", name: "Kurta Pajama · sample", price: null, to: "/product/PF-M-ETH-KPJ-0001" },
    products: FIXTURE_PRODUCTS.men,
  },

  /* 08 — kidswear. */
  kids: {
    label: "Kidswear",
    index: "08",
    title: "Little",
    titleAccent: "celebrations.",
    lead: "Soft linings, easy buttons and enough swish for the dance floor.",
    sticker: "made\nfor\ntwirling",
    to: "/kids",
    chips: [
      { key: "boys", label: "Boys", note: "2 categories", to: "/kids/boys" },
      { key: "girls", label: "Girls", note: "2 categories", to: "/kids/girls" },
    ],
    main: { src: plate("products/kids/boys/casual-sets/PF-K-BYS-CS-0002/primary.avif") },
    minis: [
      { key: "girls", label: "Girls", to: "/kids/girls", image: { src: plate("products/kids/boys/t-shirt-shorts/PF-K-BYS-TSH-0002/primary.avif") } },
      { key: "boys", label: "Boys", to: "/kids/boys", image: { src: plate("products/kids/boys/casual-sets/PF-K-BYS-CS-0001/primary.avif") } },
    ],
    products: FIXTURE_PRODUCTS.kids,
  },

  /* 09 — the rail. */
  rail: {
    label: "Most Loved",
    index: "09",
    title: "Bestsellers",
    note: "Ordered by the catalogue's own featured and newest signals — the backend does not yet expose a verified sales ranking.",
    to: "/shop",
    filters: [
      { key: "all", label: "All" },
      { key: "women", label: "Women" },
      { key: "bridal", label: "Bridal" },
      { key: "men", label: "Men" },
      { key: "kids", label: "Kids" },
    ],
    products: [
      ...FIXTURE_PRODUCTS.sarees,
      ...FIXTURE_PRODUCTS.jewellery,
      ...FIXTURE_PRODUCTS.men,
      ...FIXTURE_PRODUCTS.kids,
    ],
  },

  /* 10 — the collection lookbook (real fabric collections). */
  lookbook: {
    label: "Fabric Stories",
    index: "10",
    title: "The house",
    titleAccent: "weaves.",
    moods: [
      {
        key: "silk",
        label: "Silk",
        note: "Silk",
        to: "/collections/silk",
        image: { src: plate("collections/fabrics/silk/PF-COL-FAB-SIL-0001/primary.avif") },
        count: 4,
        products: [],
      },
      {
        key: "cotton",
        label: "Cotton",
        note: "Cotton",
        to: "/collections/cotton",
        image: { src: plate("collections/fabrics/cotton/PF-COL-FAB-COT-0001/primary.avif") },
        count: 2,
        products: [],
      },
      {
        key: "linen",
        label: "Linen",
        note: "Linen",
        to: "/collections/linen",
        image: { src: plate("collections/fabrics/linen/PF-COL-FAB-LIN-0001/primary.avif") },
        count: 2,
        products: [],
      },
      {
        key: "chiffon",
        label: "Chiffon",
        note: "Chiffon",
        to: "/collections/chiffon",
        image: { src: plate("collections/fabrics/chiffon/PF-COL-FAB-CHF-0001/primary.avif") },
        count: 1,
        products: [],
      },
    ],
  },

  /* 12 — the service strip (no production content source exists). */
  service: [
    { key: "delivery", icon: "truck", title: "Delivery across India", text: "Timelines confirmed at checkout", enabled: true },
    { key: "assistance", icon: "help", title: "Styling assistance", text: "By appointment with the house", enabled: true },
    { key: "secure", icon: "lock", title: "Secure checkout", text: "Validated on the server", enabled: true },
    { key: "returns", icon: "returns", title: "Exchange policy", text: "Not published yet", enabled: true },
  ],
};

export default PREVIEW_FIXTURE_SECTIONS;
