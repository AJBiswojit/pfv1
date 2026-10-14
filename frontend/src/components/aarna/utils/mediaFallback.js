/**
 * PRATIKSHYA FASHION — PHASE 3 · the missing plate.
 *
 * A catalogue photograph reaches the port as a URL this application's media
 * layer issued (`mock/data/products.js` → `resolveMediaUrl`). Two things can go
 * wrong with it, and the design already answers for the first:
 *
 *   · a product with NO image renders as the frame's own reserved background —
 *     `.pcard__media` carries `background: var(--c-bg-2)`, the jewellery stage
 *     and the drawer line carry their own tone. The port does nothing, and it
 *     looks deliberate, because it is: it is the design's own image-less state.
 *   · a product whose URL FAILS to load is different. The browser paints its
 *     own broken-image glyph and the `alt` text inside the frame, over that
 *     reserved background. Measured in Chromium at 1440 px: the card showed a
 *     broken glyph and "Boys Casual Set" across the plate, where the image-less
 *     card beside it showed a clean tone.
 *
 * So every ported surface that renders a catalogue plate attaches this handler:
 *
 *     <img src={plate} alt={name} onError={hideBrokenMedia} />
 *
 * On failure the element is removed from rendering, which restores the state the
 * design already has for a product without a photograph. NOTHING IS
 * SUBSTITUTED — no placeholder file, no second request, no stock picture, and no
 * change to what the catalogue says: the plate is the only thing dropped, and the
 * card keeps its name, price and destinations.
 *
 * The element's own `display` is written directly rather than held in state: the
 * design renders these `<img>` tags inline, React does not manage a `style` prop
 * on any of them, and a failure is not something a later render should revive —
 * the same URL would fail again.
 */

/** Remove a catalogue plate that could not be loaded from rendering. */
export const hideBrokenMedia = (event) => {
  const plate = event?.currentTarget;
  if (!plate || !plate.style) return;
  plate.style.display = 'none';
};

export default hideBrokenMedia;
