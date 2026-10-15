/**
 * PRATIKSHYA FASHION — controlled homepage integration switch (Phase 2C).
 *
 * THE RULE: the production homepage is the existing `AtelierDesign` unless
 * someone explicitly asks for the integrated editorial home. Nothing a customer
 * can do — a URL, a session, storage — changes that.
 *
 * Two homes:
 *
 *   "atelier"    the existing homepage (`src/pages/AtelierDesign.jsx`) — the
 *                DEFAULT, and the fallback this switch is reversible to.
 *   "editorial"  the integrated composition (`components/storefront/StorefrontHome.jsx`):
 *                the Phase 2A shell (announcement bar + header), the approved
 *                Phase 1 editorial hero, and the Phase 2B homepage sections.
 *   "aarna"      the Phase 2D EXACT PORT of the approved `home-page/` design
 *                (`components/aarna/AarnaStorefront.jsx`): its own announcement
 *                bar, header, mega menu, mobile menu, footer, drawers and all
 *                twelve homepage sections, carried over file-by-file, scoped
 *                under `.aan-root`, wired to this application's catalogue,
 *                routes, cart, wishlist and account. Also OFF by default and
 *                also requested through `?home=aarna` / `VITE_STOREFRONT_HOME`.
 *
 * How "editorial" is requested:
 *
 *   · A deployed build: `VITE_STOREFRONT_HOME=editorial` set when the build
 *     runs. That is an explicit, one-variable deploy decision — the switch is
 *     off in every build that does not set it, and rolling back means building
 *     again without it (or with `atelier`).
 *   · A local dev server: the same variable, and additionally `?home=editorial`
 *     on the URL, so the homepage can be flipped for review without a rebuild.
 *
 * `?home=` is honoured ONLY in a development build (`import.meta.env.DEV`), so a
 * customer can never switch the storefront by editing the URL. `?home=atelier`
 * is the escape hatch that always returns a local review to the existing
 * homepage, whatever the environment variable says.
 *
 * Anything unrecognised — a typo, an empty value, a missing variable — resolves
 * to "atelier". There is no path through this module that leaves the storefront
 * with no homepage to render.
 */

import { useLocation } from "react-router-dom";
import { hasNavigationScope } from "../data/products/taxonomy";
import { routeManifest } from "./navigationConfig";
/* The port's own path table — the same one its link translator consults, so the
   catch-all guard and the port's idea of "what this application serves" can
   never drift apart. */
import { isRegisteredPath } from "../components/aarna/router/routes.js";

export const STOREFRONT_HOME = Object.freeze({
  atelier: "atelier",
  editorial: "editorial",
  aarna: "aarna",
});

/** The homepage root the integrated composition is allowed to replace. */
export const STOREFRONT_HOME_PATH = "/";

const VALUES = [STOREFRONT_HOME.atelier, STOREFRONT_HOME.editorial, STOREFRONT_HOME.aarna];

/** The local-review parameter (`?home=editorial`), development builds only. */
export const STOREFRONT_HOME_PARAM = "home";

/** The build-time variable (`VITE_STOREFRONT_HOME=editorial`). */
export const STOREFRONT_HOME_VAR = "VITE_STOREFRONT_HOME";

/** Vite's environment object, or an empty object outside a Vite build. */
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

/**
 * The pure resolution rule, so it can be exercised directly:
 *
 *   resolveStorefrontHome({ dev, envValue, search })
 *
 * `dev`      — is this a development build (`import.meta.env.DEV`)?
 * `envValue` — `import.meta.env.VITE_STOREFRONT_HOME`
 * `search`   — `window.location.search` (empty during server-side rendering)
 */
export function resolveStorefrontHome({ dev = false, envValue = "", search = "" } = {}) {
  if (dev) {
    let requested = "";
    try {
      requested = new URLSearchParams(search || "").get(STOREFRONT_HOME_PARAM) || "";
    } catch {
      /* A malformed query string is not a reason to change the homepage. */
      requested = "";
    }
    if (VALUES.includes(requested)) return requested;
  }
  return VALUES.includes(envValue) ? envValue : STOREFRONT_HOME.atelier;
}

