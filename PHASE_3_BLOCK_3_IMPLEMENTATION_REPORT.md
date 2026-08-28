# PHASE 3 BLOCK 3 IMPLEMENTATION REPORT
## SKU / slug uniqueness and create-path correctness

**Date:** 2026-08-28 · **Branch:** `arena/01a04629-pfv1` · **Scope:** Phase 3 Block 3 only
**Verdict: PASS** (see §17)

---

## 1. Plan sections used

Everything below is traceable to `PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_PLAN.md`:

| Plan section | What it governed here |
|---|---|
| §4 — PF3-N03 | Duplicate SKU accepted silently. |
| §4 — PF3-N04 | Supplied slug discarded on `POST /admin/products`, honoured but silently suffixed on `/draft`. |
| §4 — PF3-N16 | `GET /admin/products/availability` exists but has no call site. |
| §8 | The silent slug rename on PATCH. |
| §12.x | Create-path comparison table (`Supplied slug`: discarded vs honoured+dedupe; `Supplied sku`: `setdefault` on both). |
| §16.2 | The exact 409 error matrix (message text + `details` keys). |
| §17 | Frontend file plan — 409 must be surfaced distinctly from 422. |
| §18 (a)(b)(f) | The `product_service.py` change list. |
| §19 | Migration verdict: service-layer 409 = **no migration**; UNIQUE indexes = migration, deferred. |
| §21 | Breaking-change list (a duplicate that used to 201 now 409s). |
| §22.1 | The test matrix reproduced in §10. |
| §23 R3 | Return `suggestedSlug` so callers can retry deterministically. |
| §24 step 4 | This block. |
| §25.4 / §25.7 / §25.8 | Acceptance criteria (§16). |
| §26 | Phase 4 follow-up: the UNIQUE constraint + de-dup pass. |
| §27 | Concurrency is untestable in a single-process harness. |

Also read in full before editing: `API_CONTRACT.md`, the Block 1/Block 2 service code and
their test suites.

---

## 2. Pre-implementation findings (verified by reading the code, not from memory)

**Schema.** `catalog_product.slug` = `String(255) NOT NULL default ""`, `sku` =
`String(100) NOT NULL default ""`. `models/catalog/product.py:140-141` declares
`Index("ix_catalog_product_slug", "slug")` and `Index("ix_catalog_product_sku", "sku")`, and
migration `597f883749d8` creates both with `unique=False`. **Nothing in the database
prevented a duplicate.**

**SKU — no check existed anywhere.**
- `create_product`: `data.setdefault("sku", await self._generate_unique_sku())` → a supplied
  SKU was taken verbatim with **zero** probing; two products with the same SKU both returned
  **201**.
- `create_draft`: identical, via `setdefault(..., _generate_unique_sku(prefix=req.id))` —
  which also *always* called the generator even when the caller had supplied a SKU (a wasted
  query per create).
- `update_product`: no SKU handling at all — a PATCH could move a SKU onto another product.
- `update_product_employee`: `sku` absent from the 27-column whitelist → not reachable.
- `bulk_update`: `sku` absent from `BULK_UPDATABLE_FIELDS` → not reachable.

**Slug — three different behaviours on three paths.**
- `create_product`: `data["slug"] = await self._generate_unique_slug(req.name or new_id)` —
  unconditional overwrite, so a **supplied slug was silently discarded** (PF3-N04).
- `create_draft`: honoured the supplied slug but pushed it through `_generate_unique_slug`,
  so a collision became a **silent `-1`/`-2` rename**.
- `update_product`: `if requested_slug and requested_slug != p.slug: data["slug"] =
  await self._generate_unique_slug(requested_slug)` — the same silent rename, i.e. an admin
  who typed `banarasi-silk` could get `banarasi-silk-3` and a changed public URL with no
  notification.
- No path returned 409, and no path ever produced a `suggestedSlug`.

**Availability probe.** `check_availability(sku, slug)` used exact-match `SELECT`s (so it
disagreed with nothing, because nothing else checked) and had **zero frontend call sites**
(PF3-N16).

**Frontend.** `ProductEditor.jsx:360` back-filled the payload with
`slug: draft.slug || catalogRepository.suggestSlug(draft.name, draft.id)` — a slug computed
from the **local session cache**. Harmless while the server silently renamed; a source of
spurious 409s the moment duplicates became hard errors.

