/**
 * /admin/products — Phase 5: the merchandising desk is BACKEND-DRIVEN.
 *
 * Search, status/category filters and sort run as real query parameters on
 * `GET /admin/products` (server-side), the table pages through the server's
 * `total`, and the metric tiles read `GET /admin/products/metrics`. Rows are
 * the server records reconciled into the shared catalogue cache; media
 * summaries come from the Phase 12 register. Every row action (quick publish,
 * duplicate, archive, restore, bulk flags) awaits its admin endpoint and
 * reports the server's outcome verbatim — no local-first mutation, no
 * invented counts, no fake success. Loading / empty / error are distinct
 * states: a failed fetch says what failed; an empty result says "no matches".
 */

import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  Check,
  ClipboardCheck,
  Copy,
  Eye,
  Images,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UploadCloud,
} from "lucide-react";
import AdminPage from "../../components/admin/AdminPage";
import AdminPanel from "../../components/admin/AdminPanel";
import AdminMetricCard from "../../components/admin/AdminMetricCard";
import StatusBadge from "../../components/employee/StatusBadge";
import ConfirmDialog from "../../components/orders/ConfirmDialog";
import { AtelierButton } from "../../design-system";
import catalogRepository from "../../services/catalogRepository";
import {
  WORKFLOW_STAGES,
  getProductWorkflowState,
} from "../../services/workflow/productWorkflowState";
import { fetchAdminMetrics, fetchAdminProducts, runAction, runBulkFlags } from "../../services/admin/productAdminService";
import { formatAdminError } from "../../services/admin/adminError";
import { useProductMediaSummaries } from "../../hooks/useMedia";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { resolveProductCover } from "../../services/media/productMediaSource";
import { describeDiscount } from "../../utils/pricing";
import { formatINR } from "../../utils/shopping";
import { CATEGORY_OPTIONS, getProductStatusLabel } from "../../config/productCatalogConfig";
import { categoryLabels } from "../../data/products/taxonomy";

const discountLabel = (product) => {
  const fromPricing = describeDiscount(product.pricing);
  if (fromPricing !== "—") return fromPricing;
  if (product.originalPrice > product.price) {
    return `${Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% off`;
  }
  return "—";
};

const STATUS_FILTERS = [
  { id: "ALL", label: "All" },
  { id: "PUBLISHED", label: "Published" },
  { id: "PENDING_REVIEW", label: "Pending review" },
  { id: "DRAFT", label: "Draft" },
  { id: "ARCHIVED", label: "Archived" },
];

const statusTone = {
  PUBLISHED: "ink",
  PENDING_REVIEW: "alert",
  DRAFT: "quiet",
  ARCHIVED: "muted",
};

