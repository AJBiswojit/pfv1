import { Link } from 'react-router-dom';
import { cx } from '../../utils/format.js';

export function Arrow({ className }) {
  return (
    <svg className={cx('arrow', className)} width="22" height="10" viewBox="0 0 22 10" fill="none" aria-hidden="true">
      <path d="M0 5h20M16 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Uppercase tracked link with an animated arrow. */
export default function ArrowLink({ to, children, className, light, onClick }) {
  return (
    <Link to={to} onClick={onClick} className={cx('arrow-link', light && 'arrow-link--light', className)}>
      <span>{children}</span>
      <Arrow />
    </Link>
  );
}
