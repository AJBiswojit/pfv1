# Phase 3 R5 Stage 1 — Frontend Media-Write Cleanup

**Date:** 2026-08-28  
**Branch:** `arena/01a04924-pfv1`  
**Scope:** R5 Stage 1 only  
**Verdict:** **PASS**

## 1. Scope

Implemented only the frontend half of Phase 3 §23 R5:

- the frontend no longer forwards `mediaIds`, `primaryMediaId`, or
  `galleryMediaIds` in product create/update payloads;
- the registered-media-to-legacy-product projection PATCH was removed;
- registered media continues to be written only through `POST /media/register`
  and read through the registered media-set and product DTO APIs;
- authored `image`, `hoverImage`, and `additionalImages` remain writable
  product fields;
- R5 Stage 2 was not implemented.

No backend source, database schema, Alembic migration, OpenAPI-visible contract,
media lifecycle/status semantics, or unrelated product logic was changed.

## 2. Source-of-truth documents read

Before editing, the following repository documents were read and used as the
source of truth:

1. `PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_PLAN.md`
2. `PHASE_3_BLOCK_7_IMPLEMENTATION_REPORT.md`
3. `PHASE_3_BLOCK_7_MEDIA_GATE_IMPLEMENTATION_REPORT.md`
4. `PHASE_3_BLOCK_7_MEDIA_SOURCE_OF_TRUTH_DECISION.md`
5. `API_CONTRACT.md`

The implementation follows the approved Block 7 Option A decision: the publish
gate accepts a registered `is_primary=true` association while retaining legacy
fallbacks during the transition. That decision makes R5 Stage 1 safe to land.

## 3. Audit findings before editing

### Frontend writers

- `buildAdminProductPayload()` in
  `frontend/src/services/api/productsApi.js` was the central product payload
  writer for the three ID fields.
- Its callers were the admin create/save service and the legacy
  `catalogRepository.syncProductToBackend()` admin/employee paths. Removing the
  three properties from this builder covers all current product API paths that
  use it.
- `productWorkflow.setPrimaryMedia()` still writes legacy claim fields into
  the local compatibility catalogue record for its unregistered/legacy claim
  branch. This is retained for Stage 2 compatibility; its subsequent backend
  payload now goes through the cleaned builder and does not send those fields.
- `buildProductMediaPatch()` derived IDs and URLs from registered media, and
  `syncProductMediaFromServer()` sent that object through
  `PATCH /admin/products/{id}`. This was the registered-media projection writer
  and was removed.

### API payload forwarders

The current source audit found one central product payload forwarder:
`buildAdminProductPayload()`. Its active callers are:

- `services/admin/productAdminService.js` — admin draft create and product save;
- `services/catalogRepository.js` — admin/employee update and legacy create
  compatibility paths.

The media lifecycle uses `services/api/mediaApi.js` and `POST /media/register`
independently of the product payload.

### Consumers

The three fields still occur in read/compatibility code, as required for this
stage:

- `catalogRepository.js` normalizes and reads legacy claim data;
- `media/productMediaSet.js` provides legacy fallback and compatibility reads;
- `productWorkflow.js` and `workflow/productPublishValidator.js` use legacy
  claims for local grouping/ownership/review compatibility;
- product cards/previews/review panels and admin media surfaces consume
  backend/read-model fields;
- retired/local workflow fixtures retain historical claim-shaped data.

These are not current registered-media product API writers. No additional active
frontend product API writer was found beyond the expected builder paths and the
removed projection writer. There is no frontend module named
`ProductContentFields`; the backend schema was intentionally left untouched.

### Authoritative vs legacy/derived

- **Authoritative write:** `POST /media/register` creates/updates the
  `media_product_media` association and primary/order state.
- **Authoritative reads:** `GET /media/products/{id}/media-set` and backend
  admin/storefront DTOs; registered media already wins when present.
- **Legacy authored fallback:** `image`, `hoverImage`, and
  `additionalImages`; these remain valid product content and remain in the
  product payload builder.
- **Legacy ID fields:** retained as read/compatibility data for Stage 1, but no
  longer forwarded as product write state.

## 4. Files changed

### Source

- `frontend/src/services/api/productsApi.js`
  - removed the three legacy ID properties from `buildAdminProductPayload()`;
  - retained authored media field normalization.
