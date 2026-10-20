# Homepage Admin Editing System — Audit Report

**Date:** 2026-10-19 · **Branch:** `arena/e47f2d4c-pfv1` · **Scope:** homepage editing on the admin side (`/admin`, `/super-admin`, `/employee/media/marketing`) — audit only, no fixes applied.

**Audit method:** static code tracing, end to end, for every finding. No code was modified; no migrations/seeds/tests written; nothing committed. Runtime reproduction was not possible in this sandbox (no `node_modules`, no Python env, no PostgreSQL) — everything labelled **VERIFIED** is traced unambiguously in source; anything that needs a running stack is labelled **UNVERIFIED**.

**Files inspected (audit inputs):**

| Area | Files |
|---|---|
| Admin UI | `frontend/src/pages/admin/media/AdminMarketingMedia.jsx`, `AdminMediaUpload.jsx`, `AdminMediaLibrary.jsx`, `frontend/src/components/admin/homepage/{SectionContentEditor,RegisteredMediaPicker,PublishedProductPicker}.jsx`, `frontend/src/components/admin/BackendHomeHeroPanel.jsx`, `frontend/src/App.jsx` (routes), `frontend/src/config/{adminNavigation,adminAccess,rbacModel,employeeNavigation,employeePermissions,mediaTypes}.js` |
| Employee UI | `frontend/src/pages/employee/{EmployeeMediaDashboard,EmployeeMediaUpload,EmployeeMediaDetail}.jsx`, `frontend/src/components/media/MediaUploadForm.jsx`, `frontend/src/hooks/{useMedia,useMediaActions}.js` |
| Frontend services | `frontend/src/services/api/{homepageApi,marketingMediaApi,mediaApi,productsApi,apiClient}.js`, `frontend/src/services/homepage/{homepageContentService,homepageContentModel}.js`, `frontend/src/services/media/{mediaPaths,productMediaService,mediaRepository}.js`, `frontend/src/services/catalog/catalogStore.js` |
| Storefront render | `frontend/src/components/customer/pages/Home.jsx`, `frontend/src/components/customer/components/sections/*.jsx` (12 sections), `frontend/src/components/storefront/home/{HomepageSection,homepageSectionModel,customerHomeHeroModel,heroModel,CustomerHomeHero}.jsx`, `frontend/src/components/customer/router/routes.js` |
| Backend API | `backend/app/api/v1/{homepage,marketing_media,media,media_reviews,explore,router}.py` |
| Backend services/schemas/models | `backend/app/services/media/{homepage_content_service,marketing_media_service,media_service,upload_service,media_validation,product_media_records,product_media_resolver,migrate_local}.py`, `backend/app/services/catalog/{explore_service,product_service}.py`, `backend/app/schemas/media/{homepage,marketing,media}.py`, `backend/app/schemas/catalog/explore.py`, `backend/app/models/media/{homepage_section,marketing_media,media_asset,product_media}.py`, `backend/app/{dependencies.py,core/rbac.py,storage/*}` |
| Scripts / migrations | `backend/scripts/seed_marketing_hero.py`, `backend/app/services/media/migrate_local.py`, `backend/alembic/versions/{c7d8e9f0a1b2_add_marketing_media_real_schema,b6b5dcfb675b_add_media_asset_and_product_media_tables,p3hp20261016a_homepage_sections}.py` |

---

## 1. Executive summary (10 lines)

1. The homepage editing system has **two parallel persistence paths**: hero via `media_marketing_media` + `/home heroSlides`; the other 11 sections via `homepage_section(+_item)` + `/home homepageContent`.
2. **Non-hero editing is blocked for every default role**: `marketing.view`/`marketing.manage` exist in the capability catalogue but are in **no built-in role** — only SUPER_ADMIN's `*` wildcard passes → all `/admin|employee/homepage/sections/*` routes 403 for plain ADMIN and employees (B-01).
3. **New hero slides cannot be created at all in a fresh environment**: hero creation requires a *registered* `media_media_asset` row, but nothing registers hero/marketing objects — `migrate_local` never touches the DB, `seed_marketing_hero.py` now fails per-row, and the only register UI is product-bound (B-02).
4. **Employee media upload is dead-on-arrival**: the form posts with `scope: "admin"` while the backend upload endpoints are admin-only → 401 (B-03).
5. Product media *can* reach the homepage only if it is **registered** (`media_media_asset`); legacy column images (`catalog_product.image`) are invisible to every homepage picker (Focus 2).
6. Video is advertised by the upload UI but rejected everywhere server-side; mobile variants are unauthorable; hero alt text is saved but never returned by `/home`.
7. Eight "legacy marketing preparation" placements let admins curate rows the storefront never reads (dead-end workflow, admitted in fine print).
8. Unconfigured/missing sections render **nothing** on the storefront while the admin UI claims another content layer stays in use — dangerous copy.
9. The new sections editor itself (revision CAS, two-step activation, reload-after-write) is solid; the breakage is at its edges: RBAC, media registration, and stale copy from earlier phases.
10. All three blockers can be fixed with small, mostly backend changes (default grants + a register path), without redesigning the editor.

---

## 2. Current-state table

| Capability | State |
|---|---|
| Hero (HOME_HERO) edit copy/activate/reorder/delete via `BackendHomeHeroPanel` → `marketing_media` | **Implemented + verified** (admin roles with `media.view/upload/assign/delete`; employees with explicit marketing+media grants) |
| Hero: add **new** slide image | **Broken** — requires a registered asset that nothing can create for `hero/`/`marketing/` objects (B-02) |
| 11 non-hero sections: text/media/product authoring via `SectionContentEditor` → `homepage_section*` | **Implemented + verified for SUPER_ADMIN / custom-marketing grantees** |
| 11 non-hero sections for the built-in ADMIN role | **Broken (RBAC)** — 403, editor hidden (B-01) |
| Revision/CAS conflict handling, reload-after-save, hydrate-refresh | **Implemented + verified** |
| Registered-media picker (`RegisteredMediaPicker`) | **Implemented + verified** functions; no search/filter (B-11) |
| Published-product picker (`PublishedProductPicker`) | **Implemented** but stale "not supported" banner + page-reset UX (B-10) |
| Public `/home homepageContent` → storefront render of configured sections | **Implemented + verified** |
| Public render of unconfigured sections | **Implemented + verified** (section hidden) — but admin copy claims otherwise (B-08) |
| Product media (registered) usable in homepage MEDIA slots | **Implemented + verified** (no scope check; see Focus 2) |
| Legacy-column product images usable in homepage sections | **Missing** — not registered assets (Focus 2) |
| Video anywhere in homepage/upload chain | **Missing** (rejected server-side, UI pretends support) (B-05) |
| Mobile image variants (all 12 sections) | **Missing** (DTO field exists for hero, never populated) (B-07) |
| Employee upload of any media | **Broken** — 401 via admin scope; no employee endpoint (B-03) |
| Employee homepage editing | **Implemented + verified** when explicitly granted `marketing.view/manage` + `media.*` (rare by default) |
| Live preview of sections in admin | **Missing** |
| Draft vs. publish | **Partial** — implicit two-step activation (create inactive → activate entry → activate section); no bulk publish |
| Media review workflow (employee dashboard "Pending Review") | **Mock/session-mirror** — backend `media-reviews` is a health-check stub (B-16) |

