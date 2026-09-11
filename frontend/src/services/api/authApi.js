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

import { apiClient, ApiError, clearTokens, handleError, setTokens } from "./apiClient";

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
  const profile = dto.profile ?? {};
  return {
    id:                 dto.id,
    ...splitName(dto.full_name ?? dto.fullName),
    email:              dto.email ?? "",
    phone:              dto.phone ?? "",
    // The UI/backend workflow contract expects the employee code here, not a user UUID.
    employeeId:         dto.employee_code ?? dto.employeeCode ?? profile.employee_code ?? profile.employeeCode ?? "",
    role:               dto.businessRole ?? dto.business_role ?? dto.roles?.[0] ?? dto.role ?? "EMPLOYEE",
    roles:              dto.roles ?? [],
    // Backend-resolved: legacy granular codes ∪ canonical capability codes.
    permissions:        dto.permissions ?? [],
    accountLevel:       dto.accountLevel ?? dto.account_level ?? "EMPLOYEE",
    businessRole:       dto.businessRole ?? dto.business_role ?? null,
    workspace:          dto.workspace ?? "employee",
    status:             dto.status ?? "ACTIVE",
    mustChangePassword: Boolean(dto.force_password_change ?? dto.mustChangePassword),
    // employee_profile extras if present
    department:         dto.department ?? profile.department ?? "",
    designation:        dto.designation ?? profile.designation ?? "",
  };
}

function toAdminProfile(dto) {
  // Prefer a human-readable admin code if the backend provides one;
  // fall back to the UUID so the workflow principal resolver can match
  // against whichever identifier is stored in the admin register.
  const adminId = dto.admin_code ?? dto.adminId ?? dto.id;
  const accountLevel =
    dto.accountLevel ?? dto.account_level ??
    (dto.roles?.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : "ADMIN");
  return {
    id:          dto.id,
    ...splitName(dto.full_name),
    email:       dto.email ?? "",
    phone:       dto.phone ?? "",
    adminId:     adminId,
    // Expose the raw UUID separately so resolvePrincipal can match
    // JWT-authenticated sessions that don't have a legacy admin code.
    _uuid:       dto.id,
    role:        accountLevel === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN",
    roles:       dto.roles ?? [],
    // Backend-resolved: legacy granular codes ∪ canonical capability codes.
    permissions: dto.permissions ?? [],
    accountLevel,
    businessRole: dto.businessRole ?? dto.business_role ?? null,
    workspace:    dto.workspace ?? "admin",
    status:      dto.status ?? "ACTIVE",
  };
}

function storeTokensFromResponse(data, scope = "customer") {
  setTokens({
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
  }, scope);
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
    }, { scope: "none" });

    storeTokensFromResponse(data, "customer");
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
    }, { scope: "none" });

    storeTokensFromResponse(data, "customer");
    const profile = toCustomerProfile(data.user ?? {});
    return { ok: true, user: profile };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiSignOutCustomer() {
  try {
    await apiClient.post("/auth/customer/sign-out", {}, { scope: "customer" });
  } catch { /* best-effort */ }
  clearTokens("customer");
  return { ok: true };
}

export async function apiForgotPasswordCustomer(identifier) {
  try {
    const data = await apiClient.post("/auth/customer/forgot-password", { identifier }, { scope: "none" });
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
    }, { scope: "none" });
    return { ok: true };
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /auth/change-password (customer scope).
 * The backend verifies the current password, revokes every session and
 * blacklists the current access token — after success the customer must
 * sign in again. Surface the backend's own rejection messages.
 */
