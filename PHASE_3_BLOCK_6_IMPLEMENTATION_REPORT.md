# PHASE 3 — BLOCK 6 IMPLEMENTATION REPORT
## Lifecycle Hardening (plan §24 step 8 · §4 item 10 · §9.1/§9.2 · API-114/115 · PF3-N10)

**Date:** 2026-08-28 · **Branch:** `arena/01a04629-pfv1` · **Commit:** none (working tree only)
**Verdict:** ✅ **PASS**

Claim labels used throughout: **[VERIFIED]** executed and observed in this environment · **[INFERRED]** reasoned from source, not executed · **[NOT VERIFIABLE]** cannot be executed here.

---

## 1. Executive Summary

Plan §24 step 8 is one line with **four** named deliverables. All four are done, and the audit that preceded them found **two genuine, reachable data-integrity defects** that no existing test caught.

| # | Step 8 deliverable | Finding | Outcome |
|---|---|---|---|
| 1 | **enum-declared transitions** | `PRODUCT_STATUS_VALUES` and `REVIEW_STATE_VALUES` existed but were **dead constants — zero references anywhere in the codebase**. Each guard hand-rolled its own string comparison, and two of them were wrong. | ✅ **IMPLEMENTED** |
| 2 | **the full matrix test** | No transition matrix test existed. | ✅ **IMPLEMENTED** — 112 cells |
| 3 | **resolve the `change-id` cascade question** | The router still carried a literal `**BACKEND DECISION REQUIRED**: cascade to media, inventory, collection, order history`. | ✅ **RESOLVED** (no cascade needed; route restricted) |
| 4 | **declare the review-flag vocabulary** | No vocabulary; any string was accepted. The blocking set was hand-copied into **two** places. | ✅ **IMPLEMENTED** |

### The two defects

Both come from the same root cause. `approve_product` and `reject_product` guarded with:

```python
if status != "PENDING_REVIEW" and review_state != "PENDING":   # ← AND
```

That is only true when **both** axes are wrong, so a product wrong on exactly one axis walked straight through. The reachable case is `(ARCHIVED, PENDING)` — produced by **submit → archive**, two entirely legal calls, because `archive_product` deliberately does not touch the review axis.

* **L1 [VERIFIED]** — an ARCHIVED product could be **approved** (`HTTP 200`, `review.state → APPROVED`).
* **L2 [VERIFIED] — the severe one** — the same product could be **rejected**, and because `reject` writes `status = "DRAFT"`, the call **silently resurrected an archived product out of the archive**. Confirmed live: `HTTP 200`, `status ARCHIVED → DRAFT`.

Neither is hypothetical and neither needed a synthetic fixture; §22 shows the live reproduction.

### What was *not* changed

Most of the lifecycle was already correct, and per the minimum-change rule it was left alone and pinned with regression locks instead:

* **[VERIFIED]** `approve` has never published — Block 5's boundary holds, re-proved 15 ways.
* **[VERIFIED]** submit / publish / unpublish / archive / restore guards were already exactly right; the matrix test proves all five agree with the declaration without a single line changed in them.
* **[VERIFIED]** RBAC is uniform and correct on all 12 lifecycle routes.
* **[VERIFIED]** There is **no bulk lifecycle endpoint**, by design, and `status` is refused by bulk with a proper 422.
* **[VERIFIED]** `frontend/src` — **zero changes**.

**PF3-N07 remains blocked and fail-open.** §30 documents the verification.

**Movement:** backend **503 → 555 passed** (+52 tests, 166 → 529 subtests, 0 failures); frontend **310 → 342** (+32, 0 failures); build green; OpenAPI **zero drift**; **61/61** live-HTTP lifecycle checks; **no migration**, `backend/alembic/` untouched; no commit, no push.

---

## 2. Governing plan sections

Re-read in full before editing, per the standing instruction: the plan, `API_CONTRACT.md`, `PHASE_3_BLOCK_5_IMPLEMENTATION_REPORT.md`, and Blocks 1–4 for protected behaviour.

| Section | What it governs here |
|---|---|
| **§2.1** | API-114 (`status` enum contradicted; OpenAPI carries **no enum**), API-115 (`review.state` undeclared on both sides), API-116/139 (`availability` free-form) |
| **§2.3** | **PF3-N10** — "Product status vocabulary is **4 values in code, 6 in `API_CONTRACT.md`**" |
| **§4 item 10** | "Declare the status / review-state / availability vocabularies — contract + backend" |
| **§9.1** | The lifecycle diagram; the two 4-value vocabularies; *"The contract document is wrong, not the code… Phase 3 corrects the document and declares both enums; **it does not rename statuses**"* |
| **§9.2** | The endpoint table. Every row says **"unchanged"** except the two marked ⚠️: **Change ID** → *"resolve the cascade question **or restrict the route**"*; **Clear flags** → *"declare the flag vocabulary"*. Submit says *"unchanged + **declare the guard set in `API_CONTRACT.md`**"*. Declares approve *"Idempotent when already approved"* and publish *"Idempotent when already live"* |
| **§19** | *"Declare status / review / availability enums — **NO** migration — Pydantic-side"* |
| **§20** | The six lifecycle routes: *"enum-declared transitions only — **non-breaking**"* |
| **§21** | Permitted: `app/schemas/catalog/product.py` ← **enums**; `product_service.py`; `products.py`; `API_CONTRACT.md`; `docs/openapi.json`; new test `tests/unit/test_phase3_product_lifecycle.py` ← **transition matrix**; frontend test `tests/phase3ProductLifecycleUI.test.js` |
| **§22.1** | *"the full 4×4 matrix: every legal transition asserted, every illegal one asserted to 422 with the right message. Explicitly: approve ≠ publish; publish requires APPROVED; publish blocked by each `get_publish_issues` item; archive from every state; restore only from ARCHIVED; submit blocked when PUBLISHED / ARCHIVED / already-PENDING / already-APPROVED"* |
| **§24 step 8** | The four deliverables; *"Independent of the create path; **needs step 2's enums**"* |
| **§25 (14-16)** | **Lifecycle** criteria: 14 approve never publishes; 15 every illegal transition is a 422 with an actionable message; **16 `API_CONTRACT.md` §3.3 lists exactly the statuses the code implements** |
| **§26** | Exit criterion: *"The §9.2 lifecycle matrix passes, including every illegal transition"* |

### A dependency finding, reported not silently absorbed

**[VERIFIED]** Step 8 states it *"needs step 2's enums"*. **Step 2 was never executed.** Blocks 1–5 covered steps 1, 3, 4, 5, 6 and 7; step 2 (*"Declare the vocabularies… and correct `API_CONTRACT.md` §3.3. Regenerate `docs/openapi.json`"*) was skipped, which is exactly why the two vocabulary tuples sat dead in the source and §3.3 still listed six statuses.

Rather than guess at the boundary, I used the plan's own §25 headings to draw it:

* Criterion **16** (`§3.3` correction) is filed under **"Lifecycle"** → **in scope for this block, and done** (§28).
* Criterion **17** (*"`status`, `review.state` and `availability` carry declared enums in OpenAPI"*) is filed under **"Response"** → **out of scope**, deferred with a written reason (§31 item 4). It is also the risky half: `availability` is a free-form `String(30)` and typing it against legacy catalogue data is a data risk of the same family as PF3-N07, which nothing in step 8 requires taking.

---

## 3. Baseline

Recorded **before any edit**. **[VERIFIED]**

| Check | Baseline |
|---|---|
| Backend `pytest` | **503 passed, 24 skipped, 3 warnings, 166 subtests, 219.50 s** |
| Frontend `npm test` | **310 tests, 309 pass, 0 fail, 1 skip, 7.92 s** |
| `npm run build` | green |
| `docs/openapi.json` | **201/201 paths, path delta `set()`, `disk == app.openapi()` → `True`** |
| `AdminProduct.status` in OpenAPI | `{'type': 'string', 'title': 'Status', 'default': 'DRAFT'}` — **no enum** (API-114 open) |
| `git status` | 15 modified + 12 untracked — Blocks 3/4/5 artifacts, unchanged |
| `backend/alembic/` | **clean (0 entries)** |

Identical to Block 5's recorded end state, so Block 6 started from a known-good tree.

