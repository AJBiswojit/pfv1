# PRATIKSHYA FASHON — AUTHORITATIVE API CONTRACT

**Document Version:** 1.0.0 (Phase 1 Foundation)  
**Status:** Authoritative Standard  
**Base URL:** `/api/v1` (mounted at `http://<host>:<port>/api/v1` or proxied via Vite `/api/v1`)

---

## 1. Overview & Transport Conventions

This document establishes the official API contract between the frontend React application and the FastAPI backend for Pratikshya Fashon.

* **Protocol:** HTTP/1.1 or HTTP/2 over TLS
* **Base Prefix:** All API endpoints are mounted under `/api/v1` (except the system health probe at `/health`).
* **Content Negotiation:**
  * Requests with payloads must specify `Content-Type: application/json` (or browser-set `multipart/form-data` for file uploads).
  * Responses return `Content-Type: application/json` with UTF-8 encoding.

---

## 2. Authentication Scopes & Authorization

All API interactions must explicitly declare one of four supported authentication scopes at the API client boundary. URL-prefix guessing is prohibited.

### 2.1 Supported Scopes

| Scope | Description | Token Source (`localStorage`) | Authorization Header |
|---|---|---|---|
| `none` / `public` | Public storefront & pre-auth endpoints (e.g. browsing products, signing in) | None | Omitted |
| `customer` | Authenticated customer endpoints (e.g. cart, orders, wishlist, account profile) | `pf_access_token` | `Authorization: Bearer <token>` |
| `admin` | Authenticated administrator endpoints (e.g. catalog management, fulfillment, analytics) | `pf_admin_access_token` | `Authorization: Bearer <token>` |
| `employee` | Authenticated employee portal endpoints (e.g. employee profile, assigned products) | `pf_employee_access_token` | `Authorization: Bearer <token>` |

### 2.2 Token Refresh Mechanics

* **Isolation:** Refresh operations are strictly isolated per scope. An admin request will never refresh using a customer token.
* **Concurrency:** Simultaneous 401 Unauthorized responses for the same scope are deduplicated via an in-flight refresh mutex (`refreshPromises[scope]`).
* **Retry Policy:** On successful refresh, the original request is retried once (`isRetry: true`). If refresh fails, only the tokens for that specific scope are cleared, and a `pf:session-expired` event is dispatched with `{ detail: { scope } }`.

---

## 3. Request & Response Payload Conventions

### 3.1 Request Payload Convention (Frontend → Backend)

* **JSON Property Naming:** `snake_case` is the primary backend schema convention.
* **Input Deserialization:** Backend Pydantic models use `populate_by_name=True` to accept both `snake_case` and `camelCase` where applicable.
* **Null vs Omitted:**
  * In `POST` (creation): omitted fields receive schema defaults.
  * In `PATCH` (updates): only supplied keys are updated; omitted fields remain unchanged on the server. Explicit `null` values clear nullable fields.

### 3.2 Response Payload Convention (Backend → Frontend)

* **JSON Property Naming:** Responses are projected into `camelCase` DTOs (e.g., `productId`, `originalPrice`, `shippingAddress`, `createdAt`).
* **Arrays & Lists:** Empty collections are returned as `[]` (never `null`).
* **Booleans:** Booleans are returned as native JSON `true` / `false` (never strings `"true"` / `"false"`).
* **Identifiers:**
  * System entity IDs are strings (UUIDs or formatted business IDs like `PF-ORD-1001`, `PRD-001`).
  * Relational IDs are string/integer path parameters encoded safely.

### 3.3 Enums

