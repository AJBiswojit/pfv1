import { useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Editorial tooltip for the collapsed portal rail.
 *
 * Portalled to document.body so overflow:auto on the nav does not clip it.
 * Disabled when the sidebar is expanded — labels are already visible.
 */
export default function RailTooltip({
  label,
  enabled = false,
  className = "flex w-full justify-center",
  children,
}) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const show = () => {
    if (!enabled || !label) return;
    const node = anchorRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setCoords({ top: rect.top + rect.height / 2, left: rect.right + 10 });
    setOpen(true);
  };

  const hide = () => setOpen(false);

  if (!enabled) return children;

  return (
    <>
      <span
        ref={anchorRef}
        className={className}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocusCapture={show}
        onBlurCapture={hide}
      >
        {children}
      </span>
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              aria-hidden="true"
              className="pointer-events-none fixed z-[80] rounded-md border border-pf-gold/30 bg-pf-wine px-2.5 py-1.5 font-ui text-[10.5px] font-medium tracking-[.08em] text-pf-ivory shadow-[0_10px_28px_rgb(20_2_8/0.4)]"
              style={{ top: coords.top, left: coords.left, transform: "translateY(-50%)" }}
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </>
  );
}
