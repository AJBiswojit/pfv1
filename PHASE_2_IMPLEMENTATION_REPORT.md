# PHASE 2 IMPLEMENTATION REPORT — Canonical Checkout Lifecycle, Trust Model & Secure Guest Orders

Phase 2 makes the storefront checkout **canonical and server-authoritative**:
the order is created **before** any payment session, payment is captured
**only** through server-side Razorpay verification, pricing/stock/coupons
are computed and enforced **entirely** on the backend, retries are
**idempotent** through the existing unique `order_number` column, and guest
checkout works end-to-end with a **verified-email claim** path.

No database schema changes were made or required. No mock, demo or seed
business data was introduced. No fake payment success is possible: an order
becomes `PAID` only through `POST /payments/verify` with a valid
HMAC signature (server-recomputed) or a signed Razorpay webhook.

---

## 1. Changes made (overview)

- **Order-first canonical flow** (forced by the non-NULL
  `payment_sessions.order_id` FK): COD → `POST /orders` confirms the order
  with payment `PENDING` (no session); online → `POST /orders` creates a
  `PENDING_PAYMENT` order with stock reserved → `POST /payments/session`
  against that order → Razorpay hosted checkout → `POST /payments/verify`
  (HMAC) or webhook → `PAYMENT_CONFIRMED → ORDER_CONFIRMED`, `PAID`.
- **Server-authoritative money**: the order request no longer accepts
  prices, totals, discounts or amounts — catalogue-resolved pricing,
  locked stock checks, full coupon revalidation and all fee rules run
  server-side (see §3).
- **Idempotency without new columns**: a client `idempotencyKey` maps to
  the unique `order_number`; same-key/same-owner retries return the
  existing order, cross-owner reuse is a 409 (§4).
