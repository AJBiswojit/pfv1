# PRATIKSHYA FASHION — Media Management Root-Cause Audit & Proposed Remediation Plan

**Scope:** Super Admin → Media (`/super-admin/media`, and its `/admin/media` twin)
**Repository:** `AJBiswojit/pfv1` @ `50ad50b` (2026-10-22)
**Mode:** Investigation and planning only. No source, configuration, database, or runtime behaviour was changed.
**Verification performed:** source trace, read-only Node probe, existing backend/frontend test suites (ephemeral SQLite fixtures only).

---

## Executive summary

| # | Question | Answer |
|---|----------|--------|
| 1 | Why do the statistics cards show zero? | The twelve cards are computed by `useMediaMetrics()` → `mediaRepository.getMediaMetrics()` over an **in-memory, intentionally empty browser register** (`mediaStore.memoryMedia`, seeded with `[]`). They never read the durable registry (`GET /media/assets`) that supplies the ten rows shown above them. The zeroes are not a loading race, pagination artefact, or authorization failure — the register is empty on every page load and **no shipped UI writes to it**. |
| 2 | Why does All Media claim the backend media service is inactive? | The empty-state sentence at `AdminMediaLibrary.jsx:576` is **hardcoded** and is selected only because the same empty local register yields `media.length === 0`. There is no feature flag. The backend media service **is live and production-shaped**: object storage, registration, product association, placement registration, and the registry list all exist and pass tests. The copy is stale and cites `INTEGRATION_AUDIT.md §7`, a file that **does not exist in this repository**. |
| 3 | Are the two sections using separate data sources? | **Yes.** The durable panel calls `apiListMediaAssets()` → `GET /api/v1/media/assets` (server DB, admin token). Stats + All Media call `mediaRepository` → `mediaStore` (memory only). Separately, homepage hero entries live in `media_marketing_media` + `/admin/marketing/media`, product associations in `media_product_media`, and storefront product fallbacks in legacy `catalog_product` image columns. |
| 4 | Which UI controls are genuinely unnecessary or misleading? | Unnecessary: the local status/category/usage dropdowns, five of the eleven tabs (`Unmapped`, `Duplicates`, `Needs Review`, `Orphaned`, `Archived Product`), the memory-only bulk bar, the per-card “Local only” chip, and the cards `Active`, `Unmapped`, `Needs review`, `Optimized` (no backing server concept). Misleading: “Marketing Media” links to the Homepage Content Control Center; “Upload Media” is product-only and advertises video that the form rejects; the marketing scope inside the upload form is a dead end with a stale “no backend API yet” message; the empty-state copy. |
| 5 | What is the smallest safe implementation plan? | One read-only aggregate endpoint (`GET /media/assets/summary`) plus three optional list filters (`type`, `assigned`, `unassigned`/`placement`), then re-point the existing page at the existing registry: server-backed cards with loading/error/unauthorized states; All Media becomes a searchable, paginated registry list; delete the dead local filters/tabs/bulk bar; fix labels and copy. **No migration, no new model, no new media architecture, no record changes.** |

**Bottom line:** this is a **frontend integration defect plus stale copy**, not a missing backend. The backend capability exists; the page was never fully switched over to it.

---

## 0. Verified facts vs assumptions

### Verified (code, tests, or read-only probe)

- `useMediaMetrics`/`useMediaLibrary` read only `mediaRepository` (`frontend/src/hooks/useMedia.js:46,99`).
- `mediaRepository.getMediaMetrics()` (`mediaRepository.js:689`) computes over `cachedAll`, populated from `mediaStore.readMedia()`.
- `mediaStore.readMedia()` returns `memoryMedia || []` (`mediaStore.js:275`); `seeded()` returns `[]` (`mediaStore.js:243`); no `localStorage` read.
- No shipped page calls `mediaRepository.create/createMany`; the only caller is `useMediaActions.upload` (`useMediaActions.js:72`), and no live page calls `actions.upload`. The local register therefore cannot become non-empty through the current UI.
- The durable panel calls `apiListMediaAssets` (`AdminMediaLibrary.jsx:107-145`) → `GET /media/assets` (`backend/app/api/v1/media.py:942`), which returns real `media_media_asset` rows with `total`.
- The empty-state string is a hardcoded ternary on `media.length` (`AdminMediaLibrary.jsx:572-577`).
- `INTEGRATION_AUDIT.md` is absent from the working tree and from Git history; nine source/doc references remain.
- Backend media routes and registry listing are real and permission-checked (`media.view` for read, `media.upload` for writes).
- Tests pass in this checkout:
  - `backend/tests/unit/test_phase7_media_lifecycle.py` — **95 passed**
  - `backend/tests/unit/test_marketing_media.py` + `test_phase6_media_db.py` — **28 passed**
  - `frontend/tests/phase7ProductMedia.test.js` — **30 passed**
- Read-only probe: `mediaStore.readMedia()` → `0`; `mediaRepository.getMediaMetrics()` → every count `0`, while the registry client is untouched by that path.

### Assumptions / require runtime confirmation in the user's environment

- The ten rows visible in the screenshots correspond to `GET /media/assets` returning `total = 10`. High confidence, but this sandbox has no application database or media store, so the user's DB was not read.
- All ten are image assets. High confidence: every key ends `.avif`, the upload policy is image-only, and registration stores the sniffed type. Not verified against the user's rows.
- The four `products/...` rows are mapped to products, so the expected “Product media” count for the nine listed keys is 4. This assumes they were registered through the product path; a generic `/media/register` without a product can also produce `scope=product` with no mapping.
- `hero/primary.avif` and the four `marketing/*` rows have `scope=marketing` (the placement-registration contract). A generic product registration of a `hero/...` key would violate that assumption; runtime check listed in §3.6.
- No byte-duplicates or files ≥ 1.5 MB among the ten; **unknown** without DB access or per-object metadata.

### Unresolved without the user's environment

- Exact size distribution, checksum duplicates, and scope/namespace alignment of all ten rows.
- Whether any admin account with limited media permissions actually uses this page today.
- Whether `INTEGRATION_AUDIT.md` was deliberately removed or lost; no history survives in this checkout.

---

## 1. Actual implementation and data-flow map

### 1.1 Route and page

| Item | Location |
|---|---|
| Routes | `frontend/src/App.jsx:258-263` (`/super-admin/media`, `/super-admin/media/upload`, `/super-admin/media/marketing`); twins at `:167-175` for `/admin`. |
| Guard | `/super-admin` block is wrapped in `SuperAdminProtectedRoute` + `AdminLayout` (`App.jsx:233-263`). `/admin` uses `AdminProtectedRoute`. |
| Page | `frontend/src/pages/admin/media/AdminMediaLibrary.jsx` (589 lines). |
| Layout components | `AdminPage`, `AdminPanel`, `AdminMetricCard`, `PlacementAssetPanel`. |

The same page component serves both `/admin/media` and `/super-admin/media`; only the link prefix changes from `useAdminAuth().isSuperAdmin`.

### 1.2 Six media surfaces, not two

| Surface | Component(s) | Authoritative source | Persistence | Used by |
|---|---|---|---|---|
| Durable registry panel | `DurableAssetsPanel` (`AdminMediaLibrary.jsx:107-226`) | `apiListMediaAssets` → `GET /media/assets` | `media_media_asset` (DB) | This page; `RegisteredMediaPicker` uses the same endpoint |
| Stats cards + “All Media” grid | `useMediaLibrary`, `useMediaMetrics`, `useMediaActions` | `mediaRepository` → `mediaStore` | **Memory only** (`memoryMedia`) | This page, `EmployeeMediaDashboard`, legacy dead routes |
| Product media associations | `productMediaService`, `apiGetProductMediaSet`, `apiListProductMedia` | `media_product_media` + `media_media_asset` | DB | `AdminProductMedia`, `ProductMediaManager`, product upload |
| Homepage placement entries | `AdminMarketingMedia`, `BackendHomeHeroPanel`, `SectionContentEditor`, `homepageContentService` | `media_marketing_media` + `homepage_section_item` | DB | Homepage Content page, storefront `/home` |
| Homepage asset picker | `RegisteredMediaPicker` | `GET /media/assets?scope=...` | DB | Hero/editorial slots |
| Storefront product fallback | `productMediaSource`, `mediaResolver` | product record columns (`image`, `hoverImage`, `additionalImages`) + registered media set | Product DB + legacy JSON | Product pages/cards |

**The registry is shared** between product art and placement art: `media_media_asset.scope` is `product` or `marketing`; placement art is additionally referenced by `media_marketing_media.media_asset_id` or `homepage_section_item.media_asset_id`. The *local register is not part of this graph at all*.

### 1.3 Backend media endpoints — status

All under `backend/app/api/v1/media.py` unless noted.

| Endpoint | Auth | Status | Frontend caller |
|---|---|---|---|
| `GET /media/health` | public | implemented | none |
| `GET /media/storage/status` | public (secrets redacted) | implemented | **none** (`apiGetMediaStorageStatus` exists but is unused) |
| `GET /media/objects/{key}` / `HEAD` | public | implemented; no product-status check | storefront/images |
| `GET /media/object-meta/{key}` | public | implemented | none |
| `POST /media/references/resolve` | public | implemented | resolution pipeline |
| `GET /media/products/{id}/media-set` | public/staff-scoped | implemented | product media, storefront |
| `POST /media/objects` | `media.upload` | implemented → object only | `PlacementAssetPanel` |
| `POST /media/products/{id}/objects` | `media.upload` | implemented → object + asset + mapping atomically | product upload |
| `POST /media/register` | `media.upload` | implemented, idempotent by key | product upload/registration |
| `POST /media/register-placement` | `media.upload` | implemented for `hero/` + `marketing/`, idempotent | `PlacementAssetPanel` |
| `GET /media/assets` | `media.view` | implemented, DB-paginated, filters `q`/`scope`/`mime` | durable panel, picker |
| `DELETE /media/objects/{key}` | `media.delete` | implemented with complete reference audit | **no frontend caller** |
| `GET /media/assets/summary` | — | **does not exist** | — |
| `GET /media-reviews/*` | public | **health only** (`backend/app/api/v1/media_reviews.py`, 8 lines) | none |
| `/admin/marketing/media` CRUD + reorder | `media.view/upload/assign/delete` | implemented (`backend/app/api/v1/marketing_media.py`) | Homepage Content page |
| `GET /marketing/hero`, `/marketing/placements/{p}` | public | implemented | storefront |

**Conclusion:** a production-ready media API exists for objects, registration, product associations, placement registration, and registry reads. What does not exist is a **statistics/summary endpoint** and the **review workflow**.

### 1.4 Database model — what the registry actually stores

`MediaAssetModel` (`backend/app/models/media/media_asset.py:34-70`):

- identity: `object_key` (unique), `storage_provider`, `media_type` (default `image`), `mime_type`, `original_filename`, `file_size`, `checksum_sha256`
- optional: `width`, `height`, `title`, `alt_text`, `caption`
- lifecycle: `status` (only `uploaded` is ever written), `scope` (`product` or `marketing`), `uploaded_by`
- timestamps from `Base`

`GET /media/assets` (`media.py:987-999`) returns only:
`id, objectKey, url, status, mimeType, scope, productId, productName, productSku`, plus `total/page/pageSize`.

It **does not return** `fileSize`, `mediaType`, `checksum`, `width/height`, or `createdAt`. That is why some cards cannot be computed from the current response even if one tried.

---

## 2. Why the statistics cards show zero

### 2.1 The exact chain

