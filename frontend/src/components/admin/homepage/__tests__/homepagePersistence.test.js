/** Phase 3 real React/API-client regression, mocked HTTP only — NOT DB durability. */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';

const root = new URL('../../../../../', import.meta.url).pathname;
const original = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
const admin = { adminId: 'admin', accountLevel: 'SUPER_ADMIN', status: 'ACTIVE', permissions: [] };
const employee = { employeeId: 'employee', status: 'ACTIVE', permissions: ['marketing.view', 'marketing.manage', 'media.view', 'media.assign', 'media.upload'] };
const actor = { employee };
let vite, api, model, Editor, store, section, requests, trees, failed, gate, dirtyEvents;
const text = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
const flush = () => act(async () => { await new Promise(setImmediate); });
const slots = [{ slotKey: 'delivery', contentType: 'TEXT', capacity: 1 }, { slotKey: 'help', contentType: 'TEXT', capacity: 1 }];
const snapshot = (state = 'missing', extra = {}) => ({ homeStatus: 'ready', home: { homepageContent: { version: 1, status: 'ready', sections: [{ key: 'trust', state, configured: state !== 'missing', items: [], ...extra }] } } });
const click = async (tree, label) => {
  const node = tree.root.findAllByType('button').find((b) => text(b) === label);
  assert.ok(node, label); assert.notEqual(node.props.disabled, true, `${label} enabled`);
  await act(async () => { node.props.onClick(); await new Promise(setImmediate); });
};
/* F-08 (Batch 3) renamed the visible copy labels; the locator follows the
   label text case-insensitively. No assertion changed. */
const fieldLabel = (l, field) => text(l).toLowerCase() === String(field).toLowerCase();
const fill = async (tree, field, value) => act(async () => {
  const label = tree.root.findAllByType('label').find((l) => fieldLabel(l, field));
  assert.ok(label, field);
  /* F-08: subtitle is now a textarea; other copy fields stay inputs. */
  const control = label.findAllByType('input')[0] ?? label.findAllByType('textarea')[0];
  assert.ok(control, field); control.props.onChange({ target: { value } });
});
const submit = async (tree) => act(async () => { tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); await new Promise(setImmediate); });
const mount = async (which = actor) => {
  let tree;
  await act(async () => { tree = create(React.createElement(Editor, { actor: which, sectionKey: 'trust', contentType: 'TEXT', onDirtyChange: (value) => dirtyEvents.push(value) })); });
  trees.push(tree); await flush(); return tree;
};

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  api = await vite.ssrLoadModule('/src/services/api/homepageApi.js');
  model = await vite.ssrLoadModule('/src/components/storefront/home/homepageSectionModel.js');
  Editor = (await vite.ssrLoadModule('/src/components/admin/homepage/SectionContentEditor.jsx')).default;
  store = await vite.ssrLoadModule('/src/services/catalog/catalogStore.js');
});
beforeEach(() => {
  section = { key: 'trust', configured: false, state: 'missing', source: 'legacy', items: [], allowedSlots: slots };
  requests = []; trees = []; failed = {}; gate = null; dirtyEvents = [];
  const data = new Map([['pf_admin_access_token', 'admin-token'], ['pf_employee_access_token', 'employee-token'], ['pratikshya_custom_products', 'untouched']]);
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: (k) => data.delete(k) };
  globalThis.window = { localStorage: globalThis.localStorage, confirm: () => true, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), 'https://test.invalid'), method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path: url.pathname, method, body, auth: options.headers?.Authorization });
    let output = {}, status = 200;
    if (url.pathname.includes('/homepage/sections/trust')) {
      if (method === 'GET') { if (failed.read) { status = 503; output = { detail: 'Section unavailable' }; } else output = { section }; }
      else {
        if (gate) await gate;
        if (failed.write) { status = failed.write; output = { detail: failed.write === 409 ? 'Revision conflict' : 'Write rejected' }; }
        else {
          const expected = body?.expectedRevision ?? Number(url.searchParams.get('expectedRevision'));
          if (expected !== (section.revision || 0)) { status = 409; output = { detail: 'Revision conflict' }; }
          else {
            section.configured = true; section.source = 'sections'; section.revision = expected + 1;
            if (method === 'PUT' && !url.pathname.endsWith('/reorder')) section.isActive = body.isActive;
            if (method === 'POST') section.items.push({ ...body, id: `entry-${section.revision}`, isActive: false, sortOrder: section.items.length });
            if (method === 'PATCH') Object.assign(section.items.find((r) => r.id === url.pathname.split('/').at(-1)), body);
            if (method === 'DELETE') section.items = section.items.filter((r) => r.id !== url.pathname.split('/').at(-1));
            if (url.pathname.endsWith('/reorder')) { section.items.forEach((r) => { r.sortOrder = body.itemIds.indexOf(r.id); }); section.items.sort((a,b) => a.sortOrder-b.sortOrder); }
            section.state = !section.isActive ? 'inactive' : section.items.some((r) => r.isActive) ? 'ready' : 'empty';
            output = { section };
            if (failed.afterWriteRead) failed.read = true;
          }
        }
      }
    } else if (url.pathname === '/api/v1/home') output = { heroSlides: [], homepageContent: { version: 1, status: failed.public ? 'unavailable' : 'ready', sections: [section] } };
    else if (['/api/v1/products', '/api/v1/categories', '/api/v1/collections'].includes(url.pathname)) output = { items: [], total: 0 };
    else if (url.pathname === '/api/v1/offers') output = { offers: [] };
    else if (url.pathname.includes('/hero/')) output = { id: 'hero-entry', items: [], total: 0 };
    else if (url.pathname.includes('/media-assets')) output = { items: [], total: 0 };
    else throw new Error(`Unexpected request ${url.pathname}`);
    return new Response(JSON.stringify(output), { status, headers: { 'content-type': 'application/json' } });
  };
});
afterEach(async () => {
  for (const tree of trees) await act(async () => tree.unmount());
  assert.equal(localStorage.getItem('pratikshya_custom_products'), 'untouched');
});
after(async () => { await vite.close(); for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });

test('new routes deny ungranted direct calls without HTTP and ambiguous sessions fail closed', async () => {
  assert.equal(api.staffHomepageAccess({ admin, employee }).view, false);
  const response = await api.writeHomepageSection({ employee: { ...employee, permissions: ['marketing.view'] } }, 'trust', '', 'put', { expectedRevision: 0 });
  assert.equal(response.status, 403); assert.equal(requests.length, 0);
  assert.equal(api.staffHomepageAccess({ employee: { ...employee, status: 'SUSPENDED' } }).view, false);
  assert.equal(api.employeeHeroAccess(actor).delete, false, 'media.manage/assign is not media.delete');
});

test('employee requests never borrow the simultaneously stored admin token', async () => {
  await api.readHomepageSection(actor, 'trust');
  assert.equal(requests[0].path, '/api/v1/employee/homepage/sections/trust');
  assert.equal(requests[0].auth, 'Bearer employee-token');
  await api.employeeHeroRequest(actor, 'create', { asset: { id: 'real-asset' }, draft: { title: 'Campaign', isActive: false } });
  assert.equal(requests[1].auth, 'Bearer employee-token');
  assert.deepEqual(requests[1].body, { title: 'Campaign', isActive: false, mediaAssetId: 'real-asset' });
  assert.equal(requests[1].path, '/api/v1/employee/homepage/hero/items');
});

test('configure, save, edit and remount recover authoritative HTTP data', async () => {
  const tree = await mount();
  assert.match(text(tree.root), /Not configured/);
  await click(tree, 'Configure section (initially hidden)');
  assert.equal(section.isActive, false); assert.equal(section.revision, 1);
  await fill(tree, 'title', 'Delivery across India');
  assert.ok(dirtyEvents.includes(true));
  await submit(tree);
  assert.equal(section.items[0].title, 'Delivery across India');
  assert.equal(section.items[0].isActive, false);
  assert.match(text(tree.root), /Saved; authoritative/);
  await act(async () => tree.unmount()); trees.splice(trees.indexOf(tree), 1);
  const reloaded = await mount();
  assert.match(text(reloaded.root), /Delivery across India/);
  await click(reloaded, 'Edit entry');
  await fill(reloaded, 'title', 'New delivery copy'); await submit(reloaded);
  assert.equal(section.items[0].title, 'New delivery copy');
  assert.ok(requests.some((r) => r.path === '/api/v1/home'));
});

test('conflict retains unsaved edits, blocks automatic writes and requires reload', async () => {
  const tree = await mount(); await click(tree, 'Configure section (initially hidden)');
  await fill(tree, 'title', 'Pending copy'); failed.write = 409;
  await submit(tree);
  assert.match(text(tree.root), /Revision conflict/);
  assert.match(text(tree.root), /Reload and reconcile/);
  assert.equal(section.items.length, 0);
  assert.equal(tree.root.findAllByType('button').find((b) => text(b) === 'Save section entry').props.disabled, true);
  failed.write = null; await click(tree, 'Reload section and public content');
  assert.equal(tree.root.findAllByType('label').find((l) => fieldLabel(l, 'title')).findByType('input').props.value, '');
});

test('confirmed write plus failed reload remains saved, and public refresh is requested', async () => {
  const tree = await mount(); await click(tree, 'Configure section (initially hidden)');
  await fill(tree, 'title', 'Persisted by HTTP fixture'); failed.afterWriteRead = true;
  await submit(tree);
  assert.match(text(tree.root), /Saved; staff reload failed/);
  assert.equal(section.items[0].title, 'Persisted by HTTP fixture');
  assert.ok(requests.filter((r) => r.path === '/api/v1/home').length >= 2);
});

