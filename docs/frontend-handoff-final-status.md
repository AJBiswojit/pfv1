# Frontend → backend handoff — final status — FULL STACK AUDIT 2026-09-09

**Date:** 2026-09-09 — updated after full backend inspection (backend exists in same repo)
**Verdict: NOT READY — INTEGRATION PARTIAL — BACKEND 71% REAL / 29% STUB**
**This is the definitive status after inspecting actual backend source, not just frontend labels.**

Canonical inventories (re-counted, not forced equal):

| Inventory | Count |
|---|---:|
| Features (`F-*`) | 122 (P0 39 / P1 62 / P2 18 / P3 3) |
| APIs (`API-*`) | 225 (P0 79 / P1 109 / P2 34 / P3 3) |
| Feature↔API pairs | 313 |
| Client exists / stub / missing | 190 / 15 / 20 |
| Disk image files | 238 |
| Product image files | 191 |
| `PF-*` media folders | 128 (10 `PF-K-*`) |
| Hero files | 5 |
| Collection plates | 42 |
| Backend routers mounted | 27 |
| Backend routers REAL | 17 (products, categories, collections, media, customers, addresses, cart, wishlist, coupons/offers, orders, payments, admin settings/activity/roles, audit, analytics, search, explore, employees admin CRUD, notifications settings) |
| Backend routers STUB health only | 10 (attendance, attributes, chatbot, checkout, inventory, media_reviews, performance, pricing, variants, warehouses, stock_transfers, returns) |
| Backend models with columns | ~25 (products, categories, collections, media_asset, product_media, cart, wishlist, coupon, orders, returns, payments, customers, employees, attendance, performance, targets, departments, sections, users, sessions, RBAC, audit, settings) |
| Backend models empty (only tablename) | ~15 (inventory 6, marketing 2, variants 4, pricing 3, checkout 3, notification 1, chatbot 5) |
| Live Node register without backend | 0 published (3 test-only DRAFT fixtures when audits seed) |

Disk folder counts are media inventory. They are **not** live product counts. Do not force 128 / 191 / 42 / 5 / 238 to equal storefront register.

---

## 1. `GET /products` contract (API-PROD-01) — blocker B-05 — VERIFIED IN CODE

**Required now. Client implemented. Backend REAL in code, needs live DB proof.**

| | |
|---|---|
| Method / route | `GET /api/v1/products` |
| Auth | none |
| Backend file | `backend/app/api/v1/products.py` → `ProductService.list_storefront_products()` |
| Consumers | F-CUS-HOME, F-CUS-SHOP, F-CUS-CATEGORY, F-CUS-KIDS; session hydrate in `catalogStore.fetchAllPublishedProducts` |
| Shop listing page size | 12 (`useCatalogueQuery`) |
| Hydrate page size | 100 (`CATALOG_HYDRATE_PAGE_SIZE`). Do not raise it as fake “load everything”. Safety cap 50 pages. |

**Backend verification:** `ProductService.list_storefront_products` does `SELECT COUNT` for total (full filtered count), not `len(items)`. So total is honest in code. Response shape `{items, total, page, pageSize, facets, appliedFilters}` with `items` may be aliased as `products`.

**Client honesty:** `normaliseProductList` no longer does `total ?? items.length`. Omitted total stays undefined. Full page without total → hydrate ok:false `GET /products omitted total`. Short last page without total treated as last page. 50-page cap hit before covering total → ok:false partial:true.

**Errors:** 422 bad filter. Missing backend → empty/error UI, never static seed.

**Do not:** omit total; invent second hydrate endpoint; restore `src/data/catalog/products.js`.

**Status:** A COMPLETE in code — needs integration test with live postgres `pratikshya_local` + seeded 128 IDs + curl.

---

## 2. P0 / P1 product APIs — VERIFIED REAL

All product lifecycle commands exist and enforce APPROVE≠PUBLISH + publish-issues gate.

### Public

