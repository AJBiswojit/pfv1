# Phase 8 — The remaining customer-facing pages: audit and migration plan

**Branch** `arena/649fd845-pfv1` · **HEAD** `a03694b7f192db7cea09a2e59c0b5ad55c93752b` (Phase 7) ·
**parent** `4311209` (Phase 6) · **base** `1d64755` · **origin** `1d64755` (ahead 2, behind 0) ·
**staged** 0 · **modified** 0 · **untracked** 102 (all tooling/evidence under `.p3/`–`.p7/`).

> **This document is an audit and a plan. No application file was created, modified or staged while
> producing it.** Every command run was read-only (reads, `grep`, `git status/diff/log`, throwaway
> enumerators under `frontend/` that were deleted immediately after use, and `node --test`-free
> inspection). The recovery backup `RECOVERY-BACKUP-phase6-phase7-20261014.patch` (26,016,779 bytes)
> is untouched. Nothing was pushed, no PR, no merge, no amend, no Phase 9.

---

## 1 · What is already migrated (the starting line)

| | |
|---|---|
| Port surface | `frontend/src/components/aarna/` — **74 files** (shell, sections, product, shopping, shop controls, state boundary, router shim, mock/data, 6 suites) |
| Switch | `frontend/src/config/storefrontHome.js` → `resolveStorefrontHome()` + `useAarnaHome` / `useAarnaProduct` / `useAarnaListing` / `useAarnaStorefront`; `?home=aarna` in a **development** build, `VITE_STOREFRONT_HOME=aarna` in a deployed one; anything else → **`atelier`** |
| Gate | `frontend/src/layouts/CustomerLayout.jsx:89` — `const aarna = useAarnaStorefront();` — when false the production chrome and route tree render exactly as before |
| Ported design pages | `Home` (Phase 2D), `Product` (6), `Shop` (7) and the design's `NotFound` (6, byte-identical) — **4 of the design's 9 pages** |
| Suites | `frontend/src/components/aarna/__tests__/` — **81 tests / 81 pass**: `shellIntegrity` 13, `portParity` 16, `integration` 15, `liveCatalogue` 7, `productPage` 17, `listingPage` 13 |
| Evidence | `.p6/`, `.p7/` tools + screenshots; the Phase 7 probe recorded **65 readings / 0 false** in a real browser against intercepted `/api/v1/` fixtures |

## 2 · Method — and its limits

The inventory was produced from the **route registry itself**, not from the earlier reports:

1. `frontend/src/App.jsx` — every `<Route>` inside the `<Route element={<CustomerLayout />}>` block
   (lines 460–517), its element, and the manifest-driven tail
   (`routeManifest.filter(route => !dedicatedPaths.has(route.path))`, lines 500–514);
2. `frontend/src/config/navigationConfig.js` — `routeManifest` (48 paths), `standalonePages`,
   `legalNavigation`, `utilityNavigation`; cross-checked against `dedicatedPaths` (`App.jsx:141`);
3. `frontend/src/data/products/taxonomy.js::hasNavigationScope` — which manifest paths are listings;
4. the port's boundary `frontend/src/config/storefrontHome.js` and its shim
   `frontend/src/components/aarna/router/routes.js` (APP_ROUTES, `isRegisteredPath`, the translation tables);
5. a per-page read of every production component, its contexts/hooks/services, and its `document.title`;
6. the design at `home-page/src/pages/`, `home-page/src/App.jsx` and `home-page/src/components/`.

**Limits, stated up front.** No backend, PostgreSQL, Docker or payment gateway runs in this sandbox, so
anything whose truth depends on live data (which category slugs exist, what an authenticated wishlist
returns, whether an order can be looked up by number) is marked **unverifiable here**. Nothing in this
document claims a rendered result without saying whether it was read from source or actually rendered.

## 3 · The complete customer-facing route inventory — 74 paths

`A` = migrated to Aarna · `P` = production/Atelier UI · `X` = intentionally excluded (staff portals) ·
`U` = unclear / needs a decision.

### 3.1 Ported surfaces (47 paths) — status `A`

