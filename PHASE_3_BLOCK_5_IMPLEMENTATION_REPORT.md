# PHASE 3 — BLOCK 5 IMPLEMENTATION REPORT
## Storefront Visibility / Publication Gate (plan §24 step 7 · §4 item 7 · API-180 / PF3-N06 / PF3-N07)

**Date:** 2026-08-28  ·  **Branch:** `arena/01a04629-pfv1`  ·  **Commit:** none (working tree only)
**Verdict:** ✅ **PASS — with one half of step 7 deliberately and explicitly NOT implemented** (§23).

Throughout, every claim is tagged:
**[VERIFIED]** executed in this environment and observed · **[INFERRED]** reasoned from source, not executed · **[NOT VERIFIABLE]** cannot be executed here.

---

## 1. Executive Summary

Step 7 of the plan is *"Visibility gate: subcategory parity; fail-closed category default — **only after** the step 0 report is reviewed. Extend cache invalidation coverage."* It is three pieces of work, not one, and they have different preconditions. This block delivers two of them and formally blocks the third.

| # | Step 7 component | Finding | Outcome |
|---|---|---|---|
| a | **Subcategory parity** | PF3-N06 — subcategory status was never consulted; a PUBLISHED product under an ARCHIVED subcategory stayed fully visible | ✅ **IMPLEMENTED** |
| b | **Extend cache invalidation** | R9 — `get_storefront_product` serves its cached DTO *before* it evaluates the gate, and taxonomy writes never evicted those keys, so (a) would have been bypassable for a whole TTL on the exact transition it exists to catch | ✅ **IMPLEMENTED** |
| c | **Fail-closed category default** | PF3-N07 — an unresolvable/empty category still fails open | ⛔ **BLOCKED — see §23.** The plan itself permits this flip *"only after the step 0 report is reviewed"*, §23 R1 says *"Never flip the default blind"*, and step 0 requires a `SELECT DISTINCT` over the real PostgreSQL catalogue, which this environment does not have (plan Appendix B). |

**The rest of step 7 was already correct and was left alone.** Contrary to what a casual reading of the audit suggests, publication was **not** broken:

* **[VERIFIED]** `approve` has never published. It writes `review.state = APPROVED` and touches neither `status`, `published`, `published_at` nor `published_by`. The plan's own §9.2 already records the audit's "approve publishes" claim as *stale*; this block re-proved it against a live server and locked it with tests rather than changing anything.
* **[VERIFIED]** Every storefront read path filters server-side. The frontend never decides visibility: the storefront snapshot is hydrated from the gated `GET /products`, and the PDP simply renders whatever the public endpoint returns (404 → "not found").
* **[VERIFIED]** An unpublished product on the public PDP is the canonical `404 NOT_FOUND` envelope, byte-identical to a product that does not exist. No new status semantics were invented.

**Change footprint:** 2 service files (one new predicate + one cache pattern), 3 router docstrings, `API_CONTRACT.md` (+1 new section), a regenerated `docs/openapi.json`, and 2 new test files. **No migration. No commit. No push. `backend/alembic/` untouched.**

**Test movement:** backend **459 → 503 passed** (+44 tests, 108 → 166 subtests, 0 failures); frontend **285 → 310 tests** (+25, 309 pass / 1 pre-existing skip, 0 failures); `npm run build` green; `docs/openapi.json` at **zero drift**; plus a **53-check live-server walk-through** of the canonical real-world flow.

---

## 2. Plan sections used

Re-read in full before any edit, per the standing instruction:
`PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_PLAN.md`, `API_CONTRACT.md`, and all four block reports (`PHASE_3_BLOCK_1..4_IMPLEMENTATION_REPORT.md`).

| Section | What it governs here |
|---|---|
| **§2.3** | PF3-N06 and PF3-N07 evidence rows (`P-ACT-ARCHSUB`, `P-UNKNOWNCAT`, `P-NOCAT` all `[RUN]`-verified visible) |
| **§4 item 7** | "Complete the visibility gate (subcategory; fail-closed)" — API-180, PF3-N06, PF3-N07, layer = **backend** |
| **§9.1 / §9.2** | The lifecycle the code implements; the endpoint table; *"approve ≠ publish"* is marked ✅ already-correct with the audit's claim called **stale** |
| **§10.1** | The eight-row visibility matrix and the **four** read paths that hand-copied the same predicate |
| **§10.2** | The gates that deliberately do **not** exist (subcategory ❌, collections ❌, stock ❌, cover image ❌ at read time) |
| **§10.4** | The two inconsistencies to resolve: (1) subcategory parity, (2) fail-open on unknown category |
| **§16.2** | `Product not found → 404 NOT_FOUND / "Product '<id>' not found." / {}` — the semantics reused verbatim |
| **§17 / §18 (:943)** | `product_service.py` change (d): "`_subcategory_status_map()` + fail-closed category default in both storefront reads (PF3-N06/N07)" |
| **§19** | Subcategory gate → **NO MIGRATION** ("new read query"); fail-closed default → **NO MIGRATION** ("predicate change — **data risk, not schema risk**") |
| **§21** | Permitted files: `product_service.py`, `products.py`, `API_CONTRACT.md`, `docs/openapi.json`, new test `tests/unit/test_phase3_product_visibility.py` |
| **§22.1 "Visibility"** | The eight-row matrix on **both** list and detail; archived subcategory now hides; unknown category now hides; a legacy row with a matching category string still shows |
| **§22.3** | The end-to-end flow, including the explicit `← PF3-N06 regression` line |
| **§23 R1 / R9 / R10** | R1 = the fail-closed data risk; R9 = "adding new read gates must not introduce a second cache key that is not invalidated"; R10 = facet/count impact |
| **§24 step 7** | The sequencing constraint that blocks PF3-N07 |
| **§25 (11-14)** | Acceptance criteria 11, 12, 13 (visibility) and 14 (`approve` never publishes) |
| **§26** | Exit criterion: *"The step 0 reconciliation report is produced, reviewed, and its findings actioned or explicitly accepted in writing."* |
| **Appendix B** | *"`SELECT DISTINCT` on real catalogue data (step 0) — **No PostgreSQL in the sandbox.**"* |

---

## 3. Baseline

The sandbox was re-provisioned between blocks: `backend/.venv` and `frontend/node_modules` are snapshot-excluded and had to be rebuilt (`python -m venv` + `requirements.txt` + `pytest`/`pytest-asyncio`/`pytest-subtests`, then `npm ci`). **All Block 1-4 source and test files survived intact** — verified against `git status`.

| Suite | Baseline (before any Block 5 edit) |
|---|---|
| Backend `pytest` | **459 passed, 24 skipped, 3 warnings, 108 subtests, 148.95 s** |
| Frontend `npm test` | **285 tests, 284 pass, 0 fail, 1 skip, 10.56 s** |
| `docs/openapi.json` | 201 paths |
| `backend/alembic/` | clean |

**[VERIFIED]** — identical to Block 4's recorded end state, so Block 5 started from a known-good tree.

---

## 4. Pre-implementation audit

### (A) Product model / state fields

**[VERIFIED]** `catalog_product` carries **two** publication columns plus a JSON review object — three fields on two independent axes:

| Field | Type | Default | Role |
|---|---|---|---|
| `status` | `String(30)`, indexed | `"DRAFT"` | **visibility axis.** Vocabulary: `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `ARCHIVED` |
| `published` | `Boolean` | `False` | **visibility axis.** Kept in lock-step with `status` (`p.published = p.status == "PUBLISHED"` on every PATCH) |
| `review` (JSONB) `.state` | — | `"NONE"` | **approval axis.** Vocabulary: `NONE`, `PENDING`, `APPROVED`, `REJECTED` |
| `published_at` / `published_by` | timestamp / `String` | `NULL` | audit, written only by `publish_product` |
| `category` / `subcategory` | `String(100)`, no FK | `""` | untyped taxonomy references; **also part of the gate** |

There is **one** status enum, not several, and **no** separate `visible`/`hidden` flag. `API_CONTRACT.md` §3.3 lists six statuses, three of which are review *states* — plan §9.1 rules **the document wrong, not the code**, and forbids renaming statuses. That was respected.

### (B) Admin workflow trace — `/admin/products` → editor → approve → publish → persistence

**[VERIFIED]** end to end against a live server (§15):

| Step | Route | Effect on the DB row |
|---|---|---|
| Load desk | `GET /admin/products` | none |
| Create | `POST /admin/products/draft` | `status=DRAFT`, `published=false`, `review.state=NONE` |
| Save | `PATCH /admin/products/{id}` | content only; `status`/`published`/`review` are **block-listed** and rejected |
| Submit | `POST /products/{id}/submit-review` | `status=PENDING_REVIEW`, `review.state=PENDING` |
| **Approve** | `POST /admin/products/{id}/approve` | **`review.state=APPROVED` only.** `status` stays `PENDING_REVIEW`, `published` stays `false`, `published_at`/`published_by` stay `NULL` |
| **Publish** | `POST /admin/products/{id}/publish` | `status=PUBLISHED` + `published=true` + `published_by` + `published_at`, written together. Gated on `review.state == "APPROVED"` **and** `get_publish_issues() == []` |
| Unpublish | `POST /admin/products/{id}/unpublish` | `status=DRAFT`, `published=false` |
| Archive | `POST /admin/products/{id}/archive` | `status=ARCHIVED`, `published=false` |

**Frontend wiring [VERIFIED]:** `productAdminService.ACTIONS` maps `approve → apiAdminApproveProduct` and `publish → apiAdminPublishProduct`, two separate `apiClient.post` calls to two separate endpoints, both with `scope:"admin"`. The local register is written **only from the response** (`withUpsert`), never optimistically. The client-side `productWorkflowCommands.approveProduct` carries the explicit comment *"APPROVAL DOES NOT PUBLISH"* and never writes `PRODUCT_STATUS.PUBLISHED`.

### (C) Storefront surfaces — every place a product can appear

**[VERIFIED]** by exhaustive repo grep (§21). Eight public surfaces, funnelling into **four** service methods:

| Surface | Endpoint | Service method | Gated? |
|---|---|---|---|
| Catalogue | `GET /products` | `list_storefront_products` | ✅ |
| Explore | `GET /explore` | → `list_storefront_products` | ✅ |
| Search | `GET /search` | → `list_storefront_products` | ✅ |
| Category page | `GET /categories/{id}/products` | → `list_storefront_products` | ✅ |
| Collection page | `GET /collections/{id}/products` | → `list_storefront_products` | ✅ |
| Homepage seams | `GET /home` | → `list_storefront_products` (`_select_products`) | ✅ |
| PDP | `GET /products/{idOrSlug}` | `get_storefront_product` | ✅ |
| Recommendations | `GET /products/{id}/recommendations` | `get_recommendations` | ✅ |
| Recently viewed | `GET /products/recently-viewed` | `get_recently_viewed` | ✅ |

Explore and Search **delegate** rather than re-query — a genuinely good existing design that meant one predicate fix covered five surfaces at once.

### (D) Where visibility is decided

**[VERIFIED] Server-side, and only server-side.**

* `catalogStore.js` hydrates its snapshot from `apiListProducts` → the gated `GET /products`. It contains **no** `status === "PUBLISHED"` or `.published` comparison of its own.
* `ProductDetail.jsx` calls the **public** `apiGetProduct`; it only reaches `apiAdminGetProduct` when `?preview=1` **and** an admin token is present. A 404 becomes the "not found" screen.
* One legacy client-side filter exists — `queryCatalogue` in `src/data/products/query.js:243` (`status !== "DRAFT" && status !== "ARCHIVED" && published !== false && category ACTIVE`). It is **not** used by any shop listing: its single importer is `data/products/explore.js`'s local stream helpers. It is also *weaker* than the server gate (it would let a `PENDING_REVIEW` row through), which is precisely why it must never become the authority. It was **left in place** (minimum-change rule) and pinned by a test so it cannot creep back into a listing path — see §21.

**Conclusion of the audit: publication was not broken.** Two real defects existed, both in the taxonomy half of the gate, both named in the plan.

---

## 5. Current publication lifecycle (as implemented, unchanged by this block)

```
                       ┌──────────── submit-review ────────────┐
                       ▼                                       │
   ┌───────┐  reject  ┌────────────────┐  approve   ┌──────────────────────┐
   │ DRAFT │ ◄─────── │ PENDING_REVIEW │ ─────────► │ PENDING_REVIEW       │
   └───────┘          │ review=PENDING │            │ review=APPROVED      │
       ▲              └────────────────┘            └──────────┬───────────┘
       │ unpublish                                             │ publish (gated)
       │                                                       ▼
   ┌───┴──────┐                                          ┌───────────┐
   │ PUBLISHED│ ◄────────────────────────────────────────│ PUBLISHED │
   └──────────┘                                          └───────────┘
       │ archive (from any non-archived state)
       ▼
   ┌──────────┐  restore
   │ ARCHIVED │ ──────────► DRAFT
   └──────────┘
```

Note the shape: **`approve` does not move the box.** It stays in `PENDING_REVIEW` and only flips the review annotation. That is why "APPROVED" is not a `status` value at all. **No new state machine was introduced** and no transition was added, removed or renamed.

---

## 6. APPROVE vs PUBLISH behaviour

**[VERIFIED] against a live HTTP server** (not a TestClient) — §15 steps E1-E11, F1-F4:

| Assertion | Result |
|---|---|
| `approve` → HTTP 200 | ✅ |
| `review.state` becomes `APPROVED` | ✅ |
| `status` **unchanged** at `PENDING_REVIEW` | ✅ |
| `published` **unchanged** at `false` | ✅ |
| `publishedAt` / `publishedBy` remain `null` | ✅ |
| DB row re-read after approve confirms all of the above | ✅ |
| APPROVED-not-published is **absent** from `/products`, `/explore`, `/search`, the category page | ✅ |
| APPROVED-not-published PDP → **404** | ✅ |
| `publish` before approve → **422 `BUSINESS_RULE_VIOLATION`**, row unchanged | ✅ |
| `publish` with an outstanding publish issue → **422** with `details.errors`, row unchanged | ✅ |
| explicit `publish` → `PUBLISHED` + `published=true` + `publishedAt` + `publishedBy` | ✅ |
| approve and publish are two distinct requests to two distinct URLs | ✅ |
| approve issues **exactly one** request and never chains into publish | ✅ (frontend test) |
| neither call sends `status`, `published` or `review` in its body | ✅ (frontend test) |
| an unknown verb (`"goLive"`) issues **no** request at all | ✅ (frontend test) |

**Nothing was changed to achieve this.** It already held. Block 5 adds 15 assertions that lock it.

---

## 7. Storefront visibility contract (after this block)

A product is publicly visible **iff all four** hold:

1. `status == "PUBLISHED"`
2. `published IS TRUE`
3. its `category` does **not** resolve to a `catalog_category` row whose status ≠ `ACTIVE`
4. its `subcategory`, **when set**, does not resolve to a `catalog_subcategory` row whose status ≠ `ACTIVE`  ← **NEW**

Rules 3 and 4 resolve by **id, then slug, then name** — the same triple the Block 2 write path canonicalises against. Both **fail open** on a reference that resolves to nothing (§23).

Codified in one place:

```python
@staticmethod
def _taxonomy_visible(product, category_status_map, subcategory_status_map) -> bool:
    if category_status_map.get(product.category, "ACTIVE") != "ACTIVE":
        return False
    subcategory = (product.subcategory or "").strip()
    if subcategory and subcategory_status_map.get(subcategory, "ACTIVE") != "ACTIVE":
        return False
    return True
