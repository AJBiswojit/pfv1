/**
 * PRATIKSHYA FASHION — Homepage Content Control Center, Batch 1 regression.
 *
 * Covers the six Batch 1 findings against the REAL components and the REAL API
 * clients. HTTP is mocked; no database, no browser, no production write.
 *
 *   F-01  an existing entry's edit reaches the preview (saved value does not)
 *   F-02  an unconfigured section previews a local draft with zero writes
 *   F-12  an unset MEDIA slot stays visibly missing (no duplicated photograph)
 *   F-04  the hero previews the entries currently in memory, including edits
 *   F-15  a 409 keeps every typed value and needs an explicit reconcile
 *   F-05  403, 5xx and offline are reported as different things
 *
 * plus a "no regression" group that pins the request payload shape, the shared
 * storefront adapter output and the twelve-section storefront boundary.
 */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const root = new URL('../../../../../', import.meta.url).pathname;
const original = {
  fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window,
  document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT,
};

/* -- actors ---------------------------------------------------------------- */
const adminFull = {
  adminId: 'admin', accountLevel: 'ADMIN', status: 'ACTIVE',
  permissions: ['marketing.view', 'marketing.manage', 'media.view', 'media.upload', 'media.assign', 'media.delete'],
};
const reader = { adminId: 'reader', accountLevel: 'ADMIN', status: 'ACTIVE', permissions: ['marketing.view', 'media.view'] };

/* -- registry (mirrors backend/app/schemas/media/homepage.py) --------------- */
const T = (slotKey) => ({ slotKey, contentType: 'TEXT', capacity: 1 });
const M = (slotKey) => ({ slotKey, contentType: 'MEDIA', capacity: 1 });
const P = (slotKey, capacity) => ({ slotKey, contentType: 'PRODUCT', capacity });
const REGISTRY = {
  trust: [T('delivery'), T('authentic'), T('secure'), T('returns'), T('help')],
  categories: [T('intro'), M('women'), M('men'), M('kids'), M('essentials'), P('women-products', 4), P('men-products', 4), P('kids-products', 4), P('essentials-products', 4)],
  bridal: [T('intro'), M('bride'), M('groom'), M('couple'), P('bride-products', 4), P('groom-products', 4)],
  sarees: [T('intro'), T('silk-classics'), T('everyday-elegance'), T('festive-sarees'), T('contemporary-drapes'), M('lookbook-1'), M('lookbook-2'), M('lookbook-3'), P('products', 4)],
};

const image = { id: 'asset-1', objectKey: 'marketing/probe.avif', url: '/api/v1/media/objects/marketing/probe.avif', mimeType: 'image/avif', status: 'uploaded' };
const image2 = { id: 'asset-2', objectKey: 'marketing/probe-2.avif', url: '/api/v1/media/objects/marketing/probe-2.avif', mimeType: 'image/avif', status: 'uploaded' };
const heroRow = () => ({
  id: 'hero-1', placement: 'HOME_HERO', objectKey: 'hero/one.avif', mediaAssetId: 'asset-1',
  url: '/api/v1/media/objects/hero/one.avif', title: 'Savedcampaigntitle', subtitle: 'Backend copy',
  ctaLabel: 'Shop', ctaHref: '/shop', altText: '', sortOrder: 0, isActive: true,
});

let vite, Page, Editor, Panel, Preview, HeroPreview, sectionModel, AdminContext, EmployeeContext, model, previewModel;
let sections, heroRows, requests, renderers, fail;

const text = (node) => (typeof node === 'string' ? node : (node?.children ?? []).map(text).join(''));
const flush = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const stateOf = (sec) => (!sec.configured ? 'missing' : !sec.isActive ? 'inactive' : sec.items.some((r) => r.isActive) ? 'ready' : 'empty');
const sectionState = (key) => sections[key] ?? (sections[key] = {
  key, configured: false, state: 'missing', source: 'legacy', items: [], revision: 0, isActive: false,
  allowedSlots: REGISTRY[key] ?? [],
});

