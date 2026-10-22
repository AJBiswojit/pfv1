# Batch 1 — read-only media summary endpoint

**Date:** 2026-10-22
**Branch:** `arena/e402c824-pfv1` (base `50ad50bcaf496cb46771ced22c46e89091a10524`)
**Authorization:** Batch 1 of the approved plan
(`media-management-revised-implementation-plan-2026-10-22.md`) — nothing from
Batch 2 or later is included.

**Status:** implemented and unit-tested against the real routers, ORM models and
database sessions. Reviewed on 2026-10-22 and corrected where the review found a
gap (checksum validation, §1 note). **Not** verified against a deployed
environment or the production registry.

---

## 1. What changed

| File | Change | Lines |
| --- | --- | --- |
| `backend/app/schemas/media/media.py` | `MediaAssetSummaryResponse`, `MediaAssetSameByteCopies`, `MediaAssetNamespaceClassification` | +95 |
| `backend/app/api/v1/media.py` | `GET /media/assets/summary` + `_media_asset_summary()` + `_is_sha256_hex()` + `LARGE_MEDIA_FILE_BYTES`; module URL map updated | +258 |
| `backend/tests/unit/test_phase7_media_lifecycle.py` | `MediaAssetSummaryTests` (13 focused tests) | +492 |

**Post-review correction (2026-10-22).** The first implementation accepted any
64-character checksum as "known" and grouped on the raw column. The review found
that a 64-character **non-hex** value could create a duplicate group and that
mixed casing / surrounding whitespace split one digest into several groups. It
is now validated as 64 hexadecimal characters after trimming and case folding,
grouped on that normalized value, with the SQLite `GLOB` and PostgreSQL POSIX
regex predicates selected by dialect. Two regression tests were added; the
existing 95 lifecycle tests are untouched.

No migration, no model change, no persisted-data change, no frontend change, no
object-storage change, no dependency change.

---

## 2. Endpoint

```
GET /api/v1/media/assets/summary
```

* Mounted by `app/api/v1/media.py` under the existing `/api/v1` prefix — the URL
  is *not* declared twice.
* Authorization: `get_current_admin` + `require_admin_permission(..., "media.view")`
  — identical to `GET /api/v1/media/assets`.
  401 without a session (covered by test), 403 for a customer, employee or
  admin without the grant.
* Takes **no parameters**; independent of `page`/`q`/`scope`/`mime` filters.
  It always describes the whole registry.
* Read only: one `SELECT` for the metrics (authentication/RBAC may issue up to
  two further reads to resolve the caller's permissions), no
  `INSERT`/`UPDATE`/`DELETE`, no storage call, no checksum computation, no
  lifecycle/status transition.
* Database failure propagates to the canonical handlers (503
  `DATABASE_UNAVAILABLE` / `DATABASE_SCHEMA_ERROR`, 500 for anything unhandled).
  It is never converted into a zero-valued success.

### Sample response (real payload from the local test database)

Six assets: 2 product-scope (mapped), 2 marketing-scope (`hero/`),
1 product-scope video, 1 legacy row with no size and no checksum.

```json
{
  "ok": true,
  "countingScope": "all registered media assets (media_media_asset)",
  "largeFileThresholdBytes": 1572864,
  "total": 6,
  "images": 5,
  "videos": 1,
  "otherMimeTypes": 0,
  "productMapped": 2,
  "marketing": 2,
  "unassigned": 2,
  "largeFiles": 3,
  "unknownFileSize": 1,
  "sameByteCopies": { "assets": 2, "groups": 1, "unknownChecksums": 1 },
  "namespaceClassification": { "matches": 5, "mismatches": 0, "undetermined": 1 },
  "generatedAt": "2026-10-22T10:51:18.876786+00:00"
}
```

---

## 3. The eight metrics — exact calculation

All figures come from **one** SQL statement over `media_media_asset`, so the
cards can never disagree with each other through separate snapshots.

| # | Metric | Field | SQL predicate |
| --- | --- | --- | --- |
| 1 | Total | `total` | `COUNT(media_media_asset.id)` — every row, any status |
| 2 | Images | `images` | `LOWER(COALESCE(mime_type,'')) LIKE 'image/%'` |
| 3 | Videos | `videos` | `LOWER(COALESCE(mime_type,'')) LIKE 'video/%'` |
| 4 | Product Media | `productMapped` | `scope='product'` AND `id IN (SELECT DISTINCT media_id FROM media_product_media)` |
| 5 | Marketing Media | `marketing` | `scope='marketing'` — covers `hero/` **and** `marketing/` (R5) |
| 6 | Unassigned | `unassigned` | `scope='product'` AND `id NOT IN (…)` |
| 7 | Large Files | `largeFiles` | `file_size IS NOT NULL AND file_size > 0 AND file_size >= 1_572_864` |
| 8 | Same-byte copies | `sameByteCopies.assets` | members of valid 64-hex SHA-256 groups (trimmed, case-folded) with `COUNT(*) >= 2`, across **all** scopes (R1) |
|   |   | `sameByteCopies.groups` | number of those checksum values |

Supporting disclosures (not cards):

* `otherMimeTypes` — neither `image/` nor `video/`; keeps
  `images + videos + otherMimeTypes = total`.
* `unknownFileSize` — `file_size IS NULL OR file_size <= 0`.
* `sameByteCopies.unknownChecksums` — checksum NULL, blank, or not a valid
  64-character hexadecimal SHA-256 (validated after trimming, compared
  case-insensitively).
* `namespaceClassification` — `matches` / `mismatches` / `undetermined` between
  the stored `scope` and the object-key namespace (`hero/`, `marketing/`,
  `products/`; anything else is *undetermined*, never coerced).
* `largeFileThresholdBytes` and `countingScope` — the boundary and the universe
  being counted, returned with the numbers so no client has to guess.
* `generatedAt` — UTC ISO-8601 timestamp of the snapshot.

### Unknown handling (documented, enforced by tests)

* A row whose size is unknown is counted in `unknownFileSize`; it is **not**
  treated as a zero-byte file and can never satisfy `largeFiles`.
* A row whose checksum is unknown is counted in `unknownChecksums`; two unknown
  values are **never** grouped as identical bytes, and no object content is
  downloaded or re-hashed to fill the gap. Since the review correction, a
  checksum is only *known* when it is a valid 64-character hexadecimal SHA-256
  after trimming and case folding — a 64-character non-hex value is unknown.
* `scope` is authoritative (R4). A namespace/scope disagreement appears in
  `namespaceClassification.mismatches` and changes no count and no row.

### Efficiency

All eight metrics are computed in **one statement** (`DISTINCT` mapping
subquery, no join fan-out — an asset mapped to several products is still one
asset; no per-asset loop, therefore no N+1).

The request is not literally one statement: `require_admin_permission` resolves
the caller's roles and permissions with up to two further `SELECT`s (measured:
three statements on a cold RBAC cache, one on a warm cache; in deployment the
authentication dependency also performs its own user read). `generatedAt` is
produced in Python after the query returns, not by the database.