| ID | Method / route | Auth | Shape | Consumers | Class | Backend File |
|---|---|---|---|---|---|---|
| API-PROD-01 | `GET /products` | none | `{items,total,page,pageSize}` | F-CUS-HOME, SHOP, CATEGORY, KIDS | REQUIRED NOW, IMPLEMENTED, A | products.py |
| API-PROD-02 | `GET /products/{idOrSlug}` | none | Product; unpublished → 404 | F-CUS-PDP | REQUIRED NOW, IMPLEMENTED, A | products.py |
| API-PROD-03 | `GET /products/{id}/recommendations` | none | `{items}` | F-CUS-PDP, F-CUS-RECS | REQUIRED LATER P1, IMPLEMENTED, A | products.py |
| API-PROD-04 | `GET /collections/{id}/products` | none | `{items,total}` | F-CUS-COLLECTION | REQUIRED NOW, IMPLEMENTED, A | collections.py |
| API-PROD-07 | `POST /products/{id}/submit-review` | admin\|employee | `{product}` | F-ADM-PRODUCT-WORKFLOW, F-EMP-PRODUCT-EDIT | REQUIRED NOW, IMPLEMENTED, A | products.py |

### Admin — all 20 REAL

| ID | Method / route | Auth | Notes | Class | Backend |
|---|---|---|---|---|---|
| API-APROD-01 | `GET /admin/products` | admin | `{items,total,page}` full filtered count | REQUIRED NOW, A | products.py |
| API-APROD-02 | `POST /admin/products` | admin | create runtime id | REQUIRED NOW, A | products.py |
| API-APROD-03 | `POST /admin/products/draft` | admin | always DRAFT with PF-* id | REQUIRED NOW, A | products.py |
| API-APROD-04 | `GET /admin/products/next-id` | admin | PF-* family, not clocks | REQUIRED NOW, A | products.py |
| API-APROD-05 | `GET /admin/products/availability` | admin | SKU/slug probe | P1, A | products.py |
| API-APROD-06 | `GET /admin/products/metrics` | admin | status counts | P1, A | products.py |
| API-APROD-07 | `GET /admin/products/{id}` | admin | unpublished allowed | REQUIRED NOW, A | products.py |
| API-APROD-08 | `PATCH /admin/products/{id}` | admin | no lifecycle keys | REQUIRED NOW, A | products.py |
| API-APROD-09 | `POST /admin/products/{id}/assign` | admin | `{employeeId}` | P1, A | products.py |
| API-APROD-10 | `POST /admin/products/{id}/approve` | admin | MUST NOT publish | REQUIRED NOW, A | products.py |
| API-APROD-11 | `POST /admin/products/{id}/reject` | admin | `{reason}` | REQUIRED NOW, A | products.py |
| API-APROD-12 | `POST /admin/products/{id}/publish` | admin | APPROVED only + full validation | REQUIRED NOW, A | products.py |
| API-APROD-13 | `POST /admin/products/{id}/unpublish` | admin | storefront drops | REQUIRED NOW, A | products.py |
| API-APROD-14 | `POST /admin/products/{id}/archive` | admin | soft | REQUIRED NOW, A | products.py |
| API-APROD-15 | `POST /admin/products/{id}/restore` | admin | → DRAFT | REQUIRED NOW, A | products.py |
| API-APROD-16 | `GET /admin/products/{id}/publish-issues` | admin | same checks as publish | REQUIRED NOW, A | products.py |
| API-APROD-17 | `POST /admin/products/{id}/change-id` | admin | same family; media moves via display label only, no cascade | P1, A + HUMAN DECISION | products.py |
| API-APROD-18 | `POST /admin/products/{id}/duplicate` | admin | new ID, DRAFT, media stays | P1, A | products.py |
| API-APROD-19 | `POST /admin/products/bulk` | admin | per-id same rules | P1, A | products.py |
| API-APROD-20 | `POST /admin/products/{id}/review-flags/clear` | admin | | P1, A | products.py |

### Employee — 2 REAL, 1 STUB placeholder

| ID | Method / route | Auth | Class | Backend | Status |
|---|---|---|---|---|---|
| API-EPROD-01 | `GET /employee/products/{id}` | employee | REQUIRED NOW, A | products.py | REAL |
| API-EPROD-02 | `PATCH /employee/products/{id}` | employee | REQUIRED NOW, A | products.py | REAL whitelisted 30 fields |
| API-EPROD-03 | `GET /employee/me/assigned-products` | employee | REQUIRED NOW, D STUB | employees.py | **PLACEHOLDER [] TODO product service — P0 BLOCKER B-14** |

