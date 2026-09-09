# Frontend → backend handoff — final status

**Date:** 2026-09-09
**Verdict: NOT intern-handoff-ready.** UI, green QA, and a passing build are not a complete handoff. Remaining blockers are listed below. Do not treat this document as permission to invent APIs, products, media, or reset-token designs.

Canonical inventories (re-counted this pass, not forced equal):

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
| Live Node register without backend | 0 published (3 test-only DRAFT fixtures when audits seed) |

Disk folder counts are media inventory. They are **not** live product counts. Do not force 128 / 191 / 42 / 5 / 238 to equal the storefront register.

---

## 1. `GET /products` contract (API-PROD-01) — blocker B-05

**Required now. Client implemented. Backend must honour `total`.**

| | |
|---|---|
| Method / route | `GET /api/v1/products` |
| Auth | none |
| Consumers | F-CUS-HOME, F-CUS-SHOP, F-CUS-CATEGORY, F-CUS-KIDS; session hydrate in `catalogStore.fetchAllPublishedProducts` |
| Shop listing page size | 12 (`useCatalogueQuery`) |
| Hydrate page size | 100 (`CATALOG_HYDRATE_PAGE_SIZE`). Do not raise it as a fake “load everything”. Safety cap 50 pages. |

**Request query (client already sends):** `q`, `category`, `subcategory`, `gender`, `price`, `size`, `color`, `fabric`, `material`, `occasion`, `collection`, `rating`, `availability`, `sort` (default `recommended`), `page` (default 1), `pageSize` (hydrate 100, shop 12). Department pages map to existing filters (`women`→gender Women, `men`→category menswear, `bridal`→bridal-couture, `kids`→kidswear) because department is not a backend column.

**Response (mandatory):**

```json
{ "items": [Product], "total": 250, "page": 1, "pageSize": 100, "facets": {}, "appliedFilters": {} }
```

`items` may be aliased as `products`. **`total` is the full published count for the filter, never the length of this page.**

**Client honesty (this pass):**

- `normaliseProductList` no longer does `total ?? items.length`. Omitted `total` stays `undefined`.
- Hydrate walks until `items.length >= total` or a short last page.
- First-page or later-page `ok: false` → hydrate error (`partial: true` if later page). UI must not treat a truncated snapshot as the catalogue.
- Omitted `total` on a **full** page → hydrate `ok: false` (`GET /products omitted total`).
- Omitted `total` on a **short** page is treated as last page (the client saw the end).
- Hitting the 50-page cap before covering `total` → `ok: false`, `partial: true`.

**Errors:** 422 bad filter. Missing backend → empty/error UI, never a static seed.

**Do not:** omit `total`; invent a second hydrate endpoint; restore `src/data/catalog/products.js`.

---

## 2. P0 / P1 product APIs

Status key: **REQUIRED NOW** (P0 live surface) / **REQUIRED LATER** (P1 surface) / **IMPLEMENTED** (typed client) / **STUB** / **BACKEND GAP** / **MISSING** / **DUPLICATE** (do not add a second route) / **HUMAN DECISION**.

### Public

| ID | Method / route | Auth | Shape | Consumers | Class |
|---|---|---|---|---|---|
| API-PROD-01 | `GET /products` | none | `{items,total,page,pageSize}` | F-CUS-HOME, SHOP, CATEGORY, KIDS | REQUIRED NOW, IMPLEMENTED, BACKEND GAP if `total` omitted (B-05) |
| API-PROD-02 | `GET /products/{idOrSlug}` | none | Product; unpublished → 404 | F-CUS-PDP | REQUIRED NOW, IMPLEMENTED |
| API-PROD-03 | `GET /products/{id}/recommendations` | none | `{items}` | F-CUS-PDP, F-CUS-RECS | REQUIRED LATER (P1), IMPLEMENTED |
| API-PROD-04 | `GET /collections/{id}/products` | none | `{items,total}` | F-CUS-COLLECTION | REQUIRED NOW, IMPLEMENTED. Not a second catalogue. |
| API-PROD-07 | `POST /products/{id}/submit-review` | admin\|employee | `{product}` | F-ADM-PRODUCT-WORKFLOW, F-EMP-PRODUCT-EDIT | REQUIRED NOW, IMPLEMENTED. Workflow submit, not star-reviews. |

P2 recently-viewed (API-PROD-05/06) exists as clients; not P0/P1.

