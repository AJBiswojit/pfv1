# White blank screen in the preview panel — root cause and fix

**Status:** fixed and verified on the working tree. No production file was touched.
**Scope:** the dev-only preview harness (`vite.preview.config.js`, `preview.html`,
`src/components/storefront/preview/`). `npm run dev`, `npm run build`,
`vite.config.js`, `index.html`, `src/App.jsx` and every portal are unchanged.

Preview URL: **https://5173-idzjznx3prddkmwldi6wh.e2b.app/**
(`/` → full homepage · `/?view=hero` · `/?view=shell` · `/?view=home&data=fixture` · `/app` → the untouched application)

---

## 1. What was actually wrong

**Not the preview code.** The harness page had loaded with a **Vite dependency
optimizer hash that the dev server had already replaced**, so its imports could
not be fetched, the entry module never executed, and nothing mounted. A failed
module fetch in a dev server leaves **no error in the page and nothing in the
terminal** — which is exactly why every check I had made (HTTP 200 on every URL,
green suites, server-side rendering) both passed *and* was compatible with a
white page.

### The mechanism, reproduced

The harness entry imports React, React DOM and React Router from the optimizer's
hashed URLs:

```
import ... from "/node_modules/.vite/deps/react.js?v=<hash>"
import ... from "/node_modules/.vite/deps/react-dom_client.js?v=<hash>"
import ... from "/node_modules/.vite/deps/react-router-dom.js?v=<hash>"
```

Whenever the optimizer re-runs — a server restart, a config change (Vite
watches `vite.preview.config.js` and restarts itself in place), a newly
discovered dependency — it mints **new** hashes and answers **every previous
hash** with `504 Outdated Optimize Dep` (empty body, zero bytes, nothing logged):

```
/node_modules/.vite/deps/react.js?v=2eb8491e             200  1,024b      ← hash in use at the time
/node_modules/.vite/deps/react.js?v=b487133f             504  0b          ← "current" 10 minutes earlier
/node_modules/.vite/deps/react.js?v=deadbeef             504  0b
/node_modules/.vite/deps/react-dom_client.js?v=b487133f  504  0b
```

The dev server's own log shows the invalidation happening next to my restart:

```
4:38:29 PM [vite] (client) Re-optimizing dependencies because vite config has changed
5:00:35 PM [vite] vite.preview.config.js changed, restarting server...
5:00:35 PM [vite] (client) Re-optimizing dependencies because vite config has changed
5:00:35 PM [vite] server restarted.
```

…and the dependency cache was rewritten again at 17:02:58 with the running
server still up. There is no window in which this is safe: a page that loads
during or just before a re-optimization holds hashes that are about to be
rejected, and the harness had **nothing that recovers from a failed module
load** — it stayed white until a human reloaded it.

### Why the earlier evidence did not catch it

* A **fresh** load is always healthy (all URLs 200, whole graph loads) — the
  request-level checks were true and simply not the failing case.
* Server-side rendering renders every surface (it never touches the dep URLs).
* The first crawl walked the graph with the query strings stripped, so it
  requested the dep **files** (always 200) rather than the hashed **URLs** the
  browser asks for. The hashed-URL class is where the failure lives.
* Nothing about `DEFAULT_VIEW`, `PreviewViewSwitcher` or any surface import is
  involved: `/` really does serve the harness document, the entry really is
  `/src/components/storefront/preview/main.jsx`, and `#preview-root` is present.

## 2. The fix (three files, all preview-only)

| File | Change | Why |
|---|---|---|
| `frontend/preview.html` | The harness document now carries a small dev-only guard around the entry script | On a **module-load failure** it logs the diagnosis and reloads **once** with a fresh module graph (20s window recorded in `sessionStorage` — it cannot loop). If the graph **loaded but nothing mounted**, it says that is a code error and does **not** reload. If `#preview-root` is missing it says so. Nothing is swallowed: every branch writes to the console first. |
| `frontend/vite.preview.config.js` | `optimizeDeps.include` — the ten packages the graph uses, declared up front (exactly what Vite had already optimized; no version change) | Stops discovery-triggered re-optimization mid-review, so the hashes stay stable while a reviewer is looking. |
| `frontend/src/components/storefront/preview/__tests__/previewHarness.test.js` | New test (13th) that **executes** the guard against a stub document | Pins the behaviour: one reload on a stale module URL + the 504 diagnosis; no second reload inside the window; **no** reload (and a "code error" report) when the graph loaded but nothing mounted; silence when healthy. |