Enums are serialized as uppercase string literals across both requests and responses:
* **Product Status:** `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `ARCHIVED`
* **Product Review State** (`product.review.state`): `NONE`, `PENDING`, `APPROVED`, `REJECTED`
* **Order Status:** `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `RETURNED`
* **Payment Status:** `PENDING`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED`
* **Taxonomy Status:** `ACTIVE`, `DRAFT`, `ARCHIVED`

> **Corrected in Phase 3 Block 6.** This section previously declared six product
> statuses — `DRAFT, REVIEW, APPROVED, PUBLISHED, REJECTED, ARCHIVED`. Three of
> those (`REVIEW`, `APPROVED`, `REJECTED`) were never statuses in the
> implementation; they are **review states**. `status` (visibility) and
> `review.state` (approval) are two independent axes and always have been. The
> document was wrong, not the code, and no status has been renamed. See §11.

**Product status is not a review state.** A product sits at `PENDING_REVIEW`
both before and after approval — approval moves `review.state`, never `status`.
The only transition into `PUBLISHED` is the explicit publish action (§11.2).

**Review flags** (`product.reviewFlags`) are review *signals*, never a second
status system. The declared vocabulary is:

| Kind | Flags |
|---|---|
| **Blocking** — publication is refused while any of these stand | `NAME_REVIEW_REQUIRED`, `PRICE_REVIEW_REQUIRED`, `TAXONOMY_REVIEW_REQUIRED`, `GROUP_REVIEW_REQUIRED`, `VARIANT_REVIEW_REQUIRED`, `NEEDS_MEDIA`, `MEDIA_OWNERSHIP_REVIEW`, `CONFLICT_UNRESOLVED`, `KIDS_MIGRATION_REVIEW` |
| **Informational** — recorded history, never blocking | `CONFLICT_REVIEW_LATER`, `MEDIA_OWNERSHIP_MOVED`, `MEDIA_UNASSIGNED` |

`POST /admin/products/{id}/review-flags/clear` validates its `flags` array
against this vocabulary; an unknown flag is a **422 `VALIDATION_ERROR`** naming
it, not a silent no-op.

---

## 4. Canonical Error Contract

All backend errors (validation, application, HTTP status, rate limits, and unhandled exceptions) emit a single, predictable JSON error envelope.

### 4.1 Canonical Error Envelope

```json
{
  "success": false,
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human-readable error description.",
    "details": {}
  }
}
```

### 4.2 Validation Errors (HTTP 422)

When request parameters, headers, or body payloads fail Pydantic validation, the backend returns HTTP 422 with the complete, un-truncated array of field-level errors:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload or parameters",
    "details": [
      {
        "type": "string_too_short",
        "loc": ["body", "password"],
        "msg": "String should have at least 8 characters",
        "input": "123"
      }
    ]
  }
}
```

Frontend `apiClient` preserves this entire `details` array on `err.details`, allowing UI forms to render inline field errors.

### 4.3 HTTP Status Code Semantics

| Status | Error Code | Description |
|---|---|---|
| **200 OK** | — | Successful query or synchronous update. |
| **201 Created** | — | Resource successfully created. |
| **204 No Content** | — | Successful operation with no return body. |
| **400 Bad Request** | `BAD_REQUEST` / specific code | Client malformed request or semantic precondition failure. |
| **401 Unauthorized** | `UNAUTHORIZED` | Authentication required, expired token, or invalid credentials. |
| **403 Forbidden** | `FORBIDDEN` | Caller lacks the necessary role or permission for this resource. |
| **404 Not Found** | `NOT_FOUND` | Requested entity, endpoint, or section does not exist. |
| **409 Conflict** | `CONFLICT` | Resource collision (e.g. duplicate SKU, email, or slug). |
| **422 Unprocessable Entity** | `VALIDATION_ERROR` / `BUSINESS_RULE_VIOLATION` | Schema validation failure or domain business rule rejection. |
| **429 Too Many Requests** | `RATE_LIMIT_EXCEEDED` | IP or account rate limit exceeded. |
| **500 Internal Server Error** | `INTERNAL_SERVER_ERROR` | Unexpected server crash. Returns standard envelope without leaking stack traces. |

---

## 5. Frontend Error Normalization (`ApiError` & `handleError`)

The frontend `apiClient` maps all transport results into a canonical shape:

### 5.1 `ApiError` Class Properties

```javascript
class ApiError extends Error {
  name: "ApiError"
  message: string          // Human-readable summary
  status: number           // HTTP status (0 for network dropouts)
  code: string             // "VALIDATION_ERROR", "NOT_FOUND", "NETWORK_ERROR", etc.
  details: any             // Field-level error array or metadata
  data: any                // Raw parsed response body
  isNetworkError: boolean  // true if connection failed before reaching server
}
```

### 5.2 Canonical `handleError` Return Shape

Every API module exports/uses `handleError(err)` which guarantees:

```javascript
{
  ok: false,
  error: string,           // Primary error message for UI display
  status: number,          // HTTP status code (or 0 for network failure)
  code: string,            // Machine-readable error code
  details: any,            // Structured validation details or null
  data: any,               // Full server response payload or null
  isNetworkError: boolean  // Connection failure indicator
}
```

---

## 6. Pagination & Query Conventions

* **Query Parameters:** `page` (1-indexed integer, default `1`), `pageSize` (integer, default `20`).
* **Filtering:** Explicit query parameters (e.g. `status=ACTIVE`, `q=searchterm`).
* **Pagination Envelope:**
  ```json
  {
    "items": [...],
    "total": 142,
    "page": 1,
    "pageSize": 20
  }
  ```

---

