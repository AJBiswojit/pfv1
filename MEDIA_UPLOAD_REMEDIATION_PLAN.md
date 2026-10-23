# PRATIKSHYA FASHION — Media Upload
## Complete, Regression-Safe Remediation Plan
### Covers `MEDIA-UPLOAD-001` … `MEDIA-UPLOAD-027`, the caption-persistence concern, and one newly discovered blocker (N-01)

**Source of truth:** `MEDIA_UPLOAD_AUDIT.md` (same repository, commit `f13199d`).
**Audited surface:** `/super-admin/media/upload`, `/admin/media/upload`, `/employee/media/upload` (all three mount `frontend/src/components/media/MediaUploadForm.jsx`).
**Status of this document:** planning only. **No source file, test, database record, storage object or configuration has been modified.** Nothing has been committed or deployed.

---

## 0. Re-verification performed for this plan

Everything below was re-read before writing (not carried over from the audit on trust):

| Question the plan depends on | Evidence re-checked | Conclusion |
|---|---|---|
| Does the upload route already create the asset + association? | `backend/app/api/v1/media.py:796–805` (`_register_product_asset` → `_commit_and_invalidate_product_media`) | **Yes — atomically, and 201 is only returned after commit.** Compensation (`1386–1411`) removes the object if the DB half fails. |
| What metadata does the upload route accept? | `media.py:724–752` — `role`, `is_primary`, `sort_order`, `title`, `alt_text`, `replace_existing` | All of it. The frontend simply never sent it (`mediaApi.js:132–151`). |
| Does the upload response carry a media id? | `schemas/media/media.py:168–187` — `MediaObjectResponse { ok, object: { key, url, created, alreadyExists, size, contentType, checksumSha256 }, status }` | **No media id.** A read-back is required for ids; no backend change is needed for that. |
| Is `title`/`alt_text` updated when the asset row already exists? | `media.py:205–228` — fields are set **only** inside `if row is None:` | **No.** Metadata is create-only. On create-only semantics, metadata must be sent on the call that creates the row. |
| Does the employee lane reuse the same register semantics? | `media.py:1505–1560` (`preserve_existing_mapping=True`) | The *second* call preserves; the **upload leg already reshapes** the mapping. So the employee register call protects less than its docstring implies. |
| Does `/admin/products` work for employees? | `dependencies.py:192–202` (`get_current_admin` → 403 for `user_type != "admin"`); no `/employee/products` **list** route exists (`products.py` has only draft/GET/PATCH by id) | **No.** This is the newly found blocker N-01. The employee upload page cannot list products today. |
| Does the admin product list support server search + paging? | `products.py:293–333` (`q`, `sort`, `page`, `pageSize` 1–500, `total` = full filtered count); client `productsApi.js:411–430` | **Yes — the infrastructure already exists.** No new search service is needed. |
| Is there an existing accessible combobox to reuse? | `grep 'role="combobox"'` across `src` → none; `ProductCatalogSelector`/`PublishedProductPicker` are click-only | No house pattern exists; the combobox must be built locally in `MediaProductSelector`. |
| Can component-level (JSX) tests run here? | `scripts/node-loader/register-jsx.mjs` imports `vite`; `vite` is not installed in this sandbox (`ERR_MODULE_NOT_FOUND`) | **Service/static tests are runnable now. JSX/SSR tests require `npm ci` first.** Stated explicitly in §G. |
| Which existing suites pin the current two-call contract? | `frontend/tests/phase7ProductMedia.test.js:205, 242, 262, 278, 313, 574` | These must be **deliberately rewritten**, not deleted (§F). |

---

## A. Executive Summary

### A.1 The problem, in one paragraph

The page has a real pipeline behind a form that was written against an older contract. The backend has since collapsed "upload" and "register" into a single atomic call that accepts metadata, but the form still sends bare files and then performs a redundant second registration with the wrong metadata. Four consequences dominate: it **always claims the cover** (`firstIsPrimary: true`), it **reports stored-and-attached media as failed** when only the redundant second call breaks, it **throws away the alt text and caption** it collects, and it **cannot see the product's existing media** — so every one of those mistakes is invisible until the storefront shows the wrong image. On top of that, the product picker is a one-shot snapshot of a 100-product cache that is not even fetched by the picker, and the same shared form makes the employee lane fail by policy.

### A.2 The safest solution (what this plan does)

1. **Make the upload call the whole pipeline.** Send `role`, `sort_order`, `is_primary`, `title`, `alt_text` on `POST /media/products/{id}/objects` (the route already accepts them) and **stop making the redundant `POST /media/register` call from this page**. This removes the false-failure class outright, fixes employee uploads, makes metadata persist, and needs **zero backend changes**.
2. **Never guess the cover.** Read the product's authoritative media set before submitting; default every file to a non-cover role; auto-promote only under the existing house rule (`no existing cover`, admin only); allow an explicit, warned "set as cover" — never the other way round.
3. **Append, don't interleave.** Compute `sortOrder` from the authoritative set (`max + 1 + index`) instead of restarting at 0.
4. **Tell the truth about every outcome.** `confirmed` only after a server read; `unconfirmed` (never "failed") when the network drops after a request that may have committed; a per-file summary; retry only the rows that are actually retryable.
5. **Search the real catalogue.** A debounced, paged server search through the **existing** `/admin/products` API (no new endpoint, no new service), with loading / empty / error / retry states.
6. **Surface what will change.** Show the product's status and its current cover/count, and require an explicit acknowledgement before the first registration on a legacy-media product (MEDIA-UPLOAD-004), because that registration **does** switch the product's catalogue image set.

### A.3 Main risks (and how the plan contains them)

| Risk | Containment |
|---|---|
| Removing the second call changes a pinned contract | It is pinned only by frontend tests that encode the old two-step; they are rewritten deliberately in B1 with the new contract documented (§F). The backend contract is untouched. |
| Employee lane behaviour changes | `is_primary` is **never** sent for employees (server policy preserved and asserted by test T02). Role/sort become honoured — today they are silently ignored; this is documented as a deliberate, minor change (decision **D2**). |
| Shared `apiClient` change breaks other callers | Timeout/cancel is **opt-in per call** (`timeoutMs`, `signal`). With neither supplied the code path is byte-identical. Caller inventory in §F. |
| The catalogue image set still changes for legacy-only products | Cannot be fixed client-side. The plan makes it **explicit and acknowledged** (004a) and defers the projection change (004b) behind a separate approval. |
| `MediaProductSelector` is used by a second page | Its public props are unchanged; `AdminMediaProductMapping.jsx:353` keeps working (and gains the fixes). |
| A rewrite of the form breaks source-text tests | `mediaSecurityContracts`, `mediaTerminology`, `marketingAvifUpload`, `phase3ProductMediaHonesty` assert on source shape; the preserved shapes are listed in §F and checked by T21. |

---

## B. Complete Bug Matrix

Severity and status are carried over verbatim from the audit. `Batch` refers to §E. `T##` refers to §G test IDs.

### B.1 Data integrity and upload correctness

