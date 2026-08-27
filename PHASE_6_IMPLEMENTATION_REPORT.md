# PHASE 6 — Local S3-Compatible Media Storage & Product Image Migration

**Status:** COMPLETE (local-first, no AWS / Docker / Redis / Celery)
**Branch:** `arena/01a040c9-pfv1`
**Base commit:** `8681838c6c363689e0981f8bc56fe4af40e84e9b`
**Verification:** backend `253/253` unit tests green · frontend `170/170` tests green · `vite build` clean · `git diff --check` clean · 238/238 source assets byte-identical

---

## 1. Scope

Phase 6 delivers a **provider-agnostic storage abstraction** with a working
**local filesystem-backed object store**, an **application-level media URL**
contract, a **safe copy-based import** of the 238 real product assets, and
**backend-resolved product image references** — without AWS credentials,
Docker, MinIO, Redis, Celery, database migrations or any schema change.

In scope:

| Area | Delivered |
|---|---|
| Storage abstraction | `app/storage` — `StorageProvider` + `LocalStorageProvider` (active) + `S3StorageProvider` (interface-ready) |
| Local object store | `LOCAL_MEDIA_ROOT` (default `backend/storage/media`), atomic writes, SHA-256, content-type sniffing, listing |
| Object key convention | `{namespace}/{…}/{filename}`, product media at `products/{PRODUCT_ID}/{filename}` |
| Path & filename security | single choke point (`app/storage/keys.py`) + containment backstop; traversal / absolute / drive / encoded / symlink all rejected |
| Media URL architecture | `/api/v1/media/objects/{key}`, CDN-swappable via `MEDIA_CDN_BASE_URL` |
| Media serving | `GET`/`HEAD /media/objects/{key}`, `GET /media/object-meta/{key}`, correct `Content-Type`, 404, no path leakage |
| Admin media mutation | `POST /media/objects`, `POST /media/products/{id}/objects`, `DELETE /media/objects/{key}` — RBAC-guarded |
| Migration tool | `python -m app.services.media.migrate_local [--dry-run]` — copy-only, checksum-verified, idempotent |
| Product image integration | backend resolves `image` / `hoverImage` / `additionalImages` onto canonical media URLs |
| Frontend media seam | `services/media/mediaPaths.js` single resolver + `mediaApi` real object-storage calls |

Explicitly **out of scope** (documented, not faked) — see §19 and §20.

---

## 2. Existing Media Architecture (before Phase 6)

Audited before any change was made.

### Backend

| Surface | Pre-Phase-6 state |
|---|---|
| `app/api/v1/media.py` | **Health check only** — `GET /media/health` returning `{module:"media",status:"active"}`. No upload, read, list or delete route. |
| `app/api/v1/media_reviews.py` | Health check only. |
| `app/services/media/media_service.py` | Empty shell: `class MediaService: def __init__(self, db_session)`. |
| `app/services/media/upload_service.py` | Empty shell: `class UploadService: def __init__(self, db_session)`. |
| `app/models/media/*.py` | `MediaAssetModel`, `ProductMediaModel`, `MarketingMediaModel`, `MediaReviewModel` — each declares `__tablename__` and **no business columns**. |
| `app/schemas/media/media.py` | `MediaBase` / `MediaCreate` / `MediaResponse(id: str)` — declared, never imported anywhere. |
| `app/config.py` | `STORAGE_PROVIDER: str = "s3"` plus `AWS_*` / `CDN_BASE_URL` settings — **no storage implementation existed anywhere in the repo.** `grep -rn "boto3\|STORAGE_PROVIDER" app/` matched only the config line. |
| `app/utils/` | `__init__.py` docstring only — no storage utility to reuse. |
| `backend/storage/` | Empty except `.gitkeep`; already covered by `backend/.gitignore` (`storage/*`, `!storage/.gitkeep`). |
| Product media columns | `catalog_product` already has `media_ids` (JSONB), `primary_media_id` (String), `gallery_media_ids` (JSONB), `image` (Text), `hover_image` (Text), `additional_images` (JSONB). **The schema already supports product media references — no new column was needed.** |
| `GET /products/{id}/media-set` | Documented in the `products.py` module docstring but **not implemented** (`grep -rn "media-set" app/` matched only that comment). |
| File-type policy | `ALLOWED_IMAGE_TYPES = "image/jpeg,image/png,image/webp"` — **`image/avif` was absent** although 228 of the 238 real assets carry a `.avif` name. |
| RBAC vocabulary | `BUILT_IN_ROLES["ADMIN"].permissions` already contains `media.view`, `media.upload`, `media.assign`, `media.delete`. Phase 6 reuses these; no new permission was invented. |
| Static file handling | No `StaticFiles` mount; `frontend/public/images` is served by Vite. |

### Frontend

| Surface | Pre-Phase-6 state |
|---|---|
| `src/services/api/mediaApi.js` | All 12 exports returned `{ok:false, error:"…backend media tables do not have the required columns…"}`. No HTTP request was made. |
| `src/services/media/mediaPaths.js` | `resolveMediaUrl = (value) => typeof value === "string" ? value.trim() : ""` — an identity function. |
| `src/components/PratikshyaImage.jsx` | The shared renderer, used by 20 modules. Resolved through `resolveMediaUrl`, never invented a fallback. |
| `src/services/media/mediaStore.js` | In-memory **session mirror**, explicitly documented as having "no seed register and no localStorage authority". |
| `src/components/media/MediaUploadForm.jsx` | `handleSubmit` set a hard error string and returned; a block of unreachable dead code followed the `return`. |
| `src/config/mediaTypes.js` | `UPLOAD_RULES` already allowed `.avif` / `image/avif`; `UPLOAD_NOTICE = "DEMO MEDIA UPLOAD"`. |
| `src/pages/admin/media/*` | 7 desks (`AdminMediaLibrary`, `AdminMediaUpload`, `AdminProductMedia`, …) built on the in-memory register; reorder / role / pull-from-library work in the session mirror only. |
| `src/services/api/apiClient.js` | JSON-only; **no multipart support** ("The client has no multipart upload support" — END_TO_END_INTEGRATION_AUDIT §2.2). |
| `frontend/public/images` | **238 real asset files** — 228 `.avif`, 10 `.webp`, 78,819,747 bytes. |

### Documented blockers carried into Phase 6

`END_TO_END_INTEGRATION_AUDIT.md` §14B and `INTEGRATION_AUDIT.md` §7 both record
that the media tables carry no business columns and that no functional media
endpoint existed. Phase 6 removes the **object-storage** half of that blocker
and leaves the **media-register** half exactly as it was (§19).

---

## 3. Storage Abstraction

**New package `backend/app/storage/`** — the single storage seam. Nothing else
in the codebase builds a filesystem path or an object key.