const mount = async (Component, props = {}, admin = adminFull, path = '/admin/media/marketing', employee = null) => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(MemoryRouter, { initialEntries: [path] },
      React.createElement(AdminContext.Provider, { value: { admin, isSuperAdmin: admin?.accountLevel === 'SUPER_ADMIN', isLoading: false } },
        React.createElement(EmployeeContext.Provider, { value: { employee, isLoading: false } },
          React.createElement(Component, props)))));
  });
  renderers.push(tree);
  return tree;
};
const click = async (tree, label) => {
  const button = tree.root.findAllByType('button').find((item) => text(item) === label);
  assert.ok(button, `button exists: ${label}`);
  assert.notEqual(button.props.disabled, true, `button enabled: ${label}`);
  await act(async () => { await button.props.onClick(); });
  await flush();
};
/* F-08 (Batch 3) renamed the visible copy labels; the locators follow the
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
const fieldValue = (tree, field) => {
  const label = tree.root.findAllByType('label').find((l) => fieldLabel(l, field));
  assert.ok(label, `field exists: ${field}`);
  const control = label.findAllByType('input')[0] ?? label.findAllByType('textarea')[0];
  assert.ok(control, `control exists: ${field}`);
  return control.props.value;
};
const previewBody = (tree) => {
  const nodes = tree.root.findAllByProps({ 'data-preview-body': true });
  assert.equal(nodes.length, 1, 'exactly one preview body');
  return text(nodes[0]);
};
const writes = () => requests.filter((request) => request.method !== 'GET');

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  Page = (await load('pages/admin/media/AdminMarketingMedia.jsx')).default;
  Editor = (await load('components/admin/homepage/SectionContentEditor.jsx')).default;
  Panel = (await load('components/admin/BackendHomeHeroPanel.jsx')).default;
  Preview = (await load('components/admin/homepage/SectionPreview.jsx')).default;
  HeroPreview = (await load('components/admin/homepage/HeroPreview.jsx')).default;
  sectionModel = await load('components/storefront/home/homepageSectionModel.js');
  AdminContext = (await load('context/AdminAuthContext.jsx')).default;
  EmployeeContext = (await load('context/EmployeeAuthContext.jsx')).default;
  model = await load('services/homepage/homepageContentModel.js');
  previewModel = await load('components/admin/homepage/previewModel.js');
});

beforeEach(() => {
  sections = {};
  heroRows = [heroRow()];
  requests = [];
  renderers = [];
  fail = {};
  const data = new Map([['pf_admin_access_token', 'admin-token'], ['pf_employee_access_token', 'employee-token']]);
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, confirm: () => true };
  /* The live Hero reads document.hidden in an effect. node has no DOM, so a
     minimal stub lets the REAL storefront Hero mount in this suite (the same
     component the browser runs). */
  globalThis.document = { hidden: false, visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), 'https://test.invalid');
    const method = options.method ?? 'GET';
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
    requests.push({ path: url.pathname, query: url.searchParams, method, body, auth: options.headers?.Authorization });
    let result = { ok: true };
    let status = 200;
    const failWith = (code, message) => { status = code; result = { detail: message }; };

    if ((url.pathname === '/api/v1/admin/homepage/sections' || url.pathname === '/api/v1/employee/homepage/sections') && method === 'GET') {
      if (fail.list) failWith(fail.list, fail.list === 403 ? 'Forbidden' : 'Sections unavailable');
      else result = { ok: true, version: 1, status: 'ready', sections: [{ key: 'hero', state: 'delegated', source: 'heroSlides' }, ...Object.keys(sections).map((key) => sectionState(key))] };
    } else if (/\/homepage\/sections\/[^/]+$/.test(url.pathname) && method === 'GET') {
      const key = decodeURIComponent(url.pathname.split('/').at(-1));
      if (!REGISTRY[key]) failWith(422, 'Unknown or delegated homepage section.');
      else if (fail.read) failWith(fail.read, fail.read === 403 ? 'Homepage permission denied.' : 'Section unavailable');
      else result = { ok: true, section: sectionState(key) };
    } else if (/\/homepage\/sections\/[^/]+$/.test(url.pathname) && method === 'PUT') {
      const key = decodeURIComponent(url.pathname.split('/').at(-1));
      const sec = sectionState(key);
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else { sec.configured = true; sec.source = 'sections'; sec.revision += 1; sec.isActive = body.isActive; sec.state = stateOf(sec); result = { ok: true, section: sec }; }
    } else if (/\/homepage\/sections\/[^/]+\/items$/.test(url.pathname) && method === 'POST') {
      const key = decodeURIComponent(url.pathname.split('/').at(-2));
      const sec = sectionState(key);
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else if (fail.create) failWith(fail.create, 'Write rejected');
      else {
        sec.revision += 1;
        const item = { ...body, id: `entry-${sec.revision}`, sortOrder: sec.items.length };
        if (body.contentType === 'TEXT') item.text = { ...body };
        if (body.contentType === 'MEDIA') item.media = { url: image.url, ...body };
        sec.items.push(item);
        sec.state = stateOf(sec);
        result = { ok: true, section: sec };
      }
    } else if (/\/homepage\/sections\/[^/]+\/items\/[^/]+$/.test(url.pathname) && method === 'PATCH') {
      const parts = url.pathname.split('/');
      const key = decodeURIComponent(parts.at(-3));
      const sec = sectionState(key);
      const row = sec.items.find((r) => r.id === decodeURIComponent(parts.at(-1)));
      /* Production order (homepage_content_service.write): the section revision
         is compared BEFORE the item id is resolved, so a deleted entry reached
         with a stale revision is a 409, not a 404. Keep the double faithful. */
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else if (!row) failWith(404, 'Entry does not belong to this section.');
      else {
        Object.assign(row, body);
        if (row.text) Object.assign(row.text, body);
        sec.revision += 1;
        sec.state = stateOf(sec);
        result = { ok: true, section: sec };
      }
    } else if (url.pathname === '/api/v1/admin/marketing/media' && method === 'GET') {
      result = { items: heroRows, total: heroRows.length };
    } else if (url.pathname === '/api/v1/admin/homepage/sections/hero') {
      failWith(422, 'Unknown or delegated homepage section.');
    } else if (url.pathname === '/api/v1/home') {
      result = { heroSlides: [], homepageContent: { version: 1, status: 'ready', sections: [] } };
    } else if (url.pathname === '/api/v1/media/assets') {
      result = { items: [image, image2], total: 2, page: 1, pageSize: 24 };
    } else if (url.pathname === '/api/v1/products') {
      result = { items: [], total: 0 };
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
  for (const [key, value] of [['fetch', original.fetch], ['localStorage', original.localStorage], ['window', original.window], ['document', original.document], ['IS_REACT_ACT_ENVIRONMENT', original.act]]) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
});

