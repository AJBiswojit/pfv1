/**
 * PRATIKSHYA FASHON — Offer register subscription (backend-driven).
 *
 * Admin and employee desks read offers from GET /admin/offers when
 * authenticated and from GET /offers otherwise; the list re-renders whenever
 * the shared offer store announces a change. No seed offers.
 */

import { useCallback, useEffect, useState } from "react";
import offerRepository, {
  OFFERS_CHANGED_EVENT,
  syncOffers,
} from "../services/offers/offerRepository";
import { apiAdminListOffers } from "../services/api/offersApi";
import { getAccessToken } from "../services/api/apiClient";

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

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (getAccessToken("admin") || getAccessToken("employee")) {
        apiAdminListOffers({ pageSize: 100 }).then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setItems(result.offers ?? []);
            setError(null);
          } else {
            setError(result.error ?? "Could not load offers.");
          }
        });
      } else {
        syncOffers().then((result) => {
          if (cancelled) return;
          if (result.ok) setItems(result.offers ?? []);
          else setError(result.error ?? "Could not load offers.");
        });
      }
    };
    load();

    const sync = () => setItems(read());
    window.addEventListener(OFFERS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFERS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [read]);

  return items;
};

export const useOffer = (offerId) => {
  const read = useCallback(
    () => (offerId ? offerRepository.find(offerId) : null),
    [offerId]
  );
  const [offer, setOffer] = useState(read);

  useEffect(() => {
    let cancelled = false;
    if (offerId && (getAccessToken("admin") || getAccessToken("employee"))) {
      apiAdminGetOffer(offerId).then((result) => {
        if (cancelled) return;
        if (result.ok && result.offer) setOffer(result.offer);
      });
    }
    const sync = () => setOffer(read());
    sync();
    window.addEventListener(OFFERS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFERS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [offerId, read]);

  return offer;
};

export default useOffers;
