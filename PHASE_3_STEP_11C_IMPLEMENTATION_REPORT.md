# Phase 3 Step 11C — Product / Media / Taxonomy Integration Journey

**Date:** 2026-08-29  
**Branch:** `arena/01a04924-pfv1`  
**Scope:** Phase 3 Step 11C only  
**Verdict:** **PASS — the focused Step 11C journey passes; all requested final checks were run, with the environment-gated PostgreSQL/media-dataset skips recorded below.**

## 1. Scope and non-goals

This step adds only:

1. `backend/tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py`;
2. this implementation report.

The application, routers, services, Pydantic schemas, ORM models, migrations,
exception handlers, lifecycle semantics, and response contracts were not
changed for Step 11C. In particular, this step does **not** reimplement Step
11A, Step 11B, R5 Stage 2, PF3-N07, Phase 4, or any deferred redesign.

## 2. Harness and evidence boundary

The test imports and exercises the production `app.main:app` object. It does
not build a parallel FastAPI application and does not call product or taxonomy
services directly for the journey. The only dependency overrides are:

- a disposable `sqlite+aiosqlite` database session, including the repository's
  existing `pratikshya` schema-attachment pattern;
- the authenticated admin identity, loaded from the same disposable database.

The real production router graph handles every operation. The test seeds a
real admin user, role, and the six required RBAC permissions:
`categories.create`, `categories.edit`, `categories.archive`, `products.view`,
`products.manage`, and `media.upload`.

The real local storage provider writes to a `TemporaryDirectory`. The fixture
is a signature-valid 1x1 PNG copied from the established Phase 7 harness; the
unavailable `cotton-fixture.avif` dataset is not required or modified. The
external PostgreSQL, Redis, browser, and S3/CDN paths were not used.

`DATABASE_URL` was unset in this environment, so PostgreSQL verification is
**SKIPPED / NOT VERIFIED**. The PostgreSQL media-schema module retains its
existing environment-gated skip. SQLite semantics are **VERIFIED** for this
journey; PostgreSQL-only constraint and concurrency semantics are not claimed.

## 3. Single continuous flow

The test contains one collected test item and follows one dependency-ordered
journey:

1. `POST /api/v1/admin/categories` creates a category with slug `sarees`; the
   returned UUID is checked as server-generated, then the category is activated
   through its lifecycle route.
2. `POST /api/v1/admin/categories/{id}/subcategories` creates `silk`, checks
   the returned `categoryId` relationship and server-derived `sarees-silk` ID,
   then activates it through the dedicated route.
3. `GET /api/v1/admin/products/next-id?category=sarees` returns and the test
   uses the canonical `PF-SAR-NNNN` ID.
4. `POST /api/v1/admin/products/draft` creates the product with the returned
   category/subcategory IDs. The response and a direct ORM probe verify the
   ID, canonical taxonomy, `DRAFT`, `published=false`, and empty legacy media
   columns. The request contains no lifecycle or product-media association
   write keys.
5. Immediate `GET /api/v1/admin/products/{id}` verifies the camelCase
   `productId` contract and authoritative values.
6. `POST /api/v1/media/products/{id}/objects` uploads real PNG bytes through
   the existing product-scoped storage path. `POST /api/v1/media/register`
   then registers the object with `product_id` and `is_primary=true`.
7. The registration response is checked against the Step 11B DTO shape
   `{ok, media, assigned, assignment}`, including `objectKey`, URL, media ID,
   product ID, and `assignment.isPrimary=true`. A direct ORM probe confirms one
   authoritative `ProductMedia` association and that every legacy product
   media column is byte-for-byte/logically unchanged. No product PATCH is
   issued, and none of `mediaIds`, `primaryMediaId`, or `galleryMediaIds` is
   sent through a product write.
8. `GET /api/v1/media/products/{id}/media-set` verifies the registered object,
   canonical URL, primary media ID, and `isPrimary=true`; the returned object
   URL is also fetched and checked for exact PNG bytes.
9. `GET /api/v1/admin/products/{id}/publish-issues` verifies that the
   canonical cover blocker is absent. The real submit-review and approve
   routes are then called because the unchanged publish guard requires an
   approved review state.
10. `POST /api/v1/admin/products/{id}/publish` verifies `200`, `PUBLISHED`,
    `published=true`, and retained registered-media projection.
11. Public `GET /api/v1/products` and `GET /api/v1/products/{id}` verify
    storefront visibility, category/subcategory IDs, registered media
    representation, and absence of admin workflow/audit-only fields.
