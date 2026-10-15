import { site } from './content.js';

/* Static content pages for the prototype. Policies are placeholders that the
 * business must replace with its actual terms before launch. */
export const infoPages = {
  'our-story': {
    kicker: 'The House',
    title: 'Our Story',
    lead: 'PRATIKSHYA FASHION is a prototype house of Indian craft — a modern wardrobe built from handlooms, hand embroidery and heirloom jewellery techniques.',
    body: [
      'We design for the many celebrations of an Indian year: a cousin’s mehendi, a Diwali dinner, a Tuesday at the office that deserves a good kurta.',
      'Each product page lists the fabric and technique used, so you always know how a piece was made.',
    ],
  },
  shipping: {
    kicker: 'Client Care',
    title: 'Shipping & Delivery',
    lead: 'We deliver across India. Delivery timelines and charges are confirmed at checkout once your pin code is entered.',
    body: [
      'Made-to-measure and bridal pieces follow a separate production timeline that is shared with you after order confirmation.',
      'This prototype does not process real orders — no delivery estimate shown here is a commitment.',
    ],
  },
  returns: {
    kicker: 'Client Care',
    title: 'Returns & Exchanges',
    lead: 'Return and exchange eligibility depends on the product type. Please read the conditions on each product page before purchase.',
    body: [
      'Customised, made-to-measure and bridal pieces are typically not eligible for returns.',
      'Placeholder policy — replace with the business’s actual returns policy before launch.',
    ],
  },
  authenticity: {
    kicker: 'The House',
    title: 'Authenticity & Craft',
    lead: 'Every product lists its fabric, technique and region of craft so you can make an informed choice.',
    body: [
      'For handloom textiles, look for the weave irregularities that distinguish handwork from power-loom production.',
      'Certification marks (e.g. Silk Mark, Handloom Mark) are shown only when a product carries one.',
    ],
  },
  contact: {
    kicker: 'Client Care',
    title: 'Contact Us',
    lead: `Write to ${site.contact.email} — our team replies ${site.contact.hours}.`,
    body: ['For styling help, include the occasion, date and a few pieces you love. We’ll suggest pairings from the collection.'],
  },
  privacy: {
    kicker: 'Policies',
    title: 'Privacy Policy',
    lead: 'This prototype stores your bag, wishlist and newsletter preferences only in your browser’s local storage.',
    body: ['No personal data is sent to a server. Replace with the business’s full privacy policy before launch.'],
  },
  terms: {
    kicker: 'Policies',
    title: 'Terms of Use',
    lead: 'All products, prices and offers on this site are sample data for demonstration purposes.',
    body: ['Replace with the business’s full terms of use before launch.'],
  },
};
