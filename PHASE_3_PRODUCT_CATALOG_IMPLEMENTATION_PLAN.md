# PHASE 3 IMPLEMENTATION PLAN — PRODUCT & CATALOG FOUNDATION

**Status:** PLANNING ONLY — no source, test, database or migration change was made.
**Branch:** `arena/01a04499-pfv1`
**Date:** 2026-08-27

---

## 0. How this plan was produced (evidence base)

Every claim below is marked with how it was established:

| Tag | Meaning |
|---|---|
| **[RUN]** | Executed in this session against the real code. Reproducible. |
| **[READ]** | Read directly out of the current source at the cited path/line. |
| **[UNVERIFIED]** | Could not be executed here; stated as a gap, not a fact. |

Two harnesses were used. Both live **outside** the repository (`/tmp/pf3_probe/`), were
run read-only, and wrote only to a throwaway SQLite file:

* `probe.py` / `probe2.py` — boot the **real** `app.main` FastAPI app with the **real**
  `ProductService`, **real** Pydantic schemas and **real** SQLAlchemy models, then replay
  the exact payloads the admin editor emits.
* `fe.mjs` — executes the **real** frontend modules (`productIdPrefixes.js`,
  `productsApi.js`, `data/catalog/taxonomy.js`) under the repo's own node loader.

PostgreSQL is **not installed in this sandbox** (`pg_isready`: command not found), so the
backend harness ran on `sqlite+aiosqlite` with the same JSONB→JSON compiler shim the
repository's own `tests/unit/test_phase6_media_db.py` uses. Anything that depends on
Postgres-only SQL is flagged **[UNVERIFIED]**.

### 0.1 Baselines re-verified in this session **[RUN]**

| Check | Command | Result |
|---|---|---|
| Backend tests | `pytest` in `backend/` | **333 passed, 24 skipped, 94 subtests passed** |
| Frontend tests | `npm test` in `frontend/` | **239 pass, 0 fail, 1 skipped** (240 total) |
| Unscoped `apiClient` calls | AST-window scan of `frontend/src/**` | **183 calls, 0 without an explicit `scope`** |
| `scopeForPath` references | `grep -rn scopeForPath src/` | **0** |
| `docs/openapi.json` vs live app | `app.openapi()` diff | **201 paths both sides; `ProductCreateRequest` 58/58, `ProductDraftRequest` 59/59, `ProductUpdateRequest` 58/58, `AdminProduct` 76/76 — zero drift** |

The Phase 2 verification numbers you quoted reproduce exactly.

### 0.2 One correction to the source documents

`PHASE_2_IMPLEMENTATION_REPORT.md` in this repository is **"Canonical Checkout Lifecycle,
Trust Model & Secure Guest Orders"** — it is *not* the taxonomy phase. The Phase 1/2
numbering in your brief refers to a later remediation track whose reports are **not
committed to this repo** (`find . -iname "*PHASE*"` returns only the six older
`PHASE_n_IMPLEMENTATION_REPORT.md` files, none of which is the taxonomy phase). The
taxonomy work itself **is** present in the tree and was verified directly instead:
`apiAdminActivateSubcategory` exists (`categoriesApi.js:212`), restore uses the dedicated
`POST /admin/subcategories/{id}/restore` and `POST /admin/collections/{id}/restore`
endpoints, and `apiListCategories` has **zero** call sites under `src/pages/admin` or
`src/components/admin`.

Treat the committed `PHASE_3…PHASE_6_IMPLEMENTATION_REPORT.md` files as a **different,
older numbering scheme**. This plan does not build on them.

---

## 1. Executive Summary

Phase 3 must fix a product-creation flow that fails for a reason **the audit never
recorded**, and a validation-error path that turns every rejected product payload into a
**500 instead of a 422**.

Four things dominate:

1. **"Save & continue" fails on the client, before any HTTP request is made.** The editor
   allocates the permanent product ID itself via `nextCanonicalProductId()`, which returns
   `null` unless `(department, category, subcategory)` matches a **hardcoded static
   taxonomy** in `src/data/catalog/taxonomy.js`. The Category selector is fed by
   `taxonomyRepository.categoryOptions()`, whose value is the **server's category UUID**;
   the Subcategory selector emits **subcategory names**. That triple can never match the
   static `entry.id === category` lookup. Verified: **[RUN]**
   `isCanonicalTaxonomyPath("women", "6f1c2b3a-…-c1", "Banarasi") → false`,
   `nextCanonicalProductId(...) → null`. `createAdminProduct` then short-circuits with
   `"A canonical Product ID must be allocated before creation."` — a local error, not a
   server one. Meanwhile the server owns a deterministic allocator,
   `GET /admin/products/next-id`, which has **zero frontend call sites**.

2. **The canonical 422 envelope cannot be rendered for product payloads.** Any Pydantic
   `model_validator`/`field_validator` that raises `ValueError` — including
   `_reject_lifecycle_and_unsupported` and `ProductDraftRequest.validate_product_id` —
   produces `RequestValidationError.errors()[*]["ctx"]["error"]` holding a **live
   `ValueError` object**. `app/core/error_handlers.py:65` hands `exc.errors()` straight to
   `JSONResponse`, which raises `TypeError: Object of type ValueError is not JSON
   serializable`. Verified **[RUN]**: `PATCH /admin/products/{id}` with `{"status":
   "PUBLISHED"}` → **HTTP 500 `INTERNAL_SERVER_ERROR`**; with `{"review": …}` → **HTTP
   500**; `POST /admin/products/draft` with `{"id": "bad id!"}` → **HTTP 500**. The
   operator sees "An unexpected error occurred. Please try again later." for what is a
   plain validation rejection. This is a **Phase 1 infrastructure defect that Phase 3
   surfaces**, and it is repo-wide, not product-only.

3. **Product identity and taxonomy are unenforced.** `catalog_product.category` and
   `.subcategory` are plain `String(100)` columns with **no foreign key**; there are no
   `categoryId`/`subcategoryId` fields anywhere in the request schema. Verified **[RUN]**:
   `PATCH /admin/products/{id}` with `{"category": "does-not-exist"}` → **HTTP 200**.
   Duplicate SKUs are accepted (**[RUN]** two rows with `sku = EXPLICIT-SKU-1`, both
   `201`), and `POST /admin/products` **silently discards the supplied slug**
   (**[RUN]** sent `my-explicit-slug` → stored `second-saree`).

4. **Storefront visibility is half a gate.** Verified **[RUN]**: `status=PUBLISHED` +
   `published=true` + category `ACTIVE` are enforced; **subcategory status is not checked
   at all** (a product under an `ARCHIVED` subcategory stays live); an **unknown or empty
   category fails open** (visible); `stock=0`/`availability=out-of-stock` is not a gate.

**Scope:** 11 findings in, 9 deferred, 12 already closed.
**Migration:** the core contract work needs **none**. One optional hardening step
(unique SKU/slug) does need a migration and is deliberately separated so it can be
declined without blocking Phase 3.

---

## 2. Verified Product Findings

Inventory of every product/catalog finding traced to a verdict. "Reproducible?" is the
answer **today**, from this session.

### 2.1 Product-domain register rows (`API_CONTRACT_AUDIT.md` §26, domain = Products)

| API ID | Audit Finding | Current State (verified) | Still Reproducible? | Dependency | Proposed Phase |
|---|---|---|---|---|---|
| API-050 | Normaliser's `original_price`/`mrp` branches are dead | `productsApi.js:161` unchanged: `p.originalPrice ?? p.original_price ?? p.mrp ?? p.compare_at_price`. Backend emits camelCase only (**[RUN]** 76/76 props camelCase). Dead branches confirmed. | **Yes** (dead code) | — | **Phase 3** |
| API-051 | `compareAtPrice` precedence reversed | `productsApi.js:162` unchanged: `p.compare_at_price ?? p.compareAtPrice`. `compare_at_price` never arrives. | **Yes** | — | **Phase 3** |
| API-054 | camelCase emitted via `alias=` | **[RUN]** `AdminProduct` serialises 76 camelCase props, **0** snake_case keys. | No — correct | — | closed |
| API-075 | `pricing.{mrp,sellingPrice,discountValue}` are numbers | `ProductContentFields.pricing: Optional[Dict[str, Any]]` — **fully untyped**. OpenAPI: `{"anyOf":[{"type":"object"},{"type":"null"}]}` **[RUN]**. | **Yes** (untyped) | — | **Phase 3** |
| API-082 | `lowStockThreshold` is int | `_coerce_int_stock` present; `int` in OpenAPI. | No — correct | — | closed |
| API-083 | `price` is int (coerced) | `_coerce_int_price` present; `int(float(v))`. | No — correct | — | closed |
| API-084 | Booleans are `Optional[bool]` | Confirmed in schema; `_sanitize_for_create` maps `None`→`False`. | No — correct | — | closed |
| API-088 | `GET /admin/workflow/metrics` has no frontend consumer | Route live at `products.py:418`. **[RUN]** it appears in `app.openapi()`. No caller in `frontend/src`. | **Yes** | — | **Phase 3** (document or retire) |
| API-101 | Partial PATCH works | **[RUN]** `PATCH {fabric:"Cotton"}` → 200, `description` preserved. `exclude_unset` confirmed. | No — correct | — | closed |
| API-104 | `employeeId` optional | Confirmed; see API-205. | **Yes** | employee | **Phase 3** |
| API-114 | "`product.status` enum matches" | **Contradicted.** `PRODUCT_STATUS_VALUES = ("DRAFT","PENDING_REVIEW","PUBLISHED","ARCHIVED")` (`schemas/catalog/product.py:17`); `API_CONTRACT.md` §3.3 declares `DRAFT, REVIEW, APPROVED, PUBLISHED, REJECTED, ARCHIVED`. **[RUN]** OpenAPI carries **no enum** — `AdminProduct.status` is `{"type":"string","default":"DRAFT"}`. | **Yes** (doc↔code split) | — | **Phase 3** |
| API-115 | "`product.review.state` enum matches" | Code: `NONE / PENDING / APPROVED / REJECTED`. `API_CONTRACT.md` declares no review-state enum. Undeclared on both sides. | **Yes** (undeclared) | — | **Phase 3** |
| API-116 / API-139 | `availability` has no enum | **[RUN]** `{"anyOf":[{"type":"string"},{"type":"null"}]}`. Free-form string, DB `String(30) default "in-stock"`. Duplicate finding. | **Yes** | — | **Phase 3** |
| API-142 | `category` filter accepts multi-value | `Query(None)` typed `Optional[List[str]]`; **[RUN]** `buildParams` uses `qs.append` for arrays. | No — correct | — | closed |
| API-143 | `pageSize` alias matches | Confirmed. | No — correct | — | closed |
| API-170 | `submit-review` accepts any authenticated user | **[RUN]** customer → **403** `"Customers cannot submit products for review."`; employee without `products.manage` → **403**; anonymous → **401**. | **No — FIXED** | — | closed |
| API-180 | `category.status=ACTIVE` gate not verified | **[RUN]** Gate **is** implemented for category (DRAFT/ARCHIVED category hides the product). **But** it fails open on unknown/empty category, and subcategory status is never consulted. | **Partially** | taxonomy | **Phase 3** |
| API-188 | `productAdminService.js` uses `getAccessToken()` with no scope | `productAdminService.js:53` now reads `getAccessToken("admin")`. | **No — FIXED** | — | closed |
| API-204 | `category`/`subcategory` are unvalidated FKs | **[RUN]** `PATCH {category:"does-not-exist"}` → **200**. No lookup anywhere in `create_product` / `update_product`. Columns are `String(100)`, **no FK**. | **Yes** | taxonomy | **Phase 3** |
| API-205 | `assigned_employee_id` is unvalidated | **[RUN]** `POST /admin/products/{id}/assign {"employeeId":"NOT-A-REAL-EMPLOYEE"}` → **200**, stored verbatim. | **Yes** | employee | **Phase 3** |
| API-211 | `buildParams` uses `qs.set` for non-arrays | Arrays take the `qs.append` branch (`productsApi.js:206-217`). | **No — FIXED** | — | closed |
| API-218 | Editor round-trips the full whitelist | **[RUN]** `buildAdminProductPayload` emits 45 keys for a fresh draft; **no** lifecycle key leaks on a server round-trip. | No — correct | — | closed |

### 2.2 Adjacent register rows that touch products

