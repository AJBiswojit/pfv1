/**
 * PRATIKSHYA FASHON — Catalogue query state (backend-authoritative).
 *
 *   - Reads filters / sort / search from the URL (unchanged behaviour).
 *   - Queries GET /products (or GET /search when a search term is set)
 *     through the API layer. There is NO local seed fallback: when the
 *     backend fails the hook exposes `error` and the page renders a proper
 *     error state with a retry action.
 *
 * URL structure is unchanged: shareable, bookmarkable, back-button safe.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { filterFacets, defaultSort } from "../data/products/taxonomy";
import { resolveCategoryFilter, resolveSort, SORT_ALIASES } from "../data/products/query";
import { apiListProducts, apiSearchProducts } from "./useProducts.apiHelper";

export { SORT_ALIASES };

/** The number of products revealed by one press of "Load More". */
export const PAGE_SIZE = 12;

const multiFacets = new Set(
  filterFacets.filter((facet) => facet.multiple).map((facet) => facet.id)
);
const facetIds = filterFacets.map((facet) => facet.id);

// ---------------------------------------------------------------------------
// URL ↔ filter helpers (unchanged from original)
// ---------------------------------------------------------------------------

const readFilters = (params) => {
  const filters = {};
  facetIds.forEach((id) => {
    const raw = params.get(id);
    if (!raw) return;
    filters[id] = multiFacets.has(id) ? raw.split(",").filter(Boolean) : raw;
  });
  if (filters.category) filters.category = resolveCategoryFilter(filters.category);
  return filters;
};

const writeFilters = (params, filters) => {
  facetIds.forEach((id) => {
    const value = filters[id];
    const serialised = Array.isArray(value) ? value.join(",") : value;
    if (serialised) params.set(id, serialised);
    else params.delete(id);
  });
  return params;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {object}  options.scopeFilters  Filters locked by the route (e.g. category)
 * @param {boolean} options.searchFromUrl Read the search term from `?q=`
 * @param {number}  options.pageSize
 */
export default function useCatalogueQuery({
  scopeFilters = {},
  searchFromUrl = false,
  pageSize = PAGE_SIZE,
} = {}) {
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => readFilters(params), [params]);
  const search   = searchFromUrl ? (params.get("q") ?? "") : "";
  const sort     = resolveSort(params.get("sort"), defaultSort);
  const pages    = Math.max(1, Number(params.get("page")) || 1);
  const size     = Math.max(1, Number(pageSize) || PAGE_SIZE);

  // ---------------------------------------------------------------------------
  // Backend result state
  // ---------------------------------------------------------------------------
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState({});
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const fetchKey = useRef(null);

  useEffect(() => {
    const mergedFilters = { ...scopeFilters, ...filters };
    const key = JSON.stringify({ mergedFilters, search, sort, pages, size, attempt });
    if (fetchKey.current === key) return;
    fetchKey.current = key;

    setIsFetching(true);
    setError(null);

    const query = {
      ...mergedFilters,
      q:        search  || undefined,
      sort,
      page:     pages,
      pageSize: size,
    };

    const request = search
      ? apiSearchProducts(query)
      : apiListProducts(query);

    request.then((result) => {
      if (fetchKey.current !== key) return;
      setIsFetching(false);
      if (result.ok) {
        setItems(result.items ?? []);
        setTotal(result.total ?? 0);
        setFacets(result.facets ?? {});
        setError(null);
      } else {
        setItems([]);
        setTotal(0);
        setFacets({});
        setError(result.error ?? "Could not load the catalogue. Please try again.");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scopeFilters), JSON.stringify(filters), search, sort, pages, size, attempt]);

  // ---------------------------------------------------------------------------
  // Results — backend only, no local fallback
  // ---------------------------------------------------------------------------
  const scoped = items;
  const results = items;
  const visible = items;

  const hasMore = visible.length < total;

  // ---------------------------------------------------------------------------
  // Mutations (unchanged from original)
  // ---------------------------------------------------------------------------

  const applyFilters = useCallback(
    (next) => {
      setParams((current) => {
        const updated = writeFilters(new URLSearchParams(current), next);
        updated.delete("page");
        return updated;
      }, { replace: true });
    },
    [setParams]
  );

  const setFilter = useCallback(
    (facetId, value) => applyFilters({ ...filters, [facetId]: value ?? "" }),
    [applyFilters, filters]
  );

  const toggleFilter = useCallback(
    (facetId, value) => {
      if (!multiFacets.has(facetId)) {
        return setFilter(facetId, filters[facetId] === value ? "" : value);
      }
      const current = filters[facetId] ?? [];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      return setFilter(facetId, next);
    },
    [filters, setFilter]
  );

  const removeFilter = useCallback(
    (facetId, value) => {
      if (multiFacets.has(facetId) && value !== undefined) {
        return setFilter(facetId, (filters[facetId] ?? []).filter((entry) => entry !== value));
      }
      return setFilter(facetId, "");
    },
    [filters, setFilter]
  );

  const clearFilters = useCallback(() => applyFilters({}), [applyFilters]);

  const setSort = useCallback(
    (value) => {
      setParams((current) => {
        const updated = new URLSearchParams(current);
        const canonical = SORT_ALIASES[value] || value;
        if (canonical && canonical !== defaultSort) updated.set("sort", canonical);
        else updated.delete("sort");
        updated.delete("page");
        return updated;
      }, { replace: true });
    },
    [setParams]
  );

  const setSearch = useCallback(
    (value) => {
      setParams((current) => {
        const updated = new URLSearchParams(current);
        const term = String(value || "").trim();
        if (term) updated.set("q", term);
        else updated.delete("q");
        updated.delete("page");
        return updated;
      }, { replace: true });
    },
    [setParams]
  );

  const loadMore = useCallback(() => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("page", String(pages + 1));
      return updated;
    }, { replace: true });
  }, [pages, setParams]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  // ---------------------------------------------------------------------------
  // Active chips (unchanged)
  // ---------------------------------------------------------------------------
  const activeChips = useMemo(() => {
    const chips = [];
    filterFacets.forEach((facet) => {
      const value = filters[facet.id];
      if (!value) return;
      const values = Array.isArray(value) ? value : [value];
      values.forEach((entry) => chips.push({ facet: facet.id, facetLabel: facet.label, value: entry }));
    });
    return chips;
  }, [filters]);

  return {
    /* state */
    filters, search, sort, activeChips, activeCount: activeChips.length,
    isFetching, error, retry,
    /* results */
    results, visible, total,
    scoped,
    scopeTotal: total,
    facets,
    hasMore,
    remaining: total - visible.length,
    /* actions */
    setFilter, toggleFilter, removeFilter, clearFilters, setSort, setSearch, loadMore,
  };
}
