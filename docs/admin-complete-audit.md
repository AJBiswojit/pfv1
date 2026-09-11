# PRATIKSHYA FASHON — COMPLETE ADMIN SECTION AUDIT

**Audit date:** 2026-09-10
**Audit mode:** AUDIT ONLY — NO CODE CHANGES. Every recommendation in this document is an audit recommendation. All final decisions are reserved for the product owner (`USER DECISION REQUIRED`).
**Repository state audited:** branch `arena/01a08c4a-pfv1` @ commit `2f8799d` ("Merge pull request #32 …"), clean working tree at audit start.
**Scope:** Admin portal only (`/admin/*` frontend surface + backend endpoints consumed by it). Employee portal, storefront and public APIs are covered only where an Admin feature depends on them.

---

## 1. Executive Summary

The Admin portal is a large, mostly backend-wired React surface (48 distinct screens behind 59 route entries) served by a FastAPI + PostgreSQL backend. The codebase is unusually well documented and several prior audits exist (`docs/backend-blockers.md`, `docs/api-count-reconciliation.md`, `docs/full-stack-integration-audit.md`). This audit re-verified those claims against live code and a partially live runtime, and found:

**Load (the reported pain point — excessive DB load):** The single largest verified DB-load source is `GET /admin/products` (`ProductService.list_admin_products`, `backend/app/services/catalog/product_service.py:1414`): every call executes a COUNT, then loads **the entire filtered catalogue into memory** (no SQL LIMIT), plus a **full scan of the whole `catalog_collection` table** (`_collection_membership_names`) plus a registered-media join — and only then sorts/paginates in Python. This endpoint is called not only by the product desk (25/page) but also by the `useProducts()` hook (pageSize 100) which **re-fetches on every mount of at least 4 different components** (AdminProductReview, AdminMarketingMedia, ProductCatalogSelector, ProductGroupReviewPanel). The Admin Dashboard fires **7 uncached aggregate/read requests** on every load (including the employee list **twice** — once by `EmployeeManagementProvider`, once by `loadBusinessMetrics`) and re-fires all of them on every `PRODUCTS_CHANGED_EVENT`. **No polling exists anywhere in the Admin portal** — the load is event- and navigation-driven, not timer-driven.

**Functional gaps that masquerade as features:**
- The **entire Admin Inventory section (6 screens) is a browser-localStorage simulation**. `frontend/src/services/api/inventoryApi.js` returns `{ok:false}` for every call; `InventoryContext` reads/writes `localStorage`. The backend inventory tables are empty stubs (confirmed in `docs/backend-blockers.md` B-01 and re-verified here).
- The **audit/activity diary is never written by the backend**. `audit_activity_log` has readers (`GET /audit/logs`, `GET /admin/activity`) but **zero writers** in `backend/app/**`. The frontend `activityService.recordActivity` writes to an **in-memory Map** that dies on reload (`frontend/src/services/employees/activityService.js:257-300`). `/admin/activity` therefore always shows an empty list (matches blocker B-09, now worse than documented).
- The **Admin Returns screens do not use the returns API**: `/admin/returns/*` (9 backend operations) have **no frontend caller**; `AdminReturns.jsx` derives returns client-side from a 100-order snapshot.

**Duplication:** three marketing/hero systems, two media systems (durable DB registry vs in-session register), two analytics engines (backend `/analytics/*` vs client-side `analyticsService` over order snapshots), two role catalogues (static `BUILT_IN_ROLES` vs DB RBAC), two settings-notifications implementations (one route-shadowed), duplicated `/admin/products/metrics` vs `/admin/workflow/metrics`, 20 hidden legacy `/employees/*` alias routes, and `EmployeeService` **defined twice in the same file** (the second class silently shadows ~470 lines of the first, with *different* allowed employee statuses).

**Security:** unauthenticated access is correctly rejected **401 on all 20 sampled admin endpoints (runtime-verified)**, and customer/employee tokens are rejected at the surface guard. However, several admin routers (orders, employees, analytics, audit, users, roles, permissions) enforce **no fine-grained permission check** despite docstrings claiming e.g. "`orders.view`", and `require_admin_permission` has a documented fallback in which **an admin with no role rows passes every permission check**.

**Headline recommendation areas (not decisions):** the DB-load hotspots are concentrated in five read paths (§24); the largest simplification opportunities are the simulated inventory section, the never-written activity diary, the unused returns/departments/sections/targets/performance endpoint families, and the three parallel marketing systems. All are listed with evidence in §20–§26.

---

## 2. Audit Scope

### In scope (audited)
- All 59 `/admin/*` route entries in `frontend/src/App.jsx` (incl. login, redirects, aliases).
- All Admin pages/components/hooks/contexts/services under `frontend/src/pages/admin/**`, `frontend/src/components/admin/**`, `frontend/src/components/media/**`, `frontend/src/components/inventory/**`, `frontend/src/components/analytics/**`, `frontend/src/components/products/**` (as consumed by admin), `frontend/src/context/{AdminAuthContext,EmployeeManagementContext,InventoryContext,OrderContext,WorkforceContext}.jsx`, `frontend/src/services/admin/**`, `frontend/src/services/api/**` (admin-scoped calls), `frontend/src/services/{media,workflow,employees,inventory,analytics,offers,marketing}/**` as consumed by Admin, `frontend/src/config/{adminAccess,adminNavigation}.js`.
- Backend routers/endpoint families consumed by the Admin portal: `backend/app/api/v1/{admin,analytics,audit,users,roles,permissions,products,categories,collections,coupons,customers,employees,orders,returns,media,marketing_media,media_reviews,notifications,auth}.py` plus `backend/app/dependencies.py` (auth/RBAC), `backend/app/core/{cache,redis,middleware}.py`, relevant services and models.
- Database models/tables used by Admin features, migrations in `backend/alembic/versions/`, and the schema audit tooling in `backend/schema_audit/`.
- Existing documentation: `docs/*.md` (7 documents reviewed for admin content), `docs/openapi.json`, `backend/README.md`, `HOMEPAGE_AUDIT.md` (hero interplay only).

### Out of scope (per instructions)
- Customer storefront pages, cart/checkout/wishlist internals, employee-portal-only screens (covered only where Admin consumes the same endpoint/table).
- AI/ML internals (the Admin AI assistant is a frontend mock — documented; no backend AI is exposed through Admin).
- Any change to code, schema, routes, permissions, or behavior. **Nothing was modified.**

---

## 3. Admin Architecture Overview

### 3.1 Stack and seams

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19 + Vite 7 SPA, react-router v6, custom fetch client (`services/api/apiClient.js`) | No React Query/SWR; data fetching is hand-rolled `useEffect` + module singletons |
| Auth surfaces | Three isolated JWT scopes: `pf_admin_*`, `pf_employee_*`, `pf_*` (customer) | `apiClient.js` requires an explicit `scope` per call; admin tokens live in separate localStorage keys (`AdminAuthContext.jsx`) |
| Backend | FastAPI 0.111, SQLAlchemy 2 async, Alembic, asyncpg | `backend/app/api/v1/router.py` mounts 35 routers under `/api/v1` |
| Cache | **In-process LRU cache replaces Redis** (`app/core/redis.py` shim → `lru_cache_store`); fastapi-cache2 response cache for public endpoints only | Admin/analytics endpoints are **not cached** |
| DB | PostgreSQL, schema `pratikshya` (migration `m001_move_tables_to_pratikshya_schema.py`) | 60+ models under `backend/app/models/**` |

### 3.2 Admin auth/RBAC model (as built)

- **Frontend:** one role only — `SUPER_ADMIN` (`frontend/src/config/adminAccess.js`). `AdminProtectedRoute` **requires `isSuperAdmin`** — any admin session without SUPER_ADMIN is shown `AdminAccessDenied`. A second guard (`AdminEmployeeManagementRoute`) checks the single frontend permission `employees.manage` for `/admin/employees*`.
- **Backend:** `get_current_admin` (dependencies.py) only asserts `user_type == "admin"`. Fine-grained checks (`require_admin_permission`, per-permission) are applied on products, categories, collections, coupons/offers, media, marketing-media and admin-settings routes. They are **absent** on orders, employees, analytics, audit, users, roles, permissions (details §16).
- **RBAC data:** DB tables (`roles`, `permissions`, `role_permissions`, `user_roles`) + a **static in-code role catalogue** (`BUILT_IN_ROLES` in `app/api/v1/admin.py`) + a **fallback merge** in `dependencies.get_user_roles_and_permissions` that injects the static permissions for DB roles, and a documented compatibility path where **an admin with zero role rows bypasses permission checks** (`require_admin_permission`, dependencies.py:220-232).

### 3.3 Data-flow patterns that matter for load

1. **No data-fetching library.** Every screen fetches in `useEffect`; there is **no request dedup, cache, or retry budget** across components. The same endpoint can be fetched once per mounted component instance (verified for `useProducts`, §7/§17).
2. **Global snapshot contexts.** `OrderContext` keeps one 100-order admin snapshot (`refreshAdminOrders` → `GET /admin/orders?pageSize=100`) shared by AdminOrders, AdminReturns, AdminCustomerDetail and AdminAnalytics; `EmployeeManagementProvider` keeps a 100-employee snapshot fetched whenever an admin token exists.
3. **Server-side Python pagination.** Several admin list endpoints load the full filtered set into memory and paginate in Python (`list_admin_products`, `admin_list_offers`, admin categories/collections lists). Evidence per endpoint in §7.
4. **Event-driven refresh.** `PRODUCTS_CHANGED_EVENT` (catalogRepository) triggers a full dashboard reload; `MEDIA_CHANGED_EVENT` and `storage` events re-read the in-session media register. **No `setInterval`, `setTimeout` polling loops, websockets, SSE, or refetch-on-focus exist in the Admin portal** (verified by grep across `frontend/src`, §18).
5. **In-session mirrors.** Media register (`mediaStore.js`) and activity diary (`activityService.js`) deliberately have **no localStorage authority** — they are per-tab memory only, while the backend holds the durable counterpart (media) or nothing at all (activity).

---

## 4. Complete Admin Feature Inventory

Classification values: `KEEP / SIMPLIFY / REVIEW / REMOVE-DEFER / DUPLICATE / BROKEN / DEAD-UNUSED / UNKNOWN` (audit recommendation only — **not** a decision).

