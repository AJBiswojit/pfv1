/**
 * PRATIKSHYA FASHION — media upload transport contract.
 *
 * These tests pin the two things the upload page depends on and nothing else:
 *
 *   1. `apiClient.request()` gained OPT-IN cancellation (`timeoutMs` / `signal`)
 *      and every caller that does not ask for it is byte-for-byte unchanged.
 *      A caller that does ask gets a distinguishable TIMEOUT / CANCELLED code,
 *      because a multipart request that never answered may well have been
 *      committed server-side.
 *
 *   2. `apiUploadProductMediaObject()` carries the operator's metadata on the
 *      SAME multipart body as the file (title / alt text / role / sort order /
 *      replace), because the server creates those values once and never edits
 *      them — and it never sends `is_primary` for an employee session, which
 *      the employee lane rejects outright.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { apiClient, handleError } from "../src/services/api/apiClient.js";
import { apiUploadProductMediaObject } from "../src/services/api/mediaApi.js";
import {
  loadProductMediaContext,
  uploadAndRegisterProductImages,
} from "../src/services/media/productMediaService.js";

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const captureFetch = (responder = () => jsonResponse({ ok: true })) => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return responder(String(url), options);
  };
  return calls;
};

const pendingFetch = () => {
  const calls = [];
  globalThis.fetch = (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Promise((_resolve, reject) => {
      if (options.signal) {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }
    });
  };
  return calls;
};

const file = (name = "plate.png") =>
  new File([new Uint8Array([1, 2, 3, 4])], name, { type: "image/png", lastModified: 1_760_000_000_000 });

// ===========================================================================
// 1. Opt-in cancellation
// ===========================================================================

test("a request that does not opt in creates no AbortController and no signal", async () => {
  const calls = captureFetch(() => jsonResponse({ ok: true }));
  await apiClient.get("/media/storage/status", { scope: "none" });

  assert.equal(calls.length, 1);
  assert.ok(!("signal" in calls[0].options) || calls[0].options.signal === undefined,
    "existing callers must keep the exact request they had");
  assert.equal(typeof AbortController, "function", "nothing in this client requires a signal");
});

test("a request that opts in passes a real signal to fetch", async () => {
  const calls = captureFetch(() => jsonResponse({ ok: true }));
  await apiClient.upload("/media/products/PF-1/objects", new FormData(), {
    timeoutMs: 5_000,
    scope: "admin",
  });
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test("an exhausted timeout reports TIMEOUT, not a generic network error", async () => {
  pendingFetch();
  let failure = null;
  try {
    await apiClient.upload("/media/products/PF-1/objects", new FormData(), {
      timeoutMs: 10,
      scope: "admin",
    });
  } catch (error) {
    failure = error;
  }
  const result = handleError(failure);
  assert.equal(result.ok, false);
  assert.equal(result.code, "TIMEOUT");
  assert.equal(result.isNetworkError, true, "the write may still have landed");
});

test("an external abort reports CANCELLED and is not a server rejection", async () => {
  pendingFetch();
  const controller = new AbortController();
  const promise = apiClient.upload("/media/products/PF-1/objects", new FormData(), {
    signal: controller.signal,
    scope: "admin",
  });
  controller.abort();

  let failure = null;
  try {
    await promise;
  } catch (error) {
    failure = error;
  }
  const result = handleError(failure);
  assert.equal(result.code, "CANCELLED");
  assert.equal(result.status, 0);
});

test("an already-aborted signal never reaches the network as a success", async () => {
  /* Mirrors the platform: `fetch` rejects immediately for an aborted signal. */
  const calls = captureFetch((_url, options) => {
    if (options.signal?.aborted) {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
    return jsonResponse({ ok: true });
  });
  const controller = new AbortController();
  controller.abort();

  let failure = null;
  try {
    await apiClient.upload("/media/products/PF-1/objects", new FormData(), {
      signal: controller.signal,
      scope: "admin",
    });
  } catch (error) {
    failure = error;
  }
  assert.equal(calls.length, 1, "fetch is still called once, with an aborted signal");
  assert.equal(handleError(failure).code, "CANCELLED");
});

// ===========================================================================
// 2. The single upload request
// ===========================================================================

test("a bare call sends the file and nothing else", async () => {
  const calls = captureFetch(() => jsonResponse({ ok: true, object: { key: "products/PF-1/plate.png" } }, 201));
  const result = await apiUploadProductMediaObject("PF-1", file());

  assert.equal(result.ok, true);
  const body = calls[0].options.body;
  assert.ok(body instanceof FormData);
  assert.deepEqual([...body.keys()], ["file"], "no empty metadata fields");
});

test("the operator's metadata rides on the same multipart body as the file", async () => {
  const calls = captureFetch(() => jsonResponse({ ok: true, object: { key: "products/PF-1/plate.png" } }, 201));
  await apiUploadProductMediaObject("PF-1", file(), {
    role: "COVER",
    sortOrder: 7,
    isPrimary: true,
    title: "Cover plate",
    altText: "Cream handloom sari on a wooden rail",
    replaceExisting: true,
  });

  const body = calls[0].options.body;
  assert.equal(body.get("role"), "COVER");
  assert.equal(body.get("sort_order"), "7");
  assert.equal(body.get("is_primary"), "true");
  assert.equal(body.get("title"), "Cover plate");
  assert.equal(body.get("alt_text"), "Cream handloom sari on a wooden rail");
  assert.equal(body.get("replace_existing"), "true");
  assert.ok(body.get("file") instanceof File);
});

