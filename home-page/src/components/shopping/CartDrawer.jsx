import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, X, Tag } from 'lucide-react';
import { useShop } from '../../state/ShopContext.jsx';
import { useUI } from '../../state/UIContext.jsx';
import useLockBody from '../../hooks/useLockBody.js';
import useEscape from '../../hooks/useEscape.js';
import useFocusTrap from '../../hooks/useFocusTrap.js';
import { formatPrice } from '../../utils/format.js';
import { ease } from '../../utils/motion.js';
import Button from '../ui/Button.jsx';

export default function CartDrawer() {
  const { cartOpen, closeCart } = useUI();
  const { lines, totals, setQty, removeLine, applyPromo, removePromo } = useShop();
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState(null);
  const ref = useRef(null);
  const navigate = useNavigate();
  useLockBody(cartOpen);
  useEscape(cartOpen, closeCart);
  useFocusTrap(ref, cartOpen);

  const onApply = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    const res = applyPromo(code);
    setCodeMsg(res.ok ? { ok: true, text: `${res.promo.code} applied — ${res.promo.discountPercent}% off Festive Edit items.` } : { ok: false, text: res.message });
    if (res.ok) setCode('');
  };

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeCart} />
          <motion.aside
            ref={ref}
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping bag"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.5, ease: ease.out }}
          >
            <div className="drawer__head">
              <h2>Your Bag <span>({totals.count})</span></h2>
              <button type="button" className="icon-btn" onClick={closeCart} aria-label="Close bag" data-autofocus><X size={20} strokeWidth={1.4} /></button>
            </div>

            {lines.length === 0 ? (
              <div className="drawer__empty">
                <p className="drawer__empty-title">Your bag is waiting.</p>
                <p>Begin with the Saree Edit or browse the Festive pieces.</p>
                <Button to="/shop/sarees" onClick={closeCart}>Explore Sarees</Button>
              </div>
            ) : (
              <>
                <ul className="drawer__lines">
                  <AnimatePresence initial={false}>
                    {lines.map((l) => (
                      <motion.li key={l.key} className="cline" layout exit={{ opacity: 0, x: 40, transition: { duration: 0.25 } }}>
                        <Link to={`/product/${l.product.slug}`} onClick={closeCart} className="cline__img">
                          <img src={l.product.images[0]} alt={l.product.name} />
                        </Link>
                        <div className="cline__body">
                          <Link to={`/product/${l.product.slug}`} onClick={closeCart} className="cline__name">{l.product.name}</Link>
                          {l.option && <p className="cline__opt">{l.option}</p>}
                          {totals.promo && l.product.collections.includes(totals.promo.eligibleCollection) && <p className="cline__promo"><Tag size={11} /> Festive Edit</p>}
                          <div className="cline__row">
                            <div className="qty" role="group" aria-label={`Quantity for ${l.product.name}`}>
                              <button type="button" onClick={() => setQty(l.key, l.qty - 1)} disabled={l.qty <= 1} aria-label="Decrease quantity"><Minus size={12} /></button>
                              <span aria-live="polite">{l.qty}</span>
                              <button type="button" onClick={() => setQty(l.key, l.qty + 1)} disabled={l.qty >= 10} aria-label="Increase quantity"><Plus size={12} /></button>
                            </div>
                            <p className="cline__price">{formatPrice(l.product.price * l.qty)}</p>
                          </div>
                          <button type="button" className="cline__remove" onClick={() => removeLine(l.key)}>Remove</button>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>

                <div className="drawer__foot">
                  {totals.promo ? (
                    <div className="promo-applied">
                      <span><Tag size={13} /> {totals.promo.code} · {totals.promo.discountPercent}% off Festive Edit</span>
                      <button type="button" onClick={() => { removePromo(); setCodeMsg(null); }}>Remove</button>
                    </div>
                  ) : (
                    <form className="promo-form" onSubmit={onApply}>
                      <label htmlFor="promo-code" className="sr-only">Promo code</label>
                      <input id="promo-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Promo code" />
                      <button type="submit">Apply</button>
                    </form>
                  )}
                  {codeMsg && <p className={codeMsg.ok ? 'promo-msg is-ok' : 'promo-msg is-err'} role="status">{codeMsg.text}</p>}

                  <dl className="totals">
                    <div><dt>Subtotal</dt><dd>{formatPrice(totals.subtotal)}</dd></div>
                    {totals.discount > 0 && <div className="totals__disc"><dt>Festive Edit discount</dt><dd>− {formatPrice(totals.discount)}</dd></div>}
                    {totals.promo && totals.discount === 0 && <div className="totals__note"><dt>No Festive Edit items in bag yet</dt><dd /></div>}
                    <div><dt>Delivery</dt><dd>Calculated at checkout</dd></div>
                    <div className="totals__grand"><dt>Total</dt><dd>{formatPrice(totals.total)}</dd></div>
                  </dl>
                  <Button className="btn--block" onClick={() => { closeCart(); navigate('/checkout'); }}>Proceed to Checkout</Button>
                  <button type="button" className="drawer__continue" onClick={closeCart}>Continue shopping</button>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
