# PRATIKSHYA FASHION — Media Management Revised Implementation Plan

**Status:** Planning only. No source, configuration, database, or behaviour changes made.
**Supersedes:** the implementation sequence in `docs/audit/media-management-root-cause-audit-2026-10-22.md` (the diagnosis remains valid).
**Repository:** `AJBiswojit/pfv1` @ `50ad50b`
**Target surfaces:** `/super-admin/media` and the `/admin/media` twin (same component).

---

## 1. Locked decisions

| # | Decision | Locked interpretation |
|---|---|---|
| 1 | Remove unsupported cards/workflows | **Active, Unmapped, Needs Review, Optimized** are removed. No review/approval, taxonomy or derivative workflow is added. |
| 2 | Product Media / Unassigned | **Product Media** = `scope='product'` **and** a `media_product_media` row exists. **Unassigned** = `scope='product'` **and** no `media_product_media` row. |
| 3 | Duplicates / Large / 8 cards | **Same-byte copies** = assets sharing a SHA-256 with at least one other asset. **Large Files** = `file_size >= 1,572,864` bytes (1.5 MiB). Exactly **8** server-backed cards: Total, Images, Videos, Product Media, Marketing Media, Unassigned, Large Files, Same-byte copies. |
| 4 | Labels | “Marketing Media” → **“Homepage Content”**. “Upload Media” → **“Upload Product Media”**. Upload page messaging becomes image-only and stops promising video. |
| 5 | One inventory | Merge `DurableAssetsPanel` + local “All Media” into one **Registered Media** panel. Keep server search, pagination, and only filters backed by real data (`type`, `assigned`, `unassigned`, `placement`). |
| 6 | Local register | Remove it from **this page only**. Do not modify/delete `mediaStore`, `mediaRepository`, `useMedia`, or other consumers. |
| 7 | States | Explicit **loading, empty, no-match, error, 401, 403**. Cards show `—` until a successful summary load; never `0` for not-loaded/failed. |
| 8 | Namespace check | Batch 0 verifies `hero/`/`marketing/` → `scope='marketing'` and `products/` → `scope='product'` against existing records. **No automatic changes.** |
| 9 | Preserve | Homepage picker behaviour, product-media flows, RBAC, upload validation, existing API defaults. |
| 10 | Out of scope | Security remediation, dead-component deletion, migrations, shared-store refactor, new media architecture, delete UI, review workflow, taxonomy fields, video upload. |

---

## 2. Batch map

| Batch | Purpose | Depends on | Independently verifiable by |
|---|---|---|---|
| **0** | Read-only namespace/scope classification audit | User environment access | Signed classification report; zero writes |
| **1** | Backend read-only summary endpoint | 0 | Backend tests + curl/Swagger |
| **2** | Backend list filters (`type`, `assigned`, `unassigned`, `placement`) | 0 | Backend tests + curl; defaults unchanged |
| **3** | Frontend API client + pure view model | 1, 2 | Node tests (no UI change) |
| **4** | Server-backed 8 cards + summary states in page | 3 | Browser cards; static assertions |
| **5** | One Registered Media panel; remove local inventory UI | 4, 2 | Browser list/search/filters/states |
| **6** | Header/upload labels + image-only messaging | 5 | Browser copy; static assertions |
| **7** | Move placement panel below registry | 5 | Browser; registration refresh |
| **8** | Full verification + plan closure | 1–7 | Full suites + manual matrix |

Batches **1 and 2** can run in parallel after 0. Batches **4 and 5** ship in the same PR but remain separate commits; each can be reverted independently.

---

## 3. Batch 0 — Read-only classification audit

### Goal
Prove how the existing rows are classified before any code assumes `scope` semantics. This directly satisfies decision 8.

### Files
- **No code files.**
- Output: a read-only report appended to `docs/audit/media-management-classification-verification-2026-10-22.md` when executed (new doc, no application change).

### Procedure (read-only)
1. With a Super Admin browser session, call `GET /api/v1/media/assets?page=1&pageSize=200`; repeat only if `total > 200`.
2. For every item record: `objectKey`, `scope`, `mimeType`, `productId`, `status`.
3. Expected classification:
   - `hero/…` → `scope='marketing'`
   - `marketing/…` → `scope='marketing'`
   - `products/…` → `scope='product'`
   - `collections/…`, `uploads/…`, anything else → **flag, do not assume**
4. Produce counts: total, product-mapped, marketing, product-unmapped, images, videos, `status` values, and any mismatches.
5. If DB access is available, use read-only queries for file sizes/checksum groups; otherwise use `GET /media/object-meta/{encodedKey}` per key (read-only) only if needed.
6. **Do not upload, register, delete, reclassify, or update anything.**

### Acceptance criteria
- Every existing asset has a row in the report with key/prefix/scope/productId/expected class/match.
- Mismatch count is explicit. `scope` values are all in `{product, marketing}`; `status` is `uploaded`.
- Expected card values for the current registry are recorded (for the nine listed keys: images 9, product-mapped 4, marketing 5, unassigned 0 — subject to the tenth row).
- No writes performed.

### Dependency / blocker
- If **zero mismatches**: proceed to Batch 1.
- If **any mismatch**: stop and resolve decision **R4** before Batch 1. Recommended default: keep declared `scope` as authoritative in counts, record the mismatch, and add no reclassification/migration.

### Rollback
None required (no changes).

---

## 4. Batch 1 — Backend summary endpoint

### Goal
One read-only request that supplies all eight card values without page-scoped maths.

### Files
- `backend/app/schemas/media/media.py` — add `MediaAssetSummaryResponse`.
- `backend/app/api/v1/media.py` — add `GET /media/assets/summary` (before the list route for readability), permission `media.view`; reuse `MediaAssetModel`, `ProductMediaModel`, existing `get_db`/`get_current_admin`/`require_admin_permission`.
- `backend/tests/unit/test_phase7_media_lifecycle.py` — summary tests.

