import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { images } from '../../data/index.js';
import NewsletterForm from '../ui/NewsletterForm.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import { ease, inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

export default function Newsletter() {
  return (
    <section className="news" id="newsletter" aria-labelledby="news-title">
      <div className="container news__inner">
        <InView.div className="news__arch" initial={{ clipPath: 'inset(100% 0 0 0 round 999px 999px 0 0)' }} whileInView={{ clipPath: 'inset(0% 0 0 0 round 999px 999px 0 0)' }} viewport={inView} transition={{ duration: 1.1, ease: ease.inOut }}>
          <img src={images.newsPalace} alt="" loading="lazy" />
        </InView.div>
        <div className="news__copy">
          <SectionLabel>The Pratikshya Circle</SectionLabel>
          <h2 id="news-title" className="news__title">Letters from <em>the loom.</em></h2>
          <p>New edits, craft stories and early invitations — once or twice a month, never more. Unsubscribe anytime.</p>
        </div>
        <div className="news__form">
          <NewsletterForm id="news-email" />
          <p className="news__fine">By subscribing you agree to our <Link to="/pages/privacy">privacy policy</Link>.</p>
        </div>
      </div>
    </section>
  );
}
