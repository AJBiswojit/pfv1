# PRATIKSHYA FASHION — Homepage Configuration Remediation, Batch 1

**Preview correctness and safe editing**
Status: **implemented, not committed, awaiting review.** Batch 2 has not been started.
Source of truth: `HOMEPAGE_CONTENT_CONTROL_CENTER_DETAILED_AUDIT.md` (findings F-01, F-02, F-12, F-04, F-15, F-05).
Date: 2026-10-23 · Branch: `arena/c72d2349-pfv1` @ `43bf640` (working tree, uncommitted).

> **Addendum — independent review (see `HOMEPAGE_CONTENT_CONTROL_CENTER_BATCH1_REVIEW_REPORT.md`).**
> The review found and fixed one real defect (R-1: after a 409 whose entry had been deleted, the
> reconcile path submitted `PATCH …/items/undefined`), plus three honesty/accuracy corrections.
> `homepageBatch1.test.js` is now **21 tests** (599 lines) and `SectionContentEditor.jsx` is
> **+140 / −54**. The numbers and test totals quoted below are the pre-review ones; the review
> report carries the current figures.

---

## 0. What was done, in one paragraph

The Homepage Content Control Center can now show the operator what they are actually editing. The preview composes the item array **before** it reaches the shared storefront adapter, so an edited existing row replaces the saved row and a new row is appended as a draft — the adapter's "first row per slot" rule now sees the operator's values (F-01). A section that has never been configured can be drafted locally and previewed with **zero requests of any kind**; the preview says so on screen (F-02). A media slot with no art renders a labelled, self-contained placeholder instead of a copy of another slot's photograph, and the panel reports `n of m image slots have art` (F-12). The hero — previously the only section with no preview at all — renders the real storefront `Hero` from the entries held in memory, including unsaved edits (F-04). A revision conflict no longer destroys the draft: every typed value survives, nothing is retried automatically, and the operator gets explicit recovery (F-15). A refused request (403) and a failed one (5xx/offline) now read differently in the nav and in the editor (F-05).

**No backend file was touched.** No route, DTO, schema, migration, storefront adapter, section component, permission, registry slot or payload shape changed.

---

## 1. Scope actually delivered

| Finding | Delivered | Notes |
|---|---|---|
| F-01 | Yes | Draft merged before adaptation; existing row replaced by id, new row appended; MEDIA art swap included |
| F-02 | Yes | Unconfigured section: local draft form + preview, zero HTTP; explicitly labelled |
| F-12 | Yes | Labelled placeholders + configured/required count; no duplication |
| F-04 | Yes | Real `Hero` component, in-memory rows, unsaved edits included |
| F-15 | Yes | Draft retained, conflict explained, explicit read-only reconcile, no auto-retry |
| F-05 | Yes | 403 / 401 / 5xx / offline / unknown distinguished in nav and editor |

Deliberately **not** done (deferred, per the audit roadmap): F-03, F-06, F-07, F-08, F-09, F-10, F-11, F-13, F-14, F-16, F-17, F-18, F-19, F-20, F-21, F-22, F-23, F-24, F-25, F-26, F-27 and S-01…S-06. Activation, approval and publishing semantics are unchanged. No bulk endpoint, no combined writes.

---

## 2. Files changed

### New

| File | Lines | Why |
|---|---|---|
| `frontend/src/components/admin/homepage/previewModel.js` | 257 | Pure preview composition: draft merge, media coverage, placeholder SVG, hero row → `/home` slide mapping, preview/coverage labels. No React, no HTTP, no storage. |
| `frontend/src/components/admin/homepage/HeroPreview.jsx` | 51 | Renders the real storefront `Hero` from in-memory placement rows, `MotionConfig reducedMotion="always"`, `inert`, empty state, `.pf-root` scope (see §15). |
| `frontend/src/components/admin/homepage/__tests__/homepageBatch1.test.js` | 618 | 22 regression tests for the six findings plus payload/adapter/storefront invariants and the preview scope class. |

### Modified

