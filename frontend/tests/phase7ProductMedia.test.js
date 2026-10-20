/**
 * PRATIKSHYA FASHON — Phase 7 regression: the REAL product media lifecycle.
 *
 * These suites pin the contract the Phase 7 frontend integration introduced:
 *
 *   · upload → object key → registration → product assignment is a REAL
 *     two-HTTP-call orchestration, and the UI stage vocabulary only ever
 *     reflects server-confirmed transitions (a browser-held file is never
 *     described as uploaded);
 *   · failures surface the server's own message, stop the batch at the
 *     failure point and NEVER mint or carry forward a fake media id;
 *   · primary / cover and ordering are re-registered through the idempotent
 *     register endpoint, then the authoritative media-set and product DTO are
 *     re-read from the server — the UI never assumes the write;
 *   · the durable read model (media-set) remains independent of the product
 *     write contract, and media refresh never issues a product PATCH;
 *   · nothing is written to localStorage: the durable registry is the only
 *     media truth these modules touch.
 *
 * The mock `fetch` harness is the same one the Phase 3–6 suites use: every
 * request is captured and every response is a real `Response` object.
 */

import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

import {
  PRODUCT_MEDIA_STAGES,
  PRODUCT_MEDIA_STAGE_LABELS,
  PRODUCT_MEDIA_COVER_ROLE,
  isTerminalMediaStage,
  getRegisteredProductMedia,
  syncProductMediaFromServer,
  uploadAndRegisterProductImage,
  uploadAndRegisterProductImages,
  setPrimaryProductMedia,
  reorderProductMedia,
  moveProductMedia,
} from "../src/services/media/productMediaService.js";
import {
  apiRegisterMediaObject,
  apiUploadProductMediaObject,
  apiListMediaAssets,
  apiListProductMedia,
  MARKETING_MEDIA_BLOCKER,
} from "../src/services/api/mediaApi.js";
import { getServerProducts, replaceServerProducts } from "../src/services/catalogRepository.js";

// ---------------------------------------------------------------------------
// Harness (same pattern as the Phase 3–6 suites)
// ---------------------------------------------------------------------------

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const mockFetch = (responder) => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const next = typeof responder === "function" ? responder(url, options) : responder;
    if (next instanceof Response) return next;
    return jsonResponse(next ?? {});
  };
  return calls;
};

const PNG = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "plate-one.png", { type: "image/png" });
const WEBP = new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], "plate-two.webp", { type: "image/webp" });
const AVIF = new File([new Uint8Array([0x00, 0x00, 0x00, 0x1c])], "plate-three.avif", { type: "image/avif" });

const MEDIA_SET = {
  mediaRecordsAvailable: true,
  primary: { mediaId: "media-1", url: "/api/v1/media/objects/products/PF-W-NEW-0001/a.png", isPrimary: true },
  gallery: [{ mediaId: "media-2", url: "/api/v1/media/objects/products/PF-W-NEW-0001/b.webp", isPrimary: false }],
  mediaItems: [
    {
      assignmentId: "asgmt-1",
      mediaId: "media-1",
      objectKey: "products/PF-W-NEW-0001/a.png",
      url: "/api/v1/media/objects/products/PF-W-NEW-0001/a.png",
      role: "COVER",
      sortOrder: 0,
      isPrimary: true,
      mimeType: "image/png",
    },
    {
      assignmentId: "asgmt-2",
      mediaId: "media-2",
      objectKey: "products/PF-W-NEW-0001/b.webp",
      url: "/api/v1/media/objects/products/PF-W-NEW-0001/b.webp",
      role: "GALLERY",
      sortOrder: 1,
      isPrimary: false,
      mimeType: "image/webp",
    },
  ],
};

const formField = (call, name) => {
  const body = call?.options?.body;
  if (!(body instanceof FormData)) return undefined;
  return body.get(name);
};

// ===========================================================================
// 1. The stage vocabulary — honesty is the contract
// ===========================================================================

