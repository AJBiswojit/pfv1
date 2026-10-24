/**
 * PRATIKSHYA FASHION — Homepage Content Control Center, Batch 4 regression.
 *
 * Covers the Batch 4 findings against the REAL components and the REAL API
 * clients. HTTP is mocked; no database, no browser, no production write.
 *
 *   F-17  the twelve-section rail is a mobile strip, unchanged on desktop
 *   F-13  the hero refuses a CTA label without its destination (and the reverse)
 *   F-20  the section list seeds the editor — no duplicate full content build
 *   F-19  a vanished plate is hidden instead of painting a broken image
 *   F-07  (accessibility) the Edit/Preview switcher is a toggle group, not a
 *         tab set that never swaps a panel, and mapped errors are announced
 *   S-02  text and structural-border contrast measured against WCAG minimums
 */
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const root = new URL('../../../../../', import.meta.url).pathname;
const original = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window, act: globalThis.IS_REACT_ACT_ENVIRONMENT };

const adminFull = {
  adminId: 'admin', accountLevel: 'ADMIN', status: 'ACTIVE',
  permissions: ['marketing.view', 'marketing.manage', 'media.view', 'media.upload', 'media.assign', 'media.delete'],
};

const T = (slotKey) => ({ slotKey, contentType: 'TEXT', capacity: 1 });
const M = (slotKey) => ({ slotKey, contentType: 'MEDIA', capacity: 1 });
const REGISTRY = {
  trust: [T('delivery'), T('authentic'), T('secure'), T('returns'), T('help')],
  sarees: [T('intro'), M('lookbook-1'), M('lookbook-2'), M('lookbook-3')],
  newsletter: [T('intro'), T('fine-print'), M('campaign')],
};
const TITLES = { trust: 'Trust strip', sarees: 'Saree lookbook', newsletter: 'Newsletter' };
const image = { id: 'asset-1', objectKey: 'marketing/probe.avif', url: '/api/v1/media/objects/marketing/probe.avif', mimeType: 'image/avif', status: 'uploaded' };
const heroRow = {
  id: 'hero-1', placement: 'HOME_HERO', objectKey: 'hero/one.avif', mediaAssetId: image.id,
  url: image.url, title: 'Banarasi', subtitle: 'Silk', ctaLabel: '', ctaHref: '',
  sortOrder: 0, isActive: true,
};

let vite, Page, Hero, EntryRow, copyFields, Contrast;
let sections, requests, renderers, fail, Context;
const text = (node) => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
const flush = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const writes = () => requests.filter((request) => request.method !== 'GET');
const readsOf = (key) => requests.filter((request) => request.method === 'GET' && request.path.endsWith(`/homepage/sections/${key}`));
const buttonNamed = (tree, label) => tree.root.findAllByType('button').find((b) => text(b) === label);
const click = async (tree, label) => {
  const button = buttonNamed(tree, label);
  assert.ok(button, `button exists: ${label}`);
  assert.notEqual(button.props.disabled, true, `button enabled: ${label}`);
  await act(async () => { await button.props.onClick(); });
  await flush(); await flush();
  return button;
};
const fieldLabel = (l, field) => text(l).trim().toLowerCase() === String(field).toLowerCase();
const controlFor = (tree, field) => {
  const label = tree.root.findAllByType('label').find((l) => fieldLabel(l, field));
  assert.ok(label, `field exists: ${field}`);
  return label.findAllByType('input')[0] ?? label.findAllByType('textarea')[0];
};
const fill = (tree, field, value) => act(async () => { controlFor(tree, field).props.onChange({ target: { value } }); });
const submit = async (tree) => { await act(async () => { tree.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); await flush(); await flush(); };
const navButtons = (tree) => tree.root.findAllByType('button').filter((b) => b.props['aria-current'] !== undefined || /^0\d|^1[0-2]/.test(text(b).trim()));

const stateOf = (sec) => !sec.configured ? 'missing' : !sec.isActive ? 'inactive' : sec.items.some((r) => r.isActive) ? 'ready' : 'empty';
const sectionState = (key) => sections[key] ?? (sections[key] = {
  key, configured: false, state: 'missing', source: 'legacy', items: [], revision: 0, isActive: false, allowedSlots: REGISTRY[key] ?? [],
});

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
      React.createElement(Context, { value: { admin, isSuperAdmin: true, isLoading: false } },
        React.createElement(Page, null))));
  });
  renderers.push(tree); await flush(); await flush();
  return tree;
};

