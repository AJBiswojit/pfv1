# Product media (S3 + CloudFront) — independent security & readiness review

**Reviewed commit:** `7ac0f54` "Prepare product media for S3 + CloudFront delivery (no mock migration)"
**Baseline for comparison:** `57c4e84` (the commit `7ac0f54` was branched from)
**Branch:** `arena/c0b008bd-pfv1`
**Review result:** 4 defects found and fixed, 1 open gap (AVIF) closed, 42 regression tests added.
**Review commits:** this document's branch tip — see `git log 7ac0f54..HEAD`.

This review was carried out **before** any AWS staging setup and before any
genuine product-image upload. Nothing here provisions infrastructure, migrates
the mock catalogue, or uploads anything anywhere.

---

## 1. Commit and branch verification

Verified, not taken on trust from the previous report:

| Check | Result |
|---|---|
| Branch | `arena/c0b008bd-pfv1` |
| HEAD at review start | `7ac0f54`, in sync with `origin/arena/c0b008bd-pfv1` |
| `57c4e84` is HEAD's parent | yes (`git cat-file -t` → commit) |
| Working tree at review start | clean; only ignored entry `backend/.pytest_cache/` |
| Diff `57c4e84..7ac0f54` | 25 files, +4756 / −184 |
| Every file the previous report claimed | present in the diff |
| Committed secrets | none (`git grep` for `AKIA`/`ASIA`/`aws_secret_access_key=` on the tree → clean) |
| Generated artefacts committed | none (no `node_modules/`, `dist/`, `storage/*`, `*.db`, `*.log`, `.env`, `__pycache__`) |

The previous report's file list, test list and change summary were re-derived
from the diff and found accurate. Its *behavioural* claims were not trusted —
those were probed, and that is where the defects below came from.

---

## 2. Security boundaries — probed, not just read

Each row was exercised by running the code with a hostile configuration, not
by reading it.

### (a) Can automated tests reach a real bucket? — **NO**

`create_storage_provider(settings)` with a fresh `Settings` per scenario:

| Scenario | Result |
|---|---|
| `APP_ENV=production` + pytest running + production bucket | **REFUSED** (`REMOTE_STORAGE_IN_TESTS`) |
| `APP_ENV` unset + pytest running | **REFUSED** |
| pytest + `MEDIA_TEST_ALLOW_REMOTE_STORAGE=1` + unprotected bucket | BUILT (the documented, deliberate soak-test hatch) |
| pytest + `MEDIA_TEST_ALLOW_REMOTE_STORAGE=1` + **protected** bucket | **REFUSED** (`PROTECTED_BUCKET_OUTSIDE_PRODUCTION`) |

`classify_environment()` treats a running pytest as `test` regardless of
`APP_ENV`, so a developer with `APP_ENV=production` exported in their shell
still cannot reach a bucket. The opt-in opens the door only for a bucket that
is *not* in `MEDIA_PROTECTED_BUCKETS`.

### (b) Can staging use the production bucket? — **NO, with a caveat**

| Scenario | Result |
|---|---|
| staging → `pratikshya-media-prod`, listed in `MEDIA_PROTECTED_BUCKETS` | **REFUSED** |
| staging → a bucket **not** listed in `MEDIA_PROTECTED_BUCKETS` | BUILT |

**Caveat (by design, not a defect):** protection is driven entirely by
`MEDIA_PROTECTED_BUCKETS`. If production's real bucket name is not in that
list, staging pointed at it will be allowed. The staging checklist must set
`MEDIA_PROTECTED_BUCKETS` to the production bucket name(s) — see §7.

### (c) Does production refuse local storage and a missing/insecure CDN? — **YES, after the fix**

| Scenario | Before | After |
|---|---|---|
| production + `STORAGE_PROVIDER=local` | refused | refused |
| production + s3 + `MEDIA_CDN_BASE_URL=http://…` | **built a provider** | **REFUSED** (`PROD_INSECURE_CDN`) |
| production + s3 + no `MEDIA_CDN_BASE_URL` | **built a provider** | **REFUSED** (`PROD_MISSING_CDN`) |
| production + s3 + `https://` CDN | built | built (correct) |