| ID | Finding | Sev | Status | Root cause (evidence) | Recommended fix | Batch | Files | Tests |
|---|---|---|---|---|---|---|---|---|
| **MEDIA-UPLOAD-001** | Existing primary image silently demoted | **Critical** | Confirmed | `MediaUploadForm.jsx:234` hard-codes `firstIsPrimary: true` → `productMediaService.js:259` → `media.py:231–236` demotes all other mappings | Read the media set before submit; `is_primary` only when (a) admin, (b) no existing cover (registered primary **or** legacy `image`), or (c) the operator explicitly ticks "Set as cover" (with a warning when a cover exists). Never send the flag for employees. | B1 (service rule) + B2 (wiring/UI) | `productMediaService.js`, `MediaUploadForm.jsx`, `MediaUploadQueue.jsx` | T01, T02, T03 |
| **MEDIA-UPLOAD-002** | Shared form breaks employee uploads | **Critical** (employee) | Confirmed | Same `firstIsPrimary: true`; `mediaApi.js:219` → `/employee/media/register`; `media.py:1521` + `307–328` reject `is_primary` with **422** (`BUSINESS_RULE_VIOLATION`) | Single upload call carrying metadata; `is_primary` structurally impossible for `scope="employee"` (not merely omitted by a branch). | B1 | `productMediaService.js`, `mediaApi.js` | T02, T13, T14 |
| **MEDIA-UPLOAD-003** | "Failed" after the server already stored and attached | **High** | Confirmed | Upload auto-registers (`media.py:796–805`); client then calls `/media/register` (`productMediaService.js:206`); any failure of that second call renders "Failed" (`MediaUploadQueue.jsx:110–117`) | Remove the second call; derive success from the 201 + read-back; classify failures (`rejected` / `collision` / `timeout` / `network` / `auth` / `server`) and never label a committed write as failed. | B1 + B2 | `productMediaService.js`, `MediaUploadForm.jsx`, `MediaUploadQueue.jsx` | T06, T09, T15 |
| **MEDIA-UPLOAD-004** | Registered media replaces the legacy image set in the DTO | **High** | Confirmed (API) / decision required | `product_service.py:371–390` + `668–672` + `777–781`: any registered mapping makes `image`/`additionalImages` come from the registered set; `product_media_records.py:117–129` (`primary_item` falls back to `items[0]`) | **004a (in this plan):** detect "product has legacy media and no registered media", show the consequence on the selected-product card, and require an explicit confirmation before the first registration. **004b (deferred):** projection change — see §I. | B2 (a) / §I (b) | `MediaUploadForm.jsx` (a); `product_service.py` (**only if 004b is approved**) | T05 |
| **MEDIA-UPLOAD-007** | Every image defaults to the `COVER` role | Medium | Confirmed | `MediaUploadForm.jsx:114` → `rolesForType()[0]` = `COVER` (`mediaTypes.js:105–166`) | Default `GALLERY`; keep the role picker; state in the UI that role ≠ cover. | B1 + B2 | `productMediaService.js` (default), `MediaUploadForm.jsx`, `MediaUploadQueue.jsx` | T13 |
| **MEDIA-UPLOAD-008** | Alt text and caption collected but not persisted | **High** | Confirmed | `MediaUploadForm.jsx:231` sends `{file, role, title}` only; `productMediaService.js:261` reads `altText` while the queue stores `alt`; no endpoint accepts `caption` (`media.py` upload/register signatures) | **alt:** map `alt` → `alt_text` on the upload call; require non-empty alt for images; make metadata fields read-only once a file is `stored` (metadata is create-only server-side). **caption:** remove the input in this work (B6) **or** wire it end-to-end in the optional backend batch (§I, decision **D3**). | B1/B2 (alt) + B6 (caption decision) | `productMediaService.js`, `MediaUploadForm.jsx`, `MediaUploadQueue.jsx` (+ optional backend) | T11, T12 |
| **MEDIA-UPLOAD-011** | Partial success not summarised; retry reprocesses successes | **High** | Confirmed | `productMediaService.js:266–268` aborts; `MediaUploadForm.jsx:253–261` discards `result.results`; submit re-sends the whole queue | `continueOnError` in the service; per-file summary (`n confirmed / m failed / k unconfirmed`); keep only retryable rows in the retry queue; completed ids preserved even when a later file fails. | B1 + B2 | `productMediaService.js`, `MediaUploadForm.jsx`, `MediaUploadQueue.jsx` | T07, T08 |
| **MEDIA-UPLOAD-012** | Same filename + different bytes = 409 dead end | Medium | Confirmed | `media_service.py:221–245` (409 on differing bytes); `mediaApi.js:132–151` never sends `replace_existing` | On 409, show an explicit, informed **"Replace this image"** action that re-sends with `replace_existing=true` (admin only; the server then writes a content-addressed key and keeps the old object). Never automatic. Employees get guidance only. | B6 | `MediaUploadForm.jsx`, `mediaApi.js` | T15 |
| **MEDIA-UPLOAD-013** | Archived products accept media with a success message | Medium | Confirmed | `media.py:763–771` checks existence only; `_require_writable_product` 404-only; `MediaProductSelector` shows no status | Show a status chip on every row and on the selected card; warn on `ARCHIVED` ("this media will not be visible") and on `PUBLISHED` for employees. Server policy unchanged. | B3 | `MediaProductSelector.jsx`, `MediaUploadForm.jsx` | T18 |
| **MEDIA-UPLOAD-014** | Duplicate selections inflate counts | Medium | Confirmed | `MediaUploadForm.jsx:103–127` pushes every file; `key` includes `Date.now()` | Reject duplicates by `name+size+lastModified`; count **distinct media ids** from the read-back (fall back to file count with an explicit label if the read failed). | B2 | `MediaUploadForm.jsx` | T10 |
| **MEDIA-UPLOAD-021** | No existing-media context before upload | **High** | Confirmed | `getRegisteredProductMedia` is only called **after** a successful batch (`MediaUploadForm.jsx:267`); the selector shows name/SKU/category only | Read the set on product selection (staff scope) and render cover thumbnail + count + "new files are appended after the existing ones". The same read feeds 001/004/015. | B3 | `MediaUploadForm.jsx`, `MediaProductSelector.jsx` | T01, T04, T05 |

### B.2 Product search and selection

| ID | Finding | Sev | Status | Root cause (evidence) | Recommended fix | Batch | Files | Tests |
|---|---|---|---|---|---|---|---|---|
| **MEDIA-UPLOAD-005** | Selector snapshots an empty cache | **High** | Confirmed (code) / timing-dependent | `MediaProductSelector.jsx:19–31` `useMemo(..., [])`; the only fetch is `useProducts()` in `AdminLayout.jsx:34`; register is in-memory (`catalogRepository.js:100`) | New hook `useAdminProductSearch` (debounced `apiAdminListProducts`) → the selector renders loading / results / empty / error+retry; reactive to `PRODUCTS_CHANGED_EVENT` for the selected product. | B3 | `useAdminProductSearch.js` (new), `MediaProductSelector.jsx` | T16 |
| **MEDIA-UPLOAD-006** | Only the newest 100 products searchable | **High** | Confirmed | `useProducts.js:37` (`pageSize: 100`, `sort=newest`), `MediaProductSelector.jsx:40,49` (`slice(0,15/20)`) | Server-side `q` + paging through the **existing** endpoint (supports `pageSize` ≤ 500 and `total`), debounce 300 ms, "Showing 20 of 137" + **Load more**. | B3 | `useAdminProductSearch.js` (new), `MediaProductSelector.jsx` | T16 |
| **MEDIA-UPLOAD-015** | Submit enabled without a product | Medium | Confirmed | `MediaUploadForm.jsx:615` (no `productId` check); `MediaProductSelector`'s `error` prop is never passed | One pure `submitReadiness()` helper → disabled state + a visible reason next to the offending step; pass `error` to the selector. | B2/B3 | `MediaUploadForm.jsx`, `MediaProductSelector.jsx` | T20 |