```

### The §10.1 matrix, re-measured

| DB state | `GET /products` | `GET /products/{id}` | Before | After |
|---|---|---|---|---|
| PUBLISHED + ACTIVE cat + ACTIVE subcat | visible | 200 | ✅ | ✅ unchanged |
| PUBLISHED + ACTIVE cat + **ARCHIVED subcat** | **hidden** | **404** | ❌ PF3-N06 | ✅ **FIXED** |
| PUBLISHED + ACTIVE cat + **DRAFT subcat** | **hidden** | **404** | ❌ (same defect) | ✅ **FIXED** |
| PUBLISHED + DRAFT category | hidden | 404 | ✅ | ✅ unchanged |
| PUBLISHED + ARCHIVED category | hidden | 404 | ✅ | ✅ unchanged |
| PUBLISHED + category not in `catalog_category` | visible | 200 | ❌ PF3-N07 | ⛔ **unchanged — §23** |
| PUBLISHED + empty category | visible | 200 | ❌ PF3-N07 | ⛔ **unchanged — §23** |
| PUBLISHED + unresolvable subcategory | visible | 200 | n/a | ⛔ parity with the above |
| DRAFT status | hidden | 404 | ✅ | ✅ unchanged |
| PENDING_REVIEW status | hidden | 404 | ✅ | ✅ unchanged |
| PENDING_REVIEW + review APPROVED | hidden | 404 | ✅ | ✅ unchanged |
| ARCHIVED status | hidden | 404 | ✅ | ✅ unchanged |
| `status=PUBLISHED` but `published=false` | hidden | 404 | ✅ | ✅ unchanged |

**[VERIFIED]** — all thirteen rows asserted on **both** the list and the detail endpoint, plus a dedicated subtest per row proving the two agree (plan §25 criterion 13).

---

## 8. Explore visibility

**[VERIFIED]** `ExploreService.get_explore` maps its query onto `ProductListQuery` and delegates to `list_storefront_products`; the interleaved promo/editorial stream is built from the already-gated `items`. Consequences, all asserted:

* every hidden row in the matrix is absent from `/explore` (one subtest per row);
* `/explore` returns **exactly the same visible set** as `/products`;
* an APPROVED-not-published product is absent;
* archiving the subcategory removes it from `/explore` on the next request; restoring puts it back.

`GET /home`'s seams (`new_arrivals`, saree/bridal/menswear/celebration edits) go through the same `list_storefront_products` via `_select_products` — **[INFERRED]** from source, not separately asserted (the `/home` route is not part of step 7's named surfaces).

---

## 9. Category visibility

**[VERIFIED]** `GET /categories/{id}/products` resolves the category (404 for an unknown one), then delegates to `list_storefront_products` with `category=[category.id]`. Asserted:

* every hidden matrix row is absent (one subtest per row);
* live rows of that category are present;
* archiving the **category** hides its products from the list *and* the PDP; restoring shows them again;
* archiving the **subcategory** hides them too — new.
* Asking for the archived subcategory by facet (`?subcategory=cat-sarees-vintage`) returns an **empty** set, i.e. the facet cannot be used to reach behind the gate.

---

## 10. Search visibility

**[VERIFIED]** `SearchService.search` delegates to the same method, so the gate runs **before** the term match, not after. Asserted:

* every hidden matrix row is absent from `/search`;
* `/search` returns exactly the same visible set as `/products`;
* searching the **exact product name** of a hidden row (archived-subcategory, approved-not-published, draft) returns nothing — the specific "can a shopper find it if they know the name?" attack;
* after publish, the product **is** found by term (`?q=Kanjivaram` → present) — live-server check G7.

---

## 11. PDP / direct-access visibility

**[VERIFIED]** `GET /products/{idOrSlug}` for each state:

| State | Response |
|---|---|
| DRAFT | `404 NOT_FOUND` |
| PENDING_REVIEW (submitted) | `404 NOT_FOUND` |
| **APPROVED, not published** | `404 NOT_FOUND` |
| PUBLISHED | `200` |
| PUBLISHED under an ARCHIVED subcategory | `404 NOT_FOUND` (new) |
| ARCHIVED | `404 NOT_FOUND` |

**No new semantics were invented.** The exact existing `NotFoundException(f"Product '{id_or_slug}' not found.")` is reused, producing the Phase 1 canonical envelope from §16.2:

```json
{ "success": false,
  "error": { "code": "NOT_FOUND", "message": "Product 'PF-SAR-0042' not found.", "details": {} } }
