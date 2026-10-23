/** All twelve homepage sections through the real page + editors; HTTP mocked, no DB.
 *
 * Covers the ten previously-broken sections (sarees..trust) plus hero and
 * categories regression: editor selection per section/type, configure → save →
 * reload persistence, invalid rejection, media/product validation, add/edit/
 * remove/activate/reorder, data-driven nav statuses, unauthorized denial, the
 * admin/super-admin/employee permission matrix, and per-section preview.
 *
 * The mocked backend mirrors the real contract (typed REGISTRY slots with
 * capacities, revision tracking with 409 on stale writes, 422 shapes for
 * invalid payloads, exact-membership reorder). Slot vocabulary and capacities
 * below match backend/app/schemas/media/homepage.py REGISTRY exactly.
 */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const root = new URL('../../../../../', import.meta.url).pathname;
const original = { fetch: globalThis.fetch, storage: globalThis.localStorage, window: globalThis.window, act: globalThis.IS_REACT_ACT_ENVIRONMENT };

// -- actors -----------------------------------------------------------------
const superAdmin = { adminId: 'super', accountLevel: 'SUPER_ADMIN', status: 'ACTIVE', permissions: [] };
const adminFull = { adminId: 'admin', accountLevel: 'ADMIN', status: 'ACTIVE', permissions: ['marketing.view', 'marketing.manage', 'media.view', 'media.upload', 'media.assign', 'media.delete'] };
const adminViewer = { adminId: 'viewer', accountLevel: 'ADMIN', status: 'ACTIVE', permissions: ['marketing.view', 'media.view'] };
const adminNoMedia = { adminId: 'nomedia', accountLevel: 'ADMIN', status: 'ACTIVE', permissions: ['marketing.view', 'marketing.manage'] };
const employeeFull = { employeeId: 'emp', status: 'ACTIVE', permissions: ['marketing.view', 'marketing.manage', 'media.view', 'media.upload', 'media.assign', 'media.delete'] };
const employeeViewer = { employeeId: 'emp-view', status: 'ACTIVE', permissions: ['marketing.view'] };
const employeeMediaOnly = { employeeId: 'emp-media', status: 'ACTIVE', permissions: ['media.view'] };
const image = { id: 'asset-1', objectKey: 'marketing/probe.avif', url: '/api/v1/media/objects/marketing/probe.avif', mimeType: 'image/avif', status: 'uploaded' };
const image2 = { id: 'asset-2', objectKey: 'marketing/probe-2.avif', url: '/api/v1/media/objects/marketing/probe-2.avif', mimeType: 'image/avif', status: 'uploaded' };
const product1 = { id: 'PROD-1', name: 'Published silk', status: 'PUBLISHED', published: true, image: '/api/v1/media/objects/products/PROD-1/primary.avif' };
const product2 = { id: 'PROD-2', name: 'Published cotton', status: 'PUBLISHED', published: true, image: '/api/v1/media/objects/products/PROD-2/primary.avif' };

// -- registry mirror (backend/app/schemas/media/homepage.py) -----------------
const T = (slotKey) => ({ slotKey, contentType: 'TEXT', capacity: 1 });
const M = (slotKey) => ({ slotKey, contentType: 'MEDIA', capacity: 1 });
const P = (slotKey, capacity) => ({ slotKey, contentType: 'PRODUCT', capacity });
const REGISTRY = {
  categories: [T('intro'), M('women'), M('men'), M('kids'), M('essentials'), P('women-products', 4), P('men-products', 4), P('kids-products', 4), P('essentials-products', 4)],
  sarees: [T('intro'), T('silk-classics'), T('everyday-elegance'), T('festive-sarees'), T('contemporary-drapes'), M('lookbook-1'), M('lookbook-2'), M('lookbook-3'), P('products', 4)],
  bridal: [T('intro'), M('bride'), M('groom'), M('couple'), P('bride-products', 4), P('groom-products', 4)],
  jewellery: [T('intro'), M('campaign'), P('products', 24)],
  promotion: [T('intro'), M('campaign')],
  men: [T('intro'), T('kurtas'), T('bandhgalas'), T('sherwanis'), T('accessories'), M('campaign'), P('featured', 1), P('products', 4)],
  kids: [T('intro'), T('girls'), T('boys'), T('festive'), M('main'), M('girls'), M('boys'), P('products', 24)],
  bestsellers: [T('intro'), P('products', 8)],
  kurtis: [T('intro'), M('everyday-kurtis'), M('anarkalis'), M('festive-kurtis'), M('kurta-sets'), P('everyday-kurtis', 4), P('anarkalis', 4), P('festive-kurtis', 4), P('kurta-sets', 4), P('pairings', 4)],
  newsletter: [T('intro'), T('fine-print'), M('campaign')],
  trust: [T('delivery'), T('authentic'), T('secure'), T('returns'), T('help')],
};
const TITLES = { hero: 'Home hero', categories: 'Category collage', sarees: 'Saree lookbook', bridal: 'Bridal campaign', jewellery: 'Jewellery theatre', promotion: 'Promotion banner', men: 'Men’s editorial', kids: 'Kids playground', bestsellers: 'Bestsellers', kurtis: 'Kurti lookbook', newsletter: 'Newsletter', trust: 'Trust strip' };
const GROUPS = { 'trust|TEXT': ['delivery', 'authentic', 'secure', 'returns', 'help'], 'sarees|MEDIA': ['lookbook-1', 'lookbook-2', 'lookbook-3'] };

