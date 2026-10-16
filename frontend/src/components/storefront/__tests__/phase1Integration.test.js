/** Phase 1 regressions: real frontend modules, mocked HTTP only; no database. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const root = new URL('../../../../', import.meta.url).pathname;
const source = (path) => readFileSync(`${root}${path}`, 'utf8');
const genuine = { id: 'PF-W-SAR-SIL-0001', slug: 'silk', name: 'Silk saree', price: 3500, category: 'sarees', subcategory: 'silk', department: 'women', status: 'PUBLISHED', published: true };
const fabricated = { ...genuine, id: 'PF-CUST-123', image: 'data:image/png;base64,OLD' };
const localOnly = { ...genuine, id: 'PF-CUST-LOCAL-ONLY', image: '/media/registered-looking.avif' };
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
const storage = new Map([
  ['pratikshya_custom_products', JSON.stringify([fabricated, localOnly, { ...genuine, id: 'local-but-valid-looking' }])],
  ['guest-cart', 'preserve-me'],
]);
const storageBefore = [...storage];
let vite, store, repository, placements, catalogue, model, HomeHero, Selector, MarketingPage, safety, AdminAuthContext;
let homeResponse = { ok: true, heroSlides: [] };
let homeFails = false;
let productFails = false;
let productGate = null;
let detail = genuine;
const requests = [];
const slide = (id, title = 'Managed campaign') => ({ id, title, subtitle: 'Backend editorial copy', image: `hero/${id}.avif`, cta: 'Shop the edit', href: '/women/sarees' });

before(async () => {
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input?.url ?? input), 'http://frontend.invalid');
    requests.push({ path: url.pathname, method: options?.method ?? 'GET' });
    assert.equal(options?.method ?? 'GET', 'GET', 'tests must not mutate any backend');
    let body = { ok: true, items: [], total: 0 };
    let status = 200;
    if (url.pathname.endsWith('/home')) {
      body = homeResponse;
      if (homeFails) { status = 503; body = { detail: 'Home unavailable' }; }
    } else if (url.pathname.endsWith('/products')) {
      if (productGate) await productGate;
      body = { items: [genuine, fabricated], total: 2, page: 1, pageSize: 100 };
      if (productFails) { status = 503; body = { detail: 'Catalog unavailable' }; }
    } else if (url.pathname.includes('/products/')) {
      body = detail;
    } else if (url.pathname.endsWith('/offers')) body = { offers: [] };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  vite = await createServer({ root, logLevel: 'error', appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  store = await load('services/catalog/catalogStore.js');
  repository = await load('services/catalogRepository.js');
  placements = await load('services/media/marketingPlacementRepository.js');
  catalogue = await load('components/aarna/services/catalog.js');
  model = await load('components/storefront/home/aarnaHomeHeroModel.js');
  HomeHero = (await load('components/storefront/home/AarnaHomeHero.jsx')).default;
  Selector = (await load('components/admin/ProductCatalogSelector.jsx')).default;
  MarketingPage = (await load('pages/admin/media/AdminMarketingMedia.jsx')).default;
  safety = await load('services/catalog/catalogRecordSafety.js');
  AdminAuthContext = (await load('context/AdminAuthContext.jsx')).default;
});

after(async () => {
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  await vite?.close();
});

const renderHero = () => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(HomeHero)));

test('both product-placement upload paths are removed; real media and backend draft workflows remain', () => {
  for (const file of ['src/pages/admin/media/AdminMarketingMedia.jsx', 'src/components/admin/ProductCatalogSelector.jsx']) {
    const text = source(file);
    assert.doesNotMatch(text, /FileReader|readAsDataURL|PF-CUST-|addCustomProductToStore|upsertServerProducts|type="file"/);
    assert.match(text, /photo.*cannot create|photo alone cannot create/i);
  }
  const admin = source('src/pages/admin/media/AdminMarketingMedia.jsx');
  assert.match(admin, /products\/new/);
  assert.match(admin, /<BackendHomeHeroPanel/);
  assert.match(admin, /Registered media library/);
  const heroPanel = source('src/components/admin/BackendHomeHeroPanel.jsx');
  assert.match(heroPanel, /RegisteredMediaPicker/);
  assert.match(heroPanel, /saveHomepageEntry/);
  assert.match(source('src/services/homepage/homepageContentService.js'), /apiCreateMarketingMedia/);
  assert.match(source('src/services/api/mediaApi.js'), /apiUploadMediaObject/);
  const draft = source('src/components/products/persistProductDraft.js');
  assert.match(draft, /persistAdminProduct/);
  assert.match(source('src/services/admin/productAdminService.js'), /apiAdminCreateDraft/);
});

test('initial hero is loading, never static reference campaigns', () => {
  assert.match(renderHero(), /Loading featured campaigns/);
  assert.doesNotMatch(renderHero(), /Tradition,|Reimagined|data-active-slide/);
});

test('catalogue snapshots ignore old browser records without deleting storage or guest state', () => {
  const inline = { ...genuine, id: 'valid-id-inline', media: { primary: 'data:image/png;base64,OTHER' } };
  const blob = { ...genuine, id: 'valid-id-blob', additionalImages: ['blob:local'] };
  store.applyCatalogSnapshot({ products: [genuine, fabricated, inline, blob] });
  assert.deepEqual(store.getAllProducts().map((p) => p.id), [genuine.id]);
  assert.equal(store.getProductById('local-but-valid-looking'), null);
  assert.deepEqual(catalogue.getAllProducts().map((p) => p.id), [genuine.id]);
  repository.replaceServerProducts([genuine, fabricated, inline, blob]);
  repository.upsertServerProducts([fabricated, inline]);
  assert.deepEqual(repository.default.all().map((p) => p.id), [genuine.id]);
  assert.deepEqual([...storage], storageBefore);
});

test('placements only store references; legacy photo IDs cannot create or publish products', () => {
  const before = store.getAllProducts().map((p) => [p.id, p.status, p.published]);
  placements.setPlacementProductIds('SAREE_SECTION', [genuine.id, fabricated.id, 'unknown-id']);
  assert.deepEqual(placements.getPlacementProductIds('SAREE_SECTION'), [genuine.id, fabricated.id, 'unknown-id']);
  assert.deepEqual(store.getAllProducts().map((p) => [p.id, p.status, p.published]), before);
  assert.equal(catalogue.getProductById('unknown-id'), null);
  const html = renderToStaticMarkup(React.createElement(Selector, { placementId: 'SAREE_SECTION' }));
  assert.match(html, /Silk saree/);
  assert.doesNotMatch(html, /Choose photo from device|PF-CUST-/);
  assert.deepEqual([...storage], storageBefore);
});

test('hero receives backend copy, order, image and CTA through the actual public /home client', async () => {
  homeResponse = { ok: true, heroSlides: [slide('second', 'Admin title\nSecond line'), slide('first')] };
  await store.hydrateCatalog({ force: true });
  assert.equal(store.getCatalogState().homeStatus, 'ready');
  const slides = model.aarnaHomeHeroSlides(store.getHome());
  assert.deepEqual(slides.map((s) => s.id), ['second', 'first']);
  assert.deepEqual(slides[0].lines, ['Admin title', 'Second line']);
  assert.equal(slides[0].layout, 'left');
  assert.equal(slides[1].layout, 'panel');
  const html = renderHero();
  assert.match(html, /data-active-slide="second"/);
  assert.match(html, /Admin title/);
  assert.match(html, /Backend editorial copy/);
  assert.match(html, /href="\/women\/sarees"/);
  assert.match(html, /hero\/second.avif/);
  assert.doesNotMatch(html, /Discover Our Story|aarna-design/);
  assert.ok(requests.some((r) => r.path === '/api/v1/home'));
  assert.deepEqual(store.getAllProducts().map((p) => p.id), [genuine.id]);
});

test('malformed or missing hero media cannot fall back to a browser marketing register', () => {
  assert.deepEqual(model.aarnaHomeHeroSlides({ heroSlides: [null, { id: 'no-image', title: 'No plate' }] }), []);
  assert.deepEqual(model.aarnaHomeHeroSlides({ heroSlides: {} }), []);
  assert.match(source('src/components/storefront/home/aarnaHomeHeroModel.js'), /normalizeHeroSlides\(Array.isArray\(raw\) \? raw : \[\], \[\]\)/);
});

test('an all-inactive /home response removes the hero; no static client fallback', async () => {
  homeResponse = { ok: true, heroSlides: [] };
  await store.refreshCatalog();
  assert.equal(store.getCatalogState().homeStatus, 'ready');
  assert.equal(renderHero(), '');
});

test('no-row canonical fallback returned by the backend is honored, not confused with empty', async () => {
  // This mocks the documented backend RESPONSE, not the database behavior.
  homeResponse = { ok: true, heroSlides: [slide('hero001', 'Canonical backend fallback')] };
  await store.refreshCatalog();
  assert.match(renderHero(), /Canonical backend fallback/);
  assert.match(renderHero(), /hero\/hero001.avif/);
});

test('home refresh errors hide stale hero and offer retry; recovery can change the slide count', async () => {
  homeFails = true;
  await store.refreshCatalog();
  assert.equal(store.getCatalogState().homeStatus, 'error');
  assert.match(renderHero(), /role="alert"/);
  assert.match(renderHero(), /Try again/);
  assert.doesNotMatch(renderHero(), /data-active-slide/);
  homeFails = false;
  homeResponse = { ok: true, heroSlides: [slide('updated', 'Updated title')] };
  await store.refreshCatalog();
  assert.match(renderHero(), /data-active-slide="updated"/);
  assert.match(renderHero(), /Updated title/);
});

test('hero success is independent of product-feed failure; absent CTA never becomes a fake action', async () => {
  productFails = true;
  homeResponse = { ok: true, heroSlides: [{ ...slide('independent'), cta: '', href: '' }] };
  await store.refreshCatalog();
  assert.equal(store.getCatalogState().status, 'partial');
  assert.equal(store.getCatalogState().homeStatus, 'ready');
  assert.match(renderHero(), /data-active-slide="independent"/);
  assert.doesNotMatch(renderHero(), /<a\b|Try again/);
  productFails = false;
});

test('home publishes before a slow product request finishes', async () => {
  let releaseProducts;
  productGate = new Promise((resolve) => { releaseProducts = resolve; });
  homeResponse = { ok: true, heroSlides: [slide('early')] };
  const hydration = store.refreshCatalog();
  try {
    await new Promise((resolve) => {
      const unsubscribe = store.subscribeCatalog(() => {
        if (store.getCatalogState().homeStatus === 'ready') { unsubscribe(); resolve(); }
      });
    });
    assert.equal(store.getCatalogState().status, 'loading');
    assert.match(renderHero(), /data-active-slide="early"/);
  } finally {
    productGate = null;
    releaseProducts();
    await hydration;
  }
});

test('reading legacy placement IDs is non-destructive and does not create catalogue rows', () => {
  const originalWindow = globalThis.window;
  const key = placements.MARKETING_PLACEMENTS_STORAGE_KEY;
  const raw = JSON.stringify({ SAREE_SECTION: { placementId: 'SAREE_SECTION', productIds: [fabricated.id, genuine.id] } });
  storage.set(key, raw);
  globalThis.window = { localStorage: globalThis.localStorage };
  try {
    assert.deepEqual(placements.getPlacementProductIds('SAREE_SECTION'), [fabricated.id, genuine.id]);
    assert.equal(storage.get(key), raw);
    assert.equal(store.getProductById(fabricated.id), null);
    assert.equal(store.getProductById(localOnly.id), null);
  } finally {
    storage.delete(key);
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('on-demand detail cannot insert legacy or inline-media products either', async () => {
  detail = fabricated;
  const result = await store.ensureProduct('unknown-id');
  assert.equal(result.ok, false);
  assert.equal(store.getProductById(fabricated.id), null);
  assert.equal(store.getProductById(localOnly.id), null);
  assert.deepEqual([...storage], storageBefore);
});

// Closure checks: exercise positive admission, not only rejection of old data.
test('authorized control center renders section navigation without product-panel scope leaks', () => {
  const auth = { admin: { adminId: 'owner', accountLevel: 'SUPER_ADMIN', status: 'ACTIVE' }, isSuperAdmin: true };
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(AdminAuthContext.Provider, { value: auth }, React.createElement(MarketingPage))));
  assert.match(html, /Marketing media/);
  assert.match(html, /Home hero/);
  assert.match(html, /Editorial/);
  assert.match(html, /Promotion/);
});

test('catalogue guard accepts registered URLs, object keys, missing media and descriptive metadata', () => {
  const urls = [
    '/api/v1/media/objects/products/PF-W-SAR-SIL-0002/primary.avif',
    'https://media.example.invalid/products/primary.avif?signature=registered',
    'products/PF-W-SAR-SIL-0002/primary.avif',
    '',
  ];
  for (const url of urls) {
    const record = { ...genuine, image: url, hoverImage: url, additionalImages: [url],
      images: { primary: { src: url, alt: 'Data: handwoven silk' } },
      media: { primary: { url, caption: 'Blob: a descriptive word, not a media URL' } } };
    assert.equal(safety.isBackendCatalogRecord(record), true, url);
  }
  assert.equal(safety.isBackendCatalogRecord({ ...genuine, isCustom: true }), false);
  assert.equal(safety.isBackendCatalogRecord({ ...genuine, isCustom: false }), true);
  assert.equal(safety.isBackendCatalogRecord({ name: 'Missing identity' }), false);
  assert.equal(safety.isBackendCatalogRecord({ ...genuine, hoverImage: 'data:image/png;base64,OLD' }), false);
});

test('valid backend detail and registered media remain usable in detail, search and listings', async () => {
  const url = '/api/v1/media/objects/products/PF-W-SAR-SIL-0002/primary.avif';
  detail = { ...genuine, id: 'PF-W-SAR-SIL-0002', slug: 'registered-silk', image: url,
    hoverImage: url, additionalImages: [url], primaryMediaId: 'registered-asset-id' };
  const result = await store.ensureProduct(detail.id);
  assert.equal(result.ok, true);
  assert.equal(store.getProductById(detail.id).image, url);
  assert.equal(catalogue.getProductBySlug(detail.slug).images[0], url);
  assert.ok(catalogue.searchProducts('Silk saree').some((p) => p.id === detail.id));
  assert.ok(catalogue.getProductsFor('sarees').some((p) => p.id === detail.id));
  repository.upsertServerProducts([detail]);
  assert.equal(repository.default.find(detail.id).id, detail.id);
  assert.deepEqual([...storage], storageBefore);
});

test('server-issued PF-CUST IDs are not confused with browser-local fabricated records', async () => {
  detail = { ...genuine, id: 'PF-CUST-REGISTERED', slug: 'server-registered-silk',
    image: '/api/v1/media/objects/products/PF-CUST-REGISTERED/primary.avif' };
  assert.equal(safety.isBackendCatalogRecord(detail), true);
  const result = await store.ensureProduct(detail.id);
  assert.equal(result.ok, true);
  assert.equal(catalogue.getProductById(detail.id).slug, detail.slug);
  repository.upsertServerProducts([detail]);
  assert.equal(repository.default.find(detail.id).id, detail.id);
  placements.setPlacementProductIds('SAREE_SECTION', [detail.id]);
  assert.deepEqual(placements.getPlacementProductIds('SAREE_SECTION'), [detail.id]);
  assert.equal(catalogue.getProductById(fabricated.id), null);
  assert.deepEqual([...storage], storageBefore);
});

test('the production home slide fields and canonical/CDN media URLs adapt without invented fields', () => {
  for (const image of ['/api/v1/media/objects/hero/registered.avif', 'https://cdn.example.invalid/hero/registered.avif?signature=kept']) {
    const [adapted] = model.aarnaHomeHeroSlides({ ok: true, heroSlides: [{
      id: 'registered-row', title: 'Registered campaign', subtitle: 'Backend subtitle',
      cta: 'View collection', href: '/women/sarees', image,
      mobileImage: '/api/v1/media/objects/hero/mobile.avif', mediaId: 'hero/registered.avif',
    }] });
    assert.equal(adapted.id, 'registered-row');
    assert.equal(adapted.title, 'Registered campaign');
    assert.equal(adapted.copy, 'Backend subtitle');
    assert.equal(adapted.image, image);
    assert.equal(adapted.imageTall, '/api/v1/media/objects/hero/mobile.avif');
    assert.equal(adapted.mediaId, 'hero/registered.avif');
    assert.deepEqual(adapted.primary, { label: 'View collection', to: '/women/sarees' });
    assert.equal(adapted.secondary, null);
    assert.equal(adapted.alt, ''); // Public HeroSlide has no altText field.
  }
});

test('missing hero fields follow the schema empty default; failed responses are not empty successes', async () => {
  for (const response of [{ ok: true }, { ok: true, heroSlides: [] }]) {
    homeResponse = response;
    await store.refreshCatalog();
    assert.equal(store.getCatalogState().homeStatus, 'ready');
    assert.equal(renderHero(), '');
  }
  homeResponse = { ok: false, error: 'Home rejected' };
  await store.refreshCatalog();
  assert.equal(store.getCatalogState().homeStatus, 'error');
  assert.match(renderHero(), /Try again/);
  homeResponse = { ok: true, heroSlides: [] };
});

test('successful admin hero reorder refreshes the public home snapshot', () => {
  const panel = source('src/components/admin/BackendHomeHeroPanel.jsx');
  assert.match(panel, /run\(\(\) => reorderHomepageEntries/);
  assert.match(panel, /hydrateCatalog\(\{ force: true \}\)/);
});

test('admin forced refresh is not lost while the initial catalogue hydrate is still pending', { timeout: 10000 }, async () => {
  let releaseProducts;
  productGate = new Promise((resolve) => { releaseProducts = resolve; });
  const before = requests.filter((r) => r.path === '/api/v1/home').length;
  homeResponse = { ok: true, heroSlides: [slide('before-admin-edit')] };
  const initial = store.refreshCatalog();
  let refreshed, coalesced;
  try {
    await new Promise((resolve) => {
      const unsubscribe = store.subscribeCatalog(() => {
        if (store.getCatalogState().homeStatus === 'ready') { unsubscribe(); resolve(); }
      });
    });
    assert.match(renderHero(), /before-admin-edit/);
    homeResponse = { ok: true, heroSlides: [slide('after-admin-edit')] };
    // This is the existing BackendHomeHeroPanel.load() refresh call.
    refreshed = store.hydrateCatalog({ force: true });
    coalesced = store.hydrateCatalog({ force: true });
  } finally {
    productGate = null;
    releaseProducts();
    await initial;
  }
  await Promise.all([refreshed, coalesced]);
  assert.match(renderHero(), /after-admin-edit/);
  assert.equal(requests.filter((r) => r.path === '/api/v1/home').length - before, 2,
    'concurrent forced refreshes queue one fresh fetch, not zero or one per caller');
});
