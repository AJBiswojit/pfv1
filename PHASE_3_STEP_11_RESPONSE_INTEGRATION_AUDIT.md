# Phase 3 Step 11 — Response Contract Cleanup + Final Integration Audit

**Audit date:** 2026-08-29  
**Branch:** `arena/01a04924-pfv1`  
**Mode:** Read-only audit; no application source, tests, migrations, OpenAPI, or `API_CONTRACT.md` were changed.  
**Disposition:** Audit and implementation plan only. Awaiting explicit approval.

## Baseline

### Governing scope

This audit uses the governing plan, especially Step 11 and §§22, 24, 25, and 26, together with the authoritative transport/response contract in `API_CONTRACT.md`. It re-checks the current checkout rather than accepting historical audit findings without verification.

The completed material reviewed was:

- `PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_PLAN.md`;
- `API_CONTRACT.md` and `docs/openapi.json`;
- `PHASE_3_IMPLEMENTATION_REPORT.md` and available Block 3–8 reports;
- `PHASE_3_BLOCK_7_MEDIA_SOURCE_OF_TRUTH_DECISION.md`;
- `PHASE_3_BLOCK_7_MEDIA_GATE_IMPLEMENTATION_REPORT.md`;
- `PHASE_3_R5_STAGE_1_IMPLEMENTATION_REPORT.md`;
- current product, collection, employee, media, schema, service, API-client, repository, editor, and taxonomy sources.

The Block 8 report records that separate Block 1/2 reports are not present in this checkout. Their relevant claims were checked directly against the current source and tests.

### Verification baseline

| Check | Result | Classification |
|---|---:|---|
| Frontend full suite (`npm test`) | 364 tests: **363 passed, 1 skipped, 0 failed** | VERIFIED |
| Frontend targeted API/Phase 3/media/taxonomy suites | **72 passed, 0 failed, 0 skipped** | VERIFIED |
| Backend full suite (`.venv/bin/python -m pytest -q tests/`) | **617 passed, 23 skipped, 0 failed** | VERIFIED; skips are environment/data-gated |
| Backend targeted contract/Phase 3/product/media/taxonomy suites | command exited successfully; **348 tests collected** | VERIFIED; PostgreSQL-dependent media schema check skipped because `DATABASE_URL` is unset |
| Frontend production build | Vite build green; 2,675 modules transformed | VERIFIED |
| Runtime OpenAPI vs `docs/openapi.json` | **exact equality**, 201 paths on both sides, empty path delta | VERIFIED as synchronization |
| `git diff --check` | passed | VERIFIED |
| Alembic working tree | no changed migration files | VERIFIED |

The existing Block 8 and R5 Stage 1 working-tree changes remain untouched. No commit or push was made.

### Current contract shape

- Product list/detail/admin routes use `{ ok, ... }` wrappers and product projections serialize camelCase fields. `AdminProduct` has 76 properties, `StorefrontProduct` has 54, and `EmployeeProduct` has 66.
- Collection routes use `{ ok, collection/items }` wrappers and camelCase collection response fields.
- Employee CRUD/self-service routes use the older `{ success, data, message }` and top-level paginated envelopes. Their active normalizer supports the emitted snake_case fields.
- Product employee reads use the new independent `EmployeeProduct` projection and return `SingleEmployeeProductResponse`.
- Registered product media is authoritative for new associations; authored media and legacy ID fields remain compatibility reads as required by R5 Stage 1.
- The backend exception handlers now produce the canonical `{ success:false, error:{code,message,details} }` envelope, including JSON-safe validation details.
- Product lists and collection-product lists preserve server pagination metadata. Collection lists, taxonomy lists, media assets, and the employee adapter have the pagination limitations recorded below.

## Confirmed Issues

These findings are reproducible from current source/schema comparison. A confirmed issue does not authorize implementation in this checkpoint.

