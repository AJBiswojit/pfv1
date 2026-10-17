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
 *   · the confirmation offers only the way back to `/signin`. It does not offer
 *     `/reset-password`: no reset email is dispatched yet, so there is no link
 *     that screen could be given (Phase 12 fix).
 *
 *  * PHASE 12. The production reset screen (`pages/auth/ResetPassword.jsx`) now
 * reads the `userId`/`token` pair the backend requires, but no reset email is
 * dispatched yet (the backend stores the token and leaves a TODO), so this
 * screen states that no email was sent and offers no route to a reset link.
 * The confirmation promises nothing beyond what the backend did.
*/

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '../router/index.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { isValidIdentifier } from '../../../utils/validation.js';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();

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
{!submitted ? (
        <>
          <p className="label">Account Recovery</p>
          <h1 className="display info__title">Reset your <em>password.</em></h1>
          <p className="info__lead">
            Enter the email address or mobile number associated with your PRATIKSHYA FASHION
            account to request a password reset.
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
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </form>
        </>
      ) : (
        <div className="pf-auth__sent">
          {/* The confirmation names the identifier that was actually submitted —
              the same sentence the production page shows. */}
          <p className="label">Request Received</p>
          <h1 className="display info__title">Thank <em>you.</em></h1>
          <p>
            We received your request for <strong>{identifier}</strong>. Password reset
            emails are not yet connected to this storefront, so no reset email has been sent.
            Please contact the PRATIKSHYA FASHION team for help regaining access to your account.
          </p>
          <div className="pf-auth__sent-actions">
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
