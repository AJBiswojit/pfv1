/**
 * PRATIKSHYA FASHON — Employee management service.
 *
 * The seam the future Admin Portal will consume:
 *
 *   EmployeeManagementContext → employeeService → mock storage   (now)
 *   Admin Portal              → employeeService → employee API   (later)
 *
 * Credentials are isolated from the profile. Passwords are never written
 * onto the employee record and are never returned by list/get methods.
 */

import { getDefaultPermissions, isKnownRole } from "../../config/employeeRoles";
import {
  EMPLOYEE_STATUS,
  EMPLOYEE_STATUSES,
  canEmployeeLogin,
  getEmployeeStatus,
} from "../../config/employeeStatus";
import {
  isEmployeeAccountPermission,
  sanitizeEmployeePermissions,
} from "../../config/employeePermissions";
import { authorizeEmployeeManagement } from "../admin/adminAuthorization";
import { isValidEmail, isValidPhone } from "../../utils/validation";
import { employeeFullName } from "../../utils/employee";
import { EMPLOYEE_STORAGE_KEYS } from "./storage";
import { generateEmployeeId, isValidEmployeeId, normaliseEmployeeId } from "./employeeId";
import { validateEmployeePassword } from "./employeePassword";

const PROFILE_FIELDS = [
  "id",
  "employeeId",
  "firstName",
  "lastName",
  "email",
  "phone",
  "avatar",
  "role",
  "department",
  "section",
  "store",
  "joiningDate",
  "status",
  "permissions",
  "permissionMode",
  "mustChangePassword",
  "lastLogin",
  "createdAt",
  "updatedAt",
  "shift",
];

const stripUnknown = (record) => {
  if (!record || typeof record !== "object") return null;
  const next = {};
  PROFILE_FIELDS.forEach((field) => {
    if (field in record) next[field] = record[field];
  });
  return next;
};

export const toPublicEmployee = (record) => {
  const cleaned = stripUnknown(record);
  if (!cleaned || !cleaned.employeeId) return null;

  const permissionMode = cleaned.permissionMode === "custom" ? "custom" : "role";
  const permissions = sanitizeEmployeePermissions(
    permissionMode === "role"
      ? getDefaultPermissions(cleaned.role)
      : Array.isArray(cleaned.permissions)
        ? cleaned.permissions
        : getDefaultPermissions(cleaned.role)
  );

  return {
    id: String(cleaned.id || cleaned.employeeId),
    employeeId: normaliseEmployeeId(cleaned.employeeId),
    firstName: String(cleaned.firstName || "").trim(),
    lastName: String(cleaned.lastName || "").trim(),
    email: String(cleaned.email || "").trim().toLowerCase(),
    phone: String(cleaned.phone || "").trim(),
    avatar: cleaned.avatar || null,
    role: cleaned.role,
    department: cleaned.department,
    section: cleaned.section || "",
    store: cleaned.store || "",
    joiningDate: cleaned.joiningDate || "",
    status: cleaned.status || EMPLOYEE_STATUS.PENDING,
    permissions,
    permissionMode,
    mustChangePassword: Boolean(cleaned.mustChangePassword),
    lastLogin: cleaned.lastLogin || null,
    createdAt: cleaned.createdAt || new Date().toISOString(),
    updatedAt: cleaned.updatedAt || cleaned.createdAt || new Date().toISOString(),
    shift: cleaned.shift || "Morning · 10:00 – 19:00",
  };
};

/**
 * Admin/Employee boundary — the employee repository holds employees only.
 * Admin identities (SUPER_ADMIN, PF-ADM-…) live in the isolated admin
 * account store and authenticate at /admin/login. Any admin record found
 * in employee storage (e.g. from an older seed) is dropped on read, so an
 * admin can never appear in the Employee Directory, demo logins or any
 * employee selector.
 */
export const isAdminIdentity = (employee) =>
  ["ADMIN", "SUPER_ADMIN"].includes(String(employee?.role || "").toUpperCase()) ||
  String(employee?.employeeId || "").startsWith("PF-ADM-");

export const normaliseEmployees = (raw) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const list = [];
  raw.forEach((entry) => {
    const employee = toPublicEmployee(entry);
    if (!employee || seen.has(employee.employeeId)) return;
    if (isAdminIdentity(employee)) return;
    if ("password" in (entry || {}) || "temporaryPassword" in (entry || {})) {
      // Drop any leaked credential fields from corrupt storage.
    }
    seen.add(employee.employeeId);
    list.push(employee);
  });
  return list;
};

