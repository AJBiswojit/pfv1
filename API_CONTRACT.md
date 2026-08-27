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
* **Product Status:** `DRAFT`, `REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED`, `ARCHIVED`
* **Order Status:** `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `RETURNED`
* **Payment Status:** `PENDING`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED`
* **Taxonomy Status:** `ACTIVE`, `DRAFT`, `ARCHIVED`

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

