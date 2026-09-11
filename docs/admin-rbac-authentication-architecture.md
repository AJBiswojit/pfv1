# Unified Authentication + 4-Level RBAC — Architecture

PRATIKSHYA FASHON · consolidated 2026-09-11 · branch `arena/01a08e85-pfv1`
Status: **implemented and test-pinned** (backend `734 passed / 24 skipped / 0 failed`; frontend `425 passed / 1 skipped`; contract tests pin frontend↔backend string identity).

This document is the canonical reference for who may do what, how identity is
established, and which invariants must survive future changes. The frontend
never decides authority; the backend (`app/core/rbac.py` + `app/dependencies.py`)
is the single security authority mirrored by `frontend/src/config/rbacModel.js`
(enforced by `frontend/tests/rbacContract.test.js`, which imports the real
backend module and fails on drift).

---

## 1. Purpose & scope

One login surface for all staff, one account-level hierarchy, one capability
vocabulary, one account-management API — without touching the product
lifecycle, media architecture, order/return/customer rules, or the portal
design language. This is a **consolidation** of the pre-existing auth/RBAC
stack (single `users` table with a `user_type` discriminator, `user_roles` /
`roles` / `permissions` tables, JWT access+refresh with per-scope storage),
not a new framework. Everything below either extends what existed or maps it
onto canonical names.

## 2. Account levels — the four-level model

`ACCOUNT_LEVELS` (order = authority):

| Rank | Level | Workspace | Meaning |
|---|---|---|---|
| 4 | `SUPER_ADMIN` | Admin | System owner. Unrestricted (`*` override). |
| 3 | `ADMIN` | Admin | Assigned capability groups; never exceeds what a Super Admin granted. |
| 2 | `SUPER_EMPLOYEE` | Employee | Elevated staff; **employee-domain authority only** (can never hold `settings.manage` / `people.security`). |
| 1 | `EMPLOYEE` | Employee | Operational account within granted capabilities / role defaults. |

* Stored on `users.account_level` (`String(20)`, nullable). **Derivation rule**
  (`resolve_account_level` in `app/dependencies.py`): explicit column value
  first; otherwise legacy fallback — `user_type=admin` + `SUPER_ADMIN` role ⇒
  SUPER_ADMIN, any other admin ⇒ ADMIN, `user_type=employee` ⇒ SUPER_EMPLOYEE
  if it holds legacy `employees.manage` (or `*`), else EMPLOYEE.
* `user_type` (`admin` | `employee`) remains the workspace boundary — the
  level only orders authority inside it. A level never moves an account
  between JWT surfaces except when an admin explicitly changes it.

## 3. Creation & management matrix (backend-enforced)

`CREATABLE_LEVELS` / `can_create` (§2 of the mandate — enforced in
`check_delegation`, mirrored in `rbacModel.js`):

| Creator ↓ / target → | SUPER_ADMIN | ADMIN | SUPER_EMPLOYEE | EMPLOYEE |
|---|---|---|---|---|
| **SUPER_ADMIN** | ✅ | ✅ | ✅ | ✅ |
| **ADMIN** | ❌ 403 | ✅ | ✅ | ✅ |
| **SUPER_EMPLOYEE** | ❌ 403 | ❌ 403 | ✅ | ✅ |
| **EMPLOYEE** | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |

`can_manage` (update / status / reset-password / permissions on existing
accounts) = creatable set; **nobody below SUPER_ADMIN may touch a SUPER_ADMIN
account**; self-service never goes through these checks (and self level-change
is refused server-side). Unknown target levels → 422 `BusinessLogicException`;
non-creatable level or over-ceiling grants → 403 `ForbiddenException`.

Rosters respect the ceiling too: `GET /admin/employees?include_admins=true`
is honored only for admin-workspace actors, and non-SUPER_ADMIN rosters never
enumerate SUPER_ADMIN accounts (`exclude_super_admins` filter).

## 4. Business roles — one vocabulary, aliases preserved

The persisted role rows keep their existing names (no destructive renames).
`app/core/rbac.py` declares ONE catalogue; legacy Admin-side keys are alias
handles onto the same entries:

| Canonical business role | Legacy alias keys (compat) |
|---|---|
| `STORE_MANAGER` | `MANAGER` |
| `SALES_EXECUTIVE` | `SALES` |
| `INVENTORY_MANAGER` / `INVENTORY_STAFF` | `INVENTORY` |
| `WAREHOUSE_STAFF` | `WAREHOUSE` |
| `CUSTOMER_SUPPORT` | `CS` |
| `FASHION_STYLIST` | `STYLIST` |
| `SUPER_ADMIN` / `ADMIN` (admin-side definitions) | — |

