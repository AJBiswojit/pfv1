/**
 * PRATIKSHYA FASHION — Admin Warehouses
 *
 * List, create, and edit warehouse records.
 * Uses the real /admin/warehouses endpoints (inventory.manage permission).
 */

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, Pencil, X, CheckCircle2, AlertTriangle } from "lucide-react";
import AdminPage from "../../components/admin/AdminPage";
import AdminPanel from "../../components/admin/AdminPanel";
import { useAdminAuth } from "../../context/AdminAuthContext";
import {
  apiListWarehouses,
  apiCreateWarehouse,
  apiUpdateWarehouse,
} from "../../services/api/inventoryApi";
import { cn } from "../../utils/cn";

const WAREHOUSE_TYPES = ["WAREHOUSE", "STORE", "VIRTUAL", "RETURNS"];

const EMPTY_FORM = { name: "", code: "", address: "", type: "WAREHOUSE" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ isActive }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 font-ui text-[10px] uppercase tracking-[.13em]",
        isActive
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-surface text-taupe border border-mist/80",
      )}
    >
      {isActive ? <CheckCircle2 size={10} /> : <X size={10} />}
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function TypeBadge({ type }) {
  return (
    <span className="inline-block px-2 py-0.5 border border-mist/80 bg-surface font-ui text-[10px] uppercase tracking-[.13em] text-taupe">
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline form (create / edit)
// ---------------------------------------------------------------------------

function WarehouseForm({ initial = EMPTY_FORM, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!form.name.trim())  errs.name = "Name is required.";
    if (!form.code.trim())  errs.code = "Code is required.";
    return errs;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="border border-accent/20 bg-accent/5 p-4">
      <p className="mb-4 font-ui text-[11px] uppercase tracking-[.18em] text-accent">
        {initial.id ? "Edit Warehouse" : "New Warehouse"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Name */}
        <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
          Name *
          <input
            value={form.name}
            onChange={set("name")}
            placeholder="Main Warehouse"
            className={cn(
              "mt-1.5 h-9 w-full border bg-canvas px-3 font-ui text-xs text-ink outline-none focus:border-accent",
              errors.name ? "border-red-400" : "border-mist",
            )}
          />
          {errors.name && <p className="mt-1 text-[10px] text-red-500">{errors.name}</p>}
        </label>

        {/* Code */}
        <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
          Code *
          <input
            value={form.code}
            onChange={set("code")}
            placeholder="WH-01"
            disabled={Boolean(initial.id)} // code is immutable after creation
            className={cn(
              "mt-1.5 h-9 w-full border bg-canvas px-3 font-ui text-xs text-ink outline-none focus:border-accent disabled:opacity-50",
              errors.code ? "border-red-400" : "border-mist",
            )}
          />
          {errors.code && <p className="mt-1 text-[10px] text-red-500">{errors.code}</p>}
        </label>

        {/* Type */}
        <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
          Type
          <select
            value={form.type}
            onChange={set("type")}
            disabled={Boolean(initial.id)}
            className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs text-ink outline-none focus:border-accent disabled:opacity-50"
          >
            {WAREHOUSE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        {/* Address */}
        <label className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
          Address
          <input
            value={form.address}
            onChange={set("address")}
            placeholder="123 Main St, City"
            className="mt-1.5 h-9 w-full border border-mist bg-canvas px-3 font-ui text-xs text-ink outline-none focus:border-accent"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="border border-ink bg-ink px-4 py-2 font-ui text-[10px] uppercase tracking-[.16em] text-ivory hover:bg-ink/80 disabled:opacity-50"
        >
          {saving ? "Saving…" : initial.id ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-mist px-4 py-2 font-ui text-[10px] uppercase tracking-[.16em] text-taupe hover:border-ink hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminWarehouses() {
  const { isSuperAdmin } = useAdminAuth();

  const [warehouses, setWarehouses] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [includeInactive, setIncludeInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await apiListWarehouses({ includeInactive });
    setLoading(false);
    if (result.ok) {
      setWarehouses(result.warehouses ?? []);
      setTotal(result.total ?? 0);
    } else {
      setError(result.error ?? "Failed to load warehouses.");
    }
  }, [includeInactive]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleCreate = async (form) => {
    setSaving(true);
    setActionError(null);
    const result = await apiCreateWarehouse(form);
    setSaving(false);
    if (result.ok) {
      setShowCreate(false);
      flash("Warehouse created.");
      load();
    } else {
      setActionError(result.error ?? "Failed to create warehouse.");
    }
  };

  const handleUpdate = async (warehouseId, form) => {
    setSaving(true);
    setActionError(null);
    const result = await apiUpdateWarehouse(warehouseId, {
      name: form.name,
      address: form.address || null,
    });
    setSaving(false);
    if (result.ok) {
      setEditingId(null);
      flash("Warehouse updated.");
      load();
    } else {
      setActionError(result.error ?? "Failed to update warehouse.");
    }
  };

  const handleToggleActive = async (warehouse) => {
    setSaving(true);
    setActionError(null);
    const result = await apiUpdateWarehouse(warehouse.id, {
      is_active: !warehouse.is_active,
    });
    setSaving(false);
    if (result.ok) {
      flash(`Warehouse ${result.warehouse?.is_active ? "enabled" : "disabled"}.`);
      load();
    } else {
      setActionError(result.error ?? "Failed to update warehouse.");
    }
  };

  return (
    <AdminPage
      eyebrow="Inventory / Warehouses"
      title={
        <>
          Warehouse <span className="italic text-accent">management.</span>
        </>
      }
      description="Create and manage physical and virtual warehouse locations. Warehouses are referenced by all stock records and transfers."
      actions={
        !showCreate && (
          <button
            type="button"
            onClick={() => { setShowCreate(true); setEditingId(null); setActionError(null); }}
            className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ivory hover:bg-ink/80"
          >
            <Plus size={13} /> New Warehouse
          </button>
        )
      }
    >
      {/* Status messages */}
      {successMsg && (
        <div role="status" aria-live="polite" className="mb-4 flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-4 py-3 font-ui text-[11px] text-emerald-700">
          <CheckCircle2 size={13} /> {successMsg}
        </div>
      )}
      {actionError && (
        <div role="alert" className="mb-4 flex items-center gap-2 border border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent">
          <AlertTriangle size={13} /> {actionError}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6">
          <WarehouseForm
            onSave={handleCreate}
            onCancel={() => { setShowCreate(false); setActionError(null); }}
            saving={saving}
          />
        </div>
      )}

      <AdminPanel
        eyebrow="Locations"
        title={`Warehouses (${total})`}
        bodyClassName="px-0 py-0 sm:px-0"
        headerActions={
          <label className="flex cursor-pointer items-center gap-2 font-ui text-[10px] uppercase tracking-[.13em] text-taupe">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-accent"
            />
            Show inactive
          </label>
        }
      >
        {/* Loading */}
        {loading && (
          <p role="status" aria-live="polite" aria-busy="true" className="px-4 py-6 font-ui text-sm text-taupe">
            Loading warehouses…
          </p>
        )}

        {/* Error */}
        {!loading && error && (
          <div role="alert" className="px-4 py-4 font-ui text-sm text-accent">
            {error}
            <button
              type="button"
              onClick={load}
              className="ml-2 font-ui text-[11px] uppercase tracking-[.13em] underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && warehouses.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <Building2 size={32} className="text-mist" />
            <p className="font-ui text-sm text-taupe">No warehouses yet.</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="font-ui text-[11px] uppercase tracking-[.14em] text-accent underline-offset-2 hover:underline"
            >
              Create the first warehouse
            </button>
          </div>
        )}

        {/* Table — desktop */}
        {!loading && !error && warehouses.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left">
                <thead className="border-b border-mist/80 bg-canvas/80">
                  <tr>
                    {["Name", "Code", "Type", "Address", "Status", "Actions"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 font-ui text-[10px] uppercase tracking-[.16em] text-taupe"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {warehouses.map((wh) => (
                    <tr key={wh.id} className="border-b border-mist/50 last:border-0 hover:bg-surface/30">
                      {editingId === wh.id ? (
                        <td colSpan={6} className="px-4 py-3">
                          <WarehouseForm
                            initial={{ ...wh, address: wh.address ?? "" }}
                            onSave={(form) => handleUpdate(wh.id, form)}
                            onCancel={() => { setEditingId(null); setActionError(null); }}
                            saving={saving}
                          />
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-ui text-sm font-medium text-ink">{wh.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-taupe">{wh.code}</td>
                          <td className="px-4 py-3"><TypeBadge type={wh.type} /></td>
                          <td className="px-4 py-3 font-ui text-xs text-taupe">{wh.address ?? "—"}</td>
                          <td className="px-4 py-3"><StatusBadge isActive={wh.is_active} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => { setEditingId(wh.id); setShowCreate(false); setActionError(null); }}
                                className="inline-flex items-center gap-1 font-ui text-[11px] text-brass hover:text-accent"
                              >
                                <Pencil size={11} /> Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(wh)}
                                disabled={saving}
                                className="font-ui text-[11px] text-taupe hover:text-ink disabled:opacity-40"
                              >
                                {wh.is_active ? "Disable" : "Enable"}
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards — mobile */}
            <div className="grid gap-3 p-3 md:hidden">
              {warehouses.map((wh) => (
                <div key={wh.id} className="border border-mist/70 bg-canvas p-4">
                  {editingId === wh.id ? (
                    <WarehouseForm
                      initial={{ ...wh, address: wh.address ?? "" }}
                      onSave={(form) => handleUpdate(wh.id, form)}
                      onCancel={() => { setEditingId(null); setActionError(null); }}
                      saving={saving}
                    />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-ui text-sm font-medium text-ink">{wh.name}</p>
                          <p className="mt-0.5 font-mono text-xs text-taupe">{wh.code}</p>
                          {wh.address && (
                            <p className="mt-1 font-ui text-[11px] text-taupe">{wh.address}</p>
                          )}
                        </div>
                        <StatusBadge isActive={wh.is_active} />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <TypeBadge type={wh.type} />
                        <div className="ml-auto flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => { setEditingId(wh.id); setShowCreate(false); setActionError(null); }}
                            className="inline-flex items-center gap-1 font-ui text-[11px] text-brass hover:text-accent"
                          >
                            <Pencil size={11} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(wh)}
                            disabled={saving}
                            className="font-ui text-[11px] text-taupe hover:text-ink disabled:opacity-40"
                          >
                            {wh.is_active ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
