/**
 * PRATIKSHYA FASHON — Catalogue query state (Phase B wired).
 *
 * Strategy:
 *   - Reads filters / sort / search from the URL (unchanged behaviour).
 *   - Tries the backend GET /products or GET /search endpoint first.
 *   - Falls back to the local queryCatalogue() engine when the backend is
 *     not reachable, so the app still works in demo / offline mode.
 *
 * URL structure is unchanged: shareable, bookmarkable, back-button safe.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { filterFacets, defaultSort } from "../data/products/taxonomy";
import { queryCatalogue, resolveCategoryFilter, resolveSort, SORT_ALIASES } from "../data/products/query";
import { apiListProducts } from "./useProducts.apiHelper";

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
 * @param {*}       options.source        Passed to queryCatalogue (local fallback)
 * @param {number}  options.pageSize
 */
export default function useCatalogueQuery({
  scopeFilters = {},
  searchFromUrl = false,
  source = null,
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
  const [backendResults, setBackendResults] = useState(null); // null = not fetched yet
  const [backendTotal,   setBackendTotal]   = useState(0);
  const [backendFacets,  setBackendFacets]  = useState({});
  const [isFetching,     setIsFetching]     = useState(false);
  const fetchKey = useRef(null);

  useEffect(() => {
    // Build merged filter object (scope + active)
    const mergedFilters = { ...scopeFilters, ...filters };

    const key = JSON.stringify({ mergedFilters, search, sort, pages, size });
    if (fetchKey.current === key) return; // No change
    fetchKey.current = key;

    setIsFetching(true);
    apiListProducts({
      ...mergedFilters,
      q:        search  || undefined,
      sort,
      page:     pages,
      pageSize: size,
    }).then((result) => {
      if (fetchKey.current !== key) return; // Stale
      setIsFetching(false);
      if (result.ok) {
        setBackendResults(result.items ?? []);
        setBackendTotal(result.total ?? 0);
        setBackendFacets(result.facets ?? {});
      } else {
        // Backend unavailable — fall back to local engine
        setBackendResults(null);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scopeFilters), JSON.stringify(filters), search, sort, pages, size]);

  // ---------------------------------------------------------------------------
  // Local fallback (always computed so it's immediately available)
  // ---------------------------------------------------------------------------
  const localQuery = useMemo(
    () => queryCatalogue({ source, scopeFilters, filters, search, sort }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, JSON.stringify(scopeFilters), JSON.stringify(filters), search, sort]
  );

  // ---------------------------------------------------------------------------
  // Resolved results (backend wins when available, local is fallback)
  // ---------------------------------------------------------------------------
  const results = backendResults !== null ? backendResults : localQuery.results;
  const total   = backendResults !== null ? backendTotal   : localQuery.total;

  const visible = useMemo(
    () => (backendResults !== null ? results : results.slice(0, pages * size)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, pages, size, backendResults]
  );

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
    isFetching,
    /* results */
    results, visible, total,
    scoped:     localQuery.scoped,
    scopeTotal: localQuery.scopeTotal,
    facets:     backendFacets,
    hasMore,
    remaining:  total - visible.length,
    /* actions */
    setFilter, toggleFilter, removeFilter, clearFilters, setSort, setSearch, loadMore,
  };
}
