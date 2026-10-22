/**
 * PRATIKSHYA FASHION — Media registry: pure view model (Batch 3).
 *
 * The display half of the media registry, with NO React, NO HTTP and NO
 * storage access. Everything here is a pure function over data the backend
 * already returned, so the page added in later batches can be reasoned about
 * (and tested) without a browser.
 *
 * Contract with the API layer (`services/api/mediaApi.js`):
 *   · `apiGetMediaAssetSummary()` → `{ok:true, data}` on 200,
 *     `{ok:false, error, status, code, isNetworkError}` on failure.
 *   · `apiListMediaAssets(options)` → `{ok:true, items, total, page, pageSize}`
 *     or the same failure shape.
 *
 * HONESTY RULES — the reason this module exists as a separate, tested layer:
 *
 *   1. A count is either a real non-negative integer from the payload or
 *      `null` ("unknown"). Nothing is defaulted to 0. A genuine `total: 0`
 *      stays `0`; a missing `total` becomes `null`, so "empty registry" and
 *      "we never learned the count" can never be confused again.
 *   2. A request failure or a malformed payload yields an all-unknown model
 *      (`ok: false`) — never a zero-filled summary that would render as a
 *      truthful-looking empty library.
 *   3. Card values render as the em dash `—` unless the request actually
 *      succeeded (`status === "ready"`) AND that individual field is a real
 *      count. One missing field shows `—` on that card only; the others keep
 *      their real numbers.
 *   4. Asset rows keep the backend's identity and vocabulary verbatim:
 *      `objectKey`, raw `status` (`"uploaded"` is NOT rewritten here — the
 *      "Registered" label is a UI concern), `mimeType`, declared `scope`, and
 *      the product mapping. A row with no `objectKey` cannot be identified or
 *      linked, so it is dropped and counted, never rendered with a made-up
 *      key.
 */

/** Large-file boundary used by the backend summary (1.5 MiB). */
export const LARGE_FILE_BYTES = 1_572_864;

/** Placeholder for a value that was not received — never a zero. */
export const UNKNOWN_VALUE = "—";

/**
 * The registry tabs, in locked order, with the EXACT list request each one
 * makes. `params` are the `apiListMediaAssets` options, not a query string:
 * the API module owns serialization.
 *
 * Marketing uses `placement` (whole marketing scope: hero/ + marketing/),
 * deliberately NOT `scopeFilter: "marketing"`, which excludes hero/.
 * Unassigned is the product-scope half with no product mapping.
 */
export const MEDIA_REGISTRY_TABS = Object.freeze([
  Object.freeze({ id: "ALL", label: "All", params: Object.freeze({}) }),
  Object.freeze({ id: "IMAGES", label: "Images", params: Object.freeze({ mediaType: "image" }) }),
  Object.freeze({ id: "VIDEOS", label: "Videos", params: Object.freeze({ mediaType: "video" }) }),
  Object.freeze({
    id: "PRODUCT",
    label: "Product",
    params: Object.freeze({ scopeFilter: "product", assigned: true }),
  }),
  Object.freeze({ id: "MARKETING", label: "Marketing", params: Object.freeze({ placement: true }) }),
  Object.freeze({ id: "UNASSIGNED", label: "Unassigned", params: Object.freeze({ unassigned: true }) }),
]);

/** The tab with `tabId`, falling back to All for an unknown/missing id. */
export function getMediaRegistryTab(tabId) {
  const id = String(tabId || "").trim().toUpperCase();
  return MEDIA_REGISTRY_TABS.find((tab) => tab.id === id) ?? MEDIA_REGISTRY_TABS[0];
}

const positiveInt = (value, fallback) =>
  Number.isInteger(value) && value >= 1 ? value : fallback;

/**
 * `{page, pageSize, q, ...tabParams}` for `apiListMediaAssets`.
 *
 * Page numbers are coerced to a sane positive integer; an unknown tab is the
 * unfiltered All tab (no invented filters). `q` is always present but already
 * trimmed — the API layer omits it when empty, keeping the default URL exact.
 */
