# PRATIKSHYA FASHON — End-to-End Frontend ↔ Backend Integration Audit

**Audit date:** 2026-08-26  
**Mode:** Read-only code/configuration audit; no database schema audit, migrations, writes, endpoint changes, or implementation changes were performed.  
**Authoritative database assumption:** The existing PostgreSQL schema and the previously reported zero-difference schema audit are accepted as authoritative. The two known wishlist FK gaps are not re-audited or changed here.

## Status legend

- ✅ **Fully connected** — the inspected UI → API → router → service/query → model path and contract agree.
- ⚠️ **Partially connected** — a real path exists, but a consumer, contract, authorization, persistence, or business-rule defect remains.
- ❌ **Broken** — the present runtime path cannot complete correctly.
- 🚫 **Backend capability missing** — only a health/stub API or no applicable backend operation exists.
- 🟡 **External configuration required** — code depends on an external provider/configuration and was not falsely treated as working.

Priority: **P0** critical/security/basic flow, **P1** major workflow, **P2** partial/significant mismatch, **P3** cleanup/hardening, **INFO** intentional or future architecture.

---

# 1. Executive Summary

The repository contains a substantial FastAPI API and a frontend API adapter layer, and several read paths are genuinely connected to PostgreSQL. Public product listing/detail/recommendations, category/collection reads, search, customer sign-in/sign-up, authenticated cart reads/mutations, customer profile reads, and admin employee/customer reads all have real database-backed backend paths.

The application is **not end-to-end ready**. The most important results are:

1. **Checkout cannot currently complete reliably.** The checkout sends `customer.fullName`, while `PlaceOrderRequest` requires `customer.firstName` and `customer.lastName`. Online payment also creates a payment session before an order exists even though `payment_sessions.order_id` is non-null/FK-backed, and the create-session response is returned in snake_case while the frontend reads camelCase.
2. **The backend can mark arbitrary non-COD orders `PAID` without verified payment.** `POST /orders` is guest-accessible and `OrderService.place_order()` derives `PAID` solely from `payment_method != "cod"`. This is a P0 trust-boundary defect.
3. **Customer authorization has two critical ownership failures.** A customer JWT can mutate product workflow through `POST /products/{id}/submit-review`, and any authenticated customer can claim another guest’s orders by supplying that guest email to `/orders/claim-guest`.
4. **Order UI contracts are broadly incompatible.** Backend order totals are top-level snake_case fields, while `ordersApi.normOrder()` expects nested `pricing`, object-shaped payment/delivery methods, and already-normalized line items. Detail pages call an async `getOrderById()` as if it were synchronous.
5. **Admin analytics/RBAC/audit calls use the wrong token.** Paths such as `/analytics/*`, `/roles`, `/permissions`, `/users`, and `/audit/logs` default to the customer token because token scope is inferred only from URL prefixes.
6. **Many admin writes appear connected but are not awaited or are fire-and-forget.** Product lifecycle commands optimistically mutate an in-memory cache and ignore backend failure; taxonomy and offer pages inspect Promises as ordinary results; employee management checks the customer token before admin writes and falls back to local session mutations.
7. **Inventory and media are backend gaps.** Their routers expose health checks only; service/repository/model implementations have no business behavior/columns beyond base model fields. Frontend inventory/media APIs intentionally return unavailable responses, while large legacy in-memory operational surfaces still exist.
8. **Runtime mock business data remains.** Employee sales/styling/wedding desks and role metrics contain hardcoded names, sales, counts, and recommendations. AI is explicitly deterministic/mock; workforce seed source remains present but is currently unreferenced.
9. **Managed collection and top-level department listings are not actually scoped.** The frontend sends `collectionId`/`department` keys that `productsApi` drops and the backend `/products` query does not support; the existing collection-products endpoint is unused.
10. **Cold-load catalogue hydration is not reactive for homepage consumers.** `useCatalog()` returns one mutable external-store snapshot identity, so API completion may leave hero/category/product sections empty.
11. **Normal development does not require Docker, Redis, or Celery by code design.** FastAPI uses an in-process LRU/`fastapi-cache2` memory backend; Celery is not imported by `app.main`. PostgreSQL and installed dependencies remain required.

**Overall:** public catalogue reads and basic identity are the strongest integrations. Checkout/payment/orders, admin workflow writes, employee operations, inventory, media, and analytics token routing are not ready.

---

# 2. Repository Integration Architecture

## 2.1 Repository discovery

- Frontend: `frontend/src` contains **454 tracked source files**.
- Backend: `backend/app` contains **288 tracked application files**.
- Frontend API modules: **17 files** under `frontend/src/services/api/`.
- Frontend entry/provider tree: `frontend/src/App.jsx`.
- Backend entry point: `backend/app/main.py`; all versioned routes are mounted under `/api/v1` through `backend/app/api/v1/router.py`.

## 2.2 Frontend architecture actually used

```text
App.jsx
  CatalogBootstrap -> hydrateCatalog()
  BrowserRouter
  AuthProvider (customer)
  AccountProvider
  InventoryProvider
  ShoppingProvider -> WishlistProvider -> CartProvider
  OrderProvider
  CheckoutProvider
  EmployeeAuthProvider
  AdminAuthProvider
  EmployeeManagementProvider
  WorkforceProvider
  Routes / layouts / pages
```

Primary integration seams:

- HTTP: `frontend/src/services/api/apiClient.js`
- Public catalogue cache: `frontend/src/services/catalog/catalogStore.js`
- Catalogue list/search hook: `frontend/src/hooks/useCatalogueQuery.js`
- Customer identity: `frontend/src/context/AuthContext.jsx`
- Cart/wishlist: `frontend/src/context/CartContext.jsx`, `WishlistContext.jsx`
- Account: `frontend/src/context/AccountContext.jsx`
- Checkout/orders: `frontend/src/context/CheckoutContext.jsx`, `OrderContext.jsx`
- Admin/employee identity: `AdminAuthContext.jsx`, `EmployeeAuthContext.jsx`
- Legacy/session repositories still used by runtime: `catalogRepository.js`, `taxonomyRepository.js`, `offerRepository.js`, `inventoryRepository.js`, workforce repositories, media repositories, and `operationsService.js`.

Environment/runtime HTTP configuration:

- `VITE_API_BASE` defaults to `/api/v1`.
- Vite proxies `/api` to `http://localhost:8000`.
- No browser code directly calls localhost; requests are relative.
- Requests are JSON-only. The client has no multipart upload support.

## 2.3 Backend architecture actually used

```text
FastAPI app.main
  /api/v1 router
    route module
      service or direct SQLAlchemy query
        optional repository (employees only in major audited paths)
          SQLAlchemy model
            PostgreSQL
```

The backend is not uniformly repository-based:

- Product/category/collection/cart/wishlist/customer/order/payment/auth paths use service classes, generally with direct SQLAlchemy access.
- Employee CRUD uses `EmployeeService` + `EmployeeRepository`.
- Analytics, offers, RBAC directory, audit, settings, and notifications mostly query models directly in routers.
- Many `repositories/*/__init__.py` and service classes are placeholders, not active abstraction layers.

## 2.4 Authentication and authorization

- JWT Bearer extraction: `backend/app/dependencies.py:get_current_user_claims`.
- Active-user load from `users`: `get_current_user`.
- Surface guards: `get_current_customer`, `get_current_employee`, `get_current_admin`.
- Token revocation uses the in-process Redis-compatible LRU shim.
- Frontend stores separate customer/admin/employee token pairs in localStorage.
- Frontend authorization is partly role/permission-config driven, but backend enforcement is often only `user_type`, not the documented fine-grained permission.

---

# 3. Frontend API Inventory

## 3.1 Shared transport behavior

Unless stated otherwise, every `apiClient` request sends `Content-Type: application/json`; protected requests add `Authorization: Bearer <scope access token>`. `skipAuth: true` suppresses the header. There is no cookie/session header, multipart body, request cancellation, or timeout.

**Shared error behavior (`H` below):** adapters catch `ApiError` and return `{ok:false,error}` but discard HTTP `status` and structured `data`. The backend emits `{success:false,error:{code,message,details}}`; `apiClient.normaliseError()` does not read `error.message`. Consequently business-rule and validation details are usually reduced to generic status text. This is a cross-cutting mismatch.

### 3.1.1 `apiClient.js` and `index.js`

| Export/function | Behavior | Finding |
|---|---|---|
| `scopeForPath` | Infers customer/admin/employee from URL prefixes | Incomplete for admin-only `/analytics`, `/roles`, `/permissions`, `/users`, and `/audit`; cannot represent employee access to shared `/admin/*` capabilities. ❌ |
| `getAccessToken`, `getRefreshToken`, `setTokens`, `clearTokens` | Reads/writes separate localStorage token keys | Keys are isolated; callers frequently omit the needed scope. ⚠️ |
| `ApiError`, `normaliseError` | Normalizes transport/backend errors | Nested backend envelope unsupported. `normaliseError` is private but is the common adapter behavior. ❌ |
| private `doRefresh`, `refreshOnce` | POST `/auth/refresh`, rotate tokens, one retry | One global lock is shared by all scopes. ⚠️ |
| private `request` | Builds URL/JSON headers, injects Bearer, parses JSON/text, refreshes once on 401 | No timeout/abort; correct basic transport. ⚠️ |
| `apiClient.get/post/patch/put/delete` | Public method facade over `request` | Correct HTTP verbs; DELETE cannot send a body (current audited endpoints do not require one). ✅ |
| token key aliases | `ADMIN_*` and `EMPLOYEE_*` compatibility constants | Correctly map to scoped keys. ✅ |
| `services/api/index.js` | Re-exports adapters; no request behavior | Inventory only; no independent contract. INFO |

### 3.2 `authApi.js`

| Function | Method/path; params/body | Auth/headers | Expected response | Actual backend/status |
|---|---|---|---|---|
| `apiSignUpCustomer` | POST `/auth/customer/sign-up`; body first/last/email/phone/password plus duplicate DOB/name spellings | Public (`skipAuth`) | token pair + customer | Route/service/`users` + `customer_profiles` exist. Auth succeeds, but registration does not persist first/last/DOB into the profile. ⚠️ |
| `apiSignInCustomer` | POST `/auth/customer/sign-in`; `{identifier,password}` | Public | token pair + `user` | Exact contract; DB-backed. ✅ |
| `apiSignOutCustomer` | POST `/auth/customer/sign-out`; `{}` | Customer | sign-out acknowledgement | Exact endpoint; revokes sessions/blacklists token. ✅ |
| `apiForgotPasswordCustomer` | POST `/auth/customer/forgot-password`; `{identifier}` | Public | generic message | Token is cached, but notification dispatch is TODO; no reset URL reaches the user. 🟡 |
| `apiResetPasswordCustomer` | POST `/auth/customer/reset-password`; `{userId,token,newPassword,confirmPassword}` | Public | acknowledgement | API contract matches, but the current reset page supplies neither URL value. Runtime ❌ |
| `apiSignInEmployee` | POST `/auth/employee/sign-in`; `{employeeId,password}` | Public | token pair + employee profile | Login works, but `TokenResponse.employee` is only `UserDTO`; employee code/department/designation are absent, so frontend substitutes user UUID as employee ID. ⚠️ |
| `apiChangePasswordEmployee` | POST `/auth/employee/change-password`; snake-case password body | Employee by path | acknowledgement | Schema accepts snake/camel; endpoint exists. ✅ |
| `apiSignOutEmployee` | POST `/auth/employee/sign-out` | Employee | acknowledgement | Exact endpoint. ✅ |
| `apiSignInAdmin` | POST `/auth/admin/sign-in`; `{adminId,password}` | Public | token pair + admin | Backend ultimately looks up email/phone; UUID/admin code is not supported despite the name `adminId`. Email login works. ⚠️ |
| `apiSignOutAdmin` | POST `/auth/admin/sign-out` | Admin | acknowledgement | Exact endpoint. ✅ |
| `apiGetMe` | GET `/auth/me` | Path defaults to customer | `UserDTO` | Endpoint works, but the wrapper cannot select admin/employee scope and is not used to validate restored sessions. ⚠️ |
| internal `doRefresh` | POST `/auth/refresh`; `{refresh_token}` | Public refresh request | rotated pair | Backend shared refresh accepts all user types, but one global refresh Promise is shared across scopes and expiry events are not isolated correctly. ⚠️ |

### 3.3 `productsApi.js`

