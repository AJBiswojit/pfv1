/**
 * PRATIKSHYA FASHON — Customer Authentication Context
 *
 * Wired to the FastAPI backend (Phase B).
 * All identity operations call /api/v1/auth/customer/* via authApi.js.
 *
 * Session persistence:
 *   - JWT access token  → localStorage "pf_access_token"
 *   - JWT refresh token → localStorage "pf_refresh_token"
 *   - User profile      → localStorage "pratikshya_auth" (same key as before,
 *     so account pages, cart merge etc. keep working unchanged)
 *
 * Password values are NEVER stored.
 * Shopping state (Bag and Wishlist) is preserved across sign in and sign out.
 *
 * Fallback behaviour:
 *   If VITE_API_BASE is not set AND the backend is unreachable, the context
 *   returns { ok: false, error } and the UI shows the error — no silent mock.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { writeStorage } from "../utils/shopping";
import {
  apiSignInCustomer,
  apiSignUpCustomer,
  apiSignOutCustomer,
  apiForgotPasswordCustomer,
  apiResetPasswordCustomer,
  apiRestoreCustomerSession,
} from "../services/api/authApi";
import { clearTokens, getAccessToken } from "../services/api/apiClient";

export const AUTH_STORAGE_KEY    = "pratikshya_auth";
export const CUSTOMERS_REGISTRY_KEY = "pratikshya_customers_registry"; // kept for cart/wishlist compat

const AuthContext = createContext(null);

// ---------------------------------------------------------------------------
// Session restore
// ---------------------------------------------------------------------------

function hasStoredToken() {
  return Boolean(getAccessToken("customer"));
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [isLoading, setIsLoading] = useState(hasStoredToken);

  // Validate any stored customer token with the backend before marking the
  // context authenticated. Local profile snapshots are cache only, not auth.
  useEffect(() => {
    let cancelled = false;
    if (!hasStoredToken()) {
      setIsLoading(false);
      return () => { cancelled = true; };
    }

    setIsLoading(true);
    apiRestoreCustomerSession().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setUser(result.user);
      } else {
        setUser(null);
        clearTokens("customer");
        try { window.localStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* ignore */ }
      }
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  // Persist profile snapshot so cart / wishlist / account pages keep working
  useEffect(() => {
    if (user?.id) {
      writeStorage(AUTH_STORAGE_KEY, user);
    } else {
      try { window.localStorage.removeItem(AUTH_STORAGE_KEY); } catch { /* ignore */ }
    }
  }, [user]);

  // Listen for token expiry event dispatched by apiClient refresh failure
  useEffect(() => {
    const handleExpiry = (event) => {
      if (event?.detail?.scope && event.detail.scope !== "customer") return;
      setUser(null);
      clearTokens("customer");
    };
    window.addEventListener("pf:session-expired", handleExpiry);
    return () => window.removeEventListener("pf:session-expired", handleExpiry);
  }, []);

  // ── Sign In ──────────────────────────────────────────────────────────────

  const signIn = useCallback(async ({ identifier, password }) => {
    setIsLoading(true);
    const result = await apiSignInCustomer({ identifier, password });
    setIsLoading(false);

    if (!result.ok) return { ok: false, error: result.error };

    setUser(result.user);
    return { ok: true, user: result.user };
  }, []);

  // ── Sign Up ──────────────────────────────────────────────────────────────

  const signUp = useCallback(async ({ firstName, lastName, email, phone, password, dateOfBirth }) => {
    setIsLoading(true);
    const result = await apiSignUpCustomer({ firstName, lastName, email, phone, password, dateOfBirth });
    setIsLoading(false);

    if (!result.ok) return { ok: false, error: result.error };

    setUser(result.user);
    return { ok: true, user: result.user };
  }, []);

  // ── Sign Out ─────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    await apiSignOutCustomer();
    setUser(null);
  }, []);

  // ── Forgot Password ──────────────────────────────────────────────────────

  const forgotPassword = useCallback(async (identifier) => {
    setIsLoading(true);
    const result = await apiForgotPasswordCustomer(identifier);
    setIsLoading(false);
    return result;
  }, []);

  // ── Reset Password ───────────────────────────────────────────────────────

  const resetPassword = useCallback(async (newPassword, confirmPassword, { userId, token } = {}) => {
    setIsLoading(true);
    const result = await apiResetPasswordCustomer({ userId, token, newPassword, confirmPassword });
    setIsLoading(false);
    return result;
  }, []);

  // ── Update local profile snapshot (for profile page edits) ───────────────

  const updateUser = useCallback((updatedFields) => {
    setUser((current) => {
      if (!current) return null;
      return { ...current, ...updatedFields };
    });
  }, []);

  // ── Context value ─────────────────────────────────────────────────────────

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    signIn,
    signUp,
    signOut,
    forgotPassword,
    resetPassword,
    updateUser,
  }), [user, isLoading, signIn, signUp, signOut, forgotPassword, resetPassword, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      signIn:        async () => ({ ok: false, error: "" }),
      signUp:        async () => ({ ok: false, error: "" }),
      signOut:       async () => {},
      forgotPassword: async () => ({ ok: false, error: "" }),
      resetPassword: async () => ({ ok: false, error: "" }),
      updateUser:    () => {},
    };
  }
  return context;
}

export default AuthContext;
