import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Eye, EyeOff, KeyRound } from "lucide-react";
import { AtelierButton, Brand, Rule } from "../../design-system";
import { sanitizeAdminReturnUrl } from "../../config/adminNavigation";
import { sanitizeEmployeeReturnUrl } from "../../config/employeeNavigation";
import { homeForAccountLevel } from "../../config/rbacModel";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { apiSignInStaff } from "../../services/api/authApi";

/**
 * PRATIKSHYA FASHON — the ONE canonical staff sign-in page.
 *
 * Serves all four account levels: SUPER_ADMIN · ADMIN · SUPER_EMPLOYEE ·
 * EMPLOYEE. The backend authenticates the credential (email, phone or PF
 * employee code), determines the account level and the authorized
 * workspace; this page only routes to the destination the server resolved —
 * it never decides authority client-side. The customer storefront keeps its
 * own separate sign-in (/signin); portal isolation is unchanged: the issued
 * token is stored under the workspace's isolated scope only.
 */
export default function StaffLogin() {
  const { refreshSession: refreshAdminSession } = useAdminAuth();
  const { refreshSession: refreshEmployeeSession } = useEmployeeAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = "Sign In — PRATIKSHYA FASHON";
    return () => {
      document.title = previous;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!identifier.trim()) {
      setError("Enter your email, phone or employee ID.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setIsSubmitting(true);

    const result = await apiSignInStaff({ identifier: identifier.trim(), password });
    if (!result.ok) {
      setError(result.error || "Those credentials don't match a staff account.");
      setIsSubmitting(false);
      return;
    }

    // Sync the owning workspace context with the freshly-issued, scoped
    // session (both contexts re-validate against the backend), then route
    // to the destination the SERVER resolved. The workspace home comes from
    // the authoritative accountLevel (SUPER_ADMIN/ADMIN → /admin,
    // SUPER_EMPLOYEE/EMPLOYEE → /employee); `workspace` is only a fallback
    // for sessions that predate the accountLevel field. returnTo is honored
    // only when it belongs to the resolved workspace.
    const home = homeForAccountLevel(result.accountLevel) ??
      (result.workspace === "admin" ? "/admin" : "/employee");
    const returnTo = home === "/admin"
      ? sanitizeAdminReturnUrl(searchParams.get("returnTo"))
      : sanitizeEmployeeReturnUrl(searchParams.get("returnTo"));

    if (home === "/admin") {
      const session = await refreshAdminSession();
      setIsSubmitting(false);
      if (!session?.isAuthenticated) {
        setError("Signed in, but the admin profile could not be opened. Try again.");
        return;
      }
      navigate(returnTo, { replace: true });
      return;
    }

    const session = await refreshEmployeeSession();
    setIsSubmitting(false);
    if (!session?.isAuthenticated) {
      setError("Signed in, but the employee profile could not be opened. Try again.");
      return;
    }
    navigate(
      result.employee?.mustChangePassword ? "/employee/change-password" : returnTo,
      { replace: true }
    );
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-ink-line bg-ink px-6 py-5 text-ivory">
        <Brand
          as="h1"
          size="default"
          variant="lockup"
          theme="dark"
          wordmark="PRATIKSHYA FASHON"
          subtitle="Staff Sign In · Admin & Team Portal"
        />
      </header>

      <main className="mx-auto max-w-xl px-5 py-12 sm:px-6 md:py-20">
        <div className="border border-mist/80 bg-surface/50 p-6 sm:p-12">
          <div className="text-center">
            <span className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center bg-ink text-gold">
              <KeyRound size={18} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">
              One door · four levels
            </p>
            <h1 className="mt-3 font-display text-3xl font-light tracking-tight md:text-4xl">
              Staff <span className="italic text-accent">sign in.</span>
            </h1>
            <Rule width="w-12" tone="accent" className="mx-auto my-6" />
            <p className="font-ui text-xs leading-relaxed text-taupe">
              Super Admin, Admin, Super Employee and Employee accounts all sign in here.
              Your account level determines the workspace you are taken to — the server
              decides, not this page.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 border border-accent/40 bg-accent/5 p-4 text-accent"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="font-ui text-xs leading-relaxed">{error}</p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <div>
              <label
                htmlFor="staff-identifier"
                className="mb-2 block font-ui text-[11px] uppercase tracking-[.18em] text-ink"
              >
                Email · Phone · Employee ID
              </label>
              <input
                id="staff-identifier"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="you@pratikshyafashon.in · PF-SLS-00124"
                className="w-full border border-pearl bg-canvas px-4 py-3.5 font-ui text-sm text-ink placeholder:text-taupe/60 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="staff-password"
                  className="font-ui text-[11px] uppercase tracking-[.18em] text-ink"
                >
                  Password
                </label>
                <Link
                  to="/employee/forgot-password"
                  className="font-ui text-[11px] text-taupe underline-offset-4 hover:text-accent hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="staff-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                  className="w-full border border-pearl bg-canvas px-4 py-3.5 pr-12 font-ui text-sm text-ink placeholder:text-taupe/60 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((open) => !open)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-taupe hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <AtelierButton
              type="submit"
              className="w-full justify-center py-4"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                "Verifying access…"
              ) : (
                <>
                  Sign in <ArrowRight size={14} aria-hidden="true" />
                </>
              )}
            </AtelierButton>
          </form>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center">
            <Link
              to="/"
              className="font-ui text-[11px] text-taupe underline-offset-4 hover:text-accent hover:underline"
            >
              Back to store
            </Link>
            <Link
              to="/signin"
              className="font-ui text-[11px] text-taupe underline-offset-4 hover:text-accent hover:underline"
            >
              Customer sign in
            </Link>
            <a
              href="mailto:operations@pratikshyafashon.in"
              className="font-ui text-[11px] text-taupe underline-offset-4 hover:text-accent hover:underline"
            >
              Contact administrator
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
