# PRATIKSHYA FASHION — Super Admin → Media → Upload Product Media
## Investigation & Audit Report

**Route audited:** `/super-admin/media/upload` (the same page component also serves `/admin/media/upload`)
**Repository:** `AJBiswojit/pfv1` @ `f13199d` (branch `arena/dd367471-pfv1`)
**Date:** 2026-10-22
**Scope:** Investigation only. **No source file was modified**, no media was uploaded or deleted, no product record was touched, and no storage configuration was changed.

---

## 0. Evidence base, method and limitations

### 0.1 What was inspected

| Area | Files read |
|---|---|
| Page | `frontend/src/pages/admin/media/AdminMediaUpload.jsx`, `frontend/src/App.jsx` (routes 165–175, 254–263) |
| Form / UI | `frontend/src/components/media/MediaUploadForm.jsx`, `MediaUploadDropzone.jsx`, `MediaUploadQueue.jsx`, `MediaProductSelector.jsx`, `MediaPlacementSelector.jsx`, `MediaUploadPanel.jsx` |
| Client services | `frontend/src/services/media/productMediaService.js`, `frontend/src/services/api/mediaApi.js`, `frontend/src/services/api/apiClient.js`, `frontend/src/services/api/productsApi.js` |
| Validation / vocabulary | `frontend/src/config/mediaTypes.js`, `frontend/src/services/media/uploadValidation.js` |
| Catalogue cache | `frontend/src/services/catalogRepository.js`, `frontend/src/hooks/useProducts.js`, `frontend/src/layouts/AdminLayout.jsx` |
| Backend routes | `backend/app/api/v1/media.py` (upload 724–808, register 816–882, media-set 589–650, employee lanes 1446–1580), `backend/app/api/v1/media_reviews.py` |
| Backend services | `backend/app/services/media/media_service.py`, `upload_service.py`, `media_validation.py`, `product_media_records.py`, `backend/app/services/catalog/product_service.py`, `backend/app/storage/keys.py` |
| Schema | `backend/app/models/media/media_asset.py`, `product_media.py`, `backend/app/schemas/media/media.py` |
| Config | `backend/app/config.py`, `frontend/src/index.css` (Atelier theme tokens) |
| Existing tests | `frontend/tests/phase7ProductMedia.test.js`, `frontend/test/mediaAccessPermissions.test.js`, `adminMediaRegistry.test.js`, `mediaSecurityContracts.test.js`, `mediaTerminology.test.js`, `frontend/tests/phase6MediaStorage.test.js`, `marketingAvifUpload.test.js`, `backend/tests/unit/test_phase7_media_lifecycle.py` |

### 0.2 Diagnostics actually executed (safe, read-only)

```text
node --test tests/phase7ProductMedia.test.js                                  → 30 pass / 0 fail
node --test test/mediaAccessPermissions.test.js test/adminMediaRegistry.test.js → 37 pass / 0 fail
node --test tests/phase6MediaStorage.test.js tests/marketingAvifUpload.test.js
            test/mediaTerminology.test.js test/mediaRegistryView.test.js     → 81 pass / 0 fail
```

No destructive call was made: no `POST /media/…`, no `DELETE`, no product PATCH, no migration.

### 0.3 Evidence that could NOT be obtained (stated, not guessed)

1. **Backend test suite was not executed.** This sandbox has no Python environment for the backend (`fastapi` is not installed, no `.venv`, `pip` present but the 95-line requirements set was not installed). Backend behaviour below is established by reading the code, not by running it.
2. **No live end-to-end upload was performed** (explicitly forbidden by the brief). Therefore "the pipeline works end-to-end in this deployment" is **not** asserted anywhere in this report.
3. **Storefront rendering of the post-upload product DTO** was traced to the API projection (`product_service.py`) and the storefront mapper (`catalogStore.js`), but the customer PDP's final gallery assembly was not executed in a browser.
4. Timing races (MEDIA-UPLOAD-005) are reasoned from code; the *outcome* depends on network/import timing and is marked accordingly.

---

## Section 1 — Actual Business Purpose

### 1.1 Why the page exists

The page is the **single-purpose intake desk for new product photography**. It joins three existing systems that already exist in the codebase:

1. the **object store** (`app/storage`, `local` or `s3`, configured server-side),
2. the **durable media registry** (`media_media_asset` rows, one per verified object),
3. the **product ↔ media association** table (`media_product_media` — ordered, with `role`, `sort_order`, `is_primary`).

It is *not* a general media library (that is `/super-admin/media`, `AdminMediaLibrary.jsx`), and it is *not* the product media manager (that is `/super-admin/products/:productId/media`, `ProductMediaManager.jsx`). Its job is: **take files from a Super Admin's machine, put them in storage, register them durably, and attach them to one chosen product — with statuses that come from the server, not from the browser.**

### 1.2 Who uses it

| User | How they reach it | Gate |
|---|---|---|
| SUPER_ADMIN | `/super-admin/media/upload` (sidebar → Media → Upload) | `SuperAdminProtectedRoute` (`App.jsx:234–259`) |
| ADMIN (role-limited) | `/admin/media/upload` (same component) | `AdminProtectedRoute` |
| Employee | `/employee/media/upload` — **uses the same `MediaUploadForm`** | `media.upload` grant + server-side write scope |

The employee reuse matters: a defect in the shared form is not confined to the Super Admin page (see MEDIA-UPLOAD-002).

### 1.3 What data it manages

* **Object** — bytes under `products/{PRODUCT_ID}/{sanitised-filename}` (`storage/keys.py:175–180`).
* **Asset row** — `media_media_asset`: key, provider, mime (sniffed), size, SHA-256, width/height, title, alt_text, caption, status, scope, uploader.
* **Association row** — `media_product_media`: `role`, `sort_order`, `is_primary`, `assigned_by`, unique on `(product_id, media_id)`.

### 1.4 Expected successful workflow (as implemented)

```text
Super Admin UI (/super-admin/media/upload)
  └─ MediaUploadForm  (product scope, scope switch disabled)
       ├─ Product selection   → catalogRepository cache (client-side only)
       ├─ File selection      → validateFile() (extension/MIME + 10 MB)
       └─ Submit
            POST /media/products/{id}/objects        (multipart, bearer admin token)
              → content sniff → 10 MB ceiling → dimension guard
              → object written to storage
              → MediaAsset + ProductMedia rows created ATOMICALLY (auto-register)
            POST /media/register                     (multipart by object_key)
              → verifies object exists, upserts asset, updates role/order/primary
            GET  /media/products/{id}/media-set      (authoritative read, staff token)
            GET  /admin/products/{id}                (server DTO refresh, admin only)
  └─ success view (counts + media ids) → "View Media" → /super-admin/media
```

### 1.5 Answers to the "is it intended to…" checklist

| Intended behaviour | Verdict | Evidence |
|---|---|---|
| Select an existing product by name or SKU | **Yes, but weakly** — client-side substring search over an in-memory cache | `MediaProductSelector.jsx:19–50` |
| Select one or many image files | Yes | `MediaUploadDropzone.jsx:73–83`, `MediaUploadForm.jsx:95–134` |
| Upload to configured object storage | Yes | `mediaApi.js:132–151`, `media.py:724–808` |
| Register as durable media assets | Yes | `media.py:796–805`, `_register_product_asset` 172–258 |
| Associate each asset with the selected product | Yes | `media.py:229–258`, unique `(product_id, media_id)` |
| Return reliable upload/registration status | **Partly** — statuses are server-derived, but two are misleading (001/003) and one is fake (009) | see Bug Register |
| Make images available to catalogue/storefront under the publishing rules | **Yes, and more than the page admits** — registration changes the customer-facing `image`/`additionalImages` immediately, without publishing anything | `product_service.py:668–672, 777–781` |

---

## Section 2 — Current Implementation

### 2.1 File map and responsibilities

| File | Responsibility |
|---|---|
| `frontend/src/pages/admin/media/AdminMediaUpload.jsx` | Page chrome: `AdminPage` (eyebrow/title/description + Back button) wrapping `AdminPanel` + `MediaUploadForm` with `initialScope=PRODUCT`, `allowScopeChange=false`, `onSuccessRedirect=/super-admin/media`. 37 lines, no data logic. |
| `frontend/src/components/media/MediaUploadForm.jsx` | The whole workflow: queue state, validation, submit orchestration, progress, success view, errors. 633 lines. |
| `…/MediaProductSelector.jsx` | Product search + selection card. Reads `catalogRepository.all()` once. |
| `…/MediaUploadDropzone.jsx` | Drag/drop + hidden file input + rules copy. Re-exports `validateFile`, `titleFromFileName`. |
| `…/MediaUploadQueue.jsx` | Per-file card: preview, size, stage chip, title/alt/role/caption inputs, remove. |
| `frontend/src/services/media/productMediaService.js` | The orchestration layer: `uploadAndRegisterProductImage(s)`, `getRegisteredProductMedia`, `syncProductMediaFromServer`, `setPrimaryProductMedia`, `reorderProductMedia`, stage vocabulary. |
| `frontend/src/services/api/mediaApi.js` | HTTP adapters: `apiUploadProductMediaObject`, `apiRegisterMediaObject`, `apiGetProductMediaSet`, `apiListMediaAssets`. |
| `frontend/src/services/media/uploadValidation.js` | Client-side format + size rules. |
| `frontend/src/config/mediaTypes.js` | Roles, scopes, statuses, placements, `UPLOAD_RULES`, `UPLOAD_ACCEPT`, banner copy. |
| `frontend/src/hooks/useProducts.js` | Single-flight `GET /admin/products?pageSize=100` into the in-memory register. |
| `backend/app/api/v1/media.py` | Upload (724), auto-register, register (816), media-set (589), employee lanes (1446/1505), permissions, compensation. |
| `backend/app/services/media/upload_service.py` | Streaming size ceiling, calls `store_image`. |
| `backend/app/services/media/media_service.py` | Signature/dimension validation, deterministic key, checksum idempotency, 409 collision policy. |
| `backend/app/services/media/product_media_records.py` | The registered-media read model + `primary_item` / `gallery_urls`. |
| `backend/app/services/catalog/product_service.py` | Product DTOs — registered media *replaces* `image` / `additionalImages`. |

