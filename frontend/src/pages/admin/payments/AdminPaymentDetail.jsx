/**
 * PRATIKSHYA FASHION — Admin Payment Session Detail
 *
 * Shows full session info, linked order card, refund form (PAID only),
 * and a reconcile button (CREATED/PENDING only).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle2, RotateCcw, RefreshCw } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import {
  apiAdminRefundPayment,
  apiAdminReconcileSession,
} from "../../../services/api/paymentsApi";
import { apiAdminGetOrder } from "../../../services/api/ordersApi";
import { cn } from "../../../utils/cn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatINR(paise) {
  const rupees = (paise ?? 0) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(rupees);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function newIdempotencyKey() {
  return `adm-ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CAPTURED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-stone-100 text-stone-500 border-stone-200",
  EXPIRED: "bg-stone-100 text-stone-500 border-stone-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CREATED: "bg-amber-50 text-amber-700 border-amber-200",
  REFUNDED: "bg-blue-50 text-blue-700 border-blue-200",
  PARTIALLY_REFUNDED: "bg-blue-50 text-blue-600 border-blue-200",
  REFUND_PENDING: "bg-blue-50 text-blue-600 border-blue-200",
};

function PaymentStatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? "bg-stone-100 text-stone-500 border-stone-200";
  return (
    <span className={cn("inline-block border px-2 py-0.5 font-ui text-[9px] uppercase tracking-[.14em]", style)}>
      {status?.replace(/_/g, " ") ?? "—"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Field row
// ---------------------------------------------------------------------------

function Field({ label, children, mono = false }) {
  return (
    <div className="border-b border-mist/40 py-3 last:border-0 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe self-center">{label}</dt>
      <dd className={cn("mt-1 sm:col-span-2 sm:mt-0", mono ? "font-mono text-xs text-ink" : "font-ui text-sm text-ink")}>
        {children}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notice banner
// ---------------------------------------------------------------------------

function Notice({ ok, message, onDismiss }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "mb-4 flex items-start gap-3 border px-4 py-3",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-accent/30 bg-accent/5 text-accent"
      )}
    >
      {ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
      <p className="font-ui text-xs flex-1">{message}</p>
      <button type="button" onClick={onDismiss} className="font-ui text-[10px] uppercase tracking-[.14em] hover:underline">
        Dismiss
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminPaymentDetail() {
  const { sessionId } = useParams();
  const { isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";

  // We load session data via the admin payments list filtered by... actually
  // the backend GET /payments/session/{id} requires ownership. We work around
  // this by fetching from the admin list with a session-id search approach.
  // The cleanest approach: we use the admin GET /admin/payments?orderId= — but
  // we don't know the orderId at this point. Instead, we use the general
  // GET /payments/session/{id} with admin scope (backend allows admin callers).
  const [session, setSession]   = useState(null);
  const [order, setOrder]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  // We fetch via the admin list endpoint filtering by... the session ID is
  // not a supported filter. Best path: call GET /payments/session/{id} with
  // the admin token. The backend doesn't enforce ownership for admin users,
  // it only uses get_optional_user — so the admin Bearer token is valid.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);

    // Import the apiClient directly to make an admin-scoped call to the
    // customer-facing session endpoint (backend accepts any valid token).
    import("../../../services/api/apiClient").then(({ apiClient, handleError }) => {
      apiClient.get(`/payments/session/${sessionId}`, { scope: "admin" })
        .then(async (data) => {
          if (!alive) return;
          const s = data.session ?? data;
          setSession(s);
          // Load the linked order for context
          if (s.orderId ?? s.order_id) {
            const ordRes = await apiAdminGetOrder(s.orderId ?? s.order_id);
            if (alive && ordRes.ok) setOrder(ordRes.order);
          }
          setLoading(false);
        })
        .catch((err) => {
          if (!alive) return;
          const handled = handleError(err);
          setLoadError({ status: handled.status, message: handled.error });
          setLoading(false);
        });
    });

    return () => { alive = false; };
  }, [sessionId, reloadToken]);

  // ---------------------------------------------------------------------------
  // Refund form state
  // ---------------------------------------------------------------------------
  const [refundAmountRupees, setRefundAmountRupees] = useState("");
  const [refundReason, setRefundReason]             = useState("");
  const [idempotencyKey, setIdempotencyKey]         = useState(newIdempotencyKey);
  const [refundLoading, setRefundLoading]           = useState(false);
  const [notice, setNotice]                         = useState(null); // { ok, message }

  const maxRefundPaise = session
    ? (session.amountPaise ?? session.amount_paise ?? 0) -
      (session.refundedAmountPaise ?? session.refunded_amount_paise ?? 0)
    : 0;

  async function handleRefund(e) {
    e.preventDefault();
    const amountPaise = refundAmountRupees
      ? Math.round(parseFloat(refundAmountRupees) * 100)
      : null;

    if (amountPaise !== null && amountPaise > maxRefundPaise) {
      setNotice({ ok: false, message: `Refund cannot exceed ${formatINR(maxRefundPaise)}.` });
      return;
    }
    if (amountPaise !== null && amountPaise <= 0) {
      setNotice({ ok: false, message: "Refund amount must be greater than ₹0." });
      return;
    }

    setRefundLoading(true);
    setNotice(null);
    const result = await apiAdminRefundPayment(sessionId, {
      amountPaise,
      reason: refundReason || null,
      idempotencyKey,
    });
    setRefundLoading(false);

    if (result.ok) {
      setNotice({ ok: true, message: result.message ?? "Refund initiated successfully." });
      setIdempotencyKey(newIdempotencyKey());
      setRefundAmountRupees("");
      setRefundReason("");
      reload();
    } else {
      setNotice({ ok: false, message: result.error ?? "Refund failed. Please try again." });
    }
  }

  // ---------------------------------------------------------------------------
  // Reconcile action
  // ---------------------------------------------------------------------------
  const [reconcileLoading, setReconcileLoading] = useState(false);

  async function handleReconcile() {
    setReconcileLoading(true);
    setNotice(null);
    const result = await apiAdminReconcileSession(sessionId);
    setReconcileLoading(false);
    if (result.ok) {
      setNotice({
        ok: true,
        message: result.reconciled
          ? `Session reconciled — status updated to ${result.session_status ?? "PAID"}.`
          : `Session audited — status is ${result.session_status ?? "unchanged"}.`,
      });
      reload();
    } else {
      setNotice({ ok: false, message: result.error ?? "Reconciliation failed." });
    }
  }

  // ---------------------------------------------------------------------------
  // Render: loading / error
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <AdminPage eyebrow="Payments" title="Loading session…">
        <p role="status" aria-live="polite" aria-busy="true" className="font-ui text-sm text-taupe">
          Loading payment session…
        </p>
      </AdminPage>
    );
  }

  if (loadError || !session) {
    const status = loadError?.status ?? 404;
    const title =
      status === 401 ? "Session expired"
      : status === 403 ? "Not permitted"
      : status === 404 ? "Session not found"
      : "Could not load session";
    const detail =
      status === 401 ? "Your admin session has expired. Sign in again."
      : status === 403 ? "Your role does not include permission to view payments."
      : status === 404 ? "No payment session exists with this ID."
      : loadError?.message ?? "Something went wrong. Please try again.";
    return (
      <AdminPage eyebrow="Payments" title={title}>
        <p role="alert" className="font-ui text-sm text-graphite">{detail}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {status >= 500 || status === 0 ? (
            <button
              type="button"
              onClick={reload}
              className="border border-mist px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink"
            >
              Try again
            </button>
          ) : null}
          <Link to={`${prefix}/payments`} className="font-ui text-sm text-brass hover:text-accent">
            ← Back to payments
          </Link>
        </div>
      </AdminPage>
    );
  }

  // Normalise field names — backend returns camelCase from the schema
  const amountPaise       = session.amountPaise ?? session.amount_paise ?? 0;
  const refundedPaise     = session.refundedAmountPaise ?? session.refunded_amount_paise ?? 0;
  const sessionStatus     = session.status ?? "—";
  const paymentMethod     = session.paymentMethod ?? session.payment_method ?? "—";
  const razorpayOrderId   = session.razorpayOrderId ?? session.razorpay_order_id ?? null;
  const razorpayPaymentId = session.razorpayPaymentId ?? session.razorpay_payment_id ?? null;
  const paidAt            = session.paidAt ?? session.paid_at ?? null;
  const cancelledAt       = session.cancelledAt ?? session.cancelled_at ?? null;
  const expiresAt         = session.expiresAt ?? session.expires_at ?? null;
  const failureReason     = session.failureReason ?? session.failure_reason ?? null;
  const failureCode       = session.failureCode ?? session.failure_code ?? null;
  const createdAt         = session.createdAt ?? session.created_at ?? null;
  const updatedAt         = session.updatedAt ?? session.updated_at ?? null;
  const orderId           = session.orderId ?? session.order_id ?? null;

  const isPaid      = ["PAID", "CAPTURED"].includes(sessionStatus);
  const isPending   = ["CREATED", "PENDING"].includes(sessionStatus);
  const hasRefund   = refundedPaise > 0;

  return (
    <AdminPage
      eyebrow="Finance / Payments"
      title={<>Session <span className="italic text-accent">detail.</span></>}
      description={`Payment session ${sessionId}`}
      actions={
        <Link
          to={`${prefix}/payments`}
          className="inline-flex items-center gap-1.5 border border-mist bg-canvas px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink"
        >
          <ArrowLeft size={11} /> Back
        </Link>
      }
    >
      <Notice
        ok={notice?.ok}
        message={notice?.message}
        onDismiss={() => setNotice(null)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: session + order info */}
        <div className="space-y-6 lg:col-span-2">

          {/* Session info */}
          <AdminPanel eyebrow="Gateway" title="Session info">
            <dl className="divide-y-0">
              <Field label="Session ID" mono>{sessionId}</Field>
              <Field label="Status">
                <PaymentStatusBadge status={sessionStatus} />
              </Field>
              <Field label="Amount">{formatINR(amountPaise)}</Field>
              {hasRefund ? (
                <Field label="Refunded">{formatINR(refundedPaise)}</Field>
              ) : null}
              <Field label="Method">
                {paymentMethod === "upi" ? "UPI"
                  : paymentMethod === "card" ? "Card"
                  : paymentMethod === "netbanking" ? "Net Banking"
                  : paymentMethod === "cod" ? "COD"
                  : paymentMethod}
              </Field>
              <Field label="Razorpay Order ID" mono>{razorpayOrderId ?? "—"}</Field>
              <Field label="Razorpay Payment ID" mono>{razorpayPaymentId ?? "—"}</Field>
              {paidAt ? <Field label="Paid At">{formatDate(paidAt)}</Field> : null}
              {cancelledAt ? <Field label="Cancelled At">{formatDate(cancelledAt)}</Field> : null}
              {expiresAt ? <Field label="Expires At">{formatDate(expiresAt)}</Field> : null}
              {failureReason ? <Field label="Failure Reason">{failureReason}</Field> : null}
              {failureCode ? <Field label="Failure Code" mono>{failureCode}</Field> : null}
              <Field label="Created At">{formatDate(createdAt)}</Field>
              <Field label="Updated At">{formatDate(updatedAt)}</Field>
            </dl>
          </AdminPanel>

          {/* Linked order info */}
          {order ? (
            <AdminPanel eyebrow="Order" title="Linked order">
              <dl className="divide-y-0">
                <Field label="Order">
                  <Link
                    to={`${prefix}/orders/${order.id}`}
                    className="font-ui text-sm text-brass hover:text-accent hover:underline"
                  >
                    {order.orderNumber ?? order.order_number ?? order.id}
                  </Link>
                </Field>
                <Field label="Customer">
                  {order.customer?.fullName ?? order.guestEmail ?? "Guest"}
                </Field>
                <Field label="Order Total">
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency", currency: "INR", maximumFractionDigits: 2,
                  }).format(order.total ?? 0)}
                </Field>
                <Field label="Order Status">
                  <span className="font-ui text-xs text-ink">{order.status?.replace(/_/g, " ") ?? "—"}</span>
                </Field>
                <Field label="Payment Status">
                  <span className="font-ui text-xs text-ink">{order.paymentStatus?.replace(/_/g, " ") ?? order.payment_status?.replace(/_/g, " ") ?? "—"}</span>
                </Field>
              </dl>
            </AdminPanel>
          ) : orderId ? (
            <AdminPanel eyebrow="Order" title="Linked order">
              <p className="font-ui text-sm text-taupe">
                Order{" "}
                <Link
                  to={`${prefix}/orders/${orderId}`}
                  className="text-brass hover:text-accent hover:underline"
                >
                  {orderId}
                </Link>
              </p>
            </AdminPanel>
          ) : null}
        </div>

        {/* Right column: actions */}
        <div className="space-y-6">

          {/* Refund section — only for PAID/CAPTURED */}
          {isPaid ? (
            <AdminPanel eyebrow="Action" title="Refund">
              <p className="mb-4 font-ui text-xs text-taupe">
                Maximum refundable: <span className="text-ink">{formatINR(maxRefundPaise)}</span>
              </p>
              <form onSubmit={handleRefund} className="space-y-4">
                <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                  Amount (₹)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={(maxRefundPaise / 100).toFixed(2)}
                    placeholder={`Max ${(maxRefundPaise / 100).toFixed(2)}`}
                    value={refundAmountRupees}
                    onChange={(e) => setRefundAmountRupees(e.target.value)}
                    className="mt-1.5 h-9 w-full border border-mist bg-canvas px-3 font-ui text-xs text-ink outline-none focus:border-accent"
                  />
                  <span className="mt-1 block font-ui text-[10px] text-taupe">
                    Leave blank for full refund of {formatINR(maxRefundPaise)}
                  </span>
                </label>

                <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                  Reason
                  <textarea
                    rows={3}
                    placeholder="Optional reason for refund"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="mt-1.5 w-full border border-mist bg-canvas px-3 py-2 font-ui text-xs text-ink outline-none focus:border-accent resize-none"
                  />
                </label>

                <label className="block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                  Idempotency Key
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="text"
                      value={idempotencyKey}
                      onChange={(e) => setIdempotencyKey(e.target.value)}
                      className="h-9 flex-1 border border-mist bg-canvas px-3 font-mono text-[10px] text-ink outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setIdempotencyKey(newIdempotencyKey())}
                      className="border border-mist px-2 font-ui text-[10px] text-taupe hover:border-ink hover:text-ink"
                      title="Regenerate key"
                    >
                      <RefreshCw size={11} />
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={refundLoading}
                  className="w-full border border-accent bg-accent/5 px-4 py-2.5 font-ui text-[10px] uppercase tracking-[.18em] text-accent transition hover:bg-accent hover:text-canvas disabled:opacity-40"
                >
                  {refundLoading ? "Processing…" : "Submit Refund"}
                </button>
              </form>
            </AdminPanel>
          ) : null}

          {/* Reconcile section — only for CREATED/PENDING */}
          {isPending ? (
            <AdminPanel eyebrow="Action" title="Reconcile session">
              <p className="mb-4 font-ui text-xs text-taupe">
                This session is in a non-terminal state. Query Razorpay to
                recover the real payment status (handles network failures and
                browser closures during checkout).
              </p>
              <button
                type="button"
                disabled={reconcileLoading}
                onClick={handleReconcile}
                className="w-full border border-mist bg-canvas px-4 py-2.5 font-ui text-[10px] uppercase tracking-[.18em] text-ink transition hover:border-ink disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <RotateCcw size={12} />
                {reconcileLoading ? "Reconciling…" : "Reconcile with Razorpay"}
              </button>
            </AdminPanel>
          ) : null}

          {/* Batch reconcile link */}
          <div className="border border-mist/60 bg-surface/40 px-4 py-3">
            <p className="font-ui text-[10px] uppercase tracking-[.14em] text-taupe">Batch reconciliation</p>
            <p className="mt-1 font-ui text-xs text-taupe">
              Run bulk reconciliation across all stuck sessions.
            </p>
            <Link
              to={`${prefix}/payments/reconcile`}
              className="mt-2 inline-block font-ui text-[10px] uppercase tracking-[.14em] text-brass hover:text-accent hover:underline"
            >
              Open reconcile utility →
            </Link>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
