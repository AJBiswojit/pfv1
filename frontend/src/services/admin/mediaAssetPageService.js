/**
 * PRATIKSHYA FASHION — Media registry page reads (Batch 5).
 *
 * One read of `GET /media/assets` for one page + one filter set:
 *
 *   buildMediaListParams(tabId, { page, pageSize, q })   → request options
 *   apiListMediaAssets(options)                          → raw body preserved
 *   mediaAssetPageOutcome(result, { page, pageSize })    → view state
 *
 * Being React-free, the request/normalisation contract is covered by the Node
 * harness directly. The React lifecycle (debounce, stale-response guard,
 * retry) lives in `hooks/useMediaRegistry.js`.
 *
 * Honesty rules carried over from the view model:
 *   · `total` is the server's count or `null` — never `items.length`;
 *   · an empty success (`total: 0`) is `ready`, a failed read is `error` and
 *     carries no rows at all;
 *   · 401/403 is `unauthorized`, not "no media";
 *   · a malformed body is `error`, not an empty registry.
 */

import { apiListMediaAssets } from "../api/mediaApi";
import { buildMediaListParams, mediaAssetPageOutcome } from "./mediaRegistryView";

/**
 * Read one registry page.
 *
 * Resolves with `{status, items, total, page, pageSize, dropped, error,
 * hasFilters}` and never rejects: `apiListMediaAssets` normalises thrown
 * errors, and the catch below keeps a surprise rejection from leaving the
 * panel stuck on "loading".
 */
export async function fetchMediaAssetPage({ tabId = "ALL", page = 1, pageSize = 24, q = "" } = {}) {
  const params = buildMediaListParams(tabId, { page, pageSize, q });
  let result;
  try {
    result = await apiListMediaAssets(params);
  } catch (error) {
    result = {
      ok: false,
      status: 0,
      error: error?.message || "The media registry could not be loaded.",
      code: "UNKNOWN_ERROR",
    };
  }
  return {
    ...mediaAssetPageOutcome(result, { page: params.page, pageSize: params.pageSize }),
    tabId,
    q: params.q,
    hasFilters: Boolean(
      params.mediaType || params.assigned || params.unassigned || params.placement || params.q
    ),
  };
}

export default fetchMediaAssetPage;