| ID | Classification | Current evidence | Impact / smallest safe disposition |
|---|---|---|---|
| **API-051** | **CONFIRMED** | `frontend/src/services/api/productsApi.js` maps `compareAtPrice` as `p.compare_at_price ?? p.compareAtPrice`; the canonical backend DTO emits `compareAtPrice`. | The active backend path is currently safe because it does not emit both keys, but mixed payloads select the non-canonical value. Change to canonical-first while retaining the snake_case fallback and add a conflicting-dual-key regression test. |
| **API-075** | **CONFIRMED** | `ProductContentFields.pricing` remains `Optional[Dict[str, Any]]`; `AdminProduct` and `EmployeeProduct` use typed `PricingDetail`. OpenAPI therefore describes request pricing as an unstructured object. | Request-side contract gap, not a response failure. Type only after confirming accepted legacy pricing keys. No database migration is needed because pricing is JSONB. |
| **API-114 / API-115 / API-116 / API-139 / PF3-N10 residual** | **CONFIRMED residual** | The normative product status vocabulary and review-state documentation were corrected, but OpenAPI still describes product `status`, `review.state`, and `availability` as unconstrained strings. `availability` remains free-form in the response schemas. | The original six-vs-four documentation error is fixed; the OpenAPI response annotation criterion remains unmet. `availability` requires a real-data vocabulary check before tightening. |
| **STEP11-RESP-001** | **CONFIRMED** | `CollectionResponse.type`, `status`, and `displayStatus` are declared as `str`; `CollectionTypeEnum` and the collection status vocabulary are used on request models, not response fields. | The collection response contract is less precise than the documented lifecycle/type vocabulary. Add response typing only after checking production values; preserve all existing lifecycle behavior. |
| **STEP11-RESP-002** | **CONFIRMED** | `/api/v1/media/register`, `/api/v1/media/assets`, `/api/v1/admin/taxonomy/metrics`, and `/api/v1/admin/taxonomy/product-counts` have no `response_model`; live and checked-in OpenAPI both expose `{}`. Runtime/client shapes are known: register returns `media/assigned/assignment`, assets returns `items`, metrics returns collection/category/subcategory counts, and product-counts returns `counts`. | Documentation and client-generation gap. Add response DTOs and route declarations; do not alter the successful wire shape. This requires no migration. |
| **API-125 / API-126 / API-140** | **CONFIRMED residual** | Media asset `status` and product-media `role` remain free-form string fields in the response/schema path, even though upload/register input allowlists are now enforced. | Add response enums only after confirming stored legacy values; do not rewrite or discard existing media rows. This is a schema/OpenAPI change, not a migration by itself. |
| **STEP11-ERR-001** | **CONFIRMED** | The custom handler returns the canonical validation envelope, but generated OpenAPI 422 responses still reference FastAPI `HTTPValidationError`. The same documentation issue affects routes whose runtime errors are handled by the canonical AppException/HTTPException handlers. | The checked-in document equals the live generated document, but both describe the wrong error response. Add reusable canonical error response components and explicit route error responses without changing runtime error semantics. |
| **STEP11-ERR-002** | **CONFIRMED** | Several active media API functions (`apiGetMediaStorageStatus`, `apiResolveMediaReferences`, `apiGetMediaObjectMeta`, `apiGetProductMediaSet`, uploads, and delete) catch errors and return only `{ok:false,error,status}`. They do not preserve `code`, `details`, `data`, or `isNetworkError` as required by `API_CONTRACT.md` §5. `apiRegisterMediaObject` and `apiListMediaAssets` already use `handleError`. | Media validation/authorization failures lose structured details at the frontend boundary. Route these catches through `handleError`, retaining the existing human-readable fallback messages and success shapes. |
| **STEP11-EMP-001** | **CONFIRMED, compatibility-sensitive** | General `EmployeeResponse` and `EmployeeProfileDTO` have no camelCase serialization aliases. Runtime output includes `full_name`, `created_at`, `force_password_change`, `profile.employee_code`, `department_id`, and similar snake_case fields, while `API_CONTRACT.md` §3.2 requires camelCase responses. `employeesApi.js` and `authApi.js` actively read the snake_case form. | This is a real documentation/runtime deviation, but removing snake_case without a caller census would break active consumers. Treat as a separate compatibility change: update consumers/tests first, then introduce the canonical output deliberately. Do not remove fields or aliases in Step 11 without approval. |
| **STEP11-COL-001** | **CONFIRMED, low severity** | `SectionAttributes` still renders a “Collections” editing control and updates `draft.collections`, while `ProductEditor` marks `collection`, `collections`, and `collectionIds` command-owned and removes them before product persistence. The backend also rejects collection-write keys. | An operator can change a visible editor control and receive no collection membership write. The smallest safe fix is to make this field read-only/remove it from the product editor and direct operators to the collection assignment surface. This preserves Block 8 collection ownership and is not a collection redesign. |
| **API-088** | **CONFIRMED cleanup decision** | `/api/v1/admin/workflow/metrics` remains a live, documented OpenAPI route duplicating `/api/v1/admin/products/metrics`; no active frontend caller was found. | Do not remove the route without a consumer census. Retain it as a compatibility alias, explicitly document/deprecate it, and use one canonical frontend endpoint. |
| **STEP11-INT-001** | **CONFIRMED process gap** | Existing repository tests cover the product lifecycle, visibility, media lifecycle, collection assignment, employee projection, and error cases in separate suites. No single repository-resident current test walks the complete §22.3 sequence from create through edit, hidden draft, submit, approve-without-publish, missing-media rejection, registered-media publish, storefront read, taxonomy archival, unpublish/archive, and restore. A historical report records a 53-check live-server walkthrough, but that external run is not a reproducible repository test and is unavailable for current verification. | Step 11’s required integration deliverable is not yet present. Add one real ASGI/ORM integration flow after approval, with each HTTP status, envelope, response projection, and persisted state asserted. Keep PostgreSQL/browser limitations explicit. |