| # | path(s) | rendered by (switch on) | evidence |
|---|---|---|---|
| 1 | `/` | `aarna/pages/Home.jsx` | `AARNA_HOME_PATH` in `storefrontHome.js`; `.p7` reading 01 (switch off) vs 02 |
| 2–7 | `/shop`, `/explore`, `/search`, `/category/:slug`, `/collections/:slug`, `/collection/:slug` | `aarna/pages/Shop.jsx` (`mode=shop\|explore\|search\|category\|collection` + `LegacyCollectionRedirect`) | `AARNA_LISTING_PATHS` / `AARNA_LISTING_DYNAMIC`; `AarnaStorefront.jsx:96–103`; `.p7` readings 02–09 |
| 8 | `/product/:productId` | `aarna/pages/Product.jsx` | `AARNA_PRODUCT_PATH`; `AarnaStorefront.jsx:87`; `.p6` evidence 01–14 |
| 9–47 | the **39** navigation-scope manifest paths (`/women`, `/women/sarees/silk`, `/bridal/…`, `/men/…`, `/kids/…`, `/collections`) | `aarna/pages/Shop.jsx` (`mode=navigation`) | `hasNavigationScope`; `AARNA_LISTING_PATHS` is built from `routeManifest` itself; `audit:frontend-catalog` → “38 taxonomy paths / 38 listing routes” (the 39th is `/collections`) |

### 3.2 Still the production UI (27 paths) — status `P`, with the two partial cases marked

| # | path | production component (lines) | a customer reaches it from the Aarna shell via | note |
|---|---|---|---|---|
| 48 | `/cart` | `pages/Cart.jsx` (227) + `components/cart/*` (767) | direct URL | **partial**: the design's `CartDrawer` *is* ported; the page is not |
| 49 | `/checkout` | `pages/Checkout.jsx` (153) + `components/checkout/*` (1,583) | the ported drawer's **“Proceed to Checkout”** (`CartDrawer.jsx:112` → `navigate('/checkout')`) | **partial**: the journey enters from Aarna |
| 50 | `/order-success` | `pages/OrderSuccess.jsx` (306) | after placing an order | — |
| 51 | `/account/wishlist` | `pages/Wishlist.jsx` (286) | the ported **header heart** (`Header.jsx:67`) and **mobile menu** (`MobileMenu.jsx:83`) | **partial**: hearts/counts on Aarna cards are ported, the page is not |
| 52 | `/wishlist` | `Navigate → /account/wishlist` | — | a redirect; when the switch is on, the Atelier chrome paints once before the port takes over |
| 53–56 | `/signin`, `/signup`, `/forgot-password`, `/reset-password` | `pages/auth/*` (278 + 497 + 193 + 235 = 1,203) | the ported header/account icon → `/account` → `ProtectedRoute` → `/signin?returnTo=…` | **partial** (the gate is reached from Aarna) |
| 57–69 | `/account`, `/account/profile`, `/account/addresses`, `/account/orders`, `/account/orders/:orderId`, `…/track`, `…/return`, `/account/settings`, `/account/security`, `/account/preferences`, `/account/ai-mirror`, `/account/ai-shopping`, `/account/instagram-rewards` | `pages/account/*` (13 files, **5,278 lines**) + `components/account/*` (658) + `components/orders/*` | the ported header account icon (`Header.jsx:66`), mobile menu (`MobileMenu.jsx:82`), and the shell's “Track order” (`MobileMenu.jsx:84` → shim → `/account/orders`) | — |
| 70–73 | `/about`, `/contact`, `/privacy`, `/terms` | `pages/CategoryPage.jsx` (133) | the ported **footer** and mobile menu via the shim: `/pages/privacy`, `/pages/returns`, `/pages/our-story` → these four | **partial**: linked from Aarna, rendered by Atelier |
| 74 | `*` (any unknown URL) | `pages/NotFound.jsx` (61) | a mistyped or dead link | **partial**: the design's 404 already renders for *scoped* 404s (`/product/<unknown>`, `/category/<unknown>`); a truly unknown path still shows the production 404 |

### 3.3 Intentionally excluded — status `X`

The staff portals are **not** customer-facing and are out of the storefront migration: `/login` (staff),
`/admin/*` (≈90 routes), `/super-admin/*`, `/employee/*` (≈60 routes). None of them is touched by the
port, and the boundary cannot reach them (§7.3).

## 4 · The design reference inventory