### 2.2 The exact request/response contract used by this page

**Upload** (`MediaUploadForm.jsx:229` → `productMediaService.js:194` → `mediaApi.js:132–151`)

```
POST /media/products/{productId}/objects     Authorization: Bearer <admin>
multipart: file=<bytes>
201 → { ok, object: { key, url, size, contentType, checksumSha256, alreadyExists, created } }
```

Note what is **not** sent: `role`, `sort_order`, `is_primary`, `title`, `alt_text`. The route accepts all of them (`media.py:731–738`) and **auto-registers with its defaults** (`media.py:796–805`).

**Register** (`productMediaService.js:206` → `mediaApi.js:201–229`)

```
POST /media/register                          Authorization: Bearer <admin|employee>
multipart: object_key, product_id, role, sort_order[, is_primary][, title][, alt_text]
201 → { ok, media: { id, objectKey, url, mimeType, title, altText, status },
        assigned, assignment: { productId, mediaId, role, sortOrder, isPrimary } }
```

**Read-back** (`productMediaService.js:114–156`, `267`)

```
GET /media/products/{id}/media-set            (staff scope)
GET /admin/products/{id}                      (admin scope only)
```

### 2.3 What happens on success / partial success / failure

| Case | Server reality | UI reality |
|---|---|---|
| **All files succeed** | object + asset + association exist for each file; first file is primary; all files carry `role=COVER` | success panel: "N media assets … registered … and assigned … confirmed by the server", media ids listed, product name read from the **client cache** (`MediaUploadForm.jsx:295–298`) |
| **File *n* fails at upload** (validation / 409 / 5xx) | files `0…n-1` are fully registered; file `n` not stored | batch aborts (`productMediaService.js:266–268`); `uploadState` returns to `idle`; one `formError`; queue keeps success chips; **no success panel, no "k of n succeeded" summary** |
| **File *n* uploads but register fails** | the object **and** the asset/mapping **already exist** from the upload call (default role `GALLERY`, `sort_order=0`, `is_primary=false`) → a "failed" file is already attached and, for a published product, already customer-visible | queue chip says **"Failed — <message>"**; success panel not shown |
| **Upload succeeds, read-back fails** | media is durable | success panel + an amber-truthful note "Media is registered and assigned, but refreshing … failed" (`MediaUploadForm.jsx:279–283`) — **this part is honest** |
| **Network drops / hangs** | unknown (no timeout) | UI stuck in "Uploading…" with every input disabled; only a page reload escapes |

### 2.4 Authorization & storage as implemented

* **Route:** `SuperAdminProtectedRoute` (`App.jsx:234`) → `AdminLayout` → page. Frontend role gate only.
* **API:** every mutation is behind `get_current_admin` **plus** `require_admin_permission(…, "media.upload")` (`media.py:680, 754, 821`). Independently enforced — verified.
* **Employee lane:** separate router `employee_router`, `require_permission_for_user(…, "media.upload")` + `_require_employee_write_scope` (archived/published/`is_primary` restrictions, `media.py:305–326`).
* **Storage credentials:** never in browser code. `mediaApi.js` only builds `/media/objects/...` URLs (`mediaPaths.js`). `GET /media/storage/status` redacts bucket identity.
* **Server-side validation:** non-empty, ≤ `MAX_IMAGE_SIZE_MB=10`, extension in policy, **content signature sniffed** (filename/MIME never trusted), pixel/dimension guard (`media_validation.py:290–345`), filename sanitised into the key (`storage/keys.py:175–180`).
* **Object rollback:** if the upload route's own DB half fails, the object is deleted (`media.py:796–805` → `_compensate_failed_registration` 1386–1411). Orphan risk from *that* path is closed.
* **Referential safety:** delete route refuses to remove referenced objects; row is deleted before bytes (`media.py:1312–1384`), so a registration can never point at a deleted object.

---

## Section 3 — Bug Register

### 3.1 Summary table

| ID | Bug | Category | Severity | Status |
|---|---|---|---|---|
| MEDIA-UPLOAD-001 | Every batch silently promotes its first file to primary and demotes the existing cover | Functional / data integrity | **Critical** | Confirmed |
| MEDIA-UPLOAD-002 | Shared form forces `is_primary`, so the employee upload page always fails at registration | Functional / backend contract | **Critical** (employee surface) | Confirmed |
| MEDIA-UPLOAD-003 | A registration failure is reported as "Failed" although the asset is already stored and attached | Reliability / truthfulness | **High** | Confirmed |
| MEDIA-UPLOAD-004 | First registration silently replaces the product's legacy image set in the API DTO | Backend / data presentation | **High** | Confirmed (API), decision required |
| MEDIA-UPLOAD-005 | Product list is snapshotted once; on a cold page load the selector stays empty | Functional | **High** | Confirmed (code) / timing-dependent outcome |
| MEDIA-UPLOAD-006 | Only the first 100 products (newest) are searchable; result list capped at 15/20 | Functional / scalability | **High** | Confirmed |
| MEDIA-UPLOAD-007 | Every image defaults to the `COVER` role | Data quality | **Medium** | Confirmed |
| MEDIA-UPLOAD-008 | Alt text and caption are collected then silently discarded | Functional / accessibility | **High** | Confirmed |
| MEDIA-UPLOAD-009 | Progress bar never moves (0% → 100%) | UX / truthfulness | **Medium** | Confirmed |
| MEDIA-UPLOAD-010 | No request timeout or cancel; a stalled upload hangs the UI indefinitely | Reliability | **High** | Confirmed |
| MEDIA-UPLOAD-011 | Partial success is not summarised; retry re-processes succeeded files; no per-file retry/skip | Reliability | **High** | Confirmed |
| MEDIA-UPLOAD-012 | Same filename + different bytes → hard 409, no replace path in the UI | Functional | **Medium** | Confirmed |
| MEDIA-UPLOAD-013 | Archived products are accepted by the admin path with a success message | Functional / business rule | **Medium** | Confirmed |
| MEDIA-UPLOAD-014 | Duplicate file selections are not detected; success counts overstate | Functional | **Medium** | Confirmed |
| MEDIA-UPLOAD-015 | Submit is enabled with no product selected; the selector's own error prop is never used | UX | **Medium** | Confirmed |
| MEDIA-UPLOAD-016 | Unsaved work is lost; Cancel (`navigate(-1)`) differs from Back | UX / reliability | **Medium** | Confirmed |
| MEDIA-UPLOAD-017 | Product combobox is not keyboard operable | Accessibility | **High** | Confirmed |
| MEDIA-UPLOAD-018 | The page states its purpose four times before the first control | UX | **Medium** | Confirmed |
| MEDIA-UPLOAD-019 | Off-system colours; `text-sage` is not a defined token | Visual consistency | **Low** | Confirmed |
| MEDIA-UPLOAD-020 | Vertical footprint pushes the CTA below the fold at 1366×768 | UX | **Medium** | Confirmed |
| MEDIA-UPLOAD-021 | No view of the product's existing media/primary/order before uploading | UX / data risk | **High** | Confirmed |
| MEDIA-UPLOAD-022 | Success screen has no per-file result mapping; "View Media" leaves the product context | UX | **Low** | Confirmed |
| MEDIA-UPLOAD-023 | Fabricated SKU (`PF-00001`) when a record has none | UX / data honesty | **Low** | Confirmed |
| MEDIA-UPLOAD-024 | "Preparing assets…" state is unreachable | Code hygiene | **Informational** | Confirmed |
| MEDIA-UPLOAD-025 | No file-count or total-size limit; dimension rules not surfaced | UX / safeguard | **Low** | Confirmed |
| MEDIA-UPLOAD-026 | Dropdown does not close on outside click / Escape; "Select Files" label not associated | Accessibility / UX | **Low** | Confirmed |
| MEDIA-UPLOAD-027 | Drag highlight can flicker when moving over dropzone children | Visual | **Informational** | Suspected |