### Contract
```json
{
  "ok": true,
  "total": 10,
  "images": 10,
  "videos": 0,
  "productMapped": 4,
  "marketing": 5,
  "unassigned": 1,
  "largeFiles": 0,
  "duplicateAssets": 0,
  "duplicateGroups": 0,
  "largeFileThresholdBytes": 1572864,
  "generatedAt": "2026-10-22T00:00:00Z"
}
```
*(Illustrative shape, not asserted data.)*

Rules:
- `total` = every `media_media_asset` row.
- `images`/`videos` = `media_type` (`image` / `video`).
- `productMapped` = `scope='product'` **and** exists in `media_product_media`.
- `marketing` = `scope='marketing'` (includes `hero/` and `marketing/`).
- `unassigned` = `scope='product'` **and** no `media_product_media` row.
- `largeFiles` = `file_size >= 1_572_864` (constant `LARGE_MEDIA_FILE_BYTES`; returned in the payload).
- `duplicateAssets` = number of assets whose `checksum_sha256` appears in a group of ≥2.
- `duplicateGroups` = number of checksum values with ≥2 assets.
- No filters on the summary; counts are always whole-registry.
- Read-only; no commit, no cache invalidation, no writes.
- One SQL statement (or one transaction) so counts are mutually consistent.

### Dependencies
- Batch 0 signed off.

### Acceptance criteria
1. `GET /api/v1/media/assets/summary` → 200 with exactly the keys above; `largeFileThresholdBytes = 1572864`.
2. On an empty DB, every numeric field is `0` and `generatedAt` is present.
3. Mixed fixture test:
   - 2 mapped assets on product A, 1 mapped on product B → `productMapped=3`;
   - 1 product-scope unmapped → `unassigned=1`;
   - 1 `hero/…` + 1 `marketing/…` scope marketing → `marketing=2`;
   - 2 keys with identical bytes → `duplicateAssets=2`, `duplicateGroups=1`;
   - 1 asset ≥ threshold (use a low threshold override only in the test query if supported, or a 1.6 MB fixture) → `largeFiles=1`.
4. `summary.total` equals `GET /media/assets` `total` in the same fixture.
5. No token → 401; employee token → 403; admin with `media.view` only → 200; admin without `media.view` → 403.
6. Existing media tests still pass; list/upload/register/delete responses unchanged.

### Rollback
Revert the batch commit. Endpoint and tests disappear; no migrations, no data changes, no config.

### Risks / mitigation
- Aggregation on SQLite test fixtures: use portable `case` aggregates if `FILTER` is unsupported.
- Duplicate grouping cost: `checksum_sha256` is indexed in the model/migration; the registry is small today.
- Permission drift: reuse `media.view` exactly; do not introduce a new permission.

---

## 5. Batch 2 — Backend list filters

### Goal
Make the surviving tabs real without changing any existing default.

### Files
- `backend/app/services/media/homepage_content_service.py` — extend `normalize_asset_page_filters(...)` with optional, keyword-only `media_type=None, assigned=None, unassigned=None, placement=None`.
- `backend/app/api/v1/media.py` — add query params to `list_media_assets`: `type` (alias `media_type`), `assigned`, `unassigned`, `placement`.
- `backend/tests/unit/test_phase7_media_lifecycle.py` — filter/default/regression tests.

### Semantics
| Param | Values | Effect |
|---|---|---|
| `type` | `image`, `video` | `media_type = value`; anything else 422. |
| `assigned` | `true` | `scope='product'` **and** `EXISTS media_product_media`. |
| `unassigned` | `true` | `scope='product'` **and** `NOT EXISTS media_product_media`. |
| `placement` | `true` | `scope='marketing'` **without** the `hero/` exclusion. |
| `assigned` + `unassigned` | both true | 422. |
| existing `scope` | `product`, `hero`, `marketing` | **Unchanged.** `scope=marketing` still excludes `hero/`; `scope=hero` still returns only hero. |
| existing `q`, `mime`, `page`, `pageSize` | unchanged | Default request must remain byte-compatible in shape/total/order. |

### Dependencies
- Batch 0 signed off.
- Batch 1 not required, but both must be merged before Batch 3 uses the client.

### Acceptance criteria
1. No-parameter `GET /media/assets` returns the same items/order/total/shape as `50ad50b` for the same fixture (regression test).
2. `type=image|video` returns only that media type; `type=audio` → 422.
3. `assigned=true` and `unassigned=true` partition product-scope assets; counts are disjoint and sum to all product-scope assets.
4. Both flags at once → 422.
5. `placement=true` includes `hero/` and `marketing/`; `scope=hero` and `scope=marketing` retain their existing behaviour.
6. Existing picker path (`employee_asset_page` / `RegisteredMediaPicker`) still works; its calls pass none of the new params.
7. Filtered `total` values are correct (not page-length values).

### Rollback
Revert the batch commit. All new params disappear; existing behaviour untouched.

### Risks / mitigation
- Shared helper used by the employee picker: keep new params optional and default no-op; add explicit default tests.
- `type` is a reserved-ish name in FastAPI/Python: use `media_type: Optional[str] = Query(None, alias="type")`.
- SQLAlchemy `NOT EXISTS` correlation: assert partition counts in tests.

---

## 6. Batch 3 — Frontend API client + pure view model

### Goal
Add the client contract and the display logic in a pure, testable module **before** touching the page.

### Files
- `frontend/src/services/api/mediaApi.js`
  - add `apiGetMediaAssetSummary({ scope = "admin" } = {})` → `{ok:true, data}` / `handleError`;
  - extend `apiListMediaAssets` options with `mediaType`, `assigned`, `unassigned`, `placement`; append `type`, `assigned`, `unassigned`, `placement` only when truthy;
  - keep all existing defaults and call signatures.
- **New** `frontend/src/services/admin/mediaRegistryView.js`
  - `LARGE_FILE_BYTES = 1_572_864`;
  - `MEDIA_REGISTRY_TABS` (All, Images, Videos, Product, Marketing, Unassigned) with exact request params;
  - `buildMediaListParams(tabId, { page, pageSize = 24, q = "" })` → `{page,pageSize,q,mediaType?,assigned?,unassigned?,placement?}`;
  - `buildMediaCardModels({ status, summary })` → 8 `{id,label,value,hint,sub,tone?}` objects; **value `"—"` unless `status === "ready" && summary`**;
  - `formatShowingRange({page,pageSize,total,count})` for the footer.
