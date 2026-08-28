# PHASE 3 — BLOCK 7 IMPLEMENTATION REPORT
## Product Media Honesty (plan §24 step 9 · §4 items 9 & 16 · §11 · API-085/086/125/126/132/133/140 · PF3-N09)

**Date:** 2026-08-28 · **Branch:** `arena/01a04629-pfv1` · **Scope:** Phase 3 Block 7 only
**Verdict:** ✅ **PASS — with the frontend half of step 9 deliberately and formally BLOCKED** (§11, §29)

Every claim below is labelled **[VERIFIED]** (executed this session), **[INFERRED]**
(reasoned from source that was read), or **[NOT VERIFIABLE]** (cannot be executed here).

---

## 1. Executive summary

Plan §24 step 9 is one line with **four** named deliverables. Two shipped, one was
already true, and one is **blocked by a defect in the plan's own premise**.

| # | Step 9 deliverable | Finding | Outcome |
|---|---|---|---|
| 1 | **`role` allow-list** | The column accepted **any string**. A 200-character role was written into a `String(30)` column — accepted on SQLite, **HTTP 500 on PostgreSQL**. | ✅ **IMPLEMENTED** |
| 2 | **`namespace` allow-list** | §2.2 records this as missing. It is **not** — the allow-list has always been enforced one layer below the line §2.2 quotes. | ✅ **ALREADY CORRECT — declared and locked** |
| 3 | **Frontend stops sending media-write keys** | Doing this today makes any product whose media is registered-only **unpublishable**. | ⛔ **BLOCKED — see §11** |
| 4 | **Then remove them from `ProductContentFields`** | Depends on 3, and on an observation window §23 R5 requires and this environment cannot provide. | ⛔ **BLOCKED — depends on 3** |
| — | **"publish gate unchanged during the transition"** | Respected: not one line of `get_publish_issues` was touched. | ✅ **HONOURED** |

**The headline finding.** Plan §11.4 item 3 states *"The publish gate already accepts
either source; keep that during the transition."* **That premise is false.** Both branches
the gate accepts — `product.image` and `product.primary_media_id` — are the product's **own
legacy columns**. Neither is `media_product_media`, the table §11.1 correctly identifies as
"the AUTHORITATIVE association". The only thing in the entire system that ever copies
registered media into those columns is the frontend's `syncProductMediaFromServer`, which
is precisely the write step 9 instructs us to delete. Removing it without first resolving
the gate would silently break publishing. **[VERIFIED]** — proved twice, on the real ASGI
app over real HTTP (§22 group H) and in the suite (§23 `PublishGateMediaSourceTests`).

**The security-adjacent finding.** `role` reached a `String(30)` column unvalidated.
On PostgreSQL that is `StringDataRightTruncation` → **HTTP 500 for a validation
rejection** — the same defect class as PF3-N01, which §24 step 1 treated as **P0**.
It is now a canonical **422 `BUSINESS_RULE_VIOLATION`** that writes nothing. **[VERIFIED]**

---

## 2. Governing plan sections

| Section | What it required | Where it is answered |
|---|---|---|
| §2.2 API-085/132 | `namespace` unvalidated on `/media/objects` | §6 — already enforced; now declared |
| §2.2 API-086/133 | `role` unvalidated on `/media/register` | §7 — implemented |
| §2.2 API-125/126/140 | `media.status` / `media.role` have no enum | §7, §8 — role declared; `status` deferred (§29) |
| §2.3 PF3-N09 | Product-contract media writes are silently ineffective | §10, §11 |
| §4 item 9 | "Product-media write path made honest" | §10, §11 — half blocked |
| §4 item 16 | "Media `role`/`namespace` allow-lists (product-media only)" | §6, §7 — **done** |
| §11.1/§11.2 | The verified architecture and behaviours | §5 — re-verified, one correction |
| §11.4 | Recommended architecture — **"design only, not implemented here"** | §11 — its item 3 is factually wrong |
| §21 | `app/api/v1/media.py`, `app/schemas/media/*.py` | §20 — exactly those two files |
| §23 R5 | Two-stage removal, with a caller census between stages | §11, §29 |
| §24 step 9 | The four deliverables | §1 |
| §25 (5) | No validation reason may produce a 500 | §7 — closed for `role` |

