/**
 * PRATIKSHYA FASHION — PHASE 10 · the password-recovery request screen, as a
 * page of the design.
 *
 * The production page (`pages/auth/ForgotPassword.jsx`) asks the backend for
 * password-reset instructions and shows its confirmation only when the backend
 * accepts the request — `AuthContext.forgotPassword` →
 * `POST /auth/customer/forgot-password`. This screen keeps that path, that
 * condition and those words:
 *
 *   · the identifier is validated with `isValidIdentifier` (the application's
 *     own email-or-10-digit-phone rule, imported, never re-implemented);
 *   · an accepted request shows the confirmation naming the identifier that was
 *     submitted; a refused one shows the backend's own message and no
 *     confirmation — the screen never claims an email was sent when the request
 *     failed, and never invents a state the API did not reach;
 *   · the confirmation's two actions are the production page's: the way on to
 *     `/reset-password` and the way back to `/signin`.
 *
 * ONE THING THIS PHASE DOES NOT TOUCH. The production reset screen
 * (`pages/auth/ResetPassword.jsx`) does not read the `userId`/`token` pair the
 * backend requires (`ResetPasswordRequest`, `backend/app/schemas/auth/login.py`)
 * — so the "Proceed to Reset Password" action leads to a screen that cannot
 * complete a reset. That defect is recorded in
 * `docs/PHASE-10-AUTHENTICATION-UI.md` §7 and was left exactly as production
 * has it: this phase changes the room, not the behaviour, and fixing the reset
 * flow is not this phase's approval. The screen below therefore promises
 * nothing beyond "we have prepared instructions", which is what the production
 * page says.
 *
 * The design has no authentication screens; the page is drawn from the design's
 * blocks and only the panels the design never drew live in `aarna.auth.css`.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Link } from '../router/index.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { isValidIdentifier } from '../../../utils/validation.js';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Forgot Password — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!identifier.trim()) {
      setError('Please enter your registered email address or phone number.');
      return;
    }

    if (!isValidIdentifier(identifier)) {
      setError('Please enter a valid email format or 10-digit mobile number.');
      return;
    }

    setIsSubmitting(true);
    const result = await forgotPassword(identifier);
    setIsSubmitting(false);

    if (result.ok) {
      setSubmitted(true);
    } else {
      setError(result.error || 'Unable to send reset instructions.');
    }
  };

  return (
    <div className="info container pf-auth">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span>/</span>
        <Link to="/signin">Sign In</Link><span>/</span>
        <span>Forgot Password</span>
      </nav>

      {!submitted ? (
        <>
          <p className="label">Account Recovery</p>
          <h1 className="display info__title">Reset your <em>password.</em></h1>
          <p className="info__lead">
            Enter the email address or mobile number associated with your PRATIKSHYA FASHION
            account, and we will send you instructions to reset your password.
          </p>

          {error && <p className="form__err pf-auth__alert" role="alert">{error}</p>}

          <form className="form pf-auth__form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="forgot-identifier">
              Registered Email or Phone Number
              <input
                id="forgot-identifier"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="e.g. ananya.sharma@example.com"
              />
            </label>

            <Button type="submit" variant="solid" className="btn--block" disabled={isSubmitting}>
              {isSubmitting ? 'Sending Instructions...' : 'Send Reset Link'}
            </Button>
          </form>
        </>
      ) : (
        <div className="pf-auth__sent">
          {/* The confirmation names the identifier that was actually submitted —
              the same sentence the production page shows. */}
          <p className="label">Instructions Dispatched</p>
          <h1 className="display info__title">Check your <em>inbox.</em></h1>
          <p>
            We have prepared password reset instructions for{' '}
            <strong>{identifier}</strong>.
          </p>
          <div className="pf-auth__sent-actions">
            <Button variant="solid" className="btn--block" onClick={() => navigate('/reset-password')}>
              Proceed to Reset Password
            </Button>
            <Button variant="ghost" to="/signin" className="btn--block">
              Return to Sign In
            </Button>
          </div>
        </div>
      )}

      <p className="pf-auth__back">
        <Link className="pf-auth__link" to="/signin">
          <ArrowLeft size={13} aria-hidden="true" /> Back to Sign In
        </Link>
      </p>
    </div>
  );
}
