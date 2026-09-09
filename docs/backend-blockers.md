# Backend blockers — FINAL AUDIT 2026-09-09

**Audience:** backend intern + reviewer.  
**Rule:** these are gaps the **frontend already has UI or a typed client for**. Nothing here is a new product idea.  
**This is the definitive list after full repo inspection — backend already exists in same repo, not assumed missing.**

Status key:

- **BLOCKING P0** — storefront / checkout / auth / catalogue cannot be production-true until this is right.
- **BLOCKING P1** — admin/employee merchandising, orders, media register, analytics.
- **SCHEMA / WIRING** — backend router may already mount a module; the **frontend client cannot use it** because the contract or columns are wrong.
- **PHASE GAP** — UI exists; client is an honest stub (`unavailable()`, `BACKEND_GAP`, early `return fail`).
- **VERIFIED:** after inspecting actual backend source (not just frontend labels).

---

## B-01 — Inventory schema vs frontend client (SCHEMA / WIRING, P1) — VERIFIED EMPTY MODELS

**Frontend:** `frontend/src/services/api/inventoryApi.js` — every call returns `{ ok: false }` because “existing server schema does NOT yet carry business columns on the `inventory_*` tables”.

**Backend verification:**
- `backend/app/models/inventory/*.py` — 6 files (inventory_location, inventory_stock, inventory_movement, stock_reservation, stock_transfer, warehouse) — each only `__tablename__` + inherited id/created_at/updated_at from Base, NO business columns.
- `backend/app/services/inventory/*` — inventory_service, reservation_service, transfer_service — empty class only `__init__`.
- `backend/app/api/v1/inventory.py`, `warehouses.py`, `stock_transfers.py` — 8 lines each, only `/health`, NO real CRUD.

So mounted ≠ usable is CONFIRMED: inventory is placeholder tables from initial schema move migration m001_move_tables_to_pratikshya_schema.

**Why it blocks:** Admin Inventory, warehouses, transfers, low-stock, employee inventory desks cannot show real stock. Admin dashboard `GET /analytics/inventory-summary` is separate read (aggregates from catalog_product.stock) and must not be treated as stock ledger — it returns note: "Aggregated from catalog_product stock fields; dedicated inventory tables do not yet carry business columns".

**Frontend expects:**
- `apiListStock` → Variant-level on-hand/reserved/available `{productId,variantId,sku,onHand,reserved,available}`
- `apiGetStockItem` → one SKU/variant
- `apiAdjustStock` → signed adjustment + reason
- `apiListMovements` → movement history
- `apiListLowStock` → below threshold
- `apiListReservations` → cart/order reservations
- `apiListWarehouses` / `apiCreateWarehouse` → locations
- `apiListTransfers` / `apiCreateTransfer` / `apiCompleteTransfer` → warehouse-to-warehouse

**Do not:** seed stock in browser. Cart/order paths already validate stock server-side against catalog_product.stock — keep as customer authority until ledger matches.

**HUMAN DECISION:** exact columns. Required migration: inventory_stock (product_id, variant_id, sku, warehouse_id, on_hand, reserved, available, low_threshold), inventory_movement (stock_id, delta, reason, actor), stock_reservation, warehouse (name, code, address), stock_transfer (from, to, status, lines).

**Classification:** E MISSING BACKEND (stub D) — P1 BLOCKER — BACKEND ACTION REQUIRED

---

## B-02 — Marketing media + media review API (PHASE GAP, P1) — RESOLVED 2026-09-09

**Previous Frontend:** `apiListMarketingMedia`, `apiListMediaReviews`, `apiApproveMedia`, `apiRejectMedia` returned `code: "BACKEND_GAP"`. Comment: `media_marketing_media` / `media_media_review` had no API.

