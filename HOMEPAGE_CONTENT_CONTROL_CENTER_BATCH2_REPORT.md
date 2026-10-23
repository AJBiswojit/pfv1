# PRATIKSHYA FASHION — Homepage Configuration Remediation, Batch 2

**Workflow collapse: one visible publish path, honest gates, fewer round-trips**
Status: **implemented and browser-verified; independently reviewed — see §15 for the three corrections applied during the review. Not committed. Batch 3 has not been started.**
Source of truth: `HOMEPAGE_CONTENT_CONTROL_CENTER_DETAILED_AUDIT.md` §7.1 / §8.G / §8.H / §8.I (findings F-10, F-09, F-23, F-16, F-11, F-03).
Date: 2026-10-23 · Branch: `arena/c72d2349-pfv1` @ `43bf640` (working tree, uncommitted).
Review: `HOMEPAGE_CONTENT_CONTROL_CENTER_BATCH2_REVIEW_REPORT.md` — verdict **APPROVE WITH EXPLICIT GAPS** (F-11 multi-create browser check blocked: no published products).

---

## 0. What was done, in one paragraph

The control center now tells the operator where a section stands and moves it forward with one visible action. A **publish summary** (`Section inactive · 2 entries (2 active)`), a four-step checklist and one **Publish section** button replace four differently named controls; the button chains the *existing* entry activation and section activation calls in their current order, feeding each response's `expectedRevision` into the next step, and stops on the first failure without ever retrying (F-10). **Save & publish** re-checks the same preconditions against the freshly saved snapshot before sending anything. The media rule that used to disable **Activate section** in silence is now printed in `#activation-reason`, referenced by `aria-describedby`, and — as the browser gate showed — it also disables **Publish section** instead of letting the operator hit a 403 on the last step (F-09). Type tabs with no registered slot are disabled and labelled **`· none`** from the section list, before any configure write (F-23). Reordering composes locally and commits **one** `PUT /reorder` on **Save order**, with a real **Move entry down** (F-16). Product curation stages a set and creates **one row per existing `POST /items`**, with per-row revisions and an exact partial-save report (F-11). Registration has a real entry point: the header **Register placement art** targets `/media#placement-art` (opens the panel and scrolls it into view), and the **hero MEDIA tab mounts the existing `PlacementAssetPanel` inline** so upload + placement registration happen where the art is missing (F-03).

**No backend file was touched.** No endpoint, DTO, schema, migration, permission code, publish rule, section key, slot key/capacity or storefront component changed. `POST /items` is still one row per call; there is no bulk endpoint. No automatic retry was added anywhere.

---

## 1. Scope actually delivered

| Finding | Delivered | Notes |
|---|---|---|
| **F-10** | Yes | Publish summary + checklist + `Publish section`; `Save & publish`; entry steps first, section last; revision chained per response; stops on first failure |
| **F-09** | Yes (extended) | `#activation-reason` + `aria-describedby` on **Activate section**; same rule now also blocks **Publish section** — found by the browser gate |
| **F-23** | Yes | Dead type tabs disabled + `· none` label + `#type-none-note`, derived from `allowedSlots` before any write |
| **F-16** | Yes | Local composition, `Move entry down` added, one `PUT /reorder` per committed group; singleton slots still show no reorder control |
| **F-11** | Yes | Multi-select staging, `Selected N … will be added as N entries`, already-used products disabled, N sequential creates, exact partial-save report |
| **F-03** | Yes | Header link → `/media#placement-art` (opens + scrolls the panel into view); hero MEDIA tab embeds the existing placement panel inline |

Deliberately **not** done (later batches, per §8.G): F-06, F-07, F-08, F-13, F-14, F-17, F-18, F-19, F-21, F-22, F-24, F-25, F-26, F-27 and S-01…S-06 remain open. Batch 1's accepted work (preview correctness, F-15 conflict retention, F-05 status classification, V-1 `.pf-root`) is preserved unchanged. **No Batch 3–6 finding was pulled forward or silently resolved.**