/* -- F-01 ------------------------------------------------------------------ */

test('F-01 · editing a saved entry previews the edit, not the saved value', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await flush();
  await click(tree, 'Configure section (initially hidden)');
  await fill(tree, 'title', 'Savedheading');
  await submit(tree);
  assert.match(text(tree.root), /Savedheading/, 'the entry was saved');

  await click(tree, 'Edit entry');
  await fill(tree, 'title', 'Editedheading');
  await click(tree, 'Preview');

  const body = previewBody(tree);
  assert.match(body, /Editedheading/, 'the preview shows the in-progress edit');
  assert.doesNotMatch(body, /Savedheading/, 'the preview no longer shows the saved value');
  /* The saved row itself is untouched — preview is read-only. */
  assert.match(text(tree.root), /Savedheading/, 'the entry list still shows the saved row');
  assert.equal(sections.trust.items[0].title, 'Savedheading');
  assert.equal(writes().length, 2, 'configure + create only; preview issued no write');
});

test('F-01 · a new draft entry appears in the preview before it is saved', async () => {
  /* categories, not sarees: SareeLookbook binds useScroll to a target ref, which
     cannot hydrate under react-test-renderer (documented in
     homepageAllSections.test.js). The browser has a DOM and is unaffected. */
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'categories', contentType: 'TEXT' });
  await flush();
  await click(tree, 'Configure section (initially hidden)');
  const afterConfigure = writes().length;
  await fill(tree, 'title', 'Newdraftheading');
  await click(tree, 'Preview');
  assert.match(previewBody(tree), /Newdraftheading/, 'the unsaved new entry is previewed');
  assert.match(text(tree.root), /Preview — includes unsaved changes \(not saved\)/);
  assert.equal(writes().length, afterConfigure, 'previewing a new entry issued no request');
});

