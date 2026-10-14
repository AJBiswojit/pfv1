/**
 * PRATIKSHYA FASHION — PHASE 9 · the bag, as a page of the design.
 *
 * The design's bag is the DRAWER (carried in the closure, byte-compared on
 * every port run) — the storage, the quantities, the offer field and the way
 * forward all live there, and this page keeps them exactly where they are.
 * What the design never drew is a bag PAGE, and this application has one:
 * `/cart`, the bag the checkout header links to and the drawer's new
 * "View bag" line opens.
 *
 * So this page is drawn out of the design's own blocks — `.crumbs`,
 * `.container`, `.label`, `.display`, `.qty`, `.totals`, `.promo-form`,
 * `.promo-applied`, `.promo-msg`, `.empty`, `.grid-4` and the `.btn`
 * variants — and bound to the application's own bag: `CartContext` for the
 * lines, quantities, offer and totals, `ShoppingContext` for the move to the
 * wishlist, `useRecommendations` for the closing rail. Nothing about money,
 * stock or availability is decided here.
 *
 * Every state the production bag has is kept and kept distinct: Loading (the
 * server bag is being fetched), Error (the backend failed — NEVER shown as an
 * empty bag, each status with its own words and a retry), Empty, and the
 * bag itself. The failure copy is the production page's, word for word.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from '../router/index.jsx';
import { Minus, Plus, Tag } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import ProductCard from '../components/product/ProductCard.jsx';
import { useCart } from '../../../context/CartContext.jsx';
import { useShopping } from '../../../context/ShoppingContext.jsx';
import { useRecommendations } from '../../../hooks/useRecommendations.js';
import { useProductCovers } from '../../../hooks/useMedia.js';
import { normalizeMediaReference } from '../../../services/media/mediaPaths.js';
import { productHref } from '../../../data/products/index.js';
import { formatINR, getMaxQuantity } from '../../../utils/shopping.js';
import { toDesignProduct } from '../mock/data/products.js';

/** Status-specific copy for a failed bag load — a failure is never "empty". */
const cartErrorCopy = (status) => {
  if (status === 401 || status === 403) return 'Please sign in again to see your bag.';
  if (status === 0) return 'Check your connection — your bag could not be loaded.';
  return 'We could not load your bag right now. Please try again.';
};

/** The plate for a line, through the application's one media resolver. */
const linePlate = (item) => normalizeMediaReference(item?.product?.image) || '';

/**
 * A line's own total, in the same shape the production cart line reads it
 * (`CartLineItem.jsx`): the cart response carries `lineTotal` for a signed-in
 * customer, and a guest bag — whose figures the server re-prices at placement —
 * is the catalogue's price × the quantity the bag holds. One definition, used
 * by the bag, the journey summary and the review, so no surface can show a
 * figure the others do not.
 */
export const lineTotalFor = (item) =>
  Number.isFinite(item?.lineTotal)
    ? item.lineTotal
    : (Number(item?.product?.price) || 0) * (Number(item?.quantity) || 0);