Two Batch 2 details are deliberately scoped out and documented rather than hidden:

- the hero has **no** per-entry publish summary — the hero is a placement with two writes and no section-level activation, and F-10 is scoped to sections #2–#12 in the audit;
- `RegisteredMediaPicker.jsx:72` still says *"Register media through the existing media library …"*. That file is Batch 3's copy-consolidation scope; with the inline panel now above the picker in the hero tab, no line is a dead end. It was intentionally not edited here.

---

## 2. Files changed

### New

| File | Lines | Why |
|---|---|---|
| `frontend/src/components/admin/homepage/publishModel.js` | 134 | Pure publish/reorder planning: `publishPlan`, `nextPublishStep`, `publishSummary`, `publishBlockers`, `sectionActivationReason`, `reorderGroupFor`. No React, no HTTP, no storage. |
| `frontend/src/components/admin/homepage/__tests__/homepageBatch2.test.js` | 479 | **17** focused regression tests (F-10 ×4, F-09 ×1, F-16 ×2, F-11 ×3, F-23 ×1, F-03 ×3, model ×1, non-regression ×2) against the real components and the real API clients. |

### Modified

| File | Delta (working tree, Batch 1 + Batch 2) | Batch 2 part |
|---|---|---|
| `frontend/src/components/admin/homepage/SectionContentEditor.jsx` | +333 / −66 | +~193 / −12: publish summary + chained publish + Save & publish, activation reason, staged products, local reorder, F-23/registration hint; Batch 1's preview/draft/conflict work untouched. |
| `frontend/src/components/admin/BackendHomeHeroPanel.jsx` | +52 / −2 | +13: inline `PlacementAssetPanel` disclosure (F-03). Batch 1's Edit/Preview + `HeroPreview` unchanged. |
| `frontend/src/pages/admin/media/AdminMarketingMedia.jsx` | +43 / −11 | +~34 / −5: `allowedSlots` → dead-tab disabling; header action now targets `/media#placement-art`; `registerHref` threaded to the editor; section switch selects an available type. |
| `frontend/src/pages/admin/media/AdminMediaLibrary.jsx` | +13 / −2 | Hash effect: `#placement-art` opens the panel, scrolls to it, `scroll-mt-24`; `aria-expanded`/`aria-controls` unchanged. |
| `frontend/src/components/admin/homepage/PublishedProductPicker.jsx` | +30 / −7 | Genuine multi-select mode (`onToggle`, `selectedIds`, `multiple`), `disabledIds`, remaining-capacity lock, staging status line; inspection mode unchanged. |
| `frontend/src/components/admin/homepage/__tests__/homepageAllSections.test.js` | +28 / −10 | Batch 2: reorder assertions now press **Save order** and assert "local until committed"; the dead-type test asserts disabled tabs and zero writes. |

Not modified (verified by `git status`): every `backend/` file, the RBAC/permission files, `services/homepage/homepageContentService.js`, `services/api/homepageApi.js`, `SectionPreview.jsx` (Batch 1 only), `components/storefront/**`, `customer/**`, `home-page/**`, the twelve section keys, and every slot key/capacity.

---

## 3. F-10 — one visible publish path, still four existing calls

**Root cause (audit):** four writes (`:122` configure, `:149-155` create inactive, `:132` activate entry, `:125` activate section) behind differently named buttons in different regions, with no statement of progress.

**Delivered**

- `publishSummary(section)` derives, from the section payload only: `text` (e.g. `Live on the storefront · 4 entries, all active.`, `Section inactive · 2 entries (2 active).`), a four-item `checklist`, `next`, `total`, `active`, `configured`, `live`, `ineligible`.
- `[data-publish-summary]` renders the sentence + checklist + `Publish section`; `#publish-reasons` lists every blocker in operator words.
- `Publish section` loops `nextPublishStep(latest)`: **activate inactive entries first** (`PATCH /items/{id}` `{expectedRevision, isActive:true}`), then **activate the section** (`PUT /sections/{key}` `{expectedRevision, isActive:true}`). Each step reads `section.revision` from the *previous response*; guard at 128 iterations; on failure the loop stops, the latest authoritative section is re-read, and the message reads `Publish stopped: …`. No retry.
- `Save & publish` saves the entry exactly as before (create stays `isActive:false`, then patch), then re-runs `publishBlockers` against the saved snapshot before continuing. If a precondition is missing it reports `Saved. Not published yet: …` and sends nothing further.
- Entries flagged `warning` by the server are never activated; they are reported instead.

