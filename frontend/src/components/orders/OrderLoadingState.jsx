import OrderPageShell from "./OrderPageShell";
import { cn } from "../../utils/cn";

/**
 * The loading surface for every order screen.
 *
 * PHASE 3 REQUIREMENT: an order screen must never render its "not found"
 * or "no orders yet" state while a request is still in flight. Screens
 * render this while `loading` is true, so a slow response reads as
 * "loading" instead of "you have nothing".
 *
 * It is announced politely for screen readers and is otherwise a quiet
 * skeleton in the house style.
 */

function Bar({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-sm bg-mist/60", className)}
    />
  );
}

export default function OrderLoadingState({
  label = "Loading your order…",
  rows = 3,
  breadcrumbItems = [
    { label: "Account", to: "/account" },
    { label: "Orders", to: "/account/orders" },
    { label: "Loading" },
  ],
}) {
  return (
    <OrderPageShell breadcrumbItems={breadcrumbItems}>
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">{label}</span>
        <Bar className="h-3 w-32" />
        <Bar className="mt-4 h-7 w-2/3" />
        <Bar className="mt-6 h-px w-14" />
        <div className="mt-8 space-y-4 border border-mist/80 bg-surface/30 p-6 md:p-7">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Bar className="h-14 w-11 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bar className="h-3 w-1/2" />
                <Bar className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </OrderPageShell>
  );
}