- **New** `frontend/tests/adminMediaRegistry.test.js`
  - mock-fetch tests for both API functions (exact query strings, omission of empty filters);
  - card-model tests: `status=loading|error|unauthorized` → every value `—`; ready with fixture → exact 8 values, `Same-byte copies` sub shows groups;
  - tab mapping tests: Product → `scope=product&assigned=true`, Marketing → `placement=true`, Unassigned → `unassigned=true`, Images/Videos → `type=image|video`.

### Dependencies
- Batches 1 and 2 merged (contracts stable).

### Acceptance criteria
1. `apiGetMediaAssetSummary` returns `{ok:true,data}` on 200 and `{ok:false,error,status}` on failure.
2. `apiListMediaAssets` with defaults sends no new params; with filters sends exactly the expected keys/values.
3. `buildMediaCardModels` returns exactly 8 cards in the locked order and **no numeric `0` when status is not ready**.
4. Tests run with `node --import ./scripts/node-loader/register.mjs --test tests/adminMediaRegistry.test.js` and pass.
5. No page/component behaviour changes in this batch.

### Rollback
Revert the batch commit. API page continues to use the old client; no runtime change.

### Risks / mitigation
- Accidental change to picker request: assert `apiListMediaAssets({page,pageSize})` query equals the previous contract.
- `type` naming: keep the JS option as `mediaType` and map to `type` in the URL.

---

## 7. Batch 4 — Server-backed cards + summary states

### Goal
Replace all twelve local cards with the eight truthful cards, with explicit summary states.

### Files
- **New** `frontend/src/hooks/useMediaRegistry.js`
  - `useMediaSummary({ refreshToken = 0 })` → `{status: "loading"|"ready"|"error"|"unauthorized", summary, error, retry}`;
  - calls `apiGetMediaAssetSummary`; maps 401/403 to `unauthorized`; ignores stale responses; exposes `retry`.
- `frontend/src/pages/admin/media/AdminMediaLibrary.jsx`
  - import `useMediaSummary`, `buildMediaCardModels`, card icons;
  - delete `useMediaMetrics` usage and all twelve `AdminMetricCard`s (`:340-361`);
  - render one 8-card grid;
  - on `loading`: values `—`, hint “Loading…”;
  - on `error`: values `—`, amber banner with message + Retry;
  - on `unauthorized`: replace the card row with an explicit access message; no zeros;
  - on `ready`: values from summary; genuine `0` allowed only here.
  - The old `DurableAssetsPanel` and local All Media remain **temporarily** in this batch; Batches 4 and 5 ship together in the final PR.

### Dependencies
- Batch 3.

### Acceptance criteria
1. Network shows **one** `GET /media/assets/summary` on mount and one per Retry.
2. Exactly eight cards; the removed four labels are absent from the page source.
3. With a fixture summary (`total=10, images=10, videos=0, productMapped=4, marketing=5, unassigned=1, largeFiles=0, duplicateAssets=0, duplicateGroups=0`), cards show `10, 10, 0, 4, 5, 1, 0, 0`.
4. Forced 500 → all cards `—` + error banner; forced 401/403 → explicit message; no `0` in either state.
5. While loading → all cards `—`; no `0`.
6. Genuine empty registry (`total=0`) → cards `0` and no error banner.
7. No import of `useMediaMetrics`; no `metrics.*` left in the page.
8. Browser check at both `/super-admin/media` and `/admin/media`.

### Rollback
Revert the batch commit; the old twelve cards return. No data changes.

### Risks / mitigation
- Double state surfaces during this intermediate commit: acceptable because Batches 4+5 merge together.
- Unauthorized summary while the old list still renders: suppress the old panels when summary is unauthorized to avoid contradictory UI.

---

## 8. Batch 5 — One Registered Media panel

### Goal
Remove the dual inventory. The server registry becomes the only list.

### Files
- `frontend/src/hooks/useMediaRegistry.js`
  - add `useMediaAssetPage({ page, pageSize = 24, tabId = "ALL", q = "", refreshToken = 0 })` → `{status, items, total, page, pageSize, error, retry}`;
  - uses `buildMediaListParams` and `apiListMediaAssets`; maps 401/403; ignores stale responses.
- **New** `frontend/src/components/admin/media/RegisteredMediaPanel.jsx`
  - `AdminPanel` titled “Registered media (N)” only when ready; no `(0)` while loading/error;
  - search input (250 ms debounce, resets page to 1);
  - tabs from `MEDIA_REGISTRY_TABS`; Videos shown truthfully (see R2);
  - grid rows: thumbnail, `objectKey`, `mimeType`, scope label, product name/SKU + “Open product” link when `productId`, status label **Registered**;
  - footer “Showing X–Y of N”;
  - Previous/Next; disable at bounds;
  - states:
    - loading → status text, no list;
    - unauthorized → explicit 401/403 message;
    - error → `role="alert"` + Retry;
    - empty (`total===0 && no filters`) → “No media has been registered yet.” + links to Upload Product Media / Homepage placement art;
    - no-match (`total===0 && filters`) → “No assets match these filters.” + Clear filters;
  - props: `{ refreshToken, prefix, uploadHref, placementHref }`.
- `frontend/src/pages/admin/media/AdminMediaLibrary.jsx`
  - remove `DurableAssetsPanel` (the function) and the entire local All Media section:
    - `useMediaLibrary`, `useMediaActions`, `TABS`, `matchesTab`, `filtered`, `selected`, `bulk`, status/category/usage states, bulk bar, checkboxes, local-only chips, footer;
    - imports `taxonomyRepository`, `catalogRepository`, `MEDIA_STATUS_OPTIONS`, `USAGE_ROLE_OPTIONS`, `MediaThumb` (if unused), `StatusBadge` (if unused);
  - render `<RegisteredMediaPanel refreshToken={registryRefresh} prefix={prefix} ... />`;
  - keep the page header as-is until Batch 6; keep `PlacementAssetPanel` until Batch 7, still calling `onRegistered` → `registryRefresh`.
