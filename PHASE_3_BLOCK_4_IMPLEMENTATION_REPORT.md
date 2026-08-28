# PHASE 3 BLOCK 4 IMPLEMENTATION REPORT
## Product identity availability / pre-flight contract

**Date:** 2026-08-28 · **Branch:** `arena/01a04629-pfv1` · **Scope:** Phase 3 Block 4 only
**Verdict: PASS** (see §22)

---

## 1. Executive summary

Block 4 closes **PF3-N16**: `GET /admin/products/availability` existed, was correct, and had
**zero call sites**, while the admin editor decided SKU/slug uniqueness from
`catalogRepository` — an in-memory browser-session cache. The endpoint is now the editor's
sole authority for the product's own identity, and it gained the one parameter that made
that wiring possible: **`excludeId`**, so a product editing itself is not told its own SKU
is taken.

Two properties were treated as non-negotiable and are now pinned by tests:

1. **The probe cannot disagree with the write.** `check_availability` calls the *same*
   `_product_with_sku` / `_product_with_slug` / `_generate_unique_slug` helpers that Block 3's
   `_assert_sku_available` / `_assert_slug_available` use. There is no second copy of the
   collision rule, so trim, case-insensitivity, self-exclusion and `suggestedSlug` are
   identical by construction rather than by coincidence.
2. **Pre-flight never becomes the guarantee.** Block 3's 409 is untouched and remains the
   only enforcement. A test drives the exact sequence *availability says TAKEN → PATCH anyway
   → 409*, and another asserts the 409's `suggestedSlug` is byte-identical to the probe's.

Backend **459 passed** (+36 from the 423 baseline), frontend **284 passed** (+21 from 263),
`npm run build` green, `docs/openapi.json` back to zero drift. No migration. No commit.

---

## 2. Plan sections used

| Plan section | What it governed |
|---|---|
| §2.3 — **PF3-N16** (P3, backend) | The finding itself: the probe has zero call sites; the editor validates against the local session cache (`ProductEditor.jsx:213,220,228` as numbered at planning time). |
| §4 item 4 | Lists PF3-N16 as **backend + frontend** work alongside PF3-N03 (Block 3 did the backend 409 half). |
| §17 `ProductEditor.jsx` row, change **(c)** | "Validate SKU/slug via `GET /admin/products/availability`, **not the session cache**." |
| §17 `catalogRepository` row | "Remains a cache; must **stop being an authority** for existence, uniqueness or ID allocation." |
| §17 `productAdminService` row | Awaited admin layer; 409 surfaced distinctly from 422 (already satisfied in Block 3 — re-verified, unchanged). |
| §18 `docs/openapi.json` row | "Regenerate." |
| §19 | Migration assessment — nothing in this block appears in the "MIGRATION REQUIRED" rows. |
| §20 | `GET /api/v1/admin/products/availability` → "now actually consumed by the editor", classified **non-breaking**. |
| §22.2 "Explicit API scopes" | Every product call passes an explicit scope; `scopeForPath` stays at 0. |
| §24 **step 6** | "Editor data flow: load from the server on mount; **validate SKU/slug through `GET /admin/products/availability`**; admin taxonomy surface for both selectors; ids on the wire." |
| §25.22 / §25.23 | Suite counts must grow with zero failures; scoping invariant preserved. |
| §26 | Exit criterion: "`docs/openapi.json` regenerated; zero drift against `app.openapi()`." |
| §27 priority 1 | The UNIQUE-constraint migration stays a Phase 4 item. |

**Step 6 is the correct next dependency block.** Its other three clauses are already done —
server-authoritative load on mount (Block 1), admin taxonomy surface and ids on the wire
(Block 2) — leaving the availability wiring as the only outstanding clause.

### 2.1 One thing the plan does **not** say (stated, not silently invented)

The plan **never uses the word `excludeId`**, nor any parameter name for self-exclusion. It
only requires that the editor validate SKU/slug through this endpoint. That requirement is
unsatisfiable without self-exclusion: the endpoint answers "is this value used by *anybody*",
so wiring it as-is would have told every operator editing an existing product that their own
SKU is taken — turning a working editor into a permanently invalid form.

The two local functions being *replaced* — `catalogRepository.skuTaken(sku, ignoreProductId)`
and `slugTaken(slug, ignoreId)` — already take an exclusion argument, and `ProductEditor`
already passed `draft.id` to both. `excludeId` is therefore the **server-side parity** of
behaviour that already existed on the client, not a new concept. It is an *optional* query
parameter, so §20's "non-breaking" classification still holds. I am flagging this rather than
presenting it as plan text.

---

## 3. Pre-implementation audit