### Employee-adjacent historical IDs rechecked

These IDs are assigned to Phase 4.A in the historical register, but they affect the required employee integration-flow assessment and are therefore explicitly classified rather than silently omitted.

| ID | Classification | Current evidence / disposition |
|---|---|---|
| **API-141** | **CONFIRMED; DEFERRED outside the minimum Step 11 pass** | Backend `EmployeeService.get_employee`, update, status, permission, reset, and delete paths resolve the route parameter as `UserModel.id` only. The active admin employee cache exposes the UUID as `id` but uses the public `employeeId`/employee code for admin detail actions and mutations. This can produce `404 Employee not found` for real server-backed records. Use the UUID for transport while retaining employee code as the display/assignment identifier; add an authenticated regression flow in a separate employee block. |
| **API-146 / API-147** | **CONFIRMED compatibility gap; DEFERRED** | Employee list/attendance requests currently send the backend’s snake_case `page_size`, so they work despite the documented camelCase convention. The employee list adapter drops `page_size` and `total_pages`, and attendance returns only `items`/`total`. Preserve the current working requests, then coordinate casing and metadata in the broader pagination block. |
| **API-153** | **ALREADY FIXED** | `UserDTO` and `AuthService._build_user_dto` now expose employee code at the top level under both `employee_code` and `employeeCode`. The old `/auth/me` missing-code finding is stale. |
| **API-159** | **COMPATIBILITY REQUIREMENT / INFORMATIONAL** | `profile.employee_code` is the current `EmployeeResponse` location and the active normalizer reads it first. The top-level `u.employee_code` fallback is currently unused for that response shape, but it is harmless defensive compatibility and must not be deleted without a caller census. |
| **API-049** | **DEFERRED** | `/employee/me/assigned-products`, `/employee/me/workflow`, and `/employee/desk` remain explicit placeholders. They require employee operations/analytics scope, not response alias cleanup. |
| **API-219 / API-231** | **CONFIRMED but DEFERRED to employee-account scope** | Backend password reset can generate a temporary password but returns only `BaseResponse`; the frontend credential sheet expects `temporaryPassword`, while `apiAdminResetEmployeePassword` discards any such field. Fixing this requires an approved credential-delivery/security decision and is not part of Step 11. |
| **API-226** | **DEFERRED / OUTSIDE SCOPE** | Legacy local employee seed/data modules remain in the repository, but server-backed employee synchronization is the active path. Do not delete them as part of response cleanup. |

### Domain-flow conclusions

**Product.** The create/draft, server ID allocation, partial patch, identity conflict, taxonomy validation, lifecycle, visibility, cache invalidation, and employee product projection paths are connected and protected by current tests. The remaining response issues are API-051, untyped request pricing, missing OpenAPI enum declarations, and the missing single end-to-end flow. `AdminProduct.pricing` and `EmployeeProduct.pricing` are already typed; only request-side `ProductContentFields.pricing` is untyped.

**Collection.** Block 8 now makes collection membership collection-owned, validates product IDs before mutation, removes duplicates in input order, preserves MANUAL vs RULE_BASED behavior, and refreshes authoritative reads. The remaining active issues are the misleading product-editor control, untyped collection response lifecycle/type fields, and intentionally deferred pagination on collection list surfaces. Collection lifecycle semantics were not redesigned.

**Employee.** The product-specific GET/PATCH projection is safe and narrowed, uses explicit employee scope, and preserves assignment validation and null unassignment. General employee CRUD/self-service is database-backed in code but emits the legacy snake_case DTO shape. The employee self-service assigned-products, workflow, and desk routes remain explicit placeholders outside the direct Phase 3 product dependency. A live PostgreSQL/authenticated employee flow was not available.

**Media.** The registered-media path is connected: upload → register → association → media-set read → product projection/publish gate → served object bytes. R5 Stage 1 is preserved. The missing response models and incomplete frontend error preservation are confirmed; legacy fields and lifecycle behavior must remain until R5 Stage 2 is approved.

