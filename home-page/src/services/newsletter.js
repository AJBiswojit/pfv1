/* Newsletter service — mocked. Replace `subscribe` with a real API call.
 * Simulates latency and validates input so the UI can show loading,
 * success and error states honestly. */
import { load, save } from './storage.js';

const KEY = 'aarna:newsletter';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function subscribe(email) {
  const value = String(email || '').trim().toLowerCase();
  await new Promise((r) => setTimeout(r, 900));
  if (!EMAIL_RE.test(value)) throw new Error('Please enter a valid email address.');
  const stored = load(KEY, []);
  const list = Array.isArray(stored) ? stored : [];
  if (list.includes(value)) throw new Error('This email is already on the list.');
  save(KEY, [...list, value]);
  return { ok: true, email: value };
}