| API ID | Domain | Audit Finding | Current State (verified) | Reproducible? | Phase |
|---|---|---|---|---|---|
| API-047 / 048 / 181 / 212 | Catalog | `@cache` not invalidated on product writes | **[RUN]** archive a product → storefront list drops 5→4 on the next GET. `invalidate_product_cache` clears both the app cache and `fastapi-cache2`. | **No — FIXED** | closed (regression test only) |
| API-213 | Catalog | `useCatalogueQuery` returns one mutable snapshot | Hook now returns `useState` values (`useCatalogueQuery.js:236-249`) and documents a real error state. | Not reproducible as written | **Phase 4** (verify) |
| API-216 | Catalog | `useProducts` distinguishes error from empty | Informational. | — | none |
| API-223 | Catalog | `data/products/*.js`, `data/catalog/*.js` are "likely dead" | **Worse than reported — they are load-bearing.** `productIdPrefixes.js:1` imports `data/catalog/taxonomy`; `ProductEditor.jsx:44` imports `data/products/departments`; `editorSectionsBasics.jsx:19` imports `data/products/taxonomy`; `ProductCatalogSelector.jsx:9` imports `data/products/taxonomy`. | **Yes** | **Phase 3** |
| API-203 / 202 / 189 | Catalog | Public `/categories` may be consumed by admin | **[READ]** `catalogStore.hydrateCatalog()` (`catalogStore.js:204-227`) calls the **public** `apiListCategories({status:"ACTIVE"})`, `apiListCollections({status:"ACTIVE"})` and `apiListSubcategories(id,{status:"ACTIVE"})`. `taxonomyRepository.categoryOptions()` = `activeCategories()`. `editorSectionsBasics.SectionAttributes` feeds the product form's Category `<Select>` from it. | **Yes** | **Phase 3** |
| API-209 | Catalog | No pagination on `/admin/categories` | Taxonomy surface. | Yes | **Phase 4** |
| API-085 / 132 | Media | `namespace` unvalidated on `/media/objects` | **[READ]** `UploadService.store_upload(namespace: str = "products")` — no allow-list. | **Yes** | **Phase 3** (narrow) |
| API-086 / 133 | Media | `role` unvalidated on `/media/register` | **[READ]** `media.py:399` `role: str = Form("gallery")` written straight to `ProductMediaModel.role`. | **Yes** | **Phase 3** (narrow) |
| API-125 / 126 / 140 | Media | `media.status` / `media.role` have no enum | Confirmed; `status` `String(30) default "uploaded"`, `role` `String(30) default "gallery"`. | **Yes** | **Phase 3** (narrow) |
| API-197 | Media | Local media services still in source | `mediaRepository.js` keeps a `localStorage` register (`MEDIA_STORAGE_KEY`, line 789). | **Yes** | **Phase 4** |
| API-228 | Media | `data/media/seedMedia.js` likely dead | `productMediaSource.js` still resolves authored plates from `data/products` + `data/mediaPlaceholder`. | **Yes** | **Phase 4** |
| API-059 / 097 / 118 / 119 / 120 | Collections | Informational (populate_by_name, optional dates, enums match) | Confirmed informational. | — | none |

### 2.3 New findings — not in the audit at all

These were found by executing the flow. None appears in `API_CONTRACT_AUDIT.md`.

| ID | Sev | Layer | Finding | Evidence |
|---|---|---|---|---|
| **PF3-N01** | **P0** | backend / Phase 1 infra | The canonical 422 envelope **crashes** whenever a validator raises `ValueError`. `error_handlers.py:65` serialises `exc.errors()`, whose `ctx.error` is a live `ValueError`. Result: **HTTP 500 `INTERNAL_SERVER_ERROR`** for a validation rejection. | **[RUN]** `PATCH {status}` → 500; `PATCH {review}` → 500; `POST /admin/products/draft {"id":"bad id!"}` → 500. Traceback terminates at `starlette/responses.py:187 → json.dumps`. |
| **PF3-N02** | **P0** | frontend | Client-side product-ID allocation returns `null` for server-authoritative taxonomy ⇒ **Save & continue cannot create a product**. | **[RUN]** `nextCanonicalProductId([], "women", "<uuid>", "Banarasi") → null`; `isCanonicalTaxonomyPath("", "sarees", "banarasi") → false`. |
| **PF3-N03** | **P0** | backend | **Duplicate SKU accepted.** No uniqueness check on create; `ix_catalog_product_sku` is `unique=False` (`597f883749d8:115`). | **[RUN]** two `POST /admin/products` with `sku=EXPLICIT-SKU-1` → both **201**; table holds two rows. |
| **PF3-N04** | **P0** | backend | `POST /admin/products` **silently discards the supplied `slug`** (`create_product` unconditionally does `data["slug"] = slug` (slug generated from `req.name or new_id`) at `product_service.py:1120`). `POST /admin/products/draft` *does* honour it (`:1167`). The two create paths disagree. | **[RUN]** sent `my-explicit-slug` → stored `second-saree`. |
| **PF3-N05** | **P1** | frontend | The edit route never loads the record from the server. `ProductEditor.jsx:177` reads `catalogRepository.find(productId)` (an in-memory session cache, `let serverProducts = []`). `ProductEditor.jsx:581` renders **"Product unavailable"** when the cache is cold. There are exactly two `useEffect`s in the file (lines 197 and 266); neither fetches. | **[READ]** |
| **PF3-N06** | **P1** | backend | **Subcategory status is not part of the visibility gate.** Only `_category_status_map()` exists (`product_service.py:538`); there is no subcategory equivalent. | **[RUN]** `P-ACT-ARCHSUB` (ACTIVE category, ARCHIVED subcategory) is **visible** on `GET /products` and returns **200** on `GET /products/{id}`. |
| **PF3-N07** | **P1** | backend | Visibility gate **fails open** on unknown/empty category: `category_status_map.get(p.category, "ACTIVE") == "ACTIVE"`. | **[RUN]** `P-UNKNOWNCAT` and `P-NOCAT` are both **visible**. |
| **PF3-N08** | **P1** | backend | Product↔collection has **two unsynchronised representations**: `catalog_product.collections`/`.collection` (names, product-owned) and `catalog_collection.explicit_product_ids` (IDs, collection-owned). Neither validates the other. Product create/PATCH writes only the first; `PUT /admin/collections/{id}/products` writes only the second. | **[READ]** `product.py:75-76`, `collection.py:67`, `collection_service.py:502-524` |
| **PF3-N09** | **P1** | backend | `mediaIds` / `primaryMediaId` written through the product contract land **only** in the legacy JSONB columns. `media_product_media` rows are created **exclusively** by `POST /media/register`. Reads prefer registered associations (`_registered_media_view`), so once a product has any registered media the admin's product-form media edits are **silently ineffective**. | **[RUN]** `PATCH {mediaIds:["asset-x"], primaryMediaId:"asset-x"}` → 200, `image` still `""`. **[READ]** `media.py:424-433`. |
| **PF3-N10** | **P2** | contract | Product status vocabulary is **4 values in code, 6 in `API_CONTRACT.md`**. `REVIEW`, `APPROVED`, `REJECTED` are review *states*, not statuses. | **[READ]** `product.py:17` vs `API_CONTRACT.md` §3.3 |
| **PF3-N11** | **P2** | backend | `GET /employee/products/{id}` returns the **full 76-field `AdminProduct`**, including `review`, `history`, `priceHistory`, `createdBy`, `updatedBy`, `publishedBy`. | **[RUN]** |
| **PF3-N12** | **P2** | backend | Explicit `null` on a nullable field is written but **can never be read back**: `_to_admin` renders `p.fabric or ""`. `API_CONTRACT.md` §3.1 promises "explicit `null` values clear nullable fields" — the write happens, the contract cannot express it. | **[RUN]** `PATCH {fabric:null}` → 200, `fabric == ""`. |
| **PF3-N13** | **P2** | full chain | `department` is a first-class editor field that **gates ID allocation** but has **no backend column** and is dropped by `buildAdminProductPayload`. It is re-derived on edit from the static `data/products/departments.js` map. | **[RUN]** payload has no `department` key; **[READ]** `ProductEditor.jsx:123` |
| **PF3-N14** | **P3** | docs | `API_CONTRACT_AUDIT.md` §4.2 maps `PUT /admin/collections/{id}/products` to a table **`catalog_collection_product` that does not exist** anywhere in the codebase. | **[RUN]** `grep -rn catalog_collection_product backend/` → no hits |
| **PF3-N15** | **P3** | frontend | `GET /admin/products/next-id` — the server's deterministic ID allocator — has **zero call sites**. | **[RUN]** only the definition at `productsApi.js:433` |
| **PF3-N16** | **P3** | backend | `GET /admin/products/availability` (SKU/slug probe) has **zero call sites**; the editor validates SKU/slug uniqueness against the local session cache (`ProductEditor.jsx:213,220,228`). | **[RUN]** |
| **PF3-N17** | **P4** | database | `catalog_product` carries a duplicate index on `assigned_employee_id`: `ix_catalog_product_assigned_employee` and `ix_catalog_product_assigned_employee_id` (`597f883749d8:111-112`). | **[READ]** |

---

## 3. Findings Already Fixed

Closed by Phase 1 / Phase 2 or by earlier work; verified in this session, **no Phase 3 action
beyond a regression test**:

| API ID | Finding | Verification |
|---|---|---|
| API-170 | `submit-review` open to any authenticated user | **[RUN]** customer 403 / employee-needs-`products.manage` 403 / anonymous 401 |
| API-188 | `productAdminService` token without scope | **[READ]** `productAdminService.js:53` passes `"admin"` |
| API-211 | `buildParams` collapsing multi-value filters | **[READ]** arrays use `qs.append` |
| API-047 / 048 / 181 / 212 | No cache invalidation on catalogue writes | **[RUN]** archive → storefront list 5→4 immediately |
| API-054 / 082 / 083 / 084 / 101 / 142 / 143 / 218 | Type, alias, partial-PATCH and whitelist claims | **[RUN]** all behave as documented |
| — (audit §4.2 "API-119") | "backend `approve` sets `status = PUBLISHED`" | **[RUN]** approve leaves `status = PENDING_REVIEW` and sets `review.state = APPROVED`. **The audit row is stale.** |
| — | `docs/openapi.json` drift | **[RUN]** 201/201 paths, identical product schemas |
| — | Taxonomy isolation in admin | **[RUN]** `apiListCategories` has 0 admin call sites; `apiAdminActivateSubcategory` exists |

---

## 4. Findings Included in Phase 3

Ordered by the dependency chain, not by ID.

| # | Item | IDs | Layer |
|---|---|---|---|
| 1 | Make the canonical 422 envelope serialisable | **PF3-N01** | backend infra |
| 2 | Server-authoritative product ID for create | **PF3-N02**, PF3-N15 | frontend + backend |
| 3 | Honour the supplied slug on both create paths | **PF3-N04** | backend |
| 4 | SKU/slug collision as a 409, not a silent rename | **PF3-N03**, PF3-N16 | backend + frontend |
| 5 | Validate `category` / `subcategory` against the taxonomy | **API-204** | backend |
| 6 | Admin product form reads the **admin** taxonomy surface, any status | **API-203/202/189**, **API-223** | frontend |
| 7 | Complete the visibility gate (subcategory; fail-closed) | **API-180**, **PF3-N06**, **PF3-N07** | backend |
| 8 | Load the record from the server in edit mode | **PF3-N05** | frontend |
| 9 | Product-media write path made honest | **PF3-N09** | backend + frontend |
| 10 | Declare the status / review-state / availability vocabularies | **API-114/115/116/139**, **PF3-N10** | contract + backend |
| 11 | Type the `pricing` block | **API-075** | backend |
| 12 | Validate `assignedEmployeeId` | **API-205**, **API-104** | backend |
| 13 | Product↔collection: one authoritative direction | **PF3-N08** | backend |
| 14 | Normaliser dead branches | **API-050**, **API-051** | frontend |
| 15 | Employee product read projection narrowed | **PF3-N11** | backend |
| 16 | Media `role` / `namespace` allow-lists (product-media only) | **API-085/086/125/126/132/133/140** | backend |
| 17 | Retire or document `GET /admin/workflow/metrics` | **API-088** | backend/docs |
| 18 | `department` made explicit (persisted or removed from the ID path) | **PF3-N13** | full chain |

---

## 5. Findings Deferred

| ID | Finding | Why deferred | Target |
|---|---|---|---|
| API-213 | `useCatalogueQuery` snapshot semantics | Not reproducible as written; needs a storefront-state phase, not a contract phase. | Phase 4 |
| API-209 | No pagination on `/admin/categories` / `/admin/collections` | Taxonomy surface, frozen by Phase 2. | Phase 4 |
| API-197 | `mediaRepository` `localStorage` register | Media infrastructure. Only the **product-media write path** (PF3-N09) is in Phase 3. | Phase 4 (Media) |
| API-228 | `data/media/seedMedia.js` / authored plates | Same boundary. | Phase 4 (Media) |
| API-206 / 207 / 208 | CDN prefix, content signature, object-key validation | Media infrastructure, no product-contract dependency. | Phase 4 (Media) |
| API-400–409 | 9 media routes matched | Informational. | none |
| PF3-N12 | Explicit `null` not expressible in responses | Touches every projection in the codebase; changing it is a cross-domain response-contract decision. | Phase 4 |
| PF3-N17 | Duplicate `assigned_employee_id` index | Cosmetic; a migration for cosmetics is not worth a Phase 3 slot. | Phase 4 (DB hygiene) |
| Employee RBAC as a domain | Role/permission model, `products.manage` granularity | Explicitly out of scope per Step 15. Phase 3 touches only the **two direct product-contract dependencies**: `assignedEmployeeId` validation (API-205) and the employee product read projection (PF3-N11). | Phase 5 (RBAC) |
| Cart / checkout / orders / payments / wishlist / notifications / cache architecture | — | No direct product dependency found. Cache invalidation on product writes was **verified working**, so nothing is forced in. | later phases |

---

## 6. Product Create Contract

There are **two** create endpoints and they are not equivalent.

### 6.1 Endpoints

| | `POST /api/v1/admin/products` | `POST /api/v1/admin/products/draft` |
|---|---|---|
| Router | `products.py:321` | `products.py:339` |
| Request model | `ProductCreateRequest` (58 props) | `ProductDraftRequest` (59 props = 58 + `id`) |
| ID | server-allocated `pf-<base36 millis>` | **caller-supplied**, `^[A-Z0-9][A-Z0-9-]{1,35}$` |
| Status on success | 201 | 201 |
| Response | `SingleProductResponse` = `{ok, product: AdminProduct}` | same |
| Permission | `products.manage` | `products.manage` |
| Initial state | `DRAFT`, `published=false`, `review.state="NONE"` | identical |
| **Supplied `slug`** | **discarded** (PF3-N04) | honoured, de-duplicated with `-1/-2…` |
| Supplied `sku` | honoured (`setdefault`) | honoured (`setdefault`) |
| Duplicate ID | collision suffix appended | **409 `CONFLICT`** **[RUN]** |
| Frontend caller | `apiAdminCreateProduct` — **no call site** | `apiAdminCreateDraft` ← `createAdminProduct` ← the editor |

