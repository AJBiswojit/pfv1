# Phase 3 Step 11A — Normalizer + Media Error Preservation

**Date:** 2026-08-29  
**Branch:** `arena/01a04924-pfv1`  
**Scope:** Phase 3 Step 11A only  
**Verdict:** **PASS — implementation complete within the approved boundary**

This report records the implementation and verification of the approved Step 11A
items. The checkout already contained the Block 8 and R5 Stage 1 working-tree
changes and their reports; those changes were preserved and not folded into this
Step 11A scope.

## 1. Approved scope and non-goals

Implemented only:

1. API-051 canonical-first `compareAtPrice` normalization, with the existing
   snake_case compatibility fallback retained.
2. Structured error preservation in the seven confirmed flattening catches in
   `frontend/src/services/api/mediaApi.js`, using the existing
   `handleError(error, fallbackMessage)` helper.
3. Focused regressions for API-051, media HTTP/network failures, and
   orchestration failure propagation.
4. Mutation checks for API-051 and a media adapter.
5. Full and protected regression verification plus this report.

Not implemented:

- Step 11B response DTO/OpenAPI alignment;
- Step 11C final integration flow;
- Step 11D collection-editor clarification;
- R5 Stage 2, PF3-N07, typed pricing, pagination, employee casing, taxonomy
  retirement, Phase 4, migrations, lifecycle/RBAC redesign, or unrelated
  deferred work;
- any backend DTO, database, Alembic, API contract, or successful media-shape
  change.

No commit or push was made.

## 2. Implementation

### API-051

`frontend/src/services/api/productsApi.js` now normalizes the field as:

```js
compareAtPrice: p.compareAtPrice ?? p.compare_at_price ?? null
```

This keeps the snake_case fallback and the `null` result when neither field is
present. The existing `originalPrice` compatibility chain was not changed:

```js
p.originalPrice ?? p.original_price ?? p.mrp ?? p.compare_at_price ?? null
```

Therefore the API-050/originalPrice branches remain intact.

### Media API catches

The seven confirmed flattening catches now use the existing canonical helper,
while keeping their previous fallback messages and successful response shapes:

| Adapter | Fallback message |
|---|---|
| `apiGetMediaStorageStatus` | `Media storage status unavailable.` |
| `apiResolveMediaReferences` | `Media resolution unavailable.` |
| `apiGetMediaObjectMeta` | `Media metadata unavailable.` |
| `apiGetProductMediaSet` | `Product media set unavailable.` |
| `apiUploadMediaObject` | `Upload failed.` |
| `apiUploadProductMediaObject` | `Upload failed.` |
| `apiDeleteMediaObject` | `Delete failed.` |

`apiRegisterMediaObject` and `apiListMediaAssets` already used
`handleError`; their catches were not rewritten. Local input-validation returns
were not changed.

The affected adapter failures now retain the canonical fields supplied by the
existing `ApiError`/`handleError` boundary: `error`, `code`, `details`, `data`,
`status`, and `isNetworkError`.

### Orchestration propagation

`frontend/src/services/media/productMediaService.js` now uses a narrow
`preserveMediaFailure` propagation helper at media-read, product-refresh,
upload/register, batch, primary-selection, and reorder failure boundaries. It
adds pipeline context without replacing or re-normalizing the API failure:

- `code`, `details`, `data`, `status`, and `isNetworkError` remain available;
- the existing server/fallback `error` remains available;
- the existing `stage`, `step`, `objectKey`, `results`, and `failedIndex`
  context remains available where applicable;
- successful result shapes and media lifecycle semantics are unchanged by this
  Step 11A delta.

This is propagation of the existing canonical error system, not a second error
system.

## 3. Tests added

Added `frontend/tests/phase3Step11A.test.js` using the repository's existing
Node test loader and `node:test` runner. It contains four tests:

1. **API-051 public product normalization** — five cases:
   - only canonical `compareAtPrice`;
   - only snake_case `compare_at_price`;
   - neither field;
   - equal dual fields;
   - conflicting dual fields, proving camelCase wins.
2. **Structured 422 media failures** — exercises all nine media adapters,
   including the seven changed adapters and the two already-canonical adapters.
   It proves the canonical code, message in `result.data`, details, complete
   response data, HTTP status, and non-network classification survive.
3. **HTTP and network classifications** — practical mocked HTTP 401, 403, 404,
   and 409 responses plus a rejected `fetch`, proving status, code, message,
   details, `data`, and `isNetworkError` behavior.
4. **Product-media orchestration propagation** — proves a structured media-set
   read failure is returned without losing canonical fields.

The final focused run was:

```text
1..4
# tests 4
# pass 4
# fail 0
# skipped 0
```

## 4. Mutation checks

Both requested mutation checks were applied temporarily, tested, and restored.
The correct implementation is present after each restoration.

| Mutant | Expected outcome | Observed outcome | Restoration |
|---|---|---|---|
| Reverse API-051 precedence to `p.compare_at_price ?? p.compareAtPrice` | Focused Step 11A test must fail on conflicting values | **Failed as expected**: conflicting case returned `900`, expected canonical `1500`; 3 passed / 1 failed | Restored; final focused run 4/4 passed |
| Replace `apiGetMediaStorageStatus` catch with the old flattened `{ ok, error, status }` shape | Structured media tests must fail | **Failed as expected**: structured 422 lost `code`; HTTP/network test lost `code`; 2 passed / 2 failed | Restored; final focused run 4/4 passed |