let vite, Page, AdminContext, EmployeeContext, SectionPreview, model;
let sections, heroRows, requests, renderers, fail;
const text = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
const flush = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const stateOf = (sec) => !sec.configured ? 'missing' : !sec.isActive ? 'inactive' : sec.items.some((r) => r.isActive) ? 'ready' : 'empty';
const sectionState = (key) => sections[key] ?? (sections[key] = { key, configured: false, state: 'missing', source: 'legacy', items: [], revision: 0, isActive: false, allowedSlots: REGISTRY[key] ?? [] });

const validCTA = (href) => !href || (/^\/(?!\/)/.test(href) && !/[\x00-\x20\\]/.test(href));

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  Page = (await load('pages/admin/media/AdminMarketingMedia.jsx')).default;
  AdminContext = (await load('context/AdminAuthContext.jsx')).default;
  EmployeeContext = (await load('context/EmployeeAuthContext.jsx')).default;
  SectionPreview = (await load('components/admin/homepage/SectionPreview.jsx')).default;
  model = await load('services/homepage/homepageContentModel.js');
});

beforeEach(() => {
  sections = {}; heroRows = []; requests = []; renderers = []; fail = {};
  const data = new Map([['pf_admin_access_token', 'admin-token'], ['pf_employee_access_token', 'employee-token']]);
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, confirm: () => true };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), 'https://test.invalid');
    const method = options.method ?? 'GET';
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
    requests.push({ path: url.pathname, method, body, auth: options.headers?.Authorization });
    let result = { ok: true }, status = 200;
    const failWith = (code, message) => { status = code; result = { detail: message }; };
    if ((url.pathname === '/api/v1/admin/homepage/sections' || url.pathname === '/api/v1/employee/homepage/sections') && method === 'GET') {
      if (fail.list) failWith(503, 'Sections unavailable');
      else result = { ok: true, version: 1, status: 'ready', sections: [{ key: 'hero', source: 'heroSlides', state: 'delegated' }, ...Object.keys(REGISTRY).map((key) => ({ ...sectionState(key), allowedSlots: REGISTRY[key] }))] };
    } else if (/\/homepage\/sections\/[^/]+$/.test(url.pathname) && method === 'GET') {
      const key = decodeURIComponent(url.pathname.split('/').at(-1));
      if (!REGISTRY[key]) failWith(422, 'Unknown or delegated homepage section.');
      else if (fail.read) failWith(503, 'Section unavailable');
      else result = { ok: true, section: sectionState(key) };
    } else if (/\/homepage\/sections\/[^/]+$/.test(url.pathname) && method === 'PUT') {
      const key = decodeURIComponent(url.pathname.split('/').at(-1));
      const sec = sectionState(key);
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else { sec.configured = true; sec.source = 'sections'; sec.revision += 1; sec.isActive = body.isActive; sec.state = stateOf(sec); result = { ok: true, section: sec }; }
    } else if (/\/homepage\/sections\/[^/]+\/items$/.test(url.pathname) && method === 'POST') {
      const key = decodeURIComponent(url.pathname.split('/').at(-2));
      const sec = sectionState(key);
      const spec = (REGISTRY[key] ?? []).find((s) => s.slotKey === body.slotKey && s.contentType === body.contentType);
      const same = sec.items.filter((r) => r.slotKey === body.slotKey && r.contentType === body.contentType);
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else if (!spec) failWith(422, 'Unsupported typed slot.');
      else if (same.length >= spec.capacity || (body.productId && same.some((r) => r.productId === body.productId))) failWith(409, 'Slot capacity or duplicate assignment conflict.');
      else if (body.contentType === 'TEXT' && ![body.title, body.subtitle, body.eyebrow].some((v) => String(v ?? '').trim())) failWith(422, 'Text requires meaningful copy');
      else if (body.contentType === 'MEDIA' && !body.mediaAssetId) failWith(422, 'Content type and resource references disagree');
      else if (body.contentType === 'PRODUCT' && !body.productId) failWith(422, 'Content type and resource references disagree');
      else if (!validCTA(body.ctaHref)) failWith(422, 'CTA must be a safe single-slash site-relative URL');
      else {
        sec.revision += 1;
        const item = { ...body, id: `entry-${sec.revision}`, sortOrder: sec.items.length };
        if (body.contentType === 'TEXT') item.text = { ...body };
        if (body.contentType === 'MEDIA') item.media = { url: '/api/v1/media/objects/marketing/probe.avif', ...body };
        if (body.contentType === 'PRODUCT') item.product = body.productId === 'PROD-2' ? product2 : product1;
        sec.items.push(item); sec.state = stateOf(sec); result = { ok: true, section: sec };
      }
    } else if (/\/homepage\/sections\/[^/]+\/items\/[^/]+$/.test(url.pathname) && (method === 'PATCH' || method === 'DELETE')) {
      const parts = url.pathname.split('/');
      const key = decodeURIComponent(parts.at(-3));
      const id = decodeURIComponent(parts.at(-1));
      const sec = sectionState(key);
      const row = sec.items.find((r) => r.id === id);
      const expected = method === 'DELETE' ? Number(url.searchParams.get('expectedRevision')) : body.expectedRevision;
      if (!row) failWith(404, 'Entry does not belong to this section.');
      else if (expected !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else if (method === 'DELETE') { sec.items = sec.items.filter((r) => r.id !== id); sec.revision += 1; sec.state = stateOf(sec); result = { ok: true, section: sec }; }
      else {
        if (body.ctaHref !== undefined && !validCTA(body.ctaHref)) failWith(422, 'CTA must be a safe single-slash site-relative URL');
        else { Object.assign(row, body); if (row.text) Object.assign(row.text, body); if (row.media) Object.assign(row.media, body); sec.revision += 1; sec.state = stateOf(sec); result = { ok: true, section: sec }; }
      }
    } else if (/\/homepage\/sections\/[^/]+\/reorder$/.test(url.pathname) && method === 'PUT') {
      const key = decodeURIComponent(url.pathname.split('/').at(-2));
      const sec = sectionState(key);
      const group = GROUPS[`${key}|${body.contentType}`] ?? [body.slotKey];
      const selected = sec.items.filter((r) => group.includes(r.slotKey) && r.contentType === body.contentType);
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else if (body.itemIds.length !== new Set(body.itemIds).size || body.itemIds.length !== selected.length || !body.itemIds.every((id) => selected.some((r) => r.id === id))) failWith(409, 'Reorder requires the exact current typed-slot membership.');
      else { body.itemIds.forEach((id, order) => { selected.find((r) => r.id === id).sortOrder = order; }); sec.items.sort((a, b) => a.sortOrder - b.sortOrder); sec.revision += 1; result = { ok: true, section: sec }; }
    } else if (url.pathname === '/api/v1/admin/marketing/media' && method === 'GET') {
      result = { items: heroRows.filter((r) => r.placement === url.searchParams.get('placement')), total: heroRows.length };
    } else if (url.pathname === '/api/v1/admin/marketing/media' && method === 'POST') {
      result = { ...body, id: `hero-${heroRows.length + 1}`, url: `/api/v1/media/objects/${body.objectKey}` }; heroRows.push(result);
    } else if (url.pathname.startsWith('/api/v1/admin/marketing/media/') && method === 'PATCH') {
      Object.assign(heroRows.find((r) => r.id === decodeURIComponent(url.pathname.split('/').at(-1))), body);
      result = heroRows.find((r) => r.id === decodeURIComponent(url.pathname.split('/').at(-1)));
    } else if (url.pathname.startsWith('/api/v1/admin/marketing/media/') && method === 'DELETE') {
      heroRows = heroRows.filter((r) => r.id !== decodeURIComponent(url.pathname.split('/').at(-1)));
    } else if (url.pathname === '/api/v1/admin/marketing/media/reorder' && method === 'PUT') {
      body.items.forEach((item) => { heroRows.find((r) => r.id === item.id).sortOrder = item.sortOrder; }); result = { items: heroRows };
    } else if (url.pathname === '/api/v1/employee/homepage/hero/items' && method === 'GET') {
      result = { ok: true, items: heroRows, total: heroRows.length, placement: 'HOME_HERO' };
    } else if (url.pathname === '/api/v1/employee/homepage/media-assets') {
      result = { ok: true, items: [image, image2], total: 2, page: 1, pageSize: 24 };
    } else if (url.pathname === '/api/v1/media/assets') {
      result = { items: [image, image2], total: 2, page: 1, pageSize: 24 };
    } else if (url.pathname === '/api/v1/products') {
      result = { items: [product1, product2], total: 2 };
    } else if (url.pathname === '/api/v1/home') {
      result = { heroSlides: [], homepageContent: { version: 1, status: 'ready', sections: [] } };
    } else if (['/api/v1/categories', '/api/v1/collections'].includes(url.pathname)) result = { items: [], total: 0 };
    else if (url.pathname === '/api/v1/offers') result = { offers: [] };
    else throw new Error(`Unexpected request ${method} ${url.pathname}`);
    return new Response(JSON.stringify(result), { status, headers: { 'content-type': 'application/json' } });
  };
});
afterEach(async () => { for (const tree of renderers) await act(async () => { tree.unmount(); }); });
after(async () => {
  await vite?.close();
  for (const [key, value] of [['fetch', original.fetch], ['localStorage', original.storage], ['window', original.window], ['IS_REACT_ACT_ENVIRONMENT', original.act]]) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
});

