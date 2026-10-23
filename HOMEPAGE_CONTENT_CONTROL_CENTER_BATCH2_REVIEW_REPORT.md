# PRATIKSHYA FASHION — Homepage Configuration Remediation, Batch 2 — Independent Review

**Scope:** audit findings F-10, F-09, F-23, F-16, F-11, F-03 in the working tree (Batch 1 baseline preserved).
**Verdict: APPROVE WITH EXPLICIT GAPS.**
Date: 2026-10-23 · Branch: `arena/c72d2349-pfv1` @ `43bf640` · working tree, uncommitted.
Reviewed artefacts: `HOMEPAGE_CONTENT_CONTROL_CENTER_BATCH2_REPORT.md`, `…_DETAILED_AUDIT.md` §7.1/§8.G–§8.I, the complete diff, and the running application.

---

## 0. Verdict in one paragraph

The Batch 2 implementation is faithful to the six findings and respects every stated boundary: **no backend, schema, payload-shape, permission, publishing-rule, section-key, slot-capacity, storefront or dependency change**; Batch 1's R-1 and V-1 are intact; no test was deleted, skipped or weakened. The independent suite (17→**34** tests) and real-browser runs found **three genuine defects that the original tests missed**, all of which are now fixed with regression coverage: a partial multi-slot product save re-targeted the retry at the wrong slot and disabled its own retry button (F-11), a pending reorder in one group was silently discarded when another group was moved (F-16), and composed failure sentences printed `..` (copy). The remaining gap is explicit: **F-11 multi-row creation could not be exercised in a real browser** because the seeded catalogue contains **0 products** and creating catalogue data was out of scope; its request shapes, revision chaining, capacity, duplicate prevention and first/middle/final failure behaviour are covered by the component suite against the real API clients. No production permissions were changed during this review, every seeded row was restored, and only a temporary test account created during implementation carries a custom grant set.

---

## 1. Method

1. Inspected `git status`, the full unstaged diff, every untracked file, `git diff --check`, and the Batch 1 baseline (report + review report).
2. Re-read `SectionContentEditor.jsx`, `publishModel.js`, `PublishedProductPicker.jsx`, `AdminMarketingMedia.jsx`, `AdminMediaLibrary.jsx`, `BackendHomeHeroPanel.jsx`, and the modified tests line by line.
3. Wrote an additional review suite (17 new tests) covering the gates the batch suite did not: first/middle/final create failures, multi-slot staging, per-group reorder, stale reorder, section-step publish failure, stale publish, double submission, Save & publish with a missing prerequisite, the positive F-09 boundary, unknown section list, the defensive slot fallback, the hero registration permission boundary, and a rejected save on Save & publish.
4. Ran those tests against the current tree **before** changing code: 4 failed, reproducing the two interaction defects and one invalid test premise (see §5).
5. Applied minimal corrections, added regression assertions, and re-ran all frontend suites, the backend contract/RBAC suites, and the production build.
6. Re-ran the affected workflows in Chromium against the real Vite app, FastAPI backend and PostgreSQL, with network capture, failure injection and responsive viewports.
7. Restored the seeded records and verified the final state through the API.

---

## 2. Diff verification

**Working tree:** 9 modified tracked files, 9 untracked files before this report (10 including it), nothing staged, no merge conflicts. `git diff --check` is clean. Total tracked delta **+586 / −180** (Batch 1 report accounted for +258/−150 of that; Batch 2 adds **+328/−30**).