/* ------------------------------------------------------------------ */
/* Server-backed employee cache — no seeds, no demo credentials       */
/* ------------------------------------------------------------------ */

let serverEmployees = [];

/** Replace the session cache with backend records. */
export const replaceServerEmployees = (employees) => {
  serverEmployees = Array.isArray(employees) ? employees.map((record) => ({ ...record })) : [];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EMPLOYEES_CHANGED_EVENT));
  }
  return serverEmployees;
};

/** Current server-backed cache. */
export const getServerEmployees = () => serverEmployees;

/**
 * Fetches backend employees (GET /admin/employees) and populates the
 * session cache. Failed fetches return the error — no seed fallback.
 */
export const syncEmployeesFromBackend = async () => {
  const { getAccessToken } = await import("../api/apiClient");
  const { apiAdminListEmployees } = await import("../api/employeesApi");
  if (!getAccessToken("admin")) {
    return { ok: false, error: "Admin authentication required." };
  }
  const result = await apiAdminListEmployees({ pageSize: 100 });
  if (!result.ok) return result;
  replaceServerEmployees(result.items ?? []);
  return { ok: true, employees: result.items ?? [] };
};

export const loadEmployees = () => {
  /* Seed the session mirror with the current JWT employee session snapshot
     when the backend list has not been fetched yet, so workflow UI can
     resolve the signed-in actor. Backend fetches replace this. */
  try {
    if (typeof localStorage !== "undefined") {
      const stored = JSON.parse(localStorage.getItem("pratikshya_employee_auth") || "null");
      if (stored && typeof stored === "object" && stored.id) {
        const exists = serverEmployees.some((e) => String(e.id) === String(stored.id) || e.employeeId === stored.employeeId);
        if (!exists) {
          serverEmployees = [{
            ...stored,
            id: stored.id,
            employeeId: stored.employeeId ?? stored.id,
            firstName: stored.firstName ?? "",
            lastName: stored.lastName ?? "",
            role: stored.role ?? "EMPLOYEE",
            status: stored.status ?? "ACTIVE",
            permissions: stored.permissions ?? [],
          }, ...serverEmployees];
        }
      }
    }
  } catch { /* session missing */ }
  return serverEmployees;
};

export const EMPLOYEES_CHANGED_EVENT = "pratikshya-employees-changed";

export const saveEmployees = (employees) => {
  serverEmployees = normaliseEmployees(employees);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EMPLOYEES_CHANGED_EVENT));
  }
};

/** Credential maps are backend-owned; local credential storage is removed. */
export const loadCredentials = () => ({});

export const saveCredentials = () => {};

export const getEmployees = (employees, filters = {}) => {
  const list = Array.isArray(employees) ? employees : [];
  return list.filter((employee) => {
    if (filters.role && employee.role !== filters.role) return false;
    if (filters.department && employee.department !== filters.department) return false;
    if (filters.status && employee.status !== filters.status) return false;
    if (filters.store && employee.store !== filters.store) return false;
    if (filters.query) {
      const haystack = [
        employee.employeeId,
        employee.firstName,
        employee.lastName,
        employee.email,
        employee.phone,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(String(filters.query).trim().toLowerCase())) return false;
    }
    return true;
  });
};

/**
 * Canonical selector for assigning operational work. Account administration
 * and work assignment are separate capabilities: this returns active,
 * legitimate employees only and can optionally require an operational
 * permission. Admin identities are rejected even if corrupt storage contains
 * one.
 */
export const getActiveAssignmentEmployees = (
  employees,
  { requiredPermission = null } = {}
) =>
  (Array.isArray(employees) ? employees : []).filter((employee) => {
    if (!employee || employee.status !== EMPLOYEE_STATUS.ACTIVE) return false;
    if (isAdminIdentity(employee)) return false;
    if (!requiredPermission) return true;
    return employee.permissions.includes(requiredPermission);
  });

export const getEmployee = (employees, idOrEmployeeId) => {
  if (!idOrEmployeeId) return null;
  const needle = String(idOrEmployeeId).trim();
  const upper = needle.toUpperCase();
  return (
    employees.find(
      (employee) => employee.id === needle || employee.employeeId === upper
    ) ?? null
  );
};

const replaceEmployee = (employees, next) =>
  employees.map((employee) => (employee.id === next.id ? next : employee));

const forbiddenResult = (employees, authorization) => ({
  ok: false,
  code: authorization.code,
  message: authorization.message,
  errors: { authorization: authorization.message },
  employee: null,
  employees,
});

const authorize = (employees, actor) => {
  const authorization = authorizeEmployeeManagement(actor);
  return authorization.ok ? null : forbiddenResult(employees, authorization);
};