- `frontend/tests/adminMediaRegistry.test.js`
  - source assertions: no `useMediaLibrary`, `useMediaMetrics`, `useMediaActions`, `Durable media registry`, `backend media service is not active`, `INTEGRATION_AUDIT.md`, bulk-bar labels, dead tabs;
  - list-state helper tests (empty vs no-match, title count only when ready).

### Dependencies
- Batch 4.
- Batch 2 filters.

### Acceptance criteria
1. One inventory only. No “Durable media registry” panel and no local “All Media”.
2. Panel total equals `GET /media/assets` `total`; displayed items equal the current page.
3. Search by object key and by product SKU returns server results; clearing resets to page 1.
4. Tabs:
   - All → no filter;
   - Images → `type=image`;
   - Videos → `type=video` (truthful empty/no-match);
   - Product → `scope=product&assigned=true`;
   - Marketing → `placement=true` (hero + marketing);
   - Unassigned → `unassigned=true`.
5. Pagination uses 24/page, correct range, disabled bounds.
6. States verified: loading, empty, no-match, 500+Retry, 401, 403. No numeric `0` anywhere before a successful list response.
7. Product-mapped rows show a working `Open product` link to `${prefix}/products/{productId}/media`.
8. Status displays `Registered`, not raw `uploaded`.
9. Source contains no local-only labels, no four removed card names, no `INTEGRATION_AUDIT.md`.
10. `RegisteredMediaPicker` and product-media pages unchanged; their tests pass.
11. Placement registration still increments `registryRefresh` (temporarily used by the new panel).

### Rollback
Revert the batch commit; Batch 4 cards + the previous panels return. No data changes.

### Risks / mitigation
- Large diff: isolate to one page + one new component + one hook; no shared component edits.
- Homepage picker regression: same endpoint, no default changes; run `phase7ProductMedia` and homepage tests.
- Empty vs no-match: use request success + `hasFilters`, never `items.length` alone.

---

## 9. Batch 6 — Labels and upload-page messaging

### Goal
Make the two header actions and the upload page describe what they actually do.

### Files
- `frontend/src/pages/admin/media/AdminMediaLibrary.jsx`
  - header link label “Marketing Media” → **“Homepage Content”** (same destination);
  - header button label “Upload Media” → **“Upload Product Media”** (same destination).
- `frontend/src/pages/admin/media/AdminMediaUpload.jsx`
  - title **“Upload Product Media”**;
  - description: image-only, registered against a product, visible when published;
  - import `MEDIA_SCOPES`; render `<MediaUploadForm portalType="admin" initialScope={MEDIA_SCOPES.PRODUCT} allowScopeChange={false} onSuccessRedirect={...} />`.
- `frontend/src/components/media/MediaUploadForm.jsx`
  - copy-only correction of the false sentence “no backend API yet” (`:377-378`): state that marketing placement art is registered from the Homepage placement art panel and is never auto-promoted.
  - **Do not** remove the shared marketing branch or change its defaults.
- `frontend/tests/adminMediaRegistry.test.js`
  - static assertions for the new labels/description and absence of “image and video” on the upload page.

### Dependencies
- Batch 5.

### Acceptance criteria
1. Header reads **Homepage Content** and **Upload Product Media**; destinations unchanged.
2. Upload page title and description mention product media and images only; no video promise.
3. Admin upload page shows no Product/Marketing destination switch.
4. Shared form still works for other callers; no default prop changes.
5. No “no backend API yet” string in the upload form.
6. Homepage Content page title remains “Homepage Content Control Center”.

### Rollback
Revert the batch commit; labels/copy return, functionality unchanged.

### Risks / mitigation
- Shared form used by employee/product surfaces: change only the admin page props; copy edit is wording-only.
- Tests asserting old strings: update only the affected assertions.

---

## 10. Batch 7 — Placement panel placement

### Goal
Prioritise inventory and put homepage art registration in a secondary position.

### Files
- `frontend/src/pages/admin/media/AdminMediaLibrary.jsx`
  - render `<PlacementAssetPanel ... />` **after** `<RegisteredMediaPanel ... />`;
  - keep the `onRegistered` refresh wiring.
  - Optional (decision R3): wrap in a disclosure titled “Advanced: homepage placement art”.
- `frontend/src/components/admin/media/PlacementAssetPanel.jsx`
  - title **“Homepage placement art (hero/ and marketing/)”**;
  - description clarifies: register here, then attach in Homepage Content;
  - no handler/API changes.

### Dependencies
- Batch 5 (refresh token + order).
- Batch 6 for header labels (visual consistency).

### Acceptance criteria
1. Registered media is the first content panel after the cards; placement art is below it.
2. Upload-and-register still creates a durable asset and immediately refreshes the registry list without a page reload.
3. Register-existing still works; duplicate registration is a no-op; invalid namespace/missing object messages unchanged.
4. Homepage picker still sees newly registered `hero/`/`marketing/` assets.
5. No changes to `mediaApi`, backend routes, or object storage.

### Rollback
Revert the batch commit; panel returns to its previous position.

### Risks / mitigation
- Losing the refresh callback during the move: assert the new asset appears after registration in the manual check.
- Collapsible wrapper hiding errors: keep feedback visible inside the disclosure; if collapsed, surface a summary count. If this is undesirable, keep it expanded (default recommendation).

---

## 11. Batch 8 — Full verification and closure

### Files
- `frontend/tests/adminMediaRegistry.test.js` — final assertions.
- `docs/audit/media-management-root-cause-audit-2026-10-22.md` — mark resolved items with the batch/commit reference.
- `docs/audit/media-management-revised-implementation-plan-2026-10-22.md` — execution log/status.
- No application-code changes in this batch.

### Automated verification
```bash
cd backend
python -m pytest tests/unit/test_phase7_media_lifecycle.py -q
python -m pytest tests/unit/test_phase6_media_db.py tests/unit/test_marketing_media.py -q

cd ../frontend
node --import ./scripts/node-loader/register.mjs --test tests/phase7ProductMedia.test.js
npm test
```

