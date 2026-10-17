/**
 * PRATIKSHYA FASHION — PHASE 12 · the security screen, as a page of the design.
 *
 * The production screen is `pages/account/AccountSecurity.jsx`. It is re-hosted
 * here without any change to what it does:
 *
 *   · the password change is `changePassword` from the account context
 *     (`POST /auth/change-password`). The backend verifies the current password,
 *     revokes every session and returns the verdict; the page shows that verdict
 *     and nothing else. There is no simulated success;
 *   · the same client checks run first (`validatePassword`, 6–128 characters, the
 *     limits `ChangePasswordRequest` enforces, and `validatePasswordMatch`);
 *   · after a successful change the customer is signed out locally and sent to
 *     `/signin`, as production does — and that timer is cancelled if the page is
 *     left first;
 *   · the session list is the account read's `security.activeSessions`, shown only
 *     as the backend returned it. "Sign out other devices" is `signOutOtherSessions`
 *     (`POST /customers/me/sessions/revoke-others`).
 *
 * Capability the backend does not offer: ending ONE session, or keeping this device
 * signed in while the others end. The backend's revoke call cannot exclude the
 * calling session (the access token carries no session id yet), so it revokes EVERY
 * session, this one included. The page says exactly that, and after it succeeds it
 * ends the local session and sends the customer to sign in again — it never claims
 * "other devices only".
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import AccountFrame from './AccountFrame.jsx';
import { useAccount } from '../../../../context/AccountContext.jsx';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { validatePassword, validatePasswordMatch } from '../../../../utils/validation.js';

const SECURITY_TITLE = 'Security — PRATIKSHYA FASHION';
const FEEDBACK_MS = 3500;
const SIGN_OUT_DELAY_MS = 1600;

/* Presentation only: the backend's own session fields, labelled in plain words.
   Nothing is inferred — an absent field is shown as "not recorded". */
