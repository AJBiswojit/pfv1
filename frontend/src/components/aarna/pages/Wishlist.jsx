import { useEffect, useState } from 'react';
import { Link } from '../router/index.jsx';
import { useNavigate } from 'react-router-dom';
import { useWishlist } from '../../../context/WishlistContext.jsx';
import { useShopping } from '../../../context/ShoppingContext.jsx';
import { useProductCovers } from '../../../hooks/useMedia.js';
import { normalizeMediaReference } from '../../../services/media/mediaPaths.js';
import { productHref } from '../../../data/products/index.js';
import { requiresVariantChoice } from '../../../utils/shopping.js';
import ProductCard from '../components/product/ProductCard.jsx';
import Button from '../components/ui/Button.jsx';
import { toDesignProduct } from '../mock/data/products.js';
import { useUI } from '../state/UIContext.jsx';

export default function Wishlist() {
  const wishlist = useWishlist();
  /* The move between the bag and the list, from this application's own
     shopping state — the same action the production wishlist calls. */
  const { moveToCart } = useShopping();
  /* The port's own drawer: the design's shell holds the bag, so a piece that
     has just been added is shown in it — the same move the production
     wishlist makes with the application's mini-cart. */
  const { openCart } = useUI();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState(null);

  /* A confirmation is a moment, not a permanent note — the production page
     clears its own after four seconds, and so does this one. */
  useEffect(() => {
    if (!feedback) return undefined;
    const timer = setTimeout(() => setFeedback(null), 4200);
    return () => clearTimeout(timer);
  }, [feedback]);

  /* The tab title, exactly as the production wishlist states it. */
  useEffect(() => {
    const previous = document.title;
    document.title = 'Wishlist — PRATIKSHYA FASHION';
    return () => { document.title = previous; };
  }, []);

  /* Saved pieces, resolved by the wishlist itself; the cards' plates come from
     the canonical media set. `useProductCovers` is a hook, so it is asked once
     for the whole list — never once per card. */
  const entries = wishlist.entries;
  const covered = useProductCovers(entries.map((entry) => entry.product).filter(Boolean));
  const plateFor = (id) => covered.find((row) => String(row.id) === String(id)) ?? null;

  const count = wishlist.count;
  const countLabel = `${count} ${count === 1 ? 'piece' : 'pieces'} saved`;
  const firstLoad = wishlist.isLoading && count === 0;
  const failed = Boolean(wishlist.error) && count === 0;

  /* Adding to the bag leaves the piece saved until the shopper removes it —
     the documented policy. A piece that needs a deliberate variant choice goes
     to its own page instead of having the choice forced into a card. */
  const addToBag = async (product) => {
    const result = await moveToCart(product);
    if (result?.needsVariant) { navigate(productHref(product)); return; }
    const ok = result?.ok !== false;
    setFeedback({ id: product.id, ok, message: result?.message ?? '' });
    if (ok) openCart();
  };
  const remove = (entry) => wishlist.remove(entry.product ?? entry.id);
  return (
    <div className="shop container">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Wishlist</span></nav>
      <header className="shop__head">
        <p className="label">Saved pieces</p>
        <h1 className="display shop__title">Wishlist</h1>
        <p className="shop__count">{firstLoad ? 'Loading…' : countLabel}</p>
      </header>
      {failed ? (
        <WishlistError status={wishlist.errorStatus} />
      ) : firstLoad ? (
        <WishlistLoading />
      ) : count === 0 ? (
        <div className="empty">
          <p className="empty__title">Nothing saved yet.</p>
          {/* The design's sentence said "saved on this device". That is true for a
              signed-out shopper and false for a signed-in one, whose list lives on
              the account — so the line states both cases and claims neither. */}
          <p>Tap the heart on any piece to keep it here — saved to your account when you are signed in, and on this device when you are not.</p>
          <Button to="/shop/all">Discover pieces</Button>
        </div>
      ) : (
        <div className="grid-4">
          {entries.map((entry) => entry.product ? (
            <SavedPiece
              key={entry.id}
              entry={entry}
              plate={plateFor(entry.product.id)}
              onAdd={addToBag}
              onRemove={remove}
              feedback={feedback?.id === entry.product.id ? feedback : null}
              isSyncing={wishlist.isSyncing}
            />
          ) : (
            <GonePiece key={entry.id} entry={entry} onRemove={remove} isSyncing={wishlist.isSyncing} />
          ))}
        </div>
      )}
    </div>
  );
}
/* ── the states this application's wishlist has, in the design's own blocks ──

   The design's list was an array it shipped with: it never fetched, never
   failed, and had one kind of empty. Each state below is written out of the
   design's own `.empty` block and its `.btn` variants, and none of them invents
   a product, a price, an availability or a saved count. The two failure messages
   are the production wishlist's own words. */

