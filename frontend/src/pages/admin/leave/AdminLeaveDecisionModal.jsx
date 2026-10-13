/**
 * PRATIKSHYA FASHION — Admin Leave Decision Modal
 *
 * Inline approve/reject panel rendered as a fixed overlay. Accepts a single
 * leave record and calls `apiDecideLeave` on submit. The parent is
 * responsible for removing the record from the pending queue on success.
 *
 * Requires `people.manage` capability to render the action buttons; the
 * parent (AdminLeaveQueue) already gates the row click behind `people.view`,
 * so this modal is only reachable by users who also have the broader
 * `people.manage` permission when they want to act.
 */

import { useState } from "react";
import { X, CalendarRange, User, Clock, FileText } from "lucide-react";
import { AtelierButton, Rule } from "../../../design-system";
import { apiDecideLeave } from "../../../services/workforce/workforceApi";
import { cn } from "../../../utils/cn";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-NP", { year: "numeric", month: "short", day: "numeric" });
}

function formatDatetime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-NP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LEAVE_TYPE_LABELS = {
  ANNUAL: "Annual Leave",
  SICK: "Sick Leave",
  CASUAL: "Casual Leave",
  MATERNITY: "Maternity Leave",
  PATERNITY: "Paternity Leave",
  UNPAID: "Unpaid Leave",
  OTHER: "Other",
};

const STATUS_CLASSES = {
  PENDING:  "border border-amber-400/40 bg-amber-50 text-amber-700",
  APPROVED: "border border-emerald-400/30 bg-emerald-50 text-emerald-700",
  REJECTED: "border border-accent/25 bg-accent/10 text-accent",
  CANCELLED:"border border-mist bg-surface text-cocoa",
};

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={14} className="mt-0.5 shrink-0 text-brass" />
      <div className="min-w-0 flex-1">
        <p className="font-ui text-[9px] uppercase tracking-[.16em] text-taupe">{label}</p>
        <p className="mt-0.5 font-ui text-sm text-ink">{value ?? "—"}</p>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {object}   props.leave       — Leave record from the queue (required)
 * @param {boolean}  props.canDecide   — Whether the current user has people.manage
 * @param {function} props.onDecided   — Called with the updated record after success
 * @param {function} props.onClose     — Called when the modal should close
 */
