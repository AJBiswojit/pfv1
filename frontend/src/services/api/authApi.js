/**
 * PRATIKSHYA FASHON — Auth API wrappers.
 *
 * Thin adapters between the three auth contexts and the FastAPI endpoints.
 * Each function returns a normalised { ok, ...data } or { ok: false, error }.
 *
 * URL reference (backend app/api/v1/auth.py):
 *   POST /auth/customer/sign-up
 *   POST /auth/customer/sign-in
 *   POST /auth/customer/sign-out
 *   POST /auth/customer/forgot-password
 *   POST /auth/customer/reset-password
 *   POST /auth/employee/sign-in
 *   POST /auth/employee/change-password
 *   POST /auth/employee/sign-out
 *   POST /auth/admin/sign-in
 *   POST /auth/admin/sign-up
 *   POST /auth/admin/sign-out
 *   POST /auth/refresh
 *   GET  /auth/me
 */

import { apiClient, ApiError, clearTokens, setTokens } from "./apiClient";

// ---------------------------------------------------------------------------
// Response normalisers
// ---------------------------------------------------------------------------

/**
 * Backend returns full_name; frontend uses firstName + lastName.
 * Split naively on the first space — handles "Asha Patel" → {firstName:"Asha", lastName:"Patel"}
 */
function splitName(fullName = "") {
  const parts = (fullName ?? "").trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName:  parts.slice(1).join(" "),
  };
}

function toCustomerProfile(dto) {
  // Backend may return either full_name (UserDTO) or first_name/last_name (profile endpoints)
  const names = dto.first_name
    ? { firstName: dto.first_name ?? "", lastName: dto.last_name ?? "" }
    : splitName(dto.full_name);

  return {
    id:          dto.id,
    ...names,
    email:       dto.email ?? "",
    phone:       dto.phone ?? "",
    avatar:      null,
    memberSince: new Date().getFullYear().toString(),
    createdAt:   new Date().toISOString(),
    roles:       dto.roles ?? [],
    permissions: dto.permissions ?? [],
  };
}

function toEmployeeProfile(dto) {
  return {
    id:                 dto.id,
    ...splitName(dto.full_name),
    email:              dto.email ?? "",
    phone:              dto.phone ?? "",
    employeeId:         dto.employee_code ?? dto.id,
    role:               dto.roles?.[0] ?? "EMPLOYEE",
    permissions:        dto.permissions ?? [],
    status:             dto.status ?? "ACTIVE",
    mustChangePassword: Boolean(dto.force_password_change),
    // employee_profile extras if present
    department:         dto.department ?? "",
    designation:        dto.designation ?? "",
  };
}

function toAdminProfile(dto) {
  // Prefer a human-readable admin code if the backend provides one;
  // fall back to the UUID so the workflow principal resolver can match
  // against whichever identifier is stored in the admin register.
  const adminId = dto.admin_code ?? dto.adminId ?? dto.id;
  return {
    id:          dto.id,
    ...splitName(dto.full_name),
    email:       dto.email ?? "",
    phone:       dto.phone ?? "",
    adminId:     adminId,
    // Expose the raw UUID separately so resolvePrincipal can match
    // JWT-authenticated sessions that don't have a legacy admin code.
    _uuid:       dto.id,
    role:        dto.roles?.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : (dto.roles?.[0] ?? "ADMIN"),
    roles:       dto.roles ?? [],
    permissions: dto.permissions ?? [],
    status:      dto.status ?? "ACTIVE",
  };
}

function storeTokensFromResponse(data) {
  setTokens({
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
  });
}

function handleError(err) {
  if (err instanceof ApiError) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: "An unexpected error occurred." };
}

// ---------------------------------------------------------------------------
// Customer Auth
// ---------------------------------------------------------------------------

export async function apiSignUpCustomer({ firstName, lastName, email, phone, password, dateOfBirth }) {
  try {
    const data = await apiClient.post("/auth/customer/sign-up", {
      // Send both camelCase (spec) and full_name (backward compat) — backend accepts either
      firstName,
      lastName,
      full_name:     `${firstName} ${lastName}`.trim(),
      email,
      phone:         phone || undefined,
      password,
      date_of_birth: dateOfBirth || undefined,
      dateOfBirth:   dateOfBirth || undefined,
    }, { skipAuth: true });

    storeTokensFromResponse(data);
    const profile = toCustomerProfile(data.user ?? data.employee ?? data.admin ?? {});
    return { ok: true, user: profile };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiSignInCustomer({ identifier, password }) {
  try {
    const data = await apiClient.post("/auth/customer/sign-in", {
      identifier,
      password,
    }, { skipAuth: true });

    storeTokensFromResponse(data);
    const profile = toCustomerProfile(data.user ?? {});
    return { ok: true, user: profile };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiSignOutCustomer() {
  try {
    await apiClient.post("/auth/customer/sign-out", {});
  } catch { /* best-effort */ }
  clearTokens();
  return { ok: true };
}

export async function apiForgotPasswordCustomer(identifier) {
  try {
    const data = await apiClient.post("/auth/customer/forgot-password", { identifier }, { skipAuth: true });
    return { ok: true, message: data.message ?? "Instructions sent." };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiResetPasswordCustomer({ userId, token, newPassword, confirmPassword }) {
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  try {
    await apiClient.post("/auth/customer/reset-password", {
      userId,
      token,
      newPassword,
      confirmPassword,
    }, { skipAuth: true });
    return { ok: true };
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// Employee Auth
// ---------------------------------------------------------------------------

export async function apiSignInEmployee({ employeeId, password }) {
  try {
    const data = await apiClient.post("/auth/employee/sign-in", {
      employeeId,
      password,
    }, { skipAuth: true });

    storeTokensFromResponse(data);
    const profile = toEmployeeProfile(data.employee ?? data.user ?? {});
    // Merge force_password_change from top-level response
    profile.mustChangePassword = Boolean(data.mustChangePassword ?? data.force_password_change ?? profile.mustChangePassword);
    return { ok: true, employee: profile };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiChangePasswordEmployee({ currentPassword, newPassword, confirmPassword }) {
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  try {
    await apiClient.post("/auth/employee/change-password", {
      old_password:     currentPassword,
      new_password:     newPassword,
      confirm_password: confirmPassword,
    });
    return { ok: true };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiSignOutEmployee() {
  try {
    await apiClient.post("/auth/employee/sign-out", {});
  } catch { /* best-effort */ }
  clearTokens();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin Auth
// ---------------------------------------------------------------------------

export async function apiSignInAdmin({ adminId, password }) {
  try {
    const data = await apiClient.post("/auth/admin/sign-in", {
      adminId,
      password,
    }, { skipAuth: true });

    storeTokensFromResponse(data);
    const profile = toAdminProfile(data.admin ?? data.user ?? {});
    return { ok: true, admin: profile };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiSignOutAdmin() {
  try {
    await apiClient.post("/auth/admin/sign-out", {});
  } catch { /* best-effort */ }
  clearTokens();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Shared — /auth/me (get current session profile)
// ---------------------------------------------------------------------------

export async function apiGetMe() {
  try {
    const dto = await apiClient.get("/auth/me");
    return { ok: true, dto };
  } catch (err) {
    return handleError(err);
  }
}