**Preserved:** all four request shapes and their order are unchanged; only the triggering surfaces collapsed. Deactivate stays a single `PUT`.

**Evidence:** browser — one-step publish on `categories` = **one** `PUT`; two-step publish = `PATCH item (rev 6) → PUT section (rev 7)`; both end `Live on the storefront · 2 entries, all active.` Deactivate/restore returned the section to `inactive`. Tests — 4 F-10 cases (summary text, order/revision chain, Save & publish, failure stop).

---

## 4. F-09 — the media rule is explained, and it now blocks the right buttons

**Root cause (audit):** `SectionContentEditor.jsx:125` disabled **Activate section** when any active MEDIA entry existed and the actor lacked `media.assign`, with no explanation. Server truth: `homepage_content_service.write` → `configure` with `is_active` calls `check_media_grant(actor)` (requires `media.assign`) for every active MEDIA row.

**Delivered**

- `sectionActivationReason(section, { mediaAssign })` returns the sentence *"This section has an active media entry. Activating the section needs media.assign (ask an administrator)."* when the gate applies.
- The sentence renders in `#activation-reason`, and **Activate section** carries `aria-describedby="activation-reason"` and stays disabled.
- **Browser-found gap:** `Publish section` was still enabled for the same actor, because the plan contained only the section-activation step (all entries already active). `publishBlockers` now appends `sectionActivationReason(...)`; the button is disabled and `#publish-reasons` prints the same sentence, so the operator is never offered a path that must 403 at the end.
- The existing entry-level rule (`Publishing this section activates MEDIA entries…`) is retained for the case where an inactive MEDIA **entry** must be activated.

**Evidence:** browser, capability-poor admin (`marketing.view`, `marketing.manage`, `media.view` only): reason text rendered; Activate disabled with `aria-describedby="activation-reason"`; Publish disabled with the identical sentence in `#publish-reasons`; **0 write requests** other than sign-in. Screenshot `B2-F09-explain.png`. Test extended to assert the Publish block as well.

---

## 5. F-23 — dead type tabs are disabled before any write

**Root cause (audit):** the "no slot" message only existed inside the configured branch, so the operator configured a section to discover that a type was a dead end.

**Delivered (`AdminMarketingMedia.jsx`)**

- `allowedSlots` from the section list (present for configured **and** unconfigured sections) drives `typeCount` / `kindsFor`.
- A type with zero slots renders as `MEDIA · none` (etc.), `disabled`, `aria-describedby="type-none-note"`; a single `#type-none-note` explains the convention.
- When the list is unavailable, nothing is disabled — an unknown status is not a reason to block the UI.
- Selecting a section picks a type that exists in it, so the first render can never land on a dead tab.
- The editor's defensive `No {kind} slot is registered` message is retained for contract drift but is no longer reachable by clicking.

**Evidence:** browser — bestsellers tabs `[{MEDIA · none, disabled}, {PRODUCT}, {TEXT}]`; clicking the dead tab produced **0 writes**; the note is present. Tests — tab disabled + label + zero `PUT`s across five section/type pairs; a live type stays enabled with its plain label.

---

## 6. F-16 — compose locally, commit once, and allow “down”

**Root cause (audit):** one `PUT /reorder` per arrow click and no "Move down"; the backend supports grouped reordering.

**Delivered**