---

## 3. Bug register

### B-01 — Non-hero homepage editing 403s for every default (non-SUPER) role
- **Severity:** Blocker · **Section:** all 11 non-hero sections (admin + employee workspaces) · **VERIFIED**
- **Files:**
  - `backend/app/core/rbac.py:197-214` — built-in `ADMIN` role permission list contains `media.view/upload/assign/delete` but **no `marketing.*`**; `:215-268` — no employee business role contains it either; `:437-444` — the MARKETING capability group exists (`marketing.view`, `marketing.manage`, `implies: []`, so nothing rolls up into it).
  - `backend/app/api/v1/homepage.py:29-33` — `GET /admin|employee/homepage/sections*` calls `grant(actor, db, "marketing.view")` (`homepage_content_service.py:18-24`); writes require `marketing.view + marketing.manage` (`:185-191`).
  - `frontend/src/services/api/homepageApi.js:6-15` — `staffHomepageAccess.view = can('marketing.view')` mirrors the backend (denies client-side too).
  - `frontend/src/pages/admin/media/AdminMarketingMedia.jsx:71-75` — non-hero editor renders only when `staff.view`; otherwise "… control unavailable" panel.
- **Reproduction:** sign in as a built-in-role ADMIN → `/admin/media/marketing` → pick e.g. *Category collage* → every tab shows "MEDIA/TEXT control unavailable — explicit marketing.view/manage … required". Direct API: `GET /api/v1/admin/homepage/sections/categories` → 403 `FORBIDDEN`.
- **Root cause:** new `marketing.*` capabilities were added to the catalogue but never wired into `BUILT_IN_ROLES` (`rbac.py:190-303`) or `BUSINESS_ROLE_CAPABILITIES` (`rbac.py:~278-287`); capability `implies: []` means no existing media grant expands into marketing.
- **Expected vs actual:** ADMIN with media authority should edit the homepage; actually only SUPER_ADMIN (or accounts with explicit custom grants) can even *read* section content.
- **Suggested fix:** add `marketing.view` (+ `marketing.manage` where manageable authority is intended) to `BUILT_ROLES.ADMIN` and relevant employee capability defaults (e.g. STORE_MANAGER / FASHION_STYLIST), plus a one-line grant backfill for existing provisioned custom-mode accounts if any.

### B-02 — No administrative way to register hero/marketing media ⇒ new hero slides un-creatable
- **Severity:** Blocker (fresh envs) / High (envs seeded before the enforcement) · **Section:** Hero (and any MEDIA slot needing new art) · **VERIFIED**
- **Files:**
  - `backend/app/services/media/marketing_media_service.py:137-150` — `create()` for `HOME_HERO` *always* calls `registered_asset(db, media_asset_id, object_key)`; with `media_asset_id=None` it looks up an asset **by object key** and 422s "Select an existing registered image." when none exists. `:185-202` — same on `update()` when the reference changes.
  - `backend/app/services/media/migrate_local.py:1-25` (docstring) — "never touches the database": migrated `hero/hero00X.avif` objects get **no** `media_media_asset` rows.
  - `backend/scripts/seed_marketing_hero.py:65-72` — seeds HOME_HERO with `mediaAssetId` unset; against the current service each row raises (caught and printed) → `created=0`.
  - `backend/app/api/v1/media.py:328-383` — generic `POST /media/objects` stores the object but deliberately creates **no** asset row; `:521-617` — `POST /media/register` can register any existing object, but…
  - Frontend: the only UI callers of `apiRegisterMediaObject` are product-bound (`frontend/src/services/media/productMediaService.js:191,267,289`); `apiUploadMediaObject` has **zero** UI callers; `MediaUploadForm` MARKETING scope short-circuits with the blocker message (`frontend/src/components/media/MediaUploadForm.jsx:~195-200`).
- **Reproduction:** fresh DB (`c7d8e9f0a1b2` applied, `migrate_local` run) → run `python scripts/seed_marketing_hero.py` → every row prints `FAILED … Select an existing registered image.` → `created=0` → `/home` heroSlides `[]` → storefront hero renders nothing. In the UI: `/admin/media/marketing` → Hero → "Add registered media" → picker contains only product-uploaded assets.
- **Root cause:** a later hardening ("hero must reference a registered, verified image") removed the documented key-only creation path (`backend/app/models/media/marketing_media.py:40-47` still documents it), while no registration path exists for non-product namespaces — the register UI is product-scoped by construction.
- **Expected vs actual:** admin should upload/pick hero art and save; actually only already-registered product images are eligible.
- **Suggested fix:** (a) auto-register on `POST /media/objects` for `hero`/`marketing`/`uploads` namespaces (or add a "Register object" action in `AdminMediaLibrary`), and (b) either enrich `migrate_local` with an optional register step or fix `seed_marketing_hero.py` to register assets first. Stale docstring in `marketing_media.py:40-47` must be updated either way.

### B-03 — Employee media upload always fails (401) — no employee upload endpoint
- **Severity:** Blocker (employee portal) · **Section:** `/employee/media/upload` (feeds product media, hence homepage pickers) · **VERIFIED**
- **Files:**
  - `frontend/src/components/media/MediaUploadForm.jsx:~220-245` — submit path hardcodes `scope: "admin"` (`uploadAndRegisterProductImages(productId, …, { scope: "admin" })`), even when `portalType="employee"`.
  - `backend/app/api/v1/media.py:328-358, 386-413` — both upload endpoints `Depends(get_current_admin)`; `POST /media/register` (`:521-552`) likewise. No `/employee/...` upload/register route exists anywhere (`grep employee upload` → none).
  - `frontend/src/pages/employee/EmployeeMediaUpload.jsx:1-62` — page only checks `media.upload` permission, then renders the form.
