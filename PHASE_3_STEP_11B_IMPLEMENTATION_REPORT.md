# Phase 3 Step 11B — Response Schema + OpenAPI Alignment

**Date:** 2026-08-29  
**Branch:** `arena/01a04924-pfv1`  
**Scope:** Phase 3 Step 11B only  
**Verdict:** **PASS — implementation complete within the approved boundary**

## 1. Approved scope and non-goals

This block implemented only:

1. Accurate successful-response DTOs for:
   - `POST /api/v1/media/register`;
   - `GET /api/v1/media/assets`;
   - `GET /api/v1/admin/taxonomy/metrics`;
   - `GET /api/v1/admin/taxonomy/product-counts`.
2. Canonical error-envelope documentation for those four operations.
3. Explicit retention and compatibility-alias documentation for
   `/api/v1/admin/workflow/metrics`.
4. Focused response-contract, canonical-error-schema, route-documentation, and
   alias regression tests.
5. Meaningful temporary DTO and error-documentation mutations, each restored.
6. Regeneration and exact comparison of `docs/openapi.json` from live
   `app.openapi()` output.

Not implemented:

- Step 11A, Step 11C, or Step 11D;
- R5 Stage 2, PF3-N07, PF3-N10 enum tightening, typed request pricing,
  pagination redesign, employee casing migration, lifecycle/RBAC redesign,
  Phase 4, or unrelated deferred work;
- exception-handler rewrites, runtime error-payload changes, status-code
  changes, successful wire-shape changes, or migrations;
- any product-media authority or publish-gate change.

The existing Block 8, R5 Stage 1, and Step 11A working-tree changes were
preserved. No commit or push was made.

## 2. Pre-edit baseline

The baseline was collected before Step 11B source/test/schema/OpenAPI edits.
The repository's declared backend virtual environment was required because the
system `/usr/bin/python` does not have `pytest` installed.

| Check | Result | Classification |
|---|---:|---|
| Exact requested backend command `python -m pytest -q tests/` under system Python | Could not start: `No module named pytest` | **NOT VERIFIED** under that interpreter |
| Backend full suite using `backend/.venv/bin/python -m pytest -q tests/` | **640 collected test items; 617 passed, 23 skipped, 0 failed**; one separate PostgreSQL media-schema module skip because `DATABASE_URL` is unset | **VERIFIED** with environment-gated skip |
| Frontend full suite (`npm test`) | **368 total; 367 passed, 1 skipped, 0 failed** | **VERIFIED** |
| Relevant frontend protected suites | **95 total; 94 passed, 1 skipped, 0 failed** | **VERIFIED** |
| Frontend build (`npm run build`) | **PASS**; Vite transformed 2,675 modules | **VERIFIED** |
| Pre-edit runtime/check-in OpenAPI equality | **201 paths on both sides; exact equality** | **VERIFIED** |

## 3. Implementation

### 3.1 Media response DTOs

`backend/app/schemas/media/media.py` now declares:

- `MediaRegistrationAsset` for the nested `media` object;
- `MediaRegistrationAssignment` for the nullable nested `assignment` object;
- `MediaRegistrationResponse` for the exact
  `{ ok, media, assigned, assignment }` wrapper;
- `MediaAssetListItem` and `MediaAssetListResponse` for the exact
  `{ ok, items }` library response.

The DTOs preserve the runtime casing and nullability:

- `objectKey`, `mimeType`, `productId`, `mediaId`, `sortOrder`, and `isPrimary`
  remain camelCase on the wire;
- `title`, `altText`, and the whole `assignment` remain nullable;
- media `status` and association `role` remain unconstrained strings, so legacy
  stored values cannot make a read fail;
- the asset list remains unpaginated and contains no invented metadata.

The route declarations are now typed without changing their implementation or
successful return dictionaries.

### 3.2 Taxonomy response DTOs

`backend/app/schemas/catalog/collection.py` now declares:

- `TaxonomyCollectionMetrics` with `total` and arbitrary-string-keyed
  `byStatus` counts;
- `TaxonomyEntityCount` for category and subcategory totals;
- `TaxonomyMetricsResponse` for the existing collection/category/subcategory
  wrapper;
- `TaxonomyProductCountItem` and `TaxonomyProductCountsResponse` for the
  existing per-collection count list.

Empty and populated responses are both represented exactly:

- `collections.byStatus` may be `{}`;
- `counts` and all other list fields remain `[]` when empty;
- no pagination, status enum, or additional field was introduced.

### 3.3 Canonical error documentation

`backend/app/schemas/common.py` continues to provide the reusable
`ErrorResponse`/`ErrorDetail` structure and now describes the runtime contract
more precisely:

```json
{
  "success": false,
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human-readable error description.",
    "details": {} or []
  }
}
```

`ErrorResponse` is used only as OpenAPI response metadata in this block; the
runtime handlers in `backend/app/core/error_handlers.py` were not changed.
`details` is documented as the existing runtime object-or-validation-array
shape.

`backend/app/api/v1/response_docs.py` centralises reusable route response
metadata. The four required routes now use the canonical component for the
errors they can emit:

| Route | Successful response | Documented canonical errors |
|---|---|---|
| `POST /media/register` | 201 `MediaRegistrationResponse` | 401, 403, 404, 422, 500 |
| `GET /media/assets` | 200 `MediaAssetListResponse` | 401, 403, 500 |
| `GET /admin/taxonomy/metrics` | 200 `TaxonomyMetricsResponse` | 401, 403, 500 |
| `GET /admin/taxonomy/product-counts` | 200 `TaxonomyProductCountsResponse` | 401, 403, 500 |

The generated `HTTPValidationError` reference was removed from the register
operation's 422 response. Other unrelated operations retain their existing
OpenAPI documentation; there was no mechanical repository-wide replacement.

### 3.4 Workflow metrics alias

`/api/v1/admin/workflow/metrics` remains present, still calls the same metrics
service, retains `CatalogMetricsResponse`, and has no runtime behavior change.
Its OpenAPI summary and description now explicitly identify it as a
compatibility alias for `/api/v1/admin/products/metrics`. `API_CONTRACT.md`
records that new integrations should use the products route.

### 3.5 Contract documentation

`API_CONTRACT.md` now documents the exact taxonomy wrappers, media register and
asset-list wrappers, empty-list behavior, lack of pagination, and the retained
workflow compatibility alias. It explicitly states that the canonical error
documentation does not change exception handlers, status codes, or payloads.

## 4. Tests added

Added `backend/tests/unit/test_phase3_step11b_response_contract.py` with seven
focused tests:

1. register response with `assignment: null` and with a populated assignment;
2. empty and populated media-asset lists, proving no pagination fields;
3. empty and populated taxonomy status counts;
4. empty and populated taxonomy product-count lists;
5. canonical error DTO validation for validation-array and object details;
6. all four required route success/error OpenAPI references and exact documented
   status sets;
7. existence, shared response schema, and compatibility-alias documentation
   for both workflow/products metrics routes.

Focused final result:

```text
7 passed, 0 failed, 0 skipped
4 subtests entered, 0 subtests failed
```

The response tests exercise both empty and populated list/count cases and use
exact `model_dump(by_alias=True)` comparisons, so casing, wrappers, nullable
fields, nested fields, and accidental pagination additions are observable.

## 5. Mutation checks

Each mutation was temporary and restored before final verification.

| Mutation | Expected failure | Observed result | Restoration |
|---|---|---|---|
| Change `MediaRegistrationResponse.assignment` from the nested assignment DTO to `Optional[str]` | Assigned register fixture must reject the object shape | **Failed as expected**: 1 focused test failed with a Pydantic string/type error; 6 passed | Restored; final focused suite 7/7 passed |
| Remove the register route's explicit canonical 422 documentation | Route must revert to an incorrect `HTTPValidationError` reference and fail the exact-status/schema guard | **Failed as expected**: the guard saw `HTTPValidationError` instead of `ErrorResponse` | Restored; final focused suite 7/7 passed |

No mutation remains in the working tree.

## 6. Verification results

### 6.1 Protected backend suites

Final protected command covered the Block 3/5/6/7 contracts, R5 Stage 1 media
boundaries, Block 8, Step 11B, taxonomy contracts, and the available Phase 6
checks:

```text
473 collected test items; 450 passed, 23 skipped, 0 failed
582 subtests entered, 0 subtests failed
```

Included files:

- `test_phase3_product_id.py`, `test_phase3_product_identity.py`,
  `test_phase3_product_availability.py` — Block 3;
- `test_phase3_product_taxonomy.py`, `test_phase3_product_visibility.py` —
  Block 5 and taxonomy visibility protection;
- `test_phase3_product_lifecycle.py` — Block 6;
- `test_phase3_product_media.py`, `test_phase7_media_lifecycle.py` — Block 7
  and registered-media authority;
- `test_phase3_block8_collection_employee.py` — Block 8;
- `test_phase3_error_envelope.py`, `test_phase3_step11b_response_contract.py`;
- `test_phase6_image_formats.py`, `test_phase6_media_storage.py`,
  `test_phase6_media_db.py`, `test_phase6_real_media_integration.py`;
- `test_taxonomy_contract.py`.

### 6.2 Protected frontend suites

