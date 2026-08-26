/**
 * PRATIKSHYA FASHON — Employee authentication context.
 *
 * Wired to the FastAPI backend (Phase B).
 * Calls /api/v1/auth/employee/* via authApi.js.
 *
 * Token isolation: employee JWT is stored under separate localStorage keys
 * ("pf_employee_access_token" / "pf_employee_refresh_token") so employee
 * sign-in never clobbers a customer or admin session.
 *
 * Session persistence:
 *   - JWT tokens → localStorage "pf_employee_access_token" / "pf_employee_refresh_token"
 *   - Employee profile snapshot → localStorage "pratikshya_employee_auth"
 *
 * The canAccess / hasPermission helpers still use the existing
 * authorization.js module — they just now operate on the JWT-sourced
 * permissions array instead of mock role defaults.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { canAccessPath, hasPermission as permit } from "../services/employees/authorization";
import {
  apiSignInEmployee,
  apiChangePasswordEmployee,
  apiSignOutEmployee,
} from "../services/api/authApi";
import { readStorage, writeStorage } from "../utils/shopping";
import {
  checkIn as punchIn,
  checkOut as punchOut,
  getTodayAttendance,
} from "../services/workforce/attendanceService";

const EmployeeAuthContext = createContext(null);

const EMPLOYEE_SESSION_KEY           = "pratikshya_employee_auth";
export const EMPLOYEE_ACCESS_TOKEN_KEY  = "pf_employee_access_token";
export const EMPLOYEE_REFRESH_TOKEN_KEY = "pf_employee_refresh_token";

// Token helpers specific to the employee surface
export const getEmployeeAccessToken = () => {
  try { return localStorage.getItem(EMPLOYEE_ACCESS_TOKEN_KEY); } catch { return null; }
};

const clearEmployeeTokens = () => {
  try {
    localStorage.removeItem(EMPLOYEE_ACCESS_TOKEN_KEY);
    localStorage.removeItem(EMPLOYEE_REFRESH_TOKEN_KEY);
  } catch { /* ignore */ }
};

// ---------------------------------------------------------------------------
// Session restore
// ---------------------------------------------------------------------------

