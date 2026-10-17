/**
 * PRATIKSHYA FASHION — PHASE 2D · the house's record and the announcement rail.
 *
 * ADAPTED AT THE BOUNDARY — and the single source of both. The design's
 * `mock/data/content.js` carried a prototype `site` block and three sample
 * announcements; that sheet now points here (`export { site } from './site.js'`),
 * so every ported component keeps reading the same names from the same barrel
 * while the values come from one place a reviewer can check.
 *
 * WHAT IS CARRIED OVER, AND WHY
 *
 *   · the brand's own language — name, tagline, description, and the city in
 *     the footer's contact block. This is the house this application sells for,
 *     and the design's wording for it is the approved wording. Carried verbatim.
 *
 * WHAT IS NOT CARRIED OVER
 *
 *   · `contact.email`: the design's is a reserved placeholder domain
 *     (`care@…example`), not an address. This application's business record
 *     holds no support address yet, so the field is `null` and the ported footer
 *     renders no mailto link at all rather than one that cannot receive.
 *   · `contact.hours`: care hours the application does not hold. Same treatment.
 *   · `social`: the design's three links point at a platform's home page, not
 *     at this house's profile. An unset profile is not a link — so the rail
 *     below carries the five platforms the house has drawn in its footer, each
 *     with `href: null` until the profile exists. The footer renders the gold
 *     mark for every entry (that is the reference's composition) and renders an
 *     ANCHOR for none of them while `href` is null: nothing here points at an
 *     account this house does not own, and filling one field in this table is
 *     the whole job of publishing it.
 *   · the design's second announcement advertises its sample offer ("sample
 *     offer details below") — prototype copy about prototype data.
 *
 * THE ANNOUNCEMENT RAIL is kept to what this application can corroborate:
 * delivery, with timelines confirmed where they are actually calculated — the
 * checkout, where the shipping rules are applied. When the offer register holds
 * an active offer, the offer band announces it from the register's own figures;
 * the rail does not repeat a second-hand version of them.
 *
 * WHEN THE RECORD GROWS: fill these fields from the business/store section of
 * this application's settings record (it ships them empty today —
 * `SETTINGS_DEFAULTS` in `services/settingsRepository.js`). Every ported header,
 * drawer and footer picks the change up here, in one place.
 */

export const site = {
  brand: "PRATIKSHYA FASHION",
  tagline: "House of Indian Craft",
  description:
    "Sarees, bridal couture, jewellery and everyday essentials — made with India’s craft communities and designed for a modern life of celebrations.",
  contact: {
    email: null,
    hours: null,
    city: "Bhubaneswar, India",
  },
  /**
   * The footer's social rail. `href` is the ONLY thing standing between a
   * profile and this page: while it is null the mark is drawn, dimmed and
   * labelled, and carries no anchor. Set it from the business record in
   * `settingsRepository` (which ships `customer.supportPhone` / `supportEmail`
   * empty today) or from the published profile URL when the house owns one.
   */
  social: [
    { key: "instagram", label: "Instagram", href: null },
    { key: "facebook", label: "Facebook", href: null },
    { key: "youtube", label: "YouTube", href: null },
    { key: "pinterest", label: "Pinterest", href: null },
    { key: "whatsapp", label: "WhatsApp", href: null },
  ],
};

/**
 * The rotating rail. One line, and it is one this shop can stand behind.
 */
export const announcements = [
  "Delivery across India · timelines confirmed at checkout",
];
