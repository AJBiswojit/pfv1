/** Real React components + existing API clients; all HTTP mocked, no database. */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const root = new URL('../../../../../', import.meta.url).pathname;
const original = { fetch: globalThis.fetch, storage: globalThis.localStorage, window: globalThis.window, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
const owner = { adminId: 'owner', accountLevel: 'SUPER_ADMIN', status: 'ACTIVE', permissions: [] };
const reader = { adminId: 'reader', accountLevel: 'ADMIN', status: 'ACTIVE', permissions: ['media.view'] };
const manager = { ...reader, permissions: ['media.view', 'media.manage'] };
const employee = { employeeId: 'employee', status: 'ACTIVE', permissions: ['media.view', 'media.manage', 'media.delete'] };
const image = { id: 'asset-1', objectKey: 'hero/registered.avif', url: '/api/v1/media/objects/hero/registered.avif', mimeType: 'image/avif', status: 'uploaded' };
const product = { id: 'PF-W-SAR-SIL-0001', name: 'Published silk', status: 'PUBLISHED', published: true, image: '/api/v1/media/objects/products/PF-W-SAR-SIL-0001/primary.avif' };
const legacy = JSON.stringify([{ id: 'PF-CUST-LEGACY', image: 'data:image/png;base64,old', price: 123 }]);
let vite, model, service, Panel, Page, Products, Picker, AdminContext, EmployeeContext, store;
let rows, assets, products, requests, fail, gate, writeGate, renderers, storage;
const source = (path) => readFileSync(`${root}${path}`, 'utf8');
const row = () => ({ id: 'entry-1', placement: 'HOME_HERO', objectKey: image.objectKey, mediaAssetId: image.id, url: image.url, title: 'Saved campaign', subtitle: 'Backend copy', ctaLabel: 'Shop', ctaHref: '/shop', sortOrder: 0, isActive: true });
const flush = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const text = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
const click = async (tree, label) => {
  const button = tree.root.findAllByType('button').find((item) => text(item) === label);
  assert.ok(button, `button exists: ${label}`);
  assert.notEqual(button.props.disabled, true, `button enabled: ${label}`);
  await act(async () => { await button.props.onClick(); });
};
const mount = async (Component, props = {}, admin = owner, path = '/super-admin/media/marketing', staff = null) => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(AdminContext.Provider, { value: { admin, isSuperAdmin: admin?.accountLevel === 'SUPER_ADMIN', isLoading: false } },
        React.createElement(EmployeeContext.Provider, { value: { employee: staff, isLoading: false } }, React.createElement(Component, props)))));
  });
  renderers.push(tree);
  return tree;
};

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  model = await load('services/homepage/homepageContentModel.js');
  service = await load('services/homepage/homepageContentService.js');
  Panel = (await load('components/admin/BackendHomeHeroPanel.jsx')).default;
  Page = (await load('pages/admin/media/AdminMarketingMedia.jsx')).default;
  Products = (await load('components/admin/homepage/PublishedProductPicker.jsx')).default;
  Picker = (await load('components/admin/homepage/RegisteredMediaPicker.jsx')).default;
  AdminContext = (await load('context/AdminAuthContext.jsx')).default;
  EmployeeContext = (await load('context/EmployeeAuthContext.jsx')).default;
  store = await load('services/catalog/catalogStore.js');
});

