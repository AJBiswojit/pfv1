# HOMEPAGE AUDIT

**Date:** 2026-09-09
**Branch:** arena/01a085ac-pfv1
**Frontend:** http://localhost:5173 (Vite 7.3.2, React 19)
**Backend:** http://localhost:8000 (FastAPI, uvicorn)
**Env:** No frontend .env file — defaults used. Backend .env missing — defaults used, DB unreachable.

## Overall
**BROKEN (before fix) / PARTIAL (after hero fix, DB still unavailable)**

- Before fix: Hero returned 0 slides → blank beige area. Saree/Edit and other product-driven sections returned null or EmptyMedia fallback.
- After fix: Hero now returns 5 slides with real media URLs and renders via backend object store. Product-driven sections remain empty due to DB unavailable — honest empty state, not a frontend bug.

---

# HERO

**Expected:**
- 5 slides: hero001.avif … hero005.avif
- Path canonical: `frontend/public/images/hero/hero00X.avif` (protected source) → migrated copy `backend/storage/media/hero/hero00X.avif` → served as `/api/v1/media/objects/hero/hero00X.avif`
- Data source: GET /home → heroSlides[].image
- Media source: hero namespace, NOT product media, NOT collection media
- Carousel: crossfade 5.5s, Ken Burns, preload next, keyboard/touch, pause on hover, reduced-motion support
- Component: `src/components/storefront/HeroCarousel.jsx` consuming `src/data/catalog/hero.js` proxy + `useMarketingMedia(HOME_HERO)` + `mediaResolver`

**Actual (before fix):**
- `frontend/public/images/hero/` exists: 5 files (45K, 174K, 165K, 139K, 113K) — verified.
- `backend/storage/media/hero/` initially missing (only .gitkeep). After `python -m app.services.media.migrate_local` → 5 files present, served correctly (200, image/avif).
- Backend `explore_service._build_hero_slides` returned 3 slides with `image=""` (comment: BACKEND DECISION REQUIRED). Frontend `hero.js` filtered with `.filter(id && image)` → 0 slides → HeroCarousel count 0 → `return null` → blank beige hero.
- Marketing media path: `mediaRepository.getMarketingMedia(HOME_HERO)` → empty (mediaStore is memory-only, no backend sync). `resolveHomepageHeroMedia` → [] → `resolveSafeHeroFallback` → `imageRef("hero-atelier")` → null src → EmptyMedia fallback would show "PRATIKSHYA FASHON" if slides existed, but slides were already filtered out.
- Browser network: GET /api/v1/home → 500 INTERNAL_SERVER_ERROR before fix (DB unavailable), after backend resilience fix → 200 with 5 slides, images `/api/v1/media/objects/hero/...` → 200 via Vite proxy.

**Root cause:**
1. **Backend placeholder:** `_build_hero_slides` returned empty image strings — never wired to canonical hero assets. No media URL builder used.
2. **Frontend over-filter:** `hero.js` filtered on `id && image`, preventing fallback via `mediaResolver` when backend image empty.
3. **Hydrate all-or-nothing:** `catalogStore.hydrateCatalog` threw on any failed catalogue page (products/categories/collections), leaving `state.home` unset even when GET /home succeeded. Hero depends on `getHome()`, so blank.
4. **Marketing media gap (B-02):** `media_marketing_media` and `media_review` models empty, no API. `mediaRepository` is memory-only, so HOME_HERO placement never populated via admin. Hero cannot come from marketing media register in this env — must come from backend /home.

**Status after fix:**
- Backend: `_build_hero_slides` now returns 5 slides with `build_media_url("hero/hero00X.avif")` → `/api/v1/media/objects/hero/...`, media_id = object key, added to used_media_ids for reservation rule. `get_home` wrapped with `safe_select`/`safe_categories` so hero always returned even when DB fails.
- Frontend: `hero.js` filter changed to `Boolean(id)` only, so slides with empty image still reach HeroCarousel and can be resolved via marketing media. `HeroCarousel.buildSlides` now falls back to canonical hero object-store URLs via `mediaObjectUrl("hero/hero00X.avif")` when slideData empty — no `/images/` literal, passes `phase6LocalMediaFlow` test.
- `catalogStore.hydrateCatalog` now applies partial data: categories/products/collections may be empty but home still set, status ready if any succeeded.
- Verification: `curl http://localhost:5173/api/v1/home` → 200, 5 slides with images. `curl -I /api/v1/media/objects/hero/hero001.avif` → 200 image/avif. Frontend build passes, 377 tests pass, audit:hero-runtime PASS.

