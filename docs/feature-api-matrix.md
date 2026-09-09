# Feature ↔ API matrix

One row per feature–API pair. Join keys match `frontend-feature-inventory.md` and `frontend-backend-api-requirements.md`.

| Feature ID | Feature | Portal | P | API ID | Method | Endpoint | API status |
|---|---|---|---|---|---|---|---|
| F-CUS-HOME | Home / Atelier | customer | P0 | API-SRCH-04 | GET | `/home` | exists |
| F-CUS-HOME | Home / Atelier | customer | P0 | API-PROD-01 | GET | `/products` | exists |
| F-CUS-HOME | Home / Atelier | customer | P0 | API-COL-01 | GET | `/collections` | exists |
| F-CUS-HOME | Home / Atelier | customer | P0 | API-OFF-01 | GET | `/offers` | exists |
| F-CUS-HOME | Home / Atelier | customer | P0 | API-MED-02 | POST | `/media/references/resolve` | exists |
| F-CUS-HOME | Home / Atelier | customer | P0 | API-MMED-01 | GET | `/admin/marketing-media` | stub |
| F-CUS-NAV | Taxonomy mega-menu | customer | P0 | API-CAT-01 | GET | `/categories` | exists |
| F-CUS-NAV | Taxonomy mega-menu | customer | P0 | API-CAT-03 | GET | `/categories/{categoryId}/subcategories` | exists |
| F-CUS-SHOP | Shop listing | customer | P0 | API-PROD-01 | GET | `/products` | exists |
| F-CUS-SHOP | Shop listing | customer | P0 | API-SRCH-01 | GET | `/search` | exists |
| F-CUS-EXPLORE | Explore | customer | P1 | API-SRCH-02 | GET | `/explore` | exists |
| F-CUS-EXPLORE | Explore | customer | P1 | API-SRCH-03 | GET | `/explore/offers` | exists |
| F-CUS-SEARCH | Search | customer | P0 | API-SRCH-01 | GET | `/search` | exists |
| F-CUS-CATEGORY | Category listing | customer | P0 | API-CAT-02 | GET | `/categories/{idOrSlug}` | exists |
| F-CUS-CATEGORY | Category listing | customer | P0 | API-CAT-03 | GET | `/categories/{categoryId}/subcategories` | exists |
| F-CUS-CATEGORY | Category listing | customer | P0 | API-PROD-01 | GET | `/products` | exists |
| F-CUS-COLLECTION | Collection listing | customer | P0 | API-COL-02 | GET | `/collections/{idOrSlug}` | exists |
| F-CUS-COLLECTION | Collection listing | customer | P0 | API-PROD-04 | GET | `/collections/{collectionId}/products` | exists |
| F-CUS-KIDS | Kids department browse | customer | P0 | API-PROD-01 | GET | `/products` | exists |
| F-CUS-KIDS | Kids department browse | customer | P0 | API-CAT-01 | GET | `/categories` | exists |
| F-CUS-KIDS | Kids department browse | customer | P0 | API-CAT-03 | GET | `/categories/{categoryId}/subcategories` | exists |
| F-CUS-PDP | Product detail + gallery | customer | P0 | API-PROD-02 | GET | `/products/{idOrSlug}` | exists |
| F-CUS-PDP | Product detail + gallery | customer | P0 | API-MED-04 | GET | `/media/products/{id}/media-set` | exists |
| F-CUS-PDP | Product detail + gallery | customer | P0 | API-MED-02 | POST | `/media/references/resolve` | exists |
| F-CUS-PDP | Product detail + gallery | customer | P0 | API-PROD-03 | GET | `/products/{id}/recommendations` | exists |
| F-CUS-PDP | Product detail + gallery | customer | P0 | API-CART-02 | POST | `/cart/items` | exists |
| F-CUS-PDP | Product detail + gallery | customer | P0 | API-WISH-02 | POST | `/wishlist/{productId}` | exists |
| F-CUS-PDP | Product detail + gallery | customer | P0 | API-PROD-06 | POST | `/products/recently-viewed` | exists |
| F-CUS-RECS | PDP recommendations | customer | P1 | API-PROD-03 | GET | `/products/{id}/recommendations` | exists |
| F-CUS-RECENT | Recently viewed | customer | P2 | API-PROD-05 | GET | `/products/recently-viewed` | exists |
| F-CUS-RECENT | Recently viewed | customer | P2 | API-PROD-06 | POST | `/products/recently-viewed` | exists |
| F-CUS-CART | Cart | customer | P0 | API-CART-01 | GET | `/cart` | exists |
| F-CUS-CART | Cart | customer | P0 | API-CART-02 | POST | `/cart/items` | exists |
| F-CUS-CART | Cart | customer | P0 | API-CART-03 | PATCH | `/cart/items/{lineId}` | exists |
| F-CUS-CART | Cart | customer | P0 | API-CART-04 | DELETE | `/cart/items/{lineId}` | exists |
| F-CUS-CART | Cart | customer | P0 | API-CART-05 | DELETE | `/cart` | exists |
| F-CUS-CART | Cart | customer | P0 | API-CART-06 | POST | `/cart/coupon` | exists |
| F-CUS-CART | Cart | customer | P0 | API-CART-07 | DELETE | `/cart/coupon` | exists |
| F-CUS-CHECKOUT | Checkout + payments | customer | P0 | API-CART-08 | GET | `/cart/totals` | exists |
| F-CUS-CHECKOUT | Checkout + payments | customer | P0 | API-OFF-02 | POST | `/offers/validate` | exists |
| F-CUS-CHECKOUT | Checkout + payments | customer | P0 | API-CUS-04 | GET | `/customers/me/addresses` | exists |
| F-CUS-CHECKOUT | Checkout + payments | customer | P0 | API-ORD-01 | POST | `/orders` | exists |
| F-CUS-CHECKOUT | Checkout + payments | customer | P0 | API-PAY-01 | POST | `/payments/session` | exists |
| F-CUS-CHECKOUT | Checkout + payments | customer | P0 | API-PAY-02 | GET | `/payments/session/{sessionId}` | exists |
| F-CUS-CHECKOUT | Checkout + payments | customer | P0 | API-PAY-03 | POST | `/payments/session/{sessionId}/cancel` | exists |
| F-CUS-CHECKOUT | Checkout + payments | customer | P0 | API-PAY-04 | POST | `/payments/verify` | exists |
| F-CUS-ORDER-SUCCESS | Order success | customer | P0 | API-ORD-03 | GET | `/orders/{orderId}` | exists |
| F-CUS-ORDER-SUCCESS | Order success | customer | P0 | API-PAY-02 | GET | `/payments/session/{sessionId}` | exists |
| F-CUS-WISHLIST | Wishlist | customer | P0 | API-WISH-01 | GET | `/wishlist` | exists |
| F-CUS-WISHLIST | Wishlist | customer | P0 | API-WISH-02 | POST | `/wishlist/{productId}` | exists |
| F-CUS-WISHLIST | Wishlist | customer | P0 | API-WISH-03 | DELETE | `/wishlist/{productId}` | exists |
| F-CUS-WISHLIST | Wishlist | customer | P0 | API-WISH-04 | POST | `/wishlist/{productId}/toggle` | exists |
| F-CUS-SIGNIN | Customer sign-in | customer | P0 | API-AUTH-02 | POST | `/auth/customer/sign-in` | exists |
| F-CUS-SIGNUP | Customer sign-up | customer | P0 | API-AUTH-01 | POST | `/auth/customer/sign-up` | exists |
| F-CUS-FORGOT | Forgot password | customer | P0 | API-AUTH-04 | POST | `/auth/customer/forgot-password` | exists |
| F-CUS-RESET | Reset password | customer | P0 | API-AUTH-05 | POST | `/auth/customer/reset-password` | exists |
| F-CUS-SIGNOUT | Sign out | customer | P0 | API-AUTH-03 | POST | `/auth/customer/sign-out` | exists |
| F-CUS-ACCOUNT | Account dashboard | customer | P0 | API-AUTH-13 | GET | `/customers/me` | exists |
| F-CUS-ACCOUNT | Account dashboard | customer | P0 | API-ORD-02 | GET | `/orders` | exists |
| F-CUS-ACCOUNT | Account dashboard | customer | P0 | API-WISH-01 | GET | `/wishlist` | exists |
| F-CUS-PROFILE | Profile | customer | P0 | API-AUTH-13 | GET | `/customers/me` | exists |
| F-CUS-PROFILE | Profile | customer | P0 | API-CUS-01 | PATCH | `/customers/me` | exists |
| F-CUS-ADDRESSES | Addresses | customer | P0 | API-CUS-04 | GET | `/customers/me/addresses` | exists |
| F-CUS-ADDRESSES | Addresses | customer | P0 | API-CUS-05 | POST | `/customers/me/addresses` | exists |
| F-CUS-ADDRESSES | Addresses | customer | P0 | API-CUS-06 | PATCH | `/customers/me/addresses/{addressId}` | exists |
| F-CUS-ADDRESSES | Addresses | customer | P0 | API-CUS-07 | DELETE | `/customers/me/addresses/{addressId}` | exists |
| F-CUS-ADDRESSES | Addresses | customer | P0 | API-CUS-08 | POST | `/customers/me/addresses/{addressId}/default` | exists |
| F-CUS-ORDERS | Orders list | customer | P0 | API-ORD-02 | GET | `/orders` | exists |
| F-CUS-ORDERS | Orders list | customer | P0 | API-ORD-08 | POST | `/orders/claim-guest` | exists |
| F-CUS-ORDER-DETAIL | Order detail / cancel | customer | P0 | API-ORD-03 | GET | `/orders/{orderId}` | exists |
| F-CUS-ORDER-DETAIL | Order detail / cancel | customer | P0 | API-ORD-05 | POST | `/orders/{orderId}/cancel` | exists |
| F-CUS-TRACKING | Order tracking | customer | P1 | API-ORD-04 | GET | `/orders/{orderId}/tracking` | exists |
| F-CUS-RETURN | Request return | customer | P1 | API-ORD-06 | POST | `/orders/{orderId}/returns` | exists |
| F-CUS-RETURN | Request return | customer | P1 | API-ORD-07 | GET | `/orders/{orderId}/returns/{returnId}` | exists |
| F-CUS-SETTINGS | Account settings | customer | P1 | API-AUTH-13 | GET | `/customers/me` | exists |
| F-CUS-SETTINGS | Account settings | customer | P1 | API-CUS-01 | PATCH | `/customers/me` | exists |
| F-CUS-SECURITY | Security | customer | P0 | API-AUTH-06 | POST | `/auth/change-password` | exists |
| F-CUS-SECURITY | Security | customer | P0 | API-CUS-03 | POST | `/customers/me/sessions/revoke-others` | exists |
| F-CUS-PREFERENCES | Preferences | customer | P1 | API-CUS-02 | PATCH | `/customers/me/preferences` | exists |
| F-CUS-OFFERS | Offers / coupons | customer | P1 | API-OFF-01 | GET | `/offers` | exists |
| F-CUS-OFFERS | Offers / coupons | customer | P1 | API-OFF-02 | POST | `/offers/validate` | exists |
| F-CUS-OFFERS | Offers / coupons | customer | P1 | API-SRCH-03 | GET | `/explore/offers` | exists |
| F-CUS-AI-MIRROR | AI Mirror | customer | P3 | API-AI-02 | POST | `/ai/mirror` | missing |
| F-CUS-AI-SHOPPING | AI Shopping assistant | customer | P3 | API-AI-01 | POST | `/ai/shopping` | missing |
| F-ADM-LOGIN | Admin login/logout | admin | P0 | API-AUTH-10 | POST | `/auth/admin/sign-in` | exists |
| F-ADM-LOGIN | Admin login/logout | admin | P0 | API-AUTH-11 | POST | `/auth/admin/sign-out` | exists |
| F-ADM-LOGIN | Admin login/logout | admin | P0 | API-AUTH-12 | GET | `/auth/me` | exists |
| F-ADM-DASHBOARD | Admin dashboard | admin | P1 | API-AN-01 | GET | `/analytics/overview` | exists |
| F-ADM-DASHBOARD | Admin dashboard | admin | P1 | API-AN-05 | GET | `/analytics/orders` | exists |
| F-ADM-DASHBOARD | Admin dashboard | admin | P1 | API-AN-06 | GET | `/analytics/inventory-summary` | exists |
| F-ADM-DASHBOARD | Admin dashboard | admin | P1 | API-AORD-01 | GET | `/admin/orders` | exists |
| F-ADM-ACTIVITY | Admin activity / audit | admin | P1 | API-AUD-01 | GET | `/audit/logs` | exists |
| F-ADM-PROFILE | Admin profile | admin | P1 | API-AUTH-12 | GET | `/auth/me` | exists |
| F-ADM-EMPLOYEES | Employees directory | admin | P1 | API-EMP-01 | GET | `/admin/employees` | exists |
| F-ADM-EMPLOYEES | Employees directory | admin | P1 | API-EMP-08 | DELETE | `/admin/employees/{id}` | exists |
| F-ADM-EMPLOYEES | Employees directory | admin | P1 | API-EMP-09 | GET | `/admin/employees/departments` | exists |
| F-ADM-EMPLOYEES | Employees directory | admin | P1 | API-EMP-13 | GET | `/admin/employees/sections` | exists |
| F-ADM-EMPLOYEE-CREATE | Create employee | admin | P1 | API-EMP-03 | POST | `/admin/employees` | exists |
| F-ADM-EMPLOYEE-DETAIL | Employee detail + attendance | admin | P1 | API-EMP-02 | GET | `/admin/employees/{id}` | exists |
| F-ADM-EMPLOYEE-DETAIL | Employee detail + attendance | admin | P1 | API-ATT-01 | GET | `/admin/employees/{employeeId}/attendance` | exists |
| F-ADM-EMPLOYEE-DETAIL | Employee detail + attendance | admin | P1 | API-ATT-02 | POST | `/admin/employees/{employeeId}/attendance` | exists |
| F-ADM-EMPLOYEE-DETAIL | Employee detail + attendance | admin | P1 | API-ATT-03 | PATCH | `/admin/employees/attendance/{attendanceId}` | exists |
| F-ADM-EMPLOYEE-DETAIL | Employee detail + attendance | admin | P1 | API-LEV-03 | GET | `/admin/leave` | missing |
| F-ADM-EMPLOYEE-DETAIL | Employee detail + attendance | admin | P1 | API-LEV-04 | POST | `/admin/leave/{id}/decision` | missing |
| F-ADM-EMPLOYEE-DETAIL | Employee detail + attendance | admin | P1 | API-PERF-02 | GET | `/admin/performance` | missing |
| F-ADM-EMPLOYEE-EDIT | Edit employee | admin | P1 | API-EMP-04 | PATCH | `/admin/employees/{id}` | exists |
| F-ADM-EMPLOYEE-EDIT | Edit employee | admin | P1 | API-EMP-05 | POST | `/admin/employees/{id}/status` | exists |
| F-ADM-EMPLOYEE-EDIT | Edit employee | admin | P1 | API-EMP-06 | POST | `/admin/employees/{id}/reset-password` | exists |
| F-ADM-EMPLOYEE-EDIT | Edit employee | admin | P1 | API-EMP-07 | PUT | `/admin/employees/{id}/permissions` | exists |
| F-ADM-PRODUCTS | Admin products list | admin | P0 | API-APROD-01 | GET | `/admin/products` | exists |
| F-ADM-PRODUCTS | Admin products list | admin | P0 | API-APROD-06 | GET | `/admin/products/metrics` | exists |
| F-ADM-PRODUCTS | Admin products list | admin | P0 | API-APROD-19 | POST | `/admin/products/bulk` | exists |
| F-ADM-PRODUCT-CREATE | Create product draft | admin | P0 | API-APROD-03 | POST | `/admin/products/draft` | exists |
| F-ADM-PRODUCT-CREATE | Create product draft | admin | P0 | API-APROD-02 | POST | `/admin/products` | exists |
| F-ADM-PRODUCT-CREATE | Create product draft | admin | P0 | API-APROD-04 | GET | `/admin/products/next-id` | exists |
| F-ADM-PRODUCT-CREATE | Create product draft | admin | P0 | API-APROD-05 | GET | `/admin/products/availability` | exists |
| F-ADM-PRODUCT-EDIT | Edit product | admin | P0 | API-APROD-07 | GET | `/admin/products/{id}` | exists |
| F-ADM-PRODUCT-EDIT | Edit product | admin | P0 | API-APROD-08 | PATCH | `/admin/products/{id}` | exists |
| F-ADM-PRODUCT-EDIT | Edit product | admin | P0 | API-APROD-17 | POST | `/admin/products/{id}/change-id` | exists |
| F-ADM-PRODUCT-EDIT | Edit product | admin | P0 | API-APROD-18 | POST | `/admin/products/{id}/duplicate` | exists |
| F-ADM-PRODUCT-DETAIL | Product detail (admin) | admin | P0 | API-APROD-07 | GET | `/admin/products/{id}` | exists |
| F-ADM-PRODUCT-DETAIL | Product detail (admin) | admin | P0 | API-APROD-16 | GET | `/admin/products/{id}/publish-issues` | exists |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | admin | P0 | API-PROD-07 | POST | `/products/{id}/submit-review` | exists |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | admin | P0 | API-APROD-10 | POST | `/admin/products/{id}/approve` | exists |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | admin | P0 | API-APROD-11 | POST | `/admin/products/{id}/reject` | exists |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | admin | P0 | API-APROD-12 | POST | `/admin/products/{id}/publish` | exists |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | admin | P0 | API-APROD-13 | POST | `/admin/products/{id}/unpublish` | exists |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | admin | P0 | API-APROD-14 | POST | `/admin/products/{id}/archive` | exists |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | admin | P0 | API-APROD-15 | POST | `/admin/products/{id}/restore` | exists |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | admin | P0 | API-APROD-16 | GET | `/admin/products/{id}/publish-issues` | exists |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | admin | P0 | API-APROD-20 | POST | `/admin/products/{id}/review-flags/clear` | exists |
| F-ADM-PRODUCT-ASSIGN | Assign product to employee | admin | P1 | API-APROD-09 | POST | `/admin/products/{id}/assign` | exists |
| F-ADM-PRODUCT-MEDIA | Product media manager | admin | P0 | API-MED-05 | POST | `/media/objects` | exists |
| F-ADM-PRODUCT-MEDIA | Product media manager | admin | P0 | API-MED-06 | POST | `/media/products/{id}/objects` | exists |
| F-ADM-PRODUCT-MEDIA | Product media manager | admin | P0 | API-MED-08 | POST | `/media/register` | exists |
| F-ADM-PRODUCT-MEDIA | Product media manager | admin | P0 | API-MED-04 | GET | `/media/products/{id}/media-set` | exists |
| F-ADM-PRODUCT-MEDIA | Product media manager | admin | P0 | API-MED-09 | GET | `/media/assets` | exists |
| F-ADM-MEDIA | Media library | admin | P0 | API-MED-09 | GET | `/media/assets` | exists |
| F-ADM-MEDIA | Media library | admin | P0 | API-MED-01 | GET | `/media/storage/status` | exists |
| F-ADM-MEDIA | Media library | admin | P0 | API-MED-07 | DELETE | `/media/objects/{key}` | exists |
| F-ADM-MEDIA-UPLOAD | Media upload | admin | P0 | API-MED-05 | POST | `/media/objects` | exists |
| F-ADM-MEDIA-UPLOAD | Media upload | admin | P0 | API-MED-08 | POST | `/media/register` | exists |
| F-ADM-MEDIA-UPLOAD | Media upload | admin | P0 | API-MED-01 | GET | `/media/storage/status` | exists |
| F-ADM-MEDIA-REVIEW | Media review | admin | P1 | API-MMED-02 | GET | `/admin/media-reviews` | stub |
| F-ADM-MEDIA-REVIEW | Media review | admin | P1 | API-MMED-03 | POST | `/admin/media-reviews/{id}/approve` | stub |
| F-ADM-MEDIA-REVIEW | Media review | admin | P1 | API-MMED-04 | POST | `/admin/media-reviews/{id}/reject` | stub |
| F-ADM-MARKETING-MEDIA | Marketing media | admin | P1 | API-MMED-01 | GET | `/admin/marketing-media` | stub |
| F-ADM-MARKETING-MEDIA | Marketing media | admin | P1 | API-MMED-02 | GET | `/admin/media-reviews` | stub |
| F-ADM-MEDIA-MAPPING | Media product mapping | admin | P1 | API-MED-09 | GET | `/media/assets` | exists |
| F-ADM-MEDIA-MAPPING | Media product mapping | admin | P1 | API-MED-08 | POST | `/media/register` | exists |
| F-ADM-MEDIA-MAPPING | Media product mapping | admin | P1 | API-MED-04 | GET | `/media/products/{id}/media-set` | exists |
| F-ADM-MEDIA-DETAIL | Media detail | admin | P1 | API-MED-03 | GET | `/media/object-meta/{key}` | exists |
| F-ADM-MEDIA-DETAIL | Media detail | admin | P1 | API-MED-09 | GET | `/media/assets` | exists |
| F-ADM-CATEGORIES | Categories manager | admin | P0 | API-CAT-04 | GET | `/admin/categories` | exists |
| F-ADM-CATEGORIES | Categories manager | admin | P0 | API-COL-12 | GET | `/admin/taxonomy/metrics` | exists |
| F-ADM-CATEGORIES | Categories manager | admin | P0 | API-COL-13 | GET | `/admin/taxonomy/product-counts` | exists |
| F-ADM-CATEGORY-CREATE | Create category | admin | P1 | API-CAT-07 | POST | `/admin/categories` | exists |
| F-ADM-CATEGORY-EDIT | Edit/activate/archive category | admin | P1 | API-CAT-05 | GET | `/admin/categories/{idOrSlug}` | exists |
| F-ADM-CATEGORY-EDIT | Edit/activate/archive category | admin | P1 | API-CAT-08 | PATCH | `/admin/categories/{id}` | exists |
| F-ADM-CATEGORY-EDIT | Edit/activate/archive category | admin | P1 | API-CAT-09 | POST | `/admin/categories/{id}/activate` | exists |
| F-ADM-CATEGORY-EDIT | Edit/activate/archive category | admin | P1 | API-CAT-10 | POST | `/admin/categories/{id}/archive` | exists |
| F-ADM-CATEGORY-EDIT | Edit/activate/archive category | admin | P1 | API-CAT-11 | POST | `/admin/categories/{id}/restore` | exists |
| F-ADM-SUBCATEGORIES | Subcategories | admin | P1 | API-CAT-06 | GET | `/admin/categories/{categoryId}/subcategories` | exists |
| F-ADM-SUBCATEGORIES | Subcategories | admin | P1 | API-CAT-12 | POST | `/admin/categories/{categoryId}/subcategories` | exists |
| F-ADM-SUBCATEGORIES | Subcategories | admin | P1 | API-CAT-13 | PATCH | `/admin/subcategories/{id}` | exists |
| F-ADM-SUBCATEGORIES | Subcategories | admin | P1 | API-CAT-14 | POST | `/admin/subcategories/{id}/activate` | exists |
| F-ADM-SUBCATEGORIES | Subcategories | admin | P1 | API-CAT-15 | POST | `/admin/subcategories/{id}/archive` | exists |
| F-ADM-SUBCATEGORIES | Subcategories | admin | P1 | API-CAT-16 | POST | `/admin/subcategories/{id}/restore` | exists |
| F-ADM-COLLECTIONS | Collections manager | admin | P1 | API-COL-03 | GET | `/admin/collections` | exists |
| F-ADM-COLLECTIONS | Collections manager | admin | P1 | API-COL-12 | GET | `/admin/taxonomy/metrics` | exists |
| F-ADM-COLLECTION-CREATE | Create collection | admin | P1 | API-COL-05 | POST | `/admin/collections` | exists |
| F-ADM-COLLECTION-EDIT | Edit collection lifecycle | admin | P1 | API-COL-04 | GET | `/admin/collections/{id}` | exists |
| F-ADM-COLLECTION-EDIT | Edit collection lifecycle | admin | P1 | API-COL-06 | PATCH | `/admin/collections/{id}` | exists |
| F-ADM-COLLECTION-EDIT | Edit collection lifecycle | admin | P1 | API-COL-07 | POST | `/admin/collections/{id}/activate` | exists |
| F-ADM-COLLECTION-EDIT | Edit collection lifecycle | admin | P1 | API-COL-08 | POST | `/admin/collections/{id}/pause` | exists |
| F-ADM-COLLECTION-EDIT | Edit collection lifecycle | admin | P1 | API-COL-09 | POST | `/admin/collections/{id}/archive` | exists |
| F-ADM-COLLECTION-EDIT | Edit collection lifecycle | admin | P1 | API-COL-10 | POST | `/admin/collections/{id}/restore` | exists |
| F-ADM-COLLECTION-PRODUCTS | Collection products | admin | P1 | API-COL-11 | PUT | `/admin/collections/{id}/products` | exists |
| F-ADM-OFFERS | Offers list | admin | P1 | API-OFF-03 | GET | `/admin/offers` | exists |
| F-ADM-OFFER-CREATE | Create offer | admin | P1 | API-OFF-05 | POST | `/admin/offers` | exists |
| F-ADM-OFFER-EDIT | Edit/activate/pause/archive offer | admin | P1 | API-OFF-04 | GET | `/admin/offers/{id}` | exists |
| F-ADM-OFFER-EDIT | Edit/activate/pause/archive offer | admin | P1 | API-OFF-06 | PATCH | `/admin/offers/{id}` | exists |
| F-ADM-OFFER-EDIT | Edit/activate/pause/archive offer | admin | P1 | API-OFF-07 | POST | `/admin/offers/{id}/activate` | exists |
| F-ADM-OFFER-EDIT | Edit/activate/pause/archive offer | admin | P1 | API-OFF-08 | POST | `/admin/offers/{id}/pause` | exists |
| F-ADM-OFFER-EDIT | Edit/activate/pause/archive offer | admin | P1 | API-OFF-09 | POST | `/admin/offers/{id}/archive` | exists |
| F-ADM-OFFER-DETAIL | Offer detail | admin | P1 | API-OFF-04 | GET | `/admin/offers/{id}` | exists |
| F-ADM-ORDERS | Orders list / status | admin | P0 | API-AORD-01 | GET | `/admin/orders` | exists |
| F-ADM-ORDERS | Orders list / status | admin | P0 | API-AORD-13 | POST | `/admin/orders/{id}/cancel` | exists |
| F-ADM-ORDERS | Orders list / status | admin | P0 | API-AORD-15 | POST | `/admin/orders/{id}/status` | exists |
| F-ADM-ORDERS | Orders list / status | admin | P0 | API-AORD-16 | POST | `/admin/orders/{id}/force-status` | exists |
| F-ADM-ORDER-DETAIL | Order detail + notes | admin | P0 | API-AORD-02 | GET | `/admin/orders/{id}` | exists |
| F-ADM-ORDER-DETAIL | Order detail + notes | admin | P0 | API-AORD-14 | POST | `/admin/orders/{id}/notes` | exists |
| F-ADM-INVOICE | Invoice metadata | admin | P1 | API-AORD-03 | GET | `/admin/orders/{id}/invoice` | exists |
| F-ADM-FULFILLMENT | Fulfillment pipeline | admin | P1 | API-AORD-04 | POST | `/admin/orders/{id}/allocate` | exists |
| F-ADM-FULFILLMENT | Fulfillment pipeline | admin | P1 | API-AORD-05 | POST | `/admin/orders/{id}/pick/start` | exists |
| F-ADM-FULFILLMENT | Fulfillment pipeline | admin | P1 | API-AORD-06 | POST | `/admin/orders/{id}/pick/item` | exists |
| F-ADM-FULFILLMENT | Fulfillment pipeline | admin | P1 | API-AORD-07 | POST | `/admin/orders/{id}/pack` | exists |
| F-ADM-FULFILLMENT | Fulfillment pipeline | admin | P1 | API-AORD-08 | POST | `/admin/orders/{id}/ready` | exists |
| F-ADM-FULFILLMENT | Fulfillment pipeline | admin | P1 | API-AORD-09 | POST | `/admin/orders/{id}/out-for-delivery` | exists |
| F-ADM-FULFILLMENT | Fulfillment pipeline | admin | P1 | API-AORD-10 | POST | `/admin/orders/{id}/deliver` | exists |
| F-ADM-FULFILLMENT | Fulfillment pipeline | admin | P1 | API-AORD-11 | POST | `/admin/orders/{id}/fulfillment` | exists |
| F-ADM-FULFILLMENT | Fulfillment pipeline | admin | P1 | API-AORD-12 | POST | `/admin/orders/{id}/dispatch` | exists |
| F-ADM-CUSTOMERS | Customers list | admin | P1 | API-CUS-09 | GET | `/admin/customers` | exists |
| F-ADM-CUSTOMER-DETAIL | Customer detail | admin | P1 | API-CUS-10 | GET | `/admin/customers/{customerId}` | exists |
| F-ADM-CUSTOMER-DETAIL | Customer detail | admin | P1 | API-AORD-01 | GET | `/admin/orders` | exists |
| F-ADM-RETURNS | Returns desk | admin | P1 | API-RET-01 | GET | `/admin/returns` | exists |
| F-ADM-RETURNS | Returns desk | admin | P1 | API-RET-03 | POST | `/admin/returns/{id}/approve` | exists |
| F-ADM-RETURNS | Returns desk | admin | P1 | API-RET-04 | POST | `/admin/returns/{id}/reject` | exists |
| F-ADM-RETURNS | Returns desk | admin | P1 | API-RET-05 | POST | `/admin/returns/{id}/schedule-pickup` | exists |
| F-ADM-RETURNS | Returns desk | admin | P1 | API-RET-06 | POST | `/admin/returns/{id}/receive` | exists |
| F-ADM-RETURNS | Returns desk | admin | P1 | API-RET-07 | POST | `/admin/returns/{id}/inspect` | exists |
| F-ADM-RETURNS | Returns desk | admin | P1 | API-RET-08 | POST | `/admin/returns/{id}/refund/initiate` | exists |
| F-ADM-RETURNS | Returns desk | admin | P1 | API-RET-09 | POST | `/admin/returns/{id}/refund/complete` | exists |
| F-ADM-RETURN-DETAIL | Return detail | admin | P1 | API-RET-02 | GET | `/admin/returns/{id}` | exists |
| F-ADM-INVENTORY | Inventory dashboard | admin | P1 | API-INV-01 | GET | `/admin/inventory/stock` | stub |
| F-ADM-INVENTORY | Inventory dashboard | admin | P1 | API-INV-02 | GET | `/admin/inventory/stock/{id}` | stub |
| F-ADM-INVENTORY | Inventory dashboard | admin | P1 | API-INV-06 | GET | `/admin/inventory/reservations` | stub |
| F-ADM-INVENTORY | Inventory dashboard | admin | P1 | API-AN-06 | GET | `/analytics/inventory-summary` | exists |
| F-ADM-INV-ADJUST | Inventory receive/adjust | admin | P1 | API-INV-03 | POST | `/admin/inventory/adjust` | stub |
| F-ADM-INV-TRANSFERS | Stock transfers | admin | P1 | API-INV-09 | GET | `/admin/inventory/transfers` | stub |
| F-ADM-INV-TRANSFERS | Stock transfers | admin | P1 | API-INV-10 | POST | `/admin/inventory/transfers` | stub |
| F-ADM-INV-TRANSFERS | Stock transfers | admin | P1 | API-INV-11 | POST | `/admin/inventory/transfers/{id}/complete` | stub |
| F-ADM-INV-MOVEMENTS | Stock movements | admin | P1 | API-INV-04 | GET | `/admin/inventory/movements` | stub |
| F-ADM-INV-LOW | Low stock | admin | P1 | API-INV-05 | GET | `/admin/inventory/low-stock` | stub |
| F-ADM-WAREHOUSES | Warehouses | admin | P1 | API-INV-07 | GET | `/admin/warehouses` | stub |
| F-ADM-WAREHOUSES | Warehouses | admin | P1 | API-INV-08 | POST | `/admin/warehouses` | stub |
| F-ADM-ANALYTICS | Analytics hub | admin | P1 | API-AN-01 | GET | `/analytics/overview` | exists |
| F-ADM-AN-SALES | Analytics sales | admin | P1 | API-AN-02 | GET | `/analytics/sales` | exists |
| F-ADM-AN-PRODUCTS | Analytics products | admin | P1 | API-AN-03 | GET | `/analytics/products` | exists |
| F-ADM-AN-CUSTOMERS | Analytics customers | admin | P1 | API-AN-04 | GET | `/analytics/customers` | exists |
| F-ADM-AN-INVENTORY | Analytics inventory | admin | P1 | API-AN-06 | GET | `/analytics/inventory-summary` | exists |
| F-ADM-AN-RETURNS | Analytics returns | admin | P2 | API-RET-01 | GET | `/admin/returns` | exists |
| F-ADM-AN-RETURNS | Analytics returns | admin | P2 | API-AN-05 | GET | `/analytics/orders` | exists |
| F-ADM-AN-OFFERS | Analytics offers | admin | P2 | API-OFF-03 | GET | `/admin/offers` | exists |
| F-ADM-AI | Admin AI assistant | admin | P3 | API-AI-03 | POST | `/admin/ai/assistant` | missing |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-SET-01 | GET | `/admin/settings` | exists |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-SET-02 | GET | `/admin/settings/{section}` | exists |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-SET-03 | PATCH | `/admin/settings/{section}` | exists |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-SET-04 | POST | `/admin/settings/{section}/reset` | exists |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-SET-05 | POST | `/admin/settings/reset` | exists |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-RBAC-01 | GET | `/roles` | exists |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-RBAC-02 | GET | `/roles/{roleId}` | exists |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-RBAC-03 | GET | `/permissions` | exists |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-RBAC-04 | GET | `/users` | exists |
| F-ADM-SETTINGS | Admin settings + RBAC | admin | P1 | API-RBAC-05 | GET | `/users/{userId}` | exists |
| F-EMP-LOGIN | Employee login/logout | employee | P0 | API-AUTH-07 | POST | `/auth/employee/sign-in` | exists |
| F-EMP-LOGIN | Employee login/logout | employee | P0 | API-AUTH-09 | POST | `/auth/employee/sign-out` | exists |
| F-EMP-LOGIN | Employee login/logout | employee | P0 | API-AUTH-14 | GET | `/employee/me` | exists |
| F-EMP-CHANGE-PW | Employee change/forgot password | employee | P0 | API-AUTH-08 | POST | `/auth/employee/change-password` | exists |
| F-EMP-CHANGE-PW | Employee change/forgot password | employee | P0 | API-AUTH-15 | POST | `/auth/employee/forgot-password` | missing |
| F-EMP-DASHBOARD | Employee dashboard | employee | P1 | API-EPROD-03 | GET | `/employee/me/assigned-products` | exists |
| F-EMP-DASHBOARD | Employee dashboard | employee | P1 | API-ATT-06 | GET | `/employee/attendance/today` | missing |
| F-EMP-DASHBOARD | Employee dashboard | employee | P1 | API-AN-06 | GET | `/analytics/inventory-summary` | exists |
| F-EMP-PROFILE | Employee profile | employee | P1 | API-AUTH-14 | GET | `/employee/me` | exists |
| F-EMP-ATTENDANCE | Attendance punch + history | employee | P1 | API-ATT-04 | POST | `/employee/attendance/check-in` | missing |
| F-EMP-ATTENDANCE | Attendance punch + history | employee | P1 | API-ATT-05 | POST | `/employee/attendance/check-out` | missing |
| F-EMP-ATTENDANCE | Attendance punch + history | employee | P1 | API-ATT-06 | GET | `/employee/attendance/today` | missing |
| F-EMP-ATTENDANCE | Attendance punch + history | employee | P1 | API-ATT-07 | GET | `/employee/attendance` | missing |
| F-EMP-ATTENDANCE | Attendance punch + history | employee | P1 | API-ATT-01 | GET | `/admin/employees/{employeeId}/attendance` | exists |
| F-EMP-LEAVE | Leave | employee | P2 | API-LEV-01 | GET | `/employee/leave` | missing |
| F-EMP-LEAVE | Leave | employee | P2 | API-LEV-02 | POST | `/employee/leave` | missing |
| F-EMP-LEAVE | Leave | employee | P2 | API-LEV-03 | GET | `/admin/leave` | missing |
| F-EMP-PERFORMANCE | Performance | employee | P2 | API-PERF-01 | GET | `/employee/performance` | missing |
| F-EMP-PERFORMANCE | Performance | employee | P2 | API-PERF-02 | GET | `/admin/performance` | missing |
| F-EMP-PRODUCTS | Employee products inbox | employee | P0 | API-EPROD-03 | GET | `/employee/me/assigned-products` | exists |
| F-EMP-PRODUCTS | Employee products inbox | employee | P0 | API-EPROD-01 | GET | `/employee/products/{id}` | exists |
| F-EMP-PRODUCT-CREATE | Employee new product | employee | P1 | API-APROD-04 | GET | `/admin/products/next-id` | exists |
| F-EMP-PRODUCT-CREATE | Employee new product | employee | P1 | API-EPROD-02 | PATCH | `/employee/products/{id}` | exists |
| F-EMP-PRODUCT-EDIT | Employee edit/submit product | employee | P0 | API-EPROD-01 | GET | `/employee/products/{id}` | exists |
| F-EMP-PRODUCT-EDIT | Employee edit/submit product | employee | P0 | API-EPROD-02 | PATCH | `/employee/products/{id}` | exists |
| F-EMP-PRODUCT-EDIT | Employee edit/submit product | employee | P0 | API-PROD-07 | POST | `/products/{id}/submit-review` | exists |
| F-EMP-MEDIA | Employee media library | employee | P1 | API-MED-04 | GET | `/media/products/{id}/media-set` | exists |
| F-EMP-MEDIA | Employee media library | employee | P1 | API-MED-09 | GET | `/media/assets` | exists |
| F-EMP-MEDIA-UPLOAD | Employee media upload | employee | P1 | API-MED-06 | POST | `/media/products/{id}/objects` | exists |
| F-EMP-MEDIA-UPLOAD | Employee media upload | employee | P1 | API-MED-08 | POST | `/media/register` | exists |
| F-EMP-CUSTOMERS | Employee customers | employee | P2 | API-CUS-09 | GET | `/admin/customers` | exists |
| F-EMP-ORDERS | Employee orders | employee | P1 | API-AORD-01 | GET | `/admin/orders` | exists |
| F-EMP-ORDERS | Employee orders | employee | P1 | API-AORD-02 | GET | `/admin/orders/{id}` | exists |
| F-EMP-OFFERS | Employee offers | employee | P2 | API-OFF-03 | GET | `/admin/offers` | exists |
| F-EMP-OFFERS | Employee offers | employee | P2 | API-OFF-04 | GET | `/admin/offers/{id}` | exists |
| F-EMP-INVENTORY | Employee inventory | employee | P1 | API-INV-01 | GET | `/admin/inventory/stock` | stub |
| F-EMP-INVENTORY | Employee inventory | employee | P1 | API-INV-05 | GET | `/admin/inventory/low-stock` | stub |
| F-EMP-INV-ADJUST | Employee receive/adjust | employee | P1 | API-INV-03 | POST | `/admin/inventory/adjust` | stub |
| F-EMP-INV-MOVEMENTS | Employee movements | employee | P1 | API-INV-04 | GET | `/admin/inventory/movements` | stub |
| F-EMP-INV-TRANSFERS | Employee transfers | employee | P1 | API-INV-09 | GET | `/admin/inventory/transfers` | stub |
| F-EMP-INV-TRANSFERS | Employee transfers | employee | P1 | API-INV-10 | POST | `/admin/inventory/transfers` | stub |
| F-EMP-INV-TRANSFERS | Employee transfers | employee | P1 | API-INV-11 | POST | `/admin/inventory/transfers/{id}/complete` | stub |
| F-EMP-INV-LOW | Employee low/out of stock | employee | P1 | API-INV-05 | GET | `/admin/inventory/low-stock` | stub |
| F-EMP-WAREHOUSE | Warehouse desks | employee | P1 | API-INV-07 | GET | `/admin/warehouses` | stub |
| F-EMP-WAREHOUSE | Warehouse desks | employee | P1 | API-AORD-05 | POST | `/admin/orders/{id}/pick/start` | exists |
| F-EMP-WAREHOUSE | Warehouse desks | employee | P1 | API-AORD-06 | POST | `/admin/orders/{id}/pick/item` | exists |
| F-EMP-WAREHOUSE | Warehouse desks | employee | P1 | API-AORD-07 | POST | `/admin/orders/{id}/pack` | exists |
| F-EMP-WAREHOUSE | Warehouse desks | employee | P1 | API-RET-06 | POST | `/admin/returns/{id}/receive` | exists |
| F-EMP-RETURNS | Employee returns | employee | P1 | API-RET-01 | GET | `/admin/returns` | exists |
| F-EMP-RETURNS | Employee returns | employee | P1 | API-RET-02 | GET | `/admin/returns/{id}` | exists |
| F-EMP-SUPPORT | Support desk | employee | P2 | API-SUP-01 | GET | `/employee/support/cases` | missing |
| F-EMP-SUPPORT | Support desk | employee | P2 | API-SUP-02 | POST | `/employee/support/cases` | missing |
| F-EMP-SUPPORT | Support desk | employee | P2 | API-SUP-03 | PATCH | `/employee/support/cases/{id}` | missing |
| F-EMP-STYLING | Styling desks | employee | P2 | API-STY-01 | GET | `/employee/styling/appointments` | missing |
| F-EMP-STYLING | Styling desks | employee | P2 | API-STY-02 | GET | `/employee/styling/requests` | missing |
| F-EMP-SALES | Floor sales desk | employee | P2 | API-SALE-01 | GET | `/employee/sales/departments` | missing |
| F-EMP-SALES | Floor sales desk | employee | P2 | API-AN-02 | GET | `/analytics/sales` | exists |
| F-EMP-TEAM | Team | employee | P2 | API-EMP-01 | GET | `/admin/employees` | exists |
| F-EMP-REPORTS-SALES | Employee sales report | employee | P2 | API-AN-02 | GET | `/analytics/sales` | exists |
| F-EMP-REPORTS-SALES | Employee sales report | employee | P2 | API-SALE-01 | GET | `/employee/sales/departments` | missing |
| F-EMP-REPORTS-PRODUCTS | Employee products report | employee | P2 | API-AN-03 | GET | `/analytics/products` | exists |
| F-EMP-REPORTS-CUSTOMERS | Employee customers report | employee | P2 | API-AN-04 | GET | `/analytics/customers` | exists |
| F-EMP-REPORTS-INVENTORY | Employee inventory report | employee | P2 | API-AN-06 | GET | `/analytics/inventory-summary` | exists |
| F-EMP-REPORTS-INVENTORY | Employee inventory report | employee | P2 | API-INV-01 | GET | `/admin/inventory/stock` | stub |
| F-EMP-REPORTS-RETURNS | Employee returns report | employee | P2 | API-RET-01 | GET | `/admin/returns` | exists |
| F-EMP-REPORTS-OFFERS | Employee offers report | employee | P2 | API-OFF-03 | GET | `/admin/offers` | exists |
| F-EMP-REPORTS-EMPLOYEES | Employee team report | employee | P2 | API-ATT-01 | GET | `/admin/employees/{employeeId}/attendance` | exists |
| F-EMP-REPORTS-EMPLOYEES | Employee team report | employee | P2 | API-PERF-02 | GET | `/admin/performance` | missing |

_Pairs: 313. Features: 122. APIs: 225_.