```
<AdminMetricCard value={metrics.total} />
        ↑
useMediaMetrics()  (hooks/useMedia.js:99)
        ↑
mediaRepository.getMediaMetrics()  (mediaRepository.js:689)
        ↑
cachedAll  ← ensureCache() ← readMediaRaw()  (mediaRepository.js:60-100)
        ↑
mediaStore.readMedia()  (mediaStore.js:275)  →  memoryMedia || []
        ↑
writeMedia() only from mediaRepository writes; seeded() = []  (mediaStore.js:243)
        ↑
No live UI calls mediaRepository.create* / useMediaActions.upload
```

Meanwhile, the ten rows above come from:

```
DurableAssetsPanel → apiListMediaAssets({page,pageSize:24})
                   → GET /api/v1/media/assets  (media.py:942)
                   → media_media_asset rows
```

The two graphs share **no state**. The registry request succeeding cannot alter `metrics`.

### 2.2 Why it is not any of the “usual suspects”

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Different state source | **Confirmed root cause** | `useMediaMetrics` vs `apiListMediaAssets`; no shared store. |
| Browser-session state treated as inventory | **Confirmed** | `mediaStore` is memory-only; `seeded()` is `[]`; the page labels it “Local only”. |
| Wrong API response / empty array | **Not applicable** | The cards never call an API. The registry call returns rows; it is simply ignored by the cards. |
| Missing metadata on registry records | **Secondary** | Current list response omits `fileSize`/`checksum`, so Large/Duplicates are not derivable; but Total/Images/Product/Marketing are derivable and still show 0. |
| Filtering/pagination/async race | **Ruled out** | Cards are computed synchronously from a permanently empty array; no request, no loading state. |
| Server/local mix | **Confirmed** | Two disjoint inventories rendered on one page; only the upper one is server truth. |
| Authorization failure | **Ruled out as cause** | The registry panel would show nothing on 401/403 (`return null`), but the screenshots show ten rows, so the admin token and `media.view` work. |
| Feature flag | **None** | No `VITE_*MEDIA*` flag or conditional around stats. |

### 2.3 Read-only probe

```
$ node --import ./scripts/node-loader/register.mjs --input-type=module -e "
  import repo from './src/services/media/mediaRepository.js';
  import store from './src/services/media/mediaStore.js';
  console.log('records in local register:', store.readMedia().length);
  console.log('metrics:', JSON.stringify(repo.getMediaMetrics()));"
records in local register: 0
metrics: {"total":0,...,"large":0,"optimized":0,...}
```

This is deterministic and independent of the server: **every normal page load in every session gets zeros** (only developer tooling could inject a memory record).

### 2.4 Card-by-card diagnosis

The twelve displayed cards are at `AdminMediaLibrary.jsx:340-361`.

Legend: **Wrong** = should be non-zero from registry but is zero; **Coincidental** = zero happens to match current reality but source is wrong; **Undefined** = no server concept; **Unverifiable** = API cannot supply the value.

| Card | Intended definition | Actual source & calculation | Root cause / verdict | Proposed correction |
|---|---|---|---|---|
| **Total Media** | Registered assets in the library | `metrics.total` = `items.length` of memory register = 0 | **Wrong.** Registry total is 10. | `summary.total` from server; show `—` while loading/error. |
| **Images** | Image assets | `metrics.images` = local `type === IMAGE` = 0 | **Wrong.** All registry assets are images. | `summary.imageCount` (`media_type='image'`). |
| **Videos** | Video assets | local `type === VIDEO` = 0 | **Coincidental.** The upload policy is image-only (`media_validation.py:253+`), so the expected server count is also 0 — but for a capability reason, not because the register is empty. | `summary.videoCount`; hint “Video upload is not enabled (image-only policy)”. |
| **Product Media** | Assets assigned to products | local `scope === PRODUCT` = 0 | **Wrong.** The four `products/...` rows are product media. | `summary.productMapped` (scope=product **and** a `media_product_media` row) or all product-scope — see decision D2. |
| **Marketing Media** | Hero/marketing placement art | local `scope === MARKETING` = 0 | **Wrong.** Five of the nine listed keys are placement art. | `summary.marketing` = `scope='marketing'` (includes `hero/` and `marketing/`). |
| **Unassigned** | Registered asset not attached to a product | local `scope === UNASSIGNED` = 0 | **Wrong/undefined.** The server has no `UNASSIGNED` scope; equivalent is a product-scope asset with no `media_product_media` row. | `summary.productUnmapped` (assumption: all listed product rows are mapped → 0). |
| **Active** | “Visible to customers” | local `status === ACTIVE` = 0 | **Undefined.** Every durable asset has `status='uploaded'`; publication is controlled by product status or marketing `is_active`, not by the media row. | **Remove** the card. Replace with “Registered” only if a redundant total is wanted. Do not label all assets Active. |
| **Unmapped** | Missing taxonomy mapping | local `mappingStatus === UNMAPPED` = 0 | **Unverifiable/undefined.** No taxonomy columns on `media_media_asset`; no UI sets `mappingStatus`. | **Remove** card (and tab). |
| **Duplicates** | Exact/possible duplicates | local `duplicateStatus` = 0 | **Unverifiable.** DB has `checksum_sha256` (indexed), but the list response does not expose it and no workflow classifies duplicates. | Add `summary.duplicateAssets`/`duplicateGroups` via checksum grouping, **rename** “Same-byte copies”, or remove pending decision D4. |
| **Needs review** | Review queue | local `mappingStatus`/`duplicateStatus`/broken flags = 0 | **Undefined.** `media_reviews` router is health-only; no review workflow. | **Remove** card and tab until a review backend exists. |
| **Large files** | Originals ≥ 1.5 MB | local `large` flag = 0; no UI ever sets it | **Unverifiable.** `file_size` exists server-side but is omitted from `GET /media/assets`. | `summary.largeFiles` (`file_size >= threshold`, default 1,572,864 B). |
| **Optimized** | Derived/optimized asset exists | local `optimizedPath` = 0 | **Undefined.** No optimized derivative is modelled for durable assets; the local field is never written. | **Remove**; optionally add a factual “AVIF” count later (do not equate AVIF with optimization). |

### 2.5 Expected values for the visible rows (assumption-flagged)

For the **nine keys listed** in the report request:

| Card | Expected from registry | Assumption |
|---|---|---|
| Total | 9 listed (+1 unseen = 10) | Panel total = 10 |
| Images | 9 (+ unseen if image) | all `.avif` |
| Videos | 0 | image-only upload policy |
| Product Media | 4 (`PF-GEN-0002` ×3, `PF-GEN-0001` ×1) | all four are mapped to products |
| Marketing Media | 5 (4 × `marketing/*`, 1 × `hero/primary.avif`) | registered via placement path (`scope=marketing`) |
| Unassigned | 0 | all product keys mapped |
| Active | undefined | no media-level publication |
| Unmapped | undefined | no taxonomy |
| Duplicates | unknown | checksum not exposed |
| Needs review | undefined | no workflow |
| Large files | unknown | size not exposed |
| Optimized | undefined | no derivative concept |

The tenth record adds to one of the image/product/marketing buckets; it cannot change the fact that the current cards are wrong.

### 2.6 Which zeroes are “correct”

- **Correct by coincidence:** Videos = 0 (image-only pipeline).
- **Actually wrong:** Total, Images, Product Media, Marketing Media, Unassigned.
- **Not defined at all:** Active, Unmapped, Needs review, Optimized.
- **Cannot be determined from the current API:** Large files, Duplicates (both are determinable DB-side).
- **Correct only as a statement about the browser register:** all twelve — but that is not what the labels say.

**Do not** make the numbers “look right” by classifying every registry object as `ACTIVE` or by inventing taxonomy/review metadata. The plan below removes undefined metrics instead.

---

## 3. Why “All Media” says the backend service is inactive

### 3.1 The exact cause

`AdminMediaLibrary.jsx:572-577`:

```jsx
{media.length
  ? "No media matches these filters."
  : "No media records yet. The backend media service is not active in this phase
     (see INTEGRATION_AUDIT.md §7) — records will appear here once the media API
     is enabled, and product imagery currently comes from product records."}
```

- `media` = `useMediaLibrary()` = empty memory register.
- No API request feeds `media`.
- The string is hardcoded; there is no feature flag or capability probe.
- The panel above (`DurableAssetsPanel`) is independently fetching and displaying the registry; it proves the API is active.

### 3.2 Is the backend media service available?

**Yes.** Evidence:

- `GET /media/assets` route exists at `media.py:942-1003`, returns DB-paginated real rows with `total`; requires `media.view`.
- `POST /media/products/{id}/objects` uploads + registers atomically (`media.py:707-789`).
- `POST /media/register-placement` registers `hero/`/`marketing/` objects, verifies existence and sniffed content (`media.py:875-934`; service at `placement_asset_service.py:66-120`).
- `DELETE /media/objects/{key}` performs a complete reference audit before deleting (`media.py:1005-1077`).
- Object storage validation, namespace allowlist and key normalization are implemented (`media_validation.py`, `storage/keys.py`).
- `test_phase7_media_lifecycle.py` passes 95 tests covering upload → register → assign → publish → serve; `test_phase6_media_db.py` + `test_marketing_media.py` pass 28 tests.
- The screenshots themselves show the registry populated through this API.

What is **not** available: media review/approval (`media_reviews.py` health only), media-level publication status, taxonomy/category fields, usage roles, optimized derivatives, and an aggregate stats endpoint.

### 3.3 Missing backend vs missing integration vs mapping vs authorization vs limitation

| Category | Finding | Evidence |
|---|---|---|
| **Missing backend capability** | Review workflow; media-level publish status; category/usage taxonomy; optimized derivative; video upload; summary counts. | `media_reviews.py`; `MediaAssetModel` columns; `media_validation.py` image-only; no summary route. |
| **Missing frontend integration** | Stats cards; All Media list; server search/filters; loading/error/unauthorized states; accurate empty state. | `AdminMediaLibrary` uses `mediaStore`; only `DurableAssetsPanel` uses the API. |
| **Incorrect data mapping** | Local `UNASSIGNED` scope used where the server has no such scope; local `ACTIVE` status used where every server row is `uploaded`; local `mappingStatus`/`usageRoles` never written. | `mediaStore.normaliseMedia`; `mediaRepository.getMediaMetrics`; no writers. |
| **Authorization failure** | **Not the cause.** Registry list works for the Super Admin; backend enforces `media.view`. However, 401/403 in `DurableAssetsPanel` is silently rendered as `null` (`AdminMediaLibrary.jsx:139-141`), which would look like “no registry”. | Code + tests. |
| **Intentional product limitation** | Marketing scope on the generic upload form is blocked by design; review queue deferred; video unsupported; local register retained only as a session mirror. | `MARKETING_MEDIA_BLOCKER`; `App.jsx` redirects review/mapping/detail; `media_validation.py`. |

### 3.4 Are product catalogue, homepage assets, and marketing assets separate systems?

Yes, by design, but they share the durable registry:

1. **Product media (durable):** `media_media_asset` (scope `product`) + `media_product_media`; uploaded/registered through product routes; read via media-set.
2. **Placement art (durable):** `media_media_asset` (scope `marketing`, namespaces `hero/`/`marketing/`); registered through `/media/register-placement`; consumed by homepage pickers.
3. **Homepage marketing entries:** `media_marketing_media` (placement, order, `is_active`, copy, `media_asset_id`); managed by `/admin/marketing/media` and the Homepage Content page.
4. **Homepage section items:** `homepage_section_item.media_asset_id`; managed by the homepage content APIs.
5. **Legacy product image columns:** `catalog_product.image/hover_image/additional_images`; used as storefront fallback and **not** media records.
6. **Browser session register:** memory only; not persisted; not server truth.