| File | Delta | Why |
|---|---|---|
| `frontend/src/components/admin/homepage/SectionContentEditor.jsx` | +140 / −54 | Preview available before and after configuration; local draft mode; conflict retention + reconcile; classified read failure; draft preserved across configure; no change to any write call |
| `frontend/src/components/admin/homepage/SectionPreview.jsx` | +25 / −79 | Uses `previewModel`; no `configured` gate; honest state label; coverage line; placeholders; `.pf-root` scope (see §15) |
| `frontend/src/components/admin/BackendHomeHeroPanel.jsx` | +39 / −2 | Edit/Preview tabs; lazy `HeroPreview`; in-memory overlay of the open form; preview only after the placement loads |
| `frontend/src/pages/admin/media/AdminMarketingMedia.jsx` | +9 / −6 | Threads the section-list HTTP status so 403 ≠ 5xx in the nav |
| `frontend/src/services/homepage/homepageContentModel.js` | +22 / −0 | Pure `sectionListStatusLabel` and `sectionReadFailureMessage` (additive exports) |
| `frontend/src/components/admin/homepage/__tests__/homepageAllSections.test.js` | +10 / −6 | Label expectations updated to the new truthful labels; one section moved to SSR coverage (see §10.3) |
| `frontend/src/components/admin/homepage/__tests__/homepageContentControl.test.js` | +13 / −3 | Read-only assertion made exact; newsletter assertion made deterministic (see §10.3) |

Touch points that were **not** touched: `components/storefront/home/homepageSectionModel.js`, `HomepageSection.jsx`, `customerHomeHeroModel.js`, `heroModel.js`, all eleven `customer/components/sections/*.jsx`, `Home.jsx`, `services/api/homepageApi.js`, `services/homepage/homepageContentService.js`, every backend file, every permission file, the twelve section keys and every slot key/capacity.

---

## 3. F-01 — preview now shows the edit, not the saved row

**Root cause (confirmed in the audit):** `SectionPreview.buildSyntheticSection` pushed `section.items` first and the draft item afterwards. `adaptHomepageSection` selects `typed('TEXT', slot)[0]` / `typed('MEDIA', slot)[0]`, so the saved row always won and the draft was never rendered. The panel still printed *"Preview — not saved"*.

**Fix:** `mergePreviewItems` composes a **new** item array before adaptation:

- `editingId` is an id → that saved row is replaced in place (`{...row, text|media|product}`), preserving `slotKey`, `sortOrder` and `isActive`;
- `editingId === null` (the form is open on a new entry) → the draft is appended with a stable `preview-draft` id;
- `editingId === undefined` (legacy direct callers, e.g. the SSR test) → the first row in that slot is replaced, never duplicated beside it.

TEXT merges the six copy fields; MEDIA merges copy **and** keeps or replaces `media.url` (a newly chosen registered asset wins, an untouched entry keeps its saved art); PRODUCT replaces the product reference only when the operator picked one. The storefront adapter is untouched — the composition happens on the admin side, as the audit required.

**Before → after**

| | Before | After |
|---|---|---|
| Edit an existing TEXT entry, open Preview | saved title | edited title; label says *"includes unsaved changes (not saved)"* |
| Choose a different image for a MEDIA entry | saved image | newly chosen image; saved row unchanged |
| Add a new entry, open Preview | not visible | visible as a draft |
| Saved row mutated by opening Preview | no | no (asserted: the item array is deep-equal before/after) |

**Evidence:** `homepageBatch1.test.js` → *F-01 · editing a saved entry previews the edit, not the saved value*, *F-01 · a new draft entry appears in the preview before it is saved*, *F-01 · a newly chosen MEDIA asset is previewed before it is saved*, *no regression · preview composition never mutates saved rows*. The old PROBE-1 result (`OLD SAVED HEADING: true / EDITED DRAFT HEADING: false`) is now the exact opposite.

---

## 4. F-02 — preview before the first configuration, with no write

**Before:** the Preview tab was replaced with `Preview — not saved · Hidden until configured`, and the only way to reach any preview was to `PUT` a real `homepage_section` row first. There was also no way to type content before configuring, so "preview unsaved content" was impossible in principle.

**After:** for an unconfigured section with `marketing.manage` (and, for MEDIA, `media.assign`):

