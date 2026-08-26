/**
 * PRATIKSHYA FASHON — Wishlist API
 * Maps to API_CONTRACT.md § WISHLIST
 *
 * All endpoints require Customer JWT.
 * Guest wishlists remain localStorage-only (per spec — no merge path).
 *
 * Response shape (all endpoints): { ok, items: [productId], count }
 */
import { apiClient, ApiError } from "./apiClient";

function handleError(err) {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  return { ok: false, error: "An unexpected error occurred." };
}

function normaliseWishlist(data) {
  return {
    ok:    true,
    items: data.items ?? [],
    count: data.count ?? (data.items?.length ?? 0),
  };
}

/** GET /wishlist */
export async function apiGetWishlist() {
  try {
    const data = await apiClient.get("/wishlist");
    return normaliseWishlist(data);
  } catch (err) {
    return handleError(err);
  }
}

/** POST /wishlist/{productId} — add product (idempotent) */
export async function apiAddToWishlist(productId) {
  try {
    const data = await apiClient.post(`/wishlist/${productId}`, {});
    return normaliseWishlist(data);
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE /wishlist/{productId} — remove product */
export async function apiRemoveFromWishlist(productId) {
  try {
    const data = await apiClient.delete(`/wishlist/${productId}`);
    return normaliseWishlist(data);
  } catch (err) {
    return handleError(err);
  }
}

/** POST /wishlist/{productId}/toggle — toggle saved state */
export async function apiToggleWishlist(productId) {
  try {
    const data = await apiClient.post(`/wishlist/${productId}/toggle`, {});
    return normaliseWishlist(data);
  } catch (err) {
    return handleError(err);
  }
}