beforeEach(() => {
  rows = [row()]; assets = [image]; products = [product]; requests = []; fail = {}; gate = null; writeGate = null; renderers = [];
  storage = new Map([['pratikshya_custom_products', legacy], ['guest-cart', 'preserved'], ['pf_admin_access_token', 'admin-token'], ['pf_employee_access_token', 'employee-token']]);
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, confirm: () => true };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), 'https://frontend.invalid');
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    if (writeGate && ['POST', 'PATCH'].includes(method)) await writeGate;
    requests.push({ path: url.pathname, query: url.searchParams, method, body, auth: options.headers?.Authorization });
    let result = { ok: true }, status = 200;
    if (url.pathname === '/api/v1/admin/marketing/media' && method === 'GET') {
      if (gate) await gate;
      if (fail.list) { result = { detail: 'Marketing unavailable' }; status = 503; }
      else result = { items: rows.filter((r) => r.placement === url.searchParams.get('placement')), total: rows.length };
    } else if (url.pathname === '/api/v1/admin/marketing/media' && method === 'POST') {
      if (fail.write) { result = { detail: 'Backend permission denied' }; status = 403; }
      else { result = { ...body, id: `entry-${rows.length + 1}`, url: `/api/v1/media/objects/${body.objectKey}` }; rows.push(result); }
    } else if (url.pathname === '/api/v1/admin/marketing/media/reorder' && method === 'PUT') {
      body.items.forEach((item) => { rows.find((r) => r.id === item.id).sortOrder = item.sortOrder; });
      result = { items: rows };
    } else if (url.pathname.startsWith('/api/v1/admin/marketing/media/')) {
      const id = decodeURIComponent(url.pathname.split('/').at(-1));
      if (fail.write) { result = { detail: 'Backend permission denied' }; status = 403; }
      else if (method === 'PATCH') { result = Object.assign(rows.find((r) => r.id === id), body); }
      else if (method === 'DELETE') { rows = rows.filter((r) => r.id !== id); }
      else assert.fail('Unexpected marketing method');
    } else if (url.pathname === '/api/v1/media/assets') {
      if (fail.assets) { status = 503; result = { detail: 'Assets unavailable' }; }
      else result = { items: assets, total: assets.length, page: Number(url.searchParams.get('page')), pageSize: 24 };
    } else if (url.pathname === '/api/v1/products') {
      if (fail.products) { status = 503; result = { detail: 'Products unavailable' }; }
      else result = { items: products, total: products.length };
    } else if (url.pathname === '/api/v1/home') {
      result = { ok: true, heroSlides: rows.filter((r) => r.placement === 'HOME_HERO' && r.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((r) => ({ id: r.id, image: r.url, title: r.title, subtitle: r.subtitle, cta: r.ctaLabel, href: r.ctaHref })) };
    } else if (['/api/v1/categories', '/api/v1/collections'].includes(url.pathname)) result = { items: [], total: 0 };
    else if (url.pathname === '/api/v1/offers') result = { offers: [] };
    else assert.fail(`Unexpected HTTP request ${method} ${url.pathname}`);
    return new Response(JSON.stringify(result), { status, headers: { 'content-type': 'application/json' } });
  };
});

afterEach(async () => {
  for (const tree of renderers) await act(async () => { tree.unmount(); });
  assert.equal(storage.get('pratikshya_custom_products'), legacy);
  assert.equal(storage.get('guest-cart'), 'preserved');
});
after(async () => {
  await vite?.close();
  for (const [key, value] of [['fetch', original.fetch], ['localStorage', original.storage], ['window', original.window], ['IS_REACT_ACT_ENVIRONMENT', original.act]]) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
});

test('section inventory matches all twelve reference components in order', () => {
  const home = readFileSync(`${root}../home-page/src/pages/Home.jsx`, 'utf8');
  const names = ['Hero', 'CategoryCollage', 'SareeLookbook', 'BridalCampaign', 'JewelleryTheatre', 'PromoBanner', 'MensEditorial', 'KidsPlayground', 'Bestsellers', 'KurtiLookbook', 'Newsletter', 'TrustStrip'];
  const offsets = names.map((name) => home.indexOf(`<${name} />`));
  assert.ok(offsets.every((offset, index) => offset >= 0 && (!index || offset > offsets[index - 1])));
  assert.equal(model.HOMEPAGE_SECTIONS.length, 12);
  assert.equal(model.HOMEPAGE_SECTIONS.filter((s) => s.live).length, 1);
  assert.equal(model.HOMEPAGE_SECTIONS[0].placement, 'HOME_HERO');
});

test('RBAC uses real capability expansion, status checks and separate delete authority', () => {
  assert.equal(model.homepageAccess({ admin: owner }).delete, true);
  assert.equal(model.homepageAccess({ admin: manager }).edit, true);
  assert.equal(model.homepageAccess({ admin: manager }).delete, false);
  assert.equal(model.homepageAccess({ admin: reader }).edit, false);
  assert.equal(model.homepageAccess({ admin: { ...owner, status: 'SUSPENDED' } }).view, false);
  assert.equal(model.homepageAccess({ admin: { adminId: 'unassigned' } }).view, false);
  const access = model.homepageAccess({ employee });
  assert.equal(access.overview, true); assert.equal(access.view, false); assert.equal(access.create, false);
});