before(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vite = await createServer({ root, appType: 'custom', logLevel: 'error', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] } });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  Page = (await load('pages/admin/media/AdminMarketingMedia.jsx')).default;
  Context = (await load('context/AdminAuthContext.jsx')).default;
  Hero = (await load('components/admin/BackendHomeHeroPanel.jsx')).default;
  EntryRow = (await load('components/admin/homepage/EntryRow.jsx')).default;
  copyFields = await load('components/admin/homepage/copyFields.jsx');
  Contrast = await load('services/homepage/contrast.js').catch(() => null);
});
after(async () => {
  await vite?.close();
  for (const [key, value] of Object.entries({ fetch: original.fetch, localStorage: original.localStorage, window: original.window, IS_REACT_ACT_ENVIRONMENT: original.act })) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
});

beforeEach(() => {
  sections = {}; requests = []; renderers = []; fail = {};
  const data = new Map([['pf_admin_access_token', 'admin-token']]);
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  globalThis.window = { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, confirm: () => true };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), 'https://test.invalid');
    const method = options.method ?? 'GET';
    requests.push({ path: url.pathname, method });
    let body = { ok: true };
    let status = 200;
    if (/\/homepage\/sections$/.test(url.pathname) && method === 'GET') {
      body = {
        ok: true, version: 1, status: 'ready',
        sections: [{ key: 'hero', state: 'delegated', source: 'heroSlides' },
          ...Object.keys(REGISTRY).map((key) => ({ ...sectionState(key), allowedSlots: REGISTRY[key] }))],
      };
    } else if (/\/homepage\/sections\/[^/]+$/.test(url.pathname) && method === 'GET') {
      const key = decodeURIComponent(url.pathname.split('/').at(-1));
      if (!REGISTRY[key]) { status = 422; body = { detail: 'Unknown or delegated homepage section.' }; }
      else body = { ok: true, section: sectionState(key) };
    } else if (/\/homepage\/hero\/items$/.test(url.pathname) && method === 'GET') {
      body = { ok: true, items: [heroRow] };
    } else if (/\/media-assets$/.test(url.pathname)) {
      body = { ok: true, items: [image], total: 1 };
    } else if (url.pathname === '/api/v1/admin/marketing/media' || url.pathname === '/api/v1/employee/homepage/hero/items') {
      body = { ok: true, items: [heroRow], total: 1 };
    } else if (url.pathname === '/api/v1/home') {
      body = { heroSlides: [], homepageContent: { version: 1, status: 'ready', sections: [] } };
    } else if (['/api/v1/categories', '/api/v1/collections', '/api/v1/products', '/api/v1/offers'].includes(url.pathname)) {
      body = { items: [], total: 0 };
    } else if (/\/homepage\/sections\/[^/]+/.test(url.pathname)) {
      const key = decodeURIComponent(url.pathname.split('/').at(-2));
      const section = sectionState(key);
      section.configured = true; section.isActive = true; section.revision += 1;
      body = { ok: true, section };
    } else {
      body = { ok: true };
    }
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers({ 'content-type': 'application/json' }) };
  };
});
afterEach(async () => {
  for (const tree of renderers) await act(async () => { tree.unmount(); });
});

/* ── F-17 · the rail ─────────────────────────────────────────────────────── */

