/**
 * PRATIKSHYA FASHION — upload planning & reconciliation rules.
 *
 * Pure functions only: no fetch, no React. These are the decisions that were
 * previously either implicit in the component or wrong:
 *
 *   · where a new file lands in the display order (`nextSortOrder`);
 *   · who becomes the cover, and the fact that an employee never may;
 *   · when the surface REFUSES the first registration (a product whose imagery
 *     lives only in the legacy columns, with no registered media set);
 *   · how a file whose request never answered is matched to the association it
 *     actually created — and that an ambiguous match is left unmatched.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MEDIA_FAILURE_KINDS,
  PRODUCT_MEDIA_STAGES,
  classifyMediaFailure,
  decidePrimary,
  hasExistingCover,
  isAmbiguousMediaFailure,
  legacyCatalogueOnly,
  matchReconciledItems,
  nextSortOrder,
  uploadProgressPercent,
} from "../src/services/media/productMediaService.js";

const item = (overrides = {}) => ({
  assignmentId: "asgmt-1",
  mediaId: "media-1",
  objectKey: "products/PF-1/plate.png",
  fileSize: 100,
  mimeType: "image/png",
  role: "GALLERY",
  sortOrder: 0,
  isPrimary: false,
  ...overrides,
});

// ===========================================================================
// Ordering
// ===========================================================================

test("nextSortOrder appends after the highest existing position", () => {
  assert.equal(nextSortOrder([]), 0);
  assert.equal(nextSortOrder(undefined), 0);
  assert.equal(nextSortOrder([item({ sortOrder: 0 }), item({ sortOrder: 3 })]), 4);
  assert.equal(
    nextSortOrder([item({ sortOrder: 5 }), item({ sortOrder: "2" })]),
    6,
    "string positions from the DTO are read as numbers",
  );
  assert.equal(
    nextSortOrder([item({ sortOrder: null })]),
    0,
    "an unknown position does not poison the maximum",
  );
});

test("progress never reports 100% before the batch is actually done", () => {
  assert.equal(uploadProgressPercent(0, PRODUCT_MEDIA_STAGES.UPLOADING, 4), 3);
  assert.equal(uploadProgressPercent(0, PRODUCT_MEDIA_STAGES.UPLOADED, 4), 13);
  assert.equal(uploadProgressPercent(0, PRODUCT_MEDIA_STAGES.ASSIGNED, 4), 25);
  assert.equal(uploadProgressPercent(3, PRODUCT_MEDIA_STAGES.UPLOADED, 4), 88);
  assert.equal(
    uploadProgressPercent(3, PRODUCT_MEDIA_STAGES.ASSIGNED, 4) <= 99,
    true,
    "the bar is capped until the batch state itself is final",
  );
  assert.equal(uploadProgressPercent(0, PRODUCT_MEDIA_STAGES.UPLOADING, 0), 10);
});

// ===========================================================================
// Cover / primary
// ===========================================================================

test("hasExistingCover reads both the registered set and the legacy column", () => {
  assert.equal(hasExistingCover([], null), false);
  assert.equal(hasExistingCover([item({ isPrimary: true })], null), true);
  assert.equal(hasExistingCover([], { image: "/images/products/x.avif" }), true);
  assert.equal(hasExistingCover([item({ isPrimary: false })], { image: null }), false);
});

test("decidePrimary: automatic cover only when there is none, and only for the first file", () => {
  assert.equal(decidePrimary({ index: 0, fallbackIndex: 0, items: [], product: null }), true);
  assert.equal(decidePrimary({ index: 1, fallbackIndex: 0, items: [], product: null }), false);
  assert.equal(
    decidePrimary({ index: 0, fallbackIndex: 0, items: [item({ isPrimary: true })], product: null }),
    false,
    "an existing registered cover is never silently replaced",
  );
  assert.equal(
    decidePrimary({ index: 0, fallbackIndex: 0, items: [], product: { image: "/legacy.avif" } }),
    false,
    "a legacy cover counts as a cover",
  );
});

test("decidePrimary: an employee request is never primary, even explicitly", () => {
  assert.equal(decidePrimary({ isEmployee: true, requestCover: true, index: 0 }), false);
  assert.equal(decidePrimary({ isEmployee: true, index: 0, items: [], product: null }), false);
});

test("decidePrimary: an explicit operator choice wins for admins", () => {
  assert.equal(
    decidePrimary({ requestCover: true, index: 1, fallbackIndex: 0, items: [item()], product: { image: "x" } }),
    true,
  );
  assert.equal(decidePrimary({ requestCover: false, index: 0 }), false);
});

// ===========================================================================
// The first-registration block (D4)
// ===========================================================================

test("a legacy-only product with no registered set is refused", () => {
  assert.equal(legacyCatalogueOnly({ image: "/images/products/a.avif" }, []), true);
  assert.equal(legacyCatalogueOnly({ image: null, additionalImages: ["/b.avif"] }, []), true);
});

test("a product with registered media, or with no imagery at all, is allowed", () => {
  assert.equal(legacyCatalogueOnly({ image: "/legacy.avif" }, [item()]), false);
  assert.equal(legacyCatalogueOnly({ image: null, additionalImages: [] }, []), false);
  assert.equal(legacyCatalogueOnly({}, []), false);
});

test("an unreadable product record is not treated as safe", () => {
  assert.equal(
    legacyCatalogueOnly(null, []),
    true,
    "an unknown product must not be written to blind",
  );
  assert.equal(
    legacyCatalogueOnly(null, [item()]),
    false,
    "but a registered set proves a registration already exists",
  );
});

// ===========================================================================
// Reconciliation of unconfirmed writes
// ===========================================================================

const before = [item({ mediaId: "media-1", objectKey: "products/PF-1/old.png", sortOrder: 0, isPrimary: true })];

test("a confirmed upload matches its association by exact object key", () => {
  const after = [
    ...before,
    item({ mediaId: "media-2", assignmentId: "asgmt-2", objectKey: "products/PF-1/new.webp", fileSize: 200, mimeType: "image/webp", sortOrder: 1 }),
  ];
  const [match] = matchReconciledItems({
    before,
    after,
    results: [
      { ok: true, objectKey: "products/PF-1/new.webp", fileName: "new.webp", fileSize: 200, mimeType: "image/webp" },
    ],
  });
  assert.equal(match.matched, true);
  assert.equal(match.mediaId, "media-2");
  assert.equal(match.sortOrder, 1);
});

test("an unconfirmed upload is matched by size + mime + filename stem", () => {
  const after = [
    ...before,
    item({ mediaId: "media-9", assignmentId: "asgmt-9", objectKey: "products/PF-1/team-photo.png", fileSize: 555, mimeType: "image/png", sortOrder: 4 }),
  ];
  const [match] = matchReconciledItems({
    before,
    after,
    results: [
      {
        ok: false,
        uncertain: true,
        objectKey: null,
        fileName: "team_photo.png",
        fileSize: 555,
        mimeType: "image/png",
      },
    ],
  });
  assert.equal(match.matched, true);
  assert.equal(match.mediaId, "media-9");
});

test("an ambiguous unconfirmed upload is left unmatched rather than guessed", () => {
  const after = [
    ...before,
    item({ mediaId: "media-a", objectKey: "products/PF-1/x.png", fileSize: 10, mimeType: "image/png" }),
    item({ mediaId: "media-b", objectKey: "products/PF-1/y.png", fileSize: 10, mimeType: "image/png" }),
  ];
  const [match] = matchReconciledItems({
    before,
    after,
    results: [{ ok: false, uncertain: true, fileName: "z.png", fileSize: 10, mimeType: "image/png" }],
  });
  assert.equal(match.matched, false, "two candidates means no honest answer");
});

test("a confirmed upload whose association is not there is not matched to someone else's row", () => {
  const after = [...before];
  const [match] = matchReconciledItems({
    before,
    after,
    results: [{ ok: true, objectKey: "products/PF-1/missing.webp", fileName: "missing.webp" }],
  });
  assert.equal(match.matched, false);
});

test("associations that already existed before the batch are never claimed twice", () => {
  const after = [...before];
  const matches = matchReconciledItems({
    before,
    after,
    results: [
      { ok: true, objectKey: "products/PF-1/old.png", fileName: "old.png" },
      { ok: true, objectKey: "products/PF-1/old.png", fileName: "old.png" },
    ],
  });
  assert.equal(matches[0].matched, true);
  assert.equal(matches[1].matched, false, "one association cannot answer for two uploads");
});

// ===========================================================================
// Failure classification
// ===========================================================================

test("failure kinds are distinguishable and ambiguity is explicit", () => {
  assert.equal(classifyMediaFailure({ status: 0, code: "TIMEOUT" }), MEDIA_FAILURE_KINDS.TIMEOUT);
  assert.equal(classifyMediaFailure({ status: 0, code: "CANCELLED" }), MEDIA_FAILURE_KINDS.CANCELLED);
  assert.equal(classifyMediaFailure({ status: 0, isNetworkError: true }), MEDIA_FAILURE_KINDS.NETWORK);
  assert.equal(classifyMediaFailure({ status: 409 }), MEDIA_FAILURE_KINDS.COLLISION);
  assert.equal(classifyMediaFailure({ status: 403 }), MEDIA_FAILURE_KINDS.AUTH);
  assert.equal(classifyMediaFailure({ status: 415 }), MEDIA_FAILURE_KINDS.REJECTED);
  assert.equal(classifyMediaFailure({ status: 503 }), MEDIA_FAILURE_KINDS.SERVER);

  assert.equal(isAmbiguousMediaFailure({ code: "TIMEOUT" }), true);
  assert.equal(isAmbiguousMediaFailure({ status: 0, isNetworkError: true }), true);
  assert.equal(isAmbiguousMediaFailure({ code: "CANCELLED" }), true);
  assert.equal(isAmbiguousMediaFailure({ status: 422 }), false, "a rejection is a definite answer");
});