**Errors.** Backend runtime errors are canonical and JSON-safe in the current code. Product, collection, and employee API modules generally preserve `ApiError` fields via `handleError`. Media has several older catch blocks that flatten them. The OpenAPI error descriptions remain inaccurate even though the document is byte-for-byte synchronized with `app.openapi()`.

**Pagination.** Product and collection-product responses use the product pagination envelope. Employee backend pagination is real, but `apiAdminListEmployees` returns only `ok/items/total` and drops `page`, `page_size`, and `total_pages`. Collection list routes and media asset listing are not paginated. These are retained as the existing pagination follow-up rather than silently expanded into Step 11.

## Already Fixed / Stale

| IDs / finding | Current classification and evidence |
|---|---|
| **PF3-N01** | **ALREADY FIXED.** `_json_safe()` is active in the validation handler; the full backend suite and targeted error tests pass. Validation details no longer turn a 422 into a 500. |
| **PF3-N02, PF3-N15** | **ALREADY FIXED.** The admin editor calls `apiAdminGetNextId` and creates through the server-authoritative draft path. The old zero-call-site finding is stale. |
| **PF3-N16** | **ALREADY FIXED.** The editor now calls the server availability endpoint for SKU/slug checks; the historical zero-call-site finding is stale. |
| **PF3-N03, PF3-N04** | **ALREADY FIXED.** Block 3 service-layer SKU/slug conflict handling, supplied-slug behavior, and canonical 409 tests are present. Database uniqueness races remain deferred. |
| **PF3-N05** | **ALREADY FIXED.** The editor fetches the authoritative product on edit mount and re-baselines from the response. |
| **PF3-N06** | **ALREADY FIXED.** The subcategory status gate is present and covered by the visibility suite. |
| **PF3-N08** | **ALREADY FIXED for the approved Block 8 boundary.** Collection-owned explicit product IDs are authoritative; product writes no longer own membership; validation, ordered deduplication, and authoritative-aware admin reads are covered. |
| **PF3-N09 / R5 Stage 1** | **ALREADY FIXED for Stage 1 only.** Frontend product writers omit `mediaIds`, `primaryMediaId`, and `galleryMediaIds`; no registered-media projection PATCH remains. Backend acceptance and legacy reads remain intentionally. R5 Stage 2 is not fixed and remains deferred. |
| **PF3-N11** | **ALREADY FIXED.** `EmployeeProduct` is independent of `AdminProduct`; employee GET/PATCH responses exclude review history, price history, and actor/publication audit fields. |
| **API-085 / API-132 and API-086 / API-133** | **ALREADY FIXED on the requested write paths.** Namespace and product-media role validation are enforced before writes; the role vocabulary is case-insensitive with caller casing preserved as documented. |
| **API-170, API-188, API-211** | **ALREADY FIXED.** Customer submit-review authorization, explicit admin token use, and multi-value query encoding are protected by current source/tests. |
| **API-203 / API-202 / API-189** | **ALREADY FIXED at the product-editor API boundary.** The editor’s category/subcategory options use admin taxonomy endpoints and server IDs, not the public ACTIVE-only API. Residual static validation/display dependencies are listed under Deferred. |
| **API-204** | **ALREADY FIXED.** Product create/update taxonomy resolution validates existence, active assignability, category/subcategory relationship, and canonical storage without adding FK columns. |
| **API-205 / API-104** | **ALREADY FIXED / compatibility requirement.** Non-null employee assignment is checked against the authoritative employee code; `null` remains the supported unassignment value. `API-104` being optional is not a defect. |
| **API-218, API-047 / 048 / 181 / 212, API-054 / 082 / 083 / 084 / 101 / 142 / 143** | **ALREADY FIXED.** Payload whitelist, partial PATCH, aliases, coercions, filter arrays, pagination alias, and product-write cache invalidation are covered by current tests. |
| **API-114 / API-115 / PF3-N10 original finding** | **ALREADY FIXED for normative documentation.** `API_CONTRACT.md` now declares four product statuses and the separate review-state vocabulary. The OpenAPI annotation residual remains confirmed above. |
| **API-050** | **COMPATIBILITY REQUIREMENT, not a removal target.** `originalPrice` is already canonical-first. The snake_case/MRP/compare fallbacks are defensive compatibility branches; active consumers and legacy payloads have not justified deleting them. |
| **API-059 / API-097 / API-118 / API-119 / API-120 and API-400–409** | **ALREADY FIXED / INFORMATIONAL.** The collection alias/date/response behavior and the nine media route connections are matched at the active runtime/client boundary. Schema precision gaps are separately recorded above. |
| **PF3-N14** | **STALE AUDIT.** The historical reference to a nonexistent `catalog_collection_product` table is not the current storage design. Collection membership intentionally remains in existing JSONB storage; Block 8 documents and tests that boundary. |
| **API-164 / API-305 and the old “200 `{ok:false,error}` coupon” conclusion** | **STALE AUDIT.** Current `POST /offers/validate` raises canonical `NotFoundException`/`BusinessLogicException` for failures. Frontend special-case code/comments remain compatibility cleanup, but the old runtime failure claim is no longer true. |
| **API-087 legacy employee-route auth finding** | **STALE AUDIT.** Current hidden legacy employee routes include `get_current_admin` dependencies. They should not be treated as unauthenticated based on the older report. |
| **API-180** | **SPLIT.** Category ACTIVE visibility and the subcategory gate are fixed. The unknown/empty-category fail-closed half is PF3-N07 and remains blocked. |
| **PF3-N13** | **SPLIT.** The old claim that department gates server ID allocation is stale: the editor now allocates using the server and category. A local/static department derivation and publish-validator dependency remain and are deferred with the broader static taxonomy boundary. |
| **API-223** | **SPLIT.** The product write-path dependency on static taxonomy was removed for category/subcategory selection. Static modules remain load-bearing for department derivation, local publish validation, route/review helpers, and display surfaces; they are not safe to delete in Step 11. |

