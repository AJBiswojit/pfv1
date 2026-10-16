/**
 * PRATIKSHYA FASHION — PHASE 2D · the path boundary.
 *
 * The design owns its own URL space: `/shop/sarees`, `/pages/our-story`,
 * `/track-order`. This application owns a different one — its canonical
 * taxonomy paths (`/women/sarees/silk`), its collections (`/collections/…`), its
 * customer routes (`/account/orders`). Rather than rewrite the design's
 * destinations at every call site, the port keeps them exactly as the design
 * wrote them and translates them here, at the one place every ported link passes
 * through (`router/index.jsx`).
 *
 * Resolution order for a design path, and nothing else is guessed:
 *
 *   1. a path this application registers, kept as it is;
 *   2. `/shop/<key>` → the LIVE taxonomy: a category or collection whose slug
 *      is that key (`resolveCategoryRoute` / `resolveCollectionRoute`, the same
 *      resolvers Phase 2B's sections ask) — so a managed collection named
 *      `festive` wins over any table in this file;
 *   3. `/shop/<key>` → the documented alias table below, which maps the
 *      design's own vocabulary onto this catalogue's canonical paths;
 *   4. `/shop/<key>` → the shop listing. An unknown key is a real page, never a
 *      404 and never a guess;
 *   5. `/product/<slug>` → `/product/<id>`, resolved from the live catalogue
 *      (the application's product route is keyed by id);
 *   6. `/pages/<slug>` → the matching customer-care route this application
 *      registers;
 *   7. anything else → the customer root.
 */

import { routeManifest } from '../../../config/navigationConfig.js';
import {
  resolveCategoryRoute,
  resolveCollectionRoute,
} from '../../../services/taxonomyRouting.js';
import { findProductBySlug } from '../mock/data/products.js';

/** Every customer path this application registers, plus its dynamic shapes. */
/**
 * Customer destinations that the navigation manifest does not carry: the root,
 * listing modes, commerce steps, auth pages, and the legacy wishlist entry.
 * `App.jsx` mounts the Aarna boundary once; this register and the Aarna route
 * table own the individual customer destinations.
 */
export const APP_ROUTES = [
  "/",
  "/shop",
  "/explore",
  "/search",
  "/cart",
  "/checkout",
  "/order-success",
  "/wishlist",
  "/login",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

const registered = new Set([...APP_ROUTES, ...(routeManifest ?? []).map((route) => route.path)]);

const DYNAMIC = [
  /^\/product\/[^/]+$/,
  /^\/category\/[^/]+$/,
  /^\/collections?\/[^/]+$/,
  /^\/account(\/.*)?$/,
  /^\/orders?\/[^/]+$/,
];

/**
 * The design's vocabulary → this catalogue's canonical destinations. Every
 * target below is a route the application registers (`routeManifest`); the
 * mapping is reviewed in the Phase 2D report.
 */
const KEY_ROUTES = {
  women: '/women',
  men: '/men',
  kids: '/kids',
  essentials: '/women/essentials',
  jewellery: '/bridal/finishing-touches/jewellery',
  bridal: '/bridal',
  'the-bride': '/bridal/the-bride',
  'the-groom': '/men/groom',
  sarees: '/women/sarees',
  'festive-sarees': '/women/sarees',
  'contemporary-drapes': '/women/sarees',
  'silk-classics': '/women/sarees/silk',
  'everyday-elegance': '/women/sarees/cotton',
  kurtis: '/women/essentials/kurtis-suits',
  anarkalis: '/women/essentials/kurtis-suits',
  'kurta-sets': '/women/essentials/kurtis-suits',
  'festive-kurtis': '/women/essentials/kurtis-suits',
  'everyday-kurtis': '/women/essentials/kurtis-suits',
  dupattas: '/women/essentials/dupattas-stoles',
  bags: '/women/essentials',
  footwear: '/women/essentials',
  eyewear: '/women/essentials',
  accessories: '/women/essentials',
  bangles: '/bridal/finishing-touches/bangles',
  necklaces: '/bridal/finishing-touches/jewellery',
  jhumkas: '/bridal/finishing-touches/jewellery',
  rings: '/bridal/finishing-touches/jewellery',
  sherwanis: '/men/ethnic-wear',
  bandhgalas: '/men/ethnic-wear',
  kurtas: '/men/ethnic-wear',
  girls: '/kids/girls',
  boys: '/kids/boys',
  'kids-festive': '/kids',
  festive: '/collections',
  everyday: '/collections',
  wedding: '/bridal',
};

/** The design's information pages → this application's customer-care routes. */
const PAGE_ROUTES = {
  'our-story': '/about',
  contact: '/contact',
  privacy: '/privacy',
  terms: '/terms',
  shipping: '/contact',
  returns: '/contact',
  authenticity: '/contact',
};

/** Trailing slashes are not a different page. */
const normalize = (path) => {
  const value = String(path ?? '').trim();
  if (!value) return '/';
  if (value === '/') return '/';
  return value.replace(/\/+$/, '') || '/';
};

/**
 * Translate one design path into this application's route. Always returns a
 * path this application registers.
 */
export const resolveStorefrontPath = (to) => {
  /* No destination is not a destination: a caller with nothing to link to keeps
     the value it had, and the router never sees a fabricated one. */
  if (to === undefined || to === null) return to;
  const path = normalize(to);
  const [pathname, hash = ''] = path.split('#');
  const [bare, query = ''] = pathname.split('?');
  const suffix = `${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;

  if (registered.has(bare) || DYNAMIC.some((pattern) => pattern.test(bare))) return `${bare}${suffix}`;

  if (bare === '/track-order') return '/account/orders';

  const shopKey = bare.startsWith('/shop/') ? bare.slice('/shop/'.length) : null;
  if (shopKey) {
    if (shopKey === 'all') return `/shop${suffix}`;
    const fromTaxonomy =
      resolveCategoryRoute(shopKey)?.href ?? resolveCollectionRoute(shopKey)?.href ?? null;
    return `${fromTaxonomy ?? KEY_ROUTES[shopKey] ?? '/shop'}${suffix}`;
  }
  if (bare === '/shop') return `/shop${suffix}`;

  const productSlug = bare.startsWith('/product/') ? bare.slice('/product/'.length) : null;
  if (productSlug) {
    const product = findProductBySlug(productSlug);
    return `/product/${product?.id ?? productSlug}${suffix}`;
  }

  const pageKey = bare.startsWith('/pages/') ? bare.slice('/pages/'.length) : null;
  if (pageKey) return `${PAGE_ROUTES[pageKey] ?? '/about'}${suffix}`;

  return `/${suffix}`.replace('//', '/');
};

/** The registered-route check the regression suite uses — static and dynamic. */
export const isRegisteredPath = (path) => {
  const bare = normalize(path).split(/[?#]/)[0];
  return registered.has(bare) || DYNAMIC.some((pattern) => pattern.test(bare));
};

/** The design path → application path table, for the report. */
export const routeTable = () => ({ keyRoutes: KEY_ROUTES, pageRoutes: PAGE_ROUTES });

export default resolveStorefrontPath;
