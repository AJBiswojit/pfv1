/**
 * PRATIKSHYA FASHION — Admin Warehouse Form
 *
 * Standalone page for creating a new warehouse or editing an existing one.
 *
 * Routes:
 *   /admin/warehouses/new              → create mode (no :warehouseId param)
 *   /admin/warehouses/:warehouseId/edit → edit mode   (loads warehouse by id)
 *
 * On success → navigates back to the detail page (edit) or list (create).
 * Requires: inventory.manage permission.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import {
  apiListWarehouses,
  apiCreateWarehouse,
  apiUpdateWarehouse,
} from "../../../services/api/inventoryApi";
import { cn } from "../../../utils/cn";

const WAREHOUSE_TYPES = ["WAREHOUSE", "STORE", "VIRTUAL", "RETURNS"];

const EMPTY_FORM = { name: "", code: "", address: "", type: "WAREHOUSE" };

// ---------------------------------------------------------------------------
// Slug helper — auto-generate a code from the warehouse name
// ---------------------------------------------------------------------------

function slugify(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminWarehouseForm() {
  const { warehouseId } = useParams();
  const isEdit = Boolean(warehouseId);
  const navigate = useNavigate();
  const { isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";

  // Form state
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [codeManuallySet, setCodeManuallySet] = useState(false);

  // Page state
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // ---------------------------------------------------------------------------
  // Load existing warehouse in edit mode
  // ---------------------------------------------------------------------------

  const loadWarehouse = useCallback(async () => {
    if (!isEdit) return;
    setLoading(true);
    setLoadError(null);
    // Re-use the list endpoint and filter by id — there is no single GET
    // /admin/warehouses/:id endpoint exposed yet; the list is small enough.
    const result = await apiListWarehouses({ includeInactive: true, pageSize: 200 });
    setLoading(false);
    if (!result.ok) {
      setLoadError(result.error ?? "Failed to load warehouse.");
      return;
    }
    const wh = (result.warehouses ?? []).find((w) => String(w.id) === String(warehouseId));
    if (!wh) {
      setLoadError("Warehouse not found.");
      return;
    }
    setForm({
      name: wh.name ?? "",
      code: wh.code ?? "",
      address: wh.address ?? "",
      type: wh.type ?? "WAREHOUSE",
    });
    setCodeManuallySet(true); // treat loaded code as manually set (immutable in edit)
  }, [isEdit, warehouseId]);

  useEffect(() => { loadWarehouse(); }, [loadWarehouse]);

  // ---------------------------------------------------------------------------
  // Field setters
  // ---------------------------------------------------------------------------

  const set = (field) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Auto-slug the code from name in create mode, unless already customised
      if (field === "name" && !isEdit && !codeManuallySet) {
        next.code = slugify(value);
      }
      return next;
    });
  };

  const setCode = (e) => {
    setCodeManuallySet(true);
    setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }));
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required.";
    if (!isEdit && !form.code.trim()) errs.code = "Code is required.";
    if (!isEdit && form.code.trim().length < 2)
      errs.code = "Code must be at least 2 characters.";
    return errs;
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setSaveError(null);
    setSaving(true);

    let result;
    if (isEdit) {
      result = await apiUpdateWarehouse(warehouseId, {
        name: form.name.trim(),
        address: form.address.trim() || null,
      });
    } else {
      result = await apiCreateWarehouse({
        name: form.name.trim(),
        code: form.code.trim(),
        address: form.address.trim() || null,
        type: form.type,
      });
    }

    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error ?? "Failed to save warehouse.");
      return;
    }

    // Navigate: edit → detail page; create → list
    if (isEdit) {
      navigate(`${prefix}/warehouses/${warehouseId}`);
    } else {
      const newId = result.warehouse?.id;
      navigate(newId ? `${prefix}/warehouses/${newId}` : `${prefix}/warehouses`);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const eyebrow = isEdit ? "Inventory / Warehouses / Edit" : "Inventory / Warehouses / New";
  const pageTitle = isEdit ? (
    <>Edit <span className="italic text-accent">warehouse.</span></>
  ) : (
    <>New <span className="italic text-accent">warehouse.</span></>
  );
  const pageDesc = isEdit
    ? "Update the warehouse name and address. Code and type are fixed after creation."
    : "Define a new warehouse location. The code uniquely identifies this location in all stock and transfer records.";

  return (
    <AdminPage
      eyebrow={eyebrow}
      title={pageTitle}
      description={pageDesc}
      actions={
        <button
          type="button"
          onClick={() => navigate(isEdit ? `${prefix}/warehouses/${warehouseId}` : `${prefix}/warehouses`)}
          className="inline-flex items-center gap-2 border border-mist px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink"
        >
          <ArrowLeft size={13} /> Back
        </button>
      }
    >
      {/* Loading skeleton */}
      {loading && (
        <p role="status" aria-live="polite" aria-busy="true" className="font-ui text-sm text-taupe">
          Loading warehouse…
        </p>
      )}

      {/* Load error */}
      {!loading && loadError && (
        <div role="alert" className="flex items-center gap-2 border border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent">
          <AlertTriangle size={13} /> {loadError}
          <button
            type="button"
            onClick={loadWarehouse}
            className="ml-2 font-ui text-[11px] uppercase tracking-[.13em] underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Form */}
      {!loading && !loadError && (
        <AdminPanel
          eyebrow={isEdit ? "Edit" : "Details"}
          title={isEdit ? "Update warehouse" : "Warehouse details"}
        >
          {saveError && (
            <div role="alert" className="mb-5 flex items-center gap-2 border border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent">
              <AlertTriangle size={13} /> {saveError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="grid gap-5 sm:grid-cols-2">

              {/* Name */}
              <div>
                <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                  Name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="wh-name"
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Main Warehouse"
                  autoFocus
                  aria-required="true"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "wh-name-err" : undefined}
                  className={cn(
                    "mt-1.5 h-10 w-full border bg-canvas px-3 font-ui text-sm text-ink outline-none focus:border-accent",
                    errors.name ? "border-red-400" : "border-mist",
                  )}
                />
                {errors.name && (
                  <p id="wh-name-err" role="alert" className="mt-1 font-ui text-[10px] text-red-500">
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Code */}
              <div>
                <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                  Code <span aria-hidden="true">{isEdit ? "" : "*"}</span>
                  {isEdit && (
                    <span className="ml-2 text-[9px] normal-case tracking-normal text-taupe/70">
                      (cannot be changed after creation)
                    </span>
                  )}
                </label>
                <input
                  id="wh-code"
                  value={form.code}
                  onChange={setCode}
                  placeholder="WH-01"
                  disabled={isEdit}
                  aria-required={!isEdit}
                  aria-invalid={Boolean(errors.code)}
                  aria-describedby={errors.code ? "wh-code-err" : undefined}
                  className={cn(
                    "mt-1.5 h-10 w-full border bg-canvas px-3 font-mono text-sm text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50",
                    errors.code ? "border-red-400" : "border-mist",
                  )}
                />
                {errors.code && (
                  <p id="wh-code-err" role="alert" className="mt-1 font-ui text-[10px] text-red-500">
                    {errors.code}
                  </p>
                )}
                {!isEdit && form.code && !errors.code && (
                  <p className="mt-1 font-ui text-[10px] text-taupe/70">
                    Auto-generated from name. You can customise it.
                  </p>
                )}
              </div>

              {/* Type */}
              <div>
                <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                  Type
                  {isEdit && (
                    <span className="ml-2 text-[9px] normal-case tracking-normal text-taupe/70">
                      (cannot be changed after creation)
                    </span>
                  )}
                </label>
                <select
                  value={form.type}
                  onChange={set("type")}
                  disabled={isEdit}
                  className="mt-1.5 h-10 w-full border border-mist bg-canvas px-3 font-ui text-sm text-ink outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {WAREHOUSE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Address */}
              <div>
                <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                  Address
                  <span className="ml-2 text-[9px] normal-case tracking-normal text-taupe/70">
                    (optional)
                  </span>
                </label>
                <input
                  value={form.address}
                  onChange={set("address")}
                  placeholder="123 Main St, City"
                  className="mt-1.5 h-10 w-full border border-mist bg-canvas px-3 font-ui text-sm text-ink outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-8 flex items-center gap-3 border-t border-mist/60 pt-6">
              <button
                type="submit"
                disabled={saving}
                className="border border-ink bg-ink px-5 py-2.5 font-ui text-[10px] uppercase tracking-[.16em] text-ivory hover:bg-ink/80 disabled:opacity-50"
              >
                {saving
                  ? isEdit ? "Saving…" : "Creating…"
                  : isEdit ? "Save changes" : "Create warehouse"}
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate(isEdit ? `${prefix}/warehouses/${warehouseId}` : `${prefix}/warehouses`)
                }
                className="border border-mist px-5 py-2.5 font-ui text-[10px] uppercase tracking-[.16em] text-taupe hover:border-ink hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </form>
        </AdminPanel>
      )}
    </AdminPage>
  );
}
