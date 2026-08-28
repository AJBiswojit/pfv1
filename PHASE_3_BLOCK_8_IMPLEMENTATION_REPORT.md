# Phase 3 Block 8 — Collections + Employee Product Contract

**Date:** 2026-08-29  
**Branch:** `arena/01a04924-pfv1`  
**Governing plan:** `PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_PLAN.md` §24 Step 10  
**Verdict:** **PASS — implementation complete; stopped for review**

Claims are labelled **[VERIFIED]** when executed in this checkout, **[READ]** when
established by source/document inspection, and **[NOT VERIFIED]** when the available
harness or environment could not exercise the claim.

---

## 1. Executive summary

**[VERIFIED]** Phase 3 Block 8 is implemented within its approved boundary:

- collection-owned product assignment validates every submitted product ID against
  `ProductModel.id` before mutation, deduplicates in caller order, and returns the
  canonical 422 business-rule envelope for unknown IDs;
- employee assignment validates non-null `employeeId` values against the authoritative
  `EmployeeProfileModel.employee_code` store, without coercing unknown values to null or
  creating an employee;
- employee GET and PATCH responses now use a dedicated `EmployeeProduct` projection and
  exclude admin review, history, pricing-history, actor, and publication-audit fields;
- product writes no longer own collection membership; the frontend sends collection
  membership only through the collection assignment command;
- product response collection names resolve from collection-owned membership, with the
  pre-existing product labels retained only as a legacy read fallback;
- collection request schemas reject unknown/unsupported fields rather than silently
  discarding them;
- canonical frontend payload names, explicit scopes, error handling, and authoritative
  refresh behavior remain intact;
- R5 Stage 1 remains preserved exactly: frontend product writes omit the three registered
  media identifiers, authored media fields remain valid, and the backend
  `ProductContentFields` keys were not removed.

No migration, R5 Stage 2, Phase 4 work, PF3-N07 change, commit, or push was performed.

---

## 2. Scope and non-goals

**[READ]** The approved scope is the three direct Step 10 items: collection ID/product
association validation, `assignedEmployeeId` validation, and the narrowed employee product
projection. The implementation also makes the directly related request/payload ownership,
status/error, and refresh contracts honest where the existing code was already crossing
those seams.

Explicitly not implemented:

- R5 Stage 2 removal of `mediaIds`, `primaryMediaId`, and `galleryMediaIds` from the
  backend write schema;
- PF3-N07 fail-closed category default;
- Phase 4 media infrastructure or static-data retirement;
- a new collection-product table, foreign key, index, or other schema change;
- redesign of collection lifecycle/status semantics;
- employee RBAC redesign;
- unrelated product response/nullability cleanup;
- commits or pushes.

---

## 3. Governing documents and source of truth

**[READ]** Before editing, the repository plan, current API contract, current OpenAPI,
completed Phase 3 reports available in the checkout, and the existing source were read.
The relevant documents were:

1. `PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_PLAN.md`
2. `API_CONTRACT.md`
3. `PHASE_3_IMPLEMENTATION_REPORT.md`
4. `PHASE_3_BLOCK_3_IMPLEMENTATION_REPORT.md`
5. `PHASE_3_BLOCK_4_IMPLEMENTATION_REPORT.md`
6. `PHASE_3_BLOCK_5_IMPLEMENTATION_REPORT.md`
7. `PHASE_3_BLOCK_6_IMPLEMENTATION_REPORT.md`
8. `PHASE_3_BLOCK_7_IMPLEMENTATION_REPORT.md`
9. `PHASE_3_BLOCK_7_MEDIA_GATE_IMPLEMENTATION_REPORT.md`
10. `PHASE_3_R5_STAGE_1_IMPLEMENTATION_REPORT.md`
11. the checked-in `docs/openapi.json`

The repository and governing Markdown, rather than historical audit conclusions alone,
were treated as authoritative. The separate Block 1/2 reports named by the task brief are
not present in this checkout; their relevant claims were checked directly against source.

---

## 4. Baseline and pre-edit audit

**[VERIFIED]** The controlled pre-Block-8 baseline was captured before the Block 8 source
edits, with the already-landed R5 Stage 1 working tree preserved:

| Check | Baseline |
|---|---:|
| Backend complete suite | 604 passed, 24 skipped, 0 failed |
| Frontend complete suite | 356 tests: 355 passed, 1 skipped, 0 failed |
| Frontend build | green |
| Alembic working tree | clean |
| `docs/openapi.json` vs live `app.openapi()` | equal |