---

### 3.2 Detailed findings

#### MEDIA-UPLOAD-001 — Every batch silently takes the cover

* **Category:** Functional / data integrity
* **Severity:** Critical
* **Status:** Confirmed
* **Evidence:**
  * `frontend/src/components/media/MediaUploadForm.jsx:234` → `firstIsPrimary: true` (unconditional)
  * `frontend/src/services/media/productMediaService.js:259` → `isPrimary: perFile.isPrimary ?? (index === 0 && Boolean(options.firstIsPrimary))`
  * `backend/app/api/v1/media.py:231–236` → when `is_primary`, **all** other mappings of the product are set to `is_primary=False`
  * `backend/app/services/catalog/product_service.py:370–390, 668–672` → the product DTO's `image` is the registered primary
  * Contrast with the established house pattern: `frontend/src/components/media/ProductMediaManager.jsx:165` → `firstIsPrimary: items.length === 0`
* **Explanation:** The page never reads the product's existing media set, so it cannot know whether a cover already exists. It hard-codes "first file of this batch is the cover", and the server dutifully demotes the incumbent primary in the same transaction. A Super Admin adding three *gallery* shots to a published saree therefore changes that saree's listing/hero image to the first gallery shot.
* **User impact:** The operator sees "Registered & Assigned" and has no signal that the product's cover moved. The old cover is still in the registry, but no longer primary.
* **Business impact:** Customer-facing product imagery changes without an explicit merchandising action; the published product's `image` (used in listings, cards, search results) changes immediately. Reversible only by manually re-assigning the primary elsewhere.
* **Reproduction:** Product P already has a primary registered image. On this page select P, queue two new images, submit. Result: both new rows exist; the first is `is_primary=true`; P's previous primary is `false`; `GET /products/{slug}` now returns the new image.
* **Recommended fix (smallest):** Load the product's media set when a product is selected and pass `firstIsPrimary: existingPrimaryCount === 0` — exactly the `ProductMediaManager` rule. Optionally add an explicit "Set as cover" checkbox per file (default off).
* **Dependencies:** Needs the read that also fixes MEDIA-UPLOAD-021 (one fetch solves both).

---

#### MEDIA-UPLOAD-002 — The shared form makes employee uploads impossible

* **Category:** Functional / backend contract
* **Severity:** Critical (employee surface); High as a signal for the Super Admin page
* **Status:** Confirmed (by code)
* **Evidence:**
  * `frontend/src/pages/employee/EmployeeMediaUpload.jsx:60–66` mounts the **same** `MediaUploadForm` with `portalType="employee"`
  * `frontend/src/components/media/MediaUploadForm.jsx:234` → `firstIsPrimary: true` regardless of portal
  * `frontend/src/services/api/mediaApi.js:219` → employee scope posts to `/employee/media/register`
  * `backend/app/api/v1/media.py:1521` → `_require_employee_media_write(..., is_primary=is_primary)`; `307–328` raises (`BusinessLogicException` → **HTTP 422 `BUSINESS_RULE_VIOLATION`**, verified live — **not** 403) *"Employee uploads cannot become the primary image — an administrator sets the primary image for a product."*
* **Explanation:** The upload call omits `is_primary`, so it succeeds and the asset is registered. The follow-up register call sends `is_primary=true`, which the employee lane rejects by policy. The employee flow therefore fails by design of the *form*, not by design of the *policy*.
* **User impact:** An employee with `media.upload` grants sees a server error on every attempt; the file may already be attached with default metadata.
* **Business impact:** The employee media pipeline is effectively unusable; the error blames a policy the user cannot change.
* **Reproduction:** Sign in to the employee portal with `media.upload`, open `/employee/media/upload`, choose a DRAFT product and one image, submit → error from `_require_employee_write_scope`.
* **Recommended fix:** Same as 001 (`firstIsPrimary` only when no primary exists) — and for employees, never (their route forbids it entirely). Gate on `isEmployeeSession`.
* **Dependencies:** 001.

---

#### MEDIA-UPLOAD-003 — "Failed" can mean "already saved and attached"

* **Category:** Reliability / truthfulness
* **Severity:** High
* **Status:** Confirmed
* **Evidence:**
  * `backend/app/api/v1/media.py:796–805` — the **upload** route already creates the `MediaAssetModel` row **and** the `ProductMediaModel` mapping.
  * `frontend/src/services/media/productMediaService.js:193–235` — the client then performs a **second**, now-redundant registration.
  * `frontend/src/components/media/MediaUploadQueue.jsx:110–117` — any non-`assigned` stage renders "Failed — …".
  * `backend/app/services/catalog/product_service.py:370–390` — every registered mapping is projected into the product DTO.
* **Explanation:** The page was written against a two-call contract (`upload` then `register`) that the backend has since collapsed into one atomic call. When the second call fails (network blip, 409 on checksum, session expiry between calls, permission revoked), the UI reports failure for a write that has already happened. The asset is attached with `role=GALLERY`, `sort_order=0`, `is_primary=false`, and may already be visible on a published product.
* **User impact:** The operator retries or asks an engineer to "clean up" a failure that is not a failure; retrying re-uploads the same bytes and re-registers.
* **Business impact:** Duplicate-looking assets, misleading audit trail, media appearing on products that the operator believes failed.
* **Reproduction:** Upload one image and abort/block the `/media/register` request (DevTools → request blocking) after `/media/products/{id}/objects` returns 201. UI: "Failed — …". `GET /media/products/{id}/media-set` (with staff token): the item is present.
* **Recommended fix:** Treat this surface as a **single-call** pipeline: use the upload response (or add `media` to it), or re-read the media-set before deciding the failure text. If the two-call contract is kept, the message must be "Stored and attached, but the assignment could not be confirmed" — never "Failed".
* **Dependencies:** None, but coordinate with 001 (both live in `handleSubmit`).

---

#### MEDIA-UPLOAD-004 — First registration replaces the product's existing image set in the DTO

* **Category:** Backend / data presentation
* **Severity:** High (customer-visible)
* **Status:** Confirmed at the API; storefront consequence inferred from the mapper
* **Evidence:**
  * `backend/app/services/catalog/product_service.py:371–390` — `_registered_media_view` returns `image = primary.url`, `additionalImages = gallery_urls(registered)` whenever **any** registered mapping exists
  * `product_service.py:668–672` and `777–781` — both storefront and admin DTOs prefer that view over the legacy columns (`media_view.get("image") or resolve_product_image_reference(p.image)`)
  * `backend/app/services/media/product_media_records.py:127–129` — `gallery_urls` returns **all** registered URLs, including the primary
  * `frontend/src/services/catalog/catalogStore.js:128–146` — the storefront maps `image` → primary and `additionalImages` → gallery
* **Explanation:** Adding the first registered image does not "add" to a product's imagery — it **switches the product's image source** from the authored columns to the registered set. All legacy `additional_images` disappear from the DTO (the DB values are untouched), and the new gallery list repeats the cover.
* **User impact:** The Super Admin cannot predict the result from this page, because the page never shows the existing images (021).
* **Business impact:** Existing product photography vanishes from the storefront for every product that receives its first registered upload; the cover appears twice in the gallery until de-duplicated (frontend de-dupe not verified).
* **Reproduction:** Pick a product with legacy `image` + 4 `additional_images` and no registered media. Upload one file. `GET /products/{slug}` now returns `image=<new object URL>` and `additionalImages=[<new object URL>]`.
* **Recommended fix:** **Decision required before code.** Either (a) register the media but keep the legacy DTO until an explicit "promote to catalogue" action, or (b) accept the switch and make the UI state it plainly ("Registering media replaces this product's catalogue image set"). (b) is a one-line copy change; (a) is a backend batch and must not be smuggled into a page fix.
* **Dependencies:** None technical; it is a product decision.

---

#### MEDIA-UPLOAD-005 — Cold-load product list is empty and never recovers

* **Category:** Functional
* **Severity:** High
* **Status:** Confirmed in code; empty result is timing-dependent
* **Evidence:**
  * `frontend/src/components/media/MediaProductSelector.jsx:19–31` — `useMemo(() => catalogRepository.all()…, [])`: **no dependency array entry, no subscription**
  * `frontend/src/hooks/useProducts.js:37–52, 74–101` — the only fetch (`GET /admin/products?pageSize=100`) runs from `AdminLayout` after mount, then emits `PRODUCTS_CHANGED_EVENT`
  * `frontend/src/layouts/AdminLayout.jsx:34` — `useProducts()` is called but children are **not** gated on it
  * `frontend/src/services/catalogRepository.js:100` — `serverProducts` is in-memory only (no localStorage/seed)
