# Production Hardening & Remaining Features — Final Report (2026-09-11)

Branch `arena/01a08e85-pfv1` (pushed; sits directly on the unified-auth commit `ca9361e`) · controlled completion pass over the
unified-auth/RBAC consolidation (no redesign; existing surfaces reused).

## A. Executive summary
All twelve phases completed: S-7/S-8/S-9 fixed, real server-side admin audit logging wired
through ONE centralized writer on the EXISTING `audit_activity_log` table, SUPER_EMPLOYEE
self-service extended to real attendance/leave/performance endpoints + a reused Admin-page
surface in the Employee workspace, proven-safe dead surface removed, collection count
queries made single-pass, docs/OpenAPI regenerated. No new RBAC engine, no new auth
surface, no mock data, no new infrastructure. Both suites are green; live-DB verification
is left to you by design (see K/R/S).

## B. Features delivered
1. **Employee attendance self-service** — `POST /employee/attendance/check-in`,
   `POST /employee/attendance/check-out`, `GET /employee/attendance/today`,
   `GET /employee/attendance?month=YYYY-MM` (items + bounded summary).
2. **Supervisor day view** — `GET /admin/attendance/day?date=` (`attendance.view`,
   account-manager scope) and the fixed Admin per-employee attendance block
   (`from`/`to` range, `attendance.correct`/`attendance.manage`/`attendance.view`
   with the `employees.*` compat any-of).
3. **Leave** — `GET/POST /employee/leave`, `POST /employee/leave/{id}/cancel`,
   `GET /admin/leave`, `POST /admin/leave/{id}/decision`; new `employee_leave` table;
   approval materialises LEAVE attendance days, rejection/cancel clears only derived
   rows; self-review blocked (403); ≤60-day window; overlap 422; no balance math invented.
4. **Performance** — `GET /employee/performance` (own reviews + honest summary),
   `GET/POST /admin/performance`, `PATCH /admin/performance/{id}` on the EXISTING
   `employee_performance` schema (rating 1–5, MONTHLY/QUARTERLY/ANNUAL, reviewer, comments).
5. **Real admin audit logging (Phase 2)** — service-layer writer, 20 action types
   (section E); refusals audited on a detached session so a rolled-back 403 still
   leaves a diary entry; credentials redacted structurally.
6. **SUPER_EMPLOYEE self-service (Phase 3)** — `/employee/team-access[/new|/:id|/:id/edit]`
   mounts the SAME four Admin employee pages (list/create/detail/edit) with a
   workspace-aware base path; nav item gated on `employees.view`; the create page's
   existing ceiling/matrix logic already honored the employee actor, so no new
   account API or component was needed.
7. **S-8** — dead `/api/v1/notifications` router pair deleted (`git rm`); canonical
   `GET/PATCH /admin/settings/{section}` (notifications section) (generic settings surface) untouched.
8. **S-9** — media object delete is usage-guarded: product-media + marketing-placement
   reference counts → 409; orphan asset-register row is removed with the object; 404
   only when neither row nor object exists.
9. **S-7** — `/admin/customers` + `/admin/customers/{id}` kept their documented staff
   scope (Admin workspace OR delegated employees — no consumer broken) but the
   hand-rolled guard was replaced with the shared capability surface
   (`require_staff_permission("customers.view")`): admins now face the same hardened
   `require_admin_permission` semantics as every other admin read (provisioned-but-
   unassigned = 403), employee behavior is unchanged, and both refusals land in the
   ACCESS_DENIED diary. Endpoint descriptions updated; pinned by
   `AdminCustomersGuardTests` (backend).
9. **Duplicate-punch guarantee** — unique index `uq_employee_attendance_employee_date`
   + service upsert semantics on the Admin surface + 409 on the employee punch surface.

