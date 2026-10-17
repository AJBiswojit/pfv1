/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.3 — the profile screen, as a page of
 * the design.
 *
 * The production screen is `pages/account/AccountProfile.jsx`: one form over the
 * account context's own profile — first name (required), last name, email address
 * (required, format-checked), mobile number (optional, 10-digit), date of birth,
 * the read-only member-since, and the portrait block whose upload the backend
 * cannot yet accept. This page keeps every one of those decisions exactly where
 * they are and changes only the room they stand in:
 *
 *   · it is drawn out of the design's own register — the shared frame's intro band
 *     and eleven-destination navigation, `.info__lead`, `.label`, `.display`, the
 *     `.form` register with the port's own `pf-form` field set (`.pf-lab`,
 *     `.pf-req`, `.pf-hint`), the design's `.form__err` / `.form__note` feedback
 *     blocks and its `.empty` block for a read that has not landed;
 *   · every decision stays with the application: `useAccount()` supplies the
 *     profile and `updateProfile` (which PATCHes `/customers/me` and takes the
 *     canonical profile from the server's own answer — no optimistic write), and
 *     the production screen's words are kept byte-for-byte — "First name is
 *     required.", "Email address is required.", "Please enter a valid email
 *     format.", "Please enter a valid 10-digit mobile number.", "Your profile has
 *     been saved.", "Your profile could not be saved. Please try again.";
 *   · nothing is claimed before the server answers: a failed save shows the
 *     failure the context reported (never a success), the save button is disabled
 *     while the request is in flight, and the form is not drawn at all while the
 *     account read still owes an answer — the same two conditions the overview
 *     applies (`isLoading && !profile`, `loadError && !profile`), because a read
 *     that has not returned is not an empty profile.
 *
 * Three deliberate, reported differences from the production screen, each one
 * answered inside this port's own doctrine:
 *   · the monogram falls back to the honest dash, not production's `"P"`: the
 *     port's frame rule is "real data or nothing — never a stand-in name";
 *   · the portrait's upload control stays `disabled`, exactly as production leaves
 *     it, and its note is production's own sentence — the page cannot and does not
 *     pretend a media pipeline exists;
 *   · the field errors carry `role="alert"`, which is this port's form convention
 *     (`pages/SignIn.jsx`, `pages/Checkout.jsx`); production's own field errors
 *     carry no role at all. The messages themselves are unchanged.
 */

import { useEffect, useRef, useState } from 'react';
import Button from '../../components/ui/Button.jsx';
import AccountFrame from './AccountFrame.jsx';
import { useAccount } from '../../../../context/AccountContext.jsx';
import { isValidEmail, isValidPhone } from '../../../../utils/validation.js';

/* The tab title is the production screen's own, restored on unmount. */
const PROFILE_TITLE = 'Profile — PRATIKSHYA FASHION';
/* Production clears its feedback after four seconds; so does this page. */
const FEEDBACK_MS = 4000;

/* The six fields the production form holds. `avatar` is a reference the profile
   column already carries — never an upload this page performs. */
const fieldsFrom = (profile) => ({
  firstName: profile?.firstName || '',
  lastName: profile?.lastName || '',
  email: profile?.email || '',
  phone: profile?.phone || '',
  dateOfBirth: profile?.dateOfBirth || '',
  avatar: profile?.avatar || null,
});

export default function Profile({ embedded = false }) {
  const { profile, updateProfile, isLoading, loadError, loadErrorStatus } = useAccount();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState(() => fieldsFrom(null));
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = PROFILE_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  /* The form follows the account the server returned — including the profile a
     successful save put there — and keeps whatever the customer is typing until
     then: the effect only runs when the profile object itself changes. */
  useEffect(() => {
    if (!profile) return;
    setFormData(fieldsFrom(profile));
  }, [profile]);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [feedback]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  /* Portrait uploads are not available: the backend profile column takes at most
     a 1,000-character reference and no media-upload pipeline exists. Production
     says so on attempt rather than pretending a file was stored; so does this. */
  const handleAvatarChange = () => {
    setFeedback({
      ok: false,
      message: 'Portrait uploads are not available yet. Your saved details will not change.',
    });
  };

  /* Clearing an existing portrait IS supported — the empty value is sent with the
     next save, which is why production sets no feedback here either. */
  const handleRemoveAvatar = () => {
    setFormData((prev) => ({ ...prev, avatar: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (!formData.firstName.trim()) {
      nextErrors.firstName = 'First name is required.';
    }

    if (!formData.email.trim()) {
      nextErrors.email = 'Email address is required.';
    } else if (!isValidEmail(formData.email)) {
      nextErrors.email = 'Please enter a valid email format.';
    }

    if (formData.phone.trim() && !isValidPhone(formData.phone)) {
      nextErrors.phone = 'Please enter a valid 10-digit mobile number.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    /* The backend is the authority — its response decides the outcome and the
       canonical profile (409 duplicates, 422 validation, and so on, surface). */
    const result = await updateProfile({
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      dateOfBirth: formData.dateOfBirth,
      ...(formData.avatar === null && profile?.avatar ? { avatar: '' } : {}),
    });

    setIsSaving(false);
    if (!result.ok) {
      setFeedback({
        ok: false,
        message:
          result.error ??
          result.message ??
          'Your profile could not be saved. Please try again.',
      });
      return;
    }
    setFeedback({ ok: true, message: 'Your profile has been saved.' });
  };

  /* Production's reset: the profile the account holds, and no errors. */
  const handleReset = () => {
    if (profile) setFormData(fieldsFrom(profile));
    setErrors({});
  };

  const initials = [formData.firstName[0], formData.lastName[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase();

  /* A read that already holds an account keeps showing it; a read that has not
     returned yet is not an empty profile; a read that failed is named as failed
     (`AccountContext` records the failure the same way: "never a fabricated empty
     account"). */
  const accountLoading = isLoading && !profile;
  const accountFailed = Boolean(loadError) && !profile;

  const content = (
    <>
      <p className="info__lead pf-account__lead">
        Update your personal details, contact information, and portrait.
      </p>

      <section className="pf-account__section" aria-label="Personal details">
        <header className="shop__head">
          <p className="label">Personal details</p>
          <h2 className="display shop__title">Your personal <em>profile</em></h2>
        </header>

        {accountLoading ? (
          <div className="empty" aria-busy="true" aria-label="Loading your profile">
            <p className="empty__title">Gathering your profile&hellip;</p>
          </div>
        ) : accountFailed ? (
          <ProfileUnavailable status={loadErrorStatus} message={loadError} />
        ) : (
          <>
            {feedback ? (
              <p
                className={feedback.ok ? 'form__note' : 'form__err pf-alert'}
                role="status"
              >
                {feedback.message}
              </p>
            ) : null}

            <form className="form pf-form" onSubmit={handleSubmit} noValidate>
              <div className="pf-account__portrait-row">
                <div className="pf-account__portrait">
                  {formData.avatar ? (
                    <img src={formData.avatar} alt="Profile" />
                  ) : (
                    <span aria-hidden="true">{initials || '—'}</span>
                  )}
                </div>

                <div className="pf-account__portrait-meta">
                  <p className="label">Profile portrait</p>
                  {/* Production's own sentence, unchanged: there is no upload
                      pipeline, so the field stays honestly unavailable. */}
                  <p className="pf-account__note">
                    Portrait uploads are not available yet — the atelier&rsquo;s media
                    pipeline is being prepared. Any portrait already on file keeps
                    showing on your account.
                  </p>
                  <input
                    ref={fileInputRef}
                    id="profile-avatar"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="sr-only"
                    aria-label="Portrait upload (not available yet)"
                    disabled
                  />
                  {formData.avatar ? (
                    <button type="button" className="pf-account__act" onClick={handleRemoveAvatar}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="pf-form__row">
                <label>
                  <span className="pf-lab">First name <span className="pf-req">*</span></span>
                  <input
                    id="profile-firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    aria-invalid={Boolean(errors.firstName)}
                  />
                  {errors.firstName ? (
                    <span className="form__err" role="alert">{errors.firstName}</span>
                  ) : null}
                </label>

                <label>
                  <span className="pf-lab">Last name</span>
                  <input
                    id="profile-lastName"
                    name="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={handleChange}
                  />
                </label>
              </div>

              <div className="pf-form__row">
                <label>
                  <span className="pf-lab">Email address <span className="pf-req">*</span></span>
                  <input
                    id="profile-email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    aria-invalid={Boolean(errors.email)}
                  />
                  {errors.email ? (
                    <span className="form__err" role="alert">{errors.email}</span>
                  ) : null}
                </label>

                <label>
                  <span className="pf-lab">Mobile number</span>
                  <input
                    id="profile-phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+91 98765 43210"
                    aria-invalid={Boolean(errors.phone)}
                  />
                  {errors.phone ? (
                    <span className="form__err" role="alert">{errors.phone}</span>
                  ) : (
                    <span className="pf-hint">10-digit Indian mobile, with or without +91.</span>
                  )}
                </label>
              </div>

              <div className="pf-form__row">
                <label>
                  <span className="pf-lab">Date of birth</span>
                  <input
                    id="profile-dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={handleChange}
                  />
                </label>

                <label>
                  <span className="pf-lab">Member since</span>
                  {/* Read-only, and named by no form field: the server owns it. */}
                  <input
                    id="profile-memberSince"
                    type="text"
                    value={profile?.memberSince || ''}
                    placeholder="—"
                    className="pf-account__readonly"
                    disabled
                  />
                </label>
              </div>

              <div className="pf-account__actions">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving Changes...' : 'Save Profile'}
                </Button>
                <Button variant="ghost" onClick={handleReset}>Reset</Button>
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
      breadcrumbItems={[{ label: 'Account', to: '/account' }, { label: 'Profile' }]}
      label="Your account"
      title="Profile"
    >
      {content}
    </AccountFrame>
  );
}

/* A failed account read is named as one, on the same rule the overview uses: a
   lapsed session (401/403) is offered the way back, anything else states the
   read's own message. There is no retry button because the account context
   exposes no reload — and this page invents no handler of its own. */

function ProfileUnavailable({ status, message }) {
  const lapsed = status === 401 || status === 403;
  return (
    <div className="empty" role="alert">
      <p className="empty__title">
        {lapsed ? 'Please sign in again to see your account.' : 'We could not load your account right now.'}
      </p>
      {!lapsed && message ? <p>{message}</p> : null}
      {lapsed ? <Button to="/signin?returnTo=%2Faccount%2Fprofile">Sign in</Button> : null}
    </div>
  );
}
