/**
 * PRATIKSHYA FASHION — Product media lifecycle orchestration (Phase 7).
 *
 * THE awaited frontend door for the real product-media lifecycle:
 *
 *   browser file
 *     → POST /media/products/{id}/objects       (object + MediaAsset + association,
 *                                                one transaction, 201 after commit)
 *     → GET  /media/products/{id}/media-set     (authoritative read model)
 *     → GET  /admin/products/{id}               (server DTO refresh, never local projection)
 *     → publish through the existing gated workflow endpoints
 *
 * THE WRITE IS ONE REQUEST. The upload route already registers the asset and
 * assigns it to the product, and `title` / `alt_text` / `role` / `sort_order` /
 * `is_primary` are create-only server-side — so every operator choice travels
 * ON that request. An extra `/media/register` call was removed from this page
 * because it could only re-write values that were already correct, while its
 * failure was reported as an upload failure. `apiRegisterMediaObject` remains
 * exported for the callers that legitimately register a key without uploading
 * (e.g. re-attaching an object that already exists in storage).
 *
 * Honesty rules every caller can rely on:
 *
 *   · a file held only in the browser is NEVER described as uploaded —
 *     `stage: "uploading"` means the HTTP request is in flight, "uploaded"
 *     means the server confirmed it;
 *   · a rejection returns the server's own error message — no fake media ids
 *     are invented, minted or carried forward; this module never returns an
 *     id at all, because the upload response has none and the read model does;
 *   · a timeout / dropped connection / cancellation is `unconfirmed`, never
 *     `failed`: the write may have committed, so the caller reconciles against
 *     the media-set before saying anything about the file;
 *   · nothing here PATCHes registered media through the product contract;
 *   · nothing here touches localStorage, seeds, blobs or mock data.
 *
 * Ordering/primary state lives on the server in `media_product_media`; this
 * module re-reads the server truth instead of assuming the write.
 */

import {
  apiGetProductMediaSet,
  apiListProductMedia,
  apiRegisterMediaObject,
  apiUploadProductMediaObject,
} from "../api/mediaApi";
import { apiAdminGetProduct, apiEmployeeGetProduct } from "../api/productsApi";
import { upsertServerProducts } from "../catalogRepository";

/** The lifecycle vocabulary — the only states the UI may display. */
export const PRODUCT_MEDIA_STAGES = Object.freeze({
  SELECTED: "selected",
  UPLOADING: "uploading",
  UPLOADED: "uploaded",
  REGISTERING: "registering",
  ASSIGNED: "assigned",
  REFRESHED: "refreshed",
  PUBLISHED: "published",
  FAILED: "failed",
  /**
   * An outcome the server never answered for: the socket timed out, the
   * connection dropped, or the operator cancelled after the request had left
   * the browser. The write MAY have committed, so this is deliberately NOT
   * "failed" — it is reconciled against the authoritative media-set first.
   * Additive: no existing consumer switches on it.
   */
  UNCONFIRMED: "unconfirmed",
});

/** Human-honest label per stage — "Uploaded" is only ever post-server. */
export const PRODUCT_MEDIA_STAGE_LABELS = Object.freeze({
  [PRODUCT_MEDIA_STAGES.SELECTED]: "Selected",
  [PRODUCT_MEDIA_STAGES.UPLOADING]: "Uploading…",
  [PRODUCT_MEDIA_STAGES.UPLOADED]: "Stored in object storage",
  [PRODUCT_MEDIA_STAGES.REGISTERING]: "Registering…",
  [PRODUCT_MEDIA_STAGES.ASSIGNED]: "Assigned to product",
  [PRODUCT_MEDIA_STAGES.REFRESHED]: "Read from server",
  [PRODUCT_MEDIA_STAGES.PUBLISHED]: "Published",
  [PRODUCT_MEDIA_STAGES.FAILED]: "Failed",
  [PRODUCT_MEDIA_STAGES.UNCONFIRMED]: "Awaiting confirmation",
});

/** How a media request failed — drives copy, retry and recovery affordances. */
export const MEDIA_FAILURE_KINDS = Object.freeze({
  REJECTED: "rejected",
  COLLISION: "collision",
  TIMEOUT: "timeout",
  NETWORK: "network",
  CANCELLED: "cancelled",
  AUTH: "auth",
  SERVER: "server",
  UNKNOWN: "unknown",
});