| design page | lines | ported? | target in this application |
|---|---|---|---|
| `Home.jsx` | 31 | **yes** (2D) | `/` |
| `Shop.jsx` | 75 | **yes** (7) | `/shop`, `/explore`, `/search`, `/category/:slug`, `/collections/:slug`, 39 scoped paths |
| `Product.jsx` | 103 | **yes** (6) | `/product/:productId` |
| `NotFound.jsx` | 10 | **yes** (6, byte-identical) | the port's nested `*` |
| **`Wishlist.jsx`** | **29** | **no** | `/account/wishlist` |
| **`Info.jsx`** | **21** | **no** | `/about`, `/contact`, `/privacy`, `/terms` (design's `/pages/:slug`) |
| `Checkout.jsx` | 34 | **no** | `/checkout` — **prototype**: “Payments are not connected in this prototype, so no order can be placed” |
| `Account.jsx` | 50 | **no** | `/account` — prototype: a local profile in `localStorage` + a three-tile grid |
| `TrackOrder.jsx` | 26 | **no** | — **prototype**: the form resolves nothing; “This prototype isn't connected to an order system yet” |

The port's own CSS already carries the vocabulary these pages need — checked by name in
`components/aarna/aarna.css`: `.info` / `.info__title` / `.info__lead` / `.info__links`,
`.account__tiles` / `.account__tile`, `.checkout__lines`, `.form` / `.form--inline` / `.form__err` /
`.form__note`, `.totals` / `.totals__disc` / `.totals__grand`, `.empty` / `.empty__title`,
`.grid-4`, `.cline*`, `.qty`, `.drawer__lines`, `.sr-only`. **No new CSS is required for the pages
recommended in §7.**

## 5 · Candidate detail

### 5.1 Wishlist — `/account/wishlist` (status `P`/partial) · **recommended for Phase 8**

* **Production component**: `pages/Wishlist.jsx` (286 lines). Real behaviour: a “Gathering your
  wishlist…” loading state; an error state that distinguishes `401/403` (“Please sign in again”) from a
  generic failure; empty state with two CTAs; a `ProductCard` grid with per-piece **Add to Bag /
  Choose Options / Unavailable** and **Remove**; a *deliberately honest* block for saved pieces whose
  product no longer resolves (“No longer available”, remove only, no substitute); the cart's own toast
  on a failed add; and `document.title = "Wishlist — PRATIKSHYA FASHION"`.
* **State it uses**: `useShopping()` (`ShoppingContext`) → `{ cart, wishlist, moveToCart }`; inside,
  `WishlistContext` (`saved`, `entries`, `count`, `isLoading`, `isSyncing`, `error`, `errorStatus`,
  `add`, `remove`, `toggle`) and `CartContext`; `useProductCovers` (canonical media), `productHref`,
  `requiresVariantChoice`. Server contract: `apiGetWishlist` / `apiAddToWishlist` /
  `apiRemoveFromWishlist` (`services/api/wishlistApi.js`); **guests are client-only by contract**.
* **Design reference**: `home-page/src/pages/Wishlist.jsx` — same `shop container` + `crumbs` +
  `label`/`display` header + count + `.grid-4` of the design's `ProductCard` + `.empty` block.
  The design's catalogue (`getByIds`, `mock/data/products`) must **not** be imported: the port's
  `state/ShopContext.jsx` already exposes `wishlist` (ids), `toggleWish` and `isWished`, and its cards
  already render live products through `toDesignProduct` + `useProductCovers`.
* **Must be preserved**: guest *and* authenticated behaviour; the unavailable-entry rule; the
  `needsVariant → product page` rule; the sync/loading/error truthfulness; `document.title`; the
  `/wishlist` → `/account/wishlist` redirect; the `ProtectedRoute`-free access (the page itself handles
  an anonymous read).
* **Complexity**: **low–medium**. The boundary needs the wishlist's *entry* view (unavailable +
  error/sync flags) and the design's page needs the port's own catalogue hook; no API change.
* **Open question (unverifiable here)**: the production empty state links to `/category/sarees`,
  `/category/lehengas`, `/category/bridal-couture`. Whether those slugs exist is a property of the live
  taxonomy (the registers hydrate from the API, and `categoryRoutes` is empty without a catalogue), so
  in a ported page the design's own unresolvable-proof target (`/shop/all` → `/shop`) is the honest
  choice. **Flagged, not silently “fixed”.**

