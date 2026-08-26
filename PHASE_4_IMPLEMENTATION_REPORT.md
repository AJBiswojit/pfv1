# PHASE 4 — CUSTOMER CART, WISHLIST & ACCOUNT CONSISTENCY

**Date:** 27 August 2026 · **Branch:** `arena/01a03f8f-pfv1` · **Scope:** END_TO_END_INTEGRATION_AUDIT.md §23 Phase 4 items 1–5 plus §23 Phase 6 item 1 (customer order/spend aggregation), §9/§9.2 (cart, wishlist, recently viewed, style preferences), §16 C-08/C-31, §18 stale language.

**Baseline preserved:** 238 image files, aggregate MD5 `0f3647892c2cbd6d955d17d1b0cbbed0` — unchanged. All Phase 1–3 behaviour intact.

---

## 1. Scope

Phase 4 closes the customer-data seams the audit flagged:

| §23 Phase 4 item | Status |
|---|---|
| 1. Align cart line identity and method-dependent server totals | **DONE** |
| 2. Await account actions and implement customer password change | **DONE** |
| 3. Join backend recently viewed with UI consumers | **DONE** |
| 4. Decide/persist style preferences if supported | **DECIDED + DOCUMENTED** (intentional device-local store) |
| 5. Harden wishlist application validation, FKs stay deferred | **DONE** |
| (§23 Phase 6 item 1, customer part) order/spend aggregation | **DONE** |

Out of scope (unchanged): DB FK additions (schema frozen), session-claim minting (identity/token territory), AI Mirror / AI Shopping demo surfaces (already labelled), payment gateway integration (Phase 2 contract holds).

---

## 2. What Was Wrong (audit findings addressed)

- **C-08:** the frontend minted its own cart line id (raw string) while the backend hashes a lower-cased `(product_id, colour, size)` triple — an authenticated selection was never recognised as the existing line, so quantity adds and Buy Now could duplicate lines.
- Cart totals ignored delivery/payment method, so the bag disagreed with the order boundary (express is never free; COD adds ₹49; cart `get_totals` even had a `delivery_method == "free"` branch the order boundary does not have).
- Account pages fired mutations without awaiting them, re-deriving optimistic state the backend never confirmed; password change did not exist for customers.
- `POST /cart/items` payloads sent absolute merged quantities computed from possibly-stale local state; server merges are authoritative.
- Wishlist accepted unknown/unpublished product ids (no FK on `commerce_wishlist_item.product_id`); the mutation response could reflect a stale relationship collection; the frontend invented a "product" shape for saved ids it could not resolve.
- Admin customer list/detail hardcoded `order_count = 0` / `lifetime_spend = 0.0` (TODO comments in `customer_service.py`).
- Recently viewed was a split brain: the PDP wrote `POST /products/recently-viewed` (authenticated) while `useRecentlyViewed()` read a localStorage store — account/AI consumers never saw server history, and guests recorded nothing.
- Session summaries always reported `isCurrent: false` and "revoke others" revoked every session — both undocumented.
- Stale Phase-0 language survived in live commerce surfaces ("no real payment service", "legacy mock handler", the PDP pincode widget fabricating "Delivery is available to {pincode}").

---

## 3. Cart Line Identity (audit C-08)

- `utils/shopping.js` — `cartLineId` lower-cases colour/size before hashing the triple, mirroring `cart_service._cart_line_id` (sha1 of the lower-cased triple, 16 chars). `findCartLine` matches any line by the triple **case-insensitively**; server lines keep the backend's own `item.id` verbatim.
- `CartContext.addToCart` resolves intent through `utils/cartState.resolveAddIntent`:
  - **Authenticated:** the payload carries ONLY the requested increment (`{productId, color, size, quantity: requested}`) — the backend merges the triple and clamps to stock. `requested` defaults to `selection.quantity ?? 1`, so held-quantity and Buy Now flows stay correct.
  - **Guest:** merged locally under the canonical `guestLineId`; case-variant duplicates merge with summed quantities (the same semantics the server applies).
- Verified both directions: PDP quantity steppers now recognise an existing authenticated line, and Buy Now for a line already in the bag increments it instead of adding a second line.

---

## 4. Server Cart Is Canonical; Failures Stay Failures

`CartContext` was rebuilt around one rule: **the server response is the cart.**

