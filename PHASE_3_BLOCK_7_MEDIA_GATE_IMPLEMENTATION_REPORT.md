# PHASE 3 — BLOCK 7 MEDIA GATE IMPLEMENTATION REPORT
## Option A — the publish gate consumes the authoritative registered media association

**Date:** 2026-08-28 · **Branch:** `arena/01a04704-pfv1` · **Scope:** the approved Option A gate change only
**Verdict:** ✅ **PASS — register → publish works with no legacy PATCH; the legacy fallback still works.**

Every claim is labelled **[VERIFIED]** (executed this session), **[INFERRED]** (reasoned from
source that was read), or **[NOT VERIFIABLE]** (cannot be executed in this environment).

---

## 1. Executive summary

The approved decision (`PHASE_3_BLOCK_7_MEDIA_SOURCE_OF_TRUTH_DECISION.md`, Option A) has been
implemented: the publish gate now accepts a registered `media_product_media` association with
`is_primary = true` **in addition to** the two legacy sources (`product.image`,
`product.primary_media_id`), which are retained as the transitional fallback.

| Requirement | Result |
|---|---|
| Registered-primary product publishes with legacy media columns empty and **no product PATCH** | ✅ **[VERIFIED]** — suite + live HTTP |
| Legacy-only product still publishes | ✅ **[VERIFIED]** — suite + live HTTP |
| Non-primary-only / zero-primary registered media stays blocked | ✅ **[VERIFIED]** — suite + live HTTP |
| `role=COVER` is NOT the primary signal; `is_primary=true` is | ✅ **[VERIFIED]** — dedicated tests I + J |
| Canonical error string + 422 `BUSINESS_RULE_VIOLATION` unchanged | ✅ **[VERIFIED]** |
| Phase 7 contract lock (`register` writes no product columns) green | ✅ **[VERIFIED]** |
| No migration, no OpenAPI change, frontend untouched | ✅ **[VERIFIED]** |

Backend suite grew **593 → 604** passing (the rewritten blocker test + the new matrix);
frontend is byte-identical (356 / 355 / 0 fail, same as the Block 7 exit state).

---

## 2. Approved Option A decision

**[VERIFIED]** From the decision report (approved by the plan owner): the publish media rule is

```
authored image  OR  legacy primary_media_id  OR  registered is_primary=true association
```

with `role` text explicitly excluded as an authority, the media-set "first item" fallback
excluded from the gate, the legacy branch retained during the transition (plan §11.4 item 3),
no new media semantics (no status/deletion rules, no unregister flow), no migration, and the
R5 frontend removal explicitly deferred to its own staged work.

---

## 3. Files changed

**[VERIFIED]** `git diff --stat`:

| File | Δ | What |
|---|---|---|
| `backend/app/services/catalog/product_service.py` | +36 / −7 | the gate signature + media branch; the two call sites |
| `backend/tests/unit/test_phase3_product_media.py` | +296 / −36 | the blocker test rewritten; 10 new tests; class docstring; file header |
| `API_CONTRACT.md` | +35 / −7 | §12.4 rewritten to the resolved rule |

**No other file was touched. [VERIFIED]** — no frontend file, no migration, no OpenAPI edit,
no other backend module.

---

## 4. Exact gate change

**[VERIFIED]** `get_publish_issues` (`product_service.py:207-261`), media branch only:

```python
def get_publish_issues(
    product: ProductModel,
    registered_media: Optional[List[Dict[str, Any]]] = None,
) -> List[str]:
    ...
    has_authored_image = bool((product.image or "").strip())
    has_legacy_primary = bool(product.primary_media_id)
    has_registered_primary = any(
        item.get("isPrimary") is True for item in (registered_media or [])
    )
    if not has_authored_image and not has_legacy_primary and not has_registered_primary:
        issues.append("At least one cover image is required before publishing.")
```

