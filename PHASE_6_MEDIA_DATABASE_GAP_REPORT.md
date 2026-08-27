# PHASE 6 — FINAL MEDIA DATABASE GAP AUDIT

**Date:** 2026-08-27
**Branch:** `arena/01a041cc-pfv1` (based on `main` @ `c9eb2412e31cb459f75916bd8fb508d1e63b2039`)
**Type:** **AUDIT ONLY** — read-only. No schema change, no migration, no seed, no product, no media record, no byte of any media file was created, altered or deleted.

---

## 0. Verdict, up front

| Question | Verdict |
|---|---|
| Is the Marketing Media "MEDIA REGISTRATION BLOCKED" warning a UI bug? | **No. It is accurate.** |
| Classification | **BACKEND GAP / SCHEMA GAP** |
| Root cause | All four media tables (`media_media_asset`, `media_product_media`, `media_marketing_media`, `media_media_review`) exist in the database but carry **exactly three columns each — `id`, `created_at`, `updated_at`**. There is no column anywhere in the schema for an object-storage key, a MIME type, a title, a role, a placement, or a product link. |
| Can product↔media registration work on the current schema? | **No.** |
| Can any existing table/column substitute without a migration? | **Partially, and only at the level of loose strings** — see §9. Not a substitute for a media record. |
| Is an Alembic migration required for Phase 7? | **Yes — unavoidable.** |
| Is the object-storage half working? | **Yes.** Provider, keys, URLs, upload, serve, resolve are implemented and tested. |
| Is product-media end-to-end verified? | **NO — BLOCKED.** The real server has 0 products. |

---

## 1. Current real-server state

| Item | State | How it was established |
|---|---|---|
| Admin login | Working | **Reported by the operator** (not verifiable from this sandbox — see §1.1) |
| Existing admin role | `SUPER_ADMIN` | **Reported by the operator** |
| Product admin page | "No products on the server yet" | **Reported by the operator** |
| Product count on real server | **0** | **Reported by the operator. NOT independently verified here** (§1.1) |
| Marketing Media page | "MEDIA REGISTRATION BLOCKED" | **Reported by the operator; confirmed as an accurate reflection of a real schema gap** (§3) |

### 1.1 What this sandbox could and could not reach

Stated plainly, because it determines how much of this report is measured versus inferred:

- **The company PostgreSQL server was not contacted by this audit.** There is no `backend/.env` in the repository checkout (`backend/.gitignore` line for `.env`; `ls backend/.env*` returns only `.env.example`), no `DATABASE_URL` / `PGHOST` / `PG*` value in the sandbox environment, and no real server hostname recorded anywhere in the repo. The only DSN present in code is the placeholder default `postgresql+asyncpg://postgres:password@localhost:5432/pratikshya_fashon` in `backend/app/config.py:57`.
- Therefore **no `SELECT`, no `information_schema` query and no `pg_catalog` query in this report was executed against the company database.** Nothing at all was sent to it — not even a connection attempt. That is the strongest possible form of the "do not modify the company database" constraint.
- Instead, the schema state of the real server was established by **the repository's own authoritative local record of that schema — the Alembic migration history** — replayed into a **disposable, throwaway PostgreSQL 16.2 instance created inside this sandbox at `/tmp/pfv1_audit_pg`** (outside the repository, gitignored, never persisted). This is exactly the methodology already documented and accepted in `backend/schema_audit/REAL_SERVER_AUDIT_CLASSIFICATION.md` §2.
- The replay reproduces the real server **byte-for-byte**: the repo's own read-only verifier returns the identical 108-finding profile the real server produced (see §14.4). That identity is what licenses treating the reproduction as evidence about the real server.
- **Unverifiable from here and marked as such throughout:** live row counts on the real server, the "0 products" figure, the 238-object local store, the admin login and the browser-level warning text.

---

## 2. Current local-storage state

### 2.1 `frontend/public/images` — the 238 source files: **PRESENT AND UNTOUCHED**

```
$ find frontend/public/images -type f | wc -l
238

$ git ls-files frontend/public/images | wc -l
238

$ git diff --quiet HEAD -- frontend/public/images && echo "byte-identical to HEAD"
frontend/public/images: byte-identical to HEAD (git index hash match)

$ git diff --stat HEAD -- frontend/public/images | wc -l
0

$ find frontend/public/images -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum
2a68b6733a6864c86eb6756baed0fc26529c6771e1a5252169ced165debf3ce2  -
```

All 238 files are Git-tracked, so a byte-level change would appear in `git status`. It does not. **`git status --porcelain` for the whole repository is empty** (§14.6).

Extension breakdown (`find … | sed 's/.*\.//' | sort | uniq -c`): **228 `.avif`, 10 `.webp`**. Total size **76 MB** (`du -sh`).

Layout:

```
public/images/collections/
public/images/hero/          (5 files)
public/images/products/…     (the remaining 233, one folder per product id)
```

### 2.2 `backend/storage/media` — the 238 migrated objects: **NOT PRESENT IN THIS CHECKOUT**

This is a genuine finding and it is not an error.

```
$ find backend/storage -mindepth 1
backend/storage/.gitkeep
```

`backend/.gitignore` contains `storage/*` / `!storage/.gitkeep`, so **the local object store is a runtime directory that is never committed.** The 238 migrated objects reported by the operator live on the operator's machine / the company server, and cannot be seen from a fresh clone — this sandbox included.

The repository's own test suite states this expectation in code. `backend/tests/unit/test_phase6_real_media_integration.py` lines 76–79:

```python
STORE_READY  = REAL_STORE.is_dir()  and any(REAL_STORE.rglob("*"))
SOURCE_READY = REAL_SOURCE.is_dir() and any(REAL_SOURCE.rglob("*"))
DATASET_READY = STORE_READY and SOURCE_READY
```

and skips with the message `real dataset not present (store=False, source=True)`. That is precisely the state measured here — **store absent, source present** — which independently corroborates both halves of §2.

Consequences for this audit:

- The 23 real-dataset integration tests **SKIP** here and **execute** on the operator's machine.
- The migration tool could still be exercised **read-only** by pointing its `--root` at a throwaway directory outside the repo (§14.5). Result: **238 source files, 238 would-copy, 0 unsupported, 0 invalid, 0 failed, 78,819,747 source bytes, 126 extension/content mismatches** — matching the operator's reported `copied: 238 / unsupported: 0 / invalid: 0 / failed: 0` exactly, with nothing written into `backend/storage`.

### 2.3 Storage configuration

`GET /media/storage/status` computed live in-process (no HTTP, no DB):

```json
{
  "ok": true,
  "provider": "local",
  "configured": true,
  "detail": { "provider": "local", "urlPrefix": "/api/v1/media/objects",
              "rootReady": true, "persistent": true },
  "urlPrefix": "/api/v1/media/objects",
  "cdnConfigured": false,
  "namespaces": ["products", "collections", "hero", "marketing", "uploads"],
  "resolveProductImages": true
}
```

`STORAGE_PROVIDER=local` is in force (`backend/.env.example:41`). **No S3 credential was introduced, and `backend/app/storage/s3.py` was not touched.**

---

## 3. Media table schema

### 3.1 SQLAlchemy models — `backend/app/models/media/`

All four model files are **stubs**. Verbatim, in full:

`backend/app/models/media/media_asset.py`
```python
from app.models.base import Base


class MediaAssetModel(Base):
    """Database model for MediaAsset."""
    __tablename__ = "media_media_asset"
```

`backend/app/models/media/product_media.py`
```python
from app.models.base import Base


class ProductMediaModel(Base):
    """Database model for ProductMedia."""
    __tablename__ = "media_product_media"
```

`backend/app/models/media/marketing_media.py` → `MarketingMediaModel` / `media_marketing_media`
`backend/app/models/media/media_review.py` → `MediaReviewModel` / `media_media_review`

Both are the same three lines with a different class name and table name. **None declares a single `mapped_column`.** Everything they do have comes from `Base` (`backend/app/models/base.py`), which supplies only `id VARCHAR(36)`, `created_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ` — plus `MetaData(schema="pratikshya")`.

`backend/app/repositories/media/__init__.py` is a bare docstring. There is no media repository layer.

### 3.2 Live ORM metadata inspection (no database connection opened)

```
$ ./.venv/bin/python  (import app.models; from app.models.base import Base)

SCHEMA (MetaData): pratikshya
TOTAL TABLES IN ORM METADATA: 64

=== pratikshya.media_media_asset ===  columns=3
   id             VARCHAR(36)   nullable=False pk=True
   created_at     DATETIME      nullable=False pk=False
   updated_at     DATETIME      nullable=False pk=False
   FK constraints on table: []
   indexes: [('ix_pratikshya_media_media_asset_id', ['id'], False)]

=== pratikshya.media_product_media ===  columns=3        (identical shape)
=== pratikshya.media_marketing_media === columns=3       (identical shape)
=== pratikshya.media_media_review ===   columns=3        (identical shape)
```

### 3.3 Actual PostgreSQL catalog, verified against the replayed schema

Run against the sandbox reproduction with `SET default_transaction_read_only = on`:

```
### information_schema.columns — the four media tables (schema 'pratikshya') ###
  media_marketing_media      #1  id           character varying(36)      nullable=NO  default=None
  media_marketing_media      #2  created_at   timestamp with time zone   nullable=NO  default=None
  media_marketing_media      #3  updated_at   timestamp with time zone   nullable=NO  default=None
  media_media_asset          #1  id           character varying(36)      nullable=NO  default=None
  media_media_asset          #2  created_at   timestamp with time zone   nullable=NO  default=None
  media_media_asset          #3  updated_at   timestamp with time zone   nullable=NO  default=None
  media_media_review         #1  id           character varying(36)      nullable=NO  default=None
  media_media_review         #2  created_at   timestamp with time zone   nullable=NO  default=None
  media_media_review         #3  updated_at   timestamp with time zone   nullable=NO  default=None
  media_product_media        #1  id           character varying(36)      nullable=NO  default=None
  media_product_media        #2  created_at   timestamp with time zone   nullable=NO  default=None
  media_product_media        #3  updated_at   timestamp with time zone   nullable=NO  default=None
  -> total rows: 12
```