## 7. Taxonomy & Collections Domain (Phase 2 Canonical Endpoints)

### 7.1 Categories & Subcategories
* **Storefront Categories**: `GET /categories?status=ACTIVE` (`scope: "none"`) — returns only ACTIVE categories.
* **Storefront Subcategories**: `GET /categories/{categoryId}/subcategories?status=ACTIVE` (`scope: "none"`).
* **Admin Categories List**: `GET /admin/categories` (`scope: "admin"`) — returns all statuses (`DRAFT`, `ACTIVE`, `ARCHIVED`) with server-computed `productCountTotal`.
* **Admin Category Detail**: `GET /admin/categories/{id}` (`scope: "admin"`).
* **Admin Category Create**: `POST /admin/categories` (`scope: "admin"`, payload: `CategoryCreateRequest`) — born in `DRAFT` status.
* **Admin Category Update**: `PATCH /admin/categories/{id}` (`scope: "admin"`, payload: `CategoryUpdateRequest`).
* **Category Dedicated Lifecycle Endpoints**:
  * `POST /admin/categories/{id}/activate` (`scope: "admin"`) → `status = "ACTIVE"`
  * `POST /admin/categories/{id}/archive` (`scope: "admin"`) → `status = "ARCHIVED"`
  * `POST /admin/categories/{id}/restore` (`scope: "admin"`) → `status = "ACTIVE"`
* **Subcategory Dedicated Lifecycle Endpoints**:
  * `POST /admin/subcategories/{id}/activate` (`scope: "admin"`) → `status = "ACTIVE"`
  * `POST /admin/subcategories/{id}/archive` (`scope: "admin"`) → `status = "ARCHIVED"`
  * `POST /admin/subcategories/{id}/restore` (`scope: "admin"`) → `status = "ACTIVE"`

### 7.2 Collections
* **Storefront Collections**: `GET /collections?status=ACTIVE` (`scope: "none"`).
* **Admin Collections List**: `GET /admin/collections` (`scope: "admin"`).
* **Admin Collection Create**: `POST /admin/collections` (`scope: "admin"`, payload: `CollectionCreateRequest`) — born in `DRAFT` status. Validates `endDate >= startDate`.
* **Admin Collection Update**: `PATCH /admin/collections/{id}` (`scope: "admin"`, payload: `CollectionUpdateRequest`). Validates effective date range.
* **Collection Dedicated Lifecycle Endpoints**:
  * `POST /admin/collections/{id}/activate` (`scope: "admin"`) → `status = "ACTIVE"`
  * `POST /admin/collections/{id}/pause` (`scope: "admin"`) → `status = "PAUSED"`
  * `POST /admin/collections/{id}/archive` (`scope: "admin"`) → `status = "ARCHIVED"`
  * `POST /admin/collections/{id}/restore` (`scope: "admin"`) → `status = "DRAFT"`
* **Product Assignment**: `PUT /admin/collections/{id}/products` (`scope: "admin"`, `{ productIds: string[] }`).

### 7.3 Taxonomy Metrics & Product Counts
* **Taxonomy Metrics**: `GET /admin/taxonomy/metrics` (`scope: "admin"`) — returns total categories, subcategories, and collections by status.
* **Per-Collection Counts**: `GET /admin/taxonomy/product-counts` (`scope: "admin"`) — returns resolved product counts per collection.


---

## 8. Product ↔ Taxonomy Contract (Phase 3 Block 2)

### 8.1 Canonical request fields

The product write contract has **no `categoryId` / `subcategoryId` fields**. The
taxonomy reference travels in the two long-standing fields of
`ProductCreateRequest` / `ProductDraftRequest` / `ProductUpdateRequest` /
`EmployeeProductUpdateRequest`:

| Field | Type | Required | Meaning |
|---|---|---|---|
| `category` | `string` | no | A `catalog_category` reference — its **id** (canonical), or its `slug` or `name`. |
| `subcategory` | `string \| null` | no | A `catalog_subcategory` reference — its **id** (canonical), or its `slug` or `name`, scoped to the resolved category. |

Responses (`AdminProduct`, `StorefrontProduct`) mirror the same two field
names. Since Block 2 the value they carry is the **canonical row id**.

### 8.2 Validation rules (server-authoritative)

The backend is the only authority; the columns carry **no foreign key** and no
migration was introduced for this contract.

1. **Resolution** — an incoming reference is resolved against
   `catalog_category` / `catalog_subcategory` by **id, then slug, then name**.
2. **Existence** — a reference that resolves to nothing is rejected. It is never
   stored, and the write does not partially apply.
