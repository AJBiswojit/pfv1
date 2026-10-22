# Media Registry Classification Verification — Batch 0

**Date:** 2026-10-22
**Repository:** `AJBiswojit/pfv1` @ `50ad50b`
**Plan:** `docs/audit/media-management-revised-implementation-plan-2026-10-22.md` §3
**Scope:** read-only classification of existing `media_media_asset` rows
**Status:** **BLOCKED — authenticated environment unavailable in this sandbox**

---

## 1. Outcome

| Item | Result |
|---|---|
| Authenticated read-only API reached | **No** |
| Assets inspected | **0** (none were observable; this does **not** mean the registry is empty) |
| Total registered assets | **UNKNOWN** |
| Product-mapped assets | **UNKNOWN** |
| Product-unassigned assets | **UNKNOWN** |
| Marketing assets (`hero/` + `marketing/`) | **UNKNOWN** |
| Images | **UNKNOWN** |
| Videos | **UNKNOWN** |
| Status distribution | **UNKNOWN** |
| Namespace/scope mismatches | **UNKNOWN — not 0** |
| Large files (≥ 1,572,864 bytes) | **UNKNOWN** |
| Same-byte copy assets / checksum groups | **UNKNOWN** |
| Writes performed | **None** |

> **Critical:** no count in this report is a measurement. `UNKNOWN` must not be read as zero, and the mismatch count is **not** asserted to be zero. Batch 0 has not produced a classification result and must not be treated as approved evidence.

---

## 2. Why Batch 0 could not run here

The task requires the **existing registered media records** from the running application. This sandbox contains the repository only; it has no application database, backend process, media store, or admin session.

### 2.1 Evidence collected (read-only commands, no secrets printed)

| Check | Observed | Meaning |
|---|---|---|
| `DATABASE_URL` environment variable | **not set** | No application DB connection available. |
| `PGHOST` environment variable | **not set** | No PostgreSQL host configured. |
| `backend/.env` | **absent** | No local runtime configuration. |
| `psql` / `pg_isready` / `postgres` binaries | **absent** | No PostgreSQL client or server in the sandbox. |
| Docker / Podman | **absent** | Cannot start an isolated DB/service. |
| Listening TCP ports | `111`, `49983`, `22` only | No API on `:8000`, no Vite on `:5173`. |
| `http://127.0.0.1:8000/health` | connection refused (`000`) | Backend not running. |
| `http://127.0.0.1:5173/` | connection refused (`000`) | Frontend not running. |
| `backend/storage` | 1 file total (`.gitkeep`), no objects | The sandbox has no media objects. This is a sandbox fact, not a statement about the user's storage. |
| Database files in repo | no `.db`/`.sqlite`/dump; only migration/check `.sql` files | No snapshot of the application database exists in the checkout. |
| Registry export in repo | none found | No `GET /media/assets` response or equivalent data file is available. |
| Searches for the reported keys (`hero/primary.avif`, `marketing/02.avif`, `PF-GEN-0002`, …) | only audit documentation and unrelated tests | No source-of-truth record data to classify. |

### 2.2 What is *not* a substitute for the API

- The ten records visible in the review screenshots are **not** present in this checkout.
- `frontend/public/images` files are static assets, not `media_media_asset` rows.
- Test fixtures in `backend/tests` are ephemeral SQLite data, not the application registry.
- Prior audit prose cannot establish `scope`, `mimeType`, `productId`, or `status` for real rows.

Accordingly, no HTTP request was made and no row was invented or inferred.

---

## 3. Unverified identifiers supplied in the review

These nine object keys were named in the review request. They are recorded here **only as claims to be checked**, not as inspected rows. The review also reports a tenth record whose key was not shown, so the inventory is incomplete even as a claim.

| # | `objectKey` (unverified) | `scope` | `mimeType` | `productId` | `status` | Expected class | Match |
|---|---|---|---|---|---|---|---|
| 1 | `marketing/02.avif` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | marketing | UNKNOWN |
| 2 | `marketing/primary-1.avif` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | marketing | UNKNOWN |
| 3 | `marketing/01.avif` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | marketing | UNKNOWN |
| 4 | `marketing/primary.avif` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | marketing | UNKNOWN |
| 5 | `hero/primary.avif` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | marketing | UNKNOWN |
| 6 | `products/PF-GEN-0002/02.avif` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | product | UNKNOWN |
| 7 | `products/PF-GEN-0002/01.avif` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | product | UNKNOWN |
| 8 | `products/PF-GEN-0002/primary.avif` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | product | UNKNOWN |
| 9 | `products/PF-GEN-0001/primary.avif` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | product | UNKNOWN |
| 10 | *(not supplied)* | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

