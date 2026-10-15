import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { Plus } from 'lucide-react';
import { footerGroups, site } from '../../data/index.js';
import { BrandMark } from '../ui/Logo.jsx';
import NewsletterForm from '../ui/NewsletterForm.jsx';
import { cx } from '../../utils/format.js';

export default function Footer() {
  const [open, setOpen] = useState(null);
  return (
    <footer className="footer">
      <div className="container footer__top">
        <div className="footer__brand">
          <BrandMark height={92} className="footer__mark-logo" alt="PRATIKSHYA FASHION" />
          <p className="footer__lede">An Indian wardrobe, <em>composed slowly.</em></p>
          <p className="footer__desc">{site.description}</p>
          <div className="footer__news">
            <p className="footer__h">The Pratikshya Circle</p>
            <NewsletterForm variant="dark" id="footer-email" buttonLabel="Join" />
          </div>
        </div>

        <div className="footer__groups">
          {footerGroups.map((g) => {
            const isOpen = open === g.title;
            return (
              <div key={g.title} className={cx('fgroup', isOpen && 'is-open')}>
                <button type="button" className="fgroup__toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.title)}>
                  <span>{g.title}</span>
                  <Plus size={14} strokeWidth={1.4} />
                </button>
                <p className="fgroup__title">{g.title}</p>
                <ul className="fgroup__list">
                  {g.links.map((l) => <li key={l.label}><Link to={l.to}>{l.label}</Link></li>)}
                </ul>
              </div>
            );
          })}
          <div className="fgroup fgroup--contact">
            <p className="fgroup__title fgroup__title--always">Contact</p>
            <ul className="fgroup__list fgroup__list--always">
              {site.contact.email && <li><a href={`mailto:${site.contact.email}`}>{site.contact.email}</a></li>}
              {site.contact.hours && <li>{site.contact.hours}</li>}
              {site.contact.city && <li>{site.contact.city}</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="container footer__signature" aria-hidden="true">
        <span className="footer__mark">PRATIKSHYA</span>
      </div>

      <div className="container footer__bottom">
        <p>© {new Date().getFullYear()} {site.brand}. All rights reserved.</p>
        <ul className="footer__social">
          {site.social.map((s) => (
            <li key={s.label}><a href={s.href} target="_blank" rel="noreferrer noopener">{s.label}</a></li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
