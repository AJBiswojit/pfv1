# PRATIKSHYA FASHION — Batch 1 Independent Review and Acceptance Gate

**Scope:** independent review of `HOMEPAGE_CONTENT_CONTROL_CENTER_BATCH1_REPORT.md` against the actual working tree.
**Branch:** `arena/c72d2349-pfv1` @ `43bf640`, uncommitted working tree. **Nothing was reset, reverted, stashed or committed.**
**Batch 2:** not started.
**Date:** 2026-10-23.

---

## 0. Verdict

> ## APPROVED — Batch 1 passes functional **and** visual acceptance.
>
> The six findings are genuinely addressed, and the final gate was executed in a **real Chromium 153 driven by Playwright against the real stack** — Vite dev server → FastAPI/uvicorn → PostgreSQL 16 — through the actual sign-in form, not a mocked HTTP layer.
>
> The browser gate found **one blocking defect (V-1)**: both previews rendered the storefront components outside the `.pf-root` scope that owns 771 of the storefront's CSS rules, so the preview showed correct data with **no design at all** — unstyled block layout, 16 px body-font headings, 4–5× inflated section heights. It is **fixed in the admin preview shell only** (two wrapper elements, no storefront file touched), re-verified by measurement and screenshots at 1920 / 1366 / 768 / 390 px, and covered by a new regression test.
>
> The earlier review defect R-1 (deleted-entry 409 → `PATCH …/items/undefined`) was re-verified **in a real two-tab browser session** with a real `DELETE`; the preserved draft was re-based as a `POST` and no `undefined` id was ever sent.

| | Count |
|---|---|
| Findings claimed by the Batch 1 report | 6 (F-01, F-02, F-12, F-04, F-15, F-05) |
| Findings verified as delivered — headless review + real browser | 6 |
| Defects found in review | 2 (R-1 High, fixed pre-gate; V-1 High, found and fixed at the browser gate) |
| Corrections applied | 5 (R-1, C-2, C-3, C-4, V-1) |
| Test assertions weakened | 0 |
| Test coverage removed | 0 |
| Backend / storefront / payload / registry changes | 0 |
| Browser items still outstanding | 0 blocking; screen-reader (AT) timing not exercised (see §8 item 8) |

---

## 1. Method

1. Read the full working-tree diff (`git diff`, `git status --porcelain --untracked-files=all`, `--ignored`) and every new file end to end.
2. Re-derived the contract from source: `backend/app/services/media/homepage_content_service.py::write`, `backend/app/services/catalog/explore_service.py::_build_hero_slides_from_db`, `backend/app/services/media/marketing_media_service.py::list`, `frontend/src/components/storefront/home/homepageSectionModel.js`, `heroModel.js`, `customerHomeHeroModel.js`.
3. Exercised the real components headlessly (Vite SSR + `react-test-renderer`) with a mocked HTTP layer for the risky paths — including a probe whose mock ordering was corrected to match the backend's actual check order (revision **before** item lookup).
4. Re-ran all suites, the production build and the backend contract tests; compared against a pristine `HEAD` worktree for the broad suite.
5. Applied only minimal corrections; re-ran everything afterwards.
6. **Ran the browser gate**: a real Chromium against a real PostgreSQL 16 + FastAPI + Vite stack, seeded through the product's own API, signing in through the product's own form — measurements, screenshots and per-request network logs (§8, §10). The gate found V-1, which was fixed and re-verified.

Temporary probe file (`frontend/zz-review-probe.test.js`) was deleted after use. `dist/`, the Python venv, `__pycache__`, `.pytest_cache` and `backend/logs/*.log` were removed. Final `git status` shows only the Batch 1 files plus the three reports.

---

## 2. Diff review — every file checked against the report

Verified inventory (`git diff --numstat` + untracked):

