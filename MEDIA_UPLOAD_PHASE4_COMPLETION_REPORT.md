# PRATIKSHYA FASHION — Media Upload, Phase 4: F3 / F1 / F2 / F4 / F5

**Scope:** implement the five findings from `MEDIA_UPLOAD_VERIFICATION_REPORT.md` in one consolidated,
regression-safe batch.
**Date:** 2026-10-23 · **Branch:** `arena/dd367471-pfv1` · **Base commit:** `f13199d` (unchanged)
**Commit / deploy:** **none** — nothing was committed, tagged or deployed. The working tree holds every change.

---

## A. Result at a glance

| ID | Finding | Status | Evidence |
|---|---|---|---|
| **F3** | Employee could upload media to a product assigned to another employee | **FIXED** | Backend guard on both employee media write routes; 8 new tests; **5 of them fail on the vulnerable baseline**; live HTTP returns **403** where it previously returned **201** |
| **F1** | 409 recovery copy described replacement as changing the existing record | **FIXED** | Copy now states the retry adds a **new** media entry, the **existing entry stays attached**, detach later in the product media manager; 9 wording tests |
| **F2** | Dropzone highlight lost when the drag crosses an inner child | **FIXED** | `relatedTarget` containment guard; 5 handler tests + a DOM harness check in both directions; 2 of them fail on the unfixed dropzone |
| **F4** | Docs implied the employee `is_primary` refusal is a 403 | **FIXED (docs)** | Docs now state **422 `BUSINESS_RULE_VIOLATION`**, re-confirmed live. No runtime change |
| **F5** | Completion report §D arithmetic ("11 source") | **FIXED (docs)** | **10 source + 1 test + 1 ignore** |

Nothing else moved: no route, API contract, storage setting, publishing rule, catalogue projection,
dependency manifest or existing media record was touched.

---

## B. F3 — employee product-assignment authorization (backend)

### B.1 Root cause

`backend/app/api/v1/media.py` had two employee write endpoints —
`POST /employee/media/products/{product_id}/objects` (upload + auto-register) and
`POST /employee/media/register` (register-by-key). Both were gated by
`require_permission_for_user(current_user, db, "media.upload")` and by
`_require_employee_write_scope(product, is_primary)`, which only enforced:

* `ARCHIVED` → 422, `PUBLISHED` → 422 (DRAFT / PENDING_REVIEW only), and
* `is_primary=true` → 422.

**Assignment was never read.** Any employee holding `media.upload` could write media to any
DRAFT/PENDING_REVIEW product, including one assigned to a different employee. Phase 3 proved this
live: employee `P7-EMP-002` uploaded to `PF-W-TST-EMP-0003` (assigned `P7-EMP-001`) and received
**201**, with the object stored and the association created.

### B.2 Policy mirrored (the repository's established rule, not a new one)

`ProductService.update_product_employee` (`app/services/catalog/product_service.py:2008–2026`) — the
employee product PATCH lane:

```python
allowed_assignees = {str(employee_id)}          # employee CODE — the assignment contract
if employee_user_id:
    allowed_assignees.add(str(employee_user_id))  # legacy UUID fallback
if not is_super_admin and str(p.assigned_employee_id) not in allowed_assignees:
    raise ForbiddenException("You are not assigned to this product.")
```

`submit_for_review` (`:2156–2172`, `require_assignment=True`) is strictly *stricter* — it also rejects
an **empty** assignment explicitly (`if not p.assigned_employee_id or ...`). Both lanes therefore deny
an unassigned product; neither is reachable from the employee **media** routes, so the media guard
mirrors the PATCH form (allow-set membership) and additionally spells out the unassigned case, which
in the PATCH form can never match anyway.

### B.3 The fix (`backend/app/api/v1/media.py`)

Two helpers were added and both employee endpoints rewired through them:

```python
async def _require_employee_product_assignment(db, current_user, product) -> None:      # line 331
    roles, _permissions = await get_user_roles_and_permissions(current_user, db)
    if resolve_account_level(current_user, roles) == ACCOUNT_LEVEL_SUPER_ADMIN:
        return                                          # same bypass the service honours
    employee_code = (await db.execute(
        select(EmployeeProfileModel.employee_code)
        .where(EmployeeProfileModel.user_id == current_user.id))).scalars().first()
    allowed_assignees = {str(current_user.id)}           # legacy UUID fallback
    if employee_code:
        allowed_assignees.add(str(employee_code))
    assigned = product.assigned_employee_id
    if not assigned or str(assigned) not in allowed_assignees:
        raise ForbiddenException("You are not assigned to this product.")   # → 403 FORBIDDEN

async def _require_employee_media_write(db, current_user, product_id, is_primary):      # line 370
    product = await _require_writable_product(db, product_id)          # 404 first
    _require_employee_write_scope(product=product, is_primary=is_primary)  # 422s unchanged
    await _require_employee_product_assignment(db, current_user, product)  # 403 last
    return product
```