**The editor only ever uses `/admin/products/draft`.** `apiAdminCreateProduct` is dead code.

### 6.2 Required / optional / defaults

`ProductCreateRequest` and `ProductUpdateRequest` inherit `ProductContentFields`, in which
**every field is `Optional`**. `ProductDraftRequest` adds exactly one required field: `id`.

* **Required:** `id` (draft path only).
* **Everything else is optional.** `name`, `category`, `price` — all optional at the schema
  level. The only completeness enforcement is `get_publish_issues()` at publish time and
  the completeness list in `submit_for_review` (name, SKU, category, price > 0).
* **Server defaults applied on create** (`product_service.py:1117-1126` for `create_product`, `1163-1174` for `create_draft`):
  `name=""`, `sku=PF-#####` (random, de-duplicated), `slug=slugify(name)`,
  `brand="Pratikshya Fashon"`, `product_type="fashion"`, `currency="INR"`,
  `status="DRAFT"`, `published=false`, `review={state:"NONE",…}`, `review_flags=[]`,
  `history=[]`, `price_history=[]`.
* **Nullability:** `_NOT_NULL_DEFAULTS` (`product_service.py:1028-1046`) maps an explicit
  `null` back to the column default **on create**, and **drops the key on update**.
  18 columns are covered.
* **Rejected outright** by `_reject_lifecycle_and_unsupported`
  (`schemas/catalog/product.py:368-392`): `status`, `published`, `review`,
  `review_flags`/`reviewFlags`, `history`, `price_history`/`priceHistory`,
  `createdBy`/`created_by`, `updatedBy`/`updated_by` → `ValueError` → **currently a 500**
  (PF3-N01), intended to be a 422.
* **Silently ignored:** every other unknown key (Pydantic v2 default `extra="ignore"`).
  **[RUN]** `{variants, department}` → 200, nothing written.

### 6.3 Field-by-field: frontend payload ↔ backend schema

Produced by executing the real `buildAdminProductPayload` **[RUN]** against the real
`ProductDraftRequest` **[RUN]**. "Match?" is the honest verdict, including where the wire
value is semantically wrong even though the types agree.

| Frontend Field | Backend Field | Frontend Type | Backend Type | Required? | Alias | Match? |
|---|---|---|---|---|---|---|
| `name` | `name` | string | `Optional[str]` | no | — | ✅ |
| `slug` | `slug` | string (omitted if empty) | `Optional[str]` | no | — | ⚠️ **discarded on `POST /admin/products`** (PF3-N04) |
| `sku` | `sku` | string (omitted if empty) | `Optional[str]` | no | — | ⚠️ accepted, never uniqueness-checked (PF3-N03) |
| `brand` | `brand` | string \| undefined | `Optional[str]` | no | — | ✅ |
| `productType` | `product_type` | string \| undefined | `Optional[str]` | no | `productType` | ✅ |
| `productCode` | `product_code` | string (`""` when empty) | `Optional[str]` | no | `productCode` | ✅ |
| `barcode` | `barcode` | string | `Optional[str]` | no | — | ✅ |
| `internalReference` | `internal_reference` | string | `Optional[str]` | no | `internalReference` | ✅ |
| **`category`** | **`category`** | **string = server category UUID** | **`Optional[str]`, `String(100)`, no FK** | no | — | ❌ **no `categoryId`; unvalidated (API-204)** |
| **`subcategory`** | **`subcategory`** | **string = subcategory *name*** | **`Optional[str]`, `String(100)`, no FK** | no | — | ❌ **no `subcategoryId`; name, not ID; unvalidated** |
| `gender` | `gender` | string \| undefined | `Optional[str]`, `String(20)` | no | — | ⚠️ no enum; `"Kids"` (editor) vs `"Women"/"Men"` (DB default) |
| `shortDescription` | `short_description` | string | `Optional[str]` | no | `shortDescription` | ✅ |
| `description` | `description` | string | `Optional[str]` | no | — | ✅ |
| `highlights` | `highlights` | any[] \| undefined | `Optional[List[Any]]` JSONB | no | — | ✅ |
| `specifications` | `specifications` | object \| undefined | `Optional[Dict[str,Any]]` JSONB | no | — | ✅ |
| `careInstructions` | `care_instructions` | any[] | `Optional[List[Any]]` JSONB | no | `careInstructions` | ✅ |
| `deliveryInfo` | `delivery_info` | string | `Optional[str]` | no | `deliveryInfo` | ✅ |
| `returnInfo` | `return_info` | string | `Optional[str]` | no | `returnInfo` | ✅ |
| `returnPolicy` | `return_policy` | object \| undefined | `Optional[Dict[str,Any]]` JSONB | no | `returnPolicy` | ⚠️ untyped dict; response model is a typed `ReturnPolicy` |
| `fabric` / `material` | same | string | `Optional[str]` | no | — | ✅ |
| `primaryColor` / `secondaryColor` | `primary_color` / `secondary_color` | string | `Optional[str]` | no | camel | ✅ |
| `colors` / `patterns` / `work` / `occasion` / `sizes` | same | string[] | `Optional[List[str]]` JSONB | no | — | ✅ |
| `unavailableColors` / `unavailableSizes` | `unavailable_colors` / `unavailable_sizes` | string[] | `Optional[List[str]]` JSONB | no | camel | ✅ (not sent by a fresh draft) |
| `season` / `fit` / `length` | same | string | `Optional[str]` | no | — | ✅ |
| `collection` | `collection` | string | `Optional[str]` `String(200)` | no | — | ⚠️ unvalidated (PF3-N08) |
| `collections` | `collections` | string[] (names) | `Optional[List[str]]` JSONB | no | — | ⚠️ unvalidated; not linked to `catalog_collection` (PF3-N08) |
| `tags` / `badges` | same | any[] | `Optional[List[Any]]` JSONB | no | — | ✅ |
| `isFeatured` / `isBestseller` / `isNew` / `isLimitedEdition` / `isTrending` | `is_*` | boolean | `Optional[bool]` | no | camel | ✅ (`flags` mirror recomputed server-side) |
| `price` | `price` | int \| undefined | `Optional[int]` | no | — | ✅ (`int(float(v))` coercion) |
| `originalPrice` | `original_price` | int \| undefined | `Optional[int]` | no | `originalPrice` | ✅ (not sent by a fresh draft; derived from `pricing`) |
| `compareAtPrice` | `compare_at_price` | int \| undefined | `Optional[int]` | no | `compareAtPrice` | ✅ |
| `currency` | `currency` | string \| undefined | `Optional[str]` `String(3)` | no | — | ⚠️ no enum, no length check client-side |
| **`pricing`** | **`pricing`** | **`{mrp, sellingPrice, discountType, discountValue}` numbers** | **`Optional[Dict[str,Any]]` JSONB** | no | — | ❌ **untyped (API-075)**; `taxMode`/`taxRate`/`customTaxRate` are in `PricingDetail` (response) but **dropped by the request builder** |
| `stock` | `stock` | int \| undefined | `Optional[int]` | no | — | ✅ |
| `availability` | `availability` | string \| undefined | `Optional[str]` `String(30)` | no | — | ❌ **no enum (API-116/139)** |
| `inventoryTracked` | `inventory_tracked` | boolean \| undefined | `Optional[bool]` | no | `inventoryTracked` | ✅ |
| `lowStockThreshold` | `low_stock_threshold` | int \| undefined | `Optional[int]` | no | `lowStockThreshold` | ✅ |
| `seo` | `seo` | `{title, description}` | `Optional[Dict[str,Any]]` JSONB | no | — | ⚠️ untyped on write, typed `SeoDetail` on read |
| `mediaIds` | `media_ids` | string[] \| undefined | `Optional[List[str]]` JSONB | no | `mediaIds` | ❌ **written but never creates `media_product_media` (PF3-N09)** |
| `primaryMediaId` | `primary_media_id` | string \| undefined | `Optional[str]` `String(64)` | no | `primaryMediaId` | ❌ same |
| `galleryMediaIds` | `gallery_media_ids` | string[] | `Optional[List[str]]` JSONB | no | `galleryMediaIds` | ❌ same |
| `image` | `image` | string (`""` when absent) | `Optional[str]` Text | no | — | ⚠️ free-text URL/plate key; the only field the publish gate accepts as a cover |
| `hoverImage` | `hover_image` | string | `Optional[str]` Text | no | `hoverImage` | ✅ |
| `additionalImages` | `additional_images` | string[] | `Optional[List[str]]` JSONB | no | `additionalImages` | ✅ |
| `id` (draft only) | `catalog_product.id` | string | `str`, regex-validated | **yes** | — | ⚠️ allocated **client-side** (PF3-N02) |
| `department` | — | string | **no column** | — | — | ❌ **dropped (PF3-N13)** |
| `variants` | — | object[] | **no column** | — | — | ✅ correctly dropped by the builder |
| `status` / `review` / `published` / `history` / `priceHistory` / `createdBy` / `updatedBy` | — | — | **rejected** | — | — | ⚠️ correctly stripped by `buildAdminProductPayload`; **500 if any other caller sends them** (PF3-N01) |

---

## 7. Save & Continue Root Cause

The button is `ProductEditor.jsx:769` → `handleSaveAndContinue` (`:420`) → `persist()`
(`:348`) → `persistAdminProduct()` → `createAdminProduct()` → `apiAdminCreateDraft()` →
`POST /api/v1/admin/products/draft`.

### 7.1 The twelve questions

| # | Question | Answer (verified) |
|---|---|---|
| 1 | What payload is generated? | **[RUN]** `buildAdminProductPayload(draft)` → 45 keys. Lifecycle keys, `department` and `variants` are correctly stripped. `slug`/`sku` are **omitted** when empty. |
| 2 | What payload reaches the backend? | **Nothing — on the failure path no HTTP request is made at all.** |
| 3 | What does Pydantic receive? | On the success path, `ProductDraftRequest`. **[RUN]** a well-formed payload validates and returns **201**. |
| 4 | Which fields are rejected? | Only the lifecycle block-list, and today that rejection is a **500** (PF3-N01), not a 422. |
| 5 | Which fields are silently ignored? | Every unknown key (`extra="ignore"`). **[RUN]** `{variants, department}` → 200, nothing persisted. |
| 6 | What status code is returned? | Success: **201**. Failure path: **none** — `createAdminProduct` returns `{ok:false, status:0}` locally. |
| 7 | What response does the backend return? | `{ok:true, product: AdminProduct}` — 76 camelCase fields, `status="DRAFT"`, `published=false`, `review.state="NONE"`. |
| 8 | Does the frontend parse it correctly? | Yes. `apiAdminCreateDraft` → `normaliseProduct(data.product)`. |
| 9 | Does the frontend retain the new product ID? | Yes **once the request succeeds**. `withUpsert` → `upsertServerProducts`; `persistAdminProduct` re-reads `catalogRepository.find(result.product.id)`; `persist` then re-baselines from `fetchAdminProduct(result.product.id)`. |
| 10 | Does redirect/edit navigation use the correct ID? | `handleSaveAndContinue` does **not** navigate — it advances one section. `handleSaveDraft` navigates to `/admin/products/${product.id}/edit` with the correct ID, but that route then depends on the session cache (PF3-N05). |
| 11 | Does the product appear in admin after creation? | Yes. **[RUN]** `GET /admin/products` → `total: 1`, `ids: ["PF-W-SAR-BAN-0001"]`. |
| 12 | Does the product remain DRAFT? | Yes. **[RUN]** `status="DRAFT"`, `published=false`; **[RUN]** `GET /products` → `total: 0`. |

### 7.2 The root cause

**Root cause A (primary, P0) — the client, not the server, refuses the save.**

```
handleSaveAndContinue
  → persist()                                    ProductEditor.jsx:348
    → draft.exists === false, draft.id === null
    → id = nextCanonicalProductId(
             catalogRepository.all(),            ← in-memory session cache, may be empty
             draft.department,                   ← local-only concept, no DB column
             draft.category,                     ← server category UUID
             draft.subcategory)                  ← subcategory NAME
      → isCanonicalTaxonomyPath(dept, cat, sub)  productIdPrefixes.js:87
          canonicalDepartments.find(e => e.id === department)      ← src/data/catalog/taxonomy.js
            .categories.find(e => e.id === category)               ← expects "sarees", gets a UUID
              .subcategories.some(e => e.id === subcategory)       ← expects "banarasi", gets "Banarasi"
      → false  ⇒  returns null
    → persistAdminProduct({...payload, id: undefined}, {isNew:true})
      → createAdminProduct(record)               productAdminService.js
          const id = String(record?.id ?? "").trim();
          if (!id) return { ok:false,
                            error:"A canonical Product ID must be allocated before creation.",
                            status: 0 };         ← never reaches the network
    → setFeedback({kind:"error", …})
```

Verified by executing the real modules **[RUN]**:

```
isCanonicalTaxonomyPath("women", "6f1c2b3a-0000-4000-8000-0000000000c1", "Banarasi")  → false
nextCanonicalProductId([], "women", "6f1c2b3a-0000-4000-8000-0000000000c1", "Banarasi") → null
isCanonicalTaxonomyPath("", "sarees", "banarasi")                                      → false
nextCanonicalProductId([], "women", "essentials", "dupattas-stoles")                   → "PF-W-ESS-DUP-0001"
```

