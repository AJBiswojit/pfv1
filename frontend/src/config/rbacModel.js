/**
 * PRATIKSHYA FASHON — unified account model (frontend mirror).
 *
 * ONE shared constants module for the four account levels, the account
 * creation matrix and the consolidated capability groups. The backend
 * authority is `app/core/rbac.py`; `rbacContract.test.js` pins the strings so
 * the two vocabularies can never silently diverge (§36).
 *
 * Rules encoded here (mirrored + ENFORCED server-side — UI filtering is
 * presentation, never security):
 *   SUPER_ADMIN creates: SUPER_ADMIN, ADMIN, SUPER_EMPLOYEE, EMPLOYEE
 *   ADMIN       creates: ADMIN, SUPER_EMPLOYEE, EMPLOYEE
 *   SUPER_EMPLOYEE creates: SUPER_EMPLOYEE, EMPLOYEE
 *   EMPLOYEE    creates: nothing
 */

export const ACCOUNT_LEVELS = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  SUPER_EMPLOYEE: "SUPER_EMPLOYEE",
  EMPLOYEE: "EMPLOYEE",
});

export const ACCOUNT_LEVEL_ORDER = Object.freeze([
  "SUPER_ADMIN",
  "ADMIN",
  "SUPER_EMPLOYEE",
  "EMPLOYEE",
]);

export const ACCOUNT_LEVEL_META = Object.freeze({
  SUPER_ADMIN: { label: "Super Admin", workspace: "admin", description: "System owner — unrestricted authority." },
  ADMIN: { label: "Admin", workspace: "admin", description: "Assigned capabilities; never above Super Admin." },
  SUPER_EMPLOYEE: { label: "Super Employee", workspace: "employee", description: "Elevated employee; employee-domain authority only." },
  EMPLOYEE: { label: "Employee", workspace: "employee", description: "Operational account within assigned capabilities." },
});

export const CREATABLE_LEVELS = Object.freeze({
  SUPER_ADMIN: Object.freeze(["SUPER_ADMIN", "ADMIN", "SUPER_EMPLOYEE", "EMPLOYEE"]),
  ADMIN: Object.freeze(["ADMIN", "SUPER_EMPLOYEE", "EMPLOYEE"]),
  SUPER_EMPLOYEE: Object.freeze(["SUPER_EMPLOYEE", "EMPLOYEE"]),
  EMPLOYEE: Object.freeze([]),
});

export const canCreatorCreate = (creatorLevel, targetLevel) =>
  (CREATABLE_LEVELS[creatorLevel] ?? []).includes(targetLevel);

export const workspaceForLevel = (level) => ACCOUNT_LEVEL_META[level]?.workspace ?? null;

/**
 * Canonical post-authentication destination for an account level.
 *
 * One mapping for the whole frontend (used by /login after sign-in and by the
 * forced-password-change page after a successful reset): the backend's
 * `accountLevel` — never the typed identifier, the selected tab or the page
 * the user came from — decides the workspace home.
 *
 *   SUPER_ADMIN    → /admin
 *   ADMIN          → /admin
 *   SUPER_EMPLOYEE → /employee
 *   EMPLOYEE       → /employee
 *   anything else  → null (caller falls back safely)
 */
export const homeForAccountLevel = (level) => {
  switch (level) {
    case ACCOUNT_LEVELS.SUPER_ADMIN:
    case ACCOUNT_LEVELS.ADMIN:
      return "/admin";
    case ACCOUNT_LEVELS.SUPER_EMPLOYEE:
    case ACCOUNT_LEVELS.EMPLOYEE:
      return "/employee";
    default:
      return null;
  }
};

/* ---------------------------------------------------------------------------
 * Capability groups — the small assignment model (spec §4/§19).
 * `implies` mirrors the backend compatibility map: a capability grant covers
 * the granular implementation permission codes the handlers keep using.
 * ------------------------------------------------------------------------ */

export const CAPABILITY_GROUPS = Object.freeze([
  { id: "CATALOGUE", label: "Catalogue", actions: [
    { code: "catalogue.view", label: "View" },
    { code: "catalogue.manage", label: "Manage" },
  ] },
  { id: "PRODUCT_WORKFLOW", label: "Product Workflow", actions: [
    { code: "product_workflow.review", label: "Review" },
    { code: "product_workflow.manage", label: "Manage" },
  ] },
  { id: "MEDIA", label: "Media", actions: [
    { code: "media.view", label: "View" },
    { code: "media.manage", label: "Manage" },
    { code: "media.delete", label: "Delete" },
  ] },
  { id: "ORDERS", label: "Orders", actions: [
    { code: "orders.view", label: "View" },
    { code: "orders.manage", label: "Manage" },
  ] },
  { id: "RETURNS", label: "Returns", actions: [
    { code: "returns.view", label: "View" },
    { code: "returns.manage", label: "Manage" },
  ] },
  { id: "CUSTOMERS", label: "Customers", actions: [
    { code: "customers.view", label: "View" },
    { code: "customers.manage", label: "Manage" },
  ] },
  { id: "INVENTORY", label: "Inventory", actions: [
    { code: "inventory.view", label: "View" },
    { code: "inventory.manage", label: "Manage" },
  ] },
  { id: "PEOPLE", label: "People", actions: [
    { code: "people.view", label: "View" },
    { code: "people.manage", label: "Manage" },
    { code: "people.security", label: "Security" },
  ] },
  { id: "MARKETING", label: "Marketing", actions: [
    { code: "marketing.view", label: "View" },
    { code: "marketing.manage", label: "Manage" },
  ] },
  { id: "ANALYTICS", label: "Analytics", actions: [
    { code: "analytics.view", label: "View" },
  ] },
  { id: "OFFERS", label: "Offers", actions: [
    { code: "offers.view", label: "View" },
    { code: "offers.manage", label: "Manage" },
  ] },
  { id: "SETTINGS", label: "Settings", actions: [
    { code: "settings.view", label: "View" },
    { code: "settings.manage", label: "Manage" },
  ] },
  { id: "AI_ASSISTANT", label: "AI Assistant", actions: [
    { code: "ai.view", label: "Use" },
  ] },
]);

