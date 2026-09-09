# Backend blockers

**Audience:** backend intern + reviewer.  
**Rule:** these are gaps the **frontend already has UI or a typed client for**. Nothing here is a new product idea.

Status key:

- **BLOCKING P0** — storefront / checkout / auth / catalogue cannot be production-true until this is right.
- **BLOCKING P1** — admin/employee merchandising, orders, media register, analytics.
- **SCHEMA / WIRING** — backend router may already mount a module; the **frontend client cannot use it** because the contract or columns are wrong.
- **PHASE GAP** — UI exists; client is an honest stub (`unavailable()`, `BACKEND_GAP`, early `return fail`).

---

## B-01 — Inventory schema vs frontend client (SCHEMA / WIRING, P1)

**Frontend:** `frontend/src/services/api/inventoryApi.js` — every call returns `{ ok: false }` because “existing server schema does NOT yet carry business columns on the `inventory_*` tables”.

**Backend:** `backend/app/api/v1/router.py` already includes the inventory router. This is **not** a missing domain.

**Why it blocks:** Admin Inventory, warehouses, transfers, low-stock, and employee inventory desks cannot show real stock. Admin dashboard `GET /analytics/inventory-summary` is a separate read and must not be treated as the stock ledger.

**Frontend already expects (do not rename for fashion):**

| Client | Needed behaviour |
|---|---|
| `apiListStock` | Variant-level on-hand / reserved / available |
| `apiGetStockItem` | One SKU/variant |
| `apiAdjustStock` | Signed adjustment + reason |
| `apiListMovements` | Movement history |
| `apiListLowStock` | Below threshold |
| `apiListReservations` | Cart/order reservations |
| `apiListWarehouses` / `apiCreateWarehouse` | Locations |
| `apiListTransfers` / `apiCreateTransfer` / `apiCompleteTransfer` | Warehouse-to-warehouse |

**Do not:** seed stock in the browser. Cart/order paths already validate stock **server-side** — keep that as the customer-facing authority until the ledger matches.

**HUMAN DECISION:** exact table columns. Stop rather than invent a second stock number on `products.stock` that disagrees with inventory.

---

## B-02 — Marketing media + media review API (PHASE GAP, P1)

**Frontend:** `apiListMarketingMedia`, `apiListMediaReviews`, `apiApproveMedia`, `apiRejectMedia` return `code: "BACKEND_GAP"`. Comment: `media_marketing_media` / `media_media_review` have no API.

**Why it blocks:** Admin Marketing Media and Admin Media Review cannot assign hero/collection/editorial plates. Product-media upload/register **is live** and must stay a **different** pipeline.

**Rule the API must enforce:** registering product media never promotes it to a marketing slot.

---

## B-03 — Employee self check-in / check-out (PHASE GAP, P1)

**Frontend:** `attendanceService.checkIn` / `checkOut` return immediately:

> “Check-in is managed by the backend attendance service, which is not available in this phase. No local record was created.”

Dead local-punch code after those `return`s is unreachable.

**Backend:** attendance router is mounted; `employeesApi` already calls:

- `GET /admin/attendance`
- `POST /admin/attendance`
- `GET /admin/attendance/summary`

**Missing for the employee desk:** employee-scoped punch + today + history (`POST /employee/attendance/check-in`, `POST /employee/attendance/check-out`, `GET /employee/attendance/today`, `GET /employee/attendance`).

**Do not:** write punches to `localStorage` or the deleted `seedWorkforce` dataset.

---

## B-04 — Employee leave + performance self-service (PHASE GAP, P2)

Admin clients exist (`GET/POST /admin/leave`, `POST /admin/leave/{id}/decision`, `GET /admin/performance`). Employee leave apply and performance views still read in-memory repositories (`leaveRepository`, `performanceRepository`) that no longer have a seed.

**Need:** employee-scoped leave list/apply and performance read that share the **same** records as admin.

---

## B-05 — Catalogue hydrate `total` (BLOCKING P0 if `total` is missing or a later page fails silently)

**Frontend:** `catalogStore.fetchAllPublishedProducts` walks `GET /products` at `pageSize: 100` until `items.length >= total` or a short last page. Shop listings paginate separately (`useCatalogueQuery` page size 12).

First-page or later-page failure → hydrate `ok: false` (later-page also `partial: true`). The UI must error; it must not treat a truncated snapshot as the full published set.

