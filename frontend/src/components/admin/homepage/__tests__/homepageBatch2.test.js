/**
 * PRATIKSHYA FASHION — Homepage Content Control Center, Batch 2 regression.
 *
 * Covers the six Batch 2 findings against the REAL components and the REAL API
 * clients. HTTP is mocked; no database, no browser, no production write.
 *
 *   F-10  a publish summary exists, and Publish/Save & publish sequence the
 *         EXISTING activation calls (entries first, then the section)
 *   F-09  the media rule that disables section activation is explained
 *   F-23  dead type tabs are disabled and labelled before any write
 *   F-16  moves compose locally and commit as ONE reorder request
 *   F-11  many staged products become N sequential creates (one row per call)
 *   F-03  "register art" points at the placement panel, not the product uploader
 *
 * plus a no-regression group that pins the create/patch payload key sets.
 */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const root = new URL('../../../../../', import.meta.url).pathname;
const original = {
  fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window,
};

const adminFull = {
  adminId: 'admin', accountLevel: 'ADMIN', status: 'ACTIVE',
  permissions: ['marketing.view', 'marketing.manage', 'media.view', 'media.upload', 'media.assign', 'media.delete'],
};
const adminNoMediaAssign = {
  adminId: 'admin2', accountLevel: 'ADMIN', status: 'ACTIVE',
  permissions: ['marketing.view', 'marketing.manage', 'media.view'],
};

const T = (slotKey) => ({ slotKey, contentType: 'TEXT', capacity: 1 });
const M = (slotKey) => ({ slotKey, contentType: 'MEDIA', capacity: 1 });
const P = (slotKey, capacity) => ({ slotKey, contentType: 'PRODUCT', capacity });
const REGISTRY = {
  trust: [T('delivery'), T('authentic'), T('secure'), T('returns'), T('help')],
  bestsellers: [T('intro'), P('products', 8)],
  categories: [T('intro'), M('women'), M('men'), M('kids'), M('essentials'), P('women-products', 4)],
};
const TITLES = { trust: 'Trust strip', bestsellers: 'Bestsellers', categories: 'Category collage' };

const products = [
  { id: 'PROD-1', name: 'Published silk', status: 'PUBLISHED', published: true },
  { id: 'PROD-2', name: 'Published cotton', status: 'PUBLISHED', published: true },
  { id: 'PROD-3', name: 'Published linen', status: 'PUBLISHED', published: true },
];
const image = { id: 'asset-1', objectKey: 'marketing/probe.avif', url: '/api/v1/media/objects/marketing/probe.avif', mimeType: 'image/avif', status: 'uploaded' };

let vite, Page, Editor, Hero, AdminContext, EmployeeContext, model;
let sections, requests, renderers, fail, createCalls;
const text = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
const flush = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const stateOf = (sec) => !sec.configured ? 'missing' : !sec.isActive ? 'inactive' : sec.items.some((r) => r.isActive) ? 'ready' : 'empty';
const sectionState = (key) => sections[key] ?? (sections[key] = { key, configured: false, state: 'missing', source: 'legacy', items: [], revision: 0, isActive: false, allowedSlots: REGISTRY[key] ?? [] });
const writes = () => requests.filter((request) => request.method !== 'GET');
const buttonNamed = (tree, label) => tree.root.findAllByType('button').find((b) => text(b) === label);
const click = async (tree, label, { index = 0 } = {}) => {
  const matches = tree.root.findAllByType('button').filter((b) => text(b) === label);
  assert.ok(matches.length > index, `button exists: ${label}[${index}]`);
  const button = matches[index];
  assert.notEqual(button.props.disabled, true, `button enabled: ${label}[${index}]`);
  await act(async () => { await button.props.onClick(); });
  await flush(); await flush();
  return button;
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
const submitForm = async (tree) => { await act(async () => { tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); await flush(); await flush(); };

const mountPage = async (admin = adminFull) => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(MemoryRouter, { initialEntries: ['/super-admin/media/marketing'] },
      React.createElement(AdminContext.Provider, { value: { admin, isSuperAdmin: true, isLoading: false } },
        React.createElement(EmployeeContext.Provider, { value: { employee: null, isLoading: false } },
          React.createElement(Page)))));
  });
  renderers.push(tree); await flush(); await flush(); await flush();
  return tree;
};

const mountHero = async (admin = adminFull) => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(MemoryRouter, { initialEntries: ['/super-admin/media/marketing'] },
      React.createElement(AdminContext.Provider, { value: { admin, isSuperAdmin: true, isLoading: false } },
        React.createElement(Hero, { placement: 'HOME_HERO', contentType: 'MEDIA' }))));
  });
  renderers.push(tree); await flush(); await flush();
  return tree;
};

const mount = async (Component, props = {}) => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(MemoryRouter, null, React.createElement(Component, props)));
  });
  renderers.push(tree); await flush(); await flush();
  return tree;
};

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  Page = (await load('pages/admin/media/AdminMarketingMedia.jsx')).default;
  AdminContext = (await load('context/AdminAuthContext.jsx')).default;
  EmployeeContext = (await load('context/EmployeeAuthContext.jsx')).default;
  Editor = (await load('components/admin/homepage/SectionContentEditor.jsx')).default;
  Hero = (await load('components/admin/BackendHomeHeroPanel.jsx')).default;
  model = await load('components/admin/homepage/publishModel.js');
});

