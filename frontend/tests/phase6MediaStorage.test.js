/**
 * PRATIKSHYA FASHON — Phase 6 regression: local object storage & media URLs.
 *
 * These suites pin the rules the Phase 6 media work introduced:
 *
 *   · `mediaPaths` is the ONE media resolution seam. A canonical backend
 *     media URL, an absolute/data/blob URL, a `{src}` record and a legacy
 *     `/images/…` reference are each handled deliberately — and nothing
 *     derives a storage path from a slug, an id or a folder convention.
 *   · The frontend never invents a location: an unresolved reference stays
 *     unresolved (empty plate), it is never swapped for a placeholder or for
 *     another product's image.
 *   · The media URL prefix mirrors the backend (`API_V1_PREFIX` +
 *     `MEDIA_URL_PREFIX`) and is overridable by configuration, so a CDN or a
 *     separate API origin is an env change, not a rewrite.
 *   · `mediaApi` makes real HTTP calls for object storage (status, resolve,
 *     metadata, upload, delete). Since Phase 7 the media register is ALSO
 *     real (MediaAsset/ProductMedia rows exposed by the backend); the only
 *     remaining explicit BACKEND_GAP is the MARKETING assignment family,
 *     which has no backend API by design.
 *   · No media bytes or authoritative media metadata are written to
 *     localStorage / sessionStorage.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CANONICAL_MEDIA_ROOT,
  LEGACY_PUBLIC_IMAGE_PREFIX,
  MEDIA_URL_PREFIX,
  isBackendMediaUrl,
  isCanonicalMediaUrl,
  isLegacyPublicImageUrl,
  isRemoteOrInlineUrl,
  mediaObjectUrl,
  mediaOrigin,
  mediaReferenceKind,
  normalizeMediaPath,
  normalizeMediaReference,
  resolveMediaUrl,
} from "../src/services/media/mediaPaths.js";
import {
  MARKETING_MEDIA_BLOCKER,
  apiDeleteMediaObject,
  apiListMarketingMedia,
  apiGetMediaObjectMeta,
  apiGetMediaStorageStatus,
  apiGetProductMediaSet,
  apiListMedia,
  apiMediaObjectUrl,
  apiResolveMediaReferences,
  apiUploadMediaObject,
  apiUploadProductMediaObject,
  encodeMediaKey,
} from "../src/services/api/mediaApi.js";
import { toStorefrontProduct } from "../src/services/catalog/catalogStore.js";
import { buildAdminProductPayload } from "../src/services/api/productsApi.js";

const src = (relative) => readFileSync(join(process.cwd(), relative), "utf8");
/** Read from the repository root (for backend files). */
const repoSrc = (relative) => readFileSync(join(process.cwd(), "..", relative), "utf8");

// ---------------------------------------------------------------------------
// Harness (same pattern as the Phase 3–5 suites)
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

const CANONICAL = "/api/v1/media/objects/products/PF-W-SAR-SIL-0001/primary.avif";
const LEGACY = "/images/products/PF-W-SAR-SIL-0001/primary.avif";

// ===========================================================================
// 1. The media URL contract mirrors the backend
// ===========================================================================

test("the media URL prefix matches the backend mount and media prefix", () => {
  const backend = repoSrc("backend/app/config.py");
  // API_V1_PREFIX and MEDIA_URL_PREFIX are the two halves of the public URL.
  assert.match(backend, /API_V1_PREFIX:\s*str\s*=\s*"\/api\/v1"/);
  assert.match(backend, /MEDIA_URL_PREFIX:\s*str\s*=\s*"\/media\/objects"/);
  assert.equal(MEDIA_URL_PREFIX, "/api/v1/media/objects");
  assert.equal(apiMediaObjectUrl("products/PF-A/x.avif"), `${MEDIA_URL_PREFIX}/products/PF-A/x.avif`);
});

