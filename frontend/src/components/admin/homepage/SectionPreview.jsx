import { MotionConfig } from 'framer-motion';
import { adaptHomepageSection } from '../../storefront/home/homepageSectionModel';
import { registeredImageUrl } from '../../../services/homepage/homepageContentModel';
import { ShopProvider } from '../../customer/state/ShopContext.jsx';
import { UIProvider } from '../../customer/state/UIContext.jsx';

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

// Section files read:
// - frontend/src/components/customer/components/sections/CategoryCollage.jsx
// - frontend/src/components/customer/components/sections/SareeLookbook.jsx
// - frontend/src/components/customer/components/sections/BridalCampaign.jsx
// - frontend/src/components/customer/components/sections/JewelleryTheatre.jsx
// - frontend/src/components/customer/components/sections/PromoBanner.jsx
// - frontend/src/components/customer/components/sections/MensEditorial.jsx
// - frontend/src/components/customer/components/sections/KidsPlayground.jsx
// - frontend/src/components/customer/components/sections/Bestsellers.jsx
// - frontend/src/components/customer/components/sections/KurtiLookbook.jsx
// - frontend/src/components/customer/components/sections/Newsletter.jsx
// - frontend/src/components/customer/components/sections/TrustStrip.jsx
// - frontend/src/components/customer/pages/Home.jsx (mapping source)
// All 11 reused without changes: they handle missing content gracefully (if (!content) return null) and rely only on content.* APIs.

function buildSyntheticSection(sectionKey, draft, asset, product, slot, contentType, section) {
  const allowed = section?.allowedSlots || [];
  const slotKey = slot || allowed.find((s) => s.contentType === contentType)?.slotKey || allowed[0]?.slotKey || 'intro';
  const synthetic = { key: sectionKey, configured: true, state: 'ready', items: [] };
  if (section?.items) synthetic.items.push(...section.items);

  // Always ensure intro exists for sections that use content.intro (10 of 11, trust has no intro)
  if (sectionKey !== 'trust') {
    const hasIntro = synthetic.items.some((r) => r.slotKey === 'intro' && r.contentType === 'TEXT');
    if (!hasIntro) {
      synthetic.items.push({
        id: 'preview-intro',
        slotKey: 'intro',
        contentType: 'TEXT',
        text: { eyebrow: draft?.eyebrow || 'Preview', title: draft?.title || 'Preview Title', subtitle: draft?.subtitle || 'Preview subtitle', ctaLabel: draft?.ctaLabel || null, ctaHref: draft?.ctaHref || null, altText: draft?.altText || '' },
      });
    }
  }

  const hasDraft = draft && (Object.values(draft).some((v) => String(v || '').trim()) || asset || product);
  if (hasDraft) {
    if (contentType === 'TEXT') {
      // For trust, slot is delivery/authentic/etc; otherwise use current slot
      synthetic.items.push({ id: 'preview-draft', slotKey, contentType, text: { ...draft } });
      // Also ensure intro if trust missing — trust has no intro, but add one text for intro slot is not in registry, so skip
    } else if (contentType === 'MEDIA') {
      const url = asset ? (registeredImageUrl(asset) || asset.url || asset.objectKey || '') : '';
      const mediaObj = { url, altText: draft?.altText || '', title: draft?.title || '', subtitle: draft?.subtitle || '', eyebrow: draft?.eyebrow || '', ctaLabel: draft?.ctaLabel || '', ctaHref: draft?.ctaHref || '' };
      synthetic.items.push({ id: 'preview-draft', slotKey, contentType, media: mediaObj });
      // For sections requiring multiple MEDIA slots, provide fallback for required slots
      // e.g., bridal needs bride/groom/couple, promotion needs campaign, etc — add missing with same url
      const requiredMediaSlots = {
        categories: ['women', 'men', 'kids', 'essentials'],
        bridal: ['bride', 'groom', 'couple'],
        jewellery: ['campaign'],
        promotion: ['campaign'],
        men: ['campaign'],
        kids: ['main', 'girls', 'boys'],
        sarees: ['lookbook-1', 'lookbook-2', 'lookbook-3'],
        kurtis: ['everyday-kurtis', 'anarkalis', 'festive-kurtis', 'kurta-sets'],
        newsletter: ['campaign'],
        bestsellers: [],
        trust: [],
      }[sectionKey] || [];
      for (const need of requiredMediaSlots) {
        if (need !== slotKey && !synthetic.items.some((r) => r.slotKey === need)) {
          synthetic.items.push({ id: `preview-media-${need}`, slotKey: need, contentType: 'MEDIA', media: { ...mediaObj, url } });
        }
      }
    } else if (contentType === 'PRODUCT') {
      const prod = product || { id: 'preview-prod', name: draft?.title || 'Preview Product', price: 999, slug: 'preview-product', department: 'women', type: 'sarees', images: [], status: 'PUBLISHED', published: true };
      synthetic.items.push({ id: 'preview-draft', slotKey, contentType, product: prod });
    }
  }
  return synthetic;
}

export default function SectionPreview({ sectionKey, draft, asset, product, slot, contentType, section }) {
  if (sectionKey === 'hero') return <p>Hero preview not available in this editor.</p>;
  if (!section?.configured) return <p>Preview — not saved · Hidden until configured</p>;

  const synthetic = buildSyntheticSection(sectionKey, draft, asset, product, slot, contentType, section);
  const adapted = adaptHomepageSection(synthetic);
  const Component = SECTION_COMPONENTS[sectionKey];
  if (!Component) return <p>Preview unavailable for {sectionKey}</p>;

  /* Product-bearing sections render ProductCard → useShop()/useUI(), which the
     customer storefront supplies via UIProvider > ShopProvider. The admin
     workspace has no such providers (cart/wishlist underneath ARE app-level
     via ShoppingProvider), so without them every product preview throws and
     the boundary reports "Preview unavailable." Both providers are
     effect-free (no fetches), and the preview stays inert. */
  return (
    <MotionConfig reducedMotion="always">
      <div>
        <p>Preview — not saved</p>
        <div inert style={{ pointerEvents: 'none' }} data-preview-body>
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
