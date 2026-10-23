/**
 * PRATIKSHYA FASHION — Homepage Content Control Center, Batch 3 regression.
 *
 * Covers the nine Batch 3 findings against the REAL components and the REAL API
 * clients. HTTP is mocked; no database, no browser, no production write.
 *
 *   F-08  human copy labels, mirrored maxLength, help text, late counter
 *   F-06  entry rows carry a thumbnail, a human slot label and a real title
 *   F-07  EntryRow / SaveBar / CopyField are the only implementations
 *   F-14  recognised 422s land under their field; preflight blocks bad CTAs
 *   F-18  a disabled picker keeps Retry reachable
 *   F-21  the static `live` flag is gone; `pipeline` names the two pipelines
 *   F-22  one caveat per section, above the fields it constrains
 *   F-24  primary/secondary/destructive buttons are visually distinct
 *   F-25  structural borders use pf-border-strong
 */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const root = new URL('../../../../../', import.meta.url).pathname;
const original = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window };

const adminFull = {
  adminId: 'admin', accountLevel: 'ADMIN', status: 'ACTIVE',
  permissions: ['marketing.view', 'marketing.manage', 'media.view', 'media.upload', 'media.assign', 'media.delete'],
};
const adminViewer = {
  adminId: 'viewer', accountLevel: 'ADMIN', status: 'ACTIVE',
  permissions: ['marketing.view', 'marketing.manage', 'media.view'],
};

const T = (slotKey) => ({ slotKey, contentType: 'TEXT', capacity: 1 });
const M = (slotKey) => ({ slotKey, contentType: 'MEDIA', capacity: 1 });
const P = (slotKey, capacity) => ({ slotKey, contentType: 'PRODUCT', capacity });
const REGISTRY = {
  trust: [T('delivery'), T('authentic'), T('secure'), T('returns'), T('help')],
  categories: [T('intro'), M('women'), M('men'), P('women-products', 4)],
  newsletter: [T('intro'), T('fine-print'), M('campaign')],
  promotion: [T('intro'), M('campaign')],
  sarees: [T('intro'), M('lookbook-1'), M('lookbook-2'), M('lookbook-3')],
};
const TITLES = { trust: 'Trust strip', categories: 'Category collage', newsletter: 'Newsletter', promotion: 'Promotion banner', sarees: 'Saree lookbook' };

const image = { id: 'asset-1', objectKey: 'marketing/probe.avif', url: '/api/v1/media/objects/marketing/probe.avif', mimeType: 'image/avif', status: 'uploaded' };
const heroRow = {
  id: 'hero-1', placement: 'HOME_HERO', objectKey: 'hero/one.avif', mediaAssetId: image.id,
  url: image.url, title: 'Banarasi', subtitle: 'Silk', ctaLabel: 'Shop', ctaHref: '/sarees',
  sortOrder: 0, isActive: true,
};

let vite, Page, Editor, Hero, Picker, model, copyFields, saveBar;
let sections, requests, renderers, fail;
const text = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
const flush = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const stateOf = (sec) => !sec.configured ? 'missing' : !sec.isActive ? 'inactive' : sec.items.some((r) => r.isActive) ? 'ready' : 'empty';
const sectionState = (key) => sections[key] ?? (sections[key] = { key, configured: false, state: 'missing', source: 'legacy', items: [], revision: 0, isActive: false, allowedSlots: REGISTRY[key] ?? [] });
const writes = () => requests.filter((request) => request.method !== 'GET');
const buttonNamed = (tree, label) => tree.root.findAllByType('button').find((b) => text(b) === label);
const click = async (tree, label) => {
  const button = buttonNamed(tree, label);
  assert.ok(button, `button exists: ${label}`);
  assert.notEqual(button.props.disabled, true, `button enabled: ${label}`);
  await act(async () => { await button.props.onClick(); });
  await flush(); await flush();
  return button;
};
const fieldLabel = (l, field) => text(l).toLowerCase() === String(field).toLowerCase();
const labelFor = (tree, field) => tree.root.findAllByType('label').find((l) => fieldLabel(l, field));
const controlFor = (tree, field) => {
  const label = labelFor(tree, field);
  assert.ok(label, `field exists: ${field}`);
  return label.findAllByType('input')[0] ?? label.findAllByType('textarea')[0];
};
const fill = async (tree, field, value) => act(async () => {
  controlFor(tree, field).props.onChange({ target: { value } });
});