- `reorderGroupFor(sectionKey, contentType, row)` mirrors the server: `trust-items` (trust TEXT), `lookbook` (sarees MEDIA), `slotKey` (PRODUCT), otherwise `null` (singleton).
- Arrows mutate a local `order {group, ids}` — **no request**. The UI states *"Order changed locally — nothing has been sent yet."* with **Save order** / **Cancel order changes**.
- `Save order` sends exactly one `PUT /sections/{key}/reorder` `{expectedRevision, slotKey: group, contentType, itemIds}` — the group key is the server's group, and `itemIds` is the exact current membership.
- A pending order counts as unsaved work: section switching is blocked and a before-unload warning is raised.
- Groups of one still expose no reorder buttons (pinned by the existing singleton test).

**Evidence:** browser — arrow click = 0 writes and the local notice (visual order 2,1,3); **Save order** = one `PUT /sections/sarees/reorder` `{expectedRevision:12, slotKey:"lookbook", contentType:"MEDIA", itemIds:[…]}`; reversing and saving restored lookbook-1,2,3. Tests — 2 F-16 cases + updated all-sections assertions.

---

## 7. F-11 — stage many, create N rows, report exactly what happened

**Root cause (audit):** `PublishedProductPicker` rendered checkboxes but the parent stored one product; ticking a second replaced the first.

**Delivered**

- Picker: `multiple`, `selectedIds`, `onToggle`, `disabledIds`, `remaining`; already-used products are disabled and labelled *"already added to this slot"*; at capacity, further unselected tiles lock.
- Editor: `staged` is a set. The status line reads **"Selected N products · will be added as N separate entries (one existing call each). M products left in this slot."**; the submit button reads **Add N products**.
- Save issues one `POST /items` per product, `isActive:false`, each with the revision returned by the previous response. The first rejection stops the loop, re-reads the section, re-stages the unsaved rows and reports *"Added X of N products, then stopped at NAME: reason. No retry was attempted; M products remain selected."*
- A 409 additionally opens the explicit reconcile path; a transport failure sets "reload required". Nothing is retried automatically.
- Single selection still uses the same single-call path with the identical payload keys.

**Evidence:** tests — 3 F-11 cases (three sequential creates and one row each, mid-way failure report and staging, already-used disabled). Browser — the bestsellers PRODUCT tab renders the real staging sentence and the slot's remaining capacity (`Selected 0 products · will be added as 0 separate entries (one existing call each). 8 places left in this slot.`) against the live backend; the seeded catalogue has **0 published products**, so no product row could be selected, and creating catalogue data was out of scope. The N-write loop is therefore covered by the RTR suite against the same request shapes, not by a browser run — stated as a gap in §14.

---

## 8. F-03 — a real registration entry point

**Root cause (audit):** `AdminMarketingMedia.jsx:78` pointed "Register media" at `/media/upload`, which is pinned to the product namespace and cannot register hero/marketing art. The real control lived behind a disclosure on another page.

**Delivered**

- Header action renamed **Register placement art**, targeting `${prefix}/media#placement-art`.
- `AdminMediaLibrary`: a hash effect opens the placement disclosure (already open by default), scrolls it into view (`scroll-mt-24`) and leaves collapse behaviour intact. Existing ids `placement-art`, `placement-art-toggle`, `placement-art-panel` are unchanged.
- `SectionContentEditor` receives `registerHref` and prints a hint under the MEDIA form: *"No usable art yet? Upload and register placement art"*.
- **Hero MEDIA tab:** a disclosure mounts the **existing `PlacementAssetPanel` unchanged** (`apiUploadMediaObject` → `apiRegisterPlacementAsset`, namespaces `hero/` and `marketing/`, register-by-key form). It is gated on `contentType === 'MEDIA'`, an admin session and `access.create` (`media.upload`) — the endpoint is admin-only and needs `media.upload`, so employees never see it. After a registration the placement is re-read (public refresh not requested).

**Evidence:** browser — clicking the header link lands on `#placement-art` with `aria-expanded="true"` and the panel in view; the hero tab shows exactly one disclosure containing **Upload and register**, one file input and **Register** (by key); submitting empty reports *"Choose an image file first (JPEG, PNG, WebP or AVIF)."* with **0 write requests**; a `media.view`-only admin sees **0** disclosures and **0** header links. Screenshots `B2-placement-landing.png`, `B2-hero-register.png`, `B2-hero-register-limited.png`. Tests — 3 F-03 cases (header target, editor hint, hero inline panel + employee hidden).

