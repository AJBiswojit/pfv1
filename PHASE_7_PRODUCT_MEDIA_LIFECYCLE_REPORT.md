COMPANY DATABASE MODIFIED: NO
COMPANY DATABASE MIGRATION EXECUTED: NO
AWS/S3 CONTACTED: NO
AWS CREDENTIALS REQUIRED: NO
238 SOURCE FILES MODIFIED: NO

# Phase 7 — Product + Media Lifecycle

## 1. Objective
Phase 7 replaces the Phase 6 object-only media gap with durable media identity and an explicit ordered product-media mapping. New objects are uploaded through the configured provider, verified, registered, and optionally assigned in one frontend-callable API flow. Legacy product image fields remain intact for compatibility.

## 2–3. Architecture before / after
Before, uploads produced only an object-store reference and product JSON fields were the effective source of truth; the media tables were stubs. After, `MediaAssetModel` records the verified object and `ProductMediaModel` is the source of truth for new product associations. The existing resolver and legacy fields remain dual-read for old catalogue data.

## 4. Database migration
`backend/alembic/versions/p7_media_lifecycle.py` upgrades the existing tables in the `pratikshya` schema with object identity, metadata, status, scope, uploader, ordered association, role, primary state, and assignment metadata. It adds uniqueness on object key and product/media pair. It has not been run against any company database.

## 5–6. Models
Media assets store object key/provider, MIME and type, filename, size, SHA-256, optional dimensions and editorial metadata, lifecycle status/scope, uploader, and timestamps. Product mappings store product, asset, role, ordering, primary flag, assigning user, and note. The API clears any existing primary mapping before assigning a new one (application invariant).

## 7–8. Upload and product creation lifecycle
`POST /api/v1/media/products/{product_id}/objects` stores bytes after signature validation. `POST /api/v1/media/register` verifies the object exists, records provider metadata, and may assign it to a product. The response is not success until registration/assignment commits. Product creation and publication continue through existing product APIs and gates; no database/file/JSON hand editing is required for media registration.

Object storage and PostgreSQL are not one atomic transaction. Upload failure creates no registration. Registration failure can leave an orphan object; it is intentionally not deleted automatically. A product failure after upload leaves an unassigned, inspectable object until an operator cleanup policy is applied.

## 9. Employee workflow / 18. Security
Existing `get_current_admin` and `media.upload` permission enforcement remain server-side controls. This change does not broaden employee permissions or invent assignment rules. The existing product authorization/publication endpoints remain authoritative. A future deployment should explicitly grant the existing media permission to only the authorized assigned roles.

## 10. Publication / 11. Storefront
Existing publication rules are untouched. Registered media resolves to the canonical `/api/v1/media/objects/...` endpoint through the provider abstraction. Existing `/images/...` references continue through the legacy fallback resolver.

## 12–13. Storage and S3 readiness
`STORAGE_PROVIDER=local` uses `LocalStorageProvider`; `STORAGE_PROVIDER=s3` selects `S3StorageProvider` through configuration without business-service changes. No AWS request or credential was made.

## 14–15. Admin library and marketing
`GET /api/v1/media/assets` lists durable assets and registration is now real rather than a Phase 6 blocker. Marketing continues to use the same foundation; no legacy product files were implicitly promoted to marketing media. Editorial review tables remain available for later review/approval integration.

## 16. Legacy 238 assets
No files under `frontend/public/images` or `backend/storage/media` were modified. Legacy resolver behavior and legacy product fields remain. Byte-count verification was not run in this environment because this implementation does not require touching those fixtures.

## 17. Consistency model
The object store and database are eventually consistent across the two systems. The registration endpoint refuses nonexistent objects and is idempotent by object key. Failed DB registration is reported as an error and may orphan an object; automatic deletion is deliberately avoided.

## 19–20. Verification
All executed in this environment (results are actual, not projected):