### Repository-wide Phase 3 issue-ID coverage

For completeness, the following table classifies every `API-*` row that the repository-wide `API_CONTRACT_AUDIT.md` assigns to a Phase 3 dependency, in addition to the `PF3-N01`–`PF3-N17` register classified above. Ranges are used only where the historical register itself defines a range. IDs assigned to other phases are not silently re-opened as Step 11 work.

| IDs | Classification | Current disposition |
|---|---|---|
| **API-035, API-037, API-069, API-089, API-168, API-169, API-187, API-214** | **DEFERRED** | Settings/notifications routing, validation, and memory-fallback cleanup are outside response-contract Step 11. |
| **API-036, API-038, API-039, API-065–068** | **ALREADY FIXED** | Current settings payload wrapping, category field mapping, and response adapters match the recorded fixed behavior. |
| **API-052** | **COMPATIBILITY REQUIREMENT / DEFERRED** | Offer legacy aliases remain a separate offer-contract decision; no response field is removed here. |
| **API-061** | **ALREADY FIXED** | A dedicated frontend consumer for the admin subcategory activate route exists. |
| **API-062** | **DEFERRED** | Wishlist list-of-saved-products endpoint is Phase 3.D/domain work, not this audit. |
| **API-063** | **CONFIRMED; covered by STEP11-RESP-002** | The taxonomy metrics/product-count routes are active backend/client integrations but have no response models. |
| **API-064** | **CONFIRMED** | Duplicate offer-validation consumers remain; retain one canonical implementation and preserve canonical backend failures. |
| **API-075** | **CONFIRMED / DEFERRED** | Untyped request pricing is recorded above; typing requires an accepted-key compatibility census. |
| **API-076–079, API-082–084** | **ALREADY FIXED / INFORMATIONAL** | Current request field types and coercions match the intended behavior; no cleanup is needed in Step 11. |
| **API-085 / API-086 / API-132 / API-133** | **ALREADY FIXED** | Namespace and media-role allowlists are now enforced on the relevant write paths. |
| **API-088** | **CONFIRMED; covered above** | Duplicate workflow metrics route has no active caller; retain/document as a compatibility alias pending approval. |
| **API-095–098, API-103, API-117, API-121 / API-122, API-129, API-135, API-142 / API-143** | **ALREADY FIXED / INFORMATIONAL** | Current optional fields, category status, offer/notification vocabulary, field mapping, multi-value filters, and product pagination alias are compatible. |
| **API-099 / API-136** | **DEFERRED** | Offer `false` boolean round-trip behavior remains Phase 3.C cleanup; it is not a response-contract fix in this pass. |
| **API-104** | **COMPATIBILITY REQUIREMENT** | Optional employee assignment and explicit `null` unassignment are intentional and preserved. |
| **API-114 / API-115 / API-116 / API-139** | **SPLIT: ALREADY FIXED documentation + CONFIRMED OpenAPI residual** | Normative status/review documentation is corrected; OpenAPI enum precision, especially free-form availability, remains recorded above. |
| **API-118 / API-119 / API-120** | **CONFIRMED residual** | Collection status/type/display-status response typing is the `STEP11-RESP-001` finding above. |
| **API-125 / API-126 / API-140** | **CONFIRMED residual** | Media status/role remain unconstrained response strings; annotate only after preserving legacy data and checking values. |
| **API-164** | **STALE AUDIT** | The historical inline-200 offer-validation failure claim is contradicted by current canonical exceptions. Duplicate consumers remain API-064. |
| **API-170** | **ALREADY FIXED** | Customer and insufficiently scoped employee submit-review calls are rejected by the current permission path. |
| **API-171 / API-173** | **DEFERRED** | Offer/settings super-admin UI affordance and authorization are outside Step 11. |
| **API-180** | **SPLIT** | Resolved category/subcategory visibility gates are fixed; unknown/empty-category fail-closed behavior is PF3-N07 and blocked. |
| **API-182** | **DEFERRED** | Aggregate subcategory-tree endpoint design is taxonomy work outside this response audit. |
| **API-190** | **ALREADY FIXED** | Current taxonomy adapters call dedicated `restore` routes rather than generic status PATCH. |
| **API-193** | **DEFERRED** | Local offer repository retirement is Phase 3.C/Phase 4 cleanup, not a response-shape change. |
| **API-197 / API-228** | **DEFERRED** | Local media repository and authored-media seed retirement are explicitly R5/Phase 4 work. |
| **API-203 / API-204 / API-205** | **SPLIT / ALREADY FIXED on current product paths** | Admin taxonomy selection, server taxonomy resolution, and employee-code validation are fixed. Remaining static read dependencies and migration/concurrency risks stay deferred. |
| **API-206 / API-207 / API-208** | **DEFERRED / NOT VERIFIABLE** | CDN/provider, content-signature, and deployed object-key verification require infrastructure or deployed-data evidence. |
| **API-209** | **DEFERRED** | Admin taxonomy pagination remains the broader pagination follow-up. |
| **API-211** | **ALREADY FIXED** | Array query parameters use repeated keys through the current builder. |
| **API-213** | **DEFERRED / NOT REPRODUCIBLE AS WRITTEN** | Hook state/error handling is present; broader storefront cache/reactivity verification remains separate. |
| **API-216 / API-218** | **ALREADY FIXED / INFORMATIONAL** | Error-versus-empty state and the product write whitelist are present. |
| **API-223** | **SPLIT / DEFERRED residual** | Write-path static taxonomy dependence is removed; load-bearing read/display dependencies remain. |
| **API-227** | **DEFERRED** | Dead local coupon data is unrelated to the approved Step 11 response scope. |
| **API-400–409** | **ALREADY FIXED / INFORMATIONAL** | The nine media route connections are present; remaining schema/error precision is tracked as STEP11-RESP-002 and STEP11-ERR-002. |

