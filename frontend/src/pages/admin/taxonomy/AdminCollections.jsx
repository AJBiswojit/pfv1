import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, Eye, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import AdminMetricCard from "../../../components/admin/AdminMetricCard";
import StatusBadge from "../../../components/employee/StatusBadge";
import { AtelierButton } from "../../../design-system";
import taxonomyRepository, { COLLECTION_STATUS } from "../../../services/taxonomyRepository";
import { apiAdminListCollections } from "../../../services/api/collectionsApi";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { formatAdminError } from "../../../services/admin/adminError";

const tone = { ACTIVE: "ink", SCHEDULED: "brass", PAUSED: "alert", EXPIRED: "muted", ARCHIVED: "muted", DRAFT: "quiet" };

export default function AdminCollections() {
  const { admin } = useAdminAuth();
  const actor = admin ? { adminId: admin.adminId, name: admin.name || "Administrator" } : null;
  const [query, setQuery] = useState("");
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);
  /* Rows + tiles from GET /admin/collections (all statuses, server-resolved
   * product counts) — the public cache only ever holds ACTIVE collections,
   * so listing DRAFT/ARCHIVED rows from it would silently hide them. */
  const [rows, setRows] = useState(null);
  const [listError, setListError] = useState(null);
  const load = useCallback(async () => {
    const result = await apiAdminListCollections({});
    if (result.ok) {
      setRows(result.items ?? []);
      setListError(null);
    } else {
      setRows([]);
      setListError(formatAdminError(result, { entity: "collection list", action: "loaded" }));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, version]);
  const metrics = useMemo(() => taxonomyRepository.metrics(), [version]);
  const counts = useMemo(() => taxonomyRepository.productCounts(), [version]);
  const collections = rows ?? [];
  const filtered = collections.filter((collection) => [collection.name, collection.slug, collection.description, collection.type].join(" ").toLowerCase().includes(query.trim().toLowerCase()));

  const archiveOrRestore = async (collection) => {
    if (busyId) return;
    setBusyId(collection.id);
    const wasArchived = (collection.displayStatus ?? collection.status) === COLLECTION_STATUS.ARCHIVED;
    const result = wasArchived
      ? await taxonomyRepository.restoreCollection(collection.id, actor)
      : await taxonomyRepository.archiveCollection(collection.id, actor);
    setNotice(
      result.ok
        ? `${collection.name} ${wasArchived ? "restored to DRAFT" : "archived"} on the server. Products remain unchanged.`
        : formatAdminError(result, { entity: `collection ${collection.name ?? collection.id}`, action: wasArchived ? "restored" : "archived" })
    );
    setBusyId(null);
    if (result.ok) await load();
    setVersion((value) => value + 1);
  };

  return (
    <AdminPage
      eyebrow="Business / Taxonomy"
      title={<>Collection <span className="italic text-accent">management.</span></>}
      description="Editorial collections group products without changing what they are. Manual assignments are live for storefront, filters, offers and search."
      actions={<AtelierButton as={Link} to="/admin/collections/new" size="chip"><Plus size={13} /> Create collection</AtelierButton>}
    >
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <AdminMetricCard label="Total Collections" value={rows ? collections.length : "—"} hint="Every status, from the server" />
        <AdminMetricCard label="Active" value={rows ? collections.filter((c) => (c.displayStatus ?? c.status) === COLLECTION_STATUS.ACTIVE).length : "—"} hint="Customer visible" />
        <AdminMetricCard label="Scheduled" value={rows ? collections.filter((c) => (c.displayStatus ?? c.status) === COLLECTION_STATUS.SCHEDULED).length : "—"} hint="Opens later" />
        <AdminMetricCard label="Featured" value={rows ? collections.filter((c) => c.featured).length : "—"} hint="House edits" />
        <AdminMetricCard
          label="Products Resolved"
          value={rows && collections.every((c) => Number.isFinite(Number(c.resolvedProductCount))) ? collections.reduce((sum, c) => sum + Number(c.resolvedProductCount ?? 0), 0) : metrics.productsAssigned}
          hint={rows ? "Server-resolved per collection" : "From the catalogue snapshot"}
        />
      </div>
      {listError ? (
        <div role="alert" className="mb-5 flex items-start justify-between gap-4 border border-accent/50 bg-canvas px-4 py-3">
          <p className="font-ui text-sm text-accent">{listError}</p>
          <button type="button" onClick={load} className="border border-ink px-3 py-1 font-ui text-[10px] uppercase tracking-[.14em] text-ink hover:bg-ink hover:text-ivory">Retry</button>
        </div>
      ) : null}
      {notice ? <p role="status" className="mb-5 border border-mist bg-canvas px-4 py-3 font-ui text-sm text-ink">{notice}</p> : null}
      <AdminPanel eyebrow="Editorial merchandising" title="Collections">
        <label className="relative mb-5 block max-w-xl">
          <Search className="absolute left-3 top-3 text-taupe" size={15} aria-hidden="true" />
          <input aria-label="Search collections" value={query} onChange={(event) => setQuery(event.target.value)} className="w-full border border-mist bg-canvas py-2.5 pl-9 pr-3 font-ui text-sm outline-none focus:border-accent" placeholder="Search collection name, slug or description…" />
        </label>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[900px] text-left">
            <thead><tr className="border-b border-mist font-ui text-[10px] uppercase tracking-widest text-taupe">{["Collection", "Type", "Products", "Status", "Start", "End", "Featured", "Actions"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
            <tbody>{filtered.map((collection) => <tr key={collection.id} className="border-b border-mist/60 font-ui text-sm"><td className="px-3 py-4"><Link to={`/admin/collections/${collection.id}`} className="font-medium text-ink hover:text-accent">{collection.name}</Link><span className="block text-[11px] text-taupe">/{collection.slug}</span></td><td className="px-3 py-4">{collection.type}</td><td className="px-3 py-4">{Number.isFinite(Number(collection.resolvedProductCount)) ? collection.resolvedProductCount : counts.byCollection[collection.id] || 0}</td><td className="px-3 py-4"><StatusBadge label={collection.displayStatus} tone={tone[collection.displayStatus] || "quiet"} /></td><td className="px-3 py-4">{collection.startDate || "—"}</td><td className="px-3 py-4">{collection.endDate || "—"}</td><td className="px-3 py-4">{collection.featured ? "Yes" : "No"}</td><td className="px-3 py-4"><div className="flex items-center gap-2.5 text-taupe"><Link to={`/admin/collections/${collection.id}`} title="View"><Eye size={15} /></Link><Link to={`/admin/collections/${collection.id}/edit`} title="Edit"><Pencil size={15} /></Link>{(collection.displayStatus ?? collection.status) !== COLLECTION_STATUS.ARCHIVED ? <button type="button" disabled={busyId === collection.id} onClick={() => archiveOrRestore(collection)} title="Archive" className="hover:text-accent"><Archive size={15} /></button> : <button type="button" disabled={busyId === collection.id} onClick={() => archiveOrRestore(collection)} title="Restore" className="hover:text-accent"><RotateCcw size={15} /></button>}</div></td></tr>)}</tbody>
          </table>
        </div>
        <div className="space-y-3 lg:hidden">
          {filtered.map((collection) => <article key={collection.id} className="border border-mist bg-canvas p-4"><div className="flex items-start justify-between"><div><Link to={`/admin/collections/${collection.id}`} className="font-display text-xl text-ink">{collection.name}</Link><p className="font-ui text-[11px] text-taupe">/{collection.slug}</p></div><StatusBadge label={collection.displayStatus} tone={tone[collection.displayStatus] || "quiet"} /></div><dl className="mt-4 grid grid-cols-3 gap-3 font-ui text-xs"><div><dt className="uppercase tracking-widest text-taupe">Type</dt><dd>{collection.type}</dd></div><div><dt className="uppercase tracking-widest text-taupe">Products</dt><dd>{counts.byCollection[collection.id] || 0}</dd></div><div><dt className="uppercase tracking-widest text-taupe">Featured</dt><dd>{collection.featured ? "Yes" : "No"}</dd></div></dl><div className="mt-4 flex gap-2"><AtelierButton as={Link} to={`/admin/collections/${collection.id}`} size="chip" variant="outline">View</AtelierButton><AtelierButton as={Link} to={`/admin/collections/${collection.id}/edit`} size="chip" variant="outline">Edit</AtelierButton></div></article>)}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