beforeEach(() => {
  sections = {}; requests = []; renderers = []; fail = {}; createCalls = 0;
  const data = new Map([['pf_admin_access_token', 'admin-token']]);
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, confirm: () => true };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), 'https://test.invalid');
    const method = options.method ?? 'GET';
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
    requests.push({ path: url.pathname, query: url.searchParams, method, body, auth: options.headers?.Authorization });
    let result = { ok: true };
    let status = 200;
    const failWith = (code, message) => { status = code; result = { detail: message }; };

    if ((url.pathname === '/api/v1/admin/homepage/sections' || url.pathname === '/api/v1/employee/homepage/sections') && method === 'GET') {
      result = { ok: true, version: 1, status: 'ready', sections: [{ key: 'hero', state: 'delegated', source: 'heroSlides' }, ...Object.keys(REGISTRY).map((key) => ({ ...sectionState(key), allowedSlots: REGISTRY[key] }))] };
    } else if (/\/homepage\/sections\/[^/]+$/.test(url.pathname) && method === 'GET') {
      const key = decodeURIComponent(url.pathname.split('/').at(-1));
      if (!REGISTRY[key]) failWith(422, 'Unknown or delegated homepage section.');
      else result = { ok: true, section: sectionState(key) };
    } else if (/\/homepage\/sections\/[^/]+$/.test(url.pathname) && method === 'PUT') {
      const key = decodeURIComponent(url.pathname.split('/').at(-1));
      const sec = sectionState(key);
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else { sec.configured = true; sec.source = 'sections'; sec.revision += 1; sec.isActive = body.isActive; sec.state = stateOf(sec); result = { ok: true, section: sec }; }
    } else if (/\/homepage\/sections\/[^/]+\/items$/.test(url.pathname) && method === 'POST') {
      const key = decodeURIComponent(url.pathname.split('/').at(-2));
      const sec = sectionState(key);
      createCalls += 1;
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else if (fail.createAt && createCalls === fail.createAt) failWith(409, 'Duplicate product in slot.');
      else {
        sec.revision += 1;
        const item = { ...body, id: `entry-${sec.revision}`, sortOrder: sec.items.length };
        if (body.contentType === 'TEXT') item.text = { ...body };
        if (body.contentType === 'MEDIA') item.media = { url: image.url, ...body };
        if (body.contentType === 'PRODUCT') item.product = products.find((p) => p.id === body.productId) ?? null;
        sec.items.push(item);
        sec.state = stateOf(sec);
        result = { ok: true, section: sec };
      }
    } else if (/\/homepage\/sections\/[^/]+\/items\/[^/]+$/.test(url.pathname) && (method === 'PATCH' || method === 'DELETE')) {
      const parts = url.pathname.split('/');
      const key = decodeURIComponent(parts.at(-3));
      const sec = sectionState(key);
      const row = sec.items.find((r) => r.id === decodeURIComponent(parts.at(-1)));
      const expected = method === 'DELETE' ? Number(url.searchParams.get('expectedRevision')) : body.expectedRevision;
      if (expected !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else if (!row) failWith(404, 'Entry does not belong to this section.');
      else if (method === 'DELETE') { sec.items = sec.items.filter((r) => r.id !== row.id); sec.revision += 1; sec.state = stateOf(sec); result = { ok: true, section: sec }; }
      else { Object.assign(row, body); sec.revision += 1; sec.state = stateOf(sec); result = { ok: true, section: sec }; }
    } else if (/\/homepage\/sections\/[^/]+\/reorder$/.test(url.pathname) && method === 'PUT') {
      const key = decodeURIComponent(url.pathname.split('/').at(-2));
      const sec = sectionState(key);
      const selected = sec.items.filter((r) => r.contentType === body.contentType
        && (body.contentType !== 'PRODUCT' || r.slotKey === body.slotKey));
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else if (body.itemIds.length !== selected.length || !body.itemIds.every((id) => selected.some((r) => r.id === id))) failWith(409, 'Reorder requires the exact current typed-slot membership.');
      else { body.itemIds.forEach((id, order) => { selected.find((r) => r.id === id).sortOrder = order; }); sec.items.sort((a, b) => a.sortOrder - b.sortOrder); sec.revision += 1; result = { ok: true, section: sec }; }
    } else if (url.pathname === '/api/v1/admin/marketing/media' && method === 'GET') {
      result = { items: [], total: 0, placement: url.searchParams.get('placement') };
    } else if (url.pathname === '/api/v1/employee/homepage/hero/items' && method === 'GET') {
      result = { ok: true, items: [], total: 0 };
    } else if (url.pathname === '/api/v1/products') {
      result = { items: products, total: products.length };
    } else if (url.pathname === '/api/v1/media/assets') {
      result = { items: [image], total: 1, page: 1, pageSize: 24 };
    } else if (url.pathname === '/api/v1/home') {
      result = { heroSlides: [], homepageContent: { version: 1, status: 'ready', sections: [] } };
    } else if (['/api/v1/categories', '/api/v1/collections'].includes(url.pathname)) {
      result = { items: [], total: 0 };
    } else if (url.pathname === '/api/v1/offers') {
      result = { offers: [] };
    } else {
      assert.fail(`Unexpected request ${method} ${url.pathname}`);
    }
    return new Response(JSON.stringify(result), { status, headers: { 'content-type': 'application/json' } });
  };
});

afterEach(async () => { for (const tree of renderers) await act(async () => tree.unmount()); });
after(async () => {
  await vite?.close();
  for (const [key, value] of [['fetch', original.fetch], ['localStorage', original.localStorage], ['window', original.window]]) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
});

