import { images as I } from '../assets/images.js';

/* Brand + site configuration (sample values for the prototype). */
export const site = {
  brand: 'PRATIKSHYA FASHION',
  tagline: 'House of Indian Craft',
  description:
    'Sarees, bridal couture, jewellery and everyday essentials — made with India’s craft communities and designed for a modern life of celebrations.',
  contact: {
    email: 'care@pratikshya.example',
    hours: 'Mon–Sat, 10:00–19:00 IST',
    city: 'Bhubaneswar, India',
  },
  social: [
    { label: 'Instagram', href: 'https://www.instagram.com/' },
    { label: 'Pinterest', href: 'https://www.pinterest.com/' },
    { label: 'YouTube', href: 'https://www.youtube.com/' },
  ],
};

export const announcements = [
  'Delivery across India · timelines confirmed at checkout',
  'The Festive Edit is live — sample offer details below',
  'Complimentary styling help · ' + site.contact.hours,
];

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

export const categories = [
  { key: 'women', label: 'Women', note: 'Sarees, anarkalis & sets', to: '/shop/women', image: I.catWomen, focal: '50% 30%' },
  { key: 'men', label: 'Men', note: 'Bandhgalas, kurtas & sherwanis', to: '/shop/men', image: I.menKurta, focal: '50% 30%' },
  { key: 'kids', label: 'Kids', note: 'Festive & everyday, 2–11Y', to: '/shop/kids', image: I.kidsGirl, focal: '50% 25%' },
  { key: 'essentials', label: 'Essentials', note: 'Potlis, juttis, dupattas', to: '/shop/essentials', image: I.catEssentials, focal: '50% 55%' },
];

export const sareeCollections = [
  { key: 'silk-classics', label: 'Silk Classics', note: 'Banarasi & Kanjeevaram' },
  { key: 'everyday-elegance', label: 'Everyday Elegance', note: 'Handloom cottons' },
  { key: 'festive-sarees', label: 'Festive Sarees', note: 'Temple borders, rich zari' },
  { key: 'contemporary-drapes', label: 'Contemporary Drapes', note: 'Pre-draped & modern' },
];

export const sareeLookbook = [
  { image: I.sareePallu, caption: 'The pallu, held', focal: '50% 40%' },
  { image: I.sareeIvory, caption: 'Banarasi buti', focal: '50% 20%' },
  { image: I.sareeIvoryPallu, caption: 'Katan in motion', focal: '40% 40%' },
];

export const kurtiCollections = [
  { key: 'everyday-kurtis', label: 'Everyday Kurtis' },
  { key: 'anarkalis', label: 'Anarkalis' },
  { key: 'festive-kurtis', label: 'Festive Kurtis' },
  { key: 'kurta-sets', label: 'Kurta Sets' },
];

export const jewelleryTypes = [
  { key: 'all', label: 'All' },
  { key: 'necklaces', label: 'Necklaces' },
  { key: 'jhumkas', label: 'Jhumkas' },
  { key: 'bangles', label: 'Bangles' },
  { key: 'rings', label: 'Rings' },
  { key: 'maang-tikka', label: 'Maang Tikka' },
];

/* Trust strip — only items flagged `enabled` are rendered.
 * secureCheckout is disabled until a payment gateway is connected. */
export const trustItems = [
  { key: 'delivery', icon: 'truck', title: 'Delivery across India', text: 'Timelines confirmed at checkout', to: '/pages/shipping', enabled: true },
  { key: 'authentic', icon: 'badge', title: 'Craft, documented', text: 'Fabric & technique on every product', to: '/pages/authenticity', enabled: true },
  { key: 'secure', icon: 'lock', title: 'Secure checkout', text: 'Encrypted payments', to: '/pages/shipping', enabled: false },
  { key: 'returns', icon: 'returns', title: 'Returns & exchanges', text: 'Read the policy before you buy', to: '/pages/returns', enabled: true },
  { key: 'help', icon: 'help', title: 'Styling & order help', text: site.contact.hours, to: '/pages/contact', enabled: true },
];

export const popularSearches = ['Banarasi saree', 'Anarkali', 'Sherwani', 'Jhumkas', 'Bridal lehenga', 'Kids festive'];