test("no media origin is hardcoded — the default is same-origin", () => {
  assert.equal(mediaOrigin(), "");
  assert.equal(resolveMediaUrl(CANONICAL), CANONICAL);
  // Nothing in the media layer pins a machine or a localhost URL.
  const layer = [
    src("src/services/media/mediaPaths.js"),
    src("src/services/api/mediaApi.js"),
  ].join("\n");
  assert.ok(!/http:\/\/localhost/.test(layer));
  assert.ok(!/http:\/\/127\.0\.0\.1/.test(layer));
  assert.ok(!/[A-Za-z]:\\\\/.test(layer));
});

// ===========================================================================
// 2. Reference normalisation — the single resolution layer
// ===========================================================================

test("a canonical backend media URL resolves to itself", () => {
  assert.equal(resolveMediaUrl(CANONICAL), CANONICAL);
  assert.equal(mediaReferenceKind(CANONICAL), "media");
  assert.equal(isBackendMediaUrl(CANONICAL), true);
});

test("absolute, data and blob URLs are preserved verbatim", () => {
  for (const value of [
    "https://cdn.example.com/products/x.avif",
    "http://cdn.internal/x.jpg",
    "data:image/png;base64,iVBORw0KGgo=",
    "blob:http://localhost:5173/abc",
  ]) {
    assert.equal(resolveMediaUrl(value), value);
    assert.equal(mediaReferenceKind(value), "remote");
    assert.equal(isRemoteOrInlineUrl(value), true);
  }
});

test("a legacy /images reference stays compatible during migration", () => {
  // The object may not be in the local store yet; the storefront must keep
  // rendering the public asset instead of breaking.
  assert.equal(resolveMediaUrl(LEGACY), LEGACY);
  assert.equal(mediaReferenceKind(LEGACY), "legacy-public");
  assert.equal(isLegacyPublicImageUrl(LEGACY), true);
  assert.equal(isCanonicalMediaUrl(LEGACY), true);
});

test("an absent reference resolves to empty, never to a placeholder", () => {
  for (const value of ["", "   ", null, undefined, 0, false, {}]) {
    assert.equal(resolveMediaUrl(value), "");
  }
  assert.equal(normalizeMediaReference(null), "");
  assert.equal(normalizeMediaReference(undefined), "");
  assert.equal(mediaReferenceKind(""), "empty");
});

test("record shapes resolve through the same seam", () => {
  assert.equal(normalizeMediaReference({ src: CANONICAL }), CANONICAL);
  assert.equal(normalizeMediaReference({ url: CANONICAL }), CANONICAL);
  assert.equal(normalizeMediaReference({ path: LEGACY }), LEGACY);
  assert.equal(normalizeMediaReference({ thumbnail: LEGACY }), LEGACY);
  assert.equal(normalizeMediaReference({}), "");
  assert.equal(normalizeMediaReference(LEGACY), LEGACY);
});

test("an unresolved reference is passed through, never guessed at", () => {
  // A media-register id cannot be resolved without the media tables. The
  // frontend must not turn it into a plausible-looking URL.
  assert.equal(resolveMediaUrl("pm-lx8f2k-417"), "pm-lx8f2k-417");
  assert.equal(mediaReferenceKind("pm-lx8f2k-417"), "other");
});

test("object keys are only ever formatted, never invented", () => {
  assert.equal(mediaObjectUrl("products/PF-A/x.avif"), `${MEDIA_URL_PREFIX}/products/PF-A/x.avif`);
  assert.equal(mediaObjectUrl("/products/PF-A/x.avif"), `${MEDIA_URL_PREFIX}/products/PF-A/x.avif`);
  assert.equal(mediaObjectUrl(""), "");
  assert.equal(
    encodeMediaKey("products/PF-A/x.avif"),
    "products/PF-A/x.avif"
  );
  // Slashes are structural; everything else is escaped.
  assert.equal(encodeMediaKey("products/PF A/x&y.avif"), "products/PF%20A/x%26y.avif");
});