**Dependency note [VERIFIED].** Step 9 is listed as blocking step 11 only, and depends on
nothing upstream. Its `role`/`namespace` half was therefore genuinely ready. Its frontend
half depends on §11.4, which the plan itself marks *"design only — not implemented here"* —
so the plan never actually authorised the architecture that the frontend change requires.

---

## 3. Baseline before any edit

**[VERIFIED]** — captured before the first character was changed.

| Measure | Baseline |
|---|---|
| Backend `pytest tests/` | **555 passed / 24 skipped / 3 warnings / 529 subtests / 237.87s** |
| Frontend `npm test` | **342 tests / 341 pass / 0 fail / 1 skip / 7.13s** |
| `npm run build` | green |
| `docs/openapi.json` | 201 paths, `EQUAL True` |
| `git status backend/alembic/` | clean |

Identical to the Block 6 exit state, confirming no drift between sessions.

---

## 4. Media architecture audit (before editing)

**[VERIFIED]** by executing `/tmp/probe9.py` against the real routers, the real ORM and a
real object store on a disposable database.

### 4.1 `namespace` on `POST /media/objects`

| Input | Result |
|---|---|
| `products` + `productId` | 201, key `products/{PID}/{file}` |
| `products`, no `productId` | 422 `BUSINESS_RULE_VIOLATION` |
| `hero` / `collections` / `marketing` / `uploads` | 201, correctly namespaced |
| `PRODUCTS` | **422** — the check is case-sensitive |
| `evil` / `../etc` | **422**, no object written |
| omitted / empty | defaults to `products`, so 422 for the missing id |

**Conclusion: already correct.** §2.2 quotes `UploadService.store_upload(namespace: str =
"products")` and concludes "no allow-list". That is a shallow read — the allow-list is one
call deeper, in `MediaService.object_key_for_upload` → `app.storage.keys.ALLOWED_NAMESPACES`,
and it has been enforced since Phase 6.

### 4.2 `role` on `POST /media/register`

| Input | Result **before** Block 7 |
|---|---|
| `gallery`, `COVER`, `GALLERY`, `LIFESTYLE_VIDEO` | 201, stored verbatim |
| `totally-made-up` | **201, stored** |
| `커버`, `COVER'; DROP TABLE--` | **201, stored** |
| `" gallery "` | **201, stored with the spaces** |
| 200 × `"x"` | **201, stored into a `String(30)` column** |

**Conclusion: completely open**, and the last row is a latent PostgreSQL 500.

### 4.3 The product contract (PF3-N09)

`PATCH {mediaIds, primaryMediaId, galleryMediaIds}` → **200**; values land in the legacy
JSONB columns; `image` untouched; **no `media_product_media` row is created**. Once any
registered media exists, `media-set` returns `mediaRecordsAvailable: true` with the real
`mediaItems`, while `mediaIds` still echoes the fictional claims. Exactly as §2.3 describes.

---

## 5. Correction to §11.2

**[VERIFIED]** One row of the §11.2 behaviour table is wrong, and one is imprecise.

| §11.2 claim | Reality |
|---|---|
| "`namespace` validation — **None** (API-085/132)" | **Incorrect.** Enforced by `ALLOWED_NAMESPACES`; five members, case-sensitive, 422 for the rest. |
| "Publish gate accepts **either** an authored `image` **or** `primary_media_id`" | Literally true, but **both are product columns**. §11.4 item 3 then treats this as "either source", meaning legacy *or registered* — which is not what the code does. |

`role` validation — "**None** — `Form("gallery")` written verbatim" — was **correct**, and
is what Block 7 fixed.

---

## 6. The `namespace` allow-list

**Vocabulary [VERIFIED]** — `app/storage/keys.py`, unchanged:

```
products   collections   hero   marketing   uploads
```

**Change made:** none to behaviour. The vocabulary is now **re-exported** as
`MEDIA_UPLOAD_NAMESPACES` and **declared in OpenAPI as a real `enum`**, plus a route
description explaining what it protects.

Re-exported rather than redeclared **on purpose**: a second literal copy would be free to
drift from the copy that actually enforces. `test_namespace_vocabulary_mirrors_the_storage_layer`
asserts the two are the same object. **[VERIFIED]**

A JSON Schema `enum` is *accurate* here because the namespace check really is exact and
case-sensitive. **[VERIFIED]** — `PRODUCTS` is rejected.

---

## 7. The `role` allow-list

**Vocabulary [VERIFIED] — derived, not invented:**

```
COVER  GALLERY  DETAIL  LIFESTYLE  MODEL  CLOSEUP
PRODUCT_VIDEO  SHOWCASE  DETAIL_VIDEO  LIFESTYLE_VIDEO
```

**Provenance.** `frontend/src/config/mediaTypes.js` `PRODUCT_MEDIA_ROLES` is the **only
place in the system where this vocabulary was ever written down**. The backend already
agreed with one member of it: `product_media_records.PRIMARY_ROLE = "COVER"`. Nothing was
invented; the plan does not name a vocabulary, so the existing declaration is the authority.

**Semantics [VERIFIED]:**

| Rule | Behaviour |
|---|---|
| Membership | Case-**insensitive** |
| Storage | The caller's own casing, **trimmed** |
| Empty / omitted | Stores the pre-existing default `gallery` — unchanged |
| Anything else | **422 `BUSINESS_RULE_VIOLATION`**, nothing written |
| Response models | **No enum** — deliberately |

**Why case-insensitive rather than folded to one canonical case [VERIFIED].** The system
genuinely uses both casings *today*: the backend declares lowercase `gallery` in four
places (the `Form` default, the column default, `RegisteredProductMediaItem.role`, and the
`serialise_assignment` fallback) while the frontend sends `"COVER"` from
`PRODUCT_MEDIA_COVER_ROLE`. Folding would rewrite what callers store — a data-shape
decision step 9 did not ask for — and would break two **existing** Phase 7 assertions
(`test_phase7_media_lifecycle.py:564,615` assert `"gallery"` and `"detail"` round-trip
verbatim), which the standing rules forbid modifying. The plan asked for an allow-list;
an allow-list closes *membership*, and closing membership does not require picking a
casing winner. The divergence is reported instead (§29).

**Why no response enum [VERIFIED].** A `role` enum on `RegisteredProductMediaItem` would
make a legacy row holding an out-of-vocabulary value **unserialisable — an HTTP 500 on
read**. That is precisely the §23 R6 hazard, and there is no PostgreSQL here to survey what
is actually stored. The allow-list is a **write-path control only**.

**Why a description and not an OpenAPI `enum` for `role` [VERIFIED].** JSON Schema `enum`
means "exactly one of these". Matching is case-insensitive and `""` maps to the default, so
an `enum` would be a contract the implementation does not honour. The vocabulary is
declared in the `description` instead, and `test_role_declares_its_vocabulary_in_the_description`
asserts the absence of the false enum.

---

## 8. Error contract

**[VERIFIED]** No new error code, no second envelope. `role` violations reuse
`BusinessLogicException` → **422 `BUSINESS_RULE_VIOLATION`**, which is exactly what a
`namespace` violation already returned, so the two vocabularies on the same router now
fail identically.

```json
{ "success": false,
  "error": { "code": "BUSINESS_RULE_VIOLATION",
             "message": "Media role 'hero-banner' is not a recognised product media role. Allowed roles: COVER, GALLERY, DETAIL, LIFESTYLE, MODEL, CLOSEUP, PRODUCT_VIDEO, SHOWCASE, DETAIL_VIDEO, LIFESTYLE_VIDEO." } }
```