test('F-17 · the twelve sections stay in one DOM-ordered strip that scrolls below `lg`', async () => {
  const tree = await mountPage();
  const nav = tree.root.findAll((node) => node.type === 'nav' && node.props['aria-label'] === 'Homepage sections')[0];
  assert.ok(nav, 'the sections rail exists');
  const classes = nav.props.className;
  for (const token of ['flex', 'overflow-x-auto', 'snap-x', 'min-w-0']) assert.match(classes, new RegExp(token), `mobile strip token: ${token}`);
  /* The navigator is a horizontal topbar at every width: it is no longer a
     sticky vertical sidebar beside the workspace. */
  for (const token of ['lg:sticky', 'lg:space-y-1', 'lg:block']) assert.doesNotMatch(classes, new RegExp(token), `no vertical sidebar token: ${token}`);
  const buttons = nav.findAllByType('button');
  assert.equal(buttons.length, 12, 'all twelve sections remain present and reachable');
  assert.match(text(buttons[0]), /Home hero/, 'the twelve sections keep their shipped order');
  assert.match(text(buttons[11]), /Trust strip/);
  /* Every chip keeps its number, its title and its status line. */
  assert.match(text(buttons[1]), /02/, 'the section number is still printed');
  assert.match(text(buttons[1]), /Category collage/);
  assert.ok(buttons.every((b) => String(b.props.className).includes('shrink-0')), 'chips do not squash each other');
  assert.ok(buttons.every((b) => String(b.props.className).includes('snap-start')), 'every topbar chip snaps into view');
});

/* ── F-20 · one content build, not two ───────────────────────────────────── */

test('F-20 · the section list seeds the editor, so selecting a section sends no second full read', async () => {
  sections.trust = {
    key: 'trust', configured: true, state: 'ready', source: 'backend', revision: 7, isActive: true,
    items: [{ id: 'seeded-1', contentType: 'TEXT', slotKey: 'delivery', isActive: true, title: 'SEEDED FROM THE LIST', text: { title: 'SEEDED FROM THE LIST' } }],
    allowedSlots: REGISTRY.trust,
  };
  const tree = await mountPage();
  assert.equal(requests.filter((r) => r.path.endsWith('/homepage/sections')).length, 1, 'the list is read once');
  await navTo(tree, 'Trust strip');
  assert.equal(readsOf('trust').length, 0, 'no duplicate GET for a section the list already carried');
  assert.match(text(tree.root), /SEEDED FROM THE LIST/, 'the seeded snapshot is what the editor renders');
  assert.match(text(tree.root), /Checklist|revision|entry/i);
});

test('F-20 · an explicit reload still reads the section, so the authoritative refresh is intact', async () => {
  sections.trust = {
    key: 'trust', configured: true, state: 'ready', source: 'backend', revision: 2, isActive: true,
    items: [], allowedSlots: REGISTRY.trust,
  };
  const tree = await mountPage();
  await navTo(tree, 'Trust strip');
  assert.equal(readsOf('trust').length, 0);
  await click(tree, 'Reload section and public content');
  assert.equal(readsOf('trust').length, 1, 'the reload path still goes to the wire');
});

test('F-20 · a section the list does not carry falls back to its own read, unchanged', async () => {
  const tree = await mountPage();
  await navTo(tree, 'Newsletter');
  /* The list carries newsletter too, so this asserts the seeded path stays the
     only one: nothing regressed into a second read for a seeded section. */
  assert.equal(readsOf('newsletter').length, 0);
  assert.match(text(tree.root), /Content only\. No verified subscription endpoint is connected/);
});

/* ── F-13 · the hero CTA pair ────────────────────────────────────────────── */

const mountHero = async () => {
  let tree;
  await act(async () => {
    tree = create(React.createElement(MemoryRouter, null,
      React.createElement(Context.Provider, { value: { admin: adminFull, isSuperAdmin: true, isLoading: false } },
        React.createElement(Hero, { placement: 'HOME_HERO', contentType: 'TEXT' }))));
  });
  renderers.push(tree); await flush(); await flush();
  return tree;
};
const navTo = async (tree, title) => {
  const nav = tree.root.findAll((node) => node.type === 'nav' && node.props['aria-label'] === 'Homepage sections')[0];
  const button = nav.findAllByType('button').find((b) => text(b).includes(title));
  assert.ok(button, `nav exists: ${title}`);
  await act(async () => { button.props.onClick(); });
  await flush(); await flush();
};