// -- helpers ----------------------------------------------------------------
const mountPage = async (admin = superAdmin, path = '/super-admin/media/marketing', employee = null) => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(AdminContext.Provider, { value: { admin, isSuperAdmin: admin?.accountLevel === 'SUPER_ADMIN', isLoading: false } },
        React.createElement(EmployeeContext.Provider, { value: { employee, isLoading: false } }, React.createElement(Page)))));
  });
  renderers.push(tree); await flush(); await flush(); return tree;
};
const click = async (tree, label, { index = 0 } = {}) => {
  const matches = tree.root.findAllByType('button').filter((b) => text(b) === label);
  assert.ok(matches.length > index, `button exists: ${label}[${index}]`);
  const button = matches[index];
  assert.notEqual(button.props.disabled, true, `button enabled: ${label}[${index}]`);
  await act(async () => { await button.props.onClick(); }); await flush();
};
const navTo = async (tree, key) => {
  const button = tree.root.findAllByType('button').find((b) => text(b).includes(TITLES[key]));
  assert.ok(button, `nav exists: ${key}`);
  await act(async () => { button.props.onClick(); }); await flush(); await flush();
};
/* F-08 (Batch 3) renamed the visible copy labels; the locator follows the
   label text case-insensitively. No assertion changed. */