The business role answers *what the person does* (department/section
context, role-default operational permission set); the account level answers
*what the person may authorize*. `BUILT_IN_ROLES` (admin.py) is now a
re-export of this catalogue — the previous ~90-line static duplicate is gone,
and `/admin/roles` dedupes alias entries by role id.

## 5. Capability catalogue

13 groups, `group.action` codes (`view` / `manage` / `delete`) in
`CAPABILITY_GROUPS`; exposed read-only to clients via
`GET /api/v1/admin/capabilities`:

| Group | Actions | Notes |
|---|---|---|
| `CATALOGUE` | view, manage | products/categories/collections |
| `PRODUCT_WORKFLOW` | review, manage | review desks only — lifecycle rules stay in the product service (permissions decide WHO, workflow decides WHETHER) |
| `MEDIA` | view, manage, delete | delete remains additionally guarded by usage checks in `media.py` |
| `ORDERS` | view, manage | |
| `RETURNS` | view, manage | |
| `CUSTOMERS` | view, manage | |
| `PEOPLE` | view, manage, security | `people.security` = role/permission assignment; admin-domain |
| `MARKETING` | view, manage | |
| `ANALYTICS` | view | first-writer rollup target for `audit.view` |
| `OFFERS` | view, manage | |
| `SETTINGS` | view, manage | `settings.manage` is SUPER_ADMIN-only (PATCH /admin/settings keeps `require_super_admin_user`) |
| `AI` | view (`ai.view`) | implies `analytics.view`; the AI Business Assistant guard remains `analytics.view` (pinned contract) |

(`AUDIT`, `ATTENDANCE`, `LEAVE`, `PERFORMANCE`, employee-profile/self keys are
**legacy pass-through** codes: valid grants, deliberately not group owners.)

`ADMIN_ONLY_CAPABILITIES = {settings.manage, people.security}` — never
delegable by an employee-domain creator.

## 6. Implications & bidirectional legacy compatibility

`CAPABILITY_IMPLIES` (capability → legacy granular codes) and
`LEGACY_TO_CAPABILITY` (first-writer rollup) live in ONE dict per side and are
byte-checked by the contract test. Effective set for any check:

```
expand_effective_permissions(granted)
  = granted
  ∪ { capability : legacy granted code rolls up to it }      # old grants satisfy new checks
  ∪ { implied legacy codes : granted capability implies them } # new grants satisfy old handler checks
  (with "*" present: unbounded short-circuit)
```

Consequences: seeded/legacy ADMIN rows holding only granular codes keep
working against the new capability-keyed guards; new capability assignments
satisfy the untouched granular checks in orders/products/media routers.
`normalize_grants()` keeps only known codes (legacy ∪ capability ∪ employee
operational keys), deduped and sorted. **No old permission record is deleted
in this task** — removal of dead codes is a later, separately-proven cleanup.

## 7. Resolution, caching, DB-load

`get_user_roles_and_permissions` (`app/dependencies.py`) is the single
resolver; the auth DTO and every guard call it. One `selectinload` join set
per cold resolution (no per-role queries → no N+1), cached in the existing
in-process `rbac:{user_id}` entry cache (TTL 300s — no Redis, no new infra).
`invalidate_rbac_cache(user_id)` runs on every role/permission write
(assign role, update permissions, level change) — verified by source-pins in
`tests/unit/test_unified_rbac_consolidation.py`. Expansion is computed inside
the cached value, so the hot path is a dict hit + set membership.

**Security fix folded in here:** `AuthService._get_user_roles_and_permissions`
used to append `"*"` for any `ADMIN` role holder, silently defeating every
`require_admin_permission` check for Admins. It now delegates to the resolver;
only SUPER_ADMIN derives `"*"`. (The mechanism "a wildcard grant overrides"
remains honored for honest wildcard holders.)

## 8. Authentication — ONE staff sign-in

`POST /api/v1/auth/staff/sign-in` `{ identifier, password }` — identifier is
email, phone **or** PF employee code (`sign_in_staff` in `AuthService`).
Flow: resolve staff user across both surfaces → verify password → derive
`surface = "admin" | "employee"` from `user_type` → shared token/session
builder (`_build_token_response`) exactly as the legacy logins.

* **Enumeration-safe**: unknown identifier, customer identifier, and wrong
  password all return the SAME 401 `"Those credentials don't match a staff
  account."` (log lines distinguish internally only).
* Suspended/inactive accounts → 403 with status message (pre-password).
* Accounts without an issued password → explicit contact-administrator 401.
* Rate limiting: same `@limiter.limit` decorator as the other sign-in routes.
* Legacy `POST /auth/admin/login` / `/auth/employee/login` remain **available
  and unchanged** (external-contract safety); the frontend no longer calls
  them for sign-in.

