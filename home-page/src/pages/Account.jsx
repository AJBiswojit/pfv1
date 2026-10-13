import { useState } from 'react';
import { Link } from 'react-router-dom';
import { load, save, remove } from '../services/storage.js';
import { useShop } from '../state/ShopContext.jsx';

const KEY = 'aarna:profile';
export default function Account() {
  const [profile, setProfile] = useState(() => load(KEY, null));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const { wishlist, totals } = useShop();

  const onSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErr('Please enter your name and a valid email.'); return; }
    const p = { name: name.trim(), email: email.trim() };
    save(KEY, p); setProfile(p); setErr('');
  };

  return (
    <div className="info container account">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Account</span></nav>
      <p className="label">Your account</p>
      {profile ? (
        <>
          <h1 className="display info__title">Namaste, <em>{profile.name}.</em></h1>
          <p className="info__lead">Signed in on this device as {profile.email}. (Prototype — no server account is created.)</p>
          <div className="account__tiles">
            <Link to="/wishlist" className="account__tile"><strong>{wishlist.length}</strong><span>Saved pieces</span></Link>
            <Link to="/track-order" className="account__tile"><strong>→</strong><span>Track an order</span></Link>
            <div className="account__tile"><strong>{totals.count}</strong><span>Items in bag</span></div>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { remove(KEY); setProfile(null); }}><span>Sign out</span></button>
        </>
      ) : (
        <>
          <h1 className="display info__title">Sign in</h1>
          <p className="info__lead">Accounts are simulated in this prototype and stored only in your browser.</p>
          <form className="form" onSubmit={onSubmit} noValidate>
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
            {err && <p className="form__err" role="alert">{err}</p>}
            <button type="submit" className="btn btn--solid"><span>Continue</span></button>
          </form>
        </>
      )}
    </div>
  );
}
