# Homepage Content Control Center — Batch 3 (Language & component consistency)

**Scope:** audit §8.G Batch 3 only — F-08, F-06, F-24, F-25, F-22, F-21, F-18, F-14, plus the
presentation-only extraction of F-07 (`EntryRow`, `SaveBar`, `COPY_FIELDS`/`CopyField`, `SlotMeter`).
Frontend only. No backend, schema, migration, route, permission, section-key, slot-capacity,
storefront-component or dependency change. `home-page/` untouched.

Companion change outside Batch 3: the database error classification in
`backend/app/core/error_handlers.py` (see the chat report, §1).

---

## 1. What changed, finding by finding

| ID | Defect | Change | Files |
|---|---|---|---|
| **F-08** | Six copy fields printed the request keys (`eyebrow`, `ctaHref`, …), with no help text and no length limits | One `COPY_FIELDS` descriptor (label, help, `maxLength`, `multiline`) + a `CopyField` renderer: `Kicker`, `Title`, `Subtitle`, `Button label`, `CTA destination`, `Image description`; limits 100/255/500/100/500/2000 mirror `schemas/media/homepage.py`; subtitle and image description become textareas; counter appears from 80 % of the limit | `homepage/copyFields.jsx` (new), `SectionContentEditor.jsx`, `BackendHomeHeroPanel.jsx` |
| **F-06** | Entry rows printed `slotKey · <uuid> · Active` and showed no artwork | Row now renders a 56×56 thumbnail from `row.media.url`, a human slot label (`lookbook-1` → “Lookbook 1”), a real title or an explicit “Untitled media entry”, and a status chip. A raw asset id is printed only when there is no art to show | `homepage/EntryRow.jsx` (new), `SectionContentEditor.jsx`, `BackendHomeHeroPanel.jsx` |
| **F-07** | Two editors duplicated row, save bar and copy fields and had already drifted | Presentation-only extraction: `EntryRow` (row/cover variants), `SaveBar` + `buttonClass`, `COPY_FIELDS` + `CopyField`, `SlotMeter`. Transport, state and services stay per panel | 4 new files + both editors |
| **F-14** | Every failure rendered as one paragraph above the list | `fieldErrorsFor()` maps the copy-related 422s (CTA pair, CTA form, meaningful copy, alt text) onto `ctaLabel`/`ctaHref`/`title`/`altText`; the sentence is shown verbatim under that field with `aria-invalid` and `aria-describedby`; a deterministic preflight (CTA pair, single-slash rule) blocks the request; unmatched errors keep the old alert | `SectionContentEditor.jsx`, `homepage/copyFields.jsx` |
| **F-18** | `<fieldset disabled>` also disabled “Retry media library” | The fieldset now only groups (`aria-disabled`); search, scope, tiles and paging are disabled individually, Retry stays reachable, and a `disabledReason` line names the missing `media.view` | `RegisteredMediaPicker.jsx`, `SectionContentEditor.jsx` |
| **F-21** | `HOMEPAGE_SECTIONS[].live` said only the hero is live | Replaced by `pipeline: 'marketing' \\| 'sections'` (hero = marketing, the other eleven = sections); liveness still comes only from the HTTP read | `services/homepage/homepageContentModel.js`, `AdminMarketingMedia.jsx` comment, `homepageContentControl.test.js:142` |
| **F-22** | Newsletter caveat printed twice; promotion caveat printed below the form | One caveat per section, rendered in the page header above the type tabs and the editor; the editor's two trailing paragraphs are gone | `AdminMarketingMedia.jsx`, `SectionContentEditor.jsx` |
| **F-24** | One button style for every intent; two panel generations | `SaveBar` exports three variants — primary (`bg-pf-burgundy text-pf-ivory`), secondary (`border-pf-border-strong`), destructive (`text-pf-error border-pf-error/40`); the section editor is wrapped in `AdminPanel` (“Section content” / “Media entries”) like the hero panel | `homepage/SaveBar.jsx` (new), both editors |
| **F-25** | Structural borders used the decorative hairline token | Inputs, selects, the picker fieldset/tiles, product tiles and form controls now use `pf-border-strong`; `pf-border` stays for dividers/hairlines | `SectionContentEditor.jsx`, `RegisteredMediaPicker.jsx`, `PublishedProductPicker.jsx`, `BackendHomeHeroPanel.jsx` |

Deferred by design: the audit's optional “overflow menu” for F-06 is **not** implemented — the
existing action buttons are unchanged, so no new interaction pattern enters a live screen.

---

## 2. Tests

**New file** `frontend/src/components/admin/homepage/__tests__/homepageBatch3.test.js` — **14 tests**, one or
more per finding: labels/limits/help/textarea, 80 % counter, thumbnail + human slot + untitled fallback,
shared primitives, CTA preflight (0 requests), mapped 422 under the field, unmapped 422 keeps the alert,
Retry reachable while disabled, model pipeline, single caveat above the editor, primary vs destructive
classes, `AdminPanel` chrome, `pf-border-strong` on inputs/select/`SlotMeter`/picker tiles.

**Locator-only edits to existing suites** (no assertion removed, relaxed, skipped or reordered):

