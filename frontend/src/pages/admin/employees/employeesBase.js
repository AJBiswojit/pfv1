/**
 * Employees-surface base path — shared by the four account-management pages.
 * Admin portal uses `/admin/employees`; Super Admin portal uses `/super-admin/employees`.
 */
import { useLocation } from "react-router-dom";

export const ADMIN_EMPLOYEES_BASE = "/admin/employees";
export const SUPER_ADMIN_EMPLOYEES_BASE = "/super-admin/employees";

export function useEmployeesBase(explicitBase) {
  const location = useLocation();
  if (explicitBase) return explicitBase;
  // Detect which workspace the user is currently in and return the matching base.
  if (location.pathname.startsWith("/super-admin")) {
    return SUPER_ADMIN_EMPLOYEES_BASE;
  }
  return ADMIN_EMPLOYEES_BASE;
}