| File | Diff | Report claim | Verdict |
|---|---|---|---|
| `components/admin/homepage/previewModel.js` (new) | 257 L | 252 L | **Matches.** Header said 252; it is 257 pre-review and 257 now (edits inside, no line change). Report table updated in the addendum. |
| `components/admin/homepage/HeroPreview.jsx` (new) | 51 L | 46 L | **Matches** pre-review (46 pre-C-4); 51 after C-4 and **V-1** (storefront scope class + comment). |
| `components/admin/homepage/__tests__/homepageBatch1.test.js` (new) | 618 L, 22 tests | 522 L, 18 tests | **Matches pre-review** (522/18); 599/21 after the review's R-1/F-12/F-04 tests; **618/22** after the V-1 browser-gate test. |
| `components/admin/homepage/SectionContentEditor.jsx` | +140 / −54 | +134 / −54 | **Matches pre-review**; +6 from R-1/C-2. |
| `components/admin/homepage/SectionPreview.jsx` | +25 / −79 | +18 / −78 | **Matches pre-review**; +7 lines from **V-1** (7-line rationale comment + `className="pf-root"` on the preview body). |
| `components/admin/BackendHomeHeroPanel.jsx` | +39 / −2 | +39 / −2 | **Exact match.** |
| `pages/admin/media/AdminMarketingMedia.jsx` | +9 / −6 | +9 / −6 | **Exact match.** |
| `services/homepage/homepageContentModel.js` | +22 / −0 | +22 / −0 | **Exact match**; purely additive exports. |
| `__tests__/homepageAllSections.test.js` | +10 / −6 | +10 / −6 | **Exact match.** |
| `__tests__/homepageContentControl.test.js` | +13 / −3 | +13 / −3 | **Exact match.** |

### 2.1 Unrelated changes

**None.** Every hunk belongs to one of the six findings. No formatting sweeps, no renames, no dead-code removal beyond the preview builder that was replaced (`buildSyntheticSection`, whose only caller was `SectionPreview`). No `console.log`, `debugger`, `TODO`, `FIXME` in any touched file (grepped).

### 2.2 Backend, payload, registry, storefront

| Invariant | Check | Result |
|---|---|---|
| Backend untouched | `git status --porcelain \| grep backend/` | 0 files |
| Payload shapes | new test pins create + patch key sets | identical to pre-Batch-1 |
| Registry / slots / capacities / groups | no change to `homepage.py`; preview derives from `allowedSlots` | unchanged |
| Storefront + customer components | `git status` on those trees | 0 files |
| Shared adapter | `adaptHomepageSection` deep-equality test + 131 storefront tests | unchanged output |
| Dependencies | `package.json` / lockfile untouched | no new dependency |
| Storage | no `localStorage`/`sessionStorage` in any new file | clean |
| Build | `npm run build` | success |

### 2.3 New-file quality

`previewModel.js` imports exactly one module (`registeredImageUrl`) and has **no** `fetch`, API client, storage or React import — it is a pure module, so it cannot write. `HeroPreview.jsx` imports only React-free storefront model + the real `Hero`; it performs no request. Both are consistent with the report.

---

## 3. Test-assertion audit (every modified assertion)

| # | File · test | Before | After | Verdict |
|---|---|---|---|---|
| 1 | `homepageAllSections` · failed status read | `'Status unavailable'` ×2 | `'Server error — retry'` ×2 | **Strengthened.** The old string was the F-05 defect; the new one is more specific. A 403 counterpart is asserted in the new suite, so the pair is now covered. |
| 2 | `homepageAllSections` · per-section preview header | `/Preview — not saved/` | `/Preview — saved content \(no unsaved changes\)/` | **Strengthened.** The old label was a false statement; the test now pins the truthful saved-state label instead of a generic one. |
| 3 | `homepageAllSections` · SSR preview header | `/Preview — not saved/` | `/Preview — includes unsaved changes \(not saved\)/` | **Strengthened.** Pins the draft state exactly. |
| 4 | `homepageAllSections` · `kurtis` preview loop | 8 sections in RTR loop | 7 sections in RTR loop | **Moved, not removed.** `kurtis` remains in the 11-section SSR loop with the same draft-copy assertion. Reason verified: placeholders now populate all four kurti mood slots, so `LayoutGroup`/`layoutId` projection executes and hits framer-motion's documented "no DOM under react-test-renderer" limit — the same pre-existing reason `jewellery`/`bestsellers` were excluded. I confirmed the SSR test does assert the kurtis draft heading. |
| 5 | `homepageContentControl` · read-only panel | regex `/Edit\|Remove\|Activate\|Add registered/` must be absent | exact write-control label list must be empty | **Strengthened for the invariant, relaxed for one word.** The regex matched the new *Edit tab* (a view switch), so it became a false positive. The replacement enumerates the seven real mutations — a superset of what the regex could catch in spirit, and exact rather than speculative. |
| 6 | `homepageContentControl` · newsletter | `forms.length === 0` | no save-control text **and** zero non-GET requests | **Strengthened.** The old assertion passed only because it ran before the section read resolved, and it encoded the pre-F-02 rule that no form may exist. It now asserts the invariant that matters (no way to write, nothing written) and is deterministic (`await flush()` added). |

