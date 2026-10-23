# PRATIKSHYA FASHION — Media Upload Remediation · Completion Report

**Surface:** Super Admin → Media → Upload Product Media (`/super-admin/media/upload`), shared with `/admin/media/upload` and `/employee/media/upload`
**Scope executed:** the 27-finding plan (`MEDIA_UPLOAD_REMEDIATION_PLAN.md`, §A–§J) under decisions **D1–D6**
**Branch:** `arena/dd367471-pfv1` (from `f13199d`)
**Date:** 23 October 2026
**Deployed:** no · **Committed:** no · **Media deleted:** none · **Production data touched:** none

---

## A. What this work changed, in one paragraph

The upload page now writes **once**. `POST /media/products/{id}/objects` already stores the object, creates the media asset and
attaches it to the product in a single committed transaction, and `title` / `alt_text` / `role` / `sort_order` / `is_primary`
are **create-only** server-side — so every operator choice travels on that one request and the redundant `/media/register`
call is gone from this page. Before a file is accepted the page reads what the product already has (registered set + product
record) and decides three things from server truth, not from a guess: whether a cover may be set, where the new files land in
the display order, and whether the product may receive media at all. An unanswered request (timeout, dropped socket,
cancellation) is reported as **unconfirmed** and reconciled against the media-set, never as a failure.

---

## B. Finding-by-finding status

Legend: **Fixed** = implemented and covered by an executed test · **Partial** = the client-side half is implemented, one
half is deliberately out of scope or unexercised · **Deferred** = not implemented, by decision · **Not reproduced** = no change made on suspicion.