* The registered list arrives as the **existing serialised shape** (`serialise_assignment`:
  `isPrimary` is a strict `bool`), so `is True` rejects any non-boolean echo. **[VERIFIED]**
* `registered_media` defaults to `None` → `[]`, so the function remains callable by any
  existing caller without a fetch. **[VERIFIED]**
* The canonical error string and every other gate check (id, name, SKU, category, pricing,
  description, `REVIEW_FLAG_BLOCKING`) are unchanged. **[VERIFIED]**

**Both publish paths share one implementation [VERIFIED]:**

| Path | Call site | Now reads |
|---|---|---|
| `POST /admin/products/{id}/publish` | `publish_product` (`:1959`) | `get_publish_issues(p, await self._registered_media_items(p.id))` |
| `GET /admin/products/{id}/publish-issues` | `ProductService.get_publish_issues` (`:2020`) | `get_publish_issues(p, await self._registered_media_items(p.id))` |

The endpoint-specific behaviour cannot differ: both consume the same function over the same
fetch. The `REVIEW_FLAG_BLOCKING` read stays inside `get_publish_issues`, so the structural
test (`test_phase3_product_lifecycle.py:823-837`) still holds. **[VERIFIED]**

---

## 5. Registered-media query path

**[VERIFIED]** The gate **reuses** the existing reader — no association query was duplicated:

```
get_publish_issues(...)            ← pure function; receives the already-fetched list
  └─ ProductService._registered_media_items(product_id)     (product_service.py:349-360)
       └─ registered_media_for_product(db, product_id)      (product_media_records.py:65-95)
            └─ SELECT product_media JOIN media_asset WHERE product_id = ?
```

* The query is the **same inner join** the media-set route and every product projection use,
  so the gate, the DTOs and the storefront cannot disagree about the association. **[VERIFIED]**
* Ordering (`is_primary DESC, sort_order ASC, assignment_id ASC`) is irrelevant to the gate:
  it tests `any(isPrimary is True)`, never the first item. **[VERIFIED]**
* The product row is loaded by the existing `_get_or_404` in the request transaction; the
  association read runs on the **same session** — no new session, no cache dependency, no
  storefront DTO is consulted. **[VERIFIED]**

---

## 6. Legacy fallback behaviour

**[VERIFIED]** Two layers, both preserved:

1. **Media branch retention** — a product with `image` or `primary_media_id` populated passes
   the gate regardless of registered media (tests F + G; live walk product rows verified).
2. **Pre-migration safety** — `_registered_media_items` keeps its SAVEPOINT/except behaviour:
   when the media tables are unavailable the fetch raises `SQLAlchemyError` inside the
   SAVEPOINT, the helper logs and returns `[]`, and the legacy branch answers. A missing media
   table can never turn publish or publish-issues into an HTTP 500. Locked by
   `test_an_unavailable_media_read_falls_back_to_the_legacy_branch`, which mocks the reader to
   raise and asserts both a 200 with no cover issue (legacy populated) and a 200 with the
   canonical issue (legacy empty). **[VERIFIED]**

---

## 7. Why `is_primary` is authoritative

**[VERIFIED]** Every governing artefact and every operating mechanism keys on the boolean:

* `POST /media/register` enforces the ≤1-primary invariant by demoting all other rows where
  `is_primary = True` **in the same transaction** (`media.py:467`);
* the registered read model orders primary-first by `isPrimary` (`product_media_records.py:30-33`);
* `primary_item` selects by `isPrimary` (`:123-128`);
* plan §11.1 names `media_product_media` "the AUTHORITATIVE association" and the decision
  report pins `is_primary=true` as the primary signal.

The gate therefore requires **≥1 row with `is_primary=true`**; zero-primary states (reachable
by demoting the incumbent) remain blocked — the media-set's first-item fallback is never
consulted for publishability (test E asserts the fallback is visible in `primaryMediaUrl`
**while** the gate rejects). **[VERIFIED]**

---

