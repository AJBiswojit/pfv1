import HomepageSection from '../../storefront/home/HomepageSection';
import Hero from '../../storefront/home/CustomerHomeHero.jsx';
import CategoryCollage from '../components/sections/CategoryCollage.jsx';
import SareeLookbook from '../components/sections/SareeLookbook.jsx';
import BridalCampaign from '../components/sections/BridalCampaign.jsx';
import JewelleryTheatre from '../components/sections/JewelleryTheatre.jsx';
import PromoBanner from '../components/sections/PromoBanner.jsx';
import MensEditorial from '../components/sections/MensEditorial.jsx';
import KidsPlayground from '../components/sections/KidsPlayground.jsx';
import Bestsellers from '../components/sections/Bestsellers.jsx';
import KurtiLookbook from '../components/sections/KurtiLookbook.jsx';
import Newsletter from '../components/sections/Newsletter.jsx';
import TrustStrip from '../components/sections/TrustStrip.jsx';

export default function Home() {
  return (
    <>
      <Hero />
      <HomepageSection sectionKey="categories"><CategoryCollage /></HomepageSection>
      <HomepageSection sectionKey="sarees"><SareeLookbook /></HomepageSection>
      <HomepageSection sectionKey="bridal"><BridalCampaign /></HomepageSection>
      <HomepageSection sectionKey="jewellery"><JewelleryTheatre /></HomepageSection>
      <HomepageSection sectionKey="promotion"><PromoBanner /></HomepageSection>
      <HomepageSection sectionKey="men"><MensEditorial /></HomepageSection>
      <HomepageSection sectionKey="kids"><KidsPlayground /></HomepageSection>
      <HomepageSection sectionKey="bestsellers"><Bestsellers /></HomepageSection>
      <HomepageSection sectionKey="kurtis"><KurtiLookbook /></HomepageSection>
      <HomepageSection sectionKey="newsletter"><Newsletter /></HomepageSection>
      <HomepageSection sectionKey="trust"><TrustStrip /></HomepageSection>
    </>
  );
}
