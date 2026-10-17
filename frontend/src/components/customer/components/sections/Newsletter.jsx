import { SectionImage, SectionCTA } from '../../../storefront/home/HomepageSection';
import { motion } from 'framer-motion';
import NewsletterForm from '../ui/NewsletterForm.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

export default function Newsletter({ content }) {
  /* Database-driven only: without authored content this section renders nothing. */
  if (!content) return null;
  return (
    <section className="news" id="newsletter" aria-labelledby="news-title">
      <div className="container news__inner">
        <InView.div className="news__arch" initial={{ clipPath: 'inset(100% 0 0 0 round 999px 999px 0 0)' }} whileInView={{ clipPath: 'inset(0% 0 0 0 round 999px 999px 0 0)' }} viewport={inView} transition={{ duration: 1.1, ease: ease.inOut }}>
          <SectionImage src={content.media("campaign").url} alt={content.media("campaign").altText || ""} loading="lazy" />
        </InView.div>
        <div className="news__copy">
          <SectionLabel>{content.intro.eyebrow}</SectionLabel>
          <h2 id="news-title" className="news__title">{content.intro.title}</h2>
          <p>{content.intro.subtitle}</p>
          <SectionCTA copy={content.intro} />
        </div>
        <div className="news__form">
          <NewsletterForm id="news-email" />
          <p className="news__fine">{content.text("fine-print").subtitle || content.text("fine-print").title}</p>
        </div>
      </div>
    </section>
  );
}