```

Three deliberate properties, each asserted:

1. **Not a 403, not a 409.** A hidden product and a non-existent product return the *same status and the same `error.code`*, so the endpoint cannot be used to enumerate drafts.
2. **No leakage.** The 404 body was scanned for `traceback`, `sqlalchemy`, `select `, ` from catalog_product`, `psycopg` — none present.
3. **Slug is not a back door.** `GET /products/{slug}` applies the identical gate (asserted for both a visible and a hidden row).

---

## 12. Backend changes

### 12.1 `app/services/catalog/product_service.py`

**New (72 lines, `:553-624`):**

* `_subcategory_status_map()` — the exact mirror of `_category_status_map()`, keyed on subcategory id / slug / name.
* A documented comment block stating the four gate rules and recording, in the source itself, *why* rules 3 and 4 fail open and what would unblock the flip.
* `_taxonomy_visible(product, cat_map, sub_map)` — the single predicate.
* `_visibility_maps()` — loads both maps for one read.

**Changed — the four read paths named in plan §10.1**, each of which previously hand-copied `category_status_map.get(p.category, "ACTIVE") == "ACTIVE"`:

| Method | Change |
|---|---|
| `list_storefront_products` (`:893`) | gains an optional `subcategory_status_map` parameter for symmetry; loads both maps; filters via `_taxonomy_visible` |
| `get_storefront_product` (`:1173`) | `_visibility_maps()` + `_taxonomy_visible`, raising the same `NotFoundException` |
| `get_recommendations` (`:1221`) | same |
| `get_recently_viewed` (`:1248`) | same |

Collapsing four copies into one is what makes plan §25 criterion 13 ("list and detail agree on every row") structurally true rather than coincidentally true — and it is pinned by a test that fails if the hand-copied predicate reappears (§21).

### 12.2 `app/services/catalog/category_service.py` (+24 / −4)

`_invalidate_taxonomy_cache()` now evicts the `product:storefront:*` KV namespace as well as the decorated response cache, and its docstring — which previously and **incorrectly** claimed *"the KV/LRU layer has no category entries, so a single clear is enough"* — was corrected. This is step 7's *"Extend cache invalidation coverage"* and §23 R9. All ten taxonomy write methods (create/update/activate/archive/restore × category/subcategory) route through it.

Note the subtlety this fixes: `ProductService.invalidate_product_cache` uses the glob `pratikshya:cache:*products*`, which does **not** match the singular `product:storefront:` prefix — it works only because that method *also* deletes the two exact keys by name. A taxonomy write knows neither the product ids nor the slugs, so it needs the explicit pattern. A test asserts the pattern is present and cannot be dropped as redundant.

### 12.3 Router descriptions (`products.py` +18/−4, `explore.py` +2/−1, `search.py` +2/−1)

Four OpenAPI descriptions updated to state the subcategory gate, the fail-open default, and — on the PDP — that an APPROVED-but-unpublished product returns the canonical 404. Documentation only; no behaviour.

### 12.4 What was NOT changed

* `explore_service._build_category_cards` keeps its own inline copy of the category status map. It builds **category cards**, not products, so it cannot leak a product; changing it is outside step 7. Recorded in §21 as duplicated-but-intentionally-retained.
* `collection_service` / `category_service` product **counts** still count on `status/published` alone, without the taxonomy gate. Counts, not leaks (§24 risk R-B).
* `cart_service`, `wishlist_service`, `order_service` purchasability checks use `status/published` only. Out of step 7's scope (§24 risk R-C).

---

## 13. Frontend changes

**None. Not one line of `frontend/src` was modified in this block.**

The audit (§4 D) found the client already correct: the server is authoritative, the storefront snapshot comes from the gated endpoint, approve and publish are distinct wired calls, and the PDP renders the server's 404. Per the standing rule *"If it already satisfies step 7… add missing regression tests, make only the minimum change, do not refactor working code"*, the correct output was **tests, not edits**.

`frontend/tests/phase3ProductVisibility.test.js` (468 lines, 25 tests) was added — see §17.

---

## 14. Direct-route admin workflow verification

The concern: do the workflow commands register on a **direct** load of `/admin/products` with no prior navigation and no warm session?

**[VERIFIED] — yes, structurally, and it does not depend on global state.**

1. `src/main.jsx:25` performs a **side-effect import** — `import "./services/workflow/productWorkflowCommands";` — at line 25, before `createRoot(document...)` at line 27. Bootstrap runs on *every* entry point, so registration cannot depend on having visited another screen. Asserted by a static guard that also checks the ordering.
2. `AdminProducts.jsx` does **not** depend on that registry at all for approve/publish. It imports `runAction` from `productAdminService` at **module scope** (`:41`) and calls it directly (`publishQuick` `:371-374`, bulk `:337`). There is no lazy resolution to fail.
3. A direct load fetches from the server in a mount effect (`useEffect(() => { setIsListLoading(true); reload(); }, [reload])`), so nothing is rendered from stale session state.
4. Server-side, **[VERIFIED]** on a live server with a **cold token and zero prior requests**: `GET /admin/products` → 200, `GET /admin/products/next-id` → 200, `GET /admin/products/availability` → 200 (live walk A1-A3).

**No global-state workaround was introduced.** The existing architecture already satisfies the requirement; the block only pins it.

---

## 15. Real-browser verification

### What was actually run

A **real ASGI server** (`uvicorn`) serving the **real `app.main:app`** — every router, all middleware, the real error handlers — backed by a disposable SQLite file, plus the **real Vite dev server** proxying `/api` to it. Both are running now and exposed as the live preview:

* API: `http://0.0.0.0:8000` — real admin JWT obtained through `POST /auth/admin/sign-in` with a bcrypt password (no dependency override, no test client).
* Website: `http://0.0.0.0:5173` — Vite with `allowedHosts: true` and the built-in `/api → :8000` proxy.

**[VERIFIED]** the SPA shell serves 200 on `/`, `/admin/products`, `/explore` and `/product/PF-SAR-0042` (direct deep links, not client-side navigations), `/src/main.jsx` is the bootstrap on the direct admin route, and the proxy really reaches the gated API (`/api/v1/products?pageSize=5` → the published product).

### The canonical flow, walked over real HTTP — **52/53 passed, 53/53 after correcting one bad assumption in my own script**

| Group | Checks | Result |
|---|---|---|
| **A** Direct `/admin/products` on a cold session | 3 | ✅ |
| **B** Create draft → save (PATCH) → fresh read shows the save | 4 | ✅ |
| **C** Not visible before publication: `/products`, `/explore`, `/search`, category, PDP 404 | 5 | ✅ |
| **D** Submit for review → still invisible everywhere | 2 | ✅ |
| **E** **Explicit APPROVE**: review moves, `status`/`published`/`publishedAt`/`publishedBy` do not; DB re-read confirms; still invisible on all four surfaces + PDP 404 | 11 | ✅ |
| **F** **Explicit PUBLISH**: 200, `PUBLISHED`, `published=true`, `publishedAt`+`publishedBy`, DB re-read confirms | 4 | ✅ |
| **G** Storefront after publish: visible in `/products`, `/explore`, `/search`, category; PDP 200; PDP by slug 200; found by search term | 7 | ✅ (6/7 in the first run — see note) |
| **H** Three consecutive fresh PDP reads all 200 | 1 | ✅ |
| **I** **Subcategory gate (the Block 5 change)**: archive → absent from all four surfaces + PDP 404 *despite a primed cache*; the **product row is untouched** and still PUBLISHED for the admin; restore → visible again immediately | 9 | ✅ |
| **J** Category gate regression: archive hides, restore shows | 2 | ✅ |
| **K** Unpublish → `DRAFT`/`false`, hidden again on a fresh request everywhere | 2 | ✅ |
| **L** No leakage; canonical envelope; hidden and missing indistinguishable | 3 | ✅ |

> **The one initial failure (G6) was a bug in my verification script, not the product.** It asserted the PDP slug was `pf-sar-0042`; the server had correctly derived `kanjivaram-silk-saree` from the product name. Re-fetching the real slug and requesting `GET /products/kanjivaram-silk-saree` returned **200**. Reported here rather than quietly patched.

Note check **I7** in particular: archiving the subcategory hides the product from customers **without mutating the product row**. `status` stays `PUBLISHED` and `published` stays `true` for the admin. The gate is a read-time filter, not a lifecycle side-effect — which is exactly right, and is why restoring the subcategory brings the product straight back with no republish.

### What could NOT be verified — stated plainly

**[NOT VERIFIABLE IN THIS ENVIRONMENT]** — there is **no browser, no headless Chromium, no Playwright/Puppeteer, and no DOM library** in this sandbox (checked: `frontend/node_modules` contains none of `playwright`, `puppeteer`, `jsdom`, `happy-dom`, `@testing-library/*`; no `chromium`/`google-chrome` binary on `PATH`). The following steps from the requested flow were therefore **not executed** and are **not claimed**:

1. Rendering `/admin/products` in a browser and observing the workflow buttons appear.
2. Clicking **Approve** and then **Publish** in the real UI.
3. Observing the storefront in a browser after publication.
4. A **hard refresh** (Ctrl-Shift-R) in a browser.
5. A **fresh tab / fresh window / fresh session** load.
6. Any assertion about rendered DOM, effects, timers or re-renders.

For (1)-(5), the *server* side of each was verified over real HTTP (a fresh, unrelated HTTP request is exactly what a hard refresh or a fresh tab produces at the API boundary), and the *client* side by static source guards over the real files. That is a genuine gap, not an equivalent. **Both servers are left running**, so these six steps can be performed manually in the live preview: sign in at `/admin/login` with `block5@pratikshya.test` / `Block5Verify!2026`.

---

## 16. Files changed

