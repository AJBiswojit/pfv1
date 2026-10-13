import { Link } from 'react-router-dom';
import { useShop } from '../state/ShopContext.jsx';
import { getByIds } from '../services/catalog.js';
import ProductCard from '../components/product/ProductCard.jsx';
import Button from '../components/ui/Button.jsx';

export default function Wishlist() {
  const { wishlist } = useShop();
  const list = getByIds(wishlist);
  return (
    <div className="shop container">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Wishlist</span></nav>
      <header className="shop__head">
        <p className="label">Saved pieces</p>
        <h1 className="display shop__title">Wishlist</h1>
        <p className="shop__count">{list.length} saved</p>
      </header>
      {list.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Nothing saved yet.</p>
          <p>Tap the heart on any piece to keep it here — saved on this device.</p>
          <Button to="/shop/all">Discover pieces</Button>
        </div>
      ) : (
        <div className="grid-4">{list.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      )}
    </div>
  );
}
