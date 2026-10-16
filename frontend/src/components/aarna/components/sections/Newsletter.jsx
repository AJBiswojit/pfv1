import { SectionImage, SectionLink, SectionCTA } from '../../../storefront/home/HomepageSection';
import { motion } from 'framer-motion';
import { Link } from '../../router/index.jsx';
import { images } from '../../data/index.js';
import NewsletterForm from '../ui/NewsletterForm.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

export default function Newsletter({ content }) {
  return (
    <section className="news" id="newsletter" aria-labelledby="news-title">
      <div className="container news__inner">
        <InView.div className="news__arch" initial={{ clipPath: 'inset(100% 0 0 0 round 999px 999px 0 0)' }} whileInView={{ clipPath: 'inset(0% 0 0 0 round 999px 999px 0 0)' }} viewport={inView} transition={{ duration: 1.1, ease: ease.inOut }}>
          <SectionImage src={content ? content.media("campaign").url : images.newsPalace} alt={content ? content.media("campaign").altText : ""} loading="lazy" />
        </InView.div>
        <div className="news__copy">
          <SectionLabel>{content ? content.intro.eyebrow : "The Pratikshya Circle"}</SectionLabel>
          <h2 id="news-title" className="news__title">{content ? content.intro.title : <>Letters from <em>the loom.</em></>}</h2>
          <p>{content ? content.intro.subtitle : "New edits, craft stories and early invitations — once or twice a month, never more. Unsubscribe anytime."}</p>
          {content && <SectionCTA copy={content.intro} />}
        </div>
        <div className="news__form">
          <NewsletterForm id="news-email" />
          <p className="news__fine">{content ? <>{content.text("fine-print").subtitle || content.text("fine-print").title}<SectionCTA copy={content.text("fine-print")} /></> : <>By subscribing you agree to our <Link to="/pages/privacy">privacy policy</Link>.</>}</p>
        </div>
      </div>
    </section>
  );
}
