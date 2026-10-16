// Design content access layer: shared site/navigation copy and fallback editorial
// content. HomepageSection supplies authored /home homepageContent when configured;
// products and promotions use their live backend boundary modules.
export { site, announcements } from '../mock/data/site.js';
export {
  heroConfig, heroSlides, categories, sareeCollections, sareeLookbook, kurtiCollections, jewelleryTypes, trustItems, popularSearches,
} from '../mock/data/content.js';
export { megaMenus, footerGroups } from '../mock/data/navigation.js';
export { promotions, getActivePromotion, findPromotionByCode } from '../mock/data/promotions.js';
export { infoPages } from '../mock/data/pages.js';
export { images } from '../mock/assets/images.js';