/* -- helpers --------------------------------------------------------------- */

const trustSection = ({ active = true, configured = true } = {}) => ({
  key: 'trust', configured, state: configured ? (active ? 'ready' : 'inactive') : 'missing', source: configured ? 'sections' : 'legacy',
  revision: 3, isActive: active, allowedSlots: REGISTRY.trust,
  items: [
    { id: 'e1', slotKey: 'delivery', contentType: 'TEXT', isActive: true, title: 'First promise' },
    { id: 'e2', slotKey: 'authentic', contentType: 'TEXT', isActive: false, title: 'Second promise' },
  ],
});

/* -- F-10 ------------------------------------------------------------------ */

test('F-10 · the panel states how far the section is from live', async () => {
  sections.trust = trustSection({ active: false });
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  assert.match(text(tree.root), /Section inactive · 2 entries \(1 active\)/);
  assert.match(text(tree.root), /To do — Activate every entry/);
  assert.match(text(tree.root), /To do — Activate the section/);
  assert.match(text(tree.root), /Done — Configure the section/);
  assert.ok(buttonNamed(tree, 'Publish section'), 'a single publish action exists');
});

test('F-10 · Publish activates entries first, then the section, one existing call each', async () => {
  sections.trust = trustSection({ active: false });
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await click(tree, 'Publish section');
  const sent = writes().filter((r) => !r.path.endsWith('/reorder'));
  assert.deepEqual(sent.map((r) => `${r.method} ${r.path.split('/api/v1')[1]}`), [
    'PATCH /admin/homepage/sections/trust/items/e2',
    'PUT /admin/homepage/sections/trust',
  ], 'entries are activated before the section, and nothing else is written');
  assert.deepEqual(sent[0].body, { expectedRevision: 3, isActive: true });
  assert.deepEqual(sent[1].body, { expectedRevision: 4, isActive: true }, 'the second call uses the revision the first returned');
  assert.equal(sections.trust.isActive, true);
  assert.equal(sections.trust.items[1].isActive, true);
  assert.match(text(tree.root), /Live on the storefront · 2 entries, all active/);
  assert.equal(writes().length, 2, 'no retries, no extra writes');
});

test('F-10 · Save & publish saves the entry, then activates it and the section', async () => {
  sections.trust = { key: 'trust', configured: true, state: 'inactive', source: 'sections', revision: 1, isActive: false, allowedSlots: REGISTRY.trust, items: [] };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await fill(tree, 'title', 'A new promise');
  await click(tree, 'Save & publish');
  const sent = writes();
  assert.deepEqual(sent.map((r) => r.method), ['POST', 'PATCH', 'PUT'], 'create, activate entry, activate section — in that order');
  assert.equal(sent[0].body.isActive, false, 'creation stays inactive-first');
  assert.equal(sent[0].body.expectedRevision, 1);
  assert.equal(sent[1].body.expectedRevision, 2);
  assert.equal(sent[2].body.expectedRevision, 3);
  assert.equal(sections.trust.isActive, true);
});

test('F-10 · Save & publish with a rejected save never starts the publish loop', async () => {
  sections.trust = { key: 'trust', configured: true, state: 'inactive', source: 'sections', revision: 1, isActive: false, allowedSlots: REGISTRY.trust, items: [] };
  let attempts = 0;
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.includes('/homepage/sections/trust/items') && (options?.method ?? 'GET') === 'POST') {
      attempts += 1;
      requests.push({ path: new URL(url, 'https://test.invalid').pathname, method: 'POST', body: options.body });
      return new Response(JSON.stringify({ detail: 'Title is required.' }), { status: 422, headers: { 'content-type': 'application/json' } });
    }
    return inner(input, options);
  };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await fill(tree, 'title', 'Draft that will be rejected');
  await click(tree, 'Save & publish');
  assert.equal(attempts, 1, 'the rejected create is attempted exactly once');
  assert.equal(writes().length, 1, 'nothing is activated after a rejected save');
  assert.equal(requests.filter((r) => r.method === 'PUT').length, 0, 'the section is never activated');
  assert.equal(sections.trust.isActive, false);
  assert.equal(sections.trust.items.length, 0, 'no row was created');
  assert.match(text(tree.root), /Title is required\./, 'the validation reason is shown');
});

test('F-10 · Publish stops at the first failure and reports what did happen', async () => {
  sections.trust = trustSection({ active: false });
  let attempts = 0;
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.includes('/homepage/sections/trust/items/e2') && (options?.method ?? 'GET') === 'PATCH') {
      attempts += 1;
      requests.push({ path: new URL(url, 'https://test.invalid').pathname, method: 'PATCH', body: options.body });
      return new Response(JSON.stringify({ detail: 'Cannot activate this entry.' }), { status: 422, headers: { 'content-type': 'application/json' } });
    }
    return inner(input, options);
  };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await click(tree, 'Publish section');
  assert.equal(attempts, 1, 'it tries the failing step exactly once');
  assert.equal(writes().length, 1, 'it stops instead of retrying or skipping ahead');
  assert.equal(sections.trust.isActive, false, 'the section was not activated after the failure');
  assert.match(text(tree.root), /Publish stopped: Cannot activate this entry\. Nothing is being retried\./);
});

/* -- F-09 ------------------------------------------------------------------ */