| Function | Request and contract | Auth | Backend/status |
|---|---|---|---|
| `apiListProducts` | GET `/products`; repeated supported facet params, `sort,page,pageSize`; expects items/total/facets | Public | DB-backed route → `ProductService` → `catalog_product`. However caller scope keys `department`, `style`, `collectionId`, `curated`, `merch`, and `flag` are silently omitted, and the backend does not accept them. ⚠️ |
| `apiGetProduct` | GET `/products/{idOrSlug}`; expects product | Public | Published-only DB projection. ✅ |
| `apiGetRecommendations` | GET `/products/{id}/recommendations?type=` | Public | DB-backed, max 12; only `related` changes filtering. ✅ |
| `apiGetRecentlyViewed` | GET `/products/recently-viewed` | Customer | Cache-backed IDs resolved through `catalog_product`; wrapper is unused by current hook. ⚠️ |
| `apiAddRecentlyViewed` | POST `/products/recently-viewed?productId=` | Customer | Exact endpoint; used on PDP. ✅ |
| `apiAdminListProducts` | GET `/admin/products`; status/category/assignedEmployeeId/q/sort | Admin | Route exists; backend has no pagination despite callers passing `pageSize`. ⚠️ |
| `apiAdminCreateProduct` | POST `/admin/products`; product body | Admin | Route exists but always generates a new ID and persists only a narrow constructor subset. Runtime sync wrongly uses it for caller-ID drafts and ignores its returned ID. ❌ runtime |
| `apiAdminCreateDraft` | POST `/admin/products/draft`; permanent ID body | Admin | Route exists, but max-15 ID validation rejects many frontend canonical IDs, it persists only minimal fields, and the editor does not use it. ❌ |
| `apiAdminGetNextId` | GET `/admin/products/next-id?category=&preferredNumber=` | Admin | URL matches, but backend category-prefix/three-digit convention differs from frontend taxonomy-family/four-digit IDs. ❌ contract |
| `apiAdminCheckAvailability` | GET `/admin/products/availability?sku=&slug=` | Admin | Exact route. ✅ |
| `apiAdminProductMetrics` | GET `/admin/products/metrics` | Admin | DB-backed metrics. ✅ |
| `apiAdminGetProduct` | GET `/admin/products/{id}` | Admin | Exact route. ✅ |
| `apiAdminUpdateProduct` | PATCH `/admin/products/{id}` | Admin | URL exists, but full editor DTO is not mapped across camel/snake/model fields; many extras are unmapped/discarded, and status can be directly patched. ❌/⚠️ |
| `apiAdminAssignEmployee` | POST `/admin/products/{id}/assign`; `{employeeId}` | Admin | Exact alias-aware schema. ✅ |
| `apiAdminApproveProduct` | POST `/admin/products/{id}/approve` | Admin | Exists; backend “approve” immediately sets `PUBLISHED`, conflicting with frontend’s separate approve→publish lifecycle. ❌ |
| `apiAdminRejectProduct` | POST `/admin/products/{id}/reject`; `{reason}` | Admin | URL/body match, but backend does not require a pending-review source state. ⚠️ |
| `apiAdminPublishProduct` | POST `/admin/products/{id}/publish` | Admin | Route exists but does not require approved review/source state. ❌ lifecycle |
| `apiAdminUnpublishProduct` | POST `/admin/products/{id}/unpublish` | Admin | Route exists but accepts any source state. ⚠️ |
| `apiAdminArchiveProduct` | POST `/admin/products/{id}/archive` | Admin | Route exists but accepts any source state. ⚠️ |
| `apiAdminRestoreProduct` | POST `/admin/products/{id}/restore` | Admin | Route exists but accepts non-archived source states. ⚠️ |
| `apiAdminGetPublishIssues` | GET `/admin/products/{id}/publish-issues` | Admin | Exact route. ✅ |
| `apiSubmitForReview` | POST `/products/{id}/submit-review` | **Customer by path** | Endpoint exists but accepts any active user and is a product mutation. Security/runtime ❌ |
| `apiAdminChangeProductId` | POST `/admin/products/{id}/change-id`; `{newId}` | Admin | Exact route. ✅ |
| `apiAdminDuplicateProduct` | POST `/admin/products/{id}/duplicate` | Admin | Exact route. ✅ |
| `apiAdminBulkUpdate` | POST `/admin/products/bulk`; `{productIds,updates}` | Admin | Route/body match, but generic updates can bypass canonical lifecycle through status patches. ⚠️ |
| `apiAdminClearReviewFlags` | POST `/admin/products/{id}/review-flags/clear`; `{flags}` | Admin | Exact route. ✅ |
| `apiEmployeeGetProduct` | GET `/employee/products/{id}` | Employee | Exact route; assignment enforced on update, not on read. ⚠️ |
| `apiEmployeeUpdateProduct` | PATCH `/employee/products/{id}` | Employee | Route/whitelist exist, but authorization compares `assigned_employee_id` (typically employee code from frontend/admin assignment) to `current_user.id` UUID, so assigned employees are rejected. ❌ |

**Runtime caveat:** the product editor/workflow does not call most lifecycle functions. `catalogRepository.writeProduct()` updates memory, then starts `syncProductToBackend()` without awaiting or checking `{ok:false}`. Workflow pages can report success while the server rejects or only partially applies the payload.

### 3.4 `categoriesApi.js` and `collectionsApi.js`

| Function(s) | Request | Auth | Backend/status |
|---|---|---|---|
| `apiListCategories` | GET `/categories?status=&featured=` | Public | DB-backed. ✅ |
| `apiGetCategory` | GET `/categories/{idOrSlug}` | Public | DB-backed. ✅ |
| `apiListSubcategories` | GET `/categories/{categoryId}/subcategories?status=` | Public | DB-backed. ✅ |
| `apiAdminCreateCategory` | POST `/admin/categories` | Admin | Route exists; frontend forms use camel fields such as `sortOrder` while schema expects snake_case and does not enable alias population. ⚠️ |
| `apiAdminUpdateCategory` | PATCH `/admin/categories/{id}` | Admin | Same naming issue. ⚠️ |
| `apiAdminArchiveCategory`, `apiAdminRestoreCategory` | POST archive/restore | Admin | Exact routes. ✅ |
| `apiAdminCreateSubcategory`, `apiAdminUpdateSubcategory` | POST/PATCH subcategory routes | Admin | Exact URLs; camel/snake body issue for sort order. ⚠️ |
| `apiAdminArchiveSubcategory`, `apiAdminRestoreSubcategory` | POST archive/restore | Admin | Exact routes. ✅ |
| `apiListCollections` | GET `/collections?status=&featured=` | Public | DB-backed. ✅ |
| `apiGetCollection` | GET `/collections/{idOrSlug}` | Public | DB-backed. ✅ |
| `apiAdminListCollections`, `apiAdminGetCollection` | GET admin collection routes | Admin | Exact routes. ✅ |
| `apiAdminCreateCollection`, `apiAdminUpdateCollection` | POST/PATCH admin collection routes | Admin | Forms send camel fields (`sortOrder`, `startDate`, `explicitProductIds`); backend expects snake_case for these. ⚠️ |
| `apiAdminActivateCollection`, `apiAdminPauseCollection`, `apiAdminArchiveCollection`, `apiAdminRestoreCollection` | POST lifecycle routes | Admin | Exact routes. ✅ |
| `apiAdminAssignCollectionProducts` | PUT `/admin/collections/{id}/products`; `{productIds}` | Admin | Exact route/body. ✅ |

**Runtime caveat:** all taxonomy mutation methods are async, but admin category/collection pages call them synchronously and read `result.ok` from the Promise. The network request may start, but UI completion/error behavior is broken.

### 3.5 `searchApi.js`

| Function | Request | Auth | Response/backend/status |
|---|---|---|---|
| `apiSearch` | GET `/search` with full facets/sort/page/pageSize | Public | DB products + static suggestions. Product result contract matches. ⚠️ (suggestions are hardcoded) |
| `apiGetExplore` | GET `/explore` with facets/paging | Public | DB product stream plus hardcoded promo/editorial cards; current Explore UI does not use it. ⚠️ |
| `apiGetExploreOffers` | GET `/explore/offers` | Public | Endpoint returns hardcoded backend `_EXPLORE_OFFERS`, not `commerce_coupon`. ❌ |
| `apiGetHome` | GET `/home` | Public | Product sections are DB-backed; hero/sale/editorial copy is static and image fields are empty. ⚠️ |

### 3.6 `cartApi.js` and `wishlistApi.js`

| Function | Request/body | Auth | Backend/status |
|---|---|---|---|
| `apiGetCart` | GET `/cart` | Customer | Cart, items, totals and products resolved server-side. ✅ |
| `apiAddCartItem` | POST `/cart/items`; `{productId,color,size,quantity}` | Customer | Request/body match. Backend returns a SHA-1-derived line ID while frontend `cartLineId()` builds a raw `product::color::size` ID. Adding usually increments correctly only because the frontend fails to find the existing hashed line; selection-based held-quantity checks fail. Runtime ⚠️ |
| `apiUpdateCartItem` | PATCH `/cart/items/{lineId}`; `{quantity}` | Customer | Exact route. ✅ |
| `apiRemoveCartItem` | DELETE `/cart/items/{lineId}` | Customer | Exact route. ✅ |
| `apiClearCart` | DELETE `/cart` | Customer | Exact route. ✅ |
| `apiApplyCoupon` | POST `/cart/coupon`; `{code}` | Customer | Server validates and persists coupon. ✅ |
| `apiRemoveCoupon` | DELETE `/cart/coupon` | Customer | Exact route. ✅ |
| `apiGetCartTotals` | GET `/cart/totals?deliveryMethod=&paymentMethod=` | Customer | Exact aliases; not used by checkout when delivery/payment changes. ⚠️ |
| `apiGetWishlist` | GET `/wishlist` | Customer | Exact route. ⚠️ due ORM refresh concerns and known FK gaps |
| `apiAddToWishlist` | POST `/wishlist/{productId}` | Customer | Exact URL; service does not validate product existence/visibility and may return a stale loaded relationship after flush. ⚠️ |
| `apiRemoveFromWishlist` | DELETE `/wishlist/{productId}` | Customer | Exact URL; same loaded-relationship concern. ⚠️ |
| `apiToggleWishlist` | POST `/wishlist/{productId}/toggle` | Customer | Exact URL; same concerns. ⚠️ |

### 3.7 `customersApi.js`

| Function | Request/body | Auth | Backend/status |
|---|---|---|---|
| `apiGetMe` | GET `/customers/me` | Customer | Profile, addresses, preferences and sessions are DB-backed. ✅ |
| `apiUpdateProfile` | PATCH `/customers/me`; aliased fields | Customer | Exact body aliases and service. ✅ |
| `apiUpdatePreferences` | PATCH `/customers/me/preferences`; aliased booleans | Customer | Exact route/body. ✅ |
| `apiRevokeOtherSessions` | POST `/customers/me/sessions/revoke-others` | Customer | Route works, but backend is not passed an identifier for the current session and therefore revokes it too. ⚠️ |
| `apiGetAddresses` | GET `/customers/me/addresses` | Customer | Exact route. ✅ |
| `apiAddAddress` | POST `/customers/me/addresses`; aliased address | Customer | Exact route/body. ✅ |
| `apiUpdateAddress` | PATCH `/customers/me/addresses/{id}` | Customer | Exact route/body. ✅ |
| `apiDeleteAddress` | DELETE `/customers/me/addresses/{id}` | Customer | Exact route. ✅ |
| `apiSetDefaultAddress` | POST `/customers/me/addresses/{id}/default` | Customer | Exact route. ✅ |
| `apiAdminListCustomers` | GET `/admin/customers?q=&page=&pageSize=` | Admin | Route works, but frontend ignores camel `orderCount/lifetimeSpend`; backend currently returns both as hardcoded zero. ⚠️ |
| `apiAdminGetCustomer` | GET `/admin/customers/{id}` | Admin | Route works, but page drops separately returned addresses/stats. Backend stats are zero. ⚠️ |

No frontend API or backend route exists for admin customer update/status changes. 🚫

### 3.8 `employeesApi.js`

| Function(s) | Request | Auth | Backend/status |
|---|---|---|---|
| `apiAdminListEmployees`, `apiAdminGetEmployee` | GET `/admin/employees[/{id}]`; page/page_size/search/status/department_id | Admin | DB-backed employee service/repository. ✅ |
| `apiAdminCreateEmployee`, `apiAdminUpdateEmployee` | POST/PATCH admin employee | Admin | Create persists a user/profile, but an auto-generated password is discarded from the response and no delivery exists. Update ignores frontend-supported role/store/shift/joining-date fields. ⚠️/❌ operationally |
| `apiAdminUpdateEmployeeStatus` | POST `/admin/employees/{id}/status`; `{status}` | Admin | Exact route. ✅ |
| `apiAdminResetEmployeePassword` | POST reset-password | Admin | If no password is supplied, backend generates one and discards it; only a message is returned. The employee cannot receive the new credential. ❌ |
| `apiAdminUpdateEmployeePermissions` | PUT permissions | Admin | Route/body exist, but service contains a TODO and persists no permission mode or custom permissions. ❌ |
| `apiAdminDeleteEmployee` | DELETE employee | Admin | Exact route. ✅ |
| `apiAdminListDepartments`, `apiAdminListSections` | GET static admin paths | Admin | These GETs are shadowed by earlier `GET /admin/employees/{employee_id}` in route order. ❌ |
| `apiAdminCreateDepartment`, `apiAdminUpdateDepartment`, `apiAdminDeleteDepartment` | POST/PATCH/DELETE department paths | Admin | Routes exist. ✅ |
| `apiAdminCreateSection`, `apiAdminUpdateSection`, `apiAdminDeleteSection` | POST/PATCH/DELETE section paths | Admin | Routes exist. ✅ |
| `apiAdminGetEmployeeAttendance` | GET employee attendance with page/page_size | Admin | DB-backed. ✅ |
| `apiAdminCreateAttendance`, `apiAdminUpdateAttendance` | POST/PATCH attendance | Admin | DB-backed. ✅ |
| `apiEmployeeGetMe` | GET `/employee/me` | Employee | DB-backed profile response. ✅ |
| `apiEmployeeGetAssignedProducts` | GET `/employee/me/assigned-products` | Employee | Route returns a hardcoded empty placeholder with TODO; it does not query products. 🚫 |

There are no frontend wrappers for backend target/performance CRUD. There are no employee self-service check-in/check-out/leave/target endpoints.

### 3.9 `offersApi.js`

| Function | Request | Auth | Backend/status |
|---|---|---|---|
| `apiListOffers` | GET `/offers?status=` | Public | Backend ignores status query but returns current active offers. Response normalization misses backend `minimum_order_value`, `starts_at`, `expires_at`, `display_status`, `is_stackable`, and lower-case fixed discount type, so real offers are misrepresented. ❌ |
| `apiValidateOfferCode` | POST `/offers/validate`; **camelCase** cart/customer fields | Public | Backend expects snake_case; cart subtotal becomes zero. Wrapper also converts HTTP-200 `{ok:false}` into `{ok:true}`. ❌ |
| `apiAdminListOffers` | GET `/admin/offers?status=&q=&page=&pageSize=` | Admin | Backend ignores all filters/paging but returns DB offers. ⚠️ |
| `apiAdminGetOffer` | GET `/admin/offers/{id}` | Admin | No backend route. 🚫 |
| `apiAdminCreateOffer` | POST `/admin/offers`; frontend draft is camelCase | Admin | Backend requires snake_case required fields; current form payload receives 422. ❌ |
| `apiAdminUpdateOffer` | PATCH `/admin/offers/{id}`; camelCase body | Admin | Most changed fields are ignored; backend update schema cannot edit code/type/eligibility/exclusions/status supported by the UI. ❌ |
| `apiAdminActivateOffer`, `apiAdminPauseOffer`, `apiAdminArchiveOffer` | POST lifecycle routes | Admin | URLs exist, but pause and archive both set the same `is_active=false` and serialize as `ARCHIVED`; pages also fail to await repository Promises. ❌ |

### 3.10 `ordersApi.js`

All routes below exist. The common response adapter is the primary defect: it leaves order items in snake_case, does not build `pricing` from top-level totals, does not map `shipping_address` to `address`, and leaves payment/delivery methods as strings while UI expects objects.