## C. Files touched (grouped)
**Backend — new:** `app/services/employee/workforce_rules.py`, `app/services/employee/workforce_service.py`,
`app/models/employee/leave.py`, `app/schemas/employee/workforce.py`, `app/api/v1/leave.py`,
`app/core/settings_catalog.py`, `alembic/versions/s2a3b4c5d6e7_add_employee_leave_and_attendance_guard.py`,
`tests/unit/test_workforce_rules.py`, `tests/unit/test_workforce_api_wiring.py`.
**Backend — modified:** `app/api/v1/attendance.py` + `performance.py` (health stubs → real routes,
health kept), `app/api/v1/employees.py` (attendance guards, from/to, imports), `app/api/v1/router.py`,
`app/api/v1/admin.py` (imports catalogue; `_merge_defaults` alias), `app/dependencies.py`
(`require_staff_permission_any` + central ACCESS_DENIED denial audit), `app/services/employee/employee_service.py`
(attendance upsert/correction/audits), `app/repositories/employee/employee_repository.py`
(id-or-PF-code resolution), `app/models/employee/{__init__,employee,attendance}.py`,
`app/services/audit/audit_service.py`, `app/services/catalog/collection_service.py` (single-pass counts,
dead `_label_match_product_ids` removed), `app/api/v1/media.py` (S-9), `app/api/v1/customers.py`
(S-7 canonical guard), 4 test files (fake extensions + S-7 pin).
**Backend — deleted:** `app/api/v1/notifications.py`.
**Frontend — new:** `src/services/workforce/workforceApi.js`, `src/services/workforce/workforceSync.js`,
`src/pages/admin/employees/employeesBase.js`, `tests/workforceRules.test.js`.
**Frontend — modified:** `src/App.jsx` (4 team-access routes), `src/config/employeeNavigation.js`
(2 route rules + nav item), `src/context/WorkforceContext.jsx` (auto-hydrate + refresh + syncError),
`src/context/EmployeeAuthContext.jsx` (punch wrappers now server-backed),
`src/components/workforce/CheckInCard.jsx` / `LeavePanel.jsx` / `AttendanceHistory.jsx`,
`src/pages/employee/EmployeeAttendance.jsx` (sync banner + retry),
the four `src/pages/admin/employees/AdminEmployee*` pages (base-path support only),
`src/services/employees/activityService.js` (labels for the four server-only actions —
`LEAVE_CANCELLED`, `PERFORMANCE_REVIEW_RECORDED/UPDATED`, `ACCESS_DENIED` — so the desk
renders them properly instead of the generic fallback),
`src/services/workforce/attendanceService.js` (exported `evaluateTiming`/`statusAfterPunch` for the contract test).
**Docs:** `docs/openapi.json` (regenerated: 201→222 paths), `docs/feature-api-matrix.md`
(14 rows missing→exists), `docs/frontend-backend-api-requirements.md` (10 statuses, ATT-02/LEV-04
semantics clarified, new appendix table for shipped surfaces).

## D. Security verification matrix (§16 items 22–30, this pass)
| # | Check | Result |
|---|---|---|
| 22 | Roster privacy — employee token cannot list admin-domain accounts | ✓ `include_admins` never sent from employee side; backend account-level gate unchanged; roster endpoints still `get_current_account_manager` |
| 23 | EMPLOYEE-level account can create nothing | ✓ creation matrix + ceiling checks in `create_employee` (tests in `test_admin_consolidation_employee`) |
| 24 | Cross-employee attendance isolation | ✓ punch/today/history derive identity from the token (no `employee_id` param on self routes — pinned by source test); admin lists require `attendance.view`/`employees.view` |
| 25 | Cross-employee leave manipulation | ✓ cancel is owner-or-reviewer; decision requires reviewer code; self-approve/self-reject → 403; transitions PENDING→X only else 409 |
| 26 | Cross-employee performance access | ✓ self reads via `/employee/performance`; admin list/record gated by `performance.view`/`performance.review`/`performance.manage` |
| 27 | Audit actor recorded (user id + name, PF code convention for targets) | ✓ `AuditService.record` — actor from session; target carries `employee_code` matching the frontend's `describeActor` |
| 28 | Audit target recorded | ✓ `target_employee_id` on every People-domain event |
| 29 | Audit action vocabulary shared with frontend | ✓ names reused (`EMPLOYEE_CREATED`, `PERMISSIONS_CHANGED`, `ATTENDANCE_CHECKED_IN`…); unknown-for-frontend new actions are additive |
| 30 | Passwords/hashes/temp-passwords/tokens NEVER logged | ✓ audit writes contain no credential fields; structural `redact()` over substring markers (password/token/secret/otp/pin/credential/hash/authorization/cookie) incl. nested dicts; `EMPLOYEE_CREATED` deliberately recorded pre-commit with the temp password excluded; unit-tested |
Earlier §16 items (1–21: session isolation, 401/403/409/422 semantics, capability enforcement on every admin handler, no wildcard leakage, cache invalidation, media confinement, no-credentials-in-logs) | ✓ enforced by `test_admin_consolidation_rbac`, `test_phase1_security`, `test_api_contract`, `test_phase5_admin_catalogue`, `test_phase6_media_storage` — all passing in the final run |
Route-guard check: `/employee/team-access*` requires `employees.view` (and `employees.create` for `/new`) client-side; backend re-checks every mutation — hiding a link is never the only gate ✓