export const validateEmployeeDraft = (draft, employees, { isCreate = false } = {}) => {
  const errors = {};
  const firstName = String(draft.firstName || "").trim();
  const lastName = String(draft.lastName || "").trim();
  const email = String(draft.email || "").trim().toLowerCase();
  const phone = String(draft.phone || "").trim();

  if (!firstName) errors.firstName = "First name is required.";
  if (!lastName) errors.lastName = "Last name is required.";
  if (!email) errors.email = "Email is required.";
  else if (!isValidEmail(email)) errors.email = "Please enter a valid email address.";
  if (phone && !isValidPhone(phone)) errors.phone = "Please enter a valid 10-digit mobile number.";
  const requestedRole = String(draft.role || "").toUpperCase();
  if (["ADMIN", "SUPER_ADMIN"].includes(requestedRole)) {
    errors.role = "Admin identities are not employee accounts.";
  } else if (!draft.role || !isKnownRole(draft.role)) {
    errors.role = "Please choose a legitimate employee role.";
  }
  if (
    Array.isArray(draft.permissions) &&
    draft.permissions.some(isEmployeeAccountPermission)
  ) {
    errors.permissions = "Employee-account administration permissions cannot be assigned to employees.";
  }
  if (!draft.department) errors.department = "Please choose a department.";
  if (!draft.store) errors.store = "Please choose a store or floor.";
  if (!draft.joiningDate) errors.joiningDate = "Joining date is required.";
  if (draft.status && !EMPLOYEE_STATUSES[draft.status]) {
    errors.status = "Please choose a valid status.";
  }

  const duplicate = employees.find((employee) => {
    if (!isCreate && (employee.id === draft.id || employee.employeeId === draft.employeeId)) {
      return false;
    }
    return employee.email === email;
  });
  if (duplicate) errors.email = "An employee with this email already exists.";

  return { ok: Object.keys(errors).length === 0, errors };
};

export const createEmployee = async (employees, draft, actor = null) => {
  const denied = authorize(employees, actor);
  if (denied) return { ...denied, temporaryPassword: null };

  const validation = validateEmployeeDraft(draft, employees, { isCreate: true });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, employee: null, temporaryPassword: null };
  }

  const existingIds = employees.map((employee) => employee.employeeId);
  const employeeId = generateEmployeeId({
    role: draft.role,
    department: draft.department,
    existingIds,
  });

  if (!isValidEmployeeId(employeeId) || existingIds.includes(employeeId)) {
    return {
      ok: false,
      errors: { employeeId: "Could not generate a unique employee ID." },
      employee: null,
      temporaryPassword: null,
    };
  }

  const permissionMode = draft.permissionMode === "custom" ? "custom" : "role";
  const permissions = sanitizeEmployeePermissions(
    permissionMode === "custom" && Array.isArray(draft.permissions)
      ? draft.permissions
      : getDefaultPermissions(draft.role)
  );

  const now = new Date().toISOString();
  const employee = toPublicEmployee({
    id: `emp-${Date.now().toString(36)}`,
    employeeId,
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone?.trim() || "",
    avatar: null,
    role: draft.role,
    department: draft.department,
    section: draft.section || "",
    store: draft.store,
    joiningDate: draft.joiningDate,
    status: draft.status || EMPLOYEE_STATUS.PENDING,
    permissions,
    permissionMode,
    mustChangePassword: true,
    lastLogin: null,
    createdAt: now,
    updatedAt: now,
    shift: draft.shift || "Morning · 10:00 – 19:00",
  });

  const nextEmployees = [employee, ...employees];
  saveEmployees(nextEmployees);

  // Backend persist — the server owns the employee record and password.
  const { apiAdminCreateEmployee } = await import("../api/employeesApi");
  const result = await apiAdminCreateEmployee({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    role: employee.role,
    department: employee.department,
    section: employee.section,
    status: employee.status,
    permissions: employee.permissions,
    permissionMode: employee.permissionMode,
    mustChangePassword: true,
  });
  if (result.ok && result.employee) {
    saveEmployees(replaceEmployee(loadEmployees(), result.employee));
  }

  return {
    ok: true,
    errors: {},
    employee,
    temporaryPassword: result.employee?.temporaryPassword ?? "",
    employees: nextEmployees,
    actor,
    message: result.ok
      ? `${employeeFullName(employee)} has been added to the house.`
      : result.error ?? "Employee saved locally; backend sync pending.",
  };
};

