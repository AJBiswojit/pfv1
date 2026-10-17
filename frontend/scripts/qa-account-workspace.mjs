/**
 * Account workspace browser QA — no seeded records, auth fakes or API stubs.
 * Uses the real providers/pages in an unshipped component harness, plus checks
 * against the actual application for guards, returnTo and guest/footer routes.
 * The harness deliberately renders protected leaves directly for geometry ONLY;
 * it is generated under ignored scripts/.tmp and is never part of a build.
 *
 * Start `npm run dev`, then run this script. Optional browser-only tooling:
 * npm install --prefix scripts/.tmp/account-qa/browser --no-save --no-package-lock \
 *   playwright-core @sparticuz/chromium @fontsource/cormorant-garamond @fontsource-variable/manrope
 * The font packages supply the SAME existing families locally for network-limited
 * QA; no production font, palette, dependency or lockfile is changed.
 * BASE_URL defaults to http://localhost:5173; CHROMIUM_PATH may select a system browser.
 * Results/screenshots stay in ignored scripts/.tmp/account-qa/results.
 * Zoom cases test the CSS viewport equivalent, not a native browser zoom control.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const QA = join(ROOT, 'scripts/.tmp/account-qa');
const TOOLS = join(QA, 'browser/node_modules');
const OUTPUT = join(QA, 'results');
const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const importTool = (path) => import(pathToFileURL(join(TOOLS, path)).href);
const { chromium: playwright } = await importTool('playwright-core/index.mjs');
let executablePath = process.env.CHROMIUM_PATH;
let args = ['--no-sandbox'];
if (!executablePath) {
  const { default: chromium } = await importTool('@sparticuz/chromium/build/index.js');
  // The serverless package includes NSS/NSPR; extract its existing bundled libs
  // when running outside Lambda. No system package installation is required.
  const libs = join(QA, 'chromium-libs');
  if (!existsSync(join(libs, 'lib/libnspr4.so'))) {
    await mkdir(libs, { recursive: true });
    const archive = brotliDecompressSync(await readFile(join(TOOLS, '@sparticuz/chromium/bin/al2023.tar.br')));
    await writeFile(join(libs, 'al2023.tar'), archive);
    execFileSync('tar', ['-xf', join(libs, 'al2023.tar'), '-C', libs]);
  }
  process.env.LD_LIBRARY_PATH = [join(libs, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  executablePath = await chromium.executablePath();
  args = chromium.args;
}
await mkdir(OUTPUT, { recursive: true });

const HARNESS = String.raw`// Local, unshipped component QA. Real providers, no seeded records or API stubs.
// The harness renders account leaves directly; production guards are untouched.
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { AuthProvider } from '/src/context/AuthContext.jsx';
import { AccountProvider } from '/src/context/AccountContext.jsx';
import { InventoryProvider } from '/src/context/InventoryContext.jsx';
import { ShoppingProvider } from '/src/context/ShoppingContext.jsx';
import { OrderProvider } from '/src/context/OrderContext.jsx';
import { CheckoutProvider } from '/src/context/CheckoutContext.jsx';
import { UIProvider } from '/src/components/customer/state/UIContext.jsx';
import { ShopProvider } from '/src/components/customer/state/ShopContext.jsx';
import Layout from '/src/components/customer/components/layout/Layout.jsx';
import Overview from '/src/components/customer/pages/account/Overview.jsx';
import Personal from '/src/components/customer/pages/account/Personal.jsx';
import Settings from '/src/components/customer/pages/account/SettingsArea.jsx';
import AiAtelier from '/src/components/customer/pages/account/AiAtelier.jsx';
import Orders from '/src/components/customer/pages/account/Orders.jsx';
import OrderDetail from '/src/components/customer/pages/account/OrderDetail.jsx';
import OrderTracking from '/src/components/customer/pages/account/OrderTracking.jsx';
import OrderReturn from '/src/components/customer/pages/account/OrderReturn.jsx';
import Rewards from '/src/components/customer/pages/account/InstagramRewards.jsx';
import Wishlist from '/src/components/customer/pages/Wishlist.jsx';
import SignIn from '/src/components/customer/pages/SignIn.jsx';
import SignUp from '/src/components/customer/pages/SignUp.jsx';
import Shop from '/src/components/customer/pages/Shop.jsx';
import '/src/index.css';
import '/src/components/customer/customer.css';
import '/src/components/customer/customer.host.css';
import '/src/components/customer/customer.account.css';
import '/src/components/customer/customer.orders.css';
import '/src/components/customer/customer.checkout.css';
import '/src/components/customer/customer.ai.css';
import '/src/components/customer/customer.auth.css';
import '/src/components/customer/customer.wishlist.css';
import '/src/components/customer/customer.listing.css';
// The same two existing storefront families, local for restricted-network QA.
import './browser/node_modules/@fontsource/cormorant-garamond/400.css';
import './browser/node_modules/@fontsource/cormorant-garamond/500.css';
import './browser/node_modules/@fontsource/cormorant-garamond/600.css';
import './browser/node_modules/@fontsource/cormorant-garamond/400-italic.css';
import './browser/node_modules/@fontsource/cormorant-garamond/500-italic.css';
import './browser/node_modules/@fontsource-variable/manrope/index.css';
function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { window.accountQa = { navigate, location }; }, [navigate, location]);
  return null;
}
function Content() {
  return <><Navigation /><Routes>
    <Route element={<Layout />}>
      <Route path="/account" element={<Overview />} />
      <Route path="/account/profile" element={<Personal />} />
      <Route path="/account/settings" element={<Settings />} />
      <Route path="/account/ai" element={<AiAtelier />} />
      <Route path="/account/orders" element={<Orders />} />
      <Route path="/account/orders/:orderId" element={<OrderDetail />} />
      <Route path="/account/orders/:orderId/track" element={<OrderTracking />} />
      <Route path="/account/orders/:orderId/return" element={<OrderReturn />} />
      <Route path="/account/instagram-rewards" element={<Rewards />} />
      <Route path="/account/wishlist" element={<Wishlist />} />
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/shop" element={<Shop mode="shop" />} />
      <Route path="*" element={<Shop mode="navigation" />} />
    </Route>
  </Routes></>;
}
let tree = <Content />;
for (const Provider of [ShopProvider, UIProvider, CheckoutProvider, OrderProvider, ShoppingProvider, InventoryProvider, AccountProvider, AuthProvider]) tree = <Provider>{tree}</Provider>;
const route = new URLSearchParams(window.location.search).get('route') ?? '/account';
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[route]}><MotionConfig reducedMotion="always"><div className="min-h-screen flex flex-col pf-shell__surface"><div className="pf-root">{tree}</div></div></MotionConfig></MemoryRouter>);
`;
await writeFile(join(QA, 'harness.jsx'), HARNESS);
await writeFile(join(QA, 'harness.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="./harness.jsx"></script></body></html>');

const checks = [];
const measurements = [];
const check = (name, pass, detail = null) => {
  checks.push({ name, pass: Boolean(pass), detail });
  if (!pass) console.error(`FAIL: ${name}`, detail ?? '');
};
const browser = await playwright.launch({ executablePath, args, headless: true });
const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1366, height: 700 } });
page.on('pageerror', (error) => check(`No browser exception: ${error.message}`, false));
const harnessUrl = (route = '/account') => `${BASE}/scripts/.tmp/account-qa/harness.html?route=${encodeURIComponent(route)}`;
const openHarness = async (route = '/account') => {
  await page.goto(harnessUrl(route), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.accountQa));
  await page.evaluate(() => document.fonts.ready);
};
const navigate = async (route) => {
  await page.evaluate((path) => window.accountQa.navigate(path), route);
  await page.waitForFunction((path) => window.accountQa.location.pathname + window.accountQa.location.search === path, route);
};
const measure = () => page.evaluate(() => {
  const rect = (selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const bounds = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, overflowY: style.overflowY, visibility: style.visibility };
  };
  return {
    viewport: { width: innerWidth, height: innerHeight },
    document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, y: scrollY },
    footer: document.querySelectorAll('footer.footer').length,
    shellBackground: getComputedStyle(document.querySelector('.pf-account-app')).backgroundColor,
    themeBackground: getComputedStyle(document.querySelector('.pf-root')).backgroundColor,
    shell: rect('.pf-account-app'), header: rect('.pf-account-app__header'),
    frame: rect('.pf-account'), content: rect('.pf-account__content'), drawer: rect('.pf-account__drawer'),
    bar: rect('.pf-account__mobile-bar'), main: rect('#main'),
    links: [...document.querySelectorAll('.pf-account__nav-link, .pf-account__side-foot .btn')].map((node) => {
      const bounds = node.getBoundingClientRect();
      return { text: node.textContent, top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right };
    }),
    ai: [...document.querySelectorAll('.pf-account__ai-entry')].map((node) => {
      const bounds = node.getBoundingClientRect();
      const button = node.querySelector('.btn').getBoundingClientRect();
      return { top: bounds.top, height: bounds.height, buttonTop: button.top };
    }),
  };
});
// Reserve only user-card geometry, without inventing a customer, email or avatar.
// It is removed before screenshots; real signed-in records require a live login.
const checkReservedUserCard = async (label) => {
  const fits = await page.evaluate(() => {
    const drawer = document.querySelector('.pf-account__drawer');
    const card = document.createElement('div');
    card.className = 'pf-account__user';
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML = '<span class="pf-account__user-avatar"></span><div class="pf-account__user-lines"><p class="pf-account__user-name" style="height:24px"></p><p class="pf-account__user-email" style="height:20px"></p></div>';
    drawer.prepend(card);
    const bounds = drawer.getBoundingClientRect();
    const nav = drawer.querySelector('.pf-account__nav').getBoundingClientRect();
    const foot = drawer.querySelector('.pf-account__side-foot').getBoundingClientRect();
    const result = { fits: drawer.scrollHeight <= drawer.clientHeight + 1 && nav.bottom <= foot.top && foot.bottom <= bounds.bottom && bounds.bottom <= innerHeight, scrollHeight: drawer.scrollHeight, clientHeight: drawer.clientHeight, navBottom: nav.bottom, footTop: foot.top };
    card.remove();
    return result;
  });
  check(`${label}: rail fits with reserved live-profile geometry`, fits.fits, fits);
};

try {
  const sizes = [
    [1920, 1080], [1440, 900], [1366, 768], [1024, 768], [834, 1112], [390, 844], [360, 800],
    [1920, 700], [1440, 700], [1366, 700], [1024, 700], [834, 700], [390, 700], [360, 700], [1280, 800],
    [1536, 560, '1920x700-at125-css-equivalent'], [1152, 560, '1440x700-at125-css-equivalent'],
    [1093, 560, '1366x700-at125-css-equivalent'], [1024, 560, '1280x700-at125-css-equivalent'], [360, 560],
  ];
  for (const [width, height, zoomLabel] of sizes) {
    const label = zoomLabel ?? `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await openHarness();
    const data = await measure();
    measurements.push({ label, ...data });
    check(`${label}: no horizontal overflow`, data.document.width <= width && data.content.scrollWidth <= data.content.clientWidth + 1, data);
    check(`${label}: no account footer`, data.footer === 0);
    // Capture the initial view before keyboard-scroll interaction begins.
    await page.screenshot({ path: join(OUTPUT, `overview-${label}.png`) });
    if (width >= 1024) {
      check(`${label}: existing canvas background retained`, data.shellBackground === data.themeBackground);
      check(`${label}: no document scrollbar`, data.document.height === height && data.document.y === 0, data.document);
      check(`${label}: 24–32px outer gutter and 256px rail`, data.frame.width === width && data.drawer.left >= 23.5 && data.drawer.left <= 32.5 && data.drawer.width === 256, data.drawer);
      check(`${label}: all seven destinations and both actions fit`, data.links.length === 9 && data.links.every((link) => link.top >= data.drawer.top && link.bottom <= data.drawer.bottom && link.right <= data.drawer.right), data.links);
      check(`${label}: rail is not a scroll container`, !['auto', 'scroll'].includes(data.drawer.overflowY) && data.drawer.scrollHeight <= data.drawer.clientHeight + 1, data.drawer);
      check(`${label}: only content overflows vertically`, data.content.overflowY === 'auto' && data.content.scrollHeight > data.content.clientHeight && data.main.overflowY === 'hidden', data.content);
      check(`${label}: paired AI heights and buttons align`, Math.abs(data.ai[0].height - data.ai[1].height) < 1 && Math.abs(data.ai[0].buttonTop - data.ai[1].buttonTop) < 1, data.ai);
      await checkReservedUserCard(label);
      const railTop = data.drawer.top;
      await page.locator('.pf-account__content').focus();
      await page.keyboard.press('PageDown');
      await page.waitForFunction(() => document.querySelector('.pf-account__content').scrollTop > 0);
      const after = await measure();
      check(`${label}: keyboard scroll leaves document and rail fixed`, after.document.y === 0 && after.drawer.top === railTop);
      await page.evaluate(() => { document.querySelector('.pf-account__content').scrollTop = 0; });
    } else {
      check(`${label}: 16–20px mobile gutters`, data.content.left >= 15.5 && data.content.left <= 20.5 && width - data.content.right >= 15.5 && width - data.content.right <= 20.5, data.content);
      check(`${label}: normal document flow, no nested content scroller`, data.content.overflowY === 'visible' && data.content.scrollHeight <= data.content.clientHeight + 1 && data.document.height > height, data.content);
      check(`${label}: closed drawer stays hidden with reduced motion`, data.drawer.visibility === 'hidden');
    }
    console.log(`Checked ${label}`);
  }

  await page.setViewportSize({ width: 1366, height: 700 });
  await openHarness();
  const before = await measure();
  const announcementHeight = await page.locator('.announce').evaluate((node) => node.getBoundingClientRect().height);
  await page.getByRole('button', { name: 'Dismiss announcement' }).click();
  const dismissed = await measure();
  check('Announcement dismissal reallocates natural header height', Math.abs(dismissed.header.height - before.header.height + announcementHeight) < 1 && Math.abs(dismissed.content.height - before.content.height - announcementHeight) < 1, { before, dismissed });
  await page.screenshot({ path: join(OUTPUT, 'announcement-dismissed-1366x700.png') });
  await page.evaluate(() => sessionStorage.removeItem('storefront:announce'));
  await openHarness('/account/profile?tab=style');
  await page.evaluate(() => { document.querySelector('.pf-account__content').scrollTop = 200; });
  await navigate('/account/profile?tab=addresses');
  check('Changing only ?tab resets content to top', await page.locator('.pf-account__content').evaluate((node) => node.scrollTop === 0));
  await page.evaluate(() => { document.querySelector('.pf-account__content').scrollTop = 200; });
  await navigate('/account');
  check('Changing destination resets content to top', await page.locator('.pf-account__content').evaluate((node) => node.scrollTop === 0));
  await page.keyboard.press('Tab');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  check('Skip link focuses the labelled content scroller', await page.evaluate(() => document.activeElement.id === 'pf-account-content'));
  await page.locator('.pf-account__content').hover();
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => document.querySelector('.pf-account__content').scrollTop > 0);
  check('Wheel scrolling does not move the document', await page.evaluate(() => scrollY === 0));
  await navigate('/shop');
  check('Leaving account restores native history policy', await page.evaluate(() => history.scrollRestoration === 'auto'));
  check('Shop still renders its footer', await page.locator('footer.footer').count() === 1);

  for (const [width, height] of [[834, 700], [390, 700], [360, 700], [360, 560]]) {
    await page.setViewportSize({ width, height });
    await openHarness();
    await page.evaluate(() => window.scrollTo(0, 450));
    const scrolled = await measure();
    check(`${width}px mobile: section bar sticks at top`, Math.abs(scrolled.bar.top) < 1 && scrolled.document.y > 0, scrolled.bar);
    await page.screenshot({ path: join(OUTPUT, `mobile-sticky-${width}x${height}.png`) });
    await page.getByRole('button', { name: 'Account menu', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Account menu' });
    await dialog.waitFor();
    await page.waitForFunction(() => document.querySelector('.pf-account__drawer').getBoundingClientRect().left >= -0.5);
    check(`${width}px mobile: drawer is modal and contains all seven destinations`, await dialog.getAttribute('aria-modal') === 'true' && await dialog.locator('.pf-account__nav-link').count() === 7);
    await checkReservedUserCard(`${width}px mobile drawer`);
    check(`${width}px mobile: drawer layers above site chrome`, await page.evaluate(() => Boolean(document.elementFromPoint(30, 20)?.closest('.pf-account__drawer'))));
    await page.waitForFunction(() => document.activeElement?.closest('.pf-account__drawer'));
    await page.keyboard.press('Shift+Tab');
    check(`${width}px mobile: focus is trapped in drawer`, await page.evaluate(() => Boolean(document.activeElement?.closest('.pf-account__drawer'))));
    await page.screenshot({ path: join(OUTPUT, `mobile-drawer-${width}x${height}.png`) });
    await page.keyboard.press('Escape');
    await page.locator('.pf-account__drawer').waitFor({ state: 'hidden' });
    check(`${width}px mobile: escape closes drawer and restores menu focus`, await page.getByRole('button', { name: 'Account menu', exact: true }).getAttribute('aria-expanded') === 'false' && await page.evaluate(() => document.activeElement?.classList.contains('pf-account__menu-btn')));
    await navigate('/account/profile?tab=style');
    await page.waitForFunction(() => document.querySelector('.pf-account__tabs-link[aria-current="page"]')?.textContent.includes('Style'));
    check(`${width}px mobile: active Personal tab reveals itself horizontally`, await page.locator('.pf-account__tabs').evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      const active = node.querySelector('[aria-current="page"]').getBoundingClientRect();
      return active.left >= bounds.left && active.right <= bounds.right;
    }));
    await page.screenshot({ path: join(OUTPUT, `personal-tabs-${width}x${height}.png`) });
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 700 });
  await openHarness();
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.pf-account__drawer').getBoundingClientRect().left >= -0.5);
  await page.getByRole('dialog', { name: 'Account menu' }).getByRole('button', { name: 'Close account menu', exact: true }).click();
  await page.locator('.pf-account__drawer').waitFor({ state: 'hidden' });
  check('Default motion: explicit drawer close control works', await page.getByRole('button', { name: 'Account menu', exact: true }).getAttribute('aria-expanded') === 'false');
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Personal', exact: true }).click();
  await page.locator('.pf-account__drawer').waitFor({ state: 'hidden' });
  check('Default motion: route navigation closes drawer', await page.getByRole('button', { name: 'Account menu', exact: true }).getAttribute('aria-expanded') === 'false' && await page.locator('.pf-account__current-section').textContent() === 'Personal');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Every route shape, including legacy/future descendants; never a footer.
  const accountRoutes = ['/account', '/account/profile', '/account/profile?tab=addresses', '/account/profile?tab=style', '/account/addresses', '/account/preferences', '/account/orders', '/account/wishlist', '/account/instagram-rewards', '/account/ai', '/account/ai?tab=mirror', '/account/ai-mirror', '/account/ai-shopping', '/account/settings', '/account/settings?tab=security', '/account/security', '/account/orders/no-record', '/account/orders/no-record/track', '/account/orders/no-record/return', '/account/future/section'];
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await openHarness();
    for (const route of accountRoutes) {
      await navigate(route);
      const data = await measure();
      check(`${width}px ${route}: no footer or horizontal overflow`, data.footer === 0 && data.document.width <= width && data.main.scrollWidth <= data.main.clientWidth + 1, data);
      if (width >= 1024) check(`${width}px ${route}: no document scrollbar`, data.document.height === 700, data.document);
      const log = page.locator('.pf-ai__log');
      if (await log.count()) check(`${width}px AI: conversation has no nested scroller`, await log.evaluate((node) => getComputedStyle(node).overflowY === 'visible' && node.scrollHeight <= node.clientHeight + 1));
    }
  }

  // Actual app, not the unguarded geometry harness: no credentials or backend.
  await page.setViewportSize({ width: 1366, height: 700 });
  for (const route of ['/account', '/account/profile?tab=addresses', '/account/ai?tab=mirror', '/account/settings?tab=security', '/account/orders']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/signin?returnTo=*');
    // Router history updates can precede the sign-in render under CPU load.
    await page.locator('.pf-auth form').waitFor({ state: 'attached' });
    await page.locator('footer.footer').waitFor({ state: 'attached' });
    check(`Actual app ${route}: guest guard and full returnTo preserved`, new URL(page.url()).searchParams.get('returnTo') === route);
    check(`Actual app ${route}: no private rail before login`, await page.locator('.pf-account__nav').count() === 0 && await page.locator('footer.footer').count() === 1);
  }
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 700 });
    for (const route of ['/signin', '/signup', '/shop', '/track', '/return', '/account/wishlist', '/account/orders/no-record/track', '/account/orders/no-record/return']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      check(`Actual app ${width}px ${route}: footer policy`, await page.locator('footer.footer').count() === (route.startsWith('/account') ? 0 : 1));
      check(`Actual app ${width}px ${route}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
} catch (error) {
  check(`Browser QA completed: ${error.message}`, false, error.stack);
} finally {
  await writeFile(join(OUTPUT, 'results.json'), JSON.stringify({ browser: await browser.version(), mode: 'Real components/providers, no seeded records; signed-in leaves rendered directly only in the geometry harness. Live auth/backend actions and native 125% zoom are not verified.', checks, measurements }, null, 2));
  await browser.close();
}
const failures = checks.filter((entry) => !entry.pass);
console.log(`Account browser QA: ${checks.length} checks, ${checks.length - failures.length} passed, ${failures.length} failed.`);
console.log(`Artifacts: ${resolve(OUTPUT)}`);
process.exitCode = failures.length ? 1 : 0;
