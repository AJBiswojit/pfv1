import { useId } from "react";
import { cn } from "../../utils/cn";

export const employeeInputClass = (hasError = false) =>
  cn(
    "min-h-11 w-full rounded-lg border bg-pf-card px-3.5 py-2.5 font-ui text-sm text-pf-text shadow-[inset_0_1px_2px_rgb(74_7_24/0.04)] transition-colors focus:outline-none focus:ring-2",
    hasError
      ? "border-pf-error focus:border-pf-error focus:ring-pf-error/30"
      : "border-pf-border-strong/60 focus:border-pf-burgundy focus:ring-pf-gold/40"
  );

export default function EmployeeField({
  label,
  required = false,
  optional = false,
  error = "",
  hint = "",
  id,
  className = "",
  children,
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="font-ui text-[12px] font-semibold uppercase tracking-[.12em] text-pf-text">
          {label}
          {required ? <span className="text-pf-error"> *</span> : null}
        </label>
        {optional ? (
          <span className="font-ui text-[11px] lowercase tracking-normal text-pf-muted">optional</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 font-ui text-[12px] font-medium text-pf-error">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 font-ui text-[12px] text-pf-muted">{hint}</p>
      ) : null}
    </div>
  );
}