Twelve columns across four tables. Constraints: one PRIMARY KEY on `id` per table (plus PostgreSQL's implicit `_not_null` checks). Indexes: the primary key plus `ix_media_*_id` on `id`. **No other index, no unique constraint, no foreign key.**

### 3.4 The committed contract says the same thing

`backend/schema_audit/expected_schema.json` → `meta.notes` states:

> "Empty model stubs (e.g. inventory_\*, **media_\***, chatbot_\*, etc.) intentionally declare only id/created_at/updated_at in the backend code; any columns the real database has on those tables are reported as EXTRA COLUMN."

The verifier run against the replayed schema reports **`EXTRA COLUMN 0`** and per-table stats `{columns: 3, extra_columns: 0, missing_columns: 0, issues: 0}` for all four media tables. **There is no hidden column on the real server that the models fail to declare.** The tables are genuinely empty shells.

---

## 4. Product table schema relevant to media

`pratikshya.catalog_product` — **76 columns** (verified in the replayed catalog). Six are media-bearing; all are present, all are nullable:

| Column | Type | Nullable | Default | Present in models | Present in migration |
|---|---|---|---|---|---|
| `media_ids` | `jsonb` | YES | app-side `list` | ✅ | `597f883749d8` line 99 |
| `primary_media_id` | `varchar(64)` | YES | — | ✅ | `597f883749d8` line 100 |
| `gallery_media_ids` | `jsonb` | YES | app-side `list` | ✅ | `597f883749d8` line 101 |
| `image` | `text` | YES | `''` | ✅ | `a1b2c3d4e5f6` |
| `hover_image` | `text` | YES | `''` | ✅ | `a1b2c3d4e5f6` |
| `additional_images` | `jsonb` | YES | app-side `list` | ✅ | `a1b2c3d4e5f6` |

Declared in `backend/app/models/catalog/product.py` under the `── Media claims ──` banner. Exposed on the API as `mediaIds` / `primaryMediaId` / `galleryMediaIds` / `image` / `hoverImage` / `additionalImages` (`backend/app/schemas/catalog/product.py` lines 165, 251–253, 344–347).

Related media-id columns elsewhere in the schema (found by an `information_schema` scan for `%media%`, `%mime%`, `%object_key%`, `%storage%`, `%checksum%`, `%alt_text%`, `%caption%`, `%placement%`, `%role%` across the whole `pratikshya` schema):

```
   ('audit_activity_log', 'target_media_id', 'character varying')
   ('catalog_category',   'banner_media_id', 'character varying')
   ('catalog_collection', 'hero_media_id',   'character varying')
   ('catalog_collection', 'thumbnail_media_id', 'character varying')
   ('catalog_product',    'gallery_media_ids', 'jsonb')
   ('catalog_product',    'media_ids',         'jsonb')
   ('catalog_product',    'primary_media_id',  'character varying')
   ('role_permissions',   'role_id', …)        ← RBAC, unrelated
   ('user_roles',         'role_id', …)        ← RBAC, unrelated
```

That is the **complete** set. There is no `object_key`, no `mime_type`, no `checksum`, no `alt_text`, no `caption`, no `placement`, no `role` column **anywhere** in the schema.

---

## 5. Existing relationships

**There are none.** Verified three ways:

1. **ORM introspection** — across every mapper in `Base.registry`, there are **42 `relationship()` declarations in the entire object model; zero of them involve a media model.** Per-model:
   ```
   MediaAssetModel     table=media_media_asset     relationships=[]  mapped_attrs=3
   ProductMediaModel   table=media_product_media   relationships=[]  mapped_attrs=3
   MarketingMediaModel table=media_marketing_media relationships=[]  mapped_attrs=3
   MediaReviewModel    table=media_media_review    relationships=[]  mapped_attrs=3
   ProductModel        table=catalog_product       relationships=[]  mapped_attrs=76
   ```
2. **Foreign-key metadata** — `information_schema.table_constraints` on the media tables returns only PRIMARY KEYs. And, decisively:
   ```
   ### Any FK anywhere in 'pratikshya' pointing AT a media_* table? ###
     NONE — no foreign key in the entire schema references any media table
   ### Total FKs in 'pratikshya' ###  29
   ```
   All 29 real FKs belong to auth / customer / employee / commerce / orders / payments. **None touches media.**
3. **Association table** — `media_product_media` is *named* like a join table but is **not** one: it has no `product_id`, no `media_asset_id`, no unique pairing constraint, and no FKs. It cannot join anything to anything.

So today the only link between a product and a media object is a **free-text string** in `catalog_product.image` / `hover_image` / `additional_images` (a URL or an object key), and an **unconstrained id string** in `primary_media_id` / `media_ids` / `gallery_media_ids` that points at nothing.

---

## 6. Existing media API capabilities

`backend/app/api/v1/media.py` — 400 lines, 10 routes (enumerated from the live FastAPI router):

| Method | Path | Auth | Touches DB? | Status |
|---|---|---|---|---|
| `GET` | `/media/health` | none | no | ✅ working |
| `GET` | `/media/storage/status` | none | no | ✅ working |
| `POST` | `/media/references/resolve` | none | no | ✅ working |
| `GET` | `/media/objects/{object_key:path}` | none | no | ✅ working |
| `HEAD` | `/media/objects/{object_key:path}` | none | no | ✅ working |
| `GET` | `/media/object-meta/{object_key:path}` | none | no | ✅ working |
| `GET` | `/media/products/{product_id}/media-set` | none | **reads `catalog_product` only** | ✅ working, degraded |
| `POST` | `/media/objects` | admin + `media.upload` | reads for validation | ✅ object stored, **no record** |
| `POST` | `/media/products/{product_id}/objects` | admin + `media.upload` | reads `catalog_product.id` | ✅ object stored, **no record** |
| `DELETE` | `/media/objects/{object_key:path}` | admin + `media.delete` | no | ✅ working |

`backend/app/api/v1/media_reviews.py` — **1 route**: `GET /media-reviews/health`. Health-only.

### 6.1 What the media routes can and cannot do

**Can:** validate an upload by content signature, derive a deterministic object key, store bytes atomically, serve bytes with the *sniffed* Content-Type, compute SHA-256, detect collisions, resolve a stored reference to a canonical URL, and delete one named object.

**Cannot:** create, read, update, list or delete a *media record*; title an asset; classify it as IMAGE or VIDEO; record its MIME type, size, width, height, checksum, alt text or caption; mark it DRAFT / PENDING_REVIEW / ACTIVE / REJECTED / ARCHIVED; assign it a role or a placement; associate it with a product; approve or reject it in review. **Every one of those needs a column that does not exist.**

### 6.2 The `media-set` endpoint documents its own degradation

`GET /media/products/{id}/media-set` (`backend/app/api/v1/media.py` ~line 264) reads **only** `catalog_product` columns and returns:

```python
"mediaRecordsAvailable": False,
"note": "Media records (media_media_asset rows) are not available: those "
        "tables declare no business columns in the existing schema. …"
```

`ProductMediaSetResponse.media_records_available` defaults to `False` in `backend/app/schemas/media/media.py`. The docstring of `MediaService` states the same limitation, and `backend/app/schemas/media/media.py`'s module docstring explicitly declines to model media records "because those tables declare no business columns in the existing schema".

### 6.3 The frontend already agrees, in code

`frontend/src/services/api/mediaApi.js` implements the object-storage half as real HTTP calls and stubs the register half honestly:

```js
const REGISTER_BLOCKER = "Media records are not available yet: the backend media tables "
  + "(media_media_asset, media_product_media, media_marketing_media, media_media_review) "
  + "declare no business columns in the existing schema, …";

function registerUnavailable() { return { ok: false, error: REGISTER_BLOCKER, code: "BACKEND_GAP" }; }

export async function apiListMedia()            { return registerUnavailable(); }
export async function apiCreateMedia()          { return registerUnavailable(); }
export async function apiListProductMedia()     { return registerUnavailable(); }
export async function apiAssignMediaToProduct() { return registerUnavailable(); }
export async function apiListMarketingMedia()   { return registerUnavailable(); }
export async function apiListMediaReviews()     { return registerUnavailable(); }
export async function apiApproveMedia()         { return registerUnavailable(); }
export async function apiRejectMedia()          { return registerUnavailable(); }
```

Note the `code: "BACKEND_GAP"` — the frontend already classifies this correctly.

---

## 7. Existing admin media capabilities

### 7.1 Backend admin surface

There is **no** admin media-record endpoint anywhere. `grep -rn "marketing" backend/app` finds only `NAMESPACE_MARKETING = "marketing"` (an object-key namespace in `app/storage/keys.py:52`) and the unrelated notification channel. There is no `/admin/media*` route in `backend/app/api/v1/admin.py`.

The only admin media capability is the three RBAC-guarded object operations from §6, using the existing permission vocabulary (`media.view`, `media.upload`, `media.assign`, `media.delete` — `backend/app/api/v1/admin.py:202`).

### 7.2 The "MEDIA REGISTRATION BLOCKED" warning — traced to source

`frontend/src/config/mediaTypes.js:485-492`:

```js
export const UPLOAD_NOTICE = "MEDIA REGISTRATION BLOCKED";

export const UPLOAD_NOTICE_COPY =
  "Object storage is live (Phase 6), but media registration is not: the backend " +
  "media tables carry no business columns, so an upload cannot be recorded, " +
  "titled or mapped to a product. Files are previewed in this browser session " +
  "only — nothing is uploaded, nothing is stored locally, and preview URLs are " +
  "never saved as production media.";
```

Consumed by `frontend/src/components/media/MediaUploadForm.jsx:290,293` and `MediaUploadPanel.jsx:159,160`.

**This text is factually correct against the schema measured in §3.** Every clause holds:
- "the backend media tables carry no business columns" → §3.1–3.4, 12 columns total, all three inherited from `Base`.
- "an upload cannot be recorded" → no `INSERT` target with anywhere to put a key, title or MIME type.
- "titled" → no `title` column.
- "mapped to a product" → no `product_id` column, no association table (§5).

**Classification: BACKEND GAP / SCHEMA GAP — not an application bug.** The UI is doing the right thing: it refuses to fake a success it cannot deliver. The repository even has a regression test locking that behaviour in — `frontend/tests/phase6MediaStorage.test.js` test 26, *"the admin upload form reports the real blocker instead of faking success"* (passing; §14.7).

### 7.3 Admin media pages that exist but cannot be served

`frontend/src/pages/admin/media/` — 2,641 lines across 7 pages:

| Page | Lines | Backend available? |
|---|---|---|
| `AdminMediaLibrary.jsx` | 523 | ❌ needs a media-record list |
| `AdminMediaDetail.jsx` | 495 | ❌ needs media-record read/update |
| `AdminMediaReview.jsx` | 439 | ❌ needs `media_media_review` columns |
| `AdminMediaProductMapping.jsx` | 432 | ❌ needs product↔media mapping |
| `AdminMarketingMedia.jsx` | 415 | ❌ needs `media_marketing_media` columns |
| `AdminProductMedia.jsx` | 311 | ❌ needs roles / sort order / mapping |
| `AdminMediaUpload.jsx` | 26 | ⚠️ object upload exists; registration does not |

They are currently backed by an in-browser mirror: `frontend/src/services/media/` holds **6,021 lines** across 20 modules (`mediaRepository.js` 837, `mediaResolver.js` 1,195, `productMediaSet.js` 660, `mediaOwnershipService.js` 457, …). `mediaStore.js:284-286` is explicit that this is not authoritative:

```js
/* Memory-only: media is a server-owned entity; there is no authoritative
   localStorage register. This session mirror exists for UI continuity. */
```

### 7.4 The record shape the frontend already expects

`normaliseMedia()` in `frontend/src/services/media/mediaStore.js:112-165` is effectively a working specification for Phase 7. The fields it normalises:

- **Identity:** `id`, `type` (`IMAGE` | `VIDEO`)
- **Address:** `url`, `poster`, `thumbnail`
- **Description:** `title`, `alt`, `caption`, `tags`
- **Placement:** `scope` (`PRODUCT` | `MARKETING` | `UNASSIGNED`), `status` (`DRAFT` | `PENDING_REVIEW` | `ACTIVE` | `REJECTED` | `ARCHIVED`), `productId`, `role`, `sortOrder`, `placement`, `campaign`, `campaignStart`, `campaignEnd`, `section`
- **Provenance:** `source`, `fileName`, `mimeType`, `fileSize`, `uploadedBy`, `uploadedByEmployeeId`, `uploadedByType`, `reviewStatus`, `reviewedBy`, `reviewedAt`, `rejectionReason`, `demoPlaceholder`

Role vocabulary: 10 values in `PRODUCT_MEDIA_ROLES` (`COVER`, `GALLERY`, `DETAIL`, `LIFESTYLE`, `MODEL`, `CLOSEUP`, `PRODUCT_VIDEO`, `SHOWCASE`, `DETAIL_VIDEO`, `LIFESTYLE_VIDEO`) — `frontend/src/config/mediaTypes.js`. Ordering invariants the repository enforces client-side and would need to enforce server-side: **one `COVER` per product**, **dense `sortOrder` 0..n-1 per product**.

---

## 8. Missing database capabilities

The full capability chain the objective names, with each link's status:

```
local object storage          ✅ WORKING   backend/storage/media, LocalStorageProvider
        ↓
media database record         ❌ IMPOSSIBLE   no column to hold a key, type, title or checksum
        ↓
product                       ❌ IMPOSSIBLE   no product_id column, no FK, no join table
        ↓
product image / gallery       ⚠️ DEGRADED     works only via free-text strings on catalog_product
        ↓
storefront media URL          ✅ WORKING   /api/v1/media/objects/{key}, resolver + dual-read
```

The **only broken link is the second one**, and because it is broken the third is broken too. Everything above and below it is finished and tested.

Concretely missing:

| Capability | Needed for | Status |
|---|---|---|
| Persist an object key | linking a record to bytes on disk / in S3 | ❌ missing |
| Persist MIME / content type | `<img>` vs `<video>`, correct serving | ❌ missing |
| Persist title / alt / caption | admin library, SEO, accessibility | ❌ missing |
| Persist role / placement / scope | gallery ordering, cover selection, marketing slots | ❌ missing |
| Persist review state | `PENDING_REVIEW → ACTIVE/REJECTED` workflow | ❌ missing |
| Persist provenance (uploader, checksum, size, dimensions) | audit, dedupe, integrity | ❌ missing |
| Associate media with a product | the entire product-media feature | ❌ missing |
| List / search media | admin library | ❌ missing |
| Approve / reject media | review queue | ❌ missing |

---

## 9. Exact missing columns and relationships

### 9.1 `media_media_asset` — needs 20+ new columns

Minimum viable set, derived from the object key convention already implemented in `backend/app/storage/keys.py` and the record shape in §7.4:

| Column | Type | Why |
|---|---|---|
| `object_key` | `varchar(900)` **UNIQUE NOT NULL** | the object-store key, e.g. `products/PF-W-SAR-SIL-0001/primary.avif`. `OBJECT_KEY_MAX_LENGTH = 900`. This is *the* link to storage. |
| `media_type` | `varchar(10)` NOT NULL | `IMAGE` / `VIDEO` |
| `mime_type` | `varchar(100)` NOT NULL | sniffed type — the store already computes it |
| `file_size` | `bigint` | bytes; already computed by `ObjectMetadata.size` |
| `checksum_sha256` | `varchar(64)` | already computed; enables dedupe & integrity re-verification |
| `width` / `height` | `integer` | aspect-ratio house rules |
| `duration_seconds` | `numeric` (nullable) | video only |
| `title` | `varchar(255)` | admin library, the "recorded / titled" clause of the warning |
| `alt_text` | `text` | accessibility / SEO |
| `caption` | `text` | storefront copy |
| `tags` | `jsonb` | already a frontend field |
| `scope` | `varchar(20)` NOT NULL | `PRODUCT` / `MARKETING` / `UNASSIGNED` |
| `status` | `varchar(30)` NOT NULL, indexed | `DRAFT`/`PENDING_REVIEW`/`ACTIVE`/`REJECTED`/`ARCHIVED` |
| `original_filename` | `varchar(255)` | provenance |
| `storage_provider` | `varchar(20)` | `local` now, `s3` later — keeps records portable |
| `uploaded_by` | `varchar(64)` | actor id |
| `uploaded_by_type` | `varchar(20)` | `ADMIN` / `EMPLOYEE` |
| `review_status` / `reviewed_by` / `reviewed_at` / `rejection_reason` | | review workflow |
| `published_at` / `archived_at` | `timestamptz` | lifecycle |

Indexes: unique on `object_key`; index on `(scope, status)`; index on `media_type`; index on `checksum_sha256`.

### 9.2 `media_product_media` — the association table, needs to become one

| Column | Type | Why |
|---|---|---|
| `media_asset_id` | `varchar(36)` NOT NULL → `media_media_asset(id) ON DELETE CASCADE` | left side |
| `product_id` | `varchar(36)` NOT NULL → `catalog_product(id) ON DELETE CASCADE` | right side |
| `role` | `varchar(30)` NOT NULL | the 10-value `PRODUCT_MEDIA_ROLES` vocabulary |
| `sort_order` | `integer` NOT NULL default 0 | dense 0..n-1 per product |
| `is_primary` | `boolean` NOT NULL default false | optional mirror of `catalog_product.primary_media_id` |
| `status` | `varchar(30)` | per-attachment visibility |
| `assigned_by` | `varchar(64)` | provenance |

Constraints: **`UNIQUE (media_asset_id, product_id)`**; a **partial unique index enforcing one `COVER` per product** (`WHERE role = 'COVER'`), which is the invariant `mediaRepository.js` currently enforces only in the browser.

### 9.3 `media_marketing_media`

| Column | Type |
|---|---|
| `media_asset_id` | `varchar(36)` NOT NULL → `media_media_asset(id) ON DELETE CASCADE` |
| `placement` | `varchar(64)` NOT NULL (the `MARKETING_PLACEMENTS` vocabulary) |
| `sort_order` | `integer` NOT NULL default 0 |
| `section` | `varchar(64)` |
| `campaign` | `varchar(200)` |
| `campaign_start` / `campaign_end` | `timestamptz` |
| `status` | `varchar(30)` NOT NULL |
| `approved_by` / `approved_at` | |

Constraints: `UNIQUE (media_asset_id, placement)`; index on `(placement, status, sort_order)`.

### 9.4 `media_media_review`

| Column | Type |
|---|---|
| `media_asset_id` | `varchar(36)` NOT NULL → `media_media_asset(id) ON DELETE CASCADE` |
| `reviewer_id` | `varchar(64)` NOT NULL |
| `decision` | `varchar(20)` NOT NULL (`APPROVE`/`REJECT`) |
| `reason` | `text` |
| `reviewed_at` | `timestamptz` NOT NULL |

(`REJECTION_REASONS` in `frontend/src/config/mediaTypes.js` already enumerates the five house reasons.)

### 9.5 What does **not** need to change

`catalog_product.media_ids`, `primary_media_id`, `gallery_media_ids`, `image`, `hover_image`, `additional_images` are already adequate as *read models* / denormalised mirrors, and the storefront + admin read paths already consume them. `catalog_category.banner_media_id`, `catalog_collection.hero_media_id`, `catalog_collection.thumbnail_media_id` likewise. **No migration is required on those tables.** They simply have nothing valid to point at until §9.1 exists.

### 9.6 Can any existing table/column already support the relationship without schema changes?

**Only as loose, unconstrained strings — and that is not a media record.**

What already works today, with zero schema change:

- `catalog_product.image` / `hover_image` (TEXT) and `additional_images` (JSONB) can hold **canonical media URLs or object keys**. `ProductService._to_storefront` / `_to_admin` (`backend/app/services/catalog/product_service.py:351-353`, `428-430`) already run them through `resolve_product_image_reference` / `resolve_product_image_list`, and `PATCH /admin/products/{id}` already accepts them (`ProductUpdateRequest`, `backend/app/schemas/catalog/product.py:344-350`, applied by `update_product` at line 1107 via `model_dump(exclude_unset=True)`).
- `catalog_product.media_ids` / `primary_media_id` / `gallery_media_ids` can hold **id strings**.

What that cannot give you:

- **No referential integrity.** Nothing stops an id in `primary_media_id` from pointing at a row that does not exist — because no row can exist.
- **No MIME type, title, alt text, role, sort order, status or review state** for any asset.
- **No `ON DELETE` behaviour.** Deleting a product or an object cannot cascade, because there is no edge to cascade along.
- **No query.** "List every asset for product X, ordered, with roles" is not expressible — there is nothing to order.
- **No one `COVER` per product** guarantee.
- **No media library.** `AdminMediaLibrary` has nothing to list.

Empirical confirmation that the loose-string path is a fallback, not a solution — live resolver decisions computed in-process (empty store in this checkout, hence `legacy-fallback`):

```
'/images/hero/hero001.avif'                  -> status=legacy-fallback  objectKey=hero/hero001.avif
'products/PF-W-SAR-SIL-0001/primary.avif'    -> status=legacy-fallback  objectKey=products/PF-W-SAR-SIL-0001/primary.avif
'pm-0001'                                    -> status=passthrough      objectKey=''      ← a media-record id resolves to NOTHING
''                                           -> status=empty
'https://cdn.example.com/x.avif'             -> status=passthrough
```

The `'pm-0001'` line is the crux: `product_media_resolver.py` documents it — *"A media-register id (`pm-…`) or anything unrecognised. Without the media tables we cannot resolve it, and we never guess."* With 238 objects present (the operator's machine) the first two lines would read `resolved`, and the third would still read `passthrough`. **No amount of correct storage can make a media-record id resolvable while the media-record table has no columns.**

---

## 10. Alembic migration history related to media

Chain (from the `revision` / `down_revision` fields):

```
8f0223843258 (initial_schema)
  → 597f883749d8 (customer/address/preferences + product media-claim columns)
    → a1b2c3d4e5f6 (category/subcategory columns + banner_media_id)
      → c9d1e2f3a4b5 (collection columns + hero/thumbnail_media_id)
        → d1e2f3a4b5c6 (cart/coupon)
          → e1f2a3b4c5d6 (orders)
            → f1a2b3c4d5e6 (payment_sessions)
              → z1a2b3c4d5e6 (wishlist + activity log, incl. target_media_id)
                → m001schema (move all tables to the 'pratikshya' schema)
                  → a2b3c4d5e6f7 (admin_setting)   ← HEAD
```

Every migration touching media, in full:

| Migration | Media content |
|---|---|
| `8f0223843258_initial_schema.py` lines 237–264 | **Creates the four media tables — `id`, `created_at`, `updated_at` only** — plus `ix_media_*_id` on `id`. This is the whole media DDL that has ever existed. |
| `597f883749d8` lines 99–101 | Adds `catalog_product.media_ids` (JSONB), `primary_media_id` (varchar 64), `gallery_media_ids` (JSONB). Columns on the **product**, not media tables. |
| `a1b2c3d4e5f6` line 47 | Adds `catalog_category.banner_media_id` (varchar 64). |
| `c9d1e2f3a4b5` lines 56, 60 | Adds `catalog_collection.hero_media_id`, `thumbnail_media_id` (varchar 64). |
| `z1a2b3c4d5e6` line 63 | Adds `audit_activity_log.target_media_id` (varchar 36). |
| `m001schema` lines 63–66 | Moves the four media tables into the `pratikshya` schema. No column change. |
| `d1e2f3a4b5c6`, `e1f2a3b4c5d6`, `f1a2b3c4d5e6`, `a2b3c4d5e6f7` | No media content. |

**No migration has ever added a business column to any media table.** `grep -rn "media" backend/alembic/versions/` returns only the lines above.

Verbatim, the entire media DDL in the initial migration:

```python
op.create_table('media_media_asset',
sa.Column('id', sa.String(length=36), nullable=False),
sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
sa.PrimaryKeyConstraint('id')
)
op.create_index(op.f('ix_media_media_asset_id'), 'media_media_asset', ['id'], unique=False)
```

(and the same five lines for the other three tables).

---

## 11. Is an Alembic migration required?

**Yes. It is unavoidable, and it is the single gating item for Phase 7.**

Reasoning, each step verified above:

1. Media registration requires persisting at least an object key, a MIME type, a title, a status and a product link (§8).
2. No column of that kind exists on any table in the `pratikshya` schema (§3, §4 — the `%media%`/`%mime%`/`%object_key%`/`%checksum%`/`%placement%`/`%role%` scan returned only the seven id/reference columns and two unrelated RBAC `role_id`s).
3. No relationship exists (§5 — zero media relationships among 42 in the ORM; zero of 29 FKs touch media).
4. `EXTRA COLUMN 0` from the verifier proves the real server has no undeclared column to use instead (§3.4).
5. Therefore new columns (and real FKs / unique constraints / indexes) must be created. In this project, schema is created by Alembic.

Shape of the Phase 7 migration (recommendation, **not** executed):

- One additive revision, e.g. `n001media` / down_revision `a2b3c4d5e6f7`.
- **Additive only** — `op.add_column` on the four existing stub tables. **No `DROP`, no `ALTER … TYPE`, no data rewrite.** The tables are empty (0 rows), so this is risk-free.
- Follow the existing house convention: new columns `nullable=True` where a default is applied app-side, matching `d1e2c4d5e6f6` / `z1a2b3c4d5e6` discipline, so nothing can fail on an existing row.
- FKs with `ON DELETE CASCADE`, per the existing pattern (24 of 29 existing FKs already use it).
- Must run against a **staging** database first, then be applied to the company server by the operator under their own control.

---

## 12. Is product↔media mapping currently possible?

**No.**

| Requirement | Available today? |
|---|---|
| A row to represent "this asset" | ❌ `media_media_asset` has no key/type/title columns |
| A row to represent "this asset belongs to this product in this role" | ❌ `media_product_media` has no `product_id`, no `media_asset_id`, no `role` |
| A foreign key to enforce it | ❌ zero FKs on media tables |
| An API to create the mapping | ❌ no such route (§6) |
| A frontend that could call it | ⚠️ exists but is a browser-only mirror (§7.3) |

**The best that is possible today**, with zero schema change and zero new code, is the two-step manual attach already documented in `PHASE_6_IMPLEMENTATION_REPORT.md` §19.2:

1. `POST /media/products/{id}/objects` → returns `{key, url}`.
2. `PATCH /admin/products/{id}` with that URL in `image` / `hoverImage` / `additionalImages`.

That makes the image appear on the storefront. It is **not** media registration: the asset has no title, no role, no status, no review path, no library entry, and no referential link to the product. It is a workaround, and it is exactly why `MEDIA REGISTRATION BLOCKED` remains the correct label.

---

## 13. What Phase 7 should implement

Ordered so that each step is independently verifiable.

**Step 1 — Schema (the gate).** One additive Alembic revision adding the §9 columns, FKs, unique constraints and indexes to `media_media_asset`, `media_product_media`, `media_marketing_media`, `media_media_review`. Replay in staging, verify with the repo's own read-only `backend/schema_audit/verify_schema.py`, then apply to the company server under operator control.

**Step 2 — Models.** Fill in the four stub model files with `mapped_column` declarations matching the migration exactly. Keep `Base`'s `id`/`created_at`/`updated_at`. Declare the `relationship()`s that §5 found missing (`ProductModel ↔ ProductMediaModel ↔ MediaAssetModel`), and re-run `backend/schema_audit/generate_expected_schema.py` so the committed contract stays true.

**Step 3 — Register API.** Implement against the *already-written* frontend contract in `frontend/src/services/api/mediaApi.js`, replacing the `registerUnavailable()` stubs: list/get/create/update media, list/assign product media, list marketing media, list/approve/reject reviews. Reuse the existing `media.view` / `media.upload` / `media.assign` / `media.delete` permissions — **do not invent new permission codes**.

**Step 4 — Upload becomes register.** `POST /media/objects` should store the object **and** create the `media_media_asset` row in the same request (key, sniffed MIME, size, SHA-256, provider) — all four values are already computed by `UploadService` / `ObjectMetadata`, so this is a persist, not a recompute. Add the one-call "upload and attach" that §19.2 said was impossible.

**Step 5 — Make media ids resolvable.** Extend `product_media_resolver.py` so a `media_media_asset.id` resolves to a URL by lookup, turning today's `passthrough` on `'pm-0001'` into `resolved`. Keep the existing `legacy-fallback` dual-read untouched.

**Step 6 — Flip `mediaRecordsAvailable` to `true`** in `GET /media/products/{id}/media-set` and serve the set from `media_product_media` ordered by `sort_order`, instead of only from `catalog_product` columns.

**Step 7 — Frontend.** Retire the in-browser mirror in `frontend/src/services/media/*` (6,021 lines) behind the real API; remove `UPLOAD_NOTICE` / `UPLOAD_NOTICE_COPY` and the `MEDIA_UPLOAD_BLOCKER` text; enable `MediaUploadForm` submission and the delete UI (which §19.4 correctly withheld because "the backend cannot prove an object is unreferenced" — with `media_product_media` it can).

**Step 8 — E2E verification, the currently blocked gate.** With a **legitimate, operator-created product** on the real server: upload → register → assign role/order → confirm the storefront serves `/api/v1/media/objects/products/{id}/…` with the sniffed Content-Type and a byte-identical body. Then update `PHASE_6_IMPLEMENTATION_REPORT.md` §19 to close items 1–6.

**Step 9 (optional, separate).** `media_media_review` workflow, then garbage collection for unreferenced objects — §19.5 excluded GC because "the architecture cannot support it safely yet". After Step 1 it can.

---

## 14. Exact read-only verification commands performed

All commands below were run in this sandbox. **Every one is read-only with respect to the company database and to the media files.** Where a write was unavoidable (creating a throwaway PostgreSQL), it was confined to `/tmp`, outside the repository.

### 14.1 Environment

```bash
cd pfv1/backend
python3 -m venv .venv                    # .venv is gitignored; nothing else added to the repo
./.venv/bin/pip install -r requirements.txt pytest pytest-asyncio
./.venv/bin/pip install pgserver         # for the throwaway PostgreSQL only
```

### 14.2 ORM metadata inspection — no database connection opened

```bash
cd pfv1/backend && ./.venv/bin/python - <<'EOF'
import app.models
from app.models.base import Base
from sqlalchemy import inspect as sa_inspect
for name in ("media_media_asset","media_product_media","media_marketing_media","media_media_review"):
    t = Base.metadata.tables[f"pratikshya.{name}"]
    print(name, [c.name for c in t.columns], list(t.foreign_keys))
for cls in Base.registry.mappers:
    for r in cls.relationships:
        if "media" in (cls.class_.__name__ + r.key + r.mapper.class_.__name__).lower():
            print("MEDIA RELATIONSHIP:", cls.class_.__name__, r.key)
EOF
```
→ all four tables `[id, created_at, updated_at]`, `FK constraints on table: []`, **zero media relationships**.

### 14.3 Route enumeration from the live routers

```bash
cd pfv1/backend && ./.venv/bin/python -c "
from app.api.v1.media import router as m
from app.api.v1.media_reviews import router as r
[print(sorted(x.methods), x.path) for x in list(m.routes)+list(r.routes)]"
```
→ 10 media routes + 1 media-reviews health route.

### 14.4 Disposable PostgreSQL replay + the repo's own read-only verifier

```bash
# throwaway cluster, entirely inside /tmp — the company server is never contacted
./.venv/bin/python -c "import pgserver; s=pgserver.get_server('/tmp/pfv1_audit_pg', cleanup_mode=None); print(s.get_uri())"
./.venv/bin/python -c "
import psycopg2
c=psycopg2.connect(host='/tmp/pfv1_audit_pg', dbname='postgres', user='postgres'); c.autocommit=True
c.cursor().execute('CREATE DATABASE pratikshya_fashon')"

# replay the repo's own migration chain (the authoritative local record of the server schema)
DATABASE_URL="postgresql+asyncpg://postgres@/pratikshya_fashon?host=/tmp/pfv1_audit_pg" \
  ./.venv/bin/alembic upgrade head

# the repo's own READ-ONLY verifier (sets default_transaction_read_only = on, rolls back)
DATABASE_URL="postgresql://postgres@/pratikshya_fashon?host=/tmp/pfv1_audit_pg" \
  ./.venv/bin/python schema_audit/verify_schema.py --output /tmp/pfv1_schema_verify.json
```

Result — **identical to the real-server profile recorded in `REAL_SERVER_AUDIT_CLASSIFICATION.md`**:

```
   MISSING TABLE          0        MISSING PK             0        EXTRA TABLE            1
   MISSING COLUMN         0        MISSING FK            31        EXTRA COLUMN           0
   TYPE MISMATCH          0        MISSING UNIQUE         0        EXTRA FK              29
   NULLABILITY MISMATCH  44        MISSING INDEX          0        EXTRA INDEX            3
   total_issues: 108
```

Media per-table stats: `media_marketing_media {columns: 3, extra_columns: 0, missing_columns: 0, issues: 0}` — and the same for the other three. **Media-related findings: 0** — the models and the database agree perfectly; the gap is that both are empty.

### 14.5 Read-only catalog queries (against the replay, `transaction_read_only = on`)

```bash
./.venv/bin/python - <<'EOF'
import psycopg2
conn = psycopg2.connect(host="/tmp/pfv1_audit_pg", dbname="pratikshya_fashon", user="postgres")
conn.set_session(readonly=True, autocommit=False)
cur = conn.cursor(); cur.execute("SET default_transaction_read_only = on")
cur.execute("""SELECT table_name, ordinal_position, column_name, data_type, is_nullable
               FROM information_schema.columns
               WHERE table_schema='pratikshya' AND table_name LIKE 'media_%'
               ORDER BY table_name, ordinal_position""")
cur.execute("""SELECT con.conname, src.relname, tgt.relname FROM pg_constraint con
               JOIN pg_class src ON src.oid=con.conrelid JOIN pg_class tgt ON tgt.oid=con.confrelid
               JOIN pg_namespace ns ON ns.oid=src.relnamespace
               WHERE con.contype='f' AND ns.nspname='pratikshya' AND tgt.relname LIKE 'media_%'""")
cur.execute("""SELECT table_name, column_name, data_type FROM information_schema.columns
               WHERE table_schema='pratikshya' AND (column_name ILIKE '%media%' OR column_name ILIKE '%mime%'
                 OR column_name ILIKE '%object_key%' OR column_name ILIKE '%checksum%'
                 OR column_name ILIKE '%placement%' OR column_name ILIKE '%role%')""")
conn.rollback()
EOF
```
→ 12 media columns; **no FK anywhere points at a media table**; only the seven id/reference columns from §4 exist schema-wide.

### 14.6 Media-file safety verification

```bash
cd pfv1
find frontend/public/images -type f | wc -l                     # → 238
git ls-files frontend/public/images | wc -l                     # → 238
git diff --quiet HEAD -- frontend/public/images && echo ok      # → ok
git diff --stat HEAD -- frontend/public/images | wc -l          # → 0
find frontend/public/images -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum
                                                                # → 2a68b673…debf3ce2
find backend/storage -mindepth 1                                # → backend/storage/.gitkeep
git status --porcelain                                          # → (empty)
```

The local-media import tool was exercised in **dry-run with `--root` redirected outside the repository**, so `backend/storage` was never written to:

```bash
cd pfv1/backend && ./.venv/bin/python -m app.services.media.migrate_local \
    --dry-run --root /tmp/pfv1_media_probe_root --manifest /tmp/pfv1_media_manifest.json
```
```
total source files: 238      would copy: 238          already identical: 0
collision: 0                 checksum mismatch: 0     unsupported: 0
invalid: 0                   failed: 0                skipped: 0
source bytes: 78,819,747
NOTE: 126 source file(s) carry an extension that does not match their bytes
mode: dry run — nothing written
```
`find backend/storage -mindepth 1` afterwards still returns only `.gitkeep`.

### 14.7 Existing tests run (no fake data created)

```bash
cd pfv1/backend && ./.venv/bin/python -m pytest \
  tests/unit/test_phase6_media_storage.py tests/unit/test_phase6_media_db.py \
  tests/unit/test_phase6_image_formats.py tests/unit/test_phase6_real_media_integration.py
```
→ **120 passed, 23 skipped, 94 subtests passed.** The 23 skips are all `test_phase6_real_media_integration.py` with `real dataset not present (store=False, source=True)` — the expected outcome on a checkout without the runtime object store (§2.2). **0 failures.**

```bash
cd pfv1/frontend
node --import ./scripts/node-loader/register.mjs --test tests/phase6MediaStorage.test.js
```
→ **27 passed, 0 failed** — including *"the admin upload form reports the real blocker instead of faking success"* and *"the legacy public asset folder is untouched by the media layer"*.

```bash
node --import ./scripts/node-loader/register.mjs --test tests/phase6LocalMediaFlow.test.js
```
→ **8 passed, 0 failed, 1 skipped.**

```bash
node --import ./scripts/node-loader/register.mjs --test tests/marketingAvifUpload.test.js
```
→ **10 passed, 0 failed.**

### 14.8 In-process capability probe (no HTTP, no DB, no writes)

```bash
cd pfv1/backend && ./.venv/bin/python -c "
import json; from app.storage import storage_status, create_storage_provider
from app.services.media.product_media_resolver import explain
print(json.dumps(storage_status()))
for r in ['/images/hero/hero001.avif','products/PF-W-SAR-SIL-0001/primary.avif','pm-0001','',
          'https://cdn.example.com/x.avif']: print(repr(r), explain(r))
p=create_storage_provider(); print(p.name, p.root, len(list(p.list_objects())))"
```
→ storage status as quoted in §2.3; resolver decisions as quoted in §9.6.

---

## 15. Confirmation that no database mutation occurred

- **The company PostgreSQL server was never contacted.** No connection string for it exists in this environment (§1.1). Zero packets were sent to it. There was therefore no opportunity for an `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `TRUNCATE`, migration or seed to reach it.
- **No Alembic migration was executed against any non-disposable database.** The single `alembic upgrade head` in §14.4 targeted the throwaway cluster at `/tmp/pfv1_audit_pg`, created inside this sandbox and outside the repository.
- **No seed was executed.** `backend/scripts/seed_database.py` and `backend/scripts/create_admin.py` were not run.
- **No product was created. No media record was created.** No `INSERT` statement of any kind was issued anywhere in this audit.
- Every direct catalog query was wrapped in a read-only session (`conn.set_session(readonly=True)` + `SET default_transaction_read_only = on`, confirmed `transaction_read_only = on`) and closed with `conn.rollback()`.
- The repo's own `schema_audit/verify_schema.py` was used rather than a hand-rolled prober, precisely because it forces read-only mode and rolls back by construction (`backend/schema_audit/README.md`, "Safety notes").
- **No production code was modified to make this audit pass.** `git status --porcelain` for the entire repository is **empty** — not one tracked file changed. The only additions are `backend/.venv/` (gitignored) and log lines in `backend/logs/*.log` (gitignored, `logs/*.log`).
- **No `.env` was created**, so no `STORAGE_PROVIDER` or `DATABASE_URL` was altered. `STORAGE_PROVIDER` remains `local`. **No S3 credential was introduced**; `backend/app/storage/s3.py` is unmodified.

---

## 16. Confirmation that all 238 source files remain untouched

**Confirmed, three independent ways.**

1. **Count:** `find frontend/public/images -type f | wc -l` → **238**. `git ls-files frontend/public/images | wc -l` → **238**.
2. **Git identity:** `git diff --quiet HEAD -- frontend/public/images` exits 0 and `git diff --stat HEAD -- frontend/public/images` is empty. All 238 files are Git-tracked, so any byte change, rename, delete or mode change would appear. None does. `git log --oneline -1 -- frontend/public/images` still shows `c9eb241`, the branch point — **this session has not touched the tree.**
3. **Content hash:** `find frontend/public/images -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum` → `2a68b6733a6864c86eb6756baed0fc26529c6771e1a5252169ced165debf3ce2`. Recorded here as the baseline; re-running this command reproduces it exactly.

Nothing was deleted, renamed, converted, recompressed or regenerated. The read-only dry-run import (§14.6) opened the source files for reading only and reported `mode: dry run — nothing written`.

`backend/storage/media` was **not created** by this audit — `find backend/storage -mindepth 1` returns `backend/storage/.gitkeep` and nothing else. (One empty `storage/media` directory was created as a side effect of instantiating `LocalStorageProvider`, whose constructor calls `ensure_root()`; it contained zero objects and was removed with `rmdir` immediately, restoring the directory to `.gitkeep` only.)

**Caveat, stated honestly:** the 238 *migrated objects* in `backend/storage/media` are not present in this checkout because `backend/.gitignore` excludes `storage/*`. They could not be inspected from here. Their state is taken from the operator's report (`copied: 238 / unsupported: 0 / invalid: 0 / failed: 0 / checksum verification: passed / re-verification: passed`), and the read-only dry-run in §14.6 independently corroborates the source half of that report exactly. This audit did nothing to that directory in either location.

---

## 17. What must NOT be changed yet

| Item | Why |
|---|---|
| The four media tables | Any column addition is a Phase 7 schema decision requiring operator approval against shared infrastructure. |
| `backend/alembic/versions/*` | No new revision until Phase 7 is authorised. |
| `backend/app/models/media/*.py` | Filling in the stubs before the migration exists would make the ORM claim columns the server does not have, breaking every other read path. |
| `backend/schema_audit/expected_schema.json` / `schema_contract.md` | Must be regenerated *after* the models change, not before. |
| The 238 files in `frontend/public/images` | Authoritative source of truth for the asset library; the storefront still serves them via dual-read. |
| `backend/storage/media` (238 objects, on the operator's machine) | Runtime store; deleting or rewriting it would break live product images. |
| `STORAGE_PROVIDER=local` | No S3 credentials exist and none may be introduced. |
| `MEDIA_RESOLVE_PRODUCT_IMAGES=true` and the `legacy-fallback` dual-read | This is what prevents a broken-image window. Removing it before media records exist would degrade the storefront. |
| `frontend/src/services/media/*` (6,021 lines) | The browser mirror is the only working media UI today. Rewiring it before the backend register exists would leave the admin with nothing. |
| `UPLOAD_NOTICE` / `MEDIA_UPLOAD_BLOCKER` copy | Accurate as of this audit. Removing it now would make the UI lie. |
| `catalog_product` media columns | Already sufficient as a read model (§9.5). No migration needed on this table. |
| Checkout, payments, orders, returns, cart, wishlist, employee, inventory, analytics, chatbot, notifications | Out of scope; untouched. |

---

## 18. Answer to the distinction the objective raised

> *Do NOT classify the current Marketing Media warning as an application bug merely because the UI says registration is blocked. Determine whether the warning is correctly reflecting a genuine backend schema capability gap.*

**The warning is correct. Classification: BACKEND GAP / SCHEMA GAP.**

Evidence chain, every link measured in this audit:

1. `media_marketing_media` has three columns: `id`, `created_at`, `updated_at` — inherited from `Base`, declared by nothing else. (§3.1 model source, §3.2 ORM metadata, §3.3 `information_schema`.)
2. `EXTRA COLUMN 0` from the repo's own verifier proves the real server has no additional column the models fail to declare. (§3.4)
3. There is no `object_key`, `mime_type`, `title`, `role`, `placement`, `status` or `product_id` column anywhere in the `pratikshya` schema. (§4)
4. There is no relationship and no foreign key between media and anything else. (§5)
5. Therefore an upload cannot be *recorded* (nowhere to put the key or type), cannot be *titled* (no title column), and cannot be *mapped to a product* (no product column, no join table) — which is word-for-word what `UPLOAD_NOTICE_COPY` says. (§7.2)
6. The frontend already labels its own stubs `code: "BACKEND_GAP"`. (§6.3)

This is not a UI defect, not a wiring defect, and not a permissions defect. It is the absence of database columns. The UI is behaving correctly by refusing to simulate a capability the database does not have.

---

## 19. Answer to the product-state question

> *The real server currently has 0 products. Therefore do not claim that product-media E2E is verified.*

**Correct — product↔media end-to-end is NOT verified, and this report does not claim it is.**

The final browser verification remains **BLOCKED**, for two independent reasons:

1. **No legitimate product exists** on the real server (operator-reported; not independently verifiable from this sandbox — see §1.1). No product was created for testing, and none should be.
2. Even with a product, **there is no media record to attach to it** (§12) — so the verification could not pass regardless.

What *is* verified, and what is not:

| Layer | Status |
|---|---|
| Object storage provider, keys, URLs, upload, serve, delete | ✅ verified by 120 backend tests |
| Reference resolution + dual-read fallback | ✅ verified by tests and in-process probe |
| Product read model resolving image references | ✅ verified (code path exercised by tests) |
| Media record creation | ❌ **impossible** — schema gap |
| Product↔media mapping | ❌ **impossible** — schema gap |
| Storefront serving a *registered* media record | ⛔ **BLOCKED** — needs a real product and the Phase 7 schema |

---

## Appendix A — Files inspected (read-only)

**Backend models:** `app/models/base.py`, `app/models/__init__.py`, `app/models/media/{media_asset,product_media,marketing_media,media_review}.py`, `app/models/catalog/{product,category,collection}.py`
**Backend storage:** `app/storage/{__init__,base,keys,local,urls,s3,signatures}.py`
**Backend media services:** `app/services/media/{media_service,product_media_resolver,media_validation,upload_service,local_media_migration,migrate_local,media_review_service}.py`
**Backend API:** `app/api/v1/{media,media_reviews,products,admin,router}.py`, `app/services/catalog/product_service.py`, `app/schemas/media/media.py`, `app/schemas/catalog/product.py`
**Migrations:** all 10 files in `backend/alembic/versions/`, plus `backend/alembic/{env.py,script.py.mako}`, `backend/alembic.ini`
**Schema audit:** `backend/schema_audit/{README.md,expected_schema.json,verify_schema.py,REAL_SERVER_AUDIT_CLASSIFICATION.md}`
**Config:** `backend/app/config.py`, `backend/.env.example`, `backend/.gitignore`, `backend/requirements.txt`
**Tests:** `backend/tests/unit/test_phase6_{media_storage,media_db,image_formats,real_media_integration}.py`
**Frontend:** `src/config/mediaTypes.js`, `src/services/api/mediaApi.js`, `src/services/media/{mediaStore,mediaRepository}.js`, `src/components/media/{MediaUploadForm,MediaUploadPanel}.jsx`, `src/components/product/ProductGallery.jsx`, `src/pages/admin/media/*.jsx`
**Reports:** `PHASE_6_IMPLEMENTATION_REPORT.md`, `INTEGRATION_AUDIT.md`, `backend/schema_audit/REAL_SERVER_AUDIT_CLASSIFICATION.md`

## Appendix B — Artifacts produced outside the repository

| Path | What | Persisted? |
|---|---|---|
| `/tmp/pfv1_audit_pg/` | throwaway PostgreSQL 16.2 cluster with the replayed schema | no — outside the workspace |
| `/tmp/pfv1_schema_verify.json` | verifier output (108 findings) | no |
| `/tmp/pfv1_media_probe_root/` | empty root for the dry-run import | no |
| `/tmp/pfv1_media_manifest.json` | dry-run manifest | no |
| `backend/.venv/` | Python virtualenv for the audit | gitignored |
| `PHASE_6_MEDIA_DATABASE_GAP_REPORT.md` | **this report** | **yes — the only file added to the repository** |