### B.3 Reliability and recovery

| ID | Finding | Sev | Status | Root cause (evidence) | Recommended fix | Batch | Files | Tests |
|---|---|---|---|---|---|---|---|---|
| **MEDIA-UPLOAD-009** | Progress stuck at 0 % | Medium | Confirmed | `progressFor` (`MediaUploadForm.jsx:215–223`) is dead code; `setUploadProgress` only 0/100 | Call it from `onStage`; cap at 99 until the read-back, then 100; show "File k of n". | B2 | `MediaUploadForm.jsx`, `productMediaService.js` (progress helper) | T19 |
| **MEDIA-UPLOAD-010** | No timeout / no cancellation | **High** | Confirmed | `apiClient.js:373–480`: no `AbortController`, no timeout; the whole form locks while `uploadState !== "idle"` | Opt-in `timeoutMs` + `signal` on `apiClient` (**additive, off by default**); media upload passes `timeoutMs: 180_000` and a user-facing **Cancel upload** button; timeout → `unconfirmed`, then reconcile (§C.3). | B1 (client+plumbing) + B2 (UI) | `apiClient.js`, `mediaApi.js`, `productMediaService.js`, `MediaUploadForm.jsx` | T09, T15 |
| **MEDIA-UPLOAD-016** | Cancel ≠ Back; unsaved work lost | Medium | Confirmed | `MediaUploadForm.jsx:607` `navigate(-1)`; `AdminMediaUpload.jsx:16` explicit `Link`; no dirty guard | One explicit destination for both (`onSuccessRedirect || /{prefix}/media`); `window.confirm` (house pattern — `SectionContentEditor.jsx:98`) when the queue is dirty; `beforeunload` guard while a batch is queued. | B6 | `MediaUploadForm.jsx`, `AdminMediaUpload.jsx` | T23 |
| **MEDIA-UPLOAD-022** | Success screen lacks per-file detail and product navigation | Low | Confirmed | `MediaUploadForm.jsx:301–371` counts + truncated ids; "View Media" → registry | Per-file rows (name → server media id → role/cover), primary "Open product media" → `/{prefix}/products/{id}/media` (`App.jsx:165,256`), secondary "Media registry". | B6 | `MediaUploadForm.jsx` | T07, T24 |

### B.4 Accessibility and visual quality

| ID | Finding | Sev | Status | Root cause (evidence) | Recommended fix | Batch | Files | Tests |
|---|---|---|---|---|---|---|---|---|
| **MEDIA-UPLOAD-017** | Combobox not keyboard operable | **High** | Confirmed | `MediaProductSelector.jsx:122–178` — no `role="combobox"`, no `aria-*`, options are `onClick`-only `<li>` | Full combobox semantics: `aria-expanded/controls/activedescendant`, Arrow/Home/End/Enter/Escape/Tab, roving `aria-selected`, `mousedown` guard, live result count. | B4 | `MediaProductSelector.jsx` | T17 |
| **MEDIA-UPLOAD-018** | Repeated headings and oversized banner | Medium | Confirmed | `AdminMediaUpload.jsx:19–25` (two H1-weight titles) + `MediaUploadForm.jsx:376–391` (~90 px amber banner) | One `AdminPage` title; `AdminPanel` rendered **without** `eyebrow`/`title` (both are optional — `AdminPanel.jsx:21–54`); banner → one line + `<details>` for the pipeline note. | B5 | `AdminMediaUpload.jsx`, `MediaUploadForm.jsx` | T22 (SSR) |
| **MEDIA-UPLOAD-019** | Off-system colours; `text-sage` undefined | Low | Confirmed | `MediaUploadForm.jsx:376–384` (`amber-*`), `310–316` (`emerald-*`); `MediaUploadQueue.jsx:99` (`text-sage`, no such token in `index.css`) | Map to `pf-success` / `pf-warning` / `pf-error` / `pf-border-strong` (`index.css:118–131`). | B5 | `MediaUploadForm.jsx`, `MediaUploadQueue.jsx` | T22 |
| **MEDIA-UPLOAD-020** | Too tall for a 1366×768 laptop | Medium | Confirmed | Screenshots + `MediaUploadDropzone.jsx:54–112` (~330 px) | Compact dropzone (`compact` when the queue is non-empty); sticky action bar; shorter guidance block. Target: product selector + first file row visible above the fold at 768 px. | B5 | `MediaUploadDropzone.jsx`, `MediaUploadForm.jsx` | Manual M5 |
| **MEDIA-UPLOAD-023** | Fabricated SKU | Low | Confirmed | `MediaProductSelector.jsx:24` (`PF-${idx+1}`) | Render the true `sku` or "SKU unavailable"; never synthesise identity. | B3 | `MediaProductSelector.jsx` | T18 |
| **MEDIA-UPLOAD-024** | Unreachable "Preparing assets…" | Informational | Confirmed | `MediaUploadForm.jsx:567–568`; state never set | Delete the branch (the new state machine has an explicit `preparing` phase, so the copy either becomes live or goes). | B2 | `MediaUploadForm.jsx` | T19 |
| **MEDIA-UPLOAD-025** | Incomplete file-count / size / dimension guidance | Low | Confirmed | `MediaUploadDropzone.jsx:98–112`; `config.py:191–192` (50 MP / 8000 px) unexposed | `MAX_UPLOAD_FILES = 24` (client cap, actual value in one constant), running total size, and a dimensions line ("≤ 8000 px per side, ≤ 50 MP"). Enforced client-side **in addition to** the server. | B5 | `mediaTypes.js`, `MediaUploadDropzone.jsx`, `MediaUploadForm.jsx` | T10, T22 |
| **MEDIA-UPLOAD-026** | Dropdown dismissal + file-input label | Low | Confirmed | `MediaProductSelector.jsx:162–220` (no outside-click/Escape); `MediaUploadForm.jsx:512` label has no `htmlFor` vs `MediaUploadDropzone.jsx:81` `id="media-file-input"` | Outside-click + Escape close; `htmlFor="media-file-input"` on the step label. | B4 | `MediaProductSelector.jsx`, `MediaUploadForm.jsx` | T17 |
| **MEDIA-UPLOAD-027** | Drag highlight may flicker | Informational | **Suspected** | `MediaUploadDropzone.jsx:23–30` `onDragLeave` fires when crossing children | **Reproduce first** (M7). Only if reproduced: drag-enter counter or `relatedTarget` containment check. No change otherwise; the finding is then re-statused "Not reproduced". | B4 (conditional) | `MediaUploadDropzone.jsx` | M7 |

### B.5 Caption persistence (additional concern)

| ID | Finding | Sev | Status | Root cause | Recommended fix | Batch | Files |
|---|---|---|---|---|---|---|---|
| **MEDIA-UPLOAD-008-CAPTION** | Caption input has no persistence path | **High** (misleading UI) | Confirmed | `MediaUploadQueue.jsx:192–205` renders the input; no endpoint accepts `caption`; `MediaAssetModel.caption` exists but is never written (`models/media/media_asset.py:57`) | **Default (this plan):** remove the input and the queue field, leaving a comment pointing at the backend batch. **Optional (§I):** wire it end-to-end with tests before the input returns. Decision **D3**. | B6 | `MediaUploadQueue.jsx`, `MediaUploadForm.jsx` (+ backend in §I) |

