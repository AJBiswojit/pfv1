# PRATIKSHYA FASHION — House of Indian Craft (prototype storefront)

React 18 + Vite + JavaScript/JSX + Framer Motion. No TypeScript.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
```

## Structure
```
src/
  components/
    layout/      AnnouncementBar, Header (sticky + mega menu), Footer, Layout
    navigation/  MegaMenu, MobileMenu (accessible slide-out with accordions)
    sections/    Hero, CategoryCollage, SareeLookbook, BridalCampaign, JewelleryTheatre,
                 PromoBanner, MensEditorial, KidsPlayground, Bestsellers, KurtiLookbook,
                 Newsletter, TrustStrip
    product/     ProductCard (default | square | tall | row), Price, OptionSelector,
                 WishlistButton, useAddToBag
    shopping/    CartDrawer, QuickViewModal, SearchOverlay
    ui/          Logo, Button, ArrowLink, Reveal (mask/line/fade), NewsletterForm, Toasts
  pages/         Home, Shop (category + search), Product, Wishlist, Account, TrackOrder,
                 Checkout, Info, NotFound
  data/          content access layer (re-exports mock sources)
  mock/assets/   image registry (swap paths here)
  mock/data/     products, content, navigation, promotions, pages
  services/      catalog, newsletter, storage
  state/         ShopContext (cart, wishlist, promo, persisted), UIContext (drawers, toasts)
  hooks/ utils/ styles/ (tokens.css holds the palette & type scale)
```

## Honesty rules baked in
* All products, prices and the "Festive Preview" offer are **sample data** (`isSample: true`).
* Bestsellers are a curated `featured` flag — labelled as *not* a verified sales ranking.
* The promo banner renders only when `mock/data/promotions.js` has an active, unexpired entry.
* Trust-strip items render only when `enabled: true` (secure checkout is off until a gateway exists).
* Checkout, accounts and order tracking are clearly marked as not connected.

## Motion
Scroll reveals use `InView.*` (`src/components/ui/InView.jsx`), a drop-in for `motion.*` + `whileInView`.
They replay on re-entry with hysteresis: reveal at the trigger line in `utils/motion.js → inView`,
reset only once an element is `resetMargin` outside the viewport (no visible flicker). With
prefers-reduced-motion, content is shown immediately and never replays.

The hero carousel (`sections/Hero.jsx`) has no on-screen controls. It advances by autoplay
(`heroConfig.autoplayMs`), by swipe on touch, and by ←/→ once the hero has keyboard focus. Slides wrap
in both directions. Autoplay pauses on hover, keyboard focus, when the hero is off-screen or the tab is
hidden. It then resumes with the time that was left. Autoplay is disabled for prefers-reduced-motion.
Transitions crossfade: the incoming frame fades in over the outgoing one with a slight directional
reveal, and the outgoing frame stays opaque underneath until the swap ends, so no background shows through.

## Brand mark
The official logo is `public/images/pratikshya-logo.webp`, exported from the supplied artwork (`uploads/pf.png`,
trimmed, 237×288). It's rendered by `BrandMark` in `components/ui/Logo.jsx` (header, mobile menu, footer).
Favicons are `public/favicon-32.png`, `favicon-64.png` and `apple-touch-icon.png`.

## Imagery
All photography is AI-generated art direction in `public/images`, registered in `src/mock/assets/images.js`.
Every product image depicts that product. Jewellery, essentials, the groom mala, the linen kurta, the
co-ord kurta set, the ivory Banarasi saree and both kids' sets have dedicated product shots
(`*-studio.webp`, `p-linen-kurta`, `p-saree-ivory-detail`, `p-kids-girl-flat`, `p-kids-boy-form`).
Hero slide 4 has two art directions (`hero-jewellery` wide, `hero-jewellery-tall` portrait) chosen by a
container query on the visible frame's aspect ratio, so the bangles, ring and jhumkas stay in frame on
every breakpoint.