Required assertions:
- Summary fixtures from Batch 1 pass.
- Filter partition/default tests from Batch 2 pass.
- View-model tests: not-ready → `—`; ready → exact eight values.
- Page source: no local inventory, no false copy, no removed cards.
- Existing suites unchanged.

### Manual matrix
| Check | Expected |
|---|---|
| Super Admin, `/super-admin/media` | 8 cards; total equals registry total |
| Admin, `/admin/media` | Same; prefix links `/admin/...` |
| Reload + second browser | Counts persist; no local storage dependency |
| Summary 500 / offline | Cards `—`; error banner + Retry |
| Summary/list 401 | Session-expired message; no zeros |
| Summary/list 403 | Permission message; upload controls hidden/disabled |
| Genuine empty registry | Cards `0`; empty-state copy; links work |
| Filter no-match | No-match copy + Clear; no misleading empty state |
| Search by SKU / object key | Server results; page resets |
| Product link | Opens `${prefix}/products/{id}/media` |
| Product upload | Registry total increments after return/reload |
| Placement upload+register | Appears in list immediately; homepage picker sees it |
| Duplicate registration | “Already registered”; no second row |
| Invalid key/type/size | Server message; no row |
| Homepage Content page | Unchanged; hero/section flows work |
| Viewer without media.upload | Page readable; mutations hidden/disabled; forced calls 403 |
| Responsive 390/768/1280 | Cards wrap; tabs/search usable; no overflow |

### Acceptance criteria
- No card renders `0` unless the summary request succeeded and the server returned `0`.
- The list never claims the API is inactive or cites `INTEGRATION_AUDIT.md`.
- Only filters/tabs backed by the new server params remain.
- No out-of-scope file changed.
- All commands pass.

### Rollback
Revert test/doc commits only; no runtime effect.

---

## 12. Cross-batch regression guardrails

- **Do not edit:** `frontend/src/services/media/mediaStore.js`, `mediaRepository.js`, `hooks/useMedia.js`, `EmployeeMediaDashboard.jsx`, product pages, homepage content APIs, backend models/migrations, RBAC, validation, storage.
- **Do not change:** existing API defaults for `GET /media/assets`, `GET /media/products/{id}/media-set`, `POST /media/*`, `/admin/marketing/media*`.
- **Do not add:** migrations, new tables, background jobs, permissions, delete UI, review workflow, category/usage fields, video upload.
- **Do not remove:** dead components/routes (`AdminMediaDetail`, `AdminMediaProductMapping`) in this workstream.
- **Do not mutate records:** Batch 0 is read-only; no reclassification script.

---

## 13. Remaining product decisions

These do not block Batch 1 unless marked. Defaults are recommended; if you accept the defaults, no further reply is needed for them.

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| **R1** | “Same-byte copies” card: primary number = assets involved or checksum groups? Are duplicates counted across all scopes? | **Assets involved**, sub-line shows **N checksum groups**; count across all scopes. | Batch 5 (card rendering) |
| **R2** | Videos tab: visible+enabled and may show “no matches”, or hidden/disabled with “video upload not enabled”? | **Visible and enabled**; backend supports `type=video`, and a truthful empty result is acceptable. Card hint states upload is not enabled. | Batch 5 |
| **R3** | Placement panel layout: below registry expanded, or inside a collapsible “Advanced” disclosure? | **Below registry, expanded** first; collapse can be added later. Keeps errors/feedback visible. | Batch 7 |
| **R4** | If Batch 0 finds `scope`/namespace mismatches: count by declared `scope` with a recorded warning, or pause for a separate reclassification decision? | **Use declared `scope`, record the mismatch, do not mutate.** Any reclassification is a separate approved data task. | Batch 1 (only if mismatches exist) |
| **R5** | Confirm the Marketing card/tab includes both `hero/` and `marketing/` art. | **Yes** — `marketing` scope = all placement art; `placement=true` filter. | Batch 5 |
| **R6** | Status label for `uploaded` rows. | Display **“Registered”**; keep raw `uploaded` in the API. | Batch 5 |
| **R7** | Confirm no per-asset delete/edit action in this implementation; no page-size change (24). | **No delete/edit**; keep 24/page and existing server search semantics. | Batch 5 |

---

## 14. Approval gate

- Batch 0 is read-only and requires access to the running admin session/database for verification.
- No Batch 1 work starts until you approve this revised plan.
- If you approve the recommended defaults for R1–R7, state that explicitly; otherwise name the alternatives.
- The first code change will be **Batch 1 only** (backend summary endpoint + tests).

---

## 15. Amendment A1 — Batch 8 acceptance criteria, environment limits and verification record

Appended 2026-10-22. **This section is additive.** §1–§14 above are unchanged and §11 remains the definition of Batch 8's *scope*; where §11's *acceptance wording* conflicts with this section, this section governs, because the literal §11 wording was found unsatisfiable in the available environment (see A1.2 and A1.3).

### A1.1 Acceptance criteria (replace "all commands pass")

Batch 8 is accepted when **all six** hold. Each is independently checkable.

| # | Criterion | How it is judged |
|---|---|---|
| **C1** | Backend tests execute and pass **only if** the backend dependency set is installed. | A suite that skips for a missing package (e.g. `aiosqlite`) is **not** a pass. If the runner itself is absent, the criterion is reported **BLOCKED / NOT RUN**, never "pass". |
| **C2** | The frontend failure set is **identical** to a pristine-`50ad50b` baseline captured in the same environment. No new failure may appear. | Compared by failure **identity** (file + test name), not by count. A reduction in failures is **not** progress and does not offset any new failure. |
| **C3** | No application-code change in Batch 8. | `git status` changed set = the single new test file + the two approved audit documents. |
| **C4** | Truthfulness invariants hold. | No `0` is displayed unless a successful response returned zero; no claim that the backend is inactive and no `INTEGRATION_AUDIT` citation; every filter and tab is server-backed. |
| **C5** | Five evidence classes are reported separately. | Static inspection · unit tests · backend tests · build · browser — each stated as its own result. One class never substitutes for another. |
| **C6** | No false green. | Any command that could not run is reported **BLOCKED** with its exact error text. Baseline match is never presented as runtime verification. |