| File | Purpose |
|---|---|
| `base.py` | `StorageProvider` ABC, `ObjectMetadata`, `StoredObject`, and the exception vocabulary (`StorageError`, `ObjectNotFoundError`, `InvalidObjectKeyError`, `StorageProviderNotConfigured`, `ObjectCollisionError`). |
| `keys.py` | The only place that decides what a legal object key is (§5, §6). |
| `signatures.py` | Content-signature sniffing shared by the upload policy and the provider's `Content-Type` reporting. |
| `urls.py` | `build_media_url` / `is_media_url` / `object_key_from_media_url` (§7). |
| `local.py` | `LocalStorageProvider` — the active provider (§4). |
| `s3.py` | `S3StorageProvider` — interface-ready, refuses to start without real credentials (§16). |
| `__init__.py` | `get_storage_provider()` / `create_storage_provider()` / `reset_storage_provider()` / `storage_status()`. |

The interface is the same six verbs any object store offers:

```python
put_object(key, data, content_type=None, metadata=None) -> StoredObject
get_object(key) -> bytes
open_object(key) -> BinaryIO
delete_object(key) -> bool
object_exists(key) -> bool
get_metadata(key) -> ObjectMetadata
url_for(key) -> str
list_objects(prefix="") -> Iterator[str]     # optional
```

**Why a new package rather than strengthening an existing one:** there was
nothing to strengthen. The only pre-existing artefacts were an unused
`STORAGE_PROVIDER = "s3"` setting and an empty `storage/` directory. No
duplicate abstraction was created — `grep -rn "^class StorageProvider\b" app/`
returns exactly one definition (`app/storage/base.py:122`).

---

## 4. Local Object Storage

`LocalStorageProvider` (`app/storage/local.py`), configured by
`LOCAL_MEDIA_ROOT` (default `storage/media`, resolved against the **backend
directory**, never the process working directory and never a machine-specific
absolute path).

On-disk layout mirrors the key space exactly:

```
backend/storage/media/
├── products/…/{PRODUCT_ID}/{filename}      191 objects
├── collections/…/{COLLECTION_ID}/{filename} 42 objects
└── hero/{filename}                           5 objects
```

| Behaviour | Implementation |
|---|---|
| Root creation | `ensure_root()` on construction; idempotent; persists across restarts |
| Write | temp file in the target directory → `fsync` → `os.replace` (atomic). An interrupted run leaves either the old object or the new one, never a partial file. |
| Read | `get_object` (bytes) and `open_object` (stream handle for `FileResponse`) |
| Delete | single named object; empty parent directories pruned, bounded to the root |
| Exists / metadata | `object_exists`, `get_metadata` (size, content type, SHA-256, mtime, etag) |
| Content type | **sniffed from the bytes**, falling back to the extension — see §9 for why this matters here |
| Listing | `list_objects(prefix)` in stable sorted order, skipping dot-files |

**Not** placed under `/tmp` or in runtime memory; the root is documented in
`.env.example` and lives inside the (git-ignored) `backend/storage/` tree, so
76 MB of assets is never committed.

---

## 5. Object Key Convention

```
{namespace}/{path…}/{filename}
```

with `namespace` restricted to a **closed vocabulary**:
`products`, `collections`, `hero`, `marketing`, `uploads`.

Product media:

```
products/{PRODUCT_ID}/{filename}
e.g. products/PF-W-SAR-SIL-0001/primary.avif
```

| Requirement | How it is met |
|---|---|
| Deterministic | Derived from the asset's own identity (product id + sanitised filename). **No random temp filename is ever the canonical identity.** |
| Collision-safe | The product-id segment is the catalogue's permanent id (`^[A-Z0-9][A-Z0-9-]{1,35}$`, reusing the existing `PRODUCT_ID_RE` shape); two products cannot collide, and a same-product re-upload lands on the same key so it can be compared by checksum. |
| Portable to S3 | Slash-delimited, `[A-Za-z0-9._-]` only, no spaces, no unicode, no leading dots, ≤ 200 chars/segment, ≤ 900 chars total. The same string is a valid S3 object name — a migrated bucket is a straight copy of the local root. |
| Independent of Windows paths | Backslashes are rejected outright; no drive letter; no UNC form. |
| Does not expose arbitrary filesystem paths | A key is a namespace-relative identifier. It never encodes `C:\…` or `/srv/…`, and error messages echo only the caller's key. |
| Does not rely on frontend public paths for identity | The key is a storage key. For the **migrated** assets it happens to mirror the source layout, which is a deliberate property: it makes the legacy `/images/<key>` → object-key mapping a pure string operation with no table lookup (§15). |

Upper case is allowed in a segment because catalogue product ids are upper
case and a key must map 1:1 onto the asset it names. The sanitiser still
**lower-cases untrusted input**; upper case is only accepted for
already-controlled ids.

---

## 6. Path & Filename Security

### One choke point

Every provider call goes through `LocalStorageProvider._resolve()`:

1. `normalize_object_key(key)` validates, then
2. the joined path is `resolve()`d and asserted to be inside the root.

Step 2 is the backstop for symlink tricks: `Path.resolve()` follows symlinks,
so a link planted inside the root that points outside is rejected rather than
followed.

### Rejections (`normalize_object_key`)

| Attack | Result |
|---|---|
| `../`, `../../` | rejected — traversal segment |
| `..\`, `products\..\..\app\config.py` | rejected — backslash is never legal |
| `/etc/passwd`, `//server/share/x` | rejected — absolute / UNC |
| `C:/Windows/win.ini`, `D:\pfv1\…` | rejected — drive letter |
| `%2e%2e%2f%2e%2e%2fetc%2fpasswd`, `..%2f..%2f…`, `C%3A/…` | percent-decoded **before** validation, then rejected |
| `products/PF-A/.env`, `products/.hidden/x` | rejected — dot-prefixed segment |
| `products//double`, `products/PF-A/` | rejected — empty segment / prefix not object |
| `secrets/token.txt` | rejected — namespace not in the allow-list |
| `\x00`, control chars, > 900 chars | rejected |

### Filename sanitisation (`sanitize_filename`)

`../../etc/passwd` → `passwd` · `..\..\windows\win.ini` → `win.ini` ·
`C:/temp/x.PNG` → `x.png` · `My Photo (final) #2.JPG` → `my-photo-final-2.jpg` ·
`ünicode-näme.png` → `unicode-name.png` · 400 chars → truncated to a 124-char
stem + `.png`. Null bytes, separators, traversal prefixes and leading dots are
all removed; the useful extension is preserved (≤ 8 chars). Names with nothing
safe left (`....`, `///`, `\x00`) are rejected, not silently renamed.

### Verified end-to-end (live server, `--path-as-is`)

```
../../etc/passwd                    → 422      C:/Windows/win.ini        → 422
..%2f..%2fetc%2fpasswd              → 422      C%3A/Windows/win.ini      → 422
%2e%2e/%2e%2e/etc/passwd            → 422      products/PF-X/.env        → 422
products/../../app/config.py        → 422      products/PF-X/%00secret   → 422
products/..%2f..%2fapp%2fconfig.py  → 422      secrets/anything.txt      → 422
..\..\windows\win.ini               → 422      products/PF-X/../../app/config.py → 422
/etc/passwd                         → 422
```