const fieldLabel = (l, field) => text(l).toLowerCase() === String(field).toLowerCase();
const fill = async (tree, field, value) => act(async () => {
  const label = tree.root.findAllByType('label').find((l) => fieldLabel(l, field));
  assert.ok(label, `field exists: ${field}`);
  /* F-08: subtitle is now a textarea; other copy fields stay inputs. */
  const control = label.findAllByType('input')[0] ?? label.findAllByType('textarea')[0];
  assert.ok(control, `control exists: ${field}`);
  control.props.onChange({ target: { value } });
});
const submit = async (tree) => { await act(async () => { tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); await flush(); await flush(); };
const ensureConfigured = async (tree) => {
  if (/Configure section \(initially hidden\)/.test(text(tree.root))) { await click(tree, 'Configure section (initially hidden)'); await flush(); }
};
const navLabels = (tree) => Object.fromEntries(Object.keys(TITLES).map((key) => {
  const button = tree.root.findAllByType('button').find((b) => text(b).includes(TITLES[key]));
  const spans = button.findAllByType('span');
  return [key, text(spans.at(-1))];
}));

// -- 1. inventory + statuses -------------------------------------------------
test('all twelve sections render in order with persisted-data statuses', async () => {
  sections.sarees = { key: 'sarees', configured: true, state: 'inactive', source: 'sections', items: [], revision: 1, isActive: false, allowedSlots: REGISTRY.sarees };
  sections.bridal = { key: 'bridal', configured: true, state: 'empty', source: 'sections', items: [], revision: 2, isActive: true, allowedSlots: REGISTRY.bridal };
  sections.trust = { key: 'trust', configured: true, state: 'ready', source: 'sections', items: [{ id: 'e1', slotKey: 'delivery', contentType: 'TEXT', isActive: true, title: 'T' }], revision: 3, isActive: true, allowedSlots: REGISTRY.trust };
  heroRows = [{ id: 'h1', placement: 'HOME_HERO', isActive: true, sortOrder: 0 }, { id: 'h2', placement: 'HOME_HERO', isActive: false, sortOrder: 1 }];
  const tree = await mountPage();
  const labels = navLabels(tree);
  assert.equal(labels.hero, '2 saved · 1 active');
  assert.equal(labels.categories, 'Hidden until configured');
  assert.equal(labels.sarees, 'Configured · inactive');
  assert.equal(labels.bridal, 'Active · no eligible content');
  assert.equal(labels.trust, 'Active');
  // Order matches the storefront visual order.
  const nav = tree.root.findByProps({ 'aria-label': 'Homepage sections' });
  const navTitles = nav.findAllByType('button').map((b) => text(b).replace(/^\d+/, ''));
  assert.deepEqual(navTitles.map((t) => Object.keys(TITLES).find((k) => t.startsWith(TITLES[k]))), Object.keys(TITLES));
});

test('sectionStatusLabel distinguishes missing, inactive, empty, ready and unavailable', () => {
  assert.equal(model.sectionStatusLabel(undefined), 'Status unavailable');
  assert.equal(model.sectionStatusLabel({ configured: false, state: 'missing' }), 'Hidden until configured');
  assert.equal(model.sectionStatusLabel({ configured: true, state: 'inactive', isActive: false }), 'Configured · inactive');
  assert.equal(model.sectionStatusLabel({ configured: true, state: 'empty', isActive: true }), 'Active · no eligible content');
  assert.equal(model.sectionStatusLabel({ configured: true, state: 'ready', isActive: true }), 'Active');
  assert.equal(model.sectionStatusLabel({ configured: true, state: 'unavailable' }), 'Status unavailable');
});

test('a failed status read reports a retryable server error, never a fake configured state', async () => {
  fail.list = true;
  const tree = await mountPage();
  const labels = navLabels(tree);
  assert.equal(labels.sarees, 'Server error — retry');
  assert.equal(labels.trust, 'Server error — retry');
});

// -- 2. editor selection ------------------------------------------------------
test('hero selects the marketing-media panel; PRODUCT explains the missing slot', async () => {
  const tree = await mountPage();
  assert.match(text(tree.root), /HOME_HERO — Hero carousel/);
  await click(tree, 'TEXT');
  assert.match(text(tree.root), /HOME_HERO — Hero carousel/);
  await click(tree, 'PRODUCT');
  assert.match(text(tree.root), /No product slot/);
});

for (const key of Object.keys(REGISTRY)) {
  test(`${key}: non-hero section selects the typed section editor`, async () => {
    const tree = await mountPage();
    await navTo(tree, key);
    assert.match(text(tree.root), /Not configured · hidden on the storefront/);
    assert.match(text(tree.root), /Configure section \(initially hidden\)/);
  });
}

/* Batch 2 (F-23): a type with no registered slot is disabled and labelled
   `· none` BEFORE any write, so pressing Configure can no longer be the way to
   discover that a tab is a dead end. The old flow configured the section first
   and then printed "No … slot is registered"; that message remains in the
   editor as a defensive fallback but is no longer reachable by clicking. */
test('unsupported type/slot combinations are disabled before any write (F-23)', async () => {
  const tree = await mountPage();
  const cases = [['bestsellers', 'MEDIA'], ['trust', 'MEDIA'], ['trust', 'PRODUCT'], ['promotion', 'PRODUCT'], ['newsletter', 'PRODUCT']];
  for (const [key, kind] of cases) {
    await navTo(tree, key);
    const tab = tree.root.findAllByType('button').find((b) => text(b) === `${kind} · none`);
    assert.ok(tab, `${key}/${kind} is labelled with no slots`);
    assert.equal(tab.props.disabled, true, `${key}/${kind} cannot be opened`);
    assert.equal(requests.filter((r) => r.method === 'PUT').length, 0, `${key}: selecting the section wrote nothing`);
  }
  /* A live type stays enabled with its plain label. */
  const textTab = tree.root.findAllByType('button').find((b) => text(b) === 'TEXT');
  assert.ok(textTab, 'a registered type keeps its plain label');
  assert.notEqual(textTab.props.disabled, true);
});

// -- 3-4. configure → save → reload per section --------------------------------
async function saveText(tree, title) {
  await fill(tree, 'title', title);
  await submit(tree);
  assert.match(text(tree.root), new RegExp(title));
}

test('categories regression: TEXT + MEDIA + PRODUCT configure, save, activate, reload', async () => {
  const tree = await mountPage();
  await navTo(tree, 'categories');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await saveText(tree, 'Categories heading');
  await click(tree, 'MEDIA');
  await click(tree, image.objectKey);
  await fill(tree, 'title', 'Women art');
  await submit(tree);
  assert.match(text(tree.root), /Women art/);
  await click(tree, 'PRODUCT');
  await act(async () => { tree.root.findAllByProps({ type: 'checkbox' })[0].props.onChange({ target: { checked: true } }); });
  await submit(tree);
  assert.match(text(tree.root), /PROD-1/);
  await click(tree, 'Activate entry');
  await click(tree, 'Activate section');
  assert.match(text(tree.root), /Backend controlled · ready/);
  await act(async () => tree.unmount());
  renderers.splice(renderers.indexOf(tree), 1);
  const reloaded = await mountPage();
  await navTo(reloaded, 'categories');
  await click(reloaded, 'TEXT');
  assert.match(text(reloaded.root), /Categories heading/);
  assert.equal(navLabels(reloaded).categories, 'Active');
});

for (const key of ['sarees', 'bridal', 'jewellery', 'promotion', 'men', 'kids', 'bestsellers', 'kurtis', 'newsletter', 'trust']) {
  test(`${key}: configure, save TEXT, reload persists`, async () => {
    const tree = await mountPage();
    await navTo(tree, key);
    await click(tree, 'TEXT');
    await ensureConfigured(tree);
    await saveText(tree, `${TITLES[key]} heading`);
    await act(async () => tree.unmount());
    renderers.splice(renderers.indexOf(tree), 1);
    const reloaded = await mountPage();
    await navTo(reloaded, key);
    await click(reloaded, 'TEXT');
    assert.match(text(reloaded.root), new RegExp(`${TITLES[key]} heading`));
  });
}

for (const [key, slot] of [['sarees', 'lookbook-1'], ['bridal', 'bride'], ['jewellery', 'campaign'], ['promotion', 'campaign'], ['men', 'campaign'], ['kids', 'main'], ['kurtis', 'everyday-kurtis'], ['newsletter', 'campaign']]) {
  test(`${key}: MEDIA entry saves against registered asset in ${slot}`, async () => {
    const tree = await mountPage();
    await navTo(tree, key);
    await click(tree, 'MEDIA');
    await ensureConfigured(tree);
    await click(tree, image.objectKey);
    await fill(tree, 'title', `${TITLES[key]} art`);
    await submit(tree);
    assert.match(text(tree.root), new RegExp(`${TITLES[key]} art`));
    const posted = requests.filter((r) => r.method === 'POST' && r.path.endsWith('/items')).at(-1);
    assert.equal(posted.body.slotKey, slot);
    assert.equal(posted.body.mediaAssetId, 'asset-1');
    assert.equal(posted.body.isActive, false);
  });
}

for (const [key, slot] of [['sarees', 'products'], ['bridal', 'bride-products'], ['jewellery', 'products'], ['men', 'featured'], ['kids', 'products'], ['bestsellers', 'products'], ['kurtis', 'pairings']]) {
  test(`${key}: PRODUCT entry saves a published catalogue reference in ${slot}`, async () => {
    const tree = await mountPage();
    await navTo(tree, key);
    await click(tree, 'PRODUCT');
    await ensureConfigured(tree);
    if (key === 'kurtis') await act(async () => { tree.root.findByType('select').props.onChange({ target: { value: 'pairings' } }); });
    await act(async () => { tree.root.findAllByProps({ type: 'checkbox' })[0].props.onChange({ target: { checked: true } }); });
    await submit(tree);
    assert.match(text(tree.root), /PROD-1/);
    const posted = requests.filter((r) => r.method === 'POST' && r.path.endsWith('/items')).at(-1);
    assert.equal(posted.body.slotKey, slot);
    assert.equal(posted.body.productId, 'PROD-1');
    assert.ok(!('title' in posted.body), 'products carry no editorial overrides');
  });
}

// -- 5. reference validation --------------------------------------------------
test('MEDIA cannot save without a registered asset; PRODUCT without a product', async () => {
  const tree = await mountPage();
  await navTo(tree, 'sarees');
  await click(tree, 'MEDIA');
  await ensureConfigured(tree);
  await fill(tree, 'title', 'No asset');
  const save = tree.root.findAllByType('button').find((b) => text(b) === 'Save section entry');
  assert.equal(save.props.disabled, true);
  await navTo(tree, 'bestsellers');
  await click(tree, 'PRODUCT');
  await ensureConfigured(tree);
  const saveProduct = tree.root.findAllByType('button').find((b) => text(b) === 'Save section entry');
  assert.equal(saveProduct.props.disabled, true);
  assert.equal(requests.filter((r) => r.method === 'POST').length, 0);
});

// -- 6. rejection paths --------------------------------------------------------
test('invalid payload rejection surfaces the backend message and allows retry', async () => {
  const tree = await mountPage();
  await navTo(tree, 'trust');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  // Empty copy is rejected by the backend shape check (422, no reload trap).
  await fill(tree, 'title', '   ');
  await act(async () => { tree.root.findAllByType('label').find((l) => fieldLabel(l, 'title')).findByType('input').props.onChange({ target: { value: 'x' } }); });
  // Force the 422 path by clearing again after dirty (submit with blank copy).
  await act(async () => { tree.root.findAllByType('label').find((l) => fieldLabel(l, 'title')).findByType('input').props.onChange({ target: { value: '   ' } }); });
  await submit(tree);
  assert.match(text(tree.root), /Text requires meaningful copy/);
  assert.doesNotMatch(text(tree.root), /Reload and reconcile/);
  await fill(tree, 'title', 'Recovered copy');
  await submit(tree);
  assert.match(text(tree.root), /Recovered copy/);
});

test('revision conflict preserves the draft and requires reload before retry', async () => {
  const tree = await mountPage();
  await navTo(tree, 'sarees');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await fill(tree, 'title', 'Stale write');
  sectionState('sarees').revision += 5; // another operator saved first
  await submit(tree);
  assert.match(text(tree.root), /Content changed/);
  assert.match(text(tree.root), /Reload and reconcile/);
  assert.equal(tree.root.findAllByType('button').find((b) => text(b) === 'Save section entry').props.disabled, true);
  await click(tree, 'Reload section and public content');
  assert.equal(tree.root.findAllByType('label').find((l) => fieldLabel(l, 'title')).findByType('input').props.value, '');
});

// -- 7. entry operations --------------------------------------------------------
test('edit, activate, deactivate and remove operate on the saved entry', async () => {
  const tree = await mountPage();
  await navTo(tree, 'promotion');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await saveText(tree, 'Promo v1');
  await click(tree, 'Edit entry');
  await fill(tree, 'title', 'Promo v2');
  await submit(tree);
  assert.match(text(tree.root), /Promo v2/);
  await click(tree, 'Activate entry');
  assert.match(text(tree.root), /Active/);
  await click(tree, 'Deactivate entry');
  await click(tree, 'Remove entry');
  assert.doesNotMatch(text(tree.root), /Promo v2/);
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.path.includes('/items/')));
});

