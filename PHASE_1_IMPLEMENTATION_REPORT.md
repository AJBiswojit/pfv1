# PHASE 1 IMPLEMENTATION REPORT — Security, Identity & Storefront Read Integration

**Date:** 2026-08-26  
**Branch:** `arena/01a03e89-pfv1`  
**Scope:** Phase 1 only — security/identity boundaries, explicit token scopes, scope-safe refresh/session restore, admin/employee identity alignment, and public catalogue read correctness.

## 1. Changes made

### Security and authorization

- Locked `POST /products/{id}/submit-review` to employee/admin workflow principals only.
- Customers now receive `403` before any product workflow mutation can run.
- Assigned employees must have a real employee profile/code, `products.manage`, and product assignment before submit/update workflow actions.
- Product workflow history now uses the employee code for employee actions, not the user UUID.
- Added shared backend RBAC helpers that read existing `users`/`roles`/`permissions`/join models and reuse the existing built-in role vocabulary as fallback.
- Enforced `customers.view` on shared admin/customer routes that intentionally allow employees with permission.
- Enforced `SUPER_ADMIN` for non-bootstrap admin account creation.
- Added blacklist/access-token validation to optional admin-token resolution during admin account creation.
- Added permission checks for settings/notification settings where the existing route contract already declared them.

### Token scope architecture

- Reworked `apiClient` to accept explicit request scope: `customer`, `admin`, `employee`, or `none`/`public`.
- Updated all frontend API adapters under `frontend/src/services/api/` plus `settingsRepository` to pass explicit scopes.
- Fixed admin-only non-`/admin` endpoints to use the admin token:
  - `/analytics/*`
  - `/roles`
  - `/permissions`
  - `/users`
  - `/audit/logs`
- Kept path inference only as a legacy fallback; protected adapters no longer depend on URL-prefix guessing.
- Preserved role-token separation. No token sharing between customer/admin/employee was introduced.

### Token refresh isolation

- Replaced the single global refresh promise with per-scope refresh locks for:
  - `customer`
  - `admin`
  - `employee`
- Refresh failure clears only the failed scope.
- Session-expired events now carry and honor `detail.scope`.
- Customer expiry does not clear admin/employee tokens; admin refresh failure does not clear customer/employee tokens.
- One-retry behavior is preserved; public/none requests never attempt refresh.

### Session restoration

- Customer, admin, and employee contexts no longer treat localStorage profile snapshots as authenticated sessions.
- Customer restore validates with `/customers/me` using customer scope, which also confirms a real customer profile exists.
- Admin restore validates with `/auth/me` using admin scope and requires `user_type === "admin"`.
- Employee restore validates with `/employee/me` using employee scope and requires a returned employee profile/code.
- Invalid, revoked, expired, wrong-role, and missing-profile restore failures clear only the affected scope.

### Admin/employee identity alignment

- Backend token/profile DTOs now include existing employee profile fields where available:
  - `employee_code` / `employeeCode`
  - `designation`
  - `department`
  - `department_id`
  - `section_id`
- `/auth/me` and employee sign-in now expose employee code instead of forcing the frontend to substitute a user UUID.
- `/employee/me` returns roles/permissions and fails when the employee profile is missing.
- Frontend employee normalization no longer falls back to user UUID for `employeeId`.
- Admin DTOs expose the authoritative user UUID under legacy admin aliases because there is no separate admin-code model/column in the audited schema.

### Public catalogue reads

- `collectionId` now uses the existing backend collection-products endpoint:
  - `GET /collections/{collectionId}/products`
- Collection pages therefore request collection-scoped products from PostgreSQL instead of dropping the filter into a general `/products` query.
- Top-level department routes are mapped only to existing backend-supported filters where possible:
  - `women` → `gender=Women`
  - `men` → `category=menswear`
  - `bridal` → `category=bridal-couture`
  - `kids` → `category=kidswear`
- No department database column was invented.
- Deeper/static department route semantics that do not exist in the backend taxonomy remain documented as a limitation rather than faked.
- `catalogStore` now hydrates subcategories via `GET /categories/{categoryId}/subcategories`.
- `useCatalog()` / external-store snapshots now change identity on updates, causing React consumers to re-render after backend hydration.
- Product list/detail/recommendations/recently-viewed paths now respect known inactive/archived category status when category rows exist.
- Fixed frontend `originalPrice` normalization so backend camelCase `originalPrice` is preserved.

