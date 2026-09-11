/**
 * Employees-surface base path — shared by the four account-management pages.
 *
 * The pages serve TWO workspaces: `/admin/employees` (Admin portal) and
 * `/employee/team-access` (SUPER_EMPLOYEE self-service, Phase 3). Links and
 * redirects must follow the workspace they were mounted from instead of
 * hard-navigating a SUPER_EMPLOYEE into AdminProtectedRoute (which would
 * bounce them with a 403). An explicit `basePath` prop wins; otherwise the
 * path is derived from the live location — no duplicated page, no duplicated
 * data layer, one navigation contract.
 */
import { useLocation } from "react-router-dom";

export const ADMIN_EMPLOYEES_BASE = "/admin/employees";
export const EMPLOYEE_TEAM_ACCESS_BASE = "/employee/team-access";

export function useEmployeesBase(explicitBase) {
  const location = useLocation();
  if (explicitBase) return explicitBase;
  return location.pathname.startsWith(EMPLOYEE_TEAM_ACCESS_BASE)
    ? EMPLOYEE_TEAM_ACCESS_BASE
    : ADMIN_EMPLOYEES_BASE;
}
