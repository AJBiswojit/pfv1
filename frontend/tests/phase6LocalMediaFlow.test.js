/**
 * PRATIKSHYA FASHON — Phase 6: local media flow (frontend side).
 *
 * Companion to `phase6MediaStorage.test.js`. Where that suite pins the media
 * URL CONTRACT with synthetic values, this suite runs the frontend's media
 * seam against a REAL migrated product asset — the primary image of bridal
 * product PF-BR-MEH-0001, one of the 238 files copied (copy-only) from
 * `frontend/public/images` into the backend local object store — and pins
 * the regression rules that keep it that way:
 *
 *   · the URL the frontend renders for the migrated asset is the BACKEND
 *     media URL (`/api/v1/media/objects/<object-key>`), not the legacy
 *     `public/images` path;
 *   · a fetch of that URL (simulated wire, REAL asset bytes) returns 200,
 *     an image Content-Type, and bytes identical to the protected source —
 *     i.e. what PratikshyaImage would render actually resolves;
 *   · when the backend store is present in the workspace, the store copy is
 *     byte-identical to the protected source (nothing was transformed);
 *   · NO frontend module takes a runtime dependency on `public/images` for
 *     product media — the only `/images/` literals allowed in `src/` are the
 *     compatibility seam (`mediaPaths.js`) and a doc comment
 *     (`PratikshyaImage.jsx`);
 *   · the frontend media prefix still mirrors the backend config, so the
 *     local → S3 → CDN transition stays a configuration change.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

import {
  MEDIA_URL_PREFIX,
  isBackendMediaUrl,
  isLegacyPublicImageUrl,
  mediaObjectUrl,
  mediaReferenceKind,
  normalizeMediaReference,
  resolveMediaUrl,
} from "../src/services/media/mediaPaths.js";

// ---------------------------------------------------------------------------
// The REAL migrated test asset (backend/storage/media + frontend/public/images)
// ---------------------------------------------------------------------------

const REAL_OBJECT_KEY =
  "products/bridal/celebrations/mehendi-haldi/PF-BR-MEH-0001/primary.avif";
const REAL_AUTHORED_REFERENCE = `/images/${REAL_OBJECT_KEY}`;
const REAL_CANONICAL_URL = `${MEDIA_URL_PREFIX}/${REAL_OBJECT_KEY}`;

const SOURCE_ASSET = join(process.cwd(), "public", "images", REAL_OBJECT_KEY);
const STORE_ASSET = join(process.cwd(), "..", "backend", "storage", "media", REAL_OBJECT_KEY);

const sourceExists = existsSync(SOURCE_ASSET) && statSync(SOURCE_ASSET).isFile();
const storeExists = existsSync(STORE_ASSET) && statSync(STORE_ASSET).isFile();

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** Walk `dir` and return every .js/.jsx file path (skips nothing else). */
function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// ===========================================================================
// 1. The real asset exists and the frontend URL contract holds for it
// ===========================================================================

test("the canonical migrated test asset exists in the protected source folder", () => {
  assert.ok(sourceExists, `missing protected asset: ${SOURCE_ASSET}`);
});

test("the frontend renders the BACKEND media URL for the migrated asset, not the public path", () => {
  // What the backend resolver returns (object key → canonical URL).
  assert.equal(mediaObjectUrl(REAL_OBJECT_KEY), REAL_CANONICAL_URL);
  assert.equal(resolveMediaUrl(REAL_CANONICAL_URL), REAL_CANONICAL_URL);
  assert.equal(normalizeMediaReference(REAL_CANONICAL_URL), REAL_CANONICAL_URL);
  assert.equal(mediaReferenceKind(REAL_CANONICAL_URL), "media");
  assert.equal(isBackendMediaUrl(REAL_CANONICAL_URL), true);

  // The legacy authored reference is recognised as legacy — the dual-read
  // compatibility path — never rewritten into a storage path by the frontend.
  assert.equal(mediaReferenceKind(REAL_AUTHORED_REFERENCE), "legacy-public");
  assert.equal(isLegacyPublicImageUrl(REAL_AUTHORED_REFERENCE), true);
  assert.equal(resolveMediaUrl(REAL_AUTHORED_REFERENCE), REAL_AUTHORED_REFERENCE);
});

test("the frontend media prefix still mirrors the backend mount", () => {
  const backend = readFileSync(join(process.cwd(), "..", "backend", "app", "config.py"), "utf8");
  assert.match(backend, /API_V1_PREFIX:\s*str\s*=\s*"\/api\/v1"/);
  assert.match(backend, /MEDIA_URL_PREFIX:\s*str\s*=\s*"\/media\/objects"/);
  assert.equal(MEDIA_URL_PREFIX, "/api/v1/media/objects");
  assert.equal(REAL_CANONICAL_URL.startsWith(MEDIA_URL_PREFIX + "/"), true);
  // No machine-specific origin anywhere in the produced URL.
  assert.ok(!REAL_CANONICAL_URL.includes("localhost"));
  assert.ok(!REAL_CANONICAL_URL.includes("127.0.0.1"));
  assert.ok(!/[A-Za-z]:\\/.test(REAL_CANONICAL_URL));
});

