# Phase 11 — Customer Account UI Audit (Stage 1)

**Status: audit complete — awaiting review. No implementation has begun.**
Date: 2026-10-14 · Branch `arena/649fd845-pfv1` · HEAD `ad31c164953c8f4d800a6d070425903343d8a9dc` · Tree `b968de0e35c661cd764aa12bdb18dacc07e18ddf`

Scope of this stage: **inspection and reporting only.** Phase 11 is a UI redesign/migration of the
existing customer-account surface into the Aarna (`home-page/`) visual language. Every behaviour —
routes, guards, contexts, services, API contracts, validation, redirects, guest-order access — is the
**production source of truth** and must survive the migration unchanged. `home-page/` is the **visual**
source of truth and is never edited. No dependencies were installed, no tests were run (see §9), no
account/order/payment mutation was invoked.

---

## 1 · Verified baseline

| item | checked | result |
|---|---|---|
| branch | `git branch --show-current` | `arena/649fd845-pfv1` ✅ |
| HEAD | `git rev-parse HEAD` | `ad31c164953c8f4d800a6d070425903343d8a9dc` ✅ (matches pin) |
| tree | `git rev-parse HEAD^{tree}` | `b968de0e35c661cd764aa12bdb18dacc07e18ddf` ✅ (matches pin) |
| staged | `git diff --cached --name-only` | 0 files ✅ |
| tracked modifications | `git status --porcelain -uno` | 0 ✅ |
| untracked | `git ls-files --others --exclude-standard` | 127 entries, all `.p3`–`.p10` tooling/evidence ✅ |
| `home-page/` | `git status --short -uall -- home-page` | 0 status lines (146 tracked files) ✅ |
| backup | `/home/user/pfv1-diagnostic-20261014T180927Z/backup/` | intact (patch + tarball + 414-entry manifest) ✅ |

This audit follows the approved metadata-only repair that returned the branch pointer from `10890db`
(the restored shallow clone) to `ad31c16`; the working tree was byte-identical to the commit before and
after that repair.

## 2 · Route and guard map (verified from `frontend/src/App.jsx`)

All 13 account URLs are served by the production route tree inside `<Route element={<CustomerLayout />}>`.

| path | component (`frontend/src/pages/account/`) | lines | guard |
|---|---|---|---|
| `/account` | `AccountDashboard` | 650 | `ProtectedRoute` *(App.jsx:489–498 block)* |
| `/account/profile` | `AccountProfile` | 392 | `ProtectedRoute` |
| `/account/addresses` | `AccountAddresses` | 247 | `ProtectedRoute` |
| `/account/orders` | `AccountOrders` | 368 | `ProtectedRoute` |
| `/account/settings` | `AccountSettings` | 212 | `ProtectedRoute` |
| `/account/security` | `AccountSecurity` | 371 | `ProtectedRoute` |
| `/account/preferences` | `AccountPreferences` | 151 | `ProtectedRoute` |
| `/account/ai-mirror` | `AiMirror` | 542 | `ProtectedRoute` |
| `/account/ai-shopping` | `AiShoppingAssistant` | 378 | `ProtectedRoute` |
| `/account/instagram-rewards` | `InstagramRewards` | 430 | `ProtectedRoute` |
| `/account/wishlist` | `pages/Wishlist.jsx` (production, 286) | — | **none** — guest-accessible; already migrated to the port in Phase 8 |
| `/account/orders/:orderId` | `OrderDetail` | 551 | **none** — guest order flow by design |
| `/account/orders/:orderId/track` | `OrderTracking` | 338 | **none** — guest order flow by design |
| `/account/orders/:orderId/return` | `OrderReturn` | 648 | **none** — guest order flow by design |
| `/wishlist` | `Navigate → /account/wishlist` (App.jsx:477) | — | none |

**Totals:** 5,278 lines of pages (`pages/account/*`, 13 files) over 2,151 lines of shared UI
(`components/account/*` 4 files / 658 lines; `components/orders/*` 12 files / 1,493 lines).

