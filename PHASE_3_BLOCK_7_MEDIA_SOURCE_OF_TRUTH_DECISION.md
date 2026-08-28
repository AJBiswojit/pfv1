# PHASE 3 — BLOCK 7 MEDIA SOURCE-OF-TRUTH DECISION

**Resolves the Block 7 blocker:** the publish gate reads only the product's legacy
media columns while `media_product_media` is the authoritative association.

**Date:** 2026-08-28 · **Branch:** `arena/01a04704-pfv1` · **Status:** DECISION CHECKPOINT — nothing implemented
**Reading list satisfied:** Block 7 report · Phase 3 plan (full) · `API_CONTRACT.md` · Blocks 1–6 reports ·
all media-lifecycle and publish/publish-issues tests · live re-verification probe (48/48 checks)

Every claim is labelled **[VERIFIED]** (executed or read in the source this session),
**[INFERRED]** (reasoned from source that was read), or **[NOT VERIFIABLE]** (cannot be
executed in this environment — no PostgreSQL server exists here).

---

## 1. Executive summary

**[VERIFIED]** The Block 7 blocker was re-executed this session with a fresh 48-check probe
against the real routers, real ORM and a real object store: a product whose media exists
**only** as a registered primary association (`media_product_media.is_primary=true`,
resolving URL served) is still refused by the publish gate with
*"At least one cover image is required before publishing."* The gate's media branch
(`product_service.py:238-242`) reads `product.image` and `product.primary_media_id` — both
legacy product columns. The only writer that copies registered media into those columns is
the frontend's `syncProductMediaFromServer`, which plan §24 step 9 orders removed.

The decision between the two candidate resolutions is made on **plan-internal evidence**,
not architectural preference:

* **The plan's own integration spec (§22.3) already encodes Option A.** It requires
  `POST /media/register (product_id, is_primary)` → `publish` → **200**, with no legacy
  PATCH anywhere in the flow. Option A is the only resolution under which that spec is
  executable as written. **[VERIFIED]**
* Option B (server-side projection into the legacy columns) contradicts the plan's own
  architecture twice over: §11.4 item 1 makes `media_product_media` the **single** source
  of truth (B manufactures a second, writable copy), and §11.4 item 2 says the legacy keys
  become **read-only projections** removed from the write contract (B keeps them writable
  **and** writes them from a second place). It would also require inventing projection
  semantics the plan never specifies and would invert a Phase 7 regression lock
  (`test_registering_media_does_not_write_the_product_row`).
* Step 9's phrase *"publish gate unchanged during the transition"* is **unsatisfiable
  together with its own frontend deliverable** — this is the Block 7 proof. The plan's own
  §11.4 item 3 shows the intent: the gate must accept **both** sources during the
  transition. Only Option A implements that intent with the smallest change surface.

