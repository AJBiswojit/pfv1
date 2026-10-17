/**
 * PRATIKSHYA FASHION — PHASE 11 · the account navigation.
 *
 * The same eleven destinations the production account navigation carries, drawn
 * in the design's own vocabulary. The DESTINATIONS are not re-declared here on
 * purpose: they are imported from `components/account/AccountNav.jsx`, the
 * production module `ACCOUNT_NAV_ITEMS` already lives in, so a route can never
 * mean one thing in the Atelier storefront and another in the port.
 *
 * Everything else is this application's, read through the existing contexts:
 * the wishlist count is `useWishlist()` — the same count the production tab
 * shows — and the active tab is the same rule production uses (exact for the
 * overview, prefix for the rest), exposed to assistive technology with
 * `aria-current="page"` and drawn with the design's accent underline.
 *
 * The design drew no account screen worth carrying — its account page is a
 * fifty-line prototype with three links and no navigation — so there is no
 * design navigation to port; what this file does is compose one out of the
 * design's existing register (uppercase letter-spaced labels, hairline rules,
 * the accent) and nothing else.
 */

import { useLocation } from 'react-router-dom';
import { Link } from '../../router/index.jsx';
import { ACCOUNT_NAV_ITEMS } from '../../../../components/account/AccountNav.jsx';
import { useWishlist } from '../../../../context/WishlistContext.jsx';

export default function AccountNav({ className = '' }) {
  const { pathname } = useLocation();
  const wishlist = useWishlist();

  return (
    <nav
      className={`pf-account__nav ${className}`.trim()}
      aria-label="Account navigation"
    >
      <ul className="pf-account__nav-list">
        {ACCOUNT_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
          const count = item.badge === 'wishlist' ? wishlist.count : 0;

          return (
            <li key={item.to} className="pf-account__nav-item">
              <Link
                to={item.to}
                className={`pf-account__nav-link${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                <span className="pf-account__nav-label">{item.label}</span>
                {count > 0 && <span className="pf-account__nav-count">{count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
