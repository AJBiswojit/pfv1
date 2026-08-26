import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  listRecentlyViewed,
  mergeGuestRecentlyViewed,
  recordRecentlyViewed,
  RECENTLY_VIEWED_CHANGED_EVENT,
  resolveRecentlyViewedProducts,
} from "../services/customer/recentlyViewed";
import { apiAddRecentlyViewed, apiGetRecentlyViewed } from "../services/api/productsApi";

/**
 * Recently viewed, joined across both stores:
 *
 *  - Guest: the isolated localStorage store (the backend has no guest
 *    history contract). Recorded locally by the PDP.
 *  - Authenticated: the SERVER history (`GET /products/recently-viewed`)
 *    is canonical — the PDP writes each view with `POST
 *    /products/recently-viewed`, this hook reads it back so account/AI
 *    consumers see exactly what the server holds. A failed read falls back
 *    to the local cache; a successful empty read is shown as empty.
 *  - Guest→sign-in: guest entries are pushed to the server once
 *    (best-effort, oldest first) and only then merged away locally.
 */
export function useRecentlyViewed(limit = 8) {
  const { user } = useAuth();
  const customerId = user?.id ?? null;

  const readLocal = useCallback(
    () => resolveRecentlyViewedProducts(customerId, limit),
    [customerId, limit]
  );

  // Local cache/list (guest source of truth, authenticated optimistic cache)
  const [localProducts, setLocalProducts] = useState(readLocal);
  // Server list when authenticated (null = not loaded / failed → local falls back)
  const [serverProducts, setServerProducts] = useState(null);

  const guestPushedFor = useRef(null);

  const fetchServer = useCallback(async () => {
    if (!customerId) return;
    const result = await apiGetRecentlyViewed();
    // ok (even empty) → server list is canonical; failure → null, local cache.
    setServerProducts(result.ok ? result.items.slice(0, limit) : null);
  }, [customerId, limit]);

  useEffect(() => {
    let cancelled = false;
    const sync = () => setLocalProducts(readLocal());
    sync();

    if (!customerId) {
      guestPushedFor.current = null;
      setServerProducts(null);
    } else {
      const guest = listRecentlyViewed(null);
      if (guest.length > 0 && guestPushedFor.current !== customerId) {
        // One best-effort push of the guest history into the server history
        // per sign-in. The local guest scope is only cleared when every
        // entry was accepted, so a failed push never loses guest data.
        guestPushedFor.current = customerId;
        (async () => {
          let allOk = true;
          // oldest first so the server ends with the most recent view on top
          for (const entry of [...guest].reverse()) {
            const result = await apiAddRecentlyViewed(entry.productId);
            if (!result.ok) allOk = false;
          }
          if (allOk) {
            mergeGuestRecentlyViewed(customerId);
            sync();
          }
          if (!cancelled) fetchServer();
        })();
      } else {
        fetchServer();
      }
    }

    window.addEventListener(RECENTLY_VIEWED_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelled = true;
      window.removeEventListener(RECENTLY_VIEWED_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [customerId, readLocal, fetchServer]);

  const record = useCallback(
    (productId) => {
      // Local first (optimistic for authenticated, the only store for guests)…
      recordRecentlyViewed(productId, customerId);
      // …then persist to the server history and re-read the canonical list.
      if (customerId) {
        apiAddRecentlyViewed(productId).then((result) => {
          if (result.ok) fetchServer();
        });
      }
    },
    [customerId, fetchServer]
  );

  const products = customerId && serverProducts ? serverProducts : localProducts;
  const ids = customerId && serverProducts
    ? serverProducts.map((product) => product.id)
    : listRecentlyViewed(customerId).map((entry) => entry.productId);

  return { products, ids, record };
}

export default useRecentlyViewed;