### Block 5 state confirmed intact — **[VERIFIED]**

| Property | Check | Result |
|---|---|---|
| PF3-N06 subcategory gate active | `test_phase3_product_visibility.py` | **44 passed, 58 subtests** |
| Taxonomy cache invalidation active | `TaxonomyCacheInvalidationTests` | within the above, green |
| APPROVE does not publish | probe + suite | confirmed |
| PUBLISHED requires explicit publish | probe H3/H6 | confirmed |
| **PF3-N07 remains fail-open** | `product_service.py:611,614` | `get(…, "ACTIVE")` — **unchanged** |
| Blocks 1–4 suites | 11-suite regression | green |

---

## 4. Lifecycle audit

**[VERIFIED]** by reading `product_service.py:1752-2010`, `api/v1/products.py`, and by executing a throwaway probe (`/tmp/probe_lifecycle.py`, `/tmp/probe2.py`) against the real routers before touching anything.

### 4.1 Model

| Field | Type | Default | Axis |
|---|---|---|---|
| `status` | `String(30)`, indexed | `"DRAFT"` | **visibility** — `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `ARCHIVED` |
| `published` | `Boolean` | `False` | **visibility** — kept in lock-step with `status` |
| `review.state` (JSONB) | — | `"NONE"` | **approval** — `NONE`, `PENDING`, `APPROVED`, `REJECTED` |
| `published_at` / `published_by` | timestamp / `String` | `NULL` | **audit**, written only by publish |
| `review_flags` (JSONB) | list | `[]` | **review signals**, not a status |

Two independent axes, one status enum, no redundant visibility field. **No new state field was added and none was needed.**

### 4.2 Probe results — the pre-implementation truth table

Executed against the real endpoints **before** any change. **[VERIFIED]**

| Probe | Scenario | Observed | Verdict |
|---|---|---|---|
| **H1** | ARCHIVED + review PENDING → `approve` | **200**, review → APPROVED | ❌ **DEFECT** — §9.2 says approve *"Requires PENDING"* |
| **H2** | ARCHIVED + review PENDING → `reject` | **200**, `status ARCHIVED → DRAFT` | ❌ **DEFECT (severe)** — §9.2 says *"only a submitted product can be rejected"* |
| **H7** | submit → archive → approve | **200** | ❌ confirms H1/H2 are reachable by legal calls only |
| **H3** | DRAFT + review APPROVED → `publish` | 200 | ✅ conformant — §9.2 gates publish on `review.state`, not status |
| **H4** | restore keeps APPROVED; then publish | 200 | ✅ conformant — §9.2 restore target is *"unchanged"*, silent on review |
| **H5** | publish → unpublish | `published_at`/`published_by` retained | ✅ conformant — audit fields; §9.2 silent |
| **H6** | DRAFT + review NONE → `approve` | 422 | ✅ correct |
| **H8** | `restore` twice | 200, then 422 | ✅ conformant — §9.2 declares only approve/publish idempotent |
| **H9** | clear a fabricated review flag | **200** | ⚠️ **the declared gap** — §9.2 *"no vocabulary validation"* |
| **H10** | `change-id` | changes `product_id`, **not** the PK | ⚠️ the cascade question |
| **P2-3** | two products → same `product_id` label | **200**, `GET /admin/products/ZZZ` resolves ambiguously | ❌ **DEFECT** |

**H3, H4, H5 and H8 were deliberately NOT "fixed."** Each is conformant with the plan as written, and the standing instruction is *"Do NOT infer missing lifecycle rules from general product-management conventions."* They are documented (§11, §13, §15) and asserted as-is so a future change to any of them is loud.

### 4.3 Per-operation trace

| Op | Endpoint | Auth | Requires | Result | Review | `published` | `published_at/by` | Cache |
|---|---|---|---|---|---|---|---|---|
| CREATE | `POST /admin/products/draft` | admin + `products.manage` | — | `DRAFT` | `NONE` | `false` | — | ✔ |
| SAVE | `PATCH /admin/products/{id}` | admin + `products.manage` | — | unchanged | unchanged | mirror invariant `:1669` | — | ✔ |
| SUBMIT | `POST /products/{id}/submit-review` | user + `products.manage` | `DRAFT`; review `NONE`/`REJECTED`; completeness | `PENDING_REVIEW` | `PENDING` (block reset) | `false` | — | ✔ |
| **APPROVE** | `POST /admin/products/{id}/approve` | admin + `products.manage` | `PENDING_REVIEW` + review `PENDING` | **unchanged** | `APPROVED` | **unchanged** | **untouched** | ✔ |
| REJECT | `POST /admin/products/{id}/reject` | admin + `products.manage` | `PENDING_REVIEW` + review `PENDING`; `reason` min_length 1 | `DRAFT` | `REJECTED` + reason | `false` | — | ✔ |
| PUBLISH | `POST /admin/products/{id}/publish` | admin + `products.manage` | not `ARCHIVED`; review `APPROVED`; `get_publish_issues()==[]` | `PUBLISHED` | unchanged | `true` | **both written** | ✔ |
| UNPUBLISH | `POST /admin/products/{id}/unpublish` | admin + `products.manage` | `PUBLISHED` | `DRAFT` | unchanged | `false` | **retained** | ✔ |
| ARCHIVE | `POST /admin/products/{id}/archive` | admin + `products.manage` | not `ARCHIVED` | `ARCHIVED` | **unchanged** | `false` | retained | ✔ |
| RESTORE | `POST /admin/products/{id}/restore` | admin + `products.manage` | `ARCHIVED` | `DRAFT` | **unchanged** | `false` | retained | ✔ |

Every one calls `invalidate_product_cache(p.id, p.slug)` before returning. **[VERIFIED]** by reading all seven methods.

---

## 5. Current transition matrix

The declaration now in `app/schemas/catalog/product.py:30`, `LIFECYCLE_TRANSITIONS`:

| Action | Accepted `status` | Accepted `review.state` | → `status` | → `review.state` | Idempotent |
|---|---|---|---|---|---|
| `submitReview` | `DRAFT` | `NONE`, `REJECTED` | `PENDING_REVIEW` | `PENDING` | no |
| `approve` | `PENDING_REVIEW` | `PENDING`, `APPROVED` | **`None`** | `APPROVED` | when already approved |
| `reject` | `PENDING_REVIEW` | `PENDING` | `DRAFT` | `REJECTED` | no |
| `publish` | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED` | `APPROVED` | `PUBLISHED` | `None` | when already live |
| `unpublish` | `PUBLISHED` | *not consulted* | `DRAFT` | `None` | no |
| `archive` | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED` | *not consulted* | `ARCHIVED` | `None` | no |
| `restore` | `ARCHIVED` | *not consulted* | `DRAFT` | `None` | no |

`None` on `from_review` means the action genuinely does not consult that axis — recorded explicitly rather than left ambiguous. `approve`'s `to_status: None` is the structural statement that **approve can never move the visibility axis**, and it is asserted as such (§23).

**The two axes are now checked independently.** That single change is what closes L1 and L2.

**[VERIFIED]** the declaration and the running services agree on **all 7 × 4 × 4 = 112 combinations** — `test_declared_matrix_matches_the_running_services`, 112 subtests.

---

## 6. State invariants

All **[VERIFIED]**, asserted on the **persisted row** after the transition, never on the response body.

| # | Invariant | Test | Status |
|---|---|---|---|
| 1 | `status == "PUBLISHED"` **iff** `published is True`, after *every* legal transition | `test_status_and_published_never_disagree_after_any_transition` (subtest per legal cell) | ✅ holds |
| 2 | `ARCHIVED` ⇒ `published is False` | `test_archived_products_are_never_published` | ✅ holds |
| 3 | A rejected product is never publicly visible | `test_a_rejected_product_is_never_publicly_visible` | ✅ holds |
| 4 | A rejected product cannot publish without a new review round | `test_a_rejected_product_cannot_be_published_without_a_new_review` | ✅ holds |
| 5 | **A refused transition writes nothing** | `test_every_illegal_transition_leaves_the_row_untouched` (subtest per illegal cell, snapshotting all five lifecycle columns) | ✅ holds |
| 6 | `published_at`/`published_by` written only by publish, **retained** through unpublish/archive | `test_publication_audit_fields_survive_unpublish_as_a_last_published_record` | ✅ documented as-is |
| 7 | `submit-review` resets the whole review block (no stale reviewer, no stale rejection reason) | `test_submit_review_resets_the_review_block` | ✅ holds |
| 8 | Every transition appends exactly one history entry | `test_every_transition_appends_exactly_one_history_entry` | ✅ holds |
| 9 | `status`/`published`/`review` unwritable via PATCH or bulk | `BulkLifecycleTests` ×2 | ✅ holds |

**No redundant state field was added. No new state machine was created** — `LIFECYCLE_TRANSITIONS` is a *declaration of the transitions that already existed*, consumed by a 14-line guard helper, not an FSM engine.

On invariant 6: **[INFERRED]** the retention is intentional (`published_at` = "when this was last published", an audit fact). The plan does not specify it either way, so it is asserted as observed and flagged in §31 rather than "corrected" on a convention.

---

## 7. Submit-review behaviour

**[VERIFIED]** — unchanged; the guard set is now *declared* in `API_CONTRACT.md` §11.2/§11.3 as §9.2 asks.

* **Accepts:** `status = DRAFT` **and** `review.state ∈ {NONE, REJECTED}`.
* **Refuses (422):** PUBLISHED (*"already published"*), ARCHIVED (*"Archived products cannot be submitted"*), already PENDING, already APPROVED (*"publish or return them first"*).
* **Completeness pre-check:** `name`, `sku`, `category`, `price > 0` — 422 listing what is missing. Distinct from, and weaker than, the publish gate, by design. **[VERIFIED]** `test_submit_review_enforces_the_completeness_precheck`.
* **Writes:** `status = PENDING_REVIEW`, `published = False`, and a **completely rebuilt** review block — `submittedBy`, `submittedAt`, `reviewedBy = None`, `reviewedAt = None`, `rejectionReason = ""`. So **no stale approval or stale rejection can survive a resubmission**, which is the §8 question answered directly.
* **Auth:** the one lifecycle route reachable by a non-admin — an assigned employee with `products.manage`. Customers 403, anonymous 401 (§17).

---

## 8. Approve behaviour

**[VERIFIED]** — **this is Block 5's protected boundary and it was not changed.** The only edit was replacing the broken `and` guard with the declared one; everything approve *writes* is byte-identical.

| Assertion | Result |
|---|---|
| Writes `review.state = APPROVED`, `reviewedBy`, `reviewedAt` | ✅ |
| Leaves `status` at `PENDING_REVIEW` | ✅ |
| Leaves `published` at `false` | ✅ |
| Does **not** write `published_at` | ✅ |
| Does **not** write `published_by` | ✅ |
| Does **not** trigger publish implicitly (exactly one request, never to `/publish`) | ✅ backend + frontend |
| `to_status` is structurally `None` in the declaration | ✅ `test_approve_declares_no_status_target_at_all` |
| Idempotent when already approved — 200, `reviewedAt` **not** rewritten | ✅ |
| **NEW:** refuses when `status != PENDING_REVIEW`, whatever the review axis says | ✅ L1 closed |

15 backend assertions + 6 frontend + 8 live-HTTP checks (§22 group D).

---

## 9. Reject behaviour

**[VERIFIED]** — one guard fixed, everything else unchanged.

* **Accepts:** `status = PENDING_REVIEW` **and** `review.state = PENDING`.
* **Writes:** `status = DRAFT`, `published = False`, `review.state = REJECTED`, `reviewedBy`, `reviewedAt`, `rejectionReason`.
* `reason` is required, `min_length=1`; an empty reason is a 422 **and leaves the row at `PENDING_REVIEW`** — **[VERIFIED]** `test_rejection_reason_is_recorded_and_required`.
* **A rejected product is never publicly visible** — `DRAFT` + `published=False`, so the Block 5 gate excludes it. **[VERIFIED]**
* **Resubmission path:** rejected → `submit-review` (review `REJECTED` is an accepted source state) → the review block is rebuilt, so the rejection does not linger. **[VERIFIED]**
* **No new rejection state was invented** — `REJECTED` lives on the review axis and `status` returns to `DRAFT`, exactly as §9.2 specifies.
* **NEW:** an ARCHIVED product can no longer be "rejected" back into `DRAFT` (**L2**).

---

## 10. Publish behaviour

**[VERIFIED]** — **not changed by Block 6.** Regression locks only.

* **Requires:** not `ARCHIVED`; `review.state == "APPROVED"`; `get_publish_issues() == []`.
* **Writes atomically:** `status`, `published`, `published_by`, `published_at` in one flush, so listing filters (`status`) and detail projection (`published`) cannot disagree.
* **Publish issues** — product id, real non-placeholder name, SKU, category, selling price > 0, a description, at least one cover image, and **no blocking review flag**. Returned in `details.errors`. **[VERIFIED]** per-issue subtests, plus blocking-flag and informational-flag cases.
* **Idempotent when already live** — 200, `published_at` **not** rewritten. **[VERIFIED]**
* **`DRAFT` is a legal source** when the review is still `APPROVED` (the unpublish→republish path). Conformant with §9.2, which gates publish on the review axis; documented in `API_CONTRACT.md` §11.2 and asserted.

---

## 11. Unpublish behaviour

**[VERIFIED]** — not changed.

* `PUBLISHED → DRAFT`, `published = False`. Any other source status → 422.
* **Not idempotent** — a second call is a 422. §9.2 declares no no-op here, and the standing instruction is *"Do not arbitrarily convert errors into successful no-ops."*
* `review.state` is **not** reset, so republishing does not require a second review round. Conformant (§9.2 silent); documented.
* `published_at`/`published_by` **retained** as the last-publication record (§6 invariant 6).
* **[VERIFIED]** hidden on the very next storefront request — list *and* PDP, including from a primed cache (§19).

---

## 12. Archive behaviour

**[VERIFIED]** — not changed.

* Any non-archived status → `ARCHIVED`, `published = False`. Already archived → 422.
* **Does not touch the review axis** — which is precisely what created the reachable `(ARCHIVED, PENDING)` state behind L1/L2. The fix was to make approve/reject refuse that state, **not** to make archive mutate the review axis: archiving is a visibility action and should not silently discard a review record.
* **[VERIFIED]** hidden from list and PDP on the next request.

### The Block 5 property, re-verified

**[VERIFIED]** Archiving a **taxonomy** object is a **read-time visibility gate** and does **not** mutate the product's publication row. Live walk group I (Block 5) and the Block 5 suite both confirm: archive the subcategory → the product vanishes from every storefront surface while the admin row stays `PUBLISHED` / `published=true`; restore → visible again with no republish. Block 6 changed nothing here.

---

## 13. Restore behaviour

**[VERIFIED]** — not changed. Answering §9 of the brief point by point:

| Question | Answer | Source |
|---|---|---|
| Does restore return `DRAFT`? | **Yes** — `ARCHIVED → DRAFT`, `published = False` | §9.2 |
| Does the review state reset? | **No** — `review.state` is untouched | observed (probe H4) |
| Does approval survive? | **Yes** — an archived-while-APPROVED product is restored still APPROVED | observed |
| Is a republish required? | **Yes, an explicit one.** Restore never sets `published`. But it does **not** require a fresh review round if the review is still APPROVED | observed |
| Are `published_at`/`published_by` cleared? | **No** — retained as audit | observed |
| Cache invalidated? | **Yes** — `invalidate_product_cache` | read + verified |
| Only from `ARCHIVED`? | **Yes** — anything else is 422 | verified |

**[VERIFIED]** `test_restore_does_not_republish` — after publish → archive → restore, the product is `DRAFT`/`false`, absent from the storefront list and 404 on the PDP.

The "stale approval survives restore" behaviour is **[INFERRED]** to be intentional (restoring is undoing an archive, not undoing a review) and, critically, **it cannot leak a product**: restore always sets `published = False`, so a human must still press publish. The plan does not legislate it, so it is **documented and deferred** (§31 item 2), not changed on a hunch.

---

## 14. Invalid transitions

**[VERIFIED]** Every one of the **73 illegal cells** in the 112-cell matrix returns:

* **HTTP 422**
* `error.code == "BUSINESS_RULE_VIOLATION"` — the project's existing canonical business-rule error. **No new error code, no new status code, no second error format.**
* a non-empty message naming the current state
* **`details`** present (`{}` for a plain refusal; `{"errors": [...]}` for publish issues)
* **the database row completely unchanged** — `status`, `published`, `review.state`, `published_at`, `published_by` all snapshot-compared before and after

The specific cases the brief listed:

| Transition | Result | Note |
|---|---|---|
| DRAFT → APPROVE | 422 | |
| DRAFT → PUBLISH | 422 | *"not been approved for publication yet"* |
| PENDING_REVIEW → PUBLISH without approval | 422 | |
| APPROVED → APPROVE again | **200 no-op** | §9.2 declares it idempotent — not an error |
| PUBLISHED → PUBLISH again | **200 no-op** | §9.2 declares it idempotent |
| ARCHIVED → PUBLISH | 422 | *"restore them first"* |
| **ARCHIVED → APPROVE** | **422** | ← **L1, newly closed** |
| **ARCHIVED → REJECT** | **422** | ← **L2, newly closed** |
| invalid restore (non-ARCHIVED) | 422 | |
| invalid reject (non-PENDING) | 422 | |
| invalid unpublish (non-PUBLISHED) | 422 | |

**[VERIFIED]** `test_no_lifecycle_refusal_returns_a_500` — no illegal cell produces a 5xx (plan §25 criterion 5). Every 422 body is scanned for `traceback`, `sqlalchemy`, `select `, `psycopg`, `asyncpg`: none present.

---

## 15. Idempotency

**[VERIFIED]** Exactly the semantics §9.2 declares, and no more.

| Action | Declared | Observed on a repeat | Test |
|---|---|---|---|
| `approve` | *"Idempotent when already approved"* | **200**, `reviewedAt` not rewritten | ✅ |
| `publish` | *"Idempotent when already live"* | **200**, `published_at`/`published_by` not rewritten | ✅ |
| `submitReview` | — | **422** | ✅ |
| `reject` | — | **422** | ✅ |
| `unpublish` | — | **422** | ✅ |
| `archive` | — | **422** — *"already archived"* | ✅ |
| `restore` | — | **422** | ✅ |

**No error was converted into a no-op.** The two idempotent short-circuits are now *declared* (`idempotent_when`) rather than hiding as untyped early-returns, and `test_only_the_two_declared_actions_carry_an_idempotency_marker` asserts the set is exactly `{approve, publish}` so a third cannot be added silently.

Both are **write-free**: they return the current record without touching audit fields, verified by comparing `published_at` across calls.

---

## 16. Bulk lifecycle

**[VERIFIED]** **No bulk lifecycle operation exists, and that is the contract.**

`POST /admin/products/bulk` is the only bulk route. `BULK_UPDATABLE_FIELDS` contains merchandising/content flags only; `status` is absent, and the refusal message says so explicitly: *"Status changes go through the per-product lifecycle endpoints so publish rules are enforced."*

| Requirement | Finding |
|---|---|
| Does bulk publish/archive/unpublish/approve/reject exist? | **No.** Structural test asserts no `/admin/products/bulk/{verb}` or `/admin/products/bulk-{verb}` route exists on the real router |
| Authorization | admin + `products.manage` |
| Transition rules | N/A — no lifecycle field is accepted |
| Per-item validation | unknown ids are collected into `skipped`, not fatal |
| Partial failure | reports `updatedCount` / `skipped` |
| Response shape | `{ok, updatedCount, updated, skipped}` |
| Identity fields modifiable? | **No** — `sku`/`slug`/`id` are not in `BULK_UPDATABLE_FIELDS` (Block 3/4 boundary, unchanged) |
| Publication invariants | preserved: `status`, `published`, `review`, `publishedAt`, `reviewFlags` each → 422, row untouched |

**[VERIFIED]** by `BulkLifecycleTests` (3 tests, 4 subtests) and live checks K1–K3. **Nothing was changed here** — plan §9.2 marks the bulk row *"unchanged (already correct)"*.

---

## 17. RBAC

**[VERIFIED]** by machine-extracting the dependencies from every lifecycle route in the real router:

```
POST  /products/{id}/submit-review              auth=get_current_user    perm=products.manage
POST  /admin/products/{id}/approve              auth=get_current_admin   perm=products.manage
POST  /admin/products/{id}/reject               auth=get_current_admin   perm=products.manage
POST  /admin/products/{id}/publish              auth=get_current_admin   perm=products.manage
POST  /admin/products/{id}/unpublish            auth=get_current_admin   perm=products.manage
POST  /admin/products/{id}/archive              auth=get_current_admin   perm=products.manage
POST  /admin/products/{id}/restore              auth=get_current_admin   perm=products.manage
POST  /admin/products/{id}/change-id            auth=get_current_admin   perm=products.manage
POST  /admin/products/{id}/duplicate            auth=get_current_admin   perm=products.manage
POST  /admin/products/{id}/review-flags/clear   auth=get_current_admin   perm=products.manage
POST  /admin/products/bulk                      auth=get_current_admin   perm=products.manage
GET   /admin/products/{id}/publish-issues       auth=get_current_admin   perm=products.view
```

Uniform, and an exact match for plan §9.2's auth column. **No new permission or role was created.**

* **[VERIFIED]** `test_an_anonymous_caller_cannot_move_the_lifecycle` — with the auth override removed, all seven lifecycle actions return **401/403** and the row is re-read after each to prove it did not move.
* **[VERIFIED]** `test_every_admin_lifecycle_route_demands_admin_and_products_manage` — a structural per-route subtest, so a future route that forgets the permission fails.
* **[VERIFIED]** frontend: every lifecycle wrapper resolves the **admin** token scope. The test plants an admin token *and a customer decoy* and asserts `Bearer ADMIN-TOKEN-123` on all seven calls.
* **[NOT VERIFIABLE]** the employee-assignment path (`require_assignment=True`, submit only your own product) is **not** exercised here — it needs an employee principal with an `employees_profile` row, which is Phase 5 territory. Plan §14 already records it as **[RUN]**-verified; not re-verified in this block, and not claimed.

---

## 18. Concurrency / atomicity

**[VERIFIED]** by reading all seven methods. **Step 8 does not require concurrency work, so none was invented.** Findings, documented and deferred:

| Race | Observed structure | Verdict |
|---|---|---|
| Two concurrent `publish` | Each does read → guard → write → flush with **no row lock**. Both can pass the guard; both write the same `status`/`published`, so the outcome is idempotent, but `published_at`/`published_by` are last-writer-wins. | **Benign.** No lost state. Documented, deferred. |
| `publish` racing `unpublish` | Same window; final state is last-writer-wins between two *legal* target states. | **Benign** — both are states an admin explicitly asked for. |
| `archive` racing `publish` | Publish could pass its `ARCHIVED` check just before archive commits, ending `PUBLISHED` on a row meant to be archived. **Narrow but real.** | **Deferred** — §31 item 5. Needs `SELECT … FOR UPDATE` or an optimistic-version column. §24 step 8 does not ask for it, a version column would be a **migration**, and the §18 hard-stop rule forbids creating one speculatively. |
| `approve` racing `reject` | Both require `(PENDING_REVIEW, PENDING)`; whichever commits second overwrites. No invalid end state — the row lands in a legal state either way. | **Benign.** |

**Publish itself is atomic in the sense that matters:** `status`, `published`, `published_by`, `published_at` are assigned together and flushed in one transaction, so no reader can observe a half-published row. **[VERIFIED]** `test_publish_writes_every_publication_field_together`.

**No database lock, no migration, no version column was added.**

---

## 19. Cache invalidation

**[VERIFIED]** Step 8 asks for no cache work — Block 5 already extended taxonomy invalidation, and the standing rule forbids a broad refactor. Block 6 **reuses the existing `invalidate_product_cache` path and adds nothing**, then locks it with regression tests.

| Transition | Fresh-request behaviour | Test |
|---|---|---|
| PUBLISH | appears in `/products` **and** the PDP immediately | ✅ |
| UNPUBLISH | disappears from both immediately | ✅ |
| UNPUBLISH with a **primed** PDP cache | still disappears — the stale DTO does not outlive it | ✅ `test_a_primed_pdp_cache_does_not_survive_unpublish` |
| ARCHIVE | disappears from both | ✅ |
| RESTORE | **stays hidden** — visibility returns only via an explicit publish | ✅ `test_restore_does_not_republish` |
| A **refused** transition | storefront state undisturbed | ✅ `test_an_illegal_transition_does_not_disturb_storefront_state` |

**[VERIFIED]** live over real HTTP too: E6 (published → PDP 200 on a fresh request), G4 (unpublished → 404), H10 (restored → still 404).

**Block 5's taxonomy mechanism was not duplicated or touched.**

---

## 20. Backend changes

### 20.1 `app/schemas/catalog/product.py` (+119 / −0 — entirely Block 6)

* **`LIFECYCLE_TRANSITIONS`** (`:30`) — the declared transition table: seven actions × `from_status` / `from_review` / `to_status` / `to_review` / `idempotent_when`. Built from the previously-dead `PRODUCT_STATUS_VALUES` and `REVIEW_STATE_VALUES`, which now have a consumer.
* **`REVIEW_FLAG_BLOCKING`** (9), **`REVIEW_FLAG_INFORMATIONAL`** (3), **`REVIEW_FLAG_VALUES`** (12) — the declared vocabulary, mirroring the canonical frontend `productReviewFlags.js` plus `KIDS_MIGRATION_REVIEW`, which only the backend blocking set had ever used.
* **`ClearReviewFlagsRequest.validate_flags`** — a `field_validator` rejecting unknown flags with a 422 naming them and listing the supported set.

### 20.2 `app/services/catalog/product_service.py`

* **`_lifecycle_state(p)`** (`:1752`) — normalises the two axes.
* **`_assert_transition(p, action, message)`** (`:1759`) — checks each axis **independently** against `LIFECYCLE_TRANSITIONS` and raises the existing `BusinessLogicException`. 14 lines. Its docstring records the exact defect it closes.
* **`approve_product`** — the `and` guard replaced by `_assert_transition`. **Closes L1.**
* **`reject_product`** — same. **Closes L2.**
* **`change_product_id`** — freeness check widened from `id == new_id` to `(id == new_id OR product_id == new_id) AND id != p.id`, so a duplicate label is a 409 and a self-rename is not a false conflict. Docstring replaced with the resolved cascade decision. **Closes the ambiguity.**
* **`get_publish_issues`** and **`get_metrics`** — the two hand-copied 9-element blocking-flag literals replaced with `set(REVIEW_FLAG_BLOCKING)`.

**Untouched:** `submit_for_review`, `publish_product`, `unpublish_product`, `archive_product`, `restore_product` — all five were already correct, and the matrix test proves they agree with the declaration without a line changed.

### 20.3 `app/api/v1/products.py`

Two route descriptions: `change-id` (the `**BACKEND DECISION REQUIRED**` line replaced with the resolution) and `review-flags/clear` (now lists the vocabulary). Documentation only.

---

## 21. Frontend changes

**None. Not one line of `frontend/src` was modified.**

The audit found the client already correct: seven verbs → seven distinct endpoints, `runAction` imported at module scope, responses mirrored via `withUpsert` and never anticipated, `approveProduct` carrying an explicit *"APPROVAL DOES NOT PUBLISH"* comment and never writing `PRODUCT_STATUS.PUBLISHED`. Per the standing rule, the correct output was **tests, not edits**: `frontend/tests/phase3ProductLifecycleUI.test.js` (526 lines, 32 tests).

---

## 22. Real HTTP verification

The **real `app.main:app`** under **uvicorn** — every router, all middleware, the real error handlers — over a **disposable SQLite** database, driven by real HTTP with a real bcrypt admin login and a real JWT. Not a TestClient, no dependency overrides. **No golden or production data was read or written.**

**[VERIFIED] `/tmp/walk6.py` — 61 checks, 61 passed, 0 failed.**

| Group | Checks | What it proves |
|---|---|---|
| **A** create | 2 | born `DRAFT` / `NONE` / `published=false` |
| **B** five illegal transitions from DRAFT | 6 | each 422 canonical; **row untouched after all five** |
| **C** submit | 4 | `PENDING_REVIEW`/`PENDING`; second submit 422; publish-before-approve 422 |
| **D** approve ≠ publish | 8 | review moves; `status`, `published`, `publishedAt`, `publishedBy` all stay; approve twice 200; reject-an-approved 422 |
| **E** publish | 6 | all four publication fields written; twice → 200 with `publishedAt` **not** rewritten; PDP 200 on a fresh request |
| **F** four illegal transitions from PUBLISHED | 6 | each 422; still `PUBLISHED`; storefront undisturbed |
| **G** unpublish | 5 | `DRAFT`/`false`; `publishedAt` retained; PDP 404 on a fresh request; twice → 422 |
| **H** **the Block 6 defect** | 10 | submit → archive reaches `(ARCHIVED, PENDING)`; **approve → 422 (was 200)**; **reject → 422 (was 200 + resurrected)**; row still `ARCHIVED`; restore still works; restore does **not** republish |
| **I** change-id | 5 | **primary key unchanged** (so no cascade target exists); label changed; **duplicate label → 409 (was 200)**; refusal wrote nothing |
| **J** review flags | 3 | **unknown flag → 422 `VALIDATION_ERROR` naming it (was a silent 200)**; declared flag accepted |
| **K** bulk | 3 | `status` and `published` both 422; row untouched |
| **L** leakage | 3 | no internals in any 422; canonical envelope; missing product → canonical 404 |

Group **H** is the money shot: the defect is reproduced through **legal calls only** and shown closed, against a live server, with the persisted row re-read after every step.

---

## 23. Tests added

### Backend — `tests/unit/test_phase3_product_lifecycle.py` (1,093 lines, **52 tests, 363 subtests**)

The file plan §21 names. Real routers, real services, real ORM, real RBAC rows, disposable SQLite, fresh LRU cache per test.

| Class | Tests | Focus |
|---|---|---|
| `TransitionMatrixTests` | 5 | **the 112-cell matrix**; illegal cells leave the row untouched; actionable messages; the declaration covers exactly 7 actions and only declared vocabulary values |
| `ArchivedProductGuardTests` | 4 | **L1/L2** — reached through legal calls; row not resurrected; restore still works |
| `ApproveIsNotPublishTests` | 7 | Block 5's boundary; publish prerequisites; per-publish-issue subtests; blocking vs informational flags |
| `StateInvariantTests` | 9 | the nine invariants of §6 |
| `IdempotencyTests` | 4 | the declared two vs the other five |
| `ChangeIdTests` | 5 | PK never moves; duplicate label 409; self-rename allowed; lifecycle unaffected |
| `ReviewFlagVocabularyTests` | 6 | unknown refused; all 12 accepted; blocking/informational disjoint; the publish gate consumes the declaration |
| `BulkLifecycleTests` | 3 | no bulk lifecycle, `status`/`published`/`review` refused |
| `LifecycleRbacTests` | 2 | per-route structural check; anonymous cannot mutate |
| `LifecycleCacheFreshnessTests` | 4 | publish/unpublish/archive/restore freshness; primed cache; refusals inert |
| `LifecycleResponseContractTests` | 4 | envelope per action; response matches the persisted row; canonical 404; no 5xx |

Mapped to the brief's 20 required areas:

| # | Required | Test |
|---|---|---|
| 1-7 | each transition | matrix + `LifecycleResponseContractTests::test_every_legal_transition_returns_the_product_envelope` |
| 8 | forbidden transition matrix | `test_declared_matrix_matches_the_running_services` (73 illegal cells) |
| 9 | status/published invariant | `test_status_and_published_never_disagree_after_any_transition` |
| 10 | publication audit fields | `test_publish_writes_every_publication_field_together`, `…survive_unpublish…` |
| 11 | repeated operation semantics | `IdempotencyTests` ×4 |
| 12 | unauthorized mutation | `test_an_anonymous_caller_cannot_move_the_lifecycle` |
| 13 | failed mutation leaves row unchanged | `test_every_illegal_transition_leaves_the_row_untouched` |
| 14 | publish prerequisites | `test_publish_requires_an_approved_review`, `…blocked_by_each_publish_issue` |
| 15 | storefront visibility after mutation | `LifecycleCacheFreshnessTests` |
| 16 | cache freshness | `test_a_primed_pdp_cache_does_not_survive_unpublish` |
| 17 | bulk lifecycle | `BulkLifecycleTests` ×3 |
| 18 | lifecycle response contract | `test_the_response_matches_the_persisted_row` |
| 19 | canonical business-rule envelope | `assert_canonical_422` on every refusal |
| 20 | no internal error leakage | 5 leak markers scanned; `test_no_lifecycle_refusal_returns_a_500` |

### Frontend — `tests/phase3ProductLifecycleUI.test.js` (526 lines, **32 tests**)

The file plan §21 names.

| Group | Tests | Focus |
|---|---|---|
| Distinct endpoints | 10 | one test per verb + collision check + "no verb reaches `/publish`" |
| Client proposes nothing | 3 | no `status`/`published`/`review`/`reviewFlags`/`publishedAt`/`publishedBy`; reject sends only `reason`; **admin scope resolved with a customer decoy planted** |
| Server is authoritative | 3 | state mirrored verbatim per verb; approve cannot mark published; approve never chains |
| Refusals are refusals | 5 | 422/409/404 → failure with the status preserved, the server's message surfaced, and **no product record to mirror** |
| Unknown verbs / bulk | 3 | unknown verb issues **zero** requests; no bulk lifecycle verb |
| STATIC guards | 5 | approve never writes PUBLISHED; publish refuses unapproved; `runAction` imported statically and no raw `fetch`; every wrapper passes `scope:"admin"`; no wrapper posts a status |
| Blocks 1/4/5 locks | 4 | draft + next-id routes; `excludeId`; storefront reads public; catalog store has no local gate |

**Harness limitation, stated not worked around:** `node:test`, **no DOM, no React renderer**. Component behaviour cannot be executed; those requirements are covered by static source guards labelled `STATIC:` and reported as **NOT VERIFIABLE** in §33. **A DOM/React framework was deliberately not added.**

---

## 24. Mutation check

Each Block 6 change reverted in isolation, focused suite re-run, change restored immediately from a byte-for-byte backup and re-verified.

### M1 — restore the `and`-combined approve/reject guards

**Result: 24 failed / 50 passed** (2 methods + 22 subtests). Every failure is an approve/reject cell:

```
ArchivedProductGuardTests::test_archived_product_with_a_pending_review_cannot_be_approved  ← NEW
ArchivedProductGuardTests::test_archived_product_with_a_pending_review_cannot_be_rejected  ← NEW
+ 22 subtests in test_every_illegal_transition_leaves_the_row_untouched:
    approve from (PENDING_REVIEW, REJECTED), (PUBLISHED, PENDING), (ARCHIVED, PENDING)
    reject  from (DRAFT, PENDING), (PENDING_REVIEW, NONE|APPROVED|REJECTED),
                 (PUBLISHED, PENDING), (ARCHIVED, PENDING)
