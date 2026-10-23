# PRATIKSHYA FASHION — Media Upload Remediation · Verification Report

**Surface under test:** `/super-admin/media/upload`, `/admin/media/upload`, `/employee/media/upload`
**Branch:** `arena/dd367471-pfv1` (base `f13199d`) · **Date:** 23 October 2026
**Code changes made during this verification:** **none** · **Committed:** no · **Deployed:** no

---

## A. Verdict

| # | Scenario you asked for | Verdict | Basis |
|---|---|---|---|
| 1 | D4 legacy-only block, and **no upload request is sent** | **PASS** | Real form mounted against a real API; 0 POSTs observed, refusal explained |
| 2 | Preselected employee product upload, authorised non-production session | **PASS** | Real employee route, real RBAC grant, real HTTP 201 |
| 3 | Real HTTP 409 + explicit replacement against non-production storage | **PASS** (with finding **F1**) | 409 produced and classified; replacement verified; side effect documented |
| 4a | Keyboard navigation | **PASS** | jsdom: full combobox behaviour |
| 4b | File selection | **PASS** | Real queue rows from real files |
| 4c | Upload progress | **PASS** | Real stage sequence, monotonic, capped at 99 |
| 4d | Partial failures | **PASS** | Live 201 + 422 in one batch, honest summary |
| 4e | Cancellation | **PASS** | Stops between files; in-flight abort → unconfirmed |
| 4f | Truthful "unconfirmed" states | **PASS** | Never rendered as "failed" |
| 4g | **1366 × 768 layout** | **BLOCKED** | No browser / no layout engine available |
| 5 | Drag-and-drop flicker reproduction | **MECHANISM REPRODUCED**; visual flicker **BLOCKED** | Highlight lost when the drag crosses an inner child |
| 6 | Backend media regression suite | **PASS — no regression** | 403 passed, 6 failed, 24 skipped; the same 6 fail at base `f13199d` |
| 7 | Working-tree diff contains only documented files | **PASS** (one doc arithmetic error, **F5**) | 20 entries, 0 backend files, no dependency changes |

Total live checks executed: **58** (57 pass; 1 is the deliberate 027 reproduction).

Nothing in this report is claimed as passing unless the command that produced it is listed in §G.

---

## B. Method (what "live" meant here)

No browser binary exists in this environment (`which chromium/google-chrome/firefox` → nothing), and
`node_modules` contained no DOM library. So three independent layers were used instead:

1. **Real backend over real HTTP.** The project's own Phase-7 harness was booted under `uvicorn` on
   `127.0.0.1:8011` — real FastAPI routers, real ORM, real local storage, seeded rows. Its databases and
   media root are **temporary directories under `/tmp`**; the repository's `backend/storage` still holds
   only `.gitkeep`. Actor selection follows the real surface split: `/api/v1/employee/...` is the seeded
   stylist, everything else the seeded catalogue admin — both with real RBAC grants in the temp DB.
2. **The real frontend modules** (`apiClient`, `apiUploadProductMediaObject`, `uploadAndRegisterProductImages`,
   `loadProductMediaContext`, `legacyCatalogueOnly`, `decidePrimary`) imported unmodified and pointed at that
   server through a `fetch` wrapper that only adds an origin — exactly what a browser does implicitly.
3. **The real components**, mounted twice: `react-test-renderer` for behaviour that React owns
   (submit, queue, partial failure), and **jsdom 30.1.3 installed at `/tmp/vdom`, outside the repository**,
   for keyboard/focus/pointer/drag event handling. The project's dependency set was **not** touched.

Backend suite: a real Python 3.11 virtualenv built from `backend/requirements.txt` (`/tmp/venv`),
`pytest 9.1.1` + `pytest-asyncio 1.4.0`.

---

## C. Scenario detail and evidence

### 1. D4 block — PASS (no request sent)

Environment: live API, product `PF-W-SAR-SIL-0001` (PUBLISHED, legacy `image` + `additional_images`, no registered set).

```
context.ok / verified        true / true
registered media items       0
product.image                /images/products/PF-W-SAR-SIL-0001/primary.avif
additionalImages             ["/images/products/PF-W-SAR-SIL-0001/primary.avif"]
legacyCatalogueOnly(...)     true
decidePrimary (admin)        false
```

Then the **form itself** was mounted with that product preselected, a file added, and `onSubmit` invoked
(`react-test-renderer`, authorised SUPER_ADMIN session via `AdminAuthContext`, so the block — not a
permission error — is what stops it):