---

## 3. SKU behaviour — before / after

| Case | Before | After |
|---|---|---|
| `POST /admin/products` with a taken SKU | **201**, duplicate row created | **409 `CONFLICT`**, `details {field:"sku", value}`, no row |
| `POST /admin/products/draft` with a taken SKU | **201**, duplicate row created | **409**, identical envelope, no row |
| `PATCH` SKU onto another product's value | **200**, duplicate created | **409**, row untouched |
| `PATCH` with the product's **own** SKU | 200 (no check) | **200** — the row is excluded from the probe |
| `PATCH` omitting `sku` | Unchanged | Unchanged |
| `PATCH` with `sku: null` | No-op (`NOT NULL` default) | No-op (unchanged) |
| Create omitting `sku` | Generated `XX-#####` | Generated `XX-#####` (unchanged) |
| `"  pf-x "` vs `"PF-X"` | Two rows | **409** — trimmed, case-insensitive |
| Supplied casing | Stored verbatim | Stored verbatim (trimmed only) |

---

## 4. Slug behaviour — before / after

| Case | Before | After |
|---|---|---|
| `POST /admin/products` with a supplied free slug | **Discarded**, server slug used | Stored **verbatim** |
| `POST /admin/products/draft` with a supplied free slug | Honoured | Honoured (unchanged) |
| Either create path with a **taken** slug | Silent `-1`/`-2` rename, 201 | **409**, `details {field:"slug", value, suggestedSlug}`, no row |
| `PATCH` slug to another product's value | Silent rename, 200 | **409**, row untouched |
| `PATCH` slug to a **free** value | Stored (via the generator) | Stored **verbatim**, never suffixed |
| `PATCH` with the product's own slug | Skipped (`!= p.slug`) | **200** via self-exclusion |
| Create omitting the slug | Generated from the name, de-duplicated | Unchanged |
| `slug: null` / `""` on PATCH | Pre-existing behaviour | **Unchanged** (see §14) |

`suggestedSlug` is the first free `<slug>-<n>`, computed with the *same* case-insensitive
probe used for enforcement — so retrying with the suggestion cannot 409 again for the same
reason. Tested explicitly (`test_the_suggestion_is_deterministic_and_itself_free`, which
seeds both `taken` and `taken-1` and asserts the answer is `taken-2` on repeated calls).

---

## 5. Create-path reconciliation

Both create paths now execute the identical sequence, in the identical order:

```
resolve taxonomy (Block 2)  →  slug: supplied ? assert_available : generate
                            →  sku:  supplied ? assert_available : generate
                            →  defaults → derive pricing → insert
```

| Aspect | `POST /admin/products` | `POST /admin/products/draft` |
|---|---|---|
| Product id | Server-allocated (`pf-<hex>`) | Caller-supplied, 409 if taken (unchanged) |
| Supplied slug | Verbatim or 409 | Verbatim or 409 |
| Supplied sku | Verbatim or 409 | Verbatim or 409 |
| Absent slug | `_generate_unique_slug(name or id)` | `_generate_unique_slug(base_name)` |
| Absent sku | `_generate_unique_sku()` | `_generate_unique_sku(prefix=req.id)` |
| Conflict envelope | identical | identical |

The only remaining differences are the two that are *supposed* to differ: who allocates the
product id, and the SKU-generator prefix. Pinned by
`CreatePathParityTests` (both paths asserted against the same envelope in one test).

---

## 6. PATCH behaviour

- **Omitted** `sku`/`slug` → untouched (`exclude_unset` unchanged).
- **Explicit null** → dropped by the existing `NOT NULL`-default sanitiser; no write, 200.
- **Own value** → 200; the probe carries `.where(ProductModel.id != p.id)`.
- **Another product's value** → 409; **nothing is written**, including other fields sent in
  the same body. This is guaranteed structurally: both uniqueness probes run **before** the
  mutation loop. That ordering is deliberate — `update_product` mutates the ORM object and
  then flushes, so a `select()` issued after mutation would autoflush a partially-applied
  write. Asserted by `test_duplicate_sku_on_patch_is_409_and_writes_nothing` and its slug
  twin, both of which send `name` alongside the bad identity and assert the name did not land.
- Taxonomy validation still runs first, so a patch that is wrong in both ways reports the
  taxonomy 422 (unchanged Block 2 precedence).

