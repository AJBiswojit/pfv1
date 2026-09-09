# Frontend data migration matrix

What happens to identifiers and datasets after dummy cleanup. **No Product/Media IDs change.**

## 1. Canonical catalogue (KEEP — no migration)

| Dataset | Before | After | Action |
|---|---|---|---|
| Product IDs `PF-*` (128 folders) | present | present | none — golden |
| Kids `PF-K-*` (10) | present | present | none — same product system |
| Hero `hero001`–`hero005` | present | present | none — marketing plates |
| Collection media editorial/fabrics | present | present | none |
| Taxonomy departments/categories | present | present | none |
| Workflow states | DRAFT/REVIEW/APPROVED/PUBLISHED/ARCHIVED | same | none |
| Product media ownership | register | register | none |

If the backend catalogue is empty, **import** these Product IDs as the existing identity set. Do not mint new IDs for the same plates.

HUMAN DECISION REQUIRED before any ID-changing import. This pass does not change IDs.

## 2. Dummy / session data

| Dataset | Before | After | Migration |
|---|---|---|---|
| `seedWorkforce.js` demo staff | unused file | **deleted** | none — never load it |
| EmployeeDesk styling names | 3 demo customers | empty table | none — wait for support/styling APIs |
| EmployeeDesk wedding rows | 3 invented collections | empty | collections stay catalogue-owned |
| EmployeeDesk sales ₹ | demo billed | empty | derive later from orders |
| `defaultDashboardMetrics` | fake KPIs | 0 / live empty counts | none |
| `MOCK_*` operations arrays | already `[]` | `[]` | none |
| Attendance/leave/performance memory | empty after seed removal | empty | replace with employee APIs (B-03/B-04) |
| Guest cart localStorage | guest only | unchanged | merge via cart when customer signs in (existing) |
| Catalogue session cache | `replaceServerProducts` | unchanged | hydrate from GET /products (watch pageSize 100) |

## 3. Auth

| Item | Migration |
|---|---|
| Demo passwords | none existed on login screens; leftover `fill()` removed |
| JWT | already live; no token format change in this pass |
| Employee codes | `employee_code` on `/employee/me` — do not swap to UUIDs in the UI |

## 4. Inventory / marketing

| Item | Migration |
|---|---|
| `products.stock` | not the admin ledger |
| Inventory tables | schema work B-01; do not copy dummy on-hand into SQL |
| Marketing media | no frontend dummy to migrate; API is BACKEND_GAP |

## 5. Forbidden migrations

- Filename → Product ID
- Kids SKUs into a parallel table
- Approve writing `published=true`
- Product upload auto-assigned to hero
- Re-seeding named customers into support desks

