/**
 * PRATIKSHYA FASHION — Admin Warehouse Detail
 *
 * Shows warehouse header info, current stock at that warehouse, and
 * quick-action buttons (edit, toggle active, create transfer).
 *
 * Route: /admin/warehouses/:warehouseId
 *
 * Data:
 *   - Warehouse record  → apiListWarehouses (no single GET yet; filter by id)
 *   - Stock at location → apiListStock({ warehouseId })
 *   - Toggle active     → apiUpdateWarehouse(id, { is_active })
 *
 * Requires: inventory.manage permission.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Building2,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  X,
  PackageOpen,
  RefreshCw,
} from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import {
  apiListWarehouses,
  apiListStock,
  apiUpdateWarehouse,
} from "../../../services/api/inventoryApi";
import { cn } from "../../../utils/cn";

// ---------------------------------------------------------------------------
// Badge helpers
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

function StockStatusBadge({ available, threshold }) {
  if (threshold != null && available <= 0) {
    return (
      <span className="inline-block px-2 py-0.5 border border-red-200 bg-red-50 font-ui text-[10px] uppercase tracking-[.13em] text-red-600">
        Out of stock
      </span>
    );
  }
  if (threshold != null && available <= threshold) {
    return (
      <span className="inline-block px-2 py-0.5 border border-amber-200 bg-amber-50 font-ui text-[10px] uppercase tracking-[.13em] text-amber-700">
        Low stock
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 border border-emerald-200 bg-emerald-50 font-ui text-[10px] uppercase tracking-[.13em] text-emerald-700">
      In stock
    </span>
  );
}

// ---------------------------------------------------------------------------
// Metric tile
// ---------------------------------------------------------------------------

function MetricTile({ label, value, highlight = false }) {
  return (
    <div className={cn("border p-4", highlight ? "border-accent/30 bg-accent/5" : "border-mist/80 bg-surface/40")}>
      <p className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-light", highlight ? "text-accent" : "text-ink")}>
        {value ?? "—"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination controls
// ---------------------------------------------------------------------------

function Pagination({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-mist/60 px-4 py-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={page <= 1}
        className="font-ui text-[10px] uppercase tracking-[.13em] text-taupe hover:text-ink disabled:opacity-40"
      >
        ← Prev
      </button>
      <p className="font-ui text-[10px] text-taupe">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        onClick={onNext}
        disabled={page >= totalPages}
        className="font-ui text-[10px] uppercase tracking-[.13em] text-taupe hover:text-ink disabled:opacity-40"
      >
        Next →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

export default function AdminWarehouseDetail() {
  const { warehouseId } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";

  // Warehouse record
  const [warehouse, setWarehouse] = useState(null);
  const [whLoading, setWhLoading] = useState(true);
  const [whError, setWhError] = useState(null);

  // Stock list
  const [stockItems, setStockItems] = useState([]);
  const [stockTotal, setStockTotal] = useState(0);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockError, setStockError] = useState(null);
  const [page, setPage] = useState(1);

  // Actions
  const [toggling, setToggling] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // ---------------------------------------------------------------------------
  // Load warehouse record
  // ---------------------------------------------------------------------------

  const loadWarehouse = useCallback(async () => {
    setWhLoading(true);
    setWhError(null);
    const result = await apiListWarehouses({ includeInactive: true, pageSize: 200 });
    setWhLoading(false);
    if (!result.ok) {
      setWhError(result.error ?? "Failed to load warehouse.");
      return;
    }
    const wh = (result.warehouses ?? []).find((w) => String(w.id) === String(warehouseId));
    if (!wh) {
      setWhError("Warehouse not found.");
      return;
    }
    setWarehouse(wh);
  }, [warehouseId]);

  // ---------------------------------------------------------------------------
  // Load stock at this warehouse
  // ---------------------------------------------------------------------------

  const loadStock = useCallback(async () => {
    setStockLoading(true);
    setStockError(null);
    const result = await apiListStock({ warehouseId, page, pageSize: PAGE_SIZE });
    setStockLoading(false);
    if (!result.ok) {
      setStockError(result.error ?? "Failed to load stock.");
      return;
    }
    setStockItems(result.items ?? []);
    setStockTotal(result.total ?? 0);
  }, [warehouseId, page]);

  useEffect(() => { loadWarehouse(); }, [loadWarehouse]);
  useEffect(() => { loadStock(); }, [loadStock]);

  // ---------------------------------------------------------------------------
  // Toggle active
  // ---------------------------------------------------------------------------

  const flash = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleToggleActive = async () => {
    if (!warehouse) return;
    setToggling(true);
    setActionError(null);
    const result = await apiUpdateWarehouse(warehouseId, {
      is_active: !warehouse.is_active,
    });
    setToggling(false);
    if (!result.ok) {
      setActionError(result.error ?? "Failed to update warehouse.");
      return;
    }
    flash(`Warehouse ${result.warehouse?.is_active ? "enabled" : "disabled"}.`);
    // Optimistic update of local record
    setWarehouse((prev) =>
      prev ? { ...prev, is_active: result.warehouse?.is_active ?? !prev.is_active } : prev,
    );
  };

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const totalPages = Math.max(1, Math.ceil(stockTotal / PAGE_SIZE));

  // Aggregate on-hand count across loaded items (for tile — best-effort)
  const totalOnHand = stockItems.reduce((sum, s) => sum + (s.on_hand ?? s.quantity ?? 0), 0);
  const totalAvailable = stockItems.reduce((sum, s) => sum + (s.available ?? 0), 0);
  const lowStockCount = stockItems.filter(
    (s) => s.low_stock_threshold != null &&
      (s.available ?? 0) <= (s.low_stock_threshold ?? 0),
  ).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // While the warehouse itself is loading, show a minimal loading page
  if (whLoading) {
    return (
      <AdminPage
        eyebrow="Inventory / Warehouses"
        title={<>Warehouse <span className="italic text-accent">detail.</span></>}
        description=""
      >
        <p role="status" aria-live="polite" aria-busy="true" className="font-ui text-sm text-taupe">
          Loading warehouse…
        </p>
      </AdminPage>
    );
  }

  if (whError) {
    return (
      <AdminPage
        eyebrow="Inventory / Warehouses"
        title={<>Warehouse <span className="italic text-accent">detail.</span></>}
        description=""
        actions={
          <button
            type="button"
            onClick={() => navigate(`${prefix}/warehouses`)}
            className="inline-flex items-center gap-2 border border-mist px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink"
          >
            <ArrowLeft size={13} /> All warehouses
          </button>
        }
      >
        <div role="alert" className="flex items-center gap-2 border border-accent/30 bg-accent/5 px-4 py-3 font-ui text-[11px] text-accent">
          <AlertTriangle size={13} /> {whError}
          <button
            type="button"
            onClick={loadWarehouse}
            className="ml-2 font-ui text-[11px] uppercase tracking-[.13em] underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      eyebrow="Inventory / Warehouses"
      title={
        <>
          {warehouse.name}{" "}
          <span className="italic text-accent">detail.</span>
        </>
      }
      description={warehouse.address ?? "No address recorded."}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`${prefix}/warehouses`)}
            className="inline-flex items-center gap-2 border border-mist px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink"
          >
            <ArrowLeft size={13} /> All warehouses
          </button>
          <button
            type="button"
            onClick={() => navigate(`${prefix}/warehouses/${warehouseId}/edit`)}
            className="inline-flex items-center gap-2 border border-mist px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink"
          >
            <Pencil size={13} /> Edit
          </button>
        </div>
      }
    >
      {/* Flash messages */}
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

      {/* ── Warehouse info header ─────────────────────────────────────────── */}
      <AdminPanel eyebrow="Location" title="Warehouse info" className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: metadata */}
          <dl className="grid gap-y-3 sm:grid-cols-2 lg:grid-cols-4 gap-x-8">
            <div>
              <dt className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Code</dt>
              <dd className="mt-1 font-mono text-sm text-ink">{warehouse.code}</dd>
            </div>
            <div>
              <dt className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Type</dt>
              <dd className="mt-1"><TypeBadge type={warehouse.type} /></dd>
            </div>
            <div>
              <dt className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Status</dt>
              <dd className="mt-1"><StatusBadge isActive={warehouse.is_active} /></dd>
            </div>
            <div>
              <dt className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Address</dt>
              <dd className="mt-1 font-ui text-sm text-ink">{warehouse.address ?? "—"}</dd>
            </div>
          </dl>

          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Create transfer pre-filled with this warehouse as origin */}
            <button
              type="button"
              onClick={() =>
                navigate(`${prefix}/inventory/transfers?fromWarehouseId=${warehouseId}`)
              }
              className="inline-flex items-center gap-2 border border-ink bg-ink px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-ivory hover:bg-ink/80"
            >
              <ArrowLeftRight size={13} /> Create transfer
            </button>
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={toggling}
              className={cn(
                "border px-4 py-2 font-ui text-[10px] uppercase tracking-[.14em] disabled:opacity-40",
                warehouse.is_active
                  ? "border-mist text-taupe hover:border-accent hover:text-accent"
                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
              )}
            >
              {toggling ? "Saving…" : warehouse.is_active ? "Disable" : "Enable"}
            </button>
          </div>
        </div>
      </AdminPanel>

      {/* ── Stock metric tiles ────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Total SKUs" value={stockTotal} />
        <MetricTile label="On hand (page)" value={totalOnHand} />
        <MetricTile label="Available (page)" value={totalAvailable} />
        <MetricTile label="Low / out of stock" value={lowStockCount} highlight={lowStockCount > 0} />
      </div>

      {/* ── Stock table ───────────────────────────────────────────────────── */}
      <AdminPanel
        eyebrow="Inventory"
        title={`Stock at ${warehouse.name} (${stockTotal})`}
        bodyClassName="px-0 py-0 sm:px-0"
        action={
          <button
            type="button"
            onClick={loadStock}
            aria-label="Refresh stock"
            className="inline-flex items-center gap-1 font-ui text-[10px] uppercase tracking-[.13em] text-taupe hover:text-ink"
          >
            <RefreshCw size={11} /> Refresh
          </button>
        }
      >
        {/* Loading */}
        {stockLoading && (
          <p role="status" aria-live="polite" aria-busy="true" className="px-4 py-6 font-ui text-sm text-taupe">
            Loading stock…
          </p>
        )}

        {/* Error */}
        {!stockLoading && stockError && (
          <div role="alert" className="flex items-center gap-2 px-4 py-4 font-ui text-sm text-accent">
            <AlertTriangle size={14} /> {stockError}
            <button
              type="button"
              onClick={loadStock}
              className="ml-2 font-ui text-[11px] uppercase tracking-[.13em] underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!stockLoading && !stockError && stockItems.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <PackageOpen size={32} className="text-mist" />
            <p className="font-ui text-sm text-taupe">No stock records at this warehouse.</p>
            <p className="font-ui text-[11px] text-taupe/70">
              Use Receive or a Transfer to add stock here.
            </p>
          </div>
        )}

        {/* Desktop table */}
        {!stockLoading && !stockError && stockItems.length > 0 && (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left">
                <thead className="border-b border-mist/80 bg-canvas/80">
                  <tr>
                    {["SKU", "Product", "On Hand", "Reserved", "Available", "Low Threshold", "Status"].map((h) => (
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
                  {stockItems.map((item) => {
                    const onHand    = item.on_hand    ?? item.quantity  ?? 0;
                    const reserved  = item.reserved   ?? 0;
                    const available = item.available  ?? (onHand - reserved);
                    const threshold = item.low_stock_threshold ?? null;

                    return (
                      <tr
                        key={item.id ?? item.sku}
                        className="border-b border-mist/50 last:border-0 hover:bg-surface/30"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-taupe">
                          {item.sku ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-ui text-sm text-ink">
                          {item.product_name ?? item.product?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-ui text-sm text-ink tabular-nums">
                          {onHand}
                        </td>
                        <td className="px-4 py-3 font-ui text-sm text-taupe tabular-nums">
                          {reserved}
                        </td>
                        <td className="px-4 py-3 font-ui text-sm font-medium text-ink tabular-nums">
                          {available}
                        </td>
                        <td className="px-4 py-3 font-ui text-sm text-taupe tabular-nums">
                          {threshold ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StockStatusBadge available={available} threshold={threshold} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 p-3 md:hidden">
              {stockItems.map((item) => {
                const onHand    = item.on_hand    ?? item.quantity  ?? 0;
                const reserved  = item.reserved   ?? 0;
                const available = item.available  ?? (onHand - reserved);
                const threshold = item.low_stock_threshold ?? null;

                return (
                  <div key={item.id ?? item.sku} className="border border-mist/70 bg-canvas p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-ui text-sm font-medium text-ink">
                          {item.product_name ?? item.product?.name ?? "—"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-taupe">{item.sku ?? "—"}</p>
                      </div>
                      <StockStatusBadge available={available} threshold={threshold} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {[
                        { label: "On hand",   value: onHand    },
                        { label: "Reserved",  value: reserved  },
                        { label: "Available", value: available },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="font-ui text-[9px] uppercase tracking-[.13em] text-taupe">
                            {label}
                          </p>
                          <p className="mt-0.5 font-ui text-sm font-medium text-ink tabular-nums">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {threshold != null && (
                      <p className="mt-2 font-ui text-[10px] text-taupe">
                        Low threshold: {threshold}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          </>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