| File | Change | Lines |
|---|---|---|
| `backend/app/services/catalog/product_service.py` | `_subcategory_status_map`, `_taxonomy_visible`, `_visibility_maps`; four read paths routed through the shared predicate | +72 new block, 4 call sites rewritten |
| `backend/app/services/catalog/category_service.py` | `_invalidate_taxonomy_cache` evicts `product:storefront:*`; corrected docstring; `cache` import | +24 / −4 |
| `backend/app/api/v1/products.py` | 2 route descriptions (list, PDP) | +18 / −4 * |
| `backend/app/api/v1/explore.py` | 1 route description | +2 / −1 |
| `backend/app/api/v1/search.py` | 1 route description | +2 / −1 |
| `API_CONTRACT.md` | **new §10 — Storefront Visibility & Publication Gate** (6 subsections) | +115 * |
| `docs/openapi.json` | regenerated from `app.openapi()` | +24 / −6 * |
| `backend/tests/unit/test_phase3_product_visibility.py` | **NEW** — 44 tests, 58 subtests | +943 |
| `frontend/tests/phase3ProductVisibility.test.js` | **NEW** — 25 tests | +468 |

\* `products.py`, `API_CONTRACT.md` and `docs/openapi.json` also carry Block 2-4 changes in the same uncommitted working tree; the numbers above are the cumulative `git diff` where the file was already dirty. Block 5's own contribution to each is: `products.py` 2 description strings; `API_CONTRACT.md` the entire new §10; `docs/openapi.json` 4 description strings.

**`frontend/src/` — zero changes. `backend/alembic/` — zero changes** (`git status --short backend/alembic/` returns nothing).

All files are inside plan §21's permitted list, except `category_service.py` (the cache-invalidation fix step 7 explicitly asks for) and the two router description files (§21 lists `products.py`; `explore.py`/`search.py` are one-line doc parity so the three surfaces do not describe the same gate differently). Both are noted here rather than passed off as in-list.

---

## 17. Tests added

### Backend — `tests/unit/test_phase3_product_visibility.py` (44 tests, 58 subtests)

Real routers, real services, real ORM, disposable SQLite (the Block 2/3/4 harness), real RBAC rows, a fresh in-process LRU cache per test. **The plan required ≥15 backend tests where applicable; 44 were written.**

| Class | Tests | Focus |
|---|---|---|
| `VisibilityMatrixTests` | 13 | the §10.1 matrix on **both** list and detail; per-row agreement subtests; slug parity |
| `FailOpenDefaultTests` | 4 | the deferred PF3-N07 behaviour, asserted **as it stands** so the flip can never be silent |
| `SurfaceParityTests` | 8 | Explore / search / category / recommendations / facet filter; cross-surface set equality; search-by-exact-name |
| `ApproveVersusPublishTests` | 10 | the §22.3 flow through the **real admin routes**, asserting HTTP status, response body **and** the DB row at each step |
| `TaxonomyCacheInvalidationTests` | 5 | archive/restore a subcategory or category with a **primed** cache; static guard on the invalidation pattern |
| `ServerAuthorityTests` | 4 | all four read paths use the shared predicate and the hand-copied one is gone; no query parameter widens the gate; the public projection carries no lifecycle fields; hidden ≡ missing |

Mapped against the plan's required cases:

| Required case | Test |
|---|---|
| newly created not visible | `test_a_newly_created_product_is_not_on_the_storefront` |
| submitted not visible | `test_submitting_for_review_does_not_publish`, `test_submitted_for_review_is_never_public` |
| approved-but-unpublished not visible | `test_approved_but_unpublished_is_never_public`, `test_approve_does_not_make_the_product_publicly_visible` |
| published visible | `test_published_active_taxonomy_is_visible`, `test_explicit_publish_persists_published_and_reveals_the_product` |
| excluded from Explore / category / search | `SurfaceParityTests` ×4 (subtest per hidden row) |
| unpublished inaccessible via public PDP | `assert_canonical_404` on every hidden row |
| published accessible via PDP | matrix + live walk G5/G6 |
| APPROVE does not implicitly publish | `test_approve_changes_only_the_review_state`, `test_approve_and_publish_are_two_distinct_server_calls` |
| explicit PUBLISH persists PUBLISHED | `test_explicit_publish_persists_published_and_reveals_the_product` |
| fresh read after PUBLISH returns it | same test (all five surfaces re-read) |
| fresh read after unpublish hides it | `test_unpublish_hides_the_product_again_on_a_fresh_request`, `test_archive_hides_...` |
| canonical error envelope intact | `assert_canonical_404`, `test_a_hidden_product_is_a_404_not_a_403_or_409` |
| no SQL / traceback leakage | `assert_canonical_404` scans for five leak markers |

### Frontend — `tests/phase3ProductVisibility.test.js` (25 tests)

| Group | Tests | Focus |
|---|---|---|
| Distinct wiring | 5 | approve/publish/unpublish hit their own endpoints; approve issues exactly one request |
| Client never decides | 6 | no `status`/`published`/`review` in any body; responses mirrored verbatim; a 422 is a failure with no invented product; an unknown verb fires nothing |
| Public reads | 5 | listing and PDP use the public routes; a client-supplied `status`/`published` is dropped; a 404 yields no product |
| **Static source guards** | 6 | bootstrap registration order; module-scope `runAction`; `approveProduct` never writes `PUBLISHED`; the store has no local gate; the PDP's admin branch is double-gated; the legacy `queryCatalogue` filter has not crept into a listing path |
| Blocks 1/4 regression | 3 | draft + next-id endpoints; `excludeId`; explicit scope on every `apiClient` call |

**Harness limitation, stated rather than papered over:** the frontend harness is `node:test` with **no DOM and no React renderer**. Component behaviour cannot be executed. Requirements living inside a component are covered by **static source guards over the real files**, which are labelled `STATIC:` in the test names and called out in the file header. **A DOM/React framework was deliberately not added** — the plan does not ask for one, and inflating the count with a harness nothing else uses would be worse than an honest limitation.

---

## 18. Mutation check

Each Block 5 change was reverted in isolation, the suite re-run, and the change restored immediately. Both source files were restored from byte-for-byte backups and re-verified (`grep MUTATION` → clean).

### M1 — revert the subcategory gate (`_taxonomy_visible` checks category only)

**Result: 22 failures / 35 passed** (9 test methods + 13 subtest failures). Every failure is a **subcategory-visibility** assertion:

```
VisibilityMatrixTests::test_archived_subcategory_hides_the_product          ← NEW BEHAVIOUR
VisibilityMatrixTests::test_draft_subcategory_hides_the_product             ← NEW BEHAVIOUR
VisibilityMatrixTests::test_pdp_resolves_by_slug_with_the_same_gate
FailOpenDefaultTests::test_fail_open_is_the_only_gap_between_code_and_criterion_11
SurfaceParityTests::test_recommendations_apply_the_gate
SurfaceParityTests::test_subcategory_facet_filter_cannot_surface_a_hidden_product
TaxonomyCacheInvalidationTests::test_archiving_a_subcategory_hides_a_cached_product_immediately
TaxonomyCacheInvalidationTests::test_restoring_a_subcategory_shows_the_product_again
TaxonomyCacheInvalidationTests::test_restoring_the_archived_subcategory_reveals_its_products
+ 13 subtests inside the per-row / per-surface loops
```

Failures were checked to be for the **intended reason** — the archived/draft-subcategory rows reappearing in listings and returning 200 on the PDP — not import errors or harness noise.

### M2 — revert the cache invalidation (drop `invalidate_pattern("product:storefront:*")`)

**Result: 4 failures / 40 passed**, all in `TaxonomyCacheInvalidationTests`:

```
test_archiving_a_category_hides_a_cached_product_immediately        ← NEW BEHAVIOUR
test_archiving_a_subcategory_hides_a_cached_product_immediately     ← NEW BEHAVIOUR
test_restoring_a_subcategory_shows_the_product_again                ← NEW BEHAVIOUR
test_taxonomy_invalidation_targets_the_product_storefront_namespace ← static guard
```