### 3.5 Is the integration audit accurate?

`INTEGRATION_AUDIT.md` **does not exist**. Nine references remain in source/docs (e.g. `AdminMediaLibrary.jsx:576`, `mediaStore.js:16,237`, `operationsService.js:11`, `inventoryRepository.js:68`, `attendanceService.js:280`). The UI cannot cite a section of a non-existent document.

Other audit docs are partially stale:

| Document | Claim | Current code | Verdict |
|---|---|---|---|
| `docs/full-stack-integration-audit.md:30` | marketing media tables have no columns; media_reviews is health-only | `media_marketing_media` has a full model and CRUD; media_reviews is still health-only | **Partly stale** |
| `docs/full-stack-integration-audit.md:343` | `GET /media/assets` requires `media.upload` | Requires `media.view` (`media.py:968`) | **Stale** |
| `docs/admin-complete-audit.md:280` | `/media/assets` is unbounded | DB-paginated with `total/page/pageSize` (`media.py:942-1003`) | **Stale** |
| `docs/admin-complete-audit.md:401` | delete leaves asset rows pointing at missing objects | Delete audits references, removes row first, then object (`media.py:1005-1077`) | **Stale** |
| `docs/audit/homepage-admin-verification.md:368-398,507` | two sources; B-16 session mirror; strip/label mirror | Accurate; still says six live non-hero placements, while code now retires twelve (`marketing_media_service.py:41-49`) | **Mostly accurate, minor stale** |

The lesson: the UI must derive state from the API, not from prose.

### 3.6 Safe runtime checks (read-only, no mutations)

1. Open DevTools → Network on `/super-admin/media`:
   - `GET /api/v1/media/assets?page=1&pageSize=24` → **200**, `total: 10`.
   - There is **no** stats/summary request.
2. Console (does not mutate): `localStorage.getItem('pratikshya_media')` → `null` (and the store never reads it). `sessionStorage` likewise.
3. `GET /api/v1/media/storage/status` with the browser session → 200; confirms provider/configured state without secrets.
4. `GET /api/v1/media/assets?scope=product&pageSize=1` → `total` (expect 4/5).
5. `GET /api/v1/media/assets?scope=hero&pageSize=1` + `scope=marketing&pageSize=1` → totals should sum to the placement count (expect 5).
6. Inspect each item’s `scope` vs `objectKey` prefix:
   - `products/...` should be `scope=product`
   - `hero/...`/`marketing/...` should be `scope=marketing`
   - a mismatch is a data-classification defect (see A-14).
7. For large files: authenticated `GET /api/v1/media/object-meta/{encodedKey}` per asset returns `size`; compare with 1,572,864 B. This is read-only but N requests; do not mutate.
8. DB-side read-only (if available): `SELECT scope, media_type, count(*), count(*) FILTER (WHERE file_size >= 1572864) FROM pratikshya.media_media_asset GROUP BY 1,2;` and a `GROUP BY checksum_sha256 HAVING count(*) > 1` query. Do not run updates.
9. Do **not** upload/register/delete anything to prove the diagnosis; the existing tests already cover those paths.

No credentials, tokens, or environment variables need to be shared for any of the above.

---

## 4. UI control audit (top to bottom)

Classifications are from the requested set: **Keep / Simplify / Combine / Rename / Move / Remove / Keep disabled until integration is available.**

| # | Control | Location / handler | Evidence | Classification | Recommendation and why |
|---|---|---|---|---|---|
| 1 | **Marketing Media** header button | `AdminMediaLibrary.jsx:310-314` → `${prefix}/media/marketing` → `AdminMarketingMedia` | Destination title is **“Homepage Content Control Center”** (`AdminMarketingMedia.jsx:74`); nav already calls it “Homepage Content” (`adminNavigation.js:81`) | **Rename** (and **Move** to secondary) | Rename to **“Homepage Content”**. It manages hero/section editorial content, not the marketing media registry. Keeping the wrong label sends admins to an unexpected page. |
| 2 | **Upload Media** header button | `:316-326` → `/media/upload` → `MediaUploadForm` | Form is product-only for real writes; marketing scope is blocked (`MediaUploadForm.jsx:197-199`); page description promises “image and video” (`AdminMediaUpload.jsx:16`) | **Rename**, **Simplify** | Rename **“Upload Product Media”**; correct the page description (images only, video not enabled). Keep because the product pipeline is real. |
| 3 | **Homepage placement art** panel | `PlacementAssetPanel` rendered at `:329-333` | Real APIs: `apiUploadMediaObject` + `apiRegisterPlacementAsset` (`PlacementAssetPanel.jsx:42-49`); backend allowlist/verification tests pass | **Keep**, **Move**, **Simplify** | Functional and unique. Move below the registry (daily task is finding/auditing media, not uploading seed art); consider collapsible “Advanced placement registration”. Clarify it is for `hero/` and `marketing/` art only. |
| 4 | **Register existing object** panel | `PlacementAssetPanel.jsx:129-150`; handler `:71-89` | Real, idempotent endpoint; tests cover duplicate/missing/namespace rejection | **Keep**, **Move** | Needed for seed art already in storage. Move under an “Advanced” disclosure. Input-by-key is acceptable because raw storage browsing is intentionally absent. |
| 5 | **Placement namespace selector** (`hero/`, `marketing/`) | `PlacementAssetPanel.jsx:16-19,101-110` | Drives upload namespace; backend closed vocabulary | **Keep** | Two meaningful options; rename label to “Placement namespace”. |
| 6 | **File picker + Upload and register** | `:112-119`, `:38-66` | Image-only, 10 MB, server-verified; handles partial failure by exposing the object key | **Keep** | Good workflow; add explicit image-only wording (it already says JPEG/PNG/WebP/AVIF). |
| 7 | **Media Workflow Destination** (Product/Marketing) on upload page | `MediaUploadForm.jsx:404-424` | Marketing branch always errors on submit (`:197-199`) with **stale** copy “no backend API yet” (`:377-378`) | **Remove** (from admin page) or **Keep disabled until integration** | There is no single upload→marketing-placement workflow. Placement art has its own panel. Pass `allowScopeChange={false}` / `initialScope={PRODUCT}` from `AdminMediaUpload`; do not refactor the shared form beyond copy. |
| 8 | **All Media tabs** (`All, Images, Videos, Product, Marketing, Unassigned, Unmapped, Duplicates, Needs Review, Orphaned, Archived Product`) | `AdminMediaLibrary.jsx:31-46, 366-401` | All tabs filter the empty memory register; `UNMAPPED`/`DUPLICATE`/`NEEDS_REVIEW`/`ORPHANED`/`ARCHIVED_PRODUCT` have no durable fields/workflow; `ORPHANED`/`ARCHIVED` use unhydrated `catalogRepository` (`:245-256`) | **Remove** (5 tabs), **Keep disabled** (Videos) | Keep: All, Images, Product, Marketing, Unassigned. Videos: keep only if the card is kept; disable with “video upload not enabled”. Remove the rest; they imply backend features that do not exist. |
| 9 | **Search** field | `:405-421` | Filters local memory only; placeholder promises title/SKU/placement/author | **Keep**, **Simplify**, **Move** | Repoint to the durable registry’s existing server search (`q`: object key/filename + product name/SKU). Rewrite placeholder to match what the server actually searches. |
| 10 | **Status** dropdown | `:422-438` | Local `MEDIA_STATUS`; server rows are all `uploaded` | **Remove** | A filter whose only real value would be `uploaded` is noise. Reintroduce only with a real review/publication status. |
| 11 | **Category** dropdown | `:439-456` | Local `categoryId`; no category on `media_media_asset`; taxonomy comes from catalog store | **Remove** | Misleading: it cannot classify durable media. Would require a schema decision, not a UI fix. |
| 12 | **Usage** dropdown | `:457-474` | Local `usageRoles`; no server field and no writer | **Remove** | Same as above; placement/role concepts live in other tables and are not exposed by the registry list. |
| 13 | **Bulk bar** (Activate / Archive / Remove) | `:458-491`; handlers `actions.activate/archive/removeMany` | Writes `mediaRepository` memory only (`useMediaActions.js:117-169`); records vanish on reload; unreachable while register is empty | **Remove** | Gives the false impression of durable archive/delete. The backend has no media-asset activate/archive verb; delete exists but must be a deliberate, reference-checked single-asset action. |
| 14 | **Per-card checkbox** | `:524-530` | Only used by bulk bar | **Remove** | No valid bulk action remains. |
| 15 | **“Local only — not saved on the server” chip** | `:547-557` | Repeated on every card | **Remove** with the local grid | Confusing repetition; the entire surface should be server-backed instead of labelling each row as ephemeral. |
| 16 | **“View product” link** | `:558-568` | Uses local `productId` + catalog lookup | **Keep concept**, reimplement | For durable rows, `productId` is returned by the API; link to `${prefix}/products/{productId}/media`. Valuable workflow. |
| 17 | **Footer “Showing X of Y · draft · archived · only active media reaches customers”** | `:582-585` | Local counts; “active reaches customers” is false for the local register | **Replace** | Use “Showing 1–24 of N registered assets”; explain that product publication and homepage activation control visibility, not a media status. |
| 18 | **Durable registry panel** | `:107-226` | Server truth, paginated, read-only | **Combine** into All Media | Having “Durable registry” and “All Media” as two inventories is the core UX defect. Merge into one server-backed **Registered media** panel; keep the total and pagination. |
| 19 | **Empty-state sentence** | `:576` | Hardcoded, false, cites missing doc | **Remove / Replace** | Replace with four honest states: loading, error+retry, unauthorized, genuinely empty. |
| 20 | **Cards: Active, Unmapped, Needs review, Optimized** | `:346,353-361` | No server concept | **Remove** | Do not fabricate. If product wants them, define backend fields/workflow first. |
| 21 | **Cards: Total, Images, Videos, Product, Marketing, Unassigned, Large, Duplicates** | `:340-345,358-360` | Can be server-derived (Large/Duplicates need summary endpoint) | **Keep** + re-source | This is the minimum useful, truthful set (8 cards). |
| 22 | **Durable registry item thumbnails** | `:180-210` | Uses `asset.url`; good | **Keep** | Already server-backed; add scope/product context and a product link. |

### 4.1 Proposed page hierarchy (Super Admin)

1. **Header:** “Media Management” with primary **Upload Product Media** and secondary **Homepage Content**.
2. **Server-backed KPI row:** 8 truthful cards; loading/error states never fall back to zero.
3. **All registered media** (the merged durable registry):
   - server search (`q`), tabs (`All`, `Images`, `Product`, `Marketing`, `Unassigned`, optional disabled `Videos`), 24/page;
   - each row: thumbnail, object key, MIME, scope, product name/SKU + “Open product”, registered status;
   - honest loading/empty/error/unauthorized/no-match states.
4. **Homepage placement art** (secondary, collapsible): upload+register and register-existing, unchanged functionally.
5. No local session register, no mock statuses, no “Local only” labels on this page.

This prioritises the Super Admin’s real jobs: find an asset, confirm what it is attached to, open the owning product, upload product art, and register homepage art.

---

## 5. Security, permissions, and data integrity

### 5.1 What is done well

- **Backend authorization is real.** All media reads use `media.view`; uploads/registration use `media.upload`; deletion uses `media.delete` (`media.py`). Tests prove:
  - customer and employee tokens cannot use admin media routes;
  - an admin with `media.view` but no `media.upload` can list but not upload/register;
  - employees cannot register placement art even with `media.upload`;
  - view-only admins get 200 on `GET /media/assets`.
