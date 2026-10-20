import React from 'react';
export const motion = new Proxy({}, {
  get: (_, prop) => {
    const Comp = (props) => {
      const { initial, animate, exit, transition, variants, whileInView, viewport, layout, ...rest } = props;
      return React.createElement(prop, rest, props.children);
    };
    Comp.displayName = `motion.${prop}`;
    return Comp;
  },
});
export const MotionConfig = ({ children }) => React.createElement(React.Fragment, null, children);
export const AnimatePresence = ({ children }) => React.createElement(React.Fragment, null, children);
export const LayoutGroup = ({ children }) => React.createElement(React.Fragment, null, children);
export const useScroll = () => ({ scrollYProgress: { get: () => 0, set: () => {}, on: () => ({ unsubscribe: () => {} }), off: () => {}, onChange: () => () => {} } });
export const useTransform = (val, a, b) => ({ get: () => 0 });
export const useReducedMotion = () => false;
export const useInView = () => true;
export const useMotionValue = (v) => ({ get: () => v, set: () => {} });
export const useSpring = (v) => v;
export const useAnimation = () => ({ start: () => {}, stop: () => {} });
export const motionValue = (v) => ({ get: () => v, set: () => {}, on: () => {} });
