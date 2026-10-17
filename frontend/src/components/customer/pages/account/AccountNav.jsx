import { useLocation } from 'react-router-dom';
import { Link } from '../../router/index.jsx';
import { useWishlist } from '../../../../context/WishlistContext.jsx';
import { ACCOUNT_SIDEBAR_GROUPS, isGroupActive } from './accountNavModel.js';

/**
 * The account sidebar's destination list: the grouped model rendered as a nav
 * landmark. Seven entries; five of production's leaves live on as section
 * tabs, and the wishlist entry keeps its live saved-count badge. Stateless —
 * the router pathname is the only active state — so the sidebar and the tab
 * strip can never disagree about where the customer is.
 */
export default function AccountNav() {
  const { pathname } = useLocation();
  const wishlist = useWishlist();

  return (
    <nav className="pf-account__nav" aria-label="Account navigation">
      <ul className="pf-account__nav-list">
        {ACCOUNT_SIDEBAR_GROUPS.map((item) => {
          const active = isGroupActive(item, pathname);
          const Icon = item.icon;
          const count = item.badge === 'wishlist' ? wishlist.count : 0;
          return (
            <li key={item.id} className="pf-account__nav-item">
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`pf-account__nav-link${active ? ' is-active' : ''}`}
              >
                <Icon size={14} strokeWidth={1.4} aria-hidden="true" />
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