- **Upload validation** is content-based, not filename-based: configured image MIME allowlist, 10 MB ceiling, signature sniff, dimension/pixel guard (`media_validation.py:253+`, `config.py:181-192`).
- **Object key validation** rejects traversal/absolute/drive forms, enforces a namespace allowlist and per-segment rules (`storage/keys.py`).
- **Placement registration** derives the namespace from the key, restricts to `hero/`/`marketing/`, verifies the object exists and its sniffed content is a supported image; idempotent by key (`placement_asset_service.py:66-120`).
- **Registration metadata** comes from the stored object, never from client claims (`_register_product_asset`).
- **Delete** audits product mappings, legacy product columns, homepage section items and marketing rows before deleting; row first, object second (`media.py:1005-1077`).
- **Duplicate key registration** is a no-op, not a second row.

### 5.2 Risks found (report only; not fixed in this task)

| ID | Severity | Risk | Evidence | Impact |
|---|---|---|---|---|
| S-01 | **High** | `DurableAssetsPanel` hides 401/403 by returning `null`; stats have no error state. A session/permission failure is indistinguishable from “no media”. | `AdminMediaLibrary.jsx:139-141`; cards unconditional | Operators can believe the registry is empty when the request failed. This is the same class of failure as the reported bug. |
| S-02 | **Medium** | Any admin session is treated as having full media rights in the UI (`resolveMediaAccess` returns `fullGrant` for any `admin`). | `mediaAccess.js:31-58`; `AdminMediaLibrary` gates upload/register on `actions.access.canUpload` | A restricted admin sees upload/register/bulk controls, then receives 403. Backend is secure, but the UI implies authority the account lacks. |
| S-03 | **Medium** | The product registration path accepts any valid object key and writes `scope='product'`; it does not require a `products/` namespace. | `media.py:161-233` (`_register_product_asset`), called by `/media/register`; only `_safe_key` is checked | A `hero/...` object registered through the product route becomes product-scoped; scope and namespace disagree, so stats classification can be wrong. Needs a read-only reconciliation check. |
| S-04 | **Medium (pre-existing)** | Raw object route `GET /media/objects/{key}` is public and does not check product status; product keys are deterministic (`products/{productId}/...`). | `media.py:479-526`; documented in `docs/audit/homepage-admin-verification.md §3.1` | Unpublished/archived product art is retrievable by anyone who can guess/learn the key. This is a storage-visibility design issue, not a Media page defect. |
| S-05 | **Medium** | Memory-only bulk “Remove/Archive/Activate” looks durable but is not. | `useMediaActions.js:117-169`; `mediaStore.writeMedia` | If a local record existed, an operator could believe a removal/archival persisted; it disappears on reload. Backend state unchanged. |
| S-06 | **Low** | Registering an existing key returns the existing row without re-checking that the stored bytes still match its metadata. | `placement_asset_service.py:104-118`; `_register_product_asset` existing-row branch | If an object is replaced out-of-band at the same key, the registry reports stale MIME/size/checksum. |
| S-07 | **Low** | Placement upload can succeed while registration fails, leaving an unregistered object in storage. The UI exposes the key for retry, but there is no automatic cleanup. | `PlacementAssetPanel.jsx:42-59` | Orphan objects; `GET /media/audit/orphans` exists for reporting. No data loss. |
| S-08 | **Low** | Stale/absent audit documentation drives copy and expectations. | `INTEGRATION_AUDIT.md` absent; obsolete claims in `full-stack-integration-audit.md` / `admin-complete-audit.md` | Misleads future maintainers and produced the false empty state. |
| S-09 | **Low** | UI page is reachable by direct URL for an admin without `media.view`; only the API rejects. | Route `App.jsx:258`; no page-level permission check | Error UX, not a bypass (backend 403), but it should render an explicit denied state. |

**No evidence of an authorization bypass in the media registry path.** The security posture is materially better than the UI suggests.

---

## 6. Phase A — Root-cause findings

| ID | Severity | Source | Current behaviour | Evidence | User-facing impact | Status |
|---|---|---|---|---|---|---|
| **A-01** | **High** | `AdminMediaLibrary.jsx:232-234,340-361`; `hooks/useMedia.js:99`; `mediaRepository.js:689`; `mediaStore.js:243,275` | Stats are computed from an empty in-memory register and never from the registry. | Node probe shows 0 for every metric; no API call in the chain. | All 12 KPI cards read 0 while 10 assets exist. False inventory. | **Confirmed** |
| **A-02** | **High** | `AdminMediaLibrary.jsx:31-46,260-306,364-585`; `mediaStore.js:275` | “All Media” is the same empty register; no live writer exists (no page calls `mediaRepository.create*`). | `grep` of create/upload call sites; `seeded() = []`; only dead routes use `actions`. | The main media list cannot show a record through the current UI; tabs/filters always empty. | **Confirmed** |
| **A-03** | **High** | `AdminMediaLibrary.jsx:576`; `INTEGRATION_AUDIT.md` missing | Hardcoded empty state claims the backend service is inactive and cites a non-existent doc. | File absent; `GET /media/assets` live; 95 backend tests pass; panel shows rows. | Operators conclude the backend is unavailable and may avoid the working upload/registry flows. | **Confirmed** |
| **A-04** | **Medium** | `AdminMediaLibrary.jsx:340-361` | Four cards (`Active`, `Unmapped`, `Needs review`, `Optimized`) have no server definition; every durable asset is `status='uploaded'`, with no taxonomy/optimized fields. | `MediaAssetModel`; `media.py:987-999`; no writers for local fields. | Zeros look factual but are undefined; “Active = visible to customers” is especially misleading. | **Confirmed** |
| **A-05** | **Medium** | `AdminMediaLibrary.jsx:358-360`; `schemas/media/media.py:243-258`; `media.py:987-999` | `Large files` and `Duplicates` cannot be derived: `file_size`/`checksum_sha256` are stored but omitted from the list response. | Model vs response schema. | Values are unverifiable, and any future client-side attempt would be wrong (page-scoped). | **Confirmed (capability); actual counts need DB/API meta checks** |
| **A-06** | **Medium** | `AdminMediaLibrary.jsx:107-145,340-361` | Registry 401/403 renders as `null`; cards have no loading/error/unauthorized states. | Code. | A permissions/session failure looks exactly like “no media”; silent zeros. | **Confirmed** |
| **A-07** | **Medium** | `AdminMediaLibrary.jsx:458-491`; `useMediaActions.js:117-169` | Bulk Activate/Archive/Remove mutate memory only; records vanish on reload. | Repository/store code. | False impression of durable archive/deletion. | **Confirmed** |
| **A-08** | **Medium** | `AdminMediaLibrary.jsx:310-326`; `AdminMediaUpload.jsx:14-19`; `MediaUploadForm.jsx:377-378` | “Marketing Media” opens Homepage Content; “Upload Media” is product-only but promises video; marketing scope is a dead end with false “no backend API yet” copy. | Destinations and handlers. | Wrong expectations, dead-end submissions, duplicated workflows. | **Confirmed** |
| **A-09** | **Medium** | `AdminMediaLibrary.jsx:31-46,245-256,405-474` | Five tabs and three dropdowns filter fields (`mappingStatus`, `duplicateStatus`, `usageRoles`, `categoryId`, local `status`) that the durable model does not have; orphan/archived logic depends on an unhydrated catalog store. | Local normaliser vs server model. | Controls imply capabilities that do not exist. | **Confirmed** |
| **A-10** | **Medium** | `mediaAccess.js:31-58`; `AdminMediaLibrary.jsx:316-333` | UI grants full media controls to any admin session; backend enforces actual permissions. | Code + RBAC tests. | Restricted admins hit 403 after being shown enabled controls. | **Confirmed** |
| **A-11** | **Low** | `AdminMediaLibrary.jsx:107-226` vs `:364` | Two inventories with two totals on one page; panel eyebrow “Register”, title “All Media”, upper panel “Durable media registry”. | Code. | Operators cannot tell which list is authoritative. | **Confirmed** |
| **A-12** | **Low** | `AdminMediaDetail.jsx`, `AdminMediaProductMapping.jsx`; `App.jsx:172-174,260-262` | Dead components remain; their routes redirect. | Routes/components. | Maintenance noise; risk of accidental re-use. | **Confirmed** |
| **A-13** | **Medium (security, pre-existing)** | `media.py:479-526` | Public object route does not check product status; deterministic keys. | Code + prior audit. | Unpublished art retrievable by key. | **Confirmed code; deployment impact not tested** |
| **A-14** | **Medium (data integrity)** | `media.py:161-233` | `/media/register` accepts a non-`products/` key and writes `scope='product'`; scope/namespace can disagree. | Code; no namespace restriction in `_register_product_asset`. | Stats classification and ownership can be wrong for such rows. | **Confirmed code; occurrence in user data unverified** |
| **A-15** | **Low** | `placement_asset_service.py:104-118` | Existing key returns existing row without byte/metadata re-check. | Code. | Stale MIME/size/checksum if object replaced outside the app. | **Confirmed; scenario unverified** |
| **A-16** | **Medium (process)** | `frontend/tests/phase7ProductMedia.test.js`; no page test | Suite passes while the page is demonstrably broken; only string-absence assertions cover the page. | Test run: 30 pass; no stats/empty-state coverage. | Regression risk; the bug survived CI. | **Confirmed** |
| **A-17** | **Low** | `INTEGRATION_AUDIT.md` references; stale docs | UI cites a missing file; several audit docs describe an older backend. | `find`/`git log`; doc comparisons. | Misinformation drives future work. | **Confirmed** |

---

## 7. Phase B — Recommended behaviour

### 7.1 Statistics cards (8 truthful cards)

| Card | Definition | Server calculation | Notes |
|---|---|---|---|
| **Total Media** | All registered assets | `count(*)` on `media_media_asset` | Independent of filters. |
| **Images** | Registered image assets | `media_type='image'` | Orthogonal facet. |
| **Videos** | Registered video assets | `media_type='video'` | 0 today; hint “Video upload is not enabled”. |
| **Product Media** | Assets currently mapped to a product | `scope='product'` **and** exists in `media_product_media` | Decision D2 if you prefer all product-scope. |
| **Marketing Media** | Registered hero/marketing placement art | `scope='marketing'` (both namespaces) | Do **not** use the list endpoint’s `scope=marketing` filter, which excludes `hero/`. |
| **Unassigned** | Product-scope assets with no product mapping | `scope='product'` and no `media_product_media` row | Decision D3; marketing art is not “unassigned” by this definition. |
| **Large Files** | Assets at or above 1.5 MB | `file_size >= 1_572_864` | Threshold decision D5. |
| **Same-byte copies** (Duplicates) | Assets sharing a SHA-256 with another asset | group by `checksum_sha256` having count > 1; report assets and groups | Decision D4 on label/definition. |

**Removed:** `Active`, `Unmapped`, `Needs review`, `Optimized` — no truthful server definition. Do not replace them with `0` or with fabricated statuses. If the design system requires 12 tiles, show “Not tracked” with an explanatory hint and a link to the backlog; I recommend 8 tiles.

**States:** loading → `—` (not 0); error → `—` + retry banner; unauthorized → no tiles + explicit message; genuine empty → 0 with “No media registered yet.”

### 7.2 Durable registry / All Media