No row in this table is evidence of a match or a mismatch.

---

## 4. Classification rules to apply

These rules come from the approved plan and are not changed here.

| `objectKey` prefix | Expected declared `scope` | Basis |
|---|---|---|
| `hero/…` | `marketing` | `POST /media/register-placement` requires the `hero/` namespace and writes `scope=marketing` (`backend/app/services/media/placement_asset_service.py:66-120`). |
| `marketing/…` | `marketing` | Same placement registration path. |
| `products/…` | `product` | Product registration path writes `scope=product` (`_register_product_asset`, `backend/app/api/v1/media.py:161-233`). |
| `collections/…`, `uploads/…`, any other prefix | **UNDETERMINED** | These namespaces exist for storage, but the plan does not define them as either card class. They must be listed, **not** silently counted as a mismatch or forced into a bucket. |

Match logic:

```
expected = marketing   if key starts with "hero/" or "marketing/"
expected = product     if key starts with "products/"
expected = UNDETERMINED otherwise

match = "YES"          if expected != UNDETERMINED and scope == expected
match = "NO"           if expected != UNDETERMINED and scope != expected
match = "UNDETERMINED" if expected == UNDETERMINED
```

Per approved decision **R4**, the database `scope` remains authoritative for counts. A `NO` row is recorded and reviewed; it is never reclassified, updated, or “fixed” automatically.

Card definitions (for the next report):

- **Product Media** = `scope='product'` **and** `productId` present / `media_product_media` row.
- **Unassigned** = `scope='product'` **and** no product mapping.
- **Marketing Media** = `scope='marketing'` (includes both `hero/` and `marketing/`).
- **Images / Videos** = MIME prefix `image/` / `video/`.
- **Large Files** = object size `>= 1,572,864` bytes.
- **Same-byte copies** = assets whose SHA-256 occurs in a group of ≥2; report **assets involved** and **groups** separately, across all scopes.

---

## 5. Exact safe verification steps

Either path is read-only. Path A is recommended because it uses the same authenticated session and the same endpoint the page uses.

### Path A — browser export (recommended)

1. Sign in to the application as **Super Admin**.
2. Open `/super-admin/media` (or `/admin/media`).
3. Open DevTools → **Console**.
4. Paste the script below. It performs **only** `GET` requests: `GET /api/v1/media/assets` for the registry and `GET /api/v1/media/object-meta/{key}` for size/checksum. It writes nothing to the server and prints no token.
5. It downloads `media-assets-classification.json` containing the raw rows, the classification, and the counts.
6. Attach that JSON (or paste its `summary` and `rows`) for review.