test("the lifecycle vocabulary only ever reflects server-confirmed states", () => {
  // There is no "saved locally" or "scheduled" stage — every label maps to
  // a transition the server has confirmed (or to a failure with its message).
  assert.equal(PRODUCT_MEDIA_STAGES.SELECTED, "selected");
  assert.equal(PRODUCT_MEDIA_STAGES.UPLOADING, "uploading");
  assert.equal(PRODUCT_MEDIA_STAGES.UPLOADED, "uploaded");
  assert.equal(PRODUCT_MEDIA_STAGES.REGISTERING, "registering");
  assert.equal(PRODUCT_MEDIA_STAGES.ASSIGNED, "assigned");
  assert.equal(PRODUCT_MEDIA_STAGES.REFRESHED, "refreshed");
  assert.equal(PRODUCT_MEDIA_STAGES.PUBLISHED, "published");
  assert.equal(PRODUCT_MEDIA_STAGES.FAILED, "failed");

  // "Selected" is the only pre-network state and it never claims storage.
  assert.equal(PRODUCT_MEDIA_STAGE_LABELS[PRODUCT_MEDIA_STAGES.SELECTED], "Selected");
  assert.doesNotMatch(PRODUCT_MEDIA_STAGE_LABELS[PRODUCT_MEDIA_STAGES.UPLOADING], /stored|saved|assigned/i);
  assert.match(PRODUCT_MEDIA_STAGE_LABELS[PRODUCT_MEDIA_STAGES.UPLOADED], /object storage/i);

  assert.ok(isTerminalMediaStage(PRODUCT_MEDIA_STAGES.REFRESHED));
  assert.ok(isTerminalMediaStage(PRODUCT_MEDIA_STAGES.PUBLISHED));
  assert.ok(isTerminalMediaStage(PRODUCT_MEDIA_STAGES.FAILED));
  assert.ok(!isTerminalMediaStage(PRODUCT_MEDIA_STAGES.UPLOADING));
});

// ===========================================================================
// 2. Authoritative read model — no product projection
// ===========================================================================

test("the registered media-set is read verbatim without inventing product fields", async () => {
  const calls = mockFetch(MEDIA_SET);
  const result = await getRegisteredProductMedia("PF-W-NEW-0001");

  assert.equal(result.ok, true);
  assert.match(calls[0].url, /\/media\/products\/PF-W-NEW-0001\/media-set$/);
  assert.equal(result.mediaRecordsAvailable, true);
  assert.deepEqual(result.items, MEDIA_SET.mediaItems);
  assert.equal(result.primary.mediaId, "media-1");
  assert.equal(result.gallery.length, 1);
  assert.equal(Object.hasOwn(result, "mediaIds"), false);
  assert.equal(Object.hasOwn(result, "primaryMediaId"), false);
  assert.equal(Object.hasOwn(result, "galleryMediaIds"), false);
});

// ===========================================================================
// 3. Registration + assignment — the exact FormData contract
// ===========================================================================

