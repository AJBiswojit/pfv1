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
- PASS: Python compilation (`python -m compileall -q backend/app`).
- PASS: `git diff --check`.
- NOT RUN: disposable PostgreSQL/Alembic upgrade (no disposable PostgreSQL instance was started).
- NOT RUN: full pytest, npm test, npm build, and authenticated end-to-end lifecycle (requires configured services and database).
- NOT RUN: schema verification and HTTP 200/content-byte E2E.
- BLOCKED: company migration execution, intentionally prohibited.

## 21. Files changed
- `backend/app/models/media/media_asset.py`
- `backend/app/models/media/product_media.py`
- `backend/app/api/v1/media.py`
- `backend/alembic/versions/p7_media_lifecycle.py`
- this report

## 22. Files untouched
All legacy source/media objects, checkout, payments, orders, returns, cart, wishlist, authentication, analytics, Redis, Celery, Docker, and existing product publication logic.

## 23. Remaining limitations
The existing frontend upload surfaces still need wiring to call registration after upload and display its state transitions; the backend capability is now available. Employee-specific product assignment enforcement should be exercised against the project's configured role fixtures. Primary uniqueness is enforced in the service operation, not yet with a PostgreSQL partial unique index (which would require a deliberate migration strategy for legacy rows).

## 24. Operator migration instructions
Review the migration in an isolated disposable PostgreSQL database first:

```bash
cd backend
DATABASE_URL='postgresql+asyncpg://USER:PASSWORD@DISPOSABLE_HOST/DB' alembic upgrade head
```

Verify `pratikshya.media_media_asset` and `pratikshya.media_product_media` columns/indexes, then run the application tests. Only after review should the operator execute the same command with the approved company `DATABASE_URL`. This agent did not execute either company migration or any AWS operation.