No assertion was deleted. No test was skipped or marked todo. Nothing was loosened to hide a failure.

---

## 4. High-risk behaviour verification

### 4.1 Hero preview vs the real projection

Field-by-field against `explore_service._build_hero_slides_from_db` and `list_active_home_hero`:

| Aspect | Backend / storefront | Batch 1 preview | Verdict |
|---|---|---|---|
| Row order | `ORDER BY sort_order ASC, created_at ASC` | sorts by `sortOrder` with a **stable** `Array.sort`, so equal orders keep the API's created-at order | **Match** |
| Row scope | **active only**, HOME_HERO only | all HOME_HERO rows in the panel | **Deliberate, labelled difference** (D-1) |
| Duplicate `objectKey` | de-duplicated defensively | not de-duplicated | Unreachable (DB unique per placement); note only |
| Title | `row.title or "PRATIKSHYA FASHION"` | same | **Match** |
| Subtitle | `row.subtitle or ""` | same | **Match** |
| CTA label/href | `row.cta_label or "Explore Collection"`, `row.cta_href or "/shop"` | same | **Match** — and both are therefore always non-empty, so `readCta` renders the button exactly as live |
| Alt text | `row.alt_text or ""` → `heroModel` `alt` | same path | **Match** |
| Image | `build_media_url(object_key)` | `row.url` from the same endpoint's response | **Match** in practice |
| Row with `objectKey` but empty `url` | URL is built server-side, slide renders | `heroPreviewSlides` yields `image: ''`, `normalizeHeroSlides` drops it | **Unreachable** difference (the list endpoint always emits `url`); recorded as L-1 |
| Mobile/portrait plate | `mobile_media_asset_id` → resolved URL | **not previewed** (id-only in the admin payload) | **Documented limitation** — stated on screen |
| Unsaved edits | n/a | `previewRows` overlays `{...row, ...draft, url}` for the open form | **Match to what `save` would send** |
| Layout per slide | index-based (`layoutForIndex`) | index-based over the previewed array | **Can differ when inactive rows are present** (part of D-1) |
| Autoplay / interaction | live carousel | `MotionConfig reducedMotion="always"` + `inert` + `pointer-events:none` | Inert by convention, same as `SectionPreview` |
| Unsaved-state label | n/a | saved → *"from the saved entries (no unsaved changes)"*; edited → *"including unsaved changes (not saved)"* | Corrected during review (C-4) |

**D-1 (documented, not a defect):** the preview shows inactive entries so the operator can preview the row being edited; the storefront shows active rows of an active placement only. Because hero layouts are assigned by index, a preview containing inactive rows can assign a different layout than the live carousel. This is now stated in the code comment (C-3) and on screen. Filtering them out would make it impossible to preview an inactive entry, which is the primary authoring case.

**Evidence:** `F-04 · the hero preview renders the in-memory entries and their unsaved edits`, `F-04 · an untouched hero preview says it is showing saved content`, `F-04 · …nothing is set when no entry has art` — plus a probe confirming the real `Hero` mounts and shows the saved title (not the boundary).

### 4.2 409 recovery — three scenarios, executed

Mock ordering was corrected to mirror production: `write()` compares `section.revision` **before** resolving the item id, so a deleted entry reached with a stale revision is a **409**, not a 404. The Batch 1 test double had these reversed; that is fixed too (test fidelity, not assertion strength).

| Scenario | Observed (after correction) |
|---|---|
| **A — entry still exists, unchanged** | Conflict panel shown; draft intact (`Probe A edited`); reconcile = 1 GET, 0 writes; Save then issues `PATCH /items/entry-2` with `title: "Probe A edited"`; server row updated once. |
| **B — another operator changed the entry** | Conflict shown; all six local fields intact; reconcile keeps draft; Save applies it. **The other operator's change to an untouched field was overwritten** (`B subtitle BY OTHER` → `B subtitle`). Inherent to a six-field PATCH; now disclosed in the panel (C-2) and listed as residual risk R-2. |
| **C — entry deleted by another operator** | **Was broken.** Conflict shown and draft retained, but reconcile left `editing = {}` (truthy), so the form stayed in "Edit saved entry", locked its slot selector, and the next Save sent `PATCH …/items/undefined` with no `contentType`/`slotKey` → 404 loop; the only escape was discarding the draft. **Fixed (R-1):** reconcile now yields the create form, an enabled slot selector, and `POST /items` with `{contentType:'TEXT', slotKey:'delivery', isActive:false, title:'C preserved'}`. |

