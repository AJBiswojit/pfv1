/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · password reset
 *
 * The reset state of the single authentication page. It reads the `userId` /
 * `token` pair the backend's reset link carries (from the existing
 * `/reset-password?userId=…&token=…` URL) and calls the application's existing
 * `AuthContext.resetPassword` → `POST /auth/customer/reset-password`.
 *
 * The screen never invents a state: an incomplete link offers no password form;
 * a rejected or expired token is reported as such and keeps the form usable; the
 * success confirmation appears only after the backend accepted the new password,
 * and from there the customer returns to sign-in inside the same panel.
 */

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import { validateResetPassword, RESET_PASSWORD_MIN } from '../../../utils/validation.js';
import {
  PanelAlert,
  PanelHeading,
  PanelLink,
  PasswordField,
} from './AuthPanelParts.jsx';

const LINK_REJECTED_STATUSES = [401, 404];

export default function AuthPanelResetPassword({ onSwitchMode, userId, token, titleRef }) {
  const { resetPassword } = useAuth();
  const linkComplete = Boolean(userId && token);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [linkRejected, setLinkRejected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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

  if (!linkComplete && !success) {
    return (
      <>
        <PanelHeading
          eyebrow="Reset Link"
          title={<>This link is <em>incomplete.</em></>}
          lead="Open the password reset link from your email, or request a new one."
          titleRef={titleRef}
        />
        <button type="button" className="pf-auth-submit" onClick={() => onSwitchMode('forgotPassword')}>
          <span>Request a new link</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button type="button" className="pf-auth-back" onClick={() => onSwitchMode('login')}>
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          Return to Sign In
        </button>
      </>
    );
  }

  if (success) {
    return (
      <div className="pf-auth-sent">
        <PanelHeading
          eyebrow="Success"
          title={<>Password <em>updated.</em></>}
          lead="Your password has been changed successfully. You may now sign in with your new credentials."
          titleRef={titleRef}
        />
        <button type="button" className="pf-auth-submit" onClick={() => onSwitchMode('login')}>
          <span>Sign In to Your Account</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button type="button" className="pf-auth-back" onClick={() => onSwitchMode('login')}>
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          Return to Sign In
        </button>
      </div>
    );
  }

  return (
    <>
      <PanelHeading
        eyebrow="New Credentials"
        title={<>Create new <em>password.</em></>}
        lead={`Choose a secure password of at least ${RESET_PASSWORD_MIN} characters.`}
        titleRef={titleRef}
      />

      {error && (
        <PanelAlert>
          {error}{linkRejected && <> <PanelLink onClick={() => onSwitchMode('forgotPassword')}>Request a new link</PanelLink></>}
        </PanelAlert>
      )}

      <form className="pf-auth-form" onSubmit={handleSubmit} noValidate>
        <PasswordField
          id="customer-reset-password"
          label="New Password"
          icon={<Lock size={16} strokeWidth={1.4} />}
          autoComplete="new-password"
          required
          visible={showPassword}
          onToggle={() => setShowPassword((value) => !value)}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`Minimum ${RESET_PASSWORD_MIN} characters`}
        />
        <PasswordField
          id="customer-reset-confirm"
          label="Confirm New Password"
          icon={<Lock size={16} strokeWidth={1.4} />}
          autoComplete="new-password"
          required
          visible={showConfirmPassword}
          onToggle={() => setShowConfirmPassword((value) => !value)}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repeat new password"
          hideLabel="Hide confirmation"
          showLabel="Show confirmation"
        />

        <button type="submit" className="pf-auth-submit" disabled={isSubmitting}>
          <span>{isSubmitting ? 'Updating Password...' : 'Update Password'}</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </form>

      <div className="pf-auth-alt">
        <p>
          Remembered your password?{' '}
          <PanelLink onClick={() => onSwitchMode('login')}>Return to sign in</PanelLink>
        </p>
      </div>
    </>
  );
}