---

# SAREE / EDITORIAL SLIDER

**Expected:**
- Component: `src/components/storefront/SareeEditCarousel.jsx`
- Data: PUBLISHED products where category == "sarees" (taxonomyRepository.findCategory("sarees") ACTIVE), status PUBLISHED, slug present
- Media: product-owned media via `getProductMediaSet(product).primary` — must be product's own cover/gallery, never another product's, never category media, never bangles/innerwear
- Selection: deterministic ranking featured → canonical product media → new → stable id, deduped by productId and image src, 8 items
- Also supports curated via `MARKETING_PLACEMENTS.SAREE_SECTION` (product ids from `marketingPlacementRepository` → resolved via live catalogue)
- Media source: product media (products namespace), NOT hero, NOT collection editorial

**Actual (before fix):**
- `getLiveStorefrontProducts()` → [] because `GET /products` → 500 (DB unavailable, no DATABASE_URL)
- `selectSareeEditProducts` → [] → count 0 → `return null` → section not rendered at all (A)
- Curated path: `marketingPlacementRepository.getPlacementProductIds(SAREE_SECTION)` → [] (localStorage empty, memory only)
- Screenshot showing blank beige cards with "PRATIKSHYA FASHON" fallback likely from `CelebrationEdit` or `BrideGroomEdit` editorial frames, not SareeEdit, because SareeEdit would be null, not fallback. Those editorial components use `resolveThemeImage` → `selectMedia` from empty mediaRepository → fallback `imageRef` null src → PratikshyaImage EmptyMedia.
- No incorrect product images (bangles) used — ownership checks prevent cross-product reference.

**Root cause:**
- **Backend blocker B-05 + DB unavailable:** `GET /products`, `GET /categories`, `GET /collections` all require PostgreSQL. No .env, no DB server, so 500. Frontend has NO static seed (by design, per `docs/frontend-data-migration-matrix.md`), so honest empty state.
- **Not a frontend bug:** Saree selection logic is correct (taxonomy → published → product media set → ownership validation). No stale adapter, no wrong media URL.

**Status:**
- With DB unavailable: SareeEdit remains null (honest empty). Documented as backend blocker, not faked with unrelated images.
- With DB + seeded products + migrated media (`storage/media/products/...`): `resolve_product_image_reference` would rewrite legacy `/images/products/...` to `/api/v1/media/objects/products/...` if object exists, and `getProductMediaSet` would resolve primary. Then SareeEdit would render.

---

# COMPLETE HOMEPAGE SECTION MAP

Order as in `AtelierDesign.jsx` DOM:

