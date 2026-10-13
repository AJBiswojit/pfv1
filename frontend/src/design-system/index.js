/**
 * PRATIKSHYA FASHION — Atelier Design System
 *
 * Single entry point for tokens and components.
 *
 *   import { AtelierSection, EditorialHeading, colors } from "@/design-system";
 *
 * See docs/PRATIKSHYA-DESIGN-SYSTEM.md for usage rules and restrictions.
 */

/* Tokens */
export {
  default as tokens,
  colors,
  colorClasses,
  campaign,
  campaignClasses,
  tones,
  radius,
  shadows,
  aspects,
  overlays,
  dotGrid,
  imageTreatment,
} from "./tokens";

/* The campaign type scale (`typography.campaign`) and motion tokens
   (`motionTokens.campaign`) stay namespaced inside their own modules so the
   single `campaign` export above is unambiguously the palette. */

export {
  default as typography,
  fonts,
  fontFamilies,
  display,
  heading,
  eyebrow,
  nav,
  body,
  price,
  badge,
} from "./typography";

export {
  default as spacing,
  pagePadding,
  rhythm,
  container,
  gap,
  grid,
  header,
} from "./spacing";

export {
  default as motionTokens,
  duration,
  durationClass,
  distance,
  fadeUp,
  enter,
  pageTransition,
  useReveal,
  useEnter,
  usePageTransition,
  transition,
  zoom,
} from "./motion";

/* Layout */
export { default as Container } from "./components/Container";
export { default as AtelierSection } from "./components/AtelierSection";
export { default as PageHeader } from "./components/PageHeader";
export { default as PageTransition } from "./components/PageTransition";

/* Typography */
export { default as EditorialHeading } from "./components/EditorialHeading";
export { default as Accent } from "./components/Accent";
export { default as Rule } from "./components/Rule";
export { default as Breadcrumb } from "./components/Breadcrumb";

/* Feedback */
export { default as LoadingState } from "./components/LoadingState";
export { default as EmptyState } from "./components/EmptyState";
export { default as ErrorState } from "./components/ErrorState";
export { default as ProductGridSkeleton } from "./components/ProductGridSkeleton";

/* Actions and markers */
export { default as AtelierButton } from "./components/AtelierButton";
export { default as AtelierBadge } from "./components/AtelierBadge";

/* Media and commerce */
export { default as MediaFrame } from "./components/MediaFrame";
export { default as ProductCard, formatPrice, discountPercent } from "./components/ProductCard";

/* Campaign primitives (Phase 1 — additive)
   Editorial reveals, the arrow link and the section label. None of them
   introduces a global class name, so they are safe on any surface. */
export { default as InView, useReplayInView } from "./components/InView";
export { default as MaskReveal, LineReveal, FadeUp } from "./components/Reveal";
export { default as ArrowLink, Arrow } from "./components/ArrowLink";
export { default as SectionLabel } from "./components/SectionLabel";

/* Behaviour hooks (Phase 1 — additive). Read-only or self-restoring: they
   never mutate document state they did not set themselves. */
export { default as useMediaQuery, matchesMediaQuery } from "./hooks/useMediaQuery";
export { default as useScrolled } from "./hooks/useScrolled";
export { default as useLockBody } from "./hooks/useLockBody";
export { default as useFocusTrap } from "./hooks/useFocusTrap";
export { default as useEscape } from "./hooks/useEscape";

/* Branding — single canonical rendering seam for the PRATIKSHYA FASHION mark */
export {
  default as Brand,
  BrandLink,
  DarkBrand,
} from "./components/Brand";
