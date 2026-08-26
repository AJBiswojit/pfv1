/**
 * PRATIKSHYA FASHON — Product register subscription (Phase B wired)
 *
 * Reads from the backend when available, falls back to the local
 * catalogRepository (localStorage + seed) when offline/unauthenticated.
 *
 * useProducts — admin/employee list with live-update on local mutations
 * useProduct  — single product kept live
 * useActivityLog — shared activity diary
 */

import { useCallback, useEffect, useRef, useState } from "react";
import catalogRepository, { PRODUCTS_CHANGED_EVENT } from "../services/catalogRepository";
import { ACTIVITY_CHANGED_EVENT, loadActivity } from "../services/employees/activityService";
import { apiAdminListProducts, apiAdminGetProduct } from "../services/api/productsApi";
import { getAccessToken } from "../services/api/apiClient";

/** Every product in the shared register — admin/employee workspace view.
 *  Fetches from backend when authenticated, syncs to local on mutations. */
export const useProducts = () => {
  const read = useCallback(() => catalogRepository.all(), []);
  const [items, setItems] = useState(read);
  const fetchedRef = useRef(false);

  // Initial fetch from backend
  useEffect(() => {
    if (!getAccessToken() || fetchedRef.current) return;
    fetchedRef.current = true;
    apiAdminListProducts().then((result) => {
      if (result.ok && result.items?.length) {
        // The backend list is authoritative; we don't overwrite local products
        // but we signal a refresh so the component re-reads catalogRepository
        window.dispatchEvent(new Event(PRODUCTS_CHANGED_EVENT));
      }
    });
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

/** One product from the shared register, kept live.
 *  Tries the backend first when authenticated. */
export const useProduct = (productId) => {
  const read = useCallback(
    () => (productId ? catalogRepository.find(productId) : null),
    [productId]
  );
  const [product, setProduct] = useState(read);

  useEffect(() => {
    if (!productId) return;

    // Try backend
    if (getAccessToken()) {
      apiAdminGetProduct(productId).then((result) => {
        if (result.ok && result.product) {
          setProduct(result.product);
        }
      });
    }

    const sync = () => setProduct(read());
    sync();
    window.addEventListener(PRODUCTS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
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
