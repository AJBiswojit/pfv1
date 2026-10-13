import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Archive, Pencil, Play, RotateCcw } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import StatusBadge from "../../../components/employee/StatusBadge";
import { AtelierButton } from "../../../design-system";
import catalogRepository from "../../../services/catalogRepository";
import taxonomyRepository from "../../../services/taxonomyRepository";
import {
  TAXONOMY_KIND,
  runTaxonomyTransition,
  taxonomyLifecycleActions,
  taxonomyTransitionNotice,
} from "../../../services/taxonomyLifecycle";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { formatAdminError } from "../../../services/admin/adminError";
import { formatINR } from "../../../utils/shopping";
import { slugify } from "../../../services/catalogRepository";

const inputClass = "w-full border border-mist bg-canvas px-3 py-2.5 font-ui text-sm text-ink outline-none focus:border-accent";
const statusTone = { ACTIVE: "ink", DRAFT: "quiet", ARCHIVED: "muted" };
const emptySubDraft = { name: "", slug: "", description: "", sortOrder: 100 };
const lifecycleIcon = { activate: Play, archive: Archive, restore: RotateCcw };

const Term = ({ label, value }) => (
  <div><dt className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">{label}</dt><dd className="mt-1 font-ui text-sm font-medium text-ink">{value || "—"}</dd></div>
);

