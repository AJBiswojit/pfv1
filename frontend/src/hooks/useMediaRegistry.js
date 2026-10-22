/**
 * PRATIKSHYA FASHION — Media registry hooks (Batches 4 + 5).
 *
 * Two hooks, both fed by the durable registry and nothing else:
 *
 *   useMediaSummary()     the eight KPI cards        (Batch 4)
 *   useMediaAssetPage()   one page of the registry   (Batch 5)
 *
 * `useMediaSummary` is the ONLY way the media surfaces read the KPI snapshot:
 *
 *   GET /media/assets/summary   →  loadMediaSummary()        (de-duplicated)
 *                               →  mediaSummaryOutcome()     (view model)
 *                               →  buildMediaCardModels()    (view model)
 *
 * The request itself lives in `services/admin/mediaSummaryService.js` so its
 * one-request-per-in-flight-window behaviour is tested in the Node harness;
 * this hook owns only the React lifecycle:
 *
 *   · ONE request per mount. React StrictMode mounts effects twice in
 *     development; the service shares the in-flight promise, so the second
 *     mount subscribes to the first request instead of issuing another one.
 *     A retry (or a `refreshToken` bump from an upload elsewhere on the
 *     page) is a NEW request, because by then the previous one has settled.
 *   · No stale updates. Every effect run takes a request id; a response is
 *     applied only when it is still the newest run and the component is
 *     still mounted.
 *   · No stale counts. Each run resets to `mediaSummaryLoadingState()`
 *     (`summary: null` → every card `—`), so a failed refresh can never
 *     leave the previous numbers on screen as current data.
 *   · No fallback data. A failure, a 401/403 or a malformed payload yields
 *     `status: "error" | "unauthorized"` with `summary: null`; nothing is
 *     defaulted to zero and no local/demo register is consulted.
 *
 * The returned `status` is one of `loading | ready | error | unauthorized`
 * (`MEDIA_SUMMARY_STATUS`). `cards` is the locked eight-card model; the page
 * renders it as-is.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadMediaSummary } from "../services/admin/mediaSummaryService";
import { fetchMediaAssetPage } from "../services/admin/mediaAssetPageService";
import {
  buildMediaCardModels,
  mediaPageHasFilters,
  mediaPageLoadingState,
  mediaSummaryLoadingState,
} from "../services/admin/mediaRegistryView";

/**
 * The registry summary as view state.
 *
 *   const { status, summary, error, cards, retry } = useMediaSummary();
 *
 * `refreshToken` re-reads when the page knows the registry changed (for
 * example after a placement asset was registered). `retry` is the manual
 * equivalent and is safe to call from an error banner button.
 */
export function useMediaSummary({ refreshToken = 0 } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(mediaSummaryLoadingState);
  const latest = useRef(0);

  useEffect(() => {
    let alive = true;
    latest.current += 1;
    const requestId = latest.current;

    // A refresh starts from "unknown". Previous counts are deliberately
    // dropped rather than shown as if they were current.
    setState(mediaSummaryLoadingState());

    loadMediaSummary().then((next) => {
      if (!alive || latest.current !== requestId) return; // stale response
      setState(next);
    });

    return () => {
      alive = false;
    };
  }, [refreshToken, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const { status, summary, error } = state;
  const cards = useMemo(() => buildMediaCardModels({ status, summary }), [status, summary]);

  return { status, summary, error, cards, retry };
}

/**
 * One page of the durable registry.
 *
 *   const { status, items, total, page, pageSize, error, hasFilters, retry } =
 *     useMediaAssetPage({ page, pageSize: 24, tabId: "ALL", q, refreshToken });
 *
 * Same lifecycle rules as `useMediaSummary`:
 *
 *   · every run (page, tab, search term or `refreshToken` change) resets to
 *     `mediaPageLoadingState()` — the previous rows are cleared, so a slow or
 *     failed read can never leave the old page on screen as the new one;
 *   · every run takes a request id and a live flag; a response is applied only
 *     when it is still current, so fast tab/search changes cannot be
 *     overwritten by a slower earlier request;
 *   · `retry` re-runs the exact same request.
 *
 * `total` comes from the server (`null` when it is absent) — never from
 * `items.length`; `hasFilters` is derived from the request so "empty
 * registry" and "no match" stay distinguishable.
 */
export function useMediaAssetPage({ page = 1, pageSize = 24, tabId = "ALL", q = "", refreshToken = 0 } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(() => mediaPageLoadingState({ page, pageSize }));
  const latest = useRef(0);

  useEffect(() => {
    let alive = true;
    latest.current += 1;
    const requestId = latest.current;

    setState(mediaPageLoadingState({ page, pageSize }));

    fetchMediaAssetPage({ tabId, page, pageSize, q }).then((next) => {
      if (!alive || latest.current !== requestId) return; // stale response
      setState(next);
    });

    return () => {
      alive = false;
    };
  }, [tabId, page, pageSize, q, refreshToken, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const hasFilters = useMemo(() => mediaPageHasFilters({ tabId, q }), [tabId, q]);

  return { ...state, hasFilters, retry };
}

export default { useMediaSummary, useMediaAssetPage };

