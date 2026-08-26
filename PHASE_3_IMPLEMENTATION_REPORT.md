# PHASE 3 — ORDER READ MODEL, ORDER DETAIL, TRACKING, INVOICE & RETURNS

**Repository:** `AJBiswojit/pfv1`
**Branch:** `arena/01a03f53-pfv1`
**Base commit:** `634d6b2`
**Date:** 2026-08-26

---

## 1. Scope

### 1.1 In scope (implemented)

| # | Area | Outcome |
|---|------|---------|
| 1 | Order read-model normalization | One canonical projector, `frontend/src/utils/orderReadModel.js`, used by every order screen. |
| 2 | Customer order list | Server-paged, sorted, with Loading / Empty / Error / Success states. |
| 3 | Customer order detail | Server-authoritative, ownership-enforced, honest about missing data. |
| 4 | Order status display | Single vocabulary in `orderConfig.js`; `order.status` and `payment.status` never conflated. |
| 5 | Order tracking / timeline | Persisted status history only; no synthesised courier scans, locations or dates. |
| 6 | Invoice display / download | Honest availability reporting; no fabricated invoice number, no fake download. |
| 7 | Returns UI over existing backend | Rewired to the real returns endpoints, per-line quantities, real pickup methods. |
| 8 | Order cancellation UI | Backend-driven eligibility; no false "stock restored" or "refund issued" claims. |
| 9 | Order response consistency | Uniform `{ok, …}` envelopes, uniform error shape carrying HTTP status. |
| 10 | Admin/customer order-read integration | Admin desks read real admin order endpoints instead of the customer-scoped local store. |

### 1.2 Out of scope (not touched)

New checkout/payment architecture, Razorpay redesign, inventory, warehouse, S3/CDN, Redis, Celery,
employee workflows, new DB schema, migrations, broad frontend redesign. See §16.

### 1.3 Hard constraints honoured

- **No schema change.** No migration, no `ALTER TABLE`, no new/renamed/dropped column, no new table,
  no constraint change, no seed or production data change. Every column used in this phase already
  existed (§17.1).
- **No image changes.** `frontend/public/images` — 238 files before, 238 after, aggregate checksum
  identical, `git status` reports zero modifications under that path (§17.2).
- **No mock data.** Every fabrication removed rather than relocated (§17.3).
- **Phase 2 trust model preserved.** No Phase 2 write path was modified (§17.4).

---

## 2. Current Order Read Architecture

### 2.1 What existed before Phase 3

The order stack had three competing sources of truth:

1. **The backend** — `orders_order` + `orders_order_item` + `orders_order_status_history` +
   `orders_return_order` + `orders_return_item`, exposed through
   `backend/app/api/v1/orders.py`.
2. **A browser-local order register** — `frontend/src/services/orders/orderService.js` persisted a
   full order lifecycle to `localStorage` under `ORDERS_STORAGE_KEY` and treated it as authoritative
   whenever no token was present.
3. **Generators** — `trackingService.js`, `orderService.buildOrderRecord`, `utils/orders.js` and
   `orderConfig.MOCK_CARRIERS` produced tracking numbers, carriers, delivery estimates, transit
   locations and invoice numbers that had never been recorded anywhere.

`OrderContext` merged all three, so a customer could be shown a carrier, a waybill, a transit city
and a delivery date for an order that the atelier had not dispatched.

### 2.2 What the read path looks like after Phase 3

```
PostgreSQL (unchanged schema)
        │
        ▼
order_service.py            ← honest projections; no invented fields
        │
        ▼
schemas/orders/order.py     ← DTOs that cannot express fabricated data
        │  (snake_case, {ok, …} envelope)
        ▼
services/api/ordersApi.js   ← thin transport; preserves HTTP status on failure
        │
        ▼
utils/orderReadModel.js     ← THE canonical projector (single normalisation point)
        │
        ├── context/OrderContext.jsx      (state + server calls)
        ├── utils/orders.js               (pure predicates over the read model)
        ├── services/orders/trackingService.js  (pure tracking projector)
        └── config/orderConfig.js         (THE status vocabulary)
                │
                ▼
        order screens (customer + admin)
```

The browser-local register still exists for the pre-existing local admin/employee fallbacks
(§16.4), but **no customer-facing order read passes through it any more**.

---

## 3. Canonical Order Read Model

### 3.1 New file — `frontend/src/utils/orderReadModel.js`

| Field | Meaning |
|---|---|
| `id`, `orderNumber` | Identity. `orderNumber` is the human-facing value; screens display it. |
| `customerId`, `customer` | Owner identity (`{firstName,lastName,fullName,email,phone}`), guest fields folded in. |
| `status`, `statusLabel`, `statusSummary` | Order lifecycle only. |
| `paymentStatus`, `paymentStatusLabel` | Payment lifecycle only. Never derived from the order status or the payment method. |
| `address` | Normalised shipping address. |
| `paymentMethod`, `deliveryMethod` | `{id,label}` / `{id,label,serviceLevel,estimate}`. |
| `items[]` | `{lineId, productId, name, image, sku, color, size, unitPrice (alias `price`), originalPrice, quantity, lineTotal, returnedQuantity, returnableQuantity}`. |
| `itemCount` | Sum of line quantities. |
| `taxAvailable: false` | There is **no tax column** on `orders_order`; no tax line is ever displayed. |
| `pricing` | `{subtotal, productDiscount, couponDiscount, couponCode, shipping, codFee, total}` — verbatim server values. |
| `tracking` | `{carrier, trackingNumber, estimatedDelivery, dispatchedAt, deliveredAt, carrierEventsAvailable:false}` — `null` where unrecorded. |
| `invoice` | `{number, issuedAt, available, documentAvailable:false, downloadUrl:null}`. |
| `cancellation` | `{at, reason, by}` or `null`. |
| `statusHistory[]`, `timeline[]`, `returns[]`, `activeReturn` | Recorded events and return records only. |
| `customerNote`, `internalNotes` | Real note records. |
| `flags` | Derived booleans (§3.3). |

