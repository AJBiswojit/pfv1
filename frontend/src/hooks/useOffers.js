/**
 * PRATIKSHYA FASHON — Offer register subscriptions (Phase 5: fully
 * server-backed).
 *
 * Admin and employee desks read `GET /admin/offers`; customers get the
 * active public list from `GET /offers` via the shared catalog store
 * hydration. There is NO seed register and no localStorage authority:
 * loading, empty and error are distinct states, and a failed fetch says so
 * instead of rendering an empty list as if it were truth.
 */

import { useCallback, useEffect, useState } from "react";
import offerRepository, {
  OFFERS_CHANGED_EVENT,
  syncOffers,
} from "../services/offers/offerRepository";
import { apiAdminListOffers, apiAdminGetOffer } from "../services/api/offersApi";
import { getAccessToken } from "../services/api/apiClient";

/**
 * List hook. With an admin/employee session it fetches server-side pages
 * (q/status/page/pageSize) and returns the FULL result envelope so desks can
 * render pagination without re-filtering locally. Guest path keeps the
 * storefront session cache.
 */
export const useOffers = (filters = {}) => {
  const read = useCallback(() => offerRepository.list(filters), [
    filters.query,
    filters.status,
    filters.type,
    filters.category,
    filters.collection,
    filters.usage,
    filters.from,
    filters.to,
  ]);
  const [items, setItems] = useState(read);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const reload = useCallback(async () => {
    if (getAccessToken("admin") || getAccessToken("employee")) {
      setIsLoading(true);
      const result = await apiAdminListOffers({
        q: filters.query || undefined,
        status: filters.status && filters.status !== "ALL" ? filters.status : undefined,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 100,
      });
      if (result.ok) {
        setItems((result.offers ?? []).map(offerRepository.normaliseOffer));
        setError(null);
      } else {
        setItems([]);
        setError(result.error ?? "Offers could not be loaded from the server.");
      }
      setIsLoading(false);
      return result;
    }
    const result = await syncOffers();
    if (result.ok) {
      setItems((result.offers ?? []).map(offerRepository.normaliseOffer));
      setError(null);
    } else {
      setError(result.error ?? "Offers could not be loaded from the server.");
    }
    return result;
  }, [filters.query, filters.status, filters.page, filters.pageSize]);

  useEffect(() => {
    reload();
    const sync = () => setItems(read());
    window.addEventListener(OFFERS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(OFFERS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [read, reload]);

  return items;
};

/**
 * One offer by id. Returns { offer, loading, error } — loading is NOT an
 * empty state, and a 404 says "not found on the server" rather than
 * rendering a fabricated record.
 */
export const useOffer = (offerId) => {
  const read = useCallback(
    () => (offerId ? offerRepository.find(offerId) : null),
    [offerId]
  );
  const [offer, setOffer] = useState(read);
  const [loading, setLoading] = useState(Boolean(offerId));
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!offerId) {
      setOffer(null);
      setLoading(false);
      return undefined;
    }
    if (getAccessToken("admin") || getAccessToken("employee")) {
      setLoading(true);
      apiAdminGetOffer(offerId).then((result) => {
        if (cancelled) return;
        setLoading(false);
        if (result.ok && result.offer) {
          setOffer(offerRepository.normaliseOffer(result.offer));
          setError(null);
        } else {
          // Fall back to the session cache ONLY while it is fresh; a 404
          // from the server is final and must render as not-found.
          const cached = read();
          if (Number(result.status) === 404 || !cached) {
            setOffer(cached ?? null);
            setError(
              Number(result.status) === 404
                ? "This offer does not exist on the server."
                : result.error ?? "The offer could not be loaded from the server."
            );
          } else {
            setOffer(cached);
            setError(result.error ?? "Showing the cached copy — the server could not be reached.");
          }
        }
      });
    } else {
      setLoading(false);
      setOffer(read());
    }
    const sync = () => setOffer(read());
    window.addEventListener(OFFERS_CHANGED_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFERS_CHANGED_EVENT, sync);
    };
  }, [offerId, read]);

  return { offer, loading, error };
};

export default useOffers;