| ID | Finding | Status | Where it lives now |
|---|---|---|---|
| **MEDIA-UPLOAD-001** | Existing primary image silently demoted | **Fixed** | `decidePrimary()` — primary only when the admin explicitly asks, or when the product has no cover at all, and only for the first file. Read-before-write supplies the facts. |
| **MEDIA-UPLOAD-002** | Shared form broke employee uploads | **Fixed** | Single call; `is_primary` is dropped for `scope="employee"` in **both** `mediaApi` and `productMediaService`, so it cannot be sent even if a caller asks. |
| **MEDIA-UPLOAD-003** | "Failed" after the server already stored and attached | **Fixed** | Second call removed; 201 is treated as committed; failures classified (`rejected` / `collision` / `timeout` / `network` / `auth` / `server` / `cancelled`). |
| **MEDIA-UPLOAD-004** | Registered media replaces the legacy image set in the DTO | **Partial** — client half fixed, projection deferred | The surface **blocks** the first registration for a legacy-only product (D4 strengthened), explains the consequence and offers a non-destructive way forward. `product_service.py`, DTO projections, the publishing gate and existing records are untouched. |
| **MEDIA-UPLOAD-005** | Selector snapshots an empty cache | **Fixed** | `useAdminProductSearch` asks the server (loading / ready / empty / error+retry). |
| **MEDIA-UPLOAD-006** | Only the newest 100 products searchable | **Fixed** | Server-side `q` + `page` + `pageSize`, real `total`, "N of Y" + **Load more**. |
| **MEDIA-UPLOAD-007** | Every image defaults to the `COVER` role | **Fixed** | New files default to `GALLERY`; the role remains an explicit per-file choice; role ≠ cover is stated. |
| **MEDIA-UPLOAD-008** | Alt text collected but not persisted | **Fixed** | `alt` → `alt_text` on the creating upload request; alt text is now required for images; metadata freezes once the row is stored (create-only server-side). |
| **MEDIA-UPLOAD-008-CAPTION** | Caption input has no persistence path | **Fixed** (input removed, D3) | No caption field, no backend caption feature added. |
| **MEDIA-UPLOAD-009** | Progress stuck at 0 % | **Fixed** | `uploadProgressPercent()` driven by real stage events, per-file bar + batch bar, capped at 99 until the batch is settled. |
| **MEDIA-UPLOAD-010** | No timeout / no cancellation | **Fixed** | Opt-in `timeoutMs` (180 s/file) and `signal` on `apiClient.request`; **Stop upload**; timeouts reconcile. |
| **MEDIA-UPLOAD-011** | Partial success not summarised; retry reprocesses successes | **Fixed** | `continueOnError` on the page; per-file summary (assigned / rejected / unconfirmed); only unsettled rows stay in the queue. |
| **MEDIA-UPLOAD-012** | Same filename + different bytes = 409 dead end | **Partial** | Explicit **"Replace the stored object and retry"** action re-sends `replace_existing=true` **for the colliding files only**, admin-only; employees get guidance. Not exercised against a live 409. |
| **MEDIA-UPLOAD-013** | Archived products accept media with a success message | **Partial** (as planned) | Status chip on every row and on the selected card; an ARCHIVED product warns before upload. Server policy unchanged by design. |
| **MEDIA-UPLOAD-014** | Duplicate selections inflate counts | **Fixed** | Duplicates rejected by `name+size+lastModified`; counts and ids come from the read-back. |
| **MEDIA-UPLOAD-015** | Submit enabled without a product | **Fixed** | Validation + disabled state with a stated reason; the product's context state also gates submission. |
| **MEDIA-UPLOAD-016** | Cancel ≠ Back; unsaved work lost | **Fixed** | One explicit destination (`{prefix}/media`), confirmation dialog whenever work is queued or in flight, `beforeunload` guard. |
| **MEDIA-UPLOAD-017** | Combobox not keyboard operable | **Fixed** | Full ARIA combobox: `aria-expanded/controls/autocomplete/activedescendant`, Arrow/Home/End/Enter/Escape/Tab, `aria-selected`, live count, outside-click dismissal. |
| **MEDIA-UPLOAD-018** | Repeated headings and oversized banner | **Fixed** | One page title; the panel keeps a single short second-level heading (**deviation:** the plan's "no panel heading" would have left an empty header band costing the very height M5 asks for); the banner is a one-line disclosure. |
| **MEDIA-UPLOAD-019** | Off-system colours; `text-sage` undefined | **Fixed** (form + queue) | `pf-success` / `pf-warning` / `pf-error` replace `amber-*`, `emerald-*` and the undefined `text-sage`. Two unrelated files still use `emerald-*` and were left alone. |
| **MEDIA-UPLOAD-020** | Too tall for a 1366×768 laptop | **Partial** | Compact dropzone once files are queued, sticky action bar, collapsed banner, tighter guidance. **Not measured in a browser.** |
| **MEDIA-UPLOAD-021** | No existing-media context before upload | **Fixed** | `loadProductMediaContext()` on product selection: count, cover source, next display position, archived warning. |
| **MEDIA-UPLOAD-022** | Success screen lacks per-file detail and product navigation | **Fixed** | Per-file rows (name → server id → role · cover); primary action **Open product media** → `{prefix}/products/{id}/media`; secondary **Media registry**. |
| **MEDIA-UPLOAD-023** | Fabricated SKU (`PF-${idx+1}`) | **Fixed** | The real SKU or "SKU unavailable". |
| **MEDIA-UPLOAD-024** | Unreachable "Preparing assets…" | **Fixed** | Branch deleted; the remaining states are real (`running` / `refreshing`). |
| **MEDIA-UPLOAD-025** | Incomplete file-count / size / dimension guidance | **Fixed** | 24-file cap stated and enforced, running file count + total size, "≤ 8,000 px per side, ≤ 50 MP", per-file size. Server remains the authority. |
| **MEDIA-UPLOAD-026** | Dropdown dismissal + file-input label | **Fixed** | Outside-click + Escape close; the "Select Files" label is bound to `#media-file-input`. |
| **MEDIA-UPLOAD-027** | Drag highlight may flicker | **Not reproduced — no change made** | The drag handlers are byte-for-byte unchanged. Reproduction requires a real browser (steps preserved in §G). |
| **N-01** (new) | Employee portal has no product list, so employees cannot choose a product | **Not fixed — documented** | `productSource="register"` with an honest empty state; `initialProductId` (`/employee/media/upload?product=…`) is the supported entry path; no new endpoint was added (D5). |

---

## C. Decisions, as executed

- **D1 — single write.** All supported metadata rides on the upload request; the page's `/media/register` call is gone.
  `apiRegisterMediaObject` is **retained** and still exported for callers that legitimately register an existing key.
- **D2 — employee primacy impossible.** `is_primary` is stripped in the adapter *and* the service for employee scope, and the
  employee UI contains no cover control. Role and sort-order behaviour is pinned by explicit regression tests (§E).
- **D3 — caption removed.** No backend caption work.
- **D4 (strengthened) — block, don't warn.** A product whose imagery exists only in the legacy columns and which has no
  registered set is refused: the explanation, the fact that *nothing was modified*, and two non-destructive exits (open the
  product's own desk / re-check). An unreadable product record is treated as **unverified**, which also blocks.
  `product_service.py`, catalogue DTO projections, the publishing gate and existing product/media rows are untouched.
- **D5 — no employee endpoint.** Register mode + `initialProductId` only; the gap is named in the UI and in this report.
- **D6 — 180 s per file, 24-file cap.** `timeoutMs` / `signal` are strictly opt-in: a request that does not ask for them
  creates no `AbortController` and sends no `signal`.

---

## D. Files changed

**Modified (10 source + 1 test + 1 ignore):**

| File | Change |
|---|---|
| `frontend/src/services/media/productMediaService.js` | Single-call orchestration; `MEDIA_FAILURE_KINDS`; `classifyMediaFailure` / `isAmbiguousMediaFailure`; `MEDIA_UPLOAD_TIMEOUT_MS`; pure helpers `nextSortOrder`, `hasExistingCover`, `legacyCatalogueOnly`, `decidePrimary`, `uploadProgressPercent`, `matchReconciledItems`; `loadProductMediaContext`; `UNCONFIRMED` stage; `continueOnError` / `signal` / `perFile` options (default behaviour unchanged for existing callers). |
| `frontend/src/services/api/mediaApi.js` | `apiUploadProductMediaObject` accepts `role`, `sortOrder`, `isPrimary`, `title`, `altText`, `replaceExisting`, `signal`, `timeoutMs`; employee scope never sends `is_primary`. |
| `frontend/src/services/api/apiClient.js` | Opt-in `timeoutMs` / `signal` in `request()`; `TIMEOUT` and `CANCELLED` codes; timer and listener cleaned up in `finally`. |
| `frontend/src/components/media/MediaUploadForm.jsx` | Read-before-write, D4 block, cover intent, single submit, per-file progress, partial summary, 409 recovery, cancel guard + `beforeunload`, sticky actions, success view with product navigation, caption removed. |
| `frontend/src/components/media/MediaUploadQueue.jsx` | Caption field removed; stage copy incl. **unconfirmed ≠ failed**; read-only once stored; per-file progress bar; tokens; alt-text guidance. |
| `frontend/src/components/media/MediaUploadDropzone.jsx` | `compact` mode, cap + dimension guidance, drag handlers deliberately unchanged (027). |
| `frontend/src/components/media/MediaProductSelector.jsx` | Server search (debounced, paged), ARIA combobox, status chips, archived warning, real SKU or "SKU unavailable", `productSource`, outside-click/Escape. |
| `frontend/src/config/mediaTypes.js` | Additive `UPLOAD_LIMITS`, `DEFAULT_PRODUCT_UPLOAD_ROLE` (all existing exports untouched). |
| `frontend/src/services/media/uploadValidation.js` | Additive `fileSignature`. |
| `frontend/src/pages/admin/media/AdminMediaUpload.jsx` | Panel heading de-duplicated (018). Props unchanged. |
| `frontend/tests/phase7ProductMedia.test.js` | Six assertions rewritten because the behaviour deliberately changed (two-step → single write); new tests for continue-on-error, abort, timeout, collision, employee primacy. |
| `frontend/.gitignore` | `tests/` → `tests/*` with four negations, so the new approved suites can be version-controlled (the directory was ignored wholesale while existing suites were already tracked). |

**New (5):** `frontend/src/hooks/useAdminProductSearch.js`,
`frontend/tests/mediaUploadContract.test.js`, `frontend/tests/mediaUploadReconciliation.test.js`,
`frontend/tests/mediaProductSearch.test.js`, `frontend/tests/mediaUploadSurface.test.js`.

**Not changed:** any backend file, any route, any API path, any authorization rule, storage configuration, checksum
behaviour, publishing rule, catalogue infrastructure, existing media record, `ProductMediaManager.jsx`,
`MediaPlacementSelector.jsx`, `AdminMediaProductMapping.jsx`, `catalogRepository.js`, `useProducts.js`.

---

## E. Tests — commands and actual results

Environment: Node v22.22.3, `frontend/node_modules` restored with `npm ci` (130 packages, exit 0).

```
cd frontend && npm test
→ # tests 823   # pass 812   # fail 10
```

The 10 failures are **pre-existing and unrelated**. Verified by running the same command in a detached worktree at the
untouched base commit `f13199d`: `# tests 748 · # pass 737 · # fail 10` — the identical ten (customer account ownership;
`SUPER_EMPLOYEE` routing/account-ladder suite; `tests/unifiedLogin.test.js`, which fails to import `isSuperEmployeeAccount`
from `src/config/adminAccess.js` at the base commit too). No media, upload, product-search or terminology test fails.

Media-specific suites, executed individually:

| Command (from `frontend/`) | Result |
|---|---|
| `node --import ./scripts/node-loader/register.mjs --test tests/phase7ProductMedia.test.js tests/mediaUploadContract.test.js tests/mediaUploadReconciliation.test.js tests/mediaProductSearch.test.js tests/mediaUploadSurface.test.js` | **105 / 105 pass** |
| `... --test test/mediaAccessPermissions.test.js test/adminMediaRegistry.test.js test/mediaSecurityContracts.test.js test/mediaTerminology.test.js` | **66 / 66 pass** |
| `... --test tests/phase6MediaStorage.test.js tests/marketingAvifUpload.test.js tests/phase3ProductMediaHonesty.test.js` | **53 / 53 pass** |

New coverage, by concern:

- **Transport** (`mediaUploadContract`, 17): no-opt-in requests carry no `signal`; `TIMEOUT` vs `CANCELLED`; metadata on the
  same multipart body; `sort_order: 0` sent explicitly; no invented media id; employee `is_primary` never sent;
  `replace_existing` only for the chosen file; `loadProductMediaContext` verified/unverified paths and the employee routes.
- **Rules** (`mediaUploadReconciliation`, 15): sort-order append; progress cap; cover/primary matrix incl. employee
  impossibility; legacy-only block, registered-set exception, unknown-record conservatism; reconciliation by exact key and
  by size+mime+stem, ambiguity left unmatched, no double-claiming; failure classification.
- **Search** (`mediaProductSearch`, 17): `GET /admin/products` with `q`/`page`/`pageSize`; real `total`; honest empty; error
  surface; hook debounce/stale-discard/paging/off-switch; combobox ARIA, keyboard set, SKU honesty, archived warning.
- **Surface** (`mediaUploadSurface`, 22): SSR renders of queue (no caption, bound labels, unconfirmed ≠ failed, locked row),
  dropzone (input id, cap copy, compact mode), picker (combobox, archived product, "SKU unavailable"), and the whole form
  through `MemoryRouter` for admin and employee portals.
- **D2 regression (role/sort/primary):** `queue order, roles, sort order and alt text land on the single upload payload`,
  `the batch never invents a role — an unset role stays unset`, `employee batch primacy stays off even when firstIsPrimary is
  requested`, `employee scope never carries is_primary, even when asked`, plus the `decidePrimary` and `nextSortOrder` tables.

**Backend tests: specified, unrun.** `pytest` and `fastapi` are absent from this environment
(`ModuleNotFoundError: No module named 'fastapi'`, `No module named pytest`), and **no backend file was modified**, so
nothing in this change is gated on that suite. The relevant backend expectations (single-commit registration, employee
`is_primary` refusal at `media.py` 1527, create-only metadata) were read from source, not executed.

---

## F. Build

```
cd frontend && npm run build
→ vite v7.3.2 · 2764 modules transformed · ✓ built in 8.51s
→ dist/index.html 3,096.10 kB │ gzip: 972.95 kB
```

---

## G. Not verified here, and how to verify it

No browser and no live API were available, so these remain **manual** checks — they are not claimed as passing.

- **M5 — 1366×768 fold:** product selector + first file row visible without scrolling. Layout was tightened (compact
  dropzone, sticky bar, disclosure banner) but not measured.
- **M7 — MEDIA-UPLOAD-027 (drag flicker):** drop a file, then drag a second file across the dropzone's inner text and icon
  and back out. If the highlight flickers, fix with a drag-enter counter or a `relatedTarget` containment check — and only
  then. Code unchanged.
- **Live 409:** upload two different files with the same name to one product; confirm the collision panel appears, that
  nothing is overwritten, and that the explicit replace action re-sends with `replace_existing=true`.
- **Live employee upload:** open `/employee/media/upload?product=PF-W-…` with a `media.upload` grant; confirm the request
  body carries no `is_primary` and the media lands in the staff-visible set.
- **D4 block:** open a product that has legacy `image`/`additional_images` and no registered media; confirm the block
  appears, the submit button is disabled, and no request is made.
- **Timeout path:** throttle the network past 180 s (or shorten `MEDIA_UPLOAD_TIMEOUT_MS` locally) and confirm the row reads
  "Not confirmed — verifying" followed by a reconciliation result, never "Failed".

---

## H. Rollback

Revert the eleven source files in §D (`git checkout -- frontend/src frontend/tests/phase7ProductMedia.test.js`). Nothing
else is involved:

- no schema, migration, stored object or media/product row was modified, so there is no data to unwind;
- the server has always auto-registered on upload, so the removed `/media/register` call was never the thing creating the
  record — reverting cannot orphan media;
- the employee lane is untouched server-side; reverting only restores the client behaviour that requested primacy.

`ProductMediaManager.jsx` (the other caller of the batch service) was verified against the new contract: it reads stage
callbacks and `result.ok`, never `result.media`, and its default (`continueOnError` unset → abort at the first failure) is
preserved and covered by the phase-7 suite.

---

## I. Honest summary of what is *not* finished

1. **MEDIA-UPLOAD-004b** — the catalogue projection question (does registering the first asset *should* replace legacy
   imagery?) remains a product decision. This implementation blocks that step rather than answering it.
2. **MEDIA-UPLOAD-012** — the replace flow is implemented and unit-tested, but a real 409 has not been driven end to end.
3. **MEDIA-UPLOAD-020 / 027** — layout height and the drag highlight need a browser.
4. **N-01** — employees still cannot browse the catalogue from this page; only the pre-targeted entry path is supported.
5. **Backend suite** — unrun in this environment (no Python dependencies), and unaffected by this change.