- **Ownership guards** on every payment-session endpoint, backed by the
  order itself (customer id or the order's own guest email) (§5).
- **Stock consistency**: decrement under row locks at placement; release
  on cancellation of unpaid orders; active sessions cancelled with the
  order (§6).
- **Secure guest claim**: the claim identity is the authenticated
  account's own email; a client-supplied email that differs is a 403 (§8).
- **Guest checkout unblocked** in the UI (auth gate removed); online
  payment instruments are collected **only** inside the Razorpay hosted
  window (fake card/UPI/netbanking forms removed); customer captured as
  separate first/last names (§10).
- **Single normalisation layer** for API responses (snake → camel) in
  `paymentsApi.js` / `ordersApi.js`; UI never scatters field mapping.

---

## 2. Canonical checkout lifecycle & order/payment states

| Trigger | order.status | order.payment_status | session |
| --- | --- | --- | --- |
| COD placed | `ORDER_CONFIRMED` | `PENDING` | — (none created) |
| Online placed | `PENDING_PAYMENT` | `PENDING` | `CREATED` (Razorpay order for `order.total`) |
| Razorpay modal closed | `PENDING_PAYMENT` | `PENDING` | `CREATED` (resumable) |
| Verify OK / webhook captured | `ORDER_CONFIRMED` (via `PAYMENT_CONFIRMED`) | `PAID` | `PAID` |
| Verify signature mismatch | `PENDING_PAYMENT` | `PENDING` | `FAILED` (order retriable) |
| Verify on cancelled order | `CANCELLED` | unchanged | `FAILED` (`ORDER_CANCELLED`) |
| Order cancelled (unpaid) | `CANCELLED` | unchanged | active → `CANCELLED`; stock released |
| Order cancelled (paid) | `CANCELLED` | `PAID` | active → `CANCELLED`; **stock not released** (§13) |
| Guest claim | unchanged | unchanged | unchanged; `customer_id` set, `guest_email` nulled, `ORDER_CLAIMED` event |

`PAID` is written in exactly two places — `verify_payment` (valid HMAC)
and the webhook handlers — both through the shared `_confirm_order_paid`
(two status-history rows + `PAYMENT_CAPTURED` timeline event). Whichever
of verify/webhook arrives first wins; the other is an idempotent no-op.

**COD sessions are no longer created** (the order-first flow needs no
session for COD). The legacy response branch in
`_build_session_response` is kept only so pre-existing COD session rows
still serialise.

---

## 3. Trust model: what the server no longer accepts

- `PlaceOrderRequest` items carry **only** `productId`, `color`, `size`,
  `quantity` (1–99). No price, total, amount or discount field exists on
  the DTO — there is nothing client-side can assert about money.
- Prices come from `catalog_product` via `_resolve_unit_price` (cart
  semantics: `original_price`, `pricing` JSON percentage/fixed,
  `min_price` floor, `max_discount` cap). Products must be `PUBLISHED`
  **and** `published=true`, available and in stock.
- Totals use the existing rules: min order ₹5,000 (waived for
  free-eligible carts), max 99 items, shipping ₹99 below the free
  threshold, express fee, COD fee ₹49.
- Coupons are **fully revalidated** at order time (`_revalidate_coupon_for_order`):
  active, valid-from/until, global usage limit, per-customer limit
  (from `coupon_redemption` rows), eligible-customer list, product
  eligibility/exclusion, minimum order value. The discount is
  **recomputed** (`_compute_coupon_discount`) — a client value is never
  trusted. `usage_count` is incremented in-transaction; a redemption row
  is written for authenticated customers.
- **Razorpay prefill is never trusted for guests.** The session `prefill`
  (name/email/contact) is built only from the authenticated user's
  verified profile. For guest orders `prefill` is `null` and the frontend
  falls back to the guest-entered details — which are never used server-side
  to assert anything; guest ownership is proven by the order's own stored
  `guest_email` (§5).
- Payment-method and delivery-method values are allow-listed
  (`upi|card|netbanking|cod`, `standard|express`); invalid values are a
  validation error before any work happens.

---

## 4. Idempotency design (existing unique column, no new columns)

- The checkout generates a per-attempt **`attemptId`**
  (`crypto.randomUUID()`), sent as `idempotencyKey`.
- Backend: `order_number = "PF-ORD-" + sha1(key)[:6].upper()` — fits the
  existing `String(50) UNIQUE` column and shares the number space of the
  pre-existing random order numbers.
- **Same key, same owner** → the existing order is returned (201); no
  duplicate, no second stock decrement, coupon usage not re-counted.
  Owner = matching `customer_id`, or `customer_id IS NULL` +
  case-insensitive `guest_email` equality.
- **Same key, different owner** → HTTP 409.
- **No key** → random `PF-ORD-XXXXXX` (existing format).
- **Frontend rotation**: the attempt id rotates whenever the order payload
  can change (customer, address, delivery method, payment method, bag
  contents) and on each review pass, retry, reset and after success.
  Unchanged retries keep the key — so "Retry payment" after a failed
  attempt resumes the same pending order (and the same active session).
- **Session idempotency**: `payment_sessions.idempotency_key` is unique;
  an active (`CREATED`/`PENDING`) session for the order is **resumed**
  (no second Razorpay order); `PAID` order → 409; `CANCELLED` order → 422.
- **Webhook re-delivery** is a no-op (session already `PAID`).

| Situation | Result |
| --- | --- |
| Same key, same owner | 201 — existing order returned |
| Same key, different owner | 409 |
| No key | new random order number |
| Active session exists | resume (same session id returned) |
| Order `PAID` / `CANCELLED` (session create) | 409 / 422 |

---

## 5. Ownership & authorization (server-side)

Payment session endpoints (`create`, `get`, `verify`, `cancel`) require
ownership of **the order** the session references:

- **Customer-owned order** → the caller must be the authenticated customer
  (`current_user.id == order.customer_id`); anonymous or another customer
  → 403. An authenticated user can never act on an *unclaimed guest*
  order.
- **Guest-owned order** → the caller must present the order's own
  `guest_email` (case-insensitive compare with `orders_order.guest_email`);
  missing or mismatched → 403.
- `GET /payments/session/{id}` takes `guestEmail` as a query parameter;
  create/cancel/verify take it in the body.
- The verify response now includes **`order_status`**, because the
  customer-facing order-detail endpoint is customer-only — a guest cannot
  fetch their own order by id, so the confirmation state must travel with
  the verify response.
- Guest checkout is therefore fully closed-loop: a guest can create,
  pay, retry, cancel and claim their own orders, and cannot touch anyone
  else's.

Security properties: no client can create a session without an order, for
another owner's order, or mark any order `PAID` without a valid signature
**and** ownership.

---

## 6. Stock consistency & cancellation

- **Placement**: product rows are read with `SELECT … FOR UPDATE`
  (`with_for_update()`) before the stock check, inside the request
  transaction (`get_db` commits at request end). Stock is decremented in
  the same transaction as the order insert — concurrent checkouts cannot
  oversell; any failure rolls back both.
- **Cancellation** (customer and admin paths share `_on_order_cancelled`):
  - `payment_status` PENDING or FAILED → reserved stock is **released**
    (per-item quantities restored under the same row locks) and any
    `CREATED`/`PENDING` session for the order is set `CANCELLED`.
  - `payment_status` PAID → stock is **not** released (see §13); sessions
    are still cancelled.
- Cancellation appends a timeline event and writes the status-history row
  through the existing transition helper.

---

## 7. Coupon handling at the order boundary

- The cart-time coupon check is **not trusted**: the order boundary
  revalidates everything (§3) and recomputes the discount.
- `fixed` / `percentage` coupons produce a cash discount, capped at the
  payable subtotal; `free_shipping` produces **₹0 discount and does not
  waive shipping** — pre-existing cart semantics, deliberately kept
  identical at the order boundary so the cart display and the order can
  never disagree (documented as a limitation, §13).
- `usage_count` increments only when the order is actually created
  (same transaction); a rejected order never consumes usage.
- A `coupon_redemption` row is written for **authenticated** customers
  (it is the basis of the per-customer limit check). Guest redemptions
  cannot be row-tracked — `customer_id` is a non-NULL FK to `users`
  (§9, §13).

---

## 8. Guest order claim (verified-email, account-derived)

`POST /orders/claim-guest`:

- Identity = **the authenticated account's own email** (server reads it
  from the user record). The request `email` field is now optional and, if
  supplied, **must equal** the account email, else 403. An account with no
  email gets a 422.
