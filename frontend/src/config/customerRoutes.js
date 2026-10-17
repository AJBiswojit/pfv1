/* Customer route ownership and storefront boundary helpers. This storefront is the only customer surface. */
import { useLocation } from "react-router-dom";
import { hasNavigationScope } from "../data/products/taxonomy";
import { routeManifest } from "./navigationConfig";
import { isRegisteredPath } from "../components/customer/router/routes.js";

export function useCustomerHome() {
  const { pathname } = useLocation();
  return pathname === "/";
}

/**
 * PHASE 6 — the second surface the port owns: the product detail page.
 *
 * The design's product page is mounted by `CustomerLayout` for the exact
 * `/product/:productId` route. The pattern is deliberately narrower than
 * "starts with /product": deeper or incomplete paths are not product pages.
 */
export const CUSTOMER_PRODUCT_PATH = /^\/product\/[^/]+\/?$/;

export function useCustomerProduct() {
  const { pathname } = useLocation();
  return CUSTOMER_PRODUCT_PATH.test(pathname);
}

/**
 * PHASE 7 — the third surface the port owns: the listings.
 *
 * The design draws one shop/listing/search shell, and this application serves
 * it from seven shapes of URL. The set below is not a second route table: it is
 * exactly the set `App.jsx` already sends to a listing page —
 *
 *   · the four dedicated routes: `/shop`, `/explore`, `/search` and the two
 *     dynamic listing shapes (`/category/:slug`, `/collections/:slug`) plus the
 *     legacy `/collection/:slug` redirect;
 *   · every `routeManifest` path the router sends to `CatalogueListing` —
 *     `hasNavigationScope(pathname)`, the same predicate `App.jsx` uses.
 *
 * Other customer surfaces—information pages, account pages, wishlist and the
 * order journey—are classified separately below. Staff portals are not part
 * of the customer route table.
 *
 * `/category/:slug` and `/collections/:slug` are handed over whole: an unknown
 * slug resolves to no scope, and the ported page answers it with the port's own
 * 404 — the same answer the production listing gives.
 */
export const CUSTOMER_LISTING_PATHS = new Set([
  ...routeManifest
    .map((route) => route.path)
    .filter((path) => hasNavigationScope(path)),
  "/shop",
  "/explore",
  "/search",
]);

export const CUSTOMER_LISTING_DYNAMIC = [
  /^\/category\/[^/]+\/?$/,
  /^\/collections\/[^/]+\/?$/,
  /^\/collection\/[^/]+\/?$/,
];

/** Is THIS path one the port's listing page stands in for? */
export function isCustomerListingPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return CUSTOMER_LISTING_PATHS.has(bare) || CUSTOMER_LISTING_DYNAMIC.some((pattern) => pattern.test(pathname));
}

export function useCustomerListing() {
  const { pathname } = useLocation();
  return isCustomerListingPath(pathname);
}

/**
 * PHASE 8 — the fourth surface: the wishlist and the application's information
 * pages.
 *
 * `/account/wishlist` is the canonical route and `/wishlist` the legacy entry
 * that redirects to it (`App.jsx`). Both are handed over together, so the
 * redirect happens inside the design's shell and the production chrome is never
 * painted on the way. The four information paths are the ones `routeManifest`
 * carries; the ported page reads its metadata from that same manifest.
 */
export const CUSTOMER_WISHLIST_PATHS = new Set(["/account/wishlist", "/wishlist"]);
export const CUSTOMER_INFO_PATHS = new Set(["/about", "/contact", "/privacy", "/terms"]);

export function isCustomerWishlistPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return CUSTOMER_WISHLIST_PATHS.has(bare) || CUSTOMER_INFO_PATHS.has(bare);
}

export function useCustomerWishlist() {
  const { pathname } = useLocation();
  return isCustomerWishlistPath(pathname);
}

