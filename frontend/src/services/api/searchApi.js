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
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      value.filter((v) => v !== undefined && v !== null && v !== "").forEach((v) => qs.append(key, v));
    } else {
      qs.set(key, String(value));
    }
  }
  return qs.toString();
}

const DEPARTMENT_BACKEND_FILTERS = {
  women:  { gender: "Women" },
  men:    { category: "menswear" },
  bridal: { category: "bridal-couture" },
  kids:   { category: "kidswear" },
};

function normaliseStorefrontQuery(query = {}) {
  const normalized = { ...query };
  const department = String(normalized.department ?? "").toLowerCase();
  delete normalized.department;
  if (department && DEPARTMENT_BACKEND_FILTERS[department] && !normalized.category && !normalized.subcategory) {
    Object.assign(normalized, DEPARTMENT_BACKEND_FILTERS[department]);
  }
  return normalized;
}

/**
 * GET /search
 * Returns { items, total, facets, suggestions, appliedFilters }
 */
export async function apiSearch(query = {}) {
  try {
    const q = normaliseStorefrontQuery(query);
    const qs = buildParams({
      q:            q.q,
      category:     q.category,
      subcategory:  q.subcategory,
      gender:       q.gender,
      price:        q.price,
      size:         q.size,
      color:        q.color,
      fabric:       q.fabric,
      material:     q.material,
      occasion:     q.occasion,
      collection:   q.collection,
      rating:       q.rating,
      availability: q.availability,
      sort:         q.sort ?? "recommended",
      page:         q.page ?? 1,
      pageSize:     q.pageSize ?? 20,
    });
    const data = await apiClient.get(`/search?${qs}`, { scope: "none" });
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
    const q = normaliseStorefrontQuery(query);
    const qs = buildParams({
      q:            q.q,
      category:     q.category,
      subcategory:  q.subcategory,
      gender:       q.gender,
      price:        q.price,
      size:         q.size,
      color:        q.color,
      fabric:       q.fabric,
      material:     q.material,
      occasion:     q.occasion,
      collection:   q.collection,
      rating:       q.rating,
      availability: q.availability,
      sort:         q.sort ?? "recommended",
      page:         q.page ?? 1,
      pageSize:     q.pageSize ?? 20,
    });
    const data = await apiClient.get(`/explore?${qs}`, { scope: "none" });
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
    const data = await apiClient.get("/explore/offers", { scope: "none" });
    return { ok: true, offers: data.offers ?? data.items ?? data ?? [] };
  } catch (err) { return handleError(err); }
}

/**
 * GET /home
 */
export async function apiGetHome() {
  try {
    const data = await apiClient.get("/home", { scope: "none" });
    return { ok: true, ...data };
  } catch (err) { return handleError(err); }
}