**Zero 200 responses.** The same 14 attempts through the Vite dev proxy return
404 (the proxy normalises `../` before forwarding — a second, independent
layer). `test_16b_no_file_is_ever_created_outside_the_root` additionally
asserts that no file appears anywhere outside the storage root.

---

## 7. Media URL Architecture

```
no CDN (this phase)   {API_V1_PREFIX}{MEDIA_URL_PREFIX}/{object_key}
                      /api/v1/media/objects/products/PF-W-SAR-SIL-0001/primary.avif

CDN configured        {MEDIA_CDN_BASE_URL}/{object_key}
                      https://cdn.example.com/products/PF-W-SAR-SIL-0001/primary.avif
```

`API_V1_PREFIX` is now read from settings by `main.py`
(`app.include_router(api_router, prefix=settings.API_V1_PREFIX)`), so the
router mount and the URL builder **cannot drift apart**. The default value is
unchanged (`/api/v1`), so every existing route path is identical to before.

The frontend never receives `C:\…`, `D:\…` or `/absolute/server/path/…`.
`LocalStorageProvider.describe()` and `storage_status()` deliberately omit the
absolute root; `test_describe_never_exposes_the_filesystem_root` and
`test_15f_status_payload_carries_no_secrets_and_no_paths` assert this.

---

## 8. Product Image Integration

### What the schema already supports

`catalog_product` already stores product media references — **no new column,
table or constraint was created**:

| Column | Type | Phase 6 use |
|---|---|---|
| `image` | Text | resolved to a canonical media URL |
| `hover_image` | Text | resolved |
| `additional_images` | JSONB | resolved element-wise, order preserved |
| `primary_media_id` | String(64) | passed through unchanged |
| `media_ids` | JSONB | passed through unchanged |
| `gallery_media_ids` | JSONB | passed through unchanged |

### Change

| File | Function | Old | New | Why | Test |
|---|---|---|---|---|---|
| `backend/app/services/catalog/product_service.py` | `_to_storefront` | `image=p.image or ""`, `hoverImage=p.hover_image or ""`, `additionalImages=p.additional_images or []` | same fields, values passed through `resolve_product_image_reference` / `resolve_product_image_list` | the backend, not the frontend, decides the canonical URL | `test_27_product_detail_projection_uses_the_canonical_media_url` |
| `backend/app/services/catalog/product_service.py` | `_to_admin` | same three raw fields | same three resolved fields | admin desk sees the identical contract as the storefront | `test_30_admin_projection_uses_the_same_contract` |

The API contract (field names, envelope, aliases) is unchanged — only the
**values** become canonical where the object store can serve them.
`MEDIA_RESOLVE_PRODUCT_IMAGES=false` restores the pre-Phase-6 behaviour with no
code change (`test_resolution_can_be_switched_off_without_a_code_change`).

### Resolution decision (`app/services/media/product_media_resolver.py`)

| Input | Status | Output |
|---|---|---|
| `""` / `None` | `empty` | `""` — no placeholder is ever invented |
| `https://…`, `data:`, `blob:` | `passthrough` | verbatim |
| `/api/v1/media/objects/…` | `passthrough` | verbatim (no double prefix) |
| `/images/<key>` **and the object exists** | `resolved` | `/api/v1/media/objects/<key>` |
| `/images/<key>` **and the object is absent** | `legacy-fallback` | the original reference, unchanged |
| `pm-lx8f2k-417` (media-register id) | `passthrough` | verbatim — never guessed at |

Decisions are cached in a bounded 4,096-entry LRU (so the hot catalogue list
does no repeated I/O) and cleared by `clear_resolution_cache()`.

---

## 9. Existing 238-Image Asset Audit

Recorded **before** any implementation, re-verified **after**.

| Metric | Value |
|---|---|
| Source folder | `frontend/public/images` |
| File count | **238** |
| Total bytes | **78,819,747** |
| By extension (filename) | 228 × `.avif`, 10 × `.webp` |
| By actual content signature | **102 AVIF, 111 JPEG, 15 PNG, 10 WebP** |
| Namespaces | `products` 191 · `collections` 42 · `hero` 5 |
| Path depth | 2 levels (5 hero files) · 5 levels (42 collection files) · 6 levels (191 product files) |
| Largest | `products/men/ethnic-wear/kurta-pajama/PF-M-ETH-KPJ-0002/primary.avif` — 4,233,759 B |
| Smallest | `products/kids/boys/casual-sets/PF-K-BYS-CS-0001/primary.avif` — 10,127 B |
| Baseline manifest | `backend/storage/migration/source-images-baseline.sha256` (238 lines, SHA-256 of the manifest file `068991709b0eb491d31bd4727434f83eb0f3d9da5c10529734d282eecc93d840`) |

### ⚠ Data-quality finding (pre-existing, NOT introduced, NOT "fixed")

**126 of the 238 assets have a filename extension that does not match their
bytes** — 111 `.avif` names containing JPEG data, 15 containing PNG data.
Example: `collections/fabrics/silk/PF-COL-FAB-SIL-0001/01.avif` begins
`ffd8ffe0…` (JPEG/JFIF), while
`products/women/sarees/silk/PF-W-SAR-SIL-0001/primary.avif` begins
`000000206674797061766966` (真 AVIF `ftypavif`).

Handling — chosen deliberately, because Phase 6 forbids renaming, converting
or modifying source files:

* every one of the 126 is **copied unchanged**;
* the object is **stored and served under the sniffed type**, so
  `GET /api/v1/media/objects/collections/…/01.avif` returns
  `Content-Type: image/jpeg` (verified live), which is what the bytes actually
  are;
* the disagreement is recorded per file in the manifest
  (`extensionMismatch: "image/avif->image/jpeg"`) and counted in the summary
  (`extension_mismatch: 126`) — reported, never hidden;
* no source file was renamed, re-encoded or touched.

This is logged as a **deferred data-quality issue** (§19.7): correcting it
properly means re-encoding or renaming real assets, which is out of scope.

### Integrity verification (after implementation)

```
SOURCE INTEGRITY CHECK (frontend/public/images must be untouched)
  baseline files : 238
  current files  : 238
  byte-identical : 238
  missing        : 0
  added          : 0
  changed        : 0
  result         : PASS — source untouched
```

Independently corroborated by Git: `git status --short -- frontend/public/images`
and `git diff --stat HEAD -- frontend/public/images` both return **0 lines**.

---

## 10. Migration Tool

| File | Role |
|---|---|
| `backend/app/services/media/local_media_migration.py` | Engine: discovery, policy classification, key mapping, copy, checksum, report, verification. |
| `backend/app/services/media/migrate_local.py` | CLI: `python -m app.services.media.migrate_local`. |

