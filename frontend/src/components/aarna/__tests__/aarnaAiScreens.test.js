/**
 * PRATIKSHYA FASHION — PHASE 11 · STAGE 2.5 — the two AI screens, on
 * production's own machines.
 *
 * `/account/ai-mirror` and `/account/ai-shopping` are the port's own pages since
 * this stage: `pages/account/AiMirror.jsx` and `pages/account/AiShopping.jsx`,
 * both inside the shared account frame, still behind the same `ProtectedRoute`
 * the family has always used. The production screens
 * (`pages/account/AiMirror.jsx`, `pages/account/AiShoppingAssistant.jsx`) are
 * untouched and still serve both paths in the Atelier storefront.
 *
 * What this suite pins is the thing that migration could quietly break: the two
 * pages are NEW CHROME AROUND PRODUCTION'S MACHINES. Everything that decides
 * something — the catalogue read and its revision events, the deep link and its
 * route notices, the camera lifecycle, the abortable try-on request with its four
 * error codes, the cart/wishlist side effects, the session store, the activity
 * diary, the provider — is asserted here to be the same module, called with the
 * same arguments, as the production screen calls it. And everything that only
 * LOOKS different is asserted to stay honest:
 *
 *   1. THE MACHINES ARE NOT FORKED. The three mirror widgets and the five
 *      assistant widgets are imported from `components/aiMirror/` and
 *      `components/aiAssistants/` — the production files themselves — and no
 *      copy of them exists under the port.
 *   2. THE DEMO IS LABELLED, NOT HIDDEN. The mirror's try-on provider is the
 *      mock (`getMockTryOnResult() → null`, so every request ends
 *      `MOCK_PREVIEW_UNAVAILABLE`): the page keeps production's own sentence for
 *      that outcome, drops the hero's "Ready in moments" promise (it cannot be
 *      honoured) and says what the provider actually does. The shopping page
 *      keeps production's demo chip and prints the demo provider's own
 *      `AI_SHOPPING_BRAND.demoNote` under the composer — never the BUSINESS
 *      assistant's `AI_PROVIDER_LABEL`, which production prints there although the
 *      customer surface is answered by the demo provider.
 *   3. NOTHING IS INVENTED. Neither page fetches on its own, invents a product,
 *      references another piece's image, or ships a control that does nothing.
 *      The single product the conversation is about is looked up by identifier
 *      from the live catalogue, and its image is that product's own.
 *
 * WHAT THIS CANNOT PROVE: there is no DOM here, so no click, keystroke, camera
 * permission, scroll or focus order is exercised, and `renderToStaticMarkup` runs
 * no effect — so the selection the mirror makes in an effect, the greeting the
 * assistant seeds in an effect, the try-on request and the answer to a question
 * are pinned at the SOURCE level, and what a render alone settles is the frame,
 * the page's own copy, and which of the page's bodies is drawn. The catalogue in
 * this harness is empty (nothing boots the store), so the mirror is rendered on
 * the branch a real empty catalogue takes; the invariant asserted is "exactly one
 * body", never "the empty one", so seeding the catalogue later cannot make this
 * file lie. The same reason explains why the conversation is asserted as an empty
 * log: its greeting is an effect.
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { Suspense } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';

function projectRoot() {
  let directory = new URL('.', import.meta.url);
  for (let step = 0; step < 10; step += 1) {
    if (existsSync(new URL('package.json', directory))) return fileURLToPath(directory);
    directory = new URL('../', directory);
  }
  throw new Error('frontend root not found');
}

const ROOT = projectRoot();
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const MIRROR = 'src/components/aarna/pages/account/AiMirror.jsx';
const SHOPPING = 'src/components/aarna/pages/account/AiShopping.jsx';
const MOUNT = 'src/components/aarna/AarnaStorefront.jsx';
const PRODUCTION_APP = 'src/App.jsx';
const SHEET = 'src/components/aarna/aarna.ai.css';
const DESIGN_SHEET = 'src/components/aarna/aarna.css';
const REGISTRY = 'scripts/aarna-port.js';

const PRODUCTION_MIRROR = 'src/pages/account/AiMirror.jsx';
const PRODUCTION_SHOPPING = 'src/pages/account/AiShoppingAssistant.jsx';

const MIRROR_WIDGETS = [
  'src/components/aiMirror/AiMirrorStage.jsx',
  'src/components/aiMirror/AiMirrorProductSelector.jsx',
  'src/components/aiMirror/AiMirrorSelectedLook.jsx',
];
const ASSISTANT_WIDGETS = [
  'src/components/aiAssistants/AiComposer.jsx',
  'src/components/aiAssistants/AiConversationLog.jsx',
  'src/components/aiAssistants/AiQuickPrompts.jsx',
  'src/components/aiAssistants/AiShoppingMessage.jsx',
  'src/components/aiAssistants/AiThinkingIndicator.jsx',
];

/* ── the browser a server-rendered page still has to believe in ─────────────── */

const storage = new Map();
const localStorageStub = {
  getItem: (key) => (storage.has(String(key)) ? storage.get(String(key)) : null),
  setItem: (key, value) => storage.set(String(key), String(value)),
  removeItem: (key) => storage.delete(String(key)),
  clear: () => storage.clear(),
};

const NOOP = () => {};

globalThis.window = {
  localStorage: localStorageStub,
  location: { search: '', pathname: '/', href: 'http://localhost/' },
  dispatchEvent: NOOP,
  addEventListener: NOOP,
  removeEventListener: NOOP,
  setTimeout: (handler, delay) => setTimeout(handler, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};

async function mount() {
  const vite = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    define: { 'import.meta.env.VITE_STOREFRONT_HOME': '"aarna"' },
  });
  const load = (path) => vite.ssrLoadModule(path);
  const [
    { default: AiMirror },
    { default: AiShopping },
    { AuthProvider },
    { AccountProvider },
    { InventoryProvider },
    { ShoppingProvider },
    { OrderProvider },
    { CheckoutProvider },
    { UIProvider },
    { ShopProvider },
    catalogStore,
    aiSessionStore,
    aiShoppingService,
  ] = await Promise.all([
    load('/src/components/aarna/pages/account/AiMirror.jsx'),
    load('/src/components/aarna/pages/account/AiShopping.jsx'),
    load('/src/context/AuthContext.jsx'),
    load('/src/context/AccountContext.jsx'),
    load('/src/context/InventoryContext.jsx'),
    load('/src/context/ShoppingContext.jsx'),
    load('/src/context/OrderContext.jsx'),
    load('/src/context/CheckoutContext.jsx'),
    load('/src/components/aarna/state/UIContext.jsx'),
    load('/src/components/aarna/state/ShopContext.jsx'),
    load('/src/services/catalog/catalogStore.js'),
    load('/src/services/ai/aiSessionStore.js'),
    load('/src/services/ai/shopping/aiShoppingService.js'),
  ]);

  const Providers = ({ children }) => {
    let tree = children;
    for (const Provider of [ShopProvider, UIProvider]) tree = React.createElement(Provider, null, tree);
    tree = React.createElement(MotionConfig, { reducedMotion: 'user' }, tree);
    for (const Provider of [
      CheckoutProvider,
      OrderProvider,
      ShoppingProvider,
      InventoryProvider,
      AccountProvider,
      AuthProvider,
    ]) {
      tree = React.createElement(Provider, null, tree);
    }
    return tree;
  };

  const render = (Element, path) =>
    renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: [path] },
        React.createElement(
          Suspense,
          { fallback: null },
          React.createElement(Providers, null, React.createElement(Element)),
        ),
      ),
    );

  return {
    vite,
    render,
    catalogStore,
    aiSessionStore,
    aiShoppingService,
    mirror: (path = '/account/ai-mirror') => render(AiMirror, path),
    shopping: (path = '/account/ai-shopping') => render(AiShopping, path),
  };
}