/** The outcomes whose server state is genuinely unknown after the drop. */
export const AMBIGUOUS_MEDIA_FAILURES = Object.freeze([
  MEDIA_FAILURE_KINDS.TIMEOUT,
  MEDIA_FAILURE_KINDS.NETWORK,
  MEDIA_FAILURE_KINDS.CANCELLED,
]);

/**
 * One upload request is given this long before it is abandoned. The pending
 * write may still land server-side, which is why a timeout is reconciled
 * rather than reported as a failure.
 */
export const MEDIA_UPLOAD_TIMEOUT_MS = 180_000;

/**
 * Classify a failed media result from its HTTP status / client-side code.
 * Purely additive: it reads the canonical `handleError` shape.
 */
export function classifyMediaFailure(result = {}) {
  const status = Number(result?.status) || 0;
  const code = String(result?.code || "").toUpperCase();
  if (code === "TIMEOUT") return MEDIA_FAILURE_KINDS.TIMEOUT;
  if (code === "CANCELLED") return MEDIA_FAILURE_KINDS.CANCELLED;
  if (status === 409) return MEDIA_FAILURE_KINDS.COLLISION;
  if (status === 401 || status === 403) return MEDIA_FAILURE_KINDS.AUTH;
  if (status >= 500) return MEDIA_FAILURE_KINDS.SERVER;
  if (status === 0) {
    return result?.isNetworkError ? MEDIA_FAILURE_KINDS.NETWORK : MEDIA_FAILURE_KINDS.UNKNOWN;
  }
  if (status >= 400) return MEDIA_FAILURE_KINDS.REJECTED;
  return MEDIA_FAILURE_KINDS.UNKNOWN;
}

export const isAmbiguousMediaFailure = (result = {}) =>
  AMBIGUOUS_MEDIA_FAILURES.includes(classifyMediaFailure(result));

export const isTerminalMediaStage = (stage) =>
  stage === PRODUCT_MEDIA_STAGES.REFRESHED ||
  stage === PRODUCT_MEDIA_STAGES.PUBLISHED ||
  stage === PRODUCT_MEDIA_STAGES.FAILED;

/** Cover-role convention shared with the media manager UI. */
export const PRODUCT_MEDIA_COVER_ROLE = "COVER";

/**
 * Keep the canonical API failure fields intact while adding pipeline context.
 * This is deliberately propagation, not a second error-handling system: the
 * API adapters already normalise failures through `handleError`.
 */
const preserveMediaFailure = (result, context = {}) => ({
  ...result,
  ...context,
  ok: false,
  error: context.error ?? result?.error,
  status: result?.status ?? 0,
});

/**
 * The registered-media read model for one product, straight from
 * `GET /media/products/{id}/media-set`. Never synthesized locally.
 */
export async function getRegisteredProductMedia(productId, { scope = "none" } = {}) {
  // Batch 2 / 1A: pass the caller's session scope — staff are served DRAFT
  // media-sets by their token; the default public read resolves PUBLISHED
  // products only (anything else is a 404, like a missing product).
  const result = await apiGetProductMediaSet(productId, { scope });
  if (!result.ok) return preserveMediaFailure(result);
  const data = result.data ?? {};
  return {
    ok: true,
    items: data.mediaItems ?? [],
    mediaRecordsAvailable: Boolean(data.mediaRecordsAvailable),
    primary: data.primary ?? null,
    primaryMediaUrl: data.primaryMediaUrl ?? null,
    gallery: data.gallery ?? [],
  };
}

/**
 * Re-read registered media and the product DTO after a media mutation.
 *
 * Registered associations are already durable after `/media/register`; this
 * helper is deliberately read-only. The product GET is useful to reconcile
 * the shared cache and to expose the backend's registered-media DTO
 * projection to editor callers. It never derives a product patch and never
 * writes registered media through the product contract.
 */