**Decision: Option A** — teach the publish gate to accept a registered primary association,
**retaining** the legacy authored branch during the transition (§11.4 item 3: *"keep that
during the transition"*). No migration. No wire-contract change. Frontend untouched in the
gate-resolution step; the step-9 frontend removal (R5 stage 1) and the schema removal
(R5 stage 2) follow in their planned sequence. **Nothing was implemented, committed or
pushed in this checkpoint.**

---

## 2. Block 7 blocker

**[VERIFIED]** Reproduced this session (probe scenario 1; probe is `/home/user/scratch/media_sot_probe.py`,
48/48 checks; disposable SQLite + temporary media root, real app stack):

```
media_product_media rows        → 1, is_primary=True, role=COVER
media-set mediaRecordsAvailable → True
media-set primaryMediaUrl       → /api/v1/media/objects/products/.../cover.png (bytes served)
legacy columns                  → image=''  primary_media_id=None  media_ids=[]
GET  /admin/products/{id}/publish-issues → ["At least one cover image is required before publishing."]
POST /admin/products/{id}/publish        → 422 BUSINESS_RULE_VIOLATION "Product has unresolved publish issues."
                                           (after approve; row stays PENDING_REVIEW, published=false)
```

**[VERIFIED]** Root cause: `get_publish_issues` (`backend/app/services/catalog/product_service.py:238-242`):

```python
has_authored_image = bool((product.image or "").strip())
has_primary_media  = bool(product.primary_media_id)
if not has_authored_image and not has_primary_media:
    issues.append("At least one cover image is required before publishing.")
```

Both branches are `catalog_product` columns. A repo-wide search found **no backend writer**
of `primary_media_id` / `media_ids` / `gallery_media_ids` other than the generic product
create/update mapping (`update_product`'s `setattr` loop, `product_service.py:1637 (update)`;
`duplicate_product`, `:2117-2121`). The sole populator of registered media into those
columns is the frontend's `syncProductMediaFromServer` (see §10). **[VERIFIED]**

**Therefore** *(Block 7 §11, restated):* "frontend stops sending media-write keys" and
"existing publish gate remains unchanged" **cannot both be true**. The resolution must
change exactly one of them. **[VERIFIED]**

---

## 3. Governing plan requirements

**[VERIFIED]** Quoted from `PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_PLAN.md`:

* **§11.1** — `media_product_media` is *"the AUTHORITATIVE association, written ONLY by
  POST /media/register"*; the legacy columns are *"legacy 'claims'"* written by the
  product contract. Read rule: *"registered associations win. An **empty** registered list
  falls back to the legacy columns."*
* **§11.4 item 1** — *"`media_product_media` becomes the **single** source of truth for
  product media."*
* **§11.4 item 2** — *"The product contract's `mediaIds` / `primaryMediaId` /
  `galleryMediaIds` become **read-only projections** — removed from
  `ProductContentFields`, so writing them is a 422 rather than a silent no-op.
  `image` / `hover_image` / `additional_images` remain as the legacy authored fallback
  for pre-Phase-7 rows only."*
* **§11.4 item 3** — *"The publish gate already accepts either source; keep that during
  the transition and retire the authored branch once every live product has registered
  media."* — Block 7 proved the premise ("already accepts either source") **false**:
  both accepted sources are legacy product columns.
* **§22.3 (integration, plan step 11)** — the end-to-end flow **as written**:

  ```
  PUBLISH POST /admin/products/{id}/publish     → 422 while a cover image is missing
          POST /media/register (product_id, is_primary)
          POST /admin/products/{id}/publish     → 200, PUBLISHED, published=true
  ```

  There is **no legacy PATCH** in this flow. Registration alone must unblock publish.
  This spec is executable **only under Option A**. **[VERIFIED]**
* **§23 R5** — removing the media-write fields is two-stage: *"ship the frontend change
  first, confirm no caller sends them (a temporary log counter), then remove them
  server-side."*
* **§24 step 9** — *"role/namespace allow-lists; frontend stops sending media-write keys;
  then remove them from ProductContentFields; publish gate unchanged during the
  transition."* The allow-lists shipped in Block 7. The remaining deliverables are the
  ones blocked here.
* **§25(21)** — no Alembic revision; no PostgreSQL object altered. **§25(22)** — backend
  ≥ 333 / frontend ≥ 239 passing. **§25(19)** — `docs/openapi.json` matches the live app.
* **API_CONTRACT §12.1** — `media_product_media` *"Authoritative for new product media"*;
  the product columns are *"Legacy claim columns"*; §12.4 documents the blocker verbatim.

**[VERIFIED]** Conflict map: step 9's *"publish gate unchanged"* vs §11.4 item 3's
*"accepts either source"* vs §22.3's register-then-publish flow. The only coherent
reading: **the gate must gain the registered-media branch while keeping the legacy branch.**
That is Option A.

---

## 4. Current media architecture

**[VERIFIED]** Static audit over both trees (all line refs read this session).

### 4.1 Tables (migration `b6b5dcfb675b` + ORM models)

| Table | Column | Notes |
|---|---|---|
| `media_media_asset` | `object_key` UNIQUE, `status` String(30) default `"uploaded"`, `scope` String(30) default `"product"`, `uploaded_by` → users SET NULL | one row per verified object; no API ever changes `status` today |
| `media_product_media` | `product_id` FK→`catalog_product.id` CASCADE, `media_id` FK→`media_media_asset.id` CASCADE, `role` String(30) default `"gallery"`, `sort_order` int, `is_primary` bool, UNIQUE(product_id, media_id) | authoritative association; both FKs NOT NULL → both cascade |

`assigned_by` is a plain user-id audit column (no FK), matching the project convention.
No `relationship()` is declared; every read goes through `product_media_records.py`. **[VERIFIED]**

### 4.2 Writers and readers of `media_product_media` / `media_media_asset`

* **Writers:** `POST /media/register` **only** (`backend/app/api/v1/media.py:457-462` asset
  row, `:467-470` association upsert + demotion). **[VERIFIED]** — no other write site in
  the backend; no frontend module calls a media-association write other than through this
  endpoint. **[VERIFIED]**
* **Readers:** `registered_media_for_product` / `registered_media_for_products`
  (`product_media_records.py:65-112`) → `GET /media/products/{id}/media-set`
  (`media.py:263-303`) and `ProductService._registered_media_map/_items/_view`
  (`product_service.py:301-366`), which feed **every** admin and storefront projection.
  **[VERIFIED]**
* **No unregister/association-delete endpoint exists.** `DELETE /media/objects/{key}`
  removes storage bytes only — the asset row, the association, and the product's columns
  are untouched (probe scenario 5). **[VERIFIED]**

### 4.3 The legacy columns and who touches them

`catalog_product.media_ids` / `primary_media_id` / `gallery_media_ids` (JSONB/String) and
`image` / `hover_image` / `additional_images` (model `product.py:118-125`). **[VERIFIED]**

| # | Writer | Path | Endpoint |
|---|---|---|---|
| W1 | Generic product create/update mapping (`setattr` loop) | `product_service.py:1637` (update), create analogue | `POST /admin/products`, `POST /admin/products/draft`, `PATCH /admin/products/{id}` |
| W2 | `duplicate_product` copies all six fields to the duplicate | `product_service.py:2117-2121` | `POST /admin/products/{id}/duplicate` |
| W3 | Frontend `syncProductMediaFromServer` (projection PATCH) | `productMediaService.js:127-151` | `PATCH /admin/products/{id}` |
| W4 | Frontend forwarders of whatever the local record holds: editor save (`productAdminService.js:105-117`) and legacy command paths (`catalogRepository.js:867-881` → `syncProductToBackend`, fired from `writeProduct` `:841`) | `buildAdminProductPayload` (`productsApi.js:131-134`) | `PATCH /admin/products/{id}` (+ employee PATCH, which the server whitelists to non-media fields) |

**Explicitly NOT writers [VERIFIED]:** bulk update (`BULK_UPDATABLE_FIELDS`,
`product_service.py:2139-2159` — media ids absent by design); employee update
(`EMPLOYEE_EDITABLE_FIELDS`, `schemas/catalog/product.py:527-536` — no media keys).

**Readers of the legacy columns [VERIFIED]:**

| Reader | Line | Note |
|---|---|---|
| **Publish gate** (media branch) | `product_service.py:238-242` | `image` OR `primary_media_id` — the blocker |
| Admin DTO projection | `:519-525` | used **only** when the registered view is empty (`media_view.get(..., legacy)`) |
| Storefront DTO projection | `:432-437` | same dual-read |
| media-set legacy half | `media.py:290-298` | `primary`/`hover`/`gallery` + the three echo keys |
| Explore dedup | `explore_service.py:443` | reads the **projected DTO** (`item.primary_media_id or item.image`), which already prefers the registered view |
| Frontend local pre-check | `catalogRepository.js:607-660` (`getPublishIssues`), `productPublishValidator.js` | convenience only; the server gate is the authority (`ProductEditor.jsx:336-367` prefers the server's `publish-issues` when admin) |

### 4.4 `role` and `is_primary` semantics

* **`role`** — closed vocabulary of 10 members (`schemas/media/media.py:25-37`), matched
  case-insensitively, stored in the caller's casing, write-path-only control (Block 7).
  **[VERIFIED]**
* **`is_primary`** — boolean; `POST /media/register` with `is_primary=true` demotes every
  other association of the product **in the same transaction** (`media.py:467`), so a
  product has at most one primary. Zero primaries is reachable by re-registering the
  incumbent with `is_primary=false` (probe scenario 6). **[VERIFIED]**
* **`role="COVER"` is descriptive, not authoritative.** `role=COVER` may be registered
  with `is_primary=false`; `is_primary=true` may carry any role; role casing diverges
  (`COVER` vs `gallery` both legal). The operative primary signal throughout the system is
  `is_primary`: demotion keys on it (`media.py:467`), ordering keys on it
  (`product_media_records.py:30-33`), the read view keys on it (`primary_item`,
  `:123-128`). `PRIMARY_ROLE = "COVER"` (`:37`) has **zero call sites**. **[VERIFIED]**
* **`primary_item` falls back to the first item** when nothing is primary
  (`:123-128`) — so `media-set.primaryMediaUrl` can be non-null for a product with **no**
  primary (probe scenario 2). A publish gate must therefore key on `is_primary=true`
  **rows**, never on the media-set's fallback value. **[VERIFIED]**

### 4.5 Source-of-truth table (the deliverable of task step 1)

| Value | Writer | Reader | Endpoint | Service | Model/table | Authoritative? |
|---|---|---|---|---|---|---|
| `media_product_media.*` (association, role, sort_order, is_primary) | `media.py:467-470` only | `product_media_records.py`, ProductService read model | `POST /media/register` | MediaService (thin), router code | `media_product_media` | **YES — the authoritative association** |
| `media_media_asset.*` (object_key, status, scope…) | `media.py:457-462` only | registration idempotency, the registered read join, `/media/assets` | `POST /media/register` | router code | `media_media_asset` | **YES — asset identity** |
| `product.image` | W1, W2, W3, W4 | publish gate; DTO fallback; media-set legacy half; frontend pre-check | `POST`/`PATCH /admin/products…` | ProductService create/update/duplicate | `catalog_product.image` | Legacy authored plate — fallback only for pre-Phase-7 rows |
| `product.primary_media_id` | W1, W2, W3, W4 | **publish gate (blocking)**; DTO fallback; media-set echo | same | same | `catalog_product.primary_media_id` | Legacy claim — currently **must** be populated for publish |
| `product.media_ids` / `gallery_media_ids` | W1, W2, W3, W4 | DTO fallback; media-set echo; frontend local logic | same | same | `catalog_product.*` JSONB | Legacy claims |
| `product.hover_image` / `additional_images` | W1, W2, W3, W4 | DTO fallback; media-set legacy half | same | same | `catalog_product.*` | Legacy authored |
| Response `mediaIds` / `primaryMediaId` / `galleryMediaIds` / `image` / `additionalImages` (admin + storefront DTOs) | **derived**: `_registered_media_view` when registered media exist, else legacy columns | frontend storefront cards, editor, review panels | every product read | ProductService | — | Derived projection of the authoritative association |
| `media-set` response (`mediaItems`, `primaryMediaUrl`, `mediaRecordsAvailable`, legacy echoes) | derived per read | `syncProductMediaFromServer`, media manager | `GET /media/products/{id}/media-set` | router + records module | — | Derived |

---

## 5. Authoritative association

**[VERIFIED]** `media_product_media` is authoritative by every governing document
(plan §11.1, API_CONTRACT §12.1, model docstring, migration docstring):

* written by exactly one endpoint (`POST /media/register`),
* product existence is validated before association (404 otherwise, `media.py:464-466`),
* keyed on `product_id` → `catalog_product.id` — the **primary key**, which
  `change-id` never touches (`product_service.py:2015`, contract §11.7), so association
  identity is stable across display-label renames,
* idempotent by `object_key`; UNIQUE(product_id, media_id) backed by constraint
  `uq_product_media_asset`,
* one-primary invariant enforced transactionally by the demote-then-upsert,
* the read rule everywhere (admin, storefront, media-set) prefers it when non-empty.

**[VERIFIED]** The association is **sufficient** for a publish check: a registered
primary implies an asset row (FK, and the read join is inner), an object key, and a
resolvable canonical URL at registration time.

---

## 6. Legacy media fields

**[VERIFIED]** Current role: dual-read **fallback** for pre-Phase-7 rows, and — critically
today — the **only** source the publish gate consults.

* The read rule (`_registered_media_view` + `media_view.get(...)` fallbacks) keeps legacy
  rows serving exactly as before: empty registered set → legacy columns answer.
* The gate's legacy branch (`image` OR `primary_media_id`) is what keeps legacy-authored
  products publishable.
* The three id keys are accepted and stored by the product contract, but cease to
  determine what is served once any registered media exist (PF3-N09, contract §12.1).
* W3/W4 mean the frontend currently performs the projection that keeps the gate working
  for registered-media products. That projection is the **only** bridge between the two
  stores; step 9 deletes it. **[VERIFIED]**

---

## 7. Complete media data flow

**[VERIFIED]** Trace executed this session (probe, 48/48) plus the Phase 7 lifecycle suite
(`test_phase7_media_lifecycle.py:768-930`, 41 passed with `test_phase6_media_db.py`):

```
UPLOAD      POST /media/products/{id}/objects
              → bytes into storage, key products/{ID}/{file}; NO database rows.  [VERIFIED]
REGISTER    POST /media/register (object_key, product_id, role, is_primary)
              → verify object exists (404 otherwise) → asset row (status="uploaded",
                scope="product") → if product_id: demote all is_primary for the product,
                upsert association → COMMIT → invalidate product cache.
              → product row UNTOUCHED (image/primary_media_id/media_ids unchanged). [VERIFIED]
ASSOCIATE   media_product_media row; UNIQUE(product_id, media_id); idempotent by key. [VERIFIED]
PRIMARY     is_primary=true row; ≤1 primary enforced by demotion in the same transaction;
            zero primaries possible only by explicit demotion. [VERIFIED]
PRODUCT     GET /admin/products/{id} / GET /products/{id}
  READ        → DTO media fields derived from the registered view when non-empty
              (mediaIds/primaryMediaId/galleryMediaIds/image/additionalImages), legacy
              columns otherwise. Registered-only products already SERVE the right media
              on reads — only the publish gate is blind. [VERIFIED]
PUBLISH-    GET /admin/products/{id}/publish-issues → get_publish_issues(product)
  ISSUES      → reads product.image / product.primary_media_id ONLY
              → "At least one cover image is required…" despite a real registered primary.
              [VERIFIED — THE BLOCKER]
PUBLISH     POST /admin/products/{id}/publish → approved? → get_publish_issues → 422.
              The frontend's sync PATCH (W3) populates the legacy columns first, which is
              the only reason the flow ever succeeds today. [VERIFIED]
STOREFRONT  public DTO reads prefer the registered view (primary-first ordering); bytes
              served from /media/objects/... ; register invalidates the cached DTO
              (fresh read shows a new primary immediately — probe scenario 4). [VERIFIED]
```

**Where the authoritative value changes:** only at `POST /media/register`. The legacy
columns change only when the product contract (or the frontend projection) writes them —
never as a consequence of registration. That asymmetry is the blocker. **[VERIFIED]**

**Post-publish mutations [VERIFIED]:** primary swap after publish updates the association
and the cached DTO (probe scenario 4). Object deletion removes bytes only — the
association, asset row, DTO URLs and the gate's view of "having a cover" are all
unaffected (probe scenario 5). Demotion of the only primary leaves zero primaries; a
stale legacy projection keeps the gate green (probe scenario 6).

---

## 8. Publish gate analysis

**[VERIFIED]** Anatomy:

* `get_publish_issues(product: ProductModel) -> List[str]` — **synchronous module-level
  function** (`product_service.py:207-246`). Checks: id, real name, SKU, category, price,
  description, **media (image OR primary_media_id)**, blocking review flags (reads the
  declared `REVIEW_FLAG_BLOCKING` set).
* Call sites — exactly two, both async with a DB session available **[VERIFIED]**:
  * `publish_product` (`:1939`) — after the `review.state == APPROVED` check (`:1931-1937`),
    refuses with 422 `BUSINESS_RULE_VIOLATION` + `details.errors`; on pass writes
    `status/published/published_by/published_at` together (`:1944-1951`);
  * `ProductService.get_publish_issues` (`:1998-2000`) — backs
    `GET /admin/products/{id}/publish-issues` (`products.py:640-656`, permission
    `products.view`). `POST .../publish` requires `products.manage` (`:571-585`).
* **Request transactionality [VERIFIED by code]:** `get_db` yields one session per request
  and commits once at request end (`dependencies.py:39-49`). A publish request's gate read
  and the product flush therefore run on the same session/transaction. A cross-request race
  with a concurrent `register` commit is the same class as the documented SKU/slug
  uniqueness caveat (contract §9.5) — unchanged by either option.
* **Cached DTOs do not feed the gate [VERIFIED]:** the gate evaluates the ORM row loaded
  fresh in the request transaction; the storefront cache is a read-side concern, and
  `register` already invalidates it (`media.py:475-479`, probe scenario 4).
* **Migration-safety precedent [VERIFIED]:** `_registered_media_items` /
  `_registered_media_map` (`product_service.py:301-341`) already run the association read
  inside a SAVEPOINT and fall back to legacy on any failure — the pre-Phase-7
  (media-tables-absent) database keeps working. Any gate change must reuse this wrapper so
  a pre-migration DB is not made unpublishable.
* **Structural test constraint [VERIFIED]:** `test_the_publish_gate_consumes_the_declared_blocking_set`
  (`test_phase3_product_lifecycle.py:823-837`) asserts via `inspect.getsource` that
  `get_publish_issues` reads `REVIEW_FLAG_BLOCKING`. Any Option A refactor must keep that
  read inside the same function (or that protected test must change — it must not).
* The canonical error string
  *"At least one cover image is required before publishing."* is asserted in at least four
  suites (`test_phase3_product_lifecycle.py:501-520`, `test_phase3_product_media.py:754-819`,
  frontend `phase3ProductMediaHonesty.test.js`, and the Block 7 real-HTTP walk). It is the
  business-rule error both options must preserve. **[VERIFIED]**

---

## 9. Storefront media analysis

**[VERIFIED]**

* Every public product surface serialises through `_to_storefront`
  (`product_service.py:368-446`) with `media_view = self._registered_media_view(registered)`
  — the **same** registered-primary-first resolution for list, PDP, explore, search,
  category/collection pages, recommendations, recently-viewed. Storefront and admin reads
  agree on the primary because they share `_registered_media_view` +
  `registered_media_for_products`. **[VERIFIED]**
* Registered-only products already serve the right primary URL on the storefront
  (probe scenario 3; `test_phase7_media_lifecycle.py:860-930`). The storefront needs **no
  change** under either option.
* The storefront does **not** gate on cover presence at read time (contract §10.3: cover
  enforced once, at publish). So the gate fix is the only storefront-adjacent change.
* Freshness: register → `invalidate_product_cache(product.id, product.slug)` (verified
  code + probe scenario 4). No second cache key would be introduced by Option A (§23 R9
  satisfied). **[VERIFIED]**
* Explore's dedup reads the **projected DTO** (`explore_service.py:443`), so it inherits
  the registered view automatically. **[VERIFIED]**

---

## 10. Frontend media-write analysis

**[VERIFIED]** All writers enumerated; every line read this session.

### 10.1 `syncProductMediaFromServer` — the projection writer

`frontend/src/services/media/productMediaService.js:127-151`:

```
GET /media/products/{id}/media-set → buildProductMediaPatch(items) → PATCH /admin/products/{id} → re-GET product
```

`buildProductMediaPatch` (`:98-125`) emits: `mediaIds`, `primaryMediaId`
(falls back to the **first item** when nothing is primary — `:110`), `galleryMediaIds`,
`image` (primary URL), `additionalImages` (all URLs). Callers **[VERIFIED]**:

* `MediaUploadForm.jsx:258` — after batch upload+register ("persist the registered
  order/primary onto the product record itself").
* `ProductMediaManager.jsx:191` — after upload/reorder/primary operations; result feeds
  `onChange` → `SectionMedia` patches `draft.image`/`additionalImages` locally.
* `setPrimaryProductMedia` / `reorderProductMedia` (`:296-318` region) call it internally.

### 10.2 The payload forwarders

`buildAdminProductPayload` (`productsApi.js:52+`, media keys `:131-134`) forwards
`mediaIds`/`primaryMediaId`/`galleryMediaIds`/`image` whenever the local record holds
them. Used by **[VERIFIED]**:

* `productAdminService.saveContent` (`:105-117`) — the editor's content save;
* `catalogRepository.syncProductToBackend` (`:867-881`), fired by the local-register
  write primitive `writeProduct` (`:841`) — legacy command paths (media detach, employee
  portal, workflow `setPrimaryMedia` → `updateDraft` with
  `{primaryMediaId, mediaIds, galleryMediaIds}` at `productWorkflow.js:762-768`).

### 10.3 What Step 9 expects the frontend to stop sending

**[VERIFIED]** Plan §24 step 9 + §11.4 item 2 + §23 R5 stage 1: the **three media-write
keys** `mediaIds` / `primaryMediaId` / `galleryMediaIds` (the ones §11.4 item 2 converts
to read-only projections). `image`/`hoverImage`/`additionalImages` are the legacy
**authored** fields and stay (§11.4 item 2) — but `buildProductMediaPatch`'s habit of
**deriving** `image`/`additionalImages` from registered media is part of the projection
being deleted (that derivation is the legacy-column write of registered URLs). Concretely,
stage 1 touches:

1. `buildProductMediaPatch` / `syncProductMediaFromServer` — stop PATCHing media keys
   (under Option A the PATCH becomes wholly unnecessary; the DTOs already project the
   registered view on read);
2. `buildAdminProductPayload` (`productsApi.js:131-134`) — stop forwarding the three keys
   (one change covers both the editor save and the legacy sync paths);
3. the pinned STATIC lock tests (`phase3ProductMediaHonesty.test.js:165-212`) and the
   sync tests (`phase7ProductMedia.test.js:138-160, 388-437`) — rewritten deliberately.

Stage 2 (removal from `ProductContentFields` → 422) stays gated on R5's caller census,
which needs a deployed observation window. **[VERIFIED — plan text]**

### 10.4 Not part of step 9 [VERIFIED]

* `SectionMedia`'s free-text **"Cover image URL / plate"** bound to `draft.image`
  (`editorSectionsContent.jsx`, `:231`) — an authored plate write, explicitly
  retained by §11.4 item 2.
* The local `mediaRepository` register (localStorage) and its consumers
  (`productMediaSet.js`, review panels) — Phase 4 scope, API-197 (Block 7 §20).
* The frontend's local `getPublishIssues` pre-check — a convenience; the server gate is
  the authority.

---

## 11. Option A analysis — gate reads `media_product_media` directly

**Change surface [VERIFIED]:** `ProductService.publish_product` and
`ProductService.get_publish_issues` fetch the registered list (reusing the existing
`_registered_media_items` SAVEPOINT wrapper) and pass it to the gate; the gate's media
branch becomes *authored image OR legacy `primary_media_id` OR a registered
`is_primary=true` association*. Two call sites, one function, no schema, no router, no
frontend change. The legacy branch is **kept** (transition rule, §11.4 item 3).

| Question | Finding |
|---|---|
| How is primary media identified? | An association row with **`is_primary=true`** for the product. ≤1 enforced at write (demotion); gate must require ≥1 — zero-primary states exist and must **not** satisfy the gate. **[VERIFIED]** |
| Is `role=COVER` the canonical cover? | Descriptive convention, **not** the authoritative signal: case-divergent values, `COVER` with `is_primary=false` possible, `PRIMARY_ROLE` constant unused. The gate must key on `is_primary`, never on role text. **[VERIFIED]** |
| Is `product_id` association sufficient? | Yes — FK to the stable primary key (`catalog_product.id`), product existence validated at register, `change-id` only relabels the display field. **[VERIFIED]** |
| Do status/deletion rules apply? | **No status vocabulary is live**: assets are born `"uploaded"` and no API transitions `status` (API-125/140 deferred to Phase 4). No asset rows are deletable via API; object deletion touches bytes only. The gate therefore has nothing to filter on today. The read join (inner) drops associations whose asset row is gone. **[VERIFIED]** |
| Must asset status be checked? | Cannot be checked meaningfully today (no transitions exist). Deferred with API-125/140. **[VERIFIED absence; INFERRED consequence]** |
| Missing media → canonical error? | Yes — the same issue string and 422 envelope are preserved; only the *sources* consulted grow. **[VERIFIED current behaviour; A designed to preserve it]** |
| Do cached product DTOs affect this? | No — the gate reads the transaction's fresh ORM row; register already invalidates the storefront cache; A introduces no new cache key (§23 R9). **[VERIFIED]** |
| Can publish check transactionally? | Yes — the gate read and the publish flush share the request session (single commit, `dependencies.py:39-49`). Cross-request race with a concurrent register remains, same class as §9.5. **[VERIFIED by code]** |
| Migration? | **None.** A plain SELECT over existing tables; no schema or data change. Works identically on SQLite (verified) and, by construction, PostgreSQL (NOT VERIFIABLE here — no server). **[VERIFIED / NOT VERIFIABLE]** |
| Migration-safety for pre-Phase-7 DBs? | Inherited from `_registered_media_items`: tables absent → SAVEPOINT catch → `[]` → legacy branch answers. **[VERIFIED]** |

**Tests affected by Option A [VERIFIED]:**

| Test | Verdict |
|---|---|
| `PublishGateMediaSourceTests::test_registered_primary_media_does_not_satisfy_the_publish_gate` (`test_phase3_product_media.py:768-790`) | **FLIPS — deliberately.** Its own assertion message says the resolution announces itself here. Rewrite into the new acceptance test (matrix item 3). |
| `::test_the_legacy_columns_do_satisfy_the_publish_gate` (`:792-799`) | **PASSES unchanged** — the legacy branch is retained. |
| `::test_registering_media_does_not_write_the_product_row` (`:801-819`) | **PASSES unchanged** — A does not touch registration. |
| `test_phase7_media_lifecycle.py` full-lifecycle + registered-only publish tests (`:768-930`) | **PASS unchanged** — the PATCH they perform becomes unnecessary but harmless. |
| `test_phase3_product_lifecycle.py` publish-matrix + structural source test (`:501-520, :823-837`) | **PASS unchanged** — media branch addition keeps `REVIEW_FLAG_BLOCKING` read in the same function. |
| `test_phase6_media_db.py` storefront/admin projections | **PASS unchanged** — projections untouched. |
| Frontend suites | **Untouched by A** — frontend changes are stage 1, a later step. |

**Can Option A land without a migration?** Yes. **[VERIFIED]**

---

## 12. Option B analysis — server projects the association into legacy columns

**Change surface [INFERRED]:** `POST /media/register` would, after the association commit,
write `primary_media_id` / `media_ids` / `gallery_media_ids` (and likely `image` /
`additional_images`) onto the product row.

| Question | Finding |
|---|---|
| Where would projection happen? | In the register route's existing transaction (or a new projector module). A `ProductMediaService` does **not** exist today — `services/media/` holds read-only modules (`product_media_records`, resolver, migration). B either inflates `media.py` (a §21-listed file, outside the §21 scope for this work) or creates a new file the plan never named. **[VERIFIED]** |
| Is `POST /media/register` the correct location? | It is the **only** writer of the association, so it is the only place the projection could stay in sync **today** — but the plan never specifies server-side projection; it specifies the columns becoming *read-only projections*, i.e. the response-level projection that already exists (`_registered_media_view`). Writing them back to storage is a new, unspecced behaviour. **[VERIFIED absence of spec]** |
| Projection semantics | **Must be invented.** What wins when an authored plate exists (frontend sync today **overwrites** `image`/`additionalImages` with registered URLs)? What is written when zero primaries exist (frontend falls back to first item)? What happens on demotion? None of this is specified anywhere in the plan or contract. Porting the frontend's heuristics into the server would import the exact fallback semantics the plan scheduled for deletion. **[VERIFIED absence of spec]** |
| Are legacy columns needed elsewhere? | Yes — dual-read fallback for pre-Phase-7 rows and the gate's legacy branch. They are **not** needed as a copy of the registered set: the DTOs already project the registered view on every read. **[VERIFIED]** |
| When primary changes | Register demotes + upserts in one transaction; the same transaction could rewrite the projection. Works **for this path**. **[INFERRED]** |
| When media (object) is deleted | No reconciliation exists: `DELETE /media/objects/{key}` touches bytes only (probe scenario 5). The projection would keep pointing at a 404 URL — the gate would accept a cover whose bytes no longer exist. (Option A shares this exposure; neither can fix it without a media-lifecycle design.) **[VERIFIED]** |
| When the association is removed | No unregister/delete-association API exists. A future removal API (Phase 4) would become a **second writer** that must also maintain the projection — a permanent two-writer invariant. **[VERIFIED absence; INFERRED]** |
| Can projection become stale? | Yes: any future association writer, direct DB edits, or a product PATCH through the still-open product contract (until R5 stage 2) can diverge the columns from the table. A's gate reads the table itself and cannot go stale this way. **[INFERRED from verified writers]** |
| Two sources of truth? | Yes, by construction: until stage 2 removes the keys, the product contract still accepts them (W1), and B adds register as a second writer of the same columns with different authority. The PF3-N09 "fiction beside the truth" window stays open. **[VERIFIED]** |
| Transactions | No added complexity — register already demotes, upserts and commits once. **[VERIFIED]** |
| Migration | None needed. Same as A. **[VERIFIED]** |
| Product history | Projection through `update_product` would append `history` entries per media write; writing columns directly in `media.py` bypasses the audit path the frontend PATCH currently uses. Either way the product audit trail changes shape because of a *media* write — a coupling A does not create. **[INFERRED]** |

**Tests affected by Option B [VERIFIED]:**

| Test | Verdict |
|---|---|
| `test_registering_media_does_not_write_the_product_row` | **FLIPS** — registration would now write the product row, inverting the Phase 7 association contract this lock protects. |
| `PublishGateMediaSourceTests::test_registered_primary_media_does_not_satisfy_the_publish_gate` | **FLIPS** — same as A. |
| `::test_the_legacy_columns_do_satisfy_the_publish_gate` | PASSES (legacy branch kept). |
| Every Phase 7 test asserting product-row purity after register (e.g. `:801-819` and its relatives) | Must be re-audited; product-row assertions after register change everywhere. |
| Phase 7 lifecycle full-flow tests | PASS (the PATCH becomes redundant). |

---

## 13. Decision matrix

| Criterion | Option A (gate reads the association) | Option B (server projects into legacy columns) |
|---|---|---|
| respects authoritative association | **Yes** — the gate consults the authoritative table directly. **[VERIFIED]** | Partially — the gate still reads a copy; authority remains split. |
| number of sources of truth | 1 (association table; legacy kept as the pre-Phase-7 fallback only). **[VERIFIED]** | 2 writable copies until R5 stage 2; register + product contract both write the same columns. **[VERIFIED]** |
| stale-state risk | None for the gate (reads the table per publish); zero-primary and object-deletion exposure is inherent to today's association, not added by A. **[VERIFIED]** | Real — projection is a cache with no reconciliation API; new association writers (Phase 4) must remember to maintain it; product PATCH can overwrite it. **[INFERRED]** |
| transaction complexity | Trivial — one SELECT on the request session, no writes. **[VERIFIED]** | Trivial — extra column writes in register's existing transaction; but adds history/audit questions. **[INFERRED]** |
| migration required | No. **[VERIFIED]** | No. **[VERIFIED]** |
| impact on existing consumers | Gate + its two call sites only; all reads/projections untouched. **[VERIFIED]** | Every register now mutates product rows: product history, any product-row purity assertions, and observers of PATCH-only product writes. **[VERIFIED test impact]** |
| publish correctness | Correct for registered products immediately; legacy products still pass via the retained branch. **[VERIFIED]** | Correct only while register is the sole association writer and the projection semantics chosen cover every edge (primary swap, demotion, zero-primary). **[INFERRED]** |
| storefront correctness | Unchanged (already registered-first). **[VERIFIED]** | Unchanged on reads (read rule prefers registered anyway) — the projection only matters to the gate. **[VERIFIED]** |
| backward compatibility | Full — legacy-only and registered-only products both publish; wire contract unchanged. **[VERIFIED]** | Full for publishing, but register's response contract gains an undocumented side effect on the product row. **[INFERRED]** |
| test complexity | One lock test flips (by design) + new acceptance tests; everything else green. **[VERIFIED]** | One lock test flips + one Phase 7 contract lock **inverts** + new projection-semantics tests for unspecified behaviour. **[VERIFIED]** |
| future maintainability | Single rule: gate = association ∪ legacy fallback; Phase 4 (media status, unregister) changes nothing about the gate's shape. **[INFERRED]** | A second writer invariant to preserve forever; the columns must be removed from the write contract (stage 2) to shrink the risk — B makes stage 2 *harder to reason about*, not easier. **[INFERRED]** |
| plan §22.3 integration flow executable as written? | **Yes.** Register → publish 200, no PATCH. **[VERIFIED]** | **No** — the flow contains no projection step; B's projection is invisible in the flow but required by it, which is the same implicit-coupling defect that caused PF3-N09. **[INFERRED]** |

**Every verdict above rests on repository evidence (code read this session, probe executions,
the existing suites), not generic architectural preference.**

---

## 14. Legacy-data findings

**[NOT VERIFIABLE]** There is **no PostgreSQL server, no `psql` client, no SQLite dev
database, and no catalogue dump** anywhere in this workspace (re-checked this session).
`test_media_schema_integrity.py` skips by design when `DATABASE_URL` is absent. Therefore
whether live products rely on `product.image`, `product.primary_media_id` or
`product.media_ids` **cannot be determined here**, and no SQLite result is offered as
PostgreSQL proof.

**[INFERRED]** Static evidence that legacy-authored rows exist or are expected:

* the dual-read fallback exists specifically to serve *"catalogue data that predates"
  Phase 7* (`product_media_records.py` module docstring, `_registered_media_view`
  docstring);
* the gate's authored branch and contract §10.3's "cover enforced once at publish" are
  the pre-Phase-7 publishing rule;
* plan §11.4 item 3's *"retire the authored branch once every live product has
  registered media"* presupposes live products without registered media;
* the resolver's `LEGACY_FALLBACK` policy keeps `/images/...` references serving from
  `public/` during migration.

Consequence for both options: the **legacy gate branch must not be retired now**. Both A
and B keep it; retirement needs the step-0-style read-only report over real data, which
remains a later deliverable. **[INFERRED]**

---

## 15. Required contract changes

**[VERIFIED — planned, not performed; this checkpoint changes nothing]**

1. **API_CONTRACT §12.4** — rewrite to describe the resolved gate: an authored `image`,
   a legacy `primaryMediaId`, **or** a registered `is_primary=true` association satisfies
   the cover requirement; the legacy branch is retained during the transition.
2. **Wire contract** — **no change** in the gate-resolution step: no new endpoints, no
   new fields, no new error code, `docs/openapi.json` stays path- and property-identical
   (a 0-delta regeneration check is part of the implementation block).
3. **R5 stage 1 (frontend, after the gate lands)** — stop sending
   `mediaIds`/`primaryMediaId`/`galleryMediaIds` from `buildAdminProductPayload` and stop
   the projection PATCH in `syncProductMediaFromServer`/`buildProductMediaPatch`; update
   the two pinned frontend lock tests.
4. **R5 stage 2 (server, later still)** — remove the three keys from
   `ProductContentFields` so writing them is a 422 — only after the caller census R5
   mandates.

---

## 16. Required tests

The 14-item matrix from the task, with dispositions under the recommended Option A.
Semantics taken from the plan: §22.3 flow, §11.4 items 1–3, the canonical error string,
`is_primary=true` as the primary signal.

| # | Requirement | Where it lands under Option A | Status today |
|---|---|---|---|
| 1 | no media → publish rejected | `test_phase3_product_lifecycle.py:501-520` (cover-image case) — unchanged | exists, green |
| 2 | registered **non-primary** media → publish rejected | new — extend `PublishGateMediaSourceTests` (probe scenario 2 proves today's gate rejects; A must keep rejecting because `is_primary=false`) | **new** |
| 3 | registered primary cover → publish accepted | rewrite of the flipping blocker lock (`test_phase3_product_media.py:768-790`) — register `role=COVER, is_primary=true`, no PATCH, expect no cover issue and publish 200 | **rewrite** |
| 4 | multiple media, exactly one primary → accepted | extend `test_phase7_media_lifecycle.py` full-flow: 2 assets, 1 primary, no legacy PATCH | partially exists (PATCH-assisted), **extend** |
| 5 | media association missing | new — asset registered without `product_id` (or mapping removed at DB level in the test) → gate rejects | **new** |
| 6 | asset missing | **Not implementable as a gate rule today**: no API deletes asset rows, object deletion leaves the association (probe scenario 5). Documented as deferred to the Phase 4 media-lifecycle design; the gate accepts what the association table says, exactly like the storefront read model does. | deferred, documented |
| 7 | asset inactive/deleted, if applicable | N/A today — no `media.status` transitions exist (API-125/140 deferred). Test cannot be written against real behaviour. | N/A, documented |
| 8 | legacy `product.image` populated → accepted | `PublishGateMediaSourceTests::test_the_legacy_columns_do_satisfy_the_publish_gate` — unchanged | exists, green |
| 9 | legacy `product.primary_media_id` populated → accepted | same test (it patches `primaryMediaId`) — unchanged | exists, green |
| 10 | legacy fields empty + authoritative association valid → accepted | the rewrite of item 3 **is** this test | **new (via rewrite)** |
| 11 | frontend does not need to write legacy media fields | frontend: rewrite the pinned locks (`phase3ProductMediaHonesty.test.js:165-212`) to assert the keys are **absent** from the admin payload and the sync no longer PATCHes them; backend: probe-style assertion register→publish with zero PATCHes | **rewrite + new** |
| 12 | publish result survives a fresh product read | new — publish, then fresh-session `GET /admin/products/{id}` + `GET /products/{id}`: status/published/media agree (extends Phase 7 lifecycle test which already refetches) | **new/extend** |
| 13 | storefront resolves the same primary media | exists — `test_phase7_media_lifecycle.py:860-930` asserts storefront `image` equals the registered URL; extend the no-PATCH variant | exists, extend |
| 14 | cache does not bypass the authoritative association | formalise probe scenario 4: publish → prime storefront read → register new primary → fresh read shows it; plus assert `invalidate_product_cache` is called by register | exists implicitly, **formalise** |

---

## 17. Migration assessment

**[VERIFIED]** Neither option needs a migration: both are service-layer changes over
existing tables; no constraint, column or index changes; §25(21) is satisfiable either
way. **[NOT VERIFIABLE]** PostgreSQL-specific behaviour (JSONB semantics, FK/cascade
behaviour, constraint timing) cannot be executed here — no PostgreSQL server exists. The
PostgreSQL-backed suites (`test_media_schema_integrity.py`) skip by design in this
environment; the implementation block must re-run them where PostgreSQL exists.

---

## 18. Risk analysis

| Risk | Option A | Option B |
|---|---|---|
| Publish gate change contradicts step 9's literal *"unchanged"* | The literal is already unsatisfiable (Block 7 proof); §22.3 + §11.4 item 3 show the intent. Mitigation: keep the legacy branch, change nothing else. | n/a (gate literally unchanged) — but the plan's *architecture* (single source of truth) is violated instead. |
| Zero-primary state | Gate requires ≥1 `is_primary=true`; demotion to zero re-blocks publish — arguably the correct business answer (a cover must exist). | Projection semantics must decide (frontend precedent: fall back to first item, which would let a zero-primary product publish — contradicting required test 2). |
| Object deleted after publish | Association persists; gate stays green; storefront serves a 404 — identical exposure under both options; deferred to Phase 4 media lifecycle. | same |
| Future association writers (Phase 4) | Gate keeps working; nothing to sync. | Every future writer must also maintain the projection — a permanent invariant. |
| Pre-Phase-7 database (media tables absent) | Reusing the SAVEPOINT wrapper keeps publish working via the legacy branch. | Registration wouldn't run there either; projection adds nothing for those DBs. |
| PF3-N09 window (product contract still accepts media keys) | Open until R5 stage 2, but the gate no longer *depends* on the fiction: registered truth governs published products. | Window stays open **and** B writes the columns too — three writers of the same values. |
| Test churn | 1 flip (by design) + additions. | 2 flips (one inverting a Phase 7 contract lock) + unspecified-semantics tests. |

---

## 19. Recommended implementation

**Option A**, in exactly this shape — **for the next block, pending this decision's
approval** (nothing implemented now):

1. **Gate:** in `ProductService`, fetch the registered list for the product
   (`await self._registered_media_items(p.id)`, existing SAVEPOINT wrapper) in
   `publish_product` and `get_publish_issues`; extend the module-level
   `get_publish_issues(product, registered_media=None)` media branch to
   `has_authored_image OR has_primary_media OR any(is_primary)`. The
   `REVIEW_FLAG_BLOCKING` read stays in the same function (structural test).
2. **Tests:** rewrite the flipping blocker lock into matrix item 3/10; add items 2, 4,
   5, 12, 14; leave every other suite untouched.
3. **Contract docs:** rewrite API_CONTRACT §12.4; regenerate `docs/openapi.json` and
   assert 0 delta (wire contract unchanged).
4. **Then**, in the same block or the immediately following one per R5: stage 1 —
   remove the media-write keys from `buildAdminProductPayload`, delete the projection
   PATCH from `syncProductMediaFromServer`/`buildProductMediaPatch` (the editor and
   media manager already re-read the server product), rewrite the two pinned frontend
   locks, re-run both suites. Stage 2 remains gated on the R5 caller census.
5. **Block 8 is not started by this.** The gate resolution is a small, separately
   reviewable change that unblocks the rest of step 9.

**Why not Option B:** it manufactures a second writable copy of the authoritative data,
contradicts §11.4 items 1–2, requires inventing projection semantics the plan never
defines (primary fallback, demotion, authored-plate conflicts), inverts a Phase 7
regression lock, and still cannot execute the plan's own §22.3 flow any more faithfully
than A does. **[INFERRED — see §11-13 evidence]**

---

## 20. What must NOT be changed

**[VERIFIED — enforced by this checkpoint]**

* **Do not remove the legacy gate branch during the transition** (§11.4 item 3, §14).
* **Do not remove the media-write keys from `ProductContentFields` yet** (R5 stage 2 needs
  the caller census). Stage 1 frontend removal happens **after** the gate lands.
* **Do not create a migration, constraint, or enum** — no Alembic revision (§25(21)); no
  `role`/`status` response enums (the R6 hazard stands).
* **Do not touch the media registration contract** — the association writer, demotion
  semantics and idempotency are Phase 7's, unchanged.
* **Do not change the canonical error envelope or the cover-error string.**
* **Do not touch the storefront read model** — it already resolves correctly.
* **Do not touch PF3-N07** (fail-open taxonomy) — the §26 hard stop stands.
* **Do not touch protected suites** (`test_phase7_media_lifecycle.py`,
  `test_phase6_media_db.py`, `test_phase3_product_lifecycle.py`,
  `test_phase3_product_media.py` beyond the deliberate flip) without explicit
  authorisation — only the tests named in §16 change, and only deliberately.
* **Do not commit or push** from this checkpoint. Nothing in this report was implemented.

---

## 21. Exact next implementation block

**"Publish-gate media source resolution" (the step-9 unblock, not Block 8):**

| # | Change | Files | Tests |
|---|---|---|---|
| 1 | Gate accepts registered primary (legacy branch kept) | `app/services/catalog/product_service.py` only | §16 items 2, 3/10, 4, 5, 12, 14 |
| 2 | Contract documentation | `API_CONTRACT.md` §12.4 | `test_api_contract.py` media assertions where they pin §12.4's text |
| 3 | OpenAPI regeneration check | `docs/openapi.json` (regenerated, 0 delta) | existing spec-diff check |
| 4 | R5 stage 1 — frontend stops sending the three keys; projection PATCH removed | `frontend/src/services/api/productsApi.js`, `frontend/src/services/media/productMediaService.js`, consumers re-checked | rewrite pinned locks, `phase7ProductMedia.test.js` sync tests; §16 item 11 |
| 5 | Full regression | — | backend ≥ 593-passing baseline (Block 7 exit state; focused media + lifecycle suites re-verified this session), frontend ≥ 356; 0 failures; no migration; §25(19-23) re-asserted |

Steps 4-5 may be the same block or the next, at the reviewer's discretion; R5 stage 2 and
the caller census stay outside it.

---

## 22. Open questions

1. **Zero-primary re-blocking.** Should demoting the only primary re-block publish?
   Recommendation: yes (a cover must exist; required test 2 presupposes it). **[INFERRED]**
2. **Object-deletion exposure.** Should the gate (or storefront) verify object existence?
   Recommendation: defer to the Phase 4 media-lifecycle design (status vocabulary,
   API-125/140); neither option can answer it today without a status model. **[VERIFIED absence]**
3. **Role-case divergence** (`COVER` vs `gallery` both stored) — plan-owner ruling still
   pending from Block 7 §28; unrelated to the gate once the gate keys on `is_primary`.
4. **`PRIMARY_ROLE` dead constant** — cosmetic cleanup, Phase 4.
5. **R5 caller census** — requires a deployed observation window; stage 2 cannot be sized
   without it. **[NOT VERIFIABLE]**
6. **Authored-plate + registered coexistence** — the read rule prefers registered; whether
   the editor should warn when an authored plate is shadowed by registered media is a UX
   question for the stage-1 frontend work, not the gate.

---

## 23. Final decision

**OPTION A — approved as the resolution, pending reviewer confirmation.**

The publish gate's media branch becomes: *authored `image`, or legacy `primary_media_id`,
or a registered `is_primary=true` association for the product* — the legacy branch
retained during the transition, exactly the dual acceptance §11.4 item 3 describes and
the §22.3 integration flow requires. The authoritative value stays in exactly one place
(`media_product_media`); the gate becomes a reader of it; registration remains the only
writer; no migration, no wire-contract change, no storefront change. Step 9's remaining
deliverables (frontend stops writing the keys, then their removal from
`ProductContentFields`) then proceed in their planned two-stage order.

**This checkpoint implemented nothing, modified nothing, committed nothing, and pushed
nothing.** Block 8 is not started. Awaiting review and approval of this decision.

---

### Verification record for this checkpoint

| Evidence | Result |
|---|---|
| Live probe, real app stack (routers + ORM + storage), disposable DB — 48 checks across 6 scenarios (blocker, non-primary, projection unblock, cache invalidation, object deletion, demotion/staleness) | **48/48 passed** |
| `pytest tests/unit/test_phase3_product_media.py` | **38 passed** |
| `pytest tests/unit/test_phase7_media_lifecycle.py tests/unit/test_phase6_media_db.py` | **41 passed** (the known Block 7 §24 Phase 6 ordering flake reproduced once in a 3-file subset and passed on the pair re-run — pre-existing, unchanged) |
| `pytest tests/unit/test_phase3_product_lifecycle.py` | **52 passed, 363 subtests** |
| Frontend `npm test` | **356 tests / 355 pass / 0 fail / 1 skip** — identical to the Block 7 exit state |
| PostgreSQL availability | **absent** — all PostgreSQL-specific claims marked NOT VERIFIABLE |
| Repo state | working tree clean except this document; nothing committed or pushed |