12. The test warms both public reads, archives the exact subcategory through
    `POST /api/v1/admin/subcategories/{id}/archive`, and verifies the product
    disappears from the list and detail reads return `404` rather than a stale
    cached representation. A `finally` block restores the subcategory through
    the dedicated restore route and verifies the product becomes visible again
    with its registered media retained.

The test clears the repository's in-process cache before and after the
journey, preventing its disposable product identity from contaminating other
real-router tests.

## 4. Mutation checks

Each mutation was applied only to a temporary working copy of the target source,
run against the focused Step 11C test, and restored immediately. No mutation
remains.

| Mutation | Expected failure | Result |
|---|---|---|
| Remove the `isPrimary=true` registered-media branch from `get_publish_issues` | Publish-issues still contains `At least one cover image is required before publishing.` | **Failed as expected** at the publish-issues assertion |
| Prevent `POST /media/register` from persisting the submitted primary flag | Registration assignment reports `isPrimary=false` | **Failed as expected** at the primary-association assertion |
| Bypass taxonomy cache invalidation in `CategoryService._invalidate_taxonomy_cache` | Warmed storefront detail remains `200` after subcategory archive | **Failed as expected** at the archive → detail `404` assertion |

The successful run uses the real registered association for the publish branch,
not merely the descriptive `COVER` role or the first media-set item.

## 5. Verification results

### 5.1 Step 11C and protected backend

| Check | Result | Classification |
|---|---:|---|
| Focused Step 11C `tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py` | **1 collected; 1 passed; 0 failed; 0 skipped** | **VERIFIED** |
| Protected backend command, in repository discovery order, covering Block 3/5/6/7, R5 Stage 1 boundaries, Block 8, Step 11B, taxonomy, Phase 6, Phase 7, and Step 11C | **474 collected; 451 passed; 0 failed; 23 skipped**; **582 subtests entered; 0 subtests failed** | **VERIFIED**, with existing environment/data skips |
| Focused Step 11B backend contract suite | **7 passed; 0 failed; 0 skipped** | **VERIFIED** |
| Literal system `python -m pytest -q tests/` | Could not start: `/usr/bin/python: No module named pytest` | **NOT VERIFIED** under the system interpreter |
| Full backend `backend/.venv/bin/python -m pytest -q tests/` | **648 collected; 625 passed; 0 failed; 23 skipped**; **582 subtests entered; 0 subtests failed** | **VERIFIED**, with existing environment/data skips |

The 23 full-suite skips are pre-existing environment/data-gated coverage,
including the unavailable real-media dataset and the PostgreSQL media-schema
check when `DATABASE_URL` is absent. Existing passlib deprecation and async
mock warnings do not cause failures.

A manually ordered pre-edit protected invocation placed the Phase 7 suite
before `test_phase6_media_db.py` and reproduced an existing global-cache test
ordering failure in `StorefrontProjectionTests`. No unrelated application or
test isolation change was made. The final protected command was rerun in
repository discovery order and passed with the exact counts above; the full
backend suite also passed.

### 5.2 Frontend regression and build

| Check | Result | Classification |
|---|---:|---|
| Full frontend `npm test` | **368 total; 367 passed; 0 failed; 1 skipped** | **VERIFIED** |
| Protected frontend command covering API/error, Block 3/5/6/7, R5, Block 8, Phase 6/7, taxonomy, Step 11A, and product UI guards | **207 total; 206 passed; 0 failed; 1 skipped** | **VERIFIED** |
| Focused Step 11A `tests/phase3Step11A.test.js` | **4 passed; 0 failed; 0 skipped** | **VERIFIED** |
| Frontend build `npm run build` | **PASS; 2,675 Vite modules transformed** | **VERIFIED** |

The one frontend skip is the established local-backend media-storage case.

### 5.3 Contract, migration, and scope checks

- Runtime `app.openapi()` equals `docs/openapi.json` exactly: **201 paths,
  no path delta**. OpenAPI was compared, not blindly regenerated.
- `git diff --check`: **PASS**.
- Alembic head: **`b6b5dcfb675b`**.
- `git diff --name-only -- backend/alembic`: **empty**; no migration was
  created or changed.
- Final Step 11C source scope: the only new Step 11C files are this report and
  `backend/tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py`.
  Existing Step 11A/11B, Block 8, R5 Stage 1, and OpenAPI working-tree changes
  were preserved.

## 6. Final disposition

Step 11C is complete within the approved boundary. The repository now contains
one real-application, real-router, real-storage, real-ORM integration journey
covering server-authoritative taxonomy and product IDs, registered-primary
media, legacy-column protection, the publish gate, storefront projections, and
archive/restore cache visibility. No production data was used, no migration was
made, and no commit or push was performed.

Stop after Step 11C.
