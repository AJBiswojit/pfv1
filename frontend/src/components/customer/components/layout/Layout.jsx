import { Outlet, useLocation } from 'react-router-dom';
import AnnouncementBar from './AnnouncementBar.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import MobileMenu from '../navigation/MobileMenu.jsx';
import CartDrawer from '../shopping/CartDrawer.jsx';
import QuickViewModal from '../shopping/QuickViewModal.jsx';
import SearchOverlay from '../shopping/SearchOverlay.jsx';
import Toasts from '../ui/Toasts.jsx';
import ScrollToTop from '../ui/ScrollToTop.jsx';
import { isAccountAreaPath } from '../../utils/accountLayout.js';
import useAccountScrollReset from '../../hooks/useAccountScrollReset.js';

export default function Layout({ children }) {
  const accountArea = isAccountAreaPath(useLocation().pathname);
  const scrollRef = useAccountScrollReset({ enabled: accountArea, manageRestoration: true });
  const header = <><AnnouncementBar /><Header /></>;
  const focusAccountContent = (event) => {
    const target = scrollRef.current?.querySelector('.pf-account__content') ?? scrollRef.current;
    if (target) { event.preventDefault(); target.focus({ preventScroll: true }); }
  };
  return (
    <div className={accountArea ? 'pf-account-app' : undefined}>
      <ScrollToTop />
      <a href="#main" className="skip-link" onClick={accountArea ? focusAccountContent : undefined}>Skip to content</a>
      {accountArea ? <div className="pf-account-app__header">{header}</div> : header}
      <main id="main" ref={scrollRef} tabIndex={accountArea ? -1 : undefined} aria-label={accountArea ? 'Account workspace' : undefined}>
        {children ?? <Outlet />}
      </main>
      {!accountArea && <Footer />}
      <MobileMenu />
      <SearchOverlay />
      <CartDrawer />
      <QuickViewModal />
      <Toasts />
    </div>
  );
}