The message names **the offending value and every allowed value** — actionable without
consulting the docs. No traceback, SQL or driver detail leaks (asserted). **[VERIFIED]**

---

## 9. Atomicity

**[VERIFIED]** The check runs **before** any I/O and before the asset lookup, so a rejected
role leaves the database exactly as it was:

* no `media_media_asset` row, no `media_product_media` row;
* an **existing** association keeps its previous `role`, `sort_order` **and** `is_primary` —
  a rejected call does not partially apply its other fields;
* validated even when `product_id` is absent, so it cannot hide behind `if product_id:`.

---

## 10. PF3-N09 — the current state, asserted as-is

**[VERIFIED]** Nothing here changed in Block 7. It is now *pinned* so that neither stage of
the removal can happen by accident:

* the product contract still accepts and stores the three media-write keys;
* they reach **only** the legacy columns — never `media_product_media`;
* a product can simultaneously advertise `mediaIds: ["ghost-1"]` (an asset that does not
  exist) and serve a completely different, real registered set;
* `ProductUpdateRequest` / `ProductCreateRequest` still declare all three keys.

---

## 11. ⛔ THE BLOCKER — why the frontend half did not ship

**[VERIFIED] — the decisive experiment.** A product was created complete in every respect
except media, then given media *the correct way*: uploaded through
`POST /media/products/{id}/objects` and registered through `POST /media/register` with
`is_primary=true`. The result:

```
media_product_media rows        → 1, is_primary=True
media-set mediaRecordsAvailable → True
media-set primaryMediaUrl       → /api/v1/media/objects/products/.../cover.png
legacy columns                  → image='' primary_media_id=None
publish-issues                  → ["At least one cover image is required before publishing."]
POST .../publish                → 422 "Product has unresolved publish issues."
```

The product **has** a real, primary, resolvable cover image, and the gate says it has none.

**Root cause.** `get_publish_issues` (`product_service.py:238-242`) reads
`product.image` and `product.primary_media_id` — both product columns. A repo-wide search
found **no backend writer** of `primary_media_id` / `media_ids` / `gallery_media_ids` other
than the generic product create/update mapping. The sole populator is the frontend's
`syncProductMediaFromServer`, which reads the registered set, builds a patch with
`buildProductMediaPatch`, and PATCHes it back through the product contract.

**Therefore:** "frontend stops sending media-write keys" and "the publish gate is unchanged"
**cannot both hold**. Step 9 asks for both. This is a genuine plan-vs-implementation
conflict, and the standing instruction is to stop and report rather than guess.

**Two candidate resolutions, for the plan owner — neither chosen here.**

| | Change | Consequence |
|---|---|---|
| **A** | Teach the publish gate to accept a registered primary association | Contradicts step 9's explicit *"publish gate unchanged during the transition"*. Small and well-scoped: `get_publish_issues` is synchronous and takes a `ProductModel`, so the service method would pass in a registered-media flag. |
| **B** | Have `POST /media/register` maintain the legacy projection server-side, in its existing transaction | **Keeps the gate literally untouched** and matches §11.4 item 2's wording that the fields become *"read-only projections"* — a projection needs a projector, and today that projector is the browser. Needs decisions the plan has not made: which wins when an authored plate also exists, what unregistering does, and how ordering maps. |

**B appears more faithful to the plan's words; A is the smaller change.** Both alter publish
semantics, so both need a ruling. Until then §23 R5 stage 1 cannot start, and stage 2
(removal from `ProductContentFields`) cannot start either — it additionally requires the
caller census R5 mandates, which needs a real observation window this environment does not
have. **[NOT VERIFIABLE]** here by construction.

---

## 12. Authorization

**[VERIFIED]** Existing RBAC only; no new permission was created.

| Actor | `POST /media/objects` | `POST /media/register` |
|---|---|---|
| Admin with `media.upload` | 201 | 201 |
| Admin **without** `media.upload` | **403** | **403**, nothing written |
| Anonymous | **401** | **401** |

