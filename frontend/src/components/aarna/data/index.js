// Content access layer. Components import from here; swap the mock sources
// for CMS/back-end data without touching visual components.
export { site, announcements } from '../mock/data/site.js';
export {
  heroConfig, heroSlides, categories, sareeCollections, sareeLookbook, kurtiCollections, jewelleryTypes, trustItems, popularSearches,
} from '../mock/data/content.js';
export { megaMenus, footerGroups } from '../mock/data/navigation.js';
export { promotions, getActivePromotion, findPromotionByCode } from '../mock/data/promotions.js';
export { infoPages } from '../mock/data/pages.js';
export { images } from '../mock/assets/images.js';
