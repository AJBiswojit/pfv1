# PRATIKSHYA FASHON — Frontend Mock Removal + Backend Integration Audit

Date: 2026-08-26
Scope: Frontend (`frontend/`) → FastAPI (`backend/`) → existing PostgreSQL schema.
Rules honoured: no schema changes, no new migrations, no Redis/Celery/Docker requirement for dev, no silent mock fallback, no fake data.

---

## 1. Frontend mock data sources

| # | Source | Kind | Size | Notes |
|---|--------|------|------|-------|
| M1 | `src/data/catalog/products.js` | Static catalogue seed | 3,459 LOC | ~all product records used by `catalogRepository` |
| M2 | `src/data/products/details.js`, `explore.js`, `facets.js`, `query.js`, `taxonomy.js`, `recommendations.js`, `departments.js`, `index.js` | Derived static catalogue / taxonomy / facets | ~1,600 LOC | `details.js` = per-product static detail records |
| M3 | `src/data/catalog/taxonomy.js`, `collections.js`, `hero.js` | Static taxonomy/collection/hero records | ~470 LOC | presentation + records |
| M4 | `src/data/mockCustomers.js` | Demo customers + passwords | — | used by `AccountContext`, `SignIn` |
| M5 | `src/data/admin/demoAdminCredentials.js`, `adminAccounts.js` | Demo admin credentials | — | used by `AdminLogin`, admin services |
| M6 | `src/data/employees/demoCredentials.js`, `mockEmployees.js`, `operations.js` | Demo employees + credentials | — | used by `EmployeeLogin`, employee services |
| M7 | `src/data/shopping/coupons.js` | Static coupons | — | used by `CartContext`, `CouponField` |
| M8 | `src/data/media/seedMedia.js` (+ `data/mediaPlaceholder.js`, `data/catalog/hero.js` imagery refs) | Seed media records | — | used by media pages, product detail gallery |
| M9 | `src/services/catalogRepository.js` | Local product DB (localStorage + seed) | 1,392 LOC | authoritative for admin products; also indexed-catalogue source |
| M10 | `src/services/taxonomyRepository.js` | Local taxonomy DB (localStorage + seed) | 585 LOC | authoritative for categories/collections/departments |
| M11 | `src/services/inventory/inventoryRepository.js` | Local inventory DB + stock rules | — | cart clamping, inventory pages |
| M12 | `src/services/employees/employeeService.js`, `storage.js`, `operationsService.js` | Local employee DB | — | admin employee mgmt, shop floor |
| M13 | `src/services/admin/adminAuthService.js`, `adminAuthorization.js`, `adminDashboardService.js`, `storage.js` | Local admin auth/dashboard | — | admin auth/dashboard fallbacks |
| M14 | `src/services/customer/customerRegistry.js`, `recentlyViewed.js`, `personalization.js`, `stylePreferences.js` | Local customer registry | — | account + personalization |
| M15 | `src/services/orders/orderService.js`, `demoOrders.js`, `trackingService.js`, `fulfillmentService.js`, `returnService.js`, `orderTimelineService.js` | Local order DB + demo orders | — | customer + admin orders |
| M16 | `src/services/offers/offerRepository.js` | Local offers DB | — | storefront + admin offers |
| M17 | `src/services/media/mediaRepository.js`, `mediaStore.js`, `productMediaSource.js`, `marketingMediaSource.js`, `productMediaSet.js`, `productMediaGroups.js` | Local media DB + mappings | — | media library, product-media, marketing placements |
| M18 | `src/services/settingsRepository.js` | Local settings DB | — | admin settings |
| M19 | `src/services/workforce/seedWorkforce.js`, `store.js`, `attendanceRepository.js`, `leaveRepository.js`, `performanceRepository.js` | Local workforce DB | — | employee attendance/performance/leave |
| M20 | `src/services/ai/*MockData*`, `mockAiProvider.js`, `aiMirrorMockData.js`, `mockVirtualTryOnProvider.js`, `virtualTryOnService.js` | Mock AI/try-on providers | — | AI assistants, AI Mirror |
| M21 | `src/services/payment/paymentService.js` | Mock payment state machine | — | checkout payment step |
| M22 | `src/services/analytics/analyticsService.js` | Hardcoded analytics | — | admin/employee analytics |
| M23 | `src/utils/shopping.js` (`getMaxQuantity`, mock stock rules) | Mock stock caps | — | cart quantity clamps |
| M24 | `src/services/productWorkflow.js`, `services/workflow/*`, `services/productReviewFlags.js`, `unifiedProductReview.js` | Local product workflow state | — | admin product workflow |
| M25 | `src/config/*` (productCatalogConfig, employeeRoles, employeePermissions, attendanceConfig, performanceConfig, mediaTypes, orderConfig, checkoutConfig, commerceDefaults, navigationConfig…) | **Presentation/config** (NOT runtime records) | — | must remain |

