/**
 * PRATIKSHYA FASHON — Server-backed product media manager (Phase 7).
 *
 * ONE reusable panel that runs the real product-media lifecycle against the
 * backend and renders ONLY what the server confirms:
 *
 *   choose image(s)              stage: selected   (browser-only, honestly
 *   Upload & register            stage: uploading → uploaded → registering
 *                                → assigned       (each transition is an
 *                                                  awaited server response)
 *   server associations confirmed stage: assigned  (then the authoritative
 *   media-set and product DTO are re-read from the server)
 *
 * Ordering/cover controls re-register through the idempotent register
 * endpoint and re-read the server state — the UI never reorders a local
 * array and calls it server truth.
 *
 * Server rule reminder: media upload/registration requires an admin with the
 * `media.upload` permission (server-enforced). A 401/403 is shown verbatim;
 * nothing is faked.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { AtelierButton } from "../../design-system";
import StatusBadge from "../employee/StatusBadge";
import {
  PRODUCT_MEDIA_STAGES as STAGES,
  PRODUCT_MEDIA_STAGE_LABELS as STAGE_LABELS,
  getRegisteredProductMedia,
  moveProductMedia,
  setPrimaryProductMedia,
  syncProductMediaFromServer,
  uploadAndRegisterProductImages,
} from "../../services/media/productMediaService";
import { resolveMediaUrl } from "../../services/media/mediaPaths";
import { validateFile } from "../../services/media/uploadValidation";
import {
  MEDIA_TYPES,
  UPLOAD_RULES,
  formatFileSize,
} from "../../config/mediaTypes";
import { cn } from "../../utils/cn";

const field =
  "w-full border border-mist bg-canvas px-2.5 py-1.5 font-ui text-[12px] text-ink outline-none focus:border-accent";

let queueKey = 0;
const nextKey = () => `pm-${Date.now()}-${(queueKey += 1)}`;

export default function ProductMediaManager({ productId, scope = "admin", onChange = null }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [items, setItems] = useState([]); // server truth only
  const [queue, setQueue] = useState([]); // browser-only selections (never shown as saved)
  const [fileErrors, setFileErrors] = useState([]);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const inputRef = useRef(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  useEffect(
    () => () => {
      queueRef.current.forEach((item) => {
        if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      });
    },
    []
  );

  const reload = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    const result = await getRegisteredProductMedia(productId);
    if (result.ok) {
      setItems(result.items ?? []);
      setLoadError(null);
    } else {
      setLoadError(result.error ?? "The product's registered media could not be loaded.");
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    reload();
  }, [reload]);

  /* ---------------------------------------------------------------- */
  /* Selection (browser-only until the server confirms otherwise)      */
  /* ---------------------------------------------------------------- */

  const accept = useCallback((fileList) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    const accepted = [];
    const rejected = [];
    files.forEach((file) => {
      const validation = validateFile(file);
      if (!validation.ok || validation.type !== MEDIA_TYPES.IMAGE) {
        rejected.push(
          validation.ok
            ? `"${file.name}" is a video — product image upload currently accepts still images.`
            : validation.error
        );
        return;
      }
      accepted.push({
        key: nextKey(),
        file,
        title: file.name.replace(/\.[^.]+$/, ""),
        alt: "",
        previewUrl: URL.createObjectURL(file),
        stage: STAGES.SELECTED,
        error: null,
      });
    });
    setQueue((current) => [...current, ...accepted]);
    setFileErrors(rejected);
  }, []);

  const discard = (key) => {
    setQueue((current) => {
      const target = current.find((item) => item.key === key);
      if (target?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  };

  const amend = (key, patch) =>
    setQueue((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const patchStage = (file, stage, payload) =>
    setQueue((current) =>
      current.map((item) =>
        item.file === file
          ? { ...item, stage, error: payload?.error ?? item.error ?? null }
          : item
      )
    );

  /* ---------------------------------------------------------------- */
  /* The real upload + registration pipeline                           */
  /* ---------------------------------------------------------------- */

  const uploadQueue = async () => {
    if (!queue.length || saving) return;
    setSaving(true);
    setNotice(null);

    const result = await uploadAndRegisterProductImages(productId, queue, {
      scope,
      firstIsPrimary: items.length === 0, // first-ever upload becomes the cover
      onStage: (file, stage, payload) => patchStage(file, stage, payload),
    });

    if (!result.ok) {
      // The failed item stays visible with the server's own error; the
      // ones that succeeded are re-read from the server below.
      setNotice({
        kind: "error",
        text: `Upload stopped: ${result.error} ${
          result.results?.some((r) => r.ok)
            ? "The files listed as assigned were uploaded and registered on the server; the authoritative media and product reads will be refreshed."
            : "Nothing was registered."
        }`,
      });
    }

    // Whatever the server accepted is now durable — re-read the authoritative
    // media-set and product DTO so the UI reflects server ordering.
    const anyAssigned = result.results?.some((r) => r.ok);
    if (anyAssigned) {
      queue.forEach((item) => {
        if (item.stage === STAGES.ASSIGNED) {
          if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
        }
      });
      setQueue((current) => current.filter((item) => item.stage !== STAGES.ASSIGNED));
      const synced = await syncProductMediaFromServer(productId, { scope });
      if (!synced.ok) {
        setNotice({
          kind: "error",
          text: `Media registered, but the authoritative product read failed on the server: ${synced.error}`,
        });
      } else {
        setNotice((current) =>
          current?.kind === "error"
            ? current
            : {
                kind: "ok",
                text: "Media registered and assigned — the authoritative media and product reads were refreshed.",
              }
        );
        onChange?.(synced.product ?? null);
      }
    }
    await reload();
    setSaving(false);
  };

  /* ---------------------------------------------------------------- */
  /* Server-state controls (cover / order)                             */
  /* ---------------------------------------------------------------- */

  const runServerAction = async (key, action) => {
    if (busyAction) return;
    setBusyAction(key);
    setNotice(null);
    const result = await action();
    if (result.ok) {
      onChange?.(result.product ?? null);
      await reload();
    } else {
      setNotice({ kind: "error", text: result.error });
    }
    setBusyAction(null);
  };

  const setCover = (item) =>
    runServerAction(`cover-${item.mediaId}`, () => setPrimaryProductMedia(productId, item, { scope }));

  const move = (item, direction) =>
    runServerAction(`move-${item.mediaId}`, () =>
      moveProductMedia(productId, items, item.mediaId, direction, { scope })
    );

  /* ---------------------------------------------------------------- */

  const imageRules = UPLOAD_RULES[MEDIA_TYPES.IMAGE];

  return (
    <div className="space-y-5">
      {/* Registered media — server truth ------------------------------- */}
      <div>
        <div className="flex items-center justify-between">
          <p className="font-ui text-[10px] uppercase tracking-[.18em] text-taupe">
            Registered product media (server)
          </p>
          <AtelierButton size="chip" variant="outline" onClick={reload} disabled={loading}>
            Refresh from server
          </AtelierButton>
        </div>

        {loading ? (
          <p className="mt-3 flex items-center gap-2 font-ui text-[12px] text-taupe">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Loading registered media…
          </p>
        ) : loadError ? (
          <p className="mt-3 border border-accent/40 bg-accent/[0.05] px-3 py-2 font-ui text-[12px] text-accent" role="alert">
            {loadError}
          </p>
        ) : items.length ? (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Registered product media">
            {items.map((item, index) => (
              <li key={item.mediaId} className="border border-mist/80 bg-canvas">
                <div className="relative">
                  <img
                    src={resolveMediaUrl(item.url)}
                    alt={item.altText || item.title || "Registered product media"}
                    className="h-40 w-full object-cover"
                    loading="lazy"
                  />
                  <span className="absolute left-2 top-2">
                    <StatusBadge
                      label={item.isPrimary ? "Primary · cover" : item.role}
                      tone={item.isPrimary ? "ink" : "quiet"}
                    />
                  </span>
                  <span className="absolute right-2 top-2 bg-ink/80 px-2 py-1 font-ui text-[9px] uppercase tracking-[.14em] text-ivory">
                    {index + 1}
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  <p className="truncate font-ui text-[11px] text-ink" title={item.objectKey}>
                    {item.title || item.objectKey}
                  </p>
                  <p className="truncate font-ui text-[10px] text-taupe">
                    {item.mimeType} · {item.url}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {!item.isPrimary ? (
                      <AtelierButton
                        size="chip"
                        variant="outline"
                        disabled={Boolean(busyAction)}
                        onClick={() => setCover(item)}
                      >
                        <Star size={11} aria-hidden="true" className="mr-1 inline" />
                        {busyAction === `cover-${item.mediaId}` ? "Setting…" : "Set cover"}
                      </AtelierButton>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Move earlier"
                      disabled={index === 0 || Boolean(busyAction)}
                      onClick={() => move(item, "up")}
                      className="border border-mist p-1.5 text-cocoa transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
                    >
                      <ArrowUp size={13} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move later"
                      disabled={index === items.length - 1 || Boolean(busyAction)}
                      onClick={() => move(item, "down")}
                      className="border border-mist p-1.5 text-cocoa transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
                    >
                      <ArrowDown size={13} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border border-dashed border-mist bg-surface/30 px-4 py-6 text-center font-ui text-[12px] text-taupe">
            No registered media yet. Upload below — each file is stored in object storage,
            registered as a durable asset, assigned to this product and then served through the
            authoritative media-set and product read APIs.
          </p>
        )}
      </div>

      {/* Upload queue — browser state, honestly labelled ------------------ */}
      <div className="border-t border-mist/70 pt-4">
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!saving) accept(event.dataTransfer.files);
          }}
          className={cn(
            "border border-dashed px-5 py-6 text-center transition-colors",
            "border-mist bg-surface/30",
            saving && "opacity-50"
          )}
        >
          <UploadCloud size={20} strokeWidth={1.3} className="mx-auto text-taupe" aria-hidden="true" />
          <p className="mt-2 font-ui text-sm text-ink">Add images to this product.</p>
          <p className="mt-1 font-ui text-[11px] text-taupe">
            {imageRules.extensions.join(" ")} up to {imageRules.maxLabel}
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={imageRules.extensions.join(",")}
            disabled={saving}
            onChange={(event) => {
              accept(event.target.files);
              event.target.value = "";
            }}
            className="sr-only"
            aria-label="Choose product image files"
          />
          <AtelierButton
            size="chip"
            variant="outline"
            className="mt-3"
            disabled={saving}
            onClick={() => inputRef.current?.click()}
          >
            Choose images
          </AtelierButton>
        </div>

        {fileErrors.length ? (
          <ul role="alert" className="mt-3 space-y-1 border border-accent/40 bg-accent/[0.05] px-4 py-3">
            {fileErrors.map((error) => (
              <li key={error} className="font-ui text-[12px] text-accent">{error}</li>
            ))}
          </ul>
        ) : null}

        {queue.length ? (
          <ul className="mt-3 space-y-3" aria-label="Upload queue">
            {queue.map((item) => (
              <li key={item.key} className="flex flex-col gap-3 border border-mist/80 bg-surface/30 p-3 sm:flex-row">
                <div className="h-20 w-20 shrink-0 overflow-hidden bg-canvas-deep">
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-ui text-[11px] text-taupe">
                        {item.file.name} · {formatFileSize(item.file.size)}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 flex items-center gap-1.5 font-ui text-[11px]",
                          item.stage === STAGES.FAILED
                            ? "text-accent"
                            : item.stage === STAGES.ASSIGNED
                              ? "text-emerald-700"
                              : "text-taupe"
                        )}
                        aria-live="polite"
                      >
                        {item.stage === STAGES.FAILED ? (
                          <AlertCircle size={12} aria-hidden="true" />
                        ) : item.stage === STAGES.SELECTED ? (
                          <span className="inline-block h-2 w-2 rounded-full border border-taupe" aria-hidden="true" />
                        ) : item.stage === STAGES.ASSIGNED ? (
                          <CheckCircle2 size={12} aria-hidden="true" />
                        ) : (
                          <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                        )}
                        {item.stage === STAGES.FAILED
                          ? `Failed: ${item.error ?? "the server refused this file"}`
                          : STAGE_LABELS[item.stage] ?? item.stage}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => discard(item.key)}
                      disabled={saving && item.stage !== STAGES.FAILED && item.stage !== STAGES.SELECTED}
                      aria-label={`Remove ${item.file.name} from the queue`}
                      className="text-taupe transition-colors hover:text-accent disabled:opacity-40"
                    >
                      <Trash2 size={15} strokeWidth={1.4} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="sr-only">Title</span>
                      <input
                        value={item.title}
                        disabled={saving || item.stage !== STAGES.SELECTED}
                        onChange={(event) => amend(item.key, { title: event.target.value })}
                        placeholder="Title"
                        className={field}
                      />
                    </label>
                    <label className="block">
                      <span className="sr-only">Alt text</span>
                      <input
                        value={item.alt}
                        disabled={saving || item.stage !== STAGES.SELECTED}
                        onChange={(event) => amend(item.key, { alt: event.target.value })}
                        placeholder="Alt text"
                        className={field}
                      />
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {queue.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <AtelierButton size="chip" onClick={uploadQueue} disabled={saving}>
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Working…
                </span>
              ) : (
                "Upload & register"
              )}
            </AtelierButton>
            <AtelierButton
              size="chip"
              variant="outline"
              disabled={saving}
              onClick={() => {
                queue.forEach((item) => {
                  if (item.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
                });
                setQueue([]);
                setFileErrors([]);
              }}
            >
              Clear queue
            </AtelierButton>
          </div>
        ) : null}
      </div>

      {notice ? (
        <p
          aria-live="polite"
          className={cn(
            "border px-4 py-3 font-ui text-[12px]",
            notice.kind === "error"
              ? "border-accent/40 bg-accent/[0.05] text-accent"
              : "border-mist/80 bg-canvas text-ink"
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <p className="font-ui text-[11px] leading-relaxed text-taupe">
        Until a file reaches “Assigned to product”, it exists only in this browser and is never
        presented as media. Registration and assignment are real database rows, confirmed by
        the server; after registration, the authoritative media-set and product DTO are
        re-fetched rather than projected from local state.
      </p>
    </div>
  );
}
