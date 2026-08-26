/**
 * PRATIKSHYA FASHON — Customer Account Context (backend-authoritative).
 *
 * Every account read and write goes to the backend when the customer is
 * authenticated:
 *   GET    /customers/me           — on mount / user change
 *   PATCH  /customers/me           — updateProfile
 *   PATCH  /customers/me/preferences — updatePreferences
 *   GET    /customers/me/addresses — canonical address list after mutations
 *   POST   /customers/me/addresses — addAddress
 *   PATCH  /customers/me/addresses/{id}  — updateAddress
 *   DELETE /customers/me/addresses/{id}  — deleteAddress
 *   POST   /customers/me/addresses/{id}/default — setDefaultAddress
 *   POST   /customers/me/sessions/revoke-others — signOutOtherSessions
 *   POST   /auth/change-password   — changePassword (customer scope)
 *
 * Phase 4 rules:
 *   - No optimistic profile/preference updates: state changes only on a
 *     successful backend response, which becomes the canonical state.
 *   - No offline/local address fallback: addresses exist only as backend
 *     records. When unauthenticated, operations fail honestly.
 *   - Deleting the default address does NOT promote another default locally —
 *     the backend does not promote one either; the list is simply re-read.
 *   - The authenticated identity snapshot in AuthContext is refreshed only
 *     from the backend response, never from arbitrary form input.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import {
  apiGetMe,
  apiGetAddresses,
  apiUpdateProfile,
  apiUpdatePreferences,
  apiAddAddress,
  apiUpdateAddress,
  apiDeleteAddress,
  apiSetDefaultAddress,
  apiRevokeOtherSessions,
} from "../services/api/customersApi";
import { apiChangePasswordCustomer } from "../services/api/authApi";
import { getAccessToken } from "../services/api/apiClient";

const AccountContext = createContext(null);

const DEFAULT_PREFERENCES = {
  emailNotifications: true,
  smsNotifications:   true,
  promotionalUpdates: true,
  orderUpdates:       true,
  stylingInvitations: true,
};

const EMPTY_ACCOUNT = {
  profile: null,
  addresses: [],
  preferences: DEFAULT_PREFERENCES,
  security: { activeSessions: [] },
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AccountProvider({ children }) {
  const { user, updateUser } = useAuth();
  const [accountData, setAccountData] = useState(EMPTY_ACCOUNT);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [loadErrorStatus, setLoadErrorStatus] = useState(null);

  // When the authenticated user changes, fetch fresh data from the backend
  useEffect(() => {
    if (!user?.id) {
      setAccountData(EMPTY_ACCOUNT);
      setLoadError(null);
      setLoadErrorStatus(null);
      return undefined;
    }

    if (!getAccessToken("customer")) {
      setAccountData(EMPTY_ACCOUNT);
      setLoadError(null);
      setLoadErrorStatus(null);
      return undefined;
    }
    let cancelled = false;
    setIsLoading(true);
    apiGetMe().then((result) => {
      if (cancelled) return;
      setIsLoading(false);
      if (result.ok) {
        setAccountData({
          profile:     result.profile,
          addresses:   result.addresses,
          preferences: result.preferences,
          security:    result.security,
        });
        setLoadError(null);
        setLoadErrorStatus(null);
      } else {
        // A failed load is an error — never a fabricated empty account that
        // looks like "no addresses / default preferences".
        setLoadError(result.error ?? "Could not load your account.");
        setLoadErrorStatus(result.status ?? 0);
      }
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  /** Re-reads the canonical address list from the backend. */
  const refreshAddresses = useCallback(async () => {
    const result = await apiGetAddresses();
    if (result.ok) {
      setAccountData((current) => ({ ...current, addresses: result.addresses }));
      return { ok: true };
    }
    return { ok: false, error: result.error, status: result.status };
  }, []);

  // ── Profile ──────────────────────────────────────────────────────────────

  /**
   * PATCH /customers/me. No optimistic update — the canonical profile (and
   * the AuthContext identity snapshot) is set only from the server response.
   */
  const updateProfile = useCallback(async (newProfile) => {
    if (!getAccessToken("customer")) {
      return { ok: false, message: "You must be signed in to update your profile." };
    }
    const result = await apiUpdateProfile(newProfile);
    if (result.ok) {
      setAccountData((current) => ({ ...current, profile: result.profile }));
      // Refresh the identity snapshot from the SERVER response only.
      if (updateUser) updateUser(result.profile);
    }
    return result;
  }, [updateUser]);

  // ── Addresses (backend records only — no offline fallback) ───────────────

  const addAddress = useCallback(async (addressData) => {
    if (!getAccessToken("customer")) {
      return { ok: false, addressId: null, message: "You must be signed in to add an address." };
    }
    const result = await apiAddAddress(addressData);
    if (!result.ok) return { ok: false, addressId: null, message: result.error, status: result.status };
    const refreshed = await refreshAddresses();
    if (!refreshed.ok) {
      return { ok: false, addressId: result.address?.id, message: "Address saved, but your list could not be refreshed. Reload the page.", status: refreshed.status };
    }
    return { ok: true, addressId: result.address?.id, message: "Address added." };
  }, [refreshAddresses]);

  const updateAddress = useCallback(async (addressId, updatedFields) => {
    if (!getAccessToken("customer")) {
      return { ok: false, message: "You must be signed in to update an address." };
    }
    const result = await apiUpdateAddress(addressId, updatedFields);
    if (!result.ok) return { ok: false, message: result.error, status: result.status };
    const refreshed = await refreshAddresses();
    if (!refreshed.ok) {
      return { ok: false, message: "Address updated, but your list could not be refreshed. Reload the page.", status: refreshed.status };
    }
    return { ok: true, message: "Address updated." };
  }, [refreshAddresses]);

  const deleteAddress = useCallback(async (addressId) => {
    if (!getAccessToken("customer")) {
      return { ok: false, message: "You must be signed in to remove an address." };
    }
    const result = await apiDeleteAddress(addressId);
    if (!result.ok) return { ok: false, message: result.error, status: result.status };
    // No local default-promotion: the backend does not promote a new default
    // on delete, and the re-read list reflects exactly that.
    const refreshed = await refreshAddresses();
    if (!refreshed.ok) {
      return { ok: false, message: "Address removed, but your list could not be refreshed. Reload the page.", status: refreshed.status };
    }
    return { ok: true, message: "Address removed." };
  }, [refreshAddresses]);

  const setDefaultAddress = useCallback(async (addressId) => {
    if (!getAccessToken("customer")) {
      return { ok: false, message: "You must be signed in to change your default address." };
    }
    const result = await apiSetDefaultAddress(addressId);
    if (!result.ok) return { ok: false, message: result.error, status: result.status };
    const refreshed = await refreshAddresses();
    if (!refreshed.ok) {
      return { ok: false, message: "Default address updated, but your list could not be refreshed. Reload the page.", status: refreshed.status };
    }
    return { ok: true, message: "Default address updated." };
  }, [refreshAddresses]);

  // ── Preferences ──────────────────────────────────────────────────────────

  const updatePreferences = useCallback(async (newPreferences) => {
    if (!getAccessToken("customer")) {
      return { ok: false, message: "You must be signed in to save preferences." };
    }
    const result = await apiUpdatePreferences(newPreferences);
    if (result.ok) {
      setAccountData((current) => ({ ...current, preferences: result.preferences }));
    }
    return result;
  }, []);

  // ── Security ─────────────────────────────────────────────────────────────

  /**
   * POST /customers/me/sessions/revoke-others.
   *
   * Backend limitation (documented, Phase 4): the endpoint cannot identify
   * the calling session, so it revokes EVERY active session — including this
   * one. The honest result is "you are signed out everywhere"; the next
   * authenticated request will fail with 401 and the customer signs in again.
   */
  const signOutOtherSessions = useCallback(async () => {
    if (!getAccessToken("customer")) {
      return { ok: false, message: "You must be signed in to manage your sessions." };
    }
    const result = await apiRevokeOtherSessions();
    if (!result.ok) return { ok: false, message: result.error, status: result.status };
    setAccountData((current) => ({
      ...current,
      security: { activeSessions: [] },
    }));
    return {
      ok: true,
      message:
        "All sessions have been signed out, including this one. Please sign in again.",
    };
  }, []);

  /**
   * POST /auth/change-password (customer scope). Verifies the current
   * password server-side, then revokes every session and blacklists the
   * current token — success means the customer must sign in again.
   */
  const changePassword = useCallback(async ({ currentPassword, newPassword, confirmPassword }) => {
    if (!getAccessToken("customer")) {
      return { ok: false, message: "You must be signed in to change your password." };
    }
    const result = await apiChangePasswordCustomer({ currentPassword, newPassword, confirmPassword });
    if (result.ok) {
      setAccountData((current) => ({
        ...current,
        security: { activeSessions: [] },
      }));
    }
    return result;
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────

  const defaultAddress = useMemo(() => {
    const list = accountData.addresses || [];
    return list.find((a) => a.isDefault) || null;
  }, [accountData.addresses]);

  const value = useMemo(() => ({
    profile:            accountData.profile,
    addresses:          accountData.addresses,
    defaultAddress,
    preferences:        accountData.preferences,
    security:           accountData.security,
    isLoading,
    loadError,
    loadErrorStatus,
    updateProfile,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    updatePreferences,
    signOutOtherSessions,
    changePassword,
  }), [accountData, defaultAddress, isLoading, loadError, loadErrorStatus, updateProfile, addAddress, updateAddress, deleteAddress, setDefaultAddress, updatePreferences, signOutOtherSessions, changePassword]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    return {
      profile: null, addresses: [], defaultAddress: null,
      preferences: DEFAULT_PREFERENCES, security: { activeSessions: [] },
      isLoading: false,
      loadError: null,
      loadErrorStatus: null,
      updateProfile:        () => ({ ok: false, message: "" }),
      addAddress:           () => ({ ok: false, addressId: null, message: "" }),
      updateAddress:        () => ({ ok: false, message: "" }),
      deleteAddress:        () => ({ ok: false, message: "" }),
      setDefaultAddress:    () => ({ ok: false, message: "" }),
      updatePreferences:    () => ({ ok: false, message: "" }),
      signOutOtherSessions: () => ({ ok: false, message: "" }),
      changePassword:       () => ({ ok: false, message: "" }),
    };
  }
  return context;
}

export default AccountContext;
