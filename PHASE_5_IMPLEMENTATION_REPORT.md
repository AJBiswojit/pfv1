# PHASE 5 — Admin Product & Catalogue Management, Backend-Integrated and Authoritative

Repository: `AJBiswojit/pfv1` (branch `arena/01a04080-pfv1`)
Date: 2026-08-27
Scope: admin Products, Categories, Subcategories, Collections, Offers/Coupons — backend-integrated, server-authoritative, RBAC-enforced, mock-free.

---

## 1. Scope

**In scope (implemented):**
- Admin product CRUD (create, partial update via PATCH semantics, duplicate), publish/unpublish, archive/restore, review actions (approve/return/flag-clear), search + status/category filters + sort + pagination — all server-backed.
- Product ↔ category/subcategory relationships written as backend IDs.
- Category, subcategory and collection CRUD through the taxonomy admin APIs; collection ↔ product membership via the assign endpoint.
- Offer/coupon management: admin list (search, derived status, pagination, server aggregate counts), create/edit (backend columns only), activate/pause/archive; customer-side validation untouched but now passed real cart context.
- Admin RBAC enforcement through the Phase 1 permission helpers (`require_admin_permission`, department mapping preserved application-level; token scope isolation customer/admin/employee untouched).
- Response normalization in ONE API layer per domain (`productsApi.normalizeProduct`, `offersApi.normaliseOffer`, `categoriesApi/collectionsApi` normalizers) and a single admin error mapper (`formatAdminError`).
- Removal of runtime admin catalogue mocks/fallbacks (the offer desk no longer reads the explore strip; the taxonomy desks no longer read a localStorage register; product desks no longer trust local workflow commands for admin).

**Out of scope (untouched by design):** checkout pricing, Phase 2 coupon validation logic, order/payment/customer/wishlist/employee/analytics domains, media upload/S3/CDN, inventory/warehouse redesign, Redis/Celery/Docker, **all database schema/migrations** (none exist in this phase), storefront product data (public read contracts unchanged; `frontend/public/images` byte-identical).

---

## 2. Existing Admin Catalogue Architecture (before Phase 5)

- **Products:** admin desks (list/detail/editor/review) mutated a localStorage-backed `catalogRepository` through a synchronous local state machine (`productWorkflowCommands`). The backend had a usable product API but the admin UI did not page, filter or sort on the server, and lifecycle changes were applied locally first.
- **Taxonomy:** `taxonomyRepository` had already been reduced to a facade over the server-backed `catalogStore` (public cache holds ACTIVE rows only); mutation endpoints existed but the DRAFT/ARCHIVED admin lists were not consumed, and several desk pages still called the async facade without awaiting.
- **Offers:** the admin offer desk rendered from an in-browser register hydrated from `/explore/offers` (a static marketing strip), fabricated metric tiles, had non-awaited actions, called hook helpers that referenced missing imports (`useOffer → apiAdminGetOffer` was not imported in `hooks/useOffers.js`), and its form collected fields the coupon table cannot store (priority, max-discount cap, draft/paused statuses).
- **Error handling:** `ApiError` status/payload were dropped by several domain API layers, so desks could not distinguish 403/404/409/422 from a generic failure.

---

## 3. Product CRUD

Server contract: `GET /admin/products` (q, status, category, subcategory, sort, page, pageSize), `POST /admin/products`, `GET/PATCH /admin/products/{id}`, `POST /admin/products/{id}/duplicate`, `POST /admin/products/bulk` (fields only — status keys refused with 409), availability check, change-id. Create persists the whole editable draft; update is `exclude_unset` partial-safe. NOT-NULL columns are sanitized server-side (no `None` writes for name/slug/sku/price/…).

Frontend: `productAdminService.fetchAdminProducts/fetchAdminProduct` upsert server records into the shared register (`upsertServerProducts`) so subscribing views reconcile from server truth; `saveAdminProduct` falls back to draft-only behavior only where the UI is pre-create; `buildAdminProductPayload` is the **single** write normalizer (camelCase UI → snake_case request, arrays as IDs, no invented columns).