## 8. Why `role=COVER` is not used

**[VERIFIED]** The evidence recorded in the decision report §4.4:

* `role=COVER` may be registered with `is_primary=false`; `is_primary=true` may carry any
  declared role (tests I + J prove both directions);
* role casing diverges in the stored data (`COVER` vs `gallery` both legal, stored as sent);
* `PRIMARY_ROLE = "COVER"` has **zero call sites** in the backend.

The gate's predicate contains no role text comparison — no `.upper()`, no literal `"COVER"`,
no `PRIMARY_ROLE` import. **[VERIFIED by inspection and by the I/J tests]**

---

## 9. Test matrix

All 15 required behaviours, mapped to tests in
`backend/tests/unit/test_phase3_product_media.py::PublishGateMediaSourceTests` unless noted:

| # | Required behaviour | Test | Result |
|---|---|---|---|
| A | No media → rejected | `test_no_media_at_all_keeps_the_gate_closed` | ✅ |
| B | Registered non-primary only → rejected | `test_registered_non_primary_media_does_not_satisfy_the_publish_gate` | ✅ |
| C | Registered primary → accepted | `test_registered_primary_media_alone_satisfies_the_publish_gate` (the rewritten blocker) | ✅ |
| D | Multiple media, exactly one primary → accepted | `test_multiple_registered_media_with_exactly_one_primary_satisfy_the_gate` | ✅ |
| E | Zero registered primaries → rejected | `test_zero_registered_primaries_do_not_satisfy_the_gate` (asserts the media-set fallback exists while the gate rejects) | ✅ |
| F | Legacy `image` populated → accepted | `test_an_authored_legacy_image_satisfies_the_publish_gate` | ✅ |
| G | Legacy `primary_media_id` populated → accepted | `test_the_legacy_columns_do_satisfy_the_publish_gate` (retained verbatim) | ✅ |
| H | Legacy empty + valid registered primary → accepted | `test_registered_primary_media_alone_satisfies_the_publish_gate` (asserts empty legacy columns, then publishes) | ✅ |
| I | `role=COVER` but `is_primary=false` → MUST NOT satisfy | `test_cover_role_without_primary_does_not_satisfy_the_gate` | ✅ |
| J | `is_primary=true` with role other than COVER → MUST satisfy | `test_primary_with_a_non_cover_role_satisfies_the_gate` (role=DETAIL) | ✅ |
| K | Register → publish, no legacy PATCH | the rewritten test performs **zero PATCHes** and publishes 200; the live walk repeats it over real HTTP | ✅ |
| L | Publish → fresh read consistent | `test_publish_result_survives_a_fresh_admin_read` | ✅ |
| M | Storefront resolves the same registered primary | `test_storefront_resolves_the_same_registered_primary` | ✅ |
| N | New primary → cache invalidation correct | `test_registering_a_new_primary_invalidates_the_product_cache` (spies `ProductService.invalidate_product_cache` called with `(product.id, product.slug)`; fresh read shows the new primary) | ✅ |
| O | Missing media tables / legacy-only compatibility | `test_an_unavailable_media_read_falls_back_to_the_legacy_branch` (mocked unavailable read → 200s, legacy branch answers, no 500) | ✅ |

**[VERIFIED]** `pytest tests/unit/test_phase3_product_media.py` → **49 passed / 49 subtests**
(38 → 49: one rewrite + 11 additions, of which 10 are new matrix tests and the class gained
shared helpers). The canonical error string is asserted unchanged in every rejection test.

---

## 10. Existing tests flipped / retained

**Flipped (deliberately, not deleted) [VERIFIED]:**

* `test_registered_primary_media_does_not_satisfy_the_publish_gate` →
  `test_registered_primary_media_alone_satisfies_the_publish_gate`. It proves exactly the
  checklist the task requires: association exists, `is_primary=true`, legacy `image` empty,
  legacy `primary_media_id` None, **no legacy PATCH performed**, no cover issue, publish 200,
  and the published row's legacy columns still empty.
