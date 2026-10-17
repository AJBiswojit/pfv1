/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH (the single authentication page)
 *
 * One campaign photograph, one editorial column, one transparent glass panel and
 * ONE page: sign-in, registration, password recovery and password reset are
 * modes inside this component, never destinations. Clicking "Create an account",
 * "Forgot password?", "Back to sign in", "Request a new link" or "Sign in" moves
 * a single piece of local state — the URL does not change, the router is not
 * called for a mode switch, the photograph stays mounted and the navbar above
 * never re-renders.
 *
 * The four routes that already existed (`/signin`, `/signup`, `/forgot-password`,
 * `/reset-password`) still exist and still render this experience; they simply
 * choose its initial mode. The reset route keeps its `userId` / `token` query
 * pair, read here and handed to the reset panel — no token is stored, logged or
 * moved into application state.
 *
 * The page is the design's, the behaviour is the application's: the panels call
 * the existing `AuthContext` and `GoogleSignInButton`; nothing here fabricates a
 * session, an account or a recovery the backend did not confirm.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { sanitizeReturnUrl } from '../../../utils/validation.js';
import AuthEditorial from './AuthEditorial.jsx';
import AuthPanelSignIn from './AuthPanelSignIn.jsx';
import AuthPanelSignUp from './AuthPanelSignUp.jsx';
import AuthPanelForgotPassword from './AuthPanelForgotPassword.jsx';
import AuthPanelResetPassword from './AuthPanelResetPassword.jsx';

const EASE = [0.22, 1, 0.36, 1];

/** Understated botanical line work in the panel's corners, as in the reference. */
function PanelOrnaments() {
  return (
    <>
      <svg className="pf-auth-ornament pf-auth-ornament--top" viewBox="0 0 140 180" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          <path d="M132 4C112 38 96 66 90 102c-4 26 0 48 10 70" />
          <path d="M122 26c-18 2-30 12-34 27 17 1 30-11 34-27Z" />
          <path d="M110 58c-17 0-29 8-35 22 16 4 30-6 35-22Z" />
          <path d="M100 92c-16-2-29 4-36 16 15 7 30-1 36-16Z" />
          <path d="M96 126c-14-4-27 0-35 10 12 9 28 4 35-10Z" />
          <path d="M104 40c11-8 15-20 13-32-12 4-18 16-13 32Z" />
          <path d="M94 74c12-6 18-17 18-29-13 2-21 13-18 29Z" />
        </g>
      </svg>
      <svg className="pf-auth-ornament pf-auth-ornament--bottom" viewBox="0 0 140 180" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
          <path d="M132 4C112 38 96 66 90 102c-4 26 0 48 10 70" />
          <path d="M122 26c-18 2-30 12-34 27 17 1 30-11 34-27Z" />
          <path d="M110 58c-17 0-29 8-35 22 16 4 30-6 35-22Z" />
          <path d="M100 92c-16-2-29 4-36 16 15 7 30-1 36-16Z" />
          <path d="M96 126c-14-4-27 0-35 10 12 9 28 4 35-10Z" />
          <path d="M104 40c11-8 15-20 13-32-12 4-18 16-13 32Z" />
        </g>
      </svg>
    </>
  );
}

export default function AuthExperience({ initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [searchParams] = useSearchParams();
  const reduce = useReducedMotion();

  const rawReturnTo = searchParams.get('returnTo') || '/account';
  const returnTo = sanitizeReturnUrl(rawReturnTo);
  const resetUserId = (searchParams.get('userId') || '').trim();
  const resetToken = (searchParams.get('token') || '').trim();

  const titleRef = useRef(null);
  const panelBodyRef = useRef(null);

  /* A mode change is announced by moving focus to the new panel heading (the
     stable body region is the fallback). The wait clears the outgoing panel's
     exit transition, so focus never lands on content that is about to unmount.
     The first paint is left alone: a customer arriving must not have the focus
     taken from the page they just opened. */
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return undefined;
    }
    const target = () => (titleRef.current ?? panelBodyRef.current)?.focus({ preventScroll: true });
    const timer = setTimeout(target, reduce ? 0 : 260);
    return () => clearTimeout(timer);
  }, [mode, reduce]);

  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
  };

  let panel = null;
  if (mode === 'register') {
    panel = <AuthPanelSignUp onSwitchMode={switchMode} returnTo={returnTo} titleRef={titleRef} />;
  } else if (mode === 'forgotPassword') {
    panel = <AuthPanelForgotPassword onSwitchMode={switchMode} titleRef={titleRef} />;
  } else if (mode === 'resetPassword') {
    panel = (
      <AuthPanelResetPassword
        onSwitchMode={switchMode}
        userId={resetUserId}
        token={resetToken}
        titleRef={titleRef}
      />
    );
  } else {
    panel = <AuthPanelSignIn onSwitchMode={switchMode} returnTo={returnTo} titleRef={titleRef} />;
  }

  return (
    <section className="pf-auth-experience" aria-label="PRATIKSHYA FASHION account access">
      <picture className="pf-auth-experience__media">
        <source media="(max-width: 767px)" srcSet="/design/pratikshya-auth-campaign-mobile.webp" />
        <img
          src="/design/pratikshya-auth-campaign.webp"
          alt=""
          width="1672"
          height="941"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      <span className="pf-auth-experience__scrim" aria-hidden="true" />

      <div className="pf-auth-experience__inner">
        <AuthEditorial />

        <motion.section
          className="pf-auth-panel"
          aria-labelledby="pf-auth-title"
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 0.4, ease: EASE }}
        >
          <PanelOrnaments />
          <div className="pf-auth-panel__body" ref={panelBodyRef} tabIndex={-1}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: reduce ? 0 : 0.22, ease: 'easeOut' }}
              >
                {panel}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.section>
      </div>
    </section>
  );
}
