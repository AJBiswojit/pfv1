import { getEmployeeStatus } from "../../config/employeeStatus";
import { cn } from "../../utils/cn";

const tones = {
  ink: "bg-pf-burgundy text-pf-ivory",
  accent: "bg-pf-burgundy text-white",
  quiet: "bg-pf-ivory text-pf-cocoa border border-pf-border",
  danger: "bg-pf-burgundy/10 text-pf-burgundy border border-pf-gold-deep/30",
  alert: "bg-amber-500/10 text-amber-800 border border-amber-500/30",
  brass: "bg-pf-gold/15 text-pf-gold-text-deep border border-pf-gold-deep/30",
  muted: "bg-pf-ivory text-pf-muted border border-pf-border",
};

export default function StatusBadge({ status, label, tone, className = "" }) {
  const definition = status ? getEmployeeStatus(status) : null;
  const resolvedTone = tone || definition?.tone || "quiet";
  const resolvedLabel = label || definition?.label || status || "—";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 font-ui text-[11px] font-semibold uppercase tracking-[0.08em]",
        tones[resolvedTone] ?? tones.quiet,
        className
      )}
    >
      {resolvedLabel}
    </span>
  );
}