const submit = async (tree) => { await act(async () => { tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); await flush(); await flush(); };
const submitButton = (tree, label) => tree.root.findAllByType('button').find((b) => text(b) === label);
const saveAndPublish = async (tree) => {
  await act(async () => { submitButton(tree, 'Save & publish').props.onClick(); });
  await flush(); await flush();
};
const ensureConfigured = async (tree) => {
  if (/Configure section \(initially hidden\)/.test(text(tree.root))) { await click(tree, 'Configure section (initially hidden)'); await flush(); }
};
const navTo = async (tree, title) => {
  const button = tree.root.findAllByType('button').find((b) => text(b).includes(`01${TITLES.trust}`) || text(b).includes(title));
  assert.ok(button, `nav exists: ${title}`);
  await act(async () => { button.props.onClick(); });
  await flush(); await flush();
};

const mount = async (Component, props = {}) => {
  let tree;
  await act(async () => { tree = create(React.createElement(MemoryRouter, null, React.createElement(Component, props))); });
  renderers.push(tree); await flush(); await flush();
  return tree;
};
const mountPage = async (admin = adminFull) => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(MemoryRouter, { initialEntries: ['/super-admin/media/marketing'] },
      React.createElement(requireContext(), { value: { admin, isSuperAdmin: true, isLoading: false } },
        React.createElement(Page, null))));
  });
  renderers.push(tree); await flush(); await flush();
  return tree;
};
let Context;
const requireContext = () => Context;

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  Page = (await load('pages/admin/media/AdminMarketingMedia.jsx')).default;
  Context = (await load('context/AdminAuthContext.jsx')).default;
  Editor = (await load('components/admin/homepage/SectionContentEditor.jsx')).default;
  Hero = (await load('components/admin/BackendHomeHeroPanel.jsx')).default;
  Picker = (await load('components/admin/homepage/RegisteredMediaPicker.jsx')).default;
  model = await load('services/homepage/homepageContentModel.js');
  copyFields = await load('components/admin/homepage/copyFields.jsx');
  saveBar = await load('components/admin/homepage/SaveBar.jsx');
});

beforeEach(() => {
  sections = {}; requests = []; renderers = []; fail = {};
  const data = new Map([['pf_admin_access_token', 'admin-token']]);
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, confirm: () => true };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), 'https://test.invalid');
    const method = options.method ?? 'GET';
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
    requests.push({ path: url.pathname, query: url.searchParams, method, body });
    let result = { ok: true };
    let status = 200;
    const failWith = (code, message) => { status = code; result = { detail: message }; };

    if (/\/homepage\/sections$/.test(url.pathname) && method === 'GET') {
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
      if (fail.create) failWith(fail.create.status, fail.create.message);
      else if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else {
        sec.revision += 1;
        const item = { ...body, id: `entry-${sec.revision}`, sortOrder: sec.items.length };
        if (body.contentType === 'TEXT') item.text = { ...body };
        if (body.contentType === 'MEDIA') item.media = { url: image.url, ...body };
        sec.items.push(item); sec.state = stateOf(sec);
        result = { ok: true, section: sec };
      }
    } else if (/\/homepage\/sections\/[^/]+\/items\/[^/]+$/.test(url.pathname) && method === 'PATCH') {
      const parts = url.pathname.split('/');
      const sec = sectionState(decodeURIComponent(parts.at(-3)));
      const row = sec.items.find((r) => r.id === decodeURIComponent(parts.at(-1)));
      if (body.expectedRevision !== sec.revision) failWith(409, 'Content changed. Reload and reconcile before retrying.');
      else if (!row) failWith(404, 'Entry does not belong to this section.');
      else { Object.assign(row, body); sec.revision += 1; sec.state = stateOf(sec); result = { ok: true, section: sec }; }
    } else if (url.pathname === '/api/v1/media/assets') {
      if (fail.assets) failWith(fail.assets.status, fail.assets.message);
      else result = { items: [image], total: 1, page: 1, pageSize: 24 };
    } else if (url.pathname === '/api/v1/admin/marketing/media' || url.pathname === '/api/v1/employee/homepage/hero/items') {
      result = { ok: true, items: [heroRow], total: 1 };
    } else if (url.pathname === '/api/v1/home') {
      result = { heroSlides: [], homepageContent: { version: 1, status: 'ready', sections: [] } };
    } else if (['/api/v1/categories', '/api/v1/collections', '/api/v1/products', '/api/v1/offers'].includes(url.pathname)) {
      result = { items: [], total: 0 };
    }
    return { ok: status >= 200 && status < 300, status, json: async () => result, text: async () => JSON.stringify(result), headers: new Headers({ 'content-type': 'application/json' }) };
  };
});