test("path normalisation strips query and fragment without inventing structure", () => {
  // Pre-Phase-6 behaviour, deliberately preserved: an absolute reference is
  // re-rooted at "/", a relative one is left relative, and query/fragment
  // never survive into a comparison key.
  assert.equal(normalizeMediaPath("/images/products/x.avif?v=2#top"), "/images/products/x.avif");
  assert.equal(normalizeMediaPath("images/products/x.avif"), "images/products/x.avif");
  assert.equal(normalizeMediaPath("  /images/x.avif#plate  "), "/images/x.avif");
  assert.equal(isCanonicalMediaUrl("/images/products/x.avif"), true);
  assert.equal(isCanonicalMediaUrl("/images/hero/x.avif"), false);
});

// ===========================================================================
// 3. Product data flows through the resolver (cards, detail, cart, wishlist)
// ===========================================================================

test("the catalogue store keeps the backend's media reference as the product image", () => {
  const product = toStorefrontProduct({
    id: "PF-W-SAR-SIL-0001",
    name: "Banarasi Silk Saree",
    category: "sarees",
    price: 5000,
    image: CANONICAL,
    additionalImages: [CANONICAL, "/api/v1/media/objects/products/PF-W-SAR-SIL-0001/02.avif"],
  });
  assert.equal(product.image, CANONICAL);
  assert.equal(product.images.primary.src, CANONICAL);
  assert.equal(product.images.gallery.length, 2);
  assert.equal(
    resolveMediaUrl(product.images.primary.src),
    CANONICAL
  );
});

test("a product with no media renders nothing rather than a borrowed image", () => {
  const product = toStorefrontProduct({
    id: "PF-EMPTY-1",
    name: "No Plates Yet",
    category: "sarees",
    price: 1000,
    image: null,
    additionalImages: [],
  });
  assert.equal(product.image, null);
  assert.equal(product.images.primary, null);
  assert.deepEqual(product.images.gallery, []);
});

test("the admin write payload keeps authored media references as plain strings", () => {
  const payload = buildAdminProductPayload({
    id: "PF-W-SAR-SIL-0001",
    name: "Banarasi Silk Saree",
    category: "sarees",
    price: 5000,
    image: { src: CANONICAL },
    hoverImage: LEGACY,
    additionalImages: [CANONICAL, null],
    mediaIds: ["pm-1"],
    primaryMediaId: "pm-1",
    galleryMediaIds: ["pm-2"],
  });
  assert.equal(payload.image, CANONICAL);
  assert.equal(payload.hoverImage, LEGACY);
  assert.deepEqual(payload.additionalImages, [CANONICAL, ""]);
  assert.equal(payload.mediaIds, undefined);
  assert.equal(payload.primaryMediaId, undefined);
  assert.equal(payload.galleryMediaIds, undefined);
  // Lifecycle keys never ride along on a media edit.
  assert.equal(payload.status, undefined);
  assert.equal(payload.published, undefined);
});

// ===========================================================================
// 4. The media API layer
// ===========================================================================

test("storage status is a real request and carries no secrets", async () => {
  const calls = mockFetch({
    ok: true,
    provider: "local",
    urlPrefix: MEDIA_URL_PREFIX,
    cdnConfigured: false,
    namespaces: ["products", "collections", "hero"],
  });
  const result = await apiGetMediaStorageStatus();
  assert.equal(result.ok, true);
  assert.equal(result.data.provider, "local");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/media/storage/status"));
  // Public read — no Authorization header is attached.
  assert.equal(calls[0].options.headers?.Authorization, undefined);
  const text = JSON.stringify(result.data);
  assert.ok(!text.includes("AWS_SECRET_ACCESS_KEY"));
  assert.ok(!/[A-Za-z]:\\\\/.test(text));
});

test("reference resolution is delegated to the backend, never done locally", async () => {
  const calls = mockFetch({
    ok: true,
    total: 2,
    items: [
      { reference: LEGACY, status: "resolved", url: CANONICAL, objectKey: "products/PF-W-SAR-SIL-0001/primary.avif" },
      { reference: "/images/products/NOT-MIGRATED/01.avif", status: "legacy-fallback", url: "/images/products/NOT-MIGRATED/01.avif", objectKey: "products/NOT-MIGRATED/01.avif" },
    ],
  });
  const result = await apiResolveMediaReferences([LEGACY, "/images/products/NOT-MIGRATED/01.avif"]);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].status, "resolved");
  assert.equal(result.items[1].status, "legacy-fallback");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.references, [LEGACY, "/images/products/NOT-MIGRATED/01.avif"]);
});