export const updateEmployee = (employees, employeeId, patch, actor = null) => {
  const denied = authorize(employees, actor);
  if (denied) return denied;
  const current = getEmployee(employees, employeeId);
  if (!current) {
    return { ok: false, message: "Employee not found.", employee: null, employees };
  }

  const merged = {
    ...current,
    ...patch,
    employeeId: current.employeeId,
    id: current.id,
    updatedAt: new Date().toISOString(),
  };
  const validation = validateEmployeeDraft(merged, employees, { isCreate: false });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, employee: current, employees };
  }

  const next = toPublicEmployee(merged);
  const nextEmployees = replaceEmployee(employees, next);
  saveEmployees(nextEmployees);
  return { ok: true, errors: {}, employee: next, employees: nextEmployees };
};

/** Employee self-service is deliberately narrow and cannot cross accounts. */
export const updateOwnEmployeeProfile = (employees, employeeId, patch, actor = null) => {
  const current = getEmployee(employees, employeeId);
  if (
    !current ||
    !actor?.employeeId ||
    actor.employeeId !== current.employeeId ||
    !canEmployeeLogin(actor.status)
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Employees may update only their own profile.",
      employee: current ?? null,
      employees,
    };
  }
  const phone = String(patch?.phone ?? current.phone).trim();
  if (phone && !isValidPhone(phone)) {
    return {
      ok: false,
      errors: { phone: "Please enter a valid 10-digit mobile number." },
      employee: current,
      employees,
    };
  }
  const next = toPublicEmployee({
    ...current,
    phone,
    updatedAt: new Date().toISOString(),
  });
  const nextEmployees = replaceEmployee(employees, next);
  saveEmployees(nextEmployees);
  return { ok: true, errors: {}, employee: next, employees: nextEmployees };
};

export const updateEmployeeRole = (employees, employeeId, role, { keepCustom = false } = {}, actor = null) => {
  const denied = authorize(employees, actor);
  if (denied) return denied;
  const current = getEmployee(employees, employeeId);
  if (!current) return { ok: false, message: "Employee not found.", employees };
  if (["ADMIN", "SUPER_ADMIN"].includes(String(role || "").toUpperCase()) || !isKnownRole(role)) {
    return { ok: false, message: "Admin identities are not employee roles.", employees };
  }

  const keep = keepCustom && current.permissionMode === "custom";
  const next = toPublicEmployee({
    ...current,
    role,
    permissionMode: keep ? "custom" : "role",
    permissions: keep ? current.permissions : getDefaultPermissions(role),
    updatedAt: new Date().toISOString(),
  });
  const nextEmployees = replaceEmployee(employees, next);
  saveEmployees(nextEmployees);
  return { ok: true, employee: next, employees: nextEmployees };
};

export const updateEmployeeDepartment = (
  employees,
  employeeId,
  { department, section, store },
  actor = null
) => {
  const denied = authorize(employees, actor);
  if (denied) return denied;
  const current = getEmployee(employees, employeeId);
  if (!current) return { ok: false, message: "Employee not found.", employees };
  const next = toPublicEmployee({
    ...current,
    department: department ?? current.department,
    section: section ?? current.section,
    store: store ?? current.store,
    updatedAt: new Date().toISOString(),
  });
  const nextEmployees = replaceEmployee(employees, next);
  saveEmployees(nextEmployees);
  return { ok: true, employee: next, employees: nextEmployees };
};

export const updateEmployeePermissions = (employees, employeeId, permissions, actor = null) => {
  const denied = authorize(employees, actor);
  if (denied) return denied;
  const current = getEmployee(employees, employeeId);
  if (!current) return { ok: false, message: "Employee not found.", employees };
  if (Array.isArray(permissions) && permissions.some(isEmployeeAccountPermission)) {
    return {
      ok: false,
      message: "Employee-account administration permissions cannot be assigned to employees.",
      employees,
    };
  }
  const next = toPublicEmployee({
    ...current,
    permissions: sanitizeEmployeePermissions(
      Array.isArray(permissions) ? permissions : current.permissions
    ),
    permissionMode: "custom",
    updatedAt: new Date().toISOString(),
  });
  const nextEmployees = replaceEmployee(employees, next);
  saveEmployees(nextEmployees);
  return { ok: true, employee: next, employees: nextEmployees };
};

export const setEmployeeStatus = (employees, employeeId, status, actor = null) => {
  const denied = authorize(employees, actor);
  if (denied) return denied;
  const current = getEmployee(employees, employeeId);
  if (!current) return { ok: false, message: "Employee not found.", employees };
  if (!EMPLOYEE_STATUSES[status]) {
    return { ok: false, message: "That status is not recognised.", employees };
  }
  const next = toPublicEmployee({
    ...current,
    status,
    updatedAt: new Date().toISOString(),
  });
  const nextEmployees = replaceEmployee(employees, next);
  saveEmployees(nextEmployees);
  return { ok: true, employee: next, employees: nextEmployees };
};