- The service claims only orders where `customer_id IS NULL` **and**
  `lower(guest_email) = lower(account email)` — one in-transaction update:
  sets `customer_id`, nulls `guest_email`, appends an `ORDER_CLAIMED`
  timeline event. Returns `{ ok, message, claimed }`.
- Idempotent: after claiming, `guest_email` is null so a second claim
  matches nothing (returns 0).
- Guessing order ids or supplying a foreign email cannot claim another
  person's orders — matching is on the stored email and the account must
  own that email.
- Frontend: `OrderContext.claimGuestOrders` calls the endpoint (no email
  sent) on sign-up and from the account orders page, then refreshes the
  server order list.

---

## 9. Guest checkout limitations (documented, schema-bound)

1. **Guest coupon redemptions are not individually tracked.**
   `coupon_redemption.customer_id` is a non-NULL FK to `users`, so a guest
   order cannot carry a redemption row. The global `usage_count` **is**
   still incremented (no runaway usage), but the **per-customer limit
   cannot be enforced for guest checkouts** without a schema change
   (nullable `customer_id` + a guest identifier — out of scope per the
   "no new columns" constraint).
2. **Guest identity is email-based.** Claim and session ownership rely on
   `guest_email` equality. A guest who checks out with a different email
   than the one they later sign up with will not have their orders
   claimed. Inherent to the schema (no guest identity store exists).
3. **Guests cannot list/cancel their orders after leaving checkout**
   (customer endpoints require an account). While the checkout is open, a
   guest's pending order can be paid or its session cancelled; admin-side
   cancellation is always available. Guest order self-service by email
   would need a new endpoint + schema-backed identity — out of scope.

---

## 10. Frontend canonical flow

