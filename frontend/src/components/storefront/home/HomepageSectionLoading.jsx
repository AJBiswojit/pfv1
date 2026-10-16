import './homepage-section-loading.css';

/** Reserve each editorial section's approximate footprint without visible copy. */
export default function HomepageSectionLoading({ sectionKey }) {
  return (
    <section
      className={`aan-home-loading aan-home-loading--${sectionKey}`}
      role="status"
      aria-label={sectionKey === 'hero' ? 'Loading featured campaigns' : `Loading ${sectionKey}`}
      aria-busy="true"
    >
      <div className="aan-home-loading__shimmer" aria-hidden="true" />
    </section>
  );
}
