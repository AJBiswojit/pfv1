import assert from 'node:assert/strict';

/** Presentation chrome is not private account content. A guarded slot may show
 * the existing access-verification message, but never a profile, rail or body. */
export function assertNoPrivateAccountContent(markup, message) {
  assert.doesNotMatch(markup, /class="info container account pf-account"|pf-account__(?:layout|content|side|user|nav)/, message);
  assert.match(markup, /<main id="main" tabindex="-1" aria-label="Account workspace">/, 'the presentation shell still owns the account viewport');
}
