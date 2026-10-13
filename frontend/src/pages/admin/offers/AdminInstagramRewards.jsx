import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import AdminMetricCard from "../../../components/admin/AdminMetricCard";
import { AtelierButton, AtelierBadge, EmptyState } from "../../../design-system";
import {
  apiAdminListInstagramRewards,
  apiAdminGetInstagramRewardDetail,
  apiAdminApproveInstagramReward,
  apiAdminRejectInstagramReward,
  apiAdminReopenInstagramReward,
  apiAdminManualClaimInstagramReward,
} from "../../../services/api/instagramRewardsApi";
import {
  Camera,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Eye,
  Filter,
  Search,
  UserPlus,
} from "lucide-react";

import { useAdminAuth } from "../../../context/AdminAuthContext";
import AdminAccessDenied from "../AdminAccessDenied";

function formatDate(isoStr) {
  if (!isoStr) return "N/A";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(isoStr);
  }
}

export default function AdminInstagramRewards() {
  const { hasPermission, isLoading: isAuthLoading } = useAdminAuth();
  const [rewards, setRewards] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_LIMIT = 20;
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  // Modal / Drawer state
  const [selectedReward, setSelectedReward] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [approveDiscount, setApproveDiscount] = useState("");
  const [approveMinOrder, setApproveMinOrder] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Manual claim modal state
  const [isManualClaimOpen, setIsManualClaimOpen] = useState(false);
  const [manualClaimForm, setManualClaimForm] = useState({
    customerIdentifier: "",
    orderIdentifier: "",
    notes: "",
    autoApprove: true,
    discountPercentage: "",
  });

  // Success state for newly generated coupon
  const [generatedCoupon, setGeneratedCoupon] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isAuthLoading && !hasPermission("instagram_reward.manage")) {
    return <AdminAccessDenied />;
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiAdminListInstagramRewards({
      status: statusFilter,
      search: searchQuery,
      page: currentPage,
      limit: PAGE_LIMIT,
    }).then((res) => {
      if (cancelled) return;
      setIsLoading(false);
      if (res.ok) {
        setRewards(res.items ?? []);
        setTotal(res.total ?? (res.items ?? []).length);
        setTotalPages(res.totalPages ?? 1);
        setError(null);
      } else {
        setRewards([]);
        setError(res.error ?? "Failed to load loyalty rewards.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, searchQuery, currentPage, attempt]);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  // Counts for metric cards
  const pendingCount = useMemo(
    () => rewards.filter((r) => r.status === "PENDING").length,
    [rewards]
  );
  const approvedCount = useMemo(
    () => rewards.filter((r) => r.status === "APPROVED").length,
    [rewards]
  );
  const rejectedCount = useMemo(
    () => rewards.filter((r) => r.status === "REJECTED").length,
    [rewards]
  );

  const handleOpenDetail = async (reward) => {
    setSelectedReward(reward);
    setIsDetailOpen(true);
    // Refresh latest details
    const res = await apiAdminGetInstagramRewardDetail(reward.id);
    if (res.ok && res.reward) {
      setSelectedReward(res.reward);
    }
  };

  const handleOpenApproveModal = (reward) => {
    setSelectedReward(reward);
    setApproveNotes("");
    setApproveDiscount("");
    setApproveMinOrder("");
    setIsApproveOpen(true);
  };

  const handleOpenRejectModal = (reward) => {
    setSelectedReward(reward);
    setRejectReason("");
    setIsRejectOpen(true);
  };

  const handleConfirmApproval = async () => {
    if (!selectedReward || isProcessing) return;
    if (!approveDiscount || parseFloat(approveDiscount) <= 0 || parseFloat(approveDiscount) > 100) {
      alert("Please enter a valid discount percentage between 1 and 100.");
      return;
    }
    setIsProcessing(true);
    const res = await apiAdminApproveInstagramReward(
      selectedReward.id,
      approveNotes,
      approveDiscount !== "" ? parseFloat(approveDiscount) : undefined,
      approveMinOrder !== "" ? parseFloat(approveMinOrder) : 0,
    );
    setIsProcessing(false);
    if (res.ok) {
      setIsApproveOpen(false);
      const couponCode = res.reward?.couponCode || res.reward?.coupon?.code;
      const discountPct = res.reward?.coupon?.discountPercentage || 10;
      setGeneratedCoupon({
        code: couponCode,
        discountPercentage: discountPct,
        customerName: res.reward?.customerName,
      });
      setAttempt((a) => a + 1);
    } else {
      alert(res.error || "Failed to approve reward submission.");
    }
  };

  const handleConfirmRejection = async () => {
    if (!selectedReward || isProcessing) return;
    if (!rejectReason.trim() || rejectReason.trim().length < 3) {
      alert("Please provide a rejection reason of at least 3 characters.");
      return;
    }
    setIsProcessing(true);
    const res = await apiAdminRejectInstagramReward(selectedReward.id, rejectReason.trim());
    setIsProcessing(false);
    if (res.ok) {
      setIsRejectOpen(false);
      setAttempt((a) => a + 1);
    } else {
      alert(res.error || "Failed to reject reward submission.");
    }
  };

  const handleReopen = async (reward) => {
    if (!window.confirm(`Re-open this rejected reward back to Pending?`)) return;
    setIsProcessing(true);
    const res = await apiAdminReopenInstagramReward(reward.id);
    setIsProcessing(false);
    if (res.ok) {
      setAttempt((a) => a + 1);
    } else {
      alert(res.error || "Failed to re-open reward.");
    }
  };

  const handleManualClaim = async () => {    const { customerIdentifier, orderIdentifier } = manualClaimForm;
    if (!customerIdentifier.trim() || !orderIdentifier.trim()) {
      alert("Please provide both Customer (ID or Email) and Order (ID or Number).");
      return;
    }
    setIsProcessing(true);
    const res = await apiAdminManualClaimInstagramReward({
      customerIdentifier: customerIdentifier.trim(),
      orderIdentifier: orderIdentifier.trim(),
      notes: manualClaimForm.notes.trim() || "Manual staff entry",
      autoApprove: manualClaimForm.autoApprove,
      discountPercentage: manualClaimForm.discountPercentage !== "" ? parseFloat(manualClaimForm.discountPercentage) : undefined,
    });
    setIsProcessing(false);
    if (res.ok) {
      setIsManualClaimOpen(false);
      setManualClaimForm({ customerIdentifier: "", orderIdentifier: "", notes: "", autoApprove: true, discountPercentage: "" });
      if (res.reward?.couponCode) {
        setGeneratedCoupon({
          code: res.reward.couponCode,
          discountPercentage: res.reward.coupon?.discountPercentage ?? 10,
          customerName: res.reward.customerName,
        });
      }
      setAttempt((a) => a + 1);
    } else {
      alert(res.error || "Failed to create manual reward claim.");
    }
  };

  const handleCopyCouponCode = (code) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <AdminPage
      title="Loyalty Rewards"
      eyebrow="Customer Rewards Management"
      description="Verify customer loyalty actions and issue single-use reward coupons."
      actions={
        <div className="flex gap-2">
          <AtelierButton
            size="chip"
            variant="primary"
            onClick={() => setIsManualClaimOpen(true)}
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            Add Manual Reward
          </AtelierButton>
          {error && (
            <AtelierButton size="chip" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
              Retry
            </AtelierButton>
          )}
        </div>
      }
    >
      {/* 1. Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-8">
        <AdminMetricCard label="Pending Review" value={pendingCount} />
        <AdminMetricCard label="Approved & Issued" value={approvedCount} />
        <AdminMetricCard label="Rejected" value={rejectedCount} />
        <AdminMetricCard label="Total Submissions" value={total} />
      </div>

      {/* 2. Filters & Table */}
      <AdminPanel title="Rewards Directory">
        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-stretch">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-mist pb-4">
            {["ALL", "PENDING", "APPROVED", "REJECTED"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                aria-pressed={statusFilter === st}
                className={`px-3 py-1.5 font-ui text-[10px] uppercase tracking-[.14em] transition-colors ${
                  statusFilter === st
                    ? "bg-ink text-ivory"
                    : "text-taupe hover:bg-mist/60 hover:text-ink"
                }`}
              >
                {st === "ALL" ? "All" : st}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-taupe" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search handle (@username), order ID, or customer..."
              className="w-full pl-9 pr-4 py-2 border border-mist bg-canvas font-ui text-xs text-ink placeholder:text-taupe focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Loading / Error / Empty States */}
        {isLoading ? (
          <div className="py-12 text-center font-ui text-xs text-taupe animate-pulse">
            Loading loyalty rewards...
          </div>
        ) : error ? (
          <EmptyState
            eyebrow="Connection error"
            title="Submissions could not be loaded"
            description={error}
          />
        ) : rewards.length === 0 ? (
          <EmptyState
            eyebrow="Loyalty Rewards"
            title="No reward submissions found"
            description="Submissions will appear here when rewards are issued to customers."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-mist font-ui text-[10px] uppercase tracking-[.16em] text-taupe bg-surface/40">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Customer ID</th>
                  <th className="py-3 px-4">Handle / Identifier</th>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Submitted Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Coupon</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pearl/60">
                {rewards.map((reward) => (
                  <tr key={reward.id} className="hover:bg-surface/40 transition-colors">
                    {/* Customer */}
                    <td className="py-4 px-4 font-ui text-xs font-medium text-ink">
                      <div>{reward.customerName}</div>
                      <div className="text-[10px] text-taupe">{reward.customerEmail}</div>
                    </td>

                    {/* Customer ID */}
                    <td className="py-4 px-4 font-mono text-xs text-taupe">
                      {reward.customerId ? reward.customerId.slice(0, 8) + "..." : "N/A"}
                    </td>

                    {/* Instagram Username */}
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-1.5 font-ui text-xs font-medium text-ink">
                        <Camera className="w-3.5 h-3.5 text-rose-500" />
                        <span>@{reward.instagramUsername}</span>
                      </div>
                      {reward.instagramPostUrl && (
                        <a
                          href={reward.instagramPostUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline mt-0.5"
                        >
                          View post <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>

                    {/* Order ID */}
                    <td className="py-4 px-4">
                      <Link
                        to={`/admin/orders/${reward.orderId}`}
                        className="font-mono text-xs text-ink hover:underline"
                      >
                        #{reward.orderNumber}
                      </Link>
                    </td>

                    {/* Submitted Date */}
                    <td className="py-4 px-4 font-ui text-xs text-taupe">
                      {formatDate(reward.createdAt)}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4">
                      {reward.status === "APPROVED" && (
                        <AtelierBadge variant="success">Approved</AtelierBadge>
                      )}
                      {reward.status === "PENDING" && (
                        <AtelierBadge variant="warning">Pending</AtelierBadge>
                      )}
                      {reward.status === "REJECTED" && (
                        <AtelierBadge variant="error">Rejected</AtelierBadge>
                      )}
                    </td>

                    {/* Coupon */}
                    <td className="py-4 px-4 font-mono text-xs">
                      {reward.couponCode ? (
                        <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-200 font-bold">
                          {reward.couponCode}
                        </span>
                      ) : (
                        <span className="text-taupe text-xs">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenDetail(reward)}
                          className="p-1.5 text-taupe hover:text-ink transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {reward.status === "PENDING" && (
                          <>
                            <AtelierButton
                              size="chip"
                              variant="primary"
                              onClick={() => handleOpenApproveModal(reward)}
                            >
                              Approve
                            </AtelierButton>
                            <AtelierButton
                              size="chip"
                              variant="outline"
                              onClick={() => handleOpenRejectModal(reward)}
                            >
                              Reject
                            </AtelierButton>
                          </>
                        )}
                        {reward.status === "REJECTED" && (
                          <AtelierButton
                            size="chip"
                            variant="outline"
                            onClick={() => handleReopen(reward)}
                            disabled={isProcessing}
                          >
                            Re-open
                          </AtelierButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-pearl text-xs text-slate">
            <span>{total} total submissions</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-pearl rounded disabled:opacity-40 hover:bg-ivory"
              >
                Previous
              </button>
              <span className="px-2">Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border border-pearl rounded disabled:opacity-40 hover:bg-ivory"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </AdminPanel>

      {/* 3. Detail Drawer / Modal */}
      {isDetailOpen && selectedReward && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-lg bg-canvas h-full shadow-2xl p-6 overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b border-mist pb-4 mb-6">
                <h3 className="font-display text-xl font-light text-ink">Reward Detail</h3>
                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="text-taupe hover:text-ink p-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6 font-ui text-xs">
                {/* Status Header */}
                <div className="flex justify-between items-center p-3 bg-surface border border-mist">
                  <span className="text-[10px] uppercase tracking-[.16em] text-taupe">Current Status</span>
                  {selectedReward.status === "APPROVED" && (
                    <AtelierBadge variant="success">Approved</AtelierBadge>
                  )}
                  {selectedReward.status === "PENDING" && (
                    <AtelierBadge variant="warning">Pending Review</AtelierBadge>
                  )}
                  {selectedReward.status === "REJECTED" && (
                    <AtelierBadge variant="error">Rejected</AtelierBadge>
                  )}
                </div>

                {/* Customer Info */}
                <div>
                  <h4 className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-2">
                    Customer Information
                  </h4>
                  <div className="bg-surface p-3 border border-mist space-y-1">
                    <div>
                      <span className="font-medium text-ink">{selectedReward.customerName}</span>
                    </div>
                    <div className="text-[10px] text-taupe">{selectedReward.customerEmail}</div>
                    <div className="text-[10px] font-mono text-taupe">ID: {selectedReward.customerId}</div>
                  </div>
                </div>

                {/* Instagram Submission Info */}
                <div>
                  <h4 className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-2">
                    Loyalty Submission Info
                  </h4>
                  <div className="bg-surface p-3 border border-mist space-y-2">
                    <div className="flex justify-between">
                      <span className="text-taupe">Handle:</span>
                      <span className="font-medium text-ink">@{selectedReward.instagramUsername}</span>
                    </div>
                    {selectedReward.instagramPostUrl && (
                      <div className="flex justify-between items-center">
                        <span className="text-taupe">Post Link:</span>
                        <a
                          href={selectedReward.instagramPostUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline flex items-center gap-1 text-[10px]"
                        >
                          Open Link <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-taupe">Submitted:</span>
                      <span className="text-ink">{formatDate(selectedReward.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Order Information */}
                <div>
                  <h4 className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-2">
                    Qualifying Purchase Order
                  </h4>
                  <div className="bg-surface p-3 border border-mist flex justify-between items-center">
                    <div>
                      <span className="font-mono font-medium text-ink">#{selectedReward.orderNumber}</span>
                      <div className="text-[10px] text-taupe font-mono">ID: {selectedReward.orderId}</div>
                    </div>
                    <Link
                      to={`/admin/orders/${selectedReward.orderId}`}
                      className="text-[10px] text-accent underline"
                    >
                      View Order
                    </Link>
                  </div>
                </div>

                {/* Coupon Information (if generated) */}
                {selectedReward.couponCode && (
                  <div>
                    <h4 className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-2">
                      Generated Coupon Details
                    </h4>
                    <div className="bg-emerald-50 border border-emerald-200 p-4 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-ui text-[10px] uppercase tracking-[.14em] text-emerald-800">Coupon Code</span>
                        <span className="font-mono font-bold text-emerald-900 bg-white px-2 py-1 border border-emerald-300">
                          {selectedReward.couponCode}
                        </span>
                      </div>
                      {selectedReward.coupon && (
                        <>
                          <div className="flex justify-between font-ui text-[10px] text-emerald-800">
                            <span>Discount:</span>
                            <span className="font-medium">{selectedReward.coupon.discountPercentage}% OFF</span>
                          </div>
                          <div className="flex justify-between font-ui text-[10px] text-emerald-800">
                            <span>Usage Limit:</span>
                            <span>{selectedReward.coupon.timesUsed} / {selectedReward.coupon.usageLimit} used</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Verification / Rejection Audit Info */}
                {selectedReward.verifiedBy && (
                  <div>
                    <h4 className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-2">
                      Verification Audit
                    </h4>
                    <div className="bg-surface p-3 border border-mist space-y-1 font-ui text-[10px]">
                      <div>
                        <span className="text-taupe">Staff Verifier:</span>{" "}
                        <span className="font-medium text-ink">{selectedReward.verifierName || selectedReward.verifiedBy}</span>
                      </div>
                      <div>
                        <span className="text-taupe">Verified At:</span>{" "}
                        <span className="text-ink">{formatDate(selectedReward.verifiedAt)}</span>
                      </div>
                      {selectedReward.rejectionReason && (
                        <div className="mt-2 text-rose-700 bg-rose-50 p-2 border border-rose-200">
                          <span className="font-medium">Rejection Reason:</span>{" "}
                          {selectedReward.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-6 border-t border-mist flex justify-end gap-3">
              <AtelierButton variant="outline" onClick={() => setIsDetailOpen(false)}>
                Close
              </AtelierButton>
              {selectedReward.status === "PENDING" && (
                <>
                  <AtelierButton
                    variant="outline"
                    onClick={() => {
                      setIsDetailOpen(false);
                      handleOpenRejectModal(selectedReward);
                    }}
                  >
                    Reject
                  </AtelierButton>
                  <AtelierButton
                    variant="primary"
                    onClick={() => {
                      setIsDetailOpen(false);
                      handleOpenApproveModal(selectedReward);
                    }}
                  >
                    Approve Reward
                  </AtelierButton>
                </>
              )}
              {selectedReward.status === "REJECTED" && (
                <AtelierButton
                  variant="outline"
                  onClick={() => {
                    setIsDetailOpen(false);
                    handleReopen(selectedReward);
                  }}
                  disabled={isProcessing}
                >
                  Re-open to Pending
                </AtelierButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Approval Confirmation Modal */}
      {isApproveOpen && selectedReward && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas max-w-md w-full p-6 shadow-xl border border-mist">
            <h3 className="font-display text-lg font-light text-ink mb-2">
              Approve Loyalty Reward?
            </h3>
            <p className="font-ui text-xs text-taupe mb-4">
              Confirm approval for <strong>@{selectedReward.instagramUsername}</strong> on order <strong>#{selectedReward.orderNumber}</strong>.
            </p>

            <div className="bg-emerald-50 border border-emerald-200 p-3 font-ui text-[10px] text-emerald-800 mb-4">
              A personal, single-use reward discount coupon will be generated automatically for <strong>{selectedReward.customerName}</strong>.
            </div>

            <div className="mb-4">
              <label className="block font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-1">
                Discount Percentage <span className="text-accent">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  value={approveDiscount}
                  onChange={(e) => setApproveDiscount(e.target.value)}
                  placeholder="Enter % e.g. 10"
                  className="w-full border border-mist px-3 py-2 font-ui text-xs text-ink bg-canvas placeholder:text-taupe focus:outline-none focus:border-accent pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-taupe text-xs">%</span>
              </div>
              <p className="font-ui text-[10px] text-taupe mt-1">Set the discount % for this customer's reward coupon.</p>
            </div>

            <div className="mb-4">
              <label className="block text-xs uppercase tracking-wider text-slate mb-1 font-semibold">
                Min. Order Value (₹)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={approveMinOrder}
                onChange={(e) => setApproveMinOrder(e.target.value)}
                placeholder="0 (no minimum)"
                className="w-full border border-pearl px-3 py-2 text-sm bg-white focus:outline-none focus:border-charcoal"
              />
              <p className="text-[11px] text-slate mt-1">Leave 0 for no minimum order requirement.</p>
            </div>

            <div className="mb-4">
              <label className="block text-xs uppercase tracking-wider text-slate mb-1">
                Internal Notes (Optional)
              </label>
              <textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="Verified via screenshot or manual check..."
                className="w-full border border-mist p-2 font-ui text-xs text-ink bg-canvas placeholder:text-taupe focus:outline-none focus:border-accent"
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-3">
              <AtelierButton
                variant="outline"
                onClick={() => setIsApproveOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </AtelierButton>
              <AtelierButton
                variant="primary"
                onClick={handleConfirmApproval}
                disabled={isProcessing}
              >
                {isProcessing ? "Processing..." : "Approve & Issue Coupon"}
              </AtelierButton>
            </div>
          </div>
        </div>
      )}

      {/* 5. Reject Modal */}
      {isRejectOpen && selectedReward && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas max-w-md w-full p-6 shadow-xl border border-mist">
            <h3 className="font-display text-lg font-light text-ink mb-2">
              Reject Loyalty Reward
            </h3>
            <p className="font-ui text-xs text-taupe mb-4">
              Please enter the reason for rejecting <strong>@{selectedReward.instagramUsername}</strong>'s reward.
            </p>

            <div className="mb-4">
              <label className="block font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-1">
                Rejection Reason <span className="text-accent">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Tagged account was incorrect or post did not display qualifying saree."
                className="w-full border border-mist p-2 font-ui text-xs text-ink bg-canvas placeholder:text-taupe focus:outline-none focus:border-accent"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3">
              <AtelierButton
                variant="outline"
                onClick={() => setIsRejectOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </AtelierButton>
              <AtelierButton
                variant="primary"
                onClick={handleConfirmRejection}
                disabled={isProcessing}
              >
                {isProcessing ? "Processing..." : "Confirm Rejection"}
              </AtelierButton>
            </div>
          </div>
        </div>
      )}

      {/* 6. Success Modal for Generated Coupon */}
      {generatedCoupon && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas max-w-md w-full p-6 shadow-2xl border border-mist text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-display text-xl font-light text-ink mb-1">
              Reward Coupon Issued
            </h3>
            <p className="font-ui text-xs text-taupe mb-4">
              A {generatedCoupon.discountPercentage}% discount coupon has been generated for <strong>{generatedCoupon.customerName}</strong>.
            </p>

            <div className="bg-surface border border-dashed border-emerald-400 p-4 mb-6 flex justify-between items-center">
              <span className="font-mono text-lg font-bold text-emerald-900 tracking-wider">
                {generatedCoupon.code}
              </span>
              <button
                onClick={() => handleCopyCouponCode(generatedCoupon.code)}
                className="flex items-center gap-1 font-ui text-[10px] uppercase tracking-[.12em] text-emerald-700 bg-emerald-50 px-2.5 py-1.5 border border-emerald-300 hover:bg-emerald-100 transition-colors"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Code
                  </>
                )}
              </button>
            </div>

            <AtelierButton variant="primary" className="w-full" onClick={() => setGeneratedCoupon(null)}>
              Done
            </AtelierButton>
          </div>
        </div>
      )}
      {/* 7. Manual Claim Modal */}
      {isManualClaimOpen && (
        <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-canvas max-w-md w-full p-6 shadow-xl border border-mist">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-lg font-light text-ink">Add Manual Reward</h3>
              <button
                onClick={() => setIsManualClaimOpen(false)}
                className="text-taupe hover:text-ink p-1"
              >
                ✕
              </button>
            </div>
            <p className="font-ui text-xs text-taupe mb-5">
              Issue a reward coupon directly to a customer by entering their User ID or email, and the Order ID or order number.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-1">
                  Customer — User ID or Email <span className="text-accent">*</span>
                </label>
                <input
                  type="text"
                  value={manualClaimForm.customerIdentifier}
                  onChange={(e) =>
                    setManualClaimForm((f) => ({ ...f, customerIdentifier: e.target.value }))
                  }
                  placeholder="e.g. user-12345 or customer@example.com"
                  className="w-full border border-mist px-3 py-2 font-ui text-xs text-ink bg-canvas placeholder:text-taupe focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-1">
                  Order — Order ID or Order Number <span className="text-accent">*</span>
                </label>
                <input
                  type="text"
                  value={manualClaimForm.orderIdentifier}
                  onChange={(e) =>
                    setManualClaimForm((f) => ({ ...f, orderIdentifier: e.target.value }))
                  }
                  placeholder="e.g. ord-12345 or PF-0001"
                  className="w-full border border-mist px-3 py-2 font-ui text-xs text-ink bg-canvas placeholder:text-taupe focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={manualClaimForm.notes}
                  onChange={(e) =>
                    setManualClaimForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="e.g. Verified via DM screenshot"
                  className="w-full border border-mist px-3 py-2 font-ui text-xs text-ink bg-canvas placeholder:text-taupe focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block font-ui text-[10px] uppercase tracking-[.16em] text-taupe mb-1">
                  Discount Percentage
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="0.5"
                    value={manualClaimForm.discountPercentage}
                    onChange={(e) =>
                      setManualClaimForm((f) => ({ ...f, discountPercentage: e.target.value }))
                    }
                    placeholder="e.g. 10 (leave blank for default)"
                    className="w-full border border-mist px-3 py-2 font-ui text-xs text-ink bg-canvas placeholder:text-taupe focus:outline-none focus:border-accent pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-taupe text-xs">%</span>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={manualClaimForm.autoApprove}
                  onChange={(e) =>
                    setManualClaimForm((f) => ({ ...f, autoApprove: e.target.checked }))
                  }
                  className="w-4 h-4 accent-ink"
                />
                <span className="font-ui text-xs text-ink">
                  Approve &amp; issue coupon immediately
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <AtelierButton
                variant="outline"
                onClick={() => setIsManualClaimOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </AtelierButton>
              <AtelierButton
                variant="primary"
                onClick={handleManualClaim}
                disabled={isProcessing}
              >
                {isProcessing ? "Processing..." : "Add Reward"}
              </AtelierButton>
            </div>
          </div>
        </div>
      )}

    </AdminPage>
  );
}
