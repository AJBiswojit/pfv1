# Backend integration handoff

**For:** backend intern  
**From:** frontend production-readiness pass (2026-09-09)  
**Your job:** make the existing frontend talk to real APIs. **Do not** redesign the UI. **Do not** invent features or extra resources the screens do not call.

Companion files:

- `docs/frontend-backend-api-requirements.md` — every API, full contract
- `docs/frontend-feature-inventory.md` — every user-facing feature
- `docs/feature-api-matrix.md` — feature ↔ API
- `docs/frontend-api-traceability.csv` — machine-readable map
- `docs/backend-blockers.md` — stop-the-line gaps
- `docs/frontend-data-migration-matrix.md` — ID / media / dummy migration
- `docs/dummy-data-cleanup-report.md` — what was deleted vs emptied
- `docs/golden-data-before-after.md` — 128 Product IDs, media, taxonomy (unchanged)

---

## 1. How the frontend is wired today

Base URL: `/api/v1` via `frontend/src/services/api/apiClient.js`.

Scopes:

| Scope | Token | Used for |
|---|---|---|
| `none` | none | public catalogue, search, home, media resolve |
| `customer` | customer JWT | cart, checkout, account, wishlist, returns |
| `admin` | admin JWT | merchandising, orders, employees, settings, analytics, media upload |
| `employee` | employee JWT | assigned products, limited orders, employee me |

**Never** accept a token from the wrong portal.

Mounted on the backend already (`backend/app/api/v1/router.py`): inventory, attendance, performance, chatbot, notifications, media_reviews. **Mounted ≠ usable.** Inventory and marketing-media frontend clients still fail closed. Do not add a second router for the same domain.

---

## 2. Non-negotiable domain rules

1. **One product register.** Storefront, admin, employee read the same products. Status + `published` decide visibility.
2. **APPROVE ≠ PUBLISH.** `POST .../approve` must not set `PUBLISHED`. Publish is a separate authorized command after `APPROVED`, with a full validation (`getPublishIssues` equivalent).
3. **Product IDs are canonical** `PF-{DEPT}-{FAMILY}-{NNNN}` (kids `PF-K-*`). Do not mint IDs from filenames, clocks, or array indexes. Existing 128 IDs in `docs/golden-data-before-after.md` must remain valid.
4. **Product media ≠ marketing media.** Upload/register/assign product plates via `/media/*`. Hero/collection/editorial is a distinct assignment. Never auto-promote.
5. **Kids is a department**, not a side catalogue and not “just a validator”.
6. **Inventory is not `products.stock`.** Customer cart may check availability server-side; the admin ledger is the inventory module (schema work is B-01).
7. **No dummy people, rupees, or punches** in API responses. Empty list is correct.
8. **Do not implement a notifications inbox or review-write API** unless a screen appears that calls it. They are explicitly out.

---

## 3. What already has a frontend client (implement / verify)

These modules in `frontend/src/services/api/` already encode method + path + payload:

| Module | Domains |
|---|---|
| `authApi.js` | register, login, refresh, logout, me, password, sessions, verify |
| `productsApi.js` | public products + full admin/employee workflow |
| `categoriesApi.js` | public + admin categories/taxonomy |
| `collectionsApi.js` | public + admin collections |
| `cartApi.js` / `ordersApi.js` / `paymentsApi.js` | cart, checkout, orders, payments, returns |
| `customersApi.js` | me, addresses, wishlist, preferences, admin customers |
| `searchApi.js` | search, suggest, filters, home, explore, offers |
| `offersApi.js` | public + admin offers |
| `mediaApi.js` | object storage + register + product media-set (marketing stubbed) |
| `employeesApi.js` | admin employees, attendance, leave, performance, employee me/team |
| `adminApi.js` | analytics, settings, dashboard |
| `inventoryApi.js` | **stubs only** — see B-01 |

If OpenAPI and the client disagree, **the running frontend client wins** for this intern task unless a HUMAN DECISION says otherwise. Do not silently rename fields.

