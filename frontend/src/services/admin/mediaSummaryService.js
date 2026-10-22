/**
 * PRATIKSHYA FASHION — Media summary request coordinator (Batch 4).
 *
 * One job: turn `GET /media/assets/summary` into view state, while making
 * sure concurrent callers share a single network request.
 *
 *   loadMediaSummary()  →  apiGetMediaAssetSummary()
 *                       →  mediaSummaryOutcome()   → {status, summary, error}
 *
 * Why this is a separate, React-free module:
 *
 *   · React StrictMode mounts effects twice in development. Both mounts ask
 *     for the summary in the same tick; the in-flight promise is shared, so
 *     the browser still sees ONE request. This is the same convention as
 *     `useStorefrontAnnouncements`.
 *   · The promise is cleared the moment it settles — it is a de-duplicator,
 *     never a cache. A later mount, a retry or a `refreshToken` bump always
 *     performs a fresh read, so "stale counts presented as current" cannot
 *     happen at this layer either.
 *   · Being React-free, the behaviour above is covered by the Node test
 *     harness (no DOM, no renderer), not only by a source guard.
 *
 * Failure semantics live in `mediaSummaryOutcome` (mediaRegistryView.js):
 * a failure, a 401/403 or a malformed payload always yields `summary: null`,
 * never a zero-filled snapshot.
 */

import { apiGetMediaAssetSummary } from "../api/mediaApi";
import { mediaSummaryOutcome } from "./mediaRegistryView";

/** The in-flight read, shared by concurrent callers. */
let inFlight = null;

/**
 * Read the summary once per in-flight window.
 *
 * Resolves with `{status, summary, error}`; it never rejects —
 * `apiGetMediaAssetSummary` already normalises thrown errors, and the last
 * line of defence below keeps a surprise rejection from leaving a caller
 * stuck on "loading".
 */
export function loadMediaSummary() {
  if (inFlight) return inFlight;

  const request = apiGetMediaAssetSummary()
    .then((result) => mediaSummaryOutcome(result))
    .catch((error) =>
      mediaSummaryOutcome({
        ok: false,
        status: 0,
        error: error?.message || "The media summary could not be loaded.",
        code: "UNKNOWN_ERROR",
      })
    )
    .finally(() => {
      // Identity check: a newer request may already have replaced this one.
      if (inFlight === request) inFlight = null;
    });

  inFlight = request;
  return request;
}

/** Test seam — drops the shared request so a suite can start a fresh read. */
export const resetMediaSummaryRequest = () => {
  inFlight = null;
};

export default loadMediaSummary;
