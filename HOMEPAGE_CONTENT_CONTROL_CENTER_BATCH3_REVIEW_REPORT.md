# Homepage Content Control Center — Batch 3 + Part A: Independent Review

**Verdict: APPROVE WITH EXPLICIT GAPS**

Reviewed from the working-tree diff itself (not from the implementation report), re-ran every
suite independently, and re-drove the browser checks. Two defects were found in Batch 3; both were
corrected with the smallest possible change and one regression test, then all affected checks were
re-run. Part A passed with no defects. The gaps below are verified limitations, not unknown risk.

---

## 1. Part A — database error classification

| Review requirement | Result | Evidence |
|---|---|---|
| Schema vs query/type are distinguished | **Pass** | SQLSTATE is read before any text: `_SCHEMA_SQLSTATES {42P01, 42703}` → `schema`; `_QUERY_SQLSTATES {42883, 42804, 42846, 42725, 42P18}` → `query`; `_CONNECTION_SQLSTATES {08*, 57P01–57P03}` → `unavailable`. The string fallback tests `operator does not exist` **before** `does not exist`, which is the exact ordering bug that produced the false migration advice. |
| Wrapped and direct driver exceptions | **Pass** | `postgres_sqlstate()` inspects `exc.orig` first and then `exc` itself; asyncpg exposes `sqlstate`, psycopg2 exposes `pgcode`; only 5-character values are accepted. Classifier unit rows cover both shapes. The FastAPI handler only ever sees SQLAlchemy wrappers (`OperationalError`/`DBAPIError`/subclasses) — confirmed by the passing end-to-end tests that raise `ProgrammingError` and `DBAPIError`. |
| Unrelated DB errors keep a safe fallback | **Pass** | Anything unmatched → `unavailable` → **503 `DATABASE_UNAVAILABLE`**, the pre-existing response. `test_unrelated_dbapi_failure_keeps_the_existing_fallback` pins it. |
| No SQL / schema / secret / stack leakage | **Pass** | Responses carry a fixed sentence and `details: {}` only. `test_query_error_does_not_leak_sql_or_schema_names` greps the raw body for `jsonb`, `catalog_product`, `SELECT`, `character varying`, `additional_images`, `pratikshya` — all absent. The full text and SQLSTATE go to the server log only. |
| Envelopes and unrelated mappings compatible | **Pass** | `{success:false, error:{code,message,details}}` is identical to the `AppException`, 422, `HTTPException` and generic-500 handlers. `test_phase3_error_envelope.py`, `test_api_contract.py`, `test_admin_consolidation_rbac.py`, `test_marketing_media.py` and `test_homepage_content.py` all pass unchanged. Grepped the whole repo: no client or route consumes any `DATABASE_*` code, so `DATABASE_QUERY_ERROR` is additive. |
| JSONB fix + deletion still work | **Pass** | `media_reference_audit.py` untouched by this change; audit suite 20/20. Live against the local API: upload **201** → register **201** → DELETE **200** with `audit {productMedia:0, productLegacy:0, homepageSection:0, marketingPlacement:0}` → repeat **404**; assets 7 → 8 → **7**. An account holding `marketing.view/manage + media.view` but **not** `media.delete` got **403** `"Missing required permission: media.delete"`. |
| New test file is Git-ignored | **Confirmed** | `backend/.gitignore:55:tests/` matches it (`git check-ignore` output). **Options, none applied:** (a) `git add -f backend/tests/unit/test_database_error_classification.py` — consistent with the 51 test files already tracked under `backend/tests`; (b) narrow the rule to `backend/tests/**` plus an explicit exception (or use `!` negation) and re-add; (c) move the file under `backend/verification/unit/`, which is not ignored but breaks the `tests/unit` convention. (a) is the smallest and needs no config change, so it needs only your approval. |

