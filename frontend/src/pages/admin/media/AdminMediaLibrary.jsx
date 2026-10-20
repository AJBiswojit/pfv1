import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Database, Film, Image as ImageIcon, Layers, Plus, Search, Sparkles, Star, Tag } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import AdminMetricCard from "../../../components/admin/AdminMetricCard";
import PlacementAssetPanel from "../../../components/admin/media/PlacementAssetPanel";
import MediaThumb from "../../../components/media/MediaThumb";
import StatusBadge from "../../../components/employee/StatusBadge";
import { AtelierButton } from "../../../design-system";
import {
  MEDIA_SCOPES,
  MEDIA_STATUS,
  MEDIA_STATUS_OPTIONS,
  MEDIA_TYPES,
  PRODUCT_MEDIA_ROLES,
  USAGE_ROLE_OPTIONS,
  getMediaStatusLabel,
  getMediaStatusTone,
  getPlacementLabel,
  getProductRoleLabel,
} from "../../../config/mediaTypes";
import taxonomyRepository from "../../../services/taxonomyRepository";
import catalogRepository from "../../../services/catalogRepository";
import { apiListMediaAssets } from "../../../services/api/mediaApi";
import { useMediaLibrary, useMediaMetrics } from "../../../hooks/useMedia";
import useMediaActions from "../../../hooks/useMediaActions";
import { cn } from "../../../utils/cn";
import { useAdminAuth } from "../../../context/AdminAuthContext";

const TABS = [
  { id: "ALL", label: "All" },
  { id: "IMAGES", label: "Images" },
  { id: "VIDEOS", label: "Videos" },
  { id: "PRODUCT", label: "Product" },
  { id: "MARKETING", label: "Marketing" },
  { id: "UNASSIGNED", label: "Unassigned" },
  { id: "UNMAPPED", label: "Unmapped" },
  { id: "DUPLICATE", label: "Duplicates" },
  { id: "NEEDS_REVIEW", label: "Needs Review" },
  /* Phase 3F — ownership-state queues. Orphaned: PRODUCT scope whose owner
     no longer exists in the catalogue. Archived product: the owner exists
     but has been retired from the storefront. */
  { id: "ORPHANED", label: "Orphaned" },
  { id: "ARCHIVED_PRODUCT", label: "Archived Product" },
];

const matchesTab = (media, tab, ownerStatusOf) => {
  switch (tab) {
    case "IMAGES":
      return media.type === MEDIA_TYPES.IMAGE;
    case "VIDEOS":
      return media.type === MEDIA_TYPES.VIDEO;
    case "PRODUCT":
      return media.scope === MEDIA_SCOPES.PRODUCT;
    case "MARKETING":
      return media.scope === MEDIA_SCOPES.MARKETING;
    case "UNASSIGNED":
      return media.scope === MEDIA_SCOPES.UNASSIGNED;
    case "UNMAPPED":
      return media.mappingStatus === "UNMAPPED";
    case "DUPLICATE":
      return media.duplicateStatus === "DUPLICATE" || media.duplicateStatus === "POSSIBLE_DUPLICATE";
    case "NEEDS_REVIEW":
      return (
        media.mappingStatus === "NEEDS_REVIEW" ||
        media.mappingStatus === "UNMAPPED" ||
        media.duplicateStatus === "DUPLICATE" ||
        media.duplicateStatus === "POSSIBLE_DUPLICATE" ||
        media.broken ||
        media.lowResolution
      );
    case "ORPHANED":
      return (
        media.scope === MEDIA_SCOPES.PRODUCT &&
        Boolean(media.productId) &&
        ownerStatusOf(media.productId) === null
      );
    case "ARCHIVED_PRODUCT":
      return (
        media.scope === MEDIA_SCOPES.PRODUCT &&
        Boolean(media.productId) &&
        ownerStatusOf(media.productId) === "ARCHIVED"
      );
    default:
      return true;
  }
};

