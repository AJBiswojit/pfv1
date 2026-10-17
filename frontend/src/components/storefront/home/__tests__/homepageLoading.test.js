import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { createServer } from 'vite';
const root = new URL('../../../../../', import.meta.url).pathname;
const keys = ['categories', 'sarees', 'bridal', 'jewellery', 'promotion', 'men', 'kids', 'bestsellers', 'kurtis', 'newsletter', 'trust'];
let vite, Section, Hero, store, originalFetch;
before(async () => {
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  Section = (await vite.ssrLoadModule('/src/components/storefront/home/HomepageSection.jsx')).default;
  Hero = (await vite.ssrLoadModule('/src/components/storefront/home/CustomerHomeHero.jsx')).default;
  store = await vite.ssrLoadModule('/src/services/catalog/catalogStore.js');
  originalFetch = globalThis.fetch;
});
after(async () => { globalThis.fetch = originalFetch; await vite?.close(); });
const Body = ({ content }) => React.createElement('p', null, content ? 'CONFIGURED BODY' : 'SECTION BODY');
const section = (key) => React.createElement(Section, { sectionKey: key }, React.createElement(Body));
function assertLoading(html, key) {
  assert.match(html, new RegExp(`aan-home-loading--${key}`));
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-label="Loading /);
  assert.match(html, /aria-hidden="true"/);
  assert.equal(html.replace(/<[^>]*>/g, '').trim(), '', 'no visible loading text');
}
test('idle/in-flight shimmer transitions preserve hidden, ready and error states', async () => {
  for (const key of keys) assertLoading(render(section(key)), key);
  assertLoading(render(React.createElement(Hero)), 'hero');
  let release;
  globalThis.fetch = async (input) => String(input).endsWith('/home') ? new Promise((resolve) => { release = resolve; }) : Response.json({ items: [], offers: [], total: 0 });
  const pending = store.hydrateCatalog();
  assert.equal(store.getCatalogState().homeStatus, 'loading');
  for (const key of keys) assertLoading(render(section(key)), key);
  assertLoading(render(React.createElement(Hero)), 'hero');
  release(Response.json({ heroSlides: [], homepageContent: { version: 1, status: 'ready', sections: keys.map((key, i) => ({ key, configured: i !== 2, state: i === 0 ? 'inactive' : i === 1 ? 'empty' : i === 2 ? 'missing' : 'ready', items: [] })) } }));
  await pending;
  assert.equal(render(section('categories')), '');
  assert.equal(render(section('sarees')), '');
  assert.equal(render(section('bridal')), '', 'an unconfigured/missing section is hidden, not a legacy render');
  assert.equal(render(section('men')), '<p>CONFIGURED BODY</p>');
  assert.equal(render(React.createElement(Hero)), '');
  globalThis.fetch = async (input) => Response.json(String(input).endsWith('/home') ? { homepageContent: { version: 1, status: 'unavailable', sections: [] } } : { items: [], offers: [], total: 0 });
  await store.refreshCatalog();
  assert.match(render(section('categories')), /Homepage content is unavailable\./);
  assert.match(render(section('categories')), /Retry homepage content<\/button>/);
  globalThis.fetch = async () => { throw new Error('offline'); };
  await store.refreshCatalog();
  assert.match(render(React.createElement(Hero)), /Featured campaigns could not be loaded\./);
  assert.match(render(React.createElement(Hero)), /Try again<\/button>/);
});
test('all twelve sections reserve responsive space and honor reduced motion', () => {
  const css = readFileSync(`${root}src/components/storefront/home/homepage-section-loading.css`, 'utf8');
  assert.match(css, /height: var\(--loading-height\)/);
  for (const key of ['hero', ...keys]) assert.equal((css.match(new RegExp(`\\.aan-root \\.aan-home-loading--${key} \\{ --loading-height:`, 'g')) ?? []).length, 2, key);
  assert.match(css, /linear-gradient/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
});
