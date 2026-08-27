/**
 * PRATIKSHYA FASHON — Admin category create/edit desk.
 *
 * The edit route loads the record from the ADMIN detail endpoint
 * (GET /admin/categories/{id}) through `taxonomyRepository.loadCategory`,
 * NOT from the storefront catalog snapshot. That snapshot is hydrated from
 * GET /categories?status=ACTIVE, so a DRAFT (or ARCHIVED) category is simply
 * not in it — reading it there is what produced "Category not found." while
 * the form still rendered default values (status ACTIVE) that looked like a
 * loaded record.
 *
 * The four load states are explicit and mutually exclusive:
 *   loading  → "Loading category…", no form
 *   notfound → real server 404 only
 *   error    → the actual API/network failure, no form
 *   ready    → the form, populated from the server record (real status)
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import { AtelierButton } from "../../../design-system";
import taxonomyRepository, { TAXONOMY_STATUS } from "../../../services/taxonomyRepository";
import { slugify } from "../../../services/catalogRepository";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { formatAdminError } from "../../../services/admin/adminError";

const emptyDraft = {
  name: "",
  slug: "",
  description: "",
  image: "",
  bannerMediaId: "",
  featured: false,
  sortOrder: 100,
  seoTitle: "",
  seoDescription: "",
};

const inputClass = "w-full border border-mist bg-canvas px-3 py-2.5 font-ui text-sm text-ink outline-none focus:border-accent";

/** Server record → form draft. Only editable columns are copied; the
 * lifecycle status is displayed from the server record itself and is never
 * defaulted, guessed or written back through the form. Exported so the
 * regression suite can pin the mapping. */
export const draftFromCategory = (category) => ({
  name: category.name ?? "",
  slug: category.slug ?? "",
  description: category.description ?? "",
  image: category.image ?? "",
  bannerMediaId: category.bannerMediaId ?? "",
  featured: Boolean(category.featured),
  sortOrder: Number(category.sortOrder ?? 0),
  seoTitle: category.seoTitle ?? "",
  seoDescription: category.seoDescription ?? "",
});