### Admin

| ID | Method / route | Auth | Notes | Class |
|---|---|---|---|---|
| API-APROD-01 | `GET /admin/products` | admin | `{items,total,page}` full filtered count | REQUIRED NOW, IMPLEMENTED |
| API-APROD-02 | `POST /admin/products` | admin | create | REQUIRED NOW, IMPLEMENTED |
| API-APROD-03 | `POST /admin/products/draft` | admin | always DRAFT | REQUIRED NOW, IMPLEMENTED |
| API-APROD-04 | `GET /admin/products/next-id` | admin | `PF-*` family, not clocks | REQUIRED NOW, IMPLEMENTED |
| API-APROD-05 | `GET /admin/products/availability` | admin | SKU/slug probe | REQUIRED LATER (P1), IMPLEMENTED |
| API-APROD-06 | `GET /admin/products/metrics` | admin | status counts | REQUIRED LATER (P1), IMPLEMENTED |
| API-APROD-07 | `GET /admin/products/{id}` | admin | unpublished allowed | REQUIRED NOW, IMPLEMENTED |
| API-APROD-08 | `PATCH /admin/products/{id}` | admin | no lifecycle keys | REQUIRED NOW, IMPLEMENTED |
| API-APROD-09 | `POST /admin/products/{id}/assign` | admin | `{employeeId}` | REQUIRED LATER (P1), IMPLEMENTED |
| API-APROD-10 | `POST /admin/products/{id}/approve` | admin | **MUST NOT publish** | REQUIRED NOW, IMPLEMENTED |
| API-APROD-11 | `POST /admin/products/{id}/reject` | admin | `{reason}` | REQUIRED NOW, IMPLEMENTED |
| API-APROD-12 | `POST /admin/products/{id}/publish` | admin | APPROVED only + full validation | REQUIRED NOW, IMPLEMENTED |
| API-APROD-13 | `POST /admin/products/{id}/unpublish` | admin | storefront drops | REQUIRED NOW, IMPLEMENTED |
| API-APROD-14 | `POST /admin/products/{id}/archive` | admin | soft | REQUIRED NOW, IMPLEMENTED |
| API-APROD-15 | `POST /admin/products/{id}/restore` | admin | → DRAFT | REQUIRED NOW, IMPLEMENTED |
| API-APROD-16 | `GET /admin/products/{id}/publish-issues` | admin | same checks as publish | REQUIRED NOW, IMPLEMENTED |
| API-APROD-17 | `POST /admin/products/{id}/change-id` | admin | same family; media moves | REQUIRED LATER (P1), IMPLEMENTED, HUMAN DECISION if ID migration |
| API-APROD-18 | `POST /admin/products/{id}/duplicate` | admin | new ID, DRAFT, media stays | REQUIRED LATER (P1), IMPLEMENTED |
| API-APROD-19 | `POST /admin/products/bulk` | admin | per-id same rules | REQUIRED LATER (P1), IMPLEMENTED |
| API-APROD-20 | `POST /admin/products/{id}/review-flags/clear` | admin | | REQUIRED LATER (P1), IMPLEMENTED |

### Employee

| ID | Method / route | Auth | Class |
|---|---|---|---|
| API-EPROD-01 | `GET /employee/products/{id}` | employee | REQUIRED NOW, IMPLEMENTED |
| API-EPROD-02 | `PATCH /employee/products/{id}` | employee | REQUIRED NOW, IMPLEMENTED (editable fields only) |
| API-EPROD-03 | `GET /employee/me/assigned-products` | employee | REQUIRED NOW, IMPLEMENTED |

**Do not** add a second product list, kids micro-app, or filename→ID allocator. APPROVE ≠ PUBLISH.

---

## 3. Finalized gap contracts (no invented schema)

### Inventory (B-01) — STUB + HUMAN DECISION

Frontend `inventoryApi.js` returns `{ ok: false }` (`unavailable`). Paths already named:

- `GET /admin/inventory/stock` `{items:[{productId,variantId,sku,onHand,reserved,available}]}`
- `GET /admin/inventory/stock/{id}`
- `POST /admin/inventory/adjust` `{sku|variantId,delta,reason}`
- `GET /admin/inventory/movements|low-stock|reservations|transfers`
- `GET/POST /admin/warehouses`
- transfer create/complete

