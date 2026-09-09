# Frontend production-readiness audit

**Date:** 2026-09-09  
**Repository:** `AJBiswojit/pfv1`  
**This is not a claim of production-ready.** UI existing ≠ production-ready.

---

## 1. What “production-ready frontend” means here

The storefront, admin, and employee portals must:

1. Talk to **one** backend (`/api/v1`) for every durable record.
2. Show **empty or error** when the backend has nothing — never invented customers, orders, or rupees.
3. Keep **canonical Product IDs, Media IDs, taxonomy, workflow, and ownership**.
4. Keep **APPROVE ≠ PUBLISH**, product-media ≠ marketing-media, kids as a real department.
5. Refuse to ship dummy auth.

---

## 2. Audit method

1. Mapped every customer / admin / employee route in `frontend/src/App.jsx`.
2. Traced data from pages → services → `src/services/api/*.js` → backend `app/api/v1/router.py`.
3. Classified remaining hardcoded arrays as KEEP / UNUSED DUMMY / CURRENTLY RENDERED DUMMY / TEST-ONLY / HUMAN REVIEW.
4. Listed every `export async function` in `src/services/api`.
5. Walked `public/images` (128 product-id folders, 10 kids, 5 hero, collection plates).
6. Confirmed `seedWorkforce.js` had **zero** importers, then deleted it after this classification.
7. Emptied currently-rendered EmployeeDesk demo rows and zeroed `defaultDashboardMetrics` demo KPIs.
8. Did **not** implement backend APIs and did **not** redesign UI.

---

## 3. Architecture that must not be forked

| Domain | Frontend owner | Backend owner | Forbidden fork |
|---|---|---|---|
| Products | `catalogRepository` session cache of server records | `GET/PATCH /admin/products`, public `GET /products` | Second catalogue in localStorage |
| Categories | `taxonomy.js` (nav) + `categoriesApi` | `/categories`, `/admin/categories` | Parallel kids taxonomy |
| Media (product) | `mediaApi` object+register | `/media/objects`, `/media/register`, `/media/products/{id}/media-set` | Filename → Product ID |
| Media (marketing) | stub `BACKEND_GAP` | not exposed | Silent promote from product upload |
| Cart / checkout / orders | `cartApi`, `ordersApi`, `paymentsApi` | `/cart`, `/checkout`, `/orders` | Browser-only cart as authority |
| Auth | `authApi` JWT, scoped tokens | `/auth/*` | Demo passwords |
| Workflow | `productWorkflow` commands | admin/employee product action routes | `approve` writing `PUBLISHED` |
| Inventory | `inventoryApi` all `unavailable()` | inventory router mounted, schema mismatch | Seeded stock arrays |
| Workforce | employee APIs + attendance stubs | attendance/performance routers mounted | `seedWorkforce` (deleted) |
| Analytics | `adminApi` `/analytics/*` | analytics routes | Hardcoded dashboard rupees (AdminDashboard already live) |

---

## 4. Storefront readiness

| Area | Status | Notes |
|---|---|---|
| Home / hero / collections | Partial | Hydrates `/home`; marketing-media assignment is BACKEND_GAP |
| Shop / category / collection | Partial | `useCatalogueQuery` hits `/products` or `/search` (pageSize 12). Session hydrate walks pages; backend must send honest `total` (B-05). Client no longer infers `total` from page length. |
| Product detail | Wired | `/products/{id}` + media set + related + availability |
| Cart / wishlist | Wired | `/cart`, `/customers/me/wishlist` |
| Checkout / payments | Wired | `POST /orders`, `/payments/session`, `/payments/verify` |
| Customer account | Wired | profile, addresses, orders, returns, settings |
| Search / explore | Partial | `GET /search` live; Explore still calls `getExploreOffers()` |
| Auth | Wired | register/login/refresh/logout/forgot/reset — no hardcoded passwords |
| AI shopping / mirror | Preview | Local/brand helpers; not production AI |
| Reviews write | Absent | Display-only `rating`/`reviewCount` |

**Not production-ready** until `GET /products` returns an honest `total` (B-05) and a real backend is serving published products.

---

## 5. Admin readiness

