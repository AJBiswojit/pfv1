/**
 * PRATIKSHYA FASHON — Employees API
 * Maps to API_CONTRACT.md § EMPLOYEE
 *
 * Admin: CRUD, status, reset-password, permissions, departments, sections, attendance
 * Employee self-service: /employee/me, /employee/attendance
 */
import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

function normEmployee(u) {
  if (!u) return u;
  const profile = u.profile ?? {};
  return {
    id:                 u.id,
    employeeId:         profile.employee_code ?? profile.employeeCode ?? u.employee_code ?? u.employeeId ?? u.id,
    firstName:          u.first_name  ?? u.firstName  ?? (u.full_name ?? "").split(" ")[0]  ?? "",
    lastName:           u.last_name   ?? u.lastName   ?? (u.full_name ?? "").split(" ").slice(1).join(" ") ?? "",
    fullName:           u.full_name   ?? u.fullName   ?? "",
    email:              u.email       ?? "",
    phone:              u.phone       ?? "",
    status:             u.status      ?? "ACTIVE",
    role:               (u.roles ?? [])[0] ?? u.role ?? "EMPLOYEE",
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
    const data = await apiClient.get(`/admin/employees?${qs}`);
    const items = (data.items ?? data.data ?? data ?? []).map((e) => normEmployee(e.data ?? e));
    return { ok: true, items, total: data.total ?? items.length };
  } catch (err) { return handleError(err); }
}

/** GET /admin/employees/{id} */
export async function apiAdminGetEmployee(id) {
  try {
    const data = await apiClient.get(`/admin/employees/${id}`);
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/employees */
export async function apiAdminCreateEmployee(body) {
  try {
    const data = await apiClient.post("/admin/employees", body);
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** PATCH /admin/employees/{id} */
export async function apiAdminUpdateEmployee(id, body) {
  try {
    const data = await apiClient.patch(`/admin/employees/${id}`, body);
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/employees/{id}/status  body: { status } */
export async function apiAdminUpdateEmployeeStatus(id, status) {
  try {
    const data = await apiClient.post(`/admin/employees/${id}/status`, { status });
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** POST /admin/employees/{id}/reset-password */
export async function apiAdminResetEmployeePassword(id, body = {}) {
  try {
    const data = await apiClient.post(`/admin/employees/${id}/reset-password`, body);
    return { ok: true, message: data.message ?? "Password reset." };
  } catch (err) { return handleError(err); }
}

/** PUT /admin/employees/{id}/permissions  body: { permissionMode, permissions } */
export async function apiAdminUpdateEmployeePermissions(id, { permissionMode, permissions }) {
  try {
    const data = await apiClient.put(`/admin/employees/${id}/permissions`, { permissionMode, permissions });
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** DELETE /admin/employees/{id} */
export async function apiAdminDeleteEmployee(id) {
  try {
    await apiClient.delete(`/admin/employees/${id}`);
    return { ok: true };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// ADMIN — Departments & Sections
// ===========================================================================

export async function apiAdminListDepartments() {
  try {
    const data = await apiClient.get("/admin/employees/departments");
    const items = data.data ?? data.items ?? data ?? [];
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

export async function apiAdminCreateDepartment(body) {
  try {
    const data = await apiClient.post("/admin/employees/departments", body);
    return { ok: true, department: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateDepartment(id, body) {
  try {
    const data = await apiClient.patch(`/admin/employees/departments/${id}`, body);
    return { ok: true, department: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminDeleteDepartment(id) {
  try {
    await apiClient.delete(`/admin/employees/departments/${id}`);
    return { ok: true };
  } catch (err) { return handleError(err); }
}

export async function apiAdminListSections(departmentId) {
  try {
    const qs = departmentId ? `?department_id=${departmentId}` : "";
    const data = await apiClient.get(`/admin/employees/sections${qs}`);
    const items = data.data ?? data.items ?? data ?? [];
    return { ok: true, items };
  } catch (err) { return handleError(err); }
}

export async function apiAdminCreateSection(body) {
  try {
    const data = await apiClient.post("/admin/employees/sections", body);
    return { ok: true, section: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateSection(id, body) {
  try {
    const data = await apiClient.patch(`/admin/employees/sections/${id}`, body);
    return { ok: true, section: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminDeleteSection(id) {
  try {
    await apiClient.delete(`/admin/employees/sections/${id}`);
    return { ok: true };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// ADMIN — Attendance
// ===========================================================================

export async function apiAdminGetEmployeeAttendance(employeeId, { page = 1, pageSize = 30 } = {}) {
  try {
    const data = await apiClient.get(`/admin/employees/${employeeId}/attendance?page=${page}&page_size=${pageSize}`);
    const items = data.items ?? data.data ?? data ?? [];
    return { ok: true, items, total: data.total ?? items.length };
  } catch (err) { return handleError(err); }
}

export async function apiAdminCreateAttendance(employeeId, body) {
  try {
    const data = await apiClient.post(`/admin/employees/${employeeId}/attendance`, { ...body, employee_id: employeeId });
    return { ok: true, record: data.data ?? data };
  } catch (err) { return handleError(err); }
}

export async function apiAdminUpdateAttendance(attendanceId, body) {
  try {
    const data = await apiClient.patch(`/admin/employees/attendance/${attendanceId}`, body);
    return { ok: true, record: data.data ?? data };
  } catch (err) { return handleError(err); }
}

// ===========================================================================
// EMPLOYEE SELF-SERVICE
// ===========================================================================

/** GET /employee/me */
export async function apiEmployeeGetMe() {
  try {
    const data = await apiClient.get("/employee/me");
    return { ok: true, employee: normEmployee(data.data ?? data) };
  } catch (err) { return handleError(err); }
}

/** GET /employee/me/assigned-products */
export async function apiEmployeeGetAssignedProducts() {
  try {
    const data = await apiClient.get("/employee/me/assigned-products");
    return { ok: true, items: data.data ?? data.items ?? [] };
  } catch (err) { return handleError(err); }
}