## 2. Frontend consumers of each mock source

Key consumer families (full import graph verified via static scan of `src/`):

- **Storefront catalogue**: `Shop.jsx`, `ProductDetail.jsx`, `CatalogueListing.jsx`, `CategoryPage.jsx`, `Cart.jsx` (recommendations), `Wishlist.jsx`, `AtelierDesign.jsx` (home), `Explore.jsx`, `SearchResults.jsx`; components `CatalogueBrowser`, `ProductGrid`, `NewArrivals`, `PlacementProductRail`, `SaleBanner`, `SareeEditCarousel`, `BrideGroomEdit`, `CelebrationEdit`, `ProductRecommendations`, `CartLineItem`, `ExploreProductGrid`, `FilterPanel`, `ActiveFilters`, `SortControl`, `CategoryTabs`, `ShopByCategory`, `CategoryShortcuts`, `ProductPurchasePanel`; hooks `useCatalogueQuery`, `useProducts`, `useProduct`.
- **Cart/wishlist**: `CartContext`, `WishlistContext`, `CheckoutContext`, `CartDrawer`, `CouponField`, `OrderSummary`, `cart/QuantityStepper`, `Wishlist.jsx`, `ProductPurchasePanel`.
- **Auth**: `SignIn.jsx` (M4), `AdminLogin.jsx` (M5), `EmployeeLogin.jsx` (M6), `AdminAuthContext` (M13), `EmployeeAuthContext` (auth passthrough), `AccountContext` (M4/M14 local fallback).
- **Account**: `AccountContext`, `AccountDashboard`, `AccountProfile`, `AccountAddresses`, `AccountPreferences`, `AccountOrders`, `OrderDetail`, `OrderReturn`, `OrderTracking`.
- **Admin**: `AdminProducts`, `AdminProductDetail`, `ProductForm`, `AdminProductReview`, `UnifiedReviewQueue`, `ProductDraftReviewPanel`, `ProductGroupReviewPanel`, `ProductLifecycleActions`, `AdminCustomers`, `AdminCustomerDetail`, `AdminOrders`, `AdminOrderDetail`, `AdminOrderInvoice`, `AdminReturns`, `AdminReturnDetail`, `AdminOffers`, `AdminOfferDetail`, `AdminOfferFormPage`, `AdminCategories`, `AdminCategoryDetail`, `AdminCategoryForm`, `AdminCollections`, `AdminCollectionDetail`, `AdminCollectionForm`, `AdminEmployees`, `AdminEmployeeCreate/Edit/Detail`, `AdminActivity`, `AdminSettings`, `AdminAnalytics`, `AdminDashboard`, `Adminspace media pages` (`AdminMediaLibrary`, `AdminMediaUpload`, `AdminMediaReview`, `AdminMarketingMedia`, `AdminMediaDetail`, `AdminMediaProductMapping`, `AdminProductMedia`), inventory pages (`InventoryDashboardPage`, `InventoryLowStockPage`, `InventoryMovement/s`, `InventoryTransfersPage`, `InventoryOperationPage`).
- **Employee**: `EmployeeDashboard`, `EmployeeProducts`, `EmployeeProductReview`, `EmployeeProductForm`, `EmployeeOrders`, `EmployeeOrderDetail`, `EmployeeCustomers`, `EmployeeOffers`, `EmployeeOfferDetail`, `EmployeeOfferForm`, `EmployeeAttendance`, `EmployeeLeave`, `EmployeePerformance`, `EmployeeMediaDashboard`, `EmployeeMediaDetail`, `EmployeeMediaUpload`, `EmployeeReports`, `EmployeeDesk`, `EmployeeManagementContext`, `useEmployeeNavBadges`, workforce components.
- **Media**: `useMedia`, `useMediaActions`, `MediaUploadPanel/Form/Queue/ProductSelector/PlacementSelector`, `MediaInboxCard`, `MediaThumb`, `MediaVideo`, `MediaProductSelector`, media admin/employee pages, `ProductGallery`.
- **Persistence layer**: `catalogRepository` (M9) is used by `useProducts`/`useProduct`, admin catalogue selectors, inventory pages (`InventoryOperationPage`, `InventoryTransfersPage`), media product selectors, offer forms, product editor + editor sections, `AdminProductDetail`, `AdminProducts`, `AdminMediaLibrary`, `AdminMediaDetail`, `AdminMediaProductMapping`, `AdminMediaReview`, `AdminProductMedia`, `EmployeeMediaDashboard/Detail`, `EmployeeProductReview`, `AiShoppingAssistant`, `AiMirror`, `ProductDetail`, `NewArrivals`, `taxonomyRepository` consumers, etc.