```bash
# from backend/
python -m app.services.media.migrate_local --dry-run            # 1. always first
python -m app.services.media.migrate_local                      # 2. real copy
python -m app.services.media.migrate_local \
        --verify-source storage/migration/source-images-baseline.sha256 \
        --no-migrate                                            # 3. re-verify source

# options: --source PATH --root PATH --manifest PATH --limit N --json
```

**Safety properties**

* Source files are opened `"rb"` only. `grep -E "shutil\.(move|rmtree)|\.unlink\(|os\.remove"` over the module returns nothing — asserted by `test_the_legacy_public_asset_folder_is_untouched_by_the_media_layer`.
* Writes go through `put_object` (temp + `os.replace`), so an interrupt cannot leave a partial object.
* Existing object with **identical** bytes → `ALREADY_IDENTICAL`, nothing rewritten.
* Existing object with **different** bytes → `COLLISION`, existing object left untouched. Never a silent overwrite.
* SHA-256 computed on the source **and** on the written destination; a mismatch is `CHECKSUM_MISMATCH` and the run continues.
* Each file is processed in its own `try/except`; one failure cannot corrupt another.
* **No database access at all** — the module imports no model and opens no session (§14).

**Manifest** — `backend/storage/migration/local-media-migration.json`, schema
`pratikshya.media.migration.v1`, SHA-256 `460ba84058f61688330ecbf00f8d2138ed43d0b1917378816e5ee34dcfd6155b`.
Per file: `source`, `objectKey`, `size`, `mimeType`, `sha256Source`,
`sha256Destination`, `status`, `extensionMismatch`, `detail`. It contains no
secrets and no absolute source or storage path (asserted by
`test_38b_manifest_records_every_file_with_its_checksum`).

The manifest lives under the git-ignored `backend/storage/` tree, following the
repository's existing convention for generated data.

---

## 11. Migration Dry Run

The **first** execution was a dry run, before any real copy:

```
PRATIKSHYA FASHON — local media import  [DRY RUN]
source            : frontend/public/images
provider          : local
mode              : dry run — nothing written
total source files: 238
would copy        : 238
already identical : 0
collision         : 0
checksum mismatch : 0
unsupported       : 0
invalid           : 0
failed            : 0
skipped           : 0
source bytes      : 78,819,747
NOTE: 126 source file(s) carry an extension that does not match their bytes…
checksum verification: not-run (dry run)
```

Post-condition verified: `find backend/storage/media -type f | wc -l` → **0**.
Only the empty storage root directory was created by provider construction;
no object was written. `test_31_dry_run_writes_nothing` asserts this.

The dry run is also what surfaced the 126 mislabelled assets **before** any
byte was written — the tool did its job as a review step.

---

## 12. Migration Verification

### Real run

```
total source files: 238        copied            : 238
already identical : 0          collision         : 0
checksum mismatch : 0          failed            : 0
unsupported       : 0          invalid           : 0
source bytes      : 78,819,747 destination bytes : 78,819,747
checksum verification: passed
re-verification   : passed (238 objects re-hashed)
```

Manifest totals: `sha256Source == sha256Destination` for **all 238 entries**
(verified programmatically, `all sha match: True`).

### Idempotent re-run

```
copied            : 0
already identical : 238
collision         : 0
failed            : 0
re-verification   : passed (238 objects re-hashed)
```

`test_35_identical_rerun_skips_safely` additionally asserts that object
`st_mtime_ns` values are unchanged, i.e. nothing was rewritten.

### Interrupted-run recovery (contract §30)

`test_interrupted_run_resumes_without_duplicate_corruption`:
`--limit 2` → 2 copied + 1 skipped; a second unrestricted run → 1 copied +
2 already-identical, 3 objects total, re-verification passes.

### End-to-end proof (live server)

Served object → source file → stored object, all one hash:

```
b807c7b6d570bf5f433823982eb46c465b1368303387def8f86db1ad44a5a12c  (via Vite proxy, browser path)
b807c7b6d570bf5f433823982eb46c465b1368303387def8f86db1ad44a5a12c  frontend/public/images/hero/hero001.avif
b807c7b6d570bf5f433823982eb46c465b1368303387def8f86db1ad44a5a12c  backend/storage/media/hero/hero001.avif
```

HTTP: `200 · image/avif · 46002 bytes` both directly on `:8000` and through the
Vite dev proxy on `:5173`.

---

## 13. Admin Media Integration

### Audit of what existed

| Capability | Where | Backend support |
|---|---|---|
| Image display | `AdminProductDetail.jsx` media panel, `AdminProductMedia.jsx`, `MediaThumb`, `MediaInboxCard` | ✅ renders product `image` / register thumbnails |
| Image selection / pull-from-library | `AdminProductMedia.jsx` (`unassigned` list) | ❌ operates on the in-memory session register |
| Upload | `AdminMediaUpload.jsx` → `MediaUploadForm.jsx` | ⚠ object upload now real; **registration** blocked |
| Remove / reorder | `AdminProductMedia.jsx` (ArrowUp / ArrowDown) | ❌ session register only |
| Preview | `AdminProductMedia.jsx` (`previewId`) | ✅ renders a resolved URL |

### What Phase 6 changed

| File | Function | Old | New | Why |
|---|---|---|---|---|
| `src/components/media/MediaUploadForm.jsx` | `handleSubmit` | hard-coded error string *"the backend media service has not been activated in this phase"* followed by an unreachable dead block | imports `MEDIA_UPLOAD_BLOCKER` and reports the **precise** blocker; dead code removed | the old copy was no longer accurate — object storage *is* live, media registration is not |
| `src/services/api/mediaApi.js` | all exports | 12 functions returning a generic unavailable stub, no HTTP | real calls for status / resolve / metadata / media-set / upload / delete; register functions keep an explicit `code:"BACKEND_GAP"` | honest split between what works and what does not |
| `src/config/mediaTypes.js` | `UPLOAD_NOTICE`, `UPLOAD_NOTICE_COPY` | `"DEMO MEDIA UPLOAD"` / "Files are previewed in this browser session only…" | `"MEDIA REGISTRATION BLOCKED"` / states that object storage is live but registration is blocked | accuracy |

### What Phase 6 deliberately did **not** do

* **No fake upload persistence.** `MediaUploadForm` still refuses to submit; it
  does not write to `localStorage`, `sessionStorage` or an in-memory register
  and pretend it succeeded.
* **No UI wiring of `apiUploadMediaObject` / `apiDeleteMediaObject`.**
  `grep -rn` confirms zero call sites outside `mediaApi.js` itself. They are
  exported and tested, ready for the phase that adds the media register.
  Wiring a delete button now would invite deletion of objects the UI cannot
  prove are unreferenced (§22).
* `AdminProductMedia.jsx` reorder / role / pull actions were **left as they
  are** — they are session-mirror features whose backend does not exist.

