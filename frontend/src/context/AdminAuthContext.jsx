/**
 * PRATIKSHYA FASHON — Admin authentication context.
 *
 * Wired to the FastAPI backend (Phase B).
 * Calls /api/v1/auth/admin/* via authApi.js.
 *
 * Token isolation: admin JWT is stored under SEPARATE localStorage keys
 * ("pf_admin_access_token" / "pf_admin_refresh_token") so admin sign-in
 * never clobbers a customer or employee session.
 *
 * Session persistence:
 *   - JWT tokens → localStorage "pf_admin_access_token" / "pf_admin_refresh_token"
 *   - Admin profile snapshot → localStorage "pratikshya_admin_auth"
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ADMIN_ROLES, hasAdminPermission } from "../config/adminAccess";
import {
  apiSignInAdmin,
  apiSignOutAdmin,
} from "../services/api/authApi";
import { readStorage, writeStorage } from "../utils/shopping";

const AdminAuthContext = createContext(null);

const ADMIN_SESSION_KEY         = "pratikshya_admin_auth";
export const ADMIN_ACCESS_TOKEN_KEY  = "pf_admin_access_token";
export const ADMIN_REFRESH_TOKEN_KEY = "pf_admin_refresh_token";

// Token helpers specific to the admin surface
export const getAdminAccessToken = () => {
  try { return localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY); } catch { return null; }
};

const clearAdminTokens = () => {
  try {
    localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
    localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY);
  } catch { /* ignore */ }
};

// ---------------------------------------------------------------------------
// Session restore
// ---------------------------------------------------------------------------

function restoreSession() {
  if (!getAdminAccessToken()) return { admin: null, isAuthenticated: false };
  const stored = readStorage(ADMIN_SESSION_KEY, null);
  if (stored && typeof stored === "object" && stored.id) {
    return { admin: stored, isAuthenticated: true };
  }
  return { admin: null, isAuthenticated: false };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(restoreSession);
  const [isLoading, setIsLoading] = useState(false);

  const admin           = session.admin;
  const isAuthenticated = Boolean(session.isAuthenticated && admin);

  // Persist admin profile snapshot
  useEffect(() => {
    if (admin?.id) {
      writeStorage(ADMIN_SESSION_KEY, admin);
    } else {
      try { window.localStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
    }
  }, [admin]);

  // Listen for global token expiry (from apiClient — fires on pf_access_token only;
  // admin has its own token so we only clear if the token in storage is the admin one)
  useEffect(() => {
    const handleExpiry = () => {
      // Only clear the admin session if there's no admin token
      if (!getAdminAccessToken()) {
        setSession({ admin: null, isAuthenticated: false });
      }
    };
    window.addEventListener("pf:session-expired", handleExpiry);
    return () => window.removeEventListener("pf:session-expired", handleExpiry);
  }, []);

  // ── Sign In ──────────────────────────────────────────────────────────────

  const signIn = useCallback(async ({ adminId, password }) => {
    setIsLoading(true);
    // apiSignInAdmin calls apiClient which uses pf_access_token.
    // We intercept the result and re-store under admin-specific keys.
    const result = await apiSignInAdmin({ adminId, password });
    setIsLoading(false);

    if (!result.ok) return result;

    // apiSignInAdmin now persists the JWT under the admin-scoped keys directly
    // (apiClient derives the token scope from the request path), so customer
    // and employee sessions are never clobbered.
    setSession({ admin: result.admin, isAuthenticated: true });
    return result;
  }, []);

  // ── Sign Out ─────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    await apiSignOutAdmin();
    clearAdminTokens();
    setSession({ admin: null, isAuthenticated: false });
  }, []);

  // ── Refresh local session ─────────────────────────────────────────────────

  const refreshSession = useCallback(() => {
    const next = restoreSession();
    setSession(next);
    return next;
  }, []);

  // ── Profile update ─────────────────────────────────────────────────────────

  const updateProfile = useCallback(
    (patch) => {
      if (!admin) return { ok: false, error: "You need to sign in first." };
      const updated = { ...admin, ...patch };
      setSession({ admin: updated, isAuthenticated: true });
      return { ok: true, admin: updated };
    },
    [admin]
  );

  // ── RBAC helpers ──────────────────────────────────────────────────────────

  const isSuperAdmin = Boolean(
    admin && (admin.role === ADMIN_ROLES.SUPER_ADMIN || admin.roles?.includes("SUPER_ADMIN"))
  );

  const hasPermission = useCallback(
    (permission) => hasAdminPermission(admin, permission),
    [admin]
  );

  // ── Context value ─────────────────────────────────────────────────────────

  const value = useMemo(() => ({
    admin,
    isAuthenticated,
    isLoading,
    isSuperAdmin,
    hasPermission,
    signIn,
    signOut,
    refreshSession,
    updateProfile,
  }), [admin, isAuthenticated, isLoading, isSuperAdmin, hasPermission, signIn, signOut, refreshSession, updateProfile]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const inertAdminAuth = {
  admin: null,
  isAuthenticated: false,
  isLoading: false,
  isSuperAdmin: false,
  hasPermission:  () => false,
  signIn:         async () => ({ ok: false, error: "" }),
  signOut:        async () => {},
  refreshSession: () => ({ admin: null, isAuthenticated: false }),
  updateProfile:  () => ({ ok: false, error: "" }),
};

export function useAdminAuth() {
  return useContext(AdminAuthContext) ?? inertAdminAuth;
}

export default AdminAuthContext;