3. **Assignable status** — a taxonomy node may only be **assigned** while it is
   `ACTIVE`. Assigning a `DRAFT` or `ARCHIVED` category/subcategory is rejected.
   The rule applies **only to the field the request writes**: a patch that does
   not touch `category` is never failed by that category's status, so content
   edits on a product under an archived node keep working.
4. **Relationship** — the subcategory must **belong to** the resulting category.
   Two individually valid ids that do not form a pair are rejected. A
   subcategory sent without any resulting category is rejected.
5. **Canonicalisation** — what is persisted is the resolved row **id**, so the
   visibility gate, the admin filters and the editor's selects share one
   vocabulary.
6. **PATCH semantics are preserved** — taxonomy validation runs only when the
   request body actually carries `category` and/or `subcategory`. Omitted
   fields are neither validated nor written. An explicit `null` follows the
   existing nullable contract (`category` is `NOT NULL` with a `""` default, so
   `null` is a no-op on update; `subcategory` is nullable and is cleared).

Enforced on: `POST /admin/products`, `POST /admin/products/draft`,
`PATCH /admin/products/{id}`, `PATCH /employee/products/{id}`.

**Known gap:** `POST /admin/products/bulk` can still write `category` /
`subcategory` without this validation — bulk pair semantics (per-product
resolution, partial failure reporting) are a separate contract decision and are
deferred.

### 8.3 Error contract

Every taxonomy rejection is the Phase 1 envelope with **HTTP 422** and
`code = "VALIDATION_ERROR"`. `details` is the FastAPI field-error list, so a
service-raised rejection is indistinguishable from a schema-raised one:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Subcategory 'cat-lehengas-bridal' does not belong to category 'Sarees'.",
    "details": [
      {
        "loc": ["body", "subcategory"],
        "field": "subcategory",
        "msg": "Subcategory 'cat-lehengas-bridal' does not belong to category 'Sarees'.",
        "type": "value_error.taxonomy.subcategory_category_mismatch",
        "input": "cat-lehengas-bridal"
      }
    ]
  }
}
```

| `type` | Condition |
|---|---|
| `value_error.taxonomy.unknown_category` | The category reference resolves to no row. |
| `value_error.taxonomy.category_status` | The assigned category is `DRAFT` or `ARCHIVED`. |
| `value_error.taxonomy.unknown_subcategory` | The subcategory reference resolves to no row. |
| `value_error.taxonomy.subcategory_status` | The assigned subcategory is `DRAFT` or `ARCHIVED`. |
| `value_error.taxonomy.subcategory_category_mismatch` | The subcategory exists but belongs to another category. |
| `value_error.taxonomy.subcategory_without_category` | A subcategory was assigned with no resulting category. |

`loc[1]` is always the field the caller actually sent, so a category-only patch
that breaks the stored pair reports against `category`, and a subcategory-only
patch reports against `subcategory`. No SQL, driver text or stack trace is ever
included, and no taxonomy rejection returns HTTP 500.

---

## 9. Product Identity Contract — SKU & Slug (Phase 3 Block 3)

### 9.1 Scope

`sku` and `slug` are **catalogue-unique identity fields**. Three write paths
share one rule set — `POST /admin/products`, `POST /admin/products/draft` and
`PATCH /admin/products/{id}`. `POST /admin/products/bulk` cannot write either
field (they are not in the bulk whitelist), and the employee update surface
cannot write them either.

### 9.2 Supplied vs generated

| Caller sends | Server behaviour |
|---|---|
| `slug`/`sku` present and free | Stored **verbatim** (surrounding whitespace trimmed). The server never rewrites the operator's value. |
| `slug`/`sku` present and taken | **HTTP 409 `CONFLICT`**. Nothing is written. |
| `slug` absent, `null` or `""` on create | Generated from the product name (`_slugify`), de-duplicated with `-1`, `-2`, … |
| `sku` absent, `null` or `""` on create | Generated as `XX-#####`. |
| `slug`/`sku` omitted on PATCH | Unchanged. |
| `slug`/`sku` explicitly `null` on PATCH | No-op — both are `NOT NULL` columns with a `""` default, so the null is dropped before the write. |
| PATCH sends the product's **own** current value | Accepted (HTTP 200). The row being patched is excluded from the uniqueness probe. |

### 9.3 Comparison rule

Collision detection is **case-insensitive** and **whitespace-trimmed**:
`"  PF-SAR-0001 "` collides with `"pf-sar-0001"`. The value is nevertheless
**persisted in the caller's own casing** — normalisation decides *conflict*,
never *storage*. Legacy rows holding `""` are treated as "no identity" and are
never reported as a collision.