**Backend fix (B-02):**
- `backend/app/models/media/marketing_media.py` — now production-ready: placement (HOME_HERO etc), object_key (hero/hero001.avif etc), media_asset_id FK SET NULL, title/subtitle/cta_label/cta_href/alt_text, sort_order, is_active, created_by/updated_by FK SET NULL, unique (placement, object_key), indexes on placement/active/sort.
- Migration `c7d8e9f0a1b2_add_marketing_media_real_schema` drops empty stub and creates real table in pratikshya schema — additive/safe, no destructive reset of unrelated tables.
- `backend/app/schemas/media/marketing.py` — placement vocabulary (HOME_HERO, WOMEN_SECTION, SAREE_SECTION, LEHENGA_SECTION, BRIDAL_SECTION, GROOM_SECTION, KIDS_SECTION, BANGLES_SECTION, JEWELLERY_SECTION, FESTIVE_SECTION, NEW_ARRIVALS, EDITORIAL, PROMOTION), create/update/response/list/reorder schemas.
- `backend/app/services/media/marketing_media_service.py` — CRUD, list (placement filter, activeOnly), active HOME_HERO ordered by sort_order/created_at, duplicate prevention via unique constraint + ConflictException, reorder, URL generation via build_media_url → /api/v1/media/objects/...
- `backend/app/api/v1/marketing_media.py` — 8 endpoints:
  - Admin: GET /admin/marketing/media (media.view), POST /admin/marketing/media (media.upload), GET /admin/marketing/media/{id} (media.view), PATCH /admin/marketing/media/{id} (media.assign), DELETE /admin/marketing/media/{id} (media.delete), PUT /admin/marketing/media/reorder (media.assign)
  - Public: GET /marketing/placements/{placement}, GET /marketing/hero (active HOME_HERO)
- `backend/app/services/catalog/explore_service.py` — GET /home now loads active HOME_HERO from marketing_media_service.list_active_home_hero() ordered, with fallback to canonical 5 hero assets when table empty or DB unavailable (resilience). Honest empty when table has rows but zero active (case B). No duplicate media, deterministic ordering, stable IDs.
- `backend/scripts/seed_marketing_hero.py` — idempotent seed of 5 canonical hero assets (hero001..005) into HOME_HERO with copy (Festive Elegance, Bridal Couture, Heritage Weaves, Celebration Edit, New Arrivals).
- `backend/app/api/v1/router.py` includes marketing_media_router.
- Authorization: admin endpoints require get_current_admin + require_admin_permission (media.view/upload/assign/delete) — customer/employee tokens 403. Public hero endpoints no auth, no mutation.

**Frontend integration:**
- `frontend/src/services/api/marketingMediaApi.js` — real clients for all 8 endpoints.
- `frontend/src/components/admin/BackendHomeHeroPanel.jsx` — admin UI for HOME_HERO: list, reorder (up/down), activate/deactivate, delete, create from canonical options, seed button, success/error, refresh.
- `frontend/src/pages/admin/media/AdminMarketingMedia.jsx` now includes BackendHomeHeroPanel at top — production source of truth.
- `frontend/src/components/storefront/HeroCarousel.jsx` already consumes GET /home heroSlides (now backend-managed) with fallback to canonical object-store URLs via mediaObjectUrl — fallback documented as development/emergency only, does NOT override valid backend config.
- Tests: backend unit `test_marketing_media.py` 10 tests (create, duplicate prevention, ordering, active exclusion, update/reorder, URL generation, empty, get_home integration). Frontend `marketingMediaHero.test.js` 8 tests (backend data renders, ordering respected, empty handled, invalid not crash, fallback cannot override, product media never fallback, canonical assets reachable, placement vocabulary).

**Why it unblocks:** Admin can now configure HOME_HERO order/activation without code change. GET /home returns ordered active hero slides with valid media URLs (/api/v1/media/objects/hero/...). Media ownership remains separate: PRODUCT MEDIA (products/...) ≠ COLLECTION/EDITORIAL (collections/...) ≠ MARKETING/HERO (hero/... marketing/...).

