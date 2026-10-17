import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Link } from '../router/index.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { validateResetPassword, RESET_PASSWORD_MIN } from '../../../utils/validation.js';

const LINK_REJECTED_STATUSES = [401, 404];

/** Storefront-styled reset form over the existing customer auth context/service. */
export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const userId = (searchParams.get('userId') || '').trim();
  const token = (searchParams.get('token') || '').trim();
  const linkComplete = Boolean(userId && token);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [linkRejected, setLinkRejected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Reset Password — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
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
      setError('This reset link is invalid or has expired. Request a new link to continue.');
      return;
    }
    setError(result?.error || 'We could not update your password. Please try again.');
  };

  return (
    <div className="info container pf-auth">
{!linkComplete && !success ? (
        <>
          <p className="label">Reset Link</p>
          <h1 className="display info__title">This link is <em>incomplete.</em></h1>
          <p className="info__lead">Open the password reset link from your email, or request a new one.</p>
          <Button variant="solid" to="/forgot-password" className="btn--block">Request a new link</Button>
        </>
      ) : success ? (
        <>
          <p className="label">Success</p>
          <h1 className="display info__title">Password <em>updated.</em></h1>
          <p className="info__lead">Your password has been changed successfully. You may now sign in with your new credentials.</p>
          <Button variant="solid" to="/signin" className="btn--block">Sign In to Your Account</Button>
        </>
      ) : (
        <>
          <p className="label">New Credentials</p>
          <h1 className="display info__title">Create new <em>password.</em></h1>
          <p className="info__lead">Choose a secure password of at least {RESET_PASSWORD_MIN} characters.</p>
          {error && (
            <p className="form__err pf-auth__alert" role="alert">
              {error}{linkRejected && <> <Link to="/forgot-password">Request a new link</Link></>}
            </p>
          )}
          <form className="form pf-auth__form" onSubmit={handleSubmit} noValidate>
            <div className="pf-auth__group">
              <label className="pf-auth__label" htmlFor="customer-reset-password">New Password</label>
              <span className="pf-auth__field">
                <input id="customer-reset-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={`Minimum ${RESET_PASSWORD_MIN} characters`} />
                <button type="button" className="pf-auth__toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </span>
            </div>
            <div className="pf-auth__group">
              <label className="pf-auth__label" htmlFor="customer-reset-confirm">Confirm New Password</label>
              <span className="pf-auth__field">
                <input id="customer-reset-confirm" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat new password" />
                <button type="button" className="pf-auth__toggle" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? 'Hide confirmation' : 'Show confirmation'} aria-pressed={showConfirmPassword}>
                  {showConfirmPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </span>
            </div>
            <Button type="submit" variant="solid" className="btn--block" disabled={isSubmitting}>
              {isSubmitting ? 'Updating Password...' : 'Update Password'}
            </Button>
          </form>
        </>
      )}
      <p className="pf-auth__back"><Link className="pf-auth__link" to="/signin">Return to Sign In</Link></p>
    </div>
  );
}
