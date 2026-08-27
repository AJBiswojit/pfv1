COMPANY DATABASE MODIFIED: NO
COMPANY DATABASE MIGRATION EXECUTED: NO
AWS/S3 CONTACTED: NO
AWS CREDENTIALS REQUIRED: NO
238 SOURCE FILES MODIFIED: NO

# Media Schema Implementation Report

Durable media identity (`media_media_asset`) and the ordered product ↔ media
mapping (`media_product_media`), delivered as **one** Alembic revision that a
fresh PostgreSQL can apply with `alembic upgrade head` and nothing else.

This document replaces `PHASE_7_PRODUCT_MEDIA_LIFECYCLE_REPORT.md`. The earlier
media migration (`p7_media_lifecycle`) has been **removed from the repository**
rather than patched: it added columns to two empty stub tables and created no
foreign keys at all, so the relational guarantees the application relies on did
not exist in PostgreSQL. Because that revision was never applied outside local
development, the history was rebuilt instead of corrected.

---

## 1. Migration

| | |
|---|---|
| File | `backend/alembic/versions/b6b5dcfb675b_add_media_asset_and_product_media_tables.py` |
| Revision ID | `b6b5dcfb675b` (Alembic-generated, `alembic.util.rev_id()`) |
| Description (`alembic history`) | `add_media_asset_and_product_media_tables` |
| Parent revision (`down_revision`) | `a2b3c4d5e6f7` — `add_admin_setting_table` |
| Branch labels / depends_on | `None` / `None` |
| Removed revision | `p7_media_lifecycle` (`backend/alembic/versions/p7_media_lifecycle.py`, deleted) |

Naming follows the repository convention already used by
`a2b3c4d5e6f7_add_admin_setting_table.py` and
`f1a2b3c4d5e6_add_payment_sessions_table.py`: `<revision>_<database_change>.py`,
first docstring line equal to the change name. The name describes the database
change; it carries no development-phase label.

### Revision graph

`alembic heads` — exactly one head:

```
b6b5dcfb675b (head)
```

`alembic history` — linear, media revision immediately after `a2b3c4d5e6f7`:

```
a2b3c4d5e6f7 -> b6b5dcfb675b (head), add_media_asset_and_product_media_tables
m001schema -> a2b3c4d5e6f7, add_admin_setting_table
z1a2b3c4d5e6 -> m001schema, move_tables_to_pratikshya_schema
f1a2b3c4d5e6 -> z1a2b3c4d5e6, add wishlist columns and activity log columns
e1f2a3b4c5d6 -> f1a2b3c4d5e6, add_payment_sessions_table
d1e2b3c4d5e6 -> e1f2a3b4c5d6, add_orders_columns
c9d1e2f3a4b5 -> d1e2b3c4d5e6, add_cart_coupon_columns
a1b2c3d4e5f6 -> c9d1e2f3a4b5, add_collection_columns
597f883749d8 -> a1b2c3d4e5f6, add_category_subcategory_columns
8f0223843258 -> 597f883749d8, add_customer_address_preferences_columns
<base> -> 8f0223843258, initial_schema
```

### Why the revision replaces the tables instead of altering them

`8f0223843258_initial_schema` emitted a column-less stub for every mapped model
— `id` / `created_at` / `updated_at` plus an `id` index — and `m001schema` moved
those stubs from `public` into `pratikshya`. `media_media_asset` and
`media_product_media` were two of those stubs. A stub cannot hold a media record
(there was nowhere to store an object key), so no application data can exist in
either table. The revision therefore drops the two stubs and creates the real
tables, which is what makes the migration read as one intentional change rather
than a column-by-column patch. `downgrade()` restores the exact stub shape the
initial schema emitted, so the revision is a true inverse.

`media_marketing_media` and `media_media_review` are **not** touched — see §7.

---

## 2. `pratikshya.media_media_asset`

