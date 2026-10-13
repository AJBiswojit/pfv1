import { apiClient, handleError } from "./apiClient";

/** GET /employee/styling/appointments */
export async function apiListAppointments(params = {}) {
  try {
    const data = await apiClient.get("/employee/styling/appointments", { scope: "employee", params });
    return { ok: true, items: data.items ?? [], total: data.total ?? 0 };
  } catch (err) {
    return handleError(err);
  }
}

/** GET /employee/styling/requests */
export async function apiListRequests(params = {}) {
  try {
    const data = await apiClient.get("/employee/styling/requests", { scope: "employee", params });
    return { ok: true, items: data.items ?? [], total: data.total ?? 0 };
  } catch (err) {
    return handleError(err);
  }
}

export default {
  apiListAppointments,
  apiListRequests,
};
