import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import inventoryRepository, {
  INVENTORY_CHANGED_EVENT,
  LOCATION_TYPES,
  calculateStockStatus,
  filterInventoryRecords,
  getInventoryMetrics,
} from "../services/inventory/inventoryRepository";
import catalogRepository, { PRODUCTS_CHANGED_EVENT } from "../services/catalogRepository";
import { apiListStock } from "../services/api/inventoryApi";
import { getAccessToken } from "../services/api/apiClient";

const InventoryContext = createContext(null);

/**
 * Maps a backend stock item (from /admin/inventory/stock) to the shape that
 * getInventoryMetrics() and the dashboard tiles expect.
 */
function mapBackendItem(item) {
  const onHand     = item.quantity_on_hand  ?? 0;
  const reserved   = item.quantity_reserved ?? 0;
  const available  = item.quantity_available ?? Math.max(0, onHand - reserved);
  const threshold  = item.low_threshold ?? 5;

  // Treat records with a warehouse_id as WAREHOUSE, otherwise STORE
  const locationType = item.warehouse_id ? LOCATION_TYPES.WAREHOUSE : LOCATION_TYPES.STORE;

  /* Join the stock row to the session catalogue cache. Without this the
     ledger showed blank names/SKUs and threw every row into "Unassigned",
     because the backend stock payload carries only the product id. */
  let product = null;
  try {
    product = catalogRepository.find(String(item.product_id ?? "")) ?? null;
  } catch {
    product = null;
  }
  const price = Number(product?.pricing?.price ?? product?.price ?? 0) || 0;

  return {
    id: `backend::${item.id}`,
    productId:  item.product_id  ?? "",
    variantId:  item.variant_id  ?? null,
    locationId: item.warehouse_id ?? "loc-main-store",
    placement:  {
      department: product?.department ?? "",
      category: product?.category ?? "",
      subcategory: product?.subcategory ?? "",
      productType: product?.productType ?? "",
    },
    location:   { id: item.warehouse_id ?? "loc-main-store", name: locationType === LOCATION_TYPES.WAREHOUSE ? "Main Warehouse" : "Main Store", type: locationType },
    product,
    productName: product?.name ?? "Unlinked product record",
    sku: product?.sku ?? item.sku ?? "—",
    variantLabel: null,
    category: product?.category ?? "",
    subcategory: product?.subcategory ?? "",
    productType: product?.productType ?? "",
    placementLabel: product?.category ?? "",
    quantity:   { onHand, available, reserved, sold: 0, returned: 0, damaged: 0 },
    lowStockThreshold: threshold,
    maximumStock:      null,
    active:     true,
    estimatedValue: available * price,
    status: calculateStockStatus({ available, lowStockThreshold: threshold }),
    createdAt: item.created_at ?? null,
    updatedAt: item.updated_at ?? null,
    lastMovementAt: null,
  };
}

/**
 * Reactive read model over the single inventory repository. Mutations still
 * live in the service; this provider only refreshes admin, employee and
 * customer consumers after a repository event.
 */
export function InventoryProvider({ children }) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  // Backend stock records — fetched and merged into metrics
  const [backendRecords, setBackendRecords] = useState([]);

  useEffect(() => {
    window.addEventListener(INVENTORY_CHANGED_EVENT, refresh);
    window.addEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(INVENTORY_CHANGED_EVENT, refresh);
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  useEffect(() => {
    inventoryRepository.releaseExpiredReservations();
  }, []);

  // Fetch real stock data from the backend whenever the revision changes
  // (covers initial load + after any in-memory mutation triggers a refresh)
  useEffect(() => {
    let cancelled = false;
    /* /admin/inventory/stock is admin-scoped. Asking for it from an
       employee session produced two 401s per load, so only fetch when the
       admin scope is present; employee desks keep the session mirror. */
    if (!getAccessToken("admin")) return undefined;
    /* The stock endpoint caps page size at 100; requesting 500 was rejected
       with 422, so the context silently held zero records and every
       inventory surface rendered an empty ledger. Request the documented
       maximum instead. */
    apiListStock({ pageSize: 100 }).then((result) => {
      if (!cancelled && result.ok) {
        setBackendRecords(result.items.map(mapBackendItem));
      }
    });
    return () => { cancelled = true; };
  }, [revision]);

  const snapshot = useMemo(() => {
    const memoryRecords = inventoryRepository.query();

    // Merge: backend records are the source of truth for on-hand quantities.
    // In-memory records (added by receive/adjust operations this session) take
    // precedence when they share the same productId, so live UI ops reflect
    // immediately without waiting for the next backend fetch.
    const memoryProductIds = new Set(memoryRecords.map((r) => r.productId));
    const merged = [
      ...memoryRecords,
      ...backendRecords.filter((r) => !memoryProductIds.has(r.productId)),
    ];

    return {
      records: merged,
      locations: inventoryRepository.loadLocations(),
      movements: inventoryRepository.loadMovements().map(inventoryRepository.resolveMovement),
      transfers: inventoryRepository.loadTransfers().map(inventoryRepository.resolveTransfer),
      metrics: getInventoryMetrics(merged),
      reports: inventoryRepository.reports(merged),
    };
  }, [revision, backendRecords]);

  const run = useCallback((method, payload, ...rest) => {
    const result = inventoryRepository[method](payload, ...rest);
    /* The service announces successful writes. Refresh is a safe fallback
       for memory-mode rendering and rejected mutations with new feedback. */
    if (result?.ok) refresh();
    return result;
  }, [refresh]);

  const value = useMemo(() => ({
    ...snapshot,
    revision,
    refresh,
    /* Query the merged ledger (backend stock + this session's adjustments)
       so the desk lists exactly the rows its summary counts. */
    query: (filters) => filterInventoryRecords(snapshot.records, filters),
    getAvailability: (product, selection) => inventoryRepository.getCustomerAvailability(product, selection),
    receiveStock: (payload) => run("receiveStock", payload),
    adjustStock: (payload) => run("adjustStock", payload),
    markDamaged: (payload) => run("markDamaged", payload),
    returnStock: (payload) => run("returnStock", payload),
    inspectReturnedStock: (payload) => run("inspectReturnedStock", payload),
    updateThreshold: (payload) => run("updateThreshold", payload),
    addLocation: (payload) => run("addLocation", payload),
    createTransfer: (payload) => run("createTransfer", payload),
    transitionTransfer: (id, status, actor) => {
      const result = inventoryRepository.transitionTransfer(id, status, actor);
      if (result.ok) refresh();
      return result;
    },
  }), [snapshot, revision, refresh, run]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

const inert = {
  records: [],
  locations: [],
  movements: [],
  transfers: [],
  metrics: {},
  reports: { byLocation: [], byCategory: [] },
  revision: 0,
  refresh: () => {},
  query: () => [],
  getAvailability: () => ({ tracked: false, available: 0, status: "IN_STOCK" }),
};

export const useInventory = () => useContext(InventoryContext) ?? inert;

export default InventoryContext;