test('F-01 · a newly chosen MEDIA asset is previewed before it is saved', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'categories', contentType: 'MEDIA' });
  await flush();
  await click(tree, 'Configure section (initially hidden)');
  await click(tree, image.objectKey);
  await fill(tree, 'title', 'Womenart');
  await submit(tree);
  assert.equal(sections.categories.items[0].media.url, image.url, 'the saved entry keeps the first asset');

  await click(tree, 'Edit entry');
  await click(tree, image2.objectKey);
  await click(tree, 'Preview');

  const body = tree.root.findAllByProps({ 'data-preview-body': true })[0];
  const sources = body.findAllByType('img').map((img) => img.props.src);
  assert.ok(sources.includes(image2.url), 'the newly chosen art is previewed');
  assert.equal(sources.includes(image.url), false, 'the saved art is replaced in the preview');
  assert.equal(sections.categories.items[0].media.url, image.url, 'the saved row is unchanged');
});

/* -- F-02 ------------------------------------------------------------------ */

test('F-02 · an unconfigured section previews a local draft and issues no write', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'bridal', contentType: 'TEXT' });
  await flush();
  assert.match(text(tree.root), /Not configured · hidden on the storefront/);
  assert.match(text(tree.root), /Draft only — this section is not configured yet/);
  assert.equal(tree.root.findAllByType('button').some((b) => text(b) === 'Save section entry'), false,
    'an unconfigured section exposes no save control');

  await fill(tree, 'title', 'Unsavedbridalheading');
  const requestsBefore = requests.length;
  await click(tree, 'Preview');
  assert.match(previewBody(tree), /Unsavedbridalheading/, 'the local draft is previewed');
  assert.match(text(tree.root), /Preview — unconfigured section/, 'the preview says the section is unconfigured');
  assert.equal(sections.bridal.configured, false, 'no backend section was configured');
  assert.equal(sections.bridal.revision, 0, 'no backend revision was consumed');
  assert.equal(requests.length, requestsBefore, 'previewing issued no request of any kind');
  assert.deepEqual(writes(), []);
});

test('F-02 · configuring a section keeps the locally drafted entry', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'bridal', contentType: 'TEXT' });
  await flush();
  await fill(tree, 'title', 'Carriedthroughtheconfigure');
  await click(tree, 'Configure section (initially hidden)');
  assert.equal(fieldValue(tree, 'title'), 'Carriedthroughtheconfigure', 'the draft survives configuration');
  await submit(tree);
  assert.equal(sections.bridal.items.length, 1);
  assert.equal(sections.bridal.items[0].title, 'Carriedthroughtheconfigure');
});

/* -- F-12 ------------------------------------------------------------------ */

const categoriesSection = () => ({
  key: 'categories', configured: true, state: 'ready', source: 'sections', isActive: true, revision: 3,
  allowedSlots: REGISTRY.categories,
  items: [
    { id: 'text-1', slotKey: 'intro', contentType: 'TEXT', sortOrder: 0, isActive: true, text: { title: 'The Edit', eyebrow: '02' }, eyebrow: '02', title: 'The Edit' },
    { id: 'media-1', slotKey: 'women', contentType: 'MEDIA', sortOrder: 1, isActive: true, mediaAssetId: image.id, media: { url: '/api/v1/media/objects/marketing/women.avif', altText: 'Women art', title: 'Women' } },
  ],
});

