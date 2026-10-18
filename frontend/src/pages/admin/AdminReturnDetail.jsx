/**
 * PRATIKSHYA FASHION — Admin Return Detail (Phase 16.1)
 *
 * Premium operational return management interface.
 * Shows return details, provides context-sensitive actions based on status,
 * and displays the full return timeline.
 *
 * Actions: Approve, Reject, Schedule Pickup, Receive, Inspect, Initiate Refund, Complete Refund
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import AdminPage from "../../components/admin/AdminPage";
import AdminPanel from "../../components/admin/AdminPanel";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useOrder } from "../../context/OrderContext";
import { apiAdminGetReturn } from "../../services/api/ordersApi";
import { RETURN_STATUS, RETURN_STATUSES } from "../../config/orderConfig";
import {
  getReturnTimeline,
  canApproveReturn,
  canRejectReturn,
  canSchedulePickup,
  canReceiveReturn,
  canInspectReturn,
  canInitiateRefund,
  canCompleteRefund,
  REJECTION_REASONS,
  PICKUP_METHODS,
  PACKAGE_CONDITIONS,
  INSPECTION_CONDITIONS,
} from "../../services/orders/returnService";
import { formatINR } from "../../utils/shopping";
import { formatOrderDate } from "../../utils/orders";
import { AtelierButton, Rule } from "../../design-system";
import { cn } from "../../utils/cn";

export default function AdminReturnDetail() {
  const { returnId } = useParams();
  const navigate = useNavigate();
  const { admin, isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";

  // BACKEND CONTRACT (admin consolidation): the detail screen reads the REAL
  // returns API — GET /admin/returns/{id} — instead of scanning the 100-order
  // client snapshot (which only carried returns for orders that happened to
  // be in the first page). The backend enriches the record with the owning
  // order number and customer display name.
  const [returnRecord, setReturnRecord] = useState(null);
  const [loadState, setLoadState] = useState({ status: "loading", error: null });
  const [attempt, setAttempt] = useState(0);

  const refreshRecord = useCallback(async () => {
    setLoadState({ status: "loading", error: null });
    const result = await apiAdminGetReturn(returnId);
    if (result.ok) {
      setReturnRecord(result.return || null);
      setLoadState({ status: "ready", error: null });
    } else {
      setLoadState({ status: "error", error: result.error ?? "Could not load this return." });
    }
  }, [returnId]);

  useEffect(() => {
    refreshRecord();
  }, [refreshRecord, attempt]);

  const retryLoad = useCallback(() => setAttempt((a) => a + 1), []);

  const {
    approveReturn,
    rejectReturn,
    scheduleReturnPickup,
    receiveReturn,
    inspectReturn,
    initiateReturnRefund,
    completeReturnRefund,
  } = useOrder();

  // Action states
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");

  const [showPickup, setShowPickup] = useState(false);
  const [pickupDate, setPickupDate] = useState("");
  const [pickupMethod, setPickupMethod] = useState("courier");
  const [pickupReference, setPickupReference] = useState("");
  const [pickupNote, setPickupNote] = useState("");

  const [showReceive, setShowReceive] = useState(false);
  const [packageCondition, setPackageCondition] = useState("good");
  const [receiveNote, setReceiveNote] = useState("");

  const [showInspect, setShowInspect] = useState(false);
  const [inspections, setInspections] = useState({});

  const [notice, setNotice] = useState("");
  const [processing, setProcessing] = useState(false);

  // Loading must win over not-found: the record is being fetched.
  if (loadState.status === "loading" && !returnRecord) {
    return (
      <AdminPage eyebrow="Returns" title="Loading return…">
        <p role="status" aria-live="polite" aria-busy="true" className="font-ui text-sm text-pf-muted">
          Loading return…
        </p>
      </AdminPage>
    );
  }

  if (loadState.status === "error") {
    return (
      <AdminPage eyebrow="Returns" title="Return unavailable">
        <div role="alert" className="font-ui text-sm text-pf-muted">
          <p>{loadState.error}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-4 inline-block font-ui text-sm text-pf-gold-text underline hover:text-pf-burgundy"
          >
            Try again
          </button>
        </div>
        <Link to={`${prefix}/returns`} className="mt-4 inline-block font-ui text-sm text-pf-gold-text hover:text-pf-burgundy">
          Back to returns
        </Link>
      </AdminPage>
    );
  }

  if (!returnRecord) {
    return (
      <AdminPage eyebrow="Returns" title="Return not found">
        <p className="font-ui text-sm text-pf-muted">
          No return exists with this reference, or it is not visible to your role.
        </p>
        <Link to={`${prefix}/returns`} className="mt-4 inline-block font-ui text-sm text-pf-gold-text hover:text-pf-burgundy">
          Back to returns
        </Link>
      </AdminPage>
    );
  }

  const orderId = returnRecord.orderId;
  const orderNumber = returnRecord.orderNumber || returnRecord.orderId;
  const customerName = returnRecord.customerName || "Customer";
  const auditTrail = (returnRecord.timeline ?? [])
    .filter((entry) => entry && (entry.event || entry.status))
    .map((entry) => ({
      label: String(entry.event || entry.status)
        .replace(/^RETURN_/, "")
        .replaceAll("_", " ")
        .toLowerCase(),
      at: entry.at ?? entry.created_at ?? null,
      note: entry.note ?? null,
    }));
  const lineKey = (item) => item.orderItemId || item.lineId || item.id;
  const itemMoney = (item) =>
    item.refundAmount > 0
      ? `Refund ${formatINR(item.refundAmount)}`
      : item.price
        ? formatINR(item.price * item.quantity)
        : "";
  const itemImage = (item) => item.image || item.productImage || null;
  const timeline = getReturnTimeline(returnRecord);
  const statusDef = RETURN_STATUSES[returnRecord.status];
  const isRejected = returnRecord.status === RETURN_STATUS.REJECTED;

  const actor = admin
    ? { adminId: admin.adminId, name: admin.name || "Admin" }
    : { name: "System" };

  // Action handlers
  const handleApprove = async () => {
    setProcessing(true);
    const result = await approveReturn(returnRecord.id, { actor });
    setProcessing(false);
    if (result.ok) {
      setNotice("Return approved successfully.");
      await refreshRecord();
    } else {
      setNotice(result.message || "Failed to approve return.");
    }
  };

  const handleReject = async () => {
    if (!rejectReason) {
      setNotice("Please select a rejection reason.");
      return;
    }
    setProcessing(true);
    const result = await rejectReturn(returnRecord.id, {
      actor,
      reason: rejectReason,
      note: rejectNote,
    });
    setProcessing(false);
    if (result.ok) {
      setShowReject(false);
      setNotice("Return rejected.");
      await refreshRecord();
    } else {
      setNotice(result.message || "Failed to reject return.");
    }
  };

  const handleSchedulePickup = async () => {
    setProcessing(true);
    const result = await scheduleReturnPickup(returnRecord.id, {
      actor,
      pickupDate,
      pickupMethod,
      pickupReference,
      note: pickupNote,
    });
    setProcessing(false);
    if (result.ok) {
      setShowPickup(false);
      setNotice("Pickup scheduled successfully.");
      await refreshRecord();
    } else {
      setNotice(result.message || "Failed to schedule pickup.");
    }
  };

  const handleReceive = async () => {
    setProcessing(true);
    const result = await receiveReturn(returnRecord.id, {
      actor,
      packageCondition,
      note: receiveNote,
    });
    setProcessing(false);
    if (result.ok) {
      setShowReceive(false);
      setNotice("Return marked as received.");
      await refreshRecord();
    } else {
      setNotice(result.message || "Failed to mark return as received.");
    }
  };

  const handleInspect = async () => {
    const items = returnRecord.items || [];
    if (items.length === 0) {
      setNotice("No items to inspect.");
      return;
    }

    // API contract: one package-level inspection condition + notes. Per-item
    // conditions are aggregated (worst wins) so the request matches
    // POST /admin/returns/{id}/inspect exactly.
    const chosen = items.map(
      (item) => inspections[lineKey(item)]?.condition || "SELLABLE"
    );
    const inspectionCondition = chosen.includes("QUARANTINE")
      ? "QUARANTINE"
      : chosen.includes("DAMAGED")
        ? "DAMAGED"
        : "SELLABLE";
    const notes = items
      .map((item) => inspections[lineKey(item)]?.notes)
      .filter(Boolean)
      .join(" | ");

    setProcessing(true);
    const result = await inspectReturn(returnRecord.id, {
      actor,
      inspectionCondition,
      notes: notes || undefined,
    });
    setProcessing(false);
    if (result.ok) {
      setShowInspect(false);
      setNotice("Inspection completed successfully.");
      await refreshRecord();
    } else {
      setNotice(result.message || "Failed to complete inspection.");
    }
  };

  const handleInitiateRefund = async () => {
    setProcessing(true);
    const result = await initiateReturnRefund(returnRecord.id, { actor });
    setProcessing(false);
    if (result.ok) {
      setNotice("Refund initiated successfully.");
      await refreshRecord();
    } else {
      setNotice(result.message || "Failed to initiate refund.");
    }
  };

  const handleCompleteRefund = async () => {
    setProcessing(true);
    const result = await completeReturnRefund(returnRecord.id, { actor });
    setProcessing(false);
    if (result.ok) {
      setNotice("Refund completed successfully.");
      await refreshRecord();
    } else {
      setNotice(result.message || "Failed to complete refund.");
    }
  };

  const updateInspection = (lineId, field, value) => {
    setInspections((current) => ({
      ...current,
      [lineId]: {
        ...current[lineId],
        [field]: value,
      },
    }));
  };

  return (
    <AdminPage
      title={returnRecord.id}
      eyebrow="Return Detail"
      description={`Order ${orderNumber} · ${returnRecord.reasonLabel || returnRecord.reason}`}
    >
      {notice ? (
        <div className="mb-6 border border-pf-gold-deep/40 bg-pf-burgundy/5 px-5 py-4 font-ui text-xs text-pf-burgundy">
          {notice}
        </div>
      ) : null}

      {/* Back button */}
      <button
        onClick={() => navigate(`${prefix}/returns`)}
        className="mb-6 flex items-center gap-2 font-ui text-xs uppercase tracking-widest text-pf-gold-text hover:text-pf-burgundy"
      >
        <ArrowLeft size={14} />
        Back to Returns
      </button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Return overview */}
          <AdminPanel title="Return Overview">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Status
                  </p>
                  <p className="mt-1 font-display text-2xl font-light text-pf-text">
                    {statusDef?.label || returnRecord.status}
                  </p>
                </div>
                {isRejected ? (
                  <div className="border border-pf-gold-deep/40 bg-pf-burgundy/5 px-4 py-2">
                    <p className="font-ui text-[10px] uppercase tracking-widest text-pf-burgundy">
                      Rejected
                    </p>
                    <p className="mt-1 font-ui text-xs text-pf-burgundy">
                      {returnRecord.rejectionReason}
                    </p>
                  </div>
                ) : null}
              </div>

              <Rule width="w-10" tone="accent" />

              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Return ID
                  </dt>
                  <dd className="mt-1 font-ui text-pf-text">{returnRecord.id}</dd>
                </div>
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Order ID
                  </dt>
                  <dd className="mt-1">
                    <Link
                      to={`${prefix}/orders/${orderId}`}
                      className="font-ui text-pf-text underline hover:text-pf-burgundy"
                    >
                      {orderNumber}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Customer
                  </dt>
                  <dd className="mt-1 font-ui text-pf-text">
                    {customerName}
                  </dd>
                </div>
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Requested
                  </dt>
                  <dd className="mt-1 font-ui text-pf-text">
                    {formatOrderDate(returnRecord.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Reason
                  </dt>
                  <dd className="mt-1 font-ui text-pf-text">
                    {returnRecord.reasonLabel || returnRecord.reason}
                  </dd>
                </div>
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Resolution
                  </dt>
                  <dd className="mt-1 font-ui text-pf-text capitalize">
                    {returnRecord.resolution || "—"}
                  </dd>
                </div>
              </dl>

              {returnRecord.note ? (
                <div className="border-t border-pf-border/70 pt-4">
                  <p className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Customer Note
                  </p>
                  <p className="mt-2 font-ui text-sm text-pf-text">{returnRecord.note}</p>
                </div>
              ) : null}
            </div>
          </AdminPanel>

          {/* Items */}
          <AdminPanel title="Items">
            <div className="space-y-4">
              {(returnRecord.items || []).map((item) => (
                <div
                  key={lineKey(item)}
                  className="flex gap-4 border-b border-pf-border/70 pb-4 last:border-0 last:pb-0"
                >
                  {itemImage(item) ? (
                    <img
                      src={itemImage(item)}
                      alt={item.name}
                      className="h-20 w-20 shrink-0 bg-pf-ivory object-cover"
                    />
                  ) : (
                    <div
                      className="h-20 w-20 shrink-0 border border-pf-border/70 bg-pf-ivory"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-light text-pf-text">
                      {item.name}
                    </p>
                    <p className="mt-1 font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                      {[item.color, item.size].filter(Boolean).join(" · ") || "Free Size"}
                    </p>
                    <p className="mt-1 font-ui text-xs text-pf-text">
                      Qty: {item.quantity}
                      {itemMoney(item) ? ` · ${itemMoney(item)}` : ""}
                    </p>
                    {item.inspectionCondition || item.inspection_condition ? (
                      <p className="mt-2 inline-block border border-pf-gold-deep/40 bg-pf-burgundy/5 px-3 py-1 font-ui text-[10px] uppercase tracking-widest text-pf-burgundy">
                        {item.inspectionCondition || item.inspection_condition}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </AdminPanel>

          {/* Timeline */}
          <AdminPanel title="Timeline">
            <ol className="space-y-4">
              {timeline.map((entry) => {
                const isDone = entry.state === "done";
                const isCurrent = entry.state === "current";
                return (
                  <li
                    key={entry.status}
                    className={cn(
                      "border-l-2 pl-4",
                      isDone ? "border-pf-gold-deep" : isCurrent ? "border-pf-gold-deep" : "border-pf-border"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {isDone ? (
                        <Check size={16} className="mt-0.5 shrink-0 text-pf-burgundy" />
                      ) : isCurrent ? (
                        <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-pf-burgundy" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "font-display text-base font-light",
                            isDone || isCurrent ? "text-pf-text" : "text-pf-muted"
                          )}
                        >
                          {entry.title}
                        </p>
                        <p className="mt-0.5 font-ui text-[11px] text-slate">
                          {entry.timestamp
                            ? formatOrderDate(entry.timestamp)
                            : entry.description}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </AdminPanel>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <AdminPanel title="Actions">
            <div className="space-y-3">
              {canApproveReturn(returnRecord) && !isRejected ? (
                <AtelierButton
                  variant="primary"
                  size="md"
                  onClick={handleApprove}
                  disabled={processing}
                  className="w-full justify-center"
                >
                  {processing ? "Processing..." : "Approve Return"}
                </AtelierButton>
              ) : null}

              {canRejectReturn(returnRecord) && !isRejected ? (
                <AtelierButton
                  variant="outline"
                  size="md"
                  onClick={() => setShowReject(true)}
                  disabled={processing}
                  className="w-full justify-center"
                >
                  Reject Return
                </AtelierButton>
              ) : null}

              {canSchedulePickup(returnRecord) ? (
                <AtelierButton
                  variant="primary"
                  size="md"
                  onClick={() => setShowPickup(true)}
                  disabled={processing}
                  className="w-full justify-center"
                >
                  Schedule Pickup
                </AtelierButton>
              ) : null}

              {canReceiveReturn(returnRecord) ? (
                <AtelierButton
                  variant="primary"
                  size="md"
                  onClick={() => setShowReceive(true)}
                  disabled={processing}
                  className="w-full justify-center"
                >
                  Mark as Received
                </AtelierButton>
              ) : null}

              {canInspectReturn(returnRecord) ? (
                <AtelierButton
                  variant="primary"
                  size="md"
                  onClick={() => setShowInspect(true)}
                  disabled={processing}
                  className="w-full justify-center"
                >
                  Inspect Return
                </AtelierButton>
              ) : null}

              {canInitiateRefund(returnRecord) ? (
                <AtelierButton
                  variant="primary"
                  size="md"
                  onClick={handleInitiateRefund}
                  disabled={processing}
                  className="w-full justify-center"
                >
                  Initiate Refund
                </AtelierButton>
              ) : null}

              {canCompleteRefund(returnRecord) ? (
                <AtelierButton
                  variant="primary"
                  size="md"
                  onClick={handleCompleteRefund}
                  disabled={processing}
                  className="w-full justify-center"
                >
                  Complete Refund
                </AtelierButton>
              ) : null}

              {!canApproveReturn(returnRecord) &&
              !canSchedulePickup(returnRecord) &&
              !canReceiveReturn(returnRecord) &&
              !canInspectReturn(returnRecord) &&
              !canInitiateRefund(returnRecord) &&
              !canCompleteRefund(returnRecord) &&
              !isRejected ? (
                <p className="font-ui text-[11px] text-pf-muted">
                  No actions available for this status.
                </p>
              ) : null}
            </div>
          </AdminPanel>

          {/* Refund — fields come from the returns API record */}
          {returnRecord.refundStatus && returnRecord.refundStatus !== "NOT_REQUESTED" ? (
            <AdminPanel title="Refund">
              <div className="space-y-3">
                <div>
                  <p className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Amount
                  </p>
                  <p className="mt-1 font-display text-2xl font-light text-pf-text">
                    {formatINR(returnRecord.refundAmount || 0)}
                  </p>
                </div>
                <div>
                  <p className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Status
                  </p>
                  <p className="mt-1 font-ui text-xs text-pf-text">
                    {returnRecord.refundStatus}
                  </p>
                </div>
                <div>
                  <p className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Method
                  </p>
                  <p className="mt-1 font-ui text-xs text-pf-text">
                    {returnRecord.refundMethod || "Original payment method"}
                  </p>
                </div>
              </div>
            </AdminPanel>
          ) : null}

          {/* Pickup details — pickup_method / pickup_scheduled_at from the API */}
          {returnRecord.pickupScheduledAt || returnRecord.pickup_scheduled_at ? (
            <AdminPanel title="Pickup">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Scheduled
                  </dt>
                  <dd className="mt-1 font-ui text-pf-text">
                    {formatOrderDate(
                      returnRecord.pickupScheduledAt || returnRecord.pickup_scheduled_at
                    ) || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Method
                  </dt>
                  <dd className="mt-1 font-ui text-pf-text">
                    {returnRecord.pickupMethod || returnRecord.pickup_method || "—"}
                  </dd>
                </div>
              </dl>
            </AdminPanel>
          ) : null}

          {/* Receiving details — package_condition from the API */}
          {returnRecord.packageCondition || returnRecord.package_condition ? (
            <AdminPanel title="Receiving">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Package Condition
                  </dt>
                  <dd className="mt-1 font-ui text-pf-text capitalize">
                    {returnRecord.packageCondition || returnRecord.package_condition || "—"}
                  </dd>
                </div>
              </dl>
            </AdminPanel>
          ) : null}

          {/* Inspection details — inspection_condition / _notes from the API */}
          {returnRecord.inspectionCondition || returnRecord.inspection_condition ? (
            <AdminPanel title="Inspection">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                    Result
                  </dt>
                  <dd className="mt-1 font-ui text-pf-text">
                    {returnRecord.inspectionCondition || returnRecord.inspection_condition}
                  </dd>
                </div>
                {returnRecord.inspectionNotes || returnRecord.inspection_notes ? (
                  <div>
                    <dt className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                      Notes
                    </dt>
                    <dd className="mt-1 font-ui text-pf-text">
                      {returnRecord.inspectionNotes || returnRecord.inspection_notes}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </AdminPanel>
          ) : null}
        </div>
      </div>

      {/* Reject dialog */}
      {showReject ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-pf-burgundy/60 p-4">
          <div className="w-full max-w-md border border-pf-border bg-pf-ivory p-6">
            <h3 className="font-display text-xl font-light text-pf-text">Reject Return</h3>
            <Rule width="w-8" tone="accent" className="my-4" />

            <div className="space-y-4">
              <div>
                <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                  Rejection Reason *
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="mt-2 w-full border border-pf-border bg-pf-card px-3 py-2 font-ui text-xs text-pf-text focus:border-pf-gold-deep focus:outline-none"
                >
                  <option value="">Select a reason</option>
                  {REJECTION_REASONS.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                  Note (optional)
                </label>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  rows={3}
                  className="mt-2 w-full border border-pf-border bg-pf-card px-3 py-2 font-ui text-xs text-pf-text focus:border-pf-gold-deep focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <AtelierButton
                variant="primary"
                size="md"
                onClick={handleReject}
                disabled={processing || !rejectReason}
                className="flex-1 justify-center"
              >
                {processing ? "Processing..." : "Reject"}
              </AtelierButton>
              <AtelierButton
                variant="outline"
                size="md"
                onClick={() => {
                  setShowReject(false);
                  setRejectReason("");
                  setRejectNote("");
                }}
                className="flex-1 justify-center"
              >
                Cancel
              </AtelierButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* Pickup dialog */}
      {showPickup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-pf-burgundy/60 p-4">
          <div className="w-full max-w-md border border-pf-border bg-pf-ivory p-6">
            <h3 className="font-display text-xl font-light text-pf-text">Schedule Pickup</h3>
            <Rule width="w-8" tone="accent" className="my-4" />

            <div className="space-y-4">
              <div>
                <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                  Pickup Date
                </label>
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="mt-2 w-full border border-pf-border bg-pf-card px-3 py-2 font-ui text-xs text-pf-text focus:border-pf-gold-deep focus:outline-none"
                />
              </div>

              <div>
                <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                  Pickup Method
                </label>
                <select
                  value={pickupMethod}
                  onChange={(e) => setPickupMethod(e.target.value)}
                  className="mt-2 w-full border border-pf-border bg-pf-card px-3 py-2 font-ui text-xs text-pf-text focus:border-pf-gold-deep focus:outline-none"
                >
                  {PICKUP_METHODS.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={pickupReference}
                  onChange={(e) => setPickupReference(e.target.value)}
                  className="mt-2 w-full border border-pf-border bg-pf-card px-3 py-2 font-ui text-xs text-pf-text focus:border-pf-gold-deep focus:outline-none"
                />
              </div>

              <div>
                <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                  Notes (optional)
                </label>
                <textarea
                  value={pickupNote}
                  onChange={(e) => setPickupNote(e.target.value)}
                  rows={3}
                  className="mt-2 w-full border border-pf-border bg-pf-card px-3 py-2 font-ui text-xs text-pf-text focus:border-pf-gold-deep focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <AtelierButton
                variant="primary"
                size="md"
                onClick={handleSchedulePickup}
                disabled={processing}
                className="flex-1 justify-center"
              >
                {processing ? "Processing..." : "Schedule"}
              </AtelierButton>
              <AtelierButton
                variant="outline"
                size="md"
                onClick={() => setShowPickup(false)}
                className="flex-1 justify-center"
              >
                Cancel
              </AtelierButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* Receive dialog */}
      {showReceive ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-pf-burgundy/60 p-4">
          <div className="w-full max-w-md border border-pf-border bg-pf-ivory p-6">
            <h3 className="font-display text-xl font-light text-pf-text">Mark as Received</h3>
            <Rule width="w-8" tone="accent" className="my-4" />

            <div className="space-y-4">
              <div>
                <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                  Package Condition
                </label>
                <select
                  value={packageCondition}
                  onChange={(e) => setPackageCondition(e.target.value)}
                  className="mt-2 w-full border border-pf-border bg-pf-card px-3 py-2 font-ui text-xs text-pf-text focus:border-pf-gold-deep focus:outline-none"
                >
                  {PACKAGE_CONDITIONS.map((condition) => (
                    <option key={condition.id} value={condition.id}>
                      {condition.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                  Notes (optional)
                </label>
                <textarea
                  value={receiveNote}
                  onChange={(e) => setReceiveNote(e.target.value)}
                  rows={3}
                  className="mt-2 w-full border border-pf-border bg-pf-card px-3 py-2 font-ui text-xs text-pf-text focus:border-pf-gold-deep focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <AtelierButton
                variant="primary"
                size="md"
                onClick={handleReceive}
                disabled={processing}
                className="flex-1 justify-center"
              >
                {processing ? "Processing..." : "Mark Received"}
              </AtelierButton>
              <AtelierButton
                variant="outline"
                size="md"
                onClick={() => setShowReceive(false)}
                className="flex-1 justify-center"
              >
                Cancel
              </AtelierButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* Inspect dialog */}
      {showInspect ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-pf-burgundy/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border border-pf-border bg-pf-ivory p-6">
            <h3 className="font-display text-xl font-light text-pf-text">Inspect Return</h3>
            <Rule width="w-8" tone="accent" className="my-4" />

            <p className="mb-4 font-ui text-[11px] text-pf-muted">
              Inspect each item and assign a condition. Items marked as sellable will be
              returned to inventory; damaged items will be quarantined.
            </p>

            <div className="space-y-6">
              {(returnRecord.items || []).map((item) => (
                <div key={lineKey(item)} className="border border-pf-border/70 p-4">
                  <div className="flex gap-3">
                    {itemImage(item) ? (
                      <img
                        src={itemImage(item)}
                        alt={item.name}
                        className="h-16 w-16 shrink-0 bg-pf-ivory object-cover"
                      />
                    ) : (
                      <div
                        className="h-16 w-16 shrink-0 border border-pf-border/70 bg-pf-ivory"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-light text-pf-text">{item.name}</p>
                      <p className="mt-0.5 font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                        {[item.color, item.size].filter(Boolean).join(" · ") || "Free Size"} · Qty{" "}
                        {item.quantity}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                      Condition
                    </label>
                    <p className="mt-1 font-ui text-[10px] text-slate">
                      Aggregated into the package-level result the backend records.
                    </p>
                    <div className="mt-2 flex gap-2">
                      {INSPECTION_CONDITIONS.map((condition) => {
                        const selected =
                          inspections[lineKey(item)]?.condition === condition.id ||
                          (!inspections[lineKey(item)] && condition.id === "SELLABLE");
                        return (
                          <button
                            key={condition.id}
                            type="button"
                            onClick={() => updateInspection(lineKey(item), "condition", condition.id)}
                            className={cn(
                              "border px-3 py-1.5 font-ui text-[10px] uppercase tracking-widest",
                              selected
                                ? "border-pf-gold-deep bg-pf-burgundy/10 text-pf-burgundy"
                                : "border-pf-border bg-pf-card text-pf-muted hover:border-pf-gold-deep/60"
                            )}
                          >
                            {condition.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="font-ui text-[10px] uppercase tracking-widest text-pf-muted">
                      Notes (optional)
                    </label>
                    <input
                      type="text"
                      value={inspections[lineKey(item)]?.notes || ""}
                      onChange={(e) => updateInspection(lineKey(item), "notes", e.target.value)}
                      placeholder="Inspection notes"
                      className="mt-1 w-full border border-pf-border bg-pf-card px-3 py-1.5 font-ui text-xs text-pf-text focus:border-pf-gold-deep focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex gap-3">
              <AtelierButton
                variant="primary"
                size="md"
                onClick={handleInspect}
                disabled={processing}
                className="flex-1 justify-center"
              >
                {processing ? "Processing..." : "Complete Inspection"}
              </AtelierButton>
              <AtelierButton
                variant="outline"
                size="md"
                onClick={() => setShowInspect(false)}
                className="flex-1 justify-center"
              >
                Cancel
              </AtelierButton>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}
