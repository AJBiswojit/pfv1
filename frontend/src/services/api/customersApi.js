/**
 * PRATIKSHYA FASHON — Customers & Addresses API
 *
 * Maps to API_CONTRACT.md § USERS
 *
 * Endpoints:
 *   GET    /customers/me
 *   PATCH  /customers/me
 *   PATCH  /customers/me/preferences
 *   POST   /customers/me/sessions/revoke-others
 *   GET    /customers/me/addresses
 *   POST   /customers/me/addresses
 *   PATCH  /customers/me/addresses/{addressId}
 *   DELETE /customers/me/addresses/{addressId}
 *   POST   /customers/me/addresses/{addressId}/default
 *   GET    /admin/customers
 *   GET    /admin/customers/{customerId}
 */

import { apiClient, ApiError, handleError } from "./apiClient";

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/**
 * Backend returns snake_case (ProfileResponse uses camel serialization
 * aliases); the frontend reads both so no backend field is dropped.
 * Loyalty tier/points and membership year come from the backend response —
 * never defaulted to "STANDARD"/0/current-year when the server sent a value.
 */
function normaliseProfile(data) {
  if (!data) return null;
  const createdAt = data.created_at ?? data.createdAt ?? null;
  return {
    id:          data.id,
    firstName:   data.first_name  ?? data.firstName  ?? "",
    lastName:    data.last_name   ?? data.lastName   ?? "",
    email:       data.email       ?? "",
    phone:       data.phone       ?? "",
    status:      data.status      ?? null,
    dateOfBirth: data.date_of_birth ?? data.dateOfBirth ?? "",
    avatar:      data.avatar      ?? null,
    loyaltyTier:   data.loyalty_tier   ?? data.loyaltyTier   ?? "",
    loyaltyPoints: data.loyalty_points ?? data.loyaltyPoints ?? 0,
    // Admin views only: real order aggregates joined by the backend
    // (list + detail). Absent on the customer's own /customers/me payload.
    orderCount: data.order_count ?? data.orderCount ?? undefined,
    lifetimeSpend: data.lifetime_spend ?? data.lifetimeSpend ?? undefined,
    memberSince: createdAt
      ? new Date(createdAt).getFullYear().toString()
      : "",
    createdAt: createdAt ?? "",
  };
}

function normalisePreferences(p) {
  if (!p) return {
    emailNotifications:  true,
    smsNotifications:    true,
    promotionalUpdates:  true,
    orderUpdates:        true,
    stylingInvitations:  true,
  };
  return {
    emailNotifications:  p.email_notifications  ?? p.emailNotifications  ?? true,
    smsNotifications:    p.sms_notifications    ?? p.smsNotifications    ?? true,
    promotionalUpdates:  p.promotional_updates  ?? p.promotionalUpdates  ?? true,
    orderUpdates:        p.order_updates        ?? p.orderUpdates        ?? true,
    stylingInvitations:  p.styling_invitations  ?? p.stylingInvitations  ?? true,
  };
}

function normaliseAddress(a) {
  if (!a) return null;
  return {
    id:          a.id,
    fullName:    a.full_name    ?? a.fullName    ?? "",
    phone:       a.phone        ?? "",
    addressLine: a.address_line ?? a.addressLine ?? "",
    landmark:    a.landmark     ?? "",
    city:        a.city         ?? "",
    state:       a.state        ?? "",
    pincode:     a.pincode      ?? "",
    type:        a.type         ?? "Home",
    isDefault:   Boolean(a.is_default ?? a.isDefault),
  };
}

// ---------------------------------------------------------------------------
// Customer self-service
// ---------------------------------------------------------------------------

/**
 * GET /customers/me
 * Returns { profile, addresses, preferences, security }
 */