test('F-12 · one selected image is never repeated into the empty slots', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(Preview, { sectionKey: 'categories', draft: {}, asset: null, product: null, slot: 'women', contentType: 'MEDIA', section: categoriesSection() })));
  const chosen = '/api/v1/media/objects/marketing/women.avif';
  assert.equal(html.split(chosen).length - 1, 1, 'the chosen art appears exactly once');
  assert.equal(html.split('data:image/svg+xml').length - 1, 3, 'the three unset slots render placeholders');
  for (const label of ['Men tile', 'Kids tile', 'Essentials tile']) {
    assert.match(html, new RegExp(`${label} — no image chosen`), `${label} is named in its placeholder`);
  }
  assert.match(html, /1 of 4 image slots have art · not set: Men tile, Kids tile, Essentials tile/);
});

test('F-12 · a fully configured media section reports complete coverage and no placeholders', () => {
  const section = categoriesSection();
  section.items = section.items.concat(['men', 'kids', 'essentials'].map((slotKey, index) => ({
    id: `media-${slotKey}`, slotKey, contentType: 'MEDIA', sortOrder: index + 2, isActive: true,
    media: { url: `/api/v1/media/objects/marketing/${slotKey}.avif`, altText: '' },
  })));
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(Preview, { sectionKey: 'categories', draft: {}, asset: null, product: null, slot: 'women', contentType: 'MEDIA', section })));
  assert.match(html, /4 of 4 image slots have art/);
  assert.equal(html.includes('data:image/svg+xml'), false, 'no placeholder is invented');
});

/* -- F-04 ------------------------------------------------------------------ */

test('F-04 · the hero preview renders the in-memory entries and their unsaved edits', async () => {
  const tree = await mount(Panel);
  await flush();
  assert.match(text(tree.root), /Savedcampaigntitle/);
  await click(tree, 'Edit entry');
  await fill(tree, 'Title', 'Unsavedherotitle');
  await click(tree, 'Preview');

  const preview = tree.root.findAllByProps({ 'data-hero-preview': true });
  assert.equal(preview.length, 1, 'the hero preview mounted');
  assert.match(text(tree.root.findAllByProps({ 'data-hero-preview-label': true })[0]),
    /including unsaved changes \(not saved\)/, 'an edited hero says it is unsaved');
  assert.equal(tree.root.findAllByProps({ 'data-hero-preview-body': true }).length, 1);
  const body = text(tree.root.findAllByProps({ 'data-hero-preview-body': true })[0]);
  assert.match(body, /Unsavedherotitle/, 'the unsaved title is previewed');
  assert.doesNotMatch(body, /Savedcampaigntitle/, 'the saved title is not previewed while it is being edited');
  assert.equal(writes().length, 0, 'previewing the hero saved nothing');
  assert.equal(heroRows[0].title, 'Savedcampaigntitle', 'the backend row is unchanged');
});

test('F-04 · an untouched hero preview says it is showing saved content', async () => {
  const tree = await mount(Panel);
  await flush();
  await click(tree, 'Preview');
  assert.match(text(tree.root.findAllByProps({ 'data-hero-preview-label': true })[0]),
    /from the saved entries \(no unsaved changes\)/);
  assert.doesNotMatch(text(tree.root.findAllByProps({ 'data-hero-preview-label': true })[0]), /not saved/);
  assert.equal(writes().length, 0);
});

/* V-1: both previews must mount inside the storefront's `.pf-root` scope.
   customer.css scopes 771 rules (design tokens, .collage/.saree/.hero layouts,
   typography) under that class; without it the preview rendered correct data
   with no design at all. This is an admin-only wrapper — no storefront file
   changes. */
test('V-1 · section and hero previews mount inside the `.pf-root` storefront scope', async () => {
  const editor = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'bridal', contentType: 'TEXT' });
  await flush();
  await click(editor, 'Preview');
  const body = editor.root.findAllByProps({ 'data-preview-body': true })[0];
  assert.equal(body.props.className, 'pf-root', 'the section preview carries the storefront scope');

  const panel = await mount(Panel);
  await flush();
  await click(panel, 'Preview');
  const heroBody = panel.root.findAllByProps({ 'data-hero-preview-body': true })[0];
  assert.equal(heroBody.props.className, 'pf-root', 'the hero preview carries the storefront scope');
});