**Authorization precedes the vocabulary [VERIFIED]** — `require_admin_permission` runs
before `coerce_product_media_role`, so an unauthorized caller gets 403 and **cannot use the
error message to enumerate the vocabulary**. Asserted explicitly
(`test_authorization_is_checked_before_the_vocabulary`, live check F2).

---

## 13. Cache

**[VERIFIED]** Untouched, and it did not need touching: `register_media_object` already
calls `ProductService.invalidate_product_cache(product.id, product.slug)` after commit.
A rejected role never reaches that code, so it cannot invalidate anything either. No second
cache key was introduced (§23 R9).

---

## 14. Backend changes

Two files. **[VERIFIED]** — `git diff --numstat`.

| File | Δ | What |
|---|---|---|
| `app/schemas/media/media.py` | **+91 / −1** | `PRODUCT_MEDIA_ROLE_VALUES`, `DEFAULT_PRODUCT_MEDIA_ROLE`, `MEDIA_UPLOAD_NAMESPACES`, `is_product_media_role`, `coerce_product_media_role`, `product_media_role_error` |
| `app/api/v1/media.py` | **+41 / −2** | The four-line guard in `register_media_object`; the `namespace` enum declaration; route/param documentation |

Both are named in the §21 file list. **No other backend file was touched by Block 7.**
`get_publish_issues`, `product_service.py`, the models and the migrations are untouched.

---

## 15. Frontend changes

**None. [VERIFIED]** — `git status frontend/src/` shows only the four files modified by
Blocks 1–4. `mediaApi.js`, `productMediaService.js`, `mediaTypes.js`, `mediaRepository.js`
and every component are byte-identical to their pre-Block-7 state.

This is a *result*, not an omission: deliverable 3 is blocked (§11), and the vocabulary was
derived from the frontend's existing declaration precisely so that no frontend change would
be needed to keep our own UI working.

---

## 16. Tests added

| File | Tests | Subtests |
|---|---|---|
| `backend/tests/unit/test_phase3_product_media.py` (823 lines, **new**) | **38** | **49** |
| `frontend/tests/phase3ProductMediaHonesty.test.js` (223 lines, **new**) | **14** | — |

Backend classes: `RoleVocabularyDeclarationTests`, `RegisterRoleAllowListTests`,
`NamespaceAllowListTests`, `MediaVocabularyRbacTests`, `MediaContractDeclarationTests`,
`ProductMediaWriteHonestyTests`, `PublishGateMediaSourceTests`.

Real routers, real services, real ORM, real storage provider, real signature-valid PNG
bytes, disposable SQLite + temporary media root. **No mock was substituted for convenience**,
and every mutation assertion re-reads the database row. **[VERIFIED]**

**No existing test was modified, weakened, skipped or deleted. [VERIFIED]**

---

## 17. NEW BEHAVIOUR vs REGRESSION LOCKS

Reported honestly, as in Block 6 — the headline count is mostly locks.

| Class | Count | Which |
|---|---|---|
| **NEW BEHAVIOUR** (fails on reverted code) | **6 of 38** | 5 role-guard tests + 1 namespace-declaration test |
| **REGRESSION LOCKS** (pass either way) | **32 of 38** + all 49 subtests + all 14 frontend tests | the namespace behaviour, the declared-role round-trips, RBAC, PF3-N09's current state, the publish-gate blocker |

The blocker tests (§23 `PublishGateMediaSourceTests`) are locks by construction: they
describe today's behaviour so that changing it is loud.

---

## 18. Mutation check (§22)

**[VERIFIED]** — each mutation applied, focused suite run, then restored and re-verified.

| # | Mutation | Result | Killed |
|---|---|---|---|
| **M1** | Delete the four-line `coerce_product_media_role` guard | **5 failed / 33 passed** | `..._an_unknown_role_is_a_canonical_422_and_writes_nothing`, `..._a_role_longer_than_the_column_is_rejected_not_truncated`, `..._a_rejected_role_leaves_an_existing_association_untouched`, `..._role_is_validated_even_without_a_product`, `..._surrounding_whitespace_is_trimmed` |
| **M2** | Delete `json_schema_extra={"enum": …}` | **1 failed / 37 passed** | `test_namespace_carries_a_real_enum` |
| **M3** (frontend) | Change the client's default role literal to `"hero-banner"` | **2 failed / 12 passed** | the two cross-layer vocabulary guards |

