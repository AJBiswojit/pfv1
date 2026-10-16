import { Suspense, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import { LoadingState, PageTransition } from "../design-system";
import ScrollToTop from "../components/shell/ScrollToTop";
import CartDrawer from "../components/cart/CartDrawer";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import SiteFooter from "../components/shell/SiteFooter";
import SiteHeader from "../components/shell/SiteHeader";
import CheckoutHeader from "../components/checkout/CheckoutHeader";
import StorefrontHome from "../components/storefront/StorefrontHome";
import AarnaStorefront from "../components/aarna/AarnaStorefront";
import { useAarnaStorefront, useEditorialHome } from "../config/storefrontHome";

/**
 * The customer-facing application shell.
 *
 * Header, page, footer — the frame every storefront route is rendered
 * into. The routed page is wrapped in a `PageTransition` keyed on the
 * pathname inside an `AnimatePresence`, so one page fades out before the
 * next fades in.
 *
 * Wishlist and bag counts read the centralised shopping state, and the
 * mini-cart drawer mounts here — once, above every page — so the bag is
 * reachable from anywhere in the house.
 *
 * PHASE 2D — a second, exact port lives at the same boundary.
 *
 * `?home=aarna` (or `VITE_STOREFRONT_HOME=aarna`) renders
 * `components/aarna/AarnaStorefront`: the approved `home-page/` design carried
 * over file-by-file — its own announcement rail, header, mega menu, mobile menu,
 * footer, drawers and all twelve homepage sections — scoped under `.aan-root`
 * and wired to this application's catalogue, routes, cart, wishlist and account.
 * It brings its own shell, so for that one route this frame also drops the
 * application footer and the application mini-cart (the ported page has both).
 * Selected by default when no explicit build value is provided; an explicit
 * `atelier` or `editorial` value remains available for rollback/review.
 *
 * PHASE 2C — the controlled homepage boundary lives HERE.
 *
 * The integrated editorial homepage (`components/storefront/StorefrontHome`)
 * renders its own announcement rail and header, so it cannot be dropped inside
 * this frame unchanged: it would be a second header under the existing one,
 * pushed down by `pt-16 md:pt-20` for a header that is no longer fixed, on the
 * application canvas instead of the campaign one. This layout is the narrowest
 * boundary where all three can be resolved in one place, and it is the only
 * place the composition is mounted:
 *
 *   · header      — the existing `SiteHeader` (or `CheckoutHeader`) is not
 *                   rendered for that one route; the composition's own 2A
 *                   header is the only one, and it is sticky in flow;
 *   · top padding — dropped for that one route, because the header it offsets
 *                   is not there;
 *   · canvas      — the campaign blush replaces the application canvas for that
 *                   one route, at the layout root rather than on `body`, so no
 *                   portal and no other customer route is repainted.
 *
 * Every other route — the product, category, cart, checkout, account, auth and
 * portal trees — renders exactly what it rendered before. The switch itself
 * (`config/storefrontHome.js`) is off by default: with it off, this layout
 * renders the routed page and the homepage is the existing `AtelierDesign`,
 * which is also the fallback the switch is reversible to.
 */

/** Routes that pin a bar to the bottom of small screens. */
const hasMobileActionBar = (pathname) =>
  pathname.startsWith("/product/") ||
  pathname === "/cart" ||
  pathname.startsWith("/checkout") ||
  pathname.startsWith("/order-success");

/** The order journey trades the full shopping header for the quiet one. */
const isOrderJourney = (pathname) =>
  pathname.startsWith("/checkout") || pathname.startsWith("/order-success");

export default function CustomerLayout() {
  const { pathname } = useLocation();
  const wishlist = useWishlist();
  const cart = useCart();
  const counts = { wishlist: wishlist.count, cart: cart.count };

  /* Phase 2C: the integrated homepage, at the customer root only, and only
     while the switch asks for it (default: it does not). */
  const editorialHome = useEditorialHome();
  /* Phase 2D: the exact design port — same rule, its own shell and footer.
     Phase 6 extends the same switch to the design's product detail page and
     Phase 7 to the shop / listing / search pages, so all three of the port's
     surfaces take this branch and keep the production shell (header, footer,
     mini-cart, page transition) out of the way. Phase 8 adds the fourth and
     fifth: the wishlist (`/account/wishlist`, and its legacy `/wishlist` entry)
     and the four information pages, plus the guarded handover of a customer URL
     this application serves no route for — the staff portals and every route
     the application does serve stay production-side, by the boundary's own
     test. `useAarnaStorefront` is the boundary itself — read it rather than
     repeating its conditions, so a path can never be handed over by one and not
     by the other. */
  const aarna = useAarnaStorefront();
  const shellHome = editorialHome || aarna;

  /* A route change always dismisses the mini-cart. */
  const { isDrawerOpen, closeDrawer } = cart;
  useEffect(() => {
    if (isDrawerOpen) closeDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div
      className={`min-h-screen flex flex-col ${
        shellHome ? "pf-shell__surface" : "bg-canvas text-ink font-display"
      } selection:bg-accent selection:text-white`}
    >
      <ScrollToTop />
      {!editorialHome &&
        !aarna &&
        (isOrderJourney(pathname) ? (
          <CheckoutHeader />
        ) : (
          <SiteHeader counts={counts} onOpenCart={cart.openDrawer} />
        ))}

      <div className={aarna ? "flex-1" : editorialHome ? "flex-1" : "flex-1 pt-16 md:pt-20"}>
        {aarna ? (
          /* The Phase 2D exact port. Like the 2C composition it renders its own
             sticky header, so it is mounted outside `PageTransition` — the
             transition animates a transform, which would become the containing
             block for that header and its mega panel. */
          <AarnaStorefront />
        ) : editorialHome ? (
          /* No `PageTransition` around the composition: it animates a
             transform, which would become the containing block for the
             composition's sticky header and its absolutely positioned mega
             panel. The approved hero plays its own entrance reveal. */
          <StorefrontHome />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <PageTransition key={pathname}>
              <Suspense fallback={<LoadingState label="Loading" />}>
                <Outlet />
              </Suspense>
            </PageTransition>
          </AnimatePresence>
        )}
      </div>

      {!aarna && (
        <SiteFooter className={hasMobileActionBar(pathname) ? "pb-36 md:pb-16" : ""} />
      )}

      {/* Mini-cart — the Phase 2D port brings its own, wired to the same store. */}
      {!aarna && (
        <AnimatePresence>{isDrawerOpen && <CartDrawer />}</AnimatePresence>
      )}
    </div>
  );
}