**`ProtectedRoute`** (`components/auth/ProtectedRoute.jsx`): while `isLoading` renders
`LoadingState label="Verifying atelier access..."`; unauthenticated → `<Navigate to="/signin?returnTo=…" replace>`
with `location.pathname + location.search` URI-encoded; otherwise renders the outlet. **The three order
sub-pages are deliberately NOT behind it** — they are the guest-order surface, and
`components/orders/OrderPageShell.jsx` branches on `isAuthenticated` to show the account shell or the
"You're viewing a guest order from this browser" note with `/signin?returnTo=%2Faccount%2Forders` and
`/signup?returnTo=%2Faccount%2Forders` links (guest orders are attached after sign-in by
`apiClaimGuestOrders` → `POST /orders/claim-guest`).

**Guard-path detail (verified):** a signed-out deep link to `/account/orders/:orderId` does **not**
redirect — `OrderDetail` calls `fetchOrder(orderId)`, receives 401/403 and renders `OrderErrorState`
(status + message + retry). This is a deliberate consequence of the guest-order design, not a defect to
fix in this phase. *(Behaviour verified by source; not executed end-to-end — see §10.)*

## 3 · Screen-by-screen functionality inventory (verified from source)

All 13 pages render inside one of two shared shells — `AccountShell` (10 pages) or `OrderPageShell`
(3 order pages). `AccountShell` = Breadcrumb → `AccountHero` → `AccountNav` → page body inside
`AtelierSection`. `AccountNav` is 11 tabs (Overview, Profile, Orders, Share & Earn, Wishlist *with live
`useWishlist().count` badge*, Addresses, Style, AI Shopping, AI Mirror, Settings, Security), horizontally
scrollable (`overflow-x-auto`), active tab underlined; exact match for Overview, prefix match otherwise.

| screen | what it does (all via existing contexts/services) | loading / empty / error / success states |
|---|---|---|
| **Dashboard** | `useAccount` profile greeting via hero; order summary from `useOrder`; wishlist count `useWishlist`; cart count `useCart`; personalised rail `getPersonalizedProducts` + `stylePreferences`; offers `offerRepository`; taxonomy tiles `taxonomyRepository`; recently viewed `useRecentlyViewed`; product covers `useProductCovers`/`mediaResolver` | skeleton/loading per section; empty rails omitted; failures degrade per section; no fabricated content |
| **Profile** | first/last name, email, phone (validated by `isValidEmail` / `isValidPhone`) → `useAccount().updateProfile` → `PATCH /customers/me`; canonical values only from server response | field errors, submit disabled while saving, success note |
| **Addresses** | list from `useAccount()`; add/edit via production `components/account/AddressModal.jsx` (432 lines); delete; set default → the five `customersApi` address calls; every mutation re-reads the canonical list | empty state, per-action errors, confirm-before-delete |
| **Orders** | `useOrder()` list + `ORDER_FILTERS` tabs + `matchesOrderSearch` search; `OrderCard` rows; `orderErrorCopy` | loading, filtered-empty, error with retry |
| **Order detail** | `fetchOrder` + `getTracking`; status badges, item list, summary panel, timeline, invoice preview (`InvoicePreview`), return summary; cancel via `ConfirmDialog` → `cancelOrder` | loading wins over empty; transport failure is an error, never an empty success; guest note (see §2) |
| **Order tracking** | `GET /orders/{id}/tracking` events → timeline + status badge + return summary | loading / error / no-events state |
| **Order return** | item selection + pickup method → `createReturn({ orderId, items, pickupMethod })` (idempotent, `POST /orders/{id}/returns`) | eligibility empty state, per-field errors, success confirmation |
| **Settings** | 5 communication toggles (`orderUpdates`, `smsNotifications`, `promotionalUpdates`, `stylingInvitations`, + email) → `useAccount().updatePreferences` → `PATCH /customers/me/preferences` | save state, success/error note |
| **Security** | change password (`validatePassword` ≥6 + `validatePasswordMatch`) → `useAccount().changePassword` → `POST /auth/change-password` (customer scope); active sessions list from `accounts.security`; "sign out other sessions" → `apiRevokeOtherSessions` | field errors, per-action feedback, session list empty state |
| **Preferences** | style chips (categories / fabrics / occasions / colours from `catalogueValues` + taxonomy) saved through `services/customer/stylePreferences` — **local storage only** (`pratikshya_preferences`, keyed by user id) | saved indicator |
| **Instagram rewards** | real API `GET /customer/instagram-rewards` + `POST /customer/instagram-rewards`; eligible orders computed from `useOrder()` (payment status + no pending/approved submission); coupon code with copy-to-clipboard; discount % derived from the server's approved coupon (defaults 10) | loading, empty submissions, per-field errors, success note |
| **AI Mirror** | virtual try-on: `generateTryOnPreview` (`VIRTUAL_TRY_ON_PROVIDER = "mock"`, local generated preview) + `aiMirrorMockData` templates; product selection from the live catalogue; recommendations via `RecommendationSections` (real `recommendationsApi`); add to bag/wishlist via `useCart`/`useWishlist` | staged progress states, error, empty |
| **AI Shopping** | chat assistant: `aiService` (**active provider = `mockAiProvider`**, labelled "live business data"); sessions in `aiSessionStore`; answers built by `aiResponseBuilder` over the real catalogue/taxonomy; product cards, add-to-bag/wishlist | thinking indicator, per-message error, session restore |