```

Note the matrix caught cells I had not hand-written — `reject` from `(DRAFT, PENDING)` and `(PENDING_REVIEW, NONE)` among them. That is the point of a declared matrix.

### M2 — revert the change-id freeness check to primary-key-only

**Result: 2 failed / 50 passed**

```
ChangeIdTests::test_change_id_rejects_a_label_taken_by_another_products_label   ← NEW
ChangeIdTests::test_change_id_to_its_own_current_label_is_not_a_self_conflict
```

### M3 — delete the review-flag validator

**Result: 1 failed / 51 passed**

```
ReviewFlagVocabularyTests::test_an_unknown_flag_is_refused_and_names_itself     ← NEW
```

### Restoration

**[VERIFIED]** both source files `diff`-identical to their backups; `grep -c MUTATION` → 0 in each; suite back to **52 passed / 363 subtests**.

### NEW BEHAVIOUR vs REGRESSION LOCK

| Category | Count |
|---|---|
| **NEW BEHAVIOUR** — fails on reverted code | **5 distinct methods + 22 subtests** (M1: 2+22, M2: 2, M3: 1) |
| **REGRESSION LOCK** — passes on reverted code | **47 of 52** backend methods, **32 of 32** frontend tests |

Stated plainly: **90% of the backend suite and the entire frontend suite are regression locks, not proof of new work.** That is the honest shape of a block whose audit found most of the lifecycle already correct.

---

## 25. Full test results

| Suite | Baseline | After | Δ |
|---|---|---|---|
| **Backend `pytest`** | 503 passed, 24 skipped, 3 warnings, 166 subtests, 219.50 s | **555 passed, 24 skipped, 3 warnings, 529 subtests, 238.79 s** | **+52 tests, +363 subtests, 0 failures** |
| **Frontend `npm test`** | 310 tests, 309 pass, 1 skip, 7.92 s | **342 tests, 341 pass, 0 fail, 1 skip, 9.74 s** | **+32 tests, 0 failures** |
| **`npm run build`** | green | **green, 10.37 s**, `dist/index.html` 2,804.24 kB / gzip 968.29 kB | unchanged |
| **New backend suite alone** | — | **52 passed, 363 subtests, 60.02 s** | — |
| **New frontend suite alone** | — | **32 passed, 0 failed** | — |
| **Live HTTP walk** | — | **61/61** | — |
| **`docs/openapi.json`** | 201 paths, `EQUAL: True` | **201 paths, path delta `set()`, `EQUAL: True`** | **zero drift** |
| **`backend/alembic/`** | clean | **clean** | — |

The 1 frontend skip and the 24 backend skips are pre-existing and unchanged (Phase 6 real-media dataset and PostgreSQL-integrity suites, which skip by design when the dataset/server is absent).

---

## 26. Regression results

Targeted run of every protected suite:

```
tests/unit/test_api_contract.py                 (Phase 1 API contract)
tests/unit/test_phase3_product_id.py            (Block 1 — product ID)
tests/unit/test_phase3_product_taxonomy.py      (Block 2 — taxonomy / 422)
tests/unit/test_phase3_product_identity.py      (Block 3 — SKU/slug 409)
tests/unit/test_phase3_product_availability.py  (Block 4 — availability / excludeId)
tests/unit/test_phase3_product_visibility.py    (Block 5 — subcategory gate, cache, 404)
tests/unit/test_phase5_admin_catalogue.py       (Phase 5 admin catalogue FakeDB)
tests/unit/test_phase7_media_lifecycle.py       (Phase 7 media lifecycle)
tests/unit/test_phase3_error_envelope.py        (canonical envelope)
tests/unit/test_taxonomy_contract.py            (taxonomy contract)
tests/unit/test_admin_category_detail.py        (admin category detail)

