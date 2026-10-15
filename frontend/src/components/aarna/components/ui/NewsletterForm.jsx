import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { newsletterAvailable, subscribe } from '../../services/newsletter.js';
import { cx } from '../../utils/format.js';

/** Shown instead of a form that cannot submit (see `services/newsletter.js`). */
const UNAVAILABLE_NOTE = 'Newsletter sign-up opens once the subscription service is connected.';

/** Email capture with idle / loading / success / error states. */
export default function NewsletterForm({ variant = 'default', id = 'newsletter-email', buttonLabel = 'Subscribe' }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const live = newsletterAvailable();
  const [message, setMessage] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setMessage('');
    try {
      const res = await subscribe(email);
      setStatus('success');
      setMessage(`Welcome to the Circle — we’ll write to ${res.email}.`);
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(err.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <form className={cx('nform', !live && 'is-unavailable', `nform--${variant}`, status === 'error' && 'has-error')} onSubmit={onSubmit} noValidate>
      <div className="nform__row">
        <label htmlFor={id} className="sr-only">Email address</label>
        <input
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status !== 'loading') setStatus('idle'); }}
          aria-invalid={status === 'error'}
          aria-describedby={`${id}-msg`}
          disabled={!live || status === 'loading'}
          required
        />
        <button type="submit" className="nform__btn" disabled={!live || status === 'loading'}>
          {status === 'loading' ? <Loader2 size={16} className="spin" aria-label="Subscribing" /> : status === 'success' ? <Check size={16} aria-label="Subscribed" /> : buttonLabel}
        </button>
      </div>
      <div id={`${id}-msg`} className="nform__msg" aria-live="polite">
        <AnimatePresence mode="wait">
          {!live && (
            <p className="is-note">{UNAVAILABLE_NOTE}</p>
          )}
          {live && message && (
            <motion.p key={message} className={status === 'error' ? 'is-error' : 'is-success'} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {message}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