export function buildMediaListParams(tabId, { page = 1, pageSize = 24, q = "" } = {}) {
  const tab = getMediaRegistryTab(tabId);
  return {
    page: positiveInt(page, 1),
    pageSize: positiveInt(pageSize, 24),
    q: String(q ?? "").trim(),
    ...tab.params,
  };
}

// ---------------------------------------------------------------------------
// Counts: strict readers — a real integer or "unknown"
// ---------------------------------------------------------------------------

/**
 * A backend count, or `null`.
 *
 * Accepts ONLY a non-negative integer JavaScript number. Negative numbers,
 * fractional values, numeric strings, booleans, null and undefined are all
 * treated as "unknown" rather than coerced — a coerced `0` would be
 * indistinguishable from a real empty registry, which is the exact failure
 * this module exists to prevent.
 */
export function readCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

const readText = (value) => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readSection = (value, keys) => {
  const source = isPlainObject(value) ? value : {};
  const section = {};
  for (const key of keys) section[key] = readCount(source[key]);
  return section;
};

const SUMMARY_COUNT_FIELDS = Object.freeze([
  "total",
  "images",
  "videos",
  "otherMimeTypes",
  "productMapped",
  "marketing",
  "unassigned",
  "largeFiles",
  "unknownFileSize",
]);

/**
 * Normalise a `GET /media/assets/summary` payload.
 *
 * Returns every field the backend sends, with `null` wherever the payload did
 * not supply a usable value:
 *
 *   ok                       false when the payload was not an object, or
 *                            did not carry a usable `total` (the anchor count)
 *   total … unknownFileSize  counts (0 is a real value; null is unknown)
 *   sameByteCopies           {assets, groups, unknownChecksums}
 *   namespaceClassification  {matches, mismatches, undetermined}
 *   largeFileThresholdBytes  the backend's boundary, else LARGE_FILE_BYTES
 *   countingScope            the backend's own description of what it counted
 *   generatedAt              the backend's snapshot timestamp
 *   missingFields            names of the counts that were absent/invalid
 *
 * The model never invents a field the backend does not send, and never
 * substitutes 0 for a missing count.
 */