test('F-09 · section activation blocked by the media rule is explained, not silent', async () => {
  sections.categories = {
    key: 'categories', configured: true, state: 'inactive', source: 'sections', revision: 2, isActive: false, allowedSlots: REGISTRY.categories,
    items: [{ id: 'm1', slotKey: 'women', contentType: 'MEDIA', isActive: true, mediaAssetId: 'asset-1', media: { url: image.url } }],
  };
  const tree = await mount(Editor, { actor: { admin: adminNoMediaAssign }, sectionKey: 'categories', contentType: 'TEXT' });
  assert.match(text(tree.root), /This section has an active media entry\. Activating the section needs media\.assign/);
  const activate = buttonNamed(tree, 'Activate section');
  assert.equal(activate.props.disabled, true, 'the same gate still applies');
  assert.equal(activate.props['aria-describedby'], 'activation-reason');
  const reason = tree.root.findAll((node) => node.props?.id === 'activation-reason');
  assert.equal(reason.length, 1, 'the described-by target exists');
  const publish = buttonNamed(tree, 'Publish section');
  assert.equal(publish.props.disabled, true, 'Publish is blocked by the same rule instead of failing with a 403');
  assert.equal(publish.props['aria-describedby'], 'publish-reasons');
  const reasons = tree.root.findAll((node) => node.props?.id === 'publish-reasons');
  assert.match(text(reasons[0]), /This section has an active media entry/);
});

/* -- F-16 ------------------------------------------------------------------ */

test('F-16 · moves compose locally and commit as one reorder request', async () => {
  sections.trust = trustSection({ active: true });
  sections.trust.items.push({ id: 'e3', slotKey: 'secure', contentType: 'TEXT', isActive: true, title: 'Third promise' });
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await click(tree, 'Move entry down', { index: 0 });
  await click(tree, 'Move entry down', { index: 1 });
  assert.equal(writes().length, 0, 'arrow clicks send nothing');
  assert.match(text(tree.root), /Order changed locally/);
  await click(tree, 'Save order');
  const sent = writes();
  assert.equal(sent.length, 1, 'one request for the whole reorder');
  assert.deepEqual(sent[0].body.itemIds, ['e2', 'e3', 'e1']);
  assert.deepEqual(sent[0].body.itemIds.slice().sort(), ['e1', 'e2', 'e3'], 'membership stays exact');
});

test('F-16 · cancelling a composed order sends nothing and keeps the saved order', async () => {
  sections.trust = trustSection({ active: true });
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await click(tree, 'Move entry down', { index: 0 });
  await click(tree, 'Cancel order changes');
  assert.equal(writes().length, 0);
  assert.equal(sections.trust.items[0].id, 'e1', 'the backend order is untouched');
});

/* -- F-11 ------------------------------------------------------------------ */

const bestsellersConfigured = () => ({
  key: 'bestsellers', configured: true, state: 'inactive', source: 'sections', revision: 0, isActive: false,
  allowedSlots: REGISTRY.bestsellers, items: [],
});

test('F-11 · three staged products become three sequential creates, one row each', async () => {
  sections.bestsellers = bestsellersConfigured();
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'bestsellers', contentType: 'PRODUCT' });
  const boxes = tree.root.findAllByProps({ type: 'checkbox' });
  assert.equal(boxes.length, 3, 'every published product is selectable');
  for (const box of boxes) await act(async () => box.props.onChange({ target: { checked: true } }));
  await flush();
  assert.match(text(tree.root), /Selected 3 products · will be added as 3 separate entries/);
  assert.ok(buttonNamed(tree, 'Add 3 products'), 'the button states how many rows it will create');
  await submitForm(tree);
  await flush(); await flush();

  const creates = writes();
  assert.equal(creates.length, 3, 'three POSTs — no bulk endpoint, no combined payload');
  assert.deepEqual(creates.map((r) => r.body.productId), ['PROD-1', 'PROD-2', 'PROD-3']);
  assert.deepEqual(creates.map((r) => r.body.expectedRevision), [0, 1, 2], 'each call uses the revision returned by the previous one');
  for (const request of creates) {
    assert.deepEqual(Object.keys(request.body).sort(), ['contentType', 'expectedRevision', 'isActive', 'productId', 'slotKey']);
    assert.equal(request.body.isActive, false, 'creation stays inactive-first');
    assert.equal(request.body.contentType, 'PRODUCT');
    assert.equal(request.body.slotKey, 'products');
  }
  assert.equal(sections.bestsellers.items.length, 3);
});

test('F-11 · a failure mid-way stops the loop and names what was and was not saved', async () => {
  sections.bestsellers = bestsellersConfigured();
  fail.createAt = 2;
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'bestsellers', contentType: 'PRODUCT' });
  const boxes = tree.root.findAllByProps({ type: 'checkbox' });
  for (const box of boxes.slice(0, 3)) await act(async () => box.props.onChange({ target: { checked: true } }));
  await flush();
  await submitForm(tree);
  await flush(); await flush(); await flush();
  assert.equal(writes().length, 2, 'nothing is sent after the rejection');
  assert.equal(sections.bestsellers.items.length, 1, 'only the first product was stored');
  assert.match(text(tree.root), /Added 1 of 3 products, then stopped at Published cotton/);
  assert.match(text(tree.root), /No retry was attempted; 2 products remain selected/);
  const remaining = tree.root.findAllByProps({ type: 'checkbox' }).filter((b) => b.props.checked);
  assert.equal(remaining.length, 2, 'the unsaved products stay staged');
});