Response envelope is the existing TokenResponse: `access_token`,
`refresh_token`, `expires_in`, `token_type`, and the profile DTO — which now
carries `account_level`, `workspace`, `business_role`, and the **expanded**
effective `permissions` list (so old clients see strictly more codes than
before, never fewer).

## 9. JWT claim contract

Existing claims retained: `sub`, `user_type`, `token_type`, `jti`, `roles`,
`force_password_change`. Exactly **ONE** new claim on the DTO/`/auth/me`
projection: `account_level` (plus derived `workspace` on the DTO — the two
are equivalent, but the DTO field is what clients branch on). **No**
`is_admin` / `is_super_employee` / other redundant boolean claims. Tokens
remain per-scope (audience unchanged): an employee-level token can never call
admin-only surfaces, because the surface guard still checks `user_type` FIRST.

## 10. Guard semantics (HTTP contract)

| Guard | Where | Behavior |
|---|---|---|
| `require_admin_permission` | admin routers (orders, products, media, customers, analytics, audit, users, roles…) | unauthenticated → 401; customer/employee token → 403; active admin without the permission → **403**; the no-role-row compat fallback remains ONLY for truly unassigned admins (no roles AND no custom grants AND derived level not blocking) — the previous ADMIN wildcard is gone |
| `require_staff_permission` | account-management + staff cross-surface checks | resolves the actor's expanded set via the cached resolver; SUPER_ADMIN override; otherwise capability check (both vocabularies) |
| `get_current_account_manager` | `/admin/employees*` | `user_type=admin` (any level) OR `SUPER_EMPLOYEE` employee; anything else 403 — ONE API for both workspaces |
| `require_super_admin_user` | `PATCH /admin/settings`, destructive role ops | SUPER_ADMIN level only |

409 remains the conflict status (duplicate email/phone/code), 422 for schema
and business-rule violations (including unknown account levels), per the
pre-existing error-envelope contract (`test_api_contract.py` pins unchanged).

## 11. Account-management API — extended, not duplicated

`/api/v1/admin/employees` is THE account API (audited as such in
`docs/admin-complete-audit.md`):

| Operation | Change |
|---|---|
| `POST /admin/employees` | accepts `accountLevel` (validated by `check_delegation`); returns the derived `accountLevel`/`businessRole`/`permissionMode` and the one-time `temporaryPassword` (response-only — never stored) |
| `GET /admin/employees` | `include_admins` (see §3 roster rules); rows carry level/business-role fields |
| `PATCH /admin/employees/{id}` | level change (self-change refused), business-role reassignment (get-or-create row), permission persistence |
| `PUT /admin/employees/{id}/permissions` | was a runtime no-op (`AttributeError` on the shadowed class, then dead code); now persists `permissionMode` + normalized grants + invalidates the cache |
| `POST …/reset-password` | returns the fresh one-time `temporaryPassword` once |
| `GET /admin/capabilities` | NEW read-only mirror of the §5 catalogue (labels + implied legacy codes) so assignment UIs never hardcode it |

Deletion is self-delete-blocked; all writes go through the hierarchy ceiling.

## 12. Frontend architecture

* `config/rbacModel.js` — canonical mirror (levels, matrix, catalogue,
  expansion, `delegableCapabilities`) + contract test. No duplicate stores,
  no parallel engine.
* `services/api/authApi.js` — `apiSignInStaff` posts to the unified endpoint
  with `scope: "none"`, validates server-resolved workspace against the
  profile, and stores tokens under that scope's isolated keys ONLY
  (`pf_employee_*` / `pf_admin_*` — unchanged). `refresh`/per-scope atomic
  renewal unchanged.
* `context/AdminAuthContext` / `EmployeeAuthContext` — both `signIn` methods
  now call `apiSignInStaff` and refuse wrong-workspace sessions (clearing the
  misplaced tokens) — two SESSION contexts (they legitimately carry different
  profile shapes/route state) on ONE authentication flow; no third context.
* `pages/auth/StaffLogin.jsx` at `/login` — the ONE staff login page
  (identifier + password; routes by the server-resolved workspace; honors
  `returnTo` through the existing sanitizers; employee `mustChangePassword`
  still lands on `/employee/change-password`). `/admin/login` and
  `/employee/login` are thin `<Navigate>` redirects (bookmarks keep working);
  guards, headers, brand configs and forgot/change-password links point at
  `/login`. The customer storefront keeps its own `/signin` — portal
  isolation unchanged.
* `components/admin/AdminProtectedRoute` — requires an admin-workspace level
  (SUPER_ADMIN **or** ADMIN; the old SUPER_ADMIN-only gate was a lockout for
  capability-authorized Admins); `hasAdminWorkspaceAccess` from the context.
* `config/adminNavigation.js` + `components/admin/AdminSidebar.jsx` — ONE nav
  config; every gated item/child declares its canonical capability;
  `filterAdminNav(groups, hasPermission)` hides what the session cannot use
  (UX only — the backend remains the authority). Dashboard always visible.