- `applyServerCart` is the single funnel for every successful response (`loadCart`, add/update/remove/coupon/clear) — lines, coupon, `couponLapsed`, and totals all come from the backend payload via `serverCartToState` (server line ids, product projections, line totals and `couponLapsed` kept verbatim; `stock → maximum`).
- A failed authenticated load sets `error`/`errorStatus` and **never** falls back to the guest cart or an empty "success". 401/422/500 each surface with their status. `loadError`-style honesty matches AccountContext.
- `mutationInFlight` guards concurrent mutations; buttons disable on `cart.isSyncing`.
- Product hydration merges two **backend** sources: money/stock/availability from the cart response's product projection (freshest server read), the complete display shape (labels, subcategory, original price) from the backend-fed catalogue snapshot; the projection alone covers products the snapshot has not loaded. No product records are invented inside cart state; unresolved ids are fetched in the background (`ensureProduct`) rather than guessed.

---

## 5. Method-Dependent Server Totals

- Backend: `cart_service.get_totals` now mirrors `order_service._compute_shipping` exactly — express ₹199 flat (never free), standard ₹99 / complimentary at ≥ ₹5,000, COD ₹49 — and the parity is **unit-asserted** (`CartTotalsTests` compares against `_compute_shipping` across method/subtotal combinations). The docstrings state the shared-constant rule; `EXPRESS_SHIPPING_FEE = 199` is now defined once in the service.
- Frontend: authenticated checkout display totals come from `GET /cart/totals` (`apiGetCartTotals`), keyed by `[userId, deliveryMethod, paymentMethod, cartFingerprint]` where the fingerprint is the sorted `id:qty` join plus the coupon code. A method/bag change invalidates the quote and shows the presentation estimate until fresh server numbers arrive. Guests and fetch failures fall back to `calculateCheckoutTotals` — display-only either way: **the placed order's amounts are always recomputed by the Phase 2 order boundary** (asserted: order payloads carry no price/total/amount/discount keys and no server line ids).

---

## 6. Guest Cart Policy (documented, not merged)

