import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { AtelierButton } from "../../design-system";
import MediaUploadDropzone, { titleFromFileName, validateFile } from "./MediaUploadDropzone";
import MediaUploadQueue from "./MediaUploadQueue";
import MediaProductSelector from "./MediaProductSelector";
import MediaPlacementSelector from "./MediaPlacementSelector";
import ConfirmDialog from "../orders/ConfirmDialog";
import {
  DEFAULT_PRODUCT_UPLOAD_ROLE,
  MARKETING_PLACEMENTS,
  MEDIA_SCOPES,
  MEDIA_TYPES,
  PRODUCT_MEDIA_ROLES,
  UPLOAD_LIMITS,
  formatFileSize,
  rolesForType,
} from "../../config/mediaTypes";
import { PERMISSIONS } from "../../config/employeePermissions";
import useMediaActions from "../../hooks/useMediaActions";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import catalogRepository from "../../services/catalogRepository";
import { MARKETING_MEDIA_BLOCKER } from "../../services/api/mediaApi";
import { fileSignature } from "../../services/media/uploadValidation";
import {
  MEDIA_UPLOAD_TIMEOUT_MS,
  PRODUCT_MEDIA_STAGES,
  decidePrimary,
  hasExistingCover,
  legacyCatalogueOnly,
  loadProductMediaContext,
  matchReconciledItems,
  nextSortOrder,
  syncProductMediaFromServer,
  uploadAndRegisterProductImages,
  uploadProgressPercent,
} from "../../services/media/productMediaService";
import { cn } from "../../utils/cn";

const fieldCls =
  "w-full border border-mist bg-canvas px-3 py-2 font-ui text-xs text-ink outline-none focus:border-accent disabled:opacity-60";

/* F1 — the 409 recovery copy states the REAL consequence of a replacement.
   A replacement is stored under a new content-addressed key and attached as a
   NEW media entry; the entry already attached to the product is left alone
   (nothing is auto-detached or deleted) and can be detached later in the
   product media manager. Exported so the wording can be regression-tested
   without driving a live 409 through the page. */
export const collisionCopy = {
  headline: (names) => `An object already exists for ${names}.`,
  employee: () =>
    `Nothing was overwritten. Rename the file and upload it again, or ask an administrator to ` +
    `replace the stored object: a replacement adds a new media entry, and this product's ` +
    `existing entry stays attached with its own image, role and order until it is detached in ` +
    `the product media manager.`,
  admin: () =>
    `Nothing was overwritten. That file name already belongs to an existing media entry on this ` +
    `product. Retrying adds a new media entry for this file: the existing entry stays attached ` +
    `to the product, keeps its current image, role and order, and can be detached later in the ` +
    `product media manager.`,
  confirm: (names) =>
    `The next upload will store a new media entry for ${names} alongside the existing entry, ` +
    `which stays attached; the existing entry can be detached later in the product media ` +
    `manager. Submit again to confirm.`,
};