### 5.2 Information pages — `/about`, `/contact`, `/privacy`, `/terms` (status `P`) · **recommended, with a caveat**

* **Production component**: `pages/CategoryPage.jsx` (133). For these four paths it is a **shell**: the
  manifest's `eyebrow`, `label` and `description` (real copy in `navigationConfig.js:185–247`), then —
  because they belong to no navigation group — the honest line *“This page is part of the PRATIKSHYA
  FASHION shell. Its content arrives with the phase that owns it.”* There is **no body copy and no
  contact form** anywhere in the application, and no content API (`services/api/` has no pages client).
* **Design reference**: `home-page/src/pages/Info.jsx` (21) — an article layout: `info container`,
  crumbs, `label` kicker, `display info__title`, `info__lead`, body paragraphs, sibling links.
* **The caveat — content truthfulness.** The design's copy is explicitly prototype text
  (`home-page/src/mock/data/pages.js`: *“Policies are placeholders that the business must replace with
  its actual terms before launch”*) and three of its sentences are **false for this application**:
  “PRATIKSHYA FASHION is a prototype house” (our story), “This prototype stores your bag, wishlist and
  newsletter preferences only in your browser's local storage. **No personal data is sent to a
  server**” (privacy — this application has real accounts, a server-backed cart and real orders), and
  “All products, prices and offers on this site are **sample data** for demonstration purposes”
  (terms). The port already carries this file
  (`components/aarna/mock/data/pages.js`, exported via `components/aarna/data/index.js`) but **nothing
  renders it today** — verified: no ported page imports `infoPages`. A Phase 8 port must keep it
  dormant and render the application's own manifest metadata instead.
* **Also worth recording**: the design has **seven** info pages; the shim maps three of them
  (`/pages/shipping`, `/pages/returns`, `/pages/authenticity`) onto `/contact`
  (`components/aarna/router/routes.js:115–123`). So three distinct footer/drawer destinations collapse
  onto one page that itself has no content. That is a content gap, not a UI gap — it needs a product
  decision, not a code change.
* **Complexity**: **low** (layout only). **Value**: removes a visible exit from the design; does not
  invent a single sentence.

### 5.3 The customer 404 — `*` (status `P`/partial) · **recommended, low priority, guarded**

* Production `pages/NotFound.jsx` (61) prints “Nothing Here” plus chips for the six navigation groups
  and a link to `/contact`.
* The design's `NotFound.jsx` is **already ported byte-identical** and already answers scoped 404s
  (`/product/<unknown>`, `/category/<unknown>`, `/collections/<unknown>`) through the port's nested
  `*` → `<Shop mode="navigation" />` → no scope → design 404.
* What is missing is only the *unknown URL* case. **The guard is mandatory**: the shim's
  `isRegisteredPath()` is a *customer-path* table and reports `false` for `/admin` and `/employee`
  (verified by execution), so a naive “not registered → hand to the port” predicate would swallow the
  staff portals. The predicate must exclude the staff prefixes explicitly and be covered by tests
  (§8, §10).
* **Complexity**: very low; **risk**: low *with* the guard, medium without it.

### 5.4 Cart — `/cart` (status `P`) · **defer to Phase 9**

* `pages/Cart.jsx` (227) + `components/cart/*` (767: `CartDrawer` 214, `CartLineItem` 180,
  `CouponField` 197, `QuantityStepper` 67, `OrderSummary` 109) — quantities, coupon application,
  totals, recommendations, `document.title`.
* **No page-level design reference**: the design's cart *is* the drawer (already ported). A cart page
  would mean inventing a page in the design's language — design work, not adoption.
* The ported drawer does **not** link to `/cart` (only to `/checkout`), so the page is reachable today
  only by direct URL.

### 5.5 Checkout and Order success — `/checkout`, `/order-success` (status `P`) · **defer to Phase 9**

* `pages/Checkout.jsx` (153) drives a four-step flow over `components/checkout/*` (1,583 lines:
  `PaymentStep` 347, `DeliveryStep` 334, `CheckoutOrderSummary` 199, `CustomerInformation` 185,
  `OrderReview` 132, `CheckoutShell` 127, `CheckoutProgress` 89, `CheckoutHeader` 69, `CheckoutField`
  63, `CheckoutNavigation` 38) with `CheckoutContext` + `CheckoutProvider`, `CHECKOUT_STEPS`,
  `apiPlaceOrder`, `apiCreatePaymentSession`, `apiVerifyPayment`, the **Razorpay** window, **COD** with
  its fee, guest orders, coupon re-pricing and idempotency — the Phase 5 contract.
