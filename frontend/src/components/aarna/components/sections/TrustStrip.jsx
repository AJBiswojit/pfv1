import { Link } from '../../router/index.jsx';
import { BadgeCheck, Headset, Lock, RotateCcw, Truck } from 'lucide-react';
import { trustItems } from '../../data/index.js';

const ICONS = { truck: Truck, badge: BadgeCheck, lock: Lock, returns: RotateCcw, help: Headset };

export default function TrustStrip() {
  const items = trustItems.filter((t) => t.enabled);
  return (
    <section className="trust" aria-label="Delivery and assistance">
      <ul className="trust__list container">
        {items.map((t) => {
          const Icon = ICONS[t.icon];
          return (
            <li key={t.key}>
              <Link to={t.to} className="trust__item">
                <Icon size={20} strokeWidth={1.2} />
                <span><strong>{t.title}</strong><small>{t.text}</small></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
