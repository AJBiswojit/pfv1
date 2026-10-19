import { useEffect, useMemo, useState } from "react";
import AdminPage from "../../../components/admin/AdminPage";
import AnalyticsWorkspace from "../../../components/analytics/AnalyticsWorkspace";
import { ANALYTICS_TABS } from "../../../components/analytics/AnalyticsNav";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { useOrder } from "../../../context/OrderContext";
import { useInventory } from "../../../context/InventoryContext";
import { ANALYTICS_PRESETS } from "../../../services/analytics/dateRange";
import { fetchAdminProducts } from "../../../services/admin/productAdminService";
import { getAnalyticsSnapshot } from "../../../services/analytics/analyticsService";

/* Workforce analytics belong to the Employee Portal reports desk —
   the Admin Portal reads business sections only. */
const ADMIN_ANALYTICS_TABS = ANALYTICS_TABS.filter((tab) => tab.section !== "employees");

/* The read-model aggregates whatever order book it is handed. An admin
   session that has not opened the Orders desk yet held an EMPTY book, so
   this page reported "no sales data" (₹0) while the dashboard showed the
   real figures. The desk now hydrates the same bounded page the Orders
   desk uses; the backend remains the authority on what is returned. */
const ORDERS_SAMPLE_SIZE = 100;

export default function AdminAnalytics() {
  const { admin, isSuperAdmin } = useAdminAuth();
  const { allOrders, refreshAdminOrders } = useOrder();
  const inventory = useInventory();
  const [periodInput, setPeriodInput] = useState({
    preset: ANALYTICS_PRESETS.LAST_30,
    start: "",
    end: "",
  });
  const [filters, setFilters] = useState({});
  const [load, setLoad] = useState({ status: "loading", error: null, attempt: 0 });
  const [catalogueVersion, setCatalogueVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad((current) => ({ ...current, status: "loading", error: null }));
    Promise.all([
      refreshAdminOrders({ page: 1, pageSize: ORDERS_SAMPLE_SIZE }),
      /* The read-model resolves product names, SKUs and taxonomy through
         the shared catalogue cache. An admin session that had not opened
         the Products desk held an empty cache, so every line read
         "Unassigned" with no SKU. Hydrate the same bounded page the
         Products desk loads. */
      fetchAdminProducts({ page: 1, pageSize: 100 }),
    ]).then(([orderResult]) => {
      if (cancelled) return;
      setCatalogueVersion((version) => version + 1);
      setLoad((current) => ({
        ...current,
        status: orderResult?.ok ? "ready" : "error",
        error: orderResult?.ok ? null : orderResult?.error ?? "The order book request failed.",
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [refreshAdminOrders, load.attempt]);

  const snapshot = useMemo(
    () =>
      getAnalyticsSnapshot({
        orders: allOrders,
        inventoryRecords: inventory.records,
        period: periodInput,
        filters,
      }),
    [allOrders, periodInput, filters, inventory.records, catalogueVersion]
  );

  return (
    <AdminPage
      eyebrow="Business intelligence"
      title={
        <>
          House <span className="italic text-pf-burgundy">analytics.</span>
        </>
      }
      description="A read-model over the existing orders, catalogue, customers, inventory, returns, offers and workforce. Same sources, same date range, same numbers."
    >
      <AnalyticsWorkspace
        snapshot={snapshot}
        periodInput={periodInput}
        onPeriodChange={(next) => setPeriodInput((current) => ({ ...current, ...next }))}
        filters={filters}
        onFiltersChange={setFilters}
        portal={isSuperAdmin ? "super-admin" : "admin"}
        allowedTabs={ADMIN_ANALYTICS_TABS}
        actor={admin}
        status={load.status}
        error={load.error}
        onRetry={() => setLoad((current) => ({ ...current, attempt: current.attempt + 1 }))}
        sourceNote={`Read-model over the most recent ${ORDERS_SAMPLE_SIZE} orders loaded for this session · not audited financial reporting`}
      />
    </AdminPage>
  );
}