- **Reproduction:** log in as an employee with `media.upload` → `/employee/media/upload` → select a product + image → submit → request goes out without a token (no admin session exists in the employee workspace) → backend 401 → form error "No media id was minted…/Session expired".
- **Root cause:** the employee portal reuses the admin pipeline verbatim; the apiClient attaches tokens only for the requested scope (`frontend/src/services/api/apiClient.js:370-420`), and the backend never grew an employee upload surface.
- **Expected vs actual:** employee with `media.upload` registers product media; actually request is unauthenticated and rejected.
- **Suggested fix:** either (a) add employee-scoped upload/register routes (reusing `UploadService`, gate on `media.upload` via `require_staff_permission`, namespace-locked) + post with `scope:"employee"` for employee sessions, or (b) if policy forbids employee uploads, remove/hide the employee upload UI and say so (least effort, honest).

### B-04 — GIF passes picker validation but fails at save (frontend/backend image-policy mismatch)
- **Severity:** Medium · **Section:** all MEDIA slots + hero · **VERIFIED**
- **Files:** `frontend/src/services/homepage/homepageContentModel.js:59-62` — `isRegisteredImage` accepts `image/gif`; backend `backend/app/schemas/media/homepage.py:35` — `IMAGE_MIMES = {jpeg,png,webp,avif}` (no gif); rejection at `homepage_content_service.py:40-47` ("Registered image is unavailable or unsupported.") and `asset_projection` inside `employee_asset_page` (`:288-294`).
- **Reproduction:** register a GIF asset (via API; file-sniff allows only configured images — a GIF can only enter the register via a config change, but the picker regex also matters for future mimes) → picker offers it → save → 422. Practically today: any future non-jpeg/png/webp/avif mime will hit this.
- **Root cause:** two allow-lists drifted (frontend adds `gif`).
- **Expected vs actual:** consistent eligibility between browse-time and save-time.
- **Suggested fix:** single source of truth — expose the allowed-mime list from the backend (e.g. in the picker payload) or drop `gif` from `isRegisteredImage`.

### B-05 — Video: UI accepts, backend rejects; no video field anywhere in homepage chain
- **Severity:** High (advertised but missing) · **Section:** upload + all 12 sections · **VERIFIED**
- **Files:** frontend accepts `.mp4/.webm` ≤100 MB (`frontend/src/config/mediaTypes.js:~455-470`); backend `validate_image_bytes` (`backend/app/services/media/media_validation.py:88-159`) only accepts `settings.ALLOWED_IMAGE_TYPES = image/jpeg,png,webp,avif` (`backend/app/config.py:155`) and sniffs content → mp4 rejected. Asset rows hard-typed `media_type="image"` (`media.py:451-470`). Homepage DTOs/registry have no video concept (`schemas/media/homepage.py`); `MediaAssetModel` supports `media_type` but no writer sets video.
- **Reproduction:** `/admin/media/upload` → drop an mp4 → "Detected 'video/mp4', which is not an allowed image type." Also `EmployeeMediaDashboard` renders video badges/roles for data that can never exist server-side.
- **Root cause:** upload pipeline is image-only; frontend role vocabulary predates that constraint.
- **Expected vs actual:** either video works end-to-end or is not offered.
- **Suggested fix (decision needed):** short term — restrict `accept`/validation to images and strip video roles from the upload UI; long term — add a video pipeline (separate validation, `media_type` from sniff, player fields in section DTOs + storefront `MediaVideo`).

### B-06 — Eight "legacy marketing preparation" placements save rows the storefront never reads
- **Severity:** High (dead-end workflow trap) · **Sections:** sarees, bridal, jewellery, promotion, men (`GROOM_SECTION`), kids, plus `HOME_HERO`-adjacent vocabulary · **VERIFIED**
- **Files:** `AdminMarketingMedia.jsx:69-70` — "Show legacy marketing preparation" toggle mounts `BackendHomeHeroPanel` for `SAREE_SECTION|BRIDAL_SECTION|JEWELLERY_SECTION|PROMOTION|GROOM_SECTION|KIDS_SECTION`; saves go to `media_marketing_media` via `apiCreateMarketingMedia` (`frontend/src/services/homepage/homepageContentService.js:42-58` → `backend/app/api/v1/marketing_media.py:74-91`). Storefront `/home` reads **only** `HOME_HERO` (`backend/app/services/catalog/explore_service.py:405-452`); the 12-section storefront consumes only `homepageContent`. The panel's own fine print admits it: "…this section does not consume these placement rows yet." (`BackendHomeHeroPanel.jsx:~113`).
- **Reproduction:** as ADMIN → Saree lookbook → legacy toggle → create/activate a row → row persists in `media_marketing_media`, `GET /marketing/placements/SAREE_SECTION` returns it, customer homepage: no change, ever.
- **Root cause:** pre-sections-API workflow kept reachable after the new system landed; only the hero placement is wired to the storefront.
- **Expected vs actual:** admin time spent there either renders or is clearly impossible to waste.
- **Suggested fix:** remove/disable the legacy toggle for non-hero placements (keep for HOME_HERO if desired), or wire placements to sections — but the sections system supersedes them; recommend removal + a migration note.

### B-07 — Hero `altText` saved but never rendered; `mobileImage` DTO field never populated; hero has no eyebrow field the UI implies
- **Severity:** High (silent data loss of an authored field) · **Section:** Hero · **VERIFIED**
- **Files:** admin enters alt text (`BackendHomeHeroPanel.jsx:19-21` form fields; persisted at `media_marketing_media.alt_text` `models/media/marketing_media.py:50-52`); `/home` hero slides never include it — `HeroSlide` schema has no alt field (`backend/app/schemas/catalog/explore.py:111-122`) and `_build_hero_slides_from_db` maps only title/subtitle/cta/href/image (`explore_service.py:405-452`). `HeroSlide.mobile_image` exists (`explore.py:122`) but is never set by the backend → always `""`; frontend model would honour it (`frontend/src/components/storefront/home/heroModel.js:154-190`). The admin panel self-documents: "Public /home does not expose altText." (`BackendHomeHeroPanel.jsx:~113`).
- **Reproduction:** set alt text on a hero entry, save, activate → storefront `<img alt>` derives from title/register, never the authored alt. WAVE/accessibility check: alt missing on exact-authored text.
- **Root cause:** public projection predates the alt column; mobile variant never designed into the marketing row (needs a second asset FK).
- **Expected vs actual:** authored alt/mobile art renders.
- **Suggested fix:** add `altText` to `HeroSlide` + builder; add an optional `mobile_media_asset_id` (or second slot row type) for portrait art; expose in admin form.

