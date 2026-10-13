import Hero from '../components/sections/Hero.jsx';
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
      <CategoryCollage />
      <SareeLookbook />
      <BridalCampaign />
      <JewelleryTheatre />
      <PromoBanner />
      <MensEditorial />
      <KidsPlayground />
      <Bestsellers />
      <KurtiLookbook />
      <Newsletter />
      <TrustStrip />
    </>
  );
}