test('unauthorized direct actions fail closed without issuing HTTP', async () => {
  const results = await Promise.all([
    service.loadHomepagePlacement(null, 'HOME_HERO'), service.loadRegisteredImages(null),
    service.saveHomepageEntry(reader, { placement: 'HOME_HERO', draft: {}, asset: image }),
    service.saveHomepageEntry(reader, { placement: 'HOME_HERO', id: 'entry-1', draft: {} }),
    service.setHomepageEntryActive(reader, 'entry-1', true), service.removeHomepageEntry(manager, 'entry-1'),
    service.reorderHomepageEntries(reader, 'HOME_HERO', ['entry-1']), service.loadPublishedHomepageProducts({}),
  ]);
  assert.ok(results.every((r) => !r.ok && r.status === 403)); assert.equal(requests.length, 0);
});

test('employee overview does not borrow an available admin session or call admin APIs', async () => {
  const tree = await mount(Page, {}, owner, '/employee/media/marketing', employee);
  assert.match(text(tree.root), /reject employee tokens/);
  assert.equal(requests.length, 0);
  assert.equal(tree.root.findAllByType('button').some((b) => text(b) === 'Save to backend'), false);
});

test('unauthorized page and read-only editor expose no write controls', async () => {
  const denied = await mount(Page, {}, null);
  assert.match(text(denied.root), /access denied/); assert.equal(requests.length, 0);
  const tree = await mount(Panel, {}, reader);
  assert.match(text(tree.root), /Saved campaign/);
  assert.equal(tree.root.findAllByType('button').some((b) => /Edit|Remove|Activate|Add registered/.test(text(b))), false);
});

test('product admission excludes draft, review, archived, unpublished, hidden and inline records', async () => {
  products = [product, ...['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ARCHIVED'].map((status) => ({ ...product, id: status, status })),
    { ...product, id: 'unpublished', published: false }, { ...product, id: 'hidden', isVisible: false },
    { ...product, id: 'unsafe', image: 'javascript:alert(1)' },
    { ...product, id: 'inline', image: 'data:image/png;base64,x' }, { ...product, id: 'blob', hoverImage: 'blob:temporary' },
    { ...product, id: 'PF-CUST-GENUINE', name: 'Genuine backend ID' }];
  const result = await service.loadPublishedHomepageProducts({ admin: reader });
  assert.deepEqual(result.items.map((p) => p.id), [product.id, 'PF-CUST-GENUINE']);
  assert.equal(requests[0].auth, undefined, 'public catalogue never uses the admin/employee token');
});

test('registered media filter rejects unsafe URLs, traversal, unknown namespaces, missing IDs and non-images', async () => {
  assets = [image, { ...image, id: 'signed', url: 'https://cdn.example.invalid/hero/a.avif?signature=kept' },
    ...['data:image/png;base64,x', 'blob:temporary', 'javascript:alert(1)', '//untrusted.invalid/x'].map((url) => ({ ...image, url })),
    { ...image, id: null }, { ...image, objectKey: 'hero/../secret.avif' }, { ...image, objectKey: 'hero/%2e%2e/a.avif' },
    { ...image, objectKey: 'unknown/a.avif' }, { ...image, mimeType: 'text/html' }, { ...image, status: 'deleted' }];
  const result = await service.loadRegisteredImages(owner);
  assert.equal(result.items.length, 2);
  assert.equal(requests[0].auth, 'Bearer admin-token');
});

test('unsafe media and CTA values cannot be saved; payload accepts no fabricated product fields', async () => {
  assert.equal((await service.saveHomepageEntry(owner, { placement: 'HOME_HERO', draft: {}, asset: { ...image, url: 'data:image/png;base64,x' } })).ok, false);
  assert.equal((await service.saveHomepageEntry(owner, { placement: 'HOME_HERO', draft: { ctaHref: 'javascript:alert(1)' }, asset: image })).ok, false);
  assert.equal(requests.length, 0);
  const result = await service.saveHomepageEntry(owner, { placement: 'HOME_HERO', asset: image, draft: { title: 'New', productId: 'fake', price: 999, published: true } });
  assert.equal(result.ok, true);
  assert.equal(requests[0].body.isActive, false);
  for (const key of ['price', 'productId', 'published', 'contentType']) assert.equal(key in requests[0].body, false);
});

test('MEDIA creation and TEXT update survive fresh loads via the existing durable API contract', async () => {
  const saved = await service.saveHomepageEntry(owner, { placement: 'SAREE_SECTION', asset: image, draft: { title: 'Registered saree artwork' } });
  const first = await service.loadHomepagePlacement(owner, 'SAREE_SECTION');
  assert.equal(first.items[0].id, saved.item.id);
  await service.saveHomepageEntry(owner, { placement: 'SAREE_SECTION', id: saved.item.id, draft: { title: 'Updated text', subtitle: 'Persisted copy' } });
  const second = await service.loadHomepagePlacement(owner, 'SAREE_SECTION');
  assert.equal(second.items[0].title, 'Updated text');
  const patch = requests.find((r) => r.method === 'PATCH');
  assert.equal('objectKey' in patch.body, false, 'text edit preserves registered media identity');
});

