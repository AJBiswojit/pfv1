# Frontend feature inventory

Every user-facing feature currently routed in `frontend/src/App.jsx` (plus taxonomy nav and PDP rails). **No invented features.**

| Priority | Features |
|---|---:|
| P0 | 39 |
| P1 | 62 |
| P2 | 18 |
| P3 | 3 |
| **Total** | **122** |

| Portal | Features |
|---|---:|
| customer | 33 |
| admin | 56 |
| employee | 33 |

Status notes live in the API column: `exists` / `stub` / `missing` refer to APIs, not whether a React page exists. A page can exist and still be blocked.

## Customer storefront

| ID | Feature | Surface | P | APIs |
|---|---|---|---|---|
| F-CUS-HOME | Home / Atelier | `GET /` | P0 | API-SRCH-04,API-PROD-01,API-COL-01,API-OFF-01,API-MED-02,API-MMED-01 |
| F-CUS-NAV | Taxonomy mega-menu | `Header` | P0 | API-CAT-01,API-CAT-03 |
| F-CUS-SHOP | Shop listing | `/shop` | P0 | API-PROD-01,API-SRCH-01 |
| F-CUS-EXPLORE | Explore | `/explore` | P1 | API-SRCH-02,API-SRCH-03 |
| F-CUS-SEARCH | Search | `/search` | P0 | API-SRCH-01 |
| F-CUS-CATEGORY | Category listing | `/category/:slug` | P0 | API-CAT-02,API-CAT-03,API-PROD-01 |
| F-CUS-COLLECTION | Collection listing | `/collection/:slug` | P0 | API-COL-02,API-PROD-04 |
| F-CUS-KIDS | Kids department browse | `taxonomy kids` | P0 | API-PROD-01,API-CAT-01,API-CAT-03 |
| F-CUS-PDP | Product detail + gallery | `/product/:productId` | P0 | API-PROD-02,API-MED-04,API-MED-02,API-PROD-03,API-CART-02,API-WISH-02,API-PROD-06 |
| F-CUS-RECS | PDP recommendations | `PDP rail` | P1 | API-PROD-03 |
| F-CUS-RECENT | Recently viewed | `account/home rails` | P2 | API-PROD-05,API-PROD-06 |
| F-CUS-CART | Cart | `/cart` | P0 | API-CART-01,API-CART-02,API-CART-03,API-CART-04,API-CART-05,API-CART-06,API-CART-07 |
| F-CUS-CHECKOUT | Checkout + payments | `/checkout` | P0 | API-CART-08,API-OFF-02,API-CUS-04,API-ORD-01,API-PAY-01,API-PAY-02,API-PAY-03,API-PAY-04 |
| F-CUS-ORDER-SUCCESS | Order success | `/order-success` | P0 | API-ORD-03,API-PAY-02 |
| F-CUS-WISHLIST | Wishlist | `/wishlist` | P0 | API-WISH-01,API-WISH-02,API-WISH-03,API-WISH-04 |
| F-CUS-SIGNIN | Customer sign-in | `/signin` | P0 | API-AUTH-02 |
| F-CUS-SIGNUP | Customer sign-up | `/signup` | P0 | API-AUTH-01 |
| F-CUS-FORGOT | Forgot password | `/forgot-password` | P0 | API-AUTH-04 |
| F-CUS-RESET | Reset password | `/reset-password` | P0 | API-AUTH-05 |
| F-CUS-SIGNOUT | Sign out | `account` | P0 | API-AUTH-03 |
| F-CUS-ACCOUNT | Account dashboard | `/account` | P0 | API-AUTH-13,API-ORD-02,API-WISH-01 |
| F-CUS-PROFILE | Profile | `/account/profile` | P0 | API-AUTH-13,API-CUS-01 |
| F-CUS-ADDRESSES | Addresses | `/account/addresses` | P0 | API-CUS-04,API-CUS-05,API-CUS-06,API-CUS-07,API-CUS-08 |
| F-CUS-ORDERS | Orders list | `/account/orders` | P0 | API-ORD-02,API-ORD-08 |
| F-CUS-ORDER-DETAIL | Order detail / cancel | `/account/orders/:id` | P0 | API-ORD-03,API-ORD-05 |
| F-CUS-TRACKING | Order tracking | `.../track` | P1 | API-ORD-04 |
| F-CUS-RETURN | Request return | `.../return` | P1 | API-ORD-06,API-ORD-07 |
| F-CUS-SETTINGS | Account settings | `/account/settings` | P1 | API-AUTH-13,API-CUS-01 |
| F-CUS-SECURITY | Security | `/account/security` | P0 | API-AUTH-06,API-CUS-03 |
| F-CUS-PREFERENCES | Preferences | `/account/preferences` | P1 | API-CUS-02 |
| F-CUS-OFFERS | Offers / coupons | `explore/home/checkout` | P1 | API-OFF-01,API-OFF-02,API-SRCH-03 |
| F-CUS-AI-MIRROR | AI Mirror | `/account/ai-mirror` | P3 | API-AI-02 |
| F-CUS-AI-SHOPPING | AI Shopping assistant | `/account/ai-shopping` | P3 | API-AI-01 |

### Detail

#### F-CUS-HOME — Home / Atelier

- **Portal:** customer
- **Surface:** `GET /`
- **What it does:** Hero, collections, sale banner from GET /home + catalogue hydrate.
- **Priority:** P0
- **APIs:** API-SRCH-04,API-PROD-01,API-COL-01,API-OFF-01,API-MED-02,API-MMED-01

#### F-CUS-NAV — Taxonomy mega-menu

- **Portal:** customer
- **Surface:** `Header`
- **What it does:** Department→category→subcategory including kids. taxonomy.js + GET /categories.
- **Priority:** P0
- **APIs:** API-CAT-01,API-CAT-03

#### F-CUS-SHOP — Shop listing

- **Portal:** customer
- **Surface:** `/shop`
- **What it does:** Filters/sort via GET /products or /search. pageSize 100 hydrate risk.
- **Priority:** P0
- **APIs:** API-PROD-01,API-SRCH-01

#### F-CUS-EXPLORE — Explore

- **Portal:** customer
- **Surface:** `/explore`
- **What it does:** Editorial explore. Offers wiring gap B-06.
- **Priority:** P1
- **APIs:** API-SRCH-02,API-SRCH-03