| File | Status | Batch | Review note |
|---|---|---|---|
| `frontend/src/components/admin/homepage/SectionContentEditor.jsx` | modified, +360/−66 | 1 + 2 | Publish summary/sequence, activation reason, staged products, per-group reorder, registration hint. No request shape changed. |
| `frontend/src/components/admin/BackendHomeHeroPanel.jsx` | modified, +52/−2 | 1 + 2 | Batch 1 preview/tabs; Batch 2 inline `PlacementAssetPanel` (admin-only, `media.upload`). |
| `frontend/src/pages/admin/media/AdminMarketingMedia.jsx` | modified, +43/−11 | 1 + 2 | `allowedSlots` gating, header target, `registerHref`; Batch 1 HTTP-status labels. |
| `frontend/src/pages/admin/media/AdminMediaLibrary.jsx` | modified, +13/−2 | 2 | `#placement-art` id, hash effect, `scroll-mt-24`. Existing ids/aria unchanged. |
| `frontend/src/components/admin/homepage/PublishedProductPicker.jsx` | modified, +30/−7 | 2 | Multi-select props, already-used disabling, capacity lock, staging line; inspection mode unchanged. |
| `frontend/src/components/admin/homepage/__tests__/homepageAllSections.test.js` | modified, +28/−10 | 1 + 2 | Reorder tests now commit with **Save order**; dead-type test asserts disabled tabs and zero writes. Test count unchanged (28). |
| `frontend/src/components/admin/homepage/__tests__/homepageContentControl.test.js` | modified, +13/−3 | 1 | Batch 1 accuracy fixes only; no Batch 2 hunk. Test count unchanged (31). |
| `frontend/src/components/admin/homepage/SectionPreview.jsx` | modified, +25/−79 | 1 | Preview model, no configure gate, placeholders, `.pf-root` (V-1). |
| `frontend/src/services/homepage/homepageContentModel.js` | modified, +22/−0 | 1 | Additive status-label helpers. No existing export changed. |
| `frontend/src/components/admin/homepage/publishModel.js` | **new** 134 lines | 2 | Pure planning/summary/blockers/group mapping. |
| `frontend/src/components/admin/homepage/__tests__/homepageBatch2.test.js` | **new** 781 lines, 34 tests | 2 | 17 batch tests + 17 independent-review tests. |
| `frontend/src/components/admin/homepage/{previewModel.js,HeroPreview.jsx}` + `__tests__/homepageBatch1.test.js` | **new** | 1 | Batch 1 additions, unchanged in this review. |
| `HOMEPAGE_CONTENT_CONTROL_CENTER_*.md` | **new** | — | Audit, Batch 1 report/review, Batch 2 report (+§15 addendum) and this report. |

**Boundary checks**
- `git status` shows **zero** changes under `backend/`, `home-page/`, `frontend/src/components/storefront/`, `frontend/src/components/customer/`, `package.json`, lockfiles, migrations or RBAC/permission files.
- No new endpoint, DTO, permission code, section key, slot key/capacity or publish rule exists in the diff. `POST /items` remains one row per request; `PUT /reorder` keeps its payload; `check_media_grant` is untouched on the server.
- Automatic retries: none. Every failure path stops and requires an explicit operator action.

**Batch 1 preservation**
- **R-1** (`setEditing(null)` when the row being edited disappeared): present in `SectionContentEditor.jsx` (reconcile path, `setEditing(null)` at line 296); pinned by `F-15 · a deleted entry is re-based as a new entry, never PATCHed by an undefined id` — **passes**.
- **V-1** (`.pf-root` on both preview wrappers): present in `SectionPreview.jsx:82` and `HeroPreview.jsx:45`; pinned by `V-1 · section and hero previews mount inside the '.pf-root' storefront scope` — **passes**.
- Batch 1's preview/draft/conflict/status work was not altered by the Batch 2 hunks or by this review's corrections.

---

## 3. Test-integrity audit

