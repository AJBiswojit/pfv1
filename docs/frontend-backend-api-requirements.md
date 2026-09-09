# Frontend → backend API requirements

**Audience:** backend intern.  
**Rule:** every row is either a function in `frontend/src/services/api/*` (or `settingsRepository.js`) **or** a remaining UI screen with no client. Nothing is invented beyond those screens.

Base URL: `/api/v1`.

Auth scopes: `none` | `customer` | `admin` | `employee`. Wrong-portal tokens must 403.

Common error envelope the client already handles:

```json
{ "ok": false, "error": "human message", "code": "OPTIONAL", "status": 400, "details": {} }
```

List success typically `{ items, total, page, pageSize }` (orders also `{ orders, total }`).

## Counts

| Priority | APIs |
|---|---:|
| P0 | 81 |
| P1 | 115 |
| P2 | 34 |
| P3 | 3 |
| **Total** | **233** |

| Client status | Count |
|---|---:|
| exists (coded live client) | 198 |
| stub (`unavailable` / `BACKEND_GAP`) | 11 |
| missing (UI, no client) | 20 |

## Architecture constraints (every product/media API)

- APPROVE ≠ PUBLISH.
- Product IDs `PF-*` including kids `PF-K-*` are never regenerated from filenames.
- Product media register ≠ marketing media.
- Do not add notification inbox or customer review-write APIs.
- Empty catalogue/orders → empty arrays / zero KPIs, never demo rupees.
- Hydrate walks `GET /products` at `pageSize=100` until `items.length >= total`. Every page **must** include an honest `total` (blocker B-05). Do not omit `total` (client no longer fabricates page length; a full page without `total` fails hydrate).

## Auth

### API-AUTH-01 — Customer sign-up

- **Method / endpoint:** `POST /auth/customer/sign-up`
- **Purpose:** Create a customer account and issue JWT pair.
- **Used by:** F-CUS-SIGNUP
- **Auth:** none
- **Request:** `{"firstName","lastName","full_name","email","phone?","password","dateOfBirth?"}`
- **Response:** `{"access_token","refresh_token","user":{id,full_name,email,roles}}`
- **Errors:** 409 email taken; 422 validation
- **Priority:** P0
- **Status:** exists

### API-AUTH-02 — Customer sign-in

- **Method / endpoint:** `POST /auth/customer/sign-in`
- **Purpose:** Authenticate customer by email/phone identifier.
- **Used by:** F-CUS-SIGNIN
- **Auth:** none
- **Request:** `{"identifier","password"}`
- **Response:** `{"access_token","refresh_token","user"}`
- **Errors:** 401 invalid credentials; 403 inactive
- **Priority:** P0
- **Status:** exists

### API-AUTH-03 — Customer sign-out

- **Method / endpoint:** `POST /auth/customer/sign-out`
- **Purpose:** Invalidate customer refresh/session.
- **Used by:** F-CUS-SIGNOUT
- **Auth:** customer
- **Request:** `{}`
- **Response:** `{"ok":true}`
- **Errors:** 401 already expired (client still clears)
- **Priority:** P0
- **Status:** exists

### API-AUTH-04 — Customer forgot password

- **Method / endpoint:** `POST /auth/customer/forgot-password`
- **Purpose:** Start reset; always opaque success copy.
- **Used by:** F-CUS-FORGOT
- **Auth:** none
- **Request:** `{"identifier"}`
- **Response:** `{"message"}`
- **Errors:** 422 empty identifier
- **Priority:** P0
- **Status:** exists

### API-AUTH-05 — Customer reset password

- **Method / endpoint:** `POST /auth/customer/reset-password`
- **Purpose:** Set new password with emailed token.
- **Used by:** F-CUS-RESET
- **Auth:** none
- **Request:** `{"userId","token","newPassword","confirmPassword"}`
- **Response:** `{"ok":true}`
- **Errors:** 400 mismatch (client); 400/410 bad token
- **Priority:** P0
- **Status:** exists

### API-AUTH-06 — Customer change password

- **Method / endpoint:** `POST /auth/change-password`
- **Purpose:** Verify current password, rotate, revoke sessions.
- **Used by:** F-CUS-SECURITY
- **Auth:** customer
- **Request:** `{"currentPassword","newPassword","confirmPassword"}`
- **Response:** `{"message"}`
- **Errors:** 400 mismatch; 401 wrong current
- **Priority:** P0
- **Status:** exists

### API-AUTH-07 — Employee sign-in

- **Method / endpoint:** `POST /auth/employee/sign-in`
- **Purpose:** Authenticate employee by employeeId.
- **Used by:** F-EMP-LOGIN
- **Auth:** none
- **Request:** `{"employeeId","password"}`
- **Response:** `{"access_token","refresh_token","employee","mustChangePassword?"}`
- **Errors:** 401 invalid; 403 suspended
- **Priority:** P0
- **Status:** exists

### API-AUTH-08 — Employee change password

- **Method / endpoint:** `POST /auth/employee/change-password`
- **Purpose:** Force/self password change (snake_case body).
- **Used by:** F-EMP-CHANGE-PW
- **Auth:** employee
- **Request:** `{"old_password","new_password","confirm_password"}`
- **Response:** `{"ok":true}`
- **Errors:** 400 mismatch; 401 wrong current
- **Priority:** P0
- **Status:** exists

### API-AUTH-09 — Employee sign-out

- **Method / endpoint:** `POST /auth/employee/sign-out`
- **Purpose:** Invalidate employee session.
- **Used by:** F-EMP-LOGIN
- **Auth:** employee
- **Request:** `{}`
- **Response:** `{"ok":true}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-AUTH-10 — Admin sign-in

- **Method / endpoint:** `POST /auth/admin/sign-in`
- **Purpose:** Authenticate admin by adminId.
- **Used by:** F-ADM-LOGIN
- **Auth:** none
- **Request:** `{"adminId","password"}`
- **Response:** `{"access_token","refresh_token","admin"}`
- **Errors:** 401 invalid; 403 not admin
- **Priority:** P0
- **Status:** exists

### API-AUTH-11 — Admin sign-out

- **Method / endpoint:** `POST /auth/admin/sign-out`
- **Purpose:** Invalidate admin session.
- **Used by:** F-ADM-LOGIN
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{"ok":true}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-AUTH-12 — Current session

- **Method / endpoint:** `GET /auth/me`
- **Purpose:** Return the principal for the presented token (admin restore checks user_type=admin).
- **Used by:** F-ADM-LOGIN,F-CUS-ACCOUNT,F-EMP-LOGIN
- **Auth:** any JWT
- **Request:** `—`
- **Response:** `{id,full_name,email,roles,user_type,...}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-AUTH-13 — Restore customer profile

- **Method / endpoint:** `GET /customers/me`
- **Purpose:** Token is not a session without a customer profile row.
- **Used by:** F-CUS-ACCOUNT,F-CUS-PROFILE
- **Auth:** customer
- **Request:** `—`
- **Response:** `{profile|user}`
- **Errors:** 401; 404 profile missing
- **Priority:** P0
- **Status:** exists

### API-AUTH-14 — Restore employee profile

- **Method / endpoint:** `GET /employee/me`
- **Purpose:** Employee code + profile required; UUID alone is not enough.
- **Used by:** F-EMP-PROFILE,F-EMP-LOGIN
- **Auth:** employee
- **Request:** `—`
- **Response:** `{id,employee_code,full_name,roles,department}`
- **Errors:** 401; 404 profile missing
- **Priority:** P0
- **Status:** exists

### API-AUTH-15 — Employee forgot password

- **Method / endpoint:** `POST /auth/employee/forgot-password`
- **Purpose:** EmployeeForgotPassword page exists; no function in authApi.js. Do not reuse customer reset tokens.
- **Used by:** F-EMP-CHANGE-PW
- **Auth:** none
- **Request:** `{"employeeId|identifier"}`
- **Response:** `{"message"}`
- **Errors:** 422
- **Priority:** P1
- **Status:** missing

## Products (public)

### API-PROD-01 — List products

- **Method / endpoint:** `GET /products`
- **Purpose:** Published catalogue for Shop/category/search hydrate. Query: page,pageSize,sort,department,category,subcategory,collection,q,flags.
- **Used by:** F-CUS-SHOP,F-CUS-CATEGORY,F-CUS-HOME,F-CUS-KIDS
- **Auth:** none
- **Request:** `query page,pageSize<=100`. Hydrate walks pages; shop listings use pageSize 12.
- **Response:** `{"items|products":[Product],"total","page","pageSize"}` — `total` is the full published count for the filter, never the page length.
- **Errors:** 422 bad filter. BLOCKER B-05: omit `total` on a full page and hydrate fails rather than treating page 1 as the whole set.
- **Priority:** P0
- **Status:** exists

### API-PROD-02 — Get product

- **Method / endpoint:** `GET /products/{idOrSlug}`
- **Purpose:** PDP. Identity is Product ID or slug; never a filename.
- **Used by:** F-CUS-PDP
- **Auth:** none
- **Request:** `—`
- **Response:** `Product (unpublished → 404 for public)`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-PROD-03 — Recommendations

- **Method / endpoint:** `GET /products/{id}/recommendations`
- **Purpose:** Related products on PDP.
- **Used by:** F-CUS-PDP,F-CUS-RECS
- **Auth:** none
- **Request:** `—`
- **Response:** `{"items":[Product]}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-PROD-04 — Collection products

- **Method / endpoint:** `GET /collections/{collectionId}/products`
- **Purpose:** Products in a merchandising collection.
- **Used by:** F-CUS-COLLECTION
- **Auth:** none
- **Request:** `query page,pageSize`
- **Response:** `{"items","total"}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-PROD-05 — Recently viewed get

- **Method / endpoint:** `GET /products/recently-viewed`
- **Purpose:** Customer recently viewed rail.
- **Used by:** F-CUS-RECENT
- **Auth:** customer (or none if guest stored server-side — follow existing auth)
- **Request:** `—`
- **Response:** `{"items":[Product]}`
- **Errors:** 401
- **Priority:** P2
- **Status:** exists

### API-PROD-06 — Recently viewed add

- **Method / endpoint:** `POST /products/recently-viewed`
- **Purpose:** Record a PDP view.
- **Used by:** F-CUS-RECENT,F-CUS-PDP
- **Auth:** customer
- **Request:** `{"productId"}`
- **Response:** `{"ok":true}`
- **Errors:** 404 unknown product
- **Priority:** P2
- **Status:** exists

