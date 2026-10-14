# Phase 6 Review · Recovery of the lost Phase 4 and Phase 5 test suites

**Branch** `arena/649fd845-pfv1` · **tree** `10890db` + the Phase 3/4/5/6 working changes (uncommitted, as the
directive requires) · **scope** the nine Phase 4 shopping-journey tests and the eleven Phase 5
checkout-contract tests, recovered and re-homed · **no commit, no push, no PR** — this document is the
deliverable and stops for approval before Phase 7.

> **Directive obeyed:** recover the suites from existing evidence, prior artifacts or the original
> definitions and **document the source of every assertion**; place them in **non-ignored** locations
> **without touching either `.gitignore`**; preserve every Phase 4/5 production fix; run the recovered and
> relevant existing suites, **separating passing tests from tests blocked by unavailable infrastructure**;
> verify `aarna-port --check`, the Phase 6 suite, the frontend build and `git diff --check`. No production
> code, backend contract, UI design, route or production default was modified in this task.

---

## 1 · Why the suites were lost — root cause, proven

The two suites were *created* in directories the repository ignores:

| Path written | Ignore rule that swallowed it | Proof |
|---|---|---|
| `frontend/tests/phase4ShoppingJourney.test.js` | `frontend/.gitignore:23:tests/` | `git check-ignore -v` on the old path |
| `backend/tests/integration/test_phase5_checkout_contract_flow.py` | `backend/.gitignore:55:tests/` | `git check-ignore -v` on the old path |

A newly created file inside an ignored directory never enters the workspace snapshot, so both died with the
next recycle. This is **not** a code loss: the production fixes they pinned are all present and green (see
§5) — only the test bodies were lost, and no copy survived anywhere: a filesystem + `/tmp` sweep found
nothing, `coding.patch`/`numstat` never contain gitignored files, and the design-philosophy docs mention the
suites but not their source (`grep -rn "phase4ShoppingJourney\|phase5_checkout_contract"` → docs only).

**Neither ignore file was edited** (the directive forbids it). The recovery's structural half is therefore a
change of *location*, not of policy.

---

## 2 · Where the recovered suites live now

| Suite | Recovered path | Ignored? | Why here |
|---|---|---|---|
| Phase 4 · 9 tests | `frontend/src/utils/__tests__/phase4ShoppingJourney.test.js` | **no** | the port's own suites already live under `src/**/__tests__`, which the ignore policy does not touch, and which the standing regression command `node --test "src/**/__tests__/*.test.js"` already collects |
| Phase 5 · 11 tests | `backend/tests_recovery/test_phase5_checkout_contract_flow.py` | **no** | `backend/.gitignore` ignores `tests/` by *name*; a differently named directory is untouched by it |

`git status --porcelain --untracked-files=all` now lists both files as untracked-but-visible (`??`), i.e.
they will be carried in the next snapshot. `git check-ignore -v` exits **1 (not ignored)** for both.

`backend/pyproject.toml`'s `testpaths = ["tests"]` was deliberately **not** edited either: the recovered
suite is invoked by path (command in §8) so that a bare `pytest` run keeps behaving exactly as before.
`backend/tests/integration/test_phase3_step11c_*` is pre-existing production test infrastructure and was
left where it is.

---

## 3 · Phase 4 suite — 9 tests, and the source behind each one

The original file's test *names* and the intent of each are recorded in
`docs/PHASE-4-CUSTOMER-SHOPPING-JOURNEY.md` §1 (defects 1–5, root causes, the fix each defect got) and §4
(the nine-test table with the per-test failure mode). Each assertion below was then read back out of the
**production source on disk** at recovery time — no replacement assertion was invented, and no test asserts
anything the Phase 4 report does not describe.

