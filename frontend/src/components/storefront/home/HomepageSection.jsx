import HomepageSectionLoading from './HomepageSectionLoading';
import { cloneElement, useMemo, useSyncExternalStore } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { getCatalogState, subscribeCatalog } from '../../../services/catalog/catalogStore';
import { usingPreviewCatalogue } from '../../customer/mock/data/products.js';
import { Link } from '../../customer/router/index.jsx';
import { homepageSectionMode, adaptHomepageSection } from './homepageSectionModel';

/* B-09: a partial homepage-content outage previously rendered one identical
   "Homepage content is unavailable" error wall PER SECTION (11 stacked).
   Now an unavailable section renders nothing and the outage is logged once
   per page load through the existing client warn channel. The hero keeps
   its own (single) error surface — untouched by this change. */
let unavailableLogged = false;

export default function HomepageSection({ sectionKey, children }) {
  const snapshot = useSyncExternalStore(subscribeCatalog, getCatalogState, getCatalogState);
  const result = homepageSectionMode(snapshot, sectionKey);
  const content = useMemo(() => result.section ? adaptHomepageSection(result.section) : null, [result.section]);
  if (usingPreviewCatalogue()) return children;
  if (result.mode === 'hidden') return null;
  if (result.mode === 'loading') return <HomepageSectionLoading sectionKey={sectionKey} />;
  if (result.mode === 'unavailable') {
    if (!unavailableLogged) {
      unavailableLogged = true;
      console.warn(`PRATIKSHYA homepage content is unavailable; non-hero sections are hidden (${sectionKey} and any other affected sections).`);
    }
    return null;
  }
  // Reset local carousel/filter/hover state when authoritative entries change.
  return cloneElement(children, { content, key: JSON.stringify(result.section.items) });
}

export function SectionImage({ as: Image = 'img', src, ...props }) {
  return src ? <Image {...props} src={src} /> : null;
}
export function SectionLink({ to, authored = false, children, ...props }) {
  const Destination = authored ? RouterLink : Link;
  return to ? <Destination to={to} {...props}>{children}</Destination> : <span {...props}>{children}</span>;
}
export function SectionCTA({ copy, className = 'btn btn--solid' }) {
  return copy?.ctaLabel && copy?.ctaHref ? <RouterLink to={copy.ctaHref} className={className}>{copy.ctaLabel}</RouterLink> : null;
}
