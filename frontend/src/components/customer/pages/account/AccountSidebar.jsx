import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../../../context/AuthContext.jsx';
import { useAccount } from '../../../../context/AccountContext.jsx';
import Button from '../../components/ui/Button.jsx';
import useEscape from '../../hooks/useEscape.js';
import useFocusTrap from '../../hooks/useFocusTrap.js';
import useLockBody from '../../hooks/useLockBody.js';
import AccountNav from './AccountNav.jsx';
import { ACCOUNT_SIDEBAR_GROUPS, isGroupActive } from './accountNavModel.js';

/**
 * The account sidebar: the signed-in customer's card, the destination list
 * and the two account actions. On desktop it is a stationary rail beside the
 * page; below the desktop breakpoint it becomes the hamburger drawer — the
 * same element, the same links, the same state. The only state here is the
 * drawer's open flag; everything rendered is live context data or nothing.
 */
export default function AccountSidebar() {
  const { profile } = useAccount();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const section = ACCOUNT_SIDEBAR_GROUPS.find((group) => isGroupActive(group, pathname))?.label ?? 'Your account';
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);

  const close = () => setOpen(false);
  useEscape(open, close);
  useFocusTrap(drawerRef, open);
  useLockBody(open);

  /* A route change is a navigation away: the drawer never stays open on the
     new page, and growing to desktop widths docks the rail again. */
  useEffect(() => {
    setOpen(false);
  }, [pathname, search]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(min-width: 1024px)');
    const dock = (event) => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener('change', dock);
    return () => query.removeEventListener('change', dock);
  }, []);

  const handleSignOut = () => {
    signOut();
    navigate('/', { replace: true });
  };

  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  const initials = [profile?.firstName?.[0], profile?.lastName?.[0]].filter(Boolean).join('').toUpperCase();
  const hasCard = Boolean(profile) && (name !== '' || initials !== '' || Boolean(profile.avatar) || Boolean(profile.email));

  return (
    <div className={`pf-account__side${open ? ' is-open' : ''}`}>
      <div className="pf-account__mobile-bar">
      <button
        type="button"
        className="btn btn--ghost pf-account__menu-btn"
        aria-expanded={open}
        aria-controls="pf-account-drawer"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={16} strokeWidth={1.4} aria-hidden="true" /> : <Menu size={16} strokeWidth={1.4} aria-hidden="true" />}
        <span>Account menu</span>
      </button>
      <p className="pf-account__current-section">{section}</p>
      </div>
      {open && (
        <button type="button" className="scrim pf-account__scrim" aria-label="Close account menu" onClick={close} />
      )}
      <div
        ref={drawerRef}
        id="pf-account-drawer"
        className={`pf-account__drawer${open ? ' is-open' : ''}`}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? 'Account menu' : undefined}
      >
        <button type="button" className="pf-account__drawer-close" aria-label="Close account menu" onClick={close}>
          <span>Account menu</span><X size={18} strokeWidth={1.4} aria-hidden="true" />
        </button>
        {hasCard && (
          <div className="pf-account__user">
            {profile.avatar ? (
              <img className="pf-account__user-avatar" src={profile.avatar} alt="" />
            ) : (
              <span className="pf-account__user-avatar" aria-hidden="true">{initials || '—'}</span>
            )}
            <div className="pf-account__user-lines">
              {name !== '' && <p className="pf-account__user-name" title={name}>{name}</p>}
              {profile.email && <p className="pf-account__user-email" title={profile.email}>{profile.email}</p>}
            </div>
          </div>
        )}
        <AccountNav />
        <div className="pf-account__side-foot">
          <Button to="/shop" variant="ghost">Continue Shopping</Button>
          <Button variant="ghost" onClick={handleSignOut}>Sign Out</Button>
        </div>
      </div>
    </div>
  );
}