#### F-CUS-SEARCH — Search

- **Portal:** customer
- **Surface:** `/search`
- **What it does:** Query box + results.
- **Priority:** P0
- **APIs:** API-SRCH-01

#### F-CUS-CATEGORY — Category listing

- **Portal:** customer
- **Surface:** `/category/:slug`
- **What it does:** CategoryPage.
- **Priority:** P0
- **APIs:** API-CAT-02,API-CAT-03,API-PROD-01

#### F-CUS-COLLECTION — Collection listing

- **Portal:** customer
- **Surface:** `/collection/:slug`
- **What it does:** Collection landing + products.
- **Priority:** P0
- **APIs:** API-COL-02,API-PROD-04

#### F-CUS-KIDS — Kids department browse

- **Portal:** customer
- **Surface:** `taxonomy kids`
- **What it does:** Same product system PF-K-*. Not a side catalogue.
- **Priority:** P0
- **APIs:** API-PROD-01,API-CAT-01,API-CAT-03

#### F-CUS-PDP — Product detail + gallery

- **Portal:** customer
- **Surface:** `/product/:productId`
- **What it does:** Published product, media-set, add to cart/wishlist.
- **Priority:** P0
- **APIs:** API-PROD-02,API-MED-04,API-MED-02,API-PROD-03,API-CART-02,API-WISH-02,API-PROD-06

#### F-CUS-RECS — PDP recommendations

- **Portal:** customer
- **Surface:** `PDP rail`
- **What it does:** Related products.
- **Priority:** P1
- **APIs:** API-PROD-03

#### F-CUS-RECENT — Recently viewed

- **Portal:** customer
- **Surface:** `account/home rails`
- **What it does:** Recently viewed products.
- **Priority:** P2
- **APIs:** API-PROD-05,API-PROD-06

#### F-CUS-CART — Cart

- **Portal:** customer
- **Surface:** `/cart`
- **What it does:** Authenticated cart; guest local until login.
- **Priority:** P0
- **APIs:** API-CART-01,API-CART-02,API-CART-03,API-CART-04,API-CART-05,API-CART-06,API-CART-07

#### F-CUS-CHECKOUT — Checkout + payments

- **Portal:** customer
- **Surface:** `/checkout`
- **What it does:** Address, delivery, coupon, payment session, place order without client prices.
- **Priority:** P0
- **APIs:** API-CART-08,API-OFF-02,API-CUS-04,API-ORD-01,API-PAY-01,API-PAY-02,API-PAY-03,API-PAY-04

#### F-CUS-ORDER-SUCCESS — Order success

- **Portal:** customer
- **Surface:** `/order-success`
- **What it does:** Confirmation of placed order.
- **Priority:** P0
- **APIs:** API-ORD-03,API-PAY-02

#### F-CUS-WISHLIST — Wishlist

- **Portal:** customer
- **Surface:** `/wishlist`
- **What it does:** Saved products.
- **Priority:** P0
- **APIs:** API-WISH-01,API-WISH-02,API-WISH-03,API-WISH-04

#### F-CUS-SIGNIN — Customer sign-in

- **Portal:** customer
- **Surface:** `/signin`
- **What it does:** JWT. No demo passwords.
- **Priority:** P0
- **APIs:** API-AUTH-02

#### F-CUS-SIGNUP — Customer sign-up

- **Portal:** customer
- **Surface:** `/signup`
- **What it does:** Register + tokens.
- **Priority:** P0
- **APIs:** API-AUTH-01

#### F-CUS-FORGOT — Forgot password

- **Portal:** customer
- **Surface:** `/forgot-password`
- **What it does:** Opaque email.
- **Priority:** P0
- **APIs:** API-AUTH-04

#### F-CUS-RESET — Reset password

- **Portal:** customer
- **Surface:** `/reset-password`
- **What it does:** Token reset.
- **Priority:** P0
- **APIs:** API-AUTH-05

#### F-CUS-SIGNOUT — Sign out

- **Portal:** customer
- **Surface:** `account`
- **What it does:** Clear tokens.
- **Priority:** P0
- **APIs:** API-AUTH-03

#### F-CUS-ACCOUNT — Account dashboard

- **Portal:** customer
- **Surface:** `/account`
- **What it does:** Requires profile row.
- **Priority:** P0
- **APIs:** API-AUTH-13,API-ORD-02,API-WISH-01

#### F-CUS-PROFILE — Profile

- **Portal:** customer
- **Surface:** `/account/profile`
- **What it does:** Edit name/phone.
- **Priority:** P0
- **APIs:** API-AUTH-13,API-CUS-01

#### F-CUS-ADDRESSES — Addresses

- **Portal:** customer
- **Surface:** `/account/addresses`
- **What it does:** Address book CRUD + default.
- **Priority:** P0
- **APIs:** API-CUS-04,API-CUS-05,API-CUS-06,API-CUS-07,API-CUS-08

#### F-CUS-ORDERS — Orders list

- **Portal:** customer
- **Surface:** `/account/orders`
- **What it does:** Own orders + guest claim.
- **Priority:** P0
- **APIs:** API-ORD-02,API-ORD-08

#### F-CUS-ORDER-DETAIL — Order detail / cancel

- **Portal:** customer
- **Surface:** `/account/orders/:id`
- **What it does:** Read model + cancel.
- **Priority:** P0
- **APIs:** API-ORD-03,API-ORD-05

#### F-CUS-TRACKING — Order tracking

- **Portal:** customer
- **Surface:** `.../track`
- **What it does:** Stored events only.
- **Priority:** P1
- **APIs:** API-ORD-04

#### F-CUS-RETURN — Request return

- **Portal:** customer
- **Surface:** `.../return`
- **What it does:** Create/get return.
- **Priority:** P1
- **APIs:** API-ORD-06,API-ORD-07

#### F-CUS-SETTINGS — Account settings

- **Portal:** customer
- **Surface:** `/account/settings`
- **What it does:** Account settings chrome.
- **Priority:** P1
- **APIs:** API-AUTH-13,API-CUS-01

#### F-CUS-SECURITY — Security

- **Portal:** customer
- **Surface:** `/account/security`
- **What it does:** Change password + revoke other sessions.
- **Priority:** P0
- **APIs:** API-AUTH-06,API-CUS-03