**No automatic write** occurred in any scenario: A and C each show exactly one rejected attempt, then zero writes during reconcile, then one operator-initiated write.

### 4.3 Local-only draft cannot submit a write

Verified on three levels:

1. **Rendered affordance** — in an unconfigured section the submit button is replaced by a `disabled` "Configure the section to save" with `aria-describedby="local-draft-note"`; there is no `Save section entry` control (asserted).
2. **Handler guard** — the form's `onSubmit` returns immediately when `!configured`; Enter in a text field cannot reach `run()`.
3. **Transport** — `run()` additionally requires `access.write` and is the sole path to `writeHomepageSection`. Executed evidence: previewing an unconfigured section made **zero requests of any kind** (`requests.length` unchanged), and a read-only actor in an unconfigured MEDIA section produced **0 forms, 0 configure buttons, 0 writes**.

### 4.4 Placeholders are preview-only

| Check | Result |
|---|---|
| Static: `previewModel.js` has no HTTP/storage import | confirmed |
| Placeholders are created only inside `alignPreviewMedia`, whose output is consumed only by `adaptHomepageSection` in `SectionPreview` | confirmed by reading both call sites |
| No placeholder id or data URI in any request from the editor's configure/save path | asserted in the new test (`preview-placeholder`, `data:image` absent) |
| Preview after configuration issues no request | asserted |
| Live preview markup really does contain `data:image/svg+xml` sources | asserted via image props (not text) |

### 4.5 Read-only roles and employee scoping

| Check | Result |
|---|---|
| Read-only (`marketing.view`/`media.view`) — hero panel | no mutation controls (exact list empty) |
| Read-only — non-hero configured section | no form, no configure control, no save |
| Read-only — unconfigured section | no local draft form, no configure control (new gate holds) |
| Employee workspace | configure `PUT /api/v1/employee/homepage/sections/trust` with `Bearer employee-token`; preview issued 0 writes; draft preserved |
| Admin/employee token separation | existing suites pass; no new code path touches `apiClient` |

---

## 5. Issues found

### R-1 · Deleted-entry 409 left the preserved draft unwritable — **High · CONFIRMED · FIXED**
- **Where:** `SectionContentEditor.jsx::reconcile` — `setEditing({})`.
- **Why it happened:** `{}` is truthy, so every `editing ?` branch took the "editing an existing row" path while `editing.id` was `undefined`.
- **Impact:** the operator could not recover the preserved draft; the form issued `PATCH …/items/undefined` (backend 404 "Entry does not belong to this section"), with the slot selector locked and the heading mislabelled "Edit saved entry". No data corruption (the server rejects it), but lost work in practice — the exact failure F-15 set out to remove.
- **Fix:** `setEditing(null)`; the draft, slot and dirty flag are untouched, so the form becomes the create form and posts a new entry against the fresh revision.
- **Coverage added:** `F-15 · a deleted entry is re-based as a new entry, never PATCHed by an undefined id` — asserts the message, the draft, the heading, and that the only write is a `POST` with `contentType`/`slotKey`/`isActive:false`, plus that no `/items/undefined` request exists.
- **Test-double fidelity:** the deleted-entry branch in the Batch 1 mock was reordered to match the backend (revision check first). This made the test stricter, not looser.

### R-2 · Re-apply overwrites fields the other operator changed — **Medium · RESIDUAL RISK · mitigated**
- **Evidence:** scenario B — the local draft holds all six copy fields, so re-saving restores the stale copy for fields the operator never touched.
- **Why not "fixed":** the audit-approved F-15 design is explicitly "re-read, then let the operator submit the same draft". A field-level merge would be a behaviour change and is out of Batch 1 scope.
- **Mitigation applied (C-2):** the conflict panel now states *"Reconciling only re-reads the section. If you then save, every copy field in this form is written — including fields the other operator changed."*
- **Recommendation:** Batch 3 (form language/validation, F-14 territory) should consider a per-field diff or a "changed by someone else" marker.