test('backend write denial remains a failure rather than a simulated save', async () => {
  fail.write = true;
  const result = await service.saveHomepageEntry(owner, { placement: 'HOME_HERO', id: 'entry-1', draft: { title: 'Denied' } });
  assert.equal(result.status, 403); assert.equal(result.ok, false);
  assert.equal(rows[0].title, 'Saved campaign');
});

test('real editor saves copy, refreshes public home, reloads rows and survives remount', async () => {
  const tree = await mount(Panel);
  await click(tree, 'Edit entry');
  const titleInput = tree.root.findAllByType('input').find((item) => item.parent.children.includes('Title'));
  await act(async () => { titleInput.props.onChange({ target: { value: 'Durable title' } }); });
  assert.match(text(tree.root), /Pending — unsaved/);
  await act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  await flush();
  assert.match(text(tree.root), /Saved to backend/); assert.match(text(tree.root), /Durable title/);
  assert.equal(store.getHome().heroSlides[0].title, 'Durable title');
  await act(async () => tree.unmount());
  renderers = renderers.filter((r) => r !== tree);
  const reloaded = await mount(Panel);
  assert.match(text(reloaded.root), /Durable title/);
});

test('reorder and active controls refresh the same public home; deleting only removes the placement row', async () => {
  rows.push({ ...row(), id: 'entry-2', title: 'Second', sortOrder: 1 });
  const tree = await mount(Panel);
  const down = tree.root.findAllByType('button').find((b) => text(b) === 'Move down');
  await act(async () => down.props.onClick()); await flush();
  assert.deepEqual(store.getHome().heroSlides.map((r) => r.id), ['entry-2', 'entry-1']);
  await click(tree, 'Deactivate'); await flush();
  assert.deepEqual(store.getHome().heroSlides.map((r) => r.id), ['entry-1']);
  await click(tree, 'Remove entry'); await flush();
  assert.ok(requests.some((r) => r.method === 'DELETE' && r.path.includes('/admin/marketing/media/')));
  assert.ok(!requests.some((r) => r.method === 'DELETE' && /products|objects/.test(r.path)));
});

test('placement loading, empty, error and retry states reflect the real request outcomes', async () => {
  let release;
  gate = new Promise((resolve) => { release = resolve; });
  const tree = await mount(Panel);
  assert.match(text(tree.root), /Loading HOME_HERO/);
  gate = null; rows = []; release(); await flush();
  assert.match(text(tree.root), /No saved entries/);
  fail.list = true; await click(tree, 'Refresh placement');
  assert.match(text(tree.root), /Placement reload failed/);
  fail.list = false; rows = [row()]; await click(tree, 'Retry placement');
  assert.match(text(tree.root), /Saved campaign/);
});

test('registered media picker handles load failure, retry, empty and safe selection', async () => {
  fail.assets = true;
  let selected = null;
  const tree = await mount(Picker, { admin: owner, onChange: (value) => { selected = value; } });
  assert.match(text(tree.root), /Assets unavailable/);
  fail.assets = false; assets = []; await click(tree, 'Retry media library');
  assert.match(text(tree.root), /No safe registered images/);
  // Remount is equivalent to reopening the library after registration.
  assets = [image];
  const next = await mount(Picker, { admin: owner, onChange: (value) => { selected = value; } });
  await click(next, image.objectKey); assert.equal(selected.id, image.id);
});

test('product selection is unsaved and clears when unpublishing disappears on a public reload', async () => {
  const actor = { admin: owner };
  const tree = await mount(Products, { actor });
  await act(async () => tree.root.findByProps({ type: 'checkbox' }).props.onChange({ target: { checked: true } }));
  assert.match(text(tree.root), /1 selected · not saved/);
  products = []; await click(tree, 'Refresh published catalogue');
  assert.match(text(tree.root), /0 selected · not saved/);
  assert.match(text(tree.root), /No eligible published products/);
  assert.equal(requests.every((r) => r.method === 'GET'), true);
});

