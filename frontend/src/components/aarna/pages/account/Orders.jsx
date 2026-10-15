/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.4 — the order history, as a page of the
 * design.
 *
 * The production screen is `pages/account/AccountOrders.jsx`. Everything it
 * decides, this page decides the same way and from the same sources:
 *
 *   · the list is the session's own orders from `useOrder()` (the server read,
 *     scoped to the session's customer id) — never a sample, never a mirror of
 *     the design prototype's storage;
 *   · the state precedence is production's: a read still in flight is a loading
 *     block (never "you have no orders"), a failed read is named as failed with
 *     `orderErrorCopy`'s own words for its HTTP status, a successful read with no
 *     orders is a genuine empty history, and anything else is the cards;
 *   · the status filter is `ORDER_FILTERS` — the same array production renders —
 *     each chip carrying the count behind it, and the search is
 *     `matchesOrderSearch`, which covers the order number as well as the id;
 *   · every action is the existing destination: the card links to
 *     `/account/orders/{id}`, `Track Order` appears only when `canTrackOrder`
 *     says the order has a journey, and nothing else is offered;
 *   · the guest-order notice is production's own: the claim goes through
 *     `claimGuestOrders()` and the notice disappears only on an answer that says
 *     it worked — a failure states the failure.
 *
 * WHAT THE DESIGN'S PROTOTYPE HAD: nothing. Its `/account` was a single form and
 * this screen did not exist, so there is no behaviour to copy from it — only the
 * register, which is the port's own: the frame, the section head (`.shop__head`),
 * the design's chip for the filters (`.chip`), the second-surface card, the
 * `.empty` block and the type scale. No table, no dashboard furniture.
 *
 * WHAT IS DELIBERATELY NOT COPIED FROM PRODUCTION: its `AtelierButton`/`EmptyState`
 * furniture, and production's sign-in link in the 401 branch, which points at
 * `/auth/sign-in` — a path this application does not register. The port links to
 * `/signin?returnTo=%2Faccount%2Forders`, which is the path the guard, the
 * checkout and the order journey all use.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Link } from '../../router/index.jsx';
import Button from '../../components/ui/Button.jsx';
import OrderFrame, { OrderChip, OrderLoading, OrderProblem } from './OrderFrame.jsx';
import { useOrder } from '../../../../context/OrderContext.jsx';
import { ORDER_FILTERS } from '../../../../config/orderConfig.js';
import {
  canTrackOrder,
  formatOrderDate,
  matchesOrderSearch,
  orderItemCount,
} from '../../../../utils/orders.js';
import { formatINR } from '../../../../utils/shopping.js';

const ORDERS_TITLE = 'My Orders — PRATIKSHYA FASHION';
const CRUMBS = [
  { label: 'Account', to: '/account' },
  { label: 'Orders' },
];