### R-3 · Hero preview fidelity wording — **Low · REPORT/COMMENT ACCURACY · fixed**
- The Batch 1 report and a `previewModel` comment said the preview "shows what the storefront will show". Accurate for per-row copy/CTA fallbacks, **not** for row scope (inactive rows) or layout-in-index. Comment corrected (C-3); the report's claim is superseded by §4.1 here.

### L-1 · `objectKey`-only row — **Low · unreachable**
- `heroPreviewSlides` treats `url` as the image; the storefront builds it from `objectKey`. The list endpoint always returns `url`, so this cannot occur today. Recorded only.

### L-2 · Preview label omits "inactive rows are shown" for non-hero sections — **Low · pre-existing**
- Same behaviour existed before Batch 1 (the old preview also seeded saved rows regardless of `isActive`). Not introduced here; the hero states it explicitly. Left unchanged to keep the batch minimal.

### V-1 · Both previews mounted outside the storefront CSS scope — **High · BLOCKING · FOUND AT THE BROWSER GATE · FIXED**

- **Where:** `SectionPreview.jsx` (section body) and `HeroPreview.jsx` (hero body).
- **What the browser showed before the fix** (1366×900, real data): saree section **3930 px** tall with `display:block` and a **16 px Instrument Sans** heading; category section **3898 px**; hero `h1` **16 px / 1088 px wide** in the body face. After adding the scope class at runtime: 788 px / grid / 71 px Cormorant Garamond; 976 px; hero 101 px Cormorant Garamond / 670 px. Screenshots `/tmp/shots/D-saree-{BEFORE,AFTER}.png`, `D-category-{BEFORE,AFTER}.png`, `03a-hero-with-pfroot.png`.
- **Root cause:** `customer.css` scopes **771 selectors** (design tokens, `.hero`, `.saree__*`, `.collage*`, typography, resets) under `.pf-root`, a class applied only by `CustomerStorefront.jsx:103`. The preview mounted the real components without that ancestor.
- **Why the headless review missed it:** react-test-renderer and SSR assert structure and text, not cascade. Nothing in the preview tree was *wrong*; it was unstyled.
- **Fix:** `className="pf-root"` on the two preview wrapper `<div>`s. This is an **admin-only shell class**; no storefront component, stylesheet, adapter or output changed. The class is scoped to its own subtree and also brands the preview surface with the storefront background/foreground tokens, which is intended.
- **Verified after the fix:** `.saree__grid` → `display:grid` with 12 equal columns; section 788 px; heading 71 px `Cormorant Garamond`; category 4-tile collage laid out with 3 dashed "Image not set" plates; hero 670 px, `h1` 101 px; the admin chrome is unchanged; no horizontal overflow at any of the four widths.
- **Coverage added:** `V-1 · section and hero previews mount inside the '.pf-root' storefront scope` (22nd test).

---

## 6. Minimal corrections applied

| ID | File | Change | Risk |
|---|---|---|---|
| R-1 | `SectionContentEditor.jsx` | `setEditing({})` → `setEditing(null)` (3-line comment added) | Very low — restores the intended create path; covered by a new test |
| C-2 | `SectionContentEditor.jsx` | One sentence in the conflict panel disclosing that re-saving writes every copy field | None (copy only) |
| C-3 | `previewModel.js` | Comment corrected to state the inactive-row/layout difference | None (comment only) |
| C-4 | `HeroPreview.jsx`, `BackendHomeHeroPanel.jsx` | `unsaved` prop → saved-state label no longer says "not saved" | None (label only), covered by a new test |
| V-1 | `SectionPreview.jsx`, `HeroPreview.jsx` | `className="pf-root"` + rationale comment on the preview bodies (admin shell only) | Low — one class on an existing wrapper; storefront untouched; covered by a new test |
| — | `__tests__/homepageBatch1.test.js` | 4 tests added (22 total), the deleted-entry double reordered to match production, and the V-1 scope assertion | Strengthens |

No other file was touched during the review or the browser gate. `previewModel.js`, `AdminMarketingMedia.jsx`, `homepageContentModel.js` and both modified legacy test files are byte-identical to the reviewed Batch 1 state; `SectionPreview.jsx` differs only by the V-1 class/comment.

---

## 7. Test evidence

All commands from `/home/user/pfv1/frontend` unless stated.