Baselines captured **before** any edit:

| Suite | Command | Result |
|---|---|---|
| Backend | `cd backend && ./.venv/bin/python -m pytest` | **423 passed, 24 skipped, 3 warnings, 94 subtests, 112.9s** |
| Frontend | `cd frontend && npm test` | **264 tests, 263 pass, 0 fail, 1 skipped** |

### 3.A Backend endpoint (read from source, pre-change)

`app/api/v1/products.py:386-401` → `ProductService.check_availability` (`product_service.py:2081`).

| Question | Answer before Block 4 |
|---|---|
| Query parameters | `sku` (optional), `slug` (optional). **No `excludeId`.** |
| Response schema | `AvailabilityResponse` — `{ok, skuTaken, slugTaken, suggestedSlug}`, camelCase via `alias=` + FastAPI's default `response_model_by_alias=True`. |
| Auth | `get_current_admin` + `require_admin_permission(..., "products.view")`. Correct: a read probe needs `products.view`, not `products.manage`. |
| SKU matching | `self._product_with_sku(sku)` — Block 3's helper, so already trimmed + case-insensitive. |
| Slug matching | `self._product_with_slug(slug)` — same. |
| Case-insensitive? | **Yes** (inherited from Block 3). |
| Whitespace normalised? | **Yes**, via a local `.strip()` (now folded into the shared `_normalise_identity`). |
| `excludeId` supported? | **No** — the blocker. |
| `suggestedSlug` returned? | Yes, when the slug is taken, via `_generate_unique_slug(slug, base=True)`. |
| Agrees with `_assert_*_available`? | **Almost.** Same helpers, same generator — but **no self-exclusion**, so for a product editing itself the probe said TAKEN where `PATCH` returns **200**. That single divergence is what Block 4 removes. |

### 3.B Frontend usage (whole-tree search, pre-change)

| Search | Result |
|---|---|
| `apiAdminCheckAvailability` | Defined `productsApi.js:446`; re-exported as `checkAvailability` in `productAdminService.js:84` and in its default export — **zero UI call sites** (PF3-N16 confirmed still live). |
| `/availability` raw `fetch` | None. |
| `catalogRepository.skuTaken` | `ProductEditor.jsx:246` (**product SKU**), `:261` (variant SKUs), `editorSectionsCommerce.jsx:303` (variant warning). |
| `catalogRepository.slugTaken` | `ProductEditor.jsx:253` (**product slug**). |
| `catalogRepository.suggestSlug` | `editorSectionsBasics.jsx:41` — slug **preview** only. |
| Where the editor checks identity | One `useMemo` (`errors`, `ProductEditor.jsx:241-267`), feeding `Field error={errors.sku}` / `errors.slug`, the save guards (`:458/:475/:492`) and the tab-invalid markers (`:305/:308`). |

### 3.C Session-cache dependency — why it had to go

`catalogRepository.js:72` — `let serverProducts = []`. Populated only by `replaceServerProducts`
(an admin **list** fetch) and `upsertServerProducts` (single records). Therefore:

**False negatives (a real duplicate looks free):**
- Deep-linking to `/admin/products/new` never runs a list fetch → cache empty → *every* SKU
  reads as free.
- The admin list is paginated (`pageSize` default 20) → any product beyond the fetched page
  is invisible to the check.

**False positives (a free value looks taken — the worse failure, it blocks a legitimate save):**
- `slugTaken` compares with `product.slug === slug` — **case-sensitive**, while the server is
  case-insensitive. `My-Slug` vs `my-slug` disagree in *both* directions.
- A record deleted or renamed elsewhere lingers in this session's cache.
- `skuTaken` also matches other products' **variant** SKUs, which the server does not check at
  all — so the client could refuse a save the server would accept.

**Current-product identity:** both helpers already accepted an `ignoreId` and the editor
already passed `draft.id`, so self-exclusion semantics existed client-side and had to be
preserved server-side.

**Can the server be the sole authority?** For the product's own SKU/slug — **yes**, and it now
is. For **variant** SKUs — **no**: variants are not rows and the backend has no variant
identity contract, so that check must stay local (§16).

---

## 4. Existing availability endpoint behaviour → after

| Aspect | Before | After |
|---|---|---|
| `sku` / `slug` params | present | unchanged |
| `excludeId` param | **absent** | **added**, optional |
| SKU match | trimmed, case-insensitive | unchanged, now also self-excluding |
| Slug match | trimmed, case-insensitive | unchanged, now also self-excluding |
| `suggestedSlug` | first free `-n`, no exclusion | first free `-n`, **honouring `excludeId`** |
| Own SKU/slug while editing | reported **TAKEN** (contradicting `PATCH` → 200) | reported **FREE** (matches `PATCH`) |
| Blank/whitespace inputs | `.strip()` inline | routed through the shared `_normalise_identity` |
| Response shape | `{ok, skuTaken, slugTaken, suggestedSlug}` | **unchanged** |
| Auth / permission | admin + `products.view` | **unchanged** |
| Writes anything? | no | no (asserted) |

