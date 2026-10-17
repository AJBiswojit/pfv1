import { HOMEPAGE_SECTION_EDITS, homepageSectionRewrite } from "./homepage-section-rewrites.js";
/**
 * PRATIKSHYA FASHION — PHASE 2D · the exact-design-port tool.
 *
 * Two jobs, both mechanical and both re-checkable:
 *
 *   1. THE PORT IS COPIES. `node scripts/customer-port.js --copy` copies the
 *      approved design's homepage dependency closure (`home-page/src/…`) into
 *      `src/components/customer/…`, preserving the design's own directory layout so
 *      that every relative import inside the copied files keeps resolving. The
 *      only differences the tool introduces are the pinned rewrites below —
 *      each one a named, counted, single-purpose edit (a routing shim, a React
 *      DOM property, an asset path + its staged twin, offer copy that cannot be
 *      session-specific, and a capability gate). `--check` re-verifies the pins.
 *
 *   2. THE STYLESHEET IS A TRANSFORM. `node scripts/customer-port.js --css` reads
 *      the design's seven stylesheets and writes `src/components/customer/customer.css`
 *      with every selector scoped under `.pf-root`. Declarations are copied
 *      byte-for-byte; only selectors change, plus the two global keyframe names
 *      (`spin`, `pulse` → `pf-spin`, `pf-pulse`). `--check` re-runs the
 *      transform and compares, so the committed stylesheet can never drift from
 *      the design it was taken from (`customerSourceParity.test.js` also does this
 *      from inside the test suite).
 *
 * Nothing here writes to `home-page/`: the design is read-only reference.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = join(HERE, "..");
export const REPO_ROOT = join(FRONTEND_ROOT, "..");
export const DESIGN_SRC = join(REPO_ROOT, "home-page", "src");
export const DESIGN_STYLES = join(DESIGN_SRC, "styles");
export const PORT_RELATIVE = "src/components/customer";
export const PORT_DIR = join(FRONTEND_ROOT, PORT_RELATIVE);
export const PORT_CSS = join(PORT_DIR, "customer.css");
export const SCOPE = ".pf-root";

/* ────────────────────────────── the closure ─────────────────────────────── */

/**
 * Every file of the homepage's dependency closure, with the number of the
 * design's lines the port does not carry. `0` = copied byte-for-byte.
 *
 * The non-zero entries are produced by the `REWRITES` below; the count is the
 * size of the adaptation, so an edit that grows is an edit the suite refuses.
 */
export const CLOSURE = {
  "components/layout/AnnouncementBar.jsx": 2,
  "components/layout/Footer.jsx": 5,  // 1 routing + 4 truthfulness lines
  "components/layout/Header.jsx": 1,
  "components/layout/Layout.jsx": 2,
  "components/navigation/MegaMenu.jsx": 1,
  "components/navigation/MobileMenu.jsx": 1,
  "components/product/OptionSelector.jsx": 0,
  "components/product/Price.jsx": 0,
  "components/product/ProductCard.jsx": 3,  // 1 routing + 2 missing-plate fallbacks
  "components/product/WishlistButton.jsx": 0,
  "components/product/useAddToBag.js": 2,  // 2 add-to-bag-feedback (the confirmation is tied to the outcome)
  "components/sections/Bestsellers.jsx": 6, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/BridalCampaign.jsx": 29, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/CategoryCollage.jsx": 14, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/Hero.jsx": 7, // data injection, optional CTAs, alt, React fetchPriority
  "components/sections/JewelleryTheatre.jsx": 15, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/KidsPlayground.jsx": 14, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/KurtiLookbook.jsx": 24, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/MensEditorial.jsx": 12, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/Newsletter.jsx": 8, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/PromoBanner.jsx": 57, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/SareeLookbook.jsx": 36, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/sections/TrustStrip.jsx": 6, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  "components/shopping/CartDrawer.jsx": 9,  // 1 routing + 5 offer-copy + 1 missing-plate line + 2 promo-feedback
  // PHASE 9 adds one line to the drawer's foot ("View bag" → /cart) and removes
  // none of the design's; this pin counts design lines the port does not carry,
  // so it stands at 9. `--copy` still fails on any real drift.
  "components/shopping/QuickViewModal.jsx": 3,  // 1 routing + 2 missing-plate fallbacks
  "components/shopping/SearchOverlay.jsx": 4,  // 1 routing + 2 live catalogue + 1 missing plate
  "components/ui/ArrowLink.jsx": 1,
  "components/ui/Button.jsx": 1,
  "components/ui/InView.jsx": 0,
  "components/ui/Logo.jsx": 2,
  "components/ui/NewsletterForm.jsx": 5,  // 1 import + 4 capability-gate lines
  "components/ui/Reveal.jsx": 0,
  "components/ui/ScrollToTop.jsx": 0,
  "components/ui/SectionLabel.jsx": 0,
  "components/ui/Toasts.jsx": 0,
  "data/index.js": 5,
  "hooks/useEscape.js": 0,
  "hooks/useFocusTrap.js": 0,
  "hooks/useLockBody.js": 0,
  "hooks/useScrolled.js": 0,
  "mock/assets/images.js": 15,
  "mock/data/content.js": 58,  // prototype site block + sample announcements + the care-hours line
  "mock/data/navigation.js": 0,
  "pages/Home.jsx": 12, // Phase 3 typed-section integration; STEP-1 database-driven (no mock fallbacks)
  // 1 routing + 1 catalogue import + 1 Button import + 2 lookup
  // + 1 stepper ceiling + 1 buy button + 2 fabric/craft + 1 care
  // + 1 delivery/returns + 1 availability note + 1 validation line
  // + 1 bagged choice + 1 chip value = 15. Verified by `--copy`, which fails on
  // a mismatch — as it did when this pin was first written from memory.
  "pages/Product.jsx": 15,
  // Carried because the design's product page renders it for an unknown slug
  // (and the port's route table uses it for an unmatched path). Byte-identical:
  // its only link is the design's `Button`, which already reaches the shim.
  "pages/NotFound.jsx": 0,
  // PHASE 7 · the design's listing shell — breadcrumbs, label, display title,
  // result count, category/product-type chips, sort select, the four-column
  // grid and the empty state — bound to this application's own listing engine
  // (the server-backed catalogue query, thirteen facets, counts, URL state,
  // server pagination, honest loading/error states) and to the production
  // scope register. Pin measured by `--copy`, never guessed.
  "pages/Shop.jsx": 44,
  // PHASE 8 · the design's wishlist — its own page, bound to this application's
  // real wishlist (server-backed when signed in, client-only when not) with the
  // states the design never drew: first fetch, an unreachable list, and a saved
  // piece the catalogue no longer resolves. Pin measured by `--copy`.
  "pages/Wishlist.jsx": 9,
  // PHASE 8 · the design's information page — its layout, carrying the manifest's
  // own metadata for /about, /contact, /privacy and /terms. The design's prototype
  // policy copy is deliberately not carried. Pin measured by `--copy`.
  "pages/Info.jsx": 11,
  "services/catalog.js": 3,
  "services/storage.js": 0,
  "state/UIContext.jsx": 0,
  "utils/format.js": 0,
  "utils/motion.js": 0,
};

/**
 * Files the port REPLACES with a boundary adapter: the design's module is a
 * prototype data source (a sample catalogue, a sample offer, a simulated
 * subscription, a local-storage cart). The port keeps the same module path and
 * the same export names — so every copied component keeps working unchanged —
 * but answers from this application: the live catalogue, the offer register,
 * the centralised cart + wishlist, and an honest "no capability yet" for the
 * subscription. Each one opens with an `ADAPTED AT THE BOUNDARY` note.
 */
export const REPLACED = {
  "mock/data/products.js": "the live catalogue, mapped to the design's product shape",
  "mock/data/promotions.js": "the offer register, mapped to the design's promotion shape",
  "services/newsletter.js": "no subscription capability exists in this application yet",
  "state/ShopContext.jsx": "this application's CartContext + WishlistContext",
};

/** Modules the port adds: the design has no counterpart. */
export const ADDED = [
  "CustomerStorefront.jsx",
  "customer.css",
  "customer.host.css",
  "customer.listing.css",
  /* PHASE 8 — the wishlist's own chrome (the design has no such file). */
  "customer.wishlist.css",
  "components/shop/ListingControls.jsx",
  "components/shop/listingScope.js",
  "designFonts.js",
  "mock/data/site.js",
  "router/index.jsx",
  "router/routes.js",
  "utils/mediaFallback.js",
  /* PHASE 9 — the money path. The design drew a cart DRAWER (carried in the
     closure) and a checkout PROTOTYPE whose own note says it cannot place an
     order; it has no bag page, no journey chrome and no confirmation page.
     These five are written in the design's own vocabulary and have no design
     counterpart, so the tool checks they exist and never writes them. */
  "customer.checkout.css",
  "components/layout/JourneyFrame.jsx",
  "pages/Cart.jsx",
  "pages/Checkout.jsx",
  "pages/OrderSuccess.jsx",
  /* PHASE 10 — the authentication screens. The design drew NONE: its `/account`
     is a prototype that stores a name in `localStorage` and says "no server
     account is created" on the page, so there is nothing to carry over. These
     are the application's own sign-in, create-account and password-recovery
     request screens, written in the design's vocabulary and bound to the real
     contexts. Reset-password is a separate customer route that reuses the
     existing reset context/service; the existing forgot-password backend
     still does not dispatch reset email. Declared, so closure checks know
     these modules and the port tool never writes them. */
  "customer.auth.css",
  "pages/ForgotPassword.jsx",
  "pages/ResetPassword.jsx",
  "pages/SignIn.jsx",
  "pages/SignUp.jsx",
  /* PHASE 11 — the account frame. The design's `/account` is a fifty-line
     prototype (three links, no navigation, no server account), so the shared
     shell every migrated account screen renders inside — and the navigation
     that reaches all eleven destinations — are written in the design's own
     vocabulary. The account PAGES carry over one at a time; each one declared
     here as it is written. Declared, so the closure check knows them and never
     writes them. */
  "customer.account.css",
  /* ...and, one stage later, the order screens' own sheet: the design never drew
     an order, so the four redrawn order screens' chrome is written in the
     design's vocabulary too, scoped to the port the same way. */
  "customer.orders.css",
  /* ...and, one stage later again, the two AI screens' own sheet: the design
    never drew an assistant either, so the chrome the mirror and the shopping
    conversation are drawn in — the notes band, the two-column bodies, the
    arriving product, the recent-look rail and the conversation's column — is
    written in the design's vocabulary, scoped to the port the same way. */
  "customer.ai.css",
  "pages/account/AccountFrame.jsx",
  "pages/account/AccountNav.jsx",
  /* PHASE 11 · the migrated screens, declared as each one is written: the
     overview `/account` renders inside the frame above, from this application's
     own account, order, bag and wishlist contexts (Stage 2.2), then the profile
     and the addresses (Stage 2.3), which read the same account context their
     production pages read, then the four order screens (Stage 2.4) and the
     `OrderFrame` they share — the port's equivalent of production's
     `OrderPageShell`, which is what keeps the single-order URLs open to a guest. */
  "pages/account/Overview.jsx",
  "pages/account/Profile.jsx",
  "pages/account/Addresses.jsx",
  "pages/account/Orders.jsx",
  "pages/account/OrderDetail.jsx",
  "pages/account/OrderTracking.jsx",
  "pages/account/OrderReturn.jsx",
  "pages/account/OrderFrame.jsx",
  /* PHASE 11 · STAGE 2.5 — the two AI screens. Both keep production's own
    machines (the try-on service and the assistant service, the session store,
    the widgets) and are redrawn around them in the design's own vocabulary:
    the mirror's stage, edit and selected look, and the shopping conversation
    with its rail. Declared, so the closure check knows them and never writes
    them. */
  "pages/account/AiMirror.jsx",
  "pages/account/AiShopping.jsx",
  /* PHASE 12 — the four remaining account screens (settings, security, style
     preferences, Instagram rewards). The design drew none of them, so they are
     written in the design's vocabulary and bound to the application's own
     contexts, services and validation — the same production APIs production's
     pages call. Declared, so the closure check knows them and never writes them. */
  "pages/account/Settings.jsx",
  "pages/account/Security.jsx",
  "pages/account/Preferences.jsx",
  "pages/account/InstagramRewards.jsx",
  ];