**[READ]** The pre-edit audit confirmed the two relevant findings:

- PF3-N08: product-owned collection labels and collection-owned explicit ID lists were
  unsynchronised; neither side validated the other.
- PF3-N11: `GET /employee/products/{id}` used the full admin projection.
- The assignment path wrote any non-null employee string without checking the authoritative
  employee profile store.
- The collection/product route passed its resolved ID list through a mismatched internal
  query attribute and also applied a projection-name collection filter.
- Collection and employee request surfaces contained fields that were either not owned by
  the endpoint or were silently discarded by Pydantic.

The pre-edit audit found no need for a migration to implement these corrections.

---

## 5. Findings mapped to the approved Step 10 work

| Finding | Source-of-truth result | Correction |
|---|---|---|
| Collection associations could contain unknown product IDs | **[READ]** `explicit_product_ids` is JSONB and has no DB FK | Resolve all IDs before create/update/PUT mutation; reject unknown IDs with 422 |
| Duplicate collection IDs could be stored | **[READ]** assignment stored the request list directly | Preserve first occurrence and remove later duplicates |
| Employee assignment accepted arbitrary strings | **[READ]** no authoritative lookup existed | Query `EmployeeProfileModel.employee_code` before assignment |
| Employee route exposed admin fields | **[READ]** employee GET returned `AdminProduct` | Add `EmployeeProduct` and use it for employee GET and PATCH |
| Product writes could own collection membership | **[READ]** product schemas and frontend payloads carried collection fields | Remove those fields from product request/edit contracts and use collection command ownership |
| Unsupported request fields could be silently ignored | **[READ]** employee schema allowed extras; collection forms sent absent fields | Use strict request schemas and remove unsupported frontend fields |

---

## 6. Collection contract before and after

**[READ] → [VERIFIED]** The canonical collection command remains:

```text
PUT /api/v1/admin/collections/{id}/products
{ "productIds": ["product-id", "another-product-id"] }
```

It remains admin-scoped and continues to replace the full explicit list for MANUAL
collections. RULE_BASED collections continue to reject explicit assignment with the
existing canonical 409 conflict. Collection lifecycle and draft/active/paused/archived
semantics were not redesigned.

The change is validation and ownership, not a new association model: the existing
`catalog_collection.explicit_product_ids` JSONB list remains the storage representation.

---

## 7. Collection product-ID validation

**[VERIFIED]** `CollectionService._validated_product_ids()` now:

1. normalises a missing list to an empty list;
2. preserves the caller's order;
3. removes duplicate values without changing the first occurrence;
4. resolves all unique values using the authoritative `ProductModel.id` query;
5. raises one `BusinessLogicException` before mutation if any value is unknown;
6. returns details identifying the input field and every unknown value.

Example failure details:

```json
{
  "field": "productIds",
  "unknown": ["UNKNOWN-PRODUCT"]
}
```

The helper is used by collection create (`explicitProductIds`), collection PATCH
(`explicitProductIds`), and the collection assignment PUT (`productIds`). No unknown ID
is written and no implicit product is created.

---

## 8. Collection atomicity, duplicates, and removal

**[VERIFIED]** Focused tests cover:

- valid IDs with duplicate input → one ordered explicit list;
- an unknown ID mixed with a known ID → 422 and the prior collection list unchanged;
- create and update paths using the same authoritative lookup;
- repeated assignment being idempotent at the stored-list level because duplicates are
  removed;
- the existing RULE_BASED assignment conflict remaining HTTP 409;
- removal behavior remaining a replacement of the current explicit list through the same
  command, so a repeated removal is a successful no-op when the frontend has an empty
  resulting list.

**[NOT VERIFIED]** A real PostgreSQL transaction with concurrent collection writers was
not available. The implementation performs validation before the mutation flush and does
not add a database constraint; the existing JSONB storage model remains the limiting
concurrency boundary.

---

## 9. Collection reads and status behavior

**[VERIFIED]** Product projections now receive collection-owned membership names from
`CollectionModel.explicit_product_ids` and rule evaluation. The existing product
`collection`/`collections` labels are consulted only as a read fallback for legacy rows;
product writes no longer update them.

The collection product route now passes the resolved IDs through the correctly named
internal `collection_product_ids` query field and does not additionally filter by a
collection-name projection. This prevents valid explicit ID associations from being
lost because a product response label does not match a collection ID.

**[VERIFIED]** Existing status behavior remains unchanged: public collection reads retain
an ACTIVE gate, admin reads include all statuses, and collection membership does not
become a product visibility gate. Published-product filtering for storefront collection
results remains in the existing resolver/service path.

