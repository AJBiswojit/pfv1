import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { create, act } from 'react-test-renderer';
import { parseCssRules } from '../../../../scripts/customer-port.js';
import { createServer } from 'vite';
import { isAccountAreaPath } from '../utils/accountLayout.js';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const storage = new Map();
const noop = () => {};
const storageApi = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
let vite;
let renderLayout;
let renderFrame;
let useScrollReset;
const previousWindow = globalThis.window;

before(async () => {
  globalThis.window = {
    localStorage: storageApi,
    sessionStorage: storageApi,
    location: { search: '', pathname: '/', href: 'http://localhost/' },
    dispatchEvent: noop,
    addEventListener: noop,
    removeEventListener: noop,
  };
  vite = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  const load = (path) => vite.ssrLoadModule(`/src/${path}`);
  const [
    { default: Layout },
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    { UIProvider },
    { ShopProvider },
    { default: AccountFrame },
    { default: scrollReset },
  ] = await Promise.all([
    load('components/customer/components/layout/Layout.jsx'),
    load('context/AuthContext.jsx'),
    load('context/AccountContext.jsx'),
    load('context/InventoryContext.jsx'),
    load('context/ShoppingContext.jsx'),
    load('context/OrderContext.jsx'),
    load('context/CheckoutContext.jsx'),
    load('components/customer/state/UIContext.jsx'),
    load('components/customer/state/ShopContext.jsx'),
    load('components/customer/pages/account/AccountFrame.jsx'),
    load('components/customer/hooks/useAccountScrollReset.js'),
  ]);
  useScrollReset = scrollReset;
  const render = (path, content) => {
    let tree = React.createElement(Layout, null, content);
    for (const Provider of [ShopProvider, UIProvider, CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
      tree = React.createElement(Provider, null, tree);
    }
    return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, tree));
  };
  renderLayout = (path) => render(path, React.createElement('p', null, 'Page content'));
  renderFrame = (path) => render(path, React.createElement(AccountFrame, { title: 'Overview' }, React.createElement('p', null, 'Page content')));
});