### A1.2 Corrected test path

§11 named `frontend/tests/adminMediaRegistry.test.js`. That directory is git-ignored (`frontend/.gitignore:23` → `tests/`), so a file created there would be invisible to `git status` and to review. The suite therefore lives at:

```
frontend/test/adminMediaRegistry.test.js
```

`frontend/test/` is tracked, is matched by the `npm test` glob (`"tests/*.test.js" "test/*.test.js"`), and is where the other media suites already live.

### A1.3 Environment prerequisites and verification limitation

Recorded from the environment in which Batch 8 was verified.

| Prerequisite | State at verification | Consequence |
|---|---|---|
| Python backend deps (`fastapi`, `sqlalchemy`, `aiosqlite`, `pytest`, …) | **Absent.** `backend/requirements.txt` pins 36 packages but nothing is installed; `pytest` itself is unpinned and no CI workflow exists. | Backend suites **cannot execute**. `python3 -m pytest …` → `No module named pytest`. |
| `frontend/node_modules` | **Absent**; `package-lock.json` present; no global `vite`. | `npm run build` → `sh: 1: vite: not found`. React-dependent suites fail to import. |
| Browser / Playwright renderer | **Absent.** | No browser verification of any kind is possible. |
| Dependency installation | **Not authorised** (owner decision Q3), and package manifests must not change. | The two gaps above are structural for this batch, not oversights. |

**Verification limitation (explicit).** Static inspection and pure-Node unit tests prove what the *source* says. They cannot prove that a running FastAPI process returns a given payload, that Vite bundles the page, or that a browser renders it. Backend-runtime and browser findings therefore remain unproven regardless of how many assertions pass, and are marked accordingly in the resolution log (§13 of the root-cause audit).

### A1.4 Batch reference convention

There are no per-batch commits in this branch: the branch carries a single merge commit and all batch work is uncommitted. Batch references are therefore recorded as:

> **Batch N — uncommitted working-tree change @ `50ad50b`** (`50ad50bcaf496cb46771ced22c46e89091a10524`)

No commit hash is invented for any batch.

File-level attribution below follows the batch map in §2 and the per-batch text in §3–§11. **It is a declaration, not a git-verifiable fact:** because no batch was committed, `git log` cannot attribute any path to any batch. Batch 8's own row is the only one that can be proven directly (the test file did not exist at `50ad50b`).

| Batch | Files (working tree @ `50ad50b`) |
|---|---|
| 0 | `docs/audit/media-management-classification-verification-2026-10-22.md` |
| 1 | `backend/app/api/v1/media.py`, `backend/app/schemas/media/media.py`, `backend/tests/unit/test_phase7_media_lifecycle.py`, `frontend/src/services/admin/mediaSummaryService.js`, `frontend/src/services/api/mediaApi.js`, `docs/audit/media-management-batch1-summary-endpoint-2026-10-22.md` |
| 2 | `backend/app/services/media/homepage_content_service.py`, `backend/app/api/v1/media.py`, `frontend/src/services/admin/mediaAssetPageService.js`, `frontend/src/hooks/useMediaRegistry.js` |
| 3 | `frontend/src/services/admin/mediaRegistryView.js`, `frontend/src/pages/admin/media/AdminMediaLibrary.jsx` |
| 4 | `frontend/src/components/admin/media/RegisteredMediaPanel.jsx`, supporting tests |
| 5 | `AdminMediaLibrary.jsx`, `RegisteredMediaPanel.jsx`, terminology copy, tests |
| 6 | `frontend/src/pages/admin/media/AdminMediaUpload.jsx`, `frontend/src/components/media/MediaUploadForm.jsx` |
| 7 | `frontend/src/components/admin/media/PlacementAssetPanel.jsx`, `AdminMediaLibrary.jsx`, tests |
| **7A** | `frontend/src/services/media/mediaAccess.js`, `RegisteredMediaPanel.jsx`, `frontend/test/mediaAccessPermissions.test.js`, three fixtures |
| **8** | **`frontend/test/adminMediaRegistry.test.js` (new)**, this document (§15), `docs/audit/media-management-root-cause-audit-2026-10-22.md` (§13) |

### A1.5 Batch 8 — delivered and verified

**Batch 8 — uncommitted working-tree change @ `50ad50b`.**

Delivered: one test suite, 18 tests, no new dependency, no application-code change.

Coverage, mapped to §11 scope:

1. Summary endpoint: route exists, is read-only, guarded by `media.view`, response schema carries every aliased field, threshold constant has one source; client calls `/api/v1/media/assets/summary` and returns the body verbatim.
2. Card values: not-ready → `—` (loading, error, unauthorized, undefined); a successful response → the exact eight values; a genuine zero body → eight real `0`s; one missing field → that card alone is `—`.
3. Registry filters: default request unchanged (`page=1&pageSize=50`, no filter key); `ALL` adds nothing; all six tabs map to distinct real server parameters; `assigned`/`unassigned` are mutually exclusive and `placement` is the whole marketing scope (checked against `homepage_content_service.py`); boolean filters are omitted unless enabled.
4. Truthfulness: page and panel hold no local inventory (`mediaStore`/`mediaRepository`/`localStorage`/own list fetch); no `INTEGRATION_AUDIT`, "not active", or undefined-card copy.
5. Structure: eight cards and six tabs present, ordered, unique.
6. Non-regression of neighbours: existing `mediaApi` exports and legacy `pageSize = 50`; homepage registered-media picker signature, call and employee URL unchanged.

**Evidence classes — reported separately, as C5 requires.**

