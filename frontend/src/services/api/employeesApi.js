/**
 * PRATIKSHYA FASHON — Employees API
 * Maps to API_CONTRACT.md § EMPLOYEE
 *
 * Admin: CRUD, status, reset-password, permissions, departments, sections, attendance
 * Employee self-service: /employee/me, /employee/attendance
 */
import { apiClient, ApiError, getAccessToken, handleError } from "./apiClient";

/**
 * Session-scope resolution for the canonical account-management API.
 *
 * Admin-workspace actors call /admin/employees with the admin-scoped token.
 * SUPER_EMPLOYEE actors (Employee workspace) call the SAME endpoints with
 * their employee-scoped token — one API, one authorization matrix, enforced
 * server-side; the scope only selects which isolated token is attached.
 */
export const resolveAccountScope = () => {
  if (getAccessToken("admin")) return "admin";
  if (getAccessToken("employee")) return "employee";
  return "admin";
};

function normEmployee(u) {
  if (!u) return u;
  const profile = u.profile ?? {};
  return {
    id:                 u.id,
    employeeId:         profile.employee_code ?? profile.employeeCode ?? u.employee_code ?? u.employeeCode ?? u.employeeId ?? "",
    firstName:          u.first_name  ?? u.firstName  ?? (u.full_name ?? "").split(" ")[0]  ?? "",
    lastName:           u.last_name   ?? u.lastName   ?? (u.full_name ?? "").split(" ").slice(1).join(" ") ?? "",
    fullName:           u.full_name   ?? u.fullName   ?? "",
    email:              u.email       ?? "",
    phone:              u.phone       ?? "",
    status:             u.status      ?? "ACTIVE",
    role:               u.businessRole ?? u.business_role ?? (u.roles ?? [])[0] ?? u.role ?? "EMPLOYEE",
    accountLevel:       u.accountLevel ?? u.account_level ?? "EMPLOYEE",
    businessRole:       u.businessRole ?? u.business_role ?? null,
    permissionMode:     u.permissionMode ?? u.permission_mode ?? "role",
    department:         profile.department ?? u.department ?? "",
    designation:        profile.designation ?? u.designation ?? "",
    permissions:        u.permissions ?? [],
    mustChangePassword: Boolean(u.force_password_change ?? u.mustChangePassword ?? false),
    createdAt:          u.created_at  ?? u.createdAt ?? new Date().toISOString(),
    updatedAt:          u.updated_at  ?? u.updatedAt ?? new Date().toISOString(),
  };
}

// ===========================================================================
// ADMIN — Employee CRUD
// ===========================================================================

/** GET /admin/employees?page=&page_size=&search=&status=&department_id= */
export async function apiAdminListEmployees({ page = 1, pageSize = 20, search, status, departmentId } = {}) {
  try {
    const qs = new URLSearchParams({ page, page_size: Math.min(pageSize, 100) }); // backend caps at 100
    if (search)       qs.set("search", search);
    if (status)       qs.set("status", status);
    if (departmentId) qs.set("department_id", departmentId);
    const data = await apiClient.get(`/admin/employees?${qs}`, { scope: resolveAccountScope() });
    const items = (data.items ?? data.data ?? data ?? []).map((e) => normEmployee(e.data ?? e));
    return { ok: true, items, total: data.total ?? items.length };
  } catch (err) { return handleError(err); }
}

