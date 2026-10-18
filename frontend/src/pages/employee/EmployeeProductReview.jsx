/**
 * /employee/products/review
 *
 * Phase 22 — MY ASSIGNED PRODUCTS.
 *
 * An employee works ONLY on the products assigned to them, with the
 * mandatory visual preview (complete media group), the fields their role
 * allows (name, category, subcategory, price, compare-at price,
 * description, metadata) and the two workflow actions:
 *   [Save Draft]  [Submit for Review]
 *
 * Authorization comes from the existing employee permission model — the
 * same `products.manage` permission and the product assignment. Employees
 * cannot delete, cannot change media ownership, cannot publish, cannot
 * reassign and cannot touch protected identifiers.
 */

import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Save } from "lucide-react";
import EmployeePage from "../../components/employee/EmployeePage";
import StatusBadge from "../../components/employee/StatusBadge";
import ProductPreview from "../../components/product/ProductPreview";
import { PERMISSIONS } from "../../config/employeePermissions";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { useProducts } from "../../hooks/useProducts";
import {
  employeeAssignedProducts,
  employeeCanEditProduct,
  getProductWorkflowView,
  mediaFileName,
  saveEmployeeDraft,
  submitProductForReview,
} from "../../services/productWorkflow";
import { getPublishIssues } from "../../services/catalogRepository";
import { getProductStatusLabel } from "../../config/productCatalogConfig";
import { resolveTaxonomySelectValue } from "../../services/taxonomyLifecycle";
import { useAssignableCategoryOptions, useAssignableSubcategories } from "../../hooks/useAssignableTaxonomy";
import { formatINR } from "../../utils/shopping";
import { reviewFlagLabel } from "../../services/productReviewFlags";

const fieldClass =
  "w-full border border-pf-border bg-pf-card px-3 py-2 font-ui text-sm outline-none focus:border-pf-gold-deep";
const labelClass = "mb-1 block font-ui text-[10px] uppercase tracking-[.16em] text-pf-muted";
const statusTone = { PUBLISHED: "ink", PENDING_REVIEW: "alert", DRAFT: "quiet", ARCHIVED: "muted" };

