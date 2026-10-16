/**
 * PRATIKSHYA FASHION — PHASE 2D · the exact homepage port.
 *
 * This is the only file of the port that knows it is a port.
 *
 * Everything under `components/aarna/**` is the approved `home-page/` design:
 * its own directory layout, its own components, its own stylesheet, its own
 * screenshots-in-code — carried over file by file. What this file adds is the
 * three things a design cannot know about the house it is moving into:
 *
 *   · THE ROOT. The design's stylesheet is scoped under `.aan-root`
 *     (`scripts/aarna-port.js`), so the ported page mounts inside that element —
 *     a boundary the host's global styles cannot leak across.
 *   · THE PROVIDERS, in the design's own order: motion preferences, then its UI
 *     context, then its shop context — which is an adapter over this
 *     application's cart and wishlist, never a second shop.
 *   · THE PAGE. The design's `Layout` renders the shell (announcement rail,
 *     header, mega menu, mobile menu, footer, drawer, quick view, search,
 *     toasts, scroll restoration) and the design's `Home` renders the twelve
 *     sections inside it.
 *
 * It is mounted by `layouts/CustomerLayout.jsx`, at the customer root, only
 * while the switch asks for it (`?home=aarna` in development,
 * `VITE_STOREFRONT_HOME=aarna` in a deployed build) — see
 * `config/storefrontHome.js`. With the switch off, nothing in this folder is
 * reachable from a customer's page.
 */

import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import Layout from "./components/layout/Layout.jsx";
import Home from "./pages/Home.jsx";
import Product from "./pages/Product.jsx";
import Shop from "./pages/Shop.jsx";
import Wishlist from "./pages/Wishlist.jsx";
import Info from "./pages/Info.jsx";
import Cart from "./pages/Cart.jsx";
import Checkout from "./pages/Checkout.jsx";
import OrderSuccess from "./pages/OrderSuccess.jsx";
import SignIn from "./pages/SignIn.jsx";
import SignUp from "./pages/SignUp.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
/* PHASE 11 — the migrated account screens. The port's own pages are imported
   where the port mounts them (as the bag, the journey and the auth screens above
   are): the boundary's chunk carries them, and the account's route-level code
   splitting is unchanged — `App.jsx` keeps its own lazy pages for the Atelier
   storefront, and this file keeps its own component for the port. Stage 2.2
   redrew `/account`; Stage 2.3 redrew the profile and the addresses; Stage 2.4
   redrew the four order screens. Their names are the port's own, deliberately
   distinct from the `lazy` declarations below, so the two kinds of route can
   never be confused: everything declared `lazy` below is still production's page,
   and a name that is not in that list is this boundary's own. */
import AccountOverview from "./pages/account/Overview.jsx";
import AccountProfilePage from "./pages/account/Profile.jsx";
import AccountAddressesPage from "./pages/account/Addresses.jsx";
/* The order screens share one frame (`pages/account/OrderFrame.jsx`) — the
   port's equivalent of production's `OrderPageShell`, which is what keeps the
   guest-order surface open: a guest gets the order and the two ways to keep it,
   a signed-in customer gets the account frame, and none of them is behind a
   guard production does not put them behind. */
import AccountOrdersPage from "./pages/account/Orders.jsx";
import AccountOrderDetailPage from "./pages/account/OrderDetail.jsx";
import AccountOrderTrackingPage from "./pages/account/OrderTracking.jsx";
import AccountOrderReturnPage from "./pages/account/OrderReturn.jsx";
/* Stage 2.5 redrew the two AI screens. Both sit inside the family's own guard
   (production wraps them in the same `ProtectedRoute`), and both reuse the
   production widgets they were built on — the pages here are the port's, the
   machines inside them are production's, unchanged. */
import AccountAiMirrorPage from "./pages/account/AiMirror.jsx";
import AccountAiShoppingPage from "./pages/account/AiShopping.jsx";
/* Phase 12: the four remaining account screens are native to the design. The
   production screens under pages/account/ stay untouched as the legacy surface. */
import AccountSettings from "./pages/account/Settings.jsx";
import AccountSecurity from "./pages/account/Security.jsx";
import AccountPreferences from "./pages/account/Preferences.jsx";
import InstagramRewards from "./pages/account/InstagramRewards.jsx";
import JourneyFrame from "./components/layout/JourneyFrame.jsx";
import ProtectedRoute from "../auth/ProtectedRoute.jsx";
import { ShopProvider } from "./state/ShopContext.jsx";
import { UIProvider } from "./state/UIContext.jsx";
import { ensureDesignFonts } from "./designFonts.js";

