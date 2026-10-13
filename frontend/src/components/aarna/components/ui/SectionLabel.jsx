import { cx } from '../../utils/format.js';
export default function SectionLabel({ index, children, light, className }) {
  return (
    <p className={cx('label', light && 'label--light', className)}>
      {index && <span className="label__index">{index}</span>}
      <span>{children}</span>
    </p>
  );
}