test('section activation is blocked while a save conflict is unresolved', async () => {
  const tree = await mountPage();
  await navTo(tree, 'men');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await fill(tree, 'title', 'Pending');
  sectionState('men').revision += 1;
  await submit(tree);
  assert.match(text(tree.root), /Reload and reconcile/);
  assert.equal(tree.root.findAllByType('button').find((b) => text(b) === 'Activate section').props.disabled, true);
});

// -- 8. ordering -----------------------------------------------------------------
test('trust TEXT entries reorder as one group with exact membership', async () => {
  const tree = await mountPage();
  await navTo(tree, 'trust');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await saveText(tree, 'First trustee');
  await saveText(tree, 'Second trustee');
  const before = sectionState('trust').items.map((r) => r.id);
  await click(tree, 'Move entry up', { index: 1 }); // second entry moves above the first
  assert.equal(requests.filter((r) => r.path.endsWith('/reorder')).length, 0, 'the move is local until committed');
  await click(tree, 'Save order');
  const sent = requests.filter((r) => r.path.endsWith('/reorder')).at(-1).body;
  assert.equal(sent.slotKey, 'trust-items');
  assert.equal(sent.contentType, 'TEXT');
  assert.deepEqual(sent.itemIds, [before[1], before[0]]);
  assert.equal(new Set(sent.itemIds).size, 2);
});