## Deferred

These items are intentionally carried forward. They must not be “cleaned up” by deleting compatibility fields, changing lifecycle semantics, or starting another phase.

| ID / area | Disposition and reason |
|---|---|
| **PF3-N07** | **BLOCKED / UNCHANGED.** The fail-closed unknown-category default requires the plan’s Step 0 read-only reconciliation of real catalogue data. No PostgreSQL/data set is available. Keep the current fail-open behavior and its regression guards. |
| **R5 Stage 2** | **DEFERRED.** Do not remove backend `mediaIds`, `primaryMediaId`, or `galleryMediaIds`; do not reject legacy writes; do not remove authored-media fallback until the observation-window/caller census is reviewed and approved. |
| **API-116 / API-139 and product OpenAPI enums** | **DEFERRED pending data assessment.** Do not tighten `availability`, status, or review response validation against unknown production values without the real-data reconciliation. The code/document vocabularies and lifecycle behavior are preserved. |
| **API-075** | **DEFERRED from the minimum response-only pass unless explicitly approved.** It is a request-side typed-pricing change; type it only with a compatibility fixture/census and no silent field drops. |
| **PF3-N12** | **DEFERRED.** Explicit-null response semantics cross every projection. Current behavior and the documented no-op/empty rendering behavior are not redesigned here. |
| **PF3-N17** | **MIGRATION REQUIRED / DEFERRED.** The duplicate `assigned_employee_id` indexes require a later Alembic cleanup. No migration is created during audit, and the cleanup is Phase 4 database hygiene. |
| **API-213** | **DEFERRED / not reproducible as written.** The current hook has state-backed results and an error state. A broader storefront cache/reactivity phase is still needed before claiming the old issue is fully closed. |
| **API-209 and related list pagination** | **DEFERRED.** Taxonomy list pagination, media asset pagination, and preservation of employee `total_pages` are broader pagination work. No pagination behavior is changed in this audit. |
| **API-197, API-228, API-206 / 207 / 208** | **DEFERRED to media infrastructure/Phase 4.** Local media register retirement, authored-plate retirement, CDN/provider behavior, content-signature details, and object-store infrastructure are not Step 11 response cleanup. |
| **Residual API-223 / PF3-N13 static dependencies** | **DEFERRED.** Remove or replace static department, local publish-validator, route, and display dependencies only under an explicit taxonomy/storefront phase. Do not remove static files based on the old “likely dead” audit wording. |
| **Employee self-service placeholders** | **DEFERRED outside the direct product projection scope.** `/employee/me/assigned-products`, `/employee/me/workflow`, and `/employee/desk` are explicitly placeholder responses. Implementing them requires a separate employee operations/analytics scope, not a response alias cleanup. |
| **Employee response casing (`STEP11-EMP-001`)** | **DEFERRED pending active-consumer census.** Preserve the current snake_case fields and normalizer fallbacks. Any canonical camelCase migration must be additive or coordinated and separately approved. |
| **Lifecycle semantics** | **DEFERRED and protected.** Do not redesign approve/publish, archive/restore, stale approval retention, publication audit retention, or concurrent lifecycle locking. The current documented behavior and tests remain authoritative. |
| **Phase 4 / RBAC / checkout / orders / payments / wishlist** | **DEFERRED.** No unrelated domain redesign is included. Block 8 collection ownership, employee-code validation, narrowed projection, explicit scopes, canonical errors, and authoritative refreshes remain protected. |