const describeSession = (session) => {
  const userAgent = session.userAgent ?? session.user_agent ?? '';
  const device = /iphone|ios/i.test(userAgent) ? 'iPhone / iOS'
    : /android/i.test(userAgent) ? 'Android device'
    : /ipad/i.test(userAgent) ? 'iPad'
    : /macintosh|mac os/i.test(userAgent) ? 'Mac'
    : /windows/i.test(userAgent) ? 'Windows PC'
    : userAgent ? 'Browser session'
    : 'Session';
  const ip = session.ipAddress ?? session.ip_address ?? null;
  const created = session.createdAt ?? session.created_at ?? null;
  return {
    id: session.id,
    device,
    location: ip ?? 'Location not recorded',
    signedIn: created
      ? `Signed in ${new Date(created).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : 'Date not recorded',
    isCurrent: Boolean(session.isCurrent ?? session.is_current),
  };
};

const EMPTY_FORM = { currentPwd: '', newPwd: '', confirmPwd: '' };

export default function Security() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { profile, security, changePassword, signOutOtherSessions, isLoading, loadError, loadErrorStatus, refreshAccount } = useAccount();

  const [form, setForm] = useState(EMPTY_FORM);
  const [feedback, setFeedback] = useState(null);
  const [sessionFeedback, setSessionFeedback] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const signOutTimer = useRef(null);

  useEffect(() => {
    const previous = document.title;
    document.title = SECURITY_TITLE;
    return () => {
      document.title = previous;
      if (signOutTimer.current) clearTimeout(signOutTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!sessionFeedback) return undefined;
    const timer = setTimeout(() => setSessionFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [sessionFeedback]);

  const accountLoading = isLoading && !profile;
  const accountFailed = Boolean(loadError) && !profile;
  const sessions = (security?.activeSessions ?? []).map(describeSession);

  const setField = (name) => (event) => setForm((previous) => ({ ...previous, [name]: event.target.value }));

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (!form.currentPwd) {
      setFeedback({ ok: false, message: 'Please enter your current password.' });
      return;
    }
    const check = validatePassword(form.newPwd);
    if (!check.ok) {
      setFeedback({ ok: false, message: check.message });
      return;
    }
    const match = validatePasswordMatch(form.newPwd, form.confirmPwd);
    if (!match.ok) {
      setFeedback({ ok: false, message: match.message });
      return;
    }

    setIsUpdating(true);
    const result = await changePassword({
      currentPassword: form.currentPwd,
      newPassword: form.newPwd,
      confirmPassword: form.confirmPwd,
    });
    setIsUpdating(false);

    if (!result.ok) {
      setFeedback({ ok: false, message: result.error ?? result.message ?? 'Your password could not be changed.' });
      return;
    }

    setFeedback({ ok: true, message: 'Your password has been changed. Please sign in again.' });
    setForm(EMPTY_FORM);
    /* The backend revoked every session, this one included, so the local session
       ends too — after the customer has read the confirmation. */
    signOutTimer.current = setTimeout(() => {
      signOutTimer.current = null;
      signOut();
      navigate('/signin');
    }, SIGN_OUT_DELAY_MS);
  };

  const handleSignOutEverywhere = async () => {
    setIsUpdating(true);
    const result = await signOutOtherSessions();
    setIsUpdating(false);
    if (!result.ok) {
      setSessionFeedback({
        ok: false,
        message: result.message ?? result.error ?? 'We could not sign out your devices. Please try again.',
      });
      return;
    }
    /* The backend revoked every session, this device included. The local session
       ends after the confirmation has been read. */
    setSessionFeedback({ ok: true, message: 'You have been signed out on every device. Please sign in again.' });
    signOutTimer.current = setTimeout(() => {
      signOutTimer.current = null;
      signOut();
      navigate('/signin');
    }, SIGN_OUT_DELAY_MS);
  };

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'Security' }]}
      label="Your account"
      title="Security"
    >
      <p className="info__lead pf-account__lead">
        Keep your password current and review where your account is signed in.
      </p>

      {accountLoading ? (
        <div className="empty" aria-busy="true" aria-label="Loading your security details">
          <p className="empty__title">Gathering your security details&hellip;</p>
        </div>
      ) : accountFailed ? (
        <div className="empty" role="alert">
          <p className="empty__title">We could not load your security details right now.</p>
          {loadErrorStatus === 401 || loadErrorStatus === 403 ? (
            <p>Please sign in again to see your account.</p>
          ) : loadError ? (
            <p>{loadError}</p>
          ) : null}
          <Button variant="ghost" onClick={refreshAccount}>Try again</Button>
        </div>
      ) : !profile ? (
        <div className="empty" role="status">
          <p className="empty__title">Sign in to manage your security settings.</p>
        </div>
      ) : (
        <>
          <section className="pf-account__section" aria-label="Change password">
            <header className="shop__head">
              <p className="label">Password</p>
              <h2 className="display shop__title">Change <em>password</em></h2>
            </header>

            {feedback ? (
              <p className={feedback.ok ? 'form__note' : 'form__err pf-alert'} role="status">{feedback.message}</p>
            ) : null}

            <form className="form pf-form" onSubmit={handlePasswordSubmit} noValidate>
              <label className="pf-form__row">
                <span className="pf-lab">Current password</span>
                <input type="password" name="currentPwd" autoComplete="current-password" value={form.currentPwd} onChange={setField('currentPwd')} />
              </label>
              <label className="pf-form__row">
                <span className="pf-lab">New password</span>
                <input type="password" name="newPwd" autoComplete="new-password" value={form.newPwd} onChange={setField('newPwd')} />
                <span className="pf-hint">6 to 128 characters.</span>
              </label>
              <label className="pf-form__row">
                <span className="pf-lab">Confirm new password</span>
                <input type="password" name="confirmPwd" autoComplete="new-password" value={form.confirmPwd} onChange={setField('confirmPwd')} />
              </label>
              <div className="pf-account__actions">
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? 'Updating...' : 'Update password'}
                </Button>
              </div>
            </form>
            <p className="pf-hint">Changing your password signs out every device, including this one.</p>
          </section>

          <section className="pf-account__section" aria-label="Signed-in devices">
            <header className="shop__head">
              <p className="label">Devices</p>
              <h2 className="display shop__title">Signed-in <em>devices</em></h2>
            </header>

            {sessionFeedback ? (
              <p className={sessionFeedback.ok ? 'form__note' : 'form__err pf-alert'} role="status">{sessionFeedback.message}</p>
            ) : null}

            {sessions.length === 0 ? (
              <div className="empty">
                <p className="empty__title">No other signed-in devices are recorded for your account.</p>
              </div>
            ) : (
              <ul className="pf-account__sessions" aria-label="Your signed-in devices">
                {sessions.map((session) => (
                  <li key={session.id} className="pf-account__session">
                    <p className="pf-lab">
                      {session.device}
                      {session.isCurrent ? <span className="pf-account__badge"> · This device</span> : null}
                    </p>
                    <p className="pf-hint">{session.location} · {session.signedIn}</p>
                  </li>
                ))}
              </ul>
            )}

            {/* The backend offers one session action, and it is not "other devices only". */}
            <p className="pf-hint">
              Individual devices cannot be signed out from here yet. &ldquo;Sign out everywhere&rdquo; ends every session,
              including this device, and you will need to sign in again.
            </p>
            <div className="pf-account__actions">
              <Button variant="ghost" onClick={handleSignOutEverywhere} disabled={isUpdating}>
                Sign out everywhere
              </Button>
            </div>
          </section>
        </>
      )}
    </AccountFrame>
  );
}