---

## 7. The 409 contract

Canonical Phase 1 envelope — no second error format was introduced. `ConflictException`
(409 / `CONFLICT`, already accepting `details`) is reused as-is.

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Slug 'banarasi-silk' is already in use.",
    "details": { "field": "slug", "value": "banarasi-silk", "suggestedSlug": "banarasi-silk-2" }
  }
}
```

| Condition | Message | `details` |
|---|---|---|
| Duplicate SKU | `SKU '<value>' is already in use.` | `{field:"sku", value}` |
| Duplicate slug | `Slug '<value>' is already in use.` | `{field:"slug", value, suggestedSlug}` |
| Duplicate product id | `Product ID '<id>' is already taken.` | `{}` — **left untouched** |

Exactly the §16.2 rows; no extra keys (e.g. the conflicting product's id) were added.
Every 409 response is asserted free of `traceback`, `select `, `sqlalchemy`, `integrityerror`
and `sqlite` (the `assert_conflict` helper checks all five on every conflict in the suite).

**Normalisation rule** (§22.1 required this to be *defined and tested*): the value is
whitespace-trimmed; the collision test is case-insensitive (`func.lower(col) == value.lower()`);
the caller's own casing is **stored verbatim** — the server decides *conflict*, never
*storage*. Blank/`""` counts as "not supplied", so the legacy rows holding `""` are never
reported as collisions.

---

## 8. Frontend behaviour

**Audit result — the API layer already satisfied the requirement, so it was not changed.**
`normaliseError` returns early only for 422; a 409 falls through to the canonical-envelope
branch, keeping `status = 409`, `code = "CONFLICT"` (taken from the envelope, not
synthesised) and `details` as the raw object. `handleError` copies `status`, `code`,
`details`, `data` and `isNetworkError: false` onto the result, and every product write
wrapper (`apiAdminCreateProduct`, `apiAdminCreateDraft`, `apiAdminUpdateProduct`) uses it.
`suggestedSlug` therefore survives as both `result.details.suggestedSlug` and
`result.data.error.details.suggestedSlug`. All of this is now pinned by tests rather than
left as an assumption.

**Two minimal changes** (no UI redesign, no component restructuring):

1. `ProductEditor.jsx` `buildPayload` — the slug is sent **only when the operator typed one**
   (`...(draft.slug ? { slug: draft.slug } : {})`). The previous
   `catalogRepository.suggestSlug(...)` fallback fabricated a slug from the session cache;
   now that a duplicate is a hard 409, a stale cache would have produced a save failure the
   operator could not explain. Omitting the field hands allocation to the server, the only
   party that can see the whole catalogue. The **slug preview** in
   `editorSectionsBasics.jsx:41` is display-only and was deliberately left alone.
2. `adminError.js` 409 branch — when `details.suggestedSlug` is present it is appended
   (`Try "banarasi-silk-2" instead.`). The existing conflict copy, and every other status
   branch, is unchanged.

Client-side `catalogRepository.skuTaken` / `slugTaken` pre-checks were **left in place**:
they are a convenience pre-flight, and the server is now the authority behind them.

---

## 9. Files changed

| File | Δ | What |
|---|---|---|
| `backend/app/services/catalog/product_service.py` | +354 / −27 | Five identity helpers; both create paths; the PATCH branch; `check_availability`; both generators |
| `frontend/src/components/products/ProductEditor.jsx` | +10 / −1 | Stop fabricating a slug in `buildPayload` |
| `frontend/src/services/admin/adminError.js` | +17 / −1 | Surface `suggestedSlug` in the 409 sentence |
| `API_CONTRACT.md` | +173 | New **§9 Product Identity Contract**, incl. §9.5 concurrency caveat |
| `backend/tests/unit/test_phase3_product_identity.py` | +535 (new) | 35 backend tests |
| `frontend/tests/phase3ProductIdentity.test.js` | +325 (new) | 12 frontend tests |

**No migration was created. No existing test was weakened, deleted or skipped. No Block 1 or
Block 2 file was touched.**

New helpers (all private, all on `ProductService`):

```
_normalise_identity(value)                   -> str        # trim; None/blank -> ""
_product_with_sku(sku,  exclude_id=None)     -> row|None   # case-insensitive, self-exclusion
_product_with_slug(slug, exclude_id=None)    -> row|None
_assert_sku_available(sku,  exclude_id=None) -> str        # or ConflictException
_assert_slug_available(slug, exclude_id=None)-> str        # or ConflictException + suggestedSlug
```

`_generate_unique_slug` gained `exclude_id` and both generators now route through the same
two probe helpers, so **suggestion and enforcement can never disagree**. Each probe is still
exactly **one query**, and the slug-before-sku ordering was preserved, so the queue-ordered
`FakeDB` stubs in `test_phase5_admin_catalogue.py` still line up (verified: that suite is
green, unmodified).

---

## 10. Tests added

**Backend — `backend/tests/unit/test_phase3_product_identity.py`, 35 tests** against the real
routers/service/ORM on a throwaway SQLite file with seeded ACTIVE taxonomy (Block 2
validation is live).

- `SkuUniquenessTests` (8): duplicate SKU 409 on draft create / runtime create / PATCH;
  own SKU on PATCH → 200; case+whitespace collision; supplied SKU stored trimmed & verbatim;
  omitted SKU generated (`^PF-\d{5}$`); omitted-on-PATCH unchanged; explicit null no-op.
- `SlugUniquenessTests` (13): supplied slug honoured verbatim on **both** paths (the PF3-N04
  regression); duplicate slug 409 + `suggestedSlug` on both paths; suggestion deterministic,
  skips `-1`, and a retry with it succeeds; duplicate slug on PATCH 409 + nothing written;
  own slug on PATCH → 200; a free slug on PATCH stored verbatim, never suffixed; omitted /
  explicit-null unchanged; generation from the name still works and still de-duplicates;
  case+whitespace collision.
- `CreatePathParityTests` (7): both paths reject a duplicate SKU identically; both reject a
  duplicate slug identically incl. the same suggestion; both honour a supplied slug; a taken
  **product id** is still a 409; 409 vs 422 stay distinguishable; four duplicate shapes all
  409 and never 500; `duplicate_product` still allocates a free slug and SKU.
- `AvailabilityProbeTests` (3): the probe reports taken sku/slug and the same `suggestedSlug`
  the 409 would carry; it uses the same case-insensitive rule; free values report free.
- `PriorBlockRegressionTests` (4): taxonomy 422 still raised with `loc == ["body","category"]`;
  taxonomy still canonicalised to row ids alongside the new identity rules; Save & Continue
  (next-id → draft → GET) still green.

Every 409 assertion goes through one `assert_conflict` helper that checks the full canonical
envelope *and* the five leakage patterns, so the contract cannot drift per-test.

**Frontend — `frontend/tests/phase3ProductIdentity.test.js`, 12 tests** (real service/API
modules, mocked `fetch`): 409 keeps status/`CONFLICT`/`details`/`isNetworkError:false` on
all three write paths; `suggestedSlug` survives `ApiError` normalisation (both accessors);
`persistAdminProduct` returns the 409 instead of throwing or claiming success, with no retry
storm; 409 (object details) vs 422 (list details) distinguishable; `formatAdminError` renders
a conflict — not a network/server error — names the value, and offers the suggested slug;
422 taxonomy copy unchanged; payload omits an untyped slug, sends a typed one verbatim, and
still carries the Block 2 taxonomy ids + Block 1 server id.

**Mutation check (the tests were proven to have teeth).** The Block 3 service file was
stashed and the new backend suite re-run against the previous implementation:
**19 failed, 16 passed**. Two of the 19 were collateral (stashing the file also removes the
Block 2 taxonomy work that lives in the same uncommitted diff), leaving **17 failures
directly attributable to Block 3 behaviour**. The file was restored immediately and the
diffstat re-verified.

---

## 11. Full test results

| Suite | Baseline (before Block 3) | After | Delta |
|---|---|---|---|
| Backend `pytest` (whole suite) | 388 passed, 24 skipped, 94 subtests, 74.4s | **423 passed, 24 skipped, 3 warnings, 94 subtests, 102.8s** | +35, **0 failures** |
| Frontend `npm test` | 252 tests, 251 pass, 0 fail, 1 skipped | **264 tests, 263 pass, 0 fail, 1 skipped** | +12, **0 failures** |
| `npm run build` | green | **green — `✓ built in 7.97s`, `dist/index.html` 2,803.10 kB (gzip 968.02 kB)** | unchanged |

The single skipped frontend test and the 24 skipped backend tests are pre-existing
(Phase 6 real-media integration skips: "real dataset not present"). Nothing new was skipped.

---

## 12. Regression results

Targeted re-run of the suites most at risk — **134 passed, 0 failed**:

| Suite | Why it matters | Result |
|---|---|---|
| `test_api_contract.py` | Phase 1 canonical envelope, incl. the 409 shape | pass |
| `test_phase3_product_id.py` | Block 1 (server-authoritative id, Save & Continue) | pass |
| `test_phase3_product_taxonomy.py` | Block 2 (38 taxonomy tests) | pass |
| `test_phase5_admin_catalogue.py` | The queue-ordered `FakeDB` stubs — the highest-risk suite | pass, **unmodified** |
| `test_phase7_media_lifecycle.py` | `create_draft` with `sku=<product id>` | pass |

Frontend Block 1 (`phase3ProductCreate.test.js`) and Block 2
(`phase3ProductTaxonomy.test.js`) are green inside the full `npm test` run above; the
Save & Continue draft POST and the taxonomy-id payload assertions still hold — and the new
suite re-asserts both from the Block 3 side.

Not touched, and confirmed unreachable for `sku`/`slug`: storefront visibility, lifecycle,
media, collections, the employee contract, caching, `bulk_update`.

---

## 13. Migration decision

**No migration was created — and none is required for this block.**

Plan §19 is explicit: SKU/slug collision → 409 is enforced *at the service layer*
("a SELECT before insert. No constraint needed"), and the UNIQUE constraints on
`catalog_product.sku` / `.slug` are **deliberately separated** into a Phase 4 follow-up
(§26 item 1) because they require a de-duplication pass over existing rows first. The
"STOP and report" condition in the instructions is therefore not triggered: the plan itself
authorises the service-layer route.

Were the constraint to be added later, it would touch:
- table `catalog_product`, indexes `ix_catalog_product_sku` and `ix_catalog_product_slug`
  (created `unique=False` in `backend/alembic/versions/597f883749d8_*.py:115-116`);
- data cleanup: every legacy row holding `sku = ""` or `slug = ""` (the column default)
  would collide immediately, plus any duplicate produced while the old code was live — so a
  backfill assigning generated values must run **inside the same migration, before** the
  constraint is created, and it is not reversible without recording the old values.

**Concurrency limitation (mandatory disclosure).** Because the rule lives in the service and
not in the database, two requests racing on the same SKU/slug inside the probe→insert window
can both pass and both commit, producing a duplicate the API would have rejected
sequentially. Only the UNIQUE constraint closes this. Recorded in `API_CONTRACT.md` §9.5 and
in §15 below. Per plan §27, it is **not testable** in the single-process test harness, and no
test claims to cover it.

---

## 14. Deferred issues (explicitly out of Block 3)

1. **UNIQUE constraints on `sku`/`slug` + the de-dup pass** — Phase 4 (§26 item 1). The only
   real fix for the concurrency window.
2. **Wiring `GET /admin/products/availability` into the editor** (PF3-N16, plan step 6). It
   still has zero call sites; `ProductEditor` continues to pre-check against the session
   cache. The endpoint also **lacks an `excludeId` parameter**, so it reports a product's own
   SKU/slug as taken — it cannot replace the client pre-check until that is added. Its
   matching rule was aligned with the write path in this block so the two can never disagree
   once wired.
3. **Duplicate behaviour under real concurrency** — untestable here (§27).
4. **Explicit `slug: ""` / `sku: ""` on PATCH** keeps its pre-existing behaviour (treated as
   "not supplied", no probe, no rejection). Changing it to a 422 is a request-schema decision
   outside this block; it is now documented in `API_CONTRACT.md` §9.2 rather than left
   implicit.
5. **`POST /admin/products/bulk`** cannot write `sku`/`slug` today, so it needs no rule — but
   if the whitelist ever grows, it must adopt these helpers.
6. **Variant SKUs** are validated only client-side (`editorSectionsCommerce.jsx:303`); the
   server does not treat variant SKUs as catalogue-unique identity. Not in Block 3's scope.

---

## 15. Risks

| Risk | Severity | Mitigation / status |
|---|---|---|
| Racing creates can still duplicate (no DB constraint) | **Medium** | Documented (§13, `API_CONTRACT.md` §9.5); Phase 4 closes it |
| **Breaking change** (§21): a client that relied on a duplicate SKU quietly succeeding, or on the silent `-1` slug rename, now gets a 409 | Medium | Intended by the plan; `suggestedSlug` makes the retry mechanical; the admin UI surfaces it |
| Two extra `SELECT`s per create/patch that supplies both fields | Low | Both hit the existing indexes; whole backend suite ran 74s → 103s, entirely from the 35 new integration tests, not per-request cost |
| `func.lower()` prevents plain index usage on large tables | Low | Acceptable at catalogue scale; a functional index is the natural companion to the Phase 4 UNIQUE work |
| Case-insensitive matching rejects values a previous import created in different casing | Low | Only affects *new* writes; existing rows are untouched and never retro-validated |
| The queue-ordered `FakeDB` in `test_phase5_admin_catalogue.py` could mis-align | Medium at design time | Neutralised: one query per probe, slug-before-sku order preserved; that suite passes unmodified |

---

## 16. Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Duplicate SKU never yields 200/201 → 409 canonical envelope | **PASS** | 3 write paths × `assert_conflict` |
| 2 | Duplicate slug never yields 200/201 → 409 canonical envelope | **PASS** | same, plus `suggestedSlug` |
| 3 | Updating a product with its own SKU/slug stays valid | **PASS** | 2 tests; `exclude_id` self-exclusion |
| 4 | A new product honours an explicitly supplied valid slug | **PASS** | both create paths |
| 5 | Auto-generation only when the caller omits the slug | **PASS** | generation + de-dup tests |
| 6 | `suggestedSlug` consistent and deterministic | **PASS** | determinism test; shared probe with enforcement |
| 7 | Both admin create paths share one uniqueness rule | **PASS** | `CreatePathParityTests` |
| 8 | PATCH: omitted unchanged; null per contract; onto another's value 409; onto own 200 | **PASS** | 6 tests |
| 9 | A rejected update writes nothing | **PASS** | probes precede the mutation loop; asserted on a co-sent `name` |
| 10 | No second error format; no SQL leakage; never 500 | **PASS** | canonical `ConflictException`; 5 leak patterns asserted on every 409 |
| 11 | Frontend: 409 not flattened; `status`/`code`/`suggestedSlug`/`details` preserved | **PASS** | 12 frontend tests |
| 12 | Frontend: duplicate error surfaced usefully; 422 taxonomy unchanged | **PASS** | `formatAdminError` tests both ways |
| 13 | Block 2 taxonomy behaviour unchanged | **PASS** | 38 taxonomy tests + 2 cross-checks in the new suite |
| 14 | Block 1 Save & Continue still green; taxonomy ids unchanged in the payload | **PASS** | Block 1 suites + 2 new tests |
| 15 | Storefront / lifecycle / media / collections / employee / cache untouched | **PASS** | diff is 3 source files; full suite green |
| 16 | No migration created | **PASS** | `git status` — no file under `alembic/versions/` |

---

## 17. Verdict

# PASS

All sixteen acceptance criteria are met. Backend **423 passed / 0 failed** (+35 from the
baseline 388), frontend **263 passed / 0 failed** (+12 from 251), `npm run build` green, and
the five highest-risk existing suites re-run clean and unmodified. The new tests were proven
to fail (17 Block-3-attributable failures) against the previous implementation.

**Explicitly unverifiable / not claimed:**
- Behaviour under **true concurrency** — the probe→insert race is real and open until the
  Phase 4 UNIQUE constraint lands. No test here simulates it, and none should pretend to.
- Behaviour against **PostgreSQL**. All tests run on SQLite; `func.lower()` and the plain
  `select()` used here are dialect-neutral, but collation-sensitive comparison on the real
  database has not been exercised in CI.
- **Existing production data** was not inspected for pre-existing duplicates; the new rule
  applies to writes only and never retro-validates a stored row.
- The **availability endpoint is still unwired** — the editor's pre-check remains the session
  cache, so the client can still let an operator submit a duplicate and learn about it from
  the server's 409. That is now a correct, honest failure rather than silent corruption, but
  it is not a pre-flight fix.

**Stopping here.** Block 4 has not been started, and nothing was committed or pushed.