---

## 5. Backend changes

**`app/services/catalog/product_service.py`** — `check_availability(sku, slug, exclude_id=None)`:
inputs pass through `_normalise_identity`; the probes and the slug generator receive
`exclude_id`; a blank/whitespace `exclude_id` collapses to `None`. The docstring records that
this is a convenience layer and that the 409 remains the authority. **No new collision logic
was written** — the method is now purely a caller of Block 3's helpers.

**`app/api/v1/products.py`** — the route accepts `excludeId: Optional[str] = Query(None)` and
forwards it. The OpenAPI `description` now documents the parameter and states that the
authoritative verdict is the 409.

**Deliberately unchanged:** `_assert_sku_available`, `_assert_slug_available`,
`_product_with_sku`, `_product_with_slug`, `_generate_unique_slug`, `_generate_unique_sku`,
`create_product`, `create_draft`, `update_product`. Block 3's write semantics are byte-identical.

---

## 6. Frontend changes

1. **`src/services/api/productsApi.js`** — `apiAdminCheckAvailability({sku, slug, excludeId})`.
   It still goes through `apiClient.get(..., { scope: "admin" })` (no raw `fetch`, explicit
   scope) and still returns through `handleError`. `buildParams` already drops
   `undefined`/`null`/`""`, so an absent `excludeId` never reaches the wire.
2. **`src/services/admin/productAdminService.js`** — `checkAvailability` forwards `excludeId`;
   its docstring records why the session cache is not an authority.
3. **`src/services/admin/productIdentityPreflight.js`** *(new, 104 lines)* — the pure decision
   logic: `buildAvailabilityQuery`, `verdictMatchesQuery`, `identityErrors`, `toVerdict`,
   `normaliseIdentity`. Extracted **because the frontend harness has no DOM** (`node:test`, no
   React renderer): without it, none of this logic could be tested, only asserted about by
   reading source. The component keeps the effect; the module keeps the decisions.
4. **`src/components/products/ProductEditor.jsx`** — one `useMemo` building the query, one
   `useEffect` issuing the debounced probe, and the `errors` memo now taking its product-level
   SKU/slug verdict from the server. The rendering, the field components, the section layout,
   the save guards and the tab markers are untouched — `errors.sku` / `errors.slug` keep the
   same shape, so **no UI was redesigned**.

**Timing** (derived from the existing architecture, which already had a server-verdict effect
in `refreshServerIssues`):

