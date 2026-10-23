# PRATIKSHYA FASHION — Schema/Migration Repair: `DELETE /media/objects/{key}`

**Verdict: the database and migration chain were correct; the defect was an application query that compared JSONB columns to strings.** Repaired with a 10-line query change, no schema change, no data migration, no API or permission change.
Date: 2026-10-23 · Branch `arena/c72d2349-pfv1` @ `43bf640` · local development database only.

---

## 1. Summary

| Question | Answer |
|---|---|
| Was a table/column missing? | **No.** All 73 mapped tables and every column the delete path touches exist. |
| Was the database outdated? | **No.** `alembic current` = `w3b4c5d6e7f8 (head)`; a fresh database migrates from base to head with no error. |
| Were there multiple heads? | **No.** `alembic heads` returns exactly one head. |
| Was a migration missing or conflicting? | **No.** The graph is linear with two deliberate branch points that merge; no missing parents, no branch labels. |
| What actually failed? | `audit_object_references` compared `catalog_product.additional_images` (JSONB) with `= 'text'`. PostgreSQL rejects `jsonb = character varying` with `operator does not exist: jsonb = character varying`. The generic DB error handler matches the substring “does not exist” and maps it to `DATABASE_SCHEMA_ERROR` — hence the misleading “missing table or column, run alembic upgrade heads”. |
| What was repaired? | `_legacy_predicates()` now uses equality only for textual columns and renders JSONB columns to text before searching. |
| Second, unrelated failure | `test_migration_graph_one_new_head` pinned the previous head (`p3hp20261016a`). The head legitimately advanced to `w3b4c5d6e7f8`. Assertion corrected to “exactly one head, equal to the current head”. |

No production database, permission, API contract or media behaviour rule was changed.

---

## 2. Phase 1 — Diagnosis

### 2.1 Migration graph

`backend/alembic/versions` contains **30 revisions** (plus `__pycache__`). Parsed from the files themselves:

- Base: `8f0223843258` (initial schema).
- Linear trunk through `597f883749d8 → a1b2c3d4e5f6 → c9d1e2f3a4b5 → d1e2f3a4b5c6 → e1f2a3b4c5d6 → f1a2b3c4d5e6 → z1a2b3c4d5e6 → m001schema`.
- From `m001schema` two branches run in parallel:
  - `a2b3c4d5e6f7 → b6b5dcfb675b` (media asset + product-media tables),
  - `c7d8e9f0a1b2 → d8e9f0a1b2c3 → d8e9f0a2b2c3 → e7d8e9f0a1b3 → f7d8e9f0a1b4 → g7d8e9f0a1b5` (inventory, media review, leave, support/styling).
  - They merge at `r1a2b3c4d5e6` (multi-parent `down_revision`).
- Trunk continues `s2a3b4c5d6e7 → t3c4d5e6f7a8`, where it branches again:
  - `u1v2w3x4y5z6` (demote super-employee),
  - `h1a2b3c4d5e7 → i1a2b3c4d5e8 → j1a2b3c4d5e9 → v2a3b4c5d6e7` (payment indexes, display id, instagram reward, attendance devices).
  - They merge at `770a4ce325b5`.
- Then `k1a2b3c4d5e0 → l1a2b3c4d5e1 → p3hp20261016a → w3b4c5d6e7f8`.

Every `down_revision` resolves to a real revision; `branch_labels = None` everywhere; **one head: `w3b4c5d6e7f8`**.

### 2.2 Live database

| Check | Result |
|---|---|
| `SELECT version_num FROM pratikshya.pratikshya_alembic_version` | `w3b4c5d6e7f8` |
| `alembic current` | `w3b4c5d6e7f8 (head)` |
| `alembic heads` | one line |
| Application startup migration check | `Migration check passed — all 73 mapped tables present in the database.` |

### 2.3 What the delete endpoint actually does

`backend/app/api/v1/media.py:1361-1432` → `delete_media_object`:

1. resolves the object key, loads the `media_media_asset` row;
2. calls `audit_object_references(db, key, asset=asset)` (read-only);
3. refuses with 409 if any of four reference families is non-empty;
4. deletes the asset row, commits, invalidates caches, then deletes the stored object;
5. returns `{ok, deleted, key, audit}`; repeat deletes are 404.

