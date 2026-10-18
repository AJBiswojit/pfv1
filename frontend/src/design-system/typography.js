/**
 * PRATIKSHYA FASHION — Atelier Typography
 *
 * Three typefaces carry the brand:
 *   display — Cormorant Garamond, used for every headline and product name.
 *   ui      — Instrument Sans, used for eyebrows, navigation, meta and prices.
 *   accent  — Playfair Display, used for pull-quotes and campaign accent moments.
 *             Replaces Cormorant Infinitum: Playfair Display shares the same
 *             high-fashion editorial character but has a more legible contrast
 *             ratio at screen sizes below 48 px.
 *
 * Headline weights are always `font-light`; the italic accent word is the only
 * emphasis device. All scales below are lifted verbatim from the Phase 1
 * landing page.
 */

export const fonts = {
  display: "font-display",
  ui: "font-ui",
  accent: "font-accent",
};

export const fontFamilies = {
  display: '"Cormorant Garamond", Georgia, serif',
  ui: '"Instrument Sans", system-ui, sans-serif',
  accent: '"Playfair Display", Georgia, serif',
};

/* ------------------------------------------------------------------ */
/* Accent scale (Playfair Display — pull-quotes & campaign moments)    */
/* ------------------------------------------------------------------ */

export const accent = {
  /** Large pull-quote or campaign statement. */
  pullquote: "font-accent text-2xl md:text-4xl font-normal italic leading-snug tracking-tight",
  /** Inline accent phrase inside a serif paragraph. */
  inline: "font-accent font-normal italic",
  /** Small decorative caption beneath imagery. */
  caption: "font-accent text-sm font-normal italic",
};

/* ------------------------------------------------------------------ */
/* Display scale (accent serif, font-light, tracking-tight)            */
/* ------------------------------------------------------------------ */

export const display = {
  /** Hero headline — the largest type on the site. */
  hero: "font-accent text-6xl md:text-[9rem] lg:text-[11rem] font-light leading-[0.82] tracking-tight",
  /** Full-bleed campaign band headline. */
  campaign: "font-accent text-4xl md:text-7xl lg:text-8xl font-light tracking-tight",
  /** Centred brand manifesto headline. */
  manifesto: "font-accent text-4xl md:text-6xl lg:text-8xl font-light tracking-tight",
  /** Headline of a dark editorial section. */
  editorial: "font-accent text-4xl md:text-6xl lg:text-7xl font-light tracking-tight",
  /** Headline of a feature section. */
  feature: "font-accent text-3xl md:text-6xl lg:text-7xl font-light tracking-tight",
  /** Standard section headline. */
  section: "font-accent text-4xl md:text-7xl font-light tracking-tight",
  /** Quiet section headline above a grid. */
  subsection: "font-accent text-3xl md:text-5xl font-light tracking-tight",
};

/* ------------------------------------------------------------------ */
/* Heading scale (accent serif, sub-display)                           */
/* ------------------------------------------------------------------ */

export const heading = {
  /** Panel headline beside an image (fabric stories, collection tiles). */
  xl: "font-accent text-3xl md:text-5xl font-light",
  /** Editorial article title. */
  lg: "font-accent text-3xl md:text-4xl font-light",
  /** Caption headline laid over imagery. */
  md: "font-accent text-2xl md:text-4xl font-light",
  /** Campaign sub-headline. */
  sm: "font-accent text-xl md:text-3xl font-light",
  /** Product name. */
  product: "font-accent text-base md:text-lg font-light",
  /** Footer brand mark. */
  footer: "font-accent text-xl",
};

/* ------------------------------------------------------------------ */
/* Eyebrows, labels and navigation (sans, uppercase, letter-spaced)    */
/* ------------------------------------------------------------------ */

export const eyebrow = {
  /** Hero eyebrow — the widest tracking in the system. */
  hero: "font-ui text-[10px] uppercase tracking-[0.4em]",
  /** Section eyebrow. */
  section: "font-ui text-[10px] uppercase tracking-[.3em]",
  /** Editorial article eyebrow. */
  editorial: "font-ui text-[10px] uppercase tracking-[.25em]",
  /** Inline label above a group of links. */
  label: "font-ui text-[10px] uppercase tracking-[.2em]",
  /**
   * The same micro-label at display weight. The page canvas is already set in
   * Cormorant, so omitting the font utility is what makes it serif. Used for
   * in-page group labels and footer column heads.
   */
  labelDisplay: "text-[10px] uppercase tracking-[.2em]",
  /** Centred brand caption. */
  caption: "font-ui text-xs uppercase tracking-[.3em]",
};

export const nav = {
  brand: "text-xl md:text-2xl font-light tracking-tight",
  link: "font-ui text-[10px] uppercase tracking-[0.15em]",
};

/* ------------------------------------------------------------------ */
/* Body copy                                                           */
/* ------------------------------------------------------------------ */

export const body = {
  /** Hero / manifesto lead paragraph. */
  lead: "font-ui text-sm md:text-base leading-relaxed",
  /** Default sans paragraph. */
  base: "font-ui text-sm",
  /** Editorial paragraph with generous leading. */
  editorial: "font-ui text-sm leading-[1.8]",
  /** Longest-form paragraph (brand story). */
  story: "font-ui text-sm md:text-base leading-[1.9]",
  /** Serif paragraph used inside the fabric panel. */
  serif: "text-sm leading-[1.85]",
  /** Meta line under imagery. */
  caption: "font-ui text-xs",
  /** The same meta line at display weight (captions on dark collection tiles). */
  captionDisplay: "text-xs",
  /** Smallest legible line (legal, tile captions). */
  micro: "font-ui text-[10px]",
};