- `frontend/src/services/media/productMediaService.js`
  - removed `buildProductMediaPatch()`;
  - removed the product PATCH from `syncProductMediaFromServer()`;
  - changed the helper to read the media-set and fresh admin product DTO only,
    update the shared server cache, and report a read refresh;
  - primary selection and reorder still re-register through `/media/register`.
- `frontend/src/components/media/MediaUploadForm.jsx`
  - changed the post-registration follow-up from a product save to a read-only
    authoritative refresh and corrected the user-facing status text.
- `frontend/src/components/media/ProductMediaManager.jsx`
  - corrected lifecycle copy to describe register → read rather than a product
    projection save.
- `frontend/src/components/products/editorSectionsContent.jsx`
  - stopped copying registered DTO `image`/`additionalImages` back into the
    editor's authored fields through the manager callback. The authored URL
    input remains available, and the manager continues to display server media.
- `frontend/src/pages/admin/media/AdminProductMedia.jsx`
  - corrected the lifecycle panel title from `save` to `read`.

### Tests

- `frontend/tests/phase3ProductMediaHonesty.test.js`
  - rewrote the old “keys are still sent” locks into R5 Stage 1 locks;
  - proves all three keys are absent from the builder output;
  - proves authored media fields survive;
  - adds static guards for the central builder, media service, API writer bodies,
    read flow, and editor projection removal.
- `frontend/tests/phase7ProductMedia.test.js`
  - removed pure projection tests for `buildProductMediaPatch()`;
  - verifies media-set reads are verbatim;
  - verifies sync is GET-only and refreshes the product DTO/cache;
  - verifies primary selection and reorder make register calls plus reads, with
    no product PATCH.
- `frontend/tests/phase6MediaStorage.test.js`
  - updated the authored-media payload test to assert that all three ID fields
    are absent while authored URL references remain plain strings.

`API_CONTRACT.md` was not changed: its existing §12 correctly documents the
legacy ID fields as transitional accepted/stored fields scheduled for Stage 2,
while identifying registered associations as authoritative. `docs/openapi.json`
was not regenerated because this frontend-only change does not alter an
OpenAPI-visible contract.

## 5. Exact architectural change

### Old flow

```text
upload object
  → POST /media/register
  → media_product_media association
  → GET media-set
  → buildProductMediaPatch()
  → PATCH /admin/products/{id}
       mediaIds / primaryMediaId / galleryMediaIds
       image / additionalImages derived from registered URLs
  → GET product
```

The product payload builder also forwarded any legacy ID fields present in the
local record on ordinary product saves.

### New flow

```text
upload object
  → POST /media/register
  → media_product_media association (authoritative)
  → GET /media/products/{id}/media-set
  → GET /admin/products/{id} (backend registered-media DTO projection)
  → shared cache/read surfaces
```

Ordinary product writes now send authored product content only; the central
builder does not include the three legacy ID fields. There is no replacement
client-side projection and no new endpoint or database writer.

## 6. Test results

### Baseline

The first in-place baseline attempt occurred before editing, but the checkout
had no installed Python or frontend dependencies: `pytest` and `vite` were not
available, and the full frontend run could not import React. After installing
the declared dependencies, an immutable `git archive HEAD` snapshot was used as
the controlled pre-edit baseline (the current working tree was not used for
those baseline runs):

| Suite | Baseline |
|---|---:|
| Backend complete suite | **604 passed, 24 skipped, 0 failed** |
| Frontend complete suite | **356 tests: 355 passed, 1 skipped, 0 failed** |
| Frontend relevant old media suites | **62 passed, 0 failed** |
| Frontend build | **green** |

The initial dependency failure is an environment observation, not a code
failure. The controlled baseline above is the comparison point for final
results.

### Final

| Suite | Final |
|---|---:|
| Backend complete `python -m pytest -q tests/` | **604 passed, 24 skipped, 0 failed** |
| Frontend complete `npm test` | **356 tests: 355 passed, 1 skipped, 0 failed** |
| Frontend relevant media/Phase 3 suites | **62 passed, 0 failed** |
| Backend Phase 3 media + Phase 7 lifecycle | **74 passed, 0 skipped, 0 failed** |
| Backend Phase 6 media storage + media DB suites | **98 passed, 0 skipped, 0 failed** |
| `npm run build` | **green**; Vite transformed 2,675 modules |

