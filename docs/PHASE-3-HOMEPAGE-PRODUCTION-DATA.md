# Phase 3 — Homepage Production Data Integration & Content Completeness

**Status: complete.** Every gate is green, the four integration defects found in this phase are fixed and
re-measured in a real browser, and the one regression this phase introduced (a test-only media-guard
violation) is fixed. **Nothing is committed** — per the phase instruction the changes sit in the working
tree on top of PR #37 (`1d64755`).

| | |
|---|---|
| Surface | `?home=aarna` (the ported 12-section homepage). Atelier stays the production default; `VITE_STOREFRONT_HOME` untouched; `home-page/` untouched. |
| Changed | 11 files under `frontend/src/components/aarna/` + `frontend/scripts/aarna-port.js` |
| Added | `src/components/aarna/utils/mediaFallback.js`, `src/components/aarna/__tests__/aarnaLiveCatalogue.test.js` |
| Evidence | `.p3/evidence/` (22 screenshots = 11 before/after pairs) + `.p3/tools/` (the 7 probe scripts) |
| Gates | `194/194` frontend suites · `npm test` failure set identical to PR #37 · `npm run build` ✅ · `audit:frontend-catalog` PASS · `aarna-port.js --check` exit 0 · `git diff --check` clean |

---

## 1 · Audit findings and the defects fixed

**Method.** Read-only inspection of `home-page/` (design source of truth), the ported surface, the
boundary adapters and the production services; then the port driven in headless Chromium against a
production-shaped fixture (`catalogue2.mjs`: 13 records with real taxonomy slugs, real staged plate
paths, backend `snake_case` offers, plus an image-less record and a 404 plate), with the catalogue
endpoints served by request interception so the app runs its real production read path. Finally an A/B
run of the *same payloads* against PR #37's tree and the fixed tree (`final.mjs`), so every difference in
the screenshots is code, not data.

### Defect 1 — the catalogue arrives after mount; three sections froze on the pre-data snapshot
`Bestsellers` (`useMemo(..., [filter])`), `JewelleryTheatre`, `KurtiLookbook` and the `SearchOverlay` read
the catalogue once. The design ships its catalogue as an array, so a memo keyed on UI state alone is
harmless there; here the catalogue is fetched, and the memo captured the empty snapshot.
*Measured (6 s-late `/api/v1/products`, no scroll, no click):* pre-fix the Bestsellers rail still said
"No pieces in this filter yet." ten seconds in, the jewellery tabs counted `0 0 0 0 0 0`, the kurti rail
rendered 0 pieces — while the un-memoised rails beside them rendered every live piece (saree 3, men 2,
kids 3). **Fix:** every memoised catalogue read depends on the port's own catalogue revision
(`useCatalogueRevision()` → the application store's `version` via `useSyncExternalStore`).
*After:* same payload, same delay → **19 cards** (best 8, saree 3, jewel 2, men 2, kids 3, kurti 1).

### Defect 2 — a sample-catalogue disclaimer on a live rail
`A curated selection from our sample catalogue — not a verified sales ranking.` → **`A selection from the
house catalogue — the backend does not yet expose a verified sales ranking.`** No invented ranking, and
no false statement about the data.

### Defect 3 — a 404 media URL painted the browser's broken-image glyph and alt text
Every ported surface that renders a catalogue photograph attaches the same fallback now (7 plate lines:
`ProductCard` cover + secondary, `JewelleryTheatre` stage, `CartDrawer` line, `QuickViewModal` main +
thumbnails, `SearchOverlay` hit). `hideBrokenMedia` drops the failed `<img>` and **substitutes nothing**;
the design's reserved media frame stays. *Measured:* computed `display:none`, media box unchanged at
317×396 (1440) and 173×216 (390), caption + price untouched — versus the pre-fix card that showed the
torn-image glyph and the product name printed over the plate.

### Defect 4 — canonical path resolution matched the subcategory before the category pair
`canonicalPathFor` filed `the-bride/lehengas` under `women/lehengas` and `girls/casual-sets` under the
boys' category, because *subcategory names repeat across categories* (`lehengas`/`sarees` in both women
and the-bride, `casual-sets` under both girls and boys). Consequence: bridal rails lost their own pieces
and their From-price. **Fix:** resolve the record's category/subcategory **pair** (consistent pair →
subcategory-only → category-only → `null` ⇒ the Women's fallback). *Measured:* bridal lehenga →
`[bridal, the-bride, lehengas]` (was `/women/lehengas`), girls set → `[kids, girls, casual-sets]` (was
`/kids/boys/casual-sets`), `getProductsFor('the-bride')` = 2, and the bridal copy gains "From ₹89,000."
only after the fix.

