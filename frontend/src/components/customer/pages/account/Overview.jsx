/**
 * PRATIKSHYA FASHION — PHASE 11 · the account overview.
 *
 * The screen a signed-in customer lands on at `/account`. It is drawn with the
 * design's own register — the frame the shared shell provides, the design's
 * three-tile grid (`.account__tiles` was written for the design's `/account`
 * prototype), its section head (`.shop__head`), its empty block (`.empty`) and
 * its product card — and it is driven entirely by this application's own state.
 *
 * WHAT THE DESIGN'S PROTOTYPE WAS, AND WHY NONE OF ITS BEHAVIOUR IS HERE.
 * `home-page/src/pages/Account.jsx` is fifty lines: it keeps a name in the
 * browser's own storage under `aarna:profile`, says on the page that "no server
 * account is created", and draws exactly three links (saved pieces, a track-an-
 * order link, the bag count). This application has real accounts — a
 * server-backed profile, addresses, orders and sessions — so a UI migration
 * must read those. The prototype's storage mechanism, its device-local profile
 * and its "no account is created" prose are the one thing a migration cannot
 * copy, and none of them is present below. What IS carried over is the VISUAL:
 * the tile grid, the eyebrow, the heading idiom (`Namaste, <em>Name.</em>`),
 * the serif lead, the card grid and the type register.
 *
 * THE SECTIONS ARE THE PRODUCTION DASHBOARD'S OWN, IN ITS OWN WORDS. What the
 * production page at `/account` states, this page states, from the same
 * sources and with the same copy:
 *
 *   · the tiles        — saved pieces, orders and the bag, each counted from
 *                        the context that owns it (`useWishlist().count`,
 *                        `useOrder().orders`, `useCart().count`). Nothing is
 *                        estimated; nothing is invented.
 *   · the bag strip    — production's "Your bag" line, with the subtotal
 *                        printed only when the cart has published one.
 *   · recent orders    — the same three orders, with the application's own
 *                        formatters (`formatOrderDate`, `orderItemCount`,
 *                        `formatINR`) and its own status vocabulary
 *                        (`getOrderStatus`, the resolver the production list
 *                        uses — so one order never reads two ways).
 *   · the rails        — recently viewed (`useRecentlyViewed`) and the wishlist
 *                        preview, resolved through the canonical media set
 *                        exactly as the production wishlist resolves its cards.
 *   · account details  — production's own three cards: personal details, the
 *                        address book and account security, with their own
 *                        copy and their own destinations.
 *
 * WHAT IS DELIBERATELY NOT COPIED FROM THE PRODUCTION DASHBOARD: the panels
 * that belong to screens of their own — AI Mirror, the AI shopping assistant,
 * offers, collections, style preferences, returns and the personalised rail.
 * Each of those is one route away in the account navigation the frame already
 * draws; the overview links out rather than promising their content, and it
 * invents no substitute for any of them.
 *
 * A COUNT IS PUBLISHED ONLY WHEN THE LIST BEHIND IT HAS BEEN READ. While a
 * source is loading, or when its read failed, its tile shows a dash — never a
 * zero that would read as "you have none" when the truth is "not known yet".
 * The same rule governs the order block (loading, a failed read, and "no orders
 * yet" are three different states, each saying which it is), the wishlist
 * block (a saved count the catalogue has not resolved yet says so rather than
 * claiming nothing is saved) and the account itself: an account read that has
 * not returned, or that failed, is never dressed as an empty profile.
 *
 * A RECORD THAT CARRIES NOTHING IS NOT DRESSED EITHER. Two of this
 * application's shared formatters answer cheerfully about values a record may
 * simply not have — `formatOrderDate(null)` is the epoch, and the status
 * resolver's fallback definition is "Order Confirmed" — so the page asks them
 * only about values that exist, and says so plainly when one does not. Both
 * guards are local to this page; the shared formatters and the shared status
 * registry are production's and are not modified.
 */

import { useEffect, useMemo } from 'react';
import { Heart, Package, ShoppingBag } from 'lucide-react';
import { Link } from '../../router/index.jsx';
import Button from '../../components/ui/Button.jsx';
import ProductCard from '../../components/product/ProductCard.jsx';
import AccountFrame from './AccountFrame.jsx';
import { useAccount } from '../../../../context/AccountContext.jsx';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { useCart } from '../../../../context/CartContext.jsx';
import { useOrder } from '../../../../context/OrderContext.jsx';
import { useWishlist } from '../../../../context/WishlistContext.jsx';
import { useRecentlyViewed } from '../../../../hooks/useRecentlyViewed.js';
import { useProductCovers } from '../../../../hooks/useMedia.js';
import { normalizeMediaReference } from '../../../../services/media/mediaPaths.js';
import { resolveCollectionCover } from '../../../../services/media/mediaResolver.js';
import offerRepository, { describeEligibility, formatOfferDiscount } from '../../../../services/offers/offerRepository.js';
import taxonomyRepository from '../../../../services/taxonomyRepository.js';
import { getStylePreferences, hasStylePreferences } from '../../../../services/customer/stylePreferences.js';
import { getPersonalizedProducts } from '../../../../services/customer/personalization.js';
import { getOrderStatus, getReturnStatus, RETURN_STATUS } from '../../../../config/orderConfig.js';
import { formatOrderDate, orderItemCount } from '../../../../utils/orders.js';
import { formatINR } from '../../../../utils/shopping.js';
import { hideBrokenMedia } from '../../utils/mediaFallback.js';
import { toDesignProduct } from '../../mock/data/products.js';