### B.6 Newly discovered blocker (not in the audit)

| ID | Finding | Sev | Status | Evidence | Handling |
|---|---|---|---|---|---|
| **N-01** | The employee portal has **no product list source**, so the employee upload path cannot even choose a product | **High** | Confirmed (by code) | `/admin/products` is `get_current_admin`-only (`dependencies.py:192–202`); no `/employee/products` list route exists (`products.py:41–43` lists only draft/GET/PATCH by id); `MediaProductSelector` reads an in-memory register that nothing fills on the employee portal | **Not fixed here.** The selector gains a `productSource` prop: `"admin-search"` (default) and `"register"` (employee). In `"register"` mode it subscribes to `subscribeCatalogRegister` (`catalogRepository.js:57`) and renders an honest empty state ("No products are available in this portal — open this page from a product's media desk"). Employee flows remain verifiable via `initialProductId` (`EmployeeMediaUpload.jsx:64`). The endpoint is a **deferred item** (§I, decision **D4**). |

---

## C. Final Architecture / Request Flow

### C.1 The chosen contract (one write per file)

```text
Super Admin UI  (/super-admin/media/upload)
│
├─ 0. On product selection (read only)
│     GET /media/products/{id}/media-set      (staff scope: admin | employee)
│       → { mediaItems[] (primary-first), mediaRecordsAvailable, primaryMediaUrl }
│       → drives: cover detection, sort base, existing-media context, 004 warning
│
├─ 1. POST /media/products/{id}/objects       (multipart, one per file, sequential)
│     file, role, sort_order, [is_primary], title, alt_text, [replace_existing],
│     [caption — only if the backend batch in §I is approved]
│       server: size ceiling → content sniff → pixel guard → object write
│               → MediaAsset (create, with title/alt) → ProductMedia (create/update)
│               → commit → cache invalidation          ⇒ 201 only after commit
│       client: 201 ⇒ stage "uploaded" ⇒ stage "assigned" (server-confirmed)
│               4xx/5xx ⇒ stage "failed" (+ classification)
│               timeout / network drop ⇒ stage "unconfirmed" (NOT failed)
│
├─ 2. GET /media/products/{id}/media-set      (reconcile + authoritative ids)
│       match by exact objectKey (known) → mediaId, url, isPrimary, sortOrder
│       unconfirmed → match by (fileSize, mimeType, normalised stem)
│       GET /admin/products/{id}              (admin only, DTO refresh — unchanged)
│
└─ 3. Result screen → "Open product media" (/…/products/{id}/media) | registry
```

**What changed and what did not**

| Element | Today | After |
|---|---|---|
| Upload call | bare `file` | `file` + metadata the route already accepts |
| Second call `POST /media/register` | always | **removed from this page** (still used by `setPrimaryProductMedia`, `reorderProductMedia`, `apiCreateMedia`, `apiAssignMediaToProduct`) |
| Media ids | from the second call | from the read-back (exact `objectKey` match) |
| Backend contract | — | **unchanged** |
| Employee route | `/employee/media/products/{id}/objects` then `/employee/media/register` | single `/employee/media/products/{id}/objects` (same URL, same gate, `is_primary` never sent) |

**Why the second call can go — justified, not assumed**

1. The 201 is returned *after* `_commit_and_invalidate_product_media` (`media.py:799–805`). A 201 therefore means the association is durable, so reporting "assigned" is honest.
2. Everything the second call used to write (role, sort order, primary, title, alt) is now written by the upload call with **the operator's real values** instead of the route defaults.
3. Asset `title`/`alt_text` are create-only server-side (`media.py:205–228`). The second call never updated them, so nothing is lost; sending them on the creating call is strictly better.
4. The only semantic the second call still "protects" is `preserve_existing_mapping` for employees — and the **upload leg already rewrites the mapping** before that call runs, so the protection is illusory. The employee safety that matters (`is_primary` refusal, DRAFT/PENDING only, own namespace) lives on the upload route itself (`media.py:1467`, `305–326`) and is untouched.
5. Nothing else in the app depends on the page making two calls: `ProductMediaManager` reads only `result.ok/results/error` (verified).

### C.2 State machine

**Batch state:** `idle → preparing → running → reconciling → done | idle`.

**Per-file state (shared vocabulary, additive):**

| Stage | Meaning | Allowed next | Set by |
|---|---|---|---|
| `selected` | browser-only, editable | uploading, removed | client |
| `uploading` | request in flight | uploaded, failed, unconfirmed | client |
| `uploaded` | 201 received (object + rows durably written) | assigned | client (server-confirmed) |
| `assigned` | confirmed by the authoritative read (or by the 201) incl. media id | terminal | client |
| `unconfirmed` *(new)* | request ended without a verdict (timeout / network drop / aborted) — **may** have committed | assigned, failed | client |
| `failed` | server rejected, or reconciled as absent | terminal (retry allowed) | client |
| `refreshed` / `published` | unchanged vocabulary for other surfaces | terminal | — |

`PRODUCT_MEDIA_STAGES.UNCONFIRMED = "unconfirmed"` and its label are **added** to `productMediaService.js`; `ProductMediaManager.jsx:421` renders `STAGE_LABELS[stage] ?? stage`, so the addition is backward compatible.

### C.3 Outcome handling (the four cases the audit demanded)

| Case | Detection | UI | Data |
|---|---|---|---|
| **Success** | 201 | per-file "Registered" + media id after reconcile | asset + mapping durable |
| **Rejected** | 4xx (422 validation, 404 product, 409 collision, 403 auth) | "Failed — <server message>"; 409 offers **Replace this image**; 403 says the session/grant is the cause | nothing written (upload compensates on DB failure) |
| **Ambiguous** | timeout, `NETWORK_ERROR`, user cancel after the request left | "Awaiting confirmation" (**never** "Failed") → immediately reconciled by a read | unknown until reconcile |
| **Committed but unconfirmed by read** | 201 + read-back failure | "Registered; the server read failed" — counts still shown, ids shown as "pending" | durable; shown honestly |
| **Partially successful batch** | mixed results | "2 of 3 registered and attached" + per-file rows; retry only retryable rows | durable for successes |

### C.4 Reconciliation algorithm (no backend support needed)

```js
// after the batch, with `before` (snapshot) and `after` (fresh read):
const knownIds = new Set(before.items.map(i => i.mediaId));   // empty if the snapshot failed
const fresh = after.items.filter(i => !knownIds.has(i.mediaId));

for (const result of results) {
  if (result.stage === ASSIGNED && result.objectKey)
      → match = after.items.find(i => i.objectKey === result.objectKey)      // exact
  else if (result.stage === UNCONFIRMED)
      → match = unique(fresh, { size: file.size, mime: sniffable,
                                stem: normalise(file.name) })                // heuristic
  if (match) → { stage: ASSIGNED, mediaId, url, isPrimary, sortOrder }
  else if (UNCONFIRMED) → keep UNCONFIRMED + "verify in the product media manager"
  else → FAILED
}
```

If more than one candidate matches, the file stays `unconfirmed` (never a guessed id). If the snapshot itself failed, only exact `objectKey` matches are accepted.

---

## D. File-by-File Change Plan

Legend — **L** = local to media upload, **S** = shared (see §F).

### D.1 `frontend/src/services/media/productMediaService.js` — S (2 callers)