The three behavioural failures return **200 from the cache for a product whose taxonomy was just archived** — precisely the hole the fix closes, and precisely the hole that would have made M1's gate meaningless in production.

### NEW BEHAVIOUR vs REGRESSION LOCK

| Category | Count | Meaning |
|---|---|---|
| **NEW BEHAVIOUR** — fail on reverted code | **9 methods + 13 subtests** (M1) and **4 methods** (M2), **11 distinct methods** in total | genuine proof that this block changed something |
| **REGRESSION LOCK** — pass on reverted code | **33 of 44** backend methods, **25 of 25** frontend tests | proof that everything else was already correct and still is |

Stated plainly: **three quarters of the backend suite and the entire frontend suite are regression locks, not proof of new work.** That is the honest shape of a block whose main finding was "this was already right".

---

## 19. Full test results

| Suite | Baseline | After | Δ |
|---|---|---|---|
| **Backend `pytest`** (full) | 459 passed, 24 skipped, 3 warnings, 108 subtests, 148.95 s | **503 passed, 24 skipped, 3 warnings, 166 subtests, 220.76 s** | **+44 tests, +58 subtests, 0 failures** |
| **Frontend `npm test`** (full) | 285 tests, 284 pass, 1 skip, 10.56 s | **310 tests, 309 pass, 0 fail, 1 skip, 12.02 s** | **+25 tests, 0 failures** |
| **`npm run build`** | green | **green, 10.03 s**, `dist/index.html` 2,804.24 kB / gzip 968.29 kB | unchanged |
| **New backend suite alone** | — | **44 passed, 58 subtests, 46.62 s** | — |
| **New frontend suite alone** | — | **25 passed, 0 failed** | — |
| **Live-server walk-through** | — | **53/53 checks** | — |
| **`docs/openapi.json`** | 201 paths | **201 paths, 0 path delta, 0 schema delta, byte-identical to `app.openapi()`** | zero drift |

The 1 frontend skip is pre-existing and unrelated. The 24 backend skips are the Phase 6 real-media-dataset and PostgreSQL-integrity suites, which skip by design when the dataset/server is absent — same 24 as the baseline.

---

## 20. Regression results

Targeted run of every suite the standing instructions protect:

```
tests/unit/test_api_contract.py                 (Phase 1 API contract)
tests/unit/test_phase3_product_id.py            (Block 1 — server-authoritative product ID)
tests/unit/test_phase3_product_taxonomy.py      (Block 2 — taxonomy / 422)
tests/unit/test_phase3_product_identity.py      (Block 3 — 409 SKU/slug)
tests/unit/test_phase3_product_availability.py  (Block 4 — pre-flight / excludeId)
tests/unit/test_phase5_admin_catalogue.py       (Phase 5 admin catalogue FakeDB)
tests/unit/test_phase7_media_lifecycle.py       (Phase 7 media lifecycle)
tests/unit/test_phase3_error_envelope.py        (canonical 422 envelope)
tests/unit/test_taxonomy_contract.py            (taxonomy contract)
tests/unit/test_admin_category_detail.py        (admin category detail)

→ 236 passed, 14 subtests passed, 0 failed, 156.79 s
```

Frontend, per suite:

| Suite | Result |
|---|---|
| `apiContract.test.js` | 12/12 |
| `phase3ProductCreate.test.js` (Block 1) | 5/5 |
| `phase3ProductTaxonomy.test.js` (Block 2) | 7/7 |
| `phase3ProductIdentity.test.js` (Block 3) | 12/12 |
| `phase3ProductAvailability.test.js` (Block 4) | 21/21 |
| `phase3ProductVisibility.test.js` (Block 5) | 25/25 |

**No existing test was weakened, skipped, deleted or modified.** `git status` shows the only modified test files are the three carried over from Blocks 1-4 (`test_phase3_product_id.py`, `test_phase5_admin_catalogue.py`, `test_phase7_media_lifecycle.py`); Block 5 touched none of them.

---

## 21. Static visibility audit

Repo-wide search for every public product read path and every publication-state comparison.

### Backend — publication-state predicates (`status == "PUBLISHED"` / `published.is_(True)`)

| Location | Classification |
|---|---|
| `product_service.py:909` (`list_storefront_products`) | ✅ **authoritative server filter** — now paired with `_taxonomy_visible` |
| `product_service.py:1188` (`get_storefront_product`) | ✅ **authoritative** |
| `product_service.py:1230` (`get_recommendations`) | ✅ **authoritative** |
| `product_service.py:1262` (`get_recently_viewed`) | ✅ **authoritative** |
| `product_service.py:1672` (`p.published = p.status == "PUBLISHED"`) | ✅ write-path invariant keeping the two columns in lock-step |
| `product_service.py:1773 / 1897` | ✅ lifecycle guards inside `submit_for_review` / `publish_product` |
| `explore_service.py:461` (`_build_category_cards`) | ⚠️ **duplicated publication logic — intentionally retained.** Builds *category cards*, not products; cannot leak a product. Also carries its own inline copy of the category status map (`:480`). Out of step 7's product-visibility scope. |
| `collection_service.py:174 / 189 / 230` | ⚠️ **duplicated, intentionally retained.** These resolve collection **membership ids** only; the projection then goes through `list_storefront_products`, which applies the full gate — so no leak. Consequence: a collection's `resolvedProductCount` can exceed what the storefront shows for it. Noted as risk R-B. |
| `category_service.py:123 / 134` | ⚠️ **duplicated, intentionally retained** — product **counts** for the taxonomy desk; same count-vs-visibility caveat. |
| `cart_service.py:144 / 410`, `wishlist_service.py:70`, `order_service.py:428` | ⚠️ **intentionally retained, out of scope.** Purchasability checks (`status`/`published` only, no taxonomy gate). Step 7 governs storefront *reads*. Flagged as risk R-C, **not** silently changed. |

### Backend — taxonomy-status visibility predicates

| Location | Classification |
|---|---|
| `product_service.py:614 / 617` (inside `_taxonomy_visible`) | ✅ **the single authoritative predicate** (the only place after this block) |
| `explore_service.py:480` | ⚠️ duplicated inline copy, category cards only — see above |
| *(removed)* four hand-copied `category_status_map.get(p.category, "ACTIVE")` expressions | ✅ **stale logic, deleted** after confirming all four callers. A test now fails if any of them reappears. |

### Frontend — visibility filters and publication-state comparisons

| Location | Classification |
|---|---|
| `services/catalog/catalogStore.js` | ✅ hydrates from the gated `GET /products`; **no** local gate |
| `pages/ProductDetail.jsx:149` (`isAtelierPreview`) | ✅ **display** logic only — it labels a preview and suppresses purchase. Reached only via `?preview=1` + an admin token; the public path can never hold an unpublished record because the server 404s first |
| `data/products/query.js:243` (`queryCatalogue`) | ⚠️ **frontend-only filter, weaker than the server gate** (`status !== "DRAFT"` lets `PENDING_REVIEW` through). **Dead for shop listings** — its only importer is `data/products/explore.js`'s local stream helpers; `useCatalogueQuery` imports only `resolveCategoryFilter`/`resolveSort`/`SORT_ALIASES` from that module. **Intentionally retained** (minimum change) and **pinned by a test** asserting it has not entered `useCatalogueQuery`, `ProductDetail` or `catalogStore` |
| `components/admin/*`, `pages/admin/*`, `pages/employee/*` | ✅ **admin/employee display** — status badges, tone maps, filter dropdowns. Not customer surfaces |
| `components/admin/ProductCatalogSelector.jsx:59`, `components/offers/OfferForm.jsx:95` | ✅ admin pickers restricting selection to live products. Not customer-facing |
| `services/api/productsApi.js:181` (`published: p.published ?? (p.status === "PUBLISHED")`) | ✅ a **normaliser default** for a payload that omits the flag; it mirrors the server, never overrides it |
| `services/workflow/productWorkflowCommands.js` | ✅ approve/publish separation enforced client-side too; `approveProduct` never writes `PUBLISHED` |

