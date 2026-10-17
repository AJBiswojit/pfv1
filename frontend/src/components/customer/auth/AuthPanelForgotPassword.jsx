/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · password recovery request
 *
 * The recovery state of the single authentication page. The production screen
 * asked `POST /auth/customer/forgot-password` through `AuthContext.forgotPassword`
 * and showed its confirmation ONLY when the backend accepted the request; this
 * panel keeps that path, that condition and those words.
 *
 *   · the identifier is validated with `isValidIdentifier` (the application's
 *     own email-or-10-digit-phone rule, imported, never re-implemented);
 *   · an accepted request shows the confirmation naming the identifier that was
 *     submitted; a refused one shows the backend's own message and no
 *     confirmation — the panel never claims an email was sent when the request
 *     failed, and never invents a state the API did not reach;
 *   · the backend does not dispatch reset emails yet, so the confirmation says
 *     exactly that and offers only the way back to sign-in. It does not offer a
 *     reset screen it cannot link to.
 *
 * "Back to sign in" is an in-panel control: the URL and the campaign stay put.
 */

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Mail } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import { isValidIdentifier } from '../../../utils/validation.js';
import {
  PanelAlert,
  PanelHeading,
  PanelLink,
  TextField,
} from './AuthPanelParts.jsx';

export default function AuthPanelForgotPassword({ onSwitchMode, titleRef }) {
  const { forgotPassword } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  if (submitted) {
    return (
      <div className="pf-auth-sent">
        <PanelHeading
          eyebrow="Request Received"
          title={<>Thank <em>you.</em></>}
          titleRef={titleRef}
        />
        <p className="pf-auth-sent__copy">
          We received your request for <strong>{identifier}</strong>. Password reset
          emails are not yet connected to this storefront, so no reset email has been sent.
          Please contact the PRATIKSHYA FASHION team for help regaining access to your account.
        </p>
        <button type="button" className="pf-auth-submit pf-auth-submit--ghost" onClick={() => onSwitchMode('login')}>
          <span>Return to Sign In</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button type="button" className="pf-auth-back" onClick={() => onSwitchMode('login')}>
          <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          Back to Sign In
        </button>
      </div>
    );
  }

  return (
    <>
      <PanelHeading
        eyebrow="Account Recovery"
        title={<>Recover your <em>account.</em></>}
        lead="Enter the email address or mobile number associated with your account to continue."
        titleRef={titleRef}
      />

      {error && <PanelAlert>{error}</PanelAlert>}

      <form className="pf-auth-form" onSubmit={handleSubmit} noValidate>
        <TextField
          id="forgot-identifier"
          label="Registered email or phone number"
          icon={<Mail size={16} strokeWidth={1.4} />}
          type="text"
          autoComplete="username"
          required
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="e.g. ananya.sharma@example.com"
        />

        <button type="submit" className="pf-auth-submit" disabled={isSubmitting}>
          <span>{isSubmitting ? 'Submitting...' : 'Send recovery instructions'}</span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </form>

      <div className="pf-auth-alt">
        <p>
          Remembered it?{' '}
          <PanelLink onClick={() => onSwitchMode('login')}>Back to sign in</PanelLink>
        </p>
      </div>
    </>
  );
}