| File | Function / change | Old | New | Why | Endpoint | Test |
|---|---|---|---|---|---|---|
| backend/app/services/catalog/product_service.py | admin list/get/create/update/duplicate/bulk | partial endpoints | full paging/search/sort incl. subcategory; PATCH `exclude_unset`; `_sanitize_for_create/_update` | server authority + NOT-NULL integrity | /admin/products* | test_phase5_admin_catalogue.py (products) |
| backend/app/api/v1/products.py | 21 admin routes | mixed auth | every route RBAC'd via Phase 1 helpers | security | all | phase5 suite |
| backend/app/schemas/catalog/product.py | ProductListResponse | no paging meta | `page`, `pageSize` (+ counts DTOs) | desks paginate honestly | GET /admin/products | phase5 suite |
| frontend/src/services/api/productsApi.js | `handleError`, `apiAdminListProducts`, `buildAdminProductPayload` | status lost; client-side filtering; ad-hoc payloads | `{ok:false, status, data}`; server params; ONE payload builder | honest errors; no fake filters | admin product routes | npm test (143 pass incl. existing suites) |
| frontend/src/services/catalogRepository.js | `upsertServerProducts`, `syncProductToBackend`, `getLastSyncError` | local register authority | server records merged over cache; sync goes through the builder | stale-snapshot avoidance | — | existing + phase5 tests |
| frontend/src/services/admin/productAdminService.js | NEW whole file (fetch/save/actions/bulk/persist) | — | fetches upsert cache; `runAction` → endpoint → `withUpsert`; `saveAdminProduct` 404 → draft fallback | single admin orchestration layer | all admin product routes | exercised by desk flows |
| frontend/src/services/admin/adminError.js | NEW `formatAdminError`, `collectErrorDetails` | — | distinct copy per 0/401/403/404/409/422/5xx; tolerant of both error shapes | "no generic failure" rule | — | tests/phase5OffersTaxonomy.test.js |
| frontend/src/pages/admin/AdminProducts.jsx | desk | local filter/sort | debounced server `q`; status/category/sort/page server-side; 7 server-count tiles; awaited actions + reload + metrics refresh | server-backed list | GET/POST admin products | build + suite |
| frontend/src/components/products/ProductEditor.jsx | admin persist/lifecycle | sync commands | awaited `persistAdminProduct` + refetch re-baseline; server publish-issues; variants panel annotated BACKEND_GAP | no optimistic success | admin product routes | build |
| frontend/src/pages/admin/AdminProductDetail.jsx | actions & fetch states | `run(() => publishProduct(...))` sync; "Product unavailable" for everything | awaited `runAction`; distinct loading / 404 / unreachable states; publish blockers from `GET /admin/products/{id}/publish-issues`; refresh after mutation | server truth + honest states | publish/unpublish/archive/restore/approve/duplicate/publish-issues | build + syntax |
| frontend/src/components/admin/ProductReviewDetail.jsx | approve/return/publish/submit/archive/assign | local commands via `productWorkflow` | `runServerAction` (approve/reject{reason}/publish/submitReview/archive/assign{employeeId}) | one canonical backend path for review actions | review + lifecycle routes | build |
| frontend/src/components/admin/ProductDraftReviewPanel.jsx | save + lifecycle + flag clearing | `saveProductDraft` + `clearReviewFlags` local | `persistAdminProduct` (PATCH) + `runServerAction('clearFlags')` + awaited lifecycle | server-first editing | admin products PATCH, review-flags/clear | build |
| frontend/src/components/admin/MediaInboxCard.jsx | `assignTo` | sync `assignProductToEmployee` | awaited server `assign` | awaited mutation | POST assign | build |

---

## 4. Product Visibility

- **Publish** is the only path to `PUBLISHED` and requires `review.state = APPROVED` **and** a clean server-side `get_publish_issues()` list; ARCHIVED products are rejected; republish is idempotent. **Unpublish** requires the product to be PUBLISHED and returns it to draft state. The frontend never flips a local `isLive`-style flag — visibility is exactly the server's `status` field (`normalizeProduct` passes it through; no invented fields).
- The publish blockers panel on the detail desk is fetched live from `GET /admin/products/{id}/publish-issues` (`{issues: string[]}`) — the same gate the publish endpoint enforces — with an explicit "checks are being fetched" state while loading.
- Storefront visibility follows immediately because every catalogue write calls `invalidate_response_cache()` (`backend/app/core/cache.py`), clearing the fastapi-cache response layer the public reads use. No Redis was introduced; the in-memory clear is documented as the single-process behavior.

