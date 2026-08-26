/**
 * PRATIKSHYA FASHON — Customer Account Context (Phase B wired)
 *
 * Calls the real backend when authenticated:
 *   GET    /customers/me           — on mount / user change
 *   PATCH  /customers/me           — updateProfile
 *   PATCH  /customers/me/preferences — updatePreferences
 *   POST   /customers/me/addresses  — addAddress
 *   PATCH  /customers/me/addresses/{id}  — updateAddress
 *   DELETE /customers/me/addresses/{id}  — deleteAddress
 *   POST   /customers/me/addresses/{id}/default — setDefaultAddress
 *   POST   /customers/me/sessions/revoke-others — signOutOtherSessions
 *
 * Falls back to localStorage when not authenticated or when the API is
 * unreachable, so the demo mode still works.
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
import { INITIAL_DEMO_CUSTOMERS } from "../data/mockCustomers";
import { readStorage, writeStorage } from "../utils/shopping";
import {
  loadCustomerRegistry,
  saveCustomerRegistry,
} from "../services/customer/customerRegistry";
import {
  apiGetMe,
  apiUpdateProfile,
  apiUpdatePreferences,
  apiAddAddress,
  apiUpdateAddress,
  apiDeleteAddress,
  apiSetDefaultAddress,
  apiRevokeOtherSessions,
} from "../services/api/customersApi";
import { getAccessToken } from "../services/api/apiClient";

const ACCOUNT_STORAGE_PREFIX = "pratikshya_account_";

const AccountContext = createContext(null);

const DEFAULT_PREFERENCES = {
  emailNotifications: true,
  smsNotifications:   true,
  promotionalUpdates: true,
  orderUpdates:       true,
  stylingInvitations: true,
};

// ---------------------------------------------------------------------------
// Offline / localStorage fallback
// ---------------------------------------------------------------------------

const loadLocalAccountData = (customer) => {
  if (!customer?.id) {
    return { profile: null, addresses: [], preferences: DEFAULT_PREFERENCES, security: { activeSessions: [] } };
  }
  const stored = readStorage(`${ACCOUNT_STORAGE_PREFIX}${customer.id}`, null);
  if (stored && typeof stored === "object") {
    return {
      profile:     stored.profile     || customer,
      addresses:   Array.isArray(stored.addresses) ? stored.addresses : [],
      preferences: stored.preferences || DEFAULT_PREFERENCES,
      security:    stored.security    || { activeSessions: [] },
    };
  }
  const demoRecord = INITIAL_DEMO_CUSTOMERS.find((c) => c.id === customer.id);
  if (demoRecord) {
    return {
      profile: {
        id: demoRecord.id, firstName: demoRecord.firstName, lastName: demoRecord.lastName,
        email: demoRecord.email, phone: demoRecord.phone,
        dateOfBirth: demoRecord.dateOfBirth || "", avatar: demoRecord.avatar || null,
        memberSince: demoRecord.memberSince || "2025", createdAt: demoRecord.createdAt,
      },
      addresses:   demoRecord.addresses   || [],
      preferences: demoRecord.preferences || DEFAULT_PREFERENCES,
      security:    demoRecord.security    || { activeSessions: [] },
    };
  }
  return {
    profile:     customer,
    addresses:   [],
    preferences: DEFAULT_PREFERENCES,
    security: { activeSessions: [{ id: "sess-cur", device: "Current Browser & Device", location: "India", lastActive: "Active now", isCurrent: true }] },
  };
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AccountProvider({ children }) {
  const { user, updateUser } = useAuth();
  const [accountData, setAccountData] = useState(() => loadLocalAccountData(user));
  const [isLoading, setIsLoading] = useState(false);

  // When the authenticated user changes, fetch fresh data from the backend
  useEffect(() => {
    if (!user?.id) {
      setAccountData(loadLocalAccountData(null));
      return;
    }

    // If we have a real JWT, fetch from backend
    if (getAccessToken()) {
      setIsLoading(true);
      apiGetMe().then((result) => {
        setIsLoading(false);
        if (result.ok) {
          setAccountData({
            profile:     result.profile,
            addresses:   result.addresses,
            preferences: result.preferences,
            security:    result.security,
          });
        } else {
          // Backend unreachable — use localStorage fallback
          setAccountData(loadLocalAccountData(user));
        }
      });
    } else {
      setAccountData(loadLocalAccountData(user));
    }
  }, [user?.id]);

  // Keep localStorage in sync so offline / demo mode keeps working
  useEffect(() => {
    if (!user?.id) return;
    writeStorage(`${ACCOUNT_STORAGE_PREFIX}${user.id}`, accountData);

    const registry = loadCustomerRegistry();
    if (Array.isArray(registry)) {
      const updatedRegistry = registry.map((c) =>
        c.id === user.id
          ? {
              ...c,
              firstName:   accountData.profile?.firstName   || c.firstName,
              lastName:    accountData.profile?.lastName    || c.lastName,
              email:       accountData.profile?.email       || c.email,
              phone:       accountData.profile?.phone       || c.phone,
              dateOfBirth: accountData.profile?.dateOfBirth || c.dateOfBirth,
              avatar:      accountData.profile?.avatar      || c.avatar,
              addresses:   accountData.addresses,
              preferences: accountData.preferences,
            }
          : c
      );
      saveCustomerRegistry(updatedRegistry);
    }
  }, [user?.id, accountData]);

  // ── Profile ──────────────────────────────────────────────────────────────

  const updateProfile = useCallback(async (newProfile) => {
    // Optimistic update
    setAccountData((current) => ({ ...current, profile: { ...current.profile, ...newProfile } }));
    if (updateUser) updateUser(newProfile);

    if (getAccessToken()) {
      const result = await apiUpdateProfile(newProfile);
      if (result.ok) {
        setAccountData((current) => ({ ...current, profile: result.profile }));
        if (updateUser) updateUser(result.profile);
      }
      return result;
    }
    return { ok: true, message: "Profile updated (offline)." };
  }, [updateUser]);

  // ── Addresses ────────────────────────────────────────────────────────────

  const addAddress = useCallback(async (addressData) => {
    if (getAccessToken()) {
      const result = await apiAddAddress(addressData);
      if (result.ok) {
        // Refresh full profile to get updated address list with server-assigned ID
        const me = await apiGetMe();
        if (me.ok) {
          setAccountData((current) => ({ ...current, addresses: me.addresses }));
          return { ok: true, addressId: result.address?.id, message: "Address added." };
        }
      }
      return { ok: false, addressId: null, message: result.error };
    }

    // Offline fallback
    const id = `addr-${Date.now().toString(36)}`;
    setAccountData((current) => {
      const currentList = current.addresses || [];
      const makeDefault = addressData.isDefault || currentList.length === 0;
      const newAddress = { id, ...addressData, isDefault: makeDefault };
      const updatedList = makeDefault
        ? currentList.map((a) => ({ ...a, isDefault: false }))
        : [...currentList];
      return { ...current, addresses: [...updatedList, newAddress] };
    });
    return { ok: true, addressId: id, message: "Address added (offline)." };
  }, []);

  const updateAddress = useCallback(async (addressId, updatedFields) => {
    if (getAccessToken()) {
      const result = await apiUpdateAddress(addressId, updatedFields);
      if (result.ok) {
        const me = await apiGetMe();
        if (me.ok) setAccountData((current) => ({ ...current, addresses: me.addresses }));
        return { ok: true, message: "Address updated." };
      }
      return { ok: false, message: result.error };
    }

    setAccountData((current) => {
      const makeDefault = Boolean(updatedFields.isDefault);
      const nextList = current.addresses.map((addr) => {
        if (addr.id === addressId) return { ...addr, ...updatedFields, isDefault: makeDefault };
        if (makeDefault) return { ...addr, isDefault: false };
        return addr;
      });
      return { ...current, addresses: nextList };
    });
    return { ok: true, message: "Address updated (offline)." };
  }, []);

  const deleteAddress = useCallback(async (addressId) => {
    if (getAccessToken()) {
      const result = await apiDeleteAddress(addressId);
      if (result.ok) {
        setAccountData((current) => {
          const remaining = current.addresses.filter((a) => a.id !== addressId);
          const wasDefault = current.addresses.find((a) => a.id === addressId)?.isDefault;
          if (wasDefault && remaining.length > 0) remaining[0] = { ...remaining[0], isDefault: true };
          return { ...current, addresses: remaining };
        });
        return { ok: true, message: "Address removed." };
      }
      return { ok: false, message: result.error };
    }

    setAccountData((current) => {
      const remaining = current.addresses.filter((a) => a.id !== addressId);
      const wasDefault = current.addresses.find((a) => a.id === addressId)?.isDefault;
      if (wasDefault && remaining.length > 0) remaining[0] = { ...remaining[0], isDefault: true };
      return { ...current, addresses: remaining };
    });
    return { ok: true, message: "Address removed (offline)." };
  }, []);

  const setDefaultAddress = useCallback(async (addressId) => {
    if (getAccessToken()) {
      const result = await apiSetDefaultAddress(addressId);
      if (result.ok) {
        setAccountData((current) => ({
          ...current,
          addresses: current.addresses.map((a) => ({ ...a, isDefault: a.id === addressId })),
        }));
        return { ok: true, message: "Default address updated." };
      }
      return { ok: false, message: result.error };
    }

    setAccountData((current) => ({
      ...current,
      addresses: current.addresses.map((a) => ({ ...a, isDefault: a.id === addressId })),
    }));
    return { ok: true, message: "Default address updated (offline)." };
  }, []);

  // ── Preferences ──────────────────────────────────────────────────────────

  const updatePreferences = useCallback(async (newPreferences) => {
    setAccountData((current) => ({
      ...current,
      preferences: { ...current.preferences, ...newPreferences },
    }));

    if (getAccessToken()) {
      const result = await apiUpdatePreferences(newPreferences);
      if (result.ok) {
        setAccountData((current) => ({ ...current, preferences: result.preferences }));
      }
      return result;
    }
    return { ok: true, message: "Preferences saved (offline)." };
  }, []);

  // ── Security ─────────────────────────────────────────────────────────────

  const signOutOtherSessions = useCallback(async () => {
    if (getAccessToken()) {
      const result = await apiRevokeOtherSessions();
      if (result.ok) {
        setAccountData((current) => ({
          ...current,
          security: { activeSessions: (current.security?.activeSessions || []).filter((s) => s.isCurrent) },
        }));
        return { ok: true, message: "Signed out of all other devices." };
      }
      return { ok: false, message: result.error };
    }

    setAccountData((current) => ({
      ...current,
      security: { activeSessions: (current.security?.activeSessions || []).filter((s) => s.isCurrent) },
    }));
    return { ok: true, message: "Signed out of all other devices (offline)." };
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────

  const defaultAddress = useMemo(() => {
    const list = accountData.addresses || [];
    return list.find((a) => a.isDefault) || list[0] || null;
  }, [accountData.addresses]);

  const value = useMemo(() => ({
    profile:            accountData.profile,
    addresses:          accountData.addresses,
    defaultAddress,
    preferences:        accountData.preferences,
    security:           accountData.security,
    isLoading,
    updateProfile,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    updatePreferences,
    signOutOtherSessions,
  }), [accountData, defaultAddress, isLoading, updateProfile, addAddress, updateAddress, deleteAddress, setDefaultAddress, updatePreferences, signOutOtherSessions]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) {
    return {
      profile: null, addresses: [], defaultAddress: null,
      preferences: DEFAULT_PREFERENCES, security: { activeSessions: [] },
      isLoading: false,
      updateProfile:        () => ({ ok: false, message: "" }),
      addAddress:           () => ({ ok: false, addressId: null, message: "" }),
      updateAddress:        () => ({ ok: false, message: "" }),
      deleteAddress:        () => ({ ok: false, message: "" }),
      setDefaultAddress:    () => ({ ok: false, message: "" }),
      updatePreferences:    () => ({ ok: false, message: "" }),
      signOutOtherSessions: () => ({ ok: false, message: "" }),
    };
  }
  return context;
}

export default AccountContext;
