import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Flower2,
  LockKeyhole,
  Mail,
  Package,
  UsersRound,
} from "lucide-react";
import { sanitizeAdminReturnUrl, sanitizeSuperAdminReturnUrl } from "../../config/adminNavigation";
import { sanitizeEmployeeReturnUrl } from "../../config/employeeNavigation";
import { homeForAccountLevel } from "../../config/rbacModel";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useEmployeeAuth } from "../../context/EmployeeAuthContext";
import { apiSignInStaff } from "../../services/api/authApi";
import brandMark from "../../assets/pratikshya_logo.webp";
import "./staff-login.css";

/**
 * PRATIKSHYA FASHION — the ONE canonical staff sign-in page.
 *
 * Serves all four account levels: SUPER_ADMIN · ADMIN · SUPER_EMPLOYEE ·
 * EMPLOYEE. The backend authenticates the credential (email, phone or PF
 * employee code), determines the account level and the authorized
 * workspace; this page only routes to the destination the server resolved —
 * it never decides authority client-side. The customer storefront keeps its
 * own separate sign-in (/signin); portal isolation is unchanged: the issued
 * token is stored under the workspace's isolated scope only.
 */
const STAFF_FEATURES = [
  {
    label: "Manage",
    description: "Collections & Catalogue",
    Icon: Flower2,
  },
  {
    label: "Streamline",
    description: "Orders & Operations",
    Icon: Package,
  },
  {
    label: "Empower",
    description: "Every Team Member",
    Icon: UsersRound,
  },
];

function SecurityEmblem() {
  return (
    <svg
      className="staff-login__security-emblem"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14 1.9 17.1 8.2 24 10.9 20.1 14l3.9 3.1-6.9 2.7L14 26.1l-3.1-6.3L4 17.1 7.9 14 4 10.9l6.9-2.7L14 1.9Z" />
      <path d="M14 6.2 16.2 11l5.1 2.1-3 2.1 3 2.1-5.1 2.1L14 24.2l-2.2-4.8-5.1-2.1 3-2.1-3-2.1 5.1-2.1L14 6.2Z" />
      <path d="M14 11.3v5.4M11.3 14h5.4" />
      <circle cx="14" cy="14" r="1.25" />
    </svg>
  );
}