→ 280 passed, 72 subtests passed, 0 failed, 161.02 s
```

Frontend, per suite: `apiContract` 12/12 · `phase3ProductCreate` 5/5 · `phase3ProductTaxonomy` 7/7 · `phase3ProductIdentity` 12/12 · `phase3ProductAvailability` 21/21 · `phase3ProductVisibility` 25/25 · `phase3ProductLifecycleUI` 32/32 — **0 failures**.

**No existing test was weakened, skipped, deleted or modified.** `git status` shows the only modified test files remain the three carried from Blocks 1–4; Block 6 touched none of them.

---

## 27. Static lifecycle audit

Repo-wide search for lifecycle mutations and state comparisons.

### Product lifecycle writes — `status` / `published` / `review` / audit fields

| Location | Classification |
|---|---|
| `product_service.py:1834-1836` (`submit_for_review`) | ✅ **authoritative** |
| `product_service.py:1871` (`approve_product`) | ✅ **authoritative** — review axis only |
| `product_service.py:1899-1901` (`reject_product`) | ✅ **authoritative** |
| `product_service.py:1946-1949` (`publish_product`) | ✅ **authoritative** — all four fields together |
| `product_service.py:1963-1964` (`unpublish_product`) | ✅ **authoritative** |
| `product_service.py:1975-1976` (`archive_product`) | ✅ **authoritative** |
| `product_service.py:1989-1990` (`restore_product`) | ✅ **authoritative** |
| `product_service.py:1669` `p.published = p.status == "PUBLISHED"` | ✅ **the mirror invariant** on the PATCH path — intentionally retained; it is what makes §6 invariant 1 hold |
| `product_service.py:2348` `p.review_flags = new_flags` | ✅ **authoritative** — the only flag write |

**Every product lifecycle write in the entire backend is inside `product_service.py`.** No router, no other service, no script writes product lifecycle state directly. **[VERIFIED]** by exhaustive grep.

### Out-of-scope status writes (different domains, correctly separate)

`category_service.py` (6), `collection_service.py` (4), `employee_service.py` (4), `order_service.py` (2), `return_service.py` (7), `payment_service.py` (10), `local_media_migration.py` (10). **Intentionally retained** — these are category, collection, employee, order, return, payment and media-migration lifecycles, each with its own vocabulary. None touches `catalog_product.status`.

### Transition-logic consumers

| Location | Classification |
|---|---|
| `schemas/catalog/product.py:30` `LIFECYCLE_TRANSITIONS` | ✅ **the single declaration** |
| `product_service.py:1773` (`_assert_transition`) | ✅ the only enforcement helper |
| `product_service.py:1864` (approve), `:1893` (reject) | ✅ its two call sites |
| `submit`/`publish`/`unpublish`/`archive`/`restore` guards | ⚠️ **duplicated but verified-equivalent.** Each keeps its own specific, better-worded message rather than the generic one. Deliberately **not** rewritten (minimum change) — the 112-cell matrix test proves each agrees with the declaration, so drift is caught by test rather than by refactor |
| *(removed)* two hand-copied 9-element blocking-flag literals | ✅ **stale duplication, deleted** after tracing both callers; a structural test now fails if either reappears |

### Frontend

| Location | Classification |
|---|---|
| `services/admin/productAdminService.js` `ACTIONS` | ✅ **authoritative client mapping** — 11 verbs → 11 endpoints, no lifecycle logic |
| `services/workflow/productWorkflowCommands.js:586,613` | ⚠️ **local-only lifecycle command layer** (employee portal). Writes `PRODUCT_STATUS.PUBLISHED`/`ARCHIVED` to the **local register**, not the server. Plan §21 explicitly scopes it: *"Local lifecycle commands, **employee portal only** — the employee surface is Phase 5."* **Intentionally retained**, out of Block 6 scope; pinned by a static guard that `approveProduct` never writes `PUBLISHED` |
| `services/productWorkflow.js:815-818`, `catalogRepository.js:906-907` | ✅ **read-only** — metric bucketing and a status→command label map |
| `services/productReviewFlags.js` | ✅ **the canonical flag vocabulary**, which the backend declaration now mirrors |
| admin/employee status badges, tone maps, filter dropdowns | ✅ **display only** |

**Nothing was deleted before its callers were traced.** The only deletions are the two duplicated flag literals, both call sites rewritten in the same change.

---

## 28. API contract / OpenAPI impact

**No endpoint added, removed or renamed. No request or response schema changed.** Two behavioural narrowings (unknown review flag → 422; duplicate `product_id` → 409) plus documentation.

### `API_CONTRACT.md`

* **§3.3 corrected — acceptance criterion 16, and the close of PF3-N10 / API-114 / API-115.** Product Status now lists the four the code implements. A **Product Review State** enum is declared for the first time. A note records what changed and why (*"the document was wrong, not the code"*), and that no status was renamed. The review-flag vocabulary is declared with its blocking/informational split.
* **New §11 "Product Lifecycle Transitions"** (7 subsections, ~136 lines): the two axes and the diagram; **§11.2 the declared transition table** — the *"declare the guard set"* item from §9.2; §11.3 the additional submit and publish gates; §11.4 invalid transitions and the idempotency split; §11.5 the five invariants; §11.6 authorization; §11.7 the change-id resolution.
* File 543 → **679 lines**.

### `docs/openapi.json`

Regenerated from `app.openapi()`, never hand-edited. **Drift check: 201/201 paths, path delta `set()`, and the on-disk document compares `==` to the live spec.** The diff carries the two Block 6 description strings plus the Block 4/5 entries already pending in this working tree.

**Not done, deliberately:** OpenAPI `enum` constraints on `status` / `review.state` / `availability` (criterion 17). That is a **Response** criterion belonging to step 2/11, and `availability` is a free-form `String(30)` whose legacy values are unknown without the step 0 reconciliation. Deferred with reason — §31 item 4.

---

## 29. Migration decision

### **NO MIGRATION CREATED.**

**[VERIFIED]** `git status --short backend/alembic/` returns nothing.

Plan §19 is explicit for every change in this block:

* *"Declare status / review / availability enums — **NO** — **Pydantic-side**. `status` is `String(30)`, `availability` `String(30)` — already wide enough."*
* The transition guards are service-layer predicates; §19 lists no schema row for them.
* The review-flag vocabulary is request validation against a JSONB column.
* The change-id fix is **a `SELECT` before a write** — precisely the pattern §19 approves for SKU/slug (*"A `SELECT` before insert. No constraint needed."*).

**No schema change appeared necessary at any point**, so the §18 hard-stop was not triggered. Explicitly **not** done: no UNIQUE constraint on `product_id` (that is the Phase 4 family alongside `sku`/`slug`), no version column for the archive-vs-publish race (§18), no `catalog_product` alteration of any kind.

---

## 30. PF3-N07 status

### **BLOCKED AND UNCHANGED — verified, not assumed.**

**[VERIFIED]** the predicate at `product_service.py:611,614` is byte-for-byte what Block 5 left:

```python
if category_status_map.get(product.category, "ACTIVE") != "ACTIVE":
    return False