### API-PROD-07 — Submit product for review

- **Method / endpoint:** `POST /products/{id}/submit-review`
- **Purpose:** WORKFLOW submit (DRAFT→PENDING_REVIEW). Not a customer star-review.
- **Used by:** F-ADM-PRODUCT-WORKFLOW,F-EMP-PRODUCTS
- **Auth:** admin|employee
- **Request:** `{}`
- **Response:** `{product}`
- **Errors:** 409 illegal transition; 403
- **Priority:** P0
- **Status:** exists

## Products (admin/employee)

### API-APROD-01 — Admin list products

- **Method / endpoint:** `GET /admin/products`
- **Purpose:** Merchandising list including drafts. Query status,q,assigned,page,pageSize.
- **Used by:** F-ADM-PRODUCTS
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items","total","page"}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-APROD-02 — Admin create product

- **Method / endpoint:** `POST /admin/products`
- **Purpose:** Create with canonical id in body when allocated.
- **Used by:** F-ADM-PRODUCT-CREATE
- **Auth:** admin
- **Request:** `AdminProductPayload (no lifecycle keys that backend rejects)`
- **Response:** `{product}`
- **Errors:** 409 id/sku; 422 taxonomy
- **Priority:** P0
- **Status:** exists

### API-APROD-03 — Admin create draft

- **Method / endpoint:** `POST /admin/products/draft`
- **Purpose:** Create DRAFT with canonical Product ID.
- **Used by:** F-ADM-PRODUCT-CREATE
- **Auth:** admin
- **Request:** `{"id","...payload"}`
- **Response:** `{product status=DRAFT}`
- **Errors:** 409 id taken; 422 missing taxonomy
- **Priority:** P0
- **Status:** exists

### API-APROD-04 — Next Product ID

- **Method / endpoint:** `GET /admin/products/next-id`
- **Purpose:** Allocate next PF-{family}-{NNNN} for a taxonomy path. Do not use clocks.
- **Used by:** F-ADM-PRODUCT-CREATE,F-EMP-PRODUCT-CREATE
- **Auth:** admin
- **Request:** `query department,category,subcategory`
- **Response:** `{"id":"PF-W-SAR-SIL-0007"}`
- **Errors:** 422 unknown path
- **Priority:** P0
- **Status:** exists

### API-APROD-05 — Admin availability check

- **Method / endpoint:** `GET /admin/products/availability`
- **Purpose:** SKU/id collision check before save.
- **Used by:** F-ADM-PRODUCT-CREATE
- **Auth:** admin
- **Request:** `query sku,id`
- **Response:** `{"skuTaken","idTaken"}`
- **Errors:** 422
- **Priority:** P1
- **Status:** exists

### API-APROD-06 — Admin product metrics

- **Method / endpoint:** `GET /admin/products/metrics`
- **Purpose:** Counts by status/flags for product home tiles.
- **Used by:** F-ADM-PRODUCTS
- **Auth:** admin
- **Request:** `—`
- **Response:** `{total,published,drafts,pendingReview,archived,...}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-APROD-07 — Admin get product

- **Method / endpoint:** `GET /admin/products/{id}`
- **Purpose:** Full editor record including unpublished.
- **Used by:** F-ADM-PRODUCT-DETAIL,F-ADM-PRODUCT-EDIT
- **Auth:** admin
- **Request:** `—`
- **Response:** `{product}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-APROD-08 — Admin patch product

- **Method / endpoint:** `PATCH /admin/products/{id}`
- **Purpose:** Partial merchandising update. Must not accept status/publish shortcuts.
- **Used by:** F-ADM-PRODUCT-EDIT
- **Auth:** admin
- **Request:** `partial AdminProductPayload`
- **Response:** `{product}`
- **Errors:** 422; 409 sku
- **Priority:** P0
- **Status:** exists

### API-APROD-09 — Assign employee

- **Method / endpoint:** `POST /admin/products/{id}/assign`
- **Purpose:** Set assignedEmployeeId.
- **Used by:** F-ADM-PRODUCT-ASSIGN
- **Auth:** admin
- **Request:** `{"employeeId"|null}`
- **Response:** `{product}`
- **Errors:** 404 employee
- **Priority:** P1
- **Status:** exists

### API-APROD-10 — Approve product

- **Method / endpoint:** `POST /admin/products/{id}/approve`
- **Purpose:** PENDING_REVIEW → APPROVED. MUST NOT publish.
- **Used by:** F-ADM-PRODUCT-WORKFLOW
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{product status=APPROVED published=false}`
- **Errors:** 409 not in review
- **Priority:** P0
- **Status:** exists

### API-APROD-11 — Reject/return product

- **Method / endpoint:** `POST /admin/products/{id}/reject`
- **Purpose:** Return to DRAFT with reason (maps to returnProduct).
- **Used by:** F-ADM-PRODUCT-WORKFLOW
- **Auth:** admin
- **Request:** `{"reason"}`
- **Response:** `{product}`
- **Errors:** 422 missing reason; 409
- **Priority:** P0
- **Status:** exists

### API-APROD-12 — Publish product

- **Method / endpoint:** `POST /admin/products/{id}/publish`
- **Purpose:** APPROVED → PUBLISHED after full validation (name, sku, category, price>0, owned primary media, no review-flag blockers).
- **Used by:** F-ADM-PRODUCT-WORKFLOW
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{product published=true}`
- **Errors:** 409 not APPROVED; 422 publish-issues
- **Priority:** P0
- **Status:** exists

### API-APROD-13 — Unpublish product

- **Method / endpoint:** `POST /admin/products/{id}/unpublish`
- **Purpose:** PUBLISHED → DRAFT; storefront count drops.
- **Used by:** F-ADM-PRODUCT-WORKFLOW
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{product}`
- **Errors:** 409 not published
- **Priority:** P0
- **Status:** exists

### API-APROD-14 — Archive product

- **Method / endpoint:** `POST /admin/products/{id}/archive`
- **Purpose:** Soft-retire. Not a hard delete.
- **Used by:** F-ADM-PRODUCT-WORKFLOW
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{product status=ARCHIVED}`
- **Errors:** 409
- **Priority:** P0
- **Status:** exists

### API-APROD-15 — Restore product

- **Method / endpoint:** `POST /admin/products/{id}/restore`
- **Purpose:** ARCHIVED → DRAFT.
- **Used by:** F-ADM-PRODUCT-WORKFLOW
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{product}`
- **Errors:** 409
- **Priority:** P0
- **Status:** exists

### API-APROD-16 — Publish issues

- **Method / endpoint:** `GET /admin/products/{id}/publish-issues`
- **Purpose:** Same checks as publish, read-only.
- **Used by:** F-ADM-PRODUCT-WORKFLOW
- **Auth:** admin
- **Request:** `—`
- **Response:** `{"issues":[str]}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-APROD-17 — Change Product ID

- **Method / endpoint:** `POST /admin/products/{id}/change-id`
- **Purpose:** Admin rename within the same family prefix; media ownership moves with the command.
- **Used by:** F-ADM-PRODUCT-EDIT
- **Auth:** admin
- **Request:** `{"newProductId"}`
- **Response:** `{product}`
- **Errors:** 422 family mismatch; 409 taken
- **Priority:** P1
- **Status:** exists

### API-APROD-18 — Duplicate product

- **Method / endpoint:** `POST /admin/products/{id}/duplicate`
- **Purpose:** New canonical ID, new SKU, DRAFT; media stays on original.
- **Used by:** F-ADM-PRODUCT-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{product}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-APROD-19 — Bulk update

- **Method / endpoint:** `POST /admin/products/bulk`
- **Purpose:** Merchandising flags and/or per-product canonical commands. Bulk publish = same publish rules each.
- **Used by:** F-ADM-PRODUCTS
- **Auth:** admin
- **Request:** `{"ids":[],"patch":{}}`
- **Response:** `{"applied","skipped","results"}`
- **Errors:** 422 unknown status
- **Priority:** P1
- **Status:** exists

### API-APROD-20 — Clear review flags

- **Method / endpoint:** `POST /admin/products/{id}/review-flags/clear`
- **Purpose:** Resolve blocking review flags before publish.
- **Used by:** F-ADM-PRODUCT-WORKFLOW
- **Auth:** admin
- **Request:** `{"flags":[]}`
- **Response:** `{product}`
- **Errors:** 403
- **Priority:** P1
- **Status:** exists

### API-EPROD-01 — Employee get product

- **Method / endpoint:** `GET /employee/products/{id}`
- **Purpose:** Assigned/editable product for employee editor.
- **Used by:** F-EMP-PRODUCTS,F-EMP-PRODUCT-EDIT
- **Auth:** employee
- **Request:** `—`
- **Response:** `{product}`
- **Errors:** 403 not assigned; 404
- **Priority:** P0
- **Status:** exists

### API-EPROD-02 — Employee patch product

- **Method / endpoint:** `PATCH /employee/products/{id}`
- **Purpose:** Employee-editable fields only (pickEmployeeEditableFields).
- **Used by:** F-EMP-PRODUCT-EDIT
- **Auth:** employee
- **Request:** `partial employee payload`
- **Response:** `{product}`
- **Errors:** 403; 422
- **Priority:** P0
- **Status:** exists

### API-EPROD-03 — Assigned products

- **Method / endpoint:** `GET /employee/me/assigned-products`
- **Purpose:** Employee product inbox.
- **Used by:** F-EMP-PRODUCTS
- **Auth:** employee
- **Request:** `query page`
- **Response:** `{"items","total"}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

## Categories / taxonomy

### API-CAT-01 — List categories

- **Method / endpoint:** `GET /categories`
- **Purpose:** Public category tree for nav/listings.
- **Used by:** F-CUS-NAV,F-CUS-CATEGORY
- **Auth:** none
- **Request:** `—`
- **Response:** `{"items":[Category]}`
- **Errors:** —
- **Priority:** P0
- **Status:** exists

### API-CAT-02 — Get category

- **Method / endpoint:** `GET /categories/{idOrSlug}`
- **Purpose:** Category landing.
- **Used by:** F-CUS-CATEGORY
- **Auth:** none
- **Request:** `—`
- **Response:** `{category}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-CAT-03 — List subcategories