| Column | Type | Null | Default (server) |
|---|---|---|---|
| `id` | `varchar(36)` | NOT NULL | — (PK) |
| `created_at` | `timestamptz` | NOT NULL | ORM-supplied |
| `updated_at` | `timestamptz` | NOT NULL | ORM-supplied |
| `object_key` | `varchar(512)` | NOT NULL | |
| `storage_provider` | `varchar(20)` | NOT NULL | `'local'` |
| `media_type` | `varchar(30)` | NOT NULL | `'image'` |
| `mime_type` | `varchar(100)` | NOT NULL | |
| `original_filename` | `varchar(255)` | NOT NULL | |
| `file_size` | `integer` | NOT NULL | |
| `checksum_sha256` | `varchar(64)` | NOT NULL | |
| `width` | `integer` | NULL | |
| `height` | `integer` | NULL | |
| `title` | `varchar(255)` | NULL | |
| `alt_text` | `text` | NULL | |
| `caption` | `text` | NULL | |
| `status` | `varchar(30)` | NOT NULL | `'uploaded'` |
| `scope` | `varchar(30)` | NOT NULL | `'product'` |
| `uploaded_by` | `varchar(36)` | NULL | |

Editorial metadata (`width`, `height`, `title`, `alt_text`, `caption`) stays
nullable; `uploaded_by` is nullable audit metadata. No business columns beyond
this list were invented.

* **Primary key:** `media_media_asset_pkey PRIMARY KEY, btree (id)`
* **Foreign key:** `media_media_asset_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL`
* **Unique:** `uq_media_asset_object_key UNIQUE CONSTRAINT, btree (object_key)`
* **Indexes:** `ix_media_media_asset_id (id)`, `ix_media_media_asset_checksum_sha256 (checksum_sha256)`

---

## 3. `pratikshya.media_product_media`

| Column | Type | Null | Default (server) |
|---|---|---|---|
| `id` | `varchar(36)` | NOT NULL | — (PK) |
| `created_at` | `timestamptz` | NOT NULL | ORM-supplied |
| `updated_at` | `timestamptz` | NOT NULL | ORM-supplied |
| `product_id` | `varchar(36)` | NOT NULL | |
| `media_id` | `varchar(36)` | NOT NULL | |
| `role` | `varchar(30)` | NOT NULL | `'gallery'` |
| `sort_order` | `integer` | NOT NULL | `0` |
| `is_primary` | `boolean` | NOT NULL | `false` |
| `assigned_by` | `varchar(36)` | NULL | |
| `assignment_note` | `varchar(500)` | NULL | |

* **Primary key:** `media_product_media_pkey PRIMARY KEY, btree (id)`
* **Foreign keys (real, PostgreSQL-enforced):**
  * `media_product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES catalog_product(id) ON DELETE CASCADE`
  * `media_product_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES media_media_asset(id) ON DELETE CASCADE`
* **Unique:** `uq_product_media_asset UNIQUE CONSTRAINT, btree (product_id, media_id)`
* **Indexes:** `ix_media_product_media_id (id)`, `ix_media_product_media_media_id (media_id)`

### Type compatibility

`catalog_product.id`, `media_media_asset.id`, `media_product_media.product_id`
and `media_product_media.media_id` are all `character varying(36)` — the
`String(36)` id that `app/models/base.py` declares for every table. The FKs are
therefore type-compatible with no casts.

---

## 4. ON DELETE behaviour — and why

CASCADE was **not** assumed. The existing schema uses one consistent rule, and
this migration follows it:

| Rule in this project | Examples already in the schema |
|---|---|
| **NOT NULL** reference whose row is meaningless without its parent → `CASCADE` | `commerce_cart_item.cart_id`, `orders_order_item.order_id`, `commerce_wishlist_item.wishlist_id`, `orders_return_item.return_order_id`, `role_permissions.role_id` / `.permission_id`, `user_roles.user_id` / `.role_id`, `catalog_subcategory.category_id` |
| **Nullable** reference to an entity that may outlive the row → `SET NULL` | `commerce_cart.coupon_id`, `employee_profiles.department_id` / `.section_id`, `employee_performance.reviewer_id`, `orders_order.customer_id` |