#### F-CUS-PREFERENCES — Preferences

- **Portal:** customer
- **Surface:** `/account/preferences`
- **What it does:** Email/SMS prefs, not an inbox.
- **Priority:** P1
- **APIs:** API-CUS-02

#### F-CUS-OFFERS — Offers / coupons

- **Portal:** customer
- **Surface:** `explore/home/checkout`
- **What it does:** Public offers + checkout validate.
- **Priority:** P1
- **APIs:** API-OFF-01,API-OFF-02,API-SRCH-03

#### F-CUS-AI-MIRROR — AI Mirror

- **Portal:** customer
- **Surface:** `/account/ai-mirror`
- **What it does:** Preview until API-AI-02.
- **Priority:** P3
- **APIs:** API-AI-02

#### F-CUS-AI-SHOPPING — AI Shopping assistant

- **Portal:** customer
- **Surface:** `/account/ai-shopping`
- **What it does:** Preview until API-AI-01.
- **Priority:** P3
- **APIs:** API-AI-01

## Admin portal

| ID | Feature | Surface | P | APIs |
|---|---|---|---|---|
| F-ADM-LOGIN | Admin login/logout | `/admin/login` | P0 | API-AUTH-10,API-AUTH-11,API-AUTH-12 |
| F-ADM-DASHBOARD | Admin dashboard | `/admin/dashboard` | P1 | API-AN-01,API-AN-05,API-AN-06,API-AORD-01 |
| F-ADM-ACTIVITY | Admin activity / audit | `/admin/activity` | P1 | API-AUD-01 |
| F-ADM-PROFILE | Admin profile | `/admin/profile` | P1 | API-AUTH-12 |
| F-ADM-EMPLOYEES | Employees directory | `/admin/employees` | P1 | API-EMP-01,API-EMP-08,API-EMP-09,API-EMP-13 |
| F-ADM-EMPLOYEE-CREATE | Create employee | `/admin/employees/new` | P1 | API-EMP-03 |
| F-ADM-EMPLOYEE-DETAIL | Employee detail + attendance | `/admin/employees/:id` | P1 | API-EMP-02,API-ATT-01,API-ATT-02,API-ATT-03,API-LEV-03,API-LEV-04,API-PERF-02 |
| F-ADM-EMPLOYEE-EDIT | Edit employee | `.../edit` | P1 | API-EMP-04,API-EMP-05,API-EMP-06,API-EMP-07 |
| F-ADM-PRODUCTS | Admin products list | `/admin/products` | P0 | API-APROD-01,API-APROD-06,API-APROD-19 |
| F-ADM-PRODUCT-CREATE | Create product draft | `/admin/products/new` | P0 | API-APROD-03,API-APROD-02,API-APROD-04,API-APROD-05 |
| F-ADM-PRODUCT-EDIT | Edit product | `.../edit` | P0 | API-APROD-07,API-APROD-08,API-APROD-17,API-APROD-18 |
| F-ADM-PRODUCT-DETAIL | Product detail (admin) | `/admin/products/:id` | P0 | API-APROD-07,API-APROD-16 |
| F-ADM-PRODUCT-WORKFLOW | Product workflow | `review + commands` | P0 | API-PROD-07,API-APROD-10,API-APROD-11,API-APROD-12,API-APROD-13,API-APROD-14,API-APROD-15,API-APROD-16,API-APROD-20 |
| F-ADM-PRODUCT-ASSIGN | Assign product to employee | `product editor` | P1 | API-APROD-09 |
| F-ADM-PRODUCT-MEDIA | Product media manager | `.../media` | P0 | API-MED-05,API-MED-06,API-MED-08,API-MED-04,API-MED-09 |
| F-ADM-MEDIA | Media library | `/admin/media` | P0 | API-MED-09,API-MED-01,API-MED-07 |
| F-ADM-MEDIA-UPLOAD | Media upload | `/admin/media/upload` | P0 | API-MED-05,API-MED-08,API-MED-01 |
| F-ADM-MEDIA-REVIEW | Media review | `/admin/media/review` | P1 | API-MMED-02,API-MMED-03,API-MMED-04 |
| F-ADM-MARKETING-MEDIA | Marketing media | `/admin/media/marketing` | P1 | API-MMED-01,API-MMED-02 |
| F-ADM-MEDIA-MAPPING | Media product mapping | `/admin/media/product-mapping` | P1 | API-MED-09,API-MED-08,API-MED-04 |
| F-ADM-MEDIA-DETAIL | Media detail | `/admin/media/:id` | P1 | API-MED-03,API-MED-09 |
| F-ADM-CATEGORIES | Categories manager | `/admin/categories` | P0 | API-CAT-04,API-COL-12,API-COL-13 |
| F-ADM-CATEGORY-CREATE | Create category | `/admin/categories/new` | P1 | API-CAT-07 |
| F-ADM-CATEGORY-EDIT | Edit/activate/archive category | `.../edit` | P1 | API-CAT-05,API-CAT-08,API-CAT-09,API-CAT-10,API-CAT-11 |
| F-ADM-SUBCATEGORIES | Subcategories | `.../subcategories` | P1 | API-CAT-06,API-CAT-12,API-CAT-13,API-CAT-14,API-CAT-15,API-CAT-16 |
| F-ADM-COLLECTIONS | Collections manager | `/admin/collections` | P1 | API-COL-03,API-COL-12 |
| F-ADM-COLLECTION-CREATE | Create collection | `.../new` | P1 | API-COL-05 |
| F-ADM-COLLECTION-EDIT | Edit collection lifecycle | `.../edit` | P1 | API-COL-04,API-COL-06,API-COL-07,API-COL-08,API-COL-09,API-COL-10 |
| F-ADM-COLLECTION-PRODUCTS | Collection products | `.../products` | P1 | API-COL-11 |
| F-ADM-OFFERS | Offers list | `/admin/offers` | P1 | API-OFF-03 |
| F-ADM-OFFER-CREATE | Create offer | `.../new` | P1 | API-OFF-05 |
| F-ADM-OFFER-EDIT | Edit/activate/pause/archive offer | `.../edit` | P1 | API-OFF-04,API-OFF-06,API-OFF-07,API-OFF-08,API-OFF-09 |
| F-ADM-OFFER-DETAIL | Offer detail | `/admin/offers/:id` | P1 | API-OFF-04 |
| F-ADM-ORDERS | Orders list / status | `/admin/orders` | P0 | API-AORD-01,API-AORD-13,API-AORD-15,API-AORD-16 |
| F-ADM-ORDER-DETAIL | Order detail + notes | `/admin/orders/:id` | P0 | API-AORD-02,API-AORD-14 |
| F-ADM-INVOICE | Invoice metadata | `.../invoice` | P1 | API-AORD-03 |
| F-ADM-FULFILLMENT | Fulfillment pipeline | `order actions` | P1 | API-AORD-04,API-AORD-05,API-AORD-06,API-AORD-07,API-AORD-08,API-AORD-09,API-AORD-10,API-AORD-11,API-AORD-12 |
| F-ADM-CUSTOMERS | Customers list | `/admin/customers` | P1 | API-CUS-09 |
| F-ADM-CUSTOMER-DETAIL | Customer detail | `/admin/customers/:id` | P1 | API-CUS-10,API-AORD-01 |
| F-ADM-RETURNS | Returns desk | `/admin/returns` | P1 | API-RET-01,API-RET-03,API-RET-04,API-RET-05,API-RET-06,API-RET-07,API-RET-08,API-RET-09 |
| F-ADM-RETURN-DETAIL | Return detail | `/admin/returns/:id` | P1 | API-RET-02 |
| F-ADM-INVENTORY | Inventory dashboard | `/admin/inventory` | P1 | API-INV-01,API-INV-02,API-INV-06,API-AN-06 |
| F-ADM-INV-ADJUST | Inventory receive/adjust | `receive/adjust` | P1 | API-INV-03 |
| F-ADM-INV-TRANSFERS | Stock transfers | `/admin/inventory/transfers` | P1 | API-INV-09,API-INV-10,API-INV-11 |
| F-ADM-INV-MOVEMENTS | Stock movements | `movements` | P1 | API-INV-04 |
| F-ADM-INV-LOW | Low stock | `low-stock` | P1 | API-INV-05 |
| F-ADM-WAREHOUSES | Warehouses | `/admin/warehouses` | P1 | API-INV-07,API-INV-08 |
| F-ADM-ANALYTICS | Analytics hub | `/admin/analytics` | P1 | API-AN-01 |
| F-ADM-AN-SALES | Analytics sales | `/admin/analytics/sales` | P1 | API-AN-02 |
| F-ADM-AN-PRODUCTS | Analytics products | `/admin/analytics/products` | P1 | API-AN-03 |
| F-ADM-AN-CUSTOMERS | Analytics customers | `/admin/analytics/customers` | P1 | API-AN-04 |
| F-ADM-AN-INVENTORY | Analytics inventory | `/admin/analytics/inventory` | P1 | API-AN-06 |
| F-ADM-AN-RETURNS | Analytics returns | `/admin/analytics/returns` | P2 | API-RET-01,API-AN-05 |
| F-ADM-AN-OFFERS | Analytics offers | `/admin/analytics/offers` | P2 | API-OFF-03 |
| F-ADM-AI | Admin AI assistant | `/admin/ai-assistant` | P3 | API-AI-03 |
| F-ADM-SETTINGS | Admin settings + RBAC | `/admin/settings` | P1 | API-SET-01,API-SET-02,API-SET-03,API-SET-04,API-SET-05,API-RBAC-01,API-RBAC-02,API-RBAC-03,API-RBAC-04,API-RBAC-05 |

