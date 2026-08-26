/**
 * PRATIKSHYA FASHON — Reactive catalog store hook.
 *
 * Subscribes a component to the backend-fed catalog snapshot so it
 * re-renders when products / categories / collections arrive from the API.
 *
 *   const { status, error, products, categories, collections, retry } = useCatalog();
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  getCatalogState,
  hydrateCatalog,
  refreshCatalog,
  subscribeCatalog,
  getAllProducts,
  getCategories,
  getCollections,
} from "../services/catalog/catalogStore";

export function useCatalog() {
  const snapshot = useSyncExternalStore(subscribeCatalog, getCatalogState, getCatalogState);

  return {
    status: snapshot.status,
    error: snapshot.error,
    products: snapshot.products,
    categories: snapshot.categories,
    collections: snapshot.collections,
    retry: useCallback(() => refreshCatalog(), []),
  };
}

/** Convenience hook for components that only need the product snapshot. */
export function useStorefrontProducts() {
  return useSyncExternalStore(
    subscribeCatalog,
    () => getAllProducts(),
    () => []
  );
}

/** Convenience hook for components that only need the taxonomy snapshot. */
export function useStorefrontTaxonomy() {
  return useSyncExternalStore(
    subscribeCatalog,
    () => ({ categories: getCategories(), collections: getCollections() }),
    () => ({ categories: [], collections: [] })
  );
}

export default useCatalog;
