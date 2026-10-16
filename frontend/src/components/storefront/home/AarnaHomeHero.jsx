import HomepageSectionLoading from './HomepageSectionLoading';
import { useMemo, useSyncExternalStore } from 'react';
import Hero from '../../aarna/components/sections/Hero.jsx';
import { usingPreviewCatalogue } from '../../aarna/mock/data/products.js';
import { getCatalogState, refreshCatalog, subscribeCatalog } from '../../../services/catalog/catalogStore';
import { aarnaHomeHeroSlides } from './aarnaHomeHeroModel';

/** Same public /home feed as Atelier; no new fetch, CMS or fallback register.
 * BackendHomeHeroPanel already refreshes this store after persisted mutations.
 * The labelled, DEV-only reference harness retains its reference slides.
 */
export default function AarnaHomeHero() {
  const snapshot = useSyncExternalStore(subscribeCatalog, getCatalogState, getCatalogState);
  const slides = useMemo(() => aarnaHomeHeroSlides(snapshot.home), [snapshot.home]);

  if (usingPreviewCatalogue()) return <Hero />;
  if (snapshot.homeStatus === 'idle' || snapshot.homeStatus === 'loading') {
    return <HomepageSectionLoading sectionKey="hero" />;
  }
  if (snapshot.homeStatus === 'error') {
    return (
      <section className="container" style={{ paddingBlock: 48 }} aria-label="Featured campaigns">
        <p role="alert">Featured campaigns could not be loaded.</p>
        <button type="button" className="btn btn--solid" onClick={() => refreshCatalog()}>Try again</button>
      </section>
    );
  }
  // An empty successful response is authoritative, not permission to use art
  // from the static reference. Other homepage sections remain available.
  if (!slides.length) return null;
  // Reset the carousel/timer when its server-controlled content changes. This
  // also prevents an out-of-range index after a slide is removed/deactivated.
  return <Hero key={JSON.stringify(slides)} slides={slides} />;
}
