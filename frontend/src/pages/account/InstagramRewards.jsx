import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Sparkles,
  XCircle,
  Check,
} from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import { useOrder } from "../../context/OrderContext";
import { useAuth } from "../../context/AuthContext";
import {
  apiCustomerGetInstagramRewards,
  apiCustomerSubmitInstagramReward,
} from "../../services/api/instagramRewardsApi";
import {
  AtelierBadge,
  AtelierButton,
  EditorialHeading,
  EmptyState,
  Rule,
} from "../../design-system";

function formatDate(isoStr) {
  if (!isoStr) return "N/A";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(isoStr);
  }
}

export default function InstagramRewards() {
  const { user } = useAuth();
  const { orders, isLoadingOrders } = useOrder();

  const [submissions, setSubmissions] = useState([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
  const [error, setError] = useState(null);
  const [rewardPct, setRewardPct] = useState(10); // Updated dynamically from backend response

  // Form state
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [instagramPostUrl, setInstagramPostUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  const fetchSubmissions = useCallback(async () => {
    setIsLoadingSubmissions(true);
    const res = await apiCustomerGetInstagramRewards({ page: 1, limit: 50 });
    setIsLoadingSubmissions(false);
    if (res.ok) {
      setSubmissions(res.items ?? []);
      // If items exist with coupon details, derive discount percentage dynamically
      const approvedWithCoupon = (res.items ?? []).find((i) => i.coupon?.discountPercentage);
      if (approvedWithCoupon) {
        setRewardPct(approvedWithCoupon.coupon.discountPercentage);
      }
      setError(null);
    } else {
      setError(res.error ?? "Could not load reward submissions.");
    }
  }, []);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Share & Earn — PRATIKSHYA FASHON";
    fetchSubmissions();
    return () => {
      document.title = prevTitle;
    };
  }, [fetchSubmissions]);

  // Set of order IDs that are already pending or approved
  const existingRewardOrderIds = useMemo(() => {
    return new Set(
      submissions
        .filter((s) => s.status === "PENDING" || s.status === "APPROVED")
        .map((s) => s.orderId)
    );
  }, [submissions]);

  // Qualifying orders (PAID / COMPLETED)
  const eligibleOrders = useMemo(() => {
    return (orders ?? []).filter((ord) => {
      const pStatus = (ord.payment_status || ord.paymentStatus || "").toUpperCase();
      const oStatus = (ord.status || "").toUpperCase();
      return (
        pStatus === "PAID" ||
        ["DELIVERED", "COMPLETED", "ORDER_CONFIRMED", "SHIPPED", "DISPATCHED"].includes(oStatus)
      );
    });
  }, [orders]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);

    if (!selectedOrderId) {
      setFormError("Please select an eligible purchase order.");
      return;
    }
    if (!instagramUsername.trim()) {
      setFormError("Please enter your Instagram username.");
      return;
    }

    setIsSubmitting(true);
    const res = await apiCustomerSubmitInstagramReward({
      orderId: selectedOrderId,
      instagramUsername: instagramUsername.trim(),
      instagramPostUrl: instagramPostUrl.trim() || undefined,
    });
    setIsSubmitting(false);

    if (res.ok) {
      setSuccessMsg("Reward request submitted successfully! Our team will verify your post.");
      setSelectedOrderId("");
      setInstagramUsername("");
      setInstagramPostUrl("");
      fetchSubmissions();
    } else {
      setFormError(res.error || "Failed to submit reward request. Please try again.");
    }
  };

  const handleCopyCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <AccountShell breadcrumbItems={[{ label: "Account", to: "/account" }, { label: "Share & Earn" }]}>
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <p className="font-ui text-xs uppercase tracking-[.2em] text-accent mb-1 font-medium">
            Loyalty Rewards
          </p>
          <EditorialHeading level={2} className="text-3xl md:text-4xl text-ink">
            Share & Earn
          </EditorialHeading>
          <p className="mt-2 font-ui text-sm text-taupe leading-relaxed max-w-2xl">
            Style your Pratikshya Fashion sarees and outfits, share a photo or video, and claim a personal reward discount coupon on your next order!
          </p>
        </div>

        {/* 1. Step-by-Step Instructions Banner */}
        <div className="bg-surface/50 border border-mist p-6 rounded-sm mb-10 shadow-xs">
          <h3 className="font-display text-lg text-ink mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            How to Claim Your Reward
          </h3>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-ui">
            <li className="bg-white/90 p-3.5 border border-mist/60 rounded-xs flex gap-3">
              <span className="font-bold text-accent font-mono text-sm">1.</span>
              <span className="text-taupe">Purchase a Pratikshya Fashion product.</span>
            </li>
            <li className="bg-white/90 p-3.5 border border-mist/60 rounded-xs flex gap-3">
              <span className="font-bold text-accent font-mono text-sm">2.</span>
              <span className="text-taupe">Wear and style your product.</span>
            </li>
            <li className="bg-white/90 p-3.5 border border-mist/60 rounded-xs flex gap-3">
              <span className="font-bold text-accent font-mono text-sm">3.</span>
              <span className="text-taupe">Post your photo or video on social media or share it with us.</span>
            </li>
            <li className="bg-white/90 p-3.5 border border-mist/60 rounded-xs flex gap-3">
              <span className="font-bold text-accent font-mono text-sm">4.</span>
              <span className="text-taupe">Tag the official <strong>@pratikshyafashion</strong> account.</span>
            </li>
            <li className="bg-white/90 p-3.5 border border-mist/60 rounded-xs flex gap-3">
              <span className="font-bold text-accent font-mono text-sm">5.</span>
              <span className="text-taupe">Submit your handle and order information below.</span>
            </li>
            <li className="bg-white/90 p-3.5 border border-mist/60 rounded-xs flex gap-3">
              <span className="font-bold text-accent font-mono text-sm">6.</span>
              <span className="text-taupe">Our team will verify your post.</span>
            </li>
            <li className="bg-white/90 p-3.5 border border-mist/60 rounded-xs flex gap-3 md:col-span-2">
              <span className="font-bold text-accent font-mono text-sm">7.</span>
              <span className="text-taupe">Once approved, you will receive a discount coupon for your next purchase!</span>
            </li>
          </ol>
        </div>

        {/* 2. Submission Form */}
        <div className="bg-white border border-mist p-6 md:p-8 rounded-sm mb-12 shadow-xs">
          <h3 className="font-display text-xl text-ink mb-1">Submit Your Post</h3>
          <p className="text-xs text-taupe mb-6">
            Enter your details below. Once verified by our team, your personal discount coupon will be issued automatically.
          </p>

          {successMsg && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xs flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {formError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xs flex items-center gap-3">
              <XCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Authenticated Customer Display */}
            <div>
              <label className="block font-ui text-xs uppercase tracking-wider text-taupe mb-1">
                Account Name
              </label>
              <input
                type="text"
                disabled
                value={`${user?.fullName || user?.full_name || "Authenticated Customer"} (${user?.email})`}
                className="w-full border border-mist/80 bg-canvas px-4 py-2.5 text-xs text-taupe cursor-not-allowed"
              />
            </div>

            {/* Select Order */}
            <div>
              <label className="block font-ui text-xs uppercase tracking-wider text-ink mb-1 font-medium">
                Qualifying Purchase Order *
              </label>
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                disabled={isLoadingOrders || isSubmitting}
                className="w-full border border-mist bg-white px-4 py-2.5 text-xs text-ink focus:outline-none focus:border-accent"
              >
                <option value="">-- Select an eligible order --</option>
                {eligibleOrders.map((ord) => {
                  const isSubmitted = existingRewardOrderIds.has(ord.id);
                  return (
                    <option key={ord.id} value={ord.id} disabled={isSubmitted}>
                      #{ord.order_number || ord.orderNumber || ord.id.slice(0, 8)}{" "}
                      - {formatDate(ord.created_at || ord.createdAt)}{" "}
                      {isSubmitted ? " (Already Submitted)" : ""}
                    </option>
                  );
                })}
              </select>
              {eligibleOrders.length === 0 && !isLoadingOrders && (
                <p className="mt-1 text-[11px] text-taupe">
                  No completed orders found. Place an order first to participate!
                </p>
              )}
            </div>

            {/* Instagram Username */}
            <div>
              <label className="block font-ui text-xs uppercase tracking-wider text-ink mb-1 font-medium">
                Handle / Username *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-taupe font-mono">
                  @
                </span>
                <input
                  type="text"
                  value={instagramUsername}
                  onChange={(e) => setInstagramUsername(e.target.value)}
                  placeholder="your_instagram_handle"
                  disabled={isSubmitting}
                  className="w-full pl-7 pr-4 py-2.5 border border-mist bg-white text-xs text-ink focus:outline-none focus:border-accent font-mono"
                />
              </div>
              <p className="mt-1 text-[11px] text-taupe">
                Do not include leading @ (e.g. enter <code>janedoe_fashion</code>).
              </p>
            </div>

            {/* Instagram Post URL */}
            <div>
              <label className="block font-ui text-xs uppercase tracking-wider text-ink mb-1 font-medium">
                Post / Story Link (Optional)
              </label>
              <input
                type="url"
                value={instagramPostUrl}
                onChange={(e) => setInstagramPostUrl(e.target.value)}
                placeholder="https://www.instagram.com/p/C123456789/"
                disabled={isSubmitting}
                className="w-full px-4 py-2.5 border border-mist bg-white text-xs text-ink focus:outline-none focus:border-accent"
              />
              <p className="mt-1 text-[11px] text-taupe">
                Direct link helps our staff verify your post faster.
              </p>
            </div>

            <AtelierButton
              type="submit"
              disabled={isSubmitting || eligibleOrders.length === 0}
              className="mt-2"
            >
              {isSubmitting ? "Submitting Request..." : "Submit Reward Request"}
            </AtelierButton>
          </form>
        </div>

        {/* 3. Submissions History */}
        <div className="bg-white border border-mist p-6 md:p-8 rounded-sm">
          <h3 className="font-display text-xl text-ink mb-6">Your Reward Submissions</h3>

          {isLoadingSubmissions ? (
            <div className="py-8 text-center text-xs text-taupe animate-pulse">
              Loading reward submissions...
            </div>
          ) : submissions.length === 0 ? (
            <EmptyState
              eyebrow="No claims yet"
              title="No reward claims submitted"
              description="Submit your first Instagram post claim above to earn a discount coupon!"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-mist text-[10px] uppercase tracking-widest text-taupe">
                    <th className="py-3 px-3">Order ID</th>
                    <th className="py-3 px-3">Instagram Username</th>
                    <th className="py-3 px-3">Submitted Date</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Coupon Code</th>
                    <th className="py-3 px-3">Coupon Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist/60">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-surface/30">
                      {/* Order ID */}
                      <td className="py-4 px-3 font-mono font-medium text-ink">
                        <Link to={`/account/orders`} className="hover:underline">
                          #{sub.orderNumber || sub.orderId}
                        </Link>
                      </td>

                      {/* Instagram Username */}
                      <td className="py-4 px-3">
                        <div className="font-medium text-ink">@{sub.instagramUsername}</div>
                        {sub.instagramPostUrl && (
                          <a
                            href={sub.instagramPostUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-accent underline flex items-center gap-1 mt-0.5"
                          >
                            View Post <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </td>

                      {/* Submitted Date */}
                      <td className="py-4 px-3 text-taupe">{formatDate(sub.createdAt)}</td>

                      {/* Status */}
                      <td className="py-4 px-3">
                        {sub.status === "APPROVED" && (
                          <AtelierBadge variant="success">Approved</AtelierBadge>
                        )}
                        {sub.status === "PENDING" && (
                          <AtelierBadge variant="warning">Under Review</AtelierBadge>
                        )}
                        {sub.status === "REJECTED" && (
                          <AtelierBadge variant="error">Rejected</AtelierBadge>
                        )}
                        {sub.rejectionReason && (
                          <div className="mt-1 text-[11px] text-rose-700 max-w-xs">
                            Reason: {sub.rejectionReason}
                          </div>
                        )}
                      </td>

                      {/* Coupon Code */}
                      <td className="py-4 px-3 font-mono">
                        {sub.couponCode ? (
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 border border-emerald-200 font-bold rounded-xs">
                              {sub.couponCode}
                            </span>
                            <button
                              onClick={() => handleCopyCode(sub.couponCode)}
                              className="text-taupe hover:text-ink p-1"
                              title="Copy Coupon Code"
                            >
                              {copiedCode === sub.couponCode ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-taupe">—</span>
                        )}
                      </td>

                      {/* Coupon Expiry */}
                      <td className="py-4 px-3 text-taupe font-mono">
                        {sub.coupon?.validUntil
                          ? formatDate(sub.coupon.validUntil)
                          : sub.couponCode
                          ? "No Expiry"
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AccountShell>
  );
}