export default function AdminCategoryDetail() {
  const { categoryId } = useParams();
  const { admin, isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";
  const actor = admin ? { adminId: admin.adminId, name: admin.name || "Administrator" } : null;
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [subDraft, setSubDraft] = useState(emptySubDraft);

  /*
   * The desk reads the ADMIN detail endpoint (GET /admin/categories/{id}),
   * which resolves DRAFT/ACTIVE/ARCHIVED alike. The storefront catalog
   * snapshot behind `taxonomyRepository.findCategory` only ever carries
   * ACTIVE rows (GET /categories?status=ACTIVE), so reading it here made
   * every DRAFT category look deleted.
   */
  const [load, setLoad] = useState({ state: "loading", message: "" });
  const [category, setCategory] = useState(null);
  const [subcategories, setSubcategories] = useState([]);

  const fetchCategory = useCallback(async () => {
    if (!categoryId) return;
    setLoad({ state: "loading", message: "" });
    const result = await taxonomyRepository.loadCategory(categoryId);
    if (!result.ok || !result.category) {
      setCategory(null);
      setSubcategories([]);
      setLoad({
        state: Number(result.status) === 404 ? "notfound" : "error",
        message: formatAdminError(result, { entity: "category", action: "loaded" }) ?? "",
      });
      return;
    }
    setCategory(result.category);
    setLoad({ state: "ready", message: "" });
    const subs = await taxonomyRepository.loadSubcategories(result.category.id);
    setSubcategories(subs.ok ? subs.items : []);
  }, [categoryId]);

  useEffect(() => { fetchCategory(); }, [fetchCategory, version]);

  const products = useMemo(
    () => catalogRepository.all().filter((product) => product.category === category?.id || product.category === category?.slug),
    [category, version],
  );

  if (load.state === "loading") {
    return <AdminPage title="Loading category…"><p role="status" className="font-ui text-sm text-taupe">Loading category…</p></AdminPage>;
  }

  if (load.state !== "ready" || !category) {
    return (
      <AdminPage title={load.state === "notfound" ? "Category not found" : "Category could not be loaded"}>
        <p role="alert" className="mb-5 border border-accent/40 bg-accent/[0.05] px-4 py-3 font-ui text-sm text-accent">
          {load.state === "notfound" ? "Category not found." : load.message || "The category could not be loaded from the server."}
        </p>
        <div className="flex flex-wrap gap-3">
          <AtelierButton size="chip" onClick={fetchCategory}>Retry</AtelierButton>
          <AtelierButton as={Link} to={`${prefix}/categories`} variant="outline" size="chip">Back to categories</AtelierButton>
        </div>
      </AdminPage>
    );
  }

  const runLifecycle = async (kind, record, actionKey) => {
    if (!record || lifecycleBusy) return;
    setLifecycleBusy(true);
    const result = await runTaxonomyTransition(kind, actionKey, record.id, actor);
    setLifecycleBusy(false);
    if (result.ok) {
      setNotice(taxonomyTransitionNotice(kind, actionKey, {
        productCount: kind === TAXONOMY_KIND.CATEGORY ? products.length : 0,
      }));
      setVersion((value) => value + 1);
      return;
    }
    setNotice(formatAdminError(result, {
      entity: `${kind} ${record.name ?? record.id}`,
      action: actionKey === "activate" ? "activated" : actionKey === "restore" ? "restored" : "archived",
    }));
  };

  const createSubcategory = async (event) => {
    event.preventDefault();
    if (!subDraft.name.trim()) return setNotice("Subcategory name is required.");
    const result = await taxonomyRepository.createSubcategory(category.id, { ...subDraft, slug: slugify(subDraft.slug || subDraft.name), sortOrder: Number(subDraft.sortOrder) || 0 }, actor);
    if (result.ok) {
      setSubDraft(emptySubDraft);
      setNotice("Subcategory created as Draft. Activate it before assigning it to a product.");
      setVersion((value) => value + 1);
    } else setNotice(formatAdminError(result, { entity: "subcategory", action: "created" }));
  };

  const renderLifecycleButtons = (kind, record) =>
    taxonomyLifecycleActions(record.status).map((action) => {
      const Icon = lifecycleIcon[action.key];
      return (
        <AtelierButton
          key={action.key}
          size="chip"
          variant="outline"
          disabled={lifecycleBusy}
          onClick={() => runLifecycle(kind, record, action.key)}
        >
          {Icon ? <Icon size={12} /> : null} {action.label}
        </AtelierButton>
      );
    });

  return (
    <AdminPage
      eyebrow="Business / Taxonomy"
      title={category.name}
      description={category.description || "Category record from the central taxonomy repository."}
      actions={
        <>
          <AtelierButton as={Link} to={`${prefix}/categories/${category.id}/edit`} size="chip" variant="outline"><Pencil size={12} /> Edit</AtelierButton>
          {renderLifecycleButtons(TAXONOMY_KIND.CATEGORY, category)}
        </>
      }
    >
      {notice ? <p role="status" className="mb-5 border border-mist bg-canvas px-4 py-3 font-ui text-sm text-ink">{notice}</p> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <AdminPanel eyebrow="Category information" title="Overview">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Term label="Name" value={category.name} />
              <Term label="Slug" value={`/${category.slug}`} />
              <Term label="Status" value={<StatusBadge label={category.status} tone={statusTone[category.status] || "quiet"} />} />
              <Term label="Featured" value={category.featured ? "Yes" : "No"} />
              <Term label="Sort order" value={String(category.sortOrder)} />
              <Term label="Image" value={category.image} />
              <Term label="SEO title" value={category.seoTitle} />
              <Term label="SEO description" value={category.seoDescription} />
              <Term label="Products" value={String(products.length)} />
            </dl>
          </AdminPanel>

          <AdminPanel eyebrow="Subcategory management" title={`Subcategories (${subcategories.length})`}>
            <form onSubmit={createSubcategory} className="mb-6 grid gap-3 md:grid-cols-[1fr_1fr_120px_120px]">
              <input className={inputClass} value={subDraft.name} onChange={(event) => setSubDraft((current) => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} placeholder="Subcategory name" aria-label="Subcategory name" />
              <input className={inputClass} value={subDraft.slug} onChange={(event) => setSubDraft((current) => ({ ...current, slug: slugify(event.target.value) }))} placeholder="banarasi-sarees" aria-label="Subcategory slug" />
              <input type="number" className={inputClass} value={subDraft.sortOrder} onChange={(event) => setSubDraft((current) => ({ ...current, sortOrder: event.target.value }))} aria-label="Sort order" />
              <AtelierButton type="submit" size="chip">Create</AtelierButton>
            </form>
            <p className="mb-4 font-ui text-[11px] text-taupe">New subcategories start as Draft. Activate a row to make it assignable on product forms.</p>
            <div className="divide-y divide-mist/70 border border-mist/80 bg-canvas">
              {subcategories.map((subcategory) => {
                const count = products.filter((product) => product.subcategory === subcategory.name || product.subcategory === subcategory.id || product.subcategory === subcategory.slug).length;
                return (
                  <div key={subcategory.id} className="flex flex-col gap-3 p-3 font-ui text-sm sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{subcategory.name}</p>
                      <p className="text-[11px] text-taupe">/{subcategory.slug} · {count} product{count === 1 ? "" : "s"}</p>
                    </div>
                    <StatusBadge label={subcategory.status} tone={statusTone[subcategory.status] || "quiet"} />
                    <div className="flex flex-wrap gap-2">{renderLifecycleButtons(TAXONOMY_KIND.SUBCATEGORY, subcategory)}</div>
                  </div>
                );
              })}
            </div>
          </AdminPanel>

          <AdminPanel eyebrow="Category → Product view" title={`Products (${products.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead><tr className="border-b border-mist font-ui text-[10px] uppercase tracking-widest text-taupe">{["Product", "SKU", "Subcategory", "Price", "Status"].map((h) => <th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
                <tbody>{products.map((product) => <tr key={product.id} className="border-b border-mist/60 font-ui text-sm"><td className="px-3 py-3"><Link to={`${prefix}/products/${product.id}`} className="font-medium text-ink hover:text-accent">{product.name}</Link></td><td className="px-3 py-3 text-taupe">{product.sku}</td><td className="px-3 py-3">{product.subcategory || "—"}</td><td className="px-3 py-3">{formatINR(product.price)}</td><td className="px-3 py-3"><StatusBadge label={product.status} tone={product.status === "PUBLISHED" ? "ink" : product.status === "ARCHIVED" ? "muted" : "quiet"} /></td></tr>)}</tbody>
              </table>
            </div>
          </AdminPanel>
        </div>

        <AdminPanel eyebrow="Activity" title="Taxonomy diary">
          <p className="font-ui text-sm leading-relaxed text-taupe">Creates, updates, archives and restores are intended for the shared activity log. The log surface is deferred until the backend audit writer pipeline exists (blocker B-09) — product records keep their IDs and are never deleted when a category is archived.</p>
        </AdminPanel>
      </div>
    </AdminPage>
  );
}