test("apiRegisterMediaObject posts the full assignment payload to /media/register", async () => {
  const calls = mockFetch({
    ok: true,
    assigned: true,
    media: { id: "media-9", url: "/api/v1/media/objects/products/PF-1/x.png" },
    assignment: { id: "asgmt-9", role: "COVER", sortOrder: 3, isPrimary: true },
  });
  const result = await apiRegisterMediaObject("products/PF-1/x.png", {
    productId: "PF-1",
    role: "COVER",
    sortOrder: 3,
    isPrimary: true,
    title: "Hero plate",
    altText: "Silk sari hero",
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/media\/register$/);
  assert.equal(formField(calls[0], "object_key"), "products/PF-1/x.png");
  assert.equal(formField(calls[0], "product_id"), "PF-1");
  assert.equal(formField(calls[0], "role"), "COVER");
  assert.equal(formField(calls[0], "sort_order"), "3");
  assert.equal(formField(calls[0], "is_primary"), "true");
  assert.equal(formField(calls[0], "title"), "Hero plate");
  assert.equal(formField(calls[0], "alt_text"), "Silk sari hero");
  assert.equal(result.ok, true);
  assert.equal(result.media.id, "media-9");
  assert.equal(result.assignment.id, "asgmt-9");
});

test("apiRegisterMediaObject omits is_primary when false so the server keeps its default", async () => {
  const calls = mockFetch({ ok: true, assigned: false, media: { id: "m" } });
  await apiRegisterMediaObject("products/PF-1/y.png", { productId: "PF-1", isPrimary: false });
  assert.equal(formField(calls[0], "is_primary"), null);
});

test("a registration rejection returns the server's own message, never a fake id", async () => {
  mockFetch(jsonResponse({ detail: "Media object not found in the object store." }, 404));
  const result = await apiRegisterMediaObject("products/PF-1/ghost.png", { productId: "PF-1" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.match(result.error, /not found/i);
  assert.equal(result.media, undefined, "no media id may be minted on failure");
});

// ===========================================================================
// 4. Upload + registration orchestration
// ===========================================================================

test("uploadAndRegisterProductImage runs upload → register with honest stage reports", async () => {
  const calls = mockFetch((url) => {
    if (String(url).endsWith("/media/products/PF-W-NEW-0001/objects")) {
      return { ok: true, object: { key: "products/PF-W-NEW-0001/plate-one.png", url: "/api/v1/media/objects/products/PF-W-NEW-0001/plate-one.png" } };
    }
    if (String(url).endsWith("/media/register")) {
      return {
        ok: true,
        assigned: true,
        media: { id: "media-42", url: "/api/v1/media/objects/products/PF-W-NEW-0001/plate-one.png" },
        assignment: { id: "asgmt-42", isPrimary: true },
      };
    }
    throw new Error(`unexpected call ${url}`);
  });

  const stages = [];
  const result = await uploadAndRegisterProductImage("PF-W-NEW-0001", PNG, {
    isPrimary: true,
    onStage: (stage) => stages.push(stage),
  });

  assert.equal(result.ok, true);
  assert.equal(result.media.id, "media-42");
  assert.equal(result.objectKey, "products/PF-W-NEW-0001/plate-one.png");
  assert.deepEqual(stages, [
    PRODUCT_MEDIA_STAGES.UPLOADING,
    PRODUCT_MEDIA_STAGES.UPLOADED,
    PRODUCT_MEDIA_STAGES.REGISTERING,
    PRODUCT_MEDIA_STAGES.ASSIGNED,
  ]);
  // Upload carries the file; registration carries the object key back.
  assert.ok(formField(calls[0], "file") instanceof File);
  assert.equal(formField(calls[1], "object_key"), "products/PF-W-NEW-0001/plate-one.png");
  assert.equal(formField(calls[1], "is_primary"), "true");
});

test("an upload failure stops before registration and reports failed", async () => {
  const calls = mockFetch((url) => {
    if (String(url).endsWith("/objects")) {
      return jsonResponse({ detail: "Only administrators may upload media." }, 403);
    }
    throw new Error(`register must not run, got ${url}`);
  });

  const stages = [];
  const result = await uploadAndRegisterProductImage("PF-W-NEW-0001", PNG, {
    onStage: (stage) => stages.push(stage),
  });

  assert.equal(result.ok, false);
  assert.equal(result.step, "upload");
  assert.match(result.error, /administrators/);
  assert.deepEqual(stages, [PRODUCT_MEDIA_STAGES.UPLOADING, PRODUCT_MEDIA_STAGES.FAILED]);
  assert.equal(calls.length, 1, "register was never attempted");
});

test("a registration failure carries the object key forward but never a media id", async () => {
  mockFetch((url) => {
    if (String(url).endsWith("/objects")) {
      return { ok: true, object: { key: "products/PF-W-NEW-0001/plate-one.png" } };
    }
    return jsonResponse({ detail: "Product media registration requires media.upload." }, 422);
  });

  const result = await uploadAndRegisterProductImage("PF-W-NEW-0001", PNG);
  assert.equal(result.ok, false);
  assert.equal(result.step, "register");
  assert.equal(result.objectKey, "products/PF-W-NEW-0001/plate-one.png");
  assert.equal(result.media, undefined);
  assert.match(result.error, /media\.upload/);
});

test("uploadAndRegisterProductImages assigns in queue order and aborts on the first failure", async () => {
  const uploads = [];
  const registers = [];
  mockFetch((url, options) => {
    const file = options?.body instanceof FormData ? options.body.get("file") : null;
    const objectKey = options?.body instanceof FormData ? options.body.get("object_key") : null;
    if (String(url).endsWith("/objects")) {
      uploads.push(file?.name);
      if (file?.name === "plate-two.webp") {
        return jsonResponse({ detail: "Only image files are accepted." }, 415);
      }
      return { ok: true, object: { key: `products/PF-W-NEW-0001/${file?.name}` } };
    }
    const sortOrder = options?.body?.get("sort_order");
    const isPrimary = options?.body?.get("is_primary");
    registers.push({ objectKey, sortOrder, isPrimary });
    return { ok: true, assigned: true, media: { id: `media-${registers.length}` }, assignment: { id: `asgmt-${registers.length}` } };
  });

  const result = await uploadAndRegisterProductImages(
    "PF-W-NEW-0001",
    [{ file: PNG, role: "COVER" }, { file: WEBP, role: "GALLERY" }, { file: AVIF, role: "DETAIL" }],
    { firstIsPrimary: true },
  );

  assert.equal(result.ok, false, "the batch reports the failure");
  assert.equal(result.failedIndex, 1);
  assert.match(result.error, /image files/);
  assert.deepEqual(uploads, ["plate-one.png", "plate-two.webp"], "the third file was never uploaded");
  assert.deepEqual(registers, [
    { objectKey: "products/PF-W-NEW-0001/plate-one.png", sortOrder: "0", isPrimary: "true" },
  ]);
  assert.equal(result.results.length, 2, "the failed file's result is included for the UI");
});

test("queue order, roles and firstIsPrimary land on the register payload", async () => {
  const registers = [];
  mockFetch((url, options) => {
    const body = options?.body;
    if (String(url).endsWith("/objects")) {
      return { ok: true, object: { key: `products/PF-W-NEW-0001/${body?.get("file")?.name}` } };
    }
    registers.push({
      key: body?.get("object_key"),
      role: body?.get("role"),
      sort: body?.get("sort_order"),
      primary: body?.get("is_primary"),
      title: body?.get("title"),
    });
    return { ok: true, assigned: true, media: { id: `media-${registers.length}` } };
  });

  const result = await uploadAndRegisterProductImages(
    "PF-W-NEW-0001",
    [
      { file: PNG, role: "COVER", title: "Cover plate" },
      { file: WEBP, role: "GALLERY", title: "Gallery plate" },
    ],
    { firstIsPrimary: true },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(registers, [
    {
      key: "products/PF-W-NEW-0001/plate-one.png",
      role: "COVER",
      sort: "0",
      primary: "true",
      title: "Cover plate",
    },
    {
      key: "products/PF-W-NEW-0001/plate-two.webp",
      role: "GALLERY",
      sort: "1",
      primary: null,
      title: "Gallery plate",
    },
  ]);
});

// ===========================================================================
// 5. Read model + product refresh
// ===========================================================================

test("getRegisteredProductMedia maps the media-set response without inventing fields", async () => {
  const calls = mockFetch(MEDIA_SET);
  const result = await getRegisteredProductMedia("PF-W-NEW-0001");
  assert.equal(result.ok, true);
  assert.match(calls[0].url, /\/media\/products\/PF-W-NEW-0001\/media-set$/);
  assert.equal(result.mediaRecordsAvailable, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].mediaId, "media-1");
  assert.equal(result.primary.mediaId, "media-1");
  assert.equal(result.gallery.length, 1);
});

test("syncProductMediaFromServer only refreshes authoritative reads", async () => {
  const calls = mockFetch((url) => {
    if (String(url).endsWith("/media-set")) return MEDIA_SET;
    if (String(url).match(/\/admin\/products\/PF-W-NEW-0001/)) {
      return {
        id: "PF-W-NEW-0001",
        name: "New Sari",
        image: MEDIA_SET.primary.url,
        additionalImages: MEDIA_SET.mediaItems.map((item) => item.url),
        mediaIds: ["media-1", "media-2"],
        primaryMediaId: "media-1",
        galleryMediaIds: ["media-2"],
      };
    }
    throw new Error(`unexpected ${url}`);
  });

  replaceServerProducts([]);
  const result = await syncProductMediaFromServer("PF-W-NEW-0001");

  assert.equal(result.ok, true);
  assert.equal(result.stage, PRODUCT_MEDIA_STAGES.REFRESHED);
  assert.equal(result.items.length, 2);
  assert.equal(result.product.image, MEDIA_SET.primary.url);
  assert.deepEqual(result.product.additionalImages, MEDIA_SET.mediaItems.map((item) => item.url));

  const methods = calls.map((call) => (call.options?.method ?? "GET").toUpperCase());
  assert.deepEqual(methods, ["GET", "GET"], "refresh uses media-set and product reads only");
  assert.equal(calls.some((call) => call.options?.body), false, "refresh sent no product write body");
  assert.equal(getServerProducts().some((product) => product.id === "PF-W-NEW-0001"), true);
  replaceServerProducts([]);
});

test("a failed product read is reported without pretending registration failed", async () => {
  const calls = mockFetch((url) => {
    if (String(url).endsWith("/media-set")) return MEDIA_SET;
    return jsonResponse({ detail: "AUDIT-ONLY: product read denied." }, 403);
  });
  const result = await syncProductMediaFromServer("PF-W-NEW-0001");
  assert.equal(result.ok, false);
  assert.equal(result.stage, "read");
  assert.match(result.error, /AUDIT-ONLY/);
  assert.deepEqual(calls.map((call) => (call.options?.method ?? "GET").toUpperCase()), ["GET", "GET"]);
});

// ===========================================================================
// 6. Primary / cover and ordering — re-register, then re-read
// ===========================================================================

test("setPrimaryProductMedia re-registers with the COVER role without a product PATCH", async () => {
  const registers = [];
  const calls = mockFetch((url, options) => {
    if (String(url).endsWith("/media/register")) {
      registers.push({
        key: options?.body?.get("object_key"),
        role: options?.body?.get("role"),
        primary: options?.body?.get("is_primary"),
      });
      return { ok: true, assigned: true, media: { id: "media-2" } };
    }
    if (String(url).endsWith("/media-set")) return MEDIA_SET;
    if ((options?.method ?? "GET").toUpperCase() === "PATCH") {
      throw new Error("registered-media primary selection must not PATCH the product");
    }
    return { id: "PF-W-NEW-0001" };
  });

  const item = { ...MEDIA_SET.mediaItems[1] };
  const result = await setPrimaryProductMedia("PF-W-NEW-0001", item);

  assert.equal(result.ok, true);
  assert.deepEqual(registers, [
    { key: "products/PF-W-NEW-0001/b.webp", role: PRODUCT_MEDIA_COVER_ROLE, primary: "true" },
  ]);
  assert.equal(PRODUCT_MEDIA_COVER_ROLE, "COVER");
  assert.deepEqual(calls.map((call) => (call.options?.method ?? "GET").toUpperCase()), [
    "POST",
    "GET",
    "GET",
  ]);
});

test("reorderProductMedia re-registers every item with its new sort order without a product PATCH", async () => {
  const registers = [];
  const calls = mockFetch((url, options) => {
    if (String(url).endsWith("/media/register")) {
      registers.push({
        key: options?.body?.get("object_key"),
        role: options?.body?.get("role"),
        sort: options?.body?.get("sort_order"),
        primary: options?.body?.get("is_primary"),
      });
      return { ok: true, assigned: true, media: { id: "media" } };
    }
    if (String(url).endsWith("/media-set")) return MEDIA_SET;
    if ((options?.method ?? "GET").toUpperCase() === "PATCH") {
      throw new Error("registered-media reorder must not PATCH the product");
    }
    return { id: "PF-W-NEW-0001" };
  });

  const reordered = [MEDIA_SET.mediaItems[1], MEDIA_SET.mediaItems[0]];
  const result = await reorderProductMedia("PF-W-NEW-0001", reordered);

  assert.equal(result.ok, true);
  assert.deepEqual(registers, [
    { key: "products/PF-W-NEW-0001/b.webp", role: "GALLERY", sort: "0", primary: null },
    { key: "products/PF-W-NEW-0001/a.png", role: "COVER", sort: "1", primary: "true" },
  ]);
  assert.deepEqual(calls.map((call) => (call.options?.method ?? "GET").toUpperCase()), [
    "POST",
    "POST",
    "GET",
    "GET",
  ]);
});

test("moveProductMedia swaps neighbours and refuses impossible moves", async () => {
  mockFetch((url, options) => {
    if (String(url).endsWith("/media/register")) return { ok: true, assigned: true, media: { id: "m" } };
    if (String(url).endsWith("/media-set")) return MEDIA_SET;
    return { id: "PF-W-NEW-0001" };
  });

  const items = MEDIA_SET.mediaItems;
  const moved = await moveProductMedia("PF-W-NEW-0001", items, "media-2", "up");
  assert.equal(moved.ok, true);

  const impossible = await moveProductMedia("PF-W-NEW-0001", items, "media-1", "up");
  assert.equal(impossible.ok, false);
  assert.match(impossible.error, /cannot move/i);
});

// ===========================================================================
// 7. Registry listing + product media listing
// ===========================================================================

test("apiListMediaAssets reads the durable registry verbatim", async () => {
  const calls = mockFetch({
    ok: true,
    items: [
      { id: "media-1", objectKey: "products/PF-1/a.png", url: "/api/v1/media/objects/products/PF-1/a.png", status: "REGISTERED", mimeType: "image/png" },
    ],
  });
  const result = await apiListMediaAssets();
  assert.equal(result.ok, true);
  // Registry reads are DB-paginated now (admin consolidation): same
  // endpoint, bounded page params.
  assert.match(calls[0].url, /\/media\/assets(\?|$)/);
  assert.equal(result.items[0].objectKey, "products/PF-1/a.png");
});

test("apiListProductMedia projects the media-set read model, including the given urls", async () => {
  mockFetch(MEDIA_SET);
  const result = await apiListProductMedia("PF-W-NEW-0001");
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.mediaRecordsAvailable, true);
  assert.equal(result.primary.mediaId, "media-1");
  // The storefront-resolvable URL is used verbatim — it is the server's
  // canonical object URL, never derived or rewritten client-side.
  assert.equal(result.items[0].url, "/api/v1/media/objects/products/PF-W-NEW-0001/a.png");
});

// ===========================================================================
// 8. Marketing stays the honest gap
// ===========================================================================

test("marketing media assignment is still an explicit gap, stated precisely", () => {
  assert.match(MARKETING_MEDIA_BLOCKER, /Product-media registration is live/);
  assert.match(MARKETING_MEDIA_BLOCKER, /never silently promoted/i);
  assert.doesNotMatch(MARKETING_MEDIA_BLOCKER, /no business columns/);
});

// ===========================================================================
// 9. Batch 1 · Track C — employee-scoped product media routes
// ===========================================================================

const employeeRegistrar = (url) => {
  const path = new URL(String(url), "https://frontend.invalid").pathname;
  if (path === "/api/v1/employee/media/products/PF-W-NEW-0001/objects") {
    return jsonResponse(
      { ok: true, object: { key: "products/PF-W-NEW-0001/team.png", url: "/api/v1/media/objects/products/PF-W-NEW-0001/team.png" }, status: 201 },
      201,
    );
  }
  if (path === "/api/v1/employee/media/register") {
    return jsonResponse(
      {
        ok: true,
        media: { id: "media-emp-1", objectKey: "products/PF-W-NEW-0001/team.png", url: "/api/v1/media/objects/products/PF-W-NEW-0001/team.png", mimeType: "image/png", status: "uploaded" },
        assigned: true,
        assignment: { productId: "PF-W-NEW-0001", mediaId: "media-emp-1", role: "gallery", sortOrder: 0, isPrimary: false },
      },
      201,
    );
  }
  return new Response(JSON.stringify({ detail: "not mocked" }), { status: 404, headers: { "content-type": "application/json" } });
};

test("scope 'employee' uploads and registers through the employee routes only", async () => {
  const calls = mockFetch(employeeRegistrar);
  const result = await uploadAndRegisterProductImage("PF-W-NEW-0001", PNG, { scope: "employee" });
  assert.ok(result.ok, result.error);
  assert.equal(result.media?.id, "media-emp-1");
  const paths = calls.map((call) => new URL(String(call.url), "https://frontend.invalid").pathname);
  assert.ok(paths.includes("/api/v1/employee/media/products/PF-W-NEW-0001/objects"), paths.join(","));
  assert.ok(paths.includes("/api/v1/employee/media/register"), paths.join(","));
  // The admin media surface is untouched by an employee session.
  assert.ok(!paths.includes("/api/v1/media/products/PF-W-NEW-0001/objects"), paths.join(","));
  assert.ok(!paths.includes("/api/v1/media/register"), paths.join(","));
});

test("employee upload failure surfaces the server message and stops the pipeline", async () => {
  const calls = mockFetch((url) => {
    const path = new URL(String(url), "https://frontend.invalid").pathname;
    if (path === "/api/v1/employee/media/products/PF-W-NEW-0001/objects") {
      return jsonResponse({ detail: "You do not have permission to perform this action. Missing required permission: media.upload" }, 403);
    }
    return employeeRegistrar(url);
  });
  const result = await uploadAndRegisterProductImage("PF-W-NEW-0001", PNG, { scope: "employee" });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /media\.upload/);
  // Nothing reaches registration when the upload itself was denied.
  const paths = calls.map((call) => new URL(String(call.url), "https://frontend.invalid").pathname);
  assert.equal(paths.includes("/api/v1/employee/media/register"), false);
});

test("employee register-by-key denial keeps the server message verbatim", async () => {
  mockFetch((url) => {
    const path = new URL(String(url), "https://frontend.invalid").pathname;
    if (path === "/api/v1/employee/media/products/PF-W-NEW-0001/objects") {
      return jsonResponse({ ok: true, object: { key: "products/PF-W-NEW-0001/team.png" }, status: 201 }, 201);
    }
    if (path === "/api/v1/employee/media/register") {
      return jsonResponse({ detail: "Archived products cannot receive new media." }, 422);
    }
    return employeeRegistrar(url);
  });
  const result = await uploadAndRegisterProductImage("PF-W-NEW-0001", PNG, { scope: "employee" });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /Archived products cannot receive new media/);
});

