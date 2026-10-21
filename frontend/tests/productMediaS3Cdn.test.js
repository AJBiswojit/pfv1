/**
 * PRATIKSHYA FASHION — S3 + CDN production readiness (frontend half).
 *
 * The backend is the single source of truth for what a product image
 * reference resolves to. The frontend's only job is to recognise the shapes
 * the backend emits and to resolve them against the configured media origin —
 * it must never derive a storage path from a slug, an id or a folder
 * convention.
 *
 * This suite pins the two deployment shapes:
 *
 *   1. no media origin (default) → the API media route
 *        /api/v1/media/objects/products/PF-…/primary.avif
 *
 *   2. VITE_MEDIA_ORIGIN set    → the CDN fronts the bucket at its ROOT
 *        https://cdn.pratikshyafashion.com/products/PF-…/primary.avif
 *
 * Shape 2 is the CloudFront + S3 Origin Access Control design and matches the
 * backend's `build_media_url()` ({MEDIA_CDN_BASE_URL}/{key}) exactly. The
 * previous implementation produced {origin}{MEDIA_URL_PREFIX}/{key}, which is
 * only correct when the CDN proxies the API route instead of the bucket.
 *
 * Mock assets are never touched: nothing here reads, writes or deletes a file.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MEDIA_URL_PREFIX,
  isRemoteOrInlineUrl,
  mediaObjectUrl,
  mediaOrigin,
  mediaReferenceKind,
  resolveMediaUrl,
} from "../src/services/media/mediaPaths.js";

const src = (relative) => readFileSync(join(process.cwd(), relative), "utf8");
const repoSrc = (relative) => readFileSync(join(process.cwd(), "..", relative), "utf8");

const CDN_ORIGIN = "https://cdn.pratikshyafashion.com";
const KEY = "products/PF-W-SAR-SIL-0001/primary.avif";

// ---------------------------------------------------------------------------
// 1. Same-origin deployment (the default, and what development uses)
// ---------------------------------------------------------------------------

test("with no media origin configured, an object key resolves to the API media route", () => {
  assert.equal(mediaOrigin(), "");
  assert.equal(mediaObjectUrl(KEY), `${MEDIA_URL_PREFIX}/${KEY}`);
  assert.equal(mediaObjectUrl(`/${KEY}`), `${MEDIA_URL_PREFIX}/${KEY}`);
  assert.equal(mediaObjectUrl(""), "");
  assert.equal(mediaObjectUrl(null), "");
});

test("a canonical backend media URL is passed straight through when same-origin", () => {
  const url = `${MEDIA_URL_PREFIX}/${KEY}`;
  assert.equal(resolveMediaUrl(url), url);
  assert.equal(mediaReferenceKind(url), "media");
});

// ---------------------------------------------------------------------------
// 2. CDN deployment — the path the S3/CloudFront rollout takes
// ---------------------------------------------------------------------------

test("with a media origin configured, an object key resolves to {origin}/{key}", () => {
  // Asserted against the module source rather than a live call: the Node test
  // harness has no `import.meta.env`, so `mediaOrigin()` is always "" here
  // (the suite above pins that default behaviour). A CDN deployment is a
  // Vite build-time variable, so this is the branch the rollout exercises.
  const source = src("src/services/media/mediaPaths.js");
  assert.match(
    source,
    /if \(origin\) return `\$\{origin\}\/\$\{key\}`;/,
    "the CDN branch must front the bucket at its root, not the API route",
  );
  assert.doesNotMatch(
    source,
    /return `\$\{mediaOrigin\(\)\}\$\{MEDIA_URL_PREFIX\}/,
    "the old {origin}{prefix}/{key} shape is wrong for a bucket-fronting CDN",
  );
});

test("an absolute CDN URL from the backend is never rewritten", () => {
  const url = `${CDN_ORIGIN}/${KEY}`;
  assert.equal(isRemoteOrInlineUrl(url), true);
  assert.equal(resolveMediaUrl(url), url);
  assert.equal(mediaReferenceKind(url), "remote");
});

test("a legacy /images/ reference still passes through untouched", () => {
  // Dual-read compatibility: the mock library is served by Vite until a
  // product's art is genuinely uploaded through the pipeline.
  assert.equal(resolveMediaUrl("/images/products/PF-A/primary.avif"), "/images/products/PF-A/primary.avif");
  assert.equal(mediaReferenceKind("/images/products/PF-A/primary.avif"), "legacy-public");
});

test("an absent reference resolves to the empty plate, never a placeholder", () => {
  assert.equal(resolveMediaUrl(""), "");
  assert.equal(mediaReferenceKind(""), "empty");
  assert.equal(resolveMediaUrl(undefined), "");
});

// ---------------------------------------------------------------------------
// 3. Configuration documentation
// ---------------------------------------------------------------------------

test("the frontend env template documents the CDN shape", () => {
  const example = src(".env.example");
  assert.match(example, /VITE_MEDIA_ORIGIN=/);
  assert.match(
    example,
    /CloudFront/i,
    "the template must explain the CDN deployment shape",
  );
  assert.match(example, /\{origin\}\/\{key\}/);
});

test("the backend env template declares MEDIA_CDN_BASE_URL and not the dead CDN_BASE_URL", () => {
  const example = repoSrc("backend/.env.example");
  assert.match(example, /MEDIA_CDN_BASE_URL=/);
  // `CDN_BASE_URL` was declared but read by no code path — it is gone.
  assert.doesNotMatch(example, /^CDN_BASE_URL=/m);
});

test("the backend never stores a CDN URL string in a product column", () => {
  // Delivery URLs are derived from object keys at read time, so switching CDN
  // is a configuration change with zero data migration.
  const records = repoSrc("backend/app/services/media/product_media_records.py");
  assert.match(records, /build_media_url/);
  assert.doesNotMatch(records, /cdn_url|cdnUrl|picture1|picture2|picture3/);
});

test("the implementation plan documents the rollout and the mock-asset rule", () => {
  const plan = repoSrc("docs/PRODUCT_MEDIA_S3_CDN_IMPLEMENTATION_PLAN.md");
  assert.match(plan, /MEDIA_CDN_BASE_URL/);
  assert.match(plan, /Rollback and recovery/i);
  assert.match(plan, /mock/i);
});