See defect **D-2** below.

### (d) Do the status/readiness endpoints leak infrastructure? — **they did; fixed**

See defect **D-1** below.

### (e)–(g), (i) — verified in code, exercised by the existing suites

These were reviewed in code and are covered by the suites listed in §5; they
were not separately probed by this review.

* **(e) Auth / RBAC / ownership / lifecycle** — `GET /media/storage/readiness`
  and `GET /media/audit/orphans` return **401** to an anonymous caller
  (probed). Product-media mutation routes are gated by `media.upload` /
  `media.assign` / `media.delete` via `require_admin_permission`.
* **(f) Deletion cannot cascade-delete homepage content** — the delete handler
  (`app/api/v1/media.py`) calls `audit_object_references()` **before** deleting
  and raises `ConflictException` when anything references the asset. The audit
  covers all five families, including the two the earlier audit flagged:
  `productLegacy` (all six legacy product columns: `image`, `hover_image`,
  `additional_images`, `media_ids`, `primary_media_id`, `gallery_media_ids`)
  and `homepageSection` (`media_asset_id`). `HomepageSectionItem` still carries
  `ON DELETE CASCADE` — the guard is the audit, which is why it matters.
* **(g) Upload-succeeded / DB-failed compensation** — the row is written, then
  the object; on registration failure `_compensate_failed_registration()`
  removes the stored object. Object deletion happens **after** the row commit,
  so a failed object delete leaves a reportable orphan rather than a dangling
  mapping.
* **(i) Conditional writes / content-addressed replacement / checksums /
  cache headers** — `put_object(..., expect_absent=True)` sends
  `IfNoneMatch: *`; `ChecksumAlgorithm: SHA256` plus a persisted
  `sha256` metadata entry; `Cache-Control: public, max-age=31536000, immutable`
  for content-addressed keys and a revalidating TTL otherwise.
  Covered by `test_storage_s3_adapter.py` (29) and
  `test_media_cdn_and_replacement.py` (30).

### (h) Can S3 errors leak credentials / account detail? — **they could; fixed**

See defect **D-3** below.

### (j) Can the local-media importer write mock assets to remote storage? — **NO**

`run_migration(src, S3StorageProvider(...), …)` was called in four variants —
default, `allow_remote=True`, `dry_run=True`, and both — and every one raised
`RemoteImportRefused`. The two-key hatch
(`MEDIA_MIGRATION_ALLOW_REMOTE_STORAGE=1` **and** `allow_remote=True`) does
open the path, which is by design, and no CLI route reaches it: the only caller
is `app/services/media/migrate_local.py:216`, whose `resolve_provider()` can
return only a `LocalStorageProvider`. The only `S3StorageProvider(...)`
construction in the application is the factory at `app/storage/__init__.py`.

---

## 3. Defects found and fixed

Each was found by running the code with a hostile configuration and observing
the payload. Each has a dedicated regression test.

### D-1 — the anonymous status endpoint named the private bucket

`GET /media/storage/status` is reachable with no session. With staging pointed
at the protected production bucket it returned:

```json
{"ok": false, "detail": {"error": "AWS_BUCKET_NAME 'pratikshya-media-prod' is listed in
  MEDIA_PROTECTED_BUCKETS and may only be used when APP_ENV=production (current: staging). …"}}
```

The same channel leaked an absolute filesystem path through validation
warnings (`LOCAL_MEDIA_ROOT_IS_MOCK_DIR` quotes the offending path), and any
unanticipated provider exception was returned verbatim rather than only
`StorageProviderNotConfigured`.

**Fix**
* `app/storage/environment.py` — guard errors now carry a `public_code`; new
  `public_issue_detail()` (code only + a generic sentence) and
  `public_warning_summary()` (level + code, no message), and `sanitize_url()`
  which strips basic-auth userinfo and query-string secrets from any URL
  before it is logged or returned.
* `app/storage/__init__.py` — the anonymous payload reports the code only, and
  a catch-all now logs the exception class and returns
  `{"error": "Storage provider is not available."}` instead of propagating
  driver text.