test("employee sync reads the public media-set only — never the admin product DTO", async () => {
  const calls = mockFetch((url) => {
    const path = new URL(String(url), "https://frontend.invalid").pathname;
    if (path === "/api/v1/media/products/PF-W-NEW-0001/media-set") return jsonResponse(MEDIA_SET);
    return new Response(JSON.stringify({ detail: "admin product routes stay closed" }), { status: 403, headers: { "content-type": "application/json" } });
  });
  const sync = await syncProductMediaFromServer("PF-W-NEW-0001", { scope: "employee" });
  assert.ok(sync.ok, sync.error);
  const paths = calls.map((call) => new URL(String(call.url), "https://frontend.invalid").pathname);
  assert.ok(paths.includes("/api/v1/media/products/PF-W-NEW-0001/media-set"));
  assert.equal(paths.some((p) => p.startsWith("/api/v1/admin/")), false, paths.join(","));
});

// ===========================================================================
// 10. Batch 1 · Track D — mock media review workflow removed
// ===========================================================================

const ROOT = new URL("..", import.meta.url).pathname;

test("approving or rejecting media is not a real operation on the media surface", async () => {
  const { default: repo } = await import("../src/services/media/mediaRepository.js");
  for (const key of ["approve", "reject", "approveMany", "rejectMany", "getPendingReview"]) {
    assert.equal(repo[key], undefined, `mediaRepository.${key} must not exist once the mock workflow is removed`);
  }
  const actions = readFileSync(join(ROOT, "src/hooks/useMediaActions.js"), "utf8");
  assert.ok(!/mediaRepository\.(approve|reject)/.test(actions), "no hook may mint APPROVED/REJECTED records");
});

