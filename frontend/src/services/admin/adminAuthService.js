/**
 * PRATIKSHYA FASHON — Admin session service.
 *
 *   AdminAuthContext → adminAuthService → mock admin identity   (now)
 *   AdminAuthContext → adminAuthService → admin API             (later)
 *
 * DEMO AUTHENTICATION. The credential fingerprint below is the same
 * non-cryptographic demo token the employee portal uses; it is not a hash
 * and must be replaced by a real backend before any production use.
 *
 * Credentials are stored in their own table and never written onto the
 * admin profile. Corrupted storage is treated as signed-out, never as a
 * crash.
 */

import { ADMIN_STATUS, canAdminSignIn, isAdminRole } from "../../config/adminAccess";
import { readStorage, writeStorage } from "../../utils/shopping";
import { ADMIN_STORAGE_KEYS } from "./storage";

const emptySession = () => ({ admin: null, isAuthenticated: false });

/** Profile shape — never carries a password or fingerprint. */
export const toPublicAdmin = (raw) => {
  if (!raw || typeof raw !== "object" || !raw.adminId) return null;
  return {
    id: String(raw.id || raw.adminId),
    adminId: String(raw.adminId).toUpperCase(),
    name: String(raw.name || "Administrator"),
    email: String(raw.email || "").toLowerCase(),
    phone: raw.phone || "",
    avatar: raw.avatar ?? null,
    role: isAdminRole(raw.role) ? raw.role : null,
    status: raw.status === ADMIN_STATUS.SUSPENDED ? ADMIN_STATUS.SUSPENDED : ADMIN_STATUS.ACTIVE,
    title: raw.title || "Business Operations",
    lastLogin: raw.lastLogin ?? null,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
};

export const loadAdmins = () => {
  /* Admin identities are backend-owned (POST /auth/admin/sign-in,
     GET /auth/me). The only record surfaced here is the current JWT
     session snapshot (used by the workflow UI to resolve the actor
     principal); there is no local admin register and no demo accounts. */
  try {
    const stored = readStorage(ADMIN_STORAGE_KEYS.AUTH, null);
    if (stored && typeof stored === "object" && stored.id) {
      return [{
        id: stored.id,
        adminId: stored.adminId ?? stored.id,
        name: stored.name ?? [stored.firstName, stored.lastName].filter(Boolean).join(" "),
        email: stored.email ?? "",
        role: stored.role ?? (stored.roles?.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : "ADMIN"),
        status: stored.status ?? "ACTIVE",
      }];
    }
  } catch { /* session missing */ }
  return [];
};

export const saveAdmins = (admins) => {
  writeStorage(
    ADMIN_STORAGE_KEYS.ADMINS,
    (Array.isArray(admins) ? admins : []).map(toPublicAdmin).filter(Boolean)
  );
};

/** Admin credentials are backend-owned; no local credential table. */
export const loadAdminCredentials = () => ({});

export const ensureAdminSeeded = () => loadAdmins();

/** Accepts either the admin ID or the admin email address. */
export const findAdmin = (admins, identifier) => {
  const value = String(identifier || "").trim().toLowerCase();
  if (!value) return null;
  return (
    admins.find(
      (admin) => admin.adminId.toLowerCase() === value || admin.email.toLowerCase() === value
    ) ?? null
  );
};

export const readAdminSessionRecord = () => {
  const stored = readStorage(ADMIN_STORAGE_KEYS.AUTH, null);
  if (!stored || typeof stored !== "object" || !stored.adminId) return null;
  return {
    adminId: String(stored.adminId),
    sessionAt: stored.sessionAt || Date.now(),
  };
};

export const writeAdminSessionRecord = (adminId) => {
  if (!adminId) {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(ADMIN_STORAGE_KEYS.AUTH);
      }
    } catch {
      // Persistence is an enhancement, never a dependency.
    }
    return;
  }
  writeStorage(ADMIN_STORAGE_KEYS.AUTH, { adminId, sessionAt: Date.now() });
};

export const restoreAdminSession = () => {
  ensureAdminSeeded();
  const record = readAdminSessionRecord();
  if (!record) return emptySession();

  const admin = findAdmin(loadAdmins(), record.adminId);
  if (!admin || !canAdminSignIn(admin.status)) {
    writeAdminSessionRecord(null);
    return emptySession();
  }
  return { admin, isAuthenticated: true };
};

export const markAdminLastLogin = (adminId, at = new Date().toISOString()) => {
  const admins = loadAdmins();
  const current = findAdmin(admins, adminId);
  if (!current) return null;
  const next = toPublicAdmin({ ...current, lastLogin: at });
  saveAdmins(admins.map((admin) => (admin.adminId === next.adminId ? next : admin)));
  return next;
};

/** Async — backend admin auth. Kept as the compatibility entry point for any
 * legacy caller; the AdminAuthContext uses authApi directly. */
export const verifyAdminCredentials = async (identifier, password) => {
  const { apiSignInAdmin } = await import("../api/authApi");
  const result = await apiSignInAdmin({ adminId: identifier, password });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, admin: result.admin, error: "" };
};

export const signInAdmin = async ({ adminId, password }) => {
  const result = await verifyAdminCredentials(adminId, password);
  if (!result.ok) return { ok: false, admin: null, error: result.error };
  try {
    writeAdminSessionRecord(result.admin.adminId ?? result.admin.id);
  } catch { /* non-fatal */ }
  return { ok: true, admin: result.admin, error: "" };
};

export const signOutAdmin = () => {
  writeAdminSessionRecord(null);
};

export const refreshAdminSession = () => restoreAdminSession();

/**
 * Safe profile edits only. Admin ID, role and status are deliberately not
 * editable through the profile surface.
 */
export const updateAdminProfile = (adminId, patch = {}) => {
  const admins = loadAdmins();
  const current = findAdmin(admins, adminId);
  if (!current) return { ok: false, error: "Administrator not found.", admin: null };

  const name = String(patch.name ?? current.name).trim();
  const email = String(patch.email ?? current.email).trim().toLowerCase();
  if (!name) return { ok: false, error: "Name is required.", admin: current };
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address.", admin: current };
  }

  const next = toPublicAdmin({
    ...current,
    name,
    email,
    phone: patch.phone ?? current.phone,
    title: patch.title ?? current.title,
  });
  saveAdmins(admins.map((admin) => (admin.adminId === next.adminId ? next : admin)));
  return { ok: true, admin: next, error: "" };
};

export default {
  toPublicAdmin,
  loadAdmins,
  saveAdmins,
  loadAdminCredentials,
  ensureAdminSeeded,
  findAdmin,
  readAdminSessionRecord,
  writeAdminSessionRecord,
  restoreAdminSession,
  markAdminLastLogin,
  verifyAdminCredentials,
  signInAdmin,
  signOutAdmin,
  refreshAdminSession,
  updateAdminProfile,
};