export default function EmployeeProductReview() {
  const { employee, hasPermission } = useEmployeeAuth();

  /* Permission gate.
   * The decision is captured here but the early return happens AFTER the
   * hooks below: returning above them changed the hook count between the
   * "not permitted" render and the "permitted" render, and React threw
   * "Rendered more hooks than during the previous render" and blanked the
   * page. */
  const isReviewDenied = !hasPermission(PERMISSIONS.PRODUCTS_VIEW);

  const actor = employee
    ? {
        employeeId: employee.employeeId,
        label: `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim(),
      }
    : null;

  const items = useProducts();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const assigned = useMemo(
    () => {
      const eid = employee?.employeeId;
      if (!eid) return [];
      // Filter from already-cached items instead of triggering another full catalog scan
      return items.filter((p) => p.assignedEmployeeId === eid && p.status !== "ARCHIVED");
    },
    [items, employee?.employeeId]
  );

  const requestedId = searchParams.get("product");
  const selected = useMemo(() => {
    if (!assigned.length) return null;
    return assigned.find((product) => product.id === requestedId) ?? assigned[0];
  }, [assigned, requestedId]);

  const canEdit = employeeCanEditProduct(employee, selected);

  const [form, setForm] = useState(null);
  const activeProduct = selected;
  const formKey = activeProduct?.id ?? "none";
  const draft = useMemo(
    () =>
      form && form.__key === formKey
        ? form
        : activeProduct
          ? {
              __key: formKey,
              name: activeProduct.name ?? "",
              category: activeProduct.category ?? "",
              subcategory: activeProduct.subcategory ?? "",
              price: activeProduct.price > 0 ? String(activeProduct.price) : "",
              compareAtPrice:
                (activeProduct.compareAtPrice ?? activeProduct.originalPrice) > 0
                  ? String(activeProduct.compareAtPrice ?? activeProduct.originalPrice)
                  : "",
              description: activeProduct.description ?? "",
              stock: activeProduct.stock > 0 ? String(activeProduct.stock) : "",
            }
          : null,
    [form, formKey, activeProduct]
  );

  const categoryOptions = useAssignableCategoryOptions();
  const subcategoryItems = useAssignableSubcategories(draft?.category);

  const update = (key, value) => setForm({ ...draft, __key: formKey, [key]: value });

  const save = () => {
    if (!draft) return;
    setBusy(true);
    const patch = {
      name: String(draft.name ?? "").trim(),
      category: draft.category,
      subcategory: draft.subcategory,
      price: draft.price === "" ? 0 : Number(draft.price) || 0,
      compareAtPrice: draft.compareAtPrice === "" ? null : Number(draft.compareAtPrice) || null,
      description: draft.description,
      stock: draft.stock === "" ? 0 : Math.max(0, Number(draft.stock) || 0),
    };
    const result = saveEmployeeDraft(selected.id, patch, employee, actor);
    setBusy(false);
    if (result.ok) {
      setNotice({ tone: "ok", text: `Draft ${selected.id} saved.` });
      setForm(null);
    } else {
      setNotice({ tone: "warn", text: result.error });
    }
  };

  const submit = () => {
    if (!selected) return;
    setBusy(true);
    const result = submitProductForReview(selected.id, actor);
    setBusy(false);
    if (result.ok) {
      setNotice({ tone: "ok", text: `${selected.id} submitted for review.` });
    } else {
      setNotice({ tone: "warn", text: result.error ?? "Could not submit." });
    }
  };

  const view = useMemo(() => selected ? getProductWorkflowView(selected) : null, [selected]);
  /* Generic publish validation for all products — same rules for every department. */
  const issues = useMemo(() => selected ? getPublishIssues(selected) : [], [selected]);

  /* Every hook above has run — only now may the component bail out. */
  if (isReviewDenied) {
    return <Navigate to="/employee/access-denied" replace />;
  }

  const primaryFileName = mediaFileName(view?.mediaSet?.primary) || null;
  const nameNeedsReview = false;

  const discountPercent = (() => {
    if (!selected) return null;
    const selling = Number(selected.price) || 0;
    const compare = Number(selected.compareAtPrice ?? selected.originalPrice) || 0;
    if (selling <= 0 || compare <= selling) return null;
    return Math.round(((compare - selling) / compare) * 100);
  })();

  const viewChips = view
    ? ["front", "side", "back", "detail"]
        .filter((viewId) => view.mediaSet[viewId])
        .map((viewId) => viewId.charAt(0).toUpperCase() + viewId.slice(1))
    : [];

  return (
    <EmployeePage
      eyebrow="Catalogue / Products"
      title={
        <>
          My assigned <span className="italic text-pf-burgundy">products.</span>
        </>
      }
      description="Only the products assigned to you. Every product shows its complete media group — you never edit a product without seeing its imagery. Save as draft, then submit for review."
    >
      {notice ? (
        <p
          aria-live="polite"
          className={`mb-6 border px-4 py-3 font-ui text-sm ${
            notice.tone === "warn"
              ? "border-pf-gold-deep/60 bg-pf-burgundy/5 text-pf-burgundy"
              : "border-pf-border/80 bg-pf-card text-pf-text"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {!assigned.length ? (
        <div className="border border-pf-border bg-pf-card px-6 py-16 text-center">
          <p className="font-display text-xl font-light text-pf-text">No assigned products yet.</p>
          <p className="mx-auto mt-2 max-w-md font-ui text-sm text-pf-muted">
            When an admin assigns a product draft to you, it appears here with its complete
            image preview.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Assigned list ------------------------------------------- */}
          <aside className="space-y-2">
            <p className="font-ui text-[10px] uppercase tracking-[.2em] text-pf-muted">
              Assigned to you · {assigned.length}
            </p>
            {assigned.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setSearchParams({ product: product.id })}
                className={`w-full border px-3 py-2.5 text-left transition-colors ${
                  selected?.id === product.id
                    ? "border-pf-burgundy bg-pf-card"
                    : "border-pf-border bg-pf-card/60 hover:border-pf-burgundy/50"
                }`}
              >
                <span className="block font-ui text-xs font-medium text-pf-text">
                  {product.id}
                </span>
                <span className="block truncate font-ui text-[11px] text-pf-muted">
                  {product.name?.trim() || "[Not yet defined]"}
                </span>
                <span className="mt-1 block">
                  <StatusBadge
                    label={getProductStatusLabel(product.status)}
                    tone={statusTone[product.status] ?? "quiet"}
                  />
                </span>
              </button>
            ))}
          </aside>

          {/* Workspace ----------------------------------------------- */}
          <section className="min-w-0">
            {!canEdit ? (
              <div className="border border-pf-gold-deep/50 bg-pf-burgundy/5 px-6 py-10 text-center">
                <p className="font-display text-xl font-light text-pf-text">
                  You are not authorized to edit {selected?.id ?? "this product"}.
                </p>
                <p className="mx-auto mt-2 max-w-md font-ui text-sm text-pf-muted">
                  Only the employee the product is assigned to may edit it. Choose one of your
                  assigned products on the left.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border border-pf-border bg-pf-card px-4 py-3">
                  <div>
                    <p className="font-ui text-[10px] uppercase tracking-[.24em] text-pf-burgundy">
                      Product ID · {selected.id}
                    </p>
                    <p className="font-display text-xl font-light text-pf-text">
                      {selected.name?.trim() || <span className="text-pf-muted">[Not yet defined]</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={getProductStatusLabel(selected.status)}
                      tone={statusTone[selected.status] ?? "quiet"}
                    />
                    <StatusBadge label={formatINR(selected.price)} tone="ink" />
                    {discountPercent != null ? (
                      <StatusBadge label={`−${discountPercent}%`} tone="alert" />
                    ) : null}
                    {viewChips.length ? (
                      <StatusBadge label={viewChips.join(" · ")} tone="quiet" />
                    ) : null}
                    <StatusBadge label={`Inventory · ${Number(selected.stock ?? 0)}`} tone="quiet" />
                  </div>
                </div>

                {/* Media, taxonomy & hover facts ---------------------- */}
                <dl className="grid gap-x-6 gap-y-1 border border-pf-border bg-pf-card px-4 py-3 font-ui text-[11px] text-pf-muted sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex gap-2">
                    <dt className="uppercase tracking-[.14em] text-pf-muted/70">Media file</dt>
                    <dd className="text-pf-text">{primaryFileName ?? "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="uppercase tracking-[.14em] text-pf-muted/70">Category</dt>
                    <dd className="text-pf-text">{selected.category || "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="uppercase tracking-[.14em] text-pf-muted/70">Subcategory</dt>
                    <dd className={selected.subcategory ? "text-pf-text" : "text-pf-burgundy"}>
                      {selected.subcategory || "SUBCATEGORY REVIEW REQUIRED"}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="uppercase tracking-[.14em] text-pf-muted/70">Assignment</dt>
                    <dd className="text-pf-text">
                      {selected.assignedEmployeeId ?? "—"}
                    </dd>
                  </div>
                  {hover ? (
                    <div className="flex gap-2">
                      <dt className="uppercase tracking-[.14em] text-pf-muted/70">Hover</dt>
                      <dd className="text-pf-text">
                        {hover.changesOnHover ? hover.hoverFile : "no change (single image)"}
                      </dd>
                    </div>
                  ) : null}
                  {selected.reviewFlags?.length ? (
                    <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
                      <dt className="uppercase tracking-[.14em] text-pf-muted/70">Review flags</dt>
                      <dd className="text-pf-burgundy">
                        {selected.reviewFlags.map((flag) => reviewFlagLabel(flag)).join(" · ")}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {/* Mandatory visual preview -------------------------- */}
                <ProductPreview
                  product={selected}
                  category={selected.category}
                  conflicts={view?.conflicts ?? []}
                />

                {/* Editable fields ------------------------------------ */}
                {draft ? (
                  <div className="space-y-4 border border-pf-border bg-pf-card p-4">
                    <div>
                      <label htmlFor={`emp-name-${selected.id}`} className={labelClass}>
                        Product name
                      </label>
                      <input
                        id={`emp-name-${selected.id}`}
                        value={draft.name}
                        onChange={(event) => update("name", event.target.value)}
                        placeholder="Boys Cotton Casual Set in Yellow"
                        className={fieldClass}
                      />
                      {nameNeedsReview ? (
                        <p className="mt-1 font-ui text-[10px] uppercase tracking-[.12em] text-pf-burgundy">
                          Name review required — this name reads like another department&apos;s product.
                          Describe the actual product.
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`emp-cat-${selected.id}`} className={labelClass}>
                          Category
                        </label>
                        <select
                          id={`emp-cat-${selected.id}`}
                          value={resolveTaxonomySelectValue(categoryOptions, draft.category)}
                          onChange={(event) => {
                            setForm({
                              ...draft,
                              __key: formKey,
                              category: event.target.value,
                              subcategory: "",
                            });
                          }}
                          className={fieldClass}
                        >
                          <option value="">— Select category —</option>
                          {categoryOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`emp-sub-${selected.id}`} className={labelClass}>
                          Subcategory
                        </label>
                        <select
                          id={`emp-sub-${selected.id}`}
                          value={resolveTaxonomySelectValue(subcategoryItems, draft.subcategory)}
                          onChange={(event) => update("subcategory", event.target.value)}
                          className={fieldClass}
                        >
                          <option value="">— Select subcategory —</option>
                          {subcategoryItems.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`emp-price-${selected.id}`} className={labelClass}>
                          Price (₹)
                        </label>
                        <input
                          id={`emp-price-${selected.id}`}
                          type="number"
                          min="0"
                          value={draft.price}
                          onChange={(event) => update("price", event.target.value)}
                          placeholder="1290"
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label htmlFor={`emp-compare-${selected.id}`} className={labelClass}>
                          Compare-at price (₹)
                        </label>
                        <input
                          id={`emp-compare-${selected.id}`}
                          type="number"
                          min="0"
                          value={draft.compareAtPrice}
                          onChange={(event) => update("compareAtPrice", event.target.value)}
                          placeholder="1690"
                          className={fieldClass}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`emp-stock-${selected.id}`} className={labelClass}>
                          Inventory (units)
                        </label>
                        <input
                          id={`emp-stock-${selected.id}`}
                          type="number"
                          min="0"
                          value={draft.stock}
                          onChange={(event) => update("stock", event.target.value)}
                          placeholder="12"
                          className={fieldClass}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor={`emp-desc-${selected.id}`} className={labelClass}>
                        Description
                      </label>
                      <textarea
                        id={`emp-desc-${selected.id}`}
                        rows={3}
                        value={draft.description}
                        onChange={(event) => update("description", event.target.value)}
                        placeholder="Fabric, fit, occasion — the commercial information a customer needs."
                        className={fieldClass}
                      />
                    </div>

                    {issues.length ? (
                      <div className="border border-pf-gold-deep/40 bg-pf-burgundy/5 px-3 py-2">
                        <p className="font-ui text-[10px] uppercase tracking-[.16em] text-pf-burgundy">
                          Still needed before publishing
                        </p>
                        <ul className="mt-1 list-disc pl-4 font-ui text-[11px] text-pf-text/80">
                          {issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 border-t border-pf-border pt-4">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={save}
                        className="inline-flex items-center gap-1.5 border border-pf-burgundy bg-pf-burgundy px-4 py-2 font-ui text-[10px] uppercase tracking-[.16em] text-pf-ivory transition-colors hover:bg-transparent hover:text-pf-text disabled:opacity-40"
                      >
                        <Save size={11} aria-hidden="true" /> Save Draft
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={submit}
                        className="inline-flex items-center gap-1.5 border border-pf-burgundy px-4 py-2 font-ui text-[10px] uppercase tracking-[.16em] text-pf-text transition-colors hover:bg-pf-burgundy hover:text-pf-ivory disabled:opacity-40"
                      >
                        <ArrowRight size={11} aria-hidden="true" /> Submit for Review
                      </button>
                    </div>

                    <p className="font-ui text-[10px] leading-relaxed text-pf-muted/70">
                      You can edit name, category, subcategory, price, compare-at price and
                      description. Publishing, media ownership and assignment stay with the
                      admin review desk.
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}
    </EmployeePage>
  );
}