import "./aarna.css";
import "./aarna.host.css";
import "./aarna.listing.css";
import "./aarna.wishlist.css";
import "./aarna.checkout.css";
import "./aarna.auth.css";
import "./aarna.account.css";
import "./aarna.orders.css";
import "./aarna.ai.css";

/*
  PHASE 11 — the customer account's thirteen pages.

  The boundary adopts the whole account family (see the route table below), but
  the pages themselves migrate one at a time. A screen that has not been redrawn
  yet renders the production component, imported here exactly as `App.jsx`
  imports it and lazy for exactly the reason `App.jsx` loads it lazily — the
  route-level code splitting around the account is unchanged, and a page that
  suspends falls to the application's own `Suspense` boundary either way. A
  screen that HAS been redrawn (the overview, at the top of this file) renders
  the port's own page inside the shared frame, so the two kinds of route are
  never confused: everything declared `lazy` below is still production's.
*/

/**
 * The legacy collection entry (`/collection/:slug`), which this application
 * answers with a redirect to the managed path (`App.jsx::LegacyCollectionRedirect`).
 * The design's own vocabulary is kept for the render behind it.
 */
function LegacyCollectionRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/collections/${slug}`} replace />;
}

export default function AarnaStorefront() {
  /* The design's two type families, requested when the port mounts. */
  useEffect(() => {
    ensureDesignFonts();
  }, []);

  return (
    <div className="aan-root">
      <MotionConfig reducedMotion="user">
        <UIProvider>
          <ShopProvider>
            {/*
              PHASE 6 — the design's own route table, restricted to the pages
              the switch hands over.

              `App.jsx` in `home-page/` mounted its shell as a layout route and
              put every page inside it; the port mirrors that table exactly, so
              the design's `Layout` (announcement rail, header, mega menu, mobile
              menu, drawer, overlays, footer) is mounted once for whichever page
              is showing — its `Outlet` slot, the same one the shell always had.
              `CustomerLayout` decides whether this table is reached at all
              (`config/storefrontHome.js`); the two paths below are the only ones
              it hands over, so the design's route table cannot claim a route the
              switch did not offer it. That last point is what makes the
              catch-all below safe: it is reached only for a path the boundary
              has already proved this application serves no customer route on —
              and never for a staff portal path, which the boundary excludes by
              name before anything is handed over.

              The design's `product/:slug` becomes this application's
              `product/:productId` — the route `App.jsx` registers — and the page
              itself resolves either identifier against the live catalogue.
            */}
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="product/:productId" element={<Product />} />
                {/*
                  PHASE 7 — the listings. One design page, seven URL shapes,
                  each carrying the mode the page resolves its scope from. The
                  paths are this application's own (`App.jsx`), never the
                  design's: a design destination such as `/shop/sarees` is
                  translated by the routing shim before it is ever rendered.
                */}
                <Route path="shop" element={<Shop mode="shop" />} />
                <Route path="explore" element={<Shop mode="explore" />} />
                <Route path="search" element={<Shop mode="search" />} />
                <Route path="category/:slug" element={<Shop mode="category" />} />
                <Route path="collections/:slug" element={<Shop mode="collection" />} />
                <Route path="collection/:slug" element={<LegacyCollectionRedirect />} />
                {/*
                  PHASE 8 — the wishlist and the information pages.

                  `/account/wishlist` is this application's canonical wishlist
                  route; `/wishlist` is the legacy entry `App.jsx` redirects to
                  it, and the port answers it with the same redirect *inside* the
                  design's shell, so a customer following the header's heart from
                  a ported page never sees the production chrome paint first.

                  The four information routes are the ones `routeManifest`
                  carries; the page reads its own metadata from that manifest.
                */}
                <Route path="account/wishlist" element={<Wishlist />} />
                {/* PHASE 9 — the bag, inside the design's full shell, exactly as
                    the production bag keeps the shopping chrome. */}
                <Route path="cart" element={<Cart />} />
                <Route path="wishlist" element={<Navigate to="/account/wishlist" replace />} />
                <Route path="about" element={<Info />} />
                <Route path="contact" element={<Info />} />
                <Route path="privacy" element={<Info />} />
                <Route path="terms" element={<Info />} />
                {/*
                  PHASE 10 — the customer authentication screens.

                  The design never drew one: its `/account` is a prototype that
                  stores a name in `localStorage` and says "no server account is
                  created" on the page. So these three pages are written in the
                  design's vocabulary and have no design counterpart — the tool
                  checks they exist and never writes them (see ADDED in
                  `scripts/aarna-port.js`). They are the application's own
                  screens, mounted here exactly as Phase 9 mounted the bag:
                  only while the switch asks for the port, inside the design's
                  full shell — the chrome production gives them too.

                  `/reset-password` is deliberately NOT here. Its production
                  screen cannot complete a reset (`ResetPasswordRequest`
                  requires a `userId`/`token` pair the screen never reads), and
                  dressing an unreachable flow would be staging. It keeps the
                  production page; so do the staff portals. (`/account/**` was
                  still production-side then — PHASE 11 adopts it below.)
                  Recorded in `docs/PHASE-10-AUTHENTICATION-UI.md` §7.
                */}
                <Route path="signin" element={<SignIn />} />
                <Route path="signup" element={<SignUp />} />
                <Route path="forgot-password" element={<ForgotPassword />} />
                {/*
                  PHASE 11 — the customer account.

                  Thirteen URLs, under the two guards production already draws:
                  the ten account SCREENS stand behind the same `ProtectedRoute`
                  the production tree wraps them in, while the three order PAGES
                  stay UNGUARDED on purpose — they are the guest-order surface
                  (`OrderPageShell` branches on `isAuthenticated`, handing a
                  guest the `/signin?returnTo=%2Faccount%2Forders` and
                  `/signup?returnTo=%2Faccount%2Forders` links, and
                  `claimGuestOrders` attaches the order after sign-in). The
                  `/account/wishlist` route above is not part of this family: it
                  belongs to the wishlist surface Phase 8 adopted.

                  Phase 11 is a UI migration, one page at a time. Until a page
                  is redrawn, the element below is the PRODUCTION page — the
                  same component, the same contexts, the same validators, the
                  same lazy boundary — so the boundary can move without a
                  single behaviour moving with it. Each later step swaps one
                  element for its ported page, rendered inside the shared
                  `pages/account/AccountFrame.jsx`.

                  The swaps are the index route first (`/account` renders the
                  port's `Overview`), then the profile and the addresses (Stage
                  2.3), then the four order screens (Stage 2.4) — each one reading
                  the same contexts its production page reads, stating the same
                  facts from them and calling the same context methods for every
                  action. The production pages themselves are untouched and still
                  serve these paths in the Atelier storefront (`App.jsx`), and the
                  guards these routes sit behind are unchanged: the order list
                  stays inside `ProtectedRoute`, and the three single-order URLs
                  stay open to a guest, because they are the guest-order surface
                  (`OrderFrame` branches on the session exactly as production's
                  `OrderPageShell` does).
                */}
                <Route element={<ProtectedRoute />}>
                  <Route path="account" element={<AccountOverview />} />
                  <Route path="account/profile" element={<AccountProfilePage />} />
                  <Route path="account/addresses" element={<AccountAddressesPage />} />
                  <Route path="account/orders" element={<AccountOrdersPage />} />
                  <Route path="account/settings" element={<AccountSettings />} />
                  <Route path="account/security" element={<AccountSecurity />} />
                  <Route path="account/preferences" element={<AccountPreferences />} />
                  <Route path="account/ai-mirror" element={<AccountAiMirrorPage />} />
                  <Route path="account/ai-shopping" element={<AccountAiShoppingPage />} />
                  <Route path="account/instagram-rewards" element={<InstagramRewards />} />
                </Route>
                <Route path="account/orders/:orderId" element={<AccountOrderDetailPage />} />
                <Route path="account/orders/:orderId/track" element={<AccountOrderTrackingPage />} />
                <Route path="account/orders/:orderId/return" element={<AccountOrderReturnPage />} />
                {/* The navigation-scope register (`/women/sarees/silk`, …) and
                    `/collections` — the paths `App.jsx` sends to its navigation
                    listing. Anything else the boundary hands over resolves to
                    no scope, and the page answers with the design's 404. */}
                <Route path="*" element={<Shop mode="navigation" />} />
              </Route>

              {/*
                PHASE 9 — the money path's two quiet routes.

                `JourneyFrame` is this port's equivalent of the reduced
                `CheckoutHeader` production gives the order journey: the
                design's sticky bar and its mark, the way back to the bag, and
                nothing else — no mega menu, no search, no drawer. The
                transaction itself is untouched: both routes stay behind this
                application's own `ProtectedRoute`, so a guest is still sent to
                `/signin?returnTo=…`, and the pages inside read the existing
                `CartContext`, `CheckoutContext` and `OrderContext` — the same
                contexts the production pages read.
              */}
              <Route element={<JourneyFrame />}>
                <Route
                  path="checkout"
                  element={<ProtectedRoute><Checkout /></ProtectedRoute>}
                />
                <Route
                  path="order-success"
                  element={<ProtectedRoute><OrderSuccess /></ProtectedRoute>}
                />
              </Route>
            </Routes>
          </ShopProvider>
        </UIProvider>
      </MotionConfig>
    </div>
  );
}