- The backend has no guest cart contract, so the guest cart stays an explicitly client-only, localStorage store (`utils/cartState.restoreGuestCart`/`persistGuestCart`), validated server-side at checkout.
- Sign-in: the **server cart replaces the guest view** (no merge endpoint exists — inventing one client-side would violate the audit's rule against local business decisions). The guest cart is preserved in storage and restored on sign-out, so nothing is lost.
- Guest totals are presentation (`calculateCartTotals`) and are labelled as such in code; every money number a guest sees is re-derived by the order boundary at placement.

---

## 7. Wishlist Validation & Honest Unavailable States

- Backend (`wishlist_service.py`): `_validate_product_savable` rejects adds/toggle-adds for products that do not exist or are not storefront-visible (`PUBLISHED` + `published`) with a 404 — an application-level guard standing in for the missing FK (schema untouched). Adds are idempotent; mutation responses now reflect the mutation (items are attached through the loaded relationship, with a re-read guard where the identity map would serve a stale collection). Reads keep orphan ids **verbatim** so clients can show an honest "no longer available" state instead of silently dropping them.
- Frontend (`utils/wishlistState.buildWishlistEntries`): a saved id resolves to `{id, product, unavailable}` — `unavailable` is true only for ids the backend confirmed gone, never merely because the catalogue snapshot has not loaded yet (unresolved-but-unconfirmed still renders, fetching in the background). WishlistContext renders from these entries; Wishlist.jsx shows an honest unavailable chip with a remove action.
- Route docs in `api/v1/wishlist.py` state the visibility rule and idempotency contract.

---

## 8. Move-to-Wishlist Sequencing

`ShoppingContext.moveToWishlist` delegates to `utils/shoppingMoves.moveLineToWishlist`: `await` the wishlist add, and only on success remove the bag line. A failed add leaves the bag untouched (no data loss window); a failed remove after a successful add surfaces the error while the wishlist holds the saved piece. Ordering is unit-tested.

---

## 9. Account Profile, Addresses & Awaits

- `AccountContext` is backend-authoritative: every mutation (`updateProfile`, `addAddress`, `updateAddress`, `deleteAddress`, `setDefaultAddress`, preferences, avatar removal) **awaits** the API and then re-reads/merges only confirmed server state. No optimistic updates. A failed profile load exposes `loadError` (rendered honestly, not as empty data).
- Deleting the default address does **not** re-promote another address locally — the backend owns default promotion, and the UI re-reads after deletion (parity asserted).
- `memberSince` shows "—" when the backend sends no `created_at` (C-31: camel/snake aliases `loyaltyTier`, `loyaltyPoints`, `createdAt` are all read).
- Address modal/pages: awaited saves, per-field backend validation messages, honest disabled/submitting states; pincode/phone rules match the backend schema (unit-asserted both sides).
- Avatar: honestly unavailable — removal is `avatar: ""` per contract; no fake upload.

---

## 10. Password Change & Sessions (with documented backend gaps)

- `apiChangePasswordCustomer` (`POST /auth/change-password`, `ChangePasswordRequest` with `currentPassword`/`newPassword`): the backend verifies the current password; on success the frontend signs the customer out and routes to `/signin` after a short confirmation. Pre-flight mismatch blocks the request client-side (tested). All security-page buttons disable while `isUpdating`.
- **BACKEND_GAP (documented at the routes AND service docstrings):** the access token carries no session id claim, so (a) every `activeSessions[]` entry is `isCurrent: false` — the security page lists sessions without a "current device" badge and says so; (b) `POST /customers/me/sessions/revoke-others` revokes **all** active sessions including the caller's — the button is labelled "Sign Out All Devices" with copy "Signing out ends every session — including this one — so you'll sign in again afterwards." Remediation path (mint a `sid` claim; the service already accepts the argument) is documented in-code.

---

## 11. Recently Viewed — The Split Brain Is Closed

- `useRecentlyViewed` is now server-canonical when authenticated: it fetches `GET /products/recently-viewed` and account/AI consumers render exactly what the server holds. A successful empty read shows as empty; only a **failed** read falls back to the local cache.
- `record()` writes the local store first (optimistic) and, when authenticated, POSTs the view and re-reads the canonical list. `ProductDetail` records through the hook — **guests now get a local history at all** (previously nothing was recorded for them), and authenticated history lands on the server.
- Guest→sign-in: guest entries are pushed to the server once per sign-in (best-effort, oldest first so recency order survives); the local guest scope is cleared **only if every push succeeded**, so a failed push never loses data.
- Route/method fidelity of both endpoints and the local store semantics (fronting repeats, 12-entry cap, merge-once, ids+timestamps only) are unit-tested.

---

## 12. Style Preferences — Decision Recorded

**Decision: not a supported backend feature in Phase 4; remains an intentional device-local store.** The backend has no style-preferences contract, so the store is classified with the guest cart (client-only state), NOT presented as server data:

- `services/customer/stylePreferences.js` carries the BACKEND_GAP note and names the single seam (`saveStylePreferences`/`getStylePreferences`) to swap for API calls if a contract is added.
- The preferences page copy is honest about it: notes "stay on this device", and the saved confirmation reads "saved to this device".
- The dashboard's style section only shows what the customer actually chose or actually viewed — nothing is invented ("Never invents taste").

---

## 13. Admin Customer Order/Spend Aggregates (§23 Phase 6 item 1, customer part)

- `REVENUE_ORDER_STATUSES` is now defined once in `app/core/constants.py`; `analytics.py` imports it (no behavioural change) and `customer_service.py` uses it for the new aggregates.
- `CustomerService._order_aggregates_for` runs ONE grouped query per page/detail: `order_count` counts every order placed (any status — an honest "orders placed" number); `lifetime_spend` sums `OrderModel.total` over revenue statuses only, mirroring the analytics overview, so cancelled orders count as orders but not spend.
- The hardcoded `order_count=0` / `lifetime_spend=0.0` TODOs in `list_customers` and `get_customer_detail` are gone. `customersApi.normaliseProfile` carries `orderCount`/`lifetimeSpend`/`status` through (admin payloads only; absent on `/customers/me`), and `AdminCustomerDetail` renders the backend numbers (with the status field no longer hardcoded to "ACTIVE"). `AdminCustomers` segments (NEW/ACTIVE/RETURNING/HIGH VALUE) are derived labels over the now-real values.
- Unit tests assert: aggregates flow into list/detail responses, customers without orders default to 0/0.0, and the generated SQL is a GROUP BY over `customer_id` restricted to revenue statuses for spend (CANCELLED excluded).

---

## 14. Stale Language & Fabricated Promises Removed

- `checkoutConfig.PAYMENT_METHODS` doc: "UI/demo options only — no real payment service" → method **choices** are presentation, money is real backend flow (payment session → Razorpay → server-side verify); pointer to `startPayment`.
- `CheckoutContext` "legacy mock handler … real flow goes through startPayment" block comment → `startPayment` IS the payment path; no mock handlers remain.
- PDP pincode widget (`ProductPurchasePanel.DeliveryCheck`): previously claimed "Delivery is available to {pincode}" for any 6-digit code. There is no serviceability endpoint, so it now validates format and shows the same deterministic standard-delivery estimate checkout uses (`getDeliveryEstimate`), explicitly "confirmed at checkout" — no fabricated serviceability promise; made-to-order gets its own honest copy.
- Demo/AI surfaces keep their explicit labels ("Demo preview · Apparel edit", "Demo assistant · deterministic") — classification, not removal.

---

## 15. Tests & Verification

**Backend** — `backend/tests/unit/test_phase4_customer_data.py` (29 tests, no DB/network):

- `CartTotalsTests` — `get_totals` parity with `order_service._compute_shipping` across methods/subtotals (express never free, standard threshold, COD fee).
- `CartLineIdentityTests` — `_cart_line_id` 16-char hash, case-insensitive.
- `WishlistServiceTests` — unknown/DRAFT/unpublished → 404; idempotent add; mutation responses reflect state; orphan ids verbatim.
- `CustomerSchemaTests` / `AddressSchemaTests` — camel aliases round-trip; phone/pincode rules match the frontend contract.
- `SessionIdentificationTests` — `isCurrent` always false; revoke-others revokes all three sessions (gap pinned by test).
- `AdminCustomerAggregatesTests` — real aggregates through list/detail; zero defaults; SQL grouping/revenue-status semantics.

**Frontend** — `frontend/tests/phase4CustomerData.test.js` (32 node:test cases):

- Cart API route/method/body fidelity (GET/POST/PATCH/DELETE items, coupon apply/remove, totals), increment-only authenticated adds, case-insensitive identity, guest dedupe-sum, `couponLapsed` verbatim, totals passthrough vs presentation-only guest totals.
- Failures stay failures (401/422/500 surface with status; no silent empty-success).
- Wishlist routes + honest unavailable entries; `moveLineToWishlist` ordering (bag untouched when the add fails).
- Address CRUD/default routes + aliases; change-password pre-flight blocks mismatched confirmation; checkout payload identity-only (no prices/totals/server line ids).
- Recently viewed: both endpoints' route/method/scope fidelity; local store fronting/cap/merge semantics; storage holds ids + timestamps only.

**Suites:** backend `python -m unittest discover` **101/101 OK** (72 pre-Phase-4 + 29); frontend `npm test` **130/130 pass** (98 pre-Phase-4 + 32); `npm run build` ✓ (production bundle builds, 7.6 s); `python -m compileall backend/app` ✓; `git diff --check` clean; images untouched (238 files, MD5 `0f3647892c2cbd6d955d17d1b0cbbed0`).

---

## 16. Remaining Limitations (carried, with owners)

1. **Session identity (backend, future phase):** no `sid` claim → `isCurrent` always false and revoke-others is effectively revoke-all. Documented at `customers.py` routes + `customer_service` docstrings; service already accepts the argument once tokens carry it.
2. **Style preferences (backend, undecided feature):** device-local by classification; swap seam documented in `stylePreferences.js`.
3. **Wishlist FKs (schema, deferred by audit instruction):** application-level validation only; orphan ids surface honestly.
4. **Guest cart merge (backend, no contract):** guest cart preserved and restored around sign-in/out; no client-side merge.
5. **PDP serviceability (backend, no contract):** pincode widget shows a labelled estimate, not a promise.
6. **Razorpay stays in test mode** per Phase 2; no payment-flow changes were made in Phase 4.

---

*All four phase reports (`PHASE_1…4_IMPLEMENTATION_REPORT.md`) now cover audit §23 phases 1–4 plus the customer-aggregation slice of phase 6. The storefront, cart, wishlist, checkout and account surfaces render server truth or honest states — never demo data.*
