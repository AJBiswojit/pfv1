/**
 * PRATIKSHYA FASHION — PREVIEW-ONLY hero fixtures (Phase 1.5).
 *
 * ⚠️  NOT PRODUCTION DATA. Nothing in this file is imported by the storefront,
 *     by `HeroEditorial`, or by any live route. It exists so the Phase 1.5
 *     preview harness can be inspected when no backend/database is reachable.
 *
 * Provenance of every value, so nothing is claimed to be backend data:
 *
 *   · `title`, `body`, `cta.label`, `cta.href`, `mediaId`, `image`
 *       — this project's OWN canonical hero content, i.e. exactly what
 *         `GET /home` returns from the backend's canonical fallback
 *         (`explore_service._build_hero_slides`) when the home-hero table has
 *         no curated rows. The plates are addressed by their canonical object
 *         keys through the app's single media seam (`mediaObjectUrl`), never
 *         as an authored file path.
 *   · `eyebrow`
 *       — the campaign kicker strings used by the approved `home-page/`
 *         design (the storefront's visual source of truth). The live contract
 *         defaults `eyebrow` to "", so these exercise the kicker row only.
 *   · `PREVIEW_FIXTURE_ANNOUNCEMENTS` (Phase 2A)
 *       — Project B's own approved announcement-bar copy, used only by the
 *         shell preview so the bar can be inspected without a database. The
 *         production bar reads the PROMOTION marketing placement instead.
 *   · `mobileImage` on the fourth slide
 *       — the approved `home-page/` portrait plate for the jewellery / `split`
 *         art direction. It is served through the preview-only
 *         `/__preview-assets/…` namespace by the dev-only Vite plugin
 *         (`frontend/preview/vite-preview-media-assets.mjs`); it is never a
 *         production media reference.
 *
 * The harness shows a "PREVIEW FIXTURE" badge whenever these slides are on
 * screen, and switches to live backend data automatically when `GET /home`
 * returns slides.
 */

import { mediaObjectUrl } from "../../../services/media/mediaPaths";

/** Shown in the harness whenever fixture slides are in use. */
export const PREVIEW_FIXTURE_LABEL =
  "Preview fixture — canonical hero content, home-page campaign copy and the labelled " +
  "Phase 2B section samples. NOT live backend data.";

/**
 * PREVIEW-ONLY announcement copy (Phase 2A).
 *
 * These three lines are Project B's own approved announcement copy, taken
 * from `home-page/src/mock/data/content.js`. They exist so the Phase 2A
 * announcement bar can be inspected without a database, and they are NEVER
 * production content: production reads the PROMOTION marketing placement
 * (`src/hooks/useStorefrontAnnouncements.js`), and with no rows there the bar
 * renders nothing at all.
 *
 * The harness labels them "Preview fixture … NOT live backend data".
 */
export const PREVIEW_FIXTURE_ANNOUNCEMENTS = [
  { id: "preview-announce-1", text: "Delivery across India · timelines confirmed at checkout" },
  { id: "preview-announce-2", text: "The Festive Edit is live — sample offer details below" },
  { id: "preview-announce-3", text: "Complimentary styling help · by appointment" },
];

/** Preview-only asset namespace, served by the dev-only Vite middleware. */
export const previewAssetUrl = (name) => `/__preview-assets/${name}`;

/** Five slides in the backend's canonical order and layout sequence. */
export const PREVIEW_FIXTURE_SLIDES = [
  {
    id: "hero-1",
    eyebrow: "Collection 01 · Handwoven Silks",
    title: "Festive Elegance",
    body: "Handwoven stories for the season of celebration",
    cta: { label: "Explore Collection", href: "/shop" },
    image: mediaObjectUrl("hero/hero001.avif"),
    mediaId: "hero/hero001.avif",
    objectPosition: "50% center",
  },
  {
    id: "hero-2",
    eyebrow: "Collection 02 · Bride & Groom",
    title: "Bridal Couture",
    body: "Crafted for your most special day",
    cta: { label: "View Bridal", href: "/bridal" },
    image: mediaObjectUrl("hero/hero002.avif"),
    mediaId: "hero/hero002.avif",
    objectPosition: "50% center",
  },
  {
    id: "hero-3",
    eyebrow: "Collection 03 · Heritage Weaves",
    title: "Heritage Weaves",
    body: "Six yards of timeless craft",
    cta: { label: "Shop Sarees", href: "/women/sarees" },
    image: mediaObjectUrl("hero/hero003.avif"),
    mediaId: "hero/hero003.avif",
    objectPosition: "50% center",
  },
  {
    id: "hero-4",
    eyebrow: "Collection 04 · Jewellery & Essentials",
    title: "The Celebration Edit",
    body: "Dress up every moment",
    cta: { label: "Shop the Edit", href: "/shop" },
    image: mediaObjectUrl("hero/hero004.avif"),
    /* Portrait art direction: the split layout swaps to this plate when the
       visible frame is portrait or square (container query). */
    mobileImage: previewAssetUrl("hero-jewellery-tall.webp"),
    mediaId: "hero/hero004.avif",
    objectPosition: "50% 40%",
  },
  {
    id: "hero-5",
    eyebrow: "Collection 05 · Festive Family",
    title: "New Arrivals",
    body: "Fresh drapes, just landed",
    cta: { label: "Shop New", href: "/shop" },
    image: mediaObjectUrl("hero/hero005.avif"),
    mediaId: "hero/hero005.avif",
    objectPosition: "50% center",
  },
];

export default PREVIEW_FIXTURE_SLIDES;