### Detail

#### F-ADM-LOGIN — Admin login/logout

- **Portal:** admin
- **Surface:** `/admin/login`
- **What it does:** adminId + password JWT.
- **Priority:** P0
- **APIs:** API-AUTH-10,API-AUTH-11,API-AUTH-12

#### F-ADM-DASHBOARD — Admin dashboard

- **Portal:** admin
- **Surface:** `/admin/dashboard`
- **What it does:** Analytics + empty/error states. No static rupees.
- **Priority:** P1
- **APIs:** API-AN-01,API-AN-05,API-AN-06,API-AORD-01

#### F-ADM-ACTIVITY — Admin activity / audit

- **Portal:** admin
- **Surface:** `/admin/activity`
- **What it does:** Audit logs.
- **Priority:** P1
- **APIs:** API-AUD-01

#### F-ADM-PROFILE — Admin profile

- **Portal:** admin
- **Surface:** `/admin/profile`
- **What it does:** Session profile.
- **Priority:** P1
- **APIs:** API-AUTH-12

#### F-ADM-EMPLOYEES — Employees directory

- **Portal:** admin
- **Surface:** `/admin/employees`
- **What it does:** List/delete.
- **Priority:** P1
- **APIs:** API-EMP-01,API-EMP-08,API-EMP-09,API-EMP-13

#### F-ADM-EMPLOYEE-CREATE — Create employee

- **Portal:** admin
- **Surface:** `/admin/employees/new`
- **What it does:** Create employee.
- **Priority:** P1
- **APIs:** API-EMP-03

#### F-ADM-EMPLOYEE-DETAIL — Employee detail + attendance

- **Portal:** admin
- **Surface:** `/admin/employees/:id`
- **What it does:** Dossier, attendance mark, leave decide.
- **Priority:** P1
- **APIs:** API-EMP-02,API-ATT-01,API-ATT-02,API-ATT-03,API-LEV-03,API-LEV-04,API-PERF-02

#### F-ADM-EMPLOYEE-EDIT — Edit employee

- **Portal:** admin
- **Surface:** `.../edit`
- **What it does:** Patch, status, password, permissions.
- **Priority:** P1
- **APIs:** API-EMP-04,API-EMP-05,API-EMP-06,API-EMP-07

#### F-ADM-PRODUCTS — Admin products list

- **Portal:** admin
- **Surface:** `/admin/products`
- **What it does:** List + metrics + bulk.
- **Priority:** P0
- **APIs:** API-APROD-01,API-APROD-06,API-APROD-19

#### F-ADM-PRODUCT-CREATE — Create product draft

- **Portal:** admin
- **Surface:** `/admin/products/new`
- **What it does:** Canonical next-id + draft.
- **Priority:** P0
- **APIs:** API-APROD-03,API-APROD-02,API-APROD-04,API-APROD-05