const ProductRow = memo(function ProductRow({
  product,
  summary,
  cover,
  selected,
  onToggleSelect,
  onPublishQuick,
  onDuplicate,
  onArchive,
  onRestore,
  busyId,
}) {
  const canQuickPublish = getProductWorkflowState(product).stage === WORKFLOW_STAGES.APPROVED;
  const isBusy = busyId === product.id;
  return (
    <tr className="border-b border-mist/60 font-ui text-sm">
      <td className="px-3 py-4 align-top">
        <input
          type="checkbox"
          aria-label={`Select ${product.name}`}
          checked={selected.includes(product.id)}
          onChange={() => onToggleSelect(product.id)}
        />
      </td>
      <td className="px-3 py-4">
        <div className="flex items-center gap-3">
          {cover?.src ? (
            <img src={cover.src} alt="" loading="lazy" className="h-12 w-10 shrink-0 object-cover border border-mist/60" />
          ) : (
            <span className="h-12 w-10 shrink-0 bg-mist/60 flex items-center justify-center font-ui text-[9px] text-taupe">No img</span>
          )}
          <div className="min-w-0">
            <Link
              to={`/admin/products/${product.id}`}
              className="block max-w-56 truncate font-medium text-ink underline-offset-4 hover:text-accent hover:underline"
            >
              {product.name}
            </Link>
            <p className="text-[11px] text-taupe">{product.brand}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-4 align-top text-taupe font-mono text-xs">{product.sku}</td>
      <td className="px-3 py-4 align-top">
        <span className="font-medium text-ink">{categoryLabels[product.category] ?? product.category}</span>
        {product.subcategory ? <span className="block text-[11px] text-taupe">{product.subcategory}</span> : null}
      </td>
      <td className="px-3 py-4 align-top">
        <span className="font-medium text-ink">{formatINR(product.price)}</span>
        {product.originalPrice > product.price ? (
          <span className="block text-[11px] text-taupe line-through">{formatINR(product.originalPrice)}</span>
        ) : null}
      </td>
      <td className="px-3 py-4 align-top text-taupe">{discountLabel(product)}</td>
      <td className="px-3 py-4 align-top">{product.variants?.length || "—"}</td>
      <td className="px-3 py-4 align-top">
        {!summary || summary.isEmpty ? (
          <Link
            to={`/admin/products/${product.id}/media`}
            className="font-ui text-[11px] uppercase tracking-widest text-taupe underline-offset-4 hover:text-accent hover:underline"
          >
            Add media
          </Link>
        ) : (
          <Link
            to={`/admin/products/${product.id}/media`}
            className="flex flex-col gap-0.5 underline-offset-4 hover:text-accent hover:underline"
          >
            <span className="font-ui text-[11px] text-ink">{summary.images} img · {summary.videos} vid</span>
            {summary.needsCover && !product.image ? (
              <span className="font-ui text-[10px] uppercase tracking-widest text-accent font-semibold">Needs cover</span>
            ) : null}
          </Link>
        )}
      </td>
      <td className="px-3 py-4 align-top">
        <StatusBadge label={getProductStatusLabel(product.status)} tone={statusTone[product.status] ?? "quiet"} />
      </td>
      <td className="px-3 py-4 align-top text-[11px] text-taupe">
        {product.updatedAt ? new Date(product.updatedAt).toLocaleDateString("en-IN") : "—"}
        {product.updatedBy ? <span className="block text-[10px]">{product.updatedBy}</span> : null}
      </td>
      <td className="px-3 py-4 align-top">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to={`/admin/products/${product.id}`} aria-label={`View ${product.name}`} title="View record" className="text-taupe hover:text-ink"><Eye size={15} aria-hidden="true" /></Link>
          <Link to={`/admin/products/${product.id}/edit`} aria-label={`Edit ${product.name}`} title="Edit product" className="text-taupe hover:text-ink"><Pencil size={15} aria-hidden="true" /></Link>
          <Link to={`/admin/products/${product.id}/media`} aria-label={`Manage media for ${product.name}`} title="Manage Media" className="text-taupe hover:text-ink"><Images size={15} aria-hidden="true" /></Link>
          {canQuickPublish ? (
            <button
              type="button"
              aria-label={`Publish approved product ${product.name}`}
              title="Publish approved product"
              disabled={isBusy}
              onClick={() => onPublishQuick(product)}
              className={`text-taupe hover:text-accent ${isBusy ? "opacity-40" : ""}`}
            >
              <Check size={15} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Duplicate ${product.name}`}
            title="Duplicate"
            disabled={isBusy}
            onClick={() => onDuplicate(product)}
            className={`text-taupe hover:text-ink ${isBusy ? "opacity-40" : ""}`}
          >
            <Copy size={15} aria-hidden="true" />
          </button>
          {product.status === "ARCHIVED" ? (
            <button type="button" aria-label={`Restore ${product.name}`} title="Restore" disabled={isBusy} onClick={() => onRestore(product)} className={`text-taupe hover:text-ink ${isBusy ? "opacity-40" : ""}`}><RotateCcw size={15} aria-hidden="true" /></button>
          ) : (
            <button type="button" aria-label={`Archive ${product.name}`} title="Archive" disabled={isBusy} onClick={() => onArchive(product)} className={`text-taupe hover:text-accent ${isBusy ? "opacity-40" : ""}`}><Archive size={15} aria-hidden="true" /></button>
          )}
        </div>
      </td>
    </tr>
  );
});

export default function AdminProducts() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState(null);

  /* Server-driven list state — never optimistic, never a local subset. */
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [isListLoading, setIsListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const pageSize = 25;

  // Debounce search input before it becomes a server query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const reload = useCallback(async () => {
    const result = await fetchAdminProducts({
      q: debouncedQuery || undefined,
      status: status === "ALL" ? undefined : status,
      category: category === "ALL" ? undefined : category,
      sort,
      page,
      pageSize,
    });
    if (result.ok) {
      setRows(result.items ?? []);
      setTotal(result.total ?? 0);
      setListError(null);
    } else {
      setRows([]);
      setTotal(0);
      setListError(formatAdminError(result, { entity: "product list", action: "loaded" }));
    }
    setIsListLoading(false);
  }, [debouncedQuery, status, category, sort, page]);

  const reloadMetrics = useCallback(async () => {
    const result = await fetchAdminMetrics();
    if (result.ok) {
      setMetrics(result.metrics ?? null);
      setMetricsError(null);
    } else {
      setMetrics(null);
      setMetricsError(formatAdminError(result, { entity: "catalogue metrics", action: "loaded" }));
    }
  }, []);

  useEffect(() => {
    setIsListLoading(true);
    reload();
  }, [reload]);

  /* Metrics tiles — the server's CatalogMetricsResponse, or an honest
     "unavailable"; never a locally fabricated count. Refreshed whenever the
     list reloads so a publish/archive moves the tiles too. */
  const [metricsError, setMetricsError] = useState(null);
  useEffect(() => {
    reloadMetrics();
  }, [reloadMetrics, total]);

  /* Normalize server rows through the shared repository record shape so the
     table renders the same fields every surface uses. */
  const items = useMemo(
    () => rows.map((row) => catalogRepository.find(row.id) ?? row),
    [rows]
  );

  const mediaSummaries = useProductMediaSummaries(items);

  // Covers only for the rows actually rendered
  const covers = useMemo(
    () => Object.fromEntries(items.map((product) => [product.id, resolveProductCover(product)])),
    [items]
  );

  const toggleSelect = useCallback((id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    ), []);

  const allVisibleSelected = items.length > 0 && items.every((p) => selected.includes(p.id));

  const toggleSelectAll = useCallback(() => {
    const visibleIds = new Set(items.map((product) => product.id));
    setSelected((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.has(id))
        : [...new Set([...current, ...visibleIds])]
    );
  }, [allVisibleSelected, items]);

  /**
   * Merchandising bulk actions run through POST /admin/products/bulk — the
   * backend applies the flag patch to every ID it accepts (merchandising
   * fields only; status is refused by design) and the desk reloads its page
   * from the server instead of assuming the patch client-side.
   */
  const runMerchandisingBulk = useCallback(async (patch, label) => {
    if (!selected.length || bulkBusy) return;
    const ids = [...selected];
    setBulkBusy(true);
    setNotice(`${label}: applying to ${ids.length} product${ids.length === 1 ? "" : "s"} on the server…`);
    const result = await runBulkFlags(ids, patch, { reload: async () => { await Promise.all([reload(), reloadMetrics()]); } });
    if (result.ok) {
      setNotice(`${label}: applied on the server to ${ids.length} product${ids.length === 1 ? "" : "s"}.`);
    } else {
      setNotice(formatAdminError(result, { entity: "bulk update", action: "applied" }));
    }
    setSelected([]);
    setBulkBusy(false);
  }, [selected, bulkBusy, reload]);

  /**
   * Bulk lifecycle actions run the SAME canonical per-product endpoint for
   * every selected ID — sequentially, each awaited — and the report shows
   * each server rejection verbatim. A product the server blocks stays
   * exactly as it was; there is no local fallback transition.
   */
  const runWorkflowBulk = useCallback(async () => {
    if (!pendingBulkAction || !selected.length || bulkBusy) return;
    const action = pendingBulkAction;
    const ids = [...selected];
    setPendingBulkAction(null);
    setBulkBusy(true);
    setNotice(`${action.label}: processing ${ids.length} products on the server…`);
    const results = [];
    for (const id of ids) {
      const result = await runAction(id, action.id === "publish" ? "publish" : "archive");
      const product = catalogRepository.find(id);
      results.push({
        id,
        name: product?.name ?? id,
        ok: Boolean(result.ok),
        reasons: result.ok ? [] : [formatAdminError(result, { entity: product?.name ?? id, action: action.id })],
      });
    }
    await Promise.all([reload(), reloadMetrics()]);
    const applied = results.filter((result) => result.ok).length;
    const blocked = results.filter((result) => !result.ok);
    setNotice(
      <>
        <p>
          {action.label}: the server applied this to {applied} product{applied === 1 ? "" : "s"}
          {blocked.length ? `, ${blocked.length} refused.` : "."}
        </p>
        {blocked.length ? (
          <ul className="mt-2 max-h-56 list-disc space-y-1 overflow-y-auto pl-5 text-accent">
            {blocked.map((result) => (
              <li key={result.id}>
                <span className="font-medium">{result.id}</span>{" — "}
                {result.reasons.join(" ")}
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
    setSelected([]);
    setBulkBusy(false);
  }, [pendingBulkAction, selected, bulkBusy, reload]);

  const publishQuick = useCallback(async (product) => {
    if (busyId) return;
    setBusyId(product.id);
    const result = await runAction(product.id, "publish");
    setNotice(
      result.ok
        ? `Published “${product.name}” — the server has put it live for customers.`
        : formatAdminError(result, { entity: `“${product.name}”`, action: "published" })
    );
    await Promise.all([reload(), reloadMetrics()]);
    setBusyId(null);
  }, [busyId, reload]);

  const handleDuplicate = useCallback(async (product) => {
    if (busyId) return;
    setBusyId(product.id);
    const result = await runAction(product.id, "duplicate");
    setNotice(
      result.ok
        ? `Duplicated on the server as “${result.product?.name ?? "a draft copy"}” — review its identity fields.`
        : formatAdminError(result, { entity: `“${product.name}”`, action: "duplicated" })
    );
    await Promise.all([reload(), reloadMetrics()]);
    setBusyId(null);
  }, [busyId, reload]);

  const handleArchive = useCallback(async (product) => {
    if (busyId) return;
    setBusyId(product.id);
    const result = await runAction(product.id, "archive");
    setNotice(
      result.ok
        ? `Archived “${product.name}” — it is removed from every customer surface until restored.`
        : formatAdminError(result, { entity: `“${product.name}”`, action: "archived" })
    );
    await Promise.all([reload(), reloadMetrics()]);
    setBusyId(null);
  }, [busyId, reload]);

  const handleRestore = useCallback(async (product) => {
    if (busyId) return;
    setBusyId(product.id);
    const result = await runAction(product.id, "restore");
    setNotice(
      result.ok
        ? `Restored “${product.name}” to draft.`
        : formatAdminError(result, { entity: `“${product.name}”`, action: "restored" })
    );
    await Promise.all([reload(), reloadMetrics()]);
    setBusyId(null);
  }, [busyId, reload]);

  const clearNotice = () => setNotice(null);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(clearNotice, 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminPage
      eyebrow="Business / Products"
      title={<>Product <span className="italic text-accent">catalog.</span></>}
      description="One catalogue serves the storefront, the portals and every future surface. This desk is fully server-backed: filters, sort, pagination and every action run against the catalogue API."
      actions={
        <>
          <AtelierButton as={Link} to="/admin/products/review" size="chip" variant="outline">
            <ClipboardCheck size={13} aria-hidden="true" /> Review queue{metrics?.pendingReview ? ` (${metrics.pendingReview})` : ""}
          </AtelierButton>
          <AtelierButton as={Link} to="/admin/products/new" size="chip">
            <Plus size={13} aria-hidden="true" /> Create product
          </AtelierButton>
        </>
      }
    >
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {metricsError ? (
          <div className="col-span-full border border-accent/40 bg-canvas px-4 py-3 font-ui text-xs text-accent" role="alert">
            Metrics unavailable — {metricsError}
          </div>
        ) : !metrics ? (
          <div className="col-span-full font-ui text-xs text-taupe">Loading catalogue metrics from the server…</div>
        ) : (
          [
            { label: "Total", value: metrics.total, hint: "Every product record" },
            { label: "Published", value: metrics.published, hint: "Visible to customers" },
            { label: "Draft", value: metrics.draft, hint: "In progress" },
            { label: "Pending Review", value: metrics.pendingReview, hint: "Awaiting approval", alert: (metrics.pendingReview ?? 0) > 0 },
            { label: "Archived", value: metrics.archived, hint: "Retired, order-safe" },
            { label: "Unassigned", value: metrics.unassigned, hint: "No owner on draft/review work", alert: (metrics.unassigned ?? 0) > 0 },
            { label: "Blocked", value: metrics.blocked, hint: "Carrying blocking review flags", alert: (metrics.blocked ?? 0) > 0 },
          ].map((tile) => (
            <AdminMetricCard
              key={tile.label}
              label={tile.label}
              value={tile.value ?? 0}
              hint={tile.hint}
              tone={tile.alert ? "alert" : "default"}
            />
          ))
        )}
      </div>

      {notice ? (
        <div aria-live="polite" className="mb-5 border border-mist/80 bg-canvas px-4 py-3 font-ui text-sm text-ink">
          {notice}
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={Boolean(pendingBulkAction)}
        title={`${pendingBulkAction?.label ?? "Update"} selected products?`}
        description={
          pendingBulkAction?.id === "publish"
            ? `Each of the ${selected.length} selected Product IDs will run its own Publish call on the server. Only approved Products that pass the publish gate will go live; blocked Products stay unchanged and their exact server errors will be shown.`
            : `Each of the ${selected.length} selected Product IDs will run its own Archive call on the server. Archived Products leave every customer surface immediately.`
        }
        confirmLabel={pendingBulkAction?.label ?? "Confirm"}
        cancelLabel="Cancel"
        onConfirm={runWorkflowBulk}
        onCancel={() => setPendingBulkAction(null)}
        tone={pendingBulkAction?.id === "archive" ? "danger" : "primary"}
      />

      <AdminPanel eyebrow="Catalog" title={`Products${total ? ` · ${total}` : ""}`}>
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Search products</span>
            <Search className="absolute left-3 top-3 text-taupe" size={15} aria-hidden="true" />
            <input
              aria-label="Search products"
              className="w-full border border-mist py-2.5 pl-9 pr-3 font-ui text-sm outline-none focus:border-accent"
              placeholder="Search name, SKU, ID, category, fabric…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="flex items-center gap-2">
            <label htmlFor="admin-category-filter" className="sr-only">Filter by category</label>
            <select
              id="admin-category-filter"
              aria-label="Filter by category"
              value={category}
              onChange={(event) => { setCategory(event.target.value); setPage(1); }}
              className="border border-mist bg-canvas px-3 py-2.5 font-ui text-xs text-ink outline-none focus:border-accent"
            >
              <option value="ALL">All categories</option>
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
            <label htmlFor="admin-sort" className="sr-only">Sort products</label>
            <select
              id="admin-sort"
              aria-label="Sort products"
              value={sort}
              onChange={(event) => { setSort(event.target.value); setPage(1); }}
              className="border border-mist bg-canvas px-3 py-2.5 font-ui text-xs text-ink outline-none focus:border-accent"
            >
              {[
                ["newest", "Newest"],
                ["oldest", "Oldest"],
                ["name", "Name A–Z"],
                ["price-asc", "Price ↑"],
                ["price-desc", "Price ↓"],
                ["status", "Status"],
                ["updated", "Recently updated"],
              ].map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status filter">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={status === option.id}
                onClick={() => { setStatus(option.id); setPage(1); }}
                className={
                  status === option.id
                    ? "border border-ink bg-ink px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ivory"
                    : "border border-mist px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe transition-colors hover:border-ink hover:text-ink"
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {selected.length ? (
          <div className="mb-5 flex flex-wrap items-center gap-2 border border-mist/80 bg-canvas p-3">
            <p className="mr-2 font-ui text-[11px] uppercase tracking-[.16em] text-ink font-medium">{selected.length} selected{bulkBusy ? " · processing…" : ""}</p>
            <button type="button" disabled={bulkBusy} onClick={() => setPendingBulkAction({ id: "publish", label: "Publish" })} className="border border-mist px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe transition-colors hover:border-ink hover:text-ink disabled:opacity-40"><UploadCloud size={11} className="mr-1 inline" aria-hidden="true" /> Publish</button>
            <button type="button" disabled={bulkBusy} onClick={() => setPendingBulkAction({ id: "archive", label: "Archive" })} className="border border-mist px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe transition-colors hover:border-ink hover:text-ink disabled:opacity-40"><Archive size={11} className="mr-1 inline" aria-hidden="true" /> Archive</button>
            <button type="button" disabled={bulkBusy} onClick={() => runMerchandisingBulk({ isFeatured: true }, "Mark featured")} className="border border-mist px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe transition-colors hover:border-ink hover:text-ink disabled:opacity-40">Mark featured</button>
            <button type="button" disabled={bulkBusy} onClick={() => runMerchandisingBulk({ isBestseller: true }, "Mark bestseller")} className="border border-mist px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe transition-colors hover:border-ink hover:text-ink disabled:opacity-40">Mark bestseller</button>
            <button type="button" disabled={bulkBusy} onClick={() => runMerchandisingBulk({ isNew: true }, "Mark new arrival")} className="border border-mist px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-taupe transition-colors hover:border-ink hover:text-ink disabled:opacity-40">Mark new arrival</button>
            <button type="button" onClick={() => setSelected([])} className="ml-auto font-ui text-[10px] uppercase tracking-[.14em] text-taupe underline-offset-4 hover:text-accent hover:underline">Clear</button>
          </div>
        ) : null}

        {listError ? (
          <div role="alert" className="mb-5 flex items-start justify-between gap-4 border border-accent/50 bg-canvas px-4 py-4">
            <div>
              <p className="font-display text-lg text-ink">The product list could not be loaded</p>
              <p className="mt-1 font-ui text-sm text-accent">{listError}</p>
            </div>
            <button type="button" onClick={reload} className="border border-ink px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-ink hover:bg-ink hover:text-ivory">Retry</button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b border-mist font-ui text-[10px] uppercase tracking-widest text-taupe">
                <th className="px-3 py-3"><input type="checkbox" aria-label="Select all visible products" checked={allVisibleSelected} onChange={toggleSelectAll} /></th>
                {["Product", "SKU", "Category", "Price", "Discount", "Variants", "Media", "Status", "Updated", "Actions"].map((heading) => (
                  <th className="px-3 py-3" key={heading} scope="col">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isListLoading ? (
                <tr><td colSpan={11} className="py-12 text-center font-ui text-sm text-taupe">Loading products from the server…</td></tr>
              ) : items.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  summary={mediaSummaries[product.id]}
                  cover={covers[product.id]}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onPublishQuick={publishQuick}
                  onDuplicate={handleDuplicate}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                  busyId={busyId}
                />
              ))}
            </tbody>
          </table>
        </div>

        {!isListLoading && !listError && !items.length ? (
          total === 0 && !debouncedQuery && status === "ALL" && category === "ALL" ? (
            <div className="py-16 text-center">
              <p className="font-display text-2xl font-light text-ink">No products on the server yet</p>
              <p className="mt-2 font-ui text-sm text-taupe">
                The catalogue is empty server-side. Create the first product to seed the register.
              </p>
              <Link
                to="/admin/products/new"
                className="mt-5 inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2.5 font-ui text-[10px] uppercase tracking-[.14em] text-ivory transition-colors hover:bg-ink/90"
              >
                <Plus size={13} aria-hidden="true" /> Create product
              </Link>
            </div>
          ) : (
            <p className="py-12 text-center font-ui text-sm text-taupe">
              No products match the current search/filters{debouncedQuery ? ` for “${debouncedQuery}”` : ""}.
            </p>
          )
        ) : null}

        {!isListLoading && !listError && total > pageSize ? (
          <div className="mt-5 flex items-center justify-between font-ui text-[11px] text-taupe">
            <p>
              Page {page} of {totalPages} · {total} product{total === 1 ? "" : "s"} matching
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="border border-mist px-3 py-1.5 uppercase tracking-[.14em] transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="border border-mist px-3 py-1.5 uppercase tracking-[.14em] transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </AdminPanel>
    </AdminPage>
  );
}