## E. Audit events written by the backend (all → `audit_activity_log`)
`EMPLOYEE_CREATED`, `EMPLOYEE_UPDATED`, `ACCOUNT_LEVEL_CHANGED`, `ROLE_CHANGED`,
`EMPLOYEE_ACTIVATED`, `EMPLOYEE_SUSPENDED`, `EMPLOYEE_DEACTIVATED`, `EMPLOYEE_DELETED`,
`PASSWORD_RESET` (force-change flag only — never the password), `PERMISSIONS_CHANGED`
(mode + counts, grants as non-sensitive labels), `ACCESS_DENIED` (ceiling refusals,
manageability refusals, and every capability 403 via `require_permission_for_user` /
`require_admin_permission`), `ATTENDANCE_CHECKED_IN`, `ATTENDANCE_CHECKED_OUT`,
`ATTENDANCE_CORRECTED` (admin create/update/delete, with field names — not values),
`LEAVE_REQUESTED`, `LEAVE_APPROVED`, `LEAVE_REJECTED`, `LEAVE_CANCELLED`,
`PERFORMANCE_REVIEW_RECORDED`, `PERFORMANCE_REVIEW_UPDATED`.
One writer (`app/services/audit/audit_service.py`); success events commit with the
caller's transaction; denials use a detached session so they survive rollback; audit
failures never break the business operation. The frontend `/admin/activity` reader
consumes these rows unchanged (the previous journal was empty for these actions —
backend writes are new; the local session journal remains a session cache, never a
fallback source of truth).

## F. Attendance specifics
Late = punch after start+threshold, minutes counted from opening (mirrors
`attendanceService.evaluateTiming` verbatim); HALF_DAY strictly `0 < workMinutes <
minimumHalfDayMinutes`; leave flag wins; holiday/week-off frame honored (punch on a
holiday = ON_DUTY); store wall clock = IST documented in `workforce_rules`. Settings
resolved from the stored `attendance` section via `app/core/settings_catalog` (deep
merge over defaults; both `startTime`/`workingStartTime` key shapes accepted).
Guards: second check-in 409; check-out without check-in 409; double check-out 409;
future day 422-class business error; on approved leave 403; cross-employee impossible.

## G. Leave specifics
Types CASUAL/SICK/EARNED/EMERGENCY/OTHER; statuses PENDING/APPROVED/REJECTED/CANCELLED;
overlap vs open requests 422; >60 days 422; cancel: owner pending-only (reviewer may
withdraw approved), rejected is terminal 409, re-cancel idempotent; decision accepts
`APPROVED|REJECTED` and contract spellings `approve|reject`, `notes` alongside
`reviewNote`; rejection requires a reason (422-class); self-review 403; approval
materialises LEAVE rows skipping punched days; reject/cancel removes derived rows only.
No balances invented.

## H. Performance specifics
Reads: own list + average/latest summary (`GET /employee/performance`); manager/admin
bounded paginated lists. Writes: create/update on the existing model (rating validated
1–5; period MONTHLY/QUARTERLY/ANNUAL; reviewer = actor; date defaults to store today).
The elaborate frontend score-composition panel (`ReviewPanel`) intentionally stays as-is
— its composite fields have no server counterpart and inventing one was out of scope (Q).

## I. Legacy permission compatibility
`attendance.*`, `leave.*`, `performance.*` legacy codes are now LIVE consumers (the new
guards) — no legacy permission row lost a consumer; nothing was deleted from `permissions`.
Compat any-of (`require_staff_permission_any`) keeps the seeded ADMIN role (52 perms,
lacks `attendance.correct`) working on the Admin correction surface exactly as before via
`employees.edit`, while SUPER_EMPLOYEE delegations work via `attendance.*`. The canonical
capability groups ↔ legacy code mapping is unchanged in both directions. Pinned: legacy
handlers keep 401/403/409/422 semantics; `test_admin_consolidation_rbac` passes (no
unpermissioned admin handler was introduced).

