/**
 * PRATIKSHYA FASHON — Product register subscription (backend-driven).
 *
 * Admin/employee product data is fetched from the backend
 * (GET /admin/products, GET /admin/products/{id}) and cached in memory via
 * catalogRepository. There is NO local seed and NO localStorage register:
 * when the API fails, the error is surfaced and pages render error states.
 *
 * DB-load note (admin consolidation): several surfaces mount this hook at
 * once (product review, marketing media, catalogue selectors, group review).
 * A module-level SINGLE-FLIGHT fetch with a short freshness window means N
 * simultaneous mounts trigger ONE GET /admin/products request, and remounts
 * within the window reuse the shared register instead of re-reading the
 * catalogue on every navigation. A PRODUCTS_CHANGED_EVENT (or an explicit
 * refresh) invalidates the window, so data stays as fresh as it was before —
 * the dedup only removes duplicate concurrent/rapid-refetch reads.
 */

import { useCallback, useEffect, useState } from "react";
import catalogRepository, {
  PRODUCTS_CHANGED_EVENT,
  replaceServerProducts,
} from "../services/catalogRepository";
import { ACTIVITY_CHANGED_EVENT, loadActivity } from "../services/employees/activityService";
import { apiAdminListProducts, apiAdminGetProduct } from "../services/api/productsApi";
import { getAccessToken } from "../services/api/apiClient";

const PRODUCTS_TTL_MS = 30_000;

let sharedFetchInFlight = null;
let sharedFetchedAt = 0;

const fetchProductsShared = (force = false) => {
  const fresh = Date.now() - sharedFetchedAt < PRODUCTS_TTL_MS;
  if (!force && fresh) return Promise.resolve({ ok: true, cached: true });
  if (sharedFetchInFlight) return sharedFetchInFlight;
  sharedFetchInFlight = apiAdminListProducts({ pageSize: 100 })
    .then((result) => {
      sharedFetchedAt = Date.now();
      if (result.ok) {
        replaceServerProducts(result.items ?? []);
        return { ok: true, cached: false };
      }
      // A failed read must not poison the freshness window.
      sharedFetchedAt = 0;
      return { ok: false, error: result.error ?? "Could not load products from the server." };
    })
    .finally(() => {
      sharedFetchInFlight = null;
    });
  return sharedFetchInFlight;
};

/** Force the next useProducts() mount to re-read from the backend. */
export const invalidateSharedProductsFetch = () => {
  sharedFetchedAt = 0;
};

/** Every product in the shared register — admin/employee workspace view. */
export const useProducts = () => {
  const read = useCallback(() => catalogRepository.all(), []);
  const [items, setItems] = useState(read);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const admin = Boolean(getAccessToken("admin"));
    const employee = Boolean(getAccessToken("employee"));
    if (!admin && !employee) {
      setError("Sign in to the admin or employee portal to manage products.");
      return undefined;
    }
    const alreadyWarm = catalogRepository.all().length > 0 && Date.now() - sharedFetchedAt < PRODUCTS_TTL_MS;
    if (!alreadyWarm) setIsLoading(true);
    fetchProductsShared().then((result) => {
      if (cancelled) return;
      setIsLoading(false);
      if (result.ok) {
        setError(null);
      } else if (!result.cached) {
        setError(result.error ?? "Could not load products from the server.");
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    const onProductsChanged = () => {
      sharedFetchedAt = 0;
      setItems(read());
    };
    window.addEventListener(PRODUCTS_CHANGED_EVENT, onProductsChanged);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, onProductsChanged);
      window.removeEventListener("storage", sync);
    };
  }, [read]);

  return items;
};

/** One product from the shared register — backend first, cache fallback. */
export const useProduct = (productId) => {
  const read = useCallback(
    () => (productId ? catalogRepository.find(productId) : null),
    [productId]
  );
  const [product, setProduct] = useState(read);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!productId) return undefined;
    let cancelled = false;

    if (getAccessToken("admin")) {
      apiAdminGetProduct(productId).then((result) => {
        if (cancelled) return;
        if (result.ok && result.product) {
          setProduct(result.product);
          setError(null);
        } else {
          setError(result.error ?? "Could not load this product from the server.");
        }
      });
    }

    const sync = () => setProduct(read());
    sync();
    window.addEventListener(PRODUCTS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      cancelled = true;
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [productId, read]);

  return product;
};

/** The shared activity diary, re-read when it changes. */
export const useActivityLog = () => {
  const [entries, setEntries] = useState(() => loadActivity());

  useEffect(() => {
    const sync = () => setEntries(loadActivity());
    sync();
    window.addEventListener(ACTIVITY_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACTIVITY_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return entries;
};

export default useProducts;
