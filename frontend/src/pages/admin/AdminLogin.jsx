import { Navigate, useSearchParams } from "react-router-dom";

/**
 * The dedicated Admin login page is RETIRED — one canonical staff sign-in
 * (/login) now serves all four account levels; the backend routes SUPER_ADMIN
 * and ADMIN credentials to the Admin workspace after authentication.
 *
 * This thin redirect keeps bookmarked /admin/login URLs working and preserves
 * the returnTo handoff for AdminProtectedRoute consumers.
 */
export default function AdminLogin() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const target = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
  return <Navigate to={target} replace />;
}