- **Method / endpoint:** `GET /categories/{categoryId}/subcategories`
- **Purpose:** Children for a category (includes kids boys/girls).
- **Used by:** F-CUS-CATEGORY,F-CUS-KIDS
- **Auth:** none
- **Request:** `—`
- **Response:** `{"items"}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-CAT-04 — Admin list categories

- **Method / endpoint:** `GET /admin/categories`
- **Purpose:** Admin category manager.
- **Used by:** F-ADM-CATEGORIES
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items","total"}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-CAT-05 — Admin get category

- **Method / endpoint:** `GET /admin/categories/{idOrSlug}`
- **Purpose:** Category editor.
- **Used by:** F-ADM-CATEGORY-EDIT
- **Auth:** admin
- **Request:** `—`
- **Response:** `{category}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-CAT-06 — Admin list subcategories

- **Method / endpoint:** `GET /admin/categories/{categoryId}/subcategories`
- **Purpose:** Subcategory manager.
- **Used by:** F-ADM-SUBCATEGORIES
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items"}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-CAT-07 — Create category

- **Method / endpoint:** `POST /admin/categories`
- **Purpose:** Add category under a department. Do not invent a second kids tree.
- **Used by:** F-ADM-CATEGORY-CREATE
- **Auth:** admin
- **Request:** `{name,slug,department,parentId?}`
- **Response:** `{category}`
- **Errors:** 409 slug
- **Priority:** P1
- **Status:** exists

### API-CAT-08 — Update category

- **Method / endpoint:** `PATCH /admin/categories/{id}`
- **Purpose:** Rename/visibility fields; do not rewrite product IDs.
- **Used by:** F-ADM-CATEGORY-EDIT
- **Auth:** admin
- **Request:** `partial`
- **Response:** `{category}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-CAT-09 — Activate category

- **Method / endpoint:** `POST /admin/categories/{id}/activate`
- **Purpose:** Make visible.
- **Used by:** F-ADM-CATEGORY-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{category}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-CAT-10 — Archive category

- **Method / endpoint:** `POST /admin/categories/{id}/archive`
- **Purpose:** Hide; products keep their IDs.
- **Used by:** F-ADM-CATEGORY-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{category}`
- **Errors:** 409 in-use — HUMAN DECISION if blocked
- **Priority:** P1
- **Status:** exists

### API-CAT-11 — Restore category

- **Method / endpoint:** `POST /admin/categories/{id}/restore`
- **Purpose:** Unarchive.
- **Used by:** F-ADM-CATEGORY-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{category}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-CAT-12 — Create subcategory

- **Method / endpoint:** `POST /admin/categories/{categoryId}/subcategories`
- **Purpose:** Add subcategory.
- **Used by:** F-ADM-SUBCATEGORIES
- **Auth:** admin
- **Request:** `{name,slug}`
- **Response:** `{subcategory}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-CAT-13 — Update subcategory

- **Method / endpoint:** `PATCH /admin/subcategories/{id}`
- **Purpose:** Edit subcategory.
- **Used by:** F-ADM-SUBCATEGORIES
- **Auth:** admin
- **Request:** `partial`
- **Response:** `{subcategory}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-CAT-14 — Activate subcategory

- **Method / endpoint:** `POST /admin/subcategories/{id}/activate`
- **Purpose:** Activate.
- **Used by:** F-ADM-SUBCATEGORIES
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{subcategory}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-CAT-15 — Archive subcategory

- **Method / endpoint:** `POST /admin/subcategories/{id}/archive`
- **Purpose:** Archive.
- **Used by:** F-ADM-SUBCATEGORIES
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{subcategory}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-CAT-16 — Restore subcategory

- **Method / endpoint:** `POST /admin/subcategories/{id}/restore`
- **Purpose:** Restore.
- **Used by:** F-ADM-SUBCATEGORIES
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{subcategory}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

## Collections

### API-COL-01 — List collections

- **Method / endpoint:** `GET /collections`
- **Purpose:** Storefront collections.
- **Used by:** F-CUS-COLLECTION,F-CUS-HOME
- **Auth:** none
- **Request:** `—`
- **Response:** `{"items"}`
- **Errors:** —
- **Priority:** P0
- **Status:** exists

### API-COL-02 — Get collection

- **Method / endpoint:** `GET /collections/{idOrSlug}`
- **Purpose:** Collection landing.
- **Used by:** F-CUS-COLLECTION
- **Auth:** none
- **Request:** `—`
- **Response:** `{collection}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-COL-03 — Admin list collections

- **Method / endpoint:** `GET /admin/collections`
- **Purpose:** Admin list.
- **Used by:** F-ADM-COLLECTIONS
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items","total"}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-COL-04 — Admin get collection

- **Method / endpoint:** `GET /admin/collections/{id}`
- **Purpose:** Editor.
- **Used by:** F-ADM-COLLECTION-EDIT
- **Auth:** admin
- **Request:** `—`
- **Response:** `{collection}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-COL-05 — Create collection

- **Method / endpoint:** `POST /admin/collections`
- **Purpose:** Create merchandising collection (not a product).
- **Used by:** F-ADM-COLLECTION-CREATE
- **Auth:** admin
- **Request:** `{name,slug,description?}`
- **Response:** `{collection}`
- **Errors:** 409 slug
- **Priority:** P1
- **Status:** exists

### API-COL-06 — Update collection

- **Method / endpoint:** `PATCH /admin/collections/{id}`
- **Purpose:** Edit.
- **Used by:** F-ADM-COLLECTION-EDIT
- **Auth:** admin
- **Request:** `partial`
- **Response:** `{collection}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-COL-07 — Activate collection

- **Method / endpoint:** `POST /admin/collections/{id}/activate`
- **Purpose:** Activate.
- **Used by:** F-ADM-COLLECTION-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{collection}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-COL-08 — Pause collection

- **Method / endpoint:** `POST /admin/collections/{id}/pause`
- **Purpose:** Pause.
- **Used by:** F-ADM-COLLECTION-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{collection}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-COL-09 — Archive collection

- **Method / endpoint:** `POST /admin/collections/{id}/archive`
- **Purpose:** Archive.
- **Used by:** F-ADM-COLLECTION-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{collection}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-COL-10 — Restore collection

- **Method / endpoint:** `POST /admin/collections/{id}/restore`
- **Purpose:** Restore.
- **Used by:** F-ADM-COLLECTION-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{collection}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-COL-11 — Assign collection products

- **Method / endpoint:** `PUT /admin/collections/{id}/products`
- **Purpose:** Replace membership list with Product IDs.
- **Used by:** F-ADM-COLLECTION-PRODUCTS
- **Auth:** admin
- **Request:** `{"productIds":[]}`
- **Response:** `{collection}`
- **Errors:** 404 unknown product
- **Priority:** P1
- **Status:** exists

### API-COL-12 — Taxonomy metrics

- **Method / endpoint:** `GET /admin/taxonomy/metrics`
- **Purpose:** Department/category counts for admin taxonomy home.
- **Used by:** F-ADM-CATEGORIES,F-ADM-COLLECTIONS
- **Auth:** admin
- **Request:** `—`
- **Response:** `{metrics}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-COL-13 — Taxonomy product counts

- **Method / endpoint:** `GET /admin/taxonomy/product-counts`
- **Purpose:** Product counts per node.
- **Used by:** F-ADM-CATEGORIES
- **Auth:** admin
- **Request:** `—`
- **Response:** `{counts}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

## Search / home / explore

### API-SRCH-01 — Search

- **Method / endpoint:** `GET /search`
- **Purpose:** Full-text + facets for /search and catalogue query.
- **Used by:** F-CUS-SEARCH,F-CUS-SHOP
- **Auth:** none
- **Request:** `query q,filters,page,pageSize,sort`
- **Response:** `{"items","total","facets?"}`
- **Errors:** 422
- **Priority:** P0
- **Status:** exists

### API-SRCH-02 — Explore

- **Method / endpoint:** `GET /explore`
- **Purpose:** Explore landing payload.
- **Used by:** F-CUS-EXPLORE
- **Auth:** none
- **Request:** `—`
- **Response:** `{sections}`
- **Errors:** —
- **Priority:** P1
- **Status:** exists

### API-SRCH-03 — Explore offers

- **Method / endpoint:** `GET /explore/offers`
- **Purpose:** Offers rail for Explore. Frontend Explore.jsx still calls getExploreOffers() — wiring gap B-06.
- **Used by:** F-CUS-EXPLORE,F-CUS-OFFERS
- **Auth:** none
- **Request:** `—`
- **Response:** `{"offers"}`
- **Errors:** —
- **Priority:** P1
- **Status:** exists

### API-SRCH-04 — Home

- **Method / endpoint:** `GET /home`
- **Purpose:** Hero, sections, sale banner. Hero plates are marketing media, not product media.
- **Used by:** F-CUS-HOME
- **Auth:** none
- **Request:** `—`
- **Response:** `{hero,sections,saleBanner}`
- **Errors:** —
- **Priority:** P0
- **Status:** exists

## Offers

### API-OFF-01 — List public offers

- **Method / endpoint:** `GET /offers`
- **Purpose:** Currently valid coupons for storefront.
- **Used by:** F-CUS-OFFERS,F-CUS-HOME
- **Auth:** none
- **Request:** `—`
- **Response:** `{"offers":[Coupon]}`
- **Errors:** —
- **Priority:** P1
- **Status:** exists

### API-OFF-02 — Validate offer code

- **Method / endpoint:** `POST /offers/validate`
- **Purpose:** Single checkout gate. 200 + ok:false is a real failure.
- **Used by:** F-CUS-CHECKOUT,F-CUS-CART
- **Auth:** none
- **Request:** `{"code","cart_items","customer_id?","customer_email?"}`
- **Response:** `{"ok","coupon","discount"} or {"ok":false,"error"}`
- **Errors:** unknown/inactive/min not met
- **Priority:** P0
- **Status:** exists

### API-OFF-03 — Admin list offers

- **Method / endpoint:** `GET /admin/offers`
- **Purpose:** Admin coupons. Query q,status,page,pageSize. counts + lifetimeRedemptions are full-set aggregates.
- **Used by:** F-ADM-OFFERS,F-EMP-OFFERS
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"offers","total","counts","lifetimeRedemptions"}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-OFF-04 — Admin get offer

- **Method / endpoint:** `GET /admin/offers/{id}`
- **Purpose:** Any status.
- **Used by:** F-ADM-OFFER-DETAIL
- **Auth:** admin
- **Request:** `—`
- **Response:** `{offer}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-OFF-05 — Create offer

