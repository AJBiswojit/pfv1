import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  AtelierButton,
  AtelierSection,
  Breadcrumb,
  Rule,
} from "../../design-system";
import { useAuth } from "../../context/AuthContext";
import { validateResetPassword, RESET_PASSWORD_MIN } from "../../utils/validation";

/** Statuses the backend returns when the reset token is unknown, used or expired. */
const LINK_REJECTED_STATUSES = [401, 404];

/**
 * Reset Password — /reset-password?userId=<id>&token=<token>
 *
 * The backend (`POST /auth/customer/reset-password`, `ResetPasswordRequest`)
 * needs BOTH the user id and the single-use token that the reset link carries.
 * Both are read from the URL here and sent through `AuthContext.resetPassword`
 * → `apiResetPasswordCustomer`. The screen shows success only when the backend
 * accepted the reset; a rejected or missing link is reported as such.
 */
export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const userId = (searchParams.get("userId") || "").trim();
  const token = (searchParams.get("token") || "").trim();
  const linkComplete = Boolean(userId && token);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [linkRejected, setLinkRejected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Reset Password — PRATIKSHYA FASHION";
    return () => {
      document.title = prevTitle;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLinkRejected(false);
    if (!linkComplete) return;

    const check = validateResetPassword(password, confirmPassword);
    if (!check.ok) {
      setError(check.message);
      return;
    }

    setIsSubmitting(true);
    const result = await resetPassword(password, confirmPassword, { userId, token });
    setIsSubmitting(false);

    if (result?.ok) {
      setSuccess(true);
      return;
    }
    if (LINK_REJECTED_STATUSES.includes(result?.status)) {
      setLinkRejected(true);
      setError("This reset link is invalid or has expired. Request a new link to continue.");
      return;
    }
    setError(result?.error || "We could not update your password. Please try again.");
  };

  return (
    <main>
      <AtelierSection rhythm="none" width="content" className="pb-24 pt-28 sm:pt-32 md:pb-32">
        <Breadcrumb
          items={[
            { label: "Atelier", to: "/" },
            { label: "Sign In", to: "/signin" },
            { label: "Reset Password" },
          ]}
          className="mb-8 md:mb-10"
        />

        <div className="mx-auto max-w-xl">
          <div className="border border-mist/80 bg-surface/50 p-7 sm:p-12 md:p-14">
            {!linkComplete && !success ? (
              <div className="text-center py-4" role="alert">
                <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">Reset Link</p>
                <h1 className="mt-3 font-display text-3xl font-light tracking-tight md:text-4xl text-ink">
                  This link is <span className="italic text-accent">incomplete.</span>
                </h1>
                <Rule width="w-12" tone="accent" className="mx-auto my-6" />
                <p className="font-ui text-xs leading-relaxed text-taupe max-w-md mx-auto mb-8">
                  Open the password reset link from your email, or request a new one.
                </p>
                <AtelierButton as={Link} to="/forgot-password" variant="primary" size="md" className="w-full justify-center py-4">
                  Request a new link
                </AtelierButton>
              </div>
            ) : !success ? (
              <>
                <div className="text-center">
                  <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">
                    New Credentials
                  </p>
                  <h1 className="mt-3 font-display text-3xl font-light tracking-tight md:text-4xl text-ink">
                    Create new <span className="italic text-accent">password.</span>
                  </h1>
                  <Rule width="w-12" tone="accent" className="mx-auto my-6" />
                  <p className="font-ui text-xs leading-relaxed text-taupe">
                    Choose a secure password of at least {RESET_PASSWORD_MIN} characters to protect your atelier account.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="mt-6 flex items-start gap-3 border border-accent/40 bg-accent/5 p-4 text-accent"
                  >
                    <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="font-ui text-xs leading-relaxed">
                      {error}
                      {linkRejected && (
                        <>
                          {" "}
                          <Link to="/forgot-password" className="underline">Request a new link</Link>
                        </>
                      )}
                    </p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
                  {/* New Password */}
                  <div>
                    <label
                      htmlFor="reset-newPassword"
                      className="block font-ui text-[11px] uppercase tracking-[.18em] text-ink mb-2"
                    >
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        id="reset-newPassword"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={`Minimum ${RESET_PASSWORD_MIN} characters`}
                        className="w-full border border-pearl bg-canvas px-4 py-3.5 pr-12 font-ui text-sm text-ink placeholder:text-taupe/60 transition-colors focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-taupe hover:text-ink transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff size={16} strokeWidth={1.5} aria-hidden="true" />
                        ) : (
                          <Eye size={16} strokeWidth={1.5} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label
                      htmlFor="reset-confirmPassword"
                      className="block font-ui text-[11px] uppercase tracking-[.18em] text-ink mb-2"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        id="reset-confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        className="w-full border border-pearl bg-canvas px-4 py-3.5 pr-12 font-ui text-sm text-ink placeholder:text-taupe/60 transition-colors focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        aria-pressed={showConfirmPassword}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-taupe hover:text-ink transition-colors"
                      >
                        {showConfirmPassword ? (
                          <EyeOff size={16} strokeWidth={1.5} aria-hidden="true" />
                        ) : (
                          <Eye size={16} strokeWidth={1.5} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <AtelierButton
                      type="submit"
                      variant="primary"
                      size="md"
                      disabled={isSubmitting}
                      className="w-full justify-center py-4"
                    >
                      {isSubmitting ? (
                        "Updating Password..."
                      ) : (
                        <>
                          Update Password <ArrowRight size={14} aria-hidden="true" />
                        </>
                      )}
                    </AtelierButton>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center border border-cocoa/30 bg-cocoa/10 text-cocoa">
                  <CheckCircle2 size={28} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <p className="font-ui text-[10px] uppercase tracking-[.3em] text-accent">
                  Success
                </p>
                <h1 className="mt-3 font-display text-3xl font-light tracking-tight text-ink">
                  Password <span className="italic text-accent">updated.</span>
                </h1>
                <Rule width="w-12" tone="accent" className="mx-auto my-6" />
                <p className="font-ui text-xs leading-relaxed text-taupe max-w-md mx-auto mb-8">
                  Your password has been changed successfully. You may now sign in to your atelier account with your new credentials.
                </p>

                <AtelierButton
                  as={Link}
                  to="/signin"
                  variant="primary"
                  size="md"
                  className="w-full justify-center py-4"
                >
                  Sign In to Your Account <ArrowRight size={14} aria-hidden="true" />
                </AtelierButton>
              </div>
            )}

            <div className="mt-8 border-t border-mist/70 pt-6 text-center">
              <Link
                to="/signin"
                className="font-ui text-xs text-graphite hover:text-accent transition-colors"
              >
                Return to Sign In
              </Link>
            </div>
          </div>
        </div>
      </AtelierSection>
    </main>
  );
}
