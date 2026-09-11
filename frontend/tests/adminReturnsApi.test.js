/**
 * Admin consolidation — the returns desk reads the real /admin/returns API.
 *
 * The screens previously derived their register from the 100-order client
 * snapshot (OrderContext) — bounded, incomplete data re-read on every visit.
 * These guards pin the rewiring:
 *   * AdminReturns fetches GET /admin/returns (paginated register) and no
 *     longer touches the order snapshot;
 *   * AdminReturnDetail fetches GET /admin/returns/{id} directly;
 *   * every "loading" state is distinct from "no returns exist";
 *   * after a mutation the detail screen re-reads its own record instead of
 *     re-reading the whole order list.
 *
 * Rendered-component checks are STATIC source guards (the harness has no
 * DOM); behavioural pieces are tested against the real modules.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

test("STATIC: AdminReturns reads the /admin/returns register API", () => {
  const source = read("src/pages/admin/AdminReturns.jsx");
  assert.match(source, /apiAdminListReturns/, "desk must call the returns register API");
  assert.match(source, /RETURN_STATUS\.RETURN_REQUESTED/, "status constants still in use");
  assert.doesNotMatch(
    source,
    /allOrders|refreshAdminOrders/,
    "desk must not derive returns from the order snapshot"
  );
});

test("STATIC: AdminReturns distinguishes loading, error and empty", () => {
  const source = read("src/pages/admin/AdminReturns.jsx");
  assert.match(source, /status: "loading"/);
  assert.match(source, /role="alert"/, "load failures must be announced, not shown as empty");
  assert.match(source, /No return requests match your search/);
});

test("STATIC: AdminReturnDetail reads the single-return API", () => {
  const source = read("src/pages/admin/AdminReturnDetail.jsx");
  assert.match(source, /apiAdminGetReturn/, "detail must call GET /admin/returns/{id}");
  assert.match(source, /refreshRecord/, "actions must refresh the record, not the order list");
  assert.doesNotMatch(
    source,
    /allOrders|isLoadingOrders/,
    "detail must not scan the order snapshot"
  );
  assert.match(source, /orderNumber/, "enriched order number is rendered");
  assert.match(source, /customerName/, "enriched customer name is rendered");
});

test("STATIC: return mutations no longer refetch the 100-order snapshot", () => {
  const source = read("src/context/OrderContext.jsx");
  const apply = source.match(
    /const applyReturnMutation = useCallback\(([\s\S]*?)\}, \[[^\]]*\]\);/
  );
  assert.ok(apply, "applyReturnMutation must exist");
  assert.doesNotMatch(
    apply[1],
    /refreshAdminOrders/,
    "each return action must not trigger a full order refetch"
  );
});

test("STATIC: the backend list endpoint enriches records for the desk", () => {
  const source = read("../backend/app/services/orders/return_service.py");
  assert.match(source, /_attach_order_summaries/, "bounded enrichment helper must exist");
  assert.match(source, /order_number, record\.customer_name/);
});

test("STATIC: the admin return schema carries the display fields", () => {
  const source = read("../backend/app/schemas/orders/order.py");
  assert.match(source, /order_number: Optional\[str\] = None/);
  assert.match(source, /customer_name: Optional\[str\] = None/);
});