| ID | Feature | Admin route(s) | Nav location | Status | Backend? | DB tables | Classification (recommendation) |
|----|---------|----------------|--------------|--------|----------|-----------|-------------------------------|
| F-A01 | Admin sign-in / session restore / sign-out | `/admin/login` | — (gate) | Wired to backend | `auth.py` (`/auth/admin/*`, `/auth/me`); JWT + Redis-shim blacklist | `users`, `auth_sessions`, `auth_password_reset` | KEEP |
| F-A02 | Admin shell (sidebar/header/page frames) | layout for all `/admin/*` | — | Works | none | none | KEEP |
| F-A03 | Dashboard (KPI tiles, 7-day sales chart, category bars, recent orders, stock alerts) | `/admin` | Overview | Backend-wired; **7 requests/load, employee list fetched twice, full reload on product events** | analytics.py ×4, orders.py, employees.py, inventory-summary | `orders`, `order_items`, `users`, `customer_profiles`, `catalog_product`, `employees*` | SIMPLIFY (load) |
| F-A04 | Analytics workspace (tabs: sales/products/customers/inventory/returns/offers) | `/admin/analytics` (+6 alias routes) | Overview | **Client-side compute over 100-order snapshot** + local inventory/workforce stores | indirectly `/admin/orders?pageSize=100` | `orders`+`order_items` (via snapshot) | REVIEW (duplicate engine vs `/analytics/*`) |
| F-A05 | AI Business Assistant | `/admin/ai-assistant` | Overview | **Mock provider, zero backend calls** (`services/ai/aiService.js` → `mockAiProvider`) | none | none | REMOVE-DEFER (demo) |
| F-A06 | Product catalogue desk (list, search debounce 250ms, filters, sort, pagination 25/page, metrics tiles, bulk actions, row lifecycle actions) | `/admin/products` | Catalogue | Backend-wired; **heavy read path** (§7 HP-1/HP-3) | products.py admin family | `catalog_product`, `catalog_collection`, `media_asset`, `product_media` | KEEP (simplify load) |
| F-A07 | Product create/edit (ProductEditor: basics/pricing/variants/content/SEO; server identity pre-flight; server publish-issues) | `/admin/products/new`, `/admin/products/:id/edit` | Catalogue | Backend-wired | `POST /admin/products`, `/draft`, `next-id`, `availability`, `PATCH {id}`, `publish-issues` | `catalog_product` (+history JSONB) | KEEP |
| F-A08 | Product review queue (unified queue, draft/group panels, per-product review detail, media inbox) | `/admin/products/review` | Catalogue ▸ Product Review | Backend-wired; each mount re-fetches catalogue (pageSize 100) | `GET /admin/products`, lifecycle ops, `submit-review` | as F-A06 | SIMPLIFY (fetch pattern) |
| F-A09 | Product detail (admin record, lifecycle, media summary, per-product activity slice) | `/admin/products/:productId` | Catalogue | Backend-wired; **full `catalog_collection` scan per view** (§7) | `GET /admin/products/{id}` | as F-A06 | KEEP (simplify load) |
| F-A10 | Product lifecycle & assignment ops (assign employee, approve, reject, publish, unpublish, archive, restore, duplicate, change-id, review-flags clear, bulk) | actions within F-A06/08/09 | — | Backend-wired (all endpoints verified called) | products.py lifecycle family | `catalog_product` | KEEP (canonical lifecycle; preserve) |
| F-A11 | Product media manager (upload → object store → register; role/sort/primary) | `/admin/products/:productId/media` | Catalogue ▸ Media | Backend-wired (durable pipeline) | `POST /media/products/{id}/objects`, `POST /media/register`, `GET /media/products/{id}/media-set` | `media_asset`, `product_media`, `catalog_product` | KEEP |
| F-A12 | Media library (session register + "durable registry" panel) | `/admin/media` | Catalogue ▸ Media | **Two systems side by side**; durable panel unbounded (`GET /media/assets`) | media.py | `media_asset` | DUPLICATE / SIMPLIFY |
| F-A13 | Media upload desk (staging; marketing scope blocked by design) | `/admin/media/upload` | Catalogue ▸ Media | Backend upload via product scope; marketing blocked (`MARKETING_MEDIA_BLOCKER`) | media.py | `media_asset` | REVIEW |
| F-A14 | Media review queue (approve/reject employee submissions, batch actions) | `/admin/media/review` | Catalogue ▸ Media ▸ Review | **Session-mirror only — no backend** (`media_reviews.py` is a health-only stub; `MediaReviewModel` has no columns) | none | none (empty `media_media_review` stub) | BROKEN (as production feature) |
| F-A15 | Marketing media / HOME_HERO (BackendHomeHeroPanel: CRUD + reorder on backend; plus session-register marketing board; plus product-placement curation) | `/admin/media/marketing` | Catalogue ▸ Media ▸ Marketing | Backend panel wired; **three parallel systems** (§20 D-3) | marketing_media.py admin CRUD | `media_marketing_media` | DUPLICATE / SIMPLIFY |
| F-A16 | Media product mapping desk | `/admin/media/product-mapping` | Catalogue ▸ Media ▸ Product Mapping | Session-mirror only | none | none | REVIEW (overlap with F-A11/F-A12) |
| F-A17 | Media detail | `/admin/media/:mediaId` | (from library) | Session-mirror | none | none | REVIEW |
| F-A18 | Categories management (list, create, edit, archive/activate/restore, subcategories CRUD) | `/admin/categories*` (5 routes) | Catalogue | Backend-wired; list is unpaginated (full set) | categories.py admin family | `catalog_category`, subcategory columns | KEEP |
| F-A19 | Collections management (list, create, edit, activate/pause/archive/restore, assign products) | `/admin/collections*` (5 routes) | Catalogue | Backend-wired | collections.py admin family | `catalog_collection` | KEEP |
| F-A20 | Offers/coupons management (list w/ honest tiles, create, edit, activate/pause/archive) | `/admin/offers*` (4 routes) | Catalogue | Backend-wired; list loads all coupons into memory then paginates in Python | coupons.py `/admin/offers*` | `commerce_coupon` (+redemptions) | KEEP (simplify load) |
| F-A21 | Orders desk (list 100/page from global snapshot; status filter; search) | `/admin/orders` | Orders & Customers | Backend-wired; **every navigation refetches 100 eager-loaded orders** | orders.py `/admin/orders` | `orders`, `order_items`, `order_returns`, `users` | SIMPLIFY (fetch/pagination) |
| F-A22 | Order detail + fulfilment pipeline (allocate→pick→pack→ready→dispatch→out-for-delivery→deliver, cancel, notes, generic status, force-status, fulfillment assignment) | `/admin/orders/:orderId` | Orders | Backend-wired; **three overlapping status-change mechanisms** (§20 D-11) | orders.py lifecycle family (13 ops) | `orders`, `order_items`, `order_status_history` | KEEP (consolidation candidate) |
| F-A23 | Order invoice | `/admin/orders/:orderId/invoice` | Orders | Backend-wired | `GET /admin/orders/{id}/invoice` | as F-A22 | KEEP |
| F-A24 | Customers list (search server-side, pageSize 100) | `/admin/customers` | Orders & Customers | Backend-wired; accepts admin **or employee** tokens | customers.py `/admin/customers` | `users`, `customer_profiles`, `customer_addresses`, `orders` | KEEP |
| F-A25 | Customer detail (profile, addresses, derived order stats) | `/admin/customers/:customerId` | Orders & Customers | Backend-wired | `GET /admin/customers/{id}` | as F-A24 | KEEP |
| F-A26 | Returns desk (list + detail + derived metrics) | `/admin/returns`, `/admin/returns/:returnId` | Orders & Customers | **Frontend derives returns from the orders snapshot; the 9-op `/admin/returns/*` API has zero callers** | (unused) returns ops in orders.py | `order_returns`, `return_items` (via orders) | DUPLICATE (decide: wire API vs keep derivation) |
| F-A27 | Inventory suite (dashboard, receive, adjust, transfers, movements, low-stock) | `/admin/inventory*` (6 routes) | Inventory & Operations | **Browser localStorage simulation; backend inventory tables are empty stubs** (B-01) | **none** | none (reads `catalog_product.stock` only via analytics) | BROKEN as production feature / REMOVE-DEFER |
| F-A28 | Employees list (search, status filter, invites) | `/admin/employees` | People | Backend-wired (pageSize 100; fetched twice per admin session — context + dashboard) | employees.py `/admin/employees` | `users`, `employee_profiles` | KEEP (dedupe fetch) |
| F-A29 | Employee create/edit (role, department, section, permissions mode) | `/admin/employees/new`, `/:id/edit` | People | Backend-wired | `POST/PATCH /admin/employees*` | `users`, `employee_profiles`, `departments`, `sections` | KEEP |
| F-A30 | Employee detail (profile, status, reset password, permission matrix) | `/admin/employees/:employeeId` | People | Backend-wired | `GET /admin/employees/{id}`, status/reset-password/permissions ops | as F-A29 + `employee_*` | KEEP |
| F-A31 | Activity log | `/admin/activity` | System | **Reads `GET /audit/logs`; table has no writers → always empty** | audit.py | `audit_activity_log` (unwritten) | BROKEN (pipeline), KEEP concept |
| F-A32 | Business settings (17 sections; read merged defaults; save/reset per section) | `/admin/settings` | System | Backend-wired | admin.py settings family | `admin_setting` | KEEP |
| F-A33 | Admin profile (local snapshot edit only) | `/admin/profile` | Footer link | **updateProfile is client-side only — no persistence** | none | none | REVIEW (decide persistence) |

Feature count: **33 inventoried features** (F-A01…F-A33) across **48 distinct screens**.

### 4.1 Status tallies (audit recommendations, not decisions)

| Classification | Count | IDs |
|---|---|---|
| KEEP (with load simplifications noted) | 21 | A01, A02, A06, A07, A09, A10, A11, A18, A19, A20, A21*, A22*, A23, A24, A25, A28, A29, A30, A32, A03*, A08* (* = keep feature, simplify load) |
| SIMPLIFY | 3 | A03, A08, A21 (fetch/load pattern) |
| REVIEW | 6 | A04, A13, A16, A17, A26, A33 |
| DUPLICATE | 2 | A12, A15 |
| BROKEN (as production feature) | 3 | A14, A27, A31 |
| REMOVE-DEFER | 1 | A05 |
| DEAD-UNUSED | 0 screens (see §21 for dead endpoints) | — |

---

## 5. Admin Route Inventory

Source: `frontend/src/App.jsx` lines 81–240 (lazy imports + route table). 59 entries total.

| # | Route entry | Page component | Guard | Notes |
|---|---|---|---|---|
| 1 | `/admin/login` | AdminLogin | public | |
| 2 | `/admin` | AdminDashboard | AdminProtectedRoute (SUPER_ADMIN) + AdminLayout | |
| 3 | `/admin/dashboard` | → Navigate `/admin` | | redirect alias |
| 4–7 | `/admin/employees`, `/new`, `/:id/edit`, `/:id` | AdminEmployees / Create / Edit / Detail | + AdminEmployeeManagementRoute | |
| 8 | `/admin/activity` | AdminActivity | | always empty (§19) |
| 9 | `/admin/profile` | AdminProfile | | local-only save |
| 10–15 | `/admin/products`, `/review`, `/new`, `/:id/edit`, `/:id`, `/:id/media` | AdminProducts / Review / ProductForm ×2 / Detail / ProductMedia | | |
| 16–21 | `/admin/media`, `/upload`, `/review`, `/marketing`, `/product-mapping`, `/:mediaId` | Media pages | | |
| 22–26 | `/admin/categories`, `/new`, `/:id/edit`, `/:id/subcategories`, `/:id` | Category pages | | `/:id/subcategories` and `/:id` render the same `AdminCategoryDetail` |
| 27–31 | `/admin/collections`, `/new`, `/:id/edit`, `/:id/products`, `/:id` | Collection pages | | `/:id/products` and `/:id` render the same `AdminCollectionDetail` |
| 32–35 | `/admin/offers`, `/new`, `/:id/edit`, `/:id` | Offer pages | | |
| 36–38 | `/admin/orders`, `/:orderId`, `/:orderId/invoice` | Order pages | | |
| 39–40 | `/admin/customers`, `/:customerId` | Customer pages | | |
| 41–42 | `/admin/returns`, `/:returnId` | Return pages | | derived from orders snapshot |
| 43–48 | `/admin/inventory`, `/receive`, `/adjust`, `/transfers`, `/movements`, `/low-stock` | Inventory pages (portal="admin") | | localStorage simulation |
| 49–50 | `/admin/warehouses`, `/admin/stock-movements` | Redirects | | → inventory routes |
| 51–57 | `/admin/analytics`, `/admin/ai-assistant`, `/admin/analytics/{sales,products,customers,inventory,returns,offers}` | AdminAnalytics ×7, AiBusinessAssistant | | 6 aliases all render the same component |
| 58 | `/admin/settings` | AdminSettings | | |
| 59 | `/admin/*` | AdminNotFound | | catch-all |

Related non-route guard files: `AdminProtectedRoute.jsx`, `AdminEmployeeManagementRoute.jsx`, `AdminAccessDenied.jsx` (used), `AdminHeader.jsx`, `AdminSidebar.jsx` (single nav source: `config/adminNavigation.js`), `AdminPage.jsx`, `AdminPanel.jsx`, `AdminMetricCard.jsx` (shared), `adminNavIcons.js`.

---

## 6. Admin API Inventory

**Counting method (evidence-based):** live route table dumped from the running FastAPI app (`app.routes`), cross-checked against an AST scan of all `@router` decorators and the frontend call sites (`services/api/*.js`, grep for `scope:"admin"`). The committed `docs/openapi.json` is **stale** (237 operations vs **285 live**); it must not be used for counting.

### 6.1 Totals

| Group | Operations (method+path) | Unique paths |
|---|---|---|
| All live backend routes | 285 | — |
| Under `/api/v1/admin/*` | **125** | 96 |
| Admin-relevant outside `/admin/*` (analytics 8, audit 2, users 3, roles 3, permissions 3, `/auth/admin/*` 3, `/auth/me` 1) | 23 | 21 |
| Legacy hidden aliases `/api/v1/employees/*` (`include_in_schema=False`, duplicates of `/admin/employees/*`) | 20 | 20 |
| Media endpoints consumed by Admin (durable pipeline) | 4 (+2 with no caller) | 6 |
| Module health endpoints (`*/health`) | 9 | 9 |
| **Distinct endpoints with ≥1 verified Admin-frontend caller** | **97** | 97 |

### 6.2 Authoritative Admin API inventory (called by the Admin frontend — all 97 verified)

Auth column: `A` = `get_current_admin` (+ optional `require_admin_permission(perm)`), `A+` = admin-or-employee via `get_current_user` + manual `user_type` check, `P` = public/no auth. Load ratings per §29 scale.