| Function(s) | Request/body | Auth | Status |
|---|---|---|---|
| `apiPlaceOrder` | POST `/orders`; PlaceOrder body | Optional customer at backend | Current checkout customer body is incompatible; order response normalization is incompatible. ❌ |
| `apiListOrders`, `apiGetOrder` | GET list/detail | Customer | Ownership is enforced backend-side; frontend response contract is broken. ❌ |
| `apiGetTracking` | GET tracking | Customer | API contract mostly matches; current UI never uses it and synthesizes tracking locally. ⚠️ |
| `apiCancelOrder` | POST cancel; `{reason,note}` | Customer | `reason` accepted, `note` ignored; response normalization broken. ⚠️ |
| `apiCreateReturn`, `apiGetReturn` | POST/GET customer returns | Customer | URL/body aliases exist; frontend sends return resolution as pickup method and line IDs depend on broken item normalization. ❌ |
| `apiClaimGuestOrders` | POST `/orders/claim-guest`; `{email}` | Customer | Backend returns only a message while wrapper expects `claimed`; runtime context does not call this wrapper. More critically, backend trusts arbitrary email and can reassign another guest’s orders. ❌ P0 |
| `apiAdminListOrders`, `apiAdminGetOrder`, `apiAdminGetInvoice` | GET admin paths | Admin | Routes exist; order normalization is broken; invoice page does not use invoice API. ❌ |
| `apiAdminAllocateOrder`, `apiAdminStartPicking`, `apiAdminMarkPacked`, `apiAdminMarkReady`, `apiAdminMarkOutForDelivery`, `apiAdminMarkDelivered` | POST lifecycle paths | Admin | Exact routes; context uses customer-token presence and otherwise local fallback. Runtime ❌ |
| `apiAdminAssignFulfillment`, `apiAdminPickItem`, `apiAdminDispatchOrder` | POST alias-aware bodies | Admin | Route contracts match; runtime context/token and response defects remain. ❌ |
| `apiAdminCancelOrder`, `apiAdminAddNote`, `apiAdminApplyStatus`, `apiAdminForceStatus` | POST admin mutation paths | Admin | Route contracts match; runtime context/token and response defects remain. ❌ |
| `apiAdminListReturns`, `apiAdminGetReturn` | GET return desk | Admin | Routes and basic normalization exist; pages use local `allOrders`, not these APIs. ⚠️ |
| `apiAdminApproveReturn`, `apiAdminRejectReturn`, `apiAdminSchedulePickup`, `apiAdminReceiveReturn`, `apiAdminInspectReturn`, `apiAdminInitiateRefund`, `apiAdminCompleteRefund` | POST return lifecycle paths, alias-aware bodies | Admin | Backend routes exist; `OrderContext` implements these as local-only mutations instead. Runtime ❌ |

### 3.11 `paymentsApi.js`

| Function | Request/body | Auth | Backend/status |
|---|---|---|---|
| `apiCreatePaymentSession` | POST `/payments/session`; snake-case order/payment/draft/idempotency body | Optional customer | Request schema matches. Backend returns a raw snake_case dict; frontend expects camelCase. Pre-order draft also conflicts with non-null `order_id`. ❌ |
| `apiGetPaymentSession` | GET `/payments/session/{id}` | Optional | Response model aliases match. Backend does not enforce ownership on GET. ⚠️ |
| `apiCancelPaymentSession` | POST cancel; `{reason}` | Optional | Contract matches; unauthenticated caller can cancel a known session ID. ⚠️ |
| `apiVerifyPayment` | POST verify with Razorpay fields | Optional | HMAC route and response aliases exist. 🟡 EXTERNAL CONFIGURATION REQUIRED |
| `apiValidateCoupon` | POST `/offers/validate`; snake-case cart/customer fields | Public | Request naming matches and preserves backend `{ok}`. Product/customer eligibility is still not fully enforced by router helper. ⚠️ |

### 3.12 `adminApi.js`

| Function(s) | Request | Required auth | Status |
|---|---|---|---|
| `apiListRoles`, `apiGetRole`, `apiListPermissions` | GET `/roles`, `/roles/{id}`, `/permissions` | Admin | Backend DB routes exist, but URL-based scope sends customer token. ❌ |
| `apiAdminListUsers`, `apiAdminGetUser` | GET `/users[/{id}]` | Admin | Wrong token scope. List also sends `userType/pageSize` while backend expects `user_type/page_size`. ❌ |
| `apiListAuditLogs` | GET `/audit/logs` | Admin | Wrong token scope; camel query names do not match backend snake names. ❌ |
| `apiAnalyticsOverview`, `apiAnalyticsSales`, `apiAnalyticsTopProducts`, `apiAnalyticsTopCustomers`, `apiAnalyticsOrders`, `apiAnalyticsInventorySummary` | GET `/analytics/*` | Admin | DB queries exist, but every request sends customer scope. ❌ |

### 3.13 `inventoryApi.js` and `mediaApi.js`

Every named function is an explicit frontend unavailable stub and makes no HTTP request:

- Inventory: `apiListStock`, `apiGetStockItem`, `apiAdjustStock`, `apiListMovements`, `apiListLowStock`, `apiListReservations`, `apiListWarehouses`, `apiCreateWarehouse`, `apiListTransfers`, `apiCreateTransfer`, `apiCompleteTransfer` — 🚫.
- Media: `apiListMedia`, `apiGetMedia`, `apiCreateMedia`, `apiUpdateMedia`, `apiDeleteMedia`, `apiUploadMedia`, `apiListProductMedia`, `apiAssignMediaToProduct`, `apiListMarketingMedia`, `apiListMediaReviews`, `apiApproveMedia`, `apiRejectMedia` — 🚫.

The backend has only health endpoints for these domains.

### 3.14 Additional HTTP seam outside `services/api`

`frontend/src/services/settingsRepository.js` calls:

- GET `/admin/settings` — ✅ request/response.
- GET `/admin/settings/{section}` — frontend reads `settings`/`[section]`, but backend returns `data`; defaults are shown instead. ❌.
- PATCH `/admin/settings/{section}` — frontend sends the section object directly; backend requires `{data:{...}}`. ❌.
- POST section/all reset — URLs match, but failures are swallowed and defaults shown as success. ⚠️.

---

# 4. Backend API Inventory

| Domain | Implemented API | Actual service/query and DB models | Assessment |
|---|---|---|---|
| System | GET `/health` | No DB query | ✅ process health only; not DB health |
| Auth | customer/employee/admin sign-in/out, customer registration/reset, shared refresh/me, OAuth | `AuthService`/`OAuthService`; `users`, `user_sessions`, profiles, RBAC, OAuth/reset tables | ⚠️ functional core; reset notification external; employee/admin identity mismatches |
| Users/RBAC | `/users`, `/roles`, `/permissions` reads | Router SQL against `users`, `roles`, `permissions`, joins | ✅ backend reads; frontend scope broken |
| Products | public list/detail/recommendations/recent; full admin lifecycle; employee get/update | `ProductService` → `catalog_product` | ❌/⚠️ extensive routes, but create ID/full-field persistence, lifecycle guards/history, cache invalidation, category visibility and submit-review authorization are defective |
| Categories | public reads/product listing; admin category/subcategory writes | `CategoryService` → `catalog_category`, `catalog_subcategory`, product model | ⚠️ creates DRAFT but exposes no category/subcategory activate operation |
| Collections | public reads/product listing; admin lifecycle/assignment/metrics | `CollectionService` → `catalog_collection`, product model | ✅ backend capability |
| Search | GET `/search` | `SearchService` delegates `ProductService` | ⚠️ DB products, static suggestions |
| Explore/Home | GET `/explore`, `/explore/offers`, `/home` | `ExploreService`; products/categories plus hardcoded editorial/offers | ⚠️ mixed DB/static |
| Customer | profile/preferences/sessions, admin customer list/detail | `CustomerService` → user/profile/preferences/session/address models | ⚠️ self-service functional; admin order stats stubbed |
| Addresses | customer CRUD/default | `AddressService` → `customer_addresses` | ✅ backend capability |
| Cart | cart CRUD, coupon, totals | `CartService` → `commerce_cart`, `commerce_cart_item`, `commerce_coupon`, `catalog_product` | ✅ backend capability with frontend add defect |
| Wishlist | list/add/remove/toggle | `WishlistService` → wishlist/item | ⚠️ no product validation; stale relationship risk; two known DB FK gaps |
| Offers | public list/validate; admin list/create/update/lifecycle | Direct router SQL → `commerce_coupon` | ⚠️ no detail route; validation and body-contract gaps |
| Checkout | only GET `/checkout/health` | `CheckoutService` exists separately but is not routed | 🚫 functional checkout orchestration missing |
| Payments | sessions/get/cancel/verify/webhook | `payments.PaymentService` → `payment_sessions`, `orders_order`; Razorpay | ❌ pre-order persistence conflict; 🟡 provider required |
| Orders | customer create/list/detail/tracking/cancel/returns/claim; admin fulfillment/returns/invoice | `OrderService`/`ReturnService` → order/item/history/return models and product/coupon | ❌ critical payment trust and stock/coupon defects despite broad routes |
| Employees | admin CRUD/departments/sections/attendance/targets/performance; employee profile plus placeholder assigned/workflow/desk | `EmployeeService` + `EmployeeRepository` → users/profile/department/section/attendance/target/performance | ⚠️ broad routes, but assigned/workflow/desk return empty TODOs, generated credentials are lost, custom permissions are a no-op, several edit fields are ignored, assignment identity differs, self-service is limited, and static GETs collide |
| Analytics | overview/sales/products/customers/orders/inventory summary | Direct SQL against orders/items/products/customer profiles | ✅ DB-backed queries, but frontend token scope is broken and some metric semantics are weak |
| Admin settings/activity | settings CRUD/reset; activity; static built-in roles | Direct router SQL → admin settings/audit models | ⚠️ settings exist; frontend body mismatch; activity has readers but no backend row producers; static roles duplicate DB RBAC concept |
| Notifications | admin notification GET/PATCH | Direct SQL → notification settings | ❌ route shadowed by earlier `/admin/settings/{section}` route and guarded only by generic user in its own router |
| Inventory | health only | service classes empty; models only declare table names/base fields | 🚫 |
| Warehouses/transfers | health only | service/model stubs | 🚫 |
| Media/reviews | health only | service/model stubs | 🚫 |
| Variants/attributes/pricing | health only | schema/model names exist, functional routers absent | 🚫 |
| Attendance/performance dedicated modules | health only | actual admin CRUD is nested under employees | ⚠️ dedicated modules are stubs |
| Returns dedicated module | health only | actual return API is in `orders.py` | INFO |
| Chatbot | health only | AI/RAG package skeletons | 🚫 |

---

# 5. Customer Integration Audit

## 5.1 Authentication

### Sign-up

```text
SignUp.jsx
→ AuthContext.signUp
→ authApi.apiSignUpCustomer
→ POST /api/v1/auth/customer/sign-up
→ AuthService.register_customer
→ users + customer_profiles + user_roles + user_sessions
→ PostgreSQL
```

Status: ⚠️. Token issuance and user persistence are real. `dateOfBirth`, `firstName`, and `lastName` are not written to `CustomerProfileModel`; only `UserModel.full_name` is populated.

### Sign-in/sign-out

Customer sign-in and sign-out are real and DB-backed. No demo credentials or customer registry are used as authority. `customerRegistry.js` is an empty compatibility shim.

### Refresh and `/auth/me`

- Refresh exists, rotates the DB session, and uses cache blacklist checks.
- Session restoration in all three contexts trusts token presence plus a local profile snapshot; it does not call `/auth/me`.
- A stale/expired token can therefore make a protected route appear authenticated until an API request fails.
- `apiGetMe()` always defaults to customer token scope.

### Protected routes

`/account`, profile, addresses, list, settings, security, preferences and AI account pages are protected. However `/account/orders/:orderId`, `/track`, and `/return` are declared outside `ProtectedRoute` in `App.jsx:348-350`. Backend endpoints still enforce ownership, but the frontend route boundary is inconsistent and can expose an in-memory guest/session record in the browser.

### 401 behavior

`apiClient` retries once after refresh. Problems:

- `_refreshPromise` is global, not keyed by scope.
- The expiry event includes `{scope}`, but `AuthContext` ignores it and always clears the customer session.
- Admin/employee contexts infer expiry by checking whether their token was already removed.

Customer/admin/employee token keys are separate, but refresh and event coordination are not fully isolated.

## 5.2 Password/account security

- Forgot-password UI displays success, but backend email/SMS dispatch is TODO. **EXTERNAL CONFIGURATION + IMPLEMENTATION REQUIRED**.
- Reset page does not read `userId` or `token` from query parameters and calls reset with `undefined` values.
- `AccountSecurity.jsx` displays “password changed successfully” after a 300 ms delay and never calls `POST /auth/change-password`.
- “Sign out other sessions” is async but the page reads the Promise synchronously.

Status: ❌.

---

# 6. Catalogue Integration Audit

## 6.1 Product source

Public structured product data is backend-driven:

```text
Catalogue/list/search/PDP components
→ useCatalogueQuery or productsApi
→ GET /products, /search, /products/{id}, /recommendations
→ ProductService/SearchService
→ ProductModel (`catalog_product`)
→ PostgreSQL
```

No static frontend product record array is the active source. `frontend/src/data/products/index.js` is a live proxy over `catalogStore`.

## 6.2 Listing/search/pagination defects

- **Managed collection pages are unscoped.** `CatalogueListing` and `data/products/taxonomy.js` use `{collectionId: id}`. `useCatalogueQuery` forwards that object, but `productsApi.apiListProducts()` only serializes `collection`; the backend also exposes the correct dedicated `GET /collections/{collection_id}/products`, for which no frontend wrapper/consumer exists. Collection pages therefore request the general catalogue.
- **Top-level department routes are unscoped.** `/women`, `/men`, `/bridal`, and `/kids` use `{department: ...}`, but neither `productsApi` nor `ProductListQuery` supports `department`. `catalog_product`/`StorefrontProduct` also has no department field in the audited model/DTO. These routes request all products.
- Static navigation scopes also use unsupported `style`, `curated`, `merch`, and `flag` keys. Supported category/subcategory portions still narrow applicable deeper routes, but unsupported portions are silently ignored.
- `useCatalogueQuery.loadMore()` increments `page`, but each response replaces `items`; it does not append pages. “Load more” swaps page 1 for page 2.
- `hasMore = visible.length < total` remains true on every full page until an empty page.
- Facets shown in `CatalogueBrowser` are rebuilt from only the current page instead of using backend `facets`.
- `catalogStore` hydrates only the first 100 products for homepage/local cross-feature lookups. Any repository-driven rail, cart/wishlist resolver, local recommendation, or taxonomy count can omit products beyond 100.
- `productsApi.normaliseProduct()` overwrites the backend camelCase `originalPrice` with `null` because it checks only snake-case alternatives when assigning the explicit alias.

