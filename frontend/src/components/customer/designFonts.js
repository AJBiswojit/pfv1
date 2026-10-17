/**
 * PRATIKSHYA FASHION — PHASE 2D · the design's typography.
 *
 * The design sets its type in two families: Cormorant Garamond for display and
 * Manrope for everything else (`--f-serif`, `--f-sans` in its token sheet). Its
 * own entry file loads them as npm font packages
 * (`@fontsource/cormorant-garamond`, `@fontsource-variable/manrope`).
 *
 * This application loads fonts from Google Fonts in its document head, and its
 * own stack is Cormorant Garamond + Instrument Sans. So:
 *
 *   · the design's serif is already the same family — but the document loads
 *     italics only up to 400, and the design sets italic 500 and 600 as well;
 *   · the design's sans is a different family entirely — Manrope — which the
 *     document does not load at all.
 *
 * Adding Manrope to the document head and extending the serif's italics is what
 * makes the ported page render in the design's own type. It is done HERE rather
 * than in `index.html` so that the request is made when the port mounts and
 * never on any other route: the default storefront's typography, and its font
 * budget, are untouched.
 *
 * The link is idempotent — one node, same href, inserted once — and is not
 * removed on unmount (a font that disappears mid-session would reflow the page).
 */

const FONT_LINK_ID = "storefront-design-fonts";

const HREF =
  "https://fonts.googleapis.com/css2" +
  "?family=Cormorant+Garamond:ital,wght@1,500;1,600" +
  "&family=Manrope:wght@200..800" +
  "&display=swap";

/** Insert the design's font stylesheet once, if the document allows it. */
export function ensureDesignFonts() {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(FONT_LINK_ID);
  if (existing) return existing;
  const link = document.createElement("link");
  link.id = FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = HREF;
  document.head.appendChild(link);
  return link;
}

export default ensureDesignFonts;