### 9.4 Error contract

Both conflicts use the Phase 1 canonical envelope with **HTTP 409** and
`code = "CONFLICT"`. Unlike a 422, `details` is an **object**, not a field list:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Slug 'banarasi-silk' is already in use.",
    "details": {
      "field": "slug",
      "value": "banarasi-silk",
      "suggestedSlug": "banarasi-silk-2"
    }
  }
}
```

| Condition | Message | `details` |
|---|---|---|
| Duplicate SKU | `SKU '<value>' is already in use.` | `{ field: "sku", value }` |
| Duplicate slug | `Slug '<value>' is already in use.` | `{ field: "slug", value, suggestedSlug }` |
| Duplicate product id (create draft) | `Product ID '<id>' is already taken.` | `{}` (unchanged from Phase 5) |

`suggestedSlug` is deterministic for a given catalogue state: it is the first
free `<slug>-<n>` computed with the same case-insensitive probe used for
enforcement, so a caller that retries with the suggestion cannot receive a
second 409 for the same reason. A duplicate never returns 500 and never leaks
SQL, driver text or a stack trace.

`GET /admin/products/availability?sku=&slug=&excludeId=` answers with the
**same** comparison rule and the same `suggestedSlug` computation — it calls the
same service helpers, so the pre-flight probe cannot disagree with the write
that follows. See §9.6.

### 9.5 Concurrency limitation (explicit)

Uniqueness is enforced **in the service layer** (a `SELECT` before the insert /
update), not by a database constraint: `ix_catalog_product_sku` and
`ix_catalog_product_slug` are still **non-unique** indexes. Two requests racing
on the same value inside the same window can therefore both pass the probe and
both commit, producing a duplicate that the API would have rejected
sequentially. Closing this requires UNIQUE constraints plus a de-duplication
pass over existing rows, which is a **Phase 4 migration** and is deliberately
out of scope here.

### 9.6 Identity pre-flight — `GET /admin/products/availability`

**Scope:** `admin` (permission `products.view`). Read-only; it never writes.

| Query parameter | Type | Meaning |
|---|---|---|
| `sku` | `string` (optional) | SKU to test. Omitted/blank ⇒ `skuTaken` is `false`. |
| `slug` | `string` (optional) | Slug to test. Omitted/blank ⇒ `slugTaken` is `false`. |
| `excludeId` | `string` (optional) | The product currently being edited. That row is excluded from the probe, so its **own** SKU/slug reports as free — matching what `PATCH` accepts. Omit it when creating. An id matching no row excludes nothing. |

```json
{ "ok": true, "skuTaken": false, "slugTaken": true, "suggestedSlug": "banarasi-silk-2" }
```

`suggestedSlug` is `null` unless `slugTaken` is `true`. It is produced by the
same generator the 409 uses, with the same `excludeId`, so the value the probe
offers and the value the conflict offers are identical and are guaranteed free
at that moment.

**Agreement with the write path is structural, not coincidental.** The endpoint
calls the very same `_product_with_sku` / `_product_with_slug` /
`_generate_unique_slug` helpers as `_assert_sku_available` /
`_assert_slug_available`; there is no second copy of the collision rule. So the
trim, the case-insensitive comparison (§9.3) and the self-exclusion behave
identically on both.

**Pre-flight is a convenience, not the guarantee.** The authority is the 409 in
§9.4, raised by the create/update endpoints themselves. Between the probe and
the write another request can take the value, so a `skuTaken: false` answer can
still be followed by a 409 — clients must handle it (this is the same
service-layer concurrency window described in §9.5, widened by the round-trip).
A client must never treat a successful probe as permission to skip 409 handling,
and the server must never relax the 409 because a probe exists.

**Client usage.** The admin product editor calls this endpoint (debounced) as
the sole authority for the product's own SKU/slug, passing `excludeId` only for
a product that already exists on the server. A failed probe yields **no**
verdict — neither free nor taken — and never blocks a save. Variant SKUs are
**not** covered: the backend has no variant identity contract, so the editor's
variant-collision check remains a local, best-effort one.

---

## 10. Storefront Visibility & Publication Gate (Phase 3 Block 5)

### 10.1 Scope

Governs every **public** product read. One predicate
(`ProductService._taxonomy_visible`) is applied by all of them, so no two
surfaces can disagree about a row:

| Surface | Endpoint |
|---|---|
| Catalogue listing | `GET /api/v1/products` |
| Product detail (PDP) | `GET /api/v1/products/{idOrSlug}` |
| Explore | `GET /api/v1/explore` |
| Search | `GET /api/v1/search` |
| Category page | `GET /api/v1/categories/{categoryId}/products` |
| Collection page | `GET /api/v1/collections/{collectionId}/products` |
| Recommendations | `GET /api/v1/products/{id}/recommendations` |
| Recently viewed | `GET /api/v1/products/recently-viewed` |

Admin and employee product reads are **not** gated — they are separate,
authenticated surfaces and are expected to see every lifecycle state.

### 10.2 The gate

A product is publicly visible **iff all four** hold:

1. `catalog_product.status == "PUBLISHED"`
2. `catalog_product.published IS TRUE`
3. its `category` does **not** resolve to a `catalog_category` row whose
   `status` is anything other than `ACTIVE`
4. its `subcategory`, **when set**, does not resolve to a `catalog_subcategory`
   row whose `status` is anything other than `ACTIVE`

Rule 4 is new in Block 5. Archiving a subcategory now removes its products from
every customer surface, matching what archiving a category has always done and
what the category model's own docstring promises.

Rules 3 and 4 resolve a reference by **id, then slug, then name** — the same
triple the write path canonicalises against (§8.2). Block 2 normalises every new
write to the row **id**; slug/name keys exist only for legacy rows.

**Unresolvable references fail OPEN.** A `category` or `subcategory` string that
matches no taxonomy row does **not** hide the product. This is a deliberate,
documented carry-over, not an oversight: flipping the default to fail-closed
would silently remove every legacy row whose taxonomy string was never
reconciled, and that reconciliation requires a read-only report over the real
production catalogue which has not yet been produced.

### 10.3 Gates that deliberately do **not** exist

| Candidate | Gated? | Note |
|---|---|---|
| Collection status / membership | No | Collections only *narrow* a query, never gate. |
| Inventory / `stock` / `availability` | No | Projected, never filtered. An out-of-stock published product stays visible and is labelled, not hidden. |
| Cover image present | No — at read time | Enforced once, at **publish** time, by `getPublishIssues`. |

### 10.4 Approval is not publication

`review.state` and `status` are two independent axes (§3.3), and only `status`
+ `published` decide visibility.

| Action | Endpoint | Writes | Storefront effect |
|---|---|---|---|
| Submit | `POST /products/{id}/submit-review` | `status=PENDING_REVIEW`, `review.state=PENDING` | none — still hidden |
| **Approve** | `POST /admin/products/{id}/approve` | `review.state=APPROVED` **only** | **none — still hidden** |
| **Publish** | `POST /admin/products/{id}/publish` | `status=PUBLISHED`, `published=true`, `publishedBy`, `publishedAt` | becomes visible |
| Unpublish | `POST /admin/products/{id}/unpublish` | `status=DRAFT`, `published=false` | becomes hidden |
| Archive | `POST /admin/products/{id}/archive` | `status=ARCHIVED`, `published=false` | becomes hidden |

**`approve` never publishes.** It leaves `status` at `PENDING_REVIEW` and
`published` at `false`, and an approved-but-unpublished product is absent from
every listing and returns `404` on its PDP. Going live always costs a second,
explicit, separately authorised `publish` call, which is itself gated on
`review.state == "APPROVED"` **and** an empty `getPublishIssues()` list.
A client must never infer visibility from an `APPROVED` flag.

### 10.5 Access semantics for a non-visible product

A public read of a product that fails the gate returns the **same canonical
`404 NOT_FOUND`** as a product that does not exist — identical status, identical
`error.code`, identical envelope (§4.1):

```json
{ "success": false,
  "error": { "code": "NOT_FOUND",
             "message": "Product 'PF-WOM-0001' not found.",
             "details": {} } }