**Independent results:** `test_database_error_classification.py` → **21 passed, 0 failed**. Eight-file
backend selection (classification, error envelope, media audit, marketing media, RBAC consolidation,
API contract, homepage content, media schema integrity) → **173 passed, 0 failed, 1 skipped**; the
skip is the documented `test_media_schema_integrity.py` guard requiring database `pratikshya_local`
(this run points at `pratikshya_fashion`).

**Non-defect observations (unchanged behaviour, deliberately not touched):** integrity/constraint
errors (class 23) and privilege errors (42501) still fall through to 503 `DATABASE_UNAVAILABLE`,
exactly as before this change; and the HTTP handler is registered on the SQLAlchemy classes, so a bare
driver exception raised outside SQLAlchemy would reach the generic 500 handler (the classifier itself
handles both shapes).

---

## 2. Batch 3 — finding by finding

| ID | What the diff actually does | Review |
|---|---|---|
| **F-08** | `COPY_FIELDS` descriptors + `CopyField` renderer; labels `Kicker / Title / Subtitle / Button label / CTA destination / Image description`; `maxLength` 100/255/500/100/500/2000; subtitle and image description are textareas; counter from 80 %; help text in a sibling element with `aria-describedby` | **Pass.** Limits match `backend/app/schemas/media/homepage.py:68-73` exactly (verified line by line). Browser measured `eyebrow=100, title=255, ctaLabel=100, ctaHref=500`, `textarea copy-subtitle:500`, `copy-altText:2000`. Help/counter/error live **outside** the `<label>` so the accessible name stays exact — that is what keeps the existing label-based locators honest. |
| **F-06** | `EntryRow`: 56×56 thumbnail from `row.media.url` (safety-checked with `isSafeMediaUrl` + `resolveMediaUrl`), humanised slot label, real title or “Untitled …”, status chip; raw asset id only when there is no art | **Pass.** Browser rows render “Lookbook 1 / Active / Banarasi”, `img` 56×56 with alt “Banarasi drape” and a resolved `/api/v1/media/objects/...` src; `uuidLeak` is **false**. |
| **F-07** | `EntryRow`, `SaveBar`+`buttonClass`, `COPY_FIELDS`+`CopyField`, `SlotMeter` | **Pass.** Static check: none of the four files imports a service/API, and none contains `useState`/`useEffect`/`fetch` — presentation only. Transport remains in each panel (editor: three `writeHomepageSection` call sites, unchanged; hero: its own five service operations). No duplicated state was introduced. |
| **F-14** | `fieldErrorsFor()` maps CTA-pair/CTA-form/meaningful-copy/alt-text failures onto their fields; preflight blocks CTA-pair and single-slash violations before any request; unmatched errors keep the existing alert | **Pass, with the one directional caveat below.** Browser: title + destination without a label → **0 write requests**, message under both fields, `aria-invalid="true"`, `aria-describedby="copy-ctaHref-help copy-ctaHref-error"`. The editor trims before validating and the client rule (`safeCtaHref`) never percent-decodes, so it is strictly **more permissive** than the server and can never block input the server accepts; an encoded value simply reaches the server and comes back mapped to the same field. |
| **F-18** | Fieldset no longer `disabled`; search/scope/tiles/paging disabled individually; Retry operable; `disabledReason` explains the missing `media.view` | **Pass.** Component test 15/15 covers it. No authorization bypass: `loadRegisteredImages()` evaluates the actor's grants **locally** (`staffHomepageAccess()` for employees, `homepageAccess()` for admins) before any `apiClient` call, so an enabled Retry re-evaluates the same guard and issues no network call. |
| **F-21** | `live` removed; `pipeline: 'marketing' \\| 'sections'` on all twelve | **Pass.** `pipeline` has no consumer anywhere in `src` (grep: only an unrelated fulfilment `pipeline`), so it cannot be mistaken for publication status; liveness still comes from `sectionStatusLabel()` on the HTTP read. The suite asserts both the rename and the absence of `live`. |
| **F-22** | One caveat per section in the page header, above the type tabs and the editor; the editor's trailing duplicates deleted | **Pass.** Browser: newsletter cue **1×**, promotion cue **1×**, both before the editor form in document order. The two sentences the existing suites assert were preserved verbatim inside the moved copy. |
| **F-24** | Three variants from `SaveBar`; section editor wrapped in `AdminPanel` | **Pass.** Computed styles: primary `rgb(74,7,24)` bg / `rgb(251,244,235)` text; secondary cream bg with `rgb(166,138,104)` border; destructive transparent with `rgb(168,68,72)` text and a 40 % error border. Panel renders “Section content / Media entries”. |
| **F-25** | Structural borders → `pf-border-strong` | **Pass.** Measured input border `rgb(166,138,104)` = `#A68A68`; hairlines, dividers and empty-state dashes keep `pf-border`. |