- **Method / endpoint:** `POST /admin/offers`
- **Purpose:** Create coupon. discount_type ∈ percentage|fixed|free_shipping. Do not persist UI-only fields (priority, auto-apply).
- **Used by:** F-ADM-OFFER-CREATE
- **Auth:** admin
- **Request:** `CreateCouponRequest (see offersApi.buildOfferPayload)`
- **Response:** `{offer}`
- **Errors:** 409 duplicate code; 422 window/percent
- **Priority:** P1
- **Status:** exists

### API-OFF-06 — Update offer

- **Method / endpoint:** `PATCH /admin/offers/{id}`
- **Purpose:** Partial update; omitted keys must not reset.
- **Used by:** F-ADM-OFFER-EDIT
- **Auth:** admin
- **Request:** `UpdateCouponRequest`
- **Response:** `{offer}`
- **Errors:** 409; 422
- **Priority:** P1
- **Status:** exists

### API-OFF-07 — Activate offer

- **Method / endpoint:** `POST /admin/offers/{id}/activate`
- **Purpose:** Activate.
- **Used by:** F-ADM-OFFER-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{offer}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-OFF-08 — Pause offer

- **Method / endpoint:** `POST /admin/offers/{id}/pause`
- **Purpose:** Pause.
- **Used by:** F-ADM-OFFER-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{offer}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-OFF-09 — Archive offer

- **Method / endpoint:** `POST /admin/offers/{id}/archive`
- **Purpose:** Archive.
- **Used by:** F-ADM-OFFER-EDIT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{offer}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

## Cart

### API-CART-01 — Get cart

- **Method / endpoint:** `GET /cart`
- **Purpose:** Authenticated cart. Guest carts stay local until sign-in.
- **Used by:** F-CUS-CART
- **Auth:** customer
- **Request:** `—`
- **Response:** `{items,count,totals,coupon,coupon_lapsed}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-CART-02 — Add cart item

- **Method / endpoint:** `POST /cart/items`
- **Purpose:** Add variant line. Server validates stock.
- **Used by:** F-CUS-CART,F-CUS-PDP
- **Auth:** customer
- **Request:** `{"productId","color?","size?","quantity"}`
- **Response:** `{cart}`
- **Errors:** 409 out of stock; 404
- **Priority:** P0
- **Status:** exists

### API-CART-03 — Update cart item

- **Method / endpoint:** `PATCH /cart/items/{lineId}`
- **Purpose:** Change quantity.
- **Used by:** F-CUS-CART
- **Auth:** customer
- **Request:** `{"quantity"}`
- **Response:** `{cart}`
- **Errors:** 409 stock; 404
- **Priority:** P0
- **Status:** exists

### API-CART-04 — Remove cart item

- **Method / endpoint:** `DELETE /cart/items/{lineId}`
- **Purpose:** Remove line.
- **Used by:** F-CUS-CART
- **Auth:** customer
- **Request:** `—`
- **Response:** `{cart}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-CART-05 — Clear cart

- **Method / endpoint:** `DELETE /cart`
- **Purpose:** Empty cart.
- **Used by:** F-CUS-CART
- **Auth:** customer
- **Request:** `—`
- **Response:** `{"ok":true}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-CART-06 — Apply coupon

- **Method / endpoint:** `POST /cart/coupon`
- **Purpose:** Attach code; totals remain server-owned.
- **Used by:** F-CUS-CART,F-CUS-CHECKOUT
- **Auth:** customer
- **Request:** `{"code"}`
- **Response:** `{coupon,message,cart?}`
- **Errors:** 400 invalid
- **Priority:** P0
- **Status:** exists

### API-CART-07 — Remove coupon

- **Method / endpoint:** `DELETE /cart/coupon`
- **Purpose:** Detach code.
- **Used by:** F-CUS-CART
- **Auth:** customer
- **Request:** `—`
- **Response:** `{"ok":true}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-CART-08 — Cart totals

- **Method / endpoint:** `GET /cart/totals`
- **Purpose:** Totals for deliveryMethod + paymentMethod (COD fee).
- **Used by:** F-CUS-CHECKOUT
- **Auth:** customer
- **Request:** `query deliveryMethod,paymentMethod`
- **Response:** `{subtotal,product_discount,coupon_discount,shipping,cod_fee,total,saved}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

## Wishlist

### API-WISH-01 — Get wishlist

- **Method / endpoint:** `GET /wishlist`
- **Purpose:** Customer wishlist product IDs/records.
- **Used by:** F-CUS-WISHLIST
- **Auth:** customer
- **Request:** `—`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-WISH-02 — Add wishlist

- **Method / endpoint:** `POST /wishlist/{productId}`
- **Purpose:** Add.
- **Used by:** F-CUS-WISHLIST,F-CUS-PDP
- **Auth:** customer
- **Request:** `{}`
- **Response:** `{wishlist}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-WISH-03 — Remove wishlist

- **Method / endpoint:** `DELETE /wishlist/{productId}`
- **Purpose:** Remove.
- **Used by:** F-CUS-WISHLIST
- **Auth:** customer
- **Request:** `—`
- **Response:** `{wishlist}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-WISH-04 — Toggle wishlist

- **Method / endpoint:** `POST /wishlist/{productId}/toggle`
- **Purpose:** Add or remove.
- **Used by:** F-CUS-WISHLIST
- **Auth:** customer
- **Request:** `{}`
- **Response:** `{"inWishlist","items"}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

## Customers

### API-CUS-01 — Update profile

- **Method / endpoint:** `PATCH /customers/me`
- **Purpose:** Name/phone/avatar fields the client sends.
- **Used by:** F-CUS-PROFILE
- **Auth:** customer
- **Request:** `{first_name?,last_name?,phone?}`
- **Response:** `{profile}`
- **Errors:** 422
- **Priority:** P0
- **Status:** exists

### API-CUS-02 — Update preferences

- **Method / endpoint:** `PATCH /customers/me/preferences`
- **Purpose:** Email/SMS marketing prefs — not a notification inbox.
- **Used by:** F-CUS-PREFERENCES
- **Auth:** customer
- **Request:** `{preferences}`
- **Response:** `{preferences}`
- **Errors:** 422
- **Priority:** P1
- **Status:** exists

### API-CUS-03 — Revoke other sessions

- **Method / endpoint:** `POST /customers/me/sessions/revoke-others`
- **Purpose:** Security page: keep this device only.
- **Used by:** F-CUS-SECURITY
- **Auth:** customer
- **Request:** `{}`
- **Response:** `{"ok":true}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-CUS-04 — List addresses

- **Method / endpoint:** `GET /customers/me/addresses`
- **Purpose:** Address book.
- **Used by:** F-CUS-ADDRESSES,F-CUS-CHECKOUT
- **Auth:** customer
- **Request:** `—`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-CUS-05 — Add address

- **Method / endpoint:** `POST /customers/me/addresses`
- **Purpose:** Create.
- **Used by:** F-CUS-ADDRESSES
- **Auth:** customer
- **Request:** `{name,phone,line1,line2,city,state,pincode,country?}`
- **Response:** `{address}`
- **Errors:** 422
- **Priority:** P0
- **Status:** exists

### API-CUS-06 — Update address

- **Method / endpoint:** `PATCH /customers/me/addresses/{addressId}`
- **Purpose:** Edit.
- **Used by:** F-CUS-ADDRESSES
- **Auth:** customer
- **Request:** `partial`
- **Response:** `{address}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-CUS-07 — Delete address

- **Method / endpoint:** `DELETE /customers/me/addresses/{addressId}`
- **Purpose:** Delete.
- **Used by:** F-CUS-ADDRESSES
- **Auth:** customer
- **Request:** `—`
- **Response:** `{"ok":true}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-CUS-08 — Default address

- **Method / endpoint:** `POST /customers/me/addresses/{addressId}/default`
- **Purpose:** Set default.
- **Used by:** F-CUS-ADDRESSES
- **Auth:** customer
- **Request:** `{}`
- **Response:** `{address}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-CUS-09 — Admin list customers

- **Method / endpoint:** `GET /admin/customers`
- **Purpose:** CRM list.
- **Used by:** F-ADM-CUSTOMERS,F-EMP-CUSTOMERS
- **Auth:** admin
- **Request:** `query q,page,pageSize`
- **Response:** `{"items","total"}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-CUS-10 — Admin get customer

- **Method / endpoint:** `GET /admin/customers/{customerId}`
- **Purpose:** Customer dossier.
- **Used by:** F-ADM-CUSTOMER-DETAIL
- **Auth:** admin
- **Request:** `—`
- **Response:** `{customer}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

## Orders / returns / fulfillment

### API-ORD-01 — Place order

- **Method / endpoint:** `POST /orders`
- **Purpose:** Canonical checkout. Client sends items (productId/color/size/quantity), customer, address, deliveryMethod, paymentMethod, couponCode, idempotencyKey. NO prices.
- **Used by:** F-CUS-CHECKOUT,F-CUS-ORDER-SUCCESS
- **Auth:** customer (guest allowed)
- **Request:** `buildPlaceOrderRequest`
- **Response:** `{order}`
- **Errors:** 409 stock; 422 address; 400 payment
- **Priority:** P0
- **Status:** exists

### API-ORD-02 — List my orders

- **Method / endpoint:** `GET /orders`
- **Purpose:** Customer orders; ownership from session not a client customerId.
- **Used by:** F-CUS-ORDERS
- **Auth:** customer
- **Request:** `query page,pageSize,sort=newest|oldest`
- **Response:** `{"orders","total","page"}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-ORD-03 — Get order

- **Method / endpoint:** `GET /orders/{orderId}`
- **Purpose:** Order detail read model. Missing tracking/invoice flags must be false, not invented.
- **Used by:** F-CUS-ORDER-DETAIL
- **Auth:** customer
- **Request:** `—`
- **Response:** `{order}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-ORD-04 — Tracking