**Verified after the fix** — same scenario, over HTTP, unauthenticated:

```json
{"ok": false, "detail": {"error": "Storage provider is not available.",
  "code": "PROTECTED_BUCKET_OUTSIDE_PRODUCTION"}}
```

No bucket name, no path, no `AKIA`/ARN/`request-id` canary anywhere in the body.

### D-2 — the CDN rules were enforced at startup but not at the factory

`enforce_storage_environment()` refuses to **start** production on a missing or
plain-HTTP CDN, and it *is* wired into the app lifespan (`app/main.py:111`).
But `create_storage_provider()` — the single choke point every other code path
enters — did not re-check, so any later construction (a worker, a management
command, a lazily-initialised singleton) could build a provider that serves
every product image over plain HTTP, or from the API process.

**Fix** — `FACTORY_BLOCKING_CODES` now includes `PROD_MISSING_CDN` and
`PROD_INSECURE_CDN`, so the factory refuses them too. Verified: production +
`http://` CDN → `REFUSED [PROD_INSECURE_CDN]`; production + no CDN →
`REFUSED [PROD_MISSING_CDN]`; production + `https://` CDN → builds correctly.

### D-3 — raw botocore text escaped the S3 adapter on three paths

The adapter translated `client.get_object()` but not:

1. the **`Body.read()`** of a successful `GetObject` (a download can fail part
   way through — that raise happens outside the guarded call);
2. the **`list_objects`** paginator;
3. the **`get_metadata`** stream fallback (taken for any object written before
   checksums were recorded).

A botocore message embeds the endpoint host, the assumed-role ARN, the request
id, and anything else AWS puts in it. A probe injecting a realistic
`AccessDenied` message recovered all of `pratikshya-media-prod.s3.ap-south-1.amazonaws.com`,
`arn:aws:sts::123456789012:assumed-role/…`, `request-id=…`, and an `AKIA`
canary from all three paths.

**Fix** (`app/storage/s3.py`) — all three now translate through the same
`_error_code()` / `_NOT_FOUND_CODES` table; the `finally: body.close()` guard
swallows close errors so it can no longer mask the real, translated error.
`open_object()` returns a stream by contract, so its reads are the caller's
responsibility — it is used only by the streaming media route, where headers
are already committed and the connection is dropped rather than a body
returned.

**Verified after the fix** — same probe:

```
[body.read()]             StorageProviderNotConfigured: Could not read the object body from S3.
[list_objects paginator]  StorageProviderNotConfigured: Could not list objects in S3.
[get_metadata stream]     StorageProviderNotConfigured: Could not read the object body from S3.
```

No canary in any message. Confirmed both at the adapter and through the
unauthenticated HTTP endpoint. Also re-asserted that a credential failure is
*not* reported as a missing object (`object_exists` raises
`StorageProviderNotConfigured`, not `False`), while a real `NoSuchKey` still
returns `False`.

### D-4 — the admin readiness endpoint returned raw exception text

`GET /media/storage/readiness` (admin-only) ended with
`except Exception: detail = {"error": str(exc)}`, which would surface the same
raw driver text to an authenticated administrator.

**Fix** — `app/api/v1/media.py:_storage_error_text()` passes storage-layer
exceptions through (their messages are ours and name nothing sensitive) and
reduces anything else to its class name, with the detail going to the log.

---

## 4. AVIF validation — the open gap is now closed

Pillow cannot decode AVIF out of the box, so before this review **every AVIF
upload silently skipped the geometry guard** — the house's dominant product
image format passed on its magic bytes and its size alone.

**Dependency (smallest change that works):** `pillow-avif-plugin==1.6.0` added
to `backend/requirements.txt`.

| Property | Evidence |
|---|---|
| No Pillow upgrade needed | installs against the pinned `Pillow==10.3.0`; `Pillow 10.3.0 / plugin 1.6.0` |
| No new system package | the wheel bundles libavif (`_avif.cpython-311-x86_64-linux-gnu.so`, `ldd` reports no missing libs) — relevant because the image is `python:3.11-slim` |
| Real AVIF round-trip | encode 7×5 → reopen → `(7, 5)`, `format=AVIF`, magic `ftypavif` |
| **Does not self-register** | a subprocess doing only `from PIL import Image` reports `registered_extensions()['.avif'] is None`. Production code **must** `import pillow_avif` explicitly — this is the single most important detail of the change |