Applying that rule:

* `media_product_media.product_id` — NOT NULL, and a mapping with no product is
  not a thing → **CASCADE**. Matches `commerce_cart_item.cart_id` and
  `orders_order_item.order_id` exactly.
* `media_product_media.media_id` — NOT NULL, same reasoning → **CASCADE**.
  Matches the project's other two-column association tables
  (`role_permissions`, `user_roles`), which cascade on both sides.
* `media_media_asset.uploaded_by` — nullable audit metadata → **SET NULL**.
  Matches `employee_performance.reviewer_id` and `orders_order.customer_id`:
  deleting a user must neither destroy the asset record nor block the delete.

Consequence, verified in §9: deleting a product removes its mappings but leaves
the assets intact (the assets are not owned by the product); deleting an asset
removes its mappings but leaves the products intact.

---

## 5. Indexes — created only where a query needs one

| Index | Justification |
|---|---|
| `uq_media_asset_object_key` (unique) | `POST /api/v1/media/register` looks the asset up by object key on every call and must not create a second row for the same object. One index gives the lookup *and* the idempotency guarantee. |
| `ix_media_media_asset_checksum_sha256` | Duplicate-byte detection when the same file is uploaded under a different key — the reason a checksum is stored at all. |
| `uq_product_media_asset` (unique, `product_id, media_id`) | Enforces §6. Its **leftmost column is `product_id`**, so it also serves `registered_media_for_product` / `registered_media_for_products` (`WHERE product_id IN (…)`) and the product-side FK cascade scan. |
| `ix_media_product_media_media_id` | `media_id` is *not* the leftmost column of the unique index, so the asset → product direction (the read-model join in `product_media_records.py`, and the asset-side FK cascade) needs an index of its own. |
| `ix_media_media_asset_id`, `ix_media_product_media_id` | `Base` declares `id` with `index=True` for every table in this project; they existed on the stubs and the ORM contract expects them. |

**Deliberately not created:** a single-column index on
`media_product_media.product_id`. It would be a strict duplicate of the
leftmost column of `uq_product_media_asset`.
`backend/scripts/verify_media_schema.py` asserts its absence.

**Also removed:** `index=True` on `MediaAssetModel.status`. No query in the
application filters on status (`grep` for `MediaAssetModel.` returns only the
object-key lookup, the `created_at`-ordered listing, and two joins), the old
migration never created the index either, and requirement is that models and
database agree exactly. Keeping the flag would have meant either a speculative
index or a permanent model/DB mismatch.

---

## 6. Unique constraint

```
"uq_product_media_asset" UNIQUE CONSTRAINT, btree (product_id, media_id)
```

Named with the project's existing `uq_<subject>` convention
(`uq_catalog_category_slug`, `uq_orders_order_number`, `uq_cart_item_line`,
`uq_wishlist_product`, `uq_oauth_provider_user`). It is a real
`pg_constraint` row of `contype = 'u'`, not just a unique index, and
PostgreSQL rejects a second mapping of the same asset to the same product —
proved in §9.

---

## 7. Existing media tables

Both were inspected in the migrated database:

| Table | Columns | PK | Indexes | FKs | Action |
|---|---|---|---|---|---|
| `media_marketing_media` | `id`, `created_at`, `updated_at` | `media_marketing_media_pkey (id)` | `ix_media_marketing_media_id (id)` | none | **unchanged** |
| `media_media_review` | `id`, `created_at`, `updated_at` | `media_media_review_pkey (id)` | `ix_media_media_review_id (id)` | none | **unchanged** |

They come from `8f0223843258_initial_schema`, their IDs are already proper
primary keys, and neither is referenced by any other table
(`pg_constraint` shows only three FKs touching any `media_*` table, all listed
in §2–§3). No duplicate constraints were created and nothing was redesigned:

* Marketing media assignment is still an explicit backend gap in the
  application: `frontend/src/services/api/mediaApi.js` returns
  `{ ok: false, code: "BACKEND_GAP" }` for `apiListMarketingMedia`,
  `apiListMediaReviews`, `apiApproveMedia` and `apiRejectMedia` without making
  any network call, and its message states that "`media_marketing_media` /
  `media_media_review` have no API". `MediaUploadForm.jsx` surfaces that
  blocker rather than writing to the table, so giving it columns now would be
  inventing a feature.
* The review/approval surface is served by the existing product workflow
  (`submit-review` → `approve` → `publish`), not by `media_media_review`.

Both remain available for a later, evidence-backed revision.

---

## 8. Model alignment

| File | Change |
|---|---|
| `backend/app/models/media/media_asset.py` | `object_key` uniqueness moved to a named `UniqueConstraint("object_key", name="uq_media_asset_object_key")` so the constraint name in code matches PostgreSQL; `uploaded_by` FK given `ondelete="SET NULL"`; `index=True` dropped from `status`; unused `product_media` relationship removed. |
| `backend/app/models/media/product_media.py` | `index=True` dropped from `product_id` (covered by the composite unique index); `media_id` keeps `index=True`; unique constraint renamed to `uq_product_media_asset`; FKs unqualified (`catalog_product.id`, `media_media_asset.id`) to match the rest of the project — `MetaData(schema="pratikshya")` resolves them; unused `product` / `media` relationships removed. |

* **No circular imports.** `product_media.py` imports only `sqlalchemy` and
  `app.models.base`; the FK targets are resolved by name through
  `Base.metadata`, and `app/models/__init__.py` already imports
  `MediaAssetModel` before `ProductMediaModel`.
* **No convenience relationships.** Nothing in `app/` traversed
  `.product_media`, `.media` or `.product`; every read goes through the explicit
  joins in `app/services/media/product_media_records.py`. An unused lazy
  relationship under an async session is only a load hazard.
* **`assigned_by`** stays a plain `String(36)` with no FK, matching the other
  "who did it" audit columns in this schema (`catalog_product.created_by`,
  `.updated_by`, `.published_by`, `admin_setting.updated_by`).

### Machine-checked parity

`test_models_match_the_migrated_schema` reflects the migrated tables with
`sqlalchemy.inspect` and compares them against `Base.metadata`: column set,
per-column nullability, primary key, unique constraints (by column set) and
every foreign key **including its `ondelete` rule**. It passes.

The repository's own contract was regenerated and now matches:

```
backend/schema_audit/generate_expected_schema.py   → expected_schema.json
backend/schema_audit/render_schema_contract.py     → schema_contract.md
tables=64 columns=560 fks=34 unique_constraints=5 indexes=139
```

---

## 9. Verification

Environment: PostgreSQL **16.2**, local server on `localhost:5432`, database
`pratikshya_local`. Python 3.11.2, project dependencies from
`backend/requirements.txt`.

### 9.1 Company-database safety

Every tool that can reach a database resolves `DATABASE_URL` first and refuses
to proceed unless the host is loopback **and** the database is
`pratikshya_local`. Verified by running each tool against a company-style
target:

| Command | Target | Result |
|---|---|---|
| `scripts/verify_media_schema.py` | `postgresql+asyncpg://app:***@db.company.internal:5432/pratikshya_fashon` | `REFUSED: DATABASE_URL host is 'db.company.internal', not a loopback address…` — exit 2, no connection opened |
| `scripts/verify_media_schema.py` | `postgresql+asyncpg://postgres@localhost:5432/pratikshya_fashon` | `REFUSED: database is 'pratikshya_fashon', expected 'pratikshya_local'…` — exit 2 |
| `pytest tests/unit/test_media_schema_integrity.py` | `…@db.company.internal:5432/pratikshya_fashon` | module SKIPPED: `…host 'db.company.internal' is not a loopback address — refusing to touch a shared or company server` |
| `scripts/media_lifecycle_pg_e2e.py` | (no local target) | `REFUSED`, exit 2 |

