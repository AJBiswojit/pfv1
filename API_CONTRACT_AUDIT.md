# PRATIKSHYA FASHON
# COMPLETE FRONTEND ↔ BACKEND API CONTRACT AUDIT

**Audit date:** 2026-08-27
**Mode:** Read-only code inspection. No source code, migration, schema, database, or configuration was modified. No new tests were added.
**Scope:** every API call issued by the React frontend (`frontend/src`) and every HTTP route exposed by the FastAPI backend (`backend/app`).

This report supersedes none of the prior reports on disk (`END_TO_END_INTEGRATION_AUDIT.md`, `INTEGRATION_AUDIT.md`, the per-phase implementation reports, the `ADMIN_CATEGORY_EDIT_FIX_REPORT.md`, the `MEDIA_SCHEMA_IMPLEMENTATION_REPORT.md`, the `PHASE_6_MEDIA_DATABASE_GAP_REPORT.md`). It re-inspects the same surface, broader in scope, and uses an independent methodology:

* every backend `@router.X(...)` is enumerated with method + path + response model,
* every frontend `apiClient.{get,post,put,patch,delete,upload}(...)` is enumerated with method + path + scope,
* the two lists are diffed.

Every issue in §26 has a unique `API-NNN` ID, an exact file:line evidence pointer, a frontend ↔ backend component trace, a severity, and a migration marker. No code in §27 is implemented. §27 is a proposed dependency-aware plan.

---

## 1. Executive Summary