```

This is intentional and is **not** a `403` or a `409`: the public API must not
let a caller distinguish "hidden from you" from "does not exist", or the
endpoint becomes a draft-enumeration oracle. Admins preview unpublished records
through the authenticated admin route (`GET /admin/products/{id}`), never
through the public one.

### 10.6 Freshness

The gate is evaluated server-side on every uncached read; the frontend never
decides visibility and a cached product list is never proof of publication.

* **Product writes** (create, update, every lifecycle transition, duplicate, id
  change) call `invalidate_product_cache`, which drops
  `product:storefront:{id}` / `{slug}` and both response-cache layers.
* **Taxonomy writes** (category/subcategory create, update, activate, archive,
  restore) drop the `product:storefront:*` namespace as well as the response
  cache. This is required, not belt-and-braces: `get_storefront_product`
  returns its cached DTO *before* it evaluates the gate, so without this a
  product would stay reachable on its PDP for the rest of the TTL after its
  category or subcategory was archived.

Guarantee: after a `publish`, a **fresh** request sees the product; after an
`unpublish`, `archive`, or a taxonomy archive, a **fresh** request does not.

---

## 11. Product Lifecycle Transitions

Added in Phase 3 Block 6 (plan §24 step 8). This section **declares the guard
set**: the source states each lifecycle action accepts. It documents the
behaviour the services already implement; no transition was added, removed or
renamed.

### 11.1 The two axes

`status` and `review.state` move independently:

```
                       ┌──────────── submit-review ────────────┐
                       ▼                                       │
   ┌───────┐  reject  ┌────────────────┐  approve   ┌──────────────────────┐
   │ DRAFT │ ◄─────── │ PENDING_REVIEW │ ─────────► │ PENDING_REVIEW       │
   └───────┘          │ review=PENDING │            │ review=APPROVED      │
       ▲              └────────────────┘            └──────────┬───────────┘
       │ unpublish                                             │ publish (gated)
       │                                                       ▼
   ┌───┴──────┐                                          ┌───────────┐
   │ PUBLISHED│ ◄────────────────────────────────────────│ PUBLISHED │
   └──────────┘                                          └───────────┘
       │ archive (from any non-archived state)
       ▼
   ┌──────────┐  restore
   │ ARCHIVED │ ──────────► DRAFT
   └──────────┘
