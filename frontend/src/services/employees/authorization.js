/**
 * PRATIKSHYA FASHON — Employee authorization.
 *
 * role → permissions → authorization
 *
 * Pages ask `hasPermission("inventory.view")`. They never test
 * `role === "sales"`. A missing role or empty permission list is a
 * deny, not an allow.
 */

import { canEmployeeLogin } from "../../config/employeeStatus";
import { isKnownRole } from "../../config/employeeRoles";
import {
  PERMISSIONS,
  isEmployeeAccountPermission,
} from "../../config/employeePermissions";
import { requiredPermissionForPath } from "../../config/employeeNavigation";
import {
  ACCOUNT_LEVELS,
  EMPLOYEE_SELF_SERVICE_PERMISSIONS,
  holdsCapability,
} from "../../config/rbacModel";

const SELF_SERVICE = new Set(EMPLOYEE_SELF_SERVICE_PERMISSIONS);

export const hasPermission = (employee, permission) => {
  if (!employee || !permission) return false;
  if (!canEmployeeLogin(employee.status)) return false;

  /* Own-record keys (dashboard, profile, own attendance/leave/performance)
     are held by every employee-domain session. Capability assignment never
     includes a Dashboard row, so a raw includes() check would blank /employee. */
  if (SELF_SERVICE.has(permission)) return true;

  const granted = Array.isArray(employee.permissions) ? employee.permissions : [];

  /* People-admin keys are Admin-domain for a plain EMPLOYEE. SUPER_EMPLOYEE
     may hold them through people.view / people.manage (backend ceiling). */
  if (isEmployeeAccountPermission(permission)) {
    if (employee.accountLevel !== ACCOUNT_LEVELS.SUPER_EMPLOYEE) return false;
    if (holdsCapability(granted, permission)) return true;
    if (
      permission === PERMISSIONS.EMPLOYEES_VIEW &&
      (holdsCapability(granted, "people.view") || holdsCapability(granted, "people.manage"))
    ) {
      return true;
    }
    return false;
  }

  if (holdsCapability(granted, permission)) return true;
  /* offers.manage is the house-wide offer desk and implies every offer key. */
  if (
    String(permission).startsWith("offers.") &&
    permission !== PERMISSIONS.OFFERS_MANAGE &&
    holdsCapability(granted, PERMISSIONS.OFFERS_MANAGE)
  ) {
    return true;
  }
  if (
    String(permission).startsWith("attendance.") &&
    permission !== PERMISSIONS.ATTENDANCE_MANAGE &&
    holdsCapability(granted, PERMISSIONS.ATTENDANCE_MANAGE)
  ) {
    return true;
  }
  if (
    String(permission).startsWith("leave.") &&
    permission !== PERMISSIONS.LEAVE_MANAGE &&
    holdsCapability(granted, PERMISSIONS.LEAVE_MANAGE)
  ) {
    return true;
  }
  if (
    String(permission).startsWith("performance.") &&
    permission !== PERMISSIONS.PERFORMANCE_MANAGE &&
    holdsCapability(granted, PERMISSIONS.PERFORMANCE_MANAGE)
  ) {
    return true;
  }
  return false;
};

export const hasAnyPermission = (employee, permissions = []) =>
  permissions.some((permission) => hasPermission(employee, permission));

export const hasAllPermissions = (employee, permissions = []) =>
  permissions.every((permission) => hasPermission(employee, permission));

export const canAccessPath = (employee, pathname) => {
  if (!employee) return false;
  if (!canEmployeeLogin(employee.status)) return false;
  const required = requiredPermissionForPath(pathname);
  if (!required) return true;
  return hasPermission(employee, required);
};

export const hasRecognizedRole = (employee) => Boolean(employee && isKnownRole(employee.role));

export default {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canAccessPath,
  hasRecognizedRole,
};