test("an empty resolution request makes no network call", async () => {
  const calls = mockFetch({ ok: true, items: [] });
  const result = await apiResolveMediaReferences([]);
  assert.equal(result.ok, true);
  assert.equal(result.total, 0);
  assert.equal(calls.length, 0);
});

test("object metadata and product media set are real reads", async () => {
  const calls = mockFetch({ ok: true, object: { key: "products/PF-A/x.avif", size: 12 } });
  const meta = await apiGetMediaObjectMeta("products/PF-A/x.avif");
  assert.equal(meta.ok, true);
  assert.ok(calls[0].url.endsWith("/media/object-meta/products/PF-A/x.avif"));

  const set = await apiGetProductMediaSet("PF-W-SAR-SIL-0001");
  assert.equal(set.ok, true);
  assert.ok(calls[1].url.endsWith("/media/products/PF-W-SAR-SIL-0001/media-set"));

  assert.equal((await apiGetMediaObjectMeta("")).ok, false);
  assert.equal((await apiGetProductMediaSet("")).ok, false);
});

test("upload is multipart, admin-scoped, and sends no JSON content type", async () => {
  const calls = mockFetch({ ok: true, object: { key: "products/PF-A/x.avif", url: CANONICAL } });
  const file = new File([new Uint8Array([1, 2, 3])], "x.avif", { type: "image/avif" });
  const result = await apiUploadMediaObject(file, { productId: "PF-A" });
  assert.equal(result.ok, true);
  assert.equal(result.object.key, "products/PF-A/x.avif");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  assert.ok(calls[0].options.body instanceof FormData);
  assert.equal(calls[0].options.headers["Content-Type"], undefined);
  assert.equal(calls[0].options.body.get("productId"), "PF-A");
  assert.equal(calls[0].options.body.get("namespace"), "products");
});

test("product-scoped upload posts to the product route", async () => {
  const calls = mockFetch({ ok: true, object: { key: "products/PF-A/x.avif" } });
  const file = new File([new Uint8Array([1])], "x.avif", { type: "image/avif" });
  const result = await apiUploadProductMediaObject("PF-A", file);
  assert.equal(result.ok, true);
  assert.ok(calls[0].url.endsWith("/media/products/PF-A/objects"));
  assert.equal((await apiUploadProductMediaObject("", file)).ok, false);
  assert.equal((await apiUploadMediaObject(null)).ok, false);
});

test("delete targets one named object through the admin scope", async () => {
  const calls = mockFetch({ ok: true, deleted: true });
  const result = await apiDeleteMediaObject("products/PF-A/x.avif");
  assert.equal(result.ok, true);
  assert.equal(calls[0].options.method, "DELETE");
  assert.ok(calls[0].url.endsWith("/media/objects/products/PF-A/x.avif"));
  assert.equal((await apiDeleteMediaObject("")).ok, false);
});