* Intermediate proof of the flip: with the service change applied and the test not yet
  rewritten, the suite showed **exactly one failure** — that test. After the rewrite, green.
  **[VERIFIED]**

**Retained unchanged [VERIFIED]:**

* `test_the_legacy_columns_do_satisfy_the_publish_gate` — body verbatim.
* `test_registering_media_does_not_write_the_product_row` — **assertion body verbatim**
  (only the docstring was updated to describe the resolution). The Phase 7 contract lock is
  as strong as before: `POST /media/register` still writes none of `image`,
  `primary_media_id`, `media_ids`, `gallery_media_ids`.
* `ProductMediaWriteHonestyTests` and every other class in the file — untouched.
* `test_phase7_media_lifecycle.py`, `test_phase6_media_db.py`,
  `test_phase3_product_lifecycle.py` — untouched (41 and 52 passed respectively, see §14).

---

## 11. Live HTTP verification

**[VERIFIED]** Real ASGI app under **uvicorn over real HTTP** (not a TestClient): the walk
harness booted `app.main` on a loopback port against a disposable SQLite database (schema
file attached as `pratikshya`, exactly as the unit harnesses do) with a temporary media root,
seeded one admin (with the real RBAC graph and a real bcrypt password) and one ACTIVE
category/subcategory, then drove the API with httpx.

**29/29 checks passed**, including the exact §14 flow:

```
1. create draft 201 → 2. upload 201 → 3. register is_primary=true 201
4. raw DB row: image='' primary_media_id=NULL media_ids=[]  (legacy untouched)
4d/4e. submit-review 200 → approve 200
5-6. publish-issues 200, NO cover issue
7. publish 200 → PUBLISHED, published=true
8. fresh admin read: primaryMediaId = registered media id, image = canonical URL
9-10. storefront GET 200, image = the same registered canonical URL
11. object bytes served 200 (PNG round-trip)
12-19. second product with registered NON-primary media: approve 200 → publish 422
       BUSINESS_RULE_VIOLATION, details.errors contains the canonical cover message,
       row stays unpublished.
```

---

## 12. PostgreSQL verification status

**PostgreSQL: NOT VERIFIABLE.** **[VERIFIED]** No PostgreSQL server, client or dump exists in
this environment (checked again this session). All SQLite/ASGI results above are behavioural
coverage only and are **not** presented as PostgreSQL proof. The PostgreSQL-backed suites
(`test_media_schema_integrity.py`) skip by design and are unchanged; they must be re-run
where PostgreSQL exists. The change is a plain SELECT over existing tables, so no
PostgreSQL-specific behaviour was added or relied upon. **[INFERRED]**

---

## 13. Mutation-check results

**[VERIFIED]** Mutation: the registered-primary branch severed
(`has_registered_primary = False`), everything else intact.

| Run | Result |
|---|---|
| Mutated — `PublishGateMediaSourceTests` | **5 failed / 9 passed** |
| The 5 failures (exactly the registered-branch tests) | `test_registered_primary_media_alone_satisfies_the_publish_gate`, `test_multiple_registered_media_with_exactly_one_primary_satisfy_the_gate`, `test_primary_with_a_non_cover_role_satisfies_the_gate`, `test_publish_result_survives_a_fresh_admin_read`, `test_storefront_resolves_the_same_registered_primary` |
| The 9 survivors (precision) | legacy F/G, non-primary B, zero-primary E, no-media A, cover-role I, cache N, fallback O, the Phase 7 lock, and the remaining helper-free checks — all still pass, proving the mutation hit only the registered branch |
| Restored (byte-identical diff against backup) | **14 passed** |

No mutated source was left behind. **[VERIFIED]**

---

## 14. Full regression results

**[VERIFIED]**

