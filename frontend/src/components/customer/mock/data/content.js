import { images as I } from '../assets/images.js';

import { site } from './site.js';

/* The house's identity and the announcement rail are a boundary concern:
   see `mock/data/site.js`, this port's own record of both. */
export { site };


/* Hero campaigns — each slide carries its own layout variant. */
export const heroConfig = { autoplayMs: 7000 };

export const heroSlides = [
  {
    id: 'saree',
    label: 'The Saree Edit',
    kicker: 'Collection 01 · Handwoven Silks',
    lines: ['Tradition,', 'Reimagined.'],
    italicLine: 1,
    copy: 'Timeless craftsmanship. Modern expression. Discover pieces made for every celebration.',
    primary: { label: 'Explore Collections', to: '/shop/sarees' },
    secondary: { label: 'Discover Our Story', to: '/pages/our-story' },
    image: I.heroSaree,
    focal: '72% 40%',
    layout: 'left',
  },
  {
    id: 'bridal',
    label: 'The Bridal Edit',
    kicker: 'Collection 02 · Bride & Groom',
    lines: ['Two Hearts,', 'One Heirloom.'],
    italicLine: 1,
    copy: 'Zardozi lehengas and tone-on-tone sherwanis, composed as a pair for the most photographed day of your life.',
    primary: { label: 'Shop the Bride', to: '/shop/the-bride' },
    secondary: { label: 'Shop the Groom', to: '/shop/the-groom' },
    image: I.heroBridal,
    focal: '68% 35%',
    layout: 'panel',
  },
  {
    id: 'festive',
    label: 'Modern Festive',
    kicker: 'Collection 03 · Festive Wardrobe',
    lines: ['Festive,', 'Quietly Modern.'],
    italicLine: 1,
    copy: 'Co-ords, anarkalis and heirloom-inspired jewellery in warm, wearable tones — for every diya-lit evening.',
    primary: { label: 'Explore Festive', to: '/shop/festive' },
    secondary: { label: 'Discover Our Story', to: '/pages/our-story' },
    image: I.heroFestive,
    focal: '45% 40%',
    layout: 'right',
  },
  {
    id: 'jewellery',
    label: 'Royal Jewellery',
    kicker: 'Collection 04 · Jewellery & Essentials',
    lines: ['Gold That', 'Remembers.'],
    italicLine: 1,
    copy: 'Kundan bangles, polki rings and temple jhumkas, finished by hand — made to be layered, lent and handed down.',
    primary: { label: 'Explore Jewellery', to: '/shop/jewellery' },
    secondary: { label: 'Shop Essentials', to: '/shop/essentials' },
    image: I.heroJewellery,
    focal: '8% 50%',
    // Art direction: when the visible image frame is portrait/near-square (tablet, mobile,
    // tall desktop windows) the hero swaps to a portrait shot of the same set-up so the
    // bangles, ring and jhumkas all stay in frame.
    imageTall: I.heroJewelleryTall,
    focalTall: '50% 78%',
    layout: 'split',
  },
  {
    id: 'family',
    label: 'Festive Family',
    kicker: 'Collection 05 · Festive Family',
    lines: ['One Celebration,', 'Every Generation.'],
    italicLine: 1,
    copy: 'Coordinated festive looks for her, for him and for the little ones — in shared tones of blush, ivory and cocoa.',
    primary: { label: 'Discover Festive Styles', to: '/shop/festive' },
    secondary: { label: 'Shop Kids', to: '/shop/kids' },
    image: I.heroFamily,
    focal: '96% 55%',
    layout: 'top',
  },
];

export const jewelleryTypes = [
  { key: 'all', label: 'All' },
  { key: 'necklaces', label: 'Necklaces' },
  { key: 'jhumkas', label: 'Jhumkas' },
  { key: 'bangles', label: 'Bangles' },
  { key: 'rings', label: 'Rings' },
  { key: 'maang-tikka', label: 'Maang Tikka' },
];

export const popularSearches = ['Banarasi saree', 'Anarkali', 'Sherwani', 'Jhumkas', 'Bridal lehenga', 'Kids festive'];
