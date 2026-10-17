// Central image registry for the prototype.
// All photography is AI-generated sample art direction stored in /public/images.
// Swap any path here to replace imagery across the entire site.
const base = '/design/';
const img = (name) => `${base}${name}.webp`;

export const images = {
  heroSaree: img('hero-saree'),
  heroBridal: img('hero-bridal'),
  heroFestive: img('hero-festive'),
  heroJewellery: img('hero-jewellery'),
  heroJewelleryTall: img('hero-jewellery-tall'), // portrait art-direction of the same set-up for narrow frames
  heroFamily: img('hero-family'),

  // Dedicated campaign photography (added in the refinement pass)
  promoFestive: img('promo-festive'),

  catWomen: img('cat-women'),
  catMen: img('cat-men'),
  catKids: img('cat-kids'),

  sareeEditorial: img('saree-editorial'),
  bride: img('bride'),
  groom: img('groom'),

  sareeIvoryStudio: img('p-saree-ivory-studio'),
  sareeIvoryDetail: img('p-saree-ivory-detail'),
  sareePallu: img('p-saree-pallu'),
  anarkaliDetail: img('p-anarkali-detail'),
  kurtaSet: img('p-kurta-set'),
  kurtaSetStudio: img('p-kurta-set-studio'),
  lehengaDetail: img('p-lehenga-detail'),
  menKurta: img('p-men-kurta'),
  linenKurta: img('p-linen-kurta'),
  groomDetail: img('p-groom-detail'),
  mala: img('p-mala-studio'),
  malaWorn: img('p-mala'),
  // Dedicated kidswear product shots (the crops above stay in the Kids editorial section)
  kidsGirlStudio: img('p-kids-girl-studio'),
  kidsGirlFlat: img('p-kids-girl-flat'),
  kidsBoyStudio: img('p-kids-boy-studio'),
  kidsBoyForm: img('p-kids-boy-form'),
  // Jewellery: dedicated studio shots are primary; the earlier on-model crops are kept as secondary views.
  necklace: img('p-necklace-studio'),
  tikka: img('p-tikka-studio'),
  jhumka: img('p-jhumka-studio'),
  bangles: img('p-bangles-studio'),
  ring: img('p-ring-studio'),
  necklaceWorn: img('p-necklace'),
  tikkaWorn: img('p-tikka'),
  jhumkaWorn: img('p-jhumka'),
  banglesWorn: img('p-bangles'),
  // Essentials: dedicated product shots are primary; the earlier styled-flat-lay crops remain as secondary views.
  potli: img('p-potli-studio'),
  juttis: img('p-juttis-studio'),
  dupatta: img('p-dupatta-studio'),
  mirror: img('p-mirror-studio'),
  sunglasses: img('p-sunglasses-studio'),
  potliStyled: img('p-potli'),
  juttisStyled: img('p-juttis'),
  dupattaStyled: img('p-dupatta'),
  mirrorStyled: img('p-mirror'),
};
