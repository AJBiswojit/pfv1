/**
 * PRATIKSHYA FASHON — shared admin API error presentation (Phase 5).
 *
 * One mapping layer from backend HTTP semantics to honest operator copy,
 * used by the product, category, collection and offer admin screens. It must
 * never collapse a server failure into "saved" or into a generic "No data":
 *   401 → session expired; 403 → permission; 404 → missing server-side;
 *   409 → conflict (nothing was overwritten); 422 → field/business
 *   validation with the server's own reasons; anything else → real status.
 */

/** Extract server-provided detail strings from either error envelope shape. */
export function collectErrorDetails(data) {
  if (!data || typeof data !== "object") return [];
  const raw =
    (data.error && typeof data.error === "object" && (data.error.details?.errors ?? data.error.details ?? data.error)) ??
    data.details ??
    null;
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.errors) ? raw.errors : [];
  return list
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object") {
        // FastAPI RequestValidationError shape
        if (entry.msg) {
          const loc = Array.isArray(entry.loc) ? entry.loc.slice(1).join(".") : "";
          return loc ? `${loc}: ${entry.msg}` : String(entry.msg);
        }
        if (entry.message) return String(entry.message);
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Format one result object ({ ok:false, error, status, data }) from any admin
 * API into a single human sentence. `entity` is what was being saved and
 * `action` the past-tense verb used in copy ("saved", "published", …).
 */
export function formatAdminError(result, { entity = "record", action = "saved" } = {}) {
  if (!result || result.ok) return null;
  const status = Number(result.status || 0);
  const message = typeof result.error === "string" && result.error.trim() ? result.error.trim() : "";
  const details = collectErrorDetails(result.data);
  const detailText = details.length ? ` ${details.join(" ")}` : "";

  if (status === 0 || Number.isNaN(status)) {
    return `Could not reach the server — the ${entity} was NOT ${action}. Try again once you are back online.${detailText}`;
  }
  if (status === 401) {
    return "Your admin session expired. Sign in again and retry — nothing was changed.";
  }
  if (status === 403) {
    return `Permission denied — your role may not ${action === "saved" ? `manage ${entity}s` : "perform this action"}.${message ? ` ${message}` : ""}`;
  }
  if (status === 404) {
    return `The ${entity} no longer exists on the server. Refresh the list — nothing was ${action}.`;
  }
  if (status === 409) {
    /*
     * Phase 3 Block 3: a duplicate SKU/slug arrives as 409 CONFLICT with
     * `details: { field, value, suggestedSlug? }`. The server's own sentence
     * already names the offending value, and the suggestion — when present —
     * is a slug known to be free, so surfacing it makes the retry a single
     * copy/paste instead of a guess. It must never be flattened into a
     * generic network/server failure.
     */
    const conflict =
      (result.data && typeof result.data === "object" ? result.data.error?.details : null) ??
      (result.details && !Array.isArray(result.details) ? result.details : null);
    const suggestion =
      conflict && typeof conflict === "object" && typeof conflict.suggestedSlug === "string"
        ? conflict.suggestedSlug
        : "";
    const hint = suggestion ? ` Try “${suggestion}” instead.` : "";
    return `Conflict: ${message || "another record already uses that identifier."} Nothing was overwritten.${hint}`;
  }
  if (status === 422) {
    return `The server rejected this change${message ? `: ${message}` : "."}${detailText}`;
  }
  if (status >= 500) {
    return `Server error (${status}) while the ${entity} was being ${action}.${message ? ` ${message}` : ""} The change was NOT confirmed — retry or report this.`;
  }
  return `${message || `The ${entity} could not be ${action} (status ${status}).`}${detailText}`;
}