```js
(async () => {
  const TOKEN_KEY = "pf_admin_access_token";
  const LARGE = 1572864;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) throw new Error("No admin session token found. Sign in as Super Admin first.");

  const headers = { Authorization: `Bearer ${token}` };
  const api = "/api/v1";
  const items = [];
  let page = 1;
  let total = 0;

  do {
    const res = await fetch(`${api}/media/assets?page=${page}&pageSize=200`, { headers });
    if (!res.ok) throw new Error(`GET /media/assets -> HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    total = Number(data.total ?? 0);
    items.push(...(data.items ?? []));
    page += 1;
  } while (items.length < total);

  const encodeKey = (key) => String(key).split("/").map(encodeURIComponent).join("/");
  const rows = [];

  for (const item of items) {
    let meta = null;
    let metaError = null;
    try {
      const res = await fetch(`${api}/media/object-meta/${encodeKey(item.objectKey)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      meta = (await res.json()).object ?? null;
    } catch (error) {
      metaError = String(error.message || error);
    }

    const key = String(item.objectKey || "");
    const expected = key.startsWith("hero/") || key.startsWith("marketing/")
      ? "marketing"
      : key.startsWith("products/")
        ? "product"
        : "UNDETERMINED";

    rows.push({
      objectKey: key,
      scope: item.scope ?? null,
      mimeType: item.mimeType ?? null,
      productId: item.productId ?? null,
      status: item.status ?? null,
      expectedScope: expected,
      match: expected === "UNDETERMINED" ? "UNDETERMINED" : (item.scope === expected ? "YES" : "NO"),
      size: meta?.size ?? null,
      checksumSha256: meta?.checksumSha256 ?? null,
      metadataError: metaError,
    });
  }

  const counts = (predicate) => rows.filter(predicate).length;
  const checksumGroups = new Map();
  for (const row of rows) {
    if (!row.checksumSha256) continue;
    checksumGroups.set(row.checksumSha256, (checksumGroups.get(row.checksumSha256) ?? 0) + 1);
  }
  const duplicateGroups = [...checksumGroups.entries()].filter(([, n]) => n >= 2);
  const duplicateKeys = new Set(duplicateGroups.map(([checksum]) => checksum));

  const summary = {
    apiTotal: total,
    itemsReturned: items.length,
    total: rows.length,
    productMapped: counts((r) => r.scope === "product" && Boolean(r.productId)),
    productUnassigned: counts((r) => r.scope === "product" && !r.productId),
    marketing: counts((r) => r.scope === "marketing"),
    images: counts((r) => String(r.mimeType).startsWith("image/")),
    videos: counts((r) => String(r.mimeType).startsWith("video/")),
    statuses: rows.reduce((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {}),
    scopes: rows.reduce((acc, r) => ((acc[r.scope] = (acc[r.scope] ?? 0) + 1), acc), {}),
    namespaceMismatches: rows.filter((r) => r.match === "NO").length,
    undeterminedPrefixes: rows.filter((r) => r.match === "UNDETERMINED").length,
    largeFilesKnown: counts((r) => r.size != null && r.size >= LARGE),
    sizeUnknown: counts((r) => r.size == null),
    duplicateAssetsKnown: counts((r) => r.checksumSha256 && duplicateKeys.has(r.checksumSha256)),
    duplicateGroupsKnown: duplicateGroups.length,
    checksumUnknown: counts((r) => !r.checksumSha256),
    largeThresholdBytes: LARGE,
  };

  const payload = { generatedAt: new Date().toISOString(), summary, rows };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "media-assets-classification.json";
  link.click();
  URL.revokeObjectURL(link.href);

  console.log("Summary:", summary);
  console.table(rows.map(({ objectKey, scope, mimeType, productId, status, expectedScope, match, size }) => ({
    objectKey, scope, mimeType, productId, status, expectedScope, match, size,
  })));
  console.log(`Exported ${rows.length} of ${total} assets. No token was printed.`);
})();
```

**Safety properties:** only `GET`; reads the existing admin token from the same `localStorage` key the application uses; never prints/stores the token; creates a local file download; does not call any upload, register, delete, PATCH, or PUT route.

**Verification-instrument self-test (synthetic, not application data):** the Path A script was syntax-checked with `node --check` and executed in the sandbox against a synthetic five-row fixture to validate its counting logic. The fixture produced `productMapped=1`, `productUnassigned=2`, `marketing=2`, `namespaceMismatches=1`, `largeFilesKnown=1`, `duplicateAssetsKnown=2`, `duplicateGroupsKnown=1`, which matched the expected values. This proves the script’s arithmetic and mismatch detection only. **It is not a Batch 0 result and contains no application records.**

**If the console blocks pasting**, enable “Allow pasting” in DevTools or save the script as a browser snippet. If `total > 200`, the loop handles pagination.

### Path B — read-only SQL (alternative)

Use only with `DATABASE_URL`/`psql` access and only `SELECT` statements. Do not run any `UPDATE`, `INSERT`, `DELETE`, or migration.

```sql
-- 1. Full classification list
WITH mapped AS (
  SELECT DISTINCT media_id FROM pratikshya.media_product_media
)
SELECT
  a.object_key,
  a.scope,
  a.media_type,
  a.mime_type,
  a.file_size,
  a.status,
  (m.media_id IS NOT NULL) AS product_mapped,
  CASE
    WHEN a.object_key LIKE 'hero/%' OR a.object_key LIKE 'marketing/%' THEN 'marketing'
    WHEN a.object_key LIKE 'products/%' THEN 'product'
    ELSE 'UNDETERMINED'
  END AS expected_scope
FROM pratikshya.media_media_asset a
LEFT JOIN mapped m ON m.media_id = a.id
ORDER BY a.object_key;

-- 2. Counts
WITH mapped AS (
  SELECT DISTINCT media_id FROM pratikshya.media_product_media
)
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE a.media_type = 'image') AS images,
  count(*) FILTER (WHERE a.media_type = 'video') AS videos,
  count(*) FILTER (WHERE a.scope = 'marketing') AS marketing,
  count(*) FILTER (WHERE a.scope = 'product' AND m.media_id IS NOT NULL) AS product_mapped,
  count(*) FILTER (WHERE a.scope = 'product' AND m.media_id IS NULL) AS product_unassigned,
  count(*) FILTER (WHERE a.file_size >= 1572864) AS large_files
FROM pratikshya.media_media_asset a
LEFT JOIN mapped m ON m.media_id = a.id;

-- 3. Status distribution
SELECT status, count(*) FROM pratikshya.media_media_asset GROUP BY status ORDER BY status;

-- 4. Namespace/scope mismatches (declared scope is authoritative; do not update)
WITH classified AS (
  SELECT
    object_key,
    scope,
    CASE
      WHEN object_key LIKE 'hero/%' OR object_key LIKE 'marketing/%' THEN 'marketing'
      WHEN object_key LIKE 'products/%' THEN 'product'
      ELSE 'UNDETERMINED'
    END AS expected_scope
  FROM pratikshya.media_media_asset
)
SELECT * FROM classified
WHERE expected_scope <> 'UNDETERMINED'
  AND scope IS DISTINCT FROM expected_scope
ORDER BY object_key;

-- 5. Same-byte copies
SELECT checksum_sha256, count(*) AS assets
FROM pratikshya.media_media_asset
GROUP BY checksum_sha256
HAVING count(*) > 1
ORDER BY assets DESC, checksum_sha256;
```

### Path C — API only, no metadata

If object metadata is unavailable, run only page 1 of the browser script’s list request:

```
GET /api/v1/media/assets?page=1&pageSize=200
Authorization: Bearer <admin session token>
```

Then report `size` and `checksumSha256` as **UNKNOWN**; do not report large/duplicate counts as zero. The classification of `objectKey`/`scope`/`mimeType`/`productId`/`status` does not require metadata.

---

## 6. What the completed report must contain

When the export or SQL output is available, this document will be updated with:

1. **Run metadata:** timestamp, environment (without hostnames/credentials), endpoint(s), page count, whether metadata was available.
2. **Complete row table** for every asset:
   `objectKey | scope | mimeType | productId | status | expectedScope | match | size | checksumGroup`.
3. **Summary:**
   - total assets returned vs `total`;
   - product-mapped, product-unassigned, marketing;
   - images, videos;
   - status distribution;
   - namespace mismatches (`YES`/`NO`/`UNDETERMINED` counts);
   - large files, with `sizeUnknown` separately;
   - same-byte assets and checksum groups, with `checksumUnknown` separately.
4. **Mismatch list:** every `NO` row, with the declared scope and expected scope. No correction is applied.
5. **Undetermined prefixes:** every non-`hero/`, non-`marketing/`, non-`products/` key, listed separately.
6. **Evidence footer:** the exact API/SQL commands used, confirmation that no writes occurred.

### Pass conditions for Batch 0

- The total from the API/SQL equals the number of rows in the report.
- Every row has all seven required fields (or an explicit `UNKNOWN` for unavailable metadata).
- Mismatch count is a measured number, not `UNKNOWN`.
- No upload, register, delete, update, reclassification, migration, or config change occurred.

Current status against these conditions: **not met — blocked before the first request.**

---

## 7. Gate

- **Batch 0:** BLOCKED, awaiting an authenticated export or a read-only SQL result.
- **Batch 1:** not started and not approved.
- **Source code / configuration / database / runtime:** unchanged.

Once the export or SQL output is provided, the classification table and counts will be filled in and the mismatch count reported. If any `NO` row appears, the audit will stop there for review under decision **R4**; no record will be changed.