The last line is the trap: the allocator *does* work — but only for the four
departments × ten categories × two-to-three subcategories frozen into
`PRODUCT_ID_FAMILY_PREFIXES` / `src/data/catalog/taxonomy.js`. Anything an admin creates
through the Phase 2 taxonomy UI, or any subcategory whose label differs from its slug,
falls off the map.

**Root cause B (P0, latent) — even a correct client cannot get a clean validation error.**
The moment any caller sends a blocked lifecycle key or a malformed `id`, the server
returns **500** instead of **422** (PF3-N01). So "fix the payload" debugging is impossible
from the operator's seat: the message is *"An unexpected error occurred. Please try again
later."*

**Root cause C (P1) — even on the happy path the ID is allocated over a stale register.**
`catalogRepository.all()` is `let serverProducts = []` until something calls
`fetchAdminProducts`. A hard navigation to `/admin/products/new` allocates against an
empty set, so the first serial is always `0001`; a second admin, or the same admin after a
reload, collides and gets **409 `CONFLICT`** — which the UI renders as a save failure with
no recovery path.

**Root cause D (P1) — the authoritative allocator is unused.**
`GET /admin/products/next-id?category=&preferredNumber=` exists, is deterministic
(`ProductService.get_next_id`, lowest free integer), and has **zero call sites**
(PF3-N15). Note its own limitation: it keys off `CATEGORY_ID_PREFIXES` and returns
`{prefix}-{n:03d}` (3 digits), while the client convention is `PF-…-{n:04d}` (4 digits).
The two allocators **disagree on format** — that must be reconciled, not just wired up.

---

## 8. Product Update Contract

`PATCH /api/v1/admin/products/{id}` — `products.py:469`, `ProductService.update_product`
(`product_service.py:1203`), permission `products.manage`.

| Aspect | Verified behaviour |
|---|---|
| **PATCH semantics** | `req.model_dump(exclude_unset=True, by_alias=False)` → only keys present in the JSON body are written. **[RUN]** `PATCH {fabric:"Cotton"}` preserved `description`. |
| **Omitted** | Untouched. Correct. |
| **Explicit `null`** | Two behaviours. For the 18 `_NOT_NULL_DEFAULTS` columns the key is **popped** (`_sanitize_for_update`) — an explicit `null` is a **no-op**, not a clear. For genuinely nullable columns the `null` **is** written, but `_to_admin` renders `p.x or ""`, so the response cannot distinguish `null` from `""`. **[RUN]** `PATCH {fabric:null}` → 200, `fabric == ""`. This contradicts `API_CONTRACT.md` §3.1. |
| **Allowed fields** | The 58 `ProductContentFields` entries — all map to a real `catalog_product` column. |
| **Forbidden fields** | `status`, `published`, `review`, `reviewFlags`, `history`, `priceHistory`, `createdBy`, `updatedBy` → `ValueError`. **Today that surfaces as HTTP 500** (PF3-N01); the intent is a 422 with the block-list in `details`. |
| **Unknown fields** | Silently ignored (`extra="ignore"`). **[RUN]** |
| **Slug** | A changed slug is re-run through `_generate_unique_slug`, which **appends `-1/-2…` instead of returning 409**. An admin typo therefore silently produces a different URL than the one they typed. |
| **Pricing** | `_derive_pricing` recomputes `price`/`original_price` from a complete, valid `pricing` block; a raw `price` is kept otherwise. Server-side money, correct. |
| **`flags`** | Recomputed from the **merged** record so a partial patch cannot zero untouched flags. Correct. |
| **History** | `_append_history` per changed field; `_append_price_history` records OLD→NEW. Correct. |
| **`published` sync** | `p.published = p.status == "PUBLISHED"` on every patch. Correct. |
| **Response shape** | `SingleProductResponse` = `{ok:true, product: AdminProduct}`, via `_to_admin_current` (registered media resolved). Correct. |
| **404** | **[RUN]** canonical envelope `{success:false, error:{code:"NOT_FOUND", …}}`. |
| **Status through PATCH?** | **No — and correctly so.** Status belongs to the lifecycle routes. `bulk_update` enforces the same rule and returns a proper 422: **[RUN]** `{updates:{status:"ARCHIVED"}}` → 422 `BUSINESS_RULE_VIOLATION` with `details.rejected=["status"]` and `details.supported=[…]`. |

**Verdict:** PATCH semantics are sound. The two real defects are the **500 instead of 422**
and the **silent slug rename**.

---

## 9. Product Lifecycle Contract

### 9.1 The lifecycle the code actually implements

```
                       ┌──────────── submit-review ────────────┐
                       ▼                                       │
   ┌───────┐  reject  ┌────────────────┐  approve   ┌──────────────────────┐
   │ DRAFT │ ◄─────── │ PENDING_REVIEW │ ─────────► │ PENDING_REVIEW       │
   └───────┘          │ review=PENDING │            │ review=APPROVED      │
       ▲              └────────────────┘            └──────────┬───────────┘
       │ unpublish                                             │ publish (gated)
       │                                                       ▼
   ┌───┴──────┐                                          ┌───────────┐
   │ PUBLISHED│ ◄────────────────────────────────────────│ PUBLISHED │
   └──────────┘                                          └───────────┘
       │ archive (from any non-archived state)
       ▼
   ┌──────────┐  restore
   │ ARCHIVED │ ──────────► DRAFT
   └──────────┘
```

**Status vocabulary (4):** `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `ARCHIVED`.
**Review state vocabulary (4):** `NONE`, `PENDING`, `APPROVED`, `REJECTED`.

`API_CONTRACT.md` §3.3 declares **six** statuses: `DRAFT, REVIEW, APPROVED, PUBLISHED,
REJECTED, ARCHIVED`. Three of those (`REVIEW`, `APPROVED`, `REJECTED`) are review *states*
in the implementation. **The contract document is wrong, not the code** — the code's
separation of `status` (visibility) from `review.state` (approval) is the better model and
is what every service guard, history entry and frontend label already assumes.
**Phase 3 corrects the document and declares both enums; it does not rename statuses.**

### 9.2 Endpoint table

| Action | Endpoint | Current State (verified) | Target State | Auth Scope | Frontend Wrapper | Contract Match |
|---|---|---|---|---|---|---|
| Submit | `POST /products/{id}/submit-review` | **[RUN]** → `status=PENDING_REVIEW`, `review.state=PENDING`. Guards: PUBLISHED/ARCHIVED/already-PENDING/already-APPROVED all rejected with 422. Completeness pre-check: name, SKU, category, price>0. Customer→403, anonymous→401, employee needs `products.manage` + assignment. | unchanged + declare the guard set in `API_CONTRACT.md` | customer token allowed by route, rejected in service; admin & employee allowed | `apiSubmitForReview(id,{scope:"admin"})` via `runAction("submitReview")` | ✅ |
| Approve | `POST /admin/products/{id}/approve` | **[RUN]** → `review.state=APPROVED`, **status stays `PENDING_REVIEW`**. Idempotent when already approved. Requires PENDING. | unchanged | admin, `products.manage` | `apiAdminApproveProduct` | ✅ (audit's "approve publishes" claim is **stale**) |
| Reject | `POST /admin/products/{id}/reject` | `status=DRAFT`, `review.state=REJECTED`, `rejectionReason` recorded. `{reason}` required, `min_length=1`. | unchanged | admin, `products.manage` | `apiAdminRejectProduct(id, reason)` | ✅ |
| Publish | `POST /admin/products/{id}/publish` | **[RUN]** gated on `review.state==APPROVED` **and** `get_publish_issues()==[]`; **[RUN]** 422 `BUSINESS_RULE_VIOLATION` with `details.errors=["At least one cover image is required before publishing."]`. Writes `status`, `published`, `published_by`, `published_at` together. Idempotent when already live. | unchanged | admin, `products.manage` | `apiAdminPublishProduct` | ✅ |
| Unpublish | `POST /admin/products/{id}/unpublish` | `PUBLISHED → DRAFT`, `published=false`. 422 otherwise. | unchanged | admin, `products.manage` | `apiAdminUnpublishProduct` | ✅ |
| Archive | `POST /admin/products/{id}/archive` | any → `ARCHIVED`, `published=false`. 422 if already archived. **[RUN]** storefront list drops immediately. | unchanged | admin, `products.manage` | `apiAdminArchiveProduct` | ✅ |
| Restore | `POST /admin/products/{id}/restore` | `ARCHIVED → DRAFT`, `published=false`. 422 otherwise. | unchanged | admin, `products.manage` | `apiAdminRestoreProduct` | ✅ |
| Duplicate | `POST /admin/products/{id}/duplicate` | 201, DRAFT copy, new runtime id. | unchanged | admin, `products.manage` | `apiAdminDuplicateProduct` | ✅ |
| Change ID | `POST /admin/products/{id}/change-id` | Regex-validated, must be free. Router docstring itself carries an unresolved **"BACKEND DECISION REQUIRED: cascade to media, inventory, collection, order history"**. | **resolve the cascade question or restrict the route** | admin, `products.manage` | `apiAdminChangeProductId` | ⚠️ open decision |
| Clear flags | `POST /admin/products/{id}/review-flags/clear` | `{flags: string[]}`, no vocabulary validation. | declare the flag vocabulary | admin, `products.manage` | `apiAdminClearReviewFlags` | ⚠️ |
| Bulk | `POST /admin/products/bulk` | **[RUN]** `status` rejected with a proper 422 carrying `rejected` + `supported`. | unchanged | admin, `products.manage` | `apiAdminBulkUpdate` | ✅ |
| Publish issues | `GET /admin/products/{id}/publish-issues` | `{ok, issues: string[]}` — the same list `approve`/`publish` enforce. | unchanged | admin, `products.view` | `apiAdminGetPublishIssues` | ✅ |

**No lifecycle endpoint is invented.** Every action above already exists and is reachable
from `productAdminService.ACTIONS`.

---

## 10. Storefront Visibility Contract

### 10.1 What the gate actually is

`ProductService.list_storefront_products` (`product_service.py:554`) and
`get_storefront_product` (`:822`) apply, in order:

1. `catalog_product.status == "PUBLISHED"` (`:562`)
2. `catalog_product.published IS TRUE` (`:563`)
3. `category_status_map.get(p.category, "ACTIVE") == "ACTIVE"` — where the map keys every
   category by **id, slug and name** (`_category_status_map`, `:538`)

The same fail-open category predicate is repeated in **four** read paths, so a fix must
land in all of them: `list_storefront_products` (`:577`), `get_storefront_product` (`:840`),
`get_recommendations` (`:888`) and `get_recently_viewed` (`:916`).

That is the whole gate. Verified end to end **[RUN]**:

| DB state | `GET /products` | `GET /products/{id}` | Correct? |
|---|---|---|---|
| PUBLISHED + ACTIVE cat + ACTIVE subcat | **visible** | 200 | ✅ |
| PUBLISHED + ACTIVE cat + **ARCHIVED subcat** | **visible** | **200** | ❌ **PF3-N06** |
| PUBLISHED + **DRAFT** category | hidden | 404 | ✅ |
| PUBLISHED + **ARCHIVED** category | hidden | 404 | ✅ |
| PUBLISHED + **category not in `catalog_category`** | **visible** | 200 | ❌ **PF3-N07** (fail-open) |
| PUBLISHED + **empty category** | **visible** | 200 | ❌ **PF3-N07** (fail-open) |
| **DRAFT** status | hidden | 404 | ✅ |
| PUBLISHED + `stock=0` + `availability="out-of-stock"` | **visible** | 200 | ⚠️ by design, but undocumented |

### 10.2 Gates that do **not** exist

| Candidate gate | Present? | Evidence |
|---|---|---|
| `status == PUBLISHED` | ✅ | `:562` |
| `published == true` | ✅ | `:563` |
| category `ACTIVE` | ✅ | `:574-579` |
| **subcategory `ACTIVE`** | ❌ | no subcategory status map exists anywhere in the service |
| **collection conditions** | ❌ | collections only ever *narrow* a query (`_collection_product_ids`), never gate |
| **inventory / stock** | ❌ | `stock` and `availability` are projected, never filtered |
| **cover image present** | ❌ | enforced at *publish* time only, not at read time |

### 10.3 The map

```
Admin DB state                Service filtering                  Public API            Frontend
─────────────────────────────────────────────────────────────────────────────────────────────────
status=PUBLISHED          ┐
published=true            ├─► list_storefront_products ──► GET /products ──► apiListProducts
category.status=ACTIVE    ┘   get_storefront_product   ──► GET /products/{id}  apiGetProduct
subcategory.status=*      ──► NOT CONSULTED  ✗
collection.status=*       ──► NOT CONSULTED  ✗
stock / availability      ──► NOT CONSULTED  ✗
unknown category          ──► DEFAULTS TO "ACTIVE" (fail-open)  ✗
```

### 10.4 Inconsistencies to resolve in Phase 3

1. **Subcategory parity.** Either subcategory status gates visibility, or the contract
   states explicitly that it does not. Today it is silent and the behaviour is surprising:
   archiving a subcategory looks like it should hide its products (the category model's own
   docstring says *"Archiving a category removes ALL its products from every customer
   surface"*) and it does not.
2. **Fail-open on unknown category.** With API-204 unfixed, any product can carry a
   category string that matches nothing — and it is then **permanently visible** and
   un-archivable through taxonomy. Fixing API-204 at write time and switching the read
   default to fail-closed must land together, or existing rows with legacy category strings
   will vanish from the storefront. **This is the single highest regression risk in
   Phase 3** (§23).

---

## 11. Product Media Architecture

### 11.1 Current architecture (verified)

```
media_media_asset                     catalog_product
├─ object_key      UNIQUE             ├─ media_ids           JSONB   ← legacy "claims"
├─ storage_provider                   ├─ primary_media_id    String  ← legacy
├─ media_type / mime_type             ├─ gallery_media_ids   JSONB   ← legacy
├─ checksum_sha256                    ├─ image               Text    ← authored plate/URL
├─ file_size / width / height         ├─ hover_image         Text
├─ title / alt_text / caption         └─ additional_images   JSONB
├─ status   String(30) "uploaded"              ▲
├─ scope    String(30) "product"               │ written by POST/PATCH /admin/products
└─ uploaded_by → users.id                      │ (and by nothing else)
        ▲                                      │
        │ 1                                    │
        │                                      │
