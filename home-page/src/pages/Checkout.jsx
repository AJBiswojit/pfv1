import { Link } from 'react-router-dom';
import { useShop } from '../state/ShopContext.jsx';
import { formatPrice } from '../utils/format.js';
import Button from '../components/ui/Button.jsx';

export default function Checkout() {
  const { lines, totals } = useShop();
  return (
    <div className="info container checkout">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Checkout</span></nav>
      <p className="label">Checkout</p>
      <h1 className="display info__title">Order summary</h1>
      {lines.length === 0 ? (
        <><p className="info__lead">Your bag is empty.</p><Button to="/shop/all">Browse pieces</Button></>
      ) : (
        <>
          <ul className="checkout__lines">
            {lines.map((l) => (
              <li key={l.key}><img src={l.product.images[0]} alt="" /><span>{l.product.name}{l.option && <small>{l.option}</small>}</span><span>× {l.qty}</span><strong>{formatPrice(l.product.price * l.qty)}</strong></li>
            ))}
          </ul>
          <dl className="totals">
            <div><dt>Subtotal</dt><dd>{formatPrice(totals.subtotal)}</dd></div>
            {totals.discount > 0 && <div className="totals__disc"><dt>{totals.promo.code}</dt><dd>− {formatPrice(totals.discount)}</dd></div>}
            <div><dt>Delivery</dt><dd>Calculated with address</dd></div>
            <div className="totals__grand"><dt>Total</dt><dd>{formatPrice(totals.total)}</dd></div>
          </dl>
          <p className="form__note" role="note">Payments are not connected in this prototype, so no order can be placed. Connect a payment gateway and order service in <code>src/services</code> to enable checkout.</p>
          <Button to="/" variant="ghost">Continue shopping</Button>
        </>
      )}
    </div>
  );
}
