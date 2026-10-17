import './homepage-section-loading.css';

/** Reserve each editorial section's approximate footprint without visible copy. */
export default function HomepageSectionLoading({ sectionKey }) {
  return (
    <section
      className={`pf-home-loading pf-home-loading--${sectionKey}`}
      role="status"
      aria-label={sectionKey === 'hero' ? 'Loading featured campaigns' : `Loading ${sectionKey}`}
      aria-busy="true"
    >
      <div className="pf-home-loading__shimmer" aria-hidden="true" />
    </section>
  );
}