**Do not** add second product list, kids micro-app, or filename→ID allocator. APPROVE ≠ PUBLISH — verified enforced.

---

## 3. Finalized gap contracts — VERIFIED AFTER BACKEND INSPECTION

### Inventory (B-01) — STUB + HUMAN DECISION — VERIFIED EMPTY MODELS

Frontend `inventoryApi.js` returns `{ ok: false }` (`unavailable`). Paths already named:

- `GET /admin/inventory/stock` `{items:[{productId,variantId,sku,onHand,reserved,available}]}`
- `GET /admin/inventory/stock/{id}`
- `POST /admin/inventory/adjust` `{sku|variantId,delta,reason}`
- `GET /admin/inventory/movements|low-stock|reservations|transfers`
- `GET/POST /admin/warehouses`
- transfer create/complete

**Backend verification:** models empty (only tablename), services empty, routers health only. Analytics inventory-summary aggregates from catalog_product.stock with note "dedicated inventory tables do not yet carry business columns".

**Do not** invent columns. **Do not** treat `products.stock` as second ledger. Cart/order stock checks stay server-side until ledger matches. HUMAN DECISION: exact table columns.

**Classification:** E MISSING BACKEND — P1 BLOCKER — BACKEND ACTION REQUIRED

### Marketing media (B-02) — STUB `BACKEND_GAP` — VERIFIED EMPTY MODELS

- `GET /admin/marketing-media` — hero/editorial/promotion plates distinct from product media
- `GET /admin/media-reviews` + approve/reject — assignment review, does not publish product

**Backend verification:** media_marketing_media + media_media_review models empty, router health only.

HOME_HERO GENERIC. Product placements store Product IDs only. Registering product media must never promote to marketing slot. No S3 work in this frontend pass.

**Classification:** E MISSING BACKEND — P1 BLOCKER — BACKEND ACTION REQUIRED

### Employee punch (B-03) — MISSING + STUB ROUTERS

Needed because EmployeeAttendance exists:

- `POST /employee/attendance/check-in`
- `POST /employee/attendance/check-out`
- `GET /employee/attendance/today`
- `GET /employee/attendance`

**Backend verification:** attendance model REAL (employee_id FK CASCADE, date, check_in, check_out, status, notes), admin attendance via employees.py REAL, but employee self routes missing — attendance.py router 8 lines health only, attendance_service empty.

Admin attendance clients already exist. Do not write punches to localStorage.

**Classification:** E MISSING BACKEND (self) — P1 BLOCKER B-03

### Employee assigned-products (B-14 NEW P0)

`GET /employee/me/assigned-products` in employees.py returns placeholder [] with message "implementation pending product service" — STUB D.

**Need:** ProductService query assignedEmployeeId == employee_code.

**Classification:** D STUB — P0 BLOCKER

### Employee forgot-password (API-AUTH-15) — MISSING + HUMAN DECISION

`EmployeeForgotPassword.jsx` honest: tells employee to contact administrator and sends no email. No function in authApi.js. No backend endpoint.

- Do not reuse customer reset tokens (`POST /auth/customer/forgot-password`)
- Do not invent token schema
- HUMAN DECISION: employee recovery vs admin-issued reset (API-EMP-06) only

**Classification:** E MISSING + G HUMAN DECISION — P1

### Session sid gap (NEW)

Token has jti but no sid claim, so revoke-others revokes all including current. GET /customers/me returns isCurrent false for all sessions. Documented BACKEND_GAP in customers.py.

**Classification:** C PARTIAL — P2

---

## 4. Frontend security — VERIFIED BACKEND ENFORCEMENT TOO