#### F-ADM-PRODUCT-EDIT — Edit product

- **Portal:** admin
- **Surface:** `.../edit`
- **What it does:** Patch, duplicate, change-id.
- **Priority:** P0
- **APIs:** API-APROD-07,API-APROD-08,API-APROD-17,API-APROD-18

#### F-ADM-PRODUCT-DETAIL — Product detail (admin)

- **Portal:** admin
- **Surface:** `/admin/products/:id`
- **What it does:** Read full record.
- **Priority:** P0
- **APIs:** API-APROD-07,API-APROD-16

#### F-ADM-PRODUCT-WORKFLOW — Product workflow

- **Portal:** admin
- **Surface:** `review + commands`
- **What it does:** submit/approve/reject/publish/unpublish/archive/restore. APPROVE≠PUBLISH.
- **Priority:** P0
- **APIs:** API-PROD-07,API-APROD-10,API-APROD-11,API-APROD-12,API-APROD-13,API-APROD-14,API-APROD-15,API-APROD-16,API-APROD-20

#### F-ADM-PRODUCT-ASSIGN — Assign product to employee

- **Portal:** admin
- **Surface:** `product editor`
- **What it does:** assignedEmployeeId.
- **Priority:** P1
- **APIs:** API-APROD-09

#### F-ADM-PRODUCT-MEDIA — Product media manager

- **Portal:** admin
- **Surface:** `.../media`
- **What it does:** Upload/register/media-set.
- **Priority:** P0
- **APIs:** API-MED-05,API-MED-06,API-MED-08,API-MED-04,API-MED-09

#### F-ADM-MEDIA — Media library

- **Portal:** admin
- **Surface:** `/admin/media`
- **What it does:** Registered assets.
- **Priority:** P0
- **APIs:** API-MED-09,API-MED-01,API-MED-07

#### F-ADM-MEDIA-UPLOAD — Media upload

- **Portal:** admin
- **Surface:** `/admin/media/upload`
- **What it does:** Object + register.
- **Priority:** P0
- **APIs:** API-MED-05,API-MED-08,API-MED-01

#### F-ADM-MEDIA-REVIEW — Media review

- **Portal:** admin
- **Surface:** `/admin/media/review`
- **What it does:** BACKEND_GAP.
- **Priority:** P1
- **APIs:** API-MMED-02,API-MMED-03,API-MMED-04

#### F-ADM-MARKETING-MEDIA — Marketing media

- **Portal:** admin
- **Surface:** `/admin/media/marketing`
- **What it does:** Hero/collection assignment. Not product media.
- **Priority:** P1
- **APIs:** API-MMED-01,API-MMED-02

#### F-ADM-MEDIA-MAPPING — Media product mapping

- **Portal:** admin
- **Surface:** `/admin/media/product-mapping`
- **What it does:** Assign registered media to products.
- **Priority:** P1
- **APIs:** API-MED-09,API-MED-08,API-MED-04

#### F-ADM-MEDIA-DETAIL — Media detail

- **Portal:** admin
- **Surface:** `/admin/media/:id`
- **What it does:** Object meta.
- **Priority:** P1
- **APIs:** API-MED-03,API-MED-09

#### F-ADM-CATEGORIES — Categories manager

- **Portal:** admin
- **Surface:** `/admin/categories`
- **What it does:** List + taxonomy metrics.
- **Priority:** P0
- **APIs:** API-CAT-04,API-COL-12,API-COL-13

#### F-ADM-CATEGORY-CREATE — Create category

- **Portal:** admin
- **Surface:** `/admin/categories/new`
- **What it does:** Create.
- **Priority:** P1
- **APIs:** API-CAT-07

#### F-ADM-CATEGORY-EDIT — Edit/activate/archive category

- **Portal:** admin
- **Surface:** `.../edit`
- **What it does:** Lifecycle.
- **Priority:** P1
- **APIs:** API-CAT-05,API-CAT-08,API-CAT-09,API-CAT-10,API-CAT-11

#### F-ADM-SUBCATEGORIES — Subcategories

- **Portal:** admin
- **Surface:** `.../subcategories`
- **What it does:** CRUD subcats.
- **Priority:** P1
- **APIs:** API-CAT-06,API-CAT-12,API-CAT-13,API-CAT-14,API-CAT-15,API-CAT-16

#### F-ADM-COLLECTIONS — Collections manager

- **Portal:** admin
- **Surface:** `/admin/collections`
- **What it does:** List.
- **Priority:** P1
- **APIs:** API-COL-03,API-COL-12

#### F-ADM-COLLECTION-CREATE — Create collection

- **Portal:** admin
- **Surface:** `.../new`
- **What it does:** Create.
- **Priority:** P1
- **APIs:** API-COL-05

#### F-ADM-COLLECTION-EDIT — Edit collection lifecycle

- **Portal:** admin
- **Surface:** `.../edit`
- **What it does:** Patch + activate/pause/archive/restore.
- **Priority:** P1
- **APIs:** API-COL-04,API-COL-06,API-COL-07,API-COL-08,API-COL-09,API-COL-10

#### F-ADM-COLLECTION-PRODUCTS — Collection products

- **Portal:** admin
- **Surface:** `.../products`
- **What it does:** PUT membership.
- **Priority:** P1
- **APIs:** API-COL-11

#### F-ADM-OFFERS — Offers list

- **Portal:** admin
- **Surface:** `/admin/offers`
- **What it does:** Coupons.
- **Priority:** P1
- **APIs:** API-OFF-03

#### F-ADM-OFFER-CREATE — Create offer

- **Portal:** admin
- **Surface:** `.../new`
- **What it does:** Create coupon.
- **Priority:** P1
- **APIs:** API-OFF-05

#### F-ADM-OFFER-EDIT — Edit/activate/pause/archive offer

- **Portal:** admin
- **Surface:** `.../edit`
- **What it does:** Lifecycle.
- **Priority:** P1
- **APIs:** API-OFF-04,API-OFF-06,API-OFF-07,API-OFF-08,API-OFF-09

#### F-ADM-OFFER-DETAIL — Offer detail

- **Portal:** admin
- **Surface:** `/admin/offers/:id`
- **What it does:** Read.
- **Priority:** P1
- **APIs:** API-OFF-04

