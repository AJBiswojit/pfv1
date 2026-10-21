# PRATIKSHYA FASHION — Production-Ready S3 + CDN Architecture for Future Product Images

**Document status:** plan + execution record
**Branch:** `arena/c0b008bd-pfv1`
**Baseline commit:** `57c4e84c7f8e0863e0daf106a0380901f9f5892d` (merge of PR #60 into `main`)
**Date:** 2026-10-21
**Scope:** prepare the existing application for **future genuine** product-image uploads to
Amazon S3 with CloudFront delivery. No migration of the current mock asset library.

---

## 0. Executive summary and the business constraint that shapes everything

> **No genuine product images have been uploaded yet.**
>
> The 240 files in `frontend/public/images/` and anything under `backend/storage/` are
> **mock / development assets**. They are used by the storefront preview, the cinematic
> authentication screens, the homepage demonstrations and the automated test fixtures.

Consequences that this plan encodes as hard rules:

| # | Rule | Where enforced |
|---|------|----------------|
| R1 | Mock assets are **never** copied to a production (or staging) S3 bucket. | `migrate_local` CLI guard + `run_migration()` provider guard |
| R2 | Mock assets are **never** deleted, renamed, moved or rewritten. | No code path writes to `frontend/public/images/`; verified by an integrity test |
| R3 | No mock catalogue record or legacy mock image reference is "promoted" to production media. | `register_legacy_product_images.py` stays an explicit, opt-in, local-only tool |
| R4 | Development keeps working with **no AWS credentials at all**. | `STORAGE_PROVIDER=local` default; test-environment guard |
| R5 | Automated tests can never reach a production bucket. | `app/storage/environment.py` guards |
| R6 | Production may never silently fall back to local (ephemeral) storage. | Startup validation + `create_storage_provider()` guard |
| R7 | The first objects in the production bucket must be deliberate, authorised, genuine uploads. | Deployment checklist §10 |

### Status legend used throughout

- **[IMPLEMENTED]** — code/config change is in this branch.
- **[TESTED]** — covered by an automated test that was executed and passed.
- **[STAGING]** — verified against real AWS staging infrastructure (*not done in this change — no AWS account access in this environment*).
- **[EXTERNAL]** — requires action/authorisation outside the repository (AWS account, DNS, deployment platform).

---

## 1. Phase 0 — Baseline audit findings (evidence gathered before any edit)

### 1.1 Repository / branch

| Item | Value |
|------|-------|
| Branch | `arena/c0b008bd-pfv1` |
| Baseline | `57c4e84` (working tree clean at audit start) |
| Backend | FastAPI 0.111, SQLAlchemy 2.0.30, Python 3.11, PostgreSQL (`pratikshya` schema) |
| Frontend | React 19 + Vite 7, no image-derivation logic (backend decides URLs) |
| Committed secrets | **None.** No `.env` is tracked (`.gitignore` excludes it). `.env.example` files contain placeholders only. |

### 1.2 Existing storage abstraction (already good — reuse, do not replace)

```
app/storage/base.py        StorageProvider ABC: put/get/open/delete/exists/metadata/url/list/describe
app/storage/keys.py        object-key safety + namespace allow-list (products/collections/hero/marketing/uploads)
app/storage/urls.py        build_media_url() / is_media_url() / object_key_from_media_url()
app/storage/signatures.py  magic-byte content sniffing (a filename is never trusted)
app/storage/local.py       LocalStorageProvider — the active provider
app/storage/s3.py          S3StorageProvider — interface-ready, never exercised against AWS
app/storage/__init__.py    create_storage_provider() / get_storage_provider() / storage_status()
```

Object keys are `products/{PRODUCT_ID}/{filename}` — deterministic, S3-portable, and already
the single identity used by every caller. **This is the right foundation; Phase 2 hardens the
S3 adapter rather than introducing a new one.**

### 1.3 S3 adapter gaps found (Phase 2 input)

| # | Gap | Risk | Fix |
|---|-----|------|-----|
| S-1 | `put_object` overwrites unconditionally; no `If-None-Match`, no checksum, no SSE | Silent overwrite of a different image | Conditional put + `ChecksumAlgorithm=SHA256` + `ServerSideEncryption` |
| S-2 | `object_exists` swallows **every** exception and returns `False` | A credentials/network failure is reported as "object absent" → `MediaService.store_image` then **overwrites** | Distinguish `404/NoSuchKey` from real errors; raise `StorageError` otherwise |
| S-3 | `get_metadata()` re-downloads the whole object to compute SHA-256 | Costly + slow on S3; doubles egress on every register | Store the SHA-256 in object metadata on put; head-only read afterwards |
| S-4 | Only `client.exceptions.NoSuchKey` is translated | Access-denied / throttling surface as raw boto text (may include account/ARN hints) | Central `_translate_client_error()`; sanitised `StorageError` |
| S-5 | `describe()` publishes the raw bucket name to an **unauthenticated** endpoint | Private bucket detail disclosure | Identifier redaction; full identifiers only for an authenticated admin |
| S-6 | `AWS_ENDPOINT_URL` is read by the factory via `getattr` but is **not a Settings field** | Cannot be configured at all | Add the field |
| S-7 | `list_objects()` is unbounded and is called by `GET /media/storage/status` | A status probe lists the whole bucket | `limit` parameter + `MaxKeys` |
| S-8 | No content-addressed replacement key | A replaced image is served stale by browser/CDN caches | `content_addressed_product_key()` + immutable cache headers |
| **S-9** | **`_is_placeholder()` always returned `True`** — `PLACEHOLDER_CREDENTIAL_PREFIXES` ended with the empty string, and `"anything".startswith("")` is always true | **The S3 provider could never be constructed, even with valid credentials.** A production deploy would have failed at startup with a misleading "credentials incomplete" error | Removed the empty prefix (`if not text` already covers the empty case) |
| S-10 | `delete_object()` translated no errors | A failed delete looked like success | Error translation on every verb |

### 1.4 CDN configuration gap

* `MEDIA_CDN_BASE_URL` is the **live** setting (read by `app/storage/urls.build_media_url`).
* `CDN_BASE_URL` is **dead**: declared in `Settings` and documented in `.env.example`, but
  referenced by **no** code path (verified by repository-wide grep).
* **Resolution:** `MEDIA_CDN_BASE_URL` becomes the single source of truth; `CDN_BASE_URL` is
  removed from `Settings` and from `.env.example`, with the removal recorded here.

### 1.5 Deletion risks (Phase 5) — confirmed in code

| # | Risk | Evidence |
|---|------|---------|
| D-1 | `DELETE /media/objects/{key}` counted **only** `media_product_media` and `media_marketing_media.object_key`. The legacy product columns `catalog_product.image`, `.hover_image`, `.additional_images` (JSONB), `.media_ids`, `.primary_media_id`, `.gallery_media_ids` were **not** checked. | `app/api/v1/media.py` `delete_media_object()` |
| D-2 | `homepage_section_item.media_asset_id` is `ForeignKey(..., ondelete="CASCADE")`. Deleting a `MediaAssetModel` row **silently deletes homepage content**. The delete route never checked it. | `app/models/media/homepage_section.py` |
| D-3 | `media_marketing_media.media_asset_id` / `.mobile_media_asset_id` were not checked (only `object_key`). | `app/models/media/marketing_media.py` |
| D-4 | Ordering: object deleted **before** the DB row. A DB failure leaves an asset row pointing at a vanished object. | `delete_media_object()` |
| D-5 | No orphan visibility at all. | — |

### 1.6 Stale configuration defaults (Phase 6) — confirmed

| Setting | Old default | Resolves to | Verdict |
|---------|-------------|-------------|---------|
| `LOCAL_MEDIA_IMPORT_SOURCE` | `../../frontend/pratikshya-frontend/public/images` | `/home/user/frontend/pratikshya-frontend/public/images` — **outside the repo and non-existent** | Broken |
| `LOCAL_MEDIA_ROOT` (`.env.example`) | `../../frontend/pratikshya-frontend/public/images` | same non-existent path | Wrong: points the **upload destination** at the mock asset directory |
| `LOCAL_MEDIA_ROOT` (`config.py`) | `storage/media` | `backend/storage/media` | Correct (persistent, inside the repo) |

The real asset directory is `frontend/public/images`, i.e. `../frontend/public/images`
relative to `backend/`.

### 1.7 Mock-asset inventory

```
frontend/public/images        240 files, 77 MB
  ├── products/               catalogue mock art
  ├── collections/            editorial + fabric mock art
  ├── hero/                   homepage hero mock art
  └── auth/                   2 files (pratikshya-auth-desktop.webp, -mobile.webp)
                              → authentication-screen art
```

The two `auth/` files are **not** in any served media namespace
(`ALLOWED_NAMESPACES = products, collections, hero, marketing, uploads`), so the Phase 6
migration importer classified them `INVALID` on every run. They are legitimately *not*
product media: they are Vite `public/` assets consumed directly by the auth screens. This
plan makes that explicit rather than leaving a permanent per-run error (§4.4).

### 1.8 Baseline test results (executed before any change)

Command:

```
cd backend && python -m pytest tests -q --ignore=tests/unit/test_unified_rbac_consolidation.py
```

Result: **13 failed, 845 passed, 24 skipped** (881 collected).
A further module, `tests/unit/test_unified_rbac_consolidation.py`, fails at **collection**
with a pre-existing `ImportError` (`ACCOUNT_LEVEL_SUPER_EMPLOYEE` removed from
`app.core.rbac`) and is excluded from the run so the rest of the suite can execute.

Frontend baseline (`npm test`, run in a clean worktree at `57c4e84`):
**10 failed, 579 passed, 1 skipped** (590 tests). All ten are `SUPER_EMPLOYEE` /
account-level regressions — the same removed constant — and none touch media.

Pre-existing failures (**none caused by this work** — see §15 for the after-run comparison):

| Module | Count | Nature |
|--------|-------|--------|
| `tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py` | 1 | SQLite session-isolation in the harness |
| `tests/unit/test_account_level_schema_migration.py` | 2 | Alembic head assertion (unrelated) |
| `tests/unit/test_api_contract.py` | 1 | Health-check contract (unrelated) |
| `tests/unit/test_phase3_product_media.py` | 5 | SQLite session-isolation: uncommitted rows visible to a second session |
| `tests/unit/test_phase6_image_formats.py` | 1 | The 2 `auth/` files are counted `INVALID` (**fixed by this change**, §4.4) |
| `tests/unit/test_workforce_api_wiring.py` | 3 | Attendance guard / legacy router assertions (unrelated) |

`tests/unit/test_media_schema_integrity.py` and `test_phase6_real_media_integration.py`
**skip** cleanly (no local PostgreSQL / no imported dataset) — that is by design.

---

## 2. Phase 1 — Environment separation

### 2.1 Expected behaviour per environment

| | Development | Automated tests | Staging | Production |
|---|---|---|---|---|
| Provider | `local` | `local` on a temp dir, or a mocked provider | `s3` (staging bucket) | `s3` (production bucket) |
| AWS credentials | not required | **forbidden** unless explicitly opted in | staging-scoped role/user | production-scoped role |
| CDN | unset | unset | staging distribution | production distribution |
| Mock assets | served from `frontend/public/images` | temp fixtures only | **not uploaded** | **not uploaded** |
| Missing config | warning | n/a | fail fast | **fail fast** |
| Fallback to local | allowed | allowed | **never** | **never** |

### 2.2 Implementation **[IMPLEMENTED]**

New module `backend/app/storage/environment.py`:

* `classify_environment()` → `development | test | staging | production`
  (from `APP_ENV`, plus `PYTEST_CURRENT_TEST` detection).
* `validate_storage_environment()` → list of `StorageConfigurationIssue(level, code, message)`.
  Issues are **fatal** when `level == "error"`, advisory when `warning`.
* `enforce_storage_environment()` → raises `StorageProviderNotConfigured` on any fatal issue.
* `assert_remote_storage_permitted()` → the production-bucket guard (§2.3).

Rules encoded:

| Code | Condition | Level |
|------|-----------|-------|
| `PROD_LOCAL_STORAGE` | `APP_ENV=production` and provider `local` | error |
| `PROD_MISSING_CDN` | `APP_ENV=production` and no `MEDIA_CDN_BASE_URL` | error |
| `PROD_INSECURE_CDN` | `APP_ENV=production` and CDN base is not `https://` | error |
| `PROD_PLACEHOLDER_CREDENTIALS` | provider `s3` and any AWS value still a `.env.example` placeholder | error |
| `S3_MISSING_CONFIG` | provider `s3` and bucket/region/credentials incomplete | error |
| `PROTECTED_BUCKET_OUTSIDE_PRODUCTION` | active bucket is listed in `MEDIA_PROTECTED_BUCKETS` while the environment is not production | error |
| `REMOTE_STORAGE_IN_TESTS` | provider `s3` while running under pytest without `MEDIA_TEST_ALLOW_REMOTE_STORAGE=1` | error |
| `LOCAL_STORAGE_OUTSIDE_REPO` | `LOCAL_MEDIA_ROOT` resolves outside the repository | warning |
| `LOCAL_MEDIA_ROOT_IS_MOCK_DIR` | `LOCAL_MEDIA_ROOT` points at the mock asset directory | warning |

### 2.3 Safeguards against accidental production writes **[IMPLEMENTED]**

1. **Test guard** — `create_storage_provider()` refuses to build an S3 provider while
   `PYTEST_CURRENT_TEST` is set or `APP_ENV` is `test|testing|pytest|ci`, unless
   `MEDIA_TEST_ALLOW_REMOTE_STORAGE=1`. This is the single choke point every caller uses,
   so a test cannot inherit a production `.env` and start writing.
2. **Protected-bucket list** — `MEDIA_PROTECTED_BUCKETS` (comma-separated) names buckets that
   may only ever be used when `APP_ENV=production`. Setting a staging environment to the
   production bucket is a startup error, not a silent success.
3. **Never-local-in-production** — `APP_ENV=production` + `STORAGE_PROVIDER=local` raises at
   startup with an actionable message.
4. **Status endpoints** — `/media/storage/status` stays public but carries no bucket identity;
   `/media/storage/readiness` is admin-only (`media.view`) and returns the full issue list.

### 2.4 Acceptance criteria

* [x] **[TESTED]** `APP_ENV=production` + `STORAGE_PROVIDER=local` → startup validation error.
* [x] **[TESTED]** pytest + `STORAGE_PROVIDER=s3` → `StorageProviderNotConfigured` unless the
  explicit opt-in is set.
* [x] **[TESTED]** staging bucket listed in `MEDIA_PROTECTED_BUCKETS`, non-production env → error.
* [x] **[TESTED]** development with `STORAGE_PROVIDER=local` and no AWS variables → works.
* [x] **[TESTED]** mock assets remain readable from `frontend/public/images`.

---

## 3. Phase 2 — Hardened Amazon S3 adapter

### 3.1 Required capabilities → delivered

| Capability | Status |
|---|---|
| Upload image objects | `put_object` with SSE, checksum, conditional write **[IMPLEMENTED]** |
| Retrieve / stream | `get_object` / `open_object` with translated errors **[IMPLEMENTED]** |
| Metadata + existence | `head_object` first; checksum from stored metadata **[IMPLEMENTED]** |
| Safe delete | `delete_object` returns `False` when absent, translates errors **[IMPLEMENTED]** |
| List | bounded `list_objects(prefix, limit)` **[IMPLEMENTED]** |
| Stable object keys | unchanged `products/{PRODUCT_ID}/{filename}` **[PRESERVED]** |
| Conflict detection | `IfNoneMatch="*"` + pre-check + checksum compare **[IMPLEMENTED]** |
| Error propagation without credential/path leakage | `_translate_client_error()` **[IMPLEMENTED]** |

### 3.2 Collision semantics (contract, unchanged for callers)

`MediaService.store_image()` already implements it and the S3 adapter now honours it:

* same key + **identical bytes** → `alreadyExists: True`, nothing written (re-runs are safe);
* same key + **different bytes**, `replace_existing=False` → `ObjectCollisionError` (HTTP 409);
* same key + **different bytes**, `replace_existing=True` → the write lands on a **new
  content-addressed key** (§5.3), never on the old key.

### 3.3 AWS security configuration **[EXTERNAL]** — must be provisioned outside the repo

| Resource | Setting | Notes |
|----------|---------|-------|
| Production bucket | `pratikshya-media-prod` (suggested) | dedicated; never used by tests or staging |
| Staging bucket | `pratikshya-media-staging` (suggested) | dedicated; synthetic images only |
| Block Public Access | **ON** (all four) | CloudFront OAC is the only reader |
| Ownership | Bucket owner enforced | required for OAC |
| Encryption at rest | SSE-S3 (`AES256`) or SSE-KMS | `AWS_S3_SSE_ALGORITHM`, `AWS_S3_SSE_KMS_KEY_ID` |
| Versioning | **enabled** | recovery mechanism; pair with a non-current-expiration lifecycle rule |
| Lifecycle | abort incomplete multipart after 7 d; expire non-current versions after 90 d (tune to the recovery policy) | §10.5 |
| Transport | HTTPS only (bucket policy denies `aws:SecureTransport=false`) | — |
| IAM | least-privilege role: `s3:PutObject`, `GetObject`, `DeleteObject`, `ListBucket`, `HeadBucket` **scoped to `products/*`, `hero/*`, `marketing/*`, `collections/*`** | workload identity (IRSA / ECS task role / EC2 instance profile) preferred |
| Credentials | injected by the platform or a secret manager | **no long-lived IAM user keys**; no credentials in the repo |

Least-privilege policy sketch (staging and production differ **only** in the bucket ARN):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListMediaPrefixes",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::pratikshya-media-prod",
      "Condition": { "StringLike": { "s3:prefix": ["products/*", "hero/*", "marketing/*", "collections/*", ""] } }
    },
    {
      "Sid": "ObjectAccess",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::pratikshya-media-prod/products/*",
        "arn:aws:s3:::pratikshya-media-prod/hero/*",
        "arn:aws:s3:::pratikshya-media-prod/marketing/*",
        "arn:aws:s3:::pratikshya-media-prod/collections/*"
      ]
    }
  ]
}
```

> **No AWS infrastructure is provisioned by this change.** There is no AWS account access
> from this environment; provisioning requires explicit authorisation (§10).

### 3.4 Verification performed here

* [x] **[TESTED]** the adapter is exercised against a **mocked boto3 client** (no network,
  no credentials): put / get / open / metadata / exists / delete / list / collision /
  error translation / SSE parameters / checksum parameters / key stability.
* [ ] **[STAGING]** real-bucket verification — see §9.

---

## 4. Phase 3 — Local-provider and mock-asset protections

### 4.1 Local provider: unchanged behaviour, one addition

`LocalStorageProvider` keeps every existing behaviour (atomic writes, traversal rejection,
root confinement, prune-empty-parents). Added: `list_objects(prefix, limit=None)`.

### 4.2 Do not use the mock asset directory as the upload destination **[IMPLEMENTED]**

`validate_storage_environment()` emits `LOCAL_MEDIA_ROOT_IS_MOCK_DIR` (warning in
development, error in production) when `LOCAL_MEDIA_ROOT` resolves inside
`frontend/public/images`.

### 4.3 No automatic copy of mock assets to S3 **[IMPLEMENTED]**

`run_migration()` now refuses any provider whose `name != "local"` unless the caller passes
`allow_remote=True` **and** `settings.MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE` is true. The CLI
exposes a single explicit flag `--allow-remote-store`, which additionally requires the
environment variable. Default: refuse with an explanatory message naming this document.

```
$ python -m app.services.media.migrate_local
ERROR: the configured storage provider is 's3'. The local-media importer copies the
DEVELOPMENT MOCK asset library and must never write it to a remote bucket
(see docs/PRODUCT_MEDIA_S3_CDN_IMPLEMENTATION_PLAN.md §4.3).
Pass --allow-remote-store together with MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE=1 only if you
are deliberately seeding a bucket with the mock library.
```

* [x] **[TESTED]** the importer refuses an S3 provider by default.
* [x] **[TESTED]** the importer still works against a local provider.

### 4.4 Auth-screen assets are not media **[IMPLEMENTED]**

`discover_source_files()` now skips the `auth/` directory: those two files are authentication
UI art served directly from Vite `public/`, they are in no served media namespace, and they
must never become product media objects. They remain untouched on disk.

Side effect: `tests/unit/test_phase6_image_formats.py::RealSourceDryRunTests` — previously
**failing** (`planned 238 != total 240`) — now passes, because the importer's notion of a
"source file" matches the set it can actually import.

### 4.5 Legacy-image registration stays explicit **[PRESERVED]**

`scripts/register_legacy_product_images.py` (Track E) is unchanged. It remains an opt-in,
`--dry-run`-first, local-database-guarded tool that creates `media_media_asset` rows from the
**legacy mock** product columns. It is deliberately **not** part of any deployment step.

---

## 5. Phase 4 — CDN delivery

### 5.1 Intended flow (unchanged architecture, S3 inserted behind the existing abstraction)

```
Admin / authorised employee
   → POST /api/v1/media/products/{productId}/objects      (RBAC: media.upload)
   → signature + size + dimension validation
   → StorageProvider.put_object  →  S3 (private, SSE, versioned)
   → MediaAssetModel + ProductMediaModel rows (one transaction)
   → build_media_url(object_key)  →  https://cdn.pratikshyafashion.com/{key}
   → CloudFront (OAC) → S3
   → customer storefront
```

### 5.2 Single source of truth for the CDN base **[IMPLEMENTED]**

* `MEDIA_CDN_BASE_URL` → the **only** CDN setting.
* `CDN_BASE_URL` → **removed** from `Settings` and from `.env.example` (dead field; verified
  unused by a repository-wide grep). Removing it eliminates the ambiguity permanently.
* `build_media_url()` prefers the CDN base and falls back to the API media route — unchanged
  behaviour, now with no competing setting.

### 5.3 Immutable assets and replacement **[IMPLEMENTED]**

* New key helper `content_addressed_product_key(product_id, filename, checksum)` →
  `products/{PRODUCT_ID}/{stem}-{sha256[:12]}.{ext}`.
* `is_content_addressed_key(key)` → the leaf stem ends in `-{12 hex}`.
* `cache_control_for_key(key)` →
  * content-addressed → `public, max-age=31536000, immutable`
  * otherwise → `public, max-age=3600, must-revalidate` (an admin may legitimately replace it)
* Replacement policy in `MediaService.store_image(..., replace_existing=True)`: when a
  **different** object already exists at the deterministic key, the new bytes are written to
  the content-addressed key instead. The response carries `replacedKey` / `replacedFromKey`.
  The old object and its asset row are left in place (history + recovery) and the product
  mapping is re-pointed by the route. Nothing is ever served stale under a key that was
  previously cached.

### 5.4 CloudFront configuration **[EXTERNAL]**

| Setting | Value |
|---------|-------|
| Origin | the S3 bucket, **Origin Access Control (OAC)**, Origin Shield optional |
| Bucket policy | allow `cloudfront.amazonaws.com` with `AWS:SourceArn` = the distribution ARN |
| Viewer protocol | **Redirect HTTP → HTTPS** |
| Cache policy | `Managed-CachingOptimized`, plus honour `Cache-Control: max-age, immutable` from the origin |
| TTL | min 1 / default 86400 / max 31536000; the object's own `Cache-Control` decides |
| Compression | on |
| Response headers policy | `Managed-SecurityHeadersPolicy` (adds `X-Content-Type-Options: nosniff`); the backend also sets it |
| Alternate domain | `cdn.pratikshyafashion.com` with an ACM certificate in `us-east-1` |
| Invalidation | **not required** for genuine replacements — replacements get a new key (§5.3). Keep a manual invalidation runbook for incident response only. |

`GET /media/objects/{key}` remains mounted as an explicit **compatibility / diagnostic**
path: it streams from the active provider (local or S3) and is the fallback when no CDN is
configured. It is never removed.

### 5.5 No redundant URL columns **[PRESERVED]**

No `picture1/2/3` columns are introduced. `media_media_asset.object_key` is the only stored
reference; every URL is derived at read time by `build_media_url()`.

### 5.6 Frontend alignment **[IMPLEMENTED]**

`frontend/src/services/media/mediaPaths.js` `mediaObjectUrl(key)`:

* `VITE_MEDIA_ORIGIN` empty → `{MEDIA_URL_PREFIX}/{key}` (unchanged).
* `VITE_MEDIA_ORIGIN` set → `{origin}/{key}` — matching the backend's
  `{MEDIA_CDN_BASE_URL}/{key}` convention for a CDN that fronts the bucket at its root.
  Previously it produced `{origin}{MEDIA_URL_PREFIX}/{key}`, which is only correct when the
  CDN proxies the API route, not when it fronts the bucket directly.

Also updated `frontend/.env.example` with the CloudFront semantics.

* [x] **[TESTED]** a frontend unit test covers both branch shapes.

---

## 6. Phase 4b — Database design: preserved

### 6.1 Intended representation — already the shipped model, unchanged

| Table | Role |
|-------|------|
| `media_media_asset` | asset identity: `object_key` (unique), `storage_provider`, `mime_type`, `file_size`, `checksum_sha256`, `width`, `height`, `title`, `alt_text`, `caption`, `status`, `scope`, `uploaded_by` |
| `media_product_media` | product ↔ asset: `product_id`, `media_id`, `role`, `sort_order`, `is_primary`, `assigned_by`, `assignment_note`; `UNIQUE(product_id, media_id)` |
| `catalog_product` legacy columns | `image`, `hover_image`, `additional_images`, `media_ids`, `primary_media_id`, `gallery_media_ids` — **dual-read compatibility only** |

### 6.2 Verdict: no schema change required **[NO MIGRATION]**

The audit found **no defect that needs a schema change**. Everything this mission asks for is
expressible with the existing tables and columns:

* multiple images per product → `media_product_media` rows;
* primary selection → `is_primary` (demoted transactionally, never two primaries);
* ordering → `sort_order` + stable tie-break on the association id;
* replacement → a new content-addressed key + a new asset row + a re-pointed mapping;
* recovery → `status`/`scope` already exist, and S3 versioning covers the bytes.

**No Alembic revision is added by this change.** Nothing destructive is migrated.

### 6.3 Consistency guarantees **[IMPLEMENTED]**

* **Failed upload → no misleading row.** The object is written first; if the subsequent
  registration/commit fails, the newly created object is deleted again (best-effort
  compensation) and the error is raised. Previously the object was left behind, orphaned.
* **Failed DB write → recoverable object.** See above; the audit endpoint (§7.3) reports any
  leftovers.
* **Delete ordering reversed.** The asset row is committed first, then the object is removed,
  so the register can never hold a row pointing at a deleted object. If the object delete
  fails, the leftover is reported by the orphan audit rather than hidden.
* [x] **[TESTED]** registration failure removes the just-written object.
* [x] **[TESTED]** multi-image upload preserves ordering and primary selection across a
  session reload.

---

## 7. Phase 5 — Media lifecycle hardening

### 7.1 D-1 — legacy product-image references **[IMPLEMENTED]**

`app/services/media/media_reference_audit.py::audit_object_references()` counts, for one
object key / asset row:

| Reference kind | Source |
|---|---|
| `productMedia` | `media_product_media.media_id` |
| `productLegacy` | `catalog_product.image`, `.hover_image`, `.additional_images`, `.media_ids`, `.primary_media_id`, `.gallery_media_ids` — matched against the object key, its canonical media URL **and** its legacy `/images/{key}` form |
| `homepageSection` | `homepage_section_item.media_asset_id` |
| `marketingPlacement` | `media_marketing_media.object_key`, `.media_asset_id`, `.mobile_media_asset_id` |

`DELETE /media/objects/{key}` returns **409** with the per-kind counts when **any** of them is
non-zero. This closes D-1, D-2 (no more silent homepage cascade) and D-3.

* [x] **[TESTED]** legacy `image` reference blocks deletion.
* [x] **[TESTED]** legacy `additional_images` reference blocks deletion.
* [x] **[TESTED]** homepage-section reference blocks deletion **and the homepage item survives**.
* [x] **[TESTED]** marketing `media_asset_id` reference blocks deletion.
* [x] **[TESTED]** an unreferenced object still deletes cleanly.

### 7.2 D-4 — delete ordering **[IMPLEMENTED]** (see §6.3)

### 7.3 Orphaned-object detection: dry-run report only **[IMPLEMENTED]**

`GET /media/audit/orphans` (admin, `media.view`) returns a **report only** — it deletes
nothing:

```
{
  "ok": true,
  "mode": "dry-run",
  "deletionPerformed": false,
  "assetsWithoutReferences":  [ { assetId, objectKey, existsInStorage, ... } ],
  "objectsWithoutAssetRows":  [ { objectKey, size, contentType } ],
  "counts": { ... }
}
```

No automatic garbage collection is added. Deletion of anything reported here requires a
separate, explicitly authorised operation.

* [x] **[TESTED]** the report lists an orphaned object and deletes nothing.

### 7.4 Upload validation hardening **[IMPLEMENTED]**

`app/services/media/media_validation.py` now also enforces:

* `MAX_IMAGE_PIXELS` (default `50000000`) — decompression-bomb ceiling via Pillow's
  `MAX_IMAGE_PIXELS` guard;
* `MAX_IMAGE_DIMENSION_PX` (default `8000`) — per-side ceiling;
* a decode failure is recorded, not fatal: **AVIF is not decodable by the pinned Pillow
  10.3 without an extra plugin**, so an image Pillow cannot open is accepted on its
  content signature (the existing, unchanged policy) and the dimension check is skipped with
  a debug log. Honest limitation: AVIF is protected by the size ceiling and the magic-byte
  signature only. Add `pillow-avif-plugin` to close it fully.

* [x] **[TESTED]** an oversized declared dimension is rejected for a decodable format (PNG).
* [x] **[TESTED]** an AVIF upload still round-trips (no regression).

### 7.5 Employee authorisation **[PRESERVED]**

Unchanged and re-covered by tests: `media.upload` grant required; DRAFT/PENDING_REVIEW only;
`is_primary` rejected; object namespace pinned to the product's own `products/{id}/`;
re-registering an already-mapped asset never reshapes an admin-set mapping.

---

## 8. Phase 6 — Configuration defaults

### 8.1 Corrections applied **[IMPLEMENTED]**

| Setting | Before | After |
|---|---|---|
| `LOCAL_MEDIA_IMPORT_SOURCE` | `../../frontend/pratikshya-frontend/public/images` | `../frontend/public/images` |
| `LOCAL_MEDIA_ROOT` (`.env.example`) | `../../frontend/pratikshya-frontend/public/images` | `storage/media` |
| `CDN_BASE_URL` | present, unused | **removed** |
| `AWS_ENDPOINT_URL` | read via `getattr`, not declared | declared |
| `AWS_S3_SSE_ALGORITHM` / `AWS_S3_SSE_KMS_KEY_ID` | — | added (`AES256` default) |
| `MEDIA_PROTECTED_BUCKETS` | — | added |
| `MEDIA_TEST_ALLOW_REMOTE_STORAGE` | — | added |
| `MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE` | — | added |
| `MAX_IMAGE_PIXELS` / `MAX_IMAGE_DIMENSION_PX` | — | added |

### 8.2 `.env.example` **[IMPLEMENTED]**

Reorganised into Development / Shared / Staging / Production blocks with placeholder values
and explanatory comments. **No secrets.** Placeholder AWS values still count as "not
configured" (`app/storage/s3.py::_is_placeholder`), so a copied-but-unfilled `.env` can never
be mistaken for real credentials.

### 8.3 Startup / readiness **[IMPLEMENTED]**

* `app.main.lifespan` calls `enforce_storage_environment()` **after** the existing migration
  check, so a misconfigured production deployment refuses to start with the actionable
  message list rather than silently serving locally.
* `GET /api/v1/media/storage/readiness` (admin, `media.view`) returns the full issue list
  without restarting the process.

---

## 9. Phase 7 — Testing

### 9.1 New backend tests (all executed, all passing)

| File | Covers |
|---|---|
| `tests/unit/test_storage_s3_adapter.py` | S3 adapter against a mocked boto3 client: put/get/open/metadata/exists/delete/list, SSE + checksum parameters, conditional write, key stability, collision, error translation, no credential leakage |
| `tests/unit/test_media_environment_isolation.py` | environment classification, production-local rejection, production CDN requirement, protected-bucket guard, pytest remote guard, development-without-AWS |
| `tests/unit/test_media_reference_audit.py` | legacy product columns, homepage cascade prevention, marketing asset ids, orphan dry-run report |
| `tests/unit/test_media_cdn_and_replacement.py` | CDN base-url precedence, cache-control policy, content-addressed replacement, immutable keys, mock-asset importer refusal, registration-failure compensation |

### 9.2 New frontend test

| File | Covers |
|---|---|
| `frontend/tests/productMediaS3Cdn.test.js` | `mediaObjectUrl` with and without `VITE_MEDIA_ORIGIN`; absolute CDN URLs pass through untouched; legacy `/images/…` references pass through |

### 9.3 Regression checks executed

* `backend`: `python -m pytest tests -q --ignore=tests/unit/test_unified_rbac_consolidation.py`
  (see §11 for the before/after comparison).
* `frontend`: `npm test` (node:test suite).
* `frontend`: `npm run build` (production build).
* Storage audit: `python -m app.services.media.migrate_local --dry-run`.

---

## 10. Deployment

### 10.1 Environment variables that must be configured **outside** the repository

| Variable | Dev | Staging | Production | Notes |
|---|---|---|---|---|
| `APP_ENV` | `development` | `staging` | `production` | drives every guard in §2 |
| `STORAGE_PROVIDER` | `local` | `s3` | `s3` | production + `local` = startup error |
| `AWS_REGION` | — | `ap-south-1` | `ap-south-1` | must match the bucket region |
| `AWS_BUCKET_NAME` | — | staging bucket | production bucket | never the same value |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | *(prefer role)* | *(prefer role)* | **use a workload role where the platform supports one** |
| `AWS_ENDPOINT_URL` | — | — | — | only for a custom/VPC endpoint |
| `AWS_S3_SSE_ALGORITHM` | — | `AES256` | `AES256` or `aws:kms` | |
| `AWS_S3_SSE_KMS_KEY_ID` | — | — | KMS key id | required only when `aws:kms` |
| `MEDIA_CDN_BASE_URL` | *(empty)* | staging CDN | `https://cdn.pratikshyafashion.com` | https, no trailing slash |
| `MEDIA_PROTECTED_BUCKETS` | — | staging bucket name | — | makes the prod bucket unusable outside production |
| `LOCAL_MEDIA_ROOT` | `storage/media` | — | — | never the mock asset directory |
| `LOCAL_MEDIA_IMPORT_SOURCE` | `../frontend/public/images` | — | — | read-only mock source |
| `MEDIA_TEST_ALLOW_REMOTE_STORAGE` | — | `0` | `0` | only `1` for a deliberate staging soak test |
| `MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE` | `0` | `0` | `0` | `1` would allow seeding a bucket with mock art — **do not set** |
| `MAX_IMAGE_PIXELS` | `50000000` | `50000000` | `50000000` | |
| `MAX_IMAGE_DIMENSION_PX` | `8000` | `8000` | `8000` | |

Frontend (build-time, not secret):

| Variable | Production |
|---|---|
| `VITE_API_BASE` | `https://api.pratikshyafashion.com/api/v1` |
| `VITE_MEDIA_URL_PREFIX` | `/api/v1/media/objects` (must match the backend) |
| `VITE_MEDIA_ORIGIN` | `https://cdn.pratikshyafashion.com` |

### 10.2 AWS resources to provision **[EXTERNAL — not provisioned by this change]**

1. S3 bucket `pratikshya-media-prod` (private, versioned, SSE, Block Public Access on).
2. S3 bucket `pratikshya-media-staging` (same posture, separate account or separate prefix ownership).
3. CloudFront distribution with OAC + bucket policy scoped by `AWS:SourceArn`.
4. ACM certificate for `cdn.pratikshyafashion.com` in `us-east-1`.
5. DNS `CNAME cdn.pratikshyafashion.com → <distribution>.cloudfront.net`.
6. IAM role (workload identity preferred) with the policy in §3.3.
7. Lifecycle rules (multipart abort, non-current expiration).
8. CloudWatch alarms on 4xx/5xx and S3 `FirstByteLatency`; structured-log alert on
   `Media object stored provider=s3` failures.

### 10.3 Staging verification steps (exact)

```bash
# 0. Never point staging at the production bucket.
export MEDIA_PROTECTED_BUCKETS=pratikshya-media-prod

# 1. Configure (platform secret store, never a file in the repo).
export APP_ENV=staging
export STORAGE_PROVIDER=s3
export AWS_REGION=ap-south-1
export AWS_BUCKET_NAME=pratikshya-media-staging
export MEDIA_CDN_BASE_URL=https://staging-cdn.pratikshyafashion.com

# 2. Start the API — it must refuse to start if anything above is missing.
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 3. Readiness (admin session required).
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" \
     "$API/api/v1/media/storage/readiness" | jq
# expect: {"ok": true, "issues": []}

# 4. Generate a SYNTHETIC test image (never a mock catalogue asset).
python - <<'PY'
from PIL import Image, ImageDraw
im = Image.new("RGB", (1200, 1600), (24, 24, 32))
ImageDraw.Draw(im).rectangle([100, 100, 1100, 1500], outline=(230, 230, 240), width=8)
im.save("/tmp/staging-synthetic.jpg", quality=90)
PY

# 5. Upload it for a known staging product (admin, media.upload).
curl -sS -X POST "$API/api/v1/media/products/$PRODUCT_ID/objects" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -F "file=@/tmp/staging-synthetic.jpg;type=image/jpeg" \
     -F "role=COVER" -F "is_primary=true" -F "sort_order=0" | jq
# expect: object.url == "https://staging-cdn.pratikshyafashion.com/products/<ID>/staging-synthetic.jpg"

# 6. Object is really in S3 (not local), with SSE + checksum.
aws s3api head-object --bucket pratikshya-media-staging \
     --key "products/$PRODUCT_ID/staging-synthetic.jpg" \
  | jq '{ContentLength, ContentType, ServerSideEncryption, ETag}'
# expect: ContentLength == local file size, ServerSideEncryption == "AES256"

# 7. Byte-for-byte integrity.
aws s3 cp "s3://pratikshya-media-staging/products/$PRODUCT_ID/staging-synthetic.jpg" /tmp/back.jpg
cmp /tmp/staging-synthetic.jpg /tmp/back.jpg            # expect: silent
sha256sum /tmp/staging-synthetic.jpg /tmp/back.jpg      # expect: equal

# 8. Public access is blocked.
curl -sS -o /dev/null -w '%{http_code}\n' \
     "https://pratikshya-media-staging.s3.ap-south-1.amazonaws.com/products/$PRODUCT_ID/staging-synthetic.jpg"
# expect: 403

# 9. CDN serves it.
curl -sSI "https://staging-cdn.pratikshyafashion.com/products/$PRODUCT_ID/staging-synthetic.jpg"
# expect: 200, content-type image/jpeg, cache-control public, max-age=3600, must-revalidate
#         x-cache: Miss from cloudfront  (then Hit on the second request)

# 10. Registered read model (primary-first, ordering).
curl -sS "$API/api/v1/media/products/$PRODUCT_ID/media-set" | jq '.mediaItems'

# 11. Multi-image + ordering survives a reload: upload two more with sort_order 1 and 2,
#     reload the media-set, and confirm the order is 0, 1, 2 with exactly one isPrimary.

# 12. Replacement gets a NEW key and immutable caching.
curl -sS -X POST "$API/api/v1/media/products/$PRODUCT_ID/objects" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -F "file=@/tmp/staging-synthetic-v2.jpg;type=image/jpeg" \
     -F "replace_existing=true" -F "role=COVER" -F "is_primary=true" | jq '.object.key'
# expect: products/<ID>/staging-synthetic-<12 hex>.jpg
curl -sSI "https://staging-cdn.../products/<ID>/staging-synthetic-<12 hex>.jpg"
# expect: cache-control public, max-age=31536000, immutable

# 13. Deletion safety.
curl -sS -X DELETE "$API/api/v1/media/objects/products/$PRODUCT_ID/staging-synthetic.jpg" \
     -H "Authorization: Bearer $ADMIN_TOKEN"
# expect: 409 — the object is referenced by a product-media mapping

# 14. Orphan report (dry run, deletes nothing).
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" "$API/api/v1/media/audit/orphans" | jq '.counts'

# 15. Authorization: an employee without media.upload must get 403 on the upload in step 5,
#     and a customer/anonymous caller must get 401/403 on every mutation.

# 16. Confirm the mock library was never uploaded.
aws s3 ls s3://pratikshya-media-staging --recursive | wc -l   # expect: only the synthetic uploads
```

### 10.4 Production deployment checklist

1. [ ] All §10.2 resources provisioned and recorded (bucket ARNs, distribution id, KMS key).
2. [ ] `APP_ENV=production`, `STORAGE_PROVIDER=s3`, `MEDIA_CDN_BASE_URL` set **before** the deploy.
3. [ ] Workload role attached; **no** long-lived IAM user keys anywhere.
4. [ ] `MEDIA_PROTECTED_BUCKETS` includes the production bucket.
5. [ ] Database migrations current (`alembic upgrade heads`) — **no new revision in this change**.
6. [ ] Deploy; the process starts — if it does not, read `/api/v1/media/storage/readiness`
       or the startup log and fix the named issue before retrying.
7. [ ] `GET /api/v1/media/storage/status` (public) shows `provider: "s3"`, `cdnConfigured: true`
       and **no** bucket name.
8. [ ] Frontend built with `VITE_MEDIA_ORIGIN=https://cdn.pratikshyafashion.com`; a product
       page shows images loaded from the CDN hostname.
9. [ ] Upload **2–3 authorised, genuine** product images through the admin product-media
       manager; run §10.3 steps 6–10 against production.
10. [ ] Verify the storefront, cart, wishlist and admin list/detail surfaces render them.
11. [ ] Monitor for 24 h: upload failures, `5xx` from `/media/*`, CDN 4xx/5xx,
       `HeadObject` error rate, and the structured log line
       `Media object stored provider=s3`.
12. [ ] Only after step 11 is green, open uploads to the wider admin/employee group.
13. [ ] **Mock assets stay in place.** `frontend/public/images` is still served by Vite for
       any product whose image was never uploaded through the pipeline (the documented
       dual-read fallback) — do not delete it.

### 10.5 Operational recovery policy (to be finalised before any cleanup)

Once genuine uploads begin, decide and write down, before removing any local source file or
object version:

* retention for non-current S3 versions (suggested: 90 days);
* who may authorise an object deletion (suggested: two-person rule);
* the cadence of the orphan dry-run report (suggested: monthly);
* that `frontend/public/images` is retained until **every** catalogue product that references
  it has a registered S3 asset, and only then archived — never deleted in place.

---

## 11. Rollback and recovery

### 11.1 Application configuration rollback (no data movement)

| Symptom | Action |
|---|---|
| S3 misconfigured / uploads failing | set `STORAGE_PROVIDER=local` **and** `APP_ENV=staging` (or `development`), restart. Reads fall back to the local store; already-registered asset rows keep resolving because URLs are derived from keys, and the CDN keeps serving objects already cached. |
| CDN wrong or not propagating | unset `MEDIA_CDN_BASE_URL`, restart. `build_media_url()` immediately returns `/api/v1/media/objects/{key}`; no stored data changes because **no URL string is stored in the database**. |
| New code misbehaving | revert the deployment to the previous image. No schema change was made, so **no database down-migration is required**. |

Rollback is cheap by design: the database stores object **keys**, not URLs and not paths, so
switching provider or CDN is a configuration change with zero data migration.

### 11.2 Data recovery

| Loss | Recovery |
|---|---|
| Object deleted accidentally | S3 versioning → restore the non-current version (bucket versioning must be enabled, §3.3) |
| Asset row deleted but object present | `GET /media/audit/orphans` lists `objectsWithoutAssetRows`; re-register via `POST /media/register` |
| Object present but row references it wrongly | the orphan report + `checksum_sha256` identify the correct object |
| Half-finished upload (object, no row) | reported by the orphan audit; delete it explicitly or register it |
| Local store wiped in development | re-run `python -m app.services.media.migrate_local` (rebuilds the local store from the untouched mock source) |

### 11.3 Rollback of this change specifically

No schema migration, no data migration and no destructive operation is part of this change.
Reverting the commit restores the previous behaviour outright — the only thing to watch is
that any object written **after** the deploy stays in S3 and any asset row referencing it
keeps working, because both are provider-independent.

---

## 12. Dependencies

| Dependency | Version | Purpose | Notes |
|---|---|---|---|
| `boto3` | 1.34.96 (existing pin) | S3 client | already in `requirements.txt`; imported lazily inside `_require_client()` |
| `Pillow` | 10.3.0 (existing pin) | dimension / decompression-bomb guard | cannot decode AVIF without an extra plugin (§7.4) |
| `moto` | **not added** | — | the adapter is tested with an injected fake client, so no extra dependency and no network |
| AWS account + CloudFront | **[EXTERNAL]** | staging/production | not available from this environment |

---

## 13. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Mock assets accidentally uploaded to production | low | high | importer refuses non-local providers (§4.3); `MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE` default `0`; checklist step 16 |
| Tests inherit a production `.env` and write to the prod bucket | low | high | pytest/APP_ENV guard (§2.3); `MEDIA_PROTECTED_BUCKETS` |
| Production silently falls back to local storage | low | high | startup enforcement (§8.3) |
| Homepage content deleted as a cascade | medium | high | reference audit + 409 before any delete (§7.1) |
| Stale image after a replacement | medium | medium | content-addressed replacement key + immutable cache headers (§5.3) |
| CDN serves an object before it is committed | low | low | the object is written before registration, and the URL is only handed to the storefront after the transaction commits |
| AVIF decompression bomb not caught | low | low | size ceiling + signature still apply; add `pillow-avif-plugin` to close entirely |
| Bucket/region disclosure from a public endpoint | low | low | identifier redaction (§3.1 S-5) |
| No staging verification was possible here | **certain** | medium | §10.3 is written as a copy-pasteable runbook; the report labels this **[EXTERNAL]** rather than claiming success |

---

## 14. Deliverables

| # | Deliverable | Location |
|---|---|---|
| 1 | Implementation plan (this document) | `docs/PRODUCT_MEDIA_S3_CDN_IMPLEMENTATION_PLAN.md` |
| 2 | Minimal code + configuration changes | `backend/app/**`, `frontend/src/services/media/mediaPaths.js`, `backend/.env.example`, `frontend/.env.example` |
| 3 | Automated regression tests | `backend/tests/unit/test_storage_s3_adapter.py`, `test_media_environment_isolation.py`, `test_media_reference_audit.py`, `test_media_cdn_and_replacement.py`, `frontend/tests/productMediaS3Cdn.test.js` |
| 4 | Environment variables + AWS resources to configure externally | §10.1, §10.2 |
| 5 | Exact staging verification steps | §10.3 |
| 6 | Production deployment checklist | §10.4 |
| 7 | Rollback and recovery procedure | §11 |
| 8 | Final report (files changed, tests run, results, blockers) | §15 (below) and the closing message of the change |

---

## 15. Final report

### 15.1 Files changed

**Backend — production code**

| File | Change |
|---|---|
| `backend/app/storage/environment.py` | **new** — environment classification, configuration validation, protected-bucket guard, test-isolation guard |
| `backend/app/storage/s3.py` | rewritten adapter: SSE + checksum writes, conditional put, head-only metadata, error translation, bucket redaction, bounded listing; **fixes latent defect S-9 (`_is_placeholder()` matched every value, so the provider could not be constructed even with valid AWS credentials)** |
| `backend/app/storage/keys.py` | `content_addressed_product_key()`, `content_addressed_filename()`, `is_content_addressed_key()` |
| `backend/app/storage/urls.py` | `cache_control_for_key()` + the immutable/mutable cache policies |
| `backend/app/storage/base.py` | `put_object(..., cache_control=)`, `list_objects(..., limit=)`, `describe(include_identifiers=)` |
| `backend/app/storage/local.py` | bounded listing; `describe` signature |
| `backend/app/storage/__init__.py` | remote-storage guard in the factory; status payload carries environment + warnings and redacts bucket identity by default |
| `backend/app/services/media/media_reference_audit.py` | **new** — complete reference audit (5 families) + dry-run orphan report |
| `backend/app/services/media/media_service.py` | content-addressed replacement policy; cache-control propagation; `storage_status(include_identifiers=)` |
| `backend/app/services/media/media_validation.py` | dimension / decompression-bomb guard (skipped, not fatal, for formats Pillow cannot decode) |
| `backend/app/services/media/local_media_migration.py` | refuses any non-local provider; excludes `auth/` application chrome |
| `backend/app/services/media/migrate_local.py` | `--allow-remote-store` flag + refusal handling |
| `backend/app/api/v1/media.py` | delete now audits all five reference families and commits the row before the object; upload rolls its object back when registration fails; immutable/mutable cache headers; new `GET /media/storage/readiness` and `GET /media/audit/orphans` |
| `backend/app/schemas/media/media.py` | `MediaStorageReadinessResponse`, `MediaOrphanReportResponse`, additive status fields |
| `backend/app/main.py` | storage validation at startup |
| `backend/app/config.py` | `CDN_BASE_URL` removed; added `AWS_ENDPOINT_URL`, `AWS_S3_SSE_ALGORITHM`, `AWS_S3_SSE_KMS_KEY_ID`, `MEDIA_PROTECTED_BUCKETS`, `MEDIA_TEST_ALLOW_REMOTE_STORAGE`, `MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE`, `MAX_IMAGE_PIXELS`, `MAX_IMAGE_DIMENSION_PX`, `repository_root`, `app_environment`, `is_production`, `protected_media_buckets`; `LOCAL_MEDIA_IMPORT_SOURCE` default corrected |
| `backend/.env.example` | corrected defaults; Development / Shared / Staging / Production blocks; placeholders only, no secrets |

**Frontend**

| File | Change |
|---|---|
| `frontend/src/services/media/mediaPaths.js` | `mediaObjectUrl()` now builds `{origin}/{key}` when `VITE_MEDIA_ORIGIN` is set, matching the backend's `{MEDIA_CDN_BASE_URL}/{key}` |
| `frontend/.env.example` | documents the CloudFront shape |

**Tests**

| File | Tests |
|---|---|
| `backend/tests/unit/test_storage_s3_adapter.py` | 28 |
| `backend/tests/unit/test_media_environment_isolation.py` | 19 |
| `backend/tests/unit/test_media_reference_audit.py` | 19 |
| `backend/tests/unit/test_media_cdn_and_replacement.py` | 30 |
| `frontend/tests/productMediaS3Cdn.test.js` | 10 |

**No database migration is included. No mock asset was created, modified or deleted.**

### 15.2 Tests run and results

Backend (`python -m pytest tests -q --ignore=tests/unit/test_unified_rbac_consolidation.py`):

| | Baseline | After |
|---|---|---|
| Collected | 881 | 977 |
| Passed | 845 | 942 |
| Failed | 13 | **12** |
| Skipped | 24 | 24 |

The failure set is **identical except for one that this change fixes**:
`test_phase6_image_formats.py::RealSourceDryRunTests` (the two `auth/` files that
were counted `INVALID` on every migration run). The other twelve are pre-existing
SQLite-session-isolation and Alembic-head assertions unrelated to media storage.

New tests: **96 added, 96 passing.**

Frontend (`npm test`):

| | Baseline | After |
|---|---|---|
| Collected | 590 | 600 |
| Passed | 579 | 589 |
| Failed | 10 | 10 (identical set) |

Frontend production build (`npm run build`): **succeeds** (two pre-existing
esbuild warnings in files this change does not touch).

Storage audit (`python -m app.services.media.migrate_local --dry-run`):
238 / 238 importable, 0 invalid, source tree untouched.

### 15.3 Status of each requirement

| Requirement | Status |
|---|---|
| Development keeps working with mock assets and no AWS credentials | **[IMPLEMENTED] [TESTED]** |
| Automated tests cannot reach a production bucket | **[IMPLEMENTED] [TESTED]** |
| Production refuses to fall back to local storage | **[IMPLEMENTED] [TESTED]** |
| Staging uses a dedicated bucket | **[IMPLEMENTED]** (guard) / **[EXTERNAL]** (bucket) |
| S3 adapter: upload, get, stream, metadata, exists, delete, list, stable keys, collision detection, safe errors | **[IMPLEMENTED] [TESTED]** (mocked client) |
| S3 security: SSE, checksums, private bucket, HTTPS, versioning, lifecycle, least privilege | **[IMPLEMENTED]** (SSE + checksums) / **[EXTERNAL]** (bucket policy, IAM, CloudFront, lifecycle) |
| Single CDN base URL; `CDN_BASE_URL` resolved | **[IMPLEMENTED] [TESTED]** |
| Immutable / revalidating cache policy; replacement never serves stale | **[IMPLEMENTED] [TESTED]** |
| Database design preserved; no new image columns; no migration | **[IMPLEMENTED]** |
| Deletion accounts for legacy product references | **[IMPLEMENTED] [TESTED]** |
| Deletion accounts for homepage sections (no cascade) | **[IMPLEMENTED] [TESTED]** |
| Orphan detection, dry-run only | **[IMPLEMENTED] [TESTED]** |
| Upload-succeeded / DB-failed compensation | **[IMPLEMENTED] [TESTED]** |
| Dimension / decompression-bomb guard | **[IMPLEMENTED] [TESTED]** (AVIF measured since the review — see the security-review report) |
| Configuration defaults corrected | **[IMPLEMENTED] [TESTED]** |
| Mock assets never uploaded to S3 | **[IMPLEMENTED] [TESTED]** |
| Staging verification against real AWS | **[EXTERNAL]** — no AWS account access from this environment; §10.3 is the runbook |
| Production deployment | **[EXTERNAL]** — §10.4 is the checklist |

### 15.4 Remaining blockers

1. **AWS resources are not provisioned.** The bucket, the CloudFront
   distribution, the OAC bucket policy, the ACM certificate and the IAM role
   must be created by someone with account access. Nothing in this branch
   provisions them.
2. **Staging verification has not been performed.** §10.3 must be executed
   against the staging bucket before production is enabled.
3. ~~**AVIF geometry validation is not enforced.**~~ **RESOLVED by the
   post-implementation review** (see
   `docs/PRODUCT_MEDIA_S3_CDN_SECURITY_REVIEW.md` §4): `pillow-avif-plugin`
   is now pinned and registered, and AVIF dimensions and pixel counts are
   enforced like any other format.
4. **Pre-existing failures** (12 backend, 10 frontend, plus one collection
   error) are untouched by design: they belong to other subsystems. The 12
   backend failures were re-verified against the baseline commit `57c4e84`
   during the review; the baseline has the same 12 plus one more that this
   work fixed.

### 15.5 Acceptance

> *The application remains fully functional in local development with mock
> assets, automated tests cannot accidentally write to production resources,
> and the production deployment is prepared to store future genuine product
> images in S3 and deliver them through CloudFront without a database redesign
> or migration of mock images.*

* Local development with mock assets and no AWS: **verified** (96 new tests,
  existing 845-test backend suite, 579-test frontend suite, production build).
* Tests cannot write to production: **verified** by the pytest guard and the
  protected-bucket guard.
* Production prepared for S3 + CloudFront with no database redesign and no mock
  migration: **verified in code**; **live verification pending** the external
  AWS provisioning and the §10.3 staging run.

---

## 16. Post-implementation security & readiness review

This branch was subsequently reviewed independently (commit verification,
adversarial probing of the storage guards, and a test-suite comparison against
the baseline). The review found and fixed three defects in this work, closed
the AVIF validation gap recorded in §15.4, and re-verified every pre-existing
failure against `57c4e84`.

**Read `docs/PRODUCT_MEDIA_S3_CDN_SECURITY_REVIEW.md` for the findings, the
probes that found them, and the current test counts.** Where the two documents
disagree, the review is the later and measured source.