## 2. Files modified

### Backend

- `backend/app/dependencies.py`
- `backend/app/api/v1/admin.py`
- `backend/app/api/v1/auth.py`
- `backend/app/api/v1/collections.py`
- `backend/app/api/v1/customers.py`
- `backend/app/api/v1/employees.py`
- `backend/app/api/v1/notifications.py`
- `backend/app/api/v1/products.py`
- `backend/app/schemas/auth/token.py`
- `backend/app/services/auth/auth_service.py`
- `backend/app/services/catalog/explore_service.py`
- `backend/app/services/catalog/product_service.py`
- `backend/tests/unit/test_phase1_security.py`

### Frontend

- `frontend/src/services/api/apiClient.js`
- `frontend/src/services/api/adminApi.js`
- `frontend/src/services/api/authApi.js`
- `frontend/src/services/api/cartApi.js`
- `frontend/src/services/api/categoriesApi.js`
- `frontend/src/services/api/collectionsApi.js`
- `frontend/src/services/api/customersApi.js`
- `frontend/src/services/api/employeesApi.js`
- `frontend/src/services/api/offersApi.js`
- `frontend/src/services/api/ordersApi.js`
- `frontend/src/services/api/paymentsApi.js`
- `frontend/src/services/api/productsApi.js`
- `frontend/src/services/api/searchApi.js`
- `frontend/src/services/api/wishlistApi.js`
- `frontend/src/services/catalog/catalogStore.js`
- `frontend/src/services/employees/employeeService.js`
- `frontend/src/services/settingsRepository.js`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/context/AdminAuthContext.jsx`
- `frontend/src/context/EmployeeAuthContext.jsx`
- `frontend/src/context/EmployeeManagementContext.jsx`
- `frontend/src/context/AccountContext.jsx`
- `frontend/src/context/CartContext.jsx`
- `frontend/src/context/WishlistContext.jsx`
- `frontend/src/hooks/useCatalog.js`
- `frontend/src/hooks/useCatalogueQuery.js`
- `frontend/src/pages/ProductDetail.jsx`
- `frontend/tests/phase1Integration.test.js`

### Report

- `PHASE_1_IMPLEMENTATION_REPORT.md`

## 3. Security fixes

- Customers can no longer submit products for review.
- Submit-review is now enforced server-side and frontend calls use employee scope by default.
- Employee workflow mutations now use employee code and assignment checks.
- Admin account creation now requires an actual `SUPER_ADMIN` role unless the first-admin/bootstrap-secret path is used.
- Revoked admin access tokens are not accepted for optional admin registration actor resolution.
- Shared customer admin routes now require `customers.view`, not just an admin/employee user type.

## 4. Token-scope fixes

- All API adapters now pass `scope` explicitly.
- Admin analytics/RBAC/users/audit calls send admin tokens.
- Customer-only APIs send customer tokens.
- Employee self-service APIs send employee tokens.
- Public catalogue/search/offers/home calls use `scope: "none"`.
- Employee-capable shared customer routes can request `{ scope: "employee" }` without token sharing.

## 5. Session restoration fixes

- Customer restore validates `/customers/me` with customer scope.
- Admin restore validates `/auth/me` with admin scope and checks role type.
- Employee restore validates `/employee/me` with employee scope and checks the profile/code.
- Expired/revoked/wrong-role restore failures clear only the affected scope and local snapshot.

## 6. RBAC fixes

- Added existing-model RBAC helper functions in backend dependencies.
- Applied permission enforcement to:
  - customer admin reads (`customers.view`)
  - settings reads/writes where applicable
  - notification settings reads/writes where applicable
  - product employee workflow update/submit
  - submit-review for admin/employee workflow users
- Did not create a new RBAC architecture or database structure.

## 7. Catalogue fixes

- Collection pages now call `GET /collections/{collectionId}/products`.
- Department routing is limited to existing category/gender filters; unsupported deeper department semantics are not faked.
- Subcategories hydrate through `GET /categories/{categoryId}/subcategories`.
- Catalogue store snapshots are immutable by identity for React external-store subscribers.
- Archived/inactive category products are excluded from known category-backed storefront product reads.
- `originalPrice` normalization preserves camelCase `originalPrice`.

## 8. Tests executed

### Backend

1. `python -m compileall backend/app`
2. `PYTHONPATH=backend /tmp/pfv1-venv/bin/python -m unittest discover -s backend/tests/unit -p 'test*.py'`

Notes:
- A temporary virtualenv at `/tmp/pfv1-venv` was used because the system Python is externally managed and the base environment did not have backend dependencies installed.
- No database tests or schema-altering operations were run.

### Frontend

1. `npm test`
2. `npm run build`

### Safety checks

1. `git diff --check`
2. SHA-256 comparison of all files under `frontend/public/images` before/after implementation.
3. Diff scan confirmed no migration/alembic/schema SQL files were modified.

## 9. Test results

- Backend Python compilation: **PASS**
- Backend unit tests: **PASS** — 6 tests
- Frontend tests: **PASS** — 51 tests
- Frontend production build: **PASS**
- Git whitespace check: **PASS**
- Product image asset integrity: **PASS** — 238 files unchanged

Focused regressions covered:

1. Customer cannot submit product for review — backend unit test.
2. Admin token used for analytics/RBAC/audit — frontend API test.
3. Session restoration validates customer/admin/employee against scoped backend endpoints — frontend API test.
4. Employee token remains isolated from customer refresh failure — frontend API test.
5. Customer expiry does not clear admin/employee session — frontend API test.
6. Collection filtering uses collection-products endpoint — frontend API test.
7. Subcategories hydrate via backend endpoint — frontend catalog-store test.
8. Catalog hydration triggers external-store snapshot identity change — frontend catalog-store test.
9. Archived category products are not exposed in storefront product list — backend unit test.
10. `originalPrice` remains correct — frontend product API test.

## 10. Remaining known issues

- Existing FastAPI cache invalidation for product/category status remains broad/stale in places; this phase added visibility filtering but did not redesign cache invalidation.
- Deeper department route semantics such as `/men/ethnic-wear` or `/bridal/the-bride` depend on category/subcategory values actually present in backend data. No fake department column or mapping table was introduced.
- Some admin product lifecycle semantics remain as audited (approve/publish coupling and permissive transitions) except for submit-review security/assignment/state hardening.
- Employee assigned-products/workflow/desk backend endpoints still contain TODO/placeholder behavior; this phase fixed identity and token scope, not employee operations.
- Notification settings specialized routes are still structurally shadowed by the generic `/admin/settings/{section}` route order in the existing router; access checks were hardened where routes are reached.
- Runtime mock/local business surfaces in employee operations, orders/tracking/invoice, workforce, inventory, media, and AI remain intentionally deferred.
- `npm install` reported 2 dependency audit findings in the existing frontend dependency tree; dependency upgrades were not part of Phase 1.

## 11. DEFERRED — NOT CHANGED

### Explicitly deferred Phase 2 items

- Checkout request DTO repair.
- Payment/order trust-model redesign.
- Preventing method-derived paid order status.
- Order response normalization/read-model work.
- Admin/customer/employee order and return workflow replacement.
- Cart line-ID alignment.
- Guest checkout/guest order claim redesign.

### Other deferred issues outside Phase 1

- Full admin product create/update/lifecycle redesign.
- Product ID convention reconciliation.
- Complete taxonomy mutation lifecycle/activation UX.
- Offer create/update/validate contract redesign.
- Admin settings business-effect integration with cart/order calculations.
- Employee provisioning credential-delivery flow.
- Employee self-service/operations APIs.
- Inventory APIs.
- Media upload/S3/CDN migration.
- Real notifications, courier tracking, OAuth provider completion, and AI provider integration.

## 12. Safety confirmations

- No PostgreSQL schema files or migrations were created or modified.
- No `ALTER TABLE`, destructive SQL, seed data, mock business fallback, Redis, Celery, Docker architecture, S3/CDN migration, or product media migration was implemented.
- Existing files under `frontend/public/images` were preserved exactly; no image was deleted, renamed, moved, replaced, or modified.