### B-08 — Admin copy claims unconfigured sections "retain existing storefront content" — storefront actually renders nothing
- **Severity:** High (dangerous guidance) · **Sections:** all 11 non-hero · **VERIFIED**
- **Files:** claims at `AdminMarketingMedia.jsx:44` ("missing sections retain existing content") and `SectionContentEditor.jsx:80` ("Not configured · existing storefront content remains in use."); behaviour at `frontend/src/components/storefront/home/homepageSectionModel.js:17-18` — `missing/inactive/empty` → `mode:'hidden'` → `HomepageSection.jsx:20-24` returns `null`; each of the 12 section components returns `null` when `content` is absent (e.g. `CategoryCollage.jsx:41-43`).
- **Reproduction:** fresh env (no `homepage_section` rows, `homepageContent` ready) → customer homepage shows hero only; all other sections silently absent.
- **Root cause:** copy written for the pre-migration homepage (which had legacy content); current design is DB-driven end-to-end with no fallback.
- **Expected vs actual:** copy must match the "hidden when unconfigured" contract.
- **Suggested fix:** reword both notices: "Unconfigured sections are hidden on the storefront. Configure and activate to render."

### B-09 — Partial outage shows 11 inline error walls ("Homepage content is unavailable") on the storefront
- **Severity:** Medium · **Sections:** all non-hero · **VERIFIED**
- **Files:** `homepageSectionModel.js:12-14` — `status!=='ready'` → `'unavailable'`; `HomepageSection.jsx:22-23` renders an alert + retry **per section**; backend degradation path `explore_service.py:380-390` returns `homepageContent.status='unavailable'` whenever the additive read throws (e.g. `p3hp20261016a` migration not applied), while `/home` itself stays 200.
- **Reproduction:** revoke/drop `homepage_section` table → storefront renders 11 identical "Homepage content is unavailable. Retry homepage content" panels stacked under the hero.
- **Root cause:** per-section renderer has no compact degraded mode; one get_home failure multiplies.
- **Expected vs actual:** a single quiet degradation (hide sections or one banner), not 11 error walls.
- **Suggested fix:** treat `'unavailable'` like `'hidden'`, or degrade to a single global notice driven by `homeStatus`.

### B-10 — `PublishedProductPicker` stale banner + selection/page/search ergonomics
- **Severity:** Medium · **Sections:** product-capable admin tabs · **VERIFIED**
- **Files:** `PublishedProductPicker.jsx:28-31` — renders "**PRODUCT assignment is not supported by the current backend** … Selections are unsaved" whenever `onSelect` is absent (plain admins / inspection mode) — false since `SectionContentEditor` saves `productId` via `homepageApi.js:30` → `ItemCreate` (`schemas/media/homepage.py:96-101`) → `homepage_section_item.product_id`. `:17-22` — any paginate/retry clears the selection (`onSelect(null)` + `setSelected([])`); `:33` — "Search this page" filters only the 24 loaded.
- **Reproduction:** as SUPER_ADMIN → Bestsellers → PRODUCT tab → select a product on page 1 → click "Next products" → selection silently cleared. As plain ADMIN → banner claims backend can't assign products, which is untrue (their role just lacks `marketing.manage`).
- **Root cause:** component written pre-sections-API and never revised.
- **Suggested fix:** make the banner permission-aware ("your account needs marketing.manage"), keep selection across paging, add server-side `q` to the product query.

### B-11 — Registered-media picker has no search/scope filter; 24-per-page, newest-first — product media is undiscoverable at scale
- **Severity:** Medium · **Sections:** all MEDIA slots + hero · **VERIFIED**
- **Files:** `RegisteredMediaPicker.jsx:10-38` — paged grid only; backend `list_media_assets` accepts only `page/pageSize` (`media.py:620-678`, no `q/scope/mime` params); `employee_asset_page` likewise (`homepage_content_service.py:288-294`).
- **Reproduction:** catalogue with hundreds of uploaded assets → to put a specific product image in a homepage slot, page through newest-first pages with no search and no product name shown (only `objectKey`).
- **Suggested fix:** backend query params (`q` on objectKey/filename, `scope`, `mime`) + UI search box; optionally a "from product" browse mode (product → its media-set via the existing `/media/products/{id}/media-set`).

### B-12 — Non-hero marketing placements accept unverified object keys (broken/dead rows possible)
- **Severity:** Medium (data integrity in dead rows) · **Sections:** legacy placements · **VERIFIED**
- **Files:** `marketing_media_service.py:143-146` — `registered_asset` enforced **only** for `HOME_HERO`; other placements validate key *shape* via `_validate_object_key` (`:60-70`) but never existence/registration/mit. Admin can `POST /admin/marketing/media` with `placement=SAREE_SECTION, objectKey=products/NOPE/x.avif` → 201, URL 404s publicly.
- **Root cause:** hero got the hardening; the rest of the vocabulary kept the old loose contract.
- **Suggested fix:** enforce `registered_asset` for all placements (or delete the non-hero placements per B-06).

### B-13 — Hero CTA: no backend validation; external CTAs allowed by the admin UI but routed to `/` on the storefront
- **Severity:** Medium · **Section:** Hero · **VERIFIED (static); runtime nuance UNVERIFIED**
- **Files:** backend `MarketingMediaBase` has **no** CTA validator (`schemas/media/marketing.py:50-63`) — note the sections DTO *does* reject external CTAs (`schemas/media/homepage.py:41-62, safe_cta`); admin UI allows `https?://` (`homepageContentService.js:46-48` → `homepageContentModel.js:70-74, safeCtaHref`); storefront resolves hero CTA through the customer `Link` shim, which maps any non-registered absolute URL to `/` (`frontend/src/components/customer/router/routes.js:137-168`, tail `return \`/${suffix}\``).
- **Reproduction:** save hero entry with `ctaHref=https://www.ajio.com` → storefront CTA navigates to `/` (the shim strips it to homepage) instead of the destination — or, on an unregistered absolute path, a broken route. A `javascript:` payload would be *saved* (no backend validation); the router shim reduces it to `/`, but that mitigation is incidental, not a policy.
- **Suggested fix:** add `safe_cta` to `MarketingMediaBase` (sections parity: site-relative only) and drop the `https?` branch from the admin UI's CTA check.

### B-14 — Public homepage does one storage `stat` per media asset per request (no caching)
- **Severity:** Medium (performance/robustness) · **Sections:** all configured sections + staff reads · **VERIFIED**
- **Files:** `asset_projection` checks object existence (`homepage_content_service.py:40-64`, `run_in_threadpool(object_exists)`) for every asset on every `content()` call — staff editor reads **and** public `/home` (`explore_service.py:380-384` calls `content(public=True)`); no cache; a storage hiccup raises 503 `STORAGE_UNAVAILABLE` during save and silently degrades public sections to `unavailable`.
- **Suggested fix:** cache projections by asset id/version (short TTL, invalidated on upload/delete), or trust registration (existence was verified at register-time) with a periodic reconciler; at minimum scope the public path to a bulk HEAD or local-dir listing.