| Check | Result |
|---|---|
| Tests deleted | **None.** Top-level test counts vs `HEAD`: `homepageAllSections` 28 → 28 (one test renamed/re-scoped), `homepageContentControl` 31 → 31. |
| Tests skipped | **None added.** The suite has no `todo`/`skip` in the changed files. |
| Assertions weakened | **No.** The re-scoped dead-type test now asserts *more* (disabled tab, zero `PUT`s, live type still enabled); the old defensive message is covered by a new review test. Reorder tests gained "no request until Save order". |
| New coverage | **17 tests** added during this review (verified by diffing the pre-review copy of the file): F-10 ×5 (a rejected save never starts the publish loop, section-step failure, stale revision, double submission, Save & publish with a missing prerequisite); F-11 ×4 (first create fails, final create fails without duplication, partial multi-slot slot retention, capacity lock); F-16 ×3 (two pending groups, stale reorder save, reconcile that removed rows); F-23 ×3 (failed section list, dead-tab note, empty-slot fallback); F-09 ×1 (positive `media.assign` boundary); F-03 ×1 (hero panel follows `media.upload`). |
| Mock fidelity | Improved, not loosened: the reorder mock now scopes PRODUCT membership to the payload `slotKey` (mirrors the server), instead of accepting any PRODUCT row. |
| Existing suites | `npm test` test count unchanged at **850**. |

---

## 4. Finding-by-finding verdicts

### F-10 — Publish summary and one sequenced publish path · **PASS**

**Implementation check.** `publishSummary` derives the sentence and four-step checklist from the section payload; `nextPublishStep` yields entry activations first, then section activation; each iteration consumes `section.revision` from the previous response; a 128-step guard exists; the loop stops on the first rejection and never retries. `Save & publish` saves with the unchanged create/patch payloads, then re-evaluates blockers against the saved snapshot. No new endpoint or body shape.

**Independent evidence (real browser + network capture; component-suite rows are marked)**

| Scenario | Observed |
|---|---|
| One-step publish (categories, all entries active, section inactive) | exactly **one** `PUT /admin/homepage/sections/categories {"expectedRevision":20,"isActive":true}` → `Live on the storefront · 2 entries, all active.` |
| Two-step publish | `PATCH …/items/4a6cfc17… {"expectedRevision":23,"isActive":true}` then `PUT …/categories {"expectedRevision":24,"isActive":true}` → live; the second revision came from the first response |
| Failure on the section step (injected 503, one attempt) | 1 intercepted `PUT`, **1** write attempt, stays inactive; alert `Publish stopped: Simulated section failure. Nothing is being retried.` |
| Failure on the entry step (422, component suite) | exactly 1 attempt; the server reason is shown verbatim; no section write |
| Stale revision (concurrent API write bumps the revision) | 1 failed `PUT` → 409; `Publish stopped: Content changed. Reload and reconcile before retrying. Nothing is being retried.`; conflict panel shown; no retry |
| Double submission (`dblclick`) | exactly **one** `PUT` |
| Save & publish (sarees TEXT, empty slot) | `POST …/items {"slotKey":"silk-classics","isActive":false,…}` then `PATCH …/items/65a051eb… {"expectedRevision":23,"isActive":true}`; summary `5 entries`; cleanup `DELETE …?expectedRevision=24`; summary back to 4 |
| Save & publish with a missing prerequisite (no `media.assign`) | one `POST`, nothing published; `Saved. Not published yet: This section has an active media entry…` |
| Save & publish when the save itself is rejected (422) | exactly 1 `POST`, **0** `PUT`s, no row created, section stays inactive, server reason shown |

Repeated clicks are blocked by the synchronous `locked` ref plus disabled buttons; the double-click test confirms one sequence.

### F-09 — Permission-aware publishing · **PASS**

- `sectionActivationReason` is rendered in `#activation-reason` and referenced by `aria-describedby` on **Activate section**; `publishBlockers` includes the same rule for **Publish section**.
- Real browser with an actor holding `marketing.view`, `marketing.manage`, `media.view` (no `media.assign`, no `media.upload`): reason text shown; `Activate section` disabled with `aria-describedby="activation-reason"`; `Publish section` disabled with `aria-describedby="publish-reasons"` and the identical sentence; **0 writes** other than `POST /auth/staff/sign-in`; the header `Register placement art` link is correctly absent.
- Positive boundary: an actor holding `media.assign` sees no `#activation-reason`, and both Activate and Publish are enabled (component test). Server enforcement (`check_media_grant`) is unchanged and still the authority.
- Reviewer correction to the batch's own test: `media.assign` expands to `media.manage`, which implies `media.upload`; the "no upload" boundary must be tested with `media.view`-only, which the new test does. The implementation was already correct.

