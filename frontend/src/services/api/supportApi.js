import { apiClient, handleError } from "./apiClient";

/** GET /employee/support/cases */
export async function apiListCases(params = {}) {
  try {
    const data = await apiClient.get("/employee/support/cases", { scope: "employee", params });
    return { ok: true, items: data.items ?? [], total: data.total ?? 0 };
  } catch (err) {
    return handleError(err);
  }
}

/** POST /employee/support/cases */
export async function apiCreateCase(body = {}) {
  try {
    const data = await apiClient.post("/employee/support/cases", body, { scope: "employee" });
    return { ok: true, case: data.case ?? data };
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /employee/support/cases/{caseId} */
export async function apiUpdateCase(caseId, body = {}) {
  try {
    const data = await apiClient.patch(`/employee/support/cases/${caseId}`, body, { scope: "employee" });
    return { ok: true, case: data.case ?? data };
  } catch (err) {
    return handleError(err);
  }
}

export default {
  apiListCases,
  apiCreateCase,
  apiUpdateCase,
};
