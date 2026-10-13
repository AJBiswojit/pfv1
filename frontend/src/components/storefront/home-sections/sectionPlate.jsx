/**
 * PRATIKSHYA FASHION — homepage content sections (Phase 2B).
 *
 * The one image primitive the ported sections use. It is a thin wrapper over
 * the application's existing `PratikshyaImage`, which owns every resolution
 * rule (canonical media URL, `{ src }` records, legacy references) and, when
 * nothing resolves, paints the quiet Atelier empty plate rather than a broken
 * image or an invented placeholder.
 *
 * Lazy by default, `decoding="async"`, and eager only where a plate is the
 * section's opening frame.
 */

import PratikshyaImage from "../../PratikshyaImage";

/**
 * True only when the plate object can actually paint a canonical image.
 *
 * `{ id, src: null }` is the media seam's honest "no picture" answer, and an
 * image-led tile built on it would be an empty box. Sections therefore DROP
 * image-led tiles they cannot fill (and keep every copy-led one), rather than
 * showing a frame that implies merchandise which is not there.
 */
export const hasPlate = (image) => Boolean(image && (image.src || image.url));

export function SectionPlate({
  image,
  alt = "",
  className = "",
  eager = false,
  objectPosition,
  sizes,
}) {
  return (
    <PratikshyaImage
      image={image}
      alt={alt}
      className={className}
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      objectPosition={objectPosition}
    />
  );
}

export default SectionPlate;