export default function Cart() {
  const cart = useCart();
  /* The move between the bag and the list — the same action the production
     bag and the ported wishlist both call. */
  const { moveToWishlist } = useShopping();

  useEffect(() => {
    const previous = document.title;
    document.title = 'Your Collection — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  /* The closing rail, from the application's own recommender. `placement:
     "cart"` and the bag's own product ids, exactly as the production page
     asks for it; an empty answer is an empty answer, never a substitute. */
  const cartIds = cart.items.map((item) => item.product?.id).filter(Boolean);
  const { sections } = useRecommendations({ placement: 'cart', cartIds });
  const recommendations = sections.completeTheLook ?? [];
  const covered = useProductCovers(recommendations);
  const recommendationCards = useMemo(
    () => covered
      .map((row) => {
        const mapped = toDesignProduct(row);
        if (!mapped) return null;
        /* `useProductCovers` answers with the canonical media records; the
           design's card draws URL strings. One resolver, the application's. */
        const plates = [row.image, row.hoverImage]
          .map((plate) => normalizeMediaReference(plate))
          .filter(Boolean);
        return plates.length ? { ...mapped, images: plates } : mapped;
      })
      .filter(Boolean),
    [covered]
  );

  /* ---------------------------------------------------------------- */
  /* The states, in the production bag's own order of precedence       */
  /* ---------------------------------------------------------------- */

  if (cart.error && cart.items.length === 0) {
    return (
      <div className="container pf-bag">
        <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Bag</span></nav>
        <header className="pf-head">
          <p className="label">Your bag</p>
          <h1 className="display pf-head__title">Your Collection</h1>
        </header>
        <div className="empty pf-error" role="alert">
          <p className="empty__title">{cartErrorCopy(cart.errorStatus)}</p>
          <Button onClick={() => cart.refreshCart()} disabled={cart.isLoading}>
            {cart.isLoading ? 'Loading…' : 'Try Again'}
          </Button>
        </div>
      </div>
    );
  }

  if (cart.isLoading && cart.items.length === 0) {
    return (
      <div className="container pf-bag">
        <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Bag</span></nav>
        <header className="pf-head">
          <p className="label">Your bag</p>
          <h1 className="display pf-head__title">Your Collection</h1>
        </header>
        <div className="empty" role="status" aria-busy="true">
          <p className="empty__title">Gathering your collection&hellip;</p>
          <p>Your bag is being loaded from the atelier.</p>
        </div>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="container pf-bag">
        <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Bag</span></nav>
        <header className="pf-head">
          <p className="label">Your bag</p>
          <h1 className="display pf-head__title">Your collection is waiting.</h1>
        </header>
        <div className="empty">
          <p>Discover pieces curated for your next occasion — sarees, lehengas and the finishing touches beside them.</p>
          <Button to="/shop">Explore the Collection</Button>
          <Button to="/collections/new-arrivals" variant="ghost">New Arrivals</Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* The bag itself                                                    */
  /* ---------------------------------------------------------------- */

  const pieces = cart.count === 1 ? '1 piece' : `${cart.count} pieces`;

  return (
    <div className="container pf-bag">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Bag</span></nav>

      <header className="pf-head">
        <p className="label">Your bag</p>
        <h1 className="display pf-head__title">Your Collection</h1>
        <p className="pf-head__count">{pieces}</p>
      </header>

      <div className="pf-bag__grid">
        <section className="pf-bag__lines" aria-label="Pieces in your bag">
          <ul className="pf-lines">
            {cart.items.map((item) => (
              <BagLine key={item.id} item={item} cart={cart} onMove={moveToWishlist} />
            ))}
          </ul>
          <div className="pf-bag__continue">
            <Button to="/shop" variant="ghost">Continue shopping</Button>
          </div>
        </section>

        <aside className="pf-summary" aria-label="Order summary">
          <h2 className="pf-summary__title">Order Summary</h2>
          <BagTotals totals={cart.totals} />
          <OfferField cart={cart} />
          <Button className="btn--block" to="/checkout">Proceed to Checkout</Button>
          <Link to="/shop" className="pf-quiet">Continue shopping</Link>
        </aside>
      </div>

      {recommendationCards.length > 0 && (
        <section className="pf-rail" aria-label="Complete your look">
          <header className="pf-rail__head">
            <p className="label">The finishing touches</p>
            <h2 className="display pf-rail__title">Complete your <em>look</em></h2>
            <p className="pf-rail__lead">Pieces chosen to sit naturally beside what your bag already holds.</p>
          </header>
          <div className="grid-4">
            {recommendationCards.map((card) => <ProductCard key={card.id} product={card} />)}
          </div>
        </section>
      )}

      {/* Mobile: the way forward stays in reach. */}
      <div className="pf-bar">
        <div className="pf-bar__total">
          <span className="pf-bar__label">Total</span>
          <strong>{formatINR(cart.totals.total)}</strong>
        </div>
        <Button to="/checkout">Checkout</Button>
      </div>
    </div>
  );
}

/* ── one line of the bag ──────────────────────────────────────────────────
   The design's drawer line (`cline`/`qty`) set for a page column: the plate,
   the name, the variant, the quantity control, the price and the two quiet
   actions. The ceiling is the backend's own (`item.maximum`) when the cart
   response carries it — the same rule `CartLineItem` applies — and the
   catalogue's for a guest bag; the server re-checks it at order placement. */

export function BagLine({ item, cart, onMove }) {
  const product = item.product ?? {};
  const plate = linePlate(item);
  const maximum = Number.isFinite(item.maximum)
    ? item.maximum
    : Math.max(1, getMaxQuantity(product) || 1);
  const lineTotal = lineTotalFor(item);
  const saved = Number(product.originalPrice) > Number(product.price)
    ? (Number(product.originalPrice) - Number(product.price)) * item.quantity
    : 0;
  const busy = cart.isSyncing;
  const href = productHref(product);

  return (
    <li className="pf-line">
      <div className="pf-line__img">
        {plate
          ? <Link to={href} aria-hidden="true" tabIndex={-1}><img src={plate} alt="" loading="lazy" /></Link>
          : <span aria-hidden="true" />}
      </div>
      <div className="pf-line__body">
        <Link to={href} className="pf-line__name">{product.name}</Link>
        <p className="pf-line__opt">
          {[item.color, item.size].filter(Boolean).join(' · ') || 'Free Size'}
        </p>
        {saved > 0 && <p className="pf-line__save">{formatINR(saved)} off</p>}

        <div className="pf-line__row">
          <div className="qty" role="group" aria-label={`Quantity for ${product.name}`}>
            <button
              type="button"
              onClick={() => cart.updateCartQuantity(item.id, item.quantity - 1)}
              disabled={busy || item.quantity <= 1}
              aria-label="Decrease quantity"
            >
              <Minus size={12} />
            </button>
            <span aria-live="polite">{item.quantity}</span>
            <button
              type="button"
              onClick={() => cart.updateCartQuantity(item.id, item.quantity + 1)}
              disabled={busy || item.quantity >= maximum}
              aria-label="Increase quantity"
            >
              <Plus size={12} />
            </button>
          </div>
          <p className="pf-line__price">{formatINR(lineTotal)}</p>
        </div>

        {item.quantity >= maximum && (
          <p className="pf-line__note" role="status">All {maximum} in your bag</p>
        )}

        <div className="pf-line__actions">
          <button type="button" className="pf-line__action" onClick={() => onMove(item)} disabled={busy}>
            Move to wishlist
          </button>
          <button type="button" className="pf-line__action" onClick={() => cart.removeFromCart(item.id)} disabled={busy}>
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

/* ── the ledger ───────────────────────────────────────────────────────────
   Every figure is the bag's own (`cart.totals` — the server's for a signed-in
   customer, the client's presentation calculation for a guest, which the
   server re-prices at checkout). Nothing is summed here. */

export function BagTotals({ totals }) {
  return (
    <dl className="totals">
      <div><dt>Subtotal</dt><dd>{formatINR(totals.subtotal)}</dd></div>
      {totals.productDiscount > 0 && (
        <div className="totals__disc"><dt>Product discount</dt><dd>− {formatINR(totals.productDiscount)}</dd></div>
      )}
      {totals.couponDiscount > 0 && (
        <div className="totals__disc"><dt>Offer</dt><dd>− {formatINR(totals.couponDiscount)}</dd></div>
      )}
      <div>
        <dt>Delivery</dt>
        <dd>{totals.shipping === 0 ? 'Complimentary' : formatINR(totals.shipping)}</dd>
      </div>
      {totals.codFee > 0 && (
        <div><dt>Cash on delivery fee</dt><dd>{formatINR(totals.codFee)}</dd></div>
      )}
      <div className="totals__grand"><dt>Total</dt><dd>{formatINR(totals.total)}</dd></div>
      <div className="totals__note"><dt>Inclusive of all taxes</dt><dd /></div>
      {totals.freeShippingRemainder > 0 && (
        <div className="totals__note">
          <dt>Add {formatINR(totals.freeShippingRemainder)} more for complimentary delivery</dt>
          <dd />
        </div>
      )}
      {totals.saved > 0 && (
        <div className="totals__note"><dt>You saved {formatINR(totals.saved)}</dt><dd /></div>
      )}
    </dl>
  );
}

/* ── the offer field ──────────────────────────────────────────────────────
   The design's own promotion field, in its applied and its empty face, wired
   to the application's own coupon actions: the mutation is the cart's (the
   server validates and persists it for a signed-in customer) and the answer
   shown is the answer it returned — never a fabricated acceptance. */

export function OfferField({ cart }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const apply = async (event) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    const result = await cart.applyCoupon(code);
    setBusy(false);
    setMessage(result);
    if (result?.ok) setCode('');
  };

  if (cart.coupon) {
    return (
      <div className="pf-offer">
        <div className="promo-applied">
          <span><Tag size={13} /> {cart.coupon.code} applied</span>
          <button type="button" disabled={cart.isSyncing} onClick={() => { cart.removeCoupon(); setMessage(null); }}>
            Remove
          </button>
        </div>
        {(cart.coupon.name || cart.coupon.summary) && (
          <p className="pf-offer__name">{cart.coupon.name ?? cart.coupon.summary}</p>
        )}
        {cart.couponLapsed && (
          <p className="promo-msg is-err" role="status">
            This offer isn&rsquo;t active for your current selection.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="pf-offer">
      <form className="promo-form" onSubmit={apply}>
        <label className="sr-only" htmlFor="bag-offer">Offer code</label>
        <input
          id="bag-offer"
          value={code}
          onChange={(event) => { setCode(event.target.value.toUpperCase()); setMessage(null); }}
          placeholder="Offer code"
          autoComplete="off"
          spellCheck="false"
        />
        <button type="submit" disabled={busy}>{busy ? 'Applying…' : 'Apply'}</button>
      </form>
      {message && (
        <p
          className={message.ok ? 'promo-msg is-ok' : 'promo-msg is-err'}
          role="status"
        >
          {message.ok ? `${code} applied.` : message.message}
        </p>
      )}
    </div>
  );
}