| File | Change | Why | Endpoint | Test |
|---|---|---|---|---|
| backend/app/services/catalog/product_service.py | publish/unpublish gates, `get_publish_issues` | single gated path | /publish, /unpublish, /publish-issues | phase5 suite (visibility group) |
| backend/app/core/cache.py | `invalidate_response_cache()` (best-effort, never fails a write) | storefront freshness without new infra | all write paths | phase5 suite (cache test) |
| frontend AdminProductDetail / ProductEditor | visibility actions awaited server-first | no optimistic live-ness | idem | build |

---

## 5. Product Pricing & Stock Boundaries

- Money fields (price, compareAt, mrp) are persisted through `buildAdminProductPayload` and **derived server-side** for pricing blocks (`product_service` derives pricing structure and records `price_history` on change); the frontend never computes a stored "final price".
- Stock edits go to the stock endpoints the backend exposes; `stock`, `availability` and `low_stock_threshold` are the only stock columns the table has. The admin desks do **not** write to the local inventory ledger for catalogue truth (the `ensureOpeningStock` call after a server-confirmed publish is a local convenience register only, preserved from Phase 3 and documented in §17).
- Checkout/order pricing code was not touched (hard constraint).

| File | Change | Why | Endpoint |
|---|---|---|---|
| backend/app/services/catalog/product_service.py | server-side pricing derivation + price_history; sanitize NOT-NULL money fields | integrity without schema change | create/update |
| frontend/src/services/api/productsApi.js `buildAdminProductPayload` | numeric coercion, only real columns | no fake fields persisted | admin products |

---

## 6. Categories

- Backend: `GET/POST /admin/categories`, `GET/PATCH /admin/categories/{id}`, `POST /admin/categories/{id}/archive|restore` (restore copy enforces the "activate blocked while…" 409 rules), all under `categories.view/manage`. Admin list includes DRAFT/ARCHIVED rows with server-computed `productCount` (live) and `productCountTotal` (all statuses).
- Frontend: the category desk now lists **from `GET /admin/categories`** (so drafts/archived rows are visible and tiles are server counts, not snapshot counts); create/edit/detail forms await the async `taxonomyRepository` facade (which calls the API then `refreshCatalog()`); failures render through `formatAdminError`; the "cannot permanently delete with products, archived instead" copy matches the real backend behavior (no product-DELETE route exists — see §17).

| File | Function | Old | New | Why | Endpoint | Test |
|---|---|---|---|---|---|---|
| backend/app/api/v1/categories.py + category_service.py | admin list/get/create/update/archive/restore | public-only reads | RBAC'd admin set with product counts | server truth for the desk | /admin/categories* | phase5 suite (taxonomy group) |
| frontend/src/services/api/categoriesApi.js | `apiAdminListCategories` NEW; `handleError` now carries `status`/`data`; `normCategory` keeps `productCountTotal` | no admin list; status lost | as stated | tiles/rows from server; distinct errors | GET /admin/categories | build + phase5 taxonomy test (error mapper) |
| frontend/src/pages/admin/taxonomy/AdminCategories.jsx | rows, tiles, toggle | snapshot metrics; un-awaited toggle (Promise treated as result) | server rows + metrics tiles (`/admin/products/metrics` `total`/`unassigned`); awaited archive/restore with reload; loading/empty/error/retry states | correctness + honest states | idem | build |
| frontend/src/pages/admin/taxonomy/AdminCategoryDetail.jsx / AdminCategoryForm.jsx | sub/toggle/save | sync assumptions | awaited + `formatAdminError`; save busy state | no optimistic success | /admin/categories*, subcategories | build |

## 7. Subcategories

- Backend: nested under categories — `GET /admin/categories/{id}/subcategories`, `POST`, `PATCH /admin/subcategories/{id}`, `POST /admin/subcategories/{id}/archive|restore`. Category pages carry them; product assignment is by subcategory ID (see §9).
- Frontend: the category detail desk's create/restore/archive sub-actions are awaited server calls; the desk's per-row "Active subs" column is explicitly labelled as the storefront-cache count (ACTIVE subset) rather than pretending to be the full admin count (a bulk admin subcategory count endpoint does not exist — §17).