| Suite | Result |
|---|---|
| Backend `pytest tests/` (full) | **604 passed / 24 skipped / 3 warnings / 578 subtests / 293.43s / 0 failures** |
| `test_phase3_product_media.py` | **49 passed / 49 subtests** |
| `test_phase3_product_lifecycle.py` + `test_phase3_product_visibility.py` | **96 passed / 421 subtests** |
| `test_phase7_media_lifecycle.py` + `test_phase6_media_db.py` | **41 passed** |
| `test_phase3_product_identity.py` + `test_phase3_product_id.py` + `test_phase3_product_availability.py` + `test_api_contract.py` + `test_taxonomy_contract.py` | **102 passed / 14 subtests** |
| Frontend `npm test` | **356 tests / 355 pass / 0 fail / 1 skip / 10.45s** — identical to the Block 7 exit state (frontend untouched) |
| `npm run build` | **green, 7.72s**, `dist/index.html` 2,804.24 kB / gzip 968.29 kB — identical output size |

Baseline accounting: Block 7 exited at 593 backend passing; +11 = the rewritten blocker test
plus the 10 new tests → 604. **[VERIFIED]**

**Pre-existing ordering flake, reproduced against the unchanged baseline and documented:**
`test_phase6_media_db.py::StorefrontProjectionTests::test_storefront_detail_returns_the_canonical_media_url`
fails when Phase 6/7 media suites are run in a four-file subset. It was reproduced
**identically with this block's changes stashed** (`git stash`, baseline run: 1 failed /
144 passed; changes restored byte-identical and `diff`-verified) — and it passes in the pair
run (41 passed) and in the full suite (604 passed). Same flake, same scope, as documented in
the Block 7 report §24. Not caused by this block; not "fixed" (protected suite). **[VERIFIED]**

---

## 15. OpenAPI drift result

**[VERIFIED]** `app.openapi()` vs `docs/openapi.json`: **201/201 paths, path delta `set()`,
`EQUAL True`** — zero drift. No endpoint or schema changed, so **no regeneration was needed**
and `docs/openapi.json` was not touched (no manual edits, no unrelated content changes).

---

## 16. API_CONTRACT changes

**[VERIFIED]** Only §12.4 "Publish gate and media" was rewritten: it now declares the
three-source rule (authored `image` / legacy `primaryMediaId` / registered `is_primary=true`
association), states that `role="COVER"` is descriptive and not the primary signal, that
zero-primary registered media does not satisfy the gate and the media-set fallback is never
consulted, that the legacy branches are retained during the transition, that a missing media
table falls back to legacy without a 500, and that the canonical rejection message and the
422 `BUSINESS_RULE_VIOLATION` envelope are unchanged. No endpoint, response shape or status
code changed. **[VERIFIED]**

---

## 17. Frontend intentionally unchanged

**[VERIFIED]** `git status frontend/src/` and `frontend/tests/` show **zero changes**:

* `syncProductMediaFromServer` / `buildProductMediaPatch` still exist and still PATCH the
  projection (now redundant for publish, harmless for reads) — R5 stage 1 is deferred;
* `buildAdminProductPayload` still forwards `mediaIds` / `primaryMediaId` /
  `galleryMediaIds` — R5 stage 1 is deferred;
* `ProductContentFields` still declares the three keys — R5 stage 2 is deferred;
* the pinned STATIC locks (`phase3ProductMediaHonesty.test.js:165-212`) still assert the
  deferred state and still pass — they will be the deliberate rewrite when stage 1 lands.

The frontend therefore remains fully compatible with the changed backend gate. **[VERIFIED]**

---

## 18. Migration status

**[VERIFIED]** `git status backend/alembic/` → **clean, 0 entries**. No Alembic revision, no
schema change, no index, no constraint, no data backfill — this is a service-layer gate
change, exactly as scoped.

---

## 19. Remaining R5 work