### B-15 — Kurti lookbook: initial selected mood hardcoded to `anarkalis` even when unconfigured → blank hero image
- **Severity:** Medium-Low · **Section:** Kurti lookbook · **VERIFIED**
- **Files:** `frontend/src/components/customer/components/sections/KurtiLookbook.jsx:18` — `useState('anarkalis')`; mood tabs derive from configured MEDIA slots (`content.mediaList()`), but the `active` default may match none → `content.media('anarkalis')` blank → `<SectionImage src="">` renders nothing until a mood is clicked.
- **Suggested fix:** initialize `active` from the first configured mood (`moods[0]?.key`), fall back when the current selection disappears after re-save.

### B-16 — Employee/admin media surfaces still run on the browser-local "session mirror"; review workflow is mock
- **Severity:** Medium · **Sections:** `/employee/media`, `/admin/media` library tabs feeding homepage media expectations · **VERIFIED**
- **Files:** `EmployeeMediaDashboard.jsx:25` — `useMediaLibrary()` → `mediaRepository` (browser `localStorage` store; `services/media/mediaRepository.js`); "Atelier Media Approval Workflow" copy (`:150-158`) promises pending→active review — backend `media-reviews` router is a health stub (`backend/app/api/v1/media_reviews.py:1-12`); prior redirects admit review queue is "session-mirror-only" (`App.jsx:168-174` comment). `AdminMediaLibrary.jsx:24-25,113-115,235` mixes durable `apiListMediaAssets` with the mirror (`useMediaLibrary`).
- **Impact:** operators believe homepage art enters a review flow; nothing does. Counts/pending rows are mock state that disappears across browsers/sessions.
- **Suggested fix:** either implement the review module or strip review tabs/copy from these pages; at minimum label the mirror "local workspace, not durable".

### B-17 — Stale documentation embedded in code (drift after hardening)
- **Severity:** Low · **Sections:** hero/marketing · **VERIFIED**
- **Files:** `backend/app/models/media/marketing_media.py:40-47` — claims entries can be created "without first registering a media_asset row"; `frontend/src/services/api/mediaApi.js:266-291` — `MARKETING_REGISTER_BLOCKER` says marketing placements "have no API" (they do now; the blocker only describes the *upload→placement* shortcut); `MediaUploadForm.jsx:~372-374` marketing copy likewise.
- **Suggested fix:** rewrite to describe the real contract (register-first; upload stays product-bound or gains marketing auto-register per B-02 fix).

### B-18 — Dead code in storefront/media scope
- **Severity:** Low · **Sections:** storefront home + upload form · **VERIFIED**
- **Files:** `frontend/src/components/storefront/PlacementProductRail.jsx` and `StorefrontHome.jsx` — zero import sites (legacy rails/reference shell); `frontend/src/components/customer/components/sections/KidsPlayground.jsx:11-14` — unused `chips` constant (content comes from authored texts); `MediaUploadForm.jsx:30-34` — unused `getImage`/`SAMPLE_VIDEO`; `frontend/src/services/media/mediaRepository.js` and the whole local media store continue to feed only the mock paths of B-16.
- **Suggested fix:** delete or fence behind a dev flag; run the existing dead-import lint.

### B-19 — Section picker labels under-sell non-hero live integration
- **Severity:** Low · **Sections:** all non-hero · **VERIFIED**
- **Files:** `AdminMarketingMedia.jsx:~63-66` — nav shows "Live /home integration" only for hero, "Section content" for the 11 sections that are equally live via `homepageContent` once configured.
- **Suggested fix:** label by *state* (e.g. "Live when activated") to match `homepageSectionMode`.

### B-20 — No live preview of section output in the admin
- **Severity:** Low-Medium (UX gap) · **Sections:** all · **VERIFIED** (absence)
- **Files:** `SectionContentEditor.jsx` renders raw inputs only; `BackendHomeHeroPanel.jsx` shows thumbnails; no render of the storefront section components with authored content.
- **Suggested fix:** mount the actual section components in a preview tab fed by the in-flight draft (storefront already isolates all data in `HomepageSection`/adapter — reuse `adaptHomepageSection` over the draft payload).

---

## 4. Root-cause answer to Focus 2 (plain language)

Product images live in **three disconnected places**: (1) legacy columns on `catalog_product` (`image`/`hover_image`/`additional_images`, typically `/images/products/…` paths or bare object keys), (2) the **registered** product media (`media_media_asset` scoped "product" + `media_product_media` mapping, created only by the product-media upload/register pipeline), and (3) raw files in the object store. The homepage never references product data for MEDIA slots: every homepage media field — the 11 sections' MEDIA slots and the hero — points at a **`media_media_asset` id** (`homepage_section_item.media_asset_id`, `media_marketing_media.media_asset_id`). The admin media pickers list **only `media_media_asset` rows** (`GET /media/assets`, `GET /employee/homepage/media-assets`) — so any product image that exists only as a legacy column (i.e. virtually the entire seeded catalogue) is structurally invisible to the homepage editor, no matter how "valid" the image is. When product media *is* registered, it does appear (nothing filters scope) and works end-to-end — but there is no search, no product linkage in the picker, and no raw-URL field anywhere (the save DTO requires an asset id; `registered_asset` then re-verifies the object). On top: employees can't upload/register at all (admin-only endpoints), and `marketing.view/manage` belong to no default role — so for most actors the picker is unreachable even when product media is registered. Finally, marketing placements other than HOME_HERO skip the registered-asset check, so product object keys can be pasted there… into rows the storefront never reads. In short: **not one bug — a registry boundary (legacy images never registered), a picker with no product awareness, an upload path locked to admins+products, and an RBAC gap on the homepage itself.**

---

## 5. Better-approach suggestions