## 8. Collections

- Backend: 11 admin routes (list w/ q+status, get any-status, create, PATCH, activate, pause, archive (SUPER_ADMIN), restore, assign-products, plus storefront endpoints untouched), cache invalidation on write.
- Frontend: `AdminCollections` lists `GET /admin/collections` (all statuses; server `resolvedProductCount` per row) with server-derived tiles, awaited archive (403 from non-super admins surfaces verbatim), loading/empty/error+retry states. `AdminCollectionDetail` fetches the record itself via `GET /admin/collections/{id}` so DRAFT/ARCHIVED collections open instead of falsely showing "unavailable"; activate/pause/archive and add/remove products are all awaited; membership helpers (`addProductsToCollection`, `removeProductsFromCollection`) **re-read the server copy before the replacing PUT** — no stale-snapshot overwrite (documented in the repository code).

| File | Change | Why | Endpoint |
|---|---|---|---|
| frontend/src/services/taxonomyRepository.js | `add/removeProductsToCollection` fresh-read first; `productCounts.byCollection` + richer `metrics()` | PUT-replace safety; no fabricated tile | /admin/collections/{id}/products |
| frontend/src/services/api/collectionsApi.js | status/data on errors | distinct admin copy | all |
| backend/app/api/v1/collections.py + collection_service.py | admin routes + RBAC + invalidation | server authority | /admin/collections* — phase5 suite (collections group) |

## 9. Collection–Product Relationships

Relationships are **ID-based both ways**: products carry `collection_ids` (rule-based collections resolve server-side), and MANUAL collections carry `explicit_product_ids`; the assign endpoint *replaces* the explicit list and the UI only sends server IDs (the picker reads the server-fed catalogue cache). The detail desk's selection grid shows server `resolvedProductCount` per collection. No local mirror of a membership is ever presented as saved before the endpoint answers. (Product→category/subcategory ID assignment is covered in §3/§6: the editor writes `categoryId`/`subcategory` as backend IDs through the payload builder.)

## 10. Offers & Coupons

- **Backend admin contract (extended this phase, Phase 2 validation logic untouched):** `GET /admin/offers?q&status&page&pageSize` returns `{ok, offers[], total, page, pageSize, counts, lifetimeRedemptions}` where `counts = {total, ACTIVE, SCHEDULED, EXPIRED, ARCHIVED}` are computed over the **q-filtered set before status paging** and `lifetimeRedemptions` sums `usage_count`; `display_status` is derived (no `paused` column exists — §17); create/PATCH with `exclude_unset` partial-safety; `POST /activate|/pause|/archive`; codes uppercase; `created_by` only (no `updated_by` column exists — never written). `GET /offers` (public) and `POST /offers/validate` unchanged in logic.
- **`services/api/offersApi.js` is the ONE offers layer:** `normaliseOffer` exposes backend fields plus legacy UI aliases (`type`, `startDate/endDate`, `stackable`, `includedProducts/Categories/Collections`) and **derives display-only eligibility modes** (SPECIFIC_PRODUCTS/CATEGORY/COLLECTION from which ID lists are populated; SPECIFIC_CUSTOMERS iff `eligible_customer_ids`). `buildOfferPayload(form, {forUpdate})` emits **only columns the coupon table has**, key-present-conditional: a PATCH never clobbers untouched fields; create omits absent fields so backend defaults apply; `code` re-sent on PATCH only with `codeForUpdate`; `is_active` only when an explicit boolean (activation is a dedicated endpoint, not a form side effect). `apiValidateOfferCode` passes `{code, cart_items, customer_id, customer_email}` and propagates `ok:false` envelope errors.
- **Admin desk:** `AdminOffers.jsx` is now fully server-driven — debounced `q`, derived-status filter, page/pageSize, tiles from the server `counts` (no fabricated "scheduled/usage-today" numbers; "Paused / archived" shares one stored flag), awaited activate/pause with reload, distinct loading/empty/error(+retry) states. The Type/Category/Collection/Usage/From-To filters were **removed** rather than client-side approximated (unsupported server-side — §17). `useOffers/useOffer` rewired: admin/employee sessions fetch via `apiAdminListOffers/apiAdminGetOffer` (the previously missing `apiAdminGetOffer` import bug is fixed); `useOffer` returns `{offer, loading, error}` so 404 ≠ "not in this browser". `AdminOfferDetail` awaits `offerRepository.activate/pause/archive` and explains the pause≡archive column reality. `OfferForm` saves through the payload builder, picks scope from the server-fed catalog stores (the old `offerRepository.categories.map` crash is gone), shows the removal notes for cap/priority/status, and disables while saving. `AdminOfferFormPage` + the two employee offer pages were adapted to the new hook envelope.
- **Storefront/cache:** `catalogStore` hydrates `state.offers` from real `GET /offers` with `state.offersError` on failure (the explore-strip source was removed). `CartContext` guest `applyCoupon` now sends the actual cart lines to the validation gate — previously an empty `cart_items` made minimum-order rules false-reject valid coupons. Authenticated coupon application is unchanged (Phase 2 cart endpoints remain the only writer).