**Exports:** `buildOrderReadModel`, `buildTrackingReadModel`, `buildInvoiceReadModel`,
`buildOrderStateFlags`, `normaliseReturnRecord`, `normaliseStatusHistory`, `normaliseOrderAddress`,
`isOrderCancellable`, `isOrderReturnable`, `latestReturnRecord`, `hasActiveReturn`.

### 3.2 The absence rule

Every optional value is `null` when the backend has not recorded it — never `""`, never `0`, never a
plausible placeholder. Screens branch on `null` and print an explicit unavailable state.

### 3.3 Derived flags (`buildOrderStateFlags`)

`isPaid`, `isCancelled`, `isDelivered`, `isReturnable`, `canCancel`, `canRequestReturn`,
`hasTrackingIdentity`, `hasEstimatedDelivery`, `hasInvoice`, `hasReturns`, `hasActiveReturn`.
Every flag is computed from stored values; none is inferred from the payment method or the
passage of time.

### 3.4 Change table

| File | Function / component | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/utils/orderReadModel.js` | *(new)* `buildOrderReadModel` | Each screen re-shaped raw API payloads inline, with different field names and different defaults. | One projector produces one shape for every consumer. | Single normalisation strategy; eliminates per-screen drift. | FE 51–57 |
| `frontend/src/utils/orders.js` | `normaliseOrder` | Unknown status defaulted to `ORDER_CONFIRMED`; unknown payment status defaulted from the payment method. | Both stay `null` when unrecorded. | An unknown status is not a confirmed order. | FE 65 |
| `frontend/src/utils/orders.js` | `normaliseTimeline` | Missing ids filled with `Math.random()`, so one recorded event had a new identity on every read. | Id derived from `at` + `type` + `status` + index. | Stable identity for recorded events. | Build (React key stability) |
| `frontend/src/services/orders/orderTimelineService.js` | `buildTimelineEvent`, `normaliseTimeline` | Random ids (`Math.random()`); `appendTimeline` deduplicates **by id**, so random ids silently defeated deduplication. | Deterministic ids from timestamp + type (+ monotonic sequence for newly built events). | Correct deduplication; stable rendering. | Build |
| `backend/app/schemas/orders/order.py` | `OrderResponse` | Return records were not exposed on the order. | `returns[]` and `status_history[]` travel with the order. | Admin desks and the customer detail page need them in one read. | BE `test_order_load_options_cover_returns`; FE 79 |

---

## 4. Customer Order List

### 4.1 Backend

| File | Function | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `backend/app/services/orders/order_service.py` | `list_orders` (≈676) | Returned `{orders, total}` with an implicit page. Sort was fixed. | Returns `{orders, total, page, page_size}`; sort chosen from the `ORDER_LIST_SORTS` allow-list via `_list_sort_clause`. | The client cannot page or sort against unknown metadata; an allow-list keeps sort out of SQL. | BE `test_list_returns_page_metadata`, `test_sort_is_allow_listed` |
| `backend/app/services/orders/order_service.py` | `_order_load_options` *(new)* | Relationships lazy-loaded — under async SQLAlchemy a lazy load raises, or (worse) silently yields an empty collection. | `items`, `status_history`, `returns` and `returns.items` are eagerly loaded on every order read. | Correctness under async; no order silently rendered without its lines. | BE `test_order_load_options_cover_returns` |
| `backend/app/api/v1/orders.py` | `GET /orders` | No sort parameter; page metadata not returned. | `?page&pageSize&sort=newest|oldest`; page metadata passed through; OpenAPI descriptions state what is and is not available. | Honest, paginated contract. | BE `test_list_returns_page_metadata`; FE 58 |
| `backend/app/schemas/orders/order.py` | `OrderListResponse` | `{ok, orders, total}`. | `{ok, orders, total, page, page_size}` (defaults `1` / `20`). | The list screen must know where it is. | FE `test_list_response_carries_page_metadata` |

Ownership is unchanged and still enforced by `get_current_customer`: the query is scoped to
`customer_id`, so a customer cannot page into another customer's history.

### 4.2 Frontend

| File | Component | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/pages/account/AccountOrders.jsx` | `AccountOrders` | Rendered the localStorage register; a failed fetch produced an empty list indistinguishable from "you have no orders". | Renders the server list. Four distinct states: **Loading** (`OrderLoadingState`), **Empty** (no orders yet), **Error** (`OrderErrorState` with status-specific copy), **Success**. | A backend failure must never look like an empty account. | FE 59, 60 |
| `frontend/src/components/orders/OrderCard.jsx` | `OrderCard` | Displayed an invented carrier/tracking line and a projected delivery date. | Displays order number, real status, item count, total; tracking identity only when recorded. | No fabrication on the list. | FE 51, 61 |
| `frontend/src/services/api/ordersApi.js` | `apiListOrders` | Swallowed errors into `{orders: []}`. | Returns `{ok:false, status, error}`; on success returns `{ok, orders, total, page, pageSize}`. | Errors must stay errors. | FE 58, 59, 60 |
| `frontend/src/utils/orders.js` | `matchesOrderSearch` | Searched the internal id only. | Searches order number, id, item names and SKUs. | Customers know the order number, not the UUID. | FE 61 |
| `frontend/src/components/orders/OrderErrorState.jsx` | *(new)* | 404 / 403 / 500 all rendered the same "not found" panel. | `orderErrorCopy` maps 401/403/404/409/422/500/0 to distinct copy; retry offered only where retrying can help. | Distinct handling per §Testing requirement. | FE 60, 63, 71 |
| `frontend/src/components/orders/OrderLoadingState.jsx` | *(new)* | No loading affordance. | `role="status"`, `aria-busy` loading panel. | Every order screen needs a loading state. | Build |

---

## 5. Customer Order Detail