**Assertions:** the four existing suites were changed only in *how* a control is located (case-insensitive
label match, `input`-or-`textarea`, two renamed CTA labels, one class string, one `live` →
`pipeline` assertion that is now accompanied by a stricter “no `live` field” check). No assertion was
deleted, relaxed, reordered or skipped. `npm test` still reports exactly 850 tests, so no test
disappeared.

### Batch 1 / Batch 2 guarantees

* **R-1 (409 conflict retention):** all three write paths still branch on `status === 409`, keep the
  typed draft, state “No retry has been attempted and nothing was overwritten”, and leave recovery to
  the operator. Batch 3 only added the `fieldErrorsFor()` mapping on *other* statuses; it did not touch
  the 409 branch. The Batch 1 regression test (renamed entry deleted by someone else → 409) passes.
* **V-1 (storefront-scoped previews):** both previews still mount inside `<div className="pf-root" inert …>`
  (`SectionPreview.jsx:82`, `HeroPreview.jsx:45`) — re-read in the diff, `homepageBatch1` green.
* **Publish sequencing:** unchanged — the loop walks `nextPublishStep()` (entry activations first, then
  the section `put` with the revision returned by the previous response), stops on the first failure,
  never retries, and has the 128-step guard. Batch 3 did not alter `publishModel.js` behaviour.
* **Conflict recovery / staged-product recovery:** the Batch 2 suites that pin them are unchanged and
  green (34/34), including the “reorder stays local until *Save order*” and “no PUT for dead tabs”
  checks.

---

## 3. Defects found and corrections applied

**D-1 (medium, UI truthfulness) — the hero TEXT tab printed a false missing-art warning.**
`EntryRow` defaulted its cover placeholder to “No safe media preview available.” whenever no `notice`
was supplied. The hero's TEXT view deliberately renders no image for rows that *do* have artwork, so
every TEXT row claimed the media was missing. Fixed in `EntryRow.jsx` by rendering the cover
placeholder only when a notice is explicitly passed (the hero already passes one for MEDIA rows with an
unsafe/absent URL). Regression test added to `homepageBatch3.test.js`
(“review · the hero TEXT tab never claims the artwork is missing”); proven to fail on the pre-fix code
(15 tests → 14 pass / 1 fail) and pass afterwards (15/15). Browser re-check: hero TEXT 3 rows, **no**
warning, 0 images; hero MEDIA 3 rows, 3 images.

**D-2 (low, ARIA consistency) — `aria-disabled` on a group containing an operable control.**
The picker's fieldset carried `aria-disabled` while “Retry media library” inside it stays enabled by
design; a group announced as disabled with a working child is contradictory. The attribute was removed
(the individual controls already carry their own `disabled`). No test change required.

No other defect was found. In particular: no stale props (all row/panel props are derived per render),
no duplicated state, no new request in any primitive, no unauthorized write path, and no change to the
JSONB query, schema, migrations, permissions, routes or storefront components.

---

## 4. Independent verification results

