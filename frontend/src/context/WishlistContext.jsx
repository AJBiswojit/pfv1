/**
 * PRATIKSHYA FASHON — Wishlist state (backend-authoritative).
 *
 * Authenticated customers:   GET /wishlist, POST /wishlist/{id},
 *                            DELETE /wishlist/{id}, POST /wishlist/{id}/toggle
 * The server response is rendered as-is; failures surface as an error.
 *
 * Guests: a client-only wishlist in localStorage (explicitly temporary
 * client state — the backend has no guest wishlist contract).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getProductById,
  ensureProduct,
  subscribeCatalog,
} from "../services/catalog/catalogStore";
import { readStorage, WISHLIST_STORAGE_KEY, writeStorage } from "../utils/shopping";
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
  const authenticated = Boolean(user?.id) && Boolean(getAccessToken());
  const [saved, setSaved] = useState(restoreGuestWishlist);
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!authenticated) writeStorage(WISHLIST_STORAGE_KEY, [...saved]);
  }, [authenticated, saved]);

  useEffect(() => {
    if (!authenticated) {
      setSaved(restoreGuestWishlist());
      setError(null);
      return;
    }
    let cancelled = false;
    setIsSyncing(true);
    apiGetWishlist().then((result) => {
      if (cancelled) return;
      setIsSyncing(false);
      if (result.ok && Array.isArray(result.items)) {
        setSaved(new Set(result.items));
        setError(null);
      } else {
        setError(result.error ?? "Could not load your wishlist.");
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
      return { ok: true };
    }
    setError(result.error ?? "Wishlist update failed.");
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

  const products = useMemo(() => {
    const list = [...saved].map((id) => getProductById(id)).filter(Boolean);
    [...saved].forEach((id) => { if (!getProductById(id)) ensureProduct(id); });
    return list;
  }, [saved, catalogTick]);

  const value = useMemo(() => ({
    saved, products, count: saved.size, isSyncing, error,
    isSaved: (product) => saved.has(resolveId(product)),
    add, remove, toggle,
  }), [saved, products, isSyncing, error, add, remove, toggle]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  return (
    useContext(WishlistContext) ?? {
      saved: new Set(),
      products: [],
      count: 0,
      isSyncing: false,
      error: null,
      isSaved: () => false,
      add: () => Promise.resolve({ ok: false, message: "" }),
      remove: () => Promise.resolve({ ok: false, message: "" }),
      toggle: () => Promise.resolve({ ok: false, message: "" }),
    }
  );
}

export default WishlistContext;