- One server-backed panel titled **“Registered media”** (drop the separate durable panel and the “All Media” local grid).
- Header shows `total` from the server, e.g. “Registered media (10)”.
- Page size 24, newest first, Previous/Next; display “Showing 1–24 of 10”.
- Each row/card: thumbnail, `objectKey`, MIME, scope label (`Product` / `Marketing`), owning product name/SKU (when present) + **Open product** link, and `status` displayed as **Registered** (raw `uploaded` is not useful).
- Search: server-side `q` (object key/filename + product name/SKU), debounced 250 ms, resets to page 1.
- Tabs: `All`, `Images`, `Videos` (disabled with explanation), `Product`, `Marketing`, `Unassigned`.
  - Product = `scope=product&assigned=true`
  - Marketing = `scope=marketing` including `hero/`
  - Unassigned = `scope=product&unassigned=true`
  - Images/Videos = `type=image|video`
- Remove status/category/usage dropdowns, 5 dead tabs, bulk bar, checkboxes, local-only chips.

### 7.3 Upload and registration

- Keep **Upload Product Media** as the single product-upload entry point; it already uses the real pipeline and reports server-confirmed stages.
- Hide the marketing scope in the admin upload page (`allowScopeChange={false}`, `initialScope=PRODUCT`) and correct its copy. Do not delete the shared form’s capability without a separate decision (employee/other callers).
- Keep **Homepage placement art** as the single placement upload/register workflow, with two explicit actions; relocate it below the library as a secondary/advanced panel.
- Keep **Register existing object** for seed art; label it as advanced.
- Remove the false “no backend API yet” sentence; if a marketing upload path remains visible, state the real reason (explicit two-step placement workflow) or hide it.

### 7.4 Server vs browser-local

- The Super Admin Media page should display **only server data**.
- The browser register may remain for other surfaces that still use it, but must not be presented as inventory here. If retained anywhere, label it “Session workspace — not saved” and never show it on the same page as server totals without a hard boundary.
- No local records should be counted, merged, or used to “top up” registry totals.

### 7.5 States

| State | Behaviour |
|---|---|
| Loading | Status text; cards `—`; list skeleton. Never zeros. |
| Error | Banner with server message + Retry; cards `—`. |
| 401 | “Session expired — sign in again.” No retry loop. |
| 403 | “You need media.view to view the registry.” Hide mutation controls. |
| Empty (server total 0) | “No media has been registered yet.” Links to product upload and homepage placement art. |
| No filter match | “No assets match these filters.” Clear filters. |
| Partial page | “Showing 1–24 of N”; disable Previous/Next at bounds. |

---

## 8. Phase C — Minimal file-by-file changes

No database migration, no new model, no changes to existing media records.

| File / path | Current problem | Proposed change | Dependencies | Risk |
|---|---|---|---|---|
| `backend/app/schemas/media/media.py` | No summary schema; list item lacks counts needed for cards | Add `MediaAssetSummaryResponse` (`total, images, videos, productMapped, marketing, unassigned, largeFiles, duplicateAssets, duplicateGroups, byStatus, generatedAt`). Keep existing item schema unchanged (or add `mediaType`/`fileSize` only if the UI needs them — not required for this plan). | None | Low; additive API contract. |
| `backend/app/services/media/homepage_content_service.py` | `normalize_asset_page_filters(q, scope, mime)` cannot express type/assigned/unassigned/placement-including-hero | Extend with optional `media_type`, `assigned`, `unassigned`, `placement` filters; keep defaults byte-identical for the picker. | Schema constants | Low–Medium; shared with the employee picker. Defaults and tests must prove no behaviour change. |
| `backend/app/api/v1/media.py` | No stats endpoint; list cannot satisfy the proposed tabs/cards | Add `GET /media/assets/summary` (`get_current_admin` + `require_admin_permission("media.view")`), computed in one read-only query. Wire the new list filters. Do not change upload/register/delete semantics. | Schema + filter helper | Low; read-only; same permission as the list. Aggregation cost is bounded by the existing checksum index. |
| `backend/tests/unit/test_phase7_media_lifecycle.py` | No summary/filter tests | Add: counts by scope/type/mapping; large threshold; duplicate bytes; empty DB zeroes; summary equals list totals; view-only admin 200; employee/customer 401/403; filter defaults unchanged. | Summary endpoint | None (test-only). |
| `frontend/src/services/api/mediaApi.js` | No summary client; list client lacks type/assigned/unassigned/placement params | Add `apiGetMediaAssetSummary()`; extend `apiListMediaAssets` params and pass-through. Reuse `handleError`, admin scope. | Backend endpoint | Low; additive; existing callers unaffected. |
| `frontend/src/pages/admin/media/AdminMediaLibrary.jsx` | **Main defect**: stats + All Media from local store; dead controls; false copy; registry panel separate | Rewrite the page around two server reads (summary + list): server cards; merged Registered media panel; server search/tabs/pagination; loading/error/unauthorized/empty states; remove local hooks/actions/tabs/filters/bulk/chips/footer. Keep a product link for mapped assets. | API client + backend | Medium; large UI diff but no data mutation. Same component serves `/admin` and `/super-admin` (intended). |
| `frontend/src/components/admin/media/PlacementAssetPanel.jsx` | Functional but dominates the page; copy could be clearer | Keep logic; move below the library; make it collapsible/advanced; tighten title/copy (“hero/ and marketing/ placement art”). No API changes. | Page layout | Low. |
| `frontend/src/pages/admin/media/AdminMediaUpload.jsx` | Promises video; exposes a dead marketing scope; title says all media | Set `initialScope=PRODUCT`, `allowScopeChange={false}`; correct title/description (“Upload product media — images only”). | Shared `MediaUploadForm` props (already supported) | Low. |
| `frontend/src/components/media/MediaUploadForm.jsx` | Stale “no backend API yet” copy (`:377-378`) | Copy-only correction. Do **not** delete the shared marketing branch without a separate decision (employee/other callers). | None | Very low. |
| `frontend/src/config/adminNavigation.js` | Already labels the destination “Homepage Content” | No change; use this as the label source of truth. | — | None. |
| `frontend/src/pages/admin/media/AdminMarketingMedia.jsx` | Title is correct; reached via a mislabeled button | No change in this batch (optional future rename of page subtitle only). | — | None. |
| `frontend/tests/` (new `adminMediaRegistryTruth.test.js`, or extend `phase7ProductMedia.test.js`) | No coverage of stats/empty state | Add service tests: summary mapping; list params; static assertions that the page no longer imports `useMediaLibrary`/`useMediaMetrics` and does not contain the inactive-service copy. Add a pure view-model test proving loading/error renders `—`, not `0`. | API client | Low. |
| `docs/audit/*` | Stale references/claims | Update the new audit note and remove/replace `INTEGRATION_AUDIT.md` citations in source comments only if approved (copy-only). Do not rewrite unrelated docs. | Approval | Low. |

**Out of scope / do not touch in this fix:** `mediaStore`, `mediaRepository`, `useMedia`, `EmployeeMediaDashboard`, product pages, homepage content APIs, models, migrations, object storage, auth/RBAC backend, legacy product images. They are either correct or a separate workstream.

---

## 9. Phase D — Implementation sequence

### Batch 0 — Decisions (no code)
- Approve D1–D9 (§11).
- Freeze the card definitions and tab semantics.
- Confirm no DB migration is acceptable/needed (it is not).

### Batch 1 — Backend read-only summary + filters
- **Prerequisites:** Batch 0 definitions.
- **Files:** `schemas/media/media.py`, `services/media/homepage_content_service.py`, `api/v1/media.py`, `tests/unit/test_phase7_media_lifecycle.py`.
- **Dependencies:** none.
- **Expected result:** `GET /media/assets/summary` returns truthful counts under `media.view`; list accepts additive filters with unchanged defaults.
- **Regression risks:** shared filter helper used by the employee picker; mitigate with default-parameter tests and a picker regression test.
- **Rollback:** revert the commit; endpoint is additive, no data changes.

### Batch 2 — Frontend API client + cards
- **Prerequisites:** Batch 1.
- **Files:** `services/api/mediaApi.js`, `pages/admin/media/AdminMediaLibrary.jsx` (cards only).
- **Dependencies:** Batch 1.
- **Expected result:** 8 server-backed cards; loading/error/unauthorized show `—`/message, never 0; dead cards removed.
- **Regression risks:** page used at two routes; test both prefixes; ensure Super Admin and Admin both work.
- **Rollback:** revert; old page returns (still broken but no worse).

### Batch 3 — All Media consolidation
- **Prerequisites:** Batch 2.
- **Files:** `AdminMediaLibrary.jsx` (list/tabs/search/pagination), API client filters.
- **Dependencies:** Batch 2.
- **Expected result:** one Registered media panel; server search/tabs/pagination; no local register, bulk bar, dead filters/tabs/chips/footer; honest empty/no-match states.
- **Regression risks:** removal of `useMediaLibrary`/`useMediaMetrics` from this page must not affect other pages; they remain exported. Verify `RegisteredMediaPicker` and homepage flows are untouched.
- **Rollback:** revert; no server changes.

### Batch 4 — Header, upload, placement panel
- **Prerequisites:** Batch 3 (layout).
- **Files:** `AdminMediaLibrary.jsx` (header), `AdminMediaUpload.jsx`, `MediaUploadForm.jsx` (copy), `PlacementAssetPanel.jsx` (layout/copy).
- **Dependencies:** Batch 3.
- **Expected result:** “Upload Product Media” + “Homepage Content”; placement panel secondary; no dead marketing branch on the admin upload page; accurate copy.
- **Regression risks:** shared `MediaUploadForm` used by employee/product surfaces; change props only on the admin page, not the component’s defaults.
- **Rollback:** revert; functionality unchanged.

### Batch 5 — Tests, docs, cleanup
- **Prerequisites:** Batches 1–4.
- **Files:** frontend tests; source comments citing `INTEGRATION_AUDIT.md`; optional removal of dead `AdminMediaDetail`/`AdminMediaProductMapping` (separate commit only).
- **Dependencies:** all.
- **Expected result:** regression tests prove cards cannot silently be zero on success; stale citations removed; no dead routes/components in the media module (optional).
- **Regression risks:** static tests that assert old strings must be updated; do not delete dead components in the same commit as behaviour changes.
- **Rollback:** independent commits allow selective revert.

---

## 10. Phase E — Verification plan

### 10.1 Automated (must pass before release)

**Backend**
1. `GET /media/assets/summary` on an empty DB → all counts 0, no error.
2. Mixed fixture:
   - product-mapped assets (2 on one product, 1 on another),
   - product-scope unmapped asset (1),
   - placement asset (`hero/…`, scope marketing) (1),
   - `marketing/…` asset (1),
   - two keys with identical bytes (duplicates),
   - one asset above a low test threshold.
   Assert every summary field and equality with `GET /media/assets?pageSize=1` totals for each filter.
3. Permissions:
   - customer token → 401/403;
   - employee token → 403 on admin summary;
   - admin with `media.view` only → 200;
   - admin with no `media.view` → 403.
4. Filter defaults unchanged: `GET /media/assets` with no params returns the same shape/order/total as before; `RegisteredMediaPicker` calls still work.
5. Existing suites remain green (`test_phase7_media_lifecycle.py`, `test_phase6_media_db.py`, `test_marketing_media.py`).

**Frontend**
1. `apiGetMediaAssetSummary` maps snake/camel aliases correctly and returns `{ok:false,error,status}` on failure.
2. View-model/pure helper: loading → `—`; error → `—`; success with `total=10` → `10`; **never** renders `0` when the summary is not ready.
3. Static source assertions:
   - `AdminMediaLibrary.jsx` does not import `useMediaLibrary`/`useMediaMetrics`;
   - does not contain “backend media service is not active”;
   - does not contain `INTEGRATION_AUDIT.md`;
   - does not contain the dead tabs (`UNMAPPED`, `DUPLICATE`, `NEEDS_REVIEW`, `ORPHANED`, `ARCHIVED_PRODUCT`) or bulk bar strings.
