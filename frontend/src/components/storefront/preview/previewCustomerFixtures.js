/**
 * PRATIKSHYA FASHION — PHASE 2D PREVIEW FIXTURES (development only).
 *
 * ⚠️  NOT PRODUCTION DATA, and not a second catalogue. Nothing in this file is
 *     imported by the ported storefront, by `CustomerStorefront`, or by any live
 *     route: the ONLY importer is `CustomerPreview.jsx`, which is itself gated on
 *     `import.meta.env.DEV` and reached exclusively through the development
 *     harness document (`preview.html`, `?view=customer`).
 *
 * What is here, and why:
 *
 *   · PRODUCTS — the APPROVED DESIGN's own sample catalogue, copied verbatim
 *     from `home-page/src/mock/data/products.js` (only its image import is
 *     re-pointed at the port's plate registry). It exists so the ported
 *     homepage can be compared with the design section by section — rails,
 *     cards, prices, badges, option pickers — in a sandbox where no backend or
 *     database answers. The live storefront never sees it: there the catalogue
 *     boundary reads the backend catalogue only, and an empty catalogue
 *     renders empty rails.
 *
 *   · NEWSLETTER — the design's own simulated subscription service, verbatim.
 *     The port has no subscription capability (see
 *     `customer/services/newsletter.js`), so in production the field and button
 *     render disabled with an honest note; here the design's real
 *     idle/loading/success/error behaviour can be exercised.
 *
 *   · PROMOTION — the design's own SAMPLE offer (`isSample: true`, which the
 *     design's band labels "Sample offer" on screen). Production reads the
 *     application's offer register instead.
 */

/* ------------------------------------------------------------------ */
/* The design's sample catalogue (verbatim)                            */
/* ------------------------------------------------------------------ */

import { images as I } from '../../customer/mock/assets/images.js';

/*
 * SAMPLE CATALOGUE — prototype data only.
 * Prices, stock, fabrics and "featured" flags are illustrative. They are not
 * verified inventory, sales rankings or reviews. Replace with backend data.
 *
 * department: women | men | kids | jewellery | essentials
 * type:       sarees | kurtis | bridal | sherwanis | bandhgalas | kurtas | accessories
 *             | girls | boys | necklaces | maang-tikka | jhumkas | bangles | rings
 *             | bags | footwear | dupattas | eyewear | decor
 */

const SIZES_W = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SIZES_M = ['38', '40', '42', '44', '46'];
const SIZES_K = ['2–3Y', '4–5Y', '6–7Y', '8–9Y', '10–11Y'];

const opt = (name, values, soldOut = []) => ({
  name,
  values: values.map((v) => ({ value: v, available: !soldOut.includes(v) })),
});