export default function AdminCategoryForm() {
  const { categoryId } = useParams();
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const actor = admin ? { adminId: admin.adminId, name: admin.name || "Administrator" } : null;
  const isEdit = Boolean(categoryId);

  // load: "idle" (create) | "loading" | "ready" | "notfound" | "error"
  const [load, setLoad] = useState(isEdit ? { state: "loading", message: "" } : { state: "idle", message: "" });
  const [existing, setExisting] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCategory = useCallback(async () => {
    if (!categoryId) return;
    setLoad({ state: "loading", message: "" });
    const result = await taxonomyRepository.loadCategory(categoryId);
    if (result.ok && result.category) {
      setExisting(result.category);
      setDraft(draftFromCategory(result.category));
      setLoad({ state: "ready", message: "" });
      return;
    }
    // A genuine 404 is the ONLY case that may say "not found"; anything else
    // (network down, 401/403, 500) surfaces as the real failure.
    setExisting(null);
    setDraft(emptyDraft);
    setLoad({
      state: Number(result.status) === 404 ? "notfound" : "error",
      message: formatAdminError(result, { entity: "category", action: "loaded" }) ?? "",
    });
  }, [categoryId]);

  useEffect(() => {
    if (!isEdit) {
      setExisting(null);
      setDraft(emptyDraft);
      setLoad({ state: "idle", message: "" });
      return;
    }
    fetchCategory();
  }, [isEdit, fetchCategory]);

  const setField = (field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === "name" && !current.slug ? { slug: slugify(value) } : {}),
    }));
    setError("");
  };

  /*
   * Lifecycle is a server transition, not a form field: PATCH
   * /admin/categories/{id} carries no `status` column, so rendering an
   * editable status <select> would have been a control that silently did
   * nothing. The real status is displayed, and the transitions the backend
   * supports (activate / archive / restore) are invoked explicitly.
   */
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const runTransition = async (transition, verb) => {
    if (!existing || lifecycleBusy) return;
    setLifecycleBusy(true);
    const result = await transition(existing.id, actor);
    setLifecycleBusy(false);
    if (!result.ok) {
      setError(formatAdminError(result, { entity: "category", action: verb }));
      return;
    }
    setError("");
    fetchCategory();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!draft.name.trim()) {
      setError("Category name is required.");
      return;
    }
    const payload = {
      ...draft,
      slug: slugify(draft.slug || draft.name),
      sortOrder: Number(draft.sortOrder) || 0,
      bannerMediaId: draft.bannerMediaId || null,
    };
    setSaving(true);
    const result = existing
      ? await taxonomyRepository.updateCategory(existing.id, payload, actor)
      : await taxonomyRepository.createCategory(payload, actor);
    setSaving(false);
    if (!result.ok) {
      setError(formatAdminError(result, { entity: "category", action: existing ? "updated" : "created" }));
      return;
    }
    navigate(`/admin/categories/${result.category?.id ?? existing?.id}`);
  };

  const shell = (children) => (
    <AdminPage
      eyebrow="Business / Taxonomy"
      title={isEdit ? <>Edit <span className="italic text-accent">category.</span></> : <>Create <span className="italic text-accent">category.</span></>}
      description="Categories define what a product is. They power product forms, storefront filters, category pages, search, offers and breadcrumbs."
      actions={<AtelierButton as={Link} to="/admin/categories" variant="outline" size="chip">Back to categories</AtelierButton>}
    >
      {children}
    </AdminPage>
  );

  if (load.state === "loading") {
    return shell(
      <AdminPanel eyebrow="Category record" title="Details">
        <p role="status" className="font-ui text-sm text-taupe">Loading category…</p>
      </AdminPanel>
    );
  }

  if (load.state === "notfound" || load.state === "error") {
    return shell(
      <AdminPanel eyebrow="Category record" title="Details">
        <p role="alert" className="mb-5 border border-accent/40 bg-accent/[0.05] px-4 py-3 font-ui text-sm text-accent">
          {load.state === "notfound"
            ? "Category not found."
            : load.message || "The category could not be loaded from the server."}
        </p>
        <div className="flex flex-wrap gap-3">
          <AtelierButton size="chip" onClick={fetchCategory}>Retry</AtelierButton>
          <AtelierButton as={Link} to="/admin/categories" variant="outline" size="chip">Back to categories</AtelierButton>
        </div>
      </AdminPanel>
    );
  }

  return shell(
    <AdminPanel eyebrow="Category record" title="Details">
      {error ? <p role="alert" className="mb-5 border border-accent/40 bg-accent/[0.05] px-4 py-3 font-ui text-sm text-accent">{error}</p> : null}
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
        <label className="lg:col-span-2">
          <span className="mb-2 block font-ui text-[10px] uppercase tracking-[.18em] text-ink">Name *</span>
          <input className={inputClass} value={draft.name} onChange={(event) => setField("name", event.target.value)} placeholder="Category name" />
        </label>
        <label>
          <span className="mb-2 block font-ui text-[10px] uppercase tracking-[.18em] text-ink">Slug</span>
          <input className={inputClass} value={draft.slug} onChange={(event) => setField("slug", slugify(event.target.value))} placeholder="category-slug" />
        </label>
        <div>
          <span className="mb-2 block font-ui text-[10px] uppercase tracking-[.18em] text-ink">Status</span>
          {existing ? (
            <div className="flex flex-wrap items-center gap-3">
              <span data-testid="category-status" className="border border-mist bg-canvas px-3 py-2.5 font-ui text-sm text-ink">{existing.status}</span>
              {existing.status === TAXONOMY_STATUS.DRAFT ? (
                <AtelierButton type="button" variant="outline" size="chip" disabled={lifecycleBusy}
                  onClick={() => runTransition(taxonomyRepository.activateCategory, "activated")}>Activate</AtelierButton>
              ) : null}
              {existing.status === TAXONOMY_STATUS.ARCHIVED ? (
                <AtelierButton type="button" variant="outline" size="chip" disabled={lifecycleBusy}
                  onClick={() => runTransition(taxonomyRepository.restoreCategory, "restored")}>Restore</AtelierButton>
              ) : (
                <AtelierButton type="button" variant="outline" size="chip" disabled={lifecycleBusy}
                  onClick={() => runTransition(taxonomyRepository.archiveCategory, "archived")}>Archive</AtelierButton>
              )}
            </div>
          ) : (
            <p className="border border-mist bg-canvas px-3 py-2.5 font-ui text-sm text-taupe">
              New categories are created as {TAXONOMY_STATUS.DRAFT} — activate the record once it is ready.
            </p>
          )}
        </div>
        <label className="lg:col-span-2">
          <span className="mb-2 block font-ui text-[10px] uppercase tracking-[.18em] text-ink">Description</span>
          <textarea rows={4} className={inputClass} value={draft.description} onChange={(event) => setField("description", event.target.value)} />
        </label>
        <label>
          <span className="mb-2 block font-ui text-[10px] uppercase tracking-[.18em] text-ink">Image / fallback plate</span>
          <input className={inputClass} value={draft.image || ""} onChange={(event) => setField("image", event.target.value)} />
        </label>
        <label>
          <span className="mb-2 block font-ui text-[10px] uppercase tracking-[.18em] text-ink">Banner media ID</span>
          <input className={inputClass} value={draft.bannerMediaId || ""} onChange={(event) => setField("bannerMediaId", event.target.value)} placeholder="med-..." />
        </label>
        <label>
          <span className="mb-2 block font-ui text-[10px] uppercase tracking-[.18em] text-ink">Sort order</span>
          <input type="number" className={inputClass} value={draft.sortOrder} onChange={(event) => setField("sortOrder", event.target.value)} />
        </label>
        <label className="flex items-center gap-3 pt-7 font-ui text-sm text-ink">
          <input type="checkbox" checked={draft.featured} onChange={(event) => setField("featured", event.target.checked)} /> Featured category
        </label>
        <label>
          <span className="mb-2 block font-ui text-[10px] uppercase tracking-[.18em] text-ink">SEO title</span>
          <input className={inputClass} value={draft.seoTitle || ""} onChange={(event) => setField("seoTitle", event.target.value)} />
        </label>
        <label>
          <span className="mb-2 block font-ui text-[10px] uppercase tracking-[.18em] text-ink">SEO description</span>
          <textarea rows={3} className={inputClass} value={draft.seoDescription || ""} onChange={(event) => setField("seoDescription", event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-3 lg:col-span-2">
          <AtelierButton type="submit" size="chip" disabled={saving}>{saving ? "Saving…" : existing ? "Save category" : "Create category"}</AtelierButton>
          <AtelierButton as={Link} to="/admin/categories" variant="outline" size="chip">Cancel</AtelierButton>
        </div>
      </form>
    </AdminPanel>
  );
}