| # | Method | Endpoint | Purpose | Auth/Perm | Frontend caller | Main DB tables | Load | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | POST | `/auth/admin/sign-in` | Admin login | P (rate-limited `auth.py:350`) | AdminAuthContext.signIn | users | LOW | |
| 2 | POST | `/auth/admin/sign-out` | Revoke session | A | AdminAuthContext.signOut | — | LOW | |
| 3 | GET | `/auth/me` | Session restore | any token | apiRestoreAdminSession | users | LOW | shared with customer/employee |
| 4 | GET | `/admin/settings` | All 17 sections merged | A + `settings.view` | settingsRepository.getSettings | admin_setting | LOW | |
| 5 | GET | `/admin/settings/{section}` | One section | A + `settings.view` | settingsRepository.getSection (workforce attendance/holidays reads) | admin_setting | LOW | also employee-portal consumer |
| 6 | PATCH | `/admin/settings/{section}` | Save section | A + **SUPER_ADMIN** | AdminSettings.save | admin_setting | LOW | |
| 7 | POST | `/admin/settings/{section}/reset` | Reset section | A + SUPER_ADMIN | AdminSettings.reset | admin_setting | LOW | |
| 8 | GET | `/audit/logs` | Activity diary (filters+pagination ≤200) | A | AdminActivity | audit_activity_log | LOW | table never written (§19) |
| 9 | GET | `/analytics/overview` | 8 headline metrics | A | dashboard | orders, users, customer_profiles, catalog_product | **HIGH** | 6 separate full aggregates, uncached |
| 10 | GET | `/analytics/sales` | Revenue/orders by day (≤365d) | A | dashboard | orders | MEDIUM | group-by scan |
| 11 | GET | `/analytics/products` | Top products (limit ≤100) | A | dashboard (limit 100 for category bars) | order_items, orders | HIGH | join+group scan |
| 12 | GET | `/analytics/orders` | Counts by status | A | dashboard | orders | MEDIUM | |
| 13 | GET | `/analytics/inventory-summary` | Stock aggregates | A | dashboard | catalog_product | MEDIUM | full-table aggregate |
| 14 | GET | `/admin/orders` | Order list (≤100/page, eager items+returns) | A (no perm check) | AdminOrders/Returns/Analytics/Detail via OrderContext | orders, order_items, order_returns, users | **HIGH** | heavy payload per navigation |
| 15 | GET | `/admin/orders/{id}` | Full order record | A (no perm check) | AdminOrderDetail, Invoice | orders + relations | MEDIUM | |
| 16 | GET | `/admin/orders/{id}/invoice` | Invoice read model | A | AdminOrderInvoice | orders + relations | MEDIUM | |
| 17–29 | POST | `/admin/orders/{id}/` `allocate`, `pick/start`, `pick/item`, `pack`, `ready`, `dispatch`, `out-for-delivery`, `deliver`, `cancel`, `notes`, `status`, `force-status`, `fulfillment` | Lifecycle & annotation ops | A (no perm checks) | AdminOrderDetail (+OrderContext refresh) | orders, order_status_history | MEDIUM each | 3 overlapping status mechanisms (§20 D-11) |
| 30 | GET | `/admin/products` | **Catalogue list** | A + `products.view` | AdminProducts (25/pg); useProducts (100/pg) ×4 components | catalog_product **FULL SCAN**, catalog_collection **FULL SCAN**, media joins | **CRITICAL** | §7 HP-1 |
| 31 | POST | `/admin/products` | Create product | A + `products.manage` | productAdminService | catalog_product | LOW | |
| 32 | POST | `/admin/products/draft` | Create draft w/ permanent id | A + `products.manage` | ProductEditor | catalog_product | LOW | |
| 33 | GET | `/admin/products/next-id` | Deterministic id | A + `products.view` | ProductEditor | catalog_product (prefix scan) | LOW | |
| 34 | GET | `/admin/products/availability` | SKU/slug uniqueness | A + `products.view` | ProductEditor (debounced probe) | catalog_product (indexed sku/slug) | LOW | |
| 35 | GET | `/admin/products/metrics` | Status/flag counts | A + `products.view` | AdminProducts (on every reload) | catalog_product **2× full scans** | **HIGH** | §7 HP-3 |
| 36 | GET | `/admin/products/{id}` | Full admin record | A + `products.view` | useProduct / AdminProductDetail | catalog_product + collection scan | MEDIUM | full collections scan per view |
| 37 | PATCH | `/admin/products/{id}` | Full-field patch | A + `products.manage` | ProductEditor | catalog_product (+history) | LOW | + cache invalidation |
| 38 | POST | `/admin/products/{id}/assign` | Assign/unassign employee | A + `products.manage` | review detail | catalog_product | LOW | |
| 39–46 | POST | `/admin/products/{id}/` `approve`, `reject`, `publish`, `unpublish`, `archive`, `restore`, `change-id`, `duplicate` | Lifecycle transitions | A + `products.manage` | review UI, desk actions, editor | catalog_product | LOW each | canonical lifecycle — preserve |
| 47 | POST | `/admin/products/bulk` | Bulk status/field update | A + `products.manage` | AdminProducts bulk bar | catalog_product | MEDIUM | |
| 48 | POST | `/admin/products/{id}/review-flags/clear` | Clear blocking flags | A + `products.manage` | review detail | catalog_product | LOW | |
| 49 | GET | `/admin/products/{id}/publish-issues` | Live blocker list | A + `products.view` | ProductEditor (after save/actions) | catalog_product | LOW | |
| 50 | POST | `/products/{id}/submit-review` | Submit for review (shared admin/employee) | get_current_user + service check | ProductEditor, review panels | catalog_product | LOW | |
| 51–62 | GET/POST/PATCH | `/admin/categories` (list, `{id}`, create, patch, activate, archive, restore), `/admin/categories/{id}/subcategories` (POST), `/admin/subcategories/{id}` (PATCH, activate, archive, restore) | Taxonomy CRUD | A + `categories.*` | taxonomy pages | catalog_category | LOW-MEDIUM | list unpaginated |
| 63–71 | GET/POST/PATCH/POST/PUT | `/admin/collections` (list, `{id}`, create, patch, activate, pause, archive, restore), `PUT {id}/products` | Collections CRUD + assignment | A + `collections.*` | collection pages | catalog_collection | LOW-MEDIUM | |
| 72–78 | GET/POST/PATCH/POST | `/admin/offers` (list, `{id}`, create, patch, activate, pause, archive) | Offers CRUD | A + `offers.*` | offers pages | commerce_coupon | MEDIUM | full in-memory filter+paginate |
| 79 | GET | `/admin/customers` | Customer list (q search, ≤100) | **A+** (admin or employee) + `customers.view` | AdminCustomers | users, customer_profiles(+addresses,preferences), orders (batched agg) | MEDIUM | |
| 80 | GET | `/admin/customers/{id}` | Customer detail | **A+** + `customers.view` | AdminCustomerDetail | as above | LOW-MEDIUM | |
| 81 | GET | `/admin/employees` | Employee list (≤100) | A (no perm check) | EmployeeManagementContext + dashboard (**2 callers**) | users, employee_profiles | MEDIUM | duplicate fetch §7 HP-8 |
| 82–87 | POST/GET/PATCH/POST/PUT | `/admin/employees` (create), `/{id}` (get, patch), `/{id}/status` (POST used), `/{id}/reset-password`, `/{id}/permissions` | Employee lifecycle | A (no perm checks) | EmployeeManagementContext | users, employee_profiles | LOW | `PATCH {id}/status` alias unused |
| 88–92 | GET/POST/PATCH/DELETE/PUT | `/admin/marketing/media` (list, create, `{id}` get/patch/delete, `reorder`) | HOME_HERO backend curation | A + `media.*` | BackendHomeHeroPanel | media_marketing_media | LOW-MEDIUM | |
| 93 | POST | `/media/products/{id}/objects` | Product-scoped upload | A + `media.upload` | productMediaService | (object store) | LOW | |
| 94 | POST | `/media/register` | Persist MediaAsset + ProductMedia | A + `media.upload` | productMediaService | media_asset, product_media | LOW | idempotent by key |
| 95 | GET | `/media/assets` | Durable registry list | A + `media.upload` | AdminMediaLibrary | media_asset | **HIGH** | **no pagination** |
| 96 | GET | `/media/products/{id}/media-set` | Resolved product media | A + `media.upload` | productMediaService | media_asset, product_media | LOW | |
| 97 | GET | `/media/objects/{key}` (public serving) | Serve bytes | P | Admin thumbnails via media URL | (object store) | LOW | 1h browser cache |

### 6.3 Exposed but NOT called by the Admin frontend (verified zero callers)

| Endpoint family | Ops | Evidence of non-use | Classification |
|---|---|---|---|
| `/admin/returns` list/detail + 7 transitions (approve, reject, schedule-pickup, receive, inspect, refund/initiate, refund/complete) | 9 | `ordersApi.js:275-305` defines clients; grep = 0 call sites; `AdminReturns.jsx:83-93` derives returns from orders snapshot | DEAD-UNUSED (backend) / DUPLICATE (frontend derivation) |
| `/admin/employees/{id}/performance` GET/POST; PATCH/DELETE `/admin/employees/performance/{id}` | 4 | no functions in `employeesApi.js`; grep = 0 | DEAD-UNUSED |
| `/admin/employees/{id}/targets` GET/POST; PATCH/DELETE `/admin/employees/targets/{id}` | 4 | as above | DEAD-UNUSED |
| `/admin/employees/{id}/attendance` GET/POST; PATCH/DELETE `/admin/employees/attendance/{id}` | 4 | client functions exist (`employeesApi.js:174-190`); grep = 0 callers | DEAD-UNUSED |
| `/admin/employees/departments` CRUD (6) + `/admin/employees/sections` CRUD (6) | 12 | client functions exist; grep = 0 callers (departments/sections come from static `config/employeeDepartments.js` and payload strings) | DEAD-UNKNOWN (see §21) |
| `DELETE /admin/employees/{id}` | 1 | `apiAdminDeleteEmployee` exists; grep = 0 callers (no delete UI) | DEAD-UNUSED |
| `PATCH /admin/employees/{id}/status` | 1 | only POST variant used | LEGACY ALIAS (duplicate) |
| `GET /admin/activity` | 1 | AdminActivity uses `/audit/logs` instead | DUPLICATE of `/audit/logs` |
| `GET /admin/roles`, `GET /admin/roles/{id}` | 2 | static role catalogue; no caller | DUPLICATE vs `/roles` (§20 D-9) |
| `GET /admin/workflow/metrics` | 1 | alias of `/admin/products/metrics`; no caller | DUPLICATE |
| `GET /admin/settings/notifications`, `PATCH /admin/settings/notifications` | 2 | dedicated `notifications.py` implementation; **route-shadowed** by `admin.py` `/admin/settings/{section}` (admin router registered first in `router.py`) and no caller | DUPLICATE / SHADOWED |
| `POST /admin/settings/reset` (reset ALL) | 1 | `settingsRepository.resetToDefaults` exists; grep = 0 callers | DEAD-UNUSED |
| `GET /analytics/customers` | 1 | `apiAnalyticsTopCustomers` exists; grep = 0 callers; **contains N+1** (2 queries per row) | DEAD-UNUSED + latent N+1 |
| `GET /admin/products/availability`… *(used)* — see §6.2 | — | — | — |
| `GET /users`, `GET /users/{id}` (+health) | 2+1 | `apiAdminListUsers/apiAdminGetUser` exist; grep = 0 callers; **list has N+1** (3 queries per row) | DEAD-UNUSED + latent N+1 |
| `GET /roles`, `GET /roles/{id}`; `GET /permissions`, `GET /permissions/{code}` (+3 health) | 4+3 | adminApi functions exist; grep = 0 callers | DEAD-UNUSED |
| Legacy `/employees/*` aliases (hidden, 20 ops) | 20 | `include_in_schema=False`; grep = 0 frontend callers of `/employees` paths | LEGACY ALIASES |
| Media: `POST /media/objects` (generic), `DELETE /media/objects/{key}`, `GET /media/storage/status`, `GET /media/object-meta/{key}`, `POST /media/references/resolve` | 5 | client functions exist; grep = 0 callers (only product-scoped upload used; delete has no UI) | DEAD-UNKNOWN (delete is the dangerous one — §16) |
| `media_reviews.py` router | 1 (health) | stub module (8 lines) | DEAD-UNUSED |

Legend: **DEAD-UNUSED** = CONFIRMED no caller in `frontend/src`; **DEAD-UNKNOWN** = no caller today but plausibly intended for near-term use (documented contracts exist).

---

## 7. Database Load Audit

Severity per §29. Confidence: CONFIRMED (code-path traced end-to-end), STRONGLY INDICATED, POSSIBLE. **No production metrics were available; all ratings are static-analysis + local-runtime based.**

### HP-1 — `GET /admin/products` loads the entire catalogue per request — **DB LOAD: CRITICAL — CONFIRMED**

- Evidence: `backend/app/services/catalog/product_service.py:1414-1494` (`list_admin_products`): (a) `COUNT` over filtered subquery; (b) `select(ProductModel)` with **no `.limit()`** — every matching row, all ~60 columns (multiple JSONB: `highlights`, `specifications`, `colors`, `tags`, `history`, …) is hydrated; (c) `_registered_media_map` (extra join query, SAVEPOINT-wrapped); (d) `_collection_membership_names` → **`select(CollectionModel)` — the whole collections table — then Python rule evaluation per product** (`product_service.py:388-436`); (e) sort in Python; (f) slice `offset:offset+page_size`.
- Trigger: every AdminProducts query/filter/sort/page change (250ms debounce on search only — `AdminProducts.jsx:214-231`), **plus** `useProducts()` mounting (pageSize 100) in **AdminProductReview** (`AdminProductReview.jsx:65`), **AdminMarketingMedia** (`AdminMarketingMedia.jsx:75`), **ProductCatalogSelector** (`ProductCatalogSelector.jsx:134`), **ProductGroupReviewPanel** (`ProductGroupReviewPanel.jsx:43`). No shared cache ⇒ N components ⇒ N full-catalogue requests.
- Impact: cost grows with the **whole catalogue**, not the page. Each call = ≥3 queries + 2 full-table reads (products + collections) + O(products×collections) Python work.

### HP-2 — Admin Dashboard fires 7 uncached read/aggregate requests per load; employee list fetched twice — **DB LOAD: HIGH — CONFIRMED**