## Not Verifiable

The following are not failures and were not represented as failures:

- PostgreSQL-specific JSONB execution, transaction/concurrency behavior, real database row counts, duplicate SKU/slug data, collection/product data reconciliation, employee-code data, or the Step 0 PF3-N07 report. `DATABASE_URL` is unset.
- The PostgreSQL-dependent media schema/integration check and real media-dataset checks. These are **SKIPPED**, not failed.
- Browser/DOM execution, hard-refresh behavior, rendered editor collection affordances, button state, and browser-to-deployed-backend flows. The available frontend tests use mocked HTTP/static guards; they are not browser verification.
- Live authenticated employee and collection flows against persisted PostgreSQL rows.
- A production caller/observation-window census for R5 Stage 2, legacy media fields, employee response casing, or API aliases.
- True concurrent writers for product lifecycle, collection JSONB assignment, service-layer uniqueness, or media registration.
- Real Redis/CDN/external object-store behavior and deployed origin/provider configuration.

## Migration Required

### No migration required for the minimum Step 11 response pass

The following are service/schema-documentation/frontend changes over existing storage and require no Alembic revision:

- API-051 normalizer precedence;
- media frontend error-field preservation;
- response DTOs for media register/assets and taxonomy metrics/counts;
- canonical error response documentation in OpenAPI;
- product/collection response enum annotations, **if** the approved data assessment confirms the vocabulary;
- the integration regression test;
- retaining/documenting the workflow metrics alias;
- removing or making the product-editor collection control read-only.

### Migration-required items that remain deferred

| Change | Migration status | Reason |
|---|---|---|
| Unique SKU constraint | **MIGRATION REQUIRED** | Existing `ix_catalog_product_sku` is non-unique. A duplicate-data cleanup/reconciliation must precede a unique index/constraint. Service-layer 409 handling does not close the race. |
| Unique slug constraint | **MIGRATION REQUIRED** | Existing `ix_catalog_product_slug` is non-unique. Same cleanup and concurrency requirement. |
| Remove the duplicate `assigned_employee_id` index (**PF3-N17**) | **MIGRATION REQUIRED** | `ix_catalog_product_assigned_employee` and `ix_catalog_product_assigned_employee_id` are both declared. Cosmetic DB hygiene is deferred to Phase 4. |
| Add `category_id` / `subcategory_id` FK columns | **MIGRATION REQUIRED** | New columns, backfill, and treatment of unresolved legacy strings would be required. This is explicitly rejected for Phase 3 because service-layer taxonomy resolution already exists. |
| Add a relational collection-product association table/FKs | **MIGRATION REQUIRED** | Would replace the approved JSONB ownership design and exceed Block 8. Do not start it in Step 11. |
| Drop legacy product media columns in R5 Stage 2 | **MIGRATION REQUIRED if DB columns are dropped** | Stage 2 first needs the observation window/caller census and approval. No legacy columns are removed now. |
| Add row-version/locking infrastructure for lifecycle/collection concurrency | **MIGRATION REQUIRED if schema-backed** | No speculative migration or lifecycle redesign is permitted. |