/**
 * PHASE 9 — the fifth surface: the money path.
 *
 * `/cart`, `/checkout` and `/order-success` are the three routes the bag and
 * the transaction run through, and Phase 9 adopts all three together, because
 * they are one journey: the bag hands to the checkout, the checkout hands to
 * the confirmation. The production application remains the only authority for
 * everything they DO — the same `CartContext`, `CheckoutContext` and
 * `OrderContext`, the same API clients, the same validators, the same
 * server-side pricing and the same rule that the bag is cleared only after the
 * server confirms an order. What changes is the chrome around them.
 *
 * `/cart` renders inside the design's own `Layout` (the full shopping shell —
 * announcement rail, header, mega menu, footer, bag drawer), exactly as the
 * production bag keeps the full shopping header. `/checkout` and
 * `/order-success` render inside the port's `JourneyFrame`, the design-language
 * equivalent of the reduced `CheckoutHeader` production gives the order
 * journey. Authentication is unchanged: both routes stay behind the
 * application's own `ProtectedRoute`, so a guest still lands on
 * `/signin?returnTo=…`.
 */
export const CUSTOMER_JOURNEY_PATHS = new Set(["/cart", "/checkout", "/order-success"]);

export function isCustomerJourneyPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return CUSTOMER_JOURNEY_PATHS.has(bare);
}

export function useCustomerJourney() {
  const { pathname } = useLocation();
  return isCustomerJourneyPath(pathname);
}

/**
 * PHASE 10 — the sixth surface: the customer authentication screens.
 *
 * Phase 10 asked which authentication surfaces could be adopted honestly, and
 * the audit (`docs/PHASE-10-AUTHENTICATION-UI.md`) answered from the code: the
 * design has NO authentication screens — its `/account` is a fifty-line
 * prototype that stores a name in `localStorage` and says so on the page — so
 * these three pages are written in the design's own vocabulary and carry every
 * behaviour of the production screens unchanged. They are the application's own
 * sign-in, create-account and password-recovery-REQUEST pages, and nothing
 * about them is simulated: the same `AuthContext`, the same Google button, the
 * same validators, the same `POST /auth/customer/*` calls.
 *
 * `/reset-password` is included: its storefront page reads `userId`/`token` from
 * the reset URL and calls the same existing auth context/service. The backend
 * still does not dispatch reset emails; no backend behavior is changed here.
 * Staff portals (`/login`, `/admin/**`, `/super-admin/**`, `/employee/**`)
 * remain outside the customer route boundary.
 *
 * The three paths are adopted by name — the same pattern as every surface
 * before them — so the catch-all's semantics are untouched: they are paths this
 * application REGISTERS, and a registered path was never the catch-all's to
 * answer.
 */
export const CUSTOMER_AUTH_PATHS = new Set(["/signin", "/signup", "/forgot-password", "/reset-password"]);

export function isCustomerAuthPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return CUSTOMER_AUTH_PATHS.has(bare);
}

export function useCustomerAuth() {
  const { pathname } = useLocation();
  return isCustomerAuthPath(pathname);
}

/**
 * PHASE 11 — the seventh surface: the customer account.
 *
 * Thirteen URLs, one family, and TWO guards — the split production already
 * draws, adopted here unchanged:
 *
 *   · the ten account SCREENS (`/account` … `/account/instagram-rewards`) are
 *     behind the same `ProtectedRoute` the production tree wraps them in, so a
 *     guest still lands on `/signin?returnTo=…`;
 *   · the three order PAGES (`/account/orders/:orderId` and its `/track` and
 *     `/return` steps) are deliberately UNGUARDED. They are the guest-order
 *     surface: `components/orders/OrderPageShell` branches on `isAuthenticated`
 *     — the account shell for a member, the "guest order from this browser"
 *     note for a guest, with its `/signin?returnTo=%2Faccount%2Forders` and
 *     `/signup?returnTo=%2Faccount%2Forders` links — and `claimGuestOrders`
 *     attaches those orders after sign-in. Both behaviours are preserved by
 *     adopting the same split, not by re-deciding it.
 *
 * `/account/wishlist` is NOT in this set. It never was a screen of this
 * family's migration: Phase 8 adopted it with the wishlist surface
 * (`CUSTOMER_WISHLIST_PATHS`), where it stays — guest-accessible, exactly as
 * production serves it — and the two sets are disjoint by construction.
 *
 * These account paths are rendered by the customer account route family; protected
 * screens and guest-order URLs retain their existing guard distinctions.
 */
