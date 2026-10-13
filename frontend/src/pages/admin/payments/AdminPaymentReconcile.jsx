/**
 * PRATIKSHYA FASHION — Admin Payment Batch Reconciliation
 *
 * Utility page: run POST /payments/reconcile-batch and display results.
 * Auto-recovers sessions stuck in PENDING/CREATED due to network failures.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import AdminPage from "../../../components/admin/AdminPage";
import AdminPanel from "../../../components/admin/AdminPanel";
import { useAdminAuth } from "../../../context/AdminAuthContext";
import { apiAdminBatchReconcile } from "../../../services/api/paymentsApi";
import { cn } from "../../../utils/cn";

// ---------------------------------------------------------------------------
// Status badge (reused from AdminPayments)
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
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] ?? "bg-stone-100 text-stone-500 border-stone-200";
  return (
    <span className={cn("inline-block border px-2 py-0.5 font-ui text-[9px] uppercase tracking-[.14em]", style)}>
      {status?.replace(/_/g, " ") ?? "—"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, accent = false }) {
  return (
    <div className={cn("border p-4", accent ? "border-accent/30 bg-accent/5" : "border-mist/80 bg-surface/40")}>
      <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">{label}</p>
      <p className={cn("mt-2 font-display text-3xl font-light", accent ? "text-accent" : "text-ink")}>
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const LIMIT_OPTIONS = [
  { value: 50,  label: "50 sessions" },
  { value: 100, label: "100 sessions" },
  { value: 200, label: "200 sessions" },
  { value: 500, label: "500 sessions" },
];

export default function AdminPaymentReconcile() {
  const { isSuperAdmin } = useAdminAuth();
  const prefix = isSuperAdmin ? "/super-admin" : "/admin";

  const [limit, setLimit]       = useState(100);
  const [running, setRunning]   = useState(false);
  const [result, setResult]     = useState(null);   // BatchReconcileResponse
  const [error, setError]       = useState(null);
  const [ran, setRan]           = useState(false);

  async function handleRunReconcile() {
    setRunning(true);
    setError(null);
    setResult(null);

    const res = await apiAdminBatchReconcile({ limit });
    setRunning(false);
    setRan(true);

    if (res.ok) {
      setResult(res);
    } else {
      setError(res.error ?? "Reconciliation failed. Check your admin permissions.");
    }
  }

  return (
    <AdminPage
      eyebrow="Finance / Payments"
      title={<>Batch <span className="italic text-accent">reconciliation.</span></>}
      description="Audit and recover payment sessions stuck in PENDING or CREATED state due to network failures, browser closures, or server interruptions."
      actions={
        <Link
          to={`${prefix}/payments`}
          className="inline-flex items-center gap-1.5 border border-mist bg-canvas px-3 py-2 font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:border-ink hover:text-ink"
        >
          <ArrowLeft size={11} /> Back to payments
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Control panel */}
        <div className="space-y-6 lg:col-span-1">
          <AdminPanel eyebrow="Configuration" title="Run reconcile">
            {/* Info callout */}
            <div className="mb-5 flex gap-3 border border-mist/60 bg-surface/40 px-4 py-3">
              <Info size={14} className="mt-0.5 shrink-0 text-taupe" />
              <div className="font-ui text-xs text-taupe space-y-1">
                <p>Queries Razorpay for all PENDING / CREATED sessions.</p>
                <p>Safe cases (captured) are auto-recovered. Unsafe cases are flagged for manual review.</p>
                <p className="text-ink">This operation is safe to run repeatedly.</p>
              </div>
            </div>

            <label className="mb-4 block font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
              Session limit
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={running}
                className="mt-1.5 h-9 w-full border border-mist bg-canvas px-2 font-ui text-xs outline-none focus:border-accent disabled:opacity-50"
              >
                {LIMIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <button
              type="button"
              disabled={running}
              onClick={handleRunReconcile}
              className="w-full border border-accent bg-accent/5 px-4 py-3 font-ui text-[10px] uppercase tracking-[.18em] text-accent transition hover:bg-accent hover:text-canvas disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <RotateCcw size={13} className={running ? "animate-spin" : ""} />
              {running ? "Running reconciliation…" : "Run Batch Reconcile"}
            </button>
          </AdminPanel>
        </div>

        {/* Results panel */}
        <div className="lg:col-span-2">
          {/* Pre-run state */}
          {!ran && !running && (
            <div className="flex h-full min-h-[200px] items-center justify-center border border-dashed border-mist/60 bg-surface/20 px-6 py-12 text-center">
              <div>
                <RotateCcw size={24} className="mx-auto mb-3 text-mist" />
                <p className="font-display text-lg font-light text-taupe">No results yet</p>
                <p className="mt-1 font-ui text-xs text-taupe">
                  Configure the limit and click Run to start.
                </p>
              </div>
            </div>
          )}

          {/* Running skeleton */}
          {running && (
            <div className="flex h-full min-h-[200px] items-center justify-center border border-mist/60 bg-surface/40 px-6 py-12 text-center">
              <div>
                <RotateCcw size={24} className="mx-auto mb-3 animate-spin text-accent" />
                <p className="font-display text-lg font-light text-ink">Reconciling…</p>
                <p className="mt-1 font-ui text-xs text-taupe">
                  Querying Razorpay for up to {limit} sessions.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !running && (
            <div role="alert" className="flex gap-3 border border-accent/30 bg-accent/5 px-4 py-4 font-ui text-sm text-accent">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Reconciliation failed</p>
                <p className="mt-1 text-xs">{error}</p>
              </div>
            </div>
          )}

          {/* Success results */}
          {result && !running && (
            <div className="space-y-6">
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Total Audited"   value={result.totalAudited}   />
                <StatCard label="Reconciled"      value={result.reconciled}     accent={result.reconciled > 0} />
                <StatCard label="Flagged"         value={result.flaggedForAdmin} />
                <StatCard label="No Change"       value={Math.max(0, result.totalAudited - result.reconciled - result.flaggedForAdmin)} />
              </div>

              {/* Success / all-clear banner */}
              {result.flaggedForAdmin === 0 && result.totalAudited > 0 ? (
                <div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <p className="font-ui text-sm text-emerald-800">
                    All audited sessions are consistent — no manual review required.
                  </p>
                </div>
              ) : null}

              {result.totalAudited === 0 ? (
                <div className="flex items-center gap-3 border border-mist/60 bg-surface/40 px-4 py-3">
                  <CheckCircle2 size={16} className="text-taupe shrink-0" />
                  <p className="font-ui text-sm text-taupe">
                    No PENDING or CREATED sessions found — nothing to reconcile.
                  </p>
                </div>
              ) : null}

              {/* Details table */}
              {result.details?.length > 0 ? (
                <AdminPanel eyebrow="Results" title="Session details" bodyClassName="px-0 py-0 sm:px-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="border-b border-mist/60 bg-canvas/60">
                          {["Session ID", "Reconciled", "Status", "Flags", "Message"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left font-ui text-[9px] uppercase tracking-[.18em] text-taupe">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.details.map((row, i) => (
                          <tr
                            key={row.session_id ?? i}
                            className="border-b border-mist/40 last:border-0"
                          >
                            <td className="px-4 py-2">
                              <Link
                                to={`${prefix}/payments/${row.session_id}`}
                                className="font-mono text-[10px] text-brass hover:text-accent hover:underline"
                              >
                                {(row.session_id ?? "").slice(0, 13)}…
                              </Link>
                            </td>
                            <td className="px-4 py-2">
                              {row.reconciled ? (
                                <span className="font-ui text-[10px] text-emerald-700">Yes</span>
                              ) : (
                                <span className="font-ui text-[10px] text-taupe">No</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {row.session_status ? (
                                <StatusBadge status={row.session_status} />
                              ) : (
                                <span className="font-ui text-[10px] text-taupe">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {row.requires_admin_review ? (
                                <span className="inline-flex items-center gap-1 font-ui text-[9px] text-amber-700">
                                  <AlertTriangle size={10} /> Review
                                </span>
                              ) : (
                                <span className="font-ui text-[10px] text-taupe">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 font-ui text-[10px] text-taupe max-w-[240px] truncate">
                              {row.message ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AdminPanel>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
