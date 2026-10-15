# Phase 5 — Backend Contract & Checkout Production-Readiness Audit

**Status: complete for everything that could genuinely be exercised here.**
Two production defects were reproduced against the real FastAPI application, root-caused and fixed; one
test-harness defect was fixed so three shipping-parity assertions stop silently passing on the wrong
subtotal. The endpoint contract map below is the audit's primary artefact and was written **before** any
code changed.

**The real end-to-end path — a live PostgreSQL database and the Razorpay network API — could not be run in
this environment, and that is stated as a blocker rather than worked around.** Every test result in this
document is labelled **unit**, **isolated integration** or **real E2E**; the third label is never used.

**Nothing is committed** — the work sits in the working tree on top of PR #37 and the Phase 3/4 fixes.

| | |
|---|---|
| Audited | `POST /orders` · `POST /payments/session` · `POST /payments/verify` · `POST /payments/session/{id}/cancel` · `GET /payments/session/{id}` · `/cart` (+ items, coupon, totals) · `POST /offers/validate` · `GET /orders`, `GET /orders/{id}`, `/tracking`, `/cancel`, `/returns` · `/customers/me/addresses` |
| Changed (production) | `backend/app/schemas/payments/payment.py` · `backend/app/services/orders/order_service.py` |
| Changed (test) | `backend/tests/unit/test_phase4_customer_data.py` |
| Added | `backend/tests/integration/test_phase5_checkout_contract_flow.py` (11 tests) |
| Evidence | `.p5/tools/` (the three audit probes: contract, request-parsing, alias scan) · `.p5/evidence/` (backend unit before/after, integration before/after) |
| Not changed | every frontend file, every route, every response contract, every schema other than the one below |
| Gates | see §8 |

---

## 1 · Environment verdict — what could and could not run

| Requirement | Present? | Consequence |
|---|---|---|
| Docker / `docker compose` | **no** | `backend/docker-compose.yml` (pgvector Postgres + Redis + Celery) cannot be brought up |
| PostgreSQL server / client (`psql`) | **no** | no live database; `aiosqlite` is a test-only extra, not a server |
| Redis | **no** — but not needed at runtime | `app/core/redis.py` is a compatibility shim over an in-process LRU store; app startup initialises `INIT_LRU_CACHE`-backed `FastAPICache(InMemoryBackend)`, so the API runs without it |
| `backend/.env` | **no** (only `.env.example`) | `Settings` falls back to its documented defaults (`DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/pratikshya_fashion`, `STORAGE_PROVIDER=local`) |
| Python venv | **created**, `/tmp/be-venv` | `requirements.txt` + `pytest` + `pytest-asyncio` install cleanly; the app **imports** and its full router graph builds (verified: 300+ OpenAPI paths) |
| Razorpay credentials | **no, and none were created** | the gateway boundary is stubbed *in tests only*; no real key exists in this environment |

**Consequences, stated plainly:**

* `tests/unit/test_media_schema_integrity.py` and `tests/unit/test_phase6_real_media_integration.py` skip
  (`DATABASE_URL is not set` / `real dataset not present`).
* A real checkout against Postgres, and a real payment capture against Razorpay, **were not run**. §6 lists
  exactly which integration tests remain blocked.
* Startup calls `await _check_pending_migrations()`, which aborts if an ORM table is missing — so the
  production app object is used in tests **without** its lifespan, exactly as this repository's existing
  real-router harnesses (`tests/integration/test_phase3_step11c_*`, `tests/unit/test_phase6_media_db.py`) do.

---

## 2 · Endpoint contract map

Verified by reading the route, its schema and the calling module, and then by parsing the storefront's own
request bodies through the real schemas (`app.main:app` imported, OpenAPI built). Prefix comes from
`settings.API_V1_PREFIX` = `/api/v1`. Auth column: **customer** = `get_current_customer`, **optional** =
`get_optional_user` (no token ⇒ guest), **admin** = `get_current_admin`.

### Cart — `frontend/src/services/api/cartApi.js` (normalises every snake_case response)