* `pages/OrderSuccess.jsx` (306) reads `OrderContext`, `useAuth`, `OrderStatusBadge`, `formatPhone`.
* The design's `Checkout.jsx` (34) is a prototype summary that states outright that it cannot place an
  order; its only transferable asset is the summary/totals vocabulary. This is **re-skinning a money
  path**, and it cannot be verified end-to-end in this environment (no gateway, no DB).
* `CustomerLayout.jsx:73` also gives `/checkout` and `/order-success` a reduced header
  (`CheckoutHeader`), a behaviour a port must keep.

### 5.6 Authentication — `/signin`, `/signup`, `/forgot-password`, `/reset-password` (status `P`) · **defer to Phase 10**

* 1,203 lines across four pages; `AuthContext` + `authApi` (`apiSignUpCustomer`, `apiSignInCustomer`,
  `apiSignInGoogleCustomer`, `apiForgotPasswordCustomer`, `apiResetPasswordCustomer`,
  `apiChangePasswordCustomer`, `apiRestoreCustomerSession`); `GoogleSignInButton` gated by
  `VITE_GOOGLE_CLIENT_ID`; the `returnTo` round-trip (`ProtectedRoute` →
  `/signin?returnTo=<encoded>`) sanitised by `utils/validation.js::sanitizeReturnUrl` (an open-redirect
  guard).
* **There is no design page for any of this** — the design's only sign-in is the prototype form inside
  `Account.jsx`, stored in `localStorage`. Migrating these means designing them, which the directive
  reserves to the design owner.
* **OTP flows do not exist in this application** (searched: no OTP/verification code path anywhere in
  `pages/`, `components/auth/` or `context/`). There is nothing to migrate; if the design implies one,
  it is a capability gap to document, not to fake.

### 5.7 Account — 13 paths, 5,278 lines (status `P`) · **defer to Phase 11**

* `pages/account/*`: `AccountDashboard` 650, `OrderReturn` 648, `OrderDetail` 551, `AiMirror` 542,
  `InstagramRewards` 430, `AccountProfile` 392, `AiShoppingAssistant` 378, `AccountSecurity` 371,
  `AccountOrders` 368, `OrderTracking` 338, `AccountAddresses` 247, `AccountSettings` 212,
  `AccountPreferences` 151 — over `AccountContext`, `OrderContext`, `AuthContext`, `AccountShell` and
  the `components/orders/*` family.
* The design reference is a **three-tile dashboard** (`Account.jsx`) — enough for `/account`, nothing
  for the other twelve. `OrderPageShell` also supports **guest orders** (“You're viewing a guest order
  from this browser”, with sign-in/up links carrying `returnTo=%2Faccount%2Forders`), and
  `ordersApi.apiClaimGuestOrders` attaches them after sign-in — behaviour a re-skin must not lose.
* Flag: `AiMirror` and `AiShoppingAssistant` import `services/aiMirror/aiMirrorMockData` and
  `services/ai/shopping/aiShoppingMockData` (pre-existing in-application mocks). Whether they belong in
  a storefront migration at all is a **product question** — recorded here as unclear (§5.9).

### 5.8 Track order — the design's page has no capability behind it · **exclude, document**

* `home-page/src/pages/TrackOrder.jsx` lets a visitor type a human-readable order number and answers
  “No order … was found. This prototype isn't connected to an order system yet.” — it performs no
  lookup.
* The application's tracking is `GET /orders/{orderId}/tracking` (`ordersApi.apiGetTracking`,
  `pages/account/OrderTracking.jsx`), reachable from the account order list and from
  `/account/orders/:orderId/track`; guest access works through the order id + `guestEmail`, and
  `/orders/claim-guest` attaches guest orders after sign-in. **There is no lookup-by-number endpoint**,
  and the ported shell's “Track order” link already resolves to `/account/orders`
  (`router/routes.js:148`).
