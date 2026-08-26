/**
 * PRATIKSHYA FASHON — Product register subscription (backend-driven).
 *
 * Admin/employee product data is fetched from the backend
 * (GET /admin/products, GET /admin/products/{id}) and cached in memory via
 * catalogRepository. There is NO local seed and NO localStorage register:
 * when the API fails, the error is surfaced and pages render error states.
 */

import { useCallback, useEffect, useState } from "react";
import catalogRepository, {
  PRODUCTS_CHANGED_EVENT,
  replaceServerProducts,
} from "../services/catalogRepository";
import { ACTIVITY_CHANGED_EVENT, loadActivity } from "../services/employees/activityService";
import { apiAdminListProducts, apiAdminGetProduct } from "../services/api/productsApi";
import { getAccessToken } from "../services/api/apiClient";

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
    setIsLoading(true);
    apiAdminListProducts({ pageSize: 100 }).then((result) => {
      if (cancelled) return;
      setIsLoading(false);
      if (result.ok) {
        replaceServerProducts(result.items ?? []);
        setError(null);
      } else {
        setError(result.error ?? "Could not load products from the server.");
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener(PRODUCTS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, sync);
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
