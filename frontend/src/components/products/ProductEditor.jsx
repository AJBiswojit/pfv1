/**
 * PRATIKSHYA FASHION — The complete product & merchandising workspace.
 *
 * One editor serves both portals: Admin wields it with publishing rights,
 * employees with `products.manage` use it to draft and submit for review.
 * Everything writes to the shared catalogue repository — there is no
 * second product system.
 *
 * Workflow:
 *   DRAFT → SUBMITTED → APPROVED → PUBLISHED
 *   SUBMITTED → RETURNED → DRAFT (returned to the author with a reason)
 *
 * Creation, editing, and every transition call the universal workflow
 * command layer. The editor never writes lifecycle status itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, RotateCcw, Archive } from "lucide-react";
import { AtelierButton } from "../../design-system";
import catalogRepository, { getPublishIssues } from "../../services/catalogRepository";
import inventoryRepository from "../../services/inventory/inventoryRepository";
import {
  approveAndPublishProduct,
  checkAvailability,
  runAction,
} from "../../services/admin/productAdminService";
import {
  buildAvailabilityQuery,
  identityErrors,
  toVerdict,
} from "../../services/admin/productIdentityPreflight";
import { formatAdminError } from "../../services/admin/adminError";
import { apiAdminGetPublishIssues, apiSubmitForReview } from "../../services/api/productsApi";
import {
  archiveProduct,
  publishProduct,
  restoreProduct,
} from "../../services/workflow/productWorkflowCommands";
import {
  WORKFLOW_STAGES,
  getProductWorkflowState,
} from "../../services/workflow/productWorkflowState";
import { computePricing } from "../../utils/pricing";
import { PRODUCT_STATUSES } from "../../config/productCatalogConfig";
import { SectionBasics, SectionAttributes } from "./editorSectionsBasics";
import { draftFromProduct, emptyDraft } from "./productDraftModel";
import { adminCreatedThisProduct, loadProductDraft, persistProductDraft } from "./persistProductDraft";
import { SectionPricing } from "./editorSectionsCommerce";
import { SectionContent, SectionMedia, SectionSeo, SectionPublishing } from "./editorSectionsContent";
import { cn } from "../../utils/cn";

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

/**
 * How long the editor waits after the last SKU/slug keystroke before asking
 * the server whether the value is free. Plain timer, no dependency: one probe
 * per typing pause instead of one per character.
 */
const IDENTITY_PROBE_DELAY_MS = 400;

/*
 * Variants stay out of the create/edit tabs until the backend persists them.
 * The SectionVariants surface remains in editorSectionsCommerce for that phase.
 */
const SECTIONS = [
  { id: "basics", label: "Basic Information" },
  { id: "attributes", label: "Attributes" },
  { id: "pricing", label: "Pricing" },
  { id: "content", label: "Product Content" },
  { id: "media", label: "Media" },
  { id: "seo", label: "SEO" },
  { id: "publishing", label: "Publishing" },
];

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