```

Note that **approve does not move the box**: the product stays at
`PENDING_REVIEW` and only the review annotation changes. That is why `APPROVED`
is not a `status` value.

### 11.2 Declared transitions

| Action | Endpoint | Accepted `status` | Accepted `review.state` | Writes |
|---|---|---|---|---|
| **Submit** | `POST /products/{id}/submit-review` | `DRAFT` | `NONE`, `REJECTED` | `status=PENDING_REVIEW`, `review.state=PENDING`, review block reset |
| **Approve** | `POST /admin/products/{id}/approve` | `PENDING_REVIEW` | `PENDING`, `APPROVED`¹ | `review.state=APPROVED`, `reviewedBy`, `reviewedAt` — **never `status`** |
| **Reject** | `POST /admin/products/{id}/reject` | `PENDING_REVIEW` | `PENDING` | `status=DRAFT`, `review.state=REJECTED`, `rejectionReason` |
| **Publish** | `POST /admin/products/{id}/publish` | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`² | `APPROVED` | `status=PUBLISHED`, `published=true`, `publishedBy`, `publishedAt` — written together |
| **Unpublish** | `POST /admin/products/{id}/unpublish` | `PUBLISHED` | *not consulted* | `status=DRAFT`, `published=false` |
| **Archive** | `POST /admin/products/{id}/archive` | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED` | *not consulted* | `status=ARCHIVED`, `published=false` |
| **Restore** | `POST /admin/products/{id}/restore` | `ARCHIVED` | *not consulted* | `status=DRAFT`, `published=false` |

¹ Re-approving an already-approved product returns **200** and writes nothing.
² Re-publishing an already-live product returns **200** and writes nothing;
  this short-circuit is evaluated before the review check.

Both axes are checked **independently**. A product that satisfies one but not
the other is refused — this is what prevents an `ARCHIVED` product that still
carries a `PENDING` review (reachable by archiving a submitted product) from
being approved or, worse, "rejected" straight back out of the archive.

### 11.3 Additional gates

* **Submit** also runs a completeness pre-check: `name`, `sku`, `category` and
  `price > 0` must be present, otherwise 422 listing what is missing.
* **Publish** additionally requires `getPublishIssues()` to be empty — product
  id, real (non-placeholder) name, SKU, category, a selling price above zero,
  a description, at least one cover image, and no blocking review flag (§3.3).
  The response carries the outstanding list in `details.errors`.
  `GET /admin/products/{id}/publish-issues` returns the same list.

### 11.4 Invalid transitions

Any transition outside §11.2 returns the canonical
**422 `BUSINESS_RULE_VIOLATION`** envelope with a message naming the current
state, and **leaves the row untouched** — a refusal is never a partial write.
No new error code, status code or second error format is introduced for the
lifecycle, and a refusal is never a 500.

Only the two actions marked in §11.2 are idempotent. Repeating any other
action — submit, reject, unpublish, archive, restore — is a 422; errors are not
silently converted into no-ops.

### 11.5 Invariants

1. `status == "PUBLISHED"` **iff** `published == true`, after every transition.
2. `ARCHIVED` implies `published == false`.
3. `publishedAt` / `publishedBy` are written only by **publish**, and are
   deliberately **retained** through unpublish and archive as the record of the
   last publication. They are audit fields, not visibility fields — visibility
   is `status` + `published` (§10.2).
4. A refused transition writes nothing: not `status`, not `published`, not
   `review`, not the audit fields.
5. `status`, `published` and `review` can never be written through
   `POST`/`PATCH /admin/products` or `POST /admin/products/bulk`; they are
   rejected with a 422 naming the key. **There is no bulk lifecycle
   endpoint** — publish, archive, unpublish, approve and reject are per-product
   so the gates above are always enforced.

### 11.6 Authorization

Every admin lifecycle action requires an admin token **and** the
`products.manage` permission. `POST /products/{id}/submit-review` is the one
lifecycle route reachable by a non-admin: an assigned employee with
`products.manage` may submit their own product; customers receive 403 and
anonymous callers 401. An unauthorized call never mutates the product.

### 11.7 Changing a product's ID

`POST /admin/products/{id}/change-id` rewrites the **display label**
(`productId`) only. It has never touched `catalog_product.id`, the primary key
that media, inventory, collection membership and order history reference —
so **no cascade is required, and none is performed**. `newId` must collide with
neither an existing primary key nor another product's display label; either is
a **409 `CONFLICT`**. The action does not affect the lifecycle.

---

## 12. Product Media Contract (Phase 3 Block 7)

### 12.1 Two tables, one of them authoritative

Product media exists in **two** places, and they are not equivalent:

| Store | Written by | Status |
|---|---|---|
| `media_product_media` (+ `media_media_asset`) | `POST /media/register` **only** | **Authoritative** for new product media |
| `catalog_product.media_ids` / `.primary_media_id` / `.gallery_media_ids` | `POST`/`PATCH /admin/products/{id}` **only** | **Legacy claim columns** |
| `catalog_product.image` / `.hover_image` / `.additional_images` | `POST`/`PATCH /admin/products/{id}` **only** | Legacy **authored** plates |

**Read rule:** where a product has at least one registered association, the
registered set answers (`mediaItems`, ordered `is_primary DESC, sort_order ASC,
assignment_id ASC`). An empty registered set falls back to the legacy authored
columns. `GET /media/products/{id}/media-set` reports which half answered via
`mediaRecordsAvailable`.

**Consequence, stated plainly:** the `mediaIds` / `primaryMediaId` /
`galleryMediaIds` fields on the product write contract are accepted and stored,
but once a product has any registered media they no longer determine what is
served. They are scheduled to become read-only projections; until then a client
must not treat them as the source of truth.

### 12.2 Media role vocabulary

`media_product_media.role` is a **closed vocabulary**:

```
COVER  GALLERY  DETAIL  LIFESTYLE  MODEL
CLOSEUP  PRODUCT_VIDEO  SHOWCASE  DETAIL_VIDEO  LIFESTYLE_VIDEO
```

* Declared once in `backend/app/schemas/media/media.py`
  (`PRODUCT_MEDIA_ROLE_VALUES`), derived from the frontend's own
  `PRODUCT_MEDIA_ROLES`.
* Matched **case-insensitively**; the caller's casing is stored verbatim, with
  surrounding whitespace trimmed. Both `"COVER"` and `"gallery"` are legal and
  are stored as sent — the system genuinely uses both casings today.
* An empty or omitted `role` stores the default `gallery`.
* Any other value is **422 `BUSINESS_RULE_VIOLATION`**, and **nothing is
  written** — no asset row, no association row, and an existing association
  keeps its previous role, sort order and primary flag.

The vocabulary is a **write-path control only**. Response models do not declare
a `role` enum, so a legacy row holding an out-of-vocabulary value still
serialises rather than becoming a 500 on read.

### 12.3 Storage namespace vocabulary

`POST /media/objects` accepts `namespace` from a closed, **case-sensitive**
vocabulary, enforced by `app.storage.keys` before any I/O:

```
products  collections  hero  marketing  uploads
```

`products` additionally requires `productId`. Any other value — including
`PRODUCTS`, `../etc` or `evil` — is **422 `BUSINESS_RULE_VIOLATION`** and no
object is written. `POST /media/products/{id}/objects` hard-codes the
`products` namespace and ignores any namespace supplied in the body, which is
what makes the per-product route un-spoofable.

### 12.4 Publish gate and media

The publish gate requires **an authored `image` or a `primaryMediaId` on the
product row**. It reads the product's own columns only and does **not** consult
`media_product_media`: a product whose media exists solely as registered
associations does not satisfy the gate. This is current behaviour, unchanged by
Block 7, and it is the reason the product write contract still accepts the
media-write keys.