---

## 14. No Database Write During Migration

The migration CLI and engine import **no model and open no session**:

```
$ grep -nE "AsyncSessionLocal|app\.models|sqlalchemy" \
    backend/app/services/media/local_media_migration.py \
    backend/app/services/media/migrate_local.py
(no output)
```

No product row was read, written or mapped. `catalog_product.media_ids`,
`primary_media_id` and `gallery_media_ids` are **left exactly as they were** —
populating them from migrated objects would require a `media_media_asset`
record to point at, and that table has no columns. §19.1 records the blocker.

---

## 15. Frontend Media Integration

### The single seam

| File | Function | Old | New | Why |
|---|---|---|---|---|
| `src/services/media/mediaPaths.js` | `resolveMediaUrl` | identity + trim | resolves canonical media URLs against the configured media origin; passes remote/data/blob and legacy `/images/…` through verbatim; `""` for absent | one place decides the URL; a CDN or separate API origin becomes an env change |
| `src/services/media/mediaPaths.js` | NEW `mediaReferenceKind`, `normalizeMediaReference`, `mediaObjectUrl`, `isBackendMediaUrl`, `isLegacyPublicImageUrl`, `isRemoteOrInlineUrl`, `mediaOrigin`, `MEDIA_URL_PREFIX`, `LEGACY_PUBLIC_IMAGE_PREFIX` | — | classification + object-shape normalisation + key formatting + env-driven origin | requirement 20's single normalization layer; makes the dual-read observable |
| `src/components/PratikshyaImage.jsx` | `sourceOf` | `resolveMediaUrl(image?.src \|\| image?.url \|\| "")` | `normalizeMediaReference(image)` | also handles `{path}` / `{thumbnail}` records through the same seam |
| `src/services/api/apiClient.js` | `request`, NEW `apiClient.upload` | JSON only; `Content-Type: application/json` always set | `options.rawBody` sends a pre-built body with **no** Content-Type so the browser sets the multipart boundary | real file upload was impossible before |
| `src/services/api/mediaApi.js` | whole file | 12 unavailable stubs | 9 real object-storage functions + `encodeMediaKey` + `MEDIA_UPLOAD_BLOCKER`; 10 register functions keep an explicit `BACKEND_GAP` | see §13 |

Because **all 20 modules** that render product media already import
`PratikshyaImage`, this single change covers ProductCard, ProductDetail,
ProductGallery, ProductPreview, collection cards, search results, cart,
wishlist, recently viewed, order item imagery, the AI mirrors and the admin
desks. No component was edited independently, and a source-level test
(`no product surface builds a media path from a slug or an id`) asserts that
none of them templates an image filename.

### Configuration, not hardcoding

`frontend/.env.example` (new) documents `VITE_API_BASE`,
`VITE_MEDIA_URL_PREFIX`, `VITE_MEDIA_ORIGIN`. The default media origin is
**empty** (same-origin; Vite proxies `/api`), and a test asserts that no
`http://localhost`, `http://127.0.0.1` or drive-letter string appears in the
media layer.

---

## 16. Backward Compatibility

* **No broken-image window.** A `/images/…` reference whose object is not in
  the store keeps resolving to `/images/…`, served by Vite from `public/`.
  The old source remains fully available; nothing was moved or deleted.
* **Fallback is observable, not silent.** Every decision carries a `status`
  (`resolved` / `legacy-fallback` / `passthrough` / `empty` / `disabled`)
  available through `POST /api/v1/media/references/resolve` and the resolver's
  `explain()`. Live check:

  ```json
  {"reference":"/images/products/women/sarees/silk/PF-W-SAR-SIL-0001/primary.avif",
   "status":"resolved",
   "url":"/api/v1/media/objects/products/women/sarees/silk/PF-W-SAR-SIL-0001/primary.avif"}
  {"reference":"/images/products/does/not/exist.avif",
   "status":"legacy-fallback","url":"/images/products/does/not/exist.avif"}
  ```
* **No arbitrary fallback images.** Nothing substitutes a placeholder or
  another product's plate — `test_26_missing_images_do_not_crash_and_never_borrow_another_image`.
* **API contract unchanged.** Field names, aliases and envelopes in
  `StorefrontProduct` / `AdminProduct` are identical; only values moved to
  canonical URLs where resolvable.
* **Phase 1–5 tests untouched and green** — 155/155 before, 155/155 after.

---

## 17. Future S3 Compatibility

`S3StorageProvider` implements the identical verb set against the same object
keys. Configuration it expects (documented in `.env.example`, **not required
now**):

```
STORAGE_PROVIDER=s3
AWS_BUCKET_NAME=…      AWS_REGION=…
AWS_ACCESS_KEY_ID=…    AWS_SECRET_ACCESS_KEY=…
MEDIA_CDN_BASE_URL=https://cdn.example.com      # optional
```

Guarantees made and tested:

* `boto3` is imported **lazily inside `_client()`** — importing the module
  performs no AWS call and costs nothing.
* Construction without real credentials raises
  `StorageProviderNotConfigured`; the shipped placeholders (`your-access-key`,
  `your-secret-key`) are explicitly treated as *missing*, so a copied-but-
  unfilled `.env` cannot be mistaken for real credentials.
* No fake credentials are invented anywhere; nothing is tested against AWS.
* `describe()` returns bucket name and region only — never keys.
* An unknown `STORAGE_PROVIDER` fails loudly at startup rather than silently
  degrading.

Switching providers is therefore `STORAGE_PROVIDER=s3` + credentials +
`reset_storage_provider()`. No service, route, schema field or frontend module
changes — verified by the fact that every caller obtains its provider from
`get_storage_provider()`.

---

## 18. CDN Compatibility

No CDN is implemented or contacted. The seam is already in place:

| Layer | Setting | Effect when populated |
|---|---|---|
| Backend | `MEDIA_CDN_BASE_URL` | `url_for(key)` returns `{cdn}/{key}` instead of the API media route |
| Frontend | `VITE_MEDIA_ORIGIN` | relative canonical media URLs resolve against that origin |
| Frontend | `VITE_MEDIA_URL_PREFIX` | only if the backend mount ever changes |

`test_cdn_configuration_changes_only_the_url_shape` sets `MEDIA_CDN_BASE_URL`
and asserts the resolved product image becomes
`https://cdn.example.com/products/PF-W-SAR-SIL-0001/primary.avif` with no code
change. `is_media_url()` recognises both shapes, so a mixed old/new payload
still resolves correctly during a cutover.

The existing `CDN_BASE_URL` setting was **deliberately not reused** for media:
it defaults to `https://cdn.pratikshyafashon.com`, and pointing media at a
non-existent CDN would break every image.

---

## 19. Remaining Limitations