#### F-ADM-ORDERS — Orders list / status

- **Portal:** admin
- **Surface:** `/admin/orders`
- **What it does:** Inbox + cancel/status.
- **Priority:** P0
- **APIs:** API-AORD-01,API-AORD-13,API-AORD-15,API-AORD-16

#### F-ADM-ORDER-DETAIL — Order detail + notes

- **Portal:** admin
- **Surface:** `/admin/orders/:id`
- **What it does:** Detail.
- **Priority:** P0
- **APIs:** API-AORD-02,API-AORD-14

#### F-ADM-INVOICE — Invoice metadata

- **Portal:** admin
- **Surface:** `.../invoice`
- **What it does:** No fake PDF.
- **Priority:** P1
- **APIs:** API-AORD-03

#### F-ADM-FULFILLMENT — Fulfillment pipeline

- **Portal:** admin
- **Surface:** `order actions`
- **What it does:** allocate→pick→pack→ready→dispatch→ofd→deliver.
- **Priority:** P1
- **APIs:** API-AORD-04,API-AORD-05,API-AORD-06,API-AORD-07,API-AORD-08,API-AORD-09,API-AORD-10,API-AORD-11,API-AORD-12

#### F-ADM-CUSTOMERS — Customers list

- **Portal:** admin
- **Surface:** `/admin/customers`
- **What it does:** CRM.
- **Priority:** P1
- **APIs:** API-CUS-09

#### F-ADM-CUSTOMER-DETAIL — Customer detail

- **Portal:** admin
- **Surface:** `/admin/customers/:id`
- **What it does:** Dossier.
- **Priority:** P1
- **APIs:** API-CUS-10,API-AORD-01

#### F-ADM-RETURNS — Returns desk

- **Portal:** admin
- **Surface:** `/admin/returns`
- **What it does:** Approve through refund.
- **Priority:** P1
- **APIs:** API-RET-01,API-RET-03,API-RET-04,API-RET-05,API-RET-06,API-RET-07,API-RET-08,API-RET-09

#### F-ADM-RETURN-DETAIL — Return detail

- **Portal:** admin
- **Surface:** `/admin/returns/:id`
- **What it does:** One return.
- **Priority:** P1
- **APIs:** API-RET-02

#### F-ADM-INVENTORY — Inventory dashboard

- **Portal:** admin
- **Surface:** `/admin/inventory`
- **What it does:** Stub client B-01.
- **Priority:** P1
- **APIs:** API-INV-01,API-INV-02,API-INV-06,API-AN-06

#### F-ADM-INV-ADJUST — Inventory receive/adjust

- **Portal:** admin
- **Surface:** `receive/adjust`
- **What it does:** Stub.
- **Priority:** P1
- **APIs:** API-INV-03

#### F-ADM-INV-TRANSFERS — Stock transfers

- **Portal:** admin
- **Surface:** `/admin/inventory/transfers`
- **What it does:** Stub.
- **Priority:** P1
- **APIs:** API-INV-09,API-INV-10,API-INV-11

#### F-ADM-INV-MOVEMENTS — Stock movements

- **Portal:** admin
- **Surface:** `movements`
- **What it does:** Stub.
- **Priority:** P1
- **APIs:** API-INV-04

#### F-ADM-INV-LOW — Low stock

- **Portal:** admin
- **Surface:** `low-stock`
- **What it does:** Stub.
- **Priority:** P1
- **APIs:** API-INV-05

#### F-ADM-WAREHOUSES — Warehouses

- **Portal:** admin
- **Surface:** `/admin/warehouses`
- **What it does:** Stub.
- **Priority:** P1
- **APIs:** API-INV-07,API-INV-08

#### F-ADM-ANALYTICS — Analytics hub

- **Portal:** admin
- **Surface:** `/admin/analytics`
- **What it does:** Overview.
- **Priority:** P1
- **APIs:** API-AN-01

#### F-ADM-AN-SALES — Analytics sales

- **Portal:** admin
- **Surface:** `/admin/analytics/sales`
- **What it does:** Sales.
- **Priority:** P1
- **APIs:** API-AN-02

#### F-ADM-AN-PRODUCTS — Analytics products

- **Portal:** admin
- **Surface:** `/admin/analytics/products`
- **What it does:** Products.
- **Priority:** P1
- **APIs:** API-AN-03

#### F-ADM-AN-CUSTOMERS — Analytics customers

- **Portal:** admin
- **Surface:** `/admin/analytics/customers`
- **What it does:** Customers.
- **Priority:** P1
- **APIs:** API-AN-04

#### F-ADM-AN-INVENTORY — Analytics inventory

- **Portal:** admin
- **Surface:** `/admin/analytics/inventory`
- **What it does:** Summary tile domain.
- **Priority:** P1
- **APIs:** API-AN-06

#### F-ADM-AN-RETURNS — Analytics returns

- **Portal:** admin
- **Surface:** `/admin/analytics/returns`
- **What it does:** Uses returns list/analytics orders — no extra invented resource.
- **Priority:** P2
- **APIs:** API-RET-01,API-AN-05

#### F-ADM-AN-OFFERS — Analytics offers

- **Portal:** admin
- **Surface:** `/admin/analytics/offers`
- **What it does:** Offer aggregates from admin offers counts.
- **Priority:** P2
- **APIs:** API-OFF-03

#### F-ADM-AI — Admin AI assistant

- **Portal:** admin
- **Surface:** `/admin/ai-assistant`
- **What it does:** Preview.
- **Priority:** P3
- **APIs:** API-AI-03

#### F-ADM-SETTINGS — Admin settings + RBAC

- **Portal:** admin
- **Surface:** `/admin/settings`
- **What it does:** Sections + roles/permissions.
- **Priority:** P1
- **APIs:** API-SET-01,API-SET-02,API-SET-03,API-SET-04,API-SET-05,API-RBAC-01,API-RBAC-02,API-RBAC-03,API-RBAC-04,API-RBAC-05

## Employee portal