/* ------------------------------------------------------------------ */
/* Commerce typography                                                 */
/* ------------------------------------------------------------------ */

export const price = {
  row: "flex items-center gap-3 font-ui text-xs",
  current: "text-ink font-medium",
  original: "text-ash line-through",
  discount: "text-accent",
};

/** Uppercase micro-label used by badges. */
export const badge = "text-[9px] uppercase tracking-widest";

/* ------------------------------------------------------------------ */
/* Campaign / editorial scale (Phase 1 — additive)                      */
/* ------------------------------------------------------------------ */

/**
 * The storefront campaign typography: editorial serif headlines with an
 * italic closing line, and a narrow uppercase sans for kickers, labels and
 * arrow links.
 *
 * Typeface reality — IMPORTANT, DOCUMENTED LIMITATION:
 * Project B (the visual source of truth for the storefront) sets its
 * supporting text in `Manrope Variable`. This application does **not** load
 * Manrope: `index.html` requests Cormorant Garamond, Instrument Sans and
 * Playfair Display only, and Phase 1 forbids adding font packages. The
 * campaign scale therefore uses the *existing* families — Cormorant Garamond
 * for display (`font-display`) and Instrument Sans for supporting text
 * (`font-ui`). Both are already loaded, so nothing is downloaded twice.
 * Manrope is a deliberate, recorded gap; see `docs/PHASE-1-DESIGN-FOUNDATION.md`
 * at the repository root.
 */
export const campaign = {
  /** Campaign kicker / eyebrow above a headline. */
  kicker: "font-ui text-[11px] font-semibold uppercase tracking-[0.22em]",
  /** Micro label (SectionLabel at its smallest). */
  label: "font-ui text-[11px] font-semibold uppercase tracking-[0.22em]",
  /** Arrow-link / button lettering. */
  action: "font-ui text-[11px] font-bold uppercase tracking-[0.2em]",

  /** Editorial display serif, roman and italic. */
  display: "font-display font-normal leading-[0.94] tracking-[-0.02em]",
  /** The closing line of a campaign headline is set in italic. */
  displayItalic: "italic",
  displaySizes: {
    /** Full-bleed hero headline. */
    xl: "text-[clamp(3.1rem,7.4vw,7.2rem)]",
    /** `right` layout headline. */
    l: "text-[clamp(2.8rem,5.8vw,5.8rem)]",
    /** `split` / `top` layout headline. */
    m: "text-[clamp(2.8rem,5.6vw,5.6rem)]",
    /** Stacked mobile headline. */
    s: "text-[clamp(2.6rem,12vw,3.4rem)]",
  },

  /** Supporting copy under a campaign headline. */
  lead: "font-ui text-[1.0625rem] leading-[1.65]",
  /** The same line in the tighter `top` layout. */
  leadCompact: "font-ui text-[0.9375rem] leading-[1.65]",
  /** Editorial measure for a campaign paragraph. */
  measure: "max-w-[40ch]",
};

/* ------------------------------------------------------------------ */
/* Staff Portal scale (Phase 2 — Admin / Super Admin / Employee)       */
/* ------------------------------------------------------------------ */

/**
 * The ONE staff type hierarchy. Editorial Cormorant Garamond at weight
 * 500 (never 300 — too thin at operational sizes, and no local 300 cut
 * exists) with lining figures; Instrument Sans for everything
 * operational. Nothing informational below 11px. Enforced jointly by
 * these semantic classes in shared staff components and the `.pf-staff`
 * floor in `src/index.css`.
 */
export const staff = {
  /** Page heading / dashboard greeting. */
  pageTitle: "font-display text-[32px] md:text-[44px] font-medium leading-[1.05] tracking-tight",
  /** Panel / section heading. */
  sectionTitle: "font-display text-[24px] md:text-[28px] font-medium leading-[1.12] tracking-tight",
  /** KPI / hero metric value. */
  metricValue: "font-display text-[36px] md:text-[42px] font-medium leading-none tracking-tight tabular-nums",
  /** Chart centre / panel total. */
  panelValue: "font-display text-[28px] md:text-[32px] font-medium leading-none tabular-nums",
  /** Eyebrow / kicker (accessible gold-brown, never pale gold). */
  eyebrow: "font-ui text-[11px] font-semibold uppercase tracking-[0.22em]",
  /** KPI / field label. */
  label: "font-ui text-[12px] font-semibold uppercase tracking-[0.14em]",
  /** Navigation item. */
  navItem: "font-ui text-[13.5px] font-medium leading-snug",
  /** Navigation group heading. */
  navGroup: "font-ui text-[11px] font-semibold uppercase tracking-[0.18em]",
  /** Primary body / table text. */
  body: "font-ui text-sm leading-relaxed",
  /** Secondary / supporting information. */
  secondary: "font-ui text-[13px] leading-relaxed",
  /** Captions, hints, chart legend text. */
  caption: "font-ui text-[12px] leading-relaxed",
  /** Status badge. */
  badge: "font-ui text-[11px] font-semibold uppercase tracking-[0.08em]",
  /** Chart axis minimum (effective rendered size). */
  chartAxis: "font-ui text-[11px]",
  /** Buttons. */
  button: "font-ui text-[13px] font-semibold uppercase tracking-[0.12em]",
  buttonSmall: "font-ui text-[12px] font-semibold uppercase tracking-[0.1em]",
};

export const typography = {
  fonts,
  fontFamilies,
  accent,
  display,
  heading,
  eyebrow,
  nav,
  body,
  price,
  badge,
  campaign,
  staff,
};

export default typography;
