/**
 * PRATIKSHYA FASHION — PHASE 10 · the sign-in screen, as a page of the design.
 *
 * This application's customer sign-in is the production page
 * (`pages/auth/SignIn.jsx`): identifier (email or mobile) + password, a
 * show/hide toggle, "remember me", Google SSO, and the `returnTo` handover
 * through `sanitizeReturnUrl`. The design has NO authentication screens at all
 * — its `/account` is a fifty-line prototype that stores a name in
 * `localStorage` and says so on the page — so this screen keeps every behaviour
 * exactly where it is and changes only the room it stands in:
 *
 *   · the page is drawn out of the design's own blocks — `.container`, `.info`,
 *     `.crumbs`, `.label`, `.display`, `.info__lead`, `.form`, `.form__err`,
 *     `.form__note` and the `.btn` register;
 *   · every decision stays with the application: `AuthContext.signIn` (which
 *     calls the real `POST /auth/customer/sign-in` and validates the session
 *     against `/customers/me` on restore), `sanitizeReturnUrl` for the redirect,
 *     and the production page's own words for every message — the validation
 *     copy, the failure fallback and the success note are byte-for-byte the
 *     strings the production screen shows;
 *   · the Google button is the SAME component the production screen renders
 *     (`components/auth/GoogleSignInButton.jsx`) — the GIS client, the client-id
 *     resolution and the `POST /auth/oauth/google` exchange are untouched.
 *
 * Only what the design never drew is declared in `customer.auth.css` (the password
 * field's toggle, the divider, the check row, the alternate-action block), and
 * every declaration there is scoped to `.pf-root` and built from design tokens.
 *
 * Nothing here is a mock: there is no local "signed in" state, no fabricated
 * profile and no success that the backend did not confirm. If the API is
 * unreachable, the screen shows the error the context returns — the same
 * behaviour the production page documents.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Link } from '../router/index.jsx';
import Button from '../components/ui/Button.jsx';
import GoogleSignInButton from '../../../components/auth/GoogleSignInButton.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { sanitizeReturnUrl } from '../../../utils/validation.js';

export default function SignIn() {
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawReturnTo = searchParams.get('returnTo') || '/account';
  const returnTo = sanitizeReturnUrl(rawReturnTo);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Sign In — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  /* A customer who is already signed in is sent on to `returnTo` — the same
     condition the production page applies, so the success transition is never
     interrupted by its own redirect. */
  useEffect(() => {
    if (isAuthenticated && !isSubmitting && !success) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, navigate, returnTo, isSubmitting, success]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!identifier.trim()) {
      setError('Please enter your registered email address or phone number.');
      return;
    }

    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    setIsSubmitting(true);
    const result = await signIn({ identifier, password, remember: rememberMe });

    if (result.ok) {
      setSuccess(true);
      setTimeout(() => {
        navigate(returnTo, { replace: true });
      }, 500);
    } else {
      setError(result.error || "That email or password doesn't match our records.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="info container pf-auth">
      <p className="label">Welcome Back</p>
      <h1 className="display info__title">Continue your <em>journey.</em></h1>
      <p className="info__lead">
        Sign in to view saved pieces, address preferences, and your personal atelier space.
      </p>

      {error && <p className="form__err pf-auth__alert" role="alert">{error}</p>}
      {success && (
        <p className="form__note pf-auth__status" role="status">
          Welcome back. Opening your atelier...
        </p>
      )}

      <form className="form pf-auth__form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="signin-identifier">
          Email Address or Mobile Number
          <input
            id="signin-identifier"
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="e.g. ananya.sharma@example.com"
          />
        </label>

        <div className="pf-auth__group">
          <div className="pf-auth__row">
            <label className="pf-auth__label" htmlFor="signin-password">Password</label>
            <Link className="pf-auth__link" to="/forgot-password">Forgot password?</Link>
          </div>
          <span className="pf-auth__field">
            <input
              id="signin-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="pf-auth__toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword
                ? <EyeOff size={16} strokeWidth={1.5} aria-hidden="true" />
                : <Eye size={16} strokeWidth={1.5} aria-hidden="true" />}
            </button>
          </span>
        </div>

        <label className="pf-auth__check">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          <span>Remember me on this device</span>
        </label>

        <Button type="submit" variant="solid" className="btn--block" disabled={isSubmitting || success}>
          {isSubmitting ? 'Verifying Credentials...' : success ? 'Authenticated' : 'Sign In to Account'}
        </Button>

        <p className="pf-auth__divider"><span>Or continue with</span></p>

        <GoogleSignInButton
          label="Sign in with Google"
          onSuccess={() => {
            setSuccess(true);
            setTimeout(() => {
              navigate(returnTo, { replace: true });
            }, 500);
          }}
          onError={(message) => setError(message)}
        />
      </form>

      <div className="pf-auth__alt">
        <p>
          New to PRATIKSHYA FASHION?{' '}
          <Link to={`/signup${rawReturnTo ? `?returnTo=${encodeURIComponent(rawReturnTo)}` : ''}`}>
            Create an account
          </Link>
        </p>
        <p>
          {/* A guest whose destination is the account area has nowhere to go
              there, so the production page sends them to the catalogue — the
              same rule, unchanged. */}
          <Link className="pf-auth__guest" to={returnTo.startsWith('/account') ? '/shop' : returnTo}>
            Continue as Guest
          </Link>
        </p>
      </div>
    </div>
  );
}
