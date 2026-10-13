const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatPrice = (n) => inr.format(n);
export const discountPct = (price, compareAt) => (compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0);
export const formatDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
export const cx = (...a) => a.filter(Boolean).join(' ');