export default function MediaUploadForm({
  initialScope = MEDIA_SCOPES.PRODUCT,
  initialProductId = null,
  initialPlacement = null,
  allowScopeChange = true,
  portalType = "auto", // "admin" | "employee" | "auto"
  onSuccessRedirect = null,
}) {
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const { employee, hasPermission } = useEmployeeAuth();
  const actions = useMediaActions();

  const isEmployeeSession = portalType === "employee" || (portalType === "auto" && !admin && Boolean(employee));
  /* Media authority is resolved from the session's grants, never from the
     workspace it happens to be signed into. The built-in ADMIN holds
     `media.upload`, which expands to `media.manage`, so its behaviour here is
     unchanged; a custom-permission admin whose resolved grants carry no media
     code no longer sees a marketing destination it cannot use. The employee
     rule is untouched. */
  const canManageMarketing = isEmployeeSession
    ? Boolean(hasPermission?.(PERMISSIONS.MEDIA_MANAGE) || hasPermission?.("media.manage"))
    : Boolean(actions.access?.canManageMarketing);
  const isAuthorizedToUpload = isEmployeeSession
    ? Boolean(hasPermission?.(PERMISSIONS.MEDIA_UPLOAD) || hasPermission?.("media.upload"))
    : actions.access?.canUpload ?? true;

  const workspacePrefix = isEmployeeSession ? "/employee" : "/admin";
  const mediaScope = isEmployeeSession ? "employee" : "admin";

  const [scope, setScope] = useState(() =>
    !canManageMarketing ? MEDIA_SCOPES.PRODUCT : initialScope
  );
  const [productId, setProductId] = useState(initialProductId);
  const [placement, setPlacement] = useState(initialPlacement || MARKETING_PLACEMENTS.HOME_HERO);

  // Marketing metadata fields
  const [campaign, setCampaign] = useState("");
  const [campaignStart, setCampaignStart] = useState("");
  const [campaignEnd, setCampaignEnd] = useState("");

  // Upload queue & state
  const [queue, setQueue] = useState([]);
  const [fileErrors, setFileErrors] = useState([]);
  const [formError, setFormError] = useState(null);

  // "idle" | "running" | "refreshing" | "completed"
  const [uploadState, setUploadState] = useState("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedResults, setUploadedResults] = useState([]);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // What the target product already has — read from the server, never guessed.
  const [context, setContext] = useState({
    state: initialProductId ? "loading" : "idle",
    items: [],
    product: null,
    productError: null,
    error: null,
  });
  const [contextNonce, setContextNonce] = useState(0);

  // Explicit cover intent: null = house rule, true = operator chose cover.
  const [requestCover, setRequestCover] = useState(null);

  /* 409 recovery: after a collision the operator may explicitly authorise
     replacing the stored object. Scoped to the colliding file names only —
     a blanket "overwrite anything" flag is not something this page offers. */
  const [replaceNames, setReplaceNames] = useState([]);

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  /* StrictMode-safe mount guard (MEDIA-UPLOAD-031) — same hazard as in
     `useAdminProductSearch`: StrictMode's setup → cleanup → setup cycle left
     this ref permanently `false` in development, so the authoritative product
     read (and every post-upload reconciliation) was discarded as "unmounted"
     and the form stayed stuck on "reading the product's media". Re-arm on
     setup; flip only on a real unmount. */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      queueRef.current.forEach((item) => {
        if (item.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* Target product: authoritative read before anything is written       */
  /* ------------------------------------------------------------------ */
  const loadContext = useCallback(
    async (id) => {
      if (!id) {
        setContext({ state: "idle", items: [], product: null, productError: null, error: null });
        return;
      }
      setContext((prev) => ({ ...prev, state: "loading", error: null }));
      const result = await loadProductMediaContext(id, { scope: mediaScope });
      if (!mountedRef.current) return;
      if (!result.verified) {
        setContext({
          state: "error",
          items: [],
          product: result.product ?? null,
          productError: result.productError ?? null,
          error: result.error ?? "The product's existing media could not be read.",
        });
        return;
      }
      setContext({
        state: "ready",
        items: result.items ?? [],
        product: result.product ?? null,
        productError: result.productError ?? null,
        error: null,
      });
    },
    [mediaScope]
  );

  useEffect(() => {
    void contextNonce; // explicit retry re-runs the read
    loadContext(scope === MEDIA_SCOPES.PRODUCT ? productId : null);
  }, [contextNonce, loadContext, productId, scope]);

  const registeredItems = context.items;
  const registeredCount = registeredItems.length;
  const coverRegistered = registeredItems.some((item) => item?.isPrimary === true);
  const legacyOnly = useMemo(
    () => legacyCatalogueOnly(context.product, registeredItems),
    [context.product, registeredItems]
  );
  const productHasCover = hasExistingCover(registeredItems, context.product);

  /* The D4 block. Not a warning: while the product's imagery lives only in the
     legacy columns, the first registration would change what the catalogue
     shows for it, so this surface refuses the write and explains the way out
     without touching a single row. */
  const blocked =
    scope === MEDIA_SCOPES.PRODUCT &&
    Boolean(productId) &&
    context.state === "ready" &&
    Boolean(context.product) &&
    legacyOnly;

  /* No product record AND no registered media means the cover question cannot
     be answered — that is "unverified", not "safe". A product that already has
     registered media needs no such check. */
  const productRecordMissing =
    context.state === "ready" && !context.product && registeredItems.length === 0;

  const contextLoading =
    scope === MEDIA_SCOPES.PRODUCT && Boolean(productId) && context.state === "loading";
  const contextUnverified =
    scope === MEDIA_SCOPES.PRODUCT &&
    Boolean(productId) &&
    (context.state === "error" || productRecordMissing);

  /* ------------------------------------------------------------------ */
  /* Selection                                                           */
  /* ------------------------------------------------------------------ */
  const handleFilesSelected = useCallback((fileList) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    const accepted = [];
    const rejected = [];
    const current = queueRef.current;
    const seen = new Set(current.map((item) => item.signature));
    const room = Math.max(UPLOAD_LIMITS.MAX_FILES_PER_BATCH - current.length, 0);

    if (files.length > room) {
      const dropped = files.length - room;
      rejected.push(
        room === 0
          ? `This batch is already at its ${UPLOAD_LIMITS.MAX_FILES_PER_BATCH}-file limit — upload these files in a second batch.`
          : `Only ${UPLOAD_LIMITS.MAX_FILES_PER_BATCH} files can be uploaded in one batch — ${dropped} file${
              dropped === 1 ? " was" : "s were"
            } not added. Upload the rest in a second batch.`
      );
    }

    files.slice(0, room).forEach((file, idx) => {
      const val = validateFile(file);
      if (!val.ok) {
        rejected.push(val.error);
        return;
      }
      if (val.type === MEDIA_TYPES.VIDEO) {
        rejected.push(
          `"${file.name}" is a video — video is not supported in this upload. Please select an image.`
        );
        return;
      }
      const signature = fileSignature(file);
      if (seen.has(signature)) {
        rejected.push(`"${file.name}" is already in this batch — the same file cannot be added twice.`);
        return;
      }
      seen.add(signature);

      // A new file is gallery media by default: the cover is a deliberate
      // decision, not the accident of whichever file happens to be first.
      const role = rolesForType(val.type).length
        ? DEFAULT_PRODUCT_UPLOAD_ROLE
        : PRODUCT_MEDIA_ROLES.GALLERY;
      const previewUrl = URL.createObjectURL(file);

      accepted.push({
        key: `${file.name}-${file.size}-${Date.now()}-${idx}`,
        signature,
        file,
        type: val.type,
        title: titleFromFileName(file.name),
        alt: titleFromFileName(file.name),
        role,
        previewUrl,
        stage: PRODUCT_MEDIA_STAGES.SELECTED,
        progress: 0,
      });
    });

    if (accepted.length) setQueue((prev) => [...prev, ...accepted]);
    setFileErrors(rejected);
    setFormError(null);
  }, []);

  const handleRemoveItem = useCallback((key) => {
    setQueue((prev) => {
      const target = prev.find((item) => item.key === key);
      if (target?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.key !== key);
    });
  }, []);

  const handleUpdateItem = useCallback((key, patch) => {
    setQueue((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }, []);

  const handleClearQueue = useCallback(() => {
    queueRef.current.forEach((item) => {
      if (item.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(item.previewUrl);
      }
    });
    setQueue([]);
    setFileErrors([]);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Leaving the page with unsaved or in-flight work                     */
  /* ------------------------------------------------------------------ */
  const busy = uploadState === "running" || uploadState === "refreshing";
  const hasUncommittedWork = queue.length > 0 || busy;

  useEffect(() => {
    if (!hasUncommittedWork) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      // eslint-disable-next-line no-param-reassign
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUncommittedWork]);

  const goBackToMediaDesk = useCallback(() => {
    navigate(`${workspacePrefix}/media`);
  }, [navigate, workspacePrefix]);

  const requestCancel = useCallback(() => {
    if (hasUncommittedWork) {
      setShowLeaveConfirm(true);
      return;
    }
    goBackToMediaDesk();
  }, [goBackToMediaDesk, hasUncommittedWork]);

  const confirmCancel = useCallback(() => {
    abortRef.current?.abort();
    setShowLeaveConfirm(false);
    goBackToMediaDesk();
  }, [goBackToMediaDesk]);

  const handleStopUpload = useCallback(() => {
    abortRef.current?.abort();
    setFormError(
      "Upload stopped. Files already sent may still be stored — the product's media is being verified now."
    );
  }, []);

  /* ------------------------------------------------------------------ */
  /* Submit                                                              */
  /* ------------------------------------------------------------------ */
  const validateForm = () => {
    if (!isAuthorizedToUpload) {
      setFormError("You do not have permission to upload media.");
      return false;
    }
    if (!queue.length) {
      setFormError("Please select at least one image to upload.");
      return false;
    }

    if (scope === MEDIA_SCOPES.PRODUCT) {
      if (!productId) {
        setFormError("Please select a target product for this product media upload.");
        return false;
      }
      if (contextLoading) {
        setFormError("The selected product is still being read from the server. Please wait a moment.");
        return false;
      }
      if (contextUnverified) {
        setFormError(
          "This product's existing media could not be read, so nothing can be added safely. Retry the product read first."
        );
        return false;
      }
      if (blocked) {
        setFormError(
          "This product cannot receive its first media registration yet — its imagery is still held only in the product record. Nothing has been changed."
        );
        return false;
      }
    }

    if (scope === MEDIA_SCOPES.MARKETING) {
      if (!canManageMarketing) {
        setFormError("You do not have permission to manage marketing media.");
        return false;
      }
      if (!placement) {
        setFormError("Please select a marketing placement for this upload.");
        return false;
      }
    }

    for (const item of queue) {
      if (!item.title?.trim()) {
        setFormError(`"${item.file.name}" is missing a title.`);
        return false;
      }
      if (item.type === MEDIA_TYPES.IMAGE && !item.alt?.trim()) {
        setFormError(`"${item.file.name}" is missing alt text — it is required for images.`);
        return false;
      }
    }

    setFormError(null);
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!validateForm()) return;

    /* Marketing placements are registered through the Admin Media Library's
       placement action, never from this form: an upload made here is never
       silently promoted to a marketing slot. The blocker copy (shared
       MARKETING_MEDIA_BLOCKER) is stated verbatim and NOTHING is written
       anywhere (server or browser). */
    if (scope === MEDIA_SCOPES.MARKETING) {
      setFormError(MARKETING_MEDIA_BLOCKER);
      return;
    }

    /* Product media — ONE request per file: the upload route stores the object,
       creates the asset row and assigns it to the product in one transaction,
       and title/alt/role/sort/is_primary ride on that same request. */
    const activeItems = queueRef.current;
    const before = registeredItems;
    const baseSortOrder = nextSortOrder(before);
    const controller = new AbortController();
    abortRef.current = controller;

    setUploadState("running");
    setUploadProgress(0);
    setFormError(null);

    const perFile = (entry, index) => ({
      role: entry?.role ?? DEFAULT_PRODUCT_UPLOAD_ROLE,
      sortOrder: baseSortOrder + index,
      isPrimary: decidePrimary({
        isEmployee: isEmployeeSession,
        requestCover,
        items: before,
        product: context.product,
        index,
        fallbackIndex: 0,
      }),
      title: entry?.title ?? null,
      altText: entry?.alt ?? null,
      replaceExisting: replaceNames.includes(entry?.file?.name),
    });

    const result = await uploadAndRegisterProductImages(productId, activeItems, {
      scope: mediaScope,
      continueOnError: true,
      signal: controller.signal,
      perFile,
      onStage: (file, stage, payload = {}) => {
        const total = payload?.total ?? 1;
        const index = payload?.index ?? 0;
        const percent = uploadProgressPercent(index, stage, total);
        setQueue((prev) =>
          prev.map((entry) =>
            entry.file === file
              ? {
                  ...entry,
                  stage,
                  stageMessage:
                    stage === PRODUCT_MEDIA_STAGES.FAILED
                      ? payload?.error || "Server rejected the request."
                      : stage === PRODUCT_MEDIA_STAGES.UNCONFIRMED
                        ? "No server answer — verifying"
                        : null,
                  progress: percent,
                }
              : entry,
          ),
        );
        setUploadProgress(percent);
      },
    });

    if (!mountedRef.current) return;

    /* Reconcile against the authoritative read: media ids come from the
       server's own media-set rows, never from an invented upload field. */
    setUploadState("refreshing");
    const sync = await syncProductMediaFromServer(productId, { scope: mediaScope });
    if (!mountedRef.current) return;

    const afterItems = sync.ok ? sync.items ?? [] : [];
    const matched = matchReconciledItems({
      before,
      after: afterItems,
      results: result.results ?? [],
    });

    const summarised = (result.results ?? []).map((entry, index) => {
      const match = matched[index] ?? { matched: false };
      const state = entry.ok
        ? "assigned"
        : entry.uncertain
          ? match.matched
            ? "assigned"
            : "unconfirmed"
          : "failed";
      return {
        type: activeItems[index]?.type ?? MEDIA_TYPES.IMAGE,
        role: activeItems[index]?.role ?? null,
        fileName: entry.fileName,
        mediaId: match.matched ? match.mediaId : null,
        assignmentId: match.matched ? match.assignmentId : null,
        url: match.matched ? match.url : null,
        objectKey: entry.objectKey ?? match.objectKey ?? null,
        sortOrder: match.matched ? match.sortOrder : null,
        isPrimary: match.matched ? Boolean(match.isPrimary) : false,
        state,
        error: entry.error ?? null,
        failureKind: entry.failureKind ?? null,
      };
    });

    setUploadedResults(summarised);

    /* Successes leave the queue; anything unconfirmed or failed stays, so the
       next click can only ever re-send what genuinely still needs sending. */
    const settledIndexes = new Set(
      summarised
        .map((entry, index) => (entry.state === "assigned" ? index : -1))
        .filter((index) => index >= 0)
    );
    setQueue((prev) => {
      prev.forEach((entry, index) => {
        if (settledIndexes.has(index) && entry.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(entry.previewUrl);
        }
      });
      return prev.filter((_entry, index) => !settledIndexes.has(index));
    });

    /* Refresh the read model so cover/existing-media state is current. */
    await loadContext(productId);
    if (!mountedRef.current) return;

    const failed = summarised.filter((entry) => entry.state === "failed");
    /* One overwrite decision covers one attempt only. */
    setReplaceNames([]);
    const unconfirmed = summarised.filter((entry) => entry.state === "unconfirmed");
    const assigned = summarised.filter((entry) => entry.state === "assigned");
    abortRef.current = null;
    setUploadProgress(100);

    /* Stopped before anything was sent: nothing was written anywhere. */
    if (!summarised.length) {
      setUploadState("idle");
      setFormError("The upload was stopped before any file was sent — nothing was written to the server.");
      return;
    }

    if (unconfirmed.length || failed.length || result.cancelled) {
      setUploadState("idle");
      setFormError(
        [
          `${assigned.length} of ${summarised.length} file${
            summarised.length === 1 ? "" : "s"
          } stored and attached to the product.`,
          failed.length
            ? `${failed.length} rejected by the server: ${
                failed
                  .map((entry) => `${entry.fileName} — ${entry.error ?? "no message returned"}`)
                  .join("; ")
              }`
            : null,
          unconfirmed.length
            ? `${unconfirmed.length} file${unconfirmed.length === 1 ? "" : "s"} ended without a server answer and could not be matched in the product's media: ${unconfirmed
                .map((entry) => entry.fileName)
                .join(", ")}. Check the product's media desk before retrying — a retry could store a second copy.`
            : null,
          result.cancelled
            ? "The upload was stopped. Files already sent are listed above; the rest are still queued."
            : null,
          sync.ok
            ? null
            : `The product could not be re-read after uploading: ${sync.error}`,
        ]
          .filter(Boolean)
          .join(" ")
      );
      return;
    }

    setUploadState("completed");
    setFormError(
      sync.ok
        ? null
        : `Media is stored and attached, but the authoritative read of the product failed: ${sync.error}`
    );
  };

  const handleResetForNext = () => {
    handleClearQueue();
    setUploadState("idle");
    setUploadProgress(0);
    setUploadedResults([]);
    setFormError(null);
    setRequestCover(null);
    setContextNonce((value) => value + 1);
  };

  const selectedProduct = useMemo(
    () => (productId ? context.product ?? catalogRepository.find(productId) : null),
    [context.product, productId]
  );

  /* Files the server refused because a different object already occupies their
     storage key. Kept separate from every other failure: the only way past it
     is an explicit replacement decision, never an automatic retry. */
  const collideNames = uploadedResults
    .filter((entry) => entry.state === "failed" && entry.failureKind === "collision")
    .map((entry) => entry.fileName)
    .filter((name) => !replaceNames.includes(name));

  /* ------------------------------------------------------------------ */
  /* Success view                                                        */
  /* ------------------------------------------------------------------ */
  if (uploadState === "completed") {
    const count = uploadedResults.length;
    const imgCount = uploadedResults.filter((r) => r.type === MEDIA_TYPES.IMAGE).length;
    const vidCount = uploadedResults.filter((r) => r.type === MEDIA_TYPES.VIDEO).length;
    const ids = uploadedResults.filter((r) => r.mediaId);

    const returnUrl = onSuccessRedirect || `${workspacePrefix}/media`;

    return (
      <div className="mx-auto max-w-2xl space-y-6 border border-mist bg-canvas p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-pf-success/30 bg-pf-success/10">
          <CheckCircle2 size={36} className="text-pf-success" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <span className="font-ui text-[10px] font-semibold uppercase tracking-[.24em] text-pf-success">
            Stored &amp; Attached
          </span>
          <h2 className="font-display text-2xl font-normal text-ink">
            Media uploaded successfully.
          </h2>
          <p className="mx-auto max-w-md font-ui text-sm leading-relaxed text-taupe">
            <strong className="font-semibold text-ink">
              {count} media {count === 1 ? "asset" : "assets"}
            </strong>{" "}
            ({imgCount} {imgCount === 1 ? "image" : "images"}
            {vidCount > 0 ? `, ${vidCount} ${vidCount === 1 ? "video" : "videos"}` : ""}) confirmed by
            the server and attached
            {selectedProduct ? ` to “${selectedProduct.name}”` : " to the selected product"}.
          </p>
        </div>

        <div className="space-y-2 rounded border border-mist/80 bg-surface/50 p-4 text-left font-ui text-xs">
          <div className="flex items-center justify-between border-b border-mist/60 pb-2 text-taupe">
            <span>Persistence Status</span>
            <span className="font-medium text-ink">Verified against the product media-set</span>
          </div>
          {ids.length ? (
            <ul className="space-y-1 border-b border-mist/60 pb-2">
              {ids.map((result) => (
                <li
                  key={result.fileName + result.mediaId}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate font-mono text-[10px] text-taupe">{result.fileName}</span>
                  <span className="shrink-0 font-mono text-[10px] text-cocoa">
                    #{String(result.mediaId).slice(0, 8)}
                    {result.role ? ` · ${String(result.role).toLowerCase()}` : ""}
                    {result.isPrimary ? " · cover" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {formError ? (
            <p className="text-[11px] leading-relaxed text-pf-warning">{formError}</p>
          ) : (
            <p className="text-[11px] leading-relaxed text-taupe">
              Media ids above were read back from the product's media-set after the upload — the
              server's durable record, visible on the storefront once the product is published.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {productId ? (
            <AtelierButton
              type="button"
              size="sm"
              onClick={() =>
                navigate(`${workspacePrefix}/products/${encodeURIComponent(String(productId))}/media`)
              }
              className="bg-ink text-ivory hover:bg-cocoa"
            >
              Open product media
            </AtelierButton>
          ) : null}
          <AtelierButton
            type="button"
            size="sm"
            variant={productId ? "outline" : "primary"}
            onClick={() => navigate(returnUrl)}
          >
            Media registry
          </AtelierButton>
          <AtelierButton type="button" size="sm" variant="outline" onClick={handleResetForNext}>
            Continue Uploading
          </AtelierButton>
        </div>
      </div>
    );
  }

  const openProductDesk = () =>
    navigate(`${workspacePrefix}/products/${encodeURIComponent(String(productId))}`);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* No pipeline banner here on purpose (MEDIA-UPLOAD-032). The page header
          already states what this form does; the old implementation-status
          disclosure spoke in backend internals (phase numbering, storage
          layers) and cost a tenth of a 768px viewport. Server-confirmed status
          is still reported where it belongs: per file, in the queue and in the
          upload progress panel. */}

      {/* Scope Selector: Product vs Marketing */}
      {allowScopeChange && canManageMarketing ? (
        <div className="space-y-2">
          <span className="font-ui text-[11px] uppercase tracking-[.18em] text-taupe">
            Media Workflow Destination
          </span>
          <div className="grid max-w-md grid-cols-2 gap-3" role="group" aria-label="Media workflow destination">
            <button
              type="button"
              aria-pressed={scope === MEDIA_SCOPES.PRODUCT}
              disabled={busy}
              onClick={() => {
                setScope(MEDIA_SCOPES.PRODUCT);
                setFormError(null);
              }}
              className={cn(
                "flex items-center justify-center gap-2 border p-3 font-ui text-xs uppercase tracking-wider transition-all",
                scope === MEDIA_SCOPES.PRODUCT
                  ? "border-ink bg-ink font-medium text-ivory"
                  : "border-mist bg-canvas text-cocoa hover:border-ink/60"
              )}
            >
              <ImageIcon size={14} />
              Product Media
            </button>
            <button
              type="button"
              aria-pressed={scope === MEDIA_SCOPES.MARKETING}
              disabled={busy}
              onClick={() => {
                setScope(MEDIA_SCOPES.MARKETING);
                setFormError(null);
              }}
              className={cn(
                "flex items-center justify-center gap-2 border p-3 font-ui text-xs uppercase tracking-wider transition-all",
                scope === MEDIA_SCOPES.MARKETING
                  ? "border-ink bg-ink font-medium text-ivory"
                  : "border-mist bg-canvas text-cocoa hover:border-ink/60"
              )}
            >
              <Film size={14} />
              Marketing Media
            </button>
          </div>
          <p className="font-ui text-[10px] leading-relaxed text-taupe">
            Product media is attached to the product you select here. Marketing placement art is registered
            from the Homepage placement art panel on the Media Management page; it is a separate explicit
            assignment and is never promoted automatically from a product upload.
          </p>
        </div>
      ) : null}

      {/* Destination Selection */}
      <div className="space-y-4 border border-mist/80 bg-canvas p-5">
        {scope === MEDIA_SCOPES.PRODUCT ? (
          <>
            <MediaProductSelector
              selectedProductId={productId}
              selectedRecord={context.product}
              onSelectProduct={(id) => {
                setProductId(id);
                setRequestCover(null);
                setFormError(null);
              }}
              disabled={busy}
              productSource={isEmployeeSession ? "register" : "admin-search"}
              required
            />

            {isEmployeeSession ? (
              <p className="border border-mist bg-surface/40 p-2.5 font-ui text-[10px] leading-relaxed text-taupe">
                <Info size={11} className="mr-1 inline-block" aria-hidden="true" />
                Employee sessions cannot search the full catalogue — there is no employee product
                list. Open this page from a product&apos;s media desk (it carries the product through
                automatically), or ask an administrator to add the media.
              </p>
            ) : null}

            {/* Target read — what the server says the product already has. */}
            {productId ? (
              <div
                className={cn(
                  "border p-3 font-ui text-[11px] leading-relaxed",
                  contextUnverified
                    ? "border-pf-error/40 bg-pf-error/[0.05] text-ink"
                    : blocked
                      ? "border-pf-warning/50 bg-pf-warning/[0.07] text-ink"
                      : "border-mist bg-surface/40 text-taupe"
                )}
                aria-live="polite"
              >
                {contextLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                    Reading this product&apos;s existing media from the server…
                  </span>
                ) : contextUnverified ? (
                  <div className="space-y-2">
                    <p className="flex items-start gap-2">
                      <ShieldAlert size={13} className="mt-0.5 shrink-0 text-pf-error" aria-hidden="true" />
                      <span>
                        <strong className="font-medium text-ink">Existing media unverified.</strong>{" "}
                        {context.error ||
                          context.productError ||
                          "The product record could not be read, so its current cover cannot be established."}{" "}
                        Nothing will be uploaded until this read succeeds — adding media to a
                        product whose current media is unknown could change its cover without
                        anyone seeing it.
                      </span>
                    </p>
                    <AtelierButton
                      type="button"
                      size="chip"
                      variant="outline"
                      onClick={() => setContextNonce((value) => value + 1)}
                    >
                      <RefreshCw size={11} className="mr-1 inline-block" /> Retry product read
                    </AtelierButton>
                  </div>
                ) : blocked ? (
                  <div className="space-y-2">
                    <p className="flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-pf-warning" aria-hidden="true" />
                      <span>
                        <strong className="font-medium text-ink">
                          First registration is paused for this product.
                        </strong>{" "}
                        Its catalogue imagery is still held in the product record itself
                        (<code className="font-mono text-[10px]">image</code> /{" "}
                        <code className="font-mono text-[10px]">additional_images</code>) and it has
                        no registered media yet. Registering the first asset here would switch what
                        the catalogue shows for this product, so that step needs an explicit
                        decision elsewhere. <strong className="font-medium text-ink">Nothing has been modified</strong>{" "}
                        — no media was added and no product record was touched.
                      </span>
                    </p>
                    <p className="text-[11px]">
                      <strong className="font-medium text-ink">To move forward without losing anything:</strong>{" "}
                      open the product&apos;s own media desk and review the imagery already attached
                      there, or ask an administrator to resolve the product&apos;s media source.
                      Existing files stay exactly as they are either way.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <AtelierButton
                        type="button"
                        size="chip"
                        variant="outline"
                        onClick={openProductDesk}
                      >
                        Open product <ExternalLink size={11} className="ml-1 inline-block" />
                      </AtelierButton>
                      <AtelierButton
                        type="button"
                        size="chip"
                        variant="outline"
                        onClick={() => setContextNonce((value) => value + 1)}
                      >
                        <RefreshCw size={11} className="mr-1 inline-block" /> Re-check
                      </AtelierButton>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p>
                      <strong className="font-medium text-ink">
                        {registeredCount
                          ? `${registeredCount} registered media asset${registeredCount === 1 ? "" : "s"}`
                          : "No registered media yet"}
                      </strong>
                      {coverRegistered
                        ? " · a registered cover is set"
                        : context.product?.image
                          ? " · cover currently comes from the product record"
                          : " · no cover set"}
                      .
                    </p>
                    <p>
                      New files are appended after the existing set
                      {registeredCount ? ` (positions from #${nextSortOrder(registeredItems)})` : ""}
                      . Existing media is left untouched.
                    </p>
                    {context.product?.status === "ARCHIVED" ? (
                      <p className="text-pf-warning">
                        This product is archived — uploaded media will not reach the storefront
                        until it is restored.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {/* Cover intent — employee sessions may never request primacy. */}
            {productId && !blocked && !contextUnverified ? (
              isEmployeeSession ? (
                <p className="font-ui text-[10px] leading-relaxed text-taupe">
                  <Info size={11} className="mr-1 inline-block" aria-hidden="true" />
                  Employee uploads are added as gallery media; the product cover is set by an
                  administrator.
                </p>
              ) : productHasCover ? (
                <label className="flex items-start gap-2 font-ui text-[11px] leading-relaxed text-taupe">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={requestCover === true}
                    disabled={busy}
                    onChange={(event) => setRequestCover(event.target.checked ? true : null)}
                  />
                  <span>
                    Replace the product&apos;s current cover with the first file.
                    <span className="block text-[10px] text-taupe/80">
                      Off by default. The current cover is kept as gallery media — nothing is deleted.
                    </span>
                  </span>
                </label>
              ) : (
                <label className="flex items-start gap-2 font-ui text-[11px] leading-relaxed text-taupe">
                  <input type="checkbox" className="mt-0.5" checked disabled />
                  <span>
                    The first file will become this product&apos;s cover.
                    <span className="block text-[10px] text-taupe/80">
                      This product has no cover yet, so the first registered file takes that place.
                    </span>
                  </span>
                </label>
              )
            ) : null}
          </>
        ) : (
          <div className="space-y-4">
            <MediaPlacementSelector
              selectedPlacement={placement}
              onSelectPlacement={(id) => {
                setPlacement(id);
                setFormError(null);
              }}
              disabled={busy}
            />

            {/* Campaign details */}
            <div className="grid gap-3 border-t border-mist/70 pt-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe" htmlFor="campaign-name">
                  Campaign Title
                </label>
                <input
                  id="campaign-name"
                  type="text"
                  value={campaign}
                  disabled={busy}
                  onChange={(e) => setCampaign(e.target.value)}
                  placeholder="e.g. Festive Edit 2026"
                  className={fieldCls}
                />
              </div>

              <div className="space-y-1">
                <label className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe" htmlFor="campaign-start">
                  Start Date
                </label>
                <input
                  id="campaign-start"
                  type="date"
                  value={campaignStart}
                  disabled={busy}
                  onChange={(e) => setCampaignStart(e.target.value)}
                  className={fieldCls}
                />
              </div>

              <div className="space-y-1">
                <label className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe" htmlFor="campaign-end">
                  End Date
                </label>
                <input
                  id="campaign-end"
                  type="date"
                  value={campaignEnd}
                  disabled={busy}
                  onChange={(e) => setCampaignEnd(e.target.value)}
                  className={fieldCls}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dropzone — the label is bound to the real file input it names.
          Same card treatment as the destination block above so the form reads
          as one column of panels, not floating fragments. */}
      <div className="space-y-3 border border-mist/80 bg-canvas p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label
            className="font-ui text-[11px] uppercase tracking-[.18em] text-taupe"
            htmlFor="media-file-input"
          >
            Select Files <span className="text-accent">*</span>
          </label>
          {queue.length ? (
            <span className="font-ui text-[10px] text-taupe">
              {queue.length} of {UPLOAD_LIMITS.MAX_FILES_PER_BATCH} files ·{" "}
              {formatFileSize(queue.reduce((total, item) => total + (item.file?.size || 0), 0))} total
            </span>
          ) : (
            <span className="font-ui text-[10px] text-taupe">
              Up to {UPLOAD_LIMITS.MAX_FILES_PER_BATCH} images per batch
            </span>
          )}
        </div>
        <MediaUploadDropzone
          onFilesSelected={handleFilesSelected}
          disabled={busy}
          compact={queue.length > 0}
        />
      </div>

      {/* File Validation Errors */}
      {fileErrors.length ? (
        <div
          role="alert"
          aria-live="assertive"
          className="space-y-1.5 border border-accent/40 bg-accent/[0.06] p-4"
        >
          <div className="flex items-center gap-2 font-ui text-xs font-semibold text-accent">
            <AlertCircle size={14} />
            <span>Some files could not be added:</span>
          </div>
          <ul className="list-disc space-y-1 pl-5 font-ui text-[11px] text-accent">
            {fileErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Upload Queue */}
      <MediaUploadQueue
        queue={queue}
        onRemoveItem={handleRemoveItem}
        onUpdateItem={handleUpdateItem}
        onClearQueue={handleClearQueue}
        isProductMedia={scope === MEDIA_SCOPES.PRODUCT}
        disabled={busy}
      />

      {/* Form Error */}
      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2 border border-accent/40 bg-accent/[0.05] p-3 font-ui text-xs leading-relaxed text-accent"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{formError}</span>
        </div>
      ) : null}

      {/* 409 recovery — an explicit, per-file decision to replace. Employees
          are told what happened (and that a replacement adds a new entry)
          but are never handed a replacement control: replacing a stored
          object is an administrator decision. */}
      {!busy && collideNames.length && isEmployeeSession ? (
        <div className="border border-pf-warning/50 bg-pf-warning/[0.07] p-3 font-ui text-[11px] leading-relaxed text-ink">
          <strong className="font-medium">{collisionCopy.headline(collideNames.join(", "))}</strong>{" "}
          {collisionCopy.employee()}
        </div>
      ) : null}

      {/* 409 recovery — an explicit, per-file decision to replace. The copy
          states the real consequence: the retry creates a NEW media entry and
          the existing entry stays attached until it is detached in the product
          media manager. */}
      {!busy && collideNames.length && !isEmployeeSession ? (
        <div className="space-y-2 border border-pf-warning/50 bg-pf-warning/[0.07] p-3 font-ui text-[11px] leading-relaxed text-ink">
          <p>
            <strong className="font-medium">{collisionCopy.headline(collideNames.join(", "))}</strong>{" "}
            {collisionCopy.admin()}
          </p>
          <AtelierButton
            type="button"
            size="chip"
            variant="outline"
            onClick={() => {
              setReplaceNames(collideNames);
              setFormError(collisionCopy.confirm(collideNames.join(", ")));
            }}
          >
            Replace the stored object and retry
          </AtelierButton>
        </div>
      ) : null}

      {/* Upload Progress */}
      {busy ? (
        <div className="space-y-2 border border-mist bg-surface/60 p-4">
          <div className="flex items-center justify-between font-ui text-xs">
            <span className="flex items-center gap-2 font-medium text-ink">
              <Loader2 size={14} className="animate-spin text-accent" />
              {uploadState === "refreshing"
                ? "Verifying against the product's media…"
                : "Uploading & attaching media…"}
            </span>
            <span className="font-mono text-taupe">{uploadProgress}%</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-mist"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress}
            aria-label="Batch upload progress"
          >
            <div
              className="h-full bg-accent transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="font-ui text-[10px] leading-relaxed text-taupe">
            Each file is stored, registered and attached in one server transaction. Every stage
            above reflects a real server response; a file is never reported as stored before the
            server confirms it. Requests time out after {Math.round(MEDIA_UPLOAD_TIMEOUT_MS / 1000)}s
            per file and are then verified against the product instead of being called failures.
          </p>
          <AtelierButton type="button" size="chip" variant="outline" onClick={handleStopUpload}>
            Stop upload
          </AtelierButton>
        </div>
      ) : null}

      {/* Submission Actions — the form footer (MEDIA-UPLOAD-033).

          Hierarchy follows the admin system's own button language (cf. the
          product review desk): the primary write action is a solid house
          burgundy plate with ivory type and a gold focus ring; Cancel is a
          gold-hairline outline that only warms to burgundy on hover, so it
          stays visually subordinate. The old footer buttons asked the Atelier
          scale for a size that does not exist and therefore inherited NO
          padding at all, which is why the footer read cramped; both controls
          now carry explicit, equal padding and a real minimum width.

          Layout: status copy left, actions right on one row from tablet up;
          on narrow phones the pair stacks full-width (primary first) so
          neither label can clip, wrap mid-word or overflow horizontally.
          The bar stays sticky so the primary action is never below the fold
          on 1366×768 or shorter desktops. */}
      <div className="sticky bottom-0 z-10 border-t border-pf-border bg-pf-card/95 px-4 py-3 backdrop-blur sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-ui text-[11px] text-pf-muted" role="status">
            {queue.length ? (
              <span>
                {queue.length} {queue.length === 1 ? "file" : "files"} ready to{" "}
                {isEmployeeSession ? "submit" : "upload"}
              </span>
            ) : (
              <span>{uploadedResults.length ? "Nothing left to send" : "No files selected"}</span>
            )}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
            {/* Cancel keeps ONE safe outcome: with no uncommitted work it
                returns to the media desk; with a selection or an in-flight
                upload it opens the confirm dialog whose copy states exactly
                what leaving does (a stopped upload may already have stored
                files — the product is then verified, never called failed).
                It is therefore deliberately NOT disabled while busy. */}
            <AtelierButton
              type="button"
              variant="outline"
              onClick={requestCancel}
              className="w-full border-pf-border-strong px-6 py-2.5 text-[10px] tracking-[.16em] text-pf-muted hover:border-pf-burgundy hover:bg-transparent hover:text-pf-burgundy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-gold-deep disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Cancel
            </AtelierButton>

            <AtelierButton
              type="submit"
              disabled={
                busy ||
                !queue.length ||
                !isAuthorizedToUpload ||
                contextLoading ||
                contextUnverified ||
                blocked
              }
              className="w-full border border-pf-burgundy bg-pf-burgundy px-6 py-2.5 text-[10px] tracking-[.16em] text-pf-ivory shadow-[0_10px_24px_rgb(74_7_24/0.18)] hover:border-pf-wine-soft hover:bg-pf-wine-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pf-gold-deep disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:w-auto sm:min-w-56"
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  Uploading…
                </span>
              ) : scope === MEDIA_SCOPES.MARKETING ? (
                "Assign Marketing Media"
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Upload size={13} aria-hidden="true" />
                  Upload &amp; Register Media
                </span>
              )}
            </AtelierButton>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showLeaveConfirm}
        title={busy ? "Leave while uploading?" : "Leave without uploading?"}
        description={
          busy
            ? "The upload is in progress. Leaving stops it, and any file that already reached the server may still have been stored. Check the product's media afterwards."
            : `${queue.length} selected ${queue.length === 1 ? "file has" : "files have"} not been uploaded. Leaving discards the selection only — no server data is deleted.`
        }
        confirmLabel={busy ? "Stop and leave" : "Discard and leave"}
        cancelLabel="Stay on this page"
        onConfirm={confirmCancel}
        onCancel={() => setShowLeaveConfirm(false)}
      />
    </form>
  );
}