Status: ❌ for managed collections/top-level department pages; ⚠️ for supported category/search listings.

## 6.3 Product detail/recommendations/availability

- PDP detail and recommendations use real API routes.
- Product editor variants are local embedded objects. `ProductModel` has no `variants` field, the extra editor payload is not persisted, and `/variants` plus `/attributes` expose health only despite separate model/schema packages. Variant stock/price/availability therefore is not end-to-end connected.
- API adapters discard status, so `ProductDetail` cannot distinguish 404 and always treats it as generic error.
- PDP category breadcrumb uses `product.slug || product.category`, so it normally routes to `/category/{product-slug}` rather than the product’s category ID/slug.
- Availability comes from product fields and cart validation. Dedicated inventory is not connected.
- Cart recommendations remain a deterministic frontend algorithm over live products; PDP recommendations use the backend.

## 6.4 Homepage/explore

- `useCatalog()` passes the same mutable `state` object to `useSyncExternalStore` on every notification. React compares snapshots by identity, so catalogue hydration does not trigger components using this hook to re-render. Homepage components also read live proxies/functions directly and their media/placement hooks do not subscribe to catalog changes. On a normal cold load, hero/category/new-arrival/editorial sections can remain at their initial empty snapshot even after APIs complete.
- `useStorefrontTaxonomy()` has the opposite contract problem: its snapshot function creates a new object on every read (currently no consumer was found), which would violate the stable-snapshot requirement if used.
- Homepage new-arrival/edit product selections are DB-backed in `ExploreService`.
- Backend hero slides, sale banner, explore offers and stream promo/editorial cards are hardcoded; hero images are empty.
- `catalogStore` hydrates its offer state from the hardcoded `/explore/offers`, not the real `/offers` table endpoint. `offerRepository` (used for storefront badges/account offers) therefore reads static explore offers; `syncOffers()` fetches `/offers` but does not write the result back into catalog state.
- Frontend homepage also depends on media/marketing placement repositories and static fallback assets.
- `apiGetExplore()` is not the data source for the Explore UI; Explore uses `/products` or `/search` via `useCatalogueQuery`.

Status: ⚠️ mixed integration.

---

# 7. Category / Collection / Taxonomy Audit

Public category, subcategory and collection metadata reads are real. Product/category/collection relationships are represented partly as product string/JSON fields and collection explicit/rule membership, and backend category/collection product routes apply published visibility. The frontend does **not** call `GET /collections/{collection_id}/products`; its `{collectionId}` scope is dropped by `productsApi`, so the backend relationship logic does not reach collection listing pages.

Admin taxonomy is broken at the UI boundary:

- Repository methods call real APIs and refresh the catalog.
- `catalogStore.hydrateCatalog()` fetches categories but never calls `apiListSubcategories`; `CategoryResponse` does not embed subcategories. `state.subcategories` is therefore empty, so category tabs, product-editor subcategory choices and admin subcategory lists do not receive backend rows.
- Pages call async mutation methods without `await`, inspect `Promise.ok`, and report failure or navigate incorrectly.
- Category/collection form payloads use camel fields that backend create/update schemas mostly expect in snake_case.
- Backend creates categories and subcategories as `DRAFT`, while the frontend assumes new records are `ACTIVE`; no activate endpoint exists for either. The catalog store then reloads only public `ACTIVE` taxonomy, so newly created drafts disappear from the admin UI.
- The documented category visibility gate is not applied to product reads. `products.py`, category-product, search and explore calls invoke `ProductService.list_storefront_products()` without a `category_status_map`; archived-category products remain eligible in `/products`/`search` even though the category itself disappears.
- Backend has an admin collection list including drafts, but frontend taxonomy state reads only public active collections. New draft collections disappear before the operator can call the existing activate route.
- Collection/category assignment/detail pages read `catalogRepository.all()` directly without mounting `useProducts`; this is a separate admin in-memory cache from public `catalogStore` and can be empty until another page has loaded it.
- `restoreSubcategory` and `restoreCollection` in `taxonomyRepository` call generic update with a `status` field those update schemas do not accept, instead of calling the already-defined restore API functions.
- `taxonomyRepository.asCollection()` sets `displayStatus` from `record.status`, discarding backend derived `displayStatus`.
- Static route metadata under `data/products/taxonomy.js` remains legitimate navigation configuration, but can diverge from database-managed taxonomy and is still used as the first route-resolution source.

Status: reads ✅; writes ❌.

---

# 8. Cart / Wishlist Audit

## 8.1 Authenticated cart

Backend ownership is real: cart/items/coupon are persisted in PostgreSQL and totals are computed by `CartService` from current products and coupon records. Server stock/product visibility is consulted on cart restore/add. Coupon checks cover active dates/global/per-customer counts/customer allowlist/minimum subtotal, but product/category/collection eligibility and exclusions are not applied; per-customer limits also depend on redemption rows that order placement never creates.

Runtime line-identity defect:

```text
frontend cartLineId:  productId::color::size
backend response id: SHA1(productId::lower(color)::lower(size))[0:16]
```

After a server cart response, `CartContext.getCartItemQuantity(product, selection)` computes the raw frontend ID and cannot find the hashed server line. The PDP therefore reports zero held quantity and “Buy now” can add another unit even when that selection is already in the bag. Normal “add” calls usually still increment correctly only because the failed lookup leaves `quantity` equal to the requested increment. There is also a race window during guest→authenticated replacement where raw and hashed IDs can coexist.

Other findings:

- Checkout recalculates delivery/COD totals locally instead of calling `/cart/totals` when method changes.
- The authenticated cart strips the resolved `item.product` supplied by the server and resolves again through the at-most-100-item catalog snapshot/on-demand detail.
- `couponLapsed` is always exposed as `false` by `CartContext`, even if the API reported lapse.
- Guest cart is intentionally localStorage client state. This is acceptable only as temporary guest state and must be validated at order creation.

Status: ⚠️.

## 8.2 Wishlist

Authenticated wishlist uses the backend. The known missing DB FKs do not prevent ordinary insert/select/delete by themselves, but they allow orphan customer/product references if application validation fails.

Additional code findings:

- No product existence/published check occurs before adding a product ID.
- The service reloads the same ORM identity after mutating children; an already-loaded `wishlist.items` collection may remain stale in the mutation response.
- Guest wishlist is intentionally localStorage-only and is not merged.

Status: ⚠️.

---

# 9. Customer Account Audit

## 9.1 Profile, addresses, communication preferences

Backend paths are complete and DB-backed. The main runtime issue is async consumption:

- `AccountProfile.jsx`, `AccountAddresses.jsx`, `AccountSettings.jsx`, and `AccountSecurity.jsx` call async context methods without `await`, then inspect `result.ok/message` on a Promise.
- `customersApi.normaliseProfile()` handles camel first/last/DOB but not backend camel `loyaltyTier`, `loyaltyPoints`, or `createdAt`; it displays `STANDARD`, zero points, and the current year instead of returned values.
- Every active session is marked `isCurrent:false` because `/customers/me` never passes `current_session_id` to `CustomerService.get_me()`.
- Deleting the default address does not promote another default in the backend; the frontend marks the first remaining address default only in local state.
- Profile avatar UI sends a FileReader data URL up to 2 MB, while `ProfileUpdate.avatar` and the DB column allow only 1,000 characters; practical uploads are rejected. No media upload/reference flow replaces it.
- Profile/preferences are optimistically updated without rollback when the backend rejects the write.
- Address unauthenticated fallback branches still mutate in-memory state even while returning failure, although protected routing usually prevents reaching them.
- Account state is memory-cached; comments still refer to localStorage/demo fallback but the current helper is a Map.

## 9.2 Style preferences and recently viewed

- Communication preferences are backend-owned.
- Style preferences (categories/fabrics/occasions/colours) are localStorage-only; no backend schema/endpoint supports them.
- PDP writes recently viewed to backend, while `useRecentlyViewed()` reads a separate localStorage store and never fetches `apiGetRecentlyViewed`. Account/AI consumers therefore do not see the server history.

## 9.3 Admin customer view

Backend customer list/detail reads are real, but order count/lifetime spend are explicitly hardcoded to zero in `CustomerService`. Frontend aliases also miss the camel response fields; `normaliseProfile` drops backend customer status/loyalty and `AdminCustomerDetail` hardcodes the displayed status to `ACTIVE`. No update/status API exists.

Status: self-service reads ✅; writes/UI ⚠️/❌; admin metrics ⚠️; style preferences 🚫 backend gap.

---

# 10. Checkout / Payment Audit

## 10.1 COD

Before method-specific handling, `CheckoutContext.startPayment()` rejects every unauthenticated shopper, so the intentional guest cart cannot proceed even though backend `POST /orders` supports guest orders and exposes a claim flow. Guest checkout is therefore a frontend gap (separate from the insecure backend claim implementation).

Expected:

```text
CheckoutContext → POST /orders → OrderService → order models → PostgreSQL
```

Actual request uses:

```json
{"customer":{"fullName":"...","email":"...","phone":"..."}}
```

Backend requires:

```json
{"customer":{"firstName":"...","lastName":"...","email":"..."}}
```

COD order creation returns 422 before persistence. The frontend then clears the cart without awaiting `clearCart()` only after a successful placement; that part is secondary.

Status: ❌.

## 10.2 Online payment

Current sequence:

```text
create payment session from draft
→ Razorpay modal
→ verify payment
→ create order
```

Backend/model sequence is designed for an existing `order_id`:

```text
existing order
→ payment session (non-null FK order_id)
→ Razorpay
→ verify updates that order
```

Problems:

1. `PaymentSessionModel.order_id` is non-null and FK-backed, but draft sessions pass `None`.
2. Draft session amount is copied from client `orderDraft.amount/total`; no server cart/order recomputation protects the charge amount.
3. Create-session route returns a raw dict with `session_id`, `razorpay_order_id`, `razorpay_key_id`, `amount_paise`; frontend reads camelCase fields.
4. No idempotency key is supplied by checkout.
5. After verification, frontend creates a second/new order rather than using the session’s order.
6. If payment succeeds and order creation fails, the UI has an unreconciled paid session.
7. `POST /orders` itself marks non-COD as paid without binding proof of payment.

Status: ❌ plus 🟡 **EXTERNAL CONFIGURATION REQUIRED** for Razorpay credentials/webhook reachability.

## 10.3 Payment methods

UPI/card/netbanking eventually open Razorpay hosted checkout. Before doing so, `PaymentStep` unnecessarily asks the shopper to enter UPI ID, bank, or full card number/expiry/CVV into merchant-controlled React state, validates it, then discards it; none of those choices is passed to Razorpay. The shopper must select/enter payment details again in the hosted modal. Although the code does not persist or transmit these values, collecting CVV/card data outside the gateway is an avoidable security/PCI and trust concern and the “secured payment layer” copy is misleading. COD should not require Razorpay.

---

# 11. Orders Audit

## 11.1 Backend strengths

- Prices and item snapshots are resolved from `catalog_product`, not trusted frontend prices.
- Customer list/detail/cancel/return enforce order ownership.
- Admin state-transition routes and return lifecycle routes exist.
- Order/item/history/return rows are persisted.

## 11.2 Backend defects

- Non-COD `payment_status = "PAID"` is derived only from the requested method.
- Product stock is not checked/decremented/reserved during order placement.
- Coupon application during order creation checks only existence/active and applies discount; date, usage limit, per-customer limit, eligibility, exclusions and minimum order are not fully revalidated. Usage is incremented without a redemption row.
- COD orders are still seeded with `PAYMENT_CONFIRMED` timeline/history.
- Final status-history entry is inserted twice.
- `OrderResponse`/`AdminOrderResponse` do not include `returns` or an assembled customer object, even though frontend order cards/details expect both. Refetching an order after return creation therefore cannot hydrate the return into `OrderContext`.
- Order creation has no idempotency key/header handling, so a timeout/retry can create duplicate orders and increment coupon usage again.
- Guest-order claim trusts a caller-supplied email instead of the authenticated user’s verified identity.
- Tracking events are generated from order status/timeline; no courier integration exists.

## 11.3 Frontend defects

- `normOrder()` does not implement the backend response contract.
- `getOrderById()` became async, but three account pages use it synchronously in `useMemo`.
- Customer tracking uses local `trackingService`, not `apiGetTracking`.
- Pages still expose “demo progression” controls that mutate local order state.
- Admin/employee order desks read `OrderContext.allOrders`, but `OrderProvider` only loads customer `/orders` when a customer is signed in. It never loads `/admin/orders` for admin/employee portals.
- Admin order mutations test `getAccessToken()` (customer) instead of admin/employee scope and otherwise run local fallback logic.
- Admin return mutations are explicitly local-only despite existing backend endpoints.
- Guest-order claim in `OrderContext` uses the local `orderService.claimGuestOrders`; the existing backend wrapper is never called. Separately, the backend claim endpoint has the P0 arbitrary-email ownership flaw.
- Invoice page creates a frontend demonstration invoice and does not use `apiAdminGetInvoice`.

Status: ❌.

---

# 12. Admin Integration Audit

## 12.1 Admin authentication and authorization

- Login/token storage is separate and real when email is used.
- Admin session restore is a local profile snapshot, not `/auth/me` validation.
- `AdminProfile` edits only `AdminAuthContext` state/local snapshot; there is no admin profile PATCH endpoint, yet the UI reports “Profile saved.”
- `AdminProtectedRoute` allows only `SUPER_ADMIN`, so any ordinary `ADMIN` role is denied the entire admin portal.
- Most backend admin routes enforce only `user_type == admin`; documented per-action permissions are not checked.
- `/auth/admin/sign-up` treats any active admin bearer token as a privileged actor. Neither the router nor `AuthService.register_admin()` verifies `SUPER_ADMIN`, so an ordinary admin can create another super-admin-backed account despite the endpoint description.
- `/admin/customers` allows any employee user type without actually evaluating `customers.view`.

Status: ⚠️.

## 12.2 Products