## 4 · API / service / state dependencies (verified)

**Contexts** (all untouched by this phase; all provided in `App.jsx`): `AuthContext` (customer session,
`pf_access_token`/`pf_refresh_token` scope `customer`, restore via `GET /customers/me`), `AccountContext`
(provider mounted at `App.jsx:187`; wraps the customer routes), `CartContext`, `WishlistContext`,
`OrderContext`, `ShoppingContext`, plus app-level `CatalogBootstrap` (hydrates catalogue/taxonomy, also
in the port).

**`services/api/customersApi.js`** (296 lines): `GET/PATCH /customers/me`, `PATCH /customers/me/preferences`,
`POST /customers/me/sessions/revoke-others`, `GET/POST /customers/me/addresses`,
`PATCH/DELETE /customers/me/addresses/{id}`, `POST /customers/me/addresses/{id}/default`
(+ admin variants out of scope).

**`services/api/ordersApi.js`** customer surface: `POST /orders`, `GET /orders` (paged/sorted),
`GET /orders/{id}`, `GET /orders/{id}/tracking`, `POST /orders/{id}/cancel`,
`POST /orders/{id}/returns`, `GET /orders/{id}/returns/{returnId}`, `POST /orders/claim-guest`.

**Other API/services:** `instagramRewardsApi` (customer GET/POST), `recommendationsApi`
(`apiTrackProductInteraction`), `authApi.apiChangePasswordCustomer`, `services/customer/stylePreferences`
(**localStorage**), `services/customer/personalization`, `offerRepository`, `taxonomyRepository`,
`mediaResolver` + `hooks/useMedia.useProductCovers`, `hooks/useRecentlyViewed` (localStorage; server for
signed-in users), `services/ai/*` + `services/aiMirror/*` (**mock providers**, flagged below),
`config/orderConfig` (`ORDER_STATUS`, `RETURN_STATUS`, `ORDER_FILTERS`, `getReturnStatus`),
`utils/orders` (`formatOrderDate`, `orderItemCount`, `matchesOrderSearch`), `utils/shopping`
(`formatINR`, `defaultSelection`, `requiresVariantChoice`), `utils/validation` (`isValidEmail`,
`isValidPhone`, `validatePassword`, `validatePasswordMatch`, `formatPhone`).

**Cross-feature coupling to preserve:** dashboard reads cart + wishlist counts; order success
(already migrated, Phase 9) links to `/account/orders/{id}` and `/account/orders/{id}/track`; the ported
checkout already imports the production `components/account/AddressModal.jsx` and calls
`account.addAddress` / `account.addresses` — pinned in `aarnaCheckoutPage.test.js:371–373`. The ported
wishlist already lives at `/account/wishlist`.

## 5 · Existing UI, responsive and accessibility observations (code-supported)

* **Vocabulary today:** Atelier design-system components — `AtelierButton` (97 uses across the 13 pages),
  `EditorialHeading` (37), `Rule` (17), `StateBlock`s `ErrorState` (12) / `EmptyState` (10) / `LoadingState` (9),
  `AtelierBadge` (7) — inside Tailwind utility layouts; no account-specific stylesheet exists.
* **Responsive coverage is uneven** (counts of `sm:/md:/lg:/xl:` utilities per page): Dashboard 40,
  AiMirror 24, OrderDetail 10, OrderReturn 8, Profile 7, AiShoppingAssistant 7, OrderTracking 7,
  Security 6, Orders 5, InstagramRewards 5, Addresses 4, **Preferences 1, Settings 1**. The two accounts
  with ~no breakpoints are the smallest pages; worth verifying at 390 px during migration.