The final protected command covered API contracts, all Phase 3 Block 3/5/6
surfaces, R5 Stage 1/product-media honesty, Block 8, Step 11A, Phase 6, Phase 7,
and taxonomy consumers:

```text
202 total; 201 passed, 1 skipped, 0 failed
```

The one skip is the existing local-backend media-storage case. It is not a
Step 11B failure.

### 6.3 Full suites and build

| Check | Result | Classification |
|---|---:|---|
| Full backend (`backend/.venv/bin/python -m pytest -q tests/`) | **647 collected test items; 624 passed, 23 skipped, 0 failed**; `582 subtests entered, 0 subtests failed` | **VERIFIED** |
| Full frontend (`npm test`) | **368 total; 367 passed, 1 skipped, 0 failed** | **VERIFIED** |
| Frontend build (`npm run build`) | **PASS**; 2,675 modules transformed | **VERIFIED** |
| Separate PostgreSQL media-integrity module | **1 module-level skip**, `DATABASE_URL` is unset; no test execution | **SKIPPED** |

The backend run retains the repository's existing passlib deprecation and
AsyncMock runtime warnings; no warning was a test failure.

### 6.4 OpenAPI, diff, and migration guards

Generated with the repository's existing `json.dumps(spec, indent=2)` style:

```text
openapi_equal=True
runtime_paths=201
checked_paths=201
path_delta=[]
```

Additional guards:

- `git diff --check` — **PASS**;
- `git diff --name-only -- backend/alembic` — empty;
- Alembic head — **`b6b5dcfb675b`**;
- `backend/alembic/` — untouched;
- focused OpenAPI assertions — **7 passed**, including both metrics routes;
- required route 422 documentation — canonical `ErrorResponse`, not
  `HTTPValidationError`.

## 7. Classification of unavailable evidence

### SKIPPED

- PostgreSQL media-schema/integrity execution: no `DATABASE_URL` is configured;
- all 23 real-media-dataset test cases: the protected source/store dataset is
  absent;
- the existing frontend local-backend media-storage test that is environment
  gated.

### NOT VERIFIED

- The literal system-interpreter command `python -m pytest -q tests/`, because
  `/usr/bin/python` has no pytest module. The equivalent repository virtual
  environment command was verified and passed.
- Browser/DOM execution, deployed frontend/backend origin behavior, production
  caller census, production row-value reconciliation, real PostgreSQL query
  semantics, real Redis/CDN/external object-store behavior, and concurrent
  writers.

These limitations were not reported as passes.

### DEFERRED

- Step 11C final end-to-end integration flow and Step 11D editor clarification;
- R5 Stage 2 legacy media-write removal/retirement;
- PF3-N07 fail-closed taxonomy reconciliation;
- product/media/collection response enum tightening where real stored values
  are not available;
- pagination redesign, employee casing, typed request pricing, migrations,
  uniqueness/schema changes, lifecycle/RBAC redesign, static taxonomy
  retirement, Phase 4, and unrelated domain work.

## 8. Migration assessment

**No migration required or created.** This block adds Pydantic response models,
OpenAPI metadata, contract text, and tests over existing columns and runtime
service results. No database table, column, constraint, index, transaction,
exception handler, status code, or successful payload was changed.

## 9. Scope-preservation checks

- Existing successful media register/assets and taxonomy metrics/count wire
  shapes were preserved exactly.
- Empty lists remain `[]`; no pagination or synthetic fields were introduced.
- Media status and role remain strings in responses for legacy compatibility.
- `/admin/workflow/metrics` was retained as a compatibility alias.
- Block 3 server-authoritative IDs and SKU/slug 409 behavior remain untouched.
- Block 5 visibility/cache behavior and PF3-N07 fail-open behavior remain
  untouched.
- Block 6 lifecycle semantics remain untouched.
- Block 7 registered-media authority and publish gate remain untouched.
- R5 Stage 1 product-write omission of registered-media IDs remains untouched.
- Block 8 ownership, validation, scopes, canonical errors, and refreshes remain
  untouched.
- No `backend/alembic/` file was changed.

## 10. Final verdict

**PASS for Phase 3 Step 11B.** The four untyped successful response paths now
have accurate reusable DTOs; runtime casing, wrappers, nullability, lists,
nested fields, and unpaginated behavior are locked by focused fixtures; the
required error documentation uses the canonical runtime envelope; the workflow
metrics compatibility alias is retained and documented; mutations fail as
expected and were restored; the live OpenAPI document and checked-in
`docs/openapi.json` are exactly equal; and all available protected/full
verification is green with unavailable PostgreSQL, browser, production-data,
and real-media evidence classified honestly.

Stop after Step 11B. No commit or push was made.
