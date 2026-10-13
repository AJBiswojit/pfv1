/**
 * Product write surfaces read assignable (ACTIVE) taxonomy from the admin
 * API — not the storefront snapshot, which never carries DRAFT rows, and
 * not the unfiltered admin list, which includes nodes the product write
 * path will reject.
 */

import { useEffect, useState } from "react";
import taxonomyRepository from "../services/taxonomyRepository";

export function useAssignableCategoryOptions() {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    taxonomyRepository.loadAssignableCategoryOptions().then((result) => {
      if (!cancelled && result.ok) setOptions(result.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
}

export function useAssignableSubcategories(categoryId) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (!categoryId) {
      setItems([]);
      return undefined;
    }
    taxonomyRepository.loadAssignableSubcategories(categoryId).then((result) => {
      if (!cancelled && result.ok) setItems(result.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  return items;
}