```
PASS  the block is rendered before any file is chosen
PASS  the block states nothing was modified
PASS  the submit control is disabled while blocked
PASS  NO upload request is sent for a blocked product — 0 POST(s) to /objects; wire: []
PASS  the refusal is explained on screen
```

The recorded HTTP wire for that submit is **empty** — no `/objects` call, no `/media/register` call, nothing.

The unreadable-product path was verified the same way (nonexistent product id → two 404 reads):

```
PASS  NO upload request is sent when the product read failed — 0 POST(s)
PASS  the unverified state is shown and offers a retry
```

### 2. Employee preselected upload — PASS

Live, through the employee route, with a real `media.upload` grant seeded on the stylist role:

```
employee context ok / items          true / 0
employee product status              DRAFT
PASS  employee upload through the employee route — 201 /api/v1/employee/media/products/PF-W-TST-EMP-0003/objects
PASS  employee request never carries is_primary — is_primary=null
PASS  employee metadata persisted (title/alt) on the creating call
       {"role":"GALLERY","primary":false,"order":0,"title":"Employee plate",
        "alt":"An employee-uploaded plate"}
PASS  employee refused on a PUBLISHED product — status 422
```

The page entry path (`?product=`) was verified too (7/7): the query parameter reaches `initialProductId`,
the product card renders with its real SKU `PF-W-TST-EMP-0003`, the D5 copy ("Employee sessions cannot
search the full catalogue") is present, **no cover control is offered**, and with no product the submit
control is disabled.

### 3. Real 409 + explicit replacement — PASS, with F1

Live, `POST /api/v1/media/products/PF-W-TST-OTH-0002/objects`, through the page's own service:

```
1) first upload ok                 true
   wire                            ["POST …/objects → 201"]
2) same name, new bytes ok         false
   http status                     409
   failureKind                     collision
   uncertain                       false
   message                         "A different object already exists at this key. Nothing was overwritten."
associations after the 409         1        (unchanged)
3) replace_existing retry ok       true
   object key                      products/PF-W-TST-OTH-0002/live-plate-24ba73a3d578.png
associations after replacement     2
   · live-plate-24ba73a3d578.png role=GALLERY order=0 primary=false
   · live-plate.png              role=GALLERY order=0 primary=false
```

Server-side confirmation of the same sequence (direct HTTP, no frontend):

- **409 body** is the canonical envelope: `{"success":false,"error":{"code":"CONFLICT","message":"A different object already exists at this key. Nothing was overwritten.","details":{}}}` — and `normaliseError` **does** surface `error.message` (the operator sees the real sentence, not a generic one).
- **409 writes nothing**: asset rows unchanged, association rows unchanged, the stored object's SHA-256 unchanged.
- **Identical bytes are idempotent**: second upload of the same file → `201`, `alreadyExists: true`, **0 duplicate rows**.
- **Replacement never overwrites**: new content-addressed key `…-<sha12>.png`; the old object still exists with its original hash.
- Replacement **adds a second association** (1 → 2) and leaves the old one attached — see **F1**.

### 4. Interaction behaviours

Keyboard (jsdom, real DOM events, live search results):

```
PASS  the combobox renders as an ARIA combobox — aria-expanded=false
PASS  aria-controls points at the listbox container
PASS  focus opens the listbox
PASS  an announced result count is rendered — "3 products shown of 3"
PASS  ArrowDown sets aria-activedescendant to a real option — …-option-0
PASS  ArrowDown advances to a different option — …-option-1
PASS  Home and End move to the first and last option — end=…-option-2 home=…-option-0
PASS  Enter selects the active product — PF-W-TST-EMP-0003 (Employee Draft Saree)
PASS  the popup closes after selection — combobox replaced by the selected-product card
PASS  the selected card names the product and its real SKU
PASS  the selected card offers 'Change Product'
PASS  'Change Product' clears the selection and restores the search
PASS  Escape closes the reopened popup — aria-expanded=false
PASS  an outside pointerdown dismisses the popup (026) — aria-expanded=false
```

Progress, partial failure, cancellation and unconfirmed (live server):

```
stages:   progress-1.png:uploading → uploaded → assigned → progress-2.png:uploading → uploaded → assigned
progress: 5, 25, 50, 55, 75, 99
PASS  progress rises and never reaches 100 mid-batch — max 99

PASS  both files are attempted (continueOnError) — [201,422]
PASS  the good file is reported as stored and attached — "1 of 2 files stored and attached"
PASS  the rejected file's server message is shown — "rejected by the server: partial-corrupt."
PASS  the failed row stays in the queue and the succeeded row leaves it

PASS  cancelling stops before the second file — 1 result(s), cancelled=true
PASS  the already-sent file is reported as successful, not as a failure
PASS  an aborted in-flight request is 'unconfirmed', never 'failed' — stage=unconfirmed uncertain=true
PASS  no object key or media id is invented for the aborted request
```

Rejection text for the corrupt file came from the server verbatim: *"The file content does not match any
supported image format, so it was rejected. The filename alone is never trusted."*

**4g — 1366 × 768 layout: BLOCKED.** jsdom has no layout engine, and no browser or headless shell is
installed in this environment. The mitigation implemented earlier (compact dropzone once files are queued,
sticky action bar, collapsed banner) is unmeasured. Running `npm run dev` and opening the page at
1366 × 768 remains the only honest test.

### 5. Drag-and-drop flicker — MECHANISM REPRODUCED, visual BLOCKED

jsdom, real bubbling events:

```
PASS  dragging a file over the zone highlights it — border-2 border-dashed border-accent
PASS  the dropzone has inner children a drag can cross — H3
FAIL  crossing an inner child keeps the highlight — HIGHLIGHT LOST — mechanism reproduced
PASS  leaving the zone entirely clears the highlight — baseline behaviour a fix must keep
```

The last "FAIL" is the finding, not a regression: the container's `onDragLeave` runs when the pointer moves
onto an inner child, because that `dragleave` bubbles from the child. The highlight is therefore cleared
while the file is still over the zone. **MEDIA-UPLOAD-027 is a real defect, not a suspicion** — the earlier
"not reproduced" status is now superseded (the *visible* flicker still needs a browser, but the cause is
demonstrated). Per your instruction, **no fix was applied**; see **F2** for the minimal one.

### 6. Backend media regression suite — PASS (no regression)

```
cd backend && /tmp/venv/bin/python -m pytest \
  tests/unit/test_phase7_media_lifecycle.py tests/unit/test_phase6_media_db.py \
  tests/unit/test_phase6_media_storage.py tests/unit/test_phase6_real_media_integration.py \
  tests/unit/test_phase3_product_media.py tests/unit/test_media_avif_validation.py \
  tests/unit/test_media_cdn_and_replacement.py tests/unit/test_media_environment_isolation.py \
  tests/unit/test_media_integrity_guards.py tests/unit/test_media_reference_audit.py \
  tests/unit/test_media_schema_integrity.py tests/unit/test_media_storage_security_regressions.py \
  tests/unit/test_marketing_media.py tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py
→ 6 failed, 403 passed, 24 skipped, 4 warnings, 133 subtests passed in 275.14s
```

The six failures:

1. `RegisterRoleAllowListTests::test_a_role_longer_than_the_column_is_rejected_not_truncated`
2. `RegisterRoleAllowListTests::test_an_unknown_role_is_a_canonical_422_and_writes_nothing`
3. `RegisterRoleAllowListTests::test_role_is_validated_even_without_a_product`
4. `MediaVocabularyRbacTests::test_an_admin_without_media_upload_cannot_register`
5. `PublishGateMediaSourceTests::test_registering_a_new_primary_invalidates_the_product_cache`
6. `Step11CProductMediaTaxonomyFlow::test_complete_product_media_taxonomy_flow_through_production_app`

**Pre-existing, not caused by this work.** A detached worktree at base `f13199d` (`/tmp/pfv1-base2`), same
interpreter and same two files, produced the **identical six** failures. The backend tree at HEAD is
byte-identical to base (`diff -r backend /tmp/pfv1-base2/backend` → no file differences, only `__pycache__`).
The 24 skips are environmental: 1 needs `DATABASE_URL` for the PostgreSQL integrity suite, 23 need the
Phase-6 real media dataset.

Sample failure cause (5), an over-counted cache invalidation rather than a media defect:

```
AssertionError: Lists differ: [(…'pf3b7-banarasi-silk'), (…, 'pf3b7-banarasi-silk')] != [(…, 'pf3b7-banarasi-silk')]
```

Frontend, for completeness (re-run this session):

```
npm test                → 823 tests, 812 pass, 10 fail
base f13199d (748)      → 748 tests, 737 pass, 10 fail   ← same ten, unrelated (routing / unifiedLogin import)
media suites            → 105/105
access · registry · security contracts · terminology · storage · AVIF · honesty → 119/119
```

### 7. Working-tree diff audit — PASS

```
git status --porcelain → 20 entries
  M  frontend/.gitignore
  M  frontend/src/components/media/MediaProductSelector.jsx
  M  frontend/src/components/media/MediaUploadDropzone.jsx
  M  frontend/src/components/media/MediaUploadForm.jsx
  M  frontend/src/components/media/MediaUploadQueue.jsx
  M  frontend/src/config/mediaTypes.js
  M  frontend/src/pages/admin/media/AdminMediaUpload.jsx
  M  frontend/src/services/api/apiClient.js
  M  frontend/src/services/api/mediaApi.js
  M  frontend/src/services/media/productMediaService.js
  M  frontend/src/services/media/uploadValidation.js
  M  frontend/tests/phase7ProductMedia.test.js
  ?? frontend/src/hooks/useAdminProductSearch.js
  ?? frontend/tests/mediaUploadContract.test.js
  ?? frontend/tests/mediaUploadReconciliation.test.js
  ?? frontend/tests/mediaProductSearch.test.js
  ?? frontend/tests/mediaUploadSurface.test.js
  ?? MEDIA_UPLOAD_AUDIT.md · MEDIA_UPLOAD_REMEDIATION_PLAN.md · MEDIA_UPLOAD_COMPLETION_REPORT.md
```

Confirmed:

- **0 backend files changed** (`git status --porcelain | grep -c backend/` → 0). No route, model, service,
  schema, migration or authorization rule was touched.
- **No dependency manifests changed** (`package.json`, `package-lock.json`, `requirements.txt`, `pyproject.toml`).
- **No existing media touched**: repository `backend/storage` still contains only `.gitkeep`; every live run
  wrote to `/tmp`. `git status --ignored backend/storage` is empty.
- **No production data**: the live server used temporary SQLite files and a temporary media root under `/tmp`.
- `.gitignore` diff is exactly the test-file negation block (needed for the four new suites to be reviewable).
- Verification scaffolding lives in `frontend/scripts/.tmp/` (already ignored by the repo) and `/tmp` — none of
  it appears in the diff.

**F5 (documentation only):** §D of `MEDIA_UPLOAD_COMPLETION_REPORT.md` says "11 source + 1 test + 1 ignore";
the table below it lists **10** source files, and the real diff is 12 modified files (10 source + 1 test +
1 ignore). The file list itself is correct; only the count in the heading is wrong.

---

## D. Findings that need your decision — no code changed

### F1 — "Replace the stored object" leaves the superseded media attached to the product (Medium)

**Evidence.** Live: associations for `PF-W-TST-OTH-0002` go **1 → 2** after a successful replacement; the
media-set returns both rows, both at `sortOrder 0`:

```
· live-plate-24ba73a3d578.png  role=GALLERY order=0 primary=false
· live-plate.png               role=GALLERY order=0 primary=false
```

This is the backend's documented behaviour (the old object and its asset row survive as history), and the
panel's claim "Nothing was overwritten" is literally true. But the button label — *"Replace the stored
object and retry"* — implies the product's media is replaced, while the operator actually ends up with two
gallery entries at the same position. Nothing in the UI says a second entry will appear.

**Minimal fix (copy only, no API change, ~1 string + 1 test):** in the 409 recovery panel and the retry
confirmation, state that the new file is added as a **new** media entry, that the previous entry stays
attached, and that the superseded entry can be detached from the product's media desk.

**Alternative (needs a contract decision):** after a replacement, detach the superseded association
automatically. That requires an existing detach endpoint and is outside the approved scope — for you to
decide, not for me to assume.

### F2 — MEDIA-UPLOAD-027 is real; fix only if you want it in this cycle (Low, cosmetic)

Mechanism reproduced in §C.5. **Minimal fix:** in `MediaUploadDropzone.jsx`, ignore `dragleave` whose
`relatedTarget` is still inside the container:

```js
const handleDragLeave = (event) => {
  if (event.currentTarget.contains(event.relatedTarget)) return;
  setIsDragging(false);
};
```

That is one guard plus keeping the existing "leave the zone clears the highlight" behaviour (already
asserted by the new DOM check). No other file changes.

### F3 — Employee media route does not enforce product assignment (Medium, **pre-existing, backend**)

**Evidence.** Live: employee 2 (`P7-EMP-002`) uploaded to `PF-W-TST-EMP-0003`, a DRAFT product assigned to
`P7-EMP-001` → **201, stored and attached**. The employee *media* guard checks only product status
(`ARCHIVED` / `PUBLISHED`) and `is_primary`; unlike the products PATCH route, it never compares
`assigned_employee_id`. No backend test covers this case.

**Proposed minimal fix (backend, so it needs your explicit approval):** mirror the products rule — resolve
the caller's `employee_code` and reject with the existing 403 when
`product.assigned_employee_id` is set and differs. This is outside the "do not modify backend files"
constraint that governed the implementation, and it is **not** required for the frontend work to function;
I have not touched it.

### F4 — Employee `is_primary` returns **422**, not the documented **403** (Informational)

Live: `422 BUSINESS_RULE_VIOLATION — "Employee uploads cannot become the primary image…"` from
`_require_employee_write_scope` (`app/api/v1/media.py:322-326`). The audit, plan and completion report all
say 403 (`media.py:1527`). No behavioural impact — the frontend never sends the flag, and the guard is
engaged either way — but the documentation should say 422. Fix is a documentation edit of that sentence
plus the frontend test comment; no code change.

### F5 — Completion-report arithmetic (Trivial)

"As documented in §D: "11 source + 1 test + 1 ignore" → actual **10 source + 1 test + 1 ignore = 12 modified**.
One-line correction to the report heading.

---

## E. What remains BLOCKED, and what it needs

| Item | Why blocked | What unblocks it |
|---|---|---|
| 1366 × 768 fold / scroll height (020) | No browser, no layout engine; jsdom reports no geometry | `npm run dev` and a real 1366×768 viewport |
| Visual confirmation of the drag flicker (027) | Same | A browser with a real drag |
| Screenshots of any state | No rendering surface | Browser |
| Confirmation-dialog interaction (016) | `ConfirmDialog` renders through a DOM portal **and** traps focus; unavailable without a full DOM | Browser (the wiring itself is covered by the existing unit test) |
| PostgreSQL media-integrity suite | `DATABASE_URL` not configured (1 skipped test) | A local PostgreSQL instance |
| Phase-6 real-media integration | Dataset not imported (23 skipped tests) | `audit:media` / Phase-6 import, then re-run |

---

## F. Statement of scope

- No file in the repository was modified during this verification; the 20 working-tree entries in §C.7 are
  exactly those delivered by the implementation.
- No backend file, route, permission rule, storage setting or media record was read-modify-written.
- All live testing ran against a temporary database and a temporary media root under `/tmp`; the repository's
  own storage directory is untouched.
- Nothing was committed, pushed, or deployed. The verification tooling (live server, frontend harnesses,
  jsdom) lives outside the tracked tree.

---

## G. Commands run (reproducible)

```bash
# environment
python3 -m venv /tmp/venv && /tmp/venv/bin/pip install -r backend/requirements.txt pytest pytest-asyncio
cd frontend && npm ci --no-audit --no-fund          # node_modules is not snapshotted
mkdir -p /tmp/vdom && cd /tmp/vdom && npm install jsdom    # OUTSIDE the repository

# backend suite (scenario 6)
cd backend && /tmp/venv/bin/python -m pytest <14 media suite paths> -p no:cacheprovider --tb=line

# live API for scenarios 1–3 (temporary DB + temporary media root)
PF_PORT=8011 /tmp/venv/bin/python /tmp/serve_media.py

# scenario 3 side effects, directly against the app
/tmp/venv/bin/python /tmp/probe_409.py
/tmp/venv/bin/python /tmp/verify_media_live.py

# scenarios 1, 2, 4 through the real frontend + real components
cd frontend
node --import ./scripts/node-loader/register.mjs scripts/.tmp/live-frontend-verify.mjs   # 10/10
node --import ./scripts/node-loader/register.mjs scripts/.tmp/live-form-verify.mjs        # 16/16
node --import ./scripts/node-loader/register.mjs scripts/.tmp/live-cancel-progress.mjs    # 7/7
node --import ./scripts/node-loader/register.mjs scripts/.tmp/live-employee-page.mjs      # 7/7
node --import ./scripts/node-loader/register.mjs scripts/.tmp/dom-verify.mjs              # 17/18 (1 = the 027 reproduction)

# scenario 7
git status --porcelain; git diff --stat; git status --ignored --porcelain
git worktree add --detach /tmp/pfv1-base2 f13199d && cd /tmp/pfv1-base2/backend && <same pytest>   # base comparison
```

---

## H. Recommended next actions

1. Decide on **F1** — the wording fix is one string and one test; the "auto-detach" variant is a contract change.
2. Decide whether **F2** (the one-guard drag fix) belongs in this cycle now that the defect is proven.
3. Decide on **F3** — it is a backend authorization inconsistency discovered during verification; it is not
   caused by this work and was deliberately left untouched.
4. Approve the documentation corrections (**F4**, **F5**), which are text-only.
5. When a browser is available, run the layout and visual checks in §E — those are the only remaining gaps.