subcategory = (product.subcategory or "").strip()
if subcategory and subcategory_status_map.get(subcategory, "ACTIVE") != "ACTIVE":
    return False
```

Both defaults are still **`"ACTIVE"`** — **fail-open**. The flip was **not** performed.

**[VERIFIED]** Block 5's `FailOpenDefaultTests` (4 tests asserting the current fail-open behaviour so a flip cannot be silent) still pass; the whole visibility suite is **44 passed / 58 subtests**.

**Step 8 did not touch this predicate.** Lifecycle transitions live on `status`/`review.state`; the taxonomy visibility gate is a storefront read filter. There is no overlap, so the §26 hard-stop for *"Step 8 requires changing PF3-N07"* was **not** triggered — and no conflict to report.

The blocker is unchanged from the Block 5 report §23: plan §24 step 7 permits the flip *"only after the step 0 report is reviewed"*, §23 R1 says *"Never flip the default blind"*, and step 0 is a `SELECT DISTINCT` over the real PostgreSQL catalogue, which this sandbox does not have (plan Appendix B). The unblocking query is in the Block 5 report §23.2. **No PostgreSQL reconciliation was guessed at or simulated.**

---

## 31. Risks / deferred work

| # | Item | Likelihood | Impact | Disposition |
|---|---|---|---|---|
| **R-A** | **Approve/reject now refuse `(ARCHIVED, PENDING)`.** Any caller that relied on the old behaviour breaks. | Low | Low | **Intended** — it is the defect. The old "success" corrupted data. `restore` remains the way out and is asserted. §20 marks these routes *"enum-declared transitions only — non-breaking"*, and the change only removes states that were never legal. |
| **R-B** | **`review-flags/clear` now 422s an unknown flag.** A caller clearing a legacy flag outside the 12 gets an error instead of a silent 200. | Low | Low | **Intended** — §9.2 asks for it. The old 200 was a lie: it cleared nothing. All 12 known values are accepted. |
| **R-C** | **`change-id` now 409s a duplicate label.** | Very low | Low | **Intended.** The old behaviour produced ambiguous `_get_or_404` results. Self-rename is explicitly still allowed. |
| **R-D** | **Archive-racing-publish** can leave a row `PUBLISHED` that an admin meant to archive. | Low | Medium | **Deferred** — §18. Needs row locking or a version column (a migration). Step 8 does not require it; the §18 hard-stop forbids creating one speculatively. |
| **R-E** | **Stale approval survives archive→restore and unpublish**, so republishing needs no second review round. | Medium | Low | **Documented, deferred.** Conformant with §9.2 as written; cannot leak a product (both paths force `published=False`, so a human must still press publish). Changing it would be inventing a rule the plan does not state. |
| **R-F** | `published_at`/`published_by` retained after unpublish/archive. | — | Low | **Documented** as audit-field semantics, asserted as-is. |
| **R-G** | The five already-correct guards keep their own messages rather than routing through `_assert_transition`. | Low | Low | **Intentional** (minimum change + better messages). Drift is caught by the 112-cell matrix, not by hope. |
| **R-H** | Backend blocking flags include `KIDS_MIGRATION_REVIEW`; the frontend's `PUBLISH_BLOCKING_FLAGS` does not. | Low | Low | **Reported, not changed.** The backend gate is authoritative; the frontend list is a pre-check. Harmonising it is a frontend-vocabulary task outside step 8. |

### Deferred Phase 3 items (carried forward + new)

| # | Item | Target |
|---|---|---|
| 1 | UNIQUE constraints on `sku`/`slug` + de-duplication; the probe→write race | Phase 4 |
| 2 | Variant identity contract; variant `excludeId` | Phase 4 |
| 3 | `slug:""` / `sku:""` PATCH no-op; bulk cannot write sku/slug | Phase 4 |
| **4** | **OpenAPI `enum` on `status` / `review.state` / `availability`** (criterion 17). A **Response** criterion, not a Lifecycle one. `availability` is free-form `String(30)`; typing it against unknown legacy values is a PF3-N07-class data risk. **The two status vocabularies are now declared in code and in `API_CONTRACT.md`, so the remaining work is only the OpenAPI annotation.** | **plan step 2 / step 11** |
| **5** | **Archive-vs-publish race** (R-D) | later phase; needs a schema decision |
| **6** | **Stale approval across restore/unpublish** (R-E) | needs a plan ruling |
| **7** | **Frontend/backend blocking-flag divergence** (R-H) | step 11 |
| 8 | PF3-N07 fail-closed default; **step 0 reconciliation** | blocked on PostgreSQL |
| 9 | Counts (`resolvedProductCount`, taxonomy counts) skip the taxonomy gate | step 11 / Phase 4 |
| 10 | Cart/wishlist/order purchasability skips the taxonomy gate | later phase |
| 11 | Legacy `queryCatalogue` client-side filter | step 11 |
| 12 | **Plan steps 9, 10, 11 untouched by design** — media honesty, collections/employee contract, response cleanup + integration suite | Blocks 7–9 |

---

## 32. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| **14** | `approve` never publishes; `publish` requires `review.state=APPROVED` and empty `get_publish_issues()` | ✅ **MET** — unchanged, now locked by 15 backend + 6 frontend + 8 live checks |
| **15** | Every illegal transition returns 422 with an actionable message | ✅ **MET** — all **73** illegal cells, each also proved to write nothing |
| **16** | `API_CONTRACT.md` §3.3 lists exactly the statuses the code implements | ✅ **MET** — six → four; review-state enum added; **PF3-N10 / API-114 / API-115 closed** |
| 17 | `status`/`review.state`/`availability` carry declared enums **in OpenAPI** | ⛔ **NOT MET — deliberately.** A *Response* criterion (step 2/11); §31 item 4 |
| **19** | `docs/openapi.json` matches the live app (0 path delta, 0 property delta) | ✅ **MET** |
| **21** | No Alembic revision; no PostgreSQL object altered | ✅ **MET** |
| **22** | Backend ≥ 333 passing, frontend ≥ 239 passing, 0 failures | ✅ **MET** — 555 / 342 |
| **23** | `apiClient` calls 100% explicitly scoped | ✅ **MET** — asserted with a customer-token decoy |
| **26** | *"The §9.2 lifecycle matrix passes, including every illegal transition"* | ✅ **MET** — the exit criterion this block exists to satisfy |

Block-6-specific requirements from the brief:

| Requirement | Status |
|---|---|
| ≥20 backend test areas covered | ✅ 52 tests / 363 subtests, mapped 1:1 in §23 |
| Frontend tests, no DOM framework added | ✅ 32, limitation stated |
| Mutation check separating new behaviour from locks | ✅ §24 — 3 mutations, all killed their targets, all restored |
| Real HTTP lifecycle walk | ✅ §22 — 61/61 |
| No migration | ✅ §29 |
| PF3-N07 untouched | ✅ §30 — verified, not assumed |
| Blocks 1–5 green | ✅ §26 |
| No golden/production data touched | ✅ throwaway SQLite only |

---

## 33. NOT VERIFIABLE items

**[NOT VERIFIABLE IN THIS ENVIRONMENT]** — listed so nothing is mistaken for a verified claim:

1. **Browser/DOM interaction.** No headless browser, no Playwright/Puppeteer, no `jsdom`/`happy-dom`, no `@testing-library` exists here, and none was installed. Not executed: rendering the admin desk; clicking Approve / Publish / Archive / Restore; observing disabled states or optimistic UI; a browser hard refresh; a fresh tab. The *server* side of each was verified over real HTTP and the *client* side by static source guards — **that is not the same thing.**
2. **Employee-principal submit-review.** The `require_assignment=True` path (an employee submitting only their own assigned product) needs an employee profile row; not exercised. Plan §14 records it as previously `[RUN]`-verified; not re-verified here.
3. **True concurrency.** The races in §18 were identified by **reading** the code. No parallel-request test was run — the async test harness is single-threaded against one SQLite file, which cannot reproduce them faithfully. **[INFERRED]**, explicitly not measured.
4. **PostgreSQL behaviour.** Everything ran on SQLite with a `JSONB → JSON` shim. The guards are pure Python over already-fetched rows, so dialect is not implicated — but that is inference.
5. **Real Redis.** The KV layer is the in-process LRU shim. Invalidation calls are identical; a real Redis `SCAN` was not measured.
6. **Step 0 reconciliation.** Impossible here (§30). The size of the fail-open population in the real catalogue remains unknown, and no estimate is offered.
7. **`change-id` cascade, empirically.** That the primary key never moves is **[VERIFIED]** directly. That *no downstream table keys on `product_id` rather than `id`* is **[INFERRED]** from schema reading (`media_product_media.product_id` → the PK, order lines → the PK). A full FK sweep across every domain was not performed.

---

## 34. Final verdict

# ✅ PASS

All four of step 8's named deliverables are implemented, proved by mutation, and locked by 84 new tests (52 backend + 32 frontend, 363 subtests) plus a 61-check live-HTTP walk of the full lifecycle against the real application.

**Concretely:**

* ✅ **Transitions are declared** — `LIFECYCLE_TRANSITIONS` gives the two previously-dead vocabulary tuples a consumer, and the running services are proved to agree with it on **all 112** (action × status × review) combinations.
* ✅ **Two real, reachable defects closed** — an ARCHIVED product could be approved, and worse, "rejected" **straight back out of the archive into DRAFT**. Both reproduced through legal calls only, both fixed by checking the two lifecycle axes independently, both proved dead by mutation.
* ✅ **The change-id cascade question resolved** — no cascade is required because the route never moves the primary key; the actual hazard (duplicate display labels making admin lookups ambiguous) is closed with a service-layer 409, no constraint, no migration.
* ✅ **The review-flag vocabulary declared** — 9 blocking + 3 informational, in one place, consumed by the publish gate and the metrics counter that each used to hand-copy it.
* ✅ **`API_CONTRACT.md` §3.3 corrected** — six statuses → four, review-state enum declared, closing **PF3-N10 / API-114 / API-115** and acceptance criterion 16.
* ✅ **Approve ≠ publish re-proved and not weakened.** Most of the lifecycle was already right and was **left alone** — 47 of 52 backend tests and all 32 frontend tests are regression locks, and this report says so rather than counting them as new work.
* ✅ Backend 503 → 555 (0 failures). Frontend 310 → 342 (0 failures). Build green. OpenAPI zero drift. Blocks 1–5 green, no existing test modified.
* ✅ **No migration.** `backend/alembic/` untouched. No golden or production data read or written — every row lived in a per-test throwaway SQLite file or one disposable verification database under `/tmp`.
* ⛔ **PF3-N07 untouched and still fail-open**, verified at the predicate and by Block 5's 44-test suite.
* ⛔ OpenAPI enum annotations (criterion 17) deliberately deferred as step 2/11 work, with the `availability` data risk stated.
* **No commit. No push. No Phase 4.**

**Stopping here for review.**