| ID | Feature | Surface | P | APIs |
|---|---|---|---|---|
| F-EMP-LOGIN | Employee login/logout | `/employee/login` | P0 | API-AUTH-07,API-AUTH-09,API-AUTH-14 |
| F-EMP-CHANGE-PW | Employee change/forgot password | `change/forgot` | P0 | API-AUTH-08,API-AUTH-15 |
| F-EMP-DASHBOARD | Employee dashboard | `/employee` | P1 | API-EPROD-03,API-ATT-06,API-AN-06 |
| F-EMP-PROFILE | Employee profile | `/employee/profile` | P1 | API-AUTH-14 |
| F-EMP-ATTENDANCE | Attendance punch + history | `/employee/attendance` | P1 | API-ATT-04,API-ATT-05,API-ATT-06,API-ATT-07,API-ATT-01 |
| F-EMP-LEAVE | Leave | `/employee/attendance/leave` | P2 | API-LEV-01,API-LEV-02,API-LEV-03 |
| F-EMP-PERFORMANCE | Performance | `/employee/performance` | P2 | API-PERF-01,API-PERF-02 |
| F-EMP-PRODUCTS | Employee products inbox | `/employee/products` | P0 | API-EPROD-03,API-EPROD-01 |
| F-EMP-PRODUCT-CREATE | Employee new product | `/employee/products/new` | P1 | API-APROD-04,API-EPROD-02 |
| F-EMP-PRODUCT-EDIT | Employee edit/submit product | `.../edit + review` | P0 | API-EPROD-01,API-EPROD-02,API-PROD-07 |
| F-EMP-MEDIA | Employee media library | `/employee/media` | P1 | API-MED-04,API-MED-09 |
| F-EMP-MEDIA-UPLOAD | Employee media upload | `/employee/media/upload` | P1 | API-MED-06,API-MED-08 |
| F-EMP-CUSTOMERS | Employee customers | `/employee/customers` | P2 | API-CUS-09 |
| F-EMP-ORDERS | Employee orders | `/employee/orders` | P1 | API-AORD-01,API-AORD-02 |
| F-EMP-OFFERS | Employee offers | `/employee/offers` | P2 | API-OFF-03,API-OFF-04 |
| F-EMP-INVENTORY | Employee inventory | `/employee/inventory` | P1 | API-INV-01,API-INV-05 |
| F-EMP-INV-ADJUST | Employee receive/adjust | `receive/adjust` | P1 | API-INV-03 |
| F-EMP-INV-MOVEMENTS | Employee movements | `movements` | P1 | API-INV-04 |
| F-EMP-INV-TRANSFERS | Employee transfers | `transfers` | P1 | API-INV-09,API-INV-10,API-INV-11 |
| F-EMP-INV-LOW | Employee low/out of stock | `low/out` | P1 | API-INV-05 |
| F-EMP-WAREHOUSE | Warehouse desks | `/employee/warehouse/*` | P1 | API-INV-07,API-AORD-05,API-AORD-06,API-AORD-07,API-RET-06 |
| F-EMP-RETURNS | Employee returns | `/employee/returns` | P1 | API-RET-01,API-RET-02 |
| F-EMP-SUPPORT | Support desk | `/employee/support/*` | P2 | API-SUP-01,API-SUP-02,API-SUP-03 |
| F-EMP-STYLING | Styling desks | `/employee/styling/*` | P2 | API-STY-01,API-STY-02 |
| F-EMP-SALES | Floor sales desk | `/employee/sales` | P2 | API-SALE-01,API-AN-02 |
| F-EMP-TEAM | Team | `/employee/team` | P2 | API-EMP-01 |
| F-EMP-REPORTS-SALES | Employee sales report | `/employee/reports/sales` | P2 | API-AN-02,API-SALE-01 |
| F-EMP-REPORTS-PRODUCTS | Employee products report | `reports/products` | P2 | API-AN-03 |
| F-EMP-REPORTS-CUSTOMERS | Employee customers report | `reports/customers` | P2 | API-AN-04 |
| F-EMP-REPORTS-INVENTORY | Employee inventory report | `reports/inventory` | P2 | API-AN-06,API-INV-01 |
| F-EMP-REPORTS-RETURNS | Employee returns report | `reports/returns` | P2 | API-RET-01 |
| F-EMP-REPORTS-OFFERS | Employee offers report | `reports/offers` | P2 | API-OFF-03 |
| F-EMP-REPORTS-EMPLOYEES | Employee team report | `reports/employees` | P2 | API-ATT-01,API-PERF-02 |

### Detail

#### F-EMP-LOGIN — Employee login/logout

- **Portal:** employee
- **Surface:** `/employee/login`
- **What it does:** employeeId JWT. Demo fill() removed.
- **Priority:** P0
- **APIs:** API-AUTH-07,API-AUTH-09,API-AUTH-14

#### F-EMP-CHANGE-PW — Employee change/forgot password

- **Portal:** employee
- **Surface:** `change/forgot`
- **What it does:** Force change is live; forgot-password page has no client yet.
- **Priority:** P0
- **APIs:** API-AUTH-08,API-AUTH-15

#### F-EMP-DASHBOARD — Employee dashboard

- **Portal:** employee
- **Surface:** `/employee`
- **What it does:** KPIs now zeros/live empty counts.
- **Priority:** P1
- **APIs:** API-EPROD-03,API-ATT-06,API-AN-06

#### F-EMP-PROFILE — Employee profile

- **Portal:** employee
- **Surface:** `/employee/profile`
- **What it does:** Me.
- **Priority:** P1
- **APIs:** API-AUTH-14

#### F-EMP-ATTENDANCE — Attendance punch + history

- **Portal:** employee
- **Surface:** `/employee/attendance`
- **What it does:** Self punch missing (B-03).
- **Priority:** P1
- **APIs:** API-ATT-04,API-ATT-05,API-ATT-06,API-ATT-07,API-ATT-01

#### F-EMP-LEAVE — Leave

- **Portal:** employee
- **Surface:** `/employee/attendance/leave`
- **What it does:** No client.
- **Priority:** P2
- **APIs:** API-LEV-01,API-LEV-02,API-LEV-03

#### F-EMP-PERFORMANCE — Performance

- **Portal:** employee
- **Surface:** `/employee/performance`
- **What it does:** No client.
- **Priority:** P2
- **APIs:** API-PERF-01,API-PERF-02

#### F-EMP-PRODUCTS — Employee products inbox

