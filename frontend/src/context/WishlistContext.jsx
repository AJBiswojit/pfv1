/**
 * PRATIKSHYA FASHON — Wishlist state (Phase B wired)
 *
 * Strategy:
 *   - Guest (no token)  → pure localStorage wishlist (existing behaviour)
 *   - Authenticated     → sync every mutation to backend; localStorage is a
 *                         local echo so the header badge never lags
 *
 * Backend endpoints (all require customer JWT):
 *   GET    /wishlist
 *   POST   /wishlist/{productId}
 *   DELETE /wishlist/{productId}
 *   POST   /wishlist/{productId}/toggle
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getProductById } from "../data/products";
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

/** Restores only ids that still exist in the catalogue (guest/fallback). */
const restoreWishlist = () => {
  const stored = readStorage(WISHLIST_STORAGE_KEY, []);
  if (!Array.isArray(stored)) return new Set();
  return new Set(stored.filter((id) => typeof id === "string" && getProductById(id)));
};

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(restoreWishlist);

  // Persist to localStorage on every change (guest + authenticated echo)
  useEffect(() => {
    writeStorage(WISHLIST_STORAGE_KEY, [...saved]);
  }, [saved]);

  // When user authenticates, pull the server wishlist
  useEffect(() => {
    if (!user?.id || !getAccessToken()) return;
    apiGetWishlist().then((result) => {
      if (result.ok && Array.isArray(result.items)) {
        // Server wins: replace local state with server state
        setSaved(new Set(result.items));
      }
    });
  }, [user?.id]);

  const resolveId = (product) =>
    typeof product === "string" ? product : product?.id ?? null;

  // ------------------------------------------------------------------
  // Local-first optimistic helpers
  // ------------------------------------------------------------------

  const add = useCallback((product) => {
    const id = resolveId(product);
    if (!id) return;
    setSaved((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
    // Backend sync (non-blocking)
    if (user?.id && getAccessToken()) {
      apiAddToWishlist(id).then((result) => {
        if (result.ok && Array.isArray(result.items)) {
          setSaved(new Set(result.items));
        }
      });
    }
  }, [user?.id]);

  const remove = useCallback((product) => {
    const id = resolveId(product);
    if (!id) return;
    setSaved((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    // Backend sync (non-blocking)
    if (user?.id && getAccessToken()) {
      apiRemoveFromWishlist(id).then((result) => {
        if (result.ok && Array.isArray(result.items)) {
          setSaved(new Set(result.items));
        }
      });
    }
  }, [user?.id]);

  const toggle = useCallback((product) => {
    const id = resolveId(product);
    if (!id) return;
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Backend sync (non-blocking)
    if (user?.id && getAccessToken()) {
      apiToggleWishlist(id).then((result) => {
        if (result.ok && Array.isArray(result.items)) {
          setSaved(new Set(result.items));
        }
      });
    }
  }, [user?.id]);

  /** The saved pieces, resolved from the catalogue. */
  const products = useMemo(
    () => [...saved].map((id) => getProductById(id)).filter(Boolean),
    [saved]
  );

  const value = useMemo(
    () => ({
      saved,
      products,
      count: saved.size,
      isSaved: (product) => saved.has(resolveId(product)),
      add,
      remove,
      toggle,
    }),
    [saved, products, add, remove, toggle]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  return (
    useContext(WishlistContext) ?? {
      saved: new Set(),
      products: [],
      count: 0,
      isSaved: () => false,
      add: () => {},
      remove: () => {},
      toggle: () => {},
    }
  );
}

export default WishlistContext;