test("mock review copy is gone from the admin library and employee surfaces", () => {
  const library = readFileSync(join(ROOT, "src/pages/admin/media/AdminMediaLibrary.jsx"), "utf8");
  assert.ok(!library.includes("Approve (Make Active)"));
  assert.ok(!library.includes("Quick approve"));
  assert.ok(!library.includes("session-local"));
  assert.ok(!library.includes("requires approval"));
  assert.ok(!library.includes("waiting for approval"));

  const dashboard = readFileSync(join(ROOT, "src/pages/employee/EmployeeMediaDashboard.jsx"), "utf8");
  assert.ok(!dashboard.includes("Waiting for manager review"));
  assert.ok(!dashboard.includes("Approval Workflow"));
  assert.ok(!dashboard.includes("Live on storefront"));

  const upload = readFileSync(join(ROOT, "src/pages/employee/EmployeeMediaUpload.jsx"), "utf8");
  assert.ok(!upload.includes("review queue for store manager approval"));

  const detail = readFileSync(join(ROOT, "src/pages/admin/media/AdminMediaDetail.jsx"), "utf8");
  assert.ok(!detail.includes("Approve (Publish)"));
  assert.ok(!detail.includes("Rejection Reason"));
});

// ---------------------------------------------------------------------------
// Batch 2 / 1A — the media-set read forwards the caller's session scope
// ---------------------------------------------------------------------------

