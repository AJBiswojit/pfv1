import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { announcements } from '../../data/index.js';
import { load, save } from '../../services/storage.js';

export default function AnnouncementBar() {
  const [hidden, setHidden] = useState(() => load('storefront:announce', null, 'session') === 'off');
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (hidden || paused || announcements.length < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % announcements.length), 4500);
    return () => clearInterval(t);
  }, [hidden, paused]);

  if (hidden) return null;
  return (
    <div className="announce" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="announce__track" aria-live="off">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
          >
            {announcements[i]}
          </motion.p>
        </AnimatePresence>
      </div>
      <button
        type="button"
        className="announce__close"
        aria-label="Dismiss announcement"
        onClick={() => { save('storefront:announce', 'off', 'session'); setHidden(true); }}
      >
        <X size={13} />
      </button>
    </div>
  );
}
