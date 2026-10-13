/**
 * PRATIKSHYA FASHION — homepage section 12 (Phase 2B).
 *
 * Project B's trust strip: four hairline-separated service notes, each an icon
 * and two lines, in one band above the footer.
 *
 * WHERE ITS WORDS COME FROM — nowhere, by design. This application has no
 * storefront content source for service copy: the placement register models
 * media, and the routes Project B points at (`/about`, `/contact`, `/privacy`,
 * `/terms`) are declared in `navigationConfig.standalonePages` but are NOT
 * routed in `App.jsx`, so linking to them would send a customer to the
 * not-found page. Authoring four delivery/promise claims here would be
 * inventing marketing copy for the business.
 *
 * So the strip is DATA-DRIVEN and EMPTY IN PRODUCTION: it renders only when an
 * `items` array is supplied. The development-only preview passes its labelled
 * fixtures for visual review; production shows nothing until a managed content
 * source (and real policy routes) exist — recorded in
 * `docs/PHASE-2B-HOMEPAGE-CONTENT-SECTIONS.md`.
 */

import { Link } from "react-router-dom";
import { BadgeCheck, Headset, Lock, RotateCcw, Truck } from "lucide-react";

import "./home-sections.css";

const ICONS = { truck: Truck, badge: BadgeCheck, lock: Lock, returns: RotateCcw, help: Headset };

export default function SectionServiceStrip({ items = null }) {
  const list = (items ?? []).filter((item) => item?.enabled !== false && item?.title);
  if (!list.length) return null;

  return (
    <section className="pf-sec pf-sec-trust" aria-label="Delivery and assistance">
      <ul className="pf-sec-trust__list pf-sec__container">
        {list.map((item) => {
          const Icon = ICONS[item.icon] ?? BadgeCheck;
          const content = (
            <>
              <Icon size={20} strokeWidth={1.2} aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                {item.text ? <small>{item.text}</small> : null}
              </span>
            </>
          );

          return (
            <li key={item.key ?? item.title}>
              {/* An item without a real destination stays static: a broken link
                  is worse than a quiet line. */}
              {item.to ? (
                <Link to={item.to} className="pf-sec-trust__item">
                  {content}
                </Link>
              ) : (
                <span className="pf-sec-trust__item pf-sec-trust__static">{content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
