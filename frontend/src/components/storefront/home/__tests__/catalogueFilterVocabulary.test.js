/** F-27 — the curated-product filters speak the catalogue's own vocabulary.
 *
 * The defect: `JewelleryTheatre` offered five hard-coded jewellery words
 * (Necklaces / Jhumkas / Bangles / Rings / Maang Tikka) that the canonical
 * taxonomy does not publish as leaf types, and `Bestsellers` filtered `sarees`
 * by `type` alone — but a saree's leaf type is `banarasi` / `cotton` / `silk`,
 * while `sarees` is the *category* in its path. Both filters therefore showed
 * "no pieces" for products that were genuinely curated into the section.
 *
 * Fixtures below are real backend catalogue records addressed by the canonical
 * taxonomy ids in `src/data/catalog/taxonomy.js`, pushed through the same
 * adapter the storefront uses (`adaptHomepageSection` → `toDesignProduct`), so
 * the derived `type`, `department` and `collections` are the ones the live
 * catalogue produces — not hand-written design objects.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const root = new URL('../../../../../', import.meta.url).pathname;

let vite, adapt, providers, Jewellery, Bestsellers, filterTabs, productsForTab, matchesFilter;

before(async () => {
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  adapt = (await load('components/storefront/home/homepageSectionModel.js')).adaptHomepageSection;
  const jewellery = await load('components/customer/components/sections/JewelleryTheatre.jsx');
  Jewellery = jewellery.default;
  filterTabs = jewellery.filterTabs;
  productsForTab = jewellery.productsForTab;
  const bestsellers = await load('components/customer/components/sections/Bestsellers.jsx');
  Bestsellers = bestsellers.default;
  matchesFilter = bestsellers.matchesFilter;
  providers = [
    (await load('components/customer/state/ShopContext.jsx')).ShopProvider,
    (await load('components/customer/state/UIContext.jsx')).UIProvider,
    (await load('context/ShoppingContext.jsx')).ShoppingProvider,
    (await load('context/InventoryContext.jsx')).InventoryProvider,
    (await load('context/AccountContext.jsx')).AccountProvider,
    (await load('context/AuthContext.jsx')).AuthProvider,
  ];
});
after(async () => { await vite?.close(); });

/* ── fixtures: persisted catalogue records, canonical taxonomy ids ──────── */

const record = (id, name, category, subcategory, extra = {}) => ({
  id, name, slug: id.toLowerCase(), status: 'PUBLISHED', published: true,
  price: 4200, originalPrice: 5200, stock: 3,
  category, subcategory,
  image: `/api/v1/media/objects/products/${id}/cover.avif`,
  ...extra,
});

const JEWELLERY_SET = record('PF-JEW-1', 'Kundan bridal set', 'finishing-touches', 'jewellery');
const BANGLES = record('PF-JEW-2', 'Temple bangle pair', 'finishing-touches', 'bangles');
const BANARASI = record('PF-SAR-1', 'Banarasi silk drape', 'sarees', 'banarasi');
const KURTA = record('PF-MEN-1', 'Ivory kurta pajama', 'ethnic-wear', 'kurta-pajama');
const GIRLS_DRESS = record('PF-KID-1', 'Girls festive dress', 'girls', 'dresses');

const itemsFor = (records) => {
  const items = [{
    id: 'copy', contentType: 'TEXT', slotKey: 'intro',
    text: { eyebrow: 'EDITORIAL', title: 'CURATED TITLE', subtitle: 'CURATED BODY', ctaLabel: 'EXPLORE', ctaHref: '/shop/jewellery' },
  }];
  records.forEach((product, index) => items.push({ id: `p-${index}`, contentType: 'PRODUCT', slotKey: 'products', product }));
  return items;
};
const designProducts = (records) => adapt({ items: itemsFor(records) }).products('products');

const render = (Component, records) => {
  let tree = React.createElement(Component, { content: adapt({ items: itemsFor(records) }) });
  for (const Provider of providers) tree = React.createElement(Provider, null, tree);
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, tree));
};

/* ── the catalogue's own shape, which the old filters contradicted ─────── */