let app = null;

before(async () => {
  app = await mount();
});

after(async () => {
  await app?.vite.close();
  delete globalThis.window;
});

/* ── helpers ───────────────────────────────────────────────────────────────── */

const count = (markup, needle) => markup.split(needle).length - 1;
const anchors = (markup) =>
  [...markup.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, inner]) => ({
    href: (attributes.match(/href="([^"]*)"/) ?? [])[1] ?? null,
    inner,
  }));
const hrefs = (markup) => anchors(markup).map((anchor) => anchor.href);

/* ── 1 · the boundary ──────────────────────────────────────────────────────── */

test('both AI routes are the port’s own pages, inside the guard the family shares', () => {
  const mountSource = read(MOUNT);
  const appSource = read(PRODUCTION_APP);

  /* The port's own pages, imported where the port mounts them — deliberately not
     through the `lazy` block, which is production's. */
  assert.match(mountSource, /^import AccountAiMirrorPage from "\.\/pages\/account\/AiMirror\.jsx";$/m,
    'the port no longer imports its own AI Mirror page');
  assert.match(mountSource, /^import AccountAiShoppingPage from "\.\/pages\/account\/AiShopping\.jsx";$/m,
    'the port no longer imports its own AI Shopping page');
  assert.equal(/const AiMirror = lazy\(/.test(mountSource), false,
    'the AI Mirror is still declared as a production lazy page in the port');
  assert.equal(/const AiShoppingAssistant = lazy\(/.test(mountSource), false,
    'AI Shopping is still declared as a production lazy page in the port');

  /* Both routes are the port's own component, and BOTH sit inside the family's
     single `ProtectedRoute` block — the same guard production wraps them in. */
  assert.match(mountSource, /<Route path="account\/ai-mirror" element=\{<AccountAiMirrorPage \/>\} \/>/);
  assert.match(mountSource, /<Route path="account\/ai-shopping" element=\{<AccountAiShoppingPage \/>\} \/>/);
  const guarded = mountSource.slice(
    mountSource.indexOf('<Route element={<ProtectedRoute />}>'),
    mountSource.indexOf('</Route>', mountSource.indexOf('account/instagram-rewards')),
  );
  assert.match(guarded, /account\/ai-mirror/, 'the AI Mirror left the guard block');
  assert.match(guarded, /account\/ai-shopping/, 'AI Shopping left the guard block');

  /* Production keeps both paths — lazily, and in App.jsx's own words. */
  assert.match(appSource, /const AiMirror = lazy\(\(\) => import\("\.\/pages\/account\/AiMirror"\)\);/);
  assert.match(appSource, /const AiShoppingAssistant = lazy\(\(\) => import\("\.\/pages\/account\/AiShoppingAssistant"\)\);/);
  assert.match(appSource, /<Route path="\/account\/ai-mirror" element=\{<AiMirror \/>\} \/>/);
  assert.match(appSource, /<Route path="\/account\/ai-shopping" element=\{<AiShoppingAssistant \/>\} \/>/);
});

test('the port’s registry declares both pages and their sheet, once each', () => {
  const registry = read(REGISTRY);
  const added = registry.slice(registry.indexOf('const ADDED = ['), registry.indexOf('];', registry.indexOf('const ADDED = [')));

  for (const entry of ['aarna.ai.css', 'pages/account/AiMirror.jsx', 'pages/account/AiShopping.jsx']) {
    assert.equal(count(added, `"${entry}"`), 1, `${entry} is not declared exactly once in the registry`);
    assert.ok(existsSync(join(ROOT, 'src/components/aarna', entry)), `${entry} is declared but does not exist`);
  }

  /* The sheet is the port's own, imported by the mount beside the account's. */
  assert.match(read(MOUNT), /import "\.\/aarna\.ai\.css";/, 'the AI sheets are not imported by the port');
});

/* ── 2 · the sheet ─────────────────────────────────────────────────────────── */

test('the sheet is scoped to the port, token-only, and every rule it writes is a class the two pages draw', () => {
  const sheet = read(SHEET);
  const stripped = sheet.replace(/\/\*[\s\S]*?\*\//g, '');

  assert.equal(/!important/.test(stripped), false, 'the sheet forces declarations');
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(stripped), false, 'the sheet hard-codes a colour instead of a token');

  /* Every selector, including the ones inside the small-screen blocks, is scoped
     to the port — so no rule here can reach the host application. */
  const selectors = [];
  let cursor = 0;
  for (const brace of stripped.matchAll(/\{/g)) {
    const before = stripped.slice(cursor, brace.index);
    const selector = before.slice(before.lastIndexOf('}') + 1).split('{').pop().trim();
    cursor = brace.index;
    if (selector && !selector.startsWith('@media')) selectors.push(selector);
  }
  assert.ok(selectors.length >= 20, `expected the AI screens' rules, found ${selectors.length}`);
  for (const selector of selectors) {
    assert.match(selector, /^\.aan-root /, `${selector} is not scoped to the port`);
  }

  /* Every token it reads is the design's own. */
  const tokens = new Set([...read(DESIGN_SHEET).matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  for (const [, token] of sheet.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
    assert.ok(tokens.has(token), `${token} is not a token the design defines`);
  }

  /* The classes it styles are the classes these two pages draw, and every class
     they draw is styled: the sheet owns the AI screens' chrome and nothing else.
     Only the `pf-ai__` element form is read — the pages also carry ids of the
     form `pf-ai-recent-heading`, which are identifiers, not classes. */
  const drawn = new Set(
    [...`${read(MIRROR)}\n${read(SHOPPING)}`.matchAll(/pf-ai__[a-z-]+/g)].map((match) => match[0]),
  );
  const styled = new Set([...stripped.matchAll(/\.(pf-ai__[a-z-]+)\b/g)].map((match) => match[1]));
  for (const className of styled) {
    assert.ok(drawn.has(className), `${className} is styled but never drawn`);
  }
  for (const className of drawn) {
    assert.ok(styled.has(className), `${className} is drawn but never styled`);
  }
});

/* ── 3 · the mirror's machine ──────────────────────────────────────────────── */

test('the mirror keeps production’s try-on machine, wired to the same services', () => {
  const page = code(MIRROR);

  /* The edit, its cover resolution and its two change events. */
  const serviceImport = (page.match(/import \{[\s\S]*?\} from '\.\.\/\.\.\/\.\.\/\.\.\/services\/aiMirror\/aiMirrorService\.js';/) ?? [''])[0];
  for (const member of ['getVirtualTryOnProducts', 'hasVirtualTryOnUsableMedia', 'getRecentTryOns', 'recordRecentTryOn']) {
    assert.ok(serviceImport.includes(member), `the mirror stopped reading ${member} through production’s service`);
  }
  assert.match(page, /const readyProducts = \(\) => getVirtualTryOnProducts\(\);/);
  assert.match(page, /const products = useProductCovers\(catalogueProducts\);/,
    'the mirror stopped resolving product covers the way production resolves them');
  assert.match(page, /window\.addEventListener\(PRODUCTS_CHANGED_EVENT, refresh\)/);
  assert.match(page, /window\.addEventListener\(TAXONOMY_CHANGED_EVENT, refresh\)/);

  /* The camera: video only, one request at a time, tracks stopped on the way out. */
  assert.match(page, /navigator\.mediaDevices\.getUserMedia\(\{ video: true, audio: false \}\)/,
    'the mirror no longer asks for video only');
  assert.match(page, /const requestId = \+\+cameraRequestRef\.current;/);
  assert.match(page, /if \(cameraRequestRef\.current !== requestId\) \{\n\s+stopTracks\(stream\);/,
    'a superseded camera request no longer releases its stream');
  assert.match(page, /stopTracks\(streamRef\.current\);/);
  assert.match(page, /const cameraErrorState = \(error\) => \{/, 'the camera failure is no longer classified');
  assert.match(page, /\? 'denied'\n\s+: 'unavailable';/);

  /* The try-on request: abortable, staged, and honest about all four codes. */
  assert.match(page, /const preview = await generateTryOnPreview\(\{/, 'the preview no longer goes through the provider seam');
  assert.match(page, /signal: controller\.signal,/);
  assert.match(page, /onProgress: \(nextState\) => \{\n\s+if \(tryOnRequestRef\.current === requestId\) setProcessingState\(nextState\);/);
  assert.match(page, /tryOnAbortRef\.current\?\.abort\(\);/);
  assert.match(page, /if \(error\?\.name === 'AbortError' \|\| tryOnRequestRef\.current !== requestId\) return;/);
  for (const code of ['PRODUCT_MEDIA_UNAVAILABLE', 'INELIGIBLE_PRODUCT', 'MOCK_PREVIEW_UNAVAILABLE']) {
    assert.ok(page.includes(`error?.code === '${code}'`), `the ${code} answer is no longer its own sentence`);
  }
  assert.match(page, /'A demo preview is unavailable for this piece\. Choose another look or try again\.'/,
    'the demo provider’s own outcome lost production’s sentence');
  assert.match(page, /recordRecentTryOn\(user\?\.id, selectedProduct\.id\)/,
    'a preview no longer records the recent try-on');
  assert.match(page, /getRecentTryOns\(user\?\.id\)/);

  /* The two side effects are the real ones. */
  assert.match(page, /const defaults = defaultSelection\(selectedProduct\);/);
  assert.match(page, /const added = cart\.addToCart\(selectedProduct, selection\);/);
  assert.match(page, /kind: added\.ok \? 'success' : 'error',/, 'a refused add is no longer stated as a failure');
  assert.match(page, /wishlist\.isSaved\(selectedProduct\)/);
  assert.match(page, /wishlist\.add\(selectedProduct\)/);
  assert.match(page, /wishlist\.remove\(selectedProduct\)/);

  /* The deep link, its three notices, and the interaction the customer’s visit records. */
  assert.match(page, /void apiTrackProductInteraction\(selectedId, 'VIEW'\)/);
  assert.match(page, /const requestedProduct = getProductByIdentifier\(requestedProductId\);/);
  assert.equal(count(page, 'setRouteNotice('), 3, 'the route notice calls changed shape');
  assert.ok(page.includes('needs a usable active product image before it can be previewed.'));
  assert.ok(page.includes('is not eligible for the AI Mirror. Choose an apparel look from the edit instead.'));
  assert.ok(page.includes('The requested product is unavailable. Choose an apparel look from the edit instead.'));
  assert.match(page, /next\.set\('product', product\.id\);/);
  assert.match(page, /setSearchParams\(next, \{ replace: true \}\)/);

  /* The tab, the feedback timer and the teardown. */
  assert.match(page, /const MIRROR_TITLE = 'PRATIKSHYA AI Mirror — PRATIKSHYA FASHION';/);
  assert.match(page, /window\.setTimeout\(\(\) => setFeedback\(\{ message: '', kind: 'success' \}\), 4800\)/);
  assert.match(page, /cameraRequestRef\.current \+= 1;\n\s+cancelTryOn\(\);\n\s+stopTracks\(streamRef\.current\);/,
    'leaving the page no longer releases the camera and the request');
});

test('the mirror’s widgets are production’s own files, not copies', () => {
  const page = read(MIRROR);
  for (const widget of MIRROR_WIDGETS) {
    assert.ok(existsSync(join(ROOT, widget)), `${widget} is missing from production`);
    const name = widget.split('/').pop().replace('.jsx', '');
    assert.match(page, new RegExp(`^import ${name} from '\\.\\./\\.\\./\\.\\./\\.\\./components/aiMirror/${name}\\.jsx';$`, 'm'),
      `the mirror no longer imports production's ${name}`);
  }
  /* No copy of a widget lives under the port: the port's own tree carries pages,
     not a second aiMirror/. */
  assert.equal(existsSync(join(ROOT, 'src/components/aarna/components/aiMirror')), false,
    'a second copy of the mirror widgets was added to the port');

  /* And production’s own file is untouched: it is still the page App.jsx renders. */
  const production = code(PRODUCTION_MIRROR);
  assert.match(production, /<AccountShell breadcrumbItems=\{\[\{ label: "My PRATIKSHYA", to: "\/account" \}, \{ label: "AI Mirror" \}\]\}>/,
    'the production screen changed');
  assert.equal(production.includes('pf-ai__'), false, 'the production screen was given the port’s classes');
});

test('the mirror states the demo plainly and claims no preview it cannot produce', () => {
  const page = code(MIRROR);

  /* The three notes are the ones this page can honour. */
  assert.ok(page.includes("label: 'No photos are stored'"));
  assert.ok(page.includes("label: 'Demo preview module'"));
  assert.ok(page.includes("label: 'Frames stay in your browser'"));
  assert.equal(/Ready in moments/.test(page), false,
    'the mirror promises a preview the demo provider cannot produce');

  /* The closing band says which image the mirror composes from, and keeps
     production’s two other facts word for word. */
  assert.ok(page.includes('The demo provider composes no new image'));
  assert.ok(page.includes('Camera frames stay in your browser and are never saved by this demo.'));
  assert.ok(page.includes('View the product, save it to your wishlist or add it to your existing bag.'));

  /* The empty edit is production’s own sentence, with the design’s block. */
  assert.match(page, /<section className="empty">/);
  assert.ok(page.includes('No apparel looks are available right now.'));
  assert.ok(page.includes('The AI Mirror only shows eligible apparel with usable active product media.'));

  /* The provider is the mock one, and the page says so without saying "AI". */
  const provider = read('src/services/aiMirror/virtualTryOnService.js');
  assert.match(provider, /export const VIRTUAL_TRY_ON_PROVIDER = "mock";/);
  assert.match(read('src/services/aiMirror/aiMirrorMockData.js'), /export const getMockTryOnResult = \(\) => null;/);
});

/* ── 4 · the shopping page's machine ───────────────────────────────────────── */

test('the shopping page keeps production’s conversation machine, argument for argument', () => {
  const page = code(SHOPPING);

  /* The request is production's, with the same nine arguments. */
  assert.match(page, /const response = await aiService\.askShoppingAssistant\(\{/);
  for (const argument of [
    'question,',
    'products,',
    'productContext: contextProduct,',
    'wishlistIds: [...wishlist.saved],',
    'recentIds: recently.ids.map(String),',
    'purchasedIds,',
    'preferences,',
    'customerName: user?.firstName ?? null,',
    'onStage: (progress) => setStage(progress?.message || \'\'),',
  ]) {
    assert.ok(page.includes(argument), `the assistant request no longer carries ${argument}`);
  }
  assert.match(page, /const products = useMemo\(\(\) => getLiveStorefrontProducts\(\), \[catalogueRevision\]\);/);
  assert.match(page, /getStylePreferences\(user\?\.id\)/);
  assert.match(page, /window\.addEventListener\(MEDIA_CHANGED_EVENT, sync\);/,
    'a media change no longer refreshes the assistant’s catalogue');

  /* The two side effects are the real ones, and a refusal is stated. */
  assert.match(page, /const result = cart\.addToCart\(response\.product, \{ quantity: 1 \}\);/);
  assert.match(page, /text: `\$\{response\.product\.name\} could not be added — it may need a size choice on its page\.`/,
    'a refused add is no longer stated in words');
  assert.match(page, /wishlist\.add\(response\.product\);/);

  /* The session is production's: customer-scoped, product ids only, re-resolved. */
  assert.match(page, /loadAiSession\(AI_SESSION_SCOPES\.SHOPPING, user\?\.id\)\.map\(rehydrateMessage\)/);
  assert.match(page, /saveAiSession\(AI_SESSION_SCOPES\.SHOPPING, user\?\.id, messages\)/);
  assert.match(page, /clearAiSession\(AI_SESSION_SCOPES\.SHOPPING, user\?\.id\)/);
  assert.match(page, /const next = \{ \.\.\.message \};/);
  assert.match(page, /next\.products = rehydrateProducts\(message\.productIds\)\.map\(\(product\) => \(\{ product, reason: '' \}\)\);/);
  assert.match(page, /next\.outfit = \{ main, pieces: rehydrateProducts\(message\.outfitPieceIds\) \};/);
  assert.match(page, /const compared = rehydrateProducts\(message\.comparisonIds\);/);

  /* The greeting, the prompts and the diary lines are the application’s own. */
  assert.match(page, /buildShoppingResponse\(\{/);
  assert.match(page, /text: AI_SHOPPING_GREETING\(user\?\.firstName\)/);
  assert.match(page, /suggestions: OPENING_SUGGESTIONS,/);
  assert.match(page, /const quickPrompts = contextProduct \? AI_SHOPPING_PRODUCT_PROMPTS : AI_SHOPPING_QUICK_PROMPTS;/);
  assert.match(page, /action: ACTIVITY_ACTIONS\.AI_SHOPPING_SESSION_STARTED,/);
  assert.match(page, /action: ACTIVITY_ACTIONS\.AI_SHOPPING_QUERY,/);
  assert.match(page, /describeActor\(\{ label: user\?\.firstName \? `Customer · \$\{user\.firstName\}` : 'Customer' \}\)/);
  assert.match(page, /recordActivity\(loadActivity\(\), \{/);

  /* The failure and the context controls are production's own. */
  assert.match(page, /setError\('The assistant lost its train of thought\. Please ask again\.'\)/);
  assert.match(page, /if \(progress\?\.name === 'AbortError'\) return;/);
  assert.match(page, /searchParams\.delete\('product'\);/);
  assert.match(page, /setSearchParams\(searchParams, \{ replace: true \}\)/);
  assert.match(page, /const SHOPPING_TITLE = 'AI Shopping — My PRATIKSHYA';/);
  assert.match(page, /if \(el\) el\.scrollTop = el\.scrollHeight;/);
});

test('the shopping page’s widgets are production’s own files, not copies', () => {
  const page = read(SHOPPING);
  for (const widget of ASSISTANT_WIDGETS) {
    assert.ok(existsSync(join(ROOT, widget)), `${widget} is missing from production`);
    const name = widget.split('/').pop().replace('.jsx', '');
    assert.match(page, new RegExp(`\\.\\./\\.\\./\\.\\./\\.\\./components/aiAssistants/${name}\\.jsx`),
      `the shopping page no longer imports production's ${name}`);
  }
  assert.equal(existsSync(join(ROOT, 'src/components/aarna/components/aiAssistants')), false,
    'a second copy of the assistant widgets was added to the port');

  /* The widgets are handed the real contexts and the real send path. */
  assert.match(page, /<AiShoppingMessage\n\s+key=\{message\.id\}\n\s+message=\{message\}\n\s+bag=\{cart\}\n\s+wishlist=\{wishlist\}\n\s+onSuggestion=\{send\}/);
  assert.match(page, /<AiComposer\n\s+value=\{draft\}\n\s+onChange=\{setDraft\}\n\s+onSubmit=\{send\}\n\s+busy=\{thinking\}/);
  assert.match(page, /<AiQuickPrompts\n\s+prompts=\{quickPrompts\}\n\s+onPick=\{send\}\n\s+disabled=\{thinking\}/);
  assert.match(page, /<AiThinkingIndicator stage=\{stage\} label="PRATIKSHYA AI is preparing recommendations" \/>/);

  /* And production's own screen is untouched. */
  const production = code(PRODUCTION_SHOPPING);
  assert.equal(production.includes('pf-ai__'), false, 'the production screen was given the port’s classes');
  assert.match(production, /<AccountShell breadcrumbItems=\{\[\{ label: "My PRATIKSHYA", to: "\/account" \}, \{ label: "AI Shopping" \}\]\}>/,
    'the production screen changed');
});

test('the shopping page labels the demo provider, and never prints the business assistant’s label on it', () => {
  const page = code(SHOPPING);

  assert.match(page, /const demoProvider = isMockAiProvider\(\);/);
  assert.match(page, /\{demoProvider \? 'Demo assistant · deterministic' : AI_PROVIDER_LABEL\}/,
    'the demo chip is no longer gated on the provider');
  assert.match(page, /\{demoProvider\n\s+\? AI_SHOPPING_BRAND\.demoNote\n\s+: `\$\{AI_PROVIDER_LABEL\} · answers from the live catalogue`\}/,
    'the composer footnote no longer names the provider that is actually answering');
  assert.ok(page.includes('Conversations stay on this device and never store images.'));
  assert.ok(page.includes('grounded in the live catalogue — deterministic, not a trained model.'));

  /* The two strings it prints come from the application’s own modules — the demo
     provider’s note for the demo provider, the provider’s label otherwise. */
  const aiService = read('src/services/ai/aiService.js');
  assert.match(aiService, /export const AI_PROVIDER_LABEL = "PRATIKSHYA AI \(live business data\)";/);
  assert.match(aiService, /export const isMockAiProvider = \(\) => activeProvider\.id === "mock";/);
  assert.match(read('src/services/ai/shopping/aiShoppingMockData.js'),
    /demoNote: "Demo assistant · grounded in the live catalogue",/);
});

/* ── 5 · what neither page may do ──────────────────────────────────────────── */

test('neither page invents a fact, a control or a network call', () => {
  for (const file of [MIRROR, SHOPPING]) {
    const page = code(file);

    assert.equal(/\bfetch\(|axios|apiClient|XMLHttpRequest/.test(page), false, `${file} calls the network directly`);
    assert.equal(/localStorage|sessionStorage/.test(page), false, `${file} keeps storage of its own`);
    assert.equal(/Math\.random|picsum|unsplash|placehold\.co/.test(page), false, `${file} generates imagery`);
    assert.equal(/coming soon|Coming Soon|\bTODO\b|\bFIXME\b|\bLorem\b/.test(page), false, `${file} ships a stand-in`);
    assert.equal(/href="#|to="#|onClick=\{\(\) => \{\}\}/.test(page), false, `${file} ships an action that does nothing`);
    assert.equal(/@[a-z0-9.-]+\.(com|example|in)\b/.test(page), false, `${file} carries an invented address`);
    /* No hard-coded catalogue: every product comes from the repositories. */
    assert.equal(/PF-[A-Z]{2}-/.test(page), false, `${file} names a product of its own`);
    assert.equal(/imageRef\(|mediaPlaceholder/.test(page), false, `${file} reaches for a decorative placeholder`);
  }

  /* The catalogue’s own identity is used for the piece in hand: the lookup, the
     media, and the canonical product path — never another piece’s image. */
  const page = code(SHOPPING);
  assert.match(page, /return getProductByIdentifier\(ref\) \?\? getProductById\(ref\) \?\? null;/);
  assert.match(page, /image=\{contextProduct\.image\}/);
  assert.match(page, /<Button to=\{`\/product\/\$\{contextProduct\.slug\}`\} variant="ghost">/);
  assert.equal(count(page, 'contextProduct.image'), 1, 'the context strip resolves more than one image');
});

/* ── 6 · what a render settles ─────────────────────────────────────────────── */

test('the mirror renders inside the account frame, in production’s own words, with exactly one body', () => {
  const markup = app.mirror();

  /* The frame owns the heading, the tab and the crumb; the page names itself the
     way production named itself. */
  assert.match(markup, /class="pf-account__nav"/, 'the mirror did not render inside the account frame');
  assert.match(markup, /<p class="label">PRATIKSHYA AI MIRROR<\/p>/);
  assert.match(markup, /<h1 class="display pf-account__name">See yourself in the look before you make it yours\.<\/h1>/,
    'the mirror no longer states production’s own headline');
  assert.match(markup, /<p class="info__lead pf-account__lead">/, 'the mirror lost the frame’s lead line');
  assert.match(markup, /<span aria-current="page">AI Mirror<\/span>/, 'the crumb no longer ends on this page');

  /* The notes band, and no promise of a preview arriving. */
  assert.match(markup, /class="pf-ai__notes"/);
  assert.equal(count(markup, 'class="pf-ai__note"'), 3, 'the notes band is not three notes');
  assert.equal(/Ready in moments/.test(markup), false, 'the mirror promised a preview');

  /* One body — the edit or the honest empty state, never neither and never both. */
  const bodies = count(markup, 'class="pf-ai__grid"') + count(markup, 'class="empty"');
  assert.equal(bodies, 1, `the mirror drew ${bodies} bodies`);

  /* No camera is asked for, nothing is selected, and nothing is failing: a static
     render cannot have started any of it. */
  assert.equal(/pf-ai__notice/.test(markup), false, 'a route notice was drawn without a route');
});

test('the assistant renders inside the account frame, with its own surface and the demo labelled', () => {
  const markup = app.shopping();

  assert.match(markup, /class="pf-account__nav"/, 'the assistant did not render inside the account frame');
  assert.match(markup, /<p class="label">PRATIKSHYA AI<\/p>/);
  assert.match(markup, /<h1 class="display pf-account__name">Your personal fashion companion\.<\/h1>/,
    'the assistant no longer states production’s own headline');
  assert.match(markup, /<span aria-current="page">AI Shopping<\/span>/, 'the crumb no longer ends on this page');

  /* The demo is labelled where the customer reads it — and the business
     assistant’s label is nowhere on a customer surface. */
  assert.match(markup, /class="pf-ai__demo">Demo assistant · deterministic</);
  assert.equal(/live business data/.test(markup), false, 'the business assistant’s label reached the customer surface');
  assert.match(markup, /Demo assistant · grounded in the live catalogue/);

  /* The conversation surface, the composer, and the rail are all real. */
  assert.match(markup, /role="log"[^>]*aria-label="AI shopping conversation"/, 'the log region is missing');
  assert.match(markup, /class="[^"]*pf-ai__log[^"]*"|pf-ai__log/, 'the log lost its own class');
  assert.match(markup, /<input[^>]*id="ai-composer-input"[^>]*aria-label="Ask PRATIKSHYA AI about a piece, occasion or budget"/,
    'the composer’s labelled field is missing');
  assert.match(markup, /<form/, 'the composer is no longer a form');
  assert.match(markup, /role="group" aria-label="Suggested shopping prompts"/, 'the suggested prompts are missing');
  assert.match(markup, /Begin anywhere/);
  assert.match(markup, /Also in your account/);

  /* The rail points at the account’s own destinations, and the wishlist count is
     the context’s (zero here — nothing is seeded). The frame draws its own
     navigation above the page, so the rail is read from its own list. */
  const railMarkup = markup.slice(
    markup.indexOf('class="pf-ai__links"'),
    markup.indexOf('</ul>', markup.indexOf('class="pf-ai__links"')),
  );
  assert.deepEqual([...railMarkup.matchAll(/href="([^"]+)"/g)].map((match) => match[1]),
    ['/account/ai-mirror', '/account/wishlist', '/account/preferences'],
    'the assistant’s rail no longer points where production’s points');
  assert.match(markup, /Your wishlist · 0 saved/);

  /* No `?product=`, no strip — and the page still renders its own surface. */
  assert.equal(/pf-ai__context/.test(markup), false, 'a context strip was drawn without a product');
});

test('an unresolvable product reference leaves the strip out rather than inventing a piece', () => {
  const markup = app.shopping('/account/ai-shopping?product=phase8-not-a-product');

  assert.equal(/pf-ai__context/.test(markup), false, 'an unknown reference drew a context strip');
  assert.equal(/pf-ai__context-img/.test(markup), false, 'an unknown reference drew an image');
  assert.match(markup, /class="pf-ai__chat"/, 'the conversation disappeared with the unknown reference');
  assert.match(markup, /id="ai-composer-input"/, 'the composer disappeared with the unknown reference');
  /* The prompts fall back to the general set, which is what production does. */
  assert.match(markup, /Find my wedding look/);
});

test('the renderer’s own attribute order is not what is being asserted', () => {
  /* `renderToStaticMarkup` emits attributes in insertion order, which is not a
     contract. Every assertion above therefore matches on class names, ids, labels
     and text — the meanings — and this test exists to say so out loud, the way
     `aarnaOrdersPage` does for the same reason. */
  const markup = app.mirror();
  assert.equal(markup.includes('<div class="'), true);
});

/* ── 7 · Gate 5 — catalogue synchronization, session integrity & service freshness ── */

test('Defect A: AI Shopping subscribes to CATALOG_CHANGED_EVENT and updates context strip and conversation when the catalogue hydrates or refreshes', () => {
  const page = code(SHOPPING);
  assert.match(page, /import \{ CATALOG_CHANGED_EVENT \} from '\.\.\/\.\.\/\.\.\/\.\.\/services\/catalog\/catalogStore\.js';/,
    'AiShopping.jsx does not import CATALOG_CHANGED_EVENT from catalogStore');
  assert.match(page, /window\.addEventListener\(CATALOG_CHANGED_EVENT, sync\);/,
    'AiShopping.jsx does not subscribe to CATALOG_CHANGED_EVENT');
  assert.match(page, /window\.removeEventListener\(CATALOG_CHANGED_EVENT, sync\);/,
    'AiShopping.jsx does not clean up its CATALOG_CHANGED_EVENT listener');
  assert.match(page, /setMessages\(\(current\) => rehydrateMessages\(current\)\);/,
    'AiShopping.jsx does not rehydrate messages when a catalogue event fires');

  /* Before catalogue hydration, `?product=prod-gate5-saree` cannot resolve. */
  app.catalogStore.applyCatalogSnapshot({ products: [], categories: [], collections: [] });
  const beforeMarkup = app.shopping('/account/ai-shopping?product=prod-gate5-saree');
  assert.equal(/pf-ai__context/.test(beforeMarkup), false, 'context strip rendered before catalogue hydration');

  /* Hydrate catalogue: the context strip resolves and renders the piece. */
  app.catalogStore.applyCatalogSnapshot({
    products: [
      {
        id: 'prod-gate5-saree',
        name: 'Pratikshya Crimson Organza Saree',
        slug: 'crimson-organza-saree',
        department: 'women',
        category: 'sarees',
        subcategory: 'silk',
        fabric: 'Organza',
        colors: ['Crimson'],
        occasion: ['Cocktail'],
        collection: 'Festive Atelier',
        collections: ['Festive Atelier'],
        price: 14500,
        availability: 'in-stock',
        stock: 5,
        status: 'PUBLISHED',
        image: '/aarna-design/p-saree-ivory.webp',
      },
    ],
    categories: [{ id: 'sarees', name: 'Sarees', slug: 'sarees', status: 'ACTIVE' }],
    collections: [{ id: 'festive-atelier', name: 'Festive Atelier', slug: 'festive-atelier', status: 'ACTIVE' }],
  });

  const afterMarkup = app.shopping('/account/ai-shopping?product=prod-gate5-saree');
  assert.match(afterMarkup, /class="pf-ai__context"/, 'context strip did not appear after catalogue hydration');
  assert.match(afterMarkup, /Pratikshya Crimson Organza Saree/, 'context strip did not render hydrated product name');
  assert.match(afterMarkup, /href="\/product\/crimson-organza-saree"/, 'context strip did not link to hydrated product slug');

  /* Refresh catalogue with updated product metadata: UI reflects the refreshed product. */
  app.catalogStore.applyCatalogSnapshot({
    products: [
      {
        id: 'prod-gate5-saree',
        name: 'Pratikshya Emerald Organza Saree',
        slug: 'emerald-organza-saree',
        department: 'women',
        category: 'sarees',
        subcategory: 'silk',
        fabric: 'Organza',
        colors: ['Emerald'],
        occasion: ['Cocktail'],
        price: 15800,
        availability: 'in-stock',
        stock: 3,
        status: 'PUBLISHED',
        image: '/aarna-design/p-saree-ivory.webp',
      },
    ],
    categories: [{ id: 'sarees', name: 'Sarees', slug: 'sarees', status: 'ACTIVE' }],
    collections: [],
  });

  const refreshedMarkup = app.shopping('/account/ai-shopping?product=prod-gate5-saree');
  assert.match(refreshedMarkup, /Pratikshya Emerald Organza Saree/, 'context strip did not update after catalogue refresh');
  assert.match(refreshedMarkup, /href="\/product\/emerald-organza-saree"/);

  app.catalogStore.applyCatalogSnapshot({ products: [], categories: [], collections: [] });
});

test('Defect B: persisted conversation product IDs survive unhydrated restores and early writes, then resolve once the catalogue hydrates', () => {
  const { AI_SESSION_SCOPES, saveAiSession, loadAiSession, clearAiSession } = app.aiSessionStore;
  storage.clear();
  app.catalogStore.applyCatalogSnapshot({ products: [], categories: [], collections: [] });

  /* 1. Seed a conversation with all five product-reference shapes plus a genuinely empty TEXT message. */
  saveAiSession(AI_SESSION_SCOPES.SHOPPING, 'guest', [
    {
      id: 'msg-empty',
      role: 'assistant',
      type: 'TEXT',
      text: 'Welcome to the atelier.',
      products: [],
    },
    {
      id: 'msg-recs',
      role: 'assistant',
      type: 'PRODUCT_RECOMMENDATIONS',
      text: 'Here are the sarees I would point you to first.',
      products: [
        { product: { id: 'prod-gate5-1', name: 'Crimson Saree' }, reason: 'matches' },
        { product: { id: 'prod-gate5-missing', name: 'Retired Piece' }, reason: 'matches' },
      ],
      outfit: {
        main: { id: 'prod-gate5-1' },
        pieces: [{ id: 'prod-gate5-2' }],
      },
      product: { id: 'prod-gate5-1' },
      comparison: {
        products: [{ id: 'prod-gate5-1' }, { id: 'prod-gate5-2' }],
        rows: [],
        verdict: '',
      },
    },
  ]);

  /* 2. Restore the session while the catalogue is still unhydrated (empty). */
  const restoredUnhydrated = loadAiSession(AI_SESSION_SCOPES.SHOPPING, 'guest');
  assert.equal(restoredUnhydrated.length, 2);
  assert.deepEqual(restoredUnhydrated[0].productIds, [], 'genuinely empty message did not stay empty');
  assert.equal(restoredUnhydrated[0].outfitMainId, null);
  assert.deepEqual(restoredUnhydrated[0].outfitPieceIds, []);
  assert.equal(restoredUnhydrated[0].singleProductId, null);
  assert.deepEqual(restoredUnhydrated[0].comparisonIds, []);

  assert.deepEqual(restoredUnhydrated[1].productIds, ['prod-gate5-1', 'prod-gate5-missing'],
    'loadAiSession wiped persisted productIds');
  assert.equal(restoredUnhydrated[1].outfitMainId, 'prod-gate5-1',
    'loadAiSession wiped persisted outfitMainId');
  assert.deepEqual(restoredUnhydrated[1].outfitPieceIds, ['prod-gate5-2'],
    'loadAiSession wiped persisted outfitPieceIds');
  assert.equal(restoredUnhydrated[1].singleProductId, 'prod-gate5-1',
    'loadAiSession wiped persisted singleProductId');
  assert.deepEqual(restoredUnhydrated[1].comparisonIds, ['prod-gate5-1', 'prod-gate5-2'],
    'loadAiSession wiped persisted comparisonIds');

  /* 3. Render AI Shopping while catalogue is unhydrated, then simulate the early
     persistence write that occurs before catalogue hydration finishes. */
  const unhydratedMarkup = app.shopping('/account/ai-shopping');
  assert.match(unhydratedMarkup, /Here are the sarees I would point you to first\./);
  assert.equal(/Crimson Saree/.test(unhydratedMarkup), false,
    'unhydrated render fabricated a product card before catalogue hydration');

  /* Simulate the early persistence effect writing the unhydrated rehydrated message
     (`products: []`, `outfit: undefined`, `product: undefined`, `comparison: undefined`). */
  const unhydratedRehydrated = restoredUnhydrated.map((msg) => ({
    ...msg,
    products: [],
    outfit: undefined,
    product: undefined,
    comparison: undefined,
  }));
  saveAiSession(AI_SESSION_SCOPES.SHOPPING, 'guest', unhydratedRehydrated);

  const afterEarlySave = loadAiSession(AI_SESSION_SCOPES.SHOPPING, 'guest');
  assert.deepEqual(afterEarlySave[1].productIds, ['prod-gate5-1', 'prod-gate5-missing'],
    'early save before catalogue hydration overwrote productIds with []');
  assert.equal(afterEarlySave[1].outfitMainId, 'prod-gate5-1',
    'early save before catalogue hydration overwrote outfitMainId with null');
  assert.deepEqual(afterEarlySave[1].outfitPieceIds, ['prod-gate5-2'],
    'early save before catalogue hydration overwrote outfitPieceIds with []');
  assert.equal(afterEarlySave[1].singleProductId, 'prod-gate5-1',
    'early save before catalogue hydration overwrote singleProductId with null');
  assert.deepEqual(afterEarlySave[1].comparisonIds, ['prod-gate5-1', 'prod-gate5-2'],
    'early save before catalogue hydration overwrote comparisonIds with []');

  /* 4. Hydrate catalogue (`prod-gate5-1` and `prod-gate5-2` resolve; `prod-gate5-missing`
     stays permanently unavailable without crashing). */
  app.catalogStore.applyCatalogSnapshot({
    products: [
      {
        id: 'prod-gate5-1',
        name: 'Pratikshya Crimson Silk Saree',
        slug: 'crimson-silk-saree',
        department: 'women',
        category: 'sarees',
        subcategory: 'silk',
        fabric: 'Silk',
        colors: ['Crimson'],
        occasion: ['Wedding'],
        price: 18500,
        availability: 'in-stock',
        stock: 4,
        status: 'PUBLISHED',
        image: '/aarna-design/p-saree-ivory.webp',
      },
      {
        id: 'prod-gate5-2',
        name: 'Pratikshya Gold Brocade Dupatta',
        slug: 'gold-brocade-dupatta',
        department: 'women',
        category: 'essentials',
        subcategory: 'dupattas-stoles',
        fabric: 'Brocade',
        colors: ['Gold'],
        occasion: ['Wedding'],
        price: 4500,
        availability: 'in-stock',
        stock: 6,
        status: 'PUBLISHED',
        image: '/aarna-design/p-saree-ivory.webp',
      },
    ],
    categories: [
      { id: 'sarees', name: 'Sarees', slug: 'sarees', status: 'ACTIVE' },
      { id: 'essentials', name: 'Essentials', slug: 'essentials', status: 'ACTIVE' },
    ],
    collections: [],
  });

  const hydratedMarkup = app.shopping('/account/ai-shopping');
  assert.match(hydratedMarkup, /Pratikshya Crimson Silk Saree/,
    'hydrated render did not reconstruct saved recommendation product card');
  assert.match(hydratedMarkup, /Pratikshya Gold Brocade Dupatta/,
    'hydrated render did not reconstruct saved outfit/comparison companion piece');

  /* 5. Malformed persisted session payloads are handled safely without throwing. */
  storage.set('pratikshya_ai_shopping_session_malformed', JSON.stringify({ version: 1, messages: 'invalid' }));
  assert.deepEqual(loadAiSession(AI_SESSION_SCOPES.SHOPPING, 'malformed'), []);
  storage.set('pratikshya_ai_shopping_session_malformed', JSON.stringify({
    version: 1,
    messages: [null, 42, { id: 'm-ok', role: 'assistant', text: 'Safe', productIds: [null, '', 'prod-gate5-1'] }],
  }));
  const malformedLoaded = loadAiSession(AI_SESSION_SCOPES.SHOPPING, 'malformed');
  assert.equal(malformedLoaded.length, 1);
  assert.deepEqual(malformedLoaded[0].productIds, ['prod-gate5-1']);

  clearAiSession(AI_SESSION_SCOPES.SHOPPING, 'guest');
  storage.clear();
  app.catalogStore.applyCatalogSnapshot({ products: [], categories: [], collections: [] });
});

test('Defect C: aiShoppingService updates keyword vocabularies and product lookups when catalogue data arrives or refreshes after module import', () => {
  const {
    CATEGORY_KEYWORDS,
    FABRIC_KEYWORDS,
    COLOUR_KEYWORDS,
    OCCASION_KEYWORDS,
    COLLECTION_KEYWORDS,
    resolveShoppingIntent,
    answerShoppingQuestion,
  } = app.aiShoppingService;

  /* 1. Start with an empty catalogue (simulating module import before hydration). */
  app.catalogStore.applyCatalogSnapshot({ products: [], categories: [], collections: [] });
  assert.equal(COLOUR_KEYWORDS.length, 0, 'empty catalogue should have zero product-derived colours');

  /* 2. Hydrate catalogue with attributes that only exist in runtime data. */
  app.catalogStore.applyCatalogSnapshot({
    products: [
      {
        id: 'prod-gate5-organza',
        name: 'Pratikshya Crimson Organza Saree',
        slug: 'crimson-organza-saree',
        department: 'women',
        category: 'sarees',
        subcategory: 'silk',
        style: 'Kanjeevaram',
        fabric: 'Organza',
        colors: ['Crimson'],
        occasion: ['Cocktail'],
        collection: 'Royal Heritage',
        collections: ['Royal Heritage'],
        price: 16500,
        availability: 'in-stock',
        stock: 4,
        status: 'PUBLISHED',
      },
    ],
    categories: [
      { id: 'sarees', name: 'Sarees', slug: 'sarees', status: 'ACTIVE' },
      { id: 'kaftans', name: 'Kaftans', slug: 'kaftans', department: 'women', status: 'ACTIVE' },
    ],
    collections: [
      { id: 'royal-heritage', name: 'Royal Heritage', slug: 'royal-heritage', status: 'ACTIVE' },
    ],
  });

  assert.ok(COLOUR_KEYWORDS.some((group) => group.id === 'Crimson'),
    'COLOUR_KEYWORDS did not update with hydrated product colour');
  assert.ok(FABRIC_KEYWORDS.some((group) => group.id === 'Organza'),
    'FABRIC_KEYWORDS did not update with hydrated product fabric');
  assert.ok(OCCASION_KEYWORDS.some((group) => group.id === 'Cocktail'),
    'OCCASION_KEYWORDS did not update with hydrated product occasion');
  assert.ok(COLLECTION_KEYWORDS.some((group) => group.id === 'Royal Heritage'),
    'COLLECTION_KEYWORDS did not update with hydrated collection');
  assert.ok(CATEGORY_KEYWORDS.some((group) => group.id === 'kaftans'),
    'CATEGORY_KEYWORDS did not include newly hydrated active category');

  const intent = resolveShoppingIntent('Show me crimson organza sarees for cocktail from Royal Heritage');
  assert.equal(intent.category?.id, 'sarees');
  assert.equal(intent.colour?.id, 'Crimson');
  assert.equal(intent.fabric?.id, 'Organza');
  assert.equal(intent.occasion?.id, 'Cocktail');
  assert.equal(intent.collection?.id, 'Royal Heritage');

  const answer = answerShoppingQuestion({
    question: 'Show me crimson organza sarees for cocktail',
    products: app.catalogStore.getAllProducts(),
  });
  assert.equal(answer.type, 'PRODUCT_RECOMMENDATIONS');
  assert.equal(answer.products.length, 1);
  assert.equal(answer.products[0].product.id, 'prod-gate5-organza');

  /* 3. Subsequent catalogue refresh updates vocabularies and lookups again. */
  app.catalogStore.applyCatalogSnapshot({
    products: [
      {
        id: 'prod-gate5-velvet',
        name: 'Pratikshya Sapphire Velvet Lehenga',
        slug: 'sapphire-velvet-lehenga',
        department: 'women',
        category: 'lehengas',
        subcategory: 'bridal',
        fabric: 'Velvet',
        colors: ['Sapphire'],
        occasion: ['Reception'],
        collection: 'Moonlight Edit',
        collections: ['Moonlight Edit'],
        price: 28000,
        availability: 'in-stock',
        stock: 2,
        status: 'PUBLISHED',
      },
    ],
    categories: [{ id: 'lehengas', name: 'Lehengas', slug: 'lehengas', status: 'ACTIVE' }],
    collections: [{ id: 'moonlight-edit', name: 'Moonlight Edit', slug: 'moonlight-edit', status: 'ACTIVE' }],
  });

  const refreshedIntent = resolveShoppingIntent('Show me sapphire velvet lehengas for reception');
  assert.equal(refreshedIntent.category?.id, 'lehengas');
  assert.equal(refreshedIntent.colour?.id, 'Sapphire');
  assert.equal(refreshedIntent.fabric?.id, 'Velvet');
  assert.equal(refreshedIntent.occasion?.id, 'Reception');

  app.catalogStore.applyCatalogSnapshot({ products: [], categories: [], collections: [] });
});
