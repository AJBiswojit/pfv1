/**
 * PRATIKSHYA FASHON — Search & Explore API
 * Maps to API_CONTRACT.md § SEARCH + EXPLORE
 */
import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

function buildParams(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    } else {
      qs.set(key, String(value));
    }
  }
  return qs.toString();
}

/**
 * GET /search
 * Returns { items, total, facets, suggestions, appliedFilters }
 */
export async function apiSearch(query = {}) {
  try {
    const qs = buildParams({
      q:            query.q,
      category:     query.category,
      subcategory:  query.subcategory,
      gender:       query.gender,
      price:        query.price,
      size:         query.size,
      color:        query.color,
      fabric:       query.fabric,
      material:     query.material,
      occasion:     query.occasion,
      collection:   query.collection,
      rating:       query.rating,
      availability: query.availability,
      sort:         query.sort ?? "recommended",
      page:         query.page ?? 1,
      pageSize:     query.pageSize ?? 20,
    });
    const data = await apiClient.get(`/search?${qs}`, { skipAuth: true });
    return {
      ok:             true,
      items:          data.items          ?? [],
      total:          data.total          ?? 0,
      facets:         data.facets         ?? {},
      suggestions:    data.suggestions    ?? [],
      appliedFilters: data.applied_filters ?? data.appliedFilters ?? {},
    };
  } catch (err) { return handleError(err); }
}

/**
 * GET /explore
 * Returns { items, total, page, pageSize, hasMore, stream }
 */
export async function apiGetExplore(query = {}) {
  try {
    const qs = buildParams({
      q:            query.q,
      category:     query.category,
      subcategory:  query.subcategory,
      gender:       query.gender,
      price:        query.price,
      size:         query.size,
      color:        query.color,
      fabric:       query.fabric,
      material:     query.material,
      occasion:     query.occasion,
      collection:   query.collection,
      rating:       query.rating,
      availability: query.availability,
      sort:         query.sort ?? "recommended",
      page:         query.page ?? 1,
      pageSize:     query.pageSize ?? 20,
    });
    const data = await apiClient.get(`/explore?${qs}`, { skipAuth: true });
    return {
      ok:       true,
      items:    data.items    ?? [],
      total:    data.total    ?? 0,
      page:     data.page     ?? 1,
      pageSize: data.page_size ?? data.pageSize ?? 20,
      hasMore:  data.has_more ?? data.hasMore   ?? false,
      stream:   data.stream   ?? [],
    };
  } catch (err) { return handleError(err); }
}

/**
 * GET /explore/offers
 */
export async function apiGetExploreOffers() {
  try {
    const data = await apiClient.get("/explore/offers", { skipAuth: true });
    return { ok: true, offers: data.offers ?? data.items ?? data ?? [] };
  } catch (err) { return handleError(err); }
}

/**
 * GET /home
 */
export async function apiGetHome() {
  try {
    const data = await apiClient.get("/home", { skipAuth: true });
    return { ok: true, ...data };
  } catch (err) { return handleError(err); }
}