Call sites: `media.py:1521` (upload) and `media.py:1582` (register).

Why this shape:

* **Identity comes from the session**, resolved through the same `EmployeeProfileModel.employee_code`
  lookup the product lane uses (`products.py:_employee_code_for_user` semantics). No request field,
  header, claim or client-supplied employee id is read — a spoofing test pins that.
* **The two existing 422 decisions keep their exact order and precedence.** Status is checked before
  `is_primary`, and assignment last, so ARCHIVED/PUBLISHED/`is_primary` responses are byte-identical
  to before (`_require_employee_write_scope` was not modified).
* **The guard runs before any bytes are stored.** A denial therefore creates no object, no asset row
  and no association — proven by test and by inspecting the storage root after a live denial.
* **Admin lanes are untouched.** The employee routes already depend on `get_current_employee`
  (`user_type == "employee"`), so an admin session is refused with the pre-existing
  `"Employee authentication required."`; the admin routes never call this guard, so Admin and
  Super Admin uploads keep working on any product, assigned or not.
* **No new architecture**: one query for the roles (already imported `get_user_roles_and_permissions`
  / `resolve_account_level`), one for the employee code, reusing `ForbiddenException`.
* Not touched: `product_service.py`, DTO projections, publishing gate, storage/checksum/rollback,
  registration semantics, the generic `/media/*` admin routes, `products.py`.

### B.4 New backend tests (8, in `EmployeeProductMediaTests`)

| # | Test | Asserts |
|---|---|---|
| 1 | `test_f3_employee_upload_to_own_assigned_draft_product_is_allowed` | own DRAFT product → **201**, object on disk, 1 asset, 1 association (control case) |
| 2 | `test_f3_employee_cannot_upload_to_another_employees_draft_product` | DRAFT + assigned to `P7-EMP-002` → **403**, message "not assigned to this product", **no object, no asset, no association** |
| 3 | `test_f3_employee_cannot_register_an_object_on_another_employees_product` | register-by-key on a foreign product → **403**, nothing created, pre-planted bytes untouched |
| 4 | `test_f3_client_supplied_assignment_claims_are_ignored` | form fields `assigned_employee_id` / `assignedEmployeeId` / `employee_id` / `employeeId` do not unlock a foreign product → **403** |
| 5 | `test_f3_replacement_attempt_on_a_foreign_product_is_denied_and_mutates_nothing` | re-registering the existing key **and** re-uploading the same filename → **403**; stored bytes, asset checksums, role/sort/primary unchanged; object set unchanged |
| 6 | `test_f3_unassigned_product_is_not_writable_by_employees` | assignment cleared → **403** on upload and register; nothing created (established policy) |
| 7 | `test_f3_legacy_user_id_assignment_still_authorizes` | product assigned to the caller's **user UUID** → **201** (legacy rows keep working) |
| 8 | `test_f3_admin_and_super_admin_lanes_are_unchanged` | Admin and Super Admin admin-route uploads on a foreign/other-employee product → **201**; employee routes still refuse admin sessions with the pre-existing message |

Fixture changes (test-only, deliberately minimal): the `media.upload` employee actor now holds a real
`EmployeeProfileModel` (`P7-HP-EMP-001`), and `EmployeeProductMediaTests.asyncSetUp` assigns the
shared seeded product to that code. This is what makes the class test the *authorized owner* path,
while `PF-W-TST-OTH-0002` (assigned `P7-EMP-002`) stays the cross-employee target.

### B.5 Proof the new tests fail on the vulnerable baseline

`backend/app/api/v1/media.py` was restored to its pre-fix content (`git checkout --`), the new tests
were left in place, and the F3 subset was run:

```
/pytest tests/unit/test_phase7_media_lifecycle.py::EmployeeProductMediaTests -k "f3_"
→ 5 failed, 3 passed
```

Failing on the baseline (each `201` where the fix now returns `403`):

* `test_f3_employee_cannot_upload_to_another_employees_draft_product`
* `test_f3_employee_cannot_register_an_object_on_another_employees_product`
* `test_f3_client_supplied_assignment_claims_are_ignored`
* `test_f3_replacement_attempt_on_a_foreign_product_is_denied_and_mutates_nothing`
* `test_f3_unassigned_product_is_not_writable_by_employees`