/** GET /admin/employees/{id} */
export async function apiAdminGetEmployee(id) {
  try {
    const data = await apiClient.get(`/admin/employees/${id}`, { scope: resolveAccountScope() });
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/employees */
export async function apiAdminCreateEmployee(body) {
  try {
    const data = await apiClient.post("/admin/employees", body, { scope: resolveAccountScope() });
    const payload = data.data ?? data;
    // The one-time temporary password surfaces here ONLY; it is never persisted client-side.
    return { ok: true, employee: normEmployee(payload), temporaryPassword: payload.temporaryPassword ?? null };
  } catch (err) { return handleError(err); }
}

/** PATCH /admin/employees/{id} */
export async function apiAdminUpdateEmployee(id, body) {
  try {
    const data = await apiClient.patch(`/admin/employees/${id}`, body, { scope: resolveAccountScope() });
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/employees/{id}/status  body: { status } */
export async function apiAdminUpdateEmployeeStatus(id, status) {
  try {
    const data = await apiClient.post(`/admin/employees/${id}/status`, { status }, { scope: resolveAccountScope() });
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/employees/{id}/reset-password */
export async function apiAdminResetEmployeePassword(id, body = {}) {
  try {
    const data = await apiClient.post(`/admin/employees/${id}/reset-password`, body, { scope: resolveAccountScope() });
    return {
      ok: true,
      message: data.message ?? "Password reset.",
      // Server returns the one-time value only here (data.data on the ApiResponse envelope).
      temporaryPassword: (data.data ?? {}).temporaryPassword ?? data.temporaryPassword ?? null,
    };
  } catch (err) { return handleError(err); }
}

/** PUT /admin/employees/{id}/permissions  body: { permissionMode, permissions } */
export async function apiAdminUpdateEmployeePermissions(id, { permissionMode, permissions }) {
  try {
    const data = await apiClient.put(`/admin/employees/${id}/permissions`, { permissionMode, permissions }, { scope: resolveAccountScope() });
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** DELETE /admin/employees/{id} */
export async function apiAdminDeleteEmployee(id) {
  try {
    await apiClient.delete(`/admin/employees/${id}`, { scope: resolveAccountScope() });
    return { ok: true };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// ADMIN — Departments & Sections
// ===========================================================================

export async function apiAdminListDepartments() {
  try {
    const data = await apiClient.get("/admin/employees/departments", { scope: resolveAccountScope() });
    const items = data.data ?? data.items ?? data ?? [];
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

export async function apiAdminCreateDepartment(body) {
  try {
    const data = await apiClient.post("/admin/employees/departments", body, { scope: resolveAccountScope() });
    return { ok: true, department: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateDepartment(id, body) {
  try {
    const data = await apiClient.patch(`/admin/employees/departments/${id}`, body, { scope: resolveAccountScope() });
    return { ok: true, department: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminDeleteDepartment(id) {
  try {
    await apiClient.delete(`/admin/employees/departments/${id}`, { scope: resolveAccountScope() });
    return { ok: true };
  } catch (err) { return handleError(err); }
}

export async function apiAdminListSections(departmentId) {
  try {
    const qs = departmentId ? `?department_id=${departmentId}` : "";
    const data = await apiClient.get(`/admin/employees/sections${qs}`, { scope: resolveAccountScope() });
    const items = data.data ?? data.items ?? data ?? [];
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

export async function apiAdminCreateSection(body) {
  try {
    const data = await apiClient.post("/admin/employees/sections", body, { scope: resolveAccountScope() });
    return { ok: true, section: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateSection(id, body) {
  try {
    const data = await apiClient.patch(`/admin/employees/sections/${id}`, body, { scope: resolveAccountScope() });
    return { ok: true, section: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminDeleteSection(id) {
  try {
    await apiClient.delete(`/admin/employees/sections/${id}`, { scope: resolveAccountScope() });
    return { ok: true };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// ADMIN — Attendance
// ===========================================================================

export async function apiAdminGetEmployeeAttendance(employeeId, { page = 1, pageSize = 30 } = {}) {
  try {
    const data = await apiClient.get(`/admin/employees/${employeeId}/attendance?page=${page}&page_size=${pageSize}`, { scope: resolveAccountScope() });
    const items = data.items ?? data.data ?? data ?? [];
    return { ok: true, items, total: data.total ?? items.length };
  } catch (err) { return handleError(err); }
}

export async function apiAdminCreateAttendance(employeeId, body) {
  try {
    const data = await apiClient.post(`/admin/employees/${employeeId}/attendance`, { ...body, employee_id: employeeId }, { scope: resolveAccountScope() });
    return { ok: true, record: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateAttendance(attendanceId, body) {
  try {
    const data = await apiClient.patch(`/admin/employees/attendance/${attendanceId}`, body, { scope: resolveAccountScope() });
    return { ok: true, record: data.data ?? data };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// EMPLOYEE SELF-SERVICE
// ===========================================================================

/** GET /employee/me */
export async function apiEmployeeGetMe() {
  try {
    const data = await apiClient.get("/employee/me", { scope: "employee" });
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** GET /employee/me/assigned-products — backend currently placeholder [] TODO product service (B-14) */
export async function apiEmployeeGetAssignedProducts() {
  try {
    const data = await apiClient.get("/employee/me/assigned-products", { scope: "employee" });
    // Backend verification 2026-09-09: employees.py returns {ok:true, data:[], message:"Assigned products endpoint — implementation pending product service."}
    // Treat placeholder as honest BACKEND_GAP so employee inbox does not silently show zero assigned when backend stub.
    const msg = (data.message ?? data.detail ?? "").toLowerCase();
    if (msg.includes("implementation pending") || msg.includes("placeholder")) {
      return { ok: false, code: "BACKEND_GAP", message: data.message ?? "Assigned-products pending product service (B-14)", items: [] };
    }
    return { ok: true, items: data.data ?? data.items ?? [] };
  } catch (err) { return handleError(err); }
}