/* How many orders the overview states before handing over to the order history,
   and how many pieces a rail shows. Both are the counts the production
   dashboard uses for the same two blocks. */
const RECENT_ORDERS = 3;
const RAIL_SIZE = 4;

/* Production's own two limits for the panels below: it shows three offers and
   five collections. This page shows three and four — the design's restrained
   grid — and omits either panel entirely when its source has nothing eligible,
   which is the design's rule for every rail on this page.

   The five collection ids are production's own fallback list, kept verbatim: a
   collection is featured either because the house marked it so or because it is
   one of the five edits the dashboard always carries. */
const OFFER_LIMIT = 3;
const COLLECTION_LIMIT = 4;
const FEATURED_COLLECTION_IDS = ['new-arrivals', 'bridal-trousseau', 'festive-edit', 'silk', 'wedding'];

/* Production's own rule for a return that is still live (`AccountDashboard.jsx:49`):
   only a refund and a rejection close one — every other status the returns desk can
   set is something the customer is still following. The set is production's, kept
   verbatim, so a status added to the register later behaves exactly as it does on
   the production dashboard; the panel states at most two of them, production's own
   `.slice(0, 2)`. */
const CLOSED_RETURNS = new Set([RETURN_STATUS.REFUNDED, RETURN_STATUS.REJECTED]);
const RETURN_LIMIT = 2;

/**
 * A tile's figure, or an honest dash.
 *
 * `loading` is true only while nothing has been read yet — a source that
 * already holds rows keeps showing them while it refreshes. `failed` is true
 * only when the read failed AND nothing is held, so a stale-but-real list is
 * never hidden behind an error it has survived.
 */
const tileFigure = ({ value, loading, failed }) => (loading || failed ? '—' : String(value));

/**
 * An order's date, or the dash.
 *
 * This application's own `formatOrderDate` treats a missing value as a real
 * date — `new Date(null)` is the epoch, so a record with no `createdAt`
 * formats as "1 January 1970" — and the order normaliser admits a null
 * `createdAt` on purpose. The page therefore asks the formatter only about a
 * value the record carries; the formatter itself is production's and is
 * untouched.
 */
const orderDateLabel = (value) =>
  value === null || value === undefined || value === '' ? '—' : formatOrderDate(value);

/**
 * An order's status, or the honest word for one that is not there.
 *
 * `getOrderStatus` always answers: an absent or unrecognised status comes back
 * as its fallback definition ("Order Confirmed"). The normaliser keeps an
 * unrecognised status null precisely so a screen can say so instead of
 * pretending the order was confirmed (`utils/orders.js`), and every entry in
 * the registry carries its own key as `id`. So the label is taken from the
 * resolver only when the resolver actually answered about the status it was
 * asked about.
 */
const ORDER_STATUS_UNAVAILABLE = 'Status unavailable';
const orderStatusLabel = (status) => {
  if (!status) return ORDER_STATUS_UNAVAILABLE;
  const definition = getOrderStatus(status);
  return definition.id === status ? definition.label : ORDER_STATUS_UNAVAILABLE;
};