| # | Test (recovered name) | Pins | Source of the assertion |
|---|---|---|---|
| 1 | `a coupon that carries only a code prices the cart instead of throwing` | a guest coupon (`{ code }`) prices to a real total with `couponDiscount: 0` and never throws `coupon.appliesTo is not a function` | Phase 4 §1 **Defect 1** (the exact `TypeError`, blank `<div id="root">`), §4 test 1 |
| 2 | `eligibility is asked of the coupon when it has a rule, and never crashes when it does not` | `couponCoversProduct`: a predicate decides for itself; **no predicate narrows nothing**; `null` coupon covers nothing; a null product answers false through the register's own guard | Phase 4 §1 Defect 1's fix wording ("a coupon that carries none narrows nothing"), `utils/shopping.js::couponCoversProduct` as shipped |
| 3 | `toCheckoutCoupon carries the backend offer model's product rule` | `toCheckoutCoupon` attaches `appliesTo = isProductEligible(offer, product)`, keeps the summary/validity fields, `null → null` | Phase 4 §1 **Defect 2** (the register's rule "lived only in the repository"), §4 |
| 4 | `exclusions and unscoped offers keep the register's meaning` | exclusions first (product/category/collection), then `ALL_PRODUCTS` / `SPECIFIC_PRODUCTS` / `CATEGORY` / `COLLECTION` | Phase 4 §1 Defect 2 + `offerRepository.js::isProductExcluded` / `isProductEligible` |
| 5 | `a scoped coupon discounts only the lines it covers` | ₹37,800 of covered sarees → ₹3,780 discount vs. ₹4,800 unscoped over ₹48,000; total = subtotal − coupon + shipping | Phase 4 §4's "discount computed only across the covered lines"; `utils/shopping.js::calculateCouponDiscount` |
| 6 | `a piece the catalogue cannot sell is refused, and nothing is written to the bag` | `getMaxQuantity(unavailable) === 0`; the cart's guest path refuses with the product page's own sentence **before** `setLines` | Phase 4 §1 **Defect 3** (toast with badge at 0), `context/CartContext.jsx` refusal block, §4 |
| 7 | `a sellable piece is still added, with and without a variant group` | the counterweight: stock ceiling, clamp up/down, `requiresVariantChoice`, `defaultSelection` skipping unavailable colours, line merging | Phase 4 §4 ("the guard must not make the cart timid"); `utils/shopping.js` |
| 8 | `the card's add confirmation only fires when the add happened` | `useAddToBag` awaits the outcome and stands down on `ok === false`; the refusal reaches the customer as the cart's message | Phase 4 §1 **Defect 4**, the `add-to-bag-feedback` rewrite, §4 |
| 9 | `the bag drawer awaits the register's answer and states the amount honestly` | `await applyPromo(code)`; the honest note keyed on `totals.priced` (server-priced vs. guest); `priced` threaded cart → `ShopContext` → drawer | Phase 4 §1 **Defect 5** (a) and (b), the measured `msg: "UTSAV10 applied — 10% OFF."` / `is-ok` state |

**Result: `# tests 9 · # pass 9 · # fail 0`** — `.p4/evidence/recovered-phase4-AFTER.txt`.

**Honest labelling of what kind of test these are.** Tests 1–5 and 7 are pure behaviour: they execute the
real pricing and eligibility functions. Tests 6, 8 and 9 also pin *wiring* that lives inside React hooks and
context, and this tree has **no DOM implementation** (no jsdom; the same limitation the port's own suites
document). They therefore assert the exact lines that changed rather than a rendered DOM, and the rendered
behaviour stays evidenced where it was actually measured: the Phase 4 browser probe in `.p4/evidence/`
(16 scenarios, 0 threw, 0 page errors, desktop + mobile screenshots). These nine tests are *not* a
replacement for that browser evidence and are not claimed to be.

---

## 4 · Phase 5 suite — 11 tests, and the source behind each one

The original file's **class name** (`CheckoutContractFlow`), its run output and its two pinned failures
survive in `.p5/evidence/integration-BEFORE-fixes.txt` and `-AFTER-fixes.txt`; all eleven test names and
what each proves are in `docs/PHASE-5-BACKEND-CONTRACT-CHECKOUT-AUDIT.md` §6, with the two production
defects in §4. Payload shapes come from the storefront's own client (`frontend/src/services/api/paymentsApi.js`,
snake_case). The harness follows the repository's existing real-router integration idiom
(`tests/integration/test_phase3_step11c_*`).