---

## 9. Data safety — what could not change, and did not

| Invariant | Status |
|---|---|
| Backend files / contracts | 0 changed (`git status` verified) |
| `POST /items` one row per call | Preserved; N staged products = N requests |
| `PUT /reorder` payload and membership rule | Preserved; the UI now sends the server's group key once |
| Publishing semantics / `check_media_grant` | Unchanged; the UI now predicts the same rule instead of hitting it |
| Section keys, slot keys, capacities | Unchanged |
| Permission vocabulary | Unchanged; no new permission is required or invented |
| Storefront components / adapters / CSS | Unchanged |
| Automatic retries | None added; every failure needs an explicit operator action |
| `home-page/` reference tree | Unchanged |

---

## 10. Tests and evidence

### 10.1 Exact commands and actual results

| # | Command (from `frontend/`) | Result |
|---|---|---|
| 1 | `node --import ./scripts/node-loader/register.mjs --test src/components/admin/homepage/__tests__/homepageBatch2.test.js` | **17 tests, 17 pass, 0 fail** |
| 2 | `… --test src/components/admin/homepage/__tests__/*.test.js` | **155 tests, 154 pass, 1 fail** — only the pre-existing inventory test (`section inventory matches all twelve reference components in order`, `home-page/` ENOENT) |
| 3 | `… --test` on all storefront + design-system test files (`src/components/storefront/**`, `src/design-system/__tests__`) | **186 tests, 186 pass, 0 fail** |
| 4 | `npm test` (entire `tests/` + `test/`) | **850 tests, 839 pass, 10 fail, 1 skipped** — identical to the pristine baseline |
| 5 | `npm run build` | **success** — `dist/index.html 3,118.52 kB │ gzip 977.89 kB`, built in 9.01 s |

Baseline context: Batch 1 ended at 850/839/10 with `dist/index.html 3,107.68 kB │ gzip 975.24 kB`. The +10.8 kB is `publishModel.js` + the hero's inline placement panel in the admin chunk; the storefront bundle is untouched. The ten `npm test` failures, the one skipped test and the inventory failure are **pre-existing** and were not altered, skipped or weakened.

### 10.2 Test-only changes to existing files

`homepageAllSections.test.js` changed only where Batch 2 changed behaviour:

- the reorder tests now assert "no request until Save order" and then press **Save order** (previously the arrow itself wrote);
- the unsupported-type test now asserts a disabled `· none` tab and zero writes **before** configuration, replacing a path that can no longer be reached by clicking. The old defensive message remains in the component and is covered by the F-23 unit test's absence assertions.

No assertion was deleted or loosened; no test was skipped.

---

## 11. Browser acceptance — performed against the real stack

Environment: Vite dev server on `:5173`, FastAPI on `:8000`, real PostgreSQL, real seeded homepage rows, Chromium (Playwright) with a real admin session. Screenshots under `/tmp/shots/`.

