/**
 * PRATIKSHYA FASHION — PHASE 9 · the order journey's chrome.
 *
 * The production checkout quiets the shopping chrome for the transaction: the
 * same fixed bar, the same brand mark, but no mega menu, no search, no account
 * surfaces — only the way back to the bag and a quiet word that the
 * transaction is secure by design (`components/checkout/CheckoutHeader.jsx`).
 * The Phase 8 audit recorded that behaviour as one a port must keep.
 *
 * The design has no such header to copy — its one header is the shopping one —
 * so this frame is written here, out of the design's own parts: its sticky
 * `.header` bar, its `.container`, its `Logo` (the real mark and wordmark) and
 * its footer, which production keeps under the order journey too. The bag
 * count is the application's own (`CartContext`), the label register is the
 * design's, and there is nothing else in here — no menu, no search, no
 * drawer. `/cart` itself keeps the design's FULL shell, exactly as it keeps
 * the shopping header in production.
 */

import { ShoppingBag } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { Link } from '../../router/index.jsx';
import Logo from '../ui/Logo.jsx';
import Footer from './Footer.jsx';
import ScrollToTop from '../ui/ScrollToTop.jsx';
import { useCart } from '../../../../context/CartContext.jsx';

export default function JourneyFrame({ children }) {
  const cart = useCart();

  return (
    <>
      <ScrollToTop />

      <header className="header">
        <div className="header__inner container">
          <span className="pf-frame__slot" aria-hidden="true" />
          <Logo />
          <div className="header__right">
            <p className="pf-frame__note">Secure Checkout</p>
            <Link
              to="/cart"
              className="icon-btn bag-btn"
              aria-label={`Shopping bag, ${cart.count} ${cart.count === 1 ? 'item' : 'items'}`}
            >
              <ShoppingBag size={18} strokeWidth={1.4} />
              <span className="bag-btn__label">Bag</span>
              <span className="bag-btn__count">{cart.count}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="pf-journey">{children ?? <Outlet />}</main>

      <Footer />
    </>
  );
}