---

## 10. Employee assignment contract before and after

**[READ]** Before Block 8, the assignment service accepted any non-null value from
`AssignEmployeeRequest.employeeId`, wrote it to `assigned_employee_id`, and returned the
admin projection. `null` was supported for unassignment, but there was no authoritative
existence check.

**[VERIFIED]** The canonical assignment behavior is now:

| Input/state | Result |
|---|---|
| Unknown non-empty employee code | 422 `BUSINESS_RULE_VIOLATION`; product unchanged |
| Existing employee code | assignment persists and reads back |
| Existing assignment replaced by another existing code | reassignment persists |
| Explicit `null` | unassignment persists |
| Empty string | request validation 422 |
| Missing product | existing 404 path remains authoritative |
| Unauthorized caller | existing 403 permission/ownership paths remain authoritative |

No frontend cache, static employee list, arbitrary-string acceptance, null coercion, or
implicit employee creation is used.

---

## 11. Authoritative employee-code validation

**[VERIFIED]** Non-null assignment validation queries:

```python
select(EmployeeProfileModel.employee_code).where(
    EmployeeProfileModel.employee_code == req.employee_id
)
```

The check runs after the product lookup and before setting `assigned_employee_id`, history,
`updated_by`, or flushing. The model is the authoritative employee profile store already
used by the application identity path. The code validates existence only; it does not
invent new employee status or permission semantics.

`AssignEmployeeRequest.employeeId` remains the canonical camelCase request alias and now
has a non-empty constraint while preserving `null` for supported unassignment.

---

## 12. Employee assignment authorization and persistence

**[VERIFIED]** Existing route authorization was preserved: the admin assignment route
continues to use its admin permission dependency and returns the admin product contract;
the employee product route continues to use explicit employee scope and existing
permission/assignment checks. The new existence check does not replace or weaken those
403 paths.

Focused service tests verify that a valid reassignment and explicit unassignment mutate the
model, flush, and return a response, while an unknown code leaves the existing assignment,
history, and flush count unchanged.

**[NOT VERIFIED]** A live authenticated PostgreSQL request using real users and persisted
employee profiles was not available in this environment.

---

## 13. Narrow employee product projection

**[VERIFIED]** `EmployeeProduct` is an independent Pydantic response model, not an
`AdminProduct` subclass. It retains catalogue content, operational state, assignment, and
read-only media fields needed by the employee product surface while excluding:

- `review`;
- `reviewFlags`;
- `history`;
- `priceHistory`;
- `createdBy` / `createdAt`;
- `updatedBy` / `updatedAt`;
- `publishedBy` / `publishedAt`.

Both `GET /api/v1/employee/products/{id}` and `PATCH
/api/v1/employee/products/{id}` now return `SingleEmployeeProductResponse`. The service
uses the same safe projection after an employee update, so the PATCH response does not
reintroduce the admin shape.

The employee projection keeps the canonical camelCase response aliases and preserves the
registered-media read projection without making the employee route a media write path.

---

## 14. Employee request/write ownership

**[VERIFIED]** `EmployeeProductUpdateRequest` no longer declares `collectionIds` or
`collections`, and its `extra="forbid"` configuration rejects unsupported fields with
FastAPI/Pydantic's canonical 422 validation response. The service whitelist also no longer
contains collection fields; it remains a defence-in-depth filter, not the primary way
unsupported fields are handled.

**[VERIFIED]** `ProductContentFields` no longer declares product-owned `collection` or
`collections` writes. Its pre-validation guard explicitly rejects legacy collection keys,
including `collectionIds`/`collection_ids`, with a validation error that directs callers to
the collection assignment endpoint. The fields remain available on response projections
for compatibility/read purposes.

No Pydantic-discarded collection/status/SEO fields are sent by the collection form.

---

## 15. Frontend canonical payloads

**[VERIFIED]** The central `buildAdminProductPayload()` no longer emits `collection` or
`collections` membership fields. Product editor command-owned fields also include
`collectionIds`; collection membership is not sent through product create/update.

The employee editable-field set no longer includes collection membership, and the legacy
catalogue sync path filters employee writes through that set. The collection form sends
only fields represented by `CollectionCreateRequest`/`CollectionUpdateRequest`:

```text
name, slug, description, image, heroMediaId, thumbnailMediaId,
type, featured, sortOrder, startDate, endDate
```

Collection status remains read-only in that form and lifecycle actions remain dedicated
commands.

---

## 16. Scopes, names, statuses, errors, and refresh