- Evidence: `AdminDashboard.jsx:63-90` — `Promise.all([loadBusinessMetrics(), loadSalesSeries(7), loadSalesByCategory(), loadRecentOrders(5), apiAnalyticsInventorySummary()])`, where `loadBusinessMetrics` = `/analytics/overview` + `/admin/employees?pageSize=100` (`adminDashboardService.js:35-53`), `loadSalesByCategory` = `/analytics/products?limit=100` (client-side grouping). Plus `EmployeeManagementContext.jsx:66-80` fetches `/admin/employees?pageSize=100` again whenever an admin token exists.
- `/analytics/overview` alone issues **6 separate full aggregates** (`analytics.py:64-118`): revenue sum, order count, customer count, product count+low-stock, pending-review count, cancelled count — none cached (fastapi-cache2 decorates public endpoints only; `grep @cache app/api/v1/*.py` shows products/categories/recommendations only).
- Event trigger: `PRODUCTS_CHANGED_EVENT` re-runs the entire `Promise.all` (`AdminDashboard.jsx:92-95`) — every product save/publish anywhere in the app reloads the whole dashboard.

### HP-3 — Catalogue metrics double-scan on every list interaction — **DB LOAD: HIGH — CONFIRMED**

- Evidence: `product_service.py:2459-2486` (`get_metrics`): `select(ProductModel.status)` (full column scan of all rows) + `select(ProductModel.review_flags) where status != ARCHIVED` (second full scan) + count query — Python counting. Endpoint `GET /admin/products/metrics` (`products.py:427-438`).
- Trigger: `AdminProducts.jsx:257-266` — `reloadMetrics()` runs on every `total` change, i.e. after every debounced search/filter/sort/page change. Each typing pause ⇒ 2 API calls (list + metrics) ⇒ ≥4 full-table reads.

### HP-4 — Order snapshot refetch (100 eager-loaded orders) on every admin orders/returns/customer/analytics navigation — **DB LOAD: HIGH — CONFIRMED**

- Evidence: `OrderContext.jsx:215-231` (`refreshAdminOrders` → `GET /admin/orders?pageSize=100`); called on mount by `AdminOrders.jsx:72`, `AdminReturns.jsx:84`, `AdminReturnDetail.jsx:57`; AdminAnalytics reads `allOrders` from the same context (`AdminAnalytics.jsx:15-16`). Backend eager-loads items + returns per order (`order_service.py:261-280, 1008-1058`) — large payload, repeated.
- Note: backend caps pageSize at 100 (`orders.py`), so the desk can also never page beyond the first 100 orders — functional gap (UNKNOWN whether acceptable: requires product decision).

### HP-5 — `GET /media/assets` unbounded — **DB LOAD: HIGH (growing) — CONFIRMED**

- Evidence: `media.py:518-529` — `select(MediaAssetModel).order_by(created_at.desc())` with **no LIMIT**; response includes per-row URL synthesis. Caller: `AdminMediaLibrary.jsx:109-118`. Every asset ever registered is returned on each library page load.

### HP-6 — Per-collection N+1 on taxonomy counts (latent; no admin caller today) — **DB LOAD: HIGH if ever wired — CONFIRMED code, POSSIBLE load**

- Evidence: `collection_service.py:598-612` (`taxonomy_product_counts`) → `_resolved_count` per collection → `_resolve_product_ids` → for RULE_BASED: **two** full published-product queries (`_rule_product_ids` id-scan + full-row re-fetch, `collection_service.py` `_rule_product_ids`), for MANUAL: `_label_match_product_ids` (another product scan). Total ≈ 1+3C queries for C collections.
- Endpoints: `GET /admin/taxonomy/product-counts`, `GET /admin/taxonomy/metrics`, and public `GET /collections` (same helper). **Admin frontend callers: 0** (functions exist in `collectionsApi.js:118-127`; grep = 0 call sites).

### HP-7 — Latent N+1s in unused admin directories — **DB LOAD: MEDIUM (latent) — CONFIRMED code, POSSIBLE load**

- `GET /users` (`users.py:66-124`): 3 extra queries **per user row** (profile, employee-profile, roles) ⇒ up to 300 queries per 100-row page. No caller.
- `GET /analytics/customers` (`analytics.py:151-198`): 2 extra queries per top-customer row. No caller.

### HP-8 — Duplicate employee-list fetch per admin session — **DB LOAD: MEDIUM — CONFIRMED**

- Evidence: `EmployeeManagementContext.jsx:66-80` + `adminDashboardService.js:39-53` — `/admin/employees?pageSize=100` executed twice whenever the dashboard loads (and the provider refetches on `admin?.id` change).

### HP-9 — Offers/collections/categories lists: in-memory pagination — **DB LOAD: MEDIUM — CONFIRMED**

- `/admin/offers`: `coupons.py:313-360` loads **all** matching coupons into memory (then computes tiles + slices page in Python). Fine at small catalogue sizes; degrades linearly.
- `/admin/categories`, `/admin/collections`: full-list responses, no pagination (`categories.py` `admin_list_categories`, `collections.py` `admin_list_collections`) — small tables today.

### HP-10 — Admin product detail / save paths scan the whole collections table — **DB LOAD: MEDIUM — CONFIRMED**

- Evidence: `get_admin_product` → `_collection_membership_names([p])` still does `select(CollectionModel)` (all rows) per view (`product_service.py:1321`); same on create/update paths (`:540, :549, :1321, :1385-1386`).

### Explicitly checked and NOT found (negative results, evidence)

- **No polling/timers** in admin (§18).
- **No hidden-component fetching**: route-level code splitting (lazy imports) means only the active page's components fetch; modal-mounted selectors (ProductCatalogSelector) do fetch on open — counted in HP-1.
- **No keystroke-unthrottled search**: AdminProducts (250ms), AdminCustomers (submit/blur-driven `q`), AdminOrders (server `q` param via snapshot params) — verified.
- **No read-path writes to audit log** (read ops do not create logs — trivially true because nothing writes the log at all, §19).
- **Cache bypasses**: admin endpoints never use the response cache (by design — admin data must be fresh); consequence is that all admin aggregates hit PostgreSQL directly. Not a bug; a load characteristic.

---

## 8. API Load Audit

Request-frequency model (no production metrics — static analysis of triggers):

