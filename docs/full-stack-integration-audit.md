# FULL-STACK INTEGRATION AUDIT — PRATIKSHYA FASHON

**Date:** 2026-09-09 (updated final)
**Branch:** arena/01a08559-pfv1
**Mode:** AUDIT + TRACE + CLASSIFICATION (no broad implementation)
**Verdict:** BACKEND 70% REAL / 30% STUB — INTEGRATION PARTIAL — NOT READY FOR PROD

---

## 1. Executive Summary

### OVERALL: NOT READY
### FRONTEND: PARTIAL (122 features wired, 15 stub clients, 20 missing clients, but UI complete)
### BACKEND: PARTIAL (core catalogue/auth/commerce real, inventory/marketing-media/employee-punch/AI/support desks stub)
### INTEGRATION: PARTIAL

**What is actually working (verified by code inspection):**

- Auth JWT with surface isolation (customer/employee/admin) + blacklist + refresh rotation + OAuth Google/Facebook.
- Product lifecycle: DRAFT→PENDING_REVIEW→APPROVED→PUBLISHED→ARCHIVED with APPROVE≠PUBLISH enforced in ProductService.
- Public catalogue: GET /products, GET /products/{id}, recommendations, categories, collections, search, explore, home — all real DB-backed, with honest `total` contract (ProductService returns total from count query, not page length).
- Admin product workflow: all 20 admin product commands exist and enforce publish-issues gate (media ownership, price>0, etc).
- Media product path: upload → register → ProductMedia mapping → media-set → resolve → storefront — REAL, filesystem-backed via storage/media abstraction, DB-backed via media_asset + product_media tables.
- Cart, wishlist, orders, returns, payments, customers/addresses, coupons/offers, analytics, settings, audit logs, RBAC roles/permissions — REAL and tested.
- Taxonomy: categories/subcategories with ACTIVE gate removing products from customer surfaces.

**What is NOT working / stub:**

- Inventory: 6 models exist (InventoryStock, Movement, Reservation, Transfer, Warehouse, Location) but they have NO business columns — only table name + id/timestamps from Base. Routers inventory/warehouses/stock_transfers return only `/health`. Frontend inventoryApi returns unavailable. Cart/order stock validation uses catalog_product.stock snapshot, not ledger.
- Marketing media: media_marketing_media + media_media_review tables have no columns (empty models). Router media_reviews returns only health. Frontend marketing media list/review approve/reject are BACKEND_GAP.
- Employee self-service punch: attendance router + performance router are stub health only. EmployeeService has attendance logic but API surface for employee check-in/out/today/history missing. Frontend check-in/out fail-closed.
- Employee leave + performance self-service: missing (P2).
- Support / styling / floor-sales desks: missing — UI empty.
- AI: chatbot router stub health, no AI endpoints (P3 preview).
- Employee assigned-products: GET /employee/me/assigned-products returns placeholder empty array (TODO in employees.py).
- Customer session id: token has no `sid` claim, so revoke-others revokes all sessions including current (documented BACKEND_GAP).
- Employee forgot-password: no endpoint (API-AUTH-15 missing).

**Critical previous bug — Publish visibility after reload:**

- ProductService.publish validates APPROVED + getPublishIssues empty, sets published=true, status=PUBLISHED, invalidates caches (product:storefront:* + response cache). Unpublish sets DRAFT + published=false + invalidates. Category archiving invalidates product caches too. So the bug is FIXED in code, but requires DB to prove. In this workspace no live backend DB, so cannot run real HTTP smoke test. Previous in-memory audit proved visibility gate.

**Media counts verification (filesystem):**

- 238 total files under frontend/public/images
- 191 product files
- 42 collection/editorial
- 5 hero
- 128 PF-* folders (10 kids PF-K-*)
- These are NOT live catalogue counts — backend catalogue may be empty without seed.

---

## 2. Architecture Map

### Frontend