**VERIFIED** by source tests and existing API-client tests:

- collection reads use `none`; collection admin commands use `admin`;
- admin employee assignment uses `admin`; employee product reads/writes use their
  explicit employee scope in the frontend API layer;
- request bodies use canonical `productIds` and `employeeId` aliases;
- unknown relational product/employee values use 422 business-rule validation details;
- missing resources continue through the existing 404 path;
- permission failures remain 403;
- RULE_BASED explicit assignment remains 409;
- no HTTP 200 `{ok:false}` is introduced;
- API errors are returned through `handleError`, preserving status, code, message, and
  details;
- successful collection mutations refresh the authoritative catalogue;
- failed writes return the failure and do not fabricate local success.

---

## 17. Frontend collection detail/form behavior

**[VERIFIED]** `AdminCollectionForm` no longer renders or sends unsupported
`shortDescription`, `seoTitle`, `seoDescription`, or editable `status` fields. It displays
status as read-only and points lifecycle changes to the dedicated endpoints.

**[VERIFIED]** `AdminCollectionDetail` no longer renders backend-absent SEO fields. Existing
assignment actions continue through `taxonomyRepository`, whose successful mutation path
refreshes the catalogue and whose failed mutation path returns the API error. No local
product write is used as a substitute for the collection assignment command.

The page-level UI redesign was not undertaken.

---

## 18. Backend tests added

**[VERIFIED]** Added `backend/tests/unit/test_phase3_block8_collection_employee.py`
with 13 focused tests covering:

- product ID validation, ordered deduplication, and atomic unknown-ID rejection;
- collection create/update lookup reuse;
- MANUAL/RULE_BASED conflict preservation;
- unknown employee rejection without mutation;
- valid reassignment and null unassignment;
- safe employee projection field exclusion;
- rejection of product/employee collection-write fields;
- canonical employee alias and empty-code validation;
- the collection query restriction field;
- live OpenAPI response/schema declarations.

The tests use the repository's async `unittest.IsolatedAsyncioTestCase` and service/schema
conventions, with fake database results only where the repository's PostgreSQL harness is
not available.

---

## 19. Frontend tests added

**[VERIFIED]** Added `frontend/tests/phase3Block8CollectionEmployee.test.js` with eight
Node test-runner tests covering:

- product payload removal of collection membership while authored media survives;
- employee editable payload filtering;
- admin scope and canonical body for collection assignment;
- canonical 422 error preservation and no fake success;
- explicit scope behavior for employee read/admin assignment;
- employee GET and PATCH safe projection route declarations;
- collection detail absence of backend-absent SEO fields;
- collection form ownership of request fields.

The tests use the package's existing Node loader, mocked `fetch`, and repository static
contract guards; no new test framework was introduced.

---

## 20. Mutation check

**[VERIFIED]** Meaningful source mutations were applied temporarily and restored with a
trap after each run:

| Temporary mutant | Expected result | Observed |
|---|---|---|
| Disable the collection unknown-ID exception branch | Focused collection tests must fail | **Failed as expected**: unknown-product tests reported “BusinessLogicException not raised” |
| Disable the employee authoritative lookup branch | Focused employee tests must fail | **Failed as expected**: unknown employee test did not receive the expected validation failure |

The working tree was checked after restoration; no mutant remains in the application source.

---

## 21. Real application-flow exercise

**[VERIFIED, harness-limited]** The real application imports, FastAPI route declarations,
Pydantic models, service methods, API-client methods, and repository mutation paths were
exercised by the focused and complete test suites. The existing backend test harness also
ran its real FastAPI/ORM-oriented product, lifecycle, taxonomy, and media flows.

The focused Block 8 tests exercise the service mutation boundaries because the repository's
collection-product SQLite path uses PostgreSQL JSONB operators and the environment has no
configured PostgreSQL database. The frontend tests exercise real API modules with mocked
HTTP, including canonical scopes, bodies, and error results.

**[NOT VERIFIED]** A deployed browser flow and a live PostgreSQL collection/employee flow
were not claimed.

---

## 22. R5 Stage 1 preservation

**[VERIFIED]** R5 Stage 1 remains unchanged and guarded:

- frontend product writers omit `mediaIds`, `primaryMediaId`, and `galleryMediaIds`;
- no registered-media → legacy-product projection PATCH exists;
- authored `image`, `hoverImage`, and `additionalImages` remain valid product content;
- the backend `ProductContentFields` still declares the three legacy media-write keys;
- registered media continues through `/media/register` and media-set reads;
- existing Phase 3 media honesty, Phase 6 storage, and Phase 7 lifecycle/media tests pass.

