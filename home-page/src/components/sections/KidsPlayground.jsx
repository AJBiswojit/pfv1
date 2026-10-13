import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { images } from '../../data/index.js';
import { getByDepartment } from '../../services/catalog.js';
import ProductCard from '../product/ProductCard.jsx';
import SectionLabel from '../ui/SectionLabel.jsx';
import Button from '../ui/Button.jsx';
import { inView } from '../../utils/motion.js';
import { InView } from '../ui/InView.jsx';

const spring = { type: 'spring', stiffness: 160, damping: 16 };
const chips = [
  { label: 'Girls', note: '2–11Y', to: '/shop/girls' },
  { label: 'Boys', note: '2–11Y', to: '/shop/boys' },
  { label: 'Festive', note: 'Twirl-ready', to: '/shop/kids-festive' },
];

export default function KidsPlayground() {
  const list = getByDepartment('kids');
  return (
    <section className="kids" aria-labelledby="kids-title">
      <div className="container kids__grid">
        <div className="kids__collage">
          <InView.div className="kids__main" initial={{ opacity: 0, y: 50, rotate: -4 }} whileInView={{ opacity: 1, y: 0, rotate: -1.5 }} viewport={inView} transition={spring} whileHover={{ rotate: 0, scale: 1.01 }}>
            <img src={images.catKids} alt="Two children in festive wear running hand in hand" loading="lazy" />
          </InView.div>
          <InView.div className="kids__mini kids__mini--a" initial={{ opacity: 0, scale: 0.7, rotate: 8 }} whileInView={{ opacity: 1, scale: 1, rotate: 4 }} viewport={inView} transition={{ ...spring, delay: 0.15 }} whileHover={{ rotate: 0, y: -6 }}>
            <Link to="/shop/girls" aria-label="Shop girls"><img src={images.kidsGirl} alt="" loading="lazy" /><span>Girls</span></Link>
          </InView.div>
          <InView.div className="kids__mini kids__mini--b" initial={{ opacity: 0, scale: 0.7, rotate: -10 }} whileInView={{ opacity: 1, scale: 1, rotate: -5 }} viewport={inView} transition={{ ...spring, delay: 0.25 }} whileHover={{ rotate: 0, y: -6 }}>
            <Link to="/shop/boys" aria-label="Shop boys"><img src={images.kidsBoy} alt="" loading="lazy" /><span>Boys</span></Link>
          </InView.div>
          <InView.span className="kids__sticker" aria-hidden="true" initial={{ scale: 0, rotate: -30 }} whileInView={{ scale: 1, rotate: -12 }} viewport={inView} transition={{ ...spring, delay: 0.4 }}>
            made<br />for<br />twirling
          </InView.span>
        </div>

        <div className="kids__body">
          <SectionLabel index="08">Kidswear</SectionLabel>
          <InView.h2 id="kids-title" className="display kids__title" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={spring}>
            Little <em>celebrations.</em>
          </InView.h2>
          <p className="kids__lead">Soft linings, easy buttons and enough swish for the sangeet dance floor.</p>
          <div className="kids__chips">
            {chips.map((c, i) => (
              <InView.div key={c.label} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ ...spring, delay: 0.1 + i * 0.06 }}>
                <Link to={c.to} className="kchip"><strong>{c.label}</strong><span>{c.note}</span></Link>
              </InView.div>
            ))}
          </div>
          <div className="kids__products">
            {list.map((p, i) => (
              <InView.div key={p.id} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ ...spring, delay: 0.2 + i * 0.08 }}>
                <ProductCard product={p} variant="tall" />
              </InView.div>
            ))}
          </div>
          <Button to="/shop/kids">Shop Kids</Button>
        </div>
      </div>
    </section>
  );
}