| File | Change | Why | Endpoint | Test |
|---|---|---|---|---|
| backend/app/api/v1/coupons.py | admin list envelope (counts, lifetimeRedemptions), partial PATCH, activate/pause/archive, display_status | server-truth register + tiles | /admin/offers* | phase5 suite (offers group) + compile |
| frontend offersApi.js | rewrite (normalise/aliases/payload/validation pass-through) | one normalizer, partial-safe writes | all offer routes | tests/phase5OffersTaxonomy.test.js (9 offer tests) |
| frontend offerRepository.js | `toApiScopeFields` | eligibility-mode → exact ID columns; non-columns dropped | idem | same |
| AdminOffers / AdminOfferDetail / OfferForm / AdminOfferFormPage / hooks/useOffers | server desks (see above) | awaited, honest, no mocks | idem | build + npm test |
| frontend/src/context/CartContext.jsx | guest validate carries `lineTotal`s | no false min-order rejections | POST /offers/validate | manual flow + test of pass-through shape |
| catalogStore.js | offers from `/offers`, `offersError` | no static-strip fallback | GET /offers | phase5 test (hydration error state) |

## 11. Admin RBAC

No second permission system was created. Every admin catalogue route added or retained this phase calls the Phase 1 `require_admin_permission(current_user, db, "<capability>")` on top of `get_current_admin`/`get_current_employee` (products: `products.view/manage` split for read vs write; categories: `categories.view/manage`; collections: `collections.view/edit/assign`, archive SUPER_ADMIN-only; offers: coupon manage scope). The Phase 1 **department mapping stays application-level** (no department column added or used). Token scope isolation is preserved end-to-end: admin calls pass `{scope: "admin"}` to `apiClient` (customer/employee tokens never mix), and the API error envelope's 401/403 are surfaced distinctly by `formatAdminError`. Frontend permission gating (`AdminRoute`/scope checks) remains exactly as in Phase 1/4 — the backend is the authority.

## 12. API Normalization

One normalizer per domain, one direction each way:
- Reads: `normalizeProduct` (productsApi), `normaliseOffer` (offersApi), `normCategory/normSubcategory` (categoriesApi), `normCollection` (collectionsApi) — snake_case DTOs → the camelCase UI model, **preserving all server fields** (`...raw`/`...p` spread so future columns flow through) plus compatibility aliases where an existing UI contract required them.
- Writes: `buildAdminProductPayload` and `buildOfferPayload` — the only two payload builders for admin catalogue writes; both are "present-only" for PATCH so omitted keys never reset server data, and both drop any field without a column (documented instead of invented).
- Errors: every domain `handleError` returns `{ok:false, error, status, data}` so the single `formatAdminError` mapper renders 401/403/404/409/422/5xx/network distinctly everywhere in the admin surface.

## 13. Mock / Fallback Removal

Runtime admin catalogue mocks removed this phase (each only where a real backend replacement exists):
- Offers desk source `/explore/offers` static strip → real `GET /admin/offers` / `GET /offers` (catalogStore).
- `catalogRepository` admin-sync fallback to local-only save → server-first with explicit `getLastSyncError` reporting.
- `hooks/useOffers` seed-register path → server fetch for admin/employee sessions; guest path stays the hydrated public cache (server-derived).
- Admin lifecycle mutations (publish/archive/etc.) applied through local `productWorkflowCommands` in admin surfaces → awaited endpoints; **the sync command engine itself remains** for the employee portal flow and for tests (documented, §17).
- Test fixtures with mock data were kept (they are test-only).