test('F-11 · products already in the slot are disabled, not offered as a guaranteed 409', async () => {
  sections.bestsellers = {
    ...bestsellersConfigured(), revision: 2,
    items: [{ id: 'p1', slotKey: 'products', contentType: 'PRODUCT', isActive: true, productId: 'PROD-1', product: products[0] }],
  };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'bestsellers', contentType: 'PRODUCT' });
  const boxes = tree.root.findAllByProps({ type: 'checkbox' });
  assert.equal(boxes[0].props.disabled, true, 'already-added product cannot be re-picked');
  assert.equal(boxes[1].props.disabled, false);
  assert.match(text(tree.root), /already added to this slot/);
});

/* -- review gate (Batch 2 independent review) ------------------------------ */

const twoSlotProducts = (items = []) => ({
  key: 'categories', configured: true, state: 'inactive', source: 'sections', revision: 5, isActive: false,
  allowedSlots: [P('women-products', 4), P('men-products', 4)], items,
});

test('F-11 · a partial multi-slot save keeps the staged rows aimed at the same slot', async () => {
  sections.categories = twoSlotProducts();
  fail.createAt = 2;
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'categories', contentType: 'PRODUCT' });
  const select = tree.root.findByType('select');
  await act(async () => select.props.onChange({ target: { value: 'men-products' } }));
  const boxes = tree.root.findAllByProps({ type: 'checkbox' });
  for (const box of boxes.slice(0, 2)) await act(async () => box.props.onChange({ target: { checked: true } }));
  await flush();
  await submitForm(tree);
  await flush(); await flush();
  assert.equal(writes().length, 2, 'one create succeeded, the second was rejected once');
  assert.equal(sections.categories.items.length, 1);
  assert.equal(sections.categories.items[0].slotKey, 'men-products', 'the saved row went to the chosen slot');
  assert.equal(tree.root.findByType('select').props.value, 'men-products', 'the retry target did not silently move');
  const remaining = tree.root.findAllByProps({ type: 'checkbox' }).filter((b) => b.props.checked);
  assert.equal(remaining.length, 1, 'the unsaved product is still staged');
  assert.equal(buttonNamed(tree, 'Save section entry').props.disabled, true, 'the 409 still requires an explicit reconcile');

  // Reconcile keeps the batch target and the staging, then the retry lands in the same slot.
  await click(tree, 'Reload and reconcile (keep my draft)');
  assert.equal(tree.root.findByType('select').props.value, 'men-products');
  assert.equal(buttonNamed(tree, 'Save section entry').props.disabled, false, 'the restored staging is actionable');
  fail.createAt = null;
  requests.length = 0;
  const revisionAfterReconcile = sections.categories.revision;
  await submitForm(tree);
  await flush(); await flush();
  assert.equal(writes().length, 1);
  assert.equal(writes()[0].body.slotKey, 'men-products');
  assert.equal(writes()[0].body.productId, 'PROD-2');
  assert.equal(writes()[0].body.expectedRevision, revisionAfterReconcile, 'the revision comes from the reconciled section');
  assert.deepEqual(sections.categories.items.map((row) => row.productId).sort(), ['PROD-1', 'PROD-2']);
});

test('F-11 · the first create failing writes nothing and keeps every staged product', async () => {
  sections.bestsellers = bestsellersConfigured();
  fail.createAt = 1;
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'bestsellers', contentType: 'PRODUCT' });
  const boxes = tree.root.findAllByProps({ type: 'checkbox' });
  for (const box of boxes) await act(async () => box.props.onChange({ target: { checked: true } }));
  await flush();
  await submitForm(tree);
  await flush(); await flush();
  assert.equal(writes().length, 1, 'exactly one attempt, never a retry');
  assert.equal(sections.bestsellers.items.length, 0);
  assert.match(text(tree.root), /Added 0 of 3 products, then stopped at Published silk: Duplicate product in slot\. No retry/);
  assert.match(text(tree.root), /No retry was attempted; 3 products remain selected/);
  const remaining = tree.root.findAllByProps({ type: 'checkbox' }).filter((b) => b.props.checked);
  assert.equal(remaining.length, 3);
});

test('F-11 · the final create failing reports the exact partial result and re-saving does not duplicate', async () => {
  sections.bestsellers = bestsellersConfigured();
  fail.createAt = 3;
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'bestsellers', contentType: 'PRODUCT' });
  const boxes = tree.root.findAllByProps({ type: 'checkbox' });
  for (const box of boxes) await act(async () => box.props.onChange({ target: { checked: true } }));
  await flush();
  await submitForm(tree);
  await flush(); await flush(); await flush();
  assert.equal(writes().length, 3, 'three attempts, the last rejected');
  assert.equal(sections.bestsellers.items.length, 2);
  assert.match(text(tree.root), /Added 2 of 3 products, then stopped at Published linen/);
  assert.match(text(tree.root), /1 product remains selected/);

  // A 409 requires the explicit reconcile; the staging must survive it.
  await click(tree, 'Reload and reconcile (keep my draft)');
  assert.equal(buttonNamed(tree, 'Save section entry').props.disabled, false, 'the remaining product can be retried');
  assert.equal(tree.root.findAllByProps({ type: 'checkbox' }).filter((b) => b.props.checked).length, 1);

  // Re-saving must send only the still-unsaved product, against the latest revision.
  fail.createAt = null;
  requests.length = 0;
  await submitForm(tree);
  await flush(); await flush();
  assert.equal(writes().length, 1, 'the already-created rows are not re-posted');
  assert.equal(writes()[0].body.productId, 'PROD-3');
  assert.equal(writes()[0].body.expectedRevision, 2, 'the revision came from the reloaded section');
  assert.equal(sections.bestsellers.items.length, 3);
});