- PASS: full backend suite — `backend/.venv/bin/python -m pytest` → **302 passed, 23 skipped (pre-existing Phase 6 real-dataset skips), 94 subtests passed** (41s). Includes the 25-test Phase 7 lifecycle suite (`backend/tests/unit/test_phase7_media_lifecycle.py`): registration, assignment, primary/cover uniqueness, idempotent re-register, authorization (admin / view-only admin / employee-own / employee-other / customer), resolution, local storage, invalid media (422), unknown object (404), traversal key (422), AVIF and WebP upload→serve round trips.
- PASS: full frontend suite — `cd frontend && npm test` → **208 passed, 0 failed, 1 skipped** (includes the new 21-test Phase 7 suite `frontend/tests/phase7ProductMedia.test.js`).
- PASS: frontend build — `node_modules/.bin/vite build` → built cleanly (2,674 modules).
- PASS: disposable-PostgreSQL E2E — `backend/.venv/bin/python backend/scripts/phase7_pg_e2e.py` → **9/9 steps PASSED**, including `alembic upgrade head` applying the FULL migration chain (10 revisions ending at `p7_media_lifecycle`, single head) to a fresh disposable PostgreSQL provisioned by `pgserver` and removed afterwards.
- PASS: schema verification — verified implicitly by the E2E seed/probe queries against the alembic-created `pratikshya` tables on the disposable cluster.
- BLOCKED: company migration execution, intentionally prohibited (unchanged).

### Frontend Integration + Real Product E2E

**Frontend flows now driven by the server (never browser-local state):**

1. **Unified upload form** (`frontend/src/components/media/MediaUploadForm.jsx`, reachable from admin *Media → Upload* with a product target): each queued file moves through exactly the server-confirmed stages `selected → uploading → uploaded → registering → assigned` (rendered per file in `MediaUploadQueue`), then a final `saving` stage persists the product's media reference fields (`syncProductMediaFromServer`). Failures surface the backend's own message per file and stop the batch — no media id is ever minted client-side. Marketing scope on the same form remains an honest `BACKEND_GAP` notice (no call, no write).
2. **Product media tab on the admin product editor** (`SectionMedia` in `editorSectionsContent.jsx`): for a saved product the admin sees the embedded `ProductMediaManager` panel — registered items read from `GET /media/products/{id}/media-set`, upload+register via the same pipeline (`firstIsPrimary` when the registry is empty), *Set cover* (re-register `COVER` + `is_primary=true`), ↑↓ reorder (re-registered sort orders), each followed by a server re-read that updates the product's `image` / `additionalImages` and the shared catalogue cache. The employee portal keeps its previous read-only link surface — employees still cannot reach the admin media surface (server-enforced 403, pinned by backend tests).
3. **Admin product media page** (`AdminProductMedia.jsx`) is fully server-backed: registry metrics from server media-set items, the manager panel, and the legacy image columns shown read-only (no longer implied to be authoritative when registered records exist).
4. **Admin product detail** (`AdminProductDetail.jsx`) shows "*N registered on the server*" (live media-set read) with the local review-register summary kept as a clearly separate secondary line.
5. **Admin media library** (`AdminMediaLibrary.jsx`) gained a *Durable media registry* panel reading `GET /api/v1/media/assets` — persisted assets with their canonical object keys, MIME type and status — visually above, and clearly distinct from, the legacy browser-side staging desks.
6. **Copy honesty**: `UPLOAD_NOTICE` is now "DURABLE MEDIA PIPELINE ACTIVE" with text that matches the real pipeline; the old "MEDIA REGISTRATION BLOCKED"/demo-mode wording and all ten register stubs were removed from `mediaApi.js`.

**HTTP status / Content-Type evidence (from executed tests + E2E):**

| Step | Endpoint(s) | Observed |
| --- | --- | --- |
| Create draft | `POST /api/v1/admin/products/draft` | 201, `status=DRAFT` |
| Upload AVIF/WebP | `POST /api/v1/media/products/{id}/objects` | 201 each; keys `products/{id}/e2e-cover.avif`, `…/e2e-angle.webp` |
| Register + assign | `POST /api/v1/media/register` (FormData: object_key, product_id, role, sort_order, is_primary) | 201 each; `{assigned:true, assignment{…}}`; DB: 2 MediaAsset + 2 ProductMedia rows, exactly 1 primary |
| Save + re-read | `PATCH`/`GET /api/v1/admin/products/{id}` | 200 / 200; image, gallery, primaryMediaId equal registered references |
| Media-set read model | `GET /api/v1/media/products/{id}/media-set` | 200; `mediaRecordsAvailable=true`, primary-first order |
| Workflow | submit-review → approve → publish | 200 each; final `status=PUBLISHED`, `published=true` |
| Storefront | `GET /api/v1/products/{id}` | 200; `image=/api/v1/media/objects/products/{id}/e2e-cover.avif`, gallery resolved |
| Media bytes | `GET /api/v1/media/objects/...` | 200; `Content-Type: image/avif` with bytes identical to upload; `image/webp` likewise |