* **Add (pure, exported):**
  `MEDIA_FAILURE_KINDS`, `classifyMediaFailure(result)`, `nextSortOrder(items)`, `hasExistingCover(items, product)`, `decidePrimary({isEmployee, requestCover, items, product})`, `matchReconciledItems({before, after, results})`, `uploadProgressPercent(index, stage, total)`.
* **Change `uploadAndRegisterProductImage(productId, file, opts)`:** drop the `/media/register` step; pass `{role, sortOrder, isPrimary, title, altText, caption?, signal, timeoutMs}` to `apiUploadProductMediaObject`; report `UPLOADING → UPLOADED → ASSIGNED`; on ambiguity report `UNCONFIRMED` and return `{ok:false, uncertain:true, objectKey?}`.
* **Change `uploadAndRegisterProductImages(productId, files, opts)`:** add `continueOnError` (default `false` — preserves `ProductMediaManager` behaviour), forward `signal`, keep `perFile`/`firstIsPrimary` semantics, and accept `alt` as well as `altText` (`entry.altText ?? entry.alt`) so `ProductMediaManager` persists alt text with no UI change.
* **Unchanged:** `getRegisteredProductMedia`, `syncProductMediaFromServer`, `setPrimaryProductMedia`, `reorderProductMedia`, `moveProductMedia`, `apiListProductMedia` re-export, `PRODUCT_MEDIA_COVER_ROLE`.
* **Blast radius:** `MediaUploadForm` (intended), `ProductMediaManager` (behaviour-compatible: single call, same stages it handles, `media` field now absent — it never read it). Rollback: revert this file alone; the form would then need its old call shape (revert B2 with it).

### D.2 `frontend/src/services/api/mediaApi.js` — S (4 upload call sites)

* **Change `apiUploadProductMediaObject(productId, file, opts)`** — options extended: `{scope, role, sortOrder, isPrimary, title, altText, caption, replaceExisting, signal, timeoutMs}`. Each field appended **only when provided**, so existing calls are byte-identical; `is_primary` is appended only when `isPrimary === true` **and** `scope !== "employee"` (defence in depth; the service also never sets it for employees).
* **Change `apiRegisterMediaObject`** — accept `signal`/`timeoutMs` pass-through only (still used elsewhere).
* **Unchanged:** every route path literal (pinned by `phase3ProductMediaHonesty.test.js:154–158`), `apiGetProductMediaSet`, `apiListMediaAssets`, `apiDeleteMediaObject`, aliases.
* **Blast radius:** `productMediaService` only. Rollback: revert.

### D.3 `frontend/src/services/api/apiClient.js` — **S (highest blast radius — 6 call sites)**

* **Change `request()`:** accept optional `timeoutMs` and `signal`.
  * Neither supplied → **no controller created, no behaviour change** (explicitly asserted by a test).
  * `timeoutMs` → internal `AbortController`, `setTimeout` cleared in `finally`, abort with reason `"timeout"`.
  * External `signal` → forwarded; an abort raises `ApiError("Upload cancelled.", 0, null, "CANCELLED", null, false)`.
  * Timeout → `ApiError("The request timed out after Ns.", 0, null, "TIMEOUT", null, true)`.
  * The 401-refresh retry passes the same options through (it already spreads `...options`), and the timer is re-armed for the retried request.