### F-23 — Unsupported section types · **PASS**

- Tabs derive from `allowedSlots`; zero-slot types render `MEDIA · none` (etc.), disabled, `aria-describedby="type-none-note"`.
- Browser: bestsellers tabs `[{MEDIA · none, disabled:true},{PRODUCT},{TEXT}]`; clicking the dead tab = **0 writes**; `#type-none-note` present.
- Initially unconfigured section: covered (bestsellers is unconfigured in the fixture) — the tab is disabled before any configure write.
- Unknown/failed list: new test mounts the page with `fail.list` and asserts **no** tab is disabled and no `· none` label appears. A failed list does not silently block valid types.
- Defensive fallback (`No {kind} slot is registered…`) is now covered directly by a new test rather than being left unreachable.

### F-16 — Batch reorder and "Move down" · **PASS after correction**

- Arrows change only local state; **Save order** sends one `PUT /reorder` with the server's group key and exact membership; **Cancel** sends nothing; singleton groups expose no arrows.
- **Unsaved-order guards measured in the browser** (sarees MEDIA, 0 writes throughout): with no pending work, a dispatched `beforeunload` is not cancelled; after one local move it is cancelled (`defaultPrevented:true`), every other section tab is `disabled`, and the status line reads `Pending changes — save or cancel before switching sections.`; **Cancel order changes** restores `lookbook-1,2,3`, re-enables the tabs, clears the warning listener, and writes nothing. This closes the “section switching / unload warning” checks.
- Browser (sarees MEDIA): local move = **0 writes**, visual order 2,1,3; Save order = one `PUT … {"expectedRevision":25,"slotKey":"lookbook","contentType":"MEDIA","itemIds":[3 ids]}`; restore = one request; cancel = 0 writes and the saved order intact.
- Stale revision: one `PUT` → 409, composed order preserved, conflict panel shown, no retry.
- **Correction:** pending orders are now kept per group, so moving rows in two different PRODUCT slots cannot discard the first group's composition; each group has its own commit. A reconcile that removes rows keeps the order visible but disables the doomed save with an explicit sentence and leaves Cancel available. Covered by two new tests.

### F-11 — Multi-select staging → N sequential creates · **PASS (component) — BROWSER BLOCKED**

- Implementation check: staged set, `Selected N … will be added as N separate entries`, already-used products disabled in the current slot, capacity lock, one `POST /items` per product with `isActive:false`, revision chained per response, stop on first rejection, no retry, exact saved/remaining report, staging preserved.
- Component evidence: three staged products → exactly 3 POSTs with product ids `PROD-1..3` and revisions `0,1,2`; first-create failure → 1 attempt, 0 saved, 3 remain staged; middle failure → 2 attempts, 1 saved, 2 remain; final failure → 3 attempts, 2 saved, 1 remains, then reconcile + retry sends exactly one POST for `PROD-3` with the reloaded revision and does not duplicate the earlier rows; two-seat slot locks the third tile; already-used product is disabled.
- **Correction:** after a partial save the batch's slot is restored (previously the retry silently re-targeted the first open slot) and the restored staging is marked pending (previously the "Add N products" button was disabled). New test stages to `men-products`, fails the second create, reconciles, and proves the retry posts to `men-products` with the reconciled revision.
- **Browser: BLOCKED.** The catalogue contains **0 products** (`GET /products` total 0, admin products total 0), so no eligible product can be staged. Creating catalogue data without approval was excluded. The browser gate did **not** open the staging surface, so this verdict rests on the component suite alone and no browser claim is made for the multi-row loop.