function WishlistLoading() {
  return (
    <div className="empty" aria-busy="true" aria-label="Loading your wishlist">
      <p className="empty__title">Gathering your wishlist&hellip;</p>
    </div>
  );
}

/* A lapsed session (401/403) is a different truth from an unreachable list, and
   says so — with the way back, which is this application's own sign-in route. */
function WishlistError({ status }) {
  const lapsed = status === 401 || status === 403;
  return (
    <div className="empty" role="alert">
      <p className="empty__title">
        {lapsed
          ? 'Please sign in again to see your wishlist.'
          : 'We could not load your wishlist right now. Please try again.'}
      </p>
      {lapsed && <Button to="/signin?returnTo=%2Faccount%2Fwishlist">Sign in</Button>}
      <Button to="/shop/all" variant="ghost">Browse pieces</Button>
    </div>
  );
}

/* A saved piece the catalogue still carries: the design's card — its plates, its
   name, its price, its own heart (which unsaves, so on this page the heart is a
   remove) and its own quick-add with the record's real option groups — over the
   two things the card has no place for: this application's availability
   statement and the explicit remove. */
function SavedPiece({ entry, plate, onAdd, onRemove, feedback, isSyncing }) {
  const record = plate ?? entry.product;
  const mapped = toDesignProduct(record);
  if (!mapped) return null;
  /* The canonical media row publishes records (`{ id, src, … }`); the design's
     card draws URL strings. The conversion is this application's own single
     resolver — the same one every production image goes through — never a
     second one, and never a plate dropped for being the wrong shape. */
  const plates = [plate?.image, plate?.hoverImage]
    .map((reference) => normalizeMediaReference(reference))
    .filter(Boolean);
  const card = plates.length ? { ...mapped, images: plates } : mapped;
  const choose = requiresVariantChoice(record);
  return (
    <div className="pcard-cell">
      <ProductCard product={card} />
      <div className="wishlist-row">
        <Button
          variant="solid"
          onClick={() => onAdd(record)}
          disabled={!mapped.inStock || isSyncing}
        >
          {!mapped.inStock ? 'Unavailable' : choose ? 'Choose options' : 'Add to bag'}
        </Button>
        <button
          type="button"
          className="wishlist-remove"
          onClick={() => onRemove(entry)}
          disabled={isSyncing}
        >
          Remove
        </button>
        {feedback?.message ? (
          <p className={feedback.ok ? 'wishlist-note' : 'wishlist-note is-err'} role="status">{feedback.message}</p>
        ) : null}
      </div>
    </div>
  );
}

/* A saved piece the catalogue no longer resolves. No image, no price, no
   substitute, no name — and exactly the words the production wishlist shows for
   it ("No longer available", and the sentence beneath). The page makes no claim
   of its own about how long the lookup has been running: `WishlistContext`
   exposes `unavailable` for the case where one was attempted and failed, and the
   application's own page states this much whether or not it is set — so this
   one does too, rather than promising a resolution that may never arrive. */
function GonePiece({ entry, onRemove, isSyncing }) {
  return (
    <article className="wishlist-gone" role="group" aria-label="Saved piece no longer available">
      <div>
        <p className="wishlist-gone__title">No longer available</p>
        <p className="wishlist-gone__body">
          This saved piece is no longer part of the atelier’s current collection.
        </p>
      </div>
      <button type="button" className="wishlist-remove" onClick={() => onRemove(entry)} disabled={isSyncing}>
        Remove
      </button>
    </article>
  );
}