export function normaliseMediaSummary(payload) {
  const source = isPlainObject(payload) ? payload : {};
  const total = readCount(source.total);
  const summary = {
    ok: isPlainObject(payload) && total !== null,
    sameByteCopies: readSection(source.sameByteCopies, ["assets", "groups", "unknownChecksums"]),
    namespaceClassification: readSection(source.namespaceClassification, [
      "matches",
      "mismatches",
      "undetermined",
    ]),
    largeFileThresholdBytes:
      readCount(source.largeFileThresholdBytes) ?? LARGE_FILE_BYTES,
    countingScope: readText(source.countingScope),
    generatedAt: readText(source.generatedAt),
    missingFields: [],
  };

  for (const field of SUMMARY_COUNT_FIELDS) {
    summary[field] = field === "total" ? total : readCount(source[field]);
    if (summary[field] === null) summary.missingFields.push(field);
  }
  for (const [group, keys] of [
    ["sameByteCopies", ["assets", "groups", "unknownChecksums"]],
    ["namespaceClassification", ["matches", "mismatches", "undetermined"]],
  ]) {
    for (const key of keys) {
      if (summary[group][key] === null) summary.missingFields.push(`${group}.${key}`);
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Cards: eight truthful tiles, em dash until the data really exists
// ---------------------------------------------------------------------------

const CARD_DEFINITIONS = Object.freeze([
  { id: "total", label: "Total Media", hint: "All registered assets" },
  { id: "images", label: "Images", hint: "Registered image assets" },
  { id: "videos", label: "Videos", hint: "Video upload is not enabled" },
  { id: "productMapped", label: "Product Media", hint: "Mapped to a product" },
  { id: "marketing", label: "Marketing Media", hint: "Hero and marketing placement art" },
  { id: "unassigned", label: "Unassigned", hint: "Product-scope assets with no product" },
  { id: "largeFiles", label: "Large Files", hint: "Originals at or above 1.5 MB" },
  {
    id: "sameByteCopies",
    label: "Same-byte copies",
    hint: "Assets sharing an identical SHA-256",
  },
]);

const formatGroupsSub = (rawGroups) => {
  const groups = readCount(rawGroups);
  if (groups === null) return "checksum groups unknown";
  if (groups === 0) return "no duplicate checksum groups";
  return `${groups} checksum group${groups === 1 ? "" : "s"}`;
};

/**
 * The eight card models, in locked order:
 * `[{id, label, value, hint, sub, tone?}]`.
 *
 * `value` is the string form of a real count ONLY when `status === "ready"`
 * and that field is a valid count. Otherwise it is `—`. There is deliberately
 * no path that produces `"0"` from a missing field, a failed request or a
 * pending one — a genuine `0` from the backend is the only source of `"0"`.
 *
 * Hardening (Batch 4): every count is passed through `readCount`, so a raw or
 * malformed value that slipped past `normaliseMediaSummary` — a negative
 * number, a fraction, `"10"`, `true` — renders `—` rather than `-1`, `1.5`,
 * `10` or `1`. Valid non-negative integers, zero included, are preserved.
 *
 * `sub` carries the checksum-group detail for the same-byte card; `tone` is
 * `"alert"` for the unassigned card when it has a real non-zero count.
 */
export function buildMediaCardModels({ status = "loading", summary = null } = {}) {
  const ready = status === "ready" && Boolean(summary);
  const data = ready ? summary : null;

  return CARD_DEFINITIONS.map(({ id, label, hint }) => {
    const raw = id === "sameByteCopies" ? data?.sameByteCopies?.assets : data?.[id];
    const count = readCount(raw);
    const value = count === null ? UNKNOWN_VALUE : String(count);
    const model = { id, label, value, hint };

    if (id === "sameByteCopies") {
      model.sub = ready
        ? formatGroupsSub(data?.sameByteCopies?.groups ?? null)
        : "checksum groups unknown";
    }
    if (id === "unassigned" && count !== null && count > 0) {
      model.tone = "alert";
    }
    return model;
  });
}

// ---------------------------------------------------------------------------
// Summary request state — the loading/ready/error/unauthorized contract
// ---------------------------------------------------------------------------

/**
 * The four states a summary read can be in. Only `ready` may render a number.
 */
export const MEDIA_SUMMARY_STATUS = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
  UNAUTHORIZED: "unauthorized",
});

/**
 * The state a summary read starts in — and the state every REFRESH resets to.
 *
 * `summary` is `null`, never the previous snapshot: while a new read is in
 * flight the cards must show `—`, so a refresh can never leave yesterday's
 * numbers on screen as if they were current.
 */
export function mediaSummaryLoadingState() {
  return { status: MEDIA_SUMMARY_STATUS.LOADING, summary: null, error: null };
}

/**
 * Map the `apiGetMediaAssetSummary()` result to view state.
 *
 *   {ok:true,  data:<usable>}      → ready         (partial payloads included;
 *                                                   missing fields render `—`)
 *   {ok:true,  data:<unusable>}    → error         (MALFORMED_SUMMARY — never a
 *                                                   zero-filled summary)
 *   {ok:false, status:401|403}     → unauthorized  (no cards, no zeros)
 *   {ok:false, status:other/0}     → error         (message/status preserved)
 *
 * `summary` is `null` for every non-ready state, so stale counts cannot
 * survive a failed read.
 */
export function mediaSummaryOutcome(result) {
  if (result?.ok === true) {
    const summary = normaliseMediaSummary(result.data);
    if (summary.ok) {
      return { status: MEDIA_SUMMARY_STATUS.READY, summary, error: null };
    }
    return {
      status: MEDIA_SUMMARY_STATUS.ERROR,
      summary: null,
      error: {
        message: "The media summary response was incomplete.",
        status: 200,
        code: "MALFORMED_SUMMARY",
        details: null,
      },
    };
  }

  const status = readCount(result?.status) ?? 0;
  const unauthorized = status === 401 || status === 403;

  return {
    status: unauthorized ? MEDIA_SUMMARY_STATUS.UNAUTHORIZED : MEDIA_SUMMARY_STATUS.ERROR,
    summary: null,
    error: {
      message: result?.error || "The media summary could not be loaded.",
      status,
      code: result?.code ?? null,
      details: result?.details ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Asset list: identity-preserving normalisation
// ---------------------------------------------------------------------------

/**
 * One list item, verbatim where the backend supplied a value.
 *
 *   {id, objectKey, url, status, mimeType, scope,
 *    productId, productName, productSku}
 *
 * `status` is the RAW persisted value (`"uploaded"`); the human label
 * ("Registered") is a rendering decision made later, never a data rewrite.
 * Product fields are `null` when the asset is not product-mapped — no
 * placeholder product is invented.
 *
 * Returns `null` when the row has no usable `objectKey`: without it the row
 * has no identity, no URL and no link target.
 */
export function normaliseMediaAsset(item) {
  if (!isPlainObject(item)) return null;
  const objectKey = readText(item.objectKey);
  if (!objectKey) return null;

  const id = item.id === 0 || item.id ? String(item.id).trim() : "";
  return {
    id: id || null,
    objectKey,
    url: readText(item.url),
    status: readText(item.status),
    mimeType: readText(item.mimeType),
    scope: readText(item.scope),
    productId: readText(item.productId),
    productName: readText(item.productName),
    productSku: readText(item.productSku),
  };
}

/**
 * Normalise a `GET /media/assets` page.
 *
 *   {ok, items, total, page, pageSize, dropped}
 *
 * · `ok` is false when the payload is not an object or `items` is not an
 *   array — a malformed response is never reported as an empty page.
 *   (`items: []` with `total: 0` is a successful empty page and stays ok.)
 * · `total` is the backend's count or `null`. It is NOT back-filled from
 *   `items.length`: a page can be short for many reasons and a fabricated
 *   total would misreport the registry size.
 * · `page`/`pageSize` echo the requested values when the payload omits them
 *   (the request is known; the server's echo is preferred when present).
 * · `dropped` counts rows discarded for lacking an object key, so an
 *   operator-facing surface can disclose it rather than silently shrinking.
 */
export function normaliseMediaAssetPage(payload, { page = 1, pageSize = 50 } = {}) {
  const requestedPage = positiveInt(page, 1);
  const requestedSize = positiveInt(pageSize, 50);

  if (!isPlainObject(payload) || !Array.isArray(payload.items)) {
    return {
      ok: false,
      items: [],
      total: null,
      page: requestedPage,
      pageSize: requestedSize,
      dropped: 0,
    };
  }

  const normalised = payload.items.map(normaliseMediaAsset);
  const items = normalised.filter(Boolean);

  return {
    ok: true,
    items,
    total: readCount(payload.total),
    page: positiveInt(payload.page, requestedPage),
    pageSize: positiveInt(payload.pageSize, requestedSize),
    dropped: normalised.length - items.length,
  };
}

/**
 * Footer text for the registry list: `Showing 1–24 of 120`.
 *
 * · `total: null` (unknown) → `Showing — of —`; a failed/malformed read never
 *   renders a numeric range.
 * · `total: 0` → `Showing 0 of 0`.
 * · an over-range page with no rows → `Showing 0 of N`.
 */
export function formatShowingRange({ page = 1, pageSize = 24, total = null, count = 0 } = {}) {
  const safeTotal = readCount(total);
  if (safeTotal === null) return `Showing ${UNKNOWN_VALUE} of ${UNKNOWN_VALUE}`;

  const currentPage = positiveInt(page, 1);
  const currentSize = positiveInt(pageSize, 24);
  const rows = Number.isInteger(count) && count > 0 ? count : 0;

  if (safeTotal === 0 || rows === 0) return `Showing 0 of ${safeTotal}`;

  const first = (currentPage - 1) * currentSize + 1;
  const last = Math.min(safeTotal, first + rows - 1);
  return `Showing ${first}–${last} of ${safeTotal}`;
}

// ---------------------------------------------------------------------------
// Registry page state — the list-state contract (Batch 5)
// ---------------------------------------------------------------------------

/**
 * The states the registry list can be in. Only `ready` may show rows, a total
 * or a range; an empty success is `ready` with `total: 0`.
 */
export const MEDIA_PAGE_STATUS = Object.freeze({
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
  UNAUTHORIZED: "unauthorized",
});

/** The state a list read starts in — and the state every new read resets to. */
export function mediaPageLoadingState({ page = 1, pageSize = 24 } = {}) {
  return {
    status: MEDIA_PAGE_STATUS.LOADING,
    items: [],
    total: null,
    page,
    pageSize,
    dropped: 0,
    error: null,
  };
}

/**
 * Map an `apiListMediaAssets()` result to registry view state.
 *
 * The RAW body (`result.data`, added in Batch 5) is the input to
 * `normaliseMediaAssetPage`, so:
 *
 *   · a missing/invalid `total` stays `null` — never `items.length`;
 *   · a genuine `total: 0` is a successful empty page;
 *   · server page/page-size win, request values are the fallback.
 *
 * A result with no usable body (a malformed payload, or a caller on an older
 * client shape without `data`) is `error`, not an empty page — a response we
 * could not read must never look like "no media".
 *
 * 401/403 map to `unauthorized`; everything else to `error`. `items` and
 * `total` are always empty/null in those states, so stale rows and counts can
 * never survive a failed read.
 */
export function mediaAssetPageOutcome(result, { page = 1, pageSize = 24 } = {}) {
  if (result?.ok === true) {
    const payload = result.data;
    const normalised = normaliseMediaAssetPage(payload, { page, pageSize });
    if (normalised.ok) {
      return {
        status: MEDIA_PAGE_STATUS.READY,
        items: normalised.items,
        total: normalised.total,
        page: normalised.page,
        pageSize: normalised.pageSize,
        dropped: normalised.dropped,
        error: null,
      };
    }
    return {
      ...mediaPageLoadingState({ page, pageSize }),
      status: MEDIA_PAGE_STATUS.ERROR,
      error: {
        message: "The media registry response could not be read.",
        status: 200,
        code: "MALFORMED_PAGE",
      },
    };
  }

  const status = readCount(result?.status) ?? 0;
  const unauthorized = status === 401 || status === 403;
  return {
    ...mediaPageLoadingState({ page, pageSize }),
    status: unauthorized ? MEDIA_PAGE_STATUS.UNAUTHORIZED : MEDIA_PAGE_STATUS.ERROR,
    error: {
      message: result?.error || "The media registry could not be loaded.",
      status,
      code: result?.code ?? null,
    },
  };
}

/**
 * Does this request carry any narrowing filter? Drives the empty-state copy:
 *
 *   total === 0 && !hasFilters → "No media has been registered yet."
 *   total === 0 &&  hasFilters → "No assets match these filters."
 *
 * Derived from the REQUEST (not from the rows), so the two cases stay
 * distinguishable even when the page is empty.
 */
export function mediaPageHasFilters({ tabId = "ALL", q = "" } = {}) {
  return getMediaRegistryTab(tabId).id !== "ALL" || String(q ?? "").trim() !== "";
}

/** Last page number for a known total, or null when the total is unknown. */
export function mediaPageCount({ total = null, pageSize = 24 } = {}) {
  const safeTotal = readCount(total);
  if (safeTotal === null) return null;
  const size = positiveInt(pageSize, 24);
  return Math.max(1, Math.ceil(safeTotal / size));
}

export default {
  LARGE_FILE_BYTES,
  UNKNOWN_VALUE,
  MEDIA_REGISTRY_TABS,
  getMediaRegistryTab,
  buildMediaListParams,
  readCount,
  normaliseMediaSummary,
  buildMediaCardModels,
  MEDIA_SUMMARY_STATUS,
  mediaSummaryLoadingState,
  mediaSummaryOutcome,
  MEDIA_PAGE_STATUS,
  mediaPageLoadingState,
  mediaAssetPageOutcome,
  mediaPageHasFilters,
  mediaPageCount,
  normaliseMediaAsset,
  normaliseMediaAssetPage,
  formatShowingRange,
};
