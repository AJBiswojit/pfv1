/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · /forgot-password
 *
 * The password-recovery URL. It opens the same authentication experience in its
 * recovery mode. Submitting asks the existing
 * `POST /auth/customer/forgot-password` (through `AuthContext.forgotPassword`)
 * and shows the confirmation only when the backend accepted the request.
 *
 * The backend still stores a reset token without dispatching a reset email, so
 * the confirmation says exactly that: the request was received, no email has
 * been sent, and the customer is offered the way back to sign-in. No reset
 * screen is advertised that no link can reach.
 */

import { useEffect } from 'react';
import AuthExperience from '../auth/AuthExperience.jsx';

export default function ForgotPassword() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Forgot Password — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  return <AuthExperience initialMode="forgotPassword" />;
}
