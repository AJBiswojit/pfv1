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
  getCatalogTaxonomySnapshot,
  hydrateCatalog,
  refreshCatalog,
  subscribeCatalog,
  getAllProducts,
} from "../services/catalog/catalogStore";

export function useCatalog() {
  const snapshot = useSyncExternalStore(subscribeCatalog, getCatalogState, getCatalogState);

  return {
    status: snapshot.status,
    error: snapshot.error,
    products: snapshot.products,
    categories: snapshot.categories,
    collections: snapshot.collections,
    subcategories: snapshot.subcategories,
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
    getCatalogTaxonomySnapshot,
    () => ({ categories: [], collections: [], subcategories: {}, version: 0 })
  );
}

export default useCatalog;
