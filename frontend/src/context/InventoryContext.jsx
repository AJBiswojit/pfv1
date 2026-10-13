import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import inventoryRepository, {
  INVENTORY_CHANGED_EVENT,
  LOCATION_TYPES,
  calculateStockStatus,
  getInventoryMetrics,
} from "../services/inventory/inventoryRepository";
import { PRODUCTS_CHANGED_EVENT } from "../services/catalogRepository";
import { apiListStock } from "../services/api/inventoryApi";

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

  return {
    id: `backend::${item.id}`,
    productId:  item.product_id  ?? "",
    variantId:  item.variant_id  ?? null,
    locationId: item.warehouse_id ?? "loc-main-store",
    placement:  { department: "" },
    location:   { id: item.warehouse_id ?? "loc-main-store", name: locationType === LOCATION_TYPES.WAREHOUSE ? "Main Warehouse" : "Main Store", type: locationType },
    product:    null,
    quantity:   { onHand, available, reserved, sold: 0, returned: 0, damaged: 0 },
    lowStockThreshold: threshold,
    maximumStock:      null,
    active:     true,
    estimatedValue: 0,
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
    apiListStock({ pageSize: 500 }).then((result) => {
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
    query: (filters) => inventoryRepository.query(filters),
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