1. the entry form renders in **local draft mode** — slot selector, copy fields, media/product pickers, all in memory;
2. the submit control is replaced by a **disabled** `Configure the section to save` button with `aria-describedby` pointing at the explanation;
3. a status line reads: *"Draft only — this section is not configured yet, so nothing typed here is saved and no request is made. Use Preview to review it, then configure the section to save."*;
4. the Preview tab composes the preview from `section.allowedSlots` + the local draft and labels it *"Preview — unconfigured section · showing local draft only (nothing saved)"*, with a second line: *"No backend section exists for this preview. Nothing here has been written."*;
5. **configuring preserves the draft** — `run()` now calls `reset()` on a successful configure only when the form is clean, and the success message says *"Section configured. Your draft is still unsaved — press Save section entry to store it."*.

Read-only actors (`marketing.view` without `marketing.manage`) get no form and no configure control — unchanged.

**Verified:** opening Preview on an unconfigured `bridal` section produces **no HTTP request at all** (`requests.length` unchanged; `writes() === []`; the section fixture stays `configured: false, revision: 0`).

**Deliberate consequence to review:** an unconfigured section now renders a form where previously there was only a button. Two existing assertions encoded the old absence of a form and were updated (see §10.3). This is the only intentional UX addition in the batch.

---

## 5. F-12 — missing media is honest

**Before:** for every MEDIA slot the section needs but does not have, the preview pushed the **same** `url` into the missing slots. A 1-of-4 collage previewed as a complete four-tile collage built from one photograph, and the operator could not see the gap.

**After:**

- `mediaSlotCoverage` derives the required slots from the authoritative `section.allowedSlots` (not a duplicated hard-coded list) and counts the ones with a usable `media.url`;
- `alignPreviewMedia` puts MEDIA rows in registry order and, for every unset slot, inserts a placeholder item whose image is a self-contained SVG data URI: ivory panel, dashed gold rule, *"Image not set"*, and the slot's business name (*"Kids tile"*, *"Lookbook frame 2"*, *"Campaign image"*). The `alt` text is `"<label> — no image chosen"`;
- no placeholder is ever sent to the API — it exists only in the preview item array;
- the panel prints e.g. *"1 of 4 image slots have art · not set: Men tile, Kids tile, Essentials tile."*

Placeholders are injected for every preview, including a section shown from saved content only; the previous behaviour hid the gap entirely, which is what the finding asked to change. They are visually unambiguous and never presented as real photography.

**Verified:** `F-12 · one selected image is never repeated into the empty slots` (chosen URL appears exactly once, three placeholders, exact coverage sentence) and `F-12 · a fully configured media section reports complete coverage and no placeholders`.

---

## 6. F-04 — the hero finally has a preview

**Before:** `SectionPreview` returned `<p>Hero preview not available in this editor.</p>` and `BackendHomeHeroPanel` had no Preview tab.

**After:** the panel has the same `Edit | Preview` tab strip as the section editor. Preview lazily mounts `HeroPreview`, which:

- maps the current `state.items` to the `/home` slide shape (`heroPreviewSlides`) with the same fallbacks the backend applies in `explore_service._build_hero_slides_from_db` (title → `PRATIKSHYA FASHION`, CTA → `Explore Collection` → `/shop`), so the preview shows what the storefront will show;
- **overlays the open form**: editing an existing row replaces that row's copy and, if a new asset was chosen, its art; a new entry is appended — unsaved edits are previewed without saving;
- renders the **real** `Hero` component used by `CustomerHomeHero`, inside `MotionConfig reducedMotion="always"` (autoplay off) and an `inert`, `pointer-events: none` wrapper, matching the existing `SectionPreview` conventions;
- states: *"Preview — N slides from the entries currently on screen (not saved)"*, plus *"Inactive entries are previewed too: the storefront only shows active entries of an active placement."*;
- rejects nothing: with no image-bearing row it shows *"Preview — no hero entry has an image yet"* rather than an empty carousel frame.

**Known limitation, stated on screen:** the optional mobile/portrait plate is **not** previewed. The placement read returns `mobileMediaAssetId`, not that asset's URL, so the portrait crop cannot be reproduced from the admin payload; the preview says so instead of guessing. This is a contract limitation, not a regression.

**Verified:** `F-04 · the hero preview renders the in-memory entries and their unsaved edits` (unsaved title visible, saved title absent from the preview body, zero writes, backend row unchanged) and `F-04 · the hero preview states that nothing is set when no entry has art`.

---

## 7. F-15 — a 409 no longer discards the draft

**Before:** any 409 (and any non-HTTP failure) set `needsReload`, disabled Save and left the operator with one destructive option: *"Reload section and public content"*, which called `reset()` and reloaded. The typed copy was lost.