4. List parameter tests: `type`, `assigned`, `unassigned`, `placement` are sent exactly; page resets to 1 on filter change.
5. Optional component render test with a mocked registry: 10 assets → 10 total, 4 product, 5 marketing, 9 images (or the fixture’s exact values); a 500 → error banner and no zero cards.
6. Run `npm test` and the existing suite; no new failures.

### 10.2 Manual browser checks (Super Admin and Admin)

- Compare the Total card with `GET /media/assets` `total`; reload page and second browser session → same counts.
- Open DevTools and throttle/block `/media/assets`:
  - loading shows `—`, not 0;
  - 500 shows error + Retry;
  - 403 shows an explicit permission message.
- Search by object key (`primary.avif`), product SKU (`PF-GEN-0002`), and a missing term; verify server results and no-match copy.
- Tabs: All, Images, Product, Marketing, Unassigned; verify counts match the corresponding cards (accounting for the partition definitions).
- Upload a small JPEG/AVIF to a product:
  - success → registry total increments after returning/reloading;
  - wrong extension/content → 422 message, no new row;
  - oversized file → rejected before upload.
- Placement panel: upload+register a hero image → appears in Registered media; register the same key again → “already registered”, no duplicate row; register `products/...` key → 422; register a missing key → 404.
- Role check:
  - Super Admin: all controls;
  - Admin with `media.view` but no `media.upload`: page visible, upload/register hidden or disabled, API 403 if forced;
  - Employee: cannot reach `/super-admin/media`; employee media page reflects its own permissions.
- Homepage compatibility: a newly registered `hero/` asset appears in the Homepage Content picker; saving a hero entry still works; storefront hero renders unchanged.
- Responsive: 390 px, 768 px, 1280 px; cards wrap, tabs scroll, table/grid remains usable.

### 10.3 Acceptance criteria

- No KPI card can render `0` unless the summary request succeeded and the server returned `0`.
- Total card equals `GET /media/assets` `total` in the same session.
- All Media renders registry records without any browser-local data.
- No visible text claims the media API is inactive or cites `INTEGRATION_AUDIT.md §7`.
- No dead tab/filter/bulk action remains on the page.
- Existing backend media tests, frontend tests, and homepage picker flows pass.

---

## 11. Phase F — Decisions requiring your approval

| ID | Decision | Recommendation | Trade-off |
|---|---|---|---|
| **D1** | Remove `Active`, `Unmapped`, `Needs review`, `Optimized` cards, or mark them “Not tracked”? | **Remove** from the page; keep a backlog note. | Removes four tiles from the current 12-card layout, but stops undefined zeros. “Not tracked” keeps the layout at the cost of visual noise. |
| **D2** | Does “Product Media” mean all `scope='product'` assets, or only those mapped to a product? | **Mapped only**; “Unassigned” is the unmapped subset. | Matches the hint “Assigned to products” and avoids double counting. Product-scope-but-unassigned assets appear under Unassigned. |
| **D3** | Does “Unassigned” mean product-scope unmapped, or any asset not referenced by a product/homepage slot? | **Product-scope with no product mapping** for now. Add “unused placement art” later if needed. | Simple, truthful, matches the registration model. The broader definition requires joins to marketing/homepage references. |
| **D4** | Keep “Duplicates” (checksum) or remove? | **Keep and rename “Same-byte copies”**, showing assets + groups. | Factual and useful for storage hygiene; but identical artwork intentionally reused across placements will be flagged. If that is noise, remove the card. |
| **D5** | Large-file threshold | **1,572,864 bytes (1.5 MB)**, documented in the endpoint and UI hint; expose an optional test/ops override. | Matches the current hint. A backend-config threshold would be more flexible but adds config surface. |
| **D6** | Header label for `/media/marketing` | **“Homepage Content”** (match nav and destination). | “Marketing Media” is familiar but inaccurate; the page is editorial/homepage control. |
| **D7** | Placement panel position | **Below the registered-media list, collapsible/advanced.** | Daily browsing gets priority; placement registration remains one click away. Keeping it on top preserves the current emphasis but buries inventory. |
| **D8** | Videos tab/card while upload is image-only | **Keep the card with a clear “not enabled” hint; keep the tab disabled/removed.** | Truthful 0 and future-ready; a disabled tab consumes space. Remove both if you prefer a leaner page. |
| **D9** | What happens to the browser-local register on this page? | **Remove it from the Super Admin page entirely.** Leave the store for other surfaces until a separate cleanup. | Eliminates the dual-inventory defect; employee dashboards still show a session view until their own decision. |
| **D10** | Add Delete to the registry list now? | **No, defer.** Use the product media manager for product art; deletion needs a confirm + reference-check UX. | Keeps this fix read-only. `apiDeleteMediaObject` exists for a later batch. |
| **D11** | `INTEGRATION_AUDIT.md` references | **Remove the UI citation and replace it with API-driven states**; restore the document separately only if the team wants it. | No false authority; slightly more copy work. |
| **D12** | Backend-only vs frontend-only stats | **Backend summary endpoint** (recommended). | One consistent request; supports large/duplicate counts. Frontend-only would need 6–8 filtered calls and still could not compute Large/Duplicates/Unassigned. |

---

## 12. Appendix — evidence and references

### 12.1 Key source references

- Page: `frontend/src/pages/admin/media/AdminMediaLibrary.jsx`
  - hooks: `:231-235`; durable panel `:107-226`; cards `:340-361`; All Media `:364`; tabs `:31-46,366-401`; filters `:405-474`; bulk bar `:458-491`; empty state `:572-577`; footer `:582-585`; header `:310-326`.
- Local source: `frontend/src/hooks/useMedia.js:46,99`; `frontend/src/services/media/mediaRepository.js:689`; `frontend/src/services/media/mediaStore.js:13,228,243,275,282`.
- API client: `frontend/src/services/api/mediaApi.js:231-266` (list), `:306-318` (placement register), `:321-334` (blocker/stubs).
- Placement UI: `frontend/src/components/admin/media/PlacementAssetPanel.jsx:16-19,38-66,71-89,96-150`.
- Upload UI: `frontend/src/pages/admin/media/AdminMediaUpload.jsx:14-19`; `frontend/src/components/media/MediaUploadForm.jsx:197-199,377-378`.
- Homepage page: `frontend/src/pages/admin/media/AdminMarketingMedia.jsx:74`; nav: `frontend/src/config/adminNavigation.js:75-82`.
- Backend: `backend/app/api/v1/media.py:161-233,799-934,942-1003,1005-1077`; model `backend/app/models/media/media_asset.py:34-70`; schema `backend/app/schemas/media/media.py:243-276`; placement service `backend/app/services/media/placement_asset_service.py:66-120`; validation `backend/app/services/media/media_validation.py:253+`; key rules `backend/app/storage/keys.py`.
- Review stub: `backend/app/api/v1/media_reviews.py:1-8`.
- Marketing API/model: `backend/app/api/v1/marketing_media.py`; `backend/app/models/media/marketing_media.py`.
- RBAC: `backend/app/core/rbac.py` (`SUPER_ADMIN` `permissions: ["*"]`; `ADMIN` includes `media.view/upload/assign/delete`).

### 12.2 Tests run in this investigation

```
cd backend
python -m pytest tests/unit/test_phase7_media_lifecycle.py -q
# 95 passed

python -m pytest tests/unit/test_marketing_media.py tests/unit/test_phase6_media_db.py -q
# 28 passed

cd ../frontend
node --import ./scripts/node-loader/register.mjs --test tests/phase7ProductMedia.test.js
# 30 passed
```

These use ephemeral SQLite fixtures and temp storage; the application database was not touched. No uploads/registrations were performed against the user's environment.

### 12.3 Read-only metric probe

```
node --import ./scripts/node-loader/register.mjs --input-type=module -e "
  import repo from './src/services/media/mediaRepository.js';
  import store from './src/services/media/mediaStore.js';
  console.log(store.readMedia().length, JSON.stringify(repo.getMediaMetrics()));"
# 0 {"total":0,"images":0,...,"large":0,"optimized":0,...}
```

### 12.4 Docs status

- `INTEGRATION_AUDIT.md` — **absent** (working tree and git history).
- `docs/audit/homepage-admin-verification.md` — closest current record of the two-source defect (B-16) and the public-object risk; partly stale on placement retirement.
- `docs/full-stack-integration-audit.md` — stale on marketing tables and the `GET /media/assets` permission.
- `docs/admin-complete-audit.md` — stale on registry pagination and delete behaviour; correctly flags the dual media system (F-A12).
- `docs/audit/homepage-admin-audit.md` — still useful on the registry boundary between legacy product images and registered media.

---

**Stop point:** no fixes have been implemented. Awaiting approval of Phase B definitions (especially D1–D4) and Phase C before touching any file.

---

## 13. Resolution log

Appended 2026-10-22. **Additive only.** §1–§12 and the closing stop point above are unchanged; they record the audit as it was written. This section records what the remediation did to each finding, and is deliberately narrower than a victory lap: every status below was re-derived from the code at the time of writing (owner decision Q6), not carried over from a batch report.

**Batch reference convention.** No batch was committed; the branch carries a single merge commit (`50ad50b`) and all batch work is an uncommitted working-tree change. References below therefore read **"Batch N — uncommitted working-tree change @ `50ad50b`"**. No per-batch commit hash is invented.

**Status vocabulary.**

| Status | Meaning |
|---|---|
| **Resolved** | The behaviour the finding describes no longer exists in the code, and that absence is backed by at least one of: a source assertion, a passing unit test, or a removed code path. |
| **Partially resolved** | The actionable part is fixed; a named residual remains — typically one that needs a running backend, a database, or a browser to close. |
| **Open** | The condition is unchanged. Either it was explicitly out of scope, or it is a pre-existing design issue reported for a separate decision. |
| **Deferred** | A decision was taken **not** to change it, and that decision is recorded with its rationale. Deferred is not a euphemism for forgotten. |

### 13.1 Findings A-01 … A-17