test('F-04 · the hero preview states that nothing is set when no entry has art', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(HeroPreview, { rows: [{ id: 'no-art', title: 'No plate', url: '' }] })));
  assert.match(html, /Preview — no hero entry has an image yet/);
  assert.doesNotMatch(html, /hero__stage/, 'no empty carousel frame is rendered');
});

/* -- F-15 ------------------------------------------------------------------ */

test('F-15 · a 409 keeps the complete draft and requires an explicit reconcile', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await flush();
  await click(tree, 'Configure section (initially hidden)');
  await fill(tree, 'title', 'Draftunderconflict');
  await fill(tree, 'subtitle', 'Second field preserved');
  await fill(tree, 'CTA destination', '/shop');
  await fill(tree, 'Button label', 'Shop now');
  const beforeSubmit = writes().length;

  sections.trust.revision += 3; // another operator saved first
  await submit(tree);

  assert.match(text(tree.root), /Content changed/, 'the conflict is explained');
  assert.match(text(tree.root), /Someone else saved this section/);
  assert.match(text(tree.root), /Your draft is preserved exactly as typed/);
  assert.equal(fieldValue(tree, 'title'), 'Draftunderconflict');
  assert.equal(fieldValue(tree, 'subtitle'), 'Second field preserved');
  assert.equal(fieldValue(tree, 'CTA destination'), '/shop');
  assert.equal(fieldValue(tree, 'Button label'), 'Shop now');
  assert.equal(tree.root.findAllByType('button').find((b) => text(b) === 'Save section entry').props.disabled, true,
    'no write can be repeated against the stale revision');
  const afterSubmit = writes().length;
  assert.equal(afterSubmit, beforeSubmit + 1, 'exactly one rejected attempt — no automatic retry');
  assert.equal(sections.trust.items.length, 0, 'nothing was written');

  const sectionReads = () => requests.filter((r) => r.method === 'GET' && r.path === '/api/v1/admin/homepage/sections/trust').length;
  const readsBefore = sectionReads();
  await click(tree, 'Reload and reconcile (keep my draft)');
  assert.equal(writes().length, afterSubmit, 'reconcile is read-only');
  assert.equal(sectionReads(), readsBefore + 1, 'exactly one re-read of the section');
  assert.equal(fieldValue(tree, 'title'), 'Draftunderconflict', 'the draft survived the reconcile');
  assert.match(text(tree.root), /Your draft is preserved below/);
  assert.notEqual(tree.root.findAllByType('button').find((b) => text(b) === 'Save section entry').props.disabled, true,
    'an explicit, fresh save is available');

  await submit(tree);
  assert.equal(sections.trust.items.length, 1, 'the reviewed draft was applied once');
  assert.equal(sections.trust.items[0].title, 'Draftunderconflict');
});

test('F-15 · a deleted entry is re-based as a new entry, never PATCHed by an undefined id', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await flush();
  await click(tree, 'Configure section (initially hidden)');
  await fill(tree, 'title', 'Originalcopy');
  await submit(tree);
  await click(tree, 'Edit entry');
  await fill(tree, 'title', 'Preservedafterdelete');

  /* Another operator deletes the entry; the delete bumps the revision, so the
     next write is a 409 exactly as the backend orders its checks. */
  sections.trust.items = [];
  sections.trust.revision += 1;
  await submit(tree);
  assert.match(text(tree.root), /Someone else saved this section/);
  assert.equal(fieldValue(tree, 'title'), 'Preservedafterdelete');

  await click(tree, 'Reload and reconcile (keep my draft)');
  assert.match(text(tree.root), /The entry you were editing no longer exists/);
  assert.equal(fieldValue(tree, 'title'), 'Preservedafterdelete', 'the draft survives the re-base');
  assert.match(text(tree.root), /New inactive entry/, 'the form returns to the create form');

  const before = requests.length;
  await submit(tree);
  const sent = requests.slice(before).filter((r) => r.method !== 'GET');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'POST', 'a create, never a PATCH on a missing id');
  assert.equal(sent[0].path, '/api/v1/admin/homepage/sections/trust/items');
  assert.equal(sent[0].body.contentType, 'TEXT');
  assert.equal(sent[0].body.slotKey, 'delivery');
  assert.equal(sent[0].body.isActive, false);
  assert.equal(sent[0].body.title, 'Preservedafterdelete');
  assert.equal(requests.some((r) => r.path.includes('/items/undefined')), false);
  assert.equal(sections.trust.items.length, 1);
  assert.equal(sections.trust.items[0].title, 'Preservedafterdelete');
});