| API | Automatic/refetch behavior | Pagination | Response size risk | Duplicate? | Actually used? | Load |
|---|---|---|---|---|---|---|
| GET /admin/products | per mount ×N components; per filter/sort/page; per product event (via review panels re-render? no — only mount) | server (but full in-memory scan) | HIGH (full records incl. history) | no | yes | CRITICAL |
| GET /admin/products/metrics | after **every** list reload | n/a | small | `/admin/workflow/metrics` alias | yes | HIGH |
| GET /analytics/* (5 used) | per dashboard load + per PRODUCTS_CHANGED_EVENT | n/a | small-medium | overlaps client-side analytics engine (§20 D-2) | yes | HIGH |
| GET /admin/orders?pageSize=100 | per navigation to Orders/Returns/ReturnDetail; manual refresh after every lifecycle op | server cap 100 | **very large** (eager items+returns+customer) | no | yes | HIGH |
| GET /admin/employees?pageSize=100 | provider mount + dashboard + after each employee mutation | server cap 100 | medium | fetched twice/session | yes | MEDIUM |
| GET /media/assets | per media library mount | **none** | grows unbounded | no | yes | HIGH |
| GET /admin/customers?pageSize=100 | per customers mount; after mutations | server | medium (addresses stripped in list) | no | yes | MEDIUM |
| GET /admin/offers | per mount + per filter change (client filters server params) | server (in-memory) | medium | no | yes | MEDIUM |
| GET /audit/logs?pageSize=100 | per activity mount | server ≤200 | small | `/admin/activity` duplicate | yes | LOW |
| GET /admin/settings | per settings mount | n/a | small | `/admin/settings/notifications` shadowed duplicate | yes | LOW |
| POST /media/register, /media/products/{id}/objects | per upload action | n/a | small | generic `/media/objects` upload unused | yes | LOW |
| GET /users, /roles, /permissions, /analytics/customers | — | server | — | parallel systems exist | **no** | 0 (dead) |
| /admin/returns/* (9) | — | server | — | returns derived client-side | **no** | 0 (dead) |

APIs with multiple unrelated responsibilities: `POST /media/register` (object verification + asset row + product mapping + primary demotion + cache invalidation — acceptable but dense); `GET /admin/products` (list + metrics-adjacent fields incl. review, reviewFlags, history per row — oversized rows for a table view).

APIs returning more data than needed: `GET /admin/products` (full `history` JSONB per row in a 25/100-row list); `GET /admin/orders?pageSize=100` (full items + returns + customer per order for a table view).

---

## 9. Dashboard Audit (deep)

`/admin` = `AdminDashboard.jsx`. Widgets and cost (all load immediately on mount; **none lazy-loaded**; no polling):

| Widget | Data source | API call(s) | Refresh behavior | DB work (backend) | Duplicates another screen? | Daily-ops value | Load | Needed for daily ops? |
|---|---|---|---|---|---|---|---|---|
| 9 KPI tiles (Revenue, Total orders, Customers, Products, Low stock, Out of stock, Pending review, Cancelled, Avg order) | `loadBusinessMetrics` + `apiAnalyticsInventorySummary` | GET /analytics/overview; GET /analytics/inventory-summary; GET /admin/employees?pageSize=100 | on mount; on PRODUCTS_CHANGED_EVENT; on Retry | 6 aggregates + full product aggregate + employee list | Yes — low-stock/out-of-stock duplicate the Inventory screens & `/analytics/inventory-summary`; products count duplicates Products metrics | High (headline) | HIGH | Likely yes (revenue/orders/low-stock) |
| Sales overview chart (7-day) | `loadSalesSeries(7)` | GET /analytics/sales?days=7 | on mount; events | daily group-by over orders | overlaps Analytics ▸ sales | Medium | MEDIUM | Probably |
| "Where it sold" category bars | `loadSalesByCategory` = **top-100 products regrouped client-side by id prefix** | GET /analytics/products?limit=100 | on mount; events | top-products join+group over order_items | approximates Analytics ▸ products | Low-medium (derivation is a proxy, not a true category aggregate) | MEDIUM-HIGH (limit-100 aggregate) | Review |
| Recent orders table (5) | `loadRecentOrders(5)` | GET /admin/orders?pageSize=5 | on mount; events | paginated + eager items | duplicates Orders screen | Medium | LOW-MEDIUM | Probably |
| Stock alerts list (6) | `apiAnalyticsInventorySummary().items` | (same call as KPI) | on mount; events | full-table aggregate over catalog_product.stock | duplicates Low-stock screen (which is localStorage!) | Medium | MEDIUM | Review |

Dashboard-specific findings:
1. `loadBusinessMetrics` derives `employeesPresent` by counting ACTIVE employees from a 100-row employee fetch — a DB-borne count delivered as 100 rows (`adminDashboardService.js:44-49`). UNKNOWN whether >100 employees is planned (then the count silently truncates).
2. The employee fetch here is **separate from and redundant to** `EmployeeManagementProvider`'s fetch (HP-8).
3. The category chart's grouping key is `productId.split("-")[0]` (id prefix, e.g. "PF") — evidence: `adminDashboardService.js:69-79`. With the PF- prefix scheme this yields one bucket, i.e. **the widget may be functionally degenerate** (UNKNOWN — requires runtime data verification).
4. Full-dashboard reload on every `PRODUCTS_CHANGED_EVENT` (product saved anywhere) — HP-2.

---

## 10. Product Management Audit

Canonical lifecycle (observed; preserve): `DRAFT → PENDING_REVIEW → IN_REVIEW → APPROVED → PUBLISHED ⇄ (UNPUBLISH→DRAFT)`, `ARCHIVED ⇄ restore→DRAFT`; approval gates publish; review flags can block; assignment routes work to employees; ids are permanent (`PF-<CAT>-…`, `next-id` deterministic; `change-id` guarded).

| Capability | Implementation | Endpoints | Load notes | Necessity for production workflow |
|---|---|---|---|---|
| List/search/filter/sort/paginate | AdminProducts (server-driven) | GET /admin/products | HP-1 CRITICAL | Essential |
| Metrics tiles | reload per list change | GET /admin/products/metrics | HP-3 | Useful; should not rescan per keystroke (rec.) |
| Create (runtime id) / draft (permanent id) | ProductEditor | POST create, /draft, GET next-id | LOW | Essential |
| Identity pre-flight | debounced availability probe (admin only) | GET availability | LOW (indexed) | Essential (correctness) |
| Edit | full-field PATCH | PATCH {id} | LOW + cache invalidation | Essential |
| Review queue (admin review of employee drafts) | UnifiedReviewQueue + detail + draft/group panels | GET list (pageSize 100) + lifecycle ops | re-fetch per mount (HP-1) | Core to the observed workflow |
| Approve / reject / submit-review | lifecycle ops | POST ops | LOW | Essential |
| Publish / unpublish (+ server publish-issues) | editor + detail | GET publish-issues, POST publish/unpublish | LOW | Essential |
| Archive / restore | desk + detail | POST ops | LOW | Essential |
| Assign employee | review detail | POST assign | LOW | Needed for the employee workflow (B-14 notes employee side is a stub) |
| Duplicate / change-id | detail/editor | POST ops | LOW | Convenience — REVIEW |
| Bulk ops (publish/archive/feature) | AdminProducts bulk bar | POST /admin/products/bulk | MEDIUM (per-id work server-side) | Useful — KEEP |
| Review flags clear | review detail | POST review-flags/clear | LOW | Tied to flag system — KEEP |
| Product history/activity | `history` JSONB on product + session activity slice | (embedded in admin records) | Adds list payload weight | REVIEW (display) |

Duplication: **`/admin/products/metrics` vs `/admin/workflow/metrics`** (same `get_metrics`; alias has no caller). `useProducts()` (full catalogue into memory) vs AdminProducts' server-paginated list — two product-listing mechanisms in one portal.

What is actually required to add products regularly (observed, evidence-based): create/draft → edit → media attach (F-A11) → submit-review → approve → publish; plus list/search and metrics. Everything else (duplicate, change-id, bulk, flags UI) is convenience layering — recommendation REVIEW/SIMPLIFY, decision left to owner.

---

## 11. Media Management Audit

Two systems coexist (§20 D-4):

1. **Durable pipeline (backend, DB-backed):** upload (`POST /media/products/{id}/objects` or generic `/media/objects`) → register (`POST /media/register` → `media_asset` + `product_media` rows, idempotent, primary demotion) → read (`GET /media/products/{id}/media-set`) → served from `/media/objects/{key}` (1h cache). Used by ProductMediaManager / AdminProductMedia (F-A11) and the "Durable registry" panel of the library (F-A12). **This is the canonical media architecture — preserved.**
2. **Session register (frontend memory):** `mediaStore.js` (in-memory only, explicitly "no localStorage authority", `mediaStore.js:260-298`) behind `mediaRepository` + `useMedia*` hooks; powers the review queue (F-A14), product-mapping desk (F-A16), media detail (F-A17) and parts of the library/marketing pages. Records vanish on reload; never reach the DB.

Findings:
- **Media review workflow is not durable** (F-A14): approving/rejecting in `/admin/media/review` mutates memory only. Backend `media_reviews.py` is a health stub; `media_media_review` table has no columns. Employee uploads enter the session register of *their own tab* and are invisible to admins after reload. (Consistent with blocker B-02 which resolved *marketing* media but not the *review* workflow.)
- **Duplicate media management surfaces**: library (F-A12) + upload desk (F-A13) + product-mapping (F-A16) + per-product manager (F-A11) + marketing board (F-A15) — five screens over two backends.
- **Unbounded registry read** (HP-5).
- **Dangerous delete (no cascade):** `DELETE /media/objects/{key}` removes storage bytes only; `media_asset`/`product_media`/`media_marketing_media` rows keep pointing at the missing key (documented in code: "no cascade and no garbage collection in this phase", `media.py:531-553`). Mitigating fact: the endpoint currently has **no frontend caller** — risk is latent until any delete UI is wired.
- **Marketing/product coupling:** marketing scope on the upload desk is explicitly blocked (`MARKETING_MEDIA_BLOCKER`, `mediaApi.js:279-286`) — correct per the "never silently promote product uploads to marketing" rule; BackendHomeHeroPanel instead references canonical hero keys (`hero/hero001.avif`… hardcoded options, `BackendHomeHeroPanel.jsx:33-40`).
- Object URL handling is centralized (`VITE_MEDIA_URL_PREFIX`), no `/images/...` bypass found in admin surfaces (spot-checked `mediaPaths.js`, `PratikshyaImage.jsx`).
- Unnecessary frontend media fallbacks: the session register doubles as a fallback for storefront hero when DB is unavailable (documented in `BackendHomeHeroPanel.jsx:1-10`) — acceptable resilience, but it is also the mechanism that makes the duplicate system persist.

---

## 12. Employee Management Audit

Backend: `employees.py` (954 lines) — `/admin/employees` CRUD + departments + sections + attendance + targets + performance; **legacy `/employees/*` alias block (20 hidden routes)**; service file contains **two `EmployeeService` classes** (line 88 and line 556 — the second shadows the first; effective status vocabulary is `{ACTIVE, SUSPENDED, DEACTIVATED}` vs the shadowed `{ACTIVE, PENDING, ON_LEAVE, SUSPENDED, INACTIVE, DEACTIVATED}`) — evidence `employee_service.py:232-252` vs `:678-691`.

Frontend (Admin): list + create + edit + detail, driven by `EmployeeManagementContext` (fetch pageSize 100 on admin-token presence; local mirrors for status/suspend/permissions actions which then call the API).

| Capability | Wired? | Notes |
|---|---|---|
| Create employee (generated PF- id, mustChangePassword) | ✅ | POST /admin/employees |
| Edit profile/department/section | ✅ | PATCH (departments/sections as strings from static config) |
| Activate/Suspend/Deactivate | ✅ | POST {id}/status (effective allowed set excludes PENDING/ON_LEAVE/INACTIVE — see shadowing note) |
| Reset password | ✅ | POST reset-password |
| Permissions (PUT matrix) | ✅ | PUT {id}/permissions |
| Delete employee | UI absent | DELETE endpoint exists, no caller |
| Review workload / assignments | absent | product assignment exists on product side; employee-side inbox is a stub (blocker B-14) |
| Attendance admin views | absent | endpoints + client functions exist, 0 callers |
| Targets / performance admin | absent | endpoints exist, 0 callers |
| Departments/sections CRUD | absent (static config) | endpoints exist, 0 callers |

Load: employee list fetched twice per admin session (HP-8); all calls bounded (≤100 rows); **no stats/dashboards on employees inside the Admin portal** (the role dashboards belong to the Employee portal — out of scope). Employee statistics views therefore contribute **no** admin DB load today.

Essential vs excessive (recommendation): create/edit/status/reset/permissions = essential; the 24 unused admin endpoints (attendance/targets/performance/departments/sections/delete) = DEAD-UNKNOWN; decide whether the Admin portal should ever manage them or whether they belong to the Employee portal only.

---

## 13. Marketing Audit

Three coexisting systems (evidence §11 and below):

| System | Storage | Admin surface | Storefront consumer | Status |
|---|---|---|---|---|
| S1: Backend marketing media (B-02) | `media_marketing_media` (real table + migration `c7d8e9f0a1b2`) | `BackendHomeHeroPanel` (CRUD + reorder; placement fixed HOME_HERO) | `GET /marketing/hero` via `/home` (explore_service fallback to canonical 5 heroes) | **Authoritative** |
| S2: Session media register (marketing records) | tab memory (`mediaRepository`) | AdminMarketingMedia board, media library marketing scope | same-tab UI only | Ephemeral duplicate |
| S3: Placement→product curation | tab memory (`marketingPlacementRepository`) | AdminMarketingMedia product selectors, editorial carousels | same-tab UI only | Ephemeral duplicate |

Findings:
- Banners/offers: offers (coupons) are managed under F-A20 and surfaced via storefront `/offers` — single system, fine.
- Reordering: backend `PUT /admin/marketing/media/reorder` (S1) and in-memory move (S2) — duplicate mechanisms.
- Scheduling: **no scheduling exists** (activation is boolean `isActive`); settings offers section has `defaultDurationDays` but no scheduling engine — do not assume one.
- Marketing analytics: **none** (no click/impression endpoints anywhere — verified `marketing_media.py`, `explore.py`).
- The AdminMarketingMedia page mixes S1+S2+S3 and `useProducts()` (full catalogue fetch, HP-1) on mount.

Recommendation (audit-only): consolidate on S1; treat S2/S3 as REMOVE-DEFER candidates. Decision: USER DECISION REQUIRED.

---

## 14. Order / Sales / Inventory Audit

**Orders (KEEP, simplify load):** AdminOrders + detail + invoice; 13 lifecycle ops; fulfilment assignment. All admin order endpoints authenticate admin tokens but perform **no permission checks** (§16). Reads: snapshot pattern (HP-4). Status changes possible via (a) dedicated transition ops, (b) generic `/status`, (c) `/force-status` (super-user escape hatch with reason) — three overlapping mechanisms (§20 D-11). Customer PII is included (name/address/phone) — appropriate for fulfilment; response is admin-gated.

**Sales reporting:** dashboard widgets + `/analytics/*` (HP-2/HP-3 evidence) + client-side Analytics workspace (derives from the 100-order snapshot — so any sales figure there is bounded to the latest 100 orders; evidence `AdminAnalytics.jsx:15-24`, `analyticsService.getAnalyticsSnapshot`).

**Inventory (BROKEN as production feature):** the six `/admin/inventory*` screens run on `InventoryContext` → `services/inventory/inventoryRepository.js` → **localStorage**; `inventoryApi.js` every function returns `{ok:false, error: "…backend inventory tables do not have the required columns…"}` (evidence `inventoryApi.js:1-38`); backend inventory models are empty stubs and the routers are health-only (`docs/backend-blockers.md` B-01 re-verified). Additionally `InventoryDashboardPage.jsx` calls `useEmployeeAuth()` inside the Admin portal (role-dependent rendering in an admin-only surface — works because guards force SUPER_ADMIN, but it is cross-portal coupling). The only real inventory numbers in Admin come from `catalog_product.stock` aggregates (`/analytics/inventory-summary`, dashboard low-stock tile).

**Low-stock alerts:** only the dashboard tile + summary endpoint; `/admin/inventory/low-stock` is localStorage-based. No notifications exist (blocker B-10 — correctly not invented).

**Refunds:** exist only inside the unused `/admin/returns/refund/*` ops; no payment-provider integration wired in Admin (payments router is customer-facing sessions).

---

## 15. Customer Management Audit

- Admin can access: identity (name/email/phone/status), profile (tier, points), addresses (detail view only — list view strips them, `customer_service.py:316`), derived orderCount + lifetimeSpend (batched aggregate, `customer_service.py:296-300` + `_order_aggregates_for`).
- Endpoints: `GET /admin/customers` (q search **server-side**, paginated ≤100), `GET /admin/customers/{id}`. Evidence `customers.py:150-232`.
- Bulk loading: bounded to 100/page; aggregates batched (no N+1). Load MEDIUM.
- Permissions: uses `get_current_user` + `user_type in (admin, employee)` + `require_permission_for_user("customers.view")` — i.e. **employees can also read the customer directory** (by design; note the inconsistency with the `get_current_admin` pattern used elsewhere, §16).
- Sensitive exposure: list returns email/phone; no password/payment data in DTOs (verified `AdminCustomerResponse` schema). No PII is reproduced in this document.
- Frontend: `AdminCustomers.jsx` requests pageSize 100 and does client-side filtering on top of the server `q` (server-side search exists and is used for the `q` field). Pagination UI beyond 100 is absent (UNKNOWN if intentional).

---

## 16. RBAC / Authentication / Authorization Audit

### 16.1 Verified at runtime (no DB needed for auth rejection)

| Check | Result |
|---|---|
| 20 sampled admin endpoints without token (`/admin/settings`, `/admin/activity`, `/admin/roles`, `/admin/orders`, `/admin/products`, `/admin/customers`, `/admin/employees`, `/admin/marketing/media`, `/analytics/overview|sales|customers|inventory-summary`, `/audit/logs`, `/users`, `/roles`, `/permissions`, `/media/assets`, `/admin/offers`, `/admin/returns`, `/admin/taxonomy/metrics`) | **all → 401** (CONFIRMED, local run 2026-09-10) |
| Public endpoints (`/marketing/hero`, `/products`) | reachable without token (500 here only because no PostgreSQL in sandbox) |
| `/media/object-meta/...` | 404 without auth (public by design) |

Authorized-path (403) behavior **requires a database** and was **not verifiable in this sandbox** — UNKNOWN — REQUIRES RUNTIME/PRODUCTION VERIFICATION for: customer-token→403, employee-token→403 on admin surfaces, SUPER_ADMIN-vs-ADMIN role enforcement.

### 16.2 Static findings (evidence; no changes made)

| # | Finding | Severity | Evidence |
|---|---|---|---|
| S-1 | **Admin order endpoints have no permission checks** — docstrings claim "`orders.view`" but no `require_*` call exists in `orders.py` | HIGH (privilege breadth inside admin surface) | `grep -c require_ app/api/v1/orders.py` = 0; `admin_get_order` body (`orders.py:459-470`) |
| S-2 | **Admin employee endpoints have no permission checks** (one import only) — any `user_type=admin` account can create/delete employees, reset passwords, change permission matrices | HIGH | `employees.py` routes all `Depends(get_current_admin)` only |
| S-3 | **Analytics, audit, users, roles, permissions routers: surface-guard only** — fine for reads of aggregates, but `/users` exposes the full user directory (emails/phones) to any admin-token holder | MEDIUM | `analytics.py`, `audit.py`, `users.py`, `roles.py`, `permissions.py` (0 `require_*` calls) |
| S-4 | **No-role admin fallback**: `require_admin_permission` returns success when the admin has **no role rows** (documented compatibility path) — combined with S-1/S-2 this means a minimally-provisioned admin account has effectively full admin power | HIGH (by design, but broad) | `dependencies.py:210-232` |
| S-5 | **Frontend/back-end role mismatch**: frontend only admits SUPER_ADMIN to `/admin/*`; backend admits any `user_type="admin"` for most endpoints — two different authorization models for the same portal | MEDIUM (defense-in-depth gap) | `AdminProtectedRoute.jsx` vs §16.2 S-1..S-3 |
| S-6 | **Dual role systems**: static `BUILT_IN_ROLES` (admin.py) vs DB RBAC tables vs fallback merge in `get_user_roles_and_permissions` — permission answers depend on which rows exist | MEDIUM | `dependencies.py:139-180`; `admin.py:BUILT_IN_ROLES` |
| S-7 | **`/admin/customers` accepts employee tokens** (admin-or-employee by design) — inconsistent with every other admin read | LOW (documented intent) | `customers.py:168-186` |
| S-8 | **Shadowed duplicate notifications endpoints** with *different* permission rules (dedicated one allows admin-or-employee + `settings.view`; generic PATCH requires SUPER_ADMIN). Currently unreachable (registration order); if route order changes, authorization silently changes | MEDIUM | `notifications.py:58-77` vs `admin.py:268-300`; `router.py` ordering |
| S-9 | **DELETE /media/objects** guarded by `media.delete` but **no ownership/usage check and no cascade** — a permitted delete can silently break product/marketing imagery | MEDIUM (data integrity) | `media.py:530-553` |
| S-10 | Admin JWTs in localStorage (scope-separated). Standard SPA tradeoff; XSS would expose admin tokens | LOW (accepted pattern; note only) | `apiClient.js` TOKEN_KEYS |
| S-11 | Login rate limiting exists for all three sign-in endpoints (`@limiter.limit` in `auth.py:120,214,350`) | positive | — |
| S-12 | `docs/openapi.json` is stale (237 vs 285 live operations; missing analytics/audit/users/roles/permissions/media/marketing blocks) — misleading security review surface | LOW (docs) | §6.1 counts |

Expected-behavior matrix (expected, per spec): unauthenticated → 401 ✅ (runtime-verified); authenticated-but-unauthorized → 403 ⚠️ only enforced via user_type + (partially) permissions; authorized → 200 ✅. Customer isolation: customer tokens rejected by `get_current_admin` (403) — code-verified; runtime 403 verification pending DB.

---

## 17. Admin State / Frontend Performance Audit

- **No data-fetching library** — every read is a hand-rolled `useEffect`. Consequences observed: duplicate identical requests (employee list ×2; `/admin/products` once per `useProducts()` consumer), no cross-component cache, no request cancellation on unmount race except ad-hoc `cancelled` flags (present in most pages — good discipline).
- **Global snapshot stores**: `OrderContext` (orders + admin snapshot), `EmployeeManagementContext`, `InventoryContext` (localStorage), `WorkforceContext` (localStorage), `catalogRepository` (in-memory product register fed by `useProducts`), `mediaRepository` (session register), `settingsRepository` (server reads). Seven overlapping "stores" — duplication is structural, not accidental.
- **Cross-tab sync listeners**: `window.addEventListener("storage", …)` in media/placement/employee/activity repositories — these re-read memory on any storage event; cheap, but they exist even though the underlying stores are memory-only (`mediaStore.js` "no localStorage authority") — vestigial.
- **Expensive derived data**: `AdminProducts` maps rows through `catalogRepository.find` + per-row cover resolution + `useProductMediaSummaries` per render set (client-side, fine); `AdminAnalytics` recomputes the whole snapshot on `inventory.revision`/`workforce.revision` changes even though those stores never change server data (harmless but wasted work).
- **Stale-state risks**: OrderContext snapshot is 100-bounded; a filter/search in AdminOrders filters only the snapshot — silently hides older orders (functional, not perf).
- **Component remounts**: route-level lazy loading; no keep-alive; every navigation re-mounts and refetches the snapshot patterns described in §7.
- **Mount-time request fan-out summary (per page, first paint):**

| Page | Requests on mount |
|---|---|
| `/admin` (dashboard) | 7 (overview, employees ×2 incl. provider, sales, products-top-100, orders-status, orders-5, inventory-summary) |
| `/admin/products` | 2 (list 25, metrics) |
| `/admin/products/review` | 1+ (list 100 via useProducts; + detail lifecycle calls on interaction) |
| `/admin/media` | 1 (assets) |
| `/admin/media/marketing` | 2+ (backend hero list; products 100 via useProducts) |
| `/admin/orders` | 1 (orders 100) |
| `/admin/returns` | 1 (orders 100) |
| `/admin/analytics` | 0 direct (uses OrderContext snapshot; triggers nothing new if warm, else 1) |
| `/admin/customers` | 1 (customers 100) |
| `/admin/employees` | 0 extra (provider already fetched) |
| `/admin/activity` | 1 (audit logs 100) |
| `/admin/settings` | 1 (settings) |
| `/admin/products/:id/edit` | 1–3 (product, next-id when creating, publish-issues after save; availability probes debounced) |

---

## 18. Polling / Realtime Audit

**Grep evidence** (`setInterval|refetchInterval|addEventListener("focus"|visibilitychange|EventSource|WebSocket` across `frontend/src`): only two hits, both storefront: `HeroCarousel.jsx:206` (setInterval, homepage carousel) and `SareeEditCarousel.jsx:323` (visibilitychange). **Zero in Admin.**

| Mechanism | Feature | Frequency | Endpoint hit | Necessary? | DB/API impact |
|---|---|---|---|---|---|
| `setInterval` | HeroCarousel | ~5s | none (image rotation) | N/A | none (storefront, no API) |
| Event: `PRODUCTS_CHANGED_EVENT` | Dashboard full reload | per product mutation | 7 requests (HP-2) | Partially — only KPI tiles need it | MEDIUM-HIGH over a busy session |
| Event: `MEDIA_CHANGED_EVENT` / `storage` | media/placement repositories re-read | per media write | none (memory) | Yes (in-tab consistency) | none |
| Event: `ACTIVITY_CHANGED_EVENT` | activity contexts re-read | per write | none (memory) | Yes (but diary is memory-only) | none |
| Focus/visibility refetch | **absent** in admin | — | — | — | — |
| WebSocket/SSE | **absent** | — | — | — | — |

Conclusion: **the reported DB load cannot be attributed to polling.** It is navigation-, event- and mount-driven (§7).

---

## 19. Audit Log / Activity Log Audit

- **Single-log architecture (preserve per instructions):** `ActivityLogModel` → table `audit_activity_log`; docstring: "ONE log for all mutations… never create a second log" (`models/audit/activity_log.py`).
- **Readers:** `GET /audit/logs` (filterable, paginated ≤200, index-suggested columns are indexed — migration `z1a2b3c4d5e6` adds the diary columns; model declares `index=True` on actor/target/action) and `GET /admin/activity` (latest 200, silently returns `[]` on query failure — `admin.py:395-440`).
- **Writers: NONE.** `grep -rn "ActivityLogModel(" backend/app` → only the class definition and readers. No service, router, middleware, or worker inserts rows. `app/services/audit/audit_service.py` is a 4-line empty shell.
- **Frontend diary:** `activityService.recordActivity` writes to an **in-memory Map** (`readStorage/writeStorage` are Map-backed — `activityService.js:8-11, 257-300`), capped at 200 entries, dispatching `ACTIVITY_CHANGED_EVENT`. Every mutation flow (products, media, employees, offers, settings, inventory, analytics export) calls it — all writes evaporate on reload and never reach the server.
- **Consequences:** `/admin/activity` and `/audit/logs` always return empty sets in production (page renders "No activity recorded yet"); the per-product activity panel on `AdminProductDetail` likewise always empty; the "who did what" history column embedded in product records (`history` JSONB, written by `_append_history` in product_service) is the **only durable change history in the system**.
- Retention: none (nothing is written). Indexes: present per model columns. Read cost: LOW (bounded 200, indexed order-by created_at — **note:** `created_at` index not declared; order-by relies on default; table is empty so UNKNOWN — REQUIRES RUNTIME/PRODUCTION VERIFICATION once writers exist).
- Same event logged multiple times: impossible today (no writes). Read ops creating logs: no.
- Dashboards querying large history tables: no (nothing to query).

Classification: **BROKEN pipeline** (end-to-end), **KEEP** the single-log architecture. Whether backend write hooks should be added is a USER DECISION (it is the documented blocker B-09).

---

## 20. Duplication Audit

| # | Canonical | Duplicate | Evidence of usage | Safe to remove/defer? (audit opinion) | Impact of removal |
|---|---|---|---|---|---|
| D-1 | Product catalogue data: `catalog_product` via `GET /admin/products` | `useProducts()` in-memory register (`catalogRepository`) holding up-to-100-row snapshots in every consuming tab | Both used simultaneously on review/marketing pages | The *fetch-per-mount* pattern can be deferred/deduped; register itself feeds many UIs | Low if deduped via shared cache |
| D-2 | Backend analytics (`/analytics/*`) | Client-side `analyticsService.getAnalyticsSnapshot` over the 100-order snapshot (`AdminAnalytics`) | Both used (dashboard vs analytics page) | Decide one engine | Numbers may differ between the two screens today (bounded vs full data) — USER DECISION |
| D-3 | Marketing: backend `media_marketing_media` (BackendHomeHeroPanel) | Session-register marketing board + placement→product curation (`mediaRepository`, `marketingPlacementRepository`) | AdminMarketingMedia renders both | S2/S3 deferrable after S1 parity | Storefront unaffected (reads S1) |
| D-4 | Media: durable `media_asset`/`product_media` registry | Session media register powering review queue/mapping/detail | AdminMediaLibrary shows both explicitly ("staging desk" vs "durable registry") | Review/mapping need backend or deferral | Employee→admin media handoff currently non-durable (F-A14 broken) |
| D-5 | Settings: `admin.py` `/admin/settings/{section}` | `notifications.py` `/admin/settings/notifications` (shadowed by registration order) | No caller of the shadowed pair | Remove/defer duplicate | None (unreachable) |
| D-6 | `GET /admin/products/metrics` | `GET /admin/workflow/metrics` (alias, 0 callers) | — | Yes | None |
| D-7 | `/admin/employees*` (used) | 20 hidden `/employees/*` aliases (0 callers) + first `EmployeeService` class shadowed in-file (≈470 dead lines) | — | Yes | None |
| D-8 | `GET /audit/logs` (used) | `GET /admin/activity` (0 frontend callers) | — | Decide one read API | None |
| D-9 | Roles: DB RBAC (`/roles`) | Static `BUILT_IN_ROLES` (`/admin/roles`) + fallback merge | Both exist; neither consumed by Admin UI | Decide the RBAC source of truth | Affects S-4/S-6 |
| D-10 | Live API surface (285 ops) | `docs/openapi.json` (237 ops, stale) | Docs-only | Regenerate | Documentation accuracy |
| D-11 | Order status: 10 dedicated transition endpoints | Generic `/status` + `/force-status` overlap the same transitions | All three families have callers | Consolidation candidate — do not remove without flow review | Low if consolidated deliberately |
| D-12 | Returns: `/admin/returns/*` API family (9 ops, 0 callers) | Client-side derivation from orders snapshot (used) | `AdminReturns.jsx:83-93` | Decide: wire the API or drop it | Wired API gives correct, unbounded data; derivation is capped at 100 orders |

---

## 21. Dead / Unused Feature Audit

**CONFIRMED UNUSED (zero call sites found in `frontend/src`; endpoint mounted):**

Backend (33 operations + 20 legacy aliases + 5 media + 1 stub router):
1. `/admin/returns` family — 9 ops (list, detail, approve, reject, schedule-pickup, receive, inspect, refund/initiate, refund/complete)
2. `/admin/employees` performance — 4 ops; targets — 4 ops; attendance — 4 ops (client fns exist, 0 callers)
3. `/admin/employees/departments` — 6 ops; `/admin/employees/sections` — 6 ops (client fns exist, 0 callers)
4. `DELETE /admin/employees/{id}`; `PATCH /admin/employees/{id}/status`
5. `GET /admin/activity`; `GET /admin/roles`(+`{id}`); `GET /admin/workflow/metrics`; `POST /admin/settings/reset`
6. `GET/ PATCH /admin/settings/notifications` (shadowed)
7. `/users`, `/users/{id}`; `/roles`, `/roles/{id}`; `/permissions`, `/permissions/{code}` (+3 health)
8. `GET /analytics/customers` (+`/analytics/health`)
9. Legacy `/employees/*` — 20 hidden ops
10. Media: `POST /media/objects` (generic upload), `DELETE /media/objects/{key}`, `GET /media/storage/status`, `GET /media/object-meta/{key}`, `POST /media/references/resolve`; `media_reviews.py` router (health stub)
11. Frontend client functions with zero callers: `apiAdminListUsers/GetUser`, `apiListRoles/GetRole/apiListPermissions`, `apiAnalyticsTopCustomers`, `apiAdminListReturns/GetReturn`+7 return actions, `apiAdminListDepartments/*`, `apiAdminListSections/*`, attendance fns, `apiAdminDeleteEmployee`, `apiDeleteMediaObject`, `apiUploadMediaObject`, `apiGetMediaStorageStatus`, `apiGetMediaObjectMeta`, `apiResolveMediaReferences`, `settingsRepository.resetToDefaults/updateSetting`, `apiAdminGetTaxonomyMetrics/GetTaxonomyProductCounts`, `adminDashboardService` legacy sync exports (`getBusinessMetrics`, `getSalesSeries`, … explicitly "kept for compatibility; return empty").

Frontend UI with no durability (functional but ephemeral — not "unused" but effectively non-persistent): session media register surfaces (F-A14/F-A16/F-A17), activity diary writers, `AdminProfile` save.

**POSSIBLY UNUSED (no caller, but plausibly intended):** departments/sections CRUD (employee portal might adopt them), generic media upload/meta endpoints (tooling), `/admin/taxonomy/metrics|product-counts` (dashboards-in-waiting), `POST /admin/settings/reset`.

Development-only Admin functionality: the AI assistant mock (F-A05) — honest demo labeling in UI (`isMockAiProvider`). Obsolete mock data: `services/orders/demoOrders.js` — check: not imported by admin pages (grep) — POSSIBLY UNUSED (storefront legacy). Abandoned feature flags: none found (`grep flag` in admin surfaces shows review-flags, which are live).

---

## 22. Complexity Analysis (scores are audit judgments, 1=low 5=high)

| Feature | Business value | Tech complexity | DB/API load | Security risk | Maintenance cost | Recommendation |
|---|---|---|---|---|---|---|
| Dashboard (F-A03) | 4 | 2 | 5 | 1 | 2 | KEEP + simplify loads |
| Analytics workspace (F-A04) | 3 | 3 | 3 | 1 | 4 (second engine) | REVIEW |
| AI assistant (F-A05) | 1 | 1 | 0 | 1 | 1 | REMOVE-DEFER |
| Products desk (F-A06) | 5 | 4 | 5 | 2 | 3 | KEEP + fix read path |
| Product editor (F-A07) | 5 | 4 | 2 | 2 | 3 | KEEP |
| Review queue (F-A08) | 4 | 4 | 4 | 2 | 3 | KEEP + dedupe fetch |
| Lifecycle ops (F-A10) | 5 | 3 | 1 | 3 (no perm checks) | 2 | KEEP + tighten authz |
| Product media (F-A11) | 4 | 3 | 2 | 2 | 2 | KEEP |
| Media library/mapping/detail (F-A12/16/17) | 2 | 3 | 3 | 2 | 4 (dual system) | DUPLICATE → consolidate |
| Media review (F-A14) | 3 | 2 | 0 | 2 | 3 | BROKEN → decide backend or defer |
| Marketing (F-A15) | 3 | 3 | 2 | 2 | 4 (3 systems) | DUPLICATE → consolidate on backend |
| Categories/Collections (F-A18/19) | 4 | 2 | 2 | 2 | 2 | KEEP |
| Offers (F-A20) | 4 | 3 | 3 | 2 | 2 | KEEP |
| Orders + lifecycle (F-A21/22/23) | 5 | 4 | 4 | 3 (no perm checks) | 3 | KEEP + tighten authz |
| Customers (F-A24/25) | 4 | 2 | 3 | 3 (PII) | 2 | KEEP |
| Returns (F-A26) | 3 | 2 | 2 | 2 | 3 | REVIEW (wire API or keep derivation) |
| Inventory suite (F-A27) | 2 (simulated) | 2 | 0 | 1 | 3 | REMOVE-DEFER until backend exists |
| Employees (F-A28-30) | 5 | 3 | 2 | 4 (no perm checks) | 3 | KEEP + tighten authz |
| Activity log (F-A31) | 3 | 1 | 0 (empty) | 1 | 1 | BROKEN pipeline → decide |
| Settings (F-A32) | 4 | 2 | 1 | 3 (SUPER_ADMIN gated) | 2 | KEEP |
| Profile (F-A33) | 1 | 1 | 0 | 1 | 1 | REVIEW |

---

## 23. Database Table Impact Map (Admin features → PostgreSQL)

| Admin feature | API | Service | DB table(s) | Query type | Frequency (admin session) | Load risk |
|---|---|---|---|---|---|---|
| Dashboard KPIs | GET /analytics/overview | inline (analytics.py) | orders, users, customer_profiles, catalog_product | 6× full aggregates | per load + per product event | **CRITICAL/HIGH** |
| Dashboard sales chart | GET /analytics/sales | inline | orders | group-by range scan | per load | MEDIUM |
| Dashboard category bars | GET /analytics/products?limit=100 | inline | order_items ⋈ orders | join+group, desc limit | per load | HIGH |
| Dashboard stock tiles/alerts | GET /analytics/inventory-summary | inline | catalog_product | full-table aggregate | per load | MEDIUM |
| Dashboard employee count | GET /admin/employees ×2 | employee_repo | users, employee_profiles | paged select (100) + count | per load | MEDIUM |
| Recent orders | GET /admin/orders?pageSize=5 | order_service | orders(+items,+returns,+users) | eager paged read | per load | LOW-MEDIUM |
| Products desk | GET /admin/products | product_service.list_admin_products | **catalog_product (FULL)**, **catalog_collection (FULL)**, media_asset, product_media | count + unbounded select + joins | every query/filter/page + 4 other surfaces' mounts | **CRITICAL** |
| Products metrics tiles | GET /admin/products/metrics | product_service.get_metrics | catalog_product | 2× full scans + count | after every list change | **HIGH** |
| Product detail/edit | GET/PATCH /admin/products/{id}, availability, next-id, publish-issues | product_service | catalog_product, catalog_collection (FULL) | pkey reads + full collections scan | per product open/save | MEDIUM |
| Review queue | GET /admin/products (100) + lifecycle ops | product_service | as products desk | as above | per mount + actions | HIGH |
| Collections/categories desks | /admin/collections*, /admin/categories* | collection/category services | catalog_collection, catalog_category (+ per-collection product scans on public list) | full-list reads | per mount | MEDIUM (HIGH for public list counts) |
| Offers desk | /admin/offers* | coupons.py inline | commerce_coupon | full in-memory filter/paginate | per mount/filter | MEDIUM |
| Orders desk | GET /admin/orders?pageSize=100 | order_service.admin_list_orders | orders, order_items, order_returns, users | count + eager paged read | every orders/returns navigation + after each action | HIGH |
| Order lifecycle ops | POST /admin/orders/{id}/* | order_service | orders, order_status_history, order_items | pkey + insert history | per action | LOW-MEDIUM |
| Customers desk | /admin/customers* | customer_service | users, customer_profiles, customer_addresses, customer_preferences, orders (agg) | paged select + selectinload + batched agg | per mount | MEDIUM |
| Employees desks | /admin/employees* | employee_service(repo) | users, employee_profiles | paged select + count | 2× per session + mutations | MEDIUM |
| Media library | GET /media/assets | media.py | media_asset | **unbounded select** | per library mount | HIGH (grows) |
| Media upload/register | POST /media/products/{id}/objects, /media/register | upload_service, media.py | media_asset, product_media (+ catalog cache invalidation) | pkey + upsert | per upload | LOW |
| Marketing hero | /admin/marketing/media* | marketing_media_service | media_marketing_media | filtered reads | per marketing mount | LOW-MEDIUM |
| Activity log | GET /audit/logs | audit.py | audit_activity_log | filtered paged read (empty) | per activity mount | LOW |
| Settings | /admin/settings* | admin.py | admin_setting | full-table read (small) | per settings mount + employee-portal reads | LOW |
| Inventory suite | *(none — localStorage)* | — | *(catalog_product via analytics only)* | — | per mount (no DB) | none |
| AI assistant | *(none — mock)* | — | — | — | — | none |

---

## 24. Load Hotspot Ranking

| Rank | Severity | Feature | Route | API(s) | Table(s) | Query behavior | Trigger | Recommended action (NOT implemented) |
|---|---|---|---|---|---|---|---|---|
| 1 | **CRITICAL** | Product catalogue read path | `/admin/products` (+review/marketing/selector mounts) | GET /admin/products | catalog_product, catalog_collection, media_* | full-table load + full collections scan + count; Python sort/page | every mount of `useProducts()` (×4 surfaces), every filter/sort/page change | Push filter/sort/pagination into SQL; cache or dedupe `useProducts`; restrict list columns |
| 2 | **CRITICAL/HIGH** | Dashboard aggregate fan-out | `/admin` | /analytics/overview, /sales, /products?100, /orders, /inventory-summary, /admin/orders?5, /admin/employees?100 ×2 | orders, order_items, users, catalog_product, employee tables | 6+ separate uncached aggregates per load; full reload on product events | every dashboard load, every PRODUCTS_CHANGED_EVENT | Consolidate into one snapshot endpoint or cache aggregates; drop duplicate employee fetch; narrow event reload |
| 3 | **HIGH** | Catalogue metrics double-scan | `/admin/products` | GET /admin/products/metrics (+ duplicate /admin/workflow/metrics) | catalog_product | 2× full column scans + count | after every list reload | Single grouped aggregate; decouple from keystrokes; remove alias |
| 4 | **HIGH** | Order snapshot refetches | `/admin/orders`, `/admin/returns`, `/admin/analytics` | GET /admin/orders?pageSize=100 | orders, order_items, order_returns | 100 eager-loaded orders per navigation | every mount of 3+ screens | True pagination; load returns from `/admin/returns`; share snapshot with TTL |
| 5 | **HIGH** | Media registry unbounded read | `/admin/media` | GET /media/assets | media_asset | select all, no LIMIT | every library mount | Add pagination + count |
| 6 | **HIGH (latent)** | Per-collection N+1 counts | (no admin caller) | /admin/taxonomy/product-counts, /collections | catalog_product, catalog_collection | ~3 full scans per collection | any future wiring | Batch resolve or SQL-ify rules before wiring |
| 7 | **MEDIUM** | Duplicate employee fetch | global provider + dashboard | GET /admin/employees?pageSize=100 | users, employee_profiles | 2 identical calls/session | session start + dashboard | Single fetcher (context) consumed by dashboard |
| 8 | **MEDIUM (latent)** | Directory N+1s | (no admin caller) | GET /users, GET /analytics/customers | users, profiles | 2-3 queries per row | any future wiring | Batch before wiring |
| 9 | **LOW/MEDIUM** | Offers in-memory pagination | `/admin/offers` | GET /admin/offers | commerce_coupon | full load + Python page | per mount/filter | SQL pagination when catalogue grows |
| 10 | **LOW** | Settings/activity reads | `/admin/settings`, `/admin/activity` | settings, audit/logs | admin_setting, audit_activity_log | small bounded reads | per mount | none needed now |

---

## 25. Production Minimum Admin

Derived **only** from what the application actually implements and what the storefront requires an operator to control (no invented requirements):

**ESSENTIAL (the portal cannot run the business without these)**
- Admin authentication + session isolation (F-A01) — sole trusted entry to everything below.
- Products: list/search + create/edit + review/approve/publish + archive (F-A06–F-A10) — the storefront catalogue and checkout read `catalog_product` directly; nothing can be sold without this desk.
- Product media attach (F-A11) — product DTOs resolve media from the durable registry.
- Orders: list/detail + fulfilment transitions + cancel + invoice (F-A21–F-A23) — orders arrive from checkout; someone must move and cancel them.
- Customers: list/detail (F-A24/25) — support/fulfilment needs identity and addresses.
- Employees: create/edit/status/reset-password/permissions (F-A28–A30) — the storefront is staff-operated; employee auth depends on this.
- Settings core (F-A32): at minimum store/tax/shipping/payments/orders/returns sections (they document the operating rules other systems read).

**IMPORTANT (strongly justified by existing code paths)**
- Dashboard headline tiles (revenue/orders/low-stock) (F-A03 subset).
- Categories/collections management (F-A18/19) — storefront navigation and curated rails read them.
- Offers/coupons (F-A20) — cart supports coupons; ops must be able to pause/expire.
- Analytics, **one** engine (F-A04) — for the owner's decisions; choose backend or client.
- Returns handling (F-A26) — **via the already-built `/admin/returns` API**, not the 100-order derivation.

**OPTIONAL (nice-to-have; defensible to defer)**
- Dashboard charts (7-day sales, category bars), stock-alerts panel.
- Marketing media board beyond the backend HOME_HERO panel (F-A15 consolidation).
- Bulk product ops, duplicate/change-id, metrics tiles beyond counts.
- Admin profile editing (F-A33) — currently non-persistent anyway.

**EXCESSIVE / REVIEW (candidates to not carry into production as-is)**
- The simulated inventory suite (F-A27) — presents non-durable data as operations.
- Media review queue / product-mapping / media detail over the session register (F-A14/16/17) — non-durable workflow.
- AI Business Assistant mock (F-A05).
- Client-side analytics duplicates, third marketing system, hidden legacy routes, unused directory endpoints (§21 list).
- Activity log page **as-is** (always empty) — either give the diary backend writers or defer the page.

---

## 26. Final Decision Matrix

**Decision column is intentionally left as `USER DECISION REQUIRED` for every row.**

| Feature | Current purpose | Complexity | DB load | API load | Security risk | Business importance | Duplicate? | Current problem | Recommended direction (audit) | Decision |
|---|---|---|---|---|---|---|---|---|---|---|
| Admin auth | Gate the portal | Low | Low | Low | Med (localStorage tokens) | Critical | No | none observed | KEEP | USER DECISION REQUIRED |
| Dashboard | Headline ops view | Low | **Critical/High** | High | Low | High | Overlaps analytics/inventory | 7-call fan-out, dup employee fetch, event storms | SIMPLIFY | USER DECISION REQUIRED |
| Analytics workspace | Business intelligence | Med | Med | Med | Low | Med | **Yes** (2nd engine) | bounded-snapshot numbers; two sources of truth | REVIEW | USER DECISION REQUIRED |
| AI assistant | Demo AI | Low | None | None | Low | Low | No | mock only | REMOVE/DEFER | USER DECISION REQUIRED |
| Products desk | Run the catalogue | High | **Critical** | High | Low-Med | Critical | Partially (useProducts register) | full-table reads per interaction | KEEP + optimize read path | USER DECISION REQUIRED |
| Product editor | Create/edit products | Med-High | Low-Med | Low | Low | Critical | No | none material | KEEP | USER DECISION REQUIRED |
| Product review queue | Admin approves employee drafts | Med | High | Med | Low | High | fetch duplication | per-mount full fetches | SIMPLIFY | USER DECISION REQUIRED |
| Lifecycle ops | Canonical workflow | Med | Low | Low | **Med** (no perm checks) | Critical | status mechanisms ×3 | authorization breadth | KEEP + tighten authz | USER DECISION REQUIRED |
| Product media | Durable imagery | Med | Low-Med | Low | Med (delete cascade) | High | No | latent delete danger | KEEP | USER DECISION REQUIRED |
| Media library+mapping+detail | Browse/assign media | Med | High | Med | Low | Med | **Yes** (2 systems) | session register vs DB registry | CONSOLIDATE | USER DECISION REQUIRED |
| Media review queue | Approve employee media | Med | None | None | Low | Med | **Yes** | non-durable; backend stub | FIX or DEFER | USER DECISION REQUIRED |
| Marketing hero/board | Homepage curation | Med | Low-Med | Low-Med | Low | Med-High | **Yes** (3 systems) | split brain | CONSOLIDATE on backend | USER DECISION REQUIRED |
| Categories | Taxonomy | Low | Low-Med | Low | Low | High | No | unpaginated list (small) | KEEP | USER DECISION REQUIRED |
| Collections | Curated rails | Low-Med | Med | Low-Med | Low | High | No | public count N+1 (adjacent) | KEEP | USER DECISION REQUIRED |
| Offers | Coupons/promotions | Med | Med | Med | Low | High | No | in-memory pagination | KEEP | USER DECISION REQUIRED |
| Orders desk | Fulfil ops | Med-High | High | High | **Med** (no perm checks) | Critical | No | 100-cap snapshot; heavy payloads | KEEP + optimize | USER DECISION REQUIRED |
| Order lifecycle ops | Move orders | Med | Low-Med | Low | Med | Critical | 3 overlapping mechanisms | authz breadth | KEEP + consolidate | USER DECISION REQUIRED |
| Invoice | Documents | Low | Low-Med | Low | Low | Med | No | none | KEEP | USER DECISION REQUIRED |
| Customers | Support/fulfilment lookup | Low-Med | Med | Med | **Med-High (PII)** | High | No | employee-token access by design | KEEP | USER DECISION REQUIRED |
| Returns screens | Handle returns | Low-Med | Med | Med | Low | Med-High | **Yes** (API unused) | derived from 100-order cap | WIRE API or keep | USER DECISION REQUIRED |
| Inventory suite | Stock ops (simulated) | Low-Med | None | None | Low | Low (as built) | **Yes** (vs product.stock analytics) | localStorage presented as ops | DEFER until backend | USER DECISION REQUIRED |
| Employees | Staff accounts | Med | Med | Med | **High** (no perm checks) | Critical | No | authz breadth; double fetch | KEEP + tighten | USER DECISION REQUIRED |
| Activity log page | Who-did-what | Low | None (empty) | Low | Low | Med | Yes (2 read APIs) | **no writers exist** | FIX pipeline or defer | USER DECISION REQUIRED |
| Settings | Business config | Low | Low | Low | Med (SUPER_ADMIN ok) | High | notifications shadow dup | minor | KEEP | USER DECISION REQUIRED |
| Admin profile | Local identity edit | Low | None | None | Low | Low | No | not persisted | REVIEW | USER DECISION REQUIRED |
| Unused backend families (returns API, departments/sections/attendance/targets/performance, /users, /roles, /permissions, legacy aliases, workflow-metrics, settings/reset, analytics/customers, media misc) | Reserve capacity | — | 0 today | 0 today | Attack-surface area | Low today | Yes (several) | dead surface; some have latent N+1 | RETIRE or WIRE deliberately | USER DECISION REQUIRED |

---

## 27. Evidence / Files Inspected

**Frontend (admin-relevant, read/traced):** `src/App.jsx`; `src/config/adminAccess.js`, `adminNavigation.js`; `src/context/AdminAuthContext.jsx`, `EmployeeManagementContext.jsx`, `OrderContext.jsx`, `InventoryContext.jsx`, `WorkforceContext.jsx`; `src/components/admin/*` (all 17 files); `src/pages/admin/**` (all 45 pages); `src/components/{media,inventory,analytics,products}/**` (admin-consumed); `src/services/api/{apiClient,adminApi,authApi,productsApi,ordersApi,categoriesApi,collectionsApi,offersApi,customersApi,employeesApi,mediaApi,marketingMediaApi,inventoryApi}.js`; `src/services/admin/{adminDashboardService,productAdminService,productIdentityPreflight}.js`; `src/services/{settingsRepository,catalogRepository,unifiedProductReview,productWorkflow}.js`; `src/services/employees/activityService.js`; `src/services/media/*` (repository/store/hooks-adjacent); `src/hooks/{useProducts,useMedia,useMediaActions,useMarketingPlacements,useOffers,useCatalogueQuery}.js`; `src/services/analytics/analyticsService.js`; `src/services/ai/aiService.js`.

**Backend (read/traced):** `app/main.py`; `app/dependencies.py`; `app/core/{cache,redis,middleware,security}.py` (spot); `app/api/v1/{router,admin,analytics,audit,users,roles,permissions,products,categories,collections,coupons,customers,employees,orders,media,marketing_media,media_reviews,notifications,returns,chatbot}.py`; `app/services/catalog/{product_service,collection_service}.py` (admin paths), `app/services/orders/order_service.py` (admin paths), `app/services/customer/customer_service.py`, `app/services/employee/employee_service.py`, `app/services/audit/audit_service.py`, `app/services/media/*` (spot); `app/models/{audit/activity_log,catalog/product,media/*,inventory/*}.py`; `alembic/versions/*` (index/column evidence); `app/api/v1` route table dumped **live** from a running app instance (285 ops).

**Runtime verification performed (sandbox, observation only):** backend installed into an isolated venv and booted (no PostgreSQL available); `GET /health` 200; live route dump; **20/20 sampled admin endpoints returned 401 unauthenticated**; public endpoints behaved as designed (DB-dependent 500s are sandbox artifacts); media object-meta 404 without auth. Frontend was not executed in a browser (no browser in sandbox) — **network-waterfall verification in a real browser was NOT possible; limitation recorded in §28.**

**Documentation cross-referenced:** `docs/backend-blockers.md` (B-01, B-02, B-09, B-10, B-12, B-13, B-14 corroborated), `docs/api-count-reconciliation.md` (225-contract framing; live count is higher now), `docs/feature-api-matrix.md`, `docs/full-stack-integration-audit.md` (headers/sections), `docs/frontend-api-traceability.csv` (spot checks), `docs/marketing-media-api.md`, `docs/openapi.json` (found stale), `backend/schema_audit/SCHEMA_AUDIT_REPORT.md` (spot), `backend/README.md`, `HOMEPAGE_AUDIT.md` (hero only).

---

## 28. Unknowns and Limitations

1. **No production metrics.** All DB/API load ratings are static-analysis + local-runtime based. No query timings, row counts, or production traffic were available. Every HIGH/CRITICAL rating identifies a structural cost pattern, not a measured load. — UNKNOWN — REQUIRES RUNTIME/PRODUCTION VERIFICATION for actual magnitudes.
2. **Authorized-path (403) behavior unverified at runtime** (requires a live database with provisioned admin roles). Code-level analysis is documented in §16; runtime confirmation pending.
3. **Browser runtime verification not performed** (no browser in sandbox). Duplicate-request waterfalls were derived from code tracing (each claimed duplicate cites its call sites). A 15-minute DevTools session against a seeded staging DB would confirm: dashboard fan-out counts, `useProducts` multi-mount fetches, dashboard category-bar degeneracy (id-prefix bucketing), and order-snapshot pagination behavior.
4. **Data-volume sensitivity.** Several MEDIUM ratings (offers list, categories/collections lists, order snapshot) assume current small catalogue sizes; they scale linearly and would rise to HIGH with catalogue growth. Actual catalogue size in production: UNKNOWN.
5. **`analytics/customers` and `/users` N+1s are latent** (no callers); their load ratings assume the day they are wired.
6. **Employee status vocabulary conflict** (dual `EmployeeService` class) — the *effective* behavior is the second class; whether the first class's broader status set (PENDING/ON_LEAVE/INACTIVE) was intended for admin use is a product question — UNKNOWN.
7. **Dashboard "Where it sold" grouping key** (`productId.split("-")[0]`) appears degenerate under the `PF-…` id scheme; needs runtime data to confirm — UNKNOWN.
8. **`GET /admin/activity` empty-diary swallow:** the endpoint masks query failures by returning `[]` (`admin.py:430-440`); in production a pending migration would look identical to "no activity" — noted as an observability risk.
9. **Stale `docs/openapi.json`** — regenerated counts in this audit supersede it; the file itself was not modified (audit-only).
10. **Frontend tests** were not executed (audit scope); no tests were modified or deleted.

---

### Validation statement (per instructions §31)

- `git status` at audit end: only `docs/admin-complete-audit.md` added; **no application source, migration, schema, test, or data file modified** (verified via `git status --short` / `git diff`).
- API counts in §6 are derived from a live route dump of the running backend (285 ops; 125 under `/api/v1/admin/*`) and per-endpoint caller greps — not invented.
- Every HIGH/CRITICAL finding cites file-and-line evidence; items not verifiable here are explicitly marked UNKNOWN.
- Recommendations and decisions are separated: all final calls are `USER DECISION REQUIRED`.
---

## 30. Admin Consolidation — Final Implementation Status

*Written after implementation (post-audit). Cross-references the hotspot (§24/§7), duplication (§20) and security (§16) IDs above. Full detail: `docs/admin-consolidation-report.md` (§18 A–M deliverable).*

### 30.1 Shipped (verified: backend 703 passed/24 skipped/0 failed; frontend 408 pass/0 fail; vite build OK)

| Audit ref | Outcome |
|---|---|
| HP-1 products full-scan | SQL pagination/filter/sort; page-only hydration; bounded membership read (5 cols). Pinned by `test_admin_consolidation_products` (real SQLite). |
| HP-2 dashboard 7-fan-out | ONE `GET /analytics/admin/dashboard/summary` (analytics.view): metrics + series (portable `func.date`) + category revenue + recent orders (AdminOrderResponse projection) + stock summary + employee COUNTs. |
| HP-3 `/admin/products/metrics` | single scan; count + conditional sums. |
| HP-4 orders 100-snapshot | desk pages server-side; new SQL filters (paymentStatus / fulfillment stage / createdSince / valueBand / q over order number or customer identity); `status_counts` = one grouped query over the whole book; customer detail + AI off the snapshot. |
| HP-5 `/media/assets` unbounded | DB-paginated envelope `{items,total,page,pageSize}` (≤200) end-to-end incl. UI controls. |
| HP-7 /users N+1 | 3 bounded IN queries per page (profiles + roles). `/admin/customers` verified already batched. |
| HP-8 duplicate employee fetch | eliminated via the consolidated summary; `syncEmployeesFromBackend` confirmed zero callers. |
| HP-9 in-memory pagination | offers register fully SQL-side (CASE group-by tiles, honest counts, clamp ≤200); categories/subcategories: one grouped COUNT query per list. |
| Returns derivation | desk reads `GET /admin/returns[/id]` (DB-paginated, order-number + customer-name enrichment via one bounded per-page lookup); mutation no longer refetches the order snapshot. |
| AI mock in production | REPLACED by real `POST /ai/business/ask` (analytics.view, read-only bounded queries over existing models, truthful NO_DATA, client payload ignored). Mock kept only for the customer shopping surface/tests. |
| S-1/S-2/S-3 guard-only routers | every admin handler in orders (25), employees (57), analytics, audit, users, roles, permissions now calls `require_admin_permission` with least-privilege perms; media reads → media.view. |
| S-4 no-role bypass | secured: admins without role assignment are 403-denied once ANY roles exist; empty-directory bootstrap path preserved (no lockout on fresh installs). |
| D-7 EmployeeService ×2 | shadowed first class deleted (~470 dead lines); its unique `update_employee_permissions` ported — FIXES `PUT /admin/employees/{id}/permissions`. |

### 30.2 Deferred with reasons (not silent deletions)

- Legacy hidden `/employees/*` (20 aliases, §16): kept pending external-contract review → recommend 308 redirects, then delete. Class B/C, not D.
- `GET /admin/workflow/metrics` (D-6): kept as pinned compatibility alias (contract test asserts retention) — class C contract.
- Activity log UI (§19): stays deferred behind Navigate redirects; zero writers still true.
- Media review/mapping/detail UI (§11): stays deferred; durable registry + marketing flow (B-02) untouched.
- Collections per-row resolved counts (HP-9 residual): REVIEW — semantics must not change.
- Client `analyticsService` still powers the employee reports desk; the admin desk now reads the same engine off bounded server pages rather than the 100-order snapshot (D-2 disposition: consolidation of *definitions* done server-side; full client-engine retirement deferred until the employee portal migrates).

### 30.3 Constraints honoured

Query-shape + request-dedup only (no Redis/new infra); no migrations/models/lifecycle/media-ownership/HOME_HERO changes; no tests deleted or weakened (harness fakes extended, documented); localStorage never authoritative; no secrets or SQL to the frontend; portal isolation intact; docs updated (`admin-consolidation-report.md`, this section).