media_product_media                            │
├─ product_id → catalog_product.id  CASCADE    │
├─ media_id   → media_media_asset.id CASCADE   │
├─ role       String(30) "gallery"             │  ← the AUTHORITATIVE association,
├─ sort_order Integer                          │     written ONLY by POST /media/register
├─ is_primary Boolean                          │
├─ assigned_by                                 │
└─ UNIQUE(product_id, media_id)                │
        ▲                                      │
        └── POST /media/register (product_id) ─┘   never by the product contract
```

**Reads** (`_registered_media_items` / `_registered_media_view`, `product_service.py:304,350`):
registered associations win. An **empty** registered list falls back to the legacy columns.
Ordering is `is_primary DESC, sort_order ASC, assignment_id ASC`.

### 11.2 Verified behaviours

| Behaviour | Result |
|---|---|
| Product create/PATCH writes `media_product_media`? | **No** **[READ]** — no `ProductMediaModel` reference anywhere in `product_service.py` |
| `PATCH {mediaIds, primaryMediaId}` | **[RUN]** 200; values land in the legacy columns; `image` stays `""` |
| Consequence once any registered media exists | The admin's product-form media edits become **silently ineffective** — `_registered_media_view` overrides them on every read (PF3-N09) |
| Publish gate | Accepts **either** an authored `image` **or** `primary_media_id`. **[RUN]** publish blocked with `"At least one cover image is required before publishing."` when both are empty |
| `POST /media/register` product validation | Product existence checked → 404. `is_primary` demotes all other rows for that product in the same transaction. Idempotent by `object_key`. |
| `role` validation | **None** — `Form("gallery")` written verbatim (API-086/133) |
| `namespace` validation | **None** (API-085/132) |
| Editor UI | `SectionMedia` (`editorSectionsContent.jsx:183`) offers a **free-text** "Cover image URL / plate" field bound to `draft.image`, plus a link out to `/admin/products/{id}/media` — reachable **only when `draft.exists`** |
| Storefront fallback | `productMediaSource.js` still falls back to authored plates in `data/products` and `data/mediaPlaceholder` |

### 11.3 The three options

| Option | Description | Assessment |
|---|---|---|
| **A. One atomic operation** | Product create accepts a media manifest and writes `media_product_media` in the same transaction | Rejected for Phase 3. Uploads are multipart and precede the product's existence; forcing atomicity means either buffering uploads against a non-existent FK or a two-phase commit the codebase has no machinery for. |
| **B. Separate operations** | Product contract and media contract stay fully independent | This is **today's** design, and it is the source of PF3-N09: two writable sources of truth with no synchronisation and a read rule that silently prefers one. |
| **C. Draft → media assignment → final save** | Create the DRAFT (or use the server-allocated ID), then assign media against that ID, then continue editing | **This is already the shape of the UI** — `SectionMedia` gates on `draft.exists` and links to a per-product media screen. The backend already supports it: `POST /media/register` takes `product_id`, validates existence, and handles primary/ordering transactionally. |

### 11.4 Recommended architecture (design only — not implemented here)

**Adopt C explicitly, and make the product contract stop pretending to own media.**

1. `media_product_media` becomes the **single** source of truth for product media.
2. The product contract's `mediaIds` / `primaryMediaId` / `galleryMediaIds` become
   **read-only projections** — removed from `ProductContentFields`, so writing them is a
   422 rather than a silent no-op. `image` / `hover_image` / `additional_images` remain as
   the legacy authored fallback for pre-Phase-7 rows only.
3. The publish gate already accepts either source; keep that during the transition and
   retire the authored branch once every live product has registered media.
4. `role` and `namespace` get allow-lists so the association vocabulary is closed
   (API-085/086/125/126/132/133/140).
5. `POST /media/register`'s response already returns `{media, assigned, assignment}`;
   the product editor should consume `assignment` rather than re-deriving state.

**Sequencing note:** item 2 is a **breaking** change to the admin write contract and must
land after the editor stops sending those keys (§24, step 6).

---

## 12. Taxonomy Dependencies

Phase 2 made the taxonomy server-authoritative **for the taxonomy screens**. The product
editor was not migrated.

### 12.1 What the product form actually reads **[READ]**

```
SectionAttributes (editorSectionsBasics.jsx:226-264)
  categoryOptions  = taxonomyRepository.categoryOptions()          ← line 234
                     = activeCategories().map(c => ({value: c.id}))  ← taxonomyRepository.js:143
                     ← read() ← catalogStore.getCategories()
                     ← hydrateCatalog() ← apiListCategories({status:"ACTIVE"})   ← PUBLIC endpoint
  subcategoryOptions = departmentSubcategoriesFor(dept, cat)       ← data/products/departments.js (STATIC)
                       ?? subcategoryOptionsFor(cat)               ← config/productCatalogConfig.js:89
                       = [...taxonomyRepository.subcategoryOptionsFor(cat),   ← server NAMES
                          ...(SUBCATEGORY_OPTIONS[cat] ?? [])]                 ← data/products/taxonomy.js (STATIC)
  <Select value={draft.category}    options={{value: category.id}} />   → wire value = UUID
  <Select value={draft.subcategory} options={{value: entry}}       />   → wire value = NAME
```

### 12.2 Findings

| Check | Verdict |
|---|---|
| IDs are server-authoritative | **Half.** `category` is a server id; `subcategory` is a **name**; neither is validated server-side. |
| Frontend does not use stale taxonomy snapshots | ❌ **It does.** `catalogStore` is a storefront snapshot hydrated from `GET /categories?status=ACTIVE` / `GET /collections?status=ACTIVE` / `GET /subcategories?status=ACTIVE`. The admin product form reads that snapshot, so **an admin cannot place a product into a DRAFT category, and a product whose category is DRAFT/ARCHIVED renders a blank Category select.** This is the *identical* defect class that `ADMIN_CATEGORY_EDIT_FIX_REPORT.md` documents and fixed for `AdminCategoryForm`. |
| Inactive taxonomy cannot be assigned where prohibited | ❌ No prohibition exists. **[RUN]** `PATCH {category:"does-not-exist"}` → 200. |
| Payload names match Phase 2 contracts | ❌ Phase 2's admin taxonomy contract is id-based; the product contract sends a category **id** but a subcategory **name** into two untyped string columns. |

### 12.3 Phase 3 position

**Do not add `category_id` / `subcategory_id` columns in Phase 3.** That is a migration plus
a backfill of every existing row, and the columns are already wide enough to hold an id.
Instead:

1. **Validate at the boundary.** `ProductService` resolves the incoming `category` against
   `catalog_category` by **id, then slug, then name** (the same triple `_category_status_map`
   already uses), and `subcategory` against `catalog_subcategory` scoped to the resolved
   category. Unknown → **422** `BUSINESS_RULE_VIOLATION` with `details.field`.
2. **Normalise on write** to the canonical value (the category **slug**, which is
   `unique=True` and human-readable) so the visibility map, the admin filter and the
   storefront facet all key on one vocabulary. Record the normalisation in `history`.
3. **Switch the editor to the admin taxonomy surface.** `taxonomyRepository.loadCategory`
   and `apiAdminListSubcategories` already exist and return **any** status. The product
   form must use those, not `activeCategories()`.
4. **Send ids, not names**, for both levels; the server resolves them.
5. **Delete the static dependency** in the ID-allocation path (see §7) — this is what
   retires `data/catalog/taxonomy.js` from the write path (API-223).

---

## 13. Collection Dependencies

### 13.1 Current architecture **[READ]**

Two independent, unsynchronised representations:

| Direction | Storage | Written by | Validated? |
|---|---|---|---|
| Product → collections | `catalog_product.collections` JSONB (list of **names**), `catalog_product.collection` `String(200)` | `POST`/`PATCH /admin/products*` via `ProductContentFields` | **No** |
| Collection → products | `catalog_collection.explicit_product_ids` JSONB (list of **ids**), or `catalog_collection.rule` JSONB for `RULE_BASED` | `PUT /admin/collections/{id}/products` → `CollectionService.assign_products` (`:502`) | **No** — `col.explicit_product_ids = req.productIds` verbatim |

Note: `API_CONTRACT_AUDIT.md` §4.2 maps the collection assignment to a table
**`catalog_collection_product`, which does not exist** (PF3-N14). Membership is resolved at
query time by `CollectionService._resolve_product_ids` (`:148`), which matches
`explicit_product_ids`, or evaluates the rule, or falls back to a `LIKE`/JSONB containment
match against `catalog_product.collection` / `.collections`.

### 13.2 Findings

| Question | Answer |
|---|---|
| Can product creation assign collections? | **Yes** — `collections: string[]` and `collection: string` are both in `ProductContentFields`. |
| Request payload | `collections` (array of names), `collection` (single string). `buildAdminProductPayload` sends both. |
| Response payload | `AdminProduct.collections: string[]`, `.collection: string`. No ids, no resolved collection objects. |
| Collection IDs | **Never used** on the product side. The product stores names; the collection stores ids. They cannot be joined reliably. |
| Validation | **None** on either side. |
| Active/inactive collection behaviour | A product can reference an `ARCHIVED` collection by name and nothing objects; conversely, `assign_products` accepts product ids that do not exist. |
| MANUAL vs RULE_BASED | `assign_products` correctly returns **409** for `RULE_BASED`. |
| Runtime behaviour of the collection routes | **[UNVERIFIED]** — `_resolve_product_ids` emits the Postgres JSONB containment operator `@>`, which SQLite cannot parse (`unrecognized token: "@"`). Verified by code reading only. |

### 13.3 Phase 3 position

Make **collection → product** the single authoritative direction:

1. `PUT /admin/collections/{id}/products` validates every id exists (**422** listing the
   unknown ids) — a small, contained change.
2. On the product side, `collections` becomes a **read-only projection** resolved from
   collection membership. Writing it through the product contract becomes a 422.
3. `catalog_product.collection` (the legacy single string) stays readable for the
   rule-based matcher and the storefront facet, but is no longer written by the editor.
4. This is deliberately **not** a migration: both columns stay.

---

## 14. Employee Product Dependencies

Scope-limited per Step 15: only the two items that are direct product-contract
dependencies. Everything else about employee RBAC is deferred to Phase 5.

| Surface | Verified behaviour | Phase 3 action |
|---|---|---|
| `GET /employee/products/{id}` | **[RUN]** 200, returns the **full 76-field `AdminProduct`** including `review`, `history`, `priceHistory`, `createdBy`, `updatedBy`, `publishedBy`. | **PF3-N11** — narrow to an employee projection. In scope: this is a *product response contract* issue. |
| `PATCH /employee/products/{id}` | **[RUN]** requires `products.manage`. Whitelist re-applied in the service (`snake_whitelist`, 27 columns) even though `EmployeeProductUpdateRequest` declares `extra="allow"`. `slug`, `sku`, `status` are not in the whitelist. | No change; add tests. |
| Assignment guard | `update_product_employee` allows the employee code **or** the user UUID (legacy rows), or a super admin. | No change. |
| `POST /admin/products/{id}/assign` | **[RUN]** `employeeId: "NOT-A-REAL-EMPLOYEE"` → **200**, stored verbatim. | **API-205** — validate against `employees_profile.employee_code`; unknown → **422**; `null` unassigns (already supported). In scope: without it the assignment column is free text and the employee guard is unenforceable. |
| `GET /employee/me/assigned-products` | Exists in `docs/openapi.json`. | No change. |
| Employee lifecycle rights | `submit-review` only; approve/reject/publish/unpublish/archive/restore are admin-only (`get_current_admin`). Verified **[RUN]**: an admin token on an employee route → 403, and the inverse is enforced by `get_current_employee`. | No change. |
| Role/permission model, `products.manage` granularity, department/section scoping | — | **Deferred to Phase 5.** |

---

## 15. Product Response Contract

### 15.1 Serialisation

**[RUN]** `AdminProduct` serialises **76 properties, all camelCase, zero snake_case**.
`StorefrontProduct` likewise. FastAPI's default `response_model_by_alias=True` plus the
`alias=` declarations do the work; `populate_by_name=True` keeps the service's
keyword construction valid.

### 15.2 Field audit

| Field | Backend type | OpenAPI | Frontend normaliser | UI expectation | Match? |
|---|---|---|---|---|---|
| `productId` | `str`, alias `productId` | string | `p.id` used as identity; `productId` passed through | canonical `PF-…` label | ✅ |
| `sku` | `str` | string | `p.sku ?? ""` | unique | ⚠️ **not unique** (PF3-N03) |
| `slug` | `str` | string | `p.slug` | stable URL | ⚠️ silently renamed (PF3-N04, §8) |
| `price` | `int` | integer | `p.price ?? p.selling_price ?? 0` | integer paise-free INR | ✅ (`selling_price` branch is dead) |
| `originalPrice` | `Optional[int]` | integer \| null | `p.originalPrice ?? p.original_price ?? p.mrp ?? p.compare_at_price ?? null` | strike-through price | ⚠️ **API-050** — three dead branches |
| `compareAtPrice` | `Optional[int]` | integer \| null | `p.compare_at_price ?? p.compareAtPrice ?? null` | — | ❌ **API-051** — precedence inverted; `compare_at_price` never arrives |
| `categoryId` / `subcategoryId` | **do not exist** | absent | absent | — | ❌ **API-204** |
| `category` / `subcategory` | `str` | string | `p.category ?? ""` | label | ⚠️ carries a UUID for category, a name for subcategory |
| `media` | no such object | — | `image`, `additionalImages`, `mediaIds`, `primaryMediaId`, `galleryMediaIds`, `hoverImage` | — | ⚠️ six parallel fields, two authorities (§11) |
| `inventory` | no such object | — | `stock`, `availability`, `inventoryTracked`, `lowStockThreshold` | — | ✅ flat, documented |
| `status` | `str`, default `DRAFT` | **string, no enum** | `p.status ?? "DRAFT"` | 4-value badge | ❌ **API-114 / PF3-N10** |
| `review` | `Optional[ReviewDetail]` | object | passed through | state + reason | ⚠️ **API-115** undeclared enum |
| `availability` | `str`, default `in-stock` | **string, no enum** | `p.availability ?? "in-stock"` | — | ❌ **API-116/139** |
| `createdAt` / `updatedAt` | `Optional[str]` ISO | string \| null | passed through | relative time | ✅ |
| `publishedAt` / `publishedBy` | `Optional[str]` | string \| null | passed through | — | ✅ |
| `pricing` | `Optional[Dict[str,Any]]` | object \| null | read as `pricing.mrp` etc. | typed money | ❌ **API-075** |
| `flags` | `Dict[str,bool]` | object | not read | — | ✅ derived mirror |
| `history` / `priceHistory` | `List[Dict]` | array | not read | — | ⚠️ exposed to employees (PF3-N11) |

### 15.3 `docs/openapi.json`

**[RUN]** In sync: 201 paths on both sides; `ProductCreateRequest` 58/58,
`ProductDraftRequest` 59/59, `ProductUpdateRequest` 58/58, `AdminProduct` 76/76 — zero
added or removed properties. Phase 3 must **regenerate it** after the schema changes
(new enums, removed media-write fields) or it will drift for the first time.

---

## 16. Product Error Contract

Phase 1's envelope is `{success:false, error:{code, message, details}}` and is emitted by
four handlers (`app/core/error_handlers.py`): `AppException`, `RequestValidationError`,
`StarletteHTTPException`, and a catch-all. **No second format is introduced.** Product
endpoints already use it — **[RUN]** verified for 401, 403, 404, 409 and 422.

### 16.1 Blocking defect

**PF3-N01 — the 422 handler cannot render a validator `ValueError`.**

```python
# app/core/error_handlers.py:59-74  (current)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(status_code=422, content={
        "success": False,
        "error": {"code": "VALIDATION_ERROR",
                  "message": "Invalid request payload or parameters",
                  "details": exc.errors()},          # ← ctx.error is a live ValueError
    })