| ID | Status | Evidence (re-verified against code) | Residual / note |
|---|---|---|---|
| **A-01** | **Resolved** | The library no longer computes statistics from a browser-local register. `AdminMediaLibrary.jsx` obtains `summaryState` from `useMediaSummary` (`:53`) and `RegisteredMediaPanel` (`:7`) renders it; the page and panel import no `mediaStore`, `mediaRepository`, `useMediaLibrary` or storage API, and neither fetches the list itself (asserted in `frontend/test/adminMediaRegistry.test.js`). Cards are built by `buildMediaCardModels` from the server payload. | Live card values with real data are unmeasured (no database). |
| **A-02** | **Resolved** | The single "All Media" register is gone; the registry is the server page (`fetchMediaAssetPage` → `/media/assets`), and `useMediaRegistry` holds paging state only. Same isolation assertions as A-01. | — |
| **A-03** | **Resolved** | No media surface claims the backend is inactive or cites `INTEGRATION_AUDIT`. Removal asserted across the page, the panel and the view-model. `INTEGRATION_AUDIT.md` is still absent from the repository, but nothing references it from the media UI. | — |
| **A-04** | **Resolved** | The four undefined cards (`Active`, `Unmapped`, `Needs review`, `Optimized`) are absent; the eight cards are exactly the server-defined ones, asserted by id and order. Their labels/copy are asserted free of the undefined vocabulary. | — |
| **A-05** | **Partially resolved** | `Large files` and `Same-byte copies` are now server-derived: `LARGE_MEDIA_FILE_BYTES = 1_572_864` (declared once in `media.py` and returned in the payload), threshold/checksum-group logic in the summary query, and the fields surfaced by `MediaAssetSummaryResponse`. Fixture assertions prove the mapping. | The **actual counts** need a database and a live endpoint; no real value has been observed. |
| **A-06** | **Resolved** | 401/403 no longer renders as nothing. `AdminMediaLibrary.jsx:83` and `RegisteredMediaPanel.jsx:137` have explicit `unauthorized` branches; loading/error/`—` states exist and are asserted for `loading`, `error`, `unauthorized` and `undefined`. | Denied-state *rendering* in a browser is unverified. |
| **A-07** | **Resolved** | No bulk Activate/Archive/Remove control remains in the page or panel; the memory-only `useMediaActions` path is no longer reachable from the media library. Asserted by absence. | — |
| **A-08** | **Resolved** | The marketing dead end and the false "no backend API yet" copy are gone; the upload surface no longer promises a scope it cannot deliver. Asserted by absence of the phrase and by the single primary upload path. | — |
| **A-09** | **Resolved** | The five tabs and three dropdowns driven by non-existent model fields (`mappingStatus`, `duplicateStatus`, `usageRoles`, `categoryId`) are gone from the live page/services; the remaining six tabs each map to a real server parameter (asserted per-tab against the emitted URL). The dead components that still reference those fields are A-12. | — |
| **A-10** | **Resolved** | `mediaAccess.js` no longer returns a blanket grant for any admin session: each capability is `hasAdminPermission(admin, MEDIA_PERMISSIONS.…)`, and a session with no `media.*` code gets no media abilities. `frontend/test/mediaAccessPermissions.test.js` exercises the matrix (19 tests). | `media.assign` has no server-side gate — carried concern, separate decision. |
| **A-11** | **Resolved** | Only one inventory and one total remain on the page: `DurableAssetsPanel` no longer exists anywhere in `src/` (grep: no references), and the panel renders the server page it is given. | — |
| **A-12** | **Deferred** | `AdminMediaDetail.jsx` and `AdminMediaProductMapping.jsx` are still present and their routes still redirect (`App.jsx`). They are unreachable from the UI and reference fields no model has. | Deliberate: deleting components is outside this remediation's approved scope. They remain a re-use hazard. |
| **A-13** | **Open** | Confirmed in code, unchanged. `GET /media/objects/{object_key}` (`media.py:486-531`) validates the key (`_safe_key`), reads metadata, and streams the bytes. The handler contains **no product-status, publication or scope check** — verified by reading the whole handler, not a fragment. | Pre-existing, security-relevant, explicitly not a Media-page defect; needs its own decision. Not fixed by this work. |
| **A-14** | **Deferred** | Confirmed unchanged: `_register_product_asset` (`media.py:167+`) still accepts any key that passes `_safe_key` and writes `scope='product'`; no `products/` prefix requirement was added. | **Decision R4** is explicit: declared `scope` is authoritative, namespace disagreements are *reported*, never blocked or mutated. The code implements that: `_PRODUCT_KEY_PREFIX`, `_MARKETING_KEY_PREFIXES` and a read-only `namespaceClassification {matches, mismatches, undetermined}` diagnostic. Enforcing the prefix would be a policy change, not a fix. |
| **A-15** | **Open** | Confirmed unchanged: the `row is None` branch creates the row from stored-object metadata; an existing row is returned as-is and its MIME/size/checksum are not re-read. | Pre-existing, low severity; scenario still unverified. |
| **A-16** | **Resolved** | The gap was "no page test; the suite passes while the page is broken". `frontend/test/adminMediaRegistry.test.js` now covers the page and panel: summary wiring, `—` versus real `0`, the six server-backed tabs, absence of local inventory, and absence of the false integration copy. 18 tests, all passing, picked up by the `npm test` glob. | Still static + unit: it cannot catch a rendering failure that only a browser shows. |
| **A-17** | **Partially resolved** | The causal half is fixed — the UI no longer cites `INTEGRATION_AUDIT.md` and no longer asserts a stale backend state. | The historical audit documents themselves (`docs/full-stack-integration-audit.md`, `docs/admin-complete-audit.md`) still contain outdated statements. Append-only authorisation (Q2) forbids rewriting them, so the correct action was to supersede, not edit. |

### 13.2 Risks S-01 … S-09

| ID | Status | Evidence | Residual |
|---|---|---|---|
| **S-01** | **Resolved** | The null-returning panel is gone (no `DurableAssetsPanel` in `src/`) and every state is now explicit: `unauthorized`, `error`, `loading`, ready. Not-ready cards render `—`, never `0`. | Browser rendering unverified. |
| **S-02** | **Resolved** | Same change as A-10: UI rights are resolved from the session's own grants, so a restricted admin is not shown upload/register controls it lacks. | `MediaUploadForm.jsx:48` still carries a `canManageMarketing=true` admin bypass (reported, not fixed). |
| **S-03** | **Deferred** | Same condition as A-14, same R4 rationale: reported in `namespaceClassification`, not blocked. | Reclassification of any real mismatched rows is a separate data task. |
| **S-04** | **Open** | Same finding as A-13, same evidence: no product-status check on the public object route. | Pre-existing; needs a storage-visibility decision. |
| **S-05** | **Resolved** | The memory-only bulk actions are no longer reachable; nothing in the media library presents a durable-looking action that only mutates browser state. | — |
| **S-06** | **Open** | Same finding as A-15: existing keys are not re-verified against stored bytes. | Low; unchanged by design (idempotency was the priority). |
| **S-07** | **Open** | `PlacementAssetPanel.jsx:53-55` still handles upload-succeeded/registration-failed by surfacing the object key for manual retry, with no automatic cleanup. | No data loss; `GET /media/audit/orphans` exists for reporting. Unchanged. |
| **S-08** | **Partially resolved** | The stale-documentation chain that *drove the UI copy* is broken — see A-17. Two replacement documents (the revised plan and this audit) now exist and are current. | Older docs remain stale by design (append-only). |
| **S-09** | **Resolved** | The page now renders an explicit denied state from the API response (`AdminMediaLibrary.jsx:83-90`, "Media statistics are unavailable for this session…"), which is what the risk asked for. | The route in `App.jsx:167` still has no client-side permission guard — intentional: the backend is authoritative and the UI must not pretend to gate it. |

### 13.3 What is *not* claimed

- No finding marked **Resolved** was closed on static inspection alone where its subject was runtime behaviour: A-06's and S-09's rendering claims rest on source plus unit tests, and their *runtime* half is listed as residual, not as verified.
- **A-13/S-04 and A-15/S-06 are Open, not fixed.** Both are pre-existing and were reported, not repaired.
- **A-14/S-03 and A-12 are Deferred, not done.** Each names the decision that defers it.
- No backend endpoint was executed in this environment, no bundle was built, and no browser rendered the page. The 17-row browser matrix remains **outstanding, not waived**.

---

## 14. Batch 9 resolution update — consolidated security & integrity

Appended 2026-10-22. **Additive.** §13 stands as written; this section supersedes only the rows named below, and each supersession is justified by code plus executable evidence.

**Batch reference.** *Batch 9 — uncommitted working-tree change @ `50ad50b`.* Six code/test files (three modified, three new), plus this section and §16 of the plan. Verified by diffing the tree against a pristine `50ad50b` worktree with the pre-batch patch applied — exactly six paths differ, and no other file in the repository moved.

### 14.1 Findings revisited

| ID | §13 status | Batch 9 status | Evidence | Why it changed |
|---|---|---|---|---|
| **A-15 / S-06** | Open | **Resolved** | `app/services/media/media_integrity.py` (new, pure); guards wired into `_register_product_asset` (`media.py`) and `register_placement_asset` (`placement_asset_service.py`); `tests/unit/test_media_integrity_guards.py` — **15 tests executed, 15 pass** via `python3 -m unittest`. | Both registration paths now compare the stored object's SHA-256 against the row's snapshot before any idempotent reuse, and raise a 409 with nothing mutated on disagreement. The rule is unit-tested directly (no DB needed) and the wiring is pinned by `frontend/test/mediaSecurityContracts.test.js`. |
| **S-07** | Open | **Partially resolved** | `should_compensate()` (new) makes ownership explicit; `_compensate_failed_registration` now delegates to it. Both upload-and-register routes already compensated (`media.py:793`, `:1482`); the ownership rule is asserted by unit tests. | Compensation exists on every path that creates an object *and* writes registry rows in one request. The generic `POST /media/objects` route writes no database row **by design** — it is the first half of a deliberate two-step flow — so the frontend still exposes the key for an explicit retry. **Unresolved by design:** an object whose registration is abandoned in that two-step flow stays in storage until an operator acts. Auto-deleting it would risk removing an object another record may already reference. |
| **A-13 / S-04** | Open | **Open** (contract now documented and tested) | `media.py` `get_media_object` read in full: no auth dependency, no permission call, no product-status lookup. Storefront URLs are built from the same key (`explore_service.py`, `marketing_media_service.py`); existing lifecycle tests serve those URLs publicly. | The visibility contract is established and **public storage is load-bearing**: product art, hero slides and marketing placements are all delivered through this unauthenticated route, and content-addressed keys are cached immutably for a year. There is **no private object class** in this system — no namespace, model field or caller distinguishes "unpublished" media. Gating on product status would be an API-breaking change (it would 404 images already embedded in storefront pages, carts, order history and CDN caches), so it was **not** applied. Approval is required before any such change. |
| **A-10 / S-02** | Resolved | **Resolved** (residual closed) | `MediaUploadForm.jsx`: the marketing destination now derives from `actions.access.canManageMarketing` (the resolved grant set) instead of `admin ? true`. | The last session-type grant in the media UI is gone. Built-in ADMIN is unchanged — it holds `media.upload`, which expands to `media.manage` — while a custom-permission admin with no media code no longer sees a destination it cannot use. |

### 14.2 Carried concerns from §13.3, re-checked

- **"`media.assign` has no server-side gate" — not reproducible as a defect.** It is enforced at `app/api/v1/marketing_media.py:121` (update) and `:152` (reorder), and on every homepage hero write via `hero_access(actor, db, "media.assign", write=True)` (`homepage.py:129,155`). Product-media registration uses `media.upload` by the established contract; adding an `media.assign` gate there would have denied FASHION_STYLIST and STORE_MANAGER accounts that hold `media.upload` — a permission-policy change, not a fix. **No server permission check was added or removed.**
- **"UI stricter than the API for `media.edit`" — not a live mismatch.** No server route requires `media.edit`; it exists only as a legacy code implied by the `media.manage` capability. Its only UI consumers are `AdminMediaDetail.jsx` (an unreachable component — A-12), so no live control depends on it. Left unchanged rather than inventing a policy.
- **`MediaUploadForm.jsx:48` admin bypass — closed** (see A-10 above).

### 14.3 What Batch 9 does *not* claim

- **No backend route was executed.** `python3 -m pytest` → `No module named pytest`; `import fastapi` → `ModuleNotFoundError`. The 409 path is proven at the decision-function level and by static wiring, **not** by an HTTP round-trip.
- **No bundle was built.** `npm run build` → `sh: 1: vite: not found`. `esbuild` parsed the edited JSX successfully, which is syntax validation only.
- **No browser verification.** The 17-row matrix remains outstanding and is **not waived**.
- Findings **not** touched by this batch keep their §13 status unchanged: A-01…A-09, A-11, A-12 (Deferred), A-14/S-03 (Deferred), A-16, A-17, S-01, S-03, S-05, S-08, S-09.

---

## 15. A-13 / S-04 — deployment and CDN verification (read-only)