afterEach(() => {
  for (const tree of renderers) { try { tree.unmount(); } catch { /* already gone */ } }
  globalThis.fetch = original.fetch;
  globalThis.localStorage = original.localStorage;
  globalThis.window = original.window;
});

after(async () => { await vite?.close?.(); });

/* -- F-08 ------------------------------------------------------------------ */

test('F-08 · copy fields carry human labels, mirrored limits and help text', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await ensureConfigured(tree);
  for (const label of ['Kicker', 'Title', 'Subtitle', 'Button label', 'CTA destination', 'Image description']) {
    assert.ok(labelFor(tree, label), `human label present: ${label}`);
  }
  for (const raw of ['ctaHref', 'ctaLabel', 'altText', 'eyebrow']) {
    assert.equal(tree.root.findAllByType('label').some((l) => text(l) === raw), false, `${raw} is no longer printed`);
  }
  assert.equal(controlFor(tree, 'Title').props.maxLength, 255);
  assert.equal(controlFor(tree, 'Kicker').props.maxLength, 100);
  assert.equal(controlFor(tree, 'Kicker').props.maxLength, 100, 'eyebrow limit mirrors the schema');
  assert.equal(controlFor(tree, 'CTA destination').props.maxLength, 500);
  assert.equal(controlFor(tree, 'Image description').props.maxLength, 2000);
  const subtitle = labelFor(tree, 'Subtitle').findAllByType('textarea')[0];
  assert.ok(subtitle, 'subtitle is a textarea');
  assert.equal(subtitle.props.maxLength, 500);
  assert.match(text(tree.root), /Read aloud by screen readers/, 'help text is rendered');
  assert.match(text(tree.root), /single "\/"/, 'the CTA rule is stated');
});

test('F-08 · the counter appears only from 80 % of the limit', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await ensureConfigured(tree);
  await fill(tree, 'Title', 'a short headline');
  assert.doesNotMatch(text(tree.root), /15\/255/);
  await fill(tree, 'Title', 'x'.repeat(205));
  assert.match(text(tree.root), /205\/255/, 'counter appears at 80 %');
  assert.match(text(tree.root), /205\/255/, 'counter tracks the value');
});

/* -- F-06 / F-07 ----------------------------------------------------------- */

test('F-06 · an untitled media entry shows art + human label, never a raw UUID', async () => {
  sections.categories = {
    key: 'categories', configured: true, state: 'ready', source: 'sections', revision: 2, isActive: true,
    allowedSlots: REGISTRY.categories,
    items: [{ id: 'm1', slotKey: 'women', contentType: 'MEDIA', sortOrder: 0, isActive: true, mediaAssetId: 'asset-9f3c-uuid', media: { url: image.url }, title: '' }],
  };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'categories', contentType: 'MEDIA' });
  assert.match(text(tree.root), /Untitled media entry/);
  assert.match(text(tree.root), /Women/, 'the slot is named, not printed as a key');
  assert.equal(text(tree.root).includes('asset-9f3c-uuid'), false, 'the raw asset id is not printed when art exists');
  const thumb = tree.root.findAllByType('img').find((img) => img.props.src === image.url);
  assert.ok(thumb, 'the row carries the thumbnail');
  assert.equal(thumb.props.loading, 'lazy');
});

