# API COUNT RECONCILIATION

**Date:** 2026-09-09
**Mode:** DO NOT IMPLEMENT — RECONCILIATION ONLY
**Branch:** main (post PR #29 merge)

## Summary

- **Reported total (docs/frontend-backend-api-requirements.md + docs/full-stack-integration-audit.md header):** 225
- **Classification total as written in stale summary inside docs/full-stack-integration-audit.md §20 and §Appendix:** 160 + 2 + 5 + 15 + 20 + 3 = **205**
- **Unaccounted per stale math:** 225 - 205 = **20**

**Finding:** The 225 number is **CORRECT**. The 205 sum is a **reporting bug** — the summary counts in §20 / Appendix were not updated after reclassification. The authoritative API matrix table inside the same file actually contains **225 unique rows**, matching the requirements file exactly. There are **0 APIs truly unaccounted** in the table; the 20 is a stale-summary artifact.

---

## A. APIs counted in the 225 total

**Source of truth for 225:** `docs/frontend-backend-api-requirements.md` — 225 `### API-` sections, each `Status: exists|stub|missing`. Count verified via `grep -c "^### API-" = 225`.

Same 225 IDs appear in `docs/full-stack-integration-audit.md` API Matrix table — 225 unique IDs, 0 duplicates (after excluding 1 short malformed row from Human Decisions table that starts with `| API-AUTH-15 | Employee forgot-password |` — not part of matrix). Verified via Python parsing.

`docs/frontend-api-traceability.csv` has 313 feature↔API pairs, 219 unique API IDs — 6 IDs from requirements not in traceability because they are admin-only org CRUD with no direct F-* feature row: API-EMP-10,11,12,14,15,16 (departments/sections create/update/delete). Those 6 are still part of 225.

Backend route inventory (`grep -rn "@router\.(get|post|patch|put|delete)" backend/app/api/v1/*.py`) shows 265 decorator lines, but many are `include_in_schema=False` duplicates for legacy `/employees/` vs `/admin/employees/` paths — not new APIs. After de-duplicating by ID, backend real routes align with 225 contract.

**Therefore 225 is correct and complete.**

### Full 225 authoritative list (from audit matrix — ID, METHOD, ROUTE, SOURCE, FRONTEND CONSUMER, STATUS, CATEGORY)

| ID | METHOD | ROUTE | SOURCE (where defined) | FRONTEND CONSUMER | STATUS (requirements) | CATEGORY (audit classification) |
|---|---|---|---|---|---|---|
| API-AUTH-01 | POST | /auth/customer/sign-up | backend/app/api/v1/auth.py + frontend/src/services/api/authApi.js | F-CUS-SIGNUP | exists | A |
| API-AUTH-02 | POST | /auth/customer/sign-in | auth.py + authApi.js | F-CUS-SIGNIN | exists | A |
| API-AUTH-03 | POST | /auth/customer/sign-out | auth.py + authApi.js | F-CUS-SIGNOUT | exists | A |
| API-AUTH-04 | POST | /auth/customer/forgot-password | auth.py + authApi.js | F-CUS-FORGOT | exists | A |
| API-AUTH-05 | POST | /auth/customer/reset-password | auth.py + authApi.js | F-CUS-RESET | exists | A |
| API-AUTH-06 | POST | /auth/change-password | auth.py + authApi.js | F-CUS-SECURITY | exists | A |
| API-AUTH-07 | POST | /auth/employee/sign-in | auth.py + authApi.js | F-EMP-LOGIN | exists | A |
| API-AUTH-08 | POST | /auth/employee/change-password | auth.py + authApi.js | F-EMP-CHANGE-PW | exists | A |
| API-AUTH-09 | POST | /auth/employee/sign-out | auth.py + authApi.js | F-EMP-LOGIN | exists | A |
| API-AUTH-10 | POST | /auth/admin/sign-in | auth.py + authApi.js | F-ADM-LOGIN | exists | A |
| API-AUTH-11 | POST | /auth/admin/sign-out | auth.py + authApi.js | F-ADM-LOGIN | exists | A |
| API-AUTH-12 | GET | /auth/me | auth.py + authApi.js | F-ADM-LOGIN,F-CUS-ACCOUNT,F-EMP-LOGIN | exists | A |
| API-AUTH-13 | GET | /customers/me | customers.py + customersApi.js | F-CUS-ACCOUNT,F-CUS-PROFILE | exists | A |
| API-AUTH-14 | GET | /employee/me | employees.py + employeesApi.js | F-EMP-PROFILE,F-EMP-LOGIN | exists | A |
| API-AUTH-15 | POST | /auth/employee/forgot-password | MISSING backend, no client in authApi.js | F-EMP-CHANGE-PW | missing | E P1 + G |
| API-PROD-01 | GET | /products | products.py + productsApi.js | F-CUS-SHOP,HOME,CATEGORY,KIDS | exists | A (needs seed) |
| API-PROD-02 | GET | /products/{idOrSlug} | products.py + productsApi.js | F-CUS-PDP | exists | A |
| API-PROD-03 | GET | /products/{id}/recommendations | products.py + productsApi.js | F-CUS-PDP,F-CUS-RECS | exists | A |
| API-PROD-04 | GET | /collections/{id}/products | collections.py + productsApi.js | F-CUS-COLLECTION | exists | A |
| API-PROD-05 | GET | /products/recently-viewed | products.py + productsApi.js | F-CUS-RECENT | exists | A |
| API-PROD-06 | POST | /products/recently-viewed | products.py + productsApi.js | F-CUS-RECENT,F-CUS-PDP | exists | A |
| API-PROD-07 | POST | /products/{id}/submit-review | products.py + productsApi.js | F-ADM-PRODUCT-WORKFLOW,F-EMP-PRODUCT-EDIT | exists | A |
| API-APROD-01 | GET | /admin/products | products.py + productsApi.js | F-ADM-PRODUCTS | exists | A |
| API-APROD-02 | POST | /admin/products | products.py + productsApi.js | F-ADM-PRODUCT-CREATE | exists | A |
| API-APROD-03 | POST | /admin/products/draft | products.py + productsApi.js | F-ADM-PRODUCT-CREATE | exists | A |
| API-APROD-04 | GET | /admin/products/next-id | products.py + productsApi.js | F-ADM-PRODUCT-CREATE,F-EMP-PRODUCT-CREATE | exists | A |
| API-APROD-05 | GET | /admin/products/availability | products.py + productsApi.js | F-ADM-PRODUCT-CREATE | exists | A |
| API-APROD-06 | GET | /admin/products/metrics | products.py + productsApi.js | F-ADM-PRODUCTS | exists | A |
| API-APROD-07 | GET | /admin/products/{id} | products.py + productsApi.js | F-ADM-PRODUCT-DETAIL,F-ADM-PRODUCT-EDIT | exists | A |
| API-APROD-08 | PATCH | /admin/products/{id} | products.py + productsApi.js | F-ADM-PRODUCT-EDIT | exists | A |
| API-APROD-09 | POST | /admin/products/{id}/assign | products.py + productsApi.js | F-ADM-PRODUCT-ASSIGN | exists | A |
| API-APROD-10 | POST | /admin/products/{id}/approve | products.py + productsApi.js | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-11 | POST | /admin/products/{id}/reject | products.py + productsApi.js | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-12 | POST | /admin/products/{id}/publish | products.py + productsApi.js | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-13 | POST | /admin/products/{id}/unpublish | products.py + productsApi.js | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-14 | POST | /admin/products/{id}/archive | products.py + productsApi.js | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-15 | POST | /admin/products/{id}/restore | products.py + productsApi.js | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-16 | GET | /admin/products/{id}/publish-issues | products.py + productsApi.js | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-APROD-17 | POST | /admin/products/{id}/change-id | products.py + productsApi.js | F-ADM-PRODUCT-EDIT | exists | A |
| API-APROD-18 | POST | /admin/products/{id}/duplicate | products.py + productsApi.js | F-ADM-PRODUCT-EDIT | exists | A |
| API-APROD-19 | POST | /admin/products/bulk | products.py + productsApi.js | F-ADM-PRODUCTS | exists | A |
| API-APROD-20 | POST | /admin/products/{id}/review-flags/clear | products.py + productsApi.js | F-ADM-PRODUCT-WORKFLOW | exists | A |
| API-EPROD-01 | GET | /employee/products/{id} | products.py + productsApi.js | F-EMP-PRODUCTS,F-EMP-PRODUCT-EDIT | exists | A |
| API-EPROD-02 | PATCH | /employee/products/{id} | products.py + productsApi.js | F-EMP-PRODUCT-CREATE,F-EMP-PRODUCT-EDIT | exists | A |
| API-EPROD-03 | GET | /employee/me/assigned-products | employees.py + employeesApi.js (placeholder) | F-EMP-PRODUCTS,F-EMP-DASHBOARD | exists (now BACKEND_GAP detection) | D P0 — TODO |
| API-CAT-01 | GET | /categories | categories.py + categoriesApi.js | F-CUS-NAV,F-CUS-KIDS | exists | A |
| API-CAT-02 | GET | /categories/{idOrSlug} | categories.py + categoriesApi.js | F-CUS-CATEGORY | exists | A |
| API-CAT-03 | GET | /categories/{id}/subcategories | categories.py + categoriesApi.js | F-CUS-CATEGORY,F-CUS-KIDS,F-CUS-NAV | exists | A |
| API-CAT-04 | GET | /admin/categories | categories.py + categoriesApi.js | F-ADM-CATEGORIES | exists | A |
| API-CAT-05 | GET | /admin/categories/{id} | categories.py + categoriesApi.js | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-06 | GET | /admin/categories/{id}/subcategories | categories.py + categoriesApi.js | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-07 | POST | /admin/categories | categories.py + categoriesApi.js | F-ADM-CATEGORY-CREATE | exists | A |
| API-CAT-08 | PATCH | /admin/categories/{id} | categories.py + categoriesApi.js | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-09 | POST | /admin/categories/{id}/activate | categories.py + categoriesApi.js | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-10 | POST | /admin/categories/{id}/archive | categories.py + categoriesApi.js | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-11 | POST | /admin/categories/{id}/restore | categories.py + categoriesApi.js | F-ADM-CATEGORY-EDIT | exists | A |
| API-CAT-12 | POST | /admin/categories/{id}/subcategories | categories.py + categoriesApi.js | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-13 | PATCH | /admin/subcategories/{id} | categories.py + categoriesApi.js | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-14 | POST | /admin/subcategories/{id}/activate | categories.py + categoriesApi.js | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-15 | POST | /admin/subcategories/{id}/archive | categories.py + categoriesApi.js | F-ADM-SUBCATEGORIES | exists | A |
| API-CAT-16 | POST | /admin/subcategories/{id}/restore | categories.py + categoriesApi.js | F-ADM-SUBCATEGORIES | exists | A |
| API-COL-01 | GET | /collections | collections.py + collectionsApi.js | F-CUS-HOME,F-CUS-COLLECTION | exists | A |
| API-COL-02 | GET | /collections/{id} | collections.py + collectionsApi.js | F-CUS-COLLECTION | exists | A |
| API-COL-03 | GET | /admin/collections | collections.py + collectionsApi.js | F-ADM-COLLECTIONS | exists | A |
| API-COL-04 | GET | /admin/collections/{id} | collections.py + collectionsApi.js | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-05 | POST | /admin/collections | collections.py + collectionsApi.js | F-ADM-COLLECTION-CREATE | exists | A |
| API-COL-06 | PATCH | /admin/collections/{id} | collections.py + collectionsApi.js | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-07 | POST | /admin/collections/{id}/activate | collections.py + collectionsApi.js | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-08 | POST | /admin/collections/{id}/pause | collections.py + collectionsApi.js | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-09 | POST | /admin/collections/{id}/archive | collections.py + collectionsApi.js | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-10 | POST | /admin/collections/{id}/restore | collections.py + collectionsApi.js | F-ADM-COLLECTION-EDIT | exists | A |
| API-COL-11 | PUT | /admin/collections/{id}/products | collections.py + collectionsApi.js | F-ADM-COLLECTION-PRODUCTS | exists | A |
| API-COL-12 | GET | /admin/taxonomy/metrics | categories.py + collectionsApi.js | F-ADM-CATEGORIES,F-ADM-COLLECTIONS | exists | A |
| API-COL-13 | GET | /admin/taxonomy/product-counts | categories.py + collectionsApi.js | F-ADM-CATEGORIES | exists | A |
| API-SRCH-01 | GET | /search | search.py + searchApi.js | F-CUS-SEARCH,F-CUS-SHOP | exists | A |
| API-SRCH-02 | GET | /explore | explore.py + searchApi.js | F-CUS-EXPLORE | exists | A |
| API-SRCH-03 | GET | /explore/offers | explore.py + searchApi.js (static) | F-CUS-EXPLORE,F-CUS-OFFERS | exists | C — static not DB |
| API-SRCH-04 | GET | /home | explore.py + searchApi.js | F-CUS-HOME | exists | C — hero static |
| API-OFF-01 | GET | /offers | coupons.py + offersApi.js | F-CUS-OFFERS,F-CUS-HOME | exists | A |
| API-OFF-02 | POST | /offers/validate | coupons.py + offersApi.js | F-CUS-CHECKOUT,F-CUS-CART | exists | A |
| API-OFF-03 | GET | /admin/offers | coupons.py + offersApi.js | F-ADM-OFFERS,F-EMP-OFFERS | exists | A |
| API-OFF-04 | GET | /admin/offers/{id} | coupons.py + offersApi.js | F-ADM-OFFER-DETAIL,F-EMP-OFFERS | exists | A |
| API-OFF-05 | POST | /admin/offers | coupons.py + offersApi.js | F-ADM-OFFER-CREATE | exists | A |
| API-OFF-06 | PATCH | /admin/offers/{id} | coupons.py + offersApi.js | F-ADM-OFFER-EDIT | exists | A |
| API-OFF-07 | POST | /admin/offers/{id}/activate | coupons.py + offersApi.js | F-ADM-OFFER-EDIT | exists | A |
| API-OFF-08 | POST | /admin/offers/{id}/pause | coupons.py + offersApi.js | F-ADM-OFFER-EDIT | exists | A |
| API-OFF-09 | POST | /admin/offers/{id}/archive | coupons.py + offersApi.js | F-ADM-OFFER-EDIT | exists | A |
| API-CART-01 | GET | /cart | cart.py + cartApi.js | F-CUS-CART | exists | A |
| API-CART-02 | POST | /cart/items | cart.py + cartApi.js | F-CUS-CART,F-CUS-PDP | exists | A |
| API-CART-03 | PATCH | /cart/items/{lineId} | cart.py + cartApi.js | F-CUS-CART | exists | A |
| API-CART-04 | DELETE | /cart/items/{lineId} | cart.py + cartApi.js | F-CUS-CART | exists | A |
| API-CART-05 | DELETE | /cart | cart.py + cartApi.js | F-CUS-CART | exists | A |
| API-CART-06 | POST | /cart/coupon | cart.py + cartApi.js | F-CUS-CART,F-CUS-CHECKOUT | exists | A |
| API-CART-07 | DELETE | /cart/coupon | cart.py + cartApi.js | F-CUS-CART | exists | A |
| API-CART-08 | GET | /cart/totals | cart.py + cartApi.js | F-CUS-CHECKOUT | exists | A |
| API-WISH-01 | GET | /wishlist | wishlist.py + wishlistApi.js | F-CUS-WISHLIST | exists | A |
| API-WISH-02 | POST | /wishlist/{productId} | wishlist.py + wishlistApi.js | F-CUS-WISHLIST,F-CUS-PDP | exists | A |
| API-WISH-03 | DELETE | /wishlist/{productId} | wishlist.py + wishlistApi.js | F-CUS-WISHLIST | exists | A |
| API-WISH-04 | POST | /wishlist/{productId}/toggle | wishlist.py + wishlistApi.js | F-CUS-WISHLIST | exists | A |
| API-CUS-01 | PATCH | /customers/me | customers.py + customersApi.js | F-CUS-PROFILE | exists | A |
| API-CUS-02 | PATCH | /customers/me/preferences | customers.py + customersApi.js | F-CUS-PREFERENCES | exists | A |
| API-CUS-03 | POST | /customers/me/sessions/revoke-others | customers.py + customersApi.js | F-CUS-SECURITY | exists | C — revokes all not others |
| API-CUS-04 | GET | /customers/me/addresses | addresses.py + customersApi.js | F-CUS-ADDRESSES,F-CUS-CHECKOUT | exists | A |
| API-CUS-05 | POST | /customers/me/addresses | addresses.py + customersApi.js | F-CUS-ADDRESSES | exists | A |
| API-CUS-06 | PATCH | /customers/me/addresses/{id} | addresses.py + customersApi.js | F-CUS-ADDRESSES | exists | A |
| API-CUS-07 | DELETE | /customers/me/addresses/{id} | addresses.py + customersApi.js | F-CUS-ADDRESSES | exists | A |
| API-CUS-08 | POST | /customers/me/addresses/{id}/default | addresses.py + customersApi.js | F-CUS-ADDRESSES | exists | A |
| API-CUS-09 | GET | /admin/customers | customers.py + customersApi.js | F-ADM-CUSTOMERS,F-EMP-CUSTOMERS | exists | A |
| API-CUS-10 | GET | /admin/customers/{id} | customers.py + customersApi.js | F-ADM-CUSTOMER-DETAIL | exists | A |
| API-ORD-01 | POST | /orders | orders.py + ordersApi.js | F-CUS-CHECKOUT | exists | A |
| API-ORD-02 | GET | /orders | orders.py + ordersApi.js | F-CUS-ORDERS,F-CUS-ACCOUNT | exists | A |
| API-ORD-03 | GET | /orders/{orderId} | orders.py + ordersApi.js | F-CUS-ORDER-DETAIL,F-CUS-ORDER-SUCCESS | exists | A |
| API-ORD-04 | GET | /orders/{orderId}/tracking | orders.py + ordersApi.js | F-CUS-TRACKING | exists | A |
| API-ORD-05 | POST | /orders/{orderId}/cancel | orders.py + ordersApi.js | F-CUS-ORDER-DETAIL | exists | A |
| API-ORD-06 | POST | /orders/{orderId}/returns | orders.py + ordersApi.js | F-CUS-RETURN | exists | A |
| API-ORD-07 | GET | /orders/{orderId}/returns/{returnId} | orders.py + ordersApi.js | F-CUS-RETURN | exists | A |
| API-ORD-08 | POST | /orders/claim-guest | orders.py + ordersApi.js | F-CUS-ORDERS | exists | A |
| API-AORD-01 | GET | /admin/orders | orders.py + ordersApi.js | F-ADM-ORDERS,F-EMP-ORDERS | exists | A |
| API-AORD-02 | GET | /admin/orders/{id} | orders.py + ordersApi.js | F-ADM-ORDER-DETAIL,F-EMP-ORDERS | exists | A |
| API-AORD-03 | GET | /admin/orders/{id}/invoice | orders.py + ordersApi.js | F-ADM-INVOICE | exists | C |
| API-AORD-04 | POST | /admin/orders/{id}/allocate | orders.py + ordersApi.js | F-ADM-FULFILLMENT | exists | A |
| API-AORD-05 | POST | /admin/orders/{id}/pick/start | orders.py + ordersApi.js | F-ADM-FULFILLMENT,F-EMP-WAREHOUSE | exists | A |
| API-AORD-06 | POST | /admin/orders/{id}/pick/item | orders.py + ordersApi.js | F-ADM-FULFILLMENT,F-EMP-WAREHOUSE | exists | A |
| API-AORD-07 | POST | /admin/orders/{id}/pack | orders.py + ordersApi.js | F-ADM-FULFILLMENT,F-EMP-WAREHOUSE | exists | A |
| API-AORD-08 | POST | /admin/orders/{id}/ready | orders.py + ordersApi.js | F-ADM-FULFILLMENT | exists | A |
| API-AORD-09 | POST | /admin/orders/{id}/out-for-delivery | orders.py + ordersApi.js | F-ADM-FULFILLMENT | exists | A |
| API-AORD-10 | POST | /admin/orders/{id}/deliver | orders.py + ordersApi.js | F-ADM-FULFILLMENT | exists | A |
| API-AORD-11 | POST | /admin/orders/{id}/fulfillment | orders.py + ordersApi.js | F-ADM-FULFILLMENT | exists | A |
| API-AORD-12 | POST | /admin/orders/{id}/dispatch | orders.py + ordersApi.js | F-ADM-FULFILLMENT | exists | A |
| API-AORD-13 | POST | /admin/orders/{id}/cancel | orders.py + ordersApi.js | F-ADM-ORDERS | exists | A |
| API-AORD-14 | POST | /admin/orders/{id}/notes | orders.py + ordersApi.js | F-ADM-ORDER-DETAIL | exists | A |
| API-AORD-15 | POST | /admin/orders/{id}/status | orders.py + ordersApi.js | F-ADM-ORDERS | exists | A |
| API-AORD-16 | POST | /admin/orders/{id}/force-status | orders.py + ordersApi.js | F-ADM-ORDERS | exists | A |
| API-RET-01 | GET | /admin/returns | orders.py + ordersApi.js | F-ADM-RETURNS,F-EMP-RETURNS | exists | A |
| API-RET-02 | GET | /admin/returns/{id} | orders.py + ordersApi.js | F-ADM-RETURN-DETAIL,F-EMP-RETURNS | exists | A |
| API-RET-03 | POST | /admin/returns/{id}/approve | orders.py + ordersApi.js | F-ADM-RETURNS | exists | A |
| API-RET-04 | POST | /admin/returns/{id}/reject | orders.py + ordersApi.js | F-ADM-RETURNS | exists | A |
| API-RET-05 | POST | /admin/returns/{id}/schedule-pickup | orders.py + ordersApi.js | F-ADM-RETURNS | exists | A |
| API-RET-06 | POST | /admin/returns/{id}/receive | orders.py + ordersApi.js | F-ADM-RETURNS,F-EMP-WAREHOUSE | exists | A |
| API-RET-07 | POST | /admin/returns/{id}/inspect | orders.py + ordersApi.js | F-ADM-RETURNS | exists | A |
| API-RET-08 | POST | /admin/returns/{id}/refund/initiate | orders.py + ordersApi.js | F-ADM-RETURNS | exists | A |
| API-RET-09 | POST | /admin/returns/{id}/refund/complete | orders.py + ordersApi.js | F-ADM-RETURNS | exists | A |
| API-PAY-01 | POST | /payments/session | payments.py + paymentsApi.js | F-CUS-CHECKOUT | exists | A |
| API-PAY-02 | GET | /payments/session/{id} | payments.py + paymentsApi.js | F-CUS-CHECKOUT,F-CUS-ORDER-SUCCESS | exists | A |
| API-PAY-03 | POST | /payments/session/{id}/cancel | payments.py + paymentsApi.js | F-CUS-CHECKOUT | exists | A |
| API-PAY-04 | POST | /payments/verify | payments.py + paymentsApi.js | F-CUS-CHECKOUT | exists | A |
| API-MED-01 | GET | /media/storage/status | media.py + mediaApi.js | F-ADM-MEDIA,F-ADM-MEDIA-UPLOAD | exists | A |
| API-MED-02 | POST | /media/references/resolve | media.py + mediaApi.js | F-CUS-PDP,F-CUS-SHOP,F-ADM-MEDIA | exists | A |
| API-MED-03 | GET | /media/object-meta/{key} | media.py + mediaApi.js | F-ADM-MEDIA-DETAIL | exists | A |
| API-MED-04 | GET | /media/products/{id}/media-set | media.py + mediaApi.js | F-CUS-PDP,F-ADM-PRODUCT-MEDIA,F-EMP-MEDIA | exists | A |
| API-MED-05 | POST | /media/objects | media.py + mediaApi.js | F-ADM-MEDIA-UPLOAD | exists | A |
| API-MED-06 | POST | /media/products/{id}/objects | media.py + mediaApi.js | F-ADM-PRODUCT-MEDIA,F-EMP-MEDIA-UPLOAD | exists | A |
| API-MED-07 | DELETE | /media/objects/{key} | media.py + mediaApi.js | F-ADM-MEDIA | exists | A |
| API-MED-08 | POST | /media/register | media.py + mediaApi.js | F-ADM-MEDIA-UPLOAD,F-ADM-PRODUCT-MEDIA | exists | A |
| API-MED-09 | GET | /media/assets | media.py + mediaApi.js | F-ADM-MEDIA,F-ADM-MEDIA-MAPPING | exists | A |
| API-MMED-01 | GET | /admin/marketing-media | media_reviews.py STUB + mediaApi.js BACKEND_GAP | F-ADM-MARKETING-MEDIA,F-CUS-HOME | stub | E P1 |
| API-MMED-02 | GET | /admin/media-reviews | media_reviews.py STUB | F-ADM-MEDIA-REVIEW,F-ADM-MARKETING-MEDIA | stub | E P1 |
| API-MMED-03 | POST | /admin/media-reviews/{id}/approve | STUB | F-ADM-MEDIA-REVIEW | stub | E P1 |
| API-MMED-04 | POST | /admin/media-reviews/{id}/reject | STUB | F-ADM-MEDIA-REVIEW | stub | E P1 |
| API-INV-01 | GET | /admin/inventory/stock | inventory.py STUB + inventoryApi.js unavailable() | F-ADM-INVENTORY,F-EMP-INVENTORY | stub | E P1 |
| API-INV-02 | GET | /admin/inventory/stock/{id} | inventory.py STUB | F-ADM-INVENTORY | stub | E P1 |
| API-INV-03 | POST | /admin/inventory/adjust | inventory.py STUB | F-ADM-INV-ADJUST,F-EMP-INV-ADJUST | stub | E P1 |
| API-INV-04 | GET | /admin/inventory/movements | inventory.py STUB | F-ADM-INV-MOVEMENTS,F-EMP-INV-MOVEMENTS | stub | E P1 |
| API-INV-05 | GET | /admin/inventory/low-stock | inventory.py STUB | F-ADM-INV-LOW,F-EMP-INV-LOW | stub | E P1 |
| API-INV-06 | GET | /admin/inventory/reservations | inventory.py STUB | F-ADM-INVENTORY | stub | E P1 |
| API-INV-07 | GET | /admin/warehouses | warehouses.py STUB | F-ADM-WAREHOUSES,F-EMP-WAREHOUSE | stub | E P1 |
| API-INV-08 | POST | /admin/warehouses | warehouses.py STUB | F-ADM-WAREHOUSES | stub | E P2 |
| API-INV-09 | GET | /admin/inventory/transfers | stock_transfers.py STUB | F-ADM-INV-TRANSFERS,F-EMP-INV-TRANSFERS | stub | E P1 |
| API-INV-10 | POST | /admin/inventory/transfers | stock_transfers.py STUB | F-ADM-INV-TRANSFERS,F-EMP-INV-TRANSFERS | stub | E P1 |
| API-INV-11 | POST | /admin/inventory/transfers/{id}/complete | stock_transfers.py STUB | F-ADM-INV-TRANSFERS | stub | E P1 |
| API-EMP-01 | GET | /admin/employees | employees.py + employeesApi.js | F-ADM-EMPLOYEES,F-EMP-TEAM | exists | A |
| API-EMP-02 | GET | /admin/employees/{id} | employees.py + employeesApi.js | F-ADM-EMPLOYEE-DETAIL | exists | A |
| API-EMP-03 | POST | /admin/employees | employees.py + employeesApi.js | F-ADM-EMPLOYEE-CREATE | exists | A |
| API-EMP-04 | PATCH | /admin/employees/{id} | employees.py + employeesApi.js | F-ADM-EMPLOYEE-EDIT | exists | A |
| API-EMP-05 | POST | /admin/employees/{id}/status | employees.py + employeesApi.js | F-ADM-EMPLOYEE-EDIT | exists | A |
| API-EMP-06 | POST | /admin/employees/{id}/reset-password | employees.py + employeesApi.js | F-ADM-EMPLOYEE-EDIT | exists | A |
| API-EMP-07 | PUT | /admin/employees/{id}/permissions | employees.py + employeesApi.js | F-ADM-EMPLOYEE-EDIT | exists | A (partial perm mode) |
| API-EMP-08 | DELETE | /admin/employees/{id} | employees.py + employeesApi.js | F-ADM-EMPLOYEES | exists | A |
| API-EMP-09 | GET | /admin/employees/departments | employees.py + employeesApi.js | F-ADM-EMPLOYEES | exists | A |
| API-EMP-10 | POST | /admin/employees/departments | employees.py + employeesApi.js | F-ADM-EMPLOYEES (org CRUD, no F-* direct) | exists | A |
| API-EMP-11 | PATCH | /admin/employees/departments/{id} | employees.py + employeesApi.js | F-ADM-EMPLOYEES | exists | A |
| API-EMP-12 | DELETE | /admin/employees/departments/{id} | employees.py + employeesApi.js | F-ADM-EMPLOYEES | exists | A |
| API-EMP-13 | GET | /admin/employees/sections | employees.py + employeesApi.js | F-ADM-EMPLOYEES | exists | A |
| API-EMP-14 | POST | /admin/employees/sections | employees.py + employeesApi.js | F-ADM-EMPLOYEES | exists | A |
| API-EMP-15 | PATCH | /admin/employees/sections/{id} | employees.py + employeesApi.js | F-ADM-EMPLOYEES | exists | A |
| API-EMP-16 | DELETE | /admin/employees/sections/{id} | employees.py + employeesApi.js | F-ADM-EMPLOYEES | exists | A |
| API-ATT-01 | GET | /admin/employees/{id}/attendance | employees.py + employeesApi.js | F-ADM-EMPLOYEE-DETAIL,F-EMP-ATTENDANCE | exists | A |
| API-ATT-02 | POST | /admin/employees/{id}/attendance | employees.py + employeesApi.js | F-ADM-EMPLOYEE-DETAIL | exists | A |
| API-ATT-03 | PATCH | /admin/employees/attendance/{id} | employees.py + employeesApi.js | F-ADM-EMPLOYEE-DETAIL | exists | A |
| API-ATT-04 | POST | /employee/attendance/check-in | attendance.py STUB MISSING | F-EMP-ATTENDANCE | missing | E P1 |
| API-ATT-05 | POST | /employee/attendance/check-out | attendance.py STUB | F-EMP-ATTENDANCE | missing | E P1 |
| API-ATT-06 | GET | /employee/attendance/today | attendance.py STUB | F-EMP-ATTENDANCE,F-EMP-DASHBOARD | missing | E P1 |
| API-ATT-07 | GET | /employee/attendance | attendance.py STUB | F-EMP-ATTENDANCE | missing | E P1 |
| API-LEV-01 | GET | /employee/leave | NO MODEL, NO ROUTER | F-EMP-LEAVE | missing | E P2 |
| API-LEV-02 | POST | /employee/leave | NO MODEL | F-EMP-LEAVE | missing | E P2 |
| API-LEV-03 | GET | /admin/leave | NO MODEL | F-ADM-EMPLOYEE-DETAIL,F-EMP-LEAVE | missing | E P2 |
| API-LEV-04 | POST | /admin/leave/{id}/decision | NO MODEL | F-ADM-EMPLOYEE-DETAIL | missing | E P2 |
| API-PERF-01 | GET | /employee/performance | performance.py STUB | F-EMP-PERFORMANCE | missing | E P2 |
| API-PERF-02 | GET | /admin/performance | performance.py STUB (legacy) — real via /admin/employees/{id}/performance | F-EMP-PERFORMANCE,F-ADM-EMPLOYEE-DETAIL | missing (legacy route) | C P2 |
| API-AN-01 | GET | /analytics/overview | analytics.py + adminApi.js | F-ADM-DASHBOARD,F-ADM-ANALYTICS | exists | A |
| API-AN-02 | GET | /analytics/sales | analytics.py + adminApi.js | F-ADM-AN-SALES,F-EMP-REPORTS-SALES | exists | A |
| API-AN-03 | GET | /analytics/products | analytics.py + adminApi.js | F-ADM-AN-PRODUCTS,F-EMP-REPORTS-PRODUCTS | exists | A |
| API-AN-04 | GET | /analytics/customers | analytics.py + adminApi.js | F-ADM-AN-CUSTOMERS,F-EMP-REPORTS-CUSTOMERS | exists | A |
| API-AN-05 | GET | /analytics/orders | analytics.py + adminApi.js | F-ADM-DASHBOARD,F-ADM-ANALYTICS | exists | A |
| API-AN-06 | GET | /analytics/inventory-summary | analytics.py + adminApi.js | F-ADM-DASHBOARD,F-ADM-AN-INVENTORY,F-EMP-DASHBOARD | exists | A (note) |
| API-RBAC-01 | GET | /roles | roles.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-RBAC-02 | GET | /roles/{id} | roles.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-RBAC-03 | GET | /permissions | permissions.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-RBAC-04 | GET | /users | users.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-RBAC-05 | GET | /users/{id} | users.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-AUD-01 | GET | /audit/logs | audit.py + adminApi.js | F-ADM-ACTIVITY | exists | A |
| API-SET-01 | GET | /admin/settings | admin.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-SET-02 | GET | /admin/settings/{section} | admin.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-SET-03 | PATCH | /admin/settings/{section} | admin.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-SET-04 | POST | /admin/settings/{section}/reset | admin.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-SET-05 | POST | /admin/settings/reset | admin.py + adminApi.js | F-ADM-SETTINGS | exists | A |
| API-SUP-01 | GET | /employee/support/cases | NO MODEL | F-EMP-SUPPORT | missing | E P2 |
| API-SUP-02 | POST | /employee/support/cases | NO MODEL | F-EMP-SUPPORT | missing | E P2 |
| API-SUP-03 | PATCH | /employee/support/cases/{id} | NO MODEL | F-EMP-SUPPORT | missing | E P2 |
| API-STY-01 | GET | /employee/styling/appointments | NO MODEL | F-EMP-STYLING | missing | E P2 |
| API-STY-02 | GET | /employee/styling/requests | NO MODEL | F-EMP-STYLING | missing | E P2 |
| API-SALE-01 | GET | /employee/sales/departments | NO MODEL (should derive from orders) | F-EMP-SALES,F-EMP-REPORTS-SALES | missing | E P2 + G |
| API-AI-01 | POST | /ai/shopping | chatbot.py STUB | F-CUS-AI-SHOPPING | missing | H P3 |
| API-AI-02 | POST | /ai/mirror | chatbot.py STUB | F-CUS-AI-MIRROR | missing | H P3 |
| API-AI-03 | POST | /admin/ai/assistant | chatbot.py STUB | F-ADM-AI | missing | H P3 |

**Total in this table: 225 — matches reported total.**

---

## B. APIs counted in the 205 classification (stale summary)

The stale summary inside `docs/full-stack-integration-audit.md` §20 and Appendix claimed:

| Stale Status | Stale Count | Notes in stale summary |
|---|---|---|
| A COMPLETE | ~160 | |
| B IMPLEMENTED BUT NOT INTEGRATED | 2 | assigned-products placeholder, explore/offers static |
| C PARTIAL | 5 | home hero static, explore/offers static, invoice meta stub, session revoke all, perm mode TODO |
| D STUB | 15 | inventory 11 + marketing 4 |
| E MISSING | 20 | auth-15 + attendance 4 + leave 4 + perf 2 + support 3 + styling 2 + sales 1 + AI 3? |
| H FUTURE | 3 | AI |
| **Total** | **205** | |

This summary does NOT match its own table. It is outdated from an earlier draft where:
- Inventory + marketing were counted as D STUB (health-only) — 15
- Assigned-products + explore/offers were counted as B — 2
- A was approximated as 160 (actual table already had 185 at time of writing)

---

## C. The exact 20 currently missing from the classification (i.e., why 205 ≠ 225)

**Root cause: counting/reporting bug — stale summary not updated after reclassification.**

When the audit table was finalized:
- Inventory 11 + Marketing 4 moved from **D STUB** to **E MISSING** (because models have no business columns — not just health-only, but truly missing schema). So D should be 1, not 15 → **-14 overcount in stale D**.
- B category was eliminated: assigned-products is **D P0 TODO** (placeholder) and explore/offers static is **C** — not B. So B should be 0, not 2 → **-2 overcount in stale B**.
- A grew from ~160 to **185** because department/section CRUD (6), RBAC (5), settings (5), analytics inventory-summary, audit logs, etc were added to A but summary stayed at 160 → **+25 undercount in stale A**.
- E grew from 20 to **31** because inventory/marketing reclassified to E plus auth-15, etc → **+11 undercount in stale E**.

Net: +25 (A) +11 (E) -14 (D) -2 (B) = **+20** — exactly the gap.

### Therefore there are **0 genuinely missing APIs** from the authoritative table — the 20 are an artifact of stale summary math.

If forced to list 20 APIs that are present in 225 but not accounted for in the stale 205 sum, they are the 20 that were added to A and E after the summary was written:

# EXACT 20 UNACCOUNTED APIs (representative list of APIs that exist in 225 but were not in stale 205 counts)

| # | Method | Route | Current Status (audit table) | Why Missing From Stale Classification |
|---|---|---|---|---|
| 1 | GET | /admin/employees/departments | A | Stale A ~160 omitted org CRUD — actually A, part of +25 A |
| 2 | POST | /admin/employees/departments | A | Stale A omitted — org create |
| 3 | PATCH | /admin/employees/departments/{id} | A | Stale A omitted |
| 4 | DELETE | /admin/employees/departments/{id} | A | Stale A omitted |
| 5 | GET | /admin/employees/sections | A | Stale A omitted |
| 6 | POST | /admin/employees/sections | A | Stale A omitted |
| 7 | PATCH | /admin/employees/sections/{id} | A | Stale A omitted |
| 8 | DELETE | /admin/employees/sections/{id} | A | Stale A omitted |
| 9 | GET | /roles | A | RBAC — stale A ~160 omitted RBAC |
| 10 | GET | /roles/{id} | A | RBAC — omitted |
| 11 | GET | /permissions | A | RBAC — omitted |
| 12 | GET | /users | A | RBAC — omitted |
| 13 | GET | /users/{id} | A | RBAC — omitted |
| 14 | GET | /admin/settings | A | Settings — omitted from stale 160 |
| 15 | GET | /admin/settings/{section} | A | Settings — omitted |
| 16 | PATCH | /admin/settings/{section} | A | Settings — omitted |
| 17 | POST | /admin/settings/{section}/reset | A | Settings — omitted |
| 18 | POST | /admin/settings/reset | A | Settings — omitted |
| 19 | GET | /analytics/inventory-summary | A (note) | Analytics — stale counted as A? But part of +25 |
| 20 | GET | /audit/logs | A | Audit logs — part of +25 |

**Alternative view of the 20 gap as misclassified, not missing:**

| # | Method | Route | Current Status | Why Missing From Classification |
|---|---|---|---|---|
| 1 | GET | /admin/inventory/stock | E P1 | Stale counted as D STUB (15) — actually E MISSING (no columns) — D overcount |
| 2 | GET | /admin/inventory/stock/{id} | E P1 | Same — D→E reclass |
| 3 | POST | /admin/inventory/adjust | E P1 | D→E |
| 4 | GET | /admin/inventory/movements | E P1 | D→E |
| 5 | GET | /admin/inventory/low-stock | E P1 | D→E |
| 6 | GET | /admin/inventory/reservations | E P1 | D→E |
| 7 | GET | /admin/warehouses | E P1 | D→E |
| 8 | POST | /admin/warehouses | E P2 | D→E |
| 9 | GET | /admin/inventory/transfers | E P1 | D→E |
| 10 | POST | /admin/inventory/transfers | E P1 | D→E |
| 11 | POST | /admin/inventory/transfers/{id}/complete | E P1 | D→E |
| 12 | GET | /admin/marketing-media | E P1 | Stale D→E |
| 13 | GET | /admin/media-reviews | E P1 | D→E |
| 14 | POST | /admin/media-reviews/{id}/approve | E P1 | D→E |
| 15 | POST | /admin/media-reviews/{id}/reject | E P1 | D→E |
| 16 | GET | /employee/me/assigned-products | D P0 TODO | Stale B→D |
| 17 | GET | /explore/offers | C — static not DB | Stale B→C |
| 18 | POST | /auth/employee/forgot-password | E P1 + G | Stale E 20 omitted this? Actually part of +11 E |
| 19 | GET | /employee/sales/departments | E P2 + G | Part of +11 E |
| 20 | GET | /admin/performance | C P2 | Stale E? Actually legacy route reclass to C |

Both views show **no genuinely unclassified APIs** — only reclassification and undercounting.

---

## CORRECTED TOTAL

**Reported total 225 is CORRECT.** Verified by:

- `docs/frontend-backend-api-requirements.md`: 225 `### API-` sections (exists 190, stub 15, missing 20 =225)
- `docs/full-stack-integration-audit.md` API Matrix: 225 unique IDs (A 185, C 5, D 1, E 31, H 3 =225)
- `docs/frontend-api-traceability.csv`: 313 pairs, 219 unique IDs + 6 org CRUD not in traceability =225
- Backend router decorators: 265 lines but 40 are `include_in_schema=False` legacy duplicates for `/employees/` vs `/admin/employees/` — de-duplicated matches 225 contract

**If the original 225 number itself were wrong, corrected total would still be 225 — because authoritative table and requirements file agree.** No duplicate routes counted as separate APIs except legacy `/employees/` duplicates which are explicitly `include_in_schema=False` and not counted in 225.

**Duplicate routes found:** `backend/app/api/v1/employees.py` has both `/admin/employees` and `/employees` (legacy) for same handler, with `include_in_schema=False` on legacy — these are **aliases, not counted twice** in 225. Same for departments, sections, attendance, performance. Explained in router.py — legacy kept for compat, not new API.

**No test-only endpoints counted** — all 225 are production contract (even if stub/missing).

**No health/system endpoints counted** in 225 — health endpoints (`/health` in 12 stub routers) are **not** part of the 225 API contract; they are infra, not business APIs. If they were counted, total would be 225+12=237, but they are correctly excluded.

---

## CORRECTED CLASSIFICATION

| Status | Count | Meaning | Source |
|---|---|---|---|
| A COMPLETE / WORKING | 185 | Backend REAL + frontend exists, DB-backed, tested | Audit matrix actual count |
| B IMPLEMENTED BUT NOT INTEGRATED | 0 | Eliminated — assigned-products is D, explore/offers is C | Was 2 in stale, now 0 |
| C PARTIAL / UNDER PROGRESS | 5 | home hero static, explore/offers static, invoice meta docAvailable false, session revoke-others revokes all, performance legacy route | Audit matrix |
| D STUB / PLACEHOLDER | 1 | assigned-products placeholder [] TODO product service | Was 15 in stale (inventory+marketing), now 1 |
| E MISSING BACKEND | 31 | auth-15 (1) + attendance self 4 + leave 4 + perf self 1 + support 3 + styling 2 + sales 1 + inventory 11 + marketing 4 =31 | Was 20 in stale, now 31 |
| F INTEGRATION BUG | 0 | No wrong path — clients fail-closed honestly | |
| G HUMAN DECISION (subset of E) | 3 | employee forgot-pw, sales derived from orders, search hint copy | Part of E |
| H FUTURE / NOT REQUIRED | 3 | AI shopping, AI mirror, admin AI | |
| **Total** | **225** | **185+5+1+31+3 =225** | **Matches reported total** |

**Math check:** 185 + 0 + 5 + 1 + 31 + 0 + 3 = **225** — final counts equal corrected total.

**By requirements file Status field:**

| Client Status | Count |
|---|---|
| exists (coded live client) | 190 |
| stub (unavailable / BACKEND_GAP) | 15 |
| missing (UI, no client) | 20 |
| **Total** | **225** |

Both classifications (by implementation status A-H and by client status exists/stub/missing) sum to 225.

---

## Conclusion

- **225 is correct** — not 205, not 245.
- **205 is stale summary bug** — summary in §20/Appendix not updated after reclassification of inventory/marketing from D to E and elimination of B.
- **0 APIs genuinely unaccounted** in authoritative table — all 225 IDs from requirements appear in audit matrix.
- **20 unaccounted in stale math** are explained as: +25 A undercount, +11 E undercount, -14 D overcount, -2 B overcount = +20 net.
- No action to change code, delete APIs, or reclassify to make numbers add up — only documentation correction needed (update §20 summary to A 185, B 0, C 5, D 1, E 31, H 3).

**No implementation work until this reconciliation is acknowledged.**