import { MotionConfig } from 'framer-motion';
import { adaptHomepageSection } from '../../storefront/home/homepageSectionModel';
import { ShopProvider } from '../../customer/state/ShopContext.jsx';
import { UIProvider } from '../../customer/state/UIContext.jsx';
import { buildSectionPreview, coverageLabel, previewStateLabel } from './previewModel';

// LIVE storefront mapping — must match customer/pages/Home.jsx -> customer/components/sections/*
// Home.jsx:14  categories -> CategoryCollage
// Home.jsx:15  sarees -> SareeLookbook
// Home.jsx:16  bridal -> BridalCampaign
// Home.jsx:17  jewellery -> JewelleryTheatre
// Home.jsx:18  promotion -> PromoBanner
// Home.jsx:19  men -> MensEditorial
// Home.jsx:20  kids -> KidsPlayground
// Home.jsx:21  bestsellers -> Bestsellers
// Home.jsx:22  kurtis -> KurtiLookbook
// Home.jsx:23  newsletter -> Newsletter
// Home.jsx:24  trust -> TrustStrip
import CategoryCollage from '../../customer/components/sections/CategoryCollage.jsx'; // frontend/src/components/customer/components/sections/CategoryCollage.jsx:44 (export default CategoryCollage)
import SareeLookbook from '../../customer/components/sections/SareeLookbook.jsx'; // frontend/src/components/customer/components/sections/SareeLookbook.jsx:13
import BridalCampaign from '../../customer/components/sections/BridalCampaign.jsx'; // frontend/src/components/customer/components/sections/BridalCampaign.jsx:11
import JewelleryTheatre from '../../customer/components/sections/JewelleryTheatre.jsx'; // frontend/src/components/customer/components/sections/JewelleryTheatre.jsx:22
import PromoBanner from '../../customer/components/sections/PromoBanner.jsx'; // frontend/src/components/customer/components/sections/PromoBanner.jsx:12
import MensEditorial from '../../customer/components/sections/MensEditorial.jsx'; // frontend/src/components/customer/components/sections/MensEditorial.jsx:12
import KidsPlayground from '../../customer/components/sections/KidsPlayground.jsx'; // frontend/src/components/customer/components/sections/KidsPlayground.jsx:12
import Bestsellers from '../../customer/components/sections/Bestsellers.jsx'; // frontend/src/components/customer/components/sections/Bestsellers.jsx:17
import KurtiLookbook from '../../customer/components/sections/KurtiLookbook.jsx'; // frontend/src/components/customer/components/sections/KurtiLookbook.jsx:18
import Newsletter from '../../customer/components/sections/Newsletter.jsx'; // frontend/src/components/customer/components/sections/Newsletter.jsx:9
import TrustStrip from '../../customer/components/sections/TrustStrip.jsx'; // frontend/src/components/customer/components/sections/TrustStrip.jsx:8

const SECTION_COMPONENTS = {
  categories: CategoryCollage,
  sarees: SareeLookbook,
  bridal: BridalCampaign,
  jewellery: JewelleryTheatre,
  promotion: PromoBanner,
  men: MensEditorial,
  kids: KidsPlayground,
  bestsellers: Bestsellers,
  kurtis: KurtiLookbook,
  newsletter: Newsletter,
  trust: TrustStrip,
};

// All 11 reused without changes: they handle missing content gracefully
// (`if (!content) return null`) and rely only on content.* APIs.
//
// Batch 1 (F-01/F-02/F-12):
//  · the draft is merged into the item array BEFORE adaptHomepageSection, so
//    the adapter's first-row-per-slot rule sees the operator's edit;
//  · the preview no longer requires a configured section — an unconfigured
//    section is composed from local state and issues no request;
//  · an unset MEDIA slot renders a labelled placeholder instead of a copy of
//    another slot's image.
export default function SectionPreview({ sectionKey, draft, asset, product, slot, contentType, section, editingId }) {
  if (sectionKey === 'hero') return <p>Hero preview not available in this editor.</p>;

  const preview = buildSectionPreview({ sectionKey, section, contentType, slotKey: slot, editingId, draft, asset, product });
  const adapted = adaptHomepageSection(preview.section);
  const Component = SECTION_COMPONENTS[sectionKey];
  if (!Component) return <p>Preview unavailable for {sectionKey}</p>;
  const coverage = coverageLabel(preview.coverage);

  /* Product-bearing sections render ProductCard → useShop()/useUI(), which the
     customer storefront supplies via UIProvider > ShopProvider. The admin
     workspace has no such providers (cart/wishlist underneath ARE app-level
     via ShoppingProvider), so without them every product preview throws and
     the boundary reports "Preview unavailable." Both providers are
     effect-free (no fetches), and the preview stays inert. */
  return (
    <MotionConfig reducedMotion="always">
      <div>
        <p role="status" data-preview-label>{previewStateLabel(preview)}</p>
        {coverage && <p role="status" data-preview-coverage>{coverage}.</p>}
        {!preview.configured && <p>No backend section exists for this preview. Nothing here has been written.</p>}
        {/* V-1 (browser acceptance): every storefront rule is scoped under
            `.pf-root` (customer.css — 771 selectors, including the design
            tokens and the .collage/.saree/.bridal layouts). Without this
            wrapper the preview rendered the right DATA with no design at all —
            an unstyled block document that looked like a broken page. The class
            is scoped to its own subtree, so the admin chrome is unaffected. */}
        <div className="pf-root" inert style={{ pointerEvents: 'none' }} data-preview-body>
          <UIProvider>
            <ShopProvider>
              <Component content={adapted} />
            </ShopProvider>
          </UIProvider>
        </div>
      </div>
    </MotionConfig>
  );
}

export { SECTION_COMPONENTS };