Passing on the baseline (as they must — they pin behaviour that must **not** change): own-product
upload, legacy UUID assignment, Admin/Super Admin lanes. With the fix restored: **8 passed**.

### B.6 Live HTTP re-check (real FastAPI + real ORM + temp SQLite + temp media root)

Server: `/tmp/serve_media.py` (seeded Phase-7 data, non-production, `/tmp/pf-live-*`), stopped again
afterwards. Session mapping: `/api/v1/employee/**` → seeded stylist `P7-EMP-001`; everything else →
seeded catalogue admin.

| Scenario | Result |
|---|---|
| employee → **foreign** DRAFT `PF-W-TST-OTH-0002` (assigned `P7-EMP-002`) | **403** `FORBIDDEN — "You are not assigned to this product."` |
| employee → **own** DRAFT `PF-W-TST-EMP-0003` | **201**, key `products/PF-W-TST-EMP-0003/own-live.png`, listed by `GET /media/products/…/media-set` |
| employee register-by-key on the foreign product | **403** `FORBIDDEN — "You are not assigned to this product."` |
| same, with bytes pre-planted at `products/PF-W-TST-OTH-0002/planted-live.png` | **403** (not 404 — the guard precedes key validation); media-set unchanged, **no asset created** |
| storage root after the denials | `products/PF-W-TST-OTH-0002/` contains **only** the two admin-created objects — no `trespass-live.png`, no orphan bytes |
| employee `is_primary=true` on its own product | **422** `BUSINESS_RULE_VIOLATION` (F4 pin, unchanged) |
| Admin 409 replacement: same key, different bytes | **409** `CONFLICT — "A different object already exists at this key. Nothing was overwritten."` |
| Admin `replace_existing=true` | **201** at **new** key `collision-live-98c0ed1b4121.png`; media-set then holds **2** items with the original still attached |

---

## C. F1 — replacement wording (frontend copy only)

**What was wrong.** The admin 409 panel said *"The stored object belongs to an existing media record;
replacing it would change what that record points at."* The server does not do that: the new bytes go
to a new content-addressed key and are attached as a **new** media entry, while the old entry keeps
pointing at the old object and stays attached (live: associations 1 → 2; re-confirmed in §B.6).

**What it says now.** The copy is a single exported contract, `collisionCopy`, in
`MediaUploadForm.jsx` (headline / employee / admin / confirm), rendered by both recovery panels and by
the confirm button's `setFormError`:

* headline — `An object already exists for <names>.`
* admin — *"Nothing was overwritten. That file name already belongs to an existing media entry on this
  product. Retrying adds a new media entry for this file: the existing entry stays attached to the
  product, keeps its current image, role and order, and can be detached later in the product media
  manager."*