test('product failure offers retry without importing legacy products', async () => {
  fail.products = true;
  const tree = await mount(Products, { actor: { employee } }, null, '/employee/media/marketing', employee);
  assert.match(text(tree.root), /Products unavailable/);
  fail.products = false; await click(tree, 'Retry products');
  assert.match(text(tree.root), /Published silk/);
  assert.doesNotMatch(text(tree.root), /PF-CUST-LEGACY/);
});

test('unsupported section text and newsletter operations have no fake save or subscription', async () => {
  const tree = await mount(Page);
  const newsletter = tree.root.findAllByType('button').find((b) => text(b).includes('Newsletter'));
  await act(async () => newsletter.props.onClick());
  await click(tree, 'TEXT');
  assert.match(text(tree.root), /No verified subscription endpoint/);
  assert.equal(tree.root.findAllByType('form').length, 0);
  assert.equal(tree.root.findAllByType('button').some((b) => text(b) === 'Save to backend'), false);
});

test('The customer storefront is the sole customer homepage while design authority and backend auth constraints remain preserved', () => {
  assert.match(source('src/layouts/CustomerLayout.jsx'), /<CustomerStorefront \/>/);
  assert.doesNotMatch(source('src/config/customerRoutes.js'), /VITE_STOREFRONT_HOME|resolveStorefrontHome/);
  const router = readFileSync(`${root}../backend/app/api/v1/marketing_media.py`, 'utf8');
  assert.match(router, /Depends\(get_current_admin\)/);
  const dependencies = readFileSync(`${root}../backend/app/dependencies.py`, 'utf8');
  assert.match(dependencies, /if user\.user_type != "admin":/);
  assert.match(source('src/App.jsx'), /\/employee\/media\/marketing/);
  assert.doesNotMatch(source('src/services/homepage/homepageContentService.js'), /localStorage|apiAdminCreateDraft|published: true/);
});


test('registered MEDIA creation shows pending/saving states and locks section changes until saved inactive', async () => {
  const tree = await mount(Page);
  await click(tree, 'Add registered media');
  await click(tree, image.objectKey);
  assert.match(text(tree.root), /Pending — unsaved changes/);
  assert.equal(tree.root.findAllByType('button').find((b) => text(b) === 'TEXT').props.disabled, true);
  let release;
  writeGate = new Promise((resolve) => { release = resolve; });
  try {
    await act(async () => { tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    assert.match(text(tree.root), /Saving…/);
  } finally { writeGate = null; release(); await flush(); }
  assert.match(text(tree.root), /Saved to backend/);
  assert.equal(rows.at(-1).isActive, false);
  assert.equal(rows.at(-1).mediaAssetId, image.id);
  assert.equal(tree.root.findAllByType('button').find((b) => text(b) === 'TEXT').props.disabled, false);
});

test('editor preserves unsaved text after a backend denial and allows explicit cancellation', async () => {
  const tree = await mount(Panel, { contentType: 'TEXT' });
  await click(tree, 'Edit text');
  const input = tree.root.findAllByType('input').find((item) => item.parent.children.includes('Title'));
  await act(async () => input.props.onChange({ target: { value: 'Not authorized to save' } }));
  fail.write = true;
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  await flush();
  assert.match(text(tree.root), /Backend permission denied/);
  assert.match(text(tree.root), /Pending — unsaved changes/);
  assert.equal(rows[0].title, 'Saved campaign');
  assert.equal(input.props.value, 'Not authorized to save');
  await click(tree, 'Cancel');
  assert.equal(tree.root.findAllByType('form').length, 0);
});

test('successful save followed by reload failure distinguishes confirmed save from failed refresh', async () => {
  const tree = await mount(Panel);
  await click(tree, 'Edit entry');
  const input = tree.root.findAllByType('input').find((item) => item.parent.children.includes('Title'));
  await act(async () => input.props.onChange({ target: { value: 'Confirmed by write' } }));
  fail.list = true;
  await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  await flush();
  assert.equal(rows[0].title, 'Confirmed by write');
  assert.match(text(tree.root), /Saved to backend/);
  assert.match(text(tree.root), /Placement reload failed/);
  fail.list = false; await click(tree, 'Retry placement');
  assert.match(text(tree.root), /Confirmed by write/);
});


test('manual placement refresh also refreshes the shared public home snapshot', async () => {
  const tree = await mount(Panel);
  rows[0].title = 'Changed by another operator';
  await click(tree, 'Refresh placement');
  await flush();
  assert.match(text(tree.root), /Changed by another operator/);
  assert.equal(store.getHome().heroSlides[0].title, 'Changed by another operator');
});