No migration file was created or changed during this audit. The absence of PostgreSQL means duplicate counts and data cleanup scope remain unmeasured, not zero.

## Recommended Fix Order

Only proceed after this audit and plan are explicitly approved.

1. **Freeze compatibility decisions.** Confirm that Block 8 collection ownership, employee-code validation, narrowed employee projection, explicit scopes, canonical errors, authoritative refreshes, PF3-N07, R5 Stage 1, lifecycle semantics, and all legacy read fields remain protected.
2. **Add response-contract fixtures/tests first.** Capture product, collection, employee-product, general employee, media-set, media-register, asset-list, taxonomy-metrics, and canonical-error shapes. Assert casing, wrappers, nullable behavior, pagination metadata, and preserved legacy fallbacks.
3. **Fix the smallest frontend defect.** Change API-051 to canonical-first while retaining the compatibility fallback. Do not remove API-050 branches.
4. **Preserve structured media errors.** Replace only the media API flattening catches with `handleError`; retain local input-validation messages and all successful response fields.
5. **Close the OpenAPI documentation gaps.** Add response DTOs for the four currently untyped routes and canonical error response components. Decide the workflow metrics alias as “retained compatibility alias” and document it rather than deleting it.
6. **Handle enum annotations only after data review.** Run the plan’s read-only reconciliation when PostgreSQL is available; then separately approve status/review/availability and collection response typing. Do not guess production vocabulary.
7. **Clarify collection ownership in the editor.** Remove or make the product-editor collection field read-only and link to the collection assignment surface. Do not reintroduce product-side membership writes.
8. **Add the single §22.3 integration test.** Exercise create, partial save, authoritative read, edit/history, hidden draft, submit, approve-without-publish, missing-media 422, registered-media registration, publish, storefront list/detail, category/subcategory archival, unpublish, archive, and restore. Assert HTTP status, canonical envelopes, DTO casing, DB state, media authority, and cache freshness at every step.
9. **Run protected and full verification.** Targeted suites, complete backend/frontend suites, build, OpenAPI exact comparison, `git diff --check`, and migration-tree checks. Report PostgreSQL/browser/production limitations separately.
10. **Keep migration and Phase 4 work out.** Unique constraints, duplicate cleanup, schema ownership redesign, R5 Stage 2, lifecycle locking, broader pagination, static-data retirement, and employee operations remain separately approved work.

## Recommended Block Split

| Block | Approved-after-audit scope | Exit evidence |
|---|---|---|
| **11A — Normalizer and error preservation** | API-051; media API `handleError` preservation; regression fixtures. | Canonical-first precedence, structured media errors, all protected media/R5 tests green. |
| **11B — Response schema/OpenAPI alignment** | DTOs for register/assets/taxonomy metrics/counts; canonical error response documentation; workflow metrics retained/deprecated alias. Enum annotations only after data approval. | Runtime/check-in OpenAPI exact match; response snapshots; no wire-shape removal. |
| **11C — Final product integration flow** | One real ASGI/ORM test implementing the plan’s §22.3 flow, including registered-media authority and lifecycle/visibility guards. | Every step asserts status, envelope, projection, persistence, and expected hidden/present state. |
| **11D — Collection/editor clarity** | Only the minimal removal/read-only treatment of the product-editor collection control; no ownership redesign. | Product payload remains free of membership writes; collection assignment remains the sole write path. |
| **Separate later blocks** | Employee casing migration, pagination, typed pricing, PF3-N07, R5 Stage 2, uniqueness/FK/index migrations, static-data retirement, employee operations, Phase 4/RBAC. | Separate approval, data evidence, migration decision, and caller census as applicable. |

## HARD STOP

- This audit report is the **only new repository artifact** created in this checkpoint.
- No application source, tests, migrations, OpenAPI, or `API_CONTRACT.md` were modified for Step 11.
- No migration was created.
- PF3-N07 remains **UNCHANGED / DEFERRED** and is blocked on real catalogue reconciliation.
- R5 Stage 2 has not started; backend legacy media fields and lifecycle compatibility remain.
- Phase 4, lifecycle redesign, RBAC redesign, and unrelated domain fixes have not started.
- No commit or push was made.

**HARD STOP: implementation must not begin until the user explicitly approves this audit and the recommended Step 11 scope/block split.**