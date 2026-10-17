/**
 * PRATIKSHYA FASHION — PHASE 2D · the exact homepage port.
 *
 * This is the only file of the port that knows it is a port.
 *
 * Everything under `components/customer/**` is the approved `home-page/` design:
 * its own directory layout, its own components, its own stylesheet, its own
 * screenshots-in-code — carried over file by file. What this file adds is the
 * three things a design cannot know about the house it is moving into:
 *
 *   · THE ROOT. The design's stylesheet is scoped under `.aan-root`
 *     (`scripts/customer-port.js`), so the ported page mounts inside that element —
 *     a boundary the host's global styles cannot leak across.
 *   · THE PROVIDERS, in the design's own order: motion preferences, then its UI
 *     context, then its shop context — which is an adapter over this
 *     application's cart and wishlist, never a second shop.
 *   · THE PAGE. The design's `Layout` renders the shell (announcement rail,
 *     header, mega menu, mobile menu, footer, drawer, quick view, search,
 *     toasts, scroll restoration) and the design's `Home` renders the twelve
 *     sections inside it.
 *
 * `CustomerLayout.jsx` mounts this as the only customer storefront. Staff
 * portals remain separate routes in `App.jsx`.
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
import ResetPassword from "./pages/ResetPassword.jsx";
/* The account screens are native storefront pages. They keep the existing shared
   account contexts, service calls, and guest-order route behavior. */
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
/* Remaining account pages are also native storefront screens. */
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

/* All customer account routes below render storefront-owned screens; shared state,
   authorization, and account services continue to come from the application. */

/**
 * Compatibility redirect from the singular legacy collection URL to the
 * canonical managed collection path.
 */
function LegacyCollectionRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/collections/${slug}`} replace />;
}

export default function CustomerStorefront() {
  /* The design's two type families, requested when the port mounts. */
  useEffect(() => {
    ensureDesignFonts();
  }, []);

  return (
    <div className="aan-root">
      <MotionConfig reducedMotion="user">
        <UIProvider>
          <ShopProvider>
            {/* The storefront owns the customer route table and renders its shell once
                around each page. App.jsx mounts this boundary only for customer
                paths; staff portals are resolved before that catch-all. */}
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="product/:productId" element={<Product />} />
                {/* A single storefront listing page resolves shop, explore, search,
                    category, collection, and navigation scopes. */}
                <Route path="shop" element={<Shop mode="shop" />} />
                <Route path="explore" element={<Shop mode="explore" />} />
                <Route path="search" element={<Shop mode="search" />} />
                <Route path="category/:slug" element={<Shop mode="category" />} />
                <Route path="collections/:slug" element={<Shop mode="collection" />} />
                <Route path="collection/:slug" element={<LegacyCollectionRedirect />} />
                {/* Wishlist and information pages stay inside the storefront shell;
                    the wishlist URL redirects to its account destination. */}
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
                  Storefront authentication pages use the existing AuthContext and
                  reset service. The reset page reads the userId/token query pair;
                  no backend auth behavior is changed.
                  The existing forgot-password endpoint still does not dispatch
                  reset emails, so an email reset journey remains unavailable
                  until that backend capability exists. Staff portals keep their
                  original routes.
                */}
                <Route path="signin" element={<SignIn />} />
                <Route path="signup" element={<SignUp />} />
                <Route path="forgot-password" element={<ForgotPassword />} />
                <Route path="reset-password" element={<ResetPassword />} />
                {/* Protected customer screens share the AuthContext guard; the
                    individual order routes remain guest-accessible so guests can
                    inspect and claim their orders. */}
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
                {/* Unmatched customer paths are resolved by the storefront's listing
                    scope resolver and its own not-found state. */}
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
                shared contexts used across the application.
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