export async function syncProductMediaFromServer(productId, { scope = "admin" } = {}) {
  const id = String(productId || "").trim();
  if (!id) return { ok: false, error: "No product id supplied.", status: 0 };

  const media = await getRegisteredProductMedia(id, { scope });
  if (!media.ok) return preserveMediaFailure(media, { stage: "read" });

  // Employee sessions read the staff-gated registered media-set only — the
  // admin product DTO refresh is admin-scoped by design and must not be
  // attempted with an employee token.
  if (scope === "employee") {
    return {
      ok: true,
      product: null,
      items: media.items,
      mediaRecordsAvailable: media.mediaRecordsAvailable,
      primary: media.primary,
      primaryMediaUrl: media.primaryMediaUrl,
      gallery: media.gallery,
      stage: PRODUCT_MEDIA_STAGES.REFRESHED,
    };
  }
  const fresh = await apiAdminGetProduct(id);
  if (!fresh.ok || !fresh.product) {
    return preserveMediaFailure(fresh, {
      error: fresh.error ?? "The product could not be re-read after media registration.",
      stage: "read",
      items: media.items,
    });
  }

  upsertServerProducts([fresh.product]);
  return {
    ok: true,
    product: fresh.product,
    items: media.items,
    mediaRecordsAvailable: media.mediaRecordsAvailable,
    primary: media.primary,
    primaryMediaUrl: media.primaryMediaUrl,
    gallery: media.gallery,
    stage: PRODUCT_MEDIA_STAGES.REFRESHED,
  };
}

/* ------------------------------------------------------------------ */
/* Reading the target before writing                                   */
/* ------------------------------------------------------------------ */

/**
 * What the upload surface must know about a product BEFORE it can accept a
 * file: the registered media it already has, and the product record whose
 * legacy `image` / `additional_images` columns decide the cover question.
 *
 * Read-only and tolerant: a product-record failure does not discard a good
 * media-set read (the set alone proves a registration already exists), while a
 * failed media-set read leaves the surface UNVERIFIED — and an unverified
 * product is blocked rather than written to blind.
 */
export async function loadProductMediaContext(productId, { scope = "admin" } = {}) {
  const id = String(productId || "").trim();
  if (!id) return { ok: false, error: "No product id supplied.", status: 0 };

  const mediaScope = scope === "employee" ? "employee" : "admin";
  const [media, record] = await Promise.all([
    getRegisteredProductMedia(id, { scope: mediaScope }),
    scope === "employee" ? apiEmployeeGetProduct(id) : apiAdminGetProduct(id),
  ]);

  if (!media.ok) {
    return {
      ok: false,
      verified: false,
      error: media.error ?? "The product's existing media could not be read.",
      status: media.status ?? 0,
      items: [],
      product: record?.ok ? record.product : null,
      productError: record?.ok ? null : record?.error ?? null,
    };
  }

  return {
    ok: true,
    verified: true,
    items: media.items ?? [],
    mediaRecordsAvailable: Boolean(media.mediaRecordsAvailable),
    primary: media.primary ?? null,
    primaryMediaUrl: media.primaryMediaUrl ?? null,
    product: record?.ok ? record.product : null,
    productError: record?.ok ? null : record?.error ?? "The product record could not be read.",
  };
}

/* ------------------------------------------------------------------ */
/* Planning helpers (pure — no HTTP, unit tested)                       */
/* ------------------------------------------------------------------ */

/** The next free display position, after every existing association. */
export function nextSortOrder(items = []) {
  const orders = (Array.isArray(items) ? items : [])
    .map((item) => item?.sortOrder)
    /* An absent / null position is UNKNOWN, not zero — it must not drag the
       maximum down and cause a collision with an existing slot. */
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return orders.length ? Math.max(...orders) + 1 : 0;
}

/** A product has a cover when a registered primary OR a legacy image exists. */
export function hasExistingCover(items = [], product = null) {
  const registered = Array.isArray(items) ? items : [];
  if (registered.some((item) => item?.isPrimary === true)) return true;
  return Boolean(product?.image);
}

/**
 * TRUE when the product's catalogue imagery exists ONLY in the legacy
 * `image` / `additional_images` columns and no registered media exists yet.
 *
 * This is the state that MEDIA-UPLOAD-004 is about: the first registration
 * makes the product DTO switch its `image` / `additionalImages` onto the
 * registered set, which is a catalogue-wide presentation change. Until that
 * projection question is resolved separately, the upload surface refuses to
 * take that first step rather than warn and proceed.
 *
 * An UNKNOWN product record is treated as unsafe unless the media-set proves
 * otherwise — the surface must not damage imagery it could not inspect.
 */
export function legacyCatalogueOnly(product, items = []) {
  const registered = Array.isArray(items) ? items : [];
  if (registered.length) return false;
  if (product == null) return true;
  const legacyCover = Boolean(product?.image);
  const legacyGallery = Array.isArray(product?.additionalImages)
    ? product.additionalImages.length > 0
    : false;
  return legacyCover || legacyGallery;
}

