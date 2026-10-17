import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
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
  ]);
  renderLayout = (path) => {
    let tree = React.createElement(Layout, null, React.createElement('p', null, 'Page content'));
    for (const Provider of [ShopProvider, UIProvider, CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) {
      tree = React.createElement(Provider, null, tree);
    }
    return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [path] }, tree));
  };
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
    assert.match(markup, /<main id="main">[\s\S]*Page content/, `${path}: page content remains`);
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
