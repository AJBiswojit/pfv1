import { images as I } from '../assets/images.js';

/*
 * Promotions are configuration-driven. The UI never invents discounts or
 * countdowns — everything rendered comes from this object.
 * `isSample: true` marks this as an illustrative prototype offer.
 */
export const promotions = [
  {
    id: 'festive-preview',
    active: true,
    isSample: true,
    label: 'Festive Preview',
    headline: ['The Festive Edit,', 'fifteen percent lighter.'],
    copy: 'Silk co-ords, anarkalis, potlis and temple jewellery from the Festive Edit — with a little something taken off.',
    discountPercent: 15,
    code: 'UTSAV15',
    eligibleCollection: 'festive',
    endsAt: '2026-11-15T23:59:00+05:30',
    terms: 'Applies to items tagged Festive Edit. One code per order.',
    cta: { label: 'Shop the Festive Edit', to: '/shop/festive' },
    image: I.promoFestive,
    imageAlt: 'A woman in a rust silk anarkali holding a lit brass diya beside a carved arch',
    focal: '50% 30%',
  },
];

export const getActivePromotion = (now = new Date()) =>
  promotions.find((p) => p.active && new Date(p.endsAt) > now) || null;

export const findPromotionByCode = (code, now = new Date()) =>
  promotions.find(
    (p) => p.active && p.code.toLowerCase() === String(code).trim().toLowerCase() && new Date(p.endsAt) > now,
  ) || null;