| Check | Result | Baseline / comparison |
|---|---|---|
| `homepageBatch1.test.js` | **22 / 22** | Batch 1 baseline 22 / 22 — unchanged |
| `homepageBatch2.test.js` | **34 / 34** | Batch 2 baseline 34 / 34 — unchanged |
| `homepageBatch3.test.js` | **15 / 15** (14 before the review fix) | new |
| Homepage glob (6 files) | **187 tests — 186 pass, 1 fail** | 186 → 187 with the new regression test; the one failure is the pre-existing `home-page/` inventory test |
| `homepagePersistence` | 14 / 14 | unchanged |
| `homepageAllSections` | 71 / 71 | unchanged |
| `homepageContentControl` | 30 / 31 | only the known `home-page/` failure |
| Storefront + design-system | 48 / 48 | unchanged |
| `npm test` (whole frontend) | **850 tests — 839 pass, 10 fail, 1 skipped** | identical to the documented baseline; the same ten failures — eight stale `SUPER_EMPLOYEE` expectations, the storefront account-ownership/`home-page` test, and `tests/unifiedLogin.test.js` |
| `npm run build` | ✓ **3,124.61 kB** (gzip 980.44 kB) | Pre-review Batch 3 build was 3,124.67 / 980.46; the −0.06 kB delta is consistent with the single removed default string |
| Backend classification file | **21 / 21** | new |
| Backend 8-file selection | **173 pass / 0 fail / 1 skip** | skip is the documented `pratikshya_local` guard |
| Media deletion live round trip | 201 → 201 → **200** → 404, audit counters 0, assets back to 7 | unchanged |

No test count changed in `npm test`, so nothing was silently skipped; the only failure-set change
versus baseline is none.

---

## 5. Browser evidence (independent, Chromium against the real app + local backend)

* **F-06/F-24:** saree MEDIA rows read “Lookbook 1 / Active / Banarasi” with alt “Banarasi drape”,
  thumbnails 56×56, `uuidLeak:false`; the panel shows the “Section content” eyebrow and “Media entries”.
* **F-08/F-25:** the six human labels; `maxLength` 100/255/100/500; textareas 500/2000; help visible;
  `aria-describedby="copy-title-help"`; border `rgb(166,138,104)`.
* **F-24:** primary/secondary/destructive computed colours as listed in §2.
* **F-14:** preflight produced **0** write requests, both field messages, `aria-invalid="true"`,
  `aria-describedby="copy-ctaHref-help copy-ctaHref-error"`.
* **F-22:** both caveats exactly once, both before the editor.
* **Keyboard:** Tab order ends at `Cancel entry changes` and leaves the panel — no focus trap; every
  stop shows a focus ring (`2px solid rgb(134,94,32)` plus a 35 % gold halo).
* **Responsive:** page and entry-row overflow **0 px** at 1440, 1280, 1024 and 390 px wide.
* **Console:** `pageerror` list is empty (`[]`) on every run.

**F-18 browser check — BLOCKED, verified blocked (not assumed).** The dead-end needs an account with
`marketing.manage` but **without** `media.view`. All four active accounts hold `media.view`:
`batchnoassign.admin` (`marketing.manage`, `marketing.view`, `media.view`),
`batch.editor.employee` (8 grants including `media.view`),
`readonly.employee` (6 grants including `media.view`), and `admin@…` (SUPER_ADMIN by role). Creating an
account or narrowing a grant to make the test possible is out of scope, so F-18 stays component-tested
only. **F-11 remains blocked** as before: `catalog_product` has 0 rows / 0 published, and no catalogue
data was created.

---

## 6. Remaining gaps and baseline failures

1. `home-page/` reference-inventory test fails because the directory is absent — pre-existing, Batch 6.
2. The ten `npm test` baseline failures (eight stale `SUPER_EMPLOYEE` expectations, the storefront
   `home-page` prototype test, `tests/unifiedLogin.test.js`) — untouched, unrelated, and identical
   before and after this work.
3. **Accessibility gap introduced by moving errors inline:** a mapped 422 is no longer inside a
   `role="alert"`, so a screen reader is not *announced* the failure until focus reaches the field
   (`aria-invalid` + `aria-describedby` then describe it). The audit schedules the focus/announcement
   pass for Batch 5; it is listed here rather than silently fixed to avoid scope creep.