- **`CheckoutContext.startPayment`** (single path, guests included):
  1. `buildPlaceOrderRequest` → identity-only payload
     (`items[productId,color,size,quantity]`, `customer{firstName,lastName,
     email,phone}`, `address`, `deliveryMethod`, `paymentMethod`,
     `couponCode`, `idempotencyKey=attemptId`).
  2. **COD**: `placeOrder` → on success `await clearCart()` → success
     screen (order already `ORDER_CONFIRMED`, payment `PENDING`).
  3. **Online**: `placeOrder` (→ `PENDING_PAYMENT`) →
     `apiCreatePaymentSession({ orderId, paymentMethod, idempotencyKey,
     guestEmail? })` → Razorpay hosted checkout → on gateway callback
     `apiVerifyPayment({...signature fields, guestEmail?})` → on `ok`,
     merge the confirmed `order_status`/`payment_status` into the order,
     `await clearCart()` → success screen.
  4. Every failure is honest: order not created → "could not be created";
     session failed → "order saved as pending, retry"; verify failed →
     "if an amount was deducted it will be automatically refunded; the
     order remains unpaid — you can retry". The cart is cleared **only**
     on server-confirmed success.
- **Auth gate removed** (`Checkout.jsx`) — guests complete checkout; the
  "Keep this order" block explains the email-based claim.
- **`CustomerInformation`** captures **First / Last name** separately
  (matching the backend DTO); no `fullName` string is kept or split
  anywhere in the checkout flow. Authenticated prefill maps the profile's
  first/last name directly.
- **`PaymentStep`** — card/UPI/netbanking **input forms removed** (audit
  P1-28): online methods show a "Secure Razorpay checkout" panel;
  instruments are entered in the gateway window. COD panel unchanged.
  Razorpay script-load failure is guarded (honest "try again", order stays
  payable).
- **Normalisation (audit P1-30)**: `paymentsApi.normalisePaymentSession`
  (snake→camel) and `ordersApi.normOrder` (synthesises `customer`,
  `address`, `pricing`, camel `items`, `paymentMethod`/`deliveryMethod`
  `{id,label}` objects; raw fields preserved for admin pages; tolerant of
  legacy local snapshots).
- **`OrderContext.createOrder`** always places via the backend (the local
  demo-order fallback is gone from checkout); **`OrderSuccess`** reads the
  server order and replaces the demo disclaimer with real
  payment-status wording.

---

## 11. Files modified

### Backend

| File | Change |
| --- | --- |
| `backend/app/schemas/orders/order.py` | `CustomerSnapshot` → `firstName`/`lastName` (required, non-blank; `fullName` not accepted); email validation/normalisation; method allow-lists; qty 1–99; `idempotencyKey` 8–100; `OrderResponse.customer` optional read-model field; `ClaimGuestOrdersResponse`; claim request `email` optional |
| `backend/app/schemas/payments/payment.py` | `guestEmail` on create/cancel/verify (normalised, optional, documented as ownership proof); `orderStatus` on verify response |
| `backend/app/services/orders/order_service.py` | `place_order` rewritten (authoritative pricing, locked stock, coupon revalidation, canonical statuses, idempotency, customer projection); `_on_order_cancelled` wired into both cancel paths; `claim_guest_orders` secure rewrite |
| `backend/app/services/payments/payment_service.py` | order-first `create_session` (COD/draft/no-order rejected; ownership; amount from `order.total`; session resume); ownership on get/cancel/verify; shared `_confirm_order_paid` (verify + webhooks); COD session creation removed |
| `backend/app/api/v1/orders.py` | claim endpoint (account-derived identity, 403/422, new response); place-order docs |
| `backend/app/api/v1/payments.py` | owner identity (user / `guestEmail` query or body) on session create/get/cancel/verify; endpoint docs |

### Frontend

