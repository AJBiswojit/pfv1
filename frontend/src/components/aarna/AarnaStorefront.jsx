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
