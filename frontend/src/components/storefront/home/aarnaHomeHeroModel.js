/** Adapt the existing /home contract to the reference carousel's render shape.
 * No client fallback content: /home already owns canonical no-row fallback
 * versus the deliberately empty all-inactive case. Other sections are NOT CMS.
 */
import { normalizeHeroSlides } from './heroModel';
import { resolveMediaUrl } from '../../../services/media/mediaPaths';

export function aarnaHomeHeroSlides(home) {
  const raw = home?.heroSlides ?? home?.hero_slides ?? [];
  // Explicitly disable heroModel's legacy browser-media register fallback.
  // Only /home may decide whether canonical emergency content is appropriate.
  return normalizeHeroSlides(Array.isArray(raw) ? raw : [], []).map((slide) => ({
    ...slide,
    image: resolveMediaUrl(slide.image.src),
    alt: slide.image.alt,
    focal: slide.image.position,
    imageTall: slide.portrait ? resolveMediaUrl(slide.portrait.src) : undefined,
    focalTall: slide.portrait?.position,
    primary: slide.cta ? { label: slide.cta.label, to: slide.cta.href } : null,
    // /home has one CTA, not the reference's invented story/collection link.
    secondary: null,
  }));
}