export const CUSTOMER_PREVIEW_PIECES = [
  // ── Sarees ────────────────────────────────────────────────
  {
    id: 'p01', slug: 'ivory-banarasi-buti-saree',
    name: 'Ivory Banarasi Buti Saree',
    department: 'women', type: 'sarees',
    collections: ['silk-classics', 'festive'], occasions: ['festive', 'wedding-guest'],
    price: 18900, compareAt: null,
    images: [I.sareeIvoryStudio, I.sareeIvoryDetail],
    fabric: 'Pure katan silk, antique zari', craft: 'Handwoven, Varanasi',
    description: 'A soft ivory ground scattered with antique-gold buti and a pallu that moves like light. Woven on a traditional pit loom with an unstitched blouse piece.',
    options: [opt('Blouse', ['Unstitched piece', 'Stitched · S', 'Stitched · M', 'Stitched · L'])],
    featured: true, badge: 'Handwoven',
  },
  {
    id: 'p02', slug: 'terracotta-kanjeevaram-silk-saree',
    name: 'Terracotta Kanjeevaram Silk Saree',
    department: 'women', type: 'sarees',
    collections: ['silk-classics', 'festive-sarees', 'festive'], occasions: ['festive', 'wedding'],
    price: 24500, compareAt: 27200,
    images: [I.sareeEditorial, I.sareePallu],
    fabric: 'Mulberry silk, gold temple border', craft: 'Korvai weave, Kanchipuram',
    description: 'A warm terracotta body with a broad temple border and a richly woven pallu. Made to be draped for celebrations and inherited after them.',
    options: [opt('Blouse', ['Unstitched piece', 'Stitched · S', 'Stitched · M', 'Stitched · L'], ['Stitched · S'])],
    featured: true, badge: 'Festive Edit',
  },

  // ── Women: kurtis / sets / bridal ────────────────────────
  {
    id: 'p03', slug: 'dusty-rose-chanderi-anarkali',
    name: 'Dusty Rose Chanderi Anarkali',
    department: 'women', type: 'kurtis',
    collections: ['anarkalis', 'festive-kurtis', 'festive'], occasions: ['festive'],
    price: 7450, compareAt: 8900,
    images: [I.catWomen, I.anarkaliDetail],
    fabric: 'Chanderi silk-cotton, zari border', craft: 'Hand-finished gota detailing',
    description: 'A floor-grazing anarkali in dusty rose with a fine zari hem, paired with a sheer dupatta. Light enough for long festive evenings.',
    options: [opt('Size', SIZES_W, ['XXL'])],
    featured: true,
  },
  {
    id: 'p04', slug: 'rust-silk-coord-kurta-set',
    name: 'Rust Silk Co-ord Kurta Set',
    department: 'women', type: 'kurtis',
    collections: ['kurta-sets', 'festive-kurtis', 'festive'], occasions: ['festive'],
    price: 9800, compareAt: null,
    images: [I.kurtaSetStudio, I.kurtaSet],
    fabric: 'Silk blend with organza dupatta', craft: 'Piped neckline, hand-rolled hems',
    description: 'A relaxed straight kurta, slim pants and an organza dupatta in a single copper-rust tone. Quietly modern festive dressing.',
    options: [opt('Size', SIZES_W)],
    featured: true, badge: 'New',
  },
  {
    id: 'p05', slug: 'crimson-zardozi-bridal-lehenga',
    name: 'Crimson Zardozi Bridal Lehenga',
    department: 'women', type: 'bridal',
    collections: ['bridal', 'the-bride'], occasions: ['wedding'],
    price: 185000, compareAt: null,
    images: [I.bride, I.lehengaDetail],
    fabric: 'Raw silk, net dupatta', craft: 'Hand zardozi & dabka embroidery',
    description: 'Crimson raw silk worked densely in zardozi and dabka, with a scalloped net dupatta. Customisation is discussed after order placement.',
    options: [opt('Size', ['S', 'M', 'L', 'Made to measure'])],
    featured: true, badge: 'Bridal',
  },

  // ── Men ──────────────────────────────────────────────────
  {
    id: 'p06', slug: 'champagne-embroidered-sherwani',
    name: 'Champagne Embroidered Sherwani',
    department: 'men', type: 'sherwanis',
    collections: ['bridal', 'the-groom'], occasions: ['wedding'],
    price: 68000, compareAt: null,
    images: [I.groom, I.groomDetail],
    fabric: 'Silk brocade, satin lining', craft: 'Resham & zari hand embroidery',
    description: 'An ivory-champagne sherwani embroidered tone-on-tone, with a stole in soft blush. Cut long and structured through the shoulder.',
    options: [opt('Size', SIZES_M, ['46'])],
    featured: true, badge: 'Groom',
  },
  {
    id: 'p07', slug: 'cocoa-bandhgala-ensemble',
    name: 'Cocoa Bandhgala Ensemble',
    department: 'men', type: 'bandhgalas',
    collections: ['occasion-wear', 'festive'], occasions: ['festive', 'wedding-guest'],
    price: 21500, compareAt: 24000,
    images: [I.catMen, I.menKurta],
    fabric: 'Textured wool-silk jacket, linen kurta', craft: 'Hand-finished buttonholes',
    description: 'A cocoa bandhgala in a textured weave, layered over an ivory linen kurta and slim trousers. Ceremony-ready, endlessly re-wearable.',
    options: [opt('Size', SIZES_M)],
    featured: true,
  },
  {
    id: 'p08', slug: 'ivory-linen-kurta',
    name: 'Ivory Linen Kurta',
    department: 'men', type: 'kurtas',
    collections: ['everyday'], occasions: ['everyday'],
    price: 4900, compareAt: null,
    images: [I.linenKurta],
    fabric: '100% linen', craft: 'Garment washed for softness',
    description: 'A clean, straight-cut linen kurta with a mandarin collar. Wear it under a bandhgala or on its own through the summer.',
    options: [opt('Size', ['S', 'M', 'L', 'XL', 'XXL'])],
    featured: false,
  },
  {
    id: 'p09', slug: 'pearl-layered-groom-mala',
    name: 'Pearl Layered Groom Mala',
    department: 'men', type: 'accessories',
    collections: ['bridal', 'the-groom'], occasions: ['wedding'],
    price: 14800, compareAt: null,
    images: [I.mala, I.malaWorn],
    fabric: 'Shell pearls, gold-plated brass', craft: 'Hand-strung, five layers',
    description: 'Five strands of lustrous shell pearl with engraved gold-tone spacers. The finishing note for a sherwani.',
    options: null,
    featured: false,
  },

  // ── Kids ─────────────────────────────────────────────────
  {
    id: 'p10', slug: 'peach-silk-lehenga-choli-girls',
    name: 'Peach Silk Lehenga Choli',
    department: 'kids', type: 'girls',
    collections: ['kids-festive'], occasions: ['festive'],
    price: 5600, compareAt: 6400,
    images: [I.kidsGirlStudio, I.kidsGirlFlat],
    fabric: 'Art silk, cotton lining', craft: 'Gota patti embroidery',
    description: 'A twirl-friendly peach lehenga with soft cotton lining and a light dupatta — festive, comfortable, made for dancing.',
    options: [opt('Age', SIZES_K, ['10–11Y'])],
    featured: true, badge: 'Girls',
  },
  {
    id: 'p11', slug: 'mustard-bandi-kurta-set-boys',
    name: 'Mustard Bandi Kurta Set',
    department: 'kids', type: 'boys',
    collections: ['kids-festive'], occasions: ['festive'],
    price: 4200, compareAt: null,
    images: [I.kidsBoyStudio, I.kidsBoyForm],
    fabric: 'Cotton silk bandi, cotton kurta', craft: 'Self-texture jacquard',
    description: 'A cream cotton kurta and churidar with a mustard bandi jacket. Easy buttons for little hands.',
    options: [opt('Age', SIZES_K)],
    featured: true, badge: 'Boys',
  },

  // ── Jewellery ────────────────────────────────────────────
  {
    id: 'p12', slug: 'kundan-polki-bridal-necklace',
    name: 'Kundan Polki Bridal Necklace',
    department: 'jewellery', type: 'necklaces',
    collections: ['bridal', 'jewellery'], occasions: ['wedding'],
    price: 42000, compareAt: null,
    images: [I.necklace, I.necklaceWorn],
    fabric: 'Gold-plated silver, kundan, ruby-tone drops', craft: 'Handset kundan',
    description: 'A layered kundan and polki-style collar with ruby-tone and emerald-tone drops. Includes matching earrings.',
    options: [opt('Finish', ['Antique gold', 'Bright gold'])],
    featured: true, badge: 'Heirloom',
  },
  {
    id: 'p13', slug: 'temple-maang-tikka',
    name: 'Temple Pearl Maang Tikka',
    department: 'jewellery', type: 'maang-tikka',
    collections: ['bridal', 'jewellery'], occasions: ['wedding', 'festive'],
    price: 6800, compareAt: null,
    images: [I.tikka, I.tikkaWorn],
    fabric: 'Gold-plated brass, freshwater pearls', craft: 'Hand-strung pearl fringe',
    description: 'A domed temple tikka with a delicate pearl fringe and adjustable chain.',
    options: null,
    featured: false,
  },
  {
    id: 'p14', slug: 'antique-gold-temple-jhumkas',
    name: 'Antique Gold Temple Jhumkas',
    department: 'jewellery', type: 'jhumkas',
    collections: ['jewellery', 'festive'], occasions: ['festive', 'everyday'],
    price: 5200, compareAt: 5900,
    images: [I.jhumka, I.jhumkaWorn],
    fabric: 'Gold-plated silver, kundan', craft: 'Filigree bell, pearl drops',
    description: 'Bell-shaped jhumkas in antique gold with kundan studs — light enough to wear all evening.',
    options: [opt('Finish', ['Antique gold', 'Bright gold'])],
    featured: true,
  },
  {
    id: 'p15', slug: 'engraved-kundan-bangle-stack',
    name: 'Engraved Kundan Bangle Stack',
    department: 'jewellery', type: 'bangles',
    collections: ['jewellery', 'bridal'], occasions: ['wedding', 'festive'],
    price: 11200, compareAt: null,
    images: [I.bangles, I.banglesWorn],
    fabric: 'Gold-plated brass, kundan', craft: 'Hand-engraved, set of four',
    description: 'A stack of four engraved bangles with kundan accents, designed to be worn together or split across wrists.',
    options: [opt('Size', ['2.4', '2.6', '2.8'], ['2.8'])],
    featured: false,
  },
  {
    id: 'p16', slug: 'polki-cocktail-ring',
    name: 'Polki Cocktail Ring',
    department: 'jewellery', type: 'rings',
    collections: ['jewellery'], occasions: ['festive', 'wedding'],
    price: 8900, compareAt: null,
    images: [I.ring, I.bangles],
    fabric: 'Gold-plated silver, polki-style stones', craft: 'Handset, adjustable shank',
    description: 'A cluster cocktail ring with polki-style stones and an adjustable shank.',
    options: [opt('Ring size', ['10', '12', '14', '16'])],
    featured: false,
  },

  // ── Essentials ───────────────────────────────────────────
  {
    id: 'p17', slug: 'tan-leather-embroidered-potli',
    name: 'Tan Leather Embroidered Potli',
    department: 'essentials', type: 'bags',
    collections: ['essentials', 'festive'], occasions: ['festive', 'wedding-guest'],
    price: 3400, compareAt: null,
    images: [I.potli, I.potliStyled],
    fabric: 'Vegetable-tanned leather', craft: 'Hand beadwork, silk tassels',
    description: 'A soft tan potli with tonal beadwork and silk tassels — fits a phone, a lipstick and the night.',
    options: null,
    featured: true,
  },
  {
    id: 'p18', slug: 'ivory-zari-mojari-juttis',
    name: 'Ivory Zari Mojari Juttis',
    department: 'essentials', type: 'footwear',
    collections: ['essentials', 'festive'], occasions: ['festive', 'wedding'],
    price: 2900, compareAt: 3400,
    images: [I.juttis, I.juttisStyled],
    fabric: 'Leather sole, silk upper', craft: 'Hand zari embroidery',
    description: 'Cushioned ivory juttis embroidered in soft gold zari. A pair for the whole wedding weekend.',
    options: [opt('UK size', ['3', '4', '5', '6', '7', '8'], ['8'])],
    featured: false,
  },
  {
    id: 'p19', slug: 'blush-handwoven-cotton-dupatta',
    name: 'Blush Handwoven Cotton Dupatta',
    department: 'essentials', type: 'dupattas',
    collections: ['essentials', 'everyday'], occasions: ['everyday'],
    price: 2450, compareAt: null,
    images: [I.dupatta, I.dupattaStyled],
    fabric: 'Handloom cotton, zari stripe', craft: 'Handwoven',
    description: 'A breathable blush dupatta with a fine zari stripe. Pair it with any kurta for instant polish.',
    options: null,
    featured: false,
  },
  {
    id: 'p20', slug: 'carved-brass-hand-mirror',
    name: 'Carved Brass Hand Mirror',
    department: 'essentials', type: 'decor',
    collections: ['essentials'], occasions: ['everyday'],
    price: 1950, compareAt: null,
    images: [I.mirror, I.mirrorStyled],
    fabric: 'Cast brass', craft: 'Hand-carved frame',
    description: 'A tabletop mirror in warm cast brass with a hand-carved frame — for the dressing table and the last look.',
    options: null,
    featured: false,
  },
  {
    id: 'p21', slug: 'tortoiseshell-round-sunglasses',
    name: 'Tortoiseshell Round Sunglasses',
    department: 'essentials', type: 'eyewear',
    collections: ['essentials', 'everyday'], occasions: ['everyday'],
    price: 3200, compareAt: null,
    images: [I.sunglasses],
    fabric: 'Acetate frame, UV-protective lenses', craft: 'Hand-polished',
    description: 'Round acetate frames in warm tortoiseshell with brown gradient lenses.',
    options: null,
    featured: false,
  },
];

