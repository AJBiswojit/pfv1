import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Search } from "lucide-react";
import AdminPanel from "../../admin/AdminPanel";
import { AtelierButton } from "../../../design-system";
import {
  MEDIA_REGISTRY_TABS,
  formatShowingRange,
  mediaPageCount,
} from "../../../services/admin/mediaRegistryView";
import { useMediaAssetPage } from "../../../hooks/useMediaRegistry";
import { cn } from "../../../utils/cn";

/**
 * Registered media — the ONE server-backed inventory (Batch 5).
 *
 * Every row on this panel is a `media_media_asset` row returned by
 * `GET /media/assets`; there is no local register, no seeded list and no demo
 * fallback. The panel owns only presentation and form state — the request,
 * normalisation and lifecycle live in `useMediaAssetPage`.
 *
 * States, all explicit:
 *   loading       status text, no list, no count, no "0"
 *   unauthorized  explicit 401/403 message
 *   error         role="alert" + the server's message + Retry
 *   empty         total 0 with no filters → "nothing registered yet" + links
 *   no-match      total 0 with filters    → "no assets match" + Clear filters
 *   ready         rows, "Showing X–Y of N", Previous/Next bounded by the
 *                 server's own total
 *
 * Totals come from the server. When the server omits the total the footer
 * reads "Showing — of —" and paging falls back to "more may exist"; the count
 * is never inferred from the number of rendered rows.
 */

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 250;

const SCOPE_LABELS = {
  product: "Product",
  marketing: "Marketing",
};

const scopeLabel = (scope) => SCOPE_LABELS[String(scope || "").toLowerCase()] ?? "Unassigned";