/** The homepage this build/page is asking for right now. */
export function storefrontHomeChoice() {
  return resolveStorefrontHome({
    dev: Boolean(env.DEV),
    envValue: env[STOREFRONT_HOME_VAR] ?? "",
    search: typeof window === "undefined" ? "" : window.location.search,
  });
}

/**
 * `true` when the customer root should render the integrated composition
 * instead of `AtelierDesign`.
 *
 * Read at render time (not memoised) so a local-review URL change is honoured
 * on the next navigation. It is not a hook: it subscribes to nothing, and the
 * homepage it resolves to is fixed for the life of the page.
 */
export const isEditorialHomeEnabled = () => storefrontHomeChoice() === STOREFRONT_HOME.editorial;

/** `true` when the customer root should render the Phase 2D exact port. */
export const isAarnaHomeEnabled = () => storefrontHomeChoice() === STOREFRONT_HOME.aarna;

/**
 * The Phase 2D boundary question: does THIS path render the exact design port?
 * Same rule as the 2C switch — the customer root only, and only when asked for.
 */
export function useAarnaHome() {
  const { pathname } = useLocation();
  return pathname === STOREFRONT_HOME_PATH && isAarnaHomeEnabled();
}

/**
 * PHASE 6 — the second surface the port owns: the product detail page.
 *
 * The design's product page is adopted the same way its homepage was — inside
 * this switch, mounted by `CustomerLayout`, never as a re-skin of the
 * production route. The pattern is deliberately narrower than "starts with
 * /product": this application's product route is exactly `/product/:productId`
 * (`App.jsx`), and anything else — a deeper path, a missing id — stays with the
 * production router, which owns 404s.
 *
 * Still only ever true when the switch asks for the port
 * (`?home=aarna` in development, `VITE_STOREFRONT_HOME=aarna` in a build), so
 * the default storefront is untouched.
 */
export const AARNA_PRODUCT_PATH = /^\/product\/[^/]+\/?$/;

export function useAarnaProduct() {
  const { pathname } = useLocation();
  return AARNA_PRODUCT_PATH.test(pathname) && isAarnaHomeEnabled();
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
 * Everything else keeps its production page, and that includes the manifest
 * paths that are NOT navigation scopes (`/about`, `/contact`, `/privacy`,
 * `/terms`, `/account`, `/account/wishlist` — those render `CategoryPage` and
 * belong to later phases) and every staff portal route. The /cart → /checkout
 * money path was the one exception Phase 7 recorded here; Phase 9 adopts it as
 * the fifth surface, below.
 *
 * `/category/:slug` and `/collections/:slug` are handed over whole: an unknown
 * slug resolves to no scope, and the ported page answers it with the port's own
 * 404 — the same answer the production listing gives.
 */
export const AARNA_LISTING_PATHS = new Set([
  ...routeManifest
    .map((route) => route.path)
    .filter((path) => hasNavigationScope(path)),
  "/shop",
  "/explore",
  "/search",
]);

export const AARNA_LISTING_DYNAMIC = [
  /^\/category\/[^/]+\/?$/,
  /^\/collections\/[^/]+\/?$/,
  /^\/collection\/[^/]+\/?$/,
];

/** Is THIS path one the port's listing page stands in for? */
export function isAarnaListingPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return AARNA_LISTING_PATHS.has(bare) || AARNA_LISTING_DYNAMIC.some((pattern) => pattern.test(pathname));
}

export function useAarnaListing() {
  const { pathname } = useLocation();
  return isAarnaListingPath(pathname) && isAarnaHomeEnabled();
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
export const AARNA_WISHLIST_PATHS = new Set(["/account/wishlist", "/wishlist"]);
export const AARNA_INFO_PATHS = new Set(["/about", "/contact", "/privacy", "/terms"]);

export function isAarnaWishlistPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return AARNA_WISHLIST_PATHS.has(bare) || AARNA_INFO_PATHS.has(bare);
}

export function useAarnaWishlist() {
  const { pathname } = useLocation();
  return isAarnaWishlistPath(pathname) && isAarnaHomeEnabled();
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
export const AARNA_JOURNEY_PATHS = new Set(["/cart", "/checkout", "/order-success"]);

export function isAarnaJourneyPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return AARNA_JOURNEY_PATHS.has(bare);
}

