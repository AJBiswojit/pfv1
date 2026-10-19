/**
 * PRATIKSHYA FASHION — Phase 2 staff redesign contracts.
 *
 * Pins the guarantees the visual redesign must never silently lose:
 * sidebar free of Profile/Sign Out, canonical homepage logo everywhere,
 * honest header controls, an Admin error boundary, accessible staff
 * tokens, and dashboard data honesty (whole-book distribution, real
 * stock aggregates, no mislabelled comparisons).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (relative) => readFileSync(join(ROOT, relative), "utf8");

const sidebar = src("src/components/navigation/PortalSidebar.jsx");
const adminHeader = src("src/components/admin/AdminHeader.jsx");
const employeeHeader = src("src/components/employee/EmployeeHeader.jsx");
const brand = src("src/design-system/components/Brand.jsx");
const adminLayout = src("src/layouts/AdminLayout.jsx");
const employeeLayout = src("src/layouts/EmployeeLayout.jsx");
const dashboard = src("src/pages/admin/AdminDashboard.jsx");
const indexCss = src("src/index.css");

test("sidebar renders neither Profile nor Sign Out; headers own both", () => {
  assert.doesNotMatch(sidebar, />Sign out</);
  assert.doesNotMatch(sidebar, />Profile</);
  assert.doesNotMatch(sidebar, /signOut=\{/);
  for (const header of [adminHeader, employeeHeader]) {
    assert.match(header, /role="menuitem"[\s\S]*Profile/);
    assert.match(header, /role="menuitem"[\s\S]*Sign out/);
  }
});

test("staff Brand renders the canonical homepage navbar logo asset", () => {
  assert.match(brand, /\/design\/pratikshya-logo\.webp/);
  assert.doesNotMatch(brand, /pratikshya_logo/);
  assert.doesNotMatch(brand, /import\.meta\.glob/);
});

test("headers carry no dead search field and no fabricated notification count", () => {
  for (const header of [adminHeader, employeeHeader]) {
    assert.doesNotMatch(header, /placeholder="Search/);
    assert.doesNotMatch(header, /Ctrl K/);
    assert.doesNotMatch(header, /<Bell/);
  }
});

test("Admin/Super Admin tree has a desk error boundary; both layouts scope .pf-staff", () => {
  assert.match(adminLayout, /import StaffDeskErrorBoundary/);
  assert.match(adminLayout, /<StaffDeskErrorBoundary key=\{pathname\}>/);
  assert.match(adminLayout, /className="pf-staff /);
  assert.match(employeeLayout, /className="pf-staff /);
  assert.match(employeeLayout, /EmployeeDeskErrorBoundary/);
});

const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const f = (c) => (c > 0.03928 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name) => indexCss.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];

test("staff text tokens meet WCAG AA on ivory surfaces", () => {
  const card = token("pf-card");
  assert.ok(ratio(token("pf-text"), card) >= 4.5, "primary text");
  assert.ok(ratio(token("pf-muted"), card) >= 4.5, "muted text must pass 4.5:1");
  assert.ok(ratio(token("pf-gold-text"), card) >= 4.5, "gold text must pass 4.5:1");
  assert.ok(ratio(token("pf-border-strong"), card) >= 3, "structural border must pass 3:1");
  assert.ok(ratio(token("pf-gold"), token("pf-burgundy")) >= 4.5, "gold on burgundy (sidebar/header accents)");
});

test("dashboard analytics are honest: whole-book distribution, derived stock, no fake comparison", () => {
  assert.match(dashboard, /orderStatusCounts/, "order donut uses the backend whole-book aggregate");
  assert.match(dashboard, /toUpperCase\(\)/, "backend enum values are normalised");
  assert.match(dashboard, /productCount - lowStock - outOfStock/, "in-stock derives from real aggregates");
  assert.doesNotMatch(dashboard, /vs previous 7 days/, "no mislabelled intra-week comparison");
  /* `inventorySummary.items` is the backend's low-stock list (stock ≤
     threshold). It may feed the "low stock attention" list, but it must
     never be counted as in-stock stock. */
  assert.doesNotMatch(
    dashboard,
    /inStock\s*=\s*[^;]*inventorySummary/,
    "low-stock rows are never read as in-stock",
  );
  assert.match(dashboard, /firstItemImage/, "recent orders are product-led");
  assert.match(dashboard, /hasPermission/, "quick actions are permission-filtered");
});

test("staff type floor is enforced in the scoped theme layer", () => {
  assert.match(indexCss, /\.pf-staff \[class~="text-\[10px\]"\]/);
  assert.match(indexCss, /--pf-header-h/);
  assert.match(indexCss, /cormorant-garamond-latin-500-normal\.woff2/, "local WOFF2 display cut");
});
