import { Link } from '../../router/index.jsx';
import { motion } from 'framer-motion';
import { ease } from '../../utils/motion.js';
import { Arrow } from '../ui/ArrowLink.jsx';

export default function MegaMenu({ menu, onNavigate, onMouseEnter, onMouseLeave }) {
  return (
    <motion.div
      className="mega"
      id={`mega-${menu.key}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, transition: { duration: 0.18 } }}
      transition={{ duration: 0.32, ease: ease.out }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mega__inner container">
        <div className="mega__cols">
          {menu.columns.map((col, ci) => (
            <motion.div
              key={col.title}
              className="mega__col"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + ci * 0.05, duration: 0.3 }}
            >
              <p className="mega__title">{col.title}</p>
              <ul>
                {col.links.map((l) => (
                  <li key={l.to + l.label}><Link to={l.to} onClick={onNavigate}>{l.label}</Link></li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
        <Link to={menu.feature.to} className="mega__feature" onClick={onNavigate}>
          <motion.div className="mega__feature-img" initial={{ clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: 0.55, ease: ease.inOut }}>
            <img src={menu.feature.image} alt="" style={{ objectPosition: menu.feature.focal }} />
          </motion.div>
          <div className="mega__feature-txt">
            <span className="mega__kicker">{menu.feature.kicker}</span>
            <span className="mega__ftitle">{menu.feature.title}</span>
            <span className="mega__fcta">Shop now <Arrow /></span>
          </div>
        </Link>
      </div>
    </motion.div>
  );
}
