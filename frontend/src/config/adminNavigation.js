/**
 * PRATIKSHYA FASHION — Admin Portal navigation.
 *
 * One catalogue of business modules grouped the way the house is run. All
 * modules listed here are implemented and routed (see App.jsx). The tree is
 * CAPABILITY-AWARE since the 2026-09 auth consolidation: SUPER_ADMIN receives
 * the complete navigation; every other Admin carries the same tree filtered
 * by their assigned capabilities (filterAdminNav below). Backend
 * authorization remains the security authority — this filtering is UX.
 *
 * This is the ONE centralized Admin navigation definition used by the
 * sidebar; there is no second Admin nav elsewhere.
 *
 * CONSOLIDATION (2026-09): simulated / non-durable Admin surfaces were
 * removed from the visible production navigation and their routes now
 * redirect safely (see App.jsx):
 *   • Media Review Queue (session-mirror only, no durable backend workflow)
 *   • Media Product Mapping desk (overlaps the canonical Product Media Manager)
 *   • Standalone Media detail page (session mirror; library stays canonical)
 *   • Activity log (no backend audit writers exist yet — blocker B-09)
 * The source files are retained as clearly-deferred code; nothing was
 * deleted, so these surfaces can return behind real backends.
 * Inventory suite restored (2026-10): backend ledger now live, blocker B-01 resolved.
 */

export const ADMIN_BRAND = {
  name: "PRATIKSHYA FASHION",
  portal: "Admin Portal",
  subtitle: "Business Management & Operations",
  home: "/admin",
  login: "/login", // unified staff sign-in (all four account levels)
};

/**
 * Grouped Admin navigation. Operational sub-routes are kept as `children`
 * inside their parent section so the sidebar stays clean while every
 * existing destination remains reachable.
 *
 * CAPABILITY-AWARE (2026-09): every item carries the canonical capability it
 * requires (see `config/rbacModel.js`). SUPER_ADMIN sees the complete tree;
 * ADMIN sees exactly the modules their assigned capabilities cover — one
 * navigation configuration for both, no duplicated role-specific trees.
 */
