/**
 * Instagram Rewards API Client.
 *
 * Normalizes backend Instagram reward responses for the frontend.
 */

import { apiClient, handleError } from "./apiClient";

export function normaliseInstagramReward(data) {
  if (!data) return null;
  return {
    id: data.id,
    customerId: data.customer_id,
    customerName: data.customer_name ?? "Customer",
    customerEmail: data.customer_email ?? "",
    orderId: data.order_id,
    orderNumber: data.order_number ?? data.order_id,
    instagramUsername: data.instagram_username ?? "",
    instagramPostUrl: data.instagram_post_url ?? "",
    status: data.status ?? "PENDING",
    verifiedBy: data.verified_by ?? null,
    verifierName: data.verifier_name ?? null,
    verifiedAt: data.verified_at ?? null,
    rejectionReason: data.rejection_reason ?? null,
    couponId: data.coupon_id ?? null,
    couponCode: data.coupon_code ?? null,
    coupon: data.coupon
      ? {
          id: data.coupon.id,
          code: data.coupon.code,
          discountPercentage: data.coupon.discount_percentage,
          customerId: data.coupon.customer_id,
          isUsed: Boolean(data.coupon.is_used),
          usageLimit: data.coupon.usage_limit,
          timesUsed: data.coupon.times_used,
          validUntil: data.coupon.valid_until,
          createdAt: data.coupon.created_at,
        }
      : null,
    createdAt: data.created_at ?? null,
    updatedAt: data.updated_at ?? null,
  };
}

/** Admin — List Instagram reward submissions with filtering & pagination. */
export async function apiAdminListInstagramRewards({
  status,
  customer,
  order,
  search,
  page = 1,
  limit = 50,
} = {}) {
  try {
    const params = new URLSearchParams();
    if (status && status !== "ALL") params.append("status", status);
    if (customer) params.append("customer", customer);
    if (order) params.append("order", order);
    if (search) params.append("search", search);
    params.append("page", String(page));
    params.append("limit", String(limit));

    const data = await apiClient.get(`/admin/instagram-rewards?${params.toString()}`, {
      scope: "admin",
    });

    const items = (data.data?.items ?? []).map(normaliseInstagramReward);
    return {
      ok: true,
      items,
      total: data.data?.total ?? items.length,
      page: data.data?.page ?? page,
      limit: data.data?.limit ?? limit,
      totalPages: data.data?.total_pages ?? 1,
    };
  } catch (err) {
    return handleError(err);
  }
}

/** Admin — View single reward submission details. */
export async function apiAdminGetInstagramRewardDetail(rewardId) {
  try {
    const data = await apiClient.get(`/admin/instagram-rewards/${rewardId}`, {
      scope: "admin",
    });
    return {
      ok: true,
      reward: normaliseInstagramReward(data.data ?? data),
    };
  } catch (err) {
    return handleError(err);
  }
}

/** Admin — Approve reward and generate discount coupon. */
export async function apiAdminApproveInstagramReward(rewardId, notes, discountPercentage, minimumOrderValue = 0) {
  try {
    if (!discountPercentage || discountPercentage <= 0 || discountPercentage > 100) {
      return { ok: false, error: "Discount percentage is required and must be between 1 and 100." };
    }
    const payload = {
      discount_percentage: discountPercentage,
      minimum_order_value: minimumOrderValue ?? 0,
    };
    if (notes) payload.notes = notes;
    const data = await apiClient.post(
      `/admin/instagram-rewards/${rewardId}/approve`,
      payload,
      { scope: "admin" }
    );
    return {
      ok: true,
      reward: normaliseInstagramReward(data.data ?? data),
      message: data.message ?? "Instagram reward approved successfully.",
    };
  } catch (err) {
    return handleError(err);
  }
}

/** Admin — Reject reward submission. */
export async function apiAdminRejectInstagramReward(rewardId, reason) {
  try {
    const data = await apiClient.post(
      `/admin/instagram-rewards/${rewardId}/reject`,
      { reason },
      { scope: "admin" }
    );
    return {
      ok: true,
      reward: normaliseInstagramReward(data.data ?? data),
      message: data.message ?? "Instagram reward rejected successfully.",
    };
  } catch (err) {
    return handleError(err);
  }
}

/** Admin — Re-open a rejected reward back to pending. */
export async function apiAdminReopenInstagramReward(rewardId) {
  try {
    const data = await apiClient.post(
      `/admin/instagram-rewards/${rewardId}/reopen`,
      {},
      { scope: "admin" }
    );
    return {
      ok: true,
      reward: normaliseInstagramReward(data.data ?? data),
      message: data.message ?? "Reward re-opened successfully.",
    };
  } catch (err) {
    return handleError(err);
  }
}

/** Admin — Manually add/issue customer reward. */
export async function apiAdminManualClaimInstagramReward({
  customerIdentifier,
  orderIdentifier,
  instagramUsername,
  instagramPostUrl,
  autoApprove = true,
  notes,
  discountPercentage,
}) {
  try {
    if (!discountPercentage || discountPercentage <= 0 || discountPercentage > 100) {
      return { ok: false, error: "Discount percentage is required and must be between 1 and 100." };
    }
    const data = await apiClient.post(
      "/admin/instagram-rewards/manual-claim",
      {
        customer_identifier: customerIdentifier,
        order_identifier: orderIdentifier,
        instagram_username: instagramUsername || "manual_claim",
        instagram_post_url: instagramPostUrl || null,
        auto_approve: autoApprove,
        notes: notes || null,
        discount_percentage: discountPercentage != null ? discountPercentage : null,
      },
      { scope: "admin" }
    );
    return {
      ok: true,
      reward: normaliseInstagramReward(data.data ?? data),
      message: data.message ?? "Customer reward created successfully.",
    };
  } catch (err) {
    return handleError(err);
  }
}

/** Customer — Submit Instagram reward claim. */
export async function apiCustomerSubmitInstagramReward({ orderId, instagramUsername, instagramPostUrl }) {
  try {
    const data = await apiClient.post(
      "/customer/instagram-rewards",
      {
        order_id: orderId,
        instagram_username: instagramUsername,
        instagram_post_url: instagramPostUrl || null,
      },
      { scope: "customer" }
    );
    return {
      ok: true,
      reward: normaliseInstagramReward(data.data ?? data),
      message: data.message ?? "Reward submission received.",
    };
  } catch (err) {
    return handleError(err);
  }
}

/** Customer — View reward history. */
export async function apiCustomerGetInstagramRewards({ page = 1, limit = 20 } = {}) {
  try {
    const data = await apiClient.get(`/customer/instagram-rewards?page=${page}&limit=${limit}`, {
      scope: "customer",
    });
    const items = (data.data?.items ?? []).map(normaliseInstagramReward);
    return {
      ok: true,
      items,
      total: data.data?.total ?? items.length,
      page: data.data?.page ?? page,
      limit: data.data?.limit ?? limit,
      totalPages: data.data?.total_pages ?? 1,
    };
  } catch (err) {
    return handleError(err);
  }
}