**Rule enforced:** registering product media never promotes to marketing slot (separate tables, separate namespaces, separate services).

**Remaining:** media_media_review still placeholder (media review approval flow) — separate concern, not required for HOME_HERO. Can be implemented later.

**Classification:** A COMPLETE — RESOLVED — 8 APIs added, total 225→233

---

## B-03 — Employee self check-in / check-out (PHASE GAP, P1) — VERIFIED STUB ROUTERS

**Frontend:** `attendanceService.checkIn` / `checkOut` return immediately: “Check-in is managed by the backend attendance service, which is not available in this phase. No local record was created.” Dead local-punch code after return unreachable.

**Backend verification:**
- `backend/app/models/employee/attendance.py` — REAL model: employee_id FK CASCADE, attendance_date, check_in, check_out, status PRESENT/ABSENT/LATE/HALF_DAY/LEAVE, notes.
- `backend/app/api/v1/attendance.py` — 8 lines health only, NO real endpoints.
- `backend/app/api/v1/performance.py` — same health only.
- `backend/app/services/employee/attendance_service.py` — empty class only __init__.
- `employees.py` router has admin attendance: POST /admin/employees/{id}/attendance, GET list, PATCH update — REAL admin side.
- Missing for employee desk: employee-scoped punch + today + history (`POST /employee/attendance/check-in`, `POST /employee/attendance/check-out`, `GET /employee/attendance/today`, `GET /employee/attendance`).

**Do not:** write punches to localStorage or deleted seedWorkforce dataset.

**Classification:** E MISSING BACKEND (employee self) — P1 BLOCKER — BACKEND ACTION REQUIRED

---

## B-04 — Employee leave + performance self-service (PHASE GAP, P2)

**Backend verification:**
- Leave: NO model file, no table, no migration — MISSING.
- Performance: model exists `employee_performance`, admin CRUD via employees.py `/admin/employees/{id}/performance` REAL, but employee self-service GET /employee/performance missing (performance.py router stub health only).
- Frontend: leaveRepository, performanceRepository empty in-memory after seedWorkforce.js deletion — empty tables honest.

**Need:** employee-scoped leave list/apply and performance read sharing same records as admin + leave table.

**Classification:** E MISSING BACKEND — P2 GAP — BACKEND ACTION REQUIRED if UI required now

---

## B-05 — Catalogue hydrate `total` (BLOCKING P0 if `total` missing)

**Frontend:** `catalogStore.fetchAllPublishedProducts` walks `GET /products` at pageSize 100 until items.length >= total or short last page. Shop listings paginate separately page size 12. First-page or later-page failure → ok:false (later also partial:true). UI must error not treat truncated as complete.

**Backend verification:**
- `backend/app/api/v1/products.py` GET /products → ProductService.list_storefront_products returns dict with total from count query (SELECT COUNT), not len(items). So contract is HONEST in code.
- `frontend/src/services/api/productsApi.js` normaliseProductList no longer does total ?? items.length — omitted total stays undefined, full page without total fails hydrate (ok:false GET /products omitted total). So client fails loudly.

**Need:** live DB with seeded products to prove HTTP. In this workspace no postgres/redis, cannot run real HTTP smoke test. Previous in-memory audit proved publish-visibility.

**HUMAN DECISION:** max published catalogue size vs browse pagination. Safety cap frontend 50 pages.

**Classification:** A COMPLETE in code, needs integration verification with live DB — P0 CONTRACT (not a blocker if backend runs)

---

## B-06 — Explore offers wiring (WIRING, P1) — VERIFIED STATIC