test("upload failures surface the server message, never a fake success", async () => {
  mockFetch(jsonResponse({ success: false, error: { code: "FORBIDDEN", message: "Missing required permission: media.upload" } }, 403));
  const file = new File([new Uint8Array([1])], "x.avif", { type: "image/avif" });
  const result = await apiUploadMediaObject(file, { productId: "PF-A" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /media\.upload/);
});

test("the media register is now real HTTP; only marketing remains a BACKEND_GAP", async () => {
  // Phase 7 deliberately supersedes the Phase 6 blocker: the register is a
  // real endpoint family. `apiListMedia` must make a real request now.
  const calls = mockFetch({ ok: true, items: [] });
  const listed = await apiListMedia();
  assert.equal(calls.length, 1, "the register is live — it must call the server");
  assert.match(String(calls[0].url), /\/media\/assets$/);
  assert.equal(listed.ok, true);
  assert.deepEqual(listed.items, []);

  // The marketing family stays an honest gap — no request, explicit code.
  calls.length = 0;
  for (const call of [apiListMarketingMedia]) {
    const result = await call();
    assert.equal(result.ok, false);
    assert.equal(result.code, "BACKEND_GAP");
    assert.match(result.error, /marketing/i);
  }
  assert.equal(calls.length, 0, "a blocked MARKETING call must not make a request");
  assert.match(MARKETING_MEDIA_BLOCKER, /marketing/i);
  assert.match(MARKETING_MEDIA_BLOCKER, /Product-media registration is live/);
});

// ===========================================================================
// 5. No fabricated media anywhere
// ===========================================================================

test("the shared image renderer resolves through one seam and never fabricates", () => {
  const component = src("src/components/PratikshyaImage.jsx");
  assert.ok(component.includes("normalizeMediaReference"));
  // No invented fallback artwork and no other product's plate.
  assert.ok(!/placeholder\.(png|jpe?g|webp|avif)/i.test(component));
  assert.ok(!component.includes("categoryFallbacks"));
  assert.ok(!/onError=\{[^}]*src\s*=\s*["'][^"']+["']/i.test(component));
});

test("no product surface builds a media path from a slug or an id", () => {
  const offenders = [];
  const pattern = /["'`]\/images\/\$\{/;
  for (const relative of [
    "src/services/catalog/catalogStore.js",
    "src/services/media/mediaPaths.js",
    "src/services/media/productMediaSource.js",
    "src/services/api/productsApi.js",
    "src/services/api/mediaApi.js",
    "src/components/PratikshyaImage.jsx",
    "src/components/product/ProductGallery.jsx",
    "src/components/product/ProductPreview.jsx",
    "src/pages/admin/AdminProductDetail.jsx",
  ]) {
    if (pattern.test(src(relative))) offenders.push(relative);
  }
  assert.deepEqual(offenders, [], `these files derive image paths: ${offenders.join(", ")}`);
});

test("media bytes and media metadata are never written to browser storage", () => {
  const layer = [
    src("src/services/media/mediaPaths.js"),
    src("src/services/api/mediaApi.js"),
  ].join("\n");
  assert.ok(!/localStorage\.(set|remove)Item/.test(layer));
  assert.ok(!/sessionStorage\.(set|remove)Item/.test(layer));

  // The transport layer touches localStorage for TOKENS only — the media
  // layer adds no new browser-side persistence.
  const client = src("src/services/api/apiClient.js");
  const writes = [...client.matchAll(/localStorage\.(setItem|removeItem)\(([^)]*)\)/g)]
    .map((m) => m[2]);
  assert.ok(writes.length > 0);
  for (const args of writes) {
    assert.match(args, /keys\.(ACCESS|REFRESH)|keys\.ACCESS|keys\.REFRESH|s\)/);
  }
  assert.ok(!/localStorage\.setItem\([^)]*(media|image|object|upload)/i.test(client));
});

test("the admin upload form drives the real product pipeline and keeps marketing honest", () => {
  const form = src("src/components/media/MediaUploadForm.jsx");
  // Marketing scope still states the real backend gap instead of succeeding.
  assert.ok(form.includes("MARKETING_MEDIA_BLOCKER"));
  // Product scope is the real Phase 7 pipeline, not a simulation.
  assert.ok(form.includes("uploadAndRegisterProductImages"));
  assert.ok(form.includes("syncProductMediaFromServer"));
  // No browser-only persistence of the upload either.
  assert.ok(!/localStorage\.setItem/.test(form));
});

test("the legacy public asset folder is untouched by the media layer", () => {
  // The migration is copy-based; the source of truth for the storefront
  // during the transition stays exactly where it is.
  assert.equal(LEGACY_PUBLIC_IMAGE_PREFIX, "/images/");
  assert.equal(CANONICAL_MEDIA_ROOT, "/images/products");
  const migration = repoSrc("backend/app/services/media/local_media_migration.py");
  assert.ok(migration.includes("read-only"));
  assert.ok(!/shutil\.(move|rmtree)/.test(migration));
  assert.ok(!/\.unlink\(|os\.remove/.test(migration));
});