test('F-11 · the remaining-capacity lock stops a third selection at a two-seat slot', async () => {
  sections.bestsellers = { ...bestsellersConfigured(), allowedSlots: [T('intro'), P('products', 2)] };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'bestsellers', contentType: 'PRODUCT' });
  const boxes = tree.root.findAllByProps({ type: 'checkbox' });
  await act(async () => boxes[0].props.onChange({ target: { checked: true } }));
  await act(async () => boxes[1].props.onChange({ target: { checked: true } }));
  await flush();
  const after = tree.root.findAllByProps({ type: 'checkbox' });
  assert.equal(after[2].props.disabled, true, 'the third tile is locked at capacity');
  await act(async () => after[2].props.onChange({ target: { checked: true } }));
  await flush();
  assert.match(text(tree.root), /Selected 2 products/);
  assert.equal(buttonNamed(tree, 'Add 2 products').props.disabled, false);
});

test('F-16 · two pending groups are tracked separately and each Save order sends one request', async () => {
  sections.categories = twoSlotProducts([
    { id: 'w1', slotKey: 'women-products', contentType: 'PRODUCT', isActive: true, productId: 'PROD-1', product: products[0] },
    { id: 'w2', slotKey: 'women-products', contentType: 'PRODUCT', isActive: true, productId: 'PROD-2', product: products[1] },
    { id: 'm1', slotKey: 'men-products', contentType: 'PRODUCT', isActive: true, productId: 'PROD-3', product: products[2] },
    { id: 'm2', slotKey: 'men-products', contentType: 'PRODUCT', isActive: true, productId: 'PROD-4', product: { id: 'PROD-4', name: 'Published wool', status: 'PUBLISHED', published: true } },
  ]);
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'categories', contentType: 'PRODUCT' });
  await click(tree, 'Move entry down', { index: 0 });
  await click(tree, 'Move entry down', { index: 2 });
  assert.equal(writes().length, 0, 'no request while composing');
  const saveButtons = tree.root.findAllByType('button').filter((b) => text(b) === 'Save order');
  assert.equal(saveButtons.length, 2, 'one commit control per changed group');

  // Save the FIRST group only.
  await act(async () => saveButtons[0].props.onClick());
  await flush(); await flush();
  assert.equal(writes().length, 1);
  assert.equal(writes()[0].body.slotKey, 'women-products');
  assert.deepEqual(writes()[0].body.itemIds, ['w2', 'w1']);
  const stillPending = tree.root.findAllByType('button').filter((b) => text(b) === 'Save order');
  assert.equal(stillPending.length, 1, 'the second group is still pending after the first save');

  await act(async () => stillPending[0].props.onClick());
  await flush(); await flush();
  assert.equal(writes().length, 2);
  assert.equal(writes()[1].body.slotKey, 'men-products');
  assert.deepEqual(writes()[1].body.itemIds, ['m2', 'm1']);
  assert.equal(tree.root.findAllByType('button').filter((b) => text(b) === 'Save order').length, 0);
});

test('F-16 · a reorder save rejected for a stale revision keeps the composed order and writes once', async () => {
  sections.trust = trustSection({ active: true });
  sections.trust.items.push({ id: 'e3', slotKey: 'secure', contentType: 'TEXT', isActive: true, title: 'Third promise' });
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await click(tree, 'Move entry down', { index: 0 });
  sections.trust.revision += 1; // another operator saved meanwhile
  await click(tree, 'Save order');
  assert.equal(writes().length, 1, 'one attempt, no retry');
  assert.match(text(tree.root), /Someone else saved this section/);
  assert.match(text(tree.root), /Order changed locally/, 'the composed order is preserved for review');
  assert.equal(sections.trust.items[0].id, 'e1', 'the server order is untouched');
});

test('F-10 · a failure on the section step reports the partial activation and stops', async () => {
  sections.trust = trustSection({ active: false });
  let attempts = 0;
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.endsWith('/homepage/sections/trust') && (options?.method ?? 'GET') === 'PUT') {
      attempts += 1;
      requests.push({ path: new URL(url, 'https://test.invalid').pathname, method: 'PUT', body: options.body });
      return new Response(JSON.stringify({ detail: 'Activation refused.' }), { status: 403, headers: { 'content-type': 'application/json' } });
    }
    return inner(input, options);
  };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await click(tree, 'Publish section');
  assert.equal(attempts, 1, 'the section step is tried exactly once');
  assert.equal(writes().length, 2, 'entry activation succeeded; the section activation did not retry');
  assert.equal(sections.trust.items[1].isActive, true, 'the entry activation really happened');
  assert.equal(sections.trust.isActive, false);
  assert.match(text(tree.root), /Published 1 step, then stopped: Activation refused/);
});

test('F-10 · Publish refused for a stale revision stops at once and offers explicit recovery', async () => {
  sections.trust = trustSection({ active: false });
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  sections.trust.revision += 1; // concurrent edit after the editor's read
  await click(tree, 'Publish section');
  assert.equal(writes().length, 1, 'no retry and no section activation');
  assert.match(text(tree.root), /Publish stopped: Content changed/);
  assert.match(text(tree.root), /Someone else saved this section/);
  assert.equal(sections.trust.isActive, false);
});