## 14. Storefront Compatibility

- Public read contracts (`/products`, `/categories/*`, `/collections/*`, `/explore`, `/offers`) are unchanged in shape; `normalizeProduct`/`toStorefrontProduct` continue to serve the existing UI. Server-derived `display_status`/`status` pass through unchanged.
- Guest and authenticated cart/coupon flows keep the Phase 2/4 rules: server cart owns totals, guest keeps only a valid code, checkout still validates through the single untouched `POST /offers/validate` gate. The only behavior change visible to customers is a bug-fix: guest coupon validation now sees the real basket.
- Product detail/preview continue reading the shared cache that is now reconciled from server responses — stale-snapshot windows are shorter, never longer.

## 15. Tests & Verification

| Gate | Result |
|---|---|
| `python -m compileall backend/app` | ✅ COMPILE_OK |
| `PYTHONPATH=backend /tmp/pfv1-venv/bin/python -m unittest discover -s backend/tests/unit -p 'test*.py'` | ✅ **155/155** (incl. the new 54-test Phase 5 admin-catalogue suite covering products 1–9, taxonomy 10–15, collections 16–19, offers 20–24, security 25–28) |
| `frontend: npm test` (node --test) | ✅ **143/143** incl. new `tests/phase5OffersTaxonomy.test.js` (payload partial-safety, aliasing, admin envelope, cart-context pass-through, error mapping, offers hydration failure) |
| `frontend: npm run build` | ✅ (vite, 2671 modules) |
| `git diff --check` | ✅ clean |
| Images safety | ✅ `frontend/public/images` = **238 files**, `git diff HEAD --exit-code -- frontend/public/images` reports zero content differences (byte-identical to HEAD) |
| Full-diff scope review | ✅ 39 modified files + 1 new backend test + 1 new frontend test; no files outside admin catalogue/offer/taxonomy scope, its API layers, and the one-line-class CartContext fix (the single-line CartContext guest-validation fix is the only non-admin file touched and is covered above) |
| Regression (Phases 1–4 suites) | ✅ green in the 155/155 + 143/143 runs above (all prior suites retained) |

## 16. Remaining Limitations

1. Coupon "paused" and "archived" share the single `is_active` flag (no column to distinguish them).
2. No per-offer `maximum_discount` cap, `priority`, `auto_apply`, `draft` status, or `updated_by` — the table has none; the form no longer offers them.
3. `GET /admin/offers` supports `q` + derived `status` + paging only; type/category/collection/per-day-usage/date-window server filters do not exist (desk controls removed rather than faked).
4. Admin offer visibility into usage is lifetime `usage_count` + `lifetimeRedemptions` only — no per-order redemption listing endpoint.
5. No hard-delete route for products (or categories with dependents): archive is the deletion; the lifecycle panel states this instead of simulating.
6. Taxonomy desk subcategory counts are from the ACTIVE storefront cache (no bulk admin count route); product-classification tiles use the server metrics endpoint.
7. Catalogue mutation → storefront freshness relies on the in-memory response-cache clear (global); a Redis-backed deployment would want per-key invalidation.
8. Product counts per category on list desks come from server `productCountTotal` (admin endpoint) — the snapshot-derived `productCounts()` helper remains only for legacy consumers.
9. `GET /explore/offers` still exists server-side (deferred cleanup); no frontend admin/offer code consumes it anymore.
10. Employee portal still uses the local workflow command engine (unchanged by this phase, §17).

## 17. DEFERRED — NOT CHANGED