| # | Check | Result |
|---|---|---|
| 1 | F-10 summary accuracy | PASS — sarees: `Live on the storefront · 4 entries, all active.`; categories: `Section inactive · 2 entries (2 active).` |
| 2 | F-10 one-step publish | PASS — categories `PUT /sections/categories` → `Live on the storefront · 2 entries, all active.` (single write) |
| 3 | F-10 two-step publish | PASS — categories `PATCH item (rev 6)` then `PUT section (rev 7)` → live; revisions chained from responses |
| 4 | F-10 Save & publish | PASS — sarees TEXT: `POST /items` (`isActive:false`) then `PATCH /items/{id}` `{expectedRevision:15,isActive:true}`; entry Active; row removed afterwards |
| 5 | F-16 local composition + one write | PASS — arrow 0 writes; `Save order` exactly one `PUT /reorder` with exact membership; order restored to 1,2,3 |
| 6 | F-23 dead tabs | PASS — bestsellers `MEDIA · none` disabled; click = 0 writes; `#type-none-note` present |
| 7 | F-03 header target | PASS — `/super-admin/media#placement-art`; hash set, panel scrolled into view, `aria-expanded="true"` |
| 8 | F-03 hero inline registration | PASS — one disclosure, `Upload and register`, file input, register-by-key; empty submit message; 0 writes |
| 8b | F-11 staging surface | PASS (surface only) — bestsellers PRODUCT shows the staging sentence + `8 places left`; the live catalogue has 0 published products, so no row could be staged (see §14) |
| 9 | F-03 permission gating | PASS — `media.view`-only admin: 0 disclosures, 0 header links |
| 10 | F-09 explanation | PASS — reason rendered; Activate disabled + `aria-describedby`; **Publish also disabled** with the same sentence; 0 writes besides sign-in (`B2-F09-explain.png`) |
| 11 | Responsive 1920 / 1366 / 768 / 390 | PASS — 0 px horizontal overflow; summary + four checklist items present at every width (`B2-responsive-*.png`) |
| 12 | Console health | PASS — only `fonts.googleapis.com` fails (`ERR_CONNECTION_CLOSED`; the sandbox has no access to it). No application console error or page error. |

**Data restored.** categories: inactive, `intro` TEXT active, `women` MEDIA active (matches seed). sarees: `lookbook-1 Banarasi`, `lookbook-2 Kanjivaram`, `lookbook-3 Chanderi`; `intro = "Six yards,three generations"`; the throwaway "Batch two publish check" entry is gone; no extra rows exist.

**Test account.** `batchnoassign.admin@pratikshyafashion.com` (id `7b65ade0-5521-4415-8757-8e53e76e8d06`, `PF-SLS-33847`) was created for F-09 and its capability set was changed with `PUT /admin/employees/{id}/permissions` to exactly `marketing.view`, `marketing.manage`, `media.view`, because a role-based ADMIN grant expands to all `media.*` codes (`media.manage → media.assign`) and could never reproduce the gate. Sign-in now returns exactly those three codes. This is local test data, not production.

---

## 12. Regression risks

| Risk | Severity | Mitigation / status |
|---|---|---|
| Publish now refuses a section activation the server would reject (media rule) | Low (intended) | Same sentence as Activate; test pins it. It removes a guaranteed 403, not a capability. |
| A chained publish leaves a partially activated state (e.g. entries active, section not) | Medium | Each step is an existing call with CAS; the loop stops on the first failure, reloads authoritative state and names what happened. No rollback is attempted, by design. |
| Reorder is now two actions (move, then Save order) | Low–Medium (intentional) | The pending state is visible, blocks section switching, warns on unload, and can be cancelled without a request. |
| Staged product loop can partially succeed | Medium | Server CAS prevents silent corruption; the UI names every saved and remaining product and stops. Nothing retries. |
| Hero inline registration adds an admin panel to the hero tab | Low | Disclosure is collapsed by default, admin-only, and reuses the existing panel with its existing permission checks (`media.upload`). |
| Dead tabs derived from a stale/absent section list | Low | Nothing is disabled while the list is unknown or failed; once loaded, only zero-slot types are disabled. |
| `?`-state of `RegisteredMediaPicker` guidance copy | Low | Left for Batch 3; the inline panel above it removes the dead end in the hero tab. |
| Bundle growth | Very low | +10.8 kB raw / +2.65 kB gzip versus Batch 1; admin chunk only. |

---

## 13. Rollback

Uncommitted by design. To revert **Batch 2 only** without disturbing Batch 1:

```
git checkout -- \
  frontend/src/components/admin/homepage/PublishedProductPicker.jsx \
  frontend/src/pages/admin/media/AdminMediaLibrary.jsx

# Revert the Batch 2 hunks inside these shared files, keeping Batch 1's:
#   SectionContentEditor.jsx, BackendHomeHeroPanel.jsx,
#   AdminMarketingMedia.jsx, homepageAllSections.test.js

rm frontend/src/components/admin/homepage/publishModel.js \
   frontend/src/components/admin/homepage/__tests__/homepageBatch2.test.js
```