| # | Approach | Pros | Cons | Effort |
|---|---|---|---|---|
| A | **Add `marketing.*` to default roles** (ADMIN + chosen employee roles) with optional backfill | One-line semantic change; instantly unblocks 11 sections; least surprise | Widens authority of every ADMIN (must be intended); needs backfill decision for custom-mode accounts | **S** (backend only) |
| B | **Register-at-upload for non-product namespaces** (`hero`, `marketing`, `uploads`): auto-create `media_media_asset` in `POST /media/objects` when namespace is not `products`, + a "Register existing object" action in `AdminMediaLibrary`; fix `seed_marketing_hero` to register first | Unblocks new hero art and all MEDIA slots through the existing picker; no schema change; closes B-02/B-12 class | Touches upload route semantics (idempotent registration needed); storage artefacts uploaded before the change still need the register action | **S–M** (backend + tiny admin UI) |
| C | **Unified media library with product media**: one picker with scope facet (`product`/`marketing`/`hero`), search over objectKey/filename, product-browse mode via existing `/media/products/{id}/media-set`; homepage keeps referencing **asset IDs** (never raw URLs) | Solves Focus 2 ergonomically; ID references keep integrity + 404-proofing; no new tables | Needs `GET /media/assets` filters (backend) + picker redesign; employees' page endpoint must grow the same params | **M** |
| D | **Per-section schema preview + live preview tab** using existing `adaptHomepageSection` + section components over the draft payload | Kills B-08/B-15 class by showing truth before publish; previews enforce "what you see is what ships" | Section components are animation-heavy (needs reduced-motion off in preview); moderate frontend work | **M–L** (frontend only) |
| E | **Explicit draft/publish**: keep `is_active` but add "Publish all pending entries" bulk action + state chips per row ("hidden until section active") | Removes the two-step activation confusion; no backend change required (bulk = loop) or one bulk endpoint (M) | More state for operators to learn if not paired with preview | **S–M** |
| F | **Fold hero into the sections system** (`homepage_section` for hero; migrate `media_marketing_media` rows) | One pipeline, one picker, one render contract; kills the dual-path maintenance and B-07/B-13 root causes at once | Migration + rewrite of hero admin + `/home` builder; highest risk | **L** |
| G | **Video & mobile-variant support** (schema + validation + picker + storefront) | Completes the section field matrix | New pipeline (transcoding? sizing?), biggest surface area | **L** |

