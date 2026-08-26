import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileText } from "lucide-react";
import OrderPageShell from "../../components/orders/OrderPageShell";
import OrderErrorState from "../../components/orders/OrderErrorState";
import OrderLoadingState from "../../components/orders/OrderLoadingState";
import ConfirmDialog from "../../components/orders/ConfirmDialog";
import InvoicePreview from "../../components/orders/InvoicePreview";
import OrderItemList from "../../components/orders/OrderItemList";
import OrderNotFound from "../../components/orders/OrderNotFound";
import OrderStatusBadge from "../../components/orders/OrderStatusBadge";
import OrderSummaryPanel from "../../components/orders/OrderSummaryPanel";
import OrderTimeline from "../../components/orders/OrderTimeline";
import ReturnSummaryCard from "../../components/orders/ReturnSummaryCard";
import { useCart } from "../../context/CartContext";
import { useOrder } from "../../context/OrderContext";
import {
  AtelierButton,
  EditorialHeading,
  Rule,
  transition,
} from "../../design-system";
import {
  ORDER_PAYMENT_STATUS,
  ORDER_STATUS,
  getOrderStatus,
} from "../../config/orderConfig";
import {
  buyAgainAvailability,
  canCancelOrder,
  canRequestReturnNow,
  canTrackOrder,
  formatOrderDate,
  latestReturn,
  orderItemCount,
  refundMethodLabel,
  returnBlockedReason,
  returnWindow,
} from "../../utils/orders";
import { formatINR } from "../../utils/shopping";
import { formatPhone } from "../../utils/validation";
import { cn } from "../../utils/cn";