### Not defects (recorded so they are not re-opened)
* **The promotion band was never broken.** With the backend's real `_coupon_to_dict` payload it renders
  (`Festive 10% off`, `Code UTSAV10`, "Valid until 1 January 2027") and the expired `STALE25` never
  surfaces. The earlier empty band was a `camelCase` fixture artefact.
* **SearchOverlay** mounts on open and therefore reads fresh; it took the revision anyway so a
  pre-hydration mount cannot freeze it. Opened after the catalogue lands it returns 5/5 hits.
* **Bridal/collage "0 cards"** is not a defect: the bridal section is copy + From-price plates and the
  collage is four destination tiles with live piece counts — neither renders `.pcard`s.

### Regression this phase introduced, and fixed
The new suite's fixture carried concrete media literals, which tripped the repo-wide Phase 6 media guards
(`no module takes a runtime dependency on public/images…`, `no concrete migrated asset path is hardcoded
anywhere in src`). The fixture now composes the media root from a constant; `npm test`'s failure set is
**identical to PR #37's**.

---

## 2 · Files changed, and why

| File | Δ lines | Why |
|---|---|---|
| `scripts/aarna-port.js` | 142 | three new ordered rewrites (`live-catalogue`, `media-fallback`, `bestsellers-note`) + re-measured pins; `--check` stays green |
| `mock/data/products.js` | 74 | exports `useCatalogueRevision()`; `canonicalPathFor` resolves the category/subcategory pair |
| `components/sections/Bestsellers.jsx` | 8 | revision in the memo deps; house-catalogue note |
| `components/sections/JewelleryTheatre.jsx` | 9 | revision in the memo deps; stage plate fallback |
| `components/sections/KurtiLookbook.jsx` | 6 | revision in the memo deps |
| `components/shopping/SearchOverlay.jsx` | 11 | revision; hit plate fallback |
| `components/product/ProductCard.jsx` | 5 | both plate lines carry `onError` |
| `components/shopping/QuickViewModal.jsx` | 5 | main plate + thumbnails |
| `components/shopping/CartDrawer.jsx` | 3 | bag-line plate |
| `__tests__/aarnaShellIntegrity.test.js` | 11 | +1 test: no prototype/sample copy reaches the customer's page |
| `utils/mediaFallback.js` | +41 (new) | `hideBrokenMedia` — no asset, no replacement, no second request |
| `__tests__/aarnaLiveCatalogue.test.js` | +306 (new) | 7 regression tests pinning all four defects |

Every CLOSURE (copied) file is changed **only** through a named rewrite in the port tool and regenerated
with `--copy`; the boundary modules and the suites are hand-written. `--copy`/`--check` and the parity
suite's per-file diff pins agree.

---

## 3 · Where each homepage section's data comes from

All catalogue reads go through the boundary (`src/components/aarna/mock/data/products.js`) into the
production store (`services/catalog/catalogStore.js`, hydrated from `/api/v1/products?sort=recommended&page=1&pageSize=100`
+ categories + collections + home + offers + per-category subcategories). Media resolves only through
`services/media/mediaPaths.js`. Promotions resolve through `services/offers/offerRepository.js`.

| Section | Read | Source / note |
|---|---|---|
| Hero | — | design art via the media resolver; no catalogue claim |
| CategoryCollage | `getProductsFor(key)` ×4 | live piece counts on the women/men/kids/essentials tiles; destinations via `router/index.jsx` |
| SareeLookbook | `getProductsFor("sarees")` | rail + tab counts |
| BridalCampaign | `getProductsFor(key)` | `the-bride` / groom rails; From-price = live minimum |
| JewelleryTheatre | `getByDepartment("jewellery")` | revision-subscribed |
| PromoBanner | `getActivePromotion()` | `/api/v1/offers` → normalise → status → customer-visible → design promotion |
| MensEditorial | `getByDepartment("men")`, `getProductBySlug("cocoa-bandhgala-ensemble")` | editorial pick addressed by canonical slug |
| KidsPlayground | `getByDepartment("kids")` | |
| Bestsellers | `getFeaturedBy(filter, 8)` | revision-subscribed; note wording fixed |
| KurtiLookbook | `getProductsFor(active)` filtered to kurtis | revision-subscribed; pairing pieces counted live |
| Newsletter | — | capability probe reports **unavailable** → copy + disabled controls, never a fake success |
| TrustStrip | — | design facts only, no invented business claims |