* **Explanation:** On a hard refresh / direct navigation, the lazy-loaded page can render before `GET /admin/products` resolves. The selector snapshots an **empty** array at that moment and never re-reads it, because the memo has no dependencies and the component does not listen for the catalogue-changed event. There is no loading state, no error state and no retry, so the dropdown shows `No products found matching “”` and the operator cannot proceed without an unrelated remount (navigate away and back).
* **User impact:** "The product search is broken" on first visit; a Super Admin cannot upload at all from a bookmark or after a refresh.
* **Business impact:** Blocks the media intake desk; encourages workarounds (uploading from elsewhere) that bypass the intended flow.
* **Reproduction:** With the backend up, open `http://localhost:5173/super-admin/media/upload` in a **new tab** (or hard-reload on that route), then click the product field before the catalogue request settles. Repeat with the request throttled in DevTools to make it deterministic.
* **Recommended fix:** Make the selector consume `useProducts()` (or `subscribeCatalogRegister`) and render `loading` / `error + retry` / `empty` states. Keep `catalogRepository` as the store — no new architecture.
* **Dependencies:** Pairs with 006 (the same hook should expose search/page-through).

---

#### MEDIA-UPLOAD-006 — Only the newest 100 products are selectable

* **Category:** Functional / scalability
* **Severity:** High
* **Status:** Confirmed
* **Evidence:**
  * `frontend/src/hooks/useProducts.js:37` — `apiAdminListProducts({ pageSize: 100 })`, one page only
  * `frontend/src/services/api/productsApi.js:411–430` — `sort` defaults to `"newest"`
  * `backend/app/api/v1/products.py:314` — the server accepts `pageSize` up to **500**
  * `frontend/src/components/media/MediaProductSelector.jsx:40, 49` — `slice(0, 15)` with no query, `slice(0, 20)` with a query
* **Explanation:** Search is a client-side substring filter over the cached page. Any product outside the newest 100 (typically the older catalogue — exactly the pieces most likely to need fresh photography) is invisible and unsearchable, and the UI never says a subset is being searched. Even within the cache, a 20-row cap can truncate a broad query with no "more results" affordance.
* **User impact:** "Product not found" for products that exist; the operator may conclude the product was deleted.
* **Business impact:** Wrong workarounds — uploading against a similarly named product (**wrong association**) is a realistic failure mode for a large catalogue.
* **Reproduction:** With >100 products, search for the name/SKU of a product older than the newest 100 → "No products found".
* **Recommended fix:** Server-side search (`q`) with debounce and paging through `useProducts`/`productAdminService`, or an explicit "Search the whole catalogue" action; at minimum state "showing 100 of N" and surface `total`.
* **Dependencies:** 005 (same hook), backend `q` already exists (`products.py` admin list).

---

#### MEDIA-UPLOAD-007 — Every image is created with the `COVER` role

* **Category:** Data quality
* **Severity:** Medium
* **Status:** Confirmed
* **Evidence:**
  * `frontend/src/components/media/MediaUploadForm.jsx:114` — `rolesForType(val.type)[0]?.id`
  * `frontend/src/config/mediaTypes.js:105–166` — the first image role in `PRODUCT_ROLE_OPTIONS` is `COVER`
  * Contrast: `ProductMediaManager.jsx` sends no role → server default `GALLERY` (`schemas/media/media.py:88`)
* **Explanation:** Role is a descriptive field ("one image every listing… uses" per the config copy), and the page assigns `COVER` to *every* uploaded file. The authoritative cover signal is `is_primary` (per `product_service.py:254–263`), so this does not break publishing — but it mislabels the registry and the product media manager (`ProductMediaManager.jsx:278` renders `item.role`).
* **User impact:** Every uploaded detail shot reads "COVER" in the media manager; the operator has to re-label them elsewhere.
* **Business impact:** Dirty role data across the registry; reporting/filters by role become meaningless.
* **Recommended fix:** Default new uploads to `GALLERY` (or the house default) and let the operator choose; never silently assign `COVER`.
* **Dependencies:** Same edit as 001.

---

#### MEDIA-UPLOAD-008 — Alt text and caption are collected and discarded

* **Category:** Functional / accessibility / data loss
* **Severity:** High
* **Status:** Confirmed
* **Evidence:**
  * `frontend/src/components/media/MediaUploadForm.jsx:121–122` — `alt` initialised from the **filename**
  * `MediaUploadForm.jsx:231` — the submission maps only `{ file, role, title }`; `alt` and `caption` are dropped
  * `frontend/src/services/media/productMediaService.js:261` — `altText: perFile.altText ?? entry?.altText ?? null` (the queue item has `alt`, not `altText`)
  * `frontend/src/components/media/MediaUploadQueue.jsx:192–205` — the caption input exists
  * `backend/app/api/v1/media.py:731–738, 820` — `alt_text` is accepted; **no caption parameter exists on any endpoint**, although `MediaAssetModel.caption` exists (`models/media/media_asset.py:57`)
* **Explanation:** Two required-looking inputs are decorative. Alt text is silently replaced by a title-derived default on the server (`alt_text=None`), and the caption has no server contract at all.
* **User impact:** The operator types accessibility copy that disappears; there is no feedback.
* **Business impact:** Alt text is an SEO/accessibility/legal artifact; products go live with missing or filename-derived alt text. Captions cannot be stored at all.
* **Reproduction:** Select a file, change "Alt text" to "Hand-embroidered zari border", submit, then inspect `GET /media/products/{id}/media-set` → `altText: null`.
* **Recommended fix:** Pass `altText` in both calls (one field), and either wire `caption` end-to-end (schema + both routes + read model) or remove the caption input. Do not add a caption parameter inside a UI-only change.
* **Dependencies:** Caption needs a backend batch; alt text does not.

---

#### MEDIA-UPLOAD-009 — The progress bar never moves

* **Category:** UX / truthfulness
* **Severity:** Medium
* **Status:** Confirmed
* **Evidence:** `frontend/src/components/media/MediaUploadForm.jsx:215–223` defines `progressFor(...)`, which is **never called** (grep: only the definition). `setUploadProgress` is called at `226` (0), `255` (0 on failure), `278` (100 at the very end).
* **Explanation:** The bar reads `0%` for the entire run, then jumps to `100%`. The adjacent copy says "each file's stage above reflects a server response", which draws attention to a number that is not measuring anything.
* **User impact:** On a slow link the screen looks frozen; on a 20-file batch the operator has no sense of progress.
* **Business impact:** Encourages repeated clicks/navigation away mid-batch (which is safe for the server but confusing for the operator).
* **Recommended fix:** Call `progressFor` from the `onStage` handler (per-file stage × count), or replace the bar with a determinate "file k of n" counter derived from the same stage events.
* **Dependencies:** None.

---

#### MEDIA-UPLOAD-010 — No timeout, no cancel

* **Category:** Reliability
* **Severity:** High
* **Status:** Confirmed
* **Evidence:** `frontend/src/services/api/apiClient.js:373–480` — `request()` calls `fetch` with **no `AbortController` and no timeout**; `upload()` (476) delegates to it. `MediaUploadForm.handleSubmit` has no abort path; every queue input and both buttons are disabled while `uploadState !== "idle"` (`447, 471–504, 517, 547, 606, 615`).
* **Explanation:** A half-open connection (sleeping laptop, dead Wi-Fi, stalled proxy) leaves the promise pending forever. The UI is locked with no message beyond "Uploading…".
* **User impact:** The only recovery is a full reload, which loses the queue and the knowledge of which files were already accepted.
* **Business impact:** Abandoned uploads; repeat work; no telemetry distinguishing "user cancelled" from "hung".
* **Reproduction:** Start an upload and set the network to Offline in DevTools **while the request is in flight** (not before) — or use a proxy that never responds. The UI remains in "Uploading…".
* **Recommended fix:** Add a per-request timeout + `AbortSignal` to `apiClient` (a house-level change) or a scoped wrapper in `productMediaService`; surface "Timed out after Ns — retry" and re-enable the form.
* **Dependencies:** Coordinate with 011 (retry semantics).

---

#### MEDIA-UPLOAD-011 — Partial success is not summarised; retry re-processes everything

* **Category:** Reliability
* **Severity:** High
* **Status:** Confirmed
* **Evidence:**
  * `productMediaService.js:266–268` — abort on first failure, results returned in `result.results`
  * `MediaUploadForm.jsx:253–261` — on `!result.ok` the component discards `result.results`, shows one `formError`, and returns to `idle`
  * `MediaUploadForm.jsx:269–277` — `uploadedResults` (and therefore the success panel) is only populated on a fully successful batch
  * `MediaUploadForm.jsx:601–628` — the submit button is re-enabled with the **whole** queue intact
* **Explanation:** The operator is told one error message; the queue shows chips, but there is no "2 of 3 registered" statement. Retrying re-uploads the already-registered files (harmless server-side thanks to checksum idempotency, but it doubles requests and confuses the count). There is no way to retry only the failed file, and no way to change the target product for only the remaining files.
* **User impact:** The operator cannot tell what is safely in the system without opening another screen (or leaving the page).
* **Business impact:** Half-completed merchandising work; duplicate operator effort; risk of the same files being re-uploaded against a different product after switching selection.
* **Reproduction:** Queue 3 images; make the second fail (e.g. rename a 12 MB file or block the second request). Observe: one error, no summary; the third never attempted; retry starts from file 1.
* **Recommended fix:** Render `result.results` as a per-file summary (`n succeeded / m failed`), keep only failed items in the queue, mark successful ones as done with their server media id, and pass the successful ids to the completion view.
* **Dependencies:** 003 (accurate failure meaning), 009 (progress).