| # | Test | What it proves | Source |
|---|---|---|---|
| 1 | `test_cart_totals_apply_the_documented_shipping_and_cod_rules` | ₹99 below threshold / ₹199 express / ₹0 + ₹49 COD; a query-string `total=1` cannot move the total | §6 row 1–3; `order_service._compute_shipping` / `_compute_cod_fee`, `cart_service.get_totals` |
| 2 | `test_cart_totals_are_free_at_the_threshold` | exactly ₹5,000 ships free | §6 row 4 |
| 3 | `test_place_order_ignores_client_supplied_amounts` | client ₹2,599 / stock −1 / `PENDING_PAYMENT` are overridden by the server | §6 row 5 |
| 4 | `test_place_order_recomputes_the_coupon_authoritatively` | `UTSAV10` re-priced server-side: ₹250 → ₹99 → ₹2,349 | §6 row 6 |
| 5 | `test_out_of_stock_is_refused_and_stock_is_not_touched` | 4xx and stock unchanged under `with_for_update()` | §6 row 7 |
| 6 | `test_a_replayed_attempt_returns_the_same_order` | idempotency: same `PF-ORD-<sha1(key)[:6]>`, one order | §6 row 8 + **Defect 2** (`MissingGreenlet`) — the failure the original run pinned (`500 != 201`) |
| 7 | `test_payment_session_charges_the_order_total` | session = total × 100 paise; resuming does not duplicate | §6 row 9 |
| 8 | `test_a_bad_signature_never_marks_the_order_paid` | wrong HMAC → 422 **and** the order stays `PENDING_PAYMENT` | §6 row 9; `payment_service` HMAC path |
| 9 | `test_a_configured_signature_is_accepted_and_marks_the_order_paid` | correct HMAC over `"{order_id}\|{payment_id}"` with the configured test secret → `PAID` | §6 row 9 |
| 10 | `test_cancelling_a_session_accepts_the_guest_email_the_storefront_sends` | snake_case `guestEmail` → 200 + `CANCELLED` | §6 row 10 + **Defect 1** (`populate_by_name`), the original `403 != 200` |
| 11 | `test_order_retrieval_is_owner_only` | another customer cannot read the order | §6 row 11 |

**Provenance of the harness itself (so nobody has to guess):** real `app.main:app` and its full router
graph; injected only `get_db` (throwaway SQLite attached as the `pratikshya` schema, with the production
commit/rollback semantics) and the authenticated user — `get_current_user` **and** `get_optional_user`,
because `POST /orders` reads the optional dependency; **stubbed**: the Razorpay SDK only
(`_build_razorpay_client` → in-process fake; `settings.RAZORPAY_KEY_SECRET` set to a local test string).
That is the same honest boundary the original documented: not end-to-end, no live gateway, no real capture.

**Result: `11 passed, 2 warnings in 14.01s`** — `.p5/evidence/recovered-integration-AFTER.txt`, run from the
new path (`pytest --collect-only tests_recovery/` → `11 tests collected`).

---

## 5 · Revert proof — the suites fail when the fixes are undone

A regression suite that passes on both the fixed and the broken code pins nothing, so both suites were run
against **reverted copies of the production fixes in throwaway sandboxes** (`/tmp`, deleted afterwards; the
repository never entered a broken state — verified: `git status backend/app` shows only the two expected
Phase 5 modifications).

**Phase 4** — five fixes undone in a copy of `frontend/src` (`couponCoversProduct` → unconditional
`coupon.appliesTo(...)`; `toCheckoutCoupon` without the predicate; the cart's refusal removed;
`useAddToBag`'s unconditional toast restored; the drawer back to a non-awaited `applyPromo` and an
`is-err`-style note):

```
not ok 1 … 6, 8, 9          # pass 1 · # fail 8
```

The single survivor is test 7, the *sellable* counterweight — exactly right: it pins the behaviour the fix
must not break. Evidence: `.p4/evidence/recovered-phase4-REVERT-proof.txt`.

**Phase 5** — both production fixes undone in a throwaway copy of `backend/`:

```
FAILED …::test_a_replayed_attempt_returns_the_same_order              (500 != 201)
FAILED …::test_cancelling_a_session_accepts_the_guest_email_the_storefront_sends   (403 != 200)
2 failed, 9 passed, 2 warnings in 15.55s
```

These are the original run's own two failures, reproduced byte-for-byte from
`.p5/evidence/integration-BEFORE-fixes.txt`. Evidence:
`.p5/evidence/recovered-integration-REVERT-proof.txt`.

---

## 6 · Regression runs and gates