test('sarees lookbook MEDIA entries reorder as one group', async () => {
  const tree = await mountPage();
  await navTo(tree, 'sarees');
  await click(tree, 'MEDIA');
  await ensureConfigured(tree);
  await click(tree, image.objectKey);
  await fill(tree, 'title', 'Frame one');
  await submit(tree);
  await click(tree, image2.objectKey);
  await fill(tree, 'title', 'Frame two');
  await submit(tree);
  await click(tree, 'Move entry up', { index: 1 });
  await click(tree, 'Save order');
  const sent = requests.filter((r) => r.path.endsWith('/reorder')).at(-1).body;
  assert.equal(sent.slotKey, 'lookbook');
  assert.equal(sent.contentType, 'MEDIA');
  assert.equal(sent.itemIds.length, 2);
});

test('bestsellers PRODUCT entries reorder within their slot', async () => {
  const tree = await mountPage();
  await navTo(tree, 'bestsellers');
  await click(tree, 'PRODUCT');
  await ensureConfigured(tree);
  await act(async () => { tree.root.findAllByProps({ type: 'checkbox' })[0].props.onChange({ target: { checked: true } }); });
  await submit(tree);
  await act(async () => { tree.root.findAllByProps({ type: 'checkbox' })[1].props.onChange({ target: { checked: true } }); });
  await submit(tree);
  await click(tree, 'Move entry up', { index: 1 });
  await click(tree, 'Save order');
  const sent = requests.filter((r) => r.path.endsWith('/reorder')).at(-1).body;
  assert.equal(sent.slotKey, 'products');
  assert.equal(sent.contentType, 'PRODUCT');
  assert.equal(sent.itemIds.length, 2);
});