export default function Orders() {
  const {
    orders,
    guestOrderCount,
    claimGuestOrders,
    isLoadingOrders,
    ordersError,
    ordersErrorStatus,
    refreshOrders,
  } = useOrder();

  const [filterId, setFilterId] = useState('all');
  const [query, setQuery] = useState('');
  const retry = useCallback(() => {
    refreshOrders();
  }, [refreshOrders]);

  useEffect(() => {
    const previous = document.title;
    document.title = ORDERS_TITLE;
    return () => {
      document.title = previous;
    };
  }, []);

  /* Orders matching the chosen status filter and the search box — production's
     own two functions, in production's own order. */
  const visibleOrders = useMemo(() => {
    const filter = ORDER_FILTERS.find((entry) => entry.id === filterId);
    const term = query.trim();
    return orders.filter((order) => {
      const statusMatch = !filter?.statuses || filter.statuses.includes(order.status);
      return statusMatch && matchesOrderSearch(order, term);
    });
  }, [orders, filterId, query]);

  /* How many orders sit behind each filter, so an empty filter reads honestly. */
  const filterCounts = useMemo(() => {
    const counts = {};
    ORDER_FILTERS.forEach((filter) => {
      counts[filter.id] = filter.statuses
        ? orders.filter((order) => filter.statuses.includes(order.status)).length
        : orders.length;
    });
    return counts;
  }, [orders]);

  const heading = (
    <>
      My <em>orders.</em>
    </>
  );

  /* ------------------------------ Loading ------------------------------ */
  /* Must win over the empty state: a slow request is not "no orders".     */

  if (isLoadingOrders && orders.length === 0) {
    return <OrderLoading label="Gathering your orders" breadcrumbItems={CRUMBS} title={heading} />;
  }

  /* ------------------------------- Error ------------------------------- */
  /* A failed request is NEVER rendered as an empty successful history.   */

  if (ordersError && orders.length === 0) {
    return (
      <OrderProblem
        status={ordersErrorStatus ?? 500}
        message={ordersError}
        onRetry={retry}
        breadcrumbItems={CRUMBS}
        title={heading}
        secondary={{ to: '/shop', label: 'Continue Shopping' }}
      />
    );
  }

  /* --------------------------- No orders at all --------------------------- */

  if (orders.length === 0) {
    return (
      <OrderFrame breadcrumbItems={CRUMBS} label="Order History" title={heading}>
        <div className="empty">
          <p className="empty__title">Your journey starts here.</p>
          <p>Your purchases will appear here once you&rsquo;ve found something you love.</p>
          <div className="pf-account__acts">
            <Button to="/shop">Explore Collection</Button>
            <Button to="/collections/new-arrivals" variant="ghost">
              New Arrivals
            </Button>
          </div>
        </div>
        {guestOrderCount > 0 ? (
          <GuestOrderNotice count={guestOrderCount} onClaim={claimGuestOrders} />
        ) : null}
      </OrderFrame>
    );
  }

  /* ------------------------------- History ------------------------------- */

  return (
    <OrderFrame breadcrumbItems={CRUMBS} label="Order History" title={heading}>
      <p className="info__lead pf-account__lead">Every purchase, beautifully organized.</p>

      {guestOrderCount > 0 ? (
        <GuestOrderNotice count={guestOrderCount} onClaim={claimGuestOrders} />
      ) : null}

      <section className="pf-account__section" aria-label="Your orders">
        <div className="pf-account__filters">
          <div className="shop__types" role="group" aria-label="Filter orders by status">
            {ORDER_FILTERS.map((filter) => {
              const isActive = filter.id === filterId;
              return (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={isActive}
                  className={isActive ? 'chip chip--sm is-active' : 'chip chip--sm'}
                  onClick={() => setFilterId(filter.id)}
                >
                  {filter.label}
                  <span className="listing-group__count">{filterCounts[filter.id] ?? 0}</span>
                </button>
              );
            })}
          </div>

          <div className="pf-account__search">
            <label htmlFor="order-search" className="sr-only">
              Search orders by order ID
            </label>
            <span className="pf-account__search-icon" aria-hidden="true">
              <Search size={13} strokeWidth={1.5} />
            </span>
            <input
              id="order-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by order ID"
            />
            {query ? (
              <button
                type="button"
                className="pf-account__search-clear"
                aria-label="Clear order search"
                onClick={() => setQuery('')}
              >
                <X size={13} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Announced, never drawn: how many orders the current view holds. */}
        <p role="status" aria-live="polite" className="sr-only">
          {visibleOrders.length} {visibleOrders.length === 1 ? 'order' : 'orders'} shown.
        </p>

        {visibleOrders.length === 0 ? (
          /* The design's own empty block, in production's own words: a filter or
             a search that matches nothing is not an empty order history. */
          <div className="empty">
            <p className="empty__title">Nothing under this view.</p>
            <p>No orders match this filter or search just yet. Try another status, or clear your search.</p>
            <Button
              variant="ghost"
              onClick={() => {
                setFilterId('all');
                setQuery('');
              }}
            >
              Show All Orders
            </Button>
          </div>
        ) : (
          <ul className="pf-account__order-list">
            {visibleOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </ul>
        )}

        {/* A partial failure (the cards are shown, a refresh failed) is still
            reported rather than silently swallowed. */}
        {ordersError ? (
          <p className="pf-note" role="alert">
            {ordersError}{' '}
            <button type="button" className="pf-account__act is-accent" onClick={retry}>
              Try again
            </button>
          </p>
        ) : null}
      </section>
    </OrderFrame>
  );
}

/* ── one order, as the design's card ───────────────────────────────────────── */

/**
 * Production's `OrderCard`, in this register — its own facts, in its own order:
 * the pieces, the order's identity, the status, the recorded delivery date (or
 * an honest "not yet scheduled"), the total, the payment status, and the two
 * destinations. An order whose lines did not come back is still shown — it is a
 * real order — with production's own note instead of an empty card.
 */
export function OrderCard({ order }) {
  const count = orderItemCount(order);
  const items = order.items ?? [];
  const preview = items.slice(0, 3);
  const remaining = items.length - preview.length;
  const orderRef = order.orderNumber ?? order.id;
  const delivered = order.flags?.isDelivered ?? false;
  const deliveryDate = delivered ? order.tracking?.deliveredAt : order.tracking?.estimatedDelivery;

  return (
    <li className="pf-account__order-card">
      <div className="pf-account__order-main">
        <div className="pf-account__order-head">
          <div>
            <h3 className="pf-account__order-id">
              <Link to={`/account/orders/${order.id}`}>Order {orderRef}</Link>
            </h3>
            <p className="pf-account__order-meta">{formatOrderDate(order.createdAt)}</p>
          </div>
          <OrderChip status={order.status} kind="order" />
        </div>

        <div className="pf-account__order-pieces">
          <div className="pf-account__order-thumbs">
            {preview.map((item) =>
              item.image ? (
                <img
                  key={item.lineId}
                  className="pf-account__order-thumb"
                  src={item.image}
                  alt=""
                  loading="lazy"
                />
              ) : (
                /* An item with no readable image keeps its place: the count of
                   pieces must not change because a record lost its picture. */
                <span key={item.lineId} className="pf-account__order-thumb" aria-hidden="true" />
              )
            )}
            {remaining > 0 ? <span className="pf-account__order-more">+{remaining}</span> : null}
          </div>

          <div className="pf-account__order-summary">
            <p className="pf-account__order-name">
              {items.length === 0 ? (
                'Item details unavailable'
              ) : (
                <>
                  {items[0].name}
                  {items.length > 1 ? ' and more' : ''}
                </>
              )}
            </p>
            <p className="pf-account__order-meta">
              {count} {count === 1 ? 'piece' : 'pieces'}
              {order.paymentMethod?.label ? ` · ${order.paymentMethod.label}` : ''}
            </p>
            <p className="pf-account__order-total">{formatINR(order.pricing.total)}</p>
          </div>
        </div>
      </div>

      <div className="pf-account__order-facts">
        {/* Only a real recorded date. Nothing is estimated here. */}
        <p className="label">{delivered ? 'Delivered' : 'Estimated Delivery'}</p>
        <p className="pf-account__order-fact-value">
          {deliveryDate ? formatOrderDate(deliveryDate) : 'Not yet scheduled'}
        </p>
        <p className="pf-account__order-meta">{order.deliveryMethod?.label ?? 'Delivery'}</p>

        <div className="pf-account__order-actions">
          <Button to={`/account/orders/${order.id}`}>View Order</Button>
          {canTrackOrder(order) ? (
            <Link to={`/account/orders/${order.id}/track`} className="pf-account__act">
              Track Order
            </Link>
          ) : null}
        </div>

        <p className="pf-account__order-meta">
          Payment <OrderChip status={order.paymentStatus} kind="payment" />
        </p>
      </div>
    </li>
  );
}

/* ── guest orders this account can take over ───────────────────────────────── */

/**
 * Production's notice, unchanged in what it does: the claim is server-
 * authoritative (`claimGuestOrders()` — the backend matches guest orders on the
 * authenticated account's OWN email, so one account can never claim another
 * person's orders), the outcome is reported honestly, and the notice only
 * disappears when the answer says it worked.
 */
export function GuestOrderNotice({ count, onClaim }) {
  const [state, setState] = useState({ busy: false, done: false, error: '' });
  if (state.done) return null;

  const claim = async () => {
    setState({ busy: true, done: false, error: '' });
    const result = await onClaim?.();
    if (result?.ok) {
      setState({ busy: false, done: true, error: '' });
      return;
    }
    setState({
      busy: false,
      done: false,
      error:
        result?.error ?? 'We could not add those orders to your account just now. Please try again.',
    });
  };

  return (
    <div className="pf-note pf-account__notice">
      <p className="pf-account__notice-line">
        {count} {count === 1 ? 'order was' : 'orders were'} placed as a guest in this browser. Add{' '}
        {count === 1 ? 'it' : 'them'} to your account to keep everything in one place.
      </p>
      {state.error ? (
        <p className="form__err" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="button" className="pf-account__act is-accent" onClick={claim} disabled={state.busy}>
        {state.busy ? 'Adding…' : 'Add to My Account'}
      </button>
    </div>
  );
}