The audit (`app/services/media/media_reference_audit.py`) queries:

| Family | Table | Columns |
|---|---|---|
| productMedia | `media_product_media` | `media_id` |
| productLegacy | `catalog_product` | `image`, `hover_image`, `additional_images`, `media_ids`, `gallery_media_ids`, `primary_media_id` |
| homepageSection | `homepage_section_item` | `media_asset_id` |
| marketingPlacement | `media_marketing_media` | `object_key`, `media_asset_id`, `mobile_media_asset_id` |

All eleven columns exist in the live database **and** in a database built from scratch by the migrations.

### 2.4 The real exception

Reproducing the audit directly against PostgreSQL produced:

```
sqlalchemy.exc.ProgrammingError: (asyncpg.exceptions.UndefinedFunctionError)
operator does not exist: jsonb = character varying
HINT: No operator matches the given name and argument types. You might need to add explicit type casts.
[SQL: SELECT count(*) FROM pratikshya.catalog_product
 WHERE pratikshya.catalog_product.additional_images = $17::VARCHAR OR
       CAST(pratikshya.catalog_product.additional_images AS VARCHAR) LIKE $21::VARCHAR OR …]
```

`additional_images`, `media_ids` and `gallery_media_ids` are **JSONB**, by migration (`597f883749d8` lines 99-104) and by model (`app/models/catalog/product.py:126`, `Mapped[Optional[list]] = mapped_column(JSONB)`). `image`/`hover_image` are `TEXT`; `primary_media_id` is `VARCHAR(64)`.

`_legacy_predicates()` built `column == needle` for **every** column. The function’s own docstring says equality is only for the plain-text columns, but the code applied it to all six — the JSONB ones then produce `jsonb = varchar`, which PostgreSQL rejects at planning time.

The API maps this to `503 DATABASE_SCHEMA_ERROR` because `app/core/error_handlers.py:136-139` classifies any database error whose text contains “does not exist” as a schema drift. `operator does not exist` is a **type** error, not a missing object, so the message and its `alembic upgrade heads` advice were wrong.

SQLite — which the unit tests use through a JSONB→JSON shim — tolerates `json = 'text'`, which is why the defect escaped the existing suite.

### 2.5 Root-cause classification

| Hypothesis | Evidence | Verdict |
|---|---|---|
| Missing migration | Fresh DB applies 30 revisions to `w3b4c5d6e7f8`; every expected column present with the expected type | **Rejected** |
| Incorrect/conflicting dependency | All `down_revision`s resolve; merges are intentional; no cycles | **Rejected** |
| Multiple unintended heads | `alembic heads` → one | **Rejected** |
| Outdated local database | Version table = head; startup table check passes | **Rejected** |
| Genuine application/schema mismatch | JSONB columns compared to strings in `_legacy_predicates` | **Confirmed** |
| Secondary: stale test expectation | Two tests pin the previous head revision | **Confirmed (test-only)** |

---

## 3. Phase 2 — Repair

### 3.1 Files changed (4 files, +54 / −6)

| File | Change |
|---|---|
| `backend/app/services/media/media_reference_audit.py` | `_legacy_predicates()` applies `=` only when `isinstance(column.type, String)`; JSONB columns are matched with `CAST(col AS VARCHAR) LIKE '%…%'` only. Comment records the failure mode and the migrated column types. |
| `backend/tests/unit/test_media_reference_audit.py` | New regression test `test_legacy_json_columns_are_never_compared_with_equality`: compiles the predicate for the PostgreSQL dialect and asserts no `additional_images = …`, `media_ids = …`, `gallery_media_ids = …` appears, that `LIKE` does, and that `image = …` is still emitted for text columns. Fails on the old code, passes on the new. |
| `backend/tests/unit/test_media_schema_integrity.py` | `test_migration_reached_head` now proves `alembic upgrade head` lands on the repository’s single head (`EXPECTED_HEAD = w3b4c5d6e7f8`) instead of asserting the media revision `b6b5dcfb675b` is the head — it is an ancestor since `r1a2b3c4d5e6`. `test_heads_is_exactly_one` asserts the same constant. Media tables are still asserted structurally. |
| `backend/verification/unit/test_homepage_content.py` | `test_migration_graph_one_new_head` keeps “exactly one head” and pins the current head `w3b4c5d6e7f8`, with a comment explaining how the constant is maintained. |