**Need:** `GET /products` **must** return an honest `total` for the published filter. `productsApi.normaliseProductList` no longer falls back to `items.length` when `total` is omitted (`undefined` instead). A full page without `total` fails hydrate rather than pretending the first page is the catalogue. Do not omit `total`. Do not invent a second hydrate endpoint.

**HUMAN DECISION:** max published catalogue size vs browse pagination. Do not raise `pageSize` as a fake “load everything” without a backend cap. Safety cap on the frontend is 50 pages (not a catalogue size claim).

---

## B-06 — Explore offers wiring (WIRING, P1)

`searchApi` already has `GET /explore` and `GET /explore/offers`. `Explore.jsx` still uses `getExploreOffers()`. Storefront offers must come from the offers register, not a second hardcoded list.

---

## B-07 — Support / styling / floor-sales desks (PHASE GAP, P2)

Employee routes exist (`/employee/support/*`, `/employee/styling/*`, `/employee/sales`). After cleanup they render **empty** tables. There is no live client.

**Need (only because the UI exists):**

- Support cases list/create/update
- Styling appointments + requests
- Departmental floor sales **derived from orders**, not a parallel sales DB

**Do not** invent named customers to fill the desks.

---

## B-08 — AI assistants still local (PHASE GAP, P3)

Customer AI Shopping, AI Mirror, Admin Insights/AI, employee “later AI” notes. Frontend uses brand-voice / local helpers. Backend chatbot router is mounted but **not consumed**.

Production AI is P3. Until then the UI must say it is preview, never pretend a model answered from live orders.

---

## B-09 — Activity diary split (WIRING, P2)

`activityService` is a shared in-session diary. Admin product history has API (`GET /admin/products/{id}/history`, `/activity`). House-wide activity (`GET /admin/activity`, `GET /employee/activity`) must not fork a second log.

---

## B-10 — Notifications inbox (DO NOT INVENT)

Admin header copy: notifications are **not available in this phase**. Customer/admin **settings** already persist notification *preferences* via `/admin/settings` and customer preferences.

**Do not** build a notification inbox API unless a screen consumes it. Backend `notifications` router being mounted is not a frontend requirement by itself.

---

## B-11 — Customer product-review writes (DO NOT INVENT)

Storefront displays `rating` / `reviewCount` on the product record. There is **no** write-review form.

`GET /products/{id}/reviews` exists on the client as a read. Do not add `POST /reviews` until a customer UI exists.

---

## B-12 — Secrets / auth hygiene (SECURITY, P0)

- Frontend talks JWT via `authApi` (`access` + `refresh`). No hardcoded passwords were found in login screens.
- Docs must never copy `.env` secret values. If a secret is seen: `SECRET FOUND — VALUE REDACTED`.
- Employee/admin/customer tokens are **scoped**. Do not accept an employee JWT on `/admin/*`.
- `EmployeeLogin` leftover `fill()` was removed; it never shipped passwords.

---

## B-13 — Duplicate systems (ARCHITECTURE — already forbidden)

The frontend already encodes these. Backend must not reopen them:

| Rule | Meaning |
|---|---|
| One product register | No admin-catalogue vs storefront-catalogue |
| One media register | Product media ≠ marketing media |
| One auth | JWT; no demo users |
| One workflow | Commands in `productWorkflow`; APPROVE ≠ PUBLISH |
| Kids | Category/department + ID prefix `PF-K-*`, not a side catalogue |
| IDs | Never regenerate `PF-*` from filenames or clocks |

---

## Priority rollup

| ID | Title | Priority | Kind |
|---|---|---|---|
| B-05 | Hydrate walk + honest `total` | P0 | Contract |
| B-12 | Auth scopes / no secrets in docs | P0 | Security |
| B-01 | Inventory schema | P1 | Schema/wiring |
| B-02 | Marketing media API | P1 | Phase gap |
| B-03 | Employee punch | P1 | Phase gap |
| B-06 | Explore offers wiring | P1 | Wiring |
| B-04 | Leave/performance employee | P2 | Phase gap |
| B-07 | Support/styling desks | P2 | Phase gap |
| B-09 | Activity diary | P2 | Wiring |
| B-08 | AI | P3 | Phase gap |
| B-10 | Notifications inbox | — | Do not invent |
| B-11 | Review writes | — | Do not invent |