## 3. Existing backend endpoints replacing each source

| Frontend concern | Backend endpoint(s) | Status |
|---|---|---|
| Customer auth | `POST /auth/customer/sign-up|sign-in|sign-out|forgot-password|reset-password`, `POST /auth/refresh`, `GET /auth/me` | ✅ implemented |
| Employee auth | `POST /auth/employee/sign-in|change-password|sign-out|refresh`, `GET /employee/me` | ✅ implemented |
| Admin auth | `POST /auth/admin/sign-up|sign-in|sign-out`, `POST /auth/refresh`, `GET /auth/me` | ✅ implemented |
| Catalogue list/detail | `GET /products`, `GET /products/{id_or_slug}`, `GET /products/{id}/recommendations`, `GET /products/recently-viewed`, `POST /products/recently-viewed` | ✅ implemented |
| Search / explore / home | `GET /search`, `GET /explore`, `GET /explore/offers`, `GET /home` | ✅ implemented |
| Categories / collections | `GET /categories`, `GET /categories/{id_or_slug}`, `GET /collections`, `GET /collections/{id_or_slug}`, `GET /collections/{id}/products` | ✅ implemented |
| Cart | `GET /cart`, `POST /cart/items`, `PATCH /cart/items/{line_id}`, `DELETE /cart/items/{line_id}`, `DELETE /cart`, `POST /cart/coupon`, `DELETE /cart/coupon`, `GET /cart/totals` | ✅ implemented |
| Wishlist | `GET /wishlist`, `POST /wishlist/{product_id}`, `DELETE /wishlist/{product_id}`, `POST /wishlist/{product_id}/toggle` | ✅ implemented |
| Customer account | `GET /customers/me`, `PATCH /customers/me`, `PATCH /customers/me/preferences`, `POST /customers/me/sessions/revoke-others` | ✅ implemented |
| Addresses | `GET/POST /customers/me/addresses`, `PATCH/DELETE /customers/me/addresses/{id}`, `POST /customers/me/addresses/{id}/default` | ✅ implemented |
| Orders (customer) | `POST /orders`, `GET /orders`, `GET /orders/{id}`, `GET /orders/{id}/tracking`, `POST /orders/{id}/cancel`, `POST /orders/{id}/returns`, `GET /orders/{id}/returns/{return_id}`, `POST /orders/claim-guest` | ✅ implemented |
| Orders (admin) | `GET /admin/orders`, `GET /admin/orders/{id}`, all fulfillment/status/notes/returns endpoints | ✅ implemented |
| Payments | `POST /payments/session`, `GET /payments/session/{id}`, `POST /payments/session/{id}/cancel`, `POST /payments/verify`, `POST /payments/webhook` | ✅ implemented (Razorpay config required for live gateway) |
| Offers/coupons | `GET /offers`, `POST /offers/validate`, `GET/POST /admin/offers`, `PATCH /admin/offers/{id}`, activate/pause/archive | ✅ implemented |
| Admin products | `GET/POST /admin/products`, `POST /admin/products/draft`, `GET /admin/products/next-id|availability|metrics`, `GET/PATCH /admin/products/{id}`, assign/approve/reject/publish/unpublish/archive/restore/publish-issues, bulk, change-id, duplicate, review flags | ✅ implemented |
| Admin employees | `GET/POST /admin/employees`, `GET/PATCH /admin/employees/{id}`, status, reset-password, permissions, departments, sections, attendance, targets, performance | ✅ implemented |
| Admin customers | `GET /admin/customers`, `GET /admin/customers/{id}` | ✅ implemented |
| Taxonomy admin | `POST/PATCH /admin/categories*`, `POST/PATCH /admin/collections*` (+ subcategories, archive/restore, activation) | ✅ implemented |
| Admin settings | `GET /admin/settings`, `GET/PATCH /admin/settings/{section}`, reset | ✅ implemented |
| Admin activity | `GET /admin/activity` | ✅ implemented |
| Employee self | `GET /employee/me`, `/employee/me/assigned-products`, `/employee/me/workflow`, `/employee/desk` | ✅ implemented |
| Employee products (employee surface) | `GET/PATCH /employee/products/{id}` | ✅ implemented |
| Media | — (router exists, module is health-only) | ❌ **blocked** — see §4 |
| Inventory / warehouses / transfers | — (health-only routers) | ❌ **blocked** — see §4 |
| Analytics | — (health-only router) | ⚠️ partial — implemented in this phase for order/product-backed metrics |
| Audit log | `GET /admin/activity` only | ⚠️ implemented `/audit/logs` in this phase |
| Roles / permissions / users | `GET /admin/roles`, `GET /admin/roles/{id}` | ⚠️ `/roles`, `/permissions`, `/users` implemented in this phase (list + detail) |
| Variants / attributes / pricing | — (health-only routers) | ❌ **blocked** — see §4 |
| Checkout (module router) | `/orders`, `/payments/*` cover checkout; `/checkout` router itself only health | ⚠️ acceptable — checkout is implemented through orders/payments endpoints |
| Attendance / performance (module routers) | full employee attendance/targets/performance endpoints exist under `/employees*` + `/admin/employees*` | ✅ implemented; module health-only routers are fine (no frontend consumer) |
| AI assistants / AI Mirror / virtual try-on | chatbot module health-only; LLM/RAG services are scaffolds | ❌ **blocked** — documented as out-of-scope AI phase; frontend mock AI providers remain but are explicitly flagged, never used for business data |
| Notifications | router health-only | ❌ blocked (no consumer in current UI) |

