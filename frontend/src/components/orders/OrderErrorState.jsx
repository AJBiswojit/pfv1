import { Link } from "react-router-dom";
import OrderPageShell from "./OrderPageShell";
import { AtelierButton, EmptyState } from "../../design-system";

/**
 * The single error surface for every order screen.
 *
 * PHASE 3 REQUIREMENT: a backend failure must never be presented as an
 * empty successful state. Each HTTP status gets its own honest message
 * and its own recovery action, so "you are signed out", "this is not your
 * order", "this no longer exists" and "our side broke" are never confused
 * with "you have no orders".
 *
 * 401 — session expired / not signed in → sign in
 * 403 — the order belongs to someone else → back to own orders
 * 404 — no such order → back to own orders
 * 409 — the order moved on (e.g. already cancelled) → refresh
 * 422 — the action is not valid for this order → refresh / read the reason
 * 5xx — our side failed → retry
 *   0 — the request never reached us (offline) → retry
 *
 * 403 and 404 deliberately share identical copy: a customer probing
 * another customer's order id must not be able to tell them apart.
 */

const COPY = {
  401: {
    eyebrow: "Session Expired",
    title: "Please sign in again",
    description:
      "Your session has expired. Sign in again to see your orders — nothing has been lost.",
  },
  403: {
    eyebrow: "Order Not Found",
    title: "Order not found",
    description: "That order could not be found in your account.",
  },
  404: {
    eyebrow: "Order Not Found",
    title: "Order not found",
    description: "That order could not be found in your account.",
  },
  409: {
    eyebrow: "Order Changed",
    title: "This order has moved on",
    description:
      "This order changed while you were viewing it, so that action no longer applies. Reload to see where it stands now.",
  },
  422: {
    eyebrow: "Not Possible",
    title: "That is not possible for this order",
    description:
      "This order's current state does not allow that. Reload to see the actions available now.",
  },
  429: {
    eyebrow: "Too Many Requests",
    title: "Please slow down for a moment",
    description: "Too many requests were made in a short time. Please wait a moment and try again.",
  },
  0: {
    eyebrow: "Connection Lost",
    title: "We could not reach the atelier",
    description:
      "Your request did not reach us. Check your connection and try again — nothing was changed.",
  },
  500: {
    eyebrow: "Something Went Wrong",
    title: "We could not load this right now",
    description:
      "Something went wrong on our side. This is not a problem with your order — please try again in a moment.",
  },
};

/** Resolve status → copy, treating every unmapped 5xx as a server error. */
export function orderErrorCopy(status, message) {
  const base =
    COPY[status] ?? (typeof status === "number" && status >= 500 ? COPY[500] : COPY[500]);
  // Prefer the server's own explanation for the statuses where it carries
  // a real business reason (409 conflict / 422 rule violation).
  if (message && (status === 409 || status === 422)) {
    return { ...base, description: message };
  }
  return base;
}

export default function OrderErrorState({
  status = 500,
  message = "",
  onRetry = null,
  breadcrumbItems = [
    { label: "Account", to: "/account" },
    { label: "Orders", to: "/account/orders" },
    { label: "Unavailable" },
  ],
}) {
  const copy = orderErrorCopy(status, message);
  const retryable = status === 0 || status === 409 || status === 422 || status >= 500;

  return (
    <OrderPageShell breadcrumbItems={breadcrumbItems}>
      <div
        role="alert"
        aria-live="assertive"
        className="border border-mist/80 bg-surface/30 px-6"
      >
        <EmptyState
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
          actions={
            <div className="flex flex-wrap items-center justify-center gap-4">
              {status === 401 ? (
                <AtelierButton
                  as={Link}
                  to="/auth/sign-in?returnTo=/account/orders"
                  variant="primary"
                  size="md"
                >
                  Sign In
                </AtelierButton>
              ) : null}
              {retryable && onRetry ? (
                <AtelierButton type="button" variant="primary" size="md" onClick={onRetry}>
                  Try Again
                </AtelierButton>
              ) : null}
              <AtelierButton as={Link} to="/account/orders" variant="outline" size="md">
                View My Orders
              </AtelierButton>
            </div>
          }
        />
      </div>
    </OrderPageShell>
  );
}
