/**
 * PRATIKSHYA FASHION — the integrated storefront homepage (Phase 2C).
 *
 * The approved design composed from the real, reviewed components, in order:
 *
 *   announcement rail   2A `shell/AnnouncementBar`  (live PROMOTION placement)
 *   header              2A `shell/StorefrontHeader` (live taxonomy navigation)
 *   01 hero             Phase 1 `home/HeroEditorial`
 *   02…12 sections      Phase 2B `home-sections/HomeSections`
 *
 * This legacy composition is not mounted by the customer router; Aarna owns
 * the customer storefront.
 *
 * DATA. Every seam here is the application's own: `heroSlides` (the live `GET /home` proxy), the HOME_HERO marketing
 * register through `useMarketingMedia`, the catalogue store through
 * `useCatalog` (so the sections re-render when the backend snapshot lands), and
 * the existing cart/wishlist contexts for the header counts and the bag button.
 * Nothing is authored here: no headline, no price, no product id, no campaign
 * copy, no fallback product. When the backend is empty or unreachable the hero
 * renders nothing, each section that has no data of its own renders nothing,
 * and the page is a short honest homepage rather than a wall of placeholders.
 *
 * FIXTURES. This module imports nothing from `components/storefront/preview/`.
 * The preview harness (labelled samples, review badges, device frames, the
 * `?data=` switch) is a development-only document; none of it can appear in the
 * customer experience because none of it is reachable from here.
 *
 * COMMERCE. No provider, no context and no drawer is created here. The bag and
 * wishlist are the app's single implementations, mounted once at the top of
 * `App.jsx`; the bag button opens the existing cart surface. The header's search, account dropdown, mega
 * menu and mobile drawer are the 2A components driving those same existing
 * surfaces.
 *
 * The footer is NOT part of the approved design yet (Phase 2A did not migrate
 * one), so this composition intentionally does not render a footer.
 */

import { useCart } from "../../context/CartContext";
import { useWishlist } from "../../context/WishlistContext";
import { MARKETING_PLACEMENTS } from "../../config/mediaTypes";
import { heroSlides } from "../../data/catalog/hero";
import { useCatalog } from "../../hooks/useCatalog";
import { useMarketingMedia } from "../../hooks/useMedia";
import AnnouncementBar from "./shell/AnnouncementBar";
import StorefrontHeader from "./shell/StorefrontHeader";
import HeroEditorial from "./home/HeroEditorial";
import HomeSections from "./home-sections/HomeSections";

export default function StorefrontHome() {
  /* Re-render whenever the backend catalogue snapshot arrives, so every
     backend-driven seam (the hero slides, the section rails, the taxonomy
     covers) updates exactly as it does on the existing homepage. */
  useCatalog();

  /* The hero's art direction comes from the HOME_HERO marketing register, the
     same call `AtelierDesign` makes; the slides come from the live proxy. */
  const heroMedia = useMarketingMedia(MARKETING_PLACEMENTS.HOME_HERO);

  /* The same two contexts the existing header is fed from, so counts and the
     bag button behave identically on both homepages. */
  const cart = useCart();
  const wishlist = useWishlist();
  const counts = { wishlist: wishlist.count, cart: cart.count };

  return (
    <div className="pf-shell__surface" data-home-surface="live">
      <AnnouncementBar />
      <StorefrontHeader counts={counts} onOpenCart={cart.openDrawer} />

      <main>
        <HeroEditorial slides={heroSlides} heroMedia={heroMedia} />
        <HomeSections />
      </main>
    </div>
  );
}