**Do not** invent columns. **Do not** treat `products.stock` as a second ledger. Cart/order stock checks stay server-side until the ledger matches. HUMAN DECISION: exact table columns.

### Marketing media (B-02) — STUB `BACKEND_GAP`

- `GET /admin/marketing-media` — hero/editorial/promotion plates. Distinct from product media.
- `GET /admin/media-reviews` + approve/reject — assignment review, does not publish a product.

HOME_HERO is GENERIC. Product placements store Product IDs only. Registering product media must never promote it to a marketing slot. **No S3 work in this frontend pass.**

### Employee punch (B-03) — MISSING client, fail-closed UI

Needed because EmployeeAttendance exists:

- `POST /employee/attendance/check-in`
- `POST /employee/attendance/check-out`
- `GET /employee/attendance/today`
- `GET /employee/attendance`

Admin attendance clients already exist. Do not write punches to localStorage.

### Employee forgot-password (API-AUTH-15) — MISSING + HUMAN DECISION

`EmployeeForgotPassword.jsx` is honest: it tells the employee to contact an administrator and **sends no email**. There is no function in `authApi.js`.

- Do **not** reuse customer reset tokens (`POST /auth/customer/forgot-password`).
- Do **not** invent a token schema in this pass.
- HUMAN DECISION: employee recovery vs admin-issued reset (`API-EMP-06`) only.

---

## 4. Frontend security

| Check | Result |
|---|---|
| Hardcoded passwords / API keys in `frontend/src` | None found |
| Customer tokens | `pf_access_token` / `pf_refresh_token` |
| Admin tokens | `pf_admin_access_token` / `pf_admin_refresh_token` |
| Employee tokens | `pf_employee_access_token` / `pf_employee_refresh_token` |
| Scope | Every `apiClient` call requires `customer` \| `admin` \| `employee` \| `none`. Unscoped calls throw. |
| Refresh | Isolated per scope. 401 refresh failure clears **that** scope only. |
| Portal routes | Admin/employee gates remain fail-closed (login required). Direct `/admin/media` and `/admin/products` still return the SPA shell; the router must not render desks without a session. |
| Docs | No `.env` secrets copied. If seen: `SECRET FOUND — VALUE REDACTED`. |

Wrong-portal JWT must 403 on the backend. Frontend isolation is necessary but not sufficient.

---

## 5. Media / product integrity

- One Product ID = one product. Front/side/back are views, not extra products.
- Kids is a department (`PF-K-*`) inside the unified workflow. Not a side catalogue. One canonical Kids fixture in tests (`PF-K-GRL-DRS-0001`). A second kids product was **not** invented.
- Product media ≠ marketing media. Hero is GENERIC (`GET /home`). Empty hero when uncurated is honest.
- `public/images` left in place (238 / 191 / 128 / 5 / 42). No physical delete or copy this phase.
- `backend/storage/media` is absent → store-copy test stays skipped.
- Unpublished products are absent from `getLiveStorefrontProducts` and from marketing rails.

---

## 6. Feature → API matrix

Full matrix: `docs/feature-api-matrix.md` (313 pairs). Feature list: `docs/frontend-feature-inventory.md`. API list: `docs/frontend-backend-api-requirements.md`.

Every P0/P1 product API in §2 traces to a current `F-*` row. Unused / dead / placeholder screens were not counted as features. Do not add duplicate endpoints.

---

## 7. Dummy-data search (this pass)

| Location | What | Class |
|---|---|---|
| `src/data/catalog/products.js` | Deleted static seed | KEEP deleted (do not restore) |
| `workflowTestState.js` 3 DRAFT fixtures | Test/audit/QA only | TEST-ONLY |
| `public/images/**` | Canonical media | KEEP |
| `taxonomy.js` Banarasi subcategory | Taxonomy node, not a product | KEEP |
| `navigationConfig.searchSuggestions` “Banarasi Saree” | Search hint copy; no matching live product | HUMAN_DECISION_REQUIRED |
| `employeeDepartments` “Silk & Banarasi” | Org section label | KEEP |
| `operationsService` `MOCK_* = []` | Honest empty adapters | KEEP |
| EmployeeDesk styling/sales | Already emptied | KEEP empty / BACKEND-REPLACE later (P2) |
| `adminAuthService` “DEMO AUTHENTICATION” comment | Comment only; JWT is live | DOCUMENTATION-ONLY |
| AI shopping mock prompts | P3 preview copy | DEV-ONLY / keep preview until API-AI-* |
| `inventoryApi` / marketing-media `BACKEND_GAP` | Honest stubs | KEEP |
| Retired Banarasi/Vasanti/SIL-0001 product **records** | Not in live src | KEEP deleted |