- Lists/detail/metrics read the backend.
- Creates/updates/lifecycle actions are driven through a frontend workflow cache and fire-and-forget PATCH/create calls.
- New frontend drafts keep a caller-generated permanent ID, but `syncProductToBackend()` calls `POST /admin/products` rather than `/admin/products/draft`; backend ignores the supplied extra `id`, generates a different lowercase `pf-...` ID, and returns it to a caller that ignores the response. Later updates target the nonexistent frontend ID.
- Identity conventions themselves disagree: frontend uses `PF-{department}-{family}-{NNNN}` (often 17+ characters), while `ProductDraftRequest`/change-ID allow at most 15 characters and backend `next-id` returns unrelated `SAR-001`-style three-digit IDs.
- `ProductUpdateRequest` declares only a small subset of the 70+ product fields. Extra snake-case names may persist accidentally through `setattr`, while camel fields such as `isFeatured`, `lowStockThreshold`, `careInstructions`, `mediaIds` and variant data become unmapped Python attributes or are discarded. Full editor persistence is therefore incomplete.
- Dedicated assign/approve/reject/publish/archive/restore/bulk APIs generally exist but are not the canonical runtime path.
- Backend “approve” publishes immediately, while frontend models approved and published as separate stages.
- Backend lifecycle methods do not enforce source states: a complete draft can be published/approved directly, any state can be unpublished/archived/restored, and admin PATCH can set `status` directly. Approve/publish also record history after assigning `PUBLISHED`, producing a `PUBLISHED → PUBLISHED` history entry.
- Product/category writes never invalidate their read caches. Product list/detail/recommendations use `fastapi-cache2`, product detail also uses the LRU cache, and category reads cache for five minutes. `invalidate_product_cache()` is never called and its pattern targets the separate LRU shim rather than the `FastAPICache` in-memory backend. Publish/unpublish/archive/category changes can remain stale for 2–10 minutes.

Status: read ⚠️; workflow writes ❌.

## 12.3 Taxonomy/offers/settings

- Taxonomy read APIs work; forms/actions do not await and use mismatched body names.
- Offers list reaches DB data, but response fields are normalized incorrectly (minimum/date/status/type/stackability are lost), eligibility/exclusion fields are not serialized, create/edit payloads mismatch, the detail endpoint is absent, and lifecycle UI does not await. Backend has only `is_active`, so pause and archive collapse to the same serialized `ARCHIVED` state; create cannot honor frontend DRAFT/PAUSED status, and update cannot edit many fields exposed by the form.
- Settings list works; section read and PATCH contracts mismatch. Backend changes do not update `commerceDefaults` localStorage reads, and `CartService`/`OrderService` use module constants rather than `admin_setting` values. Even a successful settings write would not change checkout/order pricing rules.

Status: ❌ for normal administration.

## 12.4 Customers/orders/returns/employees

- Customer directory/detail reads work with zero/stub order metrics; no update/status capability.
- Admin orders and returns do not load their backend lists into the pages.
- Employee directory initial admin read works. Write branching checks the customer token instead of admin scope. Update/status/permissions then mutate only the local cache; create/reset enter legacy async helpers. Create does fire an admin API call, but the context treats the Promise synchronously, the helper returns `ok:true` even when backend sync fails, and context state is not reconciled to the server response.
- Department/section GET route shadowing breaks selectors.

Status: ⚠️ reads; ❌ writes/operations.

## 12.5 Analytics

Backend analytics values are DB queries. Frontend dashboard calls cannot authenticate because `/analytics` is classified as customer scope. The full analytics workspace does not use these endpoints at all; it aggregates local/session repositories, which are empty or disconnected in an admin-only session.

Metric-specific notes:

- Revenue includes statuses such as `PENDING_PAYMENT`/unpaid COD and `RETURNED`.
- Backend overview returns `totalRevenue`, but `loadBusinessMetrics()` does not map it to the dashboard’s `revenue` field, so the Revenue tile remains zero even after token routing is fixed.
- The dashboard only surfaces an error when *all* parallel calls fail. A successful `/admin/orders` call can mask failures of every analytics request and leave zero metrics without an error.
- Average order value divides revenue by all orders, including cancelled orders.
- “Employees present” on dashboard is actually the count of employees with account status `ACTIVE`, not attendance.
- Category sales derives a category from the first segment of product ID rather than a category field.
- Admin customer `orderCount` and `lifetimeSpend` are zero stubs.

Status: backend query availability ✅; presented admin analytics ❌.

## 12.6 Activity/audit trail

`GET /audit/logs` and `GET /admin/activity` can read `audit_activity_log`, but no audited backend service/router creates `ActivityLogModel` rows. Product, taxonomy, offer, employee, order and settings UIs record many events only through frontend `activityService` memory. Therefore fixing the admin token scope would still not produce an authoritative server audit trail for current mutations. Status: ⚠️ read capability, 🚫 backend write integration.

---

# 13. Employee Integration Audit

| Employee feature | Frontend | Backend | Result |
|---|---|---|---|
| Login/logout/password change | Real auth API | Implemented | ⚠️ employee profile response lacks code/department/designation |
| Profile | Local employee cache update | GET `/employee/me`; no self PATCH | **FRONTEND/BACKEND GAP** |
| Assigned products | Employee UI uses admin product list/workflow cache | GET assigned-products is an empty TODO; employee product GET/PATCH exist | 🚫/❌ wrong runtime API/scope and backend list stub |
| Product editing/review | Frontend local workflow + fire-and-forget update | Employee PATCH compares assigned code field to user UUID; insecure shared submit-review | ❌ |
| Employee customers | Local empty customer registry / admin path | `/admin/customers` permits employees | ❌ path scope sends admin token, not employee token |
| Employee orders | Shared local `allOrders`; demo fallback | No employee-scoped order list; admin order paths require admin | 🚫/❌ |
| Attendance | In-memory browser check-in/out | Admin CRUD only; dedicated module health-only | **BACKEND GAP** |
| Leave | In-memory browser records | No leave API/model in routed surface | **BACKEND GAP** |
| Targets/performance | In-memory repositories and derived scores | Admin CRUD nested under employees; no frontend wrappers/self reads | **PARTIALLY IMPLEMENTED** |
| Offers | Admin offer endpoints from employee pages | Backend admin guard | ❌ token/authorization mismatch |
| Reports | Local analytics snapshot | DB analytics is admin-only | ❌ |
| Inventory/warehouse | In-memory empty ledger plus hardcoded desks | health-only backend | 🚫 |
| Media | In-memory/blocked upload UI | health-only backend | 🚫 |

Employee account provisioning has an additional blocker: `EmployeeService.create_employee()` and reset generate random temporary passwords, but API responses expose only employee/message data and no notification dispatch exists. The frontend `CredentialSheet` therefore receives an empty password. Custom permission updates are also a backend no-op, and role/store/shift/joining-date edits are accepted by the request schema but not persisted by the service/model.

Hardcoded employee business data remains in `EmployeeDesk.jsx` and `operationsService.js`, including named customers, styling recommendations, wedding collections, sales totals, ticket counts, and role KPI cards.

---

# 14. Media / CDN Readiness

## A. Structured product data

Product structured data is stored in `catalog_product` and reaches the frontend through `ProductService`. It includes `image`, `hover_image`, `additional_images`, `primary_media_id`, and media ID arrays. Those are usable only when values already contain browser-reachable references.

## B. Media assets and metadata

- `media_media_asset`, `media_product_media`, `media_marketing_media`, and `media_media_review` model classes have no declared business columns beyond inherited base fields.
- Media routers expose health only.
- No functional upload/list/map/review endpoint exists.
- Frontend `mediaApi` intentionally returns unavailable.
- Product rendering can use product image fields and extensive static files under `frontend/public/images`.
- Homepage/category/editorial media resolvers use static authored fallback assets and an in-memory/localStorage marketing placement system.
- Upload forms are JSON-client incompatible with real file upload and currently show an explicit unavailable error in the main form path; legacy demo labels/code remain.

Future requirements, not implementation in this audit:

```text
PostgreSQL product + media metadata
→ signed upload/object key API
→ object storage
→ CDN URL/transforms
→ product-media and marketing-placement mappings
→ frontend receives immutable metadata/reachable URLs
```

Status: structured products ⚠️ (references may work); managed media/CDN 🚫 and 🟡 external storage/CDN configuration required.

---

# 15. Inventory Readiness

- `inventory.py`, `warehouses.py`, and `stock_transfers.py` expose only health checks.
- Inventory service classes are empty.
- Inventory model classes declare table names but no business columns.
- Frontend `inventoryApi` makes no HTTP requests.
- `inventoryRepository.js` is a large in-memory operational engine. Its current seed locations/stock are empty, but operator actions mutate browser memory and customer UI can consult it.
- Backend cart checks product-level `catalog_product.stock`; order placement does not reserve/decrement it.
- Analytics inventory summary is product-level stock, not warehouse inventory.

Status: product-level stock/cart availability ⚠️; warehouses/movements/transfers/reservations 🚫.

---

# 16. API Contract Mismatches

| ID | Exact location | Mismatch | Impact | Priority |
|---|---|---|---|---|
| C-01 | `CheckoutContext.jsx:startPayment`; `schemas/orders/order.py:CustomerSnapshot` | `fullName` vs required `firstName` + `lastName` | All checkout order creation 422 | P0 |
| C-02 | `CheckoutContext.jsx`, `paymentsApi.js`, `payments/payment_service.py`, `payment_session.py` | Pre-order draft vs non-null order FK; raw snake response vs camel consumer | Online payment cannot establish usable session | P0 |
| C-03 | `order_service.py:place_order` | Payment status trusts method string | Forged paid orders | P0 |
| C-04 | `products.py:submit_for_review`; `apiClient.scopeForPath` | Any user/customer scope accepted for product mutation | Unauthorized catalogue mutation | P0 |
| C-05 | `ordersApi.js:normOrder` vs `OrderResponse` | Top-level totals/address/string methods/snake items not mapped | Order pages/admin operations receive unusable objects | P1 |
| C-06 | `OrderContext.getOrderById` vs account pages | Promise treated as order object | Detail/tracking/return runtime failure | P1 |
| C-07 | `apiClient.scopeForPath`; `adminApi.js` | Non-`/admin` admin endpoints use customer token | Analytics/RBAC/users/audit all fail | P1 |
| C-08 | `utils/shopping.js:cartLineId`; `cart_service.py:_cart_line_id`; `CartContext.getCartItemQuantity` | Raw frontend line ID vs hashed/lowercased backend line ID | Existing authenticated selection is not recognized; Buy Now can add again | P1 |
| C-09 | `offersApi.apiValidateOfferCode`; `ValidateCouponRequest` | Camel vs snake; HTTP-200 failure forced to success | Invalid/zero-subtotal guest coupons accepted by UI | P1 |
| C-10 | `OfferForm`/`offerRepository`; `CreateCouponRequest` | Camel draft vs required snake fields | Create/update offers fail/ignore fields | P1 |
| C-11 | taxonomy forms/repository; category/collection schemas | Async result not awaited; camel vs snake | Admin taxonomy writes present false feedback/fail fields | P1 |
| C-12 | `settingsRepository.updateSection`; `SettingsPatchRequest` | Body object vs `{data: object}` | Settings save 422 | P1 |
| C-13 | `EmployeeManagementContext` | `getAccessToken()` customer check before admin writes | DB read followed by local-only writes | P1 |
| C-14 | `AuthService._build_token_response`; `toEmployeeProfile` | UserDTO lacks employee profile fields | UUID substituted for employee code | P1 |
| C-15 | all adapter `handleError`; backend error handler | Nested backend error envelope unsupported; status discarded | Poor error UX and broken 404 branching | P2 |
| C-16 | `useCatalogueQuery` | Backend page is replacement, UI calls it “load more” | Pagination UX incorrect | P2 |
| C-17 | users/audit APIs | camel query names vs snake backend params | Filters/page size ignored | P2 |
| C-18 | `customersApi` admin normalization | camel stats not read; detail page drops addresses | Incorrect zeros/missing detail | P2 |
| C-19 | payment session GET/cancel | Optional auth without mandatory ownership | Payment metadata/cancellation authorization gap | P1 |
| C-20 | `employees.py` route order | static department/section GET shadowed by `{employee_id}` | Department/section reads 404 | P1 |
| C-21 | `settingsRepository.getSection` | backend returns `data`; frontend does not read it | Defaults mask server section | P2 |
| C-22 | `/orders/claim-guest` | backend message only; frontend expects count | Claim UI cannot report/use count | P2 |
| C-23 | `/admin/products/{id}/approve` | backend publishes; frontend expects approved-not-published | Lifecycle disagreement | P1 |
| C-24 | `CatalogueListing`, `useCatalogueQuery`, `productsApi.apiListProducts` | `collectionId`/`department`/`style`/`curated` scope keys are not serialized or supported | Collection and top-level department listings show the wrong catalogue | P1 |
| C-25 | `productsApi.normaliseProduct` vs `StorefrontProduct.originalPrice` | Explicit normalizer ignores camel `originalPrice` and overwrites it | Sale/original price can disappear | P2 |
| C-26 | `offersApi.normaliseOffer`, `offerRepository.normaliseOffer`, `coupons.py:_coupon_to_dict` | `minimum_order_value`, `starts_at`, `expires_at`, `display_status`, lower-case discount type and stackability are not mapped | Real offers display as draft/incorrect type with missing rules | P1 |
| C-27 | `auth.py:sign_up_admin`, `AuthService.register_admin` | Endpoint promises `SUPER_ADMIN`; implementation accepts any active admin as actor | Privilege escalation in admin-account creation | P1 |
| C-28 | `orders.py:claim_guest_orders`, `OrderService.claim_guest_orders` | Request email is trusted instead of authenticated/verified identity | Any customer can take ownership of another email’s guest orders | P0 |
| C-29 | `ProductService` lifecycle methods and `ProductUpdateRequest.status` | Frontend transition table vs backend unrestricted/direct status changes | Review/approval/publication can be skipped; history is inaccurate | P1 |
| C-30 | `analytics_overview`, `adminDashboardService.loadBusinessMetrics`, `AdminDashboard` | Backend `totalRevenue` is never mapped to frontend `revenue`; partial failures are masked | Revenue tile stays zero and analytics outage can look like valid zero data | P1 |
| C-31 | `customersApi.normaliseProfile` vs `ProfileResponse` | camel `loyaltyTier`, `loyaltyPoints`, `createdAt` not read | Account loyalty/member-since values are wrong | P2 |
| C-32 | `customers.py:get_me`, `CustomerService.get_me` | Current session ID is never supplied | All sessions report `isCurrent:false`; revoke-others revokes all | P2 |
| C-33 | `EmployeeService.create_employee/reset_employee_password`, employee API responses, `CredentialSheet` | Generated temporary password never leaves service and is not delivered | Newly provisioned/reset employees cannot know their credential | P1 |
| C-34 | `EmployeeService.update_employee_permissions` | API reports success while implementation persists nothing | Custom permissions have no effect | P1 |
| C-35 | `router.py`, `admin.py`, `notifications.py` | Duplicate GET/PATCH `/admin/settings/notifications`; earlier dynamic settings route shadows specialized route | Notification endpoint behavior/auth schema is not the implementation reached | P2 |
| C-36 | `catalogRepository.createDraftProduct`, `syncProductToBackend`, `ProductService.create_product` | Frontend permanent ID sent to endpoint that always generates a different ID; response ignored | Frontend and DB create different product identities | P1 |
| C-37 | `ProductEditor.buildPayload`, `ProductUpdateRequest`, `ProductService.update_product`, `ProductModel` | Full camel editor DTO is not mapped to the large snake-case model | Many product fields/variants/media/flags do not persist | P1 |
| C-38 | category/subcategory create services, public-only `catalogStore`, taxonomy repository | Backend creates DRAFT; frontend assumes ACTIVE; no activate route and admin reads only active | New taxonomy records disappear and cannot be activated normally | P1 |
| C-39 | `taxonomyRepository.restoreSubcategory/restoreCollection` | Generic PATCH with unsupported `status` used instead of existing restore endpoint | Restore reports/behaves incorrectly | P1 |
| C-40 | admin settings, `commerceDefaults`, `CartService`, `OrderService` | Stored settings are not consumed by pricing/totals services | Admin shipping/COD changes have no business effect | P1 |
| C-41 | product/category/search/explore routers and `ProductService.list_storefront_products` | Category status map is never supplied | Archiving a category does not remove its products from general customer APIs | P1 |
| C-42 | `catalogStore.hydrateCatalog`, `apiListSubcategories`, `CategoryResponse` | Store expects embedded subcategories but neither fetches the endpoint nor receives embedded rows | Subcategory tabs/options/admin lists stay empty | P1 |
| C-43 | `useCatalog`, mutable `catalogStore.state`, homepage direct getters | `useSyncExternalStore` snapshot identity never changes | Cold-load catalogue hydration may not re-render homepage sections | P1 |
| C-44 | `ProductDetail` breadcrumb construction | Uses product slug where category slug/ID is required | PDP breadcrumb leads to category not-found | P2 |
| C-45 | `AccountProfile.handleAvatarChange`, `ProfileUpdate.avatar`, `CustomerProfileModel.avatar` | Up-to-2MB data URL vs 1,000-character API/DB field | Normal avatar uploads fail validation/storage | P2 |
| C-46 | catalog write routes/services, `fastapi-cache2`, LRU cache | No effective invalidation after product/category mutation | Customer catalogue can show stale publish/archive/category state for minutes | P1 |
| C-47 | `productIdPrefixes.js`, `PRODUCT_ID_RE`, backend `get_next_id/create_product` | Long canonical `PF-...-NNNN` vs max-15 schema, three-digit backend family IDs, or lowercase generated IDs | Canonical product identity cannot round-trip | P1 |
| C-48 | admin product assignment, `ProductService.update_product_employee` | Stored/selected employee code vs comparison to user UUID | Legitimately assigned employee cannot save product | P1 |
| C-49 | `/employee/me/assigned-products`, `/employee/me/workflow`, `/employee/desk` | Routes advertise capability but return empty TODO payloads | Employee portal has no backend operational read model | P1 |
| C-50 | `components/checkout/PaymentStep.jsx`, Razorpay hosted modal | Merchant UI collects card/CVV/UPI/bank values but never sends them to gateway | Duplicate entry, misleading security posture, avoidable sensitive-data handling | P1 |