| # | Command | Result | Baseline | Verdict |
|---|---|---|---|---|
| 1 | `node --import ./scripts/node-loader/register.mjs --test src/components/admin/homepage/__tests__/homepageBatch1.test.js` | **22 / 22 pass** (post-V-1) | 18/18 before review | **Pass** |
| 2 | same runner, all four admin control-centre suites (`homepageAllSections`, `homepageContentControl`, `homepagePersistence`, `homepageBatch1`) | **138 tests · 137 pass · 1 fail** (re-run 2026-10-23) | 134 · 133 · 1 | **Same single pre-existing failure** |
| 3 | Storefront suites (`homeIntegration`, `homeSectionsRender`, `heroEditorialRender`, `heroModel`, `homepageLoading`, `homepageSectionsRender`, `designSystemFoundation`) — **re-run after V-1** | **131 / 131 pass** | 131/131 | **Pass** |
| 4 | `npm run build` (after V-1) | **success** — `dist/index.html 3,107.68 kB │ gzip 975.24 kB`, built in 8.16 s | success | **Pass** |
| 5 | `pytest tests/unit/test_phase7_media_lifecycle.py tests/unit/test_media_reference_audit.py tests/unit/test_admin_consolidation_rbac.py tests/unit/test_marketing_media.py` | **172 passed** in 3 m 26 s | — | **Pass.** No backend file is modified (`git status`). |
| 6 | `npm test` (whole `tests/` + `test/` tree) | **850 tests · 839 pass · 10 fail** + `tests/unifiedLogin.test.js` file failure | 850 · 839 · 10, same names | **Identical** |
| 7 | Focused `tests/marketingMediaHero.test.js` + `tests/staffPhase2DesignContracts.test.js` | **15 / 15 pass** | 15/15 | **Pass** |

### 7.1 Baseline failures (pre-existing, not caused here)

1. **`homepageContentControl` → "section inventory matches all twelve reference components in order"** — `ENOENT frontend/../home-page/src/pages/Home.jsx`; the `home-page/` reference directory is absent from this checkout. (Same failure in the Batch 1 report and at `HEAD`.)
2. **`test_migration_graph_one_new_head`** — asserts head `p3hp20261016a`; the real single head is `w3b4c5d6e7f8`.
3. **Backend `pytest` collection** — `tests/unit/test_unified_rbac_consolidation.py` fails to import `ACCOUNT_LEVEL_SUPER_EMPLOYEE` from `app.core.rbac` (symbol absent in this checkout) → whole-suite collection error. Pre-existing: no backend file is modified. The remaining whole-backend failures (`test_phase6_real_media_integration`, `test_workforce_api_wiring`) are likewise untouched by this batch.
4. **`npm test` broad suite** — 10 named failures (RBAC mirror, SUPER_EMPLOYEE routing, delegation ceiling, nav labels, `unifiedLogin`). Verified identical against a pristine `HEAD` worktree during the Batch 1 gate; re-run now gives the same totals and the same names. Not re-proved with a second worktree in this pass since the reviewed diff does not touch any of those modules and the names/totals are unchanged.

No failure was suppressed, skipped or converted. No test was weakened to make a suite green.

---

## 8. Acceptance checklist