4. F-18 and F-11 browser acceptance remain blocked as described in §5.
5. `pipeline` is inert metadata with no consumer — intentional (the audit's recommended rename), but it
   is documentation, not a status signal; liveness is only ever the HTTP read.
6. The ignored backend test needs `git add -f` (or an approved `.gitignore` change) before it can be
   committed.

---

## 7. Data and repository safety

* **No production database was contacted.** Every query went to the local PostgreSQL cluster at
  `/tmp/pgdata` (unix socket, database `pratikshya_fashion`, schema `pratikshya`) and to the local API
  on `127.0.0.1:8000`.
* **No schema or migration change:** head is still `w3b4c5d6e7f8`, 74 tables in the schema, no file under
  `backend/alembic/` is modified.
* **Seed data intact:** `categories` inactive revision **29** with 2 rows, `sarees` active revision
  **27** with 4 rows, **6** authored rows in total, **7** media assets, **0** products — identical to
  before this review. The only transient object was one review upload, deleted immediately (audit
  counters 0; assets returned to 7).
* **No permission change:** the four active accounts and their grants are exactly as found
  (3 / 8 / 6 explicit grants + SUPER_ADMIN by role); `readonly.employee` was read, not modified.
* **Nothing staged, committed, pushed or deployed.** **Batch 4 has not been started.**

---

## 8. Exact working-tree status

Branch `arena/c72d2349-pfv1`, HEAD `43bf640377ab51e1b2f6ca95329e80b4ceb6cb17`.

* **16 modified tracked files** (+904 / −259 across the whole change set): the five backend files
  (`error_handlers.py`, `media_reference_audit.py` and three test files) and eleven frontend files
  (`BackendHomeHeroPanel.jsx`, `PublishedProductPicker.jsx`, `RegisteredMediaPicker.jsx`,
  `SectionContentEditor.jsx`, `SectionPreview.jsx`, `AdminMarketingMedia.jsx`, `AdminMediaLibrary.jsx`,
  `homepageContentModel.js`, `homepageAllSections.test.js`, `homepageContentControl.test.js`,
  `homepagePersistence.test.js`).
* **18 untracked files:** 8 Markdown reports (audit, Batch 1 report + review, Batch 2 report + review,
  schema repair, Batch 3 report + this review) and 10 frontend files (`EntryRow.jsx`, `SaveBar.jsx`,
  `SlotMeter.jsx`, `copyFields.jsx`, `HeroPreview.jsx`, `previewModel.js`, `publishModel.js`,
  `homepageBatch1.test.js`, `homepageBatch2.test.js`, `homepageBatch3.test.js`).
* **0 staged files**, no renames, no deletions, no commits.

**Files changed by this review:** `EntryRow.jsx` (D-1), `RegisteredMediaPicker.jsx` (D-2),
`homepageBatch3.test.js` (+1 regression test), and this report.

---

## 9. Reproduction commands

```bash
# frontend component suites (from frontend/)
node --import ./scripts/node-loader/register.mjs --test \
  src/components/admin/homepage/__tests__/*.test.js
node --import ./scripts/node-loader/register.mjs --test \
  src/components/admin/homepage/__tests__/homepageBatch3.test.js
npm test
npm run build

# backend (from backend/, local disposable cluster only)
DATABASE_URL='postgresql+asyncpg://postgres@/pratikshya_fashion?host=/tmp/pgdata' \
  /tmp/appvenv/bin/python -m pytest \
  tests/unit/test_database_error_classification.py \
  tests/unit/test_media_reference_audit.py tests/unit/test_media_schema_integrity.py \
  tests/unit/test_marketing_media.py tests/unit/test_phase3_error_envelope.py \
  verification/unit/test_homepage_content.py tests/unit/test_api_contract.py \
  tests/unit/test_admin_consolidation_rbac.py
```

Browser evidence was captured with a Playwright/Chromium script against the local Vite dev server
(`127.0.0.1:5173`) and the local API (`127.0.0.1:8000`); no external or production host was used.
