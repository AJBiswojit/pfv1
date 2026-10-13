/**
 * PRATIKSHYA FASHION — Super Admin workspace route guard.
 *
 * Three outcomes, in order:
 *
 *   no admin session        → /login (unified staff sign-in, with returnTo)
 *   ADMIN session           → /admin  (admin has its own workspace, not this one)
 *   employee / customer     → /login
 *   SUPER_ADMIN session     → Outlet (allowed through)
 *
 * Only SUPER_ADMIN accounts may enter /super-admin routes.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingState } from "../../design-system";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { sanitizeSuperAdminReturnUrl } from "../../config/adminNavigation";

export default function SuperAdminProtectedRoute() {
  const { isAuthenticated, isLoading, isSuperAdmin, hasAdminWorkspaceAccess } = useAdminAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <LoadingState label="Verifying super admin access" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const intended = sanitizeSuperAdminReturnUrl(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${encodeURIComponent(intended)}`} replace />;
  }

  /* Plain ADMIN tried to open the Super Admin workspace — send them home. */
  if (hasAdminWorkspaceAccess && !isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  /* Non-admin (employee / customer) — back to login. */
  if (!isSuperAdmin) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