No `DROP DATABASE`, `alembic`, `DELETE` or `ALTER` was ever executed against
anything but `pratikshya_local` or a `pf_*` throwaway database created on the
same local server. Passwords are redacted before printing.

### 9.2 Fresh-database migration (no manual SQL)

`pratikshya_local` was dropped and recreated empty, then:

```
alembic upgrade head
  Running upgrade  -> 8f0223843258, initial_schema
  Running upgrade 8f0223843258 -> 597f883749d8, add_customer_address_preferences_columns
  Running upgrade 597f883749d8 -> a1b2c3d4e5f6, add_category_subcategory_columns
  Running upgrade a1b2c3d4e5f6 -> c9d1e2f3a4b5, add_collection_columns
  Running upgrade c9d1e2f3a4b5 -> d1e2b3c4d5e6, add_cart_coupon_columns
  Running upgrade d1e2b3c4d5e6 -> e1f2a3b4c5d6, add_orders_columns
  Running upgrade e1f2a3b4c5d6 -> f1a2b3c4d5e6, add_payment_sessions_table
  Running upgrade f1a2b3c4d5e6 -> z1a2b3c4d5e6, add wishlist columns and activity log columns
  Running upgrade z1a2b3c4d5e6 -> m001schema, move_tables_to_pratikshya_schema
  Running upgrade m001schema -> a2b3c4d5e6f7, add_admin_setting_table
  Running upgrade a2b3c4d5e6f7 -> b6b5dcfb675b, add_media_asset_and_product_media_tables

alembic current → b6b5dcfb675b (head)
```

No `CREATE TABLE`, `ALTER TABLE`, constraint statement or `INSERT` was run by
hand at any point. The migration is re-executed from scratch on every
`test_media_schema_integrity.py` and `media_lifecycle_pg_e2e.py` run, because
each creates its own empty database first.

### 9.3 Schema metadata verification

`backend/scripts/verify_media_schema.py` (new, read-only — the session is forced
into `SET default_transaction_read_only = on` and rolled back):

```
MEDIA SCHEMA VERIFICATION: ALL CHECKS PASSED
database inspected (read-only): pratikshya_local on localhost
```

Checks executed: `current_database() == 'pratikshya_local'`; presence of the four
`media_*` tables; all 18 asset and 10 mapping columns with exact type and
nullability; PK `(id)` on all four tables; the three FKs with their exact
`ON DELETE` rule; both unique constraints; every expected index; and the absence
of the redundant `product_id` index. Exit 0.

`\d` output from the migrated database matches §2–§3 verbatim.

### 9.4 Repository schema contract audit

