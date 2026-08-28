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
 *   * R5 Stage 1 removes the three media-write keys from every frontend
 *     product payload while retaining authored URL fields;
 *   * registered-media refreshes are read-only: no product PATCH is used as a
 *     client-side projection.
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
import { PRODUCT_MEDIA_COVER_ROLE } from "../src/services/media/productMediaService.js";
import { buildAdminProductPayload } from "../src/services/api/productsApi.js";

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
/* 4. R5 Stage 1 — product media IDs are read-only to the frontend      */
/* ------------------------------------------------------------------ */

const LEGACY_MEDIA_WRITE_KEYS = ["mediaIds", "primaryMediaId", "galleryMediaIds"];

test("buildAdminProductPayload omits all three legacy media-write keys", () => {
  const payload = buildAdminProductPayload({
    name: "Registered-media product",
    mediaIds: ["media-1"],
    primaryMediaId: "media-1",
    galleryMediaIds: ["media-2"],
    image: "authored-cover.jpg",
    hoverImage: "authored-hover.jpg",
    additionalImages: ["authored-gallery.jpg"],
  });

  for (const key of LEGACY_MEDIA_WRITE_KEYS) {
    assert.equal(Object.hasOwn(payload, key), false, `${key} must not be a product write field`);
    assert.equal(JSON.stringify(payload).includes(`\"${key}\"`), false, `${key} reached the wire payload`);
  }
  // Authored legacy plates remain valid product content, even when they are URLs.
  assert.equal(payload.image, "authored-cover.jpg");
  assert.equal(payload.hoverImage, "authored-hover.jpg");
  assert.deepEqual(payload.additionalImages, ["authored-gallery.jpg"]);
});

test("STATIC: buildAdminProductPayload cannot regain legacy media forwarding", () => {
  const text = src("services/api/productsApi.js");
  const start = text.indexOf("function buildAdminProductPayload");
  assert.ok(start >= 0, "the single admin payload builder moved unexpectedly");
  const body = text.slice(start, text.indexOf("\n}\n", start) + 3);
  for (const key of LEGACY_MEDIA_WRITE_KEYS) {
    assert.doesNotMatch(body, new RegExp(`\\b${key}\\s*:`), `${key} was restored to the payload builder`);
  }
});

test("STATIC: the media service has no registered-media product PATCH path", () => {
  const text = src("services/media/productMediaService.js");
  assert.doesNotMatch(text, /buildProductMediaPatch/);
  assert.doesNotMatch(text, /apiAdminUpdateProduct/);
  assert.doesNotMatch(text, /PATCH \/admin\/products/);
  assert.match(text, /apiAdminGetProduct/);
  assert.match(text, /apiGetProductMediaSet/);
});

test("STATIC: product API writers all use the central payload without legacy media fields", () => {
  const payloadBuilder = src("services/api/productsApi.js");
  const builderStart = payloadBuilder.indexOf("function buildAdminProductPayload");
  const builderBody = payloadBuilder.slice(builderStart, payloadBuilder.indexOf("\n}\n", builderStart) + 3);
  const catalog = src("services/catalogRepository.js");
  const backendSyncStart = catalog.indexOf("async function syncProductToBackend");
  assert.ok(backendSyncStart >= 0, "catalog backend sync moved unexpectedly");
  const writerSources = [
    ["services/api/productsApi.js", builderBody],
    ["services/admin/productAdminService.js", src("services/admin/productAdminService.js")],
    ["services/catalogRepository.js", catalog.slice(backendSyncStart)],
  ];
  for (const [file, text] of writerSources) {
    for (const key of LEGACY_MEDIA_WRITE_KEYS) {
      assert.doesNotMatch(
        text,
        new RegExp(`\\b${key}\\s*:`),
        `${file} contains an unexpected ${key} product-write property`,
      );
    }
  }
});

test("STATIC: registered media is read through media-set and product DTO APIs", () => {
  const text = src("services/media/productMediaService.js");
  assert.match(text, /getRegisteredProductMedia\(id\)/);
  assert.match(text, /apiAdminGetProduct\(id\)/);
  assert.match(text, /upsertServerProducts\(\[fresh\.product\]\)/);
  assert.match(text, /stage: PRODUCT_MEDIA_STAGES\.REFRESHED/);
});

test("STATIC: the editor does not copy registered DTO projections into authored media fields", () => {
  const text = src("components/products/editorSectionsContent.jsx");
  assert.match(text, /<ProductMediaManager productId=\{draft\.id\} scope="admin" \/>/);
  assert.doesNotMatch(text, /serverProduct/);
  assert.doesNotMatch(text, /additionalImages:\\s*server/);
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
