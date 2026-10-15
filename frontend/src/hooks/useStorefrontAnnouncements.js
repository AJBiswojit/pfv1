/**
 * PRATIKSHYA FASHION — storefront announcement bar data.
 *
 * The bar has no dedicated announcements endpoint and this phase adds none.
 * The content it shows is the PROMOTION marketing placement — the storefront
 * surface the Marketing desk already curates in the Admin Portal
 * (Marketing media → placement "Promotion", with title / subtitle / CTA and
 * an active flag), read through the existing public service
 * `apiGetMarketingPlacement` (GET /marketing/placements/PROMOTION, active
 * rows only).
 *
 * Consequences, all deliberate:
 *
 *   · Real, admin-controlled copy only. Nothing is authored here — this
 *     module holds no campaign text, no headline and no promotional claim.
 *   · No rows (or no backend) ⇒ an EMPTY list ⇒ the bar renders nothing.
 *     There is no fallback copy and no client-side invention.
 *   · One request per page load, and a second mount (React StrictMode in
 *     development, or a re-render) reuses the in-flight promise instead of
 *     firing again.
 *   · A failure is reported once and never retried in a loop; the shell
 *     simply has no announcement to show.
 *
 * If the house later wants a purpose-built announcements source (a settings
 * API or an announcement table), that is a backend capability for a later
 * approved phase — see `docs/PHASE-2A-STOREFRONT-SHELL.md`.
 */

import { useEffect, useRef, useState } from "react";
import { MARKETING_PLACEMENTS } from "../config/mediaTypes";
import { apiGetMarketingPlacement } from "../services/api/marketingMediaApi";

/** How many messages the bar is willing to rotate through. */
const MAX_ANNOUNCEMENTS = 6;

/** In-flight / settled request, shared by every mount in the session. */
let request = null;

const normalise = (items) => {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const messages = [];

  for (const item of items) {
    /* `title` carries the line the desk wrote for the storefront; `subtitle`
       is the short supporting line and is used only when no title exists.
       Nothing is composed, concatenated or embellished from other fields. */
    const text = String(item?.title ?? "").trim() || String(item?.subtitle ?? "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    messages.push({ id: String(item?.id ?? key), text });
    if (messages.length >= MAX_ANNOUNCEMENTS) break;
  }

  return messages;
};

const readPlacement = () => {
  if (!request) {
    request = apiGetMarketingPlacement(MARKETING_PLACEMENTS.PROMOTION).then((result) => {
      if (!result?.ok) return { announcements: [], error: result?.error ?? "unavailable" };
      return { announcements: normalise(result.items), error: null };
    });
  }
  return request;
};

/**
 * The storefront's live announcements, in the placement's display order.
 *
 *   const { announcements, status } = useStorefrontAnnouncements();
 *
 * `status` is one of `idle` | `loading` | `ready` | `empty` | `unavailable`.
 * `enabled: false` keeps the hook inert (nothing is requested at all) — used
 * by the preview harness when it is showing preview-only fixture copy.
 */
export function useStorefrontAnnouncements({ enabled = true } = {}) {
  const [state, setState] = useState({ announcements: [], status: enabled ? "idle" : "disabled" });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ announcements: [], status: "disabled" });
      return undefined;
    }

    let cancelled = false;
    setState((current) => (current.status === "idle" ? { ...current, status: "loading" } : current));

    readPlacement().then(({ announcements, error }) => {
      if (cancelled) return;
      setState({
        announcements,
        status: error ? "unavailable" : announcements.length ? "ready" : "empty",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}

/** Test seam — drops the shared request so a suite can re-read the placement. */
export const resetAnnouncementsRequest = () => {
  request = null;
};

export default useStorefrontAnnouncements;
