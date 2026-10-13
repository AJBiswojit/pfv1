import { useState } from 'react';
import { cx } from '../../utils/format.js';

/** Image with fixed-ratio wrapper (no layout shift), lazy loading and fade-in. */
export default function Img({ src, alt = '', ratio, focal = '50% 50%', className, eager = false, style, imgStyle, ...rest }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cx('img', loaded && 'is-loaded', className)} style={{ aspectRatio: ratio, ...style }} {...rest}>
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        style={{ objectPosition: focal, ...imgStyle }}
      />
    </div>
  );
}