- **Method / endpoint:** `GET /orders/{orderId}/tracking`
- **Purpose:** Stored progress only. No fake courier scans.
- **Used by:** F-CUS-TRACKING
- **Auth:** customer
- **Request:** `—`
- **Response:** `{tracking, carrierEventsAvailable:false unless stored}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-ORD-05 — Cancel order

- **Method / endpoint:** `POST /orders/{orderId}/cancel`
- **Purpose:** Customer cancel when lifecycle allows.
- **Used by:** F-CUS-ORDER-DETAIL
- **Auth:** customer
- **Request:** `{"reason","note"}`
- **Response:** `{order}`
- **Errors:** 409 not cancellable
- **Priority:** P0
- **Status:** exists

### API-ORD-06 — Create return

- **Method / endpoint:** `POST /orders/{orderId}/returns`
- **Purpose:** Customer return request.
- **Used by:** F-CUS-RETURN
- **Auth:** customer
- **Request:** `{"items","pickupMethod"}`
- **Response:** `{return_order}`
- **Errors:** 409 window; 422 items
- **Priority:** P1
- **Status:** exists

### API-ORD-07 — Get return

- **Method / endpoint:** `GET /orders/{orderId}/returns/{returnId}`
- **Purpose:** Return status.
- **Used by:** F-CUS-RETURN
- **Auth:** customer
- **Request:** `—`
- **Response:** `{return_order}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-ORD-08 — Claim guest orders

- **Method / endpoint:** `POST /orders/claim-guest`
- **Purpose:** Attach guest orders to the authenticated email.
- **Used by:** F-CUS-ORDERS
- **Auth:** customer
- **Request:** `{"email"? must match account}`
- **Response:** `{"claimed","message"}`
- **Errors:** 403 email mismatch
- **Priority:** P1
- **Status:** exists

### API-AORD-01 — Admin list orders

- **Method / endpoint:** `GET /admin/orders`
- **Purpose:** Fulfillment inbox.
- **Used by:** F-ADM-ORDERS,F-EMP-ORDERS
- **Auth:** admin
- **Request:** `query status,customerId,q,page,pageSize`
- **Response:** `{"orders","total"}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

### API-AORD-02 — Admin get order

- **Method / endpoint:** `GET /admin/orders/{id}`
- **Purpose:** Detail.
- **Used by:** F-ADM-ORDER-DETAIL
- **Auth:** admin
- **Request:** `—`
- **Response:** `{order}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-AORD-03 — Admin invoice metadata

- **Method / endpoint:** `GET /admin/orders/{id}/invoice`
- **Purpose:** Metadata only. documentAvailable false unless a file exists. Do not fake a PDF URL.
- **Used by:** F-ADM-INVOICE
- **Auth:** admin
- **Request:** `—`
- **Response:** `{invoice_number,invoice_issued_at,documentAvailable,downloadUrl}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-AORD-04 — Allocate

- **Method / endpoint:** `POST /admin/orders/{id}/allocate`
- **Purpose:** Fulfillment: allocate stock.
- **Used by:** F-ADM-FULFILLMENT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-AORD-05 — Start picking

- **Method / endpoint:** `POST /admin/orders/{id}/pick/start`
- **Purpose:** Start pick.
- **Used by:** F-ADM-FULFILLMENT,F-EMP-WAREHOUSE
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-AORD-06 — Pick item

- **Method / endpoint:** `POST /admin/orders/{id}/pick/item`
- **Purpose:** Pick one line.
- **Used by:** F-ADM-FULFILLMENT
- **Auth:** admin
- **Request:** `{"orderItemId"}`
- **Response:** `{order}`
- **Errors:** 404 item
- **Priority:** P1
- **Status:** exists

### API-AORD-07 — Pack

- **Method / endpoint:** `POST /admin/orders/{id}/pack`
- **Purpose:** Mark packed.
- **Used by:** F-ADM-FULFILLMENT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-AORD-08 — Ready

- **Method / endpoint:** `POST /admin/orders/{id}/ready`
- **Purpose:** Ready for dispatch.
- **Used by:** F-ADM-FULFILLMENT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-AORD-09 — Out for delivery

- **Method / endpoint:** `POST /admin/orders/{id}/out-for-delivery`
- **Purpose:** OFD.
- **Used by:** F-ADM-FULFILLMENT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-AORD-10 — Deliver

- **Method / endpoint:** `POST /admin/orders/{id}/deliver`
- **Purpose:** Delivered.
- **Used by:** F-ADM-FULFILLMENT
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-AORD-11 — Assign fulfillment

- **Method / endpoint:** `POST /admin/orders/{id}/fulfillment`
- **Purpose:** locationId + handlerId.
- **Used by:** F-ADM-FULFILLMENT
- **Auth:** admin
- **Request:** `{"locationId","handlerId"}`
- **Response:** `{order}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-AORD-12 — Dispatch

- **Method / endpoint:** `POST /admin/orders/{id}/dispatch`
- **Purpose:** Carrier + tracking number (stored, not scraped).
- **Used by:** F-ADM-FULFILLMENT
- **Auth:** admin
- **Request:** `{"carrier?","trackingNumber?","estimatedDelivery?"}`
- **Response:** `{order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-AORD-13 — Admin cancel

- **Method / endpoint:** `POST /admin/orders/{id}/cancel`
- **Purpose:** Admin cancel.
- **Used by:** F-ADM-ORDERS
- **Auth:** admin
- **Request:** `{"reason?","note?"}`
- **Response:** `{order}`
- **Errors:** 409
- **Priority:** P0
- **Status:** exists

### API-AORD-14 — Add note

- **Method / endpoint:** `POST /admin/orders/{id}/notes`
- **Purpose:** Internal note.
- **Used by:** F-ADM-ORDER-DETAIL
- **Auth:** admin
- **Request:** `{"note"}`
- **Response:** `{order}`
- **Errors:** 422
- **Priority:** P2
- **Status:** exists

### API-AORD-15 — Apply status

- **Method / endpoint:** `POST /admin/orders/{id}/status`
- **Purpose:** Allowed lifecycle hop.
- **Used by:** F-ADM-ORDERS
- **Auth:** admin
- **Request:** `{"status","note?"}`
- **Response:** `{order}`
- **Errors:** 409 illegal
- **Priority:** P1
- **Status:** exists

### API-AORD-16 — Force status

- **Method / endpoint:** `POST /admin/orders/{id}/force-status`
- **Purpose:** Break-glass with reason.
- **Used by:** F-ADM-ORDERS
- **Auth:** admin
- **Request:** `{"status","reason"}`
- **Response:** `{order}`
- **Errors:** 403; 422 reason
- **Priority:** P2
- **Status:** exists

### API-RET-01 — Admin list returns

- **Method / endpoint:** `GET /admin/returns`
- **Purpose:** Returns desk.
- **Used by:** F-ADM-RETURNS,F-EMP-RETURNS
- **Auth:** admin
- **Request:** `query status,orderId,customerId,page,pageSize`
- **Response:** `{"returns","total"}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-RET-02 — Admin get return