**Backend verification:**
- `backend/app/api/v1/explore.py` GET /explore/offers returns ExploreOffersResponse with static list _EXPLORE_OFFERS (3 offers: FIRST10, free shipping, FESTIVE40) — NOT DB-backed, comment says BACKEND DECISION REQUIRED.
- `backend/app/services/catalog/explore_service.py` _EXPLORE_OFFERS static, _PROMO_CARDS, _EDITORIAL_CARDS static (CMS future).
- Public offers GET /offers returns DB coupons where is_active true — REAL DB-backed.
- Frontend: searchApi.apiGetExploreOffers calls /explore/offers — wiring fixed (previously Explore.jsx used getExploreOffers()), but data still static not from offers register.

**Need:** Make /explore/offers query CouponModel active not expired, or keep static but document.

**Classification:** C PARTIAL — P1 WIRING — BACKEND ACTION REQUIRED (make DB-backed)

---

## B-07 — Support / styling / floor-sales desks (PHASE GAP, P2)

Employee routes exist (/employee/support/*, /employee/styling/*, /employee/sales). After cleanup they render empty tables. No live client, no backend models.

**Need (only because UI exists):**
- Support cases list/create/update
- Styling appointments + requests
- Departmental floor sales derived from orders, not parallel sales DB

**Do not** invent named customers.

**HUMAN DECISION:** if required now or future. Sales MUST derive from orders.

**Classification:** E MISSING BACKEND — P2 GAP

---

## B-08 — AI assistants still local (PHASE GAP, P3)

Customer AI Shopping, AI Mirror, Admin Insights/AI, employee later AI notes. Frontend uses brand-voice / local helpers. Backend chatbot router mounted but only health, no AI endpoints. No models (knowledge_document etc empty).

Production AI is P3. Until then UI must say preview, never pretend model answered from live orders.

**Classification:** H FUTURE — NOT REQUIRED NOW

---

## B-09 — Activity diary split (WIRING, P2)

`activityService` is shared in-session diary. Admin product history has API (GET /admin/products/{id}/history? Actually history field on product, plus /audit/logs, /admin/activity). House-wide activity (GET /admin/activity, GET /employee/activity) must not fork second log.

**Backend verification:**
- GET /audit/logs — REAL with filters action, actor, targetProductId, targetEmployeeId, targetOrderId, q, pagination
- GET /admin/activity — REAL latest 200 from audit_activity_log
- GET /employee/activity missing? Not in router list — may need same table if required.

**Classification:** C PARTIAL — P2 WIRING — verify employee activity uses same audit table

---

## B-10 — Notifications inbox (DO NOT INVENT)

Admin header copy: notifications not available in this phase. Customer/admin settings already persist notification preferences via /admin/settings/notifications and customer preferences.

Backend notifications router only has GET/PATCH /admin/settings/notifications — REAL for preferences, not inbox. No inbox endpoint, no model columns — correctly not invented.

**Classification:** H NOT REQUIRED — DO NOT INVENT

---

## B-11 — Customer product-review writes (DO NOT INVENT)

Storefront displays rating/reviewCount on product record. No write-review form. GET /products/{id}/reviews exists on client as read but backend uses product fields — OK.

**Classification:** H NOT REQUIRED — DO NOT INVENT

---

## B-12 — Secrets / auth hygiene (SECURITY, P0) — VERIFIED REAL

- JWT creation with jti, blacklist in Redis, HS256, 30min access 7d refresh — REAL
- Validation via decode_token + blacklist check — REAL
- Scope isolation: get_current_customer/employee/admin check user_type 403 — REAL
- Admin permission: require_admin_permission checks roles/permissions, fallback for unassigned admin (compat path, only admin) — documented narrow
- No hardcoded passwords in frontend src — verified
- Docs must never copy .env secret values — rule
- EmployeeLogin fill() removed — verified
- CORS configured via ALLOWED_ORIGINS CSV
- /docs only when DEBUG true

**Classification:** A COMPLETE — P0 SECURITY OK

---

## B-13 — Duplicate systems (ARCHITECTURE — already forbidden) — VERIFIED

The frontend already encodes these. Backend must not reopen them:

| Rule | Meaning | Verified |
|---|---|---|
| One product register | No admin-catalogue vs storefront-catalogue | YES catalog_product single |
| One media register | Product media ≠ marketing media | YES asset+mapping vs marketing empty distinct |
| One auth | JWT; no demo users | YES |
| One workflow | Commands in productWorkflow; APPROVE ≠ PUBLISH | YES service enforces |
| Kids | Category/department + ID prefix PF-K-*, not side catalogue | YES same lifecycle |
| IDs | Never regenerate PF-* from filenames or clocks | YES next-id deterministic |

**Classification:** A COMPLETE — architecture rule enforced

---

## B-14 — Employee assigned-products placeholder (NEW P0 found in audit)

**Frontend:** F-EMP-PRODUCTS, F-EMP-DASHBOARD need GET /employee/me/assigned-products

**Backend verification:**
- `backend/app/api/v1/employees.py` GET /employee/me/assigned-products returns `{ok:true, data:[], message:"Assigned products endpoint — implementation pending product service."}` — STUB placeholder TODO.

**Why it blocks:** Employee products inbox empty even when admin assigns product via POST /admin/products/{id}/assign (which sets assigned_employee_id). Employee should see assigned work.

**Need:** Implement ProductService.list_assigned_products(employee_code) where assigned_employee_id == code, wire to employees.py.

**Classification:** D STUB — P0 BLOCKER (employee P0) — BACKEND ACTION REQUIRED

---

## B-15 — Employee forgot-password + session sid gaps (NEW)

- API-AUTH-15 POST /auth/employee/forgot-password missing — frontend EmployeeForgotPassword.jsx honest says contact admin, sends no email — HUMAN DECISION if admin-only reset (API-EMP-06) only or separate employee token flow (must not reuse customer tokens).
- Session sid missing: token has jti but no sid claim, so POST /customers/me/sessions/revoke-others revokes ALL including current, and GET /customers/me returns isCurrent false for all — documented BACKEND_GAP in customers.py. Needs sid claim at token issue.

**Classification:** E MISSING + C PARTIAL — P1/P2

---

## Priority rollup — FINAL

| ID | Title | Priority | Kind | Classification |
|---|---|---|---|---|
| B-05 | Hydrate walk + honest total | P0 | Contract | A in code, needs live DB proof |
| B-14 | Employee assigned-products placeholder | P0 | Stub | D — BACKEND ACTION REQUIRED |
| B-12 | Auth scopes / no secrets | P0 | Security | A COMPLETE |
| B-01 | Inventory schema (6 empty models, 3 stub routers) | P1 | Schema/wiring | E — BACKEND ACTION REQUIRED |
| B-02 | Marketing media + review (2 empty models, stub router) | P1 | Phase gap | E — BACKEND ACTION REQUIRED |
| B-03 | Employee punch (model real, routers stub, service empty) | P1 | Phase gap | E — BACKEND ACTION REQUIRED |
| B-06 | Explore offers static not DB | P1 | Wiring | C — BACKEND ACTION REQUIRED |
| B-15 | Employee forgot-password missing + sid gap | P1 | Gap | E/C + HUMAN DECISION |
| B-04 | Leave/performance employee self | P2 | Phase gap | E — BACKEND ACTION REQUIRED if UI now |
| B-07 | Support/styling/floor-sales | P2 | Phase gap | E — HUMAN DECISION if now |
| B-09 | Activity diary employee side | P2 | Wiring | C — verify |
| B-08 | AI | P3 | Phase gap | H FUTURE |
| B-10 | Notifications inbox | — | Do not invent | H NOT REQUIRED |
| B-11 | Review writes | — | Do not invent | H NOT REQUIRED |
| B-13 | Duplicate systems | — | Architecture | A COMPLETE |

**Total blockers P0: 2 (B-05 needs proof, B-14 needs impl) — P1: 5 (B-01,B-02,B-03,B-06,B-15) — P2: 3 — P3: 1**