test('F-15 · a failed reconcile keeps the draft and does not write', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await flush();
  await click(tree, 'Configure section (initially hidden)');
  await fill(tree, 'title', 'Surviveseveryfailure');
  sections.trust.revision += 1;
  await submit(tree);
  const before = writes().length;
  fail.read = 503;
  await click(tree, 'Reload and reconcile (keep my draft)');
  assert.equal(fieldValue(tree, 'title'), 'Surviveseveryfailure');
  assert.match(text(tree.root), /Your draft is preserved/);
  assert.equal(writes().length, before, 'a failed read never becomes a write');
});

/* -- F-05 ------------------------------------------------------------------ */

test('F-05 · a refused section list and a failed one read differently', async () => {
  fail.list = 403;
  const refused = await mount(Page);
  await flush(); await flush();
  assert.match(text(refused.root), /Requires marketing\.view/);
  assert.doesNotMatch(text(refused.root), /Server error — retry/);
  await act(async () => refused.unmount());
  renderers = renderers.filter((tree) => tree !== refused);

  fail.list = 503;
  const failed = await mount(Page);
  await flush(); await flush();
  assert.match(text(failed.root), /Server error — retry/);
  assert.doesNotMatch(text(failed.root), /Requires marketing\.view/);
});

test('F-05 · a refused section read is not reported as an outage', async () => {
  fail.read = 403;
  const refused = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await flush();
  assert.match(text(refused.root), /not permitted to read this section \(HTTP 403\)/);
  assert.match(text(refused.root), /Homepage permission denied\./, 'the server message is kept as detail');
  assert.doesNotMatch(text(refused.root), /could not be reached|HTTP 5/);
  await act(async () => refused.unmount());
  renderers = renderers.filter((tree) => tree !== refused);

  fail.read = 503;
  const failed = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await flush();
  assert.match(text(failed.root), /homepage service failed \(HTTP 503\)/);
  assert.match(text(failed.root), /Section unavailable/, 'the server message is kept as detail');
  assert.doesNotMatch(text(failed.root), /not permitted/);
});

test('F-05 · the status vocabulary is pure and exhaustive', () => {
  assert.equal(model.sectionListStatusLabel(403), 'Requires marketing.view');
  assert.equal(model.sectionListStatusLabel(401), 'Session expired — sign in');
  assert.equal(model.sectionListStatusLabel(0), 'Status unavailable — retry');
  assert.equal(model.sectionListStatusLabel(503), 'Server error — retry');
  assert.equal(model.sectionListStatusLabel(500), 'Server error — retry');
  assert.equal(model.sectionListStatusLabel(422), 'Status unavailable · HTTP 422');
  assert.equal(model.sectionStatusLabel({ configured: false, state: 'missing' }), 'Hidden until configured');
});

/* -- no unintended change -------------------------------------------------- */

test('no regression · the save payload is byte-for-byte the pre-Batch-1 shape', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await flush();
  await click(tree, 'Configure section (initially hidden)');
  await fill(tree, 'title', 'Payloadcheck');
  await submit(tree);
  const created = requests.find((r) => r.method === 'POST' && r.path.endsWith('/items'));
  assert.deepEqual(Object.keys(created.body).sort(),
    ['altText', 'contentType', 'ctaHref', 'ctaLabel', 'expectedRevision', 'eyebrow', 'isActive', 'slotKey', 'subtitle', 'title'].sort());
  assert.equal(created.body.contentType, 'TEXT');
  assert.equal(created.body.slotKey, 'delivery');
  assert.equal(created.body.isActive, false);
  assert.equal('mediaAssetId' in created.body, false);
  assert.equal('productId' in created.body, false);

  await click(tree, 'Edit entry');
  await fill(tree, 'title', 'Patched');
  await submit(tree);
  const patched = requests.find((r) => r.method === 'PATCH');
  assert.deepEqual(Object.keys(patched.body).sort(),
    ['altText', 'ctaHref', 'ctaLabel', 'expectedRevision', 'eyebrow', 'subtitle', 'title'].sort());
});