| Trigger | Behaviour |
|---|---|
| Mount / server load | The load sets `draft`, which produces a query → one probe. |
| SKU or slug edit | Debounced **400 ms** after the last keystroke (`IDENTITY_PROBE_DELAY_MS`, a plain `setTimeout` — **no library added**). Superseded timers are cleared, so typing produces one request per pause, not one per character. |
| Blur / change | No extra handler — the value change is the trigger; adding blur handlers would duplicate requests. |
| Save | **No probe.** The write itself is the check (Block 3's 409). Probing first would add a request and still not close the race. |
| Both fields empty | No request at all (`buildAvailabilityQuery` → `null`). |
| `portal !== "admin"` | No request — the employee portal has no admin token and would only collect 403s. |

**Honest failure mode:** a failed probe yields `null` — *unknown*, never "free" and never
"taken" — so it shows no error and blocks no save. A stale answer is discarded because every
verdict is pinned to the exact `{sku, slug, excludeId}` it was requested for.

---

## 7. `excludeId` behaviour

| Situation | `excludeId` sent? | Server verdict |
|---|---|---|
| New product (`draft.exists === false`) | **No** — never fabricated | value judged against the whole catalogue |
| Existing product, its **own** SKU/slug | Yes, `draft.id` | **FREE** — matches `PATCH` → 200 |
| Existing product, **another** product's value | Yes, `draft.id` | **TAKEN** — matches `PATCH` → 409 |
| Own value in different casing | Yes | **FREE** — exclusion survives the case-insensitive compare |
| `excludeId` matching no row | Passed through | excludes nothing (no 404 — a probe should not turn into an existence oracle) |
| `excludeId=""` or whitespace | Dropped client-side; ignored server-side | excludes nothing |
| Effect on `suggestedSlug` | Yes | the excluded product's own slug is available to the suggestion (test: `test_the_suggestion_respects_excludeId`) |

---

## 8. SKU availability contract

`skuTaken` is `true` **iff** some *other* row (after `excludeId`) has a SKU equal to the
supplied value, compared **trimmed** and **case-insensitively** — the identical predicate
`_assert_sku_available` uses. An omitted/blank `sku` is never reported taken. The probe never
returns `suggestedSlug` for a SKU (there is no deterministic SKU suggestion in the contract;
`_generate_unique_sku` is random and would not be reproducible for a caller).

## 9. Slug availability contract

`slugTaken` follows the same rule. When `true`, `suggestedSlug` carries the first free
`<slug>-<n>`, computed with the same generator and the same `excludeId`. When `false`,
`suggestedSlug` is `null` — a free slug needs no alternative.

## 10. `suggestedSlug` behaviour

- Same algorithm as Block 3 — literally the same function, not a reimplementation.
- Skips every occupied value: with `taken`, `taken-1`, `taken-2` held, it returns `taken-3`.
- Case-insensitive and `excludeId`-aware.
- **Deterministic**: two probes against unchanged data return the same value.
- **Actually free**: asserted by re-probing the suggestion *and* by creating a product with it.
- **Identical to the 409's**: `test_the_suggestion_matches_the_one_the_409_carries` compares the
  probe's value with `error.details.suggestedSlug` from the conflict.

---

## 11. Relationship to Block 3's 409 enforcement

Availability is a **convenience**; the 409 is the **contract**. Nothing about Block 3 was
relaxed — `git diff` shows no change to any `_assert_*`, create or update path.

The layering is proved by tests rather than asserted in prose:

| Test | What it drives |
|---|---|
| `test_free_then_create_succeeds` | FREE → create → 201 |
| `test_taken_then_create_is_rejected` | TAKEN → create → 409 |
| `test_every_free_verdict_is_honoured_by_the_write_path` | 3 sub-cases (plain, case-variant, whitespace-padded): FREE → 201 every time |
| `test_every_taken_verdict_is_rejected_by_the_write_path` | 6 sub-cases across sku/slug × case × whitespace: TAKEN → 409 every time |
| `test_probe_and_patch_agree_on_the_products_own_identity` | FREE(own, excludeId) → PATCH → 200 |
| `test_probe_and_patch_agree_on_another_products_identity` | TAKEN(other, excludeId) → PATCH → 409 |
| `RealFlowTests` (§12 of the brief) | the three end-to-end flows |

**The race is not closed and is not claimed to be.** Between the probe and the write another
request can take the value; the probe merely widens the Block 3 service-layer window by a
round-trip. Only a database UNIQUE constraint closes it (Phase 4). Recorded in
`API_CONTRACT.md` §9.6 and §17 below.

---

## 12. Files changed

| File | Δ | What |
|---|---|---|
| `backend/app/services/catalog/product_service.py` | +40 / −18 | `check_availability` gains `exclude_id`, routed through the Block 3 helpers |
| `backend/app/api/v1/products.py` | +12 / −2 | `excludeId` query parameter + endpoint documentation |
| `frontend/src/services/api/productsApi.js` | +10 / −3 | `excludeId` on the API wrapper |
| `frontend/src/services/admin/productAdminService.js` | +12 / −3 | `excludeId` forwarded; authority documented |
| `frontend/src/services/admin/productIdentityPreflight.js` | **+104 (new)** | pure pre-flight decision logic |
| `frontend/src/components/products/ProductEditor.jsx` | +82 / −7 | debounced server probe; `errors` sourced from the server verdict |
| `backend/tests/unit/test_phase3_product_availability.py` | **+555 (new)** | 36 backend tests (+14 subtests) |
| `frontend/tests/phase3ProductAvailability.test.js` | **+361 (new)** | 21 frontend tests |
| `docs/openapi.json` | +20 / −2 | regenerated (plan §18/§26) |
| `API_CONTRACT.md` | +40 / −5 | new §9.6; the stale §9.4 sentence corrected |

**No migration. No test weakened, deleted or skipped. No commit, no push.**

---

## 13. Tests added

**Backend — `test_phase3_product_availability.py`, 36 tests + 14 subtests**, real
routers/service/ORM on throwaway SQLite with seeded ACTIVE taxonomy. Mapped to the brief's
15 required cases:

| # | Required case | Test |
|---|---|---|
| 1 | free SKU → available | `test_a_free_sku_is_reported_available` |
| 2 | taken SKU → unavailable | `test_a_taken_sku_is_reported_unavailable` |
| 3 | free slug → available | `test_a_free_slug_is_reported_available_with_no_suggestion` |
| 4 | taken slug → unavailable | `test_a_taken_slug_is_reported_unavailable_with_a_suggestion` |
| 5 | case-insensitive SKU | `test_sku_matching_is_case_insensitive` |
| 6 | case-insensitive slug | `test_slug_matching_is_case_insensitive` |
| 7 | whitespace-normalised | `test_sku_matching_is_whitespace_normalised`, `..._slug_...` |
| 8 | `excludeId` allows own SKU | `test_excludeId_reports_the_products_own_sku_as_free` |
| 9 | `excludeId` allows own slug | `test_excludeId_reports_the_products_own_slug_as_free` |
| 10 | another product still conflicts | `test_excludeId_does_not_hide_another_products_sku` / `..._slug` |
| 11 | `suggestedSlug` deterministic | `test_the_suggestion_is_deterministic`, `..._skips_every_occupied_value` |
| 12 | `suggestedSlug` actually free | `test_the_suggestion_is_actually_free_and_accepted_by_the_write_path` |
| 13 | availability ⇄ write agree | the 6 `ProbeAgreesWithWritePathTests` (incl. 14 subtests) |
| 14 | no SQL/traceback leakage | `test_the_probe_never_leaks_sql_or_internals` (5 payloads × 5 patterns), `test_a_hostile_sku_value_cannot_reach_the_database_as_sql` |
| 15 | canonical Phase 1 error contract | `test_an_unauthenticated_probe_uses_the_canonical_envelope` |

Plus: response-shape lock, no-parameters case, unknown/blank `excludeId`, case-insensitive
self-exclusion, `excludeId`-aware suggestion, probe-writes-nothing, and the three `RealFlowTests`.

**Frontend — `phase3ProductAvailability.test.js`, 21 tests.** Mapped to the brief's 11:

| # | Required case | Test |
|---|---|---|
| 1 | editor uses server availability, not the stale cache | `ProductEditor derives product SKU/slug errors from the server, not catalogRepository` (static guard, see caveat below) + the `identityErrors` suite |
| 2 | new product sends no fabricated `excludeId` | `a new product never sends a fabricated excludeId`, `buildAvailabilityQuery omits excludeId…` |
| 3 | existing product sends the current id | `an existing product sends its own id as excludeId`, `buildAvailabilityQuery sends excludeId…` |
| 4 | own SKU not marked taken | `a product's own SKU is not marked taken` |
| 5 | own slug not marked taken | `a product's own slug is not marked taken` |
| 6 | another product's SKU detected | `another product's SKU is detected and named` |
| 7 | another product's slug detected | `another product's slug is detected and the server's suggestion is offered` |
| 8 | `ApiError` contract preserved | `a failed probe preserves the ApiError contract` |
| 9 | Block 3 409 handling unchanged | `Block 3: a duplicate SKU 409 on save is still preserved end to end` |
| 10 | Block 2 taxonomy payload unchanged | `Block 1 + Block 2: the create payload still carries the server id and taxonomy ids` |
| 11 | Block 1 server ID flow unchanged | same test (asserts `seen.id`) |

Plus: explicit scope + endpoint, blank `excludeId` dropped, trimming, `null` query, dead-probe
never blocks a save, stale-answer pinning, `excludeId`-mismatched verdict discarded,
GET-with-no-body.

**Caveat, stated plainly:** required case #1 is covered by a *static source guard* plus unit
tests of the extracted decision module — **not** by rendering `ProductEditor`. The frontend
harness is `node:test` with no DOM and no React renderer, and adding one is a test-infrastructure
change well outside this block. What is proven: the component imports and calls
`checkAvailability`, no longer references `catalogRepository.slugTaken` or
`catalogRepository.skuTaken(draft.sku`, and the pure logic it delegates to behaves correctly.
What is **not** proven by test: React's effect scheduling and the debounce timer inside a live
component (§21).

**Mutation check.** The two Block 4 source hunks were reverted and the new backend suite re-run:
**6 failed, 30 passed** — and the 6 are exactly the `excludeId` behaviours
(`ExcludeIdTests` ×4, `test_probe_and_patch_agree_on_the_products_own_identity`,
`test_edit_existing_product_flow_own_identity_then_patch`). The other 30 pass on the old code
because Block 3 had already aligned the matching semantics — they are a **regression lock** on
an agreement that existed but had never been tested at the endpoint level, not a claim of new
behaviour. Sources were restored immediately and the diffstat re-verified.

---

## 14. Full test results

| Suite | Baseline (pre-Block-4) | After | Delta |
|---|---|---|---|
| Backend `pytest` | 423 passed, 24 skipped, 3 warnings, 94 subtests, 112.9s | **459 passed, 24 skipped, 3 warnings, 108 subtests, 139.5s** | **+36 tests, +14 subtests, 0 failures** |
| Frontend `npm test` | 264 tests, 263 pass, 0 fail, 1 skipped | **285 tests, 284 pass, 0 fail, 1 skipped** | **+21, 0 failures** |
| `npm run build` | green | **green — `✓ built in 8.03s`, `dist/index.html` 2,804.24 kB (gzip 968.29 kB)** | unchanged |

The 24 backend skips and the 1 frontend skip are pre-existing (Phase 6 "real dataset not
present"). Nothing new was skipped.

---

## 15. Regression results

Targeted re-run — **backend 205 passed + 14 subtests, frontend 57 passed, 0 failures**:

| Suite | Covers | Result |
|---|---|---|
| `test_api_contract.py` | Phase 1 canonical envelope | pass |
| `test_phase3_product_id.py` | Block 1 — server-authoritative id, Save & Continue | pass |
| `test_phase3_product_taxonomy.py` | Block 2 — 38 taxonomy tests | pass |
| `test_phase3_product_identity.py` | **Block 3 — 35 identity/409 tests** | pass, **unmodified** |
| `test_phase3_product_availability.py` | Block 4 | pass |
| `test_phase5_admin_catalogue.py` | queue-ordered `FakeDB` stubs | pass, **unmodified** |
| `test_phase7_media_lifecycle.py` | `create_draft` with `sku=<id>` | pass |
| FE `phase3ProductCreate` / `phase3ProductTaxonomy` / `phase3ProductIdentity` / `phase3ProductAvailability` / `apiContract` | Blocks 1-4 + Phase 1 | 57 pass |

`docs/openapi.json`: **201 paths live, 201 committed, 0 delta**; after regeneration the
structural diff is **0 differences**. Before regeneration there were 3 — two of mine and **one
pre-existing drift from Block 1** (the `next-id` description gained a "Canonical form" line
that was never regenerated). I regenerated the file per plan §18/§26 rather than leaving a
known-stale artefact; the whole diff is 20 lines and is listed in §12.

---

## 16. Static audit results

Repository-wide search for stale identity pre-flight logic:

| Occurrence | Verdict |
|---|---|
| `ProductEditor.jsx:328` — `catalogRepository.skuTaken(variant.sku, draft.id)` | **Intentionally retained.** Variants are not database rows and the backend has **no variant identity contract**; this is the only coverage that exists. Deleting it would remove a real check. |
| `editorSectionsCommerce.jsx:303` — same, per-variant warning badge | **Intentionally retained**, same reason; presentation of the above. |
| `editorSectionsBasics.jsx:41` — `catalogRepository.suggestSlug(draft.name, draft.id)` | **Intentionally retained.** Display-only *preview* of what the slug would look like; not a verdict, never sent (Block 3 stopped the payload from carrying it). |
| `catalogRepository.js:559-590` — `slugTaken`, `ensureUniqueSlug`, `skuTaken` internals | **Valid legacy / employee-only.** Consumed by the repository's own local write path (`:735` merge, `:1207`/`:1223`/`:1250` `duplicateProduct`), which `ProductEditor` reaches **only** on the `portal !== "admin"` branch (`:499-501`). Plan §17 puts the employee portal's local command path in **Phase 5**. |
| `catalogRepository.js:1392-1396` — the three exported helpers | Retained: still consumed by the variant checks and the preview above. |
| `productWorkflowCommands.js:277` — `catalogRepository.duplicateProduct` | **Employee-only.** Admin duplicate goes to the API (`productAdminService.js:133` → `apiAdminDuplicateProduct`). |
| Duplicated slug/SKU collision algorithms (backend) | **None.** `check_availability` and the write path share one implementation. |
| Raw `fetch` to `/availability` | **None** — the only path is `apiClient` with `scope: "admin"`. |
| `apiClient` calls missing an explicit scope | **0 of 180** (window scan; the 5 flagged by a naive grep use the `{ scope }` shorthand with a variable, which is explicit). Invariant from plan §22.2 holds. |
| `scopeForPath` / URL-prefix scope inference | **0 references.** |
| `GET /admin/products/availability` call sites | **Was 0 (PF3-N16) → now live**: `ProductEditor.jsx:284` via `productAdminService.checkAvailability`. |

**Obsolete found:** none. Nothing was deleted on suspicion.

---

## 17. Migration decision

**No migration was created, and none is required.** Plan §19 contains no row implying one for
availability — the endpoint is a `SELECT`. The only product-identity rows marked "MIGRATION
REQUIRED" are the UNIQUE constraints on `catalog_product.sku` / `.slug`, which §19 explicitly
separates and §27 assigns to **Phase 4 priority 1**. Block 3 deferred them; Block 4 does not
change that and does not need to: `excludeId` is a `WHERE id != :id` clause on an existing
index. `git status` shows nothing under `backend/alembic/`.

The concurrency window is therefore still open and is documented, not hidden
(`API_CONTRACT.md` §9.5, §9.6; §11 and §18 here).

---

## 18. Risks

| Risk | Severity | Mitigation / status |
|---|---|---|
| Operators may read a FREE pre-flight as a guarantee | Medium | The 409 is unchanged and still fires; documented in `API_CONTRACT.md` §9.6; two tests drive "TAKEN → write anyway → 409" |
| Probe⇄write race (unchanged from Block 3, widened by a round-trip) | Medium | Only the Phase 4 UNIQUE constraint closes it; untestable here (§21) |
| Extra admin traffic from the editor | Low | Debounced 400 ms, skipped when both fields are empty, skipped for the employee portal, one request per typing pause; no probe on save |
| A dead probe silently stops warning the operator early | Low | Deliberate: it never blocks a save, and the server's 409 still names the collision on write. Alternatives (fail-closed, or falling back to the cache) reintroduce the false positives this block removes |
| `excludeId` spoofing to hide a collision | **None in practice** | Admin-scoped, and the *write* re-checks with the server's own `p.id` — a forged `excludeId` cannot make a duplicate persist |
| Behaviour of the debounce/effect under real React scheduling | Low-Medium | Not covered by test (no DOM harness) — see §21 |
| `func.lower()` scans on very large catalogues, now called more often | Low | Same predicate as the write path; a functional index is the natural companion to the Phase 4 UNIQUE work |

---

## 19. Acceptance criteria

| # | Criterion (from the brief / plan) | Status | Evidence |
|---|---|---|---|
| 1 | Plan requirements identified, none invented | **PASS** | §2, incl. the explicit `excludeId` caveat in §2.1 |
| 2 | Current implementation audited before editing | **PASS** | §3.A/B/C, baselines in §3 |
| 3 | Editing product X: own SKU → AVAILABLE | **PASS** | `test_excludeId_reports_the_products_own_sku_as_free` |
| 4 | Editing product X: own slug → AVAILABLE | **PASS** | `test_excludeId_reports_the_products_own_slug_as_free` |
| 5 | Another product's SKU/slug → TAKEN | **PASS** | `test_excludeId_does_not_hide_another_products_sku` / `..._slug` |
| 6 | Same normalisation as Block 3 (trim, case-insensitive, blanks, storage untouched) | **PASS** | 4 matching tests; storage assertions unchanged in Block 3's suite |
| 7 | Availability uses the same underlying identity logic as the write path | **PASS** | shared helpers; §11 agreement tests |
| 8 | Never "availability FREE but write 409" for the same value+exclusion | **PASS** | `test_every_free_verdict_is_honoured_by_the_write_path` (3 subtests) |
| 9 | Never "availability TAKEN but write accepts" | **PASS** | `test_every_taken_verdict_is_rejected_by_the_write_path` (6 subtests) |
| 10 | No second slug-generation algorithm | **PASS** | one `_generate_unique_slug`; probe/409 suggestions asserted identical |
| 11 | Editor wired to the server; server is the pre-flight authority | **PASS** | `ProductEditor.jsx:284`; static guard + `identityErrors` suite |
| 12 | No UI redesign; existing UX preserved | **PASS** | `errors.sku`/`errors.slug` shape unchanged; no render/layout diff |
| 13 | No debouncing library added | **PASS** | plain `setTimeout`; `package.json` untouched |
| 14 | `excludeId` sent when editing; absent when creating | **PASS** | 4 frontend tests |
| 15 | No excessive API requests | **PASS** | debounced, skipped when idle/empty/non-admin, none on save |
| 16 | `apiClient` used, explicit scope, no raw fetch | **PASS** | §16 audit; 0/180 unscoped |
| 17 | `ApiError` / status / code / details / data / isNetworkError preserved | **PASS** | `a failed probe preserves the ApiError contract` |
| 18 | No artificial 409 from an application-level taken/free answer | **PASS** | probe returns 200 + booleans; `test_the_response_shape_is_exactly_the_declared_contract` |
| 19 | Block 3 enforcement not weakened | **PASS** | no diff to any write path; Block 3's 35 tests pass unmodified |
| 20 | Blocks 1 & 2 unchanged | **PASS** | targeted suites; 3 frontend regression tests |
| 21 | No SQL/traceback/internal leakage; canonical error contract | **PASS** | 2 leakage tests + envelope test |
| 22 | Full backend + frontend + build, compared to baseline | **PASS** | §14 |
| 23 | No test weakened, deleted or skipped | **PASS** | only additions; `git status` |
| 24 | The three §12 real flows verified through the real ASGI app | **PASS** | `RealFlowTests` ×3 |
| 25 | No migration | **PASS** | §17; nothing under `backend/alembic/` |
| 26 | Documentation updated only where required | **PASS** | `API_CONTRACT.md` §9.6 + one corrected stale sentence; `docs/openapi.json` per §18/§26 |
| 27 | No commit, no push, Phase 4 not started | **PASS** | `git status` shows an uncommitted working tree |

---

## 20. Stale plan wording identified (not silently changed)

1. **§2.3 PF3-N16 line references** — cites `ProductEditor.jsx:213,220,228`. Those lines moved
   (they were `:246,:253,:261` before this block). The finding is accurate; only the line
   numbers aged. **Not edited.**
2. **The plan never names a self-exclusion parameter** while requiring editor-side validation
   through the endpoint. See §2.1. **Not edited** — reported here instead.
3. **§17's `ProductEditor` row also carries changes (a), (b), (d)** — those were completed in
   Blocks 1-3. Row (c) is what Block 4 closes. **Not edited.**
4. **`API_CONTRACT.md` §9.4** previously stated the endpoint "has no `excludeId` parameter yet
   … (deferred)". That sentence became false with this block, so it **was** corrected — a
   statement about the code I changed, not unrelated policy.
5. **Pre-existing `docs/openapi.json` drift** from Block 1's `next-id` description. Regenerating
   the file per §18/§26 swept it up; called out in §15 rather than passed off as Block 4's.

---

## 21. Explicitly unverifiable / not claimed

- **Live React behaviour.** The debounce timer, effect cleanup and re-render path are **not**
  exercised by any test — the frontend harness has no DOM. Verified instead: the extracted
  logic (unit tests), the request shape (mocked `fetch`), and the component's imports/absence
  of cache calls (static guard). A rendering harness is test infrastructure, out of scope here.
- **Concurrency.** The probe→write race is real and open. Single-process harness (plan
  Appendix B); no test simulates it and none should pretend to.
- **PostgreSQL.** Everything runs on SQLite. `func.lower()` and `WHERE id != :id` are
  dialect-neutral, but collation-sensitive comparison on the real database is unexercised.
- **Production data.** Not inspected for pre-existing duplicates; the probe reports on what is
  stored and retro-validates nothing.
- **Actual request volume in a browser.** The debounce is reasoned about and unit-tested at the
  query level, not measured against a real typist.
- **Permission granularity.** `products.view` gating is read from the route and exercised only
  through the unauthenticated case; a `products.view`-without-`products.manage` admin was not
  constructed.

---

## 22. Remaining deferred Phase 3 issues

Carried forward unchanged (none is a Block 4 regression):

1. **UNIQUE constraints on `catalog_product.sku` / `.slug`** + de-dup pass — Phase 4 §27.1.
   The only real fix for the concurrency window.
2. **Variant SKUs have no server contract** — variants are not rows; the editor's variant check
   remains local and best-effort.
3. **`GET /admin/products/availability` has no `excludeId` for variants** — moot until (2).
4. **Explicit `slug: ""` / `sku: ""` on PATCH** keeps its pre-existing no-op behaviour
   (documented in `API_CONTRACT.md` §9.2).
5. **`POST /admin/products/bulk`** cannot write `sku`/`slug`; if that whitelist ever grows it
   must adopt the Block 3 helpers.
6. Everything else in plan §4 beyond step 6 — visibility gate (7), lifecycle (8), media (9),
   collections/employee (10), response cleanup (11) — untouched by design.

---

## 23. Verdict

# PASS

All 27 acceptance criteria met. Backend **459 passed / 0 failed** (+36 and +14 subtests over
the 423 baseline), frontend **284 passed / 0 failed** (+21 over 263), `npm run build` green,
`docs/openapi.json` at zero drift, and the seven highest-risk existing suites re-run clean —
Block 3's identity suite and the `FakeDB` admin-catalogue suite both **unmodified**. The new
`excludeId` behaviour was proven to fail (6 targeted failures) against the pre-Block-4 source.

PF3-N16 is closed: the endpoint has call sites, and the session cache is no longer an authority
for product identity.

**Stopping here.** Phase 4 has not been started; no lifecycle, storefront-visibility, media,
collection, employee-contract, cache or UNIQUE-constraint work was touched. Nothing was
committed or pushed.
