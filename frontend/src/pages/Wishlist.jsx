import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AtelierButton,
  AtelierSection,
  Breadcrumb,
  EditorialHeading,
  EmptyState,
  gap,
  ProductCard,
  transition,
  useReveal,
} from "../design-system";
import { useProductCovers } from "../hooks/useMedia";
import { productHref } from "../data/products";
import { useShopping } from "../context/ShoppingContext";
import { requiresVariantChoice } from "../utils/shopping";
import { cn } from "../utils/cn";

/**
 * The wishlist — /account/wishlist.
 *
 * The saved edit, laid out on the same product grid the storefront uses.
 * Each piece keeps the Phase 2 card untouched; the actions live in a quiet
 * row beneath it. Pieces that need a size choice are taken to their detail
 * page rather than forcing the choice into a card, and adding a piece to
 * the bag leaves it in the wishlist until the customer removes it.
 *
 * Saved pieces whose product no longer exists in the catalogue are shown
 * honestly as "no longer available" with a remove action — never silently
 * hidden and never substituted with another product.
 */
export default function Wishlist() {
  const { cart, wishlist, moveToCart } = useShopping();
  const navigate = useNavigate();
  const reveal = useReveal(16, 0.5);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Wishlist — PRATIKSHYA FASHON";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!feedback) return undefined;
    const timer = window.setTimeout(() => setFeedback(null), 4200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const addToBag = async (product) => {
    const result = await moveToCart(product);
    if (result.needsVariant) {
      navigate(productHref(product));
      return;
    }
    setFeedback({ id: product.id, message: result.message, ok: result.ok });
    if (result.ok) cart.openDrawer();
  };

  const breadcrumb = [{ label: "Account", to: "/account" }, { label: "Wishlist" }];

  if (wishlist.error && wishlist.count === 0) {
    return (
      <main>
        <AtelierSection rhythm="none" width="wide" className="pb-24 pt-28 sm:pt-32 md:pb-32">
          <Breadcrumb items={breadcrumb} className="mb-4" />
          <div role="alert" className="flex max-w-xl flex-col items-start gap-4 border border-accent/40 bg-accent/5 p-8">
            <div className="flex items-center gap-3">
              <AlertCircle size={18} className="shrink-0 text-accent" aria-hidden="true" />
              <p className="font-ui text-xs leading-relaxed text-accent">
                {wishlist.errorStatus === 401 || wishlist.errorStatus === 403
                  ? "Please sign in again to see your wishlist."
                  : "We could not load your wishlist right now. Please try again."}
              </p>
            </div>
          </div>
        </AtelierSection>
      </main>
    );
  }

  if (wishlist.isLoading && wishlist.count === 0) {
    return (
      <main>
        <AtelierSection rhythm="none" width="wide" className="pb-24 pt-28 sm:pt-32 md:pb-32">
          <Breadcrumb items={breadcrumb} className="mb-4" />
          <div role="status" aria-busy="true" className="max-w-xl">
            <p className="font-display text-2xl font-light tracking-tight text-ink">
              Gathering your wishlist…
            </p>
          </div>
        </AtelierSection>
      </main>
    );
  }

  if (wishlist.count === 0) {
    return (
      <main>
        <AtelierSection rhythm="none" width="wide" className="pb-24 pt-28 sm:pt-32 md:pb-32">
          <Breadcrumb items={breadcrumb} className="mb-4" />
          <EmptyState
            eyebrow="Saved Pieces"
            title="Your edit is still open."
            description="Save the pieces you love and return to them whenever you're ready — they will be waiting here."
            actions={
              <>
                <AtelierButton as={Link} to="/category/sarees" variant="primary" size="md">
                  Explore Sarees
                </AtelierButton>
                <AtelierButton as={Link} to="/category/lehengas" variant="outline" size="md">
                  Explore Lehengas
                </AtelierButton>
                <AtelierButton as={Link} to="/category/bridal-couture" variant="outline" size="md">
                  Explore Bridal
                </AtelierButton>
              </>
            }
          />
        </AtelierSection>
      </main>
    );
  }

  return (
    <main>
      <AtelierSection rhythm="none" width="wide" className="pb-24 pt-28 sm:pt-32 md:pb-32">
        <Breadcrumb items={breadcrumb} className="mb-8 md:mb-10" />

        <EditorialHeading
          as="h1"
          size="subsection"
          eyebrow="Saved Pieces"
          description={`Pieces you've saved for later — ${wishlist.count} ${
            wishlist.count === 1 ? "piece" : "pieces"
          } in your edit.`}
          spacing={{ eyebrow: "mb-4", title: "mb-3", description: "mb-0" }}
        >
          Your <span className="italic text-accent">wishlist.</span>
        </EditorialHeading>

        <div className={cn("mt-12 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:mt-16", gap.tile)}>
          <AnimatePresence initial={false}>
            {wishlist.entries.map((entry) =>
              entry.product ? (
                <WishlistEntry
                  key={entry.id}
                  entry={entry}
                  reveal={reveal}
                  feedback={feedback?.id === entry.id ? feedback : null}
                  onAddToBag={addToBag}
                  onRemove={() => wishlist.remove(entry.product)}
                  isSyncing={wishlist.isSyncing}
                />
              ) : (
                <UnavailableWishlistEntry
                  key={entry.id}
                  entry={entry}
                  onRemove={() => wishlist.remove(entry.id)}
                />
              )
            )}
          </AnimatePresence>
        </div>
      </AtelierSection>
    </main>
  );
}

/** A saved piece that still resolves in the catalogue. */
function WishlistEntry({ entry, reveal, feedback, onAddToBag, onRemove, isSyncing }) {
  const product = useProductCovers([entry.product])[0];
  return (
    <motion.div
      layout="position"
      {...reveal}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <ProductCard
        product={product}
        as={Link}
        to={productHref(product)}
        showCategory
        showDiscount
        showAvailability
        onWishlist={onRemove}
        isWishlisted
        wishlistIcon={Heart}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <AtelierButton
          variant="outline"
          size="chip"
          disabled={!product.inStock || isSyncing}
          onClick={() => onAddToBag(product)}
          className={cn(!product.inStock && "cursor-not-allowed opacity-40")}
        >
          {!product.inStock
            ? "Unavailable"
            : requiresVariantChoice(product)
              ? "Choose Options"
              : "Add to Bag"}
        </AtelierButton>
        <button
          type="button"
          disabled={isSyncing}
          onClick={onRemove}
          className={cn(
            "font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:text-accent",
            "disabled:cursor-not-allowed disabled:opacity-40",
            transition.colors,
            "focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
          )}
        >
          Remove
        </button>
      </div>

      <AnimatePresence>
        {feedback && feedback.message ? (
          <motion.p
            role="status"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "mt-2 font-ui text-[10px] tracking-wide",
              feedback.ok ? "text-cocoa" : "text-accent"
            )}
          >
            {feedback.message}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * A saved piece whose product no longer resolves in the catalogue. Shown
 * honestly — no image, no price, no substitute — with only the option to
 * remove it from the wishlist.
 */
function UnavailableWishlistEntry({ entry, onRemove }) {
  return (
    <motion.div
      layout="position"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="flex h-full flex-col justify-between border border-mist/80 bg-surface/30 p-5"
      role="group"
      aria-label="Saved piece no longer available"
    >
      <div className="flex items-start gap-3">
        <AlertCircle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-taupe" aria-hidden="true" />
        <div>
          <p className="font-ui text-[10px] uppercase tracking-[.16em] text-taupe">
            No longer available
          </p>
          <p className="mt-1.5 font-ui text-[11px] leading-relaxed text-graphite">
            This saved piece is no longer part of the atelier&rsquo;s current
            collection.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          "mt-6 self-start font-ui text-[10px] uppercase tracking-[.14em] text-taupe hover:text-accent",
          transition.colors,
          "focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
        )}
      >
        Remove
      </button>
    </motion.div>
  );
}