/* ─────────────────────────── the pinned rewrites ────────────────────────── */

const relativeTo = (fromFile, toFile) => {
  const specifier = relative(dirname(join(PORT_DIR, fromFile)), join(PORT_DIR, toFile));
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
};

/**
 * Rewrite 1 — ROUTING. The design owns its own router and its own URL space
 * (`/shop/sarees`, `/pages/our-story`, `/track-order`). This application owns a
 * different one. Rather than rewrite dozens of destinations, the port keeps the
 * design's own `to` values everywhere and re-points the two link components at
 * the shim, which translates at render time (`router/routes.js`).
 */
const routingRewrite = (file, source) => {
  const pattern = /^import \{([^}]*)\} from 'react-router-dom';$/m;
  const match = source.match(pattern);
  if (!match) return source;
  /* Only files that render a link are re-pointed; `Outlet`, `useLocation`,
     `useNavigate` and `useParams` stay with react-router-dom. */
  const named = match[1].split(",").map((name) => name.trim());
  if (!named.includes("Link") && !named.includes("NavLink")) return source;
  const kept = match[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name && name !== "Link" && name !== "NavLink");
  const shim = `import { ${["Link", "NavLink"]
    .filter((name) => match[1].includes(name))
    .join(", ")} } from '${relativeTo(file, "router/index.jsx")}';`;
  const replacement = kept.length ? `import { ${kept.join(", ")} } from 'react-router-dom';\n${shim}` : shim;
  return source.replace(pattern, replacement);
};

/** Rewrite 2 — the React 19 DOM property for the hero's first image. */
const fetchPriorityRewrite = (file, source) => source.replace(/\bfetchpriority=/g, "fetchPriority=");

/** Rewrite 3 — the brand mark, staged with the rest of the design's art. */
const logoPlateRewrite = (file, source) =>
  source.replace("const MARK_SRC = '/images/pratikshya-logo.webp';", "const MARK_SRC = '/design/pratikshya-logo.webp';");

/** Rewrite — the announcement bar's session key, renamed to a neutral one in
 *  the customer app (the prototype keeps `aarna:announce`; sessions that
 *  dismissed the bar under the old key see it once again). */
const announcementKeyRewrite = (file, source) => source.replace(/'aarna:announce'/g, "'storefront:announce'");

/** Rewrite — the port's class prefix. The design-side `aan-` namespace is
 *  carried into the port as `pf-` (the customer stylesheet's scope), so a
 *  regenerated file can never reintroduce the old prefix; today no CLOSURE
 *  file contains `aan-` at all (the prefix lives in port-authored files and
 *  the CSS transform), which keeps every pin unchanged. */
const classPrefixRewrite = (file, source) => source.replace(/\baan-/g, "pf-");

/**
 * Rewrite 4 — OFFER COPY. The design's basket names its own sample campaign
 * ("Festive Edit") in four places. A live offer may be scoped to any
 * collection, or to none, so the copy takes the offer's own label and its own
 * percentage — and says only what the offer register says.
 */
const offerCopyRewrite = (file, source) =>
  source
    .replace("{ ok: true, text: `${res.promo.code} applied — ${res.promo.discountPercent}% off Festive Edit items.` }",
             "{ ok: true, text: `${res.promo.code} applied — ${res.promo.discountLabel}.` }")
    .replace("{totals.promo && l.product.collections.includes(totals.promo.eligibleCollection) && <p className=\"cline__promo\"><Tag size={11} /> Festive Edit</p>}",
             "{totals.promo && l.product.collections.includes(totals.promo.eligibleCollection) && <p className=\"cline__promo\"><Tag size={11} /> {totals.promo.scopeLabel}</p>}")
    .replace("<span><Tag size={13} /> {totals.promo.code} · {totals.promo.discountPercent}% off Festive Edit</span>",
             "<span><Tag size={13} /> {totals.promo.code} · {totals.promo.discountLabel}</span>")
    .replace("<div className=\"totals__disc\"><dt>Festive Edit discount</dt>",
             "<div className=\"totals__disc\"><dt>{totals.promo.scopeLabel ?? 'Offer'} discount</dt>")
    .replace("<div className=\"totals__note\"><dt>No Festive Edit items in bag yet</dt>",
             "<div className=\"totals__note\"><dt>No eligible items in the bag yet</dt>");

/**
 * Rewrite 4b — THE OFFER'S OUTCOME (Phase 4). The design's shop was a
 * prototype whose `applyPromo` answered instantly from local state, so its
 * drawer handler reads the result synchronously. This port's `applyPromo` is
 * the application's own coupon call — the backend validates and persists the
 * code and answers with the register's own label — so the handler awaits it.
 * Read without awaiting, `res.ok` was always `undefined`: the drawer rendered
 * an empty message in the error colour and never showed the register's
 * sentence, for a valid code and for an invalid one alike.
 *
 * The same rewrite states the truth about the amount. The guest cart's totals
 * are a presentation calculation (`totals.priced === false`) — the server
 * prices the coupon when the order is placed — so the design's "no eligible
 * items" line, which is only true when the server itself returned a zero
 * discount, is not shown to a guest who has just had a code accepted.
 */
const promoFeedbackRewrite = (file, source) =>
  source
    .replace(
      "  const onApply = (e) => {\n    e.preventDefault();\n    if (!code.trim()) return;\n    const res = applyPromo(code);",
      "  const onApply = async (e) => {\n    e.preventDefault();\n    if (!code.trim()) return;\n    const res = await applyPromo(code);",
    )
    .replace(
      "{totals.promo && totals.discount === 0 && <div className=\"totals__note\"><dt>No eligible items in the bag yet</dt><dd /></div>}",
      "{totals.promo && totals.discount === 0 && <div className=\"totals__note\"><dt>{totals.priced ? 'No eligible items in the bag yet' : 'The offer is applied — its amount is confirmed when your order is placed.'}</dt><dd /></div>}",
    );

/**
 * Rewrite 10c — THE BAG PAGE (Phase 9). The design's drawer ends with the way
 * to checkout and a line back to shopping; the bag itself was the drawer, so
 * the design never needed a link to a bag page. This application has one
 * (`/cart`, the same page the checkout header's Bag link opens), and Phase 9
 * adopts it — so the drawer's foot offers it too. One line is ADDED to the
 * design's foot; no line of the design's is removed or altered, which is why
 * this file's pin does not move. The label is the application's own: the
 * drawer's heading, its toast action and its aria-labels already say "bag".
 */
const viewBagRewrite = (file, source) =>
  source.replace(
    "                  <button type=\"button\" className=\"drawer__continue\" onClick={closeCart}>Continue shopping</button>",
    "                  <button type=\"button\" className=\"drawer__continue\" onClick={() => { closeCart(); navigate('/cart'); }}>View bag</button>\n"
      + "                  <button type=\"button\" className=\"drawer__continue\" onClick={closeCart}>Continue shopping</button>",
  );

/**
 * Rewrite 10b — THE ADD'S CONFIRMATION (Phase 4). The design's `addToCart`
 * answered from local state and always succeeded, so this hook could confirm
 * the add unconditionally. Here the add is the application's own: the server
 * answer when the customer is signed in, the stock rule when they are not.
 * The confirmation is therefore tied to the outcome — a refused add keeps the
 * cart's own message as the only thing the customer is told. (Measured: a
 * piece the catalogue marks unavailable previously toasted "<name> added to
 * bag" while the bag stayed at zero.)
 */
const addToBagFeedbackRewrite = (file, source) =>
  source.replace(
    "      addToCart(product.id, label, qty);\n      toast(`${product.name} added to bag`, { label: 'View bag', onClick: openCart });",
    "      const result = addToCart(product.id, label, qty);\n      /* The design's shop answered locally, so its confirmation was always\n         true; this port's add is the application's own and may be refused. */\n      Promise.resolve(result).then((outcome) => {\n        if (outcome && outcome.ok === false) return;\n        toast(`${product.name} added to bag`, { label: 'View bag', onClick: openCart });\n      });\n      return result;",
  );

/**
 * Rewrite 5 — THE PAGE SLOT. The design's layout renders the router's
 * `<Outlet/>`; here the page is a child, because this application owns routing
 * and mounts the design at one route.
 */
const layoutSlotRewrite = (file, source) =>
  source
    .replace("export default function Layout() {", "export default function Layout({ children }) {")
    .replace("<Outlet />", "{children ?? <Outlet />}");

/**
 * Rewrite 6 — THE SUBSCRIPTION CAPABILITY. This application has no newsletter
 * service: no endpoint, no list, no consent record. The design's field and
 * button therefore render disabled with the design's own status line carrying
 * the reason — a control that cannot work is not offered as if it could. The
 * development reference surface substitutes the design's simulated service so
 * the section can still be compared like for like (see `services/newsletter.js`).
 */
const newsletterCapabilityRewrite = (file, source) =>
  source
    .replace(
      "import { subscribe } from '../../services/newsletter.js';",
      "import { newsletterAvailable, subscribe } from '../../services/newsletter.js';",
    )
    .replace(
      "  const [status, setStatus] = useState('idle');",
      "  const [status, setStatus] = useState('idle');\n  const live = newsletterAvailable();",
    )
    .replace("<form className={cx('nform'", "<form className={cx('nform', !live && 'is-unavailable'")
    .replace("          disabled={status === 'loading'}\n          required", "          disabled={!live || status === 'loading'}\n          required")
    .replace(
      "<button type=\"submit\" className=\"nform__btn\" disabled={status === 'loading'}>",
      "<button type=\"submit\" className=\"nform__btn\" disabled={!live || status === 'loading'}>",
    )
    .replace(
      "          {message && (",
      "          {!live && (\n            <p className=\"is-note\">{UNAVAILABLE_NOTE}</p>\n          )}\n          {live && message && (",
    )
    .replace("import { cx } from '../../utils/format.js';", "import { cx } from '../../utils/format.js';\n\n/** Shown instead of a form that cannot submit (see `services/newsletter.js`). */\nconst UNAVAILABLE_NOTE = 'Newsletter sign-up opens once the subscription service is connected.';");

/**
 * The house's own record. `mock/data/content.js` carries a prototype `site`
 * block — a `care@…example` address, care hours, and three links to the social
 * platforms' own home pages — plus a rail of three sample announcements, one of
 * which advertises the sample offer. None of that is this house's record:
 * identity and the rail belong to the boundary module `mock/data/site.js` (the
 * port's barrel already exports both from there). The content sheet therefore
 * points at it, and the prototype values do not ship.
 */
const contentFactsRewrite = (file, source) =>
  source
    .replace(
      /\/\* Brand \+ site configuration[\s\S]*?\n\};\n/,
      "import { site } from './site.js';\n\n/* The house's identity and the announcement rail are a boundary concern:\n   see `mock/data/site.js`, this port's own record of both. */\nexport { site };\n",
    )
    .replace(/\nexport const announcements = \[[\s\S]*?\];\n/, "\n")
    /* The trust strip's help line was the design's care hours, which this
       application does not hold. It now names the surface that does exist. */
    .replace(
      "text: site.contact.hours, to: '/pages/contact'",
      "text: 'Reach our team through the contact page', to: '/pages/contact'",
    );

/** Rewrite 7 — THE ART. The design's registry is carried over key-for-key; only
 *  its base path moves, to the plate directory staged for this port (the
 *  application's own media library is never written to). */
const artBaseRewrite = (file, source) => source.replace("const base = '/images/';", "const base = '/design/';");

/**
 * Rewrite 8 — THE FOOTER'S FACTS. The design's footer prints a prototype
 * contact block (a `care@…example` address, care hours) and a prototype
 * disclaimer ("Prototype storefront — sample catalogue, prices and offers").
 * Neither is a business fact here: the address is a placeholder, and this
 * application does sell. The contact lines render only when the application
 * actually holds the detail, and the signature states nothing it cannot back.
 */