/* ------------------------------------------------------------------ */
/* The design's simulated subscription (verbatim)                      */
/* ------------------------------------------------------------------ */

const NEWSLETTER_KEY = 'storefront:newsletter';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The design's own `subscribe()` — latency, validation, success and error. */
export const PREVIEW_CUSTOMER_NEWSLETTER = async (email) => {
  const value = String(email || '').trim().toLowerCase();
  await new Promise((r) => setTimeout(r, 900));
  if (!EMAIL_RE.test(value)) throw new Error('Please enter a valid email address.');
  const stored = JSON.parse(window.sessionStorage.getItem(NEWSLETTER_KEY) || '[]');
  const list = Array.isArray(stored) ? stored : [];
  if (list.includes(value)) throw new Error('This email is already on the list.');
  window.sessionStorage.setItem(NEWSLETTER_KEY, JSON.stringify([...list, value]));
  return { ok: true, email: value };
};

/* ------------------------------------------------------------------ */
/* The design's sample offer (verbatim, still labelled a sample)       */
/* ------------------------------------------------------------------ */

export const PREVIEW_CUSTOMER_PROMOTION = {
  id: 'festive-preview',
  active: true,
  isSample: true,
  label: 'Festive Preview',
    headline: ['The Festive Edit,', 'fifteen percent lighter.'],
    copy: 'Silk co-ords, anarkalis, potlis and temple jewellery from the Festive Edit — with a little something taken off.',
    discountPercent: 15,
    discountLabel: '15% OFF',
    scopeLabel: 'Festive Edit',
    code: 'UTSAV15',
    eligibleCollection: 'festive',
    endsAt: '2026-11-15T23:59:00+05:30',
    terms: 'Applies to items tagged Festive Edit. One code per order.',
    cta: { label: 'Shop the Festive Edit', to: '/shop/festive' },
    image: I.promoFestive,
    imageAlt: 'A woman in a rust silk anarkali holding a lit brass diya beside a carved arch',
  focal: '50% 30%',
};