| Area | Status | Notes |
|---|---|---|
| Dashboard | Wired | `/analytics/*` + orders + inventory-summary; empty/error states |
| Products CRUD + workflow | Wired | draft/submit/approve/reject/return/publish/unpublish/archive/restore/assign/rename/duplicate/bulk |
| Categories | Wired | `/admin/categories` + taxonomy |
| Collections / offers | Wired | admin collection + offer clients |
| Orders / returns / payments / customers | Wired | admin clients exist |
| Media library (product) | Wired | upload, register, list assets, product media-set |
| Marketing media / media review | Blocked | BACKEND_GAP |
| Inventory / warehouses / transfers | Blocked | client stubbed; backend schema |
| Employees / leave / attendance (admin) | Partial | admin list/mark/summary clients exist |
| Settings | Wired | `GET/PATCH /admin/settings` |
| Insights / AI | Preview | P3 |
| Notifications inbox | Out of phase | header says not available; do not invent |

---

## 6. Employee readiness

| Area | Status | Notes |
|---|---|---|
| Login | Wired | JWT; leftover demo `fill()` removed |
| Product work (assigned, submit) | Wired | `/employee/products*` |
| Orders (limited) | Wired | `/employee/orders` |
| Check-in / check-out | Stubbed | early fail; no local punch |
| Leave / performance self | In-memory empty | admin APIs exist; employee APIs needed |
| Inventory desks | Stubbed | same as B-01 |
| Support / styling / sales desks | Empty honest UI | P2 APIs |
| Role dashboard KPIs | Honest zeros | was demo rupees; now 0 or live empty counts |

---

## 7. Dummy / mock / seed findings

See `docs/dummy-data-cleanup-report.md` and `docs/golden-data-before-after.md`.

| Class | Result |
|---|---|
| UNUSED DUMMY removed | `seedWorkforce.js` |
| CURRENTLY RENDERED DUMMY emptied | EmployeeDesk styling/wedding/sales rows; `defaultDashboardMetrics` fake KPIs |
| KEEP | taxonomy, `public/images`, product ID prefixes, empty adapters, tests |
| HUMAN REVIEW | hydrate pageSize, explore offers wiring, attendance in-memory mirrors, AI preview |

---

## 8. Security

- No passwords committed in login UI.
- Tokens: `apiClient` scoped `customer` | `admin` | `employee`.
- Do not copy `.env` secrets into docs (`SECRET FOUND — VALUE REDACTED`).
- Media delete is admin-scoped; original `public/images` is outside object-store GC.
- Product ID rename is admin workflow, family-prefix constrained.

---

## 9. Tests / build / audits (this pass)

| Check | Result |
|---|---|
| `npm test` (`frontend/`) | **377 tests, 376 pass, 0 fail, 1 skip** (`phase6LocalMediaFlow` store-copy — `backend/storage/media` absent) |
| Architecture `audit:*` | **PASS** |
| `qa:marketing-assignment` / `qa:storefront-catalog` / `qa:department-listings` / `qa:navigation-editorial` | **PASS** — retargeted to workflow fixtures and current architecture. Deleted seed / Banarasi names not restored. |
| `npm run build` | **PASS** — Vite 7.3.2, 2675 modules, `dist/index.html` 2,803.61 kB / gzip 968.17 kB |
| `git diff --check` | **PASS** (exit 0) |

Audits were **not** weakened. Fixture products are test-only DRAFTs with authored plates on existing folders; managed media register stays empty. **Do not claim production-ready.**

This audit **must not** be “made to pass” by weakening tests.

---

## 10. Verdict

The frontend is a **real application with live API clients** for auth, catalogue, cart, checkout, orders, payments, admin merchandising, product media, and settings.

It is **not production-ready** because:

1. Hydrate now walks pages, but `GET /products` must still send an honest `total` (B-05). Client `total ?? items.length` remains a trap if omitted.
2. Inventory and marketing-media clients are honest stubs.
3. Employee attendance punch is stubbed despite a mounted backend router.
4. Support/styling desks and AI are preview/empty.
5. Four `qa:*` scripts still assume a deleted static catalogue / Vite-only Node APIs.
6. Dummy ops figures were emptied; they must not be re-seeded.

Backend intern work is: implement/align the APIs in `docs/frontend-backend-api-requirements.md` without inventing new product surfaces.
