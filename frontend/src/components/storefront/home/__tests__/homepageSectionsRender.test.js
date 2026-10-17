/** Render the actual eleven adapted section components, not a generic substitute. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const root = new URL('../../../../../', import.meta.url).pathname;
const sections = [
  ['categories', 'CategoryCollage', 'women', 'women-products'],
  ['sarees', 'SareeLookbook', 'lookbook-1', 'products'],
  ['bridal', 'BridalCampaign', 'bride', 'bride-products'],
  ['jewellery', 'JewelleryTheatre', 'campaign', 'products'],
  ['promotion', 'PromoBanner', 'campaign', null],
  ['men', 'MensEditorial', 'campaign', 'products'],
  ['kids', 'KidsPlayground', 'main', 'products'],
  ['bestsellers', 'Bestsellers', null, 'products'],
  ['kurtis', 'KurtiLookbook', 'anarkalis', 'anarkalis'],
  ['newsletter', 'Newsletter', 'campaign', null],
  ['trust', 'TrustStrip', null, null],
];
let vite, adapt, providers, components;
before(async () => {
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  adapt = (await load('components/storefront/home/homepageSectionModel.js')).adaptHomepageSection;
  providers = [
    (await load('components/customer/state/ShopContext.jsx')).ShopProvider,
    (await load('components/customer/state/UIContext.jsx')).UIProvider,
    (await load('context/ShoppingContext.jsx')).ShoppingProvider,
    (await load('context/InventoryContext.jsx')).InventoryProvider,
    (await load('context/AccountContext.jsx')).AccountProvider,
    (await load('context/AuthContext.jsx')).AuthProvider,
  ];
  components = Object.fromEntries(await Promise.all(sections.map(async ([key, name]) => [key, (await load(`components/customer/components/sections/${name}.jsx`)).default])));
});
after(async () => { await vite?.close(); });

function render(key, items) {
  let tree = React.createElement(components[key], { content: adapt({ items }) });
  for (const Provider of providers) tree = React.createElement(Provider, null, tree);
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, tree));
}

for (const [key, , mediaSlot, productSlot] of sections) {
  test(`${key}: authored copy and registered art replace reference content without changing the visual component`, () => {
    const items = [{ id: 'copy', contentType: 'TEXT', slotKey: key === 'trust' ? 'delivery' : 'intro', text: { title: 'SERVER TITLE', subtitle: 'SERVER BODY', eyebrow: 'SERVER EYEBROW', ctaLabel: 'SERVER LINK', ctaHref: '/explore' } }];
    if (mediaSlot) items.push({ id: 'media', contentType: 'MEDIA', slotKey: mediaSlot, media: { title: 'SERVER ART', subtitle: 'SERVER CAPTION', altText: 'SERVER ALT', url: '/api/v1/media/objects/hero/approved.avif' } });
    if (productSlot) items.push({ id: 'placement', contentType: 'PRODUCT', slotKey: productSlot, product: { id: 'BACKEND-PUBLISHED', slug: 'backend-published', status: 'PUBLISHED', name: 'SERVER PRODUCT', price: 2350, image: '/api/v1/media/objects/products/backend/cover.avif', stock: 2, availability: 'in-stock' } });
    const html = render(key, items);
    assert.match(html, /SERVER TITLE/); assert.match(html, /SERVER BODY/);
    if (key !== "bridal") assert.match(html, /href="\/explore"/, "Authored application paths must not be rewritten through design routes");
    assert.doesNotMatch(html, /\/design\//);
    if (mediaSlot) assert.match(html, /\/api\/v1\/media\/objects\/hero\/approved.avif/);
    if (productSlot && !['categories', 'bridal'].includes(key)) assert.match(html, /SERVER PRODUCT/);
    if (key === 'categories') assert.match(html, /1 pieces in this edit/);
    if (key === 'bridal') assert.match(html, /2,350/);
    if (key === 'promotion') { assert.doesNotMatch(html, /promo__code|promo__num/); assert.doesNotMatch(html.replace(/<[^>]*>/g, ""), /%/); }
    if (key === 'newsletter') { assert.match(html, /disabled/); assert.match(html, /subscription service is connected/); }
  });
  test(`${key}: absent media/products never refill from reference art or sample catalog`, () => {
    const html = render(key, [{ id: 'copy', contentType: 'TEXT', slotKey: key === 'trust' ? 'delivery' : 'intro', text: { title: null, subtitle: 'Only backend body' } }]);
    assert.match(html, /Only backend body/);
    assert.doesNotMatch(html, /\/design\//);
    assert.doesNotMatch(html, /pcard__name/);
  });
}