- **Portal:** employee
- **Surface:** `/employee/products`
- **What it does:** Assigned.
- **Priority:** P0
- **APIs:** API-EPROD-03,API-EPROD-01

#### F-EMP-PRODUCT-CREATE — Employee new product

- **Portal:** employee
- **Surface:** `/employee/products/new`
- **What it does:** Uses next-id via admin path if permitted — employee create is draft-only through existing product APIs.
- **Priority:** P1
- **APIs:** API-APROD-04,API-EPROD-02

#### F-EMP-PRODUCT-EDIT — Employee edit/submit product

- **Portal:** employee
- **Surface:** `.../edit + review`
- **What it does:** Editable fields + submit-review.
- **Priority:** P0
- **APIs:** API-EPROD-01,API-EPROD-02,API-PROD-07

#### F-EMP-MEDIA — Employee media library

- **Portal:** employee
- **Surface:** `/employee/media`
- **What it does:** Product media, not marketing.
- **Priority:** P1
- **APIs:** API-MED-04,API-MED-09

#### F-EMP-MEDIA-UPLOAD — Employee media upload

- **Portal:** employee
- **Surface:** `/employee/media/upload`
- **What it does:** Product-scoped upload.
- **Priority:** P1
- **APIs:** API-MED-06,API-MED-08

#### F-EMP-CUSTOMERS — Employee customers

- **Portal:** employee
- **Surface:** `/employee/customers`
- **What it does:** Directory read.
- **Priority:** P2
- **APIs:** API-CUS-09

#### F-EMP-ORDERS — Employee orders

- **Portal:** employee
- **Surface:** `/employee/orders`
- **What it does:** Limited order list (admin list used today — intern must not invent a second schema; employee token may need scope).
- **Priority:** P1
- **APIs:** API-AORD-01,API-AORD-02

#### F-EMP-OFFERS — Employee offers

- **Portal:** employee
- **Surface:** `/employee/offers`
- **What it does:** Same coupon register.
- **Priority:** P2
- **APIs:** API-OFF-03,API-OFF-04

#### F-EMP-INVENTORY — Employee inventory

- **Portal:** employee
- **Surface:** `/employee/inventory`
- **What it does:** Stub B-01.
- **Priority:** P1
- **APIs:** API-INV-01,API-INV-05

#### F-EMP-INV-ADJUST — Employee receive/adjust

- **Portal:** employee
- **Surface:** `receive/adjust`
- **What it does:** Stub.
- **Priority:** P1
- **APIs:** API-INV-03

#### F-EMP-INV-MOVEMENTS — Employee movements

- **Portal:** employee
- **Surface:** `movements`
- **What it does:** Stub.
- **Priority:** P1
- **APIs:** API-INV-04

#### F-EMP-INV-TRANSFERS — Employee transfers

- **Portal:** employee
- **Surface:** `transfers`
- **What it does:** Stub.
- **Priority:** P1
- **APIs:** API-INV-09,API-INV-10,API-INV-11

#### F-EMP-INV-LOW — Employee low/out of stock

- **Portal:** employee
- **Surface:** `low/out`
- **What it does:** Stub.
- **Priority:** P1
- **APIs:** API-INV-05

#### F-EMP-WAREHOUSE — Warehouse desks

- **Portal:** employee
- **Surface:** `/employee/warehouse/*`
- **What it does:** Pick-pack uses fulfillment + inventory stubs.
- **Priority:** P1
- **APIs:** API-INV-07,API-AORD-05,API-AORD-06,API-AORD-07,API-RET-06

#### F-EMP-RETURNS — Employee returns

- **Portal:** employee
- **Surface:** `/employee/returns`
- **What it does:** Same returns register.
- **Priority:** P1
- **APIs:** API-RET-01,API-RET-02

#### F-EMP-SUPPORT — Support desk

- **Portal:** employee
- **Surface:** `/employee/support/*`
- **What it does:** Empty honest UI.
- **Priority:** P2
- **APIs:** API-SUP-01,API-SUP-02,API-SUP-03

#### F-EMP-STYLING — Styling desks

- **Portal:** employee
- **Surface:** `/employee/styling/*`
- **What it does:** Dummy rows emptied.
- **Priority:** P2
- **APIs:** API-STY-01,API-STY-02

#### F-EMP-SALES — Floor sales desk

- **Portal:** employee
- **Surface:** `/employee/sales`
- **What it does:** Must read orders.
- **Priority:** P2
- **APIs:** API-SALE-01,API-AN-02

#### F-EMP-TEAM — Team

- **Portal:** employee
- **Surface:** `/employee/team`
- **What it does:** Directory.
- **Priority:** P2
- **APIs:** API-EMP-01

#### F-EMP-REPORTS-SALES — Employee sales report

- **Portal:** employee
- **Surface:** `/employee/reports/sales`
- **What it does:** Reuse analytics, employee scope.
- **Priority:** P2
- **APIs:** API-AN-02,API-SALE-01

#### F-EMP-REPORTS-PRODUCTS — Employee products report

- **Portal:** employee
- **Surface:** `reports/products`
- **What it does:** Reuse analytics.
- **Priority:** P2
- **APIs:** API-AN-03

#### F-EMP-REPORTS-CUSTOMERS — Employee customers report

- **Portal:** employee
- **Surface:** `reports/customers`
- **What it does:** Reuse analytics.
- **Priority:** P2
- **APIs:** API-AN-04

#### F-EMP-REPORTS-INVENTORY — Employee inventory report

- **Portal:** employee
- **Surface:** `reports/inventory`
- **What it does:** Ledger + summary.
- **Priority:** P2
- **APIs:** API-AN-06,API-INV-01

#### F-EMP-REPORTS-RETURNS — Employee returns report

- **Portal:** employee
- **Surface:** `reports/returns`
- **What it does:** Returns register.
- **Priority:** P2
- **APIs:** API-RET-01

#### F-EMP-REPORTS-OFFERS — Employee offers report

- **Portal:** employee
- **Surface:** `reports/offers`
- **What it does:** Offer counts.
- **Priority:** P2
- **APIs:** API-OFF-03

#### F-EMP-REPORTS-EMPLOYEES — Employee team report

- **Portal:** employee
- **Surface:** `reports/employees`
- **What it does:** Attendance/performance.
- **Priority:** P2
- **APIs:** API-ATT-01,API-PERF-02