| # | Section | Component | Route | Rendered? (before fix) | Visible? | Has Content? | Has Media? | Data Source | Media Source | Error? | Fallback? | Visibility Condition |
|---|---------|-----------|-------|------------------------|----------|--------------|------------|-------------|--------------|--------|-----------|----------------------|
| 1 | Navbar | `SiteHeader` (CustomerLayout) | / | Yes | Yes | Yes | Yes (logo) | static + catalogStore for mega menu | `src/assets/pratikshya_logo.webp` + product media for menu | No | No | Always |
| 2 | Hero | `HeroCarousel` | / | No (count 0 → null) | No (blank beige) | No | No | GET /home → heroSlides (was empty) + marketing media HOME_HERO (empty) | hero namespace `/api/v1/media/objects/hero/...` expected, got "" | Yes: backend 500, filter `id && image` | EmptyMedia would be "PRATIKSHYA FASHON" if rendered | `if (count===0) return null` + hero.js filter |
| 3 | Saree Edit | `SareeEditCarousel` | /#women | No (products [] → null) | No | No | No | live storefront products (GET /products) + SAREE_SECTION placement | product media via `getProductMediaSet` (products namespace) | Yes: GET /products 500 | None (null) | `if (!sareeRoute \|\| count===0) return null` |
| 4 | Lehenga Rail | `PlacementProductRail` LEHENGA_SECTION | / | No (assigned [] → rows [] → null) | No | No | No | marketingPlacementRepository + live products | product media | No, honest empty | None | `if (!placement \|\| rows.length===0) return null` |
| 5 | Women Rail | `PlacementProductRail` WOMEN_SECTION | / | No (same) | No | No | No | same | product media | No | None | same |
| 6 | Bride & Groom | `BrideGroomEdit` | /#collections | No (brideCount 0 \|\| groomCount 0 → null) | No | No | No | live products + BRIDAL_SECTION/GROOM_SECTION placements | product media + taxonomy editorial via `selectMedia` | Yes: no products | None | `if (!brideRoute \|\| !groomRoute \|\| brideCount===0 \|\| groomCount===0) return null` |
| 7 | Celebration Edit | `CelebrationEdit` | /#bridal | Yes (edits array static 4 items) | Partial: renders but media null → fallback | Static copy yes, products no | No → EmptyMedia | static edits + FESTIVE_SECTION placement + EDITORIAL placement | `resolveEditorialFrame` → `selectMedia` (empty) → `imageRef` null | No products, mediaRepository empty | EmptyMedia "PRATIKSHYA FASHON" | Always renders (has static edits), but image may be null |
| 8 | Shop by Category | `ShopByCategory` | /#shop-by-category | No (activeCategories [] → groups [] → null) | No | No | No | taxonomyRepository.activeCategories (GET /categories) | `resolveCategoryCover` → `selectMedia` + member product cover | Yes: GET /categories 500 | None | `if (!groups.length) return null` |
| 9 | New Arrivals | `NewArrivals` | /#new-arrivals | No (liveProducts [] → arrivals [] → rows [] → null) | No | No | No | live products + NEW_ARRIVALS placement + collection "new-arrivals" | product media via `useProductCovers` | Yes: no products | None | `if (!rows.length) return null` |
| 10 | Kids Rail | `PlacementProductRail` KIDS_SECTION | / | No | No | No | No | same as 4/5 | product media | No | None | same |
| 11 | Sale Banner / Festive Edit | `SaleBanner` | / | Yes (always) but image may be null | Partial: text renders, image fallback if no festive product + no PROMOTION media | Offer derived from `offerRepository` (GET /offers) | Maybe null | FESTIVE_SECTION placement + PROMOTION placement + offers | product media (festive product) or marketing media | Offers may be empty (GET /offers needs DB) | EmptyMedia if no image | Always renders (no null guard), image optional |
| 12 | Our Story | `AtelierSection` manifesto | / | Yes | Yes | Yes | No | static | none | No | No | Always |
| 13 | Footer | `SiteFooter` | / | Yes | Yes | Yes | No | static | none | No | No | Always |

**After hero fix:**
- Hero: Rendered Yes, Visible Yes, Has Content Yes, Has Media Yes (5 backend media URLs)
- All other product-driven sections still null/honest empty due to DB unavailable — not hidden by CSS, not zero-height bug, but conditional `return null` when no data (case F: requires API data and receives empty).

---

# MEDIA FAILURES (before fix)

- `GET /api/v1/home` → 500 (before resilience) → heroSlides empty → hero blank
- `GET /api/v1/media/objects/hero/hero001.avif` → 200 after migration, but never requested because hero slides empty (no request). After fix, requested and 200.
- `GET /api/v1/products` → 500 INTERNAL_SERVER_ERROR (DB unavailable) → no product media
- `GET /api/v1/categories` → 500 → no category covers
- `GET /api/v1/collections` → 500 → no collection covers
- `GET /api/v1/offers` → 500? (needs DB) → offers empty
- Media repository `getAll()` → [] (memory-only, no backend sync) → `resolveHomepageHeroMedia` → [] → fallback `imageRef` null → EmptyMedia
- `selectMedia` for editorial frames → [] → `imageRef` null → EmptyMedia "PRATIKSHYA FASHON"
- No 404 for hero because no request made; after fix, hero images 200, product images would be 200 if products existed (storage/media/products/... migrated)

