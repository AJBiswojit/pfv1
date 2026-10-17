import { discountPct, formatPrice, cx } from '../../utils/format.js';
export default function Price({ price, compareAt, large, className }) {
  const off = discountPct(price, compareAt);
  return (
    <p className={cx('price', large && 'price--lg', className)}>
      <span className="price__now">{formatPrice(price)}</span>
      {off > 0 && (
        <>
          <s className="price__was" aria-label={`Was ${formatPrice(compareAt)}`}>{formatPrice(compareAt)}</s>
          <span className="price__off">{off}% off</span>
        </>
      )}
    </p>
  );
}