No migration file was added, edited, reordered or removed. No model, API schema, permission or router changed.

### 3.2 Compatibility implications

- **No schema change** — nothing to apply or roll back; production is untouched whether or not it runs this code.
- **No data migration** and no backfill.
- **Query semantics:** text columns keep identical `=` + `LIKE` behaviour. JSONB columns previously produced an error; they are now matched by their text rendering, which is the behaviour the docstring already promised and the SQLite tests already exercised. The LIKE form can only over-match (e.g. a value that is a prefix of another), and over-matching blocks a delete rather than allowing one — the conservative direction for a destructive operation.
- **API contract:** unchanged. The success body, 404, 409 refusal body and 403 permission errors are the same. The only observable change is that a delete which used to fail with 503 now succeeds when unreferenced and 409s when referenced.
- **Portability:** `CAST(… AS VARCHAR) LIKE` works on PostgreSQL and on the SQLite shim.

### 3.3 Safety assessment

| Rule | Compliance |
|---|---|
| No stamping | No `alembic stamp` anywhere |
| No database reset / table drops | None; only `CREATE DATABASE`/`DROP DATABASE` for two throwaway verification databases I created myself (`pf_migration_check_b2`, `pf_media_it_*`) |
| No destructive SQL | No `DELETE`/`UPDATE` on application tables except the disposable media asset created for the test (deleted through the fixed endpoint) |
| Migration history preserved | 30 revision files byte-identical |
| Data preserved | 7 seed media assets, 0 products, homepage sections untouched (`categories` inactive rev 29, `sarees` active rev 27) |
| Production untouched | Only the local PostgreSQL cluster at `/tmp/pgdata` and a throwaway cluster at `127.0.0.1:5433` were used; both are local |

---

## 4. Phase 3 — Verification

### 4.1 Graph and migration checks

| Check | Result |
|---|---|
| `alembic heads` | 1 head (`w3b4c5d6e7f8`) |
| `alembic current` (live DB) | `w3b4c5d6e7f8 (head)` |
| `alembic upgrade head` on a **brand-new** database | applied all 30 revisions, version `w3b4c5d6e7f8` |
| Column types in the fresh database | `additional_images/media_ids/gallery_media_ids` = `jsonb`; `image/hover_image` = `text`; `primary_media_id`, `homepage_section_item.media_asset_id`, `media_marketing_media.media_asset_id`, `media_marketing_media.mobile_media_asset_id` = `character varying` |
| `test_migration_graph_one_new_head` | **passes** |
| `test_media_schema_integrity.py` (real PostgreSQL, throwaway DB, 12 tests) | **12/12 pass**, including `test_models_match_the_migrated_schema` |
| Temporary databases | both dropped; the local server now lists only `pratikshya_fashion` |

### 4.2 Live deletion proof (local app, real HTTP)

| Step | Result |
|---|---|
| `POST /media/objects` (1×1 PNG, namespace `marketing`) | 201 → `marketing/schema-check-final.png` |
| `POST /media/register-placement` | 201, `created: true`; asset count 7 → 8; file present |
| `DELETE /media/objects/marketing/schema-check-final.png` (super admin) | **200** `{"ok":true,"deleted":true,"audit":{productMedia:0,productLegacy:0,homepageSection:0,marketingPlacement:0}}` |
| After delete | asset row gone, object file gone, count back to **7**, seed keys unchanged |
| Repeat delete | **404** |
| Reference safety | the audit ran on PostgreSQL without a type error; unreferenced = delete, referenced = 409 (covered by unit tests for every family) |

### 4.3 Authorisation

| Actor | Result |
|---|---|
| Super admin (`media.delete`) | 200 |
| Employee (`PF-SLS-76180`, 23 effective permissions, no `media.delete`) | **403** “Admin authentication privileges required.” |
| Limited admin (`batchnoassign.admin@…`, 3 permissions, no `media.delete`) | **403** “Missing required permission: media.delete” |
| Seed object `hero/hero1.png` after both attempts | still readable, **200** |