**After:** a 409 sets a `conflict` record and leaves **everything else** untouched — `editing`, `slot`, `draft`, `asset`, `product`, `dirty`. The panel shows:

> **Someone else saved this section while you were editing.** *&lt;server message&gt;*
> Your draft is preserved exactly as typed. This edit was based on revision *N*. No retry has been attempted and nothing was overwritten.
> **[Reload and reconcile (keep my draft)]  [Discard my draft and reload]**

`Reload and reconcile` performs **one GET** and nothing else. It replaces `section` (so the next save uses the fresh revision) and keeps the form. If the edited entry no longer exists on the server, the form is re-based as a new entry and the message says so. The operator must press **Save section entry** himself — no automatic retry, ever. `Discard my draft and reload` is the explicit destructive path, still guarded by the existing `window.confirm`. The same reconcile action is offered for non-HTTP/unknown write failures, which also used to be dead ends.

**Verified:** `F-15 · a 409 keeps the complete draft and requires an explicit reconcile` (four fields retained, Save disabled, exactly one rejected attempt, reconcile = one read + zero writes, draft intact, second save applies once) and `F-15 · a failed reconcile keeps the draft and does not write`.

The two pre-existing tests that asserted the *discard* path still pass unchanged, because that path still exists — it is now the second, explicit choice.

---

## 8. F-05 — refused, failed, offline and unavailable read differently

**Before:** `!statuses.sections` ⇒ every section read `Status unavailable`, whether the backend refused the actor (403) or was down (503). The hero had a 403 branch; sections had none.

**After** — one pure vocabulary (`sectionListStatusLabel`):

| HTTP | Nav label |
|---|---|
| 403 | `Requires marketing.view` |
| 401 | `Session expired — sign in` |
| 0 / network | `Status unavailable — retry` |
| ≥ 500 | `Server error — retry` |
| other | `Status unavailable · HTTP {status}` |

The hero keeps its more specific `Requires media access` for 403 and now uses the same retry wording for 5xx. In the editor, a failed **read** is classified by `sectionReadFailureMessage` and the raw server message is kept as detail beneath it: *"Your session is not permitted to read this section (HTTP 403). Ask an administrator for marketing.view."* vs *"The homepage service failed (HTTP 503). Nothing was changed. Retry when it is available."*

Authorization enforcement is untouched: `staffHomepageAccess`/`homepageAccess` still decide what is requested, `homepageRequest` still short-circuits locally with 403 and no HTTP, and only *labels* changed.

**Verified:** `F-05 · a refused section list and a failed one read differently`, `F-05 · a refused section read is not reported as an outage`, `F-05 · the status vocabulary is pure and exhaustive`.

---

## 9. Data safety — what could not change, and did not

- **No backend file changed** (`git status`: zero files under `backend/`). Routes, DTOs, Pydantic models, RBAC, migrations and stored rows are exactly as before.
- **No request payload changed.** The new test pins the create payload key set to `altText, contentType, ctaHref, ctaLabel, expectedRevision, eyebrow, isActive, slotKey, subtitle, title` and the patch payload to `altText, ctaHref, ctaLabel, expectedRevision, eyebrow, subtitle, title` — identical to pre-Batch-1. No `mediaAssetId`/`productId` appears unless the operator selects one.
- **No slot, capacity, group or section key changed.** The preview derives required slots from `allowedSlots` that the backend already returns.
- **No storefront file changed.** `adaptHomepageSection` output for a fixed section is pinned deep-equal in the new test; `Home.jsx` still mounts eleven `<HomepageSection>` boundaries plus `<Hero />`.
- **Preview is read-only by construction.** Composition happens in memory; the F-01/F-02 tests assert zero writes and the F-02 test asserts zero requests.
- **No new dependency, no localStorage, no cache, no telemetry.**
- **Activation/publishing untouched:** `Activate section` still sends `PUT { expectedRevision, isActive }`; entries still start inactive; the media-grant rule for activation is unchanged.

---

## 10. Tests and evidence

All commands were run from `/home/user/pfv1/frontend` unless stated.

### 10.1 Exact commands and actual results