| File | Component / function | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/pages/account/OrderDetail.jsx` | `OrderDetail` | Read from the local register; showed invented tracking, an invented invoice number, and a tax line the schema has no column for. | Fetches `GET /orders/{id}` through `fetchOrder`; renders the read model. Loading / Error (401,403,404,500) / Success. Tracking, invoice, cancellation and return panels each render an explicit unavailable state. | Server-authoritative detail; no fabricated fields. | FE 62, 63 |
| `frontend/src/context/OrderContext.jsx` | `fetchOrder` *(new)* | Detail was looked up in the local array. | `apiGetOrder(orderId)`, result merged into state; returns `{ok, order, status, error}`. | One code path for a single order read. | FE 62, 63 |
| `backend/app/services/orders/order_service.py` | `get_order` (≈719) | — | Unchanged ownership guard (`ForbiddenException` when `order.customer_id != customer_id`), now with eager loads. | Ownership remains backend-authoritative. | BE `test_tracking_requires_ownership`, `test_returns_require_ownership` |
| `frontend/src/components/orders/OrderItemList.jsx`, `OrderSummaryPanel.jsx` | — | Displayed a computed tax row. | No tax row; totals are the server's own numbers. | `orders_order` has no tax column — inventing one misstates the price breakdown. | FE 55 |

**Ownership:** a customer can never read another customer's order. The route requires
`get_current_customer`, the service compares `order.customer_id`, and the frontend never
substitutes a locally cached order for a 403.

---

## 6. Order Status & Timeline

### 6.1 Single status strategy

`frontend/src/config/orderConfig.js` is the **only** status vocabulary in the application:

- `ORDER_STATUS` — 16 canonical values, with legacy `PLACED` / `CONFIRMED` mapped through `mapsTo`.
- Journey stages 0–10; `null` for terminal/branch states (`CANCELLED`, `RETURN_*`, `REFUND_*`) —
  these are deliberately *not* points on the delivery journey.
- `ORDER_JOURNEY` / `CUSTOMER_JOURNEY` / `ORDER_TRANSITIONS`.
- `ORDER_PAYMENT_STATUS` — a **separate** vocabulary.
- `RETURN_STATUS(ES)` / `RETURN_JOURNEY`.
- Accessors `getOrderStatus`, `getPaymentStatus`, `getReturnStatus`.

Only values the backend actually writes are displayed. There is no second mapping table anywhere.

### 6.2 Order status vs payment status

These are separate columns (`orders_order.status`, `orders_order.payment_status`) and are separate
fields throughout the read model, the DTOs and the UI. Concretely:

- A **cancelled** order that was **paid** shows `Cancelled` **and** `Paid` — the money is not
  un-spent by the cancellation (§9.3).
- A **COD** order is never assumed paid; an **online** order is never assumed pending.

| File | Change | Test coverage |
|---|---|---|
| `frontend/src/utils/orderReadModel.js` | `status` and `paymentStatus` are independent fields; no cross-derivation. | FE 53, 54 |
| `backend/app/schemas/orders/order.py` | `TrackingResponse` carries `order_status` **and** `payment_status`. | BE `test_order_and_payment_status_reported_separately` |

### 6.3 Timeline

| File | Component | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/components/orders/OrderTimeline.jsx` | `OrderTimeline` | Undated future steps were given a projected date and labelled "· Estimated". | Future steps are listed with **no date at all**. Only recorded steps carry a timestamp. | A projected date is a promise the atelier never made. | FE 68 |
| `frontend/src/services/orders/returnService.js` | `getReturnTimeline` | Synthesised the steps a return "would" pass through. | Renders only recorded return history. | Same rule for returns. | Build |

---

## 7. Tracking

### 7.1 The core defect

`get_tracking` previously **manufactured** a courier narrative from the order status: a "dispatched
from Bhubaneswar" event (hard-coded `FULFILMENT_ORIGIN`), an "Out for delivery" event, and a
"Delivered" event — each stamped with `now()` rather than a recorded time. On the frontend,
`trackingService.js` additionally invented a carrier from `MOCK_CARRIERS` and a tracking number.
A customer was therefore shown a shipment history that did not exist.

### 7.2 Backend changes

| File | Function | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `backend/app/services/orders/order_service.py` | `get_tracking` (≈728) | Synthesised events from the order status with `now()` timestamps; returned a hard-coded origin city. | Events are a 1:1 projection of `orders_order_status_history`, sorted by their **stored** `created_at`. Empty history ⇒ empty `events`. No origin. | Only recorded facts. | BE `test_events_are_persisted_status_history_only`, `test_events_are_sorted_by_stored_timestamp`, `test_no_events_are_synthesised_for_a_shipped_order` |
| `backend/app/schemas/orders/order.py` | `TrackingEvent` | Free-form event with a `location`. | `{status, timestamp, from_status, actor_name, note, source:"STATUS_HISTORY"}`. No `location` field exists. | The DTO must be structurally incapable of carrying a fabricated transit location. | BE `test_tracking_event_records_its_source`; FE 69 |
| `backend/app/schemas/orders/order.py` | `TrackingResponse` | Implied a live courier feed. | Adds `carrier_tracking_available` (true only when carrier **and** waybill are recorded) and `carrier_events_available` (**structurally always `False`** — no courier integration exists). Field `origin` removed. | Honest capability reporting. | BE `test_tracking_response_defaults_are_honest`, `test_tracking_response_has_no_origin_field`, `test_carrier_events_are_never_available` |

### 7.3 Frontend changes