test('F-13 · a hero CTA label without a destination is refused before any write', async () => {
  const tree = await mountHero();
  await click(tree, 'Edit text');
  await fill(tree, 'Button label', 'Shop now');
  await submit(tree);
  assert.equal(writes().length, 0, 'nothing was sent');
  assert.match(text(tree.root), /must be supplied together/);
  assert.equal(controlFor(tree, 'Button label').props['aria-invalid'], true);
  assert.equal(controlFor(tree, 'CTA destination').props['aria-invalid'], true);
  const alerts = tree.root.findAllByProps({ role: 'alert' });
  assert.equal(alerts.length, 1, 'the refusal is announced once');
  assert.equal(alerts[0].props.id, 'copy-error-summary');
});

test('F-13 · the destination alone is refused too, and correcting it clears the message', async () => {
  const tree = await mountHero();
  await click(tree, 'Edit text');
  await fill(tree, 'CTA destination', '/sarees');
  await submit(tree);
  assert.equal(writes().length, 0);
  assert.match(text(tree.root), /must be supplied together/);
  await fill(tree, 'Button label', 'Shop sarees');
  assert.doesNotMatch(text(tree.root), /must be supplied together/, 'the corrected field stops claiming to be wrong');
  await submit(tree);
  assert.equal(writes().length, 1, 'a valid pair is saved');
});

test('F-13 · an unsafe destination is refused by the same client rule the section editor uses', async () => {
  const tree = await mountHero();
  await click(tree, 'Edit text');
  await fill(tree, 'Button label', 'Visit');
  await fill(tree, 'CTA destination', 'https://example.com/sarees');
  await submit(tree);
  assert.equal(writes().length, 0);
  assert.match(text(tree.root), /single-slash site-relative link/);
});

/* ── F-18 · Retry without media.view (coverage, not a browser claim) ─────── */

test('F-18 · a picker without media.view stays operable and sends no request at all', async () => {
  /* Batch 3 fixed the dead-end by disabling each control instead of the
     fieldset. This proves the other half at the service level: with
     marketing.view but NO media.view, the library read is refused by the local
     grant guard BEFORE any HTTP, and pressing the still-enabled Retry repeats
     that refusal — it does not become a request. */
  const marketingOnly = { adminId: 'nomedia', accountLevel: 'ADMIN', status: 'ACTIVE', permissions: ['marketing.view', 'marketing.manage'] };
  const Picker = (await vite.ssrLoadModule('/src/components/admin/homepage/RegisteredMediaPicker.jsx')).default;
  const tree = await mount(Picker, {
    admin: marketingOnly, value: null, onChange: () => {}, disabled: true,
    disabledReason: 'Browsing the registered library requires media.view. Ask an administrator; Retry stays available.',
  });
  assert.equal(requests.length, 0, 'the guarded read never reached the network');
  assert.match(text(tree.root), /requires media.view/);
  const retry = buttonNamed(tree, 'Retry media library');
  assert.ok(retry, 'Retry is reachable');
  assert.notEqual(retry.props.disabled, true, 'Retry is operable');
  await click(tree, 'Retry media library');
  assert.equal(requests.length, 0, 'Retry re-runs the same local refusal, not a request');
});

/* ── F-19 · a vanished plate ─────────────────────────────────────────────── */

test('F-19 · a plate that fails to load is removed instead of painting a broken image', async () => {
  const tree = await mount(EntryRow, { thumbnail: '/api/v1/media/objects/hero/gone.avif', thumbnailAlt: 'gone', title: 'Kept title' });
  const img = tree.root.findByType('img');
  const style = {};
  await act(async () => { img.props.onError({ currentTarget: { style } }); });
  assert.equal(style.display, 'none', 'the broken plate is hidden');
  assert.match(text(tree.root), /Kept title/, 'the row keeps its text');
});

