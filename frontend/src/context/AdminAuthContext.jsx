/**
 * PRATIKSHYA FASHON — Admin workspace session context.
 *
 * UNIFIED AUTHENTICATION (2026-09): all four staff account levels sign in
 * through the ONE /login page → POST /auth/staff/sign-in. This context owns
 * the ADMIN-workspace session only (SUPER_ADMIN + ADMIN levels); it is the
 * scope store for the separate admin portal, not a second authentication
 * flow — authentication itself lives in authApi/apiClient.
 *
 * Token isolation: admin JWT is stored under SEPARATE localStorage keys
 * ("pf_admin_access_token" / "pf_admin_refresh_token") so admin sign-in
 * never clobbers a customer or employee session (portal isolation).
 *
 * Session persistence:
 *   - JWT tokens → localStorage "pf_admin_access_token" / "pf_admin_refresh_token"
 *   - Admin profile snapshot → localStorage "pratikshya_admin_auth"
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { hasAdminPermission, isAdminAccount } from "../config/adminAccess";
import { ACCOUNT_LEVELS } from "../config/rbacModel";
import {
  apiSignInStaff,
  apiSignOutAdmin,
  apiRestoreAdminSession,
} from "../services/api/authApi";
import { writeStorage } from "../utils/shopping";
import { clearTokens, getAccessToken } from "../services/api/apiClient";

const AdminAuthContext = createContext(null);

const ADMIN_SESSION_KEY         = "pratikshya_admin_auth";
export const ADMIN_ACCESS_TOKEN_KEY  = "pf_admin_access_token";
export const ADMIN_REFRESH_TOKEN_KEY = "pf_admin_refresh_token";

// Token helpers specific to the admin surface
export const getAdminAccessToken = () => getAccessToken("admin");

const clearAdminTokens = () => clearTokens("admin");

// ---------------------------------------------------------------------------
// Session restore
// ---------------------------------------------------------------------------

function hasStoredAdminToken() {
  return Boolean(getAdminAccessToken());
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState({ admin: null, isAuthenticated: false });
  const [isLoading, setIsLoading] = useState(hasStoredAdminToken);

  const admin           = session.admin;
  const isAuthenticated = Boolean(session.isAuthenticated && admin);

  // Validate any stored admin token with the backend before marking the admin
  // surface authenticated. Local snapshots are cache only, not authority.
  useEffect(() => {
    let cancelled = false;
    if (!hasStoredAdminToken()) {
      setIsLoading(false);
      return () => { cancelled = true; };
    }

    setIsLoading(true);
    apiRestoreAdminSession().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setSession({ admin: result.admin, isAuthenticated: true });
      } else {
        clearAdminTokens();
        setSession({ admin: null, isAuthenticated: false });
        try { window.localStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
      }
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  // Persist admin profile snapshot
  useEffect(() => {
    if (admin?.id) {
      writeStorage(ADMIN_SESSION_KEY, admin);
    } else {
      try { window.localStorage.removeItem(ADMIN_SESSION_KEY); } catch { /* ignore */ }
    }
  }, [admin]);

  // Listen for scope-specific token expiry events from apiClient.
  useEffect(() => {
    const handleExpiry = (event) => {
      if (event?.detail?.scope !== "admin") return;
      clearAdminTokens();
      setSession({ admin: null, isAuthenticated: false });
    };
    window.addEventListener("pf:session-expired", handleExpiry);
    return () => window.removeEventListener("pf:session-expired", handleExpiry);
  }, []);

  // ── Sign In ──────────────────────────────────────────────────────────────

  const signIn = useCallback(async ({ adminId, password }) => {
    setIsLoading(true);
    // Canonical flow: the unified /auth/staff/sign-in endpoint authenticates
    // the credential and the backend determines the account level. An
    // employee-domain credential never opens the admin session — the token is
    // not stored and a plain guidance error is returned instead.
    const result = await apiSignInStaff({ identifier: adminId, password });
    setIsLoading(false);

    if (!result.ok) return result;
    if (result.workspace !== "admin" || !isAdminAccount(result.admin)) {
      // The unified endpoint issued an employee-workspace session for this
      // credential — drop the token it stored and refuse the admin entry.
      clearTokens("employee");
      return {
        ok: false,
        error: "Employee credentials do not open the Admin Portal. Sign in from the unified /login page.",
      };
    }

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

  const refreshSession = useCallback(async () => {
    if (!hasStoredAdminToken()) {
      const empty = { admin: null, isAuthenticated: false };
      setSession(empty);
      return empty;
    }
    const result = await apiRestoreAdminSession();
    const next = result.ok
      ? { admin: result.admin, isAuthenticated: true }
      : { admin: null, isAuthenticated: false };
    if (!result.ok) clearAdminTokens();
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
    admin && (
      admin.accountLevel === ACCOUNT_LEVELS.SUPER_ADMIN ||
      (!admin.accountLevel && admin.roles?.includes("SUPER_ADMIN"))
    )
  );
  // Any admin-workspace level may enter the portal (SUPER_ADMIN or ADMIN);
  // per-module access is capability-checked, never workspace-wide.
  const hasAdminWorkspaceAccess = Boolean(admin && (
    admin.accountLevel
      ? admin.accountLevel === ACCOUNT_LEVELS.SUPER_ADMIN || admin.accountLevel === ACCOUNT_LEVELS.ADMIN
      : admin.role === ACCOUNT_LEVELS.SUPER_ADMIN
  ));

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
    hasAdminWorkspaceAccess,
    hasPermission,
    signIn,
    signOut,
    refreshSession,
    updateProfile,
  }), [admin, isAuthenticated, isLoading, isSuperAdmin, hasAdminWorkspaceAccess, hasPermission, signIn, signOut, refreshSession, updateProfile]);

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
  hasAdminWorkspaceAccess: false,
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