Both backend files restored and `diff`-verified byte-identical to `/tmp/m_{api,schema}.bak`;
`mediaApi.js` restored and verified against `/tmp/mediaApi.bak`. Suites re-run green:
**38 / 49** and **14 / 14**. **[VERIFIED]**

---

## 19. Real-HTTP verification (§17 analogue)

**[VERIFIED] — `/tmp/walk7.py`: 78 checks, 78 passed, 0 failed** against the **real ASGI
app under uvicorn** (not a `TestClient`), on a freshly wiped disposable database.

| Group | Checks | Proves |
|---|---|---|
| A | 3 | sign-in, real draft |
| B | 13 | namespace: 4 members accepted and correctly keyed; `evil`/`PRODUCTS`/`../etc`/`secrets` rejected 422 canonical |
| C | 12 | role: 5 junk values rejected 422; the message names the value and the vocabulary |
| D | 8 | a rejected role changes **nothing** — role, sortOrder and isPrimary all preserved |
| E | 12 | all 10 declared roles round-trip; lowercase preserved; whitespace trimmed |
| F | 3 | anonymous is 401 and the vocabulary is not disclosed |
| G | 4 | PF3-N09 over real HTTP — the fiction is served beside the real set |
| **H** | **12** | **THE BLOCKER** — registered primary media, resolving URL, and publish still refused; approve ≠ publish preserved; row still `PENDING_REVIEW`, `published=false` |
| I | 4 | the live OpenAPI declares the namespace enum, the role vocabulary, and no false enums |

Two expectations of mine were wrong and were **corrected to match the code, not the other
way round**: submit-review does not apply the publish gate (it is `publish` that does), and
the publish rejection message is the generic *"Product has unresolved publish issues."*
with the cover-image text in the `publish-issues` list.

---

## 20. Static audit

**[VERIFIED]** Repo-wide, classified.

| Target | Finding | Class |
|---|---|---|
| Writers of `ProductMediaModel` | `media.py:470` **only** | authoritative |
| Writers of `MediaAssetModel` | `media.py:457` **only** | authoritative |
| Writers of `role` | `media.py:470` (create) and `:472` (update) | authoritative |
| Writers of `primary_media_id`/`media_ids`/`gallery_media_ids` | the product contract only; `product_service.py:2117-2119` is a **read** projection | intentionally retained (PF3-N09) |
| `PRIMARY_ROLE = "COVER"` (`product_media_records.py:37`) | **zero call sites**; exported in `__all__` | **stale**, left in place — it is a *member* of the vocabulary and is evidence of intent |
| Frontend role literals | `mediaApi.js` → `gallery`; `productMediaService.js` → `gallery`, `gallery`, `PRODUCT_MEDIA_COVER_ROLE` | all declared members |
| Frontend namespace literals | `mediaApi.js` → `products` | declared member |
| `role === "COVER"` comparisons in components | `editorSectionsContent.jsx:186`, `ProductDraftReviewPanel.jsx:261`, `ProductGallery.jsx:36` — all read `mediaRepository` (the **local** `localStorage` register), not server data | out of scope — API-197, Phase 4 |
| `ProductMediaManager.jsx:277` | renders the server's `item.role` as a label; no comparison | out of scope |
| Duplicate vocabularies | one backend declaration, one frontend declaration, cross-locked by a test | acceptable |

**No component compares a server-supplied `role` against a case-sensitive literal**, which
is why write-path case preservation is safe. **[VERIFIED]**

---

## 21. API contract and OpenAPI

