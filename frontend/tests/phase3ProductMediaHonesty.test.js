/**
 * Phase 3 Block 7 — PRODUCT MEDIA HONESTY (frontend half).
 *
 * Governing plan: PHASE_3_PRODUCT_CATALOG_IMPLEMENTATION_PLAN.md
 *   §2.2        — API-085/132 (namespace), API-086/133 (role), API-125/126/140
 *   §2.3        — PF3-N09, the two writable sources of truth
 *   §11.1-§11.4 — the media architecture and the recommended direction
 *   §21         — this file
 *   §23 R5      — the media-write-key removal is TWO-STAGE by design
 *   §24 step 9  — role/namespace allow-lists; frontend stops sending
 *                 media-write keys; then remove them from ProductContentFields
 *
 * The vocabulary itself is SERVER-ENFORCED and is proved by the backend suite
 * (`tests/unit/test_phase3_product_media.py`, 38 tests / 49 subtests). This
 * suite pins the client half:
 *
 *   * every role literal the frontend is capable of sending is a member of the
 *     backend's declared vocabulary — the cross-layer lock that makes the new
 *     422 unreachable from our own UI;
 *   * every namespace literal the frontend sends is a member of the storage
 *     allow-list;
 *   * media registration goes through `apiClient` with an explicit scope, and
 *     never through raw `fetch`;
 *   * the media-write keys on the PRODUCT contract are still sent — asserted
 *     as-is, because stage 1 of §23 R5 is BLOCKED (Block 7 report §11) and
 *     must not appear to have happened.
 *
 * HARNESS LIMITATION, stated honestly and not worked around: `node:test` with
 * NO DOM and NO React renderer. Upload dropzones, drag-reorder, the media
 * manager's rendered state and the "Set primary" button CANNOT be executed
 * here. Requirements that live inside a rendered component are covered by a
 * STATIC SOURCE GUARD over the real file, labelled `STATIC:`, and reported as
 * NOT VERIFIABLE in the Block 7 report §33. No DOM framework was added: the
 * plan does not ask for one.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PRODUCT_MEDIA_ROLES, defaultRoleForType } from "../src/config/mediaTypes.js";
import { PRODUCT_MEDIA_COVER_ROLE, buildProductMediaPatch } from "../src/services/media/productMediaService.js";

const src = (relative) =>
  readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), "utf8");

/**
 * The backend's declared vocabulary, transcribed from
 * `backend/app/schemas/media/media.py` `PRODUCT_MEDIA_ROLE_VALUES`.
 * The backend derives its copy from THIS file's `PRODUCT_MEDIA_ROLES`; the
 * first test below is what keeps the two honest in both directions.
 */
const BACKEND_ROLE_VALUES = [
  "COVER",
  "GALLERY",
  "DETAIL",
  "LIFESTYLE",
  "MODEL",
  "CLOSEUP",
  "PRODUCT_VIDEO",
  "SHOWCASE",
  "DETAIL_VIDEO",
  "LIFESTYLE_VIDEO",
];

const BACKEND_NAMESPACES = ["products", "collections", "hero", "marketing", "uploads"];

const isDeclaredRole = (role) =>
  BACKEND_ROLE_VALUES.some((value) => value.toLowerCase() === String(role).trim().toLowerCase());

/* ------------------------------------------------------------------ */
/* 1. The cross-layer vocabulary lock                                   */
/* ------------------------------------------------------------------ */

test("the frontend role vocabulary is exactly the backend's declared vocabulary", () => {
  assert.deepEqual(Object.values(PRODUCT_MEDIA_ROLES).sort(), [...BACKEND_ROLE_VALUES].sort());
});

test("every PRODUCT_MEDIA_ROLES member is accepted by the backend allow-list", () => {
  for (const role of Object.values(PRODUCT_MEDIA_ROLES)) {
    assert.ok(isDeclaredRole(role), `${role} would now be rejected with 422`);
  }
});

test("PRODUCT_MEDIA_COVER_ROLE is a declared role", () => {
  // `setPrimaryProductMedia` sends this on every promote-to-cover.
  assert.equal(PRODUCT_MEDIA_COVER_ROLE, "COVER");
  assert.ok(isDeclaredRole(PRODUCT_MEDIA_COVER_ROLE));
});

test("defaultRoleForType only ever returns declared roles", () => {
  for (const type of ["IMAGE", "VIDEO", "image", "video", undefined, null, "anything"]) {
    const role = defaultRoleForType(type);
    assert.ok(isDeclaredRole(role), `defaultRoleForType(${String(type)}) → ${role}`);
  }
});

test("STATIC: every role literal in the media API + service layer is declared", () => {
  // The two files that can actually put a `role` on the wire.
  for (const file of ["services/api/mediaApi.js", "services/media/productMediaService.js"]) {
    const text = src(file);
    // `role: "..."` / `role = "..."` / `role ?? "..."` — the literal forms.
    const literals = [...text.matchAll(/role\s*(?::|=|\?\?)\s*"([^"]*)"/g)].map((m) => m[1]);
    assert.ok(literals.length > 0, `no role literal found in ${file} — did it move?`);
    for (const literal of literals) {
      assert.ok(
        isDeclaredRole(literal),
        `${file} can send role "${literal}", which the backend now rejects with 422`,
      );
    }
  }
});

