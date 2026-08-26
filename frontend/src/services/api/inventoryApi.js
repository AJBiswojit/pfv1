/**
 * PRATIKSHYA FASHON — Inventory API
 *
 * Contract reserved for the backend inventory modules
 * (backend/app/api/v1/inventory.py, warehouses.py, stock_transfers.py).
 * The existing server schema does NOT yet carry business columns on the
 * `inventory_*` tables, so no functional stock endpoints can be served
 * without schema work (explicitly out of scope).
 *
 * Every function returns { ok:false, error } with a clear, user-visible
 * message — the UI must show an error/empty state, never seeded stock.
 *
 * Stock validation for customer-facing flows is served by the real cart /
 * order endpoints, which validate against product stock server-side.
 */

function unavailable(area = "inventory") {
  return {
    ok: false,
    error: `${area} is not available yet: the backend inventory tables do not ` +
           "have the required columns in the existing database schema. " +
           "This integration is documented as a blocker (INTEGRATION_AUDIT.md §7).",
  };
}

export async function apiListStock()               { return unavailable("Stock"); }
export async function apiGetStockItem()            { return unavailable("Stock"); }
export async function apiAdjustStock()             { return unavailable("Stock adjustment"); }
export async function apiListMovements()           { return unavailable("Stock movements"); }
export async function apiListLowStock()            { return unavailable("Low-stock"); }
export async function apiListReservations()        { return unavailable("Reservations"); }
export async function apiListWarehouses()          { return unavailable("Warehouses"); }
export async function apiCreateWarehouse()         { return unavailable("Warehouses"); }
export async function apiListTransfers()           { return unavailable("Stock transfers"); }
export async function apiCreateTransfer()          { return unavailable("Stock transfers"); }
export async function apiCompleteTransfer()        { return unavailable("Stock transfers"); }
