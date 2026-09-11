/**
 * PRATIKSHYA FASHON — Workforce live subscription + server hydration.
 *
 * The repositories keep an in-memory session mirror and announce
 * `pratikshya-workforce-changed`; this provider keeps dashboards and desks in
 * sync without a second data store. It also performs the ONLY background
 * read of workforce data for the employee workspace: on sign-in it hydrates
 * the mirror from the backend (`workforceSync`) and after every mutation
 * surfaces call `refresh()`. A failed hydration keeps the previous mirror
 * state and never fabricates rows — empty from the server is honestly empty.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { WORKFORCE_CHANGED_EVENT } from "../config/attendanceConfig";
import { PERMISSIONS } from "../config/employeePermissions";
import { useEmployeeAuth } from "./EmployeeAuthContext";
import { hydrateWorkforce } from "../services/workforce/workforceSync";

const WorkforceContext = createContext(null);

export function WorkforceProvider({ children }) {
  const [revision, setRevision] = useState(0);
  const [syncError, setSyncError] = useState(null);
  const [synced, setSynced] = useState(false);
  const { employee, isAuthenticated, hasPermission } = useEmployeeAuth();
  const inFlight = useRef(false);

  useEffect(() => {
    const sync = () => setRevision((value) => value + 1);
    window.addEventListener(WORKFORCE_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WORKFORCE_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !employee?.employeeId) return { ok: false, skipped: true };
    if (inFlight.current) return { ok: true, deduped: true };
    inFlight.current = true;
    try {
      const result = await hydrateWorkforce({
        employeeCode: employee.employeeId,
        withRoster:
          employee.accountLevel === "ADMIN" ||
          employee.accountLevel === "SUPER_ADMIN" ||
          hasPermission(PERMISSIONS.ATTENDANCE_VIEW) ||
          hasPermission(PERMISSIONS.ATTENDANCE_MANAGE),
        leaveReviewer:
          hasPermission(PERMISSIONS.LEAVE_APPROVE) ||
          hasPermission(PERMISSIONS.LEAVE_REJECT) ||
          hasPermission(PERMISSIONS.LEAVE_MANAGE),
      });
      setSyncError(result.ok ? null : (result.errors || []).join(" · ") || "sync failed");
      setSynced(true);
      return result;
    } finally {
      inFlight.current = false;
    }
  }, [isAuthenticated, employee?.employeeId, employee?.accountLevel, hasPermission]);

  useEffect(() => {
    if (isAuthenticated && employee?.employeeId) void refresh();
  }, [isAuthenticated, employee?.employeeId, refresh]);

  const value = useMemo(
    () => ({ revision, refresh, syncError, synced }),
    [revision, refresh, syncError, synced]
  );
  return <WorkforceContext.Provider value={value}>{children}</WorkforceContext.Provider>;
}

export function useWorkforce() {
  return useContext(WorkforceContext) ?? { revision: 0, refresh: async () => ({ ok: false, skipped: true }), syncError: null, synced: false };
}

export default WorkforceContext;
