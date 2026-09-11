/**
 * PRATIKSHYA FASHON — Admin workspace route guard.
 *
 * Three outcomes, in order:
 *
 *   no admin session            → /login (unified staff sign-in, with returnTo)
 *   employee-domain session     → /login — employee credentials never open
 *                                  the Admin workspace (the backend is the
 *                                  authority; this is the UX mirror of it)
 *   admin session, no rights    → Admin access denied
 *
 * Both Admin-workspace account levels (SUPER_ADMIN, ADMIN) may enter;
 * per-module authority is capability-checked (backend-enforced), never
 * implied by the workspace alone.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingState } from "../../design-system";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { sanitizeAdminReturnUrl } from "../../config/adminNavigation";
import AdminAccessDenied from "../../pages/admin/AdminAccessDenied";

export default function AdminProtectedRoute() {
  const { isAuthenticated, isLoading, hasAdminWorkspaceAccess } = useAdminAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <LoadingState label="Verifying administration access" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const intended = sanitizeAdminReturnUrl(location.pathname + location.search);
    // Unified staff sign-in — one /login page for all four account levels.
    return <Navigate to={`/login?returnTo=${encodeURIComponent(intended)}`} replace />;
  }

  /* Signed in, but not with an Admin-workspace account (SUPER_ADMIN or
     ADMIN). Employees belong to the Employee workspace. */
  if (!hasAdminWorkspaceAccess) {
    return <AdminAccessDenied />;
  }

  return <Outlet />;
}
