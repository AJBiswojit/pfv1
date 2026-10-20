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

test('kurtis: the initial mood is the first CONFIGURED slot, never a hardcoded key (B-15)', () => {
  /* Previously `active` started hardcoded as 'anarkalis'; when that slot was
     unconfigured the hero image rendered blank until a mood was clicked. The
     same resolution expression now backs both the initial default and the
     re-save recovery (a disappeared selection falls back to the first
     configured mood), so this static render pins both paths. */
  const items = [
    { id: 'copy', contentType: 'TEXT', slotKey: 'intro', text: { title: 'KURTI SERVER TITLE' } },
    { id: 'm1', contentType: 'MEDIA', slotKey: 'festive-kurtis', media: { title: 'FESTIVE SERVER ART', url: '/api/v1/media/objects/hero/festive.avif', altText: 'festive alt' } },
    { id: 'm2', contentType: 'MEDIA', slotKey: 'everyday-kurtis', media: { title: 'EVERYDAY SERVER ART', url: '/api/v1/media/objects/hero/everyday.avif', altText: 'everyday alt' } },
  ];
  const html = render('kurtis', items);
  assert.match(html, /\/api\/v1\/media\/objects\/hero\/festive\.avif/,
    'with `anarkalis` unconfigured, the first configured mood renders immediately');
  assert.doesNotMatch(html, /src=""/, 'the mood image must never render blank');
  assert.match(html, /aria-selected="true"[^>]*><sup>01<\/sup><span>FESTIVE SERVER ART/,
    'the first configured mood tab is marked active');
});
