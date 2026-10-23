/**
 * PRATIKSHYA FASHION — Admin product search (server-side, debounced, paged).
 *
 * WHY THIS EXISTS
 * The media-upload product picker used to read `catalogRepository.all()` once,
 * inside a `useMemo` with no dependencies. That list is a session cache filled
 * by `AdminLayout`, and its only fetch asks for the NEWEST 100 products — so on
 * a cold route the picker could snapshot an empty array and never recover, and
 * an older product could never be found at all.
 *
 * This hook asks the backend the same question the catalogue desk asks, through
 * the SAME adapter (`apiAdminListProducts`): the admin list endpoint already
 * supports `q` (name / SKU / id / label / taxonomy / fabric), `page`,
 * `pageSize` and returns `total` as the FULL filtered count. No new endpoint,
 * no new product service and no new cache — `catalogRepository` and
 * `useProducts` are deliberately left untouched, so none of their seven other
 * consumers can be affected.
 *
 * Behaviour:
 *   · the query is debounced (default 300 ms) before it reaches the network;
 *   · a newer request supersedes an older one (stale answers are discarded);
 *   · `loadMore` appends the next page, so the whole catalogue is reachable;
 *   · `state` is always one of loading / ready / error, and `retry()` re-runs
 *     the current query.
 *
 * `enabled: false` leaves the hook inert (the employee portal has no product
 * list endpoint; `MediaProductSelector` uses its register source there).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiAdminListProducts } from "../services/api/productsApi";

export const PRODUCT_SEARCH_PAGE_SIZE = 20;
export const PRODUCT_SEARCH_DEBOUNCE_MS = 300;

export default function useAdminProductSearch({
  enabled = true,
  pageSize = PRODUCT_SEARCH_PAGE_SIZE,
  debounceMs = PRODUCT_SEARCH_DEBOUNCE_MS,
} = {}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  /* Debounce the typed query. */
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  /* A new search starts a new result set. */
  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const load = useCallback(
    async (targetPage, { append = false } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setStatus("loading");
      setError(null);
      const result = await apiAdminListProducts({
        q: debounced || undefined,
        page: targetPage,
        pageSize,
        sort: "newest",
      });
      /* A stale response (superseded query/page, or unmounted) is discarded. */
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (!result.ok) {
        setStatus("error");
        setError(result.error ?? "The product catalogue could not be loaded.");
        if (!append) {
          setItems([]);
          setTotal(null);
        }
        return;
      }
      const nextItems = Array.isArray(result.items) ? result.items : [];
      setItems((current) => (append ? [...current, ...nextItems] : nextItems));
      setTotal(Number.isFinite(result.total) ? result.total : null);
      setStatus("ready");
    },
    [debounced, pageSize]
  );

  useEffect(() => {
    if (!enabled) return;
    load(1, { append: false });
  }, [enabled, load]);

  const loadMore = useCallback(() => {
    if (status === "loading") return;
    if (total != null && items.length >= total) return;
    const nextPage = page + 1;
    setPage(nextPage);
    load(nextPage, { append: true });
  }, [items.length, load, page, status, total]);

  const retry = useCallback(() => {
    load(page, { append: false });
  }, [load, page]);

  const hasMore = total != null ? items.length < total : false;

  return useMemo(
    () => ({
      query,
      setQuery,
      items,
      total,
      status,
      error,
      isLoading: status === "loading",
      isReady: status === "ready",
      hasMore,
      loadMore,
      retry,
      refresh: retry,
    }),
    [error, hasMore, items, loadMore, query, retry, status, total]
  );
}