after(async () => {
  await vite?.close();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

const ACCOUNT_PATHS = [
  '/account', '/account/', '/account/profile', '/account/profile?tab=addresses',
  '/account/addresses', '/account/preferences', '/account/orders', '/account/wishlist',
  '/account/orders/real-id', '/account/orders/real-id/track', '/account/orders/real-id/return',
  '/account/ai', '/account/ai?tab=mirror', '/account/ai-mirror', '/account/ai-shopping',
  '/account/settings', '/account/settings?tab=security', '/account/security',
  '/account/instagram-rewards', '/account/future/section', '/Account/Profile/',
];
const OTHER_PATHS = [
  '/', '/shop', '/shop?sort=new', '/explore', '/product/real-id', '/category/sarees',
  '/collections/festive', '/search?q=silk', '/signin', '/signup', '/forgot-password',
  '/reset-password', '/track', '/return', '/track/real-id', '/return/real-id',
  '/cart', '/about', '/contact', '/privacy', '/terms', '/accounts', '/accounting',
];

test('account chrome classifies the entire account prefix, not a duplicate route list', () => {
  for (const path of ACCOUNT_PATHS) {
    assert.equal(isAccountAreaPath(path.split('?')[0]), true, path);
  }
  for (const path of [...OTHER_PATHS, '/admin/account', '/employee/account']) {
    assert.equal(isAccountAreaPath(path.split('?')[0]), false, path);
  }
  assert.equal(isAccountAreaPath(null), false);
});

test('account pages do not render a footer, including wishlist, guest orders and future descendants', () => {
  for (const path of ACCOUNT_PATHS) {
    const markup = renderLayout(path);
    assert.doesNotMatch(markup, /<footer\b|class="footer"/, path);
    assert.match(markup, /<main id="main" tabindex="-1" aria-label="Account workspace">[\s\S]*Page content/, `${path}: page content remains`);
    assert.match(markup, /class="skip-link"/, `${path}: skip link remains`);
  }
});

test('all other full-shell customer pages retain exactly one footer, including auth and guest track/return', () => {
  for (const path of OTHER_PATHS) {
    const markup = renderLayout(path);
    assert.equal((markup.match(/<footer class="footer"/g) ?? []).length, 1, path);
    assert.ok(markup.indexOf('</main>') < markup.indexOf('<footer'), `${path}: footer follows content`);
  }
});

const accountCss = () => parseCssRules(readFileSync(new URL('../customer.account.css', import.meta.url), 'utf8'));
const rule = (selector, condition = '') => accountCss().filter((entry) => entry.selector.includes(selector) && entry.conditions.join(' ').includes(condition));
const hasDeclaration = (rules, declaration) => rules.some((entry) => entry.declarations.includes(declaration));

test('desktop account chrome uses a viewport flex shell with a natural-height header and a min-zero workspace', () => {
  const markup = renderFrame('/account');
  assert.match(markup, /class="pf-account-app"/);
  assert.match(markup, /class="pf-account-app__header">[\s\S]*class="announce"[\s\S]*<header class="header"/);
  assert.match(markup, /id="pf-account-content" class="pf-account__content" role="region" aria-label="Account content" tabindex="0"/);
  const desktop = '(min-width: 1024px)';
  for (const declaration of ['display: flex', 'flex-direction: column', 'height: 100dvh', 'overflow: hidden']) {
    assert.ok(hasDeclaration(rule('.pf-account-app', desktop), declaration), declaration);
  }
  assert.ok(hasDeclaration(rule('.pf-account-app__header'), 'flex: none'));
  for (const declaration of ['flex: 1', 'min-height: 0', 'overflow: hidden']) {
    assert.ok(hasDeclaration(rule('.pf-account-app > main', desktop), declaration), declaration);
  }
  assert.doesNotMatch(readFileSync(new URL('../customer.account.css', import.meta.url), 'utf8').split('/* ── account application shell')[1], /var\(--header-h\)|calc\(100[^)]*-.*header/);
});

test('only account content scrolls on desktop, with contained overscroll and stable themed thin scrollbars', () => {
  const desktop = '(min-width: 1024px)';
  for (const declaration of ['overflow-y: auto', 'overscroll-behavior: contain', 'scrollbar-gutter: stable', 'scrollbar-width: thin', 'scrollbar-color: var(--c-muted) var(--c-paper)']) {
    assert.ok(hasDeclaration(rule('.pf-account__content', desktop), declaration), declaration);
  }
  const sidebarRules = accountCss().filter((entry) => /pf-account__(?:side|drawer|nav)\b/.test(entry.selector) && !entry.conditions.some((condition) => condition.includes('max-width: 1023px')));
  for (const entry of sidebarRules) assert.doesNotMatch(entry.declarations, /overflow(?:-y)?:\s*(auto|scroll)/, entry.selector);
  assert.ok(hasDeclaration(rule('.pf-account__side-foot'), 'margin-top: auto'));
  assert.ok(rule('.pf-account__nav-link', 'max-height: 760px').length);
  assert.ok(rule('.pf-account__nav-link', 'max-height: 620px').length);
  assert.ok(hasDeclaration(rule('.pf-account__user-email', 'max-height: 760px'), 'display: none'));
});

test('mobile account content stays in document flow with a sticky section bar and the accessible drawer', () => {
  const mobile = '(max-width: 1023px)';
  assert.ok(hasDeclaration(rule('.pf-account__content', mobile), 'overflow: visible'));
  assert.ok(hasDeclaration(rule('.pf-account__layout', mobile), 'display: block'));
  assert.ok(hasDeclaration(rule('.pf-account__side', mobile), 'position: sticky'));
  assert.ok(hasDeclaration(rule('.pf-account__side', mobile), 'top: 0'));
  assert.ok(hasDeclaration(rule('.pf-account__drawer', mobile), 'position: fixed'));
  const markup = renderFrame('/account/settings');
  assert.match(markup, /pf-account__current-section">Settings</);
  assert.match(markup, /aria-controls="pf-account-drawer"/);
  assert.match(markup, /class="pf-account__drawer-close" aria-label="Close account menu"/);
});

test('route and tab changes reset the content scroller without stealing focus, and history policy is restored', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window.history = { scrollRestoration: 'auto' };
  const node = { scrollTop: 140, scrollLeft: 12 };
  let navigate;
  function Probe() {
    navigate = useNavigate();
    const ref = useScrollReset({ manageRestoration: true });
    return React.createElement('div', { ref });
  }
  let renderer;
  try {
    await act(async () => {
      renderer = create(React.createElement(MemoryRouter, { initialEntries: ['/account/profile'] }, React.createElement(Probe)), { createNodeMock: () => node });
    });
    assert.equal(node.scrollTop, 0);
    assert.equal(node.scrollLeft, 0);
    assert.equal(window.history.scrollRestoration, 'manual');
    node.scrollTop = 260;
    await act(async () => navigate('/account/profile?tab=addresses'));
    assert.equal(node.scrollTop, 0, 'query tab navigation must reset, even when pathname is unchanged');
    node.scrollTop = 260;
    await act(async () => navigate('/account/profile?tab=addresses&filter=saved'));
    assert.equal(node.scrollTop, 260, 'unrelated query state must not jump the content');
    await act(async () => navigate('/account/orders'));
    assert.equal(node.scrollTop, 0, 'destination navigation must reset');
    node.scrollTop = 180;
    await act(async () => navigate(-1));
    assert.equal(node.scrollTop, 0, 'back navigation must use the same reset policy');
  } finally {
    await act(async () => renderer?.unmount());
    assert.equal(window.history.scrollRestoration, 'auto');
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});

test('the workspace removes the centered width cap and uses bounded gutters plus a 256px fluid grid', () => {
  const shell = rule('.pf-account').filter((entry) => entry.selector === '.pf-root .pf-account' && entry.conditions.length === 0);
  assert.ok(hasDeclaration(shell, 'width: 100%'));
  assert.ok(hasDeclaration(shell, 'max-width: none'));
  assert.ok(hasDeclaration(shell, 'padding: 16px clamp(24px, 2vw, 32px)'));
  assert.ok(hasDeclaration(rule('.pf-account__layout'), 'grid-template-columns: 256px minmax(0, 1fr)'));
  assert.ok(hasDeclaration(rule('.pf-account', 'max-width: 1023px'), 'padding: 0 clamp(16px, 2vw, 20px) 24px'));
  assert.ok(hasDeclaration(rule('.pf-account__body .pf-form'), 'max-width: 760px'), 'only readable forms need a bounded measure');
});

test('stats, AI, detail and commerce cards fill the fluid width using safe auto-fit grids', () => {
  for (const selector of ['.account__tiles', '.pf-account__ai', '.pf-account__cards', '.pf-account__offers', '.pf-account__addresses', '.pf-account__returns', '.pf-account__collections', '.pf-account__body .grid-4']) {
    const grids = rule(selector).filter((entry) => entry.declarations.includes('grid-template-columns'));
    assert.ok(grids.length > 0, selector);
    for (const entry of grids) assert.match(entry.declarations, /repeat\(auto-fit, minmax\(min\(100%, \d+px\), 1fr\)\)/, selector);
  }
  const orders = parseCssRules(readFileSync(new URL('../customer.orders.css', import.meta.url), 'utf8'));
  assert.ok(hasDeclaration(orders.filter((entry) => entry.selector === '.pf-root .pf-account__order-list'), 'grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr))'));
});
