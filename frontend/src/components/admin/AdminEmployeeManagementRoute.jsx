import { Outlet } from "react-router-dom";
import { ADMIN_PERMISSIONS } from "../../config/adminAccess";
import { useAdminAuth } from "../../context/AdminAuthContext";
import AdminAccessDenied from "../../pages/admin/AdminAccessDenied";

/**
 * Focused route guard for /admin/employees. The parent AdminProtectedRoute
 * verifies the Admin session; this guard verifies People authority.
 * List/detail accept view; create/edit require manage.
 */
export default function AdminEmployeeManagementRoute({ requireWrite = false } = {}) {
  const { hasPermission } = useAdminAuth();
  const canView =
    hasPermission(ADMIN_PERMISSIONS.EMPLOYEES_VIEW) ||
    hasPermission(ADMIN_PERMISSIONS.EMPLOYEES_MANAGE) ||
    hasPermission("employees.view");
  const canManage = hasPermission(ADMIN_PERMISSIONS.EMPLOYEES_MANAGE);

  if (requireWrite ? !canManage : !canView) {
    return <AdminAccessDenied />;
  }

  return <Outlet />;
}