| # | Command | Result |
|---|---|---|
| 1 | `node --import ./scripts/node-loader/register.mjs --test src/components/admin/homepage/__tests__/homepageBatch1.test.js` | **22 tests, 22 pass, 0 fail** (final, after §15) |
| 2 | `node --import ./scripts/node-loader/register.mjs --test src/components/admin/homepage/__tests__/*.test.js` | **138 tests, 137 pass, 1 fail** — the single failure is the pre-existing `ENOENT …/home-page/src/pages/Home.jsx` (see §10.2) |
| 3 | Storefront suites (`homeIntegration`, `homeSectionsRender`, `heroEditorialRender`, `heroModel`, `homepageLoading`, `homepageSectionsRender`, `designSystemFoundation`) | **131 tests, 131 pass, 0 fail** |
| 4 | `node --import ./scripts/node-loader/register.mjs --test tests/marketingMediaHero.test.js tests/staffPhase2DesignContracts.test.js` | **15 tests, 15 pass** |
| 5 | `npm run build` | **success** — `dist/index.html 3,107.68 kB │ gzip 975.24 kB`, built in 8.16 s (final, after §15) |
| 6 | `<venv>/python -m pytest tests/unit/test_phase7_media_lifecycle.py tests/unit/test_media_reference_audit.py tests/unit/test_admin_consolidation_rbac.py tests/unit/test_marketing_media.py` (from `backend/`, real PostgreSQL) | **172 passed** in 3 m 26 s (final, after §15) |
| 7 | `npm test` (entire `tests/` + `test/` directories) | **850 tests, 839 pass, 10 fail**, plus one file-level failure in `tests/unifiedLogin.test.js` — **identical** to a pristine `HEAD` checkout (§10.2) |

### 10.2 Baseline failures — reported separately, not "fixed" and not caused here

Two known failures were already present at `HEAD` (`43bf640`) and are untouched by this batch:

1. **`homepageContentControl.test.js` → "section inventory matches all twelve reference components in order"** — `ENOENT: frontend/../home-page/src/pages/Home.jsx`. The `home-page/` reference design directory is not part of this checkout. Environmental/pre-existing.
2. **`test_migration_graph_one_new_head`** — asserts the single migration head is `p3hp20261016a`; the real single head is `w3b4c5d6e7f8`. Pre-existing stale assertion; no migration was added or modified here.

For the broad `npm test` suite (item 7) I did not want to *assume* those failures pre-dated the batch, so I proved it: I created a detached worktree at `HEAD` in `/tmp`, symlinked `node_modules`, ran the same command, and got the **same** totals and the **same** failing test names (RBAC account-level mirror, SUPER_EMPLOYEE routing, delegation ceiling, nav labels, `unifiedLogin`). The worktree was removed afterwards; the working tree was never stashed, reset or otherwise altered.

### 10.3 Test files that were edited — exactly what changed and why

No test was deleted. No assertion was weakened to make a red test green. Each change either (a) follows a label that intentionally became truthful, or (b) replaces an assertion that encoded the old defect or depended on timing.

| File | Change | Justification |
|---|---|---|
| `homepageAllSections.test.js` | `503` nav label `'Status unavailable'` → `'Server error — retry'` (test renamed accordingly) | F-05: the old string was the defect. The new assertion is more specific, and a 403 case was added in the new suite. |
| `homepageAllSections.test.js` | Preview label `/Preview — not saved/` → `/Preview — saved content \(no unsaved changes\)/` (saved state) and `/Preview — includes unsaved changes \(not saved\)/` (draft state, SSR) | F-01: the old label was a false statement about saved content. Both states are now asserted exactly instead of loosely. |
| `homepageAllSections.test.js` | `kurtis` removed from the `react-test-renderer` preview loop | **Coverage moved, not removed.** Placeholders mean all four kurti mood slots now render, so `LayoutGroup`/`layoutId` projection runs and hits framer-motion's documented "no DOM under react-test-renderer" limit — the same reason `jewellery` and `bestsellers` were already excluded. `kurtis` remains covered by the server-render loop, which asserts the same draft copy. |
| `homepageContentControl.test.js` | Read-only editor assertion `/Edit|Remove|Activate|Add registered/` → an exact list of write-control labels | The new **"Edit" tab** is a view switch, not a mutation; the loose regex became a false positive. The replacement is stricter (exact control names). |
| `homepageContentControl.test.js` | Newsletter `findAllByType('form').length === 0` → "no save control and zero non-GET requests" | The old assertion passed only because it ran before the section read resolved; it described the pre-F-02 rule that no form may exist. The new assertion states the invariant that actually matters. That fixture returns no `allowedSlots`, so no form appears there anyway. |