export default function ProductEditor({
  productId = null,
  portal = "admin",
  basePath = "/admin",
  actor = null,
  canPublish = false,
  exitTo = "/",
}) {
  const navigate = useNavigate();
  const location = useLocation();

  /** True for both "admin" and "super-admin" portals — both use the admin API scope. */
  const isAdminPortal = portal === "admin" || portal === "super-admin";

  /*
   * The server is the source of truth for an existing record. A hard
   * navigation straight to `/admin/products/{id}/edit` used to resolve the
   * record from the in-memory session cache, so a cold cache rendered
   * "Product unavailable" even though the server had the row (PF3-N05).
   * The editor now fetches the authoritative record on mount and only treats
   * a record as missing after the server answered.
   */
  const [loadState, setLoadState] = useState(productId ? "loading" : "ready");
  const [loadError, setLoadError] = useState(null);

  const [draft, setDraft] = useState(() => emptyDraft());
  const [baseline, setBaseline] = useState(() => JSON.stringify(emptyDraft()));
  const [section, setSection] = useState(() => location.state?.section || "basics");
  const [feedback, setFeedback] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const tabRefs = useRef({});

  const dirty = JSON.stringify(draft) !== baseline;
  const isNew = !draft.exists;

  const patch = useCallback((partial) => {
    setDraft((current) => ({ ...current, ...partial }));
  }, []);

  /* --- server load (authoritative record on mount) ------------------- */

  useEffect(() => {
    if (!productId) {
      setLoadState("ready");
      return undefined;
    }
    let cancelled = false;
    setLoadState("loading");
    loadProductDraft(productId, portal).then((result) => {
      if (cancelled) return;
      if (result.ok && result.product) {
        const nextDraft = draftFromProduct(result.product);
        setDraft(nextDraft);
        setBaseline(JSON.stringify(nextDraft));
        setLoadState("ready");
      } else {
        setLoadError(result.error ?? "That product could not be found on the server.");
        setLoadState("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productId, portal]);

  /* --- unsaved changes -------------------------------------------- */

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* --- server identity pre-flight (PF3-N16) --------------------------- */

  /*
   * Phase 3 Block 4: SKU/slug uniqueness is decided by the SERVER, through
   * GET /admin/products/availability, not by the session cache. The cache only
   * holds records this session fetched, so it reported duplicates as free and
   * — with its case-sensitive slug compare — free values as duplicates. The
   * probe passes the current product as `excludeId`, so a product's own
   * SKU/slug is free, exactly as PATCH treats it.
   *
   * The request is coalesced behind the same short timer the operator's typing
   * produces (one probe per pause, not one per keystroke) and is pinned to the
   * exact values it asked about, so a late answer can never condemn a value
   * that has since been corrected. A failed probe yields NO verdict: it must
   * not block a save, because the server's 409 on the write is the real gate.
   */
  const [identityVerdict, setIdentityVerdict] = useState(null);
  const availabilityQuery = useMemo(
    () => buildAvailabilityQuery(draft),
    [draft.sku, draft.slug, draft.id, draft.exists]
  );

  useEffect(() => {
    if (!isAdminPortal || !availabilityQuery) {
      setIdentityVerdict(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      checkAvailability(availabilityQuery).then((result) => {
        if (cancelled) return;
        setIdentityVerdict(toVerdict(result, availabilityQuery));
      });
    }, IDENTITY_PROBE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [portal, availabilityQuery]);

  /* --- validation --------------------------------------------------- */

  const errors = useMemo(() => {
    const next = {};
    if (!draft.name.trim()) next.name = "Product name is required.";
    if (!draft.category) next.category = "Category is required.";
    if (!draft.description.trim() && !draft.shortDescription.trim()) {
      next.description = "A description is required.";
    }

    /*
     * The server's verdict on this product's own sku/slug. It is applied AFTER
     * the "required" checks so an empty field still reports as missing, and it
     * is the only source for product-level collisions — no local fallback.
     */
    if (isAdminPortal) {
      const identity = identityErrors(identityVerdict, availabilityQuery);
      if (identity.sku && draft.sku.trim()) next.sku = identity.sku;
      if (identity.slug) next.slug = identity.slug;
    }

    /*
     * Variant SKUs stay on the session cache deliberately: the backend has no
     * variant identity contract at all (variants are not rows), so this local
     * check is the ONLY coverage that exists. Removing it would delete a real
     * check, not a duplicated one.
     */
    const skus = draft.variants.map((variant) => variant.sku).filter(Boolean);
    if (new Set(skus).size !== skus.length) {
      next.variants = "Variant SKUs must be unique within the product.";
    } else if (
      draft.variants.some(
        (variant) => variant.sku && catalogRepository.skuTaken(variant.sku, draft.id)
      )
    ) {
      next.variants = "A variant SKU is already used elsewhere in the catalogue.";
    }
    return next;
  }, [draft, portal, identityVerdict, availabilityQuery]);

  const pricingErrors = useMemo(() => computePricing(draft.pricing).errors, [draft.pricing]);

  const publishIssues = useMemo(() => {
    if (isNew) return ["Save the product first, then add a cover image."];
    return getPublishIssues(draft);
  }, [draft, isNew]);

  /*
   * Phase 5: for admins the AUTHORITATIVE gate is the server's
   * GET /admin/products/{id}/publish-issues list (identical to what approve
   * and publish enforce). It is refetched from the server after every save
   * and lifecycle action — never fabricated locally; a fetch failure falls
   * back to the local checklist while flagging that it is not the server's
   * verdict.
   */
  const [serverPublishIssues, setServerPublishIssues] = useState(null);
  const [serverIssuesError, setServerIssuesError] = useState(null);
  const refreshServerIssues = useCallback(() => {
    if (!isAdminPortal || !draft.id || isNew) return;
    apiAdminGetPublishIssues(draft.id).then((result) => {
      if (result.ok) {
        setServerPublishIssues(result.issues ?? []);
        setServerIssuesError(null);
      } else {
        setServerPublishIssues(null);
        setServerIssuesError(result.error ?? "Could not load the server publish checklist.");
      }
    });
  }, [draft.id, isNew, portal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    refreshServerIssues();
  }, [refreshServerIssues, baseline]);
  const displayIssues =
    isAdminPortal && serverPublishIssues ? serverPublishIssues : publishIssues;

  const sectionDot = (id) => {
    if (id === "basics") return Boolean(errors.name || errors.sku || errors.category);
    if (id === "pricing") return pricingErrors.length > 0;
    if (id === "content") return Boolean(errors.description);
    if (id === "seo") return Boolean(errors.slug);
    return false;
  };

  /* --- persistence -------------------------------------------------- */

  /**
   * Persistence is AWAITED and server-first for both portals. Admin writes
   * POST /admin/products/draft + PATCH. Employee writes POST
   * /employee/products/draft + PATCH on the whitelist, assigned to the caller.
   */
  const [isSaving, setIsSaving] = useState(false);

  const persist = async () => {
    setIsSaving(true);
    try {
      const result = await persistProductDraft({ draft, portal, actor });
      if (!result.ok) {
        setFeedback({
          kind: "error",
          message: result.error || "The product could not be saved.",
        });
        return null;
      }
      setDraft(result.product);
      setBaseline(JSON.stringify(result.product));
      return result.product;
    } finally {
      setIsSaving(false);
    }
  };

  const announce = (message, kind = "success") => setFeedback({ kind, message });

  /* --- actions ------------------------------------------------------ */

  const afterFirstSave = (product) => {
    navigate(`${basePath}/products/${product.id}/edit`, {
      replace: true,
      state: { section: "media" },
    });
  };

  const handleSaveDraft = async () => {
    if (!draft.name.trim()) {
      setSection("basics");
      announce("Give the product a name before saving.", "error");
      return;
    }
    if (isNew && !draft.category) {
      setSection("basics");
      announce("Choose a category before saving — it allocates the Product ID.", "error");
      return;
    }
    if (errors.sku) {
      setSection("basics");
      announce(errors.sku, "error");
      return;
    }
    const product = await persist();
    if (!product) return;
    announce(isAdminPortal ? "Draft saved on the server." : "Draft saved successfully.");
    if (isNew) afterFirstSave(product);
  };

  const handleSaveAndContinue = async () => {
    if (!draft.name.trim()) {
      setSection("basics");
      announce("Give the product a name before saving.", "error");
      return;
    }
    if (isNew && !draft.category) {
      setSection("basics");
      announce("Choose a category before saving — it allocates the Product ID.", "error");
      return;
    }
    if (errors.sku) {
      setSection("basics");
      announce(errors.sku, "error");
      return;
    }
    const product = await persist();
    if (!product) return;
    if (isNew) {
      announce("Draft saved. Add a cover image next.");
      afterFirstSave(product);
      return;
    }
    const currentIndex = SECTIONS.findIndex((s) => s.id === section);
    if (currentIndex < SECTIONS.length - 1) {
      setSection(SECTIONS[currentIndex + 1].id);
      announce("Progress saved. Moved to next section.");
    } else {
      announce("Draft saved successfully.");
    }
  };

  const handleSubmitForReview = async () => {
    const blocking = [errors.name, errors.sku, errors.category, errors.description, errors.slug].filter(Boolean);
    if (blocking.length || pricingErrors.length) {
      if (errors.name || errors.sku || errors.category) setSection("basics");
      else if (errors.description) setSection("content");
      else if (pricingErrors.length) setSection("pricing");
      else if (errors.slug) setSection("seo");
      announce("Complete the required fields before submitting for review.", "error");
      return;
    }
    const product = await persist();
    if (!product) return;
    if (isAdminPortal) {
      const result = await runAction(product.id ?? draft.id, "submitReview");
      if (!result.ok) {
        announce(formatAdminError(result, { entity: "product", action: "submitted for review" }) ?? "Submission failed.", "error");
        return;
      }
      const nextDraft = draftFromProduct(result.product);
      setDraft(nextDraft);
      setBaseline(JSON.stringify(nextDraft));
      announce("Submitted for review on the server. A manager or admin will approve it.");
      setTimeout(() => navigate(exitTo), 900);
      return;
    }
    const result = await apiSubmitForReview(product.id, { scope: "employee" });
    if (!result.ok) {
      announce(result.error || "Submission failed.", "error");
      return;
    }
    const nextDraft = draftFromProduct(result.product);
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
    announce("Submitted for review. A manager or admin will approve it.");
    setTimeout(() => navigate(exitTo), 900);
  };

  const runApproveAndPublish = async () => {
    const product = await persist();
    if (!product) return;
    const result = await approveAndPublishProduct(product.id ?? draft.id);
    if (!result.ok) {
      announce(
        formatAdminError(result, { entity: "product", action: "published" }) ||
          result.error ||
          "Approve & publish failed.",
        "error"
      );
      return;
    }
    const nextDraft = draftFromProduct(result.product);
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
    announce("Published — this piece is now live in the storefront.");
    setTimeout(() => navigate(exitTo), 900);
  };

  /*
   * Lifecycle actions run on the SERVER (the publish gate — approved review
   * + no unresolved issues — is enforced there; the checklist in the
   * Publishing section is a convenience pre-check fed by
   * GET /admin/products/{id}/publish-issues, not the authority).
   */
  const [busyAction, setBusyAction] = useState(null);

  const runServerAction = async (action, okMessage) => {
    if (!draft.id || busyAction) return;
    setBusyAction(action);
    const result = await runAction(draft.id, action);
    setBusyAction(null);
    if (!result.ok) {
      announce(formatAdminError(result, { entity: "product", action }) || "The action failed.", "error");
      return;
    }
    const nextDraft = draftFromProduct(result.product);
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
    announce(okMessage);
  };

  const handlePublish = async () => {
    if (!draft.id) return;
    if (dirty) {
      announce(
        "Save your changes first — publication always acts on the last saved server record.",
        "error"
      );
      return;
    }
    if (isAdminPortal) {
      await runServerAction("publish", "Published — the server has this piece live in the storefront.");
      return;
    }
    const result = publishProduct(draft.id, actor);
    if (!result.ok) {
      announce((result.errors ?? [result.error]).join(" "), "error");
      return;
    }
    inventoryRepository.ensureOpeningStock(result.product, actor);
    const nextDraft = draftFromProduct(result.product);
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
    announce("Published — this piece is now live in the storefront.");
  };

  const handleArchive = async () => {
    if (!draft.id) return;
    if (isAdminPortal) {
      await runServerAction("archive", "Product archived on the server — removed from every customer surface.");
      return;
    }
    const result = archiveProduct(draft.id, actor);
    if (result.ok) {
      const nextDraft = draftFromProduct(result.product);
      setDraft(nextDraft);
      setBaseline(JSON.stringify(nextDraft));
      announce("Product archived.");
    }
  };

  const handleRestore = async () => {
    if (!draft.id) return;
    if (isAdminPortal) {
      await runServerAction("restore", "Product restored to draft on the server.");
      return;
    }
    const result = restoreProduct(draft.id, actor);
    if (result.ok) {
      const nextDraft = draftFromProduct(result.product);
      setDraft(nextDraft);
      setBaseline(JSON.stringify(nextDraft));
      announce("Product restored to draft.");
    }
  };

  const handleCancel = () => {
    if (dirty) {
      setConfirmCancel(true);
      return;
    }
    navigate(exitTo);
  };

  /* --- tab keyboard -------------------------------------------------- */

  const onTabKeyDown = (event) => {
    const index = SECTIONS.findIndex((entry) => entry.id === section);
    let next = null;
    if (event.key === "ArrowRight") next = SECTIONS[(index + 1) % SECTIONS.length];
    else if (event.key === "ArrowLeft") next = SECTIONS[(index - 1 + SECTIONS.length) % SECTIONS.length];
    else if (event.key === "Home") next = SECTIONS[0];
    else if (event.key === "End") next = SECTIONS[SECTIONS.length - 1];
    if (next) {
      event.preventDefault();
      setSection(next.id);
      tabRefs.current[next.id]?.focus();
    }
  };

  const currentSectionIndex = SECTIONS.findIndex((s) => s.id === section);
  const prevSection = currentSectionIndex > 0 ? SECTIONS[currentSectionIndex - 1] : null;
  const nextSection = currentSectionIndex < SECTIONS.length - 1 ? SECTIONS[currentSectionIndex + 1] : null;

  if (productId && loadState === "loading") {
    return (
      <div className="border border-mist/80 bg-canvas p-8 text-center">
        <p className="font-display text-2xl font-light text-ink">Loading product…</p>
        <p className="mt-2 font-ui text-sm text-taupe">Fetching the authoritative record from the server.</p>
      </div>
    );
  }

  if (productId && loadState === "error") {
    return (
      <div className="border border-mist/80 bg-canvas p-8 text-center">
        <p className="font-display text-2xl font-light text-ink">Product unavailable</p>
        <p className="mt-2 font-ui text-sm text-taupe">
          {loadError || "That product could not be found on the server."}
        </p>
        <AtelierButton size="chip" className="mt-5" onClick={() => navigate(exitTo)}>
          Back to products
        </AtelierButton>
      </div>
    );
  }

  const workflowState = getProductWorkflowState(draft);
  const editorLocked = draft.exists && !workflowState.editable;
  const readyToPublish =
    canPublish && draft.exists && workflowState.stage === WORKFLOW_STAGES.APPROVED;
  const canShortcutPublish =
    canPublish &&
    isAdminPortal &&
    draft.exists &&
    draft.status !== PRODUCT_STATUSES.PUBLISHED &&
    draft.status !== PRODUCT_STATUSES.ARCHIVED &&
    adminCreatedThisProduct(draft, actor);
  const shortcutBlocked = displayIssues.length > 0;

  return (
    <div className="pb-24">
      {/* Rejection Alert Header */}
      {draft.review?.state === "REJECTED" && draft.review.rejectionReason ? (
        <div className="mb-6 border-l-4 border-accent bg-accent/[0.06] p-4 text-ink">
          <p className="font-ui text-[11px] uppercase tracking-wider text-accent font-semibold">
            Action Required: Reviewer Rejection
          </p>
          <p className="mt-1 font-ui text-sm font-medium text-accent">
            &ldquo;{draft.review.rejectionReason}&rdquo;
          </p>
          <p className="mt-2 font-ui text-xs text-taupe">
            Please make the necessary corrections across the tabs below and click &quot;Submit for review&quot; to resubmit.
          </p>
        </div>
      ) : null}

      {/* Section tabs */}
      <div className="mb-8 overflow-x-auto border-b border-mist/80" role="tablist" aria-label="Product sections" onKeyDown={onTabKeyDown}>
        <div className="flex min-w-max gap-1">
          {SECTIONS.map((entry) => {
            const active = section === entry.id;
            const hasIssue = sectionDot(entry.id);
            return (
              <button
                key={entry.id}
                ref={(node) => {
                  tabRefs.current[entry.id] = node;
                }}
                type="button"
                role="tab"
                id={`tab-${entry.id}`}
                aria-selected={active}
                aria-controls={`panel-${entry.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setSection(entry.id)}
                className={cn(
                  "relative whitespace-nowrap px-4 py-3 font-ui text-[10px] uppercase tracking-[.16em] transition-colors",
                  active
                    ? "border-b-2 border-accent text-ink font-semibold"
                    : "border-b-2 border-transparent text-taupe hover:text-ink"
                )}
              >
                {entry.label}
                {hasIssue ? (
                  <span
                    aria-label="needs attention"
                    className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback line */}
      <div aria-live="polite" className="min-h-6">
        {feedback ? (
          <p
            className={cn(
              "mb-5 border px-4 py-3 font-ui text-sm",
              feedback.kind === "error"
                ? "border-accent/40 bg-accent/[0.05] text-accent"
                : "border-mist/80 bg-canvas text-ink"
            )}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>

      {editorLocked ? (
        <p className="mb-6 flex items-start gap-3 border border-amber-500/40 bg-amber-500/10 p-4 font-ui text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          This product is {workflowState.label.toLowerCase()} and cannot be edited in that lifecycle
          stage. Use Product Review to approve, publish, return, or archive it through the canonical
          workflow.
        </p>
      ) : null}

      {/* Active panel */}
      <div
        role="tabpanel"
        id={`panel-${section}`}
        aria-labelledby={`tab-${section}`}
        className="border border-mist/80 bg-surface/40 p-5 sm:p-7"
      >
        {section === "basics" ? <SectionBasics draft={draft} patch={patch} errors={errors} isNew={isNew} /> : null}
        {section === "attributes" ? <SectionAttributes draft={draft} patch={patch} /> : null}
        {section === "pricing" ? <SectionPricing draft={draft} patch={patch} /> : null}
        {section === "content" ? <SectionContent draft={draft} patch={patch} errors={errors} /> : null}
        {section === "media" ? <SectionMedia draft={draft} patch={patch} portal={portal} /> : null}
        {section === "seo" ? <SectionSeo draft={draft} patch={patch} errors={errors} /> : null}
        {section === "publishing" ? (
          <SectionPublishing draft={draft} patch={patch} publishIssues={displayIssues} serverCheck={isAdminPortal ? (serverIssuesError ? `Server checklist unavailable — ${serverIssuesError}` : "Checklist is the server’s own publish gate.") : "Local pre-check — the server re-validates on publish."} />
        ) : null}

        {/* Section stepping navigation */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-mist/70 pt-5">
          {prevSection ? (
            <button
              type="button"
              onClick={() => setSection(prevSection.id)}
              className="inline-flex items-center gap-1.5 font-ui text-[11px] uppercase tracking-wider text-taupe transition-colors hover:text-ink"
            >
              <ArrowLeft size={13} aria-hidden="true" /> {prevSection.label}
            </button>
          ) : (
            <span />
          )}

          {nextSection ? (
            <button
              type="button"
              onClick={() => setSection(nextSection.id)}
              className="inline-flex items-center gap-1.5 font-ui text-[11px] uppercase tracking-wider text-ink transition-colors hover:text-accent font-medium"
            >
              {nextSection.label} <ArrowRight size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Action bar */}
      <div className="mt-8 flex flex-col-reverse gap-3 border border-mist/80 bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <AtelierButton variant="outline" size="chip" onClick={handleCancel}>
            Cancel
          </AtelierButton>
          {dirty ? (
            <span className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">
              Unsaved changes
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {draft.exists && draft.status === PRODUCT_STATUSES.ARCHIVED ? (
            <AtelierButton variant="outline" size="chip" onClick={handleRestore}>
              <RotateCcw size={12} className="mr-1 inline" aria-hidden="true" /> Restore
            </AtelierButton>
          ) : draft.exists && canPublish ? (
            <AtelierButton variant="outline" size="chip" onClick={handleArchive}>
              <Archive size={12} className="mr-1 inline" aria-hidden="true" /> Archive
            </AtelierButton>
          ) : null}

          <AtelierButton
            variant="outline"
            size="chip"
            onClick={handleSaveDraft}
            disabled={editorLocked}
          >
            Save draft
          </AtelierButton>
          <AtelierButton
            variant="outline"
            size="chip"
            onClick={handleSaveAndContinue}
            disabled={editorLocked}
          >
            Save &amp; continue
          </AtelierButton>

          {readyToPublish ? (
            <AtelierButton size="chip" onClick={handlePublish}>
              Publish approved product
            </AtelierButton>
          ) : !editorLocked ? (
            <AtelierButton size="chip" onClick={handleSubmitForReview}>
              Submit for review
            </AtelierButton>
          ) : null}

          {canShortcutPublish && !readyToPublish ? (
            <AtelierButton
              size="chip"
              onClick={() => setConfirmPublish(true)}
              disabled={shortcutBlocked || busyAction}
            >
              Approve &amp; publish
            </AtelierButton>
          ) : null}
        </div>
      </div>

      {/* Cancel confirmation */}
      {confirmCancel ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Discard unsaved changes?"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          onClick={() => setConfirmCancel(false)}
        >
          <div
            className="w-full max-w-md border border-mist bg-ivory p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="font-display text-2xl font-light text-ink">Leave without saving?</p>
            <p className="mt-3 font-ui text-sm leading-relaxed text-taupe">
              This product has unsaved changes. If you leave now, everything entered since the last
              save will be lost.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <AtelierButton
                size="chip"
                onClick={() => {
                  setConfirmCancel(false);
                }}
              >
                Keep editing
              </AtelierButton>
              <AtelierButton
                variant="outline"
                size="chip"
                onClick={() => {
                  setConfirmCancel(false);
                  navigate(exitTo);
                }}
              >
                Discard &amp; leave
              </AtelierButton>
            </div>
          </div>
        </div>
      ) : null}

      {confirmPublish ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Approve and publish this product?"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          onClick={() => setConfirmPublish(false)}
        >
          <div className="w-full max-w-md border border-mist bg-ivory p-7" onClick={(event) => event.stopPropagation()}>
            <p className="font-display text-2xl font-light text-ink">Approve and publish?</p>
            <p className="mt-3 font-ui text-sm leading-relaxed text-taupe">
              Because you created this product, you can submit, approve and publish it in one step.
              The server still runs the same publish checklist. The piece will appear on the storefront.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <AtelierButton
                size="chip"
                onClick={() => {
                  setConfirmPublish(false);
                  runApproveAndPublish();
                }}
              >
                Publish now
              </AtelierButton>
              <AtelierButton variant="outline" size="chip" onClick={() => setConfirmPublish(false)}>
                Cancel
              </AtelierButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