No database row, storage object, media asset, product, permission or section key is affected by a UI rollback. The one durable side effect of this batch's verification is the test-admin capability set described in §11.

---

## 14. Stop point

Batch 2 is implemented, tested and browser-verified. **Not started:** Batch 3 (language/component consistency: F-06, F-08, F-24, F-25, F-22, F-21, F-18, F-14, shared `EntryRow`/`SaveBar`/`COPY_FIELDS`) and every later batch. Awaiting independent review before proceeding.

### Known gaps / blocked checks

- No screen-reader run and no full keyboard-only pass; both are Batch 5 scope. The changed controls do carry `aria-describedby` and `disabled` appropriately.
- Multi-row product creation was **not** exercised in the browser: the seeded catalogue contains 0 published products, so no product could be staged without creating catalogue data (out of scope without approval). The loop's request shapes, revision chaining and partial-failure report are covered by the RTR suite; the browser verified only the staging surface and capacity sentence.
- Hero **TEXT** view has no registration panel by design (no MEDIA slot in that view).
- `home-page/` remains absent in this checkout, so the inventory test stays red; it is the Batch 6 item F-26.

---

## 15. Addendum — independent review gate (two defects and one copy defect, corrected)

The independent review (`HOMEPAGE_CONTENT_CONTROL_CENTER_BATCH2_REVIEW_REPORT.md`) re-ran the batch against the working tree and found three real problems that the original suite did not cover. All three are fixed in `SectionContentEditor.jsx`; nothing else changed in the shipped code.

1. **F-11 — a partial multi-slot save re-targeted the staging at the wrong slot.** After the first product of a batch was stored and a later one rejected, the refresh (`afterWrite → reset`) cleared the slot selection, so the re-staged leftovers were aimed at the section's first open slot rather than the slot the operator chose — a retry could have saved them in the wrong place. The refresh also cleared the `dirty` flag, leaving "Add N products" disabled while the message said the rows were still selected. The failure path now restores the batch slot and marks the restored staging as pending work.
2. **F-16 — a pending reorder in one group was silently discarded when another group was moved.** The editor held one `order`; sections with several PRODUCT slots expose several reorder groups, and composing a second group's move replaced the first. Orders are now kept per group, each pending group has its own **Save order** / **Cancel order changes**, and committing one group restores the others. A reconcile that removes rows keeps the composed order visible but blocks the doomed save with an explicit sentence.
3. **Copy — composed failure sentences ended in `..`** because the backend messages already end with a full stop. A `sentence()` helper trims the trailing punctuation before appending; pinned by assertions.

**Updated figures after the corrections**

| Item | Value |
|---|---|
| `homepageBatch2.test.js` | **781 lines, 34 tests, 34 pass** (was 479 / 17) |
| `SectionContentEditor.jsx` | 465 lines, working-tree delta **+360 / −66** (Batch 1 + Batch 2) |
| Homepage control-centre suites | **172 tests, 171 pass, 1 fail** — only the pre-existing `home-page/` inventory failure |
| Storefront + design-system suites | **186 / 186** |
| `npm test` | **850 / 839 pass / 10 fail / 1 skipped** — identical baseline |
| `npm run build` | **success**, `dist/index.html 3,118.94 kB │ gzip 978.13 kB` |
| Backend contracts | `verification/unit/test_homepage_content.py` + `test_marketing_media.py` + `test_admin_consolidation_rbac.py` = **113 passed, 1 pre-existing failure** (`test_migration_graph_one_new_head`); disposable-PG acceptance **skipped** (no approved target) |

The worked browser evidence in §11 remains valid; the failure-injection run now additionally shows the corrected single full stop. The review report carries the current, per-finding verdicts and the blocked check (F-11 multi-create in a real browser: the seeded catalogue has 0 published products).