| Method + path | Auth | Request | Response | Errors | Frontend consumer |
|---|---|---|---|---|---|
| `GET /cart` | customer | — | `{ok, items[{id,product_id,product?,color?,size?,quantity,added_at,line_total}], count, totals{subtotal,product_discount,coupon_discount,coupon_code,offer_id,shipping,cod_fee,total,saved}, coupon?, coupon_lapsed}` | 401/403 | `apiGetCart` → `normaliseCart` → `CartContext` |
| `POST /cart/items` | customer | `{productId, color?, size?, quantity 1…999}` | `{ok, message, cart}` | 422 quantity 0, 404 unknown product, 409 stock | `apiAddCartItem` |
| `PATCH /cart/items/{lineId}` | customer | `{quantity 0…999}` | `{ok, message, cart}` | 404 line | `apiUpdateCartItem` |
| `DELETE /cart/items/{lineId}` | customer | — | `{ok, message, cart}` | 404 | `apiRemoveCartItem` |
| `DELETE /cart` | customer | — | `{ok, message}` | — | `apiClearCart` |
| `POST /cart/coupon` | customer | `{code}` | `{ok, coupon, message}` | 404 unknown code, 400 not applicable | `apiApplyCoupon` |
| `DELETE /cart/coupon` | customer | — | `{ok, message}` | — | `apiRemoveCoupon` |
| `GET /cart/totals` | customer | query `deliveryMethod`=`normal|standard|express`, `paymentMethod`=`cod|online` (aliases accepted; snake_case also works) | **flat** `{ok, subtotal, product_discount, coupon_discount, coupon_code, offer_id, shipping, cod_fee, total, saved}` | 401 | `apiGetCartTotals` → `CheckoutContext` server quote |

Verified by driving the real routes: `{"productId","color","size","quantity"}` parses to
`add_item(product_id=…, color=…, size=…, quantity=…)`; `quantity: 0` ⇒ **422**; both query spellings return
200. Cart responses are **snake_case** and only `cartApi.js` translates them.

### Orders — `frontend/src/services/api/ordersApi.js`

| Method + path | Auth | Request | Response | Errors | Frontend consumer |
|---|---|---|---|---|---|
| `POST /orders` | optional | `PlaceOrderRequest` — camelCase aliases: `items[{productId,color,size,quantity 1…99}]`, `customer{firstName,lastName,email,phone}`, `address{fullName,phone,addressLine,landmark,city,state,pincode,type}`, `deliveryMethod`∈{normal,standard,express}, `paymentMethod`∈{upi,card,netbanking,cod}, `couponCode`, `customerNote`, `idempotencyKey` (8–100 chars) | **201** `{ok, order}` (`OrderResponse`, snake_case) | 422 invalid enum/quantity/key; 400 not published / out of stock / insufficient stock / coupon ineligible; 409 key already used by a different order | `apiPlaceOrder` ← `OrderContext.placeOrder` ← `CheckoutContext.startPayment` |
| `GET /orders` | customer | query `page`, `pageSize`, `sort` (allow-list) | `{ok, orders[], total, page, page_size}` | 401/403 | `apiListOrders` |
| `POST /orders/claim-guest` | customer | `{email?}` — when present it **must equal** the account email | `{ok, claimed, orders…}` | 403 mismatch | `apiClaimGuestOrders` |
| `GET /orders/{id}` | customer | — | `{ok, order}` | 403/404 non-owner | `apiGetOrder` |
| `GET /orders/{id}/tracking` | customer | — | `{ok, tracking}` | 403/404 | `apiGetTracking` |
| `POST /orders/{id}/cancel` | customer | `{reason?, note?}` | `{ok, order}` | 400 not cancellable | `apiCancelOrder` |
| `POST /orders/{id}/returns` | customer | `{items[{lineId,quantity}], pickupMethod}` | `{ok, return_order}` | 400 window/rules | `apiCreateReturn` |
| `GET /orders/{id}/returns/{returnId}` | customer | — | `{ok, return_order}` | 404 | `apiGetReturn` |

`PlaceOrderRequest` was fed the storefront's exact body (`buildPlaceOrderRequest` output) and parsed
cleanly. **No amount, price, discount or total is accepted** — the body is identity + selection only, and
`order_service.place_order` re-resolves unit prices from `ProductModel`, revalidates the coupon and
recomputes shipping/COD. Extra unknown fields are accepted and ignored (they are never read).

### Payments — `frontend/src/services/api/paymentsApi.js`