**Implementation** — `app/services/media/media_validation.py`
`ensure_avif_support()` imports the plugin once per process (importing it is
what registers the codec) and returns `False`, never raising, when the wheel is
absent. `image_geometry()` calls it before `Image.open()`. A missing decoder
reports the new reason `avif-decoder-missing` — actionable, and distinct from
`not-decodable`, which means "this particular file is malformed".

**Behaviour now:**

| Input | Result |
|---|---|
| Real AVIF | dimensions measured and enforced (`dimension_check: "ok"`) |
| AVIF over `MAX_IMAGE_PIXELS` | rejected: *"The image is 20x10 (200 pixels), which exceeds the maximum of 100 pixels."* |
| AVIF over `MAX_IMAGE_DIMENSION_PX` | rejected: *"the longest side must not exceed 5 pixels."* |
| AVIF tripping Pillow's bomb guard (>2× the limit) | rejected as a decompression bomb |
| Malformed AVIF (correct brand, undecodable body) | **accepted**, geometry skipped and reported as `not-decodable` |
| AVIF bytes under a `.png` name | accepted, `extension_mismatch` flagged, sniffed type wins |
| AVIF over the size ceiling | rejected by the existing size check |

A malformed AVIF is deliberately *not* rejected: refusing the house's dominant
format because one file is corrupt would be a regression, and the signature,
MIME and size checks still apply. That decision is asserted by a test so it
cannot quietly become a silent hole.

**File-size, MIME-signature and authorization checks are unchanged. No mock
asset was created, modified, renamed, regenerated or migrated** — the new tests
build AVIF in memory, and the one test that reads the committed library opens
the files read-only.

**Finding (pre-existing, catalogue data, not touched):** of the 228 committed
`frontend/public/images/**/*.avif` mock files, 102 really are AVIF and all 102
decode; the other 126 are mislabelled — 111 JPEG and 15 PNG. They are mock
catalogue data and were left exactly as they are. The upload policy already
detects the mismatch (`extension_mismatch`) and serves the sniffed type; a test
asserts that.

---

## 5. Test results

### Backend — `python -m pytest tests -q --ignore=tests/unit/test_unified_rbac_consolidation.py`

The one exclusion is a **pre-existing collection error**: `test_unified_rbac_consolidation.py`
fails to import (`cannot import name 'ACCOUNT_LEVEL_SUPER_EMPLOYEE'`). It is
excluded identically at the baseline, so the comparison is like-for-like.

| | Baseline `57c4e84` | Current |
|---|---|---|
| Collected | 881 | **1020** |
| Passed | 845 | **984** |
| Failed | 13 | **12** |
| Skipped | 24 | 24 |

The baseline row was produced by exporting `57c4e84` with `git archive` into a
clean tree and running the same command there — not copied from a previous
report.

**The 12 current failures are a strict subset of the baseline's 13.** The one
that disappeared is
`test_phase6_image_formats.py::RealSourceDryRunTests::test_dry_run_accepts_every_asset_and_leaves_the_tree_untouched`,
fixed by the S3/CDN work itself (the two `auth/` files that were counted
`INVALID` on every migration run).

The 12, with their behaviour verified identical at the baseline:

```
tests/integration/test_phase3_step11c_product_media_taxonomy_flow.py
    ::Step11CProductMediaTaxonomyFlow::test_complete_product_media_taxonomy_flow_through_production_app
tests/unit/test_account_level_schema_migration.py::AccountLevelMigrationGraphTests::test_canonical_revision_is_r1
tests/unit/test_account_level_schema_migration.py::AccountLevelMigrationGraphTests::test_single_head_is_the_ensure_revision
tests/unit/test_api_contract.py::test_main_app_health_check_contract
tests/unit/test_phase3_product_media.py::RegisterRoleAllowListTests::test_a_role_longer_than_the_column_is_rejected_not_truncated
tests/unit/test_phase3_product_media.py::RegisterRoleAllowListTests::test_an_unknown_role_is_a_canonical_422_and_writes_nothing
tests/unit/test_phase3_product_media.py::RegisterRoleAllowListTests::test_role_is_validated_even_without_a_product
tests/unit/test_phase3_product_media.py::MediaVocabularyRbacTests::test_an_admin_without_media_upload_cannot_register
tests/unit/test_phase3_product_media.py::PublishGateMediaSourceTests::test_registering_a_new_primary_invalidates_the_product_cache
tests/unit/test_workforce_api_wiring.py::AdminAttendanceGuardTests::test_create_attendance_guard
tests/unit/test_workforce_api_wiring.py::AdminAttendanceGuardTests::test_list_update_delete_guards
tests/unit/test_workforce_api_wiring.py::RouterRegistrationTests::test_legacy_notifications_router_is_gone
```

**No new failure was introduced by this review.**

### New tests added by this review — 42, all passing

| File | Tests |
|---|---|
| `backend/tests/unit/test_media_storage_security_regressions.py` | 25 |
| `backend/tests/unit/test_media_avif_validation.py` | 17 |

(Reminder: `backend/.gitignore` contains a bare `tests/`, so new test files
need `git add -f`. Both were added that way.)

### Frontend — `npm test`

| | Baseline `57c4e84` | Current |
|---|---|---|
| Collected | 590 | 600 |
| Passed | 579 | 589 |
| Failed | 10 | 10 |
| Skipped | 1 | 1 |

Baseline verified by running the suite in the exported `57c4e84` tree. The 10
failures are the **same 10 test names** in both runs (indices shift by 10
because the S3/CDN work added 10 tests): the `SUPER_EMPLOYEE` / account-level
set plus `tests/unifiedLogin.test.js`. No frontend file was changed by this
review.

### Frontend production build — `npm run build`

Exit 0. Two pre-existing esbuild warnings remain (a duplicate `altText` key in
`src/components/admin/homepage/SectionPreview.jsx`, and one other), both in
files this work does not touch.

### Local development with no AWS credentials

