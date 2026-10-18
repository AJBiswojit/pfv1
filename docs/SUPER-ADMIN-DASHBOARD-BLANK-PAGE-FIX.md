# SUPER ADMIN DASHBOARD — "FLASHES ONCE, THEN GOES BLANK"

**Surface:** Admin Portal · `/super-admin` (Super Admin workspace)
**Date:** 2026-10-18
**Status:** Resolved — root cause fixed, regression-pinned, verified live against the real backend.

---

## 1. The reported symptom

1. Open the staff login page (`/login`).
2. Sign in with a Super Admin account.
3. The app navigates to `/super-admin`.
4. The dashboard appears for a moment.
5. It immediately disappears — the page goes blank.
6. Reloading `/super-admin` keeps the page blank.

The dashboard is *capable* of rendering, so this is not a missing component and not a
permanently pending loading state. Something fails **after** the first successful
render.

---

## 2. Root cause (confirmed, reproduced)

`frontend/src/pages/admin/AdminDashboard.jsx` called a `useMemo` **after** its
loading early-return:

```jsx
if (status === "loading") {          // ← early return, render #1 stops here
  return <AdminPage …>EmptyState…</AdminPage>;
}

/* Order status distribution */
const orderStatusCounts = useMemo(…); // ← hook #14 only runs in render #2
```

Hook order therefore differed between the two renders of the same component:

| Render | `status` | Hooks executed |
|--------|----------|----------------|
| 1 | `loading` | 13 (the `useMemo` is skipped by the early return) |
| 2 | `ready`  | 14 (the `useMemo` now runs) |

The moment `GET /api/v1/super-admin/dashboard/summary` resolved and the component
re-rendered with the real figures, React threw:

```
React has detected a change in the order of Hooks called by AdminDashboard.
   Previous render            Next render
   ...
13. useMemo                   useMemo
14. undefined                 useMemo
   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Error: Rendered more hooks than during the previous render.
```

That error is thrown **while rendering**, it is not caught by any error boundary,
so React unmounts the whole tree — the dashboard disappears and the page goes
blank. A reload reproduces it exactly: the guard restores the session, the
dashboard mounts, the summary resolves, the same render throws again, the tree is
unmounted again. That is why a direct refresh of `/super-admin` was blank too.

This is a **render-time crash of the dashboard route**, not an authentication,
session, role-guard or data problem (see §4 for what the investigation ruled out).

---

## 3. The fix

The `useMemo` was hoisted above the loading early-return, so the hook list is
identical in every render. Nothing else changed — the derived value, the markup,
the data contract and the approved design are untouched.

```diff
+ /* Order status distribution.
+    HOOK ORDER MATTERS: this memo must stay ABOVE the loading early-return … */
+ const orderStatusCounts = useMemo(() => { … }, [orders]);
+
  if (status === "loading") {
    return (…);
  }
…
- /* Order status distribution */
- const orderStatusCounts = useMemo(() => { … }, [orders]);
```

### The same defect in two sibling surfaces

An AST scan of every component in `frontend/src` for “hook declared after an
early return” found the identical defect in two more staff surfaces, both of
which blank the page the moment the permission state settles:

* `pages/admin/offers/AdminInstagramRewards.jsx` — the permission gate returned
  *before* the effects/memos → “Rendered fewer hooks than expected”.
* `pages/employee/EmployeeProductReview.jsx` — same shape for
  `PERMISSIONS.PRODUCTS_VIEW`.

Both were corrected the same way: the permission decision is **captured** before
the hooks and the early return happens **after** every hook has run. The
unauthorized path performs no data request (the fetch is skipped inside the
effect), so no request behaviour changed.

---

## 4. What the investigation ruled out

