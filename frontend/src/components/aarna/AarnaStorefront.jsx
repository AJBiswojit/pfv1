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

import Layout from "./components/layout/Layout.jsx";
import Home from "./pages/Home.jsx";
import { ShopProvider } from "./state/ShopContext.jsx";
import { UIProvider } from "./state/UIContext.jsx";
import { ensureDesignFonts } from "./designFonts.js";

import "./aarna.css";
import "./aarna.host.css";

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
            <Layout>
              <Home />
            </Layout>
          </ShopProvider>
        </UIProvider>
      </MotionConfig>
    </div>
  );
}