| File | Component | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/services/orders/trackingService.js` | **rewritten** — `buildTrackingView` | Generated carriers, waybills, transit cities and projected dates. | A pure projector over the backend tracking payload. Produces `steps[]` where each step is `{status, title, description, at, recorded, projected:false, state}`; unrecorded steps have `at: null`. A cancelled order marks every remaining step "upcoming", never "done". | No generation of any kind. | FE 68, 69 |
| `frontend/src/pages/account/OrderTracking.jsx` | **rewritten** | Rendered generated data as fact. | Async fetch of `GET /orders/{id}/tracking`; Loading / Error(401,403,404,500) / Success. Explicit panels: "No courier tracking recorded yet", "No delivery estimate has been recorded", "Courier scan updates are not available". | Honest unavailable states. | FE 67, 70, 71 |
| `frontend/src/config/orderConfig.js` | constants | `MOCK_CARRIERS`, `FULFILMENT_ORIGIN`, `TRACKING_ID_LABEL` existed. | All three deleted. `CARRIERS` remains **only** as a staff-facing input list for recording a real carrier at dispatch. | Remove the source of the fabrication. | FE 66 |
| `frontend/src/context/OrderContext.jsx` | `getTracking`, `getTrackingAdmin` | Synchronous local generators. | `getTracking` is async and server-backed; `getTrackingAdmin` projects the already-loaded admin order's recorded status history. | One tracking truth. | FE 67, 71 |

### 7.4 Capability statement

There is **no courier integration** in this system. The atelier records a carrier name and a waybill
number at dispatch; that is the entirety of the shipment data that exists. The UI now says exactly
that. See §15.2.

---

## 8. Invoice

### 8.1 Finding

`orders_order` has `invoice_number` and `invoice_issued_at` columns, but **no code anywhere in the
backend has ever written to them** (verified by grep across `backend/app`). The endpoint
`GET /admin/orders/{id}/invoice` was labelled an "invoice stub". The frontend nonetheless rendered
an invoice number and a "Download PDF" button.

### 8.2 Changes

| File | Function / component | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `backend/app/services/orders/order_service.py` | `get_invoice` (≈1228) | Returned a value shaped like an invoice regardless of whether one had been issued. | Returns `{order_id, invoice_number, issued_at, available, document_available}`; `available` is true only when `invoice_number` is set; `document_available` is **always false**. | Honest capability. | BE `test_invoice_unavailable_when_never_issued`, `test_invoice_available_when_issued` |
| `backend/app/schemas/orders/order.py` | `InvoiceResponse` | — | Adds `available` / `document_available`. Has **no** `download_url` or `url` field. | Structurally cannot advertise a document that does not exist. | BE `test_invoice_response_never_exposes_a_download_url` |
| `frontend/src/components/orders/InvoicePreview.jsx` | `InvoicePreview` | Rendered an invented invoice number and a download control. | Renders the real invoice number when issued; otherwise "No invoice has been issued for this order yet." Never renders a download control — no invoice document exists. | No fake download. | FE 75, 52 |
| `frontend/src/pages/admin/orders/AdminOrderInvoice.jsx` | `AdminOrderInvoice` | Read the local register synchronously. | Async fetch of the order **and** the invoice metadata; Loading / Error / Success; states the invoicing gap plainly. | Admin sees the same truth. | FE 76 |

### 8.3 Classification

Invoice **document** generation: **BACKEND_GAP** — no PDF pipeline, no storage, no writer for
`invoice_number`. Invoice **metadata** display: **READY** (it correctly reports "not issued", which
is the true state of every order today).

---

## 9. Cancellation

### 9.1 Backend — not redesigned

Per the constraint, the Phase 2 cancellation backend is untouched. Its rules, restated:

- **Customer-cancellable statuses:** `PENDING_PAYMENT`, `PLACED`, `PAYMENT_CONFIRMED`,
  `ORDER_CONFIRMED`, `CONFIRMED`, `PROCESSING`, `ALLOCATED`, `PICKING`.
- **Admin adds:** `PACKED`, `READY_TO_DISPATCH`.
- **Stock is released only when `payment_status` is `PENDING` or `FAILED`.** A **paid** order's
  cancellation does **not** release stock.

### 9.2 Frontend changes

| File | Component | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/pages/account/OrderDetail.jsx` | cancellation panel | Offered cancellation based on a local status guess and, on success, told the customer stock had been restored and a refund initiated. | Eligibility comes from `isOrderCancellable` (the exact backend status set). On success it reports only what the backend did: the order is cancelled. It does **not** claim stock was restored and does **not** claim a refund. | The paid-order path releases no stock and initiates no refund; saying otherwise is false. | FE 72, 73 |
| `frontend/src/utils/orders.js` | `canCancelOrder` | Locally invented eligibility. | Re-exports `isOrderCancellable` — one definition. | No divergence between what the UI offers and what the backend accepts. | FE 72 |
| `frontend/src/services/api/ordersApi.js` | `apiCancelOrder` | Errors collapsed to a generic failure. | `409` (already cancelled / not cancellable) and `422` surface distinctly with the backend's own message. | Distinct status handling. | FE 74 |

### 9.3 Refund honesty

A cancelled-but-paid order displays `Cancelled` for the order and `Paid` for the payment. The UI
states that refunds are handled by the atelier and does not display a refund status the backend has
not recorded. Verified by FE 53 and FE 73.

---

## 10. Returns

### 10.1 Backend capability (existing, unchanged)

`POST /orders/{id}/returns` with body `{items:[{lineId, quantity>=1, reason}], pickupMethod}`:

- `403` if the caller does not own the order.
- `422` unless `order.status == "DELIVERED"`.
- `422` if `(now - delivered_at).days > 7`.
- `422` for an unknown `lineId` or a quantity above the remaining returnable quantity.
- Refund amount = Σ `unit_price × quantity`, recorded on the return.

`GET /orders/{id}/returns/{returnId}` reads one return, ownership-checked. The admin returns desk
exposes approve / reject / schedule-pickup / receive / inspect / initiate-refund / complete-refund.

**There is no resolution column and no exchange capability anywhere in the schema.**

### 10.2 Changes