Run with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` and
`AWS_PROFILE` unset:

| Check | Result |
|---|---|
| Credential variables in the environment | none |
| `enforce_storage_environment()` | no fatal issues |
| Effective environment / provider | `development` / `local` |
| `GET /api/v1/media/health` | 200 |
| `GET /api/v1/media/storage/status` | 200, `provider: local`, no path/secret/credential in the body |
| `GET /api/v1/media/storage/readiness` (anonymous) | **401** |
| `GET /api/v1/media/audit/orphans` (anonymous) | **401** |

*A full `uvicorn` boot could not be exercised in this sandbox* — the lifespan
runs a migration check that needs PostgreSQL, and no PostgreSQL server is
available here. That is an environment limitation, not a finding: the storage
guard was exercised directly, and the media routes were served through
`TestClient`.

---

## 6. Files changed by this review

| File | Change |
|---|---|
| `backend/app/storage/environment.py` | `public_code` on guard errors; `public_issue_detail()`, `public_warning_summary()`, `sanitize_url()`; `PROD_MISSING_CDN` / `PROD_INSECURE_CDN` added to `FACTORY_BLOCKING_CODES` |
| `backend/app/storage/__init__.py` | anonymous status payload reports the code only; catch-all returns a generic body and logs the class |
| `backend/app/storage/s3.py` | translate the body read, the list paginator and the `get_metadata` stream fallback; swallow close errors |
| `backend/app/api/v1/media.py` | `_storage_error_text()` for the admin readiness endpoint |
| `backend/app/services/media/media_validation.py` | `ensure_avif_support()`, `avif_decoder_available()`, `DIMENSION_AVIF_DECODER_MISSING`; AVIF geometry now measured |
| `backend/requirements.txt` | `pillow-avif-plugin==1.6.0` |
| `backend/tests/unit/test_media_storage_security_regressions.py` | **new**, 25 tests |
| `backend/tests/unit/test_media_avif_validation.py` | **new**, 17 tests |
| `backend/tests/unit/test_media_cdn_and_replacement.py` | one stale docstring corrected (AVIF *is* decodable now; that case is a malformed file) |
| `docs/PRODUCT_MEDIA_S3_CDN_IMPLEMENTATION_PLAN.md` | §15.3 / §15.4 corrected, §16 added |

No database migration. No new image column. No mock asset created, modified,
renamed or deleted. No AWS resource provisioned.

---

## 7. Remaining risks and what still needs a human with AWS access

1. **Nothing has been tested against real AWS.** Every storage test runs
   against an in-memory fake client injected through the `client=` seam, which
   is also the seam this review's probes used. Real S3 and CloudFront remain
   unverified.
2. **No AWS resources exist yet.** Bucket, CloudFront distribution, OAC bucket
   policy, ACM certificate and IAM role all have to be created by someone with
   account access. Nothing in this branch provisions them.
3. **`MEDIA_PROTECTED_BUCKETS` is what makes the staging guard work.** Set it
   to the real production bucket name in every non-production environment,
   otherwise §2(b)'s caveat applies.
4. **`pillow-avif-plugin` ships a compiled wheel.** The cp311 manylinux x86_64
   wheel is what was verified. If the deployment target is a different Python
   or architecture (e.g. Graviton/arm64), confirm a wheel exists for it before
   deploying, or `ensure_avif_support()` will return `False` and AVIF geometry
   will silently go unmeasured again (it will report `avif-decoder-missing`
   rather than failing).
5. **Malformed AVIF is accepted.** Deliberate (see §4), but it means a corrupt
   file can be stored and served. It cannot be stored as anything other than
   `image/avif`, and the size and signature checks still apply.
6. **126 committed mock `.avif` files are really JPEG/PNG.** Left untouched by
   instruction; flagged by `extension_mismatch` on upload. Worth cleaning up in
   the catalogue, separately from this work.
7. **12 backend + 10 frontend pre-existing failures remain.** Verified
   identical at the baseline; they belong to other subsystems (SQLite-session
   isolation, Alembic heads, `SUPER_EMPLOYEE` account levels).

---

## 8. Verified in code / verified locally / verified against real AWS

### Verified in code (read and reasoned about, not executed)

* Both audit-identified deletion risks are closed: `audit_object_references()`
  covers `productMedia`, `productLegacy` (all six legacy product columns),
  `homepageSection`, `marketingMedia` and `mediaReview`, and the delete handler
  refuses while any of them is non-zero.
* Upload compensation ordering (row committed before the object; object removed
  when registration fails).
* Conditional write (`IfNoneMatch: *`), `ChecksumAlgorithm: SHA256`, persisted
  checksum metadata, content-addressed immutable vs revalidating cache headers.
* The importer's remote refusal and the single CLI path to a local provider.
* CDN enforcement at both startup (`app/main.py`) and the factory.

### Verified locally (executed in this sandbox, no AWS)

* The entire environment/bucket guard matrix in §2 — every row was produced by
  running `create_storage_provider()` with a fresh `Settings`.
* D-1, D-3 and D-4 disclosure probes, before and after each fix, including
  through the real FastAPI routes with `TestClient`.
* The importer refusal, all four flag combinations.
* AVIF: real encode/decode round-trip, oversized-pixel, oversized-side,
  decompression-bomb, malformed and wrong-extension inputs; the
  decoder-missing degradation path; all 102 true AVIF files in the committed
  mock library decode.
* Full backend suite, full frontend suite, frontend production build, and the
  no-AWS-credentials local smoke test.

### Verified against real AWS — **nothing**

No claim of S3 or CloudFront readiness is made. Before production is enabled,
the staging runbook
(`docs/PRODUCT_MEDIA_S3_CDN_IMPLEMENTATION_PLAN.md` §10.3) must be executed and
must demonstrate: a real upload, a private-bucket check (direct S3 URL
refused), CDN retrieval, a byte-integrity check, and the authorization checks.