* employee — same consequence, without any replacement control (*"…a replacement adds a new media
  entry, and this product's existing entry stays attached with its own image, role and order until it
  is detached in the product media manager."*)
* confirm — *"The next upload will store a new media entry for <names> alongside the existing entry,
  which stays attached; the existing entry can be detached later in the product media manager. Submit
  again to confirm."*

**No behaviour change.** No auto-detach, no auto-delete, no new request, no new control; the button
label and the single-write flow are unchanged. A test asserts the form source contains no detach /
delete call at all.

**Wording regression tests** (`frontend/tests/mediaUploadRecovery.test.js`, 9 tests): each required
claim is asserted separately (new entry · existing stays attached · detachable later in the product
media manager · confirmation repeats it), the stale "would change what that record points at" wording
is asserted **gone**, and the panels are asserted to read the exported contract. With the old copy
restored: **5 fail**; with the corrected copy: **9 pass**.

---

## D. F2 — drag-and-drop highlight (frontend)

**Root cause.** `dragleave` on the container fires whenever the drag crosses into a child, because the
child's `dragleave` bubbles. The handler cleared the highlight unconditionally, so the drop target
flickered (MEDIA-UPLOAD-027).

**Fix** (`MediaUploadDropzone.jsx`, one guard plus a comment):

```js
const handleDragLeave = (event) => {
  if (event.currentTarget.contains(event.relatedTarget)) return;  // child-to-child move
  setIsDragging(false);                                           // real exit still clears
};
```

No redesign, no new state, no listener changes; detection is unchanged.

**Tests.**
* `mediaUploadRecovery.test.js` (5 handler tests, real component rendered with
  `react-test-renderer`, already a devDependency — **no new package**): drag-over raises the
  highlight; a leave whose `relatedTarget` is inside keeps it; a leave that exits clears it; a drop
  clears it; the guard reads `event.currentTarget.contains(event.relatedTarget)`.
  With the guard removed: **2 fail**; with it: **5 pass**.
* DOM harness `scripts/.tmp/dom-verify.mjs` (jsdom, out-of-tree): **19/19**, including *"child →
  container keeps the highlight"*, *"crossing an inner child keeps the highlight"* and *"leaving the
  zone entirely clears the highlight"*.

**Harness correction (disclosed).** That harness previously dispatched `dragleave` **without** a
`relatedTarget` — an event browsers never emit — so it could not exercise the fix and reported
`HIGHLIGHT LOST` even with the guard in place. It now dispatches browser-faithful events
(`relatedTarget` = the node being entered) in both directions and adds the container → child check.
The fix itself was not tailored to the harness: the production code is exactly the one-line guard.

**BLOCKED:** a real browser was not available. The visual flicker is therefore **not**
browser-verified; what is verified is the event logic under jsdom and the handler behaviour of the
real component.

---

## E. F4 / F5 — documentation only

* **F4.** `MEDIA_UPLOAD_AUDIT.md` (MEDIA-UPLOAD-002 evidence + reproduction steps) and
  `MEDIA_UPLOAD_REMEDIATION_PLAN.md` (row 002) now state the refusal explicitly as **HTTP 422
  `BUSINESS_RULE_VIOLATION`** from `_require_employee_write_scope` (and cite the current guard
  location, `media.py:1521` / `307–328`). Re-confirmed live in §B.6. No runtime change — the guard was
  correct; the documents were imprecise.
* **F5.** `MEDIA_UPLOAD_COMPLETION_REPORT.md` §D heading: *"Modified (11 source + 1 test + 1
  ignore)"* → *"Modified (**10** source + 1 test + 1 ignore)"*, matching the table's ten source rows.

---

## F. Files changed in this phase

**Backend (2)**
| File | Change |
|---|---|
| `backend/app/api/v1/media.py` | +59 / −4: `_require_employee_product_assignment` (331), `_require_employee_media_write` (370), both employee endpoints rewired (1521, 1582), `ForbiddenException` + `EmployeeProfileModel` imports, module/endpoint docs. |
| `backend/tests/unit/test_phase7_media_lifecycle.py` | +196: `OTHER_EMPLOYEE_PRODUCT_ID` / `HP_UPLOADER_CODE`, uploader employee profile, `_assign_product` helper, 8 F3 tests, class docstring. |

**Frontend (4)**
| File | Change |
|---|---|
| `frontend/src/components/media/MediaUploadForm.jsx` | Exported `collisionCopy` contract; both 409 panels and the confirm message read it; comments corrected. No behavioural change. |
| `frontend/src/components/media/MediaUploadDropzone.jsx` | `relatedTarget` containment guard in `handleDragLeave` + header note replacing the "deliberately unchanged" note. |
| `frontend/tests/mediaUploadRecovery.test.js` | **New**, 14 tests (9 × F1 wording, 5 × F2 drag behaviour). |
| `frontend/.gitignore` | Negation added so the new suite is version-controlled (`tests/*` was ignoring it). |

**Documentation (3)** — `MEDIA_UPLOAD_AUDIT.md` (F4), `MEDIA_UPLOAD_REMEDIATION_PLAN.md` (F4),
`MEDIA_UPLOAD_COMPLETION_REPORT.md` (F5), plus this report.

**Deliberately unchanged:** `product_service.py`, `products.py`, product/catalogue DTO projections,
legacy-image behaviour, storage configuration and providers, checksum/idempotency, rollback and
compensation paths, publishing workflow, `MediaProductSelector.jsx`, `MediaUploadQueue.jsx`,
`productMediaService.js`, `mediaApi.js`, all dependency manifests, all existing media and product
records. No backend file outside `media.py` + its test.

---

## G. Commands and actual results

### Backend (`/tmp/venv/bin/python`, Python 3.11.2, pytest 9.1.1)

| Command | Result |
|---|---|
| `pytest tests/unit/test_phase7_media_lifecycle.py::EmployeeProductMediaTests` | **22 passed** (14 pre-existing + 8 new) |
| same, with the fix reverted to `f13199d` content, `-k f3_` | **5 failed, 3 passed** (the denial tests prove the defect) |
| same, with the fix restored, `-k f3_` | **8 passed** |
| `pytest tests/unit/test_phase7_media_lifecycle.py` | **128 passed** in 188.2 s (was 120 before) |
| 14-file media suite (see list below) | **6 failed, 411 passed, 24 skipped, 133 subtests passed in 292.71 s** |

