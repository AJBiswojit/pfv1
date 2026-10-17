/**
 * PRATIKSHYA FASHION — PHASE 10 · the create-account screen, as a page of the
 * design.
 *
 * The behavioural source of truth is the production page (`pages/auth/SignUp.jsx`)
 * and this file changes none of it:
 *
 *   · the same fields, with the production ids, names, `autoComplete` hints and
 *     placeholders, so autofill and password managers behave identically;
 *   · the same validators — `isValidEmail`, `isValidPhone`, `validatePassword`
 *     and `validatePasswordMatch` — imported from `utils/validation.js`, never
 *     re-implemented, with every message byte-for-byte the production string;
 *   · the same submit path: `AuthContext.signUp` → the real
 *     `POST /auth/customer/sign-up`; on success the guest orders this browser
 *     placed are claimed by the new account (`OrderContext.claimGuestOrders`),
 *     the success note appears, and 500 ms later the customer lands on
 *     `returnTo` (sanitised by `sanitizeReturnUrl`, exactly as production does);
 *   · the same Google button (the shared `GoogleSignInButton`, which claims the
 *     guest orders through the same call on success);
 *   · the same already-signed-in redirect and the same tab title.
 *
 * The design has no sign-up screen — its `/account` prototype stores a name in
 * `localStorage` and says "no server account is created" on the page — so the
 * page is drawn out of the design's blocks (`.container`, `.info`, `.crumbs`,
 * `.label`, `.display`, `.form`, `.form__err`, `.form__note`, the `.btn`
 * register) and only the blocks the design never drew live in
 * `customer.auth.css`. No account is ever created client-side: if the backend
 * refuses, the customer sees the backend's own message and no banner.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Link } from '../router/index.jsx';
import Button from '../components/ui/Button.jsx';
import GoogleSignInButton from '../../../components/auth/GoogleSignInButton.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useOrder } from '../../../context/OrderContext.jsx';
import {
  isValidEmail,
  isValidPhone,
  sanitizeReturnUrl,
  validatePassword,
  validatePasswordMatch,
} from '../../../utils/validation.js';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  dateOfBirth: '',
};

export default function SignUp() {
  const { signUp, isAuthenticated } = useAuth();
  /* Anything ordered as a guest in this browser belongs to the account that is
     created — the production sign-up makes the same call. */
  const { claimGuestOrders } = useOrder();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawReturnTo = searchParams.get('returnTo') || '/account';
  const returnTo = sanitizeReturnUrl(rawReturnTo);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Create Account — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isSubmitting && !success) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, navigate, returnTo, isSubmitting, success]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));

    /* A field's error clears the moment the customer edits it — production's
       own rule, kept so the form never argues with what is being typed. */
    if (errors[name]) {
      setErrors((previous) => ({ ...previous, [name]: '' }));
    }
    if (generalError) {
      setGeneralError('');
    }
  };

  const validateForm = () => {
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

    const passwordCheck = validatePassword(formData.password);
    if (!passwordCheck.ok) {
      nextErrors.password = passwordCheck.message;
    }

    const matchCheck = validatePasswordMatch(formData.password, formData.confirmPassword);
    if (!matchCheck.ok) {
      nextErrors.confirmPassword = matchCheck.message;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setGeneralError('');

    if (!validateForm()) return;

    setIsSubmitting(true);
    const result = await signUp({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
      dateOfBirth: formData.dateOfBirth,
    });

    if (result.ok) {
      claimGuestOrders(result.user?.id);
      setSuccess(true);
      setTimeout(() => {
        navigate(returnTo, { replace: true });
      }, 500);
    } else {
      setGeneralError(result.error || 'Unable to create account. Please try again.');
      setIsSubmitting(false);
    }
  };

  /* A password field and its toggle — the production screen has two of these,
     and so does this one, drawn once. */
  const passwordField = ({ id, name, label, visible, onToggle, value, placeholder, error, autoComplete }) => (
    <div className="pf-auth__group">
      <label className="pf-auth__label" htmlFor={id}>{label}</label>
      <span className="pf-auth__field">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="pf-auth__toggle"
          onClick={onToggle}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible
            ? <EyeOff size={16} strokeWidth={1.5} aria-hidden="true" />
            : <Eye size={16} strokeWidth={1.5} aria-hidden="true" />}
        </button>
      </span>
      {error && <span className="form__err pf-auth__err">{error}</span>}
    </div>
  );

  return (
    <div className="info container pf-auth pf-auth--wide">
      <p className="label">Join The Atelier</p>
      <h1 className="display info__title">Create your <em>account.</em></h1>
      <p className="info__lead">
        Enjoy a tailored experience with saved measurements, custom edits, and curated ceremonial previews.
      </p>

      {generalError && <p className="form__err pf-auth__alert" role="alert">{generalError}</p>}
      {success && (
        <p className="form__note pf-auth__status" role="status">
          Account created successfully. Welcome to PRATIKSHYA FASHION.
        </p>
      )}

      <form className="form pf-auth__form pf-auth__form--wide" onSubmit={handleSubmit} noValidate>
        <div className="pf-auth__pair">
          {/* The label's text and its required mark are ONE flex item: the
              design's `.form label` is a column, and a bare `<span>` sibling
              would take a line of its own — the mark must ride with the words,
              exactly as it did on the production form. */}
          <label htmlFor="signup-firstName">
            <span className="pf-auth__text">First Name <span className="pf-auth__mark">*</span></span>
            <input
              id="signup-firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              required
              value={formData.firstName}
              onChange={handleChange}
              placeholder="e.g. Ananya"
            />
            {errors.firstName && <span className="form__err pf-auth__err">{errors.firstName}</span>}
          </label>

          <label htmlFor="signup-lastName">
            Last Name
            <input
              id="signup-lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="e.g. Sharma"
            />
          </label>
        </div>

        <label htmlFor="signup-email">
          <span className="pf-auth__text">Email Address <span className="pf-auth__mark">*</span></span>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={formData.email}
            onChange={handleChange}
            placeholder="e.g. ananya.sharma@example.com"
          />
          {errors.email && <span className="form__err pf-auth__err">{errors.email}</span>}
        </label>

        <label htmlFor="signup-phone">
          Mobile Phone
          <input
            id="signup-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={formData.phone}
            onChange={handleChange}
            placeholder="e.g. +91 98765 43210"
          />
          {errors.phone && <span className="form__err pf-auth__err">{errors.phone}</span>}
        </label>

        <div className="pf-auth__pair">
          {passwordField({
            id: 'signup-password',
            name: 'password',
            label: 'Password *',
            visible: showPassword,
            onToggle: () => setShowPassword((current) => !current),
            value: formData.password,
            placeholder: 'Minimum 6 characters',
            error: errors.password,
            autoComplete: 'new-password',
          })}
          {passwordField({
            id: 'signup-confirmPassword',
            name: 'confirmPassword',
            label: 'Confirm Password *',
            visible: showConfirmPassword,
            onToggle: () => setShowConfirmPassword((current) => !current),
            value: formData.confirmPassword,
            placeholder: 'Repeat password',
            error: errors.confirmPassword,
            autoComplete: 'new-password',
          })}
        </div>

        <label htmlFor="signup-dateOfBirth">
          {/* The one hint that IS its own line, and is styled as such. */}
          <span className="pf-auth__text">Date of Birth</span>
          <span className="pf-auth__optional">(optional — for birthday celebrations)</span>
          <input
            id="signup-dateOfBirth"
            name="dateOfBirth"
            type="date"
            value={formData.dateOfBirth}
            onChange={handleChange}
          />
        </label>

        <p className="pf-auth__terms">
          By creating an account, you agree to PRATIKSHYA FASHION&apos;s{' '}
          <Link to="/terms">Terms of Service</Link>{' '}
          and{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <Button type="submit" variant="solid" className="btn--block" disabled={isSubmitting || success}>
          {isSubmitting
            ? 'Creating Account...'
            : success
              ? 'Welcome to PRATIKSHYA FASHION'
              : 'Create Account'}
        </Button>

        <p className="pf-auth__divider"><span>Or continue with</span></p>

        <GoogleSignInButton
          label="Sign up with Google"
          onSuccess={(user) => {
            claimGuestOrders(user?.id);
            setSuccess(true);
            setTimeout(() => {
              navigate(returnTo, { replace: true });
            }, 500);
          }}
          onError={(message) => setGeneralError(message)}
        />
      </form>

      <div className="pf-auth__alt">
        <p>
          Already have an account?{' '}
          <Link to={`/signin${rawReturnTo ? `?returnTo=${encodeURIComponent(rawReturnTo)}` : ''}`}>
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