**Nothing was deleted before its callers were understood.** The only deletion is the four duplicated predicates, whose four call sites were enumerated and rewritten in the same change.

---

## 22. OpenAPI / API contract impact

**No endpoint was added, removed, renamed or re-shaped. No request or response schema changed. No status code changed.** This is a behavioural narrowing of an existing filter plus documentation.

* **`API_CONTRACT.md`** — new **§10 Storefront Visibility & Publication Gate** (115 lines, 6 subsections): scope table of all eight gated surfaces; the four-rule gate with the fail-open default stated explicitly; the gates that deliberately do not exist; **§10.4 "Approval is not publication"** with the per-action write/effect table; **§10.5** the 404 semantics and *why* it is not a 403/409; **§10.6** the freshness/cache guarantee. Nothing existing was rewritten — the document had no visibility section at all.
* **`docs/openapi.json`** — regenerated from `app.openapi()`, never hand-edited. Diff vs `HEAD`: 4 Block 5 description strings + the 3 Block 4 entries already pending in the working tree (`next-id` description, `availability` description, the `excludeId` parameter). **Drift check: 201/201 paths, empty path delta, empty schema delta, and the on-disk document compares `==` to the live `app.openapi()`.**

Formatting note: the file is generated with `json.dumps(spec, indent=2)` and **`ensure_ascii=True`**, matching the committed file exactly. An initial regeneration with `ensure_ascii=False` produced a 402-line cosmetic diff; that was discarded and redone correctly rather than committed.

---

## 23. Migration decision — and the ONE hard stop in this block

### 23.1 Migration: **NONE CREATED.**

Plan §19 is explicit: *"Subcategory visibility gate (PF3-N06) — **NO** — new read query"* and *"Fail-closed category default (PF3-N07) — **NO** — predicate change. **Data risk, not schema risk**."* No column, index, constraint or Alembic revision was added, and none is required. `git status --short backend/alembic/` returns nothing. No Phase 4 UNIQUE constraint, no duplicate-data cleanup.

### 23.2 HARD STOP — PF3-N07 (fail-closed default) is BLOCKED

**This is reported, not guessed at, and not silently skipped.**

**What the plan requires.** §25 criterion 12 says *"A product whose category resolves to nothing is **not** visible."* §22.1 says *"unknown category now hides."* Taken alone, that is an instruction to flip the default.

**Why it cannot be done here.** Three plan statements gate it:

1. **§24 step 7** — *"fail-closed category default — **only after** the step 0 report is reviewed."*
2. **§23 R1** (likelihood **High**, impact **High**, *"the single highest regression risk in Phase 3"*) — *"Before flipping the default, run a read-only reconciliation report over `catalog_product.category` × `catalog_category`. Ship the report, get the list reviewed, backfill or archive deliberately. **Never flip the default blind.**"*
3. **§26 exit criteria** — *"The step 0 reconciliation report is produced, reviewed, and its findings actioned or explicitly accepted in writing."*

**Step 0 has never been produced, and cannot be produced in this environment.** Plan Appendix B states it directly: *"`SELECT DISTINCT` on real catalogue data (step 0) — **No PostgreSQL in the sandbox.** This is the first task of implementation, not of planning."* **[VERIFIED]** — no PostgreSQL server, no `psql` client, no SQLite dev database, and no catalogue dump exists in this workspace. Blocks 1-4 covered steps 1 and 3-6; **step 0 was never run**.

Flipping the default without it would remove, from every customer surface, in one deployment, every product row whose `category` string does not match a `catalog_category` id, slug or name — with no way to know from here how many rows that is. Block 2 closed the *write* path (a new product can no longer acquire an unresolvable category), which satisfies §10.4's *"must land together"* condition, but it did nothing about **rows that already exist in production**. Enumerating those is exactly what step 0 is for.

**What I did instead.** The current fail-open behaviour is now **asserted by four dedicated tests** (`FailOpenDefaultTests`), documented in `API_CONTRACT.md` §10.2 and in a comment block in the source at the predicate itself. When step 0 is available, flipping the default is a two-line change plus inverting four test expectations — and those four tests guarantee the flip cannot happen by accident or go unnoticed.

**Exactly what is needed to unblock it:**

```sql
-- Step 0, read-only, against the production PostgreSQL catalogue.
SELECT p.category,
       COUNT(*)                                        AS product_rows,
       COUNT(*) FILTER (WHERE p.status = 'PUBLISHED'
                          AND p.published)             AS live_rows,
       (c.id IS NOT NULL)                              AS resolves
FROM   catalog_product p
LEFT   JOIN catalog_category c
       ON  c.id = p.category OR c.slug = p.category OR c.name = p.category
GROUP  BY p.category, (c.id IS NOT NULL)
ORDER  BY resolves, live_rows DESC;

-- and the same shape for catalog_product.subcategory × catalog_subcategory.
```

Any row with `resolves = false` and `live_rows > 0` is a product that **disappears from the storefront** the moment the default is flipped. That list must be reviewed and each row backfilled or archived deliberately.

**No other hard-stop condition was triggered.** The plan did not contradict the implementation, publication semantics were unambiguous, no migration was needed, no transition outside step 7 was required, and the correct storefront endpoints were identified without difficulty.

---

## 24. Risks

| # | Risk | Likelihood | Impact | Mitigation / status |
|---|---|---|---|---|
| **R-A** | **The subcategory gate hides live products.** Any PUBLISHED row whose `subcategory` resolves to a DRAFT or ARCHIVED `catalog_subcategory` disappears on deploy. | Medium | Medium | **Intended** — it is the defect being fixed, and the plan's own §22.3 flow demands it. Bounded, unlike R1: it only affects rows whose subcategory *resolves* to a real non-ACTIVE row, i.e. someone deliberately archived that node. Unresolvable subcategories still fail open. The product row is not mutated, so restoring the subcategory restores visibility instantly (**[VERIFIED]**, live walk I8-I9). |
| **R-B** | **Counts drift from visibility** (plan R10). `resolvedProductCount` and the taxonomy desk's per-category counts filter on `status`/`published` only, so they can now exceed what the storefront shows. | Medium | Low | Known and **left alone** — changing count semantics is not in step 7. Facet counts inside `list_storefront_products` are computed *after* the gate and are correct. |
| **R-C** | **Cart / wishlist / order** re-validate `status`/`published` without the taxonomy gate, so an item already in a cart under a newly archived subcategory stays purchasable. | Low | Low | Pre-existing for categories too; not a step 7 surface. **Reported, not changed.** |
| **R-D** | **Ambiguous subcategory slug/name across categories.** The flat status map keys on id, slug and name; two categories owning a same-named subcategory with different statuses collapse to the last row scanned. | Low | Low | Mirrors the existing category map exactly. Block 2 normalises every new write to the row **id**, so only legacy rows can be ambiguous. Documented in the `_subcategory_status_map` docstring. |
| **R-E** | **Broader cache eviction.** Taxonomy writes now clear the whole `product:storefront:*` namespace, not just the affected products. | Low | Low | Correctness over efficiency, and it is what §24 step 7 asks for. Taxonomy writes are rare admin actions; the alternative (resolving affected product ids first) is a bigger change than step 7 authorises. |
| **R-F** | **One extra query per storefront read.** `_subcategory_status_map` adds a `SELECT * FROM catalog_subcategory`. | Low | Low | Same shape and cost as the pre-existing category map; both are per-request, not per-row. |
| **R-G** | **PF3-N07 remains open**, so a legacy row with a junk category is still permanently visible and un-archivable through taxonomy. | — | Medium | **Deliberate.** See §23. Asserted by tests so it cannot be forgotten. |