| Method + path | Auth | Request | Response | Errors | Frontend consumer |
|---|---|---|---|---|---|
| `POST /payments/session` | optional (+`guestEmail` for guest orders) | `{order_id, payment_method∈{upi,card,netbanking}, idempotency_key?, guest_email?}` — `order_draft` is deprecated and rejected | **201** `{ok, session_id, status, razorpay_order_id, razorpay_key_id, amount_paise, currency, prefill?}` (**no `response_model`** ⇒ the service's raw snake_case dict) | 404 unknown order; 403 non-owner; 409 already paid; 400 COD / zero amount | `apiCreatePaymentSession` → `normalisePaymentSession` |
| `GET /payments/session/{id}` | optional (+`guestEmail`) | query `guestEmail` | `{ok, session}` | 403/404 | `apiGetPaymentSession` |
| `POST /payments/session/{id}/cancel` | optional (+`guestEmail`) | `{reason?, guest_email?}` | `{ok, session_id, status}` | 403 non-owner; 400 not CREATED/PENDING | `apiCancelPaymentSession` |
| `POST /payments/verify` | optional (+`guestEmail`) | `{razorpay_order_id, razorpay_payment_id, razorpay_signature, guest_email?}` | `{ok, message, paymentStatus, orderId, orderStatus}` (camelCase by alias) | 422 invalid HMAC | `apiVerifyPayment` |
| `POST /payments/webhook` | signature-gated | Razorpay webhook | ack | 400 bad signature | not called by the storefront |

`POST /payments/session` and `POST /payments/verify` accept **both** spellings because
`CreatePaymentSessionRequest` and `VerifyPaymentRequest` set `model_config = {"populate_by_name": True}`;
`POST /payments/session/{id}/cancel` did **not** — that is Defect 1.

### Coupons — `frontend/src/services/api/offersApi.js`

| Method + path | Auth | Request | Response | Errors | Frontend consumer |
|---|---|---|---|---|---|
| `POST /offers/validate` | none (optional user improves eligibility) | `{code, cart_items[{lineTotal}], customer_id?, customer_email?}` — plain snake_case field names, no aliases | `{ok, coupon{…full eligibility scope…}, discount}` | 404 unknown code; 400 inactive/expired/not-yet-valid/minimum not met/not eligible | `apiValidateOfferCode` ← `CartContext.applyPromo`, `offerRepository.validateOffer` |

### Addresses — `frontend/src/services/api/customersApi.js`

| Method + path | Auth | Request | Response |
|---|---|---|---|
| `GET /customers/me/addresses` | customer | — | `{addresses[]}` or array |
| `POST /customers/me/addresses` | customer | `{fullName, phone, addressLine, landmark, city, state, pincode, type, isDefault}` | `{address}` |
| `PATCH /customers/me/addresses/{id}` | customer | partial | `{address}` |
| `DELETE /customers/me/addresses/{id}` | customer | — | `{ok}` |
| `POST /customers/me/addresses/{id}/default` | customer | — | `{address}` |

`AddressBase` carries `fullName→full_name`, `addressLine→address_line`, `type→address_type`,
`isDefault→is_default`, **with** `populate_by_name`, so the storefront's camelCase parses. Its validators
are stricter than the order-time `AddressSnapshot` (`pincode` 6 digits, `phone` 10–20) — a *saved* address
is validated more strictly than a one-off checkout address, which is a backend design choice, not a
mismatch.

### Error envelope (every error path)

`app/core/error_handlers.py` renders `{"success": false, "error": {"code", "message", "details"}}` for
`AppException`, `RequestValidationError` (422, `code: VALIDATION_ERROR`), `HTTPException` (code from a
fixed status→code map) and unhandled exceptions (500 `INTERNAL_SERVER_ERROR`).
`apiClient.normaliseError` consumes exactly `data.error.code` / `data.error.message` / `data.error.details`,
falling back to `data.detail`. **Verified to match.** `handleError` then returns
`{ok: false, error, message, code, status, details}` — the shape every service module's caller reads.

### Not part of the checkout contract

* `GET /checkout/health` exists and returns `{module: "checkout", status: "active"}`; **nothing in the
  frontend calls it**. Left untouched.
* `POST /payments/session/{id}/reconcile`, `/refund`, `/payments/reconcile-batch`,
  `/super-admin/payments` are admin surfaces, outside this phase's scope (unchanged).

---

## 3 · Contract verification, requirement by requirement

| Requirement | Verdict | Evidence |
|---|---|---|
| Cart identity / lines | ✅ | `_cart_line_id(product_id, colour, size)` case-insensitive; `POST /cart/items` accepts the storefront body; two variants of one product are two lines (Phase 4 browser run) |
| Product + variant identifiers | ✅ | `productId` + `color` + `size` are the only identifiers sent; the backend ignores any price on the line |
| Address selection / validation | ✅ | saved addresses via `/customers/me/addresses` (camelCase accepted); order-time `AddressSnapshot` accepts `{fullName, phone, addressLine, landmark, city, state, pincode, type}` exactly as sent |
| Delivery / shipping maths | ✅ parity | backend `_compute_shipping` / `cart_service`: normal = 0, standard = 0 at ≥ ₹5,000 else ₹99, express = ₹199 (never free), COD = ₹49. Frontend `calculateDeliveryFee` / `COMMERCE_DEFAULTS` (5,000 / 99 / 199 / 49) implement the same rules. **Asserted against a real DB** in the new suite (`₹2,500 → ₹99`, `₹5,000 → ₹0`, express `₹199`, COD `₹49`) |
| Coupon validation / eligibility | ✅ | the single gate `POST /offers/validate` returns the full eligibility scope in snake_case, matching `normaliseOffer`; the **order boundary revalidates** and recomputes (`_revalidate_coupon_for_order`, `_compute_coupon_discount`) — asserted: 10 % of ₹2,500 = ₹250, ₹99 shipping, ₹2,349 total |
| Server-authoritative totals | ✅ | `POST /orders` ignores client amounts — asserted by sending forged `total: 1 / subtotal: 1 / couponDiscount: 2499 / amountPaise: 100` and reading back ₹2,599 stored on the row |
| Inventory checks | ✅ | `with_for_update()` row lock + availability rules; asserted: `quantity = stock + 1` is refused **and stock is untouched** |
| Duplicate-submission prevention | ✅ **after fix** | server-side idempotency via the unique `order_number` derived from `idempotencyKey`; a replay returns the same order — **this returned HTTP 500 before Defect 2 was fixed** |
| Payment session charges the order | ✅ | `amount_paise == order.total × 100` **and** the gateway request carried the same amount; a second call resumes the active session instead of creating a second gateway order |
| Signature verification is the only way to PAID | ✅ | a forged signature ⇒ 422 (`BUSINESS_RULE_VIOLATION`) and the order stays `PENDING_PAYMENT`; no status flag is accepted from the client |
| Guest order claiming | ✅ (by inspection) | `claim_guest_orders` derives identity from the authenticated account email; `email` may only repeat it. Not exercised end-to-end (see §6) |
| Cart cleared only after server confirmation | ✅ | `clearCart()` runs after `verifyResult.ok` / a 201 `POST /orders`; a failure leaves the bag intact |
| Coupon lapses mid-checkout | ✅ handled at the boundary | `get_cart` re-validates the coupon on **every** read, sets `coupon_lapsed` and drops the discount; `CouponField` (used in the bag *and* the checkout summary) shows "This offer isn't active for your current selection." `GET /cart/totals` does not carry the `coupon_lapsed` flag, so a lapse noticed only by the totals poll shows the corrected amount first and the notice on the next cart read — noted, not changed (the flag is additive and the totals contract is established) |
| Delivery / inventory change mid-checkout | ✅ | `get_cart` re-clamps quantity to available stock and drops unresolvable lines; `POST /orders` re-checks under a row lock and refuses with a 4xx |
| Order created but confirmation retrieval fails | ✅ already safe | `/order-success` renders `OrderContext.currentOrder` (set from the **`POST /orders` response**); the extra `getOrderById` refresh is `.catch(() => {})` and cannot blank or block the page |
| Estimate vs authoritative total | ⚠️ documented | an authenticated checkout shows `GET /cart/totals`; until it arrives (or if it fails) it falls back to `calculateCheckoutTotals` over the server `GET /cart` subtotal, which re-derives *shipping and COD only* from the rules above. Prices and discounts are always server values, and the order price is always the server's. Left as-is: the two rule sets were verified identical, so labelling the panel would add noise without changing what the customer is charged — recorded here as a residual risk, not silently "fixed" |

---

## 4 · Defects reproduced, root cause, fix

### Defect 1 — a guest could never cancel their payment session (silently)

**Reproduced** (isolated integration, real app): a guest places an order and opens a payment session;
`POST /payments/session/{id}/cancel` with the body the storefront sends —
`{"reason": "Customer cancelled", "guest_email": "<the order's own guest email>"}` — returns

```
403 {"success":false,"error":{"code":"FORBIDDEN",
     "message":"The provided guest email does not match this order."}}
```

**Root cause:** `CancelSessionRequest` (`backend/app/schemas/payments/payment.py`) declares
`guest_email` with `alias="guestEmail"` and **no `model_config`**, so a snake_case key is not a recognised
field and pydantic drops it. The route then passes `owner_guest_email=None` into
`PaymentService.cancel_session` → `_assert_order_access` compares `""` against the order's guest email and
raises 403. Unlike the other two schemas in the same file, the class had no
`populate_by_name`.

A scan of **every** aliased request/response schema reachable from the checkout surface (53 classes across
`schemas/commerce/cart`, `schemas/orders/order`, `schemas/payments/payment`, `schemas/customer/*` and
`schemas/catalog/product`) found this to be the **only** one that rejects the field-name spelling — the
other 52 accept both. After the fix the scan reports **0** such schemas. The storefront's own
suite already pinned the *request* (`tests/phase2Checkout.test.js`, "`apiCancelPaymentSession` sends
`guest_email` for guest-owned sessions"); nothing pinned that the server *accepts* it.

**Blast radius, stated honestly:** today `/checkout` sits behind `ProtectedRoute`, so a signed-in customer
is matched by session identity and never reaches this branch — the visible impact is latent, and the
frontend swallows the 403 with `.catch(() => {})`. It is nevertheless a real frontend↔backend contract
mismatch on a documented, tested, guest-capable endpoint: any non-browser client, and the guest checkout
the backend is built for, gets a session that can never be cancelled (it lingers in `CREATED`/`PENDING`
until Razorpay's TTL, and admin reconciliation keeps auditing a session the customer abandoned).

**Fix** — `backend/app/schemas/payments/payment.py`, `CancelSessionRequest`: `model_config =
{"populate_by_name": True}`. One line; the camelCase alias keeps working, so no existing caller changes.

**After the fix:** the same request returns `200 {"sessionId": …, "status": "CANCELLED"}` and the session row
is `CANCELLED` in the database.

---

### Defect 2 — retrying a checkout attempt returned HTTP 500 instead of the same order

**Reproduced** (isolated integration, real app): placing an order twice with the same `idempotencyKey` —
the exact double-click / network-retry the key exists for —

```
first  POST /orders → 201, order <id>, order_number PF-ORD-0B13D9, stock 5 → 4
second POST /orders → 500 {"success":false,"error":{"code":"INTERNAL_SERVER_ERROR",
                              "message":"An unexpected error occurred. Please try again later."}}
```

**Root cause:** the idempotent replay branch of `OrderService.place_order` returns
`await _attach_customer_info(self.db, existing)` where `existing` came from `_find_order_by_number` — a
bare `select(OrderModel)`. The route then builds `SingleOrderResponse(order=order)`, whose
`OrderResponse` reads `items`, `status_history` and `returns`. Those relationships are **lazy**, and an
async session cannot lazy-load during synchronous response serialisation, so pydantic raised
`MissingGreenlet`/`ValidationError: order.items, order.status_history, order.returns` and the error
handler turned it into a 500. The module's own comment on `_order_load_options()` already states the
invariant — "*an async session cannot lazy-load them during serialisation*" — and `_load_order` honours it.
Only this replay path did not.

**Blast radius:** a customer whose first attempt's response was lost (or who double-tapped **Place Order**)
sees "Your order could not be created. Please try again." while an order *was* created and stock *was*
decremented. Retrying the same attempt fails again; changing anything rotates the attempt id and creates a
**second** order. So the failure mode is a dead-end at best and a duplicate order + double stock decrement
at worst.

**Fix** — `backend/app/services/orders/order_service.py`, `_find_order_by_number`: add
`.options(*_order_load_options())`, with a comment stating why it is required.

**After the fix:** the replay returns **201 with the identical `id` and `order_number`**, and stock is
decremented once.

---

### Defect 3 — three shipping-parity assertions were testing nothing (test harness)

**Reproduced** (unit): `tests/unit/test_phase4_customer_data.py::CartTotalsTests` failed 3 of 6 in a full
run (`standard @ ₹5,000` got ₹99; express @ ₹6,000 totalled ₹2,199) and each one **passed in isolation**.

**Root cause:** `CartService.get_cart` caches the whole `CartResponse` under `cart:{customer_id}` for 300 s
and `get_totals` reuses it. Every scenario in that class prices a *different* basket for the same customer
id `"u1"`, so the first scenario's ₹2,000 subtotal was served to all the later ones — including
`test_shipping_matches_the_order_boundary_rule`, whose five-iteration loop reused the first iteration's
cart.

**Fix** — the class's `_totals()` helper now clears `CartService._cart_cache_key("u1")` before pricing a
basket, with a comment recording why. **No assertion was weakened or removed**; they now evaluate the
basket they claim to price. 30/30 pass (was 27/30).

---

## 5 · Files changed, exactly

| File | Change | Why |
|---|---|---|
| `backend/app/schemas/payments/payment.py` | `+ model_config = {"populate_by_name": True}` on `CancelSessionRequest`, + docstring | Defect 1 |
| `backend/app/services/orders/order_service.py` | `+ .options(*_order_load_options())` in `_find_order_by_number`, + comment | Defect 2 |
| `backend/tests/unit/test_phase4_customer_data.py` | + cache clear in `CartTotalsTests._totals()` (+ import) | Defect 3 |
| `backend/tests/integration/test_phase5_checkout_contract_flow.py` | **new**, 11 tests | pins all of the above against the real app |

> `backend/.gitignore` line 55 ignores `backend/tests/`, so a newly added file there needs
> `git add -f backend/tests/integration/test_phase5_checkout_contract_flow.py` to be tracked — exactly how
> the existing `test_phase3_step11c_*` file got in. The ignore policy was **not** modified.

> **Phase 6 Review addendum (test recovery).** This suite did not survive the next workspace recycle, for
> exactly the reason above, and has been re-created and re-homed at
> `backend/tests_recovery/test_phase5_checkout_contract_flow.py` — a directory neither ignore file mentions
> (nothing in either `.gitignore` was changed). Every path in this document that names
> `tests/integration/test_phase5_checkout_contract_flow.py` refers to the original, ignored location. See
> `docs/PHASE-6-REVIEW-TEST-RECOVERY.md` for the per-assertion provenance and the re-run results.

**No frontend file, route, response contract, migration, dependency or environment variable was changed.**
No production credential was read, written or invented. No new dependency was added to the project (the
venv under `/tmp` is sandbox tooling, as in Phases 3/4).

---

## 6 · Tests executed — labelled

### Unit — `backend/tests/unit` (mock/fake-based, no DB)

| Run | Result |
|---|---|
| Baseline, before any Phase 5 change | **21 failed / 1 skipped** (`--ignore=tests/unit/test_unified_rbac_consolidation.py`, which cannot even import: pre-existing `ImportError: ACCOUNT_LEVEL_SUPER_EMPLOYEE`) |
| After the fixes | see §8 — the delta is exactly the 3 `CartTotalsTests` failures |

### Isolated integration — real app, real routes, real SQL (SQLite), stubbed gateway

`backend/tests/integration/test_phase5_checkout_contract_flow.py` — `11 passed`.
The production `app.main:app` is driven through `TestClient` with its full router graph; only `get_db`
(throwaway SQLite + the production commit/rollback semantics) and the authenticated user are injected.
Requests are the storefront's own payloads.

| # | Test | What it proves |
|---|---|---|
| 1 | `test_cart_totals_apply_the_documented_shipping_and_cod_rules` | ₹99 / ₹199 / ₹0+₹49, and that a query-string `total=1` cannot move the total |
| 2 | `test_cart_totals_are_free_at_the_threshold` | standard is complimentary at exactly ₹5,000 |
| 3 | `test_place_order_ignores_client_supplied_amounts` | forged amounts ignored; ₹2,599 stored; stock −1; `PENDING_PAYMENT`/`PENDING_PAYMENT` |
| 4 | `test_place_order_recomputes_the_coupon_authoritatively` | coupon revalidated server-side: ₹250 off, ₹99 shipping, ₹2,349 |
| 5 | `test_out_of_stock_is_refused_and_stock_is_not_touched` | inventory guard, 4xx not 5xx |
| 6 | `test_a_replayed_attempt_returns_the_same_order` | **Defect 2 pin** — same id, same order_number, one decrement |
| 7 | `test_payment_session_charges_the_order_total` | `amount_paise = total × 100`, gateway amount matches, resume ≠ duplicate |
| 8 | `test_a_bad_signature_never_marks_the_order_paid` | forged HMAC ⇒ 422, order still `PENDING_PAYMENT` |
| 9 | `test_a_configured_signature_is_accepted_and_marks_the_order_paid` | the local HMAC check accepts a signature computed with the configured **test** secret → `PAID` |
| 10 | `test_cancelling_a_session_accepts_the_guest_email_the_storefront_sends` | **Defect 1 pin** — 200 + `CANCELLED` in the row |
| 11 | `test_order_retrieval_is_owner_only` | owner 200; a different signed-in shopper 403/404 |

**Revert proof:** with both production fixes reverted, tests 6 and 10 fail (500 and 403 respectively) and
the other nine still pass; with the fixes restored, 11/11 pass.

### Real end-to-end

**Not run. Blocked** — see §7. The label is not used anywhere in this document.

### Frontend

| Run | Result |
|---|---|
| `tests/phase2Checkout.test.js` (the checkout/order client contract) | 12/12 pass |
| `npm test` (whole suite) | see §8 |

---

## 7 · Blocked integration tests, and what "payment success" means here

Blocked by the missing infrastructure, listed exactly:

1. **Any test that needs a live database** — `tests/unit/test_media_schema_integrity.py`,
   `tests/unit/test_phase6_real_media_integration.py` (skip), and `docker-compose.yml`-backed runs of the
   full stack. Consequently a **real PostgreSQL checkout** (row locks, `FOR UPDATE`, JSONB, migrations,
   `_check_pending_migrations`) is unverified here.
2. **A real payment capture.** No Razorpay credentials exist and none were created.
3. Because of (2), these were **not** exercised: a genuine gateway `order.create` round-trip; a real
   hosted-checkout payment; the webhook path (`POST /payments/webhook`); refunds against a captured
   payment; reconcile/`reconcile-batch` against the real Razorpay API; the guest *claim* journey end to
   end; and a browser-driven checkout against a live backend (Phase 3/4 established that no backend is
   reachable from the Chromium sandbox either).

**Was payment success exercised?** *Partially, and only in isolation.* In test 9 the server-side
verification chain ran for real — the HMAC was recomputed from the configured test secret with
`hmac.compare_digest`, `_confirm_order_paid` executed, the order row moved to `PAID` — but **no payment was
captured anywhere**: the gateway client is a stub in the test process and no money, instrument or live
account is involved. That is a check of *verification logic*, not evidence that a real payment works. The
security-critical half — a forged signature must never produce `PAID` (test 8) — *is* fully exercised.
The storefront's own handler was never driven with a real `razorpay.open()` callback.

**Was order success exercised?** Yes, against the real route/service/ORM (tests 3–7, 11): a 201 order with
server-computed totals, persisted, with stock decremented and a readable confirmation. What is *not*
proven is that the same flow survives PostgreSQL.

---

## 8 · Gates

| # | Gate | Result |
|---|---|---|
| 1 | Backend unit + API tests | **18 failed / 1 skipped** — baseline was 21 failed / 1 skipped; the **only** delta is the three `CartTotalsTests` failures fixed here (`diff` of the FAILED lists is exactly those three lines). All 18 remaining are pre-existing. Command: `pytest tests/unit --ignore=tests/unit/test_unified_rbac_consolidation.py` |
| 1b | Backend integration tests (labelled) | `tests/integration/test_phase5_checkout_contract_flow.py` **11 passed**; `tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py` **1 failed — pre-existing**, proven by re-running it with both Phase 5 production fixes reverted (identical `'Step 11C Silk' != 'sarees-silk'`) |
| 2 | Frontend checkout/order tests | `tests/phase2Checkout.test.js` **12/12 pass** |
| 3 | Full frontend suite | `npm test` → **443 tests, 421 pass, 21 fail, 1 skipped** — identical to the PR #37 / Phase 4 baseline (434/412/21/1 + the 9 Phase 4 tests), so **no regression**. `node --test "src/**/__tests__/*.test.js"` → **194/194** |
| 4 | `npm run build` | ✅ `dist/index.html` 3,680.37 kB │ gzip 1,375.70 kB (unchanged from Phase 4) |
| 5 | `npm run audit:frontend-catalog` | **PASS** (9 checks, exit 0) |
| 6 | `node scripts/aarna-port.js --check` | exit **0** — "the port matches the design (50 copied files, 88885 bytes of CSS)" |
| 7 | `git diff --check` | clean, exit 0 |

**Revert proof (clean, single log):** with the two production fixes reverted the new suite reads
`500 != 201` (replayed attempt) and `403 != 200` (guest cancellation); restored, it reads **11 passed**.

### Browser verification — not applicable here, and stated as such

Both defects are server-side (`CancelSessionRequest` parsing; an eager-load option on the idempotency
replay path). Observing them in the browser would require a live backend reachable from the Chromium
sandbox, which this environment does not have (established in Phase 3/4, re-verified here). No rendering
claim is made for either fix, and no browser result is reported for them: the evidence is the API-level
response codes before and after, captured against the real application. Phase 4's browser results
(16 scenarios, 0 page errors) remain the last rendered evidence for the storefront surfaces, and nothing
in this phase changed a frontend file.

---

## 9 · Remaining risks, recorded but not "fixed"

1. **`payment_status = "PENDING_PAYMENT"` at order creation** (`order_service.py:510`) — the value is in
   the storefront's canonical vocabulary (`ORDER_PAYMENT_STATUS.PENDING_PAYMENT`, "Pending Payment"), so
   the UI is correct; but the docstring three lines above the code says `payment_status=PENDING`. The
   backend's own doc is wrong, not the contract. Not changed: the DB value is established and admin
   filters query it.
2. **Admin shipping settings do not reach either pricer.** `settingsRepository` is backend-driven and
   marks `pratikshya_settings` in localStorage "legacy — unused", but `commerceDefaults.readShippingRules`
   still reads that key — so the storefront falls back to `COMMERCE_DEFAULTS` (which match the backend's
   hard-coded constants) and an admin's edited threshold/fee affects neither the quote nor the charge.
   Both sides agree with each other, so no customer is mischarged; the setting is simply inert. Fixing it
   would mean a new shared pricing source — out of scope for this phase, and explicitly disallowed
   ("no duplicate pricing services").
3. **Guest checkout is unreachable from the UI** by design: `/checkout` and `/order-success` sit behind
   `ProtectedRoute`, so `CheckoutContext`'s `isGuest` / `guestEmail` branches are dormant in the browser
   even though the backend fully supports guest orders. Recorded, not changed — changing the sign-in gate
   would redesign the storefront.
4. **Checkout totals are unlabelled while the server quote is in flight** (§3, last row) — see the
   reasoning there.
5. **`idempotencyKey` → `order_number` is a 6-hex-character SHA-1 prefix** (16.7 M values), globally
   unique across all customers. Two different keys can collide, and a collision is a hard 409 for the
   second customer. Probability is negligible at this order volume; changing the scheme would be a schema
   change (new column or format), which the phase forbids.
6. **The 18 remaining backend unit failures are pre-existing and unrelated** (stale RBAC suites, media
   registration, workforce wiring, account-level migration graph, one health-check contract) — the same
   set as the pre-Phase-5 baseline, minus the three fixed here.
7. **`tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py` fails in the PR #37 tree**
   (`'Step 11C Silk' != 'sarees-silk'`): the admin product list returns a subcategory **label** where the
   taxonomy **id** is expected. Unrelated to checkout, pre-existing (proven with the Phase 5 fixes
   reverted), and out of this phase's scope — recorded so the next phase can pick it up with a real
   Postgres to confirm whether it is an id-vs-label projection bug or an SQLite-shim artefact.
8. **A live payment was never attempted, and no fake success was produced.** The only path to `PAID`
   exercised here is the local HMAC verification with a test secret (§7); the storefront's Razorpay
   handler, the webhook and refunds remain unverified against the real gateway.
