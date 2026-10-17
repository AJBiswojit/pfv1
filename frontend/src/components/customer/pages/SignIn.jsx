/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · /signin
 *
 * The canonical customer sign-in URL. It renders the single authentication
 * experience (`components/customer/auth/AuthExperience.jsx`) in its sign-in
 * mode; registration, password recovery and password reset are modes inside that
 * same experience, so switching between them never changes this URL, never
 * remounts the campaign photograph and never reloads the page.
 *
 * The route itself is unchanged, `/signin?returnTo=…` keeps its meaning, and the
 * page still hands every decision to the application's `AuthContext` through the
 * sign-in panel. Nothing about the previous authentication behaviour is
 * re-implemented here.
 */

import { useEffect } from 'react';
import AuthExperience from '../auth/AuthExperience.jsx';

export default function SignIn() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Sign In — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  return <AuthExperience initialMode="login" />;
}