export const CUSTOMER_ACCOUNT_PATHS = new Set([
  "/account",
  "/account/profile",
  "/account/addresses",
  "/account/orders",
  "/account/settings",
  "/account/security",
  "/account/preferences",
  "/account/ai-mirror",
  "/account/ai-shopping",
  "/account/instagram-rewards",
]);

/**
 * The three order pages a guest may open from their own browser — unguarded,
 * exactly as production leaves them. `/account/orders` itself (the LIST) is not
 * one of them: it is the guarded screen above.
 */
export const CUSTOMER_ACCOUNT_GUEST_PATTERNS = [
  /^\/account\/orders\/[^/]+$/,
  /^\/account\/orders\/[^/]+\/track$/,
  /^\/account\/orders\/[^/]+\/return$/,
];

export function isCustomerAccountPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return CUSTOMER_ACCOUNT_PATHS.has(bare) || CUSTOMER_ACCOUNT_GUEST_PATTERNS.some((pattern) => pattern.test(bare));
}

export function useCustomerAccount() {
  const { pathname } = useLocation();
  return isCustomerAccountPath(pathname);
}

/**
 * PHASE 8 — the guarded catch-all.
 *
 * The design's 404 already answers every *scoped* not-found this application has
 * (`/product/<unknown>`, `/category/<unknown>`): the port's own route table ends
 * in a catch-all that resolves a scope, finds none, and renders the design's
 * page. What it does not answer is a URL this application serves no route for at
 * all — today that is the production `NotFound`.
 *
 * Handing those over needs one guard, and it is the whole risk of the change:
 *
 *   · the STAFF PORTALS must never be swallowed. `/login`, `/admin/**`,
 *     `/super-admin/**` and `/employee/**` are not customer routes, their own
 *     route trees own their 404s (`AdminNotFound`, the employee portal), and the
 *     port's route table knows nothing about them. The prefixes are listed here
 *     explicitly, and `isCustomerCatchAllPath` is false for every path under them;
 *   · every path the application DOES serve keeps its own page, including the
 *     ones the port has not adopted — `/reset-password` and the staff portals.
 *     (Phase 9 adopted the money path by name, Phase 10 the three customer auth
 *     screens and Phase 11 the account, so `/cart`, `/checkout`,
 *     `/order-success`, `/signin`, `/signup`, `/forgot-password` and every
 *     `/account/**` path is answered by the port's own route table.
 *     The test is the port's own `isRegisteredPath`,
 *     the same table its link translator uses, so the two can never disagree
 *     about what this application serves.
 */
export const STAFF_PORTAL_PREFIXES = ["/login", "/admin", "/super-admin", "/employee"];

export function isStaffPortalPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return STAFF_PORTAL_PREFIXES.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`));
}

/** A path this application serves no customer route for — and not a portal. */
export function isCustomerCatchAllPath(pathname) {
  if (isStaffPortalPath(pathname)) return false;
  return !isRegisteredPath(pathname);
}

export function useCustomerCatchAll() {
  const { pathname } = useLocation();
  return isCustomerCatchAllPath(pathname);
}

/**
 * True when this path belongs to the customer storefront's route table.
 */
export function useCustomerStorefront() {
  const home = useCustomerHome();
  const product = useCustomerProduct();
  const listing = useCustomerListing();
  const wishlist = useCustomerWishlist();
  const journey = useCustomerJourney();
  const auth = useCustomerAuth();
  const account = useCustomerAccount();
  const catchAll = useCustomerCatchAll();
  return home || product || listing || wishlist || journey || auth || account || catchAll;
}
