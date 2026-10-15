import { Link } from '../../router/index.jsx';

// Official PRATIKSHYA FASHION mark (supplied artwork, trimmed + exported from uploads/pf.png).
const MARK_SRC = '/aarna-design/pratikshya-logo.webp';
const MARK_RATIO = 237 / 288; // width / height of the exported file

/** The brand mark. Decorative wherever it sits next to the written name. */
export function BrandMark({ height = 46, className = 'logo__mark', alt = '' }) {
  return (
    <img
      className={className}
      src={MARK_SRC}
      alt={alt}
      width={Math.round(height * MARK_RATIO)}
      height={height}
      decoding="async"
      draggable="false"
    />
  );
}

/** Header / menu lockup: brand mark + PRATIKSHYA FASHION wordmark. */
export default function Logo({ compact = false, onClick }) {
  return (
    <Link to="/" className={compact ? 'logo logo--compact' : 'logo'} aria-label="PRATIKSHYA FASHION — home" onClick={onClick}>
      <BrandMark height={compact ? 38 : 46} />
      <span className="logo__text">
        <span className="logo__word">PRATIKSHYA</span>
        <span className="logo__sub">Fashion</span>
      </span>
    </Link>
  );
}
