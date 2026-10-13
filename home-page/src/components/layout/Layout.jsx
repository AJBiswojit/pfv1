import { Outlet } from 'react-router-dom';
import AnnouncementBar from './AnnouncementBar.jsx';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import MobileMenu from '../navigation/MobileMenu.jsx';
import CartDrawer from '../shopping/CartDrawer.jsx';
import QuickViewModal from '../shopping/QuickViewModal.jsx';
import SearchOverlay from '../shopping/SearchOverlay.jsx';
import Toasts from '../ui/Toasts.jsx';
import ScrollToTop from '../ui/ScrollToTop.jsx';

export default function Layout() {
  return (
    <>
      <ScrollToTop />
      <a href="#main" className="skip-link">Skip to content</a>
      <AnnouncementBar />
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <MobileMenu />
      <SearchOverlay />
      <CartDrawer />
      <QuickViewModal />
      <Toasts />
    </>
  );
}
