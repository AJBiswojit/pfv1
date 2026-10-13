/**
 * PRATIKSHYA FASHION — the homepage content sections (Phase 2B).
 *
 * The composed storefront body BELOW the hero, in the approved design's order:
 *
 *   01  Hero                     Phase 1 (`storefront/home/HeroEditorial`)
 *   02  Category collage         `SectionCategories`
 *   03  Saree edits              `SectionSareeEdits`
 *   04  Bridal pair              `SectionBridalPair`
 *   05  Finishing touches        `SectionFinishingTouches`
 *   06  Offer                    `SectionOffer`
 *   07  Menswear                 `SectionMensEdit`
 *   08  Kidswear                 `SectionKidsEdit`
 *   09  Bestsellers rail         `SectionProductRail`
 *   10  Fabric stories lookbook  `lookbook/SectionLookbook`
 *   11  Newsletter               NOT BUILT — no subscribe endpoint exists
 *   12  Service strip            `SectionServiceStrip` (content-source gated)
 *
 * Each section reads the application's own services and renders NOTHING when
 * it has nothing to say, so an empty or partially-hydrated catalogue produces
 * a short honest page rather than a wall of placeholders.
 *
 * `source` is the development-only preview seam: when the preview harness
 * passes its labelled fixtures, every section renders from those instead of the
 * live services. Production passes nothing.
 *
 * This module is NOT mounted anywhere in the application — see
 * `docs/PHASE-2B-HOMEPAGE-CONTENT-SECTIONS.md` §Integration.
 */

import { selectNewArrivalProducts } from "../../../services/media/mediaResolver";
import SectionCategories from "./SectionCategories";
import SectionSareeEdits from "./SectionSareeEdits";
import SectionBridalPair from "./SectionBridalPair";
import SectionFinishingTouches from "./SectionFinishingTouches";
import SectionOffer from "./SectionOffer";
import SectionMensEdit from "./SectionMensEdit";
import SectionKidsEdit from "./SectionKidsEdit";
import SectionProductRail from "./SectionProductRail";
import SectionLookbook from "./SectionLookbook";
import SectionServiceStrip from "./SectionServiceStrip";
import { buildRailSection } from "./sectionData";
import "./home-sections.css";

export default function HomeSections({ source = null, className = "" }) {
  /* The rail is the one section whose model needs a function (the catalogue's
     deterministic selector), so it is built here and handed over as data. */
  const rail =
    buildRailSection({
      override: source?.rail ?? null,
      selectProducts: source ? null : selectNewArrivalProducts,
    }) ?? null;

  return (
    <div className={`pf-sec-host ${className}`.trim()}>
      <SectionCategories data={source?.categories ?? null} />
      <SectionSareeEdits data={source?.saree ?? null} />
      <SectionBridalPair data={source?.bridal ?? null} />
      <SectionFinishingTouches data={source?.finishing ?? null} />
      <SectionOffer data={source?.offer ?? null} />
      <SectionMensEdit data={source?.men ?? null} />
      <SectionKidsEdit data={source?.kids ?? null} />
      <SectionProductRail data={rail} />
      <SectionLookbook data={source?.lookbook ?? null} />
      {/* Section 11 (newsletter) is intentionally absent — see the module note. */}
      <SectionServiceStrip items={source?.service ?? null} />
    </div>
  );
}