`backend/schema_audit/verify_schema.py` (the project's own read-only verifier),
run before and after against identically-built databases:

| Finding | Before (`p7_media_lifecycle`) | After (`b6b5dcfb675b`) |
|---|---|---|
| `EXTRA COLUMN` on `media_*` | **22** | **0** |
| `NULLABILITY MISMATCH` on `media_*` | 0 | 0 |
| `MISSING TABLE` / `MISSING COLUMN` / `TYPE MISMATCH` / `MISSING PK` / `MISSING UNIQUE` / `MISSING INDEX` on `media_*` | 0 | 0 |

The 22 `EXTRA COLUMN` findings existed because the committed contract had never
been regenerated after the media models gained columns; regenerating it as part
of this change closes that gap.

Two notes on the remaining output, both pre-existing and repo-wide:

* `verify_schema.py` reports every one of the project's 34 foreign keys as both
  `MISSING FK` and `EXTRA FK`. The generator stores `referred_columns` as
  `"table.column"` while the verifier compares against the bare column name, so
  no FK ever matches. This is unchanged by this work and affects all 34 FKs
  identically; §9.3 performs a correct FK comparison for the media tables.
* The 44 `NULLABILITY MISMATCH` findings are pre-existing drift between the
  models and the older `commerce_*` / `orders_*` migrations. None of them is on
  a media table, and none was introduced here.

### 9.5 Relational integrity tests (real PostgreSQL)

`backend/tests/unit/test_media_schema_integrity.py` — **12 passed**. Each test
runs against a throwaway database (`pf_media_it_<random>`) created on the local
server and migrated by the real chain; the database is dropped afterwards. The
rows are inserted with plain SQL so the assertions are about PostgreSQL, not the
ORM:

| Test | Result |
|---|---|
| `alembic upgrade head` reaches `b6b5dcfb675b (head)` | PASS |
| `alembic heads` is exactly one head | PASS |
| PKs, FKs (+ delete rule), unique constraints and indexes exist in `pg_catalog` | PASS |
| valid product + valid asset → mapping accepted and joinable | PASS |
| unknown `product_id` + valid `media_id` → `23503`, constraint `media_product_media_product_id_fkey`, nothing stored | PASS |
| valid `product_id` + unknown `media_id` → `23503`, constraint `media_product_media_media_id_fkey`, nothing stored | PASS |
| duplicate `(product_id, media_id)` → `23505`, constraint `uq_product_media_asset`, count stays 1 | PASS |
| duplicate `object_key` → `23505`, constraint `uq_media_asset_object_key` | PASS |
| `DELETE` product → mappings cascade, asset survives | PASS |
| `DELETE` asset → mappings cascade, product survives | PASS |
| `DELETE` uploading user → `uploaded_by` set to NULL, asset survives | PASS |
| reflected schema == `Base.metadata` (columns, nullability, PK, uniques, FK delete rules) | PASS |

No mocks are involved in FK enforcement. When no local PostgreSQL is configured
the module skips with the reason printed — verified.

### 9.6 Application lifecycle end-to-end

`backend/scripts/media_lifecycle_pg_e2e.py` (renamed from
`scripts/phase7_pg_e2e.py`, and now using a throwaway database on the local
server instead of a bundled cluster, so it needs no extra dependency):

```
MEDIA LIFECYCLE E2E RESULT: 9/9 steps PASSED
  1. create product (draft): POST /api/v1/admin/products/draft → 201, status DRAFT
  2. upload images to local object storage: 2 × 201;
     products/PF-W-TST-E2E-0001/e2e-cover.avif, products/PF-W-TST-E2E-0001/e2e-angle.webp
  3. register objects + assign to product: 2 × 201 (COVER primary + gallery)
  4. durable rows verified in the disposable database:
     2 MediaAsset rows, 2 ProductMedia rows, exactly 1 primary
  5. save product + server re-read agrees: PATCH → 200, GET → 200
  6. media-set read model dual-read verified: mediaRecordsAvailable=true, primary-first
  7. submit → approve → publish: 3 × 200; status PUBLISHED, published=true
  8. storefront product resolves canonical media URLs:
     image = /api/v1/media/objects/products/PF-W-TST-E2E-0001/e2e-cover.avif
  9. media URLs serve HTTP 200 with exact bytes + Content-Type:
     image/avif 200 (= uploaded bytes); image/webp 200 (= uploaded bytes)
```

The flow is driven through the real routers against the real
`get_db` session, so the rows are genuine PostgreSQL rows, not frontend state —
step 4 re-reads them from the database with a separate session, and step 9
compares the served bytes to the uploaded bytes.

AVIF and WebP both round-trip with their true content types (step 9), and
`.avif` / `.webp` remain the served formats.

### 9.7 Backend tests

```
backend/.venv/bin/python -m pytest
314 passed, 23 skipped, 3 warnings, 94 subtests passed in 44.33s
```

Baseline before this change was **302 passed, 23 skipped, 94 subtests**; the
delta is exactly the 12 new PostgreSQL integrity tests. The 23 skips are the
pre-existing Phase 6 "real dataset not present" skips.

Re-run with `boto3`, `botocore` and `s3transfer` imports hard-blocked by a
`sys.meta_path` guard (media suites only): **119 passed, 23 skipped, 68
subtests passed** — no AWS SDK is even imported.

### 9.8 Frontend tests and build

```
cd frontend && npm test
# tests 209 · pass 208 · fail 0 · skipped 1
```

Identical to the pre-change baseline (208/0/1); the media work is backend-only,
and `frontend/tests/phase7ProductMedia.test.js` still passes.

```
npm run build
vite v7.3.2 · ✓ 2674 modules transformed · dist/index.html 2,794.72 kB · ✓ built in 9.07s
```

### 9.9 Source image integrity

`frontend/public/images` — **238 files** (228 `.avif`, 10 `.webp`), matching the
238 paths tracked by git. A SHA-256 manifest was taken before any work and
re-taken afterwards:

```
count: 238
BYTE-IDENTICAL: all 238 source images unchanged
git status --porcelain frontend/public/images → (empty)
```

No file was renamed, converted, regenerated or inserted into the database. The
schema is what makes future registration possible; it does not require any of
these 238 files to be registered.

### 9.10 Storage provider

`STORAGE_PROVIDER` remains `local` (the `app/config.py` default), and
`app.storage.storage_status()` reports:

```json
{ "ok": true, "provider": "local", "configured": true,
  "detail": { "provider": "local", "urlPrefix": "/api/v1/media/objects",
              "rootReady": true, "persistent": true },
  "cdnConfigured": false }
```

`boto3` is imported only inside `app/storage/s3.py`, which is never constructed
while the provider is `local`. The §9.7 run with AWS imports blocked confirms no
AWS code path is reached, and no credentials were added anywhere.

### 9.11 `git diff --check`

```
git diff --check        → clean
git diff --cached --check → clean
```

---

## 10. Files changed

**Added**
* `backend/alembic/versions/b6b5dcfb675b_add_media_asset_and_product_media_tables.py`
* `backend/tests/unit/test_media_schema_integrity.py` — real-PostgreSQL PK/FK/unique/cascade tests
* `backend/scripts/verify_media_schema.py` — read-only metadata verification
* `backend/app/testing/__init__.py`, `backend/app/testing/local_postgres.py` — the single local-database safety gate + throwaway-database provisioning shared by tests and scripts
* `MEDIA_SCHEMA_IMPLEMENTATION_REPORT.md` (this file)

**Modified**
* `backend/app/models/media/media_asset.py`
* `backend/app/models/media/product_media.py`
* `backend/schema_audit/expected_schema.json`, `backend/schema_audit/schema_contract.md` (regenerated)
* `backend/requirements.txt` (testing note)
* `backend/tests/unit/test_phase7_media_lifecycle.py` (docstring pointers)

**Renamed**
* `backend/scripts/phase7_pg_e2e.py` → `backend/scripts/media_lifecycle_pg_e2e.py`

**Removed**
* `backend/alembic/versions/p7_media_lifecycle.py`
* `PHASE_7_PRODUCT_MEDIA_LIFECYCLE_REPORT.md`

**Untouched**
* `frontend/public/images` (238 files, byte-identical)
* `media_marketing_media`, `media_media_review` (schema and models)
* every other migration, model, route, service and frontend source file

---

## 11. What another developer needs to do

```bash
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt

# point at the disposable local database — nothing else is required
export DATABASE_URL="postgresql+asyncpg://USER@localhost:5432/pratikshya_local"
createdb pratikshya_local          # if it does not exist yet

.venv/bin/python -m alembic upgrade head        # complete schema, no manual SQL
.venv/bin/python scripts/verify_media_schema.py # read-only metadata report
.venv/bin/python -m pytest                      # incl. 12 PostgreSQL integrity tests
.venv/bin/python scripts/media_lifecycle_pg_e2e.py
```

`alembic upgrade head` alone produces the complete media schema: both tables,
all columns, timestamps, primary keys, foreign keys with their delete rules,
indexes and unique constraints.

---

## 12. Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Old `p7_media_lifecycle` removed/replaced cleanly | ✅ | `git status`: `D backend/alembic/versions/p7_media_lifecycle.py` |
| 2 | Professional database-change migration name | ✅ | `b6b5dcfb675b_add_media_asset_and_product_media_tables.py` |
| 3 | Exactly one Alembic head | ✅ | `alembic heads` → `b6b5dcfb675b (head)` |
| 4 | Fresh PostgreSQL runs `alembic upgrade head` | ✅ | §9.2, and re-run per test module |
| 5 | `media_media_asset` real PRIMARY KEY | ✅ | `media_media_asset_pkey PRIMARY KEY, btree (id)` |
| 6 | `media_product_media` real PRIMARY KEY | ✅ | `media_product_media_pkey PRIMARY KEY, btree (id)` |
| 7 | `product_id` real FK | ✅ | `… REFERENCES catalog_product(id) ON DELETE CASCADE` |
| 8 | `media_id` real FK | ✅ | `… REFERENCES media_media_asset(id) ON DELETE CASCADE` |
| 9 | FK delete behaviour follows project conventions | ✅ | §4 |
| 10 | product/media ID types compatible | ✅ | all `varchar(36)` — §3 |
| 11 | Composite unique constraint | ✅ | `uq_product_media_asset (product_id, media_id)` |
| 12 | Required indexes exist | ✅ | §5, asserted in §9.3 |
| 13 | Invalid product references rejected | ✅ | §9.5 — `23503` |
| 14 | Invalid media references rejected | ✅ | §9.5 — `23503` |
| 15 | Duplicate mappings rejected | ✅ | §9.5 — `23505` |
| 16 | Valid mappings work | ✅ | §9.5 |
| 17 | SQLAlchemy models match the database | ✅ | §8 reflection test + §9.4 |
| 18 | Admin product/media workflow works on local PostgreSQL | ✅ | §9.6 steps 1–6 |
| 19 | New product can receive uploaded media | ✅ | §9.6 steps 2–4 |
| 20 | Product can be published | ✅ | §9.6 step 7 |
| 21 | Storefront resolves and serves the media | ✅ | §9.6 steps 8–9 |
| 22 | AVIF and WebP supported | ✅ | §9.6 step 9 (`image/avif`, `image/webp`) |
| 23 | 238 source files untouched | ✅ | §9.9 |
| 24 | `STORAGE_PROVIDER` remains local | ✅ | §9.10 |
| 25 | No S3/AWS access | ✅ | §9.10 (AWS imports blocked, 0 attempts) |
| 26 | Company database untouched | ✅ | §9.1 |
| 27 | No manual SQL required | ✅ | §9.2, §11 |
| 28 | Backend tests pass | ✅ | 314 passed, 23 skipped |
| 29 | Frontend tests pass | ✅ | 208 passed, 0 failed, 1 skipped |
| 30 | Frontend build passes | ✅ | 2,674 modules, exit 0 |
| 31 | `git diff --check` passes | ✅ | §9.11 |

---

## 13. Known limitations

* **Object store and database are not one transaction.** A failed registration
  can leave an orphan object; automatic deletion is deliberately avoided so
  nothing is destroyed implicitly.
* **`is_primary` uniqueness is an application invariant.** The register endpoint
  demotes the incumbent inside the same transaction; there is no partial unique
  index enforcing it, because adding one was outside this change's scope and the
  current write path is the only writer.
* **Legacy products keep dual-reading** the JSON `mediaIds` /
  `primaryMediaId` / `galleryMediaIds` columns. Products with no registered rows
  are served exactly as before.
* **`media_marketing_media` and `media_media_review` remain column-less** — see
  §7 for the repository evidence behind leaving them alone.
* **`verify_schema.py`'s FK matching is broken repo-wide** (see §9.4). Left as
  found; fixing it would rewrite findings for all 34 foreign keys in a report
  that this change does not own.
