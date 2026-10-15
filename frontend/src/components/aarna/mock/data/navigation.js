import { images as I } from '../assets/images.js';

export const megaMenus = [
  {
    key: 'women',
    label: 'Women',
    to: '/shop/women',
    columns: [
      { title: 'Shop', links: [
        { label: 'All Women', to: '/shop/women' },
        { label: 'Sarees', to: '/shop/sarees' },
        { label: 'Kurtis & Sets', to: '/shop/kurtis' },
        { label: 'Bridal Lehengas', to: '/shop/the-bride' },
      ] },
      { title: 'Saree Edits', links: [
        { label: 'Silk Classics', to: '/shop/silk-classics' },
        { label: 'Everyday Elegance', to: '/shop/everyday-elegance' },
        { label: 'Festive Sarees', to: '/shop/festive-sarees' },
        { label: 'Contemporary Drapes', to: '/shop/contemporary-drapes' },
      ] },
      { title: 'Kurtis', links: [
        { label: 'Anarkalis', to: '/shop/anarkalis' },
        { label: 'Festive Kurtis', to: '/shop/festive-kurtis' },
        { label: 'Kurta Sets', to: '/shop/kurta-sets' },
        { label: 'Everyday Kurtis', to: '/shop/everyday-kurtis' },
      ] },
    ],
    feature: { image: I.sareeEditorial, kicker: 'The Saree Edit', title: 'Tradition, reimagined', to: '/shop/sarees', focal: '50% 25%' },
  },
  {
    key: 'men',
    label: 'Men',
    to: '/shop/men',
    columns: [
      { title: 'Shop', links: [
        { label: 'All Men', to: '/shop/men' },
        { label: 'Kurtas', to: '/shop/kurtas' },
        { label: 'Bandhgalas', to: '/shop/bandhgalas' },
        { label: 'Sherwanis', to: '/shop/sherwanis' },
      ] },
      { title: 'Occasions', links: [
        { label: 'The Groom', to: '/shop/the-groom' },
        { label: 'Festive', to: '/shop/festive' },
        { label: 'Everyday', to: '/shop/everyday' },
        { label: 'Accessories', to: '/shop/accessories' },
      ] },
    ],
    feature: { image: I.groom, kicker: 'The Groom Edit', title: 'Tone-on-tone ceremony', to: '/shop/the-groom', focal: '50% 20%' },
  },
  {
    key: 'kids',
    label: 'Kids',
    to: '/shop/kids',
    columns: [
      { title: 'Shop', links: [
        { label: 'All Kids', to: '/shop/kids' },
        { label: 'Girls', to: '/shop/girls' },
        { label: 'Boys', to: '/shop/boys' },
        { label: 'Festive Kids', to: '/shop/kids-festive' },
      ] },
    ],
    feature: { image: I.catKids, kicker: 'Little Celebrations', title: 'Made for twirling', to: '/shop/kids', focal: '50% 30%' },
  },
  {
    key: 'essentials',
    label: 'Essentials',
    to: '/shop/essentials',
    columns: [
      { title: 'Jewellery', links: [
        { label: 'All Jewellery', to: '/shop/jewellery' },
        { label: 'Necklaces', to: '/shop/necklaces' },
        { label: 'Jhumkas', to: '/shop/jhumkas' },
        { label: 'Bangles', to: '/shop/bangles' },
        { label: 'Rings', to: '/shop/rings' },
      ] },
      { title: 'Accessories', links: [
        { label: 'All Essentials', to: '/shop/essentials' },
        { label: 'Potlis & Bags', to: '/shop/bags' },
        { label: 'Juttis', to: '/shop/footwear' },
        { label: 'Dupattas', to: '/shop/dupattas' },
        { label: 'Eyewear', to: '/shop/eyewear' },
      ] },
    ],
    feature: { image: I.necklace, kicker: 'Jewellery', title: 'Heirlooms, worn daily', to: '/shop/jewellery', focal: '50% 40%' },
  },
];

export const footerGroups = [
  { title: 'Shop', links: [
    { label: 'Women', to: '/shop/women' },
    { label: 'Men', to: '/shop/men' },
    { label: 'Kids', to: '/shop/kids' },
    { label: 'Essentials', to: '/shop/essentials' },
  ] },
  { title: 'Edits', links: [
    { label: 'Sarees', to: '/shop/sarees' },
    { label: 'Bridal', to: '/shop/bridal' },
    { label: 'Jewellery', to: '/shop/jewellery' },
    { label: 'Kurtis', to: '/shop/kurtis' },
  ] },
  { title: 'Client Care', links: [
    { label: 'Shipping & Delivery', to: '/pages/shipping' },
    { label: 'Returns & Exchanges', to: '/pages/returns' },
    { label: 'Track Your Order', to: '/track-order' },
    { label: 'Contact Us', to: '/pages/contact' },
  ] },
  { title: 'The House', links: [
    { label: 'Our Story', to: '/pages/our-story' },
    { label: 'Authenticity', to: '/pages/authenticity' },
    { label: 'Privacy Policy', to: '/pages/privacy' },
    { label: 'Terms of Use', to: '/pages/terms' },
  ] },
];
