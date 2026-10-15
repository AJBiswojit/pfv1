import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { useShop } from '../../state/ShopContext.jsx';
import { useUI } from '../../state/UIContext.jsx';
import { cx } from '../../utils/format.js';

export default function WishlistButton({ product, className, withLabel = false }) {
  const { isWished, toggleWish } = useShop();
  const { toast } = useUI();
  const on = isWished(product.id);
  return (
    <button
      type="button"
      className={cx('wish', on && 'is-on', withLabel && 'wish--label', className)}
      aria-pressed={on}
      aria-label={on ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
      onClick={(e) => {
        e.preventDefault();
        toggleWish(product.id);
        toast(on ? 'Removed from wishlist' : 'Saved to wishlist');
      }}
    >
      <motion.span key={String(on)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} style={{ display: 'inline-flex' }}>
        <Heart size={16} strokeWidth={1.5} fill={on ? 'currentColor' : 'none'} />
      </motion.span>
      {withLabel && <span>{on ? 'Saved' : 'Wishlist'}</span>}
    </button>
  );
}