| Class | Result |
|---|---|
| **Static inspection** | Performed against `media.py`, `homepage_content_service.py`, `schemas/media/media.py`, the page, the panel and the view-model. Summarised in root-cause §13. |
| **Unit tests (frontend, pure Node)** | New suite **18/18 pass**. Full suite **644 tests / 622 pass / 21 fail / 1 skip**. |
| **Baseline (same environment, pristine `50ad50b` in a temporary worktree)** | **512 tests / 490 pass / 21 fail / 1 skip**. Delta: **+132 tests, +132 pass, 0 new failures, 0 fixed**; failure identities compared line-by-line and **identical**. |
| **Backend tests** | **BLOCKED / NOT RUN.** `python3 -m pytest tests/unit/test_phase3_product_media.py -q` → `No module named pytest`. `python3 -c "import fastapi, sqlalchemy, aiosqlite"` → `ModuleNotFoundError: No module named 'fastapi'`. `py_compile` succeeds, which is **syntax only and not a test run**. No suite was skipped for `aiosqlite`; collection never began. |
| **Build** | **BLOCKED.** `npm run build` → `sh: 1: vite: not found`; `node_modules` absent. Parsing JSX is not a build. |
| **Browser** | **NOT PERFORMED.** No renderer available; the 17-row matrix (Q4) remains outstanding and is **not waived**. |

**Failure classification of the 21** (identical in baseline and current tree, so all pre-existing):

| Class | Count | Detail |
|---|---|---|
| Environment — `ERR_MODULE_NOT_FOUND: Cannot find package 'react'` | 11 | `accountScreen{InstagramRewards,Preferences,Security,Settings}`, `customerAccountLayout`, `passwordReset`, `adminCategoryDraftEdit`, `adminDashboardRenderRegression`, `portalSidebarCollapse`, `recommendationRendering`, `shopFeaturedEditRender`. Caused by the absent `node_modules`, not by Batch 8. |
| Genuine broken import | 1 | `tests/unifiedLogin.test.js` — `isSuperEmployeeAccount` is not exported. |
| Genuine assertion failures | 9 | `accountScreensRouting` (1, `ENOENT …/home-page/src/pages/Account.jsx`), `employeeLoginRouting` (2), `rbacContract` (3), `regressionAuthRbacFix` (3). |

Per standing instruction, these baseline failures were **not** fixed.

### A1.6 Outstanding verification after Batch 8

1. **17-row browser matrix** — outstanding, not waived (Q4). No row is claimed as verified.
2. **Backend runtime** — the summary endpoint's live payload, permission enforcement and SQL behaviour are unexecuted.
3. **Build** — the page has never been bundled by Vite in this environment.
4. **Live data** — the real card values, `namespaceClassification` counts and checksum groups are unmeasured; the only values asserted are fixtures.
5. **Carried concerns** (reported, not fixed): `MediaUploadForm.jsx:48` admin `canManageMarketing` bypass; `media.assign` has no server-side gate; the UI is stricter than the API for `media.edit`.

Batch 8 ends here. No further batch is authorised.

---

## 16. Batch 9 — Consolidated media security & integrity remediation

Appended 2026-10-22. **Additive.** §1–§15 are unchanged; §15's acceptance criteria still govern evidence reporting.

**Batch 9 — uncommitted working-tree change @ `50ad50b`.**

### 16.1 Scope delivered

| Finding | Classification | Change |
|---|---|---|
| **A-15 / S-06** — existing key reused without a byte check | **Confirmed defect → fixed** | New pure module `app/services/media/media_integrity.py`; both registration paths reject a checksum disagreement with 409 and mutate nothing. |
| **S-07** — orphaned objects after partial failure | **Partially resolved** | Ownership rule made explicit and testable; compensation already covered every create-and-register path. Two-step generic upload remains unresolved **by design**. |
| **A-13 / S-04** — public object route ignores product status | **Pre-existing risk, by design → not changed** | Visibility contract documented and pinned by tests. Fixing it is API-breaking; **approval required**. |
| **`media.manage` / `canManageMarketing` bypass** | **Confirmed inconsistency → fixed** | Marketing authority now resolved from grants, not from session type. |
| **`media.assign` server gate** | **Not reproducible** | Already enforced on marketing update/reorder and hero writes. |
| **`media.edit` UI vs API** | **Not a live mismatch** | No route requires it; its only consumers are in the unreachable `AdminMediaDetail.jsx`. |

### 16.2 Files changed

**Six code/test files** (three modified, three new):

| File | State | Nature |
|---|---|---|
| `backend/app/services/media/media_integrity.py` | new (120 lines) | Pure guards: `checksum_conflict`, `is_sha256_hex`, `should_compensate`, `compensation_report`. No I/O, no framework imports. |
| `backend/app/api/v1/media.py` | +12 / −1 | Guard before idempotent reuse in `_register_product_asset`; compensation delegates to `should_compensate`. |
| `backend/app/services/media/placement_asset_service.py` | +10 / −1 | Same guard on the placement re-register branch. |
| `backend/tests/unit/test_media_integrity_guards.py` | new (132 lines) | 15 stdlib-`unittest` cases. |
| `frontend/src/components/media/MediaUploadForm.jsx` | +9 / −1 | `canManageMarketing` from resolved grants. |
| `frontend/test/mediaSecurityContracts.test.js` | new (223 lines) | 16 static/pure contract tests (A, B, C, D). |

Plus the batch's documentary record: this section and §14 of the root-cause audit.

No schema change, no migration, no new dependency, no route added or removed, no response shape changed, no permission code added or renamed. `mediaAccess.js` and the eight cards / six tabs / search / pagination were **not** touched.

### 16.3 Evidence, by class (C5)

