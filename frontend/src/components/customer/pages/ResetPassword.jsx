/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · /reset-password
 *
 * The reset URL the backend's reset link points at. It opens the same
 * authentication experience in its reset mode; the experience reads the
 * `userId` / `token` pair from this URL and hands it to the panel, which calls
 * the existing `AuthContext.resetPassword` → `POST /auth/customer/reset-password`.
 *
 * An incomplete link offers no form, a rejected token is reported truthfully,
 * and success is shown only after the backend accepted the new password — after
 * which "Sign In to Your Account" returns to sign-in inside the same panel. The
 * token stays in the URL (its existing contract) and is never stored or logged.
 */

import { useEffect } from 'react';
import AuthExperience from '../auth/AuthExperience.jsx';

export default function ResetPassword() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Reset Password — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  return <AuthExperience initialMode="resetPassword" />;
}