const footerFactsRewrite = (file, source) =>
  source
    .replace(
      "              <li><a href={`mailto:${site.contact.email}`}>{site.contact.email.split('@')[0]}@<wbr />{site.contact.email.split('@')[1]}</a></li>",
      "              {site.contact.email && <li><a href={`mailto:${site.contact.email}`}>{site.contact.email}</a></li>}",
    )
    .replace("              <li>{site.contact.hours}</li>", "              {site.contact.hours && <li>{site.contact.hours}</li>}")
    .replace("              <li>{site.contact.city}</li>", "              {site.contact.city && <li>{site.contact.city}</li>}")
    .replace(
      "<p>© {new Date().getFullYear()} {site.brand}. Prototype storefront — sample catalogue, prices and offers.</p>",
      "<p>© {new Date().getFullYear()} {site.brand}. All rights reserved.</p>",
    );

/**
 * Rewrite 9 — LIVE CURATION. The design's lookbooks name four sample pieces by
 * id. Those ids do not exist in this catalogue, and inventing replacements for
 * them would be inventing merchandise: the sections ask the live catalogue for
 * the same thing the design asked its sample data for — the first four pieces
 * of the edit — and render however many come back (zero included).
 */
const sareeCurationRewrite = (file, source) =>
  source.replace(
    "  const row = getByIds(['p02', 'p01', 'p14', 'p17']);",
    "  const row = getProductsFor('sarees').slice(0, 4);",
  );

const kurtiCurationRewrite = (file, source) =>
  source
    .replace("const PAIRINGS = ['p19', 'p18', 'p14', 'p17'];", "const PAIRING_KEYS = ['kurtis'];")
    .replace("const fill = getByIds(PAIRINGS)", "const fill = PAIRING_KEYS.flatMap(getProductsFor)");

/** Rewrite 10 — THE BARREL. `site` (brand + contact details) and the
 *  announcement lines come from the application's own configuration; every
 *  other export is the design's own editorial content, unchanged. */
const barrelRewrite = (file, source) => {
  const pattern = /^export \{[\s\S]*?\} from '\.\.\/mock\/data\/content\.js';$/m;
  const match = source.match(pattern);
  if (!match) return source;
  const names = match[0]
    .replace(/^export \{/, "")
    .replace(/\} from '\.\.\/mock\/data\/content\.js';$/, "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const editorial = names.filter((name) => name !== "site" && name !== "announcements");
  return source.replace(
    match[0],
    `export { site, announcements } from '../mock/data/site.js';\nexport {\n  ${editorial.join(", ")},\n} from '../mock/data/content.js';`,
  );
};

/**
 * Rewrite 11 — THE LIVE CATALOGUE'S REVISION. The design's catalogue is a
 * synchronous array it ships with, so a section can read it inside a `useMemo`
 * and be right for the life of the page. This application's catalogue arrives
 * from the backend AFTER mount, so a memo keyed on UI state alone freezes the
 * first, empty snapshot. Measured in the browser (catalogue served six
 * seconds late): the Bestsellers rail still read "No pieces in this
 * filter yet." ten seconds in, and the jewellery theatre still counted zero,
 * while the un-memoised rails beside them had rendered every live piece. The
 * four components below take the revision the port's own catalogue boundary
 * publishes (`mock/data/products.js`) and depend on it, so a memoised read is
 * invalidated exactly when the live catalogue changes — the same seam this
 * application's own homepage uses (`hooks/useCatalog.js`).
 */
const CATALOGUE_IMPORT = /^(import \{[^}]*\} from '\.\.\/\.\.\/services\/catalog\.js';)$/m;

/** The one-line subscription, and why it has to be there. Read by all four. */
const CATALOGUE_REVISION_COMMENT =
  "  /* The live catalogue arrives from the backend after mount, so this memo\n" +
  "     depends on the revision its boundary module publishes. */";

/* ── Rewrite 18 · THE PRODUCT PAGE (Phase 6) ────────────────────────────────
 *
 * The design's product page assumes its sample catalogue is already in memory:
 * `getProductBySlug(slug)` returning `null` means "no such piece", every piece
 * is buyable, the quantity stepper stops at a fixed ten, and the care and
 * delivery accordions carry prototype prose.
 *
 * On this surface none of that is true — the catalogue is fetched after mount,
 * availability and stock are real, and the catalogue publishes its own care,
 * delivery and return copy. So the page is adapted in three ways, and only
 * these:
 *
 *   · LIVE CATALOGUE + ITS STATE. The application's product route is keyed by
 *     id (`:productId`), the design's by `:slug`; the boundary accepts either.
 *     It also reports whether the catalogue is still arriving or unreachable,
 *     so "the catalogue has not loaded" and "there is no such piece" stay two
 *     different pages — the design could conflate them, this surface cannot.
 *   · REAL AVAILABILITY. The ceiling is the catalogue's own
 *     (`maxQuantity`, computed by this application's `getMaxQuantity`), the
 *     stepper stops there instead of at ten, and a piece the catalogue marks
 *     unavailable says so and cannot be added — the same words and the same
 *     refusal the production product page uses. The prototype note ("price and
 *     availability are sample data") is replaced by the piece's real
 *     availability, which is what that slot is for.
 *   · REAL DETAIL COPY. Care, delivery and returns come from the catalogue
 *     record. The design's generic sentence stays only where the catalogue
 *     publishes nothing, and `details`/`specifications` gain the accordion the
 *     production page has for them.
 *
 * Two state components are appended (function declarations, so they hoist):
 * the loading and unreachable states the design's synchronous catalogue never
 * needed. They use the design's own classes and its own retry language.
 */
const PDP_EDITS = [
  /* 1 · the lookup, and the state it can be in */
  [
    "import { getProductBySlug, getRelated, getTitleFor, requiresOption } from '../services/catalog.js';",
    "import { getRelated, getTitleFor, requiresOption } from '../services/catalog.js';\n" +
    "import { retryCatalogue, useCatalogueProduct } from '../mock/data/products.js';\n" +
    "import Button from '../components/ui/Button.jsx';",
  ],
  [
    "  const { slug } = useParams();\n  const product = getProductBySlug(slug);",
    "  /* This application's product route is keyed by id (`:productId`); the\n" +
    "     design's is `:slug`. Accept either, and let the boundary resolve it\n" +
    "     against the live catalogue — which also reports whether the catalogue\n" +
    "     is still arriving or unreachable, so \"no such piece\" stays a real 404. */\n" +
    "  const params = useParams();\n" +
    "  const slug = params.productId ?? params.slug ?? '';\n" +
    "  const { product, state } = useCatalogueProduct(slug);",
  ],
  /* 2 · a stock drop must not leave a quantity the piece cannot supply */
  [
    "  const add = useAddToBag();",
    "  const add = useAddToBag();\n" +
    "  /* The bagging ceiling moves when the catalogue is refreshed. */\n" +
    "  useEffect(() => {\n" +
    "    if (!product) return undefined;\n" +
    "    setQty((q) => Math.min(q, Math.max(1, product.maxQuantity || 1)));\n" +
    "    return undefined;\n" +
    "  }, [product]);",
  ],
  /* 3 · loading / unreachable / genuinely missing, and the real ceiling */
  [
    "  if (!product) return <NotFound />;",
    "  if (state === 'loading') return <ProductLoading />;\n" +
    "  if (state === 'error') return <ProductUnavailable onRetry={retryCatalogue} />;\n" +
    "  if (!product) return <NotFound />;\n" +
    "\n" +
    "  /* Whether this can be bought, and how many — both from the catalogue\n" +
    "     boundary. `maxQuantity` is this application's own rule. */\n" +
    "  const available = Number(product.maxQuantity) > 0;\n" +
    "  const ceiling = Math.max(1, Number(product.maxQuantity) || 1);\n" +
    "  /* The design's first option group, when the catalogue published one. */\n" +
    "  const optionGroup = requiresOption(product) ? product.options[0] : null;\n" +
    "\n" +
    "  /* ONE AVAILABLE VALUE IS A FORMALITY, NOT A QUESTION.\n" +
    "     The production page needs no size choice for a piece whose sizes are only\n" +
    "     Free Size (`ProductPurchasePanel.jsx::isFreeSizeOnly`), and a port may not\n" +
    "     ask more of a customer than the page it stands in for. A group with one\n" +
    "     available value is therefore preselected — the design's own chip renders as\n" +
    "     chosen — while two or more values still have to be picked, exactly as that\n" +
    "     page requires. */\n" +
    "  const soleValue = optionGroup && optionGroup.values.filter((v) => v.available).length === 1\n" +
    "    ? optionGroup.values.find((v) => v.available).value\n" +
    "    : null;\n" +
    "  const choice = opt ?? soleValue;",
  ],
  /* 4 · the note slot states the real availability, not a prototype warning */
  [
    '            <p className="pdp__sample">Prototype listing — price and availability are sample data.</p>',
    '            <p className="pdp__sample">{product.availabilityCopy}</p>',
  ],
  /* 5 · refuse an unavailable piece before any other check */
  [
    "    if (requiresOption(product) && !opt) { setErr(`Please select a ${product.options[0].name.toLowerCase()} to continue.`); return; }",
    "    if (!available) { setErr('This piece is currently unavailable.'); return; }\n" +
    "    if (optionGroup && !choice) { setErr(`Please select a ${optionGroup.name.toLowerCase()} to continue.`); return; }",
  ],
  /* 5b · the bag is given the choice the chip shows */
  [
    "    add(product, opt, qty);",
    "    add(product, choice, qty);",
  ],
  /* 5c · the design's chips render the effective choice */
  [
    "              <OptionSelector group={product.options[0]} value={opt} onChange={(v) => { setOpt(v); setErr(null); }} error={err} />",
    "              <OptionSelector group={optionGroup} value={choice} onChange={(v) => { setOpt(v); setErr(null); }} error={err} />",
  ],
  /* 6 · the stepper stops at the ceiling, not at ten */
  [
    '                <button type="button" onClick={() => setQty((q) => Math.min(10, q + 1))} disabled={qty >= 10} aria-label="Increase quantity"><Plus size={13} /></button>',
    '                <button type="button" onClick={() => setQty((q) => Math.min(ceiling, q + 1))} disabled={qty >= ceiling} aria-label="Increase quantity"><Plus size={13} /></button>',
  ],
  /* 7 · the buy button says what the catalogue says */
  [
    '              <button type="button" className="btn btn--solid pdp__add" onClick={onAdd}><span>Add to Bag</span></button>',
    '              <button type="button" className="btn btn--solid pdp__add" onClick={onAdd} disabled={!available}><span>{available ? \'Add to Bag\' : \'Currently unavailable\'}</span></button>',
  ],
  /* 9 · fabric and craft, only when the catalogue published them */
  [
    "                <p><strong>Fabric</strong> — {product.fabric}</p>\n                <p><strong>Craft</strong> — {product.craft}</p>",
    "                {product.fabric && <p><strong>Fabric</strong> — {product.fabric}</p>}\n" +
    "                {product.craft && <p><strong>Craft</strong> — {product.craft}</p>}\n" +
    "                {!product.fabric && !product.craft && <p>This piece&rsquo;s fabric and craft notes are not published yet.</p>}",
  ],
  /* 10 · care, from the record */
  [
    "                <p>Dry clean recommended for silks and embellished pieces. Store folded in muslin, away from direct sunlight.</p>",
    "                {product.care.length > 0\n" +
    "                  ? product.care.map((line) => <p key={line}>{line}</p>)\n" +
    "                  : <p>Care guidance for this piece is not published yet.</p>}",
  ],
  /* 11 · delivery and returns, from the record — the design's sentence stands in
         only when the catalogue published nothing */
  [
    '                <p>Delivery timelines are confirmed at checkout. Return eligibility varies by product — see our <Link to="/pages/returns">returns policy</Link>.</p>',
    "                {product.deliveryInfo\n" +
    "                  ? <p>{product.deliveryInfo}</p>\n" +
    "                  : <p>Delivery timelines are confirmed at checkout.</p>}\n" +
    "                {product.returnInfo\n" +
    "                  ? <p>{product.returnInfo}</p>\n" +
    "                  : <p>Return eligibility varies by product — see our <Link to=\"/pages/returns\">returns policy</Link>.</p>}",
  ],
  /* 12 · the details the production page publishes gain their own accordion */
  [
    '            <div className="pdp__accs">',
    '            <div className="pdp__accs">\n' +
    "              {(product.details || Object.keys(product.specifications).length > 0) && (\n" +
    "                <Accordion title=\"Details\">\n" +
    "                  {product.details && <p>{product.details}</p>}\n" +
    "                  {Object.entries(product.specifications).map(([term, value]) => (\n" +
    "                    <p key={term}><strong>{term}</strong> — {value}</p>\n" +
    "                  ))}\n" +
    "                </Accordion>\n" +
    "              )}",
  ],
];