test('F-19 · the media library states what deleting an asset costs (copy is the fix here)', () => {
  const page = readFileSync(`${root}src/pages/admin/media/AdminMediaLibrary.jsx`, 'utf8');
  assert.match(page, /deletion is permanent and is refused while a/i);
  assert.match(page, /Removing a homepage entry never deletes its\s+artwork/i);
  assert.match(page, /homepage entries that used it are removed with it/i);
  assert.match(page, /hero\s+placement rows keep their stored object key/i);
  assert.match(page, /role="note"/);
});

/* ── accessibility ───────────────────────────────────────────────────────── */

test('F-07 · the Edit/Preview switcher is a named toggle group, not a tab set without a panel', async () => {
  const tree = await mountHero();
  assert.equal(tree.root.findAllByProps({ role: 'tablist' }).length, 0, 'no tablist that never swaps a panel');
  assert.equal(tree.root.findAllByProps({ role: 'tab' }).length, 0);
  const group = tree.root.findAllByProps({ role: 'group' }).find((node) => node.props['aria-label'] === 'Hero entry view');
  assert.ok(group, 'the switcher is a named group');
  const edit = buttonNamed(tree, 'Edit');
  assert.equal(edit.props['aria-pressed'], true, 'the current view states itself');
  assert.equal(buttonNamed(tree, 'Preview').props['aria-pressed'], false);
  await click(tree, 'Preview');
  assert.equal(buttonNamed(tree, 'Preview').props['aria-pressed'], true);
});

test('F-07 · a mapped failure is announced once through the shared live region', async () => {
  const tree = await mount(copyFields.ErrorSummary, { errors: { ctaLabel: 'Pair required.', ctaHref: 'Pair required.' } });
  const alerts = tree.root.findAllByProps({ role: 'alert' });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].props.id, 'copy-error-summary');
  assert.equal((text(tree.root).match(/Pair required\./g) || []).length, 1, 'the duplicated field message is announced once');
  const empty = await mount(copyFields.ErrorSummary, { errors: {} });
  assert.equal(empty.root.findAllByProps({ role: 'alert' }).length, 0);
});

/* ── contrast (S-02 / F-25) ──────────────────────────────────────────────── */

const HEX = (value) => value.replace('#', '').match(/../g).map((pair) => parseInt(pair, 16));
const relativeLuminance = (rgb) => {
  const channels = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (foreground, background) => {
  const [light, dark] = [relativeLuminance(HEX(foreground)), relativeLuminance(HEX(background))].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};

test('S-02 · text and structural-border tokens meet the WCAG minimums on every panel background', () => {
  const css = readFileSync(`${root}src/index.css`, 'utf8');
  const token = (name) => css.match(new RegExp(`--color-pf-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
  const ivory = token('ivory');
  const card = token('card');
  const cardSoft = token('card-soft');
  const muted = token('muted');
  const error = token('error');
  const burgundy = token('burgundy');
  const borderStrong = token('border-strong');
  for (const background of [ivory, card, cardSoft]) {
    assert.ok(background, 'background tokens are readable');
    assert.ok(contrast(muted, background) >= 4.5, `muted text on ${background} ≥ 4.5:1 (got ${contrast(muted, background).toFixed(2)})`);
    assert.ok(contrast(error, background) >= 4.5, `error text on ${background} ≥ 4.5:1 (got ${contrast(error, background).toFixed(2)})`);
    assert.ok(contrast(burgundy, background) >= 4.5, `primary text on ${background} ≥ 4.5:1`);
  }
  /* Non-text contrast (WCAG 1.4.11): a structural field boundary must reach 3:1. */
  for (const background of [ivory, card]) {
    assert.ok(contrast(borderStrong, background) >= 3, `pf-border-strong on ${background} ≥ 3:1 (got ${contrast(borderStrong, background).toFixed(2)})`);
  }
});