### F-03 — Real placement-media registration entry point · **PASS**

- Header action targets `${prefix}/media#placement-art`; the media library opens the disclosure, scrolls it into view and preserves existing ids/aria. Browser: path `/super-admin/media`, `hash:"#placement-art"`, panel top 632 px, `aria-expanded:"true"`.
- Hero MEDIA tab mounts the existing `PlacementAssetPanel` unchanged: upload+register, one file input, register-by-key; empty submit → `Choose an image file first (JPEG, PNG, WebP or AVIF).` with **0 writes**.
- **Idempotent registration executed live:** registering the already-attached `hero/hero1.png` sent a real `POST /media/register-placement` (`object_key=hero/hero1.png`) and returned `Registered hero/hero1.png — already registered (no duplicate created).`; the durable asset count stayed **7 → 7**.
- **Upload + register executed end to end:** a 1×1 PNG was chosen in the hero panel's placement input and submitted. The browser issued `POST /media/objects` (multipart), then `POST /media/register-placement`, then refreshed `GET /admin/marketing/media?placement=HOME_HERO`; feedback read `Uploaded and registered hero/review-tile.png — newly registered. It is now visible to the homepage media pickers.`; the asset count moved **7 → 8** and the object appeared under `hero/`. This closes the “successful upload/registration” check.
- **Cleanup of that upload:** `DELETE /media/objects/hero/review-tile.png` returned **503 `DATABASE_SCHEMA_ERROR`** (“A required database table or column is missing. Please run: alembic upgrade heads”) — the same pre-existing migration divergence as `test_migration_graph_one_new_head`, not a Batch 2 path. The review-created row (`5553efe2-…`) and the stored object were therefore removed directly, leaving **7 assets** and exactly the seven seed keys.
- Permission gating: the disclosure requires an admin session plus `media.upload`; the `media.view`-only actor (component test) sees **0** disclosures and **0** header links, and the real limited admin without `media.upload` also showed **0** in the browser. `POST /media/objects` and `/media/register-placement` are unchanged.
- **Employee boundary executed live:** signing in as the employee account and opening `/employee/media/marketing` rendered **0** placement disclosures, **0** “Upload and register” buttons and **0** file inputs; the only request was `POST /auth/staff/sign-in`. Directly requesting `/super-admin/media#placement-art` redirected to `/login?returnTo=%2Fsuper-admin%2Fmedia`. The 1 “Add registered media” control that remains is the pre-existing attach-existing-asset action, not registration.

---

## 5. Defects found and minimal corrections

All corrections are confined to `SectionContentEditor.jsx` and its test file. No other shipped file changed during the review.

| # | Defect | Reproduction (before fix) | Minimal correction | Regression test |
|---|---|---|---|---|
| 1 | **F-11** partial multi-slot save re-targeted the retry and disabled it | Stage two products into `men-products`; first create succeeds, second rejected. The refresh cleared the slot, so the select read `women-products`; `dirty` was cleared, so `Add N products` was disabled although the message said the rows remained selected. | On the failure path, restore `batchSlot`, re-stage the unsaved rows and set `dirty` after `afterWrite` (the refresh runs first). | `F-11 · a partial multi-slot save keeps the staged rows aimed at the same slot` — asserts slot, staging, blocked-until-reconcile, then a retry that posts `PROD-2` to `men-products` with the reconciled revision. |
| 2 | **F-16** a pending order in one group was discarded when another group moved | Section with two PRODUCT slots; move in slot A, move in slot B → only **one** Save-order bar existed and the first composition was silently lost. | Track pending orders per group (`orders` map), render a commit bar per pending group, restore the other groups after a successful commit, and block a stale commit after a reconcile that removed rows. | `F-16 · two pending groups are tracked separately…` (two bars, one request each, exact payloads); `F-16 · a reconcile that removed rows…` (stale guard + Cancel). |
| 3 | **Copy** composed failure sentences ended in `..` | Browser failure injection: `Publish stopped: Simulated section failure.. Nothing is being retried.` | `sentence()` trims trailing full stops before the composed sentence appends its own. | Assertions now pin `…failure. Nothing is being retried.` and `…Duplicate product in slot. No retry…`; browser re-check shows a single full stop. |