---

# 17. Authentication / Token Isolation Audit

## Correct isolation

- Distinct localStorage token keys exist for customer/admin/employee.
- `/admin/*` and `/auth/admin/*` select admin tokens.
- `/employee/*` and `/auth/employee/*` select employee tokens.
- Customer cart/account/order routes default to customer.
- Backend surface guards correctly reject wrong `user_type` where used.

## Isolation defects

1. Admin-only routes without `/admin` prefixes use customer tokens: analytics, roles, permissions, users, audit.
2. Employee pages cannot call shared admin-prefixed capabilities with employee tokens even where backend allows employees (customers), because path scope forces admin.
3. One global refresh Promise is shared by three scopes.
4. Customer expiry listener ignores event scope and clears the customer session on any scope expiry event.
5. Session restoration trusts local snapshots and does not validate `/auth/me`.
6. Several contexts check `getAccessToken()` without a scope before deciding whether to use backend or local logic.
7. Backend authorization is inconsistent: product submit-review and notification settings use generic current user; customer admin reads use user-type checks rather than actual permission lookup.

No evidence was found that an admin token is directly attached to a customer `/cart` request or an employee token to a normal `/admin` request. The failures are mostly missing/wrong token selection and weak backend guards, not deliberate token sharing.

---

# 18. Remaining Runtime Mock Data

The sweep covered `frontend/src` for `mock`, `demo`, `seed`, `fake`, `fixture`, `fallback`, simulation, localStorage, and hardcoded operational figures.

| Classification | Files/examples | Finding |
|---|---|---|
| **A — REAL MOCK BUSINESS DATA** | `pages/employee/EmployeeDesk.jsx:208-266` | Named fake customers, styling edits, wedding collections, ₹8,42,600 sales and department/ticket rows are rendered in production runtime. |
| **A** | `services/employees/operationsService.js:270-336`; `pages/employee/EmployeeOrders.jsx:111` | Hardcoded sales, customer/order/follow-up/support/stylist/manager KPI counts. |
| **A** | `pages/account/OrderDetail.jsx`; `OrderTracking.jsx`; `AdminOrderInvoice.jsx`; `OrderContext.jsx` | Demo order progression, synthesized tracking/carriers/invoices, local fallback mutations remain in runtime. |
| **A** | `pages/account/AccountSecurity.jsx` | Simulated successful password change. |
| **A (backend-served runtime)** | `backend/app/services/catalog/explore_service.py` | Hardcoded explore offers, promo/editorial cards, hero copy and sale banner are returned as API business content; frontend offer state hydrates from this instead of `commerce_coupon`. |
| **A / backend unavailable** | `inventoryRepository.js`, workforce repositories, `mediaRepository.js` | Browser-memory mutations remain; current authored seeds are empty, but they are still operational alternatives to absent backend APIs. |
| **B — LEGITIMATE UI CONFIGURATION** | navigation/taxonomy route metadata, filter facets, status labels, payment method labels, visual copy, formatting defaults | Keep as UI configuration, but avoid treating shipping/payment values as server authority. |
| **B** | static files under `frontend/public/images` | Media assets, not structured product business records. They remain a future CDN migration concern. |
| **C — TEST ONLY** | `frontend/tests`, retired demo architecture tests, script fixtures | Outside normal runtime; keep as tests/documentation if useful. |
| **D — DOCUMENTATION/COMMENTS** | many stale “demo/mock/seed” comments | Non-runtime, but often contradict current architecture and should eventually be cleaned. |
| **E — BACKEND/EXTERNAL UNAVAILABLE STATE** | `mediaApi.js`, `inventoryApi.js`, AI Mirror empty overrides | Honest unavailable states; keep until backend/provider exists. |
| **E** | deterministic AI provider and AI copy files | Clearly labeled mock; products/numbers are mostly derived from live repositories, but no chatbot backend/provider is connected. |
| **F — DEAD/UNKNOWN** | `services/workforce/seedWorkforce.js`, `services/orders/demoOrders.js` | Runtime source files remain but no imports were found; workforce file contains extensive fake records. Investigate/remove in a later implementation cleanup, not this audit. |
| **F** | `adminAuthService.js` header/comments and legacy storage keys | Implementation now delegates login but stale demo language and local profile helpers remain. |

Guest cart/wishlist and safe checkout form persistence are intentional client state, not mock business registries. Customer style preferences and recently viewed are real user data persisted locally, but they are still integration gaps because authenticated state was expected to be backend-owned.

## 18.1 Complete file-level classification of keyword matches

The sweep found keyword matches (`mock|demo|seed|fake|fixture|fallback|simulat`) in **150 frontend runtime source files**. The table below assigns every matched file/occurrence to a class; files containing both comments and runtime behavior have both classes.

| Classification | Files/patterns covered | Why |
|---|---|---|
| **A — real mock/local business behavior** | `context/OrderContext.jsx`; `services/orders/{orderService,trackingService,returnService,orderTimelineService}.js`; `utils/{orders,checkout}.js`; `pages/account/{AccountOrders,OrderDetail,OrderReturn,OrderTracking}.jsx`; `pages/admin/{AdminReturns,AdminReturnDetail}.jsx`; `pages/admin/orders/AdminOrderInvoice.jsx`; `components/orders/ReturnSummaryCard.jsx`; `config/orderConfig.js` | Local order transitions, generated tracking/invoice/refund state and demo controls coexist with real backend orders. |
| **A** | `pages/employee/{EmployeeDesk,EmployeeOrders}.jsx`; `services/employees/operationsService.js` | Hardcoded customers, edits, collections, sales and KPI numbers, plus demo fallback queues. |
| **A** | `context/{EmployeeAuthContext,EmployeeManagementContext,InventoryContext}.jsx`; `services/inventory/inventoryRepository.js`; `services/employees/activityService.js`; `services/workforce/{attendanceRepository,leaveRepository,performanceRepository,location,settings,store}.js`; `components/workforce/CheckInCard.jsx`; `config/{attendanceConfig,performanceConfig}.js` | Browser-memory workforce/inventory/audit operations remain business state. Current inventory seeds are empty, but mutation paths are still local authority. Attendance location/config explicitly remains demo. |
| **A / E** | `services/media/{marketingPlacementRepository,mediaOwnershipService,mediaRepository,mediaStore}.js`; admin/employee media pages; `components/media/{MediaUploadForm,MediaUploadPanel,MediaThumb}.jsx` | Local media/placement mutations and demo metadata remain because backend media is unavailable; primary upload path also exposes an honest unavailable state. |
| **A** | `context/CheckoutContext.jsx`; `pages/{Checkout,OrderSuccess}.jsx`; `components/cart/CouponField.jsx`; `config/checkoutConfig.js` | Checkout includes persisted client state and stale demo language/compatibility behavior. Payment method labels themselves are class B. |
| **B — legitimate UI/configuration** | `App.jsx`; navigation/layout files; `config/{adminNavigation,employeeNavigation,commerceDefaults,mediaTypes,productIdPrefixes}.js`; `data/catalog/collections.js`; `data/mediaPlaceholder.js`; `data/products/{index,query,recommendations}.js`; `data/shopping/coupons.js`; `design-system/components/{Brand,MediaFrame}.jsx`; `utils/{pricing,shopping,validation}.js` | Route/navigation/status/format/empty-state configuration or deterministic algorithms over live records. `shopping.js` guest persistence is intentional, though comments are stale. |
| **B** | UI fallback/rendering matches in `components/{PratikshyaImage,admin/ProductCatalogSelector,product/ProductGallery,product/ProductPreview,products/editorSectionsContent,storefront/BrideGroomEdit,storefront/HeroCarousel,navigation/PortalSidebar}.jsx` and related storefront/media resolver/source files | “Fallback” is mostly rendering/media-source terminology, not substitute structured product records. Static asset fallback remains a media/CDN concern. |
| **B / D** | `hooks/{useCatalogueQuery,useOffers,useProducts}.js`; `services/{admin/adminDashboardService,catalog/catalogStore,customer/customerRegistry,employees/employeeId,employees/employeePassword,offers/offerRepository,payment/paymentService,productDeletionService,taxonomyRepository}.js`; workflow files | Mostly comments describing removal/compatibility or error fallbacks. Real integration defects are documented elsewhere; no static product/customer registry is introduced by these matches. |
| **D — documentation/stale comments** | `context/{AccountContext,AuthContext,CartContext}.jsx`; `services/admin/adminAuthService.js`; `services/employees/employeeService.js`; numerous page headers/comments including auth, admin dashboard/activity, taxonomy and media pages | Text still says mock/demo/localStorage after implementation changed. Comments do not create records but obscure the actual architecture. |
| **E — explicit backend unavailable state** | `services/api/{inventoryApi,mediaApi}.js`; inventory/media UI and service files; `services/media/{marketingMediaSource,mediaAudit,mediaExposure,mediaResolver,mediaValidation,productMediaSet,productMediaSource,uploadValidation}.js`; `services/explore/explorePlacements.js` | These matches are unavailable/empty-state or asset fallback behavior pending backend/storage capability. |
| **E — explicit mock external capability** | all `services/ai/**`; all `services/aiMirror/**`; `pages/account/{AiMirror,AiShoppingAssistant}.jsx`; `pages/admin/AiBusinessAssistant.jsx`; `components/aiMirror/**` | Clearly labeled deterministic/mock AI or virtual try-on; no claim of a real provider. Some outputs read live catalog/session repositories. |
| **F — dead/unreferenced** | `services/orders/demoOrders.js`; `services/workforce/seedWorkforce.js` | No runtime imports found. `demoOrders` returns empty; `seedWorkforce` still contains extensive fake records and should not be reconnected. |
| **F / D** | Unused `fill()` in `EmployeeLogin.jsx`, legacy storage keys, old compatibility branches and mock-stage comments | No current record source, but should be investigated during cleanup to prevent accidental reactivation. |

Files such as `AtelierDesign.jsx`, `Shop.jsx`, `Explore.jsx`, `CategoryPage.jsx`, account dashboard, admin dashboard, offer detail, employee media pages, analytics service and storefront placement components match mainly because they mention a fallback/demo source in comments or render an explicit unavailable/demo label. Their actual business-data status is determined by the integration sections above, not by the keyword alone.

---

# 19. Development Runtime Audit

## Backend target

`uvicorn app.main:app --reload` is the documented command. Code inspection confirms:

- PostgreSQL is required.
- Redis is not required: `app/core/redis.py` delegates to `LRUCacheClient`.
- `fastapi-cache2` uses `InMemoryBackend`.
- Celery is not imported by `app.main`; its Redis URLs and worker remain future/optional.
- Docker Compose is not imported or invoked by runtime.

Potential blockers:

- Dependencies must be installed from `requirements.txt`.
- A valid local `DATABASE_URL` and JWT secret should be configured; the code has unsafe development placeholders if `.env` is absent.
- Startup log messages still say “Redis connection initialised,” although the implementation is in-process.
- Running multiple Uvicorn workers would give each worker an independent blacklist/cache/idempotency store.

## Frontend target

`npm run dev` is correct after `npm install`. Vite binds `0.0.0.0`, accepts hosts, and proxies `/api` to port 8000.

