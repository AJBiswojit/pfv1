import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Eye, Layers, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import AdminMetricCard from "../../../components/admin/AdminMetricCard";
import StatusBadge from "../../../components/employee/StatusBadge";
import { AtelierButton } from "../../../design-system";
import taxonomyRepository, { TAXONOMY_CHANGED_EVENT, TAXONOMY_STATUS } from "../../../services/taxonomyRepository";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { formatAdminError } from "../../../services/admin/adminError";
import { fetchAdminMetrics } from "../../../services/admin/productAdminService";
import { apiAdminListCategories } from "../../../services/api/categoriesApi";

const statusTone = { ACTIVE: "ink", DRAFT: "quiet", ARCHIVED: "muted" };

function useTaxonomyVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const handler = () => setVersion((current) => current + 1);
    window.addEventListener(TAXONOMY_CHANGED_EVENT, handler);
    window.addEventListener("pratikshya-products-changed", handler);
    return () => {
      window.removeEventListener(TAXONOMY_CHANGED_EVENT, handler);
      window.removeEventListener("pratikshya-products-changed", handler);
    };
  }, []);
  return version;
}

export default function AdminCategories() {
  const version = useTaxonomyVersion();
  const { admin } = useAdminAuth();
  const actor = admin ? { adminId: admin.adminId, name: admin.name || "Administrator" } : null;
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  /*
   * Phase 5: the desk reads GET /admin/categories — the server's own list,
   * including DRAFT and ARCHIVED rows the public hydrate never carries —
   * and the product-classification tiles come from GET /admin/products/
   * metrics. Nothing here counts a browser snapshot and calls it the
   * register; a failed fetch renders as an error with Retry, never as
   * "0 categories".
   */
  const [rows, setRows] = useState(null); // null = never loaded
  const [listError, setListError] = useState(null);
  const [metricsData, setMetricsData] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const [categoriesResult, metricsResult] = await Promise.all([
      apiAdminListCategories(),
      fetchAdminMetrics(),
    ]);
    if (categoriesResult.ok) {
      setRows(categoriesResult.items ?? []);
      setListError(null);
    } else {
      setRows([]);
      setListError(formatAdminError(categoriesResult, { entity: "category list", action: "loaded" }));
    }
    setMetricsData(metricsResult.ok ? metricsResult.metrics : null);
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const metrics = useMemo(() => taxonomyRepository.metrics(), [version]);
  const categories = rows ?? [];
  const filtered = categories.filter((category) =>
    [category.name, category.slug, category.description].join(" ").toLowerCase().includes(query.trim().toLowerCase())
  );

  const archiveOrRestore = async (category) => {
    if (busyId) return;
    setBusyId(category.id);
    // Awaited server transition — the notice reports only what the backend
    // confirmed, and a refusal (e.g. an archive blocked by dependencies)
    // shows the server's own reason.
    const wasArchived = category.status === TAXONOMY_STATUS.ARCHIVED;
    const result = wasArchived
      ? await taxonomyRepository.restoreCategory(category.id, actor)
      : await taxonomyRepository.archiveCategory(category.id, actor);
    setNotice(
      result.ok
        ? `${category.name} ${wasArchived ? "restored" : "archived"} on the server. Products were not changed.`
        : formatAdminError(result, { entity: `category ${category.name ?? category.id}`, action: wasArchived ? "restored" : "archived" })
    );
    setBusyId(null);
    if (result.ok) await load(); // re-read from the server, never patch locally
  };

  return (
    <AdminPage
      eyebrow="Business / Taxonomy"
      title={<>Category <span className="italic text-accent">management.</span></>}
      description="One managed category hierarchy feeds product classification, shop filters, category pages, search, offers and breadcrumbs."
      actions={<AtelierButton as={Link} to="/admin/categories/new" size="chip"><Plus size={13} aria-hidden="true" /> Create category</AtelierButton>}
    >
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AdminMetricCard label="Total Categories" value={rows ? categories.length : "—"} hint="Every status, from the server" />
        <AdminMetricCard label="Active Categories" value={rows ? categories.filter((c) => c.status === TAXONOMY_STATUS.ACTIVE).length : "—"} hint="Customer-discoverable" />
        <AdminMetricCard label="Subcategories" value={metrics.subcategories} hint="Live hierarchy (from the storefront cache)" />
        <AdminMetricCard
          label="Products Classified"
          value={metricsData && metricsData.total != null ? Number(metricsData.total) - Number(metricsData.unassigned ?? 0) : "—"}
          hint={metricsData ? "Server catalogue metrics" : "Metrics unavailable — retry"}
        />
        <AdminMetricCard
          label="Unassigned Products"
          value={metricsData ? metricsData.unassigned ?? "—" : "—"}
          hint={metricsData ? "Need category (server count)" : "Metrics unavailable — retry"}
          tone={Number(metricsData?.unassigned ?? 0) ? "alert" : "default"}
        />
      </div>

      {listError ? (
        <div role="alert" className="mb-5 flex items-start justify-between gap-4 border border-accent/50 bg-canvas px-4 py-3">
          <p className="font-ui text-sm text-accent">{listError}</p>
          <button type="button" onClick={load} className="border border-ink px-3 py-1 font-ui text-[10px] uppercase tracking-[.14em] text-ink hover:bg-ink hover:text-ivory">Retry</button>
        </div>
      ) : null}

      {notice ? <p role="status" className="mb-5 border border-mist bg-canvas px-4 py-3 font-ui text-sm text-ink">{notice}</p> : null}

      <AdminPanel eyebrow="Taxonomy" title="Categories">
        <label className="relative mb-5 block max-w-xl">
          <span className="sr-only">Search categories</span>
          <Search className="absolute left-3 top-3 text-taupe" size={15} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full border border-mist bg-canvas py-2.5 pl-9 pr-3 font-ui text-sm outline-none focus:border-accent"
            placeholder="Search category name, slug or description…"
          />
        </label>

        {rows === null ? (
          <p className="py-12 text-center font-ui text-sm text-taupe">Loading categories from the server…</p>
        ) : null}
        {rows && rows.length === 0 && !listError ? (
          <p className="py-12 text-center font-ui text-sm text-taupe">The server has no categories yet — create the first one.</p>
        ) : null}
        <div className={rows && rows.length ? "hidden overflow-x-auto lg:block" : "hidden"}>
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-b border-mist font-ui text-[10px] uppercase tracking-widest text-taupe">
                {["Category", "Active subs", "Products", "Status", "Featured", "Sort Order", "Actions"].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((category) => {
                const subcategories = taxonomyRepository.subcategories(category.id);
                return (
                  <tr key={category.id} className="border-b border-mist/60 font-ui text-sm">
                    <td className="px-3 py-4">
                      <Link to={`/admin/categories/${category.id}`} className="font-medium text-ink underline-offset-4 hover:text-accent hover:underline">{category.name}</Link>
                      <span className="block text-[11px] text-taupe">/{category.slug}</span>
                    </td>
                    <td className="px-3 py-4">{subcategories.length}</td>
                    <td className="px-3 py-4">{category.productCountTotal ?? category.productCount ?? 0}</td>
                    <td className="px-3 py-4"><StatusBadge label={category.status} tone={statusTone[category.status] || "quiet"} /></td>
                    <td className="px-3 py-4">{category.featured ? "Yes" : "No"}</td>
                    <td className="px-3 py-4">{category.sortOrder}</td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-2.5 text-taupe">
                        <Link to={`/admin/categories/${category.id}`} title="View"><Eye size={15} /></Link>
                        <Link to={`/admin/categories/${category.id}/edit`} title="Edit"><Pencil size={15} /></Link>
                        <Link to={`/admin/categories/${category.id}/subcategories`} title="Manage subcategories"><Layers size={15} /></Link>
                        <button type="button" disabled={busyId === category.id} onClick={() => archiveOrRestore(category)} title={category.status === TAXONOMY_STATUS.ARCHIVED ? "Restore" : "Archive"} className="hover:text-accent">
                          {category.status === TAXONOMY_STATUS.ARCHIVED ? <RotateCcw size={15} /> : <Archive size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 lg:hidden">
          {filtered.map((category) => (
            <article key={category.id} className="border border-mist/80 bg-canvas p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link to={`/admin/categories/${category.id}`} className="font-display text-xl text-ink">{category.name}</Link>
                  <p className="font-ui text-[11px] text-taupe">/{category.slug}</p>
                </div>
                <StatusBadge label={category.status} tone={statusTone[category.status] || "quiet"} />
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 font-ui text-xs">
                <div><dt className="uppercase tracking-widest text-taupe">Subs</dt><dd>{taxonomyRepository.subcategories(category.id).length}</dd></div>
                <div><dt className="uppercase tracking-widest text-taupe">Products</dt><dd>{category.productCountTotal ?? category.productCount ?? 0}</dd></div>
                <div><dt className="uppercase tracking-widest text-taupe">Order</dt><dd>{category.sortOrder}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <AtelierButton as={Link} to={`/admin/categories/${category.id}`} size="chip" variant="outline">View</AtelierButton>
                <AtelierButton as={Link} to={`/admin/categories/${category.id}/edit`} size="chip" variant="outline">Edit</AtelierButton>
              </div>
            </article>
          ))}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