`API_CONTRACT.md` — **new §12 "Product Media Contract"** (+74 lines, 679 → 753):
§12.1 the two stores and the read rule; §12.2 the role vocabulary; §12.3 the namespace
vocabulary; §12.4 the publish gate's real source. §12.1 and §12.4 document PF3-N09 and the
blocker **in the contract itself**, so a client integrator is not misled by `mediaIds`.

`docs/openapi.json` — regenerated from `app.openapi()` with
`json.dumps(spec, indent=2)`. **201/201 paths, path delta `set()`, `EQUAL True`.
Zero drift. [VERIFIED]** Never hand-edited.

---

## 22. Migration decision

**NO MIGRATION. [VERIFIED]** `git status backend/alembic/` → **0 entries**.

Step 9 requires none, and none is needed: an allow-list is a service-layer control. A
`CHECK` constraint or PostgreSQL `ENUM` on `media_product_media.role` was **considered and
rejected** — it would reject existing rows holding out-of-vocabulary values, which cannot
be surveyed without the step 0 database access this environment lacks. That is the §23 R6
hazard, and §19 forbids speculative migrations.

---

## 23. Full test results

**[VERIFIED]**

| Suite | Baseline | After | Δ |
|---|---|---|---|
| Backend `pytest tests/` | 555 passed / 24 skipped / 3 warnings / 529 subtests / 237.87s | **593 passed / 24 skipped / 3 warnings / 578 subtests / 291.89s** | **+38 tests, +49 subtests, 0 failures** |
| Frontend `npm test` | 342 / 341 pass / 1 skip / 7.13s | **356 / 355 pass / 0 fail / 1 skip / 7.22s** | **+14, 0 failures** |
| `npm run build` | green | **green, 8.03s**, `dist/index.html` 2,804.24 kB / gzip 968.29 kB | — |
| `app.openapi()` vs disk | 201/201, `EQUAL True` | **201/201, delta `set()`, `EQUAL True`** | zero drift |
| `backend/alembic/` | clean | **clean (0)** | no migration |

---

## 24. Regression results

**[VERIFIED]** Targeted run of the 12 protected suites:
**332 passed / 435 subtests / 0 failed / 237.55s** — `test_api_contract`,
`test_phase3_product_{id,taxonomy,identity,availability,visibility,lifecycle}`,
`test_phase3_error_envelope`, `test_taxonomy_contract`, `test_admin_category_detail`,
`test_phase5_admin_catalogue`, `test_phase7_media_lifecycle`.

Blocks 1–6, the Phase 5 admin catalogue FakeDB, the Phase 7 media lifecycle, the API
contract, the taxonomy contract and the canonical error envelope are all green and
**unmodified**.

**One pre-existing flake, disclosed and NOT caused by Block 7. [VERIFIED]**
`test_phase6_media_db.py::StorefrontProjectionTests::test_storefront_detail_returns_the_canonical_media_url`
fails when that file is run in a **four-file subset** with the Phase 7 and API-contract
suites, and passes alone and in the full suite. It was reproduced **identically with the
Block 7 changes stashed**, so it is a pre-existing test-ordering/shared-state issue. It is
reported rather than "fixed", because fixing it is out of scope and would mean touching a
protected suite.

---

## 25. Acceptance criteria

| # | Criterion | Verdict |
|---|---|---|
| 5 | No validation reason produces a 500 | ✅ **MET for `role`** — the `String(30)` truncation 500 is closed |
| 19 | `docs/openapi.json` matches the live app | ✅ **MET** — 0 path delta, `EQUAL True` |
| 21 | No Alembic revision; no PostgreSQL object altered | ✅ **MET** |
| 22 | Backend ≥ 333 and frontend ≥ 239 passing, 0 failures | ✅ **MET** — 593 / 356 |
| 23 | `apiClient` calls remain explicitly scoped | ✅ **MET** — asserted for the media surface; no raw `fetch` |
| §4 item 16 | Media `role`/`namespace` allow-lists | ✅ **MET** |
| §4 item 9 | Product-media write path made honest | ⚠️ **PARTIAL** — §11 |
| API-125/126/140 | No enum for media `role`/`status` | ⚠️ **PARTIAL** — `role` declared on the write path; `status` deferred (§29) |