function AtelierDecorations() {
  return (
    <>
      <svg
        className="staff-login__art"
        viewBox="0 0 1568 802"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <pattern id="staff-login-lattice" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M22 0 44 22 22 44 0 22 22 0Z" />
            <path d="M22 11 33 22 22 33 11 22 22 11Z" />
            <circle cx="22" cy="22" r="1.15" />
          </pattern>
          <pattern id="staff-login-rosette" width="112" height="112" patternUnits="userSpaceOnUse">
            <circle cx="56" cy="56" r="37" />
            <circle cx="56" cy="56" r="23" />
            <path d="M56 8v96M8 56h96M22 22l68 68M90 22 22 90" />
            <path d="m56 27 8 21 21 8-21 8-8 21-8-21-21-8 21-8 8-21Z" />
            <circle cx="56" cy="56" r="3" />
          </pattern>
          <linearGradient id="staff-login-silk" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6b1029" />
            <stop offset="0.5" stopColor="#51091d" />
            <stop offset="1" stopColor="#741b34" />
          </linearGradient>
          <linearGradient id="staff-login-thread" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#d7b99a" stopOpacity="0.1" />
            <stop offset="0.42" stopColor="#f0d9bf" stopOpacity="0.82" />
            <stop offset="1" stopColor="#c79a6b" stopOpacity="0.18" />
          </linearGradient>
        </defs>

        {/* Fine heritage geometry is kept to the margins so the copy stays clear. */}
        <rect x="0" y="0" width="105" height="474" fill="url(#staff-login-lattice)" className="staff-login__pattern" />
        <rect x="1335" y="0" width="233" height="310" fill="url(#staff-login-rosette)" className="staff-login__pattern staff-login__pattern--right" />
        <rect x="795" y="548" width="195" height="254" fill="url(#staff-login-rosette)" className="staff-login__pattern staff-login__pattern--lower" />
        <path className="staff-login__arc" d="M753 0c-106 54-164 150-164 258" />
        <path className="staff-login__arc staff-login__arc--right" d="M1568 520c-113 44-175 134-198 282" />

        {/* Delicate botanical linework: one cropped sprig at each outer corner. */}
        <g className="staff-login__botanical" transform="translate(1374 32)">
          <path d="M8 166C62 135 105 97 152 18" />
          <path d="M35 146c-4-24-18-39-38-44 1 22 14 38 38 44ZM59 126c-1-27 11-47 34-57 4 25-8 45-34 57ZM83 100c-1-27 12-47 36-56 2 25-9 45-36 56ZM106 70c-2-24 9-43 30-54 5 23-6 42-30 54ZM126 42c-2-17 4-31 18-41 7 16 2 30-18 41Z" />
          <path d="M42 141c18-4 32-1 43 9-17 7-31 4-43-9ZM72 112c20-4 35 1 44 13-19 7-34 2-44-13ZM99 82c18-3 31 1 41 12-17 7-31 3-41-12Z" />
          <path d="M22 157c44-26 78-60 110-111" />
        </g>
        <g className="staff-login__botanical staff-login__botanical--left" transform="translate(-27 412) scale(.78)">
          <path d="M5 122C55 88 94 46 127 4" />
          <path d="M26 106C3 98-8 80-6 58c22 7 34 22 32 48ZM48 84c-2-24 9-43 30-53 4 23-5 41-30 53ZM73 58c1-24 15-41 37-47 1 22-10 39-37 47ZM49 85c18-5 33-1 43 11-17 8-31 4-43-11Z" />
          <path d="M13 116c41-27 72-59 101-96" />
        </g>

        {/* Couture silk curves, drawn as vector paths rather than a raster backdrop. */}
        <path
          className="staff-login__fabric-shadow"
          d="M0 542C110 590 171 726 342 754c150 25 208-55 335-28 111 23 157 111 284 130H0V542Z"
        />
        <path
          className="staff-login__fabric"
          fill="url(#staff-login-silk)"
          d="M0 563C105 611 166 744 342 773c145 24 215-57 337-28 109 26 160 99 280 111H0V563Z"
        />
        <path
          className="staff-login__fabric-fold"
          d="M0 598c122 57 178 163 335 176 157 14 212-66 340-38 84 18 137 74 219 94"
        />
        <path
          className="staff-login__fabric-thread"
          d="M0 548c118 54 168 184 341 210 162 24 224-64 343-34 89 23 128 81 221 105"
        />
        <path
          className="staff-login__fabric-thread staff-login__fabric-thread--fine"
          d="M0 582c112 48 163 171 331 196 159 23 221-62 343-31 83 21 139 77 210 93"
        />
      </svg>

      <img className="staff-login__monogram" src={brandMark} alt="" aria-hidden="true" />
      <span className="staff-login__center-rule" aria-hidden="true" />
    </>
  );
}

