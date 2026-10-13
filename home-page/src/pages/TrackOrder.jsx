import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function TrackOrder() {
  const [id, setId] = useState('');
  const [result, setResult] = useState(null);
  return (
    <div className="info container">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Track order</span></nav>
      <p className="label">Client care</p>
      <h1 className="display info__title">Track your order</h1>
      <p className="info__lead">Enter the order number from your confirmation email.</p>
      <form className="form form--inline" onSubmit={(e) => { e.preventDefault(); setResult(id.trim() ? 'none' : 'empty'); }}>
        <label className="sr-only" htmlFor="order-id">Order number</label>
        <input id="order-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. AAR-10234" />
        <button type="submit" className="btn btn--solid"><span>Track</span></button>
      </form>
      {result === 'empty' && <p className="form__err" role="alert">Please enter an order number.</p>}
      {result === 'none' && (
        <p className="form__note" role="status">
          No order “{id}” was found. This prototype isn’t connected to an order system yet — for help, <Link to="/pages/contact">contact client care</Link>.
        </p>
      )}
    </div>
  );
}
