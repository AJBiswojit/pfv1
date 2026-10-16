import { cloneElement, useMemo, useSyncExternalStore } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { getCatalogState, subscribeCatalog, refreshCatalog } from '../../../services/catalog/catalogStore';
import { usingPreviewCatalogue } from '../../aarna/mock/data/products.js';
import { Link } from '../../aarna/router/index.jsx';
import { homepageSectionMode, adaptHomepageSection } from './homepageSectionModel';

export default function HomepageSection({ sectionKey, children }) {
  const snapshot = useSyncExternalStore(subscribeCatalog, getCatalogState, getCatalogState);
  const result = homepageSectionMode(snapshot, sectionKey);
  const content = useMemo(() => result.section ? adaptHomepageSection(result.section) : null, [result.section]);
  if (usingPreviewCatalogue() || result.mode === 'legacy') return children;
  if (result.mode === 'hidden') return null;
  if (result.mode === 'loading') return <section className="container" role="status" aria-label={sectionKey}>Loading homepage content…</section>;
  if (result.mode === 'unavailable') return <section className="container" aria-label={sectionKey}><p role="alert">Homepage content is unavailable.</p><button type="button" onClick={() => refreshCatalog()}>Retry homepage content</button></section>;
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