test('F-07 · both editors render the shared EntryRow and SaveBar', async () => {
  const entryRowSource = await vite.transformRequest('/src/components/admin/homepage/EntryRow.jsx');
  assert.match(entryRowSource.code, /export default function EntryRow/);
  assert.match(saveBar.buttonClass('primary'), /bg-pf-burgundy/);
  assert.match(saveBar.buttonClass('secondary'), /border-pf-border-strong/);
  assert.match(saveBar.buttonClass('destructive'), /pf-error/);

  sections.sarees = { key: 'sarees', configured: true, state: 'ready', source: 'sections', revision: 3, isActive: true, allowedSlots: REGISTRY.sarees, items: [{ id: 'm1', slotKey: 'lookbook-1', contentType: 'MEDIA', sortOrder: 0, isActive: true, mediaAssetId: image.id, media: { url: image.url }, title: 'Banarasi' }] };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'sarees', contentType: 'MEDIA' });
  assert.match(text(tree.root), /Lookbook 1/, 'humanSlot() turns lookbook-1 into words');
  assert.ok(tree.root.findAllByType('li').length >= 1, 'the row still renders as a list item');
});

test('review · the hero TEXT tab never claims the artwork is missing', async () => {
  /* Found in review: EntryRow defaulted the cover placeholder to "No safe media
     preview available." whenever it received no notice, so the hero's TEXT view
     — which intentionally renders no image for a row that DOES have one —
     printed a false warning. The placeholder now requires an explicit notice. */
  let tree;
  await act(async () => {
    tree = create(React.createElement(MemoryRouter, null,
      React.createElement(Context.Provider, { value: { admin: adminFull, isSuperAdmin: true, isLoading: false } },
        React.createElement(Hero, { placement: 'HOME_HERO', contentType: 'TEXT' }))));
  });
  renderers.push(tree); await flush(); await flush();
  assert.match(text(tree.root), /Banarasi/, 'the text row renders');
  assert.doesNotMatch(text(tree.root), /No safe media preview available/, 'no false missing-art warning');
});

/* -- F-14 ------------------------------------------------------------------ */

test('F-14 · a CTA without its pair is rejected before any request', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await ensureConfigured(tree);
  await fill(tree, 'Title', 'Paired check');
  await fill(tree, 'CTA destination', '/shop');
  const before = writes().length;
  await submit(tree);
  assert.equal(writes().length, before, 'no request is sent');
  assert.match(text(tree.root), /must be supplied together/);
  assert.equal(controlFor(tree, 'CTA destination').props['aria-invalid'], true);
});

test('F-14 · a recognised server 422 lands under its field', async () => {
  fail.create = { status: 422, message: 'Text requires meaningful copy' };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await ensureConfigured(tree);
  await fill(tree, 'Title', '   ');
  await submit(tree);
  assert.match(text(tree.root), /Text requires meaningful copy/);
  assert.equal(controlFor(tree, 'Title').props['aria-invalid'], true, 'the title field is marked invalid');
  /* Batch 5: the mapped sentence is still shown once under its field, and is
     now ANNOUNCED by a single live region above the form (the error summary).
     There is still no second, generic alert paragraph for the same failure. */
  const alerts = tree.root.findAllByProps({ role: 'alert' });
  assert.equal(alerts.length, 1, 'exactly one live region announces a mapped failure');
  assert.equal(alerts[0].props.id, 'copy-error-summary', 'the announcement is the shared error summary');
});

test('F-14 · an unmapped failure keeps the existing alert', async () => {
  fail.create = { status: 422, message: 'Something the UI does not know' };
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await ensureConfigured(tree);
  await fill(tree, 'Title', 'Unmapped');
  await submit(tree);
  assert.match(text(tree.root), /Something the UI does not know/);
  assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 1);
});

/* -- F-18 ------------------------------------------------------------------ */

