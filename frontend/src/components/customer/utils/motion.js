// Shared easing + timing tokens for the motion system.
export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  soft: [0.33, 1, 0.68, 1],
};
export const dur = { fast: 0.35, base: 0.6, slow: 0.95, reveal: 1.15 };
// Scroll reveals replay on re-entry (see components/ui/InView.jsx).
// `margin` is the trigger line (12% above the bottom edge); `resetMargin` is how far
// outside the viewport an element must travel before its reveal is reset.
export const inView = { once: false, margin: '0px 0px -12% 0px' };
export const resetMargin = '20% 0px 20% 0px';