* **Accessibility:** `role`/`aria-*` usage per page — Dashboard 20, Orders 16, AiMirror 10, Security 9,
  Addresses 9, Detail/Tracking/Shopping 8 each, Return 6, Profile 3, Settings 3, Preferences 2,
  **InstagramRewards 0** (no `aria-*`/`role` at all — record only, not fixed here). Shared order states do
  this well: `OrderLoadingState` uses `role="status"` + `aria-live` + `aria-busy`; `OrderErrorState` uses
  `role="alert"`. Several pages manage `document.title` and restore it on unmount.
* **A11y-relevant structure:** `AccountNav` is a labelled `<nav aria-label="Account navigation">`;
  the wishlist count badge is decorative text inside a link (no `aria-label` count).
* **Guest vs member presentation** differs only by the `OrderPageShell` branch — no route-level split.

## 6 · Design references — what exists, what must be adapted

| design source (`home-page/`, never edited) | what it gives | use for |
|---|---|---|
| `src/pages/Account.jsx` (50 lines) | the account page frame (`.info.container.account`, breadcrumbs, `.label`, `.display.info__title` with `<em>`, `.info__lead`) and the **three-tile grid** `.account__tiles` / `.account__tile` (`strong` serif 40 px count + 11 px uppercase label) | `/account` overview: tiles for saved pieces / orders / bag; the page's heading idiom |
| `src/pages/TrackOrder.jsx` (26 lines) | inline form + note vocabulary: `.form--inline`, `.sr-only`, `.form__err` (`role="alert"`), `.form__note` (`role="status"`) | inline forms and status notes on any migrated screen — **not** as a tracking page: it performs no lookup and the application has no lookup-by-number endpoint (Phase 8 §5.8 decision stands) |
| the port's existing vocabulary — `aarna.css:1158–1166` already carries `form--inline`, `form__err`, `form__note`, `account__tiles`, `account__tile` | the account tiles/form classes are **already ported** and available under `.aan-root` | immediate reuse; new rules must be written one class deeper than ported design selectors (`.aan-root .form …`) per the Phase 10 specificity finding |
| everything else | **no design counterpart** — the design has no profile, addresses, orders, settings, security, preferences, rewards or AI screens | adapt using the design's tokens/patterns (cards, rules, headings, buttons, form vocabulary) exactly as Phase 9 did for checkout and Phase 10 for auth |

**Do not port** the design Account.jsx's behaviour: it is a localStorage prototype that says "no server
account is created" on the page. The application has real accounts; the migrated screens must keep the
real contexts and must not copy that prototype's copy or its fake sign-in.

## 7 · Risks, missing information and regression-sensitive areas

**R1 — The account surface has no dedicated tests.** No suite mounts any account page through a router:
`tests/recommendationRendering.test.js` SSR-loads `AiMirror.jsx` directly (loading state, empty-catalogue
copy, real product href/media), `tests/recommendations.test.js:98` statically pins
`RecommendationSections placement="mirror"` inside `AiMirror.jsx`, and
`tests/retired-demo-architecture/phase2StorefrontCollectionWiring.test.js` statically guards
`AccountHero.jsx`/`AccountOrders.jsx`/`AccountDashboard.jsx` against hardcoded arrays and obsolete routes.
Everything else — guards, forms, addresses, order flows, settings, security, preferences, rewards — is
uncovered. The migrated versions must arrive with their own suites (§8), and the four existing touches
above pin **production** files, which stay in place.

**R2 — Boundary pins that must move when account is adopted by the port** (the Phase 10 precedent):
* `src/components/aarna/__tests__/aarnaNotFoundHandover.test.js` — the test "the account and the reset
  screen never move…" (loops `["/reset-password", "/account/orders", "/account/addresses"]`, ~line 272)
  and "a customer URL that IS served keeps its own page while the switch is on" (~line 283, asserts
  `/account/orders` does **not** mount `aan-root`); its `KEPT_ON_PRODUCTION` list (~line 71) also names
  the account paths, though the assertion it feeds (`isAarnaCatchAllPath === false`) remains valid
  because the port's route table registers `/account/**` as a dynamic shape.