Review-test premise corrected (not product defects): the F-03 boundary actor cannot hold `media.assign` (it implies `media.upload` through the RBAC model), so the test now uses a `media.view`-only admin; the F-11 final-create retry correctly requires an explicit reconcile, so the test reconciles before retrying.

---

## 6. Test results and baseline comparison

| # | Command (from `frontend/` unless noted) | Result | Baseline |
|---|---|---|---|
| 1 | `node --import ./scripts/node-loader/register.mjs --test src/components/admin/homepage/__tests__/homepageBatch2.test.js` | **34 tests, 34 pass** | 17/17 before review (17 added) |
| 2 | `… --test src/components/admin/homepage/__tests__/*.test.js` | **172 tests, 171 pass, 1 fail** — only `section inventory matches all twelve reference components in order` (`home-page/` ENOENT) | was 171/170/1 before the new test; same single pre-existing failure |
| 3 | `… --test` on all storefront + design-system test files | **186 / 186** | 186 / 186 |
| 4 | `npm test` | **850 tests, 839 pass, 10 fail, 1 skipped** | identical |
| 5 | `npm run build` | **success**, `dist/index.html 3,118.94 kB │ gzip 978.13 kB` (8.87 s) — no shipped code changed afterwards; the only later edit is a test file | Batch 2 pre-review 3,118.52 / 977.89; Batch 1 3,107.68 / 975.24 |
| 6 | `backend`: `pytest verification/unit/test_homepage_content.py tests/unit/test_marketing_media.py tests/unit/test_admin_consolidation_rbac.py` | **113 passed, 1 failed** — `test_migration_graph_one_new_head` | pre-existing; Batch 6 item F-26 |
| 7 | `pytest verification/integration/test_homepage_disposable_pg.py` | **1 skipped** — “No explicitly identified disposable PostgreSQL target; no database connection attempted” | expected |
| 8 | Batch 1 targeted checks: R-1 test, V-1 test | **pass** | — |

Ten `npm test` failures, the skip, and the inventory failure are unchanged pre-existing items; no test was skipped or loosened to reach these numbers.

---

## 7. Browser and network evidence

Chromium (Playwright), real Vite app (`:5173`), real FastAPI (`:8000`), real PostgreSQL. Every write below is from captured network requests; all screenshots are in `/tmp/shots/` (`B2R-*.png`).