export const ADMIN_NAV_GROUPS = [
  {
    id: "overview",
    label: "Overview",
    icon: "layout",
    items: [
      { id: "dashboard", label: "Dashboard", to: "/admin", icon: "layout", exact: true },
      { id: "analytics", label: "Analytics", to: "/admin/analytics", icon: "chartNoAxes", permission: "analytics.view" },
      { id: "ai-assistant", label: "AI Assistant", to: "/admin/ai-assistant", icon: "sparkles", permission: "ai.view" },
    ],
  },
  {
    id: "catalogue",
    label: "Catalogue & Content",
    icon: "package",
    items: [
      {
        id: "products",
        label: "Products",
        to: "/admin/products",
        icon: "package",
        permission: "catalogue.view",
        children: [
          { id: "product-review", label: "Product Review", to: "/admin/products/review", icon: "check", permission: "product_workflow.review" },
        ],
      },
      { id: "categories", label: "Categories", to: "/admin/categories", icon: "tags", permission: "catalogue.view" },
      { id: "collections", label: "Collections", to: "/admin/collections", icon: "layers", permission: "catalogue.view" },
      { id: "offers", label: "Offers", to: "/admin/offers", icon: "tag", permission: "offers.view" },
      { id: "instagram-rewards", label: "Loyalty Rewards", to: "/admin/instagram-rewards", icon: "camera", permission: "instagram_reward.manage" },
      {
        id: "media",
        label: "Media",
        to: "/admin/media",
        icon: "image",
        permission: "media.view",
        children: [
          { id: "marketing-media", label: "Marketing / HOME_HERO", to: "/admin/media/marketing", icon: "imagePlay", permission: "media.view" },
        ],
      },
    ],
  },
  {
    id: "people",
    label: "People / Organization",
    icon: "usersRound",
    items: [
      { id: "employees", label: "Employees", to: "/admin/employees", icon: "badge", permission: "people.view" },
    ],
  },
  {
    id: "workforce",
    label: "Workforce",
    icon: "usersRound",
    items: [
      {
        id: "attendance",
        label: "Attendance",
        to: "/admin/attendance",
        icon: "clock",
        permission: "people.view",
        children: [
          { id: "attendance-devices", label: "Devices", to: "/admin/attendance/devices", icon: "monitor", permission: "people.manage" },
          { id: "attendance-unmapped", label: "Unmapped Pins", to: "/admin/attendance/unmapped", icon: "linkSlash", permission: "people.manage" },
        ],
      },
      {
        id: "leave",
        label: "Leave",
        to: "/admin/leave",
        icon: "calendarOff",
        permission: "people.view",
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: "warehouse",
    items: [
      {
        id: "inventory-dashboard",
        label: "Stock",
        to: "/admin/inventory",
        icon: "boxes",
        permission: "inventory.view",
        children: [
          { id: "inventory-movements", label: "Movements", to: "/admin/inventory/movements", icon: "arrowLeftRight", permission: "inventory.view" },
          { id: "inventory-low-stock", label: "Low Stock", to: "/admin/inventory/low-stock", icon: "alertTriangle", permission: "inventory.view" },
          { id: "inventory-receive", label: "Receive", to: "/admin/inventory/receive", icon: "packageCheck", permission: "inventory.manage" },
          { id: "inventory-adjust", label: "Adjust", to: "/admin/inventory/adjust", icon: "sliders", permission: "inventory.manage" },
          { id: "inventory-transfers", label: "Transfers", to: "/admin/inventory/transfers", icon: "truck", permission: "inventory.manage" },
        ],
      },
      { id: "warehouses", label: "Warehouses", to: "/admin/warehouses", icon: "building2", permission: "inventory.manage" },
    ],
  },
  {
    id: "orders",
    label: "Orders & Customers",
    icon: "bag",
    items: [
      { id: "orders", label: "Orders", to: "/admin/orders", icon: "bag", permission: "orders.view" },
      { id: "customers", label: "Customers", to: "/admin/customers", icon: "users", permission: "customers.view" },
      { id: "returns", label: "Returns", to: "/admin/returns", icon: "undo", permission: "returns.view" },
      {
        id: "payments",
        label: "Payments",
        to: "/admin/payments",
        icon: "creditCard",
        permission: "settings.view",
        children: [
          { id: "payments-reconcile", label: "Reconcile", to: "/admin/payments/reconcile", icon: "refreshCw", permission: "settings.view" },
        ],
      },
    ],
  },
  {
    id: "system",
    label: "System",
    icon: "sliders",
    items: [
      { id: "settings", label: "Settings", to: "/admin/settings", icon: "sliders", permission: "settings.view" },
    ],
  },
];

/**
 * Capability filter for the Admin navigation. SUPER_ADMIN (top-level
 * override) and items without a declared `permission` (e.g. the dashboard)
 * always pass; everything else requires the item capability. Items and whole
 * groups are OMITTED — never rendered and then hidden.
 */
export const filterAdminNav = (groups, can) => {
  const allowed = (item) => !item.permission || can?.(item.permission);
  const out = [];
  for (const group of groups) {
    const items = group.items
      .filter(allowed)
      .map((item) => (item.children
        ? { ...item, children: item.children.filter(allowed) }
        : item));
    if (items.length) out.push({ ...group, items });
  }
  return out;
};

/** Every Admin link (parents + children) for active-route resolution. */
export const flattenAdminNavLinks = (groups = ADMIN_NAV_GROUPS) => {
  const links = [];
  for (const group of groups) {
    for (const item of group.items) {
      links.push({ id: item.id, to: item.to, exact: Boolean(item.exact) });
      if (Array.isArray(item.children)) {
        for (const child of item.children) {
          links.push({ id: child.id, to: child.to, exact: Boolean(child.exact) });
        }
      }
    }
  }
  return links;
};

/**
 * Resolve which Admin link owns a pathname using longest-prefix matching.
 * Returns the item id, or null when nothing matches.
 */
export const resolveActiveNavId = (pathname, groups = ADMIN_NAV_GROUPS) => {
  if (!pathname) return null;
  const cleaned = pathname.split("?")[0];
  let best = null;
  for (const link of flattenAdminNavLinks(groups)) {
    const matches = link.exact
      ? cleaned === link.to
      : cleaned === link.to || cleaned.startsWith(`${link.to}/`);
    if (matches && (!best || link.to.length > best.to.length)) best = link;
  }
  return best ? best.id : null;
};

/** Flat list of every Admin nav item (parents + children) — compatibility. */
export const ADMIN_NAV_ITEMS = flattenAdminNavLinks(ADMIN_NAV_GROUPS);

/**
 * The nav item a path belongs to (longest-prefix). Most-specific wins so a
 * nested destination such as `/admin/media/marketing` resolves to itself.
 */
export const findAdminNavItem = (pathname) => {
  if (!pathname || typeof pathname !== "string") return null;
  const cleaned = pathname.split("?")[0];
  return (
    ADMIN_NAV_ITEMS.filter((item) =>
      item.exact ? cleaned === item.to : cleaned === item.to || cleaned.startsWith(`${item.to}/`)
    ).sort((a, b) => b.to.length - a.to.length)[0] ?? null
  );
};

/**
 * Only same-origin `/admin` destinations may be used as a return URL.
 * Anything else falls back to the dashboard.
 */
export const sanitizeAdminReturnUrl = (url, fallback = "/admin") => {
  if (!url || typeof url !== "string") return fallback;
  const trimmed = url.trim();
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    !trimmed.startsWith("/admin")
  ) {
    return fallback;
  }
  if (trimmed.startsWith("/admin/login")) return fallback;
  return trimmed;
};

/**
 * Only same-origin `/super-admin` destinations may be used as a return URL
 * for the Super Admin workspace. Anything else falls back to /super-admin.
 */
export const sanitizeSuperAdminReturnUrl = (url, fallback = "/super-admin") => {
  if (!url || typeof url !== "string") return fallback;
  const trimmed = url.trim();
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    !trimmed.startsWith("/super-admin")
  ) {
    return fallback;
  }
  return trimmed;
};

export default {
  ADMIN_BRAND,
  ADMIN_NAV_GROUPS,
  flattenAdminNavLinks,
  resolveActiveNavId,
  ADMIN_NAV_ITEMS,
  findAdminNavItem,
  sanitizeAdminReturnUrl,
  sanitizeSuperAdminReturnUrl,
};
