/**
 * PRATIKSHYA FASHION — PHASE 2D · the subscription boundary.
 *
 * ADAPTED AT THE BOUNDARY.
 *
 * The design's `services/newsletter.js` simulates a subscription: a 900 ms
 * delay, an email check, a session-storage list, and success/error states. That
 * is the right prototype for a prototype — and it is not a subscription.
 *
 * This application has no subscription capability yet: no endpoint, no list, no
 * consent record, and nothing in the admin that could honour "we'll write to
 * you" (recorded as a capability gap in
 * `docs/PHASE-2D-EXACT-HOMEPAGE-VISUAL-PARITY.md`). So the module keeps the
 * design's API — `newsletterAvailable()` / `subscribe(email)` — and answers
 * honestly:
 *
 *   · `newsletterAvailable()` is FALSE in production, and the ported form
 *     renders its field and button disabled with the reason in the design's own
 *     status line. A control that cannot work is not offered as if it could.
 *   · `subscribe()` never resolves into a fake success. It throws the same
 *     class of error the design's own service throws, so any future caller that
 *     ignores the availability flag cannot accidentally show "Welcome to the
 *     Circle".
 *
 * PREVIEW SEAM. `setPreviewNewsletterService()` lets the development reference
 * surface substitute the design's own simulated service, so the newsletter
 * section can be compared with the design in all four of its states. It is
 * called from that surface alone.
 */

let previewService = null;

/** Preview-only substitution (see the module header). Pass `null` to clear. */
export const setPreviewNewsletterService = (service) => {
  previewService = typeof service === "function" ? service : null;
};

/** True while the reference surface is running the design's simulated service. */
export const usingPreviewNewsletterService = () => previewService !== null;

/** The reason the ported form shows instead of a live field. */
export const UNAVAILABLE_MESSAGE =
  "Newsletter sign-up opens once the subscription service is connected.";

/** Whether a subscription can actually be made right now. */
export const newsletterAvailable = () => previewService !== null;

/**
 * Subscribe an address. Keeps the design's signature and its rejection
 * behaviour; a real implementation replaces this module when the capability
 * exists.
 */
export const subscribe = async (email) => {
  if (previewService) return previewService(email);
  throw new Error(UNAVAILABLE_MESSAGE);
};