/** The two states the design's synchronous catalogue never needed. */
const PDP_STATES = `
/**
 * The catalogue is fetched after mount, so there is a moment before a piece can
 * be known. The design had no such state; it shows the design's own label and
 * display classes, and nothing is invented while it lasts.
 */
function ProductLoading() {
  return (
    <div className="info container" aria-busy="true">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Loading</span></nav>
      <p className="label">The collection</p>
      <h1 className="display info__title">Opening this piece…</h1>
      <p className="info__lead">Fetching the catalogue.</p>
    </div>
  );
}

/**
 * The catalogue could not be reached. The production product page says the same
 * sentence and offers the same retry, which calls this application's own
 * catalogue refresh — the port does not fetch anything by itself.
 */
function ProductUnavailable({ onRetry }) {
  return (
    <div className="info container empty">
      <p className="label">Something went wrong</p>
      <h1 className="display info__title">We couldn&rsquo;t load this piece.</h1>
      <p className="info__lead">The catalogue is unreachable. Please try again.</p>
      <Button variant="solid" onClick={onRetry}>Try again</Button>
      <Button to="/shop/all" variant="ghost">Return to shop</Button>
    </div>
  );
}
`;

const productPageRewrite = (file, source) => {
  let out = source;
  PDP_EDITS.forEach(([before, after], index) => {
    if (!out.includes(before)) throw new Error(`${file}: PDP_EDITS[${index}] does not match the design file`);
    out = out.replace(before, after);
  });
  return `${out}${PDP_STATES}`;
};

const LIVE_CATALOGUE_EDITS = {
  "components/sections/Bestsellers.jsx": [
    [
      "  const list = useMemo(() => getFeaturedBy(filter, 8), [filter]);",
      `${CATALOGUE_REVISION_COMMENT}\n  const catalogueRevision = useCatalogueRevision();\n` +
        "  const list = useMemo(() => getFeaturedBy(filter, 8), [filter, catalogueRevision]);",
    ],
  ],
  "components/sections/JewelleryTheatre.jsx": [
    [
      "  const all = useMemo(() => getByDepartment('jewellery'), []);",
      `${CATALOGUE_REVISION_COMMENT}\n  const catalogueRevision = useCatalogueRevision();\n` +
        "  const all = useMemo(() => getByDepartment('jewellery'), [catalogueRevision]);",
    ],
  ],
  "components/sections/KurtiLookbook.jsx": [
    [
      "  const items = useMemo(() => {",
      `${CATALOGUE_REVISION_COMMENT}\n  const catalogueRevision = useCatalogueRevision();\n  const items = useMemo(() => {`,
    ],
    ["  }, [active]);", "  }, [active, catalogueRevision]);"],
  ],
  "components/shopping/SearchOverlay.jsx": [
    [
      "  const results = useMemo(() => searchProducts(debounced, 6), [debounced]);\n  const cats = useMemo(() => searchCategories(debounced), [debounced]);",
      `${CATALOGUE_REVISION_COMMENT}\n  const catalogueRevision = useCatalogueRevision();\n` +
        "  const results = useMemo(() => searchProducts(debounced, 6), [debounced, catalogueRevision]);\n" +
        "  const cats = useMemo(() => searchCategories(debounced), [debounced, catalogueRevision]);",
    ],
  ],
};

const liveCatalogueRewrite = (file, source) => {
  let out = source.replace(
    CATALOGUE_IMPORT,
    "$1\nimport { useCatalogueRevision } from '../../mock/data/products.js';",
  );
  for (const [before, after] of LIVE_CATALOGUE_EDITS[file] ?? []) out = out.replace(before, after);
  return out;
};

/**
 * Rewrite 12 — THE MISSING PLATE. A catalogue photograph is addressed by a URL
 * this application's media layer issues; when that URL cannot be loaded, the
 * browser paints its own broken-image icon and the alt text inside the frame.
 * Measured in the browser: a card whose plate 404s showed a broken glyph and
 * the product's name over the toned plate, where a product with no image at all
 * renders the design's reserved background cleanly. Every ported surface that
 * renders a catalogue plate therefore attaches the same fallback, which drops
 * the failed element and leaves the plate exactly as an image-less product
 * leaves it. Nothing is substituted: no placeholder file, no second request.
 */
const MEDIA_FALLBACK_FILES = [
  "components/product/ProductCard.jsx",
  "components/sections/JewelleryTheatre.jsx",
  "components/shopping/CartDrawer.jsx",
  "components/shopping/QuickViewModal.jsx",
  "components/shopping/SearchOverlay.jsx",
  "pages/Product.jsx",
];

const MEDIA_FALLBACK_EDITS = [
  [
    '<img className="pcard__img" src={product.images[0]} alt={product.name} loading="lazy" decoding="async" />',
    '<img className="pcard__img" src={product.images[0]} alt={product.name} loading="lazy" decoding="async" onError={hideBrokenMedia} />',
  ],
  [
    '<img className="pcard__img pcard__img--alt" src={product.images[1]} alt="" aria-hidden="true" loading="lazy" decoding="async" />',
    '<img className="pcard__img pcard__img--alt" src={product.images[1]} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={hideBrokenMedia} />',
  ],
  [
    "<img src={spot.images[0]} alt={spot.name} style={{ transform: 'none' }} />",
    "<img src={spot.images[0]} alt={spot.name} style={{ transform: 'none' }} onError={hideBrokenMedia} />",
  ],
  [
    "<img src={l.product.images[0]} alt={l.product.name} />",
    "<img src={l.product.images[0]} alt={l.product.name} onError={hideBrokenMedia} />",
  ],
  [
    "<motion.img key={imgIdx} src={product.images[imgIdx]} alt={product.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />",
    "<motion.img key={imgIdx} src={product.images[imgIdx]} alt={product.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onError={hideBrokenMedia} />",
  ],
  ['<img src={src} alt="" />', '<img src={src} alt="" onError={hideBrokenMedia} />'],
  ['<img src={p.images[0]} alt="" />', '<img src={p.images[0]} alt="" onError={hideBrokenMedia} />'],
  [
    '<img src={src} alt={i === 0 ? product.name : `${product.name} — detail`} />',
    '<img src={src} alt={i === 0 ? product.name : `${product.name} — detail`} onError={hideBrokenMedia} />',
  ],
];

const mediaFallbackRewrite = (file, source) => {
  /* The port keeps the design's directory layout, so a file's depth is where it
     sits: `components/product/*` and `components/shopping/*` are two levels
     under the port root, `pages/*` is one. The import has to match, and it is
     derived rather than written twice. */
  const up = "../".repeat(file.split("/").length - 1);
  let out = source.replace(
    /^(import [^\n]*;\n)/m,
    `$1import { hideBrokenMedia } from '${up}utils/mediaFallback.js';\n`,
  );
  for (const [before, after] of MEDIA_FALLBACK_EDITS) out = out.replace(before, after);
  return out;
};

/**
 * Rewrite 13 — THE BESTSELLERS NOTE. The design's rail reads its own sample
 * catalogue, and its note says so on screen: "A curated selection from our
 * sample catalogue — not a verified sales ranking." On this surface the rail
 * reads the house's catalogue, so the first half of that sentence is false, and
 * the word "sample" must not reach a customer. The disclaimer stays — the rail
 * shows the pieces the business flagged featured or bestseller, which is not a
 * sales ranking — and it says what this application's own homepage says of the
 * same rail (`components/storefront/home-sections/sectionData.js`,
 * `SECTION_COPY.rail.note`): the backend exposes no verified ranking yet.
 */
const bestsellersNoteRewrite = (file, source) =>
  source.replace(
    "A curated selection from our sample catalogue — not a verified sales ranking.",
    "A selection from the house catalogue — the backend does not yet expose a verified sales ranking.",
  );

/* ── Rewrite 20 · THE SHOP / LISTING / SEARCH PAGE (Phase 7) ────────────────
 *
 * The design's `Shop.jsx` is one page for two surfaces (`/shop/:category` and
 * `/search`), and it answers both from the sample catalogue it ships with: a
 * synchronous array it filters with `getProductsFor`, sorts with four local
 * comparators, narrows with a `?type=` chip row and prints in one grid.
 *
 * This application's listing space is larger, and every part of it is already
 * implemented somewhere else, so the page is adapted in four ways and only
 * these:
 *
 *   · THE SCOPE. `/shop`, `/explore`, `/search`, `/category/:slug`,
 *     `/collections/:slug` and the navigation-scope register are this
 *     application's listing paths. `components/shop/listingScope.js` resolves
 *     each one through the same registers `pages/CatalogueListing.jsx` reads,
 *     and a path with no scope is the design's 404 rather than an invented page.
 *   · THE ENGINE. Products, filters, sorting, search and pagination come from
 *     `hooks/useCatalogueQuery` — the hook every production listing uses — so a
 *     ported and a production listing answer one URL with one result set. The
 *     design's local `?type=` chip filter has no server-side counterpart; the
 *     chip row instead carries the application's sibling-category tabs
 *     (`deriveTabs`), and the facets the catalogue declares are rendered in the
 *     design's chip-and-drawer vocabulary (`components/shop/ListingControls.jsx`).
 *   · THE CARD. The design's `ProductCard` takes the design's product shape, so
 *     each API record is mapped through the port's existing catalogue boundary
 *     (`toDesignProduct`), its plates come from the canonical product media set
 *     (`useProductCovers`) and its stock state and offer badge from the
 *     application's own inventory and offer register — the same three sources
 *     the production grid's cards read.
 *   · THE STATES THE DESIGN NEVER HAD. A fetched catalogue has a first-fetch
 *     state, an unreachable state with a retry, a filtered-to-zero state, and —
 *     because the backend pages server-side — a Load more that reports how much
 *     of the result set is on screen.
 *
 * `/explore` keeps its own page size and its own advertisement/editorial stream
 * (`buildExploreStream`, placed by the application, resolved from the placement
 * register), never from a product plate.
 */