export default function AdminLeaveDecisionModal({ leave, canDecide, onDecided, onClose }) {
  const [decision, setDecision] = useState("APPROVED");
  const [reviewNote, setReviewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!leave) return null;

  const isPending = leave.status === "PENDING";
  const noteRequired = decision === "REJECTED";
  const canSubmit = canDecide && isPending && (!noteRequired || reviewNote.trim().length > 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await apiDecideLeave(leave.id, {
      decision,
      reviewNote: reviewNote.trim() || null,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.message ?? "Failed to submit decision. Please try again.");
      return;
    }

    onDecided?.(result.record ?? { ...leave, status: decision });
  };

  // Close on backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose?.();
  };

  const leaveTypeLabel =
    LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType ?? "—";

  const dateRange =
    leave.startDate && leave.endDate
      ? leave.startDate === leave.endDate
        ? formatDate(leave.startDate)
        : `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`
      : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-decision-title"
    >
      <div className="w-full max-w-lg border border-mist bg-surface">
        {/* ── Header ── */}
        <div className="flex items-start justify-between border-b border-mist/60 px-6 py-5">
          <div>
            <p className="font-ui text-[9px] uppercase tracking-[.18em] text-taupe">
              Leave Request
            </p>
            <h2
              id="leave-decision-title"
              className="mt-1 font-display text-xl font-light text-ink"
            >
              Review{" "}
              <span className="italic text-accent">
                {leave.employeeName ?? "employee"}
              </span>
              {"'s request."}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center text-taupe hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Leave details ── */}
        <div className="space-y-4 px-6 py-5">
          <DetailRow
            icon={User}
            label="Employee"
            value={
              leave.employeeName
                ? `${leave.employeeName}${leave.employeeId ? ` · ${leave.employeeId}` : ""}`
                : leave.employeeId ?? "—"
            }
          />
          <DetailRow icon={CalendarRange} label="Leave type" value={leaveTypeLabel} />
          <DetailRow
            icon={CalendarRange}
            label={`Date range · ${leave.days ?? "?"} day${leave.days === 1 ? "" : "s"}`}
            value={dateRange}
          />
          {leave.reason ? (
            <DetailRow icon={FileText} label="Reason" value={leave.reason} />
          ) : null}
          <DetailRow
            icon={Clock}
            label="Requested at"
            value={formatDatetime(leave.requestedAt ?? leave.requested_at)}
          />

          {/* Show current status if already decided */}
          {!isPending && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 font-ui text-[11px]",
                  STATUS_CLASSES[leave.status] ?? STATUS_CLASSES.CANCELLED
                )}
              >
                {leave.status}
              </span>
              {leave.reviewNote && (
                <span className="font-ui text-xs text-taupe">
                  "{leave.reviewNote}"
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Decision form (only for pending + permitted) ── */}
        {isPending && canDecide ? (
          <form onSubmit={handleSubmit}>
            <Rule width="w-full" tone="mist" className="mx-0" />

            <div className="space-y-5 px-6 py-5">
              {/* Decision radio */}
              <fieldset>
                <legend className="font-ui text-[9px] uppercase tracking-[.16em] text-taupe">
                  Decision
                </legend>
                <div className="mt-3 flex gap-6">
                  {[
                    { value: "APPROVED", label: "Approve" },
                    { value: "REJECTED", label: "Reject" },
                  ].map(({ value, label }) => (
                    <label
                      key={value}
                      className="flex cursor-pointer items-center gap-2 font-ui text-sm text-ink"
                    >
                      <input
                        type="radio"
                        name="decision"
                        value={value}
                        checked={decision === value}
                        onChange={() => {
                          setDecision(value);
                          setError(null);
                        }}
                        className="accent-ink"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Review note */}
              <div>
                <label
                  htmlFor="leave-review-note"
                  className="font-ui text-[9px] uppercase tracking-[.16em] text-taupe"
                >
                  Review note{noteRequired ? " *" : " (optional)"}
                </label>
                <textarea
                  id="leave-review-note"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  placeholder={
                    noteRequired
                      ? "Required — explain the rejection reason."
                      : "Optional note for the employee."
                  }
                  className="mt-2 w-full border border-mist bg-canvas px-3 py-2 font-ui text-xs text-ink placeholder:text-taupe/60 focus:border-accent focus:outline-none"
                />
              </div>

              {/* Error */}
              {error ? (
                <p
                  role="alert"
                  className="border border-accent/30 bg-accent/5 px-3 py-2 font-ui text-[11px] text-accent"
                >
                  {error}
                </p>
              ) : null}
            </div>

            {/* Actions */}
            <div className="flex gap-3 border-t border-mist/60 px-6 py-4">
              <AtelierButton
                type="submit"
                variant="primary"
                size="md"
                disabled={!canSubmit || submitting}
                className="flex-1 justify-center"
              >
                {submitting
                  ? "Submitting…"
                  : decision === "APPROVED"
                  ? "Approve leave"
                  : "Reject leave"}
              </AtelierButton>
              <AtelierButton
                type="button"
                variant="outline"
                size="md"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 justify-center"
              >
                Cancel
              </AtelierButton>
            </div>
          </form>
        ) : isPending && !canDecide ? (
          /* Read-only view for users without people.manage */
          <div className="border-t border-mist/60 px-6 py-4">
            <p className="font-ui text-xs text-taupe">
              You have view access only. Approving or rejecting leave requires the{" "}
              <span className="font-medium text-ink">people.manage</span> capability.
            </p>
            <div className="mt-4">
              <AtelierButton
                type="button"
                variant="outline"
                size="md"
                onClick={onClose}
                className="w-full justify-center"
              >
                Close
              </AtelierButton>
            </div>
          </div>
        ) : (
          /* Already decided — read-only */
          <div className="border-t border-mist/60 px-6 py-4">
            <AtelierButton
              type="button"
              variant="outline"
              size="md"
              onClick={onClose}
              className="w-full justify-center"
            >
              Close
            </AtelierButton>
          </div>
        )}
      </div>
    </div>
  );
}
