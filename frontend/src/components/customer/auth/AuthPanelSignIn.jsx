/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · sign in
 *
 * The sign-in state of the single authentication page. Every decision still
 * belongs to the application:
 *
 *   · `AuthContext.signIn` → `POST /auth/customer/sign-in`, with the same
 *     `returnTo` sanitised by `sanitizeReturnUrl` and the same 500 ms success
 *     transition the production screen used;
 *   · the same identifiers (`signin-identifier`, `signin-password`), autofill
 *     hints and reveal control, so password managers behave identically;
 *   · the same validation sentences, the same failure fallback and the same
 *     success note, byte for byte;
 *   · the shared `GoogleSignInButton` — the GIS client and the
 *     `POST /auth/oauth/google` exchange are untouched.
 *
 * "Forgot password?" and "Create an account" are in-panel controls: they ask the
 * experience to change mode, and the URL, the photograph and the editorial text
 * stay exactly where they are. "Continue as Guest" keeps the production rule
 * (an `/account…` destination has nowhere for a guest to go, so it becomes the
 * catalogue) and remains a real navigation out of the auth screen.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import GoogleSignInButton from '../../auth/GoogleSignInButton.jsx';
import { Link } from '../router/index.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
  PanelAlert,
  PanelDivider,
  PanelHeading,
  PanelLink,
  PanelStatus,
  PasswordField,
  TextField,
} from './AuthPanelParts.jsx';

export default function AuthPanelSignIn({ onSwitchMode, returnTo, titleRef }) {
  const { signIn, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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
    <>
      <PanelHeading
        eyebrow="WELCOME BACK"
        title={<>Continue your <em>journey.</em></>}
        lead="Sign in to revisit your saved pieces, address preferences, and your personal atelier space."
        titleRef={titleRef}
      />

      {error && <PanelAlert>{error}</PanelAlert>}
      {success && <PanelStatus>Welcome back. Opening your atelier...</PanelStatus>}

      <form className="pf-auth-form" onSubmit={handleSubmit} noValidate>
        <TextField
          id="signin-identifier"
          label="Email address or mobile number"
          icon={<Mail size={16} strokeWidth={1.4} />}
          type="text"
          autoComplete="username"
          required
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="Enter your email or mobile number"
        />

        <PasswordField
          id="signin-password"
          label="Password"
          icon={<Lock size={16} strokeWidth={1.4} />}
          autoComplete="current-password"
          required
          visible={showPassword}
          onToggle={() => setShowPassword((current) => !current)}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          action={(
            <PanelLink className="pf-auth-textlink--quiet" onClick={() => onSwitchMode('forgotPassword')}>
              Forgot password?
            </PanelLink>
          )}
        />

        <label className="pf-auth-check">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          <span>Remember me on this device</span>
        </label>

        <button type="submit" className="pf-auth-submit" disabled={isSubmitting || success}>
          <span>{isSubmitting ? 'Verifying Credentials...' : success ? 'Authenticated' : 'Sign In to Account'}</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>

        <PanelDivider />

        <GoogleSignInButton
          variant="glass"
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

      <div className="pf-auth-alt">
        <p>
          New to PRATIKSHYA FASHION?{' '}
          <PanelLink onClick={() => onSwitchMode('register')}>Create an account</PanelLink>
        </p>
        {/* A guest whose destination is the account area has nowhere to go
            there, so the production page sends them to the catalogue — the
            same rule, unchanged. */}
        <Link className="pf-auth-guest" to={returnTo.startsWith('/account') ? '/shop' : returnTo}>
          Continue as Guest
        </Link>
      </div>
    </>
  );
}