The 24 backend skips are the existing PostgreSQL/real-dataset gated tests in
this environment. They are not related to this frontend change.

## 7. Static audit

The final static audit passed:

- `buildAdminProductPayload()` contains **0** property declarations for
  `mediaIds`, `primaryMediaId`, or `galleryMediaIds`;
- `productMediaService.js` contains **0** registered-media product PATCH calls
  and no `buildProductMediaPatch` implementation;
- admin service and catalog backend-sync writer bodies contain **0** of those
  three product-write properties;
- the only remaining exact source occurrences are classified read/legacy
  compatibility consumers and the expected local legacy claim branch;
- current active product API callers all route through the cleaned builder or
  dedicated lifecycle/media APIs.

The executable static guards added to
`phase3ProductMediaHonesty.test.js` also pass, so restoration of the old
property forwarding or projection path is detected by the test suite.

## 8. Integration verification

The existing backend integration harness was run:

```text
FullNewProductLifecycleTests
  test_create_upload_register_assign_save_publish_storefront_serves_bytes  PASS
  test_registered_media_alone_satisfies_the_publish_gate_and_read_model      PASS
```

That is **2 passed** against the real FastAPI routers, ORM, SQLite test
harness, local object storage, publish gate, admin reads, storefront reads, and
served media bytes. The frontend HTTP mock harness independently verifies that
registered-media refresh, primary selection, and reorder use no product PATCH.

No deployed browser-to-backend or external uvicorn harness is present in this
checkout, so a browser-executed end-to-end flow was not claimed. The
backend's existing lifecycle test intentionally contains direct product PATCH
steps because it tests the still-open backend write contract; it is not a
frontend-call-site test.

## 9. Mutation check

A temporary mutation restored forwarding of `mediaIds` to
`buildAdminProductPayload()` and ran the new Phase 3 media-honesty suite. The
suite failed as intended (`exit=1`), including:

- the runtime assertion that the payload omits the field;
- the static builder guard;
- the static product-writer guard.

The implementation was restored immediately, and the restored Phase 3/media
suite finished green. No mutation remains in the working tree.

## 10. Migration and OpenAPI status

- `backend/alembic/`: **untouched and clean**; no migration created.
- Database schema, association schema, status semantics, deletion semantics,
  role vocabulary, namespace validation, SKU/slug, taxonomy, visibility, and
  lifecycle logic: **untouched**.
- `API_CONTRACT.md`: **unchanged**, no Stage 1 correction required.
- `docs/openapi.json` vs `app.openapi()`: **exact match**;
  **201 paths, empty path delta, `exact_equal=True`**.

## 11. R5 Stage 2 remaining work

R5 Stage 2 remains intentionally deferred:

- remove `mediaIds`, `primaryMediaId`, and `galleryMediaIds` from
  `ProductContentFields` / the backend product write contract;
- allow the backend to reject those writes with 422;
- complete the deployed observation-window/caller census required by §23 R5;
- then remove or retire remaining legacy write-contract compatibility only after
  that census is reviewed.

The frontend local legacy readers and compatibility claim branch remain for this
reason. They do not cause the current product API paths to send the fields.

## 12. Known limitations / anything not verified

- No PostgreSQL server or deployed observation window is available. PostgreSQL
  schema-integrity checks and real-dataset media integration checks remain the
  existing skipped tests.
- No browser DOM, Playwright, or rendered UI execution was available. Upload
  dropzone rendering and button interaction are covered by source guards and
  the existing dependency-light HTTP harness, not browser automation.
- The generic low-level product API wrappers still accept a caller-supplied
  `body` by design; the source audit found no active frontend caller that
  bypasses the cleaned payload builder with these fields.
- Legacy local product claim data remains readable and is not removed in Stage 1.

## 13. Final PASS / FAIL verdict

**PASS.** R5 Stage 1 is complete within scope: frontend product payloads no
longer forward the three legacy media ID fields, the registered-media
projection PATCH is gone, registered media remains authoritative and readable,
authored media fields remain intact, tests and build are green, the backend and
OpenAPI/migration protections are clean, and R5 Stage 2 remains gated as
required.