| File | Component / function | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/pages/account/OrderReturn.jsx` | **rewritten** | Built a return record in the browser and stored it locally when no token was present — a "return" the atelier never received. Offered a Refund/**Exchange** choice. | Async load + async submit against the real endpoint. Per-line quantity selection bounded by `returnableQuantity`. Real pickup methods. Exchange removed. Loading / Error(401,403,404,422) / Success. | A return is a real business record; only the backend may create one. | FE 77, 78, 79, 80, 81 |
| `frontend/src/context/OrderContext.jsx` | `createReturn` | Had a local fallback branch. | Always `POST /orders/{id}/returns`; refreshes the order afterwards. | No phantom returns. | FE 80, 81 |
| `frontend/src/context/OrderContext.jsx` | `approveReturn`, `rejectReturn`, `scheduleReturnPickup`, `receiveReturn`, `inspectReturn`, `initiateReturnRefund`, `completeReturnRefund` | All seven mutated a local record only — the admin desk appeared to work while the database was untouched. | `applyReturnMutation` calls the real admin endpoint, then `refreshAdminOrders()`. Returns `{ok, record, status, message}`. | The returns desk must actually operate on the business record. | Build; FE 79 |
| `frontend/src/config/orderConfig.js` | `RETURN_RESOLUTIONS` → `RETURN_RESOLUTION` | Offered "Refund" or "Exchange". | A single documented refund resolution; `RETURN_PICKUP_METHODS` (`SCHEDULED_PICKUP`, `CUSTOMER_DROP_OFF`) added to match the backend column. | Exchange does not exist; offering it fabricates a service. | FE 80 |
| `frontend/src/services/orders/returnService.js` | `validateReturnRequest`, `createReturnRecord` | Required the customer to choose a resolution. | Requirement removed; refund is stated as the only outcome. | Consistency with the schema. | Build |
| `frontend/src/utils/orders.js` | `returnWindow`, `canRequestReturnNow`, `returnBlockedReason`, `RETURN_WINDOW_DAYS=7` | The UI offered returns the backend would reject. | The UI mirrors the backend's own rules, including "unknown delivery date ⇒ window unknown ⇒ not offered". | Never offer an action that will 422. | FE 78, 79 |
| `frontend/src/components/orders/ReturnSummaryCard.jsx` | — | Displayed a synthesised return progression. | Displays recorded return status, refund amount and refund status only. | Recorded facts only. | Build |

### 10.3 Capability classification

| Capability | Classification | Note |
|---|---|---|
| Create a return request (per-line, with reason and pickup method) | **READY** | Full backend rules, wired end to end. |
| Read a return (customer, ownership-checked) | **READY** | |
| Returns embedded on the order record | **READY** | Eager-loaded; used by customer detail and both admin desks. |
| Return window enforcement (7 days from delivery) | **READY** | Enforced backend-side, mirrored in the UI. |
| Admin approve / reject | **READY** | |
| Admin schedule pickup | **READY** | Stores `pickup_scheduled_at` + `pickup_address`. |
| Admin receive / inspect (condition + notes) | **READY** | |
| Refund **status tracking** (`initiate` / `complete`) | **PARTIALLY_IMPLEMENTED** | The status transitions and the amount are recorded, but **no money moves** — there is no gateway refund call. The UI states that the atelier records refund progress and that settlement is handled separately. |
| Actual gateway refund execution | **BACKEND_GAP** | No Razorpay refund integration. Out of Phase 3 scope (payment architecture). See §16.2. |
| Exchange as a return resolution | **BLOCKED** | No column, no table, no capability. Cannot be built without a schema change, which is forbidden. Removed from the UI. |
| Customer-supplied note on a return request | **BACKEND_GAP** | `orders_return_order` has no customer-note column. The field was removed rather than collected and discarded. |
| Return shipping label / courier pickup booking | **BACKEND_GAP** | No integration; not offered. |

---

## 11. Guest Order Behavior

### 11.1 Documented limitation

**Guests cannot list their historical orders after leaving checkout unless those orders are claimed
into an account.** `GET /orders` requires `get_current_customer`; there is no guest order-listing
endpoint, and building one from a guest email alone would let anyone enumerate another person's
orders by guessing an email address. This is a deliberate limitation, not a defect.

What a guest **can** do:
- See the order they just placed on `/order-success` (in-memory for that session).
- Create an account with the same email and claim the orders (`POST /orders/claim-guest`).

### 11.2 Claim path (Phase 2 rule preserved)

`claim_guest_orders` binds on `customer_id IS NULL AND lower(guest_email) = <the authenticated
account's own email>`. **No client-supplied email is accepted.** The frontend sends no email.

| File | Function | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/context/OrderContext.jsx` | `claimGuestOrders` | — | Unchanged trust behaviour; now refreshes the server order list after a successful claim so claimed orders actually appear. | Claimed orders must become visible. | FE 82, 83 |
| `frontend/src/pages/OrderSuccess.jsx` | `OrderSuccess` | Showed a promised delivery date and a generated tracking id. | Shows the real order number and links to sign-up with `returnTo=/account/orders`; explains the claim path. | No fabrication; honest guest guidance. | Build |

---

## 12. Admin Order Reads

### 12.1 The defect

`AdminOrders`, `AdminReturns` and `AdminReturnDetail` all read `allOrders` from `OrderContext` —
which is populated by the **customer-scoped** `GET /orders` call. For an admin (who is not a
customer) this list was empty, so the fulfilment desk rendered 14 metric tiles all reading zero and
an empty order table, while `apiAdminListOrders` sat imported and never called.

### 12.2 Changes

| File | Component / function | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/context/OrderContext.jsx` | `refreshAdminOrders` *(new)* | `apiAdminListOrders` was imported but never invoked. | Guards on the **admin** token scope (`getAccessToken("admin")`), calls `apiAdminListOrders({pageSize:100, …})`, sets `orders`/`isLoadingOrders`/`ordersError`/`ordersErrorStatus`, returns `{ok, orders, total, status, error}`. | The admin desks need admin-scoped data. | Build; FE 60 (status preservation) |
| `frontend/src/pages/admin/orders/AdminOrders.jsx` | `AdminOrders` | Rendered zeroed metrics from the customer list; no loading or error state. | Fetches on mount; loading banner (`role="status"`, only while the list is genuinely empty) and error banner (`role="alert"`, distinct 401/403 copy, "Try again" only where a retry can help). Displays `orderNumber`; search covers order number, SKU and the real tracking number. | A real desk over real data, with honest failure states. | Build |
| `frontend/src/pages/admin/orders/AdminOrderDetail.jsx` | `AdminOrderDetail` | Synchronous local read; dispatch form pre-filled a carrier; notes read a non-existent `{text, by}` shape. | Async load with Loading / Error / Success. Dispatch inputs are blank with explicit placeholders ("Select a location…", "Select a handler…", "Select a carrier…"). Notes read the real backend shape `{id, authorId, authorName, note, createdAt}`. | No implied assignment, no invented carrier, notes actually render. | Build |
| `frontend/src/pages/admin/AdminReturns.jsx` | `AdminReturns` | Customer-scoped list, no loading/error state. | `refreshAdminOrders` on mount; loading and error banners; search covers `returnNumber` and the parent `order.orderNumber`. | Real returns desk. | Build |
| `frontend/src/pages/admin/AdminReturnDetail.jsx` | `AdminReturnDetail` | An in-flight fetch was reported as "Return not found". | Loading branch precedes the not-found branch; the not-found state has real copy and a back-link to `/admin/returns`. | A pending read is not a missing record. | Build |
| `backend/app/services/orders/order_service.py` | `admin_list_orders`, `admin_get_order` | Customer identity was not attached to admin reads. | `_attach_customer_info` populates `{firstName,lastName,fullName,email,phone}` per order. | The desk needs to know whose order it is. | BE `test_admin_list_attaches_customer_identity` |
| `frontend/src/pages/employee/EmployeeOrderDetail.jsx` | dispatch panel | Fabricated a tracking number (`TRK-<timestamp>`) when the field was blank and stamped a hard-coded estimated delivery date, both shown to the customer as fact. | Carrier and the real waybill are **required**; the Dispatch button is disabled until both are present; no delivery date is promised. Internal notes read the real backend shape. | This was the origin of most fabricated tracking data. | Build |