test("employee scope never carries is_primary, even when asked", async () => {
  const calls = captureFetch(() => jsonResponse({ ok: true, object: { key: "products/PF-1/plate.png" } }, 201));
  await apiUploadProductMediaObject("PF-1", file(), {
    scope: "employee",
    isPrimary: true,
    role: "GALLERY",
  });

  const body = calls[0].options.body;
  assert.equal(body.get("is_primary"), null);
  assert.equal(body.get("role"), "GALLERY");
  assert.match(calls[0].url, /\/employee\/media\/products\/PF-1\/objects$/);
});

test("sort order 0 is sent explicitly — it is a real position, not an absent value", async () => {
  const calls = captureFetch(() => jsonResponse({ ok: true, object: { key: "products/PF-1/plate.png" } }, 201));
  await apiUploadProductMediaObject("PF-1", file(), { sortOrder: 0 });
  assert.equal(calls[0].options.body.get("sort_order"), "0");
});

test("the upload response's object key is surfaced and no media id is invented", async () => {
  captureFetch(() =>
    jsonResponse({ ok: true, status: 201, object: { key: "products/PF-1/plate.png", size: 4, contentType: "image/png" } }, 201)
  );
  const result = await apiUploadProductMediaObject("PF-1", file());
  assert.equal(result.object.key, "products/PF-1/plate.png");
  assert.equal(result.object.mediaId, undefined, "the server never returns one here");
});

test("an upload rejection keeps the server's own message", async () => {
  captureFetch(() => jsonResponse({ detail: "Archived products cannot receive new media." }, 422));
  const result = await apiUploadProductMediaObject("PF-1", file());
  assert.equal(result.ok, false);
  assert.equal(result.status, 422);
  assert.match(result.error, /Archived products cannot receive new media/);
});

test("a missing product id or file is refused before any request", async () => {
  const calls = captureFetch();
  assert.equal((await apiUploadProductMediaObject("", file())).ok, false);
  assert.equal((await apiUploadProductMediaObject("PF-1", null)).ok, false);
  assert.equal(calls.length, 0);
});

// ===========================================================================
// 3. The batch's shared defaults
// ===========================================================================

test("replace_existing is sent only for the files the operator chose to replace", async () => {
  const bodies = [];
  const calls = captureFetch((_url, options) => {
    bodies.push(options.body);
    return jsonResponse({ ok: true, object: { key: `products/PF-1/${options.body.get("file").name}` } }, 201);
  });

  await uploadAndRegisterProductImages("PF-1", [file("keep.png"), file("collide.png")], {
    continueOnError: true,
    perFile: (entry) => ({ replaceExisting: (entry?.file ?? entry)?.name === "collide.png" }),
  });

  assert.equal(calls.length, 2);
  assert.equal(bodies[0].get("replace_existing"), null, "a normal file is never an overwrite");
  assert.equal(bodies[1].get("replace_existing"), "true");
});

test("the batch never invents a role — an unset role stays unset", async () => {
  const bodies = [];
  captureFetch((_url, options) => {
    bodies.push(options.body);
    return jsonResponse({ ok: true, object: { key: "products/PF-1/x.png" } }, 201);
  });

  await uploadAndRegisterProductImages("PF-1", [file("x.png")], { continueOnError: true });
  assert.equal(bodies[0].get("role"), null, "the service must not guess COVER");
  assert.equal(bodies[0].get("sort_order"), "0", "position is still explicit");
});

// ===========================================================================
// 4. Reading the target before writing
// ===========================================================================

test("a failed media-set read leaves the product UNVERIFIED", async () => {
  captureFetch((url) =>
    String(url).includes("/media-set")
      ? jsonResponse({ detail: "Product not found." }, 404)
      : jsonResponse({ product: { id: "PF-1", name: "Sari" } })
  );

  const context = await loadProductMediaContext("PF-1", { scope: "admin" });
  assert.equal(context.ok, false);
  assert.equal(context.verified, false, "unverified must never read as 'safe to write'");
  assert.match(context.error, /Product not found/);
});

test("a product-record failure does not discard a good media-set read", async () => {
  captureFetch((url) => {
    if (String(url).includes("/media-set")) {
      return jsonResponse({ mediaItems: [{ mediaId: "media-1", objectKey: "products/PF-1/a.png" }] });
    }
    return jsonResponse({ detail: "Product read failed." }, 500);
  });

  const context = await loadProductMediaContext("PF-1", { scope: "admin" });
  assert.equal(context.ok, true);
  assert.equal(context.verified, true);
  assert.equal(context.items.length, 1, "the registered set still answers the cover question");
  assert.equal(context.product, null);
  assert.match(context.productError, /Product read failed/);
});

test("the employee lane reads the media-set and the product through employee routes", async () => {
  const calls = captureFetch((url) =>
    String(url).includes("/media-set")
      ? jsonResponse({ mediaItems: [] })
      : jsonResponse({ product: { id: "PF-1", name: "Sari" } })
  );

  const context = await loadProductMediaContext("PF-1", { scope: "employee" });
  assert.equal(context.ok, true);
  const paths = calls.map((call) => new URL(call.url, "https://frontend.invalid").pathname);
  assert.ok(paths.some((path) => path === "/api/v1/employee/products/PF-1"));
  assert.ok(!paths.some((path) => path.startsWith("/api/v1/admin/")), "no admin route from an employee session");
});