const SHOP_EDITS = [
  [
    "import { useMemo } from 'react';\nimport { useParams, useSearchParams } from 'react-router-dom';\nimport { Link } from '../router/index.jsx';\nimport { AnimatePresence, motion } from 'framer-motion';\nimport { getProductsFor, getTitleFor, searchProducts, sortProducts } from '../services/catalog.js';\nimport ProductCard from '../components/product/ProductCard.jsx';\nimport Button from '../components/ui/Button.jsx';\nimport { cx } from '../utils/format.js';",
    "import { useMemo, useState } from 'react';\nimport { useLocation, useParams, useSearchParams } from 'react-router-dom';\nimport { Link } from '../router/index.jsx';\nimport { AnimatePresence, motion } from 'framer-motion';\nimport { getTitleFor } from '../services/catalog.js';\nimport ProductCard from '../components/product/ProductCard.jsx';\nimport Button from '../components/ui/Button.jsx';\nimport { cx } from '../utils/format.js';\nimport { hideBrokenMedia } from '../utils/mediaFallback.js';\n/* ── this application's own listing engine, reused rather than re-written ─── */\nimport useCatalogueQuery from '../../../hooks/useCatalogueQuery.js';\nimport { useCatalog } from '../../../hooks/useCatalog.js';\nimport { useProductCovers } from '../../../hooks/useMedia.js';\nimport { useInventory } from '../../../context/InventoryContext.jsx';\nimport { buildFacets } from '../../../data/products/facets.js';\nimport { sortOptions } from '../../../data/products/taxonomy.js';\nimport { searchSuggestions } from '../../../config/navigationConfig.js';\nimport { EXPLORE_PAGE_SIZE, buildExploreStream, getExploreOffers } from '../../../data/products/explore.js';\nimport offerRepository, { formatOfferDiscount } from '../../../services/offers/offerRepository.js';\nimport { resolveExploreEditorialMedia, resolveExplorePromoMedia } from '../../../services/explore/explorePlacements.js';\nimport { deriveTabs } from '../../../components/storefront/CategoryTabs.jsx';\nimport { normalizeMediaReference } from '../../../services/media/mediaPaths.js';\nimport { listingBreadcrumb, resolveListingScope } from '../components/shop/listingScope.js';\nimport ListingControls from '../components/shop/ListingControls.jsx';\nimport { toDesignProduct, useCatalogueRevision } from '../mock/data/products.js';\nimport NotFound from './NotFound.jsx';",
  ],
  [
    "const SORTS = [\n  { key: 'featured', label: 'Featured' },\n  { key: 'price-asc', label: 'Price: low to high' },\n  { key: 'price-desc', label: 'Price: high to low' },\n  { key: 'name', label: 'Name A–Z' },\n];",
    "/* The design offers four comparators. This application's register declares\n   eight (`sortOptions`), and its listings have always honoured all of them, so\n   the select below is the design's markup carrying the register's list. */\nconst SORT_OPTIONS = sortOptions.map((option) => ({ key: option.id, label: option.label }));",
  ],
  [
    "export default function Shop({ mode = 'category' }) {\n  const { category = 'all' } = useParams();\n  const [params, setParams] = useSearchParams();\n  const q = params.get('q') || '';\n  const sort = params.get('sort') || 'featured';\n  const type = params.get('type') || 'all';\n\n  const base = useMemo(() => (mode === 'search' ? searchProducts(q, 60) : getProductsFor(category)), [mode, q, category]);\n  const types = useMemo(() => [...new Set(base.map((p) => p.type))], [base]);\n  const list = useMemo(() => sortProducts(type === 'all' ? base : base.filter((p) => p.type === type), sort), [base, type, sort]);\n\n  const set = (k, v) => { const n = new URLSearchParams(params); if (v === 'all' || v === 'featured') n.delete(k); else n.set(k, v); setParams(n, { replace: true }); };\n  const title = mode === 'search' ? `“${q}”` : getTitleFor(category);",
    "export default function Shop({ mode = 'category' }) {\n  const route = useParams();\n  const { pathname } = useLocation();\n  const [params] = useSearchParams();\n  const q = params.get('q') || '';\n\n  /* The taxonomy arrives with the catalogue, so the page has to re-render when\n     it does — the same subscription every production listing takes. */\n  useCatalog();\n\n  /* Categories and collections arrive with the catalogue, so the scope has to\n     be resolved again when it does: without the revision in the dependencies a\n     `/category/:slug` visited before hydration keeps the answer the empty\n     registers gave it — which is the 404 — for the life of the page. (A browser\n     run caught exactly that; the unit harness seeds the store first and could\n     not.) */\n  const catalogueRevision = useCatalogueRevision();\n  const scope = useMemo(\n    () => resolveListingScope({ mode, slug: route.slug ?? '', pathname }),\n    [mode, route.slug, pathname, catalogueRevision],\n  );\n\n  const {\n    filters,\n    sort,\n    activeChips,\n    activeCount,\n    visible,\n    total,\n    scoped,\n    isFetching,\n    error,\n    retry,\n    toggleFilter,\n    removeFilter,\n    clearFilters,\n    setSort,\n    setSearch,\n    loadMore,\n    hasMore,\n    remaining,\n  } = useCatalogueQuery({\n    scopeFilters: scope?.filters ?? {},\n    searchFromUrl: mode === 'search' || mode === 'explore',\n    pageSize: mode === 'explore' ? EXPLORE_PAGE_SIZE : undefined,\n  });\n\n  /* Facets are counted against what this route contains, never the whole\n     catalogue — a category page never offers a filter that would empty it. */\n  const facets = useMemo(\n    () => buildFacets(scoped, filters, scope?.filters ?? {}),\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n    [scoped, JSON.stringify(filters), JSON.stringify(scope?.filters)],\n  );\n\n  /* The production grid resolves each card's plates from the canonical product\n     media set, and asks the inventory and the offer register what the card may\n     say; the port renders the design's card, so the two views of one record are\n     joined here rather than derived twice. */\n  const inventory = useInventory();\n  const covered = useProductCovers(visible);\n  const cards = useMemo(\n    () => covered\n      .map((row) => {\n        const product = toDesignProduct(row);\n        if (!product) return null;\n        const availability = inventory.getAvailability(row);\n        /* `useProductCovers` answers with the canonical media records\n           (`{ id, src, … }`); the design's card draws URL strings. The\n           conversion is this application's own single resolver — the same\n           one every production image goes through — never a second one. */\n        const plates = [row.image, row.hoverImage]\n          .map((plate) => normalizeMediaReference(plate))\n          .filter(Boolean);\n        return {\n          ...product,\n          ...(plates.length ? { images: plates } : {}),\n          inStock: availability.tracked ? availability.available > 0 : product.inStock,\n          availabilityText: !availability.tracked\n            ? ''\n            : availability.status === 'LOW_STOCK'\n              ? 'Only a few left'\n              : availability.available <= 0\n                ? 'Currently unavailable'\n                : '',\n          offerBadge: offerRepository.getProductOfferBadge(row)?.label ?? null,\n        };\n      })\n      .filter(Boolean),\n    [covered, inventory],\n  );\n\n  /* Explore keeps its own page size and its own stream: an offer banner and an\n     editorial frame, placed by this application's own `buildExploreStream` and\n     resolved from the placement register, never from a product plate. */\n  const offers = useMemo(\n    () => (mode === 'explore' ? getExploreOffers() : []),\n    [mode, catalogueRevision],\n  );\n  const inserts = useMemo(() => {\n    const used = new Set();\n    const lead = (offers || []).find((offer) => offer.type === 'PERCENTAGE') || offers?.[0];\n    return {\n      promo: {\n        image: resolveExplorePromoMedia(used),\n        eyebrow: 'House offer',\n        title: lead ? lead.name : 'The season\\u2019s edit',\n        description: lead\n          ? `${lead.description} \\u00b7 ${formatOfferDiscount(lead)} with ${lead.code}`\n          : 'Selected pieces from the atelier, gathered in one place.',\n        to: lead?.includedCollections?.[0]\n          ? `/explore?collection=${encodeURIComponent(\n              lead.includedCollections[0] === 'festive-edit' ? 'Festive Edit' : lead.includedCollections[0],\n            )}`\n          : '/explore?merch=sale',\n        cta: 'Shop offers',\n      },\n      editorial: {\n        image: resolveExploreEditorialMedia(used),\n        eyebrow: 'Editorial',\n        title: 'Heritage weaves',\n        description: 'Sarees, lehengas and ceremonial pieces drawn from the house collections.',\n        to: '/explore?category=sarees',\n        cta: 'Explore sarees',\n      },\n    };\n  }, [offers]);\n  const stream = useMemo(\n    () => (mode === 'explore' ? buildExploreStream(cards) : cards.map((card) => ({ type: 'product', product: card, key: `product-${card.id}` }))),\n    [mode, cards],\n  );\n\n  const tabs = useMemo(() => deriveTabs(scope?.filters ?? {}), [scope?.filters]);\n  const [draft, setDraft] = useState(q);\n  const submitSearch = (event) => { event.preventDefault(); setSearch(draft); };\n  const isCurrent = (to) => String(to ?? '').replace(/\\/$/, '') === pathname.replace(/\\/$/, '');\n\n  /* The design titled a search by its term. The application's own search page\n     names an empty search (`Find your piece`), so the port keeps both. */\n  const title = mode === 'search'\n    ? (q ? `“${q}”` : 'Find your piece')\n    : scope?.title ?? getTitleFor('all');\n  const eyebrow = mode === 'search' ? 'Search results' : scope?.eyebrow ?? 'Shop';\n  const crumbs = mode === 'search' ? [{ label: 'Search' }] : listingBreadcrumb(scope, mode);\n  const firstFetch = isFetching && visible.length === 0;",
  ],
  [
    "  return (\n    <div className=\"shop container\">\n      <nav className=\"crumbs\" aria-label=\"Breadcrumb\"><Link to=\"/\">Home</Link><span>/</span><span aria-current=\"page\">{mode === 'search' ? 'Search' : title}</span></nav>",
    "  /* A path this application serves no listing on has no edit to draw: the\n     production page answers those with its own 404, and so does this one. */\n  if (!scope) return <NotFound />;\n\n  return (\n    <div className=\"shop container\">\n      <nav className=\"crumbs\" aria-label=\"Breadcrumb\">\n        <Link to=\"/\">Home</Link>\n        {crumbs.map((crumb) => (\n          <span className=\"crumbs__step\" key={`${crumb.label}-${crumb.to ?? ''}`}>\n            <span>/</span>\n            {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current=\"page\">{crumb.label}</span>}\n          </span>\n        ))}\n      </nav>",
  ],
  [
    "      <header className=\"shop__head\">\n        <p className=\"label\">{mode === 'search' ? 'Search results' : 'Shop'}</p>\n        <h1 className=\"display shop__title\">{title}</h1>\n        <p className=\"shop__count\">{list.length} {list.length === 1 ? 'piece' : 'pieces'}</p>\n      </header>",
    "      <header className=\"shop__head\">\n        <p className=\"label\">{eyebrow}</p>\n        <h1 className=\"display shop__title\">{title}</h1>\n        {/* The count is the backend's own filtered total, not the length of the\n            page on screen — the two differ as soon as a listing pages. */}\n        <p className=\"shop__count\">{firstFetch ? 'Loading…' : `${total} ${total === 1 ? 'piece' : 'pieces'}`}</p>\n      </header>\n\n      {/* Search, on the two surfaces this application searches from: `/search`\n          itself and Explore, whose query has always read `?q=` too. The design\n          draws no search field on its shop — the application's own overlay does\n          that on every other page — so the field is the design's `.search__form`\n          (its overlay's), and the suggestions are the shell's own. */}\n      {(mode === 'search' || mode === 'explore') && (\n        <div className=\"listing-search\">\n          <form className=\"search__form\" role=\"search\" onSubmit={submitSearch}>\n            <input\n              type=\"search\"\n              value={draft}\n              onChange={(event) => setDraft(event.target.value)}\n              placeholder=\"Search the catalogue…\"\n              aria-label=\"Search the catalogue\"\n            />\n            <button type=\"submit\" className=\"listing-search__submit\">Search</button>\n          </form>\n          {!q && mode === 'search' && (\n            <div className=\"listing-search__suggestions\">\n              {searchSuggestions.map((suggestion) => (\n                <button\n                  key={suggestion}\n                  type=\"button\"\n                  className=\"chip chip--sm\"\n                  onClick={() => { setDraft(suggestion); setSearch(suggestion); }}\n                >\n                  {suggestion}\n                </button>\n              ))}\n            </div>\n          )}\n        </div>\n      )}\n\n      {/* Explore's house offers, from the offer register, in the design's chip. */}\n      {mode === 'explore' && offers.length > 0 && (\n        <div className=\"shop__types\" role=\"group\" aria-label=\"House offers\">\n          {offers.map((offer) => (\n            <Link key={offer.id} to={`/explore?q=${encodeURIComponent(offer.code)}`} className=\"chip\">\n              {offer.code} · {formatOfferDiscount(offer)}\n            </Link>\n          ))}\n        </div>\n      )}",
  ],
  [
    "      {base.length > 0 && (\n        <div className=\"shop__bar\">\n          <div className=\"shop__types\" role=\"group\" aria-label=\"Filter by type\">\n            <button type=\"button\" className={cx('chip', type === 'all' && 'is-active')} onClick={() => set('type', 'all')}>All</button>\n            {types.length > 1 && types.map((t) => (\n              <button key={t} type=\"button\" className={cx('chip', type === t && 'is-active')} onClick={() => set('type', t)}>{getTitleFor(t)}</button>\n            ))}\n          </div>\n          <label className=\"shop__sort\">\n            <span>Sort</span>\n            <select value={sort} onChange={(e) => set('sort', e.target.value)}>\n              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}\n            </select>\n          </label>\n        </div>\n      )}",
    "      {/* The design's type chips were a local view of one array. This\n          application's sibling levels are links (`deriveTabs`, the same\n          derivation the production header uses), so the row is the design's\n          chip carrying the taxonomy's own destinations. */}\n      {tabs.tabs.length > 0 && (\n        <div className=\"shop__bar\">\n          <div className=\"shop__types\" role=\"group\" aria-label=\"Categories\">\n            <Link to={tabs.parentPath} className={cx('chip', isCurrent(tabs.parentPath) && 'is-active')}>{tabs.allLabel}</Link>\n            {tabs.tabs.map((tab) => (\n              <Link key={tab.id} to={tab.to} className={cx('chip', isCurrent(tab.to) && 'is-active')}>{tab.label}</Link>\n            ))}\n          </div>\n        </div>\n      )}\n\n      <div className=\"shop__bar\">\n        <ListingControls\n          facets={facets}\n          filters={filters}\n          activeChips={activeChips}\n          activeCount={activeCount}\n          onToggle={toggleFilter}\n          onRemove={removeFilter}\n          onClear={clearFilters}\n          resultCount={total}\n        />\n        <label className=\"shop__sort\">\n          <span>Sort</span>\n          <select value={sort} onChange={(e) => setSort(e.target.value)}>\n            {SORT_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}\n          </select>\n        </label>\n      </div>",
  ],
  [
    "      {list.length === 0 ? (\n        <div className=\"empty\">\n          <p className=\"empty__title\">{mode === 'search' ? 'Nothing matched that search.' : 'This edit is being photographed.'}</p>\n          <p>{mode === 'search' ? 'Try “silk”, “bridal”, “kurta” or “jhumka”.' : 'Pieces for this collection arrive soon. Meanwhile, explore the full catalogue.'}</p>\n          <Button to=\"/shop/all\">Browse all pieces</Button>\n        </div>\n      ) : (\n        <motion.div className=\"grid-4\" layout>\n          <AnimatePresence mode=\"popLayout\" initial={false}>\n            {list.map((p) => (\n              <motion.div key={p.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>\n                <ProductCard product={p} />\n              </motion.div>\n            ))}\n          </AnimatePresence>\n        </motion.div>\n      )}",
    "      {error ? (\n        <ListingUnavailable onRetry={retry} />\n      ) : firstFetch ? (\n        <ListingLoading />\n      ) : total === 0 ? (\n        <div className=\"empty\">\n          {/* The design's own empty copy, and one case the design never had: a\n              listing the shopper's own filters emptied (that one offers the\n              engine's `clearFilters` rather than prose about photographs). */}\n          <p className=\"empty__title\">\n            {mode === 'search'\n              ? 'Nothing matched that search.'\n              : activeCount > 0\n                ? 'Nothing matches these filters.'\n                : 'This edit is being photographed.'}\n          </p>\n          <p>\n            {mode === 'search'\n              ? 'Try “silk”, “bridal”, “kurta” or “jhumka”.'\n              : activeCount > 0\n                ? 'Clear a filter to see more of this edit.'\n                : 'Pieces for this collection arrive soon. Meanwhile, explore the full catalogue.'}\n          </p>\n          {activeCount > 0 ? <Button onClick={clearFilters}>Clear filters</Button> : null}\n          <Button to=\"/shop/all\">Browse all pieces</Button>\n        </div>\n      ) : (\n        <>\n          <motion.div className=\"grid-4\" layout>\n            <AnimatePresence mode=\"popLayout\" initial={false}>\n              {stream.map((entry) => (\n                <motion.div key={entry.key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>\n                  {entry.type === 'product'\n                    ? <ProductCard product={entry.product} />\n                    : <ListingInsert {...(entry.type === 'promo' ? inserts.promo : inserts.editorial)} />}\n                </motion.div>\n              ))}\n            </AnimatePresence>\n          </motion.div>\n\n          {/* The backend pages server-side, so the listing says how much of the\n              result set is on screen — the production listing's own wording. */}\n          {hasMore ? (\n            <div className=\"listing-more\">\n              <Button variant=\"solid\" onClick={loadMore}>Load more</Button>\n              <p className=\"listing-more__note\">{`Showing ${visible.length} of ${total} · ${remaining} more`}</p>\n            </div>\n          ) : total > 12 ? (\n            <p className=\"listing-tail\">{`That is all ${total} ${total === 1 ? 'piece' : 'pieces'} in this edit.`}</p>\n          ) : null}\n        </>\n      )}",
  ],
];