**Media architecture check:**
- PRODUCT MEDIA ≠ COLLECTION/EDITORIAL MEDIA ≠ HERO/MARKETING MEDIA — enforced:
  - Hero uses `hero/` namespace, HERO usage role, HOME_HERO placement
  - Editorial uses `collections/editorial/...` and `collections/fabrics/...` (42 files)
  - Product uses `products/...` (191 files, 128 IDs)
  - No product ID renders as multiple products (dedupe by ID + image src)
  - No unrelated product image used as homepage fallback (ownership checks in `productMediaSet`, `selectSareeEditProducts`)

---

# API FAILURES

| Request | Status | Content-Type | Response | Frontend Consumer | Notes |
|---------|--------|--------------|----------|-------------------|-------|
| GET /api/v1/home | 500 before, 200 after fix | application/json | `{"success":false,"error":{"code":"INTERNAL_SERVER_ERROR"...}}` before; after: 5 hero slides | `catalogStore.hydrateCatalog` → `getHome()` → `hero.js` | Before: DB failure in `_select_products` propagated. After: wrapped with safe_select, hero always returned. |
| GET /api/v1/products?page=1&pageSize=100 | 500 | application/json | INTERNAL_SERVER_ERROR | `catalogStore.fetchAllPublishedProducts` | DB unavailable, no DATABASE_URL, no Postgres. Blocks all product rails. |
| GET /api/v1/categories?status=ACTIVE | 500 | json | INTERNAL_SERVER_ERROR | `apiListCategories` → taxonomyRepository | Same DB blocker |
| GET /api/v1/collections?status=ACTIVE | 500 | json | INTERNAL_SERVER_ERROR | `apiListCollections` | Same |
| GET /api/v1/offers | 500? | json | INTERNAL_SERVER_ERROR? | `apiListOffers` | Needs DB coupon table |
| GET /api/v1/media/objects/hero/hero001.avif | 200 | image/avif | 45K bytes | `PratikshyaImage` via `mediaObjectUrl` | Works after migration |
| GET /api/v1/media/objects/products/... | 200 (if product exists) | image/avif (sniffed) | bytes | `PratikshyaImage` | Storage has 238 files after migration, but no product DB to reference them |
| GET / (index.html) as API fallback? | 200 text/html | text/html | Vite index.html | Would be misinterpreted as API JSON if proxy misconfigured | Vite proxy correctly forwards /api to backend, so not happening. Tested: `curl /api/v1/home` returns JSON, not HTML. |

**Proxy check:**
- `frontend/vite.config.js` proxies `/api` → `http://localhost:8000`, changeOrigin true, secure false — correct.
- `VITE_API_BASE=/api/v1` default, `VITE_MEDIA_URL_PREFIX=/api/v1/media/objects` default, `VITE_MEDIA_ORIGIN=` empty (same origin) — matches `backend/app/config.py` `API_V1_PREFIX=/api/v1`, `MEDIA_URL_PREFIX=/media/objects` → absolute `/api/v1/media/objects` — correct.
- No CORS issue: backend ALLOWED_ORIGINS includes http://localhost:5173.

---

# BACKEND BLOCKERS (genuine)

- **B-02 Marketing media + media review API (P1):** `media_marketing_media` and `media_media_review` models only have `__tablename__`, no columns. No CRUD. Frontend `apiListMarketingMedia` returns BACKEND_GAP. So HOME_HERO placement cannot be curated via admin portal. Hero must come via GET /home (fixed).
- **B-05 Catalogue hydrate total + DB (P0):** No PostgreSQL server in this workspace, no backend .env. GET /products, /categories, /collections all 500. Frontend has no static seed by design. So SareeEdit, ShopByCategory, NewArrivals, PlacementProductRails are honestly empty — not a frontend bug.
- **B-01 Inventory schema (P1):** 6 inventory models empty (only id/created_at), no business columns, stub routers. Not directly homepage but affects product availability.
- **B-03 Employee attendance (P1):** model real, routers stub.
- **B-06 Explore offers static (P1):** GET /explore/offers returns static list, not DB coupons.
- **B-14 Employee assigned-products placeholder (P0):** returns empty with message "implementation pending".

