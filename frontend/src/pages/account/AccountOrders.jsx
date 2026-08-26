import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, X } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import OrderCard from "../../components/orders/OrderCard";
import { orderErrorCopy } from "../../components/orders/OrderErrorState";
import { useOrder } from "../../context/OrderContext";
import {
  AtelierButton,
  EditorialHeading,
  EmptyState,
  Rule,
  transition,
} from "../../design-system";
import { ORDER_FILTERS } from "../../config/orderConfig";
import { matchesOrderSearch } from "../../utils/orders";
import { cn } from "../../utils/cn";

/**
 * Order history — /account/orders.
 *
 * Every order this customer has placed, set as editorial cards rather
 * than a dashboard table. The list itself is server-authoritative
 * (`GET /orders`, scoped to the session's own customer id); the status
 * filter and the search box narrow the loaded page client-side.
 *
 * PHASE 3 states: this page now distinguishes
 *   loading   — a request is in flight (never shows "no orders yet")
 *   error     — the request failed; 401 / 403 / 404 / 409 / 422 / 5xx each
 *               get their own message and recovery action
 *   empty     — the request SUCCEEDED and the customer genuinely has none
 *   success   — the cards
 */
export default function AccountOrders() {
  const {
    orders,
    guestOrderCount,
    claimGuestOrders,
    isLoadingOrders,
    ordersError,
    ordersErrorStatus,
    refreshOrders,
  } = useOrder();
  const [filterId, setFilterId] = useState("all");
  const [query, setQuery] = useState("");
  const retry = useCallback(() => { refreshOrders(); }, [refreshOrders]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "My Orders — PRATIKSHYA FASHON";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  /**
   * Orders matching the chosen status filter and the search box.
   * Search covers the order number as well as the id, so a customer can
   * paste the reference from their confirmation email and find it.
   */
  const visibleOrders = useMemo(() => {
    const filter = ORDER_FILTERS.find((entry) => entry.id === filterId);
    const term = query.trim();
    return orders.filter((order) => {
      const statusMatch = !filter?.statuses || filter.statuses.includes(order.status);
      return statusMatch && matchesOrderSearch(order, term);
    });
  }, [orders, filterId, query]);

  /** How many orders sit behind each filter, so empty filters read honestly. */
  const filterCounts = useMemo(() => {
    const counts = {};
    ORDER_FILTERS.forEach((filter) => {
      counts[filter.id] = filter.statuses
        ? orders.filter((order) => filter.statuses.includes(order.status)).length
        : orders.length;
    });
    return counts;
  }, [orders]);

  const breadcrumbs = [{ label: "Account", to: "/account" }, { label: "Orders" }];

  /* ----------------------------- Loading ----------------------------- */
  /* Must win over the empty state: a slow request is not "no orders".   */

  if (isLoadingOrders && orders.length === 0) {
    return (
      <AccountShell breadcrumbItems={breadcrumbs}>
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="border border-mist/80 bg-surface/30 px-6 py-16 text-center"
        >
          <span className="sr-only">Loading your orders…</span>
          <p className="font-ui text-[10px] uppercase tracking-[.2em] text-taupe">
            Loading your orders…
          </p>
        </div>
      </AccountShell>
    );
  }

  /* ------------------------------ Error ------------------------------ */
  /* A failed request is NEVER rendered as an empty successful history.  */

  if (ordersError && orders.length === 0) {
    const copy = orderErrorCopy(ordersErrorStatus ?? 500, ordersError);
    return (
      <AccountShell breadcrumbItems={breadcrumbs}>
        <div role="alert" aria-live="assertive" className="border border-mist/80 bg-surface/30 px-6">
          <EmptyState
            eyebrow={copy.eyebrow}
            title={copy.title}
            description={copy.description}
            actions={
              <div className="flex flex-wrap items-center justify-center gap-4">
                {ordersErrorStatus === 401 ? (
                  <AtelierButton
                    as={Link}
                    to="/auth/sign-in?returnTo=/account/orders"
                    variant="primary"
                    size="md"
                  >
                    Sign In
                  </AtelierButton>
                ) : (
                  <AtelierButton type="button" variant="primary" size="md" onClick={retry}>
                    Try Again
                  </AtelierButton>
                )}
                <AtelierButton as={Link} to="/shop" variant="outline" size="md">
                  Continue Shopping
                </AtelierButton>
              </div>
            }
          />
        </div>
      </AccountShell>
    );
  }

  /* ------------------------- No orders at all ------------------------- */

  if (orders.length === 0) {
    return (
      <AccountShell breadcrumbItems={breadcrumbs}>
        <div className="border border-mist/80 bg-surface/30 px-6 py-4 sm:px-10">
          <EmptyState
            eyebrow="My Orders"
            title="Your journey starts here"
            description="Your purchases will appear here once you've found something you love."
            actions={
              <div className="flex flex-wrap items-center justify-center gap-4">
                <AtelierButton as={Link} to="/shop" variant="primary" size="md">
                  Explore Collection <ArrowRight size={14} aria-hidden="true" />
                </AtelierButton>
                <AtelierButton
                  as={Link}
                  to="/collections/new-arrivals"
                  variant="outline"
                  size="md"
                >
                  New Arrivals
                </AtelierButton>
              </div>
            }
          />
        </div>
        {guestOrderCount > 0 ? (
          <GuestOrderNotice count={guestOrderCount} onClaim={claimGuestOrders} />
        ) : null}
      </AccountShell>
    );
  }

  /* ----------------------------- History ----------------------------- */

  return (
    <AccountShell breadcrumbItems={breadcrumbs}>
      <EditorialHeading
        as="h2"
        size="subsection"
        eyebrow="Order History"
        description="Every purchase, beautifully organized."
        spacing={{ eyebrow: "mb-3", title: "mb-3", description: "mb-0" }}
      >
        My <span className="italic text-accent">orders.</span>
      </EditorialHeading>

      <Rule width="w-14" tone="accent" className="my-7" />

      {guestOrderCount > 0 ? (
        <GuestOrderNotice count={guestOrderCount} onClaim={claimGuestOrders} />
      ) : null}

      {/* ------------------------ Filters + search ------------------------ */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Filter orders by status"
          className="-mx-1 flex flex-wrap gap-2 px-1"
        >
          {ORDER_FILTERS.map((filter) => {
            const isActive = filter.id === filterId;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setFilterId(filter.id)}
                aria-pressed={isActive}
                className={cn(
                  "border px-3.5 py-2 font-ui text-[10px] uppercase tracking-[.14em] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  transition.all,
                  isActive
                    ? "border-ink bg-ink text-ivory"
                    : "border-mist bg-canvas text-taupe hover:border-accent hover:text-accent"
                )}
              >
                {filter.label}
                <span className="ml-1.5 text-[9px] opacity-70">
                  {filterCounts[filter.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-72">
          <label htmlFor="order-search" className="sr-only">
            Search orders by order ID
          </label>
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-taupe"
          />
          <input
            id="order-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by order ID"
            className="w-full border border-mist bg-canvas py-2.5 pl-9 pr-9 font-ui text-xs text-ink placeholder:text-taupe focus:border-accent focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear order search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-taupe transition-colors hover:text-accent"
            >
              <X size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {visibleOrders.length}{" "}
        {visibleOrders.length === 1 ? "order" : "orders"} shown.
      </p>

      {/* ----------------------------- Cards ----------------------------- */}
      {visibleOrders.length === 0 ? (
        <div className="mt-8 border border-mist/80 bg-surface/30 px-6">
          <EmptyState
            eyebrow="No Match"
            title="Nothing under this view"
            description="No orders match this filter or search just yet. Try another status, or clear your search."
            actions={
              <AtelierButton
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  setFilterId("all");
                  setQuery("");
                }}
              >
                Show All Orders
              </AtelierButton>
            }
          />
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          {visibleOrders.map((order, index) => (
            <OrderCard key={order.id} order={order} index={index} />
          ))}
        </div>
      )}

      {/* A partial failure (some orders shown, refresh failed) is still
          reported rather than silently swallowed. */}
      {ordersError ? (
        <p
          role="alert"
          className="mt-8 border border-mist/80 bg-surface/40 px-5 py-4 font-ui text-[11px] leading-relaxed text-graphite"
        >
          {ordersError}{" "}
          <button
            type="button"
            onClick={retry}
            className="uppercase tracking-[.14em] text-accent underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </p>
      ) : null}
    </AccountShell>
  );
}

/**
 * Guest orders that can be claimed into this account.
 *
 * The claim itself is server-authoritative (Phase 2, unchanged): the
 * backend matches guest orders on the authenticated account's OWN email
 * and no client-supplied address is trusted, so one account can never
 * claim another person's orders.
 *
 * The outcome is reported honestly — the notice only disappears on
 * success, and a failure says so instead of pretending it worked.
 */
function GuestOrderNotice({ count, onClaim }) {
  const [state, setState] = useState({ busy: false, done: false, error: "" });
  if (state.done) return null;

  const claim = async () => {
    setState({ busy: true, done: false, error: "" });
    const result = await onClaim?.();
    if (result?.ok) {
      setState({ busy: false, done: true, error: "" });
      return;
    }
    setState({
      busy: false,
      done: false,
      error:
        result?.error ??
        "We could not add those orders to your account just now. Please try again.",
    });
  };

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border border-accent/30 bg-accent/5 px-5 py-4">
      <p className="font-ui text-[11px] leading-relaxed text-accent">
        {count} {count === 1 ? "order was" : "orders were"} placed as a guest in
        this browser. Add {count === 1 ? "it" : "them"} to your account to keep
        everything in one place.
        {state.error ? (
          <span role="alert" className="mt-1 block text-graphite">
            {state.error}
          </span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={claim}
        disabled={state.busy}
        className="font-ui text-[10px] uppercase tracking-[.16em] text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent disabled:opacity-50"
      >
        {state.busy ? "Adding…" : "Add to My Account"}
      </button>
    </div>
  );
}