/** The two states the design's shop never needed, and Explore's insert. */
const SHOP_STATES = `
/* ── the states a fetched catalogue has, in the design's own vocabulary ───── */

/* The design's catalogue was an array it shipped with: it had no first fetch and
   no failure, so its shop drew neither. Both are written here out of the
   design's own blocks — its grid for the plates that are coming, its \`.empty\`
   for the edit that would not load — and neither invents a product, a price or a
   stock figure. The retry is this application's own (\`useCatalogueQuery.retry\`). */

function ListingLoading() {
  return (
    <div className="listing-skeleton" aria-busy="true" aria-label="Loading this edit">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
        <div key={index}>
          <div className="listing-skeleton__plate" />
          <div className="listing-skeleton__line" />
        </div>
      ))}
    </div>
  );
}

function ListingUnavailable({ onRetry }) {
  return (
    <div className="empty">
      <p className="empty__title">We couldn&rsquo;t load this edit.</p>
      <p>The catalogue is unreachable from here. Try again in a moment.</p>
      <Button onClick={onRetry}>Try again</Button>
      <Button to="/shop/all">Browse all pieces</Button>
    </div>
  );
}

/* An Explore insert: an advertisement or an editorial frame from the placement
   register, spanning the design's grid. It carries no product and no price, and
   a placement the register holds no live media for renders nothing at all —
   which is what the production Explore grid does with the same resolver. */
function ListingInsert({ image, eyebrow, title, description, to, cta }) {
  if (!image?.src) return null;
  return (
    <Link to={to} className="listing-insert">
      <img className="listing-insert__media" src={image.src} alt={image.alt ?? ''} loading="lazy" decoding="async" onError={hideBrokenMedia} />
      <div>
        <p className="label">{eyebrow}</p>
        <p className="listing-insert__title">{title}</p>
        <p className="listing-insert__body">{description}</p>
        <span className="listing-insert__cta">{cta}</span>
      </div>
    </Link>
  );
}
`;

/**
 * The rewrite. Every edit is required to match: a rewrite that silently skipped
 * one would leave the page half-adapted, and a half-adapted page still renders
 * — the one kind of failure that survives a screenshot. The two state
 * components are appended (function declarations hoist, so the order they are
 * written in does not matter).
 */
const shopListingRewrite = (file, source) => {
  let out = source;
  SHOP_EDITS.forEach(([before, after], index) => {
    if (!out.includes(before)) throw new Error(`${file}: SHOP_EDITS[${index}] does not match the design file`);
    out = out.replace(before, after);
  });
  return `${out}${SHOP_STATES}`;
};

/* ── PHASE 8 · THE WISHLIST PAGE ─────────────────────────────────────────── */

/**
 * The design's wishlist is three lines of prototype logic over its own bundled
 * catalogue (`getByIds(wishlist)`), plus one sentence that is false here: "saved
 * on this device". This application's list is real — server-backed when the
 * shopper is signed in, client-only when they are not — and it has three states
 * the design never drew (a first fetch, an unreachable list, and a saved piece
 * the catalogue no longer resolves).
 *
 * The edits keep the design's page, its markup, its header and its card, and
 * bind them to `WishlistContext` / `ShoppingContext`. Nothing is re-derived: the
 * cards are the design's own `ProductCard`, the plates come from
 * `useProductCovers` (the canonical media set), the records from
 * `toDesignProduct`, availability from the catalogue record, and the variant
 * rule from `requiresVariantChoice` — this application's own, the same one the
 * production wishlist applies.
 */
const WISHLIST_EDITS = [
  [
    "import { Link } from '../router/index.jsx';\nimport { useShop } from '../state/ShopContext.jsx';\nimport { getByIds } from '../services/catalog.js';\nimport ProductCard from '../components/product/ProductCard.jsx';\nimport Button from '../components/ui/Button.jsx';",
    "import { useEffect, useState } from 'react';\nimport { Link } from '../router/index.jsx';\nimport { useNavigate } from 'react-router-dom';\nimport { useAuth } from '../../../context/AuthContext.jsx';\nimport { useWishlist } from '../../../context/WishlistContext.jsx';\nimport { useShopping } from '../../../context/ShoppingContext.jsx';\nimport { useProductCovers } from '../../../hooks/useMedia.js';\nimport { normalizeMediaReference } from '../../../services/media/mediaPaths.js';\nimport { productHref } from '../../../data/products/index.js';\nimport { requiresVariantChoice } from '../../../utils/shopping.js';\nimport AccountFrame from './account/AccountFrame.jsx';\nimport ProductCard from '../components/product/ProductCard.jsx';\nimport Button from '../components/ui/Button.jsx';\nimport { toDesignProduct } from '../mock/data/products.js';\nimport { useUI } from '../state/UIContext.jsx';",
  ],
  [
    "export default function Wishlist() {\n  const { wishlist } = useShop();\n  const list = getByIds(wishlist);",
    "export default function Wishlist() {\n  const { isAuthenticated } = useAuth();\n  const wishlist = useWishlist();\n  /* The move between the bag and the list, from this application's own\n     shopping state \u2014 the same action the production wishlist calls. */\n  const { moveToCart } = useShopping();\n  /* The port's own drawer: the design's shell holds the bag, so a piece that\n     has just been added is shown in it \u2014 the same move the production\n     wishlist makes with the application's mini-cart. */\n  const { openCart } = useUI();\n  const navigate = useNavigate();\n  const [feedback, setFeedback] = useState(null);\n\n  /* A confirmation is a moment, not a permanent note \u2014 the production page\n     clears its own after four seconds, and so does this one. */\n  useEffect(() => {\n    if (!feedback) return undefined;\n    const timer = setTimeout(() => setFeedback(null), 4200);\n    return () => clearTimeout(timer);\n  }, [feedback]);\n\n  /* The tab title, exactly as the production wishlist states it. */\n  useEffect(() => {\n    const previous = document.title;\n    document.title = 'Wishlist \u2014 PRATIKSHYA FASHION';\n    return () => { document.title = previous; };\n  }, []);\n\n  /* Saved pieces, resolved by the wishlist itself; the cards' plates come from\n     the canonical media set. `useProductCovers` is a hook, so it is asked once\n     for the whole list \u2014 never once per card. */\n  const entries = wishlist.entries;\n  const covered = useProductCovers(entries.map((entry) => entry.product).filter(Boolean));\n  const plateFor = (id) => covered.find((row) => String(row.id) === String(id)) ?? null;\n\n  const count = wishlist.count;\n  const countLabel = `${count} ${count === 1 ? 'piece' : 'pieces'} saved`;\n  const firstLoad = wishlist.isLoading && count === 0;\n  const failed = Boolean(wishlist.error) && count === 0;\n\n  /* Adding to the bag leaves the piece saved until the shopper removes it \u2014\n     the documented policy. A piece that needs a deliberate variant choice goes\n     to its own page instead of having the choice forced into a card. */\n  const addToBag = async (product) => {\n    const result = await moveToCart(product);\n    if (result?.needsVariant) { navigate(productHref(product)); return; }\n    const ok = result?.ok !== false;\n    setFeedback({ id: product.id, ok, message: result?.message ?? '' });\n    if (ok) openCart();\n  };\n  const remove = (entry) => wishlist.remove(entry.product ?? entry.id);\n\n  const content = (\n    <>\n      {failed ? (\n        <WishlistError status={wishlist.errorStatus} />\n      ) : firstLoad ? (\n        <WishlistLoading />\n      ) : count === 0 ? (\n        <div className=\"empty\">\n          <p className=\"empty__title\">Nothing saved yet.</p>\n          {/* The design's sentence said \"saved on this device\". That is true for a\n              signed-out shopper and false for a signed-in one, whose list lives on\n              the account \u2014 so the line states both cases and claims neither. */}\n          <p>Tap the heart on any piece to keep it here \u2014 saved to your account when you are signed in, and on this device when you are not.</p>\n          <Button to=\"/shop/all\">Discover pieces</Button>\n        </div>\n      ) : (\n        <div className=\"grid-4\">\n          {entries.map((entry) => entry.product ? (\n            <SavedPiece\n              key={entry.id}\n              entry={entry}\n              plate={plateFor(entry.product.id)}\n              onAdd={addToBag}\n              onRemove={remove}\n              feedback={feedback?.id === entry.product.id ? feedback : null}\n              isSyncing={wishlist.isSyncing}\n            />\n          ) : (\n            <GonePiece key={entry.id} entry={entry} onRemove={remove} isSyncing={wishlist.isSyncing} />\n          ))}\n        </div>\n      )}\n    </>\n  );\n\n  /* Signed-in shoppers view `/account/wishlist` inside the shared customer\n     account frame and navigation (`OrderFrame`'s own rule); guests keep the\n     standalone wishlist shell without fabricated account chrome. */\n  if (isAuthenticated) {\n    return (\n      <AccountFrame\n        breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'Wishlist' }]}\n        label=\"Your account\"\n        title=\"Wishlist\"\n      >\n        <section className=\"pf-account__section\" aria-label=\"Saved pieces\">\n          <header className=\"shop__head\">\n            <p className=\"label\">Saved pieces</p>\n            <h2 className=\"display shop__title\">Your <em>wishlist</em></h2>\n            <p className=\"shop__count\">{firstLoad ? 'Loading\u2026' : countLabel}</p>\n          </header>\n          {content}\n        </section>\n      </AccountFrame>\n    );\n  }",
  ],
  [
    "        <p className=\"shop__count\">{list.length} saved</p>",
    "        <p className=\"shop__count\">{firstLoad ? 'Loading\u2026' : countLabel}</p>",
  ],
  [
    "      {list.length === 0 ? (\n        <div className=\"empty\">\n          <p className=\"empty__title\">Nothing saved yet.</p>\n          <p>Tap the heart on any piece to keep it here \u2014 saved on this device.</p>\n          <Button to=\"/shop/all\">Discover pieces</Button>\n        </div>\n      ) : (\n        <div className=\"grid-4\">{list.map((p) => <ProductCard key={p.id} product={p} />)}</div>\n      )}",
    "      {content}",
  ],
];

