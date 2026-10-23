import { MotionConfig } from 'framer-motion';
import Hero from '../../customer/components/sections/Hero.jsx';
import { customerHomeHeroSlides } from '../../storefront/home/customerHomeHeroModel';
import { heroPreviewSlides } from './previewModel';

/**
 * F-04 — the hero preview the control centre never had.
 *
 * Renders the SAME `Hero` component the storefront uses (`Home.jsx` →
 * `CustomerHomeHero` → `Hero`), with slides derived from the entries currently
 * held in memory. Nothing is saved, activated or re-fetched to preview, and
 * `MotionConfig reducedMotion="always"` disables autoplay (the same convention
 * `SectionPreview` uses).
 *
 * Deliberately not previewed: the optional mobile/portrait plate. The
 * placement read returns `mobileMediaAssetId`, not that asset's URL, so the
 * width-based portrait crop cannot be reproduced from the admin payload. It
 * is called out on screen instead of being guessed.
 */
export default function HeroPreview({ rows = [], unsaved = false }) {
  const slides = customerHomeHeroSlides({ heroSlides: heroPreviewSlides(rows) });
  if (!slides.length) {
    return (
      <div data-hero-preview>
        <p role="status" data-hero-preview-label>Preview — no hero entry has an image yet</p>
        <p>Choose registered media for at least one entry to preview the carousel. Nothing has been saved.</p>
      </div>
    );
  }
  return (
    <MotionConfig reducedMotion="always">
      <div data-hero-preview>
        <p role="status" data-hero-preview-label>
          Preview — {slides.length} slide{slides.length === 1 ? '' : 's'} from {unsaved
            ? 'the entries currently on screen, including unsaved changes (not saved)'
            : 'the saved entries (no unsaved changes)'}
        </p>
        <p className="text-xs text-pf-muted">
          Inactive entries are previewed too: the storefront only shows active entries of an active placement.
          The optional mobile/portrait plate is not previewable — the placement read returns its asset id, not its URL.
        </p>
        {/* V-1: the hero's stylesheet is scoped under `.pf-root` too; without
            it the carousel rendered as unstyled stacked text (h1 at 16px in the
            body font instead of the 101px Cormorant display face). */}
        <div className="pf-root" inert style={{ pointerEvents: 'none' }} data-hero-preview-body>
          <Hero slides={slides} />
        </div>
      </div>
    </MotionConfig>
  );
}