| Hypothesis | Result |
|---|---|
| Login API rejects / mis-routes the Super Admin | `POST /auth/staff/sign-in` → `200`; server returns `account_level = SUPER_ADMIN`, `workspace = admin` |
| Session not restored / role overwritten | `GET /auth/me` → `200`; the restored snapshot carries `accountLevel = SUPER_ADMIN`; `isSuperAdmin` stays true |
| Route guard redirects to an invalid destination | `SuperAdminProtectedRoute` admits the session (`<Outlet />`); the redirect branches (`/login`, `/admin`) were exercised and behave correctly |
| Dashboard data request fails (401/403/5xx) | `GET /super-admin/dashboard/summary` → `200`; a failed request renders the designed error state, it does not blank the page |
| Component remount / lazy import failure | The module loads fine; the failure happens on the *second* render of an already mounted component |
| Expired / invalid session | Falls back to the login page (session cleared) — the existing safe behaviour |

The first relevant error in the console is the React hook-order error above; the
blank screen is only its consequence.

---

## 5. Verification

### 5.1 Committed regression test

`frontend/tests/adminDashboardRenderRegression.test.js` (runs with `npm test`):

1. renders the **real** `AdminDashboard` with the real data contract and asserts
   the dashboard survives the loading → ready transition (no throw, still mounted,
   KPI cards / revenue chart / quick actions rendered, no hook warning logged);
2. pins the structural rule — every hook of the component must sit above the
   loading early-return;
3. pins the same rule for the two permission-gated surfaces.

Against the pre-fix source the first two tests fail with exactly the production
error (`Rendered more hooks than during the previous render.`); with the fix they
pass.

### 5.2 Live verification against the real backend

`frontend/scripts/qa-super-admin-dashboard.mjs` (`npm run qa:super-admin-dashboard`)
drives the **real** application modules (Vite SSR loader) against the **real**
FastAPI backend — real credentials, real tokens, real role, real permissions.
Nothing about the authentication is mocked.

Result on the live stack (FastAPI + PostgreSQL, seeded Super Admin / Admin /
Employee accounts):

```
1. Super Admin sign-in          7/7 PASS   (200 · SUPER_ADMIN · /auth/me 200 · KPI cards · charts · shell)
2. Dashboard stays rendered     3/3 PASS   (still visible 3 s later, no console error, no hook violation)
3. Direct reload of /super-admin 3/3 PASS (session validated, dashboard renders, no bounce to /login)
4. Another section and back     3/3 PASS   (renders, returns, 2 × /auth/me — no redirect loop)
5. Invalid credentials          2/2 PASS   (rejected by the server, no session created)
6. Invalid stored session       2/2 PASS   (lands on the login page, token cleared — not a blank page)
7. Other staff levels           4/4 PASS   (Admin → /admin · Employee → /employee, both with the
                                                server-assigned account level; the Employee also
                                                completes the forced password change)
Summary: 24 passed, 0 failed, 0 skipped
```

### 5.3 Build & suite

* `npm run build` — clean (2755 modules, `✓ built in 9.84s`).
* `npm test` — 572 tests, 560 pass. The 11 failures are **pre-existing** and
  unrelated to this defect (the frontend RBAC contract still models a
  `SUPER_EMPLOYEE` level that the backend demoted to `EMPLOYEE` in migration
  `u1v2w3x4y5z6`, plus one customer-storefront test). They fail identically on the
  pristine tree.

---

## 6. Files changed

| File | Change |
|---|---|
| `frontend/src/pages/admin/AdminDashboard.jsx` | **The fix** — `orderStatusCounts` memo hoisted above the loading early-return |
| `frontend/src/pages/admin/offers/AdminInstagramRewards.jsx` | Same defect: permission gate moved after the hooks |
| `frontend/src/pages/employee/EmployeeProductReview.jsx` | Same defect: permission gate moved after the hooks |
| `frontend/tests/adminDashboardRenderRegression.test.js` | New regression test (render + structural pins) |
| `frontend/scripts/qa-super-admin-dashboard.mjs` | New live end-to-end verification harness |
| `frontend/package.json` | `qa:super-admin-dashboard` script |

No design change: the burgundy header, the PRATIKSHYA FASHION logo, the staff
sidebar, the ivory canvas, the champagne-gold accents, the cards, the charts and
the typography are exactly as approved. No customer-facing page was touched, no
authentication API contract changed, and the server remains the authority for
roles and permissions.