const withStoredTokens = (entries, run) => {
  const store = new Map(Object.entries(entries));
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      delete globalThis.localStorage;
    });
};

test("1A: getRegisteredProductMedia sends the employee session token for staff reads", async () => {
  await withStoredTokens({ pf_employee_access_token: "emp-token-123" }, async () => {
    const calls = mockFetch(MEDIA_SET);
    const result = await getRegisteredProductMedia("PF-W-NEW-0001", { scope: "employee" });
    assert.equal(result.ok, true);
    assert.match(calls[0].url, /\/media\/products\/PF-W-NEW-0001\/media-set$/);
    assert.equal(
      calls[0].options.headers.Authorization,
      "Bearer emp-token-123",
      "staff reads must carry the scope token so draft media-sets stay visible (1A)"
    );
  });
});

test("1A: getRegisteredProductMedia stays unauthenticated for the default public read", async () => {
  await withStoredTokens(
    { pf_employee_access_token: "emp-token-123", pf_admin_access_token: "admin-token-456" },
    async () => {
      const calls = mockFetch(MEDIA_SET);
      const result = await getRegisteredProductMedia("PF-W-NEW-0001");
      assert.equal(result.ok, true);
      assert.equal(
        calls[0].options.headers.Authorization,
        undefined,
        "the default read is the storefront/public contract — no staff token is attached (1A)"
      );
    }
  );
});