| Class | Result |
|---|---|
| **Static inspection** | Route bodies, RBAC table, provider metadata and every caller read in full before editing. |
| **Unit — backend (executed)** | `python3 -m unittest tests.unit.test_media_integrity_guards` → **15 tests, 15 pass**. Runs on the standard library: the guard module imports no third-party package, so this evidence does **not** depend on the missing backend dependency set. |
| **Unit — frontend (executed)** | `mediaSecurityContracts.test.js` **16/16**; `mediaAccessPermissions.test.js` **19/19**; full suite **660 / 638 pass / 21 fail / 1 skip**. |
| **Baseline comparison** | Pre-batch same-environment run: **644 / 622 / 21 / 1**. Delta **+16 tests, +16 passes**. Failure identities compared line-by-line: **identical — zero new, zero fixed**. |
| **Backend runtime** | **BLOCKED.** `python3 -m pytest …` → `No module named pytest`; `python3 -c "import fastapi"` → `ModuleNotFoundError`. The 409 path is **not** runtime-verified. |
| **Build** | **BLOCKED.** `npm run build` → `sh: 1: vite: not found`. `esbuild` parse of the edited JSX succeeded — syntax only, explicitly not a build. |
| **Browser** | **NOT PERFORMED.** The 17-row matrix remains outstanding, not waived. |

### 16.4 Integrity note

During this batch the Batch 7A suite `frontend/test/mediaAccessPermissions.test.js` was accidentally overwritten while adding a new suite. It was restored from the pre-batch working-tree patch; `git hash-object` now returns `e0893da…`, exactly the blob recorded in that patch, and a full-tree diff against the reconstructed pre-batch state shows **no difference** in that file. It runs 19/19. The new coverage written in its place was discarded rather than merged, so the batch contains no duplicate suite.

### 16.5 Outstanding after Batch 9

1. **A-13 / S-04** — needs an explicit visibility decision (approval required; API-breaking).
2. **S-07 two-step flow** — objects abandoned between upload and registration remain in storage by design.
3. **Backend runtime, build, browser matrix** — unchanged gaps.
4. Carried, unfixed: `media.assign` has no route gate in the product path (by contract), `media.edit` has no server route (by contract).

Batch 9 ends here. No further batch is authorised.

---

## 17. A-13 / S-04 — deployment verification outcome and remediation status

Appended 2026-10-22. **Additive; documentation only.** §1–§16 are unchanged. The full evidence is in `docs/audit/media-management-root-cause-audit-2026-10-22.md` §15; this section records the consequence for the plan.

**Reference:** *Batch 10 (documentation only) — uncommitted working-tree change @ `50ad50b`.*

### 17.1 Decision recorded

**Option 1 is accepted on a temporary basis only. A-13 / S-04 remains OPEN.**

| | |
|---|---|
| Code-level visibility weakness | **Confirmed** — the object route performs no ownership, publication or scope check, and its handler takes no database session (`backend/app/api/v1/media.py:496-540`, `:543-561`, `:563-581`). |
| Actual production exposure | **UNVERIFIED** — production configuration was not observable from the verification environment. |
| Permanent acceptance | **No.** |
| Remediation approved | **None.** R1–R3 are proposals only. |

### 17.2 Why the plan's earlier assumption does not hold

§3–§11 assumed the public object route was the single serving path. The deployment check shows that is only true in development:

- Under `APP_ENV=production`, a CDN origin is **mandatory** — an empty `MEDIA_CDN_BASE_URL` is a fatal startup error (`backend/app/storage/environment.py:141-159`, escalated at `:255-275`, invoked from `backend/app/main.py:104-116`).
- Production also refuses non-S3 storage (`environment.py:130-139`).
- When a CDN origin is set, `build_media_url()` emits `{cdn}/{key}` (`backend/app/storage/urls.py:71-82`), and the frontend does the same (`frontend/src/services/media/mediaPaths.js:141-168`).

So the production media path is CDN → S3, and **the application is not in it**.

### 17.3 Remediation assessment

**R-A** (product-status checks on `GET`, `HEAD` and metadata) is:

- **Effective** only on the development path, where requests actually reach FastAPI.
- **Ineffective** on a direct-to-S3-origin CDN path — the CDN serves the object by key and no Python code runs.
- **Defence-in-depth at best**, and must not be reported as closing the finding.

It is therefore **withdrawn as *the* remediation** for A-13/S-04. It may still be worth implementing later as hardening for the API path; that is a separate decision and is **not** approved here.

### 17.4 Proposals awaiting approval

Recorded for decision. **Not implemented. Not claimed to close the finding.**

| Ref | Proposal | Smallest compatible form | Approval needed |
|---|---|---|---|
| **R0** | Document and request deployment evidence. | Zero code; root-cause §15 is its documentation half. | — (executed as this section) |
| **R1** | Prefix separation for unpublished objects, promoted on publish. | Write path + publish transition; published URLs unchanged. | **Yes** |
| **R2** | CloudFront signed URLs / edge authorisation by product status. | Owned by URL producers; invalidates public caching. | **Yes** |
| **R3** | Confirm Block Public Access + OAC; assert bucket privacy at startup/readiness. | Deployment + one readiness check. | **Yes** |

**Ordering constraint:** there is no CloudFront invalidation in the codebase, and cached content-addressed objects can live for **one year** (`backend/app/storage/urls.py:43`, written at `backend/app/storage/s3.py:234-235`). Any of R1–R3 must be in place before unpublished art is written to the served namespace, or existing cached copies must be purged — which is a new capability needing its own approval.

### 17.5 Condition for reopening A-13/S-04

The finding moves from **OPEN (unverified exposure)** to a decided state only when the five non-secret items in root-cause §15.10 are answered. The decisive one is which serving path production uses: if production is not deployed (as the S3/CDN plan states), the exposure is **latent** and R1/R2 can be designed before any object is written.

### 17.6 Batch-record convention, unchanged

No per-batch commits exist. This section and root-cause §15 are the *"Batch 10 (documentation only) — uncommitted working-tree change @ `50ad50b`"* record. No commit hash was invented.

### 17.7 Outstanding after this step

1. **A-13 / S-04** — OPEN; awaiting the five deployment evidence items.
2. **R1–R3** — unapproved proposals.
3. **Backend runtime** — **BLOCKED** (`No module named pytest`; `import fastapi` → `ModuleNotFoundError`).
4. **Production build** — **BLOCKED** (`vite: not found`).
5. **17-row browser matrix** — outstanding, **not waived**.
6. **S-07 two-step flow** — objects abandoned between upload and registration remain in storage by design (see root-cause §14.1).

No implementation batch is authorised. This step changed two documents and nothing else.
