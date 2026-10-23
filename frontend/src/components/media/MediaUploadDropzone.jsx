import { useRef, useState } from "react";
import { Image as ImageIcon, UploadCloud } from "lucide-react";
import { AtelierButton } from "../../design-system";
import { MEDIA_TYPES, UPLOAD_ACCEPT, UPLOAD_LIMITS, UPLOAD_RULES } from "../../config/mediaTypes";
import { cn } from "../../utils/cn";
import { extensionOf, typeOfFile, validateFile } from "../../services/media/uploadValidation";

export { extensionOf, typeOfFile, validateFile };

export const titleFromFileName = (name = "") => {
  const stem = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : "Untitled asset";
};

/**
 * The file chooser / drop target.
 *
 * `compact` is used once files are queued: the same control stays available
 * (drag-and-drop keeps working) but stops reserving a third of the screen for
 * a step the operator has already completed.
 *
 * The `id` on the input is the anchor the page's "Select Files" label points
 * at, so clicking that label opens the picker like any other form control.
 *
 * NOTE (MEDIA-UPLOAD-027 / F2): `dragleave` fires on the container every time
 * the pointer crosses INTO one of its children, because the child's own
 * `dragleave` bubbles up. Clearing the highlight on those events made the
 * drop target flicker. The handler now ignores a leave whose `relatedTarget`
 * is still inside the container, so the highlight is cleared only when the
 * pointer really leaves the dropzone.
 */
export default function MediaUploadDropzone({
  onFilesSelected,
  disabled = false,
  compact = false,
  className = "",
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDragOver = (event) => {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    // Containment guard: a `dragleave` whose destination is still inside the
    // dropzone is a child-to-child move, not the pointer leaving. Ignoring it
    // keeps the highlight stable; a real exit still clears it.
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    if (event.dataTransfer?.files?.length) {
      onFilesSelected(event.dataTransfer.files);
    }
  };

  const handleChange = (event) => {
    if (event.target?.files?.length) {
      onFilesSelected(event.target.files);
      event.target.value = "";
    }
  };

  const rules = UPLOAD_RULES[MEDIA_TYPES.IMAGE];
  const extensions = rules.extensions.map((ext) => ext.replace(".", "").toUpperCase()).join(", ");

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center border-2 border-dashed text-center transition-all duration-200",
        compact ? "gap-2 p-4 sm:flex-row sm:justify-between sm:text-left" : "p-6 sm:p-8",
        isDragging
          ? "border-accent bg-accent/[0.08] shadow-inner"
          : "border-mist/90 bg-surface/40 hover:border-ink/40 hover:bg-surface/70",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      <div className={cn("flex items-center gap-3", compact ? "" : "flex-col")}>
        <div
          className={cn(
            "flex items-center justify-center rounded-full border border-mist bg-canvas shadow-sm",
            compact ? "h-9 w-9" : "h-14 w-14"
          )}
        >
          <UploadCloud
            size={compact ? 17 : 26}
            strokeWidth={1.4}
            className="text-accent"
            aria-hidden="true"
          />
        </div>
        <div className={compact ? "" : "mt-1"}>
          <h3
            className={cn(
              "font-display font-normal tracking-wide text-ink",
              compact ? "text-sm" : "mt-2 text-base sm:text-lg"
            )}
          >
            {compact ? "Add more files" : "Drag & drop files here"}
          </h3>
          <p className="mt-0.5 font-ui text-xs text-taupe">
            {compact
              ? "Drop them here, or browse from your device."
              : "or use the button below to browse from your device"}
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
        id="media-file-input"
        aria-label="Browse and upload images"
      />

      <div className={cn("flex flex-wrap items-center justify-center gap-3", compact ? "" : "mt-4")}>
        <AtelierButton
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="border-ink/60 bg-canvas text-ink hover:bg-ink hover:text-ivory"
        >
          Browse Files
        </AtelierButton>
      </div>

      {compact ? null : (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-mist/60 pt-4 font-ui text-[11px] text-taupe">
          <span className="inline-flex items-center gap-1.5">
            <ImageIcon size={13} className="text-cocoa" aria-hidden="true" />
            <span>
              <strong>Images:</strong> {extensions} (up to {rules.maxLabel} each)
            </span>
          </span>
          <span className="rounded border border-mist bg-canvas px-2 py-0.5 text-[10px] uppercase tracking-wider text-taupe">
            Up to {UPLOAD_LIMITS.MAX_FILES_PER_BATCH} files per upload
          </span>
          <span className="text-[10px] text-taupe">
            Longest side ≤ {UPLOAD_LIMITS.MAX_IMAGE_DIMENSION_PX.toLocaleString("en-IN")} px,
            ≤ {(UPLOAD_LIMITS.MAX_IMAGE_PIXELS / 1_000_000).toLocaleString("en-IN")} MP
          </span>
        </div>
      )}
    </div>
  );
}
