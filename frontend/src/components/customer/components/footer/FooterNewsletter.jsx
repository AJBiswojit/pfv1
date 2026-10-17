/**
 * PRATIKSHYA FASHION · the footer's newsletter panel.
 *
 * The reference's composition: the lotus, the eyebrow, the serif promise, a
 * hairline with its sparkle, then one long pill holding the field and the gold
 * button. The behaviour is this application's honesty:
 *
 *   · the address is validated before anything is attempted, and an invalid one
 *     is reported in the live region and given focus back;
 *   · the subscription boundary (`services/newsletter.js`) answers whether a
 *     sign-up can be made at all. It currently says no, so the panel never
 *     claims a remote success: the address is kept in this browser's session
 *     storage and the status line says exactly that.
 *   · when the boundary does answer yes (the preview seam, or a real service
 *     replacing that module), the same form calls `subscribe()` and reports its
 *     answer, including its failure.
 *
 * A `<section>` is deliberately NOT used: the shell suite reads the page's
 * `<section>` list as the design's homepage inventory, and the footer is not one
 * of its sections.
 */

import { useRef, useState } from 'react';
import { ArrowRight, Check, Loader2, Mail } from 'lucide-react';
import { LotusMark, Sparkle } from './FooterArt.jsx';
import { UNAVAILABLE_MESSAGE, newsletterAvailable, subscribe } from '../../services/newsletter.js';
import { load, save } from '../../services/storage.js';
import { cx } from '../../utils/format.js';

/* A client-side gate, exported so the suite can say what the panel will and
   will not accept: something@something.something, and nothing that only looks
   like it. */
export const validateAddress = (value) => {
  const address = String(value ?? '').trim();
  if (!address) return 'Enter your email address so we know where to write.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) return 'That address looks incomplete — check for a typo before sending.';
  return null;
};

/** The sentence that keeps an unconnected service honest. */
export const KEEPING_IT_LOCAL = 'the subscription service is not connected yet, so nothing has been sent to us.';
/** Where an address waits while the house has nowhere to send it. */
const QUEUE_KEY = 'storefront:newsletter';

export default function FooterNewsletter() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);
  const live = newsletterAvailable();

  const reject = (text) => {
    setStatus('error');
    setMessage(text);
    inputRef.current?.focus();
  };

  const queued = (value) => {
    const stored = load(QUEUE_KEY, [], 'session');
    const queue = Array.isArray(stored) ? stored : [];
    if (!queue.includes(value)) save(QUEUE_KEY, [...queue, value], 'session');
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (status === 'checking') return;
    const problem = validateAddress(email);
    if (problem) return reject(problem);
    const value = email.trim();

    if (!live) {
      queued(value);
      setEmail('');
      setStatus('queued');
      setMessage(`Saved in this browser only — ${KEEPING_IT_LOCAL}`);
      return;
    }

    setStatus('checking');
    setMessage('');
    try {
      const result = await subscribe(value);
      setEmail('');
      setStatus('sent');
      setMessage(`Welcome to the Circle — we’ll write to ${result?.email ?? value}.`);
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || 'Something went wrong. Please try again.');
    }
  };

  const busy = status === 'checking';

  return (
    <div className={cx('fnews', status === 'error' && 'is-error')}>
      <div className="fnews__lead">
        <span className="fnews__mark"><LotusMark /></span>
        <div className="fnews__copy">
          <p className="fnews__eyebrow">Stay connected</p>
          <h2 className="fnews__title">Be the first to know</h2>
          <p className="fnews__note">
            Get updates on new arrivals, exclusive collections and special offers.
          </p>
        </div>
      </div>

      <span className="fnews__rule" aria-hidden="true"><Sparkle /></span>

      <form className="fnews__form" onSubmit={onSubmit} noValidate>
        <div className="fnews__field">
          <Mail size={18} className="fnews__icon" aria-hidden="true" />
          <label className="sr-only" htmlFor="footer-news-email">Email address</label>
          <input
            ref={inputRef}
            id="footer-news-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (status === 'error') { setStatus('idle'); setMessage(''); }
            }}
            aria-invalid={status === 'error'}
            aria-describedby="footer-news-message"
            disabled={busy}
          />
          <button type="submit" className="fnews__submit" disabled={busy}>
            {busy ? (
              <Loader2 size={16} className="spin" aria-label="Sending" />
            ) : status === 'sent' || status === 'queued' ? (
              <Check size={16} aria-label="Saved" />
            ) : (
              <>
                Subscribe
                <ArrowRight size={16} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
        <p
          id="footer-news-message"
          className={cx('fnews__status', status === 'error' && 'is-error', status === 'queued' && 'is-queued', status === 'sent' && 'is-success')}
          role="status"
          aria-live="polite"
        >
          {message || (live ? '' : UNAVAILABLE_MESSAGE)}
        </p>
      </form>
    </div>
  );
}