**[VERIFIED — deferred by this block's instructions, not forgotten]**

| Stage | Work | Gate |
|---|---|---|
| R5 stage 1 | Frontend stops sending `mediaIds` / `primaryMediaId` / `galleryMediaIds`; the projection PATCH leaves `syncProductMediaFromServer` / `buildProductMediaPatch`; rewrite the pinned STATIC locks and the sync tests | now unblocked — the backend gate no longer depends on the projection |
| R5 stage 2 | Remove the three keys from `ProductContentFields` (writing them → 422) | still gated on R5's caller census, which needs a deployed observation window |

---

## 20. Remaining Phase 3 deferred items

**[VERIFIED — unchanged by this block]**

* Plan step 0 (read-only reconciliation report over real catalogue data) — needs PostgreSQL.
* PF3-N07 fail-open taxonomy default — the §26 hard stop stands; untouched.
* `media.status` enum (API-125/140) — Phase 4 media lifecycle; the gate intentionally invents
  no status semantics.
* Object-deletion exposure (association persists after `DELETE /media/objects/{key}`) —
  documented; deferred to the Phase 4 media-lifecycle design. Neither option addresses it.
* Role-case divergence (`COVER` vs `gallery` both stored) — plan-owner ruling pending.
* `PRIMARY_ROLE` dead constant — cosmetic, Phase 4.
* Block 8 (collections/employee contract) — not started.
* Phase 4 (media lifecycle) — not started.

---

## 21. Risks

| Risk | Assessment |
|---|---|
| Gate change contradicts step 9's literal "publish gate unchanged" | The literal was already unsatisfiable (Block 7 proof); the implemented shape is the dual acceptance §11.4 item 3 describes and the §22.3 flow requires. The legacy branch is retained. **[VERIFIED]** |
| Concurrent register/publish race | Unchanged and documented (contract §9.5 class); not addressed in this block by instruction. **[VERIFIED]** |
| Zero-primary demotion re-blocks publish | Intended behaviour — a cover must exist; locked by test E. **[INFERRED business intent, VERIFIED behaviour]** |
| Pre-migration database | SAVEPOINT fallback preserved; locked by test O. **[VERIFIED]** |
| External caller relies on publishing a registered-non-primary product | Impossible before this block (the gate rejected it); the block only widens the accepted set, never narrows it. **[VERIFIED]** |
| Frontend projection now redundant | Harmless for reads (registered view already wins); removed deliberately in R5 stage 1. **[VERIFIED]** |

---

## 22. Final verdict

✅ **PASS.**

* The approved Option A gate is implemented in one function and its two call sites, reusing
  the existing SAVEPOINT-guarded registered-media reader — no duplicated query, no new
  session, no cache dependency, no migration. **[VERIFIED]**
* The most important regression test — *registered primary media alone satisfies the publish
  gate, with legacy columns empty and no PATCH* — is in place and publishes 200 end-to-end.
  **[VERIFIED]**
* The full 15-point matrix is green (49/49 in the media suite), the canonical error and
  envelope are untouched, and the Phase 7 contract lock stays green. **[VERIFIED]**
* Real-HTTP verification under uvicorn: **29/29** (register → publish → storefront, and the
  non-primary blocked case). **[VERIFIED]**
* Mutation check: severing the branch fails exactly the 5 registered-branch tests; restore
  verified byte-identical. **[VERIFIED]**
* Full regression: backend **604 / 24 skipped / 0 failures**, frontend **356 / 355 / 0
  failures**, build green, OpenAPI **zero drift**. The pre-existing Phase 6 ordering flake
  was reproduced against the stashed baseline and documented. **[VERIFIED]**
* PostgreSQL: **NOT VERIFIABLE** — no server in this environment; no claim made beyond that.
* Frontend, `ProductContentFields`, migrations and OpenAPI were **not** touched by design.

**Nothing was committed or pushed.** Hard stop honoured: R5 stage 1, R5 stage 2, Block 8 and
Phase 4 remain untouched. Awaiting review.