No dummy catalogue was restored. No Banarasi/silk/bangle **products** were invented.

---

## 8. QA retarget (not weakened)

| Script | Was | Now |
|---|---|---|
| `qa:marketing-assignment` | Two Kids + Banarasi/Vasanti/SIL-0001 names | Workflow fixtures; placements store IDs; unpublished Kids hidden; empty bangles/jewellery rails; HOME_HERO GENERIC |
| `qa:storefront-catalog` | Import deleted `products.js`, assert 128 live + Chandni Raspberry Silk | Seed file absent; PDP/search on published fixture; hero empty until `GET /home`; live length not forced to 128 |
| `qa:department-listings` | Persist PUBLISHED + require images on empty register | Workflow publish; query engine partitions; empty men/bridal honest; listing SSR must not crash |
| `qa:navigation-editorial` | Vite `import.meta.glob` crash; require a plate per department | Node stubs glob; empty plate valid; no borrowed department photo |

Loader: `useProducts.apiHelper` now resolves to `.js`; `import.meta.glob` stubbed **in the QA loader only**. Production `Brand.jsx` unchanged.

---

## 9. Browser / direct-route check

Vite 7.3.2 on `:5173` (`host: 0.0.0.0`). HTTP 200 + SPA shell for `/`, `/shop`, `/women`, `/kids`, `/search`, `/product/PF-W-SAR-COT-0001`, `/admin/login`, `/employee/login`, `/employee/forgot-password`, `/admin/media`, `/admin/products`.

**This workspace has no running FastAPI.** Hydrate/listing/PDP therefore stay empty or error. That is honest. Publish-visibility after direct route entry is proven in `audit:publish-visibility` (DRAFT hidden → PUBLISHED visible → unpublish drops) against the in-memory register, **not** against a live backend catalogue.

Customer/admin/employee chrome loads. Desks behind auth remain fail-closed in the router. Do not read HTTP 200 as “catalogue is live”.

---

## 10. Validation (this pass)

| Check | Result |
|---|---|
| `cd frontend && npm test` | **377 tests, 376 pass, 0 fail, 1 skip** (`phase6LocalMediaFlow` store-copy — `backend/storage/media` absent; left skipped) |
| All `audit:*` | **PASS** |
| `qa:marketing-assignment` | **PASS** |
| `qa:storefront-catalog` | **PASS** |
| `qa:department-listings` | **PASS** |
| `qa:navigation-editorial` | **PASS** |
| `npm run build` | **PASS** — Vite 7.3.2, 2675 modules, `dist/index.html` 2,803.61 kB / gzip 968.17 kB |
| `git diff --check` | **PASS** (exit 0) |

Audits and QA were not weakened to pass. Fixture products remain test-only DRAFTs.

---

## 11. Remaining blockers (why this is not handoff-ready)

1. **B-05** — Backend `GET /products` must send honest `total`. Client no longer fabricates it.
2. **No live backend in this workspace** — storefront hydrate is empty. Intern cannot verify published catalogue in the browser here.
3. **B-01** — Inventory schema HUMAN DECISION. Stubs stay.
4. **B-02** — Marketing media API not exposed. Hero stays empty until `GET /home` + marketing register.
5. **B-03** — Employee punch missing. Fail-closed.
6. **API-AUTH-15** — Employee forgot-password HUMAN DECISION. Do not reuse customer tokens.
7. **B-06** — Explore offers still reads `getExploreOffers()` while `GET /explore/offers` exists.
8. **Search suggestions** “Banarasi Saree” — HUMAN_DECISION_REQUIRED (copy vs empty catalogue).
9. **Store-copy** skipped (missing `backend/storage/media`). Do not fake the environment.
10. **P2/P3** desks (support/styling/sales/AI) remain empty/preview.

Intern work starts from `docs/frontend-backend-api-requirements.md` and `docs/backend-blockers.md`. Implement those contracts. Do not invent products, media, prices, workflows, or a second auth/reset system.

**Do not claim production-ready or intern-handoff-ready.**