```

**[RUN]** `TypeError: Object of type ValueError is not JSON serializable` → the handler
itself throws → `ServerErrorMiddleware` returns **500 `INTERNAL_SERVER_ERROR`**.

Affected today (product surface): `PATCH /admin/products/{id}` with any blocked lifecycle
key; `POST /admin/products{,/draft}` with any blocked lifecycle key;
`POST /admin/products/draft` or `/change-id` with an id failing `PRODUCT_ID_RE`.
The defect is **repo-wide** — every `field_validator`/`model_validator` that raises
`ValueError` is affected.

**Fix (Phase 3, item 1):** sanitise `exc.errors()` before serialisation — coerce each
error to JSON-safe primitives (`ctx.error` → `str(...)`), keeping the same envelope, the
same `VALIDATION_ERROR` code and HTTP 422.

### 16.2 Product error matrix

| Condition | HTTP | `error.code` | Message | `details` | Status today |
|---|---|---|---|---|---|
| Missing required field (`id` on draft) | 422 | `VALIDATION_ERROR` | `Invalid request payload or parameters` | field errors | ⚠️ **500 today** (PF3-N01) |
| Malformed product id (`bad id!`) | 422 | `VALIDATION_ERROR` | same | `PRODUCT_ID_RE` message | ⚠️ **500 today** |
| Lifecycle key in the body | 422 | `VALIDATION_ERROR` | same | blocked-key list | ⚠️ **500 today** |
| **Duplicate SKU** | **409** | **`CONFLICT`** | `SKU '<x>' is already in use.` | `{field:"sku", value}` | ❌ **not implemented — 201 today** (PF3-N03) |
| **Duplicate slug** | **409** | **`CONFLICT`** | `Slug '<x>' is already in use.` | `{field:"slug", value, suggestedSlug}` | ❌ **silently renamed today** |
| Duplicate permanent id (draft) | 409 | `CONFLICT` | `Product ID '<x>' is already taken.` | `{}` | ✅ **[RUN]** |
| **Invalid category** | **422** | **`BUSINESS_RULE_VIOLATION`** | `Unknown category '<x>'.` | `{field:"category", value}` | ❌ **200 today** (API-204) |
| **Invalid subcategory** | **422** | **`BUSINESS_RULE_VIOLATION`** | `Unknown subcategory '<x>' for category '<y>'.` | `{field:"subcategory", category}` | ❌ **200 today** |
| **Inactive category assigned** | **422** | **`BUSINESS_RULE_VIOLATION`** | `Category '<x>' is <DRAFT\|ARCHIVED> and cannot be assigned.` | `{field, status}` | ❌ not implemented |
| **Invalid collection** | **422** | **`BUSINESS_RULE_VIOLATION`** | `Unknown collection(s): …` | `{field:"collections", unknown:[…]}` | ❌ not implemented |
| **Invalid media id** | **422** | **`BUSINESS_RULE_VIOLATION`** | `Unknown media asset(s): …` | `{field, unknown:[…]}` | ❌ not implemented (and the field becomes read-only — §11.4) |
| Invalid status transition (submit/approve/publish/…) | 422 | `BUSINESS_RULE_VIOLATION` | action-specific | `{errors:[…]}` for publish | ✅ **[RUN]** |
| Not approved → publish | 422 | `BUSINESS_RULE_VIOLATION` | `This product has not been approved for publication yet…` | — | ✅ **[RUN]** |
| Publish issues outstanding | 422 | `BUSINESS_RULE_VIOLATION` | `Product has unresolved publish issues.` | `{errors:[…]}` | ✅ **[RUN]** |
| Incomplete record → submit-review | 422 | `BUSINESS_RULE_VIOLATION` | `Product is not ready for review. Missing: …` | — | ✅ |
| **Invalid price** (≤ 0 with no valid `pricing`) | **422** | **`BUSINESS_RULE_VIOLATION`** | `Selling price must be greater than zero.` | `{field:"pricing"}` | ⚠️ enforced only at submit/publish, not on write |
| **Invalid inventory** (negative stock) | **422** | **`VALIDATION_ERROR`** | field error | `{field:"stock"}` | ❌ no `ge=0` anywhere |
| Product not found | 404 | `NOT_FOUND` | `Product '<id>' not found.` | `{}` | ✅ **[RUN]** |
| Unauthenticated | 401 | `UNAUTHORIZED` | `Authentication token missing.` | `{}` | ✅ **[RUN]** |
| **Unauthorized product update** (wrong scope) | 403 | `FORBIDDEN` | `Admin authentication privileges required.` | `{}` | ✅ |
| Missing permission | 403 | `FORBIDDEN` | `Missing required permission: products.manage` | `{}` | ✅ **[RUN]** |
| **Forbidden employee update** (unassigned) | 403 | `FORBIDDEN` | `You are not assigned to this product.` | `{}` | ✅ |
| **Invalid `assignedEmployeeId`** | **422** | **`BUSINESS_RULE_VIOLATION`** | `Unknown employee code '<x>'.` | `{field:"employeeId"}` | ❌ **200 today** (API-205) |
| Bulk with `status` | 422 | `BUSINESS_RULE_VIOLATION` | `No supported bulk fields in request.` | `{rejected, supported, hint}` | ✅ **[RUN]** |

The frontend renders all of these through `formatAdminError(result, {entity, action})`,
which already distinguishes 401 / 403 / 404 / 409 / 422 / 5xx. **No frontend error-format
work is required** — which is precisely why the 500 in PF3-N01 is so damaging: the one
branch the UI cannot interpret is the one the server currently emits.

---

## 17. Frontend Architecture Changes

| File | Role today | Change |
|---|---|---|
| `src/components/products/ProductEditor.jsx` | Editor + Save & continue (`:420`) + `persist` (`:348`) | **(a)** Delete client-side ID allocation; call `GET /admin/products/next-id` (or let the server allocate). **(b)** Load the record from the server on mount (`fetchAdminProduct`) instead of `catalogRepository.find` — fixes PF3-N05. **(c)** Validate SKU/slug via `GET /admin/products/availability`, not the session cache. **(d)** Keep the lifecycle-key stripping (verified correct). |
| `src/components/products/editorSectionsBasics.jsx` | Category/Subcategory selects (`:226-264`) | Read the **admin** taxonomy surface (any status) via `taxonomyRepository.loadCategory` / `apiAdminListSubcategories`. Emit **ids** for both levels. Remove `departmentCategoriesFor` / `departmentSubcategoriesFor` from the write path. |
| `src/components/products/editorSectionsContent.jsx` | `SectionMedia` (`:183`) | Media becomes assignment-only against the saved id; drop the free-text cover field once the read-only projection lands (§11.4). |
| `src/services/api/productsApi.js` | Payload builder (`:50`) + normaliser (`:148`) + 30 wrappers | **(a)** Fix `normaliseProduct` price precedence (API-050/051). **(b)** Stop emitting `mediaIds` / `primaryMediaId` / `galleryMediaIds` / `collections` once those become read-only. **(c)** Send `category`/`subcategory` as ids. **(d)** Remove the dead `apiAdminCreateProduct`. |
| `src/services/admin/productAdminService.js` | Awaited admin layer | `createAdminProduct` no longer needs the local id guard; surface 409 (duplicate SKU/slug/id) distinctly from 422. |
| `src/services/taxonomyRepository.js` | Phase 2 facade | Expose an admin-mode option list (any status) for the product editor; keep `categoryOptions()` for storefront consumers. |
| `src/config/productIdPrefixes.js` | Static ID allocator | **Retire from the write path.** Either delete once the server allocates, or reduce to a display-only prefix helper. This is what removes the `data/catalog/taxonomy.js` dependency (API-223). |
| `src/data/catalog/taxonomy.js`, `src/data/products/taxonomy.js`, `src/data/products/departments.js` | Static taxonomy | Remove from every **write** path. Storefront read usage is a Phase 4 concern. |
| `src/config/productCatalogConfig.js` | Merged static+server option lists (`:89`) | Server-only. |
| `src/services/catalogRepository.js` | Session cache | Remains a cache; must stop being an **authority** for existence, uniqueness or ID allocation. |
| `src/hooks/useProducts.js`, `useCatalogueQuery.js` | Storefront read | No Phase 3 change (API-213 deferred). |

**Mock / local-fallback inventory (Step 14):**

| Location | Behaviour | Phase 3? |
|---|---|---|
| `catalogRepository` | In-memory session cache, **no** seed, **no** localStorage (**[READ]** `:66-72`) | Not a mock — but it is used as an authority in three places. Fixed above. |
| `productIdPrefixes.js` → `data/catalog/taxonomy.js` | Static taxonomy gates ID allocation | **Yes — must go** |
| `productCatalogConfig.js` → `data/products/taxonomy.js` | Static subcategory options merged with server | **Yes** |
| `ProductEditor` → `data/products/departments.js` | `departmentForProduct` derivation | **Yes** |
| `productMediaSource.js` → `data/products` plates, `data/mediaPlaceholder` | Authored-plate fallback | Phase 4 |
| `mediaRepository.js` → `localStorage` | Local media register | Phase 4 |
| `services/workflow/productWorkflowCommands.js` | Local lifecycle commands, **employee portal only** | Phase 3 documents it; the employee surface is Phase 5 |

Admin product management already routes every write through
`productAdminService` → `productsApi` → `apiClient` with `scope:"admin"` — **[RUN]** 183
`apiClient` calls, 0 unscoped. That part is sound.

---

## 18. Backend Architecture Changes

| File | Change |
|---|---|
| `app/core/error_handlers.py` | **PF3-N01** — sanitise `RequestValidationError.errors()` to JSON-safe primitives before building the envelope. Repo-wide fix, product-visible. |
| `app/schemas/catalog/product.py` | **(a)** Declare `ProductStatus` and `ReviewState` as real enums (or `Literal`) so OpenAPI carries them. **(b)** Declare an `Availability` vocabulary. **(c)** Replace `pricing: Dict[str,Any]` with a typed request model. **(d)** Add `ge=0` to `stock` / `low_stock_threshold`. **(e)** Remove `mediaIds` / `primaryMediaId` / `galleryMediaIds` / `collections` / `collection` from `ProductContentFields` once the frontend stops sending them (staged — see §24). |
| `app/services/catalog/product_service.py` | **(a)** `create_product` honours a supplied `slug` (PF3-N04). **(b)** SKU/slug collision → `ConflictException` instead of silent renaming. **(c)** New `_resolve_taxonomy()` used by create and update (API-204). **(d)** `_subcategory_status_map()` + fail-closed category default in both storefront reads (PF3-N06/N07). **(e)** `assign_employee` validates the code (API-205). **(f)** Server-side ID allocation reused by `create_product`. |
| `app/api/v1/products.py` | Refresh route docstrings to match the corrected lifecycle vocabulary; retire or document `/admin/workflow/metrics` (API-088). |
| `app/services/catalog/product_service.py` (employee projection) | New `EmployeeProduct` projection for `GET /employee/products/{id}` (PF3-N11). |
| `app/services/catalog/collection_service.py` | `assign_products` validates product ids (PF3-N08). |
| `app/api/v1/media.py` | `role` allow-list on `/media/register`; `namespace` allow-list on `/media/objects` (API-085/086/132/133). |
| `app/schemas/catalog/product.py` (`EmployeeProductUpdateRequest`) | Drop `extra="allow"` — the service already re-filters, so the schema is misleading. |
| `API_CONTRACT.md` | Correct §3.3's product-status enum; document `review.state`, `availability`, the visibility gate, and the error matrix. |
| `docs/openapi.json` | Regenerate. |

---

## 19. Database / Migration Assessment

| Proposed change | Migration? | Why |
|---|---|---|
| Fix the 422 envelope (PF3-N01) | **NO MIGRATION REQUIRED** | Handler code only. |
| Server-side product ID allocation | **NO** | `catalog_product.id` is already `String(36)`; `pf-<base36>` and `PF-…-NNNN` both fit. |
| Honour the supplied slug (PF3-N04) | **NO** | Behavioural change in the service. |
| SKU/slug collision → **409** at the service layer | **NO** | A `SELECT` before insert. No constraint needed. |
| Taxonomy validation (API-204) | **NO** | Lookup against existing `catalog_category` / `catalog_subcategory`. |
| Subcategory visibility gate (PF3-N06) | **NO** | New read query. |
| Fail-closed category default (PF3-N07) | **NO** | Predicate change. **Data risk, not schema risk** — see §23. |
| Declare status / review / availability enums | **NO** | Pydantic-side. `status` is `String(30)`, `availability` `String(30)` — already wide enough. |
| Type the `pricing` block | **NO** | `pricing` is JSONB. |
| Validate `assignedEmployeeId` | **NO** | Lookup against `employees_profile`. |
| Narrow the employee projection | **NO** | Response model only. |
| Collection id validation | **NO** | Lookup only. |
| Media `role` / `namespace` allow-lists | **NO** | `String(30)` columns; validation, not schema. |
| Remove media-write fields from the product contract | **NO** | Columns stay for legacy dual-read. |
| **Unique SKU** | **⚠️ MIGRATION REQUIRED** | `ix_catalog_product_sku` is `unique=False` (`597f883749d8:115`). Making it unique needs a de-duplication pass first. **Deliberately separated** — Phase 3 enforces uniqueness in the service (409); the constraint is a follow-up. |
| **Unique slug** | **⚠️ MIGRATION REQUIRED** | `ix_catalog_product_slug` is `unique=False` (`597f883749d8:116`). Same reasoning. |
| **Add `category_id` / `subcategory_id` FK columns** | **⚠️ MIGRATION REQUIRED** | New columns + backfill of every existing row + a decision about rows whose category string matches nothing. **Explicitly rejected for Phase 3** — §12.3 achieves the same guarantee by validation without touching the schema. |
| Drop the duplicate `assigned_employee_id` index (PF3-N17) | ⚠️ MIGRATION REQUIRED | Cosmetic. Deferred to Phase 4. |

**Phase 3 verdict: NO MIGRATION REQUIRED.** No Alembic revision is created, and no
PostgreSQL object is altered. Existing revisions were inspected read-only
(11 files in `backend/alembic/versions/`; product-touching: `8f0223843258`,
`597f883749d8`, `b6b5dcfb675b`, `m001`).

---

## 20. Exact API Endpoints Affected

| Method & Path | Change | Kind |
|---|---|---|
| `POST /api/v1/admin/products` | Honour supplied slug; taxonomy validation; SKU/slug 409 | **breaking** (silently-discarded slug now respected) |
| `POST /api/v1/admin/products/draft` | Taxonomy validation; SKU/slug 409 | **breaking** (previously-accepted garbage now 422) |
| `PATCH /api/v1/admin/products/{id}` | Taxonomy validation; slug 409 instead of rename; lifecycle rejection becomes a real 422 | **breaking** |
| `GET /api/v1/admin/products/{id}` | Enum-typed `status` / `review.state` / `availability` in OpenAPI | non-breaking |
| `GET /api/v1/admin/products` | same | non-breaking |
| `GET /api/v1/products` | Subcategory gate; fail-closed category default | **behavioural** |
| `GET /api/v1/products/{id_or_slug}` | same | **behavioural** |
| `GET /api/v1/collections/{id}/products` | inherits the corrected gate | **behavioural** |
| `GET /api/v1/categories/{id}/products` | inherits the corrected gate | **behavioural** |
| `POST /api/v1/products/{id}/submit-review` | enum-declared transitions only | non-breaking |
| `POST /api/v1/admin/products/{id}/approve` \| `/reject` \| `/publish` \| `/unpublish` \| `/archive` \| `/restore` | enum-declared transitions only | non-breaking |
| `POST /api/v1/admin/products/{id}/assign` | `employeeId` validated | **breaking** |
| `POST /api/v1/admin/products/bulk` | unchanged (already correct) | — |
| `GET /api/v1/admin/products/availability` | now actually consumed by the editor | non-breaking |
| `GET /api/v1/admin/products/next-id` | now actually consumed; **format reconciled** with the canonical 4-digit convention | **breaking** (response format) |
| `GET /api/v1/admin/workflow/metrics` | retire or document (API-088) | decision |
| `GET /api/v1/employee/products/{id}` | narrowed projection | **breaking** |
| `PATCH /api/v1/employee/products/{id}` | unchanged; `extra="allow"` removed from the schema | non-breaking |
| `PUT /api/v1/admin/collections/{id}/products` | product-id validation | **breaking** |
| `POST /api/v1/media/register` | `role` allow-list | **breaking** |
| `POST /api/v1/media/objects`, `POST /api/v1/media/products/{id}/objects` | `namespace` allow-list | **breaking** |
| **all endpoints** | 422 envelope becomes renderable (PF3-N01) | **fix** |

---

## 21. Exact Files Potentially Changed

### Backend
```
app/core/error_handlers.py                      ← PF3-N01 (P0)
app/schemas/catalog/product.py                  ← enums, typed pricing, ge=0, media-field removal
app/services/catalog/product_service.py         ← taxonomy, uniqueness, visibility, assign, ID
app/api/v1/products.py                          ← docstrings, next-id format, workflow/metrics
app/services/catalog/collection_service.py      ← assign_products validation
app/api/v1/media.py                             ← role / namespace allow-lists
app/schemas/media/*.py                          ← role / namespace vocabularies (if declared)
API_CONTRACT.md                                 ← §3.3 status enum, review state, availability, errors
docs/openapi.json                               ← regenerate
```

### Backend tests (new files; existing tests untouched until the sequence in §24)
```
tests/unit/test_phase3_product_contract.py      ← create/update/aliases/uniqueness/taxonomy
tests/unit/test_phase3_product_lifecycle.py     ← transition matrix
tests/unit/test_phase3_product_visibility.py    ← storefront gates
tests/unit/test_phase3_error_envelope.py        ← 422 serialisation (repo-wide)
```

### Frontend
```
src/components/products/ProductEditor.jsx
src/components/products/editorSectionsBasics.jsx
src/components/products/editorSectionsContent.jsx
src/services/api/productsApi.js
src/services/admin/productAdminService.js
src/services/taxonomyRepository.js
src/config/productIdPrefixes.js
src/config/productCatalogConfig.js
src/data/catalog/taxonomy.js                    ← removed from the write path
src/data/products/taxonomy.js                   ← removed from the write path
src/data/products/departments.js                ← removed from the write path
```

### Frontend tests (new)
```
tests/phase3ProductCreate.test.js
tests/phase3ProductPayload.test.js
tests/phase3ProductLifecycleUI.test.js
tests/phase3ProductTaxonomy.test.js
```

**Explicitly not touched:** cart, checkout, orders, payments, wishlist, notifications,
analytics, workforce, inventory, AI/chatbot, and the RBAC role/permission model.

---

## 22. Test Strategy

### 22.1 Backend

| Area | Cases |
|---|---|
| **Create product** | draft with a canonical id → 201 + DRAFT + `published=false` + `review.state=NONE`; runtime-id create → 201; supplied slug **honoured on both paths** (regression for PF3-N04); server defaults applied; `flags` mirror recomputed |
| **Invalid payload** | missing `id` on draft → **422 with a renderable envelope** (regression for PF3-N01); malformed id → 422; each blocked lifecycle key → 422 naming the key; `stock: -1` → 422; unknown key → 200 and **not persisted** |
| **Aliases** | every camelCase alias accepted; every snake_case name accepted (`populate_by_name`); a payload mixing both resolves identically |
| **Duplicate SKU** | second create with the same SKU → **409 `CONFLICT`** with `details.field == "sku"`; PATCH onto a taken SKU → 409; case/whitespace normalisation defined and tested |
| **Duplicate slug** | → **409** with `details.suggestedSlug`; **no silent `-1` rename** |
| **Category validation** | valid id / slug / name all resolve to one canonical value; unknown → 422; DRAFT category → 422; ARCHIVED category → 422; subcategory not belonging to the category → 422 |
| **Subcategory validation** | valid → stored canonically; unknown → 422; ARCHIVED subcategory → 422 on assign |
| **Lifecycle transitions** | the full 4×4 matrix: every legal transition asserted, every illegal one asserted to 422 with the right message. Explicitly: approve ≠ publish; publish requires APPROVED; publish blocked by each `get_publish_issues` item; archive from every state; restore only from ARCHIVED; submit blocked when PUBLISHED / ARCHIVED / already-PENDING / already-APPROVED |
| **Response serialisation** | `AdminProduct` → 76 camelCase keys, 0 snake_case; `status` / `review.state` / `availability` match the declared enums; `originalPrice` and `compareAtPrice` independently correct (regression for API-050/051 at the source) |
| **Visibility** | the eight-row matrix in §10.1, each asserted on **both** `GET /products` and `GET /products/{id}`; archived subcategory now hides; unknown category now hides; a legacy row with a matching category string still shows |
| **Employee** | `assignedEmployeeId` unknown → 422; valid code → stored; `null` → unassigned; employee projection excludes `review` / `history` / `priceHistory` / `createdBy` |
| **Collections** | `assign_products` with an unknown id → 422 listing it; MANUAL vs RULE_BASED 409 preserved |
| **Media** | `role` outside the allow-list → 422; `namespace` outside the allow-list → 422; `media_product_media` ordering (primary first, then `sort_order`, then id) |
| **Error envelope** | for **every** product error in §16.2: status, `code`, `message`, `details` shape. Plus a repo-wide parametrised test that every `ValueError`-raising validator round-trips through the handler |

### 22.2 Frontend

| Area | Cases |
|---|---|
| **Payload generation** | `buildAdminProductPayload` key set is exactly the backend whitelist; no lifecycle key ever appears; `category`/`subcategory` are ids; `undefined` keys are dropped, `""` keys are kept; media-write keys absent after the staged removal |
| **Save & continue** | a server-allocated taxonomy path produces a request (**regression for PF3-N02** — assert `apiAdminCreateDraft` is *called*, which today it is not); success advances one section; failure renders the server message, not the local ID message; 409 renders distinctly from 422 |
| **Save Draft** | creates then navigates to `/admin/products/{serverId}/edit` with the **server's** id |
| **Submit for review** | blocks on the local checklist; calls `runAction(id,"submitReview")`; re-baselines from the response |
| **Response normalisation** | `originalPrice` prefers `originalPrice` (API-050); `compareAtPrice` prefers `compareAtPrice` (API-051); snake_case fallbacks still work for legacy payloads |
| **Product ID retention** | after create, `draft.id === response.product.id`; a second save PATCHes rather than re-creates |
| **Redirect / edit navigation** | edit mode issues `GET /admin/products/{id}` on mount (**regression for PF3-N05**); a cold cache no longer renders "Product unavailable" |
| **Taxonomy selection** | options come from the admin surface and include DRAFT/ARCHIVED; selecting a category resets the subcategory; the wire value is an id at both levels |
| **Media assignment** | assignment happens against a saved id; the product payload carries no media-write keys |
| **Explicit API scopes** | every product call passes `scope:"admin"` (extend the existing 183-call invariant to a test) |

### 22.3 Integration — the full flow

One test that walks the whole chain against the real app:

```
CREATE  POST /admin/products/draft            → 201, DRAFT, id retained
SAVE    PATCH /admin/products/{id}            → 200, partial semantics hold
READ    GET  /admin/products/{id}             → 200, camelCase, DRAFT
EDIT    PATCH /admin/products/{id}            → 200, history grows, price history OLD→NEW
        GET  /products                        → product ABSENT (still DRAFT)
SUBMIT  POST /products/{id}/submit-review     → 200, PENDING_REVIEW / PENDING
APPROVE POST /admin/products/{id}/approve     → 200, PENDING_REVIEW / APPROVED (NOT published)
PUBLISH POST /admin/products/{id}/publish     → 422 while a cover image is missing
        POST /media/register (product_id, is_primary)
        POST /admin/products/{id}/publish     → 200, PUBLISHED, published=true
STOREFRONT GET /products                      → product PRESENT
        GET /products/{id}                    → 200
        archive the category                  → product ABSENT from both
        archive the subcategory               → product ABSENT from both   ← PF3-N06 regression
        POST /admin/products/{id}/unpublish   → DRAFT, ABSENT
        POST /admin/products/{id}/archive     → ARCHIVED, ABSENT
        POST /admin/products/{id}/restore     → DRAFT
```

Every step asserts the **HTTP status**, the **canonical envelope**, and the **DB row**, so a
green run means the contract held end to end rather than that no exception escaped.

---

## 23. Regression Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Fail-closed category default hides legacy products.** Any row whose `category` string matches no `catalog_category` id/slug/name disappears from the storefront the moment PF3-N07 lands. | **High** | **High** — silent storefront loss | Before flipping the default, run a read-only reconciliation report over `catalog_product.category` × `catalog_category`. Ship the report, get the list reviewed, backfill or archive deliberately. Never flip the default blind. |
| R2 | **Taxonomy validation breaks existing admin saves.** Products carrying free-text or legacy category values can no longer be PATCHed without also fixing the taxonomy. | **High** | Medium | Return the offending field in `details` so the UI can point at it. Consider a grace period that warns on read and rejects only on write of the taxonomy fields themselves. |
| R3 | **Slug 409 replaces silent rename.** Any automation relying on "post a duplicate slug, get `-1` back" breaks. | Medium | Medium | Return `details.suggestedSlug` so callers can retry deterministically. Announce it as a breaking change. |
| R4 | **`next-id` format change.** `get_next_id` returns `{prefix}-{n:03d}`; the canonical convention is 4 digits. Changing it affects existing id sequences. | Medium | Medium | Reconcile in one step, with a test that both formats' existing rows keep resolving. |
| R5 | **Removing media-write fields from `ProductContentFields`.** Any caller still sending them gets 422. | Medium | Medium | Two-stage: ship the frontend change first, confirm no caller sends them (a temporary log counter), then remove them server-side. |
| R6 | **Enum tightening.** Declaring `availability` / `status` as enums could reject values already in the database. | Medium | High | Validate the declared vocabulary against `SELECT DISTINCT` on a real database **before** tightening. Enumerate what is actually stored, not what the code intends. |
| R7 | **422 handler change is repo-wide.** Fixing PF3-N01 alters error bodies everywhere, not just products. | Low | Medium | The envelope shape is unchanged — only `details` becomes serialisable. Assert the existing 333 backend tests still pass, and add the parametrised handler test. |
| R8 | **Employee projection narrowing** may break an employee screen that reads `review` or `history`. | Medium | Low | Grep the employee portal for those fields before removing them. |
| R9 | **Cache interaction.** Product writes already invalidate both cache layers (**[RUN]** verified). Adding new read gates must not introduce a second cache key that is not invalidated. | Low | Medium | Extend the existing invalidation test to cover the subcategory gate. |
| R10 | **Subcategory gate changes storefront counts**, which feed facets, `resolvedProductCount` and taxonomy metrics. | Medium | Medium | Assert facet counts and collection counts in the same test as the gate. |

---

## 24. Implementation Sequence

Derived from the dependency graph, not assumed. Each step is independently shippable and
leaves the suite green.

| Step | Work | Why here | Blocks |
|---|---|---|---|
| **0** | **Read-only reconciliation report**: `SELECT DISTINCT category`, `subcategory`, `availability`, `status` from `catalog_product`, joined against `catalog_category` / `catalog_subcategory`. No writes. | R1 and R6 cannot be sized without it. Every later decision depends on what is actually stored. | 3, 5, 7 |
| **1** | **PF3-N01 — fix the 422 envelope** + parametrised handler test. | Nothing else can be *diagnosed* until validation errors are readable. Repo-wide, zero product coupling, zero migration. | everything |
| **2** | **Declare the vocabularies** (`status`, `review.state`, `availability`) and correct `API_CONTRACT.md` §3.3. Regenerate `docs/openapi.json`. | Cheap, unblocks every assertion in steps 4-8, and closes API-114/115/116/139/PF3-N10 as a documentation fix. | 4, 8 |
| **3** | **Taxonomy resolution + validation** in `ProductService` (create and update), returning 422 with `details.field`. | API-204 is the deepest defect: it is what makes PF3-N07 dangerous, and the frontend taxonomy work depends on knowing what the server accepts. | 5, 7, 11 |
| **4** | **Create-path correctness**: honour the supplied slug on both routes; SKU/slug collision → 409 with `suggestedSlug`; type the `pricing` block; `ge=0` on stock fields. | Now that a 422/409 is renderable, the create contract can be tightened safely. | 6, 11 |
| **5** | **Server-authoritative product ID**: reconcile the `next-id` format, wire the editor to it, delete client-side allocation, remove the static-taxonomy dependency from the write path. | **This is the actual Save & continue fix.** It needs step 3 (the server must accept an id-based taxonomy) and step 4 (a collision must be a clean 409). | 6 |
| **6** | **Editor data flow**: load from the server on mount; validate SKU/slug through `GET /admin/products/availability`; admin taxonomy surface (any status) for both selectors; ids on the wire. | Depends on 3 and 5. Closes PF3-N05, API-203/202/189, API-223 in the write path. | 11 |
| **7** | **Visibility gate**: subcategory parity; fail-closed category default — **only after** the step 0 report is reviewed. Extend cache invalidation coverage. | Highest regression risk (R1); must follow taxonomy validation so the fail-closed default cannot strand live rows. | 11 |
| **8** | **Lifecycle hardening**: enum-declared transitions, the full matrix test, resolve the `change-id` cascade question, declare the review-flag vocabulary. | Independent of the create path; needs step 2's enums. | 11 |
| **9** | **Product media honesty**: `role`/`namespace` allow-lists; frontend stops sending media-write keys; then remove them from `ProductContentFields`; publish gate unchanged during the transition. | Two-stage by design (R5). | 11 |
| **10** | **Collection + employee contract**: collection id validation; `assignedEmployeeId` validation; narrowed employee projection. | Contained, no upstream dependency beyond step 1. | 11 |
| **11** | **Response cleanup + integration suite**: `normaliseProduct` precedence (API-050/051); retire `apiAdminCreateProduct`; decide `/admin/workflow/metrics` (API-088); land the end-to-end test from §22.3. | Last, because it asserts everything above at once. | — |

---

## 25. Acceptance Criteria

**Save & continue**
1. Creating a product with a taxonomy path that exists **only on the server** succeeds — no
   static-map match required.
2. `POST /api/v1/admin/products/draft` is issued with a server-allocated id; the editor
   never allocates an id locally.
3. On 201 the editor holds the server's id, re-baselines from the server record, and
   advances one section.
4. On 409 the UI names the collision (SKU / slug / id) and offers the server's
   `suggestedSlug`.

**Contract**
5. No product request can produce HTTP 500 for a validation reason. Every rejection is a
   422 or 409 in the canonical envelope with a populated `details`.
6. `PATCH` with a blocked lifecycle key returns 422 naming the key — never 500.
7. A supplied slug is stored verbatim on **both** create paths, or rejected with 409. It is
   never silently suffixed.
8. A duplicate SKU or slug is a 409. Two rows can never share one.
9. An unknown category or subcategory is a 422. Neither can be stored.
10. `assignedEmployeeId` is either a real employee code or `null`.

**Visibility**
11. A product is publicly visible **iff** `status=PUBLISHED` **and** `published=true`
    **and** its category resolves to an `ACTIVE` `catalog_category` **and** its subcategory
    (when set) resolves to an `ACTIVE` `catalog_subcategory`.
12. A product whose category resolves to nothing is **not** visible.
13. `GET /products` and `GET /products/{id}` agree on every row.

**Lifecycle**
14. `approve` never publishes. `publish` requires `review.state=APPROVED` and an empty
    `get_publish_issues()`.
15. Every illegal transition returns 422 with an actionable message.
16. `API_CONTRACT.md` §3.3 lists exactly the statuses the code implements.

**Response**
17. `AdminProduct` serialises camelCase only; `status`, `review.state` and `availability`
    carry declared enums in OpenAPI.
18. `originalPrice` and `compareAtPrice` are independently correct in the normaliser.
19. `docs/openapi.json` matches the live app (0 path delta, 0 property delta).
20. `GET /employee/products/{id}` exposes no `review`, `history`, `priceHistory`,
    `createdBy` or `updatedBy`.

**Process**
21. No Alembic revision is added. No PostgreSQL object is altered.
22. Backend suite ≥ 333 passing with the new product tests added; frontend suite ≥ 239
    passing with the new tests added; 0 failures.
23. `apiClient` calls remain 100% explicitly scoped; `scopeForPath` remains at 0 references.
24. The §22.3 end-to-end flow passes against the real application.

---

## 26. Phase 3 Exit Criteria

Phase 3 is complete when **all** of the following hold:

- [ ] The step 0 reconciliation report is produced, reviewed, and its findings actioned or
      explicitly accepted in writing.
- [ ] All 18 items in §4 are implemented, each with the tests named in §22.
- [ ] Zero product request paths can return 500 for a validation reason (parametrised test).
- [ ] The §16.2 error matrix passes in full — every row asserted on status, code, message
      and details shape.
- [ ] The §10.1 visibility matrix passes on both list and detail endpoints.
- [ ] The §9.2 lifecycle matrix passes, including every illegal transition.
- [ ] The §22.3 integration flow passes end to end.
- [ ] `API_CONTRACT.md` updated: §3.3 status enum corrected; `review.state`, `availability`,
      the visibility gate and the product error matrix documented.
- [ ] `docs/openapi.json` regenerated; zero drift against `app.openapi()`.
- [ ] Backend: **0 failures**, count ≥ 333 + new tests. Frontend: **0 failures**, count ≥ 239
      + new tests.
- [ ] No migration created; `git status` shows no change under `backend/alembic/`.
- [ ] No change outside the file list in §21.
- [ ] Every §5 deferral carries a written note recording **what** was deferred and **why**.
- [ ] A `PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_REPORT.md` records, per finding: the
      before-state, the change, and the test that proves it.

---

## 27. Recommended Phase 4

Ordered by the dependencies Phase 3 creates.

| Priority | Theme | Contents | Why now |
|---|---|---|---|
| **1** | **Database integrity for the catalogue** | Unique constraints on `catalog_product.sku` and `.slug` (migration + de-dup pass); drop the duplicate `assigned_employee_id` index (PF3-N17). | Phase 3 enforces uniqueness in the service only. Without the constraint, a concurrent create can still produce a duplicate. This is the natural, small follow-up. |
| **2** | **Media as a first-class domain** | Retire the `mediaRepository` `localStorage` register (API-197) and the authored-plate fallback (API-228); close API-206/207/208; make `media_product_media` the only product-media authority. | Phase 3 makes the product contract stop writing media; Phase 4 finishes the job on the media side. |
| **3** | **Explicit-null response semantics** | Make `_to_admin` distinguish `null` from `""` so `API_CONTRACT.md` §3.1 is actually true (PF3-N12). | Cross-cutting across every projection — too broad for Phase 3, and Phase 3's enum work makes the blast radius measurable. |
| **4** | **Storefront state & cache** | API-213 verification; API-209 pagination on `/admin/categories` and `/admin/collections`; a single cache-invalidation contract for every catalogue write. | Phase 3 adds two new visibility gates, which multiplies the cache keys that must be invalidated. |
| **5** | **Employee RBAC as a domain** | Role/permission model, `products.manage` granularity, department/section scoping, the employee portal's local workflow commands. | Phase 3 touched only the two direct product dependencies; the rest is now unblocked and well-scoped. |
| **6** | **Retire the remaining static data** | `src/data/products/*` and `src/data/catalog/*` on **read** paths (Phase 3 removes them from write paths). | Completes API-223. |

---

## Appendix A — Reproducing the evidence

```bash
# Backend suite (333 passed, 24 skipped)
cd backend && python -m pytest

# Frontend suite (239 pass, 1 skipped)
cd frontend && npm install && npm test

# The two harnesses used for this audit live OUTSIDE the repo:
#   /tmp/pf3_probe/probe.py    — create/update/lifecycle/error-envelope
#   /tmp/pf3_probe/probe2.py   — visibility, employee, collections, scopes
#   /tmp/pf3_probe/fe.mjs      — real frontend modules under the repo's node loader
#   /tmp/pf3_probe/specdiff.py — docs/openapi.json vs app.openapi()
# They boot the real app against a throwaway SQLite file. PostgreSQL is not
# installed in this sandbox; Postgres-only SQL (JSONB `@>`) is flagged UNVERIFIED.
```

## Appendix B — What was NOT verified

| Item | Reason |
|---|---|
| `PUT /admin/collections/{id}/products` and `GET /collections/{id}/products` at runtime | `_resolve_product_ids` emits the Postgres JSONB containment operator `@>`; SQLite raises `unrecognized token: "@"`. Verified by code reading only. |
| `SELECT DISTINCT` on real catalogue data (step 0) | No PostgreSQL in the sandbox. **This is the first task of implementation, not of planning.** |
| Behaviour under real concurrency (duplicate SKU races) | Single-process harness. |
| The Phase 1 / Phase 2 implementation and verification reports named in the brief | Not present in this repository. The taxonomy work itself was verified directly in the tree instead. |
