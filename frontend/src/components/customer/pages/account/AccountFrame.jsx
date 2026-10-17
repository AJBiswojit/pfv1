import { useAccount } from '../../../../context/AccountContext.jsx';
import { Link } from '../../router/index.jsx';
import useAccountScrollReset from '../../hooks/useAccountScrollReset.js';
import AccountSidebar from './AccountSidebar.jsx';

/** The desktop workspace keeps the rail outside its labelled content scroller.
 * On mobile both columns return to document flow; only the section bar sticks. */
export default function AccountFrame({
  breadcrumbItems = [{ label: 'Account' }],
  label = 'Your account',
  title = null,
  children,
}) {
  const { profile } = useAccount();
  const heading = title ?? profile?.firstName ?? '';
  const contentRef = useAccountScrollReset();

  return (
    <div className="info container account pf-account">
      <div className="pf-account__layout">
        <AccountSidebar />
        <div
          ref={contentRef}
          id="pf-account-content"
          className="pf-account__content"
          role="region"
          aria-label="Account content"
          tabIndex={0}
        >
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            {breadcrumbItems.map((item, index) => (
              <span key={`${item.label}-${index}`}>
                <span aria-hidden="true"> / </span>
                {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
              </span>
            ))}
          </nav>
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