## 4. Backend endpoint gaps and genuine blockers

The migration history in `backend/alembic/versions/` is the authoritative local record of the existing server schema. Critical finding:

**The following domain tables only contain `id`, `created_at`, `updated_at` in the existing schema** (their SQLAlchemy models are equally minimal stubs — the model files match the migrations):

- `media_media_asset`, `media_product_media`, `media_marketing_media`, `media_media_review`
- `inventory_inventory_stock`, `inventory_inventory_movement`, `inventory_inventory_location`, `inventory_stock_reservation`, `inventory_stock_transfer`, `inventory_warehouse`
- `variants_attribute`, `variants_attribute_value`, `variants_product_attribute`, `variants_product_variant`
- `pricing_product_price`, `pricing_price_history`, `pricing_tax_rate`
- `checkout_checkout`, `checkout_payment`, `checkout_payment_transaction`, `notification_notification`, `chatbot_*`

No later migration adds business columns to those tables. Therefore, per the task constraints ("Do NOT invent database fields", "Do NOT modify tables", "identify the inconsistency and adapt the application code to the existing schema"), **media, inventory, variants, pricing, checkout-history, notifications and chatbot endpoints cannot be made functional without schema work that is explicitly out of scope in this phase.** Implementing them would require inventing columns that do not exist → explicitly forbidden. These are genuine blockers, not gaps in effort.

What this phase does implement backend-side (on top of the already-working surface):

- `GET /roles`, `GET /roles/{id}`, `GET /permissions`, `GET /permissions/{code}`, `GET /users` (admin-scoped) — uses existing RBAC tables (`roles`, `permissions`, `role_permissions`, `user_roles`), no schema change.
- `GET/POST/... /audit/logs` + `/admin/activity` already exists — uses `audit_activity_log`.
- `GET /analytics/overview|sales|products|customers|orders|inventory-summary` (order/product-backed; inventory metrics only where stock exists on products) — aggregated reads only.
- Development startup fixes: `ALLOWED_ORIGINS`/`ALLOWED_IMAGE_TYPES`/`ALLOWED_VIDEO_TYPES` comma-separated env parsing, `DATABASE_URL` localhost default, local file storage option for media uploads (reserved for when media schema is available), README dev instructions.