## Verification performed

- Python source syntax compilation: **PASS**.
- Backend pytest: not run because `pytest` is not installed in the current environment.
- Frontend test command: **38 passed, 1 failed**. The failure was environment/dependency setup (`react` package not installed; no `node_modules`), not an assertion failure.
- No database endpoint or write test was executed.

Conclusion: Docker/Redis/Celery are not normal-development requirements. Installed Python/npm dependencies and PostgreSQL are.

---

# 20. Real Database Verification Plan

Do not print or share `DATABASE_URL`, tokens, credentials, or returned business/customer rows. Run locally with the developer’s private environment already configured.

## 20.1 Safe read-only tests

Use Swagger at `/docs` or commands that inspect only status/schema, not row bodies. Redirect sensitive JSON to a local temporary file or inspect only HTTP code/count keys.

```bash
# Process health; this does not prove DB connectivity.
curl -i http://localhost:8000/health

# Public DB-backed reads. Avoid posting output publicly.
curl -sS -o /tmp/pf-products.json -w '%{http_code}\n' \
  'http://localhost:8000/api/v1/products?page=1&pageSize=1'
curl -sS -o /tmp/pf-categories.json -w '%{http_code}\n' \
  'http://localhost:8000/api/v1/categories?status=ACTIVE'
curl -sS -o /tmp/pf-collections.json -w '%{http_code}\n' \
  'http://localhost:8000/api/v1/collections?status=ACTIVE'
curl -sS -o /tmp/pf-search.json -w '%{http_code}\n' \
  'http://localhost:8000/api/v1/search?q=saree&page=1&pageSize=1'
```

Authenticated read tests should use shell variables and must not echo tokens:

```bash
read -s CUSTOMER_TOKEN
curl -sS -o /tmp/pf-me.json -w '%{http_code}\n' \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  http://localhost:8000/api/v1/customers/me
curl -sS -o /tmp/pf-cart.json -w '%{http_code}\n' \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  http://localhost:8000/api/v1/cart
curl -sS -o /tmp/pf-orders.json -w '%{http_code}\n' \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  'http://localhost:8000/api/v1/orders?page=1&pageSize=1'
unset CUSTOMER_TOKEN
```

Admin read checks:

```bash
read -s ADMIN_TOKEN
for path in \
  '/admin/products' '/admin/customers?page=1&pageSize=1' \
  '/admin/employees?page=1&page_size=1' '/admin/orders?page=1&pageSize=1' \
  '/analytics/overview' '/roles' '/permissions' '/audit/logs?page=1&page_size=1'; do
  curl -sS -o /tmp/pf-admin-read.json -w "$path %{http_code}\n" \
    -H "Authorization: Bearer $ADMIN_TOKEN" "http://localhost:8000/api/v1$path"
done
unset ADMIN_TOKEN
```

These direct admin-token tests distinguish backend health from the frontend scope bug.

## 20.2 Manual write-test checklist — do not automate against real data

Use dedicated test accounts/products and record cleanup plans before each test:

1. Customer registration, profile update, address CRUD/default, communication preferences.
2. Cart add once, add same variant again, update, remove, clear; verify exact quantity and server totals.
3. Wishlist add/remove/toggle; verify response and next GET agree; test nonexistent product ID rejection expectation.
4. Admin product create draft, edit, assign, submit, approve, publish, unpublish, archive, restore; verify DB state after each call.
5. Category/subcategory/collection create/update/lifecycle/assignment using both expected snake and frontend payloads.
6. Offer create/update/validate/lifecycle; test dates, minimum, global/per-customer limits, customer/product/category/collection eligibility and exclusions.
7. COD order with a dedicated low-value test cart; verify server totals, status, coupon redemption and stock behavior.
8. Online payment only in Razorpay test mode after the order/session sequence is fixed. Never fabricate callback signatures.
9. Order cancel/return/admin fulfillment/return lifecycle; verify ownership and status-transition rejection.
10. Employee create/update/status/permissions/reset, then employee login/profile/assigned-product access.

---

# 21. Feature Status Matrix

| Feature | Frontend | API layer | Backend route | Service/query | DB | Status | Main issue |
|---|---:|---:|---:|---:|---:|---|---|
| Customer sign-in/out | ✅ | ✅ | ✅ | ✅ | ✅ | READY WITH CAVEATS | Restore does not validate `/auth/me` |
| Customer sign-up | ✅ | ✅ | ✅ | ⚠️ | ✅ | PARTIAL | Profile first/last/DOB not persisted |
| Refresh/401 | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | PARTIAL | Global cross-scope refresh/event handling |
| Forgot/reset password | ❌ | ✅ | ✅ | ⚠️ | ✅ | BLOCKED | No notification dispatch; reset URL ignored |
| Public product list | ✅ | ✅ | ✅ | ✅ | ✅ | PARTIAL | Load-more/facet/page behavior |
| Product detail | ✅ | ✅ | ✅ | ✅ | ✅ | READY WITH CAVEAT | 404 status discarded |
| Product variants/attributes | ⚠️ local editor | 🚫 | health only | 🚫 | ✅ tables | BACKEND GAP | Embedded variant payload is not persisted |
| Recommendations | ✅ | ✅ | ✅ | ✅ | ✅ | READY | Simple category affinity |
| Homepage | ❌ cold load | ✅ | ✅ | ⚠️ | ⚠️ | BROKEN/PARTIAL | Store snapshot is non-reactive; static hero/offers/editorial; media empty |
| Search | ✅ | ✅ | ✅ | ✅ | ✅ | PARTIAL | Static suggestions; paging UI |
| Explore | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | PARTIAL | UI bypasses `/explore`; static stream cards |
| Categories metadata/listings | ✅ | ✅ | ✅ | ⚠️ | ✅ | PARTIAL | Filters work, but archived-category visibility gate is not applied |
| Subcategory taxonomy UI | ❌ | ✅ unused | ✅ | ✅ | ✅ | BROKEN SEAM | Hydration never calls subcategory API |
| Collections metadata | ✅ | ✅ | ✅ | ✅ | ✅ | READY | — |
| Collection product listings | ❌ | ❌ | ✅ | ✅ | ✅ | BROKEN | `collectionId` dropped; dedicated route unused |
| Department/navigation listings | ❌ | ❌ | 🚫 exact filter | — | — | BROKEN | Unsupported `department/style/curated` scope keys |
| Admin taxonomy writes | ❌ | ⚠️ | ✅ | ✅ | ✅ | BROKEN | Promise/body naming defects |
| Authenticated cart | ⚠️ | ✅ | ✅ | ✅ | ✅ | PARTIAL | Frontend/backend line-ID algorithms differ |
| Guest cart | ✅ | — | — | — | local | INTENTIONAL | Must validate at order creation |
| Wishlist | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | PARTIAL | No product validation, stale response risk, FK gaps |
| Customer profile reads | ✅ | ✅ | ✅ | ✅ | ✅ | READY | — |
| Customer profile/address writes | ❌ | ✅ | ✅ | ✅ | ✅ | BROKEN UI | Async results not awaited |
| Communication preferences | ❌ | ✅ | ✅ | ✅ | ✅ | BROKEN UI | Async result not awaited |
| Style preferences | ✅ | — | 🚫 | — | local | BACKEND GAP | Authenticated data localStorage-owned |
| Recently viewed | ⚠️ | ✅ | ✅ | ✅ | cache+DB products | BROKEN SEAM | Backend write/local frontend read split |
| Guest checkout | ❌ | ✅ | ✅ | ✅ | ✅ | FRONTEND GAP | Checkout requires login despite backend guest support |
| COD checkout | ❌ | ✅ | ✅ | ✅ | ✅ | BLOCKED | Customer request contract mismatch |
| Online payment | ❌ | ❌ | ✅ | ❌ | ⚠️ | BLOCKED | Session/order sequence and response mismatch |
| Customer order history/detail | ❌ | ❌ | ✅ | ✅ | ✅ | BROKEN | Response normalization + async consumer |
| Tracking | ❌ | ✅ | ✅ | ✅ | ✅ | PARTIAL/BROKEN | UI synthesizes demo tracking |
| Cancellation | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | PARTIAL | Order object contract broken |
| Customer returns | ❌ | ⚠️ | ✅ | ✅ | ✅ | BROKEN | Item/pickup/response contracts |
| Admin auth | ⚠️ | ✅ | ✅ | ✅ | ✅ | PARTIAL | Email-only practical login; local restore; super-admin-only UI |
| Admin profile update | ✅ local | — | 🚫 | — | local | BACKEND GAP | UI reports saved but only changes snapshot |
| Admin product reads | ✅ | ✅ | ✅ | ✅ | ✅ | READY WITH CAVEAT | No pagination |
| Admin product create/edit/lifecycle | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | BROKEN | ID divergence, partial field persistence, fire-and-forget writes, lifecycle bypass |
| Admin offers | ❌ | ❌ | ⚠️ | ⚠️ | ✅ | BROKEN | Body mismatch, no detail route, Promise misuse |
| Admin customers | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | PARTIAL | Stats stubbed; detail fields dropped |
| Admin orders/returns | ❌ | ✅ | ✅ | ✅ | ✅ | BROKEN | Pages never load backend lists; local mutations |
| Admin employees | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | PARTIAL/BROKEN WRITES | Wrong token branch, lost temp credentials, permission no-op, route collision |
| Admin analytics dashboard | ❌ | ❌ | ✅ | ✅ | ✅ | BROKEN | Wrong token scope |
| Admin analytics workspace | ✅ | — | ✅ unused | local aggregate | mixed | BROKEN DB TRACE | Uses local/session repositories |
| Admin settings | ⚠️ | ❌ | ✅ | ✅ | ✅ | BROKEN WRITES | Section response/PATCH mismatch |
| Admin activity/audit | ⚠️ local | ❌ token | ✅ read | 🚫 producers | ✅ table | PARTIAL | Backend log has no mutation writers |
| Employee login | ✅ | ⚠️ | ✅ | ✅ | ✅ | PARTIAL | Employee identity/profile missing |
| Employee assigned products/edit | ❌ | ⚠️ unused | 🚫 list / ⚠️ patch | ⚠️ | ✅ | BROKEN | Empty assigned list, code-vs-UUID authorization, local workflow |
| Employee attendance | ✅ local | — | 🚫 self | — | local | BACKEND GAP | Browser-only |
| Employee leave | ✅ local | — | 🚫 | — | local | BACKEND GAP | Browser-only |
| Employee targets/performance | ✅ local | ❌ | ⚠️ admin CRUD | ✅ | ✅ | PARTIAL | No self/API integration |
| Employee orders/customers/offers | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | BROKEN | Scope/routes/local data |
| Inventory | ⚠️ local | 🚫 | health only | 🚫 | base tables | BLOCKED | Backend capability missing |
| Media | ⚠️ local/static | 🚫 | health only | 🚫 | base tables | BLOCKED | Backend/storage/CDN missing |
| AI assistants | ✅ mock | — | chatbot health only | local deterministic | mixed | EXTERNAL/BACKEND GAP | Clearly mock, no provider integration |

---

# 22. Prioritized Findings

## P0 — Critical

### P0-01 — Checkout order body is rejected
- **Files/functions:** `frontend/src/context/CheckoutContext.jsx:startPayment`; `backend/app/schemas/orders/order.py:CustomerSnapshot`.
- **Current:** sends `customer.fullName`.
- **Expected:** `firstName` and `lastName`, or a schema accepting `fullName`.
- **Endpoint:** POST `/api/v1/orders`.
- **Problem:** COD and post-payment order creation return 422.
- **Recommended fix:** define one order-create DTO mapper and contract-test it against `PlaceOrderRequest`.

### P0-02 — Online payment session cannot represent the frontend flow
- **Files/functions:** `CheckoutContext.startPayment`, `paymentsApi.apiCreatePaymentSession`, `PaymentService.create_session`, `PaymentSessionModel.order_id`.
- **Current:** draft session before order, null FK, snake response read as camel, and `PaymentService` trusts the client-supplied draft `amount/total` instead of recomputing from cart/order items.
- **Expected:** one atomic, idempotent order/payment sequence with a persisted order identity, server-computed amount, and matching response aliases.
- **Endpoint:** POST `/payments/session`.
- **Problem:** online checkout is blocked and can create unreconciled payment state.
- **Recommended fix:** choose and enforce one sequence (normally pending order → session → verify/webhook), with response model/ownership/idempotency.

### P0-03 — Unverified online orders are marked paid
- **Files/functions:** `backend/app/services/orders/order_service.py:place_order`; `backend/app/api/v1/orders.py:place_order`.
- **Current:** any non-COD `paymentMethod` yields `PAID`; endpoint permits guests.
- **Expected:** only verified gateway/webhook state can mark paid.
- **Problem:** direct API callers can forge paid orders.
- **Recommended fix:** remove client-method-derived payment success and bind order status to verified payment session state.

### P0-04 — Customer can submit arbitrary products for review
- **Files/functions:** `backend/app/api/v1/products.py:submit_for_review`; `frontend/src/services/api/productsApi.js:apiSubmitForReview`; `apiClient.scopeForPath`.
- **Current:** generic active user accepted; frontend selects customer token.
- **Expected:** assigned employee or authorized admin only.
- **Problem:** unauthorized catalogue mutation.
- **Recommended fix:** apply surface/permission guard and assignment/state checks; make route/token scope explicit.

### P0-05 — Any customer can claim another guest’s orders by email
- **Files/functions:** `backend/app/api/v1/orders.py:claim_guest_orders`; `backend/app/services/orders/order_service.py:claim_guest_orders`.
- **Current:** the authenticated caller supplies an arbitrary email, and all unclaimed guest orders with that email are reassigned to the caller’s customer ID. The email is not compared with the authenticated user and no email/OTP proof is required.
- **Expected:** claim only the authenticated account’s verified email or require a signed, single-use claim proof.
- **Problem:** cross-customer order takeover and disclosure.
- **Recommended fix:** derive the email server-side from the verified user or validate a signed claim token; make the operation idempotent and audited.

## P1 — High

