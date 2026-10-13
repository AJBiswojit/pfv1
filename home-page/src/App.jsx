import { Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout.jsx';
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Wishlist from './pages/Wishlist.jsx';
import Info from './pages/Info.jsx';
import Account from './pages/Account.jsx';
import TrackOrder from './pages/TrackOrder.jsx';
import Checkout from './pages/Checkout.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="shop" element={<Shop />} />
        <Route path="shop/:category" element={<Shop />} />
        <Route path="search" element={<Shop mode="search" />} />
        <Route path="product/:slug" element={<Product />} />
        <Route path="wishlist" element={<Wishlist />} />
        <Route path="account" element={<Account />} />
        <Route path="track-order" element={<TrackOrder />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="pages/:slug" element={<Info />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
