/**
 * PRATIKSHYA FASHON — Product media lifecycle orchestration (Phase 7).
 *
 * THE awaited frontend door for the real product-media lifecycle:
 *
 *   browser file
 *     → POST /media/products/{id}/objects       (real object in storage)
 *     → POST /media/register                    (MediaAsset + ProductMedia rows)
 *     → GET  /media/products/{id}/media-set     (authoritative read model)
 *     → GET  /admin/products/{id}               (server DTO refresh, never local projection)
 *     → publish through the existing gated workflow endpoints
 *
 * Honesty rules every caller can rely on:
 *
 *   · a file held only in the browser is NEVER described as uploaded —
 *     `stage: "uploading"` means the HTTP request is in flight, "uploaded"
 *     means the server confirmed it;
 *   · a registration failure returns the server's own error message — no
 *     fake media ids are invented, minted or carried forward;
 *   · registered media is considered complete after /media/register confirms
 *     the association; the follow-up product GET is read-only reconciliation;
 *   · nothing here PATCHes registered media through the product contract;
 *   · nothing here touches localStorage, seeds, blobs or mock data.
 *
 * Ordering/primary state lives on the server in `media_product_media`; this
 * module re-registers through the idempotent register endpoint and then
 * re-reads the server truth instead of assuming the write.
 */

import {
  apiGetProductMediaSet,
  apiListProductMedia,
  apiRegisterMediaObject,
  apiUploadProductMediaObject,
} from "../api/mediaApi";
import { apiAdminGetProduct } from "../api/productsApi";
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
});

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
export async function getRegisteredProductMedia(productId) {
  const result = await apiGetProductMediaSet(productId);
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

  const media = await getRegisteredProductMedia(id);
  if (!media.ok) return preserveMediaFailure(media, { stage: "read" });

  // `scope` remains part of the compatibility signature for current callers;
  // product DTO refreshes are admin-scoped by the canonical API layer.
  void scope;
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

/**
 * Upload ONE image for a product and register/assign it.
 *
 * `onStage(stage, payload)` is invoked at each real transition so the UI can
 * render "Uploading… → Registering… → Assigned to product" without ever
 * inventing a state the server has not confirmed.
 *
 * Returns `{ ok, media, assignment, objectKey, error, stage }`. On failure
 * `ok` is false and `error` is the server's own message.
 */
export async function uploadAndRegisterProductImage(
  productId,
  file,
  {
    role = "gallery",
    sortOrder = 0,
    isPrimary = false,
    title = null,
    altText = null,
    scope = "admin",
    onStage = null,
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

  report(PRODUCT_MEDIA_STAGES.UPLOADING);
  const uploaded = await apiUploadProductMediaObject(id, file);
  if (!uploaded.ok) {
    report(PRODUCT_MEDIA_STAGES.FAILED, { step: "upload", error: uploaded.error });
    return preserveMediaFailure(uploaded, {
      stage: PRODUCT_MEDIA_STAGES.FAILED,
      step: "upload",
    });
  }
  const objectKey = uploaded.object?.key ?? null;
  report(PRODUCT_MEDIA_STAGES.UPLOADED, { objectKey });

  report(PRODUCT_MEDIA_STAGES.REGISTERING, { objectKey });
  const registered = await apiRegisterMediaObject(objectKey, {
    productId: id,
    role,
    sortOrder,
    isPrimary,
    title,
    altText,
    scope,
  });
  if (!registered.ok) {
    report(PRODUCT_MEDIA_STAGES.FAILED, { step: "register", error: registered.error });
    return preserveMediaFailure(registered, {
      stage: PRODUCT_MEDIA_STAGES.FAILED,
      step: "register",
      objectKey,
    });
  }

  report(PRODUCT_MEDIA_STAGES.ASSIGNED, {
    objectKey,
    media: registered.media,
    assignment: registered.assignment,
  });
  return {
    ok: true,
    media: registered.media,
    assignment: registered.assignment,
    objectKey,
    stage: PRODUCT_MEDIA_STAGES.ASSIGNED,
  };
}

/**
 * Upload + register a batch of files for one product, sequentially and in
 * order (their numbering must match the display order the operator saw).
 *
 * Abort-on-failure: the first failure stops the batch — the failed file's
 * real server error is returned and NO later file is silently skipped into
 * a pretend success. Files processed before the failure are really on the
 * server; callers sync the product afterwards so server state and UI agree.
 */
export async function uploadAndRegisterProductImages(productId, files, options = {}) {
  const list = Array.from(files ?? []);
  const results = [];
  const total = list.length;
  for (let index = 0; index < total; index += 1) {
    const entry = list[index];
    const file = entry?.file ?? entry;
    const perFile = typeof options.perFile === "function" ? (options.perFile(entry, index) ?? {}) : {};
    const result = await uploadAndRegisterProductImage(productId, file, {
      ...options,
      role: perFile.role ?? entry?.role ?? options.role,
      sortOrder: perFile.sortOrder ?? index,
      isPrimary: perFile.isPrimary ?? (index === 0 && Boolean(options.firstIsPrimary)),
      title: perFile.title ?? entry?.title ?? null,
      altText: perFile.altText ?? entry?.altText ?? null,
      onStage: (stage, payload) =>
        options.onStage?.(file, stage, { ...payload, index, total, file }),
    });
    results.push({ fileName: file?.name ?? `file-${index + 1}`, ...result });
    if (!result.ok) {
      return preserveMediaFailure(result, { results, failedIndex: index });
    }
  }
  return { ok: true, results };
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
  isTerminalMediaStage,
  getRegisteredProductMedia,
  syncProductMediaFromServer,
  uploadAndRegisterProductImage,
  uploadAndRegisterProductImages,
  setPrimaryProductMedia,
  reorderProductMedia,
  moveProductMedia,
};