---

#### MEDIA-UPLOAD-012 — Same filename, different bytes: permanent 409 with no remedy in the UI

* **Category:** Functional
* **Severity:** Medium
* **Status:** Confirmed
* **Evidence:**
  * `backend/app/services/media/media_service.py:221–245` — identical key + identical checksum → "already present"; identical key + **different** bytes + `replace_existing=False` → `ObjectCollisionError` → HTTP 409
  * `frontend/src/services/api/mediaApi.js:136–146` — the upload call sends **only** `file`; `replace_existing` is never sent
* **Explanation:** Product image filenames from a camera/export are frequently reused (`IMG_0001.jpg`, `front.jpg`). Re-shooting a product therefore fails with a server 409 that the UI renders verbatim, and no retry can succeed without renaming the file on disk.
* **User impact:** A dead end with an infrastructure-flavoured message.
* **Business impact:** Re-shoots cannot be applied; operators rename files ad hoc, breaking naming conventions.
* **Recommended fix:** On 409, offer an explicit "Replace the existing image" action that re-submits with `replace_existing=true` (the server then writes a content-addressed key and keeps the old object), or explain precisely what to do.
* **Dependencies:** 003 (error classification).

---

#### MEDIA-UPLOAD-013 — Archived products accept media with a success message

* **Category:** Functional / business rule
* **Severity:** Medium
* **Status:** Confirmed
* **Evidence:**
  * `backend/app/api/v1/media.py:763–771` — the admin upload route checks **existence only**
  * `media.py:295–303` + `855` — `_require_writable_product` (used by `/media/register`) only raises 404
  * `media.py:305–326` — the archived/published restrictions exist **only** on the employee lane
  * `MediaProductSelector.jsx:186–206` — the row shows name, SKU, category, price; **no status**
* **Explanation:** The admin path deliberately allows writing to any status (a defensible policy), but the page gives no hint of status, so an operator can spend time adding imagery to an ARCHIVED (retired) product and be told it succeeded. Nothing will ever display it.
* **User impact:** Wasted work, false confidence.
* **Business impact:** Media attached to retired products; registry noise.
* **Recommended fix:** Show status (and "Archived — this media will not be visible") in the selector and in the confirmation card; optionally warn before submit. Changing the *server* policy is a separate decision.
* **Dependencies:** 021 (both need product status/context).

---

#### MEDIA-UPLOAD-014 — Duplicate selections are not detected

* **Category:** Functional
* **Severity:** Medium
* **Status:** Confirmed
* **Evidence:** `MediaUploadForm.jsx:103–127` — every file is pushed regardless of an existing `name+size` in the queue; the dedupe-relevant `key` is `name-size-Date.now()-idx` (`118`), so it is unique by construction.
* **Explanation:** Selecting the same file twice yields two queue rows, two uploads, two register calls, and one asset row (idempotent by key/checksum) — but the success panel counts **2 media assets** (`MediaUploadForm.jsx:302`), because it counts results, not distinct media ids.
* **User impact:** Inflated counts and confusion about what exists.
* **Business impact:** Misleading registration reporting; extra requests.
* **Recommended fix:** Reject a file already in the queue (name + size + lastModified) with a plain message; count distinct `media.id` in the success panel.
* **Dependencies:** None.

---

#### MEDIA-UPLOAD-015 — The CTA is enabled before the product is chosen

* **Category:** UX
* **Severity:** Medium
* **Status:** Confirmed
* **Evidence:** `MediaUploadForm.jsx:615` — `disabled={uploadState !== "idle" || !queue.length || !isAuthorizedToUpload}` (no product check). `validateForm` (`162–194`) is the only guard and runs on submit. `MediaProductSelector` accepts an `error` prop (`MediaProductSelector.jsx:13, 224–228`) that `MediaUploadForm` never passes.
* **Explanation:** The primary button looks ready while a required field is empty; the error appears in a banner **below** the queue, far from the selector that needs attention.
* **User impact:** A click that appears to do nothing (the page may not scroll to the message); the actual missing field is above the fold.
* **Business impact:** Friction on the primary task; support questions.
* **Recommended fix:** Disable submit until `productId && queue.length` (with a short helper line under the selector), and pass `error` to `MediaProductSelector` so the message is adjacent.
* **Dependencies:** None.

---

#### MEDIA-UPLOAD-016 — Unsaved work is lost; Cancel and Back behave differently

* **Category:** UX / reliability
* **Severity:** Medium
* **Status:** Confirmed
* **Evidence:** `MediaUploadForm.jsx:606–610` — Cancel is `navigate(-1)`; `AdminMediaUpload.jsx:16–21` — Back is `<Link to={prefix}/media>`. No `beforeunload`, no confirmation, no draft persistence; the selected product and queue live only in component state.
* **Explanation:** `navigate(-1)` is history-dependent: from a bookmark/deep link it can leave the portal (or do nothing); otherwise it goes back to whatever page preceded. Refresh/back-drop silently discards files and metadata.
* **User impact:** Lost selections and typed copy; inconsistent destination for two buttons on the same screen.
* **Business impact:** Repeated work, especially on slow connections.
* **Recommended fix:** Make Cancel use the same explicit destination as Back (or keep history but guard when `queue.length > 0`), and warn on `beforeunload` while a queue exists.
* **Dependencies:** None.

---

#### MEDIA-UPLOAD-017 — The product combobox cannot be operated by keyboard

* **Category:** Accessibility
* **Severity:** High
* **Status:** Confirmed
* **Evidence:** `MediaProductSelector.jsx:122–160` — text input with **no** `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete`. `169–178` — options are `<li role="option" onClick=…>` with **no** `tabIndex`, `onKeyDown`, `onMouseDown` or focus management; there is no Arrow/Enter/Escape handling anywhere in the file.
* **Explanation:** The list opens on focus, but the only way to choose an entry is a mouse click. Tabbing from the input moves focus to the chevron and then out of the widget; Escape does not close it.
* **User impact:** Keyboard and screen-reader users cannot complete the primary task.
* **Business impact:** The media intake desk is unusable for assistive-technology users; it also fails the project's own accessibility expectations elsewhere in the design system.
* **Reproduction:** Tab to the product field, type a query, press ↓/Enter → nothing is selected.
* **Recommended fix:** Use the project's existing accessible picker pattern if one exists (check `components/admin/ProductCatalogSelector.jsx` and `components/admin/homepage/PublishedProductPicker.jsx` first), or add `role="combobox"` + roving focus to **this** component only.
* **Dependencies:** 005/006 (the same component is being reworked).

---

#### MEDIA-UPLOAD-018 — The page explains itself four times

* **Category:** UX
* **Severity:** Medium
* **Status:** Confirmed
* **Evidence:** `AdminMediaUpload.jsx:19–22` (eyebrow "BUSINESS / MEDIA", H1 "Upload Product Media", long description) → `AdminMediaUpload.jsx:25` (`AdminPanel` eyebrow "PRODUCT MEDIA REGISTRATION", title "Upload Product Media" again) → `MediaUploadForm.jsx:376–391` (amber "DURABLE MEDIA PIPELINE ACTIVE" banner with a 60-word paragraph). Visible in both screenshots.
* **Explanation:** ~90 px of banner plus two competing H1-level titles consume the first screen; the banner describes *implementation honesty* ("preview URLs are never saved", "server's own responses") rather than anything the operator must decide.
* **User impact:** The real first step (choose a product) sits ~560 px down at 1366×768.
* **Business impact:** Slower task completion; the page reads as a developer note rather than a premium operational tool.
* **Recommended fix:** Keep one page title; demote the panel title or drop it; reduce the banner to a single line (or move the pipeline explanation to a help disclosure). Keep the honest wording — just shorten it.
* **Dependencies:** 020 (layout pass).

---

#### MEDIA-UPLOAD-019 — Off-system colours, one undefined class

* **Category:** Visual consistency
* **Severity:** Low
* **Status:** Confirmed
* **Evidence:** `MediaUploadForm.jsx:376–384` uses Tailwind defaults `amber-300/60`, `amber-50/50`, `amber-900`; `310–316` uses `emerald-50/200/700`; `MediaUploadQueue.jsx:99` uses **`text-sage`**, which is not defined anywhere (`grep` in `src/index.css` and `design-system/` finds no `sage`), so "Registered & assigned" renders in the inherited ink colour; `MediaUploadQueue.jsx:75` uses `purple-950/80` for the video badge (unreachable in this flow, but off-system).
  The house tokens exist: `--color-pf-success`, `--color-pf-warning`, `--color-pf-error` (`frontend/src/index.css:129–131`) and `accent`/`brass`/`mist`.