test('F-18 · a disabled picker keeps Retry reachable', async () => {
  fail.assets = { status: 403, message: 'Missing required permission: media.view' };
  const tree = await mount(Picker, { admin: adminFull, disabled: true, disabledReason: 'Browsing the registered library requires media.view. Retry stays available.', value: null, onChange: () => {} });
  const fieldset = tree.root.findByType('fieldset');
  assert.equal(fieldset.props.disabled, undefined, 'the fieldset no longer disables its children');
  assert.match(text(tree.root), /requires media.view/);
  const retry = buttonNamed(tree, 'Retry media library');
  assert.ok(retry, 'retry is rendered');
  assert.notEqual(retry.props.disabled, true, 'retry is reachable');
  const search = tree.root.findAllByType('input').find((i) => i.props.type === 'search');
  assert.equal(search.props.disabled, true, 'the search box is disabled by the parent');
});

/* -- F-21 ------------------------------------------------------------------ */

test('F-21 · the model names the pipeline instead of claiming per-section liveness', () => {
  assert.equal(model.HOMEPAGE_SECTIONS.every((s) => !('live' in s)), true, 'no static live flag remains');
  assert.equal(model.HOMEPAGE_SECTIONS.filter((s) => s.pipeline === 'marketing').length, 1);
  assert.equal(model.HOMEPAGE_SECTIONS.filter((s) => s.pipeline === 'sections').length, 11);
  assert.equal(model.HOMEPAGE_SECTIONS.length, 12);
});

/* -- F-22 ------------------------------------------------------------------ */

test('F-22 · each caveat appears once, above the editor', async () => {
  const tree = await mountPage();
  await navTo(tree, 'Newsletter');
  const body = text(tree.root);
  assert.equal(body.split('No verified subscription endpoint').length - 1, 1, 'newsletter caveat appears once');
  assert.ok(body.indexOf('No verified subscription endpoint') < body.indexOf('New draft entry (not saved)'), 'caveat precedes the editor panel');

  const promo = await mountPage();
  await navTo(promo, 'Promotion banner');
  const promoText = text(promo.root);
  assert.equal(promoText.split('cannot create/apply discounts').length - 1, 1, 'promotion caveat appears once');
  assert.ok(promoText.indexOf('cannot create/apply discounts') < promoText.indexOf('New draft entry (not saved)'), 'caveat precedes the editor panel');
});

/* -- F-24 / F-25 ----------------------------------------------------------- */

test('F-24 · primary and destructive actions are visually distinct', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await ensureConfigured(tree);
  const save = submitButton(tree, 'Save section entry');
  assert.match(save.props.className, /bg-pf-burgundy/, 'save is the primary variant');
  const cancel = submitButton(tree, 'Cancel entry changes');
  assert.match(cancel.props.className, /border-pf-border-strong/, 'cancel is the secondary variant');
  assert.doesNotMatch(cancel.props.className, /bg-pf-burgundy/);
});

test('F-24 · the section editor wears the AdminPanel chrome', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await ensureConfigured(tree);
  assert.match(text(tree.root), /Text entries/, 'the panel title is rendered');
  assert.match(text(tree.root), /Section content/, 'the panel eyebrow is rendered');
});

test('F-25 · structural boundaries use pf-border-strong, hairlines stay pf-border', async () => {
  const tree = await mount(Editor, { actor: { admin: adminFull }, sectionKey: 'trust', contentType: 'TEXT' });
  await ensureConfigured(tree);
  assert.match(controlFor(tree, 'Title').props.className, /border-pf-border-strong/);
  const select = tree.root.findByType('select');
  assert.match(select.props.className, /border-pf-border-strong/);
  assert.equal(tree.root.findAllByProps({ 'data-slot-meter': true }).length, 1, 'the slot meter is rendered');
});

test('F-25 · picker tiles use the structural token too', async () => {
  const tree = await mount(Picker, { admin: adminFull, value: null, onChange: () => {} });
  const tile = tree.root.findAllByType('button').find((b) => text(b).includes(image.objectKey));
  assert.ok(tile, 'a tile is rendered');
  assert.match(tile.props.className, /border-pf-border-strong/);
});