| File | Change |
| --- | --- |
| `frontend/src/utils/checkout.js` | `validateCustomer` first/last; `newAttemptId()`; `buildPlaceOrderRequest()` |
| `frontend/src/context/CheckoutContext.jsx` | canonical `startPayment`; `attemptId` state/persistence/rotation; guest email on session calls; customer shape; script-load guard |
| `frontend/src/context/OrderContext.jsx` | `createOrder` backend-only; `claimGuestOrders` backend + refresh |
| `frontend/src/services/api/paymentsApi.js` | camelCase normalisation; `guestEmail`; `orderStatus`; no `orderDraft` |
| `frontend/src/services/api/ordersApi.js` | `normOrder` read-model synthesis; claim API (no untrusted email by default) |
| `frontend/src/components/checkout/CustomerInformation.jsx` | First/Last name inputs + validation |
| `frontend/src/components/checkout/PaymentStep.jsx` | fake instrument forms → secure Razorpay panel |
| `frontend/src/pages/Checkout.jsx` | auth gate removed; stale copy fixed |
| `frontend/src/pages/OrderSuccess.jsx` | canonical order read; guest-claim copy; honest payment line |

### Tests & report

| File | Change |
| --- | --- |
| `backend/tests/unit/test_phase2_checkout.py` | **new** — 43 tests |
| `frontend/tests/phase2Checkout.test.js` | **new** — 12 tests |
| `PHASE_2_IMPLEMENTATION_REPORT.md` | this report |

---

## 12. Tests executed & results

### Backend

```
cd /home/user/pfv1
PYTHONPATH=backend /tmp/pfv1-venv/bin/python -m unittest discover -s backend/tests/unit -p 'test*.py'
```

`test_phase2_checkout.py` (43): DTO contract (names required/non-blank,
method allow-lists, email normalisation, quantity bound); `place_order`
(online starts PENDING not PAID; COD confirmed/pending; catalogue pricing
with percentage discount; stock decrement + insufficient/out-of-stock/
unpublished rejection; idempotent replay & cross-owner 409; coupon
rejections — unknown/inactive/expired/start-future/min-value/per-customer
limit; discount recompute + usage increment + redemption row; guest coupon
usage without redemption row; free-shipping parity); cancellation (unpaid
→ stock released + session cancelled on customer & admin paths; paid →
stock kept); claim (matching, idempotency, route 403 on foreign email,
route accepts matching/absent email); sessions (order required; COD
rejected; cancelled/paid rejected; ownership customer+guest+anonymous;
amount from `order.total`; resume without second Razorpay order); verify
(valid → canonical 2-row confirmation + `order_status`; invalid → FAILED,
never paid; cancelled order → `ORDER_CANCELLED`; ownership; paid idempotent);
webhook (bad signature 403; captured → confirmed; amount mismatch →
FAILED).

### Frontend

```
cd /home/user/pfv1/frontend && npm test
```

`phase2Checkout.test.js` (12): `buildPlaceOrderRequest` sends identity only
(asserts no `total`/`amount`/`price`/`discount` anywhere in the payload);
customer validation (first/last required); attempt-id uniqueness; session
snake→camel normalisation; create/verify/cancel payloads incl.
`guest_email` and no `order_draft`; backend rejection surfacing; canonical
place-order passthrough; `normOrder` synthesis (customer/address/pricing/
items/method objects; raw fields preserved); guest fallback without
`customer` object; claim sends no untrusted email.

### Results

| Suite | Before | After | Result |
| --- | --- | --- | --- |
| Backend unit (unittest) | 6 pass | 49 pass (6 + 43 new) | ✅ 49/49 |
| Frontend (node:test) | 51 pass | 63 pass (51 + 12 new) | ✅ 63/63 |
| Vite production build | ✅ | ✅ | ✅ |
| `compileall` backend | ✅ | ✅ | ✅ |
| `git diff --check` | — | clean | ✅ |

All tests are unit-level with in-memory fakes — **no production DB
records, no network calls** (Razorpay provider calls are stubbed).

---

## 13. Remaining known issues (documented limitations)

1. **Abandoned `PENDING_PAYMENT` orders are not auto-cancelled.** The
   order-first flow reserves stock at creation; if the customer never
   pays and never cancels, stock stays reserved until an admin cancels
   the order (which releases it). A time-based auto-cancel job requires
   worker infrastructure (Celery) that is explicitly out of scope. Each
   abandoned attempt also consumes one `order_number` — no corruption,
   only an inventory hold.