test('singleton slots offer no reorder control', async () => {
  const tree = await mountPage();
  await navTo(tree, 'newsletter');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await saveText(tree, 'Intro copy');
  assert.equal(tree.root.findAllByType('button').some((b) => text(b) === 'Move entry up'), false);
});

// -- 9. capacity ------------------------------------------------------------------
test('full singleton slots are disabled and the form defaults to the next open slot', async () => {
  const tree = await mountPage();
  await navTo(tree, 'trust');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await saveText(tree, 'Delivery copy');
  const select = tree.root.findByType('select');
  assert.equal(select.props.value, 'authentic', 'defaults to the first slot with room');
  const options = select.findAllByType('option');
  assert.equal(options[0].props.disabled, true);
  assert.match(text(options[0]), /delivery \(1\/1 filled — full\)/);
});

test('a completely filled type replaces the create form with an honest message', async () => {
  const tree = await mountPage();
  await navTo(tree, 'promotion');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await saveText(tree, 'Only intro');
  assert.match(text(tree.root), /All TEXT slots are filled/);
  assert.equal(tree.root.findAllByType('form').length, 0);
  // Entries remain editable.
  await click(tree, 'Edit entry');
  assert.match(text(tree.root), /Edit saved entry/);
});

// -- 10. preview -------------------------------------------------------------------
// jewellery + bestsellers use framer-motion `layout` projection, which touches
// `document` during layout effects and therefore cannot mount under
// react-test-renderer (node has no DOM). Browsers are unaffected. Both are
// covered by the SSR preview test below, which skips layout effects.
// kurtis joined them in Batch 1: the preview now renders all four structural
// mood slots (placeholders instead of invented art), so its LayoutGroup /
// layoutId projection runs where it previously rendered an empty selector.
// The SSR test still covers kurtis with the same draft-copy assertion.
for (const key of ['categories', 'bridal', 'promotion', 'men', 'kids', 'newsletter', 'trust']) {
  test(`${key}: preview tab renders the storefront section without crashing`, async () => {
    const tree = await mountPage();
    await navTo(tree, key);
    await click(tree, 'TEXT');
    await ensureConfigured(tree);
    await saveText(tree, `${TITLES[key]} live`);
    await click(tree, 'Preview');
    await flush(); await flush();
    const body = text(tree.root);
    assert.doesNotMatch(body, /Preview unavailable/, `${key}: preview boundary tripped`);
    assert.match(body, /Preview — saved content \(no unsaved changes\)/, `${key}: honest preview header`);
    assert.match(body, new RegExp(`${TITLES[key]} live`), `${key}: saved copy visible in preview`);
  });
}

test('all eleven section previews render server-side, including the sarees rail', () => {
  // Sarees uses scroll-linked motion whose async ref hydration cannot settle
  // under react-test-renderer teardown; SSR skips effects and is the honest
  // environment for it (the browser hydrates the ref normally).
  for (const key of Object.keys(REGISTRY)) {
    const allowedSlots = REGISTRY[key];
    const firstText = allowedSlots.find((s) => s.contentType === 'TEXT');
    const section = { key, configured: true, state: 'ready', source: 'sections', isActive: true, revision: 2, allowedSlots, items: [] };
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement(SectionPreview, { sectionKey: key, draft: { eyebrow: 'E', title: `${TITLES[key]} SSR`, subtitle: 'S', ctaLabel: '', ctaHref: '', altText: '' }, asset: null, product: null, slot: firstText.slotKey, contentType: 'TEXT', section })));
    assert.match(html, /Preview — includes unsaved changes \(not saved\)/, `${key}: SSR preview header`);
    assert.match(html, new RegExp(`${TITLES[key]} SSR`), `${key}: SSR preview shows draft copy`);
  }
});