Cards/actions use the app's existing contexts: `ShopContext` adapts `useCart`/`useWishlist`; Quick view,
Add (option picker when the record has a group), wishlist, `/product/:slug` and category links all stay
inside the existing production routes.

---

## 4 · Behaviour when data is empty, failed or unavailable (measured)

| State (same fixture) | Result |
|---|---|
| **Populated**, catalogue delayed 6 s | 19 cards after the data lands; promo band present; search 5 hits; 0 broken images of 21; 0 page errors; `docW == innerW` at 1440 and 390 (no overflow) |
| **Empty catalogue** (all endpoints 200/empty) | 0 cards, deliberate empty states ("No pieces in this filter yet."), promo absent, docH 9793, 0 page errors |
| **Every endpoint 500** | identical to empty — docH 9793, same empty states, 0 page errors |
| **Partial** (only `/api/v1/products` 500) | 0 catalogue cards, **promotion still renders** (offers answered), 0 page errors |
| **Offers 500** | full catalogue renders (19 cards), promo band simply absent, 0 page errors |
| **Every product plate 404** | failed plates hidden, reserved frames kept, captions/prices intact, 0 page errors |

No fake delays, no hardcoded success responses, no fallback mock data in production paths, and no
fabricated products, prices, discounts, ratings, inventory, availability or promotions anywhere.

---

## 5 · Tests, build, audits

| Gate | Result |
|---|---|
| `node --import ./scripts/node-loader/register.mjs --test "src/**/__tests__/*.test.js"` | **194 / 194 pass** (was 186; +7 live-catalogue, +1 shell-integrity) |
| `npm test` (`tests/*.test.js`) | 434 tests · 412 pass · 21 fail · 1 skipped — **failure set identical to PR #37** (all 21 pre-existing/env-only) |
| `npm run build` | ✅ `dist/index.html 3,680.02 kB │ gzip 1,375.61 kB` |
| `npm run audit:frontend-catalog` | PASS (taxonomy, validation, canonical media, listing routes, scopes, no embedded inventory) |
| `node scripts/aarna-port.js --check` | exit 0 · "the port matches the design (50 copied files, 88885 bytes of CSS)" |
| `git diff --check` | clean |
| Browser | `final.mjs` A/B (fixed tree vs PR #37 tree), `audit.mjs` (populated/empty/error/partial/offers states), `media.mjs` + `media2.mjs` (404 plates), `flows.mjs` (quick add → picker → bag line "Temple Gold Bangles", image ok, subtotal ₹9,800; wishlist false→true; card → `/product/katan-silk-saree-ivory`; category → `/women`; 0 page errors) |

Evidence: `.p3/evidence/` — 11 `pr37-*` / `fixed-*` pairs at 1440 and 390 (Bestsellers, jewellery, kurti,
bridal, full page) and `*-10-404-card-1440/390` (the failed-plate fix). Reproduce with `.p3/tools/final.mjs`
(fixed tree on :5174, PR tree on :5175 with `npm ci` + `git archive 1d64755`).

---

## 6 · Remaining backend dependencies and production limitations

* **No verified sales ranking.** The bestsellers rail is `featured`-flagged catalogue order; the copy says
  so rather than implying a ranking.
* **No newsletter endpoint.** The boundary reports the capability as unavailable; the form stays disabled
  (unchanged from Phase 2D).
* **Promotions are percentage-only** in the design promotion shape; other discount types are simply not
  surfaced as design promotions rather than being reinterpreted.
* **No server-side placeholder for missing media.** The client hides a failed plate and keeps the layout;
  a backend-side placeholder/`placeholder_url` would be the production-grade fix.
* **Incomplete store settings/contact.** Email/hours are `null` in the boundary, social list is empty —
  the footer filters them out rather than inventing values.
* **Subcategories endpoint** answers an empty set in the fixtures used here; listing routes therefore rely
  on the canonical taxonomy tree.
* **Probe gaps (explicit):** the *direct* add path (a record with no size/colour group) could not be
  exercised in the browser — every fixture record carries one, so the picker opens; the picker → add →
  bag path is proven instead. `audit.mjs`'s `sectionCopy.sareeTabs` selector matches nothing, so its empty
  array is not evidence about the saree tabs.
* **Sandbox-only:** the backend is not runnable here (`/api/v1/*` → unreachable, no DB) and Google Fonts
  are blocked, so all browser evidence uses request interception and fallback-font geometry; no geometry
  claim is made from it.
* **Not committed.** No commit, push or PR was made in this phase.
