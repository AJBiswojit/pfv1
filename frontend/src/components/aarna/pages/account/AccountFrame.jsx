/**
 * PRATIKSHYA FASHION — PHASE 11 · the account frame.
 *
 * The shared shell every migrated account screen renders inside — the port's
 * equivalent of the production `components/account/AccountShell` (breadcrumb,
 * the customer's own name, the account navigation, the page body). It is drawn
 * with the design's own register: the `info container account` frame the
 * design's `/account` prototype used, its `.crumbs` steps, its `.label`, its
 * `.display` type and the port's `Button` — nothing here invents a visual
 * language of its own.
 *
 * NOTHING IS FABRICATED. The only data on this frame is data that exists: the
 * customer's first name comes from `useAccount()` (the account the server
 * returned for this session), and the two actions are the real ones — a link to
 * `/shop`, and `signOut()` from `AuthContext`, which is what the production
 * hero calls. No counts, no order numbers, no panel that promises content
 * later: while the account is still loading the heading is simply omitted.
 *
 * The design never drew an account screen — and the reason is worth keeping
 * written down: its `/account` stores a name in the browser's own storage and
 * says "no server account is created" on the page. This application has real
 * accounts (server-backed profile, addresses, orders and sessions), so the
 * frame reads the real context, and a UI migration cannot copy that
 * prototype's behaviour.
 *
 * Props, and why they are so few:
 *   · `breadcrumbItems` — the trail after "Home", `{ label, to? }` like the
 *     production shell's, so each page states where it sits;
 *   · `label` — the eyebrow; "Your account" is the design's own copy for the
 *     account page, pages may say something more specific;
 *   · `title` — the heading, when a page wants its own ("Order history").
 *     Without one the frame shows the customer's own first name.
 */

import { useNavigate } from 'react-router-dom';
import { Link } from '../../router/index.jsx';
import Button from '../../components/ui/Button.jsx';
import AccountNav from './AccountNav.jsx';
import { useAccount } from '../../../../context/AccountContext.jsx';
import { useAuth } from '../../../../context/AuthContext.jsx';

export default function AccountFrame({
  breadcrumbItems = [{ label: 'Account' }],
  label = 'Your account',
  title = null,
  children,
}) {
  const { profile } = useAccount();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  /* The production hero does exactly this, in exactly this order. */
  const handleSignOut = () => {
    signOut();
    navigate('/', { replace: true });
  };

  /* Real data or nothing — never a stand-in name. */
  const heading = title ?? profile?.firstName ?? '';

  return (
    <div className="info container account pf-account">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {breadcrumbItems.map((item) => (
          <span className="crumbs__step" key={`${item.label}-${item.to ?? ''}`}>
            <span>/</span>
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </span>
        ))}
      </nav>

      <header className="pf-account__intro">
        <div className="pf-account__who">
          <p className="label">{label}</p>
          {heading && <h1 className="display pf-account__name">{heading}</h1>}
        </div>
        <div className="pf-account__acts">
          <Button to="/shop" variant="ghost">Continue Shopping</Button>
          <Button variant="ghost" onClick={handleSignOut}>Sign Out</Button>
        </div>
      </header>

      <AccountNav />

      <div className="pf-account__body">{children}</div>
    </div>
  );
}