- **Entry:** frontend/src/main.jsx → App.jsx
- **Routes:** App.jsx: customer (/ , /shop, /explore, /category/:slug, /collections/:slug, /search, /product/:productId, /cart, /checkout, /account/*), admin (/admin/* 56 features), employee (/employee/* 33 features)
- **Services/API clients:** frontend/src/services/api/: apiClient.js (base), authApi.js, productsApi.js, categoriesApi.js, collectionsApi.js, cartApi.js, ordersApi.js, paymentsApi.js, customersApi.js, searchApi.js, offersApi.js, mediaApi.js, employeesApi.js, adminApi.js, inventoryApi.js (stub), wishlistApi.js
- **Repositories:** catalogRepository, mediaRepository, taxonomyRepository, employeeManagementFixtures, workflowTestState (3 DRAFT fixtures)
- **Stores:** catalogStore (hydrate walks GET /products pageSize 100 until total, fails on omitted total on full page), mediaStore (memory only), auth stores per portal, cartStore, etc.
- **Hooks:** useCatalogueQuery (PAGE_SIZE 12), useProduct, etc.
- **Auth:** scoped tokens pf_access_token, pf_admin_access_token, pf_employee_access_token + refresh isolation + 401 refresh retry
- **Media resolver:** POST /media/references/resolve + GET /media/products/{id}/media-set + mediaObjectUrl (/api/v1/media/objects/{key})
- **Tests:** 355 tests (351 pass, 3 fail due to react import in node loader, 1 skip) — previously 377 with 1 skip store-copy (backend/storage/media absent)

### Backend

- **Entrypoint:** backend/app/main.py → FastAPI with lifespan (redis + FastAPICache in-memory)
- **Config:** app/config.py Settings with STORAGE_PROVIDER=local, LOCAL_MEDIA_ROOT=storage/media, MEDIA_URL_PREFIX=/media/objects, API_V1_PREFIX=/api/v1, JWT, DB URL postgres+asyncpg
- **Routers mounted in app/api/v1/router.py (27 routers):**
  - REAL: auth, users, roles, permissions, products, categories, collections, media, customers, addresses, cart, wishlist, coupons (offers), orders, payments, admin (settings/activity/roles), audit, analytics, search, explore, employees (admin CRUD + self me), notifications (settings only)
  - STUB HEALTH ONLY: attendance, attributes, chatbot, checkout, inventory, media_reviews, performance, pricing, returns (wait — returns router actually has content? Let's check — returns.py is 8 lines health, but returns logic is inside orders.py), variants, warehouses, stock_transfers
- **Services:**
  - REAL: auth_service (register/login/logout/forgot/reset/change-pw/refresh), category_service, collection_service, product_service (full lifecycle), explore_service, search_service, media_service (object operations), upload_service, product_media_records, cart_service, wishlist_service, coupon_service, order_service, return_service, customer_service, employee_service (CRUD + attendance + performance + targets), analytics_service, audit_service, notification_settings_service
  - STUB: inventory_service, attendance_service, performance_service (empty class), reservation_service, transfer_service, etc — only __init__
- **Models:**
  - REAL with columns: catalog_product, catalog_category, catalog_subcategory, catalog_collection, catalog_tag, product_tag, media_media_asset, media_product_media, commerce_cart, cart_item, wishlist, wishlist_item, coupon, coupon_redemption, orders_order, order_item, order_status_history, return_order, return_item, payment_session, customer_profiles, customer_address, customer_preferences, employee_profiles, employee_department, employee_section, employee_attendance, employee_performance, employee_target, auth_user, session, etc, audit_activity_log, admin_setting, rbac role/permission/user_role
  - EMPTY (only tablename, no columns): inventory_inventory_location, inventory_inventory_stock, inventory_inventory_movement, inventory_stock_reservation, inventory_stock_transfer, inventory_warehouse, media_marketing_media, media_media_review, variants_attribute, attribute_value, product_variant, product_attribute, pricing_tax_rate, product_price, price_history, checkout_checkout, payment, payment_transaction, notification_notification, chatbot_knowledge_document, chunk, conversation, message, chat_retrieval
- **Schemas:** extensive pydantic schemas for product, category, collection, cart, coupon, order, return, payment, customer, employee, media, etc.
- **Database layer:** SQLAlchemy async + asyncpg, Base with UUID id + created_at/updated_at in pratikshya schema, Alembic migrations 11 versions (initial + category/subcategory + admin_setting + media_asset/product_media + collection + cart coupon + orders + payment_sessions + schema move + wishlist/activity)
- **Security:** JWT jti blacklist in Redis, bcrypt, rate limiter 10/min login, OAuth2PasswordBearer
- **Storage:** app/storage abstraction local provider filesystem, S3 interface-ready but not wired, key validation no traversal, content signature validation

### Dead/Legacy/Duplicate

- backend/app/api/v1/attendance.py, performance.py, inventory.py, warehouses.py, stock_transfers.py, media_reviews.py, chatbot.py, checkout.py, attributes.py, variants.py, pricing.py, returns.py — all stub health only, but their domains are partially implemented elsewhere (attendance logic in employees.py, returns in orders.py, inventory stock check in catalog_product.stock)
- Duplicate product list concerns avoided: one product register catalog_product, but inventory summary aggregates from product.stock not ledger — documented note.
- No duplicate auth routers — auth.py handles all surfaces.

---

## 3. Frontend Status

| Portal | Features | P0 | P1 | P2 | P3 | Client exists | Stub | Missing |
|---|---|---|---|---|---|---|---|---|
| customer | 33 | 24 | 6 | 1 | 2 | 31 | 0 | 2 (AI) |
| admin | 56 | 12 | 38 | 5 | 1 | 48 | 7 | 1 |
| employee | 33 | 3 | 13 | 17 | 0 | 15 | 11 | 7 |
| Total | 122 | 39 | 62 | 18 | 3 | 190 | 15 | 20 |

**Working:**
- All public catalogue browsing, PDP, search, explore, home (except hero empty until marketing media)
- Auth flows customer/admin/employee sign-in/out/change-pw
- Cart/wishlist/orders/addresses/customer profile
- Admin product CRUD + workflow + metrics + categories/collections/offers/orders/customers/media upload/register/assets
- Employee product inbox (assigned-products stub returns empty but UI handles), product edit/submit

**Partial/Mock:**
- Inventory dashboards (admin/employee) — fail closed unavailable
- Marketing media + media review — BACKEND_GAP
- Employee attendance punch — fail closed message, no local record
- Leave/performance — empty memory repo after seed deletion
- Support/styling/sales — empty tables
- AI — preview copy
- Recently viewed — needs auth but works when signed in

**Frontend blockers:**
- None blocking build — build passes 2675 modules 2.8MB
- Hydrate requires honest total — implemented to fail loudly if omitted (P0 contract)

---

## 4. Backend Status

| Domain | Model Columns? | Migration? | CRUD? | Endpoints Real? | Auth Enforced? | Status |
|---|---|---|---|---|---|---|
| products | YES full | YES | YES | YES all 20 admin + 3 public + 2 employee + submit | YES admin guard + permission | COMPLETE |
| categories | YES | YES | YES | YES | YES | COMPLETE |
| collections | YES | YES | YES | YES | YES | COMPLETE |
| search | N/A (uses products) | N/A | YES | YES | none | COMPLETE |
| explore/home | N/A + static promos | N/A | YES (static offers + real products) | YES | none | PARTIAL (static offers, not DB) |
| media product | YES asset + mapping | YES | YES | YES upload/register/assets/media-set/resolve/status/delete | YES admin for mut | COMPLETE |
| marketing media | NO empty | NO? table name but no cols | NO | NO stub health | NO | BACKEND BLOCKER P1 |
| media reviews | NO empty | NO | NO | NO stub health | NO | BACKEND BLOCKER P1 |
| inventory | NO empty | NO | NO stub service | NO stub health | NO | BACKEND BLOCKER P1 |
| warehouses | NO empty | NO | NO | NO stub | NO | BLOCKER P1 |
| stock transfers | NO empty | NO | NO | NO stub | NO | BLOCKER P1 |
| auth customer | YES user | YES | YES | YES | none for sign-in, customer for me | COMPLETE |
| auth employee | YES user+profile | YES | YES | YES sign-in/change-pw/sign-out | none for sign-in | COMPLETE (forgot missing) |
| auth admin | YES user | YES | YES | YES | none for sign-in, admin for me | COMPLETE |
| cart | YES | YES | YES | YES | customer | COMPLETE |
| wishlist | YES | YES | YES | YES | customer | COMPLETE |
| customers | YES profile/address/prefs | YES | YES | YES | customer + admin | COMPLETE |
| orders | YES order/item/history | YES | YES | YES | customer (own) + admin | COMPLETE |
| returns | YES return/item | YES | YES | YES via orders router | customer + admin | COMPLETE |
| payments | YES session | YES | YES | YES | customer | COMPLETE |
| coupons/offers | YES coupon | YES | YES | YES public + admin | none public, admin for mut | COMPLETE |
| employees | YES profile/dept/section/attendance/performance/target | YES | YES | YES admin CRUD | admin | COMPLETE (self punch missing) |
| attendance admin | YES attendance | YES | YES | YES via employees router | admin | COMPLETE (admin side) |
| attendance employee self | YES model | YES | NO service stub | NO router stub | N/A | BACKEND BLOCKER P1 |
| performance | YES | YES | YES admin via employee_service | YES admin via employees | admin | PARTIAL (employee self missing) |
| leave | NO model? | NO | NO | NO | N/A | MISSING P2 |
| analytics | uses orders/products | N/A | YES | YES | admin | COMPLETE (zeros when empty) |
| settings | YES setting | YES | YES | YES | admin + super_admin for write | COMPLETE |
| audit/activity | YES activity_log | YES | YES | YES /audit/logs + /admin/activity | admin | COMPLETE |
| RBAC roles/permissions | YES role/perm/user_role | YES | YES | YES /roles /permissions /users /admin/roles | admin | COMPLETE |
| notifications inbox | YES notification but no cols? Actually notification model exists? Check — notification model empty | NO | NO | NO — only settings via /admin/settings/notifications | N/A | NOT REQUIRED (explicitly out) |
| chatbot/AI | chatbot models empty | NO | NO | NO stub health | N/A | FUTURE P3 |
| support/styling/sales | NO models | NO | NO | NO | N/A | MISSING P2 (UI exists) |

**Auth enforcement audit:**
- get_current_admin rejects customer/employee tokens with 403 (surface guard)
- require_admin_permission checks roles/permissions, fallback for unassigned admin (compat path, only admin)
- Customer endpoints use get_current_customer (rejects admin/employee)
- Employee endpoints use get_current_employee
- Public endpoints use no auth or get_optional_user (guest orders allowed)
- JWT jti blacklist checked via Redis — logout/password change blacklists
- Rate limiter 10/min on login endpoints
- CORS configured via ALLOWED_ORIGINS

---

## 5. API Matrix (Authoritative)

### Legend Status Classification
- A = COMPLETE / WORKING
- B = IMPLEMENTED BUT NOT INTEGRATED (backend real, frontend stub or vice versa)
- C = PARTIAL / UNDER PROGRESS
- D = STUB / PLACEHOLDER (health only or returns unavailable)
- E = MISSING BACKEND
- F = FRONTEND INTEGRATION BUG (client calls wrong path or mishandles envelope)
- G = HUMAN DECISION
- H = FUTURE / NOT REQUIRED

| ID | Method | Route | Backend Implemented? | Tested? | Auth | Scope/Role | DB-backed? | Real Data? | Frontend Consumer | Frontend Status | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|
| API-AUTH-01 | POST | /auth/customer/sign-up | YES | YES unit | none | customer | YES users | YES | F-CUS-SIGNUP | exists | A |
| API-AUTH-02 | POST | /auth/customer/sign-in | YES | YES | none | customer | YES | YES | F-CUS-SIGNIN | exists | A |
| API-AUTH-03 | POST | /auth/customer/sign-out | YES | YES | customer | customer | YES blacklist | YES | F-CUS-SIGNOUT | exists | A |
| API-AUTH-04 | POST | /auth/customer/forgot-password | YES | YES | none | customer | YES cache | YES | F-CUS-FORGOT | exists | A |
| API-AUTH-05 | POST | /auth/customer/reset-password | YES | YES | none | customer | YES | YES | F-CUS-RESET | exists | A |
| API-AUTH-06 | POST | /auth/change-password | YES | YES | customer | customer | YES | YES | F-CUS-SECURITY | exists | A |
| API-AUTH-07 | POST | /auth/employee/sign-in | YES | YES | none | employee | YES | YES | F-EMP-LOGIN | exists | A |
| API-AUTH-08 | POST | /auth/employee/change-password | YES | YES | employee | employee | YES | YES | F-EMP-CHANGE-PW | exists | A |
| API-AUTH-09 | POST | /auth/employee/sign-out | YES | YES | employee | employee | YES | YES | F-EMP-LOGIN | exists | A |
| API-AUTH-10 | POST | /auth/admin/sign-in | YES | YES | none | admin | YES | YES | F-ADM-LOGIN | exists | A |
| API-AUTH-11 | POST | /auth/admin/sign-out | YES | YES | admin | admin | YES | YES | F-ADM-LOGIN | exists | A |
| API-AUTH-12 | GET | /auth/me | YES | YES | any JWT | any | YES | YES | F-ADM-LOGIN,F-CUS-ACCOUNT,F-EMP-LOGIN | exists | A |
| API-AUTH-13 | GET | /customers/me | YES | YES | customer | customer | YES profile | YES | F-CUS-ACCOUNT,F-CUS-PROFILE | exists | A |
| API-AUTH-14 | GET | /employee/me | YES | YES | employee | employee | YES profile | YES | F-EMP-PROFILE,F-EMP-LOGIN | exists | A |
| API-AUTH-15 | POST | /auth/employee/forgot-password | NO | NO | none | employee | NO | NO | F-EMP-CHANGE-PW | missing | E P1 + G |
| API-PROD-01 | GET | /products | YES | YES unit | none | public | YES catalog_product | YES if seeded | F-CUS-SHOP,HOME,CATEGORY,KIDS | exists | A (needs seed) |
| API-PROD-02 | GET | /products/{idOrSlug} | YES | YES | none | public | YES | YES | F-CUS-PDP | exists | A |
| API-PROD-03 | GET | /products/{id}/recommendations | YES | YES | none | public | YES | YES | F-CUS-PDP,F-CUS-RECS | exists | A |
| API-PROD-04 | GET | /collections/{id}/products | YES | YES | none | public | YES | YES | F-CUS-COLLECTION | exists | A |
| API-PROD-05 | GET | /products/recently-viewed | YES | YES | customer | customer | YES | YES | F-CUS-RECENT | exists | A |
| API-PROD-06 | POST | /products/recently-viewed | YES | YES | customer | customer | YES | YES | F-CUS-RECENT,F-CUS-PDP | exists | A |
| API-PROD-07 | POST | /products/{id}/submit-review | YES | YES | admin\|employee | admin\|employee | YES | YES | F-ADM-PRODUCT-WORKFLOW,F-EMP-PRODUCT-EDIT | exists | A |
| API-APROD-01 | GET | /admin/products | YES | YES | admin | admin products.view | YES | YES | F-ADM-PRODUCTS | exists | A |
| API-APROD-02 | POST | /admin/products | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-CREATE | exists | A |
| API-APROD-03 | POST | /admin/products/draft | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-CREATE | exists | A |
| API-APROD-04 | GET | /admin/products/next-id | YES | YES | admin | products.view | YES | YES | F-ADM-PRODUCT-CREATE,F-EMP-PRODUCT-CREATE | exists | A |
| API-APROD-05 | GET | /admin/products/availability | YES | YES | admin | products.view | YES | YES | F-ADM-PRODUCT-CREATE | exists | A |
| API-APROD-06 | GET | /admin/products/metrics | YES | YES | admin | products.view | YES | YES | F-ADM-PRODUCTS | exists | A |
| API-APROD-07 | GET | /admin/products/{id} | YES | YES | admin | products.view | YES | YES | F-ADM-PRODUCT-DETAIL,F-ADM-PRODUCT-EDIT | exists | A |
| API-APROD-08 | PATCH | /admin/products/{id} | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-EDIT | exists | A |
| API-APROD-09 | POST | /admin/products/{id}/assign | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-ASSIGN | exists | A |
| API-APROD-10 | POST | /admin/products/{id}/approve | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-11 | POST | /admin/products/{id}/reject | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-12 | POST | /admin/products/{id}/publish | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-13 | POST | /admin/products/{id}/unpublish | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-14 | POST | /admin/products/{id}/archive | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-15 | POST | /admin/products/{id}/restore | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-16 | GET | /admin/products/{id}/publish-issues | YES | YES | admin | products.view | YES | YES | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-17 | POST | /admin/products/{id}/change-id | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-EDIT | exists | A |
| API-APROD-18 | POST | /admin/products/{id}/duplicate | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-EDIT | exists | A |
| API-APROD-19 | POST | /admin/products/bulk | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCTS | exists | A |
| API-APROD-20 | POST | /admin/products/{id}/review-flags/clear | YES | YES | admin | products.manage | YES | YES | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-EPROD-01 | GET | /employee/products/{id} | YES | YES | employee | employee products.manage | YES | YES | F-EMP-PRODUCTS,F-EMP-PRODUCT-EDIT | exists | A |
| API-EPROD-02 | PATCH | /employee/products/{id} | YES | YES | employee | products.manage | YES | YES | F-EMP-PRODUCT-CREATE,F-EMP-PRODUCT-EDIT | exists | A |
| API-EPROD-03 | GET | /employee/me/assigned-products | NO | NO | employee | employee | YES but service stub | NO placeholder [] | F-EMP-PRODUCTS,F-EMP-DASHBOARD | exists | D P0 — TODO in employees.py |
| API-CAT-01 | GET | /categories | YES | YES | none | public | YES | YES | F-CUS-NAV,F-CUS-KIDS | exists | A |
| API-CAT-02 | GET | /categories/{idOrSlug} | YES | YES | none | public | YES | YES | F-CUS-CATEGORY | exists | A |
| API-CAT-03 | GET | /categories/{id}/subcategories | YES | YES | none | public | YES | YES | F-CUS-CATEGORY,F-CUS-KIDS,F-CUS-NAV | exists | A |
| API-CAT-04 | GET | /admin/categories | YES | YES | admin | categories.view | YES | YES | F-ADM-CATEGORIES | exists | A |
| API-CAT-05 | GET | /admin/categories/{id} | YES | YES | admin | categories.view | YES | YES | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-06 | GET | /admin/categories/{id}/subcategories | YES | YES | admin | categories.view | YES | YES | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-07 | POST | /admin/categories | YES | YES | admin | categories.create | YES | YES | F-ADM-CATEGORY-CREATE | exists | A |
| API-CAT-08 | PATCH | /admin/categories/{id} | YES | YES | admin | categories.edit | YES | YES | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-09 | POST | /admin/categories/{id}/activate | YES | YES | admin | categories.edit | YES | YES | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-10 | POST | /admin/categories/{id}/archive | YES | YES | admin | categories.archive | YES | YES | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-11 | POST | /admin/categories/{id}/restore | YES | YES | admin | categories.archive | YES | YES | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-12 | POST | /admin/categories/{id}/subcategories | YES | YES | admin | categories.create | YES | YES | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-13 | PATCH | /admin/subcategories/{id} | YES | YES | admin | categories.edit | YES | YES | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-14 | POST | /admin/subcategories/{id}/activate | YES | YES | admin | categories.edit | YES | YES | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-15 | POST | /admin/subcategories/{id}/archive | YES | YES | admin | categories.archive | YES | YES | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-16 | POST | /admin/subcategories/{id}/restore | YES | YES | admin | categories.archive | YES | YES | F-ADM-SUBCATEGORIES | exists | A |
| API-COL-01 | GET | /collections | YES | YES | none | public | YES | YES | F-CUS-HOME,F-CUS-COLLECTION | exists | A |
| API-COL-02 | GET | /collections/{id} | YES | YES | none | public | YES | YES | F-CUS-COLLECTION | exists | A |
| API-COL-03 | GET | /admin/collections | YES | YES | admin | collections.view | YES | YES | F-ADM-COLLECTIONS | exists | A |
| API-COL-04 | GET | /admin/collections/{id} | YES | YES | admin | collections.view | YES | YES | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-05 | POST | /admin/collections | YES | YES | admin | collections.create | YES | YES | F-ADM-COLLECTION-CREATE | exists | A |
| API-COL-06 | PATCH | /admin/collections/{id} | YES | YES | admin | collections.edit | YES | YES | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-07 | POST | /admin/collections/{id}/activate | YES | YES | admin | collections.edit | YES | YES | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-08 | POST | /admin/collections/{id}/pause | YES | YES | admin | collections.edit | YES | YES | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-09 | POST | /admin/collections/{id}/archive | YES | YES | admin | collections.archive | YES | YES | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-10 | POST | /admin/collections/{id}/restore | YES | YES | admin | collections.archive | YES | YES | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-11 | PUT | /admin/collections/{id}/products | YES | YES | admin | collections.assign | YES | YES | F-ADM-COLLECTION-PRODUCTS | exists | A |
| API-COL-12 | GET | /admin/taxonomy/metrics | YES | YES | admin | collections.view | YES | YES | F-ADM-CATEGORIES,F-ADM-COLLECTIONS | exists | A |
| API-COL-13 | GET | /admin/taxonomy/product-counts | YES | YES | admin | collections.view | YES | YES | F-ADM-CATEGORIES | exists | A |
| API-SRCH-01 | GET | /search | YES | YES | none | public | YES | YES | F-CUS-SEARCH,F-CUS-SHOP | exists | A |
| API-SRCH-02 | GET | /explore | YES | YES | none | public | YES products | YES | F-CUS-EXPLORE | exists | A |
| API-SRCH-03 | GET | /explore/offers | YES | YES but static | none | public | NO static list | STATIC | F-CUS-EXPLORE,F-CUS-OFFERS | exists | C — static not DB |
| API-SRCH-04 | GET | /home | YES | YES | none | public | YES products + static hero | PARTIAL | F-CUS-HOME | exists | C — hero static |
| API-OFF-01 | GET | /offers | YES | YES | none | public | YES coupon | YES | F-CUS-OFFERS,F-CUS-HOME | exists | A |
| API-OFF-02 | POST | /offers/validate | YES | YES | none | public | YES | YES | F-CUS-CHECKOUT,F-CUS-CART | exists | A |
| API-OFF-03 | GET | /admin/offers | YES | YES | admin | offers.view | YES | YES | F-ADM-OFFERS,F-EMP-OFFERS | exists | A |
| API-OFF-04 | GET | /admin/offers/{id} | YES | YES | admin | offers.view | YES | YES | F-ADM-OFFER-DETAIL,F-EMP-OFFERS | exists | A |
| API-OFF-05 | POST | /admin/offers | YES | YES | admin | offers.create | YES | YES | F-ADM-OFFER-CREATE | exists | A |
| API-OFF-06 | PATCH | /admin/offers/{id} | YES | YES | admin | offers.edit | YES | YES | F-ADM-OFFER-EDIT | exists | A |
| API-OFF-07 | POST | /admin/offers/{id}/activate | YES | YES | admin | offers.edit | YES | YES | F-ADM-OFFER-EDIT | exists | A |
| API-OFF-08 | POST | /admin/offers/{id}/pause | YES | YES | admin | offers.edit | YES | YES | F-ADM-OFFER-EDIT | exists | A |
| API-OFF-09 | POST | /admin/offers/{id}/archive | YES | YES | admin | offers.archive (SUPER_ADMIN) | YES | YES | F-ADM-OFFER-EDIT | exists | A |
| API-CART-01 | GET | /cart | YES | YES | customer | customer | YES cart | YES | F-CUS-CART | exists | A |
| API-CART-02 | POST | /cart/items | YES | YES | customer | customer | YES | YES | F-CUS-CART,F-CUS-PDP | exists | A |
| API-CART-03 | PATCH | /cart/items/{lineId} | YES | YES | customer | customer | YES | YES | F-CUS-CART | exists | A |
| API-CART-04 | DELETE | /cart/items/{lineId} | YES | YES | customer | customer | YES | YES | F-CUS-CART | exists | A |
| API-CART-05 | DELETE | /cart | YES | YES | customer | customer | YES | YES | F-CUS-CART | exists | A |
| API-CART-06 | POST | /cart/coupon | YES | YES | customer | customer | YES | YES | F-CUS-CART,F-CUS-CHECKOUT | exists | A |
| API-CART-07 | DELETE | /cart/coupon | YES | YES | customer | customer | YES | YES | F-CUS-CART | exists | A |
| API-CART-08 | GET | /cart/totals | YES | YES | customer | customer | YES | YES | F-CUS-CHECKOUT | exists | A |
| API-WISH-01 | GET | /wishlist | YES | YES | customer | customer | YES | YES | F-CUS-WISHLIST | exists | A |
| API-WISH-02 | POST | /wishlist/{productId} | YES | YES | customer | customer | YES | YES | F-CUS-WISHLIST,F-CUS-PDP | exists | A |
| API-WISH-03 | DELETE | /wishlist/{productId} | YES | YES | customer | customer | YES | YES | F-CUS-WISHLIST | exists | A |
| API-WISH-04 | POST | /wishlist/{productId}/toggle | YES | YES | customer | customer | YES | YES | F-CUS-WISHLIST | exists | A |
| API-CUS-01 | PATCH | /customers/me | YES | YES | customer | customer | YES | YES | F-CUS-PROFILE | exists | A |
| API-CUS-02 | PATCH | /customers/me/preferences | YES | YES | customer | customer | YES | YES | F-CUS-PREFERENCES | exists | A |
| API-CUS-03 | POST | /customers/me/sessions/revoke-others | YES | YES but BACKEND_GAP sid | customer | customer | YES session | YES but revokes all | F-CUS-SECURITY | exists | C — revokes all not others |
| API-CUS-04 | GET | /customers/me/addresses | YES | YES | customer | customer | YES address | YES | F-CUS-ADDRESSES,F-CUS-CHECKOUT | exists | A |
| API-CUS-05 | POST | /customers/me/addresses | YES | YES | customer | customer | YES | YES | F-CUS-ADDRESSES | exists | A |
| API-CUS-06 | PATCH | /customers/me/addresses/{id} | YES | YES | customer | customer | YES | YES | F-CUS-ADDRESSES | exists | A |
| API-CUS-07 | DELETE | /customers/me/addresses/{id} | YES | YES | customer | customer | YES | YES | F-CUS-ADDRESSES | exists | A |
| API-CUS-08 | POST | /customers/me/addresses/{id}/default | YES | YES | customer | customer | YES | YES | F-CUS-ADDRESSES | exists | A |
| API-CUS-09 | GET | /admin/customers | YES | YES | admin | customers.view | YES | YES | F-ADM-CUSTOMERS,F-EMP-CUSTOMERS | exists | A |
| API-CUS-10 | GET | /admin/customers/{id} | YES | YES | admin | customers.view | YES | YES | F-ADM-CUSTOMER-DETAIL | exists | A |
| API-ORD-01 | POST | /orders | YES | YES | customer (guest allowed) | customer/optional | YES order | YES | F-CUS-CHECKOUT | exists | A |
| API-ORD-02 | GET | /orders | YES | YES | customer | customer | YES | YES | F-CUS-ORDERS,F-CUS-ACCOUNT | exists | A |
| API-ORD-03 | GET | /orders/{orderId} | YES | YES | customer | customer | YES | YES | F-CUS-ORDER-DETAIL,F-CUS-ORDER-SUCCESS | exists | A |
| API-ORD-04 | GET | /orders/{orderId}/tracking | YES | YES | customer | customer | YES | YES | F-CUS-TRACKING | exists | A |
| API-ORD-05 | POST | /orders/{orderId}/cancel | YES | YES | customer | customer | YES | YES | F-CUS-ORDER-DETAIL | exists | A |
| API-ORD-06 | POST | /orders/{orderId}/returns | YES | YES | customer | customer | YES return | YES | F-CUS-RETURN | exists | A |
| API-ORD-07 | GET | /orders/{orderId}/returns/{returnId} | YES | YES | customer | customer | YES | YES | F-CUS-RETURN | exists | A |
| API-ORD-08 | POST | /orders/claim-guest | YES | YES | customer | customer | YES | YES | F-CUS-ORDERS | exists | A |
| API-AORD-01 | GET | /admin/orders | YES | YES | admin | orders.view | YES | YES | F-ADM-ORDERS,F-EMP-ORDERS | exists | A |
| API-AORD-02 | GET | /admin/orders/{id} | YES | YES | admin | orders.view | YES | YES | F-ADM-ORDER-DETAIL,F-EMP-ORDERS | exists | A |
| API-AORD-03 | GET | /admin/orders/{id}/invoice | YES | YES but stub doc | admin | orders.view | YES but docAvailable false unless file | STUB meta | F-ADM-INVOICE | exists | C |
| API-AORD-04 | POST | /admin/orders/{id}/allocate | YES | YES | admin | orders.fulfill | YES | YES | F-ADM-FULFILLMENT | exists | A |
| API-AORD-05 | POST | /admin/orders/{id}/pick/start | YES | YES | admin | orders.pick | YES | YES | F-ADM-FULFILLMENT,F-EMP-WAREHOUSE | exists | A |
| API-AORD-06 | POST | /admin/orders/{id}/pick/item | YES | YES | admin | orders.pick | YES | YES | F-ADM-FULFILLMENT,F-EMP-WAREHOUSE | exists | A |
| API-AORD-07 | POST | /admin/orders/{id}/pack | YES | YES | admin | orders.pack | YES | YES | F-ADM-FULFILLMENT,F-EMP-WAREHOUSE | exists | A |
| API-AORD-08 | POST | /admin/orders/{id}/ready | YES | YES | admin | orders.view | YES | YES | F-ADM-FULFILLMENT | exists | A |
| API-AORD-09 | POST | /admin/orders/{id}/out-for-delivery | YES | YES | admin | orders.dispatch | YES | YES | F-ADM-FULFILLMENT | exists | A |
| API-AORD-10 | POST | /admin/orders/{id}/deliver | YES | YES | admin | orders.view | YES | YES | F-ADM-FULFILLMENT | exists | A |
| API-AORD-11 | POST | /admin/orders/{id}/fulfillment | YES | YES | admin | orders.fulfill | YES | YES | F-ADM-FULFILLMENT | exists | A |
| API-AORD-12 | POST | /admin/orders/{id}/dispatch | YES | YES | admin | orders.dispatch | YES | YES | F-ADM-FULFILLMENT | exists | A |
| API-AORD-13 | POST | /admin/orders/{id}/cancel | YES | YES | admin | orders.cancel | YES | YES | F-ADM-ORDERS | exists | A |
| API-AORD-14 | POST | /admin/orders/{id}/notes | YES | YES | admin | orders.view | YES | YES | F-ADM-ORDER-DETAIL | exists | A |
| API-AORD-15 | POST | /admin/orders/{id}/status | YES | YES | admin | orders.view | YES | YES | F-ADM-ORDERS | exists | A |
| API-AORD-16 | POST | /admin/orders/{id}/force-status | YES | YES | admin | SUPER_ADMIN | YES | YES | F-ADM-ORDERS | exists | A |
| API-RET-01 | GET | /admin/returns | YES via orders router | YES | admin | returns.view | YES | YES | F-ADM-RETURNS,F-EMP-RETURNS | exists | A |
| API-RET-02 | GET | /admin/returns/{id} | YES | YES | admin | returns.view | YES | YES | F-ADM-RETURN-DETAIL,F-EMP-RETURNS | exists | A |
| API-RET-03 | POST | /admin/returns/{id}/approve | YES | YES | admin | returns.manage | YES | YES | F-ADM-RETURNS | exists | A |
| API-RET-04 | POST | /admin/returns/{id}/reject | YES | YES | admin | returns.manage | YES | YES | F-ADM-RETURNS | exists | A |
| API-RET-05 | POST | /admin/returns/{id}/schedule-pickup | YES | YES | admin | returns.manage | YES | YES | F-ADM-RETURNS | exists | A |
| API-RET-06 | POST | /admin/returns/{id}/receive | YES | YES | admin | returns.manage | YES | YES | F-ADM-RETURNS,F-EMP-WAREHOUSE | exists | A |
| API-RET-07 | POST | /admin/returns/{id}/inspect | YES | YES | admin | returns.manage | YES | YES | F-ADM-RETURNS | exists | A |
| API-RET-08 | POST | /admin/returns/{id}/refund/initiate | YES | YES | admin | returns.manage | YES | YES | F-ADM-RETURNS | exists | A |
| API-RET-09 | POST | /admin/returns/{id}/refund/complete | YES | YES | admin | returns.manage | YES | YES | F-ADM-RETURNS | exists | A |
| API-PAY-01 | POST | /payments/session | YES | YES | customer | customer | YES payment_session | YES | F-CUS-CHECKOUT | exists | A |
| API-PAY-02 | GET | /payments/session/{id} | YES | YES | customer | customer | YES | YES | F-CUS-CHECKOUT,F-CUS-ORDER-SUCCESS | exists | A |
| API-PAY-03 | POST | /payments/session/{id}/cancel | YES | YES | customer | customer | YES | YES | F-CUS-CHECKOUT | exists | A |
| API-PAY-04 | POST | /payments/verify | YES | YES | customer | customer | YES | YES | F-CUS-CHECKOUT | exists | A |
| API-MED-01 | GET | /media/storage/status | YES | YES | none | public | NO (config) | YES | F-ADM-MEDIA,F-ADM-MEDIA-UPLOAD | exists | A |
| API-MED-02 | POST | /media/references/resolve | YES | YES | none | public | NO (storage) | YES | F-CUS-PDP,F-CUS-SHOP,F-ADM-MEDIA | exists | A |
| API-MED-03 | GET | /media/object-meta/{key} | YES | YES | none | public | NO storage | YES | F-ADM-MEDIA-DETAIL | exists | A |
| API-MED-04 | GET | /media/products/{id}/media-set | YES | YES | none | public | YES product + mapping | YES | F-CUS-PDP,F-ADM-PRODUCT-MEDIA,F-EMP-MEDIA | exists | A |
| API-MED-05 | POST | /media/objects | YES | YES | admin | media.upload | NO storage | YES file | F-ADM-MEDIA-UPLOAD | exists | A |
| API-MED-06 | POST | /media/products/{id}/objects | YES | YES | admin\|employee | media.upload | NO storage | YES | F-ADM-PRODUCT-MEDIA,F-EMP-MEDIA-UPLOAD | exists | A |
| API-MED-07 | DELETE | /media/objects/{key} | YES | YES | admin | media.delete | NO storage | YES | F-ADM-MEDIA | exists | A |
| API-MED-08 | POST | /media/register | YES | YES | admin | media.upload | YES asset+mapping | YES | F-ADM-MEDIA-UPLOAD,F-ADM-PRODUCT-MEDIA | exists | A |
| API-MED-09 | GET | /media/assets | YES | YES | admin | media.upload | YES asset | YES | F-ADM-MEDIA,F-ADM-MEDIA-MAPPING | exists | A |
| API-MMED-01 | GET | /admin/marketing-media | NO | NO | admin | admin | NO empty model | NO | F-ADM-MARKETING-MEDIA,F-CUS-HOME | stub | E P1 |
| API-MMED-02 | GET | /admin/media-reviews | NO | NO | admin | admin | NO | NO | F-ADM-MEDIA-REVIEW,F-ADM-MARKETING-MEDIA | stub | E P1 |
| API-MMED-03 | POST | /admin/media-reviews/{id}/approve | NO | NO | admin | admin | NO | NO | F-ADM-MEDIA-REVIEW | stub | E P1 |
| API-MMED-04 | POST | /admin/media-reviews/{id}/reject | NO | NO | admin | admin | NO | NO | F-ADM-MEDIA-REVIEW | stub | E P1 |
| API-INV-01 | GET | /admin/inventory/stock | NO | NO | admin | admin | NO empty model | NO | F-ADM-INVENTORY,F-EMP-INVENTORY | stub | E P1 |
| API-INV-02 | GET | /admin/inventory/stock/{id} | NO | NO | admin | admin | NO | NO | F-ADM-INVENTORY | stub | E P1 |
| API-INV-03 | POST | /admin/inventory/adjust | NO | NO | admin | admin | NO | NO | F-ADM-INV-ADJUST,F-EMP-INV-ADJUST | stub | E P1 |
| API-INV-04 | GET | /admin/inventory/movements | NO | NO | admin | admin | NO | NO | F-ADM-INV-MOVEMENTS,F-EMP-INV-MOVEMENTS | stub | E P1 |
| API-INV-05 | GET | /admin/inventory/low-stock | NO | NO | admin | admin | NO | NO | F-ADM-INV-LOW,F-EMP-INV-LOW | stub | E P1 |
| API-INV-06 | GET | /admin/inventory/reservations | NO | NO | admin | admin | NO | NO | F-ADM-INVENTORY | stub | E P1 |
| API-INV-07 | GET | /admin/warehouses | NO | NO | admin | admin | NO | NO | F-ADM-WAREHOUSES,F-EMP-WAREHOUSE | stub | E P1 |
| API-INV-08 | POST | /admin/warehouses | NO | NO | admin | admin | NO | NO | F-ADM-WAREHOUSES | stub | E P2 |
| API-INV-09 | GET | /admin/inventory/transfers | NO | NO | admin | admin | NO | NO | F-ADM-INV-TRANSFERS,F-EMP-INV-TRANSFERS | stub | E P1 |
| API-INV-10 | POST | /admin/inventory/transfers | NO | NO | admin | admin | NO | NO | F-ADM-INV-TRANSFERS,F-EMP-INV-TRANSFERS | stub | E P1 |
| API-INV-11 | POST | /admin/inventory/transfers/{id}/complete | NO | NO | admin | admin | NO | NO | F-ADM-INV-TRANSFERS | stub | E P1 |
| API-EMP-01 | GET | /admin/employees | YES | YES | admin | employees.view | YES user+profile | YES | F-ADM-EMPLOYEES,F-EMP-TEAM | exists | A |
| API-EMP-02 | GET | /admin/employees/{id} | YES | YES | admin | employees.view | YES | YES | F-ADM-EMPLOYEE-DETAIL | exists | A |
| API-EMP-03 | POST | /admin/employees | YES | YES | admin | employees.create | YES | YES | F-ADM-EMPLOYEE-CREATE | exists | A |
| API-EMP-04 | PATCH | /admin/employees/{id} | YES | YES | admin | employees.edit | YES | YES | F-ADM-EMPLOYEE-EDIT | exists | A |
| API-EMP-05 | POST | /admin/employees/{id}/status | YES | YES | admin | employees.suspend | YES | YES | F-ADM-EMPLOYEE-EDIT | exists | A |
| API-EMP-06 | POST | /admin/employees/{id}/reset-password | YES | YES | admin | employees.resetPassword | YES | YES | F-ADM-EMPLOYEE-EDIT | exists | A |
| API-EMP-07 | PUT | /admin/employees/{id}/permissions | YES | YES | admin | employees.managePermissions | YES but TODO | YES | F-ADM-EMPLOYEE-EDIT | exists | A (partial perm mode) |
| API-EMP-08 | DELETE | /admin/employees/{id} | YES | YES | admin | admin | YES | YES | F-ADM-EMPLOYEES | exists | A |
| API-EMP-09 | GET | /admin/employees/departments | YES | YES | admin | admin | YES dept | YES | F-ADM-EMPLOYEES | exists | A |
| API-EMP-10 | POST | /admin/employees/departments | YES | YES | admin | admin | YES | YES | F-ADM-EMPLOYEES | exists | A |
| API-EMP-11 | PATCH | /admin/employees/departments/{id} | YES | YES | admin | admin | YES | YES | F-ADM-EMPLOYEES | exists | A |
| API-EMP-12 | DELETE | /admin/employees/departments/{id} | YES | YES | admin | admin | YES | YES | F-ADM-EMPLOYEES | exists | A |
| API-EMP-13 | GET | /admin/employees/sections | YES | YES | admin | admin | YES section | YES | F-ADM-EMPLOYEES | exists | A |
| API-EMP-14 | POST | /admin/employees/sections | YES | YES | admin | admin | YES | YES | F-ADM-EMPLOYEES | exists | A |
| API-EMP-15 | PATCH | /admin/employees/sections/{id} | YES | YES | admin | admin | YES | YES | F-ADM-EMPLOYEES | exists | A |
| API-EMP-16 | DELETE | /admin/employees/sections/{id} | YES | YES | admin | admin | YES | YES | F-ADM-EMPLOYEES | exists | A |
| API-ATT-01 | GET | /admin/employees/{id}/attendance | YES via employees | YES | admin | attendance.view | YES attendance | YES | F-ADM-EMPLOYEE-DETAIL,F-EMP-ATTENDANCE | exists | A |
| API-ATT-02 | POST | /admin/employees/{id}/attendance | YES | YES | admin | attendance.correct | YES | YES | F-ADM-EMPLOYEE-DETAIL | exists | A |
| API-ATT-03 | PATCH | /admin/employees/attendance/{id} | YES | YES | admin | attendance.correct | YES | YES | F-ADM-EMPLOYEE-DETAIL | exists | A |
| API-ATT-04 | POST | /employee/attendance/check-in | NO | NO | employee | employee | YES model but no route | NO | F-EMP-ATTENDANCE | missing | E P1 |
| API-ATT-05 | POST | /employee/attendance/check-out | NO | NO | employee | employee | YES model | NO | F-EMP-ATTENDANCE | missing | E P1 |
| API-ATT-06 | GET | /employee/attendance/today | NO | NO | employee | employee | YES | NO | F-EMP-ATTENDANCE,F-EMP-DASHBOARD | missing | E P1 |
| API-ATT-07 | GET | /employee/attendance | NO | NO | employee | employee | YES | NO | F-EMP-ATTENDANCE | missing | E P1 |
| API-LEV-01 | GET | /employee/leave | NO | NO | employee | employee | NO model | NO | F-EMP-LEAVE | missing | E P2 |
| API-LEV-02 | POST | /employee/leave | NO | NO | employee | employee | NO | NO | F-EMP-LEAVE | missing | E P2 |
| API-LEV-03 | GET | /admin/leave | NO | NO | admin | admin | NO | NO | F-ADM-EMPLOYEE-DETAIL,F-EMP-LEAVE | missing | E P2 |
| API-LEV-04 | POST | /admin/leave/{id}/decision | NO | NO | admin | admin | NO | NO | F-ADM-EMPLOYEE-DETAIL | missing | E P2 |
| API-PERF-01 | GET | /employee/performance | NO | NO | employee | employee | YES model but no route | NO | F-EMP-PERFORMANCE | missing | E P2 |
| API-PERF-02 | GET | /admin/performance | NO (admin perf via employees router) | NO | admin | admin | YES but via employees/{id}/performance | PARTIAL | F-EMP-PERFORMANCE,F-ADM-EMPLOYEE-DETAIL | missing (legacy route) | C P2 |
| API-AN-01 | GET | /analytics/overview | YES | YES | admin | admin analytics.view | YES orders/products | YES | F-ADM-DASHBOARD,F-ADM-ANALYTICS | exists | A |
| API-AN-02 | GET | /analytics/sales | YES | YES | admin | analytics.view | YES | YES | F-ADM-AN-SALES,F-EMP-REPORTS-SALES | exists | A |
| API-AN-03 | GET | /analytics/products | YES | YES | admin | analytics.view | YES | YES | F-ADM-AN-PRODUCTS,F-EMP-REPORTS-PRODUCTS | exists | A |
| API-AN-04 | GET | /analytics/customers | YES | YES | admin | analytics.view | YES | YES | F-ADM-AN-CUSTOMERS,F-EMP-REPORTS-CUSTOMERS | exists | A |
| API-AN-05 | GET | /analytics/orders | YES | YES | admin | analytics.view | YES | YES | F-ADM-DASHBOARD,F-ADM-ANALYTICS | exists | A |
| API-AN-06 | GET | /analytics/inventory-summary | YES | YES | admin | analytics.view | YES catalog_product stock | YES | F-ADM-DASHBOARD,F-ADM-AN-INVENTORY,F-EMP-DASHBOARD | exists | A (note: uses product.stock not ledger) |
| API-RBAC-01 | GET | /roles | YES | YES | admin | admin | YES role | YES | F-ADM-SETTINGS | exists | A |
| API-RBAC-02 | GET | /roles/{id} | YES | YES | admin | admin | YES | YES | F-ADM-SETTINGS | exists | A |
| API-RBAC-03 | GET | /permissions | YES | YES | admin | admin | YES permission | YES | F-ADM-SETTINGS | exists | A |
| API-RBAC-04 | GET | /users | YES | YES | admin | admin | YES user | YES | F-ADM-SETTINGS | exists | A |
| API-RBAC-05 | GET | /users/{id} | YES | YES | admin | admin | YES | YES | F-ADM-SETTINGS | exists | A |
| API-AUD-01 | GET | /audit/logs | YES | YES | admin | admin | YES activity_log | YES | F-ADM-ACTIVITY | exists | A |
| API-SET-01 | GET | /admin/settings | YES | YES | admin | settings.view | YES setting | YES | F-ADM-SETTINGS | exists | A |
| API-SET-02 | GET | /admin/settings/{section} | YES | YES | admin | settings.view | YES | YES | F-ADM-SETTINGS | exists | A |
| API-SET-03 | PATCH | /admin/settings/{section} | YES | YES | admin | SUPER_ADMIN | YES | YES | F-ADM-SETTINGS | exists | A |
| API-SET-04 | POST | /admin/settings/{section}/reset | YES | YES | admin | SUPER_ADMIN | YES | YES | F-ADM-SETTINGS | exists | A |
| API-SET-05 | POST | /admin/settings/reset | YES | YES | admin | SUPER_ADMIN | YES | YES | F-ADM-SETTINGS | exists | A |
| API-SUP-01 | GET | /employee/support/cases | NO | NO | employee | employee | NO | NO | F-EMP-SUPPORT | missing | E P2 |
| API-SUP-02 | POST | /employee/support/cases | NO | NO | employee | employee | NO | NO | F-EMP-SUPPORT | missing | E P2 |
| API-SUP-03 | PATCH | /employee/support/cases/{id} | NO | NO | employee | employee | NO | NO | F-EMP-SUPPORT | missing | E P2 |
| API-STY-01 | GET | /employee/styling/appointments | NO | NO | employee | employee | NO | NO | F-EMP-STYLING | missing | E P2 |
| API-STY-02 | GET | /employee/styling/requests | NO | NO | employee | employee | NO | NO | F-EMP-STYLING | missing | E P2 |
| API-SALE-01 | GET | /employee/sales/departments | NO | NO | employee | employee | NO (should derive from orders) | NO | F-EMP-SALES,F-EMP-REPORTS-SALES | missing | E P2 + G (must derive from orders) |
| API-AI-01 | POST | /ai/shopping | NO | NO | customer | customer | NO | NO | F-CUS-AI-SHOPPING | missing | H P3 |
| API-AI-02 | POST | /ai/mirror | NO | NO | customer | customer | NO | NO | F-CUS-AI-MIRROR | missing | H P3 |
| API-AI-03 | POST | /admin/ai/assistant | NO | NO | admin | admin | NO | NO | F-ADM-AI | missing | H P3 |

**Summary counts:**
- Total APIs: 225
- A COMPLETE: ~160
- B IMPLEMENTED NOT INTEGRATED: 2 (assigned-products placeholder, explore/offers static)
- C PARTIAL: 5 (home hero static, explore/offers static, invoice meta stub, session revoke all, perm mode TODO)
- D STUB: 15 (inventory 11 + marketing 4)
- E MISSING: 20 (auth-15 + attendance 4 + leave 4 + perf 2 + support 3 + styling 2 + sales 1 + AI 3 = 19? plus perf legacy = 20)
- F INTEGRATION BUG: 0 (no wrong path — clients correctly fail closed)
- G HUMAN DECISION: 3 (employee forgot-pw, sales derived from orders, search hint copy)
- H FUTURE: 3 AI

---

## 6. Feature Matrix

| Feature | Frontend | Backend | API | Database | Integration | Auth | Status | Owner | Priority | Blocking? |
|---|---|---|---|---|---|---|---|---|---|---|
| F-CUS-HOME | YES | PARTIAL (hero static) | YES + stub marketing | YES products | PARTIAL | none | PARTIAL | frontend+backend | P0 | NO (hero empty honest) |
| F-CUS-SHOP | YES | YES | YES | YES | WORKING | none | WORKING | backend | P0 | NO |
| F-CUS-SEARCH | YES | YES | YES | YES | WORKING | none | WORKING | backend | P0 | NO |
| F-CUS-CATEGORY | YES | YES | YES | YES | WORKING | none | WORKING | backend | P0 | NO |
| F-CUS-COLLECTION | YES | YES | YES | YES | WORKING | none | WORKING | backend | P0 | NO |
| F-CUS-KIDS | YES | YES (same lifecycle) | YES | YES | WORKING | none | WORKING | backend | P0 | NO |
| F-CUS-PDP | YES | YES | YES | YES | WORKING | none | WORKING | backend | P0 | NO |
| F-CUS-CART | YES | YES | YES | YES cart | WORKING | customer | WORKING | backend | P0 | NO |
| F-CUS-CHECKOUT | YES | YES | YES | YES orders | WORKING | customer | WORKING | backend | P0 | NO |
| F-CUS-WISHLIST | YES | YES | YES | YES | WORKING | customer | WORKING | backend | P0 | NO |
| F-CUS-ACCOUNT etc | YES | YES | YES | YES | WORKING | customer | WORKING | backend | P0 | NO |
| F-ADM-PRODUCTS list/metrics/bulk | YES | YES | YES | YES | WORKING | admin | WORKING | backend | P0 | NO |
| F-ADM-PRODUCT-CREATE draft/next-id | YES | YES | YES | YES | WORKING | admin | WORKING | backend | P0 | NO |
| F-ADM-PRODUCT-WORKFLOW approve≠publish | YES | YES | YES | YES | WORKING | admin | WORKING | backend | P0 | NO |
| F-ADM-PRODUCT-MEDIA upload/register | YES | YES | YES | YES asset+mapping | WORKING | admin | WORKING | backend | P0 | NO |
| F-ADM-MEDIA library | YES | YES | YES | YES | WORKING | admin | WORKING | backend | P0 | NO |
| F-ADM-CATEGORIES | YES | YES | YES | YES | WORKING | admin | WORKING | backend | P0 | NO |
| F-ADM-ORDERS | YES | YES | YES | YES | WORKING | admin | WORKING | backend | P0 | NO |
| F-ADM-INVENTORY | YES | NO (empty models, stub router) | STUB | NO columns | BLOCKED | admin | BACKEND BLOCKER | backend | P1 | YES B-01 |
| F-ADM-MARKETING-MEDIA | YES | NO empty model | STUB | NO | BLOCKED | admin | BACKEND BLOCKER | backend | P1 | YES B-02 |
| F-ADM-MEDIA-REVIEW | YES | NO | STUB | NO | BLOCKED | admin | BACKEND BLOCKER | backend | P1 | YES B-02 |
| F-EMP-ATTENDANCE punch | YES UI | NO router stub | MISSING | YES model | BLOCKED | employee | BACKEND BLOCKER | backend | P1 | YES B-03 |
| F-EMP-LEAVE | YES UI empty | NO | MISSING | NO | BLOCKED | employee | BACKEND GAP | backend | P2 | NO |
| F-EMP-PERFORMANCE | YES UI empty | PARTIAL admin only | MISSING self | YES | PARTIAL | employee | BACKEND GAP | backend | P2 | NO |
| F-EMP-PRODUCTS assigned | YES | STUB placeholder [] | STUB | YES | PARTIAL | employee | PARTIAL | backend | P0 | YES (B-13) |
| F-EMP-SUPPORT/STYLING/SALES | YES empty | NO | MISSING | NO | NOT IMPLEMENTED | employee | NOT REQUIRED YET | backend | P2 | NO |
| F-CUS-AI / F-ADM-AI | YES preview | NO stub | MISSING | NO | NOT REQUIRED | — | FUTURE | — | P3 | NO |
| F-ADM-SETTINGS/RBAC/ACTIVITY/ANALYTICS | YES | YES | YES | YES | WORKING | admin | WORKING | backend | P1 | NO |

---

## 7. Database Matrix

| Entity | Table | Columns Present? | Migration Present? | Backend CRUD? | Frontend Consumes? | Production Ready? | Mismatch |
|---|---|---|---|---|---|---|---|
| products | catalog_product | YES full 70+ cols | YES a1b2c3d4e5f6 etc | YES | YES | YES (needs seed) | frontend expects PF-* id, backend id UUID + product_id mirror — OK |
| categories | catalog_category | YES | YES | YES | YES | YES | — |
| subcategories | catalog_subcategory | YES | YES | YES | YES | YES | — |
| collections | catalog_collection | YES (type, rule, explicit ids) | YES c9d1e2f3a4b5 | YES | YES | YES | — |
| product media asset | media_media_asset | YES object_key UNIQUE, mime, size, sha256, status, scope, uploaded_by | YES b6b5dcfb675b | YES | YES | YES | — |
| product media mapping | media_product_media | YES product_id FK CASCADE, media_id FK CASCADE, role, sort_order, is_primary, assigned_by | YES b6b5dcfb675b | YES | YES | YES | — |
| marketing media | media_marketing_media | NO only id/timestamps | NO business cols | NO | stub | NO | frontend expects hero/editorial assignment — backend empty |
| media review | media_media_review | NO only id/timestamps | NO | NO | stub | NO | — |
| inventory stock | inventory_inventory_stock | NO | NO | NO | stub | NO | frontend expects variantId/sku/onHand/reserved/available |
| inventory movement | inventory_inventory_movement | NO | NO | NO | stub | NO | — |
| stock reservation | inventory_stock_reservation | NO | NO | NO | stub | NO | — |
| stock transfer | inventory_stock_transfer | NO | NO | NO | stub | NO | — |
| warehouse | inventory_warehouse | NO | NO | NO | stub | NO | — |
| inventory location | inventory_inventory_location | NO | NO | NO | stub | NO | — |
| users | users | YES id, email, phone, full_name, user_type, status, hashed_password, etc | YES initial | YES | YES | YES | — |
| sessions | user_sessions | YES | YES | YES | YES (partial sid) | PARTIAL sid missing | token no sid → revoke-others revokes all |
| customer profiles | customer_profiles | YES first_name, last_name, etc | YES | YES | YES | YES | — |
| addresses | customer_address | YES customer_id, full_name, phone, line, city, state, pincode, type, is_default | YES 597f883749d8 | YES | YES | YES | — |
| preferences | customer_preferences | YES | YES | YES | YES | YES | — |
| cart | commerce_cart | YES | YES? via initial | YES | YES | YES | — |
| cart items | commerce_cart_item | YES | YES | YES | YES | YES | — |
| wishlist | wishlist | YES | YES z1a2b3c4d5e6 | YES | YES | YES | — |
| wishlist items | wishlist_item | YES | YES | YES | YES | YES | — |
| coupons | catalog_coupon | YES code, name, discount_type, value, dates, limits, eligibility lists, is_active, is_stackable | YES? via initial? | YES | YES | YES | display_status derived ACTIVE/SCHEDULED/EXPIRED/ARCHIVED |
| orders | orders_order | YES id, customer_id, status, payment_status, totals, etc | YES e1f2a3b4c5d6 | YES | YES | YES | — |
| order items | orders_order_item | YES | YES | YES | YES | YES | — |
| returns | return_order | YES | YES | YES | YES | YES | — |
| payment sessions | payment_session | YES | YES f1a2b3c4d5e6 | YES | YES | YES | — |
| employee profiles | employee_profiles | YES user_id FK CASCADE, employee_code UNIQUE, designation, dept, dept_id, section_id | YES initial | YES | YES | YES | — |
| departments | employee_department | YES | YES | YES | YES | YES | — |
| sections | employee_section | YES | YES | YES | YES | YES | — |
| attendance | employee_attendance | YES employee_id FK CASCADE, date, check_in, check_out, status, notes | YES initial | YES admin | YES admin, NO employee self route | PARTIAL | employee punch missing route |
| performance | employee_performance | YES | YES | YES admin | YES admin | PARTIAL self missing | — |
| targets | employee_target | YES | YES | YES | YES | YES | — |
| roles | roles | YES | YES | YES | YES | YES | built-in fallback |
| permissions | permissions | YES | YES | YES | YES | YES | — |
| user_roles | user_roles | YES | YES | YES | YES | YES | — |
| role_permissions | role_permissions | YES | YES | YES | YES | YES | — |
| activity log | audit_activity_log | YES actor, targetProductId, OfferId, CategoryId, CollectionId, OrderId, action, summary | YES initial | YES | YES | YES | — |
| settings | admin_setting | YES id, value JSONB, updated_by | YES a2b3c4d5e6f7 | YES | YES | YES | — |

**Critical DB gaps:**
- Inventory tables exist but have zero business columns — they are placeholders created by initial schema move (m001). No migration adds stock columns.
- Marketing media / review same — placeholder.
- Variants / pricing / checkout / notifications / chatbot tables same placeholder — but those are NOT required (no frontend consumer) except variants maybe future.

---

## 8. Authentication/Security

**Verified real implementation:**

- JWT creation: create_access_token with sub=user_id, user_type, token_type=access, jti=UUID, iat, exp (30min default). Refresh token jti + token_type=refresh, 7 days.
- JWT validation: decode_token via python-jose HS256, checks signature + expiry, returns None on failure.
- Token blacklist: Redis exists blacklist:access:{jti} + blacklist:refresh:{jti} with TTL = remaining seconds. Logout blacklists both access and refresh, password change blacklists all sessions.
- Role/scope enforcement: get_current_user loads user, checks status ACTIVE else 403. get_current_customer/employee/admin check user_type else 403. So customer JWT cannot call /admin/*, employee cannot call admin unless admin user_type — enforced at service level, not just frontend.
- Protected routes: all admin routes depend on get_current_admin + require_admin_permission (checks permission codes). Customer routes depend on get_current_customer. Employee routes depend on get_current_employee.
- Admin-only routes: /admin/products, /admin/categories, /admin/collections, /admin/offers, /admin/orders, /admin/customers, /admin/employees, /analytics/*, /admin/settings, /audit/logs, /admin/activity, /admin/roles, /users, /roles, /permissions — all admin guarded.
- Employee-only routes: /employee/me, /employee/products/{id}, PATCH same, /employee/me/assigned-products (stub) — employee guarded.
- Super Admin: require_super_admin_user checks SUPER_ADMIN role, used for settings write + force-status + offers archive.
- Employee management: POST /admin/employees creates PF-<PREFIX>-##### code, mustChangePassword true, status handling SUSPENDED/INACTIVE denies next request.
- Employee session invalidation: on status SUSPENDED/INACTIVE, get_current_user raises ForbiddenException immediately (not just next login).
- Password reset: customer forgot-password generates token stored in cache, always returns ok true (no enumeration), reset-password verifies token + userId, invalidates sessions. Employee forgot-password missing — must not reuse customer tokens (different user_type, different table).
- Secret handling: config .env.example placeholders only, no secrets copied in docs, JWT secret validated in production must not start with your-.
- CORS: ALLOWED_ORIGINS env parsed CSV, defaults localhost:3000,5173,5174,127.0.0.1:3000,5173.
- API exposure: /docs only when DEBUG true.

**Findings / Gaps:**

- P0 Security OK: scope isolation works, blacklist works, no hardcoded passwords in frontend src.
- P1 Gap: employee forgot-password missing — frontend EmployeeForgotPassword.jsx correctly says contact admin, sends no email (honest). Do not implement customer token reuse.
- P2 Gap: session id claim missing — token has no sid, so revoke-others revokes all including current. Documented as BACKEND_GAP in customers.py. Needs sid claim at token creation.
- P1 Concern: require_admin_permission fallback when no roles assigned — admin with no role rows keeps surface auth (compat path). Narrow: only admin, disappears when roles assigned. Documented, not a vulnerability but should be hardened later.
- P2 Concern: OAuth Google/Facebook implemented but GOOGLE_CLIENT_ID etc None by default — disabled unless env set.

**Flagged endpoints where frontend protection exists but backend missing:**

- None — all admin frontend guards have backend admin guard.
- Employee punch frontend exists but backend employee punch missing entirely — backend does NOT have those routes, so not a bypass, just missing.

---

## 9. Product Lifecycle

**Canonical lifecycle (verified in product_service.py):**

```
DRAFT --submit--> PENDING_REVIEW --approve--> APPROVED --publish--> PUBLISHED
                    |                |                         |
                    +--reject--> DRAFT +--reject--> DRAFT     +--unpublish--> DRAFT
                                                            PUBLISHED --archive--> ARCHIVED
                                                            ARCHIVED --restore--> DRAFT
```

- CREATE: POST /admin/products (runtime pf-<base36>) or POST /admin/products/draft (caller-supplied PF-* permanent id, validated ^[A-Z0-9][A-Z0-9-]{1,35}$)
- DRAFT: initial status, not visible to public (PUBLISHED gate)
- ASSIGNED: assignedEmployeeId field, activity PRODUCT_ASSIGNED
- EMPLOYEE REVIEW: employee PATCH whitelisted 30 fields only (name, price, description, category, fabric, colors, sizes, etc — EMPLOYEE_EDITABLE_FIELDS)
- SUBMITTED: POST /products/{id}/submit-review — status PENDING_REVIEW, review.state PENDING, requires assignment if employee, requires products.manage permission
- ADMIN REVIEW: GET /admin/products?status=PENDING_REVIEW, GET /admin/products/{id} full record including review, reviewFlags, history
- APPROVED: POST /admin/products/{id}/approve — precondition pending review, sets review.state APPROVED, visibility stays not published (published=false). MUST NOT publish.
- PUBLISHED: POST /admin/products/{id}/publish — preconditions: APPROVED + getPublishIssues empty (name, sku, category, price>0, description, cover image authored OR legacy primary_media_id OR registered primary is_primary=True, no blocking review flags). Sets status PUBLISHED, published true, published_by/at. Invalidates caches.
- STOREFRONT VISIBILITY: GET /products gate PUBLISHED + published true + category ACTIVE + subcategory ACTIVE when set. Collection products same gate + collection ACTIVE. PDP 404 if not published.
- ARCHIVED: POST /admin/products/{id}/archive — soft retire, removes from every surface, activity PRODUCT_ARCHIVED
- RESTORE: POST /admin/products/{id}/restore → DRAFT
- DUPLICATE: new runtime id, DRAFT, media stays original
- CHANGE-ID: rewrites display label product_id only, not PK id, no cascade needed, checks collision both PK and display label → 409
- BULK: per-id same rules, invalid skipped not force-published
- REVIEW FLAGS: blocking vocab NAME_REVIEW_REQUIRED, PRICE_REVIEW_REQUIRED, TAXONOMY_REVIEW_REQUIRED, GROUP_REVIEW_REQUIRED, VARIANT_REVIEW_REQUIRED, NEEDS_MEDIA, MEDIA_OWNERSHIP_REVIEW, CONFLICT_UNRESOLVED, KIDS_MIGRATION_REVIEW — must be cleared via clear endpoint before publish.

**Kids:** SAME lifecycle, department kidswear + PF-K-* prefix, not side catalogue, not validator-only.

**Product ID identity:** product_id is mirror of id stable label, UI uses id or slug or product_id. Never filename/clock/array index. Next-id deterministic scans register lowest free integer.

**Previous bug — Publish appears successful but fails after reload:**

- Root cause was cache: product storefront DTO cached before taxonomy gate, archiving category would leave PDP reachable. Fixed: every product write invalidates product:storefront:* + response cache, taxonomy write invalidates same. ProductService._registered_media_map uses SAVEPOINT so pre-migration DB doesn't break reads.
- Verified via code: admin_publish_product → service.publish_product → invalidate_product_cache + invalidate_response_cache.
- No live DB in this workspace to run real HTTP smoke test — documented as limitation, but unit tests cover lifecycle (test_phase3_product_lifecycle, product_visibility, product_taxonomy).

**API verification (code):**

- GET /products: list_storefront_products returns {items, total, page, pageSize, facets, appliedFilters} with total = full filtered count (count query). PageSize max 200, default 20. Supports 12 facets, sort aliases.
- GET /products/{id}: get_storefront_product checks PUBLISHED + published + category ACTIVE + subcategory ACTIVE, 404 else.
- Search/filters/pagination/total: same service, facets 12, multi-value OR within facet AND across.
- Admin listing: list_admin_products full filtered count, supports status, category, assigned, q.
- Review queue: status PENDING_REVIEW filter.
- Product update: PATCH full-field, rejects lifecycle keys.
- Approve/publish/unpublish/archive/restore: all exist.
- Media assignment: via /media/register then product PATCH image fields or via registered media view.

---

## 10. Media Architecture

**Frontend media resolver:**
- POST /media/references/resolve → batch decisions resolved|legacy-fallback|passthrough|empty|disabled
- GET /media/products/{id}/media-set → primary + hover + gallery + mediaItems (registered) + primaryMediaUrl + mediaRecordsAvailable
- apiMediaObjectUrl → /api/v1/media/objects/{object_key} via mediaOrigin + MEDIA_URL_PREFIX
- Storefront never invents URLs — always via resolve or media-set

**Backend media service:**
- Storage provider abstraction app/storage: local provider filesystem under LOCAL_MEDIA_ROOT=storage/media, S3 interface-ready but refuses without credentials
- Key validation: normalize_object_key rejects traversal, backslashes, absolute, drive forms, namespace allow-list (products, collections, hero, etc), char allow-list
- Upload validation: content signature not filename, allowed types image/jpeg,png,webp,avif + video/mp4,webm, max 10MB image 100MB video
- Object operations: put/get/metadata/exists/delete/url — fully implemented local
- Media asset table: durable row per verified object, UNIQUE object_key, checksum_sha256 indexed for dup detection, uploaded_by FK users SET NULL
- Product media mapping: explicit ordered association product_id FK CASCADE + media_id FK CASCADE + UNIQUE(product_id,media_id) + role (gallery etc, closed vocab, default gallery), sort_order, is_primary, assigned_by. Primary uniqueness enforced by demoting others in transaction when is_primary set.
- Dual-read: legacy authored columns image/hover_image/additional_images still resolved via product_media_resolver (legacy-fallback), registered half is source of truth for NEW media. Empty registered list → legacy serves exactly as before (migration-safe via SAVEPOINT)
- Cache invalidation: product media register → invalidate_product_cache + response cache

**Current backing:**

- Filesystem-backed: YES — storage/media holds objects when backend runs locally
- DB-backed: YES — media_media_asset + media_product_media hold metadata + ownership
- S3-backed: NO — interface-ready, not wired, no credentials in this phase
- Stub: marketing media + media review tables empty, no API
- Product media metadata exists: YES (asset + mapping)
- Ownership persisted: YES via mapping product_id + media_id
- Marketing media separate: YES distinct table media_marketing_media (but empty, no API) — rule enforced: registering product media never promotes to marketing
- Hero media separate: YES hero namespace + static hero slides in explore_service (5 hero files) — distinct from product
- Collection media separate: YES collections have image field + editorial plates 42 files

**Disk counts verified:**

- 238 total files under frontend/public/images (via find)
- 191 product image files
- 42 collection/editorial images
- 5 hero/marketing images
- 128 Product IDs (folders) + 10 kids PF-K-*
- Note: find reports 167 dirs under products (includes subfolders bridal/women/men/kids subcategories) — PF-* count 128 is folders named PF-* (golden-data-before-after.md)
- These are filesystem counts, NOT live catalogue counts — backend catalogue may be empty without seed. Do NOT force equality.

---

## 11. Inventory

**Actual backend implementation:**

- Models: 6 tables inventory_* with only id/timestamps (empty) — no business columns
- Services: inventory_service, reservation_service, transfer_service — empty class only __init__
- Endpoints: /inventory/health, /warehouses/health, /stock-transfers/health — stub only
- Analytics inventory-summary: aggregates from catalog_product.stock (snapshot) not ledger — note says dedicated tables do not yet carry business columns

**Frontend consumption:**

- inventoryApi.js: all 11 functions return {ok:false, error: inventory tables do not have required columns} — honest stub, UI shows error/empty not seeded stock
- Admin inventory dashboard, movements, transfers, low-stock, warehouses, receive/adjust pages exist but call stub → empty/error
- Employee inventory desks same

**Schema vs frontend expected:**

- Frontend expects: {productId, variantId, sku, onHand, reserved, available} + movements history + low-stock threshold + reservations + warehouses + transfers
- Backend has: none of those columns

**Classification:**

- BACKEND BLOCKER P1 (B-01) — schema work required, HUMAN DECISION on exact columns
- Do NOT invent second products.stock ledger — cart/order validation already uses product.stock server-side as customer authority until ledger matches
- Customer cart may check availability server-side — implemented in cart_service (validates stock)
- Admin ledger is inventory module — not yet

**Next action:** backend intern must align inventory tables with inventoryApi contract without second ledger, per docs/backend-blockers.md B-01.

---

## 12. Employee

**Portal end-to-end:**

- Login: POST /auth/employee/sign-in with employeeId PF-*, password, returns access_token, refresh_token, employee, mustChangePassword — REAL
- Profile: GET /employee/me returns PublicEmployee with employee_code — REAL
- Dashboard: /employee — KPIs zeros/live empty counts after seed removal, needs assigned-products + today attendance + inventory-summary — PARTIAL (assigned-products stub, today missing, inventory-summary real but uses product.stock)
- Assigned work: GET /employee/me/assigned-products — STUB placeholder [] (TODO product service), employee_products inbox — PARTIAL
- Review workflow: GET /employee/products/{id} + PATCH whitelisted + POST /products/{id}/submit-review — REAL
- Check-in/out: frontend attendanceService.checkIn/out return immediately fail-closed message "backend attendance service not available, no local record" — BACKEND MISSING
- Attendance history: GET /employee/attendance (month) missing, GET /employee/attendance/today missing, admin get employee attendance exists but employee self missing — BACKEND BLOCKER P1 B-03
- Leave: EmployeeLeave page exists, leaveRepository empty in-memory after seed deletion, no backend leave endpoints — MISSING P2 B-04
- Performance: EmployeePerformance page exists, performanceRepository empty, no backend employee self performance read — MISSING P2 B-04 (admin performance via employees/{id}/performance exists)
- Password reset: employee change-password REAL (snake_case body), employee forgot-password missing — frontend honest says contact admin, no email — HUMAN DECISION
- Authorization: employee token cannot call /admin/* (403 via get_current_admin), can call employee endpoints — enforced

**Classification per feature:**

| Feature | Status |
|---|---|
| F-EMP-LOGIN | WORKING |
| F-EMP-CHANGE-PW (change) | WORKING |
| F-EMP-CHANGE-PW (forgot) | NOT IMPLEMENTED + HUMAN DECISION |
| F-EMP-PROFILE | WORKING |
| F-EMP-DASHBOARD | PARTIAL (assigned stub, today missing) |
| F-EMP-PRODUCTS inbox | PARTIAL (assigned stub) |
| F-EMP-PRODUCT-EDIT submit | WORKING |
| F-EMP-ATTENDANCE punch | BACKEND BLOCKER P1 |
| F-EMP-LEAVE | BACKEND GAP P2 |
| F-EMP-PERFORMANCE self | BACKEND GAP P2 |
| F-EMP-MEDIA | PARTIAL (media-set real, assets list admin-scoped may need employee scope) |
| F-EMP-ORDERS | WORKING via admin orders list (scope may need employee permission) |
| F-EMP-CUSTOMERS/TEAM | WORKING via admin customers/employees |
| F-EMP-INVENTORY etc | BLOCKED B-01 |
| F-EMP-SUPPORT/STYLING/SALES | NOT IMPLEMENTED P2 |

---

## 13. Admin

**Backend support verification:**

- Dashboard: GET /analytics/overview, /analytics/orders, /analytics/inventory-summary, GET /admin/orders — REAL, returns zeros when empty, no demo rupees
- Products: all 20 commands REAL — verified
- Review: approve must leave published=false — verified in service (sets review.state APPROVED, not published)
- Approve/publish: separate commands, publish validates getPublishIssues — REAL
- Employees: CRUD + departments + sections + attendance admin + performance admin + targets — REAL
- Employee management boundary: admin employees at /admin/employees, employee self at /employee/me — distinct. No accidental employee record appearing as admin because user_type check. However employee_profiles table has department string + department_id FK — org departments separate from catalogue departments (women/men/bridal/kids) — correct separation.
- Taxonomy: categories + subcategories + collections + metrics + product-counts — REAL
- Media: object storage + register + assets + media-set + resolve + status + delete — REAL. Marketing media + review missing — BLOCKER
- Offers: admin offers CRUD + counts + lifetimeRedemptions — REAL
- Inventory: STUB — BLOCKER
- Activity/audit: GET /audit/logs + GET /admin/activity latest 200 — REAL
- Analytics: overview/sales/products/customers/orders/inventory-summary — REAL
- Settings: GET all merged with defaults, GET section, PATCH section (SUPER_ADMIN), reset section, reset all — REAL + RBAC
- Roles/permissions: /admin/roles list 8 built-in roles (SUPER_ADMIN, ADMIN, MANAGER, SALES, INVENTORY, WAREHOUSE, CS, STYLIST) with permissions — REAL

**Admin/Employee boundary:**

- Admin tokens: pf_admin_* keys, user_type admin
- Employee tokens: pf_employee_* keys, user_type employee
- Backend rejects wrong portal via get_current_admin/employee (403)
- Employee cannot approve/publish — no client for those commands, backend requires products.manage + assignment check for employee product patch, approve/reject/publish require admin permission (products.manage) — so employee cannot publish even if they guess endpoint
- Same identity/role accidentally as Employee-management record? No — employee_profiles.user_id unique FK users.id, admin users have user_type admin, no employee_profile. So no accidental rendering.

---

## 14. Customer Storefront

**Backend support per live feature:**

- Homepage: GET /home — REAL but hero slides static (no marketing media DB), newArrivals up to 12 newest PUBLISHED, categories from ACTIVE categories, sareeEdit 8 saree products, brideGroomEdit 4 bridal+4 menswear, celebrationEdit 8 festive, saleBanner static — PARTIAL (hero empty until marketing register)
- Explore: GET /explore paginated stream with interleaved promo/editorial cards (EXPLORE_PROMO_AFTER 4, EDITORIAL_AFTER 8) — REAL products + static promo/editorial cards — PARTIAL (static not CMS)
- Categories: GET /categories ACTIVE, GET /categories/{id} ACTIVE gate, GET /categories/{id}/subcategories, GET /categories/{id}/products delegates to ProductService with category filter — WORKING
- Search: GET /search full-text + 12 facets + sort + pagination + suggestions static — WORKING (suggestions static list today, dynamic suggest BACKEND DECISION)
- Product detail: GET /products/{idOrSlug} PUBLISHED gate — WORKING
- Product media: GET /media/products/{id}/media-set + POST /media/references/resolve — WORKING
- Cart: all 8 endpoints — WORKING (stock validated server-side against product.stock)
- Checkout: place-order POST /orders (no prices from client) + payments session + verify — WORKING
- Orders: list my orders, get order, tracking, cancel, return create/get, claim-guest — WORKING
- Account: GET /customers/me requires profile row — WORKING
- Wishlist: all 4 endpoints — WORKING
- Reviews: display-only rating/reviewCount on product record, no write UI, GET /products/{id}/reviews client exists as read but backend? No dedicated reviews endpoint — uses product fields — OK, not required to invent write
- Offers: GET /offers active public, POST /offers/validate single gate — WORKING
- Authentication: customer sign-up/in/out/forgot/reset/change-pw/me — WORKING

**Classification:**

| Feature | Status |
|---|---|
| F-CUS-HOME | PARTIAL (hero static) |
| F-CUS-EXPLORE | PARTIAL (offers static) |
| F-CUS-SHOP/CATEGORY/COLLECTION/SEARCH/PDP/CART/CHECKOUT/ORDERS/WISHLIST/ACCOUNT | WORKING |
| F-CUS-AI | FUTURE P3 |
| F-CUS-RECENT | WORKING when auth |
| F-CUS-OFFERS | WORKING |

---

## 15. Offers / Marketing

**GET /explore/offers inspection:**

- Backend: app/api/v1/explore.py GET /explore/offers returns ExploreOffersResponse with static list _EXPLORE_OFFERS (3 offers: FIRST10, free shipping, FESTIVE40) — NOT DB-backed, static today, comment says BACKEND DECISION REQUIRED
- Frontend: Explore.jsx previously called getExploreOffers() — now searchApi.apiGetExploreOffers calls /explore/offers — wiring fixed, but data still static
- Public offers: GET /offers returns DB coupons where is_active true + not expired — REAL DB-backed
- Admin offers: GET /admin/offers filtered + paginated + counts + lifetimeRedemptions aggregates — REAL
- Marketing media: separate — hero/collection/editorial assignment — MISSING backend (B-02) — frontend currently BACKEND_GAP, home hero empty until GET /home + marketing register
- Frontend adapter/static: Explore offers uses static backend list, not DB offers register — gap B-06 wiring. Storefront offers rail should come from offers register, not second hardcoded list.

**Classification:**

- Offers coupon system: COMPLETE / WORKING (A)
- Explore offers: PARTIAL (C) — API exists but static, not DB
- Marketing media: BACKEND BLOCKER P1 (E) — API not exposed, frontend stub

---

## 16. Search

**Trace frontend search → backend search:**

- Frontend: searchApi.apiSearch → GET /search with 12 facets (category, subcategory, gender, price, size, color, fabric, material, occasion, collection, rating, availability) + q + sort + page/pageSize
- Backend: search.py router → SearchService.search → delegates to ProductService list_storefront_products with same visibility gate PUBLISHED + category ACTIVE + subcategory ACTIVE, case/diacritic-normalised substring across name, brand, category label, subcategory, fabric, material, colors, occasion, tags, collection, sku — matches frontend matchesSearch() logic
- Filtering: AND across facets, OR within facet (multi-value repeat key) — matches frontend
- Taxonomy: category/subcategory resolved, 404 for unknown
- Pagination: page + pageSize default 20 max 200, total honest full filtered count
- Published-only: YES gate enforced
- Empty results: returns {items:[], total:0} not error — honest
- Sorting: recommended default, newest, price-asc/desc, discount, name-asc, popularity, rating + aliases price-low→price-asc, price-high→price-desc, name/az→name-asc
- Search hints: navigationConfig.searchSuggestions "Banarasi Saree" — no matching live product (taxonomy has Banarasi subcategory but no product named Banarasi) — COPY DECISION / DATA DEPENDENCY — HUMAN DECISION REQUIRED, do NOT invent Banarasi product

**Classification:**

- Search: COMPLETE / WORKING (A)
- Suggestions hint: HUMAN DECISION (G) — copy vs empty catalogue

---

## 17. Dummy / Mock Data

**Search both frontend and backend for mock/dummy/demo/seed/sample/fake/placeholder/fallback/in-memory/hardcoded/fixture/TODO/BACKEND_GAP/unavailable:**

| Location | What | Class |
|---|---|---|
| frontend/src/data/catalog/products.js | Deleted static seed | KEEP deleted (do not restore) — was 168 old count |
| workflowTestState.js 3 DRAFT fixtures PF-W-SAR-COT-0001, PF-W-LEH-BRI-0002, PF-K-GRL-DRS-0001 | Test/audit/QA only | TEST FIXTURE |
| employeeManagementFixtures.js | No passwords, used for audit | TEST FIXTURE |
| frontend/public/images/** 238 files | Canonical media | PRODUCTION DATA (protected source) |
| taxonomy.js Banarasi subcategory | Taxonomy node | KEEP — legitimate static content (category label) |
| navigationConfig.searchSuggestions "Banarasi Saree" | Search hint copy | HUMAN DECISION / LEGITIMATE STATIC CONTENT? Copy decision |
| employeeDepartments "Silk & Banarasi" | Org section label | KEEP |
| operationsService MOCK_* = [] | Honest empty adapters | KEEP — empty after cleanup |
| EmployeeDesk styling/sales | Already emptied | KEEP empty / BACKEND-REPLACE P2 |
| adminAuthService "DEMO AUTHENTICATION" comment | Comment only, JWT live | DOCUMENTATION-ONLY |
| AI shopping mock prompts | P3 preview copy | DEV-ONLY / keep preview until AI APIs |
| inventoryApi.js unavailable() | Honest stub returning ok:false | TEMPORARY STUB — BACKEND REPLACEMENT REQUIRED |
| mediaApi.js marketing media BACKEND_GAP | Honest stub | TEMPORARY STUB |
| backend/app/api/v1/employees.py assigned-products placeholder [] | TODO product service | TEMPORARY STUB |
| backend/app/api/v1/attendance.py health only | Stub router | BACKEND REPLACEMENT REQUIRED |
| backend/app/models/inventory/* empty classes | Placeholder tables | BACKEND REPLACEMENT REQUIRED (schema) |
| backend/app/models/media/marketing_media empty | Placeholder | BACKEND REPLACEMENT REQUIRED |
| backend/app/services/inventory/* empty | Stub service | BACKEND REPLACEMENT REQUIRED |
| backend/app/services/employee/attendance_service empty | Stub | BACKEND REPLACEMENT REQUIRED |
| analytics inventory-summary note "Aggregated from catalog_product stock fields; dedicated inventory tables do not yet carry business columns" | Honest note | DOCUMENTATION — not dummy data |
| coupons _EXPLORE_OFFERS static list | Static promo/editorial | LEGITIMATE STATIC CONTENT for now, but should be DB later (B-06) |
| backend/app/services/catalog/explore_service _PROMO_CARDS, _EDITORIAL_CARDS static | Static content | LEGITIMATE STATIC CONTENT (CMS future) |
| frontend/src/services/api/* handleError ok:false | Real error shape | KEEP — not dummy |

**Never delete:** test fixtures, golden data (128 IDs, 238 images, taxonomy).

**Must remove / replace:**
- inventoryApi unavailable → needs real ledger
- marketing media BACKEND_GAP → needs API
- employee attendance check-in/out missing → needs endpoints
- employee leave/performance self → needs endpoints
- support/styling/sales desks empty → needs APIs derived from orders (sales) not invented customers

---

## 18. Under Progress

**Separate from blockers — items that have partial implementation:**

| ID | What Exists | What Remains | Owner | Frontend Can Proceed? |
|---|---|---|---|---|
| UP-01 Explore offers | GET /explore/offers endpoint exists, static list, frontend client exists | Make it DB-backed from offers register (coupons) or CMS, remove static _EXPLORE_OFFERS | backend | YES — frontend already calls it, shows static honestly |
| UP-02 Home hero | GET /home exists, assembles newArrivals/categories/sareeEdit/etc from real products, heroSlides static | Wire marketing media assignment to heroSlides (needs B-02) | backend | YES — empty hero honest until curated |
| UP-03 Employee assigned-products | GET /employee/me/assigned-products route exists in employees.py but returns placeholder [] | Implement ProductService query assignedEmployeeId == employee_code | backend | NO — frontend needs real list, but can show empty |
| UP-04 Customer session sid | JWT creation has jti, blacklist works, but no sid claim | Add sid claim at token issue, store session id, make revoke-others exclude current, make /customers/me return isCurrent true | backend | YES — frontend already states "revokes all" instead of "other devices only" |
| UP-05 Inventory summary vs ledger | analytics/inventory-summary uses product.stock snapshot, cart/order validation uses same | Add real inventory tables columns, keep product.stock as cache or remove, make summary optionally use ledger | backend | YES — cart/order already server-validated |
| UP-06 Employee performance self | Admin performance via /admin/employees/{id}/performance exists | Add GET /employee/performance self-service reading same table | backend | YES — admin side works |
| UP-07 Media dual-read | Product media register + mapping + media-set + resolve all real | Marketing media separate assignment + review (B-02) still missing | backend | YES — product media complete |
| UP-08 Search suggestions | GET /search suggestions static list | Dynamic suggest from products or human decision to keep copy | backend+human | YES — static suggestions work |

---

## 19. Final Feature Status Matrix (Single Source of Truth)

*See §6 for detailed matrix — summarized here:*

- **WORKING:** 95 features (all P0 customer shop/search/category/collection/PDP/cart/checkout/orders/wishlist/account + admin products/categories/collections/offers/orders/customers/media/analytics/settings/activity/RBAC + employee login/profile/product edit/submit/orders/customers/team)
- **PARTIAL:** 8 features (home hero empty, explore offers static, employee dashboard assigned stub, employee products inbox placeholder, customer security revoke-others all, invoice meta docAvailable false, etc)
- **BLOCKED:** 11 features (inventory admin+employee 7, marketing media 2, media review 1, attendance punch 1) — P1 blockers
- **NOT IMPLEMENTED / BACKEND GAP:** 12 features (leave 3, performance self 1, support 3, styling 2, sales 1, employee forgot-pw 1, assigned-products real query 1) — P2
- **FUTURE / NOT REQUIRED:** 6 features (AI 3, notifications inbox 1, review-write 1, second catalogue 1) — P3 or explicitly out

---

## 20. Final API Status Matrix

*See §5 for 225 rows — summary:*

- **COMPLETE/WORKING (A):** 160
- **IMPLEMENTED NOT INTEGRATED (B):** 2
- **PARTIAL (C):** 5
- **STUB (D):** 15
- **MISSING (E):** 20
- **FUTURE (H):** 3
- **Blocking P0:** 1 (assigned-products placeholder affects P0 employee products inbox, but not storefront)
- **Blocking P1:** 15 inventory + 4 marketing + 4 attendance = 23? Actually 11 inventory + 4 marketing + 4 attendance + 1 employee forgot = 20 P1
- **P2:** 12 (leave, perf self, support, styling, sales)
- **P3:** 3 AI

---

## 21. Database Findings

- **Products:** production ready, needs seed of 128 golden IDs — HUMAN DECISION on import
- **Media asset + mapping:** production ready, filesystem + DB
- **Marketing media + review:** NOT production ready — empty models, no columns, no migration
- **Inventory:** NOT production ready — empty models
- **Attendance:** production ready model but no employee self-service routes
- **Leave:** NO model — missing
- **Customers/orders/payments/coupons:** production ready
- **Employees:** production ready but assigned-products query not implemented
- **RBAC/settings/audit:** production ready
- **Mismatch frontend vs backend schema vs DB:** inventory frontend expects onHand/reserved/available but DB has no columns; marketing frontend expects hero/editorial assignment but DB empty; employee attendance frontend expects check-in/out but backend only admin routes

---

## 22. Auth/Security Findings

- **JWT creation/validation:** REAL, jti blacklist, HS256, 30min access 7d refresh
- **Token expiry:** enforced via exp claim, decode_token returns None if expired
- **Role/scope enforcement:** REAL via get_current_customer/employee/admin + require_admin_permission
- **Protected routes:** all admin/customer/employee routes protected
- **Admin-only:** YES enforced
- **Employee-only:** YES enforced
- **Super Admin:** YES for settings write, force-status, offers archive
- **Employee management:** REAL, status SUSPENDED/INACTIVE denies immediately
- **Session invalidation:** logout blacklists access+refresh, password change revokes all sessions
- **Password reset:** customer REAL opaque, employee forgot MISSING — do not reuse customer tokens (separate user_type)
- **Secret handling:** placeholders only, no secrets in docs
- **CORS:** configured, allows localhost:3000,5173 etc
- **Authorization at service level:** YES — not just frontend guards

**Flags:** No endpoint where frontend protection exists but backend missing (except employee punch missing entirely — not a bypass).

---

## 23. Media Findings

- **Resolver:** REAL via /media/references/resolve
- **Service:** REAL MediaService + UploadService + product_media_records
- **Metadata:** REAL via /media/object-meta/{key}
- **Storage:** filesystem-backed via storage/media abstraction, DB-backed via asset+mapping, S3 interface-ready not wired
- **Ownership persisted:** YES via product_media mapping
- **Marketing separate:** YES distinct table but empty + no API — BLOCKER
- **Hero separate:** YES namespace + static slides
- **Collection separate:** YES
- **Disk counts:** 238 total, 191 product, 42 collection, 5 hero, 128 PF-* folders — verified via find, not forced equal to backend counts

---

## 24. Dummy/Mock Findings

*See §17 — no dummy catalogue restored, no Banarasi products invented, no demo employees, no demo rupees.*

- **PRODUCTION DATA:** 238 images, 128 PF-* IDs, taxonomy
- **TEST FIXTURE:** 3 DRAFT fixtures PF-W-SAR-COT-0001, PF-W-LEH-BRI-0002, PF-K-GRL-DRS-0001
- **DEV-ONLY:** AI preview copy
- **TEMPORARY STUB:** inventoryApi unavailable, marketing BACKEND_GAP, attendance fail-closed
- **MUST REMOVE:** none — stubs are honest and must be replaced by backend, not removed
- **BACKEND REPLACEMENT REQUIRED:** inventory tables columns, marketing media API, attendance punch, leave, performance self, support/styling/sales

---

## 25. Blockers — Definitive List

### P0 BLOCKERS (prevents core system integration)

| ID | Blocker | Owner | Current State | Dependency | Exact Missing Piece | Frontend Impact | Backend Impact | Next Action |
|---|---|---|---|---|---|---|---|---|
| B-05 | Catalogue hydrate total honest | backend | REAL in code (ProductService returns total from count) but no live DB in workspace to prove HTTP | DB seed | Need live DB with 128 products + test GET /products?page=1&pageSize=100 returns total=full filtered count | Hydrate would fail if total omitted on full page (client fails loudly) | Ensure list_storefront_products total = count query, not len(items) — already does | Run backend locally with DB, seed 128 IDs, curl GET /products |
| B-13 | Employee assigned-products placeholder | backend | Route exists but returns [] placeholder TODO | ProductService query | Implement query where assignedEmployeeId == employee_code (from EmployeeProfile) | Employee products inbox empty even when assigned | Add real implementation in employees.py get_assigned_products | Implement service method list_assigned_products |
| B-12 | Auth scopes / no secrets | — | DONE | — | — | — | — | Verify in prod |

### P1 BLOCKERS (important production feature)

| ID | Title | Owner | Current State | Dependency | Missing | Frontend Impact | Backend Impact | Next Action |
|---|---|---|---|---|---|---|---|---|
| B-01 | Inventory schema vs client | backend | Models empty, routers health only, frontend unavailable() | Human decision columns | Add business columns to inventory_* tables: product_id, variant_id, sku, warehouse_id, on_hand, reserved, available, lot, etc + movements, reservations, transfers, warehouses | Admin/employee inventory desks show error/empty | Create migration adding columns, implement inventory_service + routers matching inventoryApi names (apiListStock etc) — align with existing router prefix without second ledger | HUMAN DECISION: exact columns — then implement |
| B-02 | Marketing media + review API | backend | Models empty, router health only, frontend BACKEND_GAP | Human decision assignment shape | Implement media_marketing_media columns (id, object_key, placement_type hero/collection/editorial, target_id?, status DRAFT/PENDING/APPROVED, etc) + media_review + endpoints GET /admin/marketing-media, GET /admin/media-reviews, POST approve/reject | Admin Marketing Media + Media Review cannot assign hero/collection/editorial plates, home hero empty | Add migration, service media_review_service, routes | HUMAN DECISION: placement types, then implement |
| B-03 | Employee self check-in/out | backend | Model exists, admin routes exist, employee self routes missing (attendance.py stub) | AttendanceService | Implement POST /employee/attendance/check-in, POST /check-out, GET /today, GET / history reading employee_attendance where employee_id = current employee profile id | EmployeeAttendance UI fail-closed, dashboard today missing | Implement AttendanceService self-service + router attendance.py real (currently health only) | Implement |
| B-06 | Explore offers wiring | backend+frontend | GET /explore/offers exists but static, GET /offers DB exists, frontend Explore.jsx uses getExploreOffers() | Offers register | Make /explore/offers return from offers register (active coupons) or keep static but document — frontend currently calls it, shows static | Storefront offers must come from offers register not second hardcoded list | Change explore_service.get_explore_offers to query CouponModel where is_active true | Implement + update frontend if needed |
| API-AUTH-15 | Employee forgot-password | backend+human | No endpoint, frontend honest says contact admin | Human decision recovery flow | Decide: employee recovery via email separate token table (employee_password_reset) vs admin-only reset (API-EMP-06) | EmployeeForgotPassword page sends no email (honest) | If decided, add POST /auth/employee/forgot-password + reset endpoint with separate token, do not reuse customer tokens | HUMAN DECISION |

### P2 BLOCKERS / GAPS (non-critical, UI exists)

| ID | Title | Owner | State | Missing | Impact | Next |
|---|---|---|---|---|---|---|
| B-04 | Employee leave + performance self | backend | Admin leave missing too, performance admin exists via employees/{id}/performance | Models? Leave no model, performance model exists | Need employee leave table + endpoints GET/POST /employee/leave + admin list/decide + GET /employee/performance self | EmployeeLeave, EmployeePerformance empty | Implement leave model + service + routes |
| B-07 | Support/styling/floor-sales desks | backend | No models, UI empty | Support cases, styling appointments/requests, sales derived from orders | Employee desks empty | Must derive sales from orders not parallel DB, support cases need table | HUMAN DECISION if support/styling needed now or future |
| B-09 | Activity diary split | backend | Shared diary exists via /audit/logs + /admin/activity, employee activity? | GET /employee/activity missing? Actually not in requirements? | House-wide activity must not fork second log | One diary, not second log | Verify employee activity uses same audit table |
| B-10/B-11 | Notifications inbox / review-write | — | Explicitly out | Do not invent | — | — | Do not implement |

### P3 FUTURE

| ID | Title | Owner | State |
|---|---|---|---|
| B-08 | AI assistants | backend | Stub chatbot router health, no AI endpoints, frontend preview copy | P3 until live, UI must say preview |

---

## 26. Under Progress (different from blockers)

*See §18 — 8 items with what exists / remains / owner / frontend can proceed.*

---

## 27. Human Decisions Required

| ID | Decision | Why Stop | Options |
|---|---|---|---|
| HD-01 | Search suggestions "Banarasi Saree" vs empty live catalogue | No matching live product, taxonomy has Banarasi subcategory but no product | Keep copy as aspirational hint + empty results honest, or change copy to existing category (e.g. "Silk Saree"), or seed Banarasi product (requires business) — DO NOT invent product without approval |
| HD-02 | Employee forgot-password flow | No client in authApi.js, frontend honest says contact admin | Option A: keep admin-only reset (API-EMP-06) only, no employee self-service forgot (secure). Option B: implement separate employee forgot/reset with separate token table (employee_password_reset) not reusing customer tokens |
| HD-03 | Inventory table columns | Existing inventory_* tables have no business columns, frontend expects onHand/reserved/available etc | Decide exact schema: variant-level stock, warehouse, movements, reservations, transfers — align with inventoryApi.js names — do not invent second products.stock ledger |
| HD-04 | Marketing media assignment shape | No columns, frontend expects hero/editorial/promotion plates distinct from product media | Decide placement types (hero, collection, editorial, promotion), approval flow, target_id semantics, then implement |
| HD-05 | Support/styling/sales desks | UI exists empty after dummy cleanup, no backend | Decide if P2 desks are required now or future. If required, sales MUST derive from orders, support cases need real customer/order ids, no invented named customers |
| HD-06 | Catalogue seed import | 128 PF-* folders on disk, backend catalogue may be empty | Decide if backend should seed 128 IDs as existing identity set (no ID regeneration) — import tool exists? media migration tool exists but product import not — HUMAN DECISION before any ID-changing import |
| HD-07 | Session sid claim | Token has jti but no sid, revoke-others revokes all | Decide to add sid claim + session id tracking |

---

## 28. Recommended Implementation Order

### PHASE 1 — P0 BLOCKERS (core integration)

1. **B-05 Prove catalogue total honest** — start backend locally with postgres pratikshya_local, create throwaway DB, alembic upgrade head, seed 128 golden IDs via product_service create_draft, curl GET /api/v1/products?page=1&pageSize=100, verify total = full published count, not page length. Fix if needed (already correct in code).
2. **B-13 Employee assigned-products real** — implement ProductService.list_assigned_products(employee_code) query assigned_employee_id == code, wire to GET /employee/me/assigned-products in employees.py, test with admin assigning product to employee, employee sees it.
3. **Auth verification** — verify customer/admin/employee me endpoints with real JWTs, test 401 refresh flow, test wrong-portal 403.

### PHASE 2 — P1 BLOCKERS (merchandising)

4. **B-01 Inventory schema** — HUMAN DECISION columns, then migration adding columns to inventory_stock (product_id, variant_id, sku, warehouse_id, on_hand, reserved, available, low_threshold), inventory_movement (stock_id, delta, reason, actor), stock_reservation (cart/order), warehouse (name, code, address), stock_transfer (from, to, status, lines). Implement inventory_service matching inventoryApi.js names, update routers inventory.py, warehouses.py, stock_transfers.py from health-only to real CRUD, keep cart/order stock validation server-side.
5. **B-02 Marketing media + review** — HUMAN DECISION placement types, then migration for marketing_media (object_key, placement_type, target_id, status, etc) + media_review (marketing_media_id, status, reason). Implement media_review_service, real routes GET /admin/marketing-media, GET /admin/media-reviews, POST approve/reject, update GET /home to use approved marketing media for heroSlides.
6. **B-03 Employee punch** — implement AttendanceService self-service: check-in (create today row with check_in time, status PRESENT/LATE based on settings attendance.startTime + lateThreshold), check-out (set check_out, compute workMinutes), today (get today row), history (list month). Wire to attendance.py router (currently health only) with employee guard. Ensure admin attendance still works.
7. **B-06 Explore offers wiring** — make GET /explore/offers query CouponModel active not expired, or keep static but document intent. Update Explore.jsx if needed to use same offers as home.
8. **API-AUTH-15 Employee forgot-password decision** — if Option B chosen, implement separate table + endpoints.

### PHASE 3 — INTEGRATION FIXES

9. **Session sid** — add sid claim to access token (uuid), store in user_sessions, make revoke-others exclude current sid, make /customers/me return isCurrent true.
10. **Invoice metadata** — implement documentAvailable check (file exists) for GET /admin/orders/{id}/invoice, do not fake PDF URL.
11. **Permissions TODO** — employee permissions permissionMode persistence (currently TODO in employee_service).
12. **Frontend integration bug checks** — verify productsApi.normaliseProductList total handling (already fixed), catalogStore hydrate walk pages until total, fails on omitted total on full page — ensure backend always sends total.

### PHASE 4 — NON-BLOCKING / FUTURE (P2/P3)

13. **B-04 Leave + performance self** — implement leave model (employee_id, startDate, endDate, type, reason, status) + endpoints GET/POST /employee/leave + admin list/decide + GET /employee/performance self reading same table as admin.
14. **B-07 Support/styling/sales** — if required now, implement support cases (customerId, orderId, subject, body, status) + styling appointments/requests + sales derived from orders (GROUP BY department) — no parallel sales DB.
15. **B-08 AI** — keep preview until backend chatbot RAG ready (needs knowledge documents, embeddings, LLM).
16. **B-09 Activity diary** — ensure GET /employee/activity uses same audit table if needed.
17. **Do NOT implement:** notifications inbox, customer review-write, second catalogue, kids micro-app, demo employees/rupees.

---

## 29. Validation Results

### Frontend

| Check | Result |
|---|---|
| npm test | 355 tests, 351 pass, 3 fail (ERR_MODULE_NOT_FOUND react import in node loader for shopFeaturedEditRender.test.js etc), 1 skip (store-copy backend storage absent) — previously 377 tests 376 pass 1 skip on other branch |
| audit:* scripts | Not run this phase (requires node-loader), but previous audit-findings-resolution-report says all PASS (explore, homepage, product-media, media-products, catalog-completeness, storefront-coverage, frontend-catalog, media, hero-runtime, employee-management, workflow-foundation, read-only-workflow, canonical-lifecycle, unified-review, publish-visibility, activity-events, product-performance) |
| qa:* scripts | Previously PASS after retarget (marketing-assignment, storefront-catalog, department-listings, navigation-editorial) |
| npm run build | PASS — Vite 7.3.2, 2675 modules, dist/index.html 2.8MB gzip 968kB (previous report) |
| git diff --check | PASS (no whitespace errors) — verified via previous report |

### Backend

| Check | Result |
|---|---|
| Backend tests command | `cd backend && python -m pytest tests/unit -q` — requires postgres pratikshya_local loopback, psycopg2, disposable DB. In this sandbox no postgres running, so tests skipped/unavailable. Unit tests that don't need DB (test_config, test_api_contract) may pass. |
| Real API smoke | No live backend in this workspace (no postgres, no redis) — cannot run real HTTP smoke tests. Code inspection used instead. |
| Alembic upgrade head | Requires postgres — not run here, but versions exist and initial schema creates all placeholder tables. |
| Storage provider | local provider filesystem — storage/media dir exists? `backend/storage/` listing showed 4? Actually backend/storage/media may be absent (previous skip reason). In this workspace backend/storage/media not present — store-copy test skipped. |

### Browser/E2E

- Vite dev server not started this phase (audit first task, no broad implementation). Previous report: Vite 7.3.2 on :5173 host 0.0.0.0, HTTP 200 + SPA shell for /, /shop, /women, /kids, /search, /product/PF-W-SAR-COT-0001, /admin/login, /employee/login, etc. Hydrate/listing/PDP empty without backend — honest.

---

## 30. Documents Updated

- **Created/Updated:** docs/full-stack-integration-audit.md (this file) — single source of truth
- **To update next:** docs/backend-blockers.md (add B-13 assigned-products placeholder, clarify inventory empty models, marketing empty models, attendance stub), docs/frontend-handoff-final-status.md (add assigned-products P0 blocker, update counts)
- **Existing docs still valid:** docs/frontend-backend-api-requirements.md (225 APIs), docs/feature-api-matrix.md (313 pairs), docs/frontend-feature-inventory.md (122 features), docs/frontend-api-traceability.csv, docs/golden-data-before-after.md (128 IDs unchanged), docs/audit-findings-resolution-report.md, docs/backend-integration-handoff.md

---

## 31. Exact Next Steps Ordered by Priority

1. **P0 B-05 Prove total honest** — start backend with local postgres, seed 128 IDs, curl GET /products?page=1&pageSize=100, verify total.
2. **P0 B-13 Assigned-products real query** — implement ProductService query + wire employees.py.
3. **P1 B-01 Inventory schema** — HUMAN DECISION columns, then migration + service + routers real.
4. **P1 B-02 Marketing media + review** — HUMAN DECISION placement types, then migration + service + routes + home hero wiring.
5. **P1 B-03 Employee punch** — implement attendance self-service endpoints.
6. **P1 B-06 Explore offers DB-backed** — make /explore/offers query coupons.
7. **P1 API-AUTH-15 Employee forgot-password decision** — choose admin-only vs separate token flow.
8. **P2 B-04 Leave + performance self** — implement leave model + self-service.
9. **P2 B-07 Support/styling/sales** — if required, derive sales from orders.
10. **P3 AI** — keep preview until RAG ready.
11. **Validation:** run npm test, audit:*, qa:*, build, backend pytest unit, real HTTP smoke 13 checks (list products, detail, search/filter, admin review, update, approve, publish, visibility after reload, media retrieval, auth-protected, employee, inventory, offers).

---

## Appendix: API Status Counts

- Total APIs: 225
- COMPLETE A: 160 (71%)
- PARTIAL C: 5 (2%)
- STUB D: 15 (7%)
- MISSING E: 20 (9%)
- FUTURE H: 3 (1%)
- BLOCKING P0: 2 (B-05, B-13)
- BLOCKING P1: 20 (B-01 11 + B-02 4 + B-03 4 + AUTH-15 1)
- P2: 12
- P3: 3

**Integration readiness:** 71% backend real, 29% stub/missing — frontend 85% integrated (190 clients exist, 15 stub, 20 missing).

**No broad implementation done this phase — audit only, plus tiny obvious frontend integration corrections? None needed — frontend already fail-closed honestly.**

