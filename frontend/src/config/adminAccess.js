/**
 * PRATIKSHYA FASHON — Admin workspace access model.
 *
 * The Admin Portal is a separate authentication boundary from the customer
 * storefront; the Employee Operations Portal is the staff workspace for
 * SUPER_EMPLOYEE / EMPLOYEE levels. Authorization is capability-based:
 * ADMIN authority is the sum of the capabilities actually held and is always
 * below SUPER_ADMIN (the top-level override).
 *
 * Permission strings on this surface are the canonical capability codes from
 * `config/rbacModel.js` (mirrored and ENFORCED by `app/core/rbac.py`).
 * Legacy granular codes kept in the session permission list satisfy
 * capability checks through the shared expansion, and vice versa, so the two
 * vocabularies stay contract-aligned during (and after) consolidation.
 */

import {
  ACCOUNT_LEVELS,
  holdsCapability,
} from "./rbacModel";

/** Admin-workspace account levels (SUPER_ADMIN overrides all checks). */
export const ADMIN_ROLES = {
  SUPER_ADMIN: ACCOUNT_LEVELS.SUPER_ADMIN,
  ADMIN: ACCOUNT_LEVELS.ADMIN,
};

/** Legacy export kept for existing import sites (capability vocabulary now). */
export const ADMIN_PERMISSIONS = {
  EMPLOYEES_MANAGE: "people.manage",
};

export const ADMIN_ROLE_DEFINITIONS = {
  [ADMIN_ROLES.SUPER_ADMIN]: {
    id: ADMIN_ROLES.SUPER_ADMIN,
    label: "Super Admin",
    description:
      "Highest-level business administrator with unrestricted authority over every module and account.",
    permissions: ["*"],
  },
  [ADMIN_ROLES.ADMIN]: {
    id: ADMIN_ROLES.ADMIN,
    label: "Admin",
    description:
      "Assigned capability groups; can never exceed the authority granted by Super Admin.",
    // Role defaults live on the backend catalogue (BUILT_IN_ROLES.ADMIN);
    // the session carries the resolved list, so this mirror stays empty.
    permissions: [],
  },
};

export const ADMIN_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
};

export const ADMIN_STATUSES = {
  [ADMIN_STATUS.ACTIVE]: {
    id: ADMIN_STATUS.ACTIVE,
    label: "Active",
    tone: "ink",
    canSignIn: true,
    blockedMessage: "",
  },
  [ADMIN_STATUS.SUSPENDED]: {
    id: ADMIN_STATUS.SUSPENDED,
    label: "Suspended",
    tone: "danger",
    canSignIn: false,
    blockedMessage: "This administrator account is suspended.",
  },
};

export const getAdminRole = (roleId) =>
  ADMIN_ROLE_DEFINITIONS[roleId] ?? {
    id: roleId || "UNKNOWN",
    label: "Unassigned",
    description: "This administration role is not recognised.",
    permissions: [],
  };

export const getAdminRoleLabel = (roleId) => getAdminRole(roleId).label;

export const getAdminStatus = (statusId) =>
  ADMIN_STATUSES[statusId] ?? ADMIN_STATUSES[ADMIN_STATUS.SUSPENDED];

export const getAdminStatusLabel = (statusId) => getAdminStatus(statusId).label;

export const canAdminSignIn = (statusId) => getAdminStatus(statusId).canSignIn;

export const isAdminAccount = (admin) => {
  if (!admin) return false;
  if (admin.accountLevel) {
    return admin.accountLevel === ACCOUNT_LEVELS.SUPER_ADMIN || admin.accountLevel === ACCOUNT_LEVELS.ADMIN;
  }
  // Pre-unification snapshots (cache only — the backend re-validates on
  // restore): the legacy role marker still identifies the admin surface.
  return admin.role === ADMIN_ROLES.SUPER_ADMIN || admin.role === ADMIN_ROLES.ADMIN;
};

/**
 * Pure authorization check shared by route guards, navigation and service
 * actions. An `adminId` alone is not authority: the account must be an active
 * admin-workspace level, and either SUPER_ADMIN (top-level override) or hold
 * the capability through its assigned set (legacy codes resolve through the
 * shared capability expansion).
 */
export const hasAdminPermission = (admin, permission) => {
  if (!admin?.adminId || !permission) return false;
  if (!canAdminSignIn(admin.status)) return false;
  if (!isAdminAccount(admin)) return false;
  if (admin.accountLevel === ACCOUNT_LEVELS.SUPER_ADMIN) return true;
  if (admin.permissions?.includes("*")) return true;
  return holdsCapability(admin.permissions ?? [], permission);
};

export const canManageEmployeeAccounts = (admin) =>
  hasAdminPermission(admin, ADMIN_PERMISSIONS.EMPLOYEES_MANAGE);

/**
 * Legacy helper alias (kept for existing consumers): an account-level id in
 * the ADMIN workspace's four-level model.
 */
export const isAdminRole = (roleId) =>
  roleId === ACCOUNT_LEVELS.SUPER_ADMIN || roleId === ACCOUNT_LEVELS.ADMIN;

/**
 * SUPER_EMPLOYEE is the highest level inside the EMPLOYEE workspace. Its
 * account-management authority (create SUPER_EMPLOYEE/EMPLOYEE accounts,
 * delegate a subset of its own capabilities) is exercised through the SAME
 * /admin/employees API with the employee-scoped token; the backend applies
 * the identical hierarchy matrix.
 */
export const isSuperEmployeeAccount = (employee) =>
  Boolean(employee) &&
  employee.accountLevel === ACCOUNT_LEVELS.SUPER_EMPLOYEE &&
  canAdminSignIn(employee.status);

export default {
  ADMIN_ROLES,
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_DEFINITIONS,
  ADMIN_STATUS,
  ADMIN_STATUSES,
  getAdminRole,
  getAdminRoleLabel,
  getAdminStatus,
  getAdminStatusLabel,
  canAdminSignIn,
  isAdminAccount,
  isAdminRole,
  isSuperEmployeeAccount,
  hasAdminPermission,
  canManageEmployeeAccounts,
};