No permission was added, removed or re-scoped. The two accounts are the local test accounts described in the Batch 2 review; their stored grants are unchanged.

### 4.4 Test comparison

| Suite | Before | After |
|---|---|---|
| `test_homepage_content.py`, `test_marketing_media.py`, `test_admin_consolidation_rbac.py` (+ audit suite) | 113 pass / **1 fail** (`test_migration_graph_one_new_head`) | **134 pass / 0 fail** |
| `tests/unit/test_media_reference_audit.py` | 19 pass | **20 pass** (new regression test) |
| `tests/unit/test_media_schema_integrity.py` | module-level skip (`DATABASE_URL` unset) | **12/12 pass** on a throwaway local cluster |
| `homepageBatch2.test.js` | 34 / 34 | **34 / 34** |
| Homepage control-centre suites | 172 tests, 171 pass, 1 fail | **172 / 171 / 1** (unchanged, `home-page/` ENOENT) |
| Storefront + design-system | 186 / 186 | **186 / 186** |
| `npm test` | 850 tests, 839 pass, 10 fail, 1 skipped | **identical** |
| `npm run build` | 3,118.94 kB / gzip 978.13 kB | **identical** (8.43 s) |

No test was skipped, deleted or weakened. The three test edits correct stale revision pins and add one regression assertion.

---

## 5. Remaining failures (diagnosed, not absorbed)

| Failure | Count | Shares this root cause? | Notes |
|---|---|---|---|
| Frontend `npm test` failures | 10 | **No** | All are `SUPER_EMPLOYEE` account-level expectations (`Issue 4`, `Phase D`, `SUPER_EMPLOYEE routes to /employee`, `account-level ladder`, `delegation ceiling`, `forced password change`, `workspaces route…`). The RBAC ladder demoted that level; these tests are stale. Unchanged before and after this repair. |
| Homepage inventory test | 1 | **No** | `homepageContentControl`/inventory reads `home-page/`, a reference directory not present in this checkout (`ENOENT`). Environment, not schema. |
| Backend collection error | 1 module | **No** | `tests/unit/test_unified_rbac_consolidation.py` imports `ACCOUNT_LEVEL_SUPER_EMPLOYEE`, removed from `app.core.rbac`. Same RBAC-ladder staleness as the frontend failures; blocks whole-suite collection, which is why the backend was run by file. |
| `verification/integration/test_homepage_disposable_pg.py` | 1 skipped | **No** | Opt-in test requiring an explicitly approved disposable DB at parent revision `l1a2b3c4d5e1` over loopback TCP with a marker comment. The local cluster listens only on a Unix socket, so the target could not be provided. The equivalent fresh-chain proof was performed manually (see §4.1). |

---

## 6. Follow-up requiring approval (not done)

`app/core/error_handlers.py` still maps **every** database error containing “does not exist” to `503 DATABASE_SCHEMA_ERROR` with the advice to run migrations. A PostgreSQL type error such as `operator does not exist: jsonb = character varying` is not schema drift, and this mapping is what disguised the bug for so long. Distinguishing `UndefinedTable`/`UndefinedColumn` (schema drift) from `UndefinedFunction`/type errors would change an API error code/message, so it is proposed rather than implemented:

- keep `DATABASE_SCHEMA_ERROR` for `undefined_table` / `undefined_column`;
- return a distinct `DATABASE_QUERY_ERROR` (500) for operator/type errors, without migration advice.

---

## 7. Confirmation

- No production database was contacted; no migration was run against production.
- No `stamp`, reset, revert, drop or history rewrite was used.
- No migration file was added, edited or deleted; all 30 revisions are unchanged.
- No API contract, permission, media rule, section key, slot capacity or storefront file changed.
- No permissions were granted or revoked; the two local test accounts keep exactly the grants recorded in the Batch 2 review.
- Local data ended exactly as it started: 7 seed media assets, 0 catalogue products, `categories` inactive rev 29, `sarees` active rev 27. The disposable upload/registration was removed through the repaired endpoint and both temporary databases were dropped.
- Batch 1 and Batch 2 uncommitted work is untouched (frontend files unchanged by this task).
- Nothing was committed, pushed, deployed, reset, reverted or stashed. Batch 3 has not been started.