2. **Paid-order cancellation does not release stock** (by design, pending
   the Phase 3 returns workflow): releasing immediately would allow
   double-sale before goods return; the reservation is matched by the
   return flow later.
3. **`free_shipping` coupons grant no monetary discount and do not waive
   shipping** — pre-existing cart semantics, kept identical at the order
   boundary (§7).
4. **Per-customer coupon limits cannot be enforced for guest checkouts**
   (redemption rows need a customer id — §9.1).
5. **Concurrent same-key race**: two truly parallel `POST /orders` with
   the same key both pass the pre-check; the unique `order_number`
   constraint then rejects the second insert (surfaced as an error rather
   than a polished 409/201). No duplicate order or double stock decrement
   is possible — the constraint is the authority. The realistic
   (sequential) retry case is fully handled.
6. **Razorpay amount cross-check** is best-effort: if the fetch fails the
   signature result stands (signature is the primary gate; the webhook
   confirms server-to-server regardless).
7. **Webhook on a cancelled session** marks the session `PAID` if a real
   capture arrived (the capture is factual) while the order stays
   `CANCELLED` with `payment_status=PAID` — an auditable state requiring a
   manual refund (never silently drop a real capture).
8. **Checkout storage shape change**: pre-Phase-2 saved checkouts stored a
   single `fullName`; restored sessions show empty first/last names and
   the customer re-enters them (step pulled back to step 1). No data loss;
   no local-storage migration performed.
9. **Razorpay is not live-verified here** (see §14): with placeholder
   keys, session creation fails gracefully ("order saved as pending").

---

## 14. DEFERRED — NOT CHANGED + safety confirmations

### Razorpay integration status (honest)

The integration path (Razorpay order creation, session, verify HMAC,
webhook signature, amount cross-check) is complete and unit-tested with
stubbed provider calls. **No real Razorpay transaction has been executed or
verified in this work.** `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
`RAZORPAY_WEBHOOK_SECRET` come from the private local `.env` (placeholder
defaults fail gracefully). A real capture will only be true once real keys
and a test card are used; nothing here claims otherwise.

### DEFERRED — NOT CHANGED

- Phase 3 order read-model/UI (tracking detail, invoices, returns UI).
- Employee order workflows; separate inventory system /
  `inventory_reservation_id`; media/S3/CDN; **Redis; Celery** (incl. any
  auto-cancel job); Docker architecture changes.
- Stock release on paid-order cancellation (needs the returns workflow).
- Guest order self-service and guest redemption tracking (need schema
  changes).
- Pre-existing unconnected scaffold `backend/app/services/checkout/`
  (Redis-cache stubs, not routed) — untouched; the live flow uses
  `services/orders` + `services/payments`.
- Pre-existing TODO stubs (admin analytics, employee endpoints) — untouched.
- `OrderContext` legacy local-order helpers remain for non-checkout dev
  flows; checkout no longer creates local orders.
- `frontend/public/images` — untouched (no deletions/renames/replacements).

### Safety confirmations

- ✅ **No schema changes** — no migrations, `ALTER TABLE`, new/changed
  columns or constraints, seeds. Idempotency/ownership use existing
  columns only (`order_number` UNIQUE, `customer_id`, `guest_email`,
  `payment_sessions.idempotency_key` UNIQUE, `payment_sessions.order_id`
  NOT NULL FK).
- ✅ **No mock/demo/seed business data**; no fake payment success — `PAID`
  requires a server-recomputed valid HMAC or a signed webhook.
- ✅ **Assets untouched** (no image changes, no S3/CDN); no Redis/Celery;
  Docker unmodified.
- ✅ **Razorpay credentials** only from private local env; no claim of a
  real verified transaction.
- ✅ **Tests leave no permanent records** (unit fakes only).
- ✅ **Private production `.env`** not required, not read, not committed.
- ✅ **Out-of-scope behaviour preserved** — admin/employee flows, returns,
  tracking, cart coupons, address book, account pages and all Phase 1
  security controls remain intact (all pre-existing suites green).

---

*End of Phase 2 report.*
