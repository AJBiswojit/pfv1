/* F-24 + F-07 (Batch 3): intent, expressed once.
 *
 * Both editors used a single `border border-pf-border` class for every
 * control, so "Remove entry" and "Save" were visually identical. These are the
 * three variants the audit asked for, built from tokens that already exist in
 * `index.css` (`pf-burgundy`, `pf-border-strong`, `pf-error`):
 *
 *   primary     — the action that writes: burgundy plate, ivory text
 *   secondary   — everything reversible / navigational
 *   destructive — removes a row; never mixed with primary emphasis
 *
 * `SaveBar` is layout only. The transport stays inside each panel.
 */

const BASE = 'px-3 py-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed';

const VARIANTS = {
  primary: 'border border-pf-burgundy bg-pf-burgundy text-pf-ivory hover:bg-pf-burgundy/90',
  secondary: 'border border-pf-border-strong bg-pf-card hover:bg-pf-card-soft',
  destructive: 'border border-pf-error/40 text-pf-error hover:bg-pf-error/5',
};

/** The class string for one button intent. */
export const buttonClass = (variant = 'secondary') => `${VARIANTS[variant] ?? VARIANTS.secondary} ${BASE}`;

/** A row of actions with consistent wrapping and spacing. */
export function SaveBar({ children, className = '' }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

export default SaveBar;
