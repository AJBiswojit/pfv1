import { Link } from '../../router/index.jsx';
import { footerGroups, site } from '../../data/index.js';
import { BrandMark } from '../ui/Logo.jsx';
import NewsletterForm from '../ui/NewsletterForm.jsx';
import { newsletterAvailable } from '../../services/newsletter.js';

export default function Footer() {
  const available = newsletterAvailable();
  return (
    <footer className="footer">
      <div className="container footer__top">
        <div className="footer__brand">
          <BrandMark height={76} className="footer__mark-logo" alt="PRATIKSHYA FASHION" />
          <p className="footer__lede">An Indian wardrobe, <em>composed slowly.</em></p>
          <p className="footer__desc">{site.description}</p>
          <div className="footer__news">
            {available ? <NewsletterForm variant="dark" id="footer-email" buttonLabel="Join" /> :
              <p className="footer__opening">The Pratikshya Circle: opening soon</p>}
          </div>
        </div>
        <div className="footer__groups">
          {footerGroups.map((group) => (
            <nav className="fgroup" key={group.title} aria-labelledby={`footer-${group.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <h2 className="fgroup__title" id={`footer-${group.title.toLowerCase().replace(/\s+/g, '-')}`}>{group.title}</h2>
              <ul className="fgroup__list">
                {group.links.map((link) => <li key={link.label}><Link to={link.to}>{link.label}</Link></li>)}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="footer__signature" aria-hidden="true"><span className="footer__mark">PRATIKSHYA</span></div>
      <div className="container footer__bottom">
        <p>© {new Date().getFullYear()} {site.brand}. All rights reserved.</p>
        <div className="footer__legal">
          <Link to="/pages/privacy">Privacy</Link>
          <Link to="/pages/terms">Terms</Link>
          <span>{site.contact.city}</span>
        </div>
      </div>
    </footer>
  );
}
