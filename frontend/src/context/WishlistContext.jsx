/**
 * PRATIKSHYA FASHON — Wishlist state (backend-authoritative).
 *
 * Authenticated customers:   GET /wishlist, POST /wishlist/{id},
 *                            DELETE /wishlist/{id}, POST /wishlist/{id}/toggle
 * The server response is rendered as-is; failures surface as an error and
 * are never converted into an empty wishlist.
 *
 * Saved products whose catalogue record no longer resolves (deleted or
 * unpublished) are NOT silently hidden: they are tracked per id and exposed
 * through `entries` as `{ id, product: null, unavailable: true }` so the UI
 * can show an honest "no longer available" state and let the customer
 * remove them. Availability/price always comes from the catalogue — never
 * fabricated here.
 *
 * Guests: a client-only wishlist in localStorage (explicitly temporary
 * client state — the backend has no guest wishlist contract and no merge
 * path).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getProductById,
  ensureProduct,
  subscribeCatalog,
} from "../services/catalog/catalogStore";
import { readStorage, WISHLIST_STORAGE_KEY, writeStorage } from "../utils/shopping";
import { buildWishlistEntries } from "../utils/wishlistState";
import { useAuth } from "./AuthContext";
import { getAccessToken } from "../services/api/apiClient";
import {
  apiGetWishlist,
  apiAddToWishlist,
  apiRemoveFromWishlist,
  apiToggleWishlist,
} from "../services/api/wishlistApi";

const WishlistContext = createContext(null);

const restoreGuestWishlist = () => {
  const stored = readStorage(WISHLIST_STORAGE_KEY, []);
  return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === "string") : []);
};

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const authenticated = Boolean(user?.id) && Boolean(getAccessToken("customer"));
  const [saved, setSaved] = useState(restoreGuestWishlist);
  /** ids whose catalogue lookup has been attempted and failed — honest unavailable state. */
  const [unavailableIds, setUnavailableIds] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  /** Resolution attempts, so each unresolved id is fetched at most once per session. */
  const attempted = useRef(new Set());

  useEffect(() => {
    if (!authenticated) writeStorage(WISHLIST_STORAGE_KEY, [...saved]);
  }, [authenticated, saved]);

  useEffect(() => {
    if (!authenticated) {
      setSaved(restoreGuestWishlist());
      setUnavailableIds(new Set());
      attempted.current = new Set();
      setError(null);
      setErrorStatus(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiGetWishlist().then((result) => {
      if (cancelled) return;
      setIsLoading(false);
      if (result.ok && Array.isArray(result.items)) {
        setSaved(new Set(result.items));
        setError(null);
        setErrorStatus(null);
      } else {
        // A failed load is an error — never an empty wishlist.
        setError(result.error ?? "Could not load your wishlist.");
        setErrorStatus(result.status ?? 0);
      }
    });
    return () => { cancelled = true; };
  }, [authenticated, user?.id]);

  const resolveId = (product) =>
    typeof product === "string" ? product : product?.id ?? null;

  const syncServer = useCallback(async (action, id) => {
    setIsSyncing(true);
    const result = await action(id);
    setIsSyncing(false);
    if (result.ok && Array.isArray(result.items)) {
      setSaved(new Set(result.items));
      setError(null);
      setErrorStatus(null);
      return { ok: true };
    }
    setError(result.error ?? "Wishlist update failed.");
    setErrorStatus(result.status ?? 0);
    return { ok: false, message: result.error };
  }, []);

  const add = useCallback((product) => {
    const id = resolveId(product);
    if (!id) return Promise.resolve({ ok: false, message: "" });
    if (authenticated) return syncServer(apiAddToWishlist, id);
    setSaved((current) => new Set(current).add(id));
    return Promise.resolve({ ok: true });
  }, [authenticated, syncServer]);

  const remove = useCallback((product) => {
    const id = resolveId(product);
    if (!id) return Promise.resolve({ ok: false, message: "" });
    if (authenticated) return syncServer(apiRemoveFromWishlist, id);
    setSaved((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    return Promise.resolve({ ok: true });
  }, [authenticated, syncServer]);

  const toggle = useCallback((product) => {
    const id = resolveId(product);
    if (!id) return Promise.resolve({ ok: false, message: "" });
    if (authenticated) return syncServer(apiToggleWishlist, id);
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    return Promise.resolve({ ok: true });
  }, [authenticated, syncServer]);

  const [catalogTick, setCatalogTick] = useState(0);
  useEffect(() => subscribeCatalog(() => setCatalogTick((t) => t + 1)), []);

  /**
   * Resolve saved ids against the catalogue, one attempt per id per session.
   * An id whose detail lookup fails is marked unavailable — never dropped.
   */
  useEffect(() => {
    const pending = [...saved].filter(
      (id) => !getProductById(id) && !attempted.current.has(id)
    );
    if (pending.length === 0) return;
    let cancelled = false;
    pending.forEach((id) => {
      attempted.current.add(id);
      ensureProduct(id).then((result) => {
        if (cancelled || result.ok) return;
        setUnavailableIds((current) => new Set(current).add(id));
      });
    });
    return () => { cancelled = true; };
  }, [saved, catalogTick]);

  const products = useMemo(() => {
    const list = [...saved].map((id) => getProductById(id)).filter(Boolean);
    return list;
  }, [saved, catalogTick]);

  /**
   * Full wishlist surface: every saved id, with its resolved product when the
   * catalogue still has one, and an explicit `unavailable` flag when it does
   * not. Nothing is silently substituted or hidden.
   */
  const entries = useMemo(
    () => buildWishlistEntries(saved, unavailableIds, getProductById),
    [saved, unavailableIds, catalogTick]
  );

  const value = useMemo(() => ({
    saved, products, entries, count: saved.size, isSyncing, isLoading, error, errorStatus,
    isSaved: (product) => saved.has(resolveId(product)),
    add, remove, toggle,
  }), [saved, products, entries, isSyncing, isLoading, error, errorStatus, add, remove, toggle]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  return (
    useContext(WishlistContext) ?? {
      saved: new Set(),
      products: [],
      entries: [],
      count: 0,
      isSyncing: false,
      isLoading: false,
      error: null,
      errorStatus: null,
      isSaved: () => false,
      add: () => Promise.resolve({ ok: false, message: "" }),
      remove: () => Promise.resolve({ ok: false, message: "" }),
      toggle: () => Promise.resolve({ ok: false, message: "" }),
    }
  );
}

export default WishlistContext;
