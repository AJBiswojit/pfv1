/**
 * PRATIKSHYA FASHON — Workforce API client.
 *
 * Thin async wrappers over the workforce backend (attendance punches, leave,
 * performance). The session mirror (`../workforce/store.js`) is populated by
 * these fetches and by the punch responses — it is never seeded with demo
 * data, and reads of an un-hydrated mirror are honestly empty.
 *
 * One rule: the server decides. `attendanceService.js`/`leaveService.js`
 * keep their synchronous validation for instant input feedback, but every
 * mutation goes through here, and the returned server state replaces whatever
 * was local. Scope is the shared account-scope resolver (admin token when an
 * admin session exists, otherwise the employee token) — the same contract as
 * the canonical /admin/employees API.
 */
import { apiClient, handleError } from "../api/apiClient";
import { resolveAccountScope } from "../api/employeesApi";

const opts = () => ({ scope: resolveAccountScope() });

// ── Attendance ─────────────────────────────────────────────────────────────

export async function apiPunchIn(at = null) {
  try {
    const data = await apiClient.post("/employee/attendance/check-in", at ? { at } : {}, opts());
    return { ok: true, ...data };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiPunchOut(at = null) {
  try {
    const data = await apiClient.post("/employee/attendance/check-out", at ? { at } : {}, opts());
    return { ok: true, ...data };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiAttendanceToday() {
  try {
    const data = await apiClient.get("/employee/attendance/today", opts());
    return { ok: true, record: data.record ?? null };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiMyAttendanceMonth(month) {
  try {
    const qs = month ? `?month=${encodeURIComponent(month)}` : "";
    const data = await apiClient.get(`/employee/attendance${qs}`, opts());
    return { ok: true, items: data.items ?? [], summary: data.summary ?? {} };
  } catch (err) {
    return handleError(err);
  }
}

/** Requires `attendance.view` (Admin workspace or delegated Super Employee). */
export async function apiAdminAttendanceDay(date) {
  try {
    const qs = date ? `?date=${encodeURIComponent(date)}` : "";
    const data = await apiClient.get(`/admin/attendance/day${qs}`, opts());
    return { ok: true, items: data.items ?? [], summary: data.summary ?? {} };
  } catch (err) {
    return { ...handleError(err), items: [] };
  }
}

// ── Leave ───────────────────────────────────────────────────────────────────

export async function apiMyLeave() {
  try {
    const data = await apiClient.get("/employee/leave", opts());
    return { ok: true, items: data.items ?? [], total: data.total ?? (data.items ?? []).length };
  } catch (err) {
    return { ...handleError(err), items: [] };
  }
}

export async function apiRequestLeave({ leaveType, startDate, endDate, reason }) {
  try {
    const data = await apiClient.post(
      "/employee/leave",
      { leaveType, startDate, endDate: endDate || startDate, reason: reason || null },
      opts()
    );
    return { ok: true, record: data, message: "Leave request submitted." };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiCancelLeave(leaveId) {
  try {
    const data = await apiClient.post(`/employee/leave/${leaveId}/cancel`, {}, opts());
    return { ok: true, record: data, message: "Leave request cancelled." };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiAdminLeave({ employeeId, status, page = 1, pageSize = 50 } = {}) {
  try {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (employeeId) params.set("employee_id", employeeId);
    if (status) params.set("status", status);
    const data = await apiClient.get(`/admin/leave?${params}`, opts());
    return { ok: true, items: data.items ?? [], total: data.total ?? (data.items ?? []).length };
  } catch (err) {
    return { ...handleError(err), items: [] };
  }
}

export async function apiDecideLeave(leaveId, { decision, reviewNote }) {
  try {
    const data = await apiClient.post(
      `/admin/leave/${leaveId}/decision`,
      { decision, reviewNote: reviewNote || null },
      opts()
    );
    return { ok: true, record: data };
  } catch (err) {
    return handleError(err);
  }
}

// ── Performance ──────────────────────────────────────────────────────────────

export async function apiMyPerformance() {
  try {
    const data = await apiClient.get("/employee/performance", opts());
    return { ok: true, reviews: data.reviews ?? [], summary: data.summary ?? {} };
  } catch (err) {
    return { ...handleError(err), reviews: [] };
  }
}

export async function apiAdminPerformance({ employeeId, period, page = 1, pageSize = 50 } = {}) {
  try {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (employeeId) params.set("employee_id", employeeId);
    if (period) params.set("period", period);
    const data = await apiClient.get(`/admin/performance?${params}`, opts());
    return { ok: true, items: data.items ?? [], total: data.total ?? (data.items ?? []).length };
  } catch (err) {
    return { ...handleError(err), items: [] };
  }
}

export async function apiCreatePerformance(body) {
  try {
    const data = await apiClient.post("/admin/performance", body, opts());
    return { ok: true, record: data, message: "Review recorded." };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiUpdatePerformance(performanceId, body) {
  try {
    const data = await apiClient.patch(`/admin/performance/${performanceId}`, body, opts());
    return { ok: true, record: data, message: "Review updated." };
  } catch (err) {
    return handleError(err);
  }
}

export default {
  apiPunchIn,
  apiPunchOut,
  apiAttendanceToday,
  apiMyAttendanceMonth,
  apiAdminAttendanceDay,
  apiMyLeave,
  apiRequestLeave,
  apiCancelLeave,
  apiAdminLeave,
  apiDecideLeave,
  apiMyPerformance,
  apiAdminPerformance,
  apiCreatePerformance,
  apiUpdatePerformance,
};