## J. Admin duplicate-surface cleanup (Phase 8)
Removed: `app/api/v1/notifications.py` (dedicated GET/PUT pair — zero consumers;
generic section surface remains canonical). Removed: dead `_label_match_product_ids`
helper (zero callers after the single-pass count refactor). KEPT with documented reason:
legacy `/employees/*` alias routes (external-compat shims, `include_in_schema=False`),
`/roles` vs `/admin/roles`, analytics aliases, `app/services/notification/*` +
`app/schemas/notification/*` (settings section + service still used elsewhere),
frontend EmployeeAuthContext attendance wrappers (re-pointed at the API rather than
deleted — they are part of the public context surface). No speculative deletions.

## K. Database / migration review
One revision added: `s2a3b4c5d6e7` (single linear head after `r1a2b3c4d5e6`).
Adds `employee_leave` (FK → `employee_profiles` CASCADE, FK → `users` SET NULL for
reviewer) + 4 indexes; collapses pre-existing `(employee_id, attendance_date)`
duplicates deterministically (keeps newest `updated_at`, tie-break by id — the ONLY
row-touching statement, required for the mandate's duplicate-punch guarantee) then adds
unique index `uq_employee_attendance_employee_date`. Model declares the same index name
so schema state and migrations cannot drift. Downgrade drops only the index and the new
table. No other schema change; no destructive migration. `alembic heads` → exactly one.

**LIVE POSTGRESQL VERIFICATION: NOT PERFORMED — USER WILL VERIFY MANUALLY.**

## L. Performance / DB load
- Attendance/leave/performance lists: indexed, bounded (page_size ≤ 100; day/month
  windows), one SQL per call; employee lookup by id-or-code is exact-match on indexed
  columns (`users.id`, unique `employee_code`).
- Admin punch-day lookup rides the new unique index.
- Collection counts: previously `N+2` full-product fetches per list/taxonomy call (twice
  per collection — dead double-query in `_rule_product_ids` included); now ONE
  column-limited projection query per request, pure matcher in memory. Removed query:
  per-collection ILIKE/JSONB scan no longer issued at all on the batch surfaces.
- Denial audit writes add one small INSERT on a separate session per 403 (bounded by
  request rate; failure-swallowed). No new caching, no Redis, no background jobs.
No load metrics were measured (none invented here).

## M. Backend test results (full `pytest tests` on the final tree)
**789 collected · 765 passed · 24 skipped · 0 failed** (+582 subtests, 4 pre-existing
warnings). Skips are the pre-existing dataset/environment-gated ones. New files:
`test_workforce_rules.py` (16) and `test_workforce_api_wiring.py` (14); +1 S-7 pin in
`test_phase4_customer_data.py`. Baseline was 757/734/24 → +32 net tests, nothing removed
or weakened (three fakes were EXTENDED with `.all()`/db doubles; assertions untouched).

## N. Frontend test results
**430 tests · 429 passed · 1 skipped · 0 failed** (baseline 426/425/1; +4 from
`tests/workforceRules.test.js` pinning frontend↔backend rule parity).

## O. Build
`npm run build` ✓ — single-file bundle `dist/index.html` 2,798.16 kB (gzip 968.90 kB);
+~2 kB over the 2,796 kB baseline for the workforce API/sync layer, new routes and activity labels.

## P. Docs & API surface
`docs/openapi.json` regenerated from the live app (`app.openapi()`): 222 paths, all
workforce endpoints + schemas included. `feature-api-matrix.md`: 14 rows flipped to
exists; `frontend-backend-api-requirements.md`: 10 contract statuses → exists, ATT-02
upsert-semantics and LEV-04 request-alias documented, appendix added for the four
surfaces shipped beyond the original IDs. This report: `docs/production-hardening-report-2026-09.md`.

## Q. Genuine deferrals
1. **`docs/openapi.json` regeneration is manual** — add a CI/`scripts` step if you want it automatic.
2. **ReviewPanel composite workflow** (strengths/improvements/score-override, DRAFT→FINALIZED)
   has no server schema; wiring it would require new tables/columns and HR-process decisions —
   explicitly out of scope; panel behavior unchanged (local session mirror, honest empties).
3. **Legacy `NotificationSettingsService` module + schemas** still in the tree, now unused by any
   route (their section still serves `/admin/settings/notifications` semantics elsewhere);
   safe to delete in a later pass once you confirm no import-side scripts rely on it.
4. **Timezone policy** — single-store IST wall clock is documented, not configurable per location.
5. ~~GitHub push~~ — pushed successfully after the session rollback was reconciled (rebased onto `ca9361e`, fast-forward `ca9361e..f71e4af` on `arena/01a08e85-pfv1`).

## R. Manual PostgreSQL verification checklist (you run these; nothing below was done here)
1. `alembic current` → `s2a3b4c5d6e7 (head)`; `alembic heads` shows exactly one head.
2. `SELECT count(*) FROM pratikshya.employee_leave;` → 0 on a fresh DB (no seeding).
3. `UPDATE`/`INSERT` probes on `employee_attendance` show `uq_employee_attendance_employee_date` rejects a second row per (employee, date).
4. Pre-migration duplicate probe: `SELECT employee_id, attendance_date, count(*) c FROM employee_attendance GROUP BY 1,2 HAVING count(*)>1;` → empty after `alembic upgrade head` (dedupe ran).
5. Create an EMPLOYEE-level account via `/employee/team-access/new` as SUPER_EMPLOYEE → row in `users` (account_level='EMPLOYEE'), `audit_activity_log` entry `EMPLOYEE_CREATED` with NO password material in `summary/details`.
6. Attempt `POST /admin/employees` creating a SUPER_ADMIN as ADMIN → 403 + an `ACCESS_DENIED` diary row.
7. Punch in twice same day → second call 409; punch out before in → 409; `audit_activity_log` gains `ATTENDANCE_CHECKED_IN` once.
8. On-leave employee punch → 403 after approving a covering leave request.
9. Leave apply with overlapping dates → 422; approve own request as self → 403; as delegated reviewer → 200 + derived LEAVE attendance rows appear for covered days (punched days skipped).
10. Reject without reason → 422-class error; with reason → row `review_note` set, `LEAVE_REJECTED` audited.
11. Cancel a PENDING request (owner) → 200; cancel REJECTED → 409; cancel twice → idempotent 200.
12. Record a performance review (rating 6 → 422-class; rating 4 → row + `PERFORMANCE_REVIEW_UPDATED/RECORDED` in diary).
13. `GET /employee/performance` returns exactly that employee's rows (isolation probe with two accounts).
14. Admin with seeded ADMIN role (no `attendance.correct` row) can still correct attendance via `employees.edit` any-of; EMPLOYEE-level token → 403.
15. `GET /admin/attendance/day` as SUPER_EMPLOYEE with `attendance.view` → 200; without → 403 + `ACCESS_DENIED`.
16. Delete a media object referenced by a product → 409 with counts; delete unreferenced → object AND `media_assets` row gone.
17. `GET /api/v1/notifications/settings` → 404; `GET /api/v1/admin/settings/notifications` → 200.
18. `GET /admin/activity` shows the new People-domain events with actor name + PF-code target.
19. Settings change (`/admin/settings/attendance` lateThresholdMinutes=20) → next punch evaluated against 09:50 without redeploy.
20. `GET /collections` + `/admin/taxonomy/product-counts` return the SAME counts as before the refactor (compare against a pre-upgrade snapshot), with ~1 query fewer per request (`PRAGMA`-style `pg_stat_statements` or `auto_explain` if enabled — optional).
21. (S-7) `/admin/customers` matrix: ADMIN-role token → 200; admin account with roles provisioned but NO role assigned → 403 + `ACCESS_DENIED` diary row; employee token holding `customers.view` → 200; employee token without it → 403 (message may now read "Missing required permission: customers.view"); customer token → 403. Admin portal customer pages (`/admin/customers` UI) behave as before.

## S. Production readiness verdict
**READY FOR MANUAL DB VERIFICATION.**
Code, migrations and tests are complete and green in-sandbox (backend 764/24/0, frontend
429/430, build clean). This is not a "production ready" claim: live PostgreSQL migration +
the 20 checklist items in §R are the remaining gate, per the standing instruction that your
real-DB check is authoritative. STOP here — no further features or cleanup will be added.