1. **Media register — BLOCKED (schema).** `media_media_asset`,
   `media_product_media`, `media_marketing_media` and `media_media_review`
   declare a `__tablename__` and **no business columns**. There is nowhere to
   persist a media title, MIME type, scope, role, product mapping, review
   state, width/height or checksum. Consequently: no media record can be
   created, listed, mapped, reviewed, approved or rejected; `media_ids` /
   `primary_media_id` / `gallery_media_ids` cannot be populated with anything
   meaningful. **Phase 6 did not invent schema to work around this.**
2. **Upload → product attachment is a manual two-step.** An admin upload
   returns `{key, url}`; attaching it means `PATCH /admin/products/{id}` with
   that URL in `image` / `hoverImage` / `additionalImages`. There is no
   one-call "upload and attach", because that would need a media record.
3. **No upload UI.** The admin form still reports the blocker rather than
   uploading. `apiUploadMediaObject` / `apiUploadProductMediaObject` are
   implemented and tested but intentionally have no call site.
4. **No delete UI, by design.** `apiDeleteMediaObject` exists and is
   RBAC-guarded, but nothing calls it: the backend cannot prove an object is
   unreferenced (there is no media-record table to query), so a UI delete
   button would risk orphaning live product images.
5. **No garbage collection.** Explicitly excluded — the architecture cannot
   support it safely yet.
6. **`media-reviews` router still health-only.** Media review workflow needs
   the `media_media_review` columns.
7. **Asset library extension/content mismatch (pre-existing data).** 126 of
   238 assets are `.avif` names holding JPEG (111) or PNG (15) bytes. Phase 6
   copies them unchanged and serves the sniffed type, but correcting it means
   re-encoding or renaming real assets — a data remediation task, not a
   storage task.
8. **`GET /products/{id}/media-set` still not implemented on the products
   router.** The equivalent lives at
   `GET /api/v1/media/products/{id}/media-set`. The stale line in the
   `products.py` docstring was left untouched (out of scope, deferred cleanup).
9. **Product-image resolution does one `exists()` per distinct reference**
   (cached in a 4,096-entry LRU). On a large catalogue the first pass after a
   restart costs one stat per unique reference; a real S3 deployment would
   want this behind a short-TTL cache or a materialised media table.
10. **No HEAD-range / partial-content support** on the media route; video
    seeking would need `Range` handling. Not required by the current asset
    library (images only).
11. **Marketing placement and product-media groups still use `localStorage`**
    (`marketingPlacementRepository.js`, `productMediaGroups.js`). These are
    *placement/grouping metadata*, not media bytes or authoritative media
    records, and they have no backend counterpart — left untouched and listed
    in §20.
12. **Local root is single-node.** A multi-instance deployment would need
    shared storage; that is exactly what the S3 provider is for.

---

## 20. DEFERRED — NOT CHANGED

| Surface | Why not changed here | Classification |
|---|---|---|
| `media_media_asset` / `media_product_media` / `media_marketing_media` / `media_media_review` columns | Would require new columns / a migration — forbidden this phase | **BLOCKED** |
| `app/api/v1/media_reviews.py`, `MediaReviewService` | Needs the review table's columns | **BLOCKED** |
| `AdminProductMedia.jsx` reorder / role / pull-from-library | Session-mirror features; no backend endpoint exists | **BACKEND_GAP** |
| `MediaUploadForm` submission | Media registration blocked (§19.1) | **BACKEND_GAP** |
| `mediaRepository.js`, `mediaStore.js`, `mediaResolver.js`, `mediaExposure.js`, `mediaOwnershipService.js`, `productMediaSet.js`, `productMediaGroups.js`, `mediaGroups.js`, `navigationEditorialMedia.js` | Large local media engines; rewiring them needs the register schema. Rewriting them without a backend would be churn with no integration gain. | **BACKEND_GAP / deferred** |
| `marketingPlacementRepository.js` (`localStorage`) | Marketing placements are not media bytes and have no backend table | **BACKEND_GAP** |
| `app/models/**`, `backend/alembic/**`, `scripts/seed_database.py` | Zero database change permitted | **out of scope** |
| Checkout, payments, orders, returns, cart, wishlist, employee, inventory, analytics, chatbot, notifications | Untouched — verified by `git diff --stat` | **out of scope** |
| Redis / Celery / Docker / `docker-compose.yml` / `Dockerfile` | Untouched; Phase 6 needs none of them | **out of scope** |
| `GET /explore/offers` and other Phase-5 deferred cleanups | Still deferred | **deferred** |
| `dependencies.py` `oauth2_scheme` `tokenUrl` literal `/api/v1/...` | Cosmetic docs metadata only; changing it is unrelated churn | **deferred** |

---

## 21. Safety Confirmations

### Images

* `frontend/public/images` — **238 files, 78,819,747 bytes, all byte-identical.**
* `verify_source_integrity` → `PASS — source untouched` (0 missing, 0 added, 0 changed).
* `git status --short -- frontend/public/images` → **0 lines**.
* `git diff --stat HEAD -- frontend/public/images` → **0 lines**.
* Nothing was deleted, renamed, moved, overwritten, compressed, resized or re-encoded. The migration is copy-only (`grep` asserts no `shutil.move`, `shutil.rmtree`, `.unlink(` or `os.remove` in the engine).

### Database

* **Zero** files changed under `backend/app/models/`, `backend/alembic/`, `backend/scripts/`, or `backend/app/core/database.py` (`git status --short` on those paths → 0 lines).
* No new table, column, index or constraint. No Alembic revision. No SQL. No production data mutation.
* The migration CLI/engine import no model and open no session.

### AWS / infrastructure

* No AWS credential is required, read, logged or committed. `STORAGE_PROVIDER` defaults to `local`.
* No AWS network call is possible: `boto3` is imported lazily inside a method that is never reached, and the provider refuses to construct without real credentials.
* No bucket, no CloudFront, no CDN contacted. `MEDIA_CDN_BASE_URL` defaults to empty.
* No Docker, MinIO, Redis or Celery dependency was added; no worker was introduced.
* `grep` over the new code for `AWS_SECRET`, `your-secret-key` and drive-letter patterns in API payloads → clean; asserted by tests.

### Authorization

* Every media mutation sits behind `get_current_admin` **and**
  `require_admin_permission(user, db, "media.upload" | "media.delete")` —
  the existing Phase-1 RBAC helpers and the existing `media.*` permission
  vocabulary. No new RBAC system.
* Unauthenticated `DELETE /media/objects/…` and `POST /media/objects` return
  **401** (verified live), and the object survives the attempt.
* `test_21b_admin_permission_is_actually_required` proves the permission check
  is not decorative: with `require_admin_permission` raising, no object is written.
* Frontend visibility is not the control.

### Deletion

* `DELETE` removes exactly one explicitly named object. No cascade, no GC, no
  automatic cleanup. `test_21c_admin_delete_removes_only_the_named_object`
  asserts a sibling object survives.
* The original `frontend/public/images` assets live outside the storage root
  and are unreachable from the media API by construction.

### Browser storage

