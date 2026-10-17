import { useAccount } from '../../../../context/AccountContext.jsx';
import { Link } from '../../router/index.jsx';
import AccountSidebar from './AccountSidebar.jsx';

/**
 * The shared account shell: breadcrumb, sidebar rail and the page head with
 * the page's own body slot. The sidebar owns the destination list, the menu
 * control and the account actions; the frame only frames — the heading still
 * falls back to the profile's first name, and a guest still gets no name.
 */
export default function AccountFrame({
  breadcrumbItems = [{ label: 'Account' }],
  label = 'Your account',
  title = null,
  children,
}) {
  const { profile } = useAccount();
  const heading = title ?? profile?.firstName ?? '';

  return (
    <div className="info container account pf-account">
      <div className="pf-account__layout">
        <AccountSidebar />
        <div className="pf-account__content">
          <header className="pf-account__pagehead">
            <p className="label">{label}</p>
            {heading && <h1 className="display pf-account__name">{heading}</h1>}
          </header>
          <div className="pf-account__body">{children}</div>
        </div>
      </div>
    </div>
  );
}
