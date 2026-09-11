import { Navigate, useSearchParams } from "react-router-dom";

/**
 * The dedicated Employee login page is RETIRED — one canonical staff sign-in
 * (/login) now serves all four account levels; the backend routes
 * SUPER_EMPLOYEE and EMPLOYEE credentials to the Employee workspace after
 * authentication.
 *
 * This thin redirect keeps bookmarked /employee/login URLs working and
 * preserves the returnTo handoff for EmployeeProtectedRoute consumers.
 */
export default function EmployeeLogin() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const target = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
  return <Navigate to={target} replace />;
}