/** A labelled value in the order meta band. */
function Meta({ label, children }) {
  return (
    <div>
      <dt className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
        {label}
      </dt>
      <dd className="mt-1.5 font-ui text-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * Order detail — /account/orders/:orderId.
 *
 * Everything the customer needs about a single order: what they bought,
 * what they paid, where it is going, how it was paid for and the actions
 * that are actually valid for its current status.
 *
 * The order is read through the ownership-checked context accessor, so an
 * order belonging to another customer resolves to the same safe not-found
 * state as an invalid id.
 */
export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const { fetchOrder, getTracking, cancelOrder } = useOrder();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [notice, setNotice] = useState("");

  /**
   * Server-authoritative load. The backend enforces ownership, so this is
   * the only reliable answer to "is this order mine?" — and its status
   * lets the page distinguish "loading", "not yours / not found",
   * "signed out" and "our side failed" instead of showing one blanket
   * not-found state (which previously appeared even for a 500).
   */
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOrder(orderId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setOrder(result.order);
      } else {
        setOrder(null);
        setError({ status: result.status, message: result.error });
      }
    });
    return () => { cancelled = true; };
  }, [orderId, fetchOrder, reloadToken]);

  /**
   * Real, stored progress only — persisted status-history events from
   * `GET /orders/{id}/tracking`. A tracking failure never blocks the
   * order detail: the timeline section simply reports itself unavailable.
   */
  useEffect(() => {
    if (!order?.id) { setTracking(null); return; }
    let cancelled = false;
    getTracking(order.id).then((result) => {
      if (cancelled) return;
      setTracking(result.ok ? result.tracking : null);
    });
    return () => { cancelled = true; };
  }, [order?.id, getTracking]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = order
      ? `Order ${order.orderNumber ?? order.id} — PRATIKSHYA FASHON`
      : "Order — PRATIKSHYA FASHON";
    return () => {
      document.title = previousTitle;
    };
  }, [order]);

  // Loading must win over every empty/not-found state.
  if (loading) return <OrderLoadingState label="Loading your order…" />;

  // A failed request is never rendered as an empty success.
  if (error) {
    return <OrderErrorState status={error.status} message={error.message} onRetry={reload} />;
  }

  if (!order) return <OrderNotFound />;

  const status = getOrderStatus(order.status);
  const count = orderItemCount(order);
  const activeReturn = latestReturn(order);
  const orderRef = order.orderNumber ?? order.id;
  const returnWindowState = returnWindow(order);
  const returnBlocked = returnBlockedReason(order);

  /* ----------------------------- Actions ----------------------------- */

  /**
   * Cancellation is decided entirely by the backend (Phase 2 behaviour is
   * unchanged). On success the server's own order record replaces the
   * local one, so the displayed status is never guessed.
   */
  const handleCancel = async () => {
    const result = await cancelOrder(order.id);
    setConfirmOpen(false);
    if (result.ok && result.order) {
      setOrder(result.order);
      setNotice("This order has been cancelled.");
      return;
    }
    setNotice(
      result.message ||
        "This order can no longer be cancelled. Please contact the atelier."
    );
  };

  /**
   * Buy Again — reuses the one cart implementation. Pieces whose variant
   * has retired are sent to their product page rather than blindly added,
   * and pieces that have left the catalogue are reported gracefully.
   */
  const handleBuyAgain = () => {
    let added = 0;
    let needsChoice = null;
    let unavailable = 0;

    order.items.forEach((item) => {
      const availability = buyAgainAvailability(item);
      if (availability.state === "unavailable") {
        unavailable += 1;
        return;
      }
      if (availability.state === "variant") {
        needsChoice = needsChoice ?? availability.href;
        return;
      }
      const result = cart.addToCart(availability.product, {
        color: item.color,
        size: item.size,
        quantity: item.quantity,
      });
      if (result.ok) added += 1;
    });

    if (added > 0) {
      cart.openDrawer();
      setNotice(
        unavailable > 0 || needsChoice
          ? `${added} ${added === 1 ? "piece" : "pieces"} added to your bag. Some pieces need a fresh selection.`
          : "Your pieces are back in your bag."
      );
      return;
    }

    if (needsChoice) {
      navigate(needsChoice);
      return;
    }

    setNotice(
      "These pieces are no longer available. Our new arrivals may hold something you love."
    );
  };

  /* ------------------------------ Page ------------------------------ */

  return (
    <OrderPageShell
      breadcrumbItems={[
        { label: "Account", to: "/account" },
        { label: "Orders", to: "/account/orders" },
        { label: orderRef },
      ]}
    >
      <EditorialHeading
        as="h2"
        size="subsection"
        eyebrow={`Order ${orderRef}`}
        spacing={{ eyebrow: "mb-3", title: "mb-0" }}
      >
        {status.summary.replace(/\.$/, "")}
        <span className="text-accent">.</span>
      </EditorialHeading>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <OrderStatusBadge status={order.status} kind="order" />
        <OrderStatusBadge status={order.paymentStatus} kind="payment" />
        <span className="font-ui text-[11px] text-taupe">
          Placed {formatOrderDate(order.createdAt)}
        </span>
      </div>

      <Rule width="w-14" tone="accent" className="my-7" />

      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-7 border border-accent/30 bg-accent/5 px-5 py-4 font-ui text-[11px] leading-relaxed text-accent"
        >
          {notice}
        </p>
      ) : null}

      {/* ---------------------------- Meta band ---------------------------- */}
      <dl className="grid gap-6 border border-mist/80 bg-surface/40 p-6 sm:grid-cols-2 md:grid-cols-4 md:p-7">
        <Meta label="Order Date">{formatOrderDate(order.createdAt)}</Meta>
        <Meta label="Pieces">
          {count} {count === 1 ? "piece" : "pieces"}
        </Meta>
        <Meta label="Order Total">{formatINR(order.pricing.total)}</Meta>
        {/* Only a real, backend-recorded date is ever shown here. When
            nothing has been recorded the field says so plainly rather
            than presenting the shipping-method caption as a promise. */}
        <Meta label={order.flags?.isDelivered ? "Delivered" : "Estimated Delivery"}>
          {order.flags?.isDelivered
            ? formatOrderDate(order.tracking?.deliveredAt)
            : order.tracking?.estimatedDelivery
              ? formatOrderDate(order.tracking.estimatedDelivery)
              : "Not yet scheduled"}
          <span className="mt-0.5 block font-ui text-[10px] text-taupe">
            {order.deliveryMethod.label}
            {order.deliveryMethod.serviceLevel
              ? ` · ${order.deliveryMethod.serviceLevel}`
              : ""}
          </span>
        </Meta>
      </dl>

      {/* ----------------------------- Actions ----------------------------- */}
      <div className="mt-7 flex flex-wrap items-center gap-3">
        {canTrackOrder(order) && (
          <AtelierButton
            as={Link}
            to={`/account/orders/${order.id}/track`}
            variant="primary"
            size="chip"
          >
            Track Order
          </AtelierButton>
        )}
        {/* No invoice document is generated by this system. The button
            only appears once the backend has actually issued an invoice
            number; otherwise an honest note is shown instead of a
            download that cannot be honoured. */}
        {order.invoice?.available ? (
          <AtelierButton
            type="button"
            variant="outline"
            size="chip"
            onClick={() => setInvoiceOpen(true)}
          >
            View Invoice
          </AtelierButton>
        ) : null}
        {/* Offered only when the backend would accept the request:
            delivered, with un-returned lines, inside the recorded return
            window. Anything else is explained below instead. */}
        {canRequestReturnNow(order) && (
          <AtelierButton
            as={Link}
            to={`/account/orders/${order.id}/return`}
            variant="outline"
            size="chip"
          >
            Return Items
          </AtelierButton>
        )}
        {canCancelOrder(order) && (
          <AtelierButton
            type="button"
            variant="outline"
            size="chip"
            onClick={() => setConfirmOpen(true)}
          >
            Cancel Order
          </AtelierButton>
        )}
        <AtelierButton
          type="button"
          variant="outline"
          size="chip"
          onClick={handleBuyAgain}
        >
          Buy Again
        </AtelierButton>
        <Link
          to="/shop"
          className={cn(
            "font-ui text-[10px] uppercase tracking-[.16em] text-brass hover:text-accent",
            transition.colors
          )}
        >
          Continue Shopping
        </Link>
      </div>

      {/* --------------------------- Timeline ---------------------------
          Every step shown here is a transition the atelier actually
          recorded. Steps with no recorded transition carry no date — no
          delivery leg is ever estimated for the customer. */}
      <section aria-label="Order journey" className="mt-10 border border-mist/80 bg-surface/30 p-6 md:p-7">
        <h3 className="font-ui text-[10px] uppercase tracking-[.2em] text-accent mb-6">
          Journey
        </h3>
        {tracking?.steps?.length ? (
          <>
            <OrderTimeline
              events={tracking.steps}
              showLocation={false}
              ariaLabel={`Journey for order ${orderRef}`}
            />
            <p className="mt-6 font-ui text-[10px] leading-relaxed text-taupe">
              Dates appear against a step once the atelier records it. Steps
              still ahead are shown without a date — we do not estimate them.
            </p>
          </>
        ) : (
          <p className="font-ui text-xs leading-relaxed text-graphite">
            No progress has been recorded against this order yet. This page
            will update as the atelier moves it forward.
          </p>
        )}
      </section>

      {/* ------------------------------ Body ------------------------------ */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-12">
        {/* Left column */}
        <div>
          <h3 className="font-display text-xl font-light tracking-tight text-ink">
            Your pieces
          </h3>
          <OrderItemList items={order.items} className="mt-5" />

          {activeReturn ? (
            <ReturnSummaryCard
              record={activeReturn}
              order={order}
              className="mt-10"
            />
          ) : null}
        </div>

        {/* Right column */}
        <div className="space-y-7">
          <OrderSummaryPanel pricing={order.pricing} />

          {/* Payment */}
          <section
            aria-label="Payment information"
            className="border border-mist/80 bg-surface/30 p-6 md:p-7"
          >
            <h3 className="font-ui text-[10px] uppercase tracking-[.2em] text-accent">
              Payment
            </h3>
            <p className="mt-3 font-display text-lg font-light text-ink">
              {order.paymentMethod.label}
            </p>
            <div className="mt-2.5">
              <OrderStatusBadge status={order.paymentStatus} kind="payment" />
            </div>
            {/* Refund figures come from a real return record; nothing is
                shown when no refund has been recorded. */}
            {activeReturn?.refundAmount ? (
              <div className="mt-5 border-t border-mist/70 pt-4">
                <p className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
                  Refund
                </p>
                <p className="mt-1.5 font-display text-lg font-light text-ink">
                  {formatINR(activeReturn.refundAmount)}
                </p>
                <p className="mt-1 font-ui text-[11px] text-graphite">
                  {refundMethodLabel(order)}
                </p>
                {activeReturn.refundStatus ? (
                  <p className="mt-1 font-ui text-[10px] uppercase tracking-[.14em] text-taupe">
                    {activeReturn.refundStatus.replace(/_/g, " ").toLowerCase()}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-5 font-ui text-[10px] leading-relaxed text-taupe">
              No card details or payment credentials are ever stored with an
              order.
            </p>
          </section>

          {/* Delivery address snapshot */}
          {order.address ? (
            <section
              aria-label="Delivery address"
              className="border border-mist/80 bg-surface/30 p-6 md:p-7"
            >
              <h3 className="font-ui text-[10px] uppercase tracking-[.2em] text-accent">
                Delivering To
              </h3>
              <p className="mt-3 font-display text-base font-light text-ink">
                {order.address.fullName}
              </p>
              <p className="mt-1 font-ui text-xs leading-relaxed text-graphite">
                {order.address.addressLine}
                {order.address.landmark ? `, ${order.address.landmark}` : ""}
              </p>
              <p className="font-ui text-xs text-graphite">
                {order.address.city}, {order.address.state} —{" "}
                {order.address.pincode}
              </p>
              {order.address.phone ? (
                <p className="mt-2 font-ui text-[11px] text-taupe">
                  {formatPhone(order.address.phone)}
                </p>
              ) : null}
              <p className="mt-4 font-ui text-[10px] leading-relaxed text-taupe">
                This is the address recorded when the order was placed. Editing
                your address book never changes a past order.
              </p>
            </section>
          ) : null}

          {/* Invoice availability — stated honestly. */}
          <section
            aria-label="Invoice"
            className="border border-mist/80 bg-surface/30 p-6 md:p-7"
          >
            <h3 className="flex items-center gap-2 font-ui text-[10px] uppercase tracking-[.2em] text-accent">
              <FileText size={12} aria-hidden="true" />
              Invoice
            </h3>
            {order.invoice?.available ? (
              <>
                <p className="mt-3 font-ui text-sm tracking-wide text-ink">
                  {order.invoice.number}
                </p>
                {order.invoice.issuedAt ? (
                  <p className="mt-1 font-ui text-[11px] text-taupe">
                    Issued {formatOrderDate(order.invoice.issuedAt)}
                  </p>
                ) : null}
                <p className="mt-4 font-ui text-[10px] leading-relaxed text-taupe">
                  A downloadable invoice document is not available yet. The
                  summary above reflects exactly what was charged.
                </p>
              </>
            ) : (
              <p className="mt-3 font-ui text-xs leading-relaxed text-graphite">
                An invoice has not been issued for this order yet. Please
                contact the atelier if you need one for your records.
              </p>
            )}
          </section>

          {/* Why a return is not being offered — never left unexplained. */}
          {!canRequestReturnNow(order) && returnBlocked ? (
            <section
              aria-label="Returns"
              className="border border-mist/80 bg-surface/30 p-6 md:p-7"
            >
              <h3 className="font-ui text-[10px] uppercase tracking-[.2em] text-accent">
                Returns
              </h3>
              <p className="mt-3 font-ui text-xs leading-relaxed text-graphite">
                {returnBlocked}
              </p>
            </section>
          ) : returnWindowState.known && returnWindowState.open ? (
            <p className="font-ui text-[10px] leading-relaxed text-taupe">
              Returns for this order close in {returnWindowState.daysLeft}{" "}
              {returnWindowState.daysLeft === 1 ? "day" : "days"}.
            </p>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Cancel this order?"
        description={
          // A paid order's cancellation does not move money or restock
          // anything by itself — the UI must not claim otherwise.
          order.paymentStatus === ORDER_PAYMENT_STATUS.PAID
            ? "Are you sure you want to cancel this order? It has already been paid for, so the atelier will contact you about the refund — no refund is issued automatically."
            : "Are you sure you want to cancel this order? Nothing has been charged for it."
        }
        confirmLabel="Cancel Order"
        cancelLabel="Keep Order"
        onConfirm={handleCancel}
        onCancel={() => setConfirmOpen(false)}
      />

      <InvoicePreview
        order={order}
        isOpen={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
      />
    </OrderPageShell>
  );
}