* No media bytes and no authoritative media metadata are written to
  `localStorage` / `sessionStorage` by the Phase 6 layer (asserted by test).
* `apiClient`'s pre-existing `localStorage` use is limited to token keys.

### Regression gates

| Command | Result |
|---|---|
| `python -m compileall backend/app` | ✅ exit 0 |
| backend unit suite | ✅ **253 tests, OK** (155 Phase 1–5 + 98 Phase 6) |
| `npm test` (frontend) | ✅ **170 pass, 0 fail** (143 prior + 27 Phase 6) |
| `npm run build` | ✅ `✓ 2672 modules transformed … built in 7.95s` |
| `git diff --check` | ✅ clean |
| `pyflakes` over new/changed backend modules | ✅ no findings |
| Live smoke: media object over HTTP + Vite proxy | ✅ `200 · image/avif · 46002 B`, SHA-256 matches source |
| Live smoke: 14 traversal/absolute/drive/encoded attempts | ✅ all 422, zero 200 |
| Migration dry run → real run → re-run | ✅ 238 planned → 238 copied → 238 already-identical |

### Exact commands

`backend/tests` and `backend/tests/unit` carry no `__init__.py` (pre-existing
repository convention), so discovery is run from inside the unit directory:

```bash
# backend — from backend/
python -m compileall app
cd tests/unit && PYTHONPATH=<repo>/backend python -m unittest discover -s . -t .
#   → Ran 253 tests … OK

# frontend — from frontend/
npm test          # → # tests 170  # pass 170  # fail 0
npm run build     # → ✓ built

# migration — from backend/
python -m app.services.media.migrate_local --dry-run
python -m app.services.media.migrate_local \
    --verify-source storage/migration/source-images-baseline.sha256

# repository root
git diff --check  # → clean
```

### Final diff scope

```
 backend/.env.example                              |  46 ++-
 backend/app/api/v1/media.py                       | 394 +++++++++++++++++++++-
 backend/app/config.py                             | 102 +++++-
 backend/app/main.py                               |   4 +-
 backend/app/schemas/media/media.py                | 125 ++++++-
 backend/requirements.txt                          |   7 +  (test-only aiosqlite)
 backend/app/services/catalog/product_service.py   |  20 +-
 backend/app/services/media/media_service.py       | 263 ++++++++++++++++-
 backend/app/services/media/upload_service.py      | 131 ++++++++-
 frontend/src/components/PratikshyaImage.jsx       |  13 +-
 frontend/src/components/media/MediaUploadForm.jsx |  23 +-
 frontend/src/config/mediaTypes.js                 |   8 +-
 frontend/src/services/api/apiClient.js            |  29 +-
 frontend/src/services/api/mediaApi.js             | 238 +++++++++++--
 frontend/src/services/media/mediaPaths.js         | 161 ++++++++-

 new: backend/app/storage/{__init__,base,keys,local,s3,signatures,urls}.py
      backend/app/services/media/{local_media_migration,migrate_local,
                                  media_validation,product_media_resolver}.py
      backend/tests/unit/test_phase6_media_storage.py
      backend/tests/unit/test_phase6_media_db.py
      frontend/tests/phase6MediaStorage.test.js
      frontend/.env.example
```

No image, checkout, payment, order, return, cart, wishlist, employee,
inventory, Redis, Celery, Docker, database-schema, AWS, S3, CDN or unrelated
file appears in the diff.

---

## Tests & Verification (detail)

### Backend — `backend/tests/unit/test_phase6_media_storage.py` (82 tests)

| Group | Contract items | Tests |
|---|---|---|
| `LocalStorageProviderTests` | 1–7, 12, 13 | root creation, write descriptor, byte-exact read, exists, delete, missing-object (no path leak), true content type, collision not overwritten, checksum |
| `ObjectKeySecurityTests` | 8–11, 16 | 16 dangerous keys rejected, encoded traversal, provider refuses before I/O, filename sanitisation (7 cases + 5 rejections), deterministic product key, symlink escape, **no file created outside the root** |
| `StorageProviderConfigurationTests` | 15 | local default, configurable root, relative root resolves against the backend dir, S3 interface-ready + refuses fake credentials, unknown provider fails, status has no secrets/paths |
| `MediaValidationTests` | 5–6 | config-driven extensions, valid images, empty, oversize, unknown extension, no extension, content-not-filename, disallowed type, mislabelled-but-real, sniffer |
| `MediaApiTests` | 17–22 | valid media served + correct type, mislabelled asset served with the true type, 404, 6 invalid keys, unauthorised mutation, authorised admin upload, permission actually enforced, narrow delete, **4 attempts to read outside the root**, status endpoint, resolve endpoint |
| `MediaServiceContractTests` | — | application-level URL, non-image rejected, oversize rejected before buffering, content-type mismatch reported, delete never cascades |
| `ProductImageResolutionTests` | 23–30 | normalisation, legacy compatibility, local resolution, remote verbatim, media id never guessed, missing images, storefront projection, admin projection, cart/wishlist shape, recently viewed, kill-switch, CDN, candidate mapping, cache refresh |
| `MigrationTests` | 31–38 | dry run writes nothing, copy + key convention, source unchanged, SHA-256 both sides, identical re-run (mtime unchanged), collision reported + not overwritten, one failure doesn't corrupt others, summary counts, manifest contents, key determinism, extension mismatch recorded but migrated, interrupted-run resume, re-verification detects source drift, missing source root |
| `SourceIntegrityTests` | 35 | integrity passes after migration, detects a modified source file, tolerates a prefixed baseline path |

Fixtures build a tiny synthetic asset tree in a temp directory — **the real 238
production assets are never touched by automated tests.**

### Backend — `backend/tests/unit/test_phase6_media_db.py` (16 tests)

The suite above drives the storage, security, resolver and migration layers with
mocks, which is the right tool for those. Three Phase 6 routes are only
meaningful against a **live session**, because their entire job is to read and
authorise database state. Those are covered separately, against the **real
declarative models** and the **real Phase-1 RBAC chain** (`get_current_user` →
`get_current_admin` → `require_admin_permission`), executed unpatched:

| Group | What is proven |
|---|---|
| `ProductMediaSetRouteTests` | `GET /media/products/{id}/media-set` reads the real `catalog_product` row: migrated reference → canonical URL, unmigrated plate → legacy fallback, `mediaIds` reported but not resolved, unknown product → 404, a read writes nothing to the store |
| `StorefrontProjectionTests` | `GET /products/{id}` and `GET /admin/products/{id}` both return the canonical media URL, while the stored `image` column is left exactly as authored — resolution is a projection concern, never a write |
| `AdminMediaMutationRouteTests` | `POST /media/objects` with a real `users`/`roles`/`permissions`/`role_permissions`/`user_roles` graph: permitted admin → 201 and the bytes are really served; `media.view`-only admin → 403 naming `media.upload` and nothing written; customer → 403; non-image → 422 and nothing written; product-scoped upload of a missing product → 404; `DELETE` removes only the named object and leaves the migrated asset intact; delete without `media.delete` → 403 and the object survives; delete of a missing object → 404, never a silent OK |
| `ReferenceResolutionRouteTests` | the value read out of the real `image` column round-trips through `POST /media/references/resolve` to the canonical URL |