export const CAPABILITY_CODES = Object.freeze(
  CAPABILITY_GROUPS.flatMap((group) => group.actions.map((action) => action.code))
);

/** capability → legacy granular codes (mirror of backend CAPABILITY_IMPLIES). */
export const CAPABILITY_IMPLIES = Object.freeze({
  "catalogue.view": ["products.view", "categories.view", "collections.view"],
  "catalogue.manage": ["products.manage", "categories.create", "categories.edit", "categories.archive", "collections.create", "collections.edit", "collections.assign", "collections.archive"],
  "product_workflow.review": ["products.view"],
  "product_workflow.manage": ["products.manage"],
  "media.view": ["media.view"],
  "media.manage": ["media.upload", "media.assign", "media.edit", "media.manage"],
  "media.delete": ["media.delete"],
  "orders.view": ["orders.view"],
  "orders.manage": ["orders.manage", "orders.create", "orders.fulfill", "orders.pick", "orders.pack", "orders.dispatch", "orders.cancel", "orders.return", "orders.refund"],
  "returns.view": ["returns.view"],
  "returns.manage": ["returns.manage"],
  "customers.view": ["customers.view"],
  "customers.manage": ["customers.manage"],
  "inventory.view": ["inventory.view", "warehouse.view"],
  "inventory.manage": ["inventory.manage", "inventory.receive", "inventory.adjust", "inventory.transfer", "inventory.audit", "warehouse.pick"],
  "people.view": ["employees.view", "users.view", "roles.view"],
  "people.manage": ["employees.create", "employees.edit", "employees.suspend", "employees.delete", "employees.resetPassword", "employees.manage"],
  "people.security": ["employees.managePermissions", "users.manage", "roles.manage"],
  "marketing.view": [],
  "marketing.manage": [],
  "analytics.view": ["analytics.view", "analytics.sales", "analytics.products", "analytics.customers", "analytics.inventory", "analytics.returns", "analytics.offers", "analytics.employees", "audit.view"],
  "offers.view": ["offers.view"],
  "offers.manage": ["offers.create", "offers.edit", "offers.activate", "offers.pause", "offers.archive", "offers.manage"],
  "settings.view": ["settings.view"],
  "settings.manage": ["settings.manage"],
  "ai.view": ["analytics.view"],
});

/** legacy granular code → canonical capability (mirror, first-writer order). */
export const LEGACY_TO_CAPABILITY = Object.freeze(
  (() => {
    const map = {};
    for (const [cap, legacyCodes] of Object.entries(CAPABILITY_IMPLIES)) {
      for (const legacy of legacyCodes) {
        if (legacy !== cap && !(legacy in map)) map[legacy] = cap;
      }
    }
    for (const cap of CAPABILITY_CODES) map[cap] = cap;
    return Object.freeze(map);
  })()
);

/**
 * Expand a session's granted permission list into the effective authorization
 * set (same semantics as the backend resolver): granted ∪ implied capabilities
 * ∪ legacy codes implied by granted capabilities; "*" is unbounded.
 */
export function expandEffectivePermissions(granted = []) {
  const effective = new Set(granted.filter(Boolean).map(String));
  if (effective.has("*")) return effective;
  for (const code of [...effective]) {
    const cap = LEGACY_TO_CAPABILITY[code];
    if (cap) effective.add(cap);
  }
  for (const code of [...effective]) {
    const implied = CAPABILITY_IMPLIES[code];
    if (implied) for (const legacy of implied) effective.add(legacy);
  }
  return effective;
}

/** Capability-aware check: passes on the capability, an implying legacy grant, or "*". */
export function holdsCapability(granted, required) {
  if (!required) return false;
  return expandEffectivePermissions(granted).has(required);
}

/** A creator may only delegate capabilities contained in their own ceiling. */
export function delegableCapabilities(creator, targetLevel) {
  const level = creator?.accountLevel ?? null;
  if (level === ACCOUNT_LEVELS.SUPER_ADMIN) return null; // unrestricted
  const granted = creator?.permissions ?? [];
  if (granted.includes("*")) return null;
  const ceiling = expandEffectivePermissions(granted);
  if (level === ACCOUNT_LEVELS.SUPER_EMPLOYEE) {
    for (const restricted of ["settings.manage", "people.security"]) ceiling.delete(restricted);
  }
  return ceiling;
}

export default {
  ACCOUNT_LEVELS,
  ACCOUNT_LEVEL_ORDER,
  ACCOUNT_LEVEL_META,
  CREATABLE_LEVELS,
  canCreatorCreate,
  workspaceForLevel,
  homeForAccountLevel,
  CAPABILITY_GROUPS,
  CAPABILITY_CODES,
  CAPABILITY_IMPLIES,
  LEGACY_TO_CAPABILITY,
  expandEffectivePermissions,
  holdsCapability,
  delegableCapabilities,
};