| # | Run | Result | Evidence |
|---|---|---|---|
| 1 | Recovered Phase 4 suite | **9/9 pass** | `.p4/evidence/recovered-phase4-AFTER.txt` |
| 2 | Recovered Phase 5 suite (new path) | **11/11 pass**, 2 warnings, 14.01 s | `.p5/evidence/recovered-integration-AFTER.txt` |
| 3 | Phase 6 suite + all aarna port suites (`src/components/aarna/__tests__/*.test.js`) | **68/68 pass** (13/16/15/7/17) | run output below |
| 4 | All in-tree `src/**/__tests__` suites | **221/221 pass** (212 before + the 9 recovered) | `.p5/evidence/recovered-frontend-src-suites.txt` |
| 5 | `npm test` (the legacy `tests/*.test.js` guard suites) | **434 tests · 412 pass · 21 fail · 1 skip** — unchanged from the PR #37 and Phase 6 baselines (the 21 are the documented pre-existing guard failures) | run output |
| 6 | `backend/tests/unit` (`--ignore=tests/unit/test_unified_rbac_consolidation.py`) | **18 failed / 760 passed / 24 skipped / 582 subtests passed** — the failed set is **byte-identical** to the Phase 5 post-fix baseline (verified with `diff`), i.e. no new failure and the Phase 5 `CartTotalsTests` fix still holds | `.p5/evidence/backend-unit-AFTER-recovery.txt` |
| 7 | `backend/tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py` | **1 failed — pre-existing**, identical `'Step 11C Silk' != 'sarees-silk'` as recorded in Phase 5 §7 item 7 (it fails with and without the Phase 5 fixes; out of scope) | `.p5/evidence/recovered-phase3-harness-PREEXISTING-failure.txt` |
| 8 | `node scripts/aarna-port.js --check` | **exit 0** — "the port matches the design (52 copied files, 88885 bytes of CSS)" | — |
| 9 | `npm run build` | **built**, `dist/index.html` 3,687.50 kB / gzip 1,377.73 kB — identical to Phase 6 | — |
| 10 | `npm run audit:frontend-catalog` | **PASS** on all six checks | — |
| 11 | `git diff --check` | **clean (exit 0)**; both new files also checked for trailing whitespace / space-before-tab (0 issues) | — |

---

## 7 · What is still blocked, and what these suites do **not** claim

* **Real PostgreSQL.** No Docker daemon, no `postgres`/`psql` binary and no `backend/.env` exist in this
  environment, so the Phase 5 suite runs against the repository's existing real-router **SQLite** harness.
  Everything it asserts (amounts, stock locking semantics, idempotency, HMAC, ownership) is the production
  code path; the *storage engine* is not. The three storage-engine-specific questions stay open and are the
  same ones Phase 5 listed: `with_for_update()` under Postgres, DB-level constraint behaviour, and the
  pre-existing Phase 3 harness `subcategory` id-vs-label projection (row 7 above).
* **The live payment gateway.** No real Razorpay credentials were used and none were invented; the SDK is
  stubbed. The `PAID` transition is proven through the production HMAC verification with a local test
  secret — that path is genuine, the *gateway's own* answers are the fake's. No payment success was
  fabricated anywhere, and no fake order was created.
* **Render-level behaviour of the recovered frontend tests.** See §3: no DOM engine in-tree, so tests 6/8/9
  pin the changed lines; the rendered evidence remains the Phase 4 browser probe.
* **The pre-existing failures were not "fixed" to make the runs look green** — the 21 frontend guard
  failures, the 18 backend unit failures and the Phase 3 harness failure are the documented baseline sets,
  recorded here as found.

---

## 8 · Files, and how to reproduce every number above

**Recovered (2 files, both outside every ignore rule):**

* `frontend/src/utils/__tests__/phase4ShoppingJourney.test.js` — 393 lines, 9 tests
* `backend/tests_recovery/test_phase5_checkout_contract_flow.py` — 654 lines, 11 tests, class
  `CheckoutContractFlow`

**Nothing else changed.** No production file, contract, route, default, manifest or ignore policy was
touched in this task; the Phase 3/4/5/6 changes remain exactly as they were.

```bash
# 1 · Phase 4 — recovered suite
cd frontend
node --import ./scripts/node-loader/register-jsx.mjs --test "src/utils/__tests__/phase4ShoppingJourney.test.js"

# 2 · Phase 5 — recovered suite (needs the sandbox venv; no real DB is contacted)
cd backend
DATABASE_URL="postgresql+asyncpg://postgres:password@localhost:5432/pratikshya_fashion" \
  /tmp/be-venv/bin/python -m pytest tests_recovery/test_phase5_checkout_contract_flow.py

# 3 · the standing suites and gates
cd frontend
node --import ./scripts/node-loader/register-jsx.mjs --test "src/components/aarna/__tests__/*.test.js"
node --import ./scripts/node-loader/register-jsx.mjs --test "src/**/__tests__/*.test.js"
npm test
npm run build
npm run audit:frontend-catalog
node scripts/aarna-port.js --check
cd .. && git diff --check
```

**Next step: stop here for approval before Phase 7** (the design's remaining pages — Shop, Wishlist,
Account, TrackOrder, Checkout, Info, the standalone Shop-side 404 — then the staff portals, which need
separate design input).