---

## 4. What the frontend still needs (UI exists, client missing or stub)

| Need | Priority | Notes |
|---|---|---|
| Inventory ledger matching `inventoryApi.js` names | P1 | Schema, not a new app |
| Marketing media list + review approve/reject | P1 | Separate from product media |
| Employee check-in / check-out / today / history | P1 | Admin attendance already cliented |
| Employee leave apply + list | P2 | Admin leave already cliented |
| Employee performance read | P2 | Admin performance already cliented |
| Support cases | P2 | Employee care desk |
| Styling appointments / requests | P2 | Employee styling desk |
| Departmental sales from **orders** | P2 | Do not create a sales database |
| AI shopping / mirror / insights | P3 | Until then keep preview copy |
| House activity feed | P2 | One diary, not a second log |

---

## 5. Auth & error shape

Frontend `handleError` expects:

```json
{ "ok": false, "error": "human message", "code": "OPTIONAL_CODE", "status": 400, "details": {} }
```

Success list endpoints typically:

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 20 }
```

Auth:

- Login returns `{ accessToken, refreshToken, user }` (names as the client already maps).
- Refresh rotates access token.
- Logout invalidates refresh.
- `401` on expired access → client refreshes once then retries.

---

## 6. Workflow cheat-sheet (products)

```
DRAFT  --submit-->  PENDING_REVIEW  --approve-->  APPROVED  --publish-->  PUBLISHED
                      |                 |                        |
                      +--return--> DRAFT +--reject--> DRAFT      +--unpublish--> DRAFT
                                                             PUBLISHED --archive--> ARCHIVED
                                                             ARCHIVED  --restore--> DRAFT
```

Employee may create/edit drafts and **submit**. Employee must not approve or publish unless a specific role command exists (it does not on the employee client).

Bulk publish runs the **same** per-product publish command. Invalid products are skipped, not force-published.

---

## 7. Media cheat-sheet

```
file --> POST /media/objects (or /media/products/{id}/objects)
     --> POST /media/register  { object_key, product_id?, role, sort_order, is_primary }
     --> GET  /media/products/{id}/media-set
     --> product save / publish
```

Storefront never invents object URLs: `POST /media/references/resolve` or the media-set payload.

Marketing:

```
explicit assignment --> media review --> approve --> home/explore may use it
```

That assignment API is the gap (B-02).

---

## 8. Pagination warning (P0)

`catalogStore.fetchAllPublishedProducts` **walks** `GET /products` at `pageSize: 100` until `items.length >= total` (or a short last page). Shop/category listings paginate separately (page size 12) and must not be confused with this session snapshot.

**Contract:** every `GET /products` page **must** include an honest `total` for the published filter. If `total` is omitted, the client currently falls back to `items.length` and would stop after page 1. A later-page error must not be treated as a complete catalogue.

Do not invent a second “hydrate all” endpoint. Do not raise `pageSize` past the documented max (backend `MAX_PAGE_SIZE=100`).

---

## 9. What you must not do

- Do not regenerate Product IDs or Media IDs.
- Do not put demo employees back (the seed file was deleted on purpose).
- Do not return demo rupees from analytics when the ledger is empty — return zeros.
- Do not implement chatbot/notifications/review-write just because routers exist.
- Do not collapse approve into publish.
- Do not serve marketing slots from product uploads.
- Do not copy secrets into tickets or docs.

---

## 10. Suggested intern order

1. Verify auth + `/auth/me` for all three portals.
2. Verify public products/categories/collections/home/search against the 128 golden IDs.
3. Verify admin product workflow including **approve does not publish**.
4. Verify cart → checkout → order → payment with **empty** catalogue still erroring honestly.
5. Align inventory schema with `inventoryApi.js` (B-01).
6. Expose marketing-media review (B-02).
7. Employee punch endpoints (B-03).
8. Leave/performance employee (B-04).
9. Support/styling only after merchandising is true.
10. AI last (P3).