* `src/components/aarna/__tests__/aarnaListingPage.test.js` — the loop asserting
  `["/account/orders?home=aarna", "/reset-password?home=aarna"]` do not mount the port (~line 236) and
  its surrounding comment; after Phase 11 `/reset-password` is the only production-side customer screen.
* Comments only: `config/storefrontHome.js` catch-all block and `AarnaStorefront.jsx` route comments
  currently state `/account/**` is not adopted.
* Unchanged by Phase 11: `aarnaCartPage.test.js:302` (`/account/orders` is not a journey path),
  `aarnaIntegration.test.js` (`/track-order → /account/orders`, `AARNA_WISHLIST_PATHS`),
  `aarnaCheckoutPage.test.js:371–373` (checkout imports the production `AddressModal` + account context),
  `storefrontShell.test.js` (Atelier shell destinations).

**R3 — Guard parity.** The port must mirror the production guard map exactly: the ten `/account/*`
screens behind the production `ProtectedRoute` (which already redirects to the ported `/signin` when the
switch is on), and `/account/wishlist` + the three order sub-routes **unguarded**, preserving guest-order
viewing, the guest note, and `claimGuestOrders`.

**R4 — AI screens are mock-backed.** `aiService`'s active provider is `mockAiProvider` and virtual try-on
is `VIRTUAL_TRY_ON_PROVIDER = "mock"` (`aiMirrorMockData`, `mockVirtualTryOnProvider`). Rewards, orders,
addresses, profile, settings, security and recommendations are real API-backed; the AI screens are not
fully. Phase 8 already flagged "whether they belong in a storefront migration at all" as a **product
question** (Phase 8 §5.7/§5.9). A migration must neither dress the mock output as live nor silently drop
the screens; recommendation: migrate last, keep the providers exactly as they are, and record the
decision.

**R5 — Preferences are local, not server-side.** `AccountPreferences` writes
`pratikshya_preferences` (localStorage, keyed by user id) and `AccountSettings` writes
`PATCH /customers/me/preferences`. A migration must not "helpfully" unify them (API-contract change).

**R6 — Environment.** `frontend/node_modules` is absent (and the `.p10` browser kit's `node_modules`
too): no test, build or browser probe can run until `npm install` (and the kit reinstall) is done —
explicitly out of scope for this read-only stage.

**R7 — Missing design references.** Twelve of the thirteen screens have no design counterpart (§6), and
the design's nav has no account area: the migrated nav/hero must be composed from existing design
patterns. This is a design-authoring exercise inside the migration, as it was for auth (Phase 10) —
worth an explicit review checkpoint before the pages are written.

## 8 · Proposed UI-only migration sequence (small, reviewable steps)

**Approach — recommended (Option A, consistent with Phases 8–10):** add port-side screens under
`frontend/src/components/aarna/pages/account/` (+ `components/aarna/aarna.account.css`) that re-draw the
**presentation** in the design's vocabulary while every behaviour is re-wired to the **unchanged**
contexts/services (the Phase 9 method: new page, real providers, no duplicate logic). Production account
pages stay exactly as they are and continue to serve the Atelier storefront; the switch
(`?home=aarna` / `VITE_STOREFRONT_HOME=aarna`) selects the port. **Alternative (Option B):** restyle the
production pages in place — one visual language for both storefronts, but it touches 13 production pages
+ 16 shared components that the Atelier storefront depends on. This audit recommends **A**; the choice
needs explicit approval before Stage 2.