export const suspendEmployee = (employees, employeeId, actor = null) =>
  setEmployeeStatus(employees, employeeId, EMPLOYEE_STATUS.SUSPENDED, actor);

export const activateEmployee = (employees, employeeId, actor = null) =>
  setEmployeeStatus(employees, employeeId, EMPLOYEE_STATUS.ACTIVE, actor);

export const deactivateEmployee = (employees, employeeId, actor = null) =>
  setEmployeeStatus(employees, employeeId, EMPLOYEE_STATUS.INACTIVE, actor);

export const resetEmployeePassword = async (employees, employeeId, actor = null) => {
  const denied = authorize(employees, actor);
  if (denied) return { ...denied, temporaryPassword: null };
  const current = getEmployee(employees, employeeId);
  if (!current) {
    return { ok: false, message: "Employee not found.", temporaryPassword: null, employees };
  }
  const now = new Date().toISOString();

  const { apiAdminResetEmployeePassword } = await import("../api/employeesApi");
  const apiResult = await apiAdminResetEmployeePassword(current.id ?? current.employeeId, {});

  const next = toPublicEmployee({ ...current, mustChangePassword: true, updatedAt: now });
  const nextEmployees = replaceEmployee(employees, next);
  saveEmployees(nextEmployees);

  return {
    ok: apiResult.ok,
    employee: next,
    employees: nextEmployees,
    temporaryPassword: apiResult.employee?.temporaryPassword ?? "",
    message: apiResult.ok
      ? "A new temporary password has been issued. Share it securely with the employee."
      : apiResult.error ?? "Could not reset the password. Please try again.",
  };
};

export const markLastLogin = (employees, employeeId, at = new Date().toISOString()) => {
  const current = getEmployee(employees, employeeId);
  if (!current) return { ok: false, employees };
  const next = toPublicEmployee({ ...current, lastLogin: at, updatedAt: at });
  const nextEmployees = replaceEmployee(employees, next);
  saveEmployees(nextEmployees);
  return { ok: true, employee: next, employees: nextEmployees };
};

export const applyPasswordChange = async (employees, employeeId, { currentPassword, newPassword }) => {
  const current = getEmployee(employees, employeeId);
  if (!current) return { ok: false, message: "Employee not found." };

  const strength = validateEmployeePassword(newPassword);
  if (!strength.ok) return strength;

  const { apiChangePasswordEmployee } = await import("../api/authApi");
  const result = await apiChangePasswordEmployee({
    currentPassword,
    newPassword,
    confirmPassword: newPassword,
  });
  if (!result.ok) return { ok: false, message: result.error };

  const next = toPublicEmployee({ ...current, mustChangePassword: false, updatedAt: new Date().toISOString() });
  const nextEmployees = replaceEmployee(employees, next);
  saveEmployees(nextEmployees);
  return { ok: true, message: "Password updated.", employee: next, employees: nextEmployees };
};

/**
 * Employee authentication is backend-owned (POST /auth/employee/sign-in).
 * This local verifier is retained only as a compatibility stub for legacy
 * call-sites; it never fabricates credentials and always reports that the
 * backend is authoritative.
 */
export const verifyCredentials = async (employeeId, password) => {
  const { apiSignInEmployee } = await import("../api/authApi");
  const result = await apiSignInEmployee({ employeeId, password });
  if (!result.ok) return { ok: false, code: "INVALID", message: result.error };
  return { ok: true, employee: result.employee, token: true };
};

export const ensureSeeded = () => loadEmployees();

export default {
  EMPLOYEES_CHANGED_EVENT,
  toPublicEmployee,
  normaliseEmployees,
  loadEmployees,
  saveEmployees,
  loadCredentials,
  saveCredentials,
  getEmployees,
  getActiveAssignmentEmployees,
  getEmployee,
  isAdminIdentity,
  validateEmployeeDraft,
  createEmployee,
  updateEmployee,
  updateOwnEmployeeProfile,
  updateEmployeeRole,
  updateEmployeeDepartment,
  updateEmployeePermissions,
  setEmployeeStatus,
  suspendEmployee,
  activateEmployee,
  deactivateEmployee,
  resetEmployeePassword,
  markLastLogin,
  applyPasswordChange,
  verifyCredentials,
  ensureSeeded,
};
