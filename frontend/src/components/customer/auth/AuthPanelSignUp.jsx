/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH · registration
 *
 * The create-account state of the single authentication page. It keeps the
 * production screen's entire contract and changes only the room it stands in:
 *
 *   · the same fields, ids, names, `autoComplete` hints and placeholders, so
 *     autofill and password managers behave identically;
 *   · the same validators (`isValidEmail`, `isValidPhone`, `validatePassword`,
 *     `validatePasswordMatch`) and every message byte for byte;
 *   · the same submit path — `AuthContext.signUp` → the real
 *     `POST /auth/customer/sign-up`; on success the guest orders this browser
 *     placed are claimed by the new account, the success note appears, and
 *     500 ms later the customer lands on the sanitised `returnTo`;
 *   · the same shared Google button, claiming guest orders through the same
 *     call on success.
 *
 * "Already have an account? Sign in" is an in-panel control: the page URL, the
 * campaign photograph and the editorial column never move. No account is ever
 * created client-side: if the backend refuses, the customer sees the backend's
 * own message and no success banner.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Lock, Mail, Phone, User } from 'lucide-react';
import GoogleSignInButton from '../../auth/GoogleSignInButton.jsx';
import { Link } from '../router/index.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useOrder } from '../../../context/OrderContext.jsx';
import {
  isValidEmail,
  isValidPhone,
  validatePassword,
  validatePasswordMatch,
} from '../../../utils/validation.js';
import {
  PanelAlert,
  PanelDivider,
  PanelHeading,
  PanelLink,
  PanelStatus,
  PasswordField,
  TextField,
} from './AuthPanelParts.jsx';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  dateOfBirth: '',
};

export default function AuthPanelSignUp({ onSwitchMode, returnTo, titleRef }) {
  const { signUp, isAuthenticated } = useAuth();
  /* Anything ordered as a guest in this browser belongs to the account that is
     created — the production sign-up makes the same call. */
  const { claimGuestOrders } = useOrder();
  const navigate = useNavigate();

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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

  return (
    <>
      <PanelHeading
        eyebrow="JOIN THE ATELIER"
        title={<>Begin your <em>journey.</em></>}
        lead="Create your personal PRATIKSHYA FASHION account."
        titleRef={titleRef}
      />

      {generalError && <PanelAlert>{generalError}</PanelAlert>}
      {success && (
        <PanelStatus>Account created successfully. Welcome to PRATIKSHYA FASHION.</PanelStatus>
      )}

      <form className="pf-auth-form" onSubmit={handleSubmit} noValidate>
        <div className="pf-auth-form__pair">
          <TextField
            id="signup-firstName"
            name="firstName"
            label={<>First Name <span className="pf-auth-field__req" aria-hidden="true">*</span></>}
            icon={<User size={16} strokeWidth={1.4} />}
            type="text"
            autoComplete="given-name"
            required
            value={formData.firstName}
            onChange={handleChange}
            placeholder="e.g. Ananya"
            error={errors.firstName}
          />
          <TextField
            id="signup-lastName"
            name="lastName"
            label="Last Name"
            icon={<User size={16} strokeWidth={1.4} />}
            type="text"
            autoComplete="family-name"
            value={formData.lastName}
            onChange={handleChange}
            placeholder="e.g. Sharma"
          />
        </div>

        <TextField
          id="signup-email"
          name="email"
          label={<>Email Address <span className="pf-auth-field__req" aria-hidden="true">*</span></>}
          icon={<Mail size={16} strokeWidth={1.4} />}
          type="email"
          autoComplete="email"
          required
          value={formData.email}
          onChange={handleChange}
          placeholder="e.g. ananya.sharma@example.com"
          error={errors.email}
        />

        <TextField
          id="signup-phone"
          name="phone"
          label="Mobile Phone"
          icon={<Phone size={16} strokeWidth={1.4} />}
          type="tel"
          autoComplete="tel"
          value={formData.phone}
          onChange={handleChange}
          placeholder="e.g. +91 98765 43210"
          error={errors.phone}
        />

        <div className="pf-auth-form__pair">
          <PasswordField
            id="signup-password"
            name="password"
            label={<>Password <span className="pf-auth-field__req" aria-hidden="true">*</span></>}
            icon={<Lock size={16} strokeWidth={1.4} />}
            autoComplete="new-password"
            required
            visible={showPassword}
            onToggle={() => setShowPassword((current) => !current)}
            value={formData.password}
            onChange={handleChange}
            placeholder="Minimum 6 characters"
            error={errors.password}
          />
          <PasswordField
            id="signup-confirmPassword"
            name="confirmPassword"
            label={<>Confirm Password <span className="pf-auth-field__req" aria-hidden="true">*</span></>}
            icon={<Lock size={16} strokeWidth={1.4} />}
            autoComplete="new-password"
            required
            visible={showConfirmPassword}
            onToggle={() => setShowConfirmPassword((current) => !current)}
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="Repeat password"
            error={errors.confirmPassword}
            hideLabel="Hide confirmation"
            showLabel="Show confirmation"
          />
        </div>

        <TextField
          id="signup-dateOfBirth"
          name="dateOfBirth"
          label="Date of Birth"
          icon={<CalendarDays size={16} strokeWidth={1.4} />}
          type="date"
          value={formData.dateOfBirth}
          onChange={handleChange}
          note="Optional — for birthday celebrations"
        />

        <p className="pf-auth-terms">
          By creating an account, you agree to PRATIKSHYA FASHION&apos;s{' '}
          <Link to="/terms">Terms of Service</Link>{' '}
          and{' '}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <button type="submit" className="pf-auth-submit" disabled={isSubmitting || success}>
          <span>
            {isSubmitting
              ? 'Creating Account...'
              : success
                ? 'Welcome to PRATIKSHYA FASHION'
                : 'Create Account'}
          </span>
          <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>

        <PanelDivider />

        <GoogleSignInButton
          variant="glass"
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

      <div className="pf-auth-alt">
        <p>
          Already have an account?{' '}
          <PanelLink onClick={() => onSwitchMode('login')}>Sign in</PanelLink>
        </p>
      </div>
    </>
  );
}