export function useAarnaJourney() {
  const { pathname } = useLocation();
  return isAarnaJourneyPath(pathname) && isAarnaHomeEnabled();
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
 * `/reset-password` is deliberately NOT in this set. Its production screen
 * never reads the `userId`/`token` pair the backend requires
 * (`ResetPasswordRequest`, `backend/app/schemas/auth/login.py`), so every
 * submit is refused before a password can change. Dressing that flow in the
 * design would stage a screen that cannot work; it stays on the production
 * implementation, together with the staff portals (`/login`, `/admin/**`,
 * `/super-admin/**`, `/employee/**`). (PHASE 11 later adopted the account by
 * name — the section below.) The defect is recorded, not hidden: §7 of the
 * phase document.
 *
 * The three paths are adopted by name — the same pattern as every surface
 * before them — so the catch-all's semantics are untouched: they are paths this
 * application REGISTERS, and a registered path was never the catch-all's to
 * answer.
 */
export const AARNA_AUTH_PATHS = new Set(["/signin", "/signup", "/forgot-password"]);

export function isAarnaAuthPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return AARNA_AUTH_PATHS.has(bare);
}

export function useAarnaAuth() {
  const { pathname } = useLocation();
  return isAarnaAuthPath(pathname) && isAarnaHomeEnabled();
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
 * (`AARNA_WISHLIST_PATHS`), where it stays — guest-accessible, exactly as
 * production serves it — and the two sets are disjoint by construction.
 *
 * Phase 11 is a UI migration: the pages themselves move one at a time, and
 * until a page is redrawn its route renders the production page unchanged. This
 * set can therefore name the whole family without any behaviour moving with it.
 */
export const AARNA_ACCOUNT_PATHS = new Set([
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
export const AARNA_ACCOUNT_GUEST_PATTERNS = [
  /^\/account\/orders\/[^/]+$/,
  /^\/account\/orders\/[^/]+\/track$/,
  /^\/account\/orders\/[^/]+\/return$/,
];

export function isAarnaAccountPath(pathname) {
  const bare = String(pathname ?? "").replace(/\/+$/, "") || "/";
  return AARNA_ACCOUNT_PATHS.has(bare) || AARNA_ACCOUNT_GUEST_PATTERNS.some((pattern) => pattern.test(bare));
}

export function useAarnaAccount() {
  const { pathname } = useLocation();
  return isAarnaAccountPath(pathname) && isAarnaHomeEnabled();
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
 *     explicitly, and `aarnaCatchAll` is false for every path under them;
 *   · every path the application DOES serve keeps its own page, including the
 *     ones the port has not adopted — `/reset-password` and the staff portals.
 *     (Phase 9 adopted the money path by name, Phase 10 the three customer auth
 *     screens and Phase 11 the account, so `/cart`, `/checkout`,
 *     `/order-success`, `/signin`, `/signup`, `/forgot-password` and every
 *     `/account/**` path are answered by the port's own routes while the switch
 *     is on, and by the production pages while it is off.)
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
export function isAarnaCatchAllPath(pathname) {
  if (isStaffPortalPath(pathname)) return false;
  return !isRegisteredPath(pathname);
}

export function useAarnaCatchAll() {
  const { pathname } = useLocation();
  return isAarnaCatchAllPath(pathname) && isAarnaHomeEnabled();
}

/**
 * The port's whole boundary, in one question: is THIS path one of the design's
 * pages, and has the switch been asked for the port at all?
 */
export function useAarnaStorefront() {
  const home = useAarnaHome();
  const product = useAarnaProduct();
  const listing = useAarnaListing();
  const wishlist = useAarnaWishlist();
  const journey = useAarnaJourney();
  const auth = useAarnaAuth();
  const account = useAarnaAccount();
  const catchAll = useAarnaCatchAll();
  return home || product || listing || wishlist || journey || auth || account || catchAll;
}

/**
 * The layout boundary's single question: does THIS path render the integrated
 * homepage? Only the customer root ever can — every other customer route, and
 * every portal route, keeps the shell it has today.
 */
export function useEditorialHome() {
  const { pathname } = useLocation();
  return pathname === STOREFRONT_HOME_PATH && isEditorialHomeEnabled();
}

export default STOREFRONT_HOME;