* **Explanation:** The page is visually adjacent to, but not inside, the Atelier system.
* **User impact:** Success/warning signals lose their semantic colour (the sage bug is a genuine "status looks unconfirmed" problem, not just taste).
* **Business impact:** Brand consistency; colour-coded meaning is unreliable.
* **Recommended fix:** Swap to `pf-success` / `pf-warning` / `pf-error` / `accent` tones; define or remove `sage`.
* **Dependencies:** 018/020 (one styling pass).

---

#### MEDIA-UPLOAD-020 — The workflow does not fit a laptop screen

* **Category:** UX
* **Severity:** Medium
* **Status:** Confirmed (screenshots)
* **Evidence:** Screenshot 1: banner ends ~y=500, product selector ~y=555–660, dropzone starts below the fold. Screenshot 2: the operator has scrolled; the dropzone is ~330 px tall, the CTA ~y=603 in the scrolled view. At 1366×768 the CTA is not visible in the initial viewport.
* **Explanation:** Fixed-height decorative dropzone + banner + duplicate headings + full-width destination card add up to ~1,150 px for a three-field form.
* **User impact:** The operator cannot see "what to do" and "the button that does it" at the same time.
* **Business impact:** Slower, more error-prone operation on the common office laptop.
* **Recommended fix:** Compact banner, single heading, shorter dropzone (or a side-by-side selector), sticky action bar at the card's bottom edge on tall screens.
* **Dependencies:** 018.

---

#### MEDIA-UPLOAD-021 — No existing-media context before uploading

* **Category:** UX / data risk
* **Severity:** High
* **Status:** Confirmed
* **Evidence:** `MediaUploadForm.jsx` never calls `getRegisteredProductMedia` before submit (only `syncProductMediaFromServer` **after** a successful batch, line 267). The product card shows name/SKU/category only (`MediaProductSelector.jsx:79–113`).
* **Explanation:** The operator cannot see the current cover, the current gallery, the sort order, or how many images exist — yet the upload will demote the primary (001) and renumber from 0 (see below).
* **Additional evidence for the sort-order interaction:** `productMediaService.js:258` sets `sortOrder: index` starting at **0 for every batch**, while existing associations keep their own orders. New files therefore interleave with existing ones instead of appending.
* **User impact:** Blind changes to merchandising-critical data.
* **Business impact:** Wrong covers, scrambled galleries, rework in the product media manager.
* **Recommended fix:** On product selection, read the media set (staff scope) and show a compact strip: current cover thumbnail, count, and a note that new files will be appended after the existing ones (when combined with an offset fix).
* **Dependencies:** 001 (the same read), 004 (copy).

---

#### MEDIA-UPLOAD-022 — Success screen does not say which file became what

* **Category:** UX
* **Severity:** Low
* **Status:** Confirmed
* **Evidence:** `MediaUploadForm.jsx:301–371` — counts images/videos and lists truncated media ids; no filename→id→URL table. "View Media" goes to `/super-admin/media` (the registry), not the product's media manager.
* **Explanation:** The operator's mental model is per-file ("did front.jpg land?"), and the next useful screen is the product's media set.
* **User impact:** Extra navigation to verify.
* **Business impact:** Minor.
* **Recommended fix:** Per-file rows (name → media id → role/primary) and a "Open product media" primary action plus "Open registry" secondary.
* **Dependencies:** 011.

---

#### MEDIA-UPLOAD-023 to 027 (low / informational)

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| 023 | Fabricated SKU displayed when a record has none (`PF-00001`) | `MediaProductSelector.jsx:24` | Show "SKU unavailable" — never invent identity |
| 024 | "Preparing assets…" is unreachable; `uploadState` is never `"preparing"` | `MediaUploadForm.jsx:567–568` | Delete the branch or set the state |
| 025 | No max file count or total-size ceiling; the server's 50 MP / 8000 px limits are not surfaced | `MediaUploadForm.jsx:95–134`; `config.py:191–192`; `media_validation.py:236–246` | Add a queue cap and mention dimension rules in the dropzone |
| 026 | Dropdown never closes on outside click/Escape; "Select Files" `<label>` has no `htmlFor` | `MediaProductSelector.jsx:162–220`; `MediaUploadForm.jsx:512–519` vs `MediaUploadDropzone.jsx:81` | Outside-click/Escape handling; associate the label with `media-file-input` |
| 027 | Drag highlight may flicker over child elements (`onDragLeave` fires on children) | `MediaUploadDropzone.jsx:23–30` | Use a drag counter or `relatedTarget` check — verify in-browser first |

---

## Section 4 — UI/UX Findings

### 4.1 What the page communicates today

The page is *honest* — unusually so — about the pipeline ("statuses come from the server", "preview URLs are never saved"). It is also **written for the engineer who built it, not for the person using it**. The first thing a Super Admin reads is a banner about preview URLs; the first thing they must *do* (choose a product) is 560 px down.

### 4.2 Findings, with impact

| # | Observation (screenshots + code) | Why it matters | Proposed improvement |
|---|---|---|---|
| 1 | Two H1-weight titles ("Upload Product Media" twice) plus two eyebrows, then a 90 px amber banner | The eye has four competing entry points; the workflow start is pushed below the fold | One title; one-line status strip; drop `AdminPanel`'s repeat title |
| 2 | The banner explains implementation internals | A Super Admin needs "these files go to the product's gallery immediately"; not how object keys work | Rewrite as one sentence of consequence, e.g. "Files are stored and attached to the product as soon as you submit. Registering the first image switches the product's catalogue images." |
| 3 | Product selector → dropzone → queue → CTA is a correct sequence, but nothing numbers it | The operator must infer the order | Add step markers ("1 Product · 2 Files · 3 Review") or a compact summary bar |
| 4 | Selected product card is clear (thumb, name, SKU, category, "Change Product") and status is missing | Good component; missing the one fact that changes the outcome (Draft/Published/Archived) | Add a status chip; warn on Archived |
| 5 | Dropzone is ~330 px tall with a 56 px icon circle | Consumes the fold for a control used once per session | ~140–160 px, or make it a compact row once files are queued |
| 6 | Queue cards are rich (preview, size, stage chip, title/alt/role/caption) but two fields are inert (008) and the stage colour is broken (019) | Rich UI that lies is worse than a plain one | Wire alt/caption or remove; fix status colours |
| 7 | Bottom bar reads "No files selected" with a live-looking "Upload & Register Media" button | The disabled state doesn't reflect the missing product (015) | Disable until valid; explain the missing input next to the field |
| 8 | Progress bar reads 0% throughout (009) | Looks frozen on slow links | Real per-file progress |
| 9 | Cancel vs Back to Media Management go to different places | Two exits, two behaviours (016) | One destination, dirty-state guard |
| 10 | No responsive breakpoints issue at md/lg (flex/grid used consistently), but the form is tall on mobile and the product dropdown overlays the dropzone | Usable but long on tablets; dropdown can cover the drop area | Shorter dropzone, dropdown as a bottom sheet on small screens |
| 11 | Accessibility: combobox not keyboard operable (017); dropzone not focusable/announced but has a keyboard-reachable "Browse Files" button; file errors use `role="alert"` correctly; the queue's labels are properly associated | The blocking issue is 017 | Adopt the house accessible picker; keep the existing alert patterns |
| 12 | Microcopy: "DURABLE MEDIA PIPELINE ACTIVE" is internal vocabulary; "Asset #1" in the queue is positional, not an id | Confusing jargon | "Media upload" / "File 1 of 3" |
| 13 | Design-system fit: typography (Cormorant display / Instrument Sans) and borders are right; colours are Tailwind defaults (amber/emerald) and one undefined class (`sage`) | Reads as a different product's alert style | Use `pf-success` / `pf-warning` / `accent` |
| 14 | No indication that existing catalogue images will be replaced (004) | The single most consequential fact on the page is absent | Explicit note on the selected product card |

---

## Section 5 — Proposed Improved Workflow

### 5.1 Target journey (no new architecture)

```text
1. Page opens
   ├─ Header: "Upload Product Media" (one title) + one-line purpose
   └─ Step 1 — Product
        · server-backed search by name / SKU (debounced, paged)
        · states: loading · results · empty ("no match") · error + retry
        · each row: thumbnail, name, SKU, status chip (Draft/Published/Archived)
        · on select: read the product's media set (staff scope) and show
          "3 images · cover: <thumb>" + "new files are added after the existing ones"

2. Step 2 — Files
   ├─ compact dropzone ("JPEG, PNG, WebP, AVIF · up to 10 MB each")
   ├─ per-file card: preview, name, size, validation state, remove
   ├─ rejects unsupported/oversized instantly with the reason
   ├─ ignores a file already queued (name + size + lastModified)
   └─ optional: "Set as cover" radio (default: keep the existing cover),
      role picker defaulted to Gallery, alt text (required for images), caption (only if wired)

3. Step 3 — Review & submit
   ├─ summary: "2 files → <product name> · cover unchanged"
   ├─ submit disabled until: product selected + ≥1 valid file + no in-flight request
   └─ submits one request per file, in order, with a live "file 2 of 3 · registering"

4. Result states
   ├─ all succeeded → per-file rows (name → media id → role/primary),
   │                  "Open product media" + "Continue uploading" + "View registry"
   ├─ partially succeeded → "2 of 3 registered and attached" with per-file rows,
   │                  failed row keeps the server message + "Retry this file" / "Remove"
   ├─ stored but unconfirmed → "Stored and attached, confirmation failed" (never "Failed")
   └─ nothing succeeded → one clear cause + retry, queue intact, nothing lost
```