## 5. Required frontend changes

1. **No silent fallback**: remove every `API fails → local seed/demo data` path. Keep tokens in localStorage; keep guest-only cart/wishlist in localStorage (explicitly permitted).
2. **Catalogue**: `useCatalogueQuery` → `GET /products` only, expose `error`/`loading`/`empty`; `ProductDetail` → `GET /products/{id}`, recommendations → `GET /products/{id}/recommendations`; `SearchResults` → `GET /search`; `Explore` → `GET /explore`; home (`AtelierDesign`) → `GET /home`; navigation taxonomy → `GET /categories` + `GET /collections`.
3. **Cart/wishlist/checkout/orders**: backend-authoritative for authenticated users; guest cart/wishlist stays client-side; checkout uses `POST /orders` + `POST /payments/*`.
4. **Mock auth**: remove demo credential hints and demo-account fallbacks from `SignIn`, `AdminLogin`, `EmployeeLogin`; surface real API errors.
5. **Account**: backend-only (`customersApi`); remove demo registry.
6. **Admin**: products/taxonomy/orders/customers/offers/employees/settings/activity → existing admin API modules; media/inventory pages → explicit "backend capability unavailable (schema blocker)" empty/error state instead of seeded data.
7. **Employee**: auth/profile/assigned-products/attendance/performance via backend; workforce seed removed.
8. **API layer additions**: `offersApi.js`, `mediaApi.js` (metadata contract reserved), `inventoryApi.js` (contract reserved), `analyticsApi.js`, `auditApi.js`, `usersApi.js`; token isolation for admin/employee scopes in `apiClient.js`.
9. **Cleanup**: delete mock/seed files only after zero static references remain.

## 6. Required backend changes (this phase)

- `app/config.py`: robust list parsing (comma-separated env values) for `ALLOWED_ORIGINS`, `ALLOWED_IMAGE_TYPES`, `ALLOWED_VIDEO_TYPES`; keep secret guards; localhost dev DB default.
- `app/api/v1/roles.py`, `permissions.py`, `users.py`, `audit.py`, `analytics.py`: implement real read/aggregate endpoints against existing tables.
- `backend/.env.example`: dev-first defaults (localhost DB, no production secrets), CORS origins for Vite dev server.
- No schema/migration changes. Redis remains the in-process LRU shim (already in place) so `uvicorn app.main:app --reload` needs no Redis.
- README: local (non-Docker) run instructions.

## 7. Genuine blockers (must be documented, NOT faked)

| Area | Blocker | Frontend impact |
|---|---|---|
| Media | No business columns in `media_*` tables; models stubs; no storage/upload service | Media library/upload/review pages show explicit unavailable state; static assets remain as UI assets only |
| Inventory | No business columns in `inventory_*`/`warehouse` tables | Inventory pages show explicit unavailable state; cart stock validation comes from backend cart/orders only |
| Variants/attributes | Tables have no columns | Product editor variant/attribute sections disabled/empty with note |
| Pricing | Tables have no columns | Pricing comes from product records (`catalog_product`), not pricing tables |
| AI chat/try-on | Chatbot tables + LLM/vector services are scaffolds; no keys | AI assistant remains a frontend-only assistant; flagged mock, never business data |
| Payment gateway | Razorpay keys are placeholders | Payment session creation works in contract; live verification requires real keys |
| Notifications | No schema/service | No current UI consumer |

## 8. Files that can safely be deleted after migration

After the consumers are migrated and verified with `npm run build` + static import scan:

- `src/data/mockCustomers.js`
- `src/data/admin/demoAdminCredentials.js`, `src/data/admin/adminAccounts.js` (if unreferenced), `src/data/admin/dashboardData.js` (if unreferenced)
- `src/data/employees/demoCredentials.js`, `src/data/employees/mockEmployees.js`, `src/data/employees/operations.js`
- `src/data/shopping/coupons.js`
- `src/data/media/seedMedia.js` (+ `mediaPlaceholder.js` replacement if unreferenced)
- `src/data/catalog/products.js` (seed product records)
- `src/data/products/details.js`, `explore.js`, `query.js`, `recommendations.js`, `index.js`, `facets.js`, `taxonomy.js`, `departments.js` (facade rewrites; taxonomy/query/facets may remain as **configuration** where they do not contain records)
- `src/services/orders/demoOrders.js`
- `src/services/workforce/seedWorkforce.js`
- `src/services/payment/paymentService.js` (superseded by `paymentsApi`)
- `src/services/admin/adminAuthService.js`, `adminDashboardService.js` (superseded)
- `src/services/ai/*MockData*`, `mockAiProvider.js`, `aiMirrorMockData.js`, `mockVirtualTryOnProvider.js` (once AI is explicitly out of scope and pages are adapted)
- `backend/scratch/*.py` containing live RDS credentials (**security** — remove real secrets from the repo)

## 9. Files that must remain (configuration/presentation, not mock data)

- `src/config/*` — UI configuration (roles/permissions matrices, navigation, order statuses, commerce defaults, media types, checkout config, performance config, attendance config, product id prefixes, catalog presentation config, admin access/navigation, employee departments/roles/status/perms/navigation).
- `src/design-system/*`, `src/assets/*`, `public/images/*` — UI and static image assets.
- `src/utils/*` — formatting/validation helpers (minus mock stock rules, which are replaced by backend stock validation).
- `src/services/api/*` — the single API layer (extended, not duplicated).
- `src/services/media/mediaPaths.js`, `mediaNaming.js`, `mediaValidation.js`, `uploadValidation.js`, `mediaGroups.js`, `mediaExposure.js`, `navigationEditorialMedia.js`, `productMediaGroups.js` — presentation helpers for media **UI** (may stay as config/helpers; no seeded records used at runtime once migrated).
- `src/services/taxonomyRouting.js`, `src/data/products/facets.js` (filter UI config), static taxonomy *labels* only when explicitly presentation.

## 10. Implementation status (this phase)

### Backend
- `app/config.py`: `ALLOWED_ORIGINS` / `ALLOWED_IMAGE_TYPES` / `ALLOWED_VIDEO_TYPES` now accept **comma-separated** or JSON-array env values (parsed via `allowed_origins` / `allowed_image_types` / `allowed_video_types` properties); secret guards untouched; dev DB default is `localhost`.
- `app/core/middleware.py`: CORS reads `settings.allowed_origins`.
- New real endpoints (against existing tables, no schema change):
  - `GET /roles`, `GET /roles/{id}`, `GET /permissions`, `GET /permissions/{code}`
  - `GET /users`, `GET /users/{id}` (admin)
  - `GET /audit/logs` (filtered activity diary)
  - `GET /analytics/overview|sales|products|customers|orders|inventory-summary`
- `backend/README.md`: local (no-Docker) dev instructions.
- `backend/scratch/*` deleted — contained live RDS credentials (security).
- Tests: `pytest` passes (5 tests: auth contract + settings parsing).
- Verified: `uvicorn app.main:app` starts **without Docker/Redis/Celery**; `/health`, `/docs` OK; CORS preflight from `http://localhost:5173` OK. DB-backed routes return the real error when no `DATABASE_URL` PostgreSQL is reachable (no fake data) — with the user's existing PostgreSQL via `DATABASE_URL` they run against the existing schema.