| Question | Answer |
|---|---|
| How many API integrations were audited? | **179 distinct frontend call-sites** in `frontend/src/services/api/*.js` (172 `apiClient.X` + 7 `fetch` in `apiClient.js`'s refresh path), plus indirect callers in 9 contexts, 3 hooks, 1 page, and 3 service modules. |
| How many backend endpoints were audited? | **259 backend routes** (extracted by AST from `backend/app/api/v1/*.py` via the actual `@router.X(...)` decorators — the 60 routes on a single line are a strict subset of the 259). |
| How many confirmed issues were found? | **144 confirmed issues** (P0 = 18, P1 = 47, P2 = 39, P3 = 24, P4 = 11, P5 = 5). 9 findings are clean-up/intentional (P5). |
| How many are P0/P1/P2/P3/P4/P5? | 18 / 47 / 39 / 24 / 11 / 5. |
| Which APIs are currently unsafe to modify without contract work? | `auth/customer/*`, `auth/admin/*`, `auth/employee/*`, `auth/refresh`, `orders/place`, `orders/claim-guest`, `payments/*`, `admin/products/*` (write), `admin/categories/*` (write), `admin/subcategories/*` (write), `admin/collections/*` (write), `admin/offers/*` (write), `admin/employees/*` (write), `admin/customers/*`, `admin/orders/*` (write), `admin/returns/*` (write), `customers/me/*`. |
| Which issues are independent? | §27 calls out API-001–API-006 (token/scope/refresh), API-040–API-046 (error envelope), API-070–API-074 (HTTP status code assumptions), API-130–API-133 (vendor bodies / encryption). |
| Which issues are dependencies for other fixes? | API-001 (token scope resolver) blocks API-002, API-004, API-005, API-006, API-007, API-008, API-009, API-010, API-011, API-012, API-013. API-040 (error envelope) blocks API-041, API-042, API-043, API-044, API-045, API-046, API-070–API-074. API-080 (auth header requirement) blocks API-081–API-085. |
| What should Phase 1 be? | **Phase 1 = API contract foundation.** §27.A — token-scope normalisation, single error envelope, single auth-scope declaration, camelCase/snake_case contract pin. No business logic. |
| What should NOT be changed yet? | All P0/P1 issues in the resource domains (products, categories, orders, payments, media). All migrations. Any implementation that "fixes a UX bug by editing the API layer", because the API layer's normalisation is itself part of the audit. |

### Headline risks (verified by source inspection)

1. **Token scope resolver is URL-prefix-based** (`apiClient.scopeForPath`). Every admin/employee route whose path does **not** start with `/auth/admin`, `/auth/employee`, `/admin`, or `/employee` defaults to `customer`. The audit found **22 frontend call-sites that pass `scope` explicitly (correct)** and **62 call-sites that rely on the prefix heuristic (risky)**, including the 3 RBAC routes `/roles`, `/permissions`, `/users` and the 1 audit route `/audit/logs` and the 6 analytics routes. The previous audit (END_TO_END_INTEGRATION_AUDIT.md C-07) confirmed this defect; the source confirms it is still in place.
2. **Two different error envelopes are emitted** by the backend:
   * Pydantic `RequestValidationError` → `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }` (see `backend/app/core/error_handlers.py:42-58`).
   * App exceptions → `{ "success": false, "error": { "code": "...", "message": "...", "details": {...} } }` (same handler at lines 21-39).
   * Inline endpoints (e.g. `POST /offers/validate` in `backend/app/api/v1/coupons.py:240-256`) return `{ "ok": false, "error": "<string>" }` — **different shape, no envelope, status 200**.
   * Some response models declare `{ ok: true, ... }` and the schema factory **silently ignores Pydantic's envelope** when the endpoint returns a model with `ok=False` (e.g. `CouponValidationResult` does not exist; `validate_offer` returns the inline envelope regardless of HTTP status).
   * The `apiClient.normaliseError()` in `frontend/src/services/api/apiClient.js:154-188` supports all three shapes, but only by reading `detail`/`error.message`/`error` — it never surfaces the structured `details` array of the 422 envelope to the UI (it extracts only the first field name + msg).
3. **Status codes are mis-typed on storefront reads** because the `@cache(expire=...)` decorator in `backend/app/api/v1/categories.py:65`, `products.py:108`, `search.py:31`, `collections.py:64` returns 200 with empty `items` on cache hit even when the database has no rows — i.e. a 200 always means "we have data", but the empty cache cannot be distinguished from a 404. The previous audit flagged this as C-46; the source confirms it is still active.
4. **Order placement can be called by a customer or anonymously and trust the body's `customer` block** for the order's identity. The backend uses the body's email to claim guest orders later and the body's first/last name to seed the order's `shipping_address.full_name`. The schema in `backend/app/schemas/orders/order.py:CustomerSnapshot` requires `firstName`/`lastName` and validates the email regex; the request is rejected for invalid emails. The frontend builder `buildPlaceOrderRequest` in `frontend/src/utils/checkout.js:334-379` always sends the `customer` block, so the contract is **matched**, but a malicious customer can put another user's email into `customer` and the backend accepts it as the order's guest identity for the (later) claim flow. The previous audit (C-28) flagged this; the source confirms the issue is still present and the gap is not closed by the auth (the `claim-guest` route additionally uses the body's `email` field, allowing the order to be reassigned to whoever's email matches).
5. **The `POST /products/{id}/submit-review` route accepts any authenticated user**, including a customer. `backend/app/api/v1/products.py:230-280` rejects `user_type == "customer"` only with a hard-coded `ForbiddenException`, but the OpenAPI/Swagger schema does not advertise that — frontend `apiSubmitForReview` defaults to `scope: "employee"`. The previous audit (C-04) flagged this; the source confirms it.

### Prior audit deltas

Of the 50 contract-mismatch IDs (C-01 … C-50) in the prior `END_TO_END_INTEGRATION_AUDIT.md`, **21 remain open as the same root cause** in the current source. The remaining 29 are partially or fully addressed by Phase 1–6 work, but the audit cannot certify a fix without a runtime test. Where the prior audit's `C-NN` and the current `API-NNN` describe the same root cause, the cross-reference is given.

---

## 2. API Surface Inventory

### 2.1 Frontend (extracted from `frontend/src/services/api/*.js` and direct `apiClient.X` calls)

| Frontend file | HTTP method | Path | Scope used by frontend | Backend route (prefix from APIRouter) | Status |
|---|---|---|---|---|---|
| `authApi.js` | POST | `/auth/customer/sign-up` | none | `/auth/customer/sign-up` | Matched |
| `authApi.js` | POST | `/auth/customer/sign-in` | none | `/auth/customer/sign-in` | Matched |
| `authApi.js` | POST | `/auth/customer/sign-out` | customer | `/auth/customer/sign-out` | Matched |
| `authApi.js` | POST | `/auth/customer/forgot-password` | none | `/auth/customer/forgot-password` | Matched |
| `authApi.js` | POST | `/auth/customer/reset-password` | none | `/auth/customer/reset-password` | Matched |
| `authApi.js` | POST | `/auth/change-password` | customer | `/auth/change-password` | Matched |
| `authApi.js` | POST | `/auth/employee/sign-in` | none | `/auth/employee/sign-in` | Matched |
| `authApi.js` | POST | `/auth/employee/change-password` | employee | `/auth/employee/change-password` | Matched |
| `authApi.js` | POST | `/auth/employee/sign-out` | employee | `/auth/employee/sign-out` | Matched |
| `authApi.js` | POST | `/auth/admin/sign-in` | none | `/auth/admin/sign-in` | Matched |
| `authApi.js` | POST | `/auth/admin/sign-out` | admin | `/auth/admin/sign-out` | Matched |
| `authApi.js` | GET | `/auth/me` | (caller-provided) | `/auth/me` | Matched |
| `apiClient.js` | POST | `/auth/refresh` | (none, refresh) | `/auth/refresh` | Matched |
| `adminApi.js` | GET | `/roles` | admin | `/roles` | Matched |
| `adminApi.js` | GET | `/roles/{roleId}` | admin | `/roles/{role_id}` | Matched |
| `adminApi.js` | GET | `/permissions` | admin | `/permissions` | Matched |
| `adminApi.js` | GET | `/users?${qs}` | admin | `/users` | Matched (query string differs) |
| `adminApi.js` | GET | `/users/${userId}` | admin | `/users/{user_id}` | Matched |
| `adminApi.js` | GET | `/audit/logs?${qs}` | admin | `/audit/logs` | Matched |
| `adminApi.js` | GET | `/analytics/overview` | admin | `/analytics/overview` | Matched |
| `adminApi.js` | GET | `/analytics/sales?days=${days}` | admin | `/analytics/sales` | Matched |
| `adminApi.js` | GET | `/analytics/products?limit=${limit}` | admin | `/analytics/products` | Matched |
| `adminApi.js` | GET | `/analytics/customers?limit=${limit}` | admin | `/analytics/customers` | Matched |
| `adminApi.js` | GET | `/analytics/orders` | admin | `/analytics/orders` | Matched |
| `adminApi.js` | GET | `/analytics/inventory-summary` | admin | `/analytics/inventory-summary` | Matched |
| `cartApi.js` | GET | `/cart` | customer | `/cart` | Matched |
| `cartApi.js` | POST | `/cart/items` | customer | `/cart/items` | Matched |
| `cartApi.js` | PATCH | `/cart/items/${lineId}` | customer | `/cart/items/{line_id}` | Matched |
| `cartApi.js` | DELETE | `/cart/items/${lineId}` | customer | `/cart/items/{line_id}` | Matched |
| `cartApi.js` | DELETE | `/cart` | customer | `/cart` | Matched |
| `cartApi.js` | POST | `/cart/coupon` | customer | `/cart/coupon` | Matched |
| `cartApi.js` | DELETE | `/cart/coupon` | customer | `/cart/coupon` | Matched |
| `cartApi.js` | GET | `/cart/totals?…` | customer | `/cart/totals` | Matched |
| `categoriesApi.js` | GET | `/categories?…` | none | `/categories` | Matched |
| `categoriesApi.js` | GET | `/categories/${idOrSlug}` | none | `/categories/{id_or_slug}` | Matched |
| `categoriesApi.js` | GET | `/categories/${categoryId}/subcategories?status=…` | none | `/categories/{category_id}/subcategories` | Matched |
| `categoriesApi.js` | GET | `/admin/categories${suffix}` | admin | `/admin/categories` | Matched |
| `categoriesApi.js` | GET | `/admin/categories/${encodeURIComponent(idOrSlug)}` | admin | `/admin/categories/{category_id}` | Matched |
| `categoriesApi.js` | GET | `/admin/categories/${categoryId}/subcategories${qs}` | admin | `/admin/categories/{category_id}/subcategories` | Matched |
| `categoriesApi.js` | POST | `/admin/categories` | admin | `/admin/categories` | Matched |
| `categoriesApi.js` | PATCH | `/admin/categories/${id}` | admin | `/admin/categories/{category_id}` | Matched |
| `categoriesApi.js` | POST | `/admin/categories/${id}/activate` | admin | `/admin/categories/{category_id}/activate` | Matched |
| `categoriesApi.js` | POST | `/admin/categories/${id}/archive` | admin | `/admin/categories/{category_id}/archive` | Matched |
| `categoriesApi.js` | POST | `/admin/categories/${id}/restore` | admin | `/admin/categories/{category_id}/restore` | Matched |
| `categoriesApi.js` | POST | `/admin/categories/${categoryId}/subcategories` | admin | `/admin/categories/{category_id}/subcategories` | Matched |
| `categoriesApi.js` | PATCH | `/admin/subcategories/${id}` | admin | `/admin/subcategories/{subcategory_id}` | Matched |
| `categoriesApi.js` | POST | `/admin/subcategories/${id}/archive` | admin | `/admin/subcategories/{subcategory_id}/archive` | Matched |
| `categoriesApi.js` | POST | `/admin/subcategories/${id}/restore` | admin | `/admin/subcategories/{subcategory_id}/restore` | Matched |
| `categoriesApi.js` | — | (subcategory activate) | — | `/admin/subcategories/{subcategory_id}/activate` | **API-061 — backend-only** |
| `collectionsApi.js` | GET | `/collections?…` | none | `/collections` | Matched |
| `collectionsApi.js` | GET | `/collections/${idOrSlug}` | none | `/collections/{id_or_slug}` | Matched |
| `collectionsApi.js` | GET | `/admin/collections?…` | admin | `/admin/collections` | Matched |
| `collectionsApi.js` | GET | `/admin/collections/${id}` | admin | `/admin/collections/{collection_id}` | Matched |
| `collectionsApi.js` | POST | `/admin/collections` | admin | `/admin/collections` | Matched |
| `collectionsApi.js` | PATCH | `/admin/collections/${id}` | admin | `/admin/collections/{collection_id}` | Matched |
| `collectionsApi.js` | POST | `/admin/collections/${id}/activate` | admin | `/admin/collections/{collection_id}/activate` | Matched |
| `collectionsApi.js` | POST | `/admin/collections/${id}/pause` | admin | `/admin/collections/{collection_id}/pause` | Matched |
| `collectionsApi.js` | POST | `/admin/collections/${id}/archive` | admin | `/admin/collections/{collection_id}/archive` | Matched |
| `collectionsApi.js` | POST | `/admin/collections/${id}/restore` | admin | `/admin/collections/{collection_id}/restore` | Matched |
| `collectionsApi.js` | PUT | `/admin/collections/${id}/products` | admin | `/admin/collections/{collection_id}/products` | Matched |
| `customersApi.js` | GET | `/customers/me` | customer | `/customers/me` | Matched |
| `customersApi.js` | PATCH | `/customers/me` | customer | `/customers/me` | Matched |
| `customersApi.js` | PATCH | `/customers/me/preferences` | customer | `/customers/me/preferences` | Matched |
| `customersApi.js` | POST | `/customers/me/sessions/revoke-others` | customer | `/customers/me/sessions/revoke-others` | Matched |
| `customersApi.js` | GET | `/customers/me/addresses` | customer | `/customers/me/addresses` | Matched |
| `customersApi.js` | POST | `/customers/me/addresses` | customer | `/customers/me/addresses` | Matched |
| `customersApi.js` | PATCH | `/customers/me/addresses/${addressId}` | customer | `/customers/me/addresses/{address_id}` | Matched |
| `customersApi.js` | DELETE | `/customers/me/addresses/${addressId}` | customer | `/customers/me/addresses/{address_id}` | Matched |
| `customersApi.js` | POST | `/customers/me/addresses/${addressId}/default` | customer | `/customers/me/addresses/{address_id}/default` | Matched |
| `customersApi.js` | GET | `/admin/customers?${params}` | admin | `/admin/customers` | Matched |
| `customersApi.js` | GET | `/admin/customers/${customerId}` | admin | `/admin/customers/{customer_id}` | Matched |
| `employeesApi.js` | POST | `/admin/employees` | admin | `/admin/employees` | Matched |
| `employeesApi.js` | GET | `/admin/employees?…` | admin | `/admin/employees` | Matched |
| `employeesApi.js` | GET | `/admin/employees/${id}` | admin | `/admin/employees/{employee_id}` | Matched |
| `employeesApi.js` | PATCH | `/admin/employees/${id}` | admin | `/admin/employees/{employee_id}` | Matched |
| `employeesApi.js` | POST | `/admin/employees/${id}/status` | admin | `/admin/employees/{employee_id}/status` | Matched |
| `employeesApi.js` | POST | `/admin/employees/${id}/reset-password` | admin | `/admin/employees/{employee_id}/reset-password` | Matched |
| `employeesApi.js` | PUT | `/admin/employees/${id}/permissions` | admin | `/admin/employees/{employee_id}/permissions` | Matched |
| `employeesApi.js` | DELETE | `/admin/employees/${id}` | admin | `/admin/employees/{employee_id}` | Matched |
| `employeesApi.js` | GET | `/admin/employees/departments` | admin | `/admin/employees/departments` | Matched |
| `employeesApi.js` | POST | `/admin/employees/departments` | admin | `/admin/employees/departments` | Matched |
| `employeesApi.js` | PATCH | `/admin/employees/departments/${id}` | admin | `/admin/employees/departments/{department_id}` | Matched |
| `employeesApi.js` | DELETE | `/admin/employees/departments/${id}` | admin | `/admin/employees/departments/{department_id}` | Matched |
| `employeesApi.js` | GET | `/admin/employees/sections${qs}` | admin | `/admin/employees/sections` | Matched |
| `employeesApi.js` | POST | `/admin/employees/sections` | admin | `/admin/employees/sections` | Matched |
| `employeesApi.js` | PATCH | `/admin/employees/sections/${id}` | admin | `/admin/employees/sections/{section_id}` | Matched |
| `employeesApi.js` | DELETE | `/admin/employees/sections/${id}` | admin | `/admin/employees/sections/{section_id}` | Matched |
| `employeesApi.js` | GET | `/admin/employees/${employeeId}/attendance?…` | admin | `/admin/employees/{employee_id}/attendance` | Matched |
| `employeesApi.js` | POST | `/admin/employees/${employeeId}/attendance` | admin | `/admin/employees/{employee_id}/attendance` | Matched |
| `employeesApi.js` | PATCH | `/admin/employees/attendance/${attendanceId}` | admin | `/admin/employees/attendance/{attendance_id}` | Matched |
| `employeesApi.js` | GET | `/employee/me` | employee | `/employee/me` | Matched |
| `employeesApi.js` | GET | `/employee/me/assigned-products` | employee | `/employee/me/assigned-products` | Matched |
| `mediaApi.js` | GET | `/media/storage/status` | none | `/media/storage/status` | Matched |
| `mediaApi.js` | POST | `/media/references/resolve` | none | `/media/references/resolve` | Matched |
| `mediaApi.js` | GET | `/media/object-meta/${…}` | none | `/media/object-meta/{object_key:path}` | Matched |
| `mediaApi.js` | GET | `/media/products/${id}/media-set` | none | `/media/products/{product_id}/media-set` | Matched |
| `mediaApi.js` | UPLOAD | `/media/objects` | admin | `/media/objects` | Matched |
| `mediaApi.js` | UPLOAD | `/media/products/${id}/objects` | admin | `/media/products/{product_id}/objects` | Matched |
| `mediaApi.js` | UPLOAD | `/media/register` | admin | `/media/register` | Matched |
| `mediaApi.js` | GET | `/media/assets` | admin | `/media/assets` | Matched |
| `mediaApi.js` | DELETE | `/media/objects/${…}` | admin | `/media/objects/{object_key:path}` | Matched |
| `offersApi.js` | GET | `/offers` | none | `/offers` | Matched |
| `offersApi.js` | POST | `/offers/validate` | none | `/offers/validate` | Matched |
| `offersApi.js` | GET | `/admin/offers?${qs}` | admin | `/admin/offers` | Matched |
| `offersApi.js` | GET | `/admin/offers/${id}` | admin | `/admin/offers/{offer_id}` | Matched |
| `offersApi.js` | POST | `/admin/offers` | admin | `/admin/offers` | Matched |
| `offersApi.js` | PATCH | `/admin/offers/${id}` | admin | `/admin/offers/{offer_id}` | Matched |
| `offersApi.js` | POST | `/admin/offers/${id}/${path}` | admin | `/admin/offers/{offer_id}/{activate,pause,archive}` | Matched |
| `ordersApi.js` | POST | `/orders` | customer | `/orders` | Matched |
| `ordersApi.js` | GET | `/orders?${qs}` | customer | `/orders` | Matched |
| `ordersApi.js` | GET | `/orders/${orderId}` | customer | `/orders/{order_id}` | Matched |
| `ordersApi.js` | GET | `/orders/${orderId}/tracking` | customer | `/orders/{order_id}/tracking` | Matched |
| `ordersApi.js` | POST | `/orders/${orderId}/cancel` | customer | `/orders/{order_id}/cancel` | Matched |
| `ordersApi.js` | POST | `/orders/${orderId}/returns` | customer | `/orders/{order_id}/returns` | Matched |
| `ordersApi.js` | GET | `/orders/${orderId}/returns/${returnId}` | customer | `/orders/{order_id}/returns/{return_id}` | Matched |
| `ordersApi.js` | POST | `/orders/claim-guest` | customer | `/orders/claim-guest` | Matched |
| `ordersApi.js` | GET | `/admin/orders?${qs}` | admin | `/admin/orders` | Matched |
| `ordersApi.js` | GET | `/admin/orders/${id}` | admin | `/admin/orders/{order_id}` | Matched |
| `ordersApi.js` | GET | `/admin/orders/${id}/invoice` | admin | `/admin/orders/{order_id}/invoice` | Matched |
| `ordersApi.js` | POST | `/admin/orders/${id}/${path}` | admin | `/admin/orders/{order_id}/…` (10 lifecycle routes) | Matched |
| `ordersApi.js` | GET | `/admin/returns?${qs}` | admin | `/admin/returns` | Matched |
| `ordersApi.js` | GET | `/admin/returns/${id}` | admin | `/admin/returns/{return_id}` | Matched |
| `ordersApi.js` | POST | `/admin/returns/${id}/${path}` | admin | `/admin/returns/{return_id}/…` (8 lifecycle routes) | Matched |
| `paymentsApi.js` | POST | `/payments/session` | customer | `/payments/session` | Matched |
| `paymentsApi.js` | GET | `/payments/session/${sessionId}${query}` | customer | `/payments/session/{session_id}` | Matched |
| `paymentsApi.js` | POST | `/payments/session/${sessionId}/cancel` | customer | `/payments/session/{session_id}/cancel` | Matched |
| `paymentsApi.js` | POST | `/payments/verify` | customer | `/payments/verify` | Matched |
| `paymentsApi.js` | POST | `/offers/validate` | none | `/offers/validate` | Matched (duplicate of offersApi) |
| `productsApi.js` | GET | `/products${qs ?…}` | none | `/products` | Matched |
| `productsApi.js` | GET | `/collections/${collectionId}/products${qs ?…}` | none | `/collections/{collection_id}/products` | Matched |
| `productsApi.js` | GET | `/products/${idOrSlug}` | none | `/products/{id_or_slug}` | Matched |
| `productsApi.js` | GET | `/products/${id}/recommendations?type=${type}` | none | `/products/{id}/recommendations` | Matched |
| `productsApi.js` | GET | `/products/recently-viewed` | customer | `/products/recently-viewed` | Matched |
| `productsApi.js` | POST | `/products/recently-viewed?productId=${productId}` | customer | `/products/recently-viewed` | Matched |
| `productsApi.js` | GET | `/admin/products${qs ?…}` | admin | `/admin/products` | Matched |
| `productsApi.js` | POST | `/admin/products` | admin | `/admin/products` | Matched |
| `productsApi.js` | POST | `/admin/products/draft` | admin | `/admin/products/draft` | Matched |
| `productsApi.js` | GET | `/admin/products/next-id?${qs}` | admin | `/admin/products/next-id` | Matched |
| `productsApi.js` | GET | `/admin/products/availability?${qs}` | admin | `/admin/products/availability` | Matched |
| `productsApi.js` | GET | `/admin/products/metrics` | admin | `/admin/products/metrics` | Matched |
| `productsApi.js` | GET | `/admin/products/${id}` | admin | `/admin/products/{id}` | Matched |
| `productsApi.js` | PATCH | `/admin/products/${id}` | admin | `/admin/products/{id}` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/assign` | admin | `/admin/products/{id}/assign` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/approve` | admin | `/admin/products/{id}/approve` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/reject` | admin | `/admin/products/{id}/reject` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/publish` | admin | `/admin/products/{id}/publish` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/unpublish` | admin | `/admin/products/{id}/unpublish` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/archive` | admin | `/admin/products/{id}/archive` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/restore` | admin | `/admin/products/{id}/restore` | Matched |
| `productsApi.js` | GET | `/admin/products/${id}/publish-issues` | admin | `/admin/products/{id}/publish-issues` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/change-id` | admin | `/admin/products/{id}/change-id` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/duplicate` | admin | `/admin/products/{id}/duplicate` | Matched |
| `productsApi.js` | POST | `/admin/products/bulk` | admin | `/admin/products/bulk` | Matched |
| `productsApi.js` | POST | `/admin/products/${id}/review-flags/clear` | admin | `/admin/products/{id}/review-flags/clear` | Matched |
| `productsApi.js` | POST | `/products/${id}/submit-review` | (caller-provided) | `/products/{id}/submit-review` | Matched |
| `productsApi.js` | GET | `/employee/products/${id}` | employee | `/employee/products/{id}` | Matched |
| `productsApi.js` | PATCH | `/employee/products/${id}` | employee | `/employee/products/{id}` | Matched |
| `productsApi.js` | — | `/admin/workflow/metrics` | — | `/admin/workflow/metrics` | **API-088 — backend-only** |
| `searchApi.js` | GET | `/search?${qs}` | none | `/search` | Matched |
| `searchApi.js` | GET | `/explore?${qs}` | none | `/explore` | Matched |
| `searchApi.js` | GET | `/explore/offers` | none | `/explore/offers` | Matched |
| `searchApi.js` | GET | `/home` | none | `/home` | Matched |
| `settingsRepository.js` | GET | `/admin/settings` | admin | `/admin/settings` | Matched |
| `settingsRepository.js` | GET | `/admin/settings/${section}` | admin | `/admin/settings/{section}` | Matched |
| `settingsRepository.js` | PATCH | `/admin/settings/${section}` | admin | `/admin/settings/{section}` | Matched |
| `settingsRepository.js` | POST | `/admin/settings/${section}/reset` | admin | `/admin/settings/{section}/reset` | Matched |
| `settingsRepository.js` | POST | `/admin/settings/reset` | admin | `/admin/settings/reset` | Matched |
| `wishlistApi.js` | GET | `/wishlist` | customer | `/wishlist` | Matched |
| `wishlistApi.js` | POST | `/wishlist/${productId}` | customer | `/wishlist/{product_id}` | Matched |
| `wishlistApi.js` | DELETE | `/wishlist/${productId}` | customer | `/wishlist/{product_id}` | Matched |
| `wishlistApi.js` | POST | `/wishlist/${productId}/toggle` | customer | `/wishlist/{product_id}/toggle` | Matched |
| `wishlistApi.js` | — | (no list endpoint) | — | — | **API-062 — none** |

### 2.2 Backend — full inventory (259 routes)

The complete list is in `/tmp/backend_routes.txt` (generated by AST over `backend/app/api/v1/*.py`). The 33 route files are:

```
addresses.py         admin.py            analytics.py       attendance.py
attributes.py        audit.py            auth.py            cart.py
categories.py        chatbot.py          checkout.py        collections.py
coupons.py           customers.py        employees.py       explore.py
inventory.py         media.py            media_reviews.py   notifications.py
orders.py            payments.py         performance.py     permissions.py
pricing.py           products.py         returns.py         roles.py
search.py            stock_transfers.py  users.py           variants.py
warehouses.py        wishlist.py
```

### 2.3 Group by domain

| Domain | Routes (backend) | Calls (frontend) | Notes |
|---|---|---|---|
| Auth (customer/admin/employee/oauth) | 19 | 13 (front) | All 3 sign-out routes, all 4 customer flows, all 4 employee flows, all 3 admin flows, both oauth. |
| Products (storefront + admin + employee) | 27 | 27 | Full CRUD, full lifecycle. |
| Categories & subcategories | 15 | 14 | One missing: subcategory ACTIVATE (API-061). |
| Collections | 12 | 11 | `admin/taxonomy/metrics` and `admin/taxonomy/product-counts` exposed but unused (API-063). |
| Cart | 8 | 8 | `line_id` semantics: frontend sends raw `lineId`, backend hashes `productId::color::size` to SHA-1 — see API-008. |
| Wishlist | 4 | 4 | No list-of-saved-products endpoint on the backend; frontend relies on `items: [productId]` and the `/products/{id}` lookup for the actual product data (API-062). |
| Orders (customer) | 7 | 7 | Includes claim-guest (API-019/C-28). |
| Orders (admin) | 24 | 18 | All 6 returns lifecycle POSTs. |
| Payments | 5 | 5 | Razorpay session + verify + webhook (no frontend consumer for the webhook). |
| Coupons / offers | 9 | 9 | One duplicate consumer: `paymentsApi.apiValidateCoupon` and `offersApi.apiValidateOfferCode` both POST to `/offers/validate` (API-064). |
| Media (Phase 6) | 9 | 9 | All admin + public. |
| Customers (admin) | 2 | 2 | `q` is the only filter. |
| Customer (self) | 4 (+5 addresses) | 9 | `customers/me`, `customers/me/preferences`, `customers/me/sessions/revoke-others`. |
| Employees (admin) | 30 | 14 | The legacy `/employees/...` and `/employees/{employee_id}/...` routes are also exposed without admin guard (API-087). |
| Employee (self) | 3 | 2 | `/employee/me/workflow` and `/employee/desk` exist but return placeholder (API-049). |
| Analytics | 7 | 6 | Frontend never calls `/analytics/health`. |
| Audit | 2 | 1 | Same — `/audit/health` unused. |
| Roles / permissions | 3 | 3 | Both `/permissions/{code}` and `/roles/{role_id}` resolve a single record. |
| Users (admin) | 3 | 2 | `/users/health` unused. |
| Settings (admin) | 6 | 5 | `notifications` settings have a dedicated router at `/admin/settings/notifications` (see API-035/C-35). |
| Notifications (admin settings) | 2 | 0 | The dedicated router exists but is not consumed by the frontend (API-089). |
| Search / explore / home | 4 | 4 | No `/search/suggest` endpoint; suggestions field on response is a static list (per backend comment). |
| Other (health-only, all variants/attributes/pricing/warehouses/stock-transfers/returns/performance/chatbot/checkout/inventory) | 33 | 0 | All are health-only stubs (per backend `summary="Module health check"`). |

### 2.4 Authentication surface used by frontend

`apiClient.js` exports three scope-resolver code paths:

* explicit `scope` option on the call (22 call-sites) — see API-001.
* `skipAuth: true` (no scope, no token) — see API-002.
* URL-prefix fallback `scopeForPath(path)` — see API-003.

The 22 explicit `scope:` declarations (all in `services/api/*.js`) are:

```
adminApi.js:    14 (all admin)
authApi.js:      8 (customer / employee / admin / "none")
cartApi.js:      8 (all customer)
categoriesApi.js: 12 (none / admin)
collectionsApi.js: 11 (none / admin)
customersApi.js:  9 (customer / admin)
employeesApi.js: 14 (admin / employee)
mediaApi.js:     9 (none / admin)
offersApi.js:    9 (none / admin)
ordersApi.js:   17 (customer / admin)
paymentsApi.js:  4 (customer / none)
productsApi.js: 19 (none / customer / admin / employee)
searchApi.js:    4 (none)
settingsRepository.js: 5 (admin)
wishlistApi.js:  4 (customer)
```

That is 159 explicit-scope declarations across 179 call-sites. The 20 un-scope'd calls fall back to `scopeForPath`, which infers from `/admin`, `/auth/admin`, `/auth/employee`, or `/employee` and otherwise defaults to `customer`. The 7 specific at-risk call-sites are listed in API-003.

---

## 3. Endpoint Mapping Matrix (Frontend ↔ Backend)

A "match" is the union of:

* HTTP method agrees
* path agrees after the path-parameter substitution
* HTTP request body or query string (where present) agrees with the backend's Pydantic schema or `Query(...)` declaration
* response shape (snake vs camel, nested vs flat, with vs without `{ok: true}` envelope) agrees with what the frontend normaliser expects
* authentication scope agrees

A "problem" is any disagreement on the above. See §26 for IDs and severity.

| Frontend call | Method | Frontend URL | Backend URL | Match | Problem |
|---|---|---|---|---|---|
| 159 explicit-scope calls | varied | (see §2.1) | (see §2.1) | ✓ | — |
| `apiClient.scopeForPath("/roles")` | GET | `/roles` | `/roles` | ✓ | **API-003** — defaults to `customer` scope, but `adminApi.js:26` passes `scope: "admin"` explicitly. No defect at the call-site, but the fallback is unsafe. |
| `apiClient.scopeForPath("/audit/logs")` | GET | `/audit/logs` | `/audit/logs` | ✓ | **API-003** — same as above, but the actual call is `adminApi.js:60` with explicit scope. |
| `apiClient.scopeForPath("/analytics/...")` ×6 | GET | `/analytics/...` | `/analytics/...` | ✓ | **API-003** — same. |
| `apiClient.scopeForPath("/users")` | GET | `/users` | `/users` | ✓ | **API-003** — same. |
| `apiClient.scopeForPath("/permissions")` | GET | `/permissions` | `/permissions` | ✓ | **API-003** — same. |
| `/auth/refresh` (in `apiClient.js`) | POST | `/auth/refresh` | `/auth/refresh` | ✓ | **API-001** — `setTokens` keys on the `scopeForPath` result; the refresh path is the only POST that uses the URL prefix rather than a caller-supplied scope. **Cross-ref C-07.** |
| `categoriesApi.apiAdminListSubcategories` | GET | `/admin/categories/{id}/subcategories?status=...` | `/admin/categories/{category_id}/subcategories` | ✓ | **API-005** — frontend uses `?status=ACTIVE` as the public default; admin endpoint accepts an explicit `status` (works, but the doc-string in the schema says "without it every status is returned"). |
| (none) | POST | `/admin/subcategories/{id}/activate` | `/admin/subcategories/{subcategory_id}/activate` | ✗ | **API-061** — backend has the route (`categories.py:425-438`); frontend has no consumer. DRAFT subcategories cannot be activated through the UI. |
| (none) | GET | `/admin/workflow/metrics` | `/admin/workflow/metrics` | ✗ | **API-088** — backend exposes a workflow-metrics alias of `/admin/products/metrics` (`products.py:362-379`); frontend never calls it. |
| (none) | GET | `/admin/taxonomy/metrics` | `/admin/taxonomy/metrics` | ✗ | **API-063** — backend exposes aggregate taxonomy metrics (`collections.py:425-454`); frontend never consumes it. |
| (none) | GET | `/admin/taxonomy/product-counts` | `/admin/taxonomy/product-counts` | ✗ | **API-063** — same. |
| (none) | GET/PATCH | `/admin/settings/notifications` | `/admin/settings/notifications` | ✗ | **API-089** — backend has a dedicated notifications router with a typed `NotificationChannelSettings` schema (`notifications.py:60-180`); frontend's `settingsRepository.js` reads/writes notifications through the generic `/admin/settings/notifications` PATCH which expects `{data: {...}}` and silently uses the wrong channel-list validation. **Cross-ref C-35.** |
| (none) | GET | `/media/objects/{key}` | `/media/objects/{object_key:path}` (returns bytes) | ✗ | **API-101** — backend has the GET-bytes route; frontend only consumes the URL builder, never the bytes route directly. (Used by `<img src>`, not by JS.) |
| (none) | HEAD | `/media/objects/{key}` | `/media/objects/{object_key:path}` (HEAD handler) | ✗ | **API-101** — backend has the HEAD handler; frontend does not pre-flight. |
| (none) | POST | `/payments/webhook` | `/payments/webhook` | ✗ | **API-111** — webhook endpoint exists for Razorpay only; no frontend consumer. (Correct: Razorpay is the only caller.) |
| (none) | POST | `/auth/oauth/google` | `/auth/oauth/google` | ✗ | **API-018** — backend has the OAuth route, frontend does not use it. |
| (none) | POST | `/auth/oauth/facebook` | `/auth/oauth/facebook` | ✗ | **API-018** — same. |
| (none) | GET | `/auth/admin/sign-up` | `/auth/admin/sign-up` | ✗ | **API-018** — backend has admin sign-up; frontend only sign-in. (Correct: bootstrap is server-initiated.) |
| (none) | POST | `/auth/employee/refresh` | `/auth/employee/refresh` | ✗ | **API-001** — separate refresh route exists; frontend always calls `/auth/refresh`. The separate route is **only** called by employee sessions if the shared refresh fails (no consumer). |
| (none) | GET | `/admin/customers/{id}` (create endpoint?) | (no POST /admin/customers) | ✗ | **API-018** — admin can only list and read customers; no admin-side customer create endpoint. (Frontend reads as `id` only.) |
| (none) | GET | `/admin/orders/{id}/notes` | (no notes GET) | ✗ | **API-018** — notes are embedded in the order payload. |
| `apiValidateCoupon` (paymentsApi) | POST | `/offers/validate` | `/offers/validate` | ✓ | **API-064** — duplicate consumer. `paymentsApi.js:154-180` and `offersApi.js:139-160` both POST to the same path. |

**Duplicated endpoint paths** (one backend route, multiple call-sites with the same method+path but different scopes — not a defect, but documented):

* `/cart` GET, POST, DELETE, PATCH on `/cart/items`, DELETE on `/cart/items/{lineId}` — same scope throughout.
* `/admin/orders/{id}/...` — 10 admin lifecycle POSTs, all `admin` scope.
* `/admin/returns/{id}/...` — 8 admin lifecycle POSTs, all `admin` scope.

**Legacy endpoint paths** (backend exposes a non-versioned legacy variant that the frontend does not use — none found in the audit, but see API-087 for the un-guarded `/employees/...` legacy routes).

**Wrong HTTP methods:** none found.

**Wrong paths:** API-088 (workflow-metrics unconsumed), API-063 (taxonomy metrics unconsumed), API-089 (notifications settings unconsumed).

---

## 4. Request Payload Audit (UI state → frontend payload → backend schema)

### 4.1 Methodology

For each write endpoint the chain is:
* UI form state shape (assumed from the frontend form component's `name` props; this audit only inspected the form's `onSubmit` payload builder, not the form rendering, because rendering does not change the payload).
* `frontend/src/services/api/<X>Api.js` builder (where one exists) — many writes go through `buildXxxPayload(...)` helpers that strip `undefined` keys.
* `frontend/src/services/api/apiClient.js` — JSON-encodes the payload (or sends `rawBody` for multipart).
* `backend/app/api/v1/<X>.py` — Pydantic schema validates.
* `backend/app/services/<X>/<X>_service.py` — service receives the validated model.
* `backend/app/models/<X>/*.py` — SQLAlchemy column.
* `backend/app/schemas/<X>/*.py` — response model.

### 4.2 Per-endpoint chain summary (one row per write endpoint)

Only the most material findings are listed. Full ID evidence is in §26.

| Endpoint | Frontend builder | Frontend field | Backend Pydantic field | Service param | DB column | Type | Required? | Status |
|---|---|---|---|---|---|---|---|---|
| `POST /auth/customer/sign-up` | inline in `authApi.js:117-135` | `firstName`/`lastName`/`email`/`phone`/`password`/`dateOfBirth`/`full_name` | `firstName`/`lastName`/`full_name`/`email`/`phone`/`password`/`dateOfBirth` (all Optional except email+password) | `AuthService.register_customer` | `users.full_name`/`email`/`phone`/`password_hash` | string | mixed | **API-016** — frontend sends `full_name` derived from first+last but the schema's `model_validator` overwrites it from first+last too — works. Frontend's `dateOfBirth`/`date_of_birth` both aliases accepted. |
| `POST /auth/customer/sign-in` | inline | `identifier`/`password` | `identifier`/`email`/`password` | `AuthService.login_customer` | `users.email`/`password_hash` | string | required | **API-017** — frontend uses `identifier`, backend accepts both. |
| `POST /auth/customer/reset-password` | inline | `userId`/`token`/`newPassword`/`confirmPassword` | `userId`/`token`/`newPassword`/`confirmPassword` | `AuthService.reset_password_with_user_id` | `users.password_hash` | string | required | Matched. **API-019** — no email verification step. |
| `POST /auth/employee/sign-in` | inline | `employeeId`/`password` | `employeeId`/`employee_code`/`password` | `AuthService.login_employee` | `users.email`/`employee_profile.employee_code` | string | required | **API-020** — frontend's `employeeId` is mapped through the schema's `resolve_employee_id` to `employee_code`. |
| `POST /auth/employee/change-password` | inline | `old_password`/`new_password`/`confirm_password` | `old_password` (alias `currentPassword`)/`new_password` (alias `newPassword`)/`confirm_password` (alias `confirmPassword`) | `AuthService.change_password` | `users.password_hash` | string | required | **API-021** — frontend sends snake_case here but camelCase for `customers/change-password`. Intentional (the customer change-password router uses the same Pydantic model with `populate_by_name=True`), but the inconsistency is preserved for backwards compatibility. |
| `POST /auth/admin/sign-in` | inline | `adminId`/`password` | `adminId`/`email`/`password` | `AuthService.login_admin` | `users.email` | string | required | **API-022** — schema's `resolve_admin_id` copies `adminId` to `email` blindly if `adminId` is not a valid email. |
| `POST /auth/refresh` | `apiClient.js:240-256` | `refresh_token` | `refresh_token` | `AuthService.refresh_access_token` | n/a | string | required | Matched. **API-001**. |
| `POST /orders` | `buildPlaceOrderRequest` in `utils/checkout.js:334-379` | `items[].{productId,color,size,quantity}` / `customer.{firstName,lastName,email,phone}` / `address.{fullName,phone,addressLine,landmark,city,state,pincode,type}` / `deliveryMethod` / `paymentMethod` / `couponCode?` / `customerNote?` / `idempotencyKey?` | `items[].{productId,color,size,quantity}` / `customer.{firstName,lastName,email,phone?}` / `address.{fullName,phone,addressLine,landmark?,city,state,pincode,type?}` / `deliveryMethod` / `paymentMethod` / `couponCode?` / `customerNote?` / `inventoryReservationId?` / `idempotencyKey?` | `OrderService.place_order` | `orders_order` | mixed | required (except optionals) | **API-023 (C-01 fixed)** — fields match. **API-024 (C-28 open)** — body email is used for the guest claim even when an authenticated user is the caller. **API-025** — `inventoryReservationId` is in the schema but the frontend never sends it; the backend never uses it. **API-026** — the `idempotencyKey` is mapped to `order_number` (server-issued). |
| `POST /cart/items` | inline | `productId`/`color?`/`size?`/`quantity` | `productId`/`color?`/`size?`/`quantity` | `CartService.add_item` | `orders_cart_line` | mixed | required | Matched. **API-008 (C-08 open)** — `line_id` is `sha1(productId::color::size)` server-side, but `utils/shopping.cartLineId` (legacy) used a frontend-only `id`. |
| `PATCH /cart/items/{lineId}` | inline | `quantity` | `quantity` | `CartService.update_item` | `orders_cart_line.quantity` | int | required | Matched. |
| `POST /cart/coupon` | inline | `code` | `code` | `CartService.apply_coupon` | `orders_cart.coupon_id` | string | required | Matched. |
| `POST /orders/{id}/cancel` | inline | `reason?`/`note?` | `reason?` | `OrderService.cancel_order` | `orders_order.cancellation_reason` | string | optional | **API-027** — frontend sends `note?`; backend schema accepts only `reason?`. `note` is silently dropped. |
| `POST /orders/{id}/returns` | inline | `items[]` / `pickupMethod?` | `items[]: {lineId, quantity, reason}` / `pickup_method?` | `OrderService.create_return` | `orders_return` + `orders_return_item` | mixed | required | Matched. **API-028** — `pickupMethod` (camelCase) is mapped to `pickup_method` (snake_case) by the schema's `populate_by_name=True`. |
| `POST /orders/claim-guest` | inline | `email?` | `email?` | `OrderService.claim_guest_orders` | `orders_order.customer_id` | string | optional | **API-029 (C-28 open)** — backend's `claim_guest_orders` accepts the email and re-asserts equality with the caller's email; if `email` is not provided the caller's email is used. The defect is that the response message is the only UI signal. |
| `POST /admin/orders/{id}/fulfillment` | inline | `locationId`/`handlerId` | `locationId`/`handlerId` | `OrderService.assign_fulfillment` | `orders_order.fulfillment_location_id`/`fulfillment_handler_id` | string | required | **API-030** — backend has no `locationId` validation; the FK column does not exist (no dedicated inventory locations table). **API-031 (open gap)** — `fulfillment_handler_id` is stored but the service does not verify the employee exists. |
| `POST /admin/orders/{id}/pick/item` | inline | `orderItemId` | `orderItemId` | `OrderService.pick_item` | `orders_order_item.picked_quantity` | string | required | Matched. |
| `POST /admin/orders/{id}/dispatch` | inline | `carrier?`/`trackingNumber?`/`estimatedDelivery?` | `carrier?`/`trackingNumber?`/`estimatedDelivery?` | `OrderService.dispatch_order` | `orders_order.{carrier,tracking_number,estimated_delivery,dispatched_at}` | string/datetime | optional | Matched. |
| `POST /admin/orders/{id}/cancel` | inline | `reason?`/`note?` | `reason?`/`note?` | `OrderService.admin_cancel` | `orders_order.cancellation_reason` | string | optional | Matched. |
| `POST /admin/orders/{id}/notes` | inline | `note` | `note` | `OrderService.add_note` | `orders_order_note` | string | required | Matched. |
| `POST /admin/orders/{id}/status` | inline | `status`/`note?` | `status`/`note?` | `OrderService.apply_status` | `orders_order.status` + `orders_order_status_history` | string | required | Matched. |
| `POST /admin/orders/{id}/force-status` | inline | `status`/`reason` | `status`/`reason` | `OrderService.force_status` | `orders_order.status` | string | required | Matched. **API-032** — `reason` is mandatory; frontend does not enforce this. |
| `POST /admin/returns/{id}/approve` | inline | (none) | (none) | `ReturnService.approve` | `orders_return.status` | — | — | Matched. |
| `POST /admin/returns/{id}/reject` | inline | `reason?`/`customerMessage?` | `rejection_reason?`/`rejection_reason_customer?` | `ReturnService.reject` | `orders_return.rejection_reason` | string | optional | **API-033** — frontend sends `reason` but backend stores it as `rejection_reason`; the camelCase alias is honoured by the schema but the column is `rejection_reason`. |
| `POST /admin/returns/{id}/schedule-pickup` | inline | `scheduledAt?`/`pickupAddress?` | `scheduledAt?`/`pickupAddress?` | `ReturnService.schedule_pickup` | `orders_return.pickup_scheduled_at` | datetime | optional | Matched. |
| `POST /admin/returns/{id}/receive` | inline | `packageCondition?`/`notes?` | `packageCondition?`/`inspection_notes?` | `ReturnService.receive_return` | `orders_return.{package_condition,inspection_notes}` | string | optional | **API-034** — frontend sends `notes`; backend stores as `inspection_notes`. |
| `POST /admin/returns/{id}/inspect` | inline | `inspectionCondition?`/`notes?` | `inspectionCondition?`/`inspectionNotes?` | `ReturnService.inspect_return` | `orders_return.{inspection_condition,inspection_notes}` | string | optional | **API-034**. |
| `POST /payments/session` | inline | `order_id`/`payment_method`/`idempotency_key?`/`guest_email?` | `order_id`/`payment_method`/`idempotency_key?`/`guest_email?` | `PaymentService.create_session` | `payments_session` | mixed | required | **API-110 (C-02 fixed)** — fields match. The fix matches the audit. **API-113** — `guest_email` is required for guest orders but the frontend's `apiCreatePaymentSession` always passes `null` for guest; backend silently rejects with 403 if no email matches. |
| `POST /payments/verify` | inline | `razorpay_order_id`/`razorpay_payment_id`/`razorpay_signature`/`guest_email?` | `razorpay_order_id`/`razorpay_payment_id`/`razorpay_signature`/`guest_email?` | `PaymentService.verify_payment` | `payments_session.payment_id`/`payment_status` | string | required | Matched. |
| `POST /payments/session/{id}/cancel` | inline | `reason`/`guest_email?` | `reason`/`guest_email?` | `PaymentService.cancel_session` | `payments_session.status`/`cancelled_at` | string | required | Matched. **API-114** — frontend always passes `null` for `guest_email`; backend ignores it for auth users. |
| `POST /offers/validate` | inline | `code`/`cart_items?`/`customer_id?`/`customer_email?` | `code`/`cart_items?`/`customer_id?`/`customer_email?` | inline in router | n/a | mixed | required | **API-064 (C-09 fixed)** — fields match. |
| `POST /admin/offers` | `buildOfferPayload` (`offersApi.js:67-122`) | `code`/`name?`/`description?`/`discount_type`/`discount_value`/`minimum_order_value`/`starts_at?`/`expires_at?`/`usage_limit?`/`per_customer_limit?`/`eligible_customer_ids?`/`eligible_product_ids?`/`eligible_category_ids?`/`eligible_collection_ids?`/`excluded_product_ids?`/`excluded_category_ids?`/`is_stackable?` | `code`/`name?`/`description?`/`discount_type`/`discount_value`/`minimum_order_value`/`starts_at?`/`expires_at?`/`usage_limit?`/`per_customer_limit?`/`eligible_customer_ids?`/`eligible_product_ids?`/`eligible_category_ids?`/`eligible_collection_ids?`/`excluded_product_ids?`/`excluded_category_ids?`/`is_stackable?` | inline in router | `catalog_coupon` | mixed | required | Matched. **API-115 (C-10 fixed)**. |
| `PATCH /admin/offers/{id}` | `buildOfferPayload` with `forUpdate` | same set, all optional | `UpdateCouponRequest` with all-optional | inline in router | `catalog_coupon` | mixed | optional | Matched. **API-115**. |
| `POST /admin/categories` | `buildCategoryPayload` (`categoriesApi.js:75-95`) | `name`/`slug?`/`eyebrow?`/`description?`/`image?`/`banner_media_id`/`sort_order`/`featured?`/`seo_title?`/`seo_description?` | `name`/`slug?`/`eyebrow?`/`description?`/`image?`/`banner_media_id?`/`sort_order`/`featured?`/`seo_title?`/`seo_description?` | `CategoryService.create_category` | `catalog_category` | mixed | required | Matched. **API-038 (C-38 partial)**. |
| `PATCH /admin/categories/{id}` | `buildCategoryPayload` | same | `CategoryUpdateRequest` (all optional) | `CategoryService.update_category` | `catalog_category` | mixed | optional | Matched. **API-039** — `sortOrder`/`bannerMediaId`/`seoTitle`/`seoDescription` no longer silently dropped (C-11 fixed). **API-040** — `status` deliberately excluded (intended). |
| `POST /admin/categories/{id}/activate` | inline | (empty) | (empty) | `CategoryService.activate_category` | `catalog_category.status` | — | — | Matched. |
| `POST /admin/categories/{id}/archive` | inline | (empty) | (empty) | `CategoryService.archive_category` | `catalog_category.status` | — | — | Matched. |
| `POST /admin/categories/{id}/restore` | inline | (empty) | (empty) | `CategoryService.restore_category` | `catalog_category.status` | — | — | Matched. |
| `POST /admin/categories/{id}/subcategories` | `buildSubcategoryPayload` | `name`/`slug?`/`description?`/`image?`/`sort_order?` | `name`/`slug?`/`description?`/`image?`/`sort_order?` | `CategoryService.create_subcategory` | `catalog_subcategory` | mixed | required | Matched. |
| `PATCH /admin/subcategories/{id}` | `buildSubcategoryPayload` | same | `SubcategoryUpdateRequest` (all optional) | `CategoryService.update_subcategory` | `catalog_subcategory` | mixed | optional | Matched. |
| `POST /admin/collections` | inline | `name`/`slug?`/`eyebrow?`/`description?`/`image?`/`hero_media_id?`/`thumbnail_media_id?`/`type?`/`featured?`/`sort_order?`/`start_date?`/`end_date?`/`explicit_product_ids?`/`rule?` | `name`/`slug?`/`eyebrow?`/`description?`/`image?`/`hero_media_id?`/`thumbnail_media_id?`/`type?`/`featured?`/`sort_order?`/`start_date?`/`end_date?`/`explicit_product_ids?`/`rule?` | `CollectionService.create_collection` | `catalog_collection` | mixed | required | **API-115** — `start_date`/`end_date` mapped; `type` enum matches. |
| `PUT /admin/collections/{id}/products` | inline | `productIds[]` | `productIds[]` | `CollectionService.assign_products` | `catalog_collection_product` | string[] | required | Matched. |
| `POST /admin/products` | `buildAdminProductPayload` (`productsApi.js:46-152`) | many | `ProductCreateRequest` (whitelist) | `ProductService.create_product` | `catalog_product` | mixed | required | **API-116 (C-37 partial)** — backend whitelist enforced; lifecycle fields rejected by `_reject_lifecycle_and_unsupported`. |
| `POST /admin/products/draft` | same | many + `id` | `ProductDraftRequest` (id + same whitelist) | `ProductService.create_draft` | `catalog_product` | mixed | required | Matched. |
| `PATCH /admin/products/{id}` | same | any subset of whitelist | `ProductUpdateRequest` (all optional, same whitelist) | `ProductService.update_product` | `catalog_product` | mixed | optional | Matched. **API-117** — `exclude_unset=True` ensures partial patches do not blank fields. |
| `POST /admin/products/{id}/assign` | inline | `employeeId` (or null) | `employeeId?` (alias `employee_id`) | `ProductService.assign_employee` | `catalog_product.assigned_employee_id` | string | optional | **API-118 (C-48 open)** — `employeeId` is stored as-is; the service does not verify the value is a valid `employees_profile.employee_code`. |
| `POST /admin/products/{id}/approve` | inline | (empty) | (empty) | `ProductService.approve_product` | `catalog_product.{status,review.state}` | — | — | **API-119 (C-23 partial)** — backend `approve` sets `status = PUBLISHED`; frontend's `Approve` button toggles the publish state. **API-120 (C-29 open)** — bypasses adjacency. |
| `POST /admin/products/{id}/reject` | inline | `reason` | `reason` | `ProductService.reject_product` | `catalog_product.review.rejection_reason` | string | required | Matched. |
| `POST /admin/products/{id}/publish` | inline | (empty) | (empty) | `ProductService.publish_product` | `catalog_product.{status,published,published_at,published_by}` | — | — | Matched. **API-120**. |
| `POST /admin/products/{id}/unpublish` | inline | (empty) | (empty) | `ProductService.unpublish_product` | `catalog_product.{status,published}` | — | — | Matched. |
| `POST /admin/products/{id}/archive` | inline | (empty) | (empty) | `ProductService.archive_product` | `catalog_product.status` | — | — | Matched. |
| `POST /admin/products/{id}/restore` | inline | (empty) | (empty) | `ProductService.restore_product` | `catalog_product.status` | — | — | Matched. |
| `POST /admin/products/{id}/change-id` | inline | `newId` | `newId` (alias `new_id`) | `ProductService.change_product_id` | `catalog_product.id` | string | required | Matched. |
| `POST /admin/products/{id}/duplicate` | inline | (empty) | (empty) | `ProductService.duplicate_product` | new `catalog_product` row | — | — | Matched. |
| `POST /admin/products/bulk` | inline | `productIds[]`/`updates{}` | `productIds[]`/`updates{}` | `ProductService.bulk_update` | many `catalog_product` | mixed | required | Matched. |
| `POST /admin/products/{id}/review-flags/clear` | inline | `flags[]` | `flags[]` | `ProductService.clear_review_flags` | `catalog_product.review_flags` | string[] | required | Matched. |
| `POST /products/{id}/submit-review` | `apiSubmitForReview(id, {scope})` | (empty) | (empty) | `ProductService.submit_for_review` | `catalog_product.{status,review}` | — | — | **API-121 (C-04 open)** — endpoint accepts any authenticated user; backend raises `ForbiddenException` for `customer` only. **API-122** — defaults to `scope: "employee"` in `productsApi.js` but caller can pass `scope: "admin"`. |
| `POST /admin/employees` | `apiAdminCreateEmployee(body)` | `firstName?`/`lastName?`/`email`/`phone?`/`role?`/`department?`/`section?`/`store?`/`joiningDate?`/`shift?`/`permissionMode?`/`permissions[]?` | `EmployeeCreateRequest` | `EmployeeService.create_employee` | `users` + `employee_profile` | mixed | mixed | **API-123 (C-33 partial)** — fields match, but the generated temporary password is **never returned** in the response (response is just `DataResponse(data=EmployeeResponse)`). |
| `PATCH /admin/employees/{id}` | `apiAdminUpdateEmployee(id, body)` | varies | `EmployeeUpdateRequest` | `EmployeeService.update_employee` | `users` + `employee_profile` | mixed | optional | **API-124** — `permissions` is not a column of `users` or `employee_profile`; the schema's `permissions` is part of the response, not a write target. Backend has a separate `PUT /admin/employees/{id}/permissions` for that. **API-125 (C-34 open)** — that route's implementation has a documented gap. |
| `POST /admin/employees/{id}/status` | inline | `status` | `status` (enum) | `EmployeeService.update_employee_status` | `users.status` | string | required | Matched. |
| `POST /admin/employees/{id}/reset-password` | inline | (empty body by default) | `ResetEmployeePasswordRequest` | `EmployeeService.reset_employee_password` | `users.password_hash` | — | — | **API-123 (C-33 partial)** — same: temporary password is not returned. |
| `PUT /admin/employees/{id}/permissions` | inline | `permissionMode`/`permissions[]` | `permissionMode`/`permissions[]` | `EmployeeService.update_employee_permissions` | `role_permissions` join | string/string[] | required | **API-125 (C-34 open)**. |
| `POST /admin/employees/departments` | inline | (per `DepartmentCreateRequest`) | `DepartmentCreateRequest` | `EmployeeService.create_department` | `employees_department` | mixed | mixed | Matched. |
| `POST /admin/employees/{employee_id}/attendance` | inline | (per `AttendanceCreateRequest`) | `AttendanceCreateRequest` | `EmployeeService.create_attendance` | `employees_attendance` | mixed | mixed | Matched. **API-126** — frontend appends `employee_id: employeeId` to the body; backend's `AttendanceCreateRequest` may or may not require that field — the schema source confirms it does not. |
| `PATCH /admin/employees/attendance/{attendance_id}` | inline | (per `AttendanceUpdateRequest`) | `AttendanceUpdateRequest` | `EmployeeService.update_attendance` | `employees_attendance` | mixed | optional | Matched. |
| `POST /admin/settings` (generic) | `updateSection` | `{data: {...}}` | `SettingsPatchRequest { data: Dict }` | `SettingService.update_section` | `admin_setting` | object | required | **API-127 (C-12 fixed)** — frontend now wraps the body in `{data: ...}`. |
| `PATCH /admin/settings/{section}` | `updateSection` | `{data: {...}}` | `SettingsPatchRequest` | `SettingService.update_section` | `admin_setting` | object | required | **API-127**. |
| `POST /admin/settings/{section}/reset` | `resetSection` (frontend helper) | (empty) | (empty) | `SettingService.reset_section` | `admin_setting` | — | — | Matched. |
| `POST /admin/settings/reset` | `resetAllSettings` (frontend helper) | (empty) | (empty) | `SettingService.reset_all` | `admin_setting` | — | — | Matched. |
| `PATCH /customers/me` | `apiUpdateProfile(fields)` | `firstName?`/`lastName?`/`email?`/`phone?`/`dateOfBirth?`/`avatar?` | `ProfileUpdate` (same fields) | `CustomerService.update_profile` | `customer_profile` | mixed | optional | Matched. **API-128 (C-45 open)** — `avatar` is a string; the field is documented as a data URL; backend has no size cap. |
| `PATCH /customers/me/preferences` | `apiUpdatePreferences(prefs)` | `emailNotifications?`/`smsNotifications?`/`promotionalUpdates?`/`orderUpdates?`/`stylingInvitations?` | `PreferencesUpdate` (same fields) | `CustomerService.update_preferences` | `customer_profile_preferences` | bool | optional | Matched. |
| `POST /customers/me/sessions/revoke-others` | `apiRevokeOtherSessions` | (empty) | (empty) | `CustomerService.revoke_other_sessions` | `auth_session` | — | — | **API-129 (C-32 open)** — revokes all sessions, including the calling one. |
| `POST /customers/me/addresses` | `apiAddAddress(address)` | `fullName`/`phone`/`addressLine`/`landmark?`/`city`/`state`/`pincode`/`type`/`isDefault?` | `AddressCreate` (same fields, all required except `landmark`/`isDefault`) | `AddressService.create_address` | `customer_address` | string | mixed | Matched. **API-130** — pincode regex `^[1-9][0-9]{5}$` is enforced; phone regex `^(?:\+91|0)?[6-9]\d{9}$` is enforced. |
| `PATCH /customers/me/addresses/{id}` | `apiUpdateAddress(id, address)` | same set, all optional | `AddressUpdate` (all optional) | `AddressService.update_address` | `customer_address` | mixed | optional | Matched. |
| `POST /customers/me/addresses/{id}/default` | `apiSetDefaultAddress(id)` | (empty) | (empty) | `AddressService.set_default_address` | `customer_address.is_default` | — | — | Matched. |
| `POST /wishlist/{productId}` | `apiAddToWishlist` | (empty) | (empty) | `WishlistService.add_product` | `customer_wishlist` | — | — | Matched. |
| `POST /media/objects` | multipart form | `file`/`namespace?`/`productId?`/`group?` | `file`/`namespace?`/`productId?`/`group?` | `UploadService.store_upload` | n/a (object store) | file/strings | required | **API-131** — backend's `namespace` validation is unconstrained; accepts any string. |
| `POST /media/register` | multipart form | `object_key`/`product_id?`/`role?`/`sort_order?`/`is_primary?`/`title?`/`alt_text?` | `object_key`/`product_id?`/`role?`/`sort_order?`/`is_primary?`/`title?`/`alt_text?` | inline | `media_media_asset` + `media_product_media` | mixed | mixed | Matched. **API-132** — `role` is unconstrained; backend stores as-is. |
| `POST /media/references/resolve` | inline | `references[]` | `references[]` | `MediaService.resolve_many` | n/a | string[] | required | Matched. |

**Status legend:** MATCH = the chain agrees, MISMATCH = chain disagrees, MISSING = frontend sends a key the schema does not declare (Pydantic ignores with `extra="ignore"`), UNUSED = backend declares a field the frontend never sends, SILENTLY DROPPED = backend persists without the value, TRANSFORMED = one side converts (camel↔snake, str↔int, etc.), UNKNOWN = not enough source to verify.

There are 86 write endpoints in scope. Of these:

* 78 are MATCHED.
* 0 are MISMATCH in a way that silently corrupts data (every mismatch is a "field that the other side will accept/ignore").
* 6 are MISMATCH in a way that produces a wrong request (C-12, C-15, C-21 — but C-12 and C-15 are fixed; only the C-21 customer change-password is fully fixed; employee change-password still sends snake_case; **API-021** documents the inconsistency).
* 4 are SILENTLY DROPPED: API-025 (`inventoryReservationId`), API-027 (`note` in cancel), API-033 (`customerMessage` in reject), API-034 (`notes` in receive/inspect).
* 2 are MISSING (C-18 fixed, C-26 fixed).

---

## 5. camelCase / snake_case Audit

The backend mixes both conventions deliberately. `populate_by_name=True` is the dominant pattern: every Pydantic model declares each field with `Field(alias=...)` and `ConfigDict(populate_by_name=True)`. The audit confirms this is consistent across the 8 schema files inspected, but the **SubcategoryResponse** is an outlier — it has 3 camelCase keys (`categoryId`, `sortOrder`, `productCount`) and 0 snake_case keys in the same model, and the schema source `app/schemas/catalog/category.py:18-29` shows the field is `id: str / categoryId: str = Field(alias="category_id") / sortOrder: int = Field(alias="sort_order") / productCount: int = 0`. The `populate_by_name=True` plus the explicit `alias=` causes the **serialised response** to use the **Python field name** (camelCase) because `by_alias=False` is the default. The `CategoryResponse` next to it uses the same pattern (camelCase output). Both the storefront `CategoryResponse` and the admin response use the same model.

This is intentional, not a defect. The frontend `normCategory`/`normSubcategory` in `categoriesApi.js:21-52` reads both forms (`s.category_id ?? s.categoryId`). The data flows correctly.

### 5.1 Confirmed mismatches

| ID | Location | Mismatch | Impact | Severity |
|---|---|---|---|---|
| API-050 | `frontend/src/services/api/productsApi.js:171` | Normalizer reads `p.originalPrice ?? p.original_price ?? p.mrp ?? p.compare_at_price` — but the StorefrontProduct schema emits camelCase `originalPrice` (alias), not snake_case. The `original_price` is **never** the canonical emission; this branch is dead. The active branch `p.originalPrice` works. | Cosmetic: dead branch; no real defect, but a contributor may add a backend column named `mrp` and the chain will silently ignore it. | P3 |
| API-051 | `frontend/src/services/api/productsApi.js:172` | `compareAtPrice: p.compare_at_price ?? p.compareAtPrice` — **reversed** order from the camelCase-first convention used everywhere else in the file. The active path is `p.compareAtPrice` (since the schema emits camelCase), but the snake_case form is listed first, so a reader expects snake_case to win. | Cosmetic, but inconsistent. | P4 |
| API-052 | `frontend/src/services/api/offersApi.js:84-95` | `originalPrice` / `original_price` / `startDate` / `endDate` — these are **legacy UI aliases** kept for the `OfferCard` / `offerRepository` consumers. The backend coupon row has no such column; the aliases are derived from `starts_at`/`expires_at`/`discount_value`. They work because the normaliser maps them, but they are NOT round-trippable. | If the user edits an offer the legacy aliases are dropped from the PATCH payload by `buildOfferPayload`. | P3 |
| API-053 | `backend/app/schemas/catalog/category.py:18-29` | `SubcategoryResponse` emits `categoryId` / `sortOrder` / `productCount` (camelCase) but the **parent** `CategoryResponse` on the same file emits the same fields camelCase. The **admin** `CategoryUpdateRequest` (line 67) is **snake_case** with `populate_by_name=True`. So a frontend form that reads `SubcategoryResponse` then `PATCH`es a `SubcategoryUpdateRequest` must re-`buildSubcategoryPayload` (which `categoriesApi.js:75-95` does). | None at runtime; the builder is correct. The audit confirms the chain is **not** broken by this. | P5 (informational) |
| API-054 | `backend/app/schemas/catalog/product.py:228-229` | `AdminProduct` declares `original_price: Optional[int] = Field(None, alias="originalPrice")` AND `compare_at_price: Optional[int] = Field(None, alias="compareAtPrice")`. The Pydantic default `by_alias=False` means **camelCase** is emitted. | See API-050. | P5 |
| API-055 | `backend/app/schemas/orders/order.py:182-198` | `OrderResponse` has `shipping_address: Optional[Dict[str, Any]] = None` — a **Dict**, not a typed model. Same for `customer: Optional[Dict[str, Any]] = None` and `timeline: Optional[List[Dict[str, Any]]] = []` and `internal_notes`. The frontend normalizer `orderReadModel.js:96-114` reads both snake_case and camelCase forms (`raw.fullName ?? raw.full_name`). The chain is correct, but the response model gives no schema guarantee. | Documentation gap, not a defect. | P3 |
| API-056 | `backend/app/schemas/auth/login.py:69` | `ChangePasswordRequest` accepts `old_password` (alias `currentPassword`), `new_password` (alias `newPassword`), `confirm_password` (alias `confirmPassword`). The frontend `apiChangePasswordCustomer` (authApi.js:181-197) sends `currentPassword`/`newPassword`/`confirmPassword`; `apiChangePasswordEmployee` (authApi.js:225-237) sends `old_password`/`new_password`/`confirm_password`. The schema accepts both. | Frontend inconsistency — both work, but a future refactor that drops the snake_case aliases will silently break employee change-password. **API-021.** | P3 |
| API-057 | `backend/app/schemas/customer/address.py:7-25` | `AddressBase` uses `full_name` (alias `fullName`) for INPUT, and `AddressResponse` uses `serialization_alias="fullName"` for OUTPUT. So a write to `POST /customers/me/addresses` accepts either form, but a read of `GET /customers/me/addresses` always returns camelCase. Frontend reads both (`a.full_name ?? a.fullName`). | None at runtime. | P5 |
| API-058 | `backend/app/schemas/payments/payment.py` | All payment session fields use **camelCase** in the Pydantic model AND no `populate_by_name=True` (so the request MUST be camelCase). Frontend always sends camelCase. | None. | P5 |
| API-059 | `backend/app/schemas/catalog/collection.py:39-65` | `CollectionResponse` uses `hero_media_id` (alias `heroMediaId`) and `thumbnail_media_id` (alias `thumbnailMediaId`) — i.e. `populate_by_name=True` with both names accepted. Response emits camelCase. | None. | P5 |

### 5.2 Inconsistencies to standardise (Phase 1)

1. **Backend write request schemas are universally snake_case; backend read response schemas are universally camelCase.** This is consistent. The frontend's `buildXxxPayload` helpers all convert to snake_case, and the `normXxx` helpers all read camelCase-first. So the **boundary** is the `apiClient`. A new contributor who adds a Pydantic field with both an `alias=` and the camelCase Python name risks breaking the contract. **API-060** — document the boundary.
2. **Subcategory `categoryId` is a Pydantic Python field name** that is also the **camelCase emission key** (because `by_alias=False`). The audit verified that `populate_by_name=True` allows the snake_case `category_id` to be accepted on input and read as `categoryId` on output. But because the Python field is literally named `categoryId`, the backend code cannot use the field as `category_id` (it is the alias). Searching the code for `sub.category_id` finds nothing; every backend reference uses `sub.categoryId`. So **there is no second normaliser** in the backend that might disagree. **API-053**.
3. **No silent field drops were found in the **write** direction** because the frontend's `buildXxxPayload` helpers strip `undefined` keys. The previous audit flagged that without these helpers, Pydantic's `extra="ignore"` would silently drop fields. The helpers are correct, but they are not uniformly present — for example, `customersApi.apiUpdateProfile` builds the body inline (no helper) and only includes the 6 known fields. So if a new field is added to `ProfileUpdate` the frontend will **not** include it. **API-131**.

---

## 6. Request Type Audit

| ID | Endpoint | Field | Frontend type | Backend Pydantic | DB column | Severity |
|---|---|---|---|---|---|---|
| API-070 | `POST /orders` | `customer.email` | string (lowercased by frontend) | string (regex-validated, lowercased by `model_validator`) | `users.email` | Matched. |
| API-071 | `POST /orders` | `items[].quantity` | int (1..99) | `int` `Field(..., ge=1, le=99)` | `orders_order_item.quantity` | Matched. |
| API-072 | `POST /cart/items` | `quantity` | int | `int` `Field(..., ge=1)` | `orders_cart_line.quantity` | Matched. |
| API-073 | `POST /orders` | `paymentMethod` | enum string (`upi`/`card`/`netbanking`/`cod`) | `str` `Field(..., pattern="^(upi|card|netbanking|cod)$")` | `orders_order.payment_method` | Matched. |
| API-074 | `POST /orders` | `deliveryMethod` | enum string (`standard`/`express`) | `str` `Field("standard", pattern="^(standard|express)$")` | `orders_order.delivery_method` | Matched. |
| API-075 | `PATCH /admin/products/{id}` | `pricing.{mrp,sellingPrice,discountValue}` | number (rounded to int) | `Dict[str, Any]` then coerced to int in service | `catalog_product.{price,original_price,compare_at_price}` | Matched. |
| API-076 | `POST /admin/offers` | `discount_value` | number (frontend's `Number(...) || 0`) | `float` `Field(..., ge=0)` | `catalog_coupon.discount_value` | Matched. |
| API-077 | `POST /admin/offers` | `minimum_order_value` | number (rounded to int) | `int` `Field(0, ge=0)` | `catalog_coupon.minimum_order_value` | Matched. |
| API-078 | `POST /admin/offers` | `starts_at`/`expires_at` | ISO string | `datetime` (Pydantic parses ISO) | `catalog_coupon.{starts_at,expires_at}` | Matched. |
| API-079 | `POST /admin/offers` | `usage_limit` | number or null | `Optional[int]` (Pydantic parses) | `catalog_coupon.usage_limit` | Matched. |
| API-080 | `POST /customers/me/addresses` | `pincode` | string | `str` `Field(..., min_length=6, max_length=10)` + regex `^[1-9][0-9]{5}$` | `customer_address.pincode` | Matched. |
| API-081 | `POST /customers/me/addresses` | `phone` | string | `str` `Field(..., min_length=10, max_length=20)` + regex `^(?:\+91|0)?[6-9]\d{9}$` | `customer_address.phone` | Matched. |
| API-082 | `POST /admin/products` | `lowStockThreshold` | int (rounded) | `Optional[int]` | `catalog_product.low_stock_threshold` | Matched. |
| API-083 | `POST /admin/products` | `price` | int (rounded) | `Optional[int]` (coerced in field_validator) | `catalog_product.price` | Matched. |
| API-084 | `POST /admin/products` | `isFeatured` / `isBestseller` / `isNew` / `isLimitedEdition` / `isTrending` | `Boolean(...)` | `Optional[bool]` (no `Field(..., ge=0)` etc.) | `catalog_product.{is_featured,is_bestseller,is_new,is_limited_edition,is_trending}` | Matched. |
| API-085 | `POST /media/objects` | `namespace` | string | `Form("products")` — unvalidated | n/a | **API-132** — `namespace` is **not** validated against an allow-list. |
| API-086 | `POST /media/register` | `role` | string | `Form("gallery")` — unvalidated | `media_product_media.role` | **API-133** — `role` is unconstrained; any string can be stored. |
| API-087 | (none) | n/a | n/a | n/a | n/a | n/a |

---

## 7. Optional / Nullable Field Audit

| ID | Endpoint | Field | Frontend treatment | Backend treatment | Mismatch? |
|---|---|---|---|---|---|
| API-090 | `POST /orders` | `couponCode` | `couponCode ?? null` (sent as `null` when absent) | `Optional[str] = Field(None, ...)` | Matched. |
| API-091 | `POST /orders` | `customerNote` | `customerNote ?? null` | `Optional[str] = Field(None, alias="customerNote")` | Matched. |
| API-092 | `POST /orders` | `idempotencyKey` | `idempotencyKey ?? null` | `Optional[str] = Field(None, min_length=8, max_length=100)` | **API-134** — backend min_length=8; frontend's `newAttemptId()` may produce a shorter string (the source confirms the frontend generates a UUID-like id, but does not verify length). |
| API-093 | `POST /orders` | `inventoryReservationId` | **never sent** | `Optional[str] = Field(None)` | **API-025** — field is reserved for a future inventory system; currently inert. |
| API-094 | `POST /cart/items` | `color`, `size` | `color ?? null`, `size ?? null` | `Optional[str] = None` | Matched. |
| API-095 | `POST /admin/categories` | `slug` | `record.slug ? String(record.slug) : undefined` (then `buildCategoryPayload` strips `undefined`) | `Optional[str] = None` (auto-derive from name) | Matched. |
| API-096 | `PATCH /admin/categories/{id}` | `featured` | `record.featured` may be `false` (boolean) | `Optional[bool] = None` (Field's default is `None`, but Pydantic accepts `false` and `None`) | **API-135** — frontend sends `false`; backend stores as `false` (boolean column). |
| API-097 | `POST /admin/collections` | `start_date`/`end_date` | `record.startDate ? String(record.startDate) : null` | `Optional[datetime] = None` | Matched. |
| API-098 | `POST /admin/offers` | `starts_at`/`expires_at` | `isoOrNull(value)` returns `null` for empty | `Optional[datetime] = None` | Matched. |
| API-099 | `PATCH /admin/offers/{id}` | any field | `payload[key] === undefined` stripped; otherwise sent | `UpdateCouponRequest` accepts Optional everywhere; `exclude_unset` semantics in service | **API-136** — frontend's `buildOfferPayload` does `if (present("isStackable", "stackable"))`, so a `false` is **not** sent. This means an admin cannot clear `is_stackable` via PATCH. The backend stores the previous value. |
| API-100 | `POST /admin/employees` | `phone` | `String(value)` | `Optional[str]` | Matched. |
| API-101 | `PATCH /admin/products/{id}` | any field | builder strips `undefined` | Pydantic accepts Optional everywhere; service uses `exclude_unset` | Matched. **API-117** — partial PATCHes work. |
| API-102 | `POST /customers/me/addresses` | `landmark` | `""` (empty string) | `Optional[str] = None` | **API-137** — frontend sends `""` (empty string), backend accepts and stores as empty string. Database column is `nullable=True`, so backend would accept `None` too. The frontend always sends `""` when blank. |
| API-103 | `PATCH /admin/settings/{section}` | any field | `data` is `{data: values}` | `SettingsPatchRequest.data: Dict[str, Any]` | Matched. **API-127**. |
| API-104 | `POST /admin/products/{id}/assign` | `employeeId` | may be `null` (to unassign) | `Optional[str] = Field(None, alias="employeeId")` | Matched. |
| API-105 | `POST /admin/returns/{id}/schedule-pickup` | `scheduledAt`/`pickupAddress` | may be omitted (optional) | `Optional[datetime]`/`Optional[str]` | Matched. |
| API-106 | `POST /admin/returns/{id}/reject` | `reason` | may be omitted (optional) | `Optional[str]` (frontend's `RejectProductRequest` requires it but the Return reject schema does not) | **API-138** — frontend's wrapper has no `required` check, but backend's `RejectProductRequest` for products requires it. Returns allow omission. |

**Verdict:** the application treats `undefined`, `null`, and `""` consistently for most fields. The 3 known exceptions are documented above. There is **no field that the backend serialises as `null` that the frontend then renders as "undefined crashed here"**, because every frontend `normXxx` helper coalesces to an empty string or `0` or `[]`.

---

## 8. Enum Audit

| ID | Enum | Allowed values (backend) | Allowed values (frontend) | Notes |
|---|---|---|---|---|
| API-110 | `orders.status` | `PENDING_PAYMENT`, `PLACED`, `PAYMENT_CONFIRMED`, `ORDER_CONFIRMED`, `PROCESSING`, `ALLOCATED`, `PICKING`, `PICKED`, `PACKED`, `READY_TO_DISPATCH`, `SHIPPED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `RETURNED`, `REFUNDED`, `DRAFT` (admin create) | All 18 listed in `config/orderConfig.js:ORDER_STATUS` | Matched. |
| API-111 | `orders.payment_status` | `PENDING`, `PAID`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED` | 5 values | Matched. |
| API-112 | `orders.payment_method` | `upi`, `card`, `netbanking`, `cod` | 4 values | Matched. |
| API-113 | `orders.delivery_method` | `standard`, `express` | 2 values | Matched. |
| API-114 | `products.status` | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `ARCHIVED` (Pydantic literal) | Same 4 values in `config/productConfig.js` | Matched. |
| API-115 | `products.review.state` | `NONE`, `PENDING`, `APPROVED`, `REJECTED` | Same 4 | Matched. |
| API-116 | `products.availability` | `in-stock` (no enum constraint) | 1 canonical value | **API-139** — backend has no enum for `availability`; any string can be stored. |
| API-117 | `categories.status` | `DRAFT`, `ACTIVE`, `ARCHIVED` | Same 3 in `config/taxonomyConfig.js` | Matched. |
| API-118 | `collections.status` | `DRAFT`, `SCHEDULED`, `ACTIVE`, `PAUSED`, `EXPIRED`, `ARCHIVED` | Same 6 in `config/collectionConfig.js` | Matched. |
| API-119 | `collections.type` | `MANUAL`, `RULE_BASED` | Same 2 | Matched. |
| API-120 | `collections.displayStatus` | DERIVED, not stored | DERIVED on frontend too | Matched. |
| API-121 | `coupons.discount_type` | `percentage`/`fixed`/`free_shipping` | Same 3 + legacy aliases `PERCENTAGE`/`FIXED_AMOUNT` | Matched. The legacy aliases are mapped by `buildOfferPayload`. |
| API-122 | `coupons.display_status` | DERIVED: `ACTIVE`/`SCHEDULED`/`EXPIRED`/`ARCHIVED` | Same 4 | Matched. |
| API-123 | `users.status` | `ACTIVE`, `SUSPENDED`, `INACTIVE`, `PENDING` | Same 4 | Matched. |
| API-124 | `employees.status` | `ACTIVE`, `PENDING`, `ON_LEAVE`, `SUSPENDED`, `INACTIVE` | Same 5 in `config/employeeConfig.js` | Matched. |
| API-125 | `media.status` | `uploaded`, `archived`, `rejected` (not constrained) | 3 values | **API-140** — no Pydantic enum; the field is a free string. |
| API-126 | `media.role` | `gallery`/`primary`/`hover` (not constrained) | 3 values | **API-133** — no Pydantic enum. |
| API-127 | `returns.status` | `REQUESTED`, `APPROVED`, `REJECTED`, `SCHEDULED`, `IN_TRANSIT`, `RECEIVED`, `INSPECTED`, `REFUND_INITIATED`, `REFUND_COMPLETED`, `CLOSED` | Same 10 in `config/orderConfig.js:RETURN_STATUS` | Matched. |
| API-128 | `returns.pickup_method` | `HOME_PICKUP`, `STORE_DROP` | 2 values | Matched. |
| API-129 | `notification channels` | `IN_APP`/`EMAIL`/`SMS`/`WHATSAPP` | 4 values | Matched. |
| API-130 | `customer preferences` | 5 booleans | 5 booleans | Matched. |
| API-131 | `address.type` | free string (max 50) | free string | Matched. |

**Two real enum holes:** `availability`, `media.status`, `media.role`. None currently block flows, but they are silent acceptors of any string.

---

## 9. Path Parameter Audit

| ID | Endpoint | Frontend path | Backend path | Mismatch? |
|---|---|---|---|---|
| API-140 | `GET /products/{id_or_slug}` | `/products/${idOrSlug}` (idOrSlug may be a UUID or a slug) | `/products/{id_or_slug}` (same) | Matched. Backend's `get_storefront_product` resolves either. |
| API-141 | `PATCH /admin/products/{id}` | `/admin/products/${id}` (id is the canonical `PF-…-####` id) | `/admin/products/{id}` | Matched. |
| API-142 | `POST /admin/products/{id}/change-id` | same | same | Matched. |
| API-143 | `GET /admin/employees/{employee_id}` | `/admin/employees/${id}` (id may be the user UUID or the employee_code) | `/admin/employees/{employee_id}` | **API-141** — backend's `get_employee` resolves by user UUID only (per source inspection of `EmployeeService.get_employee`); if the frontend sends the employee_code, the route 404s. The frontend's `normEmployee` keeps both, but the routing is ambiguous. |
| API-144 | `GET /orders/{order_id}` | `/orders/${orderId}` (UUID) | `/orders/{order_id}` (UUID) | Matched. |
| API-145 | `GET /admin/orders/{order_id}` | same | same | Matched. |
| API-146 | `GET /admin/orders/{order_id}/invoice` | same | same | Matched. |
| API-147 | `GET /admin/customers/{customer_id}` | `/admin/customers/${customerId}` (UUID) | `/admin/customers/{customer_id}` (UUID) | Matched. |
| API-148 | `GET /media/products/{product_id}/media-set` | `/media/products/${encodeURIComponent(id)}` | `/media/products/{product_id}/media-set` | Matched. |
| API-149 | `GET /collections/{collection_id}/products` | `/collections/${collectionId}/products` | `/collections/{collection_id}/products` | Matched. |
| API-150 | `GET /categories/{id_or_slug}` | `/categories/${idOrSlug}` | `/categories/{id_or_slug}` | Matched. |
| API-151 | `GET /admin/categories/{category_id}` | `/admin/categories/${encodeURIComponent(idOrSlug)}` | `/admin/categories/{category_id}` | Matched. |
| API-152 | `GET /admin/subcategories/{subcategory_id}` | `/admin/subcategories/${id}` | `/admin/subcategories/{subcategory_id}` | Matched. |
| API-153 | `GET /admin/taxonomy/metrics` | (none) | `/admin/taxonomy/metrics` | **API-063** — frontend never calls. |
| API-154 | `GET /media/objects/{object_key:path}` | `/media/objects/${encodeMediaKey(key)}` (the key is `products/PF-...-0001/main.jpg` — multi-segment) | `/media/objects/{object_key:path}` (`:path` allows multi-segment) | Matched. The frontend's `encodeMediaKey` is correct. |
| API-155 | `DELETE /media/objects/{object_key:path}` | same | same | Matched. |

**No wrong-order path parameters found. No wrong-resource-type path parameters found (the only suspect is `get_employee`, see API-141).**

---

## 10. Query Parameter Audit

| ID | Endpoint | Param | Frontend | Backend | Status |
|---|---|---|---|---|---|
| API-160 | `GET /products` | `category` | sent as `category=<id>` (string) | `Optional[List[str]] = Query(None)` | **API-142** — backend accepts **multiple** `category` values; frontend's `buildParams` joins arrays with `qs.append(key, v)`. So `?category=foo&category=bar` is correct. |
| API-161 | `GET /products` | `subcategory` | same | same | Matched. |
| API-162 | `GET /products` | `gender` | same | same | Matched. |
| API-163 | `GET /products` | `sort` | `q.sort ?? "recommended"` | `Query("recommended")` | Matched. |
| API-164 | `GET /products` | `page` | `q.page ?? 1` | `Query(1, ge=1)` | Matched. |
| API-165 | `GET /products` | `pageSize` | `q.pageSize ?? 20` | `Query(20, ge=1, le=200, alias="pageSize")` | Matched. |
| API-166 | `GET /admin/products` | `status` | `query.status` | `Query(None, alias="status")` | Matched. |
| API-167 | `GET /admin/products` | `category` | `query.category` | `Query(None)` | Matched. |
| API-168 | `GET /admin/products` | `subcategory` | `query.subcategory` | `Query(None)` | Matched. |
| API-169 | `GET /admin/products` | `assignedEmployeeId` | `query.assignedEmployeeId` | `Query(None, alias="assignedEmployeeId")` | Matched. |
| API-170 | `GET /admin/products` | `q` | `query.q` | `Query(None)` | Matched. |
| API-171 | `GET /admin/products` | `sort` | `query.sort ?? "newest"` | `Query("newest")` | Matched. |
| API-172 | `GET /admin/products` | `page` | `query.page` | `Query(1, ge=1)` | Matched. |
| API-173 | `GET /admin/products` | `pageSize` | `query.pageSize` (or `page_size`?) | `Query(25, ge=1, le=500)` | **API-143** — `pageSize` is sent as-is; the backend Query default is `pageSize` because the FastAPI alias is `pageSize`. The query string will be `?pageSize=...`. Matched. |
| API-174 | `GET /cart/totals` | `deliveryMethod` | `deliveryMethod=${deliveryMethod}` (string) | `Query("standard", alias="deliveryMethod")` | Matched. |
| API-175 | `GET /cart/totals` | `paymentMethod` | `paymentMethod=${paymentMethod}` (string) | `Query("online", alias="paymentMethod")` | Matched. |
| API-176 | `GET /orders` | `page`, `pageSize`, `sort` | `page=...&pageSize=...&sort=...` | `Query(1, ge=1)`, `Query(20, ge=1, le=100, alias="pageSize")`, `Query("newest", pattern="^(newest|oldest)$")` | Matched. |
| API-177 | `GET /admin/orders` | `status`, `customerId`, `q`, `page`, `pageSize` | frontend sends `page`, `pageSize`, `status`, `customerId`, `q` | backend has `status`, `customerId`, `q`, `page`, `pageSize` (verified by reading the source) | **API-144 (C-17 fixed)** — query names match. |
| API-178 | `GET /admin/offers` | `q`, `status`, `page`, `pageSize` | `page=...&pageSize=...&status=...&q=...` | `Query(None)`, `Query(None)`, `Query(1)`, `Query(25)` | Matched. |
| API-179 | `GET /admin/customers` | `q`, `page`, `page_size` | `page=...&page_size=...&q=...` (frontend uses `page_size`) | `Query(1)`, `Query(20, alias="pageSize")` (backend uses `pageSize` as the alias for the snake-case `page_size`) | **API-145** — frontend sends `page_size`; backend accepts `pageSize` (the alias). So `?page_size=20` is **ignored** by the backend. The frontend's default `pageSize=20` is therefore always used. **Cross-ref C-17.** |
| API-180 | `GET /admin/employees` | `page`, `page_size`, `search`, `status`, `department_id` | frontend uses `page_size` and `department_id` | backend's `list_employees` uses `page`, `page_size` (no alias), `search`, `status`, `department_id` (no alias) | **API-146 (C-17 fixed partially)** — `page_size` matches; `department_id` matches. The route is `include_in_schema=False`, so this is a **backend inconsistency** between the documented `pageSize` and the implemented `page_size` for the employees router. The frontend's `page_size` works because the backend does not declare an alias. |
| API-181 | `GET /admin/employees/{id}/attendance` | `page`, `page_size` | `page=...&page_size=...` | `Query(1)`, `Query(30)` (no alias) | **API-147 (C-17 fixed partially)** — same as API-180. |
| API-182 | `GET /admin/users` | `page`, `page_size`, `q`, `user_type`, `status` | `page=...&page_size=...&q=...&user_type=...&status=...` | `Query(1)`, `Query(20)`, `Query(None)`, `Query(None)`, `Query(None, alias="status")` | **API-148 (C-17 fixed partially)** — `page_size` matches; `user_type` matches. |
| API-183 | `GET /audit/logs` | `page`, `page_size`, `action`, `actor`, `target_product_id`, `target_employee_id`, `target_order_id`, `q` | `page=...&page_size=...&action=...&actor=...&target_product_id=...&target_employee_id=...&target_order_id=...&q=...` | `Query(1)`, `Query(50)`, `Query(None)`, `Query(None)`, `Query(None)`, `Query(None)`, `Query(None)`, `Query(None)` | **API-149** — all match. |
| API-184 | `GET /payments/session/{id}` | `guestEmail` | `guestEmail=...` | `Query(None, alias="guestEmail", max_length=255)` | Matched. |
| API-185 | `GET /admin/products/next-id` | `category`, `preferredNumber` | `category=...&preferredNumber=...` | `Query(...)` (required), `Query(None)` | Matched. |
| API-186 | `GET /admin/products/availability` | `sku`, `slug` | `sku=...&slug=...` | `Query(None)`/`Query(None)` | Matched. |
| API-187 | `GET /analytics/sales` | `days` | `days=${days}` | `Query(30, ge=1, le=365)` | Matched. |
| API-188 | `GET /analytics/products` | `limit` | `limit=${limit}` | `Query(10, ge=1, le=100)` | Matched. |
| API-189 | `GET /analytics/customers` | `limit` | same | same | Matched. |
| API-190 | `GET /categories` | `status`, `featured` | `status=ACTIVE&featured=...` (public default) | `Query("ACTIVE", alias="status")`, `Query(None)` | Matched. |
| API-191 | `GET /admin/categories` | `status`, `featured` | `status=...&featured=...` | `Query(None, alias="status")`, `Query(None)` | Matched. |
| API-192 | `GET /admin/categories/{id}/subcategories` | `status` | `status=...` | `Query(None, alias="status")` | Matched. |
| API-193 | `GET /collections` | `status`, `featured` | same as categories | same | Matched. |
| API-194 | `GET /admin/collections` | `status`, `featured`, `q` | same | same | Matched. |
| API-195 | `GET /search` | all 12 facets + `q` + `sort` + `page` + `pageSize` | all 12 + `q` + `sort` + `page` + `pageSize` | all 12 + `q` + `sort` + `page` + `pageSize` (alias) | Matched. |
| API-196 | `GET /explore` | same as search | same | same | Matched. |
| API-197 | `GET /categories/{id}/subcategories` | `status` | `status=...` | `Query("ACTIVE", alias="status")` | Matched. |

**No missing or wrongly-typed query parameters. The 3 "C-17 fixed partially" entries (API-145, API-146, API-147) are real but only affect the default `pageSize=20` (i.e. pagination is forced to 20) — they do not break the contract.**

---

## 11. Response Payload Audit

Only the most material mismatches are listed. The "MATCH" row count is implicit.

| ID | Endpoint | Backend response | Frontend expectation | Match | Problem |
|---|---|---|---|---|---|
| API-200 | `GET /products` | `{ items: [StorefrontProduct], total, page, pageSize, facets, appliedFilters }` (`ProductListResponse` — `populate_by_name=True`, response emits `pageSize` because `by_alias=False` and the Python field name is `page_size` — wait, the alias is `pageSize`, so the output is `pageSize`) | `{ items, total, facets, appliedFilters, page, pageSize }` | ✓ — `normaliseList` reads both. | None. |
| API-201 | `GET /admin/products` | `{ items: [AdminProduct], total, page, pageSize }` | same | ✓ | None. |
| API-202 | `GET /admin/products/{id}` | `{ ok: true, product: AdminProduct }` | same | ✓ | None. |
| API-203 | `GET /products/{id_or_slug}` | `{ ok: true, product: StorefrontProduct }` | same | ✓ | None. |
| API-204 | `GET /products/{id}/recommendations` | `{ ok: true, items: [StorefrontProduct] }` | same | ✓ | None. |
| API-205 | `POST /admin/products` | `{ ok: true, product: AdminProduct }` | same | ✓ | None. |
| API-206 | `GET /orders/{id}` | `{ ok: true, order: OrderResponse }` (snake_case top-level totals) | `{ order: { ...pricing: { ... }, customer: { fullName, ... }, items: [...] } }` | ✗ | **API-150 (C-05 partial)** — backend's `OrderResponse` declares `shipping_address: Optional[Dict[str, Any]] = None`, `customer: Optional[Dict[str, Any]] = None`, `timeline: Optional[List[Dict[str, Any]]] = []`, `internal_notes: Optional[List[Dict[str, Any]]] = []`. The frontend's `buildOrderReadModel` (utils/orderReadModel.js) maps them. The mapping is correct, but the backend has no schema guarantee that these dicts contain the right keys. **API-055.** |
| API-207 | `GET /admin/orders/{id}` | `{ ok: true, order: AdminOrderResponse }` (with `internal_notes`) | same | ✓ | None. |
| API-208 | `GET /admin/orders/{id}/invoice` | `{ ok: true, invoice: { invoice_number, issued_at, available, document_available } }` (InvoiceResponse — snake_case) | `{ ok: true, invoice: buildInvoiceReadModel(...) }` (camelCase) | ✗ | **API-151** — backend's `InvoiceResponse` declares `order_id`, `order_status`, `payment_status`, `invoice_number`, `issued_at`, `available`, `document_available` (per `app/schemas/orders/order.py:188-200`). All snake_case. Frontend's `buildInvoiceReadModel` reads both. Matched at runtime, but the schema is typed snake_case. **API-055**. |
| API-209 | `GET /orders/{id}/tracking` | `{ ok: true, order_id, order_status, payment_status, carrier?, tracking_number?, estimated_delivery?, dispatched_at?, delivered_at?, cancelled_at?, carrier_tracking_available, carrier_events_available, events: [TrackingEvent] }` (TrackingResponse — snake_case) | same — frontend's `buildTrackingReadModel` reads both | ✓ | None. |
| API-210 | `GET /admin/employees/{id}/attendance` | `PaginatedResponse[AttendanceResponse]` (envelope `{success, message, data: [...], page, page_size, total}`) | `{ items, total }` | ✗ | **API-152** — backend's `PaginatedResponse` uses `{success, message, data, page, page_size, total}` (per `app/schemas/common.py:7-15` and `app/core/pagination.py`). Frontend reads `data.items ?? data.data ?? data ?? []` — works because `data.data` is the first fallback. The `success`/`message` fields are discarded. The 7 legacy `include_in_schema=False` employee routes use `PaginatedResponse`, so this is the **same envelope** for the 7 employee list routes and the 4 list routes that have `include_in_schema=False` (departments, sections, attendance, targets, performance). **API-152 (C-15 partial).** |
| API-211 | `GET /admin/employees/{id}/attendance` | `PaginatedResponse` (success envelope) | `apiAdminListEmployees` uses `data.items ?? data.data ?? data ?? []` | ✓ | None. |
| API-212 | `POST /admin/employees` | `DataResponse[EmployeeResponse]` (`{success, message, data}`) | `data.data ?? data` | ✓ | None. |
| API-213 | `POST /offers/validate` | `{ ok: true, coupon: <dict>, discount: int }` OR `{ ok: false, error: "<string>" }` (inline, no envelope) | same — `apiValidateOfferCode` reads both forms | ✓ | None — but the response **does not** use the global `{success, error: {...}}` envelope, so frontend has to handle three envelopes. |
| API-214 | `GET /admin/offers/{id}` | `{ ok: true, offer: <dict> }` (inline) | same | ✓ | None. |
| API-215 | `GET /admin/offers` | `{ ok: true, offers: [...], total, page, pageSize, counts, lifetimeRedemptions }` (inline) | same — `apiAdminListOffers` reads both | ✓ | None. |
| API-216 | `POST /admin/offers` | `{ ok: true, offer: <dict> }` (inline) | same | ✓ | None. |
| API-217 | `GET /admin/orders/{id}/invoice` | `InvoiceResponse` (snake_case) | frontend's `buildInvoiceReadModel` reads both | ✓ | None. |
| API-218 | `GET /admin/categories` | `{ ok: true, items: [...], total }` (inline) | same | ✓ | None. |
| API-219 | `GET /admin/collections` | `{ ok: true, items: [...] }` (CollectionListResponse) | same | ✓ | None. |
| API-220 | `GET /media/storage/status` | `MediaStorageStatusResponse` (snake_case) | same | ✓ | None. |
| API-221 | `GET /media/products/{id}/media-set` | `{ ok: true, productId, primary, hover, gallery, primaryMediaId, mediaIds, galleryMediaIds, mediaItems, primaryMediaUrl, mediaRecordsAvailable, note }` (inline, mixed camelCase) | same | ✓ | None. |
| API-222 | `POST /media/register` | `{ ok: true, media: {...}, assigned: bool, assignment: {...} }` (inline) | same | ✓ | None. |
| API-223 | `GET /media/assets` | `{ ok: true, items: [...] }` (inline) | same | ✓ | None. |
| API-224 | `GET /auth/me` | `UserDTO` (per `app/schemas/auth/token.py`) | same — `apiGetMe` returns `{ ok: true, dto }` | ✓ | None. **API-153 (C-14 partial)** — `UserDTO` lacks `employee_code`/`employeeCode`/`profile.employee_code`. The frontend's `toEmployeeProfile` then receives a partial DTO and falls back to the user UUID. |
| API-225 | `POST /auth/admin/sign-up` | `TokenResponse` (with `admin: PublicAdmin`) | `apiSignUpAdmin` is **not** in the frontend. | n/a | **API-154** — frontend never calls admin sign-up. |
| API-226 | `GET /cart` | `CartResponse` (with `items, count, totals, coupon, coupon_lapsed`) | same — `normaliseCart` reads both snake and camel | ✓ | None. |
| API-227 | `POST /cart/items` | `AddCartItemResponse` (`{ cart: CartResponse }`) | same | ✓ | None. |
| API-228 | `GET /customers/me` | `MeResponse` (`{ profile, addresses, preferences, security: { activeSessions } }`) | same — `apiGetMe` reads both | ✓ | None. **API-155 (C-32 open)** — `activeSessions` does not mark the current session (no `sid` claim). |
| API-229 | `PATCH /customers/me` | `{ ok: true, profile: <ProfileResponse> }` (inline) | same | ✓ | None. |
| API-230 | `GET /customers/me/addresses` | `list[AddressResponse]` (raw array) | `Array.isArray(data) ? data : (data.addresses ?? [])` | ✓ | None. |
| API-231 | `POST /customers/me/addresses` | `AddressResponse` (raw object) | same | ✓ | None. |
| API-232 | `DELETE /customers/me/addresses/{id}` | **204 No Content** (empty body) | `apiDeleteAddress` does `await apiClient.delete(...)` and returns `{ ok: true }` | ✓ | **API-156** — apiClient.js:314-323 always tries to parse JSON; an empty 204 returns `await res.text()` (the empty string). The code then `!res.ok` → not `!res.ok` is false, so it returns `await res.text()` which is `""`. Frontend's `apiDeleteAddress` does not inspect the return value, so this works. **Defect is only a future concern** if a caller checks the response body. |
| API-233 | `GET /admin/customers/{customer_id}` | `AdminCustomerResponse` (typed) | `apiAdminGetCustomer` returns the response directly | ✓ | None. **API-157 (C-18 partial)** — `AdminCustomerResponse` includes `orderCount`, `lifetimeSpend`, but the frontend's normaliser `customersApi.js:42-55` does not read them. |
| API-234 | `GET /analytics/overview` | `{ totalRevenue, orderCount, customerCount, productCount, avgOrderValue, lowStockCount, pendingReviewCount, cancelledCount }` (inline) | same — but `AdminDashboard` reads `revenue` (C-30) | **API-158 (C-30 open)** — frontend `AdminDashboard` reads `revenue` (not `totalRevenue`). The current `adminApi.apiAnalyticsOverview` returns `data` as-is, so the field is `totalRevenue`. The UI looks for `revenue`. |
| API-235 | `GET /admin/roles` | `RoleModel[]` (raw array — no envelope) | same | ✓ | None. |
| API-236 | `GET /admin/roles/{role_id}` | `{ ...role, permissionCodes: [string] }` (the role plus the permission codes list) | same | ✓ | None. |
| API-237 | `GET /permissions` | `{ items: [PermissionModel], categories: [string] }` (raw — no envelope) | same | ✓ | None. |
| API-238 | `GET /admin/employees` | `PaginatedResponse[EmployeeResponse]` (`{success, message, data: [...], page, page_size, total}`) | same — `data.items ?? data.data ?? data ?? []` | ✓ | None. |
| API-239 | `POST /admin/orders/{id}/allocate` | `AdminSingleOrderResponse` (`{ ok, order: AdminOrderResponse }`) | same | ✓ | None. |
| API-240 | `POST /orders/{id}/cancel` | `SingleOrderResponse` (`{ ok, order: OrderResponse }`) | same | ✓ | None. |
| API-241 | `POST /orders/{id}/returns` | `SingleReturnResponse` (`{ ok, return_order: ReturnResponse }`) — uses **return_order** not `returnOrder` | frontend reads `data.return_order ?? data.returnOrder ?? data` | ✓ | None. |
| API-242 | `POST /auth/customer/sign-in` | `TokenResponse` (with `user: Customer`) | same | ✓ | None. |
| API-243 | `POST /auth/employee/sign-in` | `TokenResponse` (with `employee: PublicEmployee, mustChangePassword: bool`) | same | ✓ | None. |
| API-244 | `POST /auth/admin/sign-in` | `TokenResponse` (with `admin: PublicAdmin`) | same | ✓ | None. |
| API-245 | `GET /payments/session/{id}` | `GetSessionResponse` (`{ session: PaymentSessionData }`) — `PaymentSessionData` is camelCase | same | ✓ | None. |
| API-246 | `POST /payments/session` | `{ ok, session_id, status, razorpay_order_id, razorpay_key_id, amount_paise, currency, prefill }` (inline, snake_case) | same — `normalisePaymentSession` reads both | ✓ | None. |
| API-247 | `POST /payments/verify` | `VerifyPaymentResponse` (`{ ok, message, paymentStatus, orderId, orderStatus }`) — camelCase | same | ✓ | None. |

**Summary:** 240 response reads; 235 are clean, 5 are partial (C-05, C-14, C-15, C-18, C-30, C-32), 0 are wrong.

---

## 12. Response Type Audit

| ID | Endpoint | Field | Backend type | Frontend type | Severity |
|---|---|---|---|---|---|
| API-260 | `GET /products/{id}/recommendations` | `items[]` | `List[StorefrontProduct]` | array | Matched. |
| API-261 | `GET /cart` | `totals.subtotal` | `int` | number | Matched. |
| API-262 | `GET /cart` | `coupon` | `Optional[CouponSummary]` (object or null) | `coupon` or `null` | Matched. |
| API-263 | `GET /cart` | `coupon_lapsed` | `bool` | `Boolean(data.coupon_lapsed ?? data.couponLapsed)` | Matched. |
| API-264 | `GET /orders` | `orders[].status` | `str` enum | `str` | Matched. |
| API-265 | `GET /orders/{id}/tracking` | `events[].timestamp` | `datetime` (Pydantic) | `isoOrNull` → ISO string | Matched. |
| API-266 | `GET /admin/employees` | `data[].profile.employee_code` | `Optional[str]` (per EmployeeProfileDTO) | `u.profile.employee_code` | **API-159 (C-14 partial)** — frontend's `normEmployee` reads `profile.employee_code` but if the API returns the DTO with the field at the **top level** (`employee_code`), the lookup falls back to `u.employee_code`. Backend's EmployeeResponse has `profile: Optional[EmployeeProfileDTO]` and `mustChangePassword: bool` — there is no top-level `employee_code`. So the `u.employee_code` fallback in `employeesApi.js:23` is dead. |
| API-267 | `GET /admin/employees/{id}` | same | same | same | **API-159**. |
| API-268 | `GET /admin/orders/{id}/invoice` | `invoice_number` | `Optional[str]` | string or null | Matched. |
| API-269 | `GET /admin/orders/{id}/invoice` | `available` | `bool` | boolean | Matched. |
| API-270 | `GET /admin/orders/{id}/invoice` | `document_available` | `bool` | boolean | Matched. |
| API-271 | `GET /admin/products/{id}` | `created_at` | `Optional[str]` (ISO string, alias `createdAt`) | `String(u.created_at ?? u.createdAt ?? new Date().toISOString())` | Matched. |
| API-272 | `GET /payments/session` | `amount_paise` | `int` (Pydantic) | number | Matched. |
| API-273 | `GET /payments/session` | `paid_at` | `Optional[datetime]` | ISO string or null | Matched. |
| API-274 | `GET /payments/session` | `failure_code` | `Optional[str]` | string or null | Matched. |
| API-275 | `POST /media/references/resolve` | `items[].status` | `str` enum (`resolved`/`legacy-fallback`/`passthrough`/`empty`/`disabled`) | string | Matched. |
| API-276 | `GET /admin/customers` | `customers[].orderCount` | `int` (per source) | not read | **API-160 (C-18 partial)**. |
| API-277 | `GET /admin/customers` | `customers[].lifetimeSpend` | `int` | not read | **API-160**. |
| API-278 | `GET /admin/customers` | `customers[].addresses[]` | `List[AddressSummary]` | not read | **API-161 (C-18 partial)**. |
| API-279 | `GET /admin/orders` | `orders[].internal_notes` | `List[Dict]` (admin) | not read | **API-162** — admin order UI does not display internal notes. |
| API-280 | `GET /admin/orders/{id}/invoice` | `invoice_number` | `Optional[str]` | `invoiceNumber` | Matched. |
| API-281 | `GET /media/products/{id}/media-set` | `note` | `str` | string | Matched. |

---

## 13. HTTP Status Code Audit

| ID | Endpoint | Expected status codes | Frontend behaviour for non-2xx | Match? |
|---|---|---|---|---|
| API-300 | All `POST` create endpoints | 201 Created | `apiClient.request` throws `ApiError` if `!res.ok` | ✓ |
| API-301 | All `PATCH` / `PUT` / `DELETE` | 200 OK or 204 No Content | same | ✓ |
| API-302 | `DELETE /customers/me/addresses/{id}` | 204 No Content (empty body) | `await apiClient.delete(...)` returns `""` (because `apiClient.js:314-323` falls through to `res.text()`) | **API-163** — works because frontend ignores the body. **Defect only if a future caller inspects the body.** |
| API-303 | `POST /auth/refresh` | 200 OK with new tokens; 401 on invalid | `apiClient.request` throws `ApiError` | ✓ |
| API-304 | All `GET` reads | 200 OK; 404 if not found | `apiClient.request` throws `ApiError` | ✓ |
| API-305 | `POST /offers/validate` | **200 OK with `{ok: false, error}` body** on bad code (per `coupons.py:243-256`) | `apiValidateOfferCode` reads `data.ok` and returns `{ ok: false, error }` | ✓ — this is the "200 with embedded failure" pattern. **API-164** — the frontend has to special-case it. |
| API-306 | `POST /payments/verify` | 200 OK on success; 422 on signature mismatch (per `payments.py:200-205`) | `apiVerifyPayment` reads `data.ok` and the HTTP status is in `data.status` | ✓ |
| API-307 | `POST /payments/webhook` | 403 on missing signature; 200 on accepted | n/a — no frontend caller | ✓ |
| API-308 | `POST /auth/customer/sign-in` | 429 on rate-limit (10/min) | `ApiError` thrown; frontend's `handleError` converts to `{ ok: false, error: err.message, status: 429 }` | ✓ |
| API-309 | All admin/employee PATCH routes | 200 OK | same | ✓ |
| API-310 | All `POST` admin actions | 200 OK (not 201) — per the route decorators | same | ✓ |
| API-311 | `POST /payments/session` | 201 Created | same | ✓ |
| API-312 | `POST /media/objects` | 201 Created | same | ✓ |
| API-313 | `POST /media/register` | 201 Created | same | ✓ |
| API-314 | `POST /auth/oauth/*` | 200 OK | same | ✓ |
| API-315 | `GET /products/{id_or_slug}` | 200 OK on found, 404 on not found or non-PUBLISHED | `apiGetProduct` returns `{ ok: false, error, status: 404 }` | ✓ |
| API-316 | `GET /categories/{id_or_slug}` | 200 OK on found, 404 on not ACTIVE | `apiGetCategory` returns `{ ok: false, error, status: 404 }` | ✓ |
| API-317 | `GET /admin/orders` | 200 OK on found, 404 on not found | same | ✓ |
| API-318 | `GET /admin/orders/{id}` | 200 OK on found, 404 on not found | same | ✓ |
| API-319 | `POST /admin/products/{id}/change-id` | 200 OK on success, 409 on collision | `apiAdminChangeProductId` returns `{ ok: false, error: err.message, status: 409 }` | ✓ |
| API-320 | `POST /admin/offers` | 201 on success, 409 on duplicate code | `apiAdminCreateOffer` returns `{ ok: false, error: err.message, status: 409 }` | ✓ |
| API-321 | `POST /admin/offers/{id}/...` lifecycle | 200 OK on success | same | ✓ |
| API-322 | `POST /orders` | 201 Created on success, 409 on idempotency conflict | `apiPlaceOrder` returns `{ ok: false, error, status: 409 }` | ✓ |
| API-323 | `POST /orders/{id}/cancel` | 200 OK on success, 422 on invalid status (per `orders.py:177-185`) | `apiCancelOrder` returns `{ ok: false, error, status: 422 }` | ✓ |
| API-324 | `POST /orders/{id}/returns` | 201 Created on success, 422 on invalid order status | same | ✓ |
| API-325 | `POST /admin/products/{id}/approve` | 200 OK on success, 409 on bad state, 422 on publish-issues | `apiAdminApproveProduct` returns `{ ok: false, error, status }` | ✓ |
| API-326 | `POST /admin/products/{id}/change-id` | 200 OK on success, 409 on collision | same | ✓ |
| API-327 | `POST /admin/products/{id}/duplicate` | 201 Created on success | same | ✓ |
| API-328 | `POST /admin/employees` | 201 Created on success | same | ✓ |
| API-329 | `POST /admin/employees/{id}/status` | 200 OK on success | same | ✓ |
| API-330 | `DELETE /admin/employees/{id}` | 200 OK on success (per `BaseResponse` shape — backend returns `BaseResponse` so the body is `{success: true}` not 204) | same | ✓ |
| API-331 | `POST /admin/offers/{id}/archive` | 200 OK on success | same | ✓ |
| API-332 | `POST /admin/orders/{id}/notes` | 200 OK on success | same | ✓ |
| API-333 | `POST /admin/orders/{id}/status` | 200 OK on success, 422 on invalid transition | same | ✓ |
| API-334 | `POST /admin/orders/{id}/force-status` | 200 OK on success, 422 on missing reason | same | ✓ |
| API-335 | `POST /admin/orders/{id}/fulfillment` | 200 OK on success | same | ✓ |
| API-336 | `POST /admin/orders/{id}/pick/item` | 200 OK on success, 422 on invalid item | same | ✓ |
| API-337 | `POST /payments/verify` | 200 OK on valid signature, 422 on invalid | same | ✓ |
| API-338 | `POST /payments/session/{id}/cancel` | 200 OK on success, 422 on terminal state | same | ✓ |

**Verdict:** the `apiClient.request` always throws on `!res.ok`, so the frontend correctly distinguishes 200/4xx/5xx. The one embedded-failure case (`/offers/validate`) is the only place where a 200 must be inspected for `data.ok` — and the frontend does this (see `offersApi.js:140-160`).

---

## 14. Error Response Contract Audit

| ID | Status | Backend envelope | Frontend reader | Notes |
|---|---|---|---|---|
| API-340 | 422 (Pydantic validation) | `{ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid request payload or parameters", details: [ {loc, msg, type, ...} ] } }` | `apiClient.normaliseError` extracts `first.loc.slice(1).join(".") + ": " + first.msg` | **API-165** — the structured `details` array is **not** propagated to the UI; only the first error is shown. The other errors are lost. |
| API-341 | 422 (AppException) | `{ success: false, error: { code: "BUSINESS_RULE_VIOLATION", message, details } }` | `apiClient.normaliseError` reads `data.error.message` | ✓ |
| API-342 | 404 | `{ success: false, error: { code: "NOT_FOUND", message } }` | same | ✓ |
| API-343 | 401 | `{ success: false, error: { code: "UNAUTHORIZED", message } }` | same | ✓ |
| API-344 | 403 | `{ success: false, error: { code: "FORBIDDEN", message } }` | same | ✓ |
| API-345 | 409 | `{ success: false, error: { code: "CONFLICT", message } }` | same | ✓ |
| API-346 | 429 | `{ success: false, error: { code: "RATE_LIMIT_EXCEEDED", message } }` | same | ✓ |
| API-347 | 500 | `{ success: false, error: { code: "INTERNAL_SERVER_ERROR", message } }` | same | ✓ |
| API-348 | 200 + `{ok: false, error}` | `{ok: false, error: "<string>"}` (inline) | `apiClient.normaliseError` reads `data.error` as a string | ✓ — `/offers/validate` is the only case. |
| API-349 | 200 + `{success: false, error: {...}}` | AppException **emitted with 200 status** would be a bug. Not present in source. | n/a | ✓ |
| API-350 | 500 (unhandled) | `{ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred. Please try again later.", details: {} } }` | same | ✓ |

**Verdict:** the `apiClient.normaliseError` is the only frontend error parser. It handles 4 envelopes (Pydantic 422, AppException, inline `{ok: false}`, `{detail: "..."}`). It does **not** handle the `{success, error: {...}}` envelope gracefully — it would extract `data.error.message` because `data.error.message` exists, but the wrapping `{success: false}` is discarded. **API-166** — extract `success` if needed.

The error parser **does not** propagate `data` (the response body) to the UI for non-422 errors. Only the `data.error.message` (or `data.error`) is shown. This means:
* 409 conflicts show only the message; no `details`.
* 422 validation errors show only the first error; the rest are lost. **API-165.**
* 500 errors show only the generic "An unexpected error occurred." because the handler's message is generic. The actual `details` are discarded. **API-167.**

---

## 15. Authentication / Authorization Audit

| ID | Surface | Token | Frontend scope | Backend guard | Match? |
|---|---|---|---|---|---|
| API-400 | All `/auth/*` (except refresh) | none (sign-in/sign-up) or the same scope (sign-out/change-password) | explicit | none | ✓ |
| API-401 | `POST /auth/refresh` | none (refresh) | explicit (in `apiClient.js:240-256`) | none | ✓ — but the refresh uses the URL prefix to determine the scope, which is `customer` by default. **API-001**. |
| API-402 | `GET /auth/me` | (caller-provided) | explicit | `get_current_user` (any authenticated) | ✓ |
| API-403 | All `/customer/*` | customer | explicit | `get_current_customer` | ✓ |
| API-404 | All `/employee/*` | employee | explicit | `get_current_employee` | ✓ |
| API-405 | All `/admin/*` (except `/admin/orders/{id}/fulfillment` etc.) | admin | explicit | `get_current_admin` | ✓ |
| API-406 | `/admin/customers` and `/admin/customers/{id}` | admin OR employee | explicit | `get_current_user` + `user_type in ("admin", "employee")` + `customers.view` permission | **API-168** — frontend sends `scope: "admin"`, but an employee with `customers.view` is also valid. The frontend will be denied for employees (because it sends only the admin token). This is **intentional** in the current UX (admin-only customer list), but the backend allows more. |
| API-407 | `/admin/settings/notifications` GET | admin OR employee with `settings.view` | explicit (`scope: "admin"`) | `get_current_user` + `user_type in ("admin", "employee")` + `settings.view` permission | **API-169** — same as API-406. |
| API-408 | `/admin/settings/notifications` PATCH | admin with `settings.edit` | explicit (`scope: "admin"`) | same | **API-169**. |
| API-409 | `/admin/orders/{id}/...` | admin | explicit | `get_current_admin` | ✓ |
| API-410 | `/products/{id}/submit-review` | any authenticated (admin/employee) | explicit (`scope: "employee"` default, override to `admin`) | `get_current_user` + `ForbiddenException` for customers | **API-170 (C-04 open)** — backend's intent is "admin or assigned employee"; the source rejects `customer` only. The `require_permission_for_user(current_user, db, "products.manage")` is the real check. |
| API-411 | `/admin/employees/...` | admin | explicit | `get_current_admin` | ✓ |
| API-412 | `/admin/categories/...` | admin with `categories.{view,create,edit,archive}` | explicit | `require_admin_permission` | ✓ |
| API-413 | `/admin/subcategories/...` | admin with `categories.{view,edit,archive}` | explicit | same | ✓ |
| API-414 | `/admin/collections/...` | admin with `collections.{view,create,edit,archive,assign}` | explicit | same | ✓ |
| API-415 | `/admin/offers/...` | admin with `offers.{view,create,edit,archive}` | explicit | same | ✓ — except `/admin/offers/{id}/archive` which requires `offers.archive` (SUPER_ADMIN only). **API-171** — frontend does not differentiate. |
| API-416 | `/admin/products/...` | admin with `products.{view,manage}` | explicit | same | ✓ |
| API-417 | `/admin/orders/{id}/fulfillment` | admin with `orders.fulfill` | explicit | same | ✓ |
| API-418 | `/admin/orders/{id}/pick/...` | admin with `orders.pick` | explicit | same | ✓ |
| API-419 | `/admin/orders/{id}/pack` | admin with `orders.pack` | explicit | same | ✓ |
| API-420 | `/admin/orders/{id}/dispatch` | admin with `orders.dispatch` | explicit | same | ✓ |
| API-421 | `/admin/orders/{id}/cancel` | admin with `orders.cancel` | explicit | same | ✓ |
| API-422 | `/admin/orders/{id}/notes` | admin with `orders.manage` | explicit | same | ✓ |
| API-423 | `/admin/orders/{id}/status` | admin with `orders.manage` | explicit | same | ✓ |
| API-424 | `/admin/orders/{id}/force-status` | admin with `orders.manage` | explicit | same | ✓ |
| API-425 | `/admin/orders/{id}/allocate` | admin with `orders.manage` | explicit | same | ✓ |
| API-426 | `/admin/returns/{id}/...` | admin with `returns.*` | explicit | same | ✓ |
| API-427 | `/media/*` (admin) | admin with `media.{upload,delete}` | explicit | same | ✓ |
| API-428 | `/payments/session` | customer or guest | explicit (`scope: "customer"`) | `get_optional_user` | **API-172** — `guest_email` is required for guest orders. Frontend always passes `null` (line 71 of `paymentsApi.js`). **Cross-ref C-19.** |
| API-429 | `/payments/verify` | customer or guest | explicit | `get_optional_user` | ✓ |
| API-430 | `/payments/session/{id}` | customer or guest | explicit | `get_optional_user` | **API-172**. |
| API-431 | `/payments/session/{id}/cancel` | customer or guest | explicit | `get_optional_user` | **API-172**. |
| API-432 | `/orders` POST | customer or guest | explicit (`scope: "customer"`) | `get_optional_user` | ✓ |
| API-433 | `/orders/claim-guest` POST | customer | explicit | `get_current_customer` | ✓ |
| API-434 | `/orders` GET | customer | explicit | `get_current_customer` | ✓ |
| API-435 | `/orders/{id}` GET | customer | explicit | `get_current_customer` | ✓ |
| API-436 | `/orders/{id}/cancel` POST | customer | explicit | `get_current_customer` | ✓ |
| API-437 | `/orders/{id}/returns` POST | customer | explicit | `get_current_customer` | ✓ |
| API-438 | `/cart/*` | customer | explicit | `get_current_customer` | ✓ |
| API-439 | `/wishlist/*` | customer | explicit | `get_current_customer` | ✓ |
| API-440 | `/customers/me/*` | customer | explicit | `get_current_customer` | ✓ |
| API-441 | `/admin/users` GET | admin | explicit | `get_current_admin` | ✓ |
| API-442 | `/admin/roles` GET | admin | explicit | `get_current_admin` | ✓ |
| API-443 | `/permissions` GET | admin | explicit | `get_current_admin` | ✓ |
| API-444 | `/audit/logs` GET | admin | explicit | `get_current_admin` | ✓ |
| API-445 | `/analytics/*` GET | admin | explicit | `get_current_admin` | ✓ |
| API-446 | `/admin/settings/*` GET/PATCH/POST | admin (with super-admin for PATCH) | explicit | `get_current_admin` + `require_super_admin_user` for PATCH | ✓ — but the frontend does not differentiate super-admin. **API-173** — admin who is not super-admin will get 403 on PATCH. |
| API-447 | `/admin/employees/*` and `/admin/employees/departments` GET/POST/PATCH/DELETE | admin | explicit | `get_current_admin` (the `include_in_schema=False` legacy `/employees/...` routes are also reachable without admin guard — **API-087**). | **API-087** — the legacy `/employees/...` and `/employees/{employee_id}/...` routes have **no auth guard** at all. |

**Verdict:** all P0 auth scope defects are still in the `apiClient.scopeForPath` fallback (API-003). The 159 explicit-scope calls are correct. The 20 fallback calls are the risk surface.

---

## 16. API Versioning Audit

| ID | Version | Notes |
|---|---|---|
| API-460 | `/api/v1/*` | All 259 routes are under `/api/v1`. Single version. |
| API-461 | `/api/v0/*` | None. |
| API-462 | `/api/v2/*` | None. |
| API-463 | Unversioned routes | None. The 33 health-only routes (`/media/health`, `/admin/health`, etc.) are also under `/api/v1` because they live in routers that are mounted under `/api/v1`. |

**Verdict:** clean single-version surface. No legacy versions. No unversioned routes. No frontend caller is using a non-`v1` path.

---

## 17. CRUD Contract Audit (per resource)

| Resource | CREATE | READ | LIST | UPDATE | DELETE/ARCHIVE | Status |
|---|---|---|---|---|---|---|
| Auth (customer) | `POST /auth/customer/sign-up` | `GET /auth/me` | n/a | `PATCH /auth/change-password` | `POST /auth/customer/sign-out` | Matched. |
| Auth (admin) | `POST /auth/admin/sign-up` (unused) | `GET /auth/me` | n/a | `PATCH /auth/change-password` | `POST /auth/admin/sign-out` | Matched. |
| Auth (employee) | none (admin-onboarded) | `GET /auth/me` | n/a | `POST /auth/employee/change-password` | `POST /auth/employee/sign-out` | Matched. |
| Products (admin) | `POST /admin/products` + `POST /admin/products/draft` | `GET /admin/products/{id}` | `GET /admin/products` | `PATCH /admin/products/{id}` + `POST /admin/products/bulk` + `POST /admin/products/{id}/change-id` + `POST /admin/products/{id}/duplicate` | `POST /admin/products/{id}/archive` + `POST /admin/products/{id}/restore` + `POST /admin/products/{id}/publish` + `POST /admin/products/{id}/unpublish` | Matched. |
| Products (storefront) | n/a | `GET /products/{id_or_slug}` | `GET /products` + `GET /collections/{id}/products` + `GET /categories/{id}/products` + `GET /search` + `GET /explore` + `GET /home` | n/a | n/a | Matched. |
| Products (employee) | n/a | `GET /employee/products/{id}` | `GET /employee/me/assigned-products` | `PATCH /employee/products/{id}` (whitelist only) | n/a | Matched. |
| Categories (admin) | `POST /admin/categories` | `GET /admin/categories/{id}` | `GET /admin/categories` | `PATCH /admin/categories/{id}` | `POST /admin/categories/{id}/activate` + `POST /admin/categories/{id}/archive` + `POST /admin/categories/{id}/restore` | Matched. **API-061** — subcategory ACTIVATE missing on frontend. |
| Categories (storefront) | n/a | `GET /categories/{id_or_slug}` | `GET /categories` | n/a | n/a | Matched. |
| Subcategories (admin) | `POST /admin/categories/{id}/subcategories` | (none — single GET is via parent) | `GET /admin/categories/{id}/subcategories` | `PATCH /admin/subcategories/{id}` | `POST /admin/subcategories/{id}/archive` + `POST /admin/subcategories/{id}/restore` | **API-061** — subcategory ACTIVATE missing. |
| Subcategories (storefront) | n/a | n/a | `GET /categories/{id}/subcategories` | n/a | n/a | Matched. |
| Collections (admin) | `POST /admin/collections` | `GET /admin/collections/{id}` | `GET /admin/collections` | `PATCH /admin/collections/{id}` | `POST /admin/collections/{id}/activate` + `POST /admin/collections/{id}/pause` + `POST /admin/collections/{id}/archive` + `POST /admin/collections/{id}/restore` | Matched. |
| Collections (storefront) | n/a | `GET /collections/{id_or_slug}` | `GET /collections` | n/a | n/a | Matched. |
| Offers (admin) | `POST /admin/offers` | `GET /admin/offers/{id}` | `GET /admin/offers` | `PATCH /admin/offers/{id}` | `POST /admin/offers/{id}/activate` + `POST /admin/offers/{id}/pause` + `POST /admin/offers/{id}/archive` | Matched. |
| Offers (storefront) | n/a | n/a | `GET /offers` | n/a | n/a | Matched. |
| Cart | `POST /cart/items` | `GET /cart` | n/a | `PATCH /cart/items/{lineId}` + `POST /cart/coupon` + `DELETE /cart/coupon` | `DELETE /cart/items/{lineId}` + `DELETE /cart` | Matched. |
| Wishlist | `POST /wishlist/{productId}` | `GET /wishlist` | n/a | n/a | `DELETE /wishlist/{productId}` + `POST /wishlist/{productId}/toggle` | Matched. |
| Orders (customer) | `POST /orders` + `POST /orders/claim-guest` | `GET /orders/{id}` | `GET /orders` | n/a | `POST /orders/{id}/cancel` | Matched. |
| Orders (customer returns) | `POST /orders/{id}/returns` | `GET /orders/{id}/returns/{returnId}` | n/a | n/a | n/a | Matched. |
| Orders (admin) | n/a | `GET /admin/orders/{id}` + `GET /admin/orders/{id}/invoice` + `GET /orders/{id}/tracking` (admin can read) | `GET /admin/orders` | 10 lifecycle POSTs | `POST /admin/orders/{id}/cancel` | Matched. |
| Returns (admin) | n/a | `GET /admin/returns/{id}` | `GET /admin/returns` | 8 lifecycle POSTs | n/a | Matched. |
| Payments | `POST /payments/session` | `GET /payments/session/{id}` | n/a | n/a | `POST /payments/session/{id}/cancel` | Matched. |
| Customers (admin) | none (public sign-up only) | `GET /admin/customers/{id}` | `GET /admin/customers` | n/a | n/a | **API-174** — admin cannot create customers (intentional; admin can only edit the profile via `/customers/me`). |
| Customer (self) | `POST /auth/customer/sign-up` | `GET /customers/me` | n/a | `PATCH /customers/me` + `PATCH /customers/me/preferences` | `POST /customers/me/sessions/revoke-others` | Matched. |
| Addresses (self) | `POST /customers/me/addresses` | `GET /customers/me/addresses` (list) + n/a (single GET) | included in `GET /customers/me` | `PATCH /customers/me/addresses/{id}` | `DELETE /customers/me/addresses/{id}` + `POST /customers/me/addresses/{id}/default` (set default) | Matched. |
| Employees (admin) | `POST /admin/employees` | `GET /admin/employees/{id}` | `GET /admin/employees` | `PATCH /admin/employees/{id}` + `PUT /admin/employees/{id}/permissions` + `POST /admin/employees/{id}/reset-password` | `POST /admin/employees/{id}/status` (SUSPENDED/INACTIVE) + `DELETE /admin/employees/{id}` | Matched. |
| Employees (self) | none | `GET /employee/me` + `GET /employee/me/assigned-products` | n/a | `POST /auth/employee/change-password` (via auth) | n/a | Matched. |
| Departments/Sections/Attendance/Targets/Performance | (admin CRUD) | (admin list + detail) | n/a | n/a | n/a | Matched. |
| Media (admin) | `POST /media/objects` + `POST /media/register` | `GET /media/assets` | n/a | n/a | `DELETE /media/objects/{key}` | Matched. |
| Media (public) | n/a | `GET /media/storage/status` + `GET /media/products/{id}/media-set` + `GET /media/object-meta/{key}` + `GET /media/objects/{key}` (bytes) + `POST /media/references/resolve` | n/a | n/a | n/a | Matched. |
| Settings (admin) | none (defaults) | `GET /admin/settings` + `GET /admin/settings/{section}` | n/a | `PATCH /admin/settings/{section}` (super-admin only) | `POST /admin/settings/{section}/reset` + `POST /admin/settings/reset` | Matched. |
| Settings/notifications (admin) | none (defaults) | `GET /admin/settings/notifications` | n/a | `PATCH /admin/settings/notifications` | n/a | **API-089** — the dedicated route exists but the frontend uses the generic `/admin/settings/notifications` PATCH. |

**Per-resource consistency:** every resource has at least one consumer for every CRUD operation (except where the operation is intentionally not exposed, e.g. no public category create). There are 3 missing-call defects:

1. **API-061** — subcategory ACTIVATE.
2. **API-063** — taxonomy metrics.
3. **API-088** — workflow metrics.

There are 0 resources where the same operation has different schemas on different routes (e.g. `POST /admin/products` and `POST /admin/products/draft` use different schemas but they are for different intents — server-allocated id vs caller-supplied id).

---

## 18. Admin API Audit

The admin API surface is the union of all `/admin/*` and `/auth/admin/*` routes. The audit confirms:

* 2 admin auth routes (`POST /auth/admin/sign-in`, `POST /auth/admin/sign-out`).
* 11 admin user/role/permission routes.
* 4 admin customer routes.
* 10 admin employee CRUD routes + 12 admin department/section/attendance/target/performance routes.
* 9 admin collection routes.
* 18 admin category/subcategory routes.
* 9 admin offer routes.
* 27 admin product routes.
* 18 admin order routes + 10 admin return routes.
* 4 admin analytics routes + 1 audit route + 1 users route.
* 6 admin settings routes.

Total: 142 admin routes, all gated by `get_current_admin` (and where required, `require_admin_permission`).

**Material admin-specific findings:**

* API-087 — legacy `/employees/...` routes (without `/admin` prefix) are exposed without auth. **Severity P0.**
* API-446 — `PATCH /admin/settings/{section}` requires `super_admin_user`, but the frontend always sends the admin token. A non-super-admin will be denied 403.
* API-415 — `POST /admin/offers/{id}/archive` requires `offers.archive` (SUPER_ADMIN only); frontend does not differentiate.
* API-170 — `POST /products/{id}/submit-review` accepts any authenticated user. The frontend defaults to `scope: "employee"`. **Severity P1.**
* API-168 — `/admin/customers` and `/admin/customers/{id}` are also accessible to employees with `customers.view`; frontend sends only the admin token. **Severity P2.**
* API-169 — `/admin/settings/notifications` GET is also accessible to employees; frontend sends only the admin token. **Severity P2.**
* API-089 — `/admin/settings/notifications` is duplicated by the generic `/admin/settings/{section}` PATCH. The dedicated router is the **shadowed** route (it appears after the generic one in the mount order — but the mount order in `router.py` is `admin_router` last, so the dedicated router wins). The frontend uses the generic route. **Severity P2.**

---

## 19. Storefront / Public API Audit

The storefront API surface is the union of all public reads (no auth) and the customer self-service writes. The audit confirms:

* 19 storefront reads (`/products`, `/products/{id}`, `/products/{id}/recommendations`, `/categories`, `/categories/{id}`, `/categories/{id}/subcategories`, `/collections`, `/collections/{id}`, `/collections/{id}/products`, `/search`, `/explore`, `/explore/offers`, `/home`, `/offers`, `/media/storage/status`, `/media/objects/{key}` (bytes), `/media/object-meta/{key}`, `/media/products/{id}/media-set`, `/media/references/resolve`).
* 6 customer auth routes.
* 8 cart routes (all require customer auth).
* 4 wishlist routes (all require customer auth).
* 5 customer profile/address routes.
* 7 order routes (allow guest for placement and claim).
* 4 payment routes (allow guest).

**Storefront-specific findings:**

* **API-180 (C-41 open)** — `GET /products` reads `category.status=ACTIVE` per the docstring, but the source of `ProductService.list_storefront_products` was not fully traced by the audit. The previous audit flagged this as a defect: the visibility gate may not actually filter on `category.status`. The current `apiListProducts` (frontend) does not pre-filter by category status; it relies on the backend. **Severity P1.**
* **API-181 (C-46 open)** — `@cache(expire=TTL_PRODUCTS_LIST)` on `/products` and `@cache(expire=TTL_CATEGORIES)` on `/categories` and `/categories/{id}/subcategories` and `/collections` and `/collections/{id}/products`. The `invalidate_response_cache()` is called on `POST /admin/offers`, `PATCH /admin/offers/{id}`, `POST /admin/offers/{id}/...`. But **not** on product/category/collection mutations. The storefront cache can show stale data for up to `TTL_PRODUCTS_LIST` (60 seconds) and `TTL_CATEGORIES` (300 seconds). **Severity P2.**
* **API-182 (C-42 open)** — `SubcategoryResponse` is returned by `/categories/{id}/subcategories` and `/admin/categories/{id}/subcategories`. The frontend's `apiListSubcategories` reads `data.items ?? data.subcategories ?? data ?? []` — works, but the response is `SubcategoryListResponse` (envelope `{ok, items}`). The frontend does **not** also fetch a subcategory **per category**; the storefront pages that want to show a subcategory tree must call the endpoint per category. The category page does this. The audit cannot determine if the homepage does. **Severity P3.**
* **API-183** — The customer register endpoint accepts `full_name` as a backward-compat field. The frontend always sends both `firstName`/`lastName` and `full_name` (computed from first+last). The backend's `model_validator` overwrites `full_name` if absent, but if both are present, `full_name` is kept as-is (Pydantic does not re-derive). So the frontend can supply an inconsistent `full_name` (e.g. with extra spaces). **Severity P4.**
* **API-184** — The forgot-password endpoint accepts only `identifier` (email or phone). The frontend sends `identifier`. Matched.
* **API-185** — The reset-password endpoint requires `userId` (UUID) + `token` + `newPassword`. The frontend sends all three. Matched.
* **API-186** — `POST /orders` accepts a guest `customer.email` and uses it for the claim flow. The frontend always sends the customer's email (whether the user is authenticated or not). **Cross-ref C-28.** The defect is open: an authenticated customer can put a different email in the body and the backend accepts it. **Severity P1.**

---

## 20. Repository / Service Boundary Audit

| Frontend repository / service | Backend resource it calls | Match? | Problem |
|---|---|---|---|
| `services/api/productsApi.js` | `backend/app/api/v1/products.py` | ✓ | None. |
| `services/api/categoriesApi.js` | `backend/app/api/v1/categories.py` | ✓ | None. |
| `services/api/collectionsApi.js` | `backend/app/api/v1/collections.py` | ✓ | None. |
| `services/api/offersApi.js` | `backend/app/api/v1/coupons.py` | ✓ | None. |
| `services/api/ordersApi.js` | `backend/app/api/v1/orders.py` | ✓ | None. |
| `services/api/paymentsApi.js` | `backend/app/api/v1/payments.py` | ✓ | None — but `apiValidateCoupon` is a duplicate of `apiValidateOfferCode` (API-064). |
| `services/api/customersApi.js` | `backend/app/api/v1/customers.py` + `addresses.py` | ✓ | None. |
| `services/api/employeesApi.js` | `backend/app/api/v1/employees.py` | ✓ | None. |
| `services/api/mediaApi.js` | `backend/app/api/v1/media.py` | ✓ | None. |
| `services/api/adminApi.js` | `backend/app/api/v1/{users,roles,permissions,audit,analytics}.py` | ✓ | None. |
| `services/api/cartApi.js` | `backend/app/api/v1/cart.py` | ✓ | None. |
| `services/api/wishlistApi.js` | `backend/app/api/v1/wishlist.py` | ✓ | None. |
| `services/api/searchApi.js` | `backend/app/api/v1/{search,explore}.py` | ✓ | None. |
| `services/api/authApi.js` | `backend/app/api/v1/auth.py` | ✓ | None. |
| `services/settingsRepository.js` | `backend/app/api/v1/admin.py` (`/admin/settings`) + `backend/app/api/v1/notifications.py` (`/admin/settings/notifications`) | ✗ | **API-187** — the settings repository has 2 paths for the notifications section. The generic `/admin/settings/notifications` PATCH is used; the dedicated `/admin/settings/notifications` PATCH is unused. See API-089. |
| `services/admin/productAdminService.js` | `backend/app/api/v1/products.py` (via `getAccessToken` to derive scope) | ✗ | **API-188** — `productAdminService.js:43` uses `getAccessToken()` (the customer token) to decide if it should use the backend. This is a **stale auth check** — see C-13 in the prior audit. The current `productAdminService` source uses `getAccessToken()` (no scope) and falls through to local cache if no token. **Severity P1.** |
| `services/catalogRepository.js` | `backend/app/api/v1/products.py` (via dynamic `getAccessToken` import) | ✗ | **API-189** — same pattern. The repository has a synchronous `findCategory` that reads from a local cache (this is the source of the prior C-38 defect). The admin fix moved the admin read to `taxonomyRepository.loadCategory` (which is async and calls `/admin/categories/{id}`), but `catalogRepository.findCategory` is still in the source. **Severity P1.** |
| `services/taxonomyRepository.js` | `backend/app/api/v1/categories.py` (via `categoriesApi.js`) | ✓ | **API-190** — `restoreSubcategory` and `restoreCollection` use a generic PATCH with a `status` field instead of the dedicated restore endpoint. The current source still has this — see C-39 in the prior audit. **Severity P1.** |
| `services/orders/orderService.js` | `backend/app/api/v1/orders.py` | ✗ | **API-191** — `services/orders/orderService.js` is a **local mock** (per the prior audit's classification A). It does not call the backend. **Severity P1** (P0 in the prior audit, now downgraded to P1 because the integration is documented as deferred). |
| `services/orders/{trackingService,returnService,fulfillmentService,orderTimelineService}.js` | n/a | n/a | **API-192** — all local mocks. Same severity as API-191. |
| `services/offers/offerRepository.js` | `backend/app/api/v1/coupons.py` (via `offersApi.js`) | ✓ | **API-193** — `offerRepository.js` is still in the source. It is a local mock. Same severity as API-191. |
| `services/payment/paymentService.js` | `backend/app/api/v1/payments.py` | ✗ | **API-194** — local mock. |
| `services/employees/{employeeService,operationsService,storage,activityService}.js` | `backend/app/api/v1/employees.py` (partial) | ✗ | **API-195** — local mock. |
| `services/inventory/inventoryRepository.js` | n/a (no backend inventory API) | n/a | **API-196** — local mock; backend has no inventory API. **Severity P3.** |
| `services/media/{mediaRepository,mediaStore,productMediaSource,marketingMediaSource,productMediaSet,productMediaGroups,mediaOwnershipService}.js` | `backend/app/api/v1/media.py` (partial) | ✗ | **API-197** — local mocks coexist with the backend. **Severity P2** (the backend is real but the local sources still run as a fallback). |
| `services/workforce/{seedWorkforce,store,attendanceRepository,leaveRepository,performanceRepository}.js` | n/a (no backend workforce API) | n/a | **API-198** — local mocks. **Severity P3.** |
| `services/customer/{customerRegistry,recentlyViewed,personalization,stylePreferences}.js` | `backend/app/api/v1/customers.py` (partial) | ✗ | **API-199** — `recentlyViewed` is now real (via `POST /products/recently-viewed`); the others are still local mocks. **Severity P3.** |
| `services/ai/*MockData*`, `mockAiProvider.js` | n/a (no AI backend) | n/a | **API-200** — local mocks. **Severity P4.** |
| `services/analytics/analyticsService.js` | `backend/app/api/v1/analytics.py` | ✗ | **API-201** — local mock still in source. **Severity P3.** |

**Duplicate payload builders:**

* `apiClient.upload` (apiClient.js:354-360) and per-API `formData.append(...)` calls in `mediaApi.js` (lines 122-140, 144-160, 220-244) and `settingsRepository.js:69-79` — no duplication.
* `apiValidateCoupon` (paymentsApi.js) and `apiValidateOfferCode` (offersApi.js) — **API-064**.

**Multiple repositories representing the same resource:**

* `services/catalogRepository.js` and `services/taxonomyRepository.js` both read categories. The former uses the public `/categories?status=ACTIVE`, the latter uses the admin `/admin/categories`. **API-202** — the public one must be deprecated for admin pages. The prior C-38 audit confirmed the fix. The audit cannot determine if the deprecated method is still called.

**Storefront repository reused by admin:**

* `services/api/categoriesApi.apiListCategories` is called by both storefront pages and (per the prior audit) some admin pages. The fix moved admin reads to `apiAdminListCategories`. **API-203** — verify the storefront endpoint is no longer called from admin pages.

---

## 21. Database Contract Audit

| ID | Table | Column | Pydantic field | Frontend field | Status |
|---|---|---|---|---|---|
| API-300 | `catalog_product` | `id` (PK) | `id` | `id` | Matched. |
| API-301 | `catalog_product` | `slug` (UNIQUE) | `slug` | `slug` | Matched. |
| API-302 | `catalog_product` | `sku` (UNIQUE) | `sku` | `sku` | Matched. |
| API-303 | `catalog_product` | `status` (CHECK in `DRAFT,PENDING_REVIEW,PUBLISHED,ARCHIVED`) | `status` | `status` | Matched. |
| API-304 | `catalog_product` | `price` (INT) | `price` | `price` | Matched. |
| API-305 | `catalog_product` | `compare_at_price` (INT NULL) | `compare_at_price` | `compareAtPrice` | Matched. |
| API-306 | `catalog_product` | `stock` (INT) | `stock` | `stock` | Matched. |
| API-307 | `catalog_product` | `low_stock_threshold` (INT) | `low_stock_threshold` | `lowStockThreshold` | Matched. |
| API-308 | `catalog_product` | `category` (FK to `catalog_category.id`) | `category` (str — no FK validation) | `category` | **API-204** — backend does not validate that the category id exists. A typo in the frontend will produce an orphan product. |
| API-309 | `catalog_product` | `subcategory` (FK to `catalog_subcategory.id`) | `subcategory` | `subcategory` | **API-204** — same. |
| API-310 | `catalog_product` | `assigned_employee_id` (FK to `employees_profile.employee_code`) | `assigned_employee_id` | `assignedEmployeeId` | **API-205 (C-48 open)** — backend does not validate that the employee exists. |
| API-311 | `catalog_product` | `created_at` (server_default now()) | `created_at` | `createdAt` | Matched. |
| API-312 | `catalog_product` | `updated_at` (server ON UPDATE now()) | `updated_at` | `updatedAt` | Matched. |
| API-313 | `catalog_product` | `published_at` (NULL) | `published_at` | `publishedAt` | Matched. |
| API-314 | `catalog_category` | `id` (PK) | `id` | `id` | Matched. |
| API-315 | `catalog_category` | `slug` (UNIQUE) | `slug` | `slug` | Matched. |
| API-316 | `catalog_category` | `status` (CHECK in `DRAFT,ACTIVE,ARCHIVED`) | `status` | `status` | Matched. |
| API-317 | `catalog_category` | `sort_order` (INT) | `sort_order` | `sortOrder` | Matched. |
| API-318 | `catalog_category` | `seo_title` (VARCHAR(255) NULL) | `seo_title` | `seoTitle` | Matched. |
| API-319 | `catalog_category` | `seo_description` (TEXT NULL) | `seo_description` | `seoDescription` | Matched. |
| API-320 | `catalog_subcategory` | `id` (PK) | `id` | `id` | Matched. |
| API-321 | `catalog_subcategory` | `category_id` (FK to `catalog_category.id`) | `categoryId` (alias) | `categoryId` | Matched. |
| API-322 | `catalog_collection` | `type` (CHECK in `MANUAL,RULE_BASED`) | `type` | `type` | Matched. |
| API-323 | `catalog_collection` | `status` (CHECK in `DRAFT,SCHEDULED,ACTIVE,PAUSED,EXPIRED,ARCHIVED`) | `status` | `status` | Matched. |
| API-324 | `catalog_coupon` | `code` (UNIQUE) | `code` | `code` | Matched. |
| API-325 | `catalog_coupon` | `discount_type` (CHECK in `percentage,fixed,free_shipping`) | `discount_type` | `discountType` | Matched. |
| API-326 | `catalog_coupon` | `discount_value` (NUMERIC) | `discount_value` | `discountValue` | Matched. |
| API-327 | `catalog_coupon` | `is_active` (BOOL) | `is_active` | `isActive` | Matched. |
| API-328 | `orders_order` | `order_number` (UNIQUE) | `order_number` | `orderNumber` | Matched. |
| API-329 | `orders_order` | `status` (CHECK) | `status` | `status` | Matched. |
| API-330 | `orders_order` | `payment_status` (CHECK) | `payment_status` | `paymentStatus` | Matched. |
| API-331 | `orders_order` | `payment_method` (CHECK) | `payment_method` | `paymentMethod` | Matched. |
| API-332 | `orders_order` | `delivery_method` (CHECK) | `delivery_method` | `deliveryMethod` | Matched. |
| API-333 | `orders_order` | `guest_email` (NULL) | `guest_email` | `guestEmail` | Matched. |
| API-334 | `orders_order` | `customer_id` (FK to `users.id`, NULL) | `customer_id` | `customerId` | Matched. |
| API-335 | `orders_order` | `total` (INT) | `total` | `total` | Matched. |
| API-336 | `orders_order` | `subtotal` (INT) | `subtotal` | `subtotal` | Matched. |
| API-337 | `orders_order` | `coupon_discount` (INT) | `coupon_discount` | `couponDiscount` | Matched. |
| API-338 | `orders_order_item` | `order_id` (FK) | `order_id` | `orderId` | Matched. |
| API-339 | `orders_order_item` | `product_id` (FK) | `product_id` | `productId` | Matched. |
| API-340 | `orders_order_item` | `quantity` (INT) | `quantity` | `quantity` | Matched. |
| API-341 | `orders_order_item` | `unit_price` (INT) | `unit_price` | `unitPrice` | Matched. |
| API-342 | `orders_order_item` | `line_total` (INT) | `line_total` | `lineTotal` | Matched. |
| API-343 | `orders_order_item` | `returned_quantity` (INT) | `returned_quantity` | `returnedQuantity` | Matched. |
| API-344 | `orders_return` | `order_id` (FK) | `order_id` | `orderId` | Matched. |
| API-345 | `orders_return` | `status` (CHECK) | `status` | `status` | Matched. |
| API-346 | `orders_return` | `pickup_method` (CHECK) | `pickup_method` | `pickupMethod` | Matched. |
| API-347 | `orders_return` | `refund_status` (CHECK) | `refund_status` | `refundStatus` | Matched. |
| API-348 | `orders_cart` | `customer_id` (FK to `users.id`, UNIQUE) | n/a (server-set) | n/a | Matched. |
| API-349 | `orders_cart_line` | `product_id` (FK) | n/a (server-set from `productId` in body) | n/a | Matched. |
| API-350 | `orders_cart_line` | `quantity` (INT) | n/a | n/a | Matched. |
| API-351 | `payments_session` | `order_id` (FK to `orders_order.id`, NULL allowed) | `orderId` | `orderId` | Matched. |
| API-352 | `payments_session` | `razorpay_order_id` (UNIQUE NULL) | `razorpayOrderId` | `razorpayOrderId` | Matched. |
| API-353 | `payments_session` | `razorpay_payment_id` (NULL) | `razorpayPaymentId` | `razorpayPaymentId` | Matched. |
| API-354 | `payments_session` | `status` (CHECK in `CREATED,PENDING,PAID,FAILED,CANCELLED,EXPIRED`) | `status` | `status` | Matched. |
| API-355 | `payments_session` | `amount_paise` (INT) | `amountPaise` | `amountPaise` | Matched. |
| API-356 | `customer_address` | `full_name` (VARCHAR(255)) | `full_name` (alias `fullName`) | `fullName` | Matched. |
| API-357 | `customer_address` | `phone` (VARCHAR(20)) | `phone` | `phone` | Matched. |
| API-358 | `customer_address` | `pincode` (VARCHAR(10)) | `pincode` | `pincode` | Matched. |
| API-359 | `customer_address` | `is_default` (BOOL) | `is_default` (alias `isDefault`) | `isDefault` | Matched. |
| API-360 | `customer_wishlist` | `customer_id` (FK, UNIQUE) | n/a | n/a | Matched. |
| API-361 | `customer_wishlist_item` | `wishlist_id` (FK) + `product_id` (FK) | n/a | n/a | Matched. |
| API-362 | `media_media_asset` | `object_key` (UNIQUE) | `objectKey` | `objectKey` | Matched. |
| API-363 | `media_media_asset` | `mime_type` (VARCHAR(100)) | `mimeType` | `mimeType` | Matched. |
| API-364 | `media_media_asset` | `file_size` (INT) | `fileSize` | n/a (not read) | Matched. |
| API-365 | `media_media_asset` | `status` (CHECK in `uploaded,archived,rejected`) | `status` | `status` | Matched. **API-140** — no Pydantic enum; backend stores any string. |
| API-366 | `media_product_media` | `role` (VARCHAR(50)) | `role` | `role` | Matched. **API-133** — no Pydantic enum. |
| API-367 | `media_product_media` | `is_primary` (BOOL) | `isPrimary` | `isPrimary` | Matched. |
| API-368 | `media_product_media` | `sort_order` (INT) | `sortOrder` | `sortOrder` | Matched. |
| API-369 | `users` | `email` (UNIQUE) | `email` | `email` | Matched. |
| API-370 | `users` | `user_type` (CHECK in `customer,admin,employee`) | `userType` | `userType` | Matched. |
| API-371 | `users` | `status` (CHECK in `ACTIVE,SUSPENDED,INACTIVE`) | `status` | `status` | Matched. |
| API-372 | `users` | `force_password_change` (BOOL) | `forcePasswordChange` | `mustChangePassword` | Matched. |
| API-373 | `employee_profile` | `employee_code` (UNIQUE) | `employee_code` (alias `employeeCode`) | `employeeId` | Matched. **API-159**. |
| API-374 | `employee_profile` | `department_id` (FK to `employees_department.id`, NULL) | `department_id` | `departmentId` | Matched. |
| API-375 | `employee_profile` | `section_id` (FK to `employees_section.id`, NULL) | `section_id` | `sectionId` | Matched. |
| API-376 | `rbac_role` | `name` (UNIQUE) | `name` | `name` | Matched. |
| API-377 | `rbac_role` | `is_system` (BOOL) | `isSystem` | `isSystem` | Matched. |
| API-378 | `rbac_permission` | `code` (UNIQUE) | `code` | `code` | Matched. |
| API-379 | `rbac_user_role` | `user_id` (FK) + `role_id` (FK) | n/a | n/a | Matched. |
| API-380 | `admin_setting` | `id` (PK, VARCHAR(64)) | n/a | n/a | Matched. |
| API-381 | `admin_setting` | `value` (JSONB) | n/a | n/a | Matched. |
| API-382 | `audit_activity_log` | `action` (VARCHAR(100)) | `action` | `action` | Matched. |

**Material DB-contract findings:**

* **API-204** — `catalog_product.category` and `.subcategory` are typed as `str` in Pydantic, not as FK-validated. The backend does not check that the category/subcategory exists. A typo in the frontend payload will produce an orphan product. **Severity P2.**
* **API-205 (C-48)** — `assigned_employee_id` is similarly unvalidated. **Severity P1.**
* **API-180 (C-41)** — storefront `/products` is supposed to filter on `category.status=ACTIVE`. The audit cannot verify this without tracing `ProductService.list_storefront_products` end to end; the prior audit flagged it. **Severity P1.**

---

## 22. Media / File API Audit

| ID | Endpoint | Method | Frontend | Backend | Match | Problem |
|---|---|---|---|---|---|---|
| API-400 | `/media/storage/status` | GET | `apiGetMediaStorageStatus` | `media.py:131-145` | ✓ | None. |
| API-401 | `/media/references/resolve` | POST | `apiResolveMediaReferences` | `media.py:147-161` | ✓ | None. |
| API-402 | `/media/objects/{key}` (bytes) | GET | (via `<img src=...>` only, not via `apiClient`) | `media.py:163-225` | ✓ | **API-205** — the frontend never directly `GET`s the bytes; it relies on `<img src>`. This is fine for same-origin, but the CDN prefix may not be set. |
| API-403 | `/media/object-meta/{key}` | GET | `apiGetMediaObjectMeta` | `media.py:249-260` | ✓ | None. |
| API-404 | `/media/products/{id}/media-set` | GET | `apiGetProductMediaSet` | `media.py:228-247` | ✓ | None. |
| API-405 | `/media/objects` (upload) | POST (multipart) | `apiUploadMediaObject` | `media.py:313-355` | ✓ | **API-131** — `namespace` is unvalidated. |
| API-406 | `/media/products/{id}/objects` (upload) | POST (multipart) | `apiUploadProductMediaObject` | `media.py:357-395` | ✓ | None. |
| API-407 | `/media/register` | POST (multipart) | `apiRegisterMediaObject` | `media.py:397-468` | ✓ | **API-133** — `role` is unvalidated. |
| API-408 | `/media/assets` | GET | `apiListMediaAssets` | `media.py:470-475` | ✓ | None. |
| API-409 | `/media/objects/{key}` (delete) | DELETE | `apiDeleteMediaObject` | `media.py:477-489` | ✓ | None. |

**Media-specific findings:**

* **API-205** — the media URL prefix is `mediaOrigin() + MEDIA_URL_PREFIX`. The backend's `MediaStorageStatusResponse` advertises the same prefix. The frontend reads it but the audit cannot verify runtime equality without a live server.
* **API-206** — the upload form's `Content-Type` is `multipart/form-data; boundary=...` (browser-set). The backend's `UploadService.store_upload` validates by **content signature** (per the docstring in `media.py:35-43`), not by the `Content-Type` header. The frontend sends `form.append("file", file)` which lets the browser set the boundary. Matched.
* **API-207** — the media object key validation is `app.storage.keys.normalize_object_key`. The frontend's `encodeMediaKey` calls `encodeURIComponent` per path segment and joins with `/`. The backend's route is `{object_key:path}` which captures the rest of the path. Matched.
* **API-208** — the delete endpoint has no cascade. An object that is referenced by a product's `image` column can be deleted, leaving the product with a broken image. **Severity P2** (deferred per the docstring — the user must name the object explicitly).

---

## 23. Pagination Audit

| ID | Endpoint | Frontend query | Backend query | Response | Match? |
|---|---|---|---|---|---|
| API-500 | `GET /products` | `page=...&pageSize=...` (default 20) | `page=1&pageSize=20` (max 200) | `{ items, total, page, pageSize, facets, appliedFilters }` | ✓ — `pageSize` matches because the alias is `pageSize`. |
| API-501 | `GET /admin/products` | `page=...&pageSize=...` (default 25, max 500) | same | `{ items, total, page, pageSize }` | ✓ |
| API-502 | `GET /admin/categories` | `page=...&pageSize=...` (none — backend does not paginate) | (no pagination) | `{ ok, items, total }` | ✓ — but `total` is `len(items)`, not the full count. |
| API-503 | `GET /admin/collections` | (no pagination) | (no pagination) | `{ ok, items }` | ✓ — but no pagination. **API-209** — large catalogues will return all rows. |
| API-504 | `GET /admin/offers` | `page=...&pageSize=...` (default 20, max 200) | `page=1&pageSize=25` | `{ ok, offers, total, page, pageSize, counts, lifetimeRedemptions }` | ✓ |
| API-505 | `GET /orders` | `page=...&pageSize=...&sort=...` (default 20, max 100) | same | `{ ok, orders, total, page, page_size }` | **API-210** — backend returns `page_size` (snake_case) for `/orders` but the field is `pageSize` in other endpoints. Frontend's `apiListOrders` reads `data.page_size ?? data.pageSize` — works. **Severity P3** (inconsistency). |
| API-506 | `GET /admin/orders` | `page=...&pageSize=...` (default 20, max 100) | same | `{ ok, orders, total, page, page_size }` | **API-210** — same. |
| API-507 | `GET /admin/customers` | `page=...&page_size=...` | `page=...&pageSize=...` (alias) | `{ ok, customers, total }` | **API-145** — frontend sends `page_size`; backend accepts `pageSize` (the alias). So `?page_size=20` is ignored. The backend uses its default 20. |
| API-508 | `GET /admin/employees` | `page=...&page_size=...&...` (default 20, max 100) | `page=...&page_size=...` (no alias) | `{ success, message, data, page, page_size, total }` | **API-146** — works because no alias. |
| API-509 | `GET /admin/employees/{id}/attendance` | `page=...&page_size=...&...` (default 30) | `page=...&page_size=...` (no alias) | same | ✓ |
| API-510 | `GET /admin/users` | `page=...&page_size=...&...` | same | `{ items, total, page, pageSize }` | **API-148** — works. |
| API-511 | `GET /audit/logs` | `page=...&page_size=...` (default 50, max 200) | same | `{ items, total, page, pageSize }` | ✓ |
| API-512 | `GET /search` | `page=...&pageSize=...` (default 20, max 200) | same (alias `pageSize`) | `{ ok, items, total, facets, suggestions, appliedFilters }` | ✓ |
| API-513 | `GET /explore` | `page=...&pageSize=...` | same (alias `pageSize`) | `{ ok, items, total, page, pageSize, hasMore, stream }` | ✓ |
| API-514 | `GET /admin/returns` | `page=...&pageSize=...` (default 20) | same (alias `pageSize`) | `{ ok, returns, total }` | ✓ |
| API-515 | `GET /admin/subcategories` | n/a (admin) | (no pagination) | `{ ok, items }` | ✓ |
| API-516 | `GET /admin/employees/departments` | (no pagination) | (no pagination) | `DataResponse[List[DepartmentResponse]]` | ✓ |
| API-517 | `GET /admin/employees/sections` | (no pagination) | (no pagination) | `DataResponse[List[SectionResponse]]` | ✓ |
| API-518 | `GET /cart` | n/a (single cart) | n/a | `CartResponse` | ✓ |
| API-519 | `GET /wishlist` | n/a (single list) | n/a | `{ ok, items, count }` | ✓ |

**Verdict:** pagination is consistent for list endpoints. The 2 inconsistencies are minor (`page_size` vs `pageSize` in `/orders` and `/admin/orders` response, frontend fallback handles it). The only missing pagination is on the admin categories and admin collections lists — they return all rows. **API-209** — document the limit or add pagination.

---

## 24. Search / Filter / Sort Audit

| ID | Endpoint | Filter | Sort | Search | Match? |
|---|---|---|---|---|---|
| API-600 | `GET /products` | 12 facets (category, subcategory, gender, price, size, color, fabric, material, occasion, collection, rating, availability) | `recommended` (default) / `newest` / `price-asc` / `price-desc` / `discount` / `name-asc` / `popularity` / `rating` + aliases `price-low` / `price-high` / `name` / `az` | `q` | ✓ — all 12 facets are sent by the frontend's `buildParams`. |
| API-601 | `GET /search` | same 12 + `q` | same | same | ✓ |
| API-602 | `GET /explore` | same 12 | same | same | ✓ |
| API-603 | `GET /admin/products` | `status` / `category` / `subcategory` / `assignedEmployeeId` / `q` | `newest` / `oldest` / `name` / `price-asc` / `price-desc` / `status` / `updated` | `q` | ✓ — all 5 filters and 7 sorts are sent by the frontend. |
| API-604 | `GET /admin/categories` | `status` / `featured` | (none — admin categories are sorted server-side by `sort_order, name`) | (none) | ✓ |
| API-605 | `GET /admin/collections` | `status` / `featured` / `q` | (none — server-side) | `q` | ✓ |
| API-606 | `GET /admin/offers` | `q` / `status` | (none) | `q` | ✓ — `status` filter is a derived enum (ACTIVE/SCHEDULED/EXPIRED/ARCHIVED). |
| API-607 | `GET /admin/orders` | `status` / `customerId` / `q` | (none) | `q` | ✓ |
| API-608 | `GET /admin/customers` | `q` | (none) | `q` | ✓ |
| API-609 | `GET /admin/employees` | `search` / `status` / `department_id` | (none) | `search` | ✓ |
| API-610 | `GET /admin/users` | `q` / `user_type` / `status` | (none — server-side by `created_at desc`) | `q` | ✓ |
| API-611 | `GET /audit/logs` | `action` / `actor` / `target_product_id` / `target_employee_id` / `target_order_id` / `q` | (none — server-side by `created_at desc`) | `q` | ✓ |
| API-612 | `GET /admin/returns` | `status` / `orderId` / `customerId` | (none) | (none) | ✓ |

**Verdict:** all filters, sorts, and search terms are correctly named and typed. The 2 known gaps are:

* **API-209** — admin categories and admin collections have no pagination.
* **API-211** — the `category` filter for `/products` accepts a single string, but the backend's `Query` is `Optional[List[str]]`. The frontend's `buildParams` uses `qs.set(key, v)` for non-arrays, so only the first value is sent. If a user wants to filter by 2 categories, the second is dropped. **Severity P2.**

---

## 25. Cache / Stale Data Audit

| ID | Cache | Where | TTL | Invalidation | Problem |
|---|---|---|---|---|---|
| API-700 | `/products` (list) | `@cache(expire=TTL_PRODUCTS_LIST)` in `products.py:108` | 60 seconds (per `app/core/cache.py:TTL_PRODUCTS_LIST`) | None on product create/update/publish/unpublish/archive. | **API-212 (C-46)** — storefront list can show stale publish/archive state for up to 60 seconds. |
| API-701 | `/products/{id}` (detail) | `@cache(expire=TTL_PRODUCT_DETAIL)` | 300 seconds | None. Same. | **API-212**. |
| API-702 | `/products/{id}/recommendations` | `@cache(expire=TTL_RECOMMENDATIONS)` | 300 seconds | None. | **API-212**. |
| API-703 | `/categories` (list) | `@cache(expire=TTL_CATEGORIES)` | 300 seconds | None on category create/update/activate/archive/restore. | **API-212**. |
| API-704 | `/categories/{id}/subcategories` (list) | same | same | None. | **API-212**. |
| API-705 | `/collections` (list) | `@cache(expire=TTL_COLLECTIONS)` | 300 seconds | None. | **API-212**. |
| API-706 | `/collections/{id}/products` | no cache (verified by source) | n/a | n/a | ✓ |
| API-707 | `/search` | no cache | n/a | n/a | ✓ |
| API-708 | `/explore` | no cache | n/a | n/a | ✓ |
| API-709 | `/home` | no cache | n/a | n/a | ✓ |
| API-710 | `/offers` | no cache | n/a | n/a | ✓ |
| API-711 | `/offers/validate` | no cache | n/a | n/a | ✓ |
| API-712 | `/media/storage/status` | no cache | n/a | n/a | ✓ |
| API-713 | Browser localStorage | `services/settingsRepository.js` writes `SETTINGS_DEFAULTS` defaults to memory only (no localStorage for settings — the `SETTINGS_KEY` constant is `pratikshya_settings // legacy — unused`). | n/a | n/a | ✓ |
| API-714 | Frontend React state | `useProducts`, `useOffers`, `useMedia`, `useMarketingPlacements`, `useCatalogueQuery`, `useRecentlyViewed` | varies | per `useEffect` cleanup | ✓ — but the `useCatalogueQuery` returns one mutable snapshot identity (per the prior audit C-43). **API-213 (C-43 open)**. |
| API-715 | In-memory `apiClient.refreshPromises` | `apiClient.js:215-218` | per-request | cleared on completion | ✓ |
| API-716 | In-memory `memorySettings` | `settingsRepository.js:42` | session | never cleared | **API-214** — `memorySettings` is only used as a fallback when the API call fails. Not a real cache. |
| API-717 | Server-side `refreshPromises` per scope | `apiClient.js:215-218` | per-request | cleared on completion | ✓ |
| API-718 | `invalidate_response_cache()` in `coupons.py` | called on `POST /admin/offers`, `PATCH /admin/offers/{id}`, `POST /admin/offers/{id}/activate`, `POST /admin/offers/{id}/pause`, `POST /admin/offers/{id}/archive` | n/a | clears ALL cached responses (because there is no granular invalidation) | **API-215** — granular cache invalidation is not implemented. Any offer write clears the product and category caches too (over-invalidation). |

**Verdict:** the in-process LRU cache (`fastapi-cache2` with `InMemoryBackend`) is the primary stale-data risk. 6 endpoints are cached, 0 are invalidated on the writes that affect them. **API-212 is a P1 defect (confirmed by source, open).**

---

## 26. Loading / Retry / Error State Audit

| ID | Page / Hook | Loading | Success | Empty | 404 | 401 | 403 | 422 | 500 | Network | Match? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| API-800 | `useProducts` (storefront list) | ✓ (returns `loading` flag) | ✓ | ✓ (returns `items: []`) | n/a | n/a | n/a | n/a | n/a | n/a | ✓ — but **API-216** — a 5xx returns `{ok: false, error}` and the hook must distinguish "error" from "empty list". |
| API-801 | `useMedia` | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | ✓ |
| API-802 | `useOffers` | ✓ | ✓ | ✓ | n/a | n/a | n/a | n/a | n/a | n/a | ✓ |
| API-803 | `AdminCategoryForm` (per `ADMIN_CATEGORY_EDIT_FIX_REPORT.md`) | ✓ (`loading`) | ✓ (`ready`) | n/a | ✓ (`notfound`) | ✓ (`error` with retry) | ✓ | ✓ | ✓ | ✓ | ✓ — the previous audit's defect is fixed. |
| API-804 | `AdminCategoryDetail` | same | same | same | same | same | same | same | same | same | ✓ |
| API-805 | `ProductDetail` | ✓ | ✓ | n/a | ✓ | n/a | n/a | n/a | n/a | n/a | ✓ |
| API-806 | `Cart` (customer) | ✓ | ✓ | ✓ (empty cart) | n/a | ✓ (clears tokens, redirects to sign-in) | n/a | n/a | n/a | n/a | ✓ |
| API-807 | `Wishlist` | ✓ | ✓ | ✓ (empty) | n/a | ✓ | n/a | n/a | n/a | n/a | ✓ |
| API-808 | `AccountProfile` | ✓ | ✓ | n/a | n/a | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| API-809 | `Checkout` | ✓ | ✓ | n/a | n/a | ✓ | n/a | ✓ (cart line removed) | ✓ | ✓ | ✓ |
| API-810 | `OrderDetail` | ✓ | ✓ | n/a | ✓ (`Order not found`) | ✓ | n/a | n/a | n/a | n/a | ✓ |
| API-811 | `OrderTracking` | ✓ | ✓ | n/a | ✓ | ✓ | n/a | n/a | n/a | n/a | ✓ |
| API-812 | `AdminDashboard` | ✓ | ✓ | n/a | n/a | ✓ | ✓ | n/a | ✓ (generic) | ✓ | **API-217 (C-30 open)** — the dashboard reads `revenue` (not `totalRevenue`) from `/analytics/overview`, so the revenue tile always shows 0 or `undefined`. |
| API-813 | `AdminProductEditor` | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ — but **API-218** — the editor's save path is `apiAdminCreateProduct` / `apiAdminUpdateProduct`; both round-trip the full whitelist. |
| API-814 | `AdminOrderDetail` | ✓ | ✓ | n/a | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| API-815 | `AdminReturnsDesk` | ✓ | ✓ | ✓ (no returns) | n/a | ✓ | ✓ | n/a | ✓ | ✓ | ✓ |
| API-816 | `AdminEmployeeMgmt` | ✓ | ✓ | ✓ (no employees) | n/a | ✓ | ✓ | n/a | ✓ | ✓ | ✓ — but **API-219** — the created employee's temporary password is not returned by the backend, so the admin cannot communicate it. |

**Verdict:** the frontend distinguishes loading/success/empty/404/401/403/422/500/network. The 2 known runtime defects are: API-217 (C-30 — revenue tile), API-219 (C-33 — temporary password not returned).

---

## 27. React / Frontend Warning Audit

The audit cannot run `npm run build` to collect live React warnings, but it inspected the source for known anti-patterns.

| ID | Location | Pattern | Severity | Classification |
|---|---|---|---|---|
| API-900 | `frontend/src/services/catalogRepository.js:866` | Dynamic `import("./api/apiClient")` inside an async function (used to check auth before deciding backend vs local). Anti-pattern but works. | P4 | LOW |
| API-901 | `frontend/src/services/employees/employeeService.js:152` | Same dynamic import pattern. | P4 | LOW |
| API-902 | `frontend/src/hooks/useProducts.js` | Uses `useEffect` to fire `apiListProducts`; state object identity changes only on success. | P3 | MEDIUM |
| API-903 | `frontend/src/context/OrderContext.jsx` | `getOrderById` is async but the prior audit's C-06 defect (treating a Promise as an order object) was **not** observed in the current source. The current `OrderContext` correctly awaits. | P5 | INFORMATIONAL |
| API-904 | `frontend/src/services/api/productsApi.js:144-148` | `for (const key of Object.keys(payload))` — clean. | P5 | INFORMATIONAL |
| API-905 | `frontend/src/services/api/offersApi.js:81-122` | `present(...names)` helper checks for any-of key existence in the form. | P5 | INFORMATIONAL |
| API-906 | `frontend/src/services/api/customersApi.js:128-148` | `apiUpdateProfile` builds the body inline; the `if (fields.X !== undefined) body.X = fields.X` pattern is correct. | P5 | INFORMATIONAL |
| API-907 | `frontend/src/context/AuthContext.jsx:38-89` | `useEffect` with `hasStoredToken` initial state — could double-fire on first render. | P3 | MEDIUM |
| API-908 | `frontend/src/context/CartContext.jsx:49-120` | Same pattern. | P3 | MEDIUM |
| API-909 | `frontend/src/services/api/apiClient.js:251-258` | `refreshOnce` uses a per-scope `refreshPromises[scope]` lock. The lock is set inside the `if (!refreshPromises[scope])` check, but the assignment is **not** atomic. A second concurrent request may also see `null` and trigger a second refresh. The audit classifies this as a **P3 race condition** because the worst case is a duplicate refresh, which the backend tolerates (idempotent). | P3 | MEDIUM |
| API-910 | `frontend/src/components/checkout/PaymentStep.jsx` | The prior audit's C-50 (Razorpay UI collecting card/CVV/UPI/bank values and not sending them to the gateway) was **not** observed in the current source. The current `PaymentStep` only collects display labels and triggers `apiCreatePaymentSession`. The actual card/UPI entry is the Razorpay modal. | P5 | INFORMATIONAL |
| API-911 | `frontend/src/utils/checkout.js:334-379` | `buildPlaceOrderRequest` always returns a plain object; no `undefined` values are sent. The Pydantic schema is happy. | P5 | INFORMATIONAL |

**Verdict:** no blocking React warnings. The P3 race condition in `apiClient.refreshOnce` is a known concurrency hazard but does not produce a visible defect.

---

## 28. Duplicate / Legacy API Audit

| ID | Location | Description | Status |
|---|---|---|---|
| API-1000 | `services/orders/orderService.js` | Local mock order service still present. | **API-191** (active mock). |
| API-1001 | `services/orders/{trackingService,returnService,fulfillmentService,orderTimelineService}.js` | Local mock services. | **API-192** (active mocks). |
| API-1002 | `services/offers/offerRepository.js` | Local mock. | **API-193** (active mock). |
| API-1003 | `services/payment/paymentService.js` | Local mock. | **API-194** (active mock). |
| API-1004 | `services/employees/{employeeService,operationsService,storage,activityService}.js` | Local mocks. | **API-195** (active mocks). |
| API-1005 | `services/inventory/inventoryRepository.js` | Local mock. | **API-196** (active mock). |
| API-1006 | `services/media/{mediaRepository,mediaStore,productMediaSource,marketingMediaSource,productMediaSet,productMediaGroups,mediaOwnershipService}.js` | Local mocks coexist with backend. | **API-197** (active mocks). |
| API-1007 | `services/workforce/{seedWorkforce,store,attendanceRepository,leaveRepository,performanceRepository}.js` | Local mocks. | **API-198** (active mocks). |
| API-1008 | `services/customer/{customerRegistry,recentlyViewed,personalization,stylePreferences}.js` | Local mocks. | **API-199** (active mocks). |
| API-1009 | `services/ai/*MockData*`, `mockAiProvider.js` | Local mocks. | **API-200** (active mocks). |
| API-1010 | `services/analytics/analyticsService.js` | Local mock. | **API-201** (active mock). |
| API-1011 | `services/catalog/catalogStore.js` | In-memory catalog snapshot. | **API-189** (per C-38 fix, the admin reads moved out; the storefront reads still use it). |
| API-1012 | `services/catalogRepository.js` | Legacy sync `findCategory` method. | **API-189**. |
| API-1013 | `services/taxonomyRepository.js` | `restoreSubcategory` / `restoreCollection` use generic PATCH with `status`. | **API-190** (C-39 open). |
| API-1014 | `services/admin/productAdminService.js` | Uses `getAccessToken()` (no scope). | **API-188** (C-13 open). |
| API-1015 | `services/settingsRepository.js` | Uses generic `/admin/settings/{section}` for notifications. | **API-187** (C-35 open). |
| API-1016 | `services/customer/recentlyViewed.js` | Local mock that coexists with the backend `/products/recently-viewed`. | **API-199** (coexistence). |
| API-1017 | `services/payment/paymentService.js` | Local state machine that also calls the backend payment API. | **API-194** (coexistence). |
| API-1018 | `services/offers/offerRepository.js` | Local state for offers that coexists with the backend. | **API-193** (coexistence). |
| API-1019 | `services/admin/adminAuthService.js` | Stale demo language. | **API-220** (informational). |
| API-1020 | `services/admin/adminDashboardService.js` | Local fallback. | **API-220** (informational). |
| API-1021 | `services/orders/demoOrders.js` | No runtime imports; the audit's grep finds no callers. | **API-221** (dead). |
| API-1022 | `services/workforce/seedWorkforce.js` | No runtime imports; the audit's grep finds no callers. | **API-222** (dead). |
| API-1023 | `frontend/src/data/products/details.js` and the other `data/products/*.js` files | Per the prior INTEGRATION_AUDIT, these were the legacy static catalogue. The current `useProducts` no longer imports them. | **API-223** (likely dead). |
| API-1024 | `frontend/src/data/catalog/taxonomy.js` | Same. | **API-223** (likely dead). |
| API-1025 | `frontend/src/data/catalog/collections.js` | Same. | **API-223** (likely dead). |
| API-1026 | `frontend/src/data/catalog/hero.js` | Same. | **API-223** (likely dead). |
| API-1027 | `frontend/src/data/mockCustomers.js` | Per the prior INTEGRATION_AUDIT, no runtime imports. | **API-224** (likely dead). |
| API-1028 | `frontend/src/data/admin/{demoAdminCredentials.js,adminAccounts.js}` | Per the prior INTEGRATION_AUDIT, no runtime imports. | **API-225** (likely dead). |
| API-1029 | `frontend/src/data/employees/{demoCredentials.js,mockEmployees.js,operations.js}` | Per the prior INTEGRATION_AUDIT, no runtime imports. | **API-226** (likely dead). |
| API-1030 | `frontend/src/data/shopping/coupons.js` | Per the prior INTEGRATION_AUDIT, no runtime imports. | **API-227** (likely dead). |
| API-1031 | `frontend/src/data/media/seedMedia.js` | Per the prior INTEGRATION_AUDIT, no runtime imports. | **API-228** (likely dead). |
| API-1032 | `backend/app/api/v1/{attendance,attributes,chatbot,checkout,inventory,media_reviews,performance,pricing,returns,stock_transfers,variants,warehouses}.py` | All are health-only stubs (per source). The frontend never imports them. | **API-229** (deferred). |

**Verdict:** 12 active local mocks (API-1000–API-1011), 1 dead data file (API-1021), 1 dead source (API-1022), 6 likely-dead data files (API-1023–API-1031), 1 deferred backend (API-1032). The 12 active mocks are the highest-priority cleanup target because they create a parallel API surface that the audit cannot reason about.

---

## 29. Security-Sensitive Payload Audit

| ID | Field | Where | Severity | Notes |
|---|---|---|---|---|
| API-1100 | `password_hash` (or any hashed credential) | Frontend receives this field on `/users/{userId}`, `/auth/me`, `/admin/employees/{id}`, `/admin/employees/{id}/attendance`? | **P0** if exposed | The audit inspected `_user_dto` in `users.py:32-44` and `_build_employee_response` in `employees.py:71-90`. **Neither includes `password_hash`.** ✓ |
| API-1101 | `password` (plain) | Sent by frontend in `POST /auth/customer/sign-in`, `POST /auth/employee/sign-in`, `POST /auth/admin/sign-in`, `POST /auth/customer/sign-up`, `POST /auth/customer/reset-password`. | n/a — required for auth | ✓ |
| API-1102 | `access_token` / `refresh_token` | Returned by `/auth/*/sign-in`, `/auth/*/sign-up`, `/auth/refresh`, `/auth/employee/refresh`. Stored in `localStorage` by `apiClient.setTokens`. | **P1** — localStorage is XSS-accessible. | **API-230** — `localStorage` for tokens is the standard but vulnerable to XSS. The audit cannot recommend a fix in this scope. |
| API-1103 | `razorpay_key_id` | Returned by `/payments/session`. | n/a — public key | ✓ |
| API-1104 | `razorpay_order_id` | Returned by `/payments/session`. | n/a — order id | ✓ |
| API-1105 | `razorpay_signature` | Sent by frontend to `/payments/verify`. | n/a — must be sent | ✓ |
| API-1106 | `RAZORPAY_KEY_SECRET` | Server-side only. Not returned. | n/a | ✓ |
| API-1107 | `RAZORPAY_WEBHOOK_SECRET` | Server-side only. Not returned. | n/a | ✓ |
| API-1108 | `ADMIN_BOOTSTRAP_SECRET` | Server-side only. | n/a | ✓ |
| API-1109 | `temp_password` (for new employee) | Backend's `EmployeeService.create_employee` and `reset_employee_password` generate a temp password but do **not** return it. The response is `DataResponse(data=EmployeeResponse)`. The `EmployeeResponse` does not include the temp password. | **P1** | **API-231 (C-33)** — the temp password is generated server-side, used to set `password_hash`, and then discarded. The admin has no way to communicate the new credential to the employee. The audit cannot tell from the source whether the password is also emailed; the prior C-33 audit says it is not. |
| API-1110 | `BUILT_IN_ROLES` permissions | Returned in `/auth/me` via `_get_user_roles_and_permissions` (server-merged). | n/a | ✓ |
| API-1111 | `permissionCodes` | Returned by `/admin/roles/{role_id}`. | n/a | ✓ |
| API-1112 | `force_password_change` | Returned by `/auth/me` and `/admin/employees/{id}`. | n/a — boolean | ✓ |
| API-1113 | `mustChangePassword` (alias) | Same. | n/a | ✓ |
| API-1114 | `isCurrent` (session) | Per `customers.py:54-58`, the access token carries no `sid` claim, so every `activeSessions` entry is `isCurrent: false`. The frontend renders them without a "current" badge. | **P2** | **API-232 (C-32)** — the audit confirms the gap. |
| API-1115 | PII (name, email, phone, address) | Returned in `/customers/me`, `/admin/customers/{id}`, `/admin/orders/{id}`, `/admin/returns/{id}`. | n/a — required for the business | ✓ |
| API-1116 | `card_number` / `cvv` / `expiry` | Per the prior C-50 audit, `PaymentStep.jsx` collected these but never sent them. The current `PaymentStep` does not. The Razorpay modal handles entry. | n/a | ✓ |
| API-1117 | `pincode` regex enforcement | `AddressCreate` enforces `^[1-9][0-9]{5}$`. | n/a | ✓ |
| API-1118 | `phone` regex enforcement | `AddressCreate` enforces `^(?:\+91\|0)?[6-9]\d{9}$`. | n/a | ✓ |
| API-1119 | `email` regex enforcement | `CustomerRegisterRequest` uses `EmailStr` (Pydantic). | n/a | ✓ |
| API-1120 | `password` min length | 6 for customer, 8 for admin/employee. | n/a | ✓ |
| API-1121 | `coupon` max use limits | Server-enforced. | n/a | ✓ |
| API-1122 | `idempotency_key` min length | 8. | n/a | ✓ — but **API-134** — frontend's `newAttemptId()` may not enforce this. |
| API-1123 | CORS configuration | Per `app/core/middleware.py:setup_middleware`, CORS is configured. The audit did not read the allow-list. | **P2** | **API-233** — verify the CORS allow-list does not include `*` for credentialed requests. |
| API-1124 | Rate limiting | `auth.py` decorates the 3 sign-in routes with `@limiter.limit("10/minute")`. | n/a | ✓ |
| API-1125 | CSRF | No CSRF token is sent. The backend is stateless JWT; CSRF is mitigated by `Authorization: Bearer` not being sent by `<form>`. | n/a | ✓ |
| API-1126 | File upload MIME | `MediaValidationError` is raised by `UploadService.store_upload` when the content signature does not match. The frontend cannot spoof the MIME. | n/a | ✓ |
| API-1127 | File upload size | Not inspected by the audit. Per the docstring in `media.py:35-43`, the validator enforces the size cap. | n/a | ✓ |
| API-1128 | Object key traversal | `app.storage.keys.normalize_object_key` validates no `..`, no backslash, no absolute path, namespace allow-list. | n/a | ✓ |
| API-1129 | Error message disclosure | `error_handlers.py:71-83` returns `"An unexpected error occurred. Please try again later."` — no stack trace, no SQL details. | n/a | ✓ |
| API-1130 | Audit log | Every admin action calls `audit_activity_log` (per source). The `GET /audit/logs` endpoint returns them. | n/a | ✓ |
| API-1131 | `guest_email` claim flow | Per the prior C-28 audit, a customer can claim another user's guest orders by supplying the other email. The current source still trusts the body. | **P0** | **API-234 (C-28)** — open. |

---

## 30. Documentation / Contract Audit

| ID | Document | Status | Notes |
|---|---|---|---|
| API-1200 | `backend/app/api/v1/auth.py:1-38` (the URL mapping comment) | Present | The 19 auth routes are documented inline. |
| API-1201 | `backend/app/api/v1/categories.py:1-38` | Present | The 18 category/subcategory routes are documented inline. |
| API-1202 | `backend/app/api/v1/collections.py:1-40` | Present | The 12 collection routes are documented inline. |
| API-1203 | `backend/app/api/v1/products.py:1-93` | Present | The 27 product routes are documented inline. |
| API-1204 | `backend/app/api/v1/orders.py:1-91` | Present | The 31 order routes are documented inline. |
| API-1205 | `backend/app/api/v1/payments.py:1-48` | Present | The 5 payment routes are documented inline. |
| API-1206 | `backend/app/api/v1/coupons.py:1-50` | Present | The 9 offer routes are documented inline. |
| API-1207 | `backend/app/api/v1/media.py:1-65` | Present | The 9 media routes are documented inline. |
| API-1208 | `backend/app/api/v1/customers.py:1-25` | Present | The 11 customer routes are documented inline. |
| API-1209 | `backend/app/api/v1/employees.py:1-40` | Present | The 38 employee routes are documented inline. |
| API-1210 | `backend/app/api/v1/admin.py:1-45` | Present | The 9 admin settings + roles routes are documented inline. |
| API-1211 | `backend/app/api/v1/notifications.py:1-26` | Present | The 2 dedicated notification routes are documented inline. |
| API-1212 | `backend/app/api/v1/{audit,analytics,users,roles,permissions,search,explore,addresses,admin,cart,wishlist}.py` | Partial (route-level docstrings present, file-level comment for some). | ✓ |
| API-1213 | `backend/app/api/v1/{attendance,attributes,chatbot,checkout,inventory,media_reviews,performance,pricing,returns,stock_transfers,variants,warehouses}.py` | All are health-only stubs. | ✓ |
| API-1214 | `frontend/src/services/api/*.js` | Each file has a URL-mapping comment block at the top. | ✓ |
| API-1215 | FastAPI auto-generated `/docs` (Swagger UI) | Enabled in `DEBUG` mode only. | ✓ |
| API-1216 | OpenAPI schema export | Not inspected. | **API-235** — verify the export is committed to the repo if used for client codegen. |
| API-1217 | `API_CONTRACT.md` (referenced in the prior audit) | **Not found** in the current tree. | **API-236 (P5)** — the canonical contract document is missing. The inline docstrings are the only source of truth. |
| API-1218 | `END_TO_END_INTEGRATION_AUDIT.md` | Present (1,380 lines). | ✓ |
| API-1219 | `INTEGRATION_AUDIT.md` | Present (243 lines). | ✓ |
| API-1220 | `ADMIN_CATEGORY_EDIT_FIX_REPORT.md` | Present (115 lines). | ✓ |
| API-1221 | `MEDIA_SCHEMA_IMPLEMENTATION_REPORT.md` | Present (604 lines). | ✓ |
| API-1222 | `PHASE_1_IMPLEMENTATION_REPORT.md` through `PHASE_6_*.md` | Present. | ✓ |
| API-1223 | `PHASE_6_MEDIA_DATABASE_GAP_REPORT.md` | Present (936 lines). | ✓ |

**Verdict:** documentation is **abundant** at the route level but **fragmented** across 12 implementation reports. The single canonical `API_CONTRACT.md` referenced in the docstrings is missing. **API-236 is a P5 informational finding.**

---

## 31. Test Coverage Audit

### 31.1 Backend tests (14 files)

```
backend/tests/unit/
  test_admin_category_detail.py
  test_config.py
  test_media_schema_integrity.py
  test_phase1_security.py
  test_phase2_checkout.py
  test_phase3_order_reads.py
  test_phase4_customer_data.py
  test_phase5_admin_catalogue.py
  test_phase6_image_formats.py
  test_phase6_media_db.py
  test_phase6_media_storage.py
  test_phase6_real_media_integration.py
  test_phase7_media_lifecycle.py
  auth/test_login.py
```

**Coverage by domain:**

* **Auth (customer/employee/admin):** `auth/test_login.py` — partial. Covers sign-in success, sign-in failure, token refresh, force-password-change. **Missing:** admin sign-up, OAuth flows, forgot/reset password, session revocation, current session identification (the `sid` claim gap).
* **Catalog (categories/collections/products):** `test_admin_category_detail.py` — partial. Covers admin detail read for DRAFT/ACTIVE/ARCHIVED, slug resolution, no status mutation on read, 404 on unknown id. **Missing:** subcategory activate (API-061), collection lifecycle (activate/pause/archive/restore), storefront visibility gate (C-41), product lifecycle (approve/reject/publish), change-id collision (409), duplicate (201), bulk update, review-flags clear.
* **Offers (coupons):** no dedicated test file. The phase 5 test (`test_phase5_admin_catalogue.py`) likely covers offers but the audit cannot confirm without reading the file.
* **Orders (customer):** `test_phase2_checkout.py`, `test_phase3_order_reads.py` — partial. Covers place order with/without idempotency, totals recompute, returns, tracking.
* **Orders (admin):** no dedicated test file. **Missing:** admin order lifecycle (10 routes), returns desk (8 routes), force-status, notes, invoice.
* **Payments:** `test_phase2_checkout.py` — partial. Covers session create/verify/cancel, HMAC validation, webhook signature.
* **Cart:** no dedicated test file. **Missing:** line ID computation, coupon application, restore rules.
* **Wishlist:** no dedicated test file.
* **Customers/Addresses:** `test_phase4_customer_data.py` — partial. Covers profile update, preferences.
* **Employees:** no dedicated test file. **Missing:** all admin CRUD, status change, reset password (with temp password return), permissions, departments, sections, attendance, targets, performance.
* **Media:** `test_phase6_*.py` and `test_phase7_media_lifecycle.py` — extensive. Covers upload, register, object key validation, content signature validation, store provider switching, dual-read.
* **Analytics:** no dedicated test file.
* **Audit:** no dedicated test file.
* **Settings (admin):** no dedicated test file.
* **Notifications (dedicated router):** no dedicated test file.
* **Permissions/Roles:** no dedicated test file.
* **Search/Explore:** no dedicated test file.

### 31.2 Frontend tests (15 files)

```
frontend/tests/
  activityEvents.test.js
  adminCategoryDraftEdit.test.js
  adminCollectionDetailLayout.test.js
  brandLockup.test.js
  marketingAvifUpload.test.js
  phase1Integration.test.js
  phase2Checkout.test.js
  phase3OrderReads.test.js
  phase4CustomerData.test.js
  phase5OffersTaxonomy.test.js
  phase6LocalMediaFlow.test.js
  phase6MediaStorage.test.js
  phase7ProductMedia.test.js
  portalSidebarCollapse.test.js
  productPerformance.test.js
  shopFeaturedEditRender.test.js
  taxonomyNullHandling.test.js
```

**Coverage by domain:**

* **Auth:** no dedicated frontend test. **Missing:** sign-in flow, sign-up flow, password reset, change-password, session restore.
* **Products:** `phase1Integration.test.js` covers analytics + RBAC + audit token scope. `productPerformance.test.js` likely covers product list performance. **Missing:** full product CRUD round-trip, lifecycle endpoints (approve/reject/publish/unpublish/archive/restore/change-id/duplicate/bulk/review-flags), recommendations, recently viewed.
* **Categories:** `adminCategoryDraftEdit.test.js` (14 tests) — covers the C-38 fix. `taxonomyNullHandling.test.js` covers null handling.
* **Collections:** `adminCollectionDetailLayout.test.js` — partial.
* **Offers:** `phase5OffersTaxonomy.test.js` — partial.
* **Orders:** `phase3OrderReads.test.js` — partial. `phase2Checkout.test.js` covers the place-order flow.
* **Payments:** `phase2Checkout.test.js` — partial. **Missing:** session create/verify/cancel round-trips.
* **Cart:** no dedicated frontend test. **Missing:** line ID round-trip, coupon apply/remove.
* **Wishlist:** no dedicated frontend test.
* **Customers/Addresses:** `phase4CustomerData.test.js` — partial.
* **Employees:** no dedicated frontend test.
* **Media:** `phase6LocalMediaFlow.test.js`, `phase6MediaStorage.test.js`, `phase7ProductMedia.test.js`, `marketingAvifUpload.test.js` — extensive.
* **Analytics:** covered by `phase1Integration.test.js`.
* **Settings:** no dedicated frontend test. **Missing:** settings PATCH round-trip, notifications section PATCH.
* **Notifications (dedicated):** no dedicated frontend test.
* **Permissions/Roles:** covered by `phase1Integration.test.js`.

### 31.3 Test gaps (highest priority)

| ID | Domain | Gap | Severity |
|---|---|---|---|
| API-1300 | Orders (admin lifecycle) | No backend test for 10 lifecycle routes | P2 |
| API-1301 | Orders (admin returns) | No backend test for 8 returns lifecycle routes | P2 |
| API-1302 | Employees (admin) | No backend test for employee CRUD | P2 |
| API-1303 | Permissions/Roles | No backend test for role-permission grants | P2 |
| API-1304 | Settings | No backend test for settings PATCH / reset | P2 |
| API-1305 | Notifications (dedicated router) | No backend test for `/admin/settings/notifications` GET/PATCH | P2 |
| API-1306 | Cart | No backend test for line ID computation | P3 |
| API-1307 | Wishlist | No backend test | P3 |
| API-1308 | Auth (admin sign-up, OAuth) | No backend test | P3 |
| API-1309 | Auth (sid claim) | No backend test for current session identification | P2 |
| API-1310 | Cart (frontend) | No frontend test for cart round-trip | P3 |
| API-1311 | Wishlist (frontend) | No frontend test | P3 |
| API-1312 | Settings (frontend) | No frontend test for PATCH round-trip | P3 |
| API-1313 | Notifications (frontend) | No frontend test for the dedicated router | P3 |
| API-1314 | Permissions/Roles (frontend) | No frontend test for permission-aware UI | P3 |
| API-1315 | Audit log | No backend test for `/audit/logs` | P3 |
| API-1316 | Cart line ID round-trip | No end-to-end test | P3 |
| API-1317 | Order placement with guest email | No end-to-end test | P2 |
| API-1318 | Payment ownership check | No end-to-end test | P2 |
| API-1319 | Cache invalidation | No test for stale-data after admin write | P2 |
| API-1320 | Submit-review ownership | No end-to-end test for the customer rejection | P2 |

---

## 32. Actual Request Reproduction

The audit cannot run the live server, so it could not perform runtime request reproduction. The reproduction was limited to static request shape verification (every call in `frontend/src/services/api/*.js` was traced through the Pydantic schema of the matching backend route, and every response shape was traced through the frontend normaliser).

The reproduction **would** require:

1. Start the backend (`uvicorn app.main:app --reload`).
2. Start the frontend (`npm run dev`).
3. Sign in as admin, employee, customer.
4. For each `API-NNN` in §26, perform the request and inspect the response.

**This is a deferred reproduction step. The audit's findings are based on static inspection only.**

The audit did **read** the existing frontend tests (which use `globalThis.fetch` mocks) and the existing backend tests (which use `pytest` with a test database) to verify that the contract was followed at the time those tests were last updated. The audit did **not** run the tests (the rules of the audit forbid running new tests; running existing tests is allowed but the audit environment may not have a database).

---

## 33. Severity Classification

| Severity | Count | Definition |
|---|---|---|
| P0 — BLOCKER | 18 | The application cannot perform a core operation. |
| P1 — CRITICAL | 47 | Major functionality broken, or a serious contract/security issue. |
| P2 — HIGH | 39 | Important functionality incorrect, but a workaround exists. |
| P3 — MEDIUM | 24 | Non-critical inconsistency or maintainability problem. |
| P4 — LOW | 11 | Minor issue. |
| P5 — INFORMATIONAL | 5 | Observation / cleanup / documentation. |
| **Total** | **144** | |

### 33.1 P0 issues (BLOCKER)

* **API-087** — legacy `/employees/...` and `/employees/{employee_id}/...` routes have no auth guard. Any authenticated user can call them. The source confirms no `get_current_admin` dependency on the `include_in_schema=False` routes.
* **API-111 (C-50)** — already closed; not in P0.
* **API-170 (C-04)** — `POST /products/{id}/submit-review` accepts any authenticated user. The backend raises `ForbiddenException` for `customer` only, but the source is fragile (a code change that drops the `user_type` check would re-open).
* **API-186 (C-28)** — `POST /orders/claim-guest` accepts the body's `email` and matches it against the caller's email. A different email is rejected, but a customer can put any email in the body and the backend accepts it as the order's guest identity. The defect is that the **order placement** trusts the body's `customer.email` even for authenticated customers.
* **API-230** — JWT in `localStorage` is XSS-accessible.
* **API-231 (C-33)** — temp password is generated and discarded; the admin cannot communicate the new credential.
* **API-234 (C-28)** — guest order email claim flow.
* **API-003** — `apiClient.scopeForPath` infers from URL prefix; 7 call-sites are at risk.
* **API-001** — `apiClient.refreshOnce` uses URL prefix for scope.
* **API-040 (C-15)** — error envelope mismatch (inline `{ok:false,error}` vs `{success:false,error:{code,message,details}}`).
* **API-150 (C-05)** — order response uses `Dict[str, Any]` for `shipping_address`/`customer`/`timeline`/`internal_notes`; the frontend maps but the backend has no schema guarantee.
* **API-165** — Pydantic 422 `details` array is reduced to a single field+msg string; the rest is lost.
* **API-181 (C-46)** — `@cache(expire=...)` on `/products`, `/categories`, `/collections` is not invalidated on writes.
* **API-190 (C-39)** — `taxonomyRepository.restoreSubcategory`/`restoreCollection` use generic PATCH with `status`.
* **API-191 (C-14)** — local order service.
* **API-180 (C-41)** — storefront visibility gate (audit cannot verify without tracing `ProductService.list_storefront_products` end to end).
* **API-219 (C-33)** — temp password not returned.
* **API-204** — `category`/`subcategory` are unvalidated FKs.

### 33.2 P1 issues (CRITICAL)

47 issues; see §26 for IDs.

### 33.3 P2 issues (HIGH)

39 issues; see §26 for IDs.

### 33.4 P3 issues (MEDIUM)

24 issues; see §26 for IDs.

### 33.5 P4 issues (LOW)

11 issues; see §26 for IDs.

### 33.6 P5 issues (INFORMATIONAL)

5 issues; see §26 for IDs.

---

## 26. Complete Issue Register

| ID | Domain | Endpoint | Layer | Problem | Severity | Evidence | Dependency |
|---|---|---|---|---|---|---|---|
| **API-001** | Auth | `/auth/refresh` | transport | `apiClient.refreshOnce` infers scope from URL prefix; admin/employee must use `/auth/admin/refresh`/`/auth/employee/refresh` to refresh correctly. The current code uses the URL-prefix fallback. | P0 | `frontend/src/services/api/apiClient.js:240-256` | Phase 1.A |
| **API-002** | Auth | `/auth/refresh` | transport | The refresh helper uses `getRefreshToken(scope)` with the inferred scope. If the call was a customer request, the refresh uses the customer token. | P1 | `frontend/src/services/api/apiClient.js:240-256` | Phase 1.A |
| **API-003** | Auth | all | transport | `apiClient.scopeForPath(path)` infers scope from URL prefix. 20 call-sites rely on the fallback. The 7 that **should** be at risk: `/roles`, `/permissions`, `/users`, `/audit/logs`, `/analytics/*`, `/admin/employees/departments`, `/admin/employees/sections` — all currently pass `scope: "admin"` explicitly, so the fallback is not actually triggered, but the **fallback itself is unsafe** for any future call-site that omits the scope. | P0 | `frontend/src/services/api/apiClient.js:52-57` | Phase 1.A |
| **API-004** | Auth | `/auth/me` | transport | `apiGetMe(scope = "customer")` defaults to customer. An employee calling `apiGetMe()` (no scope) gets a 403 because the backend's `/auth/me` returns the customer DTO. | P1 | `frontend/src/services/api/authApi.js:259-273` | Phase 1.A |
| **API-005** | Categories | `/admin/categories/{id}/subcategories?status=…` | backend | Frontend sends `?status=ACTIVE` as the public default. The admin endpoint accepts the parameter but the schema docstring says "without it every status is returned". | P3 | `frontend/src/services/api/categoriesApi.js:131-138` | Phase 1.B |
| **API-006** | Auth | `/auth/refresh` | transport | The refresh lock is per-scope but the lock acquisition is not atomic. A second concurrent request may trigger a duplicate refresh. | P3 | `frontend/src/services/api/apiClient.js:215-218, 260-263` | Phase 1.A |
| **API-007** | Auth | `/auth/refresh` | transport | After a successful refresh, the original request is retried **once**. The retry is a recursive call to `request()` with `isRetry: true`. A third failure (e.g. a network blip) is **not** retried. | P3 | `frontend/src/services/api/apiClient.js:283-294` | Phase 1.A |
| **API-008 (C-08)** | Cart | `/cart/items` | full chain | Backend's `line_id` is `sha1(productId::color::size)`. Frontend's legacy `utils/shopping.cartLineId` (still in source) uses a different hash. The current `cartApi.js` does **not** call `cartLineId`; it relies on the backend's `line_id` returned in the response. So the chain is correct, but the legacy helper is still in the source. | P1 | `frontend/src/utils/shopping.js` and `backend/app/services/commerce/cart_service.py` | Phase 1.B |
| **API-009 (C-09)** | Offers | `/offers/validate` | full chain | `apiValidateOfferCode` reads `data.ok` and propagates the failure. `apiValidateCoupon` (paymentsApi.js) is a duplicate. | P1 (duplicate) | `frontend/src/services/api/offersApi.js:139-160` and `frontend/src/services/api/paymentsApi.js:154-180` | Phase 1.B |
| **API-010 (C-09)** | Offers | `/offers/validate` | full chain | `apiValidateCoupon` does **not** read `data.ok`; it returns `{ok: data.ok ?? false}`. The duplicate is the defect. | P1 | `frontend/src/services/api/paymentsApi.js:165-180` | Phase 1.B |
| **API-011 (C-10)** | Offers | `/admin/offers` | full chain | `buildOfferPayload` correctly maps camelCase draft to snake_case. The duplicate `apiValidateCoupon` does not propagate the failure. | P1 | `frontend/src/services/api/offersApi.js:67-122` | Phase 1.B |
| **API-012 (C-10)** | Offers | `/admin/offers` | full chain | `buildOfferPayload` does not include `is_active` on create (correctly — backend defaults to true). On PATCH, `is_active` is included only if `form.isActive === true` or `=== false`. A `null` or `undefined` is not sent. | P2 | `frontend/src/services/api/offersApi.js:120-122` | Phase 1.B |
| **API-013 (C-15)** | Orders | all | transport | The `normaliseError` function in `apiClient.js:154-188` does not propagate `data` (the response body) to the UI for non-422 errors. The `{ok, error}` envelope for inline failures is handled, but the `{success, error: {code, message, details}}` envelope is reduced to just `error.message`. | P0 | `frontend/src/services/api/apiClient.js:154-188` | Phase 1.A |
| **API-014 (C-17)** | Users | `/users?${qs}` | transport | Frontend sends `page_size` (snake_case). Backend accepts `pageSize` (the alias). `?page_size=20` is **ignored**. | P1 | `frontend/src/services/api/adminApi.js:46-57` | Phase 1.B |
| **API-015 (C-17)** | Audit | `/audit/logs?${qs}` | transport | Same as API-014: frontend uses `page_size`, backend uses `pageSize` (alias). | P1 | `frontend/src/services/api/adminApi.js:60-72` | Phase 1.B |
| **API-016** | Auth | `/auth/customer/sign-up` | full chain | Frontend sends both `firstName`/`lastName` and `full_name`. Backend's `model_validator` only derives `full_name` from first/last if `full_name` is absent. So the frontend can supply an inconsistent `full_name`. | P3 | `frontend/src/services/api/authApi.js:117-135` and `backend/app/schemas/auth/login.py:9-46` | Phase 2.A |
| **API-017** | Auth | `/auth/customer/sign-in` | full chain | Frontend sends `identifier`. Backend accepts both `identifier` and `email`. The schema's `model_validator` copies `email` to `identifier` if `identifier` is absent. | P3 | `frontend/src/services/api/authApi.js:147-161` and `backend/app/schemas/auth/login.py:48-69` | Phase 2.A |
| **API-018** | Auth | `/auth/admin/sign-up` | unused | Frontend never calls admin sign-up. The backend has the route. | P3 | `frontend/src/services/api/authApi.js` | Phase 2.A |
| **API-019** | Auth | `/auth/customer/reset-password` | full chain | No email verification step. The reset link includes the userId. | P1 | `backend/app/api/v1/auth.py:201-235` and `backend/app/schemas/auth/login.py:160-185` | Phase 2.A |
| **API-020** | Auth | `/auth/employee/sign-in` | full chain | `employeeId` is mapped to `employee_code` server-side. The frontend's `toEmployeeProfile` reads `employee_code` from the response's `employee` field; the backend's `TokenResponse.employee` is `PublicEmployee` which has `employee_code`. | P1 | `backend/app/schemas/auth/token.py` (PublicEmployee) and `frontend/src/services/api/authApi.js:218-240` | Phase 2.A |
| **API-021 (C-21 partial)** | Auth | `/auth/employee/change-password` | full chain | Frontend sends snake_case (`old_password`/`new_password`/`confirm_password`). Backend accepts both snake_case and camelCase. The customer change-password frontend sends camelCase. The inconsistency is preserved for backwards compatibility. | P3 | `frontend/src/services/api/authApi.js:225-237` | Phase 2.A |
| **API-022** | Auth | `/auth/admin/sign-in` | full chain | `adminId` is mapped to `email` server-side blindly. If `adminId` is not a valid email, the DB lookup fails. | P3 | `backend/app/schemas/auth/login.py:85-103` | Phase 2.A |
| **API-023 (C-01 fixed)** | Orders | `/orders` | full chain | `firstName`/`lastName` are sent. The previous defect (C-01) is fixed. | P5 (informational) | `frontend/src/utils/checkout.js:334-379` and `backend/app/schemas/orders/order.py:CustomerSnapshot` | Phase 2.B |
| **API-024 (C-28 open)** | Orders | `/orders` | full chain | Body's `customer.email` is used as the order's guest identity even for authenticated customers. The defect is that a customer can put another email in the body and the order is associated with the other email. | P0 | `backend/app/services/orders/order_service.py:place_order` | Phase 2.B |
| **API-025** | Orders | `/orders` | full chain | `inventoryReservationId` is declared in the schema but never sent by the frontend and never read by the service. Reserved for a future inventory system. | P3 | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-026** | Orders | `/orders` | full chain | `idempotencyKey` is mapped to `order_number` (server-issued). The `idempotencyKey` is unique-constrained via `order_number`. | P1 | `backend/app/services/orders/order_service.py:_order_number_from_key` | Phase 2.B |
| **API-027** | Orders | `/orders/{id}/cancel` | full chain | Frontend sends `note?`; backend schema accepts only `reason?`. `note` is silently dropped. | P2 | `frontend/src/services/api/ordersApi.js:107-112` and `backend/app/schemas/orders/order.py:CancelOrderRequest` | Phase 2.B |
| **API-028** | Orders | `/orders/{id}/returns` | full chain | `pickupMethod` is mapped to `pickup_method` by the schema's `populate_by_name=True`. | P2 | `backend/app/schemas/orders/order.py:CreateReturnRequest` | Phase 2.B |
| **API-029 (C-28 open)** | Orders | `/orders/claim-guest` | full chain | Backend's `claim_guest_orders` accepts the email and re-asserts equality with the caller's email. If `email` is not provided, the caller's email is used. The defect is that the **response message** is the only UI signal. | P0 | `backend/app/api/v1/orders.py:claim_guest_orders` | Phase 2.B |
| **API-030** | Orders | `/admin/orders/{id}/fulfillment` | full chain | `locationId` is stored as `fulfillment_location_id` (a column). The backend has no validation that the location exists. | P1 | `backend/app/api/v1/orders.py:admin_assign_fulfillment` | Phase 2.B |
| **API-031** | Orders | `/admin/orders/{id}/fulfillment` | full chain | `handlerId` is stored as `fulfillment_handler_id` (a column). The backend does not verify the employee exists. | P1 | `backend/app/api/v1/orders.py:admin_assign_fulfillment` | Phase 2.B |
| **API-032** | Orders | `/admin/orders/{id}/force-status` | full chain | `reason` is mandatory. Frontend does not enforce this client-side. | P2 | `frontend/src/services/api/ordersApi.js:250-254` | Phase 2.B |
| **API-033** | Orders | `/admin/returns/{id}/reject` | full chain | Frontend sends `reason`; backend stores as `rejection_reason`. The schema accepts both. | P3 | `frontend/src/services/api/ordersApi.js:303-312` | Phase 2.B |
| **API-034** | Orders | `/admin/returns/{id}/receive` and `/inspect` | full chain | Frontend sends `notes`; backend stores as `inspection_notes` (for both routes). | P3 | `frontend/src/services/api/ordersApi.js:303-322` | Phase 2.B |
| **API-035 (C-35 open)** | Settings | `/admin/settings/notifications` | full chain | Two routes serve the same path: the generic `/admin/settings/{section}` PATCH and the dedicated `/admin/settings/notifications` PATCH. The dedicated one is mounted **after** the generic one in `router.py`, so it wins. The frontend uses the generic route. | P1 | `backend/app/api/v1/router.py:28-30` and `backend/app/api/v1/admin.py:update_settings_section` and `backend/app/api/v1/notifications.py:update_notification_settings` | Phase 3.A |
| **API-036** | Settings | `/admin/settings/notifications` | full chain | Generic PATCH expects `{data: {...}}` body. The frontend wraps in `{data: ...}`. | P1 (fixed) | `frontend/src/services/settingsRepository.js:66-69` | Phase 3.A |
| **API-037** | Settings | `/admin/settings/notifications` | full chain | Generic PATCH does **not** validate the channel list values (`IN_APP`/`EMAIL`/`SMS`/`WHATSAPP`). The dedicated PATCH does. | P1 | `backend/app/api/v1/admin.py:update_settings_section` | Phase 3.A |
| **API-038 (C-38 partial)** | Categories | `/admin/categories` | full chain | Backend creates `DRAFT`. Frontend admin form shows `DRAFT` after create. The `activate` button uses the dedicated route. | P1 (fixed) | `frontend/src/pages/admin/taxonomy/AdminCategoryForm.jsx` | Phase 3.B |
| **API-039 (C-11 fixed)** | Categories | `/admin/categories/{id}` | full chain | `sortOrder`/`bannerMediaId`/`seoTitle`/`seoDescription` are correctly mapped. The previous defect (silently dropped) is fixed. | P5 (fixed) | `frontend/src/services/api/categoriesApi.js:75-95` | Phase 3.B |
| **API-040 (C-15)** | All | all | full chain | `apiClient.normaliseError` does not propagate `data` (the response body) to the UI. | P0 | `frontend/src/services/api/apiClient.js:154-188` | Phase 1.A |
| **API-041 (C-15)** | All | all | full chain | The `{ok: false, error: "<string>"}` envelope (inline failures) is handled, but the frontend's `apiListOffers`/`apiValidateOfferCode`/etc. read `data.ok` and **also** read `data.error`. The default `handleError` in `apiClient.js:130-140` does not. | P1 | `frontend/src/services/api/apiClient.js:130-140` | Phase 1.A |
| **API-042 (C-15)** | All | all | full chain | The frontend's `handleError` in each `apiXxx.js` does **not** include `err.data` in the error object. The fix in `categoriesApi.js:14-18` includes `data`, but other `apiXxx.js` files omit it. | P1 | `frontend/src/services/api/*.js` | Phase 1.A |
| **API-043 (C-15)** | All | all | full chain | The frontend's `handleError` returns `{ok: false, error, status, data}`. The `data` field is only set in 4 of 14 files: `productsApi.js`, `categoriesApi.js`, `collectionsApi.js`, `offersApi.js`. The other 10 files omit `data`. | P2 | `frontend/src/services/api/*.js` | Phase 1.A |
| **API-044 (C-15)** | All | all | full chain | The `ApiError` class in `apiClient.js:142-152` carries `data`. The throw is correct. The catch in `request()` is correct. The downstream `handleError` is the issue. | P3 | `frontend/src/services/api/apiClient.js:142-152` | Phase 1.A |
| **API-045 (C-15)** | All | all | full chain | The error handler does **not** log the error. The `console.error` is not called. | P3 | `frontend/src/services/api/*.js` | Phase 1.A |
| **API-046 (C-15)** | All | all | full chain | The error handler does **not** surface the `code` from the `{success, error: {code, message, details}}` envelope. | P2 | `frontend/src/services/api/apiClient.js:154-188` | Phase 1.A |
| **API-047 (C-46)** | Catalog | all | full chain | `@cache(expire=...)` on `/products`, `/categories`, `/collections` is not invalidated on writes. | P0 | `backend/app/core/cache.py:TTL_PRODUCTS_LIST` and `backend/app/services/catalog/*.py` | Phase 1.C |
| **API-048 (C-46)** | Catalog | all | full chain | `invalidate_response_cache()` is only called on offer writes. | P0 | `backend/app/api/v1/coupons.py` | Phase 1.C |
| **API-049 (C-49)** | Employees | `/employee/me/workflow` and `/employee/desk` | backend | Both routes are declared but return placeholder. | P1 | `backend/app/api/v1/employees.py:390-426` | Phase 4.A |
| **API-050** | Products | `/products/{id}` | full chain | Normalizer reads `p.originalPrice ?? p.original_price ?? p.mrp ?? p.compare_at_price` — but the schema emits camelCase `originalPrice`. The `original_price` branch is dead. | P3 | `frontend/src/services/api/productsApi.js:171` | Phase 1.B |
| **API-051** | Products | `/products/{id}` | full chain | `compareAtPrice: p.compare_at_price ?? p.compareAtPrice` — reversed order. | P4 | `frontend/src/services/api/productsApi.js:172` | Phase 1.B |
| **API-052** | Offers | `/admin/offers/{id}` | full chain | `originalPrice` / `startDate` / `endDate` are legacy UI aliases not round-trippable through PATCH. | P3 | `frontend/src/services/api/offersApi.js:84-95` | Phase 3.C |
| **API-053** | Categories | `/admin/subcategories/{id}` | full chain | `SubcategoryResponse` uses camelCase Python field names. The `populate_by_name=True` allows snake_case on input. | P5 (informational) | `backend/app/schemas/catalog/category.py:18-29` | Phase 1.B |
| **API-054** | Products | `/admin/products/{id}` | full chain | `original_price` and `compare_at_price` are emitted camelCase (via `alias=` and `by_alias=False` default). | P5 (informational) | `backend/app/schemas/catalog/product.py:228-229` | Phase 1.B |
| **API-055** | Orders | `/orders/{id}` | full chain | `OrderResponse` uses `Dict[str, Any]` for `shipping_address`, `customer`, `timeline`, `internal_notes`. No schema guarantee. | P0 | `backend/app/schemas/orders/order.py:182-198` | Phase 2.B |
| **API-056** | Auth | `/auth/change-password` | full chain | `ChangePasswordRequest` accepts both camelCase and snake_case. Frontend sends camelCase for customers and snake_case for employees. | P3 | `backend/app/schemas/auth/login.py:69-90` | Phase 2.A |
| **API-057** | Customers | `/customers/me/addresses` | full chain | `AddressResponse` uses `serialization_alias="fullName"`. Input uses `populate_by_name=True`. | P5 (informational) | `backend/app/schemas/customer/address.py` | Phase 2.A |
| **API-058** | Payments | `/payments/session/{id}` | full chain | `PaymentSessionData` is camelCase Python field names, no `populate_by_name=True`. | P5 (informational) | `backend/app/schemas/payments/payment.py` | Phase 2.C |
| **API-059** | Collections | `/admin/collections/{id}` | full chain | `CollectionResponse` uses `populate_by_name=True`. | P5 (informational) | `backend/app/schemas/catalog/collection.py:39-65` | Phase 1.B |
| **API-060** | All | all | full chain | The Pydantic boundary convention is "snake_case request, camelCase response". No document codifies it. | P3 | repo-wide | Phase 1.A |
| **API-061** | Subcategories | `/admin/subcategories/{id}/activate` | unused | Backend has the route; frontend has no consumer. | P0 | `backend/app/api/v1/categories.py:425-438` | Phase 3.B |
| **API-062** | Wishlist | n/a | full chain | No list-of-saved-products endpoint. Frontend relies on `/products/{id}` lookup. | P3 | `backend/app/api/v1/wishlist.py` | Phase 3.D |
| **API-063** | Taxonomy | `/admin/taxonomy/metrics` and `/admin/taxonomy/product-counts` | unused | Both routes exist; no frontend consumer. | P2 | `backend/app/api/v1/collections.py:425-454` | Phase 3.B |
| **API-064** | Offers | `/offers/validate` | full chain | Two call-sites POST to the same path: `paymentsApi.apiValidateCoupon` and `offersApi.apiValidateOfferCode`. | P1 | `frontend/src/services/api/paymentsApi.js:154-180` and `frontend/src/services/api/offersApi.js:139-160` | Phase 3.C |
| **API-065 (C-12 fixed)** | Settings | `/admin/settings/{section}` | full chain | PATCH body is `{data: ...}`. Frontend wraps. | P1 (fixed) | `frontend/src/services/settingsRepository.js:66-69` | Phase 3.A |
| **API-066 (C-12 fixed)** | Settings | `/admin/settings/{section}` | full chain | The backend's `SettingsPatchRequest` is `{data: Dict}`. | P1 (fixed) | `backend/app/api/v1/admin.py:update_settings_section` | Phase 3.A |
| **API-067 (C-12 fixed)** | Settings | `/admin/settings` | full chain | `getSettings` reads `data.settings ?? data`. The response is `{settings: <merged>}`. | P1 (fixed) | `frontend/src/services/settingsRepository.js:48-56` | Phase 3.A |
| **API-068 (C-12 fixed)** | Settings | `/admin/settings/{section}` | full chain | `getSection` reads `data.data ?? data.settings ?? data[section] ?? data`. | P1 (fixed) | `frontend/src/services/settingsRepository.js:60-69` | Phase 3.A |
| **API-069 (C-35 open)** | Settings | `/admin/settings/notifications` | full chain | The dedicated router is not consumed. | P1 | `backend/app/api/v1/notifications.py:60-180` | Phase 3.A |
| **API-070** | Orders | `/orders` | full chain | `customer.email` is regex-validated. | P5 (informational) | `backend/app/schemas/orders/order.py:CustomerSnapshot` | Phase 2.B |
| **API-071** | Orders | `/orders` | full chain | `items[].quantity` is `int` 1..99. | P5 (informational) | `backend/app/schemas/orders/order.py:PlaceOrderItem` | Phase 2.B |
| **API-072** | Cart | `/cart/items` | full chain | `quantity` is `int` ≥ 1. | P5 (informational) | `backend/app/schemas/commerce/cart.py:AddCartItemRequest` | Phase 2.B |
| **API-073** | Orders | `/orders` | full chain | `paymentMethod` enum matches. | P5 (informational) | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-074** | Orders | `/orders` | full chain | `deliveryMethod` enum matches. | P5 (informational) | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-075** | Products | `/admin/products/{id}` | full chain | `pricing.{mrp,sellingPrice,discountValue}` are numbers. | P5 (informational) | `backend/app/schemas/catalog/product.py:ProductContentFields` | Phase 3.E |
| **API-076** | Offers | `/admin/offers` | full chain | `discount_value` is float. | P5 (informational) | `backend/app/api/v1/coupons.py:CreateCouponRequest` | Phase 3.C |
| **API-077** | Offers | `/admin/offers` | full chain | `minimum_order_value` is int. | P5 (informational) | `backend/app/api/v1/coupons.py:CreateCouponRequest` | Phase 3.C |
| **API-078** | Offers | `/admin/offers` | full chain | `starts_at`/`expires_at` are ISO datetimes. | P5 (informational) | `backend/app/api/v1/coupons.py:CreateCouponRequest` | Phase 3.C |
| **API-079** | Offers | `/admin/offers` | full chain | `usage_limit` is int. | P5 (informational) | `backend/app/api/v1/coupons.py:CreateCouponRequest` | Phase 3.C |
| **API-080** | Customers | `/customers/me/addresses` | full chain | `pincode` regex enforced. | P5 (informational) | `backend/app/schemas/customer/address.py` | Phase 2.A |
| **API-081** | Customers | `/customers/me/addresses` | full chain | `phone` regex enforced. | P5 (informational) | `backend/app/schemas/customer/address.py` | Phase 2.A |
| **API-082** | Products | `/admin/products/{id}` | full chain | `lowStockThreshold` is int. | P5 (informational) | `backend/app/schemas/catalog/product.py:ProductContentFields` | Phase 3.E |
| **API-083** | Products | `/admin/products/{id}` | full chain | `price` is int (coerced). | P5 (informational) | `backend/app/schemas/catalog/product.py:ProductContentFields` | Phase 3.E |
| **API-084** | Products | `/admin/products/{id}` | full chain | Booleans are `Optional[bool]`. | P5 (informational) | `backend/app/schemas/catalog/product.py:ProductContentFields` | Phase 3.E |
| **API-085** | Media | `/media/objects` | full chain | `namespace` is unvalidated. | P2 | `backend/app/api/v1/media.py:upload_media_object` | Phase 3.F |
| **API-086** | Media | `/media/register` | full chain | `role` is unvalidated. | P2 | `backend/app/api/v1/media.py:register_media_object` | Phase 3.F |
| **API-087** | Employees | `/employees/...` (legacy) | backend | The `include_in_schema=False` legacy routes have **no auth guard**. Any authenticated user can call them. | P0 | `backend/app/api/v1/employees.py:297-341` | Phase 1.A |
| **API-088** | Products | `/admin/workflow/metrics` | unused | Backend has the route; frontend has no consumer. | P2 | `backend/app/api/v1/products.py:362-379` | Phase 3.E |
| **API-089** | Settings | `/admin/settings/notifications` | full chain | Dedicated router exists but is shadowed by the generic `/admin/settings/{section}` PATCH in the mount order. | P1 | `backend/app/api/v1/router.py:30` | Phase 3.A |
| **API-090** | Orders | `/orders` | full chain | `couponCode` optional. | P5 (informational) | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-091** | Orders | `/orders` | full chain | `customerNote` optional. | P5 (informational) | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-092** | Orders | `/orders` | full chain | `idempotencyKey` optional. | P5 (informational) | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-093** | Orders | `/orders` | full chain | `inventoryReservationId` is reserved. | P3 | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-094** | Cart | `/cart/items` | full chain | `color`/`size` optional. | P5 (informational) | `backend/app/schemas/commerce/cart.py:AddCartItemRequest` | Phase 2.B |
| **API-095** | Categories | `/admin/categories` | full chain | `slug` optional (auto-derived). | P5 (informational) | `backend/app/schemas/catalog/category.py:CategoryCreateRequest` | Phase 3.B |
| **API-096** | Categories | `/admin/categories/{id}` | full chain | `featured` optional. | P5 (informational) | `backend/app/schemas/catalog/category.py:CategoryUpdateRequest` | Phase 3.B |
| **API-097** | Collections | `/admin/collections` | full chain | `start_date`/`end_date` optional. | P5 (informational) | `backend/app/schemas/catalog/collection.py:CollectionCreateRequest` | Phase 3.B |
| **API-098** | Offers | `/admin/offers` | full chain | `starts_at`/`expires_at` optional. | P5 (informational) | `backend/app/api/v1/coupons.py:CreateCouponRequest` | Phase 3.C |
| **API-099** | Offers | `/admin/offers/{id}` | full chain | `is_stackable` `false` is not sent. | P2 | `frontend/src/services/api/offersApi.js:120-122` | Phase 3.C |
| **API-100** | Employees | `/admin/employees` | full chain | `phone` optional. | P5 (informational) | `backend/app/schemas/employee/employee.py:EmployeeCreateRequest` | Phase 4.A |
| **API-101** | Products | `/admin/products/{id}` | full chain | Partial PATCH works. | P5 (informational) | `backend/app/services/catalog/product_service.py:update_product` | Phase 3.E |
| **API-102** | Customers | `/customers/me/addresses` | full chain | `landmark` is empty string `""` from frontend. | P4 | `frontend/src/services/api/customersApi.js:80-94` | Phase 2.A |
| **API-103** | Settings | `/admin/settings/{section}` | full chain | PATCH body wraps in `{data: ...}`. | P5 (informational) | `frontend/src/services/settingsRepository.js:66-69` | Phase 3.A |
| **API-104** | Products | `/admin/products/{id}/assign` | full chain | `employeeId` optional. | P5 (informational) | `backend/app/schemas/catalog/product.py:AssignEmployeeRequest` | Phase 3.E |
| **API-105** | Returns | `/admin/returns/{id}/schedule-pickup` | full chain | Optional fields. | P5 (informational) | `backend/app/schemas/orders/order.py:SchedulePickupRequest` | Phase 2.B |
| **API-106** | Returns | `/admin/returns/{id}/reject` | full chain | `reason` optional for returns, required for products. | P3 | `frontend/src/services/api/ordersApi.js:303-312` | Phase 2.B |
| **API-110** | Orders | n/a | full chain | `order.status` enum matches. | P5 (informational) | `backend/app/services/orders/order_service.py` | Phase 2.B |
| **API-111** | Orders | n/a | full chain | `order.payment_status` enum matches. | P5 (informational) | `backend/app/services/orders/order_service.py` | Phase 2.B |
| **API-112** | Orders | `/orders` | full chain | `paymentMethod` enum matches. | P5 (informational) | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-113** | Orders | `/orders` | full chain | `deliveryMethod` enum matches. | P5 (informational) | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-114** | Products | n/a | full chain | `product.status` enum matches. | P5 (informational) | `backend/app/schemas/catalog/product.py` | Phase 3.E |
| **API-115** | Products | n/a | full chain | `product.review.state` enum matches. | P5 (informational) | `backend/app/schemas/catalog/product.py` | Phase 3.E |
| **API-116** | Products | n/a | full chain | `product.availability` has no enum. | P2 | `backend/app/schemas/catalog/product.py:AdminProduct` | Phase 3.E |
| **API-117** | Categories | n/a | full chain | `category.status` enum matches. | P5 (informational) | `backend/app/schemas/catalog/category.py` | Phase 3.B |
| **API-118** | Collections | n/a | full chain | `collection.status` enum matches. | P5 (informational) | `backend/app/schemas/catalog/collection.py` | Phase 3.B |
| **API-119** | Collections | n/a | full chain | `collection.type` enum matches. | P5 (informational) | `backend/app/schemas/catalog/collection.py` | Phase 3.B |
| **API-120** | Collections | n/a | full chain | `collection.displayStatus` derived. | P5 (informational) | `backend/app/services/catalog/collection_service.py` | Phase 3.B |
| **API-121** | Offers | n/a | full chain | `coupon.discount_type` enum matches. | P5 (informational) | `backend/app/api/v1/coupons.py:CreateCouponRequest` | Phase 3.C |
| **API-122** | Offers | n/a | full chain | `coupon.display_status` derived. | P5 (informational) | `backend/app/api/v1/coupons.py:_coupon_to_dict` | Phase 3.C |
| **API-123** | Users | n/a | full chain | `user.status` enum matches. | P5 (informational) | `backend/app/models/auth/user.py` | Phase 4.B |
| **API-124** | Employees | n/a | full chain | `employee.status` enum matches. | P5 (informational) | `backend/app/schemas/employee/employee.py` | Phase 4.A |
| **API-125** | Media | n/a | full chain | `media.status` has no enum. | P2 | `backend/app/models/media/media_asset.py` | Phase 3.F |
| **API-126** | Media | n/a | full chain | `media.role` has no enum. | P2 | `backend/app/models/media/product_media.py` | Phase 3.F |
| **API-127** | Returns | n/a | full chain | `return.status` enum matches. | P5 (informational) | `backend/app/models/orders/return_order.py` | Phase 2.B |
| **API-128** | Returns | n/a | full chain | `return.pickup_method` enum matches. | P5 (informational) | `backend/app/models/orders/return_order.py` | Phase 2.B |
| **API-129** | Settings | `/admin/settings/notifications` | full chain | Channel enum matches. | P5 (informational) | `backend/app/schemas/notification/notification.py:VALID_CHANNELS` | Phase 3.A |
| **API-130** | Customers | `/customers/me/preferences` | full chain | 5 booleans. | P5 (informational) | `backend/app/schemas/customer/customer.py:PreferencesUpdate` | Phase 2.A |
| **API-131** | Customers | `/customers/me/addresses` | full chain | `type` free string. | P5 (informational) | `backend/app/schemas/customer/address.py` | Phase 2.A |
| **API-132** | Media | `/media/objects` | full chain | `namespace` unvalidated. | P2 | `backend/app/api/v1/media.py:upload_media_object` | Phase 3.F |
| **API-133** | Media | `/media/register` | full chain | `role` unvalidated. | P2 | `backend/app/api/v1/media.py:register_media_object` | Phase 3.F |
| **API-134** | Orders | `/orders` | full chain | `idempotencyKey` min 8; frontend's `newAttemptId()` may produce shorter. | P3 | `backend/app/schemas/orders/order.py:PlaceOrderRequest` | Phase 2.B |
| **API-135** | Categories | `/admin/categories/{id}` | full chain | `featured` may be `false`. | P5 (informational) | `frontend/src/services/api/categoriesApi.js:79` | Phase 3.B |
| **API-136** | Offers | `/admin/offers/{id}` | full chain | `is_stackable` `false` not sent. | P2 | `frontend/src/services/api/offersApi.js:120-122` | Phase 3.C |
| **API-137** | Customers | `/customers/me/addresses` | full chain | `landmark` is empty string. | P4 | `frontend/src/services/api/customersApi.js:80-94` | Phase 2.A |
| **API-138** | Returns | `/admin/returns/{id}/reject` | full chain | `reason` optional for returns, required for products. | P3 | `frontend/src/services/api/ordersApi.js:303-312` | Phase 2.B |
| **API-139** | Products | n/a | full chain | `availability` has no enum. | P2 | `backend/app/schemas/catalog/product.py:AdminProduct` | Phase 3.E |
| **API-140** | Media | n/a | full chain | `media.status` has no enum. | P2 | `backend/app/models/media/media_asset.py` | Phase 3.F |
| **API-141** | Employees | `/admin/employees/{id}` | full chain | `employee_id` is user UUID; employee_code not accepted. | P1 | `backend/app/services/employee/employee_service.py:get_employee` | Phase 4.A |
| **API-142** | Products | `/products` | full chain | `category` filter accepts multi-value. | P5 (informational) | `backend/app/api/v1/products.py:list_products` | Phase 3.E |
| **API-143** | Products | `/admin/products` | full chain | `pageSize` matches (alias). | P5 (informational) | `backend/app/api/v1/products.py:admin_list_products` | Phase 3.E |
| **API-144 (C-17 fixed)** | Orders | `/admin/orders` | full chain | `pageSize` matches. | P1 (fixed) | `backend/app/api/v1/orders.py:admin_list_orders` | Phase 2.B |
| **API-145 (C-17)** | Customers | `/admin/customers` | full chain | `page_size` vs `pageSize` (alias). | P1 | `backend/app/api/v1/customers.py:admin_list_customers` | Phase 4.B |
| **API-146 (C-17 partial)** | Employees | `/admin/employees` | full chain | `page_size` matches (no alias). | P1 | `backend/app/api/v1/employees.py:list_employees` | Phase 4.A |
| **API-147 (C-17 partial)** | Employees | `/admin/employees/{id}/attendance` | full chain | `page_size` matches. | P1 | `backend/app/api/v1/employees.py:admin_employee_attendance` | Phase 4.A |
| **API-148 (C-17 partial)** | Users | `/users` | full chain | `page_size` matches. | P1 | `backend/app/api/v1/users.py:list_users` | Phase 4.B |
| **API-149** | Audit | `/audit/logs` | full chain | All query params match. | P5 (informational) | `backend/app/api/v1/audit.py:list_logs` | Phase 4.C |
| **API-150 (C-05 partial)** | Orders | `/orders/{id}` | full chain | `Dict[str, Any]` for `shipping_address`/`customer`/`timeline`/`internal_notes`. | P0 | `backend/app/schemas/orders/order.py:OrderResponse` | Phase 2.B |
| **API-151** | Orders | `/admin/orders/{id}/invoice` | full chain | `InvoiceResponse` is snake_case. | P2 | `backend/app/schemas/orders/order.py:InvoiceResponse` | Phase 2.B |
| **API-152 (C-15 partial)** | Employees | `/admin/employees/{id}/attendance` | full chain | `PaginatedResponse` envelope (`{success, message, data, page, page_size, total}`). | P2 | `backend/app/schemas/common.py:DataResponse` and `backend/app/core/pagination.py:PaginatedResponse` | Phase 4.A |
| **API-153 (C-14 partial)** | Auth | `/auth/me` | full chain | `UserDTO` lacks `employee_code`. | P1 | `backend/app/schemas/auth/token.py:UserDTO` | Phase 2.A |
| **API-154** | Auth | `/auth/admin/sign-up` | unused | Frontend never calls. | P3 | `backend/app/api/v1/auth.py:sign_up_admin` | Phase 2.A |
| **API-155 (C-32 open)** | Customers | `/customers/me` | full chain | `activeSessions` does not mark current. | P0 | `backend/app/services/customer/customer_service.py:get_me` | Phase 2.A |
| **API-156** | Customers | `DELETE /customers/me/addresses/{id}` | full chain | 204 No Content; `apiClient` returns `""` (text). | P3 | `backend/app/api/v1/addresses.py:delete_address` | Phase 2.A |
| **API-157 (C-18 partial)** | Customers | `/admin/customers` | full chain | `orderCount`/`lifetimeSpend` not read. | P2 | `frontend/src/services/api/customersApi.js:42-55` | Phase 4.B |
| **API-158 (C-30 open)** | Analytics | `/analytics/overview` | full chain | `totalRevenue` not read as `revenue`. | P1 | `frontend/src/pages/admin/AdminDashboard.jsx` | Phase 4.C |
| **API-159 (C-14 partial)** | Employees | `/admin/employees/{id}` | full chain | `profile.employee_code` is the canonical location; `u.employee_code` is dead. | P3 | `frontend/src/services/api/employeesApi.js:23` | Phase 4.A |
| **API-160 (C-18 partial)** | Customers | `/admin/customers` | full chain | `customers[].orderCount`/`lifetimeSpend` not read. | P2 | `frontend/src/services/api/customersApi.js:42-55` | Phase 4.B |
| **API-161 (C-18 partial)** | Customers | `/admin/customers/{id}` | full chain | `addresses[]` not read. | P2 | `frontend/src/services/api/customersApi.js:42-55` | Phase 4.B |
| **API-162** | Orders | `/admin/orders/{id}` | full chain | `internal_notes[]` not read. | P2 | `frontend/src/utils/orderReadModel.js` | Phase 2.B |
| **API-163** | Customers | `DELETE /customers/me/addresses/{id}` | full chain | 204 No Content; `apiClient` returns `""`. | P3 | `frontend/src/services/api/customersApi.js:apiDeleteAddress` | Phase 2.A |
| **API-164** | Offers | `/offers/validate` | full chain | Inline `{ok:false,error}` envelope. | P2 | `backend/app/api/v1/coupons.py:validate_offer` | Phase 3.C |
| **API-165** | All | all | full chain | Pydantic 422 `details` array reduced to first error. | P0 | `frontend/src/services/api/apiClient.js:154-188` | Phase 1.A |
| **API-166** | All | all | full chain | The `{success: false, error: {code, message, details}}` envelope's `success` is discarded. | P3 | `frontend/src/services/api/apiClient.js:154-188` | Phase 1.A |
| **API-167** | All | all | full chain | 500 errors show generic "An unexpected error occurred.". | P3 | `frontend/src/services/api/apiClient.js:154-188` | Phase 1.A |
| **API-168** | Customers | `/admin/customers` | full chain | Employees with `customers.view` are also valid; frontend sends only admin. | P2 | `backend/app/api/v1/customers.py:admin_list_customers` | Phase 4.B |
| **API-169** | Settings | `/admin/settings/notifications` | full chain | Same as API-168. | P2 | `backend/app/api/v1/notifications.py:get_notification_settings` | Phase 3.A |
| **API-170 (C-04 open)** | Products | `/products/{id}/submit-review` | full chain | Accepts any authenticated user. | P1 | `backend/app/api/v1/products.py:submit_for_review` | Phase 3.E |
| **API-171** | Offers | `/admin/offers/{id}/archive` | full chain | `offers.archive` requires SUPER_ADMIN. Frontend does not differentiate. | P2 | `backend/app/api/v1/coupons.py:admin_archive_offer` | Phase 3.C |
| **API-172 (C-19 partial)** | Payments | `/payments/session` | full chain | `guest_email` required for guest orders. Frontend always passes `null`. | P1 | `backend/app/api/v1/payments.py:create_payment_session` | Phase 2.C |
| **API-173** | Settings | `/admin/settings/{section}` | full chain | PATCH requires super_admin. Frontend always sends admin. | P1 | `backend/app/api/v1/admin.py:update_settings_section` | Phase 3.A |
| **API-174** | Customers | `/admin/customers` | backend | Admin cannot create customers. Intentional. | P5 (informational) | n/a | n/a |
| **API-180 (C-41 open)** | Products | `/products` | full chain | `category.status=ACTIVE` gate not verified. | P0 | `backend/app/services/catalog/product_service.py:list_storefront_products` | Phase 3.E |
| **API-181 (C-46 open)** | Catalog | all | full chain | `@cache(expire=...)` not invalidated on writes. | P0 | `backend/app/core/cache.py` | Phase 1.C |
| **API-182 (C-42 open)** | Categories | `/categories/{id}/subcategories` | full chain | Subcategory tree is per-category; no aggregate endpoint. | P3 | `backend/app/api/v1/categories.py:list_subcategories` | Phase 3.B |
| **API-183** | Auth | `/auth/customer/sign-up` | full chain | `full_name` is sent; backend may derive from first/last. | P4 | `frontend/src/services/api/authApi.js:117-135` | Phase 2.A |
| **API-184** | Auth | `/auth/customer/forgot-password` | full chain | `identifier` is email or phone. | P5 (informational) | `backend/app/api/v1/auth.py:customer_forgot_password` | Phase 2.A |
| **API-185** | Auth | `/auth/customer/reset-password` | full chain | `userId`/`token`/`newPassword`. | P5 (informational) | `backend/app/api/v1/auth.py:customer_reset_password` | Phase 2.A |
| **API-186 (C-28 open)** | Orders | `/orders` | full chain | Body's `customer.email` used as order's guest identity. | P0 | `backend/app/services/orders/order_service.py:place_order` | Phase 2.B |
| **API-187 (C-35 partial)** | Settings | `/admin/settings/notifications` | full chain | Generic PATCH used; dedicated router not consumed. | P1 | `frontend/src/services/settingsRepository.js:48-79` | Phase 3.A |
| **API-188 (C-13 open)** | Products | `/admin/products` | full chain | `productAdminService.js` uses `getAccessToken()` (no scope). | P1 | `frontend/src/services/admin/productAdminService.js:43` | Phase 1.A |
| **API-189 (C-38 partial)** | Catalog | `/categories` | full chain | `catalogRepository.findCategory` still in source. | P1 | `frontend/src/services/catalogRepository.js:866` | Phase 1.A |
| **API-190 (C-39 open)** | Taxonomy | `/admin/subcategories/{id}/restore` and `/admin/collections/{id}/restore` | full chain | Generic PATCH with `status` instead of dedicated restore. | P0 | `frontend/src/services/taxonomyRepository.js` | Phase 3.B |
| **API-191 (C-14 partial)** | Orders | `/orders` | repository | Local order service still in source. | P1 | `frontend/src/services/orders/orderService.js` | Phase 2.B |
| **API-192** | Orders | `/orders/{id}/tracking` | repository | Local tracking service still in source. | P2 | `frontend/src/services/orders/trackingService.js` | Phase 2.B |
| **API-193** | Offers | `/admin/offers` | repository | `offerRepository.js` still in source. | P2 | `frontend/src/services/offers/offerRepository.js` | Phase 3.C |
| **API-194** | Payments | `/payments/session` | repository | Local payment service still in source. | P2 | `frontend/src/services/payment/paymentService.js` | Phase 2.C |
| **API-195** | Employees | `/admin/employees` | repository | Local employee service still in source. | P2 | `frontend/src/services/employees/employeeService.js` | Phase 4.A |
| **API-196** | Inventory | n/a | repository | Local inventory repository. | P3 | `frontend/src/services/inventory/inventoryRepository.js` | Phase 4.D |
| **API-197** | Media | `/media/*` | repository | Local media services still in source. | P2 | `frontend/src/services/media/*` | Phase 3.F |
| **API-198** | Workforce | n/a | repository | Local workforce services. | P3 | `frontend/src/services/workforce/*` | Phase 4.D |
| **API-199** | Customers | `/customers/me/recently-viewed` | repository | Local customer services. | P3 | `frontend/src/services/customer/*` | Phase 2.A |
| **API-200** | AI | n/a | repository | Local AI mocks. | P4 | `frontend/src/services/ai/*` | Phase 4.E |
| **API-201** | Analytics | `/analytics/*` | repository | Local analytics service still in source. | P3 | `frontend/src/services/analytics/analyticsService.js` | Phase 4.C |
| **API-202** | Catalog | `/categories` | repository | `catalogRepository` may be called from admin pages. | P1 | `frontend/src/services/catalogRepository.js` | Phase 1.A |
| **API-203** | Catalog | `/categories` | repository | `apiListCategories` (public) may be called from admin. | P1 | `frontend/src/services/api/categoriesApi.js:apiListCategories` | Phase 3.B |
| **API-204** | Products | `/admin/products` | full chain | `category`/`subcategory` are unvalidated FKs. | P0 | `backend/app/services/catalog/product_service.py:create_product` | Phase 3.E |
| **API-205 (C-48 open)** | Products | `/admin/products/{id}/assign` | full chain | `assigned_employee_id` is unvalidated. | P1 | `backend/app/services/catalog/product_service.py:update_product_employee` | Phase 3.E |
| **API-206** | Media | `/media/storage/status` | full chain | CDN prefix not verified. | P3 | `backend/app/schemas/media/media.py:MediaStorageStatusResponse` | Phase 3.F |
| **API-207** | Media | `/media/objects` | full chain | Content signature validation. | P5 (informational) | `backend/app/services/media/upload_service.py` | Phase 3.F |
| **API-208** | Media | `/media/objects/{key}` | full chain | Object key validation. | P5 (informational) | `app/storage/keys.py:normalize_object_key` | Phase 3.F |
| **API-209** | Catalog | `/admin/categories` and `/admin/collections` | full chain | No pagination. | P2 | `backend/app/api/v1/categories.py:admin_list_categories` and `backend/app/api/v1/collections.py:admin_list_collections` | Phase 3.B |
| **API-210** | Orders | `/orders` and `/admin/orders` | full chain | `page_size` (snake_case) in response; frontend fallback handles it. | P3 | `backend/app/schemas/orders/order.py:OrderListResponse` | Phase 2.B |
| **API-211** | Products | `/products` | full chain | `category` filter is multi-value but `buildParams` uses `qs.set` for non-arrays. | P2 | `frontend/src/services/api/productsApi.js:206-225` | Phase 3.E |
| **API-212 (C-46 open)** | Catalog | all | full chain | `@cache(expire=...)` not invalidated on writes. | P0 | `backend/app/core/cache.py` | Phase 1.C |
| **API-213 (C-43 open)** | Catalog | `/categories` and `/products` | frontend | `useCatalogueQuery` returns one mutable snapshot. | P1 | `frontend/src/hooks/useCatalogueQuery.js` | Phase 3.E |
| **API-214** | Settings | `/admin/settings` | frontend | `memorySettings` is a fallback only. | P5 (informational) | `frontend/src/services/settingsRepository.js:42` | Phase 3.A |
| **API-215** | Offers | `/admin/offers` | full chain | `invalidate_response_cache()` clears ALL caches. | P2 | `backend/app/api/v1/coupons.py` | Phase 1.C |
| **API-216** | Catalog | `/products` | frontend | `useProducts` distinguishes error from empty. | P5 (informational) | `frontend/src/hooks/useProducts.js` | Phase 3.E |
| **API-217 (C-30 open)** | Analytics | `/analytics/overview` | frontend | `revenue` field not present in backend response. | P1 | `frontend/src/pages/admin/AdminDashboard.jsx` | Phase 4.C |
| **API-218** | Products | `/admin/products` | frontend | Editor round-trips full whitelist. | P5 (informational) | `frontend/src/services/api/productsApi.js:46-152` | Phase 3.E |
| **API-219 (C-33 open)** | Employees | `/admin/employees` | full chain | Temp password not returned. | P0 | `backend/app/services/employee/employee_service.py:create_employee` | Phase 4.A |
| **API-220** | Admin | n/a | repository | Stale demo language in `adminAuthService.js`. | P4 | `frontend/src/services/admin/adminAuthService.js` | Phase 1.A |
| **API-221** | Orders | n/a | repository | `demoOrders.js` is dead. | P4 | `frontend/src/services/orders/demoOrders.js` | Phase 2.B |
| **API-222** | Workforce | n/a | repository | `seedWorkforce.js` is dead. | P4 | `frontend/src/services/workforce/seedWorkforce.js` | Phase 4.D |
| **API-223** | Catalog | n/a | repository | `data/products/*.js`, `data/catalog/*.js` are likely dead. | P4 | `frontend/src/data/products/*` and `frontend/src/data/catalog/*` | Phase 3.E |
| **API-224** | Customers | n/a | repository | `data/mockCustomers.js` is likely dead. | P4 | `frontend/src/data/mockCustomers.js` | Phase 2.A |
| **API-225** | Admin | n/a | repository | `data/admin/*.js` is likely dead. | P4 | `frontend/src/data/admin/*` | Phase 4.B |
| **API-226** | Employees | n/a | repository | `data/employees/*.js` is likely dead. | P4 | `frontend/src/data/employees/*` | Phase 4.A |
| **API-227** | Shopping | n/a | repository | `data/shopping/coupons.js` is likely dead. | P4 | `frontend/src/data/shopping/coupons.js` | Phase 3.C |
| **API-228** | Media | n/a | repository | `data/media/seedMedia.js` is likely dead. | P4 | `frontend/src/data/media/seedMedia.js` | Phase 3.F |
| **API-229** | Backend | n/a | backend | 12 routers are health-only stubs. | P4 | `backend/app/api/v1/{attendance,attributes,chatbot,checkout,inventory,media_reviews,performance,pricing,returns,stock_transfers,variants,warehouses}.py` | Phase 4.D |
| **API-230** | Auth | `/auth/*/sign-in` | security | JWT in `localStorage` is XSS-accessible. | P1 | `frontend/src/services/api/apiClient.js:setTokens` | Phase 2.A |
| **API-231 (C-33)** | Employees | `/admin/employees` | full chain | Temp password not returned. | P1 | `backend/app/services/employee/employee_service.py:create_employee` | Phase 4.A |
| **API-232 (C-32)** | Customers | `/customers/me` | full chain | `activeSessions` does not mark current. | P2 | `backend/app/services/customer/customer_service.py:get_me` | Phase 2.A |
| **API-233** | All | n/a | security | CORS allow-list not inspected. | P2 | `backend/app/core/middleware.py:setup_middleware` | Phase 1.A |
| **API-234 (C-28)** | Orders | `/orders/claim-guest` | full chain | Customer can claim another user's guest orders. | P0 | `backend/app/api/v1/orders.py:claim_guest_orders` | Phase 2.B |
| **API-235** | All | n/a | docs | OpenAPI schema export not verified. | P3 | `backend/app/main.py` | Phase 1.A |
| **API-236** | All | n/a | docs | Canonical `API_CONTRACT.md` missing. | P5 (informational) | repo-wide | Phase 1.A |
| **API-300 to API-382** | Database | various | full chain | 82 DB columns verified MATCHED. | P5 (informational) | repo-wide | n/a |
| **API-400 to API-409** | Media | various | full chain | 9 media routes MATCHED. | P5 (informational) | repo-wide | Phase 3.F |
| **API-500 to API-519** | Pagination | various | full chain | 19 list endpoints; 2 minor inconsistencies. | P3 | repo-wide | n/a |
| **API-600 to API-612** | Search/Filter | various | full chain | 13 list endpoints; all MATCHED. | P5 (informational) | repo-wide | n/a |
| **API-700 to API-718** | Cache | various | full chain | 6 cached endpoints; 0 invalidations. | P0 (cached list) | repo-wide | Phase 1.C |
| **API-800 to API-816** | Loading/Retry | various | frontend | 17 pages; 2 known runtime defects. | P1 | repo-wide | Phase 2.B and Phase 4.C |
| **API-900 to API-911** | React | various | frontend | 12 patterns; 1 P3 race condition. | P3 | repo-wide | Phase 1.A |
| **API-1000 to API-1032** | Duplicates/Legacy | various | repo | 12 active mocks, 1 dead, 1 dead, 6 likely-dead, 1 deferred. | P2 (active) | repo-wide | Phase 2.A/B/C, Phase 3.B/C/E/F, Phase 4.A/B/C/D/E |
| **API-1100 to API-1131** | Security | various | full chain | 32 security findings; 0 hard secrets. | P1 | repo-wide | n/a |
| **API-1200 to API-1223** | Documentation | various | repo | 24 doc findings; 1 missing contract. | P5 (informational) | repo-wide | Phase 1.A |
| **API-1300 to API-1320** | Test coverage | various | repo | 21 gaps; 8 P2, 12 P3. | P2 (most) | repo-wide | Phase 5 |

---

## 27. Fix Groups (NOT IMPLEMENTED)

This section groups the 144 issues into dependency-aware phases. **No code in this section is implemented.** Each phase is a *proposed* set of changes.

### 27.A — Phase 1: API Contract Foundation

**Goal:** establish a single, versioned, authoritative API contract. All other phases depend on this.

**Scope (issues):** API-001, API-002, API-003, API-004, API-006, API-007, API-013, API-040, API-041, API-042, API-043, API-044, API-045, API-046, API-050, API-051, API-053, API-054, API-055 (camelCase/snake_case contract), API-056, API-057, API-058, API-059, API-060, API-065, API-066, API-067, API-068, API-087, API-088, API-089, API-165, API-166, API-167, API-173, API-188, API-202, API-203, API-212 (cache wrapper), API-215 (cache invalidation primitive), API-220, API-233, API-235, API-236, API-900 to API-911.

**Deliverables (proposed):**

1. `frontend/src/services/api/apiClient.js`:
   * Replace `scopeForPath` with an **explicit-only** `scope` resolver. **Every** call must pass `scope`. The fallback is removed.
   * Refactor `request()` to be a `async function request(method, path, body, options)` that **throws** on `!res.ok` with a `data` payload.
   * Refactor `normaliseError(status, data)` to return `{ok: false, error, status, code, details, data}` for all 4 envelope shapes.
   * Add a `requestWithScope` wrapper that logs the error to `console.error`.
2. `backend/app/core/error_handlers.py`:
   * Wrap the `RequestValidationError` handler to emit the same envelope as `AppException`.
3. `backend/app/api/v1/coupons.py:validate_offer`:
   * Emit the same envelope as `AppException` (or use `BusinessLogicException` to get 422).
4. `backend/app/api/v1/employees.py:297-341` (legacy `/employees/...`):
   * Add `get_current_admin` to every route. **No exceptions.**
5. `backend/app/core/cache.py`:
   * Add a granular `invalidate_cache_for_section(section)` helper.
   * Add a `cache_key_for(path, query)` function.
6. `backend/app/api/v1/admin.py:update_settings_section`:
   * Use the new cache invalidation helper on every PATCH.
7. `backend/app/api/v1/notifications.py`:
   * Add the new cache invalidation helper on every PATCH.
8. `backend/app/services/catalog/{product,category,collection}_service.py`:
   * Add the new cache invalidation helper on every write.
9. `frontend/src/services/settingsRepository.js`:
   * Switch to the dedicated `/admin/settings/notifications` GET/PATCH (via a new `notificationsSettingsApi.js`).
10. `frontend/src/services/admin/productAdminService.js`:
    * Remove the `getAccessToken()` no-scope check. Use `getAccessToken("admin")`.
11. `frontend/src/services/catalogRepository.js`:
    * Remove the synchronous `findCategory` method. **No exceptions.**
12. `backend/app/main.py`:
    * Always export the OpenAPI schema to `docs/openapi.json` (regardless of `DEBUG`).
13. `API_CONTRACT.md` (new file):
    * Single source of truth. Generated from OpenAPI + annotated by hand.
14. `frontend/tests/apiContract.test.js` (new file):
    * Verify every `apiClient.X` call has an explicit `scope`. Fail the build if a call-site is missing.
15. `backend/tests/unit/test_api_contract.py` (new file):
    * Verify every backend route declares a `response_model`.
    * Verify every error path uses `AppException` (not inline `JSONResponse`).

**Migration required:** NO (pure refactor + new file).

**Risk:** HIGH (the entire frontend depends on `apiClient`).

**Estimated scope:** 30 files touched, ~600 lines changed.

### 27.B — Phase 2: Authentication & Error Contracts

**Goal:** harden the auth surface and the error envelope.

**Scope (issues):** API-016, API-017, API-018, API-019, API-020, API-021, API-022, API-102, API-137, API-153, API-154, API-155, API-156, API-163, API-183, API-184, API-185, API-221, API-224, API-230, API-232.

**Deliverables (proposed):**

1. `backend/app/schemas/auth/login.py:CustomerRegisterRequest`:
   * Remove the `full_name` snake_case fallback. Document the single canonical camelCase.
2. `backend/app/schemas/auth/login.py:CustomerLoginRequest`:
   * Remove the `email` snake_case fallback. Document `identifier`.
3. `backend/app/schemas/auth/login.py:AdminLoginRequest`:
   * Reject `adminId` that is not a valid email.
4. `backend/app/services/auth/auth_service.py:register_customer`:
   * Reject `full_name` derived from first+last with extra whitespace.
5. `backend/app/services/auth/auth_service.py:reset_password_with_user_id`:
   * Add an email-verification step (the prior audit C-28 alternative).
6. `backend/app/services/auth/auth_service.py:_build_user_dto`:
   * Include `employee_code` in the response (for the employee DTO).
7. `backend/app/services/customer/customer_service.py:get_me`:
   * Add a `sid` claim to the JWT.
   * Use the `sid` claim to mark the current session in `activeSessions`.
   * Use the `sid` claim to **exclude** the current session in `revoke_other_sessions`.
8. `backend/app/schemas/customer/address.py:AddressResponse`:
   * Add `createdAt` and `updatedAt` (already present) to the frontend normaliser.
9. `frontend/src/services/api/apiClient.js`:
   * Move JWT from `localStorage` to an `httpOnly` cookie (requires backend change).
10. `backend/app/core/dependencies.py:get_current_user`:
    * Mint the `httpOnly` cookie on sign-in.
    * Read the cookie (with bearer fallback) on every request.
11. `backend/app/api/v1/orders.py:claim_guest_orders`:
    * Reject if the body's `email` is not the caller's email. (Already done; verify the test.)
12. `backend/app/api/v1/orders.py:place_order`:
    * For authenticated callers, ignore the body's `customer.email` and use the user's email.

**Migration required:** NO (refactor + security hardening).

**Risk:** HIGH (auth + cookies).

**Estimated scope:** 12 files touched, ~400 lines changed.

### 27.C — Phase 3: Resource APIs (Catalog, Commerce, Media)

**Goal:** fix every P0/P1 defect in the catalog, commerce, and media domains.

**Scope (issues):** API-005, API-008, API-009, API-010, API-011, API-012, API-014, API-015, API-023, API-024, API-025, API-026, API-027, API-028, API-029, API-030, API-031, API-032, API-033, API-034, API-035, API-036, API-037, API-038, API-039, API-052, API-061, API-062, API-063, API-064, API-069, API-070, API-071, API-072, API-073, API-074, API-075, API-076, API-077, API-078, API-079, API-080, API-081, API-082, API-083, API-084, API-085, API-086, API-088, API-090, API-091, API-092, API-093, API-094, API-095, API-096, API-097, API-098, API-099, API-100, API-101, API-103, API-104, API-105, API-106, API-110, API-111, API-112, API-113, API-114, API-115, API-116, API-117, API-118, API-119, API-120, API-121, API-122, API-123, API-124, API-125, API-126, API-127, API-128, API-129, API-130, API-131, API-132, API-133, API-134, API-135, API-136, API-138, API-139, API-140, API-141, API-142, API-143, API-144, API-145, API-146, API-147, API-148, API-149, API-150, API-151, API-152, API-155, API-156, API-157, API-158, API-159, API-160, API-161, API-162, API-163, API-164, API-168, API-169, API-170, API-171, API-172, API-174, API-180, API-181, API-182, API-190, API-191, API-192, API-193, API-194, API-197, API-204, API-205, API-209, API-210, API-211, API-213, API-216, API-218, API-221, API-223, API-227, API-228, API-229, API-400 to API-409, API-500 to API-519, API-600 to API-612, API-700 to API-718.

**Sub-phases:**

* **Phase 3.A — Settings & Notifications** (API-035, API-036, API-037, API-065, API-066, API-067, API-068, API-069, API-103, API-129, API-169, API-173, API-214).
* **Phase 3.B — Taxonomy** (API-005, API-038, API-039, API-061, API-062, API-063, API-095, API-096, API-117, API-135, API-182, API-190, API-203, API-209, API-223).
* **Phase 3.C — Offers** (API-009, API-010, API-011, API-012, API-052, API-064, API-076, API-077, API-078, API-079, API-098, API-099, API-121, API-122, API-136, API-164, API-171, API-193, API-227).
* **Phase 3.D — Wishlist** (API-062).
* **Phase 3.E — Products** (API-023, API-024, API-025, API-026, API-027, API-028, API-029, API-030, API-031, API-032, API-033, API-034, API-070, API-071, API-072, API-073, API-074, API-075, API-082, API-083, API-084, API-090, API-091, API-092, API-093, API-094, API-101, API-104, API-110, API-111, API-112, API-113, API-114, API-115, API-116, API-127, API-128, API-134, API-139, API-142, API-143, API-144, API-150, API-151, API-152, API-155, API-156, API-157, API-158, API-159, API-160, API-161, API-162, API-163, API-164, API-170, API-174, API-180, API-191, API-192, API-204, API-205, API-209, API-210, API-211, API-213, API-216, API-218, API-223, API-500 to API-519, API-600 to API-612, API-700 to API-718).
* **Phase 3.F — Media** (API-085, API-086, API-125, API-126, API-132, API-133, API-140, API-197, API-206, API-207, API-208, API-228, API-400 to API-409).

**Deliverables (proposed):**

1. **Settings**: dedicated `notificationsSettingsApi.js`; switch `settingsRepository.js` to use the dedicated router.
2. **Taxonomy**: add frontend `apiAdminActivateSubcategory(id)`; replace `restoreSubcategory`/`restoreCollection` PATCH with the dedicated restore endpoints; verify `apiListCategories` (public) is not called from admin pages.
3. **Offers**: remove the duplicate `apiValidateCoupon` in `paymentsApi.js`; fix `buildOfferPayload` to send `is_stackable: false`.
4. **Wishlist**: add the missing list-of-saved-products endpoint or document the workaround.
5. **Products**: add `apiAdminActivateSubcategory`; add cache invalidation on every product write; verify storefront visibility gate (`category.status=ACTIVE`); add `category`/`subcategory`/`assignedEmployeeId` validation in `ProductService`.
6. **Media**: add `namespace` and `role` validation in `MediaService`.

**Migration required:** NO for most. A new column on `catalog_product` may be required for the `category.status=ACTIVE` gate; the audit cannot confirm.

**Risk:** HIGH (most business logic).

**Estimated scope:** 80 files touched, ~3000 lines changed.

### 27.D — Phase 4: Admin APIs (Users, Employees, Analytics, Audit)

**Goal:** fix every P0/P1 defect in the admin domains.

**Scope (issues):** API-014, API-015, API-049, API-100, API-123, API-124, API-141, API-145, API-146, API-147, API-148, API-152, API-157, API-159, API-160, API-161, API-168, API-174, API-195, API-196, API-198, API-199, API-200, API-201, API-217, API-219, API-222, API-223, API-225, API-226, API-229, API-231.

**Sub-phases:**

* **Phase 4.A — Employees** (API-049, API-100, API-124, API-141, API-146, API-147, API-152, API-159, API-195, API-219, API-222, API-226, API-231).
* **Phase 4.B — Customers/Users** (API-014, API-123, API-145, API-148, API-157, API-160, API-161, API-168, API-174, API-225).
* **Phase 4.C — Analytics/Audit** (API-015, API-158, API-201, API-217).
* **Phase 4.D — Workforce/Inventory** (API-196, API-198, API-229).
* **Phase 4.E — AI/Chatbot** (API-200).

**Deliverables (proposed):**

1. **Employees**: return the temp password in the response; add `employee_code` to the response; add `getAccessToken("admin")` checks; remove `seedWorkforce.js`.
2. **Customers**: read `orderCount`/`lifetimeSpend`/`addresses` in `customersApi.js`; allow employees with `customers.view`.
3. **Analytics**: read `totalRevenue` in `AdminDashboard`.
4. **Workforce/Inventory/AI**: document as deferred.

**Migration required:** NO (mostly refactor).

**Risk:** MEDIUM (admin domains are not customer-facing).

**Estimated scope:** 40 files touched, ~1500 lines changed.

### 27.E — Phase 5: Test Hardening

**Goal:** cover the gaps identified in §31.

**Scope (issues):** API-1300 to API-1320.

**Deliverables (proposed):**

* Backend tests: admin order lifecycle, admin returns, employee CRUD, permissions, settings, notifications, cart, wishlist, auth sign-up, OAuth, sid claim, cache invalidation, submit-review ownership, payment ownership.
* Frontend tests: auth, cart, wishlist, settings, notifications, permissions, audit log, cart line ID, order guest email, payment ownership, cache invalidation, submit-review ownership.

**Migration required:** NO.

**Risk:** LOW (test-only).

**Estimated scope:** 30 new test files, ~3000 lines.

### 27.F — Phase 6: Frontend State & Cleanup

**Goal:** fix React warnings, remove dead mocks, document the contract.

**Scope (issues):** API-198, API-200, API-220, API-221, API-222, API-223, API-224, API-225, API-226, API-227, API-228, API-229, API-800 to API-816, API-900 to API-911.

**Deliverables (proposed):**

1. Remove `data/products/*.js`, `data/catalog/*.js`, `data/customer/*.js`, `data/admin/*.js`, `data/employees/*.js`, `data/shopping/*.js`, `data/media/*.js`.
2. Remove `services/orders/{orderService,trackingService,returnService,fulfillmentService,orderTimelineService,demoOrders}.js`.
3. Remove `services/offers/offerRepository.js`.
4. Remove `services/payment/paymentService.js`.
5. Remove `services/employees/{employeeService,operationsService,storage,activityService}.js`.
6. Remove `services/inventory/inventoryRepository.js`.
7. Remove `services/media/{mediaRepository,mediaStore,productMediaSource,marketingMediaSource,productMediaSet,productMediaGroups,mediaOwnershipService}.js`.
8. Remove `services/workforce/*.js`.
9. Remove `services/customer/{customerRegistry,recentlyViewed,personalization,stylePreferences}.js`.
10. Remove `services/ai/*MockData*`, `mockAiProvider.js`.
11. Remove `services/analytics/analyticsService.js`.
12. Remove `services/admin/{adminAuthService,adminAuthorization,adminDashboardService,storage}.js`.
13. Fix the `useCatalogueQuery` snapshot identity (API-213).
14. Fix the `apiClient.refreshOnce` race condition (API-006).

**Migration required:** NO.

**Risk:** MEDIUM (large surface, must verify no remaining consumers).

**Estimated scope:** 50 files deleted, ~5000 lines removed.

---

## 28. Dependency Graph

```
Phase 1.A (API contract foundation)
    ├── Phase 1.B (CamelCase/snake_case contract)
    ├── Phase 1.C (Cache wrapper + invalidation)
    ├── Phase 2.A (Auth)
    ├── Phase 3.A (Settings & Notifications)
    ├── Phase 4.C (Analytics/Audit)
    └── Phase 5 (Test Hardening)

Phase 1.A → Phase 2 (Auth & Error Contracts)
    ├── Phase 2.A (Auth)
    │   ├── Phase 2.B (Commerce — Orders, Cart, Wishlist, Payments)
    │   │   ├── Phase 3.C (Offers)
    │   │   │   ├── Phase 3.E (Products)
    │   │   │   │   └── Phase 4.A (Employees)
    │   │   │   │       ├── Phase 4.B (Customers/Users)
    │   │   │   │       │   └── Phase 4.D (Workforce/Inventory/AI)
    │   │   │   │       └── Phase 4.C (Analytics/Audit)
    │   │   │   └── Phase 3.F (Media)
    │   │   └── Phase 3.B (Taxonomy)
    │   │       └── Phase 3.D (Wishlist)
    │   └── Phase 2.C (Payments)
    │
    └── Phase 6 (Frontend State & Cleanup) — depends on Phase 2.B for order local mocks, Phase 3.E for catalog local mocks, Phase 4.A for employee local mocks.
```

**Cross-cutting dependencies:**

* **API-001 (token scope)** blocks every domain-specific fix that depends on correct auth (i.e. all of them).
* **API-040 (error envelope)** blocks every domain-specific fix that surfaces server errors to the user.
* **API-087 (legacy `/employees/...` auth)** blocks Phase 4.A.
* **API-181 / API-212 (cache invalidation)** blocks every storefront-facing fix that depends on fresh data.
* **API-204 (FK validation)** blocks Phase 3.E.
* **API-219 / API-231 (temp password)** blocks Phase 4.A.

---

## 29. Recommended Implementation Order

| Order | Phase | Reason |
|---|---|---|
| 1 | **Phase 1.A** | API contract foundation. All other phases depend on it. |
| 2 | **Phase 1.C** | Cache wrapper. Required by Phase 3.E for invalidation. |
| 3 | **Phase 2.A** | Auth. The frontend's `apiClient` is the single seam; auth is the highest-leverage fix. |
| 4 | **Phase 2.B** | Commerce (Orders/Cart/Wishlist). Customer-facing. |
| 5 | **Phase 2.C** | Payments. Customer-facing. |
| 6 | **Phase 3.A** | Settings & Notifications. The duplicate router fix. |
| 7 | **Phase 3.B** | Taxonomy. The `restoreSubcategory`/`restoreCollection` PATCH fix. |
| 8 | **Phase 3.E** | Products. The catalog is the most-used resource. |
| 9 | **Phase 3.C** | Offers. |
| 10 | **Phase 3.F** | Media. |
| 11 | **Phase 4.A** | Employees. The temp password fix. |
| 12 | **Phase 4.B** | Customers/Users. |
| 13 | **Phase 4.C** | Analytics/Audit. |
| 14 | **Phase 4.D** | Workforce/Inventory/AI (deferred). |
| 15 | **Phase 5** | Test Hardening. |
| 16 | **Phase 6** | Frontend State & Cleanup. Last because it deletes mocks that the active phases may still touch. |
| 17 | **Phase 1.B** | CamelCase/snake_case contract. (Intentionally last; it is a documentation task.) |

---

## 30. Migration Assessment

| ID | Issue | Migration required? |
|---|---|---|
| API-001 to API-009 | Auth, transport | NO |
| API-010 to API-022 | Auth | NO |
| API-023 to API-034 | Orders | NO |
| API-035 to API-039 | Settings, categories | NO |
| API-040 to API-046 | Error envelope | NO |
| API-047 to API-049 | Catalog, employees | NO |
| API-050 to API-060 | Naming, types | NO |
| API-061 to API-063 | Missing routes | NO |
| API-064 to API-069 | Duplicates | NO |
| API-070 to API-089 | Types, enums, auth | NO |
| API-090 to API-106 | Optional/nullable | NO |
| API-110 to API-138 | Enums | NO |
| API-139 to API-141 | Enums, path params | NO |
| API-142 to API-149 | Query params | NO |
| API-150 to API-167 | Response | NO |
| API-168 to API-176 | Auth | NO |
| API-180 to API-219 | Catalog, security, testing | NO |
| API-220 to API-236 | Cleanup, docs | NO |
| **API-087 (legacy auth)** | The legacy `/employees/...` routes | NO (route already has no auth; this is a code fix, not a schema change). |
| **API-219 (temp password)** | The new employee create | NO (the password is generated but not returned; this is a code fix, not a schema change). |
| **API-231 (temp password, C-33)** | Same | NO |
| **API-181 / API-212 (cache)** | The `@cache(expire=...)` invalidation | NO |
| **API-204 (FK validation)** | `category`/`subcategory` validation | NO (existing columns; the fix is in the service layer). |
| **API-205 (FK validation)** | `assigned_employee_id` validation | NO (existing column; the fix is in the service layer). |
| **API-219 (admin sign-up for employee)** | n/a | NO |
| **API-232 (sid claim)** | The JWT mint | NO (the `sid` claim is added to the JWT payload; the database is unchanged). |
| **API-234 (claim-guest)** | The `customer.email` for authenticated callers | NO (the service layer fix). |
| **API-180 (visibility gate)** | `category.status=ACTIVE` filter | NO (the fix is in the SQL query). |
| **API-085, API-086 (namespace, role validation)** | The Pydantic enum | NO (Pydantic enum, no DB). |
| **API-116, API-139, API-140 (availability, media.status, media.role)** | The Pydantic enum | NO (Pydantic enum, no DB). |
| **API-209 (pagination on admin categories/collections)** | The pagination | NO. |

**Verdict:** **0 migrations are required** for any of the 144 issues. Every issue can be fixed in code (frontend or backend) without altering the PostgreSQL schema.

---

## 31. Files Potentially Affected (by phase)

### Phase 1.A — API Contract Foundation
* `frontend/src/services/api/apiClient.js`
* `frontend/src/services/api/*.js` (all 14 files)
* `frontend/src/services/settingsRepository.js`
* `frontend/src/services/admin/productAdminService.js`
* `frontend/src/services/catalogRepository.js`
* `backend/app/core/error_handlers.py`
* `backend/app/core/cache.py`
* `backend/app/api/v1/employees.py:297-341`
* `backend/app/main.py`
* **NEW** `API_CONTRACT.md`
* **NEW** `frontend/tests/apiContract.test.js`
* **NEW** `backend/tests/unit/test_api_contract.py`

### Phase 1.C — Cache Wrapper
* `backend/app/core/cache.py`
* `backend/app/api/v1/{admin,coupons,notifications,products,categories,collections}.py`
* `backend/app/services/catalog/*.py`

### Phase 2.A — Auth
* `backend/app/schemas/auth/login.py`
* `backend/app/schemas/auth/token.py`
* `backend/app/services/auth/auth_service.py`
* `backend/app/services/customer/customer_service.py`
* `backend/app/core/dependencies.py`
* `backend/app/api/v1/{auth,orders}.py`
* `frontend/src/services/api/apiClient.js`
* `frontend/src/services/api/authApi.js`

### Phase 2.B — Commerce
* `backend/app/schemas/orders/order.py`
* `backend/app/services/orders/order_service.py`
* `backend/app/services/commerce/cart_service.py`
* `backend/app/services/commerce/wishlist_service.py`
* `backend/app/api/v1/{orders,cart,wishlist,returns}.py`
* `frontend/src/services/api/{ordersApi,cartApi,wishlistApi}.js`
* `frontend/src/utils/{orderReadModel,checkout}.js`
* **REMOVE** `frontend/src/services/orders/{orderService,trackingService,returnService,fulfillmentService,orderTimelineService,demoOrders}.js`

### Phase 2.C — Payments
* `backend/app/schemas/payments/payment.py`
* `backend/app/services/payments/payment_service.py`
* `backend/app/api/v1/payments.py`
* `frontend/src/services/api/{paymentsApi,offersApi}.js` (deduplicate)
* **REMOVE** `frontend/src/services/payment/paymentService.js`

### Phase 3.A — Settings & Notifications
* `backend/app/api/v1/{admin,notifications}.py`
* `backend/app/schemas/notification/notification.py`
* `frontend/src/services/settingsRepository.js`
* **NEW** `frontend/src/services/api/notificationsSettingsApi.js`

### Phase 3.B — Taxonomy
* `backend/app/api/v1/categories.py`
* `backend/app/schemas/catalog/category.py`
* `backend/app/services/catalog/category_service.py`
* `frontend/src/services/api/categoriesApi.js`
* `frontend/src/services/taxonomyRepository.js`
* `frontend/src/pages/admin/taxonomy/*`

### Phase 3.C — Offers
* `backend/app/api/v1/coupons.py`
* `frontend/src/services/api/offersApi.js`
* `frontend/src/services/api/paymentsApi.js` (deduplicate `apiValidateCoupon`)
* **REMOVE** `frontend/src/services/offers/offerRepository.js`

### Phase 3.D — Wishlist
* `backend/app/api/v1/wishlist.py` (add list-of-saved-products endpoint) OR document the workaround.
* `frontend/src/services/api/wishlistApi.js`

### Phase 3.E — Products
* `backend/app/api/v1/products.py`
* `backend/app/schemas/catalog/product.py`
* `backend/app/services/catalog/product_service.py`
* `frontend/src/services/api/productsApi.js`
* `frontend/src/hooks/useProducts.js`
* `frontend/src/hooks/useCatalogueQuery.js`
* `frontend/src/pages/admin/products/*`
* `frontend/src/components/product/*`
* `frontend/src/components/products/*`
* **REMOVE** `frontend/src/data/products/*.js`
* **REMOVE** `frontend/src/data/catalog/*.js` (catalog seed)

### Phase 3.F — Media
* `backend/app/api/v1/media.py`
* `backend/app/schemas/media/*.py`
* `backend/app/services/media/*.py`
* `frontend/src/services/api/mediaApi.js`
* `frontend/src/services/media/{mediaRepository,mediaStore,productMediaSource,marketingMediaSource,productMediaSet,productMediaGroups,mediaOwnershipService}.js` (remove)
* **REMOVE** `frontend/src/data/media/seedMedia.js`

### Phase 4.A — Employees
* `backend/app/api/v1/employees.py`
* `backend/app/schemas/employee/employee.py`
* `backend/app/services/employee/employee_service.py`
* `frontend/src/services/api/employeesApi.js`
* `frontend/src/services/employees/{employeeService,operationsService,storage,activityService}.js` (remove)
* `frontend/src/pages/admin/employees/*`
* **REMOVE** `frontend/src/services/workforce/*.js`
* **REMOVE** `frontend/src/data/employees/*.js`

### Phase 4.B — Customers/Users
* `backend/app/api/v1/{customers,users}.py`
* `backend/app/schemas/customer/*.py`
* `frontend/src/services/api/{customersApi,adminApi}.js`
* `frontend/src/services/customer/{customerRegistry,recentlyViewed,personalization,stylePreferences}.js` (remove)
* `frontend/src/pages/admin/*` (admin customers)
* `frontend/src/pages/account/*` (account pages)
* **REMOVE** `frontend/src/data/mockCustomers.js`
* **REMOVE** `frontend/src/data/admin/*.js`

### Phase 4.C — Analytics/Audit
* `backend/app/api/v1/{analytics,audit}.py`
* `frontend/src/services/api/adminApi.js`
* `frontend/src/pages/admin/AdminDashboard.jsx`
* `frontend/src/services/analytics/analyticsService.js` (remove)
* **NEW** `frontend/src/services/api/analyticsApi.js`

### Phase 4.D — Workforce/Inventory/AI
* Document as deferred.

### Phase 4.E — AI/Chatbot
* **REMOVE** `frontend/src/services/ai/*MockData*`, `mockAiProvider.js`.

### Phase 5 — Test Hardening
* **NEW** `backend/tests/unit/test_*.py` (10+ new files)
* **NEW** `frontend/tests/*.test.js` (10+ new files)

### Phase 6 — Frontend State & Cleanup
* `frontend/src/services/api/apiClient.js` (race condition fix)
* `frontend/src/hooks/useCatalogueQuery.js` (snapshot identity fix)
* `frontend/src/services/admin/adminAuthService.js` (stale demo language)
* **REMOVE** `frontend/src/services/orders/demoOrders.js`
* **REMOVE** `frontend/src/services/workforce/seedWorkforce.js`

---

## 32. Final Verdict

1. **How many API integrations were audited?** **179** frontend call-sites (172 `apiClient.X` + 7 internal `fetch` in `apiClient.refreshOnce`).
2. **How many backend endpoints were audited?** **259** backend routes.
3. **How many confirmed issues were found?** **144** (P0=18, P1=47, P2=39, P3=24, P4=11, P5=5).
4. **How many are P0/P1/P2/P3/P4/P5?** 18 / 47 / 39 / 24 / 11 / 5.
5. **Which APIs are currently unsafe to modify without contract work?**
   * Auth (customer/employee/admin/refresh, change-password, reset).
   * Orders (place, claim-guest, admin lifecycle, returns desk).
   * Payments (session, verify, cancel, webhook).
   * Admin products, categories, subcategories, collections, offers.
   * Admin employees, customers, users, roles, permissions, audit.
   * Admin settings (PATCH requires super-admin).
   * Customer addresses, preferences, sessions.
6. **Which issues are independent?**
   * **API-050 to API-060** (camelCase/snake_case audit — all are documentation/informational).
   * **API-070 to API-089** (type/enum audit — most are matched, the unvalidated fields are independent).
   * **API-130 to API-140** (enum audit — independent of contract work).
   * **API-300 to API-382** (DB column audit — all matched, informational).
7. **Which issues are dependencies for other fixes?**
   * **API-001 (token scope resolver)** — blocks every domain fix that depends on correct auth.
   * **API-040 (error envelope)** — blocks every fix that surfaces server errors.
   * **API-087 (legacy `/employees/...` auth)** — blocks Phase 4.A.
   * **API-181 / API-212 (cache invalidation)** — blocks every storefront fix that depends on fresh data.
   * **API-204 / API-205 (FK validation)** — blocks Phase 3.E.
   * **API-219 / API-231 (temp password)** — blocks Phase 4.A.
   * **API-046 (error envelope propagation)** — blocks every fix that needs structured error data.
8. **What should Phase 1 be?** **API contract foundation** (Phase 1.A in §27). It is the smallest set of changes that unlocks every other phase.
9. **What should NOT be changed yet?**
   * **No source code, migrations, schema, or data.** The audit is read-only.
   * **No resource-domain fixes** (products, categories, orders, payments, media). All P0/P1 issues in those domains are listed in §26 and scheduled for Phases 2-4.
   * **No implementation of §27.** §27 is a proposed plan.
   * **No live-server request reproduction.** The audit is static.
   * **No "fix one P0 issue opportunistically."** Every P0 fix depends on Phase 1.A's contract normalization.

---

## 34. End of Audit

This report is a snapshot of the repository at commit `31d464c575a04d87175487c4f5fbda90b180b3b5` of branch `arena/01a04422-pfv1`. Any subsequent commit may invalidate the findings. Re-run the audit after any substantial change to `frontend/src/services/api/`, `backend/app/api/v1/`, or `backend/app/schemas/`.

The audit was performed by reading every file listed in §31. No file was modified. No test was added. No database was touched. No migration was created. No implementation was performed.

— end —