test("1A: syncProductMediaFromServer forwards an employee session to the media-set only", async () => {
  await withStoredTokens({ pf_employee_access_token: "emp-token-123" }, async () => {
    const calls = mockFetch((url) => {
      if (String(url).endsWith("/media-set")) return MEDIA_SET;
      throw new Error(`unexpected ${url} — employees must never hit the admin product DTO`);
    });
    const result = await syncProductMediaFromServer("PF-W-NEW-0001", { scope: "employee" });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1, "employee refresh reads the media-set only");
    assert.equal(calls[0].options.headers.Authorization, "Bearer emp-token-123");
  });
});

test("1A: syncProductMediaFromServer sends the admin token on both refresh reads", async () => {
  await withStoredTokens({ pf_admin_access_token: "admin-token-456" }, async () => {
    const calls = mockFetch((url) => {
      if (String(url).endsWith("/media-set")) return MEDIA_SET;
      if (String(url).match(/\/admin\/products\/PF-W-NEW-0001/)) {
        return { id: "PF-W-NEW-0001", name: "New Sari", image: MEDIA_SET.primary.url };
      }
      throw new Error(`unexpected ${url}`);
    });
    replaceServerProducts([]);
    const result = await syncProductMediaFromServer("PF-W-NEW-0001", { scope: "admin" });
    assert.equal(result.ok, true);
    const auth = calls.map((call) => call.options.headers.Authorization);
    assert.deepEqual(auth, ["Bearer admin-token-456", "Bearer admin-token-456"]);
    replaceServerProducts([]);
  });
});

test("1A: apiListProductMedia forwards its scope to the media-set read", async () => {
  await withStoredTokens({ pf_admin_access_token: "admin-token-456" }, async () => {
    const calls = mockFetch(MEDIA_SET);
    const result = await apiListProductMedia("PF-W-NEW-0001", { scope: "admin" });
    assert.equal(result.ok, true);
    assert.equal(calls[0].options.headers.Authorization, "Bearer admin-token-456");
  });
});
