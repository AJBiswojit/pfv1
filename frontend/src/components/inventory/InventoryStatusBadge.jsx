import { cn } from "../../utils/cn";

export const STOCK_STATUS_LABELS = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
  OVERSTOCKED: "Overstocked",
  UNAVAILABLE: "Unavailable",
};

export const TRANSFER_STATUS_LABELS = {
  DRAFT: "Draft",
  REQUESTED: "Requested",
  APPROVED: "Approved",
  IN_TRANSIT: "In transit",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

const tones = {
  IN_STOCK: "border-pf-cocoa/25 bg-pf-cocoa/[0.06] text-pf-cocoa",
  LOW_STOCK: "border-pf-gold-deep/50 bg-pf-gold/10 text-pf-cocoa",
  OUT_OF_STOCK: "border-pf-gold-deep/35 bg-pf-burgundy/[0.07] text-pf-burgundy",
  OVERSTOCKED: "border-pf-gold-deep/30 bg-pf-gold/[0.07] text-pf-gold-text",
  UNAVAILABLE: "border-pf-border bg-pf-border/25 text-pf-muted",
  DRAFT: "border-pf-border bg-pf-border/25 text-pf-muted",
  REQUESTED: "border-pf-gold-deep/50 bg-pf-gold/10 text-pf-cocoa",
  APPROVED: "border-pf-gold-deep/35 bg-pf-gold/[0.08] text-pf-gold-text",
  IN_TRANSIT: "border-pf-burgundy/25 bg-pf-burgundy/[0.05] text-pf-text",
  RECEIVED: "border-pf-cocoa/25 bg-pf-cocoa/[0.06] text-pf-cocoa",
  CANCELLED: "border-pf-gold-deep/25 bg-pf-burgundy/[0.05] text-pf-burgundy",
};

export default function InventoryStatusBadge({ status, kind = "stock" }) {
  const labels = kind === "transfer" ? TRANSFER_STATUS_LABELS : STOCK_STATUS_LABELS;
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 font-ui text-[11px] font-semibold uppercase tracking-[0.08em]",
        tones[status] || tones.UNAVAILABLE
      )}
    >
      {labels[status] || String(status || "Unknown").replaceAll("_", " ")}
    </span>
  );
}
