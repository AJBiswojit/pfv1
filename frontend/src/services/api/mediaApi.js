/**
 * PRATIKSHYA FASHON — Media API
 *
 * Contract reserved for the backend media modules
 * (backend/app/api/v1/media.py). The existing server schema does NOT yet
 * carry business columns on `media_media_asset`, `media_product_media`,
 * `media_marketing_media` or `media_media_review`, so no functional media
 * endpoints can be served without schema work (explicitly out of scope).
 *
 * Every function returns { ok:false, error } with a clear, user-visible
 * message — the UI must show an error/empty state, never seeded media.
 */

function unavailable() {
  return {
    ok: false,
    error: "Media management is not available yet: the backend media tables " +
           "do not have the required columns in the existing database schema. " +
           "This integration is documented as a blocker (INTEGRATION_AUDIT.md §7).",
  };
}

export async function apiListMedia()        { return unavailable(); }
export async function apiGetMedia()         { return unavailable(); }
export async function apiCreateMedia()      { return unavailable(); }
export async function apiUpdateMedia()      { return unavailable(); }
export async function apiDeleteMedia()      { return unavailable(); }
export async function apiUploadMedia()      { return unavailable(); }
export async function apiListProductMedia() { return unavailable(); }
export async function apiAssignMediaToProduct() { return unavailable(); }
export async function apiListMarketingMedia() { return unavailable(); }
export async function apiListMediaReviews() { return unavailable(); }
export async function apiApproveMedia()     { return unavailable(); }
export async function apiRejectMedia()      { return unavailable(); }