const WISHLIST_STATES = "/* \u2500\u2500 the states this application's wishlist has, in the design's own blocks \u2500\u2500\n\n   The design's list was an array it shipped with: it never fetched, never\n   failed, and had one kind of empty. Each state below is written out of the\n   design's own `.empty` block and its `.btn` variants, and none of them invents\n   a product, a price, an availability or a saved count. The two failure messages\n   are the production wishlist's own words. */\n\nfunction WishlistLoading() {\n  return (\n    <div className=\"empty\" aria-busy=\"true\" aria-label=\"Loading your wishlist\">\n      <p className=\"empty__title\">Gathering your wishlist&hellip;</p>\n    </div>\n  );\n}\n\n/* A lapsed session (401/403) is a different truth from an unreachable list, and\n   says so \u2014 with the way back, which is this application's own sign-in route. */\nfunction WishlistError({ status }) {\n  const lapsed = status === 401 || status === 403;\n  return (\n    <div className=\"empty\" role=\"alert\">\n      <p className=\"empty__title\">\n        {lapsed\n          ? 'Please sign in again to see your wishlist.'\n          : 'We could not load your wishlist right now. Please try again.'}\n      </p>\n      {lapsed && <Button to=\"/signin?returnTo=%2Faccount%2Fwishlist\">Sign in</Button>}\n      <Button to=\"/shop/all\" variant=\"ghost\">Browse pieces</Button>\n    </div>\n  );\n}\n\n/* A saved piece the catalogue still carries: the design's card \u2014 its plates, its\n   name, its price, its own heart (which unsaves, so on this page the heart is a\n   remove) and its own quick-add with the record's real option groups \u2014 over the\n   two things the card has no place for: this application's availability\n   statement and the explicit remove. */\nfunction SavedPiece({ entry, plate, onAdd, onRemove, feedback, isSyncing }) {\n  const record = plate ?? entry.product;\n  const mapped = toDesignProduct(record);\n  if (!mapped) return null;\n  /* The canonical media row publishes records (`{ id, src, \u2026 }`); the design's\n     card draws URL strings. The conversion is this application's own single\n     resolver \u2014 the same one every production image goes through \u2014 never a\n     second one, and never a plate dropped for being the wrong shape. */\n  const plates = [plate?.image, plate?.hoverImage]\n    .map((reference) => normalizeMediaReference(reference))\n    .filter(Boolean);\n  const card = plates.length ? { ...mapped, images: plates } : mapped;\n  const choose = requiresVariantChoice(record);\n  return (\n    <div className=\"pcard-cell\">\n      <ProductCard product={card} />\n      <div className=\"wishlist-row\">\n        <Button\n          variant=\"solid\"\n          onClick={() => onAdd(record)}\n          disabled={!mapped.inStock || isSyncing}\n        >\n          {!mapped.inStock ? 'Unavailable' : choose ? 'Choose options' : 'Add to bag'}\n        </Button>\n        <button\n          type=\"button\"\n          className=\"wishlist-remove\"\n          onClick={() => onRemove(entry)}\n          disabled={isSyncing}\n        >\n          Remove\n        </button>\n        {feedback?.message ? (\n          <p className={feedback.ok ? 'wishlist-note' : 'wishlist-note is-err'} role=\"status\">{feedback.message}</p>\n        ) : null}\n      </div>\n    </div>\n  );\n}\n\n/* A saved piece the catalogue no longer resolves. No image, no price, no\n   substitute, no name \u2014 and exactly the words the production wishlist shows for\n   it (\"No longer available\", and the sentence beneath). The page makes no claim\n   of its own about how long the lookup has been running: `WishlistContext`\n   exposes `unavailable` for the case where one was attempted and failed, and the\n   application's own page states this much whether or not it is set \u2014 so this\n   one does too, rather than promising a resolution that may never arrive. */\nfunction GonePiece({ entry, onRemove, isSyncing }) {\n  return (\n    <article className=\"wishlist-gone\" role=\"group\" aria-label=\"Saved piece no longer available\">\n      <div>\n        <p className=\"wishlist-gone__title\">No longer available</p>\n        <p className=\"wishlist-gone__body\">\n          This saved piece is no longer part of the atelier\u2019s current collection.\n        </p>\n      </div>\n      <button type=\"button\" className=\"wishlist-remove\" onClick={() => onRemove(entry)} disabled={isSyncing}>\n        Remove\n      </button>\n    </article>\n  );\n}\n";

const wishlistPageRewrite = (file, source) => {
  let out = source;
  WISHLIST_EDITS.forEach(([before, after], index) => {
    if (!out.includes(before)) throw new Error(`${file}: WISHLIST_EDITS[${index}] does not match the design file`);
    out = out.replace(before, after);
  });
  return `${out}${WISHLIST_STATES}`;
};

/* ── PHASE 8 · THE INFORMATION PAGES ──────────────────────────────────────── */

/**
 * The design's information page is a layout over its own prototype prose. The
 * prose is not carried: it says the house is a prototype, that no personal data
 * is sent to a server, and that every product, price and offer is sample data —
 * three claims that are false of this application, which has real accounts, real
 * orders and a server-backed catalogue (PHASE-8 audit §5.2). What the port keeps
 * is the design's article: crumb, kicker, display title, lead, body and the row
 * of sibling links, carrying the navigation manifest's own metadata for the four
 * routes this application serves.
 */
const INFO_EDITS = [
  [
    "import { useParams } from 'react-router-dom';\nimport { Link } from '../router/index.jsx';\nimport { infoPages } from '../data/index.js';\nimport NotFound from './NotFound.jsx';",
    "import { Link } from '../router/index.jsx';\nimport { useLocation } from 'react-router-dom';\nimport { getRouteMeta } from '../../../config/navigationConfig.js';\nimport NotFound from './NotFound.jsx';\n\n/* The information routes this page serves. */\nconst INFO_PATHS = ['/about', '/contact', '/privacy', '/terms'];\n\n/* The honest note this application has always put where a page's own text will\n   arrive \u2014 the production shell's sentence, without the internal word for the\n   work that will fill it. No policy text is written here, and none is invented. */\nconst CONTENT_NOTE =\n  'This page is part of the PRATIKSHYA FASHION shell. The full text arrives as the business publishes it \u2014 the navigation, layout and routing around it are in place.';",
  ],
  [
    "export default function Info() {\n  const { slug } = useParams();\n  const page = infoPages[slug];\n  if (!page) return <NotFound />;",
    "export default function Info() {\n  const { pathname } = useLocation();\n  const meta = getRouteMeta(pathname);\n  /* No manifest entry means this application serves no information page at this\n     path, and the design's own 404 answers it \u2014 exactly as the design did. */\n  if (!meta) return <NotFound />;\n  const title = meta.label;",
  ],
  [
    "<span>{page.title}</span></nav>",
    "<span>{title}</span></nav>",
  ],
  [
    "      <p className=\"label\">{page.kicker}</p>\n      <h1 className=\"display info__title\">{page.title}</h1>\n      <p className=\"info__lead\">{page.lead}</p>\n      {page.body.map((b) => <p key={b}>{b}</p>)}",
    "      <p className=\"label\">{meta.eyebrow}</p>\n      <h1 className=\"display info__title\">{title}</h1>\n      <p className=\"info__lead\">{meta.description}</p>\n      <p>{CONTENT_NOTE}</p>",
  ],
  [
    "        {Object.entries(infoPages).filter(([k]) => k !== slug).slice(0, 4).map(([k, p]) => <Link key={k} to={`/pages/${k}`}>{p.title}</Link>)}",
    "        {INFO_PATHS.filter((path) => path !== pathname).map((path) => (\n          <Link key={path} to={path}>{getRouteMeta(path)?.label ?? path}</Link>\n        ))}",
  ],
];

const infoPageRewrite = (file, source) => {
  let out = source;
  INFO_EDITS.forEach(([before, after], index) => {
    if (!out.includes(before)) throw new Error(`${file}: INFO_EDITS[${index}] does not match the design file`);
    out = out.replace(before, after);
  });
  return out;
};

/** Backend home integration: only data injection and optional server CTAs.
 * The reference's carousel choreography, responsive CSS and art remain intact.
 */
const backendHeroRewrite = (file, source) => {
  if (file === "pages/Home.jsx") {
    return source.replace("import Hero from '../components/sections/Hero.jsx';",
      "import Hero from '../../storefront/home/CustomerHomeHero.jsx';");
  }
  return source
    .replace("import { heroConfig, heroSlides }", "import { heroConfig, heroSlides as referenceHeroSlides }")
    .replace("export default function Hero() {", "export default function Hero({ slides: heroSlides = referenceHeroSlides } = {}) {")
    .replace('              alt=""', '              alt={slide.alt || ""}')
    .replace('<span className="btn btn--solid">{s.primary.label}</span>', '{s.primary && <span className="btn btn--solid">{s.primary.label}</span>}')
    .replace('<span className="arrow-link">{s.secondary.label}<svg width="22" height="10" aria-hidden="true" /></span>', '{s.secondary && <span className="arrow-link">{s.secondary.label}<svg width="22" height="10" aria-hidden="true" /></span>}')
    .replace("                <Button to={slide.primary.to} variant={light ? 'light' : 'solid'}>{slide.primary.label}</Button>", "                {slide.primary && <Button to={slide.primary.to} variant={light ? 'light' : 'solid'}>{slide.primary.label}</Button>}")
    .replace("                <ArrowLink to={slide.secondary.to} light={light}>{slide.secondary.label}</ArrowLink>", "                {slide.secondary && <ArrowLink to={slide.secondary.to} light={light}>{slide.secondary.label}</ArrowLink>}");
};