### 5.2 Required states

| State | Must show | Must not do |
|---|---|---|
| **Empty** | product search prompt, rules line, disabled CTA with reason | claim a cover will be set |
| **Product selected** | status chip, current media count + cover thumb, "adds after existing images" | hide the fact that the first registration switches the product image set |
| **Validating** | per-file validation result inline (accept/reject + reason) | silently drop files |
| **Uploading** | per-file stage from server events + "file k of n" + cancel/timeout | lock the page with no escape |
| **Partially successful** | explicit "n succeeded / m failed", successes confirmed and removable | re-upload successes on retry |
| **Successful** | per-file media ids + which is primary | overstate the count for duplicate selections |
| **Failed (nothing written)** | the server's own message + cause class (network / rejected / storage / auth) | blame the operator for a 500 |
| **Archived product** | a visible warning before submit | say "success" with no caveat |

### 5.3 Explicitly out of scope for the page fix

No new component library, no new state manager, no change to `media.py`'s two routes, no change to storage config, no change to the publishing workflow, no new dependency.

---

## Section 6 — Prioritized Remediation Plan

### P0 — Data integrity / security (must precede any broader work)

| Batch | Bugs | Smallest safe change | Files |
|---|---|---|---|
| **P0-A "Never steal the cover"** | 001, 002, 007 | Read the product's media set on selection; pass `firstIsPrimary` only when no primary exists **and** the session is admin; default role to a non-cover value | `MediaUploadForm.jsx`, `MediaUploadQueue.jsx` (default role), `MediaProductSelector.jsx` (or its parent) |
| **P0-B "Tell the truth about failures"** | 003 (+011 messaging) | Treat upload+auto-register as the authoritative step; on a register-step failure say "stored and attached, confirmation failed"; keep results in state for the summary | `MediaUploadForm.jsx`, `productMediaService.js` (return shape), `MediaUploadQueue.jsx` |
| **P0-C "Stop silently replacing catalogue imagery"** | 004 | **Decision first.** Either add a one-line warning ("registering media replaces this product's catalogue image set") or postpone uploads for products with legacy-only media until a backend batch is approved | `MediaUploadForm.jsx` (copy) — backend untouched |

*Dependencies:* P0-A and P0-B both edit `handleSubmit`; do them together. P0-C is copy-only and can ship with them.

### P1 — Major functional / reliability

| Batch | Bugs | Change | Files |
|---|---|---|---|
| **P1-A "Catalogue that actually loads"** | 005, 006 | Consume `useProducts` (loading/error/retry, page-through and `q`), remove the one-shot memo, show "showing N of M" | `MediaProductSelector.jsx`, `useProducts.js` (expose total/loading/error — additive) |
| **P1-B "Alt text lands"** | 008 (alt only) | Send `altText` in the register call; stop defaulting alt to the filename silently | `MediaUploadForm.jsx`, `productMediaService.js` |
| **P1-C "Honest progress"** | 009 | Use the existing `progressFor` inside `onStage` | `MediaUploadForm.jsx` |
| **P1-D "Recoverable uploads"** | 010, 011 | Abort/timeout at the API layer + per-file summary, retry-failed-only, keep successes visible | `apiClient.js` (or scoped wrapper), `MediaUploadForm.jsx`, `MediaUploadQueue.jsx` |
| **P1-E "See before you change"** | 021 | Reuse the P0-A media-set read to render current cover/count/order | `MediaUploadForm.jsx` |
| **P1-F "Archived/published context"** | 013 | Status chip + warning (server policy unchanged) | `MediaProductSelector.jsx` |

### P2 — Usability & visual

| Batch | Bugs | Change |
|---|---|---|
| **P2-A "One screen"** | 018, 020, 019 | Single title, one-line banner, shorter dropzone, house colour tokens, sticky action row |
| **P2-B "Accessible picker"** | 017, 026 | `role="combobox"`, Arrow/Enter/Escape, `aria-expanded`, outside-click close, input label association |
| **P2-C "No dead ends"** | 012, 015, 016 | Replace-on-409 (with explicit confirm), disable-until-valid + inline selector error, consistent Cancel + dirty guard |
| **P2-D "Accurate counts & detail"** | 014, 022 | De-duplicate selections, count distinct media ids, per-file result table |

### P3 — Polish

| Bugs | Change |
|---|---|
| 023, 024, 025, 027 | Remove the fabricated SKU, delete the dead "preparing" branch, add a queue cap + dimension guidance, fix drag flicker if reproduced |
| caption (008) | Only if a backend batch is approved: add `caption` to both routes + read model, then wire the input |

### 6.1 Suggested implementation order

1. **P0-A + P0-B together** (one function, `handleSubmit`) — highest risk removed with the fewest edits.
2. **P0-C copy** in the same PR (a warning line).
3. **P1-A + P1-E** (one read model powering the selector and the "current media" strip).
4. **P1-B, P1-C, P1-F** (small, independent).
5. **P1-D** (API timeout + summary) — touches shared `apiClient`; verify other callers.
6. **P2 / P3.**

### 6.2 Files each fix touches (aggregate)

* `frontend/src/components/media/MediaUploadForm.jsx` — nearly every fix.
* `frontend/src/components/media/MediaUploadQueue.jsx` — role default, stage colours, caption/alt, retry affordance.
* `frontend/src/components/media/MediaProductSelector.jsx` — data source, states, status chip, keyboard.
* `frontend/src/services/media/productMediaService.js` — `firstIsPrimary` semantics, altText, result shape.
* `frontend/src/hooks/useProducts.js` — expose loading/error/total (additive).
* `frontend/src/services/api/apiClient.js` — timeout/abort (only if P1-D is approved; affects all callers).
* `frontend/src/config/mediaTypes.js` — **only** if copy/tokens are centralised there (avoid duplicating strings).
* **No change** to `backend/app/api/v1/media.py`, storage, models, or migrations for P0–P2.

### 6.3 What must remain untouched

* `POST /media/products/{id}/objects` and `POST /media/register` contracts (unless a separate, approved backend batch).
* The object-store configuration, key naming, checksum idempotency and 409 collision policy.
* `product_service.py` media projections, the dual-read/legacy fallback, and the publishing gate.
* `ProductMediaManager` (the product-scoped surface) and its ordering/primary actions.
* Authorization (`require_admin_permission`, employee write scope) and the employee lane's policy.
* Existing product rows, legacy image columns, and **any existing object or asset**.

---

## Section 7 — Verification Plan

### 7.1 Existing tests to run (baseline confirmed green today)

```bash
cd frontend
node --import ./scripts/node-loader/register.mjs --test tests/phase7ProductMedia.test.js       # 30 pass
node --import ./scripts/node-loader/register.mjs --test test/mediaAccessPermissions.test.js \
                                                   test/adminMediaRegistry.test.js             # 37 pass
node --import ./scripts/node-loader/register.mjs --test tests/phase6MediaStorage.test.js \
    tests/marketingAvifUpload.test.js test/mediaTerminology.test.js test/mediaRegistryView.test.js  # 81 pass
```