---

## 4. Tests executed

Environment: `python3 -m venv /tmp/pfvenv` + `backend/requirements.txt`;
SQLite via the suite's existing `ATTACH DATABASE … AS pratikshya` shim and real
FastAPI `TestClient` requests.

| Command | Result |
| --- | --- |
| `pytest tests/unit/test_phase7_media_lifecycle.py -k MediaAssetSummaryTests -o addopts="-ra"` | **13 passed**, 95 deselected |
| `pytest tests/unit/test_phase7_media_lifecycle.py -o addopts="-ra"` | **108 passed** (95 pre-existing + 13 new) |
| `pytest tests/unit/test_marketing_media.py tests/unit/test_phase6_media_db.py -o addopts="-ra"` | **28 passed** |
| `pytest test_phase7 + test_marketing_media + test_phase6_media_db` | **136 passed** |
| `pytest test_media_avif_validation, test_media_cdn_and_replacement, test_media_environment_isolation, test_media_reference_audit, test_media_schema_integrity, test_media_storage_security_regressions, test_phase3_product_media, test_phase6_media_storage, test_phase6_real_media_integration, test_phase3_error_envelope` | 249 passed, 24 skipped, **5 failed — pre-existing, unrelated** |
| `git worktree add --detach /tmp/pfv1-head 50ad50b` → same `test_phase3_product_media.py` | **same 5 failures at HEAD without these changes** |

The five pre-existing failures (`RegisterRoleAllowListTests` ×3,
`MediaVocabularyRbacTests`, `PublishGateMediaSourceTests`) are caused by the
upload route's auto-assigned mapping and exist on the base commit; they are not
touched by Batch 1 and were not "fixed" here.

### Test coverage map

| Requirement | Test |
| --- | --- |
| empty database → zeros, not errors | `test_empty_registry_returns_zeroes_not_errors` |
| mixed product + marketing scopes | `test_mixed_product_and_marketing_scopes` |
| `hero/` and `marketing/` both marketing | same (asserts stored `scope='marketing'`) |
| mapping vs unassigned, one asset on two products | `test_product_mapping_counts_each_asset_once_across_products` |
| image / video / other MIME partition | `test_image_video_and_other_mime_types_partition_the_total` |
| 1,572,863 vs 1,572,864 boundary | `test_large_file_boundary_is_exactly_1_5_mib` |
| duplicates across scopes, assets + groups | `test_same_byte_copies_count_assets_and_groups_across_scopes` |
| missing size/checksum truthfulness | `test_unknown_checksums_are_never_grouped_as_duplicates` |
| non-hex 64-char pair, mixed casing, padded digest | `test_checksum_validation_is_hex_strict_and_case_insensitive` |
| PostgreSQL branch validates hex (regex compile) | `test_sha256_predicate_renders_a_regex_on_postgresql` |
| namespace mismatch reported, no reclassification | `test_namespace_mismatch_is_reported_and_never_reclassified` |
| 401 / 403 / authorized read | `test_authorization_matches_the_registry_list` |
| DB error is not a zero summary | `test_database_failure_is_not_a_zero_valued_summary` |
| no write statements, no row mutation | `test_summary_issues_no_write_statements_and_changes_no_rows` |

---

## 5. Limitations and unresolved questions

1. **Not production-verified.** All results come from an in-process test
   database. The endpoint has not been exercised against PostgreSQL or the live
   registry; the query was additionally compiled for both the SQLite and
   PostgreSQL dialects without error.
2. **Batch 0 is still blocked**, so the real whole-registry values remain
   **unknown**. This endpoint can now report them without a browser script, but
   nobody has yet run it against a live environment.
3. **Freshness.** A missing or NULL `file_size`/`checksum_sha256` can only be
   fixed by re-reading object metadata elsewhere; the summary deliberately does
   not do that (it would need storage I/O and could alter counts mid-request).
4. **Status is not part of the eight cards.** `total` includes every status;
   the audit's status distribution remains a Batch 0 concern.
5. The endpoint returns no per-asset list and no file names — it cannot be used
   to identify which assets are duplicates.

---

## 6. Confirmations

* No migration or model change was made; the schema was not altered.
* No record was created, updated, deleted or reclassified by this work.
* No object-storage read, write, download or checksum computation occurs in the
  endpoint.
* No frontend file, hook, client, store, style or route was changed.
* Batch 2 and later remain untouched; this document covers Batch 1 only.