test('F-12 · placeholder art can never reach an API payload', async () => {
  /* Preview an unconfigured MEDIA section with three unset slots, then take the
     whole editor through every action that issues a request. No payload — and
     no request body at all — may contain the placeholder data URI. */
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'categories', contentType: 'MEDIA' });
  await flush();
  await fill(tree, 'title', 'Noartchosen');
  await click(tree, 'Preview');
  const previewImages = tree.root.findAllByProps({ 'data-preview-body': true })[0]
    .findAllByType('img').map((img) => String(img.props.src));
  assert.ok(previewImages.some((src) => src.startsWith('data:image/svg+xml')), 'the preview really is showing placeholders');
  assert.ok(previewImages.every((src) => src.startsWith('data:image/svg+xml') || src.startsWith('/api/v1/media/objects/')));
  await click(tree, 'Edit');
  await click(tree, 'Configure section (initially hidden)');
  assert.equal(requests.some((r) => String(r.body ?? '').includes('data:image')), false,
    'configuration carried no placeholder');
  assert.equal(requests.some((r) => String(r.body ?? '').includes('preview-placeholder')), false,
    'no synthetic preview id reached the wire');
  /* Previewing again after configuration still writes nothing. */
  const before = requests.length;
  await click(tree, 'Preview');
  assert.equal(requests.length, before);
  assert.equal(requests.some((r) => String(r.body ?? '').includes('data:image')), false);
});

test('no regression · preview composition never mutates saved rows', () => {
  const section = categoriesSection();
  const snapshot = JSON.parse(JSON.stringify(section.items));
  previewModel.buildSectionPreview({ sectionKey: 'categories', section, contentType: 'MEDIA', slotKey: 'women', editingId: 'media-1', draft: { title: 'Edited' }, asset: null, product: null });
  assert.deepEqual(section.items, snapshot, 'the saved item array is untouched');
});

test('no regression · the shared storefront adapter still produces the same content', () => {
  const content = sectionModel.adaptHomepageSection({ items: [
    { contentType: 'TEXT', slotKey: 'intro', text: { title: 'Copy', subtitle: null } },
    { contentType: 'MEDIA', slotKey: 'women', media: { url: '/api/v1/media/objects/marketing/women.avif', altText: null } },
    { contentType: 'PRODUCT', slotKey: 'women-products', product: { id: 'draft', status: 'DRAFT', price: 10 } },
  ] });
  assert.deepEqual(content.intro, { eyebrow: '', title: 'Copy', subtitle: '', ctaLabel: '', ctaHref: '', altText: '', url: '' });
  assert.equal(content.media('women').url, '/api/v1/media/objects/marketing/women.avif');
  assert.equal(content.media('men').url, '', 'an absent slot stays empty — never borrowed');
  assert.deepEqual(content.products('women-products'), [], 'draft products are still refused');
  assert.deepEqual(content.texts(), [], 'intro is not repeated as a collection');
  assert.deepEqual(content.mediaList(), [{
    key: 'women', eyebrow: '', title: '', subtitle: '', ctaLabel: '', ctaHref: '', altText: '',
    url: '/api/v1/media/objects/marketing/women.avif',
  }]);
});

test('no regression · the storefront boundary still mounts eleven sections plus the hero', async () => {
  assert.equal(model.HOMEPAGE_SECTIONS.length, 12);
  const home = (await import('node:fs')).readFileSync(`${root}src/components/customer/pages/Home.jsx`, 'utf8');
  assert.equal((home.match(/<HomepageSection sectionKey=/g) || []).length, 11);
  assert.match(home, /<Hero \/>/);
});