1. **Order response contract is incomplete on both tiers** — `ordersApi.js:normOrder` does not map items/totals/address/methods, while backend `OrderResponse` omits returns/customer projection; define and contract-test one complete read DTO.
2. **Async order detail used synchronously** — `OrderContext.getOrderById` and three account pages; use route-level async state or synchronous cache + explicit fetch.
3. **Admin analytics/RBAC/audit wrong token and dashboard mapping** — `apiClient.scopeForPath`, `adminApi.js`, `adminDashboardService`; use scoped clients, map `totalRevenue`, and surface partial failures.
4. **Cart line identity differs across tiers** — `utils/shopping.js:cartLineId`, `CartContext.getCartItemQuantity`, `cart_service.py:_cart_line_id`; define and contract-test one line-ID algorithm.
5. **Product create/update sync is fire-and-forget and identity/field mapping is broken** — frontend permanent IDs are sent to a generated-ID endpoint, frontend/backend ID formats conflict, returned IDs/errors are ignored, and the full editor DTO is not mapped to model fields. Define one ID convention, use `/draft` where intended, explicit DTOs, awaited lifecycle endpoints, and response reconciliation.
6. **Backend product lifecycle is not state-enforced** — approve publishes immediately, publish/approve/restore/unpublish accept invalid source states, PATCH can set status, and publish history records the wrong previous state; align and enforce one transition table server-side.
7. **Taxonomy hydration/lifecycle/visibility is not end-to-end** — subcategories are never fetched, pages treat Promises as results, body naming differs, new drafts disappear, activation is absent, restore adapters call the wrong endpoint, and archived category status is never passed into product/search visibility.
8. **Offers create/update/validate broken** — `OfferForm`, `offerRepository`, `offersApi`, `coupons.py`; add DTO mapping, preserve backend `ok`, add detail route or change consumer.
9. **Account write/security pages treat Promises as results** — profile/address/settings/security pages; await, expose errors, and call actual password endpoint.
10. **Password reset delivery/page incomplete** — `AuthService.forgot_password`, `ForgotPassword.jsx`, `ResetPassword.jsx`; external notification plus query token parsing.
11. **Admin/employee orders never load backend admin list** — `OrderProvider`, admin/employee order pages; add surface-appropriate read model, no local fallback.
12. **Admin return lifecycle remains local** — `OrderContext.applyReturnMutation`; use existing return APIs.
13. **Employee management write branching/reconciliation is broken** — `EmployeeManagementContext` checks customer scope; update/status/permissions stay local, while create/reset legacy helpers mishandle Promises/backend failure. Use admin scope and reconcile only successful server responses.
14. **Employee identity/assigned-product contract is incomplete** — login DTO omits employee profile, assigned/workflow/desk routes are empty TODOs, and product update compares employee code assignment to user UUID. Return/fetch one canonical employee identity and query assignments with it.
15. **Department/section GET route collision** — reorder/static route design in `employees.py`.
16. **Payment session ownership weak** — create/get/cancel do not consistently bind an existing order/session to the authenticated customer; enforce ownership (or a guest session secret) on all session operations.
17. **Order placement has no stock reservation/decrement** — integrate authoritative stock transaction before order confirmation.
18. **Backend authorization does not implement documented permissions** — customer admin reads and most admin routes; evaluate RBAC permissions server-side.
19. **Any active admin can create another admin** — `auth.py:sign_up_admin` and `AuthService.register_admin` do not enforce the documented `SUPER_ADMIN` role.
20. **Authenticated order routes are outside frontend protected route** — `App.jsx:348-350`; align route boundary with ownership expectation.
21. **Admin settings are neither writable through the current contract nor business-effective** — fix `settingsRepository`/`SettingsPatchRequest`, then make cart/order totals read authoritative stored rules.
22. **Collection and department catalogue scopes are silently dropped** — `CatalogueListing`, `data/products/taxonomy.js`, `useCatalogueQuery`, `productsApi`; call the collection-products route and define a backend-supported department/category mapping.
23. **Order creation is not idempotent** — `POST /orders` accepts no idempotency key and can duplicate orders/coupon usage on retry.
24. **Generated employee credentials are unrecoverable and custom permissions are not persisted** — `EmployeeService.create_employee/reset_employee_password/update_employee_permissions`, employee API responses, and `CredentialSheet` do not form a usable provisioning flow.
25. **Catalogue hydration is not reactive for `useCatalog` consumers** — the external-store snapshot keeps one mutable identity, leaving homepage sections on their initial empty state after a cold load.
26. **Guest cart cannot enter checkout** — frontend requires a signed-in user although backend order creation supports guests; either define login-required checkout explicitly or wire a secure guest flow/claim proof.
27. **Catalogue write caches are not invalidated** — product/category status and detail/list/recommendation responses can remain stale across separate cache backends for 2–10 minutes.
28. **PaymentStep collects sensitive details it does not use** — remove merchant-side card/CVV/UPI/bank forms and let Razorpay hosted checkout collect the selected method.

## P2 — Medium

1. Catalogue “load more” replaces pages and facets use only current page.
2. Catalog bootstrap/cache truncates cross-feature product visibility to 100.
3. Backend/frontend nested error envelopes disagree and adapter status is discarded.
4. Admin customer order/spend metrics are zero stubs; aliases/detail consumption are wrong.
5. Wishlist lacks product validation and may return stale mutation responses; known FKs remain deferred.
6. Recently viewed is split between backend writes and local reads.
7. Style preferences remain localStorage-only.
8. Home/explore uses hardcoded backend promotional content instead of DB offers/media.
9. Admin analytics metric semantics count unpaid/cancelled populations inconsistently.
10. Users/audit query parameter naming ignores filters/page sizes.
11. `revoke_other_sessions` cannot identify the current session and revokes all active sessions.
12. Admin practical login accepts email/phone, not the UUID stored as `adminId` in the profile.
13. Admin route guard rejects all non-super-admin users, regardless backend role permissions.
14. Customer registration does not populate profile DOB/name fields.
15. PDP 404 cannot render not-found because API status is lost.
16. Product normalization drops backend `originalPrice`, hiding sale comparison values.
17. Customer profile normalization drops loyalty/member-since aliases; current session detection is absent.
18. Deleting a backend default address can leave the address book with no persisted default.
19. Admin profile edits are local-snapshot-only but report successful persistence.
20. Backend audit endpoints have no mutation-side `ActivityLogModel` writers; frontend diary entries remain memory-only.
21. Specialized notification settings routes are shadowed by the earlier dynamic admin settings route.
22. Several admin taxonomy/offer/media pages read an unhydrated `catalogRepository` cache directly, so product selectors depend on visiting another product page first.
23. PDP breadcrumb uses the product slug as a category slug and routes to not-found.
24. Customer avatar sends a large data URL to a 1,000-character field instead of a media reference.

## P3 — Low

1. Stale comments still describe localStorage/demo architecture that code no longer uses.
2. Empty/dead demo source files (`demoOrders.js`, `seedWorkforce.js`) remain under runtime source.
3. Redis-named startup/shutdown logs describe the LRU shim inaccurately.
4. OAuth2 `tokenUrl` references `/auth/customer/login`, while implemented endpoint is `/sign-in` (documentation/OpenAPI issue).
5. Numerous legacy storage keys and compatibility adapters increase audit ambiguity.
6. Stub-only inventory/media/checkout/chatbot/etc. health endpoints return `status: "active"`, which can be mistaken for functional readiness.

## INFO

- Guest cart/wishlist client persistence is intentional.
- Static navigation labels, status maps, facet definitions and payment method labels are UI configuration.
- Static media files are assets, not structured product records.
- Two wishlist FK gaps are known and deferred; this audit recommends application validation without changing schema here.
- Razorpay, OAuth, email/SMS, object storage/CDN, courier tracking and real AI are external/future dependencies.

---

# 23. Recommended Implementation Order

## Phase 1 — Security and identity boundaries

1. Fix P0 product submit-review authorization.
2. Make API token scope explicit and scope refresh locks/events.
3. Validate restored customer/admin/employee sessions through scoped `/auth/me`/profile reads.
4. Align admin/employee identity DTOs and server-side RBAC checks.
5. Repair public collection/department scope mapping, subcategory hydration, stable external-store snapshots, category-status visibility, and product `originalPrice` normalization; these are read-oriented catalogue fixes that establish a trustworthy storefront baseline.

**Why first:** every later write/read test depends on reliable principals, correct tokens, and catalogue pages that select the intended products.

## Phase 2 — Order/payment trust model and checkout contract

1. Define the canonical pending-order/payment-session/verification sequence.
2. Fix checkout order DTO mapping and idempotency.
3. Prevent method-derived paid status.
4. Add stock reservation/transaction and full coupon revalidation.
5. Keep Razorpay in test mode until all contracts pass; COD can be validated without external gateway.

**Why second:** this removes financial/security risk and creates the authoritative order record needed by downstream workflows.

## Phase 3 — Order response/read model

1. Implement one frontend order/return DTO mapper.
2. Fix async detail loading.
3. Load customer/admin/employee-appropriate lists.
4. Replace synthesized tracking/invoice/return/admin transitions with existing APIs.

**Why third:** admin analytics, customer history, returns, employee fulfillment and payments all depend on coherent orders.

## Phase 4 — Customer cart/account consistency

1. Align cart line identity and method-dependent server totals.
2. Await account actions and implement customer password change.
3. Join backend recently viewed with UI consumers.
4. Decide/persist style preferences if they are a supported account feature.
5. Harden wishlist application validation while leaving schema FKs deferred.

## Phase 5 — Admin products, taxonomy, offers, settings

1. Define one canonical product ID format and make the permanent-ID create endpoint the only product creation path.
2. Map the complete editor DTO and make backend lifecycle endpoints the only subsequent product write path.
3. Align approval/publish lifecycle.
4. Await taxonomy/offer operations, map DTO naming, expose admin draft reads, and complete category/subcategory activation/restore paths.
5. Add/read offer detail or remove that expectation; preserve distinct draft/paused/archived semantics and eligibility fields.
6. Fix settings section/PATCH contracts and propagate settings to authoritative backend calculations.

## Phase 6 — Admin customers, employees and analytics

1. Implement customer order/spend aggregation and any required update/status APIs.
2. Fix employee management token checks/static route collision, return or securely deliver temporary credentials, persist role/custom permissions, and reconcile server responses.
3. Drive dashboard/full analytics from scoped backend endpoints with defined metric semantics.
4. Persist audit events server-side for all writes.

## Phase 7 — Employee workflows

1. Employee profile and assigned product APIs.
2. Employee-scoped order/customer/offer permissions/routes.
3. Attendance, leave, targets and performance self-service contracts.
4. Remove hardcoded employee desk records and browser-only business persistence.

## Phase 8 — Inventory, media and external capabilities

1. Design APIs over the authoritative existing schema constraints; do not invent data.
2. Inventory stock/movement/warehouse/transfer/reservation backend behavior.
3. Media metadata/upload/mapping/review plus object storage/CDN.
4. Courier tracking, notifications, OAuth, and AI provider integrations as separate external phases.

---

# 24. Known External Dependencies

| Dependency | Current state | Classification |
|---|---|---|
| PostgreSQL | Required and previously reachable; no credentials/rows inspected here | Required local infrastructure |
| Razorpay | SDK/service code exists; credentials/webhook required after contract fixes | **EXTERNAL CONFIGURATION REQUIRED** |
| Email/SMS password reset | Environment fields exist; send implementation TODO | **EXTERNAL CONFIGURATION + IMPLEMENTATION REQUIRED** |
| Google/Facebook OAuth | Routes/services exist; provider credentials and network required | **EXTERNAL CONFIGURATION REQUIRED** |
| Object storage/CDN | Settings exist; media API/storage integration absent | **BACKEND GAP + EXTERNAL CONFIGURATION REQUIRED** |
| Courier/tracking | No provider integration; tracking is generated/demo | **BACKEND/EXTERNAL GAP** |
| AI/LLM | Frontend deterministic mock; backend chatbot health only | **BACKEND/EXTERNAL GAP** |
| Redis | Replaced by in-process shim for normal dev | Not required for single-process dev |
| Celery | Worker/config remains, not imported by API runtime | Not required for normal dev |
| Docker | Optional deployment artifact | Not required for normal dev |

---

# 25. Explicit Blockers

1. Checkout customer DTO mismatch.
2. Online payment session/order persistence sequence mismatch.
3. Unverified non-COD payment trust in order creation.
4. Product workflow authorization vulnerability.
5. Guest-order claim permits cross-customer takeover by arbitrary email.
6. Broken order response normalization and async detail consumption.
7. Wrong token scope for non-`/admin` admin APIs.
8. Collection/department catalogue scope contracts are dropped.
9. Admin/employee order desks do not load their backend data.
10. Product/taxonomy/offer/employee writes do not reliably await/reconcile backend results.
11. Employee provisioning/reset loses generated credentials, custom permission updates persist nothing, and assigned/workflow/desk routes are placeholders.
12. Inventory functional endpoints do not exist.
13. Media functional endpoints/storage do not exist.
14. Password-reset notification delivery does not exist.
15. Cold-load catalogue hydration does not re-render homepage `useCatalog` consumers.
16. Category/subcategory activation and category-status product visibility are incomplete.
17. Razorpay cannot be tested until code-contract blockers are fixed and test credentials/webhook are configured.

---

# 26. Concise Final Assessment

## Already correctly integrated

- FastAPI `/api/v1` mounting and Vite relative proxy.
- Customer email/phone sign-in, sign-out, JWT/session persistence.
- Public product list/detail/recommendations from PostgreSQL.
- Public category/collection reads from PostgreSQL.
- Search product results from PostgreSQL.
- Core customer profile/address/preferences backend APIs.
- Authenticated cart backend persistence and server totals, aside from the cross-tier line-ID mismatch.
- Broad backend order/admin employee/analytics route capability.
- No Docker, Redis server, or Celery requirement for single-process normal development.

## Broken

- COD/online/guest checkout and the payment/order trust sequence.
- Guest-order claim ownership.
- Order frontend contract and detail pages.
- Managed collection/department scoping and cold-load homepage reactivity.
- Admin analytics/RBAC/audit token and metric mapping.
- Reliable admin product identity/field/lifecycle/cache behavior.
- Taxonomy/offer/settings lifecycle and contract handling.
- Admin/employee order and return desks.
- Customer account write feedback/password change.
- Employee provisioning, permissions and operational integration.

## Missing

- Functional inventory APIs.
- Functional media/upload/mapping/review APIs.
- Employee self attendance/leave/targets/performance APIs.
- Admin customer update/status APIs.
- Offer detail API.
- Real reset notification delivery, courier tracking, chatbot provider.

## Externally blocked

- Razorpay live/test execution, OAuth, email/SMS, object storage/CDN, courier and real AI providers.

## Safest implementation order

**Security/token isolation → checkout/payment/order trust → order DTO/read model → cart/account/wishlist → admin products/taxonomy/offers/settings → admin customers/employees/analytics → employee operations → inventory/media/external providers.**
