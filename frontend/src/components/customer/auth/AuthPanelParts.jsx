/**
 * PRATIKSHYA FASHION — CINEMATIC GLASS AUTH
 *
 * The small, shared pieces every authentication panel is drawn from: the panel's
 * eyebrow + serif title + supporting line, a labelled field with a leading icon,
 * a password field with its reveal control, the alert and status rows, and the
 * "or continue with" rule.
 *
 * These are presentation only. Validation, API calls, session handling and every
 * message belong to the panels themselves, which in turn call the application's
 * existing `AuthContext` — nothing here reaches the network or stores a session.
 */

import { Eye, EyeOff } from 'lucide-react';

/** Eyebrow → serif title → supporting line, in the reference's register. */
export function PanelHeading({ eyebrow, title, lead, titleRef }) {
  return (
    <>
      <p className="pf-auth-panel__eyebrow">{eyebrow}</p>
      <h2 className="pf-auth-panel__title" id="pf-auth-title" ref={titleRef} tabIndex={-1}>
        {title}
      </h2>
      {lead ? <p className="pf-auth-panel__lead">{lead}</p> : null}
    </>
  );
}

/** A refused request or a field-level failure the customer must hear. */
export function PanelAlert({ children }) {
  return <p className="pf-auth-alert" role="alert">{children}</p>;
}

/** A confirmed state (signed in, request received, password updated). */
export function PanelStatus({ children }) {
  return <p className="pf-auth-status" role="status">{children}</p>;
}

/**
 * One labelled field.
 *
 * The label is a real `<label>` bound by `htmlFor`; the control is a translucent
 * glass row holding an optional leading icon, the input itself and an optional
 * trailing control (the password reveal). Field errors are announced through
 * `aria-describedby` and marked with `aria-invalid`.
 */
export function TextField({
  id,
  label,
  action,
  icon,
  type = 'text',
  autoComplete,
  value,
  onChange,
  placeholder,
  error,
  trailing,
  note,
  required = false,
  ...inputProps
}) {
  const errorId = `${id}-error`;
  return (
    <div className={error ? 'pf-auth-field pf-auth-field--invalid' : 'pf-auth-field'}>
      <div className="pf-auth-field__head">
        <label className="pf-auth-field__label" htmlFor={id}>{label}</label>
        {action}
      </div>
      <span className="pf-auth-control">
        {icon ? <span className="pf-auth-control__icon" aria-hidden="true">{icon}</span> : null}
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        {trailing}
      </span>
      {error ? <span id={errorId} className="pf-auth-field__error">{error}</span> : null}
      {note && !error ? <span className="pf-auth-field__note">{note}</span> : null}
    </div>
  );
}

/** The password field: `TextField` plus the eye control production already had. */
export function PasswordField({ visible, onToggle, hideLabel = 'Hide password', showLabel = 'Show password', ...props }) {
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={(
        <button
          type="button"
          className="pf-auth-toggle"
          onClick={onToggle}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
        >
          {visible
            ? <EyeOff size={17} strokeWidth={1.4} aria-hidden="true" />
            : <Eye size={17} strokeWidth={1.4} aria-hidden="true" />}
        </button>
      )}
    />
  );
}

/** The thin rule that separates the password form from the Google control. */
export function PanelDivider() {
  return <p className="pf-auth-divider"><span>Or continue with</span></p>;
}

/** An in-panel text action — a control, never a link, so the URL never moves. */
export function PanelLink({ children, onClick, className }) {
  return (
    <button type="button" className={className ? `pf-auth-textlink ${className}` : 'pf-auth-textlink'} onClick={onClick}>
      {children}
    </button>
  );
}