export const REWRITES = [
  { id: "routing", files: Object.keys(CLOSURE).filter((file) => /\.jsx?$/.test(file)), apply: routingRewrite },
  { id: "backend-home-hero", files: ["pages/Home.jsx", "components/sections/Hero.jsx"], apply: backendHeroRewrite },
  { id: "fetch-priority", files: ["components/sections/Hero.jsx"], apply: fetchPriorityRewrite },
  { id: "logo-plate", files: ["components/ui/Logo.jsx"], apply: logoPlateRewrite },
  { id: "announce-key", files: ["components/layout/AnnouncementBar.jsx"], apply: announcementKeyRewrite },
  { id: "class-prefix", files: Object.keys(CLOSURE).filter((file) => /\.jsx?$/.test(file)), apply: classPrefixRewrite },
  { id: "offer-copy", files: ["components/shopping/CartDrawer.jsx"], apply: offerCopyRewrite },
  { id: "promo-feedback", files: ["components/shopping/CartDrawer.jsx"], apply: promoFeedbackRewrite },
  { id: "view-bag", files: ["components/shopping/CartDrawer.jsx"], apply: viewBagRewrite },
  { id: "layout-slot", files: ["components/layout/Layout.jsx"], apply: layoutSlotRewrite },
  { id: "newsletter-capability", files: ["components/ui/NewsletterForm.jsx"], apply: newsletterCapabilityRewrite },
  { id: "art-base", files: ["mock/assets/images.js"], apply: artBaseRewrite },
  { id: "footer-facts", files: ["components/layout/Footer.jsx"], apply: footerFactsRewrite },
  { id: "saree-curation", files: ["components/sections/SareeLookbook.jsx"], apply: sareeCurationRewrite },
  { id: "kurti-curation", files: ["components/sections/KurtiLookbook.jsx"], apply: kurtiCurationRewrite },
  { id: "barrel", files: ["data/index.js"], apply: barrelRewrite },
  { id: "content-facts", files: ["mock/data/content.js"], apply: contentFactsRewrite },
  { id: "live-catalogue", files: Object.keys(LIVE_CATALOGUE_EDITS), apply: liveCatalogueRewrite },
  { id: "product-page", files: ["pages/Product.jsx"], apply: productPageRewrite },
  { id: "shop-listing", files: ["pages/Shop.jsx"], apply: shopListingRewrite },
  { id: "wishlist-page", files: ["pages/Wishlist.jsx"], apply: wishlistPageRewrite },
  { id: "info-page", files: ["pages/Info.jsx"], apply: infoPageRewrite },
  { id: "media-fallback", files: MEDIA_FALLBACK_FILES, apply: mediaFallbackRewrite },
  { id: "bestsellers-note", files: ["components/sections/Bestsellers.jsx"], apply: bestsellersNoteRewrite },
  { id: "add-to-bag-feedback", files: ["components/product/useAddToBag.js"], apply: addToBagFeedbackRewrite },
  { id: "homepage-sections", files: Object.keys(HOMEPAGE_SECTION_EDITS), apply: homepageSectionRewrite },
];

/** Read a design file and apply every rewrite that owns it, in order. */
export function portFile(file) {
  let source = readFileSync(join(DESIGN_SRC, file), "utf8");
  for (const rewrite of REWRITES) if (rewrite.files.includes(file)) source = rewrite.apply(file, source);
  return source;
}

/** True when the port of this file differs from the design's own file. */
const isRewritten = (file) => portFile(file) !== readFileSync(join(DESIGN_SRC, file), "utf8");

/* ────────────────────────────── the stylesheet ──────────────────────────── */

/** The design's sheets, in the order `main.jsx` loads them. */
export const SOURCE_SHEETS = [
  "tokens.css",
  "base.css",
  "layout.css",
  "sections.css",
  "product.css",
  "shopping.css",
  "pages.css",
];

/** The banner written above each sheet in the port, so provenance is visible. */
export const sheetBanner = (name) => `/* ══ ${name} — home-page/src/styles/${name} (verbatim declarations, scoped) ══ */`;

/**
 * The two keyframes the design defines with generic global names. They are
 * renamed, and their references rewritten, so the port cannot collide with the
 * host application's own `spin`/`pulse`.
 */
export const KEYFRAME_RENAMES = { spin: "pf-spin", pulse: "pf-pulse" };

const matchBrace = (css, open) => {
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return css.length;
};

/** Comments blanked out, same length: braces inside prose are not structure. */
const masked = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, (comment) => " ".repeat(comment.length));

/** Split CSS into top-level blocks: `{ prelude, body }` in source order. */
export function blocks(css) {
  const found = [];
  const maskedCss = masked(css);
  let index = 0;
  while (index < css.length) {
    const open = maskedCss.indexOf("{", index);
    if (open === -1) break;
    const close = matchBrace(maskedCss, open);
    found.push({ prelude: css.slice(index, open), body: css.slice(open + 1, close) });
    index = close + 1;
  }
  return found;
}

/** A block's prelude, split into the comments it carries and its selector. */
const splitPrelude = (prelude) => {
  const comments = prelude.match(/\/\*[\s\S]*?\*\//g) ?? [];
  const head = prelude.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  const lead = prelude.slice(0, prelude.search(/\S/)).replace(/[^\n]*$/, "");
  return { comments, head, lead };
};

/** Rename a keyframe at-rule's own name, so it cannot collide with the host's. */
const renameKeyframed = (prelude) =>
  prelude.replace(/@keyframes\s+([\w-]+)/, (match, name) => `@keyframes ${KEYFRAME_RENAMES[name] ?? name}`);

/** Rewrite references to the renamed keyframes inside declaration values. */
const renameAnimationRefs = (declarations) =>
  declarations.replace(
    /(^|[;{]\s*)(animation|animation-name)(\s*:\s*)([^;}]+)/g,
    (match, lead, property, colon, value) =>
      `${lead}${property}${colon}${value.replace(/\b(spin|pulse)\b/g, (name) => KEYFRAME_RENAMES[name] ?? name)}`,
  );

/** Scope one comma-separated selector list under the port root. */
export function scopeSelectorList(list) {
  return list
    .split(",")
    .map((part) => {
      const selector = part.trim();
      if (!selector) return selector;
      if (selector.startsWith("*")) {
        const suffix = selector.slice(1);
        return `${SCOPE}${suffix}, ${SCOPE} *${suffix}`;
      }
      if (/^(?::root|html|body)\b/.test(selector)) return SCOPE + selector.replace(/^(?::root|html|body)/, "");
      return `${SCOPE} ${selector}`;
    })
    .join(", ");
}

/** The whole transform: scope selectors, rename the two global keyframes. */
export function scopeCss(css) {
  let out = "";
  let cursor = 0;
  let index = 0;
  const maskedCss = masked(css);
  while (index < css.length) {
    const open = maskedCss.indexOf("{", index);
    if (open === -1) break;
    const close = matchBrace(maskedCss, open);
    const { comments, head, lead } = splitPrelude(css.slice(index, open));
    let selector = head;
    let body = css.slice(open + 1, close);
    if (/^@(media|container|supports|layer)\b/.test(head)) {
      body = scopeCss(body);
    } else if (/^@keyframes\b/.test(head)) {
      selector = renameKeyframed(head);
    } else if (head.startsWith("@")) {
      /* @font-face, @property, @page … nothing to scope. */
    } else {
      selector = scopeSelectorList(head);
      body = renameAnimationRefs(body);
    }
    out += css.slice(cursor, index)
      + lead
      + (comments.length ? `${comments.join("\n")}\n` : "")
      + selector
      + "{"
      + body
      + "}";
    cursor = close + 1;
    index = cursor;
  }
  return out + css.slice(cursor);
}

/**
 * Every leaf rule of a stylesheet, with the at-rule context it sits in.
 * Used by the regression suite to prove that each selector is scoped and that
 * each declaration survived — a structure, not a regex over the whole file.
 */
export function parseCssRules(css, conditions = []) {
  const rules = [];
  for (const block of blocks(css)) {
    /* Comments are not part of a selector: a sheet banner ahead of a rule must
       not be read as one. */
    const head = splitPrelude(block.prelude).head;
    if (!head) continue;
    if (/^@(media|container|supports|layer)\b/.test(head)) {
      rules.push(...parseCssRules(block.body, [...conditions, head]));
    } else if (/^@keyframes\b/.test(head)) {
      for (const step of blocks(block.body)) {
        if (step.prelude.trim()) rules.push({ type: "keyframe-step", name: head, selector: step.prelude.trim(), declarations: step.body, conditions });
      }
    } else if (head.startsWith("@")) {
      rules.push({ type: "at-rule", selector: head, declarations: block.body, conditions });
    } else {
      rules.push({ type: "rule", selector: head, declarations: block.body, conditions });
    }
  }
  return rules;
}

/** Every declaration line of a stylesheet, as `property: value` strings. */
export function parseDeclarations(css) {
  return parseCssRules(css)
    .flatMap((rule) => rule.declarations.split(";"))
    .map((declaration) => declaration.replace(/\s+/g, " ").trim())
    .filter((declaration) => declaration && !declaration.startsWith("/*"));
}

/** The design's seven sheets, concatenated in load order. */
export function readSourceCss(stylesDir = DESIGN_STYLES) {
  return SOURCE_SHEETS.map((name) => `${sheetBanner(name)}\n${readFileSync(join(stylesDir, name), "utf8")}`).join("\n");
}

/** The transform of those seven sheets — what `customer.css` must be. */
export function buildPortCss(stylesDir = DESIGN_STYLES) {
  return SOURCE_SHEETS.map((name) => `${sheetBanner(name)}\n${scopeCss(readFileSync(join(stylesDir, name), "utf8"))}`).join("\n");
}

/* ────────────────────────────── the CLI ────────────────────────────────── */

const write = (file, contents) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
};

const differingLines = (a, b) => {
  const pool = new Map();
  for (const line of b.split("\n")) pool.set(line, (pool.get(line) ?? 0) + 1);
  let missing = 0;
  for (const line of a.split("\n")) {
    const count = pool.get(line) ?? 0;
    if (count === 0) missing += 1;
    else pool.set(line, count - 1);
  }
  return missing;
};

const runCopy = () => {
  const report = [];
  for (const file of Object.keys(CLOSURE)) {
    const contents = portFile(file);
    write(join(PORT_DIR, file), contents);
    const changed = differingLines(readFileSync(join(DESIGN_SRC, file), "utf8"), contents);
    report.push(`${changed === CLOSURE[file] ? "ok  " : "FAIL"} ${String(changed).padStart(3)} ${file}`);
  }
  return report;
};

const runCheck = () => {
  const problems = [];
  for (const file of Object.keys(CLOSURE)) {
    const design = readFileSync(join(DESIGN_SRC, file), "utf8");
    const ported = readFileSync(join(PORT_DIR, file), "utf8");
    const changed = differingLines(design, ported);
    if (changed !== CLOSURE[file]) problems.push(`${file}: ${changed} changed lines, expected ${CLOSURE[file]}`);
    const expected = isRewritten(file) ? portFile(file) : design;
    if (expected !== ported) problems.push(`${file}: does not match the tool's own output`);
  }
  for (const file of ADDED) {
    if (!existsSync(join(PORT_DIR, file))) problems.push(`${file}: missing from the port`);
  }
  const css = buildPortCss();
  if (readFileSync(PORT_CSS, "utf8") !== css) problems.push("customer.css: does not match the transform of the design's stylesheets");
  return problems;
};

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.includes("--copy")) {
    for (const line of runCopy()) console.log(line);
    console.log(`\ncopied ${Object.keys(CLOSURE).length} design files into ${PORT_RELATIVE}`);
  }
  if (args.includes("--css")) {
    write(PORT_CSS, buildPortCss());
    console.log(`wrote ${PORT_RELATIVE}/customer.css (${readFileSync(PORT_CSS, "utf8").length} bytes, ${SOURCE_SHEETS.length} sheets)`);
  }
  if (args.includes("--check")) {
    const problems = runCheck();
    console.log(problems.length ? problems.join("\n") : `the port matches the design (${Object.keys(CLOSURE).length} copied files, ${buildPortCss().length} bytes of CSS)`);
    process.exitCode = problems.length ? 1 : 0;
  }
}