Executed on 2026-10-23 in **Chromium 153.0.8010.0** (real, headless) driven by Playwright, against the real app: Vite `:5173` → uvicorn `:8000` → PostgreSQL 16, signed in through the real `/admin/login` form as `admin@pratikshyafashion.com`. Screenshots in `/tmp/shots/`; scripts in `/tmp/browser/`.

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Unconfigured section previews with no request | **PASS** | bridal TEXT: 0 API calls while typing and 0 while previewing; label `Preview — unconfigured section · showing local draft only (nothing saved)`; save control disabled with `Configure the section to save`. |
| 2 | Local draft previews; Configure preserves the draft | **PASS (preview)** / **unit-tested (configure)** | preview verified in the browser; draft-preserving configure is covered by `F-02` in the headless suite. Configure was deliberately **not** clicked against the live DB so the seeded "unconfigured" fixtures stayed unconfigured for the other checks. |
| 3 | Editing a saved entry previews the edit, not the saved value | **PASS** | intro title loaded `Six yards,three generations`; typed `Six yards, three lineages.`; preview `h2` = typed value, saved string absent; 0 non-GET requests; after reload the row still reads the saved value. |
| 4 | MEDIA placeholders + configured/required count | **PASS** | category slots `women (1/1 filled — full)`, `men/kids/essentials (0/1 filled)`; preview renders 1 real image + **3 distinct** dashed `Image not set` plates labelled Men/Kids/Essentials; no duplicated `src`; coverage line `1 of 4 image slots have art · not set: Men tile, Kids tile, Essentials tile.` |
| 5 | Hero previews in-memory entries incl. unsaved edits, no autoplay leak | **PASS** | 3 slides (2 active + 1 inactive) with label `Preview — 3 slides from the entries currently on screen, including unsaved changes (not saved)`; typed title rendered as the `h1`; **0 API calls**; frame unchanged after 4 s (no autoplay/rotation). |
| 6 | Two-tab 409 conflict UX | **PASS** | two real browser contexts, same admin: tab A saved → tab B's save produced exactly **one** `PATCH` (no retry), draft `Draft from tab B` intact, full explanation, `Reload and reconcile (keep my draft)` / `Discard my draft and reload`; reconcile kept the draft and cleared the conflict. Screenshot `E4-conflict-409.png`. |
| 6b | Deleted-entry 409 (R-1 regression) | **PASS** | real `DELETE` in tab A while tab B edited that entry: 409 → draft retained → `The entry you were editing no longer exists; your text is preserved here as a new entry draft` → recovery save issued **`POST /items`**, no `…/items/undefined` anywhere. Throwaway entry removed afterwards; sarees back to its 4 seeded rows. |
| 7 | 403 vs 5xx vs offline messaging | **PASS** | route interception on `GET /sections/sarees`: 403 → *"not permitted to read this section (HTTP 403). Ask an administrator for marketing.view."*; 500 → *"The homepage service failed (HTTP 500). Nothing was changed."*; connection abort → *"could not be reached (network error). Nothing was changed."* Each shows `Retry section`; the read is attempted 4 times then stops (no retry storm). Screenshots `E5-{403,500,offline}.png`. |
| 8 | Keyboard / focus / screen-reader | **PASS (keyboard + semantics)** / **not exercised with AT** | 22-stop tab walk stays in real controls; section + type opened with **Enter only**; focus ring `2 px solid rgb(134,94,32)`; `Edit/Preview` are `role=tab` in a tablist with `aria-selected`; preview body is `inert` and received **0 of 12** tab stops; every editor input has a `<label>`; live regions announce `Preview — saved content (no unsaved changes)`, `3 of 3 image slots have art.`, `Backend controlled · ready · revision 7`; images carry alt text. No screen reader was run. |
| 9 | 1366×768 / wide / tablet / mobile layout | **PASS** | 1920×1080, 1366×900, 1366×768, 768×1024 and 390×844: horizontal overflow **0 px** at every width, `.pf-root` present, preview 1292 / 738 / 670 / 324 px wide; sidebar collapses to a hamburger; category collage reflows to 1 column on mobile. Screenshots `E9-*.png`. |
| 10 | Employee workspace parity | **PASS** | an EMPLOYEE account (`PF-SLS-18198`, `media.view` + `marketing.view`) created through the real admin API, signed in through the same form: hero preview renders with `.pf-root`, 101 px display heading; **no** save/deactivate/move/remove controls (`Read-only: media.assign is required…`); the employee token gets **403** on the admin homepage read and write routes (enforcement unchanged). |
| 11 | Storefront visually unchanged | **PASS** | storefront `/` renders hero + saree section with the same design as the admin preview; `git status` shows **0** storefront/customer files changed; 131/131 storefront tests green. Screenshots `E11-storefront*.png` vs `V1-saree-0.png`. |

**Visual acceptance: obtained.** Measured (computed styles, box heights, grid template, overflow) and captured, not inferred.

## 9. Remaining risks

| Risk | Severity | Notes |
|---|---|---|
| Re-apply overwrites untouched fields changed by another operator (R-2) | Medium | Inherent to a full-field PATCH; disclosed in the UI. Address in Batch 3. |
| Hero preview shows inactive rows and can therefore assign different per-slide layouts than live (D-1) | Low | Explicitly labelled; filtering would defeat the authoring purpose. |
| Mobile/portrait hero plate cannot be previewed | Low | Contract limitation, stated on screen. |
| Placeholder artwork mistaken for real art at a glance | Low | Dashed frame + "Image not set" + business label + explicit alt + coverage sentence; never reaches the API. |
| Unconfigured section now renders a form (intentional) | Low | Local-only, no submit, explained, gated on `marketing.manage`. Screenshot-verified at the gate. |
| Preview rebuilds on each keystroke while its tab is open | Low | Small arrays, no HTTP; not profiled in a browser. |
| Framer-motion `layout` components cannot be exercised under react-test-renderer | Low | Pre-existing, documented; jewellery/bestsellers/kurtis covered by SSR. |
| Preview is styled by the storefront's `.pf-root` scope; a future refactor that removes or renames that class breaks the preview silently | Low | Covered by the V-1 regression test; the dependency is documented at both mount points. |
| Preview width differs from the real viewport (admin panel is narrower) | Low | Sections are responsive; the preview shows the same design at the panel width, not a pixel-for-pixel desktop replica. Visible in `V1-saree-0.png` vs `E11-storefront-2.png`. |