export default function RegisteredMediaPanel({
  refreshToken = 0,
  prefix = "/admin",
  uploadHref = null,
  placementHref = null,
}) {
  const [tabId, setTabId] = useState("ALL");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  /* Search is debounced and resets to the first page, so a keystroke can
     never leave the reader on page 4 of an unrelated result set. */
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(String(search || "").trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const state = useMediaAssetPage({ page, pageSize: PAGE_SIZE, tabId, q: query, refreshToken });

  const selectTab = (nextTab) => {
    setTabId(nextTab);
    setPage(1);
  };

  const clearFilters = () => {
    setTabId("ALL");
    setSearch("");
    setQuery("");
    setPage(1);
  };

  const ready = state.status === "ready";
  const total = ready ? state.total : null;
  const pageCount = mediaPageCount({ total, pageSize: PAGE_SIZE });
  const showCount = ready && typeof total === "number";

  const title = showCount ? `Registered media (${total})` : "Registered media";

  return (
    <AdminPanel
      eyebrow="Registry"
      title={title}
      description="Every durable asset registered in the database. Server-side search, filters and paging."
      className="mb-6"
    >
      {/* Tabs — the six approved views, each mapping to a backend filter. */}
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Media view">
        {MEDIA_REGISTRY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`registry-tab-${tab.id}`}
            aria-selected={tabId === tab.id}
            aria-controls="registered-media"
            onClick={() => selectTab(tab.id)}
            className={cn(
              "border px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] transition-colors",
              tabId === tab.id
                ? "border-pf-burgundy bg-pf-burgundy text-pf-ivory"
                : "border-pf-border bg-pf-card text-pf-cocoa hover:border-pf-burgundy"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search runs on the server (object key, product name/SKU). */}
      <label className="relative mb-5 block">
        <span className="sr-only">Search registered media</span>
        <Search size={15} className="absolute left-3 top-3 text-pf-muted" aria-hidden="true" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search object key, product name or SKU…"
          className="w-full border border-pf-border bg-pf-card py-2.5 pl-9 pr-3 font-ui text-sm text-pf-text outline-none focus:border-pf-gold-deep"
        />
      </label>

      <div id="registered-media" role="tabpanel" aria-labelledby={`registry-tab-${tabId}`}>
        {state.status === "loading" ? (
          <p className="px-1 py-10 text-center font-ui text-sm text-pf-muted" aria-live="polite">
            Loading registered media…
          </p>
        ) : null}

        {state.status === "unauthorized" ? (
          <p
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
          >
            Registered media are unavailable for this session (HTTP {state.error?.status}). Sign
            in with an administrator account that holds the{" "}
            <span className="font-mono">media.view</span> permission.
          </p>
        ) : null}

        {state.status === "error" ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
          >
            <span>
              Could not load registered media: {state.error?.message || "Unknown error"}.
            </span>
            <AtelierButton size="chip" variant="outline" onClick={state.retry}>
              Retry
            </AtelierButton>
          </div>
        ) : null}

        {ready && state.items.length === 0 ? (
          <div className="border border-pf-border/80 bg-pf-ivory/30 px-5 py-12 text-center">
            {state.hasFilters ? (
              <>
                <p className="font-ui text-sm text-pf-muted">No assets match these filters.</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 font-ui text-[11px] uppercase tracking-[.14em] text-pf-burgundy underline-offset-4 hover:underline"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="font-ui text-sm text-pf-muted">No media has been registered yet.</p>
                <p className="mx-auto mt-2 max-w-xl font-ui text-xs leading-relaxed text-pf-muted">
                  Product images are registered from a product&apos;s media manager; hero and
                  marketing artwork from the Homepage placement art panel on this page.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <AtelierButton as={Link} to={uploadHref || `${prefix}/media/upload`} size="chip" variant="outline">
                    Upload Product Media
                  </AtelierButton>
                  <AtelierButton
                    as={Link}
                    to={placementHref || `${prefix}/media/marketing`}
                    size="chip"
                    variant="outline"
                  >
                    Homepage placement art
                  </AtelierButton>
                </div>
              </>
            )}
          </div>
        ) : null}

        {ready && state.items.length > 0 ? (
          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {state.items.map((asset) => (
              <li
                key={asset.objectKey}
                className="flex items-start gap-3 rounded-xl border border-pf-burgundy-faint bg-shell px-3 py-2.5"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-pf-burgundy/5">
                  {asset.url ? (
                    // eslint-disable-next-line jsx-a11y/img-redundant-alt
                    <img
                      src={asset.url}
                      alt={asset.objectKey}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-charcoal/30">
                      <ImageIcon size={16} aria-hidden="true" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p title={asset.objectKey} className="truncate font-mono text-[11px] font-semibold text-pf-text">
                    {asset.objectKey}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-charcoal/55">
                    {asset.mimeType || "unknown type"} · {scopeLabel(asset.scope)}
                  </p>
                  {asset.productId ? (
                    <p className="mt-0.5 truncate text-[10px] text-charcoal/55">
                      {asset.productName || "Product"} · {asset.productSku || asset.productId}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {/* The persisted value is `uploaded`; the house word for it
                        on this surface is "Registered". */}
                    <span className="rounded-full border border-pf-gold/30 bg-pf-gold/[0.12] px-2 py-0.5 font-ui text-[9px] uppercase tracking-[.12em] text-pf-gold-text">
                      Registered
                    </span>
                    {asset.productId ? (
                      <Link
                        to={`${prefix}/products/${encodeURIComponent(asset.productId)}/media`}
                        className="font-ui text-[10px] uppercase tracking-[.12em] text-pf-burgundy underline-offset-4 hover:underline"
                      >
                        Open product
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {ready ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-pf-burgundy-faint pt-3">
          <p className="text-[11px] text-charcoal/55" aria-live="polite">
            {formatShowingRange({
              page: state.page,
              pageSize: state.pageSize,
              total: state.total,
              count: state.items.length,
            })}
            {state.dropped > 0 ? ` · ${state.dropped} row(s) without an object key hidden` : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={state.page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-pf-burgundy-faint px-3 py-1.5 text-xs text-charcoal disabled:opacity-40"
            >
              <ChevronLeft size={13} aria-hidden="true" /> Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={pageCount !== null && state.page >= pageCount}
              className="inline-flex items-center gap-1 rounded-lg border border-pf-burgundy-faint px-3 py-1.5 text-xs text-charcoal disabled:opacity-40"
            >
              Next <ChevronRight size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </AdminPanel>
  );
}