| File | Edit | Why |
|---|---|---|
| `homepageAllSections.test.js` | `fill` matches the label text case-insensitively; reads `input` **or** `textarea`; three inline `text(l) === 'title'` → the same helper | F-08 renamed labels and made `subtitle` a textarea |
| `homepageBatch1.test.js` | same two helpers; `ctaHref` → `CTA destination`, `ctaLabel` → `Button label` at `fill`/`fieldValue` call sites | F-08 labels |
| `homepageBatch2.test.js` | same helper | F-08 labels |
| `homepagePersistence.test.js` | same helper + one inline title lookup | F-08 labels |
| `homepageContentControl.test.js` | `s.live` → `s.pipeline === 'marketing'` (plus a guard that no section declares `live`); product-search input located by its new `pf-border-strong` class | F-21 model rename, F-25 token change |

The F-22 copy keeps the two sentences the existing suites already asserted
(“no sign-up is simulated”, “cannot create/apply discounts, codes or expiry dates”), so those
assertions were satisfied by the moved text rather than edited.

---

## 3. Verification (executed)

| Check | Result |
|---|---|
| Homepage suites (`src/components/admin/homepage/__tests__/*.test.js`, 6 files) | **186 tests — 185 pass, 1 fail** (the pre-existing `home-page/` inventory test) |
| `homepageBatch1` | 22 / 22 |
| `homepageBatch2` | 34 / 34 |
| `homepagePersistence` | 14 / 14 |
| `homepageAllSections` | 71 / 71 |
| `homepageContentControl` | 30 / 31 (only the known `home-page/` failure) |
| `npm test` (whole frontend) | **850 tests — 839 pass, 10 fail, 1 skipped** — byte-for-byte the documented baseline (9 stale `SUPER_EMPLOYEE`/login tests + the `home-page/` inventory); no new failure |
| `npm run build` | ✓ 3,124.67 kB (gzip 980.46 kB) — +5.73 kB over the Batch 2 build, all from the new shared components |
| Storefront + design-system glob | 48 / 48 |
| Backend (Part A) | **173 tests, 0 failures** across the error-envelope, audit, marketing-media, RBAC, homepage-content, API-contract and new classification files |

### Real browser (Chromium, real backend, real DB — read-only for data)

* **F-06** — `Saree lookbook → MEDIA` rows read “Lookbook 1 · Active · Banarasi”, thumbnails
  `/api/v1/media/objects/marketing/media1..3.png` load at 56×56 (`naturalWidth 800`), alt text preserved.
  No UUID appears in any row.
* **F-08** — rendered labels are exactly `Kicker / Title / Subtitle / Button label / CTA destination /
  Image description`; measured `maxLength` 100/255/100/500; two textareas; help text visible.
* **F-24** — the save control computes to `background rgb(74,7,24)` (#4A0718) with `rgb(251,244,235)`
  text; the panel header reads “SECTION CONTENT / Media entries” with the gold rule.
* **F-25** — input/select borders resolve to `pf-border-strong`; `SlotMeter` reads
  “men · 0 of 1 used · 1 place left”.
* **F-14** — on `Saree lookbook → TEXT` a title plus a CTA destination and **no** button label produced
  **0 write requests**, the message “Button label and destination must be supplied together.” under both
  fields, `aria-invalid="true"`, and `aria-describedby="copy-ctaHref-help copy-ctaHref-error"`.
* **F-22** — the promotion caveat and the newsletter caveat each occur **once** and both occur before
  the editor form in document order.
* **Data safety** — after the browser pass: `categories` revision 29 / 2 rows, `sarees` revision 27 /
  4 rows, 6 authored rows in total, 7 media assets — identical to the pre-Batch-3 state. No row,
  asset, account, permission or revision was created or changed.
* One console entry (`fonts.googleapis.com`, `ERR_CONNECTION_CLOSED`) is the sandbox's blocked
  external font request, not an application error.

---

## 4. Remaining failures and unverified items

1. `homepageContentControl` → “section inventory matches all twelve reference components in order”
   fails on the absent `home-page/` reference directory. **Pre-existing baseline** (Batch 6 scope).
2. `npm test` keeps its 10 baseline failures (stale `SUPER_EMPLOYEE` routing/delegation expectations and
   `tests/unifiedLogin.test.js`). Untouched, not caused by this batch.
3. **F-18 in a browser is unverified.** Proving the dead-end needs an account without `media.view`;
   none was created for this batch. Covered by a component test instead.
4. Batch 5 items stay open: screen-reader pass, focus/announcement pass, `ConfirmDialog` adoption,
   measured contrast.
5. F-06's optional overflow menu is deferred (see §1).
6. F-11 multi-row product staging remains browser-blocked: the seeded catalogue has **0** published
   products. Component coverage only.

---

## 5. Working tree

16 modified tracked files and 17 untracked files (7 reports + 10 source/test files); **nothing staged**; no commit, push, deploy, reset, revert or stash. Batch 1 and Batch 2 code,
reports and tests are intact: R-1 (`setEditing(null)` on a vanished row) and V-1 (`.pf-root` on both
preview bodies) are unchanged.