R5 Stage 2 is explicitly deferred pending its observation-window/caller census. No media
schema field removal was included in Block 8.

---

## 23. OpenAPI comparison and regeneration

**[VERIFIED]** Live `app.openapi()` was compared with `docs/openapi.json` before and after
implementation. Block 8 made real visible changes, so the checked-in document was
regenerated from the live app rather than hand-edited.

The visible changes include:

- employee GET and PATCH success responses now reference
  `SingleEmployeeProductResponse`;
- the `EmployeeProduct` component is declared;
- collection create/update/assignment request schemas are strict
  (`additionalProperties: false`);
- `employeeId` declares the non-empty string constraint;
- the employee route descriptions describe the safe projection and 422 behavior.

Final comparison result:

```text
OPENAPI_MATCH
```

No OpenAPI change unrelated to the live application was intentionally added.

---

## 24. Migration decision

**[VERIFIED]** No Alembic migration is required or present. The implementation uses the
existing `catalog_collection.explicit_product_ids` JSONB storage and existing employee
profile/product columns. `git diff --name-only -- alembic backend/alembic` returned no
changes.

A new association table, foreign key, index, or data backfill would exceed Step 10 and was
not introduced. The lack of a relational FK is documented as the reason service-layer
validation is required.

---

## 25. R5/PF3-N07/unrelated-file guard

**VERIFIED** guard results:

- `git diff --check` passed;
- no Alembic files changed;
- no cache, build, Python bytecode, or log artifacts are staged as changes;
- PF3-N07 category-default behavior is unchanged and remains **UNCHANGED / DEFERRED**;
- R5 Stage 1 files and report changes pre-dating Block 8 were preserved;
- no cart, checkout, order, payment, wishlist, notification, AI, or RBAC-domain files
  were changed by Block 8;
- the Block 8 additions are limited to the collection/employee backend contract tests,
  frontend contract tests, and the implementation/report files identified above.

The working tree also contains the prior R5 Stage 1 implementation changes, which are
intentionally retained rather than reverted.

---

## 26. Verification matrix and final results

**[VERIFIED]** Final checks completed or recorded for this implementation:

| Command/check | Result |
|---|---|
| Focused backend Block 8 tests | **13 passed** |
| Targeted backend Block 8 + taxonomy/catalogue/media suites | **169 passed, 0 failed** |
| Focused frontend Block 8 tests | **8 passed** |
| Targeted frontend Block 8 + R5/media suites | **70 passed, 0 failed** |
| Full backend `PYTHONPATH=. python -m pytest -q tests/` from `backend/` | **640 collected: 617 passed, 23 skipped, 0 failed** |
| Full frontend `npm test` | **364 tests: 363 passed, 1 skipped, 0 failed** |
| Frontend `npm run build` | **green**; Vite transformed 2,675 modules |
| Live OpenAPI vs checked-in JSON | **match** |
| Mutation checks | **both mutants failed focused tests as expected** |
| Migration guard | **clean** |
| `git diff --check` | **passed** |

The backend full-suite result is **617 passed / 23 skipped / 0 failed** from the completed
final command. The skips are the existing PostgreSQL/real-dataset gated tests; the run also
reported the repository's existing passlib/AsyncMock warnings.

---

## 27. Limitations and not-verifiable items

**[NOT VERIFIED]** The following were unavailable or outside the current harness:

- PostgreSQL-specific JSONB execution and transaction/concurrency behavior;
- live authenticated admin/employee requests against persisted employee rows;
- browser-executed end-to-end interaction against a deployed backend;
- production-data reconciliation of collection IDs and employee codes;
- R5 Stage 2 observation-window/caller census;
- a real media dataset for the repository's existing gated media integration tests.

These are **NOT VERIFIED**, not failures. Existing suite skips are retained and reported by
the test runner; no PostgreSQL or browser result is claimed here.

---

## 28. Final verdict and deferred work

**[VERIFIED] PASS for Phase 3 Block 8.** The approved collection and employee contracts are
implemented, directly tested, mutation-checked, OpenAPI-synchronised, and regression-tested
without a migration or unrelated phase work.

Deferred exactly as required:

- R5 Stage 2 media-write-schema removal after observation and caller census;
- PF3-N07 fail-closed category default after real catalogue reconciliation;
- Phase 3 Step 11 response cleanup/integration work;
- Phase 4 media/static-data infrastructure;
- PostgreSQL and browser verification when those environments are available.

The agent has stopped for review. No commit or push was made.