| Limitation / surface | Why not changed here | Classification | Future phase |
|---|---|---|---|
| `productWorkflowCommands` sync state machine + employee portal (EmployeeOffer*, EmployeeProducts, ProductEditor employee path) keeping local commands | Phase 5 scope is ADMIN catalogue authority; employee portal redesign was explicitly excluded | BACKEND_GAP (admin-equivalent endpoints exist; employee UX not rewired) | Employee portal API integration |
| Product variants / sizes as first-class rows, material/fabric fields, per-variant price persistence in editor | No table columns; inventing persistence was forbidden | BACKEND_GAP | Catalogue model evolution (schema phase) |
| Hard product deletion with dependency checks (old `productDeletionService` flow) | No DELETE route; local-first deletion forbidden | BLOCKED by backend | Only with an API addition |
| Offer "paused ≠ archived", caps, priority, usage-today, offer date-range filters, per-redemption order lists | Columns/endpoints absent | BACKEND_GAP | Offers service expansion |
| Media upload / S3 / CDN, `getMediaInbox` local inbox, product-group merge UI | Media domain excluded | BACKEND_GAP / deferred | Media phase |
| Inventory ledger (`ensureOpeningStock` after publish), warehouse, reservations | Inventory redesign excluded | deferred | Inventory phase |
| `/explore/offers` static strip endpoint removal | Removing a live public endpoint is out of scope; frontend no longer depends on it | deferred | API cleanup |
| Per-category admin subcategory aggregate counts | No bulk route | BACKEND_GAP | Taxonomy API expansion |
| SectionPublishing `serverCheck` prop render | Optional; server publish-issues already shown live on the desk where it matters | PARTIALLY_IMPLEMENTED | Polish |
| Redis/Celery/Docker, Alembic, DB indexes | Explicitly forbidden this phase | out-of-scope | Infra phase |

## 18. Safety Confirmations

- **No DB changes:** zero migrations, no `alembic` touch, no new columns/tables/seed edits; `git diff` contains no model/schema file (`backend/app/models/**` untouched; only Pydantic DTOs changed).
- **Images untouched:** 238/238 files, `git diff HEAD` byte-clean under `frontend/public/images`.
- **No optimistic admin writes:** every mutation is awaited and reported from the response; error copy maps each HTTP status; deletions are server-confirmed (hard delete honestly disabled).
- **No token mixing:** admin calls use `scope:"admin"` only; Phase 1 customer/admin/employee isolation preserved; RBAC handled solely by the Phase 1 helpers.
- **Phase 2 coupon validation & checkout pricing:** untouched (only the guest validation *request* gained cart context).
- **Mock removal policy:** removed only where a real backend replacement exists; test fixtures retained.
- `git diff --check` clean; all listed verification commands green.

---

### Capability classification (required 19)

| # | Capability | Status |
|---|---|---|
| 1 | Admin product list: search, status/category filters, sort, pagination (server) | READY |
| 2 | Product create (full draft persistence of supported fields) | READY |
| 3 | Product edit with partial PATCH semantics (no clobber) | READY |
| 4 | Duplicate product | READY |
| 5 | Publish gated by server checks (approve ≠ publish) | READY |
| 6 | Unpublish / archive / restore | READY |
| 7 | Product → category/subcategory assignment via backend IDs | READY |
| 8 | Category CRUD incl. DRAFT/ARCHIVED visibility + server product counts | READY |
| 9 | Subcategory CRUD (create/restore/archive) | READY |
| 10 | Collection CRUD (all statuses) | READY |
| 11 | Collection ↔ product membership (manual assign, fresh-read before replace) | READY |
| 12 | Offer admin list with search + derived status + pagination + aggregate counts | READY |
| 13 | Offer create/edit (backend columns only, partial-safe) | READY |
| 14 | Offer activate / pause / archive (awaited) | PARTIALLY_IMPLEMENTED — endpoints complete; pause and archived persist as the same `is_active=false` state (BACKEND_GAP §16.1) |
| 15 | Offer usage/redemption visibility | PARTIALLY_IMPLEMENTED — lifetime counts only, no per-order list |
| 16 | Admin RBAC enforcement across catalogue APIs (Phase 1 helpers) | READY |
| 17 | Single normalization layer per domain + unified error mapping | READY |
| 18 | Runtime admin mock/fallback removal | READY |
| 19 | Hard product/category deletion with dependency enforcement | BLOCKED — no DELETE routes; archive-only retirement surfaced honestly |

READY was granted only where the complete backend → API layer → desk path works and was exercised by at least one automated gate; anything resting on an absent column/route is listed as BACKEND_GAP/BLOCKED/PARTIAL instead.
