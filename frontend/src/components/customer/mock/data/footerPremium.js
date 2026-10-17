/**
 * PRATIKSHYA FASHION · the footer's content, kept out of its presentation.
 *
 * The reference footer asks for four navigation columns of six links, a
 * customer-service rail, and a legal bar that names the instruments the
 * checkout accepts. Three rules govern what this module may say, and they are
 * the rules the port has followed since Phase 2D:
 *
 *   1. NOTHING IS INVENTED. A label's destination comes from the design's own
 *      `footerGroups` when that group already carried the link; the links the
 *      design did not carry resolve against `HOUSE_DESTINATIONS` below, where
 *      every value is a path this application really registers (the router
 *      shim translates them exactly as it translates the design's). A label
 *      with no destination anywhere is dropped by the builder rather than sent
 *      to `href="#"`, and the footer suite asserts the count, so a silent
 *      omission can never survive a run of `npm test`.
 *
 *   2. NOTHING IS CLAIMED THAT THE SHOP CANNOT BACK. The service rail is built
 *      from `config/checkoutConfig.js` and the store's live shipping rules —
 *      free delivery is stated as the delivery methods actually define it, and
 *      a payment mark appears only while the checkout names that instrument.
 *
 *   3. ONE SOURCE PER FACT. The design's group titles and existing destinations
 *      are read, never copied; the additions are the only extra table, and the
 *      reference's exact wording for the brand block stays in `mock/data/site.js`
 *      where the rest of the house's record lives.
 */

import { footerGroups } from './navigation.js';
import { PAYMENT_METHODS } from '../../../../config/checkoutConfig.js';
import { formatPrice } from '../../utils/format.js';

/**
 * The six links the design's footer did not carry, in the design's own
 * vocabulary (the shim owns the translation, so these stay readable next to
 * `footerGroups` above):
 *
 *   · New Arrivals — the house's curated `new-arrivals` collection.
 *   · Festive Collection / Wedding Looks — the festive and bridal rails.
 *   · Gift Cards, Size Guide, Care Instructions, Artisans & Craft,
 *     Sustainability — no page exists for any of them yet, so each one goes to
 *     the page this house does hold for that question: the contact desk for the
 *     three service questions, the story page for the two craft ones. That is
 *     the same treatment the port already gives the design's own
 *     `shipping` / `returns` / `authenticity` pages, and the honest alternative
 *     to a route that 404s.
 */
const HOUSE_DESTINATIONS = {
  'New Arrivals': '/collections/new-arrivals',
  'Gift Cards': '/pages/contact',
  'Festive Collection': '/shop/festive',
  'Wedding Looks': '/shop/wedding',
  'Size Guide': '/pages/contact',
  'Care Instructions': '/pages/contact',
  'Artisans & Craft': '/pages/our-story',
  Sustainability: '/pages/our-story',
};

/** The reference's four columns, in the reference's order. */
const COLUMN_ORDER = [
  ['Shop', ['Women', 'Men', 'Kids', 'Essentials', 'New Arrivals', 'Gift Cards']],
  ['Edits', ['Sarees', 'Bridal', 'Jewellery', 'Kurtis', 'Festive Collection', 'Wedding Looks']],
  ['Client Care', ['Shipping & Delivery', 'Returns & Exchanges', 'Track Your Order', 'Size Guide', 'Care Instructions', 'Contact Us']],
  ['The House', ['Our Story', 'Artisans & Craft', 'Sustainability', 'Authenticity', 'Privacy Policy', 'Terms of Use']],
];

/** One column's links: the design's destination first, this house's second. */
const buildLinks = (group, labels) =>
  labels
    .map((label) => ({
      label,
      to: group?.links.find((link) => link.label === label)?.to ?? HOUSE_DESTINATIONS[label] ?? null,
    }))
    .filter((link) => link.to !== null);

export const footerColumns = COLUMN_ORDER.map(([title, labels]) =>
  ({ title, links: buildLinks(footerGroups.find((group) => group.title === title), labels) }),
);

/** Every navigation link the footer renders, for the suite's assertions. */
export const footerLinkCount = footerColumns.reduce((total, column) => total + column.links.length, 0);

/* ── the customer-service rail ─────────────────────────────────────────────── */

/**
 * The three service items, assembled from the checkout's own rules.
 *
 * `shipping` carries what `DELIVERY_METHODS` says — normal delivery is
 * complimentary at every basket size and standard delivery drops to zero above
 * the store's free-shipping threshold — because "free shipping on prepaid
 * orders" is not this house's policy: the reference's wording is kept as the
 * title, and the condition under it is the checkout's own. When shipping is
 * switched off in the
 * store's settings the item is not rendered: a footer does not promise a
 * service the checkout has stopped offering.
 */
export const careHighlights = ({ shippingEnabled = true, freeShippingThreshold = 0 } = {}) => [
  {
    id: 'support',
    icon: 'headset',
    title: 'Need Help?',
    text: 'We’re here for you',
    link: { label: 'Contact Support', to: '/pages/contact' },
  },
  shippingEnabled
    ? {
        id: 'shipping',
        icon: 'truck',
        title: 'Free Shipping',
        text: `Normal always · standard free at ${formatPrice(freeShippingThreshold)}+`,
      }
    : null,
  {
    id: 'payments',
    icon: 'shield',
    title: 'Secure Payments',
    text: 'Processed by the payment gateway',
  },
].filter(Boolean);

/* ── the payment marks ─────────────────────────────────────────────────────── */

/**
 * The instruments the legal bar may name. Each one declares the checkout
 * method that verifies it, and a mark whose method no longer names it is not
 * rendered — so this list cannot drift ahead of the money path.
 *
 * The reference's five marks all survive that test: the card method's own
 * description reads "Visa · Mastercard · RuPay", and the UPI method's reads
 * "Google Pay · PhonePe · Paytm".
 */
const PAYMENT_MARK_SOURCES = [
  { id: 'visa', label: 'Visa', method: 'card' },
  { id: 'mastercard', label: 'Mastercard', method: 'card' },
  { id: 'upi', label: 'UPI', method: 'upi' },
  { id: 'paytm', label: 'Paytm', method: 'upi' },
  { id: 'rupay', label: 'RuPay', method: 'card' },
];

/** Everything the checkout says about one method: its name and its instruments. */
const methodNames = (id) => {
  const method = PAYMENT_METHODS.find((entry) => entry.id === id);
  return method ? [method.label, method.description].join(' · ') : '';
};

/**
 * A mark survives only while the checkout names its instrument — and the
 * `verified` flag below is what the footer's own suite re-checks, so a mark can
 * never be added here without the money path agreeing with it.
 */
export const paymentMarks = PAYMENT_MARK_SOURCES
  .map((mark) => ({ ...mark, via: PAYMENT_METHODS.find((entry) => entry.id === mark.method)?.label ?? '', verified: methodNames(mark.method).includes(mark.label) }))
  .filter((mark) => mark.verified);

export default { footerColumns, footerLinkCount, careHighlights, paymentMarks };