* A faithful port of the design's page would therefore need a **new backend capability**. Out of scope;
  recommended instead: leave the shim's mapping as it is (it lands on the real order list) and record
  the gap.

### 5.9 Unclear, needing investigation

| # | item | why it is unclear | what would settle it |
|---|---|---|---|
| U1 | Empty-state CTA slugs (`/category/sarees`, `/category/lehengas`, `/category/bridal-couture`) | the taxonomy registers hydrate from the API; with no catalogue they resolve to nothing, and there is no database here | a run against a seeded backend, or the taxonomy fixture |
| U2 | The design's `/pages/shipping`, `/pages/returns`, `/pages/authenticity` | three destinations collapse onto `/contact`, which has no content | a product/content decision (no code fix) |
| U3 | Whether `/cart` should exist in the Aarna journey at all | the design's cart is the drawer; the page is an Atelier artefact reachable only by URL | decided as part of the Phase 9 plan |
| U4 | `AiMirror` / `AiShoppingAssistant` | built on in-application mock services; not “customer storefront” in the design's sense | a product decision on whether they are in scope ever |
| U5 | `/wishlist` (the redirect) under the switch | today the Atelier chrome can paint once before the port takes over | resolved by Phase 8 if `/wishlist` is handed to the port (as Phase 7 did for `/collection/:slug`) |

## 6 · Classification summary