test('F-27 · a curated saree is type `banarasi`, not `sarees` — the old filter could never match it', () => {
  const [saree] = designProducts([BANARASI]);
  assert.equal(saree.type, 'banarasi');
  assert.equal(saree.department, 'women');
  assert.ok(saree.collections.includes('sarees'), 'the parent category must survive as a collection segment');
  assert.notEqual(saree.type, 'sarees', 'the defect class: matching on type alone hides every saree');
  assert.equal(matchesFilter(saree, 'sarees'), true);
});

test('F-27 · the bestseller filters match the department, the leaf type and the parent category', () => {
  const [saree, kurta, dress, jewel] = designProducts([BANARASI, KURTA, GIRLS_DRESS, JEWELLERY_SET]);
  assert.equal(matchesFilter(saree, 'women'), true);
  assert.equal(matchesFilter(saree, 'men'), false);
  assert.equal(matchesFilter(kurta, 'sarees'), false, 'a men\u2019s kurta must never appear under Sarees');
  assert.equal(matchesFilter(kurta, 'men'), true);
  assert.equal(matchesFilter(dress, 'kids'), true);
  assert.equal(matchesFilter(jewel, 'jewellery'), true);
  assert.equal(matchesFilter(jewel, 'sarees'), false);
  assert.equal(matchesFilter(saree, 'all'), true);
  assert.equal(matchesFilter(null, 'sarees'), false);
});

test('F-27 · the jewellery tabs are derived from the curated pieces, never from a word the catalogue does not use', () => {
  const pieces = designProducts([JEWELLERY_SET, BANGLES]);
  const tabs = filterTabs(pieces);
  assert.deepEqual(tabs.map((tab) => tab.key), ['all', 'bangles', 'jewellery']);
  assert.deepEqual(tabs.map((tab) => tab.label), ['All', 'Bangles', 'Jewellery']);
  assert.equal(productsForTab(pieces, 'bangles').length, 1);
  assert.equal(productsForTab(pieces, 'jewellery').length, 1);
  assert.equal(productsForTab(pieces, 'all').length, 2);
});

test('F-27 · a catalogue that publishes necklaces or jhumkas keeps the design\u2019s own words for them', () => {
  /* The design vocabulary is still the label source, and still orders the tabs;
     it is only no longer the *permission* a product needs to be shown. If the
     catalogue ever publishes these leaf types they appear, in design order,
     with the design's labels. Duplicates collapse to one tab. */
  const products = [{ type: 'jhumkas' }, { type: 'rings' }, { type: 'necklaces' }, { type: 'banarasi' }, { type: 'necklaces' }];
  assert.deepEqual(filterTabs(products).map((tab) => [tab.key, tab.label]), [
    ['all', 'All'], ['necklaces', 'Necklaces'], ['jhumkas', 'Jhumkas'], ['rings', 'Rings'], ['banarasi', 'Banarasi'],
  ]);
  assert.equal(productsForTab(products, 'necklaces').length, 2);
  assert.equal(productsForTab(products, 'jhumkas').length, 1);
  assert.equal(productsForTab(products, 'banarasi').length, 1);
});

test('F-27 · the adapter\u2019s "no type" fallback never becomes a tab that duplicates All', () => {
  assert.deepEqual(filterTabs([{ type: 'all' }, {}]).map((tab) => tab.key), ['all']);
});

/* ── rendered storefront components ─────────────────────────────────────── */

test('F-27 · the jewellery theatre renders a tab for every curated type and hides none of the pieces', () => {
  const html = render(Jewellery, [JEWELLERY_SET, BANGLES]);
  assert.match(html, />Bangles</);
  assert.match(html, />Jewellery</);
  assert.doesNotMatch(html, />Necklaces</, 'a tab the curated pieces cannot match is a dead end');
  assert.doesNotMatch(html, />Maang Tikka</);
  assert.match(html, /Kundan bridal set/);
  assert.match(html, /Temple bangle pair/);
  /* Two tabs plus All, each carrying its own count. */
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
});

test('F-27 · the bestsellers rail still lists every curated piece under All', () => {
  const html = render(Bestsellers, [BANARASI, KURTA]);
  assert.match(html, /Banarasi silk drape/);
  assert.match(html, /Ivory kurta pajama/);
  assert.match(html, /Sarees/);
  assert.equal((html.match(/role="tab"/g) || []).length, 6);
});