Nothing else changed: `main.jsx` (view dispatch, `DEFAULT_VIEW = "home"`),
`PreviewViewSwitcher.jsx`, the hero, shell and homepage surfaces, the fixtures,
the middleware and the production configuration are byte-identical to before
this fix.

## 3. Verification (kept separate, as requested)

### Routing and assets — HTTP facts

| Route | Document | Entry | Dependency URLs (the class that failed) | Module graph |
|---|---|---|---|---|
| `/` | 200 `text/html`, harness (`#preview-root`, no `#root`, `noindex`) | 200 `text/javascript` | 4/4 → 200 `text/javascript` | 146/147 × 200 |
| `/?view=hero` | 200, harness | 200 | 4/4 → 200 | 146/147 × 200 |
| `/?view=shell` | 200, harness | 200 | 4/4 → 200 | 146/147 × 200 |
| `/?view=home&data=fixture` | 200, harness | 200 | 4/4 → 200 | 146/147 × 200 |
| `/app` | 200, application (`#root`, no `preview-root`) | 200 (`/src/main.jsx`) | 3/3 → 200 | 249/250 × 200 |

The single non-200 everywhere is `/node_modules/.vite/deps/MyComponent` — a
**crawler artefact**: the string `import('./MyComponent')` appears inside a
framer-motion JSDoc example and inside a React error-message template, and the
crawler resolves it against the dep file. `MyComponent` exists nowhere in the
project source and the optimizer never listed it.

**Churn regression check** (the fix's whole point): the entry's emitted hashes
were recorded, the entire graph of all five routes was walked
(147 + 147 + 147 + 147 + 250 modules), then the hashes were read again —
**unchanged**, the optimizer's metadata was not rewritten, and all dependency
URLs still answered 200. The same sequence on the pre-fix server is what
produced the 504s above.

### Rendering evidence (execution, not status codes)

* Vite server-side render of the **real** surfaces inside `MemoryRouter`:
  `hero` 13,908 chars · `shell` 15,968 chars · `home` 85,437 chars — all three
  contain the switcher, none throws, and the counts are identical to the
  pre-fix render (so nothing regressed).
* The guard was **executed** (not read): 5 scenarios asserted in the suite.
* **No browser exists in this sandbox** (no Chromium/Chrome/Firefox, no
  Playwright/Puppeteer/jsdom, and `npx playwright` cannot install), so I could
  not open the page, could not read the reviewer's console, and **do not claim
  visual verification**. The client-side proof here is: the served entry is the
  real one, its whole graph and every dependency URL resolve 200 on a fresh
  load, `#preview-root` is present, the mount code is three lines with no
  conditional path that can silently skip rendering, and the one failure class
  that can blank the page is now diagnosed and self-healed.

### Test suites and build

| Check | Result |
|---|---|
| `previewHarness.test.js` | **13/13 pass** (12 before + the new guard test) |
| `storefrontShell.test.js` (2A) | **17/17 pass** |
| `homeSectionsRender.test.js` (2B) | **31/31 pass** |
| All `src/**/__tests__/*.test.js` (node loader) | **123/123 pass, 0 fail** |
| `npm test` (legacy `tests/*.test.js`) | 434 tests · **412 pass · 21 fail · 1 skipped** — *identical to the recorded baseline*, no new failure |
| `npm run build` | **EXIT 0**, `dist/index.html` 3,407.91 kB (gzip 1,312.07 kB); `dist` contains no `pf-sec`/`HomeSection`/`HomePreview`/`pf-shell`/`StorefrontHeader`/`preview-root` |
| `git diff --check` | clean |

## 4. What to do in the browser

Reload the preview once (**Ctrl/Cmd + Shift + R**) so the tab picks up the fixed
harness document. From then on the page repairs itself: if the dev server
re-optimizes its dependencies under a loaded tab, the guard logs the 504
diagnosis and reloads once instead of leaving a white page. A hard reload is
needed only for this first load, because the stale tab is still running the old
document.

Known interaction worth remembering: any process that boots a Vite server
against this project (a test run, another dev server) shares
`node_modules/.vite`, so the dependency hashes can change while the preview
server is up. The guard is what makes that harmless now.

## 5. Boundaries respected

No production routing, `App.jsx`, backend, database, authentication, RBAC,
Admin/Super-Admin/Employee portals, cart, checkout or order change; no Phase 2C;
no file deleted; no branch reset; nothing committed or pushed; no manifest,
lockfile, `vite.config.js`, `index.html` or `.env` edit; no dependency
installed or upgraded (the `optimizeDeps.include` list names packages already in
`package.json`, at their existing versions).