* **Unchanged:** auth scopes, token handling, refresh logic, error normalisation, JSON/multipart bodies.
* **Callers of `apiClient.upload`:** `mediaApi.js:124` (generic object upload), `:146` (product upload), `:219` (register), `:378` (register-placement) — none pass the new options ⇒ unchanged.
* **Rollback:** single file; the feature degrades to "no timeout" (today's behaviour).

### D.4 `frontend/src/hooks/useAdminProductSearch.js` — **new, L**

Debounced (300 ms) `apiAdminListProducts({q, page, pageSize: 20, sort: "newest"})`; exposes `{items, total, page, isLoading, error, query, setQuery, loadMore, retry, refresh}`; aborts the in-flight request on a new query; cancels on unmount; **no new service** (the API adapter already exists). Also re-reads when `PRODUCTS_CHANGED_EVENT` fires so a renamed product is not stale.

### D.5 `frontend/src/components/media/MediaProductSelector.jsx` — S (2 callers)

* New props (all optional, backward compatible): `productSource = "admin-search" | "register"`, `error`, `onSelectProduct(id, record)`, `selectedProductRecord`, `onContextChange` (media-set snapshot), `disabledHint`.
* `admin-search`: uses D.4 with loading/empty/error+retry/"Showing X of Y"+Load more.
* `register`: `subscribeCatalogRegister` + `catalogRepository.all()`, honest empty state (N-01).
* Rows: real `sku` or "SKU unavailable" (023), status chip via `StatusBadge` (`components/employee/StatusBadge.jsx`), archived warning (013), cover thumb.
* Combobox a11y (017/026): `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`, `aria-busy`; keyboard Arrow/Home/End/Enter/Escape/Tab; `mousedown` outside-close; live result count; `aria-invalid` + inline error.
* **Unchanged:** the selected-product card layout and the `selectedProductId`/`onSelectProduct` contract (also consumed by `AdminMediaProductMapping.jsx:353`).
* **Blast radius:** the mapping page (unrouted — `App.jsx:261` redirects it, but it must keep compiling) and `MediaUploadForm`.

### D.6 `frontend/src/components/media/MediaUploadForm.jsx` — L (2 routes)

Full state machine per §C; snapshot read on selection; submit plan (`sortOrder`, `isPrimary`); progress; per-file results; retry-only-failed; duplicate rejection; readiness gate; caption removal (D3 default); 004 acknowledgement; 012 replace offer; 016 guards; 018/019/020 layout; 022 result navigation; 024 dead branch removal.

**Preserved shapes (source-text tests depend on them):** the `canManageMarketing` expression (`mediaSecurityContracts.test.js:182–187`), `allowScopeChange = true` / `initialScope = MEDIA_SCOPES.PRODUCT` defaults and the marketing note (`mediaTerminology.test.js:140–158`), the `uploadAndRegisterProductImages` call (`phase6MediaStorage.test.js:443`), `URL.createObjectURL(file)` and no canvas conversion (`marketingAvifUpload.test.js:63–74`).

### D.7 `frontend/src/components/media/MediaUploadQueue.jsx` — L (1 caller)

Status chips/labels from `PRODUCT_MEDIA_STAGE_LABELS` with `pf-success`/`pf-warning`/`pf-error` (019, 024-safe); role select defaulting to `GALLERY` + "role is descriptive; the cover is set by the cover control" (007); alt required for images, sent (008); caption removed or wired (008-CAPTION); metadata inputs read-only once `uploaded+` (create-only server metadata); per-row retry for `failed`, "Check server" for `unconfirmed`; remove/Clear disabled while running.

### D.8 `frontend/src/components/media/MediaUploadDropzone.jsx` — S (1 component + 1 test)

`compact` prop (020); guidance incl. count cap, total size and dimension limits (025); `id`/label association (026); drag-counter **only if M7 reproduces** (027); `accept` unchanged (`UPLOAD_ACCEPT` already image-only). Exports (`validateFile`, `titleFromFileName`, `extensionOf`, `typeOfFile`) unchanged.

### D.9 `frontend/src/config/mediaTypes.js` — S (config-only, additive)

Add `UPLOAD_LIMITS = { MAX_FILES_PER_BATCH: 24, MAX_TOTAL_BYTES: 100 MB }`, `DEFAULT_PRODUCT_UPLOAD_ROLE = PRODUCT_MEDIA_ROLES.GALLERY`, `UPLOAD_GUIDANCE` copy (one line + `<details>` body), and keep `UPLOAD_NOTICE*` (still referenced — `MediaUploadPanel.jsx:163`). No existing constant changes value.

### D.10 Pages

* `pages/admin/media/AdminMediaUpload.jsx` — single title, tighter description, actions (Cancel/Back parity), no behavioural change.
* `pages/employee/EmployeeMediaUpload.jsx` — **copy only** (remove the "no approval queue" claim if it drifts); no logic change.

### D.11 Tests

* **Rewrite (deliberate):** `frontend/tests/phase7ProductMedia.test.js` tests at lines 205, 242, 262, 278, 313, 574 → pin the new single-call contract.
* **New:** `frontend/tests/mediaUploadContract.test.js` (service/pure, runnable now), `frontend/tests/mediaUploadReconciliation.test.js`, `frontend/tests/mediaProductSearch.test.js` (hook), `frontend/tests/mediaUploadSurface.test.js` (SSR/ARIA — needs `npm ci`).
* **Backend:** no new tests unless the optional caption batch (§I) is approved.

### D.12 Optional backend batch (only if approved — §I)

`backend/app/api/v1/media.py` (caption on both admin + both employee routes), `backend/app/schemas/media/media.py` (`caption` on `MediaRegistrationAsset`), `backend/app/services/media/product_media_records.py` (`caption` in `serialise_assignment`), plus backend tests. **Not part of the default delivery.**

---

## E. Ordered Implementation Batches

Each batch is independently reviewable, independently revertable, and leaves the app working.

| Batch | Theme | Findings closed | Files | Gate (must pass before the next batch) |
|---|---|---|---|---|
| **B1 — Contract** | `apiClient` opt-in timeout/signal → `mediaApi` metadata → service single-call + pure helpers | 001\*, 002, 003\*, 007\*, 008(alt)\*, 010\*, 011(service) | D.1–D.3, tests | T02, T09, T13, T14, T15, T19, T21 + rewritten phase7 suite green |
| **B2 — Form truth** | state machine, snapshot read, primary rule, progress, per-file summary, retry-only-failed, dedupe, readiness, 004 ack | 001, 003, 004a, 007, 009, 010, 011, 014, 015\*, 021\*, 024 | D.6, D.7 | T01, T03, T04, T05, T06, T07, T08, T10, T11, T19, T20 |
| **B3 — Search & context** | new hook, selector data source, context strip, status/SKU, archived warning | 005, 006, 013, 015, 021, 023, N-01 (handling) | D.4, D.5 | T16, T18 |
| **B4 — Accessibility** | combobox semantics, outside-click, labels, drag flicker (conditional) | 017, 026, 027 | D.5, D.6, D.8 | T17, M7 |
| **B5 — Visual/UX** | one heading, compact banner, tokens, compact dropzone, sticky bar, limits copy | 018, 019, 020, 025 | D.6, D.8, D.9, D.10 | T22, M5, `npm run build` |
| **B6 — Recovery & polish** | 409 replace action, cancel/dirty guards, result rows + navigation, caption decision | 012, 016, 022, 008-CAPTION | D.6, D.7 | T23, T24, M6 |
| **B7 — Optional backend** | caption persistence end-to-end (only if **D3** says "wire it") | 008-CAPTION (converted) | D.12 | backend suite green (§I) |

\* Root cause fixed in the service; the UI wiring lands in B2. Both batches keep their own traceability line.

**Dependency notes**

* B2 needs B1's helpers; B1 does not need B2 (the app still works after B1: the form just gets truthful stages with the old wiring… it must not ship alone in production — **B1 and B2 ship together**).
* B3 is independent of B1/B2 but B2's readiness gate consumes `onContextChange` from B3; land B3 before or with B2 if possible.
* B4 depends on B3 (same component).
* B5 is presentational and can follow.
* B6 needs B2's result model.
* B7 is behind a decision gate.

**Rollback per batch:** revert that batch's commits only. No database migration, no data mutation and no storage change exists in any batch, so rollback is purely code-level. B1's rollback also reverts the phase-7 test rewrite.

---

## F. Regression-Safety Matrix

### F.1 Shared surfaces and their callers

| Shared file | Existing callers (verified) | Compatibility strategy | Failure modes if changed carelessly | Regression tests | Rollback |
|---|---|---|---|---|---|
| `apiClient.js` (`request`) | `authApi`, `productsApi`, `mediaApi` (4 upload sites), every other `apiClient.*` call | Timeout/cancel are **opt-in**; absent ⇒ identical code path (no `AbortController`, no timer) | A timer left armed could abort a later request; a mis-classified abort could look like a network failure elsewhere | T15 + the full `npm test` suite (auth/products/media suites all exercise `request`) | revert file |
| `mediaApi.js` | `productMediaService`, `adminMediaRegistry` hooks, `homepage` panels (`apiListMediaAssets`), `PlacementAssetPanel` | New payload fields appended **only when provided**; route literals untouched | A field appended with `undefined` would send `"undefined"`; `is_primary` leaking to employee | T13, T21, `phase6MediaStorage`, `phase3ProductMediaHonesty` | revert file |
| `productMediaService.js` | `MediaUploadForm`, `ProductMediaManager` | Default `continueOnError=false`; stage vocabulary additive; `result.media` was never read by the other caller | `ProductMediaManager` expecting a register stage it no longer sees (it handles `UPLOADED`/`ASSIGNED` already) | T06–T09, T13, T14, `phase7` suite (rewritten) | revert file + B2 |
| `MediaProductSelector.jsx` | `MediaUploadForm:441`, `AdminMediaProductMapping:353` | Props unchanged; all new props optional; default source = `admin-search` | A second consumer loses its list if the default source is wrong; mapping page is unrouted but must compile | T16–T18 + `npm run build` | revert file |
| `MediaUploadDropzone.jsx` | `MediaUploadForm`, `marketingAvifUpload.test.js` | `compact` defaults `false`; exports unchanged; no canvas/conversion | Change of `accept` would break AVIF | `marketingAvifUpload`, T22 | revert file |
| `MediaUploadQueue.jsx` | `MediaUploadForm` only | Local | — | T07, T11, T22 | revert file |
| `config/mediaTypes.js` | 12+ modules import roles/scopes/rules | Additive constants only; no existing value changes | Renaming `PRODUCT_MEDIA_ROLES.*` would break the backend vocabulary mapping | T21, `mediaTerminology`, `phase7` | revert file |
| `useProducts.js` / `catalogRepository.js` | `AdminLayout`, `ProductCatalogSelector`, `ProductGroupReviewPanel`, `UnifiedReviewQueue`, `AdminProductReview`, `EmployeeProductReview`, `EmployeeProducts`, `useProduct` | **Not modified at all** (the new hook calls the API adapter directly; the selector subscribes with the already-exported `subscribeCatalogRegister`) | — | Existing `npm test` suite untouched | n/a |
| `media.py` | All media clients | **Not modified** (default plan) | — | Backend suite re-run | n/a |
| `product_service.py` | Every product read | **Not modified** (default plan); only in deferred 004b | Would change storefront imagery for all products with registered media | `test_phase7_media_lifecycle` projections | n/a |

### F.2 Existing suites that must be re-run and the ones that must be **edited**

| Suite | Relationship | Action |
|---|---|---|
| `frontend/tests/phase7ProductMedia.test.js` | Pins the two-call contract at 205/242/262/278/313/574 | **Rewrite** those six assertions to the single-call contract (documented in the test header). Do not delete; keep coverage of ordering, roles, primary, employee routing. |
| `frontend/tests/phase6MediaStorage.test.js` | URL + `apiClient.upload` + form-calls pipeline | Keep; re-run. Only adjust if an assertion encodes the removed call. |
| `frontend/tests/phase3ProductMediaHonesty.test.js` | Static literals for `/media/register` + `/employee/media/register` in `mediaApi.js` | Keep (function retained). |
| `frontend/test/mediaSecurityContracts.test.js` | `canManageMarketing` shape | Keep the shape; re-run. |
| `frontend/test/mediaTerminology.test.js` | `allowScopeChange`/`initialScope`/marketing note | Keep the shape; re-run. |
| `frontend/tests/marketingAvifUpload.test.js` | `createObjectURL`, no conversion | Keep; re-run. |
| `frontend/test/mediaAccessPermissions.test.js`, `adminMediaRegistry.test.js`, `mediaRegistryView.test.js` | Authorization + registry | Re-run unchanged. |
| `backend/tests/unit/test_phase7_media_lifecycle.py`, `test_phase6_media_storage.py`, `test_media_storage_security_regressions.py`, `test_media_schema_integrity.py`, `test_media_avif_validation.py`, `test_phase3_product_media.py`, `test_marketing_media.py` | Storage/idempotency/collision/rollback/permissions | Re-run unchanged — they prove the backend contract this plan relies on. |

---

## G. Verification Checklist

> **Honesty note.** In *this* sandbox only the service/static suites can run (`register.mjs` has no external dependency). The JSX loader needs `vite`, which is not installed here (`ERR_MODULE_NOT_FOUND`), so SSR/component tests and `vite build` require `npm ci` first. No test in this plan is reported as passing; the commands below are what will be executed.

### G.1 Commands

```bash
# --- Frontend: service + static contracts (runnable now) -------------------
cd frontend
npm test                       # node --test "tests/*.test.js" "test/*.test.js"
node --import ./scripts/node-loader/register.mjs --test tests/phase7ProductMedia.test.js
node --import ./scripts/node-loader/register.mjs --test tests/mediaUploadContract.test.js
node --import ./scripts/node-loader/register.mjs --test tests/mediaUploadReconciliation.test.js
node --import ./scripts/node-loader/register.mjs --test tests/mediaProductSearch.test.js

# --- Frontend: deps for JSX/SSR tests + build gate -------------------------
cd frontend && npm ci
node --import ./scripts/node-loader/register-jsx.mjs --test tests/mediaUploadSurface.test.js
npm run build

# --- Backend (needs the project's Python env; NOT available in this sandbox)
cd backend
pytest tests/unit/test_phase7_media_lifecycle.py tests/unit/test_phase6_media_storage.py \
       tests/unit/test_media_storage_security_regressions.py tests/unit/test_media_schema_integrity.py \
       tests/unit/test_media_avif_validation.py tests/unit/test_phase3_product_media.py \
       tests/unit/test_marketing_media.py -q
```

### G.2 Test matrix

| ID | Type | Scenario | Finding | Runnable now |
|---|---|---|---|---|
| **T01** | service (mocked fetch) | Product with an existing primary: batch of 2 → **no** `is_primary` on any payload; incumbent untouched | 001, 021 | ✅ |
| **T02** | service + static | `scope:"employee"` never emits `is_primary`, even when the caller asks; asserts the FormData has no such key | 002, 001 | ✅ |
| **T03** | service | Product with no cover (no registered primary, no legacy image) → first file carries `is_primary=true` | 001 | ✅ |
| **T04** | unit | `nextSortOrder([{sortOrder:0},{sortOrder:4}]) === 5`; batch orders are `5,6,7` | 021 | ✅ |
| **T05** | unit + form | `hasExistingCover`/`needsCatalogueWarning`: legacy-only product ⇒ warning required; after the ack the payload is unchanged | 004 | ✅ (unit) / SSR for copy |
| **T06** | service | 201 + failing read ⇒ `ok:true` with a `refreshError`, **never** `ok:false`/"Failed" | 003 | ✅ |
| **T07** | service | `continueOnError:true`, middle file 422 ⇒ results `[ok, failed, ok]`, all successes retained | 011 | ✅ |
| **T08** | unit | Retry set = `failed + unconfirmed` only; confirmed rows are never re-sent | 011 | ✅ |
| **T09** | service | Timeout ⇒ `unconfirmed` + `uncertain:true`; reconcile matches by `objectKey`, or by `(size, mime, stem)` when unknown; ambiguous ⇒ stays unconfirmed | 003, 010 | ✅ |
| **T10** | unit | Duplicate `name+size+lastModified` rejected; success count = distinct media ids | 014, 025 | ✅ |
| **T11** | service | `alt_text` present on the upload payload for every image; empty alt blocks submit | 008 | ✅ |
| **T12** | unit/SSR | Caption either absent from the DOM (default) **or** sent and read back (if D3 approves the backend batch) | 008-CAPTION | ✅ / ⏳ |
| **T13** | service | `role`, `sort_order`, `title`, `alt_text` all on the upload request for both scopes | 001, 002, 007, 008 | ✅ |
| **T14** | service | The form's pipeline issues **exactly one** request per file (`/media/products/{id}/objects`, or the employee equivalent) — no `/media/register` | 003, 002 | ✅ |
| **T15** | service | Failure classification: 409 → `collision` (replace offered, `replace_existing` only after explicit action), 422 → `rejected`, 403 → `auth`, 500 → `server`, timeout → `timeout` | 003, 010, 012 | ✅ |
| **T16** | hook | `q` → debounced `?q=`; `total` surfaced; `loadMore` appends; cold start shows loading (not "no products"); failure shows error + retry | 005, 006 | ✅ |
| **T17** | SSR/renderer | `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; Arrow/Enter selects; Escape closes and restores; outside-click closes | 017, 026 | ⏳ (`npm ci`) |
| **T18** | SSR | Row shows real SKU or "SKU unavailable"; status chip; archived warning copy | 013, 023 | ⏳ |
| **T19** | unit | `uploadProgressPercent` monotonic, 0→99 during the run, 100 only at the end; no "preparing" dead state | 009, 024 | ✅ |
| **T20** | unit | `submitReadiness` blocks on: no product, no valid files, running, unauthorized, unacknowledged 004 warning; returns a reason string | 015 | ✅ |
| **T21** | existing suite | Authorization + employee restrictions unchanged (`mediaAccessPermissions`, `adminMediaRegistry`, phase7 API-level cases) | 002, 017 | ✅ |
| **T22** | SSR | One `<h1>`; no `amber-*`/`emerald-*`/`sage` classes; `pf-success/warning` used; label `htmlFor="media-file-input"` | 018, 019, 025, 026 | ⏳ |
| **T23** | unit/SSR | Cancel and Back resolve to the same destination; dirty guard invoked when a queue exists | 016 | ⏳ |
| **T24** | SSR | Result rows list name + media id + cover flag; primary action goes to `/…/products/{id}/media` | 022 | ⏳ |

### G.3 Manual end-to-end scenarios (non-production stack)

| # | Scenario | Expected |
|---|---|---|
| M1 | Product with a registered cover → upload 2 gallery images | Cover unchanged; new items appended with the next sort orders; per-file ids shown |
| M2 | Product with only legacy `image` + 4 `additional_images` | Explicit acknowledgement required; if confirmed, `GET /products/{slug}` switches to the registered set; the legacy files still exist (no deletion) |
| M3 | Product with no cover at all | First file becomes the cover, stated before submit |
| M4 | Employee portal, `?productId=<DRAFT id>` | Upload succeeds; no primary requested; role/sort honoured; PUBLISHED/ARCHIVED rejected by the server with its own message |
| M5 | 1366×768 laptop (Super Admin) | Heading, product field and the first file row visible without scrolling; the action bar stays reachable |
| M6 | Block `/media/register` (must not matter now) and block the read-back | Truthful "registered, refresh failed"; never "Failed" |
| M7 | Drag a file slowly across the dropzone, crossing the icon/heading/text | Highlight does **not** flicker; if it does, the counter fix lands and the finding is re-statused "Reproduced" |
| M8 | Offline mid-request | Timeout/abnormal → "Awaiting confirmation" → reconcile resolves to confirmed or failed |
| M9 | Same filename, different bytes | 409 with a clear message; "Replace this image" (admin) re-sends with `replace_existing=true`, producing a content-addressed key |
| M10 | Select the same file twice | One queue row |
| M11 | Keyboard only + screen reader | Product chosen, files added, submit reached, statuses announced |
| M12 | Product with >100 catalogue items (older one) | Found via server search; "Showing 20 of N"; load more works |
| M13 | Cancel with a dirty queue / browser back / hard refresh | Confirmation; no silent loss |
| M14 | `GET /media/audit/orphans` (dry run) after the whole run | No new orphans |

---

## H. Explicitly Unchanged Areas

**Routes & pages:** `/super-admin/media`, `/super-admin/media/marketing`, `/super-admin/products/:productId/media`, `/admin/*` equivalents, the employee media dashboard/detail, and every route table entry in `App.jsx` (including the `Navigate` redirects).

**Backend (default plan):** `media.py` (all four upload/register routes, the media-set reader, permissions, compensation), `upload_service.py`, `media_service.py` (key naming, checksum idempotency, 409 policy, content-addressed replacement), `media_validation.py`, `storage/*` (keys, signatures, providers, configuration), `models/media/*`, `schemas/media/*`, `product_media_records.py`, `product_service.py` (media projections, dual-read, publish gate), `products.py`, `media_reviews.py`.

**Rules:** the publishing/approval workflow; the cover requirement in the publish gate (`product_service.py:254–263`); `media.upload` / `media.view` / `media.delete` authorization; the employee write scope (DRAFT/PENDING only, no primary, own namespace).

**Data:** every `media_media_asset`, `media_product_media`, product row, legacy image column, and object in the store. Nothing is deleted, overwritten, migrated or re-associated. `replace_existing` is only ever sent after an explicit operator action on a 409.

**Frontend assets:** `frontend/public/images/**` untouched.

**Other frontend services:** `useProducts.js`, `catalogRepository.js`, `mediaRepository.js`, `mediaAccess.js`, `activityService.js`, `ProductMediaManager.jsx`, design-system components, `index.css` tokens (consumed, not extended).

---

## I. Deferred or Blocked Items

| # | Item | Why it cannot be fixed here | Least disruptive alternative | What is needed |
|---|---|---|---|---|
| **I-1 (004b)** | Stop the DTO switching a legacy-only product onto the registered set | It is a **read-model policy** in `product_service._registered_media_view` + `product_media_records.primary_item` (fallback to `items[0]`). Changing it alters storefront imagery for *every* product with registered media but no explicit primary; it touches the catalogue projection and the publish gate's assumptions, and several backend tests pin the current behaviour (`test_phase7_media_lifecycle:751, 766, 879`). Those are exactly the boundaries the brief protects. | **004a in this plan:** the consequence is stated on the page and must be acknowledged before the first registration. No silent change. | A separate, approved backend batch with: (a) "registered set overrides only when an explicit `is_primary` exists"; (b) legacy `additional_images` merge vs replace decision; (c) compatibility analysis for the admin/storefront DTOs and the publish gate; (d) rewritten projection tests. |
| **I-2 (008-CAPTION)** | Persist caption | No endpoint accepts `caption`; `media_media_asset.caption` exists but is write-never; a new field changes the registration schema and the read model. | The input is **removed** in B6 so nothing is silently discarded. | Approval for the backend batch in §D.12 (parameter on 4 routes, schema field, read-model field, create-only semantics, backend tests). Only then does the input return. |
| **I-3 (N-01)** | Employee portal product list | Requires a new `GET /employee/products` (list) route — a new API surface outside this task's boundaries. | Selector `productSource="register"` with an honest empty state; employees can still reach the page with `?productId=`. | A separate decision + backend batch (reuse `list_admin_products` with an assignment filter and `require_permission_for_user(..., products.view)`), then switch `productSource` to it. |
| **I-4 (metadata updates)** | Editing title/alt of an already-registered asset | Server metadata is create-only (`media.py:205–228`); there is no PATCH for assets. | The queue's metadata inputs become read-only once a file is `stored`, so the UI never implies an edit it cannot save. | A future `PATCH /media/assets/{id}` (out of scope). |
| **I-5 (027)** | Drag-flicker fix | **Suspected**, not reproduced. | Reproduce (M7) first; the code change is 5 lines if real. | M7 outcome. If not reproducible, re-status "Not reproduced" and leave the code alone. |
| **I-6 (004a caveat)** | A *fully* reliable cover decision when the media-set read fails | Cannot know whether a cover exists. | If the read fails: proceed with `is_primary=false` for all files (never demote), omit `sort_order` (server default), and say so in the summary. | Nothing — this is the intended conservative behaviour. |

---

## J. Final Readiness Statement

**The plan is complete for implementation.** All 27 audit findings, the caption concern, and the newly discovered N-01 are accounted for with an owning batch, exact files, and a test. Every batch is code-only: no migration, no data mutation, no storage change, and no backend contract change in the default path.

**Decisions required before coding (each has a recommended default so approval can be a single "yes"):**

| # | Decision | Recommended default |
|---|---|---|
| **D1** | Approve the **single-call** upload design (metadata on the upload request; drop the page's redundant `/media/register` call) | **Yes** — it is what removes 001/002/003 at the root, with no backend change |
| **D2** | Accept that employee **role/sort** become honoured (today they are silently ignored by `preserve_existing_mapping`) while `is_primary` stays forbidden | **Yes** — it makes a visible field truthful; the server policy is unchanged |
| **D3** | Caption: **remove the input now** (default) **or** approve the backend batch (§D.12) | **Remove now**, wire later |
| **D4** | MEDIA-UPLOAD-004: **warn + explicit acknowledgement now** (004a) and defer the projection change (004b) | **Yes** — 004b needs its own approved plan |
| **D5** | N-01 employee product list: accept the honest empty state and defer `GET /employee/products` | **Yes** |
| **D6** | Upload timeout value and client file cap | **180 s per file, 24 files per batch** (both single constants) |

After approval, implementation proceeds in the order B1 → B2 → B3 → B4 → B5 → B6, with B7 only if D3 says "wire it". No code has been changed, nothing has been committed, and no data or storage has been touched.

---

*Prepared from `MEDIA_UPLOAD_AUDIT.md` and a re-read of every file cited above. Behaviours are stated from the code; nothing in this document claims a test, API call, or end-to-end upload was executed during planning.*