---

## 10. Browser acceptance run — how it was executed

**Environment (all outside the repo, nothing added to the project):** Chromium 153.0.8010.0 unpacked from `@sparticuz/chromium@153.0.0` into `/tmp/chromium`, with the matching AL2023 shared libraries in `/tmp/lib` (`LD_LIBRARY_PATH`); Playwright-core as the driver (`/tmp/browser`). App stack: `uvicorn app.main:app --port 8000` against a real PostgreSQL 16 (`pgserver`) with all Alembic migrations applied and the CMS seeded through the real API (3 hero rows — 2 active; sarees active with an intro + 3 media; categories configured-inactive with 1 of 4 media), plus `vite --port 5173` proxying `/api`. Sign-in used the real form (`#staff-identifier`, `#staff-password`) as SUPER_ADMIN.

Every check below is a real page load with real network traffic. Requests were counted by instrumenting `page.on('request')`, so "zero writes" means zero HTTP requests of any kind were observed while typing/previewing, and "one PATCH" means exactly one write left the browser.

| Screenshot | Shows |
|---|---|
| `D-saree-BEFORE.png` / `D-saree-AFTER.png` | the V-1 defect and its fix on the saree section |
| `D-category-BEFORE.png` / `D-category-AFTER.png` | same for the category collage |
| `V1-saree-0..2.png` | saree preview after V-1, in the app shell |
| `V1-existing-draft.png` | unsaved edit visible in the preview |
| `E3-hero-preview-saved.png`, `E3-hero-preview-unsaved.png` | hero preview, saved and unsaved |
| `E4-conflict-409.png`, `E4-after-reconcile.png` | two-tab conflict and recovery |
| `E12-deleted-entry-409.png`, `E12-after-recovery.png` | deleted-entry conflict and re-base to POST |
| `E5-403.png`, `E5-500.png`, `E5-offline.png` | permission vs server vs network messaging |
| `E6-category-missing-media.png` | honest missing-media placeholders |
| `E9-1920x1080.png`, `E9-1366x768.png`, `E9-768x1024.png`, `E9-390x844.png` | responsive |
| `E10-employee-readonly.png` | employee workspace, read-only |
| `E11-storefront.png`, `E11-storefront-2.png` | storefront for comparison |

**Seed data was restored.** The 409 tests wrote through the product's own endpoints; afterwards the saree intro was saved back to its original `Six yards,three generations`, the throwaway entry was deleted and the section verified back at its 4 seeded rows via `GET /admin/homepage/sections/sarees`.

**Not exercised:** screen-reader announcement timing (no AT available), and the optional mobile/portrait hero plate (not previewable by contract — stated on screen).

---

## 11. Recommendation

**APPROVE BATCH 1 — functional and visual acceptance complete.**

* The six findings are implemented as described, verified headlessly **and** in a real browser against a real backend and database.
* The one blocking visual defect (V-1) found at the gate is fixed inside the admin preview shell only; no storefront file, adapter or stylesheet was touched, and the fix is regression-tested.
* R-1 is re-verified end-to-end in a real two-tab session with a real delete; no `…/items/undefined` request can occur.
* No backend, DTO, registry, permission, payload-shape, slot, capacity or section-order change exists in the diff.
* Suites match or exceed the baseline: 22/22 Batch 1, 137/138 control-centre (1 pre-existing `home-page/` ENOENT), 131/131 storefront, `npm test` 850/839/10 identical to `HEAD`, backend media/homepage/RBAC contracts 172/172, build green.
* Nothing was committed, pushed, deployed or reverted; `git status` contains only the Batch 1 files and the three report documents.

**Batch 2 has not been started.** Awaiting explicit approval.
