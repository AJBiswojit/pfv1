/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · /signup
 *
 * The create-account URL. It opens the same authentication experience directly
 * in its registration mode, so a direct `/signup?returnTo=…` link (a guest-order
 * prompt, a campaign link) still lands on registration — while "Already have an
 * account? Sign in" stays inside the panel and never moves the URL.
 *
 * Registration itself is the panel's: the production fields and identifiers,
 * the application's validators, `AuthContext.signUp` → the existing
 * `POST /auth/customer/sign-up`, the guest-order claim, and the shared Google
 * button. No account is created client-side.
 */

import { useEffect } from 'react';
import AuthExperience from '../auth/AuthExperience.jsx';

export default function SignUp() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Create Account — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  return <AuthExperience initialMode="register" />;
}