---

## 26. Risks

| Risk | Assessment |
|---|---|
| A legacy row holds an out-of-vocabulary role and can no longer be **re-registered** without changing its role | **Low.** Reads are unaffected (no response enum); only re-registration is constrained. Cannot be surveyed without step 0. **[NOT VERIFIABLE]** here |
| An external integrator sends a role we now reject | **Low.** Every literal our own frontend can send is locked to the vocabulary by test. External callers are unknown. **[NOT VERIFIABLE]** |
| §23 R6 enum tightening | **Avoided** — write-path only, no response enum, no DB constraint |
| §23 R5 breaking change | **Not incurred** — neither stage shipped |

---

## 27. PF3-N07 status

**BLOCKED and UNTOUCHED — [VERIFIED].** `product_service.py:611` still reads
`category_status_map.get(product.category, "ACTIVE")` and `:614`
`subcategory_status_map.get(subcategory, "ACTIVE")` — still **fail-open**. Step 9 touches
neither the visibility gate nor the taxonomy predicate, so the §26 hard stop was not
triggered. The Block 5 visibility suite is green and unmodified.

---

## 28. Deferred work

| Item | Why | Owner |
|---|---|---|
| **§23 R5 stage 1** — frontend stops sending media-write keys | Blocked on the §11 publish-gate ruling | plan owner, then a later block |
| **§23 R5 stage 2** — remove the keys from `ProductContentFields` | Depends on stage 1 **and** on R5's caller census, which needs a real observation window | later block |
| **Role case divergence** — the column can hold `COVER` and `gallery` | Folding requires a data decision and would break two protected Phase 7 assertions | plan owner |
| **`media.status` enum** (API-125/140) | Media lifecycle status, not product-media association; same R6 hazard as `availability` | Phase 4 (Media) |
| **`PRIMARY_ROLE`** dead constant | Cosmetic; removing code is out of scope for this block | Phase 4 |
| **Pre-existing Phase 6 ordering flake** | Protected suite; out of scope | separate hygiene task |
| **PF3-N07 / step 0** | No PostgreSQL in this environment | unchanged |

---

## 29. NOT VERIFIABLE

Stated honestly rather than papered over.

1. **PostgreSQL behaviour.** The `String(30)` truncation → 500 claim is **[INFERRED]** from
   the column definition and PostgreSQL's documented `StringDataRightTruncation`. SQLite
   does not enforce `VARCHAR` length, so it was observed *accepting* 200 characters — the
   defect is real either way, but the 500 itself was not executed here.
2. **What roles the production database actually holds.** No PostgreSQL access (plan
   Appendix B). The write-path-only design is what makes this survivable.
3. **Anything requiring a browser.** No DOM, no React renderer, no jsdom, no Playwright.
   The upload dropzone, drag-reorder, `ProductMediaManager`'s rendered state and the "Set
   primary" button were **not** executed. The frontend suite's `STATIC:` guards read real
   source files; **static source analysis is not browser verification**.
4. **The R5 caller census.** Requires a deployed observation window.

---

## 30. Final verdict

✅ **PASS.**

* The two allow-list deliverables are **done** — one implemented, one already correct and
  now declared and locked. **[VERIFIED]**
* A latent **HTTP 500 on PostgreSQL** for a validation rejection is closed. **[VERIFIED]**
* The frontend deliverables are **blocked by a false premise in §11.4 item 3**, proved with
  a reproducible experiment and reported with two concrete resolutions rather than guessed
  at. **[VERIFIED]**
* Full regression green: backend **593**, frontend **356**, build green, OpenAPI zero drift,
  **no migration**, PF3-N07 untouched, no existing test modified. **[VERIFIED]**
* Live real-HTTP walk: **78/78**. **[VERIFIED]**

**Nothing was committed or pushed.** Stopping here for review, per the standing instruction.