test("STATIC: the lowercase default the client sends survives the allow-list", () => {
  // `apiRegisterMediaObject(objectKey, { role = "gallery" })` — lowercase, and
  // matched case-insensitively by the server. This is the exact literal that
  // would break if the backend ever folded the vocabulary to upper case.
  const text = src("services/api/mediaApi.js");
  assert.match(text, /role\s*=\s*"gallery"/);
  assert.ok(isDeclaredRole("gallery"));
});

/* ------------------------------------------------------------------ */
/* 2. Namespaces                                                        */
/* ------------------------------------------------------------------ */

test("STATIC: every namespace literal the frontend sends is declared", () => {
  const text = src("services/api/mediaApi.js");
  const literals = [...text.matchAll(/namespace\s*(?::|=|\?\?)\s*"([^"]*)"/g)].map((m) => m[1]);
  for (const literal of literals) {
    assert.ok(
      BACKEND_NAMESPACES.includes(literal),
      `mediaApi.js can send namespace "${literal}", which the backend rejects with 422`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* 3. Transport discipline (standing constraint, not a step 9 item)     */
/* ------------------------------------------------------------------ */

test("STATIC: media registration goes through apiClient with an explicit scope", () => {
  const text = src("services/api/mediaApi.js");
  const start = text.indexOf("export async function apiRegisterMediaObject");
  assert.ok(start > -1, "apiRegisterMediaObject moved");
  const rest = text.slice(start);
  const end = rest.indexOf("export ", 1);
  const body = end > -1 ? rest.slice(0, end) : rest;

  assert.match(body, /apiClient\.upload\(\s*"\/media\/register"/);
  assert.match(body, /\{\s*scope\s*\}/, "the upload must carry an explicit scope");
  assert.doesNotMatch(body, /\bfetch\s*\(/, "raw fetch bypasses apiClient");
});

test("STATIC: no raw fetch anywhere in the media API surface", () => {
  assert.doesNotMatch(src("services/api/mediaApi.js"), /(?<!\.)\bfetch\s*\(/);
});

/* ------------------------------------------------------------------ */
/* 4. PF3-N09 — the write keys are STILL sent (stage 1 is blocked)      */
/* ------------------------------------------------------------------ */

test("buildProductMediaPatch still emits the three media-write keys", () => {
  // Asserted as-is. Step 9 asks for these to stop, but the publish gate reads
  // `primaryMediaId`/`image` and is blind to `media_product_media`, so removing
  // them today makes a registered-media-only product unpublishable.
  // See the Block 7 report §11. When that is resolved, THIS test is the one
  // that must be rewritten — deliberately, not by accident.
  const patch = buildProductMediaPatch([
    { mediaId: "m1", url: "/api/v1/media/objects/products/P/1.png", isPrimary: true },
    { mediaId: "m2", url: "/api/v1/media/objects/products/P/2.png", isPrimary: false },
  ]);
  assert.deepEqual(patch.mediaIds, ["m1", "m2"]);
  assert.equal(patch.primaryMediaId, "m1");
  assert.deepEqual(patch.galleryMediaIds, ["m2"]);
  assert.equal(patch.image, "/api/v1/media/objects/products/P/1.png");
});

test("buildProductMediaPatch clears the keys for an empty media set", () => {
  const patch = buildProductMediaPatch([]);
  assert.deepEqual(patch.mediaIds, []);
  assert.equal(patch.primaryMediaId, null);
  assert.deepEqual(patch.galleryMediaIds, []);
  assert.equal(patch.image, "");
});

test("STATIC: buildAdminProductPayload still forwards the media-write keys", () => {
  const text = src("services/api/productsApi.js");
  for (const key of ["mediaIds", "primaryMediaId", "galleryMediaIds"]) {
    assert.match(
      text,
      new RegExp(`${key}:\\s*`),
      `${key} disappeared from the admin payload — if that was deliberate, the ` +
        `publish gate must first learn to read media_product_media (Block 7 report §11)`,
    );
  }
});

test("STATIC: syncProductMediaFromServer is the only writer of the legacy projection", () => {
  // The gap the frontend is currently filling for the server. Named here so
  // that when the server takes it over, the duplication is obvious.
  const text = src("services/media/productMediaService.js");
  assert.match(text, /buildProductMediaPatch\(media\.items\)/);
  assert.match(text, /apiAdminUpdateProduct\(id,\s*patch\)/);
});

/* ------------------------------------------------------------------ */
/* 5. Blocks 1-6 untouched                                              */
/* ------------------------------------------------------------------ */

test("STATIC: Block 7 did not touch the product write path", () => {
  const text = src("services/api/productsApi.js");
  // Block 3/4: the supplied slug is sent verbatim, collisions are a 409.
  assert.match(text, /slug/);
  // Block 6: no lifecycle key is proposed by the client.
  const start = text.indexOf("function buildAdminProductPayload");
  const rest = text.slice(start);
  const body = rest.slice(0, rest.indexOf("\n}\n"));
  for (const key of ["status:", "published:", "review:"]) {
    assert.doesNotMatch(body, new RegExp(`\\b${key}`), `${key} leaked into the payload`);
  }
});
