/**
 * PRATIKSHYA FASHION · the footer's own artwork.
 *
 * Four small groups of hand-drawn marks, all inline SVG so they stay crisp at
 * any density and inherit the footer's gold:
 *
 *   · `LotusMark`   — the eight-petal lotus line drawing that opens the
 *                     newsletter panel and closes the legal bar.
 *   · `Sparkle`     — the four-point gold star that sits on the hairline
 *                     dividers, exactly where the reference places it.
 *   · `SocialGlyph` — the five platform glyphs the footer's rail offers. The
 *                     repository carries no brand-icon set, so these are drawn
 *                     here on the reference's 24px grid: consistent optical
 *                     size, one stroke weight, `currentColor` throughout.
 *   · `PaymentMark` — the checkout's accepted instruments. Each is the
 *                     instrument's NAME set as a wordmark (plus the two-circle
 *                     device for Mastercard); no official logo file exists in
 *                     this repository, so none is imitated beyond a word.
 */

const stroked = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/** The lotus: five petals, an inner petal, and the small foot flourish. */
export function LotusMark({ size = 48, title = null, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={(size * 56) / 64}
      viewBox="0 0 64 56"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <g {...stroked} strokeWidth="1.35">
        <path d="M32 7c-5.6 8-6.6 18.2-2.4 26.4.9 1.8 2.4 2.8 2.4 2.8s1.5-1 2.4-2.8C36.6 25.2 37.6 15 32 7Z" />
        <path d="M32 36.2c-9-1.4-15.6-7.8-18-16.6 8.4-.4 15.6 5.2 18 16.6Z" />
        <path d="M32 36.2c9-1.4 15.6-7.8 18-16.6-8.4-.4-15.6 5.2-18 16.6Z" />
        <path d="M32 36.2c-6.4 2.6-13.6 2.2-19.6-1.6 5.6-3.6 13.2-3 19.6 1.6Z" />
        <path d="M32 36.2c6.4 2.6 13.6 2.2 19.6-1.6-5.6-3.6-13.2-3-19.6 1.6Z" />
        <path d="M32 40v8" />
        <path d="M32 45c-3 1.4-5.6 1-8-1.2 2.8-1 5.4-.6 8 1.2Z" />
        <path d="M32 45c3 1.4 5.6 1 8-1.2-2.8-1-5.4-.6-8 1.2Z" />
      </g>
      <circle cx="32" cy="30.5" r="1.5" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

/** The four-point sparkle that marks a divider. */
export function Sparkle({ size = 13 }) {
  return (
    <svg
      className="sparkle"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 1c1 6.2 3.8 9 10 10-6.2 1-9 3.8-10 10-1-6.2-3.8-9-10-10 6.2-1 9-3.8 10-10Z"
        fill="currentColor"
      />
    </svg>
  );
}

/* ── social ─────────────────────────────────────────────────────────────────── */

const SOCIAL_PATHS = {
  instagram: (
    <g>
      <rect x="3.4" y="3.4" width="17.2" height="17.2" rx="5" {...stroked} />
      <circle cx="12" cy="12" r="4" {...stroked} />
      <circle cx="17" cy="7" r="1.1" fill="currentColor" />
    </g>
  ),
  facebook: (
    <path
      d="M13.5 21v-7.5h2.5l.4-2.9h-2.9V8.9c0-.8.2-1.4 1.4-1.4h1.6V4.8c-.3 0-1.3-.1-2.5-.1-2.4 0-4 1.5-4 4.1v1.8H7.8v2.9h2.2V21z"
      fill="currentColor"
    />
  ),
  youtube: (
    <g>
      <rect x="2.6" y="5.4" width="18.8" height="13.2" rx="4.2" {...stroked} />
      <path d="M10.4 9.1l5.2 2.9-5.2 2.9z" fill="currentColor" />
    </g>
  ),
  pinterest: (
    <g>
      <circle cx="12" cy="12" r="9.1" {...stroked} />
      <path d="M10.1 18.7c.6-2.1 1.6-6.1 1.6-6.1M9.5 9.2c-.3-1.7 1-3.3 3-3.5 2.2-.2 3.8 1.2 3.8 3.1 0 2.4-1.5 4.6-3.4 4.6-.9 0-1.6-.5-1.8-1.2" {...stroked} strokeWidth="1.3" />
    </g>
  ),
  whatsapp: (
    <g>
      <path d="M3.7 20.3l1.2-3.9a8.4 8.4 0 1 1 3.3 3.3l-4.5.6Z" {...stroked} strokeWidth="1.35" />
      <path
        d="M9.2 8.6c.2-.5.5-.6.8-.6h.5c.2 0 .5 0 .6.4l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.2-.2.4 0 .6a6.6 6.6 0 0 0 2.2 1.9c.2.1.4.1.6-.1l.4-.5c.2-.2.4-.2.6-.1l1.3.6c.2.1.4.2.4.5 0 .7-.7 1.4-1.5 1.4-1.4.1-2.9-.6-4.3-1.8-1.3-1.3-2.1-2.8-2-4 0-.5.1-1.1.3-1.2Z"
        fill="currentColor"
      />
    </g>
  ),
};

/** One glyph per platform. An unknown key renders nothing rather than a guess. */
export function SocialGlyph({ platform, size = 19 }) {
  const glyph = SOCIAL_PATHS[platform];
  if (!glyph) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {glyph}
    </svg>
  );
}

/* ── payment ────────────────────────────────────────────────────────────────── */

/**
 * The instrument marks the footer may name. Each is the brand's own word, set
 * in the house's sans, on a light chip — the reference's treatment — plus the
 * two-circle device for Mastercard, which is geometry rather than a drawing of
 * a logo file.
 */
const PAYMENT_MARKS = {
  visa: {
    viewBox: "0 0 46 20",
    body: (
      <text x="23" y="15" textAnchor="middle" fontSize="12.5" fontStyle="italic" fontWeight="700" fill="#1a1f71" letterSpacing="0.6">
        VISA
      </text>
    ),
  },
  mastercard: {
    viewBox: "0 0 34 20",
    body: (
      <>
        <circle cx="13.2" cy="10" r="7" fill="#eb001b" />
        <circle cx="20.8" cy="10" r="7" fill="#f79e1b" fillOpacity="0.92" />
      </>
    ),
  },
  upi: {
    viewBox: "0 0 48 20",
    body: (
      <>
        <path d="M3 4h6.5L7 16.5H0.5z" fill="#f37021" />
        <text x="24" y="15" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#2f3234" letterSpacing="0.8">
          UPI
        </text>
        <path d="M38.5 4H45L41.5 16.5H35z" fill="#009c3d" />
      </>
    ),
  },
  paytm: {
    viewBox: "0 0 46 20",
    body: (
      <text x="23" y="15" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1a1f71">
        Pay
        <tspan fill="#00b9f1">tm</tspan>
      </text>
    ),
  },
  rupay: {
    viewBox: "0 0 50 20",
    body: (
      <>
        <circle cx="17" cy="10" r="8" fill="#d32011" />
        <circle cx="33" cy="10" r="8" fill="#0f9d3f" fillOpacity="0.94" />
        <text x="25" y="13.4" textAnchor="middle" fontSize="8.4" fontWeight="700" fill="#ffffff" letterSpacing="0.2">
          RuPay
        </text>
      </>
    ),
  },
};

/**
 * A payment chip. The mark is drawn from the instrument's own colours and
 * letterforms — no third-party logo file is fetched and none is pretended to.
 * The accessible name comes from the `.sr-only` text the footer puts beside it,
 * so the artwork itself stays `aria-hidden`.
 */
export function PaymentMark({ id }) {
  const mark = PAYMENT_MARKS[id];
  if (!mark) return null;
  return (
    <svg viewBox={mark.viewBox} aria-hidden="true" focusable="false">
      {mark.body}
    </svg>
  );
}

export default { LotusMark, Sparkle, SocialGlyph, PaymentMark };