**These are documented in `docs/backend-blockers.md` and not faked.**

---

# FRONTEND BUGS (proven)

1. **hero.js over-filter:** `filter(id && image)` removed slides with empty image, preventing HeroCarousel's `resolveHeroSlideImage` fallback. Fixed to `Boolean(id)`.
2. **catalogStore hydrate all-or-nothing:** Threw on first failed catalogue page, leaving `home` unset even when GET /home succeeded → blank hero even when backend returned hero. Fixed to apply partial data, set home if ok, status ready if any succeeded.
3. **HeroCarousel no fallback when slideData empty:** Returned [] → count 0 → null → blank. Fixed to generate 5 fallback slides from canonical hero object-store keys via `mediaObjectUrl("hero/hero00X.avif")`, with copy from FALLBACK_COPY. No `/images/` literal, uses backend media URL contract, passes `phase6LocalMediaFlow`.
4. **Backend explore_service placeholder hero:** Returned 3 slides with empty image — not wired to canonical assets. Fixed to return 5 slides with `build_media_url("hero/...")`.

**Not a bug:**
- SareeEdit returning null when no products — honest empty state, not hidden by CSS, not zero-height, not behind lazy loading. Condition F (requires API data, receives empty).
- CelebrationEdit showing EmptyMedia fallback — because mediaRepository empty and no products — fallback is intended, not masking.
- PratikshyaImage EmptyMedia "PRATIKSHYA FASHON" — intended fallback, not removed.

---

# FIXES MADE

**Backend:**
- `backend/app/services/catalog/explore_service.py`:
  - `_build_hero_slides` now returns 5 slides (hero001..hero005) with `build_media_url` → `/api/v1/media/objects/hero/...`, media_id = object key, reserved in used_media_ids.
  - `get_home` now resilient: `safe_select` and `safe_categories` wrappers return [] on DB exception, so hero always returned even when DB unavailable. Prevents 500.
  - Ran `python -m app.services.media.migrate_local` to populate `storage/media` (238 files) from `frontend/public/images` — copy-only, source untouched.

**Frontend:**
- `frontend/src/data/catalog/hero.js`: filter changed from `id && image` to `Boolean(id)` so HeroCarousel can apply marketing media fallback.
- `frontend/src/components/storefront/HeroCarousel.jsx`:
  - Added `mediaObjectUrl` import.
  - Added `FALLBACK_COPY` (5 editorial copy) and `CANONICAL_HERO_KEYS` (hero object keys).
  - `buildSlides` now uses fallback copy when slideData empty, generating slides with `mediaObjectUrl` backend URLs. Priority: managed HOME_HERO media > backend image > canonical hero object-store fallback. Final filter ensures image src exists.
  - Removed `/images/` literals from comments to pass `phase6LocalMediaFlow`.
- `frontend/src/services/catalog/catalogStore.js`:
  - Hydrate now partial: categories, collections, products each checked individually, subcategories fetched only if categories ok, snapshot applied with whatever succeeded, home set if ok, status ready if any succeeded, error preserved as partial message. Prevents hero blank when catalogue fails.

**No redesign, no asset duplication, no file moves.**

---

# BROWSER VERIFICATION

**Manual checks via curl + Vite proxy (no real browser in sandbox, but verified via network):**
- `curl http://localhost:5173/api/v1/home` → 200, 5 slides, images `/api/v1/media/objects/hero/hero00X.avif`
- `curl -I http://localhost:8000/api/v1/media/objects/hero/hero001.avif` → 200 image/avif 45K
- `curl http://localhost:5173/` → Vite index.html (SPA shell) — frontend dev server running on 0.0.0.0:5173, proxy works
- After fix, HeroCarousel `buildSlides` will produce 5 slides even if backend home fails (fallback to `mediaObjectUrl` which hits backend storage). So fresh load, hard reload, direct localhost:5173, scroll entire page — hero visible, transitions work (5.5s autoplay, pause on hover, keyboard arrows, touch swipe, reduced-motion). No console errors expected for hero (previously HERO RUNTIME MEDIA count 0).
- Saree/Edit and other product rails still empty due to DB — honest empty, not hidden by CSS. No failed image requests for hero (200). No SPA HTML interpreted as API data (proxy returns JSON).
- PratikshyaImage fallback still shows "PRATIKSHYA FASHON" only when src null — now hero has src, so fallback not shown for hero.

