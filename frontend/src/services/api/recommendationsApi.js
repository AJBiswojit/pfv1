/** Behavioral API only; no client-side recommendation repository or fallback. */
import { apiClient, getAccessToken, handleError } from "./apiClient";
import { normaliseProduct, apiGetRecommendations } from "./productsApi";

export async function apiGetPersonalRecommendations(type = "personalized") {
  try {
    const data = await apiClient.get(`/customers/me/recommendations?type=${encodeURIComponent(type)}&limit=4`, { scope: "customer" });
    return { ok: true, items: (data.items ?? []).map(normaliseProduct) };
  } catch (error) {
    return handleError(error);
  }
}

export async function apiTrackProductInteraction(productId, eventType = "CLICK") {
  if (!productId || !getAccessToken("customer")) return { ok: false, skipped: true };
  try {
    await apiClient.post("/customers/me/product-interactions", {
      productId, eventType,
      ...(globalThis.crypto?.randomUUID ? { idempotencyKey: globalThis.crypto.randomUUID() } : {}),
    }, { scope: "customer" });
    return { ok: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Stable, cross-section deduplication. Never manufacture missing cards. */
export function uniqueRecommendationSections(sections, exclude = [], limit = 4) {
  const seen = new Set(exclude.filter(Boolean).map(String));
  return Object.fromEntries(Object.entries(sections).map(([name, rows]) => {
    const selected = [];
    for (const product of rows ?? []) {
      if (selected.length >= limit) break;
      if (!product?.id || seen.has(String(product.id))) continue;
      seen.add(String(product.id));
      selected.push(product);
    }
    return [name, selected];
  }));
}

export async function loadRecommendationSections({ placement, productId, customerId, cartIds = [] }) {
  const jobs = [];
  if (customerId && (placement === "mirror" || placement === "home")) {
    jobs.push(["personalized", () => apiGetPersonalRecommendations()]);
    if (placement === "mirror") jobs.push(["becauseViewed", () => apiGetPersonalRecommendations("because-viewed")]);
  }
  if (productId && (placement === "mirror" || placement === "product")) {
    jobs.push(["related", () => apiGetRecommendations(productId, "related")]);
    jobs.push(["completeTheLook", () => apiGetRecommendations(productId, "complete-the-look")]);
    if (placement === "product") jobs.push(["recommended", () => apiGetRecommendations(productId, "recommended")]);
  }
  if (placement === "cart") {
    // Bound requests regardless of bag size. All bag products are still excluded.
    [...new Set(cartIds)].slice(0, 4).forEach((id) => jobs.push(["completeTheLook", () => apiGetRecommendations(id, "cart")]));
  }
  const responses = await Promise.all(jobs.map(async ([name, load]) => {
    try { return [name, await load()]; }
    catch { return [name, { ok: false }]; }
  }));
  const sections = {};
  for (const [name, result] of responses) {
    sections[name] = [...(sections[name] ?? []), ...(result.ok ? result.items ?? [] : [])];
  }
  return {
    sections: uniqueRecommendationSections(sections, [productId, ...cartIds]),
    status: responses.some(([, result]) => !result.ok) ? "error" : "ready",
  };
}
