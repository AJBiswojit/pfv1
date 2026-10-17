import { Link } from '../../router/index.jsx';

/**
 * The section tab strip: Personal, AI Atelier and Settings keep their merged
 * leaves one tap away. A tab is a real link to its section URL, so the active
 * tab is bookmarkable, the strip works without JavaScript state, and the
 * router — not a local index — is the source of truth.
 */
export default function AccountTabs({ label, tabs, activeId }) {
  return (
    <nav className="pf-account__tabs" aria-label={label}>
      <ul className="pf-account__tabs-list">
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <li key={tab.id} className="pf-account__tabs-item">
              <Link
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={`pf-account__tabs-link${active ? ' is-active' : ''}`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