- **Method / endpoint:** `GET /admin/returns/{id}`
- **Purpose:** Return detail.
- **Used by:** F-ADM-RETURN-DETAIL
- **Auth:** admin
- **Request:** `—`
- **Response:** `{return_order}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-RET-03 — Approve return

- **Method / endpoint:** `POST /admin/returns/{id}/approve`
- **Purpose:** Approve.
- **Used by:** F-ADM-RETURNS
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{return_order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-RET-04 — Reject return

- **Method / endpoint:** `POST /admin/returns/{id}/reject`
- **Purpose:** Reject with customer message.
- **Used by:** F-ADM-RETURNS
- **Auth:** admin
- **Request:** `{"reason","customerMessage"}`
- **Response:** `{return_order}`
- **Errors:** 422
- **Priority:** P1
- **Status:** exists

### API-RET-05 — Schedule pickup

- **Method / endpoint:** `POST /admin/returns/{id}/schedule-pickup`
- **Purpose:** Pickup window.
- **Used by:** F-ADM-RETURNS
- **Auth:** admin
- **Request:** `{"scheduledAt","pickupAddress"}`
- **Response:** `{return_order}`
- **Errors:** 422
- **Priority:** P1
- **Status:** exists

### API-RET-06 — Receive return

- **Method / endpoint:** `POST /admin/returns/{id}/receive`
- **Purpose:** Warehouse receive.
- **Used by:** F-ADM-RETURNS,F-EMP-WAREHOUSE
- **Auth:** admin
- **Request:** `{"packageCondition","notes"}`
- **Response:** `{return_order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-RET-07 — Inspect return

- **Method / endpoint:** `POST /admin/returns/{id}/inspect`
- **Purpose:** QC.
- **Used by:** F-ADM-RETURNS
- **Auth:** admin
- **Request:** `{"inspectionCondition","notes"}`
- **Response:** `{return_order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-RET-08 — Initiate refund

- **Method / endpoint:** `POST /admin/returns/{id}/refund/initiate`
- **Purpose:** Start refund.
- **Used by:** F-ADM-RETURNS
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{return_order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-RET-09 — Complete refund

- **Method / endpoint:** `POST /admin/returns/{id}/refund/complete`
- **Purpose:** Complete refund.
- **Used by:** F-ADM-RETURNS
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{return_order}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

## Payments

### API-PAY-01 — Create payment session

- **Method / endpoint:** `POST /payments/session`
- **Purpose:** Start payment for an order/checkout.
- **Used by:** F-CUS-CHECKOUT
- **Auth:** customer
- **Request:** `{"orderId?","method?" — follow paymentsApi}`
- **Response:** `{session}`
- **Errors:** 409; 402
- **Priority:** P0
- **Status:** exists

### API-PAY-02 — Get payment session

- **Method / endpoint:** `GET /payments/session/{sessionId}`
- **Purpose:** Poll session.
- **Used by:** F-CUS-CHECKOUT,F-CUS-ORDER-SUCCESS
- **Auth:** customer
- **Request:** `query as client sends`
- **Response:** `{session}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-PAY-03 — Cancel payment session

- **Method / endpoint:** `POST /payments/session/{sessionId}/cancel`
- **Purpose:** Abort.
- **Used by:** F-CUS-CHECKOUT
- **Auth:** customer
- **Request:** `{}`
- **Response:** `{session}`
- **Errors:** 409 already captured
- **Priority:** P1
- **Status:** exists

### API-PAY-04 — Verify payment

- **Method / endpoint:** `POST /payments/verify`
- **Purpose:** Confirm provider callback / client verify.
- **Used by:** F-CUS-CHECKOUT
- **Auth:** customer
- **Request:** `provider payload as paymentsApi`
- **Response:** `{ok,order,payment}`
- **Errors:** 400 mismatch
- **Priority:** P0
- **Status:** exists

## Product media

### API-MED-01 — Storage status

- **Method / endpoint:** `GET /media/storage/status`
- **Purpose:** Provider + URL prefix. No credentials.
- **Used by:** F-ADM-MEDIA,F-ADM-MEDIA-UPLOAD
- **Auth:** none
- **Request:** `—`
- **Response:** `{provider,prefix,cdn?}`
- **Errors:** —
- **Priority:** P1
- **Status:** exists

### API-MED-02 — Resolve references

- **Method / endpoint:** `POST /media/references/resolve`
- **Purpose:** Map stored refs to URLs (resolved|legacy-fallback|passthrough|empty|disabled).
- **Used by:** F-CUS-PDP,F-CUS-SHOP,F-ADM-MEDIA
- **Auth:** none
- **Request:** `{"references":[str]}`
- **Response:** `{"items","total"}`
- **Errors:** 422
- **Priority:** P0
- **Status:** exists

### API-MED-03 — Object meta

- **Method / endpoint:** `GET /media/object-meta/{key}`
- **Purpose:** size/mime/sha256.
- **Used by:** F-ADM-MEDIA-DETAIL
- **Auth:** none
- **Request:** `—`
- **Response:** `{meta}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-MED-04 — Product media set

- **Method / endpoint:** `GET /media/products/{id}/media-set`
- **Purpose:** Primary + gallery from product-owned associations.
- **Used by:** F-CUS-PDP,F-ADM-PRODUCT-MEDIA,F-EMP-MEDIA
- **Auth:** none
- **Request:** `—`
- **Response:** `{primary,gallery,mediaItems,mediaRecordsAvailable}`
- **Errors:** 404
- **Priority:** P0
- **Status:** exists

### API-MED-05 — Upload object

- **Method / endpoint:** `POST /media/objects`
- **Purpose:** Store bytes. Does not create a media record.
- **Used by:** F-ADM-MEDIA-UPLOAD
- **Auth:** admin
- **Request:** `multipart file,namespace,productId?,group?`
- **Response:** `{object,key,url}`
- **Errors:** 413; 415
- **Priority:** P0
- **Status:** exists

### API-MED-06 — Upload product-scoped object

- **Method / endpoint:** `POST /media/products/{id}/objects`
- **Purpose:** Upload whose key namespace cannot be spoofed.
- **Used by:** F-ADM-PRODUCT-MEDIA,F-EMP-MEDIA-UPLOAD
- **Auth:** admin|employee as currently scoped
- **Request:** `multipart file`
- **Response:** `{object}`
- **Errors:** 404 product; 413
- **Priority:** P0
- **Status:** exists

### API-MED-07 — Delete object

- **Method / endpoint:** `DELETE /media/objects/{key}`
- **Purpose:** Named delete only. No GC of public/images.
- **Used by:** F-ADM-MEDIA
- **Auth:** admin
- **Request:** `—`
- **Response:** `{ok}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-MED-08 — Register media

- **Method / endpoint:** `POST /media/register`
- **Purpose:** Create MediaAsset + optional ProductMedia. Idempotent on object key. NEVER marketing.
- **Used by:** F-ADM-MEDIA-UPLOAD,F-ADM-PRODUCT-MEDIA
- **Auth:** admin
- **Request:** `multipart object_key,product_id?,role,sort_order,is_primary,title,alt_text`
- **Response:** `{media,assigned,assignment}`
- **Errors:** 404 object missing; 409 ownership
- **Priority:** P0
- **Status:** exists

### API-MED-09 — List media assets

- **Method / endpoint:** `GET /media/assets`
- **Purpose:** Admin library of registered assets.
- **Used by:** F-ADM-MEDIA,F-ADM-MEDIA-MAPPING
- **Auth:** admin
- **Request:** `—`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P0
- **Status:** exists

## Marketing media (gap)

### API-MMED-01 — List marketing media (admin)

- **Method / endpoint:** `GET /admin/marketing/media`
- **Purpose:** List marketing media entries, optional placement filter, activeOnly. Distinct from product media.
- **Used by:** F-ADM-MARKETING-MEDIA,F-CUS-HOME
- **Auth:** admin (media.view)
- **Request:** `?placement=HOME_HERO&activeOnly=true`
- **Response:** `{"ok": true, "items": [MarketingMediaResponse], "total", "placement"}`
- **Errors:** 401,403,422 invalid placement
- **Priority:** P1
- **Status:** exists — B-02 RESOLVED

### API-MMED-05 — Create marketing media (admin)

- **Method / endpoint:** `POST /admin/marketing/media`
- **Purpose:** Create one marketing placement entry (e.g. HOME_HERO position).
- **Used by:** F-ADM-MARKETING-MEDIA
- **Auth:** admin (media.upload)
- **Request:** `{"placement": "HOME_HERO", "objectKey": "hero/hero001.avif", "title", "subtitle", "ctaLabel", "ctaHref", "sortOrder", "isActive"}`
- **Response:** `201 MarketingMediaResponse with url`
- **Errors:** 400 invalid key, 409 duplicate (placement+object_key), 422 validation
- **Priority:** P1
- **Status:** exists — B-02

### API-MMED-06 — Get one marketing media (admin)

- **Method / endpoint:** `GET /admin/marketing/media/{id}`
- **Purpose:** Get single marketing media entry.
- **Auth:** admin (media.view)
- **Response:** `MarketingMediaResponse`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists — B-02

### API-MMED-07 — Update marketing media (admin)

- **Method / endpoint:** `PATCH /admin/marketing/media/{id}`
- **Purpose:** Update metadata, ordering, activation.
- **Auth:** admin (media.assign)
- **Request:** partial `{"placement?", "objectKey?", "title?", "sortOrder?", "isActive?"}`
- **Response:** `MarketingMediaResponse`
- **Errors:** 404,409 duplicate,422
- **Priority:** P1
- **Status:** exists — B-02

### API-MMED-08 — Delete marketing media (admin)

- **Method / endpoint:** `DELETE /admin/marketing/media/{id}`
- **Purpose:** Delete placement entry.
- **Auth:** admin (media.delete)
- **Response:** `{"ok": true, "deleted": id}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists — B-02

### API-MMED-09 — Reorder marketing media (admin)

- **Method / endpoint:** `PUT /admin/marketing/media/reorder`
- **Purpose:** Bulk reorder entries within a placement (deterministic ordering).
- **Auth:** admin (media.assign)
- **Request:** `{"placement": "HOME_HERO", "items": [{"id", "sortOrder"}]}`
- **Response:** `{"ok": true, "items": [ordered]}`
- **Errors:** 404 missing ids,422
- **Priority:** P1
- **Status:** exists — B-02

### API-MMED-10 — Get active placement (public)

- **Method / endpoint:** `GET /marketing/placements/{placement}`
- **Purpose:** Public active entries for a placement (storefront).
- **Auth:** none
- **Response:** `{"ok": true, "items": [active ordered], "total", "placement"}`
- **Errors:** 422 invalid placement
- **Priority:** P0
- **Status:** exists — B-02

### API-MMED-11 — Get HOME_HERO (public)

- **Method / endpoint:** `GET /marketing/hero`
- **Purpose:** Public active HOME_HERO (alias for placement).
- **Auth:** none
- **Response:** `{"ok": true, "items": [active ordered HOME_HERO], "total", "placement": "HOME_HERO"}`
- **Priority:** P0
- **Status:** exists — B-02

### API-MMED-02 — List media reviews

- **Method / endpoint:** `GET /admin/media-reviews`
- **Purpose:** Marketing/product-mapping review queue.
- **Used by:** F-ADM-MEDIA-REVIEW
- **Auth:** admin
- **Request:** `query status`
- **Response:** `{"items"}`
- **Errors:** BACKEND_GAP
- **Priority:** P1
- **Status:** stub

### API-MMED-03 — Approve media review

- **Method / endpoint:** `POST /admin/media-reviews/{id}/approve`
- **Purpose:** Approve assignment. Does not publish a product.
- **Used by:** F-ADM-MEDIA-REVIEW
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{review}`
- **Errors:** BACKEND_GAP
- **Priority:** P1
- **Status:** stub

### API-MMED-04 — Reject media review

- **Method / endpoint:** `POST /admin/media-reviews/{id}/reject`
- **Purpose:** Reject with reason.
- **Used by:** F-ADM-MEDIA-REVIEW
- **Auth:** admin
- **Request:** `{"reason"}`
- **Response:** `{review}`
- **Errors:** BACKEND_GAP
- **Priority:** P1
- **Status:** stub

## Inventory (schema stub)

### API-INV-01 — List stock

- **Method / endpoint:** `GET /admin/inventory/stock`
- **Purpose:** Variant on-hand/reserved/available. Path is the intern contract matching inventoryApi.apiListStock — align with existing inventory router without a second ledger.
- **Used by:** F-ADM-INVENTORY,F-EMP-INVENTORY
- **Auth:** admin
- **Request:** `query warehouseId,q,page`
- **Response:** `{"items":[{productId,variantId,sku,onHand,reserved,available}]}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

### API-INV-02 — Get stock item

- **Method / endpoint:** `GET /admin/inventory/stock/{id}`
- **Purpose:** One SKU/variant.
- **Used by:** F-ADM-INVENTORY
- **Auth:** admin
- **Request:** `—`
- **Response:** `{item}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

### API-INV-03 — Adjust stock

- **Method / endpoint:** `POST /admin/inventory/adjust`
- **Purpose:** Signed adjustment + reason. UI: receive/adjust pages.
- **Used by:** F-ADM-INV-ADJUST,F-EMP-INV-ADJUST
- **Auth:** admin
- **Request:** `{"sku|variantId","delta","reason"}`
- **Response:** `{item,movement}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

### API-INV-04 — List movements

- **Method / endpoint:** `GET /admin/inventory/movements`
- **Purpose:** Ledger history.
- **Used by:** F-ADM-INV-MOVEMENTS,F-EMP-INV-MOVEMENTS
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items"}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

### API-INV-05 — Low stock

- **Method / endpoint:** `GET /admin/inventory/low-stock`
- **Purpose:** Below threshold.
- **Used by:** F-ADM-INV-LOW,F-EMP-INV-LOW
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items"}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

### API-INV-06 — Reservations

- **Method / endpoint:** `GET /admin/inventory/reservations`
- **Purpose:** Cart/order reservations.
- **Used by:** F-ADM-INVENTORY
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items"}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

### API-INV-07 — List warehouses

- **Method / endpoint:** `GET /admin/warehouses`
- **Purpose:** Locations.
- **Used by:** F-ADM-WAREHOUSES,F-EMP-WAREHOUSE
- **Auth:** admin
- **Request:** `—`
- **Response:** `{"items"}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

### API-INV-08 — Create warehouse

- **Method / endpoint:** `POST /admin/warehouses`
- **Purpose:** Create location.
- **Used by:** F-ADM-WAREHOUSES
- **Auth:** admin
- **Request:** `{name,code,address?}`
- **Response:** `{warehouse}`
- **Errors:** schema B-01
- **Priority:** P2
- **Status:** stub

### API-INV-09 — List transfers

- **Method / endpoint:** `GET /admin/inventory/transfers`
- **Purpose:** Warehouse transfers.
- **Used by:** F-ADM-INV-TRANSFERS,F-EMP-INV-TRANSFERS
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items"}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

### API-INV-10 — Create transfer

- **Method / endpoint:** `POST /admin/inventory/transfers`
- **Purpose:** Create transfer.
- **Used by:** F-ADM-INV-TRANSFERS
- **Auth:** admin
- **Request:** `{from,to,lines}`
- **Response:** `{transfer}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

### API-INV-11 — Complete transfer

- **Method / endpoint:** `POST /admin/inventory/transfers/{id}/complete`
- **Purpose:** Complete transfer.
- **Used by:** F-ADM-INV-TRANSFERS
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{transfer}`
- **Errors:** schema B-01
- **Priority:** P1
- **Status:** stub

## Employees / org

### API-EMP-01 — List employees

- **Method / endpoint:** `GET /admin/employees`
- **Purpose:** Directory.
- **Used by:** F-ADM-EMPLOYEES,F-EMP-TEAM
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items","total"}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-EMP-02 — Get employee

- **Method / endpoint:** `GET /admin/employees/{id}`
- **Purpose:** Dossier.
- **Used by:** F-ADM-EMPLOYEE-DETAIL
- **Auth:** admin
- **Request:** `—`
- **Response:** `{employee}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-EMP-03 — Create employee

- **Method / endpoint:** `POST /admin/employees`
- **Purpose:** Create with employee_code. No demo passwords in responses.
- **Used by:** F-ADM-EMPLOYEE-CREATE
- **Auth:** admin
- **Request:** `{employeeId/code,name,email,role,department,password?}`
- **Response:** `{employee}`
- **Errors:** 409 code
- **Priority:** P1
- **Status:** exists

### API-EMP-04 — Update employee

- **Method / endpoint:** `PATCH /admin/employees/{id}`
- **Purpose:** Profile/role.
- **Used by:** F-ADM-EMPLOYEE-EDIT
- **Auth:** admin
- **Request:** `partial`
- **Response:** `{employee}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-EMP-05 — Employee status

- **Method / endpoint:** `POST /admin/employees/{id}/status`
- **Purpose:** ACTIVE/SUSPENDED/INACTIVE.
- **Used by:** F-ADM-EMPLOYEE-EDIT
- **Auth:** admin
- **Request:** `{"status"}`
- **Response:** `{employee}`
- **Errors:** 409
- **Priority:** P1
- **Status:** exists

### API-EMP-06 — Reset employee password

- **Method / endpoint:** `POST /admin/employees/{id}/reset-password`
- **Purpose:** Admin reset. Do not log the new password.
- **Used by:** F-ADM-EMPLOYEE-EDIT
- **Auth:** admin
- **Request:** `{"password?"}`
- **Response:** `{"ok":true}`
- **Errors:** 403
- **Priority:** P1
- **Status:** exists

### API-EMP-07 — Employee permissions

- **Method / endpoint:** `PUT /admin/employees/{id}/permissions`
- **Purpose:** Permission set.
- **Used by:** F-ADM-EMPLOYEE-EDIT
- **Auth:** admin
- **Request:** `{"permissions":[]}`
- **Response:** `{employee}`
- **Errors:** 422
- **Priority:** P2
- **Status:** exists

### API-EMP-08 — Delete employee

- **Method / endpoint:** `DELETE /admin/employees/{id}`
- **Purpose:** Remove/deactivate per backend rule. HUMAN DECISION if hard vs suspend.
- **Used by:** F-ADM-EMPLOYEES
- **Auth:** admin
- **Request:** `—`
- **Response:** `{"ok":true}`
- **Errors:** 409 has assignments
- **Priority:** P2
- **Status:** exists

### API-EMP-09 — List departments

- **Method / endpoint:** `GET /admin/employees/departments`
- **Purpose:** Org departments (workforce, not catalogue departments).
- **Used by:** F-ADM-EMPLOYEES
- **Auth:** admin
- **Request:** `—`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** exists

### API-EMP-10 — Create department

- **Method / endpoint:** `POST /admin/employees/departments`
- **Purpose:** Create org unit.
- **Used by:** F-ADM-EMPLOYEES
- **Auth:** admin
- **Request:** `{name,code}`
- **Response:** `{department}`
- **Errors:** 409
- **Priority:** P2
- **Status:** exists

### API-EMP-11 — Update department

- **Method / endpoint:** `PATCH /admin/employees/departments/{id}`
- **Purpose:** Edit org unit.
- **Used by:** F-ADM-EMPLOYEES
- **Auth:** admin
- **Request:** `partial`
- **Response:** `{department}`
- **Errors:** 404
- **Priority:** P2
- **Status:** exists

### API-EMP-12 — Delete department

- **Method / endpoint:** `DELETE /admin/employees/departments/{id}`
- **Purpose:** Delete org unit.
- **Used by:** F-ADM-EMPLOYEES
- **Auth:** admin
- **Request:** `—`
- **Response:** `{"ok"}`
- **Errors:** 409 in use
- **Priority:** P2
- **Status:** exists

### API-EMP-13 — List sections

- **Method / endpoint:** `GET /admin/employees/sections`
- **Purpose:** Org sections.
- **Used by:** F-ADM-EMPLOYEES
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** exists

### API-EMP-14 — Create section

- **Method / endpoint:** `POST /admin/employees/sections`
- **Purpose:** Create.
- **Used by:** F-ADM-EMPLOYEES
- **Auth:** admin
- **Request:** `{name,departmentId}`
- **Response:** `{section}`
- **Errors:** 409
- **Priority:** P2
- **Status:** exists

### API-EMP-15 — Update section

- **Method / endpoint:** `PATCH /admin/employees/sections/{id}`
- **Purpose:** Edit.
- **Used by:** F-ADM-EMPLOYEES
- **Auth:** admin
- **Request:** `partial`
- **Response:** `{section}`
- **Errors:** 404
- **Priority:** P2
- **Status:** exists

### API-EMP-16 — Delete section

- **Method / endpoint:** `DELETE /admin/employees/sections/{id}`
- **Purpose:** Delete.
- **Used by:** F-ADM-EMPLOYEES
- **Auth:** admin
- **Request:** `—`
- **Response:** `{"ok"}`
- **Errors:** 409
- **Priority:** P2
- **Status:** exists

## Attendance (admin exists, employee punch missing)

### API-ATT-01 — Admin get employee attendance

- **Method / endpoint:** `GET /admin/employees/{employeeId}/attendance`
- **Purpose:** History for one employee.
- **Used by:** F-ADM-EMPLOYEE-DETAIL,F-EMP-ATTENDANCE
- **Auth:** admin
- **Request:** `query from,to`
- **Response:** `{"items"}`
- **Errors:** 404
- **Priority:** P1
- **Status:** exists

### API-ATT-02 — Admin create attendance

- **Method / endpoint:** `POST /admin/employees/{employeeId}/attendance`
- **Purpose:** Admin mark/correct punch.
- **Used by:** F-ADM-EMPLOYEE-DETAIL
- **Auth:** admin
- **Request:** `{date,checkIn?,checkOut?,status?,reason?}`
- **Response:** `{record}`
- **Errors:** 409 duplicate
- **Priority:** P1
- **Status:** exists

### API-ATT-03 — Admin update attendance

- **Method / endpoint:** `PATCH /admin/employees/attendance/{attendanceId}`
- **Purpose:** Correction with reason.
- **Used by:** F-ADM-EMPLOYEE-DETAIL
- **Auth:** admin
- **Request:** `partial + reason`
- **Response:** `{record}`
- **Errors:** 422 reason required
- **Priority:** P1
- **Status:** exists

### API-ATT-04 — Employee check-in

- **Method / endpoint:** `POST /employee/attendance/check-in`
- **Purpose:** Self punch. Frontend checkIn() currently fail-closes. Needed because EmployeeAttendance UI exists.
- **Used by:** F-EMP-ATTENDANCE
- **Auth:** employee
- **Request:** `{"at?"}`
- **Response:** `{record,lateMinutes,message}`
- **Errors:** 409 already in; 403 on leave
- **Priority:** P1
- **Status:** missing

### API-ATT-05 — Employee check-out

- **Method / endpoint:** `POST /employee/attendance/check-out`
- **Purpose:** Self punch out.
- **Used by:** F-EMP-ATTENDANCE
- **Auth:** employee
- **Request:** `{"at?"}`
- **Response:** `{record,workMinutes,message}`
- **Errors:** 409 no check-in
- **Priority:** P1
- **Status:** missing

### API-ATT-06 — Employee today

- **Method / endpoint:** `GET /employee/attendance/today`
- **Purpose:** Today's row for the signed-in employee.
- **Used by:** F-EMP-ATTENDANCE,F-EMP-DASHBOARD
- **Auth:** employee
- **Request:** `—`
- **Response:** `{record}`
- **Errors:** 401
- **Priority:** P1
- **Status:** missing

### API-ATT-07 — Employee attendance history

- **Method / endpoint:** `GET /employee/attendance`
- **Purpose:** Month history.
- **Used by:** F-EMP-ATTENDANCE
- **Auth:** employee
- **Request:** `query month`
- **Response:** `{"items","summary"}`
- **Errors:** 401
- **Priority:** P1
- **Status:** missing

## Leave / performance (UI, no client)

### API-LEV-01 — Employee list leave

- **Method / endpoint:** `GET /employee/leave`
- **Purpose:** Own leave requests. EmployeeLeave page exists; leaveRepository is empty in-memory.
- **Used by:** F-EMP-LEAVE
- **Auth:** employee
- **Request:** `query status`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** missing

### API-LEV-02 — Employee apply leave

- **Method / endpoint:** `POST /employee/leave`
- **Purpose:** Apply.
- **Used by:** F-EMP-LEAVE
- **Auth:** employee
- **Request:** `{startDate,endDate,reason,type}`
- **Response:** `{leave}`
- **Errors:** 422 overlap
- **Priority:** P2
- **Status:** missing

### API-LEV-03 — Admin list leave

- **Method / endpoint:** `GET /admin/leave`
- **Purpose:** Approve queue. Admin employee detail needs it; no typed client yet — only because the leave UI/admin employee surface exists.
- **Used by:** F-ADM-EMPLOYEE-DETAIL,F-EMP-LEAVE
- **Auth:** admin
- **Request:** `query employeeId,status`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** missing

### API-LEV-04 — Admin decide leave

- **Method / endpoint:** `POST /admin/leave/{id}/decision`
- **Purpose:** approve|reject.
- **Used by:** F-ADM-EMPLOYEE-DETAIL
- **Auth:** admin
- **Request:** `{"decision","notes"}`
- **Response:** `{leave}`
- **Errors:** 409
- **Priority:** P2
- **Status:** missing

### API-PERF-01 — Employee performance

- **Method / endpoint:** `GET /employee/performance`
- **Purpose:** Own review. EmployeePerformance page exists.
- **Used by:** F-EMP-PERFORMANCE
- **Auth:** employee
- **Request:** `query period`
- **Response:** `{reviews,summary}`
- **Errors:** 401
- **Priority:** P2
- **Status:** missing

### API-PERF-02 — Admin performance

- **Method / endpoint:** `GET /admin/performance`
- **Purpose:** Team reviews. Page /employee/performance/:employeeId + admin employee.
- **Used by:** F-EMP-PERFORMANCE,F-ADM-EMPLOYEE-DETAIL
- **Auth:** admin
- **Request:** `query employeeId,period`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** missing

## Analytics / RBAC / audit

### API-AN-01 — Analytics overview

- **Method / endpoint:** `GET /analytics/overview`
- **Purpose:** Admin dashboard KPIs. Empty ledger → zeros, never demo rupees.
- **Used by:** F-ADM-DASHBOARD,F-ADM-ANALYTICS
- **Auth:** admin
- **Request:** `query from,to`
- **Response:** `{kpis}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-AN-02 — Analytics sales

- **Method / endpoint:** `GET /analytics/sales`
- **Purpose:** Sales series.
- **Used by:** F-ADM-AN-SALES,F-EMP-REPORTS-SALES
- **Auth:** admin
- **Request:** `query`
- **Response:** `{series,totals}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-AN-03 — Analytics products

- **Method / endpoint:** `GET /analytics/products`
- **Purpose:** Top products.
- **Used by:** F-ADM-AN-PRODUCTS,F-EMP-REPORTS-PRODUCTS
- **Auth:** admin
- **Request:** `query`
- **Response:** `{items}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-AN-04 — Analytics customers

- **Method / endpoint:** `GET /analytics/customers`
- **Purpose:** Top customers.
- **Used by:** F-ADM-AN-CUSTOMERS,F-EMP-REPORTS-CUSTOMERS
- **Auth:** admin
- **Request:** `query`
- **Response:** `{items}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-AN-05 — Analytics orders

- **Method / endpoint:** `GET /analytics/orders`
- **Purpose:** Order funnel.
- **Used by:** F-ADM-DASHBOARD,F-ADM-ANALYTICS
- **Auth:** admin
- **Request:** `query`
- **Response:** `{counts,series}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-AN-06 — Inventory summary analytics

- **Method / endpoint:** `GET /analytics/inventory-summary`
- **Purpose:** Dashboard tile only — not the stock ledger.
- **Used by:** F-ADM-DASHBOARD,F-ADM-AN-INVENTORY
- **Auth:** admin
- **Request:** `—`
- **Response:** `{onHand,lowStock,out}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-RBAC-01 — List roles

- **Method / endpoint:** `GET /roles`
- **Purpose:** RBAC for settings.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `—`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** exists

### API-RBAC-02 — Get role

- **Method / endpoint:** `GET /roles/{roleId}`
- **Purpose:** Role detail.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `—`
- **Response:** `{role}`
- **Errors:** 404
- **Priority:** P2
- **Status:** exists

### API-RBAC-03 — List permissions

- **Method / endpoint:** `GET /permissions`
- **Purpose:** Permission catalogue.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `—`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** exists

### API-RBAC-04 — List users

- **Method / endpoint:** `GET /users`
- **Purpose:** Admin user list if settings uses it.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** exists

### API-RBAC-05 — Get user

- **Method / endpoint:** `GET /users/{userId}`
- **Purpose:** User detail.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `—`
- **Response:** `{user}`
- **Errors:** 404
- **Priority:** P2
- **Status:** exists

### API-AUD-01 — Audit logs

- **Method / endpoint:** `GET /audit/logs`
- **Purpose:** Admin activity page.
- **Used by:** F-ADM-ACTIVITY
- **Auth:** admin
- **Request:** `query`
- **Response:** `{"items","total"}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

## Settings

### API-SET-01 — Get all settings

- **Method / endpoint:** `GET /admin/settings`
- **Purpose:** All sections merged with UI defaults client-side.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `—`
- **Response:** `{sections}`
- **Errors:** 401
- **Priority:** P1
- **Status:** exists

### API-SET-02 — Get settings section

- **Method / endpoint:** `GET /admin/settings/{section}`
- **Purpose:** One section.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `—`
- **Response:** `{data}`
- **Errors:** 404 unknown section
- **Priority:** P1
- **Status:** exists

### API-SET-03 — Patch settings section

- **Method / endpoint:** `PATCH /admin/settings/{section}`
- **Purpose:** Save section. Body {data: values}.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `{"data":{}}`
- **Response:** `{data}`
- **Errors:** 422
- **Priority:** P1
- **Status:** exists

### API-SET-04 — Reset settings section

- **Method / endpoint:** `POST /admin/settings/{section}/reset`
- **Purpose:** Reset one section.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{"ok"}`
- **Errors:** 404
- **Priority:** P2
- **Status:** exists

### API-SET-05 — Reset all settings

- **Method / endpoint:** `POST /admin/settings/reset`
- **Purpose:** Reset all.
- **Used by:** F-ADM-SETTINGS
- **Auth:** admin
- **Request:** `{}`
- **Response:** `{"ok"}`
- **Errors:** 403
- **Priority:** P2
- **Status:** exists

## Employee desks (UI empty, no client)

### API-SUP-01 — List support cases

- **Method / endpoint:** `GET /employee/support/cases`
- **Purpose:** Care desk. Pages exist; rows emptied of dummy names.
- **Used by:** F-EMP-SUPPORT
- **Auth:** employee
- **Request:** `query status`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** missing

### API-SUP-02 — Create support case

- **Method / endpoint:** `POST /employee/support/cases`
- **Purpose:** Open a case against a real customer/order id.
- **Used by:** F-EMP-SUPPORT
- **Auth:** employee
- **Request:** `{customerId?,orderId?,subject,body}`
- **Response:** `{case}`
- **Errors:** 404
- **Priority:** P2
- **Status:** missing

### API-SUP-03 — Update support case

- **Method / endpoint:** `PATCH /employee/support/cases/{id}`
- **Purpose:** Status/notes.
- **Used by:** F-EMP-SUPPORT
- **Auth:** employee
- **Request:** `partial`
- **Response:** `{case}`
- **Errors:** 404
- **Priority:** P2
- **Status:** missing

### API-STY-01 — Styling appointments

- **Method / endpoint:** `GET /employee/styling/appointments`
- **Purpose:** Styling desk.
- **Used by:** F-EMP-STYLING
- **Auth:** employee
- **Request:** `query`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** missing

### API-STY-02 — Styling requests

- **Method / endpoint:** `GET /employee/styling/requests`
- **Purpose:** Open book.
- **Used by:** F-EMP-STYLING
- **Auth:** employee
- **Request:** `query`
- **Response:** `{"items"}`
- **Errors:** 401
- **Priority:** P2
- **Status:** missing

### API-SALE-01 — Departmental floor sales

- **Method / endpoint:** `GET /employee/sales/departments`
- **Purpose:** MUST be derived from orders, not a parallel sales DB. Employee sales desk exists.
- **Used by:** F-EMP-SALES,F-EMP-REPORTS-SALES
- **Auth:** employee
- **Request:** `query date`
- **Response:** `{"rows":[{department,billed,tickets}]}`
- **Errors:** 401
- **Priority:** P2
- **Status:** missing

## AI (preview UI, no client)

### API-AI-01 — Shopping assistant

- **Method / endpoint:** `POST /ai/shopping`
- **Purpose:** Customer AI Shopping page. Until live, UI must stay preview.
- **Used by:** F-CUS-AI-SHOPPING
- **Auth:** customer
- **Request:** `{"message","context?"}`
- **Response:** `{reply,products?}`
- **Errors:** 503 disabled
- **Priority:** P3
- **Status:** missing

### API-AI-02 — AI Mirror

- **Method / endpoint:** `POST /ai/mirror`
- **Purpose:** Account AI Mirror page.
- **Used by:** F-CUS-AI-MIRROR
- **Auth:** customer
- **Request:** `{"message","productId?"}`
- **Response:** `{reply}`
- **Errors:** 503
- **Priority:** P3
- **Status:** missing

### API-AI-03 — Admin AI assistant

- **Method / endpoint:** `POST /admin/ai/assistant`
- **Purpose:** AdminInsights / AiBusinessAssistant pages.
- **Used by:** F-ADM-AI
- **Auth:** admin
- **Request:** `{"message"}`
- **Response:** `{reply}`
- **Errors:** 503
- **Priority:** P3
- **Status:** missing

## Explicitly out of scope

| Temptation | Why out |
|---|---|
| Notification inbox | Admin header: not in this phase; prefs already in settings |
| `POST` customer product reviews | Display-only `rating`/`reviewCount`; no write UI |
| Chatbot router just because it is mounted | Customer AI pages are P3 and un-wired |
| Second catalogue or kids micro-app | Kids is a department |
| Demo employees / rupees | Seed file deleted; desks emptied |

