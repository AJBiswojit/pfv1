import { products } from '../mock/data/products.js';

/* Synchronous selectors over the design-shaped live backend catalogue.
 * The products boundary publishes updated records as the shared store hydrates. */

const TITLES = {
  all: 'All Pieces', women: 'Women', men: 'Men', kids: 'Kids', jewellery: 'Jewellery', essentials: 'Essentials',
  sarees: 'Sarees', kurtis: 'Kurtis & Sets', bridal: 'Bridal', 'the-bride': 'The Bride', 'the-groom': 'The Groom',
  sherwanis: 'Sherwanis', bandhgalas: 'Bandhgalas', kurtas: 'Kurtas', accessories: 'Men’s Accessories',
  girls: 'Girls', boys: 'Boys', 'kids-festive': 'Festive Kids', necklaces: 'Necklaces', 'maang-tikka': 'Maang Tikka',
  jhumkas: 'Jhumkas', bangles: 'Bangles', rings: 'Rings', bags: 'Potlis & Bags', footwear: 'Juttis', dupattas: 'Dupattas',
  eyewear: 'Eyewear', decor: 'Decor', festive: 'The Festive Edit', everyday: 'Everyday', 'occasion-wear': 'Occasion Wear',
  'silk-classics': 'Silk Classics', 'everyday-elegance': 'Everyday Elegance', 'festive-sarees': 'Festive Sarees',
  'contemporary-drapes': 'Contemporary Drapes', anarkalis: 'Anarkalis', 'festive-kurtis': 'Festive Kurtis',
  'kurta-sets': 'Kurta Sets', 'everyday-kurtis': 'Everyday Kurtis', wedding: 'Wedding',
};

export const getAllProducts = () => products;
export const getProductBySlug = (slug) => products.find((p) => p.slug === slug) || null;
export const getProductById = (id) => products.find((p) => p.id === id) || null;
export const getTitleFor = (key) => TITLES[key] || key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Matches a URL key against department, type, collection or occasion. */
export const getProductsFor = (key) => {
  if (!key || key === 'all') return products;
  return products.filter(
    (p) => p.department === key || p.type === key || p.collections.includes(key) || p.occasions.includes(key),
  );
};

export const getByType = (type) => products.filter((p) => p.type === type);
export const getByDepartment = (dep) => products.filter((p) => p.department === dep);
export const getByIds = (ids) => ids.map(getProductById).filter(Boolean);

/** Backend-flagged featured selection — not a verified sales ranking. */
export const getFeatured = () => products.filter((p) => p.featured);

const BESTSELLER_FILTERS = {
  all: () => true,
  women: (p) => p.department === 'women' && p.type !== 'sarees',
  sarees: (p) => p.type === 'sarees',
  men: (p) => p.department === 'men',
  kids: (p) => p.department === 'kids',
  jewellery: (p) => p.department === 'jewellery' || p.department === 'essentials',
};
export const getFeaturedBy = (filterKey, limit = 8) =>
  products.filter((p) => p.featured || filterKey !== 'all').filter(BESTSELLER_FILTERS[filterKey] || (() => true)).slice(0, limit);

export const getRelated = (product, limit = 4) => {
  const same = products.filter((p) => p.id !== product.id && (p.department === product.department || p.occasions.some((o) => product.occasions.includes(o))));
  return same.slice(0, limit);
};

/** Lightweight search across name, type, collection and fabric. */
export const searchProducts = (query, limit = 24) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);
  const scored = products
    .map((p) => {
      const hay = [p.name, p.type, p.department, ...p.collections, ...p.occasions, p.fabric, p.craft].join(' ').toLowerCase();
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? (p.name.toLowerCase().includes(t) ? 3 : 1) : -10), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.p);
};

export const searchCategories = (query) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return Object.entries(TITLES)
    .filter(([key, title]) => title.toLowerCase().includes(q) && getProductsFor(key).length > 0)
    .slice(0, 4)
    .map(([key, title]) => ({ key, title, count: getProductsFor(key).length }));
};

export const sortProducts = (list, sort) => {
  const arr = [...list];
  if (sort === 'price-asc') arr.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') arr.sort((a, b) => b.price - a.price);
  if (sort === 'name') arr.sort((a, b) => a.name.localeCompare(b.name));
  return arr;
};

export const requiresOption = (p) => Array.isArray(p.options) && p.options.length > 0;
