import { Link } from 'react-router-dom';
import { cx } from '../../utils/format.js';

/** variant: solid | ghost | light | outline-light */
export default function Button({ to, variant = 'solid', className, children, ...rest }) {
  const cls = cx('btn', `btn--${variant}`, className);
  if (to) return <Link to={to} className={cls} {...rest}><span>{children}</span></Link>;
  return <button type="button" className={cls} {...rest}><span>{children}</span></button>;
}
