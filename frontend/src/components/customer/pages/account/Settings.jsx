/**
 * PRATIKSHYA FASHION — PHASE 12 · the communication settings screen, as a page of
 * the design.
 *
 * The production screen is `pages/account/AccountSettings.jsx`: one form of five
 * communication preferences, saved to the server with `updatePreferences`. This
 * page keeps every one of those decisions where they are and changes only the room:
 *
 *   · the preferences, the save and their persistence are the account context's
 *     own — `useAccount().preferences` is the server's record, and
 *     `updatePreferences` PATCHes it (`apiUpdatePreferences`), taking the canonical
 *     answer back. Nothing is stored in the browser and nothing is optimistic;
 *   · the words are production's own, unchanged, including the success line
 *     "Your communication preferences have been saved." and the failure fallback;
 *   · nothing is shown as saved before the server answers. A failed save shows the
 *     failure the context reported, and the form keeps what the customer chose;
 *   · the form is not drawn while the account read still owes an answer, because the
 *     context's default preferences are a placeholder, not the customer's choice.
 *     A failed read is named as failed, with a retry that re-reads the account
 *     through `refreshAccount()` — the read the rest of the account uses.
 *
 * Production's fifth field (`emailNotifications`) is not shown in production either;
 * it is carried through unchanged so a save never drops a value the server holds.
 */

import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import AccountFrame from './AccountFrame.jsx';
import { useAccount } from '../../../../context/AccountContext.jsx';

const SETTINGS_TITLE = 'Settings — PRATIKSHYA FASHION';
/* Production clears its feedback after 3.5 seconds; so does this page. */
const FEEDBACK_MS = 3500;

/* The two groups and four visible switches, in production's own order and words. */
const GROUPS = [
  {
    key: 'order',
    title: 'Order & dispatch updates',
    body: 'Essential order confirmations, shipping dispatch notifications, and electronic invoices.',
    items: [
      {
        key: 'orderUpdates',
        label: 'Order status emails',
        hint: 'Receive tracking updates when your pieces are tailored and dispatched.',
      },
      {
        key: 'smsNotifications',
        label: 'SMS delivery notifications',
        hint: 'Receive brief SMS alerts when your package is out for delivery.',
      },
    ],
  },
  {
    key: 'discoveries',
    title: 'Atelier discoveries & stories',
    body: 'Curated festive lookbooks, heritage weaving narratives, and new arrival announcements.',
    items: [
      {
        key: 'promotionalUpdates',
        label: 'Seasonal edits & lookbooks',
        hint: 'Subtle notifications when new bridal and festive collections arrive.',
      },
      {
        key: 'stylingInvitations',
        label: 'Bespoke styling consultations',
        hint: 'Invitations to private showroom previews and virtual bridal fittings.',
      },
    ],
  },
];

/* The form holds all five server fields; only the visible four are offered. */
const fieldsFrom = (preferences) => ({
  emailNotifications: Boolean(preferences?.emailNotifications),
  smsNotifications: Boolean(preferences?.smsNotifications),
  promotionalUpdates: Boolean(preferences?.promotionalUpdates),
  orderUpdates: preferences?.orderUpdates !== false,
  stylingInvitations: Boolean(preferences?.stylingInvitations),
});

export default function Settings({ embedded = false }) {
  const { preferences, profile, updatePreferences, isLoading, loadError, loadErrorStatus, refreshAccount } = useAccount();

  const [formPrefs, setFormPrefs] = useState(() => fieldsFrom(preferences));
  const [feedback, setFeedback] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = SETTINGS_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  /* The form follows the preferences the server returned, including the ones a
     successful save put there; it keeps the customer's choices until then. */
  useEffect(() => {
    if (profile) setFormPrefs(fieldsFrom(preferences));
  }, [preferences, profile]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const accountLoading = isLoading && !profile;
  const accountFailed = Boolean(loadError) && !profile;

  const toggle = (key) => {
    setFormPrefs((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    /* Awaits the backend mutation — no optimistic update, no fake delay. */
    const result = await updatePreferences(formPrefs);
    setIsSaving(false);
    if (!result.ok) {
      setFeedback({
        ok: false,
        message: result.error ?? result.message ?? 'Your preferences could not be saved. Please try again.',
      });
      return;
    }
    setFeedback({ ok: true, message: 'Your communication preferences have been saved.' });
  };

  const content = (
    <>
      <p className="info__lead pf-account__lead">
        Control your communications, seasonal alerts, and tailored styling invitations.
      </p>

      <section className="pf-account__section" aria-label="Communication preferences">
        <header className="shop__head">
          <p className="label">Communication</p>
          <h2 className="display shop__title">
            Communication <em>preferences</em>
          </h2>
        </header>

        {accountLoading ? (
          <div className="empty" aria-busy="true" aria-label="Loading your preferences">
            <p className="empty__title">Gathering your preferences&hellip;</p>
          </div>
        ) : accountFailed ? (
          <div className="empty" role="alert">
            <p className="empty__title">We could not load your preferences right now.</p>
            {loadErrorStatus === 401 || loadErrorStatus === 403 ? (
              <p>Please sign in again to see your account.</p>
            ) : loadError ? (
              <p>{loadError}</p>
            ) : null}
            <Button variant="ghost" onClick={refreshAccount}>Try again</Button>
          </div>
        ) : !profile ? (
          <div className="empty" role="status">
            <p className="empty__title">Sign in to see your preferences.</p>
          </div>
        ) : (
          <>
            {feedback ? (
              <p className={feedback.ok ? 'form__note' : 'form__err pf-alert'} role="status">
                {feedback.message}
              </p>
            ) : null}

            <form className="form pf-form" onSubmit={handleSubmit} noValidate>
              {GROUPS.map((group) => (
                <fieldset key={group.key} className="pf-account__group">
                  <legend className="pf-lab">{group.title}</legend>
                  <p className="pf-hint">{group.body}</p>
                  {group.items.map((item) => (
                    <label key={item.key} className="pf-account__check">
                      <input
                        type="checkbox"
                        name={item.key}
                        checked={formPrefs[item.key]}
                        onChange={() => toggle(item.key)}
                      />
                      <span>
                        <span className="pf-lab">{item.label}</span>
                        <span className="pf-hint">{item.hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}

              <div className="pf-account__actions">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving Preferences...' : 'Save Preferences'}
                </Button>
                <Button variant="ghost" onClick={() => setFormPrefs(fieldsFrom(preferences))}>
                  Discard changes
                </Button>
              </div>
            </form>
          </>
        )}
      </section>
    </>
  );

  if (embedded) return content;

  return (
    <AccountFrame
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'Settings & Preferences' }]}
      label="Your account"
      title="Settings"
    >
      {content}
    </AccountFrame>
  );
}