| Workflow | Evidence |
|---|---|
| F-10 one-step | one `PUT …categories {expectedRevision:20,isActive:true}`; summary → live |
| F-10 two-step | `PATCH item {23}` → `PUT section {24}`; live |
| F-10 failure at the section step | 1 intercepted PUT, 1 attempt, stays inactive; single-full-stop alert |
| F-10 stale revision | 1 attempt → 409, conflict panel, no retry |
| F-10 double click | 1 `PUT` |
| F-10 Save & publish | `POST` (inactive) → `PATCH` (active); cleanup `DELETE`; summary 4 → 5 → 4 |
| F-16 | local 0 writes; Save order one `PUT` with exact ids; restore one `PUT`; cancel 0 writes; `beforeunload` cancelled and other tabs disabled while pending, cleared after cancel |
| F-23 | `MEDIA · none` disabled; click 0 writes; note present |
| F-03 landing | `/super-admin/media#placement-art`, panel top 632, expanded |
| F-03 hero inline | disclosure 1; file input 1; empty submit 0 writes; real `POST /media/register-placement` idempotent success; real upload `POST /media/objects` → `POST /media/register-placement` → 7→8 assets, cleaned back to 7 |
| F-03 gating | browser: limited admin (no `media.upload`) → 0 disclosures, 0 header links; employee session → 0 disclosures, 0 upload controls, 0 file inputs, `/super-admin/...` redirects to `/login`; component test: `media.view`-only actor likewise |
| F-09 | reason + disabled Activate/Publish with `aria-describedby`; 0 writes besides sign-in |
| F-11 | no browser evidence; 0 products in the catalogue — **BLOCKED** |
| Responsive | 1920×1080, 1366×768, 768×1024, 390×844: **0 px overflow**, summary + 4 checklist items each |
| Console | no page errors; no failed application requests (only the sandbox's blocked Google Fonts request in an earlier run) |

---

## 8. Data safety

- **Categories** restored: `isActive:false`, entries `intro` (TEXT) and `women` (MEDIA) active — content identical to the seed. Revisions advanced (11 → 29) by the exercised publishes; revisions are expected to change and no content was altered.
- **Sarees** restored: `isActive:true`, 4 entries, lookbook order **1, 2, 3**, intro text `Six yards,three generations` unchanged. Revisions advanced 17 → 27.
- The temporary "Review publish gate" TEXT entry was created and deleted (`POST` + `DELETE`); no leftover rows were found by API inspection.
- **Media assets:** 7 before the tests. Idempotent registration of `hero/hero1.png` left it at 7; the deliberate upload test added `hero/review-tile.png` (7 → 8) and the review removed that row plus its stored object, returning to **7** (keys: `hero/hero1..3.png`, `marketing/media1..4.png`). No review-created asset remains.
- **Test accounts:** `batchnoassign.admin@pratikshyafashion.com` still carries the custom three-capability grant set introduced during implementation (`marketing.view`, `marketing.manage`, `media.view`); this review did not change it. `batch.editor.employee@pratikshyafashion.com` remains an implementation artefact. Both are local test data, not production.
- No catalogue data was created; no product rows exist before or after.
- Nothing was reset, stashed, reverted, committed, pushed or deployed.

---

## 9. Remaining risks and blocked checks

| Item | Status |
|---|---|
| **F-11 multi-row creation in a real browser** | **BLOCKED** — 0 published products in the seeded catalogue; creating catalogue data requires approval. Covered by six component tests (first/middle/final failure, capacity, duplicate disabling, slot targeting, no duplicate on recovery). Do not read the staging-surface screenshot as proof of the loop. |
| Cross-group reorder commit in a real browser | Not reachable with seeded data (only one reorder group per content type); covered by the component suite. |
| Partial publish leaves a partially activated section | **Intended.** The loop stops, states what was activated, and never retries. |
| Save/registration copy left for Batch 3 (`RegisteredMediaPicker.jsx:72`) | Unchanged by design; documented in the Batch 2 report. |
| Disposable-PostgreSQL homepage acceptance | Skipped — no approved target; unchanged from the implementation phase. |
| `DELETE /media/objects/{key}` in this environment | **503 `DATABASE_SCHEMA_ERROR`** (pre-existing alembic head divergence; `test_migration_graph_one_new_head` fails for the same reason). Deleting an asset is the only place this surfaced; it is outside Batch 2 and was not worked around in product code. |
| Screen-reader and full keyboard-only pass | Out of Batch 2 scope (Batch 5); `aria-describedby`/disabled semantics checked in the DOM. |
| Pre-existing failures | `npm test` 10 failures, 1 skip, `home-page/` inventory test, backend `test_migration_graph_one_new_head` — baseline, untouched. |

---

## 10. Stop point

Batch 2 is **approved with explicit gaps**: two interaction defects and one copy defect were found and corrected in place with regression tests; all suites and the production build are at baseline; the real-browser gate covers F-10 (including injected failures, stale revision and double submission), F-09, F-23, F-16 and F-03. **Batch 3 has not been started and must not begin without explicit approval.**
