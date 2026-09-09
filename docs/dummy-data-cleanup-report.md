# Dummy-data cleanup report

**Date:** 2026-09-09  
**Sequence followed:** audit → classify → report → clean only safe dummy → validate.  
**Scope:** frontend dummy / mock / demo / placeholder data only. Catalogue IDs, media, taxonomy, workflow, and architecture docs were not touched.

---

## Classification rules used

| Class | Meaning | Action |
|---|---|---|
| KEEP | Canonical catalogue, media, taxonomy, workflow, auth, fixtures, empty honest adapters | Do not delete |
| UNUSED DUMMY | Hardcoded demo records with no runtime or test importer | Delete after this report |
| CURRENTLY RENDERED DUMMY | Hardcoded names / rupee figures shown in live UI | HUMAN REVIEW — empty the rows, do not invent replacements |
| TEST-ONLY | `frontend/tests/**` fixtures | Keep |
| HUMAN REVIEW | Uncertain ownership, IDs, or still-rendered demo | Do not delete the domain; document |

---

## Found

| Location | What it was | Classification |
|---|---|---|
| `frontend/src/services/workforce/seedWorkforce.js` | Full demo workforce (admins, employees, attendance, leave, performance, locations, holidays) | UNUSED DUMMY |
| `frontend/src/pages/employee/EmployeeDesk.jsx` `/employee/styling/recommendations` | Named customers (Aisha Rahman, Meher Gill, Radhika Bose) and invented edits | CURRENTLY RENDERED DUMMY |
| `frontend/src/pages/employee/EmployeeDesk.jsx` `/employee/styling/wedding` | Invented wedding collections and floor locations | CURRENTLY RENDERED DUMMY |
| `frontend/src/pages/employee/EmployeeDesk.jsx` `/employee/sales` | ₹8,42,600 and departmental billed figures labelled “demo figures for leadership” | CURRENTLY RENDERED DUMMY |
| `frontend/src/services/employees/operationsService.js` `defaultDashboardMetrics` | Role KPI cards with invented rupees, ticket counts, conversion % | CURRENTLY RENDERED DUMMY |
| `frontend/src/pages/employee/EmployeeLogin.jsx` unused `fill(entry)` | Leftover helper that would have filled demo credentials | UNUSED leftover (no demo password list remained) |
| `frontend/src/services/employees/operationsService.js` `MOCK_*` | Already `[]` | KEEP (honest empty) |
| `frontend/src/data/catalog/taxonomy.js` | Department → category → subcategory navigation | KEEP |
| `frontend/public/images/**` | 128 product-id folders + collection + hero media | KEEP |
| `frontend/src/config/productIdPrefixes.js` | Canonical `PF-*` families including kids `PF-K-*` | KEEP |
| AI copy / brand voice strings | Brand-voice templates, not customer/order records | KEEP |
| `SETTINGS_DEFAULTS` | Form shapes for settings editors | KEEP |
| Empty inventory / marketing-media adapters | Honest `{ ok:false }` / `BACKEND_GAP` | KEEP |
| `frontend/tests/**` | Test fixtures including retired names in skipped tests | KEEP (test-only) |

**Totals**

| Metric | Count |
|---|---|
| Dummy sources found | 6 (1 unused seed file, 3 rendered desk tables, 1 KPI helper, 1 leftover login helper) |
| Dummy sources removed / emptied | 6 |
| Left in place as KEEP | taxonomy, media, IDs, empty adapters, AI copy, settings shapes, tests |
| HUMAN REVIEW remaining | EmployeeDesk empty desks (need real APIs); attendance/leave/performance still in-memory session mirrors; catalog hydrate `pageSize: 100`; stale “DEMO AUTHENTICATION” comment |

---

## Removed (safe)

### 1. `frontend/src/services/workforce/seedWorkforce.js` — DELETED

- **Why dummy:** Built a complete in-browser workforce (named employees, passwords-shaped records, leave, performance, locations).
- **Why unused:** No production or test importer. `bootstrapWorkforce()` is a documented no-op. Attendance check-in/out already return without writing.
- **Why safe:** Removing it cannot change storefront, catalogue, media, auth, or any rendered screen.
- **Replacement:** None. Workforce truth is backend-owned.

### 2. Unused `fill()` on `EmployeeLogin.jsx`

- Removed the unused helper and unused `Sparkles` import.
- No demo password list existed on the page. Login already posts to `authApi`.

---

## Emptied (HUMAN REVIEW — was live UI)

These screens were showing invented people and rupees. They were **not** deleted as pages. Rows were replaced with honest empty states so working chrome (layout, columns, navigation) remains.

| Screen | Before | After |
|---|---|---|
| Styling recommendations | 3 named customers + invented outfits | `rows: []`, empty copy explaining the styling service does not exist yet |
| Wedding collections | 3 invented collections + floor locations | `rows: []`, empty copy; catalogue remains the owner of collections |
| Employee sales desk | ₹8,42,600 + 5 departmental demo rows | `rows: []`, “No departmental sales to show yet.” |
| Role dashboard KPIs (`defaultDashboardMetrics`) | Fake ₹ / counts / 28% conversion | Zeros or live counts from empty registers (`getAssistedOrders()`, `getFollowUps()`, inventory low-stock) |

**Not replaced with placeholders that fake success.** Empty is honest.

---

## Kept (must not be treated as dummy)

- Canonical Product IDs and `public/images/products/**` (128 folders, including 10 kids).
- Collection media (`editorial`, `fabrics`) and hero `hero001`–`hero005`.
- Taxonomy (`departments`, `catalogueRoutes`).
- Workflow states, APPROVE ≠ PUBLISH, media ownership rules.
- Auth JWT flow; no hardcoded passwords were present.
- Test fixtures under `frontend/tests/**`.
- Architecture / history docs.
- Empty `MOCK_*` arrays and inventory `unavailable()` adapters.

---

## HUMAN REVIEW remaining (do not delete)

1. **Employee support / styling / sales desks** — UI exists, data is now empty, APIs are P2. Do not invent cases or named clients.
2. **Workforce attendance/leave/performance repositories** — in-memory session mirrors after the seed file was removed. Check-in/out already fail closed. Do not reintroduce local punches.
3. **`catalogStore` hydrate** — walks `GET /products` until honest `total` (pageSize 100). Shop listings paginate at 12. If the backend omits `total`, the client no longer fabricates page length as `total` (B-05). Not dummy data.
4. **Stale comment** in `adminAuthService.js` (“DEMO AUTHENTICATION”) — comment only; login is live JWT. Left as-is (not dummy data).
5. **Explore offers** — `getExploreOffers()` still used by Explore.jsx while `searchApi` already has `GET /explore/offers`. Wiring gap, not dummy.
6. **Customer product reviews** — product cards show `rating` / `reviewCount` from the product record. There is no customer write-review UI. Do not invent a review-write API.
7. **`navigationConfig.searchSuggestions`** includes “Banarasi Saree”. Taxonomy still has a Banarasi subcategory. There is no live Banarasi product. HUMAN_DECISION_REQUIRED — copy vs empty catalogue; do not invent a product to match the hint.

---

## What was not done (on purpose)

- No catalogue, media, or ID regeneration.
- No backend implementation.
- No replacement of working product/order/auth UI with “coming soon”.
- No deletion of tests, architecture docs, or `public/images`.
- No emptying of Admin dashboard (already backend-fed with empty/error states).