| status | paths | detail |
|---|---|---|
| **A — migrated to Aarna** | **47** | `/`, 7 dedicated listing/product routes, 39 manifest navigation paths |
| **P — still production UI, no part of it ported** | **19** | `/order-success`, `/wishlist` (redirect), the 4 auth screens, and the 13 account paths |
| **P/partial — visible seam: part of the journey to it is already Aarna** | **8** | `/cart` & `/checkout` (the drawer is ported and its “Proceed to Checkout” enters here), `/account/wishlist` (hearts/counts are ported and the header links here), the 4 info pages (linked from the ported footer/menu), `*` (scoped 404s already render the design's page) |
| **X — excluded** | staff portals: `/login`, `/admin/*`, `/super-admin/*`, `/employee/*` | not customer-facing |
| **U — unclear** | 5 items (§5.9) | listed above, none blocking |

*(19 + 8 = 27 paths that still render the Atelier storefront end-to-end when the switch is on; 27 + 47
= the 74 customer paths in §3.)*

## 7 · Recommended bounded Phase 8

> **Phase 8 = the two design pages with a direct reference that this application can serve without new
> data, plus the one-route 404 handover.**

### 7.1 In scope

| item | what it adopts | why it qualifies |
|---|---|---|
| **1 · `/account/wishlist`** (and `/wishlist` inside the port so the redirect cannot flash the Atelier chrome) | the design's `Wishlist.jsx` layout over the application's real wishlist | a 1:1 design reference; every input already exists (`WishlistContext`, `ShoppingContext`, the port's cards, `useProductCovers`); guest and authenticated paths both testable; **no API change** |
| **2 · `/about`, `/contact`, `/privacy`, `/terms`** | the design's `Info.jsx` **layout**, rendering the manifest's own `label`/`eyebrow`/`description` and the honest “content arrives…” note | a clear layout reference; no new content is invented; the design's prototype policy copy stays dormant; testable statically |
| **3 · the customer `*`** *(lower priority, mandatory guard)* | the design's `NotFound.jsx` for unknown URLs under the switch | the page is already ported; the guard (§5.3) is the whole risk |

**Recommended commit shape**: one Phase 8 commit for items 1–2 (+ suites, + the report), and — if you
prefer to keep the riskiest change separable — item 3 as its own small commit on top. Either way the
switch keeps Atelier the production default and `home-page/` stays untouched.

### 7.2 Out of scope, and why

| excluded | reason | assigned |
|---|---|---|
| `/cart` | no page-level design reference (the design's cart is the drawer, already ported); it is design work, not adoption | **Phase 9** |
| `/checkout`, `/order-success` | the design's page is an explicit prototype; the real flow touches payments (Razorpay), COD, idempotency, the Phase 5 contract, and cannot be verified end-to-end in this environment | **Phase 9** |
| `/signin`, `/signup`, `/forgot-password`, `/reset-password` | **no design reference exists**; auth contracts, Google OAuth and the `returnTo` guard; needs a design decision first | **Phase 10** |
| `/account` + 12 sub-pages | the design reference is a 3-tile dashboard; 5,278 lines of real workflow; guest-order claiming | **Phase 11** |
| Track order by number | no backend capability; a faithful port would need a new API | documented (§5.8) |
| staff portals | not customer-facing | never |
| newsletter | already ported and honestly disabled (`services/newsletter.js`: `newsletterAvailable()` false in production; the field and button render disabled with the reason) | done |

### 7.3 What Phase 8 must not do

No new dependency; no TypeScript; no backend, contract, auth, pricing, inventory or commerce change; no
`.gitignore` change; no edit to `home-page/`; no change to the Atelier default or to any other
customer route; no CSS framework work beyond what the port already scopes; no page invented for a
capability that does not exist.

## 8 · Files likely to change (determinable now)

**New**

| file | what |
|---|---|
| `frontend/src/components/aarna/pages/Wishlist.jsx` | the design's wishlist page, generated by the port tool (never hand-edited) |
| `frontend/src/components/aarna/pages/Info.jsx` | the design's info page, generated likewise |
| `frontend/src/components/aarna/__tests__/aarnaWishlistPage.test.js` | the new suite (wishlist + info + 404 if item 3 lands) |
| `docs/PHASE-8-WISHLIST-INFO-404.md` | the phase report |

**Modified**

| file | change |
|---|---|
| `frontend/scripts/aarna-port.js` | two new rewrites (`wishlist-page`, `info-page`), their `*_EDITS`/`*_STATES`, the `CLOSURE` pins for `pages/Wishlist.jsx` and `pages/Info.jsx`, and the `REPLACED`/rewrite registry |
| `frontend/src/components/aarna/AarnaStorefront.jsx` | routes: `account/wishlist`, `wishlist` (redirect inside the port), `about`, `contact`, `privacy`, `terms`; the `*` handover |
| `frontend/src/config/storefrontHome.js` | `AARNA_WISHLIST_PATH` / `AARNA_INFO_PATHS` (+ the guarded unknown-path predicate for `*`), folded into `useAarnaStorefront` |
| `frontend/src/components/aarna/state/ShopContext.jsx` | **only if** the page is written against the design's `useShop()` shape; the alternative (the page reads `WishlistContext`/`ShoppingContext` directly, as the Phase 6/7 pages read the app's own hooks) is the smaller change — decision to be recorded in the phase report |
| `frontend/src/components/aarna/__tests__/aarnaPortParity.test.js` | closure count `57 → 59`, `rendersLink.length 21 → 23` (deliberate pin moves, documented) |
| `frontend/src/components/aarna/__tests__/aarnaIntegration.test.js` | boundary/route assertions for the new paths |
| `frontend/src/components/aarna/__tests__/aarnaShellIntegrity.test.js` | only if it pins the boundary or the layout predicate |
| `frontend/src/components/aarna/mock/data/pages.js` | **left dormant** — an explicit test that none of its placeholder sentences is rendered |

**Not touched**: `frontend/src/App.jsx` (unless the `*` handover proves to need a production-side
change — it should not), `layouts/CustomerLayout.jsx`, every production page, every service, `home-page/`.

## 9 · Acceptance criteria

1. **Switch off = nothing moves.** `/account/wishlist`, `/wishlist`, `/about`, `/contact`, `/privacy`,
   `/terms` and `*` render exactly today's production pages; production routes, redirects, query
   parameters and `document.title` values are unchanged.
2. **Switch on = the design's pages.** Those paths render inside the Aarna shell (design markup and
   classes, no Atelier chrome), and the ports generalise: `/wishlist` redirects inside the port.
3. **No fabrication.** No invented product, price, policy sentence, count or success state. Unavailable
   saved pieces are shown honestly; the design's prototype policy copy is never rendered; empty and
   error states say what is true.
4. **Functionality preserved.** Wishlist add/remove/toggle/move-to-cart, the guest-vs-authenticated
   split, `needsVariant → product page`, sign-in gating and `returnTo`, `/wishlist` →
   `/account/wishlist`, and every API contract are unchanged; no backend file is edited.
5. **Gates.** Aarna suites green (81 → ≈95 with the new suite), `src/**/__tests__` 234/234, `npm test`
   unchanged at 412/21/1, `aarna-port --check` exit 0, `audit:frontend-catalog` PASS, build exit 0,
   `git diff --check` clean.
6. **Untouched.** `home-page/` 0 diffs; Atelier still the default; the recovery backup intact.

## 10 · Test plan

**Unit/component (the existing harness: vite middlewareMode + `MemoryRouter` + `CustomerLayout` inside
`CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider`,
catalogue seeded via `catalogStore.applyCatalogSnapshot`):**

| # | test | what it pins |
|---|---|---|
| 1 | switch **off** on all six paths + an unknown path | the production pages, byte-for-byte shapes |
| 2 | switch **on** → the design's shell renders (`shop container`, `crumbs`, `Saved pieces`, `Wishlist`, count, `.grid-4`) | adoption |
| 3 | guest wishlist: saved ids from `localStorage` render cards; remove empties the grid and reaches the *empty* state | guest contract (client-only, 0 API calls) |
| 4 | unavailable saved piece | the honest block, remove-only, no substitute price/image |
| 5 | error state: `401/403` vs generic copy | the two distinct messages |
| 6 | `moveToCart` on a piece needing a size | navigates to the product page; no forced variant |
| 7 | `document.title` set and restored | preserved behaviour |
| 8 | info pages: the manifest's own `label`/`eyebrow`/`description` render; sibling links are registered routes | real content, no invention |
| 9 | **banned copy**: `No personal data is sent to a server`, `sample data for demonstration`, `prototype house`, `not connected to an order system` are **absent** | the truthfulness guard |
| 10 | banned imports: no `getByIds`, no `mock/data/products.js` catalogue read, no `infoPages` consumption | the port keeps the application's data boundary |
| 11 | `*` with the switch on → the design's 404 **inside** the Aarna shell | item 3 |
| 12 | `*` handover does not swallow the portals: `/admin/zzz` → `AdminNotFound`, `/employee/zzz` → the employee portal, `/cart` → production `Cart` | the mandatory guard |
| 13 | `aarnaPortParity`/`aarnaIntegration` re-pinned (57→59 closure, 21→23 link renderers, the new boundary predicates) | the port's own invariants |

**Browser (`.p8/tools/p8.mjs`, the Phase 7 recipe: real dev server, real bundle, every `/api/v1/`
request intercepted by a backend-shaped fixture, desktop 1440×900 + mobile 390×844):** switch off/on
for each new path; a guest add → remove cycle; a fixture-authenticated wishlist load, including the
unavailable entry; the four info pages; an unknown URL; the mobile menu's Wishlist/Account links; 0
page errors outside the sandbox's blocked Google Fonts.

**Labelling, mandatory in the phase report:** the browser readings are **intercepted-fixture** evidence
(no backend here); the authenticated wishlist is fixture-driven; the wishlist's real server round-trip,
guest-order claiming and every payment path stay **unverified** until a database and gateway exist.

## 11 · Risks and unverified behaviour

| risk | severity | mitigation |
|---|---|---|
| the `*` handover swallowing staff routes | medium | the explicit prefix guard + test 12; ship item 3 separately if you prefer |
| publishing the design's placeholder policy sentences | medium | tests 8–9; `mock/data/pages.js` left dormant |
| the wishlist page growing a second catalogue path | medium | test 10; reuse `toDesignProduct` + `useProductCovers` |
| confusing the `/wishlist` redirect | low | hand it to the port (as Phase 7 did for `/collection/:slug`) and test both |
| CTA targets that depend on live taxonomy (U1) | low | use `/shop`-style destinations that always resolve; record the rest |
| authenticated wishlist verified only against fixtures | known | labelled in every report; not presented as integration |
| empty-state/`ProtectedRoute` interactions on `/account/wishlist` | low | the page itself handles an anonymous read — pinned by test 5 |

**Unverified in this environment (unchanged by Phase 8):** anything needing PostgreSQL/Redis/Docker, a
payment gateway, real Google OAuth, or live taxonomy data; `VITE_STOREFRONT_HOME` in a deployed build
(unit-tested only); the payment-success path (stub gateway + local HMAC only).

## 12 · Stop condition

Audit and plan only. No implementation, no staging, no commit, no push, no PR, no merge, no Phase 9.
Awaiting approval of §7 before any code is written.