function restoreSession() {
  if (!getEmployeeAccessToken()) return { employee: null, isAuthenticated: false };
  const stored = readStorage(EMPLOYEE_SESSION_KEY, null);
  if (stored && typeof stored === "object" && stored.id) {
    return { employee: stored, isAuthenticated: true };
  }
  return { employee: null, isAuthenticated: false };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EmployeeAuthProvider({ children }) {
  const [session, setSession] = useState(restoreSession);
  const [isLoading, setIsLoading] = useState(false);

  const employee        = session.employee;
  const isAuthenticated = Boolean(session.isAuthenticated && employee);

  // Persist employee profile snapshot
  useEffect(() => {
    if (employee?.id) {
      writeStorage(EMPLOYEE_SESSION_KEY, employee);
    } else {
      try { window.localStorage.removeItem(EMPLOYEE_SESSION_KEY); } catch { /* ignore */ }
    }
  }, [employee]);

  // Listen for global token expiry — only clear employee session if no employee token
  useEffect(() => {
    const handleExpiry = () => {
      if (!getEmployeeAccessToken()) {
        setSession({ employee: null, isAuthenticated: false });
      }
    };
    window.addEventListener("pf:session-expired", handleExpiry);
    return () => window.removeEventListener("pf:session-expired", handleExpiry);
  }, []);

  // ── Sign In ──────────────────────────────────────────────────────────────

  const signIn = useCallback(async ({ employeeId, password }) => {
    setIsLoading(true);
    const result = await apiSignInEmployee({ employeeId, password });
    setIsLoading(false);

    if (!result.ok) return result;

    // Move tokens to employee-specific keys (apiSignInEmployee stored them in shared keys)
    try {
      const accessToken  = localStorage.getItem("pf_access_token");
      const refreshToken = localStorage.getItem("pf_refresh_token");
      if (accessToken)  localStorage.setItem(EMPLOYEE_ACCESS_TOKEN_KEY,  accessToken);
      if (refreshToken) localStorage.setItem(EMPLOYEE_REFRESH_TOKEN_KEY, refreshToken);
      // Don't remove shared keys here — customer session may coexist
    } catch { /* ignore */ }

    setSession({ employee: result.employee, isAuthenticated: true });
    return result;
  }, []);

  // ── Sign Out ─────────────────────────────────────────────────────────────

  const signOut = useCallback(async () => {
    await apiSignOutEmployee();
    clearEmployeeTokens();
    setSession({ employee: null, isAuthenticated: false });
  }, []);

  // ── Change Password ──────────────────────────────────────────────────────

  const changePassword = useCallback(async ({ currentPassword, newPassword, confirmPassword }) => {
    if (!employee) return { ok: false, error: "You need to sign in first." };
    setIsLoading(true);
    const result = await apiChangePasswordEmployee({ currentPassword, newPassword, confirmPassword });
    setIsLoading(false);
    if (!result.ok) return result;

    // Clear force_password_change flag on the local snapshot
    setSession((prev) => ({
      ...prev,
      employee: prev.employee
        ? { ...prev.employee, mustChangePassword: false }
        : null,
    }));
    return { ok: true };
  }, [employee]);

  // ── Refresh local session (re-read from storage) ─────────────────────────

  const refreshSession = useCallback(() => {
    const next = restoreSession();
    setSession(next);
    return next;
  }, []);

  // ── RBAC helpers (operate on permissions from the JWT/profile) ───────────

  const hasPermission = useCallback(
    (permission) => permit(employee, permission),
    [employee]
  );

  const canAccess = useCallback(
    (pathname) => canAccessPath(employee, pathname),
    [employee]
  );

  // ── Attendance (still local until Phase J) ────────────────────────────────

  const getAttendance = useCallback(() => {
    if (!employee) return null;
    const record = getTodayAttendance(employee.employeeId ?? employee.id);
    if (!record) return null;
    return { ...record, checkedInAt: record.checkIn, checkedOutAt: record.checkOut };
  }, [employee]);

  const checkIn = useCallback(() => {
    if (!employee) return { ok: false };
    return punchIn({ employeeId: employee.employeeId ?? employee.id, actor: employee });
  }, [employee]);

  const checkOut = useCallback(() => {
    if (!employee) return { ok: false };
    return punchOut({ employeeId: employee.employeeId ?? employee.id, actor: employee });
  }, [employee]);

  // ── Context value ─────────────────────────────────────────────────────────

  const value = useMemo(() => ({
    employee,
    isAuthenticated,
    isLoading,
    mustChangePassword: Boolean(employee?.mustChangePassword),
    signIn,
    signOut,
    changePassword,
    refreshSession,
    hasPermission,
    canAccess,
    getAttendance,
    checkIn,
    checkOut,
  }), [
    employee, isAuthenticated, isLoading,
    signIn, signOut, changePassword, refreshSession,
    hasPermission, canAccess, getAttendance, checkIn, checkOut,
  ]);

  return (
    <EmployeeAuthContext.Provider value={value}>{children}</EmployeeAuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const inertEmployeeAuth = {
  employee: null,
  isAuthenticated: false,
  isLoading: false,
  mustChangePassword: false,
  signIn:         async () => ({ ok: false, error: "" }),
  signOut:        async () => {},
  changePassword: async () => ({ ok: false, error: "" }),
  refreshSession: () => ({ employee: null, isAuthenticated: false }),
  hasPermission:  () => false,
  canAccess:      () => false,
  getAttendance:  () => null,
  checkIn:        () => ({ ok: false }),
  checkOut:       () => ({ ok: false }),
};

export function useEmployeeAuth() {
  return useContext(EmployeeAuthContext) ?? inertEmployeeAuth;
}

export default EmployeeAuthContext;