**Test results (separated):**
- PASS — backend unit/integration: 302 passed (25 Phase 7 lifecycle tests included), 23 skipped (pre-existing Phase 6 real-dataset skips by design).
- PASS — frontend node:test: 208 passed (21 new Phase 7 tests covering upload, registration, assignment payload, primary, ordering, failure handling, product refresh, stage honesty, registry listing, storefront URL), 0 failed.
- PASS — real E2E on disposable PostgreSQL: `backend/scripts/phase7_pg_e2e.py`, 9/9 steps; cluster and temp object store destroyed after the run.
- BLOCKED — company-database migration and any AWS/S3 contact (intentional, standing constraint).
- NOT RUN — nothing remains not-run in this phase's scope.

## 21. Files changed
Backend:
- `backend/app/models/media/media_asset.py`
- `backend/app/models/media/product_media.py`
- `backend/app/api/v1/media.py` (register handler: real assignment + cache invalidation; media-set dual-read; assets listing)
- `backend/app/schemas/media/media.py` (RegisteredProductMediaItem, mediaItems/primaryMediaUrl)
- `backend/app/services/media/product_media_records.py` (NEW — registered-media read model, bulk loader, primary-first ordering)
- `backend/app/services/media/media_validation.py`, `backend/app/storage/signatures.py` (byte-signature validation: PNG/JPEG/WebP/AVIF, size caps)
- `backend/app/services/catalog/product_service.py` (registered-media projection overrides on admin + storefront, migration-safe read guards)
- `backend/alembic/versions/p7_media_lifecycle.py` (chain linearised under `a2b3c4d5e6f7` after review)
- `backend/tests/unit/test_phase7_media_lifecycle.py` (NEW, 25 tests)
- `backend/tests/unit/test_phase6_media_db.py` (one deliberately-superseded note assertion)
- `backend/scripts/phase7_pg_e2e.py` (NEW — disposable-PostgreSQL E2E proof)

Frontend:
- `frontend/src/services/api/mediaApi.js` (real register/assets/product-media functions + aliases; marketing stubs stay honest BACKEND_GAP)
- `frontend/src/services/media/productMediaService.js` (NEW — orchestration door + stage vocabulary + read-model mapping)
- `frontend/src/components/media/ProductMediaManager.jsx` (NEW — server-backed manager panel)
- `frontend/src/components/media/MediaUploadForm.jsx`, `MediaUploadQueue.jsx` (real product pipeline, per-file server stages)
- `frontend/src/components/products/editorSectionsContent.jsx` (SectionMedia embeds the manager for saved products)
- `frontend/src/pages/admin/media/AdminProductMedia.jsx` (rewritten server-backed), `AdminMediaLibrary.jsx` (durable registry panel), `AdminProductDetail.jsx` (registered count from server)
- `frontend/src/config/mediaTypes.js` (honest notice text)
- `frontend/tests/phase7ProductMedia.test.js` (NEW, 21 tests), `frontend/tests/phase6MediaStorage.test.js` (updated to the superseded contract)
- this report

## 22. Files untouched
All legacy source/media objects, checkout, payments, orders, returns, cart, wishlist, authentication, analytics, Redis, Celery, Docker, and existing product publication logic.

## 23. Remaining limitations
The frontend upload surfaces are now wired to the real pipeline (product scope) with server-confirmed stages; marketing media on the same form deliberately remains an explicit BACKEND_GAP — marketing is a separate explicit assignment the backend does not expose, and product media is never auto-promoted into marketing placements. Video uploads through the product pipeline are validated server-side (image-only register); failure messages surface verbatim. The upload form reports per-file stage transitions, not byte-level progress bars. Primary uniqueness is enforced in the service operation (and bulk-demotion is pinned by tests), not yet with a PostgreSQL partial unique index — that requires a deliberate migration strategy for legacy rows. Employee surfaces were intentionally not widened: employees keep their existing read-only media views and remain server-side forbidden from the admin media surface. The durable-registry review tables (`media_media_review`) remain for a later review/approval integration.

## 24. Operator migration instructions
Review the migration in an isolated disposable PostgreSQL database first:

```bash
cd backend
DATABASE_URL='postgresql+asyncpg://USER:PASSWORD@DISPOSABLE_HOST/DB' alembic upgrade head
```

Verify `pratikshya.media_media_asset` and `pratikshya.media_product_media` columns/indexes, then run the application tests. Only after review should the operator execute the same command with the approved company `DATABASE_URL`. This agent did not execute either company migration or any AWS operation.
