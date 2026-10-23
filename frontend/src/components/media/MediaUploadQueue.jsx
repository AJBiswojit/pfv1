import { CheckCircle2, Film, Image as ImageIcon, Trash2 } from "lucide-react";
import {
  MEDIA_TYPES,
  formatFileSize,
  rolesForType,
} from "../../config/mediaTypes";
import { PRODUCT_MEDIA_STAGES } from "../../services/media/productMediaService";
import { cn } from "../../utils/cn";

const field =
  "w-full border border-mist bg-canvas px-2.5 py-1.5 font-ui text-xs text-ink outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:bg-surface/60 disabled:text-taupe";
const labelCls = "font-ui text-[9px] uppercase tracking-[.16em] text-taupe";

/** Stages after which the server owns the record — inputs become read-only. */
const LOCKED_STAGES = new Set([
  PRODUCT_MEDIA_STAGES.UPLOADING,
  PRODUCT_MEDIA_STAGES.UPLOADED,
  PRODUCT_MEDIA_STAGES.REGISTERING,
  PRODUCT_MEDIA_STAGES.ASSIGNED,
  PRODUCT_MEDIA_STAGES.UNCONFIRMED,
]);

const STAGE_COPY = {
  [PRODUCT_MEDIA_STAGES.SELECTED]: { text: "Ready", tone: "text-taupe" },
  [PRODUCT_MEDIA_STAGES.UPLOADING]: { text: "Uploading…", tone: "text-cocoa" },
  [PRODUCT_MEDIA_STAGES.UPLOADED]: { text: "Stored — assigning…", tone: "text-cocoa" },
  [PRODUCT_MEDIA_STAGES.REGISTERING]: { text: "Assigning…", tone: "text-cocoa" },
  [PRODUCT_MEDIA_STAGES.ASSIGNED]: { text: "Registered & assigned", tone: "text-pf-success" },
  [PRODUCT_MEDIA_STAGES.UNCONFIRMED]: { text: "Not confirmed — verifying", tone: "text-pf-warning" },
  [PRODUCT_MEDIA_STAGES.FAILED]: { text: "Failed", tone: "text-pf-error" },
};

/**
 * The queue: one row per file, with the metadata that will travel WITH the
 * file on its upload request.
 *
 * Three truths this component keeps:
 *   · there is no caption field — the backend has no caption column, so a
 *     caption input could only ever be collected and thrown away;
 *   · once a file's bytes have left the browser the server owns its metadata
 *     (`title` / `alt_text` are create-only), so the row freezes and says so;
 *   · "awaiting confirmation" is not "failed" — an unanswered request may have
 *     succeeded, and the row keeps that distinction visible.
 */