/**
 * Decide `is_primary` for one file in a batch.
 *
 *   · employees never request primacy — the server refuses it by policy;
 *   · an explicit operator choice always wins (the UI warns when a cover
 *     will be replaced);
 *   · otherwise the automatic rule is the house rule: only when the product
 *     has NO cover at all, and only for the first file of the batch.
 */
export function decidePrimary({
  isEmployee = false,
  requestCover = null,
  items = [],
  product = null,
  index = 0,
  fallbackIndex = 0,
} = {}) {
  if (isEmployee) return false;
  if (requestCover === true) return true;
  if (requestCover === false) return false;
  if (fallbackIndex < 0 || index !== fallbackIndex) return false;
  return !hasExistingCover(items, product);
}

/** Determinate progress from real per-file stage events (0–99 until the end). */
export function uploadProgressPercent(index, stage, total) {
  const size = Math.max(Number(total) || 1, 1);
  const position = Math.max(0, Number(index) || 0);
  const fraction =
    stage === PRODUCT_MEDIA_STAGES.ASSIGNED ||
    stage === PRODUCT_MEDIA_STAGES.FAILED ||
    stage === PRODUCT_MEDIA_STAGES.UNCONFIRMED
      ? 1
      : stage === PRODUCT_MEDIA_STAGES.UPLOADED
        ? 0.5
        : 0.1;
  const value = Math.round(((position + fraction) / size) * 100);
  return Math.min(99, Math.max(0, value));
}

