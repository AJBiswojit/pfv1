import { SectionLink } from '../../../storefront/home/HomepageSection';
import { BadgeCheck, Headset, Lock, RotateCcw, Truck } from 'lucide-react';

const ICONS = { truck: Truck, badge: BadgeCheck, lock: Lock, returns: RotateCcw, help: Headset };

export default function TrustStrip({ content }) {
  /* Database-driven only: renders only admin-configured text items; without
     them this section renders nothing. */
  if (!content) return null;
  const icons = { delivery: "truck", authentic: "badge", secure: "lock", returns: "returns", help: "help" };
  const items = content.texts().map((t) => ({ key: t.key, icon: icons[t.key] ?? "truck", title: t.title, text: t.subtitle, to: t.ctaHref }));
  return (
    <section className="trust" aria-label="Delivery and assistance">
      <ul className="trust__list container">
        {items.map((t) => {
          const Icon = ICONS[t.icon];
          return (
            <li key={t.key}>
              <SectionLink authored to={t.to} className="trust__item">
                <Icon size={20} strokeWidth={1.2} />
                <span><strong>{t.title}</strong><small>{t.text}</small></span>
              </SectionLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