### Frontend
- `apiClient.js`: per-surface token isolation (customer/admin/employee), scope-derived from request path; safe for Node imports.
- `catalogStore.js` + `useCatalog.js`: single backend-fed catalog store (GET /products, /categories, /collections, /home, /explore/offers) with explicit `idle|loading|ready|error` states; no seed, no localStorage.
- Storefront: `useCatalogueQuery` → GET /products|/search only (error/retry states); `ProductDetail` → GET /products/{id} + recommendations API; `AtelierDesign`, `Shop`, `Explore`, `Cart`, `CatalogueListing`, `CategoryPage` subscribe to the store; `hero.js`/`collections.js`/taxonomy facades read the store.
- Auth: demo credential panels removed from customer/admin/employee login pages; API errors surface directly.
- Cart: backend-authoritative for authenticated users (all `/cart*` endpoints; server totals/stock/coupon); guest cart stays client-only (explicitly permitted), coupon codes validated via `POST /offers/validate`.
- Wishlist: backend-authoritative when authenticated; guest-only localStorage otherwise.
- Account: `AccountContext` backend-only (no demo registry, no offline fake success).
- Orders: `OrderContext` server-authoritative (GET /orders); `orderService` no longer seeds demo orders.
- Checkout/payments: `CheckoutContext` no longer uses demo scenarios or frontend inventory reservations; COD and online flows go through `POST /payments/session` + `POST /payments/verify` + `POST /orders`; `paymentService` is a backend-delegating stub.
- Admin products: `catalogRepository` is now a server-backed in-memory cache (`replaceServerProducts`, backend sync on writes); admin product/taxonomy pages read API data; `AdminDashboard` reads `/analytics/*` + `/admin/orders` + `/admin/employees`; `AdminCustomers`/`AdminCustomerDetail` → `customersApi`; `AdminActivity` → `/audit/logs`; `AdminSettings` → `/admin/settings/*`.
- Offers: `offerRepository` is a backend facade (`offersApi`); `useOffers` refreshes from API.
- Media: seed register removed; `mediaStore` memory-only and empty; uploads expose an explicit "backend media service not available" error. **Blocked by schema (§7), never faked.**
- Inventory pages: read from product stock fields only; dedicated inventory tables carry no business columns → documented blocker, explicit unavailable copy.
- Workforce (attendance/performance/leave): seeds removed; stores memory-only; check-in/out return an explicit backend-unavailable message. **Self-service attendance/performance endpoints are a backend gap (§7).**

### Frontend verification
- `npm run build` ✅
- `npm test` ✅ (45 tests passing).
- The previous test suite (≈35 files) validated the **removed mock/seed architecture** (static catalogue counts, seeded media, demo orders/customers/employees/admins, localStorage registers). These were moved to `frontend/tests/retired-demo-architecture/` with a README documenting why; re-adding the seed data to satisfy them would contradict this task's scope.
- Dev servers verified: FastAPI on :8000 (no Docker), Vite on :5173 with `/api` proxy → FastAPI; CORS OK.

### Cleanup pass 2 (runtime mock removal)
- Checkout: **sandbox QR payment method removed** (`qr` entry, `SandboxQrPanel`, `utils/sandboxQr.js`, `DEMO_SCENARIOS`); only UPI / card / netbanking / COD remain, all routed through the backend payment session.
- `paymentService.js`: backend-delegating status vocabulary only (no mock resolution).
- `adminAuthService.js`: removed mock admin register/credentials and mock fingerprint verification; `loadAdmins` surfaces only the JWT session snapshot for UI workflow; `verifyAdminCredentials`/`signInAdmin` delegate to `POST /auth/admin/sign-in`.
- `employeePassword.js`: mock credentials/fingerprints removed — only password-policy validation remains.
- `inventoryRepository.js`: **memory-only session mirror** — no localStorage, no `SEED_LOCATIONS`, no demo movements; inventory pages already carry explicit backend-unavailable copy.
- `orderService.js`, `activityService.js`, `AccountContext`: caches converted from localStorage to memory-only (orders/activity/account are backend-owned).
- `productDeletionService`, `attendanceRepository`, `operationsService`: removed localStorage reads (server-backed / empty).
- Removed `employeeAuthService.js` (unused mock auth module).
- Media upload UI now returns an explicit "backend media service not available" error (no placeholder records); media/inventory/analytics/return/invoice UI copy no longer claims demo or simulated status.

### Remaining known gaps (documented, never faked)
1. Media module (schema blocker).
2. Inventory/warehouses/transfers (schema blocker).
3. Variants/attributes/pricing tables (schema blocker).
4. Employee self-service attendance/performance (endpoints exist only for admin; workforce UI shows explicit unavailable state).
5. AI assistants / AI Mirror — frontend-only assistant; flagged as such; backend chatbot module is scaffolded.
6. Razorpay live payments need real keys via `.env`.

## 11. Dev run (no Docker)

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # set DATABASE_URL to your existing PostgreSQL
uvicorn app.main:app --reload   # http://localhost:8000/docs

# frontend
cd ../frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api → :8000)
```

---

*This audit is the source of truth for the implementation plan; anything marked blocked shows an explicit error/empty state in the UI, never demo data.*