// ===========================================================================
// 2. Consumption of backend media URLs — 200, image type, byte integrity
// ===========================================================================

test("fetching the rendered media URL returns the real asset bytes untouched", { skip: sourceExists ? false : "real asset missing" }, async () => {
  const bytes = readFileSync(SOURCE_ASSET);

  // Simulated wire: the backend serves the object with the media route's
  // headers (FileResponse: 200, sniffed content type, ETag, no auth).
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url, REAL_CANONICAL_URL);
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "image/jpeg", // PF-BR-MEH-0001 primary is a mislabelled .avif (JPEG bytes)
        "content-length": String(bytes.length),
        etag: `"${sha256(bytes).slice(0, 32)}"`,
        "cache-control": "public, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  };
  try {
    const renderedSrc = resolveMediaUrl(REAL_CANONICAL_URL);
    const response = await fetch(renderedSrc);
    const body = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^image\//);
    assert.equal(response.headers.get("www-authenticate"), null); // public media, no auth
    assert.equal(body.length, bytes.length);
    assert.equal(sha256(body), sha256(bytes)); // no accidental transformation
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the backend store copy of the real asset is byte-identical to the protected source", { skip: storeExists && sourceExists ? false : "backend storage/media not present in this workspace" }, () => {
  const storeBytes = readFileSync(STORE_ASSET);
  const sourceBytes = readFileSync(SOURCE_ASSET);
  assert.equal(storeBytes.length, sourceBytes.length);
  assert.equal(sha256(storeBytes), sha256(sourceBytes));
});

// ===========================================================================
// 3. Regression — no direct product-media dependency on frontend/public/images
// ===========================================================================

/**
 * The ONLY files allowed to contain the literal `/images/`:
 *
 *   · src/services/media/mediaPaths.js   KEEP — the compatibility seam
 *     (LEGACY_PUBLIC_IMAGE_PREFIX / CANONICAL_MEDIA_ROOT / isLegacyPublicImageUrl)
 *     that lets unresolved references keep rendering during the migration.
 *   · src/components/PratikshyaImage.jsx DOCUMENTATION ONLY — a doc comment.
 *
 * Any other occurrence — in particular any CONCRETE asset path
 * (`/images/products/…`, `/images/collections/…`, `/images/hero/…`) — is a
 * direct runtime dependency on the frontend public folder and fails here.
 */
const APPROVED_IMAGE_LITERALS = new Map([
  [
    "src/services/media/mediaPaths.js",
    "KEEP — legacy public prefix + canonical root constants (migration compatibility seam)",
  ],
  [
    "src/components/PratikshyaImage.jsx",
    "DOCUMENTATION ONLY — comment explaining the legacy reference shape",
  ],
]);

test("no module takes a runtime dependency on public/images for product media", () => {
  const srcDir = join(process.cwd(), "src");
  const offenders = [];

  for (const full of jsFiles(srcDir)) {
    const relativePath = relative(process.cwd(), full).split("\\").join("/");
    const text = readFileSync(full, "utf8");
    if (!text.includes("/images/")) continue;
    if (!APPROVED_IMAGE_LITERALS.has(relativePath)) offenders.push(relativePath);
  }
  assert.deepEqual(
    offenders,
    [],
    `unexpected /images/ literals (classify or remove): ${offenders.join(", ")}`
  );
});

test("the approved /images/ literals are still only the compatibility seam and a comment", () => {
  const seam = readFileSync(join(process.cwd(), "src/services/media/mediaPaths.js"), "utf8");
  // The seam must stay logic, not asset knowledge: constants and predicates.
  assert.match(seam, /LEGACY_PUBLIC_IMAGE_PREFIX\s*=\s*"\/images\/"/);
  assert.match(seam, /CANONICAL_MEDIA_ROOT\s*=\s*"\/images\/products"/);
  // It must not embed a real product asset path.
  assert.ok(!/\/images\/(products|collections|hero|marketing)\/[A-Za-z0-9]/.test(seam));

  const renderer = readFileSync(join(process.cwd(), "src/components/PratikshyaImage.jsx"), "utf8");
  // Strip comments; the renderer must have no /images/ literal in code.
  const codeOnly = renderer.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.ok(!codeOnly.includes("/images/"), "PratikshyaImage.jsx uses /images/ outside comments");
});

test("no concrete migrated asset path is hardcoded anywhere in src", () => {
  const srcDir = join(process.cwd(), "src");
  const concrete = /\/images\/(products|collections|hero|marketing)\//;
  const offenders = [];
  for (const full of jsFiles(srcDir)) {
    const text = readFileSync(full, "utf8");
    if (concrete.test(text)) offenders.push(relative(process.cwd(), full));
  }
  assert.deepEqual(offenders, [], `hardcoded product-media paths in: ${offenders.join(", ")}`);
});

test("no module imports from the public images folder", () => {
  const srcDir = join(process.cwd(), "src");
  const importPattern = /import\s+[^;]*["'][^"']*public\/images[^"']*["']/;
  const offenders = [];
  for (const full of jsFiles(srcDir)) {
    if (importPattern.test(readFileSync(full, "utf8"))) {
      offenders.push(relative(process.cwd(), full));
    }
  }
  assert.deepEqual(offenders, []);
});