export default function MediaUploadQueue({
  queue,
  onRemoveItem,
  onUpdateItem,
  onClearQueue,
  isProductMedia = true,
  disabled = false,
}) {
  if (!queue.length) return null;

  const locked = (item) => LOCKED_STAGES.has(item?.stage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-mist/80 pb-2">
        <div className="flex items-center gap-2">
          <h4 className="font-ui text-xs font-semibold uppercase tracking-[.16em] text-ink">
            Upload Queue
          </h4>
          <span className="rounded-full bg-ink px-2 py-0.5 font-ui text-[10px] font-medium text-ivory">
            {queue.length} {queue.length === 1 ? "file" : "files"}
          </span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onClearQueue}
          className="font-ui text-[11px] uppercase tracking-wider text-taupe underline-offset-4 hover:text-accent hover:underline disabled:opacity-50"
        >
          Clear all
        </button>
      </div>

      <ul className="space-y-3" aria-label="Selected upload files">
        {queue.map((item, index) => {
          const isVid = item.type === MEDIA_TYPES.VIDEO;
          const roles = rolesForType(item.type);
          const stage = item.stage ?? PRODUCT_MEDIA_STAGES.SELECTED;
          const copy = STAGE_COPY[stage] ?? { text: `${stage}…`, tone: "text-taupe" };
          const isLocked = locked(item);
          const stageMessage =
            item.stageMessage ||
            (stage === PRODUCT_MEDIA_STAGES.FAILED ? "the server rejected the request" : "");
          const busy =
            stage === PRODUCT_MEDIA_STAGES.UPLOADING ||
            stage === PRODUCT_MEDIA_STAGES.UPLOADED ||
            stage === PRODUCT_MEDIA_STAGES.REGISTERING;

          return (
            <li
              key={item.key}
              className={cn(
                "border bg-surface/40 p-3 transition-colors hover:bg-surface/70",
                stage === PRODUCT_MEDIA_STAGES.FAILED ? "border-pf-error/40" : "border-mist/90"
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                {/* Thumbnail & Badges */}
                <div className="relative h-24 w-24 shrink-0 overflow-hidden border border-mist bg-canvas-deep">
                  {isVid ? (
                    <video
                      src={item.previewUrl}
                      preload="metadata"
                      muted
                      controls={false}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src={item.previewUrl}
                      alt={item.alt || item.title || "Upload preview"}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span
                    className={cn(
                      "absolute bottom-1 left-1 flex items-center gap-1 px-1.5 py-0.5 font-ui text-[8px] font-medium uppercase tracking-wider",
                      isVid ? "bg-purple-950/80 text-purple-200" : "bg-ink/80 text-ivory"
                    )}
                  >
                    {isVid ? <Film size={9} /> : <ImageIcon size={9} />}
                    {item.type}
                  </span>
                </div>

                {/* Details & Metadata inputs */}
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-medium text-ink">
                        {item.file.name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 font-ui text-[10px] text-taupe">
                        <span>{formatFileSize(item.file.size)}</span>
                        <span aria-hidden="true">•</span>
                        <span
                          className={cn("inline-flex items-center gap-1 font-medium", copy.tone)}
                          role="status"
                        >
                          <CheckCircle2
                            size={11}
                            aria-hidden="true"
                            className={stage === PRODUCT_MEDIA_STAGES.FAILED ? "hidden" : ""}
                          />
                          {stage === PRODUCT_MEDIA_STAGES.FAILED
                            ? `Failed — ${stageMessage}`
                            : stage === PRODUCT_MEDIA_STAGES.UNCONFIRMED
                              ? `${copy.text}${stageMessage ? ` — ${stageMessage}` : ""}`
                              : copy.text}
                        </span>
                        <span aria-hidden="true">•</span>
                        <span>Asset #{index + 1}</span>
                        {item.mediaId ? (
                          <span className="font-mono text-[9px] text-charcoal/45">
                            #{String(item.mediaId).slice(0, 8)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => onRemoveItem(item.key)}
                      aria-label={`Remove ${item.file.name} from upload queue`}
                      className="p-1 text-taupe transition-colors hover:text-accent disabled:opacity-30"
                    >
                      <Trash2 size={16} strokeWidth={1.4} aria-hidden="true" />
                    </button>
                  </div>

                  {/* Real, per-file progress from actual stage events. */}
                  {busy || stage === PRODUCT_MEDIA_STAGES.ASSIGNED ? (
                    <div
                      className="h-1 w-full overflow-hidden bg-mist/60"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Number(item.progress) || 0}
                      aria-label={`Upload progress for ${item.file.name}`}
                    >
                      <div
                        className={cn(
                          "h-full transition-all duration-300",
                          stage === PRODUCT_MEDIA_STAGES.ASSIGNED ? "bg-pf-success" : "bg-accent"
                        )}
                        style={{ width: `${Number(item.progress) || 0}%` }}
                      />
                    </div>
                  ) : null}

                  {/* Form inputs for metadata */}
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <label htmlFor={`title-${item.key}`} className={labelCls}>
                        Title <span className="text-accent">*</span>
                      </label>
                      <input
                        id={`title-${item.key}`}
                        type="text"
                        value={item.title}
                        disabled={disabled || isLocked}
                        onChange={(e) => onUpdateItem(item.key, { title: e.target.value })}
                        placeholder="Asset title"
                        maxLength={160}
                        className={field}
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor={`alt-${item.key}`} className={labelCls}>
                        Alt text {isVid ? "(optional)" : <span className="text-accent">*</span>}
                      </label>
                      <input
                        id={`alt-${item.key}`}
                        type="text"
                        value={item.alt}
                        disabled={disabled || isLocked}
                        onChange={(e) => onUpdateItem(item.key, { alt: e.target.value })}
                        placeholder="Describe the image for screen readers"
                        maxLength={300}
                        aria-describedby={`alt-help-${item.key}`}
                        className={field}
                      />
                      <p id={`alt-help-${item.key}`} className="font-ui text-[9px] text-taupe">
                        Describe what is visible, not the product name again.
                      </p>
                    </div>

                    {isProductMedia ? (
                      <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                        <label htmlFor={`role-${item.key}`} className={labelCls}>
                          Media role <span className="text-accent">*</span>
                        </label>
                        <select
                          id={`role-${item.key}`}
                          value={item.role ?? ""}
                          disabled={disabled || isLocked}
                          onChange={(e) => onUpdateItem(item.key, { role: e.target.value })}
                          className={field}
                        >
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>

                  {isLocked ? (
                    <p className="font-ui text-[10px] leading-relaxed text-taupe">
                      {stage === PRODUCT_MEDIA_STAGES.ASSIGNED
                        ? "Stored and attached. Title and alt text are written when the file is stored, so they can no longer be edited here."
                        : stage === PRODUCT_MEDIA_STAGES.UNCONFIRMED
                          ? "This request ended without a server answer. Its details are locked until the product's media has been read back."
                          : "This file is already on its way to the server — its details can no longer be edited."}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