### 12.3 Admin/customer isolation

Admin reads go through admin-scoped routes with the admin token; customer reads go through
customer-scoped routes with the customer token. `apiClient` keeps the token scopes separate
(`pf_access_token` vs `pf_admin_*`), and a refresh failure clears only the failing scope. No admin
read ever runs on a customer token, and no customer read is ever served from admin data.

---

## 13. API Normalization

### 13.1 Response envelope

Every order-related response is `{ok: true, …payload}`. Collections carry their metadata:

| Endpoint | Envelope |
|---|---|
| `GET /orders` | `{ok, orders[], total, page, page_size}` |
| `GET /orders/{id}` | `{ok, order}` |
| `GET /orders/{id}/tracking` | `{ok, order_id, order_status, payment_status, carrier, tracking_number, estimated_delivery, dispatched_at, delivered_at, cancelled_at, carrier_tracking_available, carrier_events_available, events[]}` |
| `POST /orders/{id}/returns`, `GET …/returns/{rid}` | `{ok, return_order}` |
| admin returns list | `{ok, returns[], total}` |
| `GET /admin/orders/{id}/invoice` | `{ok, order_id, invoice_number, issued_at, available, document_available}` |

Bodies are snake_case; the frontend converts to camelCase in exactly one place
(`orderReadModel.js`).

### 13.2 Error mapping

`backend/app/core/exceptions.py` (unchanged) maps cleanly onto the UI:

| Exception | HTTP | UI treatment |
|---|---|---|
| `UnauthorizedException` | 401 | "Please sign in again." One silent refresh retry, then the session-expired event. |
| `ForbiddenException` | 403 | "This order isn't available on your account." (Deliberately identical to 404 copy so it cannot be used to probe for the existence of another customer's order.) |
| `NotFoundException` | 404 | Same copy as 403. |
| `ConflictException` | 409 | The backend's own message (e.g. "Order already cancelled."). No retry offered. |
| `BusinessLogicException` | 422 / `BUSINESS_RULE_VIOLATION` | The backend's own rule message (e.g. "Return window of 7 days has expired."). No retry offered. |
| unhandled | 500 | "Something went wrong at our end." Retry offered. |
| network failure | 0 | "Check your connection." Retry offered. |

| File | Function | Old behavior | New behavior | Reason | Test coverage |
|---|---|---|---|---|---|
| `frontend/src/services/api/ordersApi.js` | `handleError` | Returned `{ok:false, error}` with the status discarded, so every failure looked the same. | Returns `{ok:false, error, status, data}`. | Screens cannot handle 401/403/404/409/422/500 distinctly without the status. | FE 60, 63, 71, 74, 81, 83 |
| `frontend/src/services/api/ordersApi.js` | all wrappers | `normOrder` duplicated normalisation. | Every wrapper delegates to `buildOrderReadModel` / `buildTrackingReadModel` / `buildInvoiceReadModel` / `normaliseReturnRecord`. | One normalisation point. | FE 62, 67, 76, 80 |

### 13.3 The no-empty-success rule

No API wrapper converts a failure into a successful empty payload. A failed list returns
`{ok:false, status}` with **no** `orders` key at all, so a caller cannot accidentally render it as
"you have no orders". Asserted directly by FE 59.

---

## 14. Tests & Verification

### 14.1 Commands and results

| Command | Result |
|---|---|
| `python -m compileall backend/app` | **OK** — clean |
| `PYTHONPATH=backend python -m unittest discover -s backend/tests/unit -p 'test*.py'` | **72 tests, OK** (49 pre-existing Phase 1/2 + 23 new Phase 3) |
| `npm test` (in `frontend/`) | **98 pass, 0 fail** (63 pre-existing + 35 new Phase 3) |
| `npm run build` (in `frontend/`) | **✓ built in 9.86s** — `dist/index.html` 2,737.89 kB |
| `git diff --check` | **clean** |
| `frontend/public/images` integrity | **238 files before and after; aggregate checksum unchanged; zero modifications reported by `git status`** |

Phase 1 and Phase 2 suites are **green and unmodified**.

> Environment note: the system Python is externally managed, so the backend suite runs in
> `/tmp/pfv1-venv` built from `backend/requirements.txt`.
>
> Lint note: the repository contains **no** `eslint.config.*` or `.eslintrc*`, and a fresh `npx
> eslint` installs ESLint 10 which refuses to run without a flat config. Rather than introduce an
> out-of-scope lint configuration, the Vite production build is used as the compile/import check.

### 14.2 New backend tests — `backend/tests/unit/test_phase3_order_reads.py` (23)

**Tracking honesty (7)** — events are persisted status history only · events sort by stored
timestamp · nothing synthesised for a shipped order (asserts "Bhubaneswar" and "Out for delivery"
appear nowhere) · carrier events never available · shipment identity passed through or reported
unavailable · order and payment status reported separately · tracking requires ownership.

**Tracking schema (3)** — `TrackingResponse` defaults are honest · no `origin` field exists ·
`TrackingEvent` records its source.

**Invoice (3)** — unavailable when never issued · available when issued (but still no document) ·
`InvoiceResponse` has no `download_url`/`url` field.

**Order list (3)** — page metadata returned · sort is allow-listed (including an injection-shaped
input falling back to the default) · `OrderListResponse` carries page metadata.

**Returns (5)** — ownership required · DELIVERED required · return window enforced · cannot return
more than remains · unknown line rejected.

**Admin reads (2)** — customer identity attached to admin list · eager-load options cover `items`,
`status_history`, `returns` and `returns.items`.

### 14.3 New frontend tests — `frontend/tests/phase3OrderReads.test.js` (35)

| Area | Count | Checks |
|---|---|---|
| Canonical read model | 7 | No invented tracking/carrier/delivery date · no invented invoice or download · order vs payment status separate · payment status never derived from payment method · totals verbatim and no tax · per-line returnable quantity · an order with no readable lines is kept, not dropped |
| Order list | 4 | Server page + allow-listed sort · a failure is a failure, never an empty list · 401/403/404 preserved distinctly · search matches the human-facing order number |
| Order detail | 2 | Canonical read model for one order · 403 distinguishable from 404 |
| Status normalisation | 3 | One vocabulary, real values only · unknown status no longer defaults to `ORDER_CONFIRMED` · fabrication constants gone from the config surface |
| Tracking | 5 | Events from persisted history only · unrecorded steps carry no date and are never marked "estimated" · no transit location ever produced · shipment identity unavailable until dispatch records it (and courier events still unavailable even with a waybill) · a tracking failure carries its status |
| Cancellation | 3 | Eligibility matches the backend's cancellable status set exactly · cancelling returns the server's record and a paid order stays paid · 409 surfaces as a conflict |
| Invoice | 2 | Availability reported honestly, never a URL · admin invoice metadata normalised |
| Returns | 5 | Offered only for delivered orders with un-returned lines · the UI mirrors the backend return window · unknown delivery date ⇒ window unknown, not assumed open · real per-line quantities and pickup method posted · 422 surfaces the backend's own reason · embedded returns normalised for the admin desks |
| Guest claim | 2 | Still sends no client-supplied email · a failed claim reports its status |
| Derived flags | 1 | Every flag answered from real backend values |

**Total new focused regression checks: 58 (23 backend + 35 frontend) — against a requirement of ≥22**,
covering all eight required areas: order list, order detail, tracking, cancellation, invoice,
returns, guest claim, and normalization.

---

## 15. Remaining Limitations

1. **Guest order history.** A guest cannot list past orders. Only the just-placed order is visible,
   and history requires claiming into an account (§11.1). Building a guest listing from an email
   alone would be an enumeration vulnerability.
2. **No courier tracking feed.** The system records a carrier name and a waybill at dispatch and
   nothing more. There are no live scans, no transit locations and no carrier-provided ETA.
   `carrier_events_available` is structurally `false`.
3. **No estimated delivery date is ever promised.** `orders_order.estimated_delivery` exists but no
   code writes it, so it is always `null` and the UI says so.
4. **No invoice document.** `invoice_number` / `invoice_issued_at` are never written by any code
   path, so every order truthfully reports "no invoice issued". There is no PDF generator and no
   document storage.
5. **Refunds are recorded, not executed.** The returns desk records refund initiation and
   completion with an amount, but no gateway refund call exists. The UI never claims money has
   moved.
6. **No exchanges.** BLOCKED on the schema; removed from the UI rather than faked.
7. **No customer note on a return request.** No column exists; the field was removed rather than
   collected and silently discarded.
8. **No tax breakdown.** `orders_order` has no tax column. `taxAvailable` is `false` and no tax line
   is rendered.
9. **Paid-order cancellation does not release stock.** This is the Phase 2 behaviour, preserved
   deliberately. The UI no longer claims that it does.
10. **`OrderContext` remains local-first for the non-order-read admin/employee write paths.**
    `adminPost(apiFn, localFn)` still falls back to the browser-local `orderService` when no admin
    token is present. Every **order-read** path and all seven **returns-desk** mutations are now
    server-backed, but the fulfilment write actions (allocate, pick, pack, dispatch, …) retain their
    pre-existing local fallback. Employee workflows are explicitly out of Phase 3 scope; see §16.4.
11. **`allOrders` consumers still on customer scope.** `useEmployeeNavBadges.js`,
    `AdminCustomerDetail`, `AiBusinessAssistant`, `AdminAnalytics`, `EmployeeDesk`,
    `EmployeeOrders`, `EmployeeReports` and `analyticsService.js` still read the shared `orders`
    array without calling `refreshAdminOrders`. They are out of scope (analytics / employee
    surfaces); see §16.5.
12. **No end-to-end test against a live database.** All tests are unit-level with mocked I/O, matching
    the existing Phase 1/2 test infrastructure.

---

## 16. DEFERRED — NOT CHANGED

| # | Exact limitation | Why deferred | Future phase that should address it |
|---|---|---|---|
| 1 | **No courier integration.** No carrier API client, no webhook receiver for scans, no label generation, no pickup booking. `carrier_events_available` is hard-`false`. | Requires a new external integration, credentials, a webhook endpoint and (for stored scans) a new table — all out of the stated scope and impossible without a schema change. | A dedicated Logistics / Shipping Integration phase. |
| 2 | **No gateway refund execution.** `initiate_refund` / `complete_refund` move a status and record an amount; no Razorpay refund API call is made. | Explicitly out of scope — "no Razorpay redesign", "no new payment architecture". | The Payments / Refunds phase. |
| 3 | **No invoice document pipeline.** No PDF renderer, no template, no storage, and no writer for `invoice_number` / `invoice_issued_at`. | Requires document generation and object storage; S3/CDN is explicitly out of scope. | An Invoicing & Documents phase (with the storage decision made there). |
| 4 | **Employee fulfilment write workflows.** `EmployeeOrders`, `EmployeeDesk`, `EmployeeAssistedOrder` and the `adminPost` local fallbacks in `OrderContext` still write to the browser-local register when no token is present. Only the fabricated *display* data in `EmployeeOrderDetail` (invented tracking number, hard-coded delivery date, wrong note shape) was corrected, because it fed fabricated data to customers. | "Employee workflows" are explicitly out of scope. Rewiring the write paths is a substantial change to a surface this phase was told not to touch. | An Employee Operations phase. |
| 5 | **Analytics and badge consumers of `allOrders`.** `analyticsService.js`, `AdminAnalytics`, `AiBusinessAssistant`, `AdminCustomerDetail`, `useEmployeeNavBadges`, `EmployeeReports` compute over the shared, customer-scoped `orders` array and will under-report for admin users. | Analytics is not an order-read surface named in the scope, and correcting it means designing server-side aggregation. | An Analytics & Reporting phase. |
| 6 | **`orderService.js` local order lifecycle (832 lines).** The full browser-local status machine still exists and is still reachable through the untouched fallbacks. | Deleting it would break the out-of-scope employee/admin write surfaces that still depend on it. | The Employee Operations phase, once every write is server-backed. |
| 7 | **`orders_order.internal_notes` and `timeline` are JSON columns**, so notes and timeline events cannot be queried, indexed or paginated server-side. | Normalising them requires new tables — forbidden. | A schema-evolution phase. |
| 8 | **`orders_order_status_history` has no `source` column**, so the API reports a constant `source:"STATUS_HISTORY"`. If courier scans are ever ingested they will need a distinguishable source. | Requires a new column — forbidden. | The Logistics phase, together with #1. |
| 9 | **No return shipping label or courier pickup booking.** `pickup_scheduled_at` and `pickup_address` are recorded, but nothing is booked with a courier. | Same integration dependency as #1. | The Logistics phase. |
| 10 | **`backend/app/services/orders/order_status_service.py` is a 4-line near-empty module.** | Removing or filling it is not required by any Phase 3 behaviour, and deleting a module is an unrelated change. | Whichever phase next touches status orchestration. |
| 11 | **`frontend/tests/retired-demo-architecture/` and `frontend/tests/temporary/` are not executed** by `npm test` (the runner globs `tests/*.test.js` only). | Changing the test glob is an unrelated change and would surface failures from retired architecture. | A test-infrastructure cleanup phase. |
| 12 | **No ESLint configuration exists in the repository.** | Adding one is an unrelated change and would produce a large, out-of-scope diff. | A tooling/CI phase. |
| 13 | **`frontend/src/services/orders/demoOrders.js`** still exists as an intentionally-empty generator (`generateDemoOrders() => []`). | It produces no data, so it is not a fabrication source; deleting the file is an unrelated change. | The Employee Operations phase, alongside #6. |

---

## 17. Safety Confirmations

### 17.1 Database schema — UNCHANGED

- ✅ No migration file created, modified or run.
- ✅ No `ALTER TABLE`, `CREATE TABLE`, `DROP TABLE` or `CREATE INDEX` anywhere in the diff.
- ✅ No column added, renamed, dropped or retyped. No model file under `backend/app/models/orders/`
  was modified — `git status` shows zero changes there.
- ✅ No constraint, default or nullability change.
- ✅ No seed data and no production data touched.
- ✅ Every field used in this phase maps to a pre-existing column: `order_number`, `status`,
  `payment_status`, `carrier`, `tracking_number`, `estimated_delivery`, `dispatched_at`,
  `delivered_at`, `cancelled_at`, `cancellation_reason`, `invoice_number`, `invoice_issued_at`,
  `internal_notes`, `timeline`, `returned_quantity`, `pickup_method`, `refund_amount`,
  `refund_status`.
- ✅ Where a feature could not be built on the existing schema (exchange resolution, customer return
  note, courier scan storage, invoice document) the work **stopped** and the gap is documented in
  §10.3, §15 and §16 rather than being invented.

### 17.2 Images — UNTOUCHED

- ✅ `frontend/public/images`: **238 files before, 238 files after.**
- ✅ Aggregate MD5 over all file checksums: **`0f3647892c2cbd6d955d17d1b0cbbed0`** — unchanged.
- ✅ `git status --porcelain -- frontend/public/images` returns **zero lines**.
- ✅ Nothing deleted, renamed, moved, replaced, optimised or migrated to object storage.

### 17.3 No mock / demo / fake data

- ✅ Fabricated tracking events, carriers, waybills, transit locations and delivery dates: **removed**
  from `order_service.get_tracking`, `trackingService.js`, `orderConfig.js` (`MOCK_CARRIERS`,
  `FULFILMENT_ORIGIN`, `TRACKING_ID_LABEL` deleted) and `EmployeeOrderDetail.jsx`.
- ✅ Fabricated invoice numbers and download links: **removed**; `InvoiceResponse` has no URL field.
- ✅ Locally-created return records: **removed**; returns are server-only.
- ✅ localStorage is no longer authoritative for any customer order read.
- ✅ Random identifiers on read (`Math.random()` in `utils/orders.js` and `orderTimelineService.js`):
  **replaced** with deterministic, content-derived ids.
- ✅ No demo orders are generated; `generateDemoOrders()` returns `[]`.
- ✅ Every missing backend capability produces an explicit "unavailable" state and a documented gap.

### 17.4 Phase 2 trust model — PRESERVED

| Phase 2 rule | Status |
|---|---|
| Server-authoritative pricing, totals and coupons | ✅ Read-only display of server values; no client recomputation. |
| Stock locked at order placement | ✅ `place_order` untouched. |
| Payment-session ownership enforced | ✅ `payment_service.py` untouched. |
| HMAC signature and webhook verification | ✅ Untouched. |
| No client-controlled `PAID` | ✅ Untouched; the read model never writes a payment status. |
| Idempotent retry (deterministic order number, 409 on owner mismatch) | ✅ Untouched. |
| Guest ownership and secure guest claim (account email only, no client email) | ✅ Untouched and re-asserted by FE 82. |
| Cart clears only after server-confirmed success | ✅ `CheckoutContext` untouched. |
| Paid-order cancellation does not release stock | ✅ Backend untouched; the UI no longer claims otherwise. |

**No Phase 2 / Phase 3 conflict arose.** Where Phase 3 could have improved a Phase 2 behaviour
(e.g. executing refunds on cancellation), Phase 2 was preserved and the gap documented (§16.2).

### 17.5 No unrelated changes

- ✅ 26 files modified, 5 files added — all within the order read stack.
- ✅ Every out-of-scope issue encountered is recorded in §16 as deferred, not silently fixed.
- ✅ `git diff --check` is clean.

---

*End of Phase 3 report.*