Appended 2026-10-22. **Additive; no code changed.** This section answers one question and refuses to answer a second:

> *Is media served exclusively by the application, or can objects be fetched from a CDN or public storage origin?* — **Answered for the code. Not answerable for the deployment from this environment.**

There are no separate per-batch commits. The reference is: *Batch 10 (documentation only) — uncommitted working-tree change @ `50ad50b`.*

### 15.1 Finding status

**A-13 / S-04: OPEN.**

| Aspect | Status |
|---|---|
| Code-level visibility weakness | **Confirmed.** The public object route performs no ownership, publication or scope check; its handler takes no database session. |
| Actual production exposure | **UNVERIFIED.** Production configuration could not be observed from this environment. |
| Accepted as permanent | **No.** Option 1 (leave the route unchanged) is a **temporary** acceptance only. |

The route reads, in full, at `backend/app/api/v1/media.py:496-540` (`GET`), `:543-561` (`HEAD`), `:563-581` (`metadata`). The signature is `async def get_media_object(object_key: str, request: Request)` (`:501`) — there is no `db` dependency, so the handler structurally cannot consult a product row even if asked to.

### 15.2 The decisive discovery: production mandates a CDN that bypasses FastAPI

This is the finding that changes the remediation calculus. It is enforced in code, not merely documented.

| Mechanism | Location | Effect |
|---|---|---|
| `PROD_MISSING_CDN` | `backend/app/storage/environment.py:141-151` | Under `APP_ENV=production`, an empty `MEDIA_CDN_BASE_URL` is a **level `error`** issue: *"Without it every product image is served by the API process instead of CloudFront."* |
| `PROD_INSECURE_CDN` | `:152-159` | A non-`https://` origin is likewise an **error**. |
| `PROD_LOCAL_STORAGE` | `:130-139` | Production additionally refuses `STORAGE_PROVIDER != s3`. |
| Fatal escalation | `:255-275` | `fatal_issues()` selects every `level == "error"`; `enforce_storage_environment()` **raises**. |
| Startup enforcement | `backend/app/main.py:104-116` | Called from the lifespan before the process serves any request. |
| Defence in depth | `:316-321` | Both CDN codes are in `FACTORY_BLOCKING_CODES`, so a lazily-built provider is refused too. |

**Consequence: a valid production deployment cannot run on local storage, and cannot serve media without a CDN origin.** The two states are mutually exclusive — either the deployment is production-shaped (CDN mandatory) or it is development-shaped (local disk, no CDN).

### 15.3 URL generation routes traffic away from the application

`backend/app/storage/urls.py:71-82` — `build_media_url()` returns `{MEDIA_CDN_BASE_URL}/{key}` when a CDN origin is configured, and `{prefix}/{key}` otherwise.

Producers, all of which emit CDN URLs in production: `explore_service.py:429`, `homepage_content_service.py:147`, `marketing_media_service.py:92`, `media_service.py:161-163`, `product_media_records.py:34`, `media_reference_audit.py:63,304,314`.

The frontend mirrors the same shape in `frontend/src/services/media/mediaPaths.js:141-168`, and its own comment (`:150-157`) states the consequence: the CDN path is *"the object key itself, **not the API route**"*, and the earlier `{origin}{MEDIA_URL_PREFIX}/{key}` form was only correct when the CDN proxied the backend.

### 15.4 Three serving paths and what each bypasses

| Path | Active when | Reaches FastAPI? | Notes |
|---|---|---|---|
| **A** — `/{api}/media/objects/{key}` | `STORAGE_PROVIDER=local` (**development only**) | **Yes** | The only path where application code decides anything. |
| **B** — `https://cdn…/{key}` → CloudFront → S3 (OAC) | **Production (mandatory)** | **No** | The CDN maps the URL path onto the bucket key at its root; no Python process is involved. |
| **C** — direct S3 origin | Only if the bucket is public | **No** | Bypasses every application control permanently, and would survive any future route fix. |

### 15.5 What R-A would and would not do

**R-A** = add a product-status check to `GET`, `HEAD` and the metadata route.

| Path | R-A effectiveness |
|---|---|
| **A** | **Effective.** The request reaches the handler; a 404 could be returned for unpublished owning products. |
| **B** | **Ineffective.** The request never reaches the handler. CloudFront serves the bytes from S3 via OAC regardless of any application logic. |
| **C** | **Ineffective.** No application code participates at all. |

**R-A is ineffective for a direct-to-S3-origin CDN path, and can only ever be defence-in-depth for requests actually routed through FastAPI.** It must therefore **not** be presented as closing A-13/S-04, and in a mandatory-CDN production deployment its practical effect is limited to the development path.

### 15.6 Exposure that survives R-A

- **Unpublished art is written into the served namespace by design.** Employees are *confined* to `DRAFT` / `PENDING_REVIEW` (`backend/app/api/v1/media.py:305`, `:1467`, `:1527`); admin uploads have no status gate at all (`:768-772` checks existence only; `_require_writable_product` at `:295-300` raises only on a missing product).
- **Keys are deterministic and guessable** — `products/{PRODUCT_ID}/{filename}` (`media_service.py:92-122`, `keys.py:sanitize_filename`).
- **`object-meta` is an unauthenticated existence oracle** (`media.py:563-581`).
- All five namespaces are served, including `uploads/` and `collections/`, which have **no writer** today (`grep` for `NAMESPACE_UPLOADS|NAMESPACE_COLLECTIONS` outside `storage/` returns nothing) but are not excluded.

### 15.7 Cache: an application-level 404 revokes nothing

`backend/app/storage/urls.py:43,45` — content-addressed keys carry `public, max-age=31536000, immutable`; mutable keys `public, max-age=3600, must-revalidate`. These are written onto the object at `backend/app/storage/s3.py:234-235`, so CloudFront and browsers honour them.

There is **no CloudFront invalidation anywhere in the codebase**. `grep` for invalidation returns only the in-process projection cache (`media.py:277-278`, `:1415-1425`) and `core/cache.py`. `unpublish_product` (`product_service.py:2332-2344`) flips status and clears only `invalidate_product_cache` — **no edge purge**.

Consequence: an object cached while public remains fetchable for up to one year (content-addressed) regardless of any later application-level decision.

### 15.8 Repository configuration vs actual configuration

Documented intent (`docs/PRODUCT_MEDIA_S3_CDN_IMPLEMENTATION_PLAN.md`): Block Public Access **ON (all four)** and bucket-owner-enforced (`:256-257`), HTTPS-only via `aws:SecureTransport` denial (`:261`), CloudFront OAC as the only reader (`:397`), private/versioned/SSE bucket with an OAC policy scoped by `AWS:SourceArn` (`:634-636`).

Documented reality: bucket policy, IAM, CloudFront and lifecycle are marked **[EXTERNAL]** (`:933`); *"AWS resources are not provisioned… Nothing in this branch provisions them"* and *"Staging verification has not been performed"* (`:944-952`). `docs/PRODUCT_MEDIA_S3_CDN_SECURITY_REVIEW.md:472-478` records *"Verified against real AWS — **nothing**"*.

Code-side, `backend/app/storage/s3.py:225-239` sets `Bucket`, `Key`, `Body`, `ContentType`, `Metadata` (SHA-256), `ChecksumAlgorithm=SHA256`, SSE and `CacheControl` — and passes **no `ACL` argument anywhere** in the file. Objects are therefore private unless the bucket itself is public.

**Verified repository configuration is not evidence of actual production configuration.** The repository documents a private bucket; it neither provisions nor proves one.

### 15.9 What this environment can and cannot observe

| Check | Result |
|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_PROFILE` | **unset** (presence checked; no values read) |
| `APP_ENV`, `STORAGE_PROVIDER`, `MEDIA_CDN_BASE_URL`, `DATABASE_URL` | **unset** |
| `aws` CLI | **absent** |
| DNS for `cdn.pratikshyafashion.com` | **does not resolve** from this sandbox |
| Committed `.env` | **none exists** — only `.env.example` (no secrets printed) |
| Deployment manifests | `backend/Dockerfile`, `backend/docker-compose.yml`, `backend/.env.example`, `frontend/.env.example` — **no IaC, no CI workflow, no reverse-proxy config** |
| Production key probing | **not attempted** — no object key was requested from any origin |

No production key was probed and no configuration was modified.

### 15.10 Required evidence (non-secret) and open questions

The operator must supply the following. Each is non-secret; none requires a credential, an ARN or a distribution id.

1. Output of `GET /api/v1/media/storage/status` — expected `provider` and `cdnConfigured` (the endpoint already redacts the bucket; intended check recorded at plan `:740-741`).
2. Output of `GET /api/v1/media/storage/readiness` (admin) — **issue codes only**.
3. The startup log line `Storage configuration validated (provider=…, cdn=…)` (`backend/app/main.py:117-121`).
4. One-line confirmation: *"S3 Block Public Access is ON for all four settings, and the bucket policy grants only the CloudFront service principal."*
5. One-line confirmation: *"The CloudFront default behaviour forwards `/{key}` to the S3 origin."*

Open questions these resolve:

- **Is production deployed at all?** The plan states in 2026 that it is not (`:944-952`). If so, the exposure is **latent**.
- **Which path is live — B, C, or neither?** This single fact decides whether R-A has any practical effect.
- **Is the bucket private in practice** (BPA + OAC + scoped policy), or reachable directly (Path C)?
- **Does the CDN front the bucket at its root, or proxy the API?** Only the latter would route media through application code.
- **Are any objects already cached** at the edge from a period when they were public?

### 15.11 Proposals — recorded, NOT implemented, NOT approved

None of these is implemented, and **none is claimed to close A-13/S-04**. Each requires separate approval.

| Ref | Proposal | Scope | Caveat |
|---|---|---|---|
| **R0** | Record the finding as CDN-layer exposure, unverified deployment; request the five evidence items (§15.10). | Zero code. **This section is R0's documentation half.** | Does not reduce exposure; it establishes whether exposure exists. |
| **R1** | Separate published from unpublished objects by prefix, with promotion on publish — draft art written under a prefix the distribution does not expose. | Write path + publish transition. | Must handle promotion idempotency and the `namespaceClassification` diagnostic. Published URLs unchanged. |
| **R2** | CloudFront signed URLs, or an edge function authorising by product status. | URL production for every producer. | Invalidates public caching on signed paths; larger blast radius. |
| **R3** | Confirm BPA + OAC, and assert at startup/readiness that the configured bucket is private. | Deployment + one readiness check. | Closes Path C only — the one branch that is unrecoverable. |

**Ordering constraint for R1/R2/R3:** because no purge mechanism exists, any of them must be in place *before* unpublished art is written to the served namespace — or the existing backlog must be handled by explicit invalidation, which is a new capability needing its own approval.

### 15.12 Status of §13 / §14 rows after this verification

| ID | Status | Note |
|---|---|---|
| **A-13 / S-04** | **OPEN** | Code weakness confirmed; production exposure unverified; Option 1 temporary only. §14's "contract now documented and tested" stands, but the risk is **not** resolved and R-A is **not** a fix. |
| Everything else | **unchanged** | No status in §13 or §14 is altered by this section. |

**Evidence classes.** Static inspection: performed. Unit tests: **not run for this section** — it adds no code, and this environment cannot import FastAPI. Backend runtime: **BLOCKED / NOT RUN** (`No module named pytest`; `import fastapi` → `ModuleNotFoundError`). Production build: **BLOCKED** (`vite: not found`). Browser: **NOT PERFORMED** — the 17-row matrix remains outstanding and is **not waived**.

**This section claims nothing about production behaviour.** It reports what the code enforces and what the repository documents, and marks the deployed reality as unknown.