### 10.4 What the new suite pins

| Area | Test |
|---|---|
| F-01 TEXT edit | *editing a saved entry previews the edit, not the saved value* |
| F-01 new entry | *a new draft entry appears in the preview before it is saved* |
| F-01 MEDIA edit | *a newly chosen MEDIA asset is previewed before it is saved* |
| F-02 | *an unconfigured section previews a local draft and issues no write* (0 requests), *configuring a section keeps the locally drafted entry* |
| F-12 | *one selected image is never repeated into the empty slots*, *a fully configured media section reports complete coverage and no placeholders* |
| F-04 | *the hero preview renders the in-memory entries and their unsaved edits*, *…states that nothing is set when no entry has art* |
| F-15 | *a 409 keeps the complete draft and requires an explicit reconcile*, *a failed reconcile keeps the draft and does not write* |
| F-05 | *a refused section list and a failed one read differently*, *a refused section read is not reported as an outage*, *the status vocabulary is pure and exhaustive* |
| No regression | *the save payload is byte-for-byte the pre-Batch-1 shape*, *preview composition never mutates saved rows*, *the shared storefront adapter still produces the same content*, *the storefront boundary still mounts eleven sections plus the hero* |

---

## 11. Regression risks

| Risk | Severity | Mitigation / status |
|---|---|---|
| An operator reads the placeholder art as real storefront art | Low | Placeholder says "Image not set", carries an explicit alt text, and the panel prints the coverage sentence. The storefront never receives placeholders. |
| Unconfigured section now shows a form where previously there was only a button | Low–Medium (intentional UX change) | The form is local-only, has no submit control, is labelled "Draft only … nothing typed here is saved", and is gated on `marketing.manage` (+ `media.assign` for MEDIA). Review this in the browser before accepting. |
| A configure action preserves a dirty draft, so `pending` stays true and the section nav stays disabled until the operator saves or cancels | Low | Same rule as any other dirty form; `Cancel entry changes` clears it. |
| Preview composition differs from the public projection in one respect: it also shows **inactive** entries (pre-existing behaviour) | Low | Unchanged from Batch 0; the hero preview states it explicitly. Filtering by `isActive` would be a behaviour change outside this batch. |
| `HeroPreview` mounts the real carousel — cost of rendering the hero inside the admin page | Low | Lazy-loaded (`React.lazy`), mounted only on the Preview tab, autoplay disabled by `MotionConfig reducedMotion="always"`, wrapper `inert`. |
| The whole preview item array is rebuilt on every keystroke while the Preview tab is open | Low | Arrays are small (≤ 24 rows + ≤ 4 placeholders); no HTTP. Not profiled in a browser. |
| `alignPreviewMedia` reorders MEDIA rows to registry order | Low | MEDIA capacity is 1 per slot in the closed registry, so no ordering can be lost within a slot; orphan (invalid-slot) rows are preserved at the end. |
| Two new exports on `homepageContentModel` | Very low | Additive; no existing export changed. |

---

## 12. Browser acceptance — performed (see §15)

The checklist in the original version of this section has been **executed** in a real Chromium against the real stack. Every item is now backed by a screenshot and a measurement; the detailed evidence table is in `HOMEPAGE_CONTENT_CONTROL_CENTER_BATCH1_REVIEW_REPORT.md` §8.

| Checklist item | Result |
|---|---|
| 1. Unconfigured preview, no request | PASS — 0 API requests while typing and while previewing |
| 2. Local draft previews; configure keeps the draft | PASS (preview in browser; configure retention by test) |
| 3. Edited saved entry previews the edit | PASS — typed title rendered, saved title absent, row unchanged |
| 4. MEDIA placeholders + counts | PASS — 1 real image + 3 distinct "Image not set" plates |
| 5. Hero previews in-memory content, no autoplay | PASS — 3 slides incl. unsaved title, static for 4 s, 0 requests |
| 6. Two-tab 409 | PASS — exactly one PATCH, full draft retained, explicit reconcile |
| 7. 403 vs 5xx vs offline | PASS — three distinct messages, no retry storm |
| 8. Keyboard / focus / inert preview | PASS for keyboard and semantics; no screen reader was run |
| 9. Viewports | PASS at 1920×1080, 1366×768, 768×1024, 390×844 — 0 px overflow |
| 10. Employee workspace | PASS — real EMPLOYEE account, read-only, styled preview, 403 on admin routes |
| 11. Storefront unchanged | PASS — 0 storefront files changed; storefront renders identically |