export async function apiChangePasswordCustomer({ currentPassword, newPassword, confirmPassword }) {
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  try {
    const data = await apiClient.post("/auth/change-password", {
      currentPassword,
      newPassword,
      confirmPassword,
    }, { scope: "customer" });
    return { ok: true, message: data.message ?? "Password updated successfully." };
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
    }, { scope: "none" });

    storeTokensFromResponse(data, "employee");
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
    }, { scope: "employee" });
    return { ok: true };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiSignOutEmployee() {
  try {
    await apiClient.post("/auth/employee/sign-out", {}, { scope: "employee" });
  } catch { /* best-effort */ }
  clearTokens("employee");
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
    }, { scope: "none" });

    storeTokensFromResponse(data, "admin");
    const profile = toAdminProfile(data.admin ?? data.user ?? {});
    return { ok: true, admin: profile };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiSignOutAdmin() {
  try {
    await apiClient.post("/auth/admin/sign-out", {}, { scope: "admin" });
  } catch { /* best-effort */ }
  clearTokens("admin");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// UNIFIED STAFF SIGN-IN — one login experience for all four account levels
// (the /login page). The backend resolves the account level from the
// credential; this layer only stores the token under the scope the account
// level belongs to and hands the workspace decision to the caller.
// ---------------------------------------------------------------------------

/**
 * POST /auth/staff/sign-in
 * identifier may be an email, a phone or a PF employee code.
 * Returns { ok, accountLevel, workspace, admin?, employee? }.
 * Tokens are stored under the workspace's isolated scope so admin and
 * employee sessions never clobber each other (or the customer session).
 */
export async function apiSignInStaff({ identifier, password }) {
  try {
    const data = await apiClient.post("/auth/staff/sign-in", {
      identifier,
      password,
    }, { scope: "none" });

    const dto = data.admin ?? data.employee ?? data.user ?? {};
    const workspace = dto.workspace ?? (data.admin ? "admin" : "employee");
    const accountLevel = dto.accountLevel ?? dto.account_level ?? null;
    if (workspace === "admin" && dto.user_type && dto.user_type !== "admin") {
      return { ok: false, error: "Admin authentication privileges required." };
    }
    if (workspace === "employee" && dto.user_type && dto.user_type !== "employee") {
      return { ok: false, error: "Employee authentication required." };
    }

    const scope = workspace === "admin" ? "admin" : "employee";
    storeTokensFromResponse(data, scope);

    if (scope === "admin") {
      return { ok: true, workspace, accountLevel, admin: toAdminProfile(dto) };
    }
    const employee = toEmployeeProfile(dto);
    employee.mustChangePassword = Boolean(data.mustChangePassword ?? data.force_password_change ?? employee.mustChangePassword);
    return { ok: true, workspace, accountLevel, employee };
  } catch (err) {
    return handleError(err);
  }
}

/** Sign out every staff scope (used by the shared /auth/logout surface). */
export async function apiSignOutStaff() {
  try {
    await apiClient.post("/auth/logout", {}, { scope: "admin" });
  } catch { /* best-effort */ }
  clearTokens("admin");
  try {
    await apiClient.post("/auth/logout", {}, { scope: "employee" });
  } catch { /* best-effort */ }
  clearTokens("employee");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Shared — /auth/me (get current session profile)
// ---------------------------------------------------------------------------

export async function apiGetMe(scope) {
  try {
    const dto = await apiClient.get("/auth/me", { scope });
    return { ok: true, dto };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiRestoreCustomerSession() {
  try {
    // The customer profile endpoint validates both the token and the existence
    // of the customer profile row. A token alone is never considered a session.
    const data = await apiClient.get("/customers/me", { scope: "customer" });
    const profile = toCustomerProfile(data.profile ?? data.user ?? data);
    if (!profile.id) return { ok: false, error: "Customer profile is missing." };
    return { ok: true, user: profile };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiRestoreAdminSession() {
  try {
    const dto = await apiClient.get("/auth/me", { scope: "admin" });
    if (dto.user_type !== "admin") {
      return { ok: false, error: "Admin authentication privileges required." };
    }
    return { ok: true, admin: toAdminProfile(dto) };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiRestoreEmployeeSession() {
  try {
    // /employee/me validates that the authenticated user is an employee and
    // that a real employee profile exists, then returns the employee code.
    const data = await apiClient.get("/employee/me", { scope: "employee" });
    const employee = toEmployeeProfile(data.data ?? data.employee ?? data);
    if (!employee.id || !employee.employeeId) {
      return { ok: false, error: "Employee profile is missing." };
    }
    return { ok: true, employee };
  } catch (err) {
    return handleError(err);
  }
}