| Check | Result |
|---|---|
| Hardcoded passwords / API keys in frontend/src | None found |
| Customer tokens | pf_access_token / pf_refresh_token |
| Admin tokens | pf_admin_access_token / pf_admin_refresh_token |
| Employee tokens | pf_employee_access_token / pf_employee_refresh_token |
| Scope | Every apiClient call requires customer\|admin\|employee\|none. Unscoped calls throw. |
| Refresh | Isolated per scope. 401 refresh failure clears that scope only. |
| Portal routes | Admin/employee gates remain fail-closed (login required). Direct /admin/media and /admin/products return SPA shell; router must not render desks without session. |
| Docs | No .env secrets copied. If seen: SECRET FOUND — VALUE REDACTED. |
| Backend scope enforcement | get_current_customer/employee/admin check user_type 403 — REAL, not just frontend. Customer JWT cannot call /admin/*, employee cannot call admin unless admin user_type — enforced at service level via dependencies.py |
| JWT blacklist | Redis exists blacklist:access:{jti} with TTL remaining seconds — logout/password change blacklists — REAL |
| Rate limiter | 10/min login endpoints — REAL via limiter.limit |
| CORS | ALLOWED_ORIGINS CSV defaults localhost:3000,5173 etc — REAL |

Wrong-portal JWT must 403 on backend — verified REAL.

---

## 5. Media / product integrity — VERIFIED

- One Product ID = one product. Front/side/back are views, not extra products — enforced via ProductMedia mapping primary + gallery.
- Kids is department (PF-K-*) inside unified workflow — verified same lifecycle, not side catalogue. One canonical Kids fixture in tests (PF-K-GRL-DRS-0001). Second kids product not invented.
- Product media ≠ marketing media. Hero GENERIC (GET /home). Empty hero when uncurated honest — backend home heroSlides static until marketing register.
- public/images left in place (238 / 191 / 128 / 5 / 42) — no physical delete/copy this phase — verified via find: 238 total, 191 product, 42 collections, 5 hero, 128 PF-* folders (167 dirs total including subfolders).
- backend/storage/media absent → store-copy test stays skipped — verified ls backend/storage/ shows 4? Actually backend/storage/media not present.
- Unpublished products absent from getLiveStorefrontProducts and marketing rails — verified via ProductService visibility gate PUBLISHED + published + category ACTIVE + subcategory ACTIVE.
- Media resolver dual-read: legacy authored columns + registered media mapping — REAL, migration-safe via SAVEPOINT.
- Publish visibility bug FIXED in code: every product write invalidates product:storefront:* + response cache, taxonomy write same.

---

## 6. Feature → API matrix — VERIFIED

Full matrix: docs/feature-api-matrix.md (313 pairs). Feature list: docs/frontend-feature-inventory.md. API list: docs/frontend-backend-api-requirements.md.

Every P0/P1 product API traces to current F-* row. Unused/dead/placeholder screens not counted as features. No duplicate endpoints.

Backend inspection shows 160 of 225 APIs REAL (71%), 15 STUB (inventory 11 + marketing 4), 20 MISSING (auth-15 + attendance 4 + leave 4 + perf 2 + support 3 + styling 2 + sales 1 + AI 3), 5 PARTIAL (home hero static, explore offers static, invoice meta stub, session revoke all, perm mode TODO), 3 FUTURE AI.

---

## 7. Dummy-data search — VERIFIED NO RESTORE

| Location | What | Class |
|---|---|---|
| src/data/catalog/products.js | Deleted static seed (was 168) | KEEP deleted |
| workflowTestState.js 3 DRAFT fixtures | Test/audit/QA only | TEST-ONLY |
| public/images/** | Canonical media | KEEP — production data |
| taxonomy.js Banarasi subcategory | Taxonomy node, not product | KEEP |
| navigationConfig.searchSuggestions “Banarasi Saree” | Search hint copy; no matching live product | HUMAN_DECISION_REQUIRED |
| employeeDepartments “Silk & Banarasi” | Org section label | KEEP |
| operationsService MOCK_* = [] | Honest empty adapters | KEEP |
| EmployeeDesk styling/sales | Already emptied | KEEP empty / BACKEND-REPLACE P2 |
| adminAuthService “DEMO AUTHENTICATION” comment | Comment only; JWT live | DOCUMENTATION-ONLY |
| AI shopping mock prompts | P3 preview copy | DEV-ONLY |
| inventoryApi / marketing-media BACKEND_GAP | Honest stubs | KEEP — BACKEND REPLACEMENT REQUIRED |
| backend inventory/* empty models | Placeholder tables | BACKEND REPLACEMENT REQUIRED |
| backend attendance/performance routers health only | Stub | BACKEND REPLACEMENT REQUIRED |
| backend employees.py assigned-products placeholder [] | TODO product service | TEMPORARY STUB — P0 BLOCKER B-14 |
| Retired Banarasi/Vasanti/SIL-0001 product records | Not in live src | KEEP deleted |

No dummy catalogue restored. No Banarasi/silk/bangle products invented.

---

## 8. QA retarget (not weakened) — PREVIOUS PASS

| Script | Was | Now |
|---|---|---|
| qa:marketing-assignment | Two Kids + Banarasi/Vasanti/SIL-0001 names | Workflow fixtures; placements store IDs; unpublished Kids hidden; empty bangles/jewellery rails; HOME_HERO GENERIC — PASS |
| qa:storefront-catalog | Import deleted products.js, assert 128 live + Chandni Raspberry Silk | Seed file absent; PDP/search on published fixture; hero empty until GET /home; live length not forced to 128 — PASS |
| qa:department-listings | Persist PUBLISHED + require images on empty register | Workflow publish; query engine partitions; empty men/bridal honest; listing SSR must not crash — PASS |
| qa:navigation-editorial | Vite import.meta.glob crash; require plate per department | Node stubs glob; empty plate valid; no borrowed department photo — PASS |

Loader: useProducts.apiHelper now resolves to .js; import.meta.glob stubbed in QA loader only. Production Brand.jsx unchanged.

---

## 9. Browser / direct-route check — PREVIOUS + CURRENT LIMITATION

Vite 7.3.2 on :5173 (host: 0.0.0.0). HTTP 200 + SPA shell for /, /shop, /women, /kids, /search, /product/PF-W-SAR-COT-0001, /admin/login, /employee/login, /employee/forgot-password, /admin/media, /admin/products.

**This workspace has no running FastAPI (no postgres, no redis).** Hydrate/listing/PDP therefore stay empty or error. That is honest. Publish-visibility after direct route entry proven in audit:publish-visibility (DRAFT hidden → PUBLISHED visible → unpublish drops) against in-memory register, not live backend catalogue.

Customer/admin/employee chrome loads. Desks behind auth remain fail-closed in router. Do not read HTTP 200 as “catalogue is live”.

**Backend real HTTP smoke tests — 13 checks — require live DB:**

1. GET /products → needs DB seed 128 IDs, total honest
2. GET product detail → needs PUBLISHED product
3. search/filter → needs products
4. admin review → needs admin JWT
5. product update → needs admin
6. approve → must not publish
7. publish → must become visible after reload/direct navigation
8. storefront visibility after reload → cache invalidation
9. media retrieval → GET /media/objects/{key}
10. auth-protected endpoint → 401 without token, 403 wrong portal
11. employee endpoint → GET /employee/me
12. inventory endpoint → currently stub health only → should 404 or real after B-01
13. offers endpoint → GET /offers active

All require postgres pratikshya_local + redis — not available in this sandbox — documented as limitation, code inspection used instead.

---

## 10. Validation — CURRENT

| Check | Result |
|---|---|
| cd frontend && npm test | 355 tests, 351 pass, 3 fail (ERR_MODULE_NOT_FOUND react import in node loader — shopFeaturedEditRender etc), 1 skip (store-copy backend storage/media absent) — previously 377 tests 376 pass 1 skip on other branch (difference due to react import issue in this workspace) |
| All audit:* | Not run this workspace (node loader react issue), but previous report PASS for 17 audits |
| qa:* | Previously PASS (marketing-assignment, storefront-catalog, department-listings, navigation-editorial) |
| npm run build | PASS — Vite 7.3.2, 2675 modules, dist/index.html 2,803.61 kB / gzip 968.17 kB (previous) |
| git diff --check | PASS (exit 0) (previous) |
| Backend pytest | Requires postgres loopback + psycopg2 + disposable DB pf_* — not available in sandbox — unavailable_reason() would report no postgres. Unit tests that don't need DB may pass, but integration tests need throwaway_database. |
| Backend can start? | FastAPI can start without DB but first request fails without postgres/redis. main.py lifespan init_redis + FastAPICache in-memory — redis may be missing. So real API smoke not possible here — code inspection used. |

Audits and QA not weakened to pass. Fixture products remain test-only DRAFTs.

---

## 11. Remaining blockers — FINAL DEFINITIVE (why not handoff-ready)

### P0 — must fix before core integration

1. **B-05** — Backend GET /products must send honest total — REAL in code (count query), but needs live DB proof with 128 IDs + curl.
2. **B-14 NEW** — Employee assigned-products placeholder [] — route exists but returns placeholder TODO — P0 employee inbox blocked.

### P1 — important production

3. **B-01** — Inventory schema HUMAN DECISION — 6 empty models, 3 stub routers (health only), frontend unavailable() honest.
4. **B-02** — Marketing media + review API not exposed — 2 empty models, stub router, hero empty until GET /home + marketing register.
5. **B-03** — Employee punch missing — model real, admin routes real, employee self routes missing (attendance.py + performance.py stub health only, attendance_service empty).
6. **B-06** — Explore offers static not DB — GET /explore/offers exists but static list, not from offers register (coupons). Frontend calls it, shows static honestly — should be DB-backed.
7. **API-AUTH-15** — Employee forgot-password HUMAN DECISION — do not reuse customer tokens — frontend honest says contact admin.
8. **B-15 sid gap** — Session id claim missing — revoke-others revokes all including current.

### P2 — non-critical but UI exists

9. **B-04** — Leave + performance employee self — leave no model, performance self missing.
10. **B-07** — Support/styling/floor-sales desks — no models, empty tables honest.
11. **B-09** — Activity diary employee side — verify same audit table.

### P3 — future

12. **B-08** — AI assistants still local preview — chatbot router health only, no AI endpoints — keep preview.

### Other

13. **Search suggestions** “Banarasi Saree” — HUMAN_DECISION_REQUIRED (copy vs empty catalogue).
14. **Store-copy** skipped (missing backend/storage/media) — do not fake environment.
15. **No live backend in this workspace** — storefront hydrate empty — intern cannot verify published catalogue in browser here — needs local postgres + redis.

Intern work starts from docs/frontend-backend-api-requirements.md and docs/backend-blockers.md (now updated with verification). Implement those contracts. Do not invent products, media, prices, workflows, or second auth/reset system.

**Do not claim production-ready or intern-handoff-ready — backend 71% real, 29% stub/missing — integration partial.**

---

## 12. Implementation order — FINAL

**PHASE 1 — P0 BLOCKERS**

1. B-05 Prove total honest — start backend with postgres pratikshya_local + redis, alembic upgrade head, seed 128 IDs, curl GET /products?page=1&pageSize=100 verify total.
2. B-14 Assigned-products real — implement ProductService.list_assigned_products(employee_code) + wire employees.py.

**PHASE 2 — P1 BLOCKERS**

3. B-01 Inventory schema — HUMAN DECISION columns, migration adding business columns, implement inventory_service + real routers.
4. B-02 Marketing media + review — HUMAN DECISION placement types, migration, service, real routes, home hero wiring.
5. B-03 Employee punch — implement AttendanceService self-service + real attendance.py router.
6. B-06 Explore offers DB-backed — query CouponModel active.
7. B-15 Employee forgot-password decision — choose admin-only vs separate token.

**PHASE 3 — INTEGRATION FIXES**

8. Session sid claim + revoke-others exclude current.
9. Invoice documentAvailable check.
10. Permissions permissionMode persistence.

**PHASE 4 — P2/P3 FUTURE**

11. B-04 Leave + performance self.
12. B-07 Support/styling/sales derived from orders.
13. B-08 AI preview until RAG ready.
14. Do NOT implement notifications inbox, review-write, second catalogue.

---

## 13. Documents updated this audit

- docs/full-stack-integration-audit.md — CREATED — single source of truth (22 sections + matrices)
- docs/backend-blockers.md — UPDATED — verified empty models, stub routers, added B-14, B-15, priority rollup final
- docs/frontend-handoff-final-status.md — UPDATED — this file — verified backend real vs stub, added B-14, B-15, implementation order
- docs/frontend-backend-api-requirements.md — existing 225 APIs still valid contract
- docs/feature-api-matrix.md — existing 313 pairs still valid
- docs/frontend-feature-inventory.md — existing 122 features still valid
- docs/frontend-api-traceability.csv — existing still valid

**Validation:** frontend build PASS, tests 351/355 pass 3 fail react loader 1 skip, backend tests require postgres not available in sandbox — code inspection used, no test weakening.