test('F-10 · a double submission issues one publish sequence, not two', async () => {
  sections.trust = trustSection({ active: false });
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  const publish = buttonNamed(tree, 'Publish section');
  await act(async () => { publish.props.onClick(); publish.props.onClick(); await Promise.resolve(); });
  await flush(); await flush(); await flush();
  assert.equal(writes().length, 2, 'entry + section, exactly once');
  assert.equal(sections.trust.isActive, true);
});

test('F-10 · Save & publish with a missing prerequisite saves and explicitly refuses to publish', async () => {
  sections.categories = {
    key: 'categories', configured: true, state: 'inactive', source: 'sections', revision: 2, isActive: false,
    allowedSlots: REGISTRY.categories,
    items: [{ id: 'm1', slotKey: 'women', contentType: 'MEDIA', isActive: true, mediaAssetId: 'asset-1', media: { url: image.url } }],
  };
  const tree = await mount(Editor, { actor: { admin: adminNoMediaAssign }, sectionKey: 'categories', contentType: 'TEXT' });
  await fill(tree, 'title', 'Collage intro');
  const saveAndPublish = tree.root.findAllByType('button').find((b) => text(b) === 'Save & publish');
  assert.equal(saveAndPublish.props.disabled, false, 'saving the TEXT entry itself is still allowed');
  await click(tree, 'Save & publish');
  assert.equal(writes().length, 1, 'only the create was sent');
  assert.equal(sections.categories.isActive, false);
  assert.match(text(tree.root), /Saved\. Not published yet: This section has an active media entry/);
});

test('F-09 · the same section is publishable for an actor who holds media.assign', async () => {
  sections.categories = {
    key: 'categories', configured: true, state: 'inactive', source: 'sections', revision: 2, isActive: false,
    allowedSlots: REGISTRY.categories,
    items: [{ id: 'm1', slotKey: 'women', contentType: 'MEDIA', isActive: true, mediaAssetId: 'asset-1', media: { url: image.url } }],
  };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'categories', contentType: 'TEXT' });
  assert.equal(tree.root.findAll((node) => node.props?.id === 'activation-reason').length, 0);
  assert.notEqual(buttonNamed(tree, 'Activate section').props.disabled, true);
  assert.notEqual(buttonNamed(tree, 'Publish section').props.disabled, true);
});

test('F-23 · a failed section list disables nothing (unknown is not a dead end)', async () => {
  fail.list = true;
  const tree = await mountPage();
  assert.equal(tree.root.findAll((node) => typeof node.props?.children === 'string' && node.props.children.includes('· none')).length, 0);
  for (const kind of ['MEDIA', 'PRODUCT', 'TEXT']) {
    const tab = buttonNamed(tree, kind);
    assert.ok(tab, `${kind} keeps its plain label`);
    assert.notEqual(tab.props.disabled, true, `${kind} is not disabled from an unknown status`);
  }
});

test('F-23 · the dead-tab convention is explained once, with the section list', async () => {
  const tree = await mountPage();
  const nav = tree.root.findAllByType('button').find((b) => text(b).includes(TITLES.bestsellers));
  await act(async () => nav.props.onClick());
  await flush(); await flush();
  const note = tree.root.findAll((node) => node.props?.id === 'type-none-note');
  assert.equal(note.length, 1);
  assert.match(text(note[0]), /no registered slot in this section/);
});

test('F-03 · the hero registration panel follows media.upload, not marketing.manage', async () => {
  // media.assign resolves to the media.manage capability (which implies
  // media.upload), so the meaningful boundary is an actor who only holds
  // media.view: they can read the hero but must not get the admin-only panel.
  const noUpload = await mountHero(adminNoMediaAssign);
  assert.equal(noUpload.root.findAllByType('details').length, 0, 'no media.upload, no admin-only registration control');
  assert.match(text(noUpload.root), /No saved entries|saved entries/);
});

test('F-16 · a reconcile that removed rows keeps the order visible but blocks a doomed save', async () => {
  sections.trust = trustSection({ active: true });
  sections.trust.items.push({ id: 'e3', slotKey: 'secure', contentType: 'TEXT', isActive: true, title: 'Third promise' });
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await click(tree, 'Move entry down', { index: 0 });
  sections.trust.revision += 1;
  await click(tree, 'Save order');            // 409 — stale revision
  assert.match(text(tree.root), /Someone else saved this section/);
  sections.trust.items = sections.trust.items.filter((row) => row.id !== 'e3'); // another operator deleted a row
  await click(tree, 'Reload and reconcile (keep my draft)');
  assert.match(text(tree.root), /The saved rows changed since this order was composed/);
  assert.equal(buttonNamed(tree, 'Save order').props.disabled, true, 'stale membership cannot be submitted');
  const before = writes().length;
  await click(tree, 'Cancel order changes');
  assert.equal(writes().length, before, 'cancel sends nothing');
  assert.equal(tree.root.findAllByType('button').filter((b) => text(b) === 'Save order').length, 0);
});

/* -- F-23 ------------------------------------------------------------------ */

test('F-23 · a type with no registered slot is disabled and labelled before any write', async () => {
  const tree = await mountPage();
  const nav = tree.root.findAllByType('button').find((b) => text(b).includes(TITLES.bestsellers));
  await act(async () => nav.props.onClick());
  await flush(); await flush();
  const dead = buttonNamed(tree, 'MEDIA · none');
  assert.ok(dead, 'the dead tab states that it has no slots');
  assert.equal(dead.props.disabled, true);
  assert.equal(requests.filter((r) => r.method !== 'GET').length, 0, 'discovering this wrote nothing');
  const live = buttonNamed(tree, 'PRODUCT');
  assert.ok(live, 'the live tab keeps its plain label');
  assert.notEqual(live.props.disabled, true);
});