---

## 13. Rollback

Uncommitted by design. To revert Batch 1 without touching the audit:

```
git checkout -- \
  frontend/src/components/admin/BackendHomeHeroPanel.jsx \
  frontend/src/components/admin/homepage/SectionContentEditor.jsx \
  frontend/src/components/admin/homepage/SectionPreview.jsx \
  frontend/src/components/admin/homepage/__tests__/homepageAllSections.test.js \
  frontend/src/components/admin/homepage/__tests__/homepageContentControl.test.js \
  frontend/src/pages/admin/media/AdminMarketingMedia.jsx \
  frontend/src/services/homepage/homepageContentModel.js

rm frontend/src/components/admin/homepage/previewModel.js \
   frontend/src/components/admin/homepage/HeroPreview.jsx \
   frontend/src/components/admin/homepage/__tests__/homepageBatch1.test.js
```

No database, storage object, media asset, product, permission or section row is affected by a rollback.

---

## 14. Stop point

Batch 1 is implemented and verified as far as this environment allows. **Not started:** Batch 2 (workflow collapse: F-10 publish summary, F-09 silent disable, F-23 dead-end tabs, F-16 reorder coverage, F-11 multi-select, F-03 media registration path). Awaiting review and approval before proceeding.

---

## 15. Addendum — the browser gate and the one defect it found (V-1)

The first browser run produced a blocking finding that neither the implementation nor the headless review could see, and it changed two files. It is recorded here because it changes the "files changed" inventory.

**Symptom.** With real seeded data at 1366×900, the preview showed the correct copy and images but **no design**: the saree section was 3930 px tall with `display:block` and a 16 px `Instrument Sans` heading; the category section was 3898 px and its four-tile collage was a stacked list; the hero `h1` was 16 px across 1088 px in the body font.

**Cause.** `frontend/src/components/customer/customer.css` scopes **771 selectors** — the design tokens, the base resets, `.hero`, `.saree__*`, `.collage*`, typography — under `.pf-root`, a class applied only by `CustomerStorefront.jsx`. `SectionPreview` and `HeroPreview` mounted the real components without that ancestor, so every scoped rule was inert. The data was right; the cascade was not.

**Fix (admin shell only).**

| File | Change |
|---|---|
| `frontend/src/components/admin/homepage/SectionPreview.jsx` | `data-preview-body` wrapper gains `className="pf-root"` + a comment explaining the dependency |
| `frontend/src/components/admin/homepage/HeroPreview.jsx` | same for `data-hero-preview-body` |
| `frontend/src/components/admin/homepage/__tests__/homepageBatch1.test.js` | new test `V-1 · section and hero previews mount inside the '.pf-root' storefront scope` (22 tests total) |

No storefront component, stylesheet, adapter or output was modified; the class is scoped to its own subtree.

**Measured after the fix** (same data, same viewport): `.saree__grid` → `display:grid` with 12 equal columns, section **788 px**, heading **71 px Cormorant Garamond**; category section **976 px** with the collage laid out and three dashed placeholders; hero **670 px**, `h1` **101 px Cormorant Garamond**. The admin chrome is unaffected and there is no horizontal overflow at 1920 / 1366 / 768 / 390 px.

**What the browser gate confirmed beyond the fix:** unconfigured preview with zero requests, saved-entry edit previews the typed value, new draft entry appears alongside the saved entries, hero preview follows unsaved edits and never autoplays, two-tab 409 keeps the whole draft and issues exactly one write, deleted-entry 409 re-bases as `POST` (never `…/items/undefined`), 403/500/offline produce three distinct messages, missing media stays visibly missing, the preview is `inert` for keyboard users, an employee session is read-only and still previews correctly, and the storefront is unchanged.

**Seed data was restored** after the conflict tests: the saree intro was saved back to `Six yards,three generations`, the throwaway entry deleted, and the section verified back at its 4 seeded rows.