**Recommended plan: A + B first** (both S-effort, fully unblock editing with today's architecture), then **C** as the structural Focus-2 answer, then **E-lite + D** for operator experience. Keep hero on its current placement pipeline in the near term (F only if the roadmap justifies it).

---

## 6. Prioritized fix plan (dependencies + files + backend-needed?)

| Step | Change | Depends on | Files | Backend? |
|---|---|---|---|---|
| 1 | Grant `marketing.view`/`marketing.manage` to built-in `ADMIN` (+ chosen employee capability defaults); decide backfill for custom-mode accounts | — (policy decision §7-Q1) | `backend/app/core/rbac.py` (role defs ~190-303); optional backfill migration/script | **Yes (required)** |
| 2 | Auto-register assets for non-product namespaces in `POST /media/objects`; fix `seed_marketing_hero.py` to register before seeding (or point it at an admin register utility); update `marketing_media.py` docstring | 1 (to test as ADMIN) | `backend/app/api/v1/media.py:328-383`; `backend/scripts/seed_marketing_hero.py`; `backend/app/models/media/marketing_media.py` | **Yes** |
| 3 | "Register existing object" action in `AdminMediaLibrary` (calls `POST /media/register`) so pre-existing hero/marketing objects become pickable | 2 (shares semantics) | `frontend/src/pages/admin/media/AdminMediaLibrary.jsx`; `frontend/src/services/api/mediaApi.js` | No (uses existing endpoint) |
| 4 | Align picker validation: drop `gif` client-side or single-source the mime allow-list from backend | — | `frontend/src/services/homepage/homepageContentModel.js:59-62`; optionally `GET /media/assets` payload | Frontend (optional backend) |
| 5 | Fix dangerous copy: B-08 banners, B-10 banner, B-16 review copy, B-17 stale comments; remove/retire legacy placement toggle (B-06) | — | `AdminMarketingMedia.jsx`, `SectionContentEditor.jsx`, `PublishedProductPicker.jsx`, `EmployeeMediaDashboard.jsx`, `MediaUploadForm.jsx`, `mediaApi.js` | No |
| 6 | Hero parity fields: `altText` into `HeroSlide` + builder; enforce `safe_cta` on `MarketingMediaBase`; decide mobile variant (add `mobile_media_asset_id` or accept absence) | 1 | `backend/app/schemas/catalog/explore.py`, `explore_service.py`, `marketing.py`, `marketing_media_service.py` (validate); `heroModel.js`/admin form (frontend) | **Yes** |
| 7 | Storefront degradation: collapse 11 error walls → single notice or hidden (B-09); Kurti default mood (B-15) | — | `homepageSectionModel.js`, `HomepageSection.jsx`, `KurtiLookbook.jsx` | No |
| 8 | Picker search/facets: `GET /media/assets? q&scope&mime` + pickers updated; employee `/media-assets` same params | 2, 4 | `backend/app/api/v1/media.py:620+`, `homepage_content_service.py:288+`; `RegisteredMediaPicker.jsx`, `PublishedProductPicker.jsx` (+ product `q`) | **Yes** |
| 9 | Employee story: either add employee-scoped upload/register routes + fix `scope:"employee"` posting, or hide the employee upload UI honestly | policy (§7-Q2) | `backend/app/api/v1/media.py` (new routes) / `EmployeeMediaUpload.jsx`, `MediaUploadForm.jsx` | **Yes** (if uploads allowed) |
| 10 | Bulk "publish section" UX + preview tab (E-lite/D) | 1, 5 | `SectionContentEditor.jsx`; new preview component reusing `adaptHomepageSection` + section components | No |
| 11 | Dead-code cleanup (B-18) + relation: retire `mediaRepository` mirror or fence it as dev-only (B-16 decision) | 5 (copy decisions) | `PlacementProductRail.jsx`, `StorefrontHome.jsx`, `mediaRepository*`, `KidsPlayground.jsx`, `MediaUploadForm.jsx` | No |
| 12 | (Later, decision) unify hero into sections (F) and/or video & mobile variants (G) | 6, decision §7-Q3 | wide | **Yes** |

Steps 1–3 alone remove all "homepage media setup is blocked" reports on a correctly migrated env; steps 4–7 remove the silent-failure classes users hit next.

---

## 7. Risks and open questions (decisions needed)

1. **Q1 — Role policy:** should the built-in `ADMIN` role own `marketing.manage`, or should homepage authority stay SUPER_ADMIN-only by default with opt-in grants? Widening `ADMIN` is a genuine privilege change; backfilling custom-mode accounts could silently elevate someone. (Blocks step 1.)
2. **Q2 — Employee uploads:** are employees meant to upload media at all? Today the UI says yes and the backend says no. Either is defensible — pick one and align both sides. (Blocks step 9.)
3. **Q3 — Hero consolidation:** keep the dual hero pipeline (`media_marketing_media`) or fold hero into `homepage_section` later? Consolidation is cleanest but carries migration risk to the live homepage.
4. **Q4 — The eight non-hero marketing placements** (`SAREE_SECTION` etc.): delete the vocabulary and any rows, migrate rows into sections, or keep for a future feature? They currently store unverifiable data.
5. **Q5 — Review workflow:** implement real media review (`media-reviews` backend) or strip the review copy/tabs from employee/admin pages? Content accuracy vs. roadmap.
6. **Q6 — Public `GET /marketing/placements/{placement}`** exposes all placements (incl. dead rows) unauthenticated — acceptable, or restrict to whitelist?
7. **Q7 — Video roadmap:** if video enters the homepage later, the current image-only assumptions live in ≥6 places (upload validation, asset model defaults, homepage IMAGE_MIMES, picker regex, section renderers, resolver) — needs a dedicated plan, not spot fixes.
8. **Risk — revision UX under team editing:** expectedRevision CAS means two operators on one section will 409 each other constantly; acceptable at small team size, but worth tracking.
9. **Risk — perf:** B-14 storage-stat-per-asset on every `/home` will hurt on remote/S3 providers; fix before CDN adoption.
10. **Risk — environments:** any deploy missing `p3hp20261016a` (or the marketing migrations) degrades the whole non-hero homepage to `unavailable` — add a preflight migration check to startup/README deploy steps.

---

## 8. What I could not verify, and why

1. **Any runtime behaviour** — no `node_modules` (frontend tests/build can't run), no Python environment for FastAPI/SQLAlchemy, and no PostgreSQL `DATABASE_URL` in this sandbox. All VERIFIED findings are source-traced, not executed.
2. **Current production DB state** — whether `media_marketing_media`/`media_media_asset` rows already exist from before the `registered_asset` hardening (changes B-02's impact from "blocked" to "can't add new images"), and whether any account already holds custom `marketing.*` grants.
3. **The exact client-side outcome of malformed hero CTAs** (`javascript:`/external) — traced statically to the router shim's `/` fallback (B-13), but the React Router DOM rendering path wasn't executed (#1).
4. **End-to-end happy-path of `SectionContentEditor`** in a browser (existing `homepagePersistence.test.js` covers it with mocked HTTP, but I couldn't re-run the suite — node dependencies absent).
5. **Actual CORS/base-URL behaviour in deployment** — the codebase uses same-origin `/api/v1` relative URLs plus an optional `VITE_MEDIA_ORIGIN`; production topology unknown.
6. **N+1 storage-stat cost under real latency** (B-14) — code pattern verified, impact unmeasured.
7. **Whether existing operator accounts were provisioned before/after the capability catalogue** — affects whether step 1 needs a backfill (§7-Q1).
8. **Image dimension/size policy** for homepage slots (aspect ratios, max weight) — no constraints exist today beyond the 10 MB image ceiling; "is this acceptable" is a product decision, hence unverifiable as a bug.

---

*End of report. Prepared read-only on branch `arena/e47f2d4c-pfv1`; the only file created is this document.*

---

## Batch 1 implementation status (2026-10-19, branch `arena/e47f2d4c-pfv1`)

Track A/B/E were implemented in Part 1; Track C/D in Part 2 (same branch); an employee-media-route hardening pass (B-03 scope) landed on 2026-10-19. Status column entries use: **RESOLVED** (code landed + tests pass) · **PARTIAL** (code landed, real-DB verification pending) · **PENDING** (planned for a later part) · **NOT TOUCHED** (out of scope for Batch 1).

| Finding | Title (short) | Status |
|---|---|---|
| B-01 | homepage RBAC 403s for built-in roles | **VERIFIED CLEAR (2026-10-20)** — `backend/app/core/rbac.py:197–220` ADMIN `permissions` includes exact line `219: "marketing.view", "marketing.manage",` inside ADMIN def; `backend/app/core/rbac.py:191–194` SUPER_ADMIN `permissions: ["*"]` wildcard covers them; no other `_ROLE_DEFS` entry contains `marketing.view`/`marketing.manage` (verified `grep -n marketing` returns only `219` and `448–449` MARKETING group `implies: []`); `backend/app/api/v1/homepage.py:29` `grant(... marketing.view)` now passes for ADMIN; `frontend/src/pages/admin/media/AdminMarketingMedia.jsx:71` control renders. Roles containing them: **ADMIN** (verbatim at 219) + **SUPER_ADMIN** (via `*`). All employee business roles (`SUPER_EMPLOYEE` 222, `STORE_MANAGER`, `SALES_EXECUTIVE`, `INVENTORY_MANAGER`, `INVENTORY_STAFF`, `WAREHOUSE_STAFF`, `CUSTOMER_SUPPORT`, `FASHION_STYLIST` 222–290) contain neither — corrected from prior “chosen employee roles”. |
| B-02 | no way to register hero/marketing assets | **RESOLVED** (Track B: `/media/register-placement`, placement UI, truthful seed script) |
| B-03 | employee upload always fails | **RESOLVED** (Track C: `/employee/media/products/{id}/objects` + `/employee/media/register`; explicit `media.upload`, products/ namespace) **+ HARDENED (2026-10-19):** employee writes restricted to DRAFT/PENDING_REVIEW products (PUBLISHED and ARCHIVED → 422), `is_primary=true` rejected on both employee routes (an administrator sets the primary image), employee register-by-key is a no-op on existing mappings (`preserve_existing_mapping=True` — never reshapes admin-set role/sort_order/is_primary), and the employee upload/register lanes in `api/v1/media.py` require the explicit `media.upload` grant on every write path (no namespace pre-approval substitutes); admin routes behaviorally unchanged (regression tests in `test_phase3_product_media.py` / `test_phase7_media_lifecycle.py`) |
| B-04 | GIF mismatch frontend vs backend | **RESOLVED** (2026-10-19, Batch 2 / 2F: `gif` dropped from `isRegisteredImage` in `homepageContentModel.js` — both allow-lists now match `{jpeg,png,webp,avif}` exactly) |
| B-05 | video advertised, rejected everywhere | NOT TOUCHED (Batch 2 candidate) |
| B-06 | eight legacy-marketing placements dead | **VERIFIED PARTIAL (2026-10-20)** — guard in `marketing_media_service.py:41–50,165–166,232–238,312` verified: six placements (SAREE/BRIDAL/JEWELLERY/PROMOTION/GROOM/KIDS) reject create/content-update/activation/reorder (422 `RETIRED_PLACEMENT_MESSAGE`), allow read + standalone deactivate + delete; `HOME_HERO` untouched; tests `test_marketing_media.py:219` + `test_phase7_media_lifecycle.py:1299` + `homepageContentControl.test.js:89,101,212` passed. PROMOTION frozen — storefront `useStorefrontAnnouncements.js:62` reads `GET /marketing/placements/PROMOTION` but no admin editor remains (recommendation: keep retired and re-home announcements to dedicated surface; see verification report). |
| B-07 | hero altText never rendered etc. | **VERIFIED PARTIAL (2026-10-20)** — chain verified: migration `w3b4c5d6e7f8` (nullable FK ON DELETE SET NULL, downgrade) · model `marketing_media.py:65` · schemas `marketing.py:58,85` + `homepage.py:129,135` · validation `_validate_hero_mobile_asset:64` · `/home` `explore_service.py:437–463` `mobileImage` · `BackendHomeHeroPanel.jsx:43,131` set/replace/clear (field sent only when touched) · `heroModel.js:181,192` + `HeroEditorial.jsx` portrait plate. Clearing/`ON DELETE SET NULL → ""` verified. Stale `BackendHomeHeroPanel.jsx:112` `does not expose altText` still present (false — now exposed). Remaining: aspect-ratio policy + mobile for 11 non-hero sections (both need decision; recommended *no*). |
| B-08 | "existing content remains in use" copy vs empty render | **RESOLVED** (2026-10-19, Batch 2 / 2A: admin copy only — `AdminMarketingMedia.jsx` banner now says unconfigured/inactive sections are hidden; `SectionContentEditor.jsx:80` status reads "Not configured · hidden on the storefront until configured and activated." and the setup-confirm dialog matches. The pinned test copy (`homepageContentControl.test.js`) updated to the new strings. Storefront behavior was already correct and is unchanged) |
| B-09 | partial outage shows error walls | **RESOLVED** (2026-10-19, Batch 2 / 2E: `HomepageSection.jsx` — an `unavailable` homepage-content contract now renders nothing per section (no more 11 stacked error walls) and logs the outage exactly once via the existing client warn channel. The hero's own single error surface is untouched. SSR test updated in `homepageLoading.test.js`) |
| B-10 | PublishedProductPicker stale banner | **RESOLVED** (2026-10-19, Batch 2 / 2A: component rewritten — banner is permission-aware (inspection-only copy for actors WITH `marketing.manage` vs capability-required copy otherwise, via `staffHomepageAccess(actor).write`); selection is never auto-cleared by paging/retry/refresh (test intentionally re-pinned from the old "clears on reload" behavior — approved B-10 change); search is a debounced (250 ms) server-side `q` passed through `loadPublishedHomepageProducts(actor, page, {q})` → `apiListProducts`. Tests in `homepageContentControl.test.js`) |
| B-11 | registered-media picker ergonomics | **RESOLVED** (2026-10-19, Batch 2 / 1B: server-side `q` — object key/filename + owning product name/SKU via the existing product_media mapping — `scope` (product/hero/marketing) and `mime` filters on `GET /media/assets` and `GET /employee/homepage/media-assets`, capped q length, defaults unchanged when no params; items now carry `scope` + `productName`/`productSku`; `RegisteredMediaPicker` gained a debounced search box, scope filter and product name/SKU display at the unchanged 24/page; selection (parent-held) survives paging. STEP-0 note: the previously claimed "picked key now displayed" mitigation was not backed by any Batch-1 diff — only the pre-existing `RegisteredMediaPicker` "Selected: <key>" line (HEAD :20) existed; superseded by this fix) |
| B-12 | non-hero placements accept unverified keys | **VERIFIED PARTIAL (2026-10-20)** — vocabulary `marketing.py:25–38` 13 values; `HOME_HERO` verifies via `registered_asset` (`marketing_media_service.py:169–181,248–252`); six retired closed (B-06); six live non-retired (`WOMEN_SECTION`,`LEHENGA_SECTION`,`BANGLES_SECTION`,`FESTIVE_SECTION`,`NEW_ARRIVALS`,`EDITORIAL`) accept unverified `objectKey` (shape-only `_validate_object_key:75`); decision needed to enforce or retire remainder. |
| B-13 | hero CTA no backend validation | **RESOLVED** (2026-10-19, Batch 2 / 2D: `MarketingMediaCreate` AND `MarketingMediaUpdate` in `schemas/media/marketing.py` now apply the same `safe_cta` write-only validator the homepage sections use (site-relative-only; external/protocol-relative CTAs → 422 on write). Frontend `safeCtaHref` (`homepageContentModel.js`) dropped its `https?` branch; admin error message reworded. Existing rows are NEVER re-validated/rewritten on read (a regression test keeps a pre-existing external CTA served as-is). Read-only dry-run counter: `backend/scripts/count_cta_href_violations.py` — refuses anything but the loopback disposable DB; live count UNVERIFIED (no local Postgres in this session). Tests: `MarketingCtaWriteValidationTests` (4)) |
| B-14 | `/home` storage stat per asset | NOT TOUCHED |
| B-15 | kurti lookbook hardcoded mood | **RESOLVED** (2026-10-19, Batch 2 / 2F: `KurtiLookbook.jsx` — the selected mood default is no longer the hardcoded `anarkalis`; the resolved mood is `selected if it is still a configured slot, else the first configured mood`, which covers both first paint and recovery after a re-save removes the selected slot. No server/envelope shape changes. SSR test added in `homepageSectionsRender.test.js`) |
| B-16 | browser-local media surfaces; mock review workflow | **VERIFIED NOT CLEAR (2026-10-20)** — Batch 3 Part 2 not implemented; `mediaStore.js` still `memoryMedia\|\|[]` session mirror; `AdminMediaLibrary.jsx:55–180` durable panel (server `GET /media/assets`) correctly labelled “Persisted in the database — these are the real product assets, not browser records” but lower `metrics.total`/`TABS` operate on browser mirror; `EmployeeMediaDashboard.jsx:8–90` pure mirror with no durable hydration; mock `Approve`/`review queue` absent, `PENDING_REVIEW` status-tab label remains. |
| B-17 | stale documentation in code | **VERIFIED PARTIAL (2026-10-20)** — `explore.py:1–10` schema narrative now true (heroSlides/homepageContent), `product_media.py` dual-read map true, `marketing_media.py:40–52` docstring true (REGISTER-FIRST); one stale sentence remains `BackendHomeHeroPanel.jsx:112` `Public /home does not expose altText.` now false (`explore_service.py:451–453` + `heroModel.js:196` expose `altText`). |
| B-18 | dead code in storefront/media scope | NOT TOUCHED (corrected 2026-10-19, Batch 2 STEP 0: previously claimed a `RegisteredMediaPicker` "existing-content fallback" label fix — that file has zero diff; dead code incl. `MediaUploadForm.jsx:30,33` `getImage`/`SAMPLE_VIDEO` un-removed) |
| B-19 | section picker labels under-sell | NOT TOUCHED |
| B-20 | no live preview in admin | NOT TOUCHED |

*Status cross-check (2026-10-20, verification pass): B-06/B-07/B-12/B-16/B-17 re-verified file:line with code read and test output; every label above matches the actual file state at that date (grep of the named files/lines) including the 2026-10-20 verification run. The status column is the only part updated; the original findings text is never edited.*