/** One line describing where a record is used. */
const assignmentLine = (media) => {
  if (media.scope === MEDIA_SCOPES.PRODUCT) {
    return `${media.productId} · ${getProductRoleLabel(media.role)}`;
  }
  if (media.scope === MEDIA_SCOPES.MARKETING) {
    return getPlacementLabel(media.placement);
  }
  return "Unassigned";
};

/* Phase 7 — the durable registry: media assets that actually live in the
   database (uploaded to object storage and persisted via the register API),
   distinct from the session-mirror register staged on this page. Read-only
   here — uploads and assignments happen on the product media surface. */
const DURABLE_PAGE_SIZE = 24;

function DurableAssetsPanel({ refreshToken = 0 }) {
  const [state, setState] = useState({ status: "loading", items: [], error: null, total: 0, page: 1 });
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    apiListMediaAssets({ page, pageSize: DURABLE_PAGE_SIZE })
      .then((result) => {
        if (!alive) return;
        if (result?.ok) {
          setState({
            status: "ready",
            items: Array.isArray(result.items) ? result.items : [],
            total: result.total ?? result.items?.length ?? 0,
            page: result.page ?? page,
            error: null,
          });
        } else {
          setState({ status: "error", items: [], total: 0, page, error: { message: result?.error, status: result?.status } });
        }
      })
      .catch((error) => alive && setState({ status: "error", items: [], total: 0, page, error }));
    return () => {
      alive = false;
    };
  }, [page, refreshToken]);

  if (state.status === "loading") {
    return (
      <p className="mb-6 text-xs text-charcoal/45">
        Loading the durable media registry…
      </p>
    );
  }
  if (state.status === "error") {
    if (state.error?.status === 401 || state.error?.status === 403) return null;
    return (
      <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        Could not load the durable media registry: {state.error?.message || "Unknown error"}.
      </p>
    );
  }
  if (state.items.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-dashed border-pf-burgundy-faint bg-shell/50 px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-charcoal">
          <Database size={14} className="text-charcoal/50" /> Durable media registry — empty
        </p>
        <p className="mt-1 text-xs text-charcoal/55">
          Assets registered through the new durable pipeline appear here. Upload against a product from
          its Media tab or from the product media page; nothing is registered into the database from
          this staging desk.
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil((state.total || state.items.length) / DURABLE_PAGE_SIZE));

  return (
    <AdminPanel
      title={
        <span className="inline-flex items-center gap-2">
          <Database size={14} className="text-sage" /> Durable media registry ({state.total || state.items.length})
        </span>
      }
      description="Persisted in the database — these are the real product assets, not browser records. Retrieved in bounded pages."
      className="mb-6"
    >
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {state.items.map((asset) => (
          <div
            key={asset.id}
            className="flex items-center gap-3 rounded-xl border border-pf-burgundy-faint bg-shell px-3 py-2.5"
          >
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-pf-burgundy/5">
              {asset.url ? (
                <img src={asset.url} alt={asset.objectKey || "Registered media asset"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-charcoal/30">
                  <ImageIcon size={16} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs font-semibold text-pf-text">{asset.objectKey || asset.id}</p>
              <p className="text-[11px] text-charcoal/55">{asset.mimeType || "unknown type"}</p>
              <p className="text-[10px] text-charcoal/45">
                Status: {asset.status || "unknown"}
              </p>
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between border-t border-pf-burgundy-faint pt-3">
          <p className="text-[11px] text-charcoal/55">
            Page {state.page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={state.page <= 1}
              className="rounded-lg border border-pf-burgundy-faint px-3 py-1.5 text-xs text-charcoal disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={state.page >= totalPages}
              className="rounded-lg border border-pf-burgundy-faint px-3 py-1.5 text-xs text-charcoal disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </AdminPanel>
  );
}

export default function AdminMediaLibrary() {
  const { isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";
  const media = useMediaLibrary();
  const metrics = useMediaMetrics();
  const actions = useMediaActions();

  const [tab, setTab] = useState("ALL");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [usage, setUsage] = useState("ALL");
  const [selected, setSelected] = useState([]);
  const [registryRefresh, setRegistryRefresh] = useState(0);
  const categories = useMemo(() => taxonomyRepository.activeCategories(), []);

  /* Phase 3F — owner status lookup for the Orphaned / Archived Product
     queues. Computed once per media/list change, not per row. */
  const ownerStatusOf = useMemo(() => {
    const cache = new Map();
    return (productId) => {
      const key = String(productId);
      if (!cache.has(key)) {
        const owner = catalogRepository.find(key);
        cache.set(key, owner ? owner.status : null);
      }
      return cache.get(key);
    };
  }, [media]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return media.filter((item) => {
      if (!matchesTab(item, tab, ownerStatusOf)) return false;
      if (status !== "ALL" && item.status !== status) return false;
      if (category !== "ALL" && item.categoryId !== category) return false;
      if (usage !== "ALL" && !(item.usageRoles || []).includes(usage)) return false;
      if (!needle) return true;
      return [
        item.title,
        item.alt,
        item.caption,
        item.productId,
        item.placement,
        item.campaign,
        item.fileName,
        item.uploadedBy,
        item.uploadedByEmployeeId,
        item.originalPath,
        item.currentFilename,
        item.mappingStatus,
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [media, tab, status, category, usage, query, ownerStatusOf]);

  const toggle = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );

  const clearSelection = () => setSelected([]);

  const bulk = (run) => {
    selected.forEach(run);
    clearSelection();
  };

  const chip = "px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] transition-colors";

  return (
    <AdminPage
      eyebrow="Business / Media"
      title="Media Management"
      description="Manage product and marketing media across PRATIKSHYA FASHION."
      actions={
        <div className="flex flex-wrap items-center gap-2.5">
          <AtelierButton as={Link} to={`${prefix}/media/marketing`} size="chip" variant="outline">
            Marketing Media
          </AtelierButton>
          {actions.access.canUpload ? (
            <AtelierButton
              as={Link}
              to={`${prefix}/media/upload`}
              size="chip"
              className="bg-pf-burgundy text-pf-ivory hover:bg-pf-cocoa shadow-sm"
            >
              <Plus size={13} className="mr-1 inline-block" />
              + Upload Media
            </AtelierButton>
          ) : null}
        </div>
      }
    >
      {/* Homepage placement art — upload+register / register-existing for
          hero/ and marketing/ objects (renders for media.upload holders). */}
      {actions.access.canUpload ? (
        <PlacementAssetPanel onRegistered={() => setRegistryRefresh((value) => value + 1)} />
      ) : null}

      {/* Phase 7 — durable registry (server truth) above the staging desks. */}
      <DurableAssetsPanel refreshToken={registryRefresh} />

      {/* Metrics Row — exactly matching Section 3:
          Total Media (Local session), Images, Videos, Product Media, Marketing Media, Unassigned, Active */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <AdminMetricCard label="Total Media" value={metrics.total} icon={Layers} hint="Local only — not saved on the server" />
        <AdminMetricCard label="Images" value={metrics.images} icon={ImageIcon} hint="Still imagery" />
        <AdminMetricCard label="Videos" value={metrics.videos} icon={Film} hint="Video content" />
        <AdminMetricCard label="Product Media" value={metrics.productMedia} icon={Sparkles} hint="Assigned to products" />
        <AdminMetricCard label="Marketing Media" value={metrics.marketingMedia} icon={Tag} hint="Placement artwork" />
        <AdminMetricCard label="Unassigned" value={metrics.unassigned} hint="In library buffer" />
        <AdminMetricCard label="Active" value={metrics.active} icon={Star} hint="Visible to customers" />
      </div>

      <p className="mb-2 text-xs text-pf-muted">Local only — not saved on the server. Counts below reflect this browser session; the durable list above shows what is saved on the server.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <AdminMetricCard
          label="Unmapped"
          value={metrics.unmapped ?? 0}
          tone={(metrics.unmapped ?? 0) > 0 ? "alert" : "default"}
          hint="Needs taxonomy"
        />
        <AdminMetricCard label="Duplicates" value={metrics.duplicates ?? 0} hint="Kept, not deleted" />
        <AdminMetricCard label="Needs review" value={metrics.needsReview ?? 0} hint="Unmapped or uncertain" />
        <AdminMetricCard label="Large files" value={metrics.large ?? 0} hint="Originals ≥ 1.5 MB" />
        <AdminMetricCard label="Optimized" value={metrics.optimized ?? 0} hint="Application-ready" />
      </div>

      <AdminPanel eyebrow="Register" title="All Media">
        {/* Tabs ---------------------------------------------------- */}
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Media type">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`media-tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls="media-register"
              onClick={() => setTab(entry.id)}
              className={cn(
                chip,
                "border",
                tab === entry.id
                  ? "border-pf-burgundy bg-pf-burgundy text-pf-ivory"
                  : "border-pf-border bg-pf-card text-pf-cocoa hover:border-pf-burgundy"
              )}
            >
              {entry.label}
              {entry.id === "UNMAPPED" && (metrics.unmapped ?? 0) > 0 ? (
                <span className="ml-1.5 rounded-full bg-amber-600 px-1.5 py-0.2 text-[8px] text-white">
                  {metrics.unmapped}
                </span>
              ) : null}
              {entry.id === "DUPLICATE" && (metrics.duplicates ?? 0) > 0 ? (
                <span className="ml-1.5 rounded-full bg-pf-burgundy/70 px-1.5 py-0.2 text-[8px] text-white">
                  {metrics.duplicates}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Search and status --------------------------------------- */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search media</span>
            <Search size={15} className="absolute left-3 top-3 text-pf-muted" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, product SKU, placement, author..."
              className="w-full border border-pf-border bg-pf-card py-2.5 pl-9 pr-3 font-ui text-sm text-pf-text outline-none focus:border-pf-gold-deep"
            />
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-full border border-pf-border bg-pf-card px-3 py-2.5 font-ui text-sm text-pf-text outline-none focus:border-pf-gold-deep"
            >
              <option value="ALL">All statuses</option>
              {MEDIA_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-full border border-pf-border bg-pf-card px-3 py-2.5 font-ui text-sm text-pf-text outline-none focus:border-pf-gold-deep"
            >
              <option value="ALL">All categories</option>
              {categories.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by usage</span>
            <select
              value={usage}
              onChange={(event) => setUsage(event.target.value)}
              className="h-full border border-pf-border bg-pf-card px-3 py-2.5 font-ui text-sm text-pf-text outline-none focus:border-pf-gold-deep"
            >
              <option value="ALL">All usage</option>
              {USAGE_ROLE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Bulk bar ------------------------------------------------- */}
        {selected.length ? (
          <div className="mb-5 flex flex-wrap items-center gap-2 border border-pf-burgundy/20 bg-pf-ivory/50 px-4 py-3">
            <p className="font-ui text-[11px] uppercase tracking-[.16em] text-pf-muted">
              {selected.length} selected
            </p>
            {actions.access.canEdit ? (
              <>
                <AtelierButton size="chip" variant="outline" onClick={() => bulk(actions.activate)}>
                  Activate
                </AtelierButton>
                <AtelierButton size="chip" variant="outline" onClick={() => bulk(actions.archive)}>
                  Archive
                </AtelierButton>
              </>
            ) : null}
            {actions.access.canDelete ? (
              <AtelierButton
                size="chip"
                variant="outline"
                onClick={() => {
                  actions.removeMany(selected);
                  clearSelection();
                }}
              >
                Remove
              </AtelierButton>
            ) : null}
            <span className="font-ui text-[10px] text-pf-muted">Bulk actions affect this browser session only</span>
            <button
              type="button"
              onClick={clearSelection}
              className="font-ui text-[11px] uppercase tracking-[.14em] text-pf-muted underline-offset-4 hover:text-pf-burgundy hover:underline"
            >
              Clear selection
            </button>
          </div>
        ) : null}

        {/* Grid ----------------------------------------------------- */}
        <div id="media-register" role="tabpanel" aria-labelledby={`media-tab-${tab}`}>
          {filtered.length ? (
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {filtered.map((item) => (
                <li key={item.id} className="border border-pf-border/80 bg-pf-card">
                  <span className="block">
                    <MediaThumb media={item} />
                  </span>
                  <div className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 font-ui text-sm text-pf-text">
                        <span className="line-clamp-2">{item.title}</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggle(item.id)}
                        aria-label={`Select ${item.title}`}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#B45309]"
                      />
                    </div>
                    <p className="font-ui text-[11px] text-pf-muted">{assignmentLine(item)}</p>

                    {item.uploadedBy ? (
                      <p className="font-ui text-[10px] text-pf-muted">
                        By {item.uploadedBy}
                        {item.uploadedByEmployeeId ? ` (${item.uploadedByEmployeeId})` : ""}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge
                        label={getMediaStatusLabel(item.status)}
                        tone={getMediaStatusTone(item.status)}
                      />
                      {item.role === PRODUCT_MEDIA_ROLES.COVER ? (
                        <StatusBadge label="Cover" tone="accent" />
                      ) : null}
                      {item.mappingStatus === "UNMAPPED" ? <StatusBadge label="Unmapped" tone="alert" /> : null}
                      {item.mappingStatus === "NEEDS_REVIEW" ? <StatusBadge label="Review" tone="brass" /> : null}
                      {item.duplicateStatus === "DUPLICATE" ? <StatusBadge label="Duplicate" tone="muted" /> : null}
                      {item.demoPlaceholder ? <StatusBadge label="Demo" tone="muted" /> : null}
                      {item.scope === MEDIA_SCOPES.PRODUCT && item.productId && ownerStatusOf(item.productId) === null ? (
                        <StatusBadge label="Orphaned" tone="alert" />
                      ) : null}
                      {item.scope === MEDIA_SCOPES.PRODUCT && item.productId && ownerStatusOf(item.productId) === "ARCHIVED" ? (
                        <StatusBadge label="Archived product" tone="muted" />
                      ) : null}
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-pf-border/50">
                      <span
                        title="Standalone media detail is deferred with the session register — durable assets live on their product's media manager."
                        className="inline-block border border-pf-border/80 px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] text-pf-muted"
                      >
                        Local only — not saved on the server
                      </span>
                      {item.scope === MEDIA_SCOPES.PRODUCT && item.productId && ownerStatusOf(item.productId) !== null ? (
                        <AtelierButton
                          as={Link}
                          to={`${prefix}/products/${item.productId}/media`}
                          size="chip"
                          variant="outline"
                        >
                          View product
                        </AtelierButton>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border border-pf-border/80 bg-pf-ivory/30 px-5 py-14 text-center">
              <p className="font-ui text-sm text-pf-muted">
                {media.length
                  ? "No media matches these filters."
                  : "No media records yet. The backend media service is not active in this phase (see INTEGRATION_AUDIT.md §7) — records will appear here once the media API is enabled, and product imagery currently comes from product records."}
              </p>
            </div>
          )}
        </div>

        <p className="mt-5 font-ui text-[11px] text-pf-muted" aria-live="polite">
          Showing {filtered.length} of {media.length} records · {metrics.draft} draft ·{" "}
          {metrics.archived} archived · only {MEDIA_STATUS.ACTIVE.toLowerCase()} media reaches customers.
        </p>
      </AdminPanel>
    </AdminPage>
  );
}