---

## 25. Acceptance criteria

Plan §25, visibility and lifecycle sections:

| # | Criterion | Status |
|---|---|---|
| **11** | Visible **iff** `status=PUBLISHED` **and** `published=true` **and** category resolves ACTIVE **and** subcategory (when set) resolves ACTIVE | ✅ **MET** for the four positive conditions. ⚠️ The word *"resolves"* also implies fail-closed; that part is **§23-blocked** and asserted as-is. |
| **12** | A product whose category resolves to nothing is **not** visible | ⛔ **NOT MET — deliberately.** See §23. |
| **13** | `GET /products` and `GET /products/{id}` agree on every row | ✅ **MET** — one shared predicate; asserted per row as a subtest |
| **14** | `approve` never publishes; `publish` requires `review.state=APPROVED` and an empty `get_publish_issues()` | ✅ **MET** — was already true; now locked by 10 backend + 6 frontend tests and 15 live-server checks |
| **21** | No Alembic revision; no PostgreSQL object altered | ✅ **MET** |
| **22** | Backend ≥ 333 passing, frontend ≥ 239 passing, 0 failures | ✅ **MET** — 503 / 310 |
| **23** | `apiClient` calls 100% explicitly scoped | ✅ **MET** — asserted by a new test |
| **24** | The §22.3 end-to-end flow passes against the real application | ✅ **MET** — `ApproveVersusPublishTests` + the 53-check live-server walk, including the `← PF3-N06 regression` line |

Additional Block 5 requirements from the instruction set:

| Requirement | Status |
|---|---|
| ≥15 backend tests | ✅ 44 |
| Frontend tests, no DOM framework added to inflate coverage | ✅ 25, limitation stated |
| Mutation check distinguishing new behaviour from regression locks | ✅ §18 |
| OpenAPI regenerated, zero drift, never hand-edited | ✅ §22 |
| No migration | ✅ §23.1 |
| Blocks 1-4 green | ✅ §20 |
| No golden/real data touched | ✅ §26 |

---

## 26. Explicitly unverifiable items

**[NOT VERIFIABLE IN THIS ENVIRONMENT]** — listed so nothing is mistaken for a verified claim:

1. **Browser DOM interaction** — no browser, no headless Chromium, no Playwright/Puppeteer, no `jsdom`/`happy-dom`, no `@testing-library`. Six specific steps were not executed: rendering `/admin/products`; clicking Approve; clicking Publish; observing the storefront visually; a browser hard refresh; a fresh tab/window/session. The server side of each was verified over real HTTP and the client side by static guards; **that is not the same thing.** Both servers are left running so these can be done manually — sign in at `/admin/login` as `block5@pratikshya.test` / `Block5Verify!2026`.
2. **PostgreSQL behaviour.** Everything ran on SQLite with a `JSONB → JSON` compile shim. The gate is pure Python over rows already fetched, so dialect is not implicated — but it is inference, not measurement.
3. **Step 0 reconciliation** — impossible here (§23). The size of the fail-open population in the real catalogue is **unknown** and no estimate is offered.
4. **Redis.** The KV layer is the in-process LRU shim (`app/core/redis.py` is a compatibility wrapper). The invalidation calls are identical, but a real Redis `SCAN`-based `invalidate_pattern` over a large keyspace was not measured.
5. **`GET /home` seams.** Inferred from source to be gated (they call `list_storefront_products`); not separately asserted, since `/home` is not one of step 7's named surfaces.
6. **Concurrency.** No test covers a publish racing a taxonomy archive. Out of scope; the pre-existing service-layer concurrency caveat (contract §9.5) is unchanged.
7. **Multi-tab / multi-session client state.** `catalogStore` hydrates once per session unless `refreshCatalog({force:true})` or a page load occurs. A publish during an open session is therefore not reflected until a reload — which is the documented "fresh request" guarantee, **[INFERRED]** from source rather than observed in a browser.

---

## 27. Remaining deferred Phase 3 issues

Carried forward from Block 4 §27, plus what this block adds:

| # | Item | Target |
|---|---|---|
| 1 | UNIQUE constraints on `catalog_product.sku`/`.slug` + de-duplication; the probe→write race stays open | Phase 4 (§27.1) |
| 2 | Variants have no server identity contract (the editor's variant SKU check remains local) | Phase 4 |
| 3 | Availability pre-flight has no variant `excludeId` | Phase 4 |
| 4 | Explicit `slug:""` / `sku:""` on PATCH keeps its no-op behaviour | Phase 4 |
| 5 | `POST /admin/products/bulk` cannot write `sku`/`slug` | Phase 4 |
| **6** | **PF3-N07 — fail-closed taxonomy default.** Blocked on the step 0 reconciliation report. **The only piece of step 7 left undone.** | **step 7 completion, after step 0** |
| **7** | **Step 0 itself** — the read-only `SELECT DISTINCT` reconciliation. Needs a real PostgreSQL catalogue. Query given in §23.2. | **prerequisite for 6** |
| 8 | Counts (`resolvedProductCount`, taxonomy per-category counts) do not apply the taxonomy gate (risk R-B) | plan §24 step 11 or Phase 4 |
| 9 | Cart / wishlist / order purchasability checks do not apply the taxonomy gate (risk R-C) | later phase |
| 10 | `explore_service._build_category_cards` duplicates the category status map | plan §24 step 11 (response cleanup) |
| 11 | Legacy `queryCatalogue` client-side filter, currently unused by shop listings | plan §24 step 11 |
| 12 | **Plan §4 steps 8-11 untouched by design** — lifecycle hardening (8), media honesty (9), collections/employee contract (10), response cleanup + integration suite (11) | Blocks 6-9 |

---

## 28. Final verdict

# ✅ PASS

Step 7's two executable components are implemented, proved by mutation, and locked by 69 new tests plus a 53-check live-server walk of the canonical real-world flow. The third component is **formally blocked on a documented, plan-mandated prerequisite that this environment cannot satisfy**, and is reported in §23 with the exact query needed to unblock it rather than guessed at.

**Concretely:**

* ✅ Subcategory parity (PF3-N06) implemented across all four read paths, via one shared predicate that eliminates four hand-copied duplicates.
* ✅ Cache invalidation extended so taxonomy writes cannot leave a stale, gate-bypassing PDP cached.
* ✅ APPROVE ≠ PUBLISH proved end to end against a live server; **not changed, because it was already right.**
* ✅ Every storefront surface filters server-side; the frontend was found correct and **not touched**.
* ✅ PDP semantics reused verbatim from the plan — canonical `404 NOT_FOUND`, indistinguishable from a missing product, no leakage.
* ✅ Backend 459 → 503 (0 failures). Frontend 285 → 310 (0 failures). Build green. OpenAPI zero drift. Blocks 1-4 green.
* ✅ No migration. `backend/alembic/` untouched. No golden or production data read or written — the only rows created live in per-test throwaway SQLite files and one disposable verification database under `/tmp`.
* ⛔ PF3-N07 (fail-closed default) **not implemented**, blocked on step 0, asserted as-is so the flip can never be silent.
* **No commit. No push. No Phase 4.**

**Stopping here for review.**