const stemOf = (value = "") =>
  String(value || "")
    .replace(/\.[^./]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const leafOfKey = (key = "") => String(key || "").split("/").pop();

/**
 * Match each batch result to the association the server now holds.
 *
 * A confirmed upload matches by EXACT `objectKey`. An ambiguous one (timeout /
 * drop / cancel) is matched against the associations that appeared since the
 * pre-flight snapshot, using size + mime + a normalised filename stem. When
 * more than one candidate fits, the file stays unmatched — a guessed media id
 * is worse than an honest "verify this one".
 *
 * `before` / `after` are media-set item arrays. `results` are the per-file
 * results returned by `uploadAndRegisterProductImages`.
 */
export function matchReconciledItems({ before = [], after = [], results = [] } = {}) {
  const beforeItems = Array.isArray(before) ? before : [];
  const afterItems = Array.isArray(after) ? after : [];
  const resultList = Array.isArray(results) ? results : [];
  const knownIds = new Set(beforeItems.map((item) => String(item?.mediaId ?? "")));
  const claimed = new Set();
  const fresh = afterItems.filter((item) => {
    const id = String(item?.mediaId ?? "");
    return id && !knownIds.has(id);
  });

  return resultList.map((result) => {
    const objectKey = result?.objectKey ? String(result.objectKey) : "";
    if (objectKey) {
      const exact = afterItems.find((item) => String(item?.objectKey ?? "") === objectKey);
      if (exact && !claimed.has(String(exact.mediaId))) {
        claimed.add(String(exact.mediaId));
        return { matched: true, ...exact };
      }
    }
    if (!result?.uncertain) return { matched: false };

    const size = Number(result?.fileSize);
    const mime = String(result?.mimeType || "").toLowerCase();
    const stem = stemOf(result?.fileName);
    const candidates = fresh.filter((item) => {
      if (claimed.has(String(item?.mediaId))) return false;
      if (Number.isFinite(size) && size > 0 && Number(item?.fileSize) !== size) return false;
      if (mime && item?.mimeType && String(item.mimeType).toLowerCase() !== mime) return false;
      return true;
    });
    const narrowed = stem
      ? candidates.filter((item) => stemOf(leafOfKey(item?.objectKey)) === stem)
      : [];
    const pool = narrowed.length ? narrowed : candidates;
    if (pool.length !== 1) return { matched: false };
    claimed.add(String(pool[0].mediaId));
    return { matched: true, ...pool[0] };
  });
}

/* ------------------------------------------------------------------ */
/* The write                                                           */
/* ------------------------------------------------------------------ */

/**
 * Upload ONE image for a product — THE single write.
 *
 * `POST /media/products/{id}/objects` stores the object and creates the
 * asset + association in one committed transaction, so this module sends the
 * operator's metadata WITH the file and does not follow it with a second
 * `/media/register` call. A 201 therefore means "stored and assigned"; the
 * media id arrives from the authoritative read that follows the batch.
 *
 * `onStage(stage, payload)` is invoked at each real transition so the UI can
 * render "Uploading… → Assigned to product" without inventing a state the
 * server has not confirmed. A timeout / dropped connection / cancellation
 * reports `unconfirmed` (the write may have landed) — never `failed`.
 *
 * Returns `{ ok, media, assignment, objectKey, error, stage, failureKind,
 * uncertain }`. `media` is always null here: the id comes from the read model.
 */
export async function uploadAndRegisterProductImage(
  productId,
  file,
  {
    role = null,
    sortOrder = null,
    isPrimary = false,
    title = null,
    altText = null,
    scope = "admin",
    onStage = null,
    signal = null,
    timeoutMs = MEDIA_UPLOAD_TIMEOUT_MS,
    replaceExisting = false,
  } = {}
) {
  const id = String(productId || "").trim();
  if (!id) return { ok: false, error: "No product id supplied.", status: 0, stage: PRODUCT_MEDIA_STAGES.FAILED };
  if (!file) return { ok: false, error: "No file selected.", status: 0, stage: PRODUCT_MEDIA_STAGES.FAILED };

  const report = (stage, extra = {}) => {
    try {
      onStage?.(stage, extra);
    } catch {
      /* a UI progress listener must never break the pipeline */
    }
  };

  /* Employee primacy is refused by the server; never send it. */
  const wantsPrimary = scope === "employee" ? false : isPrimary === true;

  const meta = { fileSize: Number(file.size) || null, mimeType: String(file.type || "") };

  report(PRODUCT_MEDIA_STAGES.UPLOADING);
  const uploaded = await apiUploadProductMediaObject(id, file, {
    scope,
    role,
    sortOrder,
    isPrimary: wantsPrimary,
    title,
    altText,
    replaceExisting,
    signal,
    timeoutMs,
  });

  if (!uploaded.ok) {
    const failureKind = classifyMediaFailure(uploaded);
    const uncertain = AMBIGUOUS_MEDIA_FAILURES.includes(failureKind);
    const stage = uncertain ? PRODUCT_MEDIA_STAGES.UNCONFIRMED : PRODUCT_MEDIA_STAGES.FAILED;
    const error = uncertain
      ? `${uploaded.error || "The request ended without a server answer."} The file may already be stored and attached — checking the product's media now.`
      : uploaded.error;
    report(stage, { step: "upload", error, kind: failureKind, uncertain });
    return preserveMediaFailure(uploaded, {
      stage,
      step: "upload",
      failureKind,
      uncertain,
      error,
      ...meta,
    });
  }

  const objectKey = uploaded.object?.key ?? null;
  report(PRODUCT_MEDIA_STAGES.UPLOADED, { objectKey });
  /* 201 is issued after the commit — the association is server-confirmed. */
  report(PRODUCT_MEDIA_STAGES.ASSIGNED, { objectKey });
  return {
    ok: true,
    media: null,
    assignment: null,
    objectKey,
    stage: PRODUCT_MEDIA_STAGES.ASSIGNED,
    ...meta,
  };
}

/**
 * Upload a batch of files for one product, sequentially and in order (their
 * numbering must match the display order the operator saw).
 *
 * Default behaviour is unchanged: abort on the first failure and return the
 * failed file's real server error, with the successes already in `results`.
 * `continueOnError: true` (the upload page) runs the whole batch so a partial
 * success can be summarised accurately. `signal` stops the loop as soon as the
 * operator cancels — unattempted files are simply left out of `results`.
 */
export async function uploadAndRegisterProductImages(productId, files, options = {}) {
  const list = Array.from(files ?? []);
  const results = [];
  const total = list.length;
  /* `options.sortOrder` is the batch's BASE position; each file takes the next
     slot after it so display order can never collapse onto one number. */
  const baseSortOrder = Number.isFinite(Number(options.sortOrder)) ? Number(options.sortOrder) : 0;
  for (let index = 0; index < total; index += 1) {
    if (options.signal?.aborted) {
      return { ok: false, cancelled: true, results, failedIndex: index };
    }
    const entry = list[index];
    const file = entry?.file ?? entry;
    const perFile = typeof options.perFile === "function" ? (options.perFile(entry, index) ?? {}) : {};
    const result = await uploadAndRegisterProductImage(productId, file, {
      ...options,
      role: perFile.role ?? entry?.role ?? options.role ?? null,
      sortOrder: perFile.sortOrder ?? entry?.sortOrder ?? baseSortOrder + index,
      isPrimary: perFile.isPrimary ?? (index === 0 && Boolean(options.firstIsPrimary)),
      replaceExisting: perFile.replaceExisting ?? Boolean(options.replaceExisting),
      title: perFile.title ?? entry?.title ?? null,
      // `alt` is the queue's field name; `altText` the API's. Accept both so
      // no surface can collect alt text and silently drop it.
      altText: perFile.altText ?? entry?.altText ?? entry?.alt ?? null,
      onStage: (stage, payload) =>
        options.onStage?.(file, stage, { ...payload, index, total, file }),
    });
    results.push({ fileName: file?.name ?? `file-${index + 1}`, index, ...result });
    if (!result.ok && !options.continueOnError) {
      return preserveMediaFailure(result, { results, failedIndex: index });
    }
  }
  const cancelled = Boolean(options.signal?.aborted);
  return {
    ok: results.length > 0 && results.every((result) => result.ok) && !cancelled,
    results,
    cancelled,
  };
}

/**
 * Promote one registered association to primary. The register endpoint
 * demotes every other association of the product in the same transaction;
 * the authoritative media-set and product DTO are then re-read.
 */
export async function setPrimaryProductMedia(productId, mediaItem, { scope = "admin" } = {}) {
  if (!mediaItem?.objectKey) {
    return { ok: false, error: "No registered media item supplied.", status: 0 };
  }
  const result = await apiRegisterMediaObject(mediaItem.objectKey, {
    productId,
    role: PRODUCT_MEDIA_COVER_ROLE,
    sortOrder: mediaItem.sortOrder ?? 0,
    isPrimary: true,
    scope,
  });
  if (!result.ok) return preserveMediaFailure(result);
  return syncProductMediaFromServer(productId, { scope });
}

/**
 * Persist a new display order (array of registered items in the order the
 * operator arranged them). Roles and primary state are preserved; only the
 * sort order is re-registered, then the authoritative read models are
 * re-read from the server.
 */
export async function reorderProductMedia(productId, orderedItems, { scope = "admin" } = {}) {
  const list = Array.isArray(orderedItems) ? orderedItems : [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    if (!item?.objectKey) return { ok: false, error: "Cannot reorder an unregistered item.", status: 0 };
    const result = await apiRegisterMediaObject(item.objectKey, {
      productId,
      role: item.role ?? "gallery",
      sortOrder: index,
      isPrimary: Boolean(item.isPrimary),
      scope,
    });
    if (!result.ok) return preserveMediaFailure(result);
  }
  return syncProductMediaFromServer(productId, { scope });
}

/** One move (up/down) expressed as a reorder of the full ordered list. */
export async function moveProductMedia(productId, items, mediaId, direction, options = {}) {
  const list = [...(items ?? [])];
  const index = list.findIndex((item) => String(item.mediaId) === String(mediaId));
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) {
    return { ok: false, error: "That media item cannot move further.", status: 0 };
  }
  [list[index], list[target]] = [list[target], list[index]];
  return reorderProductMedia(productId, list, options);
}

/* `apiListProductMedia` is re-exported so admin surfaces have ONE import. */
export { apiListProductMedia };

export default {
  PRODUCT_MEDIA_STAGES,
  PRODUCT_MEDIA_STAGE_LABELS,
  PRODUCT_MEDIA_COVER_ROLE,
  MEDIA_FAILURE_KINDS,
  MEDIA_UPLOAD_TIMEOUT_MS,
  isTerminalMediaStage,
  classifyMediaFailure,
  isAmbiguousMediaFailure,
  nextSortOrder,
  hasExistingCover,
  legacyCatalogueOnly,
  decidePrimary,
  uploadProgressPercent,
  matchReconciledItems,
  getRegisteredProductMedia,
  loadProductMediaContext,
  syncProductMediaFromServer,
  uploadAndRegisterProductImage,
  uploadAndRegisterProductImages,
  setPrimaryProductMedia,
  reorderProductMedia,
  moveProductMedia,
};