test('saving locks edits and marks parent pending until backend confirmation', async () => {
  const tree = await mount(); await click(tree, 'Configure section (initially hidden)');
  await fill(tree, 'title', 'Pending'); let release; gate = new Promise((resolve) => { release = resolve; });
  await submit(tree);
  assert.match(text(tree.root), /Saving…/); assert.equal(dirtyEvents.at(-1), true);
  assert.ok(tree.root.findAllByType('input').every((i) => i.props.disabled));
  release(); gate = null; await flush(); await flush();
  assert.equal(section.items[0].title, 'Pending');
  assert.equal(dirtyEvents.at(-1), false);
});

test('read-only marketing viewer gets no save/configuration controls', async () => {
  const tree = await mount({ employee: { ...employee, permissions: ['marketing.view'] } });
  assert.equal(tree.root.findAllByType('form').length, 0);
  assert.equal(tree.root.findAllByType('button').some((b) => text(b).startsWith('Configure')), false);
});

for (const state of ['inactive', 'empty']) test(`configured ${state} is authoritative, not a fallback`, () => {
  assert.equal(model.homepageSectionMode(snapshot(state), 'trust').mode, 'hidden');
});
test('missing is hidden, unavailable is distinct, failed request and old backend are distinct', () => {
  assert.equal(model.homepageSectionMode(snapshot(), 'trust').mode, 'hidden');
  assert.equal(model.homepageSectionMode({ homeStatus: 'ready', home: { heroSlides: [] } }, 'trust').mode, 'unavailable');
  assert.equal(model.homepageSectionMode({ ...snapshot(), homeStatus: 'error' }, 'trust').mode, 'unavailable');
  const failedSnapshot = snapshot(); failedSnapshot.home.homepageContent.status = 'unavailable';
  assert.equal(model.homepageSectionMode(failedSnapshot, 'trust').mode, 'unavailable');
  assert.equal(model.homepageSectionMode(snapshot('ready'), 'unknown').mode, 'unavailable');
});
test('typed adapter never fills absent slots or converts media into products', () => {
  const content = model.adaptHomepageSection({ items: [
    { contentType: 'TEXT', slotKey: 'intro', text: { title: 'Real copy' } },
    { contentType: 'MEDIA', slotKey: 'campaign', media: { id: 'asset', url: '/api/v1/media/objects/hero/real.avif' } },
  ] });
  assert.equal(content.intro.title, 'Real copy'); assert.equal(content.media('missing').url, '');
  assert.deepEqual(content.products('products'), []); assert.equal(content.text('missing').title, '');
});
test('all eleven consumers use the shared boundary, no reference/default/storage changes', () => {
  const home = readFileSync(`${root}src/components/customer/pages/Home.jsx`, 'utf8');
  assert.equal((home.match(/<HomepageSection sectionKey=/g) || []).length, 11);
  assert.match(home, /<Hero \/>/);
  const promo = readFileSync(`${root}src/components/customer/components/sections/PromoBanner.jsx`, 'utf8');
  /* STEP-1-DB-DRIVEN: the promotion renders only authored content, and the
     sample-offer label / mock promo-code chip went with the mock register. */
  assert.match(promo, /if \(!content\) return null;/);
  assert.doesNotMatch(promo, /isSample|getActivePromotion|promo__code|promo__num/);
  const editor = readFileSync(`${root}src/components/admin/homepage/SectionContentEditor.jsx`, 'utf8');
  assert.doesNotMatch(editor, /localStorage|apiAdminCreateDraft|subscription.*post/i);
  assert.match(readFileSync(`${root}src/components/customer/services/newsletter.js`, 'utf8'), /unavailable|not connected|no.*endpoint/i);
});

test('nullable editorial fields normalize to empty strings, and draft DTOs are not admitted', () => {
  const content = model.adaptHomepageSection({ items: [
    { contentType: 'TEXT', slotKey: 'intro', text: { title: null, subtitle: 'Actual body' } },
    { contentType: 'MEDIA', slotKey: 'bride', media: { title: null, altText: null } },
    { contentType: 'PRODUCT', slotKey: 'products', product: { id: 'draft', status: 'DRAFT', price: 10 } },
  ] });
  assert.equal(content.intro.title, ''); assert.equal(content.intro.subtitle, 'Actual body');
  assert.equal(content.media('bride').title, ''); assert.deepEqual(content.products('products'), []);
});

test('marketing-only navigation opens only the homepage, not the media library', async () => {
  const staff = { ...employee, permissions: ['marketing.view'] };
  const auth = await vite.ssrLoadModule('/src/services/employees/authorization.js');
  assert.equal(auth.canAccessPath(staff, '/employee/media/marketing'), true);
  assert.equal(auth.canAccessPath(staff, '/employee/media'), false);
  const nav = await vite.ssrLoadModule('/src/config/adminNavigation.js');
  const visible = nav.filterAdminNav(nav.ADMIN_NAV_GROUPS, (key) => key === 'marketing.view').flatMap((g) => g.items);
  assert.ok(visible.some((item) => item.id === 'marketing-media'));
  assert.ok(!visible.some((item) => item.to === '/admin/media'));
});