| step | contents | files | tests |
|---|---|---|---|
| **0** | Environment + evidence groundwork: `npm install` (frontend), reinstall `.p11` browser kit, start 5174/5175 for probes | — | baseline battery captured before any edit |
| **1** | **Boundary + shell**: `AARNA_ACCOUNT_PATHS` (10 static) + dynamic patterns (`/account/orders/:id`, `/track`, `/return`), `isAarnaAccountPath`, `useAarnaAccount`, union update; `AarnaStorefront` account routes mirroring the guard map (§R3); account frame + nav in design vocabulary; move the §R2 pins | `config/storefrontHome.js`, `components/aarna/AarnaStorefront.jsx`, new `pages/account/AccountFrame.jsx`, `aarna.account.css` | new `aarnaAccountShell.test.js` (guard map on/off, tiles/frame markers, nav destinations, badge) + updated pins |
| **2** | **Overview** `/account` — tiles (`account__tiles`), real counts from cart/wishlist/orders, recent orders, rails | `pages/account/Overview.jsx` | `aarnaAccountOverviewPage.test.js` (empty vs populated, no fabricated counts) |
| **3** | **Profile + Addresses** — real validation + `updateProfile`; `AddressModal` reuse | `pages/account/Profile.jsx`, `Addresses.jsx` | two suites (validation parity, canonical refresh after mutations) |
| **4** | **Orders + detail + tracking + return** — statuses, filters, search, cancellation, returns, invoice; guest branch preserved | `pages/account/Orders.jsx`, `OrderDetail.jsx`, `OrderTracking.jsx`, `OrderReturn.jsx` | 2–3 suites incl. 401/403/404 states, guest note, no fabricated success |
| **5** | **Settings + Security** — toggles + password/session actions | `pages/account/Settings.jsx`, `Security.jsx` | two suites (toggle persistence, password rules, revoke feedback) |
| **6** | **Preferences + Instagram rewards** — local style store kept local; real rewards API | `pages/account/Preferences.jsx`, `InstagramRewards.jsx` | two suites (local-store parity, eligible-order rules, no fake coupon) |
| **7** | **AI Mirror + AI Shopping** — only after the R4 product decision; providers untouched | `pages/account/AiMirror.jsx`, `AiShoppingAssistant.jsx` | two suites (loading/empty/error parity, mock label honesty) |
| **8** | **Tooling + evidence**: `aarna-port.js` `ADDED` entries for every new file; `--check`; full battery; desktop 1440 + mobile 390 probes and screenshots for the migrated screens | `scripts/aarna-port.js`, `.p11/evidence/*` (untracked) | probe readings + doc |

Each step: one commit-sized change with its own suite, parity `--check`, and the full test battery; no
step touches `home-page/`, `App.jsx`, the production account files, contexts, services, validators or
API contracts.

## 9 · Verification performed in this stage

Read-only commands only: `git rev-parse/status/ls-files/worktree`, `sed`/`grep` reads of `App.jsx`,
`pages/account/*` (all 13), `components/account/*`, `components/orders/*`, `context/AccountContext.jsx`,
`context/OrderContext.jsx`, `services/api/customersApi.js`, `services/api/ordersApi.js`,
`services/api/instagramRewardsApi.js`, `services/customer/stylePreferences.js`,
`services/ai/aiService.js`, `services/aiMirror/virtualTryOnService.js`, `components/auth/ProtectedRoute.jsx`,
`config/storefrontHome.js`, `components/aarna/AarnaStorefront.jsx`, `router/routes.js`,
`components/aarna/components/layout/Header.jsx`, `components/aarna/components/navigation/MobileMenu.jsx`,
`home-page/src/App.jsx`, `home-page/src/pages/Account.jsx`, `home-page/src/pages/TrackOrder.jsx`,
`home-page/src/styles/pages.css`, `docs/PHASE-8-CUSTOMER-FACING-AUDIT.md` §5.7–5.9, and the five
documents' boundary-pin test files. **No tests, build or probe were run** (dependencies absent, §R6) and
**no live backend, order or payment call was made.**

## 10 · Explicitly unverified in this stage

* End-to-end behaviour against a running backend/catalogue: every flow above is verified at **source**
  level (call sites, handlers, states), not by execution — there is no database or backend in this
  workspace.
* The 401/403/404 rendering differences between the three order sub-pages (read as code; not executed).
* Real-provider behaviour of AI Mirror / AI Shopping (both mock today — §R4).
* Mobile layouts of the 13 pages (no dependencies installed; no browser run).
* Whether `AccountPreferences`' localStorage store and `AccountSettings`' server preferences are
  intended to diverge (recorded as-is; a product question, not a defect to fix here).

## 11 · Statement of change

**No application source, style, test, configuration, API or `home-page/` file was modified. No Git
state was changed: nothing staged, committed, pushed, merged, reset, rebased or switched; the
diagnostic worktree and the backup remain intact.** The only file added by this stage is this report,
`docs/PHASE-11-STAGE-1-AUDIT.md`, which is untracked pending review.