// -- 11/12. statuses refresh + hero counts ------------------------------------------
test('nav status follows configure → activate without a page reload', async () => {
  const tree = await mountPage();
  assert.equal(navLabels(tree).kids, 'Hidden until configured');
  await navTo(tree, 'kids');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await saveText(tree, 'Kids copy');
  assert.equal(navLabels(tree).kids, 'Configured · inactive');
  await click(tree, 'Activate entry');
  await click(tree, 'Activate section');
  assert.equal(navLabels(tree).kids, 'Active');
});

test('hero nav counts follow hero saves', async () => {
  const tree = await mountPage();
  assert.equal(navLabels(tree).hero, 'No saved entries');
  await click(tree, 'Add registered media');
  await click(tree, image.objectKey);
  await act(async () => { tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  await flush(); await flush();
  assert.match(text(tree.root), /Saved to backend/);
  assert.equal(navLabels(tree).hero, '1 saved · 0 active');
});

// -- 13. permissions -----------------------------------------------------------------
test('read-only marketing viewer gets no save or configuration controls', async () => {
  const tree = await mountPage(adminViewer, '/admin/media/marketing');
  await navTo(tree, 'sarees');
  assert.match(text(tree.root), /Not configured/);
  assert.equal(tree.root.findAllByType('form').length, 0);
  assert.equal(tree.root.findAllByType('button').some((b) => text(b).startsWith('Configure')), false);
  assert.equal(tree.root.findAllByType('button').some((b) => text(b) === 'Save section entry'), false);
});

test('marketing manager without media grants cannot touch MEDIA but keeps TEXT/PRODUCT', async () => {
  const tree = await mountPage(adminNoMedia, '/admin/media/marketing');
  await navTo(tree, 'jewellery');
  await click(tree, 'MEDIA');
  await ensureConfigured(tree);
  assert.equal(tree.root.findAllByType('form').length, 0, 'MEDIA form requires media.assign');
  await click(tree, 'TEXT');
  await saveText(tree, 'Copy without media grants');
  assert.match(text(tree.root), /Copy without media grants/);
});

test('admin without marketing grants sees unavailable controls and sends no homepage writes', async () => {
  const mediaOnly = { adminId: 'm', accountLevel: 'ADMIN', status: 'ACTIVE', permissions: ['media.view'] };
  const tree = await mountPage(mediaOnly, '/admin/media/marketing');
  await navTo(tree, 'sarees');
  assert.match(text(tree.root), /control unavailable/);
  assert.equal(requests.filter((r) => r.path.includes('/homepage/sections/') && r.method !== 'GET').length, 0);
  assert.equal(navLabels(tree).sarees, 'Requires marketing.view');
});

test('employee workspace edits through employee routes with the employee token', async () => {
  const tree = await mountPage(null, '/employee/media/marketing', employeeFull);
  await navTo(tree, 'kurtis');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  await saveText(tree, 'Employee kurtis copy');
  const writes = requests.filter((r) => r.method === 'POST' && r.path.includes('/homepage/sections/'));
  assert.ok(writes.length > 0);
  assert.ok(writes.every((r) => r.path.startsWith('/api/v1/employee/homepage/')));
  assert.ok(writes.every((r) => r.auth === 'Bearer employee-token'));
  assert.ok(!writes.some((r) => r.auth === 'Bearer admin-token'));
});

test('media-only employee gets inspection, not editing', async () => {
  const tree = await mountPage(null, '/employee/media/marketing', employeeMediaOnly);
  await navTo(tree, 'bestsellers');
  await click(tree, 'PRODUCT');
  assert.match(text(tree.root), /Inspection only|marketing\.manage/);
  assert.equal(requests.filter((r) => r.method !== 'GET').length, 0);
});

test('anonymous visitors are denied the control center without any HTTP', async () => {
  const tree = await mountPage(null);
  assert.match(text(tree.root), /access denied/);
  assert.equal(requests.length, 0);
});

// -- 14. newsletter / promotion honesty -------------------------------------------------
test('newsletter stays content-only with fine-print and campaign slots', async () => {
  const tree = await mountPage();
  await navTo(tree, 'newsletter');
  assert.match(text(tree.root), /No verified subscription endpoint/);
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  const slots = tree.root.findByType('select').findAllByType('option').map((o) => o.props.value);
  assert.deepEqual(slots, ['intro', 'fine-print']);
  await saveText(tree, 'Newsletter heading');
  await click(tree, 'MEDIA');
  await click(tree, image.objectKey);
  await fill(tree, 'title', 'Campaign art');
  await submit(tree);
  assert.match(text(tree.root), /Campaign art/);
  assert.match(text(tree.root), /no sign-up is simulated/);
  assert.doesNotMatch(text(tree.root), /Welcome to the Circle/);
});

test('promotion documents its no-discount boundary', async () => {
  const tree = await mountPage();
  await navTo(tree, 'promotion');
  await click(tree, 'TEXT');
  await ensureConfigured(tree);
  assert.match(text(tree.root), /cannot create\/apply discounts, codes or expiry dates/);
});