export default function Overview() {
  const { user } = useAuth();
  const {
    profile, addresses, defaultAddress,
    isLoading: isLoadingAccount, loadError, loadErrorStatus,
  } = useAccount();
  const cart = useCart();
  const wishlist = useWishlist();
  const { orders, isLoadingOrders, ordersError, ordersErrorStatus, refreshOrders } = useOrder();
  const recently = useRecentlyViewed(RAIL_SIZE);

  /* The production dashboard's own two statements about this screen: the tab
     title, and the noindex marker the account keeps off search engines. Both
     are effects — they run in a browser and are pinned at the source level in
     the suite, never claimed from a server render. */
  useEffect(() => {
    const previous = document.title;
    document.title = 'My PRATIKSHYA — PRATIKSHYA FASHION';
    const robots = document.querySelector('meta[name="robots"]');
    const created = !robots;
    const node = robots || document.createElement('meta');
    node.setAttribute('name', 'robots');
    node.setAttribute('content', 'noindex, nofollow');
    if (created) document.head.appendChild(node);
    return () => {
      document.title = previous;
      if (created && node.parentNode) node.parentNode.removeChild(node);
    };
  }, []);

  /* Two real sources for the customer's name — the account the server returned
     for this session, then the session's own user — and no stand-in: with
     neither, the page uses its section title, never a stand-in customer name. */
  const firstName = profile?.firstName || user?.firstName || '';
  const greeting = firstName ? <>Namaste, <em>{firstName}.</em></> : undefined;

  /* What each tile knows. A figure is shown only once its list has been read. */
  const ordersFailed = Boolean(ordersError) && orders.length === 0;
  const tiles = [
    {
      key: 'wishlist',
      icon: Heart,
      to: '/account/wishlist',
      label: 'Saved pieces',
      figure: tileFigure({
        value: wishlist.count,
        loading: wishlist.isLoading && wishlist.count === 0,
        failed: Boolean(wishlist.error) && wishlist.count === 0,
      }),
    },
    {
      key: 'orders',
      icon: Package,
      to: '/account/orders',
      label: 'Orders',
      figure: tileFigure({
        value: orders.length,
        loading: isLoadingOrders && orders.length === 0,
        failed: ordersFailed,
      }),
    },
    {
      key: 'cart',
      icon: ShoppingBag,
      to: '/cart',
      label: 'Items in bag',
      figure: tileFigure({
        value: cart.count,
        loading: cart.isLoading && cart.count === 0,
        failed: Boolean(cart.error) && cart.count === 0,
      }),
    },
  ];

  /* Production's bag line. The subtotal is printed only when the cart has
     published one, so an unread total can never be dressed as zero rupees. */
  const bagSubtotal = cart.totals?.subtotal;
  const bagLine = cart.count
    ? `${cart.count} ${cart.count === 1 ? 'piece' : 'pieces'}${Number.isFinite(Number(bagSubtotal)) ? ` · ${formatINR(bagSubtotal)}` : ''}`
    : 'Your bag is waiting for a piece.';

  const recentOrders = orders.slice(0, RECENT_ORDERS);
  const ordersLoading = isLoadingOrders && orders.length === 0;
  const orderCountLabel = `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`;

  /* Production's own live-return list (`AccountDashboard.jsx:158-168`), over the
     same orders this page already holds and reads nothing else: every return
     record on every order the session carries, minus the two closed statuses, in
     the orders' own order. The panel states the first two and counts them all. */
  const activeReturns = useMemo(() => {
    const list = [];
    orders.forEach((order) => {
      (order.returns ?? []).forEach((record) => {
        if (!CLOSED_RETURNS.has(record.status)) list.push({ order, record });
      });
    });
    return list;
  }, [orders]);
  /* Production's own words for the count (its returns shortcut): a bare number
     and the word active, the same for one and for several. */
  const returnsCountLabel = `${activeReturns.length} active`;

  /* The wishlist block's four states, and the two of them production does not
     draw because it never has to: a first load, and a saved count the
     catalogue has not resolved (yet) — which is never reported as "nothing
     saved", because the customer's own count says otherwise. */
  const savedPieces = wishlist.products.slice(-RAIL_SIZE).reverse();
  const wishlistLoading = wishlist.isLoading && wishlist.count === 0;
  const wishlistFailed = Boolean(wishlist.error) && wishlist.count === 0;
  const savedLabel = `${wishlist.count} ${wishlist.count === 1 ? 'piece' : 'pieces'} saved`;

  /* Production's own personalisation read (`AccountDashboard.jsx:188-202`), made
     ONCE for this page and shared by the two panels below: the rail shows the
     pieces it ranks and the style panel states the signals it derives, so the two
     can never disagree about what the customer's taste is. The call, its
     arguments and its dependencies are production's own — the wishlist the
     customer saved, the history they browsed, the orders they placed, the
     preferences they wrote, and the same four-piece limit this page's other rail
     uses. It is the application's own deterministic ranking
     (`services/customer/personalization.js`): no model, no request, no state.

     WHAT COUNTS AS A SIGNAL. Production's `sufficient` flag means "at least two
     distinct signals"; this page's own approved rule is stricter about what it
     will SHOW and looser about what it counts: a panel — either of them — is
     drawn only when the derivation actually found something (a favourite
     category, collection, fabric or occasion, or a saved preference), never on
     the score-0 catalogue slice the ranking falls back to when it has nothing to
     rank by. Both panels read the same two values, so an account with nothing to
     go on says so in the design's own quiet words instead of being shown
     merchandise it did not ask for. */
  const preferences = useMemo(() => getStylePreferences(user?.id), [user?.id]);

  const personal = useMemo(
    () => getPersonalizedProducts({
      wishlistProducts: wishlist.products,
      recentlyViewed: recently.products,
      orders,
      preferences,
      limit: RAIL_SIZE,
    }),
    [wishlist.products, recently.products, orders, preferences],
  );

  const style = personal.signals;
  const tasteSignalCount =
    style.favouriteCategories.length +
    style.favouriteCollections.length +
    style.favouriteFabrics.length +
    style.favouriteOccasions.length;
  const hasTasteSignals = tasteSignalCount > 0 || hasStylePreferences(preferences);

  /* What each group states, in production's own four words and — for the one
     statement the derivation does not cover — the preferences screen's own word
     for it. A group with nothing in it is not drawn; when no group has anything,
     the panel says so instead. */
  const savedColours = (preferences.colours ?? []).map((colour) => ({ id: colour, label: colour }));
  const styleGroups = [
    { key: 'categories', label: 'Favourite categories', items: style.favouriteCategories },
    { key: 'collections', label: 'Favourite collections', items: style.favouriteCollections },
    { key: 'fabrics', label: 'Frequently viewed fabrics', items: style.favouriteFabrics },
    { key: 'occasions', label: 'Occasions you explore', items: style.favouriteOccasions },
    { key: 'colours', label: 'Preferred colours', items: savedColours },
  ].filter((group) => group.items.length);

  /* Every rail's plates come from the canonical media set, through ONE hook call
     for the whole page — the production wishlist's own rule. The personal edit
     is in the same call, so its cards are resolved by the same resolver and the
     page still holds exactly one media read. */
  const railProducts = [...recently.products, ...savedPieces, ...personal.products];
  const covered = useProductCovers(railProducts);
  const plateFor = (id) => covered.find((row) => String(row.id) === String(id)) ?? null;

  /* The account read's own states, on the page's one rule: a read that already
     holds the account keeps showing it, a read that has not returned yet is not
     an empty account, and a read that failed is named as failed — never as a
     profile with nothing on file (`AccountContext` says the same thing where it
     records the failure: "never a fabricated empty account"). */
  const accountLoading = isLoadingAccount && !profile;
  const accountFailed = Boolean(loadError) && !profile;

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');

  /* Production's two commerce panels — its offers band and its featured
     collections (`AccountDashboard.jsx:484-551`) — read through the repositories
     that own them, with production's own call, its own feature filter and its own
     fallback list, and this page's own restraint on the count (three offers, four
     collections). Both repositories answer synchronously from the application's
     own store, so nothing here fetches, waits or keeps state: a store that holds
     no eligible record draws no panel at all — never an invented offer, never a
     stand-in collection, never a zero dressed as a figure.

     The offers panel follows production's refresh rule exactly — the customer's
     identity is its only trigger — so the offers register's own change event is
     deliberately not subscribed: a list that changed on the server is picked up
     by the store's next hydrate, which is production's own behaviour. */
  const offers = useMemo(
    () => offerRepository
      .listCustomerVisible({ customerId: user?.id, customerEmail: user?.email || profile?.email })
      .slice(0, OFFER_LIMIT),
    [user?.id, user?.email, profile?.email],
  );

  const collections = useMemo(
    () => taxonomyRepository
      .activeCollections()
      .filter((entry) => entry.featured || FEATURED_COLLECTION_IDS.includes(entry.id))
      .slice(0, COLLECTION_LIMIT),
    [],
  );

  const offerCountLabel = `${offers.length} ${offers.length === 1 ? 'offer' : 'offers'}`;

  return (
    <AccountFrame breadcrumbItems={[{ label: 'Account' }]} label="Your account" title={greeting ?? 'Overview'}>
      <div className="account__tiles" aria-label="Account summary">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.key}
              to={tile.to}
              className="account__tile pf-account__stat"
              aria-label={`${tile.label}: ${tile.figure === '—' ? 'Not available yet' : tile.figure}`}
            >
              <strong>{tile.figure}</strong>
              <span>{tile.label}</span>
              <Icon className="pf-account__stat-icon" size={18} strokeWidth={1.4} aria-hidden="true" />
            </Link>
          );
        })}
      </div>

      {/* Production's two intelligence panels — its dark AI Mirror band and its
          assistant panel (`AccountDashboard.jsx:237-287`) — restored as this
          screen's entry points into the two pages themselves. Neither page is
          duplicated here: there is no camera, no composer, no product list, and
          no second copy of the mirror's state. Each band keeps production's own
          eyebrow, heading and destination, and carries the disclosure the screen
          itself carries — this port's try-on provider composes no new image, and
          the assistant is the deterministic demo grounded in the live catalogue
          (`AiMirror.jsx`, `AiShopping.jsx`) — so the Overview can never promise
          more than the screen behind it can do. */}
      <section className="pf-account__section" aria-label="PRATIKSHYA AI">
        <div className="pf-account__ai">
          <article className="pf-account__ai-entry pf-account__ai-entry--mirror">
            <p className="label label--light pf-account__ai-eyebrow">PRATIKSHYA AI MIRROR</p>
            <h2 id="pf-account-ai-mirror" className="display pf-account__ai-title">
              Your digital <em>fitting room.</em>
            </h2>
            <p className="pf-account__ai-body">
              Explore your next look with AI Mirror. Step into the camera view or browse the curated
              preview — no photos are stored.
            </p>
            <div className="pf-account__ai-cta">
              <Button to="/account/ai-mirror" variant="light">Open AI Mirror</Button>
              <p className="pf-account__ai-note">Demo preview module · the demo provider composes no new image.</p>
            </div>
          </article>

          <article className="pf-account__ai-entry pf-account__ai-entry--assistant">
            <p className="label pf-account__ai-eyebrow">PRATIKSHYA AI · SHOPPING</p>
            <h2 id="pf-account-ai-shopping" className="display pf-account__ai-title">
              Your personal fashion <em>companion.</em>
            </h2>
            <p className="pf-account__ai-body">
              Tell the assistant the occasion, the colour or the budget — it walks you through the
              current atelier edit, grounded in the live catalogue.
            </p>
            <div className="pf-account__ai-cta">
              <Button to="/account/ai-shopping" variant="solid">Ask the Assistant</Button>
              <p className="pf-account__ai-note">Demo assistant · deterministic</p>
            </div>
          </article>
        </div>
      </section>

      <section className="pf-account__section" aria-label="Your bag">
        <div className="pf-account__strip">
          <div>
            <p className="label">Your bag</p>
            <p className="pf-account__strip-line">{bagLine}</p>
          </div>
          <Button to="/cart" variant="ghost">View Bag</Button>
        </div>
      </section>

      <section className="pf-account__section" aria-labelledby="pf-account-orders">
        <header className="shop__head">
          <p className="label">Order history</p>
          <h2 id="pf-account-orders" className="display shop__title">Your orders</h2>
          <p className="shop__count">{ordersLoading || ordersFailed ? '—' : orderCountLabel}</p>
        </header>

        {ordersLoading ? (
          <div className="empty" aria-busy="true" aria-label="Loading your orders">
            <p className="empty__title">Gathering your orders&hellip;</p>
          </div>
        ) : ordersFailed ? (
          <OrdersFailed status={ordersErrorStatus} message={ordersError} onRetry={refreshOrders} />
        ) : recentOrders.length ? (
          <>
            <ul className="pf-account__orders">
              {recentOrders.map((order) => {
                const count = orderItemCount(order);
                return (
                  <li key={order.id} className="pf-account__order">
                    <div>
                      <Link to={`/account/orders/${order.id}`} className="pf-account__order-id">{order.id}</Link>
                      <p className="pf-account__order-meta">
                        {orderDateLabel(order.createdAt)} · {count} {count === 1 ? 'piece' : 'pieces'}
                      </p>
                    </div>
                    <div className="pf-account__order-aside">
                      <p className="pf-account__order-total">{formatINR(order.pricing?.total)}</p>
                      <p className="pf-account__order-status">{orderStatusLabel(order.status)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {orders.length > recentOrders.length ? (
              <div className="pf-account__actions">
                <Button to="/account/orders" variant="ghost">View all orders</Button>
              </div>
            ) : null}
          </>
        ) : (
          /* The production dashboard's own words for this block, and its own
             destination: an empty order history is an invitation, not a blank. */
          <div className="empty">
            <p className="empty__title">Your next favourite piece is waiting.</p>
            <p>When you place an order, it will live here.</p>
            <Button to="/shop">Start Shopping</Button>
          </div>
        )}
      </section>

      {/* Production's own live-returns panel (`AccountDashboard.jsx:414-441`): the
          return records this session's own orders carry, minus the two closed
          statuses, at most two of them, each a way into the return itself. The
          rows are the order mirror's — this panel reads nothing of its own.

          Two states the design's prototype never drew, handled here the way the
          block above handles them: a read that has not finished, and one that
          failed. Neither is ever dressed as "all clear" — while the read that
          carries the returns is in error, the panel says so, even though the
          orders it already holds may contain no open return.

          What the order mirror has already established (`utils/orders.js`,
          `normaliseReturn`): a record with no id or no item lines is dropped, and
          a status the register does not know is filed as `RETURN_REQUESTED`. The
          rows this panel reads therefore always carry an id, a status the register
          names, and a piece. The status line still asks the register for its own
          word rather than mapping one here, and the piece line is drawn only when
          the record carries a name — never a blank stood in for one. */}
      {activeReturns.length ? (
        <section className="pf-account__section" aria-labelledby="pf-account-returns">
          <header className="shop__head">
            <p className="label">Returns</p>
            <h2 id="pf-account-returns" className="display shop__title">Return in <em>progress</em></h2>
            <p className="shop__count">{returnsCountLabel}</p>
          </header>
          <div className="pf-account__returns">
            {activeReturns.slice(0, RETURN_LIMIT).map(({ order, record }, index) => (
              /* Production keys on the return's own id; a record the returns desk
                 has not numbered yet falls back to its own order. */
              <ReturnCard key={record.id ?? `${order.id}-${index}`} order={order} record={record} />
            ))}
          </div>
        </section>
      ) : ordersLoading ? (
        <section className="pf-account__section" aria-label="Returns">
          <div className="empty" aria-busy="true" aria-label="Loading your returns">
            <p className="empty__title">Gathering your returns&hellip;</p>
          </div>
        </section>
      ) : ordersError ? (
        <section className="pf-account__section" aria-label="Returns">
          {/* Any error on the read that carries the returns keeps the all-clear off
              the page — `ordersFailed` is this same error with nothing held, so the
              wider test is the honest one here. The order block above has already
              announced this read, so this one states it without a second
              live-region role. */}
          <OrdersFailed status={ordersErrorStatus} message={ordersError} onRetry={refreshOrders} subject="returns" alert={false} />
        </section>
      ) : (
        /* Production's own words for a customer with nothing in flight, and its
           own destination: an all-clear is stated, not left blank. */
        <section className="pf-account__section" aria-label="Returns">
          <div className="empty">
            <p className="empty__title">You&rsquo;re all clear.</p>
            <p>When a return is in progress, you will find it here.</p>
            <Button to="/account/orders">View Orders</Button>
          </div>
        </section>
      )}

      <Rail
        label="Recently viewed"
        eyebrow="Continue exploring"
        title={<>You were looking at <em>these</em></>}
        products={recently.products}
        plateFor={plateFor}
      />

      <section className="pf-account__section" aria-labelledby="pf-account-saved">
        <header className="shop__head">
          <p className="label">Saved</p>
          <h2 id="pf-account-saved" className="display shop__title">Your <em>wishlist</em></h2>
          <p className="shop__count">{wishlistLoading || wishlistFailed ? '—' : savedLabel}</p>
        </header>
        {wishlistLoading ? (
          <div className="empty" aria-busy="true" aria-label="Loading your wishlist">
            <p className="empty__title">Gathering your wishlist&hellip;</p>
          </div>
        ) : wishlistFailed ? (
          <div className="empty" role="alert">
            <p className="empty__title">We could not load your wishlist right now. Please try again.</p>
            <Button to="/account/wishlist" variant="ghost">Open wishlist</Button>
          </div>
        ) : savedPieces.length ? (
          <>
            <div className="grid-4 pf-account__rail-grid">
              {savedPieces.map((record) => (
                <Card key={record.id} record={record} plate={plateFor(record.id)} />
              ))}
            </div>
            <div className="pf-account__actions">
              <Button to="/account/wishlist" variant="ghost">View Wishlist</Button>
            </div>
          </>
        ) : wishlist.count ? (
          /* Saved pieces the catalogue has not resolved on this render — the
             customer's own count is still the truth, so the block states the
             count and sends the customer to the list rather than claiming
             nothing is saved. */
          <>
            <p className="pf-account__note">{savedLabel} — open your wishlist to see them.</p>
            <div className="pf-account__actions">
              <Button to="/account/wishlist" variant="ghost">View Wishlist</Button>
            </div>
          </>
        ) : (
          /* The wishlist screen's own empty state, in its own words. */
          <div className="empty">
            <p className="empty__title">Nothing saved yet.</p>
            <p>Save pieces you love and find them here later.</p>
            <Button to="/shop" variant="ghost">Discover pieces</Button>
          </div>
        )}
      </section>

      {/* Production's personal edit (`AccountDashboard.jsx:466-482`) — its own
          eyebrow, its own heading and the derivation's own reason line — drawn
          only when the shared derivation found genuine signals AND a piece is
          left to show after the customer's own wishlist, history and orders are
          excluded (the service's own exclusion rule). With nothing to rank by,
          production falls back to a score-0 catalogue slice under this same
          heading; that fallback is deliberately not ported, so no generic
          merchandise is ever shown as a personal edit. */}
      {hasTasteSignals && personal.products.length ? (
        <Rail
          label="Just for you"
          eyebrow="Just for you"
          title={<>Pieces selected around what you <em>explore</em></>}
          description={style.reason}
          products={personal.products}
          plateFor={plateFor}
        />
      ) : null}

      {/* Production's offers band, kept to the design's restraint: the eligible
          offers the customer can actually redeem, each stated in full (its code,
          what it takes off, what it applies to, its minimum and its end date), a
          compact way into the catalogue from each card, and one section action.
          The panel is omitted — not drawn empty — when nothing is eligible. */}
      {offers.length ? (
        <section className="pf-account__section" aria-labelledby="pf-account-offers">
          <header className="shop__head">
            <p className="label">Atelier offers</p>
            <h2 id="pf-account-offers" className="display shop__title">For <em>you</em></h2>
            <p className="shop__count">{offerCountLabel}</p>
          </header>
          <div className="pf-account__offers">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
          <div className="pf-account__actions">
            <Button to="/shop" variant="ghost">Continue Shopping</Button>
          </div>
        </section>
      ) : null}

      {/* Production's featured collections, in the design's collage register: the
          collection's own cover from this application's single media resolver, its
          eyebrow, its name and its own line, each a way into the collection. The
          panel is omitted when the taxonomy holds nothing eligible. */}
      {collections.length ? (
        <section className="pf-account__section" aria-labelledby="pf-account-collections">
          <header className="shop__head">
            <p className="label">The house</p>
            <h2 id="pf-account-collections" className="display shop__title">Featured <em>collections</em></h2>
          </header>
          <div className="pf-account__collections">
            {collections.map((collection) => (
              <CollectionTile key={collection.id} collection={collection} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Production's style panel (`AccountDashboard.jsx:552-590`), stating the
          signals the page's ONE personalisation derivation found — its own four
          group words, plus the preferences screen's own word for the single
          statement that derivation does not read (colours) — and, when the
          account has neither signals nor saved preferences, production's own
          quiet words with the one destination that changes them. The chips are
          labels, not controls: nothing here is selectable, so nothing here
          pretends to be a filter. */}
      <section className="pf-account__section" aria-labelledby="pf-account-style">
        <header className="shop__head">
          <p className="label">Your style</p>
          <h2 id="pf-account-style" className="display shop__title">Taste, as it <em>unfolds</em></h2>
        </header>

        {hasTasteSignals ? (
          <div className="pf-account__style">
            {styleGroups.map((group) => (
              <div key={group.key} className="pf-account__style-group">
                <p className="label">{group.label}</p>
                <ul className="pf-account__style-chips">
                  {group.items.map((item) => (
                    <li key={item.id} className="pf-account__style-tag">{item.label}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p className="empty__title">Your style is still unfolding.</p>
            <p>Explore a few pieces and your space will begin to reflect your taste.</p>
          </div>
        )}

        <div className="pf-account__actions">
          <Button to="/account/preferences" variant="ghost">Style Preferences</Button>
        </div>
      </section>

      <section className="pf-account__section" aria-label="Account details">
        {accountLoading ? (
          <div className="empty" aria-busy="true" aria-label="Loading your account">
            <p className="empty__title">Gathering your account&hellip;</p>
          </div>
        ) : accountFailed ? (
          <AccountUnavailable status={loadErrorStatus} message={loadError} />
        ) : (
        <div className="pf-account__cards">
          <article className="pf-account__card">
            <p className="pf-account__card-label">Personal details</p>
            {fullName ? <p className="pf-account__card-line">{fullName}</p> : null}
            {profile?.email ? <p className="pf-account__card-line">{profile.email}</p> : null}
            <p className="pf-account__card-line">{profile?.phone || 'No phone added'}</p>
            <div className="pf-account__actions">
              <Button to="/account/profile" variant="ghost">Manage Profile</Button>
            </div>
          </article>

          <article className="pf-account__card">
            <p className="pf-account__card-label">Address book</p>
            {defaultAddress ? (
              <>
                <p className="pf-account__card-line">{defaultAddress.type || 'Home'}</p>
                <p className="pf-account__card-line">
                  {defaultAddress.city}
                  {defaultAddress.state ? `, ${defaultAddress.state}` : ''}
                </p>
              </>
            ) : (
              /* Production's own honest line: no address is default on the
                 account until the customer sets one. */
              <p className="pf-account__card-line">No default address set.</p>
            )}
            <p className="pf-account__card-line">
              {addresses.length} {addresses.length === 1 ? 'address' : 'addresses'} saved
            </p>
            <div className="pf-account__actions">
              <Button to="/account/addresses" variant="ghost">Manage Addresses</Button>
            </div>
          </article>

          <article className="pf-account__card">
            <p className="pf-account__card-label">Account security</p>
            <p className="pf-account__card-line">Email · {profile?.email ? 'on file' : 'not set'}</p>
            <p className="pf-account__card-line">Phone · {profile?.phone ? 'on file' : 'not set'}</p>
            <p className="pf-account__card-line">Password · protected</p>
            <div className="pf-account__actions">
              <Button to="/account/security" variant="ghost">Account Security</Button>
            </div>
          </article>
        </div>
        )}
      </section>
    </AccountFrame>
  );
}

/* ── the states this application has and the design's prototype did not ──────

   A failed order read is never dressed as an empty history: a lapsed session
   (401/403) is named as one and offers the way back, and anything else states
   the application's own error with a retry through the order context's own
   `refreshOrders` — the same context method the production order screens call. */

function OrdersFailed({ status, message, onRetry, subject = 'orders', alert = true }) {
  const lapsed = status === 401 || status === 403;
  /* Each subject's two sentences are stated as literals rather than composed from
     the noun, so the orders wording the order block has always carried is
     unchanged to the character and can still be pinned as a string. */
  const copy = subject === 'orders'
    ? { lapsed: 'Please sign in again to see your orders.', failed: 'We could not load your orders right now.' }
    : { lapsed: 'Please sign in again to see your returns.', failed: 'We could not load your returns right now.' };
  return (
    <div className="empty" role={alert ? 'alert' : undefined}>
      <p className="empty__title">{lapsed ? copy.lapsed : copy.failed}</p>
      {!lapsed && message ? <p>{message}</p> : null}
      {lapsed
        ? <Button to="/signin?returnTo=%2Faccount">Sign in</Button>
        : <Button onClick={() => onRetry()}>Try again</Button>}
      <Button to="/shop" variant="ghost">Browse pieces</Button>
    </div>
  );
}

/* A failed account read is named as one, on the same two-branch rule the order
   block uses: a lapsed session (401/403) is offered the way back, anything else
   states the read's own message. There is no retry button here because the
   account context exposes no reload — and this page invents no handler of its
   own. */

function AccountUnavailable({ status, message }) {
  const lapsed = status === 401 || status === 403;
  return (
    <div className="empty" role="alert">
      <p className="empty__title">
        {lapsed ? 'Please sign in again to see your account.' : 'We could not load your account right now.'}
      </p>
      {!lapsed && message ? <p>{message}</p> : null}
      {lapsed ? <Button to="/signin?returnTo=%2Faccount">Sign in</Button> : null}
    </div>
  );
}

/* One rail of the design's own cards. Omitted entirely when it has nothing to
   show — an empty rail is not a promise — and a record the catalogue no longer
   resolves is skipped rather than stood in for. A rail may carry one line of its
   own under the heading (production's `SectionHead` description): the personal
   edit states the derivation's own reason there, and the rails that carry none
   are unchanged. */

function Rail({ label, eyebrow, title, description = null, products, plateFor }) {
  if (!products.length) return null;
  return (
    <section className="pf-account__section" aria-label={label}>
      <header className="shop__head pf-account__rail-head">
        <p className="label">{eyebrow}</p>
        <h2 className="display shop__title">{title}</h2>
        {description ? <p className="pf-account__note">{description}</p> : null}
      </header>
      <div className="grid-4 pf-account__rail-grid">
        {products.map((record) => (
          <Card key={record.id} record={record} plate={plateFor(record.id)} />
        ))}
      </div>
    </section>
  );
}

/* The design's product card over this application's record. The plates come
   from the canonical media set through this application's own single resolver
   — the same one every production image goes through, never a second one. */

function Card({ record, plate }) {
  const mapped = toDesignProduct(plate ?? record);
  if (!mapped) return null;
  const plates = [plate?.image, plate?.hoverImage]
    .map((reference) => normalizeMediaReference(reference))
    .filter(Boolean);
  const card = plates.length ? { ...mapped, images: plates } : mapped;
  return (
    <div className="pcard-cell">
      <ProductCard product={card} />
    </div>
  );
}

/* ── the two commerce panels' cards ──────────────────────────────────────────

   Both present this application's own record with this application's own
   formatters: `formatOfferDiscount` and `describeEligibility` are the offer
   repository's own functions (the same ones production's card calls), and a
   collection's cover comes from `resolveCollectionCover` — production's resolver
   chain — turned into a URL by the port's single media path. Neither card reads a
   context, keeps state or invents a value: what the repository does not hold, the
   card does not draw. */

function OfferCard({ offer }) {
  return (
    <article className="pf-account__offer">
      <p className="pf-account__offer-code">{offer.code}</p>
      <p className="display pf-account__offer-value">{formatOfferDiscount(offer)}</p>
      <p className="pf-account__offer-meta">
        {describeEligibility(offer)}
        {offer.minimumOrderValue > 0 ? ` · Min ${formatINR(offer.minimumOrderValue)}` : ''}
      </p>
      {offer.endDate ? <p className="pf-account__offer-meta">Until {offer.endDate}</p> : null}
      <Link to="/shop" className="arrow-link pf-account__offer-link"><span>Shop Collection</span></Link>
    </article>
  );
}

function CollectionTile({ collection }) {
  const cover = normalizeMediaReference(resolveCollectionCover(collection));
  /* The repository's normalised collection carries one description, which is the
     value production's `shortDescription || description` resolves to here. */
  const line = collection.description;
  return (
    <Link to={`/collections/${collection.slug}`} className="pf-account__collection">
      <span className="pf-account__collection-media">
        {cover ? (
          <img
            className="pf-account__collection-img"
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            onError={hideBrokenMedia}
          />
        ) : null}
      </span>
      <span className="label pf-account__collection-eyebrow">{collection.eyebrow || 'Collection'}</span>
      <span className="display pf-account__collection-name">{collection.name}</span>
      {line ? <span className="pf-account__collection-line">{line}</span> : null}
      <span className="arrow-link pf-account__collection-link"><span>Explore Collection</span></span>
    </Link>
  );
}
/* One live return, in production's own register: the record's own number, the
   first piece the return carries, the status the register gives it — labelled by
   the application's own return vocabulary, never a second copy of it — and one
   way into the return. A return with no item lines states none rather than a
   blank stood in for a name. */

function ReturnCard({ order, record }) {
  const piece = record.items?.[0]?.name;
  return (
    <article className="pf-account__return">
      <p className="label">Return in progress</p>
      <p className="pf-account__return-id">{record.id}</p>
      {piece ? <p className="pf-account__return-piece">{piece}</p> : null}
      <p className="pf-account__return-status">{getReturnStatus(record.status).label}</p>
      <div className="pf-account__actions">
        <Button to={`/account/orders/${order.id}/return`} variant="ghost">View Return</Button>
      </div>
    </article>
  );
}