function FeatureHighlights() {
  return (
    <ul className="staff-login__features" aria-label="Team workspace highlights">
      {STAFF_FEATURES.map(({ label, description, Icon }) => (
        <li className="staff-login__feature" key={label}>
          <span className="staff-login__feature-icon" aria-hidden="true">
            <Icon size={32} strokeWidth={1.35} />
          </span>
          <span className="staff-login__feature-copy">
            <span className="staff-login__feature-label">{label}</span>
            <span className="staff-login__feature-description">{description}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

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
    document.title = "Staff Sign In — PRATIKSHYA FASHION";
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
    // the authoritative accountLevel (SUPER_ADMIN → /super-admin,
    // ADMIN → /admin, SUPER_EMPLOYEE/EMPLOYEE → /employee); `workspace` is
    // only a fallback for sessions that predate the accountLevel field.
    // returnTo is honored only when it belongs to the resolved workspace.
    const home = homeForAccountLevel(result.accountLevel) ??
      (result.workspace === "admin" ? "/admin" : "/employee");

    const isAdminWorkspace = home === "/admin" || home === "/super-admin";
    const returnTo = home === "/super-admin"
      ? sanitizeSuperAdminReturnUrl(searchParams.get("returnTo"))
      : isAdminWorkspace
        ? sanitizeAdminReturnUrl(searchParams.get("returnTo"))
        : sanitizeEmployeeReturnUrl(searchParams.get("returnTo"));

    if (isAdminWorkspace) {
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
    <div className="staff-login">
      <header className="staff-login__header">
        <div className="staff-login__header-inner">
          <div className="staff-login__brand" aria-label="PRATIKSHYA FASHION">
            <img className="staff-login__brand-mark" src={brandMark} alt="" />
            <span className="staff-login__brand-name">PRATIKSHYA FASHION</span>
          </div>
          <span className="staff-login__portal-label">Staff Sign In · Admin &amp; Team Portal</span>
          <div className="staff-login__security">
            <SecurityEmblem />
            <span>Secure · Responsible · Together</span>
          </div>
        </div>
      </header>

      <main className="staff-login__main">
        <AtelierDecorations />
        <div className="staff-login__layout">
          <div className="staff-login__editorial">
            <section className="staff-login__intro" aria-labelledby="staff-editorial-title">
              <p className="staff-login__eyebrow">
                <span>The House of Pratikshya</span>
                <span className="staff-login__eyebrow-rule" aria-hidden="true" />
              </p>
              <h1 id="staff-editorial-title" className="staff-login__headline">
                <span>Behind every</span>
                <span>collection,</span>
                <span className="staff-login__headline-accent">a dedicated team.</span>
              </h1>
              <span className="staff-login__intro-rule" aria-hidden="true" />
              <p className="staff-login__intro-copy">
                A secure workspace for the people who manage collections, orders and create exceptional customer experiences.
              </p>
            </section>

            <FeatureHighlights />

            <p className="staff-login__signature">
              <span className="staff-login__signature-rule" aria-hidden="true" />
              <span>Pratikshya Fashion</span>
            </p>
          </div>

          <section className="staff-login__panel" aria-labelledby="staff-login-title">
            <div className="staff-login__panel-heading">
              <span className="staff-login__lock-emblem" aria-hidden="true">
                <LockKeyhole size={23} strokeWidth={1.45} />
              </span>
              <p className="staff-login__access-eyebrow">Secure team access</p>
              <h2 id="staff-login-title" className="staff-login__title">Staff sign in.</h2>
              <span className="staff-login__panel-rule" aria-hidden="true" />
              <p className="staff-login__levels">One door · four levels</p>
              <p className="staff-login__explanation">
                Super Admin, Admin, Super Employee and Employee accounts all sign in here. Your account level determines the workspace you are taken to — the server decides, not this page.
              </p>
            </div>

            {error ? (
              <div id="staff-login-error" className="staff-login__error" role="alert">
                <AlertCircle size={17} strokeWidth={1.7} aria-hidden="true" />
                <p>{error}</p>
              </div>
            ) : null}

            <form
              className="staff-login__form"
              onSubmit={handleSubmit}
              noValidate
              aria-busy={isSubmitting}
              aria-describedby={error ? "staff-login-error" : undefined}
            >
              <div className="staff-login__field">
                <label className="staff-login__field-label" htmlFor="staff-identifier">
                  Email · Phone · Employee ID
                </label>
                <div className="staff-login__input-wrap">
                  <Mail className="staff-login__input-icon" size={21} strokeWidth={1.55} aria-hidden="true" />
                  <input
                    id="staff-identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="Enter your email, phone or employee ID"
                    className="staff-login__input"
                    aria-describedby={error ? "staff-login-error" : undefined}
                  />
                </div>
              </div>

              <div className="staff-login__field">
                <div className="staff-login__field-heading">
                  <label className="staff-login__field-label" htmlFor="staff-password">Password</label>
                  <Link className="staff-login__forgot" to="/employee/forgot-password">
                    Forgot password?
                  </Link>
                </div>
                <div className="staff-login__input-wrap">
                  <LockKeyhole className="staff-login__input-icon" size={21} strokeWidth={1.55} aria-hidden="true" />
                  <input
                    id="staff-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="staff-login__input staff-login__input--password"
                    aria-describedby={error ? "staff-login-error" : undefined}
                  />
                  <button
                    type="button"
                    className="staff-login__visibility"
                    onClick={() => setShowPassword((open) => !open)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={20} strokeWidth={1.5} aria-hidden="true" /> : <Eye size={20} strokeWidth={1.5} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <button className="staff-login__submit" type="submit" disabled={isSubmitting}>
                <span>{isSubmitting ? "Verifying access…" : "Sign in"}</span>
                {!isSubmitting ? <ArrowRight size={19} strokeWidth={1.7} aria-hidden="true" /> : null}
              </button>
            </form>

            <nav className="staff-login__footer" aria-label="Other destinations">
              <Link to="/">Back to store</Link>
              <Link to="/signin">Customer sign in</Link>
              <a href="mailto:operations@pratikshyafashion.in">Contact administrator</a>
            </nav>
          </section>
        </div>
      </main>
    </div>
  );
}