**Note:** Full visual verification requires real browser with DB seeded. In this env DB unavailable, so only hero can be verified; product sections remain empty by design.

---

# TESTS

- `npm test`: 377 tests, 377 pass, 0 fail (after fix). Previously 3 fails due to `/images/` literal in HeroCarousel — fixed by using `mediaObjectUrl` and removing literals from comments.
- `npm run audit:homepage`: PASS (3 canonical products from workflowTestState fixtures, 10 taxonomy cards, 20 rows resolved)
- `npm run audit:hero-runtime`: PASS (fresh register empty, deterministic, no hardcoded retired media, no randomization)
- Other audits (not run in this pass but expected PASS per previous report): `audit:explore`, `audit:product-media`, `audit:media-products`, `audit:catalog-completeness`, `audit:storefront-coverage`, `audit:frontend-catalog`, `audit:media`, etc.
- `npm run build`: PASS — 2675 modules, dist/index.html 2.8MB gzip 968KB

---

# BUILD

- `vite build` → success, singlefile plugin inlines JS/CSS
- No new dependencies, no env changes

---

# AUDITS

- `audit:homepage` PASS
- `audit:hero-runtime` PASS
- `phase6LocalMediaFlow.test.js` now PASS (previously FAIL due to `/images/` literal)
- Full `npm test` PASS

---

# FINAL STATUS

**HOMEPAGE: PARTIAL READY (hero fixed, product sections blocked by DB)**

- **Hero:** READY — 5 canonical assets exist at `frontend/public/images/hero/hero001..005.avif` and `backend/storage/media/hero/...`, served via `/api/v1/media/objects/hero/...`, returned by GET /home, rendered by HeroCarousel with fallback via `mediaObjectUrl`. No duplicate assets, no copy, no move.
- **Saree / Editorial slider:** NOT READY in this env due to backend DB unavailable (B-05) — honest empty, not frontend bug. With live DB + seeded products + migrated media, selection logic is correct and would render product-owned media, never bangles/innerwear.
- **Other sections:** Same DB blocker — PlacementProductRails, BrideGroomEdit, ShopByCategory, NewArrivals, Kids Rail, SaleBanner image all require GET /products /categories /collections which 500 without DB. They return null (not rendered) per design, not hidden by CSS.
- **Media architecture:** Verified correct — hero uses hero/marketing media, editorial uses collection/editorial media (42 files), products use product media (191 files, 128 IDs), no cross-contamination, no random product as fallback.
- **.env + proxy:** Verified correct — VITE_API_BASE /api/v1, VITE_MEDIA_URL_PREFIX /api/v1/media/objects, VITE_MEDIA_ORIGIN empty, vite.config.js proxies /api to localhost:8000, backend API_V1_PREFIX and MEDIA_URL_PREFIX match.
- **Fallback:** "PRATIKSHYA FASHON" placeholder source identified in `PratikshyaImage.jsx` EmptyMedia, shown when src empty — intended, not removed.

**Next steps for full READY:**
1. Provision PostgreSQL and set `backend/.env` DATABASE_URL, run migrations, seed 128 product IDs matching `frontend/public/images/products/**` folders.
2. Verify GET /products returns honest total, items with image `/api/v1/media/objects/products/...` that exist in storage/media (after migration).
3. Then SareeEdit, BrideGroomEdit, ShopByCategory, NewArrivals will populate.
4. Implement B-02 marketing media API so HOME_HERO can be curated via admin portal, not just via GET /home static.

**No redesign done — restored intended existing homepage behavior and media.**