test('F-23 fallback · an empty slot set still explains why nothing can be saved', async () => {
  // Defensive branch: if a contract ever returns a section whose allowed slots
  // do not include the selected type, the editor must still say so instead of
  // rendering a form. (The page disables such tabs first.)
  sections.trust = trustSection({ active: true });
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'MEDIA' });
  assert.match(text(tree.root), /No MEDIA slot is registered for this section/);
  assert.equal(tree.root.findAllByType('form').length, 0, 'no form is offered for an unregistered type');
});

/* -- F-03 ------------------------------------------------------------------ */

test('F-03 · "register art" points at the media library placement panel', async () => {
  const tree = await mountPage();
  const link = tree.root.findAll((node) => typeof node.props?.to === 'string' && node.props.to.includes('#placement-art'));
  assert.ok(link.length >= 1, 'the header action targets the placement panel');
  assert.equal(link[0].props.to, '/super-admin/media#placement-art');
});

test('F-03 · the MEDIA editor links to the same placement panel', async () => {
  sections.categories = { ...sectionState('categories'), configured: true, state: 'inactive', revision: 1, isActive: false, allowedSlots: REGISTRY.categories };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'categories', contentType: 'MEDIA', registerHref: '/super-admin/media#placement-art' });
  const anchors = tree.root.findAllByType('a');
  assert.ok(anchors.some((a) => a.props.href === '/super-admin/media#placement-art'), 'the inline hint links to the placement panel');
  assert.match(text(tree.root), /Upload and register placement art/);
});

test('F-03 · the hero MEDIA tab registers placement art in place', async () => {
  const tree = await mountHero();
  assert.equal(tree.root.findAllByType('details').length, 1, 'one inline registration disclosure');
  assert.match(text(tree.root), /Register new hero art/);
  assert.match(text(tree.root), /Upload and register/, 'the upload+register action is inline');
  assert.match(text(tree.root), /Register existing object/, 'register-by-key stays available');
  assert.ok(tree.root.findAllByType('input').some((node) => node.props.type === 'file'), 'the upload control is real');

  // Employee sessions use the employee hero API; the admin-only placement
  // registration panel must not be offered to them.
  const employee = { employee: { employeeId: 'e1', permissions: ['marketing.view', 'marketing.manage', 'media.view', 'media.upload'] } };
  const employeeTree = await mountHero(employee);
  assert.equal(employeeTree.root.findAllByType('details').length, 0);
  assert.doesNotMatch(text(employeeTree.root), /Register new hero art/);
});

/* -- model ----------------------------------------------------------------- */

test('F-09/F-10 · publishModel is pure and describes only existing calls', () => {
  const section = trustSection({ active: false });
  const step = model.nextPublishStep(section);
  assert.equal(step.method, 'patch');
  assert.equal(step.suffix, '/items/e2');
  assert.deepEqual(step.body, { expectedRevision: 3, isActive: true });
  assert.deepEqual(model.publishPlan(section).map((s) => s.kind), ['activate-entry', 'activate-section']);
  assert.equal(model.nextPublishStep({ ...section, isActive: true, items: section.items.map((r) => ({ ...r, isActive: true })) }), null);
  assert.match(model.publishSummary(section).text, /Section inactive/);
  assert.deepEqual(model.publishBlockers({ configured: false }, { write: true }), ['Configure the section first.']);
  assert.equal(model.reorderGroupFor('trust', 'TEXT', { slotKey: 'delivery' }), 'trust-items');
  assert.equal(model.reorderGroupFor('categories', 'MEDIA', { slotKey: 'women' }), null);
  assert.equal(model.reorderGroupFor('bestsellers', 'PRODUCT', { slotKey: 'products' }), 'products');
});

/* -- non-regression -------------------------------------------------------- */

test('no regression · create payloads keep the exact pre-Batch-2 key set', async () => {
  sections.trust = { key: 'trust', configured: true, state: 'inactive', source: 'sections', revision: 4, isActive: false, allowedSlots: REGISTRY.trust, items: [] };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await fill(tree, 'title', 'Copy');
  await submitForm(tree);
  const create = writes().find((r) => r.method === 'POST');
  assert.deepEqual(Object.keys(create.body).sort(), ['altText', 'contentType', 'ctaHref', 'ctaLabel', 'expectedRevision', 'eyebrow', 'isActive', 'slotKey', 'subtitle', 'title']);
  assert.equal(create.body.expectedRevision, 4);
  assert.equal(create.body.isActive, false);
});

test('no regression · a read-only actor still gets no publish or save control', async () => {
  sections.trust = trustSection({ active: false });
  const reader = { adminId: 'r', accountLevel: 'ADMIN', status: 'ACTIVE', permissions: ['marketing.view', 'media.view'] };
  const tree = await mount(Editor, { actor: { admin: reader }, sectionKey: 'trust', contentType: 'TEXT' });
  assert.equal(buttonNamed(tree, 'Publish section'), undefined);
  assert.equal(buttonNamed(tree, 'Save & publish'), undefined);
  assert.equal(buttonNamed(tree, 'Activate section'), undefined);
});
