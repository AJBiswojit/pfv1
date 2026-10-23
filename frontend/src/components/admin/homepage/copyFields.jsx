/* F-08 (Batch 3): one descriptor list for the editorial copy fields.
 *
 * The labels used to be the raw request keys ("ctaHref", "altText"), so the
 * operator had to decode the wire format. The limits below mirror
 * backend/app/schemas/media/homepage.py — the server still validates, this
 * only stops a long paste before it becomes a failed round trip.
 *
 * `title` stays "Title" on purpose: it is the field the existing suites and
 * the accessible name already use.
 */
export const COPY_FIELDS = Object.freeze([
  {
    key: 'eyebrow', label: 'Kicker', maxLength: 100, multiline: false,
    help: 'Small label printed above the title.',
  },
  {
    key: 'title', label: 'Title', maxLength: 255, multiline: false,
    help: 'The headline of this entry.',
  },
  {
    key: 'subtitle', label: 'Subtitle', maxLength: 500, multiline: true,
    help: 'Supporting sentence under the title.',
  },
  {
    key: 'ctaLabel', label: 'Button label', maxLength: 100, multiline: false,
    help: 'Text on the call-to-action button. Must be filled together with its destination.',
  },
  {
    key: 'ctaHref', label: 'CTA destination', maxLength: 500, multiline: false,
    help: 'Site-relative link starting with a single "/".',
  },
  {
    key: 'altText', label: 'Image description', maxLength: 2000, multiline: true,
    help: 'Read aloud by screen readers; also shown if the image fails to load.',
  },
]);

export const COPY_KEYS = Object.freeze(COPY_FIELDS.map((field) => field.key));

export const emptyCopy = () => Object.fromEntries(COPY_KEYS.map((key) => [key, '']));

/* The hero editor has no eyebrow field: it edits a marketing row, not a
   section entry. Filtering by key keeps one vocabulary for both panels. */
export const copyFieldsFor = (keys) => COPY_FIELDS.filter((field) => !keys || keys.includes(field.key));

/* Counters appear from 80 % of the limit, so normal copy stays uncluttered. */
export const counterFor = (value, maxLength) => {
  const length = String(value ?? '').length;
  return length >= Math.ceil(maxLength * 0.8) ? `${length}/${maxLength}` : '';
};

/* F-14 (Batch 3): the backend reports a handful of deterministic copy
   failures. Mapping them onto the field they belong to is presentation only —
   the sentence itself is still shown verbatim, and anything unrecognised keeps
   the existing single alert above the form. */
export function fieldErrorsFor(message = '') {
  const text = String(message ?? '');
  if (!text) return {};
  if (/CTA label and destination must be supplied together/i.test(text)) {
    return { ctaLabel: text, ctaHref: text };
  }
  if (/\bCTA\b/i.test(text)) return { ctaHref: text };
  if (/requires meaningful copy/i.test(text)) return { title: text };
  if (/alt text|image description/i.test(text)) return { altText: text };
  return {};
}

/* Batch 5 / F-14 follow-up: a mapped 422 moves the sentence under its field,
   which associates it with the input but does not ANNOUNCE it — focus is
   already inside the form, so nothing tells a screen-reader user that the save
   failed. This single live region carries each distinct message once, above the
   fields, while the field paragraphs keep the `aria-describedby` association. */
/* A corrected field must stop claiming to be wrong. The CTA pair is one rule
   over two controls, so editing either side clears both messages. */
export function clearedErrors(errors = {}, key = '') {
  if (!errors[key]) return errors;
  const pair = ['ctaLabel', 'ctaHref'].includes(key);
  return Object.fromEntries(Object.entries(errors).map(([name, message]) => [
    name, !message || (pair && ['ctaLabel', 'ctaHref'].includes(name)) ? '' : message,
  ]));
}

export function ErrorSummary({ errors = {}, id = 'copy-error-summary' }) {
  const messages = [...new Set(Object.values(errors).filter(Boolean))];
  if (!messages.length) return null;
  return <div id={id} role="alert" className="border border-pf-error bg-pf-card p-2 text-xs text-pf-error">
    {messages.map((message) => <p key={message}>{message}</p>)}
  </div>;
}

/* One copy control: a plain-language label, the limit, the server's message
   when it belongs here, and a counter only once the value approaches the cap.
   `aria-describedby` carries help + counter + error, so the input is never
   described by an invisible string. */
export function CopyField({ field, value, disabled = false, error = '', onChange }) {
  const id = `copy-${field.key}`;
  const helpId = `${id}-help`;
  const countId = `${id}-count`;
  const errorId = `${id}-error`;
  const counter = counterFor(value, field.maxLength);
  const describedBy = [helpId, counter ? countId : '', error ? errorId : ''].filter(Boolean).join(' ');
  const shared = {
    id,
    value: value ?? '',
    disabled,
    maxLength: field.maxLength,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    onChange: (event) => onChange(event.target.value),
    className: `mt-1 block w-full border ${error ? 'border-pf-error' : 'border-pf-border-strong'} bg-pf-ivory p-2 text-sm`,
  };
  return <div className="text-xs">
    <label htmlFor={id} className="text-xs">
      {field.label}
      {field.multiline
        ? <textarea {...shared} rows={2} />
        : <input {...shared} />}
    </label>
    <div className="mt-1 flex justify-between gap-2 text-[11px] text-pf-muted">
      <span id={helpId}>{field.help}</span>
      {counter && <span id={countId}>{counter}</span>}
    </div>
    {error && <p id={errorId} className="mt-1 text-[11px] text-pf-error">{error}</p>}
  </div>;
}
