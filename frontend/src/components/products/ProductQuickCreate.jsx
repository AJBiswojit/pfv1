/**
 * Quick Create — the daily "add a product" path.
 *
 * Three steps, same catalogue record as the full merchandising editor:
 *   1. What is it  — taxonomy + name, then persist a DRAFT (unlocks media)
 *   2. Sell it     — price, colour, size, cover
 *   3. Ready       — description, checklist, save or submit for review
 *
 * Publishing rights, review workflow and the complete-record editor are
 * unchanged. This surface never writes lifecycle status itself.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { AtelierButton } from "../../design-system";
import { formatAdminError } from "../../services/admin/adminError";
import { approveAndPublishProduct, runAction } from "../../services/admin/productAdminService";
import { apiSubmitForReview } from "../../services/api/productsApi";
import { computePricing } from "../../utils/pricing";
import { formatINR } from "../../utils/shopping";
import { COLOR_OPTIONS, SIZE_OPTIONS } from "../../config/productCatalogConfig";
import { useProductMedia } from "../../hooks/useMedia";
import ProductMediaManager from "../media/ProductMediaManager";
import { cn } from "../../utils/cn";
import {
  ChipGroup,
  ChipRadio,
  Field,
  NumberInput,
  TextArea,
} from "./editorFields";
import { ProductTaxonomyFields } from "./editorSectionsBasics";
import { adminCreatedThisProduct, loadProductDraft, persistProductDraft } from "./persistProductDraft";
import { draftFromProduct, emptyDraft } from "./productDraftModel";

const STEPS = [
  { id: 1, label: "What is it" },
  { id: 2, label: "Sell it" },
  { id: 3, label: "Ready" },
];

export default function ProductQuickCreate({
  productId = null,
  portal = "admin",
  basePath = "/admin",
  actor = null,
  canPublish = false,
  exitTo = "/",
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const productsRoot = basePath;

  /** True for both "admin" and "super-admin" portals — both use the admin API scope. */
  const isAdminPortal = portal === "admin" || portal === "super-admin";

  const step = Math.min(3, Math.max(1, Number(params.get("step")) || 1));
  const setStep = (next) => {
    const copy = new URLSearchParams(params);
    copy.set("flow", "quick");
    copy.set("step", String(next));
    setParams(copy, { replace: true });
  };

  const [loadState, setLoadState] = useState(productId ? "loading" : "ready");
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState(() => emptyDraft());
  const [baseline, setBaseline] = useState(() => JSON.stringify(emptyDraft()));
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [identityAttempted, setIdentityAttempted] = useState(false);

  const patch = useCallback((partial) => {
    setDraft((current) => ({ ...current, ...partial }));
  }, []);

  const dirty = JSON.stringify(draft) !== baseline;
  const isNew = !draft.exists;

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
        return;
      }
      setLoadError(result.error ?? "That product could not be found on the server.");
      setLoadState("error");
    });
    return () => {
      cancelled = true;
    };
  }, [productId, portal]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* Clamp step to 1 when the draft hasn't been saved yet. Steps 2 and 3
   * require a persisted product ID — reaching them without one (e.g. via
   * the browser back button, a bookmark, or manual URL edit) would send
   * an incomplete request to the server. */
  useEffect(() => {
    if (!draft.exists && step > 1) {
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.exists]);

  const { items: mediaItems, summary: mediaSummary } = useProductMedia(draft.id);
  const hasCover = Boolean(
    mediaSummary?.hasCover ||
      mediaItems?.some((item) => item.role === "COVER") ||
      (draft.image && !String(draft.image).startsWith("data:"))
  );

  const pricing = computePricing(draft.pricing);
  const hasName = Boolean(draft.name.trim());
  const hasCategory = Boolean(draft.category);
  const hasDescription = Boolean(draft.description.trim() || draft.shortDescription.trim());
  const hasPrice = pricing.finalPrice > 0 && pricing.errors.length === 0;

  const checklist = [
    { id: "name", label: "Name", done: hasName },
    { id: "category", label: "Category", done: hasCategory },
    { id: "price", label: "Selling price", done: hasPrice },
    { id: "description", label: "Description", done: hasDescription },
    { id: "cover", label: "Cover image", done: hasCover, live: true },
  ];

  const announce = (message, kind = "success") => setFeedback({ kind, message });

  const persist = async () => {
    setBusy(true);
    try {
      const result = await persistProductDraft({ draft, portal, actor });
      if (!result.ok) {
        announce(result.error, "error");
        return null;
      }
      setDraft(result.product);
      setBaseline(JSON.stringify(result.product));
      return result.product;
    } finally {
      setBusy(false);
    }
  };

  const afterFirstSave = (product, nextStep) => {
    navigate(`${productsRoot}/products/${product.id}/edit?flow=quick&step=${nextStep}`, {
      replace: true,
    });
  };

  const handleContinueFromIdentity = async () => {
    setIdentityAttempted(true);
    if (!draft.name.trim()) {
      announce("Give the product a name before continuing.", "error");
      return;
    }
    if (!draft.category) {
      announce("Choose a category — it allocates the Product ID.", "error");
      return;
    }
    const product = await persist();
    if (!product) return;
    announce("Draft saved. Add price and a cover next.");
    if (isNew) afterFirstSave(product, 2);
    else setStep(2);
  };

  const handleContinueFromCommerce = async () => {
    if (!draft.exists || !draft.category) {
      setStep(1);
      announce("Complete the identity step first — name and category are required.", "error");
      return;
    }
    if (pricing.errors.length) {
      announce(pricing.errors[0], "error");
      return;
    }
    const product = await persist();
    if (!product) return;
    announce("Progress saved.");
    setStep(3);
  };

  const handleSaveDraft = async () => {
    if (!draft.name.trim() || !draft.category) {
      setStep(1);
      announce("Name and category are needed to save a draft.", "error");
      return;
    }
    const product = await persist();
    if (!product) return;
    announce(isAdminPortal ? "Draft saved on the server." : "Draft saved successfully.");
    if (isNew) afterFirstSave(product, step);
  };

  const handleSubmitForReview = async () => {
    if (!hasName || !hasCategory) {
      setStep(1);
      announce("Complete name and category before submitting.", "error");
      return;
    }
    if (!hasPrice) {
      setStep(2);
      announce("Set MRP and selling price before submitting.", "error");
      return;
    }
    if (!hasDescription) {
      setStep(3);
      announce("Add a description before submitting for review.", "error");
      return;
    }
    const product = await persist();
    if (!product) return;
    if (isAdminPortal) {
      const result = await runAction(product.id ?? draft.id, "submitReview");
      if (!result.ok) {
        announce(
          formatAdminError(result, { entity: "product", action: "submitted for review" }) ??
            "Submission failed.",
          "error"
        );
        return;
      }
      announce("Submitted for review. A manager or admin will approve it.");
      setTimeout(() => navigate(exitTo), 900);
      return;
    }
    const result = await apiSubmitForReview(product.id, { scope: "employee" });
    if (!result.ok) {
      announce(result.error || "Submission failed.", "error");
      return;
    }
    announce("Submitted for review. A manager or admin will approve it.");
    setTimeout(() => navigate(exitTo), 900);
  };

  const runApproveAndPublish = async () => {
    if (!hasName || !hasCategory || !hasPrice || !hasDescription) {
      announce("Name, category, price and description are required before publishing.", "error");
      return;
    }
    if (!hasCover) {
      announce("Add a cover image before publishing.", "error");
      return;
    }
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
    announce("Published — this piece is now live in the storefront.");
    setTimeout(() => navigate(exitTo), 900);
  };

  const handleCancel = () => {
    if (dirty) {
      setConfirmCancel(true);
      return;
    }
    navigate(exitTo);
  };

  const completeHref = draft.id
    ? `${productsRoot}/products/${draft.id}/edit`
    : `${productsRoot}/products/new?flow=full`;

  const setPricing = (partial) => patch({ pricing: { ...draft.pricing, ...partial } });
  const canShortcutPublish =
    canPublish &&
    draft.exists &&
    (adminCreatedThisProduct(draft, actor) || (!draft.assignedEmployeeId && canPublish));
  const shortcutReady = canShortcutPublish && hasName && hasCategory && hasPrice && hasDescription && hasCover;

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
        <p className="mt-2 font-ui text-sm text-taupe">{loadError}</p>
        <AtelierButton size="chip" className="mt-5" onClick={() => navigate(exitTo)}>
          Back to products
        </AtelierButton>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <ol className="mb-8 flex flex-wrap gap-1 border-b border-mist/80" aria-label="Create steps">
        {STEPS.map((entry) => {
          const active = step === entry.id;
          const done = step > entry.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => (draft.exists || entry.id === 1 ? setStep(entry.id) : null)}
                disabled={!draft.exists && entry.id > 1}
                className={cn(
                  "relative whitespace-nowrap px-4 py-3 font-ui text-[10px] uppercase tracking-[.16em] transition-colors",
                  active
                    ? "border-b-2 border-accent text-ink font-semibold"
                    : done
                      ? "border-b-2 border-transparent text-ink hover:text-accent"
                      : "border-b-2 border-transparent text-taupe"
                )}
              >
                {entry.id}. {entry.label}
              </button>
            </li>
          );
        })}
      </ol>

      {draft.exists ? (
        <p className="mb-5 font-ui text-[11px] uppercase tracking-[.14em] text-taupe">
          Draft <span className="text-ink">{draft.id}</span>
          {draft.sku ? (
            <>
              {" "}
              · SKU <span className="text-ink">{draft.sku}</span>
            </>
          ) : null}
        </p>
      ) : null}

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

      <div className="border border-mist/80 bg-surface/40 p-5 sm:p-7">
        {step === 1 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <ProductTaxonomyFields
              draft={draft}
              patch={patch}
              errors={{
                name: identityAttempted && !hasName ? "Product name is required." : "",
                category: identityAttempted && !hasCategory ? "Category is required." : "",
              }}
              isNew={isNew}
              nameId="qc-name"
            />
            <Field
              label="Short description"
              hint="Optional here. A fuller story is asked on the last step."
              htmlFor="qc-short"
              className="lg:col-span-2"
            >
              <TextArea
                id="qc-short"
                rows={2}
                value={draft.shortDescription}
                onChange={(event) => patch({ shortDescription: event.target.value })}
                placeholder="One line for cards and previews"
              />
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="MRP (₹)" required hint="List price — the struck-through figure." htmlFor="qc-mrp">
                <NumberInput
                  id="qc-mrp"
                  min="0"
                  step="1"
                  value={draft.pricing.mrp}
                  onChange={(event) => setPricing({ mrp: event.target.value })}
                  placeholder="8999"
                />
              </Field>
              <Field
                label="Selling price (₹)"
                required
                hint="The house price. Cannot exceed MRP."
                htmlFor="qc-selling"
              >
                <NumberInput
                  id="qc-selling"
                  min="0"
                  step="1"
                  value={draft.pricing.sellingPrice}
                  onChange={(event) => setPricing({ sellingPrice: event.target.value })}
                  placeholder="7499"
                />
              </Field>
            </div>
            {pricing.finalPrice > 0 ? (
              <p className="font-ui text-sm text-ink">
                Customer pays <span className="font-medium">{formatINR(pricing.finalPrice)}</span>
                {pricing.savings > 0 ? ` · saves ${formatINR(pricing.savings)}` : ""}
              </p>
            ) : null}
            {pricing.errors.length ? (
              <ul className="border border-accent/40 bg-accent/[0.05] p-4 font-ui text-sm text-accent">
                {pricing.errors.map((error) => (
                  <li key={error}>— {error}</li>
                ))}
              </ul>
            ) : null}

            <Field label="Primary colour" htmlFor="qc-color">
              <ChipRadio
                ariaLabel="Primary colour"
                options={COLOR_OPTIONS}
                value={draft.primaryColor}
                onChange={(value) => {
                  const colors = [...new Set([value, ...draft.colors].filter(Boolean))];
                  patch({ primaryColor: value, colors });
                }}
                allowCustom
              />
            </Field>

            <Field label="Sizes" hint="Free Size suits sarees and most ethnic drapes.">
              <ChipGroup
                ariaLabel="Sizes"
                options={[...new Set([...SIZE_OPTIONS, ...draft.sizes])]}
                value={draft.sizes}
                onToggle={(sizes) => patch({ sizes })}
                allowCustom
              />
            </Field>

            {draft.exists ? (
              <div className="space-y-3">
                <p className="font-ui text-[10px] uppercase tracking-[.18em] text-ink">Cover image</p>
                <ProductMediaManager
                  productId={draft.id}
                  scope={portal}
                  onChange={(product) => {
                    if (!product) return;
                    const next = draftFromProduct(product);
                    setDraft((current) => ({
                      ...current,
                      id: next.id,
                      exists: true,
                      sku: next.sku || current.sku,
                      image: next.image || current.image,
                    }));
                  }}
                />
              </div>
            ) : (
              <p className="font-ui text-xs text-taupe">Save the draft on the previous step to upload a cover.</p>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-8">
            <Field
              label="Description"
              required
              hint="The story on the product page. Short description from step 1 also counts."
              htmlFor="qc-description"
            >
              <TextArea
                id="qc-description"
                rows={5}
                value={draft.description}
                onChange={(event) => patch({ description: event.target.value })}
                placeholder="Woven with pure silk threads…"
              />
            </Field>

            <div>
              <p className="mb-3 font-ui text-[10px] uppercase tracking-[.18em] text-ink">Ready checklist</p>
              <ul className="border border-mist/80 bg-canvas divide-y divide-mist/70">
                {checklist.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="font-ui text-sm text-ink">{item.label}</span>
                    {item.done ? (
                      <span className="inline-flex items-center gap-1 font-ui text-[11px] uppercase tracking-wider text-ink">
                        <Check size={12} aria-hidden="true" /> Ready
                      </span>
                    ) : (
                      <span className="font-ui text-[11px] uppercase tracking-wider text-accent">
                        {item.live ? "Needed to go live" : "Needed to submit"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-ui text-[11px] text-taupe">
                A missing cover does not block submit — it will block publishing until a manager or admin adds one.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-mist/70 pt-5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1.5 font-ui text-[11px] uppercase tracking-wider text-taupe hover:text-ink"
            >
              <ArrowLeft size={13} aria-hidden="true" /> {STEPS[step - 2].label}
            </button>
          ) : (
            <span />
          )}
          {step === 1 ? (
            <AtelierButton size="chip" onClick={handleContinueFromIdentity} disabled={busy}>
              Save &amp; continue <ArrowRight size={12} className="ml-1 inline" aria-hidden="true" />
            </AtelierButton>
          ) : null}
          {step === 2 ? (
            <AtelierButton size="chip" onClick={handleContinueFromCommerce} disabled={busy}>
              Continue <ArrowRight size={12} className="ml-1 inline" aria-hidden="true" />
            </AtelierButton>
          ) : null}
        </div>
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 border border-mist/80 bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <AtelierButton variant="outline" size="chip" onClick={handleCancel}>
            Cancel
          </AtelierButton>
          <Link
            to={completeHref}
            className="font-ui text-[11px] uppercase tracking-wider text-taupe underline-offset-4 hover:text-ink hover:underline"
          >
            {draft.exists ? "Open complete record" : "Use full editor instead"}
          </Link>
          {dirty ? (
            <span className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">Unsaved changes</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AtelierButton variant="outline" size="chip" onClick={handleSaveDraft} disabled={busy}>
            Save draft
          </AtelierButton>
          <AtelierButton size="chip" onClick={handleSubmitForReview} disabled={busy}>
            Submit for review
          </AtelierButton>
          {canShortcutPublish ? (
            <AtelierButton
              size="chip"
              onClick={() => setConfirmPublish(true)}
              disabled={busy || !shortcutReady}
            >
              Approve &amp; publish
            </AtelierButton>
          ) : null}
        </div>
      </div>

      {confirmCancel ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Discard unsaved changes?"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          onClick={() => setConfirmCancel(false)}
        >
          <div className="w-full max-w-md border border-mist bg-ivory p-7" onClick={(event) => event.stopPropagation()}>
            <p className="font-display text-2xl font-light text-ink">Leave without saving?</p>
            <p className="mt-3 font-ui text-sm leading-relaxed text-taupe">
              This product has unsaved changes. If you leave now, everything entered since the last save will be lost.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <AtelierButton size="chip" onClick={() => setConfirmCancel(false)}>
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