No mutation remains in the working tree.

## 5. Verification results

### Protected/relevant frontend suites

The aggregate protected/relevant command covered the API/error contract, Phase 3
media honesty and Block 8, Phase 6 media, Phase 7 media, R5 Stage 1 guards, and
Step 11A:

```text
95 tests: 94 passed, 1 skipped, 0 failed
```

Per-file results:

| Suite | Result |
|---|---:|
| `apiContract.test.js` | 12 passed, 0 skipped, 0 failed |
| `phase3ProductMediaHonesty.test.js` | 16 passed, 0 skipped, 0 failed |
| `phase3Block8CollectionEmployee.test.js` | 8 passed, 0 skipped, 0 failed |
| `phase6LocalMediaFlow.test.js` | 8 passed, 1 skipped, 0 failed |
| `phase6MediaStorage.test.js` | 27 passed, 0 skipped, 0 failed |
| `phase7ProductMedia.test.js` | 19 passed, 0 skipped, 0 failed |
| `phase3Step11A.test.js` | 4 passed, 0 skipped, 0 failed |

The single frontend skip is the existing unavailable local backend media-storage
case; it is not an implementation failure.

### Protected/relevant backend suites

The targeted backend command covered Phase 3 product media and error-envelope
coverage, Block 8, Phase 6 media storage/real-media coverage, and Phase 7
lifecycle coverage:

```text
201 tests collected: 178 passed, 23 skipped, 0 failed
```

The 23 skips are the existing real-media-dataset checks in
`test_phase6_real_media_integration.py`; the dataset is not present in this
checkout. The Phase 6 database test was also run separately:

```text
16 passed, 0 failed
```

### Full suites and build

| Check | Result |
|---|---:|
| Full frontend `npm test` | 368 tests: **367 passed, 1 skipped, 0 failed** |
| Full backend `python -m pytest -q` | 640 collected tests: **617 passed, 23 skipped, 0 failed**; additionally the real PostgreSQL media-schema module was module-skipped because `DATABASE_URL` is unset |
| Frontend `npm run build` | **PASS**; Vite transformed 2,675 modules |

The backend run also emitted the repository's existing passlib deprecation and
AsyncMock runtime warnings. No test failure occurred.

## 6. Static, migration, and OpenAPI guards

The following checks passed:

- `git diff --check`;
- the Step 11A source guard confirming the canonical-first expression;
- the Step 11A source guard confirming no flattening media catch remains and
  all nine media catches use `handleError` (seven changed here, two already
  canonical);
- the protected frontend static guards in the Phase 3, R5, Phase 6, and
  Phase 7 suites;
- `git diff --name-only -- backend/alembic` is empty;
- Alembic head resolves to `b6b5dcfb675b`;
- `backend/alembic/` remains untouched.

`docs/openapi.json` was already modified in the working tree before Step 11A.
It was not edited or regenerated by this implementation. The diff was inspected
and is attributable to the pre-existing Block 8 contract work (employee
projection/collection schema changes), not API-051 or media error handling. The
live comparison still passes:

```text
openapi_equal=True
runtime_paths=201
checked_paths=201
```

No OpenAPI drift was introduced by Step 11A.

Two existing repository media audit scripts report fixture-data failures that
are outside this implementation and were not changed:

- `npm run audit:product-media` — fails because the existing
  `PF-W-SAR-COT-0001` fixture references missing
  `/images/products/.test/cotton-fixture.avif`;
- `npm run audit:media` — fails on the same missing fixture file.

The related managed-media audit does pass:

```text
npm run audit:media-products — PASS
```

These audit-script failures are reported rather than suppressed or “fixed” by
altering unrelated fixture/media data. The Step 11A focused and complete test
suites remain green.

## 7. Scope-preservation checks

The implementation preserved the explicit constraints:

- no backend source or DTO change;
- no database, schema, or Alembic change;
- no OpenAPI regeneration or contract change;
- no product response-shape change;
- no successful media response-shape change;
- no upload/register semantic change;
- no role/namespace validation change;
- no Block 7 publish-gate change;
- no Block 8 collection/employee behavior change;
- no R5 Stage 1 regression: product writes still omit
  `mediaIds`, `primaryMediaId`, and `galleryMediaIds`, with authored media
  fields retained;
- no R5 Stage 2, lifecycle redesign, pagination, typed pricing, employee
  casing, PF3-N07, static taxonomy retirement, or Phase 4 work.

The working tree's pre-existing Block 8/R5 files and reports were preserved;
this report and `frontend/tests/phase3Step11A.test.js` are the new Step 11A
artifacts.

## 8. Limitations

The following remain **SKIPPED** or **NOT VERIFIED**, never claimed as passed:

- live PostgreSQL execution, because `DATABASE_URL` is unset;
- real media-dataset integration, because the dataset is absent;
- deployed browser/DOM execution and browser-to-backend verification;
- production caller/observation-window census for R5 Stage 2;
- concurrent production database/media writers;
- external object-store/CDN behavior.

These limitations do not block the approved Step 11A unit/API-boundary change.

## 9. Final verdict

**PASS for Phase 3 Step 11A.** API-051 now uses canonical-first precedence
without losing compatibility, the seven confirmed media flattening catches now
preserve the existing canonical error fields, orchestration returns those
failures intact, focused regressions and mutation checks prove both behaviors,
and the complete available regression/build verification is green. Step 11B,
11C, 11D, R5 Stage 2, migrations, and all other deferred work remain untouched.
