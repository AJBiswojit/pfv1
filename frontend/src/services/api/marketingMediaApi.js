/**
 * PRATIKSHYA FASHON — Marketing Media API (B-02)
 *
 * Backend-managed marketing placements including HOME_HERO.
 *
 * Admin:
 *   GET    /admin/marketing/media
 *   POST   /admin/marketing/media
 *   GET    /admin/marketing/media/{id}
 *   PATCH  /admin/marketing/media/{id}
 *   DELETE /admin/marketing/media/{id}
 *   PUT    /admin/marketing/media/reorder
 *
 * Public:
 *   GET    /marketing/placements/{placement}
 *   GET    /marketing/hero
 */

import { apiClient, handleError } from "./apiClient";

export async function apiListMarketingMedia({ placement, activeOnly = false } = {}) {
  try {
    const params = new URLSearchParams();
    if (placement) params.set("placement", placement);
    if (activeOnly) params.set("activeOnly", "true");
    const qs = params.toString();
    const url = qs ? `/admin/marketing/media?${qs}` : "/admin/marketing/media";
    const data = await apiClient.get(url, { scope: "admin" });
    return {
      ok: true,
      items: data.items ?? [],
      total: data.total ?? 0,
      placement: data.placement ?? placement ?? null,
    };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiCreateMarketingMedia(payload) {
  try {
    const data = await apiClient.post("/admin/marketing/media", payload, { scope: "admin" });
    return { ok: true, item: data };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiGetMarketingMedia(id) {
  try {
    const data = await apiClient.get(`/admin/marketing/media/${encodeURIComponent(id)}`, {
      scope: "admin",
    });
    return { ok: true, item: data };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiUpdateMarketingMedia(id, payload) {
  try {
    const data = await apiClient.patch(
      `/admin/marketing/media/${encodeURIComponent(id)}`,
      payload,
      { scope: "admin" }
    );
    return { ok: true, item: data };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiDeleteMarketingMedia(id) {
  try {
    const data = await apiClient.delete(`/admin/marketing/media/${encodeURIComponent(id)}`, {
      scope: "admin",
    });
    return { ok: true, data };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiReorderMarketingMedia({ placement = "HOME_HERO", items = [] } = {}) {
  try {
    const data = await apiClient.put(
      "/admin/marketing/media/reorder",
      { placement, items },
      { scope: "admin" }
    );
    return { ok: true, items: data.items ?? [] };
  } catch (err) {
    return handleError(err);
  }
}

// Public — storefront
export async function apiGetMarketingPlacement(placement) {
  try {
    const data = await apiClient.get(`/marketing/placements/${encodeURIComponent(placement)}`, {
      scope: "none",
    });
    return {
      ok: true,
      items: data.items ?? [],
      total: data.total ?? 0,
      placement: data.placement ?? placement,
    };
  } catch (err) {
    return handleError(err);
  }
}

export async function apiGetHomeHero() {
  try {
    const data = await apiClient.get("/marketing/hero", { scope: "none" });
    return {
      ok: true,
      items: data.items ?? [],
      total: data.total ?? 0,
      placement: data.placement ?? "HOME_HERO",
    };
  } catch (err) {
    return handleError(err);
  }
}