Backend (needs the project's Python environment — **not available in this sandbox**):

```bash
cd backend
pytest tests/unit/test_phase7_media_lifecycle.py tests/unit/test_phase6_media_storage.py \
       tests/unit/test_media_storage_security_regressions.py tests/unit/test_media_schema_integrity.py
```

### 7.2 Source-text tests that will be affected by a refactor (watch list)

These assert on the **text** of `MediaUploadForm.jsx`; an edit that renames or reformats will break them even when behaviour is preserved:

* `frontend/test/mediaSecurityContracts.test.js:182–187` — regexes on `canManageMarketing`.
* `frontend/test/mediaTerminology.test.js:140–158` — regexes on `allowScopeChange`, `initialScope`, marketing note.
* `frontend/tests/marketingAvifUpload.test.js:63–74` — requires `URL.createObjectURL(file)` and forbids canvas conversion.

Prefer keeping the surrounding shape stable, or update these tests deliberately in the same PR.

### 7.3 New regression tests required

**Frontend (node:test, no DOM is available — test the services and static contracts; keep UI assertions to the pure functions):**

1. `firstIsPrimary` is `false` when the product already has an `is_primary` mapping, and `true` only for the first-ever admin upload (mock `GET /media/products/{id}/media-set`).
2. Employee scope **never** sends `is_primary` (assert the FormData field is absent).
3. Default role for a newly queued image is not `COVER`.
4. `altText` reaches `/media/register` for every file; duplicate selections are rejected; the completion count uses distinct media ids.
5. Batch partial failure exposes `results` with `n ok / m failed`, and a retry only re-sends failed entries (extend `tests/phase7ProductMedia.test.js`).
6. `MediaProductSelector` data source: given a warm register → rows; given an empty register + a loading state → loading UI, not "No products found"; given an error → error + retry.
7. Static guard: the page never sends `replace_existing` implicitly and never persists a `blob:` URL (extend the existing honesty suite).

**Backend (pytest, existing SQLite harness in `test_phase7_media_lifecycle.py`):**

8. Contract test that the upload route's response identifies the asset it auto-registered (or that a follow-up register is idempotent and non-destructive).
9. Admin upload to an ARCHIVED product: pin **current** behaviour explicitly (so a later policy change is deliberate).
10. Re-registering with `is_primary=false` must not demote an existing primary (already implied — assert it).

### 7.4 API checks (manual, against a local non-production stack)

```bash
# 1. Upload + auto-register is one write
curl -X POST -H "Authorization: Bearer $ADMIN" -F "file=@plate.jpg" \
  $API/media/products/$PID/objects
# 2. Read model shows exactly one mapping, and what role/primary it got
curl -H "Authorization: Bearer $ADMIN" $API/media/products/$PID/media-set
# 3. Cover was not stolen when one already existed
#    (expect the pre-existing mediaId to still have isPrimary: true)
# 4. Archived product behaviour (expect current 201; decide whether that is wanted)
# 5. Orphan audit — dry-run only
curl -H "Authorization: Bearer $ADMIN" $API/media/audit/orphans
```

### 7.5 Storage checks

* `GET /media/object-meta/{key}` → size, sniffed mime, SHA-256 match the upload response.
* Re-running the **same** upload → `alreadyExists: true`, no new object, no new asset row.
* Same filename with different bytes → 409, no overwrite (and, after P2-C, an explicit replace path producing a content-addressed key).

### 7.6 Manual browser scenarios (Super Admin)

1. Hard refresh on `/super-admin/media/upload` → product list loads (or a truthful loading/error state).
2. Deep link with the catalogue API failing → error + retry, not "No products found".
3. Product already has a cover → upload 2 files → cover **unchanged**; new files appended.
4. Product with legacy-only images → upload → catalogue image set behaviour matches the copy shown.
5. Archived product → warning visible before submit.
6. 11 MB file, a `.png` that is really a PDF, a 0-byte file → each rejected with a specific reason.
7. Select the same file twice → one queue row.
8. 3 files, block the second request → "1 of 3 registered", retry only the failed one.
9. Go offline mid-upload → timeout message; form usable again.
10. Keyboard only: Tab → search → Arrow/Enter → file picker → submit.
11. Cancel with a queue → confirmation; browser back → confirmation.
12. Screen-reader pass on the selector, the queue statuses and the dropzone label.

---

## Section 8 — Final Assessment

### 1. What is the real purpose of this page?

It is the **product-photography intake desk**: choose one existing product, choose one or more still images, store them in the configured object store, register them as durable `media_media_asset` rows, and attach them to that product through `media_product_media` — reporting only server-confirmed state. It is *not* the media library, *not* the product media manager, and it does not publish products.

### 2. Is the current implementation functionally complete?

**No.** The happy path is genuinely wired end-to-end (real storage, real rows, server-verified statuses, idempotent retries), but the workflow is incomplete in four places that matter: it cannot see or respect an existing cover, it discards the alt text and caption it collects, it cannot survive or explain a partial batch, and its product picker can be empty or silently limited to 100 products. The employee reuse of the same form is broken outright.

### 3. What is confirmed broken?

Confirmed by code (and reproducible): 001, 002, 003, 004 (API contract), 005 (reactivity), 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 019 (`text-sage`), 021 (sort order also restarts at 0), 023–026.

### 4. What is merely a design or usability weakness?

018 (duplicate headings), 020 (vertical footprint), the banner's engineering-oriented copy, 022, 023, 025 — real friction, but no data consequence. Colour/label polish (019) sits between the two: the undefined `sage` class has a functional effect on status legibility.

### 5. What are the highest-risk issues?

1. **MEDIA-UPLOAD-001** — silent cover replacement on published products.
2. **MEDIA-UPLOAD-003** — "Failed" for media that is already stored, attached and possibly live.
3. **MEDIA-UPLOAD-004** — the first registration switches the product's image source, hiding every legacy image from the storefront.
4. **MEDIA-UPLOAD-002** — the same root cause makes the employee upload lane unusable.
5. **MEDIA-UPLOAD-008** — silent loss of accessibility metadata.
6. **MEDIA-UPLOAD-005/006** — the operator may attach files to the wrong product (or be unable to find the right one).

### 6. What should we fix first, and why?

**P0-A + P0-B in one change** (`MediaUploadForm.handleSubmit` + queue defaults): stop forcing `is_primary`, stop defaulting to `COVER`, and stop calling a partially-applied write "Failed". This removes the customer-visible and state-lying risks, and it also repairs the employee lane. It is the smallest edit with the largest risk reduction, and it needs no backend change. Add the P0-C warning line at the same time.

### 7. Which files would each proposed fix change?

See §6.2. In short: `MediaUploadForm.jsx`, `MediaUploadQueue.jsx`, `MediaProductSelector.jsx`, `productMediaService.js`; additively `useProducts.js`; optionally `apiClient.js` for the timeout batch. **No backend, schema, storage or publishing file changes.**

### 8. What must remain untouched?

The upload/register API contracts, the object-store configuration and key/checksum policy, the media models and schema, the product DTO projections and dual-read fallback, the publishing/approval rules, the authorization gates (admin permission + employee write scope), `ProductMediaManager`, and every existing product row, asset and object. No existing image may be deleted, overwritten or re-written by this work.

---

## Appendix A — Verified NON-issues (do not "fix" these)

| Claim worth testing | Verdict | Evidence |
|---|---|---|
| Advertised formats really supported (JPG/JPEG/PNG/WebP/AVIF) | **Yes, both sides** | `mediaTypes.js:468–489`; `config.py:181–184`; `signatures.py:33–44`; `media_validation.py:290–345` |
| 10 MB limit enforced client **and** server | **Yes** | `mediaTypes.js:472`; `config.py:181`; `upload_service.py:87–97`; `media_validation.py:293–299` |
| File content validated, not just name/MIME | **Yes, server-side** (client is extension/MIME only, by design) | `media_validation.py:325–338`; `upload_service.py:108–120` |
| Multi-select / remove / re-select works | Yes | `MediaUploadDropzone.jsx:73–83`; `MediaUploadForm.jsx` queue handlers 136–160 |
| Backend authorization independent of the UI | **Yes** | `media.py:680, 754, 821`; `dependencies.py:434–505` |
| Storage credentials in the browser | **No** | `mediaApi.js:28–38`; `mediaPaths.js`; storage status redacts bucket |
| Preview blob URLs ever saved as media | **No** — explicitly excluded, and the server requires a real object | `MediaUploadPanel.jsx:123–135`; `productMediaService.js:194`; `media.py:172–207` |
| Orphan object when registration fails | **Largely closed** for the upload route | `media.py:796–805`, `1386–1411` |
| Registered row pointing at a missing object | **Prevented** | `media.py:172–193` (object must exist), delete route 1312–1384 |
| Retry creates duplicate asset rows | **No** — idempotent by object key/checksum | `media_validation.py`/`media_service.py:221–245`; `media.py:179–198`; unique `uq_product_media_asset` |
| This page publishes a product or changes its status | **No** | no product PATCH anywhere in `productMediaService.js` |
| Upload to a missing product | Rejected 404 | `media.py:767–771` |

## Appendix B — Reproduction worksheet

```text
A. Cover theft (001)
   1. Use a product with a registered primary image (or set one in the product media manager).
   2. /super-admin/media/upload → select it → queue 2 images → Upload & Register Media.
   3. GET /media/products/{id}/media-set  → mediaItems[0].isPrimary === true for the NEW file;
      the old primary is now false. GET /products/{slug} → image changed.

B. Empty product picker (005)
   1. Open a new tab directly at /super-admin/media/upload (or hard-reload there).
   2. Click the "Assigned Product" field before GET /admin/products settles
      (throttle the network to make it deterministic).
   3. Dropdown: "No products found matching “”" — and it never recovers.

C. False failure (003)
   1. DevTools → Network → request blocking → block "* /media/register".
   2. Upload one image. The object POST succeeds; the register POST is blocked.
   3. UI chip: "Failed — …". media-set: the media is present and attached.

D. Employee lane (002)
   1. Sign in to the employee portal with media.upload → /employee/media/upload.
   2. DRAFT product + one image → submit.
   3. Server: 422 BUSINESS_RULE_VIOLATION — "Employee uploads cannot become the
      primary image — an administrator sets the primary image for a product."

E. Alt text loss (008)
   1. Queue a file, set Alt text = "Zari border detail", submit.
   2. media-set → altText === null.

F. Progress bar (009)
   1. Upload a 9 MB image on a throttled connection; the bar stays at 0% until completion.
```

---

**End of report.** No implementation was performed. Awaiting explicit approval before any change, and — for MEDIA-UPLOAD-004 — a decision on whether the catalogue image-set switch is intended.
