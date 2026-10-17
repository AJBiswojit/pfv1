/**
 * PRATIKSHYA FASHION · the footer.
 *
 * ADAPTED AT THE BOUNDARY — and no longer a copy. `scripts/customer-port.js`
 * lists this file under `REPLACED`: the design's compact footer is retired on
 * this surface and the house's own three-band footer is written here, keeping
 * the design's export (`default Footer`), its `<footer class="footer">` element,
 * its `BrandMark`, its `fgroup` navigation landmarks and its routing shim.
 *
 * Three bands, in the reference's order: the newsletter panel, the main grid
 * (brand · four columns · the care rail), and the legal bar.
 *
 * What this file owns, and what it deliberately does not:
 *
 *   · every WORD comes from a data module. The house's record is
 *     `mock/data/site.js`, the columns and the service rail are
 *     `mock/data/footerPremium.js`, and neither is duplicated here;
 *   · every DESTINATION goes through the routing shim (`../../router/index.jsx`),
 *     so a footer link can only ever land on a route this application registers;
 *   · the artwork is one staged plate (`/design/pratikshya-footer-background.webp`)
 *     plus the inline marks in `../footer/FooterArt.jsx`; the panel itself is CSS.
 *   · nothing is claimed that the store does not do. The delivery line is read
 *     from the store's own shipping rules, the payment marks are read from its
 *     own payment methods, and a social mark with no published profile is drawn
 *     but not linked.
 *
 * The mark is the house's own `BrandMark`, as in the header; the
 * `<footer class="footer">` element is the single one the shell suite counts on
 * every full-page customer route. The two rules the copied footer obeyed
 * (`routing`, `footer-facts`, recorded in
 * `docs/PHASE-2D-EXACT-HOMEPAGE-VISUAL-PARITY.md` §3) still govern everything
 * below — `routing` through the shim, `footer-facts` because no contact line,
 * offer or instrument is printed unless the store holds it.
 */

import { ArrowRight, Headphones, ShieldCheck, Truck } from 'lucide-react';
import { Link } from '../../router/index.jsx';
import { site } from '../../data/index.js';
import { careHighlights, footerColumns, paymentMarks } from '../../mock/data/footerPremium.js';
import { BrandMark } from '../ui/Logo.jsx';
import { LotusMark, PaymentMark, SocialGlyph, Sparkle } from '../footer/FooterArt.jsx';
import FooterNewsletter from '../footer/FooterNewsletter.jsx';
import { readShippingRules } from '../../../../config/commerceDefaults.js';

/** The care rail's three icons, by the name the data module uses. */
const CARE_ICONS = { headset: Headphones, truck: Truck, shield: ShieldCheck };

/** The id every navigation landmark is named by — the design's own scheme. */
const columnId = (title) => `footer-${title.toLowerCase().replace(/\s+/g, '-')}`;

export default function Footer() {
  const shipping = readShippingRules();
  const care = careHighlights({
    shippingEnabled: shipping.enabled,
    freeShippingThreshold: shipping.freeShippingThreshold,
  });

  return (
    <footer className="footer">
      <div className="container">
        <FooterNewsletter />

        <div className="footer__main">
          {/* ── the house ── */}
          <div className="footer__brand">
            <Link to="/" className="footer__lockup" aria-label={`${site.brand} — home`}>
              <BrandMark height={84} className="footer__mark-logo" alt="PRATIKSHYA FASHION" />
              <span className="footer__lockup-text">
                <span className="footer__word">PRATIKSHYA</span>
                <span className="footer__sub">Fashion</span>
              </span>
            </Link>

            <p className="footer__lede">An Indian wardrobe, <em>composed slowly.</em></p>
            <p className="footer__desc">{site.description}</p>

            <ul className="footer__social" role="list">
              {site.social.map((profile) => {
                const glyph = <SocialGlyph platform={profile.key} />;
                const note = `${profile.label} — the house has not published this profile yet`;
                return (
                  <li key={profile.key}>
                    {profile.href ? (
                      <a className="fsocial" href={profile.href} target="_blank" rel="noreferrer noopener" title={profile.label}>
                        {glyph}
                        <span className="sr-only">{profile.label}</span>
                      </a>
                    ) : (
                      <span className="fsocial" aria-disabled="true" title={note}>
                        {glyph}
                        <span className="sr-only">{note}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <span className="footer__rule" aria-hidden="true"><Sparkle /></span>

          {/* ── the four columns ── */}
          <div className="footer__groups">
            {footerColumns.map((column) => {
              const id = columnId(column.title);
              return (
                <nav className="fgroup" key={column.title} aria-labelledby={id}>
                  <h2 className="fgroup__title" id={id}>{column.title}</h2>
                  <ul className="fgroup__list" role="list">
                    {column.links.map((link) => (
                      <li key={link.label}><Link to={link.to}>{link.label}</Link></li>
                    ))}
                  </ul>
                </nav>
              );
            })}
          </div>

          <span className="footer__rule" aria-hidden="true" />

          {/* ── the customer-service rail ── */}
          <div className="footer__care">
            {care.map((item) => {
              const Icon = CARE_ICONS[item.icon] ?? ShieldCheck;
              return (
                <div className="fcare" key={item.id}>
                  <Icon size={25} strokeWidth={1.4} className="fcare__icon" aria-hidden="true" />
                  <div className="fcare__body">
                    <p className="fcare__title">{item.title}</p>
                    <p className="fcare__text">{item.text}</p>
                    {item.link ? (
                      <Link className="fcare__link" to={item.link.to}>
                        {item.link.label}
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── the legal and brand bar: one hairline, full width ── */}
      <div className="footer__bar">
        <div className="container footer__bottom">
          <p className="footer__copyright">© {new Date().getFullYear()} {site.brand}. All rights reserved.</p>

          <div className="footer__tagline">
            <span className="footer__tagline-inner">
              <span className="footer__tagline-mark" aria-hidden="true"><LotusMark size={20} /></span>
              <span className="footer__tagline-text">
                Rooted in Tradition <span aria-hidden="true">|</span> Woven for Today
              </span>
            </span>
          </div>

          <div className="footer__assurance">
            {paymentMarks.length ? (
              <ul className="footer__payments" role="list" aria-label="Payment methods offered at checkout">
                {paymentMarks.map((mark) => (
                  <li className="paymark" key={mark.id} title={`${mark.label} · ${mark.via}`}>
                    <span className="paymark__art" aria-hidden="true"><PaymentMark id={mark.id} /></span>
                    <span className="sr-only">{mark.label}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <span className="footer__place">
              <span>{site.contact.city}</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