The seeded admin role is named `MEDIA_LIMITED`, deliberately **not** one of
`BUILT_IN_ROLES`, so the built-in permission vocabulary cannot quietly grant
anything the test did not insert — a 403 here is a real denial.

**Why SQLite, and exactly what that does and does not prove.** No PostgreSQL
server is reachable in this environment: the Debian package mirror is not on the
sandbox network (`apt-get install postgresql` → *Unable to locate package*), and
PostgreSQL has no pip-installable server. Rather than leave those routes
unverified, they run against SQLite through two **test-only** shims, neither of
which touches production code:

- `@compiles(JSONB, "sqlite")` renders Postgres `JSONB` as `JSON`;
- the models' `schema="pratikshya"` is satisfied by `ATTACH DATABASE … AS
  pratikshya` on every pooled connection.

This proves the queries, the ORM mappings, the RBAC joins and the route
contracts. It does **not** prove Postgres-specific DDL or JSONB operators —
none of which Phase 6 introduces, because the phase adds no migration, no
column and no index. `aiosqlite` is declared in `requirements.txt` under a
clearly labelled *Testing only* section; if the driver is absent the whole
suite **skips** with a message rather than failing (verified: 16 skipped, 0
errors).

### Frontend — `frontend/tests/phase6MediaStorage.test.js` (27 tests)

Media URL contract mirrors the backend (asserted against `backend/app/config.py`) ·
no hardcoded origin · canonical/remote/legacy/empty/unresolved resolution ·
record shapes · key formatting and escaping · catalogue store passthrough ·
empty product renders nothing · admin payload keeps media as plain strings and
no lifecycle keys · storage status request carries no secrets and no auth
header · resolution delegated to the backend · empty request makes no call ·
metadata + media-set reads · multipart admin-scoped upload with no JSON
content type · product-scoped upload · narrow delete · failure surfaces the
server message · register calls return `BACKEND_GAP` without a request ·
renderer resolves through one seam and never fabricates · no surface builds a
path from a slug/id · no media bytes in browser storage · upload form reports
the real blocker · the legacy asset folder is untouched by the media layer.

---

## Capability Classification

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | Local storage provider | **READY** | 238 objects served over HTTP; 82 backend tests; live smoke test |
| 2 | Storage abstraction | **READY** | one `StorageProvider` ABC; two implementations; all callers go through `get_storage_provider()` |
| 3 | Object upload | **PARTIALLY_IMPLEMENTED** | backend `POST /media/objects` works end-to-end with RBAC + validation; **no admin UI** and **no media record** (§19.1, §19.3) |
| 4 | Object read | **READY** | `GET`/`HEAD /media/objects/{key}`, correct `Content-Type`, ETag, 404, no path leakage |
| 5 | Object delete | **PARTIALLY_IMPLEMENTED** | `DELETE /media/objects/{key}` works, RBAC-guarded, narrow and tested; deliberately **no UI** because the backend cannot prove an object is unreferenced (§19.4) |
| 6 | Media URL | **READY** | `/api/v1/media/objects/{key}`; CDN-swappable; no filesystem path ever reaches the client |
| 7 | Path security | **READY** | 14 live traversal/absolute/drive/encoded attempts → all 422; symlink escape refused; no file created outside the root |
| 8 | Image migration | **READY** | 238/238 copied, idempotent re-run, interrupt-safe, source untouched |
| 9 | Checksum verification | **READY** | SHA-256 both sides for all 238; re-verification re-hashes 238 objects and the source |
| 10 | Product image integration | **READY** | backend-resolved canonical URLs in both projections; observable dual-read; kill-switch |
| 11 | Admin image management | **PARTIALLY_IMPLEMENTED** | display ✅, upload object ✅ (API only), register/reorder/role/remove ❌ **BACKEND_GAP** (§19.1) |
| 12 | Product image display | **READY** | one resolver, 20 consuming modules, no fabricated fallback, missing media renders an empty plate |
| 13 | Image deletion | **PARTIALLY_IMPLEMENTED** | single-object API delete only; no GC, no cascade, no UI (§19.4, §19.5) |
| 14 | Future S3 adapter readiness | **READY** | identical verb set, lazy `boto3`, refuses fake credentials, same object keys, zero caller changes needed |
| 15 | CDN readiness | **READY** | `MEDIA_CDN_BASE_URL` + `VITE_MEDIA_ORIGIN`; tested that only the URL shape changes |
| 16 | Media records / register / review | **BLOCKED** | `media_media_asset` et al. declare no business columns; no schema invented |

READY was granted only where the complete path — storage → service → route →
frontend — actually works and was exercised by an automated gate or a live
request. Anything resting on an absent column or an unwired UI is listed as
PARTIALLY_IMPLEMENTED, BACKEND_GAP or BLOCKED.

---

## Critical Success Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Local object storage works without AWS credentials | ✅ 238 objects served; `STORAGE_PROVIDER=local`; no credential read |
| 2 | Existing 238 images remain byte-identical | ✅ 238/238, `PASS — source untouched`, git clean |
| 3 | Migration is copy-based | ✅ source opened `"rb"` only; no move/unlink/rmtree in the engine |
| 4 | Migration is repeatable | ✅ re-run → 0 copied, 238 already-identical, mtimes unchanged |
| 5 | SHA-256 verification succeeds | ✅ all 238 source == destination; re-verification passes |
| 6 | Backend resolves media through an application-level URL | ✅ `/api/v1/media/objects/…`, verified live (200, correct type, matching hash) |
| 7 | Frontend displays product images through the new media path | ✅ single resolver + `PratikshyaImage`; verified through the Vite proxy |
| 8 | No arbitrary filesystem access is possible | ✅ 14 attack forms rejected; no `?path=` endpoint; namespace allow-list; containment backstop |
| 9 | No fake media records are created | ✅ zero DB writes; upload form refuses; register calls return `BACKEND_GAP` |
| 10 | No database schema is invented | ✅ 0 files changed under `models/`, `alembic/`, `scripts/` |
| 11 | No AWS credentials are required | ✅ provider refuses to construct without them; nothing logged |
| 12 | No Docker / Redis / Celery required | ✅ none added; none touched |
| 13 | Existing product/catalogue functionality continues working | ✅ 155/155 prior backend tests, 143/143 prior frontend tests, build clean |
| 14 | Phase 1–5 tests remain green | ✅ 253 backend (155 pre-existing still green) / 170 frontend, all pass |
| 15 | Future S3 replacement can happen behind the abstraction | ✅ same verbs, same keys, config-only switch |