* Employee workspace keeps its existing permission codes (`authorization.js`,
  nav, `PermissionMatrix`) — the expanded DTO (§8) makes legacy grants and new
  capabilities equivalent there; no employee-portal contract broke.
* `pages/admin/employees/AdminEmployeeCreate.jsx` / `…Edit.jsx` — extended
  (not duplicated): account-level picker limited to `CREATABLE_LEVELS` of the
  signed-in creator; capability assignment reuses the single
  `PermissionMatrix`, switched to the `CAPABILITY_GROUPS` catalogue with the
  creator's delegation ceiling locking out rows above its authority; the
  real `temporaryPassword` from the API feeds `CredentialSheet` (no invented
  demo credentials). `AdminEmployees` shows the level badge; detail page shows
  level/workspace/business-role and renders the right catalogue.

## 13. Database & migration

* `users.account_level` (String(20) NULL), `users.permission_mode`
  (`'role'` default | `'custom'`), `users.custom_permissions` (JSON list) —
  the existing permission-override columns the service already read.
* Alembic `r1a2b3c4d5e6` — **additive** (three `add_column`s) + deterministic
  backfill (SUPER_ADMIN where the legacy SUPER_ADMIN role exists; ADMIN for
  other admins; SUPER_EMPLOYEE for employees holding `employees.manage` /
  `*`; EMPLOYEE otherwise). No data rewrite, no table. Downgrade drops the
  columns — safe because every derivation path in §2 still works from
  `user_type` + role rows when the columns are absent (null column = legacy
  derivation). Heads-up: repo had two pre-existing alembic heads; this
  revision merges them (`down_revision` tuple) rather than adding a fourth.
* `scripts/seed_database.py` — seeds role rows including `ADMIN` and the
  permission rows = legacy catalogue ∪ all capability codes, so a fresh seed
  matches the unified vocabulary (dev/CI only).
* No password hashes touched; no sessions revoked; no users invalidated
  (migration adds nothing that could invalidate).

## 14. Security considerations

* **Fixed leak**: ADMIN wildcard (see §7). ADMIN access is now exactly its
  assigned capabilities — verified by `test_admin_consolidation_rbac` pins
  and the new resolver tests.
* **Lockout avoided**: `AdminProtectedRoute` accepted only SUPER_ADMIN;
  ADMIN-level accounts (which the backend happily served) were UI-locked —
  the guard now mirrors the workspace rule, while per-item capability
  filtering stays UX-only.
* **No-op fixed**: `PUT …/permissions` previously discarded assignments
  (UI said saved, DB said no) — a silent authorization drift; now real.
* Frontend hiding is never enforcement; every route in §11 re-validates
  creator ceiling, target level, and grants server-side.
* Roster privacy: non-SUPER_ADMIN creators cannot enumerate SUPER_ADMIN
  accounts; unknown-vs-wrong-password indistinguishable at the unified login.
* Tokens remain isolated per scope (`pf_admin_*` vs `pf_employee_*` vs
  `pf_*` customer) — the unified LOGIN did not merge session storage, so a
  stolen employee token cannot read admin session state and vice versa.
* **Audit gap (documented, not faked)**: admin account mutations still do not
  write `audit_logs` rows (repo-wide B-09: no audit-log writer exists — the
  table is read-only). The employee-activity diary is UI-local by design.
  Wiring a writer is out of scope here; the mutation endpoints log to the
  application logger with actor ids and invalidate caches. Recommendation
  stands from `admin-complete-audit.md` §19.

## 15. Invariants, deferred, and intentional non-goals

IN: product lifecycle states/slug/SKU/media-ownership flows, `HOME_HERO` +
B-02 media rules, order/return/customer/payment business rules, storefront,
employee portal behavior, design language, `user_type` column semantics,
legacy login endpoints (external callers), legacy granular permission codes
compatibility, `/auth/refresh` + jti blacklist, per-scope storage.

DEFERRED (explicit): destructive cleanup of now-redundant legacy permission
rows (mapping is bidirectional — delete nothing until no consumer remains);
SUPER_EMPLOYEE self-service account-creation UI inside the employee workspace
(the API contract + context scope support it TODAY; a dedicated page would
duplicate admin screens — add only when product wants the surface); an
audit-log writer service (B-09); S-7/S-8/S-9 findings of the prior audit are
unchanged by design.

RULES FOR FUTURE WORK: add capabilities as `group.action` entries in
`rbac.py` (mirror updates are then forced by the contract test); never add a
new claim to the JWT without deprecating one; never add a second login page,
account API, or permission repository; workflow validation belongs in
services, not in permission strings; keep `require_admin_permission` 401/403
semantics exactly as §10.