export async function apiGetMe() {
  try {
    const data = await apiClient.get("/customers/me", { scope: "customer" });
    return {
      ok: true,
      profile:     normaliseProfile(data.profile),
      addresses:   (data.addresses ?? []).map(normaliseAddress),
      preferences: normalisePreferences(data.preferences),
      security:    data.security ?? { activeSessions: [] },
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /customers/me
 * Backend schema uses camelCase aliases (firstName, lastName, dateOfBirth)
 */
export async function apiUpdateProfile(fields) {
  try {
    const body = {};
    if (fields.firstName   !== undefined) body.firstName   = fields.firstName;
    if (fields.lastName    !== undefined) body.lastName    = fields.lastName;
    if (fields.email       !== undefined) body.email       = fields.email;
    if (fields.phone       !== undefined) body.phone       = fields.phone;
    if (fields.dateOfBirth !== undefined) body.dateOfBirth = fields.dateOfBirth;
    if (fields.avatar      !== undefined) body.avatar      = fields.avatar;

    const data = await apiClient.patch("/customers/me", body, { scope: "customer" });
    return { ok: true, profile: normaliseProfile(data.profile ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /customers/me/preferences
 * Backend accepts camelCase aliases (emailNotifications, etc.)
 */
export async function apiUpdatePreferences(prefs) {
  try {
    const body = {};
    if (prefs.emailNotifications  !== undefined) body.emailNotifications  = prefs.emailNotifications;
    if (prefs.smsNotifications    !== undefined) body.smsNotifications    = prefs.smsNotifications;
    if (prefs.promotionalUpdates  !== undefined) body.promotionalUpdates  = prefs.promotionalUpdates;
    if (prefs.orderUpdates        !== undefined) body.orderUpdates        = prefs.orderUpdates;
    if (prefs.stylingInvitations  !== undefined) body.stylingInvitations  = prefs.stylingInvitations;

    const data = await apiClient.patch("/customers/me/preferences", body, { scope: "customer" });
    return { ok: true, preferences: normalisePreferences(data.preferences ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /customers/me/sessions/revoke-others
 */
export async function apiRevokeOtherSessions() {
  try {
    const data = await apiClient.post("/customers/me/sessions/revoke-others", {}, { scope: "customer" });
    return {
      ok: true,
      revokedCount: data.revoked_count ?? data.revokedCount ?? 0,
    };
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/**
 * GET /customers/me/addresses
 */
export async function apiGetAddresses() {
  try {
    const data = await apiClient.get("/customers/me/addresses", { scope: "customer" });
    const list = Array.isArray(data) ? data : (data.addresses ?? []);
    return { ok: true, addresses: list.map(normaliseAddress) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /customers/me/addresses
 * Backend accepts camelCase aliases: fullName, addressLine, isDefault, type
 */
export async function apiAddAddress(address) {
  try {
    const body = {
      fullName:    address.fullName,
      phone:       address.phone,
      addressLine: address.addressLine,
      landmark:    address.landmark || "",
      city:        address.city,
      state:       address.state,
      pincode:     address.pincode,
      type:        address.type || "Home",
      isDefault:   Boolean(address.isDefault),
    };
    const data = await apiClient.post("/customers/me/addresses", body, { scope: "customer" });
    return { ok: true, address: normaliseAddress(data.address ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PATCH /customers/me/addresses/{addressId}
 */
export async function apiUpdateAddress(addressId, fields) {
  try {
    const body = {};
    if (fields.fullName    !== undefined) body.fullName    = fields.fullName;
    if (fields.phone       !== undefined) body.phone       = fields.phone;
    if (fields.addressLine !== undefined) body.addressLine = fields.addressLine;
    if (fields.landmark    !== undefined) body.landmark    = fields.landmark;
    if (fields.city        !== undefined) body.city        = fields.city;
    if (fields.state       !== undefined) body.state       = fields.state;
    if (fields.pincode     !== undefined) body.pincode     = fields.pincode;
    if (fields.type        !== undefined) body.type        = fields.type;
    if (fields.isDefault   !== undefined) body.isDefault   = fields.isDefault;

    const data = await apiClient.patch(`/customers/me/addresses/${addressId}`, body, { scope: "customer" });
    return { ok: true, address: normaliseAddress(data.address ?? data) };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /customers/me/addresses/{addressId}
 */
export async function apiDeleteAddress(addressId) {
  try {
    await apiClient.delete(`/customers/me/addresses/${addressId}`, { scope: "customer" });
    return { ok: true };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /customers/me/addresses/{addressId}/default
 */
export async function apiSetDefaultAddress(addressId) {
  try {
    await apiClient.post(`/customers/me/addresses/${addressId}/default`, {}, { scope: "customer" });
    return { ok: true };
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Admin customer management
// ---------------------------------------------------------------------------

/**
 * GET /admin/customers?q=&page=&pageSize=
 */
export async function apiAdminListCustomers({ q, page = 1, pageSize = 20, scope = "admin" } = {}) {
  try {
    const params = new URLSearchParams({ page, pageSize });
    if (q) params.set("q", q);
    const data = await apiClient.get(`/admin/customers?${params}`, { scope });
    const list = (data.customers ?? data.items ?? data ?? []);
    return {
      ok:    true,
      items: list.map((c) => ({ ...normaliseProfile(c.profile ?? c), orderCount: c.order_count ?? 0, lifetimeSpend: c.lifetime_spend ?? 0 })),
      total: data.total ?? list.length,
    };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * GET /admin/customers/{customerId}
 */
export async function apiAdminGetCustomer(customerId, { scope = "admin" } = {}) {
  try {
    const data = await apiClient.get(`/admin/customers/${customerId}`, { scope });
    return {
      ok:         true,
      customer:   normaliseProfile(data.customer ?? data),
      addresses:  (data.customer?.addresses ?? data.addresses ?? []).map(normaliseAddress),
      orderCount: data.order_count ?? 0,
      lifetimeSpend: data.lifetime_spend ?? 0,
    };
  } catch (err) {
    return handleError(err);
  }
}