14-file set: `test_media_avif_validation`, `test_media_cdn_and_replacement`,
`test_media_environment_isolation`, `test_media_integrity_guards`, `test_media_reference_audit`,
`test_media_schema_integrity`, `test_media_storage_security_regressions`, `test_marketing_media`,
`test_phase3_product_media`, `test_phase6_media_db`, `test_phase6_media_storage`,
`test_phase6_real_media_integration`, `test_phase7_media_lifecycle`,
`tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py`.

Delta vs the Phase-3 baseline over the same set (403 passed / 6 failed / 24 skipped): **+8 passed —
exactly the new F3 tests — and the identical 6 failures.** No other test changed state.

### Frontend (`node --import ./scripts/node-loader/register.mjs --test`)

| Command | Result |
|---|---|
| `tests/mediaUploadRecovery.test.js` (new) | **14 passed, 0 failed** (baseline copy: 5 fail; baseline dropzone: 2 fail) |
| 9 media suites (`mediaUploadRecovery`, `mediaUploadSurface`, `mediaUploadContract`, `mediaUploadReconciliation`, `mediaProductSearch`, `phase7ProductMedia`, `phase3ProductMediaHonesty`, `phase6MediaStorage`, `phase6LocalMediaFlow`) | **171 tests, 170 passed, 0 failed** (1 skipped) |
| `npm test` (whole suite) | **837 tests, 826 passed, 10 failed, 1 skipped** |
| `npm run build` | **✓ 9.69 s**, `dist/index.html` 3,096.68 kB (gzip 973.09 kB) |

`npm test` baseline comparison: 823 tests / 812 passed / 10 failed before this phase → **+14 tests,
all passing**, the same 10 failures.

### Live harnesses (jsdom / react-test-renderer against the real backend on :8011)

| Harness | Result |
|---|---|
| `live-frontend-verify.mjs` | **10/10** — incl. *"409 modifies nothing"*, *"explicit replacement succeeds"*, *"replacement leaves ONE extra association (old one survives)"*, *"employee upload through the employee route"*, *"employee refused on a PUBLISHED product"* |
| `live-form-verify.mjs` | **16/16** — incl. *"the good file is reported as stored and attached — 1 of 2 files stored and attached"* |
| `live-employee-page.mjs` | **7/7** |
| `dom-verify.mjs` | **19/19** (was 17/18; see §D for the disclosed harness correction) |

---

## H. Pre-existing failures (unchanged, not touched)

**Backend — same six, identical at base `f13199d`:**
`test_phase3_product_media.py::RegisterRoleAllowListTests::{test_a_role_longer_than_the_column_is_rejected_not_truncated, test_an_unknown_role_is_a_canonical_422_and_writes_nothing, test_role_is_validated_even_without_a_product}`,
`::MediaVocabularyRbacTests::test_an_admin_without_media_upload_cannot_register`,
`::PublishGateMediaSourceTests::test_registering_a_new_primary_invalidates_the_product_cache`,
`tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py` (1 test).

**Frontend — same ten** (routing / `unifiedLogin` import / account-level ladder), present at base.

**Environment skips:** 24 (real PostgreSQL not configured; Phase-6 real dataset absent).

---

## I. Still open / blocked

1. **No real browser was available.** The drag highlight flicker is *not* browser-verified (jsdom +
   component-handler evidence only), and no visual or layout claim is made for the 409 panels.
2. **Live-only checks used temporary infrastructure** — temp SQLite, temp `LOCAL_MEDIA_ROOT`, seeded
   rows under `/tmp`, the server stopped at the end. No production data or existing media touched.
3. **Unassigned products are denied** for employees, matching the PATCH lane and `submit_for_review`.
   If the house policy ever changes to "unassigned products are open to any employee with
   `media.upload`", the change is a two-line edit in `_require_employee_product_assignment`; the tests
   would need the F3-unassigned case flipped.
4. **N-01 (employee catalogue gap)** is untouched: there is still no employee product list, so the
   employee page still depends on a known product id/URL. Not claimed as fixed.
5. **F3 covers the two employee media write routes only** — as instructed. `/media/*` admin routes,
   `/employee/products/**` and the services keep their existing authorization.
6. Nothing is committed, so all of the above lives in the working tree on `arena/dd367471-pfv1`.
